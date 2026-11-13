# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A game in pre-production, run with the **copywork method**. A human director holds the taste and makes the calls; Claude is the integrating agent and runs parallel builder and scout subagents. The procedure is `docs/process/copywork-method-agent-manual.md`. Read it before acting on anything beyond a small fix. The director's instructions override the manual; record each deviation in `process/worklog`.

The game: single-player, first-person Japanese horror spy game. An American spy is stranded in a post-nuclear, rainy, dead Japanese town and must get home. Scope is one first mission of 5–10 minutes (Epic MegaJam, theme "director's cut"). Unreal Engine is the end goal; everything now is browser prototypes. The current state of every decision is in `docs/constraints.md` and `docs/macro-design.md`. The director's word-for-word verdicts, turned into rules, are in `docs/references/_house/pattern.md` (H1–H10). Some early picks were reversed (Spirited Away → Silent Hill/Alan Wake), so read the latest entries.

## Layout that spans many files

- `docs/references/<element-kind>/<slug>/` is the reference library, the project's memory. Each entry has `source/` (real captured media plus `ORIGIN.txt` with URL and retrieval date), `sheet.md` (measurements), `hints.md` (one mechanism rule per line plus "what not to copy"), and `log.md` (evidence label and the director's verbatim verdicts). Evidence labels: *reproduced*, *fetched*, *search only*, *recall*, *inference*. Recall and inference never justify a build.
- `docs/anchors/<kind>/` holds approved captures and `rejected/` negative anchors, each with the director's verbatim reason.
- `docs/design/` holds design specs produced by agents (level plan, FX, score, monster, world shift).
- `process/` holds `worklog` (one row per work item plus `D#` deviation rows), `open-weak-spots.md`, `registry`, `owners` and `claims/`.
- `prototypes/style-probe-NN/index.html` are self-contained, playable probes, each published as a claude.ai Artifact for director feedback. Each is a frozen record of one round; make a new `style-probe-NN` rather than editing an old one.
- `prototypes/shared/*.js` are reusable plain-script modules attaching globals (`window.HorrorFX`, `window.Score`, `window.WorldShift`).
- `prototypes/labs/<name>/index.html` are standalone test pages for one system.
- `prototypes/assets/<name>/` holds Blender output: `src/` (bpy scripts / `.blend`), `*.glb`, `previews/`, `viewer.html`.

## Prototype tech constraints

- three.js **r128 UMD only**: `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`. Example classes (GLTFLoader, EffectComposer and so on) come from `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/...`. No ES modules, no other hosts: the Artifact CSP blocks them.
- All textures and audio are generated in code (canvas textures, WebAudio synthesis). No reference asset, text or audio may ever enter a prototype or `shared/`; study media stays in `docs/references/**/source/`.
- Probes store director feedback in the Artifact `db` capability (`feedback/probeNN`); read it with the ArtifactData tool.
- Palette rule: black, white, grey; red is the only colour.
- Probes expose `#hash` capture hooks (e.g. `#street`, `#hunt`, `#castle`, `#title`) that jump to a state, for screenshots.

## Commands

On Windows, PowerShell sessions don't see winget-installed tools until PATH is reloaded:

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
```

- Fetch reference video (≤720p, optionally a segment): `yt-dlp -f "bv*[height<=720]+ba/b[height<=720]" --merge-output-format mp4 --write-info-json [--download-sections "*00:10:00-00:12:00"] -o "<dir>\source\clip.%(ext)s" <url>`
- Contact sheet with timestamps: `ffmpeg -i clip.mp4 -vf "fps=1/10,scale=256:-2,drawtext=fontfile='C\:/Windows/Fonts/arial.ttf':text='%{pts\:hms}':x=4:y=4:fontsize=16:fontcolor=yellow:box=1:boxcolor=black,tile=6x5" -frames:v 1 -update 1 sheet.jpg`
- Loudness (rung G): `ffmpeg -i track.wav -af ebur128 -f null -`. Target −18 LUFS integrated, true peak ≤ −1 dBTP.
- Headless check of a probe or lab (the equivalent of tests; look for `Uncaught` in stderr, then view the PNG):
  ```powershell
  Start-Process chrome.exe -ArgumentList '--headless=new','--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files','--enable-logging=stderr','--virtual-time-budget=6000','--window-size=1280,720','--screenshot=<out.png>','file:///<path>/index.html#castle' -RedirectStandardError err.txt -Wait
  ```
  SwiftShader renders slowly, so time-based states (flashes, fades) lag behind the virtual-time budget. Prefer hash hooks that jump past them.
- Headless Blender (parallel-safe): `"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b --factory-startup --python script.py`. Export GLB with `+Y up` for three r128. Only one agent at a time may drive the director's live Blender through the Blender MCP.

## Working conventions specific to this project

- Show the director real media to pick from (three at a time: two near, one distant reference), never a description to approve. Record their words verbatim; they become pattern entries.
- Review batches take at most 15 minutes of the director's time. Ask tone questions early.
- Parallel agents get disjoint output directories and must not commit; the integrator reviews and commits. The manual's Phase-1 controls (worktrees, merge gate, registry assignment) are not yet installed. Install them before coding builders share files.
- Large media (`*.mp4`, `*.webm`, `*.wav`, …) under `docs/references/**/source/` is git-ignored and kept locally only.
- Work on branch `dev`. Commit messages end with the `Co-Authored-By` line.
