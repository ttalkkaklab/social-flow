# Studio slide quality contract

Read this while planning every editorial HTML slide, before storyboard approval. The visual
reference is `docs/research/2026-09-04-rendered-object-slide/reference-slide.html`, the
repository's self-contained copy of the user's `social-flow-3d-object-slide.html` (identical
SHA-256, verified 2026-09-05). It sets the target: a lit studio, substantial objects, restrained type and a subject whose
image changes with the sentence. Copy the visual system, not its disc, colours or historical claims.

## Planning gate

Every editorial diagram declares `quality: "object-state-v1"` and `subject` in scenes.js.
`check-scenes.js` rejects missing contracts, including in draft mode. Do not approve the
storyboard or start paid generation while that check fails. Existing output files are not
rewritten; an old storyboard submitted for a new build must acquire this plan first.

```js
quality: "object-state-v1",
subject: {
  kind: "object",
  changes: [
    { group: 1, before: "disc reclined", after: "disc face visible", driver: "geometry" },
    { group: 2, before: "blank clay", after: "45 stamps pressed into clay", driver: "surface" }
  ]
}
```

There is one change per narration segment, in group order. Name observable states and the
actor that changes. A camera push, glow, label reveal or `sv:"settle"` is not a subject change.
The states and any numbers must agree with the research and narration.

- `object`: a physical thing is the explanation. Drivers are `geometry`, `surface`,
  `articulation`, or `spatial`. Use `slide.object` and a baked render. Surface detail, moving
  parts, occlusion and lighting must respond to the object's change. Moving a flat cutout
  or zooming the same image does not qualify. A spatial change shows the actual relationship
  between rendered actors, not a turntable for decoration.
- `data`: an abstract quantity or relationship is the explanation. Drivers are `value` or
  `relation`. Use a count, fill, ordered rail or causal relation. Do not relabel a physical
  subject as data to avoid rendering it.
- `type`: a verdict or evidence phrase is the picture. Driver is `type`. State what changes
  in the argument. This is not a substitute for a physical mechanism or statistical chart.

The schema checker validates the declared structure, not the truth of the classification.
The author must compare the subject to the narration before approval and again on the frames.

## Production gate

Use the studio material already in `motion-slide-template.html`: top-left key light,
cyclorama, lit edges, slab thickness, contact and spread shadows. Type stays in the safe
zone while the ground has restrained parallax. Keep one graphic accent, readable local
type, mask-rise text and plate-first staging. Object material can have its own subdued colour.

Read `rendered-object.md` for baking and placement. The bundled baker supports a disc;
it does not render every subject. For another subject, implement and test a reproducible
baker with the same PNG/sidecar contract before proceeding. Keep its recipe with the episode.
If no suitable renderer is available, report that limitation and stop; do not silently
substitute a still, change the subject or make a paid API call.

`check-slide.js` checks the plan against the sidecar and runs `object-sheet.js` on
object-state sheets. Wrong dimensions, discontinuous ranges and repeated/frozen pixels
fail. The motion renderer runs this preflight too, so rendering directly cannot skip it.
Pixel difference is necessary but does not prove good motion or correct geometry.

Render using measured narration lengths. For every group, inspect early, middle and final
frames and the transition into the next group. Record in `.work/slide-quality-review.md`:

| Scene/group | Promised subject change | Observed change | Material/light | Continuity/phone zone | Verdict |
|---|---|---|---|---|---|

Compare the object itself, with labels and arrows mentally removed. Check thickness,
surface detail, a consistent light direction, readable silhouettes and purposeful motion
through the spoken sentence. A frozen cutout with moving labels is a failure even if every
machine check passed. Check actual playback for timing; frames alone do not verify it.
Do not invent a numerical quality score. An unavailable visual/playback check is unverified,
not a pass. Fix a failed cut before assembly; if the supported lane cannot meet the reference,
show the failed frame and request direction. Never mark the episode ready on a missing review.
