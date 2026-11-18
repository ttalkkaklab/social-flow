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
   Follow [content-led opening views](shot-view.md): distinguish face, body detail, object,
   relationship and geography, then compare a candidate framing with a useful alternative.
2. Choose shot size, angle, camera distance and depth/focus together. Compare a held
   frame with a motivated move: approach a withheld reaction, follow a travelling subject,
   pull back to reveal a relationship, or shift focus from evidence to its observer.
   A move earns its place when something enters the frame, the subject travels, the
   frame says something new about the space by its end, or the beat turns while the shot
   runs. A face or a body that changes while the viewer watches leaves the hold and the
   approach both open, and this beat chooses between them: an approach needs its trigger
   inside the shot — a realization landing, a reaction held back until it breaks — and
   where the beat has none the size already gives the closeness. What wears out is the same
   slow approach on one close-up after another, not the approach. Where the space itself is
   the change — a reveal of scale, destruction, many people at once, a chase (the purpose
   table below) — compare a move that travels with the change and a wider size against the
   hold before choosing.
3. Set the choice with `shot_icons` — `view` (subject, reason, crop, mode and any set target),
   size, angle, camera move or still effect, focus,
   depth, render route and frame plan. Size, view and a camera move each take this beat's own
   reason. A hold, a plain cut, the episode's own route and a first or reference frame plan
   need none; the route and the frame plan take one where they are this shot's choice (a card
   in a full-video episode, a pinned end frame). It writes
   `shot.techniques` and keeps `visual.camera.movement` consistent. Then write the actual
   motion pace/path and ending picture in `visual.camera` through
   `storyboard_apply`; the starting picture is already in `visual.camera.view`. For rack focus name both subjects
   and the focus order in `framing`/`end`, including the action cue or focus timing.
   `shot.techniques[].reason` and `camera.purpose` are review context; their prose is
   not copied into provider prompts. A static camera can still direct attention through focus/blocking.
4. A hold on acting stands without a sentence. Where a hold is chosen against a move
   (step 2), its reason is what the move would have cost in that beat; text copied across
   held shots, or action text copied into purpose, is not a decision.
   Do not supply static as a placeholder when the choice has not been made, and do not
   supply a slow approach on each close-up as a placeholder for direction. `shot_icons`
   names the wide shots (els, ls, ws, fs) it left held with no reason, and
   `storyboard_read {level:"direction"}` counts the held shots by size; both report what
   was written and refuse nothing.
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
| Sudden discovery | crash zoom in action, thriller and comedy; a quiet dramatic realization takes a fast dolly in, where a snap zoom reads comic | the one landing target, the cue and the readable reaction |
| Build pressure | dolly in | approach direction, subject action, stopping frame |
| Stay with a chase | tracking / handheld | direction of travel and landmarks |
| Reveal height around a climber | rising arc | subject, height change and path; a name alone does not define a helix |
| Shift attention between depth planes | rack focus | near/far subjects and focus order; camera may remain static |
| Reveal a hidden situation | dolly out | what the wider ending frame reveals |
| Connect two targets quickly | whip pan | both endpoints, landing frame and motivated sound |
| A hero drops into the fight | static, ground angle, impact shake on the landing | the fixed low frame the body falls into and the landing pose; the camera never follows the fall |
| One decisive hit | speed ramp over the shot's move | the single moment that slows; everything before and after runs at normal speed |
| A giant's steps, a crash | impact shake over a held frame | the event behind each jolt and the stillness between jolts |
| A blast or shockwave | blast pushback | the trigger action, the source and the wider ending frame with the aftermath |
| Something thrown or fired | weapon cam | the projectile, what of it stays in frame, where it stops |
| A chase through tight space | pass-through shot, or drone dive where the route drops | each opening in order and what the runner does instead; for a dive, the one point where level flight turns down |
| Several fighters in one space | relay one-take | the handoff order and the action that motivates each handoff |
| The stand-off before the clash | arc shot, a full turn | direction, what changes during the turn (weapons drawn, the ring closing) |

The action rows name what a planner asks for, not what a model guarantees. A `first_last` frame
plan pins the landing of a crash zoom, a blast pushback, a drone dive or a hero landing with its
end image. A previz steers a path only on an adapter that takes a reference clip. Speed ramp and
impact shake reach the model as prompt sentences alone, so inspect the clip. When a relay one-take
does not come back in one piece, split it into shots and join them with a `whip:` transition,
which is an edit operation and not the camera's whip pan.

Store generated camera directions only in `visual.camera`: opening `view`, `movement`,
`speed`, and `end` (`framing` is legacy opening prose). Follow the opening-view procedure
and the selected adapter's vocabulary.
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

Choose length from readable action, dialogue and reaction. Before writing a duration, say
what sets it: a spoken line sets the length of the shot that carries it (the words and the
pause the scene needs); every other shot is set by the one visible thing it shows and the
time that thing takes to read. An insert, a glance, a reaction or an impact shows a single
small action and ends when it has been read; a 1–1.5 second cut can serve it, and that is
not a default for every shot. An insert held as long as the close-up beside it reads as one
more close-up. Hold a difficult action, a wait or an emotional change for as long as the
change takes. When neighbouring shots of different kinds come out at the same round length,
the lengths were assigned, not derived: reread each one against its action. A cut shorter than
the selected model's minimum is trimmed from a longer take in the edit (`edit.in`/`edit.out`);
the minimum is a transport limit and never a reason to lengthen the cut. Changing size, angle
and movement together is optional, not a quota or a quality score.

Use `transition` for the join entering a shot. Use `edit.reason` for the purpose of a join
other than a plain cut and `edit.continuity` for what crosses the boundary: action, screen direction, gaze,
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
Prefer one coherent performance per generated shot. It may include several lines, gestures
and responses; an individual gesture or sentence is not a shot boundary. Keep it together
while the frame conveys the event and the selected adapter can cover its full duration. Multi-cut generation is optional
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
The action rows come from https://www.youtube.com/watch?v=muYZFUNhnsI (2026-11-16), a sponsored
tutorial that shows one Seedance 2.5 result per move; its claim that a move's name alone steers
the camera is not adopted, and no other model was tested.
