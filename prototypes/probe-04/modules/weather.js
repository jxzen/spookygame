/* weather.js · OWNER: weather (brief W3-WEATHER, rule H14 "Rain lives in the world"). Registered as 'weather', order 72.
 * The ONLY module that drives HorrorFX rain (intensity, ground, wind, look). Runs without level/mission/HorrorFX.
 *
 * HOW RAIN STOPS UNDER ROOFS
 *   At init (after every other module has built its geometry) it asks HorrorFX.captureCover to render the town once,
 *   top-down, into a height map of the highest surface (roofs, awnings, eaves, the station canopy, the torn arcade roof
 *   with its holes). The rain shader kills every streak below that surface, splashes land on it, and wet-floor ripples
 *   only run where nothing covers the floor. So rain stops under any roof, per drop, in world space: from inside a shop
 *   you still see rain beyond the doorway, and walking through a door needs no global fade.
 *   Eave drips are placed along roof edges found in the same map.
 *   Without vertex textures or a level, it falls back to G.world.indoor(x, z) (guarded) driving the global intensity.
 * ENDING: on 'ending' (or G.mission.phase === 'ending') a cover volume follows the camera, shaped like the train car,
 *   so no rain falls inside the carriage; rain beyond the windows stays. (Fallback without vertex textures: no rain.)
 * SHIFT: 'shift-start' -> intensity 0 (worldshift also disables the rain effect); 'shift-end' -> back.
 *
 * G.WEATHER (owner: weather; others may write `covered`)
 *   covered      bool   set true to stop all rain (any roofed spot the map cannot know about); also via event
 *                       G.emit('weather-covered', {on: true|false})
 *   intensity    0..1   current rain intensity (smoothed)
 *   underRoof    bool   a roof is above the player's head (from the cover map); for audio muffling etc.
 *   coverAt(x, z) -> top surface height (m) or null      isCovered(x, y, z) -> bool (something above y at x,z)
 *   mapOK        bool   the cover map was captured
 * CAPTURE HOOK (own feature, alongside any #jump): '#jump=street&weather=anchor&wdx=0.6' parks the camera looking down at
 *   the wet street at x = 72 + wdx, z = -9.2 and freezes HorrorFX time, so two captures with different wdx show whether ripples and
 *   splashes are anchored to the world (they shift in the image) or to the screen (they would not).
 */
