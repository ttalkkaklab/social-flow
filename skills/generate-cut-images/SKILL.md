---
name: generate-cut-images
description: >
  Makes each shot's start image, and the end image a first_last shot needs, from its characters' sheet panels, place and props; stops before the video prompt. Use when images are requested or the episode order reaches them.
argument-hint: "[episode-or-storyboard-path]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent", "mcp__social-flow__shot_icons", "mcp__plugin_social-flow_social-flow__shot_icons", "mcp__social-flow__shot_image", "mcp__plugin_social-flow_social-flow__shot_image", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read", "mcp__social-flow__image_catalog", "mcp__plugin_social-flow_social-flow__image_catalog", "mcp__social-flow__image_status", "mcp__plugin_social-flow_social-flow__image_status", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow"]
---

# Generate Cut Images

For dialogue images, apply [dialogue coverage](../storyboard/references/dialogue-coverage.md).
An OTS shows the speaking far face and the silent near listener; a two-speaker two-shot
needs both mouths readable. Inspect the actual image, including portrait crops, before
handing it to video prompting. Correct the plan first if the intended coverage cannot fit.

Step 6 of [the production order](../_shared/production-workflow.md) (user directive
2026-10-31): after every shot has its icon attributes and the props and backgrounds exist,
make each picture shot's start image with `shot_image`, then — only for a `first_last`
shot — its end image with `frame:"end"`. Read [still generation](../produce/references/still-generation.md)
and [image routing](../_shared/image-routing.md).

