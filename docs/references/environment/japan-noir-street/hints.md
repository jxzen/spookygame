# Hints: building the Japan noir street (ENV-01)

For whoever builds the next street, level or engine scene from this kit. Kit: prototypes/assets/env/ (GLBs + kit.json). Source: prototypes/assets/env/src/ (kit_lib.py, kit_modules.py, kit_street.py, kit_run.py, kit_export.py, town_kit.blend).

## Layout
- Street front of every module faces +Z in three.js; the origin is the street-front bottom centre. Left side of a street running along -Z: rotate +90° about Y. Right side: -90°. Abut modules by `footprint_m.width`.
- Keep lanes at 4–5 m for the main street. Add 2–2.5 m side alleys (yokocho) for chases: refs 01 and 05 show how narrow they really are.
- Alternate facade heights (shop 5.9–6.6 m, machiya 6.7 m, apartment 9.6 m). The broken roofline is what makes the wires read against the fog.
- One pole every 15–20 m, alternating sides. Wires should cross the street diagonally, with service drops to each facade's `ATTACH_wire`. The tangle is the most "Japan" read in the whole frame (ref 01, 08).

## Hiding (director: "walking inside of shops to hide")
- Enterable modules: shop_izakaya (walk in through the noren half, crouch at `HIDE_counter`), shop_tobacco (crawl under the shutter at 0.82 m, crouch at `HIDE_case`), shop_pharmacy (slip through a 0.7 m door gap, hide at `HIDE_backroom` behind the ajar door). The apartment has `HIDE_under_stairs`; the phone booth hides you but you stay visible through the glass.
- Each entry has a cost: crouch, a narrow gap, or a door that makes noise. That cost is the game. The hide POV preview (previews/preview_hide.png) is the shot to sell: dark interior, cover in the foreground, a lit doorway with the red lantern outside.
- Torch off while hiding. Darkness is the default (H5); the street is lit only by lanterns, one vending machine and one working lamp.

## Light and weather
- Red point light at each `LIGHT_lantern` (no shadows, so the glow escapes the sphere). Give the vending machines cold white area lights and keep one pole lamp working (H8: the antagonist can kill it).
- Fog: exponential, grey (not black), dense enough that 25–30 m is a silhouette. Rain: thin streaks, sparse near the lens, never a curtain.
- Biggest missing trick: **light smears on the wet road** (ref 10, the Yoshida print; ref 09). In three r128, add a stretched additive quad on the ground under each lantern, sign and vending machine, scaled along the view direction, plus bloom.

## Materials
- Each material has a baseColor and ORM texture (G = roughness with wet streaks). r128 reads them as standard metallic-roughness. The emissive strength extension is ignored in r128, so glow comes from the emissive factor alone; add bloom.
- Red appears only on lanterns, the tobacco sign, the pharmacy lettering, the torii and `vending_machine_red`. Keep it that way so red means danger or the way forward.

## Do not
- Do not light interiors. Do not add neon colours, even though the photos are full of them; we take their structure, not their palette.
- Do not use the pre-2.8 Blender API names; the scripts target Blender 5.3 (EEVEE).
