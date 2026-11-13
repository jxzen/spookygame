/* yokai.js: folklore glimpses for probe 04. OWNER: yokai (brief W2-YOKAI). register('yokai', order 40).
 * Five creatures, once each (roster top 5): akaname, zashiki-warashi, mokumokuren, chochin-obake, nopperabo.
 * Grammar (docs/references/characters/yokai/roster.md): appear at the edge of view (25-60 deg off centre), gone when
 * looked at (< 15 deg) or approached (< 6 m), always exit to cover, always leave a trace, never harm, sound before/after.
 * The noppera-bo breaks rule 4 on purpose: it waits to be approached, turns, and the light goes out (Hearn, "Mujina").
 *
 * READS (all guarded): G.world.yokaiSpots [{id, pos:Vector3, facing:radians, kind}] (facing = world yaw of the spot's
 *   local +Z, the side the player is expected to view from, see SPOT CONVENTION below), G.world.walkable, G.world.colliders,
 *   G.mission.{phase,intel,t}, G.monster.{state,pos}, G.player.{hidden,lightOn}, G.fx.state.flashFlicker.k, G.audioCtx.
 * WRITES: own scene objects; G.player pos/yaw/pitch only for the #jump=yokai-<kind> capture hook; #fade via G.ui for the
 *   chochin flicker dip and the noppera-bo "light went out". EMITS 'yokai' {kind} at each glimpse (nopperabo adds lightOut: 1.5).
 * SPOT CONVENTION (local frame, +Z faces the viewer side):
 *   akaname: pos = ground at a building corner; the building occupies local x<0,z<0, the alley is x>0; best viewed from front-left.
 *   zashiki-warashi: pos = ground at the centre of a far doorway; the child crosses local -x -> +x about 1.4 m behind it.
 *   mokumokuren: pos = ground at the centre of a shoji wall (2.4 m wide, paper from 0.5 to 2.3 m), paper faces +Z.
 *   chochin-obake: pos = ground under the lantern; the lantern hangs at 1.95 m.
 *   nopperabo: pos = where she stands; her back faces +Z.
 * CAPTURE: #jump=yokai-<kind> [&ycen] [&ypose=back for nopperabo] places the player and holds the glimpse mid-animation.
 */
