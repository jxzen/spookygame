# Level plan: Mission 1, "Kagemachi" (DRAFT v0.1, 2026-11-12)

Brief: LEVEL-01 (level layout and encounter design, first of its kind). Map: [level-plan-mission1-map.svg](level-plan-mission1-map.svg).
Research behind every rule: docs/references/level-layout/pattern.md (L1-L11) and the six studies next to it.
Status: a plan for the director to react to. Nothing is approved. Names (Kagemachi, the Hunter) are working names.

## 1. What the director asked for (verbatim, probe 03)

> "the level design is really boring right now. please find the best practices and copy create some of the best opening horror game level designs for our own but apply our visual twist on it."
> "there is no way to outrun it. if it is blocking you it always gets you. this currently feels like slenderman... people's imagination is scarier a lot of the time than what is on screen. the actual monster shoudl be hinted at but appear later on."
> "there needs to be mechanics like walking inside of shops to hide or things like that... feels like it is working towards something or you are actively trying to escape."
> "the second beat where the town morphs appears for only a second and is confusing. we should walk around it or something."

## 2. What changes from probe 03

| Probe 03 | This plan | Pattern |
|---|---|---|
| One 5 m x 60 m street, two dead-end spurs | A grid: a covered arcade (spine), two back alleys, a canal lane, a plaza, a shrine, a station. Three escape loops of 64-74 m | L5, L10 |
| Stalker fully visible from intel 1 | Sound (0:20), trace (2:00), far glimpse (2:45), shadow (3:50), partial (6:00), full body once (7:40) | L1, L2 |
| Stalker blinks 4-7 m forward | Never teleports during play; it enters and leaves through 4 fixed "backstage doors" you can hear | L5, L6 |
| Chase speed 2.1-2.9 m/s in a dead end; "it always gets you" | Chase 4.6 m/s against run 5.6 m/s, on loops; first contact never kills | L4, L5 |
| No hiding | 6 enterable buildings with 2 doors each, 8 hiding spots, shutters and doors that break line of sight | L4, L10 |
| "INTEL 0/3", no destination | The 03:10 freight at the station, visible in the first 20 s, blocked by a fallen overpass | L9 |
| Shift: the town morphs for one second | Shift: you walk through it for about 90 s: the plaza road becomes the arcade you learned, stretched and folding to the beat of the shrine bell | L11 |

## 3. The town (metres; north up; origin at the south-west)

Footprint 135 m x 110 m. Rain, fog: the player sees silhouettes to about 30 m, detail to about 15 m.

| Zone | Size | Role | Exits |
|---|---|---|---|
| Underpass (start) | 6 x 8 | Arrival from the dead rail line | South street |
| South street | 64 x 4 | Shows the way north to the station is blocked | Arcade, west alley, yokocho, north road |
| North road | 4 x 58 | The obvious route to the station; blocked at 30-38 m by a collapsed overpass. The station's red lamp is visible up it at about 70 m | Dead end (a lure) |
| Shotengai arcade | 6 x 58, covered by a torn translucent roof | The spine. 13 shopfronts; 4 enterable | 4 shops, both ends |
| Pharmacy (W2) | 7 x 7 | Intel 1 (dead drop in a medicine drawer). Hiding: behind the counter | Arcade door, back door to west alley |
| Kimono shop (W5) | 7 x 7 | Hiding: oshiire (closet) | Arcade door, back door to west alley |
| Noodle shop (E2) | 7 x 7 | Hiding: kitchen, under the counter | Arcade door, back door to yokocho |
| Pachinko parlour (E5) | 7 x 10 | Rows of machines break sightlines; the shortcut from the arcade to the yokocho | Arcade door, back door to yokocho |
| West alley | 3 x 62 | Back route; drains, AC units, laundry | South street, plaza, shop back doors |
| Yokocho (bar alley) | 3 x 62, red paper lanterns | The noir heart: wet, narrow, red | South street, plaza, izakaya, 2 passages to the canal lane |
| Izakaya "Tsuki" | 10 x 12 | Intel 2; the first hunt. Hiding: under the counter, back storeroom | Front (shoji door) to yokocho, back door to canal lane |
| Canal lane | 4 x 24, beside a 6 m canal | Loop C; dark; water sound covers footsteps | 2 passages to yokocho, izakaya back door |
| Ekimae-dori (plaza road) | 110 x 10 | Crossroads; the arcade's north mouth; later the shift corridor | Shrine stairs, station gate |
| Shrine | Stairs 8 x 8 (40 steps, about 6 m up); precinct 32 x 20 | Intel 3 (ema wall); the bell; the rest beat. Hiding: kura storehouse (2 doors) | Stairs only (a dead end: the hunter is backstage while you are here) |
| Station | Building 18 x 12; platform 34 x 4 | The goal: the freight train. Gate shutter locked until the shift. Hiding: station office | Gate; platform; rail tunnel |

