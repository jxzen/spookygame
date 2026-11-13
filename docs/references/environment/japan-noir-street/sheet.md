# Japan noir street: reference sheet (ENV-01)

Brief ENV-01 (environment art, first-of-kind). Setting: a dead, rainy, post-nuclear Japanese town at night. Director: "dig deeper into the NOIR detective aesthetic but make it japanese horror. maybe rain could help with this?" and "there needs to be mechanics like walking inside of shops to hide". House rule H5 (revised): black, white and grey; red is the only colour; real shadows; fog.

Evidence labels: **[photo-est]** = estimated from a reference photo against a known size (door ≈ 2.0 m, adult ≈ 1.7 m, vending machine 1.83 m); **[measured]** = computed from image pixels; **[common]** = widely published Japanese building convention, not re-verified in this pass; **[built]** = the value used in the kit.

## Sources (10, all Wikimedia Commons, licences in source/ORIGIN.txt)

| # | File | What it is for |
|---|---|---|
| 01 | ref01_pontocho_red_lantern_after_rain | narrow wet alley, gutters, wire tangle, akachochin at eye level |
| 02 | ref02_shianbashi_alley_rain | shutters, projecting vertical signs, bicycle, wet tile |
| 03 | ref03_golden_gai_night | 2-storey bar frontages, tiny doors, stacked signs |
| 04 | ref04_golden_gai_night_2024 | the darkest photo: lit doorways as the only light sources |
| 05 | ref05_omoide_yokocho | interior: counter, clutter, low ceiling (the hide space) |
| 06 | ref06_harmonica_yokocho (CC0) | arcade/covered lane widths, stall frontages |
| 07 | ref07_izakaya_exterior_gotanda | izakaya front: noren, lanterns, menu boards |
| 08 | ref08_omoide_yokocho_west | daylight: proportions, eaves, a real pole transformer |
| 09 | ref09_shibuya_rain_wet_street | wet-asphalt reflections |
| 10 | ref10_yoshida_kagurazaka_night_rain_print (1929 print, CC0) | value design: vertical light smears on a wet road |

## Dimensions

| Item | Reference value | Kit value |
|---|---|---|
| Yokocho alley width | 1.6–2.5 m (Pontocho, Omoide) [photo-est, 01, 05] | not built; the preview uses a shotengai lane |
| Shotengai / back-street lane | 3.5–6 m (Shianbashi ~3.5–4 m) [photo-est, 02] | 5.0 m [built] |
| Shop frontage (maguchi) | 2.5–4 m for yokocho bars; 3–4 *ken* (5.4–7.3 m) for machiya [photo-est 03; common] | 2.8 / 4.0 / 5.0 m shops, 5.4 m machiya, 10 m apartment [built] |
| Ground-floor storey / eave line | eave drip 2.6–3.0 m; door head 2.0–2.2 m [photo-est 01, 07, 08] | eave 2.95–3.0 m, openings 2.2–2.5 m [built] |
| Upper storey | machiya 2nd floor low (2.2–2.5 m, mushiko-mado slot windows) [common, 08] | 2.4 m [built] |
| Projecting eave (hisashi) depth | 0.6–0.9 m [photo-est 01, 08] | 0.7 m shop, 0.9 m machiya [built] |
| Vertical (tate) sign | 0.4–0.6 m wide, 1.2–2.5 m tall, projecting 0.6–0.8 m, bottom above 3 m [photo-est 02, 03] | 0.5–0.6 × 1.4–1.9 m; tops at 5.2–5.8 m [built] |
| Akachochin (red lantern) | about 0.35–0.45 m dia, 0.5–0.7 m tall, hung at 1.8–2.6 m [photo-est 01, 07] | 0.4 × 0.6 m, hook at 2.62 m [built] |
| Noren | 0.6–1.0 m drop, 3–5 panels across the door [photo-est 07] | 0.77 m drop, 4 panels (やきとり) [built] |
| Utility pole | 10–16 m concrete, crossarms at the top, pole transformer at 7–9 m [common, 08] | 12 m, 2 crossarms, transformer at 8.2 m [built] |
| Vending machine | 1.83 m tall, about 1.0 m wide, 0.7–0.8 m deep [common] | 1.83 × 1.0 × 0.75 m [built] |
| Roll-up shutter | full opening width, housing 0.25–0.35 m [photo-est 02] | 2.36 m wide; housing 0.32 m; bottom bar at 0.85 m (crawl-in) [built] |

## Value structure (greyscale)

Measured on 160×90 downsamples; luminance in 0–1 [measured]:

| Set | Mean | % dark (<0.12) | % light (>0.7) | % saturated |
|---|---|---|---|---|
| Street photos 01–10 | 0.16–0.43 | 3–57 | 0–17 | 2–61 |
| SH2 remake fog-day shots 01–04 | 0.28–0.38 | 1–21 | 0–4 | 0–1 |
| SH2 remake night/interior shots 05–10 | 0.07–0.15 | 66–91 | 0–4 | 0–17 |
| **Our previews** | 0.07–0.24 | 26–81 | 0–1 | 0–5 |

Reading:
1. The photos read as noir after a greyscale conversion: a black frame, mid-grey wet road, and small, hard highlights at doorways and lanterns. Ref 04 and ref 07 are closest to the target: 38–57% black, with light only from openings.
2. Our previews sit inside SH2's night band. That is the right darkness, but the highlight share is 0–1% against 4–17% in the photos. Lanterns and signs need bloom or halation to carry.
3. Saturation: the photos are saturated (neon), SH2 is not, and we are at 0–5% with red only. That follows H5.

## Differences vs. references (two iterations)

Iteration 1 (previews/iter1_fog-rain-pass_grid.png). First render: 7,000 rain quads gave a white curtain, world-volume fog did not scatter (Blender 5.3 EEVEE), and the frame was near black. Fix: 2,600 thinner streaks starting 2.5 m from the lens, fog as a volume box (density 0.05), moonlight 0.6, no shadows from rain. After the fix it matched SH2's fog read: wires and poles silhouette against a grey sky (compare SH2 shot04).

Iteration 2 (previews/iter2_lamps-clutter-pass_grid.png). Problems: the hide POV was unreadable, a pole blocked the izakaya, and the ground was bare compared with ref 01 and 02. Fixes:
- moved the pole and the vending machine;
- added a street-clutter prop (A-frame board, crates, a pot);
- raised the pole lamps to 1,500 W, so they now throw visible cones in the fog;
- moved the hide POV behind the izakaya counter, looking out at the lit doorway, with a weak street spill.

Remaining differences, plainly:
- **No wet reflections of lights.** Ref 09 and ref 10 are defined by long vertical light smears on the road. EEVEE screen-space reflections on a 0.03–0.4 roughness road barely show them. In three.js, fake them with stretched emissive quads under each lantern or sign, or a planar reflector.
- **No bloom or halation.** Lanterns read as flat discs.
- **Facades are cleaner and emptier than every photo.** Missing: drain pipes, cable bundles, meters, posters, stacked crates, potted plants, A/C hoses. The interiors are sparse against ref 05.
- **Signs are dead or plain.** The real alleys are a wall of signs (02, 03); a dead town justifies fewer, but the street needs more broken or hanging ones.
- **Modelling is box-built.** Roofs have no tile curvature and the noren hang dead straight. SH2's density of surface detail (shot01 brick, fire escapes) is far beyond this.
- **The street at 5 m is wider than a yokocho.** It reads as a shotengai. A 2–2.5 m alley module is the obvious next piece for chase and hide beats.
