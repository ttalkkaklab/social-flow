# Shared character panels and scene images

Use `assets/characters/<id>/` for reusable identity references. Episode images live
under `episodes/<topic>/storyboard/images/` and describe action, emotion, camera and
setting for one shot. A scene image is not a baseline reference, even if copied into
the shared directory. Keep original images; do not crop, stretch or regenerate them
merely to make a diagnostic disappear.

| Slot | Canvas | Framing |
| --- | --- | --- |
| front | 2:3 portrait, e.g. 1024×1536 | Headless front mannequin, neck/shoulders to shoes; neutral stance; visible subject height 80–90% |
| back | Same 2:3 canvas as front | Headless rear mannequin, neck/shoulders to shoes; same outfit and scale; visible subject height 80–90% |
| face | 1:1 square, e.g. 1024×1024 | Neutral forward face; complete head including hair; head height 60–75% |

The baseline has one visible face, in `face.png` only. Front/back show the outfit
and body proportions without a head or facial features. Use a headless mannequin
for body landmarks; an outfit-only ghost mannequin may hide the body entirely while
preserving the worn silhouette. Do not add a mannequin head or a blurred second face.
For unclothed stylized characters, preserve the headless torso, limbs, markings and
tail; the face panel supplies the head design. These are reference assets, not scene
anatomy: generated scenes must restore the complete character from the face reference.

Use a neutral grey background and soft even studio lighting. Keep the face neutral,
sharp and large, with the entire hair silhouette visible. Store rear-hair or unusual
head details separately when needed; do not put a second face into the body panels.
Save separate source images even when the review HTML displays them side by side.

This is our default for newly generated or explicitly revised panels, not a Seedance
API requirement. Preserve existing originals; do not bill regeneration solely to
migrate old sheets. Inspect legacy panels and describe their actual contents honestly.
The renderer's size/hash checks cannot establish that a head was removed.

Sources: Higgsfield's [single-face edit](https://higgsfield.ai/blog/cinematic_headphones)
and [ghost-mannequin workflow](https://higgsfield.ai/blog/seedance4k-breakdown).
Our front/back headless pair combines these practices; not every vendor example
removes the rear head.

Center the subject and keep front/back subject heights
within 3 percentage points. These are generation/comparison targets, not measured
physical height. They are independent of the episode's 9:16 or 16:9 video format.
Inspect the actual picture for cropping, perspective, identity and scene props.

Write `panels.json` next to `identity.md`. Slot names are front/back/face; the board
uses `panels.body` for front and `panels.face`/`panels.back` for the other two.
Example for one available slot (add the others when available):

```json
{
  "schemaVersion": 1,
  "panels": {
    "front": {
      "file": "body.png",
      "purpose": "character_reference",
      "view": "front",
      "framing": { "status": "not_reviewed" }
    }
  }
}
```

Use `purpose: "episode_scene"` for a known scene image; the shared renderer reports
the mismatch and does not assign it to the slot. Never relabel a scene merely to
clear a warning. Missing manifests retain legacy filename discovery with an explicit
unverified-purpose warning; arbitrary `reference-v1.png` files are not guessed as front.

After inspecting an actual image, an optional measurement is
`framing: {status: "measured", sha256: "<actual file hash>", subjectBox: [x,y,width,height]}`.
Coordinates are normalized to 0–1. Measure the visible headless subject, neck/shoulders to shoes, for body slots and the
head including hair for face. Do not invent the box or treat a model's self-report
as visual inspection. Changed bytes invalidate the measurement. The diagnostic
checks recorded occupancy and comparison tolerances; it cannot detect the person
or verify the truth of a box by itself. Unknown measurements stay `not_reviewed`.

Run `review-library.js <channelDir>` then `review-library.js <channelDir> --check`.
The report separates image-slot, image-purpose, image-ratio and image-framing findings
from template freshness. `ffprobe` measures actual image dimensions; an unreadable
image or unavailable probe is unverified. Board diagnostics also catch outside/shared
path mistakes and exact copies of shot backgrounds used as cast references.
Warnings guide repairs and do not create a new generation or approval gate.
