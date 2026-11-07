---
name: generate-cut-images
description: >
  Makes each shot's start image, and the end image a first_last shot needs, from its characters' sheet panels, place and props; stops before the video prompt. Use when images are requested or the episode order reaches them.
argument-hint: "[episode-or-storyboard-path]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent", "mcp__social-flow__shot_icons", "mcp__plugin_social-flow_social-flow__shot_icons", "mcp__social-flow__shot_image", "mcp__plugin_social-flow_social-flow__shot_image", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read", "mcp__social-flow__image_catalog", "mcp__plugin_social-flow_social-flow__image_catalog", "mcp__social-flow__image_status", "mcp__plugin_social-flow_social-flow__image_status", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow"]
---

# Generate Cut Images

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

One character's inputs are its face, headless front and headless back panels; two
characters take each face, then each front. The place goes first as the picture to edit.
A model that takes fewer pictures than the frame composes refuses
(`image_references_unsupported`): report it and ask which model to use — gpt-image takes up
to 16, astra-genai-native and an MLX Qwen-Image-2.1 pack up to 10, MLX FLUX.2 klein and
Mage-Flow Edit up to 4; never switch silently. GPT Image takes one format per request, so a
mixed PNG/JPEG set goes up as PNG copies in `storyboard/images/inputs/`. A host selection returns the inputs and the save path for the host tool; the
review page shows that frame as pending until the file is there.

Each call writes a new versioned file under `storyboard/images/` and records
`visual.frames.start` and `visual.bg` (or `frames.end`), `visual.references`, `locationId`
and `props`. A new start image takes the shot's end image off the shot with a warning,
because the end was edited from the old start; make the end image again. Look at every
image you make before moving on; regenerate a wrong one with a
better view/blocking/prompt within the attempt and spending limits. Check the visible subject,
crop, profile/three-quarter/rear side, camera height and action against the saved view;
face-reference inputs do not justify a visible face in a hand-only insert. Text in an image follows the GPT
Image 2 rule. Stop before the video prompt; review-cut-images runs only when the user asks.

## Targeted revisions

For a correction to an existing frame, call `shot_image` with `editExisting:true`.
Write only the requested change in `prompt`; use `preserve` for explicit invariants.
The saved frame is the sole image input, its dimensions are reused unless `size` is
specified, and the output is a new version. Omit `location` and `props`; update their
storyboard metadata first if the revision changes them. A start revision still makes
its old end image stale. Use normal generation for a new composition.

Keep confirmed identity attributes in their original language when no faithful English
translation is available. Do not delete clothing because its description mentions a
head, hood or other body part. Describe the intended crop separately. Known Qwen edit
routes use concise character reference roles instead of repeating the sheet's appearance.
Scene lighting is authored per shot; the compiler does not add uniform brightness.
