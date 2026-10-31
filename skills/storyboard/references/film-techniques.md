# Technique selection

`film-techniques.js` is the shared source for the HTML, tool catalogue, canonical crop words and camera prompt instructions. It contains 4 character reference choices, 27 camera choices (the 20 techniques plus baseline/directional variants), 9 frame sizes and 5 timing purposes. Do not maintain a second icon, crop or gloss dictionary: the review tooltips read the same cards through `FILM_TECHNIQUES.guide`.

Read `storyboard_read` with `includeTechniques:true` (default). Choose from `techniqueCatalog.entries` after defining the shot's information and visible action. Every entry exposes `id`, bilingual `label`, `use`, `instruction`, `glyph` and the corresponding legacy `fields`, and is a decision card:

- `use` — the beat it serves, situation first;
- `avoid` — when to pass it over, or its common misuse;
- `pair` — where one applies, what the neighbouring shots should be (establish → cut in → reestablish; look → POV → reaction; matched sizes in shot/reverse shot);
- `specify` — what the start image and video prompt must name: crop line, endpoints, focus target, speed;
- `vertical` — where a 9:16 frame changes it, how.

A camera entry with a movement also carries `prompt`, the verb phrase `shot_prompt` writes after
"The camera" in the video model's documented camera words — pushes in, pulls back, pans, tilts
upward, static frame — with the pace and target `shot_icons` recorded ("The camera slowly pushes in
toward Mina, settling on …").

`techniqueCatalog.guides` (`VALUES` in the module) carries the same card for the `shot_icons` values without an entry: the composition sizes, the `ground` and `over` angles, the depth choices and the still-lane effects. `guide(attribute, value)` returns the entry or the card. `instruction` is the model-facing phrase that reaches the prompt — positive words, no metres, no camera-seat views; author-facing questions belong in `specify`. The cards condense the 2026-10-31 practitioner survey in `docs/research/2026-10-31-directing-technique-conventions/`. Save deliberate choices with `storyboard_apply`:

This example deliberately combines a held viewpoint with a focus reveal; it is not a
default shot template. Complete the [camera-direction pass](action-direction.md#required-camera-direction-pass)
for each beat before choosing entries. Do not copy its static choice into unrelated shots.

```json
{
  "shot": {
    "size": "ms",
    "angle": "eye",
    "techniques": [
      {"id":"camera.static","reason":"Hold the spatial relationship while the witness enters."},
      {"id":"camera.rack-focus","reason":"Reveal the witness behind the envelope without changing viewpoint.","from":"the envelope","to":"the witness"},
      {"id":"framing.ms","reason":"Keep the envelope, hands and face visible."},
      {"id":"timing.action","reason":"Allow the witness to enter, stop and become sharp."},
      {"id":"character.face","reason":"Match the witness to the shared neutral face."}
    ]
  },
  "visual": {
    "camera": {
      "movement":"static",
      "speed":"",
      "framing":"Waist-up foreground speaker with an envelope, witness beyond the right shoulder.",
      "end":"After the witness stops, shift focus over two seconds from the foreground envelope to the witness beyond the right shoulder. Camera stays fixed; the envelope becomes soft."
    }
  }
}
```

This fragment belongs inside a complete shot replacement; preserve unrelated fields. The four camera fields remain executable direction. Reasons are review context and are not emitted into provider prompts. A rack focus's `from` and `to` are: `shot_image` stages both at different distances with `from` sharp, and `shot_prompt` writes "Rack focus from … to …"; put the action cue or timing into `framing`/`end`. A technique ID provides precise shared meaning; it does not invent actor positions, focus endpoints, speed or the final crop. `techniqueFindings` reports contradictory choices as advice. Unknown IDs, duplicates and missing reasons are malformed inputs. Existing boards without selections remain readable.

Select frame size separately from actor count: a two-shot can be MS, MFS or LS. MS is waist-up; MFS ends at mid-thigh; the big close-up (`choker`) runs forehead to chin. Size is the distance: `two`, `three`, `ots`, `pov`, `back`, `cutaway` and `reaction` name a composition with no crop of its own, so a new board picks the distance and carries the composition in the cast, `camera.pov`, `camera.rear` or the camera framing. End-framing changes belong in `camera.end`, not a second starting-size selection. Static plus rack focus is valid. Static plus dolly in is contradictory. Snorricam needs body mounting and a fixed face; ordinary handheld sway is different. Dolly in changes viewpoint, zoom in changes field of view, and a dolly zoom coordinates both to hold the subject's screen size.

Character icons identify reference intent, not proof that an image was submitted. Use headless front/back mannequin references and one neutral face close-up. Restore the complete head in scene images; keep rear-hair details as optional separate references. Check actual reference paths and source images before generation.

Timing entries provide starting ranges, never duration clamps. Measured speech, performance, editing handles and provider frame limits determine the request. A two-second reply need not become seven seconds. A long take needs visible action throughout; an idle held frame does not satisfy it.

The HTML copies the catalogue locally as JS and JSON, so a reviewer or LLM can read it without network access. Expand any icon for its meaning and per-shot reason. Actual output review must compare the generated motion and chosen trim with these plans; icon presence alone does not establish quality.
