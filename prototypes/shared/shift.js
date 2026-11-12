/* WorldShift: reusable pieces for the world-shift sequence (brief SHIFT-01).
 * Plain script, needs THREE (r128) loaded first. Exposes window.WorldShift.
 *
 *   WorldShift.Koto        the controlling clock: a koto that plucks on a fixed bar; every move in the castle hangs off it
 *   WorldShift.audio       Karplus-Strong koto strings, wooden clacks, knocks, drone (lazy WebAudio, needs a gesture)
 *   WorldShift.Controller  first-person WASD + mouse (pointer lock, drag fallback), flat or surface-frame (gravity) mode
 *   WorldShift.Profile     a walkable surface path in the y-z plane (floor -> wall -> ceiling) with continuous normals
 *   WorldShift.Stretch     level<->world mapping for a corridor that elongates around the player (dolly zoom helper)
 *   WorldShift.Rigid       a rotation+translation in xz, used to build seamless loops (P.T. style) and portal copies
 *   WorldShift.Ratchet     a hinge angle that moves in steps, one step per pluck (origami folds)
 *   WorldShift.tex / mat / lantern / figure   palette-bound builders (black, white, grey, red)
 */
(function (global) {
  'use strict';
  var THREE = global.THREE;
  var WS = {};
  WS.version = '0.1.0';

  /* ---------- math ---------- */
  WS.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  WS.lerp = function (a, b, t) { return a + (b - a) * t; };
  WS.smooth = function (t) { t = WS.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  WS.easeOut = function (t) { t = WS.clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };
  WS.easeIn = function (t) { t = WS.clamp(t, 0, 1); return t * t * t; };

  /* ---------- accessibility ---------- */
  WS.reduceMotion = false;
  try { WS.reduceMotion = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { /* ignore */ }

  /* ---------- palette ---------- */
  WS.PAL = {
    black: 0x050505, ink: 0x121212, char: 0x1d1c1b, grey: 0x5c5b59, stone: 0x8a8884,
    paper: 0xd6d4ce, white: 0xf0efea, red: 0xa3101a, blood: 0x5a0a0e, glow: 0xff2b2b
  };

  /* ---------- textures ---------- */
  var texCache = {};
  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'); draw(g, w, h);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return t;
  }
  function speck(g, w, h, n, cols, a, s) {
    for (var i = 0; i < n; i++) {
      g.globalAlpha = a * Math.random(); g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * s, 1 + Math.random() * s);
    }
    g.globalAlpha = 1;
  }
  var painters = {
    shoji: function (g, w, h) {
      g.fillStyle = '#d8d6cf'; g.fillRect(0, 0, w, h); speck(g, w, h, 900, ['#c4c1b9', '#e6e4de'], .5, 3);
      g.fillStyle = '#16130f';
      for (var i = 0; i <= 3; i++) g.fillRect(i * (w - 10) / 3, 0, 10, h);
      for (var j = 0; j <= 4; j++) g.fillRect(0, j * (h - 10) / 4, w, 10);
    },
    tatami: function (g, w, h) {
      g.fillStyle = '#76756f'; g.fillRect(0, 0, w, h);
      for (var y = 0; y < h; y += 3) { g.fillStyle = (y / 3) % 2 ? '#6c6b65' : '#807f78'; g.fillRect(0, y, w, 2); }
      speck(g, w, h, 500, ['#5c5b56', '#8e8d86'], .4, 4);
      g.fillStyle = '#0d0d0d'; g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h);
    },
    wood: function (g, w, h) {
      g.fillStyle = '#2a2724'; g.fillRect(0, 0, w, h);
      for (var x = 0; x < w; x += 32) { g.fillStyle = '#121110'; g.fillRect(x, 0, 2, h); }
      for (var k = 0; k < 120; k++) { g.globalAlpha = .25; g.fillStyle = '#1a1816'; g.fillRect(Math.random() * w, Math.random() * h, 1, 20 + Math.random() * 80); }
      g.globalAlpha = 1; speck(g, w, h, 300, ['#3a3633', '#191715'], .4, 3);
    },
    plaster: function (g, w, h) {
      g.fillStyle = '#7e7c78'; g.fillRect(0, 0, w, h); speck(g, w, h, 2500, ['#6c6a66', '#8e8c88', '#5a5855'], .35, 4);
      g.fillStyle = '#1a1816'; g.fillRect(0, h - 40, w, 40);
    },
    beams: function (g, w, h) {
      g.fillStyle = '#3c3a37'; g.fillRect(0, 0, w, h); speck(g, w, h, 600, ['#2c2a28', '#4a4844'], .4, 3);
      g.fillStyle = '#121110'; for (var x = 0; x < w; x += 64) g.fillRect(x, 0, 12, h);
    },
    hand: function (g, w, h) {
      g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(150,10,18,0.9)';
      g.beginPath(); g.ellipse(w * .5, h * .62, w * .2, h * .2, 0, 0, Math.PI * 2); g.fill();
      for (var i = 0; i < 4; i++) { g.fillRect(w * (.3 + i * .11), h * .18 + (i === 0 || i === 3 ? 18 : 0), w * .07, h * .36); }
      g.fillRect(w * .12, h * .5, w * .2, h * .08);
      speck(g, w, h, 60, ['rgba(120,0,10,.8)'], 1, 5);
    }
  };
  /** WS.tex(name, repeatX, repeatY): palette texture, cloned so repeat is per-use. */
  WS.tex = function (name, rx, ry) {
    if (!texCache[name]) texCache[name] = canvasTex(name === 'hand' ? 128 : 256, 256, painters[name]);
    var t = texCache[name].clone(); t.needsUpdate = true; t.repeat.set(rx || 1, ry || 1); return t;
  };
  WS.mat = function (opts) {
    opts = opts || {};
    var m = new THREE.MeshStandardMaterial({ color: opts.color !== undefined ? opts.color : 0xffffff, roughness: opts.rough !== undefined ? opts.rough : .88, metalness: 0 });
    if (opts.map) m.map = opts.map;
    if (opts.emissive !== undefined) { m.emissive = new THREE.Color(opts.emissive); if (opts.emissiveMap) m.emissiveMap = opts.emissiveMap; }
    if (opts.side) m.side = opts.side;
    if (opts.transparent) { m.transparent = true; m.alphaTest = .3; }
    return m;
  };
  WS.basic = function (color, fog) { var m = new THREE.MeshBasicMaterial({ color: color }); if (fog === false) m.fog = false; return m; };

  WS.plane = function (w, h, mat) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); };
  WS.box = function (w, h, d, mat, x, y, z) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x || 0, y || 0, z || 0); return m; };

  /** paper lantern; opts.red gives the red variant. */
  WS.lantern = function (opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var paper = WS.basic(opts.red ? WS.PAL.glow : 0xe9e4d6);
    var body = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .48, 12), paper); g.add(body);
    var capM = WS.basic(0x0a0a0a);
    var c1 = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, .06, 12), capM); c1.position.y = .27; g.add(c1);
    var c2 = c1.clone(); c2.position.y = -.27; g.add(c2);
    if (opts.cord) { var cord = WS.box(.015, opts.cord, .015, capM, 0, .27 + opts.cord / 2, 0); g.add(cord); }
    g.userData.paper = paper;
    return g;
  };

  /** the stalker silhouette: tall, thin, red pin-point eyes. */
  WS.figure = function (opts) {
    opts = opts || {};
    var h = opts.h || 2.3, g = new THREE.Group();
    var m = new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 1 });
    var body = new THREE.Mesh(new THREE.CylinderGeometry(.1, .3, h * .72, 8), m); body.position.y = h * .36; g.add(body);
    var head = new THREE.Mesh(new THREE.SphereGeometry(.15, 10, 8), m); head.scale.set(1, 1.35, 1); head.position.y = h * .8; g.add(head);
    for (var s = -1; s <= 1; s += 2) {
      var arm = WS.box(.05, h * .55, .05, m, s * .2, h * .44, 0); arm.rotation.z = s * .06; g.add(arm);
      var eye = new THREE.Mesh(new THREE.SphereGeometry(.022, 6, 4), WS.basic(WS.PAL.glow, false)); eye.position.set(s * .05, h * .82, .13); g.add(eye);
    }
    return g;
  };

  /* ---------- audio ---------- */
  var A = { ctx: null, master: null, wet: null, buffers: {}, droneNodes: null, muted: false };
  // 13 strings, hirajoshi-style tuning (D G A Bb D Eb G A Bb D Eb G A)
  A.TUNING = [146.8, 196.0, 220.0, 233.1, 293.7, 311.1, 392.0, 440.0, 466.2, 587.3, 622.3, 784.0, 880.0];
  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return A.ctx; }
    var AC = global.AudioContext || global.webkitAudioContext; if (!AC) return null;
    try { A.ctx = new AC(); } catch (e) { return null; }
    var c = A.ctx;
    A.master = c.createGain(); A.master.gain.value = A.muted ? 0 : .8; A.master.connect(c.destination);
    // cheap hall: feedback delay through a lowpass
    var d = c.createDelay(1); d.delayTime.value = .27; var fb = c.createGain(); fb.gain.value = .38;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    A.wet = c.createGain(); A.wet.gain.value = .35;
    A.wet.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(A.master);
    return c;
  };
  A.setMuted = function (m) { A.muted = m; if (A.master) A.master.gain.value = m ? 0 : .8; };
  function ksBuffer(freq) {
    var key = Math.round(freq * 10); if (A.buffers[key]) return A.buffers[key];
    var c = A.ctx, sr = c.sampleRate, n = Math.floor(sr * 3.2), buf = c.createBuffer(1, n, sr), d = buf.getChannelData(0);
    var N = Math.max(2, Math.round(sr / freq)), ring = new Float32Array(N), i, idx = 0;
    for (i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    for (i = 0; i < n; i++) { var v = ring[idx], nx = ring[(idx + 1) % N]; ring[idx] = (v * .55 + nx * .45) * .9975; d[i] = v; idx = (idx + 1) % N; }
    A.buffers[key] = buf; return buf;
  }
  /** pluck string i (0..12). opts: {vol, bend (playback ratio to glide to), bendTime, delay} */
  A.pluck = function (i, opts) {
    if (!A.ctx) return; opts = opts || {};
    var c = A.ctx, t = c.currentTime + (opts.delay || 0);
    var src = c.createBufferSource(); src.buffer = ksBuffer(A.TUNING[WS.clamp(i | 0, 0, 12)]);
    if (opts.bend) { src.playbackRate.setValueAtTime(1, t + .06); src.playbackRate.exponentialRampToValueAtTime(opts.bend, t + (opts.bendTime || 1)); }
    var g = c.createGain(); g.gain.setValueAtTime(opts.vol || .5, t); g.gain.exponentialRampToValueAtTime(.001, t + 3.1);
    var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 4200;
    src.connect(f); f.connect(g); g.connect(A.master); g.connect(A.wet); src.start(t); src.stop(t + 3.2);
  };
  function noiseBurst(t, dur, freq, q, vol) {
    var c = A.ctx, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    var s = c.createBufferSource(); s.buffer = b; var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    var g = c.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(A.master); g.connect(A.wet); s.start(t);
  }
  function thump(t, freq, vol, dur) {
    var c = A.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(freq * 2, t); o.frequency.exponentialRampToValueAtTime(freq, t + .08);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(g); g.connect(A.master); o.start(t); o.stop(t + dur + .05);
  }
  /** the castle mechanism: a wooden clack plus a low iron thud. */
  A.clack = function (vol) { if (!A.ctx) return; var t = A.ctx.currentTime; noiseBurst(t, .07, 1100, 3, (vol || .5) * 1.2); thump(t, 48, (vol || .5) * .9, .35); };
  /** a knock on wood (the thing outside). */
  A.knock = function (vol) { if (!A.ctx) return; var t = A.ctx.currentTime; noiseBurst(t, .05, 420, 2, vol || .7); thump(t, 70, (vol || .7) * .6, .2); };
  A.drone = function (on) {
    if (!A.ctx) return; var c = A.ctx;
    if (on && !A.droneNodes) {
      var g = c.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(.06, c.currentTime + 2); g.connect(A.master);
      var o1 = c.createOscillator(), o2 = c.createOscillator(); o1.frequency.value = 55; o2.frequency.value = 55.6; o2.type = 'triangle';
      o1.connect(g); o2.connect(g); o1.start(); o2.start(); A.droneNodes = { g: g, o: [o1, o2] };
    } else if (!on && A.droneNodes) {
      var dn = A.droneNodes; A.droneNodes = null; dn.g.gain.linearRampToValueAtTime(0, c.currentTime + .5);
      setTimeout(function () { dn.o.forEach(function (o) { try { o.stop(); } catch (e) { /* ignore */ } }); }, 700);
    }
  };
  WS.audio = A;

  /* ---------- the controlling clock ---------- */
  /**
   * Koto: a deterministic bar clock driven by update(dt) (so it can be simulated for captures).
   * Listeners get {beat, inBar, bar, rest}. Rest beats are when the castle is still.
   */
  function Koto(opts) { this.listeners = []; this.configure(opts || {}); }
  Koto.prototype.configure = function (o) {
    this.bpm = o.bpm || 72; this.beatsPerBar = o.beatsPerBar || 4; this.rests = o.rests || [this.beatsPerBar - 1];
    this.reset();
  };
  Koto.prototype.reset = function () { this.t = 0; this.beat = -1; };
  Koto.prototype.beatLen = function () { return 60 / this.bpm; };
  Koto.prototype.barLen = function () { return this.beatLen() * this.beatsPerBar; };
  Koto.prototype.on = function (fn) { this.listeners.push(fn); };
  Koto.prototype.clear = function () { this.listeners = []; };
  Koto.prototype.phase = function () { return (this.t / this.beatLen()) % 1; };
  Koto.prototype.inBar = function () { return Math.floor(this.t / this.beatLen()) % this.beatsPerBar; };
  Koto.prototype.update = function (dt) {
    this.t += dt;
    var b = Math.floor(this.t / this.beatLen());
    while (this.beat < b) {
      this.beat++;
      var ib = this.beat % this.beatsPerBar;
      var ev = { beat: this.beat, inBar: ib, bar: Math.floor(this.beat / this.beatsPerBar), rest: this.rests.indexOf(ib) >= 0 };
      for (var i = 0; i < this.listeners.length; i++) this.listeners[i](ev);
    }
  };
  WS.Koto = Koto;

  /* ---------- ratchet hinge: one step per pluck ---------- */
  function Ratchet(obj, axis, stepDur) { this.obj = obj; this.axis = axis || 'x'; this.angle = 0; this.from = 0; this.to = 0; this.t = 1; this.dur = stepDur || .32; }
  Ratchet.prototype.step = function (to) { this.from = this.angle; this.to = to; this.t = 0; };
  Ratchet.prototype.set = function (a) { this.angle = this.from = this.to = a; this.t = 1; this.obj.rotation[this.axis] = a; };
  Ratchet.prototype.update = function (dt) {
    if (this.t < 1) { this.t = Math.min(1, this.t + dt / this.dur); var k = this.t < 1 ? WS.easeOut(this.t) : 1; this.angle = WS.lerp(this.from, this.to, k); }
    this.obj.rotation[this.axis] = this.angle;
  };
  Ratchet.prototype.moving = function () { return this.t < 1; };
  WS.Ratchet = Ratchet;

  /* ---------- corridor stretch (dolly zoom) ---------- */
  /** world z = A + (levelZ - B) * s. Re-anchoring on the player keeps the player's level position fixed while s changes. */
  function Stretch() { this.s = 1; this.A = 0; this.B = 0; }
  Stretch.prototype.toWorld = function (zl) { return this.A + (zl - this.B) * this.s; };
  Stretch.prototype.toLevel = function (zw) { return this.B + (zw - this.A) / this.s; };
  Stretch.prototype.setScale = function (s, playerWorldZ) { var pl = this.toLevel(playerWorldZ); this.B = pl; this.A = playerWorldZ; this.s = s; };
  /** apply to a group built in level coords: group.position.z/scale.z */
  Stretch.prototype.applyTo = function (group) { group.scale.z = this.s; group.position.z = this.A - this.B * this.s; };
  /** FOV (deg) that keeps a target at levelDist the same apparent size when it is really at levelDist*s */
  WS.dollyFov = function (fov0, s, minFov) { var f = 2 * Math.atan(Math.tan(fov0 * Math.PI / 360) / s) * 180 / Math.PI; return Math.max(minFov || 18, f); };
  WS.Stretch = Stretch;

  /* ---------- rigid xz transform for seamless loops ---------- */
  /** matches Object3D rotation.y = theta then position = (tx, tz) */
  function Rigid(theta, tx, tz) { this.theta = theta; this.tx = tx; this.tz = tz; this.c = Math.cos(theta); this.s = Math.sin(theta); }
  Rigid.prototype.apply = function (p) { var x = p.x * this.c + p.z * this.s + this.tx, z = -p.x * this.s + p.z * this.c + this.tz; p.x = x; p.z = z; return p; };
  Rigid.prototype.invert = function (p) { var qx = p.x - this.tx, qz = p.z - this.tz; p.x = qx * this.c - qz * this.s; p.z = qx * this.s + qz * this.c; return p; };
  Rigid.prototype.place = function (obj) { obj.rotation.y = this.theta; obj.position.x = this.tx; obj.position.z = this.tz; };
  Rigid.prototype.inverse = function () { var r = new Rigid(-this.theta, 0, 0); var t = { x: -this.tx, z: -this.tz }; r.apply(t); r.tx = t.x; r.tz = t.z; return r; };
  WS.Rigid = Rigid;

  /* ---------- walkable surface profile (gravity turns) ---------- */
  /**
   * segs: [{line:[y0,z0,y1,z1], n:[ny,nz]}, {arc:[cy,cz,r,a0,a1]}]  (arcs are concave; normal points to the centre)
   * at(s) -> {y,z,ny,nz,ty,tz,seg}
   */
  function Profile(segs) {
    this.segs = []; var acc = 0;
    for (var i = 0; i < segs.length; i++) {
      var g = segs[i], len;
      if (g.line) len = Math.hypot(g.line[2] - g.line[0], g.line[3] - g.line[1]);
      else len = Math.abs(g.arc[4] - g.arc[3]) * g.arc[2];
      this.segs.push({ def: g, s0: acc, len: len, arc: !!g.arc }); acc += len;
    }
    this.length = acc;
  }
  Profile.prototype.segAt = function (s) { for (var i = 0; i < this.segs.length; i++) if (s < this.segs[i].s0 + this.segs[i].len) return i; return this.segs.length - 1; };
  Profile.prototype.at = function (s) {
    s = WS.clamp(s, 0, this.length); var i = this.segAt(s), sg = this.segs[i], u = (s - sg.s0) / sg.len, d = sg.def, o = { seg: i };
    if (d.line) {
      var L = d.line; o.y = WS.lerp(L[0], L[2], u); o.z = WS.lerp(L[1], L[3], u);
      o.ty = (L[2] - L[0]) / sg.len; o.tz = (L[3] - L[1]) / sg.len; o.ny = d.n[0]; o.nz = d.n[1];
    } else {
      var a = d.arc, ang = WS.lerp(a[3], a[4], u), sg2 = a[4] > a[3] ? 1 : -1;
      o.y = a[0] + a[2] * Math.cos(ang); o.z = a[1] + a[2] * Math.sin(ang);
      o.ny = -Math.cos(ang); o.nz = -Math.sin(ang); o.ty = -Math.sin(ang) * sg2; o.tz = Math.cos(ang) * sg2;
    }
    return o;
  };
  WS.Profile = Profile;

  /* ---------- first-person controller ---------- */
  function Controller(camera, dom) {
    var self = this;
    this.camera = camera; this.dom = dom;
    this.pos = new THREE.Vector3(); this.yaw = 0; this.pitch = 0; this.roll = 0; this.eye = 1.62; this.speed = 3.0;
    this.keys = {}; this.auto = null; this.locked = false; this.drag = null; this.enabled = true;
    this.frame = new THREE.Quaternion(); this.up = new THREE.Vector3(0, 1, 0); this.fovBase = 70;
    this.onGesture = null;
    var _e = new THREE.Euler(0, 0, 0, 'YXZ'), _q = new THREE.Quaternion();
    this._e = _e; this._q = _q;
    global.addEventListener('keydown', function (e) { self.keys[e.code] = true; if (self.onGesture) self.onGesture(); });
    global.addEventListener('keyup', function (e) { self.keys[e.code] = false; });
    global.addEventListener('blur', function () { self.keys = {}; });
    dom.addEventListener('mousedown', function (e) {
      if (self.onGesture) self.onGesture();
      if (!self.locked) {
        self.drag = { x: e.clientX, y: e.clientY };
        try { var r = dom.requestPointerLock && dom.requestPointerLock(); if (r && r.catch) r.catch(function () { /* drag fallback */ }); } catch (err) { /* drag fallback */ }
      }
    });
    global.addEventListener('mouseup', function () { self.drag = null; });
    document.addEventListener('pointerlockchange', function () { self.locked = document.pointerLockElement === dom; if (self.locked) self.drag = null; });
    global.addEventListener('mousemove', function (e) {
      if (self.locked) self.look(e.movementX, e.movementY);
      else if (self.drag) { self.look((e.clientX - self.drag.x) * 1.4, (e.clientY - self.drag.y) * 1.4); self.drag.x = e.clientX; self.drag.y = e.clientY; }
    });
    dom.addEventListener('touchstart', function (e) { var t = e.touches[0]; self.drag = { x: t.clientX, y: t.clientY }; if (self.onGesture) self.onGesture(); }, { passive: true });
    dom.addEventListener('touchmove', function (e) { var t = e.touches[0]; if (self.drag) { self.look((t.clientX - self.drag.x) * 1.6, (t.clientY - self.drag.y) * 1.6); self.drag.x = t.clientX; self.drag.y = t.clientY; } }, { passive: true });
    dom.addEventListener('touchend', function () { self.drag = null; });
  }
  Controller.prototype.look = function (dx, dy) {
    if (!this.enabled) return;
    this.yaw -= dx * .0022; this.pitch = WS.clamp(this.pitch - dy * .0022, -1.45, 1.45);
  };
  /** returns {f, r, run}: forward/right input in [-1,1] */
  Controller.prototype.input = function () {
    if (this.auto) return { f: this.auto.f || 0, r: this.auto.r || 0, run: false };
    if (!this.enabled) return { f: 0, r: 0, run: false };
    var k = this.keys, f = 0, r = 0;
    if (k.KeyW || k.ArrowUp) f += 1; if (k.KeyS || k.ArrowDown) f -= 1;
    if (k.KeyD || k.ArrowRight) r += 1; if (k.KeyA || k.ArrowLeft) r -= 1;
    var gp = global.navigator.getGamepads ? global.navigator.getGamepads()[0] : null;
    if (gp && gp.axes && gp.axes.length >= 4) {
      if (Math.abs(gp.axes[1]) > .15) f -= gp.axes[1]; if (Math.abs(gp.axes[0]) > .15) r += gp.axes[0];
      if (Math.abs(gp.axes[2]) > .15 || Math.abs(gp.axes[3]) > .15) this.look(gp.axes[2] * 14, gp.axes[3] * 10);
    }
    var l = Math.hypot(f, r); if (l > 1) { f /= l; r /= l; }
    return { f: f, r: r, run: !!(k.ShiftLeft || k.ShiftRight) };
  };
  /** flat ground step: returns desired world delta {x,z} for this frame */
  Controller.prototype.flatDelta = function (dt) {
    var i = this.input(), sp = this.speed * (i.run ? 1.6 : 1) * dt, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    return { x: (-sy * i.f + cy * i.r) * sp, z: (-cy * i.f - sy * i.r) * sp };
  };
  /** surface-frame step: returns {ds (along tangent), dx (lateral)} */
  Controller.prototype.surfaceDelta = function (dt) {
    var i = this.input(), sp = this.speed * (i.run ? 1.6 : 1) * dt, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    return { ds: (cy * i.f + sy * i.r) * sp, dx: (-sy * i.f + cy * i.r) * sp };
  };
  /** set the gravity frame from tangent T and normal N (world vectors); right = T x N */
  Controller.prototype.setFrame = function (T, N) {
    var R = new THREE.Vector3().crossVectors(T, N).normalize(), Z = T.clone().negate();
    var m = new THREE.Matrix4().makeBasis(R, N, Z); this.frame.setFromRotationMatrix(m); this.up.copy(N);
  };
  Controller.prototype.flatFrame = function () { this.frame.identity(); this.up.set(0, 1, 0); };
  Controller.prototype.apply = function (shake) {
    var c = this.camera;
    c.position.copy(this.pos).addScaledVector(this.up, this.eye);
    if (shake) { c.position.x += (Math.random() - .5) * shake; c.position.y += (Math.random() - .5) * shake; }
    this._e.set(this.pitch, this.yaw, this.roll, 'YXZ'); this._q.setFromEuler(this._e);
    c.quaternion.copy(this.frame).multiply(this._q);
  };
  WS.Controller = Controller;

  /* ---------- a vibrating string (the visible mechanism) ---------- */
  WS.makeString = function (x0, x1, y, z, color) {
    var n = 48, pts = [];
    for (var i = 0; i <= n; i++) pts.push(new THREE.Vector3(WS.lerp(x0, x1, i / n), y, z));
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    var mat = new THREE.LineBasicMaterial({ color: color || WS.PAL.red });
    var line = new THREE.Line(geo, mat);
    line.userData = { n: n, y: y, amp: 0, t: 0, base: new THREE.Color(color || WS.PAL.red) };
    line.pluck = function (a) { line.userData.amp = a || .6; line.userData.t = 0; };
    line.tick = function (dt) {
      var u = line.userData; u.t += dt; u.amp *= Math.exp(-dt * 2.2);
      var p = geo.attributes.position;
      for (var i = 0; i <= u.n; i++) p.setY(i, u.y + u.amp * Math.sin(Math.PI * i / u.n) * Math.sin(u.t * 46));
      p.needsUpdate = true;
      mat.color.copy(u.base).lerp(new THREE.Color(0xffffff), WS.clamp(u.amp * 1.3, 0, 1));
    };
    return line;
  };

  global.WorldShift = WS;
})(window);
