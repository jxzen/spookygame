/* HorrorFX: screen-space and atmosphere effects for the proto1 horror prototypes.
 * three.js r128, plain script (no modules). Load order:
 *   three.min.js (r128)
 *   examples/js/shaders/CopyShader.js
 *   examples/js/postprocessing/EffectComposer.js, RenderPass.js, ShaderPass.js
 *   this file
 * API (see docs/design/fx-spec.md):
 *   HorrorFX.init(renderer, scene, camera, opts)
 *   HorrorFX.setFear(0..1)        fear input (monster proximity, events)
 *   HorrorFX.spike(0..1)           one-shot fear spike: radial blur, warp, static burst
 *   HorrorFX.update(dt)            per frame, before render
 *   HorrorFX.render()              renders scene through the post chain
 *   HorrorFX.setSize(w, h)
 *   HorrorFX.enable(name, on)      names: HorrorFX.EFFECTS
 *   HorrorFX.setAccessibility({ reduceFlashing, reduceMotion })
 *   HorrorFX.patch(object3D or material, { wet })   height fog (+ wet sheen) on built-in materials
 *   HorrorFX.addFlicker(light, { pattern, base, emissive, fearScale, proximity, style })
 *   HorrorFX.setFlashlight(spotLight)   flashlight flicker + lights the rain
 *   HorrorFX.addShaft(spotLight, { opacity })  fake volumetric cone for hard lamp light
 *   HorrorFX.fog / HorrorFX.rain / HorrorFX.post  live parameter objects
 */
