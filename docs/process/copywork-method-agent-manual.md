# Copywork method: operating manual for agents

Version 1 · 2026-11-12

This manual is the procedure. The evidence behind it is in two companion files, which should sit beside it: the Glimmerwood process post-mortem and the research report *Copywork method for game development*. Read those only when you need to know why a rule exists or how strong its support is.

---

## 0. How to use this manual

You are the integrating agent for a new game. One human director holds the taste and makes the calls. Builder agents work in parallel, each in its own copy of the code. Your job is to run the project so that every element of the game is made from studied references and checked against real work, not built from impressions and checked against adjectives.

- Read the whole manual before your first action.
- Builders do not read this manual. Everything a builder needs goes into its brief (section 9).
- If you are working alone, you hold every role. Use a fresh subagent or a fresh session wherever the manual asks for a "fresh" agent, because the point of those steps is that the agent has not seen what you have seen.
- When the director's instruction conflicts with this manual, the director wins. Record the deviation in the work log.
- When the manual is silent, choose the option that puts real media in front of the director sooner.

---

## 1. The method in one page

Copywork means learning by reproducing the best existing work before making your own. The version used here is Benjamin Franklin's: reduce a model to short hints, put the model away, rebuild it from the hints, compare the rebuild with the original, and fix what the comparison exposes. Transcribing without comparing teaches little, so this method never stops at transcription.

In a pipeline of agents the method has three consequences.

1. **Rules must prove themselves.** Before building our version of a first-of-kind element, a fresh agent rebuilds the reference moment from our measurements and rules alone. Every difference between the rebuild and the original is a missing rule.
2. **Learning lives in files.** Agents forget between sessions, so whatever is learned from a reference goes into a shared reference library. The library is the project's memory.
3. **What ships is a transposition.** Study copies are private training material. Shipped work passes the mechanism through this game's own constraints and draws on more than one source.

```
pick a reading ─► capture real media ─► measure ─► write hints ─► rebuild blind ─► diff vs original
                                           ▲                                            │
                                           └──────── repair the rules, not the copy ◄───┘
                                                                │  entry marked "reproduced"
                                                                ▼
        compare 2–3 references ─► pattern ─► transpose through the game's constraints ─► build ours
                                                                ▼
              two-up vs anchor · line-up vs siblings · director verdict ─► anchor or negative anchor
```

**Status of the evidence.** Judging against exemplars, comparing several cases of one principle, showing options early and in parallel, and replacing warnings with controls are all well supported. The rebuild-and-diff step is an extrapolation from memory research and practitioner testimony; nobody has tested it on creative production or on agents. Section 12 tells you how to measure it on this project and when to drop it.

---

## 2. Ground rules

Each rule has a reason. If a situation arises where following the rule would defeat its reason, raise it with the director instead of silently breaking or silently following it.

1. **No first-of-kind build without a picked reference reading.** First-of-kind subjective work with no anchor is where rework concentrates.
2. **Study the real artefact, in the medium of the property being borrowed.** A clip for motion, a recording for sound, a map or graph for structure, native-resolution frames for art. Never work from memory or from someone's description; recall loses timing and motion.
3. **Write rules as mechanisms, not looks.** "Colour lives on rims and props, never on the ground mass" can be applied and checked. "Make it look like X" cannot.
4. **Rebuild the reference before building ours** whenever the element is the first of its kind (section 6).
5. **Study copies never ship.** Game code may not import anything from a `study/` folder. Every shipped element names at least two sources, one forced difference, and the defect in the reference that our version fixes.
6. **Judge by comparison, never by adjective.** Two-up against a named anchor tells you whether it is good enough. A line-up with its siblings tells you whether it is different enough.
7. **Match the anchor, differ from the siblings.** Every piece in a set (levels, bosses, minigames, biomes, quests) takes its own cell in the set's variety matrix. Reusing one good tool everywhere it fits produces a set that feels the same throughout.
8. **Grow, don't rewrite.** Approved content does not move or change without a preview the director has approved.
9. **The director decides taste, early and cheaply.** Show choices as real media, three at a time, before building. A finished result should never be the first thing they see.
10. **Diagnose before redesigning.** State what is wrong and why, cause not symptom, before changing anything. Every fixed bug gets a regression test.
11. **"Tests pass" never means it looks, sounds or plays right.** Each element type has required verification rungs (section 8). A rung is done only when its artefact exists.
12. **Controls, not warnings.** If an agent can make a mistake that harms other agents or a live system, remove the possibility with tooling (section 11). A sentence in a brief is not a control.
13. **Report weak spots plainly and log every work item** (section 12). Weak spots go to the director as decisions, not buried in a report.

