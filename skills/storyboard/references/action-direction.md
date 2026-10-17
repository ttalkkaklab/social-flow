# Character action, camera and cutting

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
