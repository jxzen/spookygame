# Score spec: mission 1 (MUSIC-01, DRAFT v0.1, 2026-11-12)

Director, probe 03: "good but needs to actually go together / be coherent. currently feels disconnected as there is no chord progression or obvious connection between what the instruments are doing. find a good japanese horror soundtrack to use as a reference".
House rules: H6 (strings plus koto), H7 (extra epic). Anchor: "Paul's Dream" (ominous orchestral base).
Japanese horror references, all measured: `docs/references/audio/yamaoka-promise-reprise`, `yamaoka-null-moon`, `ghostwire-tokyo-main-theme`.
Implementation: `prototypes/shared/score.js`. Audition page: `prototypes/labs/score-lab/`.

## 1. The one rule: one clock, one key, one progression
Every instrument reads the same transport (tempo, bar, beat) and the same current chord. No instrument picks notes on its own timer. This is the fix for "disconnected".

| What | Value | Reason |
|---|---|---|
| Key centre | **D**, for the whole mission | All three references keep one tonic in every window: G (Promise), C (Null Moon), E (Ghostwire) |
| String mode | **D Phrygian** (D Eb F G A Bb C) | Null Moon's bII bass colour. Eb over D is our dread note |
| Koto scale | **D miyako-bushi** (D Eb G A Bb) | Japanese pentatonic. It is a strict subset of D Phrygian, so koto and strings cannot clash |
| Escape lift | D Aeolian (E natural replaces Eb) | Promise's borrowed bright chord: one mode change, kept for the payoff |
| Never stops | A D drone and pedal (D1+D2, quiet), and the koto in some form in every state | Null Moon's keys band, Ghostwire's E bass and pluck thread |

## 2. Motifs (our own; no reference melody is used)
- **Leitmotif "Kage" (the spy, home).** Koto, 4 bars, written over Dm-Dm-Bb-Bb:
  `A4 D5 Eb5>D5 | A4 (held) | D5 Bb4 A4 Bb4 | (rest)`. The Eb5 is an oshi-style grace that resolves onto D: the mission cadence in miniature.
  - In escape (Aeolian), Eb becomes E and the tail climbs over Dm-Bb-F-C: `A4 D5 E5 D5 | D5 | C5 A4 | G4`. Violins double it from intensity 0.5.
  - In the castle, it is played in retrograde, slowly: the home tune heard backwards.
- **Threat motif.** `D - A - Eb`: a rising fifth that falls a tritone. Rhythm: eighth, eighth, long. Played on low spiccato strings in hunt (every other cycle), in the yokai sting, and in caught.
- **Cadence.** Eb resolving to Dm (bII-i, the Phrygian cadence) ends the explore and hunt cycles. The koto's Eb>D bend states it in one note.

## 3. Progressions per state (all start on Dm; a state change resets to chord 1)
| State | BPM (metre) | Progression (bars per chord) | Bass | Character |
|---|---|---|---|---|
| explore | 72 (4/4) | Dm(2) Bb(2) Gm(2) Eb(2) | chord roots over the D drone | legato pad; koto plays the leitmotif every 16 bars plus chord-tone plucks |
| tension | 72 (4/4) | Dm Eb/D Dm Eb/D Gm/D Eb/D Dm(2) | D pedal only | Eb/D oscillation; koto Eb>D bends; quarter-note spiccato on D |
| hunt | 144 (4/4) | Dm Bb Gm Eb (1 each) | roots | **the explore progression at 4x harmonic speed**; tremolo pad, spiccato eighths, threat motif, braam each cycle |
| hide | 72 (4/4) | Dm(2) Eb/D Dm | D pedal | string harmonics only; heartbeat at 72 = the tempo; rare koto pulls into pitch |
| castle (world shift) | 48 (4/4) | Dm Bbm/D Eb/D Dm | D pedal + hum tuned to D | Db (from Bbm) is the only out-of-key note: "wrong world"; retrograde leitmotif |
| escape | 144 (4/4) | Dm Bb F C (1 each) | roots | Aeolian lift; leitmotif in violins plus koto; driving eighths |

Tempo relationships: 48 : 72 : 144 = 2 : 3 : 6. Hunt and escape are explore's tempo doubled. The castle is two-thirds of explore (one castle beat = 1.5 explore beats).

## 4. Koto and strings share the harmony
- Strings hold the progression: a 3-voice pad voice-led (smallest total movement) inside MIDI 50-74, plus bass roots or a pedal.
- Koto plucks are chosen from **current chord tones ∩ koto scale** (escape: chord tones). Motif notes are written against their chords, and non-chord tones are only passing tones or graces on weak beats.
- Spiccato plays chord root and fifth. The threat motif uses D, A and Eb, which are all in key.
- The braam and stings use the root of the current chord, so a sting can never be in another key.

## 5. Intensity (0..1, smoothed about 0.5 s; layers switch on beats, never mid-note)
| From | Adds |
|---|---|
| 0 | drone, pad (quiet, dark filter) |
| 0.2 | koto chord-tone plucks (density rises with intensity) |
| 0.4 | moving bass roots, quarter-note spiccato (72 BPM states) |
| 0.6 | violin octave doubling, eighth spiccato, brighter filter |
| 0.8 | braam on the cycle downbeat, heartbeat/taiko thump |
Hunt floors intensity at 0.5 and escape at 0.6.

## 6. Transitions and stingers
- `setState`: applied on the **next bar line**. Hunt and caught are applied on the **next beat**, which then starts a fresh bar. Old pad voices release over 0.4 s at the change point.
- Stingers are quantised to the **next beat** (`shift` to the next bar):
  - `yokai`: koto Eb6>D6 bend plus A5; string cluster D-Eb-A swell; breath noise
  - `reveal`: koto leitmotif head (A-D) built from the current chord
  - `braam`: low brass-like hit on the current root
  - `shift`: rising noise into the next bar line, with an Eb/D cluster
  - `caught`: braam on D, the threat motif low, and the pad cut

## 7. Loudness
- Integrated **-18 LUFS** (BS.1770) for a mixed play session (explore at 0.3-0.7 intensity plus brief hunts). Hide sits around -26, hunt peaks around -14 short-term.
- True peak **<= -1 dBTP**: master gain, then a limiter (threshold -6 dB, ratio 20), then -1.5 dB output trim.
- Checked by the lab's offline render (`?offline=1`), which measures LUFS and 4x-oversampled true peak in JS.

## 8. What not to copy
No melodies, arpeggio patterns, drum patterns or recognisable motifs from the references. Only the mechanisms listed in each `hints.md`. The leitmotif and threat motif above are original to this project.
