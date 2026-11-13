# FX spec: horror visual and screen-space effects (FX-01, DRAFT 2026-11-12)

Module: `prototypes/shared/fx.js` (`window.HorrorFX`, three.js r128). Lab: `prototypes/labs/fx-lab/index.html`.
Evidence and rules: `docs/references/vfx/horror-fx/` (sheet.md = measurements, hints.md = rules and what not to copy).

## The one input: fear (0..1)

Every effect reads a single smoothed `fear` value. The game sets the target; the module smooths it.

- Suggested source: `fear = max(monsterProximity, eventFear, darknessFear)`, where `monsterProximity = clamp(1 - distance / 22 m, 0, 1)` (the probe-03 rule).
- Smoothing: attack rate 6 /s (about 0.2 s to settle), release 1.2 /s (about 1-2 s). Fear arrives fast and leaves slowly, like the Amnesia sanity hit (luma -24 % in 0.5 s, held about 10 s).
- A **spike** fires automatically when smoothed fear rises faster than 1.2 /s, or when the game calls `HorrorFX.spike(a)` on a scare event. It decays at 2.8 /s (about 0.35 s half-life).

## Effects

| # | Effect | Trigger | Parameters (default) | Range | How fear scales it | Accessibility |
|---|---|---|---|---|---|---|
| 1 | **Exponential height fog** | always | density 0.06, falloff 0.28 /m, base height 0 m, start 1.5 m, max opacity 0.97, drift noise 0.35, colour #16171a | density 0-0.2; falloff 0.02-1.2 | density x(1 + 0.8 fear); start distance x(1 - 0.7 fear); colour lerps to #1d0406 by 0.45 fear | none needed |
| 2 | **Rain streaks** | always (on/off per level) | 9000 drops, speed 11 m/s, streak 0.55 m, wind (1.2, 0.4) m/s, opacity 0.55 | intensity 0-1 | streaks fade sooner in thicker fog (distance fade 0.02 + 0.6 density x (1 + fear)) | none needed |
| 3 | **Rain lighting** | always | lit only by up to 6 nearest lamps + flashlight cone (lamp gain 0.7, flashlight gain 0.3) | - | follows the lamp flicker, so rain blinks out with the lamp | - |
| 4 | **Ground splashes** | with rain | 700 rings in 11 m radius, 2.4 cycles /s each | - | - | - |
| 5 | **Wet sheen** | per material (`patch(obj, {wet, ripple})`) | puddle mask from world noise; roughness to 0.12 in puddles; albedo x0.5; ripple rings 1.3 /s; fake night-city env reflection | wet 0-1 | - | - |
| 6 | **Light shafts** | per lamp (`addShaft`) | additive cone, opacity 0.14 | 0-0.3 | brightness follows the lamp's flicker | - |
| 7 | **Light flicker** | per light (`addFlicker`) | patterns below | - | dip rate and depth rise with fear and with `proximity()` (monster near this lamp) | depth capped at 35 %, dips >= 0.25 s with soft attack under *reduce flashing* |
| 8 | **Film grain** | always | 0.06 + 0.07 fear, stronger in shadows | 0-1 | rises | kept (no flash) |
| 9 | **Analog static / snow** | fear | snow mix = 0.7 x (0.32 fear^2 + 0.6 burst), plus scanlines and a rolling bar | - | fear squared: nearly absent below 0.3, heavy at 0.9+ | under *reduce flashing* snow is scaled to scene luma (no bright snow) and bursts are at 30 % strength |
| 10 | **Static bursts** | random, rate 0.15 + 3.2 fear^2 per s; and on every spike | 70-200 ms, attack 20 %, release 80 % | - | rate rises | every burst passes the flash limiter |
| 11 | **Scanline tear** | fear + bursts | one band (+/-0.07 screen) of row jitter, rises up the screen at 0.08 + 0.25 fear per s; whole-frame jitter on bursts | - | amplitude 0.6 fear^2 + burst | x0.3 under *reduce motion* |
| 12 | **Chromatic aberration** | always, radial | 0.004 + 0.012 fear + 0.02 spike, scaled by distance from centre | - | rises | x0.5 under *reduce motion* |
| 13 | **Vignette + heartbeat** | always | starts at radius 0.5 - 0.3 fear; strength 0.45 + 0.5 fear; edge bleeds dark red with fear (Bunker: edge about +5 Cr) | - | heart 58 -> 150 bpm (58 + 92 fear), lub-dub pulse widens the vignette | pulse x0.35 under *reduce motion* |
| 14 | **Radial blur + warp** | spikes only | 10 taps toward centre, blur 0.09 x spike; zoom -4 %; barrel wobble at 9 rad/s | - | - | off under *reduce motion* |
| 15 | **Screen sway** | fear | roll up to 0.019 rad (two sines, 0.63 and 1.71 rad/s), breathing zoom up to 2 % | - | scales with fear | off under *reduce motion* |
| 16 | **Desaturate, keep red** | always | luma grey for everything; pixels with r - max(g, b) > 0.04..0.18 keep red | - | - | - |
| 17 | **Noir contrast** | always | black floor crush 0.012, key lift +30 % at full strength | - | 0.6 + 0.6 fear | - |
| 18 | **Edge phantom** | fear > 0.45 | soft standing figure at 4-12 % or 88-96 % of screen width, 0.4-1.1 s, every 5-14 s x (1.4 - fear) | - | more often with fear | it is a slow fade, not a flash; kept |

