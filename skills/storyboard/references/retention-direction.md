# Story, picture and sound that earn the next beat

Read this alongside scenario-stage.md when drafting candidates, and again when building
the board. Produce and autoproduce carry its decisions into the finished edit. These are
editorial tests, not measured retention predictions. A reviewer score cannot guarantee
that viewers finish a video.

## Contents

- [1. Write a situation worth following](#1-write-a-situation-worth-following)
- [2. Map the promise to the edit](#2-map-the-promise-to-the-edit)
- [3. Direct the change the viewer should notice](#3-direct-the-change-the-viewer-should-notice)
- [4. Score the story with supported controls](#4-score-the-story-with-supported-controls)
- [5. Check the finished experience](#5-check-the-finished-experience)
- [Worked fictional beat](#worked-fictional-beat)

## 1. Write a situation worth following

Read [story-quality.md](story-quality.md) first. Establish the supported content and ending
before the opening. Its optional-CTA rule overrides any mandatory closing question here;
modern examples and emotional reversals are tools, not requirements for every subject.

Before drafting, identify the viewer, the specific thing they want to find out, and what
changes for them when they find it out. Start with a concrete action, contradiction,
choice or unresolved result. Let the subject supply the stakes. A quiet discovery can
carry an episode; fear, comedy and outrage must fit the material and the channel.

Keep scenario-stage's seven items. Apply these tests inside those items, without adding
another candidate form:

- Write three openings that differ in their dramatic situation and route to the payoff.
  Changing only the adjective, question or camera leaves the same candidate underneath.
- In the hook, make the viewer able to predict something. Put a visible or spoken clue
  beside that prediction. The promise must name a question the episode can actually answer.
- In each development item, give an answer, evidence, consequence or changed interpretation
  that makes the next item matter. Connect the items with a cause or an obstacle. If they
  connect only as "and another example", revise their relationship or shorten the item.
- Give the viewer something early. Withhold the complete answer on a short as the existing
  arc requires, but pay a useful piece in the first drip. "Wait until the end" and repeated
  questions are not progress. On answer-first long-form, show the result early and make
  the method, limitation or difficult choice the reason to continue.
- Plant a true detail before a turn that changes its meaning. State uncertainty where the
  evidence needs it. Never manufacture a popular misconception, danger, quote or causal
  link to make a reversal possible. If the evidence has no reversal, use discovery or a
  demonstrated consequence.
- Make the present-day cases do different work: one establishes the pattern, another
  tests its boundary or changes what the viewer would do. They still need their own sources.
- Resolve the main promise before the comment invite. The callback should let the opening
  mean something more specific on a second viewing. A next-episode teaser cannot pay this
  episode's debt. Keep the closing question brief and answerable from what just happened.

Read the narration aloud without the board. Mark the first sentence where attention
could wander and the exact missing development. Cut throat-clearing and duplicated
conclusions. Alternate setup with a short landing line where the material calls for it;
do not turn every sentence into a cliffhanger or punchline.

## 2. Map the promise to the edit

After narration approval, put a compact table under storyboard.md's existing "hand to
produce" note. This is an index of decisions, not a second script. Refer to scene and
narration-group identifiers in scenes.js; never copy the spoken lines into the table.
For channels that skip scenario research, start here from their approved narration.

| Scene/group | Question carried in | New evidence or action | Visible change | Sound event | Payoff destination |
|---|---|---|---|---|---|
| identifier | what the viewer expects now | what changes their expectation | subject's before → after state | supported field or explicit silence/bed carry | scene/group that answers it, or resolved here |

Every narrated scene gets a row; split by group when the evidence or sound event changes.
For each deliberately opened question, point to its payment. Include the main payoff and
the closing callback. Long-form may resolve a question within a chapter; do not keep all
answers until the ending. When scenes.js changes, update the references in this table.
scenes.js remains the source of truth for words, timing, assets and sound fields.

Read consecutive rows as a viewer. At each boundary, name what they know now that they
did not know before. A deliberate anticipation hold may delay a change, but name what is
about to happen and keep the hold only as long as the action or reading needs. A camera
zoom by itself does not count as new information.

## 3. Direct the change the viewer should notice

For each shot, identify the subject, its starting state, the action or reveal, and the
ending state. Use the existing visual slots and slide.motionBeats; do not invent new
renderer fields. Carry a recognisable object, spatial direction or visual motif between
related shots so the viewer can follow the cause and result.

- The opening video must stage the hook's situation immediately. A generic attractive
  person or landscape that could open any episode fails this test.
- Use the short's one optional extra generated clip only when its action earns the slot.
  Keep the hook-video rule and the two-generated-cut cap. Stills can reveal a detail with
  their camera move; HTML motion slides can show a comparison or a mechanism unfolding.
- Put explanations, arrows, figures and principles on HTML slides. Nothing is drawn over
  video except the already permitted subtitles and cover treatment. Follow CLAUDE.md.
- Cut when the evidence changes, the action completes or the audience's expectation turns.
  Vary shot scale and pace with that job. A proof needs reading time; a reaction may need
  only a moment. Fast cutting, arbitrary shakes and a transition on every sentence cannot
  repair a scene with nothing happening.
- On a slide, reveal the evidence with its spoken group. Let the decisive movement finish
  before the next idea starts. On video, specify a usable ending state so the edit can
  connect to the following shot without looping an unfinished action.
- Delete expendable material and recalculate duration. Do not stretch the other shots to
  restore a target runtime. If a format minimum still applies, add useful sourced material
  or revise the scope before approval.

## 4. Score the story with supported controls

Read produce/references/bgm-scoring.md for the mix contract. Choose the musical texture
from the episode's feeling and voice, then place changes where the story changes. A sparse
bed, an unscored line or a restrained physical sound can do the job. More layers do not
automatically improve the scene.

In the table, map every intended event to a supported control:

- `sound.cue` selects a declared window.MUSIC cue at a shot boundary on the attended path.
  Resolve asset cues before building and include generated cues in the approved cost plan.
- `sound.drop: true` removes the bed for the shot. Spend the short's single drop on the
  line that needs room, on the turn for a story arc. This does not mute voice or SFX.
- `sound.sfx` names an existing channel asset and plays at the shot's first frame. Use it
  for a visible event or a specific transition, not as a whoosh on every cut. If the impact
  happens mid-shot, use the documented segment manifest route in produce §6 or omit the
  effect. Do not claim a word-level cue that the current renderer cannot schedule.
- `visual.audio` describes generated clip audio. Motion backgrounds discard that audio;
  an essential sound must have a supported mix route. B-roll keeps its own sound under
  the existing no-narration contract. Never plan dialogue over that slot.
- Voice delivery follows the profile's engine and voice. Mark emphasis and breathing in
  the handoff, using only controls that engine supports. For local TTS, adjust sentence
  boundaries and punctuation and listen to the result; it has no emotion control. Never
  put acting directions into spoken text or change voice to obtain an effect.

Autoproduce uses one bed, without window.MUSIC or sound.cue. Design its contrast with
supported drops, resolved SFX and scene rhythm from the outset. Missing sound assets require
a documented substitute or omission that still delivers the beat. If the story depends on
the unavailable sound, hold the episode. Do not add unpriced generation or exceed the cap.

## 5. Check the finished experience

Produce checks the final video after splicing and speedup, at delivery speed. Write findings
in `.work/experience-review.md`: final-file name, scene/group, actual time, observed problem,
and correction or verified result. This is observation, not a new timeline to maintain.

1. Watch the opening, the first payment, the turn, the full payoff and the ending in motion.
   On a short, watch the whole video once without scrubbing. On long-form also watch every
   chapter transition and check each promise's payment. Confirm the table's changes actually
   appear and have enough time to read.
2. Listen to the delivered mix, including the quietest spoken line, the strongest SFX,
   music changes, loop joins and b-roll boundaries. Check voice intelligibility at a modest
   playback volume, harsh transients, clipped syllables, audible seams and an abrupt tail.
   Use the existing measured separation and peak checks as well; a numeric pass alone
   does not establish that the words are intelligible.
3. Check the payoff with sound off for readable evidence and subtitles, and listen once
   without the picture for a comprehensible story. Sound-off inspection does not mean
   adding labels to video or repeating all narration in large titles.
4. Fix the earliest weak beat. For a timing or mix change, rebuild affected output and
   recheck the changed span plus its joins at final speed. A narration change returns to
   the existing narration/approval rules. Report unavailable playback or listening as
   unverified. Screenshots cannot verify sound, rhythm or sync; unattended output with an
   essential unverified experience check stays on hold.

The content reviewer consumes this report with the final frames and build report. Distinguish
observations from editorial predictions. After publication, compare actual retention and
drop-off points with the predicted weak beat when channel metrics exist; change one story
or editing choice in the next episode. Never invent a completion-rate lift.

## Worked fictional beat

A fictional puzzle asks which of two identical boxes contains a ringing timer. The hook
shows one box trembling. The first drip reveals that the table itself is shaking. The
next beat stops the table and lets the viewer hear the other box. The payoff opens that
box; the closing callback returns to the misleading movement. The sound supplies evidence
at a planned boundary, the early clue is true, and each beat changes the prediction.

For a factual episode, replace the puzzle with verified events and evidence. Keep the
relationship between expectation, clue and payment; do not copy the fictional facts or
force the same twist onto every topic.
