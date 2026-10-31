---
name: generate-cut-images
description: >
  Makes each shot's start image, and the end image a first_last shot needs, from its characters' sheet panels, place and props; stops before the video prompt. Use when images are requested or the episode order reaches them.
argument-hint: "[episode-or-storyboard-path]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent", "mcp__social-flow__shot_image", "mcp__plugin_social-flow_social-flow__shot_image", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read", "mcp__social-flow__image_catalog", "mcp__plugin_social-flow_social-flow__image_catalog", "mcp__social-flow__image_status", "mcp__plugin_social-flow_social-flow__image_status", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow"]
---

# Generate Cut Images

Step 6 of [the production order](../_shared/production-workflow.md) (user directive
2026-10-31): after every shot has its icon attributes and the props and backgrounds exist,
make each picture shot's start image with `shot_image`, then — only for a `first_last`
shot — its end image with `frame:"end"`. Read [still generation](../produce/references/still-generation.md)
and [image routing](../_shared/image-routing.md).

For each shot, read its story, characters, lines and icon attributes with `storyboard_read`,
then write `prompt` in English: who is where, doing what, facing which way, with which
expression and light, at the moment the shot opens (for an end image, the closing moment
and what changed). Name the place with `location` (an `SB_DOC.locations` id) and the props
seen in the frame with `props`; later calls keep them. The tool adds the size, angle, depth
and technique words, the episode style and an `Image N` line for every input, then runs
`image_plan` → `image_execute` with the saved model and the existing spending authorization.

One character's inputs are its face, headless front and headless back panels; two
characters take each face, then each front. The place goes first as the picture to edit.
A model that takes one picture refuses (`image_references_unsupported`): report it and
ask which multi-picture model to use (gpt-image, astra-genai-native, mlx); never switch
silently. A host selection returns the inputs and the save path for the host tool.

Each call writes a new versioned file under `storyboard/images/` and records
`visual.frames.start` and `visual.bg` (or `frames.end`), `visual.references`, `locationId`
and `props`. Look at every image you make before moving on; regenerate a wrong one with a
better prompt within the attempt and spending limits. Text in an image follows the GPT
Image 2 rule. Stop before the video prompt; review-cut-images runs only when the user asks.
