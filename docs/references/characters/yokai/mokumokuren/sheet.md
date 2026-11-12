# Mokumokuren (目目連, "many eyes") · sheet

Brief YOKAI-01 · first-of-kind · 2026-11-12
Rank: **3 of 5** for mission 1.

## Folklore
- Lives in torn shoji (paper sliding walls), and sometimes in tatami or walls. One of the traditional inhabitants of haunted houses; the only way to remove it is to patch the holes. Said to be an invention of Toriyama Sekien. [fetched: en.wikipedia.org/wiki/Mokumokuren]
- Legend: a traveller who tried to ignore it by wrapping his head in his blanket woke to find his own eyes gone. [fetched: same]
- Sekien's plate (*Konjaku Hyakki Shui*, 1780) shows a whole latticed shoji wall with an eye in every pane, in a derelict house overgrown with weeds. yokai.com calls it "harmless, but incredibly creepy" and says its presence can signal other yokai nearby. [fetched: source/sekien-mokumokuren-1780.jpg, viewed; yokai.com/mokumokuren]

## Glimpse spec
| Field | Value |
|---|---|
| Silhouette read target | **eyes in paper** |
| Size | Each eye fist-sized, one per lattice pane, on a wall of 20-60 panes |
| Movement | Nothing but blinking and following the player with their gaze. They close in a wave when looked at directly |
| Where in our level | A torn shoji wall in a house or shop the player hides in. Paper-paned shop windows along the street |
| Trigger | The player is inside a hiding spot (director, probe 03: "walking inside of shops to hide"), or walks past a torn shoji with it in the edge of view |
| Duration | The eyes stay open while outside the central ~20° of view. All shut within 0.3 s once the player turns to them |
| Exit | The eyes shut and the holes are just holes. On a second look there is one more hole than before |
| Trace left | The torn holes themselves |
| Sound cue | Many soft, wet blinks in sequence, like pages turning, spatialised along the wall |

## Do not
- No cartoon eyeballs (a white circle with a black dot). The eyes are human, lidded and wet, mostly dark in the grey palette.
- Don't put eyes in every shoji. One wall in the mission: repetition kills it.
- It is not a threat. It watches and tells. In our use the eyes look **towards where the real monster is** (inference: a quiet hint for H8, "the antagonist changes the level").