(function () {
  "use strict";
  const T = window.THREE;
  if (!T) { console.error("HorrorFX: THREE missing"); return; }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const expWait = rate => rate <= 0 ? 1e9 : -Math.log(1 - Math.random()) / rate;

  const EFFECTS = ["heightFog", "rain", "splashes", "wet", "shafts", "grain", "static", "tear", "chroma",
    "vignette", "heartbeat", "radial", "desat", "contrast", "sway", "phantom", "flicker"];

  /* ------------------------------------------------------------------ */
  /* Flash limiter: WCAG 2.3.1, never more than 3 flashes in any 1 s.     */
  /* Every effect that can make a big luminance swing asks it first.      */
  /* ------------------------------------------------------------------ */
  const limiter = {
    times: [], max: 3, minGap: 0.12, now: 0, log: [],
    allow() {
      const t = this.now;
      this.times = this.times.filter(x => t - x < 1);
      const last = this.times.length ? this.times[this.times.length - 1] : -9;
      if (this.times.length >= this.max || t - last < this.minGap) return false;
      this.times.push(t); this.log.push(t); return true;
    },
    countLastSecond() { const t = this.now; this.log = this.log.filter(x => t - x < 1); return this.log.length; }
  };

  /* ------------------------------------------------------------------ */
  /* Exponential height fog (Unreal-style), patched into three's chunks   */
  /* density(h) = d * exp(-k (h - h0)); integrated analytically along the */
  /* view ray; start distance; max opacity; slow drifting density noise.  */
  /* ------------------------------------------------------------------ */
  const fogU = {
    hfOn: { value: 1 }, hfDensity: { value: 0.06 }, hfFalloff: { value: 0.28 }, hfHeight: { value: 0 },
    hfStart: { value: 1.5 }, hfMaxOpacity: { value: 0.97 }, hfTime: { value: 0 }, hfNoiseAmt: { value: 0.35 },
    hfWind: { value: new T.Vector2(0.6, 0.15) },
    wetOn: { value: 1 }, wetAmount: { value: 0.85 }
  };
  const GLSL_NOISE = `
    float hfHash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float hfNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hfHash(i), hfHash(i+vec2(1.,0.)), f.x), mix(hfHash(i+vec2(0.,1.)), hfHash(i+vec2(1.,1.)), f.x), f.y); }`;
  const FOG_PARS_FRAG = `
    #include <fog_pars_fragment>
    varying vec3 vHFWorld;
    uniform float hfOn, hfDensity, hfFalloff, hfHeight, hfStart, hfMaxOpacity, hfTime, hfNoiseAmt;
    uniform vec2 hfWind;
    uniform float wetOn, wetAmount;
    ${GLSL_NOISE}`;
  const FOG_FRAG = `
    #ifdef USE_FOG
      vec3 hfRay = vHFWorld - cameraPosition;
      float hfLen = length(hfRay);
      float hfF;
      if (hfOn > 0.5) {
        float kd = clamp(hfFalloff * hfRay.y, -30.0, 60.0);
        float lineInt = abs(kd) > 0.002 ? (1.0 - exp(-kd)) / kd : 1.0 - 0.5 * kd;
        float camTerm = hfDensity * exp(-hfFalloff * (cameraPosition.y - hfHeight));
        float n = hfNoise(vHFWorld.xz * 0.07 + hfWind * hfTime) * 0.65 + hfNoise(vHFWorld.xz * 0.23 - hfWind * hfTime * 1.7) * 0.35;
        float integral = camTerm * lineInt * max(hfLen - hfStart, 0.0) * (1.0 + hfNoiseAmt * (n - 0.5) * 2.0);
        hfF = min(1.0 - exp(-max(integral, 0.0)), hfMaxOpacity);
      } else {
        #ifdef FOG_EXP2
          hfF = 1.0 - exp(-fogDensity * fogDensity * fogDepth * fogDepth);
        #else
          hfF = smoothstep(fogNear, fogFar, fogDepth);
        #endif
      }
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, hfF);
    #endif`;
  const VERT_PARS = `#include <fog_pars_vertex>
    varying vec3 vHFWorld;`;
  /* world position from mvPosition without inverse(): view = [R|t], world = R^T (v - t) */
  const VERT_MAIN = `#include <fog_vertex>
    { vec3 hfd = mvPosition.xyz - viewMatrix[3].xyz;
      vHFWorld = vec3(dot(viewMatrix[0].xyz, hfd), dot(viewMatrix[1].xyz, hfd), dot(viewMatrix[2].xyz, hfd)); }`;
  /* wet: puddle mask from world noise lowers roughness, darkens albedo, rain ripple rings bend the normal */
  const WET_COLOR = `#include <color_fragment>
    float wetMask = 0.0;
    if (wetOn > 0.5) {
      float pud = smoothstep(0.42, 0.62, hfNoise(vHFWorld.xz * 0.35) * 0.7 + hfNoise(vHFWorld.xz * 1.3) * 0.3);
      wetMask = wetAmount * mix(0.55, 1.0, pud) * WET_SCALE;
      diffuseColor.rgb *= mix(1.0, 0.5, wetMask);
    }`;
  const WET_ROUGH = `#include <roughnessmap_fragment>
    roughnessFactor = mix(roughnessFactor, 0.12, wetMask);`;
  const WET_NORMAL = `#include <normal_fragment_maps>
    if (wetOn > 0.5 && WET_RIPPLE > 0.5) {
      vec2 cell = floor(vHFWorld.xz * 2.2); vec2 fc = fract(vHFWorld.xz * 2.2) - 0.5;
      float ph = hfHash(cell); vec2 o = vec2(hfHash(cell + 7.1), hfHash(cell + 3.3)) - 0.5;
      vec2 q = fc - o * 0.5; float r = length(q); float life = fract(hfTime * 1.3 + ph);
      float ring = exp(-pow((r - life * 0.45) * 28.0, 2.0)) * (1.0 - life);
      normal = normalize(normal + vec3(q / max(r, 1e-3) * ring * 0.6 * wetMask, 0.0));
    }`;

  function patchMaterial(mat, o) {
    if (!mat || mat.userData.hfxPatched) return;
    mat.userData.hfxPatched = true;
    const wet = o && o.wet ? o.wet : 0;
    const ripple = o && o.ripple ? 1 : 0;
    const isStd = mat.isMeshStandardMaterial;
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = function (shader, r) {
      if (prev) prev.call(this, shader, r);
      Object.assign(shader.uniforms, fogU);
      shader.vertexShader = shader.vertexShader
        .replace("#include <fog_pars_vertex>", VERT_PARS)
        .replace("#include <fog_vertex>", VERT_MAIN);
      let fs = shader.fragmentShader
        .replace("#include <fog_pars_fragment>", FOG_PARS_FRAG)
        .replace("#include <fog_fragment>", FOG_FRAG);
      if (wet && isStd) {
        fs = fs.replace("#include <color_fragment>", WET_COLOR.replace("WET_SCALE", wet.toFixed(3)))
          .replace("#include <roughnessmap_fragment>", WET_ROUGH)
          .replace("#include <normal_fragment_maps>", WET_NORMAL.replace("WET_RIPPLE", ripple.toFixed(1)));
      }
      shader.fragmentShader = fs;
    };
    const key = "hfx" + wet + ripple;
    const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
    mat.customProgramCacheKey = () => key + (prevKey ? prevKey() : "");
    mat.needsUpdate = true;
  }
  function patch(target, o) {
    if (!target) return;
    if (target.isMaterial) return patchMaterial(target, o);
    target.traverse(ob => {
      if (!ob.material || ob.userData.hfxSkip) return;
      (Array.isArray(ob.material) ? ob.material : [ob.material]).forEach(m => { if (m.fog !== false && !m.isShaderMaterial) patchMaterial(m, o); });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Lights that colour the rain: point lamps + the flashlight cone.      */
  /* ------------------------------------------------------------------ */
  const MAXL = 6;
  const lightU = {
    uLPos: { value: Array.from({ length: MAXL }, () => new T.Vector3(0, -999, 0)) },
    uLCol: { value: Array.from({ length: MAXL }, () => new T.Vector3()) },
    uLRad: { value: new Array(MAXL).fill(1) },
    uSpotPos: { value: new T.Vector3() }, uSpotDir: { value: new T.Vector3(0, 0, -1) },
    uSpotCos: { value: new T.Vector2(0.9, 0.95) }, uSpotCol: { value: new T.Vector3() }, uSpotRange: { value: 30 },
    uAmb: { value: 0.05 }, uFogFade: { value: 0.045 }
  };
  const GLSL_LIGHT = `
    uniform vec3 uLPos[${MAXL}]; uniform vec3 uLCol[${MAXL}]; uniform float uLRad[${MAXL}];
    uniform vec3 uSpotPos, uSpotDir, uSpotCol; uniform vec2 uSpotCos; uniform float uSpotRange, uAmb, uFogFade;
    vec3 rainLight(vec3 p){
      vec3 c = vec3(uAmb);
      for (int i = 0; i < ${MAXL}; i++) { float d = length(uLPos[i] - p); float f = clamp(1.0 - d / uLRad[i], 0.0, 1.0); c += uLCol[i] * f * f; }
      vec3 sd = p - uSpotPos; float sl = length(sd);
      float cone = smoothstep(uSpotCos.x, uSpotCos.y, dot(sd / max(sl, 1e-4), uSpotDir));
      c += uSpotCol * cone * clamp(1.0 - sl / uSpotRange, 0.0, 1.0) * 1.6;
      return c;
    }`;

  /* ------------------------------------------------------------------ */
  /* Rain: camera-wrapped GPU streaks, lit by lamps and flashlight.       */
  /* ------------------------------------------------------------------ */
  function makeRain(count) {
    const seeds = new Float32Array(count * 4 * 3), corner = new Float32Array(count * 4 * 3), idx = [];
    for (let i = 0; i < count; i++) {
      const sx = Math.random(), sy = Math.random(), sz = Math.random(), r = Math.random();
      const cs = [[-1, 0], [1, 0], [-1, 1], [1, 1]];
      for (let k = 0; k < 4; k++) {
        const j = (i * 4 + k) * 3;
        seeds[j] = sx; seeds[j + 1] = sy; seeds[j + 2] = sz;
        corner[j] = cs[k][0]; corner[j + 1] = cs[k][1]; corner[j + 2] = r;
      }
      const b = i * 4; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(seeds, 3));
    g.setAttribute("aCorner", new T.BufferAttribute(corner, 3));
    g.setIndex(idx);
    const m = new T.ShaderMaterial({
      uniforms: Object.assign({
        uTime: { value: 0 }, uSpeed: { value: 11 }, uLen: { value: 0.55 }, uWidth: { value: 0.006 },
        uBox: { value: new T.Vector3(28, 16, 28) }, uCenter: { value: new T.Vector3() }, uWind: { value: new T.Vector2(1.2, 0.4) },
        uGround: { value: 0 }, uOpacity: { value: 0.55 }
      }, lightU),
      vertexShader: `
        uniform float uTime, uSpeed, uLen, uWidth, uGround; uniform vec3 uBox, uCenter; uniform vec2 uWind;
        attribute vec3 aCorner; varying float vA; varying vec3 vW; varying float vSide;
        void main(){
          vec3 s = position; float rnd = aCorner.z;
          float sp = uSpeed * (0.85 + 0.3 * rnd);
          float fallen = mod(s.y * uBox.y + uTime * sp, uBox.y);
          float y = uGround + uBox.y - fallen;
          vec2 xz = (s.xz - 0.5) * uBox.xz + uWind * fallen / sp;
          xz = uCenter.xz + mod(xz - uCenter.xz + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5;
          vec3 head = vec3(xz.x, y, xz.y);
          vec3 dir = normalize(vec3(uWind.x, -sp, uWind.y));
          vec3 p = head - dir * uLen * (0.6 + 0.8 * rnd) * aCorner.y;
          float dist = length(cameraPosition - p);
          float w = max(uWidth, dist * 0.0011);
          vec3 side = normalize(cross(dir, normalize(cameraPosition - p)));
          p += side * w * aCorner.x;
          vW = p; vSide = aCorner.x; vA = (1.0 - aCorner.y * 0.85) * (uWidth / w);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float uOpacity; varying float vA; varying vec3 vW; varying float vSide;
        ${GLSL_LIGHT}
        void main(){
          float e = 1.0 - abs(vSide);
          float a = e * e * vA * uOpacity * exp(-length(vW - cameraPosition) * uFogFade);
          gl_FragColor = vec4(rainLight(vW), a);
        }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending
    });
    const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.userData.hfxSkip = true;
    return mesh;
  }
  function makeSplashes(count) {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { p[i * 3] = Math.random(); p[i * 3 + 1] = Math.random(); p[i * 3 + 2] = Math.random(); }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(p, 3));
    const m = new T.ShaderMaterial({
      uniforms: Object.assign({ uTime: { value: 0 }, uRate: { value: 2.4 }, uCenter: { value: new T.Vector3() }, uRadius: { value: 11 },
        uGround: { value: 0.01 }, uSize: { value: 0.22 }, uPx: { value: 720 }, uOpacity: { value: 0.8 } }, lightU),
      vertexShader: `
        uniform float uTime, uRate, uRadius, uGround, uSize, uPx; uniform vec3 uCenter;
        varying float vLife; varying vec3 vW; varying float vFlat;
        float h11(float n){ return fract(sin(n) * 43758.5453); }
        void main(){
          float cyc = uTime * uRate + position.z * 7.0; float id = floor(cyc); vLife = fract(cyc);
          vec2 r = vec2(h11(id * 1.7 + position.x * 91.3), h11(id * 3.1 + position.y * 57.9));
          vec2 xz = uCenter.xz + (r - 0.5) * uRadius * 2.0;
          vec3 p = vec3(xz.x, uGround, xz.y); vW = p;
          vFlat = clamp(abs(normalize(cameraPosition - p).y), 0.12, 1.0);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * (0.35 + vLife) * uPx / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uOpacity; varying float vLife; varying vec3 vW; varying float vFlat;
        ${GLSL_LIGHT}
        void main(){
          vec2 q = gl_PointCoord * 2.0 - 1.0; q.y /= vFlat;
          float d = length(q); if (d > 1.0) discard;
          float ring = smoothstep(0.18, 0.0, abs(d - vLife)) * (1.0 - vLife);
          float crown = smoothstep(0.35, 0.0, d) * smoothstep(0.25, 0.0, vLife);
          float a = (ring + crown) * uOpacity * exp(-length(vW - cameraPosition) * uFogFade * 1.5);
          gl_FragColor = vec4(rainLight(vW + vec3(0.0, 0.3, 0.0)), a);
        }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending
    });
    const pts = new T.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 4; pts.userData.hfxSkip = true;
    return pts;
  }

  /* ------------------------------------------------------------------ */
  /* Light shafts: additive cone meshes for hard, noir lamp light.         */
  /* ------------------------------------------------------------------ */
  const shafts = [];
  function addShaft(light, o) {
    o = o || {};
    const len = o.length || light.distance || 8, ang = light.angle || 0.5;
    const geo = new T.CylinderGeometry(0.04, Math.tan(ang) * len, len, 40, 12, true);
    geo.translate(0, -len / 2, 0);
    const mat = new T.ShaderMaterial({
      uniforms: { uCol: { value: new T.Color(o.color !== undefined ? o.color : light.color) }, uI: { value: 1 }, uOpacity: { value: o.opacity || 0.14 },
        uLen: { value: len }, uTime: fogU.hfTime },
      vertexShader: `
        uniform float uLen; varying float vAlong; varying vec3 vN, vV, vW;
        void main(){ vAlong = clamp(-position.y / uLen, 0.0, 1.0);
          vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
          vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform vec3 uCol; uniform float uI, uOpacity, uTime; varying float vAlong; varying vec3 vN, vV, vW;
        ${GLSL_NOISE}
        void main(){
          float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
          float fall = pow(1.0 - vAlong, 1.4) * smoothstep(0.0, 0.08, vAlong);
          float n = 0.7 + 0.6 * hfNoise(vW.xz * 3.0 + vec2(0.0, uTime * 0.6) + vW.y * 1.7);
          gl_FragColor = vec4(uCol, facing * fall * n * uOpacity * uI);
        }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
    });
    const mesh = new T.Mesh(geo, mat); mesh.renderOrder = 6; mesh.userData.hfxSkip = true;
    S.scene.add(mesh);
    const sh = { light, mesh, base: o.base || light.intensity || 1 };
    shafts.push(sh); placeShaft(sh);
    return sh;
  }
  const _a = new T.Vector3(), _b = new T.Vector3(), _q = new T.Quaternion(), _down = new T.Vector3(0, -1, 0);
  function placeShaft(sh) {
    sh.light.getWorldPosition(_a); sh.light.target.getWorldPosition(_b);
    _b.sub(_a).normalize(); _q.setFromUnitVectors(_down, _b);
    sh.mesh.position.copy(_a); sh.mesh.quaternion.copy(_q);
  }

  /* ------------------------------------------------------------------ */
  /* Light flicker controller                                             */
  /* A flicker is a dip: depth (0..1), duration. Rates rise with fear.    */
  /* Dips deeper than 25 % are flashes and must pass the limiter.         */
  /* ------------------------------------------------------------------ */
  const PATTERNS = {
    steady:     { rate0: 0,    rateF: 0,   depth: [0.3, 0.6], dur: [0.05, 0.1], multi: 0,   hum: 0 },
    buzz:       { rate0: 0.12, rateF: 1.6, depth: [0.35, 0.95], dur: [0.03, 0.11], multi: 0.55, hum: 0.025 },
    dying:      { rate0: 0.45, rateF: 1.6, depth: [0.75, 1.0], dur: [0.08, 0.7], multi: 0.7, hum: 0.04, dim: 0.75 },
    flashlight: { rate0: 0,    rateF: 2.2, depth: [0.5, 0.97], dur: [0.04, 0.16], multi: 0.45, hum: 0, fearPow: 2 },
    candle:     { rate0: 1.5,  rateF: 2,   depth: [0.08, 0.22], dur: [0.06, 0.2], multi: 0.3, hum: 0.06 }
  };
  const flickers = [];
  function addFlicker(light, o) {
    o = o || {};
    const f = {
      light, pattern: o.pattern || "buzz", base: o.base !== undefined ? o.base : light.intensity,
      emissive: o.emissive ? [].concat(o.emissive) : [], emBase: [],
      fearScale: o.fearScale !== undefined ? o.fearScale : 1, proximity: o.proximity || null,
      style: o.style || null, styleT: Math.random() * 10, styleLast: 1,
      k: 1, dipT: 0, dipDur: 0.1, dipDepth: 0, next: rand(0.2, 3), queue: 0, kill: 1, phase: Math.random() * 10
    };
    f.emBase = f.emissive.map(m => m.emissiveIntensity !== undefined ? m.emissiveIntensity : 1);
    flickers.push(f); return f;
  }
  function updateFlicker(f, dt) {
    const P = PATTERNS[f.pattern] || PATTERNS.buzz;
    const prox = f.proximity ? clamp(f.proximity(), 0, 1) : 0;
    const fe = clamp(S.fear * f.fearScale + prox, 0, 1);
    const fx = P.fearPow ? Math.pow(fe, P.fearPow) : fe;
    let k = 1;
    if (!S.on.flicker) { f.k = 1; applyFlicker(f, 1); return; }
    if (f.style) {
      /* Quake-style light string: a = dark, m = normal, z = double, 10 steps / s */
      f.styleT += dt * 10;
      const ch = f.style.charCodeAt(Math.floor(f.styleT) % f.style.length) - 97;
      let v = clamp(ch / 12, 0, 2);
      if (Math.abs(v - f.styleLast) > 0.25 && !limiter.allow()) v = f.styleLast;
      if (S.acc.reduceFlashing) v = lerp(f.styleLast, v, 0.25);
      f.styleLast = v; k = v;
    } else {
      if (f.dipT > 0) {
        f.dipT -= dt;
        const x = 1 - f.dipT / f.dipDur;
        const env = x < 0.15 ? x / 0.15 : x > 0.8 ? (1 - x) / 0.2 : 1; /* fast attack, short release */
        k = 1 - f.dipDepth * (S.acc.reduceFlashing ? env : 1);
        if (f.dipT <= 0 && f.queue > 0) { f.queue--; f.next = rand(0.03, 0.09); }
      } else {
        f.next -= dt;
        if (f.next <= 0) {
          let depth = rand(P.depth[0], P.depth[1]) * (0.6 + 0.4 * fe);
          let dur = rand(P.dur[0], P.dur[1]);
          if (S.acc.reduceFlashing) { depth = Math.min(depth, 0.35); dur = Math.max(dur, 0.25); }
          if (depth > 0.25 && !limiter.allow()) { f.next = 0.15; }
          else {
            f.dipDepth = depth; f.dipDur = f.dipT = dur;
            if (f.queue === 0 && Math.random() < P.multi * (0.5 + fe)) f.queue = 1 + Math.floor(Math.random() * 3);
            f.next = f.queue > 0 ? 0 : expWait(P.rate0 + P.rateF * fx);
          }
        }
      }
      if (P.dim) k *= lerp(1, P.dim, fe);
      if (P.hum) k *= 1 - P.hum * (0.5 + 0.5 * Math.sin(S.time * 46 + f.phase)) * (0.5 + fe);
    }
    f.k = lerp(f.k, k, 1 - Math.exp(-dt * 60));
    applyFlicker(f, f.k * f.kill);
  }
  function applyFlicker(f, k) {
    f.light.intensity = f.base * k;
    f.emissive.forEach((m, i) => { if (m.emissiveIntensity !== undefined) m.emissiveIntensity = f.emBase[i] * k; else if (m.opacity !== undefined) m.opacity = k; });
  }

  /* ------------------------------------------------------------------ */
  /* Post: one full-screen pass.                                          */
  /* ------------------------------------------------------------------ */
  const HorrorShader = {
    uniforms: {
      tDiffuse: { value: null }, uRes: { value: new T.Vector2(1280, 720) }, uTime: { value: 0 }, uFear: { value: 0 },
      uGrain: { value: 1 }, uStatic: { value: 1 }, uTear: { value: 1 }, uChroma: { value: 1 }, uVignette: { value: 1 },
      uRadial: { value: 1 }, uDesat: { value: 1 }, uContrast: { value: 1 }, uSway: { value: 1 }, uPhantom: { value: 1 },
      uBeat: { value: 0 }, uSpike: { value: 0 }, uBurst: { value: 0 }, uTearY: { value: 0.5 }, uPhX: { value: 0.1 }, uPhA: { value: 0 },
      uRedKeep: { value: 1 }, uSoftStatic: { value: 0 }
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uFear;
      uniform float uGrain, uStatic, uTear, uChroma, uVignette, uRadial, uDesat, uContrast, uSway, uPhantom;
      uniform float uBeat, uSpike, uBurst, uTearY, uPhX, uPhA, uRedKeep, uSoftStatic;
      varying vec2 vUv;
      float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      vec3 tap(vec2 uv, vec2 dir, float ca){
        return vec3(texture2D(tDiffuse, uv + dir * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir * ca).b);
      }
      void main(){
        float asp = uRes.x / uRes.y; vec2 c = vec2(0.5);
        vec2 uv = vUv;
        /* sway: slow screen roll + breathing zoom (Amnesia low-sanity tilt), warp on spikes */
        float ang = uSway * uFear * (sin(uTime * 0.63) * 0.014 + sin(uTime * 1.71) * 0.005);
        float zoom = 1.0 - uSway * uFear * (0.012 + 0.008 * sin(uTime * 0.9)) - uRadial * uSpike * 0.04;
        vec2 d = uv - c; d.x *= asp;
        d = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * d * zoom;
        float rr = length(d);
        d *= 1.0 + uRadial * uSpike * 0.12 * rr * rr * sin(uTime * 9.0);   /* barrel wobble */
        d.x /= asp; uv = c + d;
        /* scanline tear: one rising band of row jitter + small whole-frame jitter on bursts */
        float row = floor(uv.y * uRes.y / 2.0);
        float jit = h12(vec2(row, floor(uTime * 24.0))) - 0.5;
        float band = smoothstep(0.07, 0.0, abs(uv.y - uTearY));
        float tearAmt = uTear * (uFear * uFear * 0.6 + uBurst);
        uv.x += tearAmt * (band * 0.05 * jit + 0.004 * jit * uBurst);
        uv.y += uTear * uBurst * 0.006 * step(0.85, h12(vec2(floor(uTime * 30.0), 3.0)));
        /* chroma + radial blur */
        vec2 dir = uv - c;
        float ca = uChroma * (0.004 + uFear * 0.012 + uSpike * 0.02) * length(dir * vec2(asp, 1.0));
        float blur = uRadial * uSpike * 0.09;
        vec3 col;
        if (blur < 0.001) col = tap(uv, dir, ca);
        else { col = vec3(0.0); float ws = 0.0;
          for (int i = 0; i < 10; i++) { float f = float(i) / 9.0; float w = 1.0 - f * 0.7;
            col += tap(c + dir * (1.0 - blur * f), dir, ca) * w; ws += w; }
          col /= ws; }
        /* desaturate, keep red */
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        float redness = smoothstep(0.04, 0.18, col.r - max(col.g, col.b));
        vec3 grey = vec3(lum);
        vec3 keptRed = mix(grey, vec3(col.r * 1.1, col.g * 0.55, col.b * 0.55), redness * uRedKeep);
        col = mix(col, keptRed, uDesat);
        /* noir contrast: S-curve that deepens with fear */
        vec3 sc = col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0));
        col = mix(col, sc, uContrast * (0.35 + 0.35 * uFear));
        /* phantom: soft standing figure in the periphery, only at fear */
        vec2 pp = (vUv - vec2(uPhX, 0.44)) * vec2(asp, 1.0);
        float body = 1.0 - smoothstep(0.0, 0.05, length(vec2(pp.x * 2.0, max(abs(pp.y + 0.02) - 0.15, 0.0))) - 0.025);
        float head = 1.0 - smoothstep(0.0, 0.03, length(pp - vec2(0.0, 0.2)) - 0.028);
        col *= 1.0 - max(body, head) * uPhA * uPhantom * 0.9;
        /* vignette with heartbeat, edges bleed dark red with fear (Bunker) */
        float vd = length((vUv - c) * vec2(asp, 1.0));
        float inner = 0.98 - uFear * 0.38 - uBeat * (0.05 + 0.12 * uFear);
        float vig = 1.0 - smoothstep(inner - 0.7, inner, vd);
        float edge = (1.0 - vig) * uVignette;
        col *= mix(1.0, vig, uVignette);
        col = mix(col, col * vec3(1.0, 0.25, 0.22) + vec3(0.07, 0.0, 0.0) * (0.4 + 0.6 * uBeat), edge * uFear * 0.85);
        /* analog static: snow, scanlines, rolling bar. Rises with fear, spikes in bursts */
        lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        float sAmt = uStatic * clamp(uFear * uFear * 0.32 + uBurst * 0.6, 0.0, 0.85);
        vec2 sp = floor(vUv * uRes / 1.5);
        float snow = h12(sp + fract(uTime * 37.0) * vec2(113.0, 71.0));
        snow = mix(snow, snow * (lum * 2.5 + 0.08), uSoftStatic);
        float scan = 0.5 + 0.5 * sin(vUv.y * uRes.y * 1.4);
        float bar = smoothstep(0.0, 0.1, fract(vUv.y * 0.6 - uTime * 0.31)) * smoothstep(0.25, 0.1, fract(vUv.y * 0.6 - uTime * 0.31));
        col *= 1.0 - 0.12 * sAmt * scan;
        col = mix(col, vec3(snow), sAmt * 0.7);
        col += 0.05 * sAmt * bar * (1.0 - uSoftStatic);
        /* film grain, stronger in shadows */
        float g = h12(vUv * uRes + fract(uTime * 13.0) * 1000.0) - 0.5;
        col += g * uGrain * (0.06 + 0.07 * uFear) * (1.25 - lum);
        gl_FragColor = vec4(max(col, 0.0), 1.0);
      }`
  };

  /* ------------------------------------------------------------------ */
  /* State                                                                */
  /* ------------------------------------------------------------------ */
  const S = {
    ready: false, renderer: null, scene: null, camera: null, composer: null, pass: null,
    fear: 0, fearTarget: 0, fearSmoothed: 0, time: 0, spike: 0, burst: 0, burstT: 0, burstDur: 0.1, nextBurst: 2,
    beatPhase: 0, beat: 0, bpm: 60, tearY: 0.5, phantomT: 0, phantomNext: 6, phantomX: 0.1, phantomA: 0,
    bypass: false, flashlight: null, flashFlicker: null, rain: null, splashes: null,
    on: {}, acc: { reduceFlashing: false, reduceMotion: false }, onBeat: null, lastFear: 0
  };
  EFFECTS.forEach(e => S.on[e] = true);

  function init(renderer, scene, camera, opts) {
    opts = opts || {};
    S.renderer = renderer; S.scene = scene; S.camera = camera;
    if (!scene.fog || !scene.fog.isFogExp2) scene.fog = new T.FogExp2(scene.fog ? scene.fog.color.getHex() : 0x141416, 0.05);
    if (opts.fog) Object.keys(opts.fog).forEach(k => HFX.fog[k] = opts.fog[k]);
    S.rain = makeRain(opts.rainCount || 9000); scene.add(S.rain);
    S.splashes = makeSplashes(opts.splashCount || 700); scene.add(S.splashes);
    if (T.EffectComposer && T.RenderPass && T.ShaderPass) {
      S.composer = new T.EffectComposer(renderer);
      S.composer.addPass(new T.RenderPass(scene, camera));
      S.pass = new T.ShaderPass(HorrorShader);
      S.composer.addPass(S.pass);
    } else console.warn("HorrorFX: EffectComposer not loaded; post effects off");
    const sz = renderer.getSize(new T.Vector2());
    setSize(sz.x, sz.y);
    if (opts.patchScene !== false) patch(scene);
    S.ready = true;
    return HFX;
  }
  function setSize(w, h) {
    if (S.composer) S.composer.setSize(w, h);
    const pr = S.renderer.getPixelRatio();
    if (S.pass) S.pass.uniforms.uRes.value.set(w * pr, h * pr);
    if (S.splashes) S.splashes.material.uniforms.uPx.value = h * pr;
  }

  function setFear(f) { S.fearTarget = clamp(f, 0, 1); }
  function spike(a) { if (a === undefined) a = 1; S.spike = Math.max(S.spike, clamp(a, 0, 1)); triggerBurst(0.6 + 0.4 * a); }
  function triggerBurst(strength) {
    if (!S.on.static && !S.on.tear) return false;
    if (!limiter.allow()) return false;
    S.burstDur = S.burstT = rand(0.07, 0.2) * (S.acc.reduceFlashing ? 2.5 : 1);
    S.burstAmp = clamp(strength, 0, 1) * (S.acc.reduceFlashing ? 0.3 : 1);
    S.tearY = rand(0.1, 0.9);
    return true;
  }

  const _v = new T.Vector3(), _w = new T.Vector3();
  function update(dt) {
    if (!S.ready) return;
    dt = Math.min(dt, 0.1);
    S.time += dt; limiter.now = S.time;
    limiter.max = S.acc.reduceFlashing ? 1 : 3; limiter.minGap = S.acc.reduceFlashing ? 0.6 : 0.12;
    /* fear: fast attack, slow release; spike when it jumps */
    const up = S.fearTarget > S.fear;
    S.fear = lerp(S.fear, S.fearTarget, 1 - Math.exp(-dt * (up ? 6 : 1.2)));
    const rate = (S.fear - S.lastFear) / dt; S.lastFear = S.fear;
    if (rate > 1.2 && S.spike < 0.3) spike(clamp(rate / 4, 0.3, 1));
    S.spike *= Math.exp(-dt * 2.8);

    /* heartbeat: 58 -> 150 bpm, lub-dub */
    S.bpm = 58 + 92 * S.fear;
    const before = S.beatPhase;
    S.beatPhase += dt * S.bpm / 60;
    if (Math.floor(S.beatPhase) !== Math.floor(before) && S.onBeat) S.onBeat(S.bpm, S.fear);
    const ph = S.beatPhase % 1;
    S.beat = S.on.heartbeat ? (Math.exp(-Math.pow(ph / 0.055, 2)) + 0.6 * Math.exp(-Math.pow((ph - 0.2) / 0.055, 2))) * (0.25 + 0.75 * S.fear) : 0;
    if (S.acc.reduceMotion) S.beat *= 0.35;

    /* static bursts: rate rises with fear^2, all bursts pass the flash limiter */
    S.nextBurst -= dt;
    if (S.nextBurst <= 0) { if (S.fear > 0.15) triggerBurst(0.3 + 0.7 * S.fear); S.nextBurst = expWait(0.15 + 3.2 * S.fear * S.fear); }
    if (S.burstT > 0) { S.burstT -= dt; const x = 1 - S.burstT / S.burstDur; S.burst = S.burstAmp * (x < 0.2 ? x / 0.2 : 1 - (x - 0.2) / 0.8); }
    else S.burst = 0;
    S.tearY += dt * (0.08 + 0.25 * S.fear); if (S.tearY > 1.1) S.tearY = -0.1;     /* the tear rises */

    /* phantom: a figure at the screen edge for 0.4-1.1 s, only above fear 0.45 */
    if (S.phantomT > 0) { S.phantomT -= dt; const x = S.phantomT; S.phantomA = Math.min(1, x * 3, (S.phantomDur - x) * 4) * 0.8; }
    else { S.phantomA = 0; S.phantomNext -= dt * (S.fear > 0.45 ? 1 : 0);
      if (S.phantomNext <= 0) { S.phantomDur = S.phantomT = rand(0.4, 1.1); S.phantomX = Math.random() < 0.5 ? rand(0.04, 0.12) : rand(0.88, 0.96); S.phantomNext = rand(5, 14) * (1.4 - S.fear); } }

    /* fog */
    fogU.hfTime.value = S.time;
    fogU.hfOn.value = S.on.heightFog ? 1 : 0;
    fogU.hfDensity.value = HFX.fog.density * (1 + HFX.fog.fearDensity * S.fear);
    fogU.hfFalloff.value = HFX.fog.falloff; fogU.hfHeight.value = HFX.fog.height;
    fogU.hfStart.value = HFX.fog.start * (1 - 0.7 * S.fear); fogU.hfMaxOpacity.value = HFX.fog.maxOpacity;
    fogU.hfNoiseAmt.value = HFX.fog.noise; fogU.wetOn.value = S.on.wet ? 1 : 0; fogU.wetAmount.value = HFX.rain.wet;
    if (S.scene.fog) {
      const fc = S.scene.fog.color; fc.set(HFX.fog.color);
      fc.lerp(new T.Color(HFX.fog.fearColor), S.fear * HFX.fog.fearTint);
      S.scene.fog.density = HFX.fog.density * 0.6;
      if (S.scene.background && S.scene.background.isColor && HFX.fog.syncBackground) S.scene.background.copy(fc);
    }

    /* flashlight flicker */
    if (S.flashFlicker) updateFlicker(S.flashFlicker, dt);
    flickers.forEach(f => { if (f !== S.flashFlicker) updateFlicker(f, dt); });
    shafts.forEach(sh => { placeShaft(sh); sh.mesh.visible = S.on.shafts; sh.mesh.material.uniforms.uI.value = clamp(sh.light.intensity / sh.base, 0, 2); });

    /* rain lights: the six strongest lamps near the camera + flashlight */
    const cam = S.camera; cam.getWorldPosition(_v);
    const cand = flickers.filter(f => f !== S.flashFlicker && f.light.isLight && !f.light.isSpotLight || (f.light.isSpotLight && f !== S.flashFlicker))
      .map(f => { f.light.getWorldPosition(_w); return { f, p: _w.clone(), d: _w.distanceTo(_v) }; })
      .sort((a, b) => a.d - b.d).slice(0, MAXL);
    for (let i = 0; i < MAXL; i++) {
      const c = cand[i];
      if (c) { lightU.uLPos.value[i].copy(c.p); const L = c.f.light; const s = HFX.rain.lampGain * L.intensity / Math.max(c.f.base, 0.001) * Math.min(c.f.base, 3);
        lightU.uLCol.value[i].set(L.color.r * s, L.color.g * s, L.color.b * s); lightU.uLRad.value[i] = (L.distance || 8) * 0.8; }
      else { lightU.uLPos.value[i].set(0, -999, 0); lightU.uLCol.value[i].set(0, 0, 0); }
    }
    if (S.flashlight) {
      const L = S.flashlight; L.getWorldPosition(lightU.uSpotPos.value); L.target.getWorldPosition(_w);
      lightU.uSpotDir.value.copy(_w).sub(lightU.uSpotPos.value).normalize();
      lightU.uSpotCos.value.set(Math.cos(L.angle), Math.cos(L.angle * (1 - L.penumbra * 0.8)));
      const s = HFX.rain.flashGain * L.intensity; lightU.uSpotCol.value.set(L.color.r * s, L.color.g * s, L.color.b * s);
      lightU.uSpotRange.value = L.distance || 30;
    }
    lightU.uFogFade.value = 0.02 + HFX.fog.density * 0.6 * (1 + S.fear);

    /* rain */
    const R = HFX.rain;
    [S.rain, S.splashes].forEach(m => { m.material.uniforms.uTime.value = S.time; m.material.uniforms.uCenter.value.copy(_v); });
    S.rain.visible = S.on.rain && R.intensity > 0; S.splashes.visible = S.on.rain && S.on.splashes && R.intensity > 0;
    const ru = S.rain.material.uniforms;
    ru.uOpacity.value = R.opacity * R.intensity; ru.uSpeed.value = R.speed; ru.uWind.value.set(R.wind[0], R.wind[1]);
    ru.uGround.value = R.ground; ru.uLen.value = R.length;
    S.rain.geometry.setDrawRange(0, Math.floor(S.rain.geometry.index.count * clamp(R.intensity, 0, 1) / 6) * 6);
    S.splashes.material.uniforms.uRate.value = 2.4; S.splashes.material.uniforms.uGround.value = R.ground + 0.01;
    S.splashes.geometry.setDrawRange(0, Math.floor(S.splashes.geometry.attributes.position.count * clamp(R.intensity, 0, 1)));

    /* post uniforms */
    if (S.pass) {
      const u = S.pass.uniforms, rm = S.acc.reduceMotion, rf = S.acc.reduceFlashing;
      u.uTime.value = S.time; u.uFear.value = S.fear;
      u.uGrain.value = S.on.grain ? HFX.post.grain : 0; u.uStatic.value = S.on.static ? HFX.post.staticAmt : 0;
      u.uTear.value = S.on.tear ? HFX.post.tear * (rm ? 0.3 : 1) : 0; u.uChroma.value = S.on.chroma ? HFX.post.chroma * (rm ? 0.5 : 1) : 0;
      u.uVignette.value = S.on.vignette ? 1 : 0; u.uRadial.value = S.on.radial && !rm ? 1 : 0;
      u.uDesat.value = S.on.desat ? 1 : 0; u.uContrast.value = S.on.contrast ? 1 : 0;
      u.uSway.value = S.on.sway && !rm ? 1 : 0; u.uPhantom.value = S.on.phantom ? 1 : 0;
      u.uBeat.value = S.beat; u.uSpike.value = S.spike; u.uBurst.value = S.burst; u.uTearY.value = S.tearY;
      u.uPhX.value = S.phantomX; u.uPhA.value = S.phantomA; u.uSoftStatic.value = rf ? 1 : 0;
    }
  }

  function render() {
    if (!S.ready) return;
    if (S.bypass || !S.composer) S.renderer.render(S.scene, S.camera);
    else S.composer.render();
  }

  function setFlashlight(spot, o) {
    S.flashlight = spot;
    S.flashFlicker = addFlicker(spot, Object.assign({ pattern: "flashlight" }, o || {}));
    return S.flashFlicker;
  }

  const HFX = {
    EFFECTS, PATTERNS, limiter, state: S, shader: HorrorShader, fogUniforms: fogU,
    fog: { density: 0.06, falloff: 0.28, height: 0, start: 1.5, maxOpacity: 0.97, noise: 0.35, color: 0x16171a,
      fearColor: 0x1d0406, fearTint: 0.45, fearDensity: 0.8, syncBackground: true },
    rain: { intensity: 1, opacity: 0.55, speed: 11, length: 0.55, wind: [1.2, 0.4], ground: 0, wet: 0.85, lampGain: 0.45, flashGain: 0.22 },
    post: { grain: 1, staticAmt: 1, tear: 1, chroma: 1 },
    init, setFear, spike, update, render, setSize, patch, addFlicker, setFlashlight, addShaft,
    getFear: () => S.fear,
    enable(name, on) { if (name in S.on) S.on[name] = !!on; },
    isOn: name => !!S.on[name],
    setAccessibility(o) { Object.assign(S.acc, o || {}); },
    setBypass(b) { S.bypass = !!b; },
    flashesLastSecond: () => limiter.countLastSecond(),
    set onBeat(fn) { S.onBeat = fn; }, get onBeat() { return S.onBeat; },
    get bpm() { return S.bpm; }
  };
  window.HorrorFX = HFX;
})();