---

## 3. Roles

| Role | Who | Does |
|---|---|---|
| Director | The human | Picks references, approves or rejects, gives one-line reasons. Final say on taste |
| Integrator | You | Runs this manual, writes briefs, merges, owns shared files and the library |
| Scout | Cheap exploratory agent | Finds and captures candidate references; assembles three-ups |
| Builder | Agent in an isolated copy | Builds one work item from one brief |
| Reviewer | Fresh-context agent, read-only | Sees the brief, anchors and captures, never the builder's reasoning. Advises; does not decide |

---

## 4. Files the method needs

```
docs/
  macro-design.md           the game in five pages or fewer
  constraints.md            this game's own constraints: camera, scale, palette, theme, tone, platform, input
  homage.md                 internal table: what each homage borrows and what it avoids
  references/<element>/<slug>/
    source/                 real frames, clips, audio, maps, each with origin and retrieval date
    sheet.md                measurements
    hints.md                one line per rule, plus "what not to copy"
    study/                  the rebuild and its diff against source (never shipped)
    pattern.md              name, problem, rule, reason, good example, bad example
    log.md                  evidence label, director verdicts and reasons
  anchors/<kind>/           approved captures and rejected captures, each with the director's one-line reason
  sets/<kind>.md            the variety matrix for each set
process/
  registry                  shared numbers (protocol, save version, id ranges), assigned at merge
  owners                    one owner per shared system
  claims/                   one-paragraph claim files for new shared mechanisms
  worklog                   one row per work item
  open-weak-spots.md        running list, offered back to the director
```

**Evidence labels.** Every library entry and every factual claim in a brief carries one: *reproduced* (we rebuilt it and the rebuild held up), *fetched* (we have the real media or page), *search only*, *recall*, *inference*. Recall and inference never justify a build on their own. If a page was blocked, say it was blocked.

**Keep local copies.** Published guides and talks move or vanish. Store what you study in `source/`.

---

## 5. The phases

### Phase 0. Capture scope and taste (one or two sessions with the director)

1. Run the first-session interview (section 15). Write `macro-design.md`: the experience the game is for, the core loop, platforms, session length, and the inventory of element kinds this game has. State the intended feeling before choosing any mechanic.
2. Write `constraints.md`. "Transposition" in rule 5 means passing a mechanism through this sheet.
3. Create the library skeleton, `homage.md` and the house rules as pattern entries.
4. For each element kind in the inventory, a scout assembles three reference readings as real media: two near references that solve the same problem and one distant one from another genre or medium. The director picks one per kind and gives a one-sentence reason. Log it.
5. If the director has earlier projects, import their approved and rejected captures with reasons as the first anchors. If not, the picked references act as anchors until Phase 3 produces our own.
6. Open slot: if the director uses another copy-based routine in their own practice and supplies notes on it, map its steps onto section 6 and record what it adds, changes or contradicts.

*Exit:* macro design, constraints sheet, one picked reading per element kind, library skeleton.

### Phase 1. Seams and controls that are always right

7. Build only the seams that are cheap and never wrong: wide ids with a guard test, the shared-number registry with merge-time assignment, a parse check, a real-runtime load gate with no console errors, one input abstraction, and the capture harness.
8. The capture harness needs: a fixed timestep under test, an explicit "frame N rendered" signal, frame-stepped screenshots and clips, an offline audio render with a settable start time, and a pinned environment for baselines.
9. Install the controls in section 11. Prove each one by attempting the forbidden action and watching it fail.
10. Create the work log.

*Exit:* forbidden actions fail; a capture and an audio render reproduce exactly.

Leave the rest of the architecture (content registries, rig APIs, hooks) until two finished instances exist to extract it from. Sources disagree on whether foundations or early play should come first, so treat this split as a judgment call and revisit it if it hurts.

### Phase 2. The study-copy loop

11. Run section 6 once for each first-of-kind element in the inventory.

*Exit:* a *reproduced* library entry and a pattern for each.

### Phase 3. Two anchors per kind

