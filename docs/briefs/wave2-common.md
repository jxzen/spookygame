# Wave 2 · common brief for every builder (probe 04)

You are one of several builders working IN PARALLEL, each in your own git worktree on your own branch. The integrator merges branches one at a time. Read this whole file, then your own brief.

## The game (one paragraph)
Single-player first-person Japanese horror spy game. An American spy, stranded in a rainy, dead, post-nuclear Japanese town at night ("Kagemachi"), collects three dead drops while Kagenui (a 1.2 m crouched, flash-burnt onryo) hunts him, rings the shrine bell, walks through a ~90 s world shift (an impossible castle driven by an unseen koto player), and escapes aboard a shinkansen to spy-thriller music. About 8 minutes. Horror first; spy second.

## Read before you build (all in your worktree)
- docs/macro-design.md (bottom: "Decisions after wave 1"), docs/constraints.md, docs/references/_house/pattern.md (H1-H13)
- docs/design/level-plan-mission1.md (+ -map.svg): the town, beat timeline, monster ladder, hiding, escape geometry, numbers
- docs/design/monster-design.md, docs/design/world-shift-design.md, docs/design/fx-spec.md, docs/design/score-spec.md, docs/references/characters/yokai/roster.md
- prototypes/probe-04/core.js: THE CONTRACT. Shared state, events, module registration, asset loading, input. Do not edit it.
- prototypes/probe-04/index.html: HUD element ids and which module owns each. Do not edit it.

## Rules
1. Write ONLY the files your brief lists. Everything else is read-only. If you need a change in core.js, index.html or another module, do not make it: write it in your final report under "Requests to integrator" with the exact change.
2. Talk to other modules only through G (state fields you are allowed to write, G.on/G.emit events). Never reach into another module's internals.
3. three.js r128 only (already loaded). Load models with G.loadGLB('<dir>/<file>.glb') (paths under prototypes/assets/). No new CDNs, no ES modules, no npm.
4. Palette: black, white, grey; red is the only colour (H5). Everything procedural or from prototypes/assets/. No reference media (anything under docs/references/**/source/) may be loaded by game code.
5. Missing collaborators: your module must run when the others are absent (e.g. no level: walk on a flat plane; no monster: never hurt). Guard every read of another module's data.
6. Verify with the load gate (the merge gate): from your worktree root run
   powershell -NoProfile -File tools\check-probe.ps1 -Hash "jump=<phase>" -Out <png>
   It must print PASS. Look at the screenshot with the Read tool. Add a capture hook for your feature via G.jump (#jump=...) if useful; the mission module owns the meaning of jump phases, so coordinate by reading G.jump yourself only for your own feature names prefixed with your module name (e.g. #jump=monster-hunt).
7. Commit to YOUR branch only (git add <your files>; git commit). End commit messages with: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>. Do not push, do not merge, do not touch other branches.
8. Before reporting, dry-run the merge: git merge-tree $(git merge-base HEAD main) main HEAD  and confirm no conflict markers in its output.
9. Evidence labels on any factual claim about a reference: fetched / search only / recall / inference.

## Final report (under 250 words)
Files and commit hash · what works (with screenshot paths) · the load-gate result · requests to integrator · weak spots stated plainly · decisions for the director.
