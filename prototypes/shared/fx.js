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
 *   HorrorFX.captureCover({minX,minZ,maxX,maxZ}, res)  once at init: top-down height map; rain stops under roofs (H14)
 *   HorrorFX.setCoverVolume(i, worldToUnitBoxMatrix|null)  up to 4 moving no-rain boxes (train interior)
 *   HorrorFX.setDrips(Float32Array [x, top, z, bottom]*n)  eave drip points, once at init
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
  /* seeded random for particle layouts: the same rain/splash/drip pattern every load (reproducible captures) */
  let sseed = 20261113; const srnd = () => { sseed = (sseed * 1664525 + 1013904223) >>> 0; return sseed / 4294967296; };

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
    wetOn: { value: 1 }, wetAmount: { value: 0.85 }, hfRain: { value: 1 }
  };
  /* ------------------------------------------------------------------ */
  /* Rain cover map (H14): a top-down height map of the highest surface   */
  /* (roofs, awnings, eaves, canopies, ground), captured once at init by  */
  /* HorrorFX.captureCover. Rain dies below it, splashes land on it,      */
  /* ripples only where nothing covers the floor. Plus up to 4 oriented   */
  /* cover volumes (unit boxes, given as world->box matrices), e.g. the   */
  /* train interior in the ending. All uniforms: no recompiles in play.   */
  /* ------------------------------------------------------------------ */
  const HMIN = -10, HMAX = 54;
  const coverTex0 = new T.DataTexture(new Uint8Array(4), 1, 1, T.RGBAFormat); coverTex0.needsUpdate = true;
  const coverU = {
    hfCover: { value: coverTex0 }, hfCoverRect: { value: new T.Vector4(0, 0, 0, 0) }, hfCoverOn: { value: 0 },
    uVol: { value: [new T.Matrix4(), new T.Matrix4(), new T.Matrix4(), new T.Matrix4()] }, uVolOn: { value: [0, 0, 0, 0] }
  };
  fogU.hfCover = coverU.hfCover; fogU.hfCoverRect = coverU.hfCoverRect; fogU.hfCoverOn = coverU.hfCoverOn;
  const GLSL_COVER = `
    uniform sampler2D hfCover; uniform vec4 hfCoverRect; uniform float hfCoverOn;
    float hfCoverH(vec2 xz, float fb){
      if (hfCoverOn < 0.5) return fb;
      vec2 uv = (xz - hfCoverRect.xy) * hfCoverRect.zw;
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return fb;
      vec4 t = texture2D(hfCover, uv);
      if (t.a < 0.5) return fb;
      return ${HMIN.toFixed(1)} + (t.r * 65280.0 + t.g * 255.0) / 65535.0 * ${(HMAX - HMIN).toFixed(1)};
    }`;
  const GLSL_COVER_STUB = `float hfCoverH(vec2 xz, float fb){ return fb; }`;
  const GLSL_VOL = `
    uniform mat4 uVol[4]; uniform float uVolOn[4];
    float inVol(vec3 p){ float k = 0.0;
      for (int i = 0; i < 4; i++) { if (uVolOn[i] > 0.5) { vec3 l = (uVol[i] * vec4(p, 1.0)).xyz;
        if (max(max(abs(l.x), abs(l.y)), abs(l.z)) < 1.0) k = 1.0; } }
      return k; }`;
  const GLSL_NOISE = `
    float hfHash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float hfNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hfHash(i), hfHash(i+vec2(1.,0.)), f.x), mix(hfHash(i+vec2(0.,1.)), hfHash(i+vec2(1.,1.)), f.x), f.y); }`;
  const FOG_PARS_FRAG = `
    #include <fog_pars_fragment>
    varying vec3 vHFWorld;
    uniform float hfOn, hfDensity, hfFalloff, hfHeight, hfStart, hfMaxOpacity, hfTime, hfNoiseAmt;
    uniform vec2 hfWind;
    uniform float wetOn, wetAmount, hfRain;
    ${GLSL_NOISE}
    ${GLSL_COVER}`;
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
    float wetMask = 0.0, wetOpen = 1.0;
    if (wetOn > 0.5) {
      /* a floor under a roof (cover map top well above it) stays dry-ish and never ripples */
      wetOpen = 1.0 - step(vHFWorld.y + 0.4, hfCoverH(vHFWorld.xz, -1000.0));
      float pud = smoothstep(0.42, 0.62, hfNoise(vHFWorld.xz * 0.35) * 0.7 + hfNoise(vHFWorld.xz * 1.3) * 0.3);
      wetMask = wetAmount * mix(0.55, 1.0, pud) * WET_SCALE * mix(0.3, 1.0, wetOpen);
      diffuseColor.rgb *= mix(1.0, 0.5, wetMask);
    }`;
  const WET_ROUGH = `#include <roughnessmap_fragment>
    roughnessFactor = mix(roughnessFactor, 0.12, wetMask);`;
  /* Ripples live in WORLD space (H14): ring centres are hashed from world cells and the cycle index, and the
     ring's slope tilts the WORLD normal (x/z), which is then rotated into view space. (The old code added the
     tilt straight to the view-space normal, so the shimmer turned with the camera and read as screen-spaced.) */
  const WET_NORMAL = `#include <normal_fragment_maps>
    if (wetOn > 0.5 && WET_RIPPLE > 0.5 && hfRain > 0.01 && wetOpen > 0.5) {
      vec2 grad = vec2(0.0);
      for (int L = 0; L < 2; L++) {
        float sc = L == 0 ? 2.3 : 3.7, ofs = float(L) * 17.31;
        vec2 wp = vHFWorld.xz * sc + ofs; vec2 cell = floor(wp);
        float ph = hfHash(cell + ofs);
        float tt = hfTime * (0.9 + 0.6 * ph) + ph * 3.0; float cyc = floor(tt), life = fract(tt);
        vec2 o = 0.3 + 0.4 * vec2(hfHash(cell + cyc * 1.37 + 3.1), hfHash(cell + cyc * 2.11 + 7.7));
        vec2 q = fract(wp) - o; float r = length(q);
        float x = (r - life * 0.32) * 34.0;
        float amp = (1.0 - life) * (1.0 - life) * step(ph, hfRain * 0.85 + 0.1);
        grad += q / max(r, 1e-3) * (-2.0 * x * exp(-x * x)) * amp;
      }
      grad *= 0.32 * wetMask * hfRain;
      normal = normalize(normal + (viewMatrix * vec4(-grad.x, 0.0, -grad.y, 0.0)).xyz);
    }`;

  /* A fake night-city environment for wet reflections: black sky, a band of
     dim windows, a few hard lamp smudges and one red smear. PMREM-filtered. */
  let wetEnv = null; const wetMats = []; let wetWasOn = true;
  function getWetEnv() {
    if (wetEnv || !S.renderer) return wetEnv;
    const c = document.createElement("canvas"); c.width = 1024; c.height = 512; const g = c.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 0, 512); grd.addColorStop(0, "#000"); grd.addColorStop(.45, "#1a1a1c"); grd.addColorStop(.5, "#2a2a2c"); grd.addColorStop(.56, "#0a0a0a"); grd.addColorStop(1, "#000");
    g.fillStyle = grd; g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 160; i++) { const v = 40 + Math.random() * 90; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * 1024, 150 + Math.random() * 100, 4, 6); }
    for (let i = 0; i < 9; i++) { const x = Math.random() * 1024; const r = g.createRadialGradient(x, 200, 0, x, 200, 26); r.addColorStop(0, "#fff"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(x - 30, 170, 60, 60); }
    const rr = g.createRadialGradient(300, 235, 0, 300, 235, 30); rr.addColorStop(0, "#e01010"); rr.addColorStop(1, "rgba(200,0,0,0)"); g.fillStyle = rr; g.fillRect(260, 200, 80, 80);
    const t = new T.CanvasTexture(c); t.mapping = T.EquirectangularReflectionMapping;
    const pm = new T.PMREMGenerator(S.renderer); wetEnv = pm.fromEquirectangular(t).texture; pm.dispose(); t.dispose();
    return wetEnv;
  }

  function patchMaterial(mat, o) {
    if (!mat) return;
    const wet = o && o.wet ? o.wet : 0;
    /* already patched: only re-patch to make it wetter */
    if (mat.userData.hfxPatched && wet <= (mat.userData.hfxWet || 0)) return;
    if (!mat.userData.hfxPatched) { mat.userData.hfxPrev = mat.onBeforeCompile; mat.userData.hfxPrevKey = mat.customProgramCacheKey; }
    mat.userData.hfxPatched = true; mat.userData.hfxWet = wet;
    if (wet && mat.isMeshStandardMaterial && !mat.envMap && getWetEnv()) { mat.envMap = wetEnv; mat.envMapIntensity = 0.35 + 0.65 * wet; mat.userData.hfxWetEnv = mat.envMapIntensity; wetMats.push(mat); }
    const ripple = o && o.ripple ? 1 : 0;
    const isStd = mat.isMeshStandardMaterial;
    const prev = mat.userData.hfxPrev;
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
    const prevKey = mat.userData.hfxPrevKey ? mat.userData.hfxPrevKey.bind(mat) : null;
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
      vec3 c = vec3(uAmb); vec3 toCam = normalize(cameraPosition - p);
      /* drops glint mostly when the lamp is behind them (forward scattering), so rain shows against lights, not everywhere */
      for (int i = 0; i < ${MAXL}; i++) { vec3 lv = p - uLPos[i]; float d = length(lv); float f = clamp(1.0 - d / uLRad[i], 0.0, 1.0);
        float fw = max(dot(toCam, lv / max(d, 1e-3)), 0.0); fw *= fw; c += uLCol[i] * f * f * (0.35 + 2.4 * fw * fw); }
      vec3 sd = p - uSpotPos; float sl = length(sd);
      float cone = smoothstep(uSpotCos.x, uSpotCos.y, dot(sd / max(sl, 1e-4), uSpotDir));
      c += uSpotCol * cone * clamp(1.0 - sl / uSpotRange, 0.0, 1.0) * 1.6;
      return c;
    }`;

  /* ------------------------------------------------------------------ */
  /* Rain: world-space GPU streaks wrapped in a box around the camera     */
  /* (each drop keeps its world column; only the box edges wrap), motion- */
  /* blurred to speed x exposure, killed below the cover map and inside   */
  /* cover volumes, lit by lamps and the flashlight.                      */
  /* ------------------------------------------------------------------ */
  const coverV = () => (S.vtf ? GLSL_COVER : GLSL_COVER_STUB) + GLSL_VOL;
  function makeRain(count) {
    const seeds = new Float32Array(count * 4 * 3), corner = new Float32Array(count * 4 * 3), idx = [];
    for (let i = 0; i < count; i++) {
      const sx = srnd(), sy = srnd(), sz = srnd(), r = srnd();
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
        uTime: { value: 0 }, uSpeed: { value: 9.5 }, uExpo: { value: 0.04 }, uWidth: { value: 0.004 },
        uBox: { value: new T.Vector3(30, 16, 30) }, uCenter: { value: new T.Vector3() }, uWind: { value: new T.Vector2(1.2, 0.4) },
        uGround: { value: 0 }, uOpacity: { value: 0.55 }
      }, lightU, coverU),
      vertexShader: `
        uniform float uTime, uSpeed, uExpo, uWidth, uGround; uniform vec3 uBox, uCenter; uniform vec2 uWind;
        attribute vec3 aCorner; varying float vA, vSide, vAlong; varying vec3 vW;
        ${coverV()}
        void main(){
          vec3 s = position; float rnd = aCorner.z; float sz = fract(rnd * 7.31 + s.x * 3.7);
          float sp = uSpeed * (0.75 + 0.5 * sz);                     /* bigger drops fall faster */
          float fallen = mod(s.y * uBox.y + uTime * sp, uBox.y);
          float y = uCenter.y + uBox.y * 0.62 - fallen;
          vec2 xz = (s.xz - 0.5) * uBox.xz + uWind * (fallen / sp);
          xz = uCenter.xz + mod(xz - uCenter.xz + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5;
          vec3 head = vec3(xz.x, y, xz.y);
          vec3 vel = vec3(uWind.x, -sp, uWind.y); float spd = length(vel); vec3 dir = vel / spd;
          vec3 tail = head - dir * spd * uExpo * (0.7 + 0.6 * rnd);    /* motion blur: speed x exposure */
          float H = hfCoverH(head.xz, uGround);
          float dead = step(tail.y, H) + inVol(head);
          vec3 p = mix(head, tail, aCorner.y); p.y = max(p.y, H);      /* a streak ends on the roof / ground it hits */
          vec3 toC = cameraPosition - p; float dist = length(toC);
          float w0 = uWidth * (0.6 + 0.8 * sz); float w = max(w0, dist * 0.0009);
          p += normalize(cross(dir, toC / max(dist, 1e-3))) * w * aCorner.x;
          vW = p; vSide = aCorner.x; vAlong = aCorner.y;
          vA = (w0 / w) * smoothstep(0.25, 1.5, dist) * (0.6 + 0.6 * sz);
          gl_Position = dead > 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float uOpacity; varying float vA, vSide, vAlong; varying vec3 vW;
        ${GLSL_LIGHT}
        void main(){
          float e = 1.0 - abs(vSide);
          float a = e * e * vA * uOpacity * (1.0 - 0.7 * vAlong) * exp(-length(vW - cameraPosition) * uFogFade);
          gl_FragColor = vec4(rainLight(vW), a);
        }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending
    });
    const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.userData.hfxSkip = true;
    return mesh;
  }
  /* Splashes (H14): each impact is a flat ring quad lying on the surface it hit (ground, roof, awning: the
     cover map top) plus a short upright crown. The impact point is a WORLD coordinate, wrapped into a tile
     around the camera: it stays where it landed while the player walks (the old version added the camera
     position to every live splash, so they slid along with the player). */
  function makeSplashes(count) {
    const n = count * 8, seeds = new Float32Array(n * 3), corner = new Float32Array(n * 3), idx = [];
    const cs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (let i = 0; i < count; i++) {
      const a = srnd(), b = srnd(), c = srnd();
      for (let k = 0; k < 8; k++) {
        const j = (i * 8 + k) * 3;
        seeds[j] = a; seeds[j + 1] = b; seeds[j + 2] = c;
        corner[j] = cs[k & 3][0]; corner[j + 1] = cs[k & 3][1]; corner[j + 2] = k < 4 ? 0 : 1;
      }
      const v = i * 8; idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3, v + 4, v + 6, v + 5, v + 5, v + 6, v + 7);
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(seeds, 3)); g.setAttribute("aCorner", new T.BufferAttribute(corner, 3)); g.setIndex(idx);
    const m = new T.ShaderMaterial({
      uniforms: Object.assign({ uTime: { value: 0 }, uRate: { value: 3 }, uCenter: { value: new T.Vector3() }, uRadius: { value: 12 },
        uGround: { value: 0 }, uSize: { value: 0.12 }, uOpacity: { value: 0.8 } }, lightU, coverU),
      vertexShader: `
        uniform float uTime, uRate, uRadius, uGround, uSize; uniform vec3 uCenter;
        attribute vec3 aCorner; varying vec2 vQ; varying float vLife, vKind, vFade; varying vec3 vW;
        float h11(float n){ return fract(sin(n) * 43758.5453); }
        ${coverV()}
        void main(){
          float cyc = uTime * uRate * (0.7 + 0.6 * position.y) + position.z * 7.0; float id = floor(cyc); vLife = fract(cyc);
          vec2 r = vec2(h11(id * 1.7 + position.x * 91.3), h11(id * 3.1 + position.y * 57.9 + position.x * 13.7));
          vec2 base = (r - 0.5) * uRadius * 2.0;                                   /* world tile coordinate */
          vec2 xz = uCenter.xz + mod(base - uCenter.xz + uRadius, uRadius * 2.0) - uRadius;
          vec3 c = vec3(xz.x, hfCoverH(xz, uGround) + 0.015, xz.y);
          float dead = inVol(c);
          float sz = uSize * (0.5 + 0.9 * h11(id * 5.3 + position.x * 7.1));
          vKind = aCorner.z; vQ = aCorner.xy; vec3 p;
          if (aCorner.z < 0.5) p = c + vec3(aCorner.x, 0.0, aCorner.y) * sz * (0.3 + vLife);
          else { vec3 tc = cameraPosition - c; vec3 rt = normalize(vec3(tc.z, 0.0, -tc.x) + 1e-5);
            p = c + rt * aCorner.x * sz * 0.5 + vec3(0.0, (aCorner.y * 0.5 + 0.5) * sz * 0.7 * (0.4 + 2.0 * vLife), 0.0);
            dead += step(0.3, vLife); }
          vec2 dc = (xz - uCenter.xz) / uRadius; vFade = 1.0 - smoothstep(0.7, 1.0, max(abs(dc.x), abs(dc.y)));
          vW = c;
          gl_Position = dead > 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float uOpacity; varying vec2 vQ; varying float vLife, vKind, vFade; varying vec3 vW;
        ${GLSL_LIGHT}
        void main(){
          float a;
          if (vKind < 0.5) { float d = length(vQ); if (d > 1.0) discard;
            a = (smoothstep(0.14, 0.0, abs(d - 0.85)) + 0.5 * smoothstep(0.12, 0.0, abs(d - 0.5)) * step(0.3, vLife)) * pow(1.0 - vLife, 1.5); }
          else { float y = vQ.y * 0.5 + 0.5; float x = abs(vQ.x);
            float drops = smoothstep(0.35, 0.0, abs(fract(vQ.x * 1.5 + 0.5) - 0.5)) * (1.0 - x);
            a = drops * smoothstep(1.0, 0.3, y) * (1.0 - vLife / 0.3) * 1.4; }
          a *= uOpacity * vFade * exp(-length(vW - cameraPosition) * uFogFade * 1.5);
          gl_FragColor = vec4(rainLight(vW + vec3(0.0, 0.3, 0.0)), a);
        }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending
    });
    const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.userData.hfxSkip = true; mesh.userData.hfxRain = true;
    return mesh;
  }
  /* Eave drips: fixed world points just outside roof edges (found by the host from the cover map), each
     dropping a bead that accelerates from the eave to the ground below. */
  function makeDrips(cap) {
    const n = cap * 4, pos = new Float32Array(n * 3), d = new Float32Array(n * 3), corner = new Float32Array(n * 2), idx = [];
    const cs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (let i = 0; i < cap; i++) { for (let k = 0; k < 4; k++) { corner[(i * 4 + k) * 2] = cs[k][0]; corner[(i * 4 + k) * 2 + 1] = cs[k][1]; }
      const v = i * 4; idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(pos, 3)); g.setAttribute("aD", new T.BufferAttribute(d, 3)); g.setAttribute("aCorner", new T.BufferAttribute(corner, 2));
    g.setIndex(idx); g.setDrawRange(0, 0);
    const m = new T.ShaderMaterial({
      uniforms: Object.assign({ uTime: { value: 0 }, uExpo: { value: 0.04 }, uOpacity: { value: 0.8 } }, lightU, coverU),
      vertexShader: `
        uniform float uTime, uExpo; attribute vec3 aD; attribute vec2 aCorner; varying float vA, vSide; varying vec3 vW;
        ${GLSL_VOL}
        void main(){
          float H = max(position.y - aD.x, 0.01); float tf = sqrt(2.0 * H / 9.8);
          float t = mod(uTime + aD.y * aD.z, aD.z);
          float y = position.y - 4.9 * t * t; float len = clamp(9.8 * t * uExpo, 0.03, 0.5);
          vec3 head = vec3(position.x, max(y, aD.x), position.z);
          vec3 tc = cameraPosition - head; float dist = length(tc);
          float dead = step(tf, t) + step(28.0, dist) + inVol(head);
          vec3 rt = normalize(vec3(tc.z, 0.0, -tc.x) + 1e-5); float w = max(0.006, dist * 0.0011);
          vec3 p = head + vec3(0.0, (aCorner.y * 0.5 + 0.5) * len, 0.0) + rt * aCorner.x * w;
          vW = p; vSide = aCorner.x; vA = (0.006 / w) * (1.0 - smoothstep(18.0, 28.0, dist));
          gl_Position = dead > 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float uOpacity; varying float vA, vSide; varying vec3 vW;
        ${GLSL_LIGHT}
        void main(){ float e = 1.0 - abs(vSide);
          gl_FragColor = vec4(rainLight(vW) * 1.4, e * e * vA * uOpacity * exp(-length(vW - cameraPosition) * uFogFade)); }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending
    });
    const mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.userData.hfxSkip = true; mesh.userData.hfxRain = true;
    mesh.userData.cap = cap;
    return mesh;
  }
  /** drips: Float32Array [x, top, z, bottom] * n (world). Call once at init (uploads one buffer). */
  function setDrips(arr) {
    const mesh = S.drips; if (!mesh || !arr) return 0;
    const n = Math.min(mesh.userData.cap, Math.floor(arr.length / 4));
    const P = mesh.geometry.attributes.position, D = mesh.geometry.attributes.aD;
    for (let i = 0; i < n; i++) {
      const per = 0.5 + srnd() * 1.6, ph = srnd();
      for (let k = 0; k < 4; k++) { const j = (i * 4 + k) * 3;
        P.array[j] = arr[i * 4]; P.array[j + 1] = arr[i * 4 + 1]; P.array[j + 2] = arr[i * 4 + 2];
        D.array[j] = arr[i * 4 + 3]; D.array[j + 1] = ph; D.array[j + 2] = per; }
    }
    P.needsUpdate = true; D.needsUpdate = true; mesh.geometry.setDrawRange(0, n * 6); S.dripCount = n;
    return n;
  }

  /* Cover capture: renders the scene once, top-down, into a height map of the highest surface per texel.
     The capture material writes world height (16-bit packed in R,G; A = 1 where anything is). Additive and
     very faint materials, points, lines and sprites are skipped; alpha-tested maps (the torn arcade roof) keep
     their holes so rain falls through them. Returns { heights: Float32Array (NaN = nothing), res, rect }. */
  function captureCover(rect, res) {
    if (!S.renderer || !S.scene) return null;
    res = res || 1024;
    const r = S.renderer, sc = S.scene, W = rect.maxX - rect.minX, D = rect.maxZ - rect.minZ;
    if (!(W > 1 && D > 1)) return null;
    const rt = new T.WebGLRenderTarget(res, res, { minFilter: T.NearestFilter, magFilter: T.NearestFilter, format: T.RGBAFormat, type: T.UnsignedByteType, depthBuffer: true, stencilBuffer: false });
    rt.texture.generateMipmaps = false;
    const rectU = { value: new T.Vector4(rect.minX, rect.minZ, 1 / W, 1 / D) };
    const capMat = (map, at) => new T.ShaderMaterial({
      uniforms: { uRect: rectU, map: { value: map || null }, uAT: { value: at || 0.5 } },
      defines: map ? { CAP_ALPHA: 1 } : {},
      vertexShader: `uniform vec4 uRect; varying vec2 vUv; varying float vY;
        void main(){ vec4 p = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            p = instanceMatrix * p;
          #endif
          vec4 w = modelMatrix * p; vY = w.y; vUv = uv;
          vec2 c = (w.xz - uRect.xy) * uRect.zw * 2.0 - 1.0;
          float v = clamp((w.y - (${HMIN.toFixed(1)})) / ${(HMAX - HMIN).toFixed(1)}, 0.0, 1.0);
          gl_Position = vec4(c, 1.0 - 2.0 * v, 1.0); }`,
      fragmentShader: `uniform sampler2D map; uniform float uAT; varying vec2 vUv; varying float vY;
        void main(){
          #ifdef CAP_ALPHA
            if (texture2D(map, vUv).a < uAT) discard;
          #endif
          float v = clamp((vY - (${HMIN.toFixed(1)})) / ${(HMAX - HMIN).toFixed(1)}, 0.0, 1.0);
          float q = floor(v * 65535.0 + 0.5); float hi = floor(q / 256.0); float lo = q - hi * 256.0;
          gl_FragColor = vec4(hi / 255.0, lo / 255.0, 0.0, 1.0); }`,
      side: T.DoubleSide
    });
    const solid = capMat(null), alphaMats = new Map(), swapped = [], hidden = [];
    const pick = mt => {
      if (!mt || mt.visible === false || mt.isShaderMaterial || mt.isRawShaderMaterial) return null;
      if (mt.blending === T.AdditiveBlending || (mt.transparent && mt.opacity < 0.2)) return null;
      if (mt.map && mt.alphaTest > 0) { if (!alphaMats.has(mt.map)) alphaMats.set(mt.map, capMat(mt.map, mt.alphaTest)); return alphaMats.get(mt.map); }
      return solid;
    };
    sc.traverse(o => {
      if (o.userData.hfxRain || o.isPoints || o.isLine || o.isSprite) { if (o.visible) { hidden.push(o); o.visible = false; } return; }
      if (!o.isMesh || !o.material) return;
      let nm;
      if (Array.isArray(o.material)) { nm = o.material.map(mt => pick(mt) || null); if (nm.every(x => !x)) nm = null; else nm = nm.map(x => x || solid); }
      else nm = pick(o.material);
      if (!nm) { if (o.visible) { hidden.push(o); o.visible = false; } return; }
      swapped.push(o, o.material); o.material = nm;
    });
    const cam = new T.OrthographicCamera(-W / 2, W / 2, D / 2, -D / 2, 0.1, 400);
    cam.position.set(rect.minX + W / 2, 200, rect.minZ + D / 2); cam.up.set(0, 0, -1); cam.lookAt(rect.minX + W / 2, 0, rect.minZ + D / 2); cam.updateMatrixWorld(true);
    const bg = sc.background, prevRT = r.getRenderTarget(), cc = r.getClearColor(new T.Color()), ca = r.getClearAlpha(), ac = r.autoClear;
    const fog = sc.fog;
    let px = null;
    try {
      sc.background = null; sc.fog = null;
      r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.autoClear = false; r.clear(true, true, true);
      r.render(sc, cam);
      px = new Uint8Array(res * res * 4); r.readRenderTargetPixels(rt, 0, 0, res, res, px);
    } finally {
      r.setRenderTarget(prevRT); r.setClearColor(cc, ca); r.autoClear = ac; sc.background = bg; sc.fog = fog;
      for (let i = 0; i < swapped.length; i += 2) swapped[i].material = swapped[i + 1];
      hidden.forEach(o => { o.visible = true; });
      solid.dispose(); alphaMats.forEach(m => m.dispose());
    }
    const heights = new Float32Array(res * res);
    for (let i = 0; i < res * res; i++) heights[i] = px[i * 4 + 3] > 127 ? HMIN + (px[i * 4] * 256 + px[i * 4 + 1]) / 65535 * (HMAX - HMIN) : NaN;
    if (S.coverRT) S.coverRT.dispose();
    S.coverRT = rt;
    coverU.hfCover.value = rt.texture; coverU.hfCoverRect.value.copy(rectU.value); coverU.hfCoverOn.value = 1;
    return { heights, res, rect: { minX: rect.minX, minZ: rect.minZ, maxX: rect.maxX, maxZ: rect.maxZ } };
  }
  /** cover volume i (0..3): a world->unit-box matrix (inside = |x|,|y|,|z| < 1), or null to clear */
  function setCoverVolume(i, inv) {
    if (i < 0 || i > 3) return;
    if (inv) { coverU.uVol.value[i].copy(inv); coverU.uVolOn.value[i] = 1; } else coverU.uVolOn.value[i] = 0;
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
      k: 1, dipT: 0, dipDur: 0.1, dipDepth: 0, next: rand(0.2, 3), queue: 0, kill: 1, phase: Math.random() * 10,
      wp: new T.Vector3()
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
        float asp = uRes.x / max(uRes.y, 1.0); vec2 c = vec2(0.5);
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
        float ck = uContrast * (0.6 + 0.6 * uFear);
        col = max(col - 0.012 * ck, 0.0) * (1.0 + 0.3 * ck);              /* crush the floor, lift the key */
        /* phantom: soft standing figure in the periphery, only at fear */
        vec2 pp = (vUv - vec2(uPhX, 0.44)) * vec2(asp, 1.0);
        float body = 1.0 - smoothstep(0.0, 0.05, length(vec2(pp.x * 2.0, max(abs(pp.y + 0.02) - 0.15, 0.0))) - 0.025);
        float head = 1.0 - smoothstep(0.0, 0.03, length(pp - vec2(0.0, 0.2)) - 0.028);
        col *= 1.0 - max(body, head) * uPhA * uPhantom * 0.9;
        /* vignette with heartbeat, edges bleed dark red with fear (Bunker) */
        float vd = length((vUv - c) * vec2(asp, 1.0));
        float vStart = 0.5 - uFear * 0.3 - uBeat * (0.03 + 0.1 * uFear);
        float vig = 1.0 - smoothstep(vStart, vStart + 0.6, vd) * (0.45 + 0.5 * uFear);
        float edge = (1.0 - vig) * uVignette;
        col *= mix(1.0, vig, uVignette);
        col = mix(col, col * vec3(1.0, 0.25, 0.22) + vec3(0.11, 0.0, 0.0) * (0.35 + 0.65 * uBeat), edge * uFear);
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
    bypass: false, flashlight: null, flashFlicker: null, rain: null, splashes: null, drips: null, dripCount: 0, vtf: false, coverRT: null,
    on: {}, acc: { reduceFlashing: false, reduceMotion: false }, onBeat: null, lastFear: 0
  };
  EFFECTS.forEach(e => S.on[e] = true);

  function init(renderer, scene, camera, opts) {
    opts = opts || {};
    S.renderer = renderer; S.scene = scene; S.camera = camera;
    if (!scene.fog || !scene.fog.isFogExp2) scene.fog = new T.FogExp2(scene.fog ? scene.fog.color.getHex() : 0x141416, 0.05);
    if (opts.fog) Object.keys(opts.fog).forEach(k => HFX.fog[k] = opts.fog[k]);
    S.vtf = !!(renderer.capabilities && renderer.capabilities.vertexTextures);
    S.rain = makeRain(opts.rainCount || 9000); scene.add(S.rain);
    S.splashes = makeSplashes(opts.splashCount || 1100); scene.add(S.splashes);
    S.drips = makeDrips(opts.dripCount || 1600); scene.add(S.drips);
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
  const _db = new T.Vector2();
  function syncSize() {   /* keeps the post pass matched to the canvas even if the host forgets setSize */
    S.renderer.getDrawingBufferSize(_db);
    if (_db.x < 2 || _db.y < 2 || !S.pass) return;
    const u = S.pass.uniforms.uRes.value;
    if (u.x !== _db.x || u.y !== _db.y) { const pr = S.renderer.getPixelRatio(); setSize(_db.x / pr, _db.y / pr); }
  }
  function setSize(w, h) {
    if (!(w > 1 && h > 1)) return;
    if (S.composer) S.composer.setSize(w, h);
    const pr = S.renderer.getPixelRatio();
    if (S.pass) S.pass.uniforms.uRes.value.set(w * pr, h * pr);
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

  const _v = new T.Vector3(), _w = new T.Vector3(), _fearCol = new T.Color();
  const candF = new Array(MAXL).fill(null), candD = new Float32Array(MAXL);
  function update(dt) {
    if (!S.ready) return;
    dt = clamp(+dt || 0, 0, 0.1); if (dt === 0) return;
    S.time += dt; limiter.now = S.time;
    limiter.max = S.acc.reduceFlashing ? 1 : 3; limiter.minGap = S.acc.reduceFlashing ? 0.6 : 0.12;
    /* fear: fast attack, slow release; spike when it jumps */
    const up = S.fearTarget > S.fear;
    S.fear = clamp(lerp(S.fear, S.fearTarget, 1 - Math.exp(-dt * (up ? 6 : 1.2))), 0, 1);
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
    if (S.on.wet !== wetWasOn) { wetWasOn = S.on.wet; wetMats.forEach(m => m.envMapIntensity = wetWasOn ? m.userData.hfxWetEnv : 0); }
    fogU.hfNoiseAmt.value = HFX.fog.noise; fogU.wetOn.value = S.on.wet ? 1 : 0; fogU.wetAmount.value = HFX.rain.wet;
    if (S.scene.fog) {
      const fc = S.scene.fog.color; fc.set(HFX.fog.color);
      fc.lerp(_fearCol.set(HFX.fog.fearColor), S.fear * HFX.fog.fearTint);
      S.scene.fog.density = HFX.fog.density * 0.6;
      if (S.scene.background && S.scene.background.isColor && HFX.fog.syncBackground) S.scene.background.copy(fc);
    }

    /* flashlight flicker */
    if (S.flashFlicker) updateFlicker(S.flashFlicker, dt);
    flickers.forEach(f => { if (f !== S.flashFlicker) updateFlicker(f, dt); });
    shafts.forEach(sh => { placeShaft(sh); sh.mesh.visible = S.on.shafts; sh.mesh.material.uniforms.uI.value = clamp(sh.light.intensity / sh.base, 0, 2); });

    /* rain lights: the six nearest visible lamps + flashlight (insertion pick, no per-frame allocation) */
    const cam = S.camera; cam.getWorldPosition(_v);
    let nC = 0;
    for (let k = 0; k < flickers.length; k++) {
      const f = flickers[k]; if (f === S.flashFlicker || !f.light.isLight || !f.light.visible) continue;
      f.light.getWorldPosition(f.wp); const d = f.wp.distanceTo(_v);
      if (nC < MAXL) nC++; else if (d >= candD[MAXL - 1]) continue;
      let j = nC - 1; while (j > 0 && candD[j - 1] > d) { candD[j] = candD[j - 1]; candF[j] = candF[j - 1]; j--; }
      candD[j] = d; candF[j] = f;
    }
    for (let i = 0; i < MAXL; i++) {
      const f = i < nC ? candF[i] : null;
      if (f) { lightU.uLPos.value[i].copy(f.wp); const L = f.light; const s = HFX.rain.lampGain * L.intensity / Math.max(f.base, 0.001) * Math.min(f.base, 3);
        lightU.uLCol.value[i].set(L.color.r * s, L.color.g * s, L.color.b * s); lightU.uLRad.value[i] = (L.distance || 8) * 0.8; }
      else { lightU.uLPos.value[i].set(0, -999, 0); lightU.uLCol.value[i].set(0, 0, 0); }
    }
    let flashVis = !!S.flashlight; for (let o = S.flashlight; o && flashVis; o = o.parent) if (!o.visible) flashVis = false;
    lightU.uSpotCol.value.set(0, 0, 0);
    lightU.uAmb.value = HFX.rain.ambient != null ? HFX.rain.ambient : 0.05;
    if (S.flashlight && flashVis) {
      const L = S.flashlight; L.getWorldPosition(lightU.uSpotPos.value); L.target.getWorldPosition(_w);
      lightU.uSpotDir.value.copy(_w).sub(lightU.uSpotPos.value).normalize();
      lightU.uSpotCos.value.set(Math.cos(L.angle), Math.cos(L.angle * (1 - L.penumbra * 0.8)));
      const s = HFX.rain.flashGain * L.intensity; lightU.uSpotCol.value.set(L.color.r * s, L.color.g * s, L.color.b * s);
      lightU.uSpotRange.value = L.distance || 30;
    }
    lightU.uFogFade.value = 0.02 + HFX.fog.density * 0.6 * (1 + S.fear);

    /* rain. Meshes stay visible (draw range 0 when dry) so their programs compile on the first frame, never mid-play (H15). */
    const R = HFX.rain, ri = clamp(R.intensity, 0, 1), expo = R.exposure || 0.04;
    fogU.hfRain.value = S.on.rain ? ri : 0;
    const ru = S.rain.material.uniforms, su = S.splashes.material.uniforms, du = S.drips.material.uniforms;
    ru.uTime.value = su.uTime.value = du.uTime.value = S.time; ru.uCenter.value.copy(_v); su.uCenter.value.copy(_v);
    S.rain.visible = S.on.rain; S.splashes.visible = S.on.rain && S.on.splashes; S.drips.visible = S.on.rain;
    ru.uOpacity.value = R.opacity * ri; ru.uSpeed.value = R.speed; ru.uWind.value.set(R.wind[0], R.wind[1]);
    ru.uGround.value = R.ground; ru.uExpo.value = expo; ru.uWidth.value = R.width || 0.004;
    S.rain.geometry.setDrawRange(0, Math.floor(S.rain.geometry.index.count * ri / 6) * 6);
    su.uRate.value = R.splashRate || 3; su.uGround.value = R.ground; su.uSize.value = R.splashSize || 0.12;
    su.uOpacity.value = R.splashOpacity != null ? R.splashOpacity : 0.8;
    S.splashes.geometry.setDrawRange(0, Math.floor(S.splashes.geometry.index.count * ri / 12) * 12);
    du.uExpo.value = expo; du.uOpacity.value = (R.dripOpacity != null ? R.dripOpacity : 0.8) * ri;
    S.drips.geometry.setDrawRange(0, ri > 0.01 ? S.dripCount * 6 : 0);

    /* post uniforms */
    syncSize();
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
    rain: { intensity: 1, opacity: 0.55, speed: 9.5, exposure: 0.04, width: 0.004, wind: [1.2, 0.4], ground: 0, wet: 0.85, lampGain: 0.7, flashGain: 0.3,
      ambient: 0.05, splashRate: 3, splashSize: 0.12, splashOpacity: 0.8, dripOpacity: 0.8 },
    post: { grain: 1, staticAmt: 1, tear: 1, chroma: 1 },
    init, setFear, spike, update, render, setSize, patch, addFlicker, setFlashlight, addShaft,
    captureCover, setCoverVolume, setDrips, coverUniforms: coverU,
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