12. Grey-box each mechanic and have the director play it before any art exists. Gameplay carries more risk than art.
13. Build three cheap variants in parallel, each from a different reading. The director picks from a three-up.
14. Take the pick to the full quality bar through its verification rungs. Then build a second instance that differs on a named axis. Both become anchors, and the axes on which they differ seed the set's variety matrix. One anchor defines a point; two define a range.
15. Extract the shared seams from what the two instances have in common.
16. Playtest the first five minutes with first-time players (section 8, rung L).

*Exit:* for each kind, two anchors, a variety matrix and the extracted seam.

### Phase 4. Parallel production

17. Write one brief per work item from the template in section 9.
18. Before anyone builds a new shared mechanism, commit a one-paragraph claim file.
19. Each builder works in isolation, dry-runs the merge before reporting, and fills the rung form: every required rung marked done with an artefact path, or "not applicable because…".
20. Pre-screen with mechanical checks, the newcomer agent and the model judge. A clear fail returns to the builder with its capture beside the anchor and an instruction to state the differences before retrying.
21. The director reviews in batches (section 10). Rejections become negative anchors; reasons create or amend pattern entries.
22. Apply the stop rules (section 12).
23. Merge one branch at a time. Assign registry numbers at merge. A red post-merge check halts merging until fixed.
24. Each day, post a short rough reel of everything in progress.

### Phase 5. People and devices

25. Run short playtests with first-time players.
26. Run the device checklist on each release candidate.
27. Run flash analysis on the busiest ten seconds of every intense sequence, and the accessibility scoping questions on the build.

### Phase 6. Retrospective from counts

28. Report rounds-to-approval by element type, first-of-kind flag and cause tag.
29. Compare items that had a *reproduced* entry with items that did not. That comparison is the test of this method's central claim.
30. List five things to repeat and five not to. Re-judge the anchor set to catch drift in the standard.

---

## 6. The study-copy loop in detail

Run this for every first-of-kind element. For an extension of an approved pattern, steps 1 to 3 are enough.

1. **Select and capture.** Take the director's picked reading. Capture the reference from the real artefact, in the medium of the property being borrowed.
2. **Measure.** Fill the study sheet for the discipline (section 7). Reduce the reference to a neutral form first: greyscale, a wireframe, a common key, a beat list, a graph.
3. **Hint.** Write one line per rule in `hints.md`, as mechanism and not look. Add a "what not to copy" list: the reference's flaws, its signature expression, anything tied to its own world.
4. **Rebuild blind.** A fresh agent that has not seen the source media rebuilds the reference moment in a sandbox from `sheet.md` and `hints.md` alone. Keep the unit small: one screen, one attack, one room, eight bars, one exchange of dialogue.
5. **Diff.** Place rebuild and original two-up. Itemise the differences as kept, omitted, added and reordered, and measure them where possible. The director glances at the two-up and marks which differences matter.
6. **Repair the rules, not the copy.** Add or correct hints, then rerun once. Stop at diminishing returns. A rebuild that differs from the original but still achieves the stated mechanism passes. Mark the entry *reproduced*.
7. **Check order separately** for structural elements such as levels, fights, quests and pacing. Give a fresh agent the shuffled beats, have it restore the order, and compare with the reference. Reconstruction tests items well and order badly.
8. **Compare across references.** Put the two or three sheets side by side, ask what they share, and write the shared principle as `pattern.md` after the comparison, not before.

Then transpose: pass the pattern through `constraints.md`, add the distant source, apply the forced difference, and brief the build of our version.

**Caveat.** The rebuild may be less blind than it looks. A model can know a famous reference from training, so a pass may reflect recall. Judge the rebuild against the sheet's numbers, not against a general resemblance.

---

## 7. Study sheets by element

The pass mark for any measurement is the reference's or the anchor's own value unless a published number is given.

