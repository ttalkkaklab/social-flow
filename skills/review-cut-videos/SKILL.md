---
name: review-cut-videos
description: >
  Reviews and improves actual cut playback; stops before final assembly. Use when this production stage is requested or the fixed episode workflow reaches it.
argument-hint: "[episode-or-storyboard-path]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow", "mcp__social-flow__host_review", "mcp__plugin_social-flow_social-flow__host_review", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read"]
---

# Review Cut Videos

Own only `video_review`. Follow [the fixed workflow](../_shared/production-workflow.md)
for state, evidence, re-entry and stopping conditions. A completed board can re-enter here;
existing artifacts are inputs, not automatic passing evidence. Never skip prerequisites.

Require video. Read [host review](../_shared/host-review.md). Give an independent reviewer
the real clips, reviewed images and direction plan. Review all clips and their intended
sequence for cause/effect, action timing, physical contact, camera path, focus, prop state,
identity and continuity. Name defects by time and consequence, with the smallest repair.

Use actual playback. Sampled frames establish composition only and cannot complete this
stage. If playback or independent review is unavailable, report the limitation and keep
the stage incomplete; never convert not_reviewed into pass. Speech/audio judgments require
actual listening when requested, and no automated STT or speech-scoring loop is introduced.

The author returns to the earliest defective layer and preserves failed clips and reports.
Retry generation only within authorized attempt/spending limits. Recheck corrected clips
and affected joins independently. Bind the final report to all actual video hashes and
cut IDs with coverage video_playback and no unresolved corrections. Complete video_review;
produce can then assemble and perform its final delivery checks. This stage does not publish.
