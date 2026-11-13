/* mission.js: probe 04 mission flow. OWNER: B-mission.
 * Title sequence ("The Long Way Home"), phases + objectives, the three dead drops (intel), the bell, game over / checkpoint,
 * the shinkansen on Platform 1, the ending cinematic and the end card with the feedback form. Capture hooks via G.jump.
 * Writes: G.mission, #objective #intel #toast #title-text #card-end (+ #prompt only when no G.interact exists, i.e. no player module).
 * Reads (guarded): G.world.spawn / drops / points / platform / track / bell, G.interact, G.player, G.ui.
 */
(function () {
  'use strict';
  const G = window.G; if (!G) return;
  const THREE = G.THREE, V = THREE.Vector3;
  const HASH = new URLSearchParams(location.hash.slice(1));
  const $ = id => document.getElementById(id);
  const ui = () => G.ui || { el: $, fade: v => { const f = $('fade'); if (f) f.style.opacity = v; }, flash() {}, toast() {} };
  const hasMod = n => G.modules.some(m => m.name === n && m.ok);
  const shiftPresent = () => G.modules.some(m => m.ok && (m.name === 'worldshift' || m.name === 'shift' || m.order === 50));

  /* ---------------- words ---------------- */
  const INTEL = [
    { label: 'DEAD DROP 1 / 3 · A LETTER, RED THREAD',
      text: '"You said the last train south. I will wait by the post office wall until you come back for me. S."\n' +
            'Never opened. Red thread, wound three times. Pinned to it, your handler\'s card:\n' +
            '"Bring the letter. It is your ticket out. Arcade, then the bar alley."' },
    { label: 'DEAD DROP 2 / 3 · THE TAB LEDGER',
      text: 'The owner\'s hand, 1979: "The foreigner bought two seats on the last train. He boarded alone. She is still waiting."\n' +
            'Below it, fresh ink, your handler\'s cipher: "She takes the next foreigner in his place. Send one. Close the file."' },
    { label: 'DEAD DROP 3 / 3 · EMA, THE SHRINE WALL',
      text: '"The 03:10 has not run since the flash. It stops for one passenger the shrine lets through."\n' +
            'On the back, a child\'s pencil timetable: "Ring once. Walk with the bell. Platform 1. Do not look back until it moves."' }
  ];
  const OBJ = {
    arrival: 'Dead drop: Yamada Pharmacy, in the arcade',
    drop1: 'Take the letter from drawer three',
    hunt1: 'Second drop: the izakaya ledger, bar alley',
    drop2: 'Take the tab ledger behind the counter',
    drop3: 'Third drop: the ema wall at the shrine',
    bell: 'Ring the shrine bell',
    shift: 'Walk. Keep the red light ahead of you',
    platform: 'Platform 1. The 03:10',
    ending: ''
  };

  /* ---------------- state ---------------- */
  const M = G.mission;
  M.phase = 'boot'; M.intel = 0; M.objective = ''; M.t = 0;
  let checkpoint = null, ckPhase = 'arrival', busy = false, timers = [];
  let P = null;          // resolved points {spawn, drops[3], bell, platform}
  const interacts = [];
  let spyGltf = null, monGltf = null, trainGltf = null, platGltf = null;

  function setPhase(p) { M.phase = p; M.t = 0; if (p in OBJ) setObjective(OBJ[p]); }
  function setObjective(s) { M.objective = s; const o = $('objective'); if (o) o.textContent = s; }
  function setIntelHud() { const e = $('intel'); if (e) e.textContent = M.intel ? 'INTEL ' + M.intel + ' / 3' : ''; }
  function toast(label, text, sec) { const t = $('toast'); if (t) t.style.whiteSpace = 'pre-line'; ui().toast(label, text, sec); }
  function after(sec, fn) { timers.push({ at: G.time + sec, fn }); }
  function hud(on) { const h = $('hud'); if (h) h.hidden = !on; }

  /* ---------------- world points (guarded; fallbacks for a flat plane) ---------------- */
  function toVec(v) {
    if (!v) return null; if (v.isVector3) return v.clone(); if (v.pos) return toVec(v.pos); if (v.position) return toVec(v.position);
    if (Array.isArray(v)) return new V(v[0] || 0, v[1] || 0, v[2] || 0); if ('x' in v) return new V(v.x, v.y || 0, v.z || 0); return null;
  }
  function wpt(name, i) {
    const W = G.world || {};
    let v = W[name] || (W.points && W.points[name]) || (W.markers && W.markers[name]) || (W.pois && W.pois[name]);
    if (!v && i != null) { const arr = W.drops || W.intel || W.dropPoints; if (arr && arr[i]) v = arr[i]; }
    return v ? { pos: toVec(v), yaw: (v && typeof v.yaw === 'number') ? v.yaw : null } : null;
  }
  const fwd = yaw => new V(-Math.sin(yaw), 0, -Math.cos(yaw));
  const rgt = yaw => new V(Math.cos(yaw), 0, -Math.sin(yaw));
  const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
  function resolvePoints() {
    const W = G.world || {}; let sp = W.spawn;
    const spawn = { pos: toVec(sp) || new V(0, 0, 0), yaw: (sp && typeof sp.yaw === 'number') ? sp.yaw : (typeof W.spawnYaw === 'number' ? W.spawnYaw : 0) };
    const f = fwd(spawn.yaw), r = rgt(spawn.yaw), at = (a, b) => spawn.pos.clone().addScaledVector(f, a).addScaledVector(r, b);
    const fb = [at(14, -3), at(30, 4), at(46, -2)];
    const drops = [0, 1, 2].map(i => { const w = wpt('drop' + (i + 1), i); return { pos: (w && w.pos) || fb[i], fallback: !(w && w.pos) }; });
    const bellV = toVec(W.bell);
    const bell = { pos: bellV || at(54, 0), fallback: !bellV };
    // integration: level.js publishes the platform as G.world.station.platform (a Vector3)
    const stP = W.station && toVec(W.station.platform);
    const pw = stP ? { pos: stP, yaw: null } : (wpt('platform') || wpt('station'));
    const platform = { pos: (pw && pw.pos) || at(62, 12), yaw: pw ? pw.yaw : null, given: !!pw };
    P = { spawn, drops, bell, platform };
  }

  /* ---------------- teleport / respawn helpers ---------------- */
  function camFallback(pos, yaw) { if (hasMod('player')) return; G.camera.position.set(pos.x, pos.y + 1.6, pos.z); G.camera.rotation.set(0, yaw, 0); }
  function teleport(pos, yaw) { G.emit('teleport', { pos: pos.clone(), yaw }); camFallback(pos, yaw); }
  function standOff(target, from, d) { // a point d metres from target, toward `from`, facing target
    const dir = from.clone().sub(target).setY(0); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
    const p = target.clone().addScaledVector(dir, d); p.y = from.y; return { pos: p, yaw: yawTo(p, target) };
  }

  /* ---------------- interactions (G.interact if present, else proximity + E) ---------------- */
  function addInteract(def) {
    def.radius = def.radius || 1.8; def.enabled = def.enabled || (() => true);
    const use = () => { if (def.done || !def.enabled()) return; def.onUse(); };
    if (G.interact && typeof G.interact.add === 'function') {
      try {
        def.handle = G.interact.add({ id: def.id, pos: def.pos, position: def.pos, radius: def.radius, label: def.label, text: def.label, prompt: def.label,
          enabled: () => !def.done && def.enabled(), onUse: use, use, action: use, callback: use });
        def.external = true;
      } catch (e) { console.warn('[mission] G.interact.add failed; using proximity fallback', e); }
    }
    interacts.push(def); return def;
  }
  function removeInteract(def) {
    def.done = true;
    if (def.external && G.interact) { try { if (G.interact.remove) G.interact.remove(def.handle != null ? def.handle : def.id); } catch (e) { /* ignore */ } }
  }
  let promptShown = false;
  function updateInteracts() {
    let near = null; const pp = G.player && G.player.pos;
    if (!pp) return;
    for (const d of interacts) {
      if (d.done || d.external || !d.enabled()) continue;
      const dx = d.pos.x - pp.x, dz = d.pos.z - pp.z;
      if (dx * dx + dz * dz < d.radius * d.radius && Math.abs(d.pos.y - pp.y) < 3.5) { near = d; break; }
    }
    if (G.interact && typeof G.interact.add === 'function') return; // the owner of G.interact draws prompts
    const pr = $('prompt');
    if (near) { if (pr) { pr.textContent = '[E] ' + near.label; pr.hidden = false; } promptShown = true; if (G.input.interact) near.onUse(); }
    else if (promptShown) { if (pr) pr.hidden = true; promptShown = false; }
  }

  /* ---------------- drop props (small, findable; the level may also dress the spot) ---------------- */
  const propGroup = new THREE.Group(); propGroup.name = 'mission-props';
  const matWhite = new THREE.MeshStandardMaterial({ color: 0xe8e6e1, roughness: .8, emissive: 0x2a2a2a });
  const matRed = new THREE.MeshStandardMaterial({ color: 0xb3121b, roughness: .6, emissive: 0x300000 });
  const matGrey = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: .9 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: .5, metalness: .3 });
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  function makeDropProp(i, d) {
    const g = new THREE.Group(); g.position.copy(d.pos);
    const top = d.fallback ? 0.9 : 0;
    if (d.fallback) { const ped = box(.5, .9, .4, matGrey); ped.position.y = .45; ped.castShadow = ped.receiveShadow = true; g.add(ped); }
    if (i === 2) { // ema plaque
      const e = box(.24, .16, .02, new THREE.MeshStandardMaterial({ color: 0x8d8b86, roughness: .9 })); e.position.y = top + .3; g.add(e);
      const t = box(.01, .2, .025, matRed); t.position.set(0, top + .43, 0); g.add(t);
    } else {
      const env = box(i === 0 ? .22 : .2, i === 0 ? .01 : .04, i === 0 ? .12 : .28, i === 0 ? matWhite : matGrey); env.position.y = top + .02; g.add(env);
      if (i === 0) for (let k = 0; k < 3; k++) { const th = box(.006, .014, .13, matRed); th.position.set(-.03 + k * .03, top + .02, 0); g.add(th); }
    }
    propGroup.add(g); return g;
  }

  /* ---------------- title sequence ---------------- */
  const TITLE_LEN = 15.2;
  const T = { group: null, spy: null, mixer: null, acts: {}, cur: null, rain: null, ash: null, disc: null, t: 0, hold: null, active: false, hidden: [], fog: null, bg: null };
  const TITLE_O = new V(3000, 0, 3000);
  function buildTitleSet() {
    const g = new THREE.Group(); g.name = 'mission-title'; g.position.copy(TITLE_O); g.visible = false;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: .62, metalness: .25 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const key = new THREE.SpotLight(0xf3f0e8, 3.2, 22, 0.42, 0.18, 1.2); key.position.set(-1.2, 7.5, 2.2); key.target.position.set(0, 0.8, 0);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; g.add(key, key.target);
    const rim = new THREE.SpotLight(0xff1a1a, 5, 16, 0.5, 0.35, 1); rim.position.set(2.6, 3.2, -3.4); rim.target.position.set(0, 1.4, 0); g.add(rim, rim.target);
    const rim2 = new THREE.SpotLight(0xb3121b, 3, 16, 0.5, 0.4, 1); rim2.position.set(-2.8, 2.4, -3.0); rim2.target.position.set(0, 1.2, 0); g.add(rim2, rim2.target);
    g.add(new THREE.AmbientLight(0xffffff, 0.035));
    // red disc behind him (shot 3)
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 64), new THREE.MeshBasicMaterial({ color: 0x8a0d14, transparent: true, opacity: 0, fog: false }));
    disc.position.set(0, 2.5, -9); g.add(disc); T.disc = disc;
    // rain streaks
    const N = 700, rp = new Float32Array(N * 6), seeds = [];
    for (let i = 0; i < N; i++) { const x = (Math.random() - .5) * 14, y = Math.random() * 9, z = (Math.random() - .5) * 14 + 1; seeds.push([x, y, z, 8 + Math.random() * 4]); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    T.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9a9a9e, transparent: true, opacity: .35 })); T.rain.userData.seeds = seeds; T.rain.frustumCulled = false; g.add(T.rain);
    // ash
    const A = 260, ap = new Float32Array(A * 3), aseeds = [];
    for (let i = 0; i < A; i++) aseeds.push([(Math.random() - .5) * 10, Math.random() * 6, (Math.random() - .5) * 10 + 1, Math.random() * 6.28]);
    const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.BufferAttribute(ap, 3));
    T.ash = new THREE.Points(ag, new THREE.PointsMaterial({ color: 0xcfcac2, size: .035, transparent: true, opacity: .8 })); T.ash.userData.seeds = aseeds; T.ash.frustumCulled = false; g.add(T.ash);
    if (spyGltf) {
      const s = spyGltf.scene; s.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } }); g.add(s); T.spy = s;
      T.mixer = new THREE.AnimationMixer(s); for (const c of spyGltf.animations) T.acts[c.name] = T.mixer.clipAction(c);
      if (T.acts.title) { T.acts.title.setLoop(THREE.LoopOnce, 1); T.acts.title.clampWhenFinished = true; }
    } else { // silhouette stand-in
      const s = new THREE.Group(); const b = box(.5, 1.5, .3, matDark); b.position.y = .75; const h = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 8), matDark); h.position.y = 1.65; s.add(b, h); g.add(s); T.spy = s;
    }
    G.scene.add(g); T.group = g;
  }
  function useAct(name, time) {
    const a = T.acts[name]; if (!a || !T.mixer) return;
    if (T.cur !== name) { T.mixer.stopAllAction(); a.reset(); a.play(); T.cur = name; }
    const D = a.getClip().duration; a.time = name === 'title' ? Math.max(0, Math.min(time, D - 1e-3)) : ((time % D) + D) % D; T.mixer.update(0);
  }
  function titleTextHTML() {
    const tt = $('title-text'); if (!tt) return; tt.innerHTML = ''; tt.style.justifyContent = 'flex-end';
    const mk = (cls, css, txt) => { const d = document.createElement('div'); d.className = cls; d.style.cssText = css + ';opacity:0;transition:opacity 1.1s, width 1.8s ease'; if (txt) d.textContent = txt; tt.appendChild(d); return d; };
    T.el = {
      cred1: mk('t-c1', 'font:500 12px var(--font-mono);letter-spacing:.45em;color:var(--muted)', 'KAGEMACHI  ·  02:41'),
      cred2: mk('t-c2', 'font:500 12px var(--font-mono);letter-spacing:.45em;color:var(--muted)', 'THE LAST FOREIGNER IN TOWN'),
      title: mk('t-ti', 'font:700 clamp(38px,7vw,84px)/1 var(--font-title);letter-spacing:.03em;color:var(--paper);text-shadow:0 2px 18px #000', 'The Long Way Home'),
      rule: mk('t-ru', 'height:2px;background:var(--red);width:0'),
      skip: mk('t-sk', 'position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));font:500 11px var(--font-mono);letter-spacing:.2em;color:#5a5955', 'ANY KEY TO SKIP')
    };
  }
  function hideWorld(on) {
    if (on) {
      T.hidden = [];
      for (const c of G.scene.children) if (c !== T.group && c.visible) { T.hidden.push(c); c.visible = false; }
      T.fog = G.scene.fog; G.scene.fog = null; T.bg = G.scene.background; G.scene.background = new THREE.Color(0x000000);
      if (G.overlay && G.overlay.scene) { T.ovl = G.overlay.scene.visible; G.overlay.scene.visible = false; }
    } else {
      for (const c of T.hidden) c.visible = true; T.hidden = [];
      if (T.fog !== null) G.scene.fog = T.fog; if (T.bg) G.scene.background = T.bg;
      if (G.overlay && G.overlay.scene && T.ovl !== undefined) G.overlay.scene.visible = T.ovl;
    }
  }
  function beginTitle(hold) {
    if (T.active || M.phase !== 'boot') return;
    setPhase('title'); hud(false);
    if (!T.group) buildTitleSet();
    T.group.visible = true; hideWorld(true); T.t = hold != null ? hold : 0; T.hold = hold; T.active = true; T.skipAfter = G.time + 0.8;
    titleTextHTML(); ui().fade(hold != null ? 0 : 0); // CSS transition gives the 1.2 s fade-in from black
  }
  function updateTitle(dt) {
    if (T.hold == null) T.t += dt; const t = T.t;
    const S = T.spy, cam = G.camera, O = TITLE_O;
    // performance
    let look;
    if (t < 5) { // shot 1: he walks out of the dark into the key light; low, centred, slow push
      const z = -4.6 + Math.min(1, Math.max(0, (t - 0.3) / 4.5)) * 4.6; if (S) S.position.set(0, 0, z);
      if (z < -0.01) useAct('walk', t * 1.0); else useAct('idle', t);
      const k = t / 5; cam.position.set(O.x, O.y + 0.38 + 0.12 * k, O.z + 6.6 - 1.0 * k); look = new V(O.x, O.y + 1.15, O.z + z * 0.6);
    } else if (t < 10) { // shot 2: medium close, the head turns to camera
      if (S) S.position.set(0, 0, 0); useAct('title', (t - 5) * 1.0);
      const k = (t - 5) / 5; cam.position.set(O.x + 0.32 - 0.08 * k, O.y + 1.62, O.z + 2.25 - 0.35 * k); look = new V(O.x, O.y + 1.52, O.z);
    } else { // shot 3: symmetric wide, red disc, title
      if (S) S.position.set(0, 0, 0); useAct('title', 99);
      const k = Math.min(1, (t - 10) / 5); cam.position.set(O.x, O.y + 1.0, O.z + 5.6 - 0.6 * k); look = new V(O.x, O.y + 1.6, O.z);
    }
    cam.lookAt(look);
    if (T.disc) T.disc.material.opacity = t < 10 ? 0 : Math.min(.95, (t - 10) / 1.6);
    // particles
    const rs = T.rain.userData.seeds, ra = T.rain.geometry.attributes.position.array;
    for (let i = 0; i < rs.length; i++) { const s = rs[i]; const y = ((s[1] - t * s[3]) % 9 + 9) % 9; ra.set([s[0], y, s[2], s[0] - .02, y + .28, s[2]], i * 6); }
    T.rain.geometry.attributes.position.needsUpdate = true;
    const as = T.ash.userData.seeds, aa = T.ash.geometry.attributes.position.array;
    for (let i = 0; i < as.length; i++) { const s = as[i]; aa[i * 3] = s[0] + Math.sin(t * .4 + s[3]) * .3; aa[i * 3 + 1] = ((s[1] - t * .18) % 6 + 6) % 6; aa[i * 3 + 2] = s[2] + Math.cos(t * .3 + s[3]) * .3; }
    T.ash.geometry.attributes.position.needsUpdate = true;
    // type
    const E = T.el; if (E) {
      E.cred1.style.opacity = t > 1.2 && t < 4.4 ? 1 : 0; E.cred2.style.opacity = t > 5.6 && t < 9.2 ? 1 : 0;
      E.title.style.opacity = t > 10.3 && t < 14.4 ? 1 : 0; E.rule.style.opacity = t > 10.6 && t < 14.4 ? 1 : 0; E.rule.style.width = t > 10.6 ? 'min(420px,60vw)' : '0';
      E.skip.style.opacity = t < 13 && T.hold == null ? 1 : 0;
      E.cred1.style.order = 1; E.cred2.style.order = 2; E.title.style.order = 3; E.rule.style.order = 4;
    }
    if (T.hold == null && t > 14.2 && !T.fading) { T.fading = true; ui().fade(1); }
    if (T.hold == null && t >= TITLE_LEN) endTitle();
  }
  function endTitle() {
    if (!T.active) return; T.active = false; T.group.visible = false; hideWorld(false);
    const tt = $('title-text'); if (tt) tt.innerHTML = '';
    startPlay();
  }
  function skipTitle() { if (!T.active || T.hold != null || G.time < T.skipAfter) return; ui().fade(1); T.active = false; setTimeout(() => { T.active = true; endTitle(); }, 450); }

  /* ---------------- play ---------------- */
  function startPlay(quiet) {
    if (!P) resolvePoints();
    hud(true); setIntelHud();
    setPhase('arrival'); checkpoint = { pos: P.spawn.pos.clone(), yaw: P.spawn.yaw }; ckPhase = 'arrival';
    teleport(P.spawn.pos, P.spawn.yaw);
    G.emit('start');
    ui().fade(0);
    if (!quiet) {
      after(1.6, () => toast('HANDLER · RADIO', 'Kagemachi. Your train leaves at 03:10. Be on it.', 5));
      after(8.5, () => toast('HANDLER · RADIO', 'North road is down. Go through the arcade.\nYamada Pharmacy, second door on your left. Drawer three.', 7));
    }
  }
  function takeIntel(i) {
    if (M.intel > i) return;
    M.intel = i + 1; setIntelHud();
    const it = INTEL[i]; G.emit('intel', { n: i + 1, text: it.text });
    toast(it.label, it.text, 12);
    if (drops[i]) { drops[i].visible = false; }
    const d = P.drops[i]; checkpoint = standOff(d.pos, G.player && G.player.pos ? G.player.pos : P.spawn.pos, 1.4);
    if (i === 0) { ckPhase = 'hunt1'; setPhase('hunt1'); G.emit('power-cut');
      after(7, () => toast('HANDLER · RADIO', 'Static means it is close. Get behind a door, kill your light.\nDo not run unless it has seen you.', 7)); }
    if (i === 1) { ckPhase = 'drop3'; setPhase('drop3'); after(13, () => toast('RADIO', '(static. the handler does not answer.)', 4)); }
    if (i === 2) { ckPhase = 'bell'; setPhase('bell'); }
  }
  function ringBell() {
    if (M.phase !== 'bell') return;
    removeInteract(bellI); G.emit('bell'); setObjective('');
    after(2.5, () => { setPhase('shift'); G.emit('shift-start');
      if (!shiftPresent()) after(4, () => G.emit('shift-end')); });
  }

  /* ---------------- train, platform, ending ---------------- */
  const TR = { group: null, ext: null, interior: null, doors: [], L: 0, doorX: 0, s: 0, sStop: 0, state: 'none', t: 0, P0: null, dir: null, side: null, railY: 0, anchor: null, boardI: null, track: null, mon: null, monMixer: null };
  function noseGeo(len, h, w) {
    const g = new THREE.SphereGeometry(1, 32, 16); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (x > 0) { const t = x; y = y * (1 - .5 * Math.pow(t, 1.4)) - .38 * t * t; z = z * (1 - .3 * t * t); }
      p.setXYZ(i, x * len, y * h, z * w); }
    g.computeVertexNormals(); return g;
  }
  function buildProcTrain() {
    const g = new THREE.Group(); const L = 100, nose = 11, W = 3.4, H = 3.5, yc = .45 + H / 2;
    const white = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: .35, metalness: .15 });
    const win = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: .15, metalness: .6 });
    const sh = new THREE.Shape(); const hw = W / 2, r = .9, rb = .35, y0 = -H / 2, y1 = H / 2;
    sh.moveTo(-hw + rb, y0); sh.lineTo(hw - rb, y0); sh.quadraticCurveTo(hw, y0, hw, y0 + rb); sh.lineTo(hw, y1 - r); sh.quadraticCurveTo(hw, y1, hw - r, y1);
    sh.lineTo(-hw + r, y1); sh.quadraticCurveTo(-hw, y1, -hw, y1 - r); sh.lineTo(-hw, y0 + rb); sh.quadraticCurveTo(-hw, y0, -hw + rb, y0);
    const bodyLen = L - 2 * nose; const bg = new THREE.ExtrudeGeometry(sh, { depth: bodyLen, bevelEnabled: false, curveSegments: 8 }); bg.rotateY(Math.PI / 2);
    const body = new THREE.Mesh(bg, white); body.position.set(-L + nose, yc, 0); g.add(body);
    const front = new THREE.Mesh(noseGeo(nose, H / 2, W / 2), white); front.position.set(-nose, yc, 0); g.add(front);
    const rear = new THREE.Mesh(noseGeo(nose, H / 2, W / 2), white); rear.rotation.y = Math.PI; rear.position.set(-L + nose, yc, 0); g.add(rear);
    for (const sx of [1, -1]) {
      const band = box(bodyLen, .55, .04, win); band.position.set(-L / 2, yc + .55, sx * (hw + .01)); g.add(band);
      const red = box(bodyLen + 6, .13, .04, matRed); red.position.set(-L / 2, yc - .05, sx * (hw + .015)); g.add(red);
      const skirt = box(bodyLen, .35, .05, matGrey); skirt.position.set(-L / 2, .6, sx * (hw - .02)); g.add(skirt);
    }
    const cab = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), win); cab.scale.set(2.2, .45, 1.1); cab.position.set(-nose + 3.2, yc + 1.15, 0); g.add(cab);
    const cab2 = cab.clone(); cab2.position.x = -L + nose - 3.2; g.add(cab2);
    for (let k = 1; k < 4; k++) { const gap = box(.12, H - .2, W + .04, matGrey); gap.position.set(-nose - k * bodyLen / 4, yc, 0); g.add(gap); }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    return { g, L, nose, W, yc };
  }
  function measure(obj) { const b = new THREE.Box3().setFromObject(obj); return { min: b.min, max: b.max, size: b.getSize(new V()) }; }
  function buildTrain() {
    const g = new THREE.Group(); g.name = 'mission-train';
    let L, nose = 11, ext, W = 3.4;
    if (trainGltf) {
      const s = trainGltf.scene; const holder = new THREE.Group(); holder.add(s);
      let m = measure(s); if (m.size.z > m.size.x) { s.rotation.y = Math.PI / 2; m = measure(holder); }
      let sc = 1; if (m.size.x > 500 || m.size.x < 15) sc = 100 / m.size.x; holder.scale.setScalar(sc); m = measure(holder);
      holder.position.set(-m.max.x, -m.min.y, -(m.min.z + m.max.z) / 2); // front tip at x=0, wheels at y=0
      L = m.size.x; W = m.size.z; nose = Math.min(12, L * .1); ext = holder;
      s.traverse(o => { if (o.isMesh) o.castShadow = true; });
    } else { const p = buildProcTrain(); ext = p.g; L = p.L; nose = p.nose; W = p.W; }
    g.add(ext); TR.ext = ext; TR.L = L; TR.nose = nose; TR.W = W;
    // doors on the platform side (+z local), one per car; the boarding door is near the rear car so the camera stays in it
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2d, roughness: .5, metalness: .3 });
    const car = (L - 2 * nose) / 4; TR.doors = [];
    if (!trainGltf) for (let k = 0; k < 4; k++) {
      const x = -nose - car * k - car * .85; const d = box(1.0, 2.0, .06, doorMat); d.position.set(x, 1.45, W / 2 + .03); d.userData.x0 = x; g.add(d); TR.doors.push(d);
    }
    TR.doorX = -nose - car * 3 - car * .85;
    // interior of the rear car (used only by the ending camera)
    const it = new THREE.Group(); it.visible = false; const xb = -L + nose + .5, fl = 1.25, ce = 3.35, hw = Math.min(1.55, W / 2 - .1);
    const wall = new THREE.MeshStandardMaterial({ color: 0x8a8a8c, roughness: .8 }), dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: .8 });
    const add = (w, h, d, m, x, y, z) => { const b = box(w, h, d, m); b.position.set(x, y, z); it.add(b); return b; };
    const len = 14, xm = xb + len / 2;
    add(len, .06, hw * 2, dark, xm, fl, 0); add(len, .06, hw * 2, wall, xm, ce, 0);
    for (const sx of [1, -1]) { add(len, .7, .06, wall, xm, fl + .35, sx * hw); add(len, .45, .06, wall, xm, ce - .22, sx * hw);
      for (let x = xb + .8; x < xb + len; x += 1.7) add(.22, 1.2, .08, wall, x, fl + 1.3, sx * hw); }
    // rear bulkhead with the back window
    add(.08, .75, hw * 2, wall, xb, fl + .375, 0); add(.08, .15, hw * 2, wall, xb, ce - .075, 0);
    add(.08, 1.2, hw - 1.15, wall, xb, fl + 1.35, (hw + 1.15) / 2); add(.08, 1.2, hw - 1.15, wall, xb, fl + 1.35, -(hw + 1.15) / 2);
    add(.1, .05, 2.3, matRed, xb + .05, fl + .73, 0);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(len, .03, .25), new THREE.MeshBasicMaterial({ color: 0xf0efe9 })); strip.position.set(xm, ce - .04, 0); it.add(strip);
    for (let x = xb + 1.0; x < xb + 3.6; x += 1.05) for (const z of [-1.05, -.55, .55, 1.05]) add(.1, .5, .45, dark, x, fl + .55, z);
    const lamp = new THREE.PointLight(0xf3f0e8, .9, 12, 2); lamp.position.set(xb + 6, ce - .3, 0); it.add(lamp);
    g.add(it); TR.interior = it; TR.xb = xb;
    return g;
  }
  function buildTrack(P0, dir, side, y) {
    const g = new THREE.Group(); g.name = 'mission-track'; const q = Math.atan2(-dir.z, dir.x);
    g.position.copy(P0).setY(y); g.rotation.y = q;
    const rail = new THREE.MeshStandardMaterial({ color: 0x77777a, roughness: .3, metalness: .8 });
    for (const z of [-.72, .72]) { const r = box(1400, .14, .08, rail); r.position.set(200, .07, z); g.add(r); }
    const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(.24, .12, 2.5), matGrey, 1400), m4 = new THREE.Matrix4();
    for (let i = 0; i < 1400; i++) { m4.makeTranslation(-500 + i, 0, 0); sl.setMatrixAt(i, m4); } g.add(sl);
    for (let x = -480; x < 900; x += 32) { // catenary masts on the far side: they sell the speed
      const p = box(.25, 6.5, .25, matGrey); p.position.set(x, 3.25, -side * 3.2); g.add(p);
      const a = box(.12, .12, 3.6, matGrey); a.position.set(x, 6.1, -side * 1.5); g.add(a);
    }
    const wire = box(1400, .03, .03, matDark); wire.position.set(200, 5.9, 0); g.add(wire);
    G.scene.add(g); return g;
  }
  function trainAt(s) { const p = TR.P0.clone().addScaledVector(TR.dir, s); p.y = TR.railY; TR.group.position.copy(p); }
  function onShiftEnd() {
    if (M.phase === 'platform' || M.phase === 'ending') return;
    setPhase('platform');
    const pp = (G.player && G.player.pos && G.player.pos.lengthSq() > 0) ? G.player.pos.clone() : P.platform.pos.clone();
    const anchor = P.platform.given ? P.platform.pos.clone() : pp;
    setupPlatform(anchor, false);
    checkpoint = { pos: anchor.clone(), yaw: TR.faceYaw }; ckPhase = 'platform';
    after(1.5, () => toast('PLATFORM 1', 'A bell, far down the line. The 03:10 is coming.', 5));
  }
  function setupPlatform(anchor, stopped, yawIn) {
    const W = G.world || {}; TR.anchor = anchor.clone();
    let dir, P0, faceYaw;
    // integration: level.js publishes the track as station.{trackZ, trackY, trackDir} along the platform
    const S0 = W.station, stTrack = S0 && S0.platform && S0.trackZ != null && S0.trackDir
      ? (() => { const d = toVec(S0.trackDir).normalize(), c = new V(S0.platform.x, S0.trackY || 0, S0.trackZ); return { a: c.clone().addScaledVector(d, -60), b: c.clone().addScaledVector(d, 60), y: S0.trackY || 0 }; })()
      : null;
    const track = W.track || (W.points && W.points.track) || stTrack;
    if (track && track.a && track.b) { const a = toVec(track.a), b = toVec(track.b); dir = b.clone().sub(a).setY(0).normalize();
      const t = anchor.clone().sub(a).dot(dir); P0 = a.clone().addScaledVector(dir, t); }
    else { const yaw = yawIn != null ? yawIn : (P.platform.yaw != null ? P.platform.yaw : (G.player ? G.player.yaw || 0 : 0)); const f = fwd(yaw); dir = rgt(yaw); P0 = anchor.clone().addScaledVector(f, 4.2); }
    faceYaw = yawTo(anchor, P0);
    const side = Math.sign(anchor.clone().sub(P0).dot(new V(-dir.z, 0, dir.x))) || 1; // +1 if anchor is on the train's local +z side
    TR.dir = dir; TR.P0 = P0; TR.side = side; TR.faceYaw = faceYaw;
    TR.railY = track && track.y != null ? track.y : (hasMod('level') ? anchor.y - 1.1 : anchor.y);
    if (!TR.group) { TR.group = buildTrain(); G.scene.add(TR.group); }
    TR.group.rotation.y = Math.atan2(-dir.z, dir.x) + (side < 0 ? 0 : 0);
    if (side < 0) { TR.group.scale.z = -1; } // mirror so the doors face the platform
    if (!TR.track) { TR.track = buildTrack(P0, dir, side, TR.railY);
      const sl = new THREE.PointLight(0xe8e6e1, 1.6, 34, 1.6); sl.position.copy(anchor).addScaledVector(dir, -6).setY(anchor.y + 5); G.scene.add(sl);
      const rl = new THREE.PointLight(0xb3121b, 1.4, 26, 1.6); rl.position.copy(anchor).addScaledVector(dir, 14).setY(anchor.y + 4.5); G.scene.add(rl); }
    if (platGltf && !TR.plat) { const pl = platGltf.scene; pl.position.copy(anchor); pl.rotation.y = Math.atan2(-dir.z, dir.x); G.scene.add(pl); TR.plat = pl; }
    TR.sStop = -TR.doorX; TR.state = stopped ? 'open' : 'arrive'; TR.t = stopped ? 99 : 0;
    trainAt(stopped ? TR.sStop : TR.sStop - 260);
    if (stopped) openDoors(1);
    // the board point must be reachable from the platform: P0 is on the track centreline (~4 m past the platform edge),
    // so pull it toward the anchor (the platform side), stopping ~1.4 m short of the train's centreline.
    const toA = anchor.clone().sub(P0).setY(0), dA = toA.length();
    const doorPos = (dA > 2.2 ? P0.clone().addScaledVector(toA.normalize(), dA - 1.0) : P0.clone()).setY(anchor.y);
    if (S0 && S0.platformBox && S0.platformBox.max) { // clamp inside the platform's footprint if level gave one
      const bx = S0.platformBox; doorPos.x = Math.min(bx.max.x - .5, Math.max(bx.min.x + .5, doorPos.x)); doorPos.z = Math.min(bx.max.z - .5, Math.max(bx.min.z + .5, doorPos.z)); }
    if (!TR.boardI) TR.boardI = addInteract({ id: 'mission-board', pos: doorPos, radius: 2.6, label: 'Board', enabled: () => TR.state === 'open' && M.phase === 'platform', onUse: board });
  }
  function openDoors(k) { for (const d of TR.doors) d.position.x = d.userData.x0 - 1.05 * k; }
  function updateTrain(dt) {
    if (!TR.group || TR.state === 'none') return;
    if (TR.state === 'arrive') { TR.t += dt; const T7 = 7, u = Math.min(1, TR.t / T7); trainAt(TR.sStop - 260 * (1 - u) * (1 - u));
      if (u >= 1) { TR.state = 'doors'; TR.t = 0; } }
    else if (TR.state === 'doors') { TR.t += dt; openDoors(Math.min(1, TR.t / 1.2)); if (TR.t > 1.2) { TR.state = 'open'; setObjective('Board the train'); toast('PLATFORM 1', 'Doors open. Do not look back until it moves.', 4); } }
    else if (TR.state === 'depart') { if (END.hold == null) END.t += dt; const t = Math.max(0, END.t - .8); trainAt(TR.sStop + 0.5 * 5.5 * t * t); }
  }
  const END = { t: 0, hold: null, active: false, shown: {} };
  function board() {
    if (M.phase !== 'platform' || TR.state !== 'open') return;
    removeInteract(TR.boardI); setPhase('ending'); G.emit('ending'); hud(false);
    const pr = $('prompt'); if (pr && !(G.interact && G.interact.add)) pr.hidden = true;
    try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* fine */ }
    ui().fade(1); setTimeout(() => startEndingCine(null), 450);
  }
  function startEndingCine(hold) {
    openDoors(0); TR.state = 'depart'; END.t = hold != null ? hold : 0; END.hold = hold; END.active = true;
    TR.interior.visible = true; TR.ext.visible = false; for (const d of TR.doors) d.visible = false;
    END.cam = G.camera.visible; G.camera.visible = false; // the flashlight (camera child) stays off inside the carriage
    if (G.overlay && G.overlay.scene) G.overlay.scene.visible = false;
    placeMonsterProp();
    ui().fade(0);
  }
  function placeMonsterProp() {
    if (!monGltf || TR.mon) return;
    const m = monGltf.scene; m.position.copy(TR.anchor); m.rotation.y = yawTo(TR.anchor, TR.P0) + Math.PI; // face the train
    m.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } }); G.scene.add(m); TR.mon = m;
    TR.monMixer = new THREE.AnimationMixer(m); const c = monGltf.animations.find(a => /idle/i.test(a.name)) || monGltf.animations[0]; if (c) TR.monMixer.clipAction(c).play();
    const lamp = new THREE.PointLight(0xb3121b, 2.2, 9, 2); lamp.position.copy(TR.anchor).add(new V(0, 3.2, 0)); G.scene.add(lamp);
  }
  function updateEnding(dt) {
    if (!END.active) return;
    TR.group.updateMatrixWorld(true);
    const t = END.t, xc = TR.xb + 4.6, sway = Math.sin(t * 7) * .004 * Math.min(1, t / 3);
    G.camera.position.copy(TR.group.localToWorld(new V(xc, 2.45 + sway, .2)));
    G.camera.lookAt(TR.group.localToWorld(new V(xc - 40, 1.9, .2 + 1.4)));
    if (TR.monMixer) TR.monMixer.update(dt);
    const tt = $('title-text');
    const say = (k, html) => { if (END.shown[k] || !tt) return; END.shown[k] = 1; tt.style.justifyContent = 'flex-end'; tt.innerHTML = html; };
    if (t > 2.2) say('a', '<div style="font:500 12px var(--font-mono);letter-spacing:.45em;color:var(--muted)">03:10 · KAGEMACHI · SOUTH</div>');
    if (t > 6.2) say('b', '<div style="font:600 italic clamp(18px,2.6vw,26px) var(--font-title);text-shadow:0 2px 8px #000">She let you through.<br>The letter is still in your coat. So is her thread.</div>');
    if (t > 11) say('c', '<div style="font:700 clamp(32px,5vw,60px)/1 var(--font-title)">The Long Way Home</div><div style="height:2px;width:min(360px,56vw);background:var(--red)"></div>');
    if (END.hold == null && t > 14 && !END.fading) { END.fading = true; ui().fade(1); setTimeout(showEndCard, 1300); }
  }
  function showEndCard() {
    const card = $('card-end'), inner = $('card-end-inner'); if (!card || !inner) return;
    const tt = $('title-text'); if (tt) tt.innerHTML = '';
    inner.innerHTML = '';
    const h = document.createElement('h1'); h.innerHTML = 'End of probe <span>04</span>'; inner.appendChild(h);
    const p = document.createElement('p'); p.textContent = 'Thank you for playing. A few honest lines on each part help the next probe most. Short is fine.'; inner.appendChild(p);
    const F = [['look', 'Look: the town, the light, the rain'], ['sound', 'Sound: rain, radio, music'], ['monster', 'The monster'], ['hiding_chase', 'Hiding and the chase'], ['shift', 'The shift (bell, castle)'], ['ending_spy', 'The ending and the spy']];
    const areas = {};
    for (const [k, lab] of F) { const id = 'fb-' + k; const l = document.createElement('label'); l.htmlFor = id; l.textContent = lab; const a = document.createElement('textarea'); a.id = id; a.rows = 2; inner.append(l, a); areas[k] = a; }
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;align-items:center';
    const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Save feedback';
    const again = document.createElement('button'); again.type = 'button'; again.className = 'ghost'; again.textContent = 'Play again';
    const st = document.createElement('p'); st.setAttribute('role', 'status'); st.style.cssText = 'margin:0';
    row.append(save, again); inner.append(row, st);
    save.addEventListener('click', async () => {
      const data = { at: new Date().toISOString() }; for (const k in areas) data[k] = areas[k].value.trim();
      save.disabled = true; st.textContent = 'Saving...';
      try {
        const db = await (window.claude && window.claude.use ? window.claude.use('db') : null);
        if (!db) { st.textContent = 'Saving is not available here: copy your notes into chat.'; save.disabled = false; return; }
        await db.doc('feedback/probe04').set(data); st.textContent = 'Saved. Thank you.';
      } catch (e) { console.warn('[mission] feedback save failed', e); st.textContent = 'Could not save: copy your notes into chat.'; save.disabled = false; }
    });
    again.addEventListener('click', () => { location.hash = ''; location.reload(); });
    for (const a of Object.values(areas)) a.addEventListener('keydown', e => e.stopPropagation());
    card.hidden = false; ui().fade(0);
  }

  /* ---------------- game over ---------------- */
  function onGameOver() {
    if (busy || M.phase === 'title' || M.phase === 'ending' || M.phase === 'boot') return; busy = true;
    ui().fade(1); const tt = $('title-text');
    setTimeout(() => { if (tt) { tt.style.justifyContent = 'center'; tt.innerHTML = '<div style="font:700 clamp(44px,9vw,110px)/1 var(--font-title);letter-spacing:.12em">TAKEN</div><div style="height:2px;width:min(260px,40vw);background:var(--red)"></div>'; } }, 700);
    setTimeout(() => {
      const c = checkpoint || { pos: P.spawn.pos.clone(), yaw: P.spawn.yaw };
      G.emit('respawn', { pos: c.pos.clone(), yaw: c.yaw }); camFallback(c.pos, c.yaw);
      if (ckPhase !== M.phase && ckPhase !== 'platform') setPhase(ckPhase);
      if (ckPhase === 'bell' && bellI) { bellI.done = false; if (bellI.external && G.interact && G.interact.add) { bellI.external = false; addInteractAgain(bellI); } }
      if (tt) tt.innerHTML = ''; ui().fade(0); busy = false;
    }, 3200);
  }
  function addInteractAgain(def) { interacts.splice(interacts.indexOf(def), 1); def.handle = null; addInteract(def); }

  /* ---------------- phases per frame ---------------- */
  function hdist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  function updatePhase() {
    const pp = G.player && G.player.pos; if (!pp || !P) return;
    if (M.phase === 'arrival' && (hdist(pp, P.drops[0].pos) < 12 || M.t > 40)) setPhase('drop1');
    if (M.phase === 'hunt1' && hdist(pp, P.drops[1].pos) < 12) setPhase('drop2');
  }

  /* ---------------- capture hooks ---------------- */
  function applyJump(j) {
    const tq = parseFloat(HASH.get('t'));
    if (j === 'title') { beginTitle(isFinite(tq) ? tq : 11.6); return; }
    const near = (i, d) => { const s = standOff(P.drops[i].pos, P.spawn.pos, d || 2.2); teleport(s.pos, s.yaw); };
    if (j === 'street') { startPlay(true); return; }
    if (j === 'drop1') { startPlay(true); setPhase('drop1'); near(0); return; }
    if (j === 'hunt1') { startPlay(true); M.intel = 1; setIntelHud(); drops[0].visible = false; G.emit('power-cut'); setPhase('hunt1'); ckPhase = 'hunt1'; near(0, 1.5); toast(INTEL[0].label, INTEL[0].text, 30); return; }
    if (j === 'drop3') { startPlay(true); M.intel = 2; setIntelHud(); drops[0].visible = drops[1].visible = false; G.emit('power-cut'); setPhase('drop3'); ckPhase = 'drop3'; near(2); return; }
    if (j === 'bell') { startPlay(true); M.intel = 3; setIntelHud(); for (const d of drops) d.visible = false; G.emit('power-cut'); setPhase('bell'); ckPhase = 'bell';
      const s = standOff(P.bell.pos, P.drops[2].pos, 2.4); teleport(s.pos, s.yaw); return; }
    if (j === 'platform' || j === 'ending') {
      startPlay(true); M.intel = 3; setIntelHud(); for (const d of drops) d.visible = false;
      setPhase('platform'); const a = P.platform.pos.clone();
      teleport(a, P.platform.yaw != null ? P.platform.yaw : P.spawn.yaw);
      setupPlatform(a, true, P.platform.yaw != null ? P.platform.yaw : P.spawn.yaw); checkpoint = { pos: a.clone(), yaw: TR.faceYaw }; ckPhase = 'platform'; teleport(a, TR.faceYaw);
      setObjective('Board the train');
      if (j === 'ending') { removeInteract(TR.boardI); setPhase('ending'); G.emit('ending'); hud(false); startEndingCine(isFinite(tq) ? tq : 4.5); }
    }
  }

  /* ---------------- module ---------------- */
  const drops = []; let bellI = null;
  const ownLoad = path => new Promise(res => { if (!THREE.GLTFLoader) return res(null); new THREE.GLTFLoader().load(G.ASSETS + path, res, undefined, () => res(null)); });
  const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);

  G.register('mission', {
    order: 60,
    async init() {
      // own loader instances: these skinned models are posed by mission only, never shared with the monster/player modules
      const [spy, mon] = await Promise.all([withTimeout(ownLoad('spy/spy.glb'), 6000), withTimeout(ownLoad('monster/monster.glb'), 6000)]);
      spyGltf = spy; monGltf = mon;
      if (!spy) console.warn('[mission] spy.glb not loaded; title uses a stand-in');
      // built in parallel by B-train; absent is fine (procedural fallback)
      (G.loadGLB ? G.loadGLB('train/shinkansen.glb') : Promise.reject()).then(g => { trainGltf = g; }, () => {});
      (G.loadGLB ? G.loadGLB('train/platform.glb') : Promise.reject()).then(g => { platGltf = g; }, () => {});
      G.scene.add(propGroup);
      G.on('begin', () => beginTitle(null));
      G.on('key', () => skipTitle()); G.on('click', () => skipTitle());
      G.on('game-over', onGameOver);
      G.on('shift-end', onShiftEnd);
      G.on('ready', () => {
        resolvePoints();
        P.drops.forEach((d, i) => {
          drops.push(makeDropProp(i, d));
          addInteract({ id: 'mission-drop' + (i + 1), pos: d.pos, radius: 1.8, label: ['Take the letter', 'Read the tab ledger', 'Read the ema'][i],
            enabled: () => M.intel === i && M.phase !== 'title' && M.phase !== 'boot', onUse: () => takeIntel(i) });
        });
        if (P.bell.fallback) { const b = box(.6, .7, .6, matDark); b.position.copy(P.bell.pos).setY(P.bell.pos.y + 2.4); const r = box(.04, 2.2, .04, matRed); r.position.copy(P.bell.pos).setY(P.bell.pos.y + 1.1); propGroup.add(b, r); }
        bellI = addInteract({ id: 'mission-bell', pos: P.bell.pos, radius: 2.4, label: 'Ring the bell', enabled: () => M.phase === 'bell', onUse: ringBell });
        if (G.jump) applyJump(G.jump);
      });
    },
    update(dt) {
      M.t += dt;
      for (let i = timers.length - 1; i >= 0; i--) if (G.time >= timers[i].at) { const f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (e) { console.error('[mission] timer', e); } }
      if (T.active) { updateTitle(dt); return; }
      if (M.phase !== 'boot' && M.phase !== 'ending' && !busy) { updateInteracts(); updatePhase(); }
      for (const d of drops) if (d.visible) d.rotation.y += dt * .3;
      updateTrain(dt); updateEnding(dt);
    }
  });
})();