| Element | Study copy: capture, measure, rebuild | Rules to extract | Mechanical checks | Failure to avoid |
|---|---|---|---|---|
| Environment, colour, light | 6–10 native-resolution frames; greyscale and posterise to 3–5 values; extract the palette; assign every element to a readability tier; rebuild one screen's value structure at our scale and compare histograms | Which tier owns the highest contrast and saturation; where colour may live; palette scheme per area | Palette count; lightness histogram after any colour grade; clutter range; pixel baseline on approved regions | Copying surface style without the value structure; scenery that hides play; neighbouring areas converging |
| Characters and creatures | Black-fill the reference at gameplay scale beside the player; note its value read and a three-word read target; redraw the silhouette from the read target alone and compare | Silhouette, value gradient, areas of rest; one theme per creature | Size ratio against the player; silhouette rendered in the real scene | Judging out of context; one literal source |
| Animation | Lay every frame of a reference clip in a strip; annotate anticipation, contact, hold, overshoot and recovery in frames and milliseconds; put it away; animate in our proportions; compare strips | Frames per phase; a clear silhouette on each key pose; overshoot, then settle | Frame strip and two-up clip; held-frame detection; loop seam | Judging motion from stills; tracing so closely the motion goes dead |
| Visual effects | Split the reference into cast, travel and hit; time the flash and the linger; rebuild from the simplest version, one layer at a time, in greyscale first | One primary shape with quiet secondaries; anticipation, payoff, time to read; size matches gameplay weight; the bright point is the hitbox | Value and saturation limits; brightness after grading; duration; hitbox overlay; flash analysis | Everything shouting; weak attacks dressed as ultimates; hairline detail that vanishes at game scale |
| UI, HUD, prompts, touch | One screen type from 3–5 references, each redrawn as a wireframe with grid, margins, element count and type size as a fraction of screen height; view the screen with and without its UI | Most important thing first; feedback for every action; contextual elements only when needed | Touch targets at least 15 mm on phones and 24 mm on tablets; caption lines of at most 40 characters; element count | Copying a stylistic conceit without the conditions that made it work; UI left to the end |
| Game feel and camera | Recreate the reference moment in a test scene; switch each effect on and off; name each camera behaviour; log shake amplitude and decay, hold frames, easing | The order effects are added in; hold frames on hits; removing friction counts as much as adding effects | Logged parameters against the reference's; reduce-motion coverage. A person judges feel | Effects in place of design; values tuned by eye with no numbers kept |
| Music and sound | Per reference track: key and mode, tempo, metre, instrumentation, arrangement map with bar numbers, motif list, loudness. Rebuild 8–16 bars; A/B against the original at matched loudness | What never stops; which layers enter with intensity; what must never be masked | Loudness, true peak, clipping, pitch drift, clock invariance (section 8, rung G) | Sound nobody listened to; mixing without a reference track; loops heard until meaningless |
| Mechanics and core loop | Capture the reference at a known frame rate; measure in player-relative units; build a grey-box clone and tune until two-up footage matches; then vary one parameter at a time | The skill tested, the input and the quantified parameters for each mechanic; the intended feeling stated before the mechanic is chosen | Parameter-table diff; failures per ten attempts in a sandbox (usable range roughly one to six) | A placeholder mechanic surviving into the first minute; choosing mechanics before stating the experience |
| Level and world layout | Trace the reference map; mark critical path, optional rooms and shortcuts; draw the lock-and-key graph; list each room's teaching purpose; classify each challenge as harder (evolution) or a new combination (expansion) | A near-linear critical path disguised by side rooms; rarely more than three simultaneous obstacles; introduce, develop, twist, conclude | Graph validity; pixel baseline outside the brief's declared area; reserved map boxes | Studying a paraphrase of a design talk instead of the level; reshaping approved land |
| Pacing | Timestamp the reference's opening 20–30 minutes into beats of new verb, threat, reward and rest; draw the intensity curve; compute intensity-to-rest ratio per segment | Vary how often peaks come, not how hard they hit; rest follows a peak | Time to first meaningful input; seconds between new verbs; peak and rest durations against the reference | A wait in the first minute that nothing has earned |
| Bosses and encounters | Fill a beat structure for the reference fight; list each attack with the skill it tests; time wind-up, active and recovery from footage; mark safe zones on an arena trace; rebuild one telegraph | One attack per skill; new attacks first appear with time and safety to learn them; every important cue on at least two channels | Boss-by-skill table, where identical rows mean the same fight; sound-off readability; attempts to first kill | Mechanics prioritised over warnings; a phase judged only by its designer |
| Minigames and other sets of small games | Write each reference game's command in one or two words; count seconds to comprehension and seconds of play; find which channel, sight or sound, carries it | One command each; graspable within about five seconds; a fixed foundation with one differing term per game | Duplicate-verb lint; attempts to first clear | Near-identical play; over-differentiation that leaves players unsure what to do |
| Dialogue and reactive lines | Transcribe a reference scene as private study; for each line record its function, length and the state it reacts to; change one variable and replay to probe reactivity. Then run Franklin's loop: hint per line, rebuild the scene without the text, compare | Query the state, pick the most specific eligible line, remember what was said; ask what these characters would notice | A default line for every query; repetition guards; line length; words per prompt | No overview of how events connect as content grows; studied text leaking into shipped text |
| Quests and progression | Draw a reference quest as a graph of locks, keys and payoffs; log the order and spacing of unlocks and the first appearance of each currency | None verified by the research | Graph validity; unlock spacing against the reference | Trusting this row: evidence is thin, so playtests carry the judgment |
| Onboarding and first five minutes | Tear down the reference's opening step by step: what is taught, by doing or by reading, in how many words, and what happens when the player errs | Teach by doing; at most eight words on screen at a time; hints only for players who are making the error | Words per prompt; time to first meaningful input; first-time-player tests | Placeholder waits; walls of text |
| Accessibility | Run the Xbox Accessibility Guidelines' scoping questions against a reference and against our build; capture the busiest ten seconds; run flash analysis | No cue depends on colour or sound alone; timed text adjustable; shake and background motion switchable | No more than three flashes in any second unless below the WCAG 2.3.1 thresholds; timed UI extendable to ten times its default | A warning screen in place of removing the trigger |

