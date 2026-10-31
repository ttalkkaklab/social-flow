---
name: review-context
description: >
  Reviews and improves audience comprehension; stops before camera design. Use only when the user asks for a context review.
argument-hint: "[episode-or-storyboard-path]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read", "mcp__social-flow__storyboard_apply", "mcp__plugin_social-flow_social-flow__storyboard_apply"]
---

# Review Context

Runs only when the user asks for it (user directive 2026-10-31); no other step waits on it.
Follow [the production order](../_shared/production-workflow.md).

Read the existing text storyboard; this command also accepts a completed episode or
storyboard path. Preserve its ending and assets unless a demonstrated defect requires a change.
Use [character scenarios](../storyboard/references/character-scenarios.md) for observable action.

Create an audience-only export with stable beat/cut IDs, in presentation order. Include
only visible action, audible dialogue and narration. Exclude synopsis, hidden motives,
character biographies, necessity arguments, intended meaning and prior scores. At this
stage a cut ID names a required presentation unit, not a finished camera specification.

Give a fresh independent host reviewer only that export and the frozen rubric. First ask
them to reconstruct what happened without explaining the author's intention. For every
consequential transition, ask who learned what, from which visible/audible evidence,
why that supports the next choice, and what the viewer can understand at that point.
Check entrances, elapsed time, listening distance, object transfers and setup/payoff.
A character's knowledge cannot come from the writer's knowledge. A line such as “realizes
the betrayal and leaves” is not evidence that the audience saw how they learned it.

Require quoted source evidence and beat/cut IDs in audienceRead.transitions. Cover the
whole story, including silent events and the ending. Record uncertainty and missing
context before revealing intentions for comparison. Do not reward familiarity with the
premise or infer an omitted shot. Every required fact must have a planned presentation;
withheld information is valid only if the intended uncertainty remains understandable.

Have the author repair actual actions, speech or missing presentation units, not the
synopsis or reviewer report, and repeat the blind review on the revised export. Preserve
failed reports. A new reviewer sees the revised audience export without earlier verdicts.
Stop after the review; this command does not authorize images or video.