ASCII sketch (1 char = about 5 m):

```
  [kura] [haiden/bell]  ema                 [==freight 03:10=====]
  [ shrine precinct  P ]                    [platform   F       ]
        |stairs|      ###################### [ STATION  ] gate(locked)
  ======+=============== EKIMAE-DORI (plaza road) ======+=====
  ####  |W|  shops |A| shops |Y| [bars] |c|~~canal~~ ####|N|
  ####  |E|  kimono|R|pachin.|O| IZAKAYA|a|~~     ~~ ####|o| <- overpass
  ####  |S|        |C|       |K| (2)    |n|~~     ~~ ####|r|    down
  ####  |T|pharm(1)|A|noodles|O| [bars] |a|~~     ~~ ####|t|
  ####  |_|________|D|_______|C|________|l|~~_____~~_####|h|
  ============== south street ===========================
                   [underpass] S
```

## 4. Beat timeline (target 8:00; range 6:30-10:00)

Monster stage key: 0 none, 1 sound, 2 trace, 3 far glimpse, 4 shadow, 5 partial, 6 full.

| Time | Place | What happens | Hunter | Pattern |
|---|---|---|---|---|
| 0:00-0:20 | Underpass | Rain. The handler on the spy radio (numbers-station voice): "Freight leaves Kagemachi at 03:10. Be on it." The station's red lamp is visible to the north-east through fog. Objective: **Reach the freight.** | 0 | L9 |
| 0:20-0:40 | South street | The north road is blocked at 30 m by the fallen overpass; the only way is the arcade. Far off: one bell strike, then something heavy and wet drags across a roof. | 1 | L1, L7 |
| 0:40 | Mouth of the west alley | **Yokai Y1**: an umbrella hops across the alley mouth 15 m ahead and is gone behind a vending machine. | 1 | |
| 0:45-1:20 | Arcade | Walk north under the torn roof; rain falls in sheets through the gaps. Handler: "Dead drop. Yamada Pharmacy. Second door on your left." | 1 | L10 |
| 1:20-1:50 | Pharmacy | Enter (teaches doors: open 0.8 s, they swing shut behind you). **Intel 1** in a medicine drawer. On pickup, the arcade's lights die in sequence, south to north, over 4 s. | 1 | L8 |
| 1:50 | Noodle shop window | **Yokai Y2**: a child's shape runs past inside the dark shop; a giggle. | 1 | |
| 2:00-2:30 | Arcade | **Trace**: shutter W3 is bulged outward from inside; long wet black hair hangs from its edge; bare footprints 40 cm long, about 1.6 m apart, lead north. The radio crackles. Handler (the hiding rule, before any hunt): "Static means it's close. Get off the street, get behind a door, kill your light. Don't run unless it has seen you." | 2 | L3, L7, L8 |
| 2:45 | Arcade, looking north | **Far glimpse**: 35 m away at the arcade's north mouth, under the one live lamp, a figure about 2.6 m tall crosses left to right. It does not turn. Static spikes for 1.5 s. It goes toward the yokocho. | 3 | L2 |
| 3:00-3:30 | Pachinko → yokocho | Through the pachinko parlour (the shortcut) into the red-lantern bar alley. **Yokai Y3**: a two-tailed cat on the izakaya's eave watches, then leaps away. | 2 | |
| 3:30-3:50 | Izakaya | Inside: the abandoned bar, rain on the roof. **Intel 2** in the tab ledger behind the counter. | 1 | |
| 3:50-4:40 | Izakaya | **First hunt (scripted, safe)**. Static rises. Outside, the lantern throws the hunter's **shadow** along the shoji front, left to right. It stops at the door. The door rattles. The player hides (counter or storeroom; if they do not, the hunter waits 6 s outside before it enters, which gives them time). It enters and searches for 10 s, passing within 1.5 m of the player's spot. From hiding the player sees only feet and a wet hem. It leaves through the back door to the canal lane. **The first search never finds the player.** | 4 | L4 |
| 4:40-5:30 | Yokocho / loops | **Free hunt**: the hunter is now front stage, searching the yokocho and canal lane. The player must get north to the plaza. Static, light flicker and screen grain track its distance. If it sees them, the player runs a loop (A, B or C), breaks line of sight, hides. Coins (3) can be thrown as lures. | 4 | L5, L6 |
| 5:30 | Plaza | Menace has peaked, or 50 s have passed: the hunter climbs onto the roofs (heard: tiles, then gone). Quiet. Rain only. | 1 | L6 |
| 5:30-6:30 | Shrine | Rest beat. 40 steps up. **Yokai Y4**: the stone lanterns light one by one away from the player, as if someone walks ahead lighting them; a fox mask turns in the dark and is gone. **Intel 3** on the ema wall. | 1 | |
| 6:00 | Shrine basin | **Partial reveal**: the player washes or looks into the chōzuya basin. In the water's reflection something stands right behind them: a long wet hair curtain, a jaw too low. Turn around: nothing; the underfloor of the haiden creaks. | 5 | L1 |
| 6:30 | Haiden | The note says to ring the bell. The player rings it. **The world shift begins.** | 5 | |
| 6:30-7:40 | Plaza road (shift) | Walk-through (section 9). The road east becomes the arcade, stretched and repeating; rooms fold to the bell's beat. **Yokai Y5**: paper lanterns along the stretched arcade open their eyes as the player passes. The hunter follows at the edge of fog, never closing to under 15 m (scripted pressure). | 5 | L11 |
| 7:40 | Station platform | The folded space opens onto the platform. **Full reveal**: under the single red lamp, between the player and the train's last car, the hunter stands upright, full body, for about 3 s. Then it moves. | 6 | L1 |
| 7:40-8:20 | Platform | Final chase. The freight is pulling out at 3.0 m/s. The player swings left through the station office (2 doors) to get around it and runs for the last car. Hunter enraged at 5.0 m/s; the player runs at 5.6 m/s. Jump on; the train enters the tunnel; black. Title card. | 6 | |

