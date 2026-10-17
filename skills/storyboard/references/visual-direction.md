# Direct the episode before choosing assets

## Contents

- [Plan a change the viewer can identify](#plan-a-change-the-viewer-can-identify)
- [Plan each opening frame before assigning images](#plan-each-opening-frame-before-assigning-images)
- [Hard stops before assets](#hard-stops-before-assets)
- [Review the episode, not only individual end frames](#review-the-episode-not-only-individual-end-frames)

**Automatic execution:** [Automation guidance](../../_shared/automation-guidance.md) supersedes creative quality gates, repeated approvals and review-score requirements here. Keep the concrete guidance and truthful review state. Enforce only actual runtime dependencies and the scope of external-action authorization.


Read the narration as a sequence of things the viewer must see. Write the route and reason
for each cut separately. A topic, a noun or an available tool is not a visual brief.
For narrated scenes, first apply [narration and visual grounding](narration-visual-grounding.md).
Separate information carried by the voice from the picture's specific contribution;
abstract claims and historical uncertainty do not require invented literal illustrations.

## Plan a change the viewer can identify

Use the shot table to state the subject, its visible change, composition and connection to
the previous cut. Keep this explanation in `shot.render.reason`, the camera target/reason,
the character/object action, or the chart beat; do not create another parallel manifest.

- Identity, place, mood and a document detail use `still_camera`. Prepare a real image and
  choose the focal point from that image. Alternate scale or attention when the story changes,
  not because the shot index is odd. A moving caption is not a camera move.
- A person carrying, sorting, assembling or operating something uses `character_html` when
  that process is the explanation. Plan an environment, anticipation, contact, movement and
  release. A decorative mascot waving beside text does not explain the process.
- A mechanism or material change uses `object_html`. Use articulated meshes, a relevant
  setting and a view that reveals the relationship. A labelled box cannot stand in for a machine.
- Quantitative comparisons and timelines use `data_graph` and [chart-design.md](chart-design.md).
  A date or a number mentioned in a sentence does not turn the whole sentence into a chart.
- An exact quotation or a short conclusion may use `editorial_html`. An evidence quotation
  needs its exact text and source. Show an original document as a still-camera detail when its
  appearance matters. Do not use this route to summarize every sentence on a slide.
- Choose `generated_video` only when the continuous action carries the meaning. Put the
  opening inside `SCENES`, with its actual duration and source; `PRELUDE` is rejected.
- Real footage of the actual place, era or event may take `stock_video` — a free stock or
  archive clip with its license record (scenes-schema §stock material) — where a generated or
  drawn version would be a guess. Ask `stock_search` first for `archive`, `live_action`,
  `atmosphere` and `place` cuts; the survey in
  [docs/research/2026-09-07-free-stock-sources](../../../docs/research/2026-09-07-free-stock-sources/index.html)
  lists the sources the tool does not reach. A stock clip carries no marks, its own sound is
  dropped, and it never stands in for a mechanism or a chart.

No fixed photo/3D/video quota applies. A data episode may use several appropriate charts and
a mechanism episode may stay in one 3D environment. Continuity needs evolving evidence,
framing or action. Do not rotate chart types or insert unrelated people merely to vary the screen.

## Plan each opening frame before assigning images

Shared character panels describe identity; location references describe the set. Neither is
the default opening frame for every line spoken by that character. First write each cut's
visible opening state in `shot.videoDesign.before` (or `visual.action` for a still),
`shot.size`, `shot.angle`, `shot.composition` and `visual.camera.framing`. Describe the single
moment actually pictured, including the visible prop state and recipient. Then assign its
source image. Do not build an actor-to-image lookup and distribute lines over those portraits.

Read the sequence both in playback order and grouped by recurring character/location.
Alternating two portraits can hide repetition from an adjacent-shot check. For each return,
decide what the viewer needs now: the two people's relationship, a reaction, a hand/prop
detail, or the speaker's face. Keep an established reverse shot when it serves that beat;
change scale, viewpoint or blocking when new information needs it. A smile edit, another
filename, a different render reason or a push-in label alone does not change the setup.
Avoid assigning camera moves by shot index or filling every cut with the same framing.

For example, a mistaken-interview comedy can establish the studio with a two-shot, show
the applicant's envelope when its meaning matters, isolate the tasting action, and cut to
the host's reaction when the misunderstanding breaks. These are story choices, not quotas.

`check-scenes.js` and `check-production.js` include [shot-image-review.js](shot-image-review.js):
they report shared source paths, identical local file bytes even under different names,
visually similar local stills after decoding with ffmpeg, and recurring supplied spatial
and opening-state fields across nonadjacent cuts. Findings include source paths and stable
shot IDs for side-by-side inspection. Similar-image findings group connected candidates;
not every pair in a group necessarily matches. Pair counts are complete, with at most
eight example comparisons per group to keep reports readable.
The 32×32 RGB/edge comparison catches re-encoding
and some small edits; it can miss crops, lighting changes or semantically similar scenes,
and can flag intentional matches. It is a review prompt, not a quality score or automatic
rejection. Missing, unsupported or undecodable images and remote pixels stay unverified. Read the actual images together before treating
the board as visually reviewed. Explain intentional reuse in the existing shot reason or
review notes; otherwise correct the plan and use shot-specific frames within the authorized
generation scope. A warning does not authorize regeneration or another spending allowance.

## Hard stops before assets

`render-routing.js` is shared by `check-scenes.js` and the approval page:

- Three or more cuts cannot copy the same normalized render reason.
- Text-led slides have a ceiling of two per short. In long-form they occupy at most 20% of
  generated scene duration. Each lasts at most eight seconds, including its reveals.
- `subject.kind:"type"` and kinetic text count toward that ceiling even with `motionBeats`.
  Typography cannot be relabelled as subject motion to bypass the limit.
- Every route must match its assets at production. A missing image or model is a failure,
  not permission to substitute a text plate. Correct the plan openly and recheck it.
- Chart plans declare the source values and what each spoken segment compares. Production
  uses the shared SVG chart template; a hand-written number card is rejected.

These checks reject concrete defects. They cannot establish tasteful composition or interpret
whether a declared purpose truly matches the narration. Do the visual read below as well.

## Review the episode, not only individual end frames

Make a contact sheet in playback order and inspect actual motion at the final frame rate.
Record these findings in `.work/experience-review.md` alongside the existing production review:

1. Can the subject be identified before reading the caption? Identify any cut where text is
   doing work that an image, a process or the source itself should do.
2. Do adjacent cuts advance the story visually? Flag repeated background/scale/composition
   that makes distinct events look interchangeable. Change the composition for a reason.
3. Does the opening show its promised action and end at its planned length? Check the
   assembled file, including clips inserted after the main build.
4. Do gestures contact their props, camera moves land on the intended detail, and chart
   emphasis follow the spoken comparison? Inspect group boundaries and random seeks.
5. At phone size, are the hierarchy, source, axes and labels readable without competing?

Write concrete observations and repairs, not a self-awarded style score. An unresolved
visual defect prevents readiness for publishing. Do not rewrite approved facts or add
historical actions while repairing the visuals.

All `still_camera` cuts use the unchanged shared camera HTML template and runtime, including push/pan. Non-slide video handoffs declare `visual.renderedFile` (or `visual.clip`) relative to the storyboard; assembly must use that exact file.
Camera photographs do not consume `html_plate_max`. Their duration and consecutive-still limits still apply. Never replace a useful photograph with a text verdict just to satisfy a text-plate count.