(function () {
  'use strict';
  const G = window.G; if (!G) return;
  const THREE = G.THREE || window.THREE;

  const W = G.weather = {
    covered: false, intensity: 0, underRoof: false, mapOK: false,
    coverAt: () => null, isCovered: () => false
  };
  const hash = new URLSearchParams(location.hash.slice(1));
  const debug = hash.get('weather'), debugDx = parseFloat(hash.get('wdx')) || 0;

  let shiftOn = false, ending = false, map = null, t = 0;
  const WIND = [0.9, 0.35];
  const _c = new THREE.Vector3(), _f = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _s = new THREE.Vector3();
  const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _td = new THREE.Vector3();

  function sample(x, z) {
    if (!map) return null;
    const r = map.rect, u = (x - r.minX) / (r.maxX - r.minX), v = (z - r.minZ) / (r.maxZ - r.minZ);
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return null;
    const h = map.heights[Math.floor(v * map.res) * map.res + Math.floor(u * map.res)];
    return h === h ? h : null;
  }
  W.coverAt = (x, z) => sample(x, z);
  W.isCovered = (x, y, z) => { const h = sample(x, z); return h != null && h > y + 0.4; };

  function bounds() {
    const cs = G.world && G.world.colliders; if (!cs || !cs.length) return null;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const b of cs) { if (!b || !b.min || !isFinite(b.min.x) || !isFinite(b.max.x)) continue;
      x0 = Math.min(x0, b.min.x); x1 = Math.max(x1, b.max.x); z0 = Math.min(z0, b.min.z); z1 = Math.max(z1, b.max.z); }
    if (!(x1 - x0 > 4 && z1 - z0 > 4) || x1 - x0 > 1500 || z1 - z0 > 1500) return null;
    const m = 8; return { minX: x0 - m, maxX: x1 + m, minZ: z0 - m, maxZ: z1 + m };
  }

  /* eave drips: texels whose top is > 1 m above a 4-neighbour; the drip falls just outside the edge to that neighbour */
  function findDrips(mp, max) {
    const { heights: H, res, rect } = mp, sx = (rect.maxX - rect.minX) / res, sz = (rect.maxZ - rect.minZ) / res;
    const out = new Float32Array(max * 4); let n = 0, seen = 0, seed = 1234567;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let j = 1; j < res - 1; j++) for (let i = 1; i < res - 1; i++) {
      const h = H[j * res + i]; if (!(h === h)) continue;
      for (const [di, dj] of NB) {
        const hn = H[(j + dj) * res + i + di]; if (!(hn === hn) || h - hn < 1.0 || h - hn > 14) continue;
        seen++; const k = seen <= max ? seen - 1 : Math.floor(rnd() * seen); if (k >= max) continue;
        const x = rect.minX + (i + 0.5 + di * 0.62) * sx, z = rect.minZ + (j + 0.5 + dj * 0.62) * sz;
        out[k * 4] = x; out[k * 4 + 1] = h - 0.04; out[k * 4 + 2] = z; out[k * 4 + 3] = hn; if (k >= n) n = k + 1;
      }
    }
    return out.subarray(0, n * 4);
  }

  /* capture hook '#weather=map': the cover map as an overlay (black = open ground at 0 m, brighter = higher; north up) */
  function showMap(mp) {
    const c = document.createElement('canvas'); c.width = c.height = mp.res; const g = c.getContext('2d'), im = g.createImageData(mp.res, mp.res);
    for (let j = 0; j < mp.res; j++) for (let i = 0; i < mp.res; i++) {
      const h = mp.heights[j * mp.res + i], o = (j * mp.res + i) * 4; // row j = +z (south) -> draw south at the bottom
      const v = h === h ? Math.max(0, Math.min(255, 30 + h * 20)) : 0; im.data[o] = v; im.data[o + 1] = h === h ? v : 0; im.data[o + 2] = h === h ? v : 90; im.data[o + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    c.style.cssText = 'position:fixed;left:0;top:0;height:100vh;z-index:99;image-rendering:pixelated'; document.body.appendChild(c);
  }
  function camFeetY(camY) { const p = G.player && G.player.pos; return p && isFinite(p.y) && (p.x || p.z) ? p.y : camY - 1.62; }

  G.register('weather', {
    order: 72,
    init(G) {
      G.on('shift-start', () => { shiftOn = true; });
      G.on('shift-end', () => { shiftOn = false; });
      G.on('ending', () => { ending = true; });
      G.on('weather-covered', d => { W.covered = !(d && d.on === false); });
      const fx = G.fx; if (!fx || !fx.rain) return;
      // realistic heavy night rain: thin fast streaks, motion blur ~1/25 s, faint unless a lamp is behind them
      Object.assign(fx.rain, { intensity: 1, opacity: 0.85, speed: 9.5, exposure: 0.04, width: 0.0035, ambient: 0.012,
        wet: 0.9, lampGain: 0.85, flashGain: 0.35, splashRate: 3.2, splashSize: 0.11, splashOpacity: 0.9, dripOpacity: 0.9 });
      fx.rain.wind = [WIND[0], WIND[1]];
      W.intensity = 1;
      const vtf = !!(fx.state && fx.state.vtf);
      const b = bounds();
      if (b && fx.captureCover && vtf) {
        try {
          const ext = Math.max(b.maxX - b.minX, b.maxZ - b.minZ), res = ext > 200 ? 2048 : 1024;
          G.scene.updateMatrixWorld(true);
          map = fx.captureCover(b, res);
          if (map) {
            W.mapOK = true;
            const drips = findDrips(map, 1600);
            if (fx.setDrips) fx.setDrips(drips);
            console.info('[weather] cover map ' + res + 'px over ' + ext.toFixed(0) + ' m, ' + (drips.length / 4) + ' eave drips');
            if (debug === 'map') showMap(map);
          }
        } catch (e) { map = null; W.mapOK = false; console.warn('[weather] cover capture failed; indoor() fallback', e); }
      } else console.info('[weather] no cover map (' + (b ? 'no vertex textures' : 'no level') + '); indoor() fallback');
    },
    update(dt, G) {
      const fx = G.fx; t += dt;
      G.camera.getWorldPosition(_c);
      const phaseEnd = ending || (G.mission && G.mission.phase === 'ending');
      // roof over the player's head (map) or a named indoor room (fallback)
      const feet = camFeetY(_c.y);
      let indoor = null;
      try { indoor = G.world && G.world.indoor ? G.world.indoor(_c.x, _c.z) : null; } catch (e) { indoor = null; }
      W.underRoof = map ? W.isCovered(_c.x, feet + 1.2, _c.z) : !!(indoor && indoor !== 'arcade');
      if (!fx || !fx.rain) return;

      let want = 1;
      if (W.covered || shiftOn) want = 0;
      else if (!map) { want = indoor === 'arcade' ? 0.7 : indoor ? 0 : 1; if (phaseEnd) want = 0; }
      const k = Math.min(1, dt * 3);
      W.intensity += (want - W.intensity) * k; if (want === 0 && W.intensity < 0.01) W.intensity = 0;
      fx.rain.intensity = W.intensity;
      let g = 0; try { g = G.world && G.world.heightAt ? G.world.heightAt(_c.x, _c.z) : 0; } catch (e) { g = 0; }
      fx.rain.ground = isFinite(g) ? g : 0;
      // gusts: slow, layered sines on the slant (no allocation)
      const gust = 1 + 0.35 * Math.sin(t * 0.31) + 0.18 * Math.sin(t * 1.13 + 1.7) + 0.08 * Math.sin(t * 3.1);
      if (fx.rain.wind) { fx.rain.wind[0] = WIND[0] * gust; fx.rain.wind[1] = WIND[1] * gust; }

      // the train car in the ending: a box around the camera, long axis along the track (or the view)
      if (fx.setCoverVolume) {
        if (phaseEnd && map) {
          G.camera.getWorldDirection(_f); _f.y = 0;
          const st = G.world && G.world.station, td = st && st.trackDir;
          if (td && isFinite(td.x)) { _td.set(td.x, 0, td.z).normalize(); if (_td.dot(_f) < 0) _td.negate(); _f.copy(_td); }
          if (_f.lengthSq() < 1e-6) _f.set(0, 0, -1); _f.normalize();
          _s.crossVectors(_f, _up).normalize();
          // car interior relative to the camera: 4.4 m ahead (the rear window) to 11 m behind, floor 1.3 m below, ceiling 0.95 m above
          const front = 4.4, back = 11, lo = 1.3, hi = 0.95, half = 1.75;
          _m.makeBasis(_f, _up, _s);
          _m.scale(_td.set((front + back) / 2, (lo + hi) / 2, half));
          _m.setPosition(_c.x + _f.x * (front - back) / 2, _c.y + (hi - lo) / 2, _c.z + _f.z * (front - back) / 2);
          _inv.copy(_m).invert();
          fx.setCoverVolume(0, _inv);
        } else fx.setCoverVolume(0, null);
      }

      if (debug === 'off' && fx.enable) { fx.enable('rain', false); } // capture hook: A/B without any rain layer
      if (debug === 'anchor') { // capture hook: fixed time, camera looking down at the wet street
        if (fx.state) fx.state.time = 40 - dt; // fx.update adds this frame's dt -> exactly 40
        G.camera.position.set(72 + debugDx, 1.7, -9.2); G.camera.rotation.set(-1.0, 0, 0);
        if (G.player && G.player.pos) G.player.pos.set(72 + debugDx, 0, -9.2);
        if (!W._logged) { W._logged = 1; console.info('[weather] anchor: cover top ' + W.coverAt(72 + debugDx, -9.2) + ', rain ' + W.intensity.toFixed(2) + ', rect ' + JSON.stringify(map && map.rect)); }
      }
    }
  });
})();