Total intended: about 8 min on a first play, about 5 min for a player who knows the route, about 10 min for a careful explorer.

## 5. Monster escalation schedule (the ladder)

| Stage | First at | Form | Max on-screen time | Rule |
|---|---|---|---|---|
| 1 Sound | 0:20 | Bell strike; wet drag on roofs; bare feet slapping | n/a | Comes from above or behind; never in front |
| 2 Trace | 2:00 | Bulged shutter, hair, 40 cm footprints, lights dying | n/a | Every trace points the way the player must go (as SH2R's blood trail) |
| 3 Glimpse | 2:45 | Silhouette at 35 m, lit, walking away | 2.5 s | It does not notice the player |
| 4 Shadow | 3:50 | Shadow on shoji; feet and hem seen from hiding; in the free hunt, a shape at 15-30 m in fog | 10 s in the izakaya | Face never lit |
| 5 Partial | 6:00 | Reflection in the shrine basin; long arm on the folded arcade's ceiling during the shift | 1.5 s each | Seen only indirectly (water, shadow, above) |
| 6 Full | 7:40 | Full body under the red lamp | 3 s, once | The only time the player sees all of it |

During stages 1-4, the hunter's model is drawn with a fog-and-backlight setup that hides its face. Even in the free hunt, it should read as a shape, not a character.

## 6. The Hunter: behaviour

States (5, not a 100-node tree):

| State | Speed | Behaviour |
|---|---|---|
| Backstage | n/a | Off the map (roofs, drains, under the shrine, the rail tunnel). Heard, not seen. |
| Wander | 1.2 m/s | Walks a route between hand-placed points of interest. |
| Investigate | 1.8 m/s | Goes to the last noise (footstep, door, shutter, coin). |
| Search | 1.0 m/s | In a room or block: checks 2-3 spots in an imperfect order with one backtrack; 8-12 s per room (as Alien's searches). |
| Chase | 4.6 m/s (5.0 after the shift) | Only after it sees the player. The player's run is 5.6 m/s: on a straight, the player always gains 1.0 m/s (0.6 m/s after the shift). |

Senses:

| Sense | Value |
|---|---|
| Sight cone | 70 degrees, 14 m in fog; 20 m if the player's light is on and pointed at it; 6 m if the player is crouched in darkness; 0 inside a closed building it is not in |
| Hearing radius | run 12 m; walk 4 m; crouch-walk 0 m; door 8 m; shutter pulled down 15 m; coin landing 10 m (lure) |
| Losing the player | Line of sight broken for 3 s **and** distance over 10 m, or the player closes a door while unseen. It then searches the last seen point for 12 s and returns to Wander. |

Never-rules (each fixes a probe 03 complaint):
1. **Never teleports during play.** It enters and leaves only through the 4 backstage doors (drain at the south street, the roof above the yokocho, under the shrine's haiden, the rail tunnel). It never appears within 25 m of the player or inside their view. (Alien: two teleports in a whole campaign, both in cutscenes.)
2. **Never blocks the only exit.** Every chase zone has two routes; the arcade, alleys and loops all connect at both ends. During the free hunt, its patrol points avoid the north mouths of the yokocho and west alley (it may cross them, never wait there).
3. **Never finds the player on its first search** (the izakaya). From the second search on, it opens at most 1 hiding spot per room, chosen at random; the player's spot is chosen with probability 1/3.
4. **Menace valve**: menace rises 10 per second within 10 m and 4 per second in line of sight, and falls 3 per second. At 100, or after 50 s front stage, it goes backstage for 45-60 s by an audible route. (Alien's director.)
5. **Behaviour unlocks by beat, never by deaths**: before the izakaya, Backstage and Wander only; after it, Investigate, Search and Chase; after the shift, Chase at 5.0 m/s.

Contact:
- First grab per mission: no death. Whiteout and static for 1.5 s; the player is thrown 3 m, stumbles 1 s, and the hunter is stunned for 2.5 s (it "tastes" the player and recoils). The player has a 3.5 s head start: 19.6 m at run speed.
- Second grab: death. Restart at the last intel pickup (checkpoint), with the hunter backstage.
- The old focus-stun (stare at it to repel it) is removed: it rewards looking at the monster, which works against L1.

## 7. Hiding rules

| Rule | Value |
|---|---|
| Where | 8 spots: pharmacy counter, kimono-shop oshiire, noodle-shop kitchen, pachinko machine row, izakaya counter, izakaya storeroom, shrine kura, station office. Shown as white circles on the map. Every hide building has **2 doors**. |
| How | Hold Interact at a spot: 0.6 s to get in (crouch and pull a sliding door or curtain). View narrows to a slit or gap; breathing audio; the static stays live, so the player can track the hunter by ear. |
| Doors | Opening takes 0.8 s and makes noise (8 m radius). A closed door blocks sight completely. The hunter opens doors at 1.0 s. |
| Shutters | 4 shops have half-open shutters. Pulling one down from inside takes 1.2 s and is loud (15 m) but locks that side for 20 s: a trade of noise for safety. |
| Light | The spy's torch makes the player visible at 20 m. Off: 6 m when crouched. Darkness is cover (Amnesia's rule). |
| How the hunter searches | It enters, stands 2 s listening (the player's breath gets louder if they move), checks 2-3 spots in order, opens at most 1 hiding spot, backtracks once, leaves by the other door. 8-12 s per room. |
| If found | Grab rule (section 6). A found player gets a 1.0 s window to bolt out (a "push past" prompt) before the grab lands. |
| Leaving | Hold Interact again: 0.6 s. Leaving while the hunter is within 6 m and facing the spot = seen. |

## 8. Escape geometry (why it can always be escaped)

| Loop | Route | Length | Line-of-sight breaks |
|---|---|---|---|
| A | Arcade → pharmacy (2 doors) → west alley → kimono shop (2 doors) → arcade | about 70 m | 4 doors, 2 corners |
| B | Arcade → noodle shop → yokocho → pachinko → arcade | about 74 m | 4 doors, 2 corners |
| C | Yokocho → passage → canal lane → passage → yokocho, with the izakaya as a shortcut through the middle | about 64 m | 2 corners, 2 izakaya doors |

The maths: the player runs 5.6 m/s, the hunter 4.6 m/s. Seen at 10 m, after one 70 m loop (12.5 s) the gap is about 22.5 m. That is past its 14 m fog sight, and the 3 s line-of-sight break almost always happens at a corner or door in the first 30 m. A player who runs a loop and ducks into the next 2-door shop loses it on a first try. Stamina: run up to 10 s, then 3 s winded at 4.2 m/s (still faster than Wander or Search, but slower than Chase, so they must break line of sight before the 10 s run ends).

## 9. The world shift (the rare, big moment)

Where: triggered by ringing the shrine bell at 6:30. It is the only shift in the mission (house rule H10, director t3).

What the player does: walks (and at the end runs) through it for about 70-90 s. There is no cut and no teleport; they never lose control.

Beats:
1. 0-5 s: the bell's note does not decay; it hangs. Rain stops in midair (droplets freeze). Static drops to silence.
2. 5-20 s: down the shrine stairs. At the bottom, Ekimae-dori is gone: it is the **arcade** the player walked at 0:45, the same shopfronts and torn roof, now running east.
3. 20-50 s: the arcade **stretches** (P.T. plus the "hallway stretching into the distance" the director asked for): shopfronts repeat and the station's red lamp ahead recedes as the player walks. Every 4 s, on the bell's beat, the shops on both sides rotate 90 degrees on their long axis like the Infinity Castle rooms (floor to wall), and the roof folds overhead (Inception). The rotation always follows the same rule: the structure is the town's own grid, turned by something. The beat is the bell, and the hunter's heartbeat runs under it. This answers "there is a power controlling this" (director). **Yokai Y5**: chōchin lanterns along the eaves open eyes as the player passes.
4. 50-70 s: the hunter's long arm drags along the folded ceiling (partial). It follows at about 15-20 m. Stretching stops when the player has walked 110 m (felt as 150 m). A shoji door with a red lamp behind it is the end.
5. 70-80 s: the door opens onto the station platform. The town snaps back. Rain resumes. Full reveal (7:40).

Why this fixes the probe 03 note: the morph is walked through for over a minute and is made of a space the player already knows (pattern L11). The rotation has a visible cause and rhythm, not randomness.

## 10. The three intel notes (each 2-3 lines; each one moves the escape forward)

| # | Where | Text (draft) | What it does |
|---|---|---|---|
| 1 | Pharmacy, medicine drawer 3 (1:20) | "EAGLE: Extraction is the 03:10 freight, Kagemachi station. Main road is down. Go through the arcade. Do not stop." | Confirms the goal and the route; "do not stop" is the first unease |
| 2 | Izakaya tab ledger (3:30) | "Third one this year come for the freight. The other two went into the arcade after midnight and kept walking. It only hunts what it hears. Owner." | Teaches the hearing rule (in fiction) seconds before the first hunt; foreshadows the endless arcade |
| 3 | Shrine ema (votive plaque) wall (6:00) | "The freight only stops for one the shrine lets through. Ring the bell and walk. Whatever the street becomes, keep the red light ahead of you." | Tells the player how to survive the shift; turns the shift into the player's act |

Lore thread: the handler's code name ties to the spy plot; the owner's ledger to the town's dead; the ema to the supernatural rule. The three together answer "how do I get home" for this mission. Texts are placeholders for the dialogue pass.

## 11. Yokai glimpses (harmless; they are not the hunter)

Rules: each one triggers when the player is 12-18 m away and looking within 20 degrees of it; it leaves within 0.8 s; never repeats; never within 20 s of a hunter beat; never in the player's path. Five in the mission (Y1-Y5 on the map). The creature choices (kasa-obake, a zashiki-warashi-like child, nekomata, kitsune, chōchin-obake) are from recall and must be checked against the folklore brief.

## 12. Static, light and screen effects by distance (house rule H8)

| Hunter distance | Effect |
|---|---|
| under 30 m | Radio static starts (quiet); rain hiss gains a low drone |
| under 20 m | Screen grain and static flecks start; nearest street lamps flicker |
| under 15 m | Lights within 15 m of it die; koto stops; strings hold a cluster |
| under 8 m | Heavy static over the image (Siren style); vignette; the player's breath audible |
| Line of sight | One 0.3 s static burst on the first sight of each chase (not on every frame) |

## 13. Numbers in one place

- Player: walk 3.2 m/s; run 5.6 m/s for 10 s, then 3 s winded at 4.2 m/s; crouch 1.6 m/s.
- Hunter: wander 1.2, investigate 1.8, search 1.0, chase 4.6 (5.0 after the shift) m/s. Height 2.6 m in this draft (MONSTER-01 says 1.2 m crouched, 1.95 m unfolded; see section 16). Stride 1.6 m.
- Fog: silhouettes 30 m, detail 15 m. Hunter sight 14 m (20 m vs. a lit torch; 6 m vs. crouched in dark).
- Glimpse distance 35 m. Yokai trigger 12-18 m. Spawn: never under 25 m or in view.
- Menace +10/s within 10 m, +4/s in sight, -3/s; backstage at 100 or after 50 s; backstage stay 45-60 s.
- Loops 64-74 m. Critical path about 300 m before the shift; shift walk 110 m.
- Doors 0.8 s (noise 8 m); shutters 1.2 s (noise 15 m); hide in/out 0.6 s.
- Train departs at 3.0 m/s.

## 14. Build notes for the next probe (prototype stack)

- Replace `WALK` rectangles and `region()`/`aiTarget()` in prototypes/style-probe-03/index.html with a walkable grid plus a waypoint graph (about 40 nodes) for the hunter. Remove `blinkCD` hops entirely.
- Shops: interior boxes with two door triggers; hiding spots as trigger volumes with a camera slit.
- Scope cut if time is short (in order): drop loop C's canal lane (keep the izakaya's two doors); drop the coin lure; drop the station office (end the chase on the platform straight).
- Blender: the arcade roof, shopfronts, izakaya, torii and haiden are the hero assets (director asked for Blender MCP in probe 03 feedback).

## 15. Decisions the director must make

1. **The hunter's identity**: a nameless tall figure (as drawn here), or a specific yokai or onryō? This changes the full reveal.
2. **First contact never kills**: OK, or should the first touch kill (higher stakes, more restarts)?
3. **Shift trigger**: the player rings the bell (their choice, as written), or the shift happens to them?
4. **Length**: 8 min target. Cut toward 5-6 min (drop the shrine rest and the free hunt) or keep?
5. **Spy action**: this plan is mostly horror. Do we add a spy beat (for example, picking the station gate's lock under pressure, or a gadget), and where?
6. **The ending**: escape on the freight (as written), or a cliffhanger (the train is also wrong)?

## 16. Reconcile with parallel briefs (found at the end of this pass)

- **MONSTER-01** (docs/design/monster-design.md) defines the hunter as **Kagenui**, a burnt-shadow onryo: crouched about 1.2 m, about 1.95 m only when it unfolds for the reveal, with a red thread on the wrist. This plan was written with a 2.6 m upright figure. Fixes: the far glimpse (2:45) becomes a low dome shape crawling across the arcade mouth; the 40 cm footprints become hand and knuckle drag marks plus a trailing red thread (the trace that points the way, which fits L8 better); the full reveal (7:40) is the moment it unfolds to its full height under the red lamp. Speeds and senses here still stand. Its post-office origin suggests moving intel 1 (or a 4th object) to a post office on the arcade; director to decide.
- **SHIFT-01** (docs/design/world-shift-design.md) drives the shift with a koto ("every pluck moves one piece") and runs about 3-4 min. This plan has a bell-driven, 70-90 s shift. Proposal: keep the bell as the trigger (the player rings it), and let the koto be the controlling rhythm inside (the bell's hanging note becomes the first pluck). Length: a 3-4 min shift pushes the mission to 10-11 min; either shorten the shift to about 2 min or cut the free hunt (4:40-5:30) and the shrine rest. Director to decide.

## 17. Evidence and weak spots

- Every pattern rule cited here is backed by at least two fetched studies; see docs/references/level-layout/pattern.md and each study's log.md.
- Recall-only items (not used as sole grounds): Jack's patrols in RE7, Alien's lockers and vents, the SH2R radio's behaviour, the folklore creature names.
- All metres, speeds and timings in this plan are **inference** (design choices scaled from the references), not measurements. They must be tuned in a playable probe.
- P.T. footage appears to be a fan PC recreation (see pt-hallway/log.md).
