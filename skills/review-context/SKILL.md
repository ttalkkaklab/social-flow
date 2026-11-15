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
Use the bundled check-story.js --text and --map exports. Preserve stable shot/line IDs,
event order, speakers, actual addressees and delivery. A listener is observable staging,
not hidden motivation. Do not replace this with an action-first, speech-second summary.

Give a fresh independent host reviewer only that export and the frozen rubric. First ask
them to reconstruct what happened without explaining the author's intention. For every
consequential transition, ask who learned what, from which visible/audible evidence,
why that supports the next choice, and what the viewer can understand at that point.
Check entrances, elapsed time, listening distance, object transfers and setup/payoff.
A character's knowledge cannot come from the writer's knowledge. A line such as “realizes
the betrayal and leaves” is not evidence that the audience saw how they learned it.

Then read every line from its speaker's position immediately before it is spoken, across
all genres. For consequential or suspicious lines, cite the earlier cue, the actual listener
and what response the speaker wants. Check replies to unspoken proposals, individual facts
presented as group knowledge, effortless mind-reading, unsolicited self-explanations and
character-arc recaps. Cover every speaking character, including the narrator; record reviewed
line IDs so a whole-story verdict is not inferred from a few major transitions. Missing
history stays uncertain. Questions, lies, guesses and deliberate self-disclosure are not
automatically knowledge errors. Distinguish contradictions, missing evidence and editorial
preferences, with the strongest plausible counter-reading. Do not require dialogue to
explain ordinary inference or add a scene for every piece of background knowledge.

Require quoted source evidence and beat/cut IDs in audienceRead.transitions. Cover the
whole story, including silent events and the ending. Record uncertainty and missing
context before revealing intentions for comparison. Do not reward familiarity with the
premise or infer an omitted shot. Every required fact must have a planned presentation;
withheld information is valid only if the intended uncertainty remains understandable.

Have the author repair actual actions, speech or missing presentation units, not the
synopsis or reviewer report, and repeat the blind review on the revised export. Preserve
failed reports. A new reviewer sees the revised audience export without earlier verdicts.
Stop after the review; this command does not authorize images or video.
