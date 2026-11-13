/* audio.js: probe-04 audio glue (owner: B-audio, order 70).
 * Drives the shared score (prototypes/shared/score.js, spec docs/design/score-spec.md) from game state and events, and owns
 * the environment bed and the monster's static. Reads G only; writes nothing in G.
 *   state map: title -> explore (low; the leitmotif plays on bar 1) · start -> explore · monster.state 'search' -> tension
 *              monster.state 'hunt' with stage >= 4 -> hunt · player hidden -> hide · shift-start..shift-end -> castle
 *              ending -> spy (latched) · game-over -> silent
 *   stings:    yokai -> yokai · monster-reveal -> reveal · player-hurt -> caught · power-cut -> braam · shift-start -> shift
 *   capture:   #jump=audio-spy starts a private (possibly suspended) context, sets 'spy' and logs Score.getInfo().
 *
 * H16 (probe 04: "footsteps are badly sounded. the static sound for monster is too intense and constant. the low hum feels
 * like a audio bug"). Nothing here is constant and featureless:
 *   rain     = thousands of discrete synthesized drops (pre-rendered loop) + a thin sheet, level wandering with gusts;
 *              under a roof it becomes rain-on-the-roof (low-passed) plus leak drips; none in the castle or the train.
 *   wind     = scheduled gusts (rise, sweep, fall), a near-silent floor between them. No LFO-constant band.
 *   drips    = single gutter plinks at random intervals, panned.
 *   distant  = a rare low rumble swell (30-90 s apart) outdoors. The old constant 220 Hz noise floor is gone.
 *   lamp     = a 100 Hz-family fizz (high-passed at 300 Hz: no low fundamental) tied to the nearest lit 'buzz'/'dying'
 *              lamp within 8 m; level follows distance and the lamp's own flicker, panned to it.
 *   train    = ending only: rail-joint clacks paced by train speed + air rush that grows with speed.
 *   static   = the monster's threat (stage, distance, line of sight, hunt) -> Poisson bursts of crackle. Silent below
 *              threat 0.08; at threat 1 about 3.6 bursts/s, some long. Ducks the score (Score.setDuck) and the rain.
 * Loudness (wave 3, OfflineAudioContext 48 kHz in headless Chrome, real score.js + audio.js + the player.js footstep
 * section, BS.1770-4 K-weighted gated integrated loudness computed in JS; checked on a 997 Hz sine: -23.01 LUFS):
 *   explore outdoors + walking 60 s  -19.2 LUFS I, peak -2.8 dBFS   · indoor (izakaya) + walking 30 s  -20.2 LUFS
 *   hunt ramp (stage 2 far -> visible at 2 m) + run 36 s  -19.6 LUFS · spy ending 40 s  -16.2 LUFS, peak -2.3 dBFS
 *   footsteps alone, walk: -29 (asphalt, wood) to -33 (tatami, carpet) LUFS, peaks -10..-15 dBFS; run -25; crouch -41
 *   low band (<90 Hz, 0.5 s blocks) of the explore score: old drone p10/p50/p90 -27.9/-27.7/-27.5 dB (flat = the hum);
 *   now -45.7/-44.4/-36.5 (moves). Castle: old -24.8/-24.6/-24.4, now -44.5/-40.0/-29.6.
 *   Static bursts in a 36 s threat ramp: 0 in 0-12 s (stage 2 at 30 m), 1 in 12-18 s (stage 4 unseen at 12 m),
 *   7 / 18 / 19 in the last three 6 s windows as she closes and holds at 2 m. Static alone peaks -17 dBFS.
 *   True peak is approximated by cubic 4x interpolation, not a BS.1770 true-peak filter. Nobody has listened to this.
 */
