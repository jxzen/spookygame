# Horror FX: hints (mechanism rules, and what not to copy)

## Rules we take

1. **Fear is a state, not a flash** (Amnesia TDD, fetched). The sanity hit drops luma about 24 % in 0.5 s and then holds for about 10 s with ghosting and a slow roll. Our fear effects ramp in fast and decay slowly (attack about 0.2 s, release about 1-2 s). Nothing strobes.
2. **Edges first** (Bunker, fetched). Stress shows at the screen edge: the edge goes darker and redder (about +5 Cr) while the centre stays readable. Our vignette tightens and bleeds dark red with fear; the centre stays clean so the player can still navigate.
3. **Static means "it is near"** (director: "use static more when the monster is close"; Silent Hill radio, recall). Static is the proximity meter. It rises with fear squared, so it is almost absent at low fear and loud at the end, plus short bursts whose rate rises with fear.
4. **Fog is height-based and grey** (UE docs + SH2, fetched). Density falls with height, so the ground is buried and the rooftops and sky darken. The fog is neutral grey (SH2 chroma 128 +/- 1.5). At night we keep the same law but a dark fog colour; with fear the fog thickens and its start distance pulls in.
5. **Rain only shows in light** (Blade Runner, fetched). Rain streaks are lit only by lamps and the flashlight, so a dark street looks dry and a lit cone looks drenched. This is the noir read.
6. **Hard light needs something in the air** (Blade Runner shafts, Stray Dog dust). Lamps get visible cones; shafts follow the lamp's flicker.
7. **Wet surfaces carry the light** (SH2 puddles, Blade Runner rims). Puddles are low-roughness patches that reflect lamps; walls are only damp.
8. **Lights flicker in clusters** (director: "lights should flicker"). One dip, then often two or three quick follow-ups, then quiet. Rates and depth rise when the monster is near the lamp, which is what H8 asks for ("the antagonist changes the level").
9. **Hint, don't show** (director: "people's imagination is scarier"). The phantom is a soft dark figure in the periphery for 0.4-1.1 s, only above fear 0.45, and never in the centre. The real figure stays in fog and silhouette.
10. **Red is the only colour** (palette rule). Desaturation keeps red pixels red, and fear tints toward red at the edges only.

## Do not copy

- Amnesia's warm orange candle grade and the Bunker's sepia: wrong palette.
- Blade Runner's teal/orange grade and neon hues: take the structure, not the colour.
- Silent Hill's daytime white fog as-is: our street is at night; use the height law, not the brightness.
- Any HUD, inventory, logo or UI frame from the captures.
- The Amnesia "faint to black" as a punishment loop. It is a fail state, not an effect.
- Strobe-like flicker. A full-screen swing faster than 3 times per second breaks WCAG 2.3.1. Every big luminance change goes through the flash limiter.
- The Bunker dynamo flashlight as a mechanic. It belongs to a design discussion (recall only), not to FX.
