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
[shot continuity](../storyboard/references/shot-continuity.md) and
[dialogue coverage](../storyboard/references/dialogue-coverage.md). Test its worked cases
against each speaking shot: an exchange one view holds, a reply whose evidence needs another
view and two faces that both read. Challenge a profile two-shot whose speaking mouth cannot be read. Inspect the whole sequence
for speech ownership, eyelines and preserved lines; these findings are guidance, not gates.

Apply [scene attention](../storyboard/references/shot-view.md#plan-attention-across-the-scene).
Challenge a sequence whose voices are correctly assigned but whose pictures only identify
the current speaker. Name missing action, object, discovery or spatial evidence and compare
an alternative; changing size labels or inserting decorative props is not a repair.
Check emotional behavior across joins until its visible cause of change, not one face at
a time. Preserve justified sustained faces and inspect purposeful off_screen coverage
without demanding a speaking face inside its crop.

Use [shot boundary decisions](../storyboard/references/shot-boundaries.md) and
`storyboard_read.boundaryReview` to challenge every playback join against an uninterrupted
scene. Preserve justified cuts; fewer shots alone is not improvement.

Map every required audience-visible beat to one or more cuts. Export the camera plan
separately from mutable scenes.js and give it to the reviewer. Inspect what the
viewer first notices, angle/size, focus endpoints, motivated movement or hold, actor blocking,
prop state, eyelines, action cue and final composition. Check consecutive cuts and missing
coverage of causal events; do not equate a camera technique name with executable direction.

Use an independent reviewer with fresh context. The author fixes named defects — render
route, size, angle, move, focus, depth and frame plan with `shot_icons`; endpoints, blocking
and eyelines with `storyboard_apply` — and the reviewer rechecks the entire affected sequence.
If a missing event changes the story, fix the story layer first. Stop before image generation.
