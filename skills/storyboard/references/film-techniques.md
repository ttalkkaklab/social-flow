# Technique selection

`film-techniques.js` is the shared source for the HTML, tool catalogue, canonical crop words and camera prompt instructions. It contains 4 character reference choices, 27 camera choices (the 20 techniques plus baseline/directional variants), 9 frame sizes and 5 timing purposes. Do not maintain a second icon or crop dictionary.

Read `storyboard_read` with `includeTechniques:true` (default). Choose from `techniqueCatalog.entries` after defining the shot's information and visible action. Every entry exposes `id`, bilingual `label`, `use`, `instruction`, `glyph` and the corresponding legacy `fields`. Save deliberate choices with `storyboard_apply`:

```json
{
  "shot": {
    "size": "ms",
    "angle": "eye",
    "techniques": [
      {"id":"camera.static","reason":"Hold the spatial relationship while the witness enters."},
      {"id":"camera.rack-focus","reason":"Reveal the witness behind the envelope without changing viewpoint."},
      {"id":"framing.ms","reason":"Keep the envelope, hands and face visible."},
      {"id":"timing.action","reason":"Allow the witness to enter, stop and become sharp."},
      {"id":"character.face","reason":"Match the witness to the shared neutral face."}
    ]
  },
  "visual": {
    "camera": {
      "movement":"static",
      "speed":"focus shifts smoothly over two seconds",
      "framing":"Waist-up foreground speaker with an envelope, witness beyond the right shoulder.",
      "end":"Camera stays fixed. Witness is sharp in the background; envelope is soft."
    }
  }
}
```

This fragment belongs inside a complete shot replacement; preserve unrelated fields. The four camera fields remain executable direction. A technique ID provides precise shared meaning; it does not invent actor positions, focus endpoints, speed or the final crop. `techniqueFindings` reports contradictory choices as advice. Unknown IDs, duplicates and missing reasons are malformed inputs. Existing boards without selections remain readable.

Select frame size separately from actor count: a two-shot can be MS, MFS or LS. MS is waist-up; MFS ends at mid-thigh. End-framing changes belong in `camera.end`, not a second starting-size selection. Static plus rack focus is valid. Static plus dolly in is contradictory. Snorricam needs body mounting and a fixed face; ordinary handheld sway is different. Dolly in changes viewpoint, zoom in changes field of view, and a dolly zoom coordinates both to hold the subject's screen size.

Character icons identify reference intent, not proof that an image was submitted. Use the complete front, back and neutral face baseline. A faceless costume derivative is optional. Check actual reference paths and source images before generation.

Timing entries provide starting ranges, never duration clamps. Measured speech, performance, editing handles and provider frame limits determine the request. A two-second reply need not become seven seconds. A long take needs visible action throughout; an idle held frame does not satisfy it.

The HTML copies the catalogue locally as JS and JSON, so a reviewer or LLM can read it without network access. Expand any icon for its meaning and per-shot reason. Actual output review must compare the generated motion and chosen trim with these plans; icon presence alone does not establish quality.