The research found no study method for multiplayer and social design. Treat it as first-of-kind work every time and lean on playtests.

---

## 8. Verification

### The rungs

Every work item passes rung A. The matrix says which other rungs each element type must pass.

| Rung | What it is | What it does not show |
|---|---|---|
| A. Baseline | Unit tests, a regression test per bug, parse check, lints, ownership and registry checks, real-runtime load with no console errors | Anything about quality |
| B. Moment captures | Captures of the actual moment (telegraph, hit, transition), not the idle state | |
| C. Two-up vs anchor | The new piece beside its named anchor at equal scale and speed | Whether it differs from its siblings |
| D. Sibling line-up | Every member of the set shown together | Whether each is good enough |
| E. Mechanical proof | Tile diff, pixel baseline, server-judged result, checksum parity, wherever correctness can be proved | |
| F. Clutter and scale | Size check against the player; clutter measures (feature congestion, subband entropy, edge density, compressed size) computed per region | Aesthetics. Use as a lint, and only once calibrated on the director's past verdicts |
| G. Audio | Offline render of each cue; integrated loudness and true peak (ffmpeg `ebur128`) against the anchor track; clipping check; pitch-drift check; clock-invariance test, where the same cue rendered with the clock at 0 and at 600 seconds must match. Then the director's audition page: one row per cue, A/B against its reference at matched loudness | Mechanical checks cannot say whether it sounds good. Only the audition does |
| H. Motion | Frame-stepped capture; a clip and a frame strip with per-frame timing notes; two-up beside the anchor at equal speed; loop-seam check | Whether motion is beautiful. A person judges that |
| I. Flash | Flash analysis with any reduce-flashing option off and on | Discomfort from motion or patterns |
| J. Newcomer agent | A fresh-context model sees only captures of the new thing, sound off, and says what is happening and what to do next | A pass proves little. A fail is a real signal: escalate |
| K. Real device | The director's phone plus one device of the other platform: touch reach, first sound after first tap, legibility, heat after ten minutes, rotation, backgrounding | Breadth of OS and browser versions |
| L. Playtest | About fifteen minutes with a first-time player: silent observer, cold start, no hints. Log first input, first objective, stalls over about twenty seconds, deaths. Fix quick and obvious problems before the next tester. Run one tester with sound off | Rare problems. Five testers find most common ones on average, with wide variation |

**Model judge, pre-screen only.** Ask a vision-capable model to compare the new capture against the named anchor, in both orders, and count only verdicts that agree across orders. Calibrate it on about twenty logged director verdicts; if it cannot reproduce them, do not use it. It never gates alone, and ties or close calls go to the director. Published evidence on model judges is mixed and none of it covers one person's taste.

**Loudness starting point.** For a browser or handheld game, start near −18 LUFS integrated with true peak at or below −1 dBTP, then benchmark against reference games on the target devices.

### The matrix

● required · ○ when applicable · ◐ required when first-of-kind

