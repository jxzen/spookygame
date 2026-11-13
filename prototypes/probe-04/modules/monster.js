/* monster.js: Kagenui, the shadow-stitched onryo (W2-MONSTER). OWNER: B-monster. register 'monster', order 30.
 * Writes G.monster only. Reads (all guarded): G.player, G.world (colliders, hideSpots, walkable, nav, lights), G.fx, G.shift, G.audioCtx.
 *
 * The ladder (G.monster.stage, event 'monster-stage' {stage}):
 *   0 dormant · 1 sound only · 2 trace (wet handprints, red thread, the rain hangs, lamps die as something unseen passes)
 *   3 far glimpse (a black shape at ~35 m walking away) · 4 shadow / partial (peeks round corners) + the hunt AI
 *   5 full reveal (she unfolds under a red light; 'monster-reveal'), then hunts.
 * Advances on 'intel' {n}, 'power-cut', 'bell', or a time fallback. Stages 0-3 never hunt.
 * AI (stage >= 4): stalk / search / hunt / retreat on G.world.nav (A*), or direct steering on open ground. No teleports.
 * Grab: within 1.2 m (2.0 m if the player walks into her): Lunge, 'monster-grab' {pos}, then she backs off 15-20 m and pauses.
 * Extra API for others: G.monster.lightProximity(vec3) -> 0..1 (pass it to HorrorFX.addFlicker proximity),
 *   G.monster.setStage(n), G.monster.reveal(). Capture: #jump=monster-peek, #jump=monster-hunt, #jump=monster-ai, #jump=monster-glimpse, #jump=monster-trace.
 */
