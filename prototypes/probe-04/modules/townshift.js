/* townshift.js: the town foreshadows the castle (wave 3, H18 + director's "Also bleed into town"). OWNER: shift builder. order 55.
 *
 * Before the bell, three brief, eerie moving-floor moments, each played by the same unseen koto as the castle
 * (a quiet string sounds first, then the floor moves on the pluck). Each fires once, by proximity + mission phase,
 * lasts 3-5 s, never blocks the critical path, and never traps the player.
 *   arcade   the paving behind you draws out like the castle's long hall (a low bent string), then snaps back on a high pluck.
 *            Phases drop1..drop3. Fires when you walk the arcade with a stretch of it at your back.
 *   noodle   the tatami square inside the noodle shop turns 90 degrees in three 30-degree ratchet steps, with you on it
 *            (you are carried round with the floor). Phases drop1..drop3, on the hunt route arcade -> yokocho.
 *   yokocho  a paving slab a few metres ahead of you drops into a black shaft, hangs, and rises back. It covers only half
 *            the lane; you are pushed out of the hole, never into it; it never drops while you stand on it. Phases hunt1..drop3.
 * Placement: G.world.landmarks (arcadeSouth/North, yokochoSouth/North, noodleDoor/Back), guarded; a moment whose points or
 * floor are missing is skipped. Safe with no level, no mission (then any phase counts), no player, no audio.
 * Contract use: reads G.world, G.mission.phase, G.player (pos, yaw). Moves the player only through G.shift.townCarry
 * (worldshift.js routes G.shift.carry to it while no shift runs; player.js applies carry each frame). Emits 'koto'
 * {section:'town-<id>'} on each pluck (audio.js ducks its own koto layer). Emits 'teleport'/'start' only for capture hooks.
 * H15: all geometry and materials are built at init and shader-warmed on 'ready'; adds no lights.
 * Capture hooks: #jump=townshift-arcade | townshift-noodle | townshift-yokocho (stand there and play it; &t=SECONDS freezes
 *   the moment at that time for a screenshot).
 */
