# World shift design: "The castle plays you" (SHIFT-01, draft 1, 2026-11-12)

Status: proposal for the director. Lab: `prototypes/labs/shift-lab/index.html` (keys 1-5). Shared code: `prototypes/shared/shift.js` (`window.WorldShift`).
Readings: `docs/references/vfx/shift-*` (Inception and Infinity Castle frame strips; P.T., Control and Antichamber, all fetched 2026-11-12). House rule H10: the shift is rare, a big moment.

## What the director asked for (probe 03 verdict)
- "think of the hallway stretching into the distance and other wild mind melting effects"
- "the second beat where the town morphs appears for only a second and is confusing. we should walk around it"
- "keep pushing in the direction of psychological thriller ... working towards something or you are actively trying to escape"
- "the floating castle movements feel random instead of an underlying structure ... like there is a power controlling this"

What probe 03 did wrong, measured against the readings: it **locked movement** during the fold and the roll (Inception's characters never stop walking: city-fold 0:12-0:40), its morph lasted about 1 s (Inception's build lasts about 25 s), and its rooms moved at random beats (Infinity Castle and Control both tie movement to music).

## The controlling rule (the one thing the player learns)

> **The castle is a koto.** Something unseen plays it. **Every pluck moves one piece of the castle one step along its rail. On the rest beat nothing moves, except the thing hunting you.**

- **Hear it:** each string has its own pitch. Low strings move near pieces; high strings move far ones. The koto is the constraint sheet's "spooky Japanese koto", promoted from score to mechanism.
- **See it:** every moving piece hangs on a visible black rail with a red clamp, and on a red string overhead that shakes when it is plucked. At the far end of the grid the player of the koto sits, too big and too far away to make out; its hand lights red on each pluck.
- **Use it:** the bar is fixed (4 or 6 beats with one rest). The rest is your window to cross, and it is also when the stalker steps. That is the thriller tension: the safe moment and the dangerous moment are the same moment.
- **Bend = length.** A pitch bend lowers the note, which on a real string means a longer string. In the castle a lower note means a longer hall. This rule comes from physics, so the player can feel it without being told.
- Precedents: Nakime's biwa in Infinity Castle (recall); Control's Ashtray Maze timed to "Take Control" (recall; the moving slabs are fetched, 1:25-1:37).

## The sequence the player walks through (about 3-4 minutes)

The goal is visible all the way: **a red door**, the only red object at human scale. The door keeps moving away, but you can always see it. Each beat ends at a red door, and the next beat begins behind it.

| # | Beat | Effect (lab key) | What the player does | What the rule teaches | Threat |
|---|---|---|---|---|---|
| 0 | **Entry: the fold** | Inception street fold, slowed to 20-25 s, walkable | Keep walking up the street while the far end rises over you; the gate is the only fixed point | The ground under you stays still; the world moves elsewhere | The stalker loses you as the street lifts it away |
| 1 | **The long hall** | (a) hallway stretch with dolly zoom | Walk toward the red door. The koto bends a low string; the hall lengthens and your steps gain almost nothing. A sharp high pluck snaps it back, and that is when to run | Bend = longer. Move on the snap and the rest | The thing behind you also gets pulled away by the stretch and snaps closer on the release. It steps only on rests |
| 2 | **The phrase** | (b) P.T. loop | Go through the door and you are back at the start. Each lap the koto adds a note and one thing changes: a clock, a vase, a photo turned over, red light behind a shoji, a figure at the turn, furniture on the ceiling | Count the notes. On the 5th note the door turns red | The figure at the turn (lap 3) is the stalker, waiting |
| 3 | **The folding room** | (c) origami room | Stand in a tatami room as each pluck ratchets one side up 30° on a red crease. The floor becomes the walls, the far wall becomes your ceiling, and the box closes. In the dark, two knocks from outside. The room unfolds as a drawbridge to the red door | Plucks are ratchet steps; rests hold. Stand on the centre tile, which never moves | Knocks in the closed box are the stalker; you cannot see it. Imagination does the work (director: "imagination is scarier") |
| 4 | **Up the wall** | (d) gravity turn | The corridor ends in a tatami wall. Tatami means floor, so walk into it: gravity turns a quarter at a time and you walk up the shaft and onto the ceiling of the room above. A red plumb line keeps hanging the old way | Anything made of floor is a floor | Looking back down the shaft, the stalker stands at the bottom looking up; it obeys the old gravity |
| 5 | **The castle grid** | (e) rooms on rails | Cross five rows of rooms that slide on rails, one row per string, nearest first, then a rest. Ride your platform, wait for alignment, cross on the rest | The whole rule at once: string n moves row n by one cell | It steps one cell toward you on every rest, so standing still is death |
| 6 | **Exit** | (not built) | The red door at the far bank opens back onto the dead street, folded upside down (Inception overhead, 0:44-0:50) | | |

