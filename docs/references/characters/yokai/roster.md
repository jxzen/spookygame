# Yokai glimpse roster · brief YOKAI-01 (DRAFT, 2026-11-12)

Element: characters and creatures · first-of-kind · not yet shown to the director.

Director, probe 03 verdict (verbatim): "we want other creepy things happening like little japanese folklore creatures creeping around corners and darting off before the player actually gets to them or recognizes them. please research folklore and check it out."
Also binding, same verdict: "people's imagination is scarier a lot of the time than what is on screen. the actual monster shoudl be hinted at but appear later on." and "lights should flicker."

Evidence labels: **fetched** (read this session), **search only**, **recall**, **inference**. Sources: English Wikipedia (MediaWiki API), yokai.com, Project Gutenberg (Hearn, *Kwaidan*), Wikimedia Commons public-domain prints (Toriyama Sekien 1776-1781, Hokusai, Buson, Kitao Masayoshi, Takehara Shunsen). Every image is in `<slug>/source/` with ORIGIN.txt.

## Shortlist (10)

| # | Creature | Read in 3 words | Size vs adult | Where | Glimpse in one line | Sheet |
|---|---|---|---|---|---|---|
| 1 | Akaname | crouched child, tongue | 0.5x crouched | Sento alley, wet tiles | Head and hand at a corner (Sekien's pose); snaps back when looked at; leaves a licked streak | [akaname](akaname/sheet.md) |
| 2 | Zashiki-warashi | small running child | 0.55x | Far doorway of a tatami corridor | Crosses the far door; the room is empty, a top spinning down, footprints into a wall | [zashiki-warashi](zashiki-warashi/sheet.md) |
| 3 | Mokumokuren | eyes in paper | wall of eyes | Torn shoji in a hiding spot | Eyes watch from outside central vision; shut in a wave when faced | [mokumokuren](mokumokuren/sheet.md) |
| 4 | Chochin-obake (Oiwa reading) | lantern with face | 40-60 cm lantern | Stall or arcade lantern row | A face shows only on the carried light's flicker frames | [chochin-obake](chochin-obake/sheet.md) |
| 5 | Noppera-bo | back turned, still | 1.0x | Moat side or dead food stall | Turns faceless; the light goes out (Hearn's "Mujina"); gone | [nopperabo](nopperabo/sheet.md) |
| 6 | Rokurokubi | head above wall | head at 2-3 m | Fence tops, balconies | A sleeping face over a fence, reeled back on its neck | [rokurokubi](rokurokubi/sheet.md) |
| 7 | Bakeneko | cat standing upright | 0.5x | Roof ridge against the sky | Upright cat drops to all fours and runs | [bakeneko](bakeneko/sheet.md) |
| 8 | Hitotsume-kozo | bald child, lantern | 0.6x | End of a street | A far child with a lantern turns and leaves; the eye is never resolved | [hitotsume-kozo](hitotsume-kozo/sheet.md) |
| 9 | Tenome | raised palms, searching | 1.0x stooped | Overgrown lot, graveyard | Passes through grass, palms sweeping, while the player hides | [tenome](tenome/sheet.md) |
| 10 | Ohaguro-bettari | kneeling woman, shrine | 1.0x kneeling | Shrine fence | Turns: blank white face, black-toothed mouth | [ohaguro-bettari](ohaguro-bettari/sheet.md) |

### Evaluated and cut
- **Kasa-obake** (one-eyed hopping umbrella). Wikipedia: no eyewitness folklore, "exist only in pictures", post-war "on the same level as manga characters" [fetched]. Reads comic at any speed. Cut.
- **Kodama** (tree spirits). No forest in the level, and its best-known modern image is a Studio Ghibli design (*Princess Mononoke*) [recall], which we must not copy. Cut. Its folklore echo (*yamabiko*, a delayed echo) could become a sound idea [fetched: Wikipedia, Kodama].
- **Kuchisake-onna** (slit-mouthed woman). A 1979 urban-legend panic about a woman who attacks children [fetched]. Too big for a glimpse: she is a stalker with a question-and-answer rule. Possible material for the main antagonist, not a corner glimpse. Sensitivity flags below.
- **Teke Teke** (a schoolgirl cut in half by a train, who drags herself on her elbows) [fetched]. A strong sound ("teke teke" scraping) but a graphic, recent-death and rail-suicide-adjacent premise. Cut for mission 1; see sensitivity.
- **Kitsune**. A shapeshifter, not a creature to glimpse. Folklore blames many faceless figures on foxes, tanuki or mujina [fetched: Wikipedia, Noppera-bo]. Kitsunebi (fox-fire) lights are a possible VFX reading, not studied.
- **Kawanabe Kyosai, *Kyosai Hyakki Gadan* (1889), Met Museum scans (CC0)**: two pages viewed (title page and a night-parade spread, MET 2013.767 pages 02 and 11). It shows a running parade, useful as a gait study for a scuttle, but none of the shortlisted creatures. Not filed. URL: https://commons.wikimedia.org/w/index.php?search=Kyosai+hyakki+gadan+MET

## Top 5 for mission 1

1. **Akaname**. Its source image *is* the director's brief: Sekien drew it peeking around the corner of a bath hut. Ambiguous (a child? a dog?), cheap (a peek and a withdraw), and it opens the escalation.
2. **Zashiki-warashi**. The deepest folklore (*Tono Monogatari*), and it is known **only by traces**: footprints, a spinning top, a shape. That is the director's "imagination is scarier" note as folklore. Thematic fit: the town's luck has left.
3. **Mokumokuren**. The cheapest to build (a shader on shoji) and the best fit with the hiding mechanic the director asked for. It can hint where the real monster is without showing it.
4. **Chochin-obake, Oiwa reading (Hokusai)**. It turns the director's "lights should flicker" into a mechanic: the face exists only in the flicker. Hokusai's print is the strongest public-domain image in the set.
5. **Noppera-bo**. The closer. Hearn's "Mujina" ends with "the light went out", which plugs straight into the carried light. It breaks the grammar on purpose: the one yokai that does not vanish when looked at.

Alternates in order: rokurokubi (swap for the chochin-obake: both are "faces at head height"), bakeneko (swap for the akaname as the opening beat), hitotsume-kozo (swap for the zashiki-warashi: both are child silhouettes).

## Glimpse grammar (rules)

1. **Budget.** 5-6 yokai moments in a 5-10 minute mission, about one every 60-90 s. None during a spy-action set piece, a chase or the dimension shift. Keep at least 20 s between a yokai glimpse and any antagonist beat, so the two never blur.
2. **Once each.** Each creature appears once. No creature repeats the same behaviour; if one must return, it returns as a trace only (footprints, eyes already shut).
3. **Edge of view.** They appear outside the central ~20° of view, or at the far end of a sightline, never in the middle of the screen at close range. Exception: the noppera-bo closer.
4. **Looked at means gone.** When the reticle comes within ~15° (or the carried light's beam lands on it), the creature leaves within 0.15-0.3 s. The player never gets a clean second look. Rule 3 makes the glimpse; rule 4 keeps it a glimpse.
5. **Always exit to cover.** They leave behind something: a corner, a door, a wall top, darkness. Never fade out or dissolve in plain view, which reads as a game effect, not a creature.
6. **Leave a trace.** Each glimpse leaves one physical trace the player can find (a licked streak, footprints, torn holes, a swinging lantern, a dropped sleeve). It proves they were not imagining it, without explaining anything.
7. **Never block, never harm.** Yokai don't cause a fail state, don't block the path and don't stand on the objective. Fail states belong to the antagonist (H9). Yokai are dread, not threat.
8. **Sound before or after, never with.** The cue lands just before the glimpse (draws the eye) or just after (confirms it). No music sting on the glimpse itself.
9. **Escalation, three steps.** (a) *Could be nothing*: akaname, or the bakeneko alternate. (b) *Clearly wrong but distant*: zashiki-warashi, mokumokuren. (c) *It knows you're there*: chochin-obake on the flicker, then the noppera-bo, which waits to be seen.
10. **They point at the real monster.** Late glimpses lean towards where the antagonist is (eyes look that way; the child runs away from it). The yokai are the town's surviving witnesses. This answers H8 (the antagonist changes the level) without showing the antagonist (inference).
11. **Rain hides them, light finds them.** Heavy rain and fog cover entries; the carried light makes exits. Never place a yokai where the player has no light at all, because a glimpse nobody sees is wasted.
12. **No faces in close-up, no comic cues.** No big round eyes, no hopping, no tongues waved for laughs, no towel-on-head cats. Folklore and public-domain prints are the only design sources. No modern game, anime or film creature designs.

## Cultural sensitivity

- **Yokai are living culture, not a public-domain monster bin.** Yokai still appear in Japanese children's media, tourism and local festivals (the zashiki-warashi in Tono, Iwate, for example) [recall]. Treat them with the tone of the sources: uncanny, often harmless. Making every one hostile flattens the folklore.
- **Zashiki-warashi:** one theory links it to infanticide in Tohoku [fetched: Wikipedia, citing Kizen Sasaki]. Never depict or name that. Keep the child as a departing spirit of luck.
- **Tenome:** the source figure is a blind guild member (zato). Do not make blindness the horror; drop the zato identity.
- **Ohaguro-bettari:** tooth-blackening was a real historical cosmetic practice [recall]. Don't frame it as monstrous in itself.
- **Oiwa (chochin-obake):** a named kabuki ghost from *Tokaido Yotsuya Kaidan*, the story of a murdered woman. Productions traditionally visit Oiwa Inari shrine in Yotsuya to pray before staging it, a well-known theatre custom [recall]. Use the lantern image, not her name or story.
- **Kuchisake-onna and Teke Teke** are modern urban legends about violence against women and girls. Teke Teke is built on a train death. Japan's rail network has a widely reported problem with suicides [recall]. Both are cut from the glimpse set. If kuchisake-onna is ever used for the antagonist, it needs a separate sensitivity pass.
- **Post-nuclear Japan setting (inference, flag for the whole project):** yokai in an irradiated, dead Japanese town will be read against Hiroshima, Nagasaki and Fukushima. Avoid yokai designs that read as radiation mutations (extra limbs, burns or growths as body horror). Keep them traditional figures that outlived the town, not things the disaster made.
- **Not checked:** Japanese-language primary sources and the Japanese Wikipedia were not read this session. Several English facts rest on single sources (yokai.com cites nothing). A Japanese-speaking reviewer should read this roster before it ships.

## Decisions for the director

1. Approve the top 5, or swap in alternates (rokurokubi, bakeneko, hitotsume-kozo).
2. Should yokai glimpses use the probe-03 screen static (currently reserved for "when the monster is close")? Recommendation: **no**, so static keeps meaning the monster.
3. Red: may a yokai use red (a lit lantern, a child's lantern, a tongue), or is red only for danger and the way forward? Recommendation: one red yokai at most (the chochin-obake on the final flicker).
4. Sound: a single koto pluck on traces (not on glimpses) to tie into the score, or diegetic sound only? Recommendation: diegetic only for glimpses; koto on the noppera-bo closer.
5. Story: does the zashiki-warashi leaving the town become a closing image for the mission?
