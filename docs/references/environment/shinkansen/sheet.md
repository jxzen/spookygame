# Sheet: shinkansen + elevated night platform (W2-TRAIN)

Evidence labels: fetched / search only / recall / inference / measured (from our own files).
Photos: source/ (8 Commons images, licences in source/ORIGIN.txt). Reference only, never loaded by the game.

## Real dimensions vs our model

| Item | Real | Label | Ours (shinkansen.glb) |
|---|---|---|---|
| Intermediate car length | 25 m (N700) | fetched (en.wikipedia N700 series) | 25.0 m (car_2, car_3) |
| End car length | 25.35 m per the fetched summary; I recall 27.35 m for N700 end cars | fetched, conflicts with recall; treat as unverified | 27.0 m (lead and tail) |
| Body width | 3.36 m (N700) | fetched | 3.36 m |
| Body height | 3.5 m without roof equipment (N700) | fetched | 3.68 m incl. rounded roof crown |
| Nose length | ~10.7 m (N700); ~15 m (E5) | recall | 10.5 m |
| Seat pitch | 1,040 mm standard, 1,160 mm green car | fetched | 1.04 m |
| Seating | 2+3 standard, 2+2 green | fetched; ref06 shows 2+3 | 2+3 (2 on the platform side) |
| Doors | one per side at each car end; about 1 m wide | recall; ref05 and ref01 show them at car ends | 2 per side per car, 1.0 x 1.8 m |
| Floor height above rail | ~1.3 m (matches the platform) | inference | 1.30 m |
| Platform height above rail | 1,250 mm on full-gauge shinkansen lines | search only | 1.25 m |
| Platform edge to track centre | ~1.76-1.8 m | inference (half body + gap) | 1.78 m |
| Platform screen doors | half-height gates, set back from the edge; about waist to chest height | search only (no mm figure found); ref05, ref08 | 1.2 m high, 1.22 m back from the edge, 2.2 m openings |
| Platform width | 8-10 m side platforms are common | recall | 8.2 m |
| Canopy | steel portal frames; transverse beams; linear tubes | ref03, ref04, ref08 | columns every 10 m, beams every 5 m, roof at 6.0 m |

## What the photos show (observed)
- ref01, ref02 (N700S, day): long, wide, low "duck-bill" nose; the windshield sits on the hump where the nose meets the roof; the livery stripe sweeps down along the nose; small, closely spaced windows; doors at the car ends.
- ref07 (N700 nose, side): the lower third of the nose is a separate grey skirt; the headlight is a slit on the bill flank; the tip is blunt and rounded, not pointed.
- ref03 (Shizuoka, night): open-sided canopy; the train sits on a dark slab track; the platform is the brightest surface; black sky beyond the canopy edge. This is our night value structure.
- ref05 (Tohoku platform, night): PSD fixed housings are thick grey boxes with a vertical red/black stripe at each end. We kept the red stripe (red marks the way forward, H5).
- ref06 (E5 interior): warm-grey ceiling with two long light strips; luggage racks above the windows; white headrest covers; dark-blue/grey seats.
- ref08 (Fukui): glass PSD panels, a floor line in front of them, a long canopy with exposed steel.

## Value check (measured from our previews, not a pixel script; visual reading)
- preview_platform_night / _edge: dark canopy and sky, mid-grey floor, the train is the brightest mass. Matches ref03's order.
- preview_interior: bright warm-grey cabin, the same order as ref06.
