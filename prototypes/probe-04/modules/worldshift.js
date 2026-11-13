/* worldshift.js: the world shift (brief W2-SHIFT, extends SHIFT-01). OWNER: shift builder. order 50.
 *
 * About 90 s, one continuous walkable sequence built far below the town (y = -400), driven by an unseen koto player:
 *   entry  (in town, 2.4 s): the street folds around the player (camera roll + widening FOV), white flash, teleport.
 *   street (~10 s): a copy of the street; on each pluck one pair of building rows hinges up 30 deg on the kerb line, like
 *          Inception's Paris fold, until the street has closed into a covered arcade. Then the red door opens.
 *   hall   (~17 s): (a) hallway stretch: an arcade of the town's own shopfronts; the koto bends a low string and the hall
 *          lengthens (dolly zoom), the sharp pluck snaps it back. The thing behind you steps only on rests.
 *   room   (~25 s): (b) room fold: a tatami room ratchets shut 30 deg per pluck, knocks in the dark, unfolds as a drawbridge.
 *   grid   (~30 s): (c) castle grid: rows of rooms on rails, string n moves row n; cross on the rest. The koto player
 *          sits far away, its hand lighting on each pluck. The hunter is summoned once and moves only on rests.
 *   exit: the last red door -> flash -> teleport to G.world.station.spawnAfterShift (or where the bell was rung), 'shift-end'.
 * Sections connect through red doors and short black vestibules (identical on both sides, so the swap is seamless).
 *
 * WRITES G.shift = { active, walkable(x,z)->bool, carry(x,z)->{dx,dz}|null, fov:number|null, section, t }.
 * EMITS 'teleport' {pos, yaw}, 'shift-end', 'koto' {beat, rest, bar, inBar, section, bpm}, 'monster-summon' {pos}.
 * LISTENS 'shift-start', 'teleport' (only to move its own fallback walker), 'audio-ready'.
 * Camera effects (roll, fall dip, FOV when no player module) are applied after the player module has placed the camera.
 * Runs alone: with no player module it drives the camera itself (WASD/mouse via G.input).
 * Capture hooks: #jump=shift-street | shift-stretch | shift-fold | shift-grid (emit 'shift-start' at that section).
 *   extra (testing only): &auto=1 walks the route by itself (fallback walker only) · &ff=SECONDS fast-forwards
 *   · &sim=1 simulates the whole route headless and logs section times · &rm=1 reduce motion.
 */
