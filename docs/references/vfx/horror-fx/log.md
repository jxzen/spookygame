# log

2026-11-12, brief FX-01 (visual effects + screen-space effects, first of kind).
Requested by the director (probe 03 verdict): "use static more when the monster is close", "use references for exponential height fog and how we could make this much more terrifying. dig deeper into the NOIR detective aesthetic but make it japanese horror. maybe rain could help with this?", "think of how amnesia uses screen space effects and other motifiers to make the game more horrifying. lights should flicker. people's imagination is scarier a lot of the time than what is on screen."

Fetched (yt-dlp, 720p sections, frame strips and signalstats measurements):
- amnesia-tdd-low-sanity (0-47 s), amnesia-bunker-monster (300-400 s), amnesia-bunker-demo (900-990 s)
- silent-hill-2-remake (1500-1560 s, 3300-3360 s)
- blade-runner-1982-tears-in-rain (0-160 s), stray-dog-1949 trailer (0-181 s)
- ue-exponential-height-fog: Epic docs page + forum quote of the engine's height fog shader

Gaps:
- Amnesia captures are YouTube re-encodes at 720p. Fine grain or noise in the games may be lost, so "no static seen" is weak evidence.
- The Stray Dog trailer has no rain; the storm climax of the film was not captured.
- No Japanese horror film reference for rain yet (for example Dark Water, 2002, or Pulse / Kairo, 2001). This is the next fetch if the director wants the J-horror reading deeper.
- SH2 rain sections were not found in the two windows fetched; the fog and wet ground were.

Used in: docs/design/fx-spec.md, prototypes/shared/fx.js, prototypes/labs/fx-lab/.