(function () {
  'use strict';
  if (!window.G) return;
  const G = window.G;

  const A = {
    ctx: null, score: null, started: false, ending: false, endingT: 0, shifting: false, hidden: false, over: false,
    want: 'explore', cand: null, candT: 0, cur: null, kotoUntil: 0, amb: null, own: false,
    threat: 0, statNext: 0, gustNext: 0, dripNext: 0, rumbleNext: 0, clackNext: 0, wander: 1, wanderT: 0, lampT: 0, lamps: null, lampOn: null
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let rs = 0x2f6b9a1; const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
  const rr = (a, b) => a + (b - a) * rnd();
  const _v = window.THREE ? new window.THREE.Vector3() : null;

  /* ---------- buffers (built once, at audio start) ---------- */
  function buildBuffers(ctx) {
    const sr = ctx.sampleRate, B = {};
    const mk = (ch, sec) => ctx.createBuffer(ch, Math.floor(sr * sec), sr);
    // pink-ish sheet noise, decorrelated per channel, seamless
    B.pink = mk(2, 4);
    for (let ch = 0; ch < 2; ch++) {
      const d = B.pink.getChannelData(ch), len = d.length; let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) { const w = rnd() * 2 - 1; b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
      const f = Math.floor(sr * 0.05); for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[len - f + i] * (1 - k); }
    }
    // rain drops: 7 s stereo loop of discrete drops. Most are tiny ticks on wet ground; some are bubble plinks (a short
    // rising sine, the sound of a drop on water); a few are heavier splats. Amplitudes follow a power law.
    B.drops = mk(2, 7);
    for (let ch = 0; ch < 2; ch++) {
      const d = B.drops.getChannelData(ch), len = d.length, n = Math.floor(7 * 1100);
      for (let k = 0; k < n; k++) {
        const t0 = Math.floor(rnd() * len), a = Math.pow(rnd(), 3.2) * 0.9 + 0.02, kind = rnd();
        if (kind < 0.72) { // tick: a few samples of decaying noise
          const L = 12 + Math.floor(rnd() * 50), dec = L * 0.3; for (let i = 0; i < L; i++) d[(t0 + i) % len] += a * 0.6 * (rnd() * 2 - 1) * Math.exp(-i / dec);
        } else if (kind < 0.96) { // bubble plink
          const f0 = rr(1400, 4200), L = Math.floor(sr * rr(0.004, 0.012)), dec = L * 0.28; let ph = 0;
          for (let i = 0; i < L; i++) { const f = f0 * (1 + 0.9 * i / L); ph += 2 * Math.PI * f / sr; d[(t0 + i) % len] += a * 0.5 * Math.sin(ph) * Math.exp(-i / dec); }
        } else { // heavier splat
          const L = Math.floor(sr * rr(0.01, 0.025)), dec = L * 0.2; let lp = 0;
          for (let i = 0; i < L; i++) { lp += ((rnd() * 2 - 1) - lp) * 0.35; d[(t0 + i) % len] += a * 0.9 * lp * Math.exp(-i / dec); }
        }
      }
      let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i])); const s = 0.9 / (pk || 1); for (let i = 0; i < len; i++) d[i] *= s;
    }
    // static crackle: gated white noise in 3-40 ms chunks plus sharp impulses (pops), mono, 3 s
    B.crackle = mk(1, 3);
    { const d = B.crackle.getChannelData(0), len = d.length; let i = 0;
      while (i < len) { const L = Math.floor(sr * rr(0.003, 0.04)), on = rnd() < 0.55, a = on ? rr(0.25, 1) : rr(0, 0.06); for (let k = 0; k < L && i < len; k++, i++) d[i] = a * (rnd() * 2 - 1); }
      for (let k = 0; k < 3 * 260; k++) { const t0 = Math.floor(rnd() * (len - 40)), a = (rnd() < 0.5 ? -1 : 1) * rr(0.5, 1); for (let j = 0; j < 30; j++) d[t0 + j] += a * Math.exp(-j / 4) * (j % 2 ? -0.6 : 1); }
      let pk = 0; for (let j = 0; j < len; j++) pk = Math.max(pk, Math.abs(d[j])); for (let j = 0; j < len; j++) d[j] *= 0.95 / pk; }
    // lamp fizz: an exact 100 Hz period (ballast buzz, east-Japan 50 Hz mains), rich odd/even harmonics, with fizz noise
    B.buzz = mk(1, 1);
    { const d = B.buzz.getChannelData(0), len = d.length, T = Math.round(sr / 100), per = new Float32Array(T);
      for (let i = 0; i < T; i++) { const ph = i / T; let v = 0; for (let h = 2; h <= 24; h++) v += Math.sin(2 * Math.PI * h * ph + h * 1.3) / Math.pow(h, h % 2 ? 0.9 : 1.3); per[i] = v * 0.18; }
      for (let i = 0; i < len; i++) { const j = i % T; d[i] = per[j] + (rnd() * 2 - 1) * 0.05 * (j < T * 0.12 ? 1 : 0.2); } }
    return B;
  }

  /* ---------- environment bed ---------- */
  function buildAmbience(ctx, B) {
    const out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination);
    const src = (buf, off) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(ctx.currentTime, off || 0); return s; };
    const bq = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; };
    const gn = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    // rain: drops + a thin sheet -> roof filter (open outdoors, closed under a roof) -> rain gain
    const rain = gn(1), roof = bq('lowpass', 9000, 0.5), rainHP = bq('highpass', 120, 0.5);
    const drops = src(B.drops, 0), dropsG = gn(0.9); drops.connect(dropsG); dropsG.connect(rainHP);
    const sheet = src(B.pink, 1.3), sHP = bq('highpass', 500, 0.6), sLP = bq('lowpass', 5200, 0.6), sheetG = gn(0.22);
    sheet.connect(sHP); sHP.connect(sLP); sLP.connect(sheetG); sheetG.connect(rainHP);
    rainHP.connect(roof); roof.connect(rain); rain.connect(out);
    // wind: a band of noise opened by scheduled gusts
    const w = src(B.pink, 2.9), wbp = bq('bandpass', 420, 2.2), wind = gn(0.02); w.connect(wbp); wbp.connect(wind); wind.connect(out);
    // one-shot bus (drips, rumbles, train clacks) and the train rush
    const fx = gn(1); fx.connect(out);
    const rush = src(B.pink, 0.7), rLP = bq('lowpass', 300, 0.7), rushG = gn(0); rush.connect(rLP); rLP.connect(rushG); rushG.connect(out);
    // lamp fizz (its own path so ducking the bed does not hide it), panned
    const lz = src(B.buzz, 0), lzHP = bq('highpass', 300, 0.7), lzLP = bq('lowpass', 3500, 0.7), lzG = gn(0);
    let lzOut = lzG; if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); lzG.connect(p); lzOut = p; }
    lz.connect(lzHP); lzHP.connect(lzLP); lzLP.connect(lzG); lzOut.connect(ctx.destination);
    // monster static bus, panned toward her, straight to the output (not under the ambience duck)
    const stat = gn(1); let statPan = null; if (ctx.createStereoPanner) { statPan = ctx.createStereoPanner(); stat.connect(statPan); statPan.connect(ctx.destination); } else stat.connect(ctx.destination);
    return { out, rain, roof, sheetG, dropsG, wind, windF: wbp, fx, rushG, rushF: rLP, lzG, lzPan: lzOut !== lzG ? lzOut : null, stat, statPan, B, bq, gn };
  }

  // one-shots ----------------------------------------------------------------
  function drip(t, vol, muffled) {
    const c = A.ctx, a = A.amb, o = c.createOscillator(), g = c.createGain(), f = rr(900, 2600);
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * rr(1.4, 2.1), t + 0.03);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + rr(0.05, 0.11));
    let node = g; if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = rr(-0.8, 0.8); g.connect(p); node = p; }
    if (muffled) { const lp = a.bq('lowpass', 1800, 0.7); node.connect(lp); lp.connect(a.fx); } else node.connect(a.fx);
    o.connect(g); o.start(t); o.stop(t + 0.13);
  }
  function rumble(t, vol) {
    const c = A.ctx, a = A.amb, s = c.createBufferSource(); s.buffer = a.B.pink; const lp = a.bq('lowpass', 110, 1.2), g = c.createGain(), dur = rr(3, 6);
    lp.frequency.setValueAtTime(70, t); lp.frequency.linearRampToValueAtTime(rr(140, 220), t + dur * 0.4); lp.frequency.linearRampToValueAtTime(60, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.35); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(lp); lp.connect(g); g.connect(a.fx); s.start(t, rnd() * 3); s.stop(t + dur + 0.1);
  }
  function gust(t) {
    const a = A.amb, up = rr(1.8, 4), down = rr(3, 7), peak = rr(0.12, 0.3), f0 = rr(280, 420);
    a.wind.gain.cancelScheduledValues(t); a.wind.gain.setTargetAtTime(peak, t, up / 3); a.wind.gain.setTargetAtTime(0.02, t + up, down / 3);
    a.windF.frequency.cancelScheduledValues(t); a.windF.frequency.setTargetAtTime(f0 * rr(1.6, 2.4), t, up / 2.5); a.windF.frequency.setTargetAtTime(f0, t + up, down / 2.5);
    return up + down;
  }
  function clack(t, vol) { // rail joint: two wheelsets, each a bandpassed knock plus a low thud
    const c = A.ctx, a = A.amb;
    for (const dt of [0, 0.11]) {
      const s = c.createBufferSource(); s.buffer = a.B.crackle; const bp = a.bq('bandpass', rr(700, 1100), 1.5), g = c.createGain();
      g.gain.setValueAtTime(vol * 0.5, t + dt); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.05); s.connect(bp); bp.connect(g); g.connect(a.fx); s.start(t + dt, rnd() * 2.5); s.stop(t + dt + 0.07);
      const o = c.createOscillator(), og = c.createGain(); o.frequency.setValueAtTime(110, t + dt); o.frequency.exponentialRampToValueAtTime(55, t + dt + 0.06);
      og.gain.setValueAtTime(vol, t + dt); og.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.09); o.connect(og); og.connect(a.fx); o.start(t + dt); o.stop(t + dt + 0.1);
    }
  }
  function staticBurst(t, thr) { // one crackle burst; length and level grow with threat
    const c = A.ctx, a = A.amb, long = thr > 0.85 && rnd() < 0.22;
    const dur = long ? rr(0.35, 0.8) : 0.02 + rnd() * (0.05 + 0.3 * thr * thr), v = (0.07 + 0.4 * Math.pow(thr, 1.5)) * rr(0.45, 1);
    const s = c.createBufferSource(); s.buffer = a.B.crackle; const bp = a.bq('bandpass', rr(1300, 4800), rr(0.5, 1.3)), g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.003); if (long) g.gain.setValueAtTime(v * 0.7, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(bp); bp.connect(g); g.connect(a.stat); s.start(t, rnd() * 2.1); s.stop(t + dur + 0.02);
  }

  /* ---------- threat (drives static and the duck) ---------- */
  function threatNow() {
    const m = G.monster; if (!m || A.over || A.shifting || A.ending) return 0;
    const d = +m.distance; if (!isFinite(d) || d > 22 || m.present === false || (m.stage | 0) < 1) return 0;
    const prox = clamp(1 - (d - 2) / 18, 0, 1), stageK = m.stage >= 4 ? 1 : m.stage >= 3 ? 0.6 : 0.35;
    let thr = prox * prox * stageK * (m.visible ? 1 : 0.6);
    if (m.visible) thr += 0.1 + 0.2 * prox;
    if (m.state === 'hunt') thr += 0.15 * prox;
    return clamp(thr, 0, 1);
  }
  function roomAt() {
    try { const W = G.world, c = G.camera; if (!W || typeof W.indoor !== 'function' || !c || !_v) return null; c.getWorldPosition(_v); return W.indoor(_v.x, _v.z); } catch (e) { return null; }
  }
  function panTo(pos) {
    try { const c = G.camera; if (!c || !pos || !_v) return 0; _v.copy(pos); c.worldToLocal(_v); return clamp(_v.x / Math.max(1.5, Math.hypot(_v.x, _v.z)), -1, 1) * 0.8; } catch (e) { return 0; }
  }

  function updateAmbience(dt) {
    const a = A.amb; if (!a) return; const c = A.ctx, t = c.currentTime;
    const room = (A.ending || A.shifting) ? null : roomAt();
    const roofed = !!room && room !== 'arcade' && room !== 'platform';
    const outside = !A.ending && !A.shifting && !roofed && !A.hidden;
    // threat smoothing: rises in ~0.3 s, falls in ~1.2 s
    const thr = threatNow(); A.threat += (thr - A.threat) * (1 - Math.exp(-dt / (thr > A.threat ? 0.3 : 1.2)));
    // bed level: the hiss drops out near her (monster-design), wanders slowly with gusts
    A.wanderT -= dt; if (A.wanderT <= 0) { A.wanderT = rr(3, 8); A.wander = rr(0.75, 1.15); }
    let level = 0.2 * (1 - 0.75 * A.threat), rain = A.wander, roofF = 9000, sheet = 0.22;
    if (!A.started && !A.ending) level *= 0.8;
    if (room === 'arcade' || room === 'platform') { rain *= 0.8; roofF = 5500; }
    if (roofed) { rain *= 0.6; roofF = 650; sheet = 0.08; }   // rain on the roof above, heard through it
    if (A.hidden) { rain *= 0.5; roofF = 900; sheet = 0.06; }
    if (A.shifting || A.ending) rain = 0;                      // the castle has no weather; the train is sealed
    if (A.over) level = 0;
    a.out.gain.setTargetAtTime(level, t, 0.35); a.rain.gain.setTargetAtTime(rain, t, A.ending ? 0.8 : 0.5);
    a.roof.frequency.setTargetAtTime(roofF, t, 0.25); a.sheetG.gain.setTargetAtTime(sheet, t, 0.5);
    // scheduled life: gusts, drips, distant rumbles
    if (t >= A.gustNext) { A.gustNext = t + (outside ? gust(t) + rr(4, 14) : rr(3, 6)); if (!outside) a.wind.gain.setTargetAtTime(roofed ? 0.008 : 0.015, t, 1); }
    if (t >= A.dripNext) { A.dripNext = t + (roofed ? rr(1.5, 6) : rr(0.3, 2.2)); if (rain > 0.05 && !A.over) drip(t + 0.02, (roofed ? 0.35 : 0.22) * rr(0.4, 1), roofed); }
    if (t >= A.rumbleNext) { A.rumbleNext = t + rr(30, 90); if (outside && A.started) rumble(t + 0.05, 0.5); }
    // the train: rush grows with speed, rail joints clack at a pace set by speed (car length 25 m)
    if (A.ending) {
      const sp = clamp((G.time - A.endingT) / 25, 0, 1) * 28 + 2, k = sp / 30;
      a.rushG.gain.setTargetAtTime(0.5 * k + 0.05, t, 0.5); a.rushF.frequency.setTargetAtTime(220 + 900 * k, t, 0.5);
      if (t >= A.clackNext) { const per = clamp(25 / sp, 0.55, 4); A.clackNext = t + per * rr(0.97, 1.03); clack(t + 0.02, 0.25 + 0.25 * k); }
    } else a.rushG.gain.setTargetAtTime(0, t, 0.5);
    updateLamp(dt, t);
    updateStatic(t);
  }

  function updateLamp(dt, t) {
    const a = A.amb; A.lampT -= dt;
    if (A.lampT <= 0) { // re-pick the nearest lit buzzing lamp 4 times a second
      A.lampT = 0.25; A.lampOn = null;
      try {
        const W = G.world, c = G.camera; if (!A.lamps && W && Array.isArray(W.lights)) A.lamps = W.lights.filter(e => e && e.pos && (e.pattern === 'buzz' || e.pattern === 'dying'));
        if (A.lamps && c && _v && !A.shifting && !A.ending) { c.getWorldPosition(_v); let best = 8;
          for (const e of A.lamps) { const d = e.pos.distanceTo(_v); if (d < best && e.level > 0.05) { best = d; A.lampOn = e; A.lampD = d; } } }
      } catch (e) { A.lampOn = null; }
    }
    let v = 0, pan = 0; const e = A.lampOn;
    if (e && !A.over) {
      const lit = e.light && e.base ? clamp(e.light.intensity / e.base, 0, 1.2) : e.level; // follows the lamp's own flicker
      const k = 1 - A.lampD / 8; v = 0.05 * k * k * lit; pan = panTo(e.pos);
    }
    a.lzG.gain.setTargetAtTime(v, t, 0.03); if (a.lzPan) a.lzPan.pan.setTargetAtTime(pan, t, 0.1);
  }

  function updateStatic(t) {
    const a = A.amb, thr = A.threat;
    if (a.statPan && G.monster && G.monster.pos) a.statPan.pan.setTargetAtTime(panTo(G.monster.pos), t, 0.1);
    if (A.score && A.score.setDuck) A.score.setDuck(clamp(thr * 0.9, 0, 0.8));
    if (thr < 0.08) { A.statNext = Math.max(A.statNext, t); return; }   // silent at low threat
    if (t >= A.statNext) {
      staticBurst(t + 0.01, thr * (A.hidden ? 0.75 : 1));
      const rate = 0.15 + 3.5 * thr * thr; A.statNext = t + Math.max(0.07, -Math.log(1 - rnd() * 0.999) / rate);
    }
  }

  /* ---------- score ---------- */
  function startAudio(ctx, own) {
    if (A.ctx || !ctx) return;
    const Sc = G.score || window.Score; if (!Sc) { console.warn('[audio] Score missing; ambience only'); }
    A.ctx = ctx; A.own = !!own; A.score = Sc || null;
    if (A.score) { A.score.init(ctx, ctx.destination); A.score.setIntensity(0.18); A.score.setState('explore'); A.cur = 'explore'; }
    try { const B = buildBuffers(ctx); A.amb = buildAmbience(ctx, B); const t = ctx.currentTime; A.gustNext = t + 2; A.dripNext = t + 1; A.rumbleNext = t + rr(15, 40); }
    catch (e) { console.warn('[audio] ambience failed', e); A.amb = null; }
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
    try { updateAmbience(dt); } catch (e) { console.warn('[audio] ambience update', e); A.amb = null; }
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
          if (A.score) console.log('[audio] audio-spy Score.getInfo ' + JSON.stringify(A.score.getInfo()) + ' ctx=' + (A.ctx ? A.ctx.state : 'none') + ' threat=' + A.threat.toFixed(2));
          if (++n >= 3) clearInterval(iv);
        }, 1500);
      }
    },
    update(dt) { update(dt); }
  });
})();
