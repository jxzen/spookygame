/* player.js: first-person player for probe 04. OWNER: player (W2-PLAYER).
 * Writes: G.player.*, G.overlay, G.interact, #prompt #status #look #hurt.
 * Movement, look, flashlight (+focus), first-person arms viewmodel, interaction, hiding, health.
 * Events in: start, begin, monster-grab, respawn {pos,yaw}, teleport {pos,yaw}
 * Events out: footstep {loud}, player-hide {spot}, player-unhide, player-hurt {health}, game-over
 * Capture hook: #jump=player-arms
 */
(function () {
  'use strict';
  const G = window.G; if (!G) return;
  const THREE = G.THREE;
  const P = G.player;
  const V3 = THREE.Vector3;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  const T = { WALK: 3.2, RUN: 5.6, CROUCH: 1.6, EYE: 1.65, EYE_C: 1.1, R: 0.3, FOV: 72,
    ST_DRAIN: 28, ST_REGEN: 16, BAT_DRAIN: 16, BAT_REGEN: 6, HIDE_T: 0.6, HIDE_LOOK: Math.PI / 3, HURT_CD: 2 };

  /* ---------- state ---------- */
  const S = {
    playing: false, eye: T.EYE, bob: 0, stepIdx: 0, speed: 0,
    knock: new V3(), shake: 0, roll: 0, lastHurt: -99,
    hide: null,      // { spot, t, from:V3, fromYaw, fromPitch, back:V3, lightWas }
    hideCool: 0, items: new Map(), near: null, promptText: '',
    arms: null, armsRoot: null, mixer: null, actIdle: null, actReach: null, reachT: 0,
    swayX: 0, swayY: 0, flicker: null, lightI: 0, angle: 0.42, deadT: 0, testRig: null
  };
  P.focusing = false; P.beam = { origin: new V3(), dir: new V3(0, 0, -1), angle: 0.42, range: 30 };
  P.lightOn = true; P.alive = true; P.hidden = null; P.crouched = false;

  /* ---------- HUD ---------- */
  const el = id => document.getElementById(id);
  let hud = null;
  function buildStatus() {
    const st = el('status'); if (!st) return null;
    st.textContent = '';
    const row = () => { const d = document.createElement('div'); d.style.cssText = 'display:flex;align-items:center;gap:8px'; st.appendChild(d); return d; };
    const r1 = row(), pips = [];
    for (let i = 0; i < (P.maxHealth || 3); i++) { const p = document.createElement('i'); p.style.cssText = 'display:inline-block;width:11px;height:11px;background:var(--red);border:1px solid var(--red);transform:rotate(45deg);margin-right:3px'; r1.appendChild(p); pips.push(p); }
    const meter = (label) => {
      const r = row(); const l = document.createElement('span'); l.textContent = label; l.style.cssText = 'width:52px;letter-spacing:.15em';
      const m = document.createElement('span'); m.style.cssText = 'display:inline-block;width:110px;height:4px;background:#2a2a2c;position:relative';
      const b = document.createElement('b'); b.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:100%;background:var(--paper)';
      m.appendChild(b); r.append(l, m); return b;
    };
    return { st, pips, light: meter('LIGHT'), breath: meter('BREATH'), prompt: el('prompt'), look: el('look'), hurt: el('hurt'), last: '' };
  }
  function updateHUD() {
    if (!hud) return;
    hud.st.hidden = !S.playing || (G.mission && (G.mission.phase === "title" || G.mission.phase === "ending")); // integration: no HUD over the title or the ending
    hud.pips.forEach((p, i) => { p.style.background = i < P.health ? 'var(--red)' : 'transparent'; });
    hud.light.style.width = P.battery.toFixed(0) + '%';
    hud.light.style.background = P.battery < 20 ? 'var(--red)' : 'var(--paper)';
    hud.breath.style.width = P.stamina.toFixed(0) + '%';
    hud.breath.style.background = P.stamina < 20 ? 'var(--red)' : 'var(--paper)';
    if (hud.look) hud.look.hidden = !(S.playing && P.alive && !G.input.locked);
    if (hud.prompt) {
      const t = S.playing && P.alive ? S.promptText : '';
      if (t !== hud.last) { hud.last = t; hud.prompt.textContent = t ? 'E / A · ' + t : ''; hud.prompt.hidden = !t; }
    }
  }
  function hurtFlash() {
    if (!hud || !hud.hurt) return;
    hud.hurt.style.opacity = 1; clearTimeout(S.hurtTimer); S.hurtTimer = setTimeout(() => { hud.hurt.style.opacity = 0; }, 180);
  }

  /* ---------- audio: footsteps ---------- */
  let noiseBuf = null;
  function footstepSound(quiet, loud) {
    const ctx = G.audioCtx; if (!ctx || ctx.state !== 'running') return;
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5 | 0, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = ctx.currentTime, n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = (quiet ? 380 : 520) + Math.random() * 300;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
    const g = ctx.createGain(), v = quiet ? 0.05 : loud ? 0.24 : 0.15;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + (loud ? 0.12 : 0.09));
    n.connect(lp); lp.connect(hp); hp.connect(g); g.connect(ctx.destination);
    // wet slap: a second, brighter click (rain-soaked ground)
    const n2 = ctx.createBufferSource(); n2.buffer = noiseBuf; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400 + Math.random() * 800; bp.Q.value = 1.2;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, t + 0.01); g2.gain.exponentialRampToValueAtTime(v * 0.25, t + 0.016); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n2.connect(bp); bp.connect(g2); g2.connect(ctx.destination);
    const off = Math.random() * 0.35; n.start(t, off); n.stop(t + 0.15); n2.start(t, off); n2.stop(t + 0.1);
  }

  /* ---------- collision ---------- */
  function walkable(x, z) {
    const sh = G.shift;
    try {
      if (sh && sh.active && typeof sh.walkable === 'function') return !!sh.walkable(x, z);
      const w = G.world;
      if (w && typeof w.walkable === 'function') return !!w.walkable(x, z, T.R);
    } catch (e) { /* a broken collaborator never traps the player */ }
    return true;
  }
  function tryMove(dx, dz) {
    if (!dx && !dz) return;
    const x = P.pos.x, z = P.pos.z;
    if (walkable(x + dx, z + dz)) { P.pos.x += dx; P.pos.z += dz; }
    else if (dx && walkable(x + dx, z)) { P.pos.x += dx; }
    else if (dz && walkable(x, z + dz)) { P.pos.z += dz; }
    // integration: follow the town's floor (shrine stairs 0 -> 6 m); the castle keeps its own y, so skip during a shift
    const sh = G.shift, w = G.world;
    if (!(sh && sh.active) && w && typeof w.heightAt === 'function') { const h = w.heightAt(P.pos.x, P.pos.z); if (isFinite(h)) P.pos.y = h; }
  }

  /* ---------- flashlight ---------- */
  let flash = null;
  function makeFlashlight() {
    flash = new THREE.SpotLight(0xf3f0e8, 2.6, 30, 0.42, 0.5, 1.4);
    flash.castShadow = true; flash.shadow.mapSize.set(1024, 1024); flash.shadow.bias = -0.0006;
    flash.shadow.camera.near = 0.3; flash.shadow.camera.far = 34;
    flash.position.set(0.18, -0.13, -0.25); flash.target.position.set(0.04, -0.06, -6);
    G.camera.add(flash); G.camera.add(flash.target);
    P.flashlight = flash;
    if (G.fx && G.fx.setFlashlight) { try { S.flicker = G.fx.setFlashlight(flash) || null; } catch (e) { console.warn('[player] setFlashlight failed', e); } }
  }
  const _fw = new V3();
  function updateFlashlight(dt) {
    const I = G.input;
    if (I.light && S.playing && P.alive && !S.hide) P.lightOn = !P.lightOn;
    const wantFocus = I.focus && P.lightOn && P.battery > 0.5 && !S.hide && P.alive;
    P.focusing = !!wantFocus;
    P.battery = clamp(P.battery + (P.focusing ? -T.BAT_DRAIN : T.BAT_REGEN) * dt, 0, 100);
    const on = P.lightOn && !S.hide;
    const targetI = !on ? 0 : P.focusing ? 5.2 : 2.6;
    const targetA = P.focusing ? 0.2 : 0.42;
    S.lightI = lerp(S.lightI, targetI, 1 - Math.exp(-dt * (on ? 14 : 30)));
    S.angle = lerp(S.angle, targetA, 1 - Math.exp(-dt * 9));
    flash.angle = S.angle; flash.distance = P.focusing ? 40 : 30; flash.penumbra = P.focusing ? 0.3 : 0.5;
    if (S.flicker) S.flicker.base = S.lightI; else flash.intensity = S.lightI;
    // beam for the monster: world origin + direction
    flash.getWorldPosition(P.beam.origin); flash.target.getWorldPosition(_fw);
    P.beam.dir.copy(_fw).sub(P.beam.origin).normalize();
    P.beam.angle = on ? S.angle : 0; P.beam.range = on ? flash.distance : 0;
  }

  /* ---------- first-person arms (overlay) ---------- */
  function makeOverlay() {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(59, innerWidth / innerHeight, 0.01, 10);
    scene.add(cam);
    scene.add(new THREE.HemisphereLight(0x9a9aa2, 0x0a0a0c, 0.35));
    const key = new THREE.DirectionalLight(0xdedcd8, 0.5); key.position.set(0.6, 0.5, 0.2); scene.add(key);
    const torch = new THREE.PointLight(0xf3f0e8, 0.9, 1.2, 2); torch.position.set(0.17, -0.06, -0.62); cam.add(torch);
    const root = new THREE.Group(); cam.add(root);
    G.overlay = { scene, camera: cam };
    S.armsRoot = root; S.torchFill = torch; S.keyLight = key;
  }
  function fallbackArms() {
    const g = new THREE.Group();
    const coat = new THREE.MeshStandardMaterial({ color: 0x55544f, roughness: 0.9 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.45 });
    const torchM = new THREE.MeshStandardMaterial({ color: 0x151516, roughness: 0.4, metalness: 0.7 });
    const box = (w, h, d, m, x, y, z, rx) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx || 0; g.add(b); return b; };
    box(0.09, 0.09, 0.42, coat, 0.2, -0.22, -0.3, 0.35); box(0.07, 0.06, 0.1, glove, 0.18, -0.14, -0.5, 0.2);
    box(0.04, 0.04, 0.16, torchM, 0.17, -0.11, -0.55, 0);
    box(0.09, 0.09, 0.42, coat, -0.24, -0.3, -0.3, 0.35); box(0.07, 0.06, 0.1, glove, -0.22, -0.21, -0.48, 0.2);
    g.userData.fallback = true; return g;
  }
  function setupArms(gltf) {
    const arms = gltf.scene;
    arms.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; } });
    S.armsRoot.add(arms); S.arms = arms;
    const clips = gltf.animations || [];
    if (clips.length) {
      S.mixer = new THREE.AnimationMixer(arms);
      const idle = THREE.AnimationClip.findByName(clips, 'idle_sway'), reach = THREE.AnimationClip.findByName(clips, 'reach');
      if (idle) { S.actIdle = S.mixer.clipAction(idle); S.actIdle.play(); }
      if (reach) { S.actReach = S.mixer.clipAction(reach); S.actReach.setLoop(THREE.LoopOnce, 1); S.actReach.clampWhenFinished = true; }
      S.mixer.addEventListener('finished', e => { if (e.action === S.actReach && S.actIdle) { S.actIdle.reset().play(); S.actReach.crossFadeTo(S.actIdle, 0.35, false); } });
    }
  }
  function playReach() {
    S.reachT = 0.9;
    if (S.actReach) { S.actReach.reset(); S.actReach.setEffectiveWeight(1); S.actReach.play(); if (S.actIdle) S.actIdle.crossFadeTo(S.actReach, 0.15, false); }
  }
  function updateArms(dt) {
    if (!S.armsRoot) return;
    if (S.mixer) S.mixer.update(dt);
    const I = G.input, sp = clamp(S.speed / T.WALK, 0, 1.6);
    // sway lags the look; bob follows the walk cycle; tremble with fear
    S.swayX = lerp(S.swayX, clamp(-I.lx * 0.6, -0.05, 0.05), 1 - Math.exp(-dt * 8));
    S.swayY = lerp(S.swayY, clamp(I.ly * 0.6, -0.04, 0.04), 1 - Math.exp(-dt * 8));
    const f = G.fear || 0, tr = f * f * 0.006;
    const hideDrop = S.hide ? 0.05 : 0, deadDrop = P.alive ? 0 : Math.min(0.5, S.deadT * 0.6);
    const r = S.armsRoot;
    r.position.set(S.swayX + Math.cos(S.bob * 0.5) * 0.012 * sp + (Math.random() - 0.5) * tr,
      S.swayY + Math.sin(S.bob) * 0.01 * sp + (Math.random() - 0.5) * tr - hideDrop - deadDrop - (S.fallback ? 0 : 0), 0);
    r.rotation.set(S.swayY * 1.5, S.swayX * 2, S.swayX * 1.5 + S.roll * 0.5);
    if (S.fallback && S.reachT > 0) { const k = Math.sin((1 - S.reachT / 0.9) * Math.PI); S.fallback.children[3].position.z = -0.3 - k * 0.15; S.fallback.children[4].position.z = -0.48 - k * 0.15; }
    S.reachT = Math.max(0, S.reachT - dt);
    // the overlay torch fill follows the real light, so the arms go dark with it
    if (S.torchFill) S.torchFill.intensity = flash ? Math.min(1.6, flash.intensity * 0.35) : 0.9;
  }

  /* ---------- interaction ---------- */
  G.interact = {
    add(it) { if (it && it.id != null) S.items.set(it.id, Object.assign({ radius: 1.5, text: 'Use' }, it)); return it && it.id; },
    remove(id) { S.items.delete(id); },
    get items() { return S.items; }
  };
  function nearest() {
    let best = null, bd = Infinity;
    const consider = (kind, ref, pos, radius, text) => {
      if (!pos) return;
      const d = Math.hypot(pos.x - P.pos.x, pos.z - P.pos.z);
      if (d <= (radius || 1.5) && d / (radius || 1.5) < bd) { bd = d / (radius || 1.5); best = { kind, ref, text }; }
    };
    S.items.forEach(it => { const en = typeof it.enabled === 'function' ? it.enabled() : it.enabled; if (en !== false) consider('item', it, it.pos, it.radius, it.text); });
    const spots = G.world && Array.isArray(G.world.hideSpots) ? G.world.hideSpots : [];
    for (const s of spots) if (s && s.pos) consider('hide', s, s.pos, s.radius || 1.2, 'Hide');
    return best;
  }

  /* ---------- hiding ---------- */
  function enterHide(spot) {
    const enter = spot.enter || spot.pos;
    S.hide = { spot, t: 0, from: P.pos.clone(), back: P.pos.clone(), fromYaw: P.yaw, fromPitch: P.pitch,
      to: new V3(enter.x, enter.y || P.pos.y, enter.z), yaw: typeof spot.yaw === 'number' ? spot.yaw : P.yaw, lightWas: P.lightOn };
    P.hidden = spot.id != null ? spot.id : 'hide'; P.crouched = true;
    S.hideCool = 0.4; playReach();
    G.emit('player-hide', { spot });
  }
  function leaveHide(silent) {
    if (!S.hide) return;
    const h = S.hide; S.hide = null; P.hidden = null; S.hideCool = 0.4;
    // step back out to where the player stood, if it is still walkable
    if (walkable(h.back.x, h.back.z)) P.pos.copy(h.back);
    P.lightOn = h.lightWas;
    if (!silent) G.emit('player-unhide');
    else G.emit('player-unhide');
  }
  function updateHide(dt) {
    const h = S.hide, I = G.input;
    h.t += dt; const k = clamp(h.t / T.HIDE_T, 0, 1), e = k * k * (3 - 2 * k);
    P.pos.lerpVectors(h.from, h.to, e);
    if (k < 1) { P.yaw = h.fromYaw + angDiff(h.yaw, h.fromYaw) * e; P.pitch = lerp(h.fromPitch, 0, e); }
    else {
      P.yaw -= I.lx; P.pitch = clamp(P.pitch - I.ly, -0.6, 0.6);
      const d = angDiff(P.yaw, h.yaw); if (Math.abs(d) > T.HIDE_LOOK) P.yaw = h.yaw + Math.sign(d) * T.HIDE_LOOK;
    }
    if (k >= 1 && h.t > T.HIDE_T + 0.3 && (Math.hypot(I.mx, I.mz) > 0.5 || I.interact)) { leaveHide(); return true; }
    return false;
  }

  /* ---------- damage / death / respawn ---------- */
  G.on('monster-grab', () => {
    if (!P.alive || G.time - S.lastHurt < T.HURT_CD) return;
    S.lastHurt = G.time;
    if (S.hide) leaveHide();
    P.health = Math.max(0, P.health - 1);
    hurtFlash(); S.shake = 1;
    const m = G.monster && G.monster.pos;
    const away = m ? new V3(P.pos.x - m.x, 0, P.pos.z - m.z) : new V3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    if (away.lengthSq() < 1e-4) away.set(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    S.knock.copy(away.normalize().multiplyScalar(7));
    S.roll = (Math.random() < 0.5 ? -1 : 1) * 0.25;
    if (G.addFear) G.addFear(0.8);
    if (G.fx && G.fx.spike) { try { G.fx.spike(1); } catch (e) { /* optional */ } }
    G.emit('player-hurt', { health: P.health });
    if (P.health <= 0) { P.alive = false; S.deadT = 0; G.emit('game-over'); }
  });
  function place(d) {
    if (!d) return;
    if (d.pos) P.pos.set(d.pos.x || 0, d.pos.y || 0, d.pos.z || 0);
    if (typeof d.yaw === 'number') P.yaw = d.yaw;
    P.pitch = 0; S.knock.set(0, 0, 0);
  }
  G.on('respawn', d => {
    if (S.hide) { S.hide = null; P.hidden = null; G.emit('player-unhide'); }
    P.health = P.maxHealth || 3; P.alive = true; S.deadT = 0; S.roll = 0; S.shake = 0; P.stamina = 100;
    if (hud && hud.hurt) hud.hurt.style.opacity = 0;
    place(d);
  });
  // integration: the noppera-bo glimpse ends with "the light went out" (yokai emits {lightOut: seconds})
  G.on('yokai', d => { if (d && d.lightOut > 0 && P.lightOn) { P.lightOn = false; setTimeout(() => { if (!S.hide) P.lightOn = true; }, d.lightOut * 1000); } });
  G.on('teleport', d => { if (S.hide) { S.hide = null; P.hidden = null; G.emit('player-unhide'); } place(d); });
  G.on('start', () => { S.playing = true; });
  G.on('begin', () => {
    // without a mission module nobody would lift the fade or start play
    if (!G.modules.some(m => m.name === 'mission' && m.ok)) { S.playing = true; if (G.ui) G.ui.fade(0); }
  });

  /* ---------- capture rig for #jump=player-arms (only when no level exists) ---------- */
  function testRig() {
    const g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.3), new THREE.MeshStandardMaterial({ color: 0x5c5b58, roughness: 0.9 }));
    wall.position.set(0, 2, -5); wall.receiveShadow = true; g.add(wall);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x1a1a1b }));
    post.position.set(-0.8, 1.1, -3.2); post.castShadow = true; g.add(post);
    g.add(new THREE.HemisphereLight(0x8a8a90, 0x101012, 0.15));
    G.scene.add(g); return g;
  }

  /* ---------- module ---------- */
  G.register('player', {
    order: 10,
    init() {
      hud = buildStatus();
      makeFlashlight();
      makeOverlay();
      if (G.jump) S.playing = true;
      if (G.jump === 'player-arms') {
        if (!G.modules.some(m => m.name === 'level')) S.testRig = testRig();
        if (G.ui) G.ui.fade(0);
        P.pos.set(0, 0, 0); P.yaw = 0; P.pitch = -0.05;
        G.interact.add({ id: 'player-test', pos: new V3(0, 0, -1), radius: 2.5, text: 'Take the dead drop', onUse() { G.interact.remove('player-test'); } });
      }
      return G.loadGLB('spy/fp-arms.glb').then(setupArms).catch(err => {
        console.warn('[player] fp-arms.glb failed, using box arms', err && err.message);
        S.fallback = fallbackArms(); S.armsRoot.add(S.fallback);
      });
    },
    update(dt) {
      const I = G.input, cam = G.camera;
      const active = S.playing && P.alive;
      S.hideCool = Math.max(0, S.hideCool - dt);

      /* look + move */
      let moved = false, mvx = 0, mvz = 0;
      if (S.hide) {
        if (!active) { /* frozen */ } else updateHide(dt);
        S.speed = 0;
      } else if (active) {
        P.yaw -= I.lx; P.pitch = clamp(P.pitch - I.ly, -1.3, 1.3);
        P.crouched = !!I.crouch;
        const len = Math.hypot(I.mx, I.mz);
        const wantRun = I.run && !P.crouched && len > 0.1 && P.stamina > 5;
        P.stamina = clamp(P.stamina + (wantRun ? -T.ST_DRAIN : T.ST_REGEN) * dt, 0, 100);
        const sp = P.crouched ? T.CROUCH : wantRun ? T.RUN : T.WALK;
        const s = Math.sin(P.yaw), c = Math.cos(P.yaw);
        // forward is -Z at yaw 0
        mvx = (I.mx * c + I.mz * s) * sp; mvz = (-I.mx * s + I.mz * c) * sp;
        S.speed = lerp(S.speed, Math.hypot(mvx, mvz), 1 - Math.exp(-dt * 10));
        tryMove(mvx * dt, mvz * dt); moved = len > 0.1;
        S.running = wantRun;
      } else { S.speed = 0; P.stamina = clamp(P.stamina + T.ST_REGEN * dt, 0, 100); }

      /* moving platforms during the shift */
      if (G.shift && typeof G.shift.carry === 'function') {
        try { const c = G.shift.carry(P.pos.x, P.pos.z, dt); if (c) { P.pos.x += c.dx || 0; P.pos.z += c.dz || 0; } } catch (e) { /* optional */ }
      }
      /* knockback */
      if (S.knock.lengthSq() > 1e-4) { tryMove(S.knock.x * dt, S.knock.z * dt); S.knock.multiplyScalar(Math.exp(-dt * 6)); }

      /* interaction */
      S.promptText = '';
      if (active) {
        if (S.hide) { if (S.hide.t > T.HIDE_T) S.promptText = 'Leave'; }
        else {
          const n = nearest(); S.near = n;
          if (n) {
            S.promptText = n.text;
            if (I.interact && S.hideCool <= 0) {
              if (n.kind === 'hide') enterHide(n.ref);
              else { playReach(); try { n.ref.onUse && n.ref.onUse(n.ref); } catch (e) { console.error('[player] onUse', e); } }
            }
          }
        }
      }

      /* footsteps + head bob */
      if (moved && S.speed > 0.4) {
        S.bob += S.speed * dt * 2.2;
        const idx = Math.floor(S.bob / Math.PI);
        if (idx !== S.stepIdx) { S.stepIdx = idx; footstepSound(P.crouched, S.running); G.emit('footstep', { loud: !!S.running && !P.crouched }); }
      }

      /* eye height, death sink */
      if (!P.alive) S.deadT += dt;
      const eyeT = !P.alive ? 0.35 : (P.crouched || S.hide) ? T.EYE_C : T.EYE;
      S.eye = lerp(S.eye, eyeT, 1 - Math.exp(-dt * (P.alive ? 9 : 2.5)));
      const bobAmt = clamp(S.speed / T.WALK, 0, 1.5) * (P.crouched ? 0.025 : 0.05);
      S.shake = Math.max(0, S.shake - dt * 2.2);
      const sh = S.shake * S.shake * 0.08;
      S.roll = P.alive ? lerp(S.roll, 0, 1 - Math.exp(-dt * 3)) : lerp(S.roll, 0.6, 1 - Math.exp(-dt * 1.5));

      cam.position.set(P.pos.x + (Math.random() - 0.5) * sh, P.pos.y + S.eye + Math.sin(S.bob) * bobAmt + (Math.random() - 0.5) * sh, P.pos.z);
      cam.rotation.set(P.pitch + (Math.random() - 0.5) * sh * 0.5, P.yaw, S.roll + Math.cos(S.bob * 0.5) * bobAmt * 0.12);

      /* fov (world shift may drive it) */
      const fov = G.shift && typeof G.shift.fov === 'number' ? G.shift.fov : T.FOV;
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }

      updateFlashlight(dt);
      updateArms(dt);
      updateHUD();
    }
  });
})();
