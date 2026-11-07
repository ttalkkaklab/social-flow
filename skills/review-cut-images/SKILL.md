---
name: review-cut-images
description: >
  Reviews and improves cut images; stops before video generation. Use only when the user asks for an image review.
argument-hint: "[episode-or-storyboard-path]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read", "mcp__social-flow__shot_icons", "mcp__plugin_social-flow_social-flow__shot_icons", "mcp__social-flow__shot_image", "mcp__plugin_social-flow_social-flow__shot_image"]
---

# Review Cut Images

Runs only when the user asks for it (user directive 2026-10-31); no other step waits on it.
Follow [the production order](../_shared/production-workflow.md).

Read [image inspection](../produce/references/still-generation.md)
and [visual grounding](../storyboard/references/narration-visual-grounding.md).

An independent reviewer opens every actual image in cut order, compares with the camera
plan (and Blender compositions when the user asked for them), then tests audience comprehension against the text. Check
visible evidence, opening state, prop hands/ownership, actor placement, identity, readable
text and style. Seeing an expressive face is not evidence of the narrated event. Future
motion cannot excuse an incorrect first frame. Cover every cut ID in the review JSON.

The author repairs the earliest affected layer: story with the story tools, camera with
`shot_icons`, image pixels with `shot_image` (a new versioned file). Preserve old media and
failed reports, and reuse unaffected files. Never spend beyond existing authorization to
chase a pass. Stop after the review.