(function () {
  'use strict';
  const G = window.G, THREE = window.THREE, WS = window.WorldShift;
  if (!G || !THREE) return;
  if (!WS) { console.warn('[worldshift] shared/shift.js missing; shift disabled (bell does nothing)'); G.shift = { active: false, walkable: () => true, carry: () => null, fov: null }; return; }

  const Y0 = -400, EYE = 1.6, WALK = 3.2, BASE_FOV = 72;
  const PAL = WS.PAL, A = WS.audio, clamp = WS.clamp, lerp = WS.lerp;
  const HP = new URLSearchParams(location.hash.slice(1));
  const rm = () => HP.get('rm') === '1' || (G.reduceMotion != null ? !!G.reduceMotion : false);
  const hasMod = n => G.modules.some(m => m.name === n && m.ok);
  const hasPlayer = () => hasMod('player');
  const fear = a => { if (!st.ff && G.addFear) G.addFear(a); }; // no fear while a capture fast-forwards

  /* ---------------- materials (cached: WS.tex clones per call) ---------------- */
  const matCache = {};
  function M(key, o) { if (!matCache[key]) matCache[key] = WS.mat(o); return matCache[key]; }
  function B(key, color) { if (!matCache[key]) matCache[key] = WS.basic(color, false); return matCache[key]; }
  const tex = (n, rx, ry) => WS.tex(n, rx, ry);
  const add = (p, o) => { p.add(o); return o; };
  const box = (p, w, h, d, m, x, y, z) => add(p, WS.box(w, h, d, m, x, y, z));
  function plane(p, w, h, m, x, y, z, rx, ry) { const o = add(p, WS.plane(w, h, m)); o.position.set(x || 0, y || 0, z || 0); if (rx) o.rotation.x = rx; if (ry) o.rotation.y = ry; return o; }
  const floorPlane = (p, w, l, m, x, z, y) => plane(p, w, l, m, x, y || 0, z, -Math.PI / 2);
  const blackM = () => M('black', { color: 0x050505, rough: 1 });

  /* ---------------- GLB pieces from the town kit ---------------- */
  const KIT = { machiya: 'env/facade_machiya.glb', izakaya: 'env/shop_izakaya.glb', pharmacy: 'env/shop_pharmacy.glb', tobacco: 'env/shop_tobacco.glb', apartment: 'env/facade_apartment.glb', vending: 'env/vending_machine.glb', pole: 'env/utility_pole.glb', lantern: 'env/lantern_paper.glb' };
  const KITW = { machiya: 5.4, izakaya: 4.0, pharmacy: 5.0, tobacco: 2.8, apartment: 10, vending: 1, pole: 1, lantern: .5 };
  const kit = {};
  const slots = []; // {parent, name, x, y, z, ry, fallbackH}
  /** queue a kit piece; placed when the GLB arrives, else a shoji box stands in. Front faces +Z before ry. */
  function piece(parent, name, x, y, z, ry, h) { slots.push({ parent, name, x, y, z, ry, h: h || 6 }); }
  function placeSlots() {
    for (const s of slots) {
      let o;
      if (kit[s.name]) o = kit[s.name].clone();
      else {
        const w = KITW[s.name] || 3; o = new THREE.Group();
        const d = s.name === 'vending' || s.name === 'pole' || s.name === 'lantern' ? .7 : 5;
        box(o, w, s.h, d, M('fbbody', { color: 0x1a1816 }), 0, s.h / 2, -d / 2);
        const f = plane(o, w * .9, Math.min(2.4, s.h * .45), M('fbshoji', { map: tex('shoji', 2, 1), emissive: 0x3a3936, emissiveMap: tex('shoji', 2, 1) }), 0, 1.3, .02);
        f.userData.shoji = 1;
      }
      o.position.set(s.x, s.y, s.z); o.rotation.y = s.ry || 0; s.parent.add(o);
    }
  }

  /* ---------------- audio: WorldShift.audio bound to G.audioCtx ---------------- */
  function bindAudio(ctx) {
    if (!ctx || A.ctx === ctx) return;
    try {
      A.ctx = ctx; A.buffers = {};
      A.master = ctx.createGain(); A.master.gain.value = .6; A.master.connect(ctx.destination);
      const d = ctx.createDelay(1); d.delayTime.value = .27; const fb = ctx.createGain(); fb.gain.value = .38;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      A.wet = ctx.createGain(); A.wet.gain.value = .35;
      A.wet.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(A.master);
    } catch (e) { console.warn('[worldshift] audio unavailable', e); A.ctx = null; }
  }
  const sfx = {
    pluck: (i, o) => { try { A.pluck(i, o); } catch (e) { /* silent */ } },
    clack: v => { try { A.clack(v); } catch (e) { /* silent */ } },
    knock: v => { try { A.knock(v); } catch (e) { /* silent */ } },
    drone: on => { try { A.drone(on); } catch (e) { /* silent */ } }
  };

  /* ---------------- state ---------------- */
  const root = new THREE.Group(); root.name = 'worldshift'; root.position.y = Y0; root.visible = false;
  const koto = new WS.Koto({});
  const st = { active: false, phase: 'idle', t: 0, total: 0, sec: null, secT: 0, beatG: 0, flash: 0, roll: 0, dip: 0, origin: null, originYaw: 0, saved: null, log: [] };
  const fb = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, auto: HP.get('auto') === '1' };
  G.shift = {
    active: false, fov: null, section: null, t: 0,
    walkable(x, z) { const s = st.sec; if (!st.active || !s) return true; if (st.phase !== 'run') return false; return s.walkable(x - s.ox, z); },
    carry(x, z) { const s = st.sec; if (!st.active || !s || !s.carry || st.phase !== 'run') return null; return s.carry(x - s.ox, z); }
  };
  const ppos = () => hasPlayer() ? G.player.pos : fb.pos;
  const pyaw = () => hasPlayer() ? G.player.yaw : fb.yaw;
  const local = () => { const p = ppos(), s = st.sec; return { x: p.x - (s ? s.ox : 0), z: p.z }; };

  /* shared light pool: constant light count for the whole shift (no shader recompiles mid-sequence) */
  const hemi = add(root, new THREE.HemisphereLight(0x8a8884, 0x050505, .45));
  const pool = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xfff0dc, 1.2, 16, 2); root.add(l); return l; });
  const redL = add(root, new THREE.PointLight(0xff2020, 1.2, 8, 2));
  function lights(list, red) {
    const ox = st.sec ? st.sec.ox : 0;
    pool.forEach((l, i) => { const v = list[i]; if (v) { l.position.set(ox + v[0], v[1], v[2]); l.intensity = v[3] == null ? 1.2 : v[3]; l.distance = v[4] || 16; } else l.intensity = 0; });
    if (red) { redL.position.set(ox + red[0], red[1], red[2]); redL.intensity = red[3] || 1.3; } else redL.intensity = 0;
  }

  /* ---------------- red doors and vestibules ---------------- */
  /** a red door at z (in parent space) with a 2.4 m black vestibule behind it in direction dir (-1: beyond the door, +1: behind).
   *  The vestibule ends in a closed red door, so an exit vestibule and the next entry vestibule look the same. */
  function doorway(parent, x, z, dir, wallW, wallH) {
    const g = add(parent, new THREE.Group()); g.position.set(x, 0, z);
    const bk = blackM(), red = B('red', PAL.red), redGlow = B('redglow', 0xff2b2b);
    const L = 2.4 * dir;
    floorPlane(g, 1.6, 2.4, M('vfloor', { color: 0x141312 }), 0, L / 2);
    plane(g, 1.6, 2.4, bk, 0, 2.6, L / 2, Math.PI / 2);
    for (const s of [-1, 1]) plane(g, 2.4, 2.6, bk, s * .8, 1.3, L / 2, 0, -s * Math.PI / 2);
    box(g, 1.3, 2.3, .08, red, 0, 1.15, L);                    // the far door, always shut
    box(g, .12, .12, .12, redGlow, 0, 2.45, L / 2);            // a bare red bulb
    if (wallW) { // the wall the door stands in
      const ww = (wallW - 1.6) / 2, wh = wallH || 4;
      for (const s of [-1, 1]) box(g, ww, wh, .3, bk, s * (.8 + ww / 2), wh / 2, 0);
      box(g, 1.6, wh - 2.6, .3, bk, 0, 2.6 + (wh - 2.6) / 2, 0);
    }
    box(g, 1.9, .16, .2, B('lintel', 0x000000), 0, 2.48, 0);
    const door = box(g, 1.3, 2.3, .08, red, 0, 1.15, 0);
    const d = { g, door, k: 0, target: 0, z, dir,
      update(dt) { const k0 = d.k; d.k += clamp(d.target - d.k, -dt * 2.2, dt * 2.2); door.position.x = WS.smooth(d.k) * 1.55; if (k0 < 1 && d.k >= 1) sfx.clack(.3); },
      open() { if (d.target < 1) { d.target = 1; sfx.knock(.25); } }, isOpen: () => d.k > .75,
      inside(lx, lz, ox) { const v = (lz - z) * dir; return Math.abs(lx - (ox || 0) - x) <= .55 && v >= -.6 && v <= 2.3; } };
    return d;
  }

  /* ---------------- castle field (lab): rooms on rails, seen in the void around every section ---------------- */
  function castleField(parent, z0, rows, layers) {
    const out = [], paperM = M('fieldpaper', { map: tex('shoji', 1, 1), emissive: 0x3a3936, emissiveMap: tex('shoji', 1, 1) }), darkM = M('fielddark', { color: 0x0c0b0a }), railM = M('rail', { color: 0x050505, rough: .4 });
    for (let r = 0; r < rows; r++) {
      const z = z0 - r * 8, row = { g: add(parent, new THREE.Group()), off: 0, from: 0, to: 0, t: 1, dir: r % 2 ? -1 : 1 };
      for (const y of layers) {
        box(parent, 120, .25, .25, railM, 0, y - 2.2, z - 2); box(parent, 120, .25, .25, railM, 0, y - 2.2, z + 2);
        for (let i = -3; i <= 3; i++) {
          if ((i + r) % 3 === 0) continue;
          const room = add(row.g, new THREE.Group()); room.position.set(i * 9, y, z);
          box(room, 6, 4, 6, darkM, 0, 0, 0);
          plane(room, 5.6, 3.4, paperM, 0, 0, 3.01); plane(room, 5.6, 3.4, paperM, 0, 0, -3.01, 0, Math.PI);
          box(room, .5, .3, 1.2, B('red', PAL.red), 0, -2.15, 0);
        }
      }
      out.push(row);
    }
    return {
      move(r) { const row = out[r % out.length]; if (row.off + row.dir > 2 || row.off + row.dir < -2) row.dir *= -1; row.from = row.off; row.to = row.off + row.dir; row.t = 0; row.off = row.to; },
      update(dt) { for (const row of out) { if (row.t < 1) row.t = Math.min(1, row.t + dt / .42); row.g.position.x = lerp(row.from, row.to, WS.easeOut(row.t)) * 9; } }
    };
  }

  /* ======================================================================
     SECTION 0: STREET FOLD. The town's street, copied; building rows hinge up on the kerb, one pair per pluck.
     ====================================================================== */
  function buildStreet() {
    const g = add(root, new THREE.Group()), ox = 0; g.position.x = ox;
    const asph = M('asphalt', { color: 0x2a2928, rough: .95 }), walkM = M('sidewalk', { color: 0x3a3936, rough: .95 });
    floorPlane(g, 5, 48, asph, 0, -10);                       // z +14 .. -34
    for (let z = 12; z > -30; z -= 3) box(g, .12, .01, 1.4, B('streetline', 0x6a6966), 0, .005, z); // centre dashes
    // the near end (static): sidewalks + facades, so the start looks like the street you were on
    for (const s of [-1, 1]) {
      floorPlane(g, 10, 12, walkM, s * 7.5, 8);
      piece(g, 'machiya', s * 5.7, 0, 11, s < 0 ? Math.PI / 2 : -Math.PI / 2);
      piece(g, s < 0 ? 'tobacco' : 'izakaya', s * 5.7, 0, 5, s < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    plane(g, 30, 14, blackM(), 0, 7, 14.2, 0, Math.PI);
    // the folding rows: 5 segments x 2 sides, pivot on the kerb line
    const segs = [], names = [['machiya', 'pharmacy'], ['izakaya', 'machiya'], ['pharmacy', 'tobacco'], ['machiya', 'izakaya'], ['tobacco', 'pharmacy']];
    for (let k = 0; k < 5; k++) {
      const zc = -1 - k * 6, pair = [];
      for (const s of [-1, 1]) {
        const pv = add(g, new THREE.Group()); pv.position.set(s * 2.5, 0, zc);
        floorPlane(pv, 10, 6, walkM, s * 5, 0, .01);
        box(pv, .2, .18, 6, M('kerb', { color: 0x55534f }), s * .1, .09, 0);
        piece(pv, names[k][s < 0 ? 0 : 1], s * 3.2, 0, 0, s < 0 ? Math.PI / 2 : -Math.PI / 2);
        if (k % 2 === 0) piece(pv, 'pole', s * 1.2, 0, 2.6, 0, 12);
        else piece(pv, 'vending', s * 2.2, 0, -2.4, s < 0 ? Math.PI / 2 : -Math.PI / 2, 1.8);
        const lan = WS.lantern({ red: k === 4 && s > 0 }); lan.position.set(s * 2.9, 3.2, 1.5); pv.add(lan);
        pair.push(new WS.Ratchet(pv, 'z', .34)); pair[pair.length - 1].sgn = s; // left lifts with -angle, right with +angle
      }
      segs.push(pair);
    }
    // the far end: the arcade gate with the red door
    const far = add(g, new THREE.Group()); far.position.z = -31;
    const door = doorway(g, 0, -31, -1, 5, 5.5);
    box(far, 26, 9, .4, blackM(), 0, 4.5, -2.6);
    const field = castleField(g, 30, 9, [-18, 22]);
    const MAXA = Math.PI / 3, STEP = Math.PI / 6;
    let nextSeg = 0;
    return {
      name: 'street', ox, g, door, entryZ: null, spawn: { x: 0, z: 9 },
      koto: { bpm: 96, beatsPerBar: 4, rests: [3] },
      enter() { nextSeg = 0; for (const p of segs) for (const r of p) r.set(0); door.k = door.target = 0; door.update(0); },
      onBeat(ev) {
        if (ev.rest) { sfx.knock(.15); return; }
        if (ev.beat === 0) { sfx.pluck(0, { vol: .6, bend: .8, bendTime: 2.5 }); return; }
        field.move(ev.beat);
        // one pair per pluck, nearest first, two 30 deg steps each
        for (let tries = 0; tries < 5; tries++) {
          const k = nextSeg % 5; nextSeg++;
          const pair = segs[k];
          if (Math.abs(pair[0].to) < MAXA - .01) {
            for (const r of pair) r.step(r.to + r.sgn * STEP);
            sfx.pluck(2 + k, { vol: .5 }); sfx.clack(.45); fear(.04);
            break;
          }
        }
      },
      done: () => segs.every(p => Math.abs(p[0].angle) >= MAXA - .02),
      update(dt) {
        for (const p of segs) for (const r of p) r.update(dt);
        field.update(dt); door.update(dt);
        const q = local();
        if (this.done() && q.z < -16) door.open();
        lights([[0, 3.4, 4, 1.2], [0, 3.4, -8, 1.1], [0, 3.4, -20, 1.1], [0, 4, 10, .8]], [0, 2, -29.5, 1.5]);
      },
      walkable(lx, z) { return (Math.abs(lx) <= 2.2 && z <= 13.5 && z >= -30.6) || (door.isOpen() && door.inside(lx, z, 0)); },
      exitAt: z => z < -31 - 1.2,
      auto(q) { return { x: -q.x, z: q.z > -29 || door.isOpen() ? -1 : 0 }; }
    };
  }

  /* ======================================================================
     SECTION 1 (a): HALLWAY STRETCH. An arcade of the town's shopfronts; lower note, longer hall.
     ====================================================================== */
  function buildHall() {
    const ox = 200, base = add(root, new THREE.Group()); base.position.x = ox;
    const grp = add(base, new THREE.Group());
    const W = 5, H = 4.6, Z0 = 4, DOORZ = -36, L = Z0 - DOORZ;
    const zc = (Z0 + DOORZ) / 2;
    floorPlane(grp, W, L, M('hallfloor', { map: tex('wood', 2, L / 2) }), 0, zc);
    plane(grp, W, L, M('hallroof', { map: tex('beams', 1, L / 2) }), 0, H, zc, Math.PI / 2);
    // the arcade's translucent roof strips (lit from above, like the town's arcade)
    for (let z = Z0 - 1; z > DOORZ; z -= 4) box(grp, W, .14, .3, M('hallbeam', { color: 0x141210 }), 0, H - .1, z);
    // shopfronts repeat down both sides, with shoji panels between: the arcade you learned
    const order = ['machiya', 'tobacco', 'izakaya', 'pharmacy'];
    for (const s of [-1, 1]) {
      let z = Z0 - .2, i = s > 0 ? 1 : 0;
      while (z > DOORZ + 1) {
        const n = order[i++ % order.length], w = KITW[n];
        piece(grp, n, s * W / 2, 0, z - w / 2, s < 0 ? Math.PI / 2 : -Math.PI / 2);
        z -= w;
        if (z > DOORZ + 2) { plane(grp, 1.6, H, M('hallshoji', { map: tex('shoji', 1, 2), emissive: 0x2c2b28, emissiveMap: tex('shoji', 1, 2) }), s * (W / 2 - .02), H / 2, z - .8, 0, -s * Math.PI / 2); z -= 1.6; }
      }
    }
    const wood = M('post', { color: 0x141210 });
    for (let z = Z0; z >= DOORZ; z -= 4) { box(grp, .2, H, .2, wood, -W / 2 + .1, H / 2, z); box(grp, .2, H, .2, wood, W / 2 - .1, H / 2, z); }
    const lanterns = [];
    for (let z = Z0 - 3; z > DOORZ; z -= 6) { const l = WS.lantern({ cord: .5 }); l.position.set(0, H - .9, z); grp.add(l); lanterns.push(l); }
    const entry = doorway(grp, 0, Z0, 1, W, H);
    // the goal: the red door (not stretched, so it keeps its size: the dolly zoom)
    const doorG = add(base, new THREE.Group());
    const exit = doorway(doorG, 0, 0, -1, W, H);
    box(doorG, 30, 12, .3, blackM(), 0, 6, -2.8);
    const fig = add(base, WS.figure({ h: 1.9 }));
    const S = new WS.Stretch();
    const st1 = { figL: Z0 + .3, force: 0 };
    const smax = () => rm() ? 1.8 : 3.4;
    let s = 1;
    function sAt(t) {
      const bl = koto.barLen(), tc = t % (bl * 4);
      if (tc < bl) return 1;
      if (tc < bl * 3) return 1 + (smax() - 1) * WS.smooth((tc - bl) / (bl * 2));
      return smax() + (1 - smax()) * WS.easeOut((tc - bl * 3) / .35);
    }
    const sec = {
      name: 'hall', ox, g: base, entryZ: Z0,
      koto: { bpm: 72, beatsPerBar: 4, rests: [3] },
      enter() { S.s = 1; S.A = 0; S.B = 0; s = 1; st1.figL = Z0 + .3; st1.force = 0; entry.k = entry.target = 1; entry.update(0); exit.k = exit.target = 0; exit.update(0); },
      onBeat(ev) {
        const cyc = ev.bar % 4;
        if (ev.inBar === 0 && cyc === 1) { sfx.pluck(0, { vol: .7, bend: .74, bendTime: koto.barLen() * 2 }); }
        if (ev.inBar === 0 && cyc === 3) { sfx.pluck(9, { vol: .7 }); sfx.clack(.6); }
        if (ev.inBar === 0 && cyc === 0) sfx.pluck(4, { vol: .35 });
        if (ev.rest) { // it steps only on the rest, and never quite reaches you
          const pl = S.toLevel(local().z);
          st1.figL = Math.max(pl + 1.6, st1.figL - 1.1); sfx.knock(.3);
          if (st1.figL - pl < 2.2) fear(.25);
        }
      },
      update(dt) {
        const q = local();
        const pl0 = S.toLevel(q.z);
        if (pl0 < DOORZ + 4) st1.force = Math.min(1, st1.force + dt * 2);
        s = lerp(sAt(koto.t), 1, st1.force);
        S.setScale(s, q.z); S.applyTo(grp);
        doorG.position.z = S.toWorld(DOORZ);
        fig.position.set(0, 0, S.toWorld(Math.min(st1.figL, Z0 - .3))); fig.rotation.y = 0;
        fig.lookAt(base.position.x + q.x, Y0, q.z); fig.position.set(0, 0, fig.position.z);
        fig.visible = st1.figL < Z0 - .2;
        for (const l of lanterns) l.rotation.x = (S.s - 1) * .06 * Math.sin(koto.t * 1.3);
        entry.update(dt); exit.update(dt);
        if (pl0 < DOORZ + 3) exit.open();
        G.shift.fov = rm() ? null : WS.dollyFov(BASE_FOV, S.s, 22);
        const lz = [Z0 - 4, Z0 - 16, Z0 - 28, DOORZ + 2].map(z => S.toWorld(z));
        lights([[0, 3.6, lz[0], 1.4], [0, 3.6, lz[1], 1.4], [0, 3.6, lz[2], 1.3], [0, 3.6, lz[3], 1]], [0, 1.6, doorG.position.z + .8, 1.4]);
      },
      walkable(lx, z) {
        const pl = S.toLevel(z);
        if (Math.abs(lx) <= 2.2 && pl <= Z0 && pl >= DOORZ + .3) return true;
        if (entry.inside(lx, pl, 0)) return true;
        return exit.isOpen() && Math.abs(lx) <= .55 && z <= doorG.position.z + .4 && z >= doorG.position.z - 2.3;
      },
      exitAt: z => z < doorG.position.z - 1.2,
      exitZ: () => doorG.position.z,
      auto(q) { return { x: -q.x, z: -1 }; },
      dbg: () => 'x' + S.s.toFixed(2)
    };
    return sec;
  }

  /* ======================================================================
     SECTION 2 (b): ROOM FOLD (lab fxFold). One 30 deg ratchet per pluck, while you stand in it.
     ====================================================================== */
  function buildRoom() {
    const ox = 400, scene = add(root, new THREE.Group()); scene.position.x = ox;
    const field = castleField(scene, 20, 6, [-14, 16]);
    const tat = () => M('tatami', { map: tex('tatami', 1, 1) });
    const room = add(scene, new THREE.Group());
    floorPlane(room, 3, 3, tat(), 0, 0);
    const crease = B('red', PAL.red);
    function strip(px, pz, axis) { const pv = add(room, new THREE.Group()); pv.position.set(px, 0, pz); return { pv, r: new WS.Ratchet(pv, axis, .3) }; }
    const N = strip(0, -1.5, 'x');
    const nFloor = add(N.pv, new THREE.Group());
    for (let i = -1; i <= 1; i++) floorPlane(nFloor, 3, 3, tat(), i * 3, -1.5);
    const nWall = plane(N.pv, 9, 3, M('plaster', { map: tex('plaster', 3, 1) }), 0, 1.5, -3);
    const scroll = plane(N.pv, .9, 2, M('scroll', { color: 0xe0ded8 }), 0, 1.6, -2.98);
    const sun = add(N.pv, new THREE.Mesh(new THREE.CircleGeometry(.28, 24), crease)); sun.position.set(0, 1.9, -2.97);
    box(nFloor, 1.2, .35, .7, M('table', { color: 0x151311 }), -1.8, .18, -1.6);
    const andon = WS.lantern(); andon.position.set(2.2, .3, -1.8); nFloor.add(andon);
    const S = strip(0, 1.5, 'x');
    for (let i = -1; i <= 1; i++) floorPlane(S.pv, 3, 3, tat(), i * 3, 1.5);
    box(S.pv, .5, .12, .5, M('tray', { color: 0xd6d4ce }), 1.4, .06, 1.4);
    const Wst = strip(-1.5, 0, 'z'), Est = strip(1.5, 0, 'z');
    floorPlane(Wst.pv, 3, 3, tat(), -1.5, 0); floorPlane(Est.pv, 3, 3, tat(), 1.5, 0);
    box(Wst.pv, .8, .12, .8, M('cushion', { color: PAL.blood }), -1.5, .06, 0); box(Est.pv, .8, .12, .8, M('cushion', { color: PAL.blood }), 1.5, .06, .4);
    for (const [x, z, w, d] of [[0, -1.5, 3, .03], [0, 1.5, 3, .03], [-1.5, 0, .03, 3], [1.5, 0, .03, 3]]) box(room, w, .01, d, crease, x, .005, z);
    for (const sx of [-1, 1]) box(N.pv, .14, 3, .14, M('post', { color: 0x0f0e0d }), sx * 4.4, 1.5, -2.95);
    // the hidden drawbridge, swapped in while the box is closed
    const BL = 20;
    const bridge = add(N.pv, new THREE.Group()); bridge.visible = false;
    floorPlane(bridge, 3, BL, M('bridge', { map: tex('tatami', 1, BL / 3) }), 0, -BL / 2);
    for (const sx of [-1, 1]) box(bridge, .08, .9, BL, M('rail', { color: 0x0a0a0a }), sx * 1.45, .45, -BL / 2);
    for (let z = -4; z > -BL; z -= 6) { const l = WS.lantern({ red: z < -14 }); l.position.set(1.45, 1.1, z); bridge.add(l); }
    const exit = doorway(bridge, 0, -BL, -1, 6, 4);
    // the entry from the hall: a door at the south edge (z 4.6); the south strip covers it when it folds
    const entry = doorway(scene, 0, 4.6, 1, 6, 3.2);
    const st2 = { swapped: false };
    const strips = { N, S, W: Wst, E: Est };
    const RA = Math.PI / 2 / 3;
    const score = { 1: [['N', +1]], 2: [['W', -1], ['E', +1]], 3: [['S', -1]], 5: [['N', -1]] };
    const flat = r => Math.abs(r.angle) < .03;
    let bounds = { xmin: -4.2, xmax: 4.2, zmin: -4.2, zmax: 4.2 }, bridgeOpen = false;
    return {
      name: 'room', ox, g: scene, entryZ: 4.6,
      koto: { bpm: 80, beatsPerBar: 4, rests: [3] },
      enter() {
        st2.swapped = false; nFloor.visible = nWall.visible = scroll.visible = sun.visible = true; bridge.visible = false;
        for (const k in strips) strips[k].r.set(0);
        entry.k = entry.target = 1; entry.update(0); exit.k = exit.target = 0; exit.update(0);
      },
      onBeat(ev) {
        const bar = ev.bar;
        if (ev.rest) { if (bar === 4) { sfx.knock(.9); fear(.3); if (G.fx && G.fx.spike && !st.ff) G.fx.spike(.5); } return; }
        field.move(ev.beat);
        sfx.pluck(bar === 5 ? 9 - ev.inBar : 3 + ev.inBar + (bar % 3), { vol: .5 });
        if (bar === 4) { if (ev.inBar <= 1) { sfx.knock(.9); fear(.2); } return; }
        const moves = score[bar]; if (!moves) return;
        sfx.clack(.5);
        for (const [k, sgn] of moves) {
          const s = strips[k];
          if (bar === 5) { if (!st2.swapped) { st2.swapped = true; nFloor.visible = nWall.visible = scroll.visible = sun.visible = false; bridge.visible = true; } s.r.step(Math.max(0, s.r.to - RA)); }
          else s.r.step(s.r.to + sgn * RA);
        }
      },
      update(dt) {
        for (const k in strips) strips[k].r.update(dt);
        field.update(dt); entry.update(dt); exit.update(dt);
        bridgeOpen = st2.swapped && flat(N.r) && !N.r.moving();
        bounds = { zmin: flat(N.r) ? (bridgeOpen ? -BL - 1.5 : -4.2) : -1.2, zmax: flat(S.r) ? 4.2 : 1.2, xmin: flat(Wst.r) ? -4.2 : -1.2, xmax: flat(Est.r) ? 4.2 : 1.2 };
        const q = local();
        if (bridgeOpen && q.z < -BL + 2.5) exit.open();
        const closed = !flat(N.r) && !flat(S.r) && Math.abs(N.r.angle) > 1.4 && Math.abs(S.r.angle) > 1.4;
        lights([[0, 2.7, 0, closed ? .4 : 2.2, 12], [2.2, .8, -3.3, 1.2, 7], [0, 2.4, -10, bridgeOpen ? 1 : 0], [0, 2.4, -18, bridgeOpen ? 1 : 0]], bridgeOpen ? [0, 1.6, -BL - 1.5 + 2.3, 1.3] : null);
      },
      walkable(lx, z) {
        if (entry.inside(lx, z, 0)) return flat(S.r);
        if (bridgeOpen && z < -1.5) { if (Math.abs(lx) <= 1.2 && z >= -BL - 1.5 + .3) return true; return exit.isOpen() && Math.abs(lx) <= .55 && z <= -BL - 1.5 + .4 && z >= -BL - 1.5 - 2.3; }
        return Math.abs(lx) <= 4.2 && z <= 4.5 && z >= -4.2;
      },
      carry(lx, z) { // the floor tilts under you: slide back onto what is still flat
        if (bridgeOpen && z < -1.5) return null;
        if (entry.inside(lx, z, 0) && flat(S.r)) return null;
        const sp = 5 * (G.dt || 1 / 60);
        const bx = Math.abs(lx) <= 1.2 && bridgeOpen ? 1.2 : null;
        let dx = 0, dz = 0;
        const xmin = bounds.xmin, xmax = bounds.xmax;
        if (lx < xmin) dx = Math.min(xmin - lx, sp); else if (lx > xmax) dx = -Math.min(lx - xmax, sp);
        if (z < bounds.zmin) dz = Math.min(bounds.zmin - z, sp); else if (z > bounds.zmax) dz = -Math.min(z - bounds.zmax, sp);
        if (bx && z < -1.6 && Math.abs(lx) > bx) dx = -Math.sign(lx) * Math.min(Math.abs(lx) - bx, sp);
        return dx || dz ? { dx, dz } : null;
      },
      exitAt: z => z < -BL - 1.5 - 1.2,
      auto(q) {
        if (!bridgeOpen) { const tx = 0 - q.x, tz = 0 - q.z; const d = Math.hypot(tx, tz); return d > .3 ? { x: tx / d, z: tz / d } : null; }
        return { x: -q.x, z: -1 };
      },
      dbg: () => 'N ' + (N.r.angle * 57.3).toFixed(0) + ' S ' + (S.r.angle * 57.3).toFixed(0)
    };
  }

  /* ======================================================================
     SECTION 3 (c): CASTLE GRID (lab fxGrid). String n plucks, row n moves one cell; the rest beat is still, except for her.
     ====================================================================== */
  function buildGrid() {
    const ox = 600, scene = add(root, new THREE.Group()); scene.position.x = ox;
    const CELL = 6, NR = 5, railM = M('rail2', { color: 0x040404, rough: .35 });
    const tat = M('tatami2', { map: tex('tatami', 2, 2) }), postM = M('post2', { color: 0x0e0d0c }), clampM = B('red', PAL.red);
    const shojiBox = M('shojibox', { map: tex('shoji', 2, 1), emissive: 0x2f2e2b, emissiveMap: tex('shoji', 2, 1) });
    const rows = [], PH = [-1, 1, -1, 1, -1], DIR = [1, -1, 1, -1, 1];
    for (let r = 0; r < NR; r++) {
      const z = -r * CELL, row = { z, g: add(scene, new THREE.Group()), cells: [-3, 0, 3], off: PH[r], dir: DIR[r], from: PH[r], to: PH[r], t: 1, x: PH[r] * CELL, dx: 0 };
      for (const c of row.cells) {
        const pg = add(row.g, new THREE.Group()); pg.position.x = c * CELL;
        box(pg, CELL - .08, .4, CELL - .08, M('slab', { color: 0x1a1816 }), 0, -.2, 0);
        floorPlane(pg, CELL - .2, CELL - .2, tat, 0, 0, .005);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(pg, .14, 2.6, .14, postM, sx * 2.8, 1.3, sz * 2.8);
        box(pg, 1.2, .5, 1.6, railM, 0, -.65, 0); box(pg, .3, .12, .3, clampM, 0, -.95, 0);
        const l = WS.lantern(); l.position.set(2.6, 2.3, 2.6); pg.add(l);
        box(pg, CELL - .5, 4, CELL - .5, shojiBox, 0, 12, 0); box(pg, CELL - .5, 4, CELL - .5, shojiBox, 0, -12, 0);
        box(pg, .1, 7.6, .1, railM, 0, -6, 0); box(pg, .1, 7.4, .1, railM, 0, 6.3, 0);
      }
      row.g.position.set(row.x, 0, z);
      for (const y of [-1.05, 9.8, -14.2]) for (const dz of [-1.6, 1.6]) box(scene, 140, .22, .22, railM, 0, y, z + dz);
      row.string = add(scene, WS.makeString(-60, 60, 16, z, PAL.red));
      for (const sx of [-1, 1]) box(scene, .6, 16, .6, railM, sx * 60, 8, z);
      rows.push(row);
    }
    const bank = (z0, z1) => { const d = z0 - z1; box(scene, 18, .4, d, M('slab', { color: 0x1a1816 }), 0, -.2, (z0 + z1) / 2); floorPlane(scene, 17.8, d - .2, M('tatami3', { map: tex('tatami', 3, 2) }), 0, (z0 + z1) / 2, .005); };
    bank(12, 3); bank(-27, -34.2);
    const entry = doorway(scene, 0, 12, 1, 18, 5);
    const exit = doorway(scene, 0, -34, -1, 18, 5);
    // the player of the koto: far away, huge, a hand that lights on each pluck (fog-free: a silhouette against the fog)
    const kp = add(scene, new THREE.Group()); kp.position.set(0, 6, -95);
    const blk = B('kotoblack', 0x030303);
    box(kp, 10, 12, 6, blk, 0, 6, 0); add(kp, new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), blk)).position.set(0, 14.5, 0);
    const handM = WS.basic(0x200000, false), handL = box(kp, 1.4, .6, 1.4, handM, 4, 4, 6);
    box(kp, 40, 1.2, 4, B('kotobody', 0x0d0c0b), 0, 2, 8);
    for (let i = 0; i < 13; i++) box(kp, .15, .15, 9, B('red', PAL.red), -18 + i * 3, 2.8, 8);
    const fig = add(scene, WS.figure());
    const g3 = { fcx: 0, fcz: 16, handT: 0, falling: 0, fallT: 0, miss: 0, summoned: false, caught: 0 };
    const useMonster = () => hasMod('monster');
    function support(x, z, m) {
      m = m || 0;
      if (Math.abs(x) <= 9 + m && z <= 12 && z >= 3 - m) return { bank: 1 };
      if (Math.abs(x) <= 9 + m && z <= -27 + m && z >= -34.2) return { bank: 2 };
      for (const row of rows) if (Math.abs(z - row.z) <= 3 + m) for (const c of row.cells) if (Math.abs(x - (row.x + c * CELL)) <= 2.98 + m) return { row };
      return null;
    }
    function reset() { // fell or was caught: back to the row start, no death
      emitTeleport(ox + 0, 7, 0);
      g3.falling = 0; g3.fallT = 0; g3.fcx = 0; g3.fcz = 16; g3.caught = 0; st.dip = 0;
    }
    return {
      name: 'grid', ox, g: scene, entryZ: 12,
      koto: { bpm: 76, beatsPerBar: 6, rests: [5] },
      enter() { g3.falling = 0; g3.fcx = 0; g3.fcz = 16; g3.summoned = false; entry.k = entry.target = 1; entry.update(0); exit.k = exit.target = 0; exit.update(0); },
      onBeat(ev) {
        if (ev.rest) {
          if (!g3.summoned && ev.bar >= 0) { g3.summoned = true; G.emit('monster-summon', { pos: new THREE.Vector3(ox, Y0, 16) }); }
          if (!useMonster()) { // the silhouette moves only when everything else is still
            const q = local(), pcx = Math.round(q.x / CELL);
            if (Math.abs(g3.fcz - q.z) > 3) g3.fcz += Math.sign(q.z - g3.fcz) * CELL; else if (pcx !== g3.fcx) g3.fcx += Math.sign(pcx - g3.fcx);
          }
          sfx.knock(.35); return;
        }
        const row = rows[ev.inBar]; if (!row) return;
        if (row.off + row.dir > 1 || row.off + row.dir < -1) row.dir *= -1;
        row.from = row.off; row.to = row.off + row.dir; row.off = row.to; row.t = 0;
        row.string.pluck(.9); sfx.pluck(2 + ev.inBar * 2, { vol: .55 }); sfx.clack(.45); g3.handT = .25;
      },
      update(dt) {
        for (const row of rows) { const old = row.x; if (row.t < 1) row.t = Math.min(1, row.t + dt / .4); row.x = lerp(row.from, row.to, WS.easeOut(row.t)) * CELL; row.dx = row.x - old; row.g.position.x = row.x; row.string.tick(dt); }
        g3.handT = Math.max(0, g3.handT - dt); handM.color.set(g3.handT > 0 ? PAL.glow : 0x200000); handL.position.y = 4 + g3.handT * 4;
        entry.update(dt); exit.update(dt);
        const q = local();
        fig.visible = !useMonster();
        fig.position.set(g3.fcx * CELL, 0, g3.fcz); fig.lookAt(ox + q.x, Y0, q.z);
        if (q.z < -24) exit.open();
        lights([[0, 3.2, 6, 1.1, 16], [rows[1].x, 3.2, -6, 1.2], [rows[3].x, 3.2, -18, 1.2], [0, 3.4, -30, 1]], [0, 2, -32.5, 1.5]);
        if (g3.falling) {
          g3.fallT += dt; st.dip = rm() ? 0 : 7 * g3.fallT * g3.fallT;
          if (rm()) st.fade = Math.min(1, g3.fallT / .5);
          if (g3.fallT > .8) { reset(); fear(.3); }
          return;
        }
        const inVest = entry.inside(q.x, q.z, 0) || exit.inside(q.x, q.z, 0);
        if (!inVest && !support(q.x, q.z, .35)) { if (++g3.miss > 2) { g3.falling = 1; g3.fallT = 0; sfx.pluck(0, { vol: .5, bend: .5, bendTime: 1 }); } } else g3.miss = 0;
        if (!useMonster() && fig.visible && !g3.caught && Math.abs(fig.position.x - q.x) < 2.2 && Math.abs(fig.position.z - q.z) < 2.2 && q.z < 12) {
          g3.caught = 1; fear(.6); if (G.fx && G.fx.spike && !st.ff) G.fx.spike(1); st.flash = rm() ? 0 : .8; reset();
        }
      },
      walkable(lx, z) {
        if (g3.falling) return false;
        if (entry.inside(lx, z, 0)) return true;
        if (exit.isOpen() && exit.inside(lx, z, 0)) return true;
        if (z > 12 || z < -34.2) return false;
        return Math.abs(lx) <= 30; // gaps are walkable: you can fall between the rooms
      },
      carry(lx, z) { if (g3.falling) return null; const s = support(lx, z); return s && s.row && s.row.dx ? { dx: s.row.dx, dz: 0 } : null; },
      exitAt: z => z < -34 - 1.2,
      auto(q) {
        const s = support(q.x, q.z);
        let cx = 0; if (s && s.row) { let best = 1e9; for (const c of s.row.cells) { const px = s.row.x + c * CELL; if (Math.abs(px - q.x) < Math.abs(best - q.x)) best = px; } cx = best; }
        const steer = clamp((cx - q.x) * .8, -1, 1);
        const ahead = support(q.x, q.z - 1.2), nextRow = ahead && ahead.row && ahead.row.t < 1;
        return { x: steer, z: ahead && !nextRow ? -1 : (exit.isOpen() && q.z < -33 ? -1 : 0) };
      },
      dbg: () => rows.map(r => r.off).join(' ')
    };
  }

  /* ---------------- sequence control ---------------- */
  let SECS = null;
  function emitTeleport(x, z, yaw) {
    const pos = new THREE.Vector3(x, Y0, z);
    G.emit('teleport', { pos, yaw });
  }
  function enterSection(name, lx, lz, yaw) {
    const sec = SECS[name];
    if (st.sec) st.log.push(st.sec.name + ' ' + st.secT.toFixed(1) + 's');
    for (const k in SECS) SECS[k].g.visible = k === name;
    st.sec = sec; st.secT = 0; G.shift.section = name; G.shift.fov = null;
    sec.enter();
    koto.configure(sec.koto); koto.clear();
    koto.on(ev => { G.emit('koto', { beat: st.beatG++, rest: ev.rest, bar: ev.bar, inBar: ev.inBar, section: name, bpm: sec.koto.bpm }); try { sec.onBeat(ev); } catch (e) { console.error('[worldshift] beat', e); } });
    const x = lx != null ? lx : 0, z = lz != null ? lz : (sec.spawn ? sec.spawn.z : sec.entryZ + 1.2);
    emitTeleport(sec.ox + x, z, yaw != null ? yaw : 0);
    sec.update(0);
  }
  function start(at) {
    if (st.active) return;
    st.active = true; G.shift.active = true; st.total = 0; st.beatG = 0; st.log = [];
    const p = ppos(); st.origin = p.clone(); st.originYaw = pyaw();
    root.visible = true;
    // the castle has no rain and its own, thinner fog
    st.saved = { fog: G.scene.fog, fxDensity: G.fx && G.fx.fog ? G.fx.fog.density : null, rain: G.fx && G.fx.isOn ? G.fx.isOn('rain') : null, splashes: G.fx && G.fx.isOn ? G.fx.isOn('splashes') : null };
    if (G.fx && G.fx.fog) { G.fx.fog.density = .03; if (G.fx.enable) { G.fx.enable('rain', false); G.fx.enable('splashes', false); } }
    else G.scene.fog = new THREE.FogExp2(0x0b0b0c, .02);
    bindAudio(G.audioCtx); sfx.drone(true);
    if (at && at !== 'street') { st.phase = 'run'; enterSection(at, 0, SECS[at].entryZ - 1.5); return; }
    st.phase = 'entry'; st.t = 0;
    sfx.pluck(0, { vol: .7, bend: .7, bendTime: 2.4 }); // the bell's hanging note becomes the first pluck
  }
  function finish() {
    st.log.push(st.sec.name + ' ' + st.secT.toFixed(1) + 's', 'total ' + st.total.toFixed(1) + 's');
    console.log('[worldshift] done: ' + st.log.join(' | '));
    const station = G.world && G.world.station, sp = station && station.spawnAfterShift;
    let pos, yaw = st.originYaw;
    if (sp) { const v = sp.pos || sp; pos = new THREE.Vector3(v.x || 0, v.y || 0, v.z || 0); if (sp.yaw != null) yaw = sp.yaw; else if (station.spawnYaw != null) yaw = station.spawnYaw; }
    else pos = st.origin ? st.origin.clone() : new THREE.Vector3();
    st.active = false; G.shift.active = false; G.shift.fov = null; G.shift.section = null; st.phase = 'idle'; st.sec = null;
    root.visible = false; koto.clear(); sfx.drone(false); sfx.pluck(9, { vol: .6 }); sfx.pluck(12, { vol: .4, delay: .3 });
    const s = st.saved || {};
    if (G.fx && G.fx.fog) { if (s.fxDensity != null) G.fx.fog.density = s.fxDensity; if (G.fx.enable) { G.fx.enable('rain', s.rain !== false); G.fx.enable('splashes', s.splashes !== false); } }
    else G.scene.fog = s.fog || null;
    if (G.camera) G.camera.rotation.z = 0;
    st.flash = rm() ? 0 : 1; st.fade = rm() ? 1 : 0;
    G.emit('teleport', { pos, yaw });
    G.emit('shift-end');
  }

  /* ---------------- fallback walker (only when no player module) ---------------- */
  G.on('teleport', d => { if (!d || !d.pos) return; if (!hasPlayer()) { fb.pos.copy(d.pos); if (d.yaw != null) fb.yaw = d.yaw; } });
  function fallbackWalk(dt) {
    const I = G.input || {};
    fb.yaw -= I.lx || 0; fb.pitch = clamp(fb.pitch - (I.ly || 0), -1.3, 1.3);
    let mx = I.mx || 0, mz = I.mz || 0, dx, dz;
    const sec = st.sec;
    const c = G.shift.carry(fb.pos.x, fb.pos.z); if (c) { fb.pos.x += c.dx; fb.pos.z += c.dz; }
    if (fb.auto && sec && st.phase === 'run' && sec.auto) {
      const q = local(), a = sec.auto(q);
      if (a) { const l = Math.hypot(a.x, a.z) || 1; dx = a.x / Math.max(1, l) * WALK * dt; dz = a.z / Math.max(1, l) * WALK * dt; } else dx = dz = 0;
    } else {
      const sp = WALK * (I.run ? 1.6 : 1) * dt, cy = Math.cos(fb.yaw), sy = Math.sin(fb.yaw);
      dx = (mx * cy + mz * sy) * sp; dz = (-mx * sy + mz * cy) * sp;
    }
    const W = G.shift.walkable;
    if (W(fb.pos.x + dx, fb.pos.z + dz)) { fb.pos.x += dx; fb.pos.z += dz; }
    else if (W(fb.pos.x + dx, fb.pos.z)) fb.pos.x += dx;
    else if (W(fb.pos.x, fb.pos.z + dz)) fb.pos.z += dz;
  }

  /* ---------------- per-frame ---------------- */
  function step(dt) {
    if (!st.active) return;
    st.total += dt; G.shift.t = st.total;
    if (st.phase === 'entry') {
      st.t += dt; const k = clamp(st.t / 2.4, 0, 1);
      // the street folds around you: the horizon tilts, the view bends wide, then white
      st.roll = rm() ? 0 : .55 * k * k * Math.sin(k * 2.2);
      G.shift.fov = rm() ? null : BASE_FOV + 38 * k * k;
      st.lift = rm() ? 0 : 1.2 * k * k;
      if (rm()) st.fade = WS.smooth((st.t - .9) / 1.2); else st.flash = WS.smooth((st.t - 1.8) / .55);
      if (st.t > .8 && st.t - dt <= .8) { sfx.pluck(4, { vol: .5 }); fear(.2); }
      if (st.t > 1.6 && st.t - dt <= 1.6) { sfx.pluck(7, { vol: .5 }); sfx.clack(.6); }
      if (k >= 1) { st.roll = 0; st.lift = 0; st.phase = 'run'; if (G.fx && G.fx.spike && !rm() && !st.ff) G.fx.spike(.6); enterSection('street'); }
    } else if (st.phase === 'run') {
      const sec = st.sec; st.secT += dt;
      koto.update(dt);
      sec.update(dt);
      if (!hasPlayer()) fallbackWalk(dt);
      const q = local();
      if (sec.exitAt(q.z)) {
        const next = { street: 'hall', hall: 'room', room: 'grid' }[sec.name];
        const exitZ = sec.exitZ ? sec.exitZ() : null;
        if (!next) { finish(); return; }
        // seamless: same offset from the door in the next section's identical vestibule
        const base = exitZ != null ? exitZ : (sec.name === 'street' ? -31 : -21.5);
        const v = base - q.z; // > 1.2
        sfx.clack(.5);
        enterSection(next, q.x, SECS[next].entryZ + 2.4 - v, pyaw());
      }
    }
  }
  function postCamera(dt) {
    // fades and flashes decay; camera effects on top of whatever placed the camera
    if (st.flash > 0 && G.ui) { G.ui.flash(Math.min(1, st.flash)); if (st.phase !== 'entry') st.flash = Math.max(0, st.flash - dt * 1.2); if (st.flash === 0) G.ui.flash(0); }
    if (st.fade > 0 && G.ui) { G.ui.fade(st.fade); if (st.phase !== 'entry') { st.fade = Math.max(0, st.fade - dt * 1.5); } if (st.fade === 0) G.ui.fade(0); }
    if (!st.active) return;
    const cam = G.camera;
    if (!hasPlayer()) {
      cam.position.set(fb.pos.x, fb.pos.y + EYE, fb.pos.z); cam.rotation.set(fb.pitch, fb.yaw, 0);
      const f = G.shift.fov || BASE_FOV; if (Math.abs(cam.fov - f) > .01) { cam.fov = f; cam.updateProjectionMatrix(); }
    }
    cam.rotation.z = st.roll || 0;
    cam.position.y += (st.lift || 0) - (st.dip || 0);
  }

  G.register('worldshift', {
    order: 50,
    init(G) {
      G.scene.add(root);
      SECS = { street: buildStreet(), hall: buildHall(), room: buildRoom(), grid: buildGrid() };
      G.on('shift-start', d => start(d && d.at));
      G.on('audio-ready', ctx => { if (st.active) bindAudio(ctx); });
      G.on('ready', () => {
        const j = G.jump || '', map = { 'shift-street': 'street', 'shift': 'street', 'shift-stretch': 'hall', 'shift-fold': 'room', 'shift-grid': 'grid' };
        if (!map[j]) return;
        if (!hasPlayer()) fb.pos.set(0, 0, 0);
        if (G.ui && !hasMod('mission')) G.ui.fade(0); // capture hook only: nobody else lifts the start fade
        G.emit('shift-start', { at: map[j] });
        if (HP.get('sim') === '1') { // headless route check: walk it all, log section times
          fb.auto = true; let n = 0; while (st.active && n++ < 30 * 400) { G.dt = 1 / 30; step(1 / 30); }
          if (st.active) console.log('[worldshift] sim stuck in ' + st.sec.name + ' at ' + JSON.stringify(local()) + ' ' + (st.sec.dbg ? st.sec.dbg() : ''));
        } else if (HP.has('ff')) { const T = +HP.get('ff'); let t = 0; st.ff = true; while (t < T && st.active) { G.dt = 1 / 30; step(1 / 30); t += 1 / 30; } st.ff = false; st.flash = 0; if (G.ui) G.ui.flash(0); }
        if (HP.has('yaw')) fb.yaw = +HP.get('yaw'); if (HP.has('pitch')) fb.pitch = +HP.get('pitch');
      });
      const loads = Object.keys(KIT).map(k => G.loadGLB(KIT[k]).then(gl => { kit[k] = gl.scene; gl.scene.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } }); }).catch(() => console.warn('[worldshift] kit piece missing, using a stand-in: ' + k)));
      return Promise.all(loads).then(placeSlots);
    },
    update(dt) { step(dt); postCamera(dt); }
  });
})();
