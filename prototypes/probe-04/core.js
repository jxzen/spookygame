/* core.js: the shared game core for probe 04. OWNER: integrator. Builders read it, never edit it.
 * Plain script after three r128 + GLTFLoader. Exposes window.G.
 *
 * MODULE CONTRACT
 *   G.register(name, { order, init(G) -> optional Promise, update(dt, G), onEvent? })
 *   order: lower runs first each frame. Reserved: input 0, player 10, level 20, monster 30, yokai 40, shift 50, mission 60, audio 70.
 *   init may return a Promise (asset loading); the loop starts after every init settles. A module whose init throws is
 *   disabled and logged; the game keeps running (so a missing/broken module never blocks the others).
 *
 * SHARED STATE (read anywhere; write only the fields you own, see process/owners)
 *   G.scene, G.camera, G.renderer, G.clock, G.time, G.dt
 *   G.overlay = { scene, camera } or null      first-person viewmodel drawn on top (owner: player)
 *   G.input  = { mx, mz, lx, ly, run, focus, crouch, interact(edge), light(edge), locked }   (owner: core)
 *   G.player = { pos: Vector3, yaw, pitch, health, maxHealth, hidden: null|spotId, crouched, lightOn, battery, stamina, alive }   (owner: player)
 *   G.monster = { pos: Vector3, stage: 0..5, visible, distance, state: 'dormant'|'stalk'|'search'|'hunt'|'retreat'|'gone' }   (owner: monster)
 *   G.mission = { phase, intel, objective, t }   (owner: mission)
 *   G.fear  0..1   computed by core from monster distance/stage + G.fearBoost (any module may add a short boost via G.addFear)
 *   G.world = { colliders: [Box3...], hideSpots: [{id, pos:Vector3, radius, kind}], walkable(x,z,r)->bool, bell: Vector3|null }   (owner: level)
 *   G.fx = window.HorrorFX or null, G.score = window.Score or null, G.audioCtx (created on first gesture)
 *
 * EVENTS: G.on(name, fn), G.emit(name, data). Names in use:
 *   'start' (title done, play begins) · 'intel' {n, text} · 'power-cut' · 'player-hurt' {health} · 'player-hide' {spot} · 'player-unhide'
 *   'monster-stage' {stage} · 'monster-grab' · 'yokai' {kind} · 'bell' · 'shift-start' · 'shift-end' · 'ending' · 'game-over'
 *
 * CAPTURE HOOKS: location.hash '#jump=<phase>' is forwarded as G.jump (mission decides what it means); '#nofx' bypasses HorrorFX.
 */
