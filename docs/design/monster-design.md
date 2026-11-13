# Monster design: Kagenui (影縫い, "the shadow-stitched") (DRAFT, MONSTER-01, 2026-11-12)

Status: first-of-kind. Built asset in `prototypes/assets/monster/` (monster.glb, previews/, viewer.html). References: `docs/references/characters/monster/` (sheet.md, hints.md).

## Concept
On the morning of the disaster, the flash burnt a woman's shadow onto the wall of the town's post office. She had been waiting there with a letter, tied with red thread, for someone who had promised to take her out of the country. The shadow stayed on the wall for decades. It has now **peeled itself off**. It is an onryo: a ghost made by a grievance. Her grievance is the outsider who never came. Every foreign agent in this town is that man to her, and the spy is the only living foreigner left.

- Folklore root: onryo (wronged women in white burial cloth, loose black hair: Okiku, Oiwa, Ōkyo's Oyuki), plus the Kohada Koheiji peek.
- Ours: her body is a **burnt shadow with depth**. It is wide and flat like a stain, charcoal black with ash crust, and has a torn red seam down the back where it tore off the wall. Scraps of white katabira cling to it. Hair is long on one side and burnt to stubble on the other. Half of the face is bone-white, the other half black. She has one eye with a red pupil, and her mouth opens by stretching the face. A **red thread** is wound three times round her right wrist, its loose end trailing on the ground.
- Spy tie: the second note in probe 03 ("Your extraction was never coming") becomes her line too. Her letter (red thread) can be the dead drop the spy is sent to retrieve. Director to confirm.

**Three-word read:** *folded, burnt, wrong.*

## Silhouette sheet
See `prototypes/assets/monster/previews/silhouettes_12m.png` (black fill, 12 m, 35 mm, next to a 1.8 m box): idle hunch, stalk, crawl (side), search, lunge (side), peek.
- Crouched height about 1.2 m, two-thirds of the spy. Her head hangs **below** her shoulders. Arms reach the ground. The outline is a dome with four long legs. It is not a tall thin man.
- Rest height is about 1.95 m. She only uses it during the reveal, when she unfolds.
- Read-at-a-glance features: the wide dome back, the zig-zag arms (the second elbow bends backwards) and dragging hair. The red thread is the only colour.

## Signature movement
| Move | Rule | Clip |
|---|---|---|
| Stop-motion head | Head holds, then snaps to a new angle in 1 frame (stepped keys) | StalkWalk, Search |
| Independent head | The head turns up to 135 degrees and rolls 80 degrees while the body is frozen | Search |
| Wrong joints | The second elbow bends backwards; the arms zig-zag | all |
| Limp-drag gait | Left leg strides, right leg drags, one hand's knuckles trail | StalkWalk |
| Low crawl | Body horizontal, knees splayed, head drooped and rolled sideways. Ceiling: flip the root 180 degrees in the engine | Crawl |
| Snap lunge | 6-frame wind-up, then 3 frames across 1.35 m; the jaw opens 55 degrees, stretching the face | Lunge |
| Peek | The hand curls round the edge first, fingers tap once, then the head slides out sideways, twitches and snaps back | Peek |
| Breath + twitch | Slow breathing with a 1-frame head snap and finger flex | Idle |

Engine notes: play clips at varied speed (0.85–1.15) and skip frames at random (hold 2–4 frames) for the stop-motion feel. Never cross-fade into the Lunge.

## Reveal plan (the monster is hinted at, then appears later)
| Stage | Where in the 5–10 min mission | What the player gets | Asset used |
|---|---|---|---|
| 0. Absence | Opening street | A burnt human shadow on a wall. The next time the player passes, it is gone. Only the red thread is left on the ground | decal (to build) |
| 1. Sound only | First alley | Wet dragging, knuckles on asphalt, a koto string bent too far. Radio static rises. No visual | audio |
| 2. A hand on a doorframe | Shop interior (hiding mechanic) | Four long fingers with red nails curl round the doorframe, tap once, withdraw | Peek frames 14–48 |
| 3. Shape behind rain-streaked glass | Shop window | The dome back and zig-zag arms pass behind wet glass, with stepped motion | StalkWalk, through refraction |
| 4. Partial view | Corridor or covered arcade | The head slides out sideways from a corner at waist height and stares with the red pupil, then snaps back | Peek full |
| 5. Full reveal | Before the shift / climax | She unfolds from the crouch to 1.95 m for one beat, then drops to Crawl and comes. Chase into the dimension shift | Idle → Crawl → Lunge |

Rule: each stage plays once. Stages 2–4 never show the full body. The full model is on screen for at most about 10 s in the whole mission.

## How her presence alters the level (H8)
- **Rain stops** within about 8 m of her: drops hang in the air, then fall at once when she leaves. This is the signature tell.
- **Lights** flicker in a 12 m radius and die in a 4 m radius. Neon signs drop to their red tube only.
- **Shadows:** the burnt wall-shadow decals in the town slide, so the player sees a shadow move on a wall that has no body. Her own shadow is cast late, out of sync with her.
- **Red thread** is strung across doorways and corners she has passed. It shows where she has been and where she is going.
- **Screen:** film grain, chromatic split and static rise with proximity, Amnesia-style. Vignette when she is in view. Audio low-pass when she is behind the player.
- **Sound:** the town's rain hiss drops out near her, leaving silence and one detuned koto note.
- **Fail state:** if she blocks the path, she gets the player (director: "if it is blocking you it always gets you"). Escape is by hiding (shops) or breaking line of sight, never by outrunning her.

## Built asset (v4)
`prototypes/assets/monster/monster.glb`: 6,514 tris, 32 bones (root and 31 deform), 6 materials (char, ash, katabira, face, red, hair), clips Idle 4.0 s, StalkWalk 2.0 s, Crawl 1.38 s, Search 4.0 s, Lunge 2.0 s, Peek 5.0 s. Body heat-weighted (Blender automatic weights). Hair, cloth and face cards are distance-weighted. Source: `src/build_monster.py`, `src/render_previews.py`, `src/run_all.ps1`.

## Decisions for the director
1. **The real-history line.** The flash-shadow motif evokes 1945. We keep it fictional and abstract: no real places or victims. Is that the right distance, or move the origin further from it (e.g. a reactor flash)?
2. Is "folded, burnt, wrong" the read? Or do you want her taller when standing (the reveal unfold)?
3. Should the red thread / letter tie into the spy's dead drop (she wants what he carries)?
4. Rain stopping as her tell: yes or no?
