# Wave 3 · common brief (probe 04 fixes)

Everything in docs/briefs/wave2-common.md still applies (worktree, own files only, G contract, three r128, palette, guard absent modules, load gate, commit to own branch, merge-tree dry run, evidence labels, report under 250 words). Read it first.

What changed since wave 2: the director played probe 04. Read their verbatim feedback in docs/anchors/first-five-minutes/rejected/probe04.md and rules H14-H19 at the bottom of docs/references/_house/pattern.md. Your job is to satisfy the rules named in your brief. Decisions: docs/macro-design.md, "Decisions after probe 04".

Extra rules for wave 3:
- The game is served at http://localhost:8765/probe-04/index.html by tools/serve.ps1 from the MAIN repo, not your worktree. Use the load gate (tools\check-probe.ps1, file://) in your worktree for checks.
- Review console: press / in game (index.html). Story jump hashes: title street drop1 hunt1 drop3 bell shift-street shift-stretch shift-fold shift-grid platform ending; level-* place jumps.
- Frame time matters (H15). Do not add per-frame allocations, new shader compiles mid-play, or large draw-call counts. Build everything at init.
- Report what you could NOT verify (sound you could not hear, motion you could not see) as weak spots. Do not claim it works.
- Branch name: wave3/<you>. Worktree: ../proto1-wt/w3-<you>.
