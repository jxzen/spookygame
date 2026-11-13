/* level.js · OWNER: level (brief W2-LEVEL). Builds the town "Kagemachi" (docs/design/level-plan-mission1.md §3 + map SVG)
 * and writes G.world. Registered as 'level', order 20.
 *
 * COORDINATES. Plan metres: x = east, y = north, origin at the plan's south-west corner. three.js: x = east, z = -north, y = up.
 *   Helper in this file: V(x, y, h) -> new Vector3(x, h, -y).  Yaw convention (camera rotation.y, order YXZ):
 *   yaw 0 = facing north (-z), +PI/2 = facing west, -PI/2 = facing east, PI = facing south.
 *
 * G.WORLD (every field always present once init has run; before that core's defaults apply)
 *   colliders   Box3[]                 static solids (walls, masses, props) + the station gate while it is shut
 *   walkable(x, z, r=0.3) -> bool      grid (0.25 m) of walkable floor minus solids, plus dynamic blockers (station gate)
 *   heightAt(x, z) -> number           floor height (shrine stairs ramp 0 -> 6 m, precinct 6 m, everything else 0)
 *   indoor(x, z) -> roomId|null        roofed rooms (shops, izakaya, kura, station, underpass); 'arcade' for the torn-roof arcade
 *   spawn       {pos, yaw}             underpass, facing north
 *   drops       [{id:1|2|3, pos}]      intel dead drops (pharmacy drawer, izakaya ledger, ema wall)
 *   bell        Vector3                the shrine bell rope, at hand height
 *   hideSpots   [{id, pos, radius, kind, enter, yaw, room}]   enter = where the player stands to get in; yaw = view while hidden
 *   doors       [{id, room, pos, normal, width}]  doorways (all open; walls have gaps). normal points out of the room
 *   rooms       [{id, x0,x1,y0,y1 (plan), base, doors:[ids]}]
 *   nav         {nodes:[{id, pos}], edges:[[a,b],...]}  ids are strings; the station gate edge is added when the gate opens
 *   lights      [{id, tag, light, base, pos, flicker, level, setLevel(k)}]   every lamp. To kill/dim a lamp call setLevel(0..1)
 *               (works with and without HorrorFX). Only the nearest 7 point + 5 spot lights are visible at a time (pool).
 *   lampsByTag(tag) -> entries         tags: street, alley, arcade, yokocho, lantern, shrine, vending, interior, station, signal, barricade
 *   yokaiSpots  [{id:'Y1'..'Y5', pos, facing:Vector3, yaw, kind, planKind, view:Vector3}]   kinds from the yokai roster top 5
 *   backstage   [{id, pos}]            the hunter's 4 doors: drain, roof (yokocho), shrine underfloor, rail tunnel
 *   station     {platform, platformBox, trackDir, trackY, trackZ, trainSpawnX, trainLength, tunnelX, lastCarX, redLamp,
 *                office, gate, spawnAfterShift:{pos,yaw}}
 *   stationGate {pos, isOpen, open(), close()}   red shutter, locked until the shift; also opens itself on 'shift-end'
 *   props       {shutterW3: Mesh (the bulged-shutter trace), basinWater: Mesh, bellMesh: Object3D, arcadeRoof: Mesh}
 *   grid        {cell, w, h, data:Uint8Array}  (plan cell (i,j) = x i*cell, y j*cell)
 *   landmarks   named Vector3 points, see LANDMARKS below
 *
 * LANDMARKS (G.world.landmarks.<name>)
 *   spawn underpassExit southStreet westAlleyMouth arcadeSouth arcadeNorth glimpse shutterW3 pharmacyDoor pharmacyBack
 *   kimonoDoor kimonoBack noodleDoor noodleBack noodleWindow pachinkoDoor pachinkoBack yokochoSouth yokochoNorth
 *   izakayaFront izakayaBack izakayaShoji shadow canalSouth canalNorth northRoad overpass plaza plazaArcadeMouth
 *   shrineStairsBottom shrineStairsTop torii basin ema haiden bell kura stationGate stationInside stationOffice
 *   platformWest platformEast stationRedLamp signalMast tunnel drain roofYokocho shrineUnderfloor railTunnel
 *   shiftStart shiftEnd
 *
 * EVENTS. Listens: 'intel' {n:1} -> arcade lamps die south to north over 4 s (the glimpse lamp at the north mouth stays);
 *   'shift-start'/'shift-end' -> stops/resumes this module's rain control; 'shift-end' also opens the station gate.
 *   Emits: 'teleport' {pos, yaw, pitch} for #jump=level-* when a player module is present; 'station-gate' {open}.
 * CAPTURE HOOKS: #jump=level-start | level-arcade | level-yokocho | level-shrine | level-station | level-north
 * RAIN: while no shift is running this module sets HorrorFX.rain.intensity to 0 indoors (1 outdoors, 0.7 in the arcade)
 *   and HorrorFX.rain.ground to the floor height under the camera.
 */
