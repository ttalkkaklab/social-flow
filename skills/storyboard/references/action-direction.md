# Character action, camera and cutting

## Contents

- [Choose the event](#choose-the-event-before-the-technique)
- [Required camera-direction pass](#required-camera-direction-pass)
- [Camera fields](#map-purpose-to-the-existing-camera-fields)
- [Cutting](#cut-on-a-meaningful-change)
- [Verification](#verify-what-was-produced)

Use this guide when planning character-led drama, comedy or action. It is creative
guidance, not an execution gate. Keep the character identity and scenario contracts;
do not add an influencer persona, emotion score or camera-icon record beside them.

## Choose the event before the technique

Read the selected identity's wants, habits, reactions and relationships. Give the
episode a concrete obstacle and an observable consequence. A repeatable framing
device (for example a character opening and closing a vlog) is optional. Reuse the
character's traits, not an unchanged plot. Do not promise views, followers or revenue.

Write the action and reaction before choosing the camera. Use `shot.info` for the
new information, `shot.feel` for intended experience and existing `shot.cutType` for
action, reaction or insert. Keep motivation in the scenario; a smile icon cannot
explain a choice. Scene state does not rewrite the baseline character identity.

## Required camera-direction pass

Complete this pass for every production storyboard, including unattended authors, after
observable scenes and before source-image prompts. Explicit content-only work defers it.

1. Name what the viewer must notice first and what changes by the end of the beat.
2. Choose shot size, angle, camera distance and depth/focus together. Compare a held
   frame with a motivated move: approach a withheld reaction, follow a travelling subject,
   pull back to reveal a relationship, or shift focus from evidence to its observer.
3. Record the choice in `shot.techniques` with a scene-specific reason. Write the actual
   starting picture, motion pace/path and ending picture in `visual.camera`; keep
   `shot.size`, `shot.angle` and `shot.depth` consistent. For rack focus name both subjects
   and the focus order in `framing`/`end`, including the action cue or focus timing.
   `shot.techniques[].reason` and `camera.purpose` are review context; their prose is
   not copied into provider prompts. A static camera can still direct attention through focus/blocking.
4. For static, explain what the fixed frame preserves: simultaneous reactions, a tiny
   hand action, a deliberate wait or a readable spatial relationship. “Keep action legible”
   copied across unrelated beats, or action text copied into purpose, is not a decision.
   Do not supply static as a placeholder when the choice has not been made.
5. Read consecutive shots in scene order. Reconsider repeated framing, copied reasons
   and unchanging focus where the subject, discovery or pressure changes. Keep intentional
   stillness. Never alternate moves by index, enforce a moving-shot percentage or add
   spectacle that obscures acting. Explain deliberate repeated setups with their actual beats.
6. Carry these choices into image composition, motion prompts and any existing location/
   previz plan. Reassemble stale prompts after changes; do not retain `cameraFixed:true`
   for a travelling camera. Review actual footage for the intended attention shift.

Before delivery, review the actual sequence even when diagnostics are empty. Ask what a
held view would lose, whether a move reveals the answer too soon, and whether focus or
blocking can do the job more clearly. Compare opening → action cue → attention change →
landing with the next cut. Paraphrased boilerplate and an arbitrary cycle of different
moves still fail this authoring pass; word variety is not evidence of direction.
Use the [camera behavior cases](evals.md#camera-direction-without-effect-cycling) for
requested adversarial checks.

The shared checker reports missing choices/reasons, repeated reason components or landings,
action copied into rationale and all-static plans as advice,
including draft plans with camera fields. The HTML shows the same findings. Review them
and repair generic choices before presenting a completed production plan; findings alone
neither judge the art nor block tool execution. Do not invent image or motion review evidence.

## Map purpose to the existing camera fields

| Purpose | Possible camera direction | What must be specified |
| --- | --- | --- |
| Show isolation or the surrounding space | crane / pedestal up | starting subject, revealed space, ending composition |
| Sudden discovery | fast zoom in | the discovered detail and readable reaction |
| Build pressure | dolly in | approach direction, subject action, stopping frame |
| Stay with a chase | tracking / handheld | direction of travel and landmarks |
| Reveal height around a climber | rising arc | subject, height change and path; a name alone does not define a helix |
| Shift attention between depth planes | rack focus | near/far subjects and focus order; camera may remain static |
| Reveal a hidden situation | dolly out | what the wider ending frame reveals |
| Connect two targets quickly | whip pan | both endpoints, landing frame and motivated sound |

Store generated camera directions only in `visual.camera`: `movement`, `speed`,
`framing`, `end`. Follow directing-grammar and the selected adapter's vocabulary.
Rack focus is not camera translation; retain its focus instructions in the existing
framing/end and depth plan. A dramatic name such as pullback reveal describes the
purpose of a dolly out, not a new mandatory model argument. Compound moves need an
actual path or clear endpoints and must fit the adapter; do not promise exact motion
because an icon renders. Still effects use `shot.render.camera` and are labelled as
still effects, never as physical generated camera movement.

The review's camera pictogram, visible raw movement and speed are derived from those
fields by `shot-direction.js`. Unknown legacy moves retain their authored text under
a custom icon. The summary links to the expanded camera details. It is a plan, not
evidence that the returned footage followed it. No separate icon fields are stored.

## Cut on a meaningful change

Choose length from readable action, dialogue and reaction. A 1–1.5 second cut can
serve a brief impact or insert; it is not a default for every shot. Hold a difficult
action or emotional reaction long enough to understand it. Changing size, angle and
movement together is optional, not a quota or a quality score.

Use `transition` for the join entering a shot. Use `edit.reason` for its purpose and
`edit.continuity` for what crosses the boundary: action, screen direction, gaze,
prop state or sound. Camera `whip pan` and edit `whip:left` are different operations.
Use the shot-continuity workflow for concrete start/end poses, observed endpoint capture
and reference-image handoff. A generic "before action" opening or a still showing the
completed gesture cannot establish a continuous action across separately generated clips.
Review adjacent outgoing/incoming frames together. Keep prop and eyeline references
in their existing contracts; do not create a parallel continuity ledger.

The review displays planned lengths with unknown values intact. Its bars compare
shot lengths, not absolute timecode. Actual assembly uses measured media and trims;
generated source duration, usable edited duration and billed duration may differ.
Respect adapter minimum frames and include retries in actual spending authorization.
Prefer one readable action per generated shot. Multi-cut generation is optional
only when the selected adapter and inspected result support it; it does not replace
stable shot references or authorize extra generation calls.

## Verify what was produced

Inspect source images, actual motion, endpoints, neighbouring cuts and the final
edit. Record missing evidence as unreviewed; a good prompt is not a passing review.
For an existing scene, follow the [camera correction workflow](../../produce/references/camera-correction.md)
before replacing clips or cropping away defects.
For an explicitly requested quality loop, freeze criteria before reviewing, use an
independent reviewer and repair named defects. Never improve a score by weakening
criteria, shortening away required story events or relabelling generated failures.

Compare published experiments within a platform and similar age/length cohorts.
Keep camera and editing hypotheses separate from measured performance. Missing
metrics stay unknown. This sample and a reviewer score cannot establish retention,
fan loyalty or monetization. Keep the existing review-recent workflow for real data.

Source inspiration: https://www.youtube.com/watch?v=Xozqqt4seAw (2026-10-08).
The video's camera examples inform this guide; its fixed cut lengths and commercial
claims are not plugin defaults.