### Flicker patterns

| Pattern | Idle dip rate | Extra rate at fear 1 | Depth | Dip length | Follow-ups | Use |
|---|---|---|---|---|---|---|
| steady | 0 | 0 | - | - | - | control |
| buzz | 0.12 /s | +1.6 /s | 35-95 % | 30-110 ms | 55 % chance of 1-3 | street lamps, vending machine |
| dying | 0.45 /s | +1.6 /s | 75-100 % | 80-700 ms | 70 % | one bad lamp per street; dims to 75 % with fear |
| flashlight | 0 | +2.2 /s x fear^2 | 50-97 % | 40-160 ms | 45 % | the player's torch: only fails when fear is high |
| candle | 1.5 /s | +2 /s | 8-22 % | 60-200 ms | 30 % | paper lanterns |
| style string | Quake-style "mmamammmmammamamaaamammma" at 10 letters /s | | | | | scripted moments |

Proximity: `addFlicker(light, { proximity: () => 0..1 })` adds to fear for that light only, so lamps near the monster fail first (house rule H8).

## Accessibility (WCAG 2.3.1)

- **Hard rule, always on:** a shared flash limiter. Any change that can swing luminance by more than 25 % (a deep flicker dip, a static burst, a style-string jump) must ask the limiter. It allows at most **3 per rolling second**, at least 0.12 s apart. The lab shows "Flashes in last 1 s".
- **Reduce flashing** toggle: limiter drops to 1 per second, 0.6 s apart; flicker depth capped at 35 % with soft ramps; static snow is darkened to scene luma; bursts at 30 %.
- **Reduce motion** toggle: no sway, no radial blur or warp, tear x0.3, chromatic aberration x0.5, heartbeat pulse x0.35.
- Red is never flashed full-screen: red only appears as an edge tint that follows the heartbeat. At 150 bpm the lub-dub gives up to 5 bumps per second, so it must stay a small change: it is a smooth Gaussian bump confined to the darkened screen edge, well under the 10 % luminance change that counts as a flash. Not yet measured with a flash-analysis tool; check with PEAT (or similar) before shipping.

## Integration

```js
HorrorFX.init(renderer, scene, camera, { rainCount: 9000 });   // after the scene is built; patches fog into all materials
HorrorFX.patch(groundMesh, { wet: 1, ripple: true });           // puddles
HorrorFX.setFlashlight(flashSpot);                              // flashlight flicker + lights the rain
HorrorFX.addFlicker(lampSpot, { pattern: "buzz", emissive: lampHeadMat, proximity: () => monsterNear(lamp) });
HorrorFX.addShaft(lampSpot, { opacity: 0.14, length: 5.5 });
HorrorFX.onBeat = (bpm, fear) => playThump();                   // audio hook
// per frame:
HorrorFX.setFear(fear); HorrorFX.update(dt); HorrorFX.render();
// resize: HorrorFX.setSize(w, h) (it also self-syncs to the canvas)
// toggles: HorrorFX.enable("static", false); HorrorFX.setAccessibility({ reduceFlashing: true, reduceMotion: true });
```

Notes for the Unreal port: effect 1 maps to Exponential Height Fog (Density, Height Falloff, Start Distance, Max Opacity) with Volumetric Fog for the shafts (Scattering Distribution near 0 for side-visible shafts); effects 8-17 map to one post-process material; effect 7 maps to a light-function or a Blueprint timeline per light.

## Open decisions for the director

1. How loud is static at full fear? Now it nearly hides the scene at 0.95 (see shots 03 and 04). Keep it, or cap it so the monster stays readable?
2. Is the edge phantom in? It is the "imagination" device, but it could feel like a cheap trick if it appears too often.
3. Heartbeat range: 58 -> 150 bpm. Should the pulse be audible as well as visible?
4. Rain everywhere, or only in some streets? It is a strong look but costs about 9000 quads.
