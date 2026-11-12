/* score.js: mission-1 procedural score (MUSIC-01). Spec: docs/design/score-spec.md
   WebAudio synthesis only. One clock, one key (D), one harmonic plan shared by all instruments.
   API: Score.init(ctx, dest) · setState(name) · setIntensity(0..1) · sting(name) · update([now]) · getInfo() · stop() */
(function () {
  'use strict';

  /* ---------- harmony ---------- */
  const PCN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const PHRYG = [2, 3, 5, 7, 9, 10, 0];          // D Phrygian
  const AEOL = [2, 4, 5, 7, 9, 10, 0];           // D Aeolian (escape)
  const MIYAKO = [2, 3, 7, 9, 10];               // D miyako-bushi (koto), subset of PHRYG
  // t = chord pitch classes (root first), b = bass pc override (pedal)
  const CH = {
    'Dm': { t: [2, 5, 9] }, 'Bb': { t: [10, 2, 5] }, 'Gm': { t: [7, 10, 2] }, 'Eb': { t: [3, 7, 10] },
    'F': { t: [5, 9, 0] }, 'C': { t: [0, 4, 7] },
    'Eb/D': { t: [3, 7, 10], b: 2 }, 'Gm/D': { t: [7, 10, 2], b: 2 }, 'Bbm/D': { t: [10, 1, 5], b: 2 }, 'Dm/D': { t: [2, 5, 9], b: 2 }
  };
  const STATES = {
    explore: { bpm: 72, prog: [['Dm', 2], ['Bb', 2], ['Gm', 2], ['Eb', 2]], scale: PHRYG, koto: MIYAKO, pad: 'legato', pedal: false, floor: 0 },
    tension: { bpm: 72, prog: [['Dm/D', 1], ['Eb/D', 1], ['Dm/D', 1], ['Eb/D', 1], ['Gm/D', 1], ['Eb/D', 1], ['Dm/D', 2]], scale: PHRYG, koto: MIYAKO, pad: 'legato', pedal: true, floor: 0.2 },
    hunt: { bpm: 144, prog: [['Dm', 1], ['Bb', 1], ['Gm', 1], ['Eb', 1]], scale: PHRYG, koto: MIYAKO, pad: 'trem', pedal: false, floor: 0.5, quant: 'beat' },
    hide: { bpm: 72, prog: [['Dm/D', 2], ['Eb/D', 1], ['Dm/D', 1]], scale: PHRYG, koto: MIYAKO, pad: 'harm', pedal: true, floor: 0 },
    castle: { bpm: 48, prog: [['Dm/D', 1], ['Bbm/D', 1], ['Eb/D', 1], ['Dm/D', 1]], scale: PHRYG, koto: MIYAKO, pad: 'legato', pedal: true, floor: 0.3 },
    escape: { bpm: 144, prog: [['Dm', 1], ['Bb', 1], ['F', 1], ['C', 1]], scale: AEOL, koto: null, pad: 'legato', pedal: false, floor: 0.6 },
    silent: { bpm: 72, prog: [['Dm/D', 4]], scale: PHRYG, koto: MIYAKO, pad: 'none', pedal: true, floor: 0 }
  };
  // Leitmotif "Kage": [beatOffset, midi, durBeats, bendSemis(optional, from grace)] over Dm Dm Bb Bb (4/4)
  const LEIT = [[0, 69, 1], [1, 74, 1], [2, 74, 2, -1], [4, 69, 3], [8, 74, 1], [9, 70, 1], [10, 69, .5], [10.5, 70, 2.5]];
  // Escape (Aeolian) version over Dm Bb F C, one chord per bar
  const LEIT_ESC = [[0, 69, 1], [1, 74, 1], [2, 76, 1], [3, 74, 1], [4, 74, 4], [8, 72, 2], [10, 69, 2], [12, 67, 4]];
  // Retrograde of LEIT for the castle (beat positions mirrored inside 12 beats)
  const LEIT_RETRO = LEIT.map(([b, m, d]) => [13 - b - d, m, d]).sort((a, b) => a[0] - b[0]);
  const THREAT = [[0, 0, .5], [.5, 7, .5], [1, 1, 2]];   // D, A, Eb (semitones above a D)

  /* ---------- engine state ---------- */
  let ctx = null, S = null;
  function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const nowT = () => (S && S.vnow != null ? S.vnow : ctx.currentTime);
  function osc(type, f) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  function gain(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function filt(type, f, q) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; }
  function log(inst, t, m) { if (S.debug) S.notes.push({ inst, t: +t.toFixed(3), m, pc: ((m % 12) + 12) % 12, chord: S.chordName, state: S.state }); }

  function bus(name, vol, wet) { const g = gain(vol); g.connect(S.mix); if (wet) { const s = gain(wet); g.connect(s); s.connect(S.rev); } S.bus[name] = g; return g; }

  function init(audioCtx, dest) {
    if (S && S.ctx === audioCtx) return Score;
    if (S && S.trim) { try { S.running = false; S.trim.disconnect(); } catch (e) { /* old graph already gone */ } } // re-init on a new context silences the old graph
    ctx = audioCtx;
    S = { ctx, bus: {}, rnd: seeded(1337), notes: [], events: [], debug: false, vnow: null, voices: [], ks: {} };
    const sr = ctx.sampleRate;
    // master: mix -> limiter -> trim(-1.5 dB) -> dest
    S.mix = gain(0.5);
    S.lim = ctx.createDynamicsCompressor(); S.lim.threshold.value = -6; S.lim.knee.value = 0; S.lim.ratio.value = 20; S.lim.attack.value = 0.002; S.lim.release.value = 0.15;
    S.trim = gain(Math.pow(10, -1.5 / 20));
    S.mix.connect(S.lim); S.lim.connect(S.trim); S.trim.connect(dest || ctx.destination);
    // reverb (seeded, deterministic), 3.8 s hall
    S.rev = ctx.createConvolver(); const len = Math.floor(sr * 3.8), ir = ctx.createBuffer(2, len, sr), r = seeded(7);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, 2.6) * (i < sr * .02 ? i / (sr * .02) : 1); }
    S.rev.buffer = ir; const rg = gain(0.32); S.rev.connect(rg); rg.connect(S.mix);
    S.noise = ctx.createBuffer(1, sr * 2, sr); { const nd = S.noise.getChannelData(0), rn = seeded(3); for (let i = 0; i < nd.length; i++) nd[i] = rn() * 2 - 1; }
    // buses
    S.padF = filt('lowpass', 900, 0.5); S.padF.connect(bus('pad', 0.0, 0.6)); S.padIn = S.padF;
    bus('bass', 0.55, 0.25); bus('koto', 0.8, 0.55); bus('spicc', 0.5, 0.3); bus('perc', 0.9, 0.12); bus('fx', 0.7, 0.6); bus('drone', 0.0, 0.3);
    // the drone that never stops: D1 + D2, filtered
    const dl = filt('lowpass', 260, 0.7); dl.connect(S.bus.drone);
    [[mtof(26), 'sine', .5], [mtof(38), 'sawtooth', .18], [mtof(38) * 1.003, 'sawtooth', .18], [mtof(50), 'triangle', .08]].forEach(([f, ty, v]) => { const o = osc(ty, f), g = gain(v); o.connect(g); g.connect(dl); o.start(); });
    // castle hum, tuned to D (Backrooms fluorescent hum, but in key)
    S.hum = gain(0); const hl = filt('lowpass', 900, 1); hl.connect(S.hum); S.hum.connect(S.bus.fx);
    [[mtof(38) * 2, 'sawtooth', .4], [mtof(38) * 4, 'square', .05], [mtof(38) * 2 * 1.006, 'sawtooth', .3]].forEach(([f, ty, v]) => { const o = osc(ty, f), g = gain(v); o.connect(g); g.connect(hl); o.start(); });
    // transport
    Object.assign(S, { state: 'silent', pending: null, stings: [], I: 0, Itarget: 0, lastUpd: null, running: true,
      next: ctx.currentTime + 0.1, beat: 0, bar: 0, step: 0, barInChord: 0, cycle: 0, chordName: 'Dm/D', voicing: [57, 62, 65], lastBass: 38 });
    applyMix(ctx.currentTime, true);
    return Score;
  }

  /* ---------- instruments ---------- */
  function padVoice(m, t, dur, vol, style, spb) {
    const env = gain(0), lp = filt('lowpass', style === 'harm' ? 5000 : 2400, 0.3);
    const atk = Math.min(style === 'trem' ? 0.08 : 1.2, dur * 0.3), rel = style === 'trem' ? 0.25 : 0.9;
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(vol, t + atk); env.gain.setValueAtTime(vol, t + dur); env.gain.linearRampToValueAtTime(0, t + dur + rel);
    let into = lp; const end = t + dur + rel + 0.05, nodes = [];
    if (style === 'trem') { const tg = gain(0.55), lfo = osc('sine', 4 / spb), lg = gain(0.45); lfo.connect(lg); lg.connect(tg.gain); lp.connect(tg); tg.connect(env); lfo.start(t); lfo.stop(end); nodes.push(lfo); }
    else lp.connect(env);
    env.connect(S.padIn);
    if (style === 'harm') { const o = osc('sine', mtof(m)); o.connect(lp); o.start(t); o.stop(end); nodes.push(o); }
    else {
      const vib = osc('sine', 4.6 + S.rnd()), vg = gain(mtof(m) * 0.0025); vib.connect(vg); vib.start(t); vib.stop(end); nodes.push(vib);
      for (const dc of [-7, 6]) { const o = osc('sawtooth', mtof(m) * Math.pow(2, dc / 1200)); vg.connect(o.frequency); o.connect(lp); o.start(t); o.stop(end); nodes.push(o); }
    }
    S.voices.push({ env, nodes, end });
    log('pad', t, m);
  }
  function bassVoice(m, t, dur, vol) {
    const env = gain(0), lp = filt('lowpass', 420, 0.6);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(vol, t + Math.min(0.5, dur * .3)); env.gain.setValueAtTime(vol, t + dur); env.gain.linearRampToValueAtTime(0, t + dur + 0.6);
    const end = t + dur + 0.7, nodes = [];
    for (const [k, dc] of [[1, -5], [1, 5], [0.5, 0]]) { const o = osc('sawtooth', mtof(m) * k * Math.pow(2, dc / 1200)); o.connect(lp); o.start(t); o.stop(end); nodes.push(o); }
    lp.connect(env); env.connect(S.bus.bass); S.voices.push({ env, nodes, end }); log('bass', t, m);
  }
  function spicc(m, t, v) {
    const g = gain(0), lp = filt('lowpass', 1400); lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(280, t + .12);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + .17);
    for (const dc of [-6, 6]) { const o = osc('sawtooth', mtof(m) * Math.pow(2, dc / 1200)); o.connect(lp); o.start(t); o.stop(t + .2); }
    lp.connect(g); g.connect(S.bus.spicc); log('spicc', t, m);
  }
  function ksBuffer(m) { // Karplus-Strong at an integer period; tuned exactly later via playbackRate
    if (S.ks[m]) return S.ks[m];
    const sr = ctx.sampleRate, f = mtof(m), N = Math.max(2, Math.round(sr / f)), len = Math.floor(sr * 3.4), b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0), buf = new Float32Array(N), r = seeded(m * 97 + 11);
    for (let i = 0; i < N; i++) buf[i] = (r() * 2 - 1) * (i < N * 0.3 ? 1 : 0.5);
    const damp = m > 80 ? 0.4965 : 0.4986; let ix = 0;
    for (let i = 0; i < len; i++) { const nx = (ix + 1) % N, v = buf[ix]; d[i] = v; buf[ix] = damp * (v + buf[nx]); ix = nx; }
    return (S.ks[m] = { b, rate: f * N / sr });
  }
  function koto(m, t, v, bend, bendAt) { // bend: semitones; positive = press up after pluck (oshi), negative = start high and release down
    const k = ksBuffer(m), src = ctx.createBufferSource(); src.buffer = k.b;
    const g = gain(v), hp = filt('highpass', 140), pk = filt('peaking', 2600, 1.5); pk.gain.value = 4;
    const r0 = k.rate;
    if (bend && bend < 0) { src.playbackRate.setValueAtTime(r0 * Math.pow(2, -bend / 12), t); src.playbackRate.setValueAtTime(r0 * Math.pow(2, -bend / 12), t + (bendAt || .12)); src.playbackRate.linearRampToValueAtTime(r0, t + (bendAt || .12) + .22); }
    else { src.playbackRate.setValueAtTime(r0, t); if (bend) { src.playbackRate.setValueAtTime(r0, t + (bendAt || .3)); src.playbackRate.linearRampToValueAtTime(r0 * Math.pow(2, bend / 12), t + (bendAt || .3) + .25); } }
    src.connect(hp); hp.connect(pk); pk.connect(g); g.connect(S.bus.koto); src.start(t); src.stop(t + 3.3);
    if (bend && bend < 0) log('koto-grace', t, m - bend); // the grace (upper neighbour) before the release
    log('koto', t, m); if (bend && bend > 0) log('koto-bend', t + (bendAt || .3), m + bend);
  }
  function braam(m, t, v) {
    const g = gain(0), lp = filt('lowpass', 140, 5);
    lp.frequency.setValueAtTime(140, t); lp.frequency.linearRampToValueAtTime(1300, t + .4); lp.frequency.exponentialRampToValueAtTime(180, t + 3.2);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .06); g.gain.exponentialRampToValueAtTime(.0001, t + 4);
    const f = mtof(m); for (const k of [1, 1.004, .5, 1.4983, 2.003]) { const o = osc('sawtooth', f * k); o.connect(lp); o.start(t); o.stop(t + 4.1); }
    lp.connect(g); g.connect(S.bus.fx); log('braam', t, m);
  }
  function thump(t, v, low) {
    for (const [dt, k] of (low ? [[0, 1]] : [[0, 1], [.18, .6]])) {
      const o = osc('sine', 60), g = gain(0); o.frequency.setValueAtTime(low ? 90 : 72, t + dt); o.frequency.exponentialRampToValueAtTime(low ? 38 : 42, t + dt + .16);
      g.gain.setValueAtTime(v * k, t + dt); g.gain.exponentialRampToValueAtTime(.0001, t + dt + (low ? .45 : .22)); o.connect(g); g.connect(S.bus.perc); o.start(t + dt); o.stop(t + dt + .5);
    }
  }
  function noiseHit(t, dur, f0, f1, v, q) {
    const n = ctx.createBufferSource(); n.buffer = S.noise; n.loop = true; const bp = filt('bandpass', f0, q || 2), g = gain(0);
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur * .85); g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(bp); bp.connect(g); g.connect(S.bus.fx); n.start(t); n.stop(t + dur + .05);
  }
  function cluster(ms, t, dur, v) { for (const m of ms) { const g = gain(0), lp = filt('lowpass', 1800); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur * .6); g.gain.linearRampToValueAtTime(0, t + dur);
    for (const dc of [-9, 9]) { const o = osc('sawtooth', mtof(m) * Math.pow(2, dc / 1200)); o.connect(lp); o.start(t); o.stop(t + dur + .05); } lp.connect(g); g.connect(S.bus.fx); log('cluster', t, m); } }

  /* ---------- harmony helpers ---------- */
  function nearest(pc, ref, lo, hi) { let best = null; for (let m = lo; m <= hi; m++) if (((m % 12) + 12) % 12 === pc && (best === null || Math.abs(m - ref) < Math.abs(best - ref))) best = m; return best; }
  function voiceLead(pcs) {
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]; let best = null, bc = 1e9;
    for (const p of perms) { const v = S.voicing.map((ref, i) => nearest(pcs[p[i]], ref, 50, 74)); const c = v.reduce((a, m, i) => a + Math.abs(m - S.voicing[i]), 0) + (new Set(v).size < 3 ? 99 : 0); if (c < bc) { bc = c; best = v; } }
    S.voicing = best.slice().sort((a, b) => a - b); return S.voicing;
  }
  function chord() { return CH[S.chordName]; }
  function kotoTones(lo, hi) { const st = STATES[S.state], c = chord(), out = []; for (let m = lo; m <= hi; m++) { const pc = m % 12; if (c.t.includes(pc) && (!st.koto || st.koto.includes(pc))) out.push(m); } return out.length ? out : [nearest(2, 74, lo, hi)]; }
  const pick = arr => arr[Math.floor(S.rnd() * arr.length)];

  /* ---------- mix per state / intensity ---------- */
  function effI() { return Math.max(S.I, STATES[S.state].floor); }
  function applyMix(t, hard) {
    const st = STATES[S.state], I = effI(), tc = hard ? 0.01 : 0.4;
    const padV = st.pad === 'none' ? 0 : st.pad === 'harm' ? 0.35 : 0.42 + 0.5 * I;
    S.bus.pad.gain.setTargetAtTime(padV, t, tc);
    S.padF.frequency.setTargetAtTime(st.pad === 'harm' ? 6000 : 700 + 2600 * I * I, t, tc);
    S.bus.drone.gain.setTargetAtTime(S.state === 'escape' ? 0.12 : 0.32 + 0.15 * (st.pedal ? 1 : 0), t, tc);
    S.hum.gain.setTargetAtTime(S.state === 'castle' ? 0.05 : 0, t, hard ? 0.01 : 1.2);
  }

  /* ---------- scheduler ---------- */
  function releaseVoices(t) {
    for (const v of S.voices) if (v.end > t + .05) {
      const p = v.env.gain;
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t);
      p.setTargetAtTime(0, t, 0.12);
      v.nodes.forEach(o => { try { o.stop(t + 0.8); } catch (e) { /* stop already applied */ } });
      v.end = t + 0.8;
    }
  }
  function enterState(name, t) {
    S.state = name; S.step = 0; S.barInChord = 0; S.bar = 0; S.beat = 0; S.cycle = 0;
    S.chordName = STATES[name].prog[0][0]; releaseVoices(t); applyMix(t);
    S.events.push({ t, type: 'state', state: name });
  }
  function scheduleBeat(t) {
    let st = STATES[S.state];
    // pending state: bar line, or next beat for 'beat'-quantised targets
    if (S.pending && (S.beat === 0 || S.pending.quant === 'beat')) { enterState(S.pending.name, t); S.pending = null; st = STATES[S.state]; }
    const spb = 60 / st.bpm, I = effI(), bpb = 4;
    const [cname, cbars] = st.prog[S.step];
    if (S.beat === 0 && S.barInChord === 0) { S.chordName = cname; startChord(t, cbars * bpb * spb, spb); }
    S.events.push({ t, type: 'beat', state: S.state, chord: S.chordName, bar: S.bar, beat: S.beat, bpm: st.bpm, cycle: S.cycle, I });
    if (S.events.length > 64) S.events.splice(0, S.events.length - 64);
    // stings due on this beat
    S.stings = S.stings.filter(s => { if (t < s.at - 0.01) return true; fireSting(s.name, t, spb); return false; });
    beatLayers(t, spb, I, st);
  }
  function advance() {
    const st = STATES[S.state]; S.next += 60 / st.bpm; S.beat++;
    if (S.beat >= 4) { S.beat = 0; S.bar++; S.barInChord++; if (S.barInChord >= st.prog[S.step][1]) { S.barInChord = 0; S.step++; if (S.step >= st.prog.length) { S.step = 0; S.cycle++; } } }
  }
  function startChord(t, dur, spb) {
    const st = STATES[S.state], c = chord(), I = effI();
    if (st.pad === 'none') return;
    if (st.pad === 'harm') { padVoice(86, t, dur, 0.05, 'harm', spb); padVoice(81, t, dur, 0.04, 'harm', spb); if (S.chordName === 'Eb/D') padVoice(87, t, dur, 0.03, 'harm', spb); return; }
    const v = voiceLead(c.t), vol = st.pad === 'trem' ? 0.07 : 0.065;
    v.forEach(m => padVoice(m, t, dur, vol, st.pad, spb));
    if (I >= 0.6) v.forEach(m => padVoice(m + 12, t, dur, 0.035 * (I - 0.4) * 2.5, st.pad, spb)); // violins double
    const bpc = c.b != null ? c.b : c.t[0], bm = nearest(bpc, S.lastBass, 33, 45);
    if (c.b == null && (I >= 0.4 || st.bpm >= 144)) { bassVoice(bm, t, dur, 0.16); S.lastBass = bm; }
    else if (c.b != null && I >= 0.4) bassVoice(38, t, dur, 0.11);
  }
  function playLine(line, t0, spb, base, v, inst) {
    for (const [b, m, d, bend] of line) { const tm = t0 + b * spb, mm = m + (base || 0);
      if (inst === 'koto') koto(mm, tm, v, bend || 0, bend < 0 ? spb * 0.5 : undefined);
      else padVoice(mm, tm, d * spb * 0.95, v, 'legato', spb); }
  }
  function beatLayers(t, spb, I, st) {
    const name = S.state, c = chord(), root = c.t[0], fifthPc = (root + 7) % 12, bar = S.bar, beat = S.beat;
    const lowRoot = nearest(root, 50, 43, 54), lowFifth = nearest(fifthPc, lowRoot + 7, lowRoot + 1, lowRoot + 11);
    if (name === 'explore') {
      if (bar % 16 === 0 && beat === 0 && I >= 0.15) playLine(LEIT, t, spb, 0, 0.5, 'koto');
      else if (bar % 16 > 4 && I >= 0.2) { const p = 0.15 + 0.6 * I; if ((beat === 0 || beat === 2) && S.rnd() < p) koto(pick(kotoTones(62, 81)), t, 0.32); if (I >= 0.6 && beat === 2 && S.rnd() < 0.5) koto(pick(kotoTones(62, 81)), t + spb / 2, 0.25); }
      if (S.chordName === 'Eb' && S.barInChord === 1 && beat === 3 && I >= 0.2) koto(74, t, 0.38, -1, 0.05 + spb * .5); // koto states the bII-i cadence
      if (I >= 0.4) { spicc(lowRoot, t, beat === 0 ? .2 : .12); if (I >= 0.6) spicc(beat % 2 ? lowFifth : lowRoot, t + spb / 2, .1); }
      if (I >= 0.8 && beat === 0 && bar % 8 === 0) braam(nearest(root, 38, 33, 44), t, .32);
      if (I >= 0.8 && beat === 0) thump(t, .35);
    } else if (name === 'tension') {
      spicc(50, t, beat === 0 ? .17 : .1); if (I >= 0.5 && beat === 3) spicc(51, t + spb / 2, .1);
      if (S.chordName === 'Eb/D' && beat === 0) koto(74, t, .38, -1, 0.05 + spb);
      else if (beat === 2 && S.rnd() < 0.25 + 0.4 * I) koto(pick(kotoTones(62, 79)), t, .26);
      if (I >= 0.6 && beat % 2 === 0) thump(t, .3 * I);
    } else if (name === 'hunt') {
      const pat = [lowRoot, lowRoot, lowFifth, lowRoot, lowRoot, lowRoot, lowFifth, lowRoot + 12];
      if (S.cycle % 2 === 1 && bar % 4 === 0) { if (beat === 0) for (const [b, iv, d] of THREAT) spicc(50 + iv, t + b * spb, .24); }
      else if (!(S.cycle % 2 === 1 && bar % 4 === 0)) for (let h = 0; h < 2; h++) spicc(pat[beat * 2 + h], t + h * spb / 2, (beat === 0 && h === 0) ? .24 : .13);
      if (beat === 0 && bar % 4 === 0 && I >= 0.5) braam(nearest(root, 38, 33, 44), t, .28 + .15 * I);
      if (beat % 2 === 0 || I >= 0.75) thump(t, .4 + .3 * I, true);
      if (S.chordName === 'Eb' && beat === 0) { koto(74, t, .4); koto(81, t + spb / 2, .38); koto(74, t + spb, .42, -1, .05 + spb / 2); }
      else if (beat === 0) koto(pick(kotoTones(69, 86)), t, .3);
    } else if (name === 'hide') {
      thump(t, .18 + .25 * I);
      if (bar % 4 === 2 && beat === 1 && S.rnd() < .7) koto(pick([69, 74]), t, .22, -1, .5); // held a semitone high, then released into the chord tone
    } else if (name === 'castle') {
      if (bar % 8 === 0 && beat === 0) playLine(LEIT_RETRO, t, spb * 0.75, -12, 0.4, 'koto');
      if (beat === 0 && bar % 4 === 0) braam(38, t, .22);
      if (S.chordName === 'Bbm/D' && beat === 2) koto(73, t, .3); // Db: the wrong note, alone
    } else if (name === 'escape') {
      if (bar % 4 === 0 && beat === 0) { playLine(LEIT_ESC, t, spb, 12, .45, 'koto'); if (I >= 0.5) playLine(LEIT_ESC, t, spb, 0, .045, 'pad'); }
      const pat = [lowRoot, lowFifth, lowRoot + 12, lowFifth];
      for (let h = 0; h < 2; h++) spicc(pat[(beat * 2 + h) % 4], t + h * spb / 2, beat === 0 && h === 0 ? .22 : .13);
      if (beat === 0 && bar % 4 === 0 && I >= 0.6) braam(nearest(root, 38, 33, 44), t, .3);
      if (beat % 2 === 0) thump(t, .45, true);
    }
  }
  function fireSting(name, t, spb) {
    const c = chord(), root = c.t[0];
    S.events.push({ t, type: 'sting', name });
    if (name === 'yokai') { koto(86, t, .5, -1, .04); koto(81, t + .18, .4); cluster([62, 63, 69], t, 1.6, .035); noiseHit(t, .9, 3000, 700, .08, 4); }
    else if (name === 'reveal') { const tones = kotoTones(66, 86); koto(tones[0], t, .45); koto(tones[Math.min(1, tones.length - 1)], t + spb * .5, .45); koto(tones[tones.length - 1], t + spb, .5); }
    else if (name === 'braam') braam(nearest(root, 38, 33, 44), t, .5);
    else if (name === 'shift') { cluster([50, 51, 57, 62, 63], t, 3.5, .03); braam(38, t, .4); } // the riser was started by sting()
    else if (name === 'caught') { releaseVoices(t); braam(38, t, .55); cluster([51, 62, 63], t, 2.5, .04); for (const [b, iv] of THREAT) spicc(38 + iv, t + b * .35 + .1, .3); }
  }

  /* ---------- API ---------- */
  const Score = {
    STATES: Object.keys(STATES), STINGS: ['yokai', 'reveal', 'braam', 'shift', 'caught'],
    init,
    setState(name) {
      if (!S || !STATES[name]) return;
      if (name === S.state && !S.pending) return;
      S.pending = { name, quant: STATES[name].quant || 'bar' };
    },
    setIntensity(v) { if (S) S.Itarget = Math.max(0, Math.min(1, +v || 0)); },
    sting(name) {
      if (!S || !Score.STINGS.includes(name)) return;
      if (name !== 'shift') { S.stings.push({ name, at: 0 }); return; }
      // shift lands on a bar line at least 1 s away; the noise riser starts now and peaks on it
      const spb = 60 / STATES[S.state].bpm, now = nowT();
      let at = S.next + ((4 - S.beat) % 4) * spb; if (at - now < 1) at += 4 * spb;
      noiseHit(now + 0.02, at - now - 0.02, 150, 5000, .22);
      S.stings.push({ name, at });
    },
    update(now) {
      if (!S || !S.running) return;
      if (now != null) S.vnow = now; const t = nowT();
      if (S.next < t) { // fell behind (tab hidden): resync to the grid without a burst
        const spb = 60 / STATES[S.state].bpm; S.next = t + 0.05; void spb; }
      const dt = S.lastUpd == null ? 0 : Math.max(0, t - S.lastUpd); S.lastUpd = t;
      const k = 1 - Math.exp(-dt / 0.5); const prev = S.I; S.I += (S.Itarget - S.I) * k; if (Math.abs(S.I - prev) > 0.002) applyMix(t);
      while (S.next < t + 0.3) { scheduleBeat(S.next); advance(); }
      S.voices = S.voices.filter(v => v.end > t);
    },
    getInfo() {
      if (!S) return null; const t = nowT(); let e = null;
      for (const ev of S.events) if (ev.type === 'beat' && ev.t <= t + 0.005) e = ev;
      return { state: e ? e.state : S.state, pending: S.pending && S.pending.name, chord: e ? e.chord : S.chordName, bar: e ? e.bar + 1 : 0, beat: e ? e.beat + 1 : 0, bpm: e ? e.bpm : STATES[S.state].bpm, intensity: +S.I.toFixed(2), key: 'D (Phrygian; koto miyako-bushi)' };
    },
    stop() { if (!S) return; S.running = false; releaseVoices(nowT()); S.bus.drone.gain.setTargetAtTime(0, nowT(), .3); S.hum.gain.setTargetAtTime(0, nowT(), .3); },
    _debug(on) { if (S) { S.debug = !!on; S.notes = []; } return S; },
    _harmony: { CH, STATES, PHRYG, AEOL, MIYAKO, PCN }
  };
  window.Score = Score;
})();
