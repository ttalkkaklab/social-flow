---
name: review-cut-videos
description: >
  Reviews and improves actual cut playback; stops before final assembly. Use only when the user asks for a video review.
argument-hint: "[episode-or-storyboard-path]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow", "mcp__social-flow__host_review", "mcp__plugin_social-flow_social-flow__host_review", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read"]
---

# Review Cut Videos

Runs only when the user asks for it (user directive 2026-10-31); no other step waits on it.
Follow [the production order](../_shared/production-workflow.md).

Read [host review](../_shared/host-review.md). Give an independent reviewer
the real clips, reviewed images and direction plan. Review all clips and their intended
sequence for cause/effect, action timing, physical contact, camera path, focus, prop state,
identity and continuity. Name defects by time and consequence, with the smallest repair.

Use actual playback. Sampled frames establish composition only. If playback or
independent review is unavailable, report the limitation; never convert not_reviewed into pass. Speech/audio judgments require
actual listening when requested, and no automated STT or speech-scoring loop is introduced.

The author returns to the earliest defective layer and preserves failed clips and reports.
Retry generation only within authorized attempt/spending limits and the user's approval of
each new plan. Recheck corrected clips and affected joins independently, and name the
actual video files the report covers. This stage does not publish.

Use the candidate comparison on the shared board to match the footage to its actual
adapter prompt, references and plan version. Record the smallest useful repair: trim,
audio mix, upscale, speech revision or source-plan correction. Dubbing native speech is
a choice with lip-sync consequences, not an automatic fallback. Preserve each candidate;
a regeneration gets its own request ID, output and change note only after the prior
request is terminal. Report generated shots, attached takes and reviewed shots separately.