| Element type | Study copy reproduced | B | C | D | E | F | G | H | I | J | K | L |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Environment art | ◐ | ● | ● | ● | ● | ● | | ○ | ○ | | ○ | |
| Character or creature art | ◐ | ● | ● | ● | | ● | | ● | ○ | | | |
| Animation | ◐ | ● | ● | | | | | ● | | | | |
| Visual effect | ◐ | ● | ● | ● | | ● | ○ | ● | ● | | ○ | |
| UI, prompts, touch | ○ | ● | ● | | | ○ | | | | ● | ● | ● |
| Feel or camera tuning | ◐ | ● | ● | | | | | ● | ○ | | ● | ● |
| Music cue or sound effect | ◐ | | ● | ● | | | ● | | | | ○ | |
| Minigame | ◐ | ● | ● | ● | ○ | | ● | ● | ○ | ● | ● | ● |
| Boss or encounter | ◐ | ● | ● | ● | ● | ● | ● | ● | ● | ● | ○ | ● |
| Level or map growth | ○ | ● | ● | | ● | ○ | | | | ○ | | ○ |
| Dialogue or quest text | ○ | | ○ | ● | | | | | | ● | | ○ |
| First five minutes | ◐ | ● | ● | | | ○ | ● | ○ | ○ | ● | ● | ● |
| Shared state or infrastructure | | | | | ● | | | | | | | |

A builder may not decide on its own that a required rung does not apply. It writes "not applicable because…" and you accept or reject the reason.

---

## 9. The brief template

Use this for every work item. Fill every line; write "none" instead of leaving one blank.

```
BRIEF <id> · <element type> · first-of-kind: yes/no

1  Request       the director's words, verbatim
2  Diagnosis     what is wrong or missing today and why (cause, not symptom)
3  Read first    library entries (paths). Append what you learn. Do not re-research what is there
4  Match         anchor(s) that set the level; negative anchor(s) to stay away from
5  Differ        the sibling set, and the cell of its variety matrix this piece must occupy
6  Apply         pattern entries (name, rule, reason); "what not to copy";
                 at least two sources, one forced difference, the reference's defect we fix
7  Boundaries    the system this extends; paths you own; paths off-limits;
                 placeholders to use for shared numbers
8  Environment   branch, port and instance token are injected. Do not choose them
9  Verify        required rungs from the matrix, each with an artefact path or "n/a because…"
10 Report        rungs done; weak spots, stated plainly; rounds so far; cause tag if this is rework
11 Stop          after two failed rounds, stop building and return to the reference and the study copy
```

Lead with good examples in a build brief. Use the bad examples for judging and for retries.

---

## 10. Working with the director

The director's attention is the scarcest resource on the project. Design every interaction so that a decision takes under a minute.

- **Before a first-of-kind build:** the director picks one of three reference readings shown as real media, then one of three tiny study copies or grey-boxes.
- **Reviews are batched by kind.** Each item is shown two-up against its anchor, and each set in a line-up. One keystroke per verdict; a one-line reason on any rejection.
- **Record reactions verbatim** and turn each into a pattern entry: name, problem, rule, reason, good example, bad example. Keep the rejected capture as a negative anchor.
- **Never ask for approval from a description or a test result.** Show the image, the clip or the sound.
- **Post a daily rough reel** so nothing arrives as an end-of-task surprise.
- **Restart or deploy live services only with the director's go-ahead,** and say exactly what each restart brings in.
- **End every report with weak spots framed as decisions,** and keep `open-weak-spots.md` current.

---

## 11. Parallel work: controls

Install these in Phase 1. Put them in repository configuration, not in briefs: an agent working in its own copy may not load instruction files from that copy.

| Hazard | Control |
|---|---|
| A builder's copy starts from the wrong branch | Create copies from the named working branch, and assert at session start that the working branch is an ancestor of HEAD. Under Claude Code, worktrees branch from the remote's default branch unless `worktree.baseRef` is set to `"head"`; to start from a specific branch, use `git worktree add <path> <branch>` |
| A broad process kill takes down other agents' work | Deny `pkill` and `killall` centrally. Provide a start/stop wrapper that records its own PID and kills only that. Stronger: one container per agent |
| An agent talks to a server it did not start | Assign each agent's port by formula and inject it as an environment variable. The test client refuses any server that does not return the agent's instance token |
| A test server binds the live port | The start script exits if the port is the live port or unset, unless a director-only flag is present |
| One careless "always allow" spreads | Set deny rules centrally. Under Claude Code, an approval granted in one worktree is saved to the main checkout and applies to all of them |
| Two branches pick the same shared number | Builders write symbolic placeholders. A merge script assigns real numbers. No counter exists inside a branch |
| Two agents invent the same mechanism | An ownership file names one owner per shared system, enforced by a failing check. A committed claim file precedes any new shared mechanism; a conflict on it turns the second claimant away |
| A merge breaks the page or the build | Parse check and real-runtime load as a merge gate. Builders dry-run the merge (`git merge-tree`) before reporting. Merge one branch at a time; no further merges while the post-merge check is red |
| A placeholder survives into the shipped game | Tag placeholders in a registry with an expiry. A check fails when one sits on the first-five-minutes path or in a release build |
| A field chosen early runs out of room | Size shared fields for the long game and keep a test that guards the limit |