For each shot, read its story, characters, lines and icon attributes with `storyboard_read`
and apply [content-led opening views](../storyboard/references/shot-view.md). Before making
a new image, the board author sets `visual.camera.view` with `shot_icons`: subject, crop,
viewpoint and the content-specific reason, plus a real set target for body inserts. A missing
view on an older board warns and keeps its legacy behaviour; do not treat that as an authored
decision for new production. Keep the prompt consistent with this view rather than writing
a second camera direction in prose. For a built set, inspect its target and camera first;
a missing detail target is corrected from the opening blocking, never replaced with a face.
Check that `crop` names actual frame boundaries rather than repeating `subject` or an action.
Read the neighbouring ending/opening states before a batch: preserve anatomical hand,
prop ownership and screen sides, or describe the motivated change of axis. The starting
image must leave the planned action to happen. A background panel supplies appearance
and directional geography; its full room and all landmarks need not fit a tight crop.
Then write `prompt` in English: who is where, doing what, facing which way, with which
expression and light, at the moment the shot opens (for an end image, the closing moment
and what changed). Name the place with `location` (an `SB_DOC.locations` id) and the props
seen in the frame with `props`; later calls keep them. Read the location's front/back
layout and the shot's `visual.camera.backgroundView` before calling. Set the opening
camera direction with `shot_icons.backgroundView` during icon authoring (or correct it
there before generation): `front` for the establishing direction, `back` for the opposite
side. `shot_image` selects `SB_DOC.locations[].panels.front` or `.back`, defaulting to front;
character facing, shot height and camera motion do not choose a background direction.
Without a built set, a missing back panel or a missing selected panel on a directional
sheet stops with `background_view_missing`; complete that view within existing authorization.
Only legacy front-only sheets may reuse `imageUrl` with a warning. Built sets use the
selected direction relative to their establishing camera; an opposing subject view reports
`background_view_conflict` before rendering. Correct the direction, view or blocking. Follow [asset sheets](../storyboard/references/asset-sheets.md). An end image keeps the start image's
place (`location` is refused) and records its own props in `frames.endProps`, so a prop that
appears only at the end goes in the end call. Each prop goes in through the prop ledger
([prop continuity](../storyboard/references/prop-continuity.md#production-and-review)):
hidden ones stay out, the picture matches its condition at that end of the shot, and its
description and state ride on its `Image N` line; a prop without a picture is a warning. Only `still_camera` and `generated_video` cuts
take images. The tool adds the size, angle, depth
and technique words, the episode style and an `Image N` line for every input, then runs
`image_plan` → `image_execute` with the saved model and the existing spending authorization.

Keep `size` and `view.crop` consistent: MS is waist up, MCU chest up, CU face and
shoulder tops, and FS head to toe. Explicit contradictions return `shot_framing_conflict`
before generation; correct the icons or the second framing instruction in `prompt`.
For an object or body detail with a character in the cast, set `view.subjectType` to
`object` or `detail` so person crop words do not compete with the intended subject.
Flexible-size models default to 864×1536 for 9:16 and 1536×864 for 16:9. A fixed-size
GPT model or a differently proportioned explicit `size` reports `image_aspect_mismatch`;
inspect the actual delivery crop before using that image as a video input.

One character's inputs are its face, headless front and headless back panels; two
characters take each face, then each front. The place goes first as the picture to edit.
A model that takes fewer pictures than the frame composes refuses
(`image_references_unsupported`): report it and ask which model to use — gpt-image takes up
to 16, astra-genai-native and an MLX Qwen-Image-2.1 pack up to 10, MLX FLUX.2 klein and
Mage-Flow Edit up to 4; never switch silently. GPT Image takes one format per request, so a
mixed PNG/JPEG set goes up as PNG copies in `storyboard/images/inputs/`. A host selection
returns the inputs, save path and `requestId` without replacing the active frame. Generate
with the selected host tool, save the exact requested file, inspect it, then call
`shot_image {path, id, frame, action:"complete", requestId}` without generation options.
Completion decodes the output and verifies that the saved request still matches its inputs;
it does not generate or charge again. If the request is stale, retain the candidate file
and plan from the current shot. A failed or unfinished generation keeps the old frames.

Each completed generation writes a new versioned file under `storyboard/images/` and records
`visual.frames.start` and `visual.bg` (or `frames.end`), `visual.references`, `locationId`
and `props`. A new start image takes the shot's end image off the shot with a warning,
because the end was edited from the old start; make the end image again. Look at every
image you make before moving on; regenerate a wrong one with a
better view/blocking/prompt within the attempt and spending limits. Check the visible subject,
crop, profile/three-quarter/rear side, camera height and action against the saved view;
face-reference inputs do not justify a visible face in a hand-only insert. Text in an image follows the GPT
Image 2 rule. Stop before the video prompt; review-cut-images runs only when the user asks.

`storyboard_read.imageFraming` reports whether a start image's recorded inputs are
`current`, `stale` or `unknown`, separately from file availability. Current is not a visual pass. Inspect the actual file at
delivery aspect: FS must retain both feet, MS its waist boundary, MCU its chest boundary,
and CU the intended face/shoulder crop; object/detail shots must retain their named evidence.
Compare the result with the opening action as well as the label. Correct the earliest
wrong input and regenerate within existing authorization; never mark unviewed pixels as
verified. An edit inherits its source's framing status and cannot turn stale source
evidence into current evidence. Use normal generation when changed shot inputs need
new references, blocking or a different place.

Inspect the exact returned version, not an older preview or contact-sheet thumbnail.
Check hand/prop continuity against its neighbours as well as the single-frame composition.
In a requested review, record the inspected path and file hash with the finding so later
replacement cannot inherit a review of different pixels. File existence, input freshness
and visual judgment are separate evidence; none stands in for the other two.

When the saved shot is correct but the model drew the wrong crop, use
`shot_image {editExisting:true, reframe:true, frame:"start", ...}`. This uses the
generated image as the sole reference and recompiles the saved size, crop and viewpoint
at the current delivery aspect.
Describe the opening action and the observed correction in `prompt`: for example,
"Zoom in until the bottom edge cuts through mid-chest; leave a narrow margin above
the hair. Eyes look slightly camera-left, lips closed and relaxed." Do not change the
icons to excuse a wider generated image. For a CU, inspect whether the crown and
shoulder tops meet the authored boundaries; retaining a whole chest is not a CU.
Preserve visible identity and clothing while correcting expression copied from a
reference sheet. Inspect the new file again and repeat within existing authorization.
Keep each failed version and its observation; a delivered image is not verified by
its label, request receipt or `imageFraming.current` alone.

If a text-only reframe keeps the wrong body extent, inspect that new image and pass
`sourceCrop:{x,y,width,height}` with `reframe:true`. Coordinates are pixels in the
saved source, not in a scaled preview. Choose the rectangle from visible anatomical
boundaries, keep it inside the source and match the output aspect. The tool prepares
a separate cropped reference with a source hash and rectangle receipt, then calls
the saved image model to generate the final image. The crop itself is not delivered
as generated output. In this call, describe the opening action/expression in `prompt`
without asking for another zoom. Inspect the model's output again: it can still
widen the crop or alter identity. If the needed view lies outside the source, use
normal generation or a text-only reframe; never cut away required feet or hands to
fit a rectangle. Do not guess coordinates without viewing the actual source.

## Targeted revisions

For a correction to an existing frame, call `shot_image` with `editExisting:true`.
Write only the requested change in `prompt`; use `preserve` for explicit invariants.
The saved frame is the sole image input, its dimensions are reused unless `size` is
specified, and the output is a new version. Omit `location` and `props`; update their
storyboard metadata first if the revision changes them. A start revision still makes
its old end image stale. A plain edit does not reassemble the scene; `reframe:true`
explicitly reapplies the saved opening composition and is only for a start image.

Keep confirmed identity attributes in their original language when no faithful English
translation is available. Do not delete clothing because its description mentions a
head, hood or other body part. Describe the intended crop separately. Known Qwen edit
routes use concise character reference roles instead of repeating the sheet's appearance.
Scene lighting is authored per shot; the compiler does not add uniform brightness.
