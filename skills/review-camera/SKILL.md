---
name: review-camera
description: >
  Reviews and improves cut direction; stops before Blender rendering. Use when this production stage is requested or the fixed episode workflow reaches it.
argument-hint: "[episode-or-storyboard-path]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read", "mcp__social-flow__storyboard_apply", "mcp__plugin_social-flow_social-flow__storyboard_apply"]
---

# Review Camera

Own only `camera_review`. Follow [the fixed workflow](../_shared/production-workflow.md)
for state, evidence, re-entry and stopping conditions. A completed board can re-enter here;
existing artifacts are inputs, not automatic passing evidence. Never skip prerequisites.

Require context_review and the preparation asset stages. Read
[action direction](../storyboard/references/action-direction.md) and
[shot continuity](../storyboard/references/shot-continuity.md).

Map every required audience-visible beat to one or more cuts. Register every cut ID as a
camera_review entry; entries may point to one whole-sequence review JSON. Export the camera
plan separately from mutable scenes.js and include it in review inputs. Inspect what the
viewer first notices, angle/size, focus endpoints, motivated movement or hold, actor blocking,
prop state, eyelines, action cue and final composition. Check consecutive cuts and missing
coverage of causal events; do not equate a camera technique name with executable direction.

Use an independent reviewer with fresh context. The author fixes named defects and the
reviewer rechecks the entire affected sequence. If a missing event changes the story,
return to review-context. If only the camera plan changes, remain at camera_review and
review the revised file hashes. Complete with all cut IDs covered and no unresolved
corrections. Stop before rendering or image generation.