Isolated copies only isolate files. Ports, databases and processes still collide unless the controls above are in place.

---

## 12. Log, stop rules, retrospective

**Work log.** One row per work item:

```
id · element type · first-of-kind (y/n) · library entries used · had a "reproduced" entry (y/n)
rounds to approval · verdict · cause tag · director's reason (verbatim)
```

Cause tags: `no-anchor`, `rules-incomplete`, `perception`, `sameness`, `busy`, `collision`, `hazard`, `other`.

**Stop rule A.** After two failed rounds on one item, stop iterating the build. Go back to the reference and the study copy; the rules are incomplete or the reference was misread.

**Stop rule B.** Once a kind of work passes twice running without comment, drop it to spot checks and skip the rebuild step for it. Guidance that helps a novice becomes redundant once the pattern is proven.

**Drop criterion.** After one production run, compare rounds-to-approval for items with a *reproduced* entry against items without. If the rebuild step does not cut rounds, drop it and keep the library, the instruments and the controls, which rest on firmer evidence.

The numbers in this manual (two rounds, three options, twenty verdicts) are starting values. Tune them from the log.

---

## 13. Borrowing and homage guardrails

This section summarises commentary. It is not legal advice; raise anything uncertain with the director.

- Mechanics, genres and stock ideas are generally free to borrow. A specific work's particular expression is not: its art, text, music, characters, level layouts, or a one-to-one copy of its whole rule set with cosmetic changes. The disputes on record cluster around close copies of a single game.
- Therefore: at least two sources per shipped element, one forced difference, and a stated defect that our version fixes. A reskin does not cure a copy, and neither do added features.
- No reference asset, text or audio enters the build, not even as a placeholder on a branch that could merge.
- Homage to real people or brands is motif only: no logos, emblems, names, likenesses or signature silhouettes. Record each homage in `homage.md`. Trademark and likeness questions were not researched; flag them for a proper legal check.
- Check a reference library's terms before feeding its content to agents. At least one major game UI screenshot database is reported to bar machine-learning use.
- The reference library is a record of what was studied. That makes the transposition rule matter more, not less.

---

## 14. Known limits of this method

- The rebuild-and-diff step is a hypothesis. Section 12 is how this project tests it.
- Examples pull output toward their features, flaws included. Check each rebuild and each build for imported flaws, and keep the "what not to copy" list honest.
- When one model proposes all the references, the results converge. Ask the director to add distant references by hand.
- Every metric here is a proxy. Clutter, loudness and flash measures are lints; they flag, they do not judge.
- The newcomer agent and the model judge are filters. Neither replaces a first-time human player or the director's eye.
- Evidence is thin for quests, progression, economy and multiplayer. Expect more rounds there and schedule more playtests.
- Imitation alone keeps a follower behind the model. The stated defect our version fixes is what moves the work past its reference.

---

## 15. First-session checklist

Ask the director, in one sitting:

1. The game in a paragraph: who it is for, the feeling it should produce, platform, session length, single or multiplayer.
2. Three works they love for this game, from any medium, and what specifically in each.
3. Fixed constraints: camera, art scale and style, palette, theme, tone, input devices.
4. Anything already approved or rejected, from this or earlier projects, with reasons.
5. Any real people, brands or works the game should nod to.
6. How the agent fleet runs: isolated copies or containers, the working branch, the live port, who may restart what.
7. Review rhythm: when they want batches, and how long a batch may be.
8. Whether they want one of their own copy-based routines mapped onto the loop (Phase 0, step 6).

