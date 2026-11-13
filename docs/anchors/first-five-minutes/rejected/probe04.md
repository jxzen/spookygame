# Probe 04 · director feedback (verbatim) · 2026-11-13

Build: prototypes/probe-04 at 90e84d8, played locally at http://localhost:8765/probe-04/index.html.

> rain ripples are screen spaced so they move w the player instead of constant on the ground. make the rain realistic. often times there is rain at the wrong time, like when you are inside buildings like in the shinkansen at the end.
>
> lot of hitches. picking up the 2nd ledger and ringing the bell, they are displayed too short of time.
>
> footsteps are badly sounded. the static sound for monster is too intense and constant. the low hum feels like a audio bug.
>
> initial path finding is difficult. level design should guide you to the objectives. use half life alyx as level design reference in terms of guiding the player through the mission. the level with the moving floors was the most captivating visually and mechanic wise.
>
> the  monster didn't seem rigged, no skeletal mesh. it comes across as goofy instead of scary.

Earlier the same session: "i cant board the train" (fixed d189f5e: the Board point was on the track centreline, out of reach).

## Readings (integrator, inference until checked)
- Rain ripples: drawn by the screen-space FX pass (shared/fx.js), not on world geometry. Rain has no indoor occlusion; the ending interior still gets it.
- "2nd ledger" = drop 2, the tab ledger; its toast and the bell toast close before they can be read.
- Monster: monster.glb IS skinned (armature, automatic weights, 6 actions), but monster.js advances the mixer in held 2-4 frame steps ("stop-motion", from monster-design.md) on a skin-modifier body. That is the likely cause of "didn't seem rigged".
- Moving floors = the world shift (shared/shift.js, worldshift.js): positive anchor.

Rules derived: H14-H19 in docs/references/_house/pattern.md.
