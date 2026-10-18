---
name: review-cut-images
description: >
  Reviews and improves cut images; stops before video generation. Use when this production stage is requested or the fixed episode workflow reaches it.
argument-hint: "[episode-or-storyboard-path]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read"]
---

# Review Cut Images

Own only `image_review`. Follow [the fixed workflow](../_shared/production-workflow.md)
for state, evidence, re-entry and stopping conditions. A completed board can re-enter here;
existing artifacts are inputs, not automatic passing evidence. Never skip prerequisites.

Require image_storyboard. Read [image inspection](../produce/references/still-generation.md)
and [visual grounding](../storyboard/references/narration-visual-grounding.md).

An independent reviewer opens every actual image in cut order, compares with the Blender
compositions and camera plan, then tests audience comprehension against the text. Check
visible evidence, opening state, prop hands/ownership, actor placement, identity, readable
text and style. Seeing an expressive face is not evidence of the narrated event. Future
motion cannot excuse an incorrect first frame. Cover every cut ID in the review JSON.

The author repairs the earliest affected layer: story -> review-context; camera ->
review-camera; geometry -> compose-blender; image pixels -> generate-cut-images. Rewind
that stage, preserve old media and failed reports, and reuse unaffected files. Revalidate
invalidated stages in order. Never spend beyond existing authorization to chase a pass.
Repeat independent inspection until no unresolved correction remains. Stop after image_review.
