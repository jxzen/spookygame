# Monster: log

- 2026-11-12. Brief MONSTER-01. Director on probe 03: "nah make it much creepier and rigged... feels like slenderman... hinted at but appear later on."
- Fetched four PD prints from Wikimedia Commons (one request every 5 s after a 429 rate limit). Fetched two motion clips (yt-dlp, 480p) and made contact sheets (ffmpeg). Read three design articles (Amnesia "birth of a monster", the Shibata interview, "Designing the Uncanny"). The flash-shadow fact and the creature-design tips are search only.
- Concept: **Kagenui**, an onryo that is the flash-shadow peeled off a wall. See docs/design/monster-design.md.
- Build v1 (skin-modifier body + cards, 6.3k tris, 32 bones, auto weights). Previews: it read as a hooded insect; hair formed rigid planks sticking out sideways; the lunge reached straight up; the crawl was unreadable; the peek had no wall to judge it.
- v2: fixed the hunch (head below the shoulders, hair counter-rotated), wrong-way second elbow, wider flat torso, lunge angles. The side view now reads as "folded".
- v3/v4: crawl rebuilt from a hip tilt (horizontal body). Head drooped and rolled 75 degrees. Thin face curtain with a gap at the red eye. Peek uses an IK target baked to keys; the lean moved to the hips bone (a Y-rotation on a bent spine twisted instead of leaning). Found that `Select-Object -First` was killing the render step, so one round of previews was stale; re-rendered.
- Verified in three.js r128 (headless Chrome, swiftshader): 6 clips, 6,514 tris, 32 bones, no Uncaught errors.
