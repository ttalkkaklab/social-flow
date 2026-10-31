---
name: generate-cut-videos
description: >
  Writes each generated_video shot's video prompt, then makes its video after the user approves that shot (or every shot); stops before assembly. Use when videos are requested or the episode order reaches them.
argument-hint: "[episode-or-storyboard-path]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent", "AskUserQuestion", "mcp__social-flow__shot_prompt", "mcp__plugin_social-flow_social-flow__shot_prompt", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read", "mcp__social-flow__video_catalog", "mcp__plugin_social-flow_social-flow__video_catalog", "mcp__social-flow__video_plan", "mcp__plugin_social-flow_social-flow__video_plan", "mcp__social-flow__video_approve", "mcp__plugin_social-flow_social-flow__video_approve", "mcp__social-flow__video_execute", "mcp__plugin_social-flow_social-flow__video_execute", "mcp__social-flow__video_status", "mcp__plugin_social-flow_social-flow__video_status", "mcp__social-flow__speech_manage", "mcp__plugin_social-flow_social-flow__speech_manage", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow"]
---

# Generate Cut Videos

Steps 7–8 of [the production order](../_shared/production-workflow.md) (user directive
2026-10-31). Read [video model selection](../produce/references/video-model-selection.md)
and [duration planning](../produce/references/video-duration.md).

**Prompt.** After every picture shot has its images, write each `generated_video` shot's
prompt with `shot_prompt`. Give `action` (what moves from the opening picture), `end` (the
closing picture) and `sound` in English; the tool builds the rest from the shot's icon
attributes — camera move and speed, focus, and on an MSR shot its size, angle and depth —
and quotes its on-screen lines. MSR's lines and image bindings are added by `video_plan`.

**Approval.** Plan each shot with `video_plan` (it sends the stored prompt when args name
none, and on MSR the start image rides in the background slot). Before `video_execute`,
show the user that shot's prompt, start (and end) image and cost, and ask: approve this
shot, approve every shot from now on, or change something. Record a yes with
`video_approve {planIds:[…]}` and an approve-all with `video_approve {auto:true}`, each
with the user's own words. Never call `video_approve` without their answer; `video_execute`
refuses a plan without one (`video_approval_required`). A changed prompt, image or model is
a new plan and needs a new yes unless auto is on. `render-astra-shot.js` runs only after the
same yes.

**Generate.** Run `video_execute` within the saved models and existing budgets; use
`video_status` after an interruption. Import usable existing clips instead of regenerating.
Bind a clip with on-screen dialogue through `speech_manage attach_video`; an MSR clip binds
as `native`, with no line audio (shot-speech.md adapter layer). Look at each clip before
assembly. Stop before assembly; review-cut-videos runs only when the user asks.