Escalation: one rule in beat 0, a parameter of it in 1 (bend), memory in 2 (count), space in 3 (fold), your own body in 4 (gravity), and everything at once in 5. Nothing happens at random; each surprise is the rule applied somewhere new.

### Optional hiding mechanic (the director also asked for "walking inside of shops to hide")
In the grid, the stacked rooms above and below your row ride the same carriage. A shoji room on your row could be entered and closed: inside, the stalker loses track of you, but the room still moves with its string, so hiding carries you somewhere you did not choose. Not built yet.

## Effect specs (as built in the lab)

| Effect | Mechanism | Key numbers | Reference |
|---|---|---|---|
| (a) Stretch | The level group is scaled in z around the player each frame (`WS.Stretch`: world = A + (level - B)·s, re-anchored on the player). FOV = 2·atan(tan(35°)/s), so the door keeps its size while the walls rush (dolly zoom). Lanterns smear and textures stretch | 4-bar cycle at 72 bpm: rest bar, then s 1 to 3.4 over 2 bars (bend), then back to 1 in 0.35 s (snap). FOV 70° to 22°. Walking during the bend progresses at 1/s speed | Vertigo dolly zoom (recall); Infinity Castle lantern streaks (fetched, iguro 0:01.3-1.8) |
| (b) Loop | Three copies of the corridor (lap-1, lap, lap+1) placed by one rigid transform `WS.Rigid(-90°, 7.5, -17.2)`. Crossing the end door applies the inverse to the player; crossing the start applies the forward transform (losing a lap). No fade | 6 laps; the 5th opens the exit | P.T. join (fetched, 2:50-3:07) |
| (c) Fold | Four hinged strips (`WS.Ratchet`), 30° per pluck, eased over 0.3 s. Strip contents are swapped while the box is closed | 7 bars: north, sides, south, dark and knock, unfold to drawbridge | Inception fold (fetched); origami |
| (d) Gravity | `WS.Profile`: a walkable path in the y-z plane (floor, 1.5 m fillet, wall, fillet, ceiling) with continuous normals. The camera frame is built from tangent and normal, and the player's yaw/pitch is applied on top. The walk drives the turn, not a timer | Corner radius 1.5 m; 60 m route; height 18 m | Inception final kick (gravity only); Control hatch (fetched, 1:46-1:53) |
| (e) Grid | 5 rows × 3 platforms on 6 m cells; ping-pong offsets in [-1, 1]; each row has rails, a red clamp, stacked rooms above and below on the same carriage, and an overhead string that vibrates | 76 bpm, 6/4 bar, beat 6 is the rest. Platforms carry the player. Falling resets you | Infinity Castle grid (fetched); Control pistons (fetched) |

## Accessibility (reduce-motion version)
A toggle (M, or the OS `prefers-reduced-motion` setting, read by `WorldShift.reduceMotion`):
- Stretch: no FOV change (the dolly zoom is the strongest nausea trigger), and the maximum stretch drops from 3.4 to 1.8. The rule still holds.
- Gravity: walking into a curved corner cuts across it with a 0.5 s fade instead of rolling the camera.
- Fold and grid: no camera motion is ever applied; only the world moves, and only in 30° or one-cell steps.
- No camera roll or shake anywhere in the lab, and no full-screen flashes; probe 03's white flash is dropped.
- Planned: an option to show the beat on screen (the lab's beat dots), to subtitle the koto plucks for deaf and hard-of-hearing players, and to slow the bar tempo by 25%.

## Decisions for the director
1. **The koto rule:** is a musician who plays the castle the right "power controlling this"? Alternative: a giant visible mechanism (clock gears) with no player.
2. **The rest beat belongs to the stalker:** is it fair that the safe window is also its move?
3. **Which effects make the cut** for a 5-10 minute mission? A shift of 3-4 minutes is a lot; the shortest strong set is stretch, then fold, then grid.
4. **The loop costs time:** five laps of about 20 s each. Keep it, or shorten it to three?
5. **Show the koto player** (a huge shape at the end of the grid), or keep it heard and never seen?
