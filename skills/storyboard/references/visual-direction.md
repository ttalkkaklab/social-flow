# Direct the episode before choosing assets

Read the narration as a sequence of things the viewer must see. Write the route and reason
for each cut separately. A topic, a noun or an available tool is not a visual brief.

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

No fixed photo/3D/video quota applies. A data episode may use several appropriate charts and
a mechanism episode may stay in one 3D environment. Continuity needs evolving evidence,
framing or action. Do not rotate chart types or insert unrelated people merely to vary the screen.

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