(function () {
  'use strict';
  const G = window.G; if (!G) return;
  const THREE = G.THREE || window.THREE;
  const PI = Math.PI;
  const V = (x, y, h) => new THREE.Vector3(x, h || 0, -y);

  /* ---------------- seeded random ---------------- */
  let seed = 90210;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const R = (a, b) => a + (b - a) * rnd();

  /* ---------------- canvas textures ---------------- */
  function cvs(w, h, draw, opts) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    if (opts && opts.clamp) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }
  const grey = (v, a) => 'rgba(' + (v | 0) + ',' + (v | 0) + ',' + (v | 0) + ',' + (a == null ? 1 : a) + ')';
  function speckle(g, w, h, n, a, b, al, s0, s1) { for (let i = 0; i < n; i++) { g.fillStyle = grey(R(a, b), al); const s = R(s0 || 1, s1 || 3); g.fillRect(rnd() * w, rnd() * h, s, s); } }
  function blotch(g, w, h, n, a, b, al, r0, r1) {
    for (let i = 0; i < n; i++) { const x = rnd() * w, y = rnd() * h, r = R(r0, r1); const gr = g.createRadialGradient(x, y, 0, x, y, r); const v = R(a, b) | 0;
      gr.addColorStop(0, grey(v, al)); gr.addColorStop(1, grey(v, 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  }
  function rainStreaks(g, w, h, n, al) { for (let i = 0; i < n; i++) { const x = rnd() * w, y = rnd() * h * 0.5, l = R(h * 0.2, h * 0.8); const gr = g.createLinearGradient(0, y, 0, y + l);
    gr.addColorStop(0, grey(10, al)); gr.addColorStop(1, grey(10, 0)); g.fillStyle = gr; g.fillRect(x, y, R(1, 4), l); } }
  const JFONT = '"Yu Mincho","MS Mincho","Hiragino Mincho ProN","Noto Serif JP",serif';
  const JGOTH = '"Yu Gothic","MS Gothic","Meiryo","Noto Sans JP",sans-serif';

  const TEX = {};
  function makeTextures() {
    TEX.asphalt = cvs(512, 512, (g, w, h) => {
      g.fillStyle = '#29292a'; g.fillRect(0, 0, w, h); blotch(g, w, h, 40, 18, 52, 0.35, 30, 120); speckle(g, w, h, 9000, 10, 80, 0.5, 1, 2);
      g.strokeStyle = 'rgba(8,8,8,.8)'; g.lineWidth = 1.5;
      for (let i = 0; i < 9; i++) { g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += R(-30, 30); y += R(-30, 30); g.lineTo(x, y); } g.stroke(); }
    });
    TEX.paving = cvs(256, 256, (g, w, h) => {
      g.fillStyle = '#3b3b3a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = grey(R(46, 70)); g.fillRect(i * 64 + 2, j * 64 + 2, 60, 60); }
      blotch(g, w, h, 20, 20, 40, 0.4, 10, 50); speckle(g, w, h, 2500, 20, 90, 0.4);
    });
    TEX.plaster = cvs(512, 512, (g, w, h) => { g.fillStyle = '#4b4946'; g.fillRect(0, 0, w, h); blotch(g, w, h, 60, 30, 80, 0.3, 20, 90); rainStreaks(g, w, h, 70, 0.35); speckle(g, w, h, 4000, 30, 90, 0.3); });
    TEX.backwall = cvs(256, 512, (g, w, h) => { // 4 m x 8 m: back of shops: pipes, small windows, meters
      g.fillStyle = '#3c3a38'; g.fillRect(0, 0, w, h); blotch(g, w, h, 30, 20, 70, 0.35, 20, 70); rainStreaks(g, w, h, 40, 0.4);
      g.fillStyle = '#0d0e0f'; g.fillRect(40, 170, 60, 50); g.fillRect(150, 60, 70, 60); g.strokeStyle = '#555'; g.lineWidth = 3; g.strokeRect(40, 170, 60, 50); g.strokeRect(150, 60, 70, 60);
      g.fillStyle = '#262626'; g.fillRect(222, 0, 9, h); g.fillRect(14, 0, 6, h); // drain pipes
      g.fillStyle = '#5a5a5a'; g.fillRect(120, 380, 26, 34); speckle(g, w, h, 1500, 20, 80, 0.3);
    });
    TEX.concrete = cvs(512, 512, (g, w, h) => { g.fillStyle = '#454545'; g.fillRect(0, 0, w, h); blotch(g, w, h, 50, 25, 80, 0.3, 20, 100);
      g.strokeStyle = 'rgba(20,20,20,.7)'; g.lineWidth = 2; for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y <= h; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.fillStyle = '#222'; for (let x = 32; x < w; x += 64) for (let y = 32; y < h; y += 64) g.fillRect(x, y, 4, 4); rainStreaks(g, w, h, 60, 0.35); speckle(g, w, h, 3000, 30, 90, 0.3); });
    TEX.stone = cvs(256, 256, (g, w, h) => { g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) { let x = (y / 32 % 2) * -24; while (x < w) { const bw = R(40, 70); g.fillStyle = grey(R(60, 90)); g.fillRect(x + 2, y + 2, bw - 4, 28); x += bw; } }
      speckle(g, w, h, 3000, 30, 110, 0.4); blotch(g, w, h, 15, 20, 40, 0.4, 10, 40); });
    TEX.shutter = cvs(256, 256, (g, w, h) => { for (let y = 0; y < h; y += 8) { const gr = g.createLinearGradient(0, y, 0, y + 8); gr.addColorStop(0, '#6a6a6a'); gr.addColorStop(0.5, '#4a4a4a'); gr.addColorStop(1, '#262626'); g.fillStyle = gr; g.fillRect(0, y, w, 8); }
      blotch(g, w, h, 25, 15, 40, 0.45, 10, 60); rainStreaks(g, w, h, 30, 0.4); speckle(g, w, h, 800, 20, 60, 0.4); });
    TEX.wood = cvs(256, 256, (g, w, h) => { g.fillStyle = '#1d1b19'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 32) { g.fillStyle = grey(R(22, 38)); g.fillRect(x + 1, 0, 30, h); g.fillStyle = '#0a0a0a'; g.fillRect(x, 0, 1.5, h); }
      g.strokeStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 80; i++) { const x = rnd() * w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + R(-6, 6), h / 3, x + R(-6, 6), h * 2 / 3, x + R(-4, 4), h); g.stroke(); } });
    TEX.lattice = cvs(256, 256, (g, w, h) => { g.fillStyle = '#050505'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { g.fillStyle = grey(R(34, 48)); g.fillRect(x, 0, 8, h); } g.fillStyle = '#2a2826'; g.fillRect(0, 0, w, 10); g.fillRect(0, 124, w, 8); });
    TEX.roof = cvs(256, 256, (g, w, h) => { for (let y = 0; y < h; y += 16) { const gr = g.createLinearGradient(0, y, 0, y + 16); gr.addColorStop(0, '#3a3b3d'); gr.addColorStop(1, '#141516'); g.fillStyle = gr; g.fillRect(0, y, w, 16); }
      g.fillStyle = 'rgba(0,0,0,.4)'; for (let x = 0; x < w; x += 21) g.fillRect(x, 0, 2, h); });
    TEX.gravel = cvs(256, 256, (g, w, h) => { g.fillStyle = '#4c4c4a'; g.fillRect(0, 0, w, h); speckle(g, w, h, 14000, 30, 140, 0.8, 1, 3); });
    TEX.tatami = cvs(256, 256, (g, w, h) => { g.fillStyle = '#5c5b52'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(30,30,25,.5)'; for (let y = 0; y < h; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.fillStyle = '#1a1a18'; g.fillRect(0, 0, 10, h); g.fillRect(128, 0, 10, h); blotch(g, w, h, 12, 30, 50, 0.4, 20, 60); });
    TEX.floor = cvs(256, 256, (g, w, h) => { g.fillStyle = '#2b2825'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 32) { g.fillStyle = grey(R(36, 52)); g.fillRect(0, y + 1, w, 30); } blotch(g, w, h, 20, 10, 30, 0.5, 15, 60); speckle(g, w, h, 1500, 10, 60, 0.4); });
    TEX.tile = cvs(256, 256, (g, w, h) => { g.fillStyle = '#2c2c2c'; g.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = grey(R(80, 110)); g.fillRect(i * 32 + 1, j * 32 + 1, 30, 30); } blotch(g, w, h, 20, 10, 40, 0.5, 10, 50); });
    TEX.paper = cvs(256, 256, (g, w, h) => { g.fillStyle = '#cfccc4'; g.fillRect(0, 0, w, h); blotch(g, w, h, 10, 150, 190, 0.5, 10, 40); g.fillStyle = '#1b1a18';
      for (let x = 0; x <= w; x += 42) g.fillRect(x - 2, 0, 5, h); for (let y = 0; y <= h; y += 32) g.fillRect(0, y - 2, w, 4); g.fillStyle = 'rgba(40,30,20,.5)'; g.fillRect(150, 90, 20, 30); });
    TEX.ema = cvs(64, 64, (g, w, h) => { g.fillStyle = '#7b705f'; g.fillRect(0, 0, w, h); g.fillStyle = '#222'; for (let i = 0; i < 6; i++) g.fillRect(R(10, 50), R(14, 54), R(2, 4), R(4, 10)); });
    TEX.cloth = cvs(128, 128, (g, w, h) => { g.fillStyle = '#9a9894'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3a3a3a'; g.lineWidth = 3; for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(R(0, w), R(0, h), R(6, 18), 0, PI * 2); g.stroke(); } });
    TEX.facadeShop = cvs(256, 512, (g, w, h) => { // 4 m x 8 m; bottom 3 m shutter, 3.0-3.8 sign band, upper floor
      g.fillStyle = '#3b3937'; g.fillRect(0, 0, w, h); blotch(g, w, h, 30, 25, 70, 0.3, 20, 70);
      const sy = h - 192; for (let y = sy; y < h; y += 4) { const gr = g.createLinearGradient(0, y, 0, y + 4); gr.addColorStop(0, '#5e5e5e'); gr.addColorStop(1, '#222'); g.fillStyle = gr; g.fillRect(8, y, w - 16, 4); }
      g.fillStyle = '#121212'; g.fillRect(0, sy - 52, w, 52); g.fillStyle = '#bdbab2'; g.fillRect(20, sy - 46, w - 40, 40);
      g.fillStyle = '#111'; g.font = 'bold 30px ' + JGOTH; g.textAlign = 'center'; g.fillText(['閉店', '貸店舗', '休業中', '理容', '書店', '時計'][(rnd() * 6) | 0], w / 2, sy - 16);
      g.fillStyle = '#0c0d0e'; g.fillRect(36, 70, 90, 110); g.fillRect(146, 70, 76, 110); g.strokeStyle = '#4a4a4a'; g.lineWidth = 4; g.strokeRect(36, 70, 90, 110); g.strokeRect(146, 70, 76, 110);
      g.fillStyle = '#555'; g.fillRect(150, 196, 46, 30); rainStreaks(g, w, h, 30, 0.45); speckle(g, w, h, 1200, 20, 80, 0.3);
    });
    TEX.facadeHouse = cvs(256, 512, (g, w, h) => { // machiya-ish: lattice ground floor, tiled awning, upper sudare windows
      g.fillStyle = '#34322f'; g.fillRect(0, 0, w, h); blotch(g, w, h, 20, 25, 60, 0.3, 20, 60);
      const sy = h - 180; for (let x = 0; x < w; x += 10) { g.fillStyle = grey(R(32, 44)); g.fillRect(x, sy, 5, 180); }
      g.fillStyle = '#0a0a0a'; for (let x = 5; x < w; x += 10) g.fillRect(x, sy, 5, 180);
      for (let y = sy - 40; y < sy; y += 8) { g.fillStyle = grey(R(20, 34)); g.fillRect(0, y, w, 6); }
      g.fillStyle = '#121212'; g.fillRect(30, 90, 196, 110); g.fillStyle = '#4a463e'; for (let y = 94; y < 196; y += 5) g.fillRect(34, y, 188, 2);
      rainStreaks(g, w, h, 30, 0.4);
    });
    TEX.facadeConc = cvs(256, 512, (g, w, h) => { // apartment / office: concrete with window grid
      g.fillStyle = '#3e3e3e'; g.fillRect(0, 0, w, h); blotch(g, w, h, 30, 25, 70, 0.35, 20, 80);
      for (let y = 30; y < h - 40; y += 96) for (let x = 20; x < w; x += 128) { g.fillStyle = rnd() < 0.08 ? '#6d6b66' : '#0b0c0d'; g.fillRect(x, y, 90, 56); g.strokeStyle = '#555'; g.lineWidth = 3; g.strokeRect(x, y, 90, 56); g.fillStyle = '#2a2a2a'; g.fillRect(x - 6, y + 62, 102, 8); }
      rainStreaks(g, w, h, 60, 0.5); speckle(g, w, h, 2000, 20, 80, 0.3);
    });
    TEX.poster = cvs(128, 180, (g, w, h) => { g.fillStyle = '#d6d3cb'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.font = 'bold 26px ' + JGOTH; g.textAlign = 'center'; g.fillText('尋ね人', w / 2, 32);
      g.fillStyle = '#5a5a5a'; g.fillRect(30, 44, 68, 80); g.fillStyle = '#2a2a2a'; g.fillRect(44, 60, 40, 50); g.fillStyle = '#222'; for (let y = 134; y < 172; y += 8) g.fillRect(14, y, R(60, 100), 3);
      g.fillStyle = 'rgba(60,50,40,.35)'; g.fillRect(0, h - 40, w, 40); }, { clamp: true });
    TEX.roofPanel = cvs(256, 256, (g, w, h) => { // translucent arcade roof, torn
      g.fillStyle = 'rgba(190,190,186,0.85)'; g.fillRect(0, 0, w, h); blotch(g, w, h, 20, 60, 120, 0.5, 10, 50);
      g.fillStyle = 'rgba(40,40,40,1)'; g.fillRect(0, 0, w, 6); g.fillRect(0, 0, 6, h);
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 4; i++) { g.beginPath(); const cx = R(30, 226), cy = R(30, 226); for (let k = 0; k < 9; k++) { const a = k / 9 * PI * 2, r = R(10, 50); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.6); } g.fill(); }
      g.globalCompositeOperation = 'source-over';
    });
    TEX.glow = cvs(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { clamp: true });
    TEX.water = cvs(256, 256, (g, w, h) => { g.fillStyle = '#060708'; g.fillRect(0, 0, w, h); blotch(g, w, h, 20, 10, 30, 0.5, 20, 60); });
  }
  function textTex(lines, o) {
    o = o || {}; const w = o.w || 256, h = o.h || 512;
    return cvs(w, h, (g) => {
      g.fillStyle = o.bg || '#d9d6ce'; g.fillRect(0, 0, w, h); if (o.border) { g.strokeStyle = o.border; g.lineWidth = 10; g.strokeRect(6, 6, w - 12, h - 12); }
      g.fillStyle = o.fg || '#111'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = (o.weight || 'bold') + ' ' + (o.size || 110) + 'px ' + (o.font || JFONT);
      if (o.vertical) { const ch = [...lines]; const step = h / (ch.length + 0.6); ch.forEach((c, i) => { if (o.redIdx === i) g.fillStyle = '#b3121b'; else g.fillStyle = o.fg || '#111'; g.fillText(c, w / 2, step * (i + 0.8)); }); }
      else { const L = [].concat(lines); L.forEach((s, i) => g.fillText(s, w / 2, h * (i + 0.5) / L.length)); }
    }, { clamp: true });
  }

  /* ---------------- materials ---------------- */
  const MATS = {};   // key -> {mat, scale:[u,v], cast}
  function mat(key, params, scale, cast) { MATS[key] = { mat: new THREE.MeshStandardMaterial(params), scale: scale || [2, 2], cast: cast !== false }; return MATS[key].mat; }
  function makeMaterials() {
    mat('asphalt', { map: TEX.asphalt, roughness: 0.82, metalness: 0.05 }, [6, 6], false);
    mat('paving', { map: TEX.paving, roughness: 0.7, metalness: 0.05 }, [2.4, 2.4], false);
    mat('gravel', { map: TEX.gravel, roughness: 0.95 }, [3, 3], false);
    mat('plaster', { map: TEX.plaster, roughness: 0.9 }, [4, 4]);
    mat('back', { map: TEX.backwall, roughness: 0.9 }, [4, 8]);
    mat('concrete', { map: TEX.concrete, roughness: 0.9 }, [4, 4]);
    mat('stone', { map: TEX.stone, roughness: 0.92 }, [2.5, 2.5]);
    mat('shutter', { map: TEX.shutter, roughness: 0.6, metalness: 0.5 }, [3, 3]);
    mat('wood', { map: TEX.wood, roughness: 0.8 }, [2, 2]);
    mat('lattice', { map: TEX.lattice, roughness: 0.85 }, [2, 2]);
    mat('roof', { map: TEX.roof, roughness: 0.55, metalness: 0.2 }, [2, 2]);
    mat('tatami', { map: TEX.tatami, roughness: 0.95 }, [1.8, 1.8], false);
    mat('floor', { map: TEX.floor, roughness: 0.75 }, [2, 2], false);
    mat('tile', { map: TEX.tile, roughness: 0.4 }, [1.6, 1.6], false);
    mat('facadeShop', { map: TEX.facadeShop, roughness: 0.85 }, [4, 8]);
    mat('facadeHouse', { map: TEX.facadeHouse, roughness: 0.85 }, [4, 8]);
    mat('facadeConc', { map: TEX.facadeConc, roughness: 0.9 }, [4, 8]);
    mat('metal', { color: 0x2a2b2c, roughness: 0.45, metalness: 0.7 }, [1, 1]);
    mat('steel', { color: 0x55575a, roughness: 0.35, metalness: 0.8 }, [1, 1]);
    mat('black', { color: 0x040404, roughness: 1 }, [1, 1]);
    mat('glass', { color: 0x0a0b0c, roughness: 0.08, metalness: 0.6 }, [1, 1], false);
    mat('paper', { map: TEX.paper, emissive: 0x3a3833, emissiveMap: TEX.paper, roughness: 0.9 }, [1.7, 1.7], false);
    mat('ema', { map: TEX.ema, roughness: 0.8 }, [0.15, 0.15]);
    mat('cloth', { map: TEX.cloth, roughness: 0.95, side: THREE.DoubleSide }, [0.8, 0.8], false);
    mat('rope', { color: 0x8a8475, roughness: 1 }, [1, 1]);
    mat('redPaint', { color: 0x7a0a10, roughness: 0.6 }, [1, 1]);
    mat('white', { color: 0xbdbab3, roughness: 0.7 }, [1, 1]);
    mat('tree', { color: 0x0c0d0c, roughness: 1 }, [2, 2]);
    mat('poster', { map: TEX.poster, roughness: 0.9, side: THREE.DoubleSide }, [1, 1], false);
    MATS.poster.uvLocal = true;
    mat('machine', { color: 0x1a1b1c, roughness: 0.3, metalness: 0.4, emissive: 0x2c2c2c }, [1, 1]);
    mat('water', { map: TEX.water, color: 0x0b0d0f, roughness: 0.04, metalness: 0.9 }, [4, 4], false);
  }

  /* ---------------- batch builder (merged static geometry) ---------------- */
  const BATCH = {};
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const _e = new THREE.Euler(), _q = new THREE.Quaternion();
  function M4(cx, cy, cz, sx, sy, sz, rx, ry, rz) { _e.set(rx || 0, ry || 0, rz || 0, 'YXZ'); _q.setFromEuler(_e); return new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), _q.clone(), new THREE.Vector3(sx, sy, sz)); }
  function addGeo(key, geo, m4) { (BATCH[key] = BATCH[key] || []).push([geo, m4]); }
  function buildBatches(parent) {
    const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const key in BATCH) {
      const list = BATCH[key], cfg = MATS[key]; let nv = 0, ni = 0;
      for (const [g] of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
      let vo = 0, io = 0; const sc = cfg.scale;
      for (const [g, m4] of list) {
        nm.getNormalMatrix(m4); const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(m4); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
          const k = vo + i; pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z; nor[k * 3] = n.x; nor[k * 3 + 1] = n.y; nor[k * 3 + 2] = n.z;
          let a, b; const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
          if (cfg.uvLocal && U) { a = U.getX(i); b = U.getY(i); }
          else if (ay >= ax && ay >= az) { a = v.x / sc[0]; b = -v.z / sc[0]; }
          else if (ax >= az) { a = (n.x > 0 ? -v.z : v.z) / sc[0]; b = v.y / sc[1]; }
          else { a = (n.z > 0 ? v.x : -v.x) / sc[0]; b = v.y / sc[1]; }
          uv[k * 2] = a; uv[k * 2 + 1] = b;
        }
        if (g.index) for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo; else for (let i = 0; i < P.count; i++) idx[io + i] = vo + i;
        vo += P.count; io += g.index ? g.index.count : P.count;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, cfg.mat); mesh.name = 'batch_' + key; mesh.castShadow = cfg.cast; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      parent.add(mesh);
    }
  }

  /* ---------------- colliders, walk grid ---------------- */
  const colliders = [], solidRects = [], walkRects = [], blockers = [];
  function addCollider(x0, x1, y0, y1, h0, h1) {
    colliders.push(new THREE.Box3(new THREE.Vector3(x0, h0, -y1), new THREE.Vector3(x1, h1, -y0)));
    solidRects.push({ x0, x1, y0, y1, h0, h1 });
  }
  /** plan-space axis-aligned box. key null = collider only. o.collide false = visual only */
  function box(key, x0, x1, y0, y1, h0, h1, o) {
    if (key) addGeo(key, unitBox, M4((x0 + x1) / 2, (h0 + h1) / 2, -(y0 + y1) / 2, x1 - x0, h1 - h0, y1 - y0));
    if (!o || o.collide !== false) addCollider(x0, x1, y0, y1, h0, h1);
  }
  const walk = (x0, x1, y0, y1) => walkRects.push({ x0, x1, y0, y1 });

  const CELL = 0.25, GW = 560, GH = 456;  // 140 m x 114 m
  const grid = new Uint8Array(GW * GH);
  function heightAt(x, z) {
    const y = -z;
    if (x >= 20 && x <= 28 && y >= 80 && y < 88) return 6 * (y - 80) / 8;
    if (y >= 88 && y <= 112 && x <= 44) return 6;
    if (x >= 95 && y > 96 && y < 104) return -1.0;
    if (x > 84 && x < 90 && y > 20 && y < 70) return -2.0;
    return 0;
  }
  function buildGrid() {
    for (const r of walkRects) {
      const i0 = Math.max(0, Math.ceil(r.x0 / CELL - 0.5)), i1 = Math.min(GW - 1, Math.floor(r.x1 / CELL - 0.5));
      const j0 = Math.max(0, Math.ceil(r.y0 / CELL - 0.5)), j1 = Math.min(GH - 1, Math.floor(r.y1 / CELL - 0.5));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[j * GW + i] = 1;
    }
    const e = CELL * 0.5;
    for (const s of solidRects) {
      const i0 = Math.max(0, Math.floor((s.x0 - e) / CELL)), i1 = Math.min(GW - 1, Math.floor((s.x1 + e) / CELL));
      const j0 = Math.max(0, Math.floor((s.y0 - e) / CELL)), j1 = Math.min(GH - 1, Math.floor((s.y1 + e) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const cx = (i + 0.5) * CELL, cy = (j + 0.5) * CELL; if (cx < s.x0 - e || cx > s.x1 + e || cy < s.y0 - e || cy > s.y1 + e) continue;
        const hg = heightAt(cx, -cy); if (s.h1 > hg + 0.12 && s.h0 < hg + 1.75) grid[j * GW + i] = 0;
      }
    }
  }
  function cellOk(x, y) {
    const i = Math.floor(x / CELL), j = Math.floor(y / CELL); if (i < 0 || j < 0 || i >= GW || j >= GH || !grid[j * GW + i]) return false;
    for (const b of blockers) if (b.active && x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) return false;
    return true;
  }
  function walkable(x, z, r) {
    const y = -z; if (r == null) r = 0.3; const d = r * 0.7071;
    return cellOk(x, y) && cellOk(x + r, y) && cellOk(x - r, y) && cellOk(x, y + r) && cellOk(x, y - r) && cellOk(x + d, y + d) && cellOk(x - d, y + d) && cellOk(x + d, y - d) && cellOk(x - d, y - d);
  }

  /* ---------------- rooms & doors ---------------- */
  const rooms = [], doors = [];
  /** s: {id, x0,x1,y0,y1, h, base, wall, floor, ceil, doors:[{side:'W'|'E'|'S'|'N', a, b}], noWalk} */
  function room(s) {
    const t = 0.2, b = s.base || 0, H = s.h || 3.2, wall = s.wall || 'plaster', DH = 2.2;
    box(s.floor || 'floor', s.x0, s.x1, s.y0, s.y1, b - 0.06, b + 0.01, { collide: false });
    if (s.ceil !== false) box(s.ceil || 'wood', s.x0, s.x1, s.y0, s.y1, b + H, b + H + 0.12, { collide: false });
    if (!s.noWalk) walk(s.x0, s.x1, s.y0, s.y1);
    const R0 = { id: s.id, x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1, base: b, doors: [] }; rooms.push(R0);
    for (const side of ['W', 'E', 'S', 'N']) {
      const ds = (s.doors || []).filter(d => d.side === side).sort((p, q) => p.a - q.a);
      const vert = side === 'W' || side === 'E'; const lo = vert ? s.y0 : s.x0, hi = vert ? s.y1 : s.x1;
      const seg = (a0, a1, h0, h1, collide) => {
        if (a1 - a0 < 0.01) return; const k = (side === 'N' || side === 'S' || side === 'E' || side === 'W') ? (s.wallKeys && s.wallKeys[side]) || wall : wall;
        if (side === 'W') box(k, s.x0, s.x0 + t, a0, a1, h0, h1, { collide });
        if (side === 'E') box(k, s.x1 - t, s.x1, a0, a1, h0, h1, { collide });
        if (side === 'S') box(k, a0, a1, s.y0, s.y0 + t, h0, h1, { collide });
        if (side === 'N') box(k, a0, a1, s.y1 - t, s.y1, h0, h1, { collide });
      };
      let cur = lo;
      for (const d of ds) {
        seg(cur, d.a, b, b + H, true); seg(d.a, d.b, b + DH, b + H, false); cur = d.b;
        const mid = (d.a + d.b) / 2; const id = s.id + '-' + (d.name || side);
        const pos = side === 'W' ? V(s.x0, mid, b) : side === 'E' ? V(s.x1, mid, b) : side === 'S' ? V(mid, s.y0, b) : V(mid, s.y1, b);
        const normal = side === 'W' ? new THREE.Vector3(-1, 0, 0) : side === 'E' ? new THREE.Vector3(1, 0, 0) : side === 'S' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 0, -1);
        doors.push({ id, room: s.id, pos, normal, width: d.b - d.a }); R0.doors.push(id);
        if (d.frame !== false) { // dark door frame posts
          if (vert) { const x = side === 'W' ? s.x0 : s.x1 - t; box('wood', x - 0.03, x + t + 0.03, d.a - 0.08, d.a, b, b + DH + 0.1, { collide: false }); box('wood', x - 0.03, x + t + 0.03, d.b, d.b + 0.08, b, b + DH + 0.1, { collide: false }); }
          else { const y = side === 'S' ? s.y0 : s.y1 - t; box('wood', d.a - 0.08, d.a, y - 0.03, y + t + 0.03, b, b + DH + 0.1, { collide: false }); box('wood', d.b, d.b + 0.08, y - 0.03, y + t + 0.03, b, b + DH + 0.1, { collide: false }); }
        }
      }
      seg(cur, hi, b, b + H, true);
    }
    return R0;
  }

  /* ---------------- kit (GLB) placement ---------------- */
  const KIT = {}; let kitJSON = null; const root = new THREE.Group(); root.name = 'level';
  const KIT_FILES = ['facade_apartment', 'facade_machiya', 'shop_izakaya', 'shop_tobacco', 'shop_pharmacy', 'lantern_red', 'lantern_paper', 'sign_vertical_lit', 'sign_vertical_red', 'sign_vertical_snack',
    'utility_pole', 'vending_machine', 'vending_machine_red', 'phone_booth', 'bicycle', 'trash_pile', 'street_clutter', 'umbrella_dropped', 'torii', 'stone_lantern', 'puddle_decals', 'wire_set_20m'];
  function kitInfo(name) { return kitJSON && kitJSON.modules ? kitJSON.modules.find(m => m.name === name) : null; }
  const asArr = a => a == null ? [] : Array.isArray(a) ? a : [a];
  /** place a kit module; front faces dir: 'S' (rot 0), 'N' (180), 'E' (+90), 'W' (-90). (x,y) = street-front bottom centre in plan metres */
  const ROT = { S: 0, N: PI, E: PI / 2, W: -PI / 2 };
  function place(name, x, y, face, h, o) {
    o = o || {}; const g = KIT[name]; if (!g) return null;
    const obj = g.scene.clone(true); obj.position.copy(V(x, y, h || 0)); obj.rotation.y = typeof face === 'number' ? face : ROT[face || 'S'];
    if (o.scale) obj.scale.setScalar(o.scale);
    obj.traverse(m => { if (m.isMesh) { m.castShadow = !!o.cast; m.receiveShadow = true; } });
    root.add(obj); obj.updateMatrixWorld(true);
    if (o.collide) { const info = kitInfo(name); if (info) footprint(obj, info.footprint_m.width, info.footprint_m.depth, info.height_m, o.collide === 'front'); }
    return obj;
  }
  /** kit-local point -> world Vector3 */
  function kitPt(obj, p) { return obj.localToWorld(new THREE.Vector3(p[0], p[1], p[2])); }
  function footprint(obj, w, d, h, frontOnly) {
    const pts = [[-w / 2, 0], [w / 2, 0], [-w / 2, frontOnly ? -0.3 : -d], [w / 2, frontOnly ? -0.3 : -d]].map(p => kitPt(obj, [p[0], 0, p[1]]));
    const xs = pts.map(p => p.x), ys = pts.map(p => -p.z);
    addCollider(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), obj.position.y, obj.position.y + h);
  }

  /* ---------------- lamps (pooled lights) ---------------- */
  const lamps = []; const POOL = { point: 7, spot: 5 };
  let glowMatBase = null;
  /** o: {id, tag, x, y, h, type:'point'|'spot', color, intensity, distance, angle, pattern, head:'bulb'|'shade'|'none', emissive:[mats], glow, glowSize, fogGlow, shaft} */
  function lamp(o) {
    const col = o.color != null ? o.color : 0xdedad0; let light;
    if (o.type === 'spot') {
      light = new THREE.SpotLight(col, o.intensity || 3, o.distance || 14, o.angle || 0.7, o.penumbra != null ? o.penumbra : 0.45, 1.4);
      light.castShadow = true; light.shadow.mapSize.set(512, 512); light.shadow.bias = -0.0015; light.shadow.camera.near = 0.3; light.shadow.camera.far = o.distance || 14;
      const tgt = new THREE.Object3D(); tgt.position.copy(V(o.x + (o.tx || 0), o.y + (o.ty || 0), (o.th != null ? o.th : 0))); root.add(tgt); light.target = tgt;
    } else light = new THREE.PointLight(col, o.intensity || 1.2, o.distance || 7, 2);
    light.position.copy(V(o.x, o.y, o.h)); light.visible = false; root.add(light);
    const ems = (o.emissive || []).slice();
    if (o.head === 'bulb' || o.head === 'shade') {
      const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: col, emissiveIntensity: 1.6, roughness: 0.5 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(o.bulbR || 0.09, 10, 8), m); bulb.position.copy(light.position); root.add(bulb); ems.push(m);
      if (o.head === 'shade') { const sh = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.22, 12, 1, true), MATS.metal.mat); sh.position.copy(light.position).add(new THREE.Vector3(0, 0.1, 0)); root.add(sh); }
    }
    if (o.glow !== false) {
      const sm = new THREE.SpriteMaterial({ map: TEX.glow, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: !o.fogGlow ? true : false, opacity: 1 });
      const sp = new THREE.Sprite(sm); const s = o.glowSize || 1.1; sp.scale.set(s, s, s); sp.position.copy(light.position); sp.userData.hfxSkip = true; root.add(sp); ems.push(sm);
    }
    const e = { id: o.id, tag: o.tag || 'street', light, base: light.intensity, pos: light.position.clone(), flicker: null, level: 1, mats: ems, emBase: ems.map(m => m.emissiveIntensity !== undefined ? m.emissiveIntensity : m.opacity), pattern: o.pattern || 'buzz', shaft: o.shaft };
    e.setLevel = (k) => { e.level = Math.max(0, Math.min(1, k)); if (e.flicker) e.flicker.kill = e.level; else applyLevel(e); };
    lamps.push(e); return e;
  }
  function applyLevel(e) {
    e.light.intensity = e.base * e.level;
    e.mats.forEach((m, i) => { if (m.emissiveIntensity !== undefined) m.emissiveIntensity = e.emBase[i] * e.level; else m.opacity = e.level; });
  }

  /* =====================================================================================
   * THE TOWN
   * ===================================================================================== */
  const hide = [], drops = [], yokai = [], props = {}, L = {};
  function buildTown() {
    /* ---------- ground ---------- */
    const gq = (key, x0, x1, y0, y1, h) => box(key, x0, x1, y0, y1, (h || 0) - 0.3, h || 0, { collide: false });
    gq('asphalt', 0, 84, 0, 88); gq('asphalt', 44, 84, 88, 112); gq('asphalt', 84, 90, 0, 20); gq('asphalt', 84, 90, 70, 96); gq('asphalt', 90, 140, 0, 92);
    gq('asphalt', 84, 95, 92, 114); gq('gravel', 95, 140, 104, 114); gq('asphalt', 130, 140, 92, 96);
    box('paving', 54, 60, 12, 70, -0.29, 0.015, { collide: false });                     // arcade tiles
    box('paving', 20, 130, 70.6, 79.4, -0.29, 0.008, { collide: false });               // plaza paving band (asphalt shows at the kerbs)
    // crosswalk stripes (white paint) at the arcade's north mouth and the north road
    for (let i = 0; i < 6; i++) { box('white', 54.4 + i * 1, 55, 70.8, 73.6, 0, 0.02, { collide: false }); box('white', 98.3 + i * 0.7, 98.7 + i * 0.7, 70.8, 73.4, 0, 0.02, { collide: false }); }
    for (let x = 42; x < 104; x += 4) box('white', x, x + 2, 9.9, 10.05, 0, 0.02, { collide: false });   // south street centre line

    /* ---------- walkable outdoor areas (plan §3) ---------- */
    walk(57, 63, 0.6, 8);     // underpass
    walk(40, 104, 8, 12);     // south street
    walk(98, 102, 12, 70);    // north road (overpass collider blocks 30-38)
    walk(42, 45, 12, 74);     // west alley
    walk(54, 60, 12, 70);     // arcade
    walk(67, 70, 12, 74);     // yokocho
    walk(70, 80, 33, 36); walk(70, 80, 54, 57); // passages to the canal lane
    walk(80, 84, 33, 57);     // canal lane
    walk(20, 130, 70, 80);    // ekimae-dori
    walk(20, 28, 80, 88.2);   // shrine stairs
    walk(8, 40, 88, 108);     // precinct
    walk(96, 130, 92, 96);    // platform

    /* ---------- rail embankment, underpass (start) ---------- */
    box('concrete', 0, 57, -2, 8, 0, 4.2); box('concrete', 63, 140, -2, 8, 0, 4.2);
    box('concrete', 56.6, 63.4, -2, 8, 3.2, 4.4, { collide: false });                   // underpass ceiling
    box('black', 57, 63, -3, -1.5, 0, 3.2);                                             // the dark beyond the south end
    box('metal', 57, 63, 0.3, 0.4, 0, 2.2);                                              // chain fence (dead rail line behind)
    for (let x = 57.5; x < 63; x += 1.2) box('steel', x, x + 0.06, 0.3, 0.42, 0, 2.3, { collide: false });
    box('stone', 56.4, 63.6, 7.6, 8.2, 3.2, 4.6, { collide: false });                    // parapet over the mouth
    for (let x = 2; x < 138; x += 18) if (x < 55 || x > 66) { box('steel', x, x + 0.25, 3, 3.25, 4.2, 11, { collide: false }); box('steel', x - 1.6, x + 1.8, 3, 3.2, 10.2, 10.45, { collide: false }); } // dead catenary masts
    box('steel', 0, 140, 2.2, 2.35, 4.2, 4.35, { collide: false }); box('steel', 0, 140, 3.65, 3.8, 4.2, 4.35, { collide: false }); // rails on the embankment

    /* ---------- solid masses (walls of the streets) ---------- */
    mass(0, 42, 12, 70, 7.5, 'back', { E: 'back' });        // west block (the west alley's west wall)
    mass(0, 20, 70, 80, 8, 'facadeConc');
    mass(30, 40, 8, 12, 4.2, 'concrete');
    mass(104, 140, 8, 12, 6, 'facadeConc');
    mass(80, 90, 12, 20, 7, 'back'); mass(80, 84, 20, 33, 7, 'back'); mass(80, 84, 57, 70, 7, 'back');
    mass(90, 98, 12, 70, 7.5, 'facadeConc');
    mass(102, 140, 12, 70, 9, 'facadeConc');
    mass(40, 106, 80, 92, 5.6, 'back', { inset: { S: 0.4 } });
    mass(106, 108, 80, 92, 5, 'concrete'); mass(126, 140, 80, 92, 5, 'concrete'); mass(130, 140, 70, 80, 7, 'facadeConc');
    // the bars block east of the yokocho
    mass(70, 80, 12, 33, 6, 'back', { inset: { W: 0.4, S: 0.4 } }); mass(70, 80, 48, 54, 6, 'back', { inset: { W: 0.4 } }); mass(70, 80, 57, 70, 6, 'back', { inset: { W: 0.4, N: 0.4 } });
    // skyline beyond the playable town (silhouettes in fog)
    for (let i = 0; i < 46; i++) {
      const side = i % 4, w = R(6, 16), d = R(6, 14), h = R(9, 26); let x, y;
      if (side === 0) { x = R(-30, 170); y = R(-34, -10); } else if (side === 1) { x = R(142, 170); y = R(-10, 120); } else if (side === 2) { x = R(44, 170); y = R(116, 150); } else { x = R(-40, -6); y = R(-10, 120); }
      box('facadeConc', x, x + w, y, y + d, 0, h, { collide: false });
    }
    // shrine hill: cryptomeria behind the precinct
    for (let i = 0; i < 26; i++) { const a = i / 26; const x = i < 13 ? R(-2, 46) : R(-4, 6), y = i < 13 ? R(109, 116) : R(86, 110); tree(x, y, 6); }
    for (let i = 0; i < 8; i++) tree(R(86, 132), R(106, 113), 0);

    /* ---------- west shops (arcade west side) + east shops ---------- */
    const westShut = [[12, 19], [26, 33], [33, 40], [47, 58], [58, 70]];
    westShut.forEach(([y0, y1], i) => shutShop('W', y0, y1, 6.4 + (i % 3) * 0.8, i === 1 ? 'W3' : null));
    const eastShut = [[12, 22], [29, 36], [36, 44], [54, 62], [62, 70]];
    eastShut.forEach(([y0, y1], i) => shutShop('E', y0, y1, 6.8 + (i % 2) * 1.0, null));
    pharmacy(); kimono(); noodles(); pachinko();
    // back-alley clutter strip x 45..47 is part of the west shops' masses; AC units / laundry in the west alley
    for (let y = 14; y < 72; y += R(5, 8)) { if (Math.abs(y - 24) < 2 || Math.abs(y - 44) < 2) continue; box('metal', 44.4, 45, y, y + 0.9, 0.2, 0.8); }
    for (let y = 16; y < 70; y += 9) box('cloth', 42.2, 44.8, y, y + 0.02, 2.8, 3.6, { collide: false });
    for (let y = 16; y < 70; y += 9) box('rope', 42, 45, y - 0.01, y + 0.01, 3.6, 3.62, { collide: false });

    /* ---------- arcade roof (torn, translucent) ---------- */
    arcadeRoof();

    /* ---------- yokocho fronts (bars, kit facades) ---------- */
    place('shop_izakaya', 70, 20.5, 'W', 0, {}); place('facade_machiya', 70, 25.9, 'W', 0, {}); place('shop_tobacco', 70, 30.4, 'W', 0, {});
    place('facade_machiya', 70, 51, 'W', 0, {});
    place('shop_izakaya', 70, 60, 'W', 0, {}); place('facade_machiya', 70, 65.3, 'W', 0, {});
    place('facade_machiya', 74.8, 12, 'S', 0, {});
    izakaya();
    // passages and canal lane
    box('back', 70, 80, 36, 36.2, 0, 5.6, { collide: false }); // (izakaya south wall exterior is its room wall)
    canal();

    /* ---------- south street & plaza fronts ---------- */
    place('facade_apartment', 85, 12, 'S', 0, {}); place('facade_machiya', 93.8, 12, 'S', 0, {});
    const plazaN = [['facade_apartment', 46], ['facade_machiya', 54.2], ['shop_tobacco', 58.9], ['facade_machiya', 63.7], ['facade_apartment', 72], ['facade_machiya', 80.7], ['shop_pharmacy', 86.5], ['facade_apartment', 94.5], ['facade_machiya', 102.5]];
    plazaN.forEach(([n, x]) => place(n, x, 80, 'S', 0, {}));
    const plazaS = [['facade_apartment', 26], ['facade_machiya', 34.7], ['shop_tobacco', 39.6], ['facade_machiya', 75], ['facade_machiya', 93.8], ['facade_apartment', 108], ['facade_machiya', 116.7], ['facade_apartment', 125]];
    plazaS.forEach(([n, x]) => place(n, x, 70, 'N', 0, {}));
    // masses behind the plaza-south facades need an inset (they are the west block / bars / canal block / east block, built above with flush faces):
    // the kit facades stand proud of those faces by their own front-wall thickness, which reads fine at street distance.

    northRoad();
    shrine();
    station();
    streetProps();
    streetLamps();
  }

  /** solid block with collider; o.inset {W,E,S,N} sets the visual face back so kit facades can stand in front */
  function mass(x0, x1, y0, y1, h, key, o) {
    o = o || {}; const ins = o.inset || {};
    addCollider(x0, x1, y0, y1, 0, h);
    addGeo(key, unitBox, M4((x0 + (ins.W || 0) + x1 - (ins.E || 0)) / 2, h / 2, -(y0 + (ins.S || 0) + y1 - (ins.N || 0)) / 2, x1 - x0 - (ins.W || 0) - (ins.E || 0), h, y1 - y0 - (ins.S || 0) - (ins.N || 0)));
    box('roof', x0 - 0.2, x1 + 0.2, y0 - 0.2, y1 + 0.2, h, h + 0.25, { collide: false });
  }
  function tree(x, y, h) {
    const H = R(9, 15); addGeo('tree', new THREE.ConeGeometry(R(1.8, 2.6), H, 7), M4(x, h + 2 + H / 2, -y, 1, 1, 1));
    box('wood', x - 0.2, x + 0.2, y - 0.2, y + 0.2, h, h + 2.5, { collide: false });
  }
  function poster(x, y, h, face) { // face: direction the poster faces
    const g = new THREE.PlaneGeometry(0.42, 0.6); const ry = { S: 0, N: PI, E: PI / 2, W: -PI / 2 }[face];
    const off = { S: [0, -0.02], N: [0, 0.02], E: [0.02, 0], W: [-0.02, 0] }[face];
    addGeo('poster', g, M4(x + off[0], h, -(y + off[1]), 1, 1, 1, 0, ry, R(-0.08, 0.08)));
  }
  function signBoard(lines, o, pos, ry) {
    const t = textTex(lines, o); const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: o.lit ? 0xffffff : 0x000000, emissiveMap: o.lit ? t : null, emissiveIntensity: o.lit || 0 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.pw || 1, o.ph || 2), m); mesh.position.copy(pos); mesh.rotation.y = ry || 0; root.add(mesh); return mesh;
  }

  /* ---------- shops ---------- */
  function shutShop(side, y0, y1, h, tag) {
    if (side === 'W') { box('facadeShop', 53.5, 54, y0, y1, 0, h); box('back', 45, 53.5, y0, y1, 0, h - 0.2); box('roof', 45, 54.3, y0, y1, h, h + 0.2, { collide: false }); }
    else { box('facadeShop', 60, 60.5, y0, y1, 0, h); box('back', 60.5, 67, y0, y1, 0, h - 0.2); box('roof', 59.7, 67, y0, y1, h, h + 0.2, { collide: false }); }
    const fx = side === 'W' ? 54 : 60, face = side === 'W' ? 'E' : 'W', dir = side === 'W' ? 1 : -1;
    // shop sign projecting into the arcade
    if (rnd() < 0.8) { const nm = ['sign_vertical_snack', 'sign_vertical_lit', 'sign_vertical_red'][(rnd() * 3) | 0]; place(nm, fx, (y0 + y1) / 2 + R(-1.5, 1.5), face, R(4.2, 4.8), {}); }
    if (rnd() < 0.6) poster(fx + dir * 0.02, R(y0 + 1, y1 - 1), 1.5, face);
    if (tag === 'W3') { // the bulged shutter (trace beat): a separate mesh others can deform
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.8, 5.6, 1, 6, 8), MATS.shutter.mat); m.position.copy(V(54.06, (y0 + y1) / 2, 1.4)); m.castShadow = true; m.receiveShadow = true;
      m.name = 'shutterW3'; root.add(m); props.shutterW3 = m; L.shutterW3 = V(54.2, (y0 + y1) / 2, 1.4);
    }
  }
  function shopFront(side, y0, y1, doorA, doorB, sign) { // arcade-facing frame + sign band over an enterable shop
    const x = side === 'W' ? 54 : 60, dir = side === 'W' ? 1 : -1;
    const xa = side === 'W' ? 53.75 : 60, xb = side === 'W' ? 54 : 60.25;
    box('wood', xa, xb, y0, y1, 3.2, 4.0, { collide: false });             // sign band
    box('glass', xa + dir * 0.05, xb + dir * 0.05, y0 + 0.4, doorA - 0.2, 0.9, 2.6, { collide: false }); // shop window
    box('glass', xa + dir * 0.05, xb + dir * 0.05, doorB + 0.2, y1 - 0.4, 0.9, 2.6, { collide: false });
    if (sign) signBoard(sign.text, sign.o, V(x + dir * 0.03, (y0 + y1) / 2, 3.6), dir > 0 ? PI / 2 : -PI / 2);
  }
  function upper(x0, x1, y0, y1, h, key) { box(key || 'facadeHouse', x0, x1, y0, y1, 3.2, h); box('roof', x0 - 0.2, x1 + 0.2, y0, y1, h, h + 0.2, { collide: false }); }

  function pharmacy() { // W2: 19..26, arcade door 21.6-23.6, back door to the west alley; intel 1
    const r = room({ id: 'pharmacy', x0: 45, x1: 54, y0: 19, y1: 26, h: 3.2, wall: 'plaster', floor: 'tile', doors: [{ side: 'E', a: 21.6, b: 23.6, name: 'front' }, { side: 'W', a: 22.0, b: 23.4, name: 'back' }] });
    upper(45, 54, 19, 26, 7.2, 'facadeShop');
    shopFront('W', 19, 26, 21.6, 23.6, { text: '山田薬局', o: { vertical: false, w: 512, h: 128, size: 80, bg: '#d6d3cb', redIdx: -1 }, });
    props.pharmacySign = root.children[root.children.length - 1]; props.pharmacySign.scale.set(4.6, 0.32, 1);
    // back room partition at x 47.6 with a doorway; counter; medicine drawer cabinet
    box('plaster', 47.5, 47.7, 19.2, 21.4, 0, 3.2); box('plaster', 47.5, 47.7, 23.6, 25.8, 0, 3.2); box('plaster', 47.5, 47.7, 21.4, 23.6, 2.2, 3.2, { collide: false });
    box('wood', 48.6, 52.4, 21.0, 21.4, 0, 1.0); box('white', 48.55, 52.45, 20.95, 21.45, 1.0, 1.05, { collide: false }); // counter (hide behind it, south side)
    box('glass', 49.0, 52.0, 21.05, 21.35, 1.05, 1.5, { collide: false });
    box('wood', 49.0, 51.6, 19.2, 19.6, 0, 2.2); // medicine drawer cabinet on the south wall (dead drop)
    for (let j = 0; j < 6; j++) for (let k = 0; k < 4; k++) box('white', 49.1 + j * 0.42, 49.46 + j * 0.42, 19.6, 19.64, 0.3 + k * 0.45, 0.65 + k * 0.45, { collide: false });
    for (let y = 23.2; y < 25.8; y += 1.2) box('metal', 52.2, 53.6, y, y + 0.4, 0, 1.9); // display shelves
    box('metal', 48.6, 49.0, 24.2, 25.7, 0, 1.8);
    drops.push({ id: 1, pos: V(50.3, 19.66, 1.2), room: 'pharmacy', note: 'medicine drawer 3' });
    hide.push({ id: 'pharmacy-counter', pos: V(50.6, 20.3, 0), radius: 0.5, kind: 'counter', enter: V(48.2, 21.9, 0), yaw: 0.2, room: 'pharmacy' });
    hide.push({ id: 'pharmacy-backroom', pos: V(46.2, 25.0, 0), radius: 0.6, kind: 'backroom', enter: V(46.4, 23.6, 0), yaw: -PI / 2 + 0.6, room: 'pharmacy' });
    lamp({ id: 'pharmacy-tube', tag: 'interior', type: 'point', x: 51, y: 22.5, h: 3.0, color: 0xd8dde0, intensity: 0.7, distance: 6, pattern: 'dying', head: 'bulb' });
    L.pharmacyDoor = V(54, 22.6); L.pharmacyBack = V(45, 22.7);
  }
  function kimono() { // W5: 40..47
    room({ id: 'kimono', x0: 45, x1: 54, y0: 40, y1: 47, h: 3.2, wall: 'plaster', floor: 'tatami', doors: [{ side: 'E', a: 42.6, b: 44.6, name: 'front' }, { side: 'W', a: 42.8, b: 44.2, name: 'back' }] });
    upper(45, 54, 40, 47, 7.0, 'facadeHouse');
    shopFront('W', 40, 47, 42.6, 44.6, null);
    signBoard('呉服', { vertical: true, w: 128, h: 256, size: 90, bg: '#151515', fg: '#cfccc4' }, V(54.05, 40.8, 2.0), PI / 2).scale.set(0.5, 0.75, 1);
    box('plaster', 47.4, 47.6, 40.2, 42.8, 0, 3.2); box('plaster', 47.4, 47.6, 44.2, 46.8, 0, 3.2); box('plaster', 47.4, 47.6, 42.8, 44.2, 2.2, 3.2, { collide: false });
    // oshiire (closet) on the north wall, fusuma front
    box('paper', 48.0, 50.6, 45.6, 45.7, 0, 2.0); box('wood', 48.0, 50.6, 45.7, 46.8, 0, 2.0); box('wood', 48.0, 50.6, 45.6, 46.8, 2.0, 2.15);
    // kimono stands (cloth panels on T frames)
    for (let i = 0; i < 4; i++) { const y = 40.8 + i * 1.1, x = 51.8; box('cloth', x - 0.55, x + 0.55, y, y + 0.03, 0.4, 1.8); box('wood', x - 0.65, x + 0.65, y - 0.02, y + 0.05, 1.8, 1.86, { collide: false }); }
    box('wood', 48.2, 49.8, 41.0, 41.8, 0, 0.8); // low display platform
    hide.push({ id: 'kimono-oshiire', pos: V(49.3, 46.2, 0), radius: 0.6, kind: 'closet', enter: V(49.3, 44.9, 0), yaw: PI, room: 'kimono' });
    L.kimonoDoor = V(54, 43.6); L.kimonoBack = V(45, 43.5);
  }
  function noodles() { // E2: 22..29, arcade door 24.6-26.6, back door to the yokocho
    room({ id: 'noodles', x0: 60, x1: 67, y0: 22, y1: 29, h: 3.2, wall: 'plaster', floor: 'tile', doors: [{ side: 'W', a: 24.6, b: 26.6, name: 'front' }, { side: 'E', a: 24.8, b: 26.4, name: 'back' }] });
    upper(60, 67, 22, 29, 6.8, 'facadeShop');
    shopFront('E', 22, 29, 24.6, 26.6, null);
    // noren over the door (white cloth, one red mark)
    box('cloth', 60.0, 60.05, 24.6, 26.6, 1.5, 2.2, { collide: false });
    signBoard('らーめん', { vertical: false, w: 512, h: 128, size: 84, bg: '#141414', fg: '#d0cdc5' }, V(59.95, 25.5, 3.6), -PI / 2).scale.set(3.2, 0.7, 1);
    // counter (L) and stools; kitchen behind (east)
    box('wood', 63.6, 64.2, 22.4, 24.2, 0, 1.05); box('wood', 63.6, 64.2, 26.8, 28.6, 0, 1.05); box('white', 63.55, 64.25, 22.35, 24.25, 1.05, 1.1, { collide: false }); box('white', 63.55, 64.25, 26.75, 28.65, 1.05, 1.1, { collide: false });
    for (const y of [22.9, 23.8, 27.3, 28.2]) addGeo('metal', new THREE.CylinderGeometry(0.18, 0.18, 0.7, 10), M4(62.9, 0.35, -y, 1, 1, 1));
    box('steel', 65.6, 66.8, 22.3, 24.2, 0, 0.95); box('steel', 65.6, 66.8, 26.9, 28.7, 0, 0.95); // kitchen units
    addGeo('steel', new THREE.CylinderGeometry(0.3, 0.3, 0.45, 12), M4(66.2, 1.18, -23.2, 1, 1, 1));
    hide.push({ id: 'noodle-kitchen', pos: V(65.0, 23.4, 0), radius: 0.55, kind: 'kitchen', enter: V(65.0, 25.5, 0), yaw: PI / 2, room: 'noodles' });
    L.noodleDoor = V(60, 25.6); L.noodleBack = V(67, 25.6); L.noodleWindow = V(60, 27.6, 1.6);
  }
  function pachinko() { // E5: 44..54, arcade door 48-50, back door 50-52 to the yokocho
    room({ id: 'pachinko', x0: 60, x1: 67, y0: 44, y1: 54, h: 3.4, wall: 'plaster', floor: 'floor', doors: [{ side: 'W', a: 48, b: 50, name: 'front' }, { side: 'E', a: 50, b: 52, name: 'back' }] });
    upper(60, 67, 44, 54, 8.0, 'facadeConc');
    shopFront('E', 44, 54, 48, 50, null);
    signBoard('パチンコ', { vertical: true, w: 128, h: 512, size: 100, bg: '#e2dfd8', fg: '#111', redIdx: 0, font: JGOTH }, V(59.6, 53.2, 5.4), -PI / 2).scale.set(0.9, 3.4, 1);
    // rows of machines (break sightlines): south row and north row, the shortcut aisle between them
    for (const yr of [46.2, 52.6]) { box('machine', 61.2, 66.2, yr, yr + 0.8, 0, 1.9); box('metal', 61.2, 66.2, yr, yr + 0.8, 1.9, 2.05, { collide: false }); }
    for (let x = 61.5; x < 66; x += 0.7) { box('glass', x, x + 0.55, 46.15, 46.18, 0.9, 1.7, { collide: false }); box('glass', x, x + 0.55, 47.02, 47.05, 0.9, 1.7, { collide: false }); }
    hide.push({ id: 'pachinko-row', pos: V(63.6, 45.1, 0), radius: 0.55, kind: 'row', enter: V(60.9, 45.3, 0), yaw: -PI / 2, room: 'pachinko' });
    for (let i = 0; i < 3; i++) lamp({ id: 'pachinko-machine-' + i, tag: 'interior', type: 'point', x: 62 + i * 1.8, y: 47.3, h: 1.4, color: 0xcfd4d8, intensity: 0.35, distance: 3.5, pattern: 'buzz', head: 'none', glowSize: 0.5 });
    L.pachinkoDoor = V(60, 49); L.pachinkoBack = V(67, 51);
  }
  function izakaya() { // Tsuki: 70..80 x 36..48. front shoji to the yokocho (41-43), back door to the canal lane (39-41); intel 2
    room({ id: 'izakaya', x0: 70, x1: 80, y0: 36, y1: 48, h: 3.0, wall: 'plaster', floor: 'floor', wallKeys: { W: 'wood' },
      doors: [{ side: 'W', a: 41, b: 43, name: 'front' }, { side: 'E', a: 39, b: 41, name: 'back' }] });
    upper(70, 80, 36, 48, 6.6, 'facadeHouse');
    box('roof', 69.2, 70.4, 36, 48, 3.0, 3.25, { collide: false });         // eave over the front
    // lit shoji panels across the front (the shadow beat plays on these)
    box('paper', 69.94, 70.0, 37.0, 40.8, 0.4, 2.6, { collide: false }); box('paper', 69.94, 70.0, 43.2, 47.4, 0.4, 2.6, { collide: false });
    L.izakayaShoji = V(69.95, 45.3, 1.5);
    // noren + red lantern + sign
    box('cloth', 69.85, 69.9, 41.0, 43.0, 1.5, 2.2, { collide: false });
    signBoard('居酒屋 月', { vertical: true, w: 128, h: 512, size: 92, bg: '#d8d5cd', fg: '#111', redIdx: 4 }, V(69.6, 36.6, 3.4), -PI / 2).scale.set(0.55, 2.2, 1);
    redLantern('izakaya-lantern', 69.5, 40.4, 'W', 2.3, 0.9);
    lamp({ id: 'izakaya-bulb', tag: 'yokocho', type: 'spot', x: 69.6, y: 42, h: 2.9, color: 0xe6e2d8, intensity: 5, distance: 8, angle: 0.8, pattern: 'buzz', head: 'bulb', shaft: true });
    // counter (N-S) with seats on the west, kitchen corridor behind (east) to the back door
    box('wood', 74.0, 74.6, 41.6, 44.6, 0, 1.05); box('wood', 73.8, 74.8, 41.5, 44.7, 1.05, 1.12, { collide: false }); box('wood', 74.0, 74.6, 36.2, 38.4, 0, 1.05); box('wood', 73.8, 74.8, 36.2, 38.5, 1.05, 1.12, { collide: false });
    for (let y = 42.1; y < 44.5; y += 1.0) addGeo('wood', new THREE.CylinderGeometry(0.2, 0.2, 0.7, 10), M4(73.2, 0.35, -y, 1, 1, 1));
    box('wood', 79.4, 79.8, 41.4, 44.3, 0, 2.2); // bottle shelves on the east wall
    for (let i = 0; i < 18; i++) addGeo('glass', new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), M4(79.55, 1.3 + (i % 3) * 0.45, -(41.6 + (i / 3 | 0) * 0.45), 1, 1, 1));
    box('wood', 75.6, 76.4, 43.4, 44.3, 0, 0.95);  // back counter with the tab ledger (intel 2)
    // storeroom (NE corner) with a doorway on its south wall
    box('plaster', 76.6, 76.8, 44.5, 48, 0, 3.0); box('plaster', 76.6, 77.3, 44.4, 44.6, 0, 3.0); box('plaster', 78.5, 80, 44.4, 44.6, 0, 3.0); box('plaster', 77.3, 78.5, 44.4, 44.6, 2.2, 3.0, { collide: false });
    for (let i = 0; i < 4; i++) box('wood', 78.8, 79.7, 45 + i * 0.75, 45.6 + i * 0.75, 0, R(0.6, 1.4));  // crates
    // tatami seating platform (NW)
    box('tatami', 70.2, 73.4, 45.2, 47.8, 0, 0.4); box('wood', 71.2, 72.4, 46.0, 47.0, 0.4, 0.75, { collide: false });
    drops.push({ id: 2, pos: V(76.0, 43.85, 1.0), room: 'izakaya', note: 'tab ledger behind the counter' });
    hide.push({ id: 'izakaya-counter', pos: V(75.0, 42.6, 0), radius: 0.55, kind: 'counter', enter: V(75.9, 40.6, 0), yaw: PI / 2, room: 'izakaya' });
    hide.push({ id: 'izakaya-storeroom', pos: V(78.0, 46.4, 0), radius: 0.6, kind: 'storeroom', enter: V(77.9, 43.8, 0), yaw: PI, room: 'izakaya' });
    lamp({ id: 'izakaya-paper', tag: 'interior', type: 'point', x: 72.5, y: 42, h: 2.5, color: 0xe8e2d6, intensity: 0.6, distance: 6, pattern: 'candle', head: 'bulb', bulbR: 0.18 });
    L.izakayaFront = V(70, 42); L.izakayaBack = V(80, 40);
  }
  function redLantern(id, x, y, face, h, k) { // kit red lantern + its light at the lantern's centre
    const lt = place('lantern_red', x, y, face, h, {}); const c = V(x, y, h - 0.35);
    if (lt) { const bb = new THREE.Box3().setFromObject(lt); if (!bb.isEmpty()) bb.getCenter(c); }
    const mats = lanternMats(lt); mats.forEach(m => { m.emissiveIntensity = (m.emissiveIntensity || 1) * 0.55; });
    return lamp({ id, tag: 'yokocho', type: 'point', x: c.x, y: -c.z, h: c.y, color: 0xff3424, intensity: 0.55 * (k || 1), distance: 5, pattern: 'candle', head: 'none', glowSize: 0.75, emissive: mats });
  }
  function lanternMats(obj) { // clone a lantern's emissive materials so it can flicker on its own
    const out = []; if (!obj) return out;
    obj.traverse(m => { if (m.isMesh && m.material && m.material.emissive && m.material.emissive.getHex() !== 0) { m.material = m.material.clone(); out.push(m.material); } });
    return out;
  }
  function arcadeRoof() {
    const roofMat = new THREE.MeshStandardMaterial({ map: TEX.roofPanel, transparent: true, opacity: 0.55, alphaTest: 0.08, side: THREE.DoubleSide, depthWrite: false, roughness: 0.4, metalness: 0.1 });
    const g = new THREE.PlaneGeometry(3.3, 58, 1, 1); // two slopes of the gabled roof
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1, uv.getY(i) * 14);
    TEX.roofPanel.wrapS = TEX.roofPanel.wrapT = THREE.RepeatWrapping;
    const grp = new THREE.Group();
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(g, roofMat); m.rotation.order = 'YXZ'; m.rotation.x = -PI / 2; m.rotation.y = 0;
      m.rotation.z = 0; m.position.set(57 + s * 1.5, 6.9, -41); m.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), s * 0.38);
      m.renderOrder = 3; m.userData.hfxSkip = true; grp.add(m);
    }
    root.add(grp); props.arcadeRoof = grp;
    for (let y = 12; y <= 70; y += 3.6) { // steel ribs
      addGeo('metal', unitBox, M4(55.5, 6.92, -y, 3.3, 0.12, 0.12, 0, 0, 0.38)); addGeo('metal', unitBox, M4(58.5, 6.92, -y, 3.3, 0.12, 0.12, 0, 0, -0.38));
      box('metal', 54.0, 54.2, y - 0.08, y + 0.08, 4.0, 6.3, { collide: false }); box('metal', 59.8, 60.0, y - 0.08, y + 0.08, 4.0, 6.3, { collide: false });
    }
    box('metal', 56.9, 57.1, 12, 70, 7.45, 7.6, { collide: false });
    // arcade name gates at both mouths
    for (const y of [12.2, 69.8]) { box('metal', 54, 60, y - 0.15, y + 0.15, 5.0, 5.9, { collide: false }); }
    signBoard('かげまち商店街', { w: 1024, h: 128, size: 92, bg: '#1a1a1a', fg: '#d4d1c9', font: JGOTH }, V(57, 12.0, 5.45), 0).scale.set(5.6, 0.75, 1);
    signBoard('かげまち商店街', { w: 1024, h: 128, size: 92, bg: '#1a1a1a', fg: '#d4d1c9', font: JGOTH }, V(57, 70.0, 5.45), PI).scale.set(5.6, 0.75, 1);
  }
  function canal() {
    box('water', 84, 90, 20, 70, -2.4, -2.0, { collide: false });
    box('concrete', 83.8, 84.0, 20, 70, -2.6, 0, { collide: false }); box('concrete', 89.8, 90.0, 20, 70, -2.6, 0, { collide: false });
    box('concrete', 84, 90, 19.6, 20, -2.6, 0, { collide: false }); box('black', 84, 90, 69.8, 70.4, -2.6, -0.2, { collide: false }); // culvert mouth
    box('steel', 83.85, 84.0, 20, 70, 0.95, 1.02); for (let y = 20; y <= 70; y += 2) box('steel', 83.88, 83.96, y, y + 0.06, 0, 1.0, { collide: false });
    addCollider(83.85, 84.05, 20, 70, 0, 1.0); // railing keeps the player out of the water
    box('steel', 84, 90, 69.9, 70.0, 0.95, 1.02); addCollider(84, 90, 69.9, 70.05, 0, 1.0); for (let x = 84; x <= 90; x += 1.5) box('steel', x, x + 0.06, 69.9, 70, 0, 1, { collide: false });
    // lane's west side: back walls of the bars with pipes
    box('back', 80, 80.2, 36.2, 47.8, 0, 6.6, { collide: false });
    for (const y of [37.2, 45.5, 51.5]) box('metal', 80.2, 80.7, y, y + 0.7, 0.2, 0.7);
    L.canalSouth = V(82, 34.5); L.canalNorth = V(82, 55.5);
  }
  function northRoad() { // overpass collapsed onto the road at y 30-38
    addGeo('concrete', unitBox, M4(100, 3.0, -34, 12.5, 0.9, 10.5, 0.62, 0, 0.05));     // tilted deck slab
    addGeo('concrete', unitBox, M4(100, 6.2, -42.5, 13, 0.9, 7, 0, 0, 0));             // the part still standing
    box('concrete', 94.5, 96, 40, 42, 0, 5.8); box('concrete', 104, 105.5, 40, 42, 0, 5.8); // piers (north)
    box('concrete', 94.5, 96, 26.5, 28, 0, 2.2, { collide: false }); box('concrete', 104, 105.5, 26.5, 28, 0, 2.6, { collide: false }); // broken piers
    addCollider(94, 106, 29.5, 38.5, 0, 6.5);
    for (let i = 0; i < 9; i++) { const x = R(97.5, 102.5), y = R(28, 30.5), s = R(0.4, 1.2); addGeo('concrete', unitBox, M4(x, s / 2, -y, s, s * 0.8, s * 1.1, R(0, 1), R(0, 3), R(0, 1))); }
    addCollider(97.2, 102.8, 28, 30.5, 0, 1.2);
    for (let i = 0; i < 6; i++) addGeo('steel', unitBox, M4(R(96, 104), R(2, 5), -R(30, 38), 0.04, 0.04, R(2, 4), R(-1, 1), R(0, 3), R(-1, 1))); // rebar
    box('steel', 94.5, 105.5, 38.5, 38.7, 6.6, 7.4, { collide: false }); // guard rail on the standing part
    // barricade with a red blinker (the blocked way)
    box('white', 98.2, 101.8, 26.6, 26.8, 0.5, 0.8); box('redPaint', 98.2, 101.8, 26.62, 26.82, 0.2, 0.45, { collide: false });
    box('metal', 98.3, 98.45, 26.6, 26.8, 0, 0.8, { collide: false }); box('metal', 101.55, 101.7, 26.6, 26.8, 0, 0.8, { collide: false });
    lamp({ id: 'barricade-blinker', tag: 'barricade', type: 'point', x: 100, y: 26.5, h: 1.0, color: 0xff1a12, intensity: 1.2, distance: 6, pattern: 'dying', head: 'bulb', glowSize: 0.9 });
    signBoard('通行止', { w: 256, h: 96, size: 64, bg: '#d8d5cd', fg: '#111', border: '#7a0a10' }, V(100, 26.45, 1.25), 0).scale.set(1.3, 0.5, 1);
    L.northRoad = V(100, 20); L.overpass = V(100, 34);
  }
  function shrine() {
    // hill and embankments (stone retaining walls)
    box('stone', -4, 44, 88, 116, 0, 5.95); box('gravel', -4, 44, 88, 116, 5.95, 6.0, { collide: false });
    box('stone', -4, 20, 80, 88, 0, 6); box('stone', 28, 44, 80, 88, 0, 6);
    // 40 steps, 0.2 deep x 0.15 high, x 20..28
    for (let i = 0; i < 40; i++) box('stone', 20, 28, 80 + i * 0.2, 80 + (i + 1) * 0.2, 0, (i + 1) * 0.15, { collide: false });
    box('stone', 19.6, 20, 80, 88, 0, 6.6); box('stone', 28, 28.4, 80, 88, 0, 6.6);   // side walls of the stair
    place('torii', 24, 79.6, 'S', 0, {}); place('torii', 24, 88.8, 'S', 6, {});
    addCollider(21.2, 21.6, 79.4, 79.8, 0, 4); addCollider(26.4, 26.8, 79.4, 79.8, 0, 4); addCollider(21.2, 21.6, 88.6, 89.0, 6, 10); addCollider(26.4, 26.8, 88.6, 89.0, 6, 10);
    // precinct fence (tamagaki)
    const B = 6;
    box('wood', 8, 20, 87.9, 88.1, B, B + 0.9); box('wood', 28, 40, 87.9, 88.1, B, B + 0.9); box('wood', 7.8, 8, 88, 108, B, B + 0.9); box('wood', 40, 40.2, 88, 108, B, B + 0.9); box('wood', 8, 40, 107.9, 108.1, B, B + 0.9);
    // haiden (worship hall) x 18..30, y 100..106: raised floor on pillars, black void underneath (backstage door)
    box('black', 18.6, 29.4, 100.6, 105.6, B, B + 0.95);
    for (let x = 18.2; x <= 29.8; x += 1.9) for (const y of [100.2, 105.8]) box('wood', x - 0.12, x + 0.12, y - 0.12, y + 0.12, B, B + 4.6);
    addCollider(18, 30, 100, 106, B, B + 4.6);
    box('wood', 18, 30, 100, 106, B + 0.95, B + 1.15, { collide: false });
    box('lattice', 18.4, 29.6, 100.25, 100.4, B + 1.15, B + 3.9, { collide: false }); box('wood', 18.2, 18.4, 100.2, 105.8, B + 1.15, B + 3.9, { collide: false }); box('wood', 29.6, 29.8, 100.2, 105.8, B + 1.15, B + 3.9, { collide: false }); box('wood', 18.2, 29.8, 105.6, 105.8, B + 1.15, B + 3.9, { collide: false });
    for (let i = 0; i < 5; i++) box('wood', 22 + i * 0.0, 26, 99.2 + i * 0.18, 99.4 + i * 0.18, B, B + 0.2 + i * 0.2, { collide: false }); // front steps
    addGeo('roof', unitBox, M4(24, B + 5.3, -101.6, 15, 0.35, 5.0, -0.5, 0, 0)); addGeo('roof', unitBox, M4(24, B + 5.3, -104.4, 15, 0.35, 5.0, 0.5, 0, 0));
    box('roof', 16.5, 31.5, 102.85, 103.15, B + 6.2, B + 6.6, { collide: false });
    addGeo('rope', new THREE.CylinderGeometry(0.16, 0.16, 11, 8), M4(24, B + 3.95, -100.05, 1, 1, 1, 0, 0, PI / 2)); // shimenawa
    for (let i = 0; i < 4; i++) box('white', 20 + i * 2.6, 20.25 + i * 2.6, 99.95, 100.0, B + 3.3, B + 3.8, { collide: false }); // shide
    box('wood', 23.2, 24.8, 99.3, 99.9, B, B + 0.75); // offering box
    // the bell (suzu) and its rope
    const bell = new THREE.Group(); const bm = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), MATS.steel.mat); bm.position.set(0, 0, 0); bell.add(bm);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), MATS.rope.mat); rope.position.set(0, -1.5, 0); bell.add(rope);
    const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), MATS.redPaint.mat); tassel.position.set(0, -2.9, 0); bell.add(tassel);
    bell.position.copy(V(24, 99.85, B + 3.7)); root.add(bell); props.bellMesh = bell; bm.castShadow = rope.castShadow = true;
    L.bell = V(24, 99.85, B + 1.25); L.haiden = V(24, 103, B); L.shrineUnderfloor = V(24, 100.4, B + 0.4);
    // ema wall at (36, 97.6), facing west toward the approach
    box('wood', 36.4, 36.6, 95.4, 99.8, B, B + 2.2); box('roof', 36.0, 37.0, 95.2, 100.0, B + 2.2, B + 2.35, { collide: false });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) addGeo('ema', unitBox, M4(36.36, B + 0.9 + r * 0.34, -(95.7 + c * 0.47 + (r % 2) * 0.12), 0.03, 0.22, 0.32, R(-0.1, 0.1), 0, R(-0.06, 0.06)));
    box('rope', 36.32, 36.36, 95.4, 99.8, B + 1.98, B + 2.0, { collide: false });
    drops.push({ id: 3, pos: V(36.25, 97.6, B + 1.4), room: null, note: 'ema wall' });
    L.ema = V(35.6, 97.6, B);
    // chozuya basin at (33, 92)
    box('stone', 32.2, 33.8, 91.6, 92.4, B, B + 0.7); const wm = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.6), MATS.water.mat); wm.rotation.x = -PI / 2; wm.position.copy(V(33, 92, B + 0.68)); root.add(wm); props.basinWater = wm;
    for (const [x, y] of [[31.9, 91.3], [34.1, 91.3], [31.9, 92.7], [34.1, 92.7]]) box('wood', x - 0.08, x + 0.08, y - 0.08, y + 0.08, B, B + 2.4, { collide: false });
    box('roof', 31.5, 34.5, 90.9, 93.1, B + 2.4, B + 2.6, { collide: false });
    L.basin = V(33, 91.2, B);
    // kura (storehouse) 10..16 x 92..98, doors N (13-15) and E (94-96)
    room({ id: 'kura', x0: 10, x1: 16, y0: 92, y1: 98, h: 3.6, base: B, wall: 'white', floor: 'floor', ceil: 'wood', doors: [{ side: 'N', a: 13, b: 15, name: 'north' }, { side: 'E', a: 94, b: 96, name: 'east' }] });
    box('black', 9.9, 16.1, 91.9, 98.1, B, B + 0.9, { collide: false });   // namako base band
    addGeo('roof', unitBox, M4(13, B + 4.3, -93.6, 7.2, 0.3, 3.6, -0.45, 0, 0)); addGeo('roof', unitBox, M4(13, B + 4.3, -96.4, 7.2, 0.3, 3.6, 0.45, 0, 0));
    for (let i = 0; i < 5; i++) box('wood', 10.4 + i * 1.0, 11.2 + i * 1.0, 92.3, 93.1, B, B + R(0.5, 1.3)); // chests
    hide.push({ id: 'shrine-kura', pos: V(11.0, 96.6, B), radius: 0.6, kind: 'kura', enter: V(14, 98.8, B), yaw: -PI / 2 - 0.4, room: 'kura' });
    L.kura = V(14, 99, B);
    // stone lanterns along the approach (Y4: they light one by one)
    const sl = [[21.6, 90.6], [26.4, 90.6], [21.6, 94], [26.4, 94], [21.6, 97.4], [26.4, 97.4]];
    sl.forEach(([x, y], i) => { place('stone_lantern', x, y, 'S', B, {}); addCollider(x - 0.36, x + 0.36, y - 0.36, y + 0.36, B, B + 1.7);
      lamp({ id: 'shrine-lantern-' + (i + 1), tag: 'shrine', type: 'point', x, y, h: B + 1.25, color: 0xfff1e0, intensity: 0.55, distance: 5, pattern: 'candle', head: 'none', glowSize: 0.45 }); });
    for (const x of [21.2, 26.8]) { const pl = place('lantern_paper', x, 99.8, 'S', B + 3.0, {}); lamp({ id: 'haiden-lantern-' + (x < 24 ? 'w' : 'e'), tag: 'shrine', type: 'point', x, y: 99.8, h: B + 3.4, color: 0xeee8dc, intensity: 0.9, distance: 7, pattern: 'candle', head: 'none', glowSize: 0.9, emissive: lanternMats(pl) }); }
    L.shrineStairsBottom = V(24, 79); L.shrineStairsTop = V(24, 89, B); L.torii = V(24, 88.8, B);
  }
  function station() {
    // station building 108..126 x 80..92: gate shutter in the south wall (112-116), wide opening to the platform (110-118)
    room({ id: 'station', x0: 108, x1: 126, y0: 80, y1: 92, h: 4.2, wall: 'concrete', floor: 'tile', ceil: 'concrete', wallKeys: { S: 'facadeConc' },
      doors: [{ side: 'S', a: 112, b: 116, name: 'gate', frame: false }, { side: 'N', a: 110, b: 118, name: 'platform', frame: false }] });
    box('facadeConc', 107.8, 126.2, 79.8, 92.2, 4.2, 6.2, { collide: false }); box('roof', 107.5, 126.5, 79.5, 92.5, 6.2, 6.45, { collide: false });
    box('metal', 109, 119, 78.6, 80, 3.3, 3.45, { collide: false });                    // canopy over the gate
    signBoard('影町駅', { w: 512, h: 160, size: 110, bg: '#d9d6ce', fg: '#111', lit: 0.55 }, V(117, 79.75, 4.9), 0).scale.set(4.2, 1.3, 1);
    lamp({ id: 'station-gate', tag: 'station', type: 'spot', x: 114, y: 79.0, h: 3.25, color: 0xe2e2dc, intensity: 6, distance: 9, angle: 0.75, pattern: 'buzz', head: 'shade', shaft: true });
    signBoard('KAGEMACHI STA.', { w: 512, h: 64, size: 40, bg: '#d9d6ce', fg: '#111', font: JGOTH }, V(117, 79.74, 4.05), 0).scale.set(4.2, 0.5, 1);
    // ticket barriers at y 86 with gaps
    for (const [a, b] of [[108.2, 109.4], [110.8, 112.0], [113.4, 114.6], [116.0, 117.0]]) box('steel', a, b, 85.8, 86.3, 0, 1.0);
    // station office 118..126 x 84..90, doors W (86-87.4) and N (122-123.4)
    box('plaster', 118, 118.2, 84, 86, 0, 4.2); box('plaster', 118, 118.2, 87.4, 90, 0, 4.2); box('plaster', 118, 118.2, 86, 87.4, 2.2, 4.2, { collide: false });
    box('plaster', 118, 126, 83.8, 84, 0, 4.2); box('plaster', 118, 122, 89.9, 90.1, 0, 4.2); box('plaster', 123.4, 126, 89.9, 90.1, 0, 4.2); box('plaster', 122, 123.4, 89.9, 90.1, 2.2, 4.2, { collide: false });
    box('glass', 117.98, 118.02, 88, 89.6, 1.0, 2.0, { collide: false });
    box('wood', 119.4, 121.0, 88.6, 89.4, 0, 0.8); box('metal', 124.6, 125.8, 84.2, 86.4, 0, 1.9);   // desk, lockers
    doors.push({ id: 'office-west', room: 'office', pos: V(118, 86.7), normal: new THREE.Vector3(-1, 0, 0), width: 1.4 }, { id: 'office-north', room: 'office', pos: V(122.7, 90), normal: new THREE.Vector3(0, 0, -1), width: 1.4 });
    rooms.push({ id: 'office', x0: 118, x1: 126, y0: 84, y1: 90, base: 0, doors: ['office-west', 'office-north'] });
    hide.push({ id: 'station-office', pos: V(120.2, 89.1, 0), radius: 0.6, kind: 'office', enter: V(120.2, 87.7, 0), yaw: PI / 2, room: 'office' });
    lamp({ id: 'station-tube', tag: 'station', type: 'point', x: 113, y: 86, h: 4.0, color: 0xdfe4e6, intensity: 1.0, distance: 9, pattern: 'dying', head: 'bulb' });
    // the gate shutter (locked until the shift); red band = the way forward
    const gm = new THREE.Group(); const sh = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 0.1), MATS.shutter.mat); sh.position.set(0, 1.2, 0); sh.castShadow = true; gm.add(sh);
    const band = new THREE.Mesh(new THREE.BoxGeometry(4.02, 0.22, 0.12), MATS.redPaint.mat); band.position.set(0, 1.1, 0); gm.add(band);
    gm.position.copy(V(114, 80.05, 0)); root.add(gm);
    const gateBlock = { x0: 111.8, x1: 116.2, y0: 79.6, y1: 80.6, active: true }; blockers.push(gateBlock);
    const gateBox = new THREE.Box3(new THREE.Vector3(112, 0, -80.3), new THREE.Vector3(116, 2.4, -79.8)); colliders.push(gateBox);
    box('glass', 108.4, 111.8, 79.9, 80.0, 1.0, 3.0, { collide: false }); box('glass', 116.2, 125.6, 79.9, 80.0, 1.0, 3.0, { collide: false });
    let anim = null;
    G.world.stationGate = {
      pos: V(114, 80), isOpen: false, mesh: gm,
      open() { if (this.isOpen) return; this.isOpen = true; gateBlock.active = false; const i = colliders.indexOf(gateBox); if (i >= 0) colliders.splice(i, 1);
        anim = { t: 0, from: gm.position.y, to: 2.6 }; if (G.world.nav && !G.world.nav.edges.some(e => e[0] === 'pl-gate' && e[1] === 'stn-in')) G.world.nav.edges.push(['pl-gate', 'stn-in']); G.emit('station-gate', { open: true }); },
      close() { if (!this.isOpen) return; this.isOpen = false; gateBlock.active = true; if (colliders.indexOf(gateBox) < 0) colliders.push(gateBox);
        anim = { t: 0, from: gm.position.y, to: 0 }; if (G.world.nav) G.world.nav.edges = G.world.nav.edges.filter(e => !(e[0] === 'pl-gate' && e[1] === 'stn-in')); G.emit('station-gate', { open: false }); },
      _update(dt) { if (!anim) return; anim.t = Math.min(1, anim.t + dt / 2.2); const k = anim.t * anim.t * (3 - 2 * anim.t); gm.position.y = anim.from + (anim.to - anim.from) * k; if (anim.t >= 1) anim = null; }
    };
    // platform 96..130 x 92..96 (deck at 0, edge at y 96), tracks at y 100 (bed -1.0), tunnel portal at x 95
    box('concrete', 96, 130, 92, 96, -1.0, 0.0, { collide: false }); box('white', 96, 130, 95.4, 95.55, 0, 0.012, { collide: false });
    box('stone', 95, 140, 96, 104, -1.3, -1.0, { collide: false }); box('gravel', 95, 140, 96.4, 103.6, -1.0, -0.92, { collide: false });
    for (const y of [99.28, 100.72]) box('steel', 95, 140, y - 0.04, y + 0.04, -0.92, -0.78, { collide: false });
    for (let x = 95.3; x < 140; x += 0.65) box('wood', x, x + 0.22, 98.6, 101.4, -0.95, -0.85, { collide: false });
    addCollider(96, 130, 96.0, 96.2, 0, 1.2);   // the platform edge is a wall for the player (the train module handles boarding)
    addCollider(95.6, 96.1, 92, 96, 0, 2); addCollider(129.9, 130.4, 92, 96, 0, 2);
    // canopy
    for (let x = 99; x < 130; x += 6) box('steel', x, x + 0.2, 92.4, 92.6, 0, 3.8);
    box('roof', 96, 130, 91.8, 96.4, 3.8, 4.0, { collide: false });
    // tunnel portal (the rail tunnel backstage door)
    box('concrete', 93.4, 95.2, 104, 110, -1.3, 8); box('concrete', 93.4, 95.2, 88, 96.3, -1.3, 8, { collide: false }); box('concrete', 93.4, 95.2, 96, 104, 4.4, 8, { collide: false });
    box('black', 88, 94.8, 96.2, 103.8, -1.3, 4.4, { collide: false });
    L.railTunnel = V(94.6, 100, -1); L.tunnel = V(95, 100, 0);
    // fence north of the tracks
    box('metal', 95, 140, 104.4, 104.5, 0, 1.8, { collide: false });
    // platform lamps + the red lamp F
    lamp({ id: 'platform-w', tag: 'station', type: 'spot', x: 103, y: 94, h: 3.7, color: 0xdcdfe2, intensity: 4, distance: 10, angle: 0.95, pattern: 'buzz', head: 'bulb' });
    lamp({ id: 'platform-e', tag: 'station', type: 'spot', x: 123, y: 94, h: 3.7, color: 0xdcdfe2, intensity: 4, distance: 10, angle: 0.95, pattern: 'dying', head: 'bulb' });
    lamp({ id: 'station-red', tag: 'station', type: 'point', x: 112, y: 94.5, h: 3.4, color: 0xff1810, intensity: 2.6, distance: 11, pattern: 'steady', head: 'bulb', bulbR: 0.16, glowSize: 2.0, fogGlow: true });
    L.stationRedLamp = V(112, 94.5, 3.4);
    // signal mast: the red lamp seen up the north road from the south street
    box('steel', 103.8, 104.1, 92.4, 92.7, 0, 20); box('metal', 103.5, 104.4, 92.2, 92.4, 19, 20.2, { collide: false }); for (let h = 2; h < 19; h += 2.5) box('steel', 103.6, 104.3, 92.4, 92.7, h, h + 0.08, { collide: false });
    lamp({ id: 'signal-red', tag: 'signal', type: 'point', x: 103.95, y: 92.1, h: 19.6, color: 0xff1810, intensity: 1.5, distance: 6, pattern: 'steady', head: 'bulb', bulbR: 0.25, glowSize: 4.0, fogGlow: true });
    L.signalMast = V(103.95, 92.1, 19.6);
    L.stationGate = V(114, 79); L.stationInside = V(114, 84); L.stationOffice = V(121.3, 86.2); L.platformWest = V(98, 94); L.platformEast = V(128, 94);
  }

  /* ---------- props along the streets ---------- */
  function streetProps() {
    const vend = [['vending_machine', 64.6, 8.4, 'N', 'vending-underpass'], ['vending_machine_red', 79, 8.4, 'N', 'vending-south'], ['vending_machine', 47.5, 79.6, 'S', 'vending-plaza'], ['vending_machine_red', 90.5, 70.4, 'N', 'vending-plaza-red'], ['vending_machine', 44.6, 15, 'W', 'vending-alley']];
    for (const [n, x, y, f, id] of vend) {
      const o = place(n, x, y, f, 0, { collide: true, cast: true }); if (!o) continue;
      const p = kitPt(o, [0, 1.35, 0.5]); lamp({ id, tag: 'vending', type: 'point', x: p.x, y: -p.z, h: p.y, color: n.indexOf('red') >= 0 ? 0xff3a30 : 0xd8e0e4, intensity: 0.8, distance: 5, pattern: 'buzz', head: 'none', glowSize: 0.01, glow: false });
    }
    const booth = place('phone_booth', 52, 8.8, 'N', 0, { collide: true, cast: true });
    hide.push({ id: 'phone-booth', pos: V(52, 8.3, 0), radius: 0.45, kind: 'booth', enter: V(52, 9.6, 0), yaw: PI, room: null, exposed: true });
    for (const [x, y, f] of [[46.6, 10.8, 'S'], [87, 11.2, 'S'], [44.6, 50, 'N'], [69.6, 46.5, 'N'], [36, 70.8, 'N'], [124, 79.0, 'S'], [107, 70.9, 'N']]) place('bicycle', x, y, f, 0, { collide: true, cast: true });
    for (const [x, y, f] of [[43.95, 30, 'W'], [68.9, 31.2, 'W'], [82.6, 50, 'W'], [41.2, 70.8, 'N'], [96, 9, 'N'], [43.95, 64, 'W']]) place('trash_pile', x, y, f, 0, { collide: true });
    for (const [x, y, f] of [[44.6, 20, 'W'], [69.5, 22, 'W'], [83.0, 38, 'W'], [58.6, 35, 'W'], [55.3, 58, 'E']]) place('street_clutter', x, y, f, 0, { collide: true });
    place('umbrella_dropped', 44.0, 12.6, 'S', 0, {});
    place('umbrella_dropped', 57.8, 47, 'W', 0, {});
    for (const [x, y] of [[58, 10.5], [43.5, 26], [57, 30], [68.6, 40], [82, 46], [56, 74], [76, 76], [100, 74], [114, 77], [24, 76], [100, 16]]) place('puddle_decals', x, y, rnd() < 0.5 ? 'S' : 'E', 0.012, {});
    // missing-person posters
    poster(57.02, 4, 1.6, 'E'); poster(62.98, 5.2, 1.5, 'W'); poster(57.02, 6.0, 1.45, 'E'); poster(48.5, 8.02, 1.6, 'N'); poster(70.2, 8.02, 1.55, 'N');
    poster(42.02, 33, 1.6, 'E'); poster(45.0, 55.5, 1.5, 'W'); poster(80.18, 44, 1.6, 'E');
    // posts under the arcade at its mouths
    // west alley drain grates
    for (let y = 15; y < 72; y += 6) box('steel', 43.2, 43.8, y, y + 0.9, 0, 0.015, { collide: false });
    L.drain = V(66, 10, 0); box('steel', 65.4, 66.6, 9.6, 10.4, 0, 0.02, { collide: false });
  }
  function streetLamps() {
    const pole = (id, x, y, face, tag, pattern) => {
      const o = place('utility_pole', x, y, face, 0, { cast: true }); if (!o) return;
      addCollider(x - 0.2, x + 0.2, y - 0.2, y + 0.2, 0, 10);
      const info = kitInfo('utility_pole'); const lp = info && asArr(info.lights)[0] ? asArr(info.lights)[0].pos : [0, 5.75, 1.35]; const p = kitPt(o, lp);
      lamp({ id, tag: tag || 'street', type: 'spot', x: p.x, y: -p.z, h: p.y - 0.15, color: 0xd9dcdc, intensity: 5, distance: 15, angle: 0.75, pattern: pattern || 'buzz', head: 'none', glowSize: 1.0, emissive: lanternMats(o), shaft: true });
    };
    pole('south-1', 48, 8.3, 'N'); pole('south-2', 66, 8.3, 'N', 'street', 'dying'); pole('south-3', 84, 8.3, 'N'); pole('south-4', 96, 8.3, 'N');
    pole('plaza-1', 36, 70.4, 'N'); pole('plaza-2', 64, 70.4, 'N'); pole('plaza-3', 92.2, 70.4, 'N', 'street', 'dying'); pole('plaza-4', 121, 70.4, 'N');
    pole('plaza-5', 50.5, 79.6, 'S'); pole('plaza-6', 80, 79.6, 'S');
    pole('north-road-s', 97.7, 22, 'E'); pole('north-road-n', 102.3, 50, 'W');
    // bracket lamps (my own heads): west alley, canal lane
    const bracket = (id, x, y, h, tag, pattern, dx) => { box('metal', Math.min(x, x - dx), Math.max(x, x - dx), y - 0.04, y + 0.04, h + 0.25, h + 0.32, { collide: false });
      lamp({ id, tag, type: 'spot', x, y, h, color: 0xd6d9d9, intensity: 3.6, distance: 11, angle: 0.85, pattern, head: 'shade', shaft: true }); };
    bracket('alley-1', 43.9, 30, 3.4, 'alley', 'dying', -0.9); bracket('alley-2', 43.9, 60, 3.4, 'alley', 'buzz', -0.9);
    bracket('canal-1', 81, 45, 3.2, 'alley', 'dying', -0.8);
    // arcade hanging lamps (die south -> north on intel 1); the north-mouth lamp is the glimpse lamp
    [18, 30, 42, 54, 63].forEach((y, i) => { box('steel', 56.98, 57.02, y - 0.02, y + 0.02, 4.9, 7.4, { collide: false });
      lamp({ id: 'arcade-' + (i + 1), tag: 'arcade', type: 'spot', x: 57, y, h: 4.85, color: 0xdcdcd8, intensity: 9, distance: 11, angle: 0.62, penumbra: 0.35, pattern: i === 2 ? 'dying' : 'buzz', head: 'shade', shaft: true }); });
    box('steel', 56.98, 57.02, 69.38, 69.42, 4.9, 7.4, { collide: false });
    lamp({ id: 'arcade-mouth', tag: 'arcade', type: 'spot', x: 57, y: 69.4, h: 4.85, color: 0xe2e2de, intensity: 5, distance: 12, angle: 0.9, pattern: 'steady', head: 'shade', shaft: true });
    // underpass tube
    box('white', 59.2, 60.8, 3.9, 4.1, 3.05, 3.12, { collide: false });
    lamp({ id: 'underpass', tag: 'street', type: 'point', x: 60, y: 4, h: 2.95, color: 0xd5dde0, intensity: 1.3, distance: 8, pattern: 'dying', head: 'none', glowSize: 0.8 });
    // yokocho red lanterns (east side on the bar fronts, a few on the west side), strung wire overhead
    const ys = [14.5, 23.6, 28.2, 37.2, 49.6, 52.6, 63.2, 67.8];
    ys.forEach((y, i) => redLantern('yokocho-' + (i + 1), 69.55, y, 'W', 2.3));
    [17.6, 56].forEach((y, i) => redLantern('yokocho-w' + (i + 1), 67.45, y, 'E', 2.3));
    lamp({ id: 'yokocho-bulb-1', tag: 'yokocho', type: 'spot', x: 69.5, y: 25.9, h: 3.0, color: 0xe6e2d8, intensity: 5, distance: 8, angle: 0.8, pattern: 'buzz', head: 'shade', shaft: true });
    lamp({ id: 'yokocho-bulb-2', tag: 'yokocho', type: 'spot', x: 69.5, y: 60.6, h: 3.0, color: 0xe6e2d8, intensity: 5, distance: 8, angle: 0.8, pattern: 'dying', head: 'shade', shaft: true });
    for (let y = 13; y < 74; y += 7) box('black', 67, 70, y, y + 0.02, 4.4, 4.43, { collide: false });
    L.yokochoSouth = V(68.5, 12.5); L.yokochoNorth = V(68.5, 73.5);
  }

  /* =====================================================================================
   * NAV GRAPH (plan coords; monster pathfinding)
   * ===================================================================================== */
  function buildNav() {
    const N = {
      'u0': [60, 2.5], 'u1': [60, 10], 's-w': [43.2, 10], 's-a': [57, 10], 's-y': [68.2, 10], 's-m': [84, 10], 's-n': [100, 10],
      'n1': [100, 18], 'n2': [100, 25], 'n3': [100, 41], 'n4': [100, 56],
      'w1': [43.2, 22.7], 'w2': [43.2, 33], 'w3': [43.2, 43.5], 'w4': [43.2, 58], 'w5': [43.2, 75],
      'ph-b': [46.3, 22.7], 'ph-1': [48.8, 22.8], 'ph-2': [52.2, 22.6], 'km-b': [46.3, 43.5], 'km-1': [48.8, 43.5], 'km-2': [52.2, 43.6],
      'a1': [57, 22.6], 'a2': [57, 25.6], 'a3': [57, 33], 'a4': [57, 43.6], 'a5': [57, 49], 'a6': [57, 60], 'a7': [57, 75],
      'nd-1': [62, 25.6], 'nd-2': [65, 25.6], 'pk-1': [62, 49.3], 'pk-2': [65.5, 50.7],
      'y2': [68.2, 25.6], 'y3': [68.2, 34.5], 'y4': [68.2, 42], 'y5': [68.2, 51], 'y6': [68.2, 55.5], 'y7': [68.2, 75],
      'ps': [75, 34.5], 'pn': [75, 55.5], 'c1': [82, 34.5], 'c2': [82, 40], 'c3': [82, 47], 'c4': [82, 55.5],
      'iz-f': [71.5, 42], 'iz-m': [72.8, 40.2], 'iz-k': [76.6, 40.0], 'iz-s': [77.9, 43.6],
      'pl-st': [24, 75], 'pl-w': [34, 75], 'pl-e1': [84, 75], 'pl-n': [100, 75], 'pl-gate': [114, 75], 'pl-e': [126, 75],
      'st0': [24, 79], 'st1': [24, 89.6], 'sh1': [24, 92.3], 'sh2': [24, 98.6], 'sh-se': [17.3, 89.6], 'sh-ke': [17.3, 95], 'sh-ne': [17.3, 99.5], 'sh-k': [14, 99.5], 'sh-k1': [13, 95], 'sh-e': [30.5, 92.3], 'sh-ema': [35.6, 98.6],
      'stn-in': [114, 82.5], 'stn-b': [112.7, 84.6], 'stn-c': [112.7, 88.5], 'of-w': [117.4, 86.7], 'of-1': [122.7, 86.7], 'of-n': [122.7, 91], 'stn-pf': [114, 91.2],
      'pf-w': [99, 94], 'pf-m': [114, 94], 'pf-e': [127, 94]
    };
    const nodes = Object.keys(N).map(id => ({ id, pos: V(N[id][0], N[id][1], heightAt(N[id][0], -N[id][1])) }));
    const E = [
      ['u0', 'u1'], ['u1', 's-a'], ['u1', 's-y'], ['s-w', 's-a'], ['s-y', 's-m'], ['s-m', 's-n'], ['s-n', 'n1'], ['n1', 'n2'], ['n3', 'n4'], ['n4', 'pl-n'],
      ['s-w', 'w1'], ['w1', 'w2'], ['w2', 'w3'], ['w3', 'w4'], ['w4', 'w5'],
      ['w1', 'ph-b'], ['ph-b', 'ph-1'], ['ph-1', 'ph-2'], ['ph-2', 'a1'], ['w3', 'km-b'], ['km-b', 'km-1'], ['km-1', 'km-2'], ['km-2', 'a4'],
      ['s-a', 'a1'], ['a1', 'a2'], ['a2', 'a3'], ['a3', 'a4'], ['a4', 'a5'], ['a5', 'a6'], ['a6', 'a7'],
      ['a2', 'nd-1'], ['nd-1', 'nd-2'], ['nd-2', 'y2'], ['a5', 'pk-1'], ['pk-1', 'pk-2'], ['pk-2', 'y5'],
      ['s-y', 'y2'], ['y2', 'y3'], ['y3', 'y4'], ['y4', 'y5'], ['y5', 'y6'], ['y6', 'y7'],
      ['y3', 'ps'], ['ps', 'c1'], ['y6', 'pn'], ['pn', 'c4'], ['c1', 'c2'], ['c2', 'c3'], ['c3', 'c4'],
      ['y4', 'iz-f'], ['iz-f', 'iz-m'], ['iz-m', 'iz-k'], ['iz-k', 'c2'], ['iz-k', 'iz-s'],
      ['pl-st', 'pl-w'], ['pl-w', 'w5'], ['w5', 'a7'], ['a7', 'y7'], ['y7', 'pl-e1'], ['pl-e1', 'pl-n'], ['pl-n', 'pl-gate'], ['pl-gate', 'pl-e'],
      ['pl-st', 'st0'], ['st0', 'st1'], ['st1', 'sh1'], ['sh1', 'sh2'], ['st1', 'sh-se'], ['sh-se', 'sh-ke'], ['sh-ke', 'sh-k1'], ['sh-ke', 'sh-ne'], ['sh-ne', 'sh-k'], ['sh-k', 'sh-k1'], ['sh1', 'sh-e'], ['sh-e', 'sh-ema'], ['sh2', 'sh-ema'],
      ['stn-in', 'stn-b'], ['stn-b', 'stn-c'], ['stn-c', 'stn-pf'], ['stn-c', 'of-w'], ['of-w', 'of-1'], ['of-1', 'of-n'], ['of-n', 'stn-pf'], ['stn-pf', 'pf-m'], ['pf-m', 'pf-w'], ['pf-m', 'pf-e']
    ];
    return { nodes, edges: E };
  }
  function checkNav(nav) { // debug: every edge must be walkable at r 0.25 (except the gate, which is shut)
    const byId = {}; nav.nodes.forEach(n => byId[n.id] = n.pos); const bad = [];
    for (const [a, b] of nav.edges) { const A = byId[a], B = byId[b]; if (!A || !B) { bad.push(a + '>' + b + '(missing)'); continue; }
      const d = A.distanceTo(B), n = Math.max(2, Math.ceil(d / 0.3));
      for (let i = 0; i <= n; i++) { const x = A.x + (B.x - A.x) * i / n, z = A.z + (B.z - A.z) * i / n; if (!walkable(x, z, 0.25)) { bad.push(a + '>' + b + ' @' + x.toFixed(1) + ',' + (-z).toFixed(1)); break; } } }
    const nb = nav.nodes.filter(n => !walkable(n.pos.x, n.pos.z, 0.25)).map(n => n.id);
    if (bad.length || nb.length) console.warn('[level] nav check: blocked edges ' + bad.length + ': ' + bad.join(' | ') + ' ; blocked nodes: ' + nb.join(','));
    else console.info('[level] nav check OK: ' + nav.nodes.length + ' nodes, ' + nav.edges.length + ' edges all walkable');
    const hs = hide.filter(h => !walkable(h.enter.x, h.enter.z, 0.25)).map(h => h.id); if (hs.length) console.warn('[level] hide enter points blocked: ' + hs.join(','));
  }

  /* =====================================================================================
   * ATMOSPHERE
   * ===================================================================================== */
  function atmosphere() {
    const hemi = new THREE.HemisphereLight(0x262930, 0x050505, 0.38); root.add(hemi);
    const moon = new THREE.DirectionalLight(0x8a9099, 0.12); moon.position.set(-40, 60, 30); root.add(moon);
    if (!G.fx) { G.scene.fog = new THREE.FogExp2(0x101114, 0.034); G.scene.background = new THREE.Color(0x101114); }
    const fx = G.fx;
    if (fx) {
      try {
        if (fx.fog) Object.assign(fx.fog, { density: 0.05, falloff: 0.22, color: 0x111215, start: 2.0, noise: 0.4 });
        if (fx.rain) Object.assign(fx.rain, { intensity: 1, wet: 0.9, opacity: 0.6, wind: [0.9, 0.5] });
      } catch (e) { console.warn('[level] fx settings', e); }
    }
  }
  function fxHooks() {
    const fx = G.fx; if (!fx) return;
    try {
      if (fx.patch) {
        root.traverse(o => { if (o.isMesh && o.material && /batch_(asphalt|paving|gravel)/.test(o.name)) fx.patch(o, { wet: o.name === 'batch_paving' ? 0.55 : 1, ripple: true }); });
        root.traverse(o => { if (o.isMesh && o.material && /batch_(tile|stone|concrete)/.test(o.name)) fx.patch(o, { wet: 0.35 }); });
        fx.patch(root, {});
      }
      for (const e of lamps) {
        if (fx.addFlicker) { e.flicker = fx.addFlicker(e.light, { pattern: e.pattern, base: e.base, emissive: e.mats, proximity: () => monsterProx(e) }); if (e.level < 1) e.flicker.kill = e.level; }
        if (e.shaft && fx.addShaft && e.light.isSpotLight) fx.addShaft(e.light, { opacity: 0.12, length: Math.min(6.5, e.pos.y + 0.5) });
      }
    } catch (err) { console.warn('[level] fx hooks failed (level still runs)', err); }
  }
  function monsterProx(e) { const m = G.monster; if (!m || !m.pos || m.state === 'dormant' || m.state === 'gone') return 0; const d = m.pos.distanceTo(e.pos); return d < 15 ? (1 - d / 15) * 0.9 : 0; }

  /* =====================================================================================
   * JUMPS (capture hooks)
   * ===================================================================================== */
  const JUMPS = {
    'level-start': { p: [60, 1.6], yaw: 0, pitch: 0.04 },
    'level-arcade': { p: [57.6, 15.5], yaw: 0.05, pitch: 0.06 },
    'level-yokocho': { p: [68.3, 21], yaw: -0.08, pitch: 0.04 },
    'level-shrine': { p: [24.6, 90.2], yaw: 0.12, pitch: 0.1 },
    'level-station': { p: [111.5, 71.2], yaw: -0.22, pitch: 0.1 },
    'level-north': { p: [100, 13.5], yaw: 0, pitch: 0.12 },
    'level-plaza': { p: [57, 66.5], yaw: 0, pitch: 0.05 },
    'level-canal': { p: [82, 35.5], yaw: 0, pitch: 0.0 }
  };
  function hasPlayer() { return G.modules.some(m => m.name === 'player' && m.ok); }
  function viewAt(j) {
    const pos = V(j.p[0], j.p[1], heightAt(j.p[0], -j.p[1]));
    if (hasPlayer()) G.emit('teleport', { pos: pos.clone(), yaw: j.yaw, pitch: j.pitch || 0 });
    else { G.camera.position.copy(pos).add(new THREE.Vector3(0, 1.62, 0)); G.camera.rotation.set(j.pitch || 0, j.yaw, 0); G.player.pos.copy(pos); G.player.yaw = j.yaw; }
  }

  /* =====================================================================================
   * MODULE
   * ===================================================================================== */
  let poolT = 0, frameN = 0, firstFrame = true, shiftOn = false, arcadeSeq = null;
  G.register('level', {
    order: 20,
    async init(G) {
      makeTextures(); makeMaterials();
      G.scene.add(root);
      try { kitJSON = await G.loadJSON('env/kit.json'); } catch (e) { console.warn('[level] kit.json not loaded', e); }
      await Promise.all(KIT_FILES.map(f => G.loadGLB('env/' + f + '.glb').then(g => { KIT[f] = g; }).catch(e => console.warn('[level] kit missing: ' + f, e))));
      buildTown();
      buildBatches(root);
      buildGrid();
      atmosphere();
      root.updateMatrixWorld(true);
      lamps.forEach(e => e.pos.copy(e.light.getWorldPosition(new THREE.Vector3())));

      // kit hide spots inside placed enterable kit modules are not reachable in this layout (fronts are walls of solid blocks), so only the plan's spots + the phone booth are exported.
      // yokai glimpse spots (plan §11 positions; kinds = yokai roster top 5)
      yokai.push(
        { id: 'Y1', pos: V(42.6, 13.6, 0), facing: new THREE.Vector3(1, 0, 0.6).normalize(), kind: 'akaname', planKind: 'kasa-obake', view: V(57, 10, 1.6), note: 'peeks round the west alley mouth' },
        { id: 'Y2', pos: V(63.2, 26.8, 0), facing: new THREE.Vector3(-1, 0, 0), kind: 'zashiki-warashi', planKind: 'child shape', view: V(57, 33, 1.6), note: 'runs past inside the dark noodle shop' },
        { id: 'Y3', pos: V(69.95, 45.3, 1.5), facing: new THREE.Vector3(-1, 0, 0), kind: 'mokumokuren', planKind: 'nekomata', view: V(68.5, 33, 1.6), note: 'eyes open in the izakaya shoji' },
        { id: 'Y4', pos: V(21.6, 90.6, 6), facing: new THREE.Vector3(0, 0, 1), kind: 'nopperabo', planKind: 'kitsune mask', view: V(24, 84, 6 * 0.5 + 1.6), note: 'stands by the first stone lantern; the lanterns go out' },
        { id: 'Y5', pos: V(46, 76, 3.2), facing: new THREE.Vector3(0, 0, 1), kind: 'chochin-obake', planKind: 'chochin-obake', view: V(30, 75, 1.6), note: 'lanterns along the shift corridor open eyes' }
      );
      yokai.forEach(y => { y.yaw = Math.atan2(-y.facing.x, -y.facing.z); });

      const nav = buildNav();
      const B = (x0, x1, y0, y1, h0, h1) => new THREE.Box3(new THREE.Vector3(x0, h0, -y1), new THREE.Vector3(x1, h1, -y0));
      Object.assign(L, {
        spawn: V(60, 1.6), underpassExit: V(60, 8), southStreet: V(66, 10), westAlleyMouth: V(43.5, 12.5), arcadeSouth: V(57, 12.5), arcadeNorth: V(57, 69.5),
        glimpse: V(57, 69.6), shadow: V(70.4, 37.2), plaza: V(70, 75), plazaArcadeMouth: V(57, 72), haiden: L.haiden,
        drainDoor: L.drain, roofYokocho: V(75, 52, 6), shiftStart: V(24, 78), shiftEnd: V(112, 94.5)
      });
      Object.assign(G.world, {
        colliders, walkable, heightAt,
        indoor(x, z) { const y = -z; for (const r of rooms) if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) return r.id; if (x > 57 && x < 63 && y < 8) return 'underpass'; if (x > 54 && x < 60 && y > 12 && y < 70) return 'arcade'; if (x > 96 && x < 130 && y > 92 && y < 96) return 'platform'; return null; },
        spawn: { pos: V(60, 1.6, 0), yaw: 0 },
        drops, bell: L.bell.clone(), hideSpots: hide, doors, rooms, nav,
        lights: lamps, lampsByTag: (t) => lamps.filter(e => e.tag === t),
        yokaiSpots: yokai,
        backstage: [{ id: 'drain', pos: L.drain.clone() }, { id: 'roof-yokocho', pos: V(75, 52, 6) }, { id: 'shrine-underfloor', pos: L.shrineUnderfloor.clone() }, { id: 'rail-tunnel', pos: L.railTunnel.clone() }],
        station: {
          platform: V(113, 94, 0), platformBox: B(96, 130, 92, 96, 0, 3), trackDir: new THREE.Vector3(-1, 0, 0), trackY: -0.78, trackZ: -100,
          trainSpawnX: 115, trainLength: 30, tunnelX: 95, lastCarX: 128, redLamp: L.stationRedLamp.clone(), office: L.stationOffice.clone(), gate: V(114, 80),
          spawnAfterShift: { pos: V(98.5, 94, 0), yaw: -PI / 2 }
        },
        props, grid: { cell: CELL, w: GW, h: GH, data: grid }, landmarks: L
      });
      fxHooks();
      checkNav(nav);
      G.on('intel', d => { if (d && d.n === 1 && !arcadeSeq) arcadeSeq = { t: 0, ids: ['arcade-1', 'arcade-2', 'arcade-3', 'arcade-4', 'arcade-5'] }; });
      G.on('shift-start', () => { shiftOn = true; });
      G.on('shift-end', () => { shiftOn = false; if (G.world.stationGate) G.world.stationGate.open(); });
      if (!hasPlayer() && !(G.jump && JUMPS[G.jump])) viewAt({ p: [60, 1.6], yaw: 0, pitch: 0.03 });
      console.info('[level] Kagemachi built: ' + colliders.length + ' colliders, ' + lamps.length + ' lamps, ' + root.children.length + ' root objects');
    },
    update(dt, G) {
      if (++frameN === 30 && G.renderer && G.renderer.info) console.info('[level] frame 30: draw calls ' + G.renderer.info.render.calls + ', tris ' + G.renderer.info.render.triangles);
      if (firstFrame) { firstFrame = false; if (G.jump && JUMPS[G.jump]) { viewAt(JUMPS[G.jump]); if (G.ui) G.ui.fade(0); } }
      // light pool: nearest N of each type are visible (constant counts -> no shader recompiles)
      poolT -= dt;
      if (poolT <= 0) {
        poolT = 0.2; const cp = G.camera.getWorldPosition(new THREE.Vector3());
        for (const type of ['point', 'spot']) {
          const list = lamps.filter(e => (type === 'spot') === !!e.light.isSpotLight);
          list.forEach(e => { e._d = e.pos.distanceTo(cp) + (e.level < 0.05 ? 60 : 0); });
          list.sort((a, b) => a._d - b._d); list.forEach((e, i) => { e.light.visible = i < POOL[type]; });
        }
      }
      if (!G.fx) for (const e of lamps) applyLevel(e);
      // arcade lamps die south -> north over 4 s after intel 1
      if (arcadeSeq) { arcadeSeq.t += dt; arcadeSeq.ids.forEach((id, i) => { const e = lamps.find(l => l.id === id); if (e && arcadeSeq.t > i * 0.8 + 0.2 && e.level > 0) e.setLevel(0); }); if (arcadeSeq.t > 5) arcadeSeq.done = true; }
      if (G.world.stationGate && G.world.stationGate._update) G.world.stationGate._update(dt);
      // rain: off indoors, thinner under the torn arcade roof; ground follows the floor height
      if (G.fx && G.fx.rain && !shiftOn) {
        const c = G.camera.getWorldPosition(new THREE.Vector3()); const r = G.world.indoor(c.x, c.z);
        const want = r === 'arcade' ? 0.7 : r && r !== 'platform' ? 0 : 1;
        G.fx.rain.intensity += (want - G.fx.rain.intensity) * Math.min(1, dt * 4);
        if (G.fx.rain.intensity < 0.02 && want === 0) G.fx.rain.intensity = 0;
        G.fx.rain.ground = heightAt(c.x, c.z);
      }
    }
  });
})();