(function () {
  'use strict';
  const G = window.G; if (!G) return;
  const THREE = G.THREE, V3 = THREE.Vector3, D2R = Math.PI / 180;
  const KINDS = ['akaname', 'zashiki-warashi', 'mokumokuren', 'chochin-obake', 'nopperabo'];
  const MIN_INTEL = { akaname: 0, 'zashiki-warashi': 1, mokumokuren: 1, 'chochin-obake': 2, nopperabo: 3 };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  /* ---------- tiny mesh kit ---------- */
  const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85, metalness: 0 }, o || {}));
  function mesh(geo, m, x, y, z, parent) { const me = new THREE.Mesh(geo, m); me.position.set(x || 0, y || 0, z || 0); me.castShadow = true; if (parent) parent.add(me); return me; }
  function blob(m, sx, sy, sz, x, y, z, parent, seg) { const me = mesh(new THREE.SphereGeometry(1, seg || 9, Math.max(5, (seg || 9) - 2)), m, x, y, z, parent); me.scale.set(sx, sy, sz); return me; }
  const UNITCYL = {};
  function limb(m, r0, r1, parent) { // unit cylinder along +y from 0 to 1; place with setLimb
    const k = r0 + '_' + r1; if (!UNITCYL[k]) { const g = new THREE.CylinderGeometry(r1, r0, 1, 6); g.translate(0, 0.5, 0); UNITCYL[k] = g; }
    const me = new THREE.Mesh(UNITCYL[k], m); me.castShadow = true; if (parent) parent.add(me); return me;
  }
  const _d = new V3(), _up = new V3(0, 1, 0);
  function setLimb(me, a, b) { _d.subVectors(b, a); const l = _d.length() || 1e-4; me.position.copy(a); me.scale.set(1, l, 1); me.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / l)); }
  function limbAB(m, r0, r1, a, b, parent) { const me = limb(m, r0, r1, parent); setLimb(me, a, b); return me; }
  const v = (x, y, z) => new V3(x, y, z);
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function almond(w, h, droop) { // eye shape, upper lid fuller
    const s = new THREE.Shape(); s.moveTo(-w / 2, 0);
    s.quadraticCurveTo(-w * 0.1, h * (1.05 + (droop || 0)), w / 2, -h * (droop || 0) * 0.4);
    s.quadraticCurveTo(w * 0.05, -h * 0.8, -w / 2, 0); return new THREE.ShapeGeometry(s, 6);
  }
  function tornDisc(r, n) { const s = new THREE.Shape(); for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, rr = r * (0.72 + rnd() * 0.45); i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.9) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.9); } return new THREE.ShapeGeometry(s); }

  /* ---------- audio (procedural, diegetic) ---------- */
  let noiseB = null;
  function AC() { const c = G.audioCtx; return c && c.state !== 'closed' ? c : null; }
  function noise(c) { if (!noiseB) { noiseB = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return noiseB; }
  function outAt(c, pos, gain) {
    const g = c.createGain(); let pan = 0, dist = 5;
    if (pos) { const cp = G.camera.getWorldPosition(new V3()); const d = pos.clone().sub(cp); dist = d.length();
      const right = new V3(1, 0, 0).applyQuaternion(G.camera.quaternion); pan = clamp(d.normalize().dot(right), -1, 1) * 0.85; }
    g.gain.value = gain * clamp(5 / Math.max(dist, 0.1), 0.12, 1);
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(c.destination); } else g.connect(c.destination);
    return g;
  }
  function nburst(c, dest, t, dur, type, f, Q, g0, attack) {
    const s = c.createBufferSource(); s.buffer = noise(c); const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(g0, t + (attack || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(b); b.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function tone(c, dest, t, f0, f1, dur, g0, type) {
    const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(g0, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  const SFX = {
    'akaname-pre'(c, d, t) { nburst(c, d, t, 0.03, 'bandpass', 2600, 5, 0.5); tone(c, d, t, 900, 260, 0.04, 0.25); nburst(c, d, t + 0.05, 0.06, 'bandpass', 1400, 3, 0.2); },
    'akaname-post'(c, d, t) { for (let i = 0; i < 6; i++) nburst(c, d, t + 0.08 + i * 0.085 + Math.random() * 0.02, 0.05, 'lowpass', 900, 1, 0.5 * Math.pow(0.78, i)); },
    'zashiki-warashi-pre'(c, d, t) { tone(c, d, t, 95, 48, 0.09, 0.45); nburst(c, d, t, 0.05, 'lowpass', 500, 1, 0.3); },
    'zashiki-warashi-post'(c, d, t) { // a wooden top spinning down
      let tt = t + 0.6, iv = 0.028; while (iv < 0.3) { nburst(c, d, tt, 0.018, 'bandpass', 3200, 6, 0.16); tt += iv; iv *= 1.06; }
      tone(c, d, t + 0.6, 190, 120, tt - t - 0.6, 0.03, 'triangle'); for (let i = 0; i < 4; i++) nburst(c, d, tt + i * 0.07 * (1 + i * 0.4), 0.03, 'bandpass', 2200, 4, 0.25 / (i + 1));
    },
    'mokumokuren-pre'(c, d, t) { for (let i = 0; i < 9; i++) nburst(c, d, t + i * (0.05 + Math.random() * 0.06), 0.03, 'bandpass', 1500 + Math.random() * 900, 2.5, 0.22); },
    'mokumokuren-post'(c, d, t) { for (let i = 0; i < 14; i++) nburst(c, d, t + i * 0.018, 0.025, 'bandpass', 1300 + i * 60, 2.5, 0.2); },
    'chochin-obake-pre'(c, d, t) { // paper creaking on bamboo ribs
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(38, t); o.frequency.linearRampToValueAtTime(22, t + 0.7);
      const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = 950; b.Q.value = 7; const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      o.connect(b); b.connect(g); g.connect(d); o.start(t); o.stop(t + 0.8);
    },
    'chochin-obake-breath'(c, d, t) { nburst(c, d, t, 0.55, 'lowpass', 1100, 0.7, 0.25, 0.2); },
    'nopperabo-sob'(c, d, t) { for (let i = 0; i < 3; i++) nburst(c, d, t + i * 0.22, 0.2, 'bandpass', 800 + Math.random() * 300, 3, 0.16 * (1 - i * 0.2), 0.05); nburst(c, d, t + 0.8, 0.4, 'highpass', 2000, 0.7, 0.06, 0.25); },
    'nopperabo-click'(c, d, t) { nburst(c, d, t, 0.012, 'highpass', 3000, 0.7, 0.7, 0.001); tone(c, d, t, 1800, 600, 0.02, 0.15, 'square'); }
  };
  function sfx(name, pos, gain) { const c = AC(); if (!c || !SFX[name]) return; try { SFX[name](c, outAt(c, pos, gain || 1), c.currentTime + 0.01); } catch (e) { /* audio is optional */ } }

  /* ---------- screen dim through #fade (shared via G.ui) ---------- */
  let dimSaved = null;
  function fadeEl() { return document.getElementById('fade'); }
  function canDim() { const el = fadeEl(); return el && (dimSaved || parseFloat(getComputedStyle(el).opacity) < 0.08); }
  function dim(vv) { const el = fadeEl(); if (!el) return; if (!dimSaved) dimSaved = { tr: el.style.transition, op: el.style.opacity || '0' }; el.style.transition = 'none'; el.style.opacity = vv; }
  function undim(sec) { const el = fadeEl(); if (!el || !dimSaved) return; const s = dimSaved; dimSaved = null; el.style.transition = 'opacity ' + (sec || 0) + 's'; el.style.opacity = s.op;
    setTimeout(() => { if (!dimSaved) el.style.transition = s.tr; }, (sec || 0) * 1000 + 50); }

  /* ---------- textures ---------- */
  function footTex() {
    const c = canvas(64, 128), x = c.getContext('2d'); x.fillStyle = '#fff';
    x.beginPath(); x.ellipse(32, 72, 15, 30, 0.05, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(30, 108, 11, 13, 0, 0, Math.PI * 2); x.fill();
    [[14, 30, 7], [25, 24, 5], [34, 23, 4.5], [42, 26, 4], [49, 31, 3.5]].forEach(([a, b, r]) => { x.beginPath(); x.arc(a + 2, b, r, 0, Math.PI * 2); x.fill(); });
    const t = new THREE.CanvasTexture(c); return t;
  }
  function lanternTex(variant) { // variant: 'plain' | 'torn' | 'face' | 'after' | 'glow'
    const W = 512, H = 256, c = canvas(W, H), x = c.getContext('2d'); seed = 31;
    const glow = variant === 'glow', ink = glow ? '#000' : '#141210';
    x.fillStyle = glow ? '#fff' : '#a49f94'; x.fillRect(0, 0, W, H);
    if (!glow) { for (let i = 0; i < 90; i++) { x.fillStyle = 'rgba(40,36,30,' + (rnd() * 0.08) + ')'; x.beginPath(); x.arc(rnd() * W, rnd() * H, 4 + rnd() * 30, 0, 7); x.fill(); }
      const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(0,0,0,.25)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.35)'); x.fillStyle = gr; x.fillRect(0, 0, W, H); }
    else { const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#555'); gr.addColorStop(0.5, '#fff'); gr.addColorStop(1, '#666'); x.fillStyle = gr; x.fillRect(0, 0, W, H); }
    const face = variant === 'face' || glow;
    const tear = (s) => { x.fillStyle = ink; x.beginPath(); const cx = 262, cy = 196; const n = 14;
      for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, r = (i % 2 ? 0.6 : 1) * (0.8 + rnd() * 0.4);
        const px = cx + Math.cos(a) * 34 * s * r, py = cy + Math.sin(a) * 15 * s * r + (Math.cos(a) > 0.5 || Math.cos(a) < -0.5 ? -6 * s * Math.abs(Math.cos(a)) : 0) * -1; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.fill(); };
    if (variant === 'torn') tear(0.55);
    if (variant === 'after') tear(1.0);
    if (face) {
      x.strokeStyle = ink; x.fillStyle = ink; x.lineCap = 'round';
      // hair: strands down both sides and across the brow
      for (let i = 0; i < 26; i++) { const sx = 150 + rnd() * 70 + (i % 2 ? 150 : 0); x.lineWidth = 1.5 + rnd() * 3; x.beginPath(); x.moveTo(sx, 0); x.bezierCurveTo(sx + (rnd() - 0.5) * 30, 80, sx + (rnd() - 0.5) * 50, 160, sx + (rnd() - 0.5) * 40, H); x.stroke(); }
      for (let i = 0; i < 10; i++) { x.lineWidth = 2 + rnd() * 2; x.beginPath(); const sx = 200 + rnd() * 120; x.moveTo(sx, 0); x.quadraticCurveTo(sx + 20, 40, sx - 30 + rnd() * 60, 70 + rnd() * 30); x.stroke(); }
      // the drooping, swollen eye (viewer's left)
      x.save(); x.translate(222, 128); x.rotate(0.28);
      x.lineWidth = 7; x.beginPath(); x.moveTo(-46, -6); x.quadraticCurveTo(-5, -38, 44, 10); x.stroke(); // heavy upper lid
      x.beginPath(); x.moveTo(-40, 2); x.quadraticCurveTo(0, -18, 38, 12); x.quadraticCurveTo(0, 24, -40, 2); x.fill(); // eye
      if (!glow) { x.fillStyle = '#5c5850'; x.beginPath(); x.ellipse(-4, 4, 26, 7, 0.05, 0, 7); x.fill(); x.fillStyle = ink; x.beginPath(); x.arc(4, 6, 8, 0, 7); x.fill(); }
      x.lineWidth = 3; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(-36 + i * 6, 22 + i * 7); x.quadraticCurveTo(0, 34 + i * 9, 40, 22 + i * 6); x.stroke(); } // swollen sag
      x.restore();
      // the other eye: a narrow slit, higher
      x.lineWidth = 5; x.beginPath(); x.moveTo(288, 108); x.quadraticCurveTo(306, 100, 326, 110); x.stroke();
      x.lineWidth = 2; x.beginPath(); x.moveTo(290, 116); x.quadraticCurveTo(308, 112, 324, 116); x.stroke();
      x.lineWidth = 3; x.beginPath(); x.moveTo(266, 140); x.quadraticCurveTo(258, 162, 270, 168); x.stroke(); // nose
      seed = 77; tear(1.25); // the tear is the mouth
      x.beginPath(); x.moveTo(240, 196); x.lineTo(252, 236); x.lineTo(262, 214); x.lineTo(274, 244); x.lineTo(286, 198); x.fill(); // the tear runs down
    }
    // ribs drawn last, over the face (Hokusai: the ribs cut across the eye)
    x.strokeStyle = glow ? '#000' : '#26231f';
    for (let i = 1; i < 15; i++) { const y = i * H / 15; x.lineWidth = face ? 2.5 : 3.5; x.beginPath(); x.moveTo(0, y); for (let px = 0; px <= W; px += 32) x.lineTo(px, y + Math.sin(px * 0.05 + i) * 1.5); x.stroke(); }
    return new THREE.CanvasTexture(c);
  }

  /* =====================================================================================
   * CREATURES. Each returns { root, focus (local), viewLocal, jumpDist, peek, update(dt, st), ... }
   * st: { phase: 'wait'|'show'|'exit'|'done', t, hold }
   * ===================================================================================== */
  const SKIN = () => mat(0x6f6a62, { roughness: 0.25, metalness: 0.08, emissive: 0x070706 });
  const INK = () => mat(0x0b0b0c, { roughness: 0.95 });

  function makeAkaname(cover) {
    const root = new THREE.Group(), body = new THREE.Group(), skin = SKIN(), dark = mat(0x161413, { roughness: 0.5 }), wet = mat(0x231d1c, { roughness: 0.15, metalness: 0.1 });
    root.add(body); body.scale.setScalar(1.55);
    blob(skin, 0.15, 0.13, 0.27, 0.24, 0.37, -0.44, body).rotation.x = 0.18;   // hunched back
    blob(skin, 0.14, 0.13, 0.14, 0.25, 0.35, -0.7, body);                      // hips
    // spine knuckles catch the light along the back
    for (let i = 0; i < 4; i++) blob(skin, 0.03, 0.025, 0.04, 0.24, 0.5 - i * 0.012, -0.3 - i * 0.12, body, 5);
    limbAB(skin, 0.05, 0.04, v(0.23, 0.42, -0.22), v(0.17, 0.46, 0.03), body);  // neck, thrust forward
    const head = new THREE.Group(); head.position.set(0.16, 0.48, 0.09); body.add(head);
    blob(skin, 0.08, 0.098, 0.125, 0, 0, -0.01, head, 10);
    blob(skin, 0.065, 0.045, 0.075, 0, -0.06, 0.05, head);                       // jaw, too far forward
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), mat(0x2e2b28, { roughness: 0.9 })); cap.scale.set(0.094, 0.104, 0.116); cap.position.set(0, 0.008, -0.01); cap.rotation.x = -0.35; head.add(cap);
    // (no brow piece: it read as a cartoon frown)
    // no eyes rendered: the face stays in the shadow of the skull (roster rule 12, no faces in close-up)
    const tongue = limbAB(wet, 0.02, 0.006, v(0, -0.08, 0.1), v(0.01, -0.28, 0.17), head);
    // near arm reaching to the corner, fingers hooked over the edge
    limbAB(skin, 0.035, 0.028, v(0.14, 0.42, -0.26), v(0.05, 0.5, -0.08), body);
    limbAB(skin, 0.028, 0.02, v(0.05, 0.5, -0.08), v(0.02, 0.6, 0.0), body);
    blob(skin, 0.03, 0.04, 0.025, 0.02, 0.6, 0.005, body);
    for (let i = 0; i < 4; i++) { const y = 0.565 + i * 0.022; limbAB(skin, 0.009, 0.006, v(0.02, y, 0.012), v(-0.03, y - 0.004, 0.022), body); limbAB(dark, 0.006, 0.001, v(-0.03, y - 0.004, 0.022), v(-0.055, y - 0.01, 0.01), body); }
    // far arm planted
    limbAB(skin, 0.035, 0.028, v(0.34, 0.4, -0.3), v(0.4, 0.2, -0.16), body); limbAB(skin, 0.028, 0.02, v(0.4, 0.2, -0.16), v(0.37, 0.02, -0.05), body);
    for (let i = -1; i <= 1; i++) limbAB(dark, 0.008, 0.002, v(0.37 + i * 0.015, 0.02, -0.05), v(0.37 + i * 0.03, 0.005, 0.02), body);
    // frog-crouched legs, clawed feet
    [[0.1, 0.13], [0.41, 0.4]].forEach(([kx, fx]) => { limbAB(skin, 0.05, 0.035, v(0.25, 0.34, -0.72), v(kx, 0.33, -0.5), body); limbAB(skin, 0.035, 0.025, v(kx, 0.33, -0.5), v(fx, 0.03, -0.64), body);
      mesh(new THREE.BoxGeometry(0.05, 0.025, 0.11), skin, fx, 0.013, -0.6, body); for (let i = -1; i <= 1; i++) limbAB(dark, 0.007, 0.001, v(fx + i * 0.016, 0.01, -0.55), v(fx + i * 0.02, 0.003, -0.5), body); });
    body.position.z = -1.1; body.visible = false;
    if (cover) {
      const wall = mat(0x2a2a2c, { roughness: 0.92 }), tile = mat(0x4b4b4e, { roughness: 0.4 });
      mesh(new THREE.BoxGeometry(2.6, 3.0, 3.2), wall, -1.3, 1.5, -1.6, root).receiveShadow = true;
      mesh(new THREE.BoxGeometry(2.6, 1.0, 0.03), tile, -1.3, 0.5, 0.015, root).receiveShadow = true;
      mesh(new THREE.BoxGeometry(0.03, 1.0, 3.2), tile, 0.015, 0.5, -1.6, root);
      mesh(new THREE.BoxGeometry(2.6, 3.4, 3.2), wall, 2.75, 1.7, -1.8, root).receiveShadow = true; // far side of the alley
    }
    const traces = new THREE.Group(); traces.visible = false; root.add(traces);
    const streakM = mat(0x77777a, { roughness: 0.06, metalness: 0.35 });
    [[-0.22, 0.6, 0.55, 0.3], [-0.42, 0.52, 0.38, 0.18], [-0.12, 0.38, 0.3, -0.1]].forEach(([x, y, h, r]) => { const s = mesh(new THREE.PlaneGeometry(0.06, h), streakM, x, y, 0.035, traces); s.rotation.z = r; });
    const printM = mat(0x050505, { roughness: 0.04, metalness: 0.3 });
    for (let i = 0; i < 6; i++) { const p = mesh(new THREE.CircleGeometry(0.05, 7), printM, 0.25 + (i % 2) * 0.18, 0.004, -0.2 - i * 0.32, traces); p.rotation.x = -Math.PI / 2; p.scale.set(0.8, 1.3, 1); }
    let headTilt = 0;
    return { kind: 'akaname', root, focus: v(0.2, 0.62, 0.1), viewLocal: -40 * D2R, jumpDist: 7, fallbackDist: 9, pitch: -0.1, maxShow: 1.0,
      light: { pos: v(0.9, 1.1, 0.9), color: 0xc4c8d0, i: 2.2, d: 4.5 },
      begin() { body.visible = true; },
      update(dt, st) {
        if (st.phase === 'show') { const k = st.hold ? 1 : 1 - Math.pow(1 - clamp(st.t / 0.22, 0, 1), 3); body.position.z = lerp(-1.1, 0, k);
          headTilt = Math.sin(st.t * 2.3) * 0.1 + 0.3; head.rotation.set(0.55, -0.45, headTilt); tongue.rotation.z = Math.sin(st.t * 3) * 0.08; }
        else if (st.phase === 'exit') { body.position.z = lerp(0, -1.4, clamp(st.t / 0.15, 0, 1)); if (st.t > 0.15) { body.visible = false; traces.visible = true; return true; } }
        return false;
      } };
  }

  function makeZashiki(cover) {
    const root = new THREE.Group(), child = new THREE.Group(), lean = new THREE.Group(), ink = INK(), obi = mat(0x232325, { roughness: 0.9 });
    root.add(child); child.add(lean); child.rotation.y = Math.PI / 2; child.position.set(-1.7, 0, -1.4); child.visible = false;
    const legs = [-1, 1].map(s => { const g = new THREE.Group(); g.position.set(s * 0.05, 0.33, 0); lean.add(g); limbAB(ink, 0.03, 0.022, v(0, 0, 0), v(0, -0.31, 0), g); mesh(new THREE.BoxGeometry(0.045, 0.02, 0.09), ink, 0, -0.32, 0.02, g); return g; });
    mesh(new THREE.CylinderGeometry(0.1, 0.19, 0.44, 7), ink, 0, 0.55, 0, lean);
    mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.06, 7), obi, 0, 0.64, 0, lean);
    blob(ink, 0.13, 0.06, 0.09, 0, 0.76, 0, lean);
    const sleeves = [-1, 1].map(s => { const g = new THREE.Group(); g.position.set(s * 0.13, 0.75, 0); lean.add(g); mesh(new THREE.BoxGeometry(0.05, 0.25, 0.17), ink, s * 0.02, -0.12, -0.02, g); return g; });
    const head = new THREE.Group(); head.position.set(0, 0.9, 0.01); lean.add(head);
    blob(ink, 0.092, 0.1, 0.095, 0, 0, 0, head, 10); mesh(new THREE.ConeGeometry(0.03, 0.05, 5), ink, 0, 0.11, -0.01, head);
    if (cover) {
      const wall = mat(0x262628, { roughness: 0.92 }), floor = mat(0x1c1b1a, { roughness: 0.6 });
      mesh(new THREE.BoxGeometry(2.4, 2.7, 0.16), wall, -2.1, 1.35, 0, root); mesh(new THREE.BoxGeometry(2.4, 2.7, 0.16), wall, 2.1, 1.35, 0, root);
      mesh(new THREE.BoxGeometry(1.8, 0.75, 0.16), wall, 0, 2.32, 0, root);
      mesh(new THREE.BoxGeometry(6.6, 2.7, 0.16), wall, 0, 1.35, -3.3, root); mesh(new THREE.BoxGeometry(0.16, 2.7, 3.3), wall, -3.25, 1.35, -1.65, root); mesh(new THREE.BoxGeometry(0.16, 2.7, 3.3), wall, 3.25, 1.35, -1.65, root);
      mesh(new THREE.BoxGeometry(6.6, 0.1, 3.4), wall, 0, 2.72, -1.65, root);
      const f = mesh(new THREE.PlaneGeometry(6.4, 3.2), floor, 0, 0.006, -1.65, root); f.rotation.x = -Math.PI / 2; f.receiveShadow = true;
      // rain-light through a paper window at the back: the child reads black against it
      mesh(new THREE.PlaneGeometry(2.8, 1.7), new THREE.MeshBasicMaterial({ color: 0x5e5b55 }), 0, 1.15, -3.2, root);
      const lat = mat(0x111111); for (let i = 0; i <= 6; i++) mesh(new THREE.BoxGeometry(0.03, 1.7, 0.03), lat, -1.4 + i * 0.467, 1.15, -3.18, root);
      for (let i = 0; i <= 4; i++) mesh(new THREE.BoxGeometry(2.8, 0.03, 0.03), lat, 0, 0.3 + i * 0.425, -3.18, root);
    }
    const traces = new THREE.Group(); traces.visible = false; root.add(traces);
    const fm = mat(0x9b978f, { map: footTex(), transparent: true, alphaTest: 0.4, roughness: 1 });
    for (let i = 0; i < 9; i++) { const p = mesh(new THREE.PlaneGeometry(0.075, 0.15), fm, 0.15 + i * 0.33, 0.008, -1.4 - i * 0.06 + (i % 2 ? 0.07 : -0.07), traces); p.rotation.set(-Math.PI / 2, 0, -Math.PI / 2 + 0.1); }
    // the wooden top
    const pts = [v(0, 0, 0), v(0.012, 0.004, 0), v(0.034, 0.03, 0), v(0.036, 0.045, 0), v(0.02, 0.055, 0), v(0.006, 0.058, 0), v(0.006, 0.08, 0), v(0, 0.08, 0)].map(p => new THREE.Vector2(p.x, p.y));
    const topSpin = new THREE.Group(), topTilt = new THREE.Group(); topSpin.position.set(1.35, 0.006, -2.2); traces.add(topSpin); topSpin.add(topTilt);
    const top = mesh(new THREE.LatheGeometry(pts, 8), mat(0x6a655d, { roughness: 0.5 }), 0, 0, 0, topTilt); mesh(new THREE.TorusGeometry(0.03, 0.004, 4, 10), mat(0x161514), 0, 0.034, 0, topTilt).rotation.x = Math.PI / 2;
    let p = 0, topT = 0;
    return { kind: 'zashiki-warashi', root, focus: v(0, 0.7, -1.4), viewLocal: 0, jumpDist: 12, fallbackDist: 13, pitch: -0.02, maxShow: 1.2,
      light: { pos: v(0, 1.3, -2.7), color: 0xd0d2d6, i: 1.6, d: 4 },
      begin() { child.visible = true; },
      update(dt, st) {
        p += dt * 15; legs[0].rotation.x = Math.sin(p) * 0.75; legs[1].rotation.x = -Math.sin(p) * 0.75;
        sleeves[0].rotation.x = -Math.sin(p - 0.6) * 0.55; sleeves[1].rotation.x = Math.sin(p - 0.6) * 0.55; lean.rotation.x = 0.22; lean.position.y = Math.abs(Math.sin(p)) * 0.04; head.rotation.y = 0.15;
        if (st.phase === 'show') { child.position.x = st.hold ? -0.25 : -1.7 + st.t * 4.0; if (!st.hold && child.position.x > 1.9) return 'exit'; }
        else if (st.phase === 'exit') { child.position.x += dt * 6.5; if (child.position.x > 1.9) { child.visible = false; traces.visible = true; } if (child.position.x > 1.9) return true; }
        if (traces.visible) { topT += dt; const w = Math.max(0, 40 - topT * 11); top.rotation.y += w * dt; const tl = topT < 3.2 ? 0.04 + topT * 0.06 : Math.min(1.25, 0.23 + (topT - 3.2) * 5); topTilt.rotation.z = tl; topSpin.rotation.y += (topT < 3.6 ? 4 + topT * 3 : 0) * dt; }
        return false;
      } };
  }

  function makeMokumokuren(cover) {
    const root = new THREE.Group(), eyesG = new THREE.Group(); root.add(eyesG); seed = 11;
    const W = 2.4, Hh = 1.8, cols = 6, rows = 5, y0 = 0.5, pw = W / cols, ph = Hh / rows;
    const paper = new THREE.MeshStandardMaterial({ color: 0x77736b, emissive: 0x2c2a26, roughness: 0.95, side: THREE.DoubleSide });
    mesh(new THREE.PlaneGeometry(W, Hh), paper, 0, y0 + Hh / 2, 0, root).receiveShadow = true;
    const wood = mat(0x1b1917, { roughness: 0.8 });
    for (let i = 0; i <= cols; i++) mesh(new THREE.BoxGeometry(i % cols ? 0.022 : 0.07, Hh + 0.07, 0.04), wood, -W / 2 + i * pw, y0 + Hh / 2, 0.02, root);
    for (let j = 0; j <= rows; j++) mesh(new THREE.BoxGeometry(W, j % rows ? 0.022 : 0.07, 0.04), wood, 0, y0 + j * ph, 0.02, root);
    if (cover) { mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), wood, -W / 2 - 0.07, 1.3, 0.02, root); mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), wood, W / 2 + 0.07, 1.3, 0.02, root);
      mesh(new THREE.BoxGeometry(W + 0.3, 0.2, 0.16), wood, 0, 2.48, 0.02, root); mesh(new THREE.BoxGeometry(W + 0.3, 0.5, 0.16), mat(0x262628), 0, 0.25, 0.02, root); }
    const holeM = new THREE.MeshBasicMaterial({ color: 0x040404 }), lidM = mat(0x5a544d, { roughness: 0.55, emissive: 0x1e1c19, side: THREE.DoubleSide }), whiteM = mat(0x6f6961, { roughness: 0.12, emissive: 0x2a2824, side: THREE.DoubleSide }),
      irisM = mat(0x0c0a09, { roughness: 0.08 }), hiM = new THREE.MeshBasicMaterial({ color: 0xcfcac2 }), lashM = new THREE.MeshBasicMaterial({ color: 0x080706 });
    const lidGeo = almond(0.2, 0.1, 0.35), whiteGeo = almond(0.155, 0.068, 0.3), irisGeo = new THREE.CircleGeometry(0.03, 12), hiGeo = new THREE.CircleGeometry(0.006, 6), lashGeo = new THREE.PlaneGeometry(0.17, 0.008);
    const eyes = [], spare = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const cx = -W / 2 + (i + 0.5) * pw + (rnd() - 0.5) * 0.08, cy = y0 + (j + 0.5) * ph + (rnd() - 0.5) * 0.06;
      if (rnd() < 0.32) { spare.push([cx, cy]); continue; }
      const g = new THREE.Group(); g.position.set(cx, cy, 0.006); eyesG.add(g); g.rotation.z = (rnd() - 0.5) * 0.25;
      mesh(tornDisc(0.12, 11), holeM, 0, 0, 0, g);
      const lid = mesh(lidGeo, lidM, 0, 0, 0.002, g), white = mesh(whiteGeo, whiteM, 0, 0, 0.004, g);
      const irisG = new THREE.Group(); irisG.position.z = 0.006; white.add(irisG); mesh(irisGeo, irisM, 0, 0, 0, irisG); mesh(hiGeo, hiM, 0.01, 0.012, 0.001, irisG);
      const lash = mesh(lashGeo, lashM, 0, 0.003, 0.008, g); [lid, white, lash].forEach(m => { m.castShadow = false; });
      const sc = 0.8 + rnd() * 0.45; g.scale.setScalar(sc);
      eyes.push({ g, lid, white, irisG, lash, open: 0, target: 0, delay: 0, blinkT: 1 + rnd() * 4, cx, cy });
    }
    const extra = spare.length ? spare[0] : [0, 1.4];
    const extraHole = mesh(tornDisc(0.11, 10), holeM, extra[0], extra[1], 0.006, root); extraHole.visible = false;
    eyes.forEach(e => { e.white.scale.y = 0.02; e.lid.scale.y = 0.4; e.g.visible = false; });
    let lookAtMonsterT = 0;
    const tmpL = new V3();
    function setOpen(e, o) { e.white.scale.y = Math.max(0.02, o); e.lid.scale.y = 0.4 + 0.6 * o; e.lash.position.y = lerp(0.003, 0.03, o); e.lash.scale.y = 1 + (1 - o) * 0.8; }
    return { kind: 'mokumokuren', root, focus: v(0, 1.4, 0), viewLocal: 0, jumpDist: 4.5, fallbackDist: 7, pitch: 0, maxShow: 7, noDistanceVanish: true,
      light: { pos: v(0, 1.4, -1.0), color: 0xc8c8c8, i: 0.0, d: 3 },
      begin(st) { eyes.forEach(e => { e.g.visible = true; e.target = 1; e.delay = st && st.hold ? 0 : rnd() * 0.6; if (st && st.hold) { e.open = 1; setOpen(e, 1); } }); },
      leave(st) { // close in a wave from the side nearest the player's gaze
        const cp = G.camera.getWorldPosition(new V3()); root.worldToLocal(cp); const sx = cp.x >= 0 ? 1 : -1;
        eyes.slice().sort((a, b) => sx * (b.cx - a.cx)).forEach((e, i) => { e.target = 0; e.delay = i * 0.012; });
      },
      update(dt, st) {
        let tgt = G.camera.getWorldPosition(tmpL);
        if (st.phase === 'show') { lookAtMonsterT += dt; const m = G.monster; if (!st.hold && lookAtMonsterT > 1.4 && m && m.pos && m.pos.y > -50 && m.state && m.state !== 'dormant' && m.state !== 'gone') tgt = tmpL.copy(m.pos).setY(m.pos.y + 1); }
        root.worldToLocal(tgt);
        let allShut = true;
        eyes.forEach(e => {
          if (e.delay > 0) { e.delay -= dt; } else { const sp = e.target > e.open ? 8 : 18; e.open += clamp(e.target - e.open, -sp * dt, sp * dt); }
          let o = e.open;
          if (st.phase === 'show' && e.open > 0.95 && !st.hold) { e.blinkT -= dt; if (e.blinkT < 0) { if (e.blinkT < -0.14) e.blinkT = 2 + rnd() * 4; else o = 0.05; } }
          setOpen(e, o);
          const dx = tgt.x - e.cx, dy = tgt.y - e.cy, dz = Math.max(0.3, tgt.z);
          e.irisG.position.x = clamp(dx / dz * 0.05, -0.034, 0.034); e.irisG.position.y = clamp(dy / dz * 0.03, -0.012, 0.012);
          if (e.open > 0.03 || e.target > 0) allShut = false;
        });
        if (st.phase === 'exit' && allShut) { eyes.forEach(e => e.g.visible = false); extraHole.visible = true; return true; }
        return false;
      } };
  }

  let LTEX = null;
  function makeChochin(cover) {
    if (!LTEX) LTEX = { plain: lanternTex('plain'), torn: lanternTex('torn'), face: lanternTex('face'), after: lanternTex('after'), glow: lanternTex('glow') };
    const root = new THREE.Group(), wood = mat(0x17140f, { roughness: 0.7 });
    const pts = []; for (let i = 0; i <= 10; i++) { const y = -0.26 + i * 0.052; pts.push(new THREE.Vector2(Math.max(0.095, 0.175 * Math.sqrt(Math.max(0, 1 - Math.pow(y / 0.28, 2)))), y)); }
    const lg = new THREE.LatheGeometry(pts, 14, Math.PI, Math.PI * 2);
    const mk = (tex) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x000000 });
    const mats = { plain: mk(LTEX.plain), torn: mk(LTEX.torn), after: mk(LTEX.after),
      face: new THREE.MeshStandardMaterial({ map: LTEX.face, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xb3121b, emissiveMap: LTEX.glow, emissiveIntensity: 1.4 }) };
    function lantern(m, x, parent, cordTop) {
      const pivot = new THREE.Group(); pivot.position.set(x, cordTop, 0); parent.add(pivot);
      const g = new THREE.Group(); g.position.y = 1.95 - cordTop; pivot.add(g);
      const body = mesh(lg, m, 0, 0, 0, g); mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 10), wood, 0, 0.27, 0, g); mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 10), wood, 0, -0.27, 0, g);
      limbAB(wood, 0.006, 0.006, v(0, 0.28, 0), v(0, cordTop - 1.95, 0), g); return { pivot, g, body };
    }
    const top = cover ? 2.6 : 2.4;
    if (cover) { mesh(new THREE.BoxGeometry(6.2, 0.1, 0.1), wood, 0.4, top, 0, root); mesh(new THREE.BoxGeometry(0.12, top, 0.12), wood, -2.8, top / 2, 0, root); mesh(new THREE.BoxGeometry(0.12, top, 0.12), wood, 3.6, top / 2, 0, root);
      for (let i = -3; i <= 3; i++) if (i) { const L = lantern(mats.plain, i * 0.85 + (i > 0 ? 0 : 0), root, top); L.pivot.rotation.z = (rnd() - 0.5) * 0.04; } }
    const me = lantern(mats.torn, 0, root, top);
    const hair = new THREE.Group(); me.g.add(hair); hair.visible = false; const hm = mat(0x060606, { roughness: 0.6 });
    for (let i = 0; i < 12; i++) { const a = Math.PI * (0.55 + rnd() * 0.9) + (i % 2 ? Math.PI : 0) * 0, r = 0.12; const x = Math.sin(a) * r * (i % 2 ? 1 : -1), z = Math.cos(a) * r * 0.6 + 0.06;
      limbAB(hm, 0.008, 0.003, v(x, 0.26, z), v(x * 1.2 + (rnd() - 0.5) * 0.06, -0.55 - rnd() * 0.35, z * 1.3), hair); }
    let swing = 0, swingT = 0, faceOn = false, pulses = [], pulseI = 0, pT = 0;
    function setFace(on) { if (on === faceOn) return; faceOn = on; me.body.material = on ? mats.face : (swingT > 0 ? mats.after : mats.torn); hair.visible = on; }
    return { kind: 'chochin-obake', root, focus: v(0, 1.95, 0), viewLocal: 0, jumpDist: 5.5, fallbackDist: 8, pitch: 0.12, maxShow: 1.6,
      light: { pos: v(0, 1.95, 0.05), color: 0xb3121b, i: 0, d: 3.5 },
      faceOn: () => faceOn,
      begin() { pulses = [[0.0, 0.12], [0.3, 0.08], [0.62, 0.15]]; pulseI = 0; pT = 0; swingT = 0.001; },
      leave() { setFace(false); pulses = []; },
      update(dt, st) {
        if (swingT > 0) { swingT += dt; me.pivot.rotation.z = Math.sin(swingT * 2.6) * 0.22 * Math.exp(-swingT / 5) * Math.min(1, swingT * 2); me.pivot.rotation.x = Math.sin(swingT * 1.9) * 0.05 * Math.exp(-swingT / 5); }
        if (st.phase === 'show') {
          if (st.hold) { setFace(true); st.lightI = 1; return false; }
          pT += dt; let on = false;
          for (const [a, d] of pulses) if (pT >= a && pT < a + d) on = true;
          // the carried light's own flicker frames also show the face
          try { const ff = G.fx && G.fx.state && G.fx.state.flashFlicker; if (ff && ff.k < 0.6) on = true; } catch (e) { /* optional */ }
          if (G.player && G.player.lightOn === false) on = true;
          if (on && !faceOn && G.fx && G.fx.limiter && G.fx.limiter.allow && !G.fx.limiter.allow()) on = false;
          if (on !== faceOn) { setFace(on); if (on && canDim()) dim(0.55); else if (!on) undim(0); if (on) st.lightI = 1; else st.lightI = 0; }
          if (pT > 0.9 && !faceOn) return 'exit';
        } else if (st.phase === 'exit') { setFace(false); undim(0); st.lightI = 0; me.body.material = mats.after; return true; }
        return false;
      } };
  }

  function makeNopperabo(cover) {
    const root = new THREE.Group(), fig = new THREE.Group(); root.add(fig); fig.rotation.y = Math.PI; fig.visible = false;
    const kim = mat(0x161618, { roughness: 0.9 }), obiM = mat(0x2a292b, { roughness: 0.7 }), skin = mat(0x7a756e, { roughness: 0.5 }), hairM = mat(0x050505, { roughness: 0.4 });
    mesh(new THREE.CylinderGeometry(0.19, 0.28, 0.94, 9), kim, 0, 0.47, 0, fig);
    mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 9), kim, 0, 1.15, 0, fig);
    mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.22, 9), obiM, 0, 0.98, 0, fig);
    mesh(new THREE.BoxGeometry(0.36, 0.24, 0.13), obiM, 0, 1.02, -0.25, fig); mesh(new THREE.BoxGeometry(0.3, 0.08, 0.1), obiM, 0, 1.17, -0.23, fig);
    blob(kim, 0.21, 0.07, 0.13, 0, 1.36, 0, fig);
    limbAB(skin, 0.045, 0.04, v(0, 1.3, -0.03), v(0, 1.47, 0.0), fig); // the pale nape
    const head = new THREE.Group(); head.position.set(0, 1.5, 0.01); fig.add(head);
    const hg = new THREE.SphereGeometry(0.1, 16, 12), P = hg.attributes.position, gs = (a) => Math.exp(-a * a);
    for (let i = 0; i < P.count; i++) { const x = P.getX(i) / 0.1, y = P.getY(i) / 0.1, z = P.getZ(i) / 0.1, fr = Math.max(0, z);
      let d = gs(x / 0.13) * gs((y + 0.08) / 0.16) * 0.2 * fr      // nose under the skin
        + gs((y - 0.24) / 0.08) * (1 - Math.abs(x) * 0.8) * 0.09 * fr // brow
        - gs((Math.abs(x) - 0.33) / 0.13) * gs((y - 0.1) / 0.1) * 0.11 * fr // where eyes should be
        + gs((Math.abs(x) - 0.48) / 0.15) * gs((y + 0.06) / 0.12) * 0.04 * fr; // cheekbones
      const k = 1 + d; P.setXYZ(i, x * k * 0.1 * 0.9, y * k * 0.1 * (y < 0 ? 1.18 : 1.05), z * k * 0.1); }
    hg.computeVertexNormals(); mesh(hg, skin, 0, 0, 0, head);
    const hb = new THREE.Mesh(new THREE.SphereGeometry(0.107, 12, 8, Math.PI, Math.PI, 0, Math.PI * 0.8), hairM); hb.position.set(0, 0.01, 0.0); head.add(hb);
    const ht = new THREE.Mesh(new THREE.SphereGeometry(0.107, 12, 6, 0, Math.PI, 0, Math.PI * 0.27), hairM); ht.position.set(0, 0.012, 0); head.add(ht);
    blob(hairM, 0.12, 0.075, 0.085, 0, 0.12, -0.05, head); blob(hairM, 0.07, 0.06, 0.07, -0.1, 0.06, -0.05, head); blob(hairM, 0.07, 0.06, 0.07, 0.1, 0.06, -0.05, head); blob(hairM, 0.07, 0.05, 0.09, 0, 0.02, -0.13, head);
    mesh(new THREE.BoxGeometry(0.14, 0.022, 0.02), obiM, 0, 0.1, -0.12, head);
    // arms: posed by endpoints; sleeves hang from the forearm
    const arms = [-1, 1].map(s => ({ s, up: limb(kim, 0.05, 0.045, fig), fo: limb(kim, 0.045, 0.04, fig), hand: blob(skin, 0.03, 0.05, 0.025, 0, 0, 0, fig), sl: mesh(new THREE.BoxGeometry(0.07, 0.42, 0.25), kim, 0, 0, 0, fig) }));
    const POSE = { weep: s => [v(s * 0.18, 1.36, 0), v(s * 0.13, 1.12, 0.2), v(s * 0.04, 1.43, 0.15)], down: s => [v(s * 0.18, 1.36, 0), v(s * 0.24, 1.1, 0.02), v(s * 0.23, 0.86, 0.06)],
      stroke: s => s > 0 ? [v(0.18, 1.36, 0), v(0.16, 1.18, 0.2), v(0.03, 1.47, 0.16)] : POSE.down(s) };
    const tA = new V3(), tB = new V3(), tC = new V3();
    function poseArms(a, b, k) { arms.forEach(A => { const pa = a(A.s), pb = b(A.s); tA.lerpVectors(pa[0], pb[0], k); tB.lerpVectors(pa[1], pb[1], k); tC.lerpVectors(pa[2], pb[2], k);
      setLimb(A.up, tA, tB); setLimb(A.fo, tB, tC); A.hand.position.copy(tC); A.sl.position.set((tB.x + tC.x) / 2 + A.s * 0.02, (tB.y + tC.y) / 2 - 0.2, (tB.z + tC.z) / 2 - 0.02); }); }
    poseArms(POSE.weep, POSE.weep, 0);
    if (cover) { const wood = mat(0x1d1a16, { roughness: 0.8 });
      mesh(new THREE.BoxGeometry(1.7, 0.95, 0.6), wood, 0, 0.475, -0.85, root); mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), wood, -0.82, 1.1, -0.55, root); mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), wood, 0.82, 1.1, -0.55, root);
      mesh(new THREE.BoxGeometry(2.0, 0.06, 1.1), wood, 0, 2.2, -0.85, root);
      for (let i = 0; i < 5; i++) mesh(new THREE.PlaneGeometry(0.3, 0.5), mat(0x3a3936, { side: THREE.DoubleSide }), -0.65 + i * 0.33, 1.9, -0.32, root); }
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 8), new THREE.MeshBasicMaterial({ color: 0xbdb8ae })); lamp.position.set(0.55, 1.9, -0.25); root.add(lamp); lamp.visible = false;
    const traces = new THREE.Group(); traces.visible = false; root.add(traces);
    const cg = new THREE.PlaneGeometry(0.46, 0.34, 5, 4); const cp = cg.attributes.position; for (let i = 0; i < cp.count; i++) cp.setZ(i, (Math.random() - 0.5) * 0.04); cg.computeVertexNormals();
    const cloth = mesh(cg, mat(0x1a1a1c, { side: THREE.DoubleSide, roughness: 0.6 }), 0.1, 0.015, 0.05, traces); cloth.rotation.set(-Math.PI / 2, 0, 0.6);
    let sob = 0;
    return { kind: 'nopperabo', root, focus: v(0, 1.3, 0), viewLocal: 0, jumpDist: 3.0, fallbackDist: 12, pitch: 0.05, waits: true, maxShow: 99,
      light: { pos: v(1.1, 2.4, 0.6), color: 0xd8d3c8, i: 0.9, d: 6 },
      spawn() { fig.visible = true; lamp.visible = true; },
      begin() { fig.visible = true; lamp.visible = true; },
      update(dt, st) {
        if (st.phase === 'wait') { sob += dt; head.rotation.x = 0.4; fig.position.y = Math.max(0, Math.sin(sob * 9)) * 0.006; head.rotation.z = Math.sin(sob * 1.3) * 0.03; return false; }
        if (st.phase === 'show') {
          const t = st.hold ? (st.pose === 'back' ? 0 : 0.95) : st.t;
          fig.rotation.y = Math.PI * (1 - ease(t / 0.9)); head.rotation.x = lerp(0.4, 0.02, ease(t / 0.8)); head.rotation.z = 0;
          if (t < 0.6) poseArms(POSE.weep, POSE.down, ease(t / 0.6)); else poseArms(POSE.down, POSE.stroke, ease((t - 0.7) / 0.4));
          if (st.hold && st.pose === 'back') { fig.position.y = Math.max(0, Math.sin(st.t * 9)) * 0.006; head.rotation.x = 0.4; poseArms(POSE.weep, POSE.weep, 0); }
          if (!st.hold && t > 1.8) return 'exit';
        } else if (st.phase === 'exit') {
          if (st.t < 0.02 && !st.clicked) { st.clicked = true; sfx('nopperabo-click', G.camera.getWorldPosition(new V3()), 0.8); dim(0.97); }
          if (st.t > 0.1) { fig.visible = false; lamp.visible = false; traces.visible = true; st.lightI = 0; }
          if (st.t > 1.6) { undim(0.4); return true; }
        }
        return false;
      },
      sobTick(dt, distance) { if (distance < 22 && distance > 3.4) { this._s = (this._s || 0) - dt; if (this._s < 0) { this._s = 2.2 + Math.random(); sfx('nopperabo-sob', root.localToWorld(v(0, 1.4, 0)), 0.7); } } }
    };
  }

  const MAKERS = { akaname: makeAkaname, 'zashiki-warashi': makeZashiki, mokumokuren: makeMokumokuren, 'chochin-obake': makeChochin, nopperabo: makeNopperabo };

  /* =====================================================================================
   * MANAGER
   * ===================================================================================== */
  const Y = { G: [], active: null, done: {}, lastEnd: -999, lastHunter: -999, bell: false, shift: false, started: false, light: null, jump: null };
  const has = name => G.modules.some(m => m.name === name && m.ok);
  const camPos = new V3(), camFwd = new V3(), tmp = new V3();

  function place(c, pos, facing) { c.root.position.copy(pos); c.root.rotation.y = facing; c.root.updateMatrixWorld(true); }
  function facingFor(c, pos, viewerPos) { return Math.atan2(viewerPos.x - pos.x, viewerPos.z - pos.z) - c.viewLocal; }
  function angleOff(worldPt) { tmp.subVectors(worldPt, camPos); const d = tmp.length(); return { a: Math.acos(clamp(tmp.dot(camFwd) / (d || 1), -1, 1)) / D2R, d }; }
  function occluded(worldPt) {
    const cols = G.world && G.world.colliders; if (!cols || !cols.length) return false;
    tmp.subVectors(worldPt, camPos); const len = tmp.length(); const ray = new THREE.Ray(camPos.clone(), tmp.normalize()); const hit = new V3();
    for (const b of cols) { if (!b || !b.isBox3 || b.containsPoint(camPos)) continue; if (ray.intersectBox(b, hit) && hit.distanceTo(camPos) < len - 0.6) return true; }
    return false;
  }
  function gate(kind) {
    if (Y.done[kind] || Y.bell || Y.shift) return false;
    const m = G.monster || {}; if (m.state === 'hunt' || m.state === 'search') return false;
    if (G.time - Y.lastHunter < 20) return false;
    const missionOn = has('mission');
    if (missionOn) {
      const ph = String((G.mission && G.mission.phase) || '');
      if (!Y.started && /^(boot|title|intro)?$/.test(ph)) return false;
      if (/shift|castle|train|ending|escape|over|caught|dead/i.test(ph)) return false;
      if (((G.mission && G.mission.intel) || 0) < MIN_INTEL[kind]) return false;
      if (G.time - Y.lastEnd < 45) return false;
    } else if (G.time - Y.lastEnd < 20 || G.time < 4 || !Y.started) return false;
    return true;
  }
  function spotsFor(kind) { const s = G.world && G.world.yokaiSpots; return Array.isArray(s) ? s.filter(p => p && p.kind === kind && p.pos) : []; }
  function hasSpots() { const s = G.world && G.world.yokaiSpots; return Array.isArray(s) && s.length > 0; }

  function build(kind, pos, facing, cover) {
    const c = MAKERS[kind](cover); place(c, pos, facing); G.scene.add(c.root);
    const g = { kind, c, phase: 'wait', t: 0, pre: 0, hold: false, spawned: false, lightI: 0 };
    Y.G.push(g); return g;
  }

  function startGlimpse(g) {
    g.phase = 'pre'; g.t = 0; Y.active = g;
    const fw = g.c.root.localToWorld(g.c.focus.clone());
    sfx(g.kind + '-pre', fw, 0.9);
  }
  function showGlimpse(g) {
    g.phase = 'show'; g.t = 0; g.lightI = g.kind === 'chochin-obake' ? 0 : 1;
    if (g.c.begin) g.c.begin(g);
    const d = { kind: g.kind }; if (g.kind === 'nopperabo') d.lightOut = 1.5; G.emit('yokai', d);
  }
  function exitGlimpse(g) {
    if (g.phase !== 'show') return; g.phase = 'exit'; g.t = 0;
    if (g.c.leave) g.c.leave(g);
    const post = g.kind + '-post'; if (SFX[post]) sfx(post, g.c.root.localToWorld(g.c.focus.clone()), 0.8);
    if (g.kind === 'chochin-obake') sfx('chochin-obake-breath', g.c.root.localToWorld(g.c.focus.clone()), 0.6);
  }
  function finish(g) { g.phase = 'done'; Y.done[g.kind] = true; Y.lastEnd = G.time; if (Y.active === g) Y.active = null; g.lightI = 0; }

  /* fallback spot in front of the camera, at angleDeg off the view centre */
  function fallbackSpot(kind, angleDeg, dist) {
    const yaw = Math.atan2(camFwd.x, camFwd.z);
    for (const s of [1, -1]) for (const dd of [dist, dist * 0.75, dist * 1.3]) {
      const a = yaw + s * angleDeg * D2R, p = new V3(camPos.x + Math.sin(a) * dd, (G.player && G.player.pos ? G.player.pos.y : 0), camPos.z + Math.cos(a) * dd);
      const w = G.world && G.world.walkable; if (w && !w(p.x, p.z, 0.5)) continue;
      if (occluded(p.clone().setY(p.y + 1))) continue; return p;
    }
    return null;
  }

  function setLight(g) {
    const L = Y.light; if (!L) return;
    if (!g || g.phase === 'done' || (g.phase === 'wait' && !(g.kind === 'nopperabo' && g.spawned))) { L.intensity = Math.max(0, L.intensity - G.dt * 6); return; }
    const c = g.c.light; L.position.copy(g.c.root.localToWorld(c.pos.clone())); L.color.setHex(c.color); L.distance = c.d;
    const want = g.kind === 'chochin-obake' ? (g.lightI ? 1.2 : 0) : (g.phase === 'exit' ? 0 : c.i);
    L.intensity = g.hold ? want : g.kind === 'chochin-obake' ? want : lerp(L.intensity, want, 1 - Math.exp(-G.dt * 12));
  }

  /* ---------- test environment when the level/player modules are absent ---------- */
  let ownCamera = false;
  function testEnv() {
    if (has('level')) return;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat(0x1e1e20, { roughness: 0.35, metalness: 0.1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; G.scene.add(ground);
    G.scene.add(new THREE.HemisphereLight(0x8d939e, 0x0b0b0b, 0.8));
    const moon = new THREE.DirectionalLight(0x9aa0aa, 0.35); moon.position.set(-6, 12, 4); G.scene.add(moon);
    if (!has('player')) { ownCamera = true; const fl = new THREE.SpotLight(0xe8e6e1, 1.5, 28, 0.5, 0.6, 1.4); fl.position.set(0.25, -0.2, 0); fl.target.position.set(0, -0.3, -5); G.camera.add(fl); G.camera.add(fl.target); }
    if (!has('mission') && G.ui) { G.ui.fade(0); }
  }

  function setupJump(kind) {
    const hp = new URLSearchParams(location.hash.slice(1)), side = hp.get('yside') === 'l' ? 1 : -1;
    const proto = MAKERS[kind](false); // read its numbers
    const off = hp.has('ycen') ? 0 : (kind === 'nopperabo' ? 6 : kind === 'mokumokuren' ? 30 : 32) * D2R * side;
    const pose = hp.get('ypose') || '';
    const dist = +(hp.get('ydist') || 0) || (kind === 'nopperabo' && pose === 'back' ? 8 : proto.jumpDist);
    const P = G.player; let spot = spotsFor(kind)[0], g;
    if (spot) {
      const view = (spot.facing || 0) + proto.viewLocal;
      P.pos.set(spot.pos.x + Math.sin(view) * dist, spot.pos.y || 0, spot.pos.z + Math.cos(view) * dist);
      P.yaw = view + off; P.pitch = proto.pitch; g = Y.G.find(q => q.kind === kind) || build(kind, spot.pos.clone(), spot.facing || 0, false);
    } else {
      if (!has('level') || !has('player')) P.pos.set(0, 0, 0);
      P.yaw = P.yaw || 0; P.pitch = proto.pitch;
      const fa = P.yaw + Math.PI - off; // world angle from player to the creature
      const pos = new V3(P.pos.x + Math.sin(fa) * dist, P.pos.y, P.pos.z + Math.cos(fa) * dist);
      g = build(kind, pos, facingFor(proto, pos, P.pos), !has('level'));
    }
    g.hold = true; g.pose = pose; if (g.c.spawn) g.c.spawn(); showGlimpse(g); Y.active = g;
    if (G.ui && !has('mission')) { const el = fadeEl(); if (el) { el.style.transition = "none"; el.style.opacity = 0; } }
  }

  G.register('yokai', {
    order: 40,
    init() {
      Y.light = new THREE.PointLight(0xffffff, 0, 4, 2); G.scene.add(Y.light);
      G.on('start', () => { Y.started = true; }); G.on('begin', () => { Y.started = true; });
      G.on('monster-stage', () => { Y.lastHunter = G.time; });
      G.on('bell', () => { Y.bell = true; });
      G.on('shift-start', () => { Y.shift = true; });
      G.on('shift-end', () => { Y.shift = false; Y.bell = true; });
      testEnv();
      if (G.jump && /^yokai-/.test(G.jump)) { const k = G.jump.slice(6); if (MAKERS[k]) Y.jump = k; }
      // pre-build creatures at level spots (one per kind; first spot wins)
      if (hasSpots()) KINDS.forEach(k => { const s = spotsFor(k)[0]; if (s) build(k, s.pos.clone(), s.facing || 0, false); });
    },
    update(dt) {
      if (Y.jump) { setupJump(Y.jump); Y.jump = null; }
      if (ownCamera) { const P = G.player; G.camera.position.set(P.pos.x, P.pos.y + 1.6, P.pos.z); G.camera.rotation.set(P.pitch, P.yaw, 0); }
      G.camera.updateMatrixWorld(); G.camera.getWorldPosition(camPos); G.camera.getWorldDirection(camFwd);
      const m = G.monster || {}; if (m.state === 'hunt' || m.state === 'search') Y.lastHunter = G.time;

      // fallback: no authored spots, so place the next creature near the player when its gate opens
      if (!hasSpots() && !Y.active && !Y.G.some(g => g.hold)) {
        const kind = KINDS.find(k => !Y.done[k] && !Y.G.some(g => g.kind === k));
        const hiddenMoku = G.player && G.player.hidden && !Y.done.mokumokuren && !Y.G.some(g => g.kind === 'mokumokuren');
        const k = hiddenMoku && gate('mokumokuren') ? 'mokumokuren' : kind;
        if (k && gate(k)) {
          const proto = MAKERS[k](false);
          const p = fallbackSpot(k, k === 'nopperabo' ? 95 : 40, proto.fallbackDist);
          if (p) { const g = build(k, p, facingFor(proto, p, camPos), !has('level')); if (k === 'nopperabo') { g.spawned = true; g.c.spawn(); } }
        }
      }

      for (const g of Y.G) {
        if (g.phase === 'done') { g.c.update(dt, g); continue; }
        g.t += dt;
        const fw = g.c.root.localToWorld(g.c.focus.clone()), ao = angleOff(fw);
        if (g.phase === 'wait') {
          if (g.kind === 'nopperabo') {
            if (!g.spawned) { if (gate('nopperabo') && (ao.a > 75 || ao.d > 25) && !Y.active) { g.spawned = true; g.c.spawn(); } }
            else { g.c.update(dt, g); g.c.sobTick(dt, ao.d); if (ao.d < 3.2 && !Y.active) { Y.active = g; showGlimpse(g); } }
            continue;
          }
          const hiddenOK = g.kind === 'mokumokuren' && G.player && G.player.hidden;
          if (!Y.active && gate(g.kind) && ao.d > (g.c.noDistanceVanish ? 2 : 6.5) && ao.d < 24 && ((ao.a > 25 && ao.a < 60) || (hiddenOK && ao.a > 22 && ao.a < 80)) && !occluded(fw)) startGlimpse(g);
          g.c.update(dt, g);
          continue;
        }
        if (g.phase === 'pre') { if (g.t > 0.35) showGlimpse(g); g.c.update(dt, g); continue; }
        if (g.phase === 'show' && !g.hold) {
          const looked = ao.a < 15, near = !g.c.noDistanceVanish && !g.c.waits && ao.d < 6, hunted = m.state === 'hunt';
          if ((looked && !g.c.waits) || near || hunted || g.t > g.c.maxShow) exitGlimpse(g);
          if (g.kind === 'mokumokuren' && ao.a > 70 && g.t > 2) exitGlimpse(g);
        }
        const r = g.c.update(dt, g);
        if (r === 'exit') exitGlimpse(g); else if (r === true && g.phase === 'exit') finish(g);
      }
      setLight(Y.active || Y.G.find(g => g.kind === 'nopperabo' && g.spawned && g.phase === 'wait'));
    }
  });
  G.yokaiDebug = Y; // read-only inspection hook for capture/debugging
})();
