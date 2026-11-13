# Hints: using the bullet train and platform (W2-TRAIN)

Files: prototypes/assets/train/shinkansen.glb, platform.glb, train.json (all positions in three.js metres). Source: prototypes/assets/train/src/ (lib.py, train.py, platform_mod.py, build_all.py, render_previews.py; train_platform.blend).

## Placing
- Load platform.glb at the station origin. Put the shinkansen root at train.json `platform.train_root_in_platform` (0, 0, -30) in platform space: the nose tip sits at the platform's -Z end and every car door lines up with a screen-door gate. The train departs toward -Z.
- The platform edge is the line x = -1.78 at y = 1.25. Player collision: the deck top is y = 1.25; the track bed is below it.
- `SPAWN_stairs_top` is where the folded-space door can open onto the platform (stairs come up from below).

## Doors and gates
- `door_L_1..8` (platform side, -X) and `door_R_1..8`, numbered front to back. Add `open_offset` to the node position over 0.6-0.9 s. Only car_2's doors open onto a real opening and a cabin; the others show white body behind. Board the player through car_2 (`door_L_3` or `door_L_4`).
- Gates `PSD_01_a/b` to `PSD_05_a/b`, numbered from the tail end (+Z) toward the nose; one gate per car door that falls inside the 60 m (car_1 x2, car_2 x2, car_3 front). Add `open_offset`; they slide along Z into the housings.

## The escape shot
- Camera `CAM_interior_window` (pos/look in train.json) is a platform-side window seat in car_2, looking out and slightly forward. Put the hunter on the platform under `LIGHT_red_lamp` (near the tail end, platform z of about +24) and pull the train out toward -Z: the hunter slides backward through the window.
- `CAM_interior_aisle` is the standing view down the aisle (ref06).
- Cabin light: a point light at each `LIGHT_interior_01..06` (warm grey #ffe6c2, about 0.9 intensity, range 6) plus the emissive ceiling strips. Keep the cabin brighter than the platform: the escape should feel like stepping out of the dark.

## Light and fog
- Platform: a cool-white point (or rect-area) light at each `LIGHT_platform_NN` (24 of them). Cast shadows from 3-4 at most and set shadow bias (-0.004) and normalBias (0.03), or SwiftShader prints acne on the white body.
- `LIGHT_red_lamp` is the one red lamp (level plan 7:40, full reveal). Kill platform lights one by one as the hunter approaches (H8).
- Fog: exponential grey, about 0.03. The black sky past the canopy edge is what sells the elevated station; do not light it.

## Do not
- Add operator logos, names or a real livery. The body is our own: white, one red stripe, dark windows.
- Load anything from docs/references/**/source/.
