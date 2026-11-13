/* audio.js: probe-04 audio glue (owner: B-audio, order 70).
 * Drives the shared score (prototypes/shared/score.js, spec docs/design/score-spec.md) from game state and events, and adds a
 * procedural rain/wind ambience bed that ducks near the monster. Reads G only; writes nothing in G except through G.on.
 *   state map: title -> explore (low; the leitmotif plays on bar 1) · start -> explore · monster.state 'search' -> tension
 *              monster.state 'hunt' with stage >= 4 -> hunt · player hidden -> hide · shift-start..shift-end -> castle
 *              ending -> spy (latched) · game-over -> silent
 *   stings:    yokai -> yokai · monster-reveal -> reveal · player-hurt -> caught · power-cut -> braam · shift-start -> shift
 *   capture:   #jump=audio-spy starts a private (possibly suspended) context, sets 'spy' and logs Score.getInfo().
 */
(function () {
  'use strict';
  if (!window.G) return;
  const G = window.G;

  const A = {
    ctx: null, score: null, started: false, ending: false, endingT: 0, shifting: false, hidden: false, over: false,
    want: 'explore', cand: null, candT: 0, cur: null, kotoUntil: 0, amb: null, own: false
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- ambience: rain (hiss + drops band), low patter, wind (swept band) ---------- */
  function buildAmbience(ctx) {
    const sr = ctx.sampleRate, len = sr * 4;
    const nb = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) { // pinkish noise (Voss-like 3-pole), decorrelated per channel for width
      const d = nb.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0, s = 12345 + ch * 777;
      for (let i = 0; i < len; i++) { s = (s * 1103515245 + 12345) >>> 0; const w = (s / 4294967296) * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
      const f = Math.floor(sr * 0.05); for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[len - f + i] * (1 - k); } // seamless loop
    }
    const src = (off) => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.start(ctx.currentTime, off); return s; };
    const out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination);
    // rain hiss
    const r = src(0), rhp = ctx.createBiquadFilter(), rlp = ctx.createBiquadFilter(), rg = ctx.createGain();
    rhp.type = 'highpass'; rhp.frequency.value = 900; rlp.type = 'lowpass'; rlp.frequency.value = 7500; rg.gain.value = 0.55;
    r.connect(rhp); rhp.connect(rlp); rlp.connect(rg); rg.connect(out);
    // patter on roofs and gutters (mid band, slow random-ish wobble from two detuned LFOs)
    const p = src(1.3), pbp = ctx.createBiquadFilter(), pg = ctx.createGain();
    pbp.type = 'bandpass'; pbp.frequency.value = 2200; pbp.Q.value = 0.9; pg.gain.value = 0.35;
    for (const [hz, dep] of [[0.13, 0.12], [0.31, 0.08]]) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = hz; lg.gain.value = dep; l.connect(lg); lg.connect(pg.gain); l.start(); }
    p.connect(pbp); pbp.connect(pg); pg.connect(out);
    // low rumble (distant water, the town's body)
    const lo = src(2.1), llp = ctx.createBiquadFilter(), lgn = ctx.createGain();
    llp.type = 'lowpass'; llp.frequency.value = 220; lgn.gain.value = 0.5; lo.connect(llp); llp.connect(lgn); lgn.connect(out);
    // wind: a resonant band swept slowly between 300 and 900 Hz
    const w = src(2.9), wbp = ctx.createBiquadFilter(), wg = ctx.createGain();
    wbp.type = 'bandpass'; wbp.frequency.value = 520; wbp.Q.value = 3.5; wg.gain.value = 0.22;
    const wl = ctx.createOscillator(), wlg = ctx.createGain(); wl.frequency.value = 0.07; wlg.gain.value = 260; wl.connect(wlg); wlg.connect(wbp.frequency); wl.start();
    const wl2 = ctx.createOscillator(), wl2g = ctx.createGain(); wl2.frequency.value = 0.045; wl2g.gain.value = 0.12; wl2.connect(wl2g); wl2g.connect(wg.gain); wl2.start();
    w.connect(wbp); wbp.connect(wg); wg.connect(out);
    return { out, rain: rg, patter: pg, low: lgn, wind: wg, windF: wbp, rainLP: rlp };
  }

  function updateAmbience(dt) {
    const a = A.amb; if (!a) return; const t = A.ctx.currentTime, m = G.monster || {};
    // the hiss drops out near her (monster-design: "the town's rain hiss drops out near her")
    const near = (m.visible || m.state === 'hunt' || m.state === 'search' || m.state === 'stalk') && isFinite(m.distance) ? clamp((m.distance - 4) / 14, 0, 1) : 1;
    let level = 0.16 * (0.12 + 0.88 * near), wind = 0.22, rain = 0.55, low = 0.5, wf = 520, lp = 7500;
    if (!A.started && !A.ending) level *= 0.8;
    if (A.hidden) { rain = 0.3; lp = 2400; }            // muffled inside a hiding place
    if (A.shifting) level *= 0.15;                      // the castle has no weather
    if (A.ending) { rain = 0.12; wind = 0.6; low = 0.9; wf = 380; lp = 4000; level = 0.12; } // the train: rush of air and body rumble
    if (A.over) level = 0;
    a.out.gain.setTargetAtTime(level, t, 0.35); a.rain.gain.setTargetAtTime(rain, t, 0.5); a.wind.gain.setTargetAtTime(wind, t, 0.8);
    a.low.gain.setTargetAtTime(low, t, 0.8); a.windF.frequency.setTargetAtTime(wf, t, 1.5); a.rainLP.frequency.setTargetAtTime(lp, t, 0.3);
  }

  /* ---------- score ---------- */
  function startAudio(ctx, own) {
    if (A.ctx || !ctx) return;
    const Sc = G.score || window.Score; if (!Sc) { console.warn('[audio] Score missing; ambience only'); }
    A.ctx = ctx; A.own = !!own; A.score = Sc || null;
    if (A.score) { A.score.init(ctx, ctx.destination); A.score.setIntensity(0.18); A.score.setState('explore'); A.cur = 'explore'; }
    try { A.amb = buildAmbience(ctx); } catch (e) { console.warn('[audio] ambience failed', e); A.amb = null; }
  }

  function desiredState() {
    const m = G.monster || {}, p = G.player || {};
    if (A.over) return 'silent';
    if (A.ending) return 'spy';
    if (A.shifting) return 'castle';
    if (A.hidden || p.hidden) return 'hide';
    if (m.state === 'hunt' && (m.stage | 0) >= 4) return 'hunt';
    if (m.state === 'search' || m.state === 'hunt') return 'tension';
    return 'explore';
  }
  function intensityFor(state) {
    const f = clamp(+G.fear || 0, 0, 1);
    if (!A.started && !A.ending) return 0.18;            // title: quiet explore, leitmotif on bar 1
    switch (state) {
      case 'spy': return clamp(0.45 + (G.time - A.endingT) / 30 * 0.55, 0.45, 1); // the train gathers speed: leitmotif from ~8 s
      case 'hunt': return 0.5 + 0.5 * f;
      case 'tension': return 0.3 + 0.6 * f;
      case 'hide': return 0.8 * f;
      case 'castle': return 0.4 + 0.4 * f;
      default: return 0.2 + 0.7 * f;
    }
  }

  function update(dt) {
    if (!A.ctx && G.audioCtx) startAudio(G.audioCtx, false);
    if (!A.ctx) return;
    const Sc = A.score;
    if (Sc) {
      const want = desiredState();
      // immediate for danger and scripted beats; 0.8 s of agreement for the rest, so states do not flap
      const urgent = want === 'hunt' || want === 'hide' || want === 'castle' || want === 'spy' || want === 'silent';
      if (want !== A.cur) {
        if (A.cand !== want) { A.cand = want; A.candT = 0; } else A.candT += dt;
        if (urgent || A.candT > 0.8) { Sc.setState(want); A.cur = want; A.cand = null; }
      } else A.cand = null;
      Sc.setIntensity(intensityFor(A.cur));
      // koto ownership: the world shift's own koto, or the monster within 15 m (level plan: "koto stops"), mute the score's koto
      const m = G.monster || {}, close = m.visible && isFinite(m.distance) && m.distance < 15 && !A.ending;
      Sc.setLayer && Sc.setLayer('koto', G.time < A.kotoUntil ? 0.12 : close ? 0.1 : 1);
      Sc.update();
    }
    updateAmbience(dt);
  }

  function sting(n) { if (A.score && A.ctx) A.score.sting(n); }

  G.register('audio', {
    order: 70,
    init(G) {
      G.on('audio-ready', ctx => startAudio(ctx || G.audioCtx, false));
      G.on('start', () => { A.started = true; });
      G.on('player-hide', () => { A.hidden = true; });
      G.on('player-unhide', () => { A.hidden = false; });
      G.on('shift-start', () => { A.shifting = true; sting('shift'); });
      G.on('shift-end', () => { A.shifting = false; A.kotoUntil = 0; });
      G.on('ending', () => { if (!A.ending) { A.ending = true; A.endingT = G.time; A.shifting = false; A.hidden = false; } });
      G.on('game-over', () => { A.over = true; });
      G.on('yokai', () => sting('yokai'));
      G.on('monster-reveal', () => sting('reveal'));
      G.on('player-hurt', () => sting('caught'));
      G.on('power-cut', () => sting('braam'));
      G.on('koto', () => { A.kotoUntil = G.time + 2.5; }); // the castle's koto is playing: no double koto
      if (G.audioCtx) startAudio(G.audioCtx, false);
      if (G.jump === 'audio-spy') {
        A.started = true; A.ending = true; A.endingT = G.time - 30; // full intensity
        if (!G.audioCtx) { const C = window.AudioContext || window.webkitAudioContext; if (C) { try { startAudio(new C(), true); } catch (e) { console.warn('[audio] capture context failed', e); } } }
        let n = 0; const iv = setInterval(() => {
          if (A.score) console.log('[audio] audio-spy Score.getInfo ' + JSON.stringify(A.score.getInfo()) + ' ctx=' + (A.ctx ? A.ctx.state : 'none'));
          if (++n >= 3) clearInterval(iv);
        }, 1500);
      }
    },
    update(dt) { update(dt); }
  });
})();
