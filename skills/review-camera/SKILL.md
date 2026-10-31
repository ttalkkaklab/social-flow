---
name: review-camera
description: >
  Reviews and improves cut direction; stops before images. Use only when the user asks for a camera review.
argument-hint: "[episode-or-storyboard-path]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read", "mcp__social-flow__shot_icons", "mcp__plugin_social-flow_social-flow__shot_icons", "mcp__social-flow__storyboard_apply", "mcp__plugin_social-flow_social-flow__storyboard_apply"]
---

# Review Camera

Runs only when the user asks for it (user directive 2026-10-31); no other step waits on it.
Follow [the production order](../_shared/production-workflow.md).

Read
[action direction](../storyboard/references/action-direction.md) and
[shot continuity](../storyboard/references/shot-continuity.md).

Map every required audience-visible beat to one or more cuts. Export the camera plan
separately from mutable scenes.js and give it to the reviewer. Inspect what the
viewer first notices, angle/size, focus endpoints, motivated movement or hold, actor blocking,
prop state, eyelines, action cue and final composition. Check consecutive cuts and missing
coverage of causal events; do not equate a camera technique name with executable direction.

Use an independent reviewer with fresh context. The author fixes named defects — render
route, size, angle, move, focus, depth and frame plan with `shot_icons`; endpoints, blocking
and eyelines with `storyboard_apply` — and the reviewer rechecks the entire affected sequence.
If a missing event changes the story, fix the story layer first. Stop before image generation.
