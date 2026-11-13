# Spy reference + build log

Evidence labels: [FETCHED] downloaded this session; [EXTRACTED] frames pulled from a fetched file; [SEEN] I looked at the image; [INFERRED] my reading, not verified.

- 2026-11-12 [FETCHED] Commons "The Maltese Falcon trailer(1941).webm" (20.6 MB) via Special:FilePath. Commons API search was rate-limited (HTTP 429/"too many requests"), so the licence field was not re-read; Commons category "Film trailers in the public domain" [INFERRED from search snippets].
- 2026-11-12 [FETCHED] Commons "The Big Sleep trailer (1946).webm" (45.2 MB).
- 2026-11-12 [EXTRACTED] Frames from both trailers and from the existing docs/references/characters/alan-wake-2-launch/source/clip.mp4 (read only) with headless Blender VSE (no ffmpeg on this machine): prototypes/assets/spy/src/extract_frames.py. Contact sheets reviewed [SEEN]; chosen frames copied into each source/.
- [SEEN] Big Sleep 01129: belted trench, collar up, wide lapels, dark tie on white shirt. Drove lapels, collar, value stack.
- [SEEN] Maltese Falcon 01870: fedora + coat in action, brim cuts the face. Drove brim width and the head-turn framing.
- [SEEN] AW2 01261: flashlight held at chest height in the right hand, arm in dark sleeve, beam in fog. Drove the FP arms layout.
- Not obtained: Alan Wake 2 official concept art (ArtStation feature 403), Max Payne / L.A. Noire official art (no reliable official URL found in time). Gap: no character-design sheet from a game; refs are film frames + one game trailer.
- Build passes 1-3: see sheet.md "Two-up notes". Previews in prototypes/assets/spy/previews/.
- [SEEN] three.js r128 check: viewer.html in headless Chrome (SwiftShader) logged VIEWER_OK; spy.glb 4556 tris, 19 bones, clips idle 4.03 s / walk 1.03 s / title 5.00 s; fp-arms.glb 928 tris, 8 bones, clips idle_sway 3.03 s / reach 1.20 s. No console errors.
