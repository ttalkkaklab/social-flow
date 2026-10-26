---
name: generate-cut-images
description: >
  Generates cut storyboard images; stops before image review. Use when this production stage is requested or the fixed episode workflow reaches it.
argument-hint: "[episode-or-storyboard-path]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow", "mcp__social-flow__image_catalog", "mcp__plugin_social-flow_social-flow__image_catalog", "mcp__social-flow__image_plan", "mcp__plugin_social-flow_social-flow__image_plan", "mcp__social-flow__image_execute", "mcp__plugin_social-flow_social-flow__image_execute", "mcp__social-flow__image_status", "mcp__plugin_social-flow_social-flow__image_status"]
---

# Generate Cut Images

Own only `image_storyboard`. Follow [the fixed workflow](../_shared/production-workflow.md)
for state, evidence, re-entry and stopping conditions. A completed board can re-enter here;
existing artifacts are inputs, not automatic passing evidence. Never skip prerequisites.

Require blender_composition. Read [still generation](../produce/references/still-generation.md)
and [image routing](../_shared/image-routing.md). This skill generates cut images only;
character, prop and background sheets belong to preparation.

Begin image_storyboard with the same cut IDs as blender_composition. Use each corresponding
Blender image as an actual image input, alongside appearance sheets. A path in prompt prose
is not an input. Use image_plan before server or host generation; the server rejects a
missing composition reference. An adapter without image editing/reference support cannot
satisfy this stage: report it without switching the saved model silently.

Preserve the reviewed opening state, viewpoint and blocking. Generate only authorized
outputs within actual attempt/budget limits. Register and complete real decodable files;
a generation receipt is not a quality verdict. Stop and hand images to review-cut-images.

Read [shot image inputs](../storyboard/references/scenes-schema.md#shot-image-inputs).
Register the primary cut image as `image` and its ending/intermediate/reference files
as `images` under the same cut ID. Generate the planned endpoint images and pass every
image/both reference as a real tool input for each relevant still. The spatial prompt
assembler returns opening and ending reference arguments; preserve their order and roles.
Do not complete the stage with only an opening image when the plan needs more files.