Then produce, before any build: a draft `macro-design.md`, `constraints.md`, the element inventory, the library skeleton, the controls from section 11 with proof that each one bites, and the first three-ups for the director to pick from.

---

## Appendix: starter resources that explain mechanisms

These explain how things work in each discipline. They do not replace references chosen for this game. Each was confirmed to exist during the research on 12 November 2026 through a summarising reader, so open the source before relying on a specific figure.

**Method**
- Franklin's own account of the hints, rebuild and compare loop: https://gutenberg.org/cache/epub/36151/pg36151-images.html
- Yacht Club's keep-and-break list for Shovel Knight, a model for writing rules as mechanisms: https://www.gamedeveloper.com/design/breaking-the-nes-for-shovel-knight
- The RITE playtest method: https://jpattonassociates.com/wp-content/uploads/2015/04/rite_method.pdf

**Art, animation, effects**
- Dead Cells colour deep dive (greyscale first, gradient maps, readability tiers): https://gamedeveloper.com/production/art-design-deep-dive-giving-back-colors-to-cryptic-worlds-in-i-dead-cells-i-
- Skullgirls animation session (making an action read in few frames): https://gdcvault.com/play/1020575/Animation-Bootcamp-Fluid-and-Powerful
- Dead Cells animation pipeline: https://habr.com/post/416589
- Ten-rule summary of Riot's VFX style guide: https://www.vfxapprentice.com/blog/10-league-of-legends-vfx-design-tips
- "Anatomy of a League of Legends missile", part 2: https://realtimevfx.com/t/anatomy-of-a-league-of-legends-missile-part-2-what-are-we-communicating-with-our-vfx/13062

**UI, feel, camera**
- Interface In Game (screenshot library): https://interfaceingame.com/about/
- "Juice It or Lose It": https://gdcvault.com/play/1016487/Juice-It-or-Lose
- "The Art of Screenshake", write-up: https://gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games
- "Scroll Back", a glossary of 2D camera behaviours: https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers

**Music and sound**
- Koji Kondo on interactive music: https://www.gamedeveloper.com/game-platforms/gdc-koji-kondo-s-interactive-musical-landscapes
- Undertale leitmotif analysis: https://www.gamedeveloper.com/audio/an-examination-of-leitmotifs-and-their-use-to-shape-narrative-in-undertale-part-1-of-2
- Loudness and reference-track practice when mastering a game: https://audiokinetic.com/en/mastering-a-game-with-wwise-part1

**Mechanics, layout, pacing, encounters**
- Rational design on Rayman Origins: https://www.gamedeveloper.com/design/rational-design-the-core-of-i-rayman-origins-i-
- The sandbox and fail-rate method: https://www.gamedeveloper.com/design/the-rational-design-handbook-an-intro-to-rld
- MDA framework: https://users.cs.northwestern.edu/%7Ehunicke/MDA.pdf
- Level design lessons from the first Zelda: https://www.gamedeveloper.com/design/learning-from-the-masters-level-design-in-i-the-legend-of-zelda-i-
- Evolutions and expansions in Super Mario World: https://code.tutsplus.com/the-super-mario-world-method-using-evolutions-and-expansions--cms-25295a
- Left 4 Dead's AI Director slides (pacing): https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf
- Boss battle design and structure: https://www.gamedeveloper.com/design/boss-battle-design-and-structure
- Iwata Asks on WarioWare (variety across a set of small games): https://iwataasks.nintendo.com/interviews/wii/warioware_smooth_moves/0/1

**Words, onboarding, quests**
- Valve's rule-matched dynamic dialogue slides: https://cdn.fastly.steamstatic.com/apps/valve/2012/GDC2012_Ruskin_Elan_DynamicDialog.pdf
- Ten tutorial tips from Plants vs. Zombies: https://www.gamedeveloper.com/design/gdc-2012-10-tutorial-tips-from-i-plants-vs-zombies-i-creator-george-fan
- Lock-and-key dungeon structure: https://www.gamedeveloper.com/design/depicting-the-level-design-of-a-legend-of-zelda-dungeon

**Accessibility**
- Xbox Accessibility Guidelines: https://learn.microsoft.com/en-us/gaming/accessibility/guidelines
- WCAG 2.3.1, flash thresholds: https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html

**Agent tooling**
- Claude Code worktrees, including the base-branch setting: https://code.claude.com/docs/en/worktrees.md
- Claude Code hooks: https://code.claude.com/docs/en/hooks
