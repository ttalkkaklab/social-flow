# Correct camera and continuity from actual media

Use this workflow for an existing clip or scene whose motion feels unmotivated,
unstable or disconnected. Preserve the original plan and master. Keep dialogue,
voice identity, model choices and spending authorization unless the user changes them.

## Establish the shot and cut evidence

Read the containing scene and immediate neighbours in playback order. Compare the
four `visual.camera` slots, `shot.composition`, location camera, actor blocking,
source/end images and exact submitted provider request. Distinguish an intended
camera move from subject motion, a later crop and a change of shot. Shared location
coordinates cannot stand in for both an exterior view and an interior reverse shot.

Inspect actual video and adjacent outgoing/incoming action. State whether evidence
is full playback, sampled frames or unverified. Frames can show changed scale and
missing actors; they cannot establish smooth continuous timing or lip sync. A
successful call, no-text prompt or prior score does not verify the new edit.

## Repair the smallest failing layer

- Reconcile duration and action timing before another call. Compare resolved
  performance intervals with design action prose, motion beats and endpoint images.
  A four-second shot cannot approach for four seconds and release a tray at 6.5
  seconds. The ASTRA handoff uses resolved performance actions when present and
  reports omitted design action/beat text as warnings. Move every unique required
  action into that timeline; do not treat omitted wording as a completed repair.
  Out-of-range design beats are also reported, never silently stretched to fit.
- Define a move's opening, direction, purpose and landing. Keep actor screen travel
  consistent across composition, images and prompt. Prefer a held view when moving
  would lose the listener, concealment or the distance that makes the scene legible.
- Start before an action that must be shown. A woman already hidden behind a wall
  cannot demonstrate the preceding retreat. A tray already on a desk cannot start
  another lowering. Either restage the input or author the intentional action ellipsis.
- When the selected adapter supports endpoint images, derive the ending from the
  same scene and camera plan. A held camera retains perspective and background scale;
  a travelling camera needs its actual changed landing. Forward the supported inputs
  and inspect the middle too. Matching endpoints do not prove a stable transition.
- For ASTRA silent/offscreen shots with reversed contact/release order, author the
  intermediate contact state with hands still supporting the prop. The optional
  `visual.frames.keyframes` array selects the supported keyframe adapter; see
  [scenes-schema.md](../../storyboard/references/scenes-schema.md#astra-intermediate-contact-frames).
  Align its times with performance, review its fresh quote and inspect the rendered
  transition. Do not assume a contact image guarantees contact between frames.
- Restore composition before salvaging a clip with a crop. A tighter shot is an
  editorial change: check that every required actor, prop and landmark still reads.
  If a caption-free crop removes the eavesdropper, regenerate within authorization
  or use another inspected take. Do not call the altered close-up an approved
  over-the-shoulder shot. Local stabilization must retain valid source pixels, the
  planned action and a measured transformation record; it cannot repair world morph.
- When reframing a wide shot as a reaction close-up, reconcile every submitted
  prompt slot: opening, action, ending, camera, performance and
  `videoDesign.continuity`. Inherited references to an off-frame tray, desk or
  listener can cause the model to introduce them into the new crop. Describe the
  visible continuity constraints and keep off-frame prop history in planning
  context unless it is needed for the shot. Match the authored endpoint to the
  close-up; do not automatically strip words without checking the intended action.
- Match the action at a cut. Show one tray lowering and release, not a restart in an
  almost identical medium view. A deliberate insert or temporal ellipsis can work
  when its source state and continuity reason are explicit in the existing edit plan.
  Do not invent a continuous tracking shot after its middle has been discarded.

## Verify the correction

Assemble with the common builder. Check the exact revised source ranges, every
boundary and the complete final media, including face/hand continuity, landmarks,
framing drift, captions and audio preservation. Bind observations to media hashes.
An explicitly requested adversarial loop uses fixed criteria, an independent critic
and the user's target threshold. Keep unobserved checks unverified; improve actual
media rather than rerolling an unchanged review, weakening the rubric or claiming a
score for playback that nobody inspected. Store local scene reports under `data/`.

Use [host evaluation](../../_shared/host-review.md) for all judgments. Prepare with
`host_review`, inspect actual evidence, then record coverage and observations.

## Compose before rendering

Specify the subject position and apparent size, headroom, look room, required hands
and props, and meaningful foreground/background. Do not fill a portrait canvas with
empty floor unless that space serves the action. Keep an edge-positioned listener
legible and give the face room in its gaze direction. Compare the opening, middle
and ending framing before accepting a take; an opening still cannot certify the clip.

Every camera move needs a narrative purpose, onset, direction and landing. Hold the
camera when a move would distract from restrained dialogue. Preserve the intended
screen direction and check the prior endpoint against the next opening. Repair only
the failing shots, with unchanged dialogue, voice identity and generation settings.

For restrained listening, distinguish a small head turn or eye movement from a waist
bow. Specify which joints stay still and inspect the middle pose; adjectives such as
subtle alone can still produce a conspicuous bow. Reserve margin for the full moving
silhouette, including skirt and shoes, rather than checking only the face at rest.
