# Horror FX: measurement sheet (2026-11-12)

Labels: **fetched** = measured or seen by me in a capture stored here. **search only** = seen in a search result, not opened. **recall** = from memory, not checked. **inference** = my reading of the evidence.

Method: clips at 720p; frame strips with ffmpeg (fps 0.1 to 2, timestamps burned in); luma (Y) and red chroma (Cr, written V) per frame with ffmpeg `signalstats`. Y is 8-bit limited range (16 = black, 235 = white). Cr 128 = neutral; above 128 = toward red.

## Amnesia: The Dark Descent, low sanity + monster (amnesia-tdd-low-sanity)

| What | Value | Label |
|---|---|---|
| Baseline frame luma before the event | Y 27-30 | fetched |
| Sanity hit at 8.0 s: luma drop | 27.9 -> 21.1 in 0.5 s (about -24 %), stays 20-23 for about 10 s | fetched |
| Colour shift during the hit | U +2, V -0.5 (toward blue-green, away from warm candle) | fetched |
| Distortion seen in the strip | double image (ghost offset of the floor), slow camera roll, soft blur, darker edges; at 7.5 s the candle blooms | fetched (strip_6-12s_2fps.png) |
| Ghost / roll timing | ghosting visible on every frame from 9.0 to 11.5 s, so it is a sustained state, not a flash | fetched |
| Light flashes | none: the whole 47 s has no full-frame luminance flash; light changes are slow (>= 0.5 s ramps) | fetched (luma table) |
| End: faint | 38-41.5 s luma rises to 35 then falls to black (Y 16) in about 1.5 s and holds | fetched |
| Sanity is driven by darkness, seeing the monster, and events; insanity effects grow as sanity drops | recall |

## Amnesia: The Bunker (amnesia-bunker-demo, amnesia-bunker-monster)

| What | Value | Label |
|---|---|---|
| Stress state: red edge tint | left 8 % strip Cr 133-136 for 0-40 s while centre Cr 128-131; that is about +5 Cr at the edge over neutral | fetched |
| After the threat passes | edge Cr falls to 128-130 by 44 s (cleared in under 4 s) | fetched |
| Edge darkening | edges noticeably darker than centre in stress frames (vignette, not a hard ring) | fetched (strip) |
| Red-lit corridor (monster section) | warm-red key light on wet wood, everything else near black; red is environmental light, not only a filter | fetched (strip_34-46s_1fps.png) |
| Dynamo flashlight: has to be cranked, gives out in seconds, and the noise of cranking draws the beast | recall |
| No static, no scanlines, no chromatic split visible at 720p | fetched (absence, at 720p) |

## Silent Hill 2 (2024) (silent-hill-2-remake)

| What | Value | Label |
|---|---|---|
| Day fog, chroma | U and V within 128 +/- 1.5 in the fog-only frames: the fog is grey | fetched |
| Vertical luma profile (3300-3330 s) | top band Y 82-99, horizon band Y 74-86, ground (bottom-left) Y 46-69 | fetched |
| Contrast in fog | YLOW to YHIGH spread about 50-60 code values: very low contrast | fetched |
| Visibility | building silhouettes gone at roughly 15-25 m (judged from parked cars and lamp posts in the strips) | inference |
| Wet ground | puddles and specular sheen on asphalt in the town section; it reads wet even with no rain streaks visible at 0.4 fps | fetched |
| Wind-blown debris (ash / leaves) crossing the frame | fetched (strip_3300) |
| Interior: flashlight is the only key light; hard cone, black outside it | fetched (3342-3357 s) |
| Radio static rises as monsters come near | recall (series signature) |

## Blade Runner (1982), "Tears in rain" (blade-runner-1982-tears-in-rain)

| What | Value | Label |
|---|---|---|
| Rain is visible only where it crosses a light (backlit) | fetched (frames 0:05, 0:10, 0:25) |
| Hard light shafts through smoke from a moving searchlight | fetched (frame_26s.png) |
| Wet edges: thin bright specular lines along every rim and bolt | fetched (frame_26s.png) |
| Colour | cyan-teal grade with orange neon; we take the structure (backlit rain, shafts, wet rims), not the hue | fetched / inference |

## Stray Dog (1949), trailer (stray-dog-1949)

| What | Value | Label |
|---|---|---|
| Hard sun, black-and-white, striped shadows from slats, blinds and pergolas over the faces and streets | fetched (1:45, 1:55, 2:25) |
| Dust / haze in back alleys turns figures into silhouettes at 10-20 m | fetched (2:30) |
| The film's climax is a storm; the trailer does not show rain | recall (film) / fetched (absence in trailer) |

## Unreal Engine Exponential Height Fog (ue-exponential-height-fog)

| What | Value | Label |
|---|---|---|
| Density function d(z) = GlobalDensity * exp(-HeightFalloff * z), integrated along the camera ray, minus a start distance; fog factor = max(exp(-integral), MinFogOpacity) | fetched (forum quote of Epic shader) |
| Parameters: Density, Height Falloff, Max Opacity, Start Distance, End Distance, Cutoff Distance, Inscattering Color, second fog layer | fetched (Epic docs) |
| Volumetric fog: Scattering Distribution 0..0.9, Albedo, Extinction Scale | fetched (Epic docs) |
| Defaults in UE 4.x: Density 0.02, Falloff 0.2, Max Opacity 1, Start Distance 0 | recall |
| Quake / Half-Life light styles: strings like "mmnmmommommnonmmonqnmmo", a = dark, m = normal, z = double, played at 10 letters / s | recall |
| WCAG 2.3.1: no more than three flashes in any one-second period (general and red flash thresholds) | recall |
