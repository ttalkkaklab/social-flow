# Dialogue coverage for generated shots

## Contents

- [Speakers and cuts](#speakers-and-cuts)
- [Author before generating](#author-before-generating)
- [Silent pictures and inner thoughts](#silent-pictures-and-inner-thoughts)
- [Worked cases](#worked-cases)

## Speakers and cuts

Each shot has at most one speaking character across on-screen speech, off-screen speech, narration and inner thoughts. Start a new shot before a different character speaks, even in the same framing. Silent listeners may remain visible. Keep line IDs, words, acting and spoken order across the cuts. The scene can still be generated in one request subject to the model’s pinned-voice capacity.

A requested one-take can have one voice. If the script needs a reply, report the conflict and retain the lines until the author chooses cuts or revises the dialogue.

The standalone LTX adapters can reference up to four visible principals. A GenAI scene references only its speakers, at most two; a silent cast member comes from the shot pictures and has no image slot of their own. Use `bystanders` for listeners whose appearance comes from the opening picture and `extras` for unnamed people. A line belongs to the shot card whose view it is spoken in. The scene is generated once. Before allocating lines, choose the visible evidence for the complete scene
using [shot-view](shot-view.md#plan-attention-across-the-scene). Then set size, angle and
delivery for each unit. A reply may stay on a meaningful detail or listener reaction;
it does not automatically need a reverse. Never ask one generated clip to invent cuts.

| Beat | Shot size and camera angle | Audio |
| --- | --- | --- |
| The speaker's expression carries new information | Speaker-facing OTS or close-up; reverse only when the reply's face matters | The on_screen speaker mouths the line; other visible mouths stay closed. |
| Words conceal an action or emotion | Insert on a tightening grip, hidden object or hesitant foot | Physical speech is off_screen when the speaking face is outside the crop; retain the speaker's identity and voice. |
| The listener's response changes the meaning | Listener reaction or their consequential action | The other character speaks off_screen; the listener does not mouth their words. |
| Distance, access or a power relation matters | Wide view, doorway framing or motivated rear view exposing the relation | Choose delivery from the actual crop, not a desire for more sizes. |
| Shared action or spatial relation | Medium/wide two-shot when the action needs both bodies | One speaks while the other listens. Give the reply its own shot. |
| Discovery before a reaction | Named observer's POV of the clue, then the changed response when needed | Silent image2video or purposeful off_screen physical speech; do not reveal the reaction before its cause. |
| Inner thought | Reaction close-up or purposeful POV/detail; no speaking mouth | image2video plus timed character TTS. |

Keep both cameras on the same side of the dialogue axis, complementary eyelines,
world positions, prop ownership, lighting and action state. A low/high angle needs a
story reason. Set size, angle, view, focus, movement and opening/closing action for each
resulting shot with `shot_icons`; then create its own opening image.

## Author before generating

1. Plan the turns before writing dialogue. Keep consecutive lines by the same character together when the action allows. For A–B–A, create three cards in playback order. Write only the spoken words in each line’s `tts` field and set `speaker` explicitly. Keep visible listeners in the shot.
   To repair an existing mixed card, read the full board and its revision. Use one `storyboard_apply` with `expectedSha256`, `shotsById` and `insertShots` to redistribute the complete line records into adjacent cards. Repair every mixed card in that board in the same patch. Preserve the line IDs, words, delivery, acting and order. Rebase performance group references, timing, scene events and transitions. Keep the old media as history and give each new card its own framing and opening image. Preview with `dryRun:true` and verify the resulting playback order when the edit is saved.
2. Keep both principal characters in `visual.character` when a listener's shoulder or
   head is visible. A silent foreground listener is still cast; who speaks
   does not decide who is visible. Omit a character only if entirely outside frame.
3. For OTS, name the foreground listener and the far, speaking face. In the reverse,
   exchange those roles while keeping cameras on the same side of the dialogue axis.
   Preserve complementary eyelines, world positions, prop ownership, lighting and action
   state; do not mirror the image or move actors to manufacture a reverse. Match the
   background view to the camera, using the shared location layout.
4. Set framing/icons and blocking for each resulting shot, then make its own start image.
   For on_screen speech, inspect actual pixels at the delivery aspect: the speaking mouth is unobstructed and
   sufficiently large; the silent listener may stay soft while the speaking face stays readable.
   Portrait layouts and foreground depth must not hide the speaking face. A frame
   label or a current receipt is not visual verification. For intentional off_screen
   speech, inspect the planned detail, listener or space instead; do not widen the crop
   to add the speaker's face. A visible hand still belongs in the cast. Explain why the
   face is outside the crop; off_screen is not a workaround for accidental occlusion.
5. Record action, closing state and sound as shot attributes. Confirm speaker positions after inspecting their image. Dialogue stays only in
   `shot_dialogue`; do not paste spoken quotes into action. For the shot’s on_screen MSR speaker, inspect
   the start image and pass `speakerBindings` with its viewer-relative position and
   appearance. Image/Audio indices are reference slots, not left/right.
   Rebuild bindings after image changes, including a reverse; never copy them blindly.
   Off_screen speech keeps its character voice/sample ownership; do not invent a visible
   face or screen position to supply a binding. A voice reference is not a framing command.
6. Plan the revised clips and reconcile duration and cost with existing authorization.
   A split is not permission to generate more media, exceed the budget or replace an
   approved clip. Changed inputs require fresh plans and the existing `video_approve`
   rules (including an existing approve-all); do not invent a new quality approval gate.
   Re-export the canonical storyboard after edits. If discovered at the video stage,
   return to the story/lines/icons/image steps; a prompt-only patch cannot fix wrong coverage.

## Silent pictures and inner thoughts

In an MSR project, use MSR only for physical dialogue
(`on_screen`, or intentional `off_screen`). Silent shots and shots containing only
`voiceover` use image2video, keeping the saved engine/model/resolution. Set
`frames.mode:"first"`, not `reference`; use the composed shot image as the first frame.
Never send inner thoughts as MSR prompt dialogue or a character voice reference.
Separate a character's physical speech and inner thoughts into shots with their own
route. Explicit silent/voiceover MSR plans report `msr_speech_route` before generation.

Set `voiceoverKind:"inner_thought"` on the line in `shot_dialogue`. It sets
`delivery:"voiceover"` and keeps the thought out of model dialogue. Use the character's own speaker ID, not
the narrator's. Retain its acting/performance metadata and explain the thought in the
story/action. Give the visual prompt the gesture that triggers the thought and the other character’s ongoing action. Omit the words, vocal direction and an addressee from the picture prompt. Keep visible mouths closed during the thought. Let the listener react to the next audible line.
Generate each line with the pinned character voice using the saved TTS provider, attach
its real audio and measure it. Use `speech_manage` timing and `compose-speech.js` to
place it at the authored lead-in, speech interval and tail-out alongside action beats.
For a frame-specific onset, set the thought's line ID in `timeline.dialogueCues`.
The mixer subtracts the shot's start frame and uses the scene frame rate. It retains
the surrounding silence through the end of the shot. Save that cue on the storyboard
before planning video. Render-time bindings may repeat the saved frame.
Retime from measured audio before `video_plan`; plan video for the full composed/action
duration and split if it exceeds the adapter limit. Never truncate a thought, accelerate
speech silently, loop footage or freeze-pad a short clip to cover missing action.

Use `generateAudio:false` for these image2video plans and `sound.audioSource:"speech"`
for thought shots so assembly uses the composed TTS track, not an old MSR soundtrack.
Silent shots need only a finite visual clock and no TTS call. If TTS is disabled or
unconfigured, report the missing speech setup; do not invent a voice or send the thought
to MSR instead. See [shot speech](../../produce/references/shot-speech.md).

## Worked cases

- **A asks, B answers, A reacts aloud:** three cards in A–B–A order. The scene gets one video request. Compare the speaking face with the evidence that changes: B's tightened grip
  under A's question, the obstacle B indicates while answering, then A's changed face.
  Use that alternative only if those actions belong to the story. OTS/reverse remains
  valid when the faces carry the change; preserve each line's speaker and authored delivery.
- **A continues for three lines:** one sustained view can carry all three; the view may
  show A, the listener or a meaningful action. Do not add cutaways just to vary the sizes.
- **Both faces readable:** keep both in frame and only the current speaker mouths the line.
- **A thinks, then speaks:** thought close-up uses image2video plus A's timed TTS;
  the next shot uses MSR for A's physical speech. The thought never animates a mouth.
- **Silent action/reaction:** image2video with no invented dialogue or TTS take.

Re-export the canonical storyboard. Already usable clips remain reusable; these rules
do not authorize paid regeneration. When a review is requested, inspect actual frames,
voices, mouth movement, thought timing, joins and omitted/duplicated lines. A successful
request or text-plan score is not proof of generated-media quality.