(function () {
  'use strict';
  const THREE = window.THREE;
  const G = window.G = {
    THREE, modules: [], handlers: {}, time: 0, dt: 0, fearBoost: 0, fear: 0,
    overlay: null, fx: null, score: null, audioCtx: null, jump: null, ready: false,
    input: { mx: 0, mz: 0, lx: 0, ly: 0, run: false, focus: false, crouch: false, interact: false, light: false, locked: false },
    player: { pos: new THREE.Vector3(0, 0, 0), yaw: 0, pitch: 0, health: 3, maxHealth: 3, hidden: null, crouched: false, lightOn: true, battery: 100, stamina: 100, alive: true },
    monster: { pos: new THREE.Vector3(0, -100, 0), stage: 0, visible: false, distance: 999, state: 'dormant' },
    mission: { phase: 'boot', intel: 0, objective: '', t: 0 },
    world: { colliders: [], hideSpots: [], walkable: () => true, bell: null }
  };
  const hash = new URLSearchParams(location.hash.slice(1));
  G.jump = hash.get('jump'); G.nofx = hash.has('nofx');

  /* ---------- events ---------- */
  G.on = (n, fn) => { (G.handlers[n] = G.handlers[n] || []).push(fn); };
  G.emit = (n, d) => { for (const fn of (G.handlers[n] || [])) { try { fn(d); } catch (e) { console.error('[event ' + n + ']', e); } } };
  G.addFear = (a) => { G.fearBoost = Math.min(1, G.fearBoost + a); };

  /* ---------- renderer ---------- */
  G.renderer = new THREE.WebGLRenderer({ antialias: true });
  G.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  G.renderer.setSize(innerWidth, innerHeight);
  G.renderer.shadowMap.enabled = true; G.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('stage').appendChild(G.renderer.domElement);
  G.scene = new THREE.Scene(); G.scene.background = new THREE.Color(0x0b0b0c);
  G.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 400); G.camera.rotation.order = 'YXZ';
  G.scene.add(G.camera);
  G.clock = new THREE.Clock();
  addEventListener('resize', () => {
    G.renderer.setSize(innerWidth, innerHeight); G.camera.aspect = innerWidth / innerHeight; G.camera.updateProjectionMatrix();
    if (G.overlay) { G.overlay.camera.aspect = G.camera.aspect; G.overlay.camera.updateProjectionMatrix(); }
    if (G.fx && G.fx.setSize) G.fx.setSize(innerWidth, innerHeight);
  });

  /* ---------- assets ---------- */
  G.ASSETS = '../assets/';
  const loader = THREE.GLTFLoader ? new THREE.GLTFLoader() : null;
  const glbCache = {};
  /** G.loadGLB('env/torii.glb') -> Promise<gltf>. Cached; clone the scene (gltf.scene.clone()) if you place it twice. */
  G.loadGLB = (path) => {
    if (!loader) return Promise.reject(new Error('GLTFLoader missing'));
    if (!glbCache[path]) glbCache[path] = new Promise((res, rej) => loader.load(G.ASSETS + path, res, undefined, rej));
    return glbCache[path];
  };
  /** XHR-based (THREE.FileLoader) so it also works from file:// with --allow-file-access-from-files; fetch() does not. */
  G.loadJSON = (path) => new Promise((res, rej) => { const fl = new THREE.FileLoader(); fl.setResponseType('json'); fl.load(G.ASSETS + path, res, undefined, rej); });

  /* ---------- input (owner: core) ---------- */
  const keys = {}; let dragging = false, lx0 = 0, ly0 = 0, mouseDX = 0, mouseDY = 0;
  const cvs = G.renderer.domElement;
  const gesture = () => {
    if (!G.audioCtx) { const C = window.AudioContext || window.webkitAudioContext; if (C) { G.audioCtx = new C(); G.emit('audio-ready', G.audioCtx); } }
    else if (G.audioCtx.state === 'suspended') G.audioCtx.resume();
  };
  addEventListener('keydown', e => { keys[e.code] = true; gesture(); if (e.code === 'KeyE' || e.code === 'Enter') G.input.interact = true; if (e.code === 'KeyF') G.input.light = true; G.emit('key', e.code); });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  cvs.addEventListener('contextmenu', e => e.preventDefault());
  cvs.addEventListener('mousedown', e => {
    gesture(); if (e.button === 2) keys.Mouse2 = true;
    if (!G.input.locked) { try { const p = cvs.requestPointerLock && cvs.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* drag fallback */ } dragging = true; lx0 = e.clientX; ly0 = e.clientY; }
    G.emit('click');
  });
  addEventListener('mouseup', e => { if (e.button === 2) keys.Mouse2 = false; dragging = false; });
  document.addEventListener('pointerlockchange', () => { G.input.locked = document.pointerLockElement === cvs; });
  addEventListener('mousemove', e => {
    if (G.input.locked) { mouseDX += e.movementX; mouseDY += e.movementY; }
    else if (dragging) { mouseDX += e.clientX - lx0; mouseDY += e.clientY - ly0; lx0 = e.clientX; ly0 = e.clientY; }
  });
  const prevPad = {};
  function readInput() {
    const I = G.input; let mx = 0, mz = 0;
    if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1; if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
    I.run = !!(keys.ShiftLeft || keys.ShiftRight); I.focus = !!keys.Mouse2; I.crouch = !!(keys.KeyC || keys.ControlLeft);
    I.lx = mouseDX * 0.0022; I.ly = mouseDY * 0.0022; mouseDX = mouseDY = 0;
    const ps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of ps) { if (!p) continue;
      const dz = v => Math.abs(v) < .15 ? 0 : v; mx += dz(p.axes[0] || 0); mz += dz(p.axes[1] || 0);
      I.lx += dz(p.axes[2] || 0) * 0.04; I.ly += dz(p.axes[3] || 0) * 0.03;
      const b = i => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > .3));
      const edge = i => { const v = b(i), w = prevPad[i]; prevPad[i] = v; return v && !w; };
      if (b(6)) I.focus = true; if (b(10)) I.run = true; if (b(1)) I.crouch = true; if (edge(0)) I.interact = true; if (edge(5)) I.light = true;
      break; }
    const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; } I.mx = mx; I.mz = mz;
  }

  /* ---------- fear ---------- */
  function computeFear(dt) {
    const m = G.monster, near = m.visible || m.state === 'hunt' || m.state === 'search' ? Math.max(0, 1 - m.distance / 25) : 0;
    G.fearBoost = Math.max(0, G.fearBoost - dt * 0.25);
    const target = Math.min(1, Math.max(near * (0.4 + 0.12 * m.stage), G.fearBoost));
    G.fear += (target - G.fear) * (1 - Math.exp(-dt * 3));
  }

  /* ---------- modules ---------- */
  G.register = (name, mod) => { mod.name = name; mod.order = mod.order == null ? 100 : mod.order; mod.ok = true; G.modules.push(mod); G.modules.sort((a, b) => a.order - b.order); };

  /** H15: compile every material (and upload textures) for the CURRENT light set, including objects that are hidden now
   *  (yokai, monster, drop props, the train). Lights keep their effective visibility so the program variants match play.
   *  Changing the active light count later still recompiles everything: modules switch lights off with intensity 0. */
  G.prewarm = () => {
    const t0 = performance.now(), flip = [], lightsOff = [];
    const effective = new Set(); G.scene.traverseVisible(o => effective.add(o));
    G.scene.traverse(o => {
      if (o.isLight) { if (!effective.has(o) && o.visible) { o.visible = false; lightsOff.push(o); } return; }
      if (!o.visible) { o.visible = true; flip.push(o); }
      if (o.isMesh && G.renderer.initTexture) for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap']) if (m && m[k] && m[k].isTexture) try { G.renderer.initTexture(m[k]); } catch (e) { /* r128 may lack it */ }
    });
    try { G.renderer.compile(G.scene, G.camera); if (G.overlay) G.renderer.compile(G.overlay.scene, G.overlay.camera); }
    catch (e) { console.warn('[core] prewarm compile failed', e); }
    for (const o of flip) o.visible = false; for (const l of lightsOff) l.visible = true;
    console.log('[core] prewarm ' + (performance.now() - t0).toFixed(0) + ' ms, ' + flip.length + ' hidden objects compiled');
  };

  async function boot() {
    G.fx = !G.nofx && window.HorrorFX ? window.HorrorFX : null;
    if (G.fx) { try { G.fx.init(G.renderer, G.scene, G.camera); } catch (e) { console.error('[core] HorrorFX.init failed, bypassing', e); G.fx = null; } }
    G.score = window.Score || null;
    for (const m of G.modules) {
      try { if (m.init) await m.init(G); }
      catch (e) { m.ok = false; console.error('[module ' + m.name + '] init failed; disabled', e); }
    }
    G.ready = true; G.emit('ready');
    G.prewarm();
    G.on('start', () => setTimeout(G.prewarm, 0)); // the title set's lights are gone by now: compile for the play-time light set
    document.body.dataset.ready = '1';
    requestAnimationFrame(frame);
  }
  function frame() {
    const dt = Math.min(G.clock.getDelta(), 0.05); G.dt = dt; G.time += dt;
    readInput();
    for (const m of G.modules) {
      if (!m.ok || !m.update) continue;
      try { m.update(dt, G); } catch (e) { m.ok = false; console.error('[module ' + m.name + '] update threw; disabled', e); }
    }
    G.input.interact = false; G.input.light = false;
    computeFear(dt);
    if (G.fx) { try { G.fx.setFear(G.fear); G.fx.update(dt); G.fx.render(); } catch (e) { console.error('[core] HorrorFX failed, bypassing', e); G.fx = null; } }
    else G.renderer.render(G.scene, G.camera);
    if (G.overlay) { const r = G.renderer, ac = r.autoClear; r.autoClear = false; r.clearDepth(); r.render(G.overlay.scene, G.overlay.camera); r.autoClear = ac; }
    requestAnimationFrame(frame);
  }
  // modules register synchronously as their scripts load; boot after the page's scripts have all run
  addEventListener('load', boot);
})();