(function () {
  'use strict';
  const G = window.G; if (!G) return;
  const THREE = G.THREE;
  const V3 = THREE.Vector3;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const log = (...a) => console.info('[monster]', ...a);

  /* ---------------- tuning ---------------- */
  const T = {
    speed: { stalk: 1.3, investigate: 1.8, search: 1.0, hunt: 4.6, retreat: 3.0, backoff: 2.6 },
    sight: { fov: 70 * Math.PI / 180, range: 14, lit: 20, dark: 6 },
    hear: { loud: 12, walk: 4 },
    grab: 1.2, block: 2.0,
    lightFlicker: 10, lightDie: 4.5, rainStop: 8,
    menace: 40, valveRest: [20, 30],
    eye: 1.0, playerEye: 1.5,
    fallback: [0, 20, 150, 200, 300, 540] // seconds after start for stage n, if the mission never says so
  };

  /* ---------------- state ---------------- */
  const M = G.monster; // the core-created object: keep identity, add fields
  M.pos = M.pos || new V3(0, -100, 0); M.stage = 0; M.visible = false; M.distance = 999; M.state = 'dormant';
  M.yaw = 0; M.present = false;

  const S = {
    root: null, model: null, mixer: null, actions: {}, cur: null, mats: [], ink: 1, opacity: 1, loaded: false,
    animAcc: 0, animHold: 0.09, unfold: 1, unfoldTarget: 1, mirror: 1, pitch: 0,
    ai: 'off', aiT: 0, target: null, path: [], pathT: 0, pathGoal: null, speed: 0,
    lastSeen: null, seenT: 0, losT: 0, lostT: 0, sawHide: null, sawHideT: -99, searchN: 0, checks: [],
    menace: 0, valveT: 0, grabCD: 0, lungeT: 0, grabbed: false, backoffFrom: null,
    flinch: 0, beamT: 0, flinchCD: 0, peekCD: 12, peekT: 0, noise: null,
    presence: null, // invisible 'she passed here' point for stages 1-3: {pos, vel, t}
    started: false, t0: 0, tStart: 0, pendingStage: null, reveal: null, glimpse: null,
    soundT: 8, shiftMode: false, gone: false, ended: false, capture: null,
    lights: new Map(), rainBase: null, rainHeld: false, burstT: 0, lastPlayer: new V3(), playerVel: new V3()
  };

  /* ---------------- helpers: world ---------------- */
  const world = () => G.world || {};
  const colliders = () => (world().colliders || []);
  const _ray = new THREE.Ray(), _hit = new V3(), _a = new V3(), _b = new V3(), _c = new V3();
  function losClear(from, to) {
    const d = _a.subVectors(to, from), len = d.length(); if (len < 1e-3) return true;
    _ray.origin.copy(from); _ray.direction.copy(d).multiplyScalar(1 / len);
    for (const box of colliders()) {
      if (!box || !box.min) continue;
      if (_ray.intersectBox(box, _hit) && _hit.distanceTo(from) < len - 0.05) return false;
    }
    return true;
  }
  function walkableAt(x, z, r) {
    r = r == null ? 0.35 : r;
    if (S.shiftMode) { const sw = G.shift && G.shift.walkable; if (typeof sw === 'function') { try { return !!sw(x, z, r); } catch (e) { return true; } } return true; }
    const w = world().walkable; if (typeof w === 'function') { try { if (!w(x, z, r)) return false; } catch (e) { /* treat as open */ } }
    for (const box of colliders()) {
      if (!box || !box.min || box.min.y > 1.0 || box.max.y < 0.15) continue;
      if (x > box.min.x - r && x < box.max.x + r && z > box.min.z - r && z < box.max.z + r) return false;
    }
    return true;
  }
  const playerPos = () => (G.player && G.player.pos) ? G.player.pos : _c.set(0, 0, 0);
  const pEye = () => _b.copy(playerPos()).setY((playerPos().y || 0) + (G.player && G.player.crouched ? 0.9 : T.playerEye));
  const mEye = (out) => (out || new V3()).copy(M.pos).setY(M.pos.y + T.eye * S.unfold);
  const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  function camForward() { const f = new V3(); G.camera.getWorldDirection(f); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); return f.normalize(); }

  /* ---------------- nav: A* over G.world.nav, else direct steering ---------------- */
  let navCache = null, navSrc = null, navEdges = -1;
  function nav() {
    const n = world().nav; if (!n) return null;
    const eLen = n.edges ? n.edges.length : 0;   // integration: the level appends edges at runtime (station gate)
    if (n === navSrc && eLen === navEdges) return navCache;
    navSrc = n; navEdges = eLen; navCache = null;
    try {
      if (typeof n.path === 'function') { navCache = { fn: n.path.bind(n) }; return navCache; }
      const list = Array.isArray(n) ? n : n.nodes; if (!Array.isArray(list) || !list.length) return null;
      const pts = list.map(o => { const p = o.pos || o.p || o; return new V3(+p.x || 0, 0, +(p.z != null ? p.z : p.y) || 0); });
      const adj = pts.map(() => []);
      list.forEach((o, i) => { const L = o.links || o.adj || o.neighbors || o.n || []; L.forEach(j => { if (j >= 0 && j < pts.length && j !== i) { adj[i].push(j); adj[j].push(i); } }); });
      // integration: level.js writes edges as node ids ('pl-gate'), not indices; translate both forms
      const idIx = {}; list.forEach((o, i) => { if (o && o.id != null) idIx[o.id] = i; });
      const ix = v => typeof v === 'number' ? v : idIx[v];
      (n.edges || n.links || []).forEach(e => { if (Array.isArray(e) && e.length >= 2) { const a = ix(e[0]), b = ix(e[1]); if (adj[a] && adj[b] && a !== b) { adj[a].push(b); adj[b].push(a); } } });
      navCache = { pts, adj };
    } catch (e) { console.warn('[monster] nav unreadable, steering directly', e); navCache = null; }
    return navCache;
  }
  function nearestNode(N, p) { let bi = -1, bd = 1e9; N.pts.forEach((q, i) => { const d = flatDist(p, q); if (d < bd) { bd = d; bi = i; } }); return bi; }
  function astar(N, s, g) {
    const n = N.pts.length, gs = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const open = [s]; gs[s] = 0; const h = i => flatDist(N.pts[i], N.pts[g]);
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (gs[open[i]] + h(open[i]) < gs[open[bi]] + h(open[bi])) bi = i;
      const c = open.splice(bi, 1)[0]; if (c === g) break; closed[c] = 1;
      for (const j of N.adj[c]) { if (closed[j]) continue; const t = gs[c] + flatDist(N.pts[c], N.pts[j]); if (t < gs[j]) { if (gs[j] === Infinity) open.push(j); gs[j] = t; from[j] = c; } }
    }
    if (gs[g] === Infinity) return null;
    const out = []; for (let c = g; c !== -1; c = from[c]) out.unshift(N.pts[c].clone()); return out;
  }
  function planPath(goal) {
    S.pathGoal = goal.clone(); S.pathT = 0;
    const N = !S.shiftMode && nav();
    if (!N || losClear(_c.copy(M.pos).setY(0.5), _a.copy(goal).setY(0.5))) { S.path = [goal.clone()]; return; }
    try {
      if (N.fn) { const p = N.fn(M.pos.clone(), goal.clone()); S.path = (p && p.length ? p.map(q => new V3(q.x, 0, q.z)) : [goal.clone()]); return; }
      const a = nearestNode(N, M.pos), b = nearestNode(N, goal), p = a >= 0 && b >= 0 ? astar(N, a, b) : null;
      S.path = p ? p.concat([goal.clone()]) : [goal.clone()];
    } catch (e) { S.path = [goal.clone()]; }
  }
  /** Move toward the path; returns true when the final goal is reached. Steers round blockers by trying rotated headings. */
  function follow(dt, speed, faceTarget) {
    if (!S.path.length) return true;
    let wp = S.path[0];
    while (S.path.length > 1 && flatDist(M.pos, wp) < 0.8) { S.path.shift(); wp = S.path[0]; }
    if (S.path.length > 1 && losClear(_c.copy(M.pos).setY(0.5), _a.copy(S.path[1]).setY(0.5))) { S.path.shift(); wp = S.path[0]; }
    const dx = wp.x - M.pos.x, dz = wp.z - M.pos.z, d = Math.hypot(dx, dz);
    if (S.path.length === 1 && d < 0.5) { S.speed = 0; return true; }
    // open ground with a box in the way: round its nearest useful corner (no nav needed)
    S.detourT = (S.detourT || 0) - dt;
    if (S.detourT <= 0 && !wp.detour) {
      S.detourT = 0.4;
      const blocker = firstBlocker(_c.copy(M.pos).setY(0.5), _a.copy(wp).setY(0.5));
      if (blocker) { const c = detourCorner(blocker, wp); if (c) { c.detour = true; S.path.unshift(c); wp = c; } }
    }
    const ddx = wp.x - M.pos.x, ddz = wp.z - M.pos.z;
    const step = Math.min(Math.hypot(ddx, ddz), speed * dt), base = Math.atan2(ddx, ddz);
    let moved = false;
    if (!S.bias || (S.biasT -= dt) <= 0) { S.bias = Math.random() < 0.5 ? 1 : -1; S.biasT = 1.5; }
    for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2]) {
      const h = base + off * S.bias, nx = M.pos.x + Math.sin(h) * step, nz = M.pos.z + Math.cos(h) * step;
      if (walkableAt(nx, nz)) { M.pos.x = nx; M.pos.z = nz; turnTo(faceTarget != null ? faceTarget : h, dt); moved = true; if (off !== 0) S.biasT = Math.max(S.biasT, 0.8); break; }
    }
    if (!moved && !walkableAt(M.pos.x, M.pos.z)) { M.pos.x += Math.sin(base) * step; M.pos.z += Math.cos(base) * step; moved = true; } // unstick
    S.speed = moved ? speed : 0;
    return false;
  }
  function firstBlocker(from, to) {
    const d = _b.subVectors(to, from), len = d.length(); if (len < 0.3) return null;
    _ray.origin.copy(from); _ray.direction.copy(d).multiplyScalar(1 / len);
    let best = null, bd = len;
    for (const box of colliders()) { if (!box || !box.min || box.min.y > 1.0 || box.max.y < 0.15) continue; if (_ray.intersectBox(box, _hit)) { const t = _hit.distanceTo(from); if (t < bd) { bd = t; best = box; } } }
    return best;
  }
  function detourCorner(box, goal) {
    const m = 0.8; let best = null, bs = 1e9;
    for (const [x, z] of [[box.min.x - m, box.min.z - m], [box.min.x - m, box.max.z + m], [box.max.x + m, box.min.z - m], [box.max.x + m, box.max.z + m]]) {
      const q = new V3(x, 0, z); if (!walkableAt(x, z, 0.3)) continue;
      const s = flatDist(M.pos, q) + flatDist(q, goal) + (losClear(_c.copy(M.pos).setY(0.5), _a.copy(q).setY(0.5)) ? 0 : 50);
      if (s < bs) { bs = s; best = q; }
    }
    return best;
  }
  function turnTo(yaw, dt, rate) {
    let d = yaw - M.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    M.yaw += d * (1 - Math.exp(-dt * (rate || 7)));
  }
  const yawTo = (p) => Math.atan2(p.x - M.pos.x, p.z - M.pos.z);
  function goTo(p) { if (!S.pathGoal || flatDist(S.pathGoal, p) > 1.5 || S.pathT > 1.2) planPath(p); }

  /** A point ~dist m from the player, away from him, preferably out of his sight (backstage / valve / backoff target). */
  function farPoint(minD, maxD) {
    const P = playerPos(), N = nav();
    if (N && N.pts) {
      const c = N.pts.filter(q => { const d = flatDist(q, P); return d >= minD && d <= maxD; });
      if (c.length) { c.sort((a, b) => (losClear(pEye(), _a.copy(a).setY(1)) ? 1 : 0) - (losClear(pEye(), _a.copy(b).setY(1)) ? 1 : 0) || flatDist(a, M.pos) - flatDist(b, M.pos)); return c[0].clone(); }
    }
    let away = new V3(M.pos.x - P.x, 0, M.pos.z - P.z); if (away.lengthSq() < 0.01) away = camForward().negate(); away.normalize();
    const want = rand(minD, maxD);
    for (let i = 0; i < 14; i++) {
      const ang = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.35, dir = away.clone().applyAxisAngle(new V3(0, 1, 0), ang);
      const q = new V3(P.x + dir.x * want, 0, P.z + dir.z * want);
      if (walkableAt(q.x, q.z, 0.5)) return q;
    }
    return new V3(P.x + away.x * want, 0, P.z + away.z * want);
  }
  /** Spawn point for entering from backstage: far, behind the player, out of view. */
  function backstagePoint() {
    const P = playerPos(), back = camForward().negate();
    for (let i = 0; i < 16; i++) {
      const dir = back.clone().applyAxisAngle(new V3(0, 1, 0), rand(-1.1, 1.1)), d = rand(28, 36);
      const q = new V3(P.x + dir.x * d, 0, P.z + dir.z * d);
      if (walkableAt(q.x, q.z, 0.5) && !losClear(pEye(), _a.copy(q).setY(1))) return q;
      if (i > 10 && walkableAt(q.x, q.z, 0.5)) return q;
    }
    return new V3(P.x + back.x * 32, 0, P.z + back.z * 32);
  }

  /* ---------------- model + animation ---------------- */
  const INK = { char: 0.6, ash: 0.12, katabira: 0.08, face: 0.05, hair: 1, red: 1 };
  function buildModel(gltf) {
    const root = new THREE.Group(); root.name = 'Kagenui';
    const model = gltf.scene; root.add(model);
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      const mats = [].concat(o.material).map(m0 => {
        const m = m0.clone(); m.fog = false; m.transparent = true; m.depthWrite = true;
        const key = (m0.name || '').toLowerCase().replace(/\.\d+$/, '');
        m.userData.base = m.color ? m.color.clone() : null; m.userData.ink = INK[key] != null ? INK[key] : 0.1; m.userData.key = key;
        S.mats.push(m); return m;
      });
      o.material = Array.isArray(o.material) ? mats : mats[0];
    });
    S.mixer = new THREE.AnimationMixer(model);
    (gltf.animations || []).forEach(c => { S.actions[c.name] = S.mixer.clipAction(c); });
    // a dim red rim light behind her head: lights the hair edge and the thread, never the face
    S.rim = new THREE.PointLight(0xff1a1a, 0, 2.2, 2); S.rim.position.set(0, 1.7, -0.6); root.add(S.rim);
    // the reveal lamp
    S.lamp = new THREE.PointLight(0xff2a1a, 0, 9, 1.6); S.lamp.position.set(0, 3.2, 0.6); root.add(S.lamp);
    root.visible = false; G.scene.add(root);
    S.root = root; S.model = model; S.loaded = true;
    applyInk(1);
    play('Idle');
  }
  function applyInk(k) { // k=1: a black shape (stages 1-4), k=0: her true colours (reveal)
    S.ink = k;
    for (const m of S.mats) if (m.userData.base) {
      const f = lerp(1, m.userData.ink, k); m.color.copy(m.userData.base).multiplyScalar(f);
      if (m.emissive && m.userData.key !== 'red') m.emissive.setRGB(0, 0, 0);
    }
  }
  function setOpacity(a) { if (Math.abs(a - S.opacity) < 0.004) return; S.opacity = a; for (const m of S.mats) m.opacity = a; }
  function play(name, o) {
    o = o || {}; const a = S.actions[name]; if (!a) return null;
    if (S.cur === a && !o.restart) { a.timeScale = o.speed || a.timeScale; return a; }
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.timeScale = o.speed || rand(0.85, 1.15);
    a.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = !!o.once;
    if (o.at != null) a.time = o.at;
    if (S.cur && S.cur !== a) { if (name === 'Lunge' || o.snap) { S.cur.stop(); } else { a.crossFadeFrom(S.cur, 0.25, false); } }
    a.play(); S.cur = a; S.curName = name; return a;
  }
  /** Stop-motion: advance the mixer in held steps (2-4 frames at 24 fps), so heads and hands snap. */
  function animate(dt) {
    if (!S.mixer) return;
    S.animAcc += dt;
    if (S.curName === 'Lunge' || S.curName === 'Crawl' && S.speed > 3) { S.mixer.update(S.animAcc); S.animAcc = 0; return; }
    if (S.animAcc >= S.animHold) { S.mixer.update(S.animAcc); S.animAcc = 0; S.animHold = (2 + Math.floor(Math.random() * 3)) / 24; }
  }
  function placeRoot(dt) {
    if (!S.root) return;
    S.root.position.copy(M.pos);
    S.unfold += (S.unfoldTarget - S.unfold) * (1 - Math.exp(-dt * (S.unfoldTarget > S.unfold ? 1.6 : 9)));
    S.root.rotation.set(S.pitch, M.yaw, 0);
    S.root.scale.set(S.mirror * (1 + (S.unfold - 1) * 0.15), S.unfold, 1);
  }
  function bone(name) { if (!S.model) return null; S.bones = S.bones || {}; if (!(name in S.bones)) S.bones[name] = S.model.getObjectByName(name) || null; return S.bones[name]; }

  /* ---------------- procedural audio (G.audioCtx; silent without it) ---------------- */
  let noiseBuf = null;
  function ac() { return G.audioCtx && G.audioCtx.state !== 'closed' ? G.audioCtx : null; }
  function out(ctx, pos, gain) {
    const g = ctx.createGain(); let node = g;
    if (pos && ctx.createStereoPanner) {
      const rel = G.camera.worldToLocal(pos.clone()); const p = ctx.createStereoPanner(); p.pan.value = clamp(rel.x / Math.max(2, Math.hypot(rel.x, rel.z)), -1, 1);
      const behind = rel.z > 0; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = behind ? 1400 : 9000;
      g.connect(lp); lp.connect(p); p.connect(ctx.destination);
      const d = pos.distanceTo(G.camera.position); g.gain.value = gain * clamp(6 / Math.max(d, 3), 0.08, 1);
    } else { g.gain.value = gain; g.connect(ctx.destination); }
    return node;
  }
  function noise(ctx) { if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }
  const SFX = {
    drag(pos) { const c = ac(); if (!c) return; const t = c.currentTime, o = out(c, pos, 0.35), n = noise(c), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'bandpass'; f.frequency.setValueAtTime(380, t); f.frequency.linearRampToValueAtTime(220, t + 1.6); f.Q.value = 1.4;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.25); g.gain.setValueAtTime(0.7, t + 0.9); g.gain.linearRampToValueAtTime(1, t + 1.1); g.gain.linearRampToValueAtTime(0, t + 1.9);
      n.connect(f); f.connect(g); g.connect(o); n.start(t, Math.random()); n.stop(t + 2); },
    knock(pos) { const c = ac(); if (!c) return; const o = out(c, pos, 0.5); for (let i = 0; i < 3; i++) { const t = c.currentTime + i * rand(0.11, 0.2), s = c.createOscillator(), g = c.createGain();
      s.type = 'triangle'; s.frequency.setValueAtTime(rand(120, 170), t); s.frequency.exponentialRampToValueAtTime(50, t + 0.06); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09); s.connect(g); g.connect(o); s.start(t); s.stop(t + 0.1); } },
    koto(pos) { const c = ac(); if (!c) return; const t = c.currentTime, o = out(c, pos, 0.28), s = c.createOscillator(), s2 = c.createOscillator(), g = c.createGain(), f = rand(196, 262);
      s.type = 'sawtooth'; s2.type = 'triangle'; s.frequency.setValueAtTime(f, t); s.frequency.linearRampToValueAtTime(f * 1.09, t + 0.5); s.frequency.linearRampToValueAtTime(f * 1.13, t + 2.2); s2.frequency.value = f * 2.013;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(400, t + 2);
      g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
      s.connect(lp); s2.connect(lp); lp.connect(g); g.connect(o); s.start(t); s2.start(t); s.stop(t + 2.7); s2.stop(t + 2.7); },
    breath(pos) { const c = ac(); if (!c) return; const t = c.currentTime, o = out(c, pos, 0.25), n = noise(c), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.8, t + 0.6); g.gain.linearRampToValueAtTime(0, t + 1.5);
      n.connect(f); f.connect(g); g.connect(o); n.start(t); n.stop(t + 1.6); },
    screech(pos, len) { const c = ac(); if (!c) return; len = len || 1.1; const t = c.currentTime, o = out(c, pos, 0.5);
      [1, 1.06, 1.49].forEach((m, i) => { const s = c.createOscillator(), g = c.createGain(); s.type = i ? 'sawtooth' : 'square';
        s.frequency.setValueAtTime(700 * m, t); s.frequency.exponentialRampToValueAtTime(1900 * m, t + 0.12); s.frequency.exponentialRampToValueAtTime(520 * m, t + len);
        g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + len); s.connect(g); g.connect(o); s.start(t); s.stop(t + len + 0.05); });
      const n = noise(c), g2 = c.createGain(); g2.gain.setValueAtTime(0.5, t); g2.gain.exponentialRampToValueAtTime(0.001, t + len * 0.7); n.connect(g2); g2.connect(o); n.start(t); n.stop(t + len); }
  };
  function soundAround(kind) { // stage 1-3: from above or behind, never in front
    const P = playerPos(), back = camForward().negate().applyAxisAngle(new V3(0, 1, 0), rand(-1.2, 1.2));
    const pos = new V3(P.x + back.x * rand(6, 14), rand(2.5, 6), P.z + back.z * rand(6, 14));
    (SFX[kind] || SFX.drag)(pos); G.addFear(kind === 'koto' ? 0.12 : 0.08);
  }

  /* ---------------- traces (stage 2) ---------------- */
  let printTex = null;
  function handTex() {
    if (printTex) return printTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(128, 168, 46, 54, 0, 0, Math.PI * 2); g.fill();
    [[-38, -8, 0.28], [-14, -16, 0.06], [12, -14, -0.08], [36, -4, -0.3]].forEach(([dx, dy, a]) => { g.save(); g.translate(128 + dx, 128 + dy); g.rotate(a); g.fillRect(-8, -112, 16, 108); g.beginPath(); g.arc(0, -112, 8, 0, Math.PI * 2); g.fill(); g.restore(); });
    g.save(); g.translate(78, 190); g.rotate(-1.0); g.fillRect(-9, -60, 18, 60); g.restore();
    for (let i = 0; i < 6; i++) { g.fillRect(100 + Math.random() * 56, 210, 4 + Math.random() * 5, 20 + Math.random() * 40); }
    printTex = new THREE.CanvasTexture(cv); return printTex;
  }
  const traces = [];
  function addPrint(pos, yaw, wall, normal) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.08, metalness: 0.2, alphaMap: handTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    if (wall) { m.position.copy(pos); m.lookAt(_a.copy(pos).add(normal)); m.rotateZ(rand(-0.4, 0.4)); }
    else { m.rotation.set(-Math.PI / 2, 0, yaw + Math.PI); m.position.copy(pos).setY(0.012); }
    m.renderOrder = 2; G.scene.add(m); traces.push(m); return m;
  }
  function addThread(points) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new V3(p.x, 0.02, p.z)));
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.006, 4, false), new THREE.MeshBasicMaterial({ color: 0xa0101a, fog: true }));
    G.scene.add(m); traces.push(m);
  }
  /** Knuckle-and-hand drag marks and a red thread leading away from the player; a hand on the nearest wall. */
  function spawnTrace() {
    const P = playerPos(), f = camForward(), side = new V3(-f.z, 0, f.x);
    const start = new V3(P.x + f.x * 4, 0, P.z + f.z * 4), pts = [];
    let dir = f.clone().applyAxisAngle(new V3(0, 1, 0), rand(-0.4, 0.4)), p = start.clone();
    for (let i = 0; i < 9; i++) {
      pts.push(p.clone());
      const yaw = Math.atan2(dir.x, dir.z), s = (i % 2 ? 1 : -1) * 0.32;
      if (walkableAt(p.x, p.z, 0.1)) addPrint(_a.copy(p).addScaledVector(new V3(-dir.z, 0, dir.x), s), yaw, false);
      dir.applyAxisAngle(new V3(0, 1, 0), rand(-0.25, 0.25)); p.addScaledVector(dir, 1.5);
    }
    addThread(pts);
    // a hand on the nearest wall face (a doorframe, if the level has one near)
    let best = null, bd = 9;
    for (const box of colliders()) {
      if (!box || !box.min || box.max.y < 1.4) continue;
      const cp = box.clampPoint(_a.copy(P).setY(1.3), new V3()); const d = flatDist(cp, P);
      if (d > 0.5 && d < bd) { bd = d; best = { box, cp }; }
    }
    if (best) {
      const n = new V3(P.x - best.cp.x, 0, P.z - best.cp.z); const ax = Math.abs(n.x) > Math.abs(n.z); n.set(ax ? Math.sign(n.x) : 0, 0, ax ? 0 : Math.sign(n.z));
      const q = best.cp.clone().addScaledVector(n, 0.01); q.y = rand(1.0, 1.5); addPrint(q, 0, true, n);
      addPrint(q.clone().add(new V3(n.z * 0.3, -0.25, -n.x * 0.3)), 0, true, n);
    }
    // she passed here, unseen: lamps die along the line, the rain hangs for a moment
    const far = pts[pts.length - 1];
    S.presence = { pos: start.clone().addScaledVector(side, -9), to: far.clone().addScaledVector(side, 9), t: 0, dur: 7 };
    SFX.drag(start); G.addFear(0.25); if (G.fx && G.fx.spike) G.fx.spike(0.35);
    log('trace at', start.x.toFixed(1), start.z.toFixed(1));
  }

  /* ---------------- glimpse (stage 3) ---------------- */
  function tryGlimpse() {
    if (!S.loaded) return false;
    const P = playerPos(), f = camForward();
    for (let i = 0; i < 12; i++) {
      const ang = (i % 2 ? 1 : -1) * (0.12 + 0.05 * i), dir = f.clone().applyAxisAngle(new V3(0, 1, 0), ang), d = rand(30, 36);
      const q = new V3(P.x + dir.x * d, 0, P.z + dir.z * d);
      if (!walkableAt(q.x, q.z, 0.5) || !losClear(pEye(), _a.copy(q).setY(0.8))) continue;
      M.pos.copy(q); const awayYaw = Math.atan2(dir.x, dir.z) + rand(-0.9, 0.9); M.yaw = awayYaw;
      S.glimpse = { t: 0, dur: rand(3.2, 4.2), yaw: awayYaw }; M.present = true; S.root.visible = true; setOpacity(1); applyInk(1);
      play('StalkWalk', { speed: 0.9, snap: true }); SFX.koto(q); log('glimpse at', d.toFixed(1), 'm');
      return true;
    }
    return false;
  }

  /* ---------------- peeks (stage 4) ---------------- */
  /** Find a collider corner near the player (6-16 m) that hides her body; returns {pos, yaw, mirror} or null. */
  function peekSpot(minD, maxD, needView) {
    const P = playerPos(), eye = pEye().clone(), f = camForward(); let best = null, bs = -1e9;
    for (const box of colliders()) {
      if (!box || !box.min || box.max.y < 1.3 || box.min.y > 0.3) continue;
      const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
      for (const [x, z] of [[box.min.x, box.min.z], [box.min.x, box.max.z], [box.max.x, box.min.z], [box.max.x, box.max.z]]) {
        const d = Math.hypot(x - P.x, z - P.z); if (d < minD || d > maxD) continue;
        const u = new V3(x - P.x, 0, z - P.z).normalize(); const inView = u.dot(f);
        if (needView && inView < 0.75) continue;
        const yaw = Math.atan2(-u.x, -u.z); // facing the player
        const lx = new V3(Math.cos(yaw), 0, -Math.sin(yaw)); // her local +x in world
        const mirror = ((cx - x) * lx.x + (cz - z) * lx.z) >= 0 ? 1 : -1; // the wall must be on her local +x side
        const pos = new V3(x, 0, z).addScaledVector(lx, 0.12 * mirror).addScaledVector(u, 0.32);
        const body = pos.clone().addScaledVector(lx, 0.3 * mirror);
        if (!walkableAt(pos.x, pos.z, 0.15) && colliders().some(b => b !== box && b.containsPoint(_a.copy(pos).setY(0.5)))) continue;
        if (box.containsPoint(_a.copy(pos).setY(0.5))) continue;
        if (losClear(eye, _a.copy(body).setY(0.7))) continue; // body must be hidden
        const s = inView * 2 - Math.abs(d - 10) * 0.15;
        if (s > bs) { bs = s; best = { pos, yaw, mirror }; }
      }
    }
    return best;
  }

  /* ---------------- stages ---------------- */
  function setStage(n, why) {
    n = clamp(n | 0, 0, 5); if (n <= M.stage || S.gone) return;
    const prev = M.stage; M.stage = n; log('stage', prev, '->', n, why || '');
    G.emit('monster-stage', { stage: n });
    if (n >= 2 && prev < 2) spawnTrace();
    if (n === 3) S.glimpseWant = 20; // seconds to keep trying
    if (n >= 4 && prev < 4) enterFront();
    if (n === 5) startReveal();
  }
  M.setStage = (n) => setStage(n, 'api');
  M.reveal = () => setStage(5, 'api');

  function enterFront() { // backstage -> front stage, entering far behind the player
    if (S.ai !== 'off' || !S.loaded) return;
    S.glimpse = null; M.pos.copy(backstagePoint()); M.present = true; S.root.visible = true; applyInk(1); setOpacity(1);
    S.ai = 'stalk'; S.aiT = 0; S.peekCD = rand(6, 12); S.menace = 0; SFX.drag(M.pos);
  }
  function startReveal() {
    if (!S.loaded || S.gone) return;
    const P = playerPos(), f = camForward(); let q = null;
    for (let i = 0; i < 10 && !q; i++) { const dir = f.clone().applyAxisAngle(new V3(0, 1, 0), (i % 2 ? 1 : -1) * 0.1 * i), c = new V3(P.x + dir.x * 10, 0, P.z + dir.z * 10); if (walkableAt(c.x, c.z, 0.5) && losClear(pEye(), _a.copy(c).setY(1))) q = c; }
    if (!q) q = new V3(P.x + f.x * 10, 0, P.z + f.z * 10);
    // the lamps die first; in the dark and the static she is simply there
    S.reveal = { t: 0, pos: q };
    S.presence = { pos: q.clone(), to: q.clone(), t: 0, dur: 1.2 };
    if (G.fx && G.fx.spike) G.fx.spike(1);
    M.present = false; S.root.visible = false; S.ai = 'reveal';
  }

  /* ---------------- AI ---------------- */
  function sees() { // sight cone + line of sight
    const Pl = G.player || {}; if (Pl.alive === false) return false;
    const P = playerPos(), d = flatDist(M.pos, P);
    if (Pl.hidden) return false;
    let range = T.sight.range;
    const lit = Pl.lightOn !== false && Pl.lightOn != null ? Pl.lightOn : false;
    if (lit) { const toMe = new V3(M.pos.x - P.x, 0, M.pos.z - P.z).normalize(); if (toMe.dot(camForward()) > 0.8) range = T.sight.lit; }
    else if (Pl.crouched) range = T.sight.dark;
    if (d > range) return false;
    if (d > 2.5) { const ang = Math.abs(((yawTo(P) - M.yaw + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); if (ang > T.sight.fov / 2 && S.ai !== 'hunt') return false; if (ang > T.sight.fov && S.ai === 'hunt') return false; }
    return losClear(mEye(_c), pEye());
  }
  function inBeam() {
    const Pl = G.player || {}; const P = playerPos(); const me = mEye(new V3()); me.y = M.pos.y + 0.8;
    const b = Pl.beam;
    let on, origin, dir, range, cosA;
    if (b) {
      on = (b.on !== false) && !!(b.focus || b.focused || b.isFocused);
      origin = b.origin || b.pos || (b.position && b.position.isVector3 ? b.position : null) || pEye().clone();
      dir = b.dir || b.direction || null; if (!dir) { dir = new V3(); G.camera.getWorldDirection(dir); }
      range = b.range || b.distance || 14; const a = b.angle != null ? b.angle : 0.22; cosA = a > 1 ? Math.cos(a * Math.PI / 180) : Math.cos(a);
    } else {
      on = !!(Pl.lightOn && G.input && G.input.focus); origin = G.camera.position; dir = new V3(); G.camera.getWorldDirection(dir); range = 12; cosA = Math.cos(0.2);
    }
    if (!on) return false;
    const v = new V3().subVectors(me, origin), d = v.length(); if (d > range || d < 0.2) return false;
    if (v.normalize().dot(_a.copy(dir).normalize()) < cosA) return false;
    return losClear(origin, me);
  }
  function nearbyHideSpots(center, r) { return (world().hideSpots || []).filter(s => s && s.pos && flatDist(s.pos, center) < r); }

  function setAI(s) { if (S.ai !== s) { S.ai = s; S.aiT = 0; S.path = []; S.pathGoal = null; } }
  function aiUpdate(dt) {
    const P = playerPos(), d = flatDist(M.pos, P), Pl = G.player || {};
    S.aiT += dt; S.pathT += dt; S.grabCD -= dt; S.flinchCD -= dt; S.peekCD -= dt;

    // senses (cheap enough at 60 Hz for a few hundred boxes)
    const see = (S.ai === 'stalk' || S.ai === 'search' || S.ai === 'hunt') && sees();
    if (see) { S.lastSeen = P.clone(); S.seenT = G.time; S.lostT = 0; }
    // menace valve: pressure while near or hunting
    if (S.ai === 'hunt' || S.ai === 'search' || d < 12) S.menace += dt; else S.menace = Math.max(0, S.menace - dt * 0.5);

    // grab: always gets you if you are in reach, or if you walk into her
    const approaching = S.playerVel.lengthSq() > 1 && S.playerVel.dot(_a.set(M.pos.x - P.x, 0, M.pos.z - P.z).normalize()) > 1.2;
    const reach = approaching ? T.block : T.grab;
    if (S.ai !== 'retreat' && S.ai !== 'backoff' && S.ai !== 'lunge' && S.ai !== 'flinch' && S.grabCD <= 0 && Pl.alive !== false && d < reach && (!Pl.hidden || S.ai === 'search' && S.checking === Pl.hidden)) return startLunge();

    // the light: a focused beam on her makes her flinch and run
    if ((S.ai === 'stalk' || S.ai === 'hunt' || S.ai === 'search' || S.ai === 'peek') && S.flinchCD <= 0 && inBeam()) { S.beamT += dt; if (S.beamT > 0.35) return startFlinch(); } else S.beamT = Math.max(0, S.beamT - dt);

    if (S.ai !== 'retreat' && S.ai !== 'backoff' && S.ai !== 'lunge' && S.ai !== 'flinch' && S.menace > T.menace) { S.menace = 0; S.valveT = rand(T.valveRest[0], T.valveRest[1]); log('menace valve: backing off', S.valveT.toFixed(0), 's'); return setRetreat(farPoint(30, 45), S.valveT); }

    switch (S.ai) {
      case 'stalk': { // drift toward the player's area, from corner to corner, peeking; investigate noises
        if (see) { hunt(); break; }
        if (S.noise) { const n = S.noise; S.noise = null; S.target = n; planPath(n); S.investigating = true; }
        if (!S.target || S.aiT > 25) {
          S.investigating = false; const ps = S.peekCD <= 0 ? peekSpot(6, 16, false) : null;
          S.peekPlan = ps; S.target = ps ? ps.pos : (() => { const a = rand(0, Math.PI * 2), r = rand(8, 16), q = new V3(P.x + Math.sin(a) * r, 0, P.z + Math.cos(a) * r); return walkableAt(q.x, q.z) ? q : farPoint(10, 18); })();
          planPath(S.target); S.aiT = 0;
        }
        const done = follow(dt, S.investigating ? T.speed.investigate : T.speed.stalk);
        play(S.speed > 0 ? 'StalkWalk' : 'Search', { speed: S.investigating ? 1.1 : 0.9 });
        if (done) {
          if (S.peekPlan && flatDist(M.pos, S.peekPlan.pos) < 0.8) { startPeek(S.peekPlan); S.peekPlan = null; }
          else if (S.investigating) { S.investigating = false; startSearch(M.pos.clone(), false); }
          else S.target = null;
        }
        break;
      }
      case 'peek': {
        M.yaw = S.peekYaw; S.peekT += dt;
        if (see && d < 9 && S.peekT > 1.5) { S.mirror = 1; hunt(); break; }
        if (S.peekT > 5) { S.mirror = 1; S.peekCD = rand(18, 30); S.target = null; setAI('stalk'); }
        break;
      }
      case 'hunt': {
        if (see) { goTo(P); } else {
          S.lostT += dt;
          if (S.lastSeen) goTo(S.lastSeen);
          if (Pl.hidden && G.time - S.seenT < 1.6 && S.sawHide == null) { S.sawHide = Pl.hidden; }
          if (S.lostT > 3 && d > 10 || Pl.hidden || S.lostT > 8) { startSearch(S.lastSeen || M.pos.clone(), true); break; }
        }
        const done = follow(dt, T.speed.hunt);
        play('Crawl', { speed: 1.25 });
        if (done && !see) startSearch(M.pos.clone(), true);
        break;
      }
      case 'search': {
        if (see) { hunt(); break; }
        if (!S.checks.length) { if (S.aiT > 12 || !S.searchLook) { S.target = null; setAI('stalk'); } break; }
        const c = S.checks[0];
        if (S.searchLook > 0) { S.searchLook -= dt; play('Search', { speed: 1 }); if (S.searchLook <= 0) { S.checks.shift(); S.checking = null; } break; }
        S.checking = c.id || null;
        if (!S.pathGoal || flatDist(S.pathGoal, c.pos) > 0.5) planPath(c.pos);
        const done = follow(dt, c.found ? T.speed.investigate * 1.4 : T.speed.search);
        play('StalkWalk', { speed: 0.8 });
        if (done || S.aiT > (c.found ? 40 : 14)) { S.aiT = 0; S.searchLook = rand(2.2, 3.5); turnTo(yawTo(c.look || P), 1); }
        break;
      }
      case 'lunge': {
        S.lungeT += dt; turnTo(yawTo(P), dt, 12);
        if (S.lungeT > 0.25 && S.lungeT < 0.4) { const step = 1.35 / 0.15 * dt, h = M.yaw; const nx = M.pos.x + Math.sin(h) * step, nz = M.pos.z + Math.cos(h) * step; if (walkableAt(nx, nz, 0.2) && flatDist(M.pos, P) > 0.7) { M.pos.x = nx; M.pos.z = nz; } }
        if (S.lungeT > 0.27 && !S.grabbed) {
          S.grabbed = true; log('GRAB');
          G.emit('monster-grab', { pos: M.pos.clone(), fromHide: !!Pl.hidden });
          G.addFear(1); if (G.fx && G.fx.spike) G.fx.spike(1); SFX.screech(M.pos, 1.3);
        }
        if (S.lungeT > 1.1) { S.grabCD = 12; setBackoff(); }
        break;
      }
      case 'backoff': { // after a grab: back away 15-20 m facing him, then pause, then stalk again
        const away = new V3(M.pos.x - P.x, 0, M.pos.z - P.z); if (away.lengthSq() < 0.01) away.set(1, 0, 0); away.normalize();
        if (!S.pathGoal) planPath(new V3(S.backoffFrom.x + away.x * S.backoffDist, 0, S.backoffFrom.z + away.z * S.backoffDist));
        const done = follow(dt, T.speed.backoff, yawTo(P));
        play('StalkWalk', { speed: -0.9 });
        if (done || S.aiT > 9) setRetreat(null, rand(4, 6));
        break;
      }
      case 'flinch': {
        S.flinchT += dt; S.pitch = -0.35 * Math.sin(Math.min(1, S.flinchT / 0.25) * Math.PI / 2);
        if (S.flinchT > 0.9) { S.pitch = 0; S.flinchCD = 10; setRetreat(farPoint(18, 28), rand(6, 10)); }
        break;
      }
      case 'retreat': {
        if (S.retreatTo) {
          const done = follow(dt, T.speed.retreat); play('Crawl', { speed: 0.8 });
          if (done || S.aiT > 15) { S.retreatTo = null; S.aiT = 0; }
        } else {
          play('Idle'); S.restT -= dt; S.speed = 0;
          if (S.restT <= 0) { S.target = null; S.menace = 0; setAI('stalk'); }
        }
        break;
      }
    }
  }
  function hunt() { if (S.ai !== 'hunt') { log('hunt'); setAI('hunt'); G.addFear(0.35); if (G.fx && G.fx.spike) G.fx.spike(0.6); SFX.screech(M.pos, 0.6); } }
  function startPeek(ps) {
    setAI('peek'); M.pos.copy(ps.pos); S.peekYaw = ps.yaw; M.yaw = ps.yaw; S.mirror = ps.mirror; S.peekT = 0;
    play('Peek', { once: true, restart: true, snap: true, speed: 1 }); SFX.knock(M.pos);
  }
  function startSearch(at, afterHunt) {
    S.searchN++;
    const Pl = G.player || {};
    const spots = nearbyHideSpots(at, 14);
    if (Pl.hidden) S.hideSearches = (S.hideSearches || 0) + 1;
    const first = !!Pl.hidden && S.hideSearches === 1;
    let checks = [];
    if (!first && S.sawHide != null && Pl.hidden === S.sawHide) {
      const s = spots.find(q => q.id === S.sawHide) || (world().hideSpots || []).find(q => q.id === S.sawHide);
      if (s) checks.push({ id: s.id, pos: s.pos.clone(), found: true });
    }
    // the first search always misses: never the player's spot
    const others = spots.filter(q => q.id !== Pl.hidden && !checks.some(c => c.id === q.id)).sort(() => Math.random() - 0.5).slice(0, 2);
    others.forEach(q => checks.push({ id: q.id, pos: q.pos.clone() }));
    if (!checks.length) checks.push({ pos: at.clone() }, { pos: at.clone().add(new V3(rand(-4, 4), 0, rand(-4, 4))) });
    if (first && checks.some(c => c.found)) checks = checks.filter(c => !c.found);
    log('search #' + S.searchN, 'checks', checks.map(c => c.id || 'point').join(','), first ? '(first: always misses)' : '');
    S.checks = checks; S.searchLook = 0; S.checking = null; setAI('search');
    if (afterHunt) SFX.breath(M.pos);
  }
  function startLunge() { setAI('lunge'); S.lungeT = 0; S.grabbed = false; play('Lunge', { once: true, restart: true, snap: true, speed: 1.6 }); }
  function setBackoff() { setAI('backoff'); S.backoffFrom = M.pos.clone(); S.backoffDist = rand(15, 20); }
  function setRetreat(to, rest) { setAI('retreat'); S.retreatTo = to; if (to) planPath(to); S.restT = rest || 20; }
  function startFlinch() { log('flinch (light)'); setAI('flinch'); S.flinchT = 0; S.beamT = 0; S.mirror = 1; play('Search', { snap: true, speed: 2.2 }); SFX.screech(M.pos, 0.9); G.addFear(0.3); if (G.fx && G.fx.spike) G.fx.spike(0.5); }

  /* ---------------- her effect on the level (H8) ---------------- */
  function lightEntry(e) { if (!e) return null; if (e.isLight) return { L: e }; if (e.light && e.light.isLight) return { L: e.light, em: e.emissive || e.mat || e.material || null }; return null; }
  const _lp = new V3();
  function influencePoint() { if (M.present) return M.pos; if (S.presence) return S.presence.pos; return null; }
  /** 0..1 how strongly her presence disturbs a lamp at pos (for HorrorFX.addFlicker proximity). */
  M.lightProximity = (pos) => { const q = influencePoint(); if (!q || !pos) return 0; const d = flatDist(q, pos); return d < T.lightDie ? 1 : clamp(1 - (d - T.lightDie) / (T.lightFlicker - T.lightDie), 0, 1); };
  function lightsUpdate(dt) {
    const list = world().lights; const q = influencePoint();
    if (Array.isArray(list)) for (const e of list) {
      const le = lightEntry(e); if (!le) continue; const L = le.L;
      let st = S.lights.get(L);
      L.getWorldPosition(_lp);
      const d = q ? flatDist(q, _lp) : 999;
      if (!st) { if (d > T.lightFlicker) continue; st = { col: L.color.clone(), em: [], k: 1, dip: 0, next: 0 }; [].concat(le.em || []).forEach(m => { if (m && m.emissive) st.em.push({ m, c: m.emissive.clone() }); }); S.lights.set(L, st); }
      let target = 1;
      if (d < T.lightDie) target = 0;
      else if (d < T.lightFlicker) { // stuttering dips, faster the closer she is
        const p = 1 - (d - T.lightDie) / (T.lightFlicker - T.lightDie);
        st.next -= dt; if (st.dip > 0) { st.dip -= dt; target = 0.08; }
        else if (st.next <= 0) { const deep = !G.fx || !G.fx.limiter || G.fx.limiter.allow(); if (deep) st.dip = rand(0.04, 0.25) * (1 + p); st.next = rand(0.05, 0.6) / (0.3 + p); }
        if (st.dip <= 0) target = 1 - 0.45 * p;
      }
      st.k += (target - st.k) * (1 - Math.exp(-dt * (target < st.k ? 40 : (d > T.lightFlicker ? 1.2 : 10))));
      L.color.copy(st.col).multiplyScalar(st.k);
      st.em.forEach(o => o.m.emissive.copy(o.c).multiplyScalar(st.k));
      if (d > T.lightFlicker && st.k > 0.995) { L.color.copy(st.col); st.em.forEach(o => o.m.emissive.copy(o.c)); S.lights.delete(L); }
    }
    // the rain hangs in the air near her, then falls all at once when she goes (snap: no smeared transition)
    const R = G.fx && G.fx.rain;
    if (R) {
      const near = q && flatDist(q, playerPos()) < T.rainStop;
      if (near && !S.rainHeld) { S.rainBase = { speed: R.speed, length: R.length, opacity: R.opacity }; R.speed = 0.25; R.length = 0.12; R.opacity = S.rainBase.opacity * 0.8; S.rainHeld = true; }
      else if (!near && S.rainHeld) { Object.assign(R, S.rainBase); S.rainHeld = false; }
    }
  }
  /** Static and fear: hold a floor on G.fearBoost that rises steeply as she closes (near-blinding inside 3 m). */
  function fearUpdate(dt) {
    const q = influencePoint(); if (!q || S.gone) return;
    const d = flatDist(q, playerPos());
    const stageK = M.stage >= 4 ? 1 : 0.55;
    let b = d < 3 ? 1 : Math.pow(clamp(1 - (d - 3) / 13, 0, 1), 1.25) * stageK;
    if (M.visible) b = Math.min(1, b + 0.12);
    if (b > G.fearBoost) G.addFear(b - G.fearBoost);
    // extra static bursts when she is close (the limiter in HorrorFX keeps these within the flash rule)
    S.burstT -= dt;
    if (d < 9 && S.burstT <= 0 && G.fx && G.fx.spike) { G.fx.spike(0.25 + 0.5 * (1 - d / 9)); S.burstT = rand(0.4, 1.6) * (0.4 + d / 9); }
  }

  /* ---------------- visibility (accurate every frame) ---------------- */
  const _frus = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();
  function computeVisible() {
    if (!S.root || !S.root.visible || !M.present || S.opacity < 0.05) return false;
    G.camera.updateMatrixWorld(); _pm.multiplyMatrices(G.camera.projectionMatrix, G.camera.matrixWorldInverse); _frus.setFromProjectionMatrix(_pm);
    const c = G.camera.position;
    for (const h of [0.45, 0.9 * S.unfold, 1.15 * S.unfold]) {
      _sph.center.set(M.pos.x, M.pos.y + h, M.pos.z); _sph.radius = 0.3;
      if (_frus.intersectsSphere(_sph) && c.distanceTo(_sph.center) < 45 && losClear(c, _sph.center)) return true;
    }
    // the peek: her head/hand slides past the corner on her local -x side
    if (S.ai === 'peek' && S.peekT > 0.6) {
      const lx = new V3(Math.cos(M.yaw), 0, -Math.sin(M.yaw)).multiplyScalar(-0.55 * S.mirror);
      _sph.center.set(M.pos.x + lx.x, 1.1, M.pos.z + lx.z);
      if (_frus.intersectsSphere(_sph) && losClear(c, _sph.center)) return true;
    }
    return false;
  }

  /* ---------------- events ---------------- */
  function startClock() { if (!S.started) { S.started = true; S.tStart = G.time; } }
  G.on('start', startClock); G.on('begin', () => { if (!G.modules.some(m => m.name === 'mission')) startClock(); });
  G.on('intel', d => {
    const n = (d && d.n) || 1;
    if (n >= 1) setStage(2, 'intel ' + n);
    if (n === 1) S.pendingStage = { stage: 3, t: G.time + 40 };
    if (n >= 2) setStage(4, 'intel ' + n);
    if (n >= 3) S.pendingStage = { stage: 5, t: G.time + 25 };
  });
  G.on('power-cut', () => { setStage(2, 'power-cut'); if (M.stage < 3) S.pendingStage = { stage: 3, t: G.time + 15 }; });
  G.on('bell', () => setStage(5, 'bell'));
  G.on('footstep', d => {
    if (M.stage < 4 || !(S.ai === 'stalk' || S.ai === 'search')) return;
    const Pl = G.player || {}; if (Pl.crouched && !(d && d.loud)) return;
    const r = d && d.loud ? T.hear.loud : T.hear.walk, at = (d && d.pos) || playerPos();
    if (flatDist(at, M.pos) < r) { S.noise = new V3(at.x, 0, at.z); if (S.ai === 'search') { S.target = null; setAI('stalk'); } }
  });
  G.on('noise', d => { if (M.stage >= 4 && d && d.pos && S.ai === 'stalk' && flatDist(d.pos, M.pos) < (d.radius || 10)) S.noise = new V3(d.pos.x, 0, d.pos.z); });
  G.on('player-hide', d => {
    const id = d && d.spot != null ? (d.spot.id != null ? d.spot.id : d.spot) : (G.player && G.player.hidden);
    if ((S.ai === 'hunt' || S.ai === 'stalk' || S.ai === 'search') && (G.time - S.seenT < 1.6 || losClear(mEye(_c), pEye()) && flatDist(M.pos, playerPos()) < 20)) { S.sawHide = id; log('saw him hide in', id); }
    else S.sawHide = null;
  });
  G.on('shift-start', () => { goGone('shift'); S.shiftMode = true; });
  G.on('monster-summon', d => {
    if (S.ended || !S.loaded) return; S.gone = false; S.shiftMode = true;
    const p = d && d.pos ? d.pos : backstagePoint(); M.pos.set(p.x, p.y || 0, p.z); M.present = true; S.root.visible = true; setOpacity(1);
    if (M.stage < 4) M.stage = 4; S.grabCD = 2; setAI('hunt'); S.lastSeen = playerPos().clone(); S.seenT = G.time; log('summoned into the shift');
  });
  G.on('shift-end', () => { if (S.shiftMode) goGone('shift-end'); S.shiftMode = false; });
  G.on('ending', () => { S.ended = true; goGone('ending'); });
  G.on('game-over', () => { S.ai = 'off'; });
  function goGone(why) { S.gone = true; S.ai = 'off'; S.reveal = null; S.glimpse = null; S.presence = null; M.present = false; if (S.root) S.root.visible = false; M.state = 'gone'; log('gone:', why); }

  /* ---------------- capture hooks (#jump=monster-*) ---------------- */
  function captureSetup() {
    const j = G.jump || ''; if (!j.startsWith('monster-')) return;
    S.capture = j; S.started = true; S.tStart = G.time;
    const hasLevel = G.modules.some(m => m.name === 'level' && m.ok), hasPlayer = G.modules.some(m => m.name === 'player' && m.ok);
    if (!hasLevel) { // open-ground test bed: a plane, a dim lamp, one wall to peek round
      const g = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x232325, roughness: 0.6 })); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; G.scene.add(g);
      G.scene.add(new THREE.HemisphereLight(0x8a8c96, 0x101012, 0.55));
      const lamp = new THREE.PointLight(0xf0e8d8, 2.2, 24, 1.5); lamp.position.set(2.5, 4, -8); G.scene.add(lamp);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.4), new THREE.MeshStandardMaterial({ color: 0x5a5955, roughness: 0.9 })); wall.position.set(2.2, 1.5, -8); G.scene.add(wall);
      if (G.world) { G.world.colliders = (G.world.colliders || []).concat([new THREE.Box3().setFromObject(wall)]); G.world.lights = (G.world.lights || []).concat([lamp]); }
      if (G.fx && G.fx.patch) try { G.fx.patch(G.scene); } catch (e) { /* fine */ }
    }
    if (!G.modules.some(m => m.name === 'mission' && m.ok) && G.ui && G.ui.fade) { const f = document.getElementById('fade'); if (f) f.style.transition = 'none'; G.ui.fade(0); }
    if (!hasPlayer) { G.camera.position.set(playerPos().x, 1.6, playerPos().z); G.camera.rotation.set(-0.03, 0, 0); }
    const P = playerPos(), f = camForward();
    if (j === 'monster-trace') { setStage(2, 'jump'); }
    if (j === 'monster-glimpse') { M.stage = 2; setStage(3, 'jump'); }
    if (j === 'monster-peek' || j === 'monster-hunt' || j === 'monster-ai' || j === 'monster-reveal') { M.stage = 3; setStage(4, 'jump'); }
    if (j === 'monster-peek') {
      const ps = peekSpot(4, 14, true) || { pos: new V3(P.x + f.x * 7, 0, P.z + f.z * 7), yaw: Math.atan2(-f.x, -f.z), mirror: 1 };
      startPeek(ps); S.peekT = -999; S.captureHold = { name: 'Peek', at: 3.1 };
    }
    if (j === 'monster-hunt') {
      M.pos.set(P.x + f.x * 5.5 - f.z * 0.6, 0, P.z + f.z * 5.5 + f.x * 0.6); M.yaw = Math.atan2(-f.x, -f.z);
      setAI('hunt'); S.captureHold = { name: 'Crawl', at: 0.4 }; play('Crawl', { snap: true });
    }
    if (j === 'monster-ai') { M.pos.set(P.x + f.x * 14, 0, P.z + f.z * 14); M.yaw = Math.atan2(-f.x, -f.z); }
    if (j === 'monster-reveal') { S.ai = 'off'; M.stage = 4; setStage(5, 'jump'); if (S.reveal) S.reveal.t = 0.69; }
    if (/mlit/.test(location.hash)) { applyInk(0); G.scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 1.6)); } // debug: true colours
    log('capture', j);
  }

  /* ---------------- module ---------------- */
  G.register('monster', {
    order: 30,
    init() {
      return G.loadGLB('monster/monster.glb').then(buildModel).catch(e => { console.warn('[monster] monster.glb failed to load; she stays unseen', e); });
    },
    onReady() {},
    update(dt) {
      if (!S.readyDone) { S.readyDone = true; captureSetup(); if (!S.started && !G.modules.some(m => m.name === 'mission' && m.ok) && document.getElementById('card-start') && document.getElementById('card-start').hidden) startClock(); }
      const P = playerPos();
      S.playerVel.subVectors(P, S.lastPlayer).multiplyScalar(1 / Math.max(dt, 1e-3)); S.playerVel.y = 0; S.lastPlayer.copy(P);

      // ladder: time fallback and pending steps
      if (S.started && !S.gone && !S.capture) {
        const t = G.time - S.tStart;
        for (let n = M.stage + 1; n <= 5; n++) if (t >= T.fallback[n]) setStage(n, 'time'); else break;
      }
      if (S.pendingStage && G.time >= S.pendingStage.t) { const p = S.pendingStage; S.pendingStage = null; setStage(p.stage, 'follow-up'); }

      // stage 1-3 sounds
      if (S.started && !S.gone && M.stage >= 1 && M.stage <= 3) { S.soundT -= dt; if (S.soundT <= 0) { S.soundT = rand(12, 24); soundAround(['drag', 'knock', 'koto', 'drag', 'breath'][Math.floor(Math.random() * 5)]); } }

      // presence (unseen passing)
      if (S.presence) { const pr = S.presence; pr.t += dt; const k = clamp(pr.t / pr.dur, 0, 1); pr.pos = pr.pos.clone().lerp(pr.to, dt / Math.max(0.01, pr.dur - pr.t + dt)); if (k >= 1 && S.ai !== 'reveal') S.presence = null; }

      // glimpse
      if (S.glimpseWant > 0 && !S.glimpse && M.stage === 3) { S.glimpseWant -= dt; if ((S.glimpseTry = (S.glimpseTry || 0) - dt) <= 0) { S.glimpseTry = 1.5; if (tryGlimpse()) S.glimpseWant = 0; } }
      if (S.glimpse) {
        const gl = S.glimpse; gl.t += dt; const step = 1.3 * dt, nx = M.pos.x + Math.sin(gl.yaw) * step, nz = M.pos.z + Math.cos(gl.yaw) * step;
        if (walkableAt(nx, nz)) { M.pos.x = nx; M.pos.z = nz; } M.yaw = gl.yaw;
        setOpacity(clamp((gl.dur - gl.t) / 1.0, 0, 1));
        if (gl.t > gl.dur) { S.glimpse = null; M.present = false; S.root.visible = false; setOpacity(1); }
      }

      // reveal sequence: lamps die -> she is there under a red light -> unfolds to 1.95 m -> drops and comes
      if (S.ai === 'reveal' && S.reveal) {
        const r = S.reveal; r.t += dt;
        if (r.t > 0.7 && !M.present) {
          M.pos.copy(r.pos); M.yaw = yawTo(P); M.present = true; S.root.visible = true; setOpacity(1); applyInk(0);
          play('Idle', { snap: true, speed: 0.7 }); S.unfoldTarget = 1.55; S.lamp.intensity = 0; G.emit('monster-reveal', { pos: M.pos.clone() }); log('REVEAL');
          if (G.fx && G.fx.spike) G.fx.spike(1); SFX.koto(M.pos);
        }
        if (M.present) { S.lamp.intensity = Math.min(2.4, S.lamp.intensity + dt * 3); M.yaw = yawTo(P); if (S.capture === 'monster-reveal') { S.unfold = S.unfoldTarget; S.lamp.intensity = 2.4; r.t = Math.min(r.t, 2); } }
        if (r.t > 4.2 && S.unfoldTarget > 1) { S.unfoldTarget = 1; SFX.screech(M.pos, 1.2); }
        if (r.t > 4.7) { S.reveal = null; S.presence = null; S.lamp.intensity = 0; S.lastSeen = P.clone(); S.seenT = G.time; S.grabCD = 1; setAI('hunt'); }
      }

      // AI
      if (M.stage >= 4 && !S.gone && S.loaded && S.ai !== 'off' && S.ai !== 'reveal') {
        if (S.captureHold && S.capture !== 'monster-ai') { // frozen pose for screenshots
          const a = S.actions[S.captureHold.name]; if (a) { if (S.cur !== a) play(S.captureHold.name, { snap: true }); a.time = S.captureHold.at; a.timeScale = 0; S.mixer.update(0); }
          M.yaw = S.ai === 'peek' ? S.peekYaw : yawTo(P);
        } else aiUpdate(dt);
      }

      // the rim light stays on her back while she is a shape
      if (S.rim) S.rim.intensity = M.present && S.ink > 0.5 ? 0.9 : 0;
      if (S.mirror === -1 && S.ai !== 'peek') S.mirror = 1;
      animate(dt); placeRoot(dt);

      // the level answers her
      lightsUpdate(dt); fearUpdate(dt);

      // shared state, exact every frame
      M.distance = M.present ? M.pos.distanceTo(_a.copy(P).setY(M.pos.y)) : 999;
      M.visible = computeVisible();
      M.state = S.gone ? 'gone' : M.stage < 4 || S.ai === 'off' ? (S.ai === 'off' && M.stage >= 4 ? 'stalk' : 'dormant') :
        ({ stalk: 'stalk', peek: 'stalk', hunt: 'hunt', lunge: 'hunt', reveal: 'hunt', search: 'search', retreat: 'retreat', backoff: 'retreat', flinch: 'retreat' })[S.ai] || 'stalk';
      if (S.gone || M.state === 'gone') M.state = 'gone';
      M.ai = S.ai; M.menace = S.menace;
      if (!M.present && !S.presence) M.pos.y = M.pos.y; // pos keeps her last place; distance says 999 when she is not in the world
    }
  });
})();