(function () {
  'use strict';
  const G = window.G, THREE = window.THREE, WS = window.WorldShift;
  if (!G || !THREE) return;
  const HP = new URLSearchParams(location.hash.slice(1));
  const A = WS && WS.audio;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const easeOut = t => { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };
  const easeIn = t => { t = clamp(t, 0, 1); return t * t * t; };
  const hasMod = n => G.modules.some(m => m.name === n && m.ok);
  const rm = () => HP.get('rm') === '1' || !!G.reduceMotion || !!(WS && WS.reduceMotion);
  const RED = WS ? WS.PAL.red : 0xa3101a;

  /* ---------------- sound: the castle's koto, heard in town ---------------- */
  function bind() { try { if (A && A.bind && G.audioCtx) A.bind(G.audioCtx, .6); } catch (e) { /* silent */ } }
  const sfx = {
    pluck(i, o) { try { bind(); if (A && A.ctx) A.pluck(i, o); } catch (e) { /* silent */ } },
    clack(v) { try { bind(); if (A && A.ctx) A.clack(v); } catch (e) { /* silent */ } },
    knock(v) { try { bind(); if (A && A.ctx) A.knock(v); } catch (e) { /* silent */ } }
  };
  let kotoN = 0;
  const koto = id => G.emit('koto', { beat: kotoN++, rest: false, bar: 0, inBar: 0, section: 'town-' + id, bpm: 80 });

  /* ---------------- materials (built once, at init) ---------------- */
  const root = new THREE.Group(); root.name = 'townshift';
  let MAT = null;
  function canvasTex(w, h, draw, rx, ry) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx || 1, ry || 1); t.anisotropy = 4; return t;
  }
  function paving(g, w, h) { // worn grey arcade tiles, 4 x 4 per texture
    g.fillStyle = '#3d3c3a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const v = 52 + ((i * 7 + j * 13) % 9) * 2; g.fillStyle = 'rgb(' + v + ',' + v + ',' + (v - 2) + ')'; g.fillRect(i * w / 4 + 3, j * h / 4 + 3, w / 4 - 6, h / 4 - 6); }
    for (let k = 0; k < 900; k++) { g.globalAlpha = .25 * Math.random(); g.fillStyle = Math.random() < .5 ? '#222' : '#5a5956'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.globalAlpha = 1;
  }
  function makeMaterials() {
    const std = o => new THREE.MeshStandardMaterial(Object.assign({ roughness: .9, metalness: 0 }, o));
    const tat = WS ? WS.tex('tatami', 1, 2) : null;
    MAT = {
      tile: std({ map: canvasTex(256, 256, paving, 3, 1), roughness: .75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      slabSide: std({ color: 0x1c1b1a }),
      void: new THREE.MeshBasicMaterial({ color: 0x020202, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      pit: new THREE.MeshStandardMaterial({ color: 0x3a3936, roughness: 1, side: THREE.BackSide }),
      red: new THREE.MeshBasicMaterial({ color: RED }),
      tatami: std(tat ? { map: tat, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } : { color: 0x76756f }),
      tatamiEdge: std({ color: 0x0d0d0d }),
      cushion: std({ color: 0x5a0a0e }),
      paper: new THREE.MeshBasicMaterial({ color: 0xe9e4d6 }),
      cap: new THREE.MeshBasicMaterial({ color: 0x0a0a0a }),
      // the shaft's mouth: wipes the floor's depth inside the opening so the shaft below the street can be seen through it
      // (no stencil in the post-process target). Drawn after the town (renderOrder), only while the slab is down.
      punch: new THREE.ShaderMaterial({
        vertexShader: 'void main(){ vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); p.z = p.w * 0.99999; gl_Position = p; }',
        fragmentShader: 'void main(){ gl_FragColor = vec4(0.0); }',
        depthFunc: THREE.AlwaysDepth, depthWrite: true, colorWrite: false
      })
    };
  }
  const box = (p, w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x || 0, y || 0, z || 0); p.add(o); return o; };
  function lantern(p, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); box(g, .36, .46, .36, MAT.paper, 0, 0, 0); box(g, .26, .06, .26, MAT.cap, 0, .26, 0); box(g, .26, .06, .26, MAT.cap, 0, -.26, 0); box(g, .015, .6, .015, MAT.cap, 0, .55, 0); return g; }

  /* ---------------- frames from landmarks ---------------- */
  const LM = n => { const L = G.world && G.world.landmarks; const v = L && L[n]; return v && isFinite(v.x) && isFinite(v.z) ? v : null; };
  const H = (x, z) => { try { const h = G.world && typeof G.world.heightAt === 'function' ? G.world.heightAt(x, z) : 0; return isFinite(h) ? h : 0; } catch (e) { return 0; } };
  const WALK = (x, z, r) => { try { const w = G.world && G.world.walkable; return typeof w === 'function' ? !!w(x, z, r == null ? .3 : r) : true; } catch (e) { return true; } };
  /** a local frame: origin o, axis d (unit, xz). u = along d, v = to the right of d. Group built along local -z. */
  function frame(o, d) {
    const yaw = Math.atan2(-d.x, -d.z), rx = -d.z, rz = d.x;
    return { o, d, yaw, toLocal(x, z) { const px = x - o.x, pz = z - o.z; return { u: px * d.x + pz * d.z, v: px * rx + pz * rz }; },
      toWorld(u, v) { return { x: o.x + d.x * u + rx * v, z: o.z + d.z * u + rz * v }; } };
  }
  function axis(a, b) { const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l, len: l }; }
  const pp = () => G.player && G.player.pos && isFinite(G.player.pos.x) ? G.player.pos : null;
  const fwd = () => { const y = G.player && isFinite(G.player.yaw) ? G.player.yaw : 0; return { x: -Math.sin(y), z: -Math.cos(y) }; };

  /* ======================================================================
     ARCADE: the floor behind you draws out (the castle's long hall, in miniature).
     ====================================================================== */
  function buildArcade() {
    const S = LM('arcadeSouth'), N = LM('arcadeNorth'); if (!S || !N) return null;
    const ax = axis(S, N); if (ax.len < 20) return null;
    const F = frame({ x: S.x, z: S.z }, ax);
    const U0 = 1.5, NR = 10, RL = 1.6, U1 = U0 + NR * RL, W = 5.0;
    if (!WALK(F.toWorld(U0 + 2, 0).x, F.toWorld(U0 + 2, 0).z) || !WALK(F.toWorld(U1 - 2, 0).x, F.toWorld(U1 - 2, 0).z)) return null;
    const g = new THREE.Group(); g.position.set(S.x, H(S.x, S.z), S.z); g.rotation.y = F.yaw; root.add(g);
    const base = box(g, W + .1, .01, 1, MAT.void, 0, .022, 0);
    const rows = [];
    for (let i = 0; i < NR; i++) { const u = U0 + (i + .5) * RL; rows.push({ m: box(g, W, .04, RL - .04, MAT.tile, 0, .03, -u), u }); }
    const lans = [4.5, 9.5, 14.5].map(u => ({ u, g: lantern(g, 0, 3.7, -u) }));
    const mo = { id: 'arcade', g, F, dur: 4.7, phases: ['drop1', 'hunt1', 'drop2', 'drop3'], anchor: U1, sgn: -1, smax: 2,
      view() { const p = F.toWorld(12, .3); return { x: p.x, z: p.z, yaw: Math.atan2(F.d.x, F.d.z) }; }, // looking back south, at it
      cues: [[0, () => { sfx.pluck(0, { vol: .6, bend: .72, bendTime: 3.2 }); koto('arcade'); }],
             [4.0, () => { sfx.pluck(10, { vol: .6 }); sfx.clack(.55); koto('arcade'); }]],
      trigger(p, f) {
        const q = F.toLocal(p.x, p.z); if (Math.abs(q.v) > 2.8 || q.u < 3 || q.u > U1 + 8) return false;
        const along = f.x * F.d.x + f.z * F.d.z; if (Math.abs(along) < .6) return false;
        this.sgn = along > 0 ? -1 : 1; this.anchor = clamp(q.u, U0, U1);
        const behind = this.sgn < 0 ? this.anchor - U0 : U1 - this.anchor; if (behind < 5) return false;
        this.smax = 1 + Math.min(rm() ? .5 : 1.4, 9 / behind);
        return true;
      },
      force(sgn, anchor) { this.sgn = sgn; this.anchor = anchor; const behind = sgn < 0 ? anchor - U0 : U1 - anchor; this.smax = 1 + Math.min(rm() ? .5 : 1.4, 9 / Math.max(1, behind)); },
      apply(t) {
        let s = 1;
        if (t > .6 && t < 3.4) s = 1 + (this.smax - 1) * smooth((t - .6) / 2.8);
        else if (t >= 3.4 && t < 4.0) s = this.smax;
        else if (t >= 4.0) s = this.smax + (1 - this.smax) * easeOut((t - 4.0) / .3);
        const map = u => { const r = u - this.anchor; return r * this.sgn > 0 ? this.anchor + r * s : u; };
        let lo = 1e9, hi = -1e9;
        for (const r of rows) { const u = map(r.u); r.m.position.z = -u; r.m.scale.z = 1; lo = Math.min(lo, u - RL / 2); hi = Math.max(hi, u + RL / 2); }
        base.scale.z = hi - lo; base.position.z = -(lo + hi) / 2;
        for (const l of lans) { l.g.position.z = -map(l.u); l.g.rotation.x = (s - 1) * .12 * this.sgn; }
      },
      carry: null
    };
    return mo;
  }

  /* ======================================================================
     NOODLE SHOP: the tatami square turns once, in three ratchet steps, with you on it.
     ====================================================================== */
  function buildNoodle() {
    const D = LM('noodleDoor'), Bk = LM('noodleBack'); if (!D || !Bk) return null;
    const ax = axis(D, Bk); if (ax.len < 4) return null;
    const F = frame({ x: D.x, z: D.z }, ax), C = F.toWorld(1.95, 0), HS = 1.35;
    if (!WALK(C.x, C.z, .3)) return null;
    const g = new THREE.Group(); g.position.set(C.x, H(C.x, C.z), C.z); g.rotation.y = F.yaw; root.add(g);
    const spin = new THREE.Group(); g.add(spin);
    // four mats in a pinwheel round a half mat (the 4.5-mat room), black-bordered
    const mats = [[-1.35, .45, -1.35, -.45], [.45, 1.35, -1.35, .45], [-.45, 1.35, .45, 1.35], [-1.35, -.45, -.45, 1.35], [-.45, .45, -.45, .45]];
    for (const [x0, x1, z0, z1] of mats) {
      const w = x1 - x0, d = z1 - z0, m = box(spin, w - .03, .05, d - .03, MAT.tatami, (x0 + x1) / 2, .028, (z0 + z1) / 2);
      if (w > d) m.rotation.y = Math.PI / 2, m.scale.set(d / w, 1, w / d); // keep the weave running along each mat
      box(spin, w, .045, d, MAT.tatamiEdge, (x0 + x1) / 2, .022, (z0 + z1) / 2);
    }
    const cush = box(spin, .55, .1, .6, MAT.cushion, -.6, .1, -.9); cush.rotation.y = .3;
    let ang = 0;
    const steps = [[.7, 5], [1.45, 6], [2.2, 8]]; // [time, string]
    const angAt = t => { let a = 0; for (const [ts] of steps) a += (Math.PI / 6) * easeOut((t - ts) / .38); return a; };
    const mo = { id: 'noodle', g, dur: 3.0, phases: ['drop1', 'hunt1', 'drop2', 'drop3'],
      view() { const p = F.toWorld(-1.3, 0); return { x: p.x, z: p.z, yaw: F.yaw, pitch: -.45 }; },
      cues: [[0, () => { sfx.pluck(9, { vol: .18 }); sfx.knock(.15); }]].concat(steps.map(([ts, s]) => [ts, () => { sfx.pluck(s, { vol: .5 }); sfx.clack(.4); koto('noodle'); }])),
      trigger(p) { return Math.hypot(p.x - C.x, p.z - C.z) < 1.1; },
      apply(t) { ang = rm() ? 0 : angAt(t); spin.rotation.y = ang; },
      prev: 0,
      carry(x, z) { // rotate whoever stands on the square with it
        const a = ang, da = a - this.prev; this.prev = a; if (!da) return null;
        const px = x - C.x, pz = z - C.z;
        // inside the square at its current angle (local frame of the spin group)
        const ca = Math.cos(F.yaw + a), sa = Math.sin(F.yaw + a), lx = px * ca - pz * sa, lz = px * sa + pz * ca;
        if (Math.abs(lx) > HS + .1 || Math.abs(lz) > HS + .1) return null;
        const c = Math.cos(da), s = Math.sin(da), nx = px * c + pz * s, nz = -px * s + pz * c; // rotation.y by +da
        const tx = C.x + nx, tz = C.z + nz; if (!WALK(tx, tz, .3)) return null;
        return { dx: tx - x, dz: tz - z };
      }
    };
    return mo;
  }

  /* ======================================================================
     YOKOCHO: a slab ahead of you drops into a shaft and rises again.
     ====================================================================== */
  function buildYokocho() {
    const S = LM('yokochoSouth'), N = LM('yokochoNorth'); if (!S || !N) return null;
    const ax = axis(S, N); if (ax.len < 16) return null;
    const F = frame({ x: S.x, z: S.z }, ax), SW = 1.3, SL = 2.4, DEPTH = 3.2;
    // find a spot where the slab and a free lane beside it are both floor
    let at = null;
    search: for (const k of [.3, .27, .33, .24, .36, .2, .4, .45, .5, .55]) for (const v of [-.5, .5, -.35, .35]) {
      const u = ax.len * k, ok = [[-SW / 2, -SL / 2], [SW / 2, -SL / 2], [-SW / 2, SL / 2], [SW / 2, SL / 2], [0, 0]].every(([a, b]) => { const p = F.toWorld(u + b, v + a); return WALK(p.x, p.z, 0); });
      const lane = F.toWorld(u, v - Math.sign(v) * (SW / 2 + .55)), laneOk = WALK(lane.x, lane.z, .25);
      if (ok && laneOk) { at = { u, v }; break search; }
    }
    if (!at) return null;
    const C = F.toWorld(at.u, at.v);
    const g = new THREE.Group(); g.position.set(C.x, H(C.x, C.z), C.z); g.rotation.y = F.yaw; root.add(g);
    // the shaft (hidden until the slab drops): inner walls, a red rim, the depth-punch over its mouth
    const shaft = new THREE.Group(); shaft.visible = false; g.add(shaft);
    const walls = box(shaft, SW, DEPTH, SL, MAT.pit, 0, -DEPTH / 2 + .01, 0); walls.renderOrder = 6;
    const punch = new THREE.Mesh(new THREE.PlaneGeometry(SW - .02, SL - .02), MAT.punch); punch.rotation.x = -Math.PI / 2; punch.position.y = .02; punch.renderOrder = 5; shaft.add(punch);
    for (const s of [-1, 1]) { box(shaft, SW + .16, .03, .08, MAT.red, 0, .03, s * (SL / 2 + .04)).renderOrder = 7; box(shaft, .08, .03, SL + .16, MAT.red, s * (SW / 2 + .04), .03, 0).renderOrder = 7; }
    const slab = new THREE.Group(); g.add(slab);
    const top = box(slab, SW - .04, .05, SL - .04, MAT.tile, 0, .025, 0); top.renderOrder = 6;
    const side = box(slab, SW - .06, .4, SL - .06, MAT.slabSide, 0, -.2, 0); side.renderOrder = 6;
    let down = false, aborted = false;
    const inside = (x, z, m) => { const q = F.toLocal(x, z); return Math.abs(q.u - at.u) <= SL / 2 + m && Math.abs(q.v - at.v) <= SW / 2 + m; };
    const mo = { id: 'yokocho', g, dur: 4.6, phases: ['hunt1', 'drop2', 'drop3'],
      view() { const p = F.toWorld(at.u - 4.5, at.v * .3); return { x: p.x, z: p.z, yaw: F.yaw, pitch: -.3 }; },
      cues: [[0, () => { sfx.knock(.25); sfx.pluck(1, { vol: .15 }); }],
             [.8, () => { const p = pp(); aborted = !!(p && inside(p.x, p.z, .25)); sfx.pluck(1, { vol: .6, bend: .8, bendTime: .6 }); sfx.clack(.5); koto('yokocho'); }],
             [1.35, () => { if (!aborted) sfx.knock(.5); }],
             [3.4, () => { sfx.pluck(5, { vol: .5 }); koto('yokocho'); }],
             [4.3, () => { sfx.clack(.5); }]],
      trigger(p, f) {
        const q = F.toLocal(p.x, p.z), du = at.u - q.u, dv = at.v - q.v, dist = Math.hypot(du, dv);
        if (dist < 3 || dist > 7 || Math.abs(dv) > 2.5) return false;
        const toward = (f.x * F.d.x + f.z * F.d.z) * Math.sign(du); return toward > .6;
      },
      apply(t) {
        let y = 0;
        if (aborted) y = t > .8 && t < 1.1 ? -.04 : 0; // someone stood on it: it only shudders
        else if (t > .8 && t < 3.4) y = -1.6 * easeIn((t - .8) / .5);
        else if (t >= 3.4 && t < 4.3) y = -1.6 * (1 - smooth((t - 3.4) / .9));
        if (y < -1.6) y = -1.6;
        slab.position.y = y; down = y < -.03; shaft.visible = down;
      },
      reset() { aborted = false; down = false; shaft.visible = false; slab.position.y = 0; },
      carry(x, z, dt) { // pushed out of the hole, toward the free lane; never into it
        if (!down || !inside(x, z, .35)) return null;
        const q = F.toLocal(x, z), sp = 3.6 * (dt || G.dt || 1 / 60), dir = -Math.sign(at.v) || 1;
        let tgt = F.toWorld(q.u, q.v + dir * sp);
        if (!WALK(tgt.x, tgt.z, .3)) tgt = F.toWorld(q.u + (q.u < at.u ? -sp : sp), q.v); // else back out the way you came
        return { dx: tgt.x - x, dz: tgt.z - z };
      }
    };
    return mo;
  }

  /* ---------------- runner ---------------- */
  const moments = [];
  let running = null, frozen = false;
  function phaseOk(m) {
    if (!hasMod('mission')) return true;
    const ph = G.mission && G.mission.phase; return m.phases.indexOf(ph) >= 0;
  }
  function begin(m) { running = m; m.state = 'run'; m.t = 0; m.ci = 0; m.prev = 0; if (m.reset) m.reset(); }
  function tick(m, dt) {
    m.t += dt;
    while (m.ci < m.cues.length && m.t >= m.cues[m.ci][0]) { try { m.cues[m.ci][1](); } catch (e) { /* silent */ } m.ci++; }
    m.apply(Math.min(m.t, m.dur));
    if (m.t >= m.dur) { m.apply(m.dur); m.state = 'done'; running = null; }
  }
  // worldshift.js normally owns G.shift and routes carry here; without it, a minimal stand-in does the same
  G.shift = G.shift || { active: false, walkable: () => true, carry: (x, z, dt) => G.shift.townCarry ? G.shift.townCarry(x, z, dt) : null, fov: null };
  G.shift.townCarry = (x, z, dt) => { const m = running; if (!m || !m.carry || frozen) return null; try { return m.carry(x, z, dt); } catch (e) { return null; } };

  function hook() {
    const j = G.jump || ''; if (j.indexOf('townshift-') !== 0) return;
    const m = moments.find(o => o.id === j.slice(10)); if (!m) { console.warn('[townshift] no such moment (or its place is missing): ' + j); return; }
    if (G.ui) G.ui.fade(0); G.emit('start');
    const v = m.view(); const y = H(v.x, v.z);
    if (hasMod('player')) G.emit('teleport', { pos: new THREE.Vector3(v.x, y, v.z), yaw: v.yaw, pitch: v.pitch || 0 });
    else { G.camera.position.set(v.x, y + 1.6, v.z); G.camera.rotation.set(v.pitch || 0, v.yaw, 0); }
    if (m.force) m.force(-1, 12); // the arcade: stretch the part we are looking at
    const T = parseFloat(HP.get('t'));
    if (isFinite(T)) { begin(m); m.ci = m.cues.length; m.cues.forEach(c => { if (c[0] <= T) try { c[1](); } catch (e) { /* silent */ } }); m.t = T; m.apply(T); frozen = true; }
    else setTimeout(() => begin(m), 1200);
  }

  G.register('townshift', {
    order: 55,
    init() {
      makeMaterials();
      G.scene.add(root);
      G.on('ready', () => {
        // the level has written G.world by now (its init ran first); place the moments
        for (const b of [buildArcade, buildNoodle, buildYokocho]) { try { const m = b(); if (m) { m.state = 'idle'; moments.push(m); m.apply(0); } } catch (e) { console.warn('[townshift] moment skipped', e); } }
        if (G.fx && typeof G.fx.patch === 'function') { try { G.fx.patch(root); } catch (e) { /* unpatched is fine */ } }
        // H15: compile every material now, with the shafts shown, so nothing compiles mid-play
        try { const sh = []; root.traverse(o => { if (!o.visible) { sh.push(o); o.visible = true; } }); G.renderer.compile(G.scene, G.camera); sh.forEach(o => { o.visible = false; }); } catch (e) { /* compile lazily */ }
        console.log('[townshift] moments: ' + (moments.map(m => m.id).join(', ') || 'none (no level points)'));
        hook();
      });
    },
    update(dt) {
      if (frozen) return;
      if (G.shift && G.shift.active) return;
      if (running) { tick(running, dt); return; }
      const p = pp(); if (!p) return;
      if (G.player && G.player.hidden) return;
      const f = fwd();
      for (const m of moments) {
        // draw calls: only the moments near the player are drawn
        const d = Math.hypot(p.x - m.g.position.x, p.z - m.g.position.z); m.g.visible = d < 45;
        if (m.state !== 'idle' || !phaseOk(m)) continue;
        if (m.trigger(p, f)) { begin(m); break; }
      }
    }
  });
})();
