---
name: generate-cut-videos
description: >
  Generates cut videos from the cut images (reviewed only when the user asked); stops before video review. Use when this production stage is requested or the episode workflow reaches it.
argument-hint: "[episode-or-storyboard-path]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow", "mcp__social-flow__video_catalog", "mcp__plugin_social-flow_social-flow__video_catalog", "mcp__social-flow__video_plan", "mcp__plugin_social-flow_social-flow__video_plan", "mcp__social-flow__video_execute", "mcp__plugin_social-flow_social-flow__video_execute", "mcp__social-flow__video_status", "mcp__plugin_social-flow_social-flow__video_status", "mcp__social-flow__astra_genai_catalog", "mcp__plugin_social-flow_social-flow__astra_genai_catalog", "mcp__social-flow__astra_genai_desktop_text2video", "mcp__plugin_social-flow_social-flow__astra_genai_desktop_text2video", "mcp__social-flow__astra_genai_desktop_img2video", "mcp__plugin_social-flow_social-flow__astra_genai_desktop_img2video", "mcp__social-flow__astra_genai_desktop_audio2video", "mcp__plugin_social-flow_social-flow__astra_genai_desktop_audio2video", "mcp__social-flow__astra_genai_desktop_extend", "mcp__plugin_social-flow_social-flow__astra_genai_desktop_extend", "mcp__social-flow__astra_genai_desktop_retake", "mcp__plugin_social-flow_social-flow__astra_genai_desktop_retake", "mcp__social-flow__astra_genai_desktop_keyframes", "mcp__plugin_social-flow_social-flow__astra_genai_desktop_keyframes", "mcp__social-flow__astra_genai_desktop_status", "mcp__plugin_social-flow_social-flow__astra_genai_desktop_status"]
---

# Generate Cut Videos

Own only `video`. Follow [the fixed workflow](../_shared/production-workflow.md)
for state, evidence, re-entry and stopping conditions. A completed board can re-enter here;
existing artifacts are inputs, not automatic passing evidence. Never skip prerequisites.

Require image_storyboard; image_review is done only when the user asked for it. Read [video model selection](../produce/references/video-model-selection.md)
and [duration planning](../produce/references/video-duration.md).

Register every video cut with its shotId, a stable text plan and actual/planned video path.
Use video_catalog -> video_plan -> video_execute with saved models and existing budgets.
Host handoffs also require a plan. Carry the reviewed images, camera endpoints and action
into the real provider inputs. Optional animated previz follows adapter capabilities.

Import usable existing clips instead of regenerating unchanged content. Local rendered
motion cuts also register their actual clips for review; static assets are not fake videos.
For an entirely still/HTML project, register its actual rendered motion output, not a token
placeholder. Record files, durations and provenance; do not mark motion quality as passed.
Complete video only after readable video streams exist. Stop before assembly and hand
clips to review-cut-videos. Raw speech generation keeps its separate provenance policy.

Read [shot image inputs](../storyboard/references/scenes-schema.md#shot-image-inputs).
Use the args returned by video_plan: it maps authored start/end and video/both references,
checks adapter limits and returns imageBindings with file hashes and dimensions. Compare
that inventory with the board. A host handoff has unverified mapping, not a submission
receipt; inspect the actual host schema before attaching all intended files. Unsupported
combinations require an explicit plan correction, never dropped references or a model switch.
