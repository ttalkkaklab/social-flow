# Dialogue coverage for generated shots

## Contents

- [One speaking character per shot](#one-speaking-character-per-shot)
- [Author before generating](#author-before-generating)
- [Silent pictures and inner thoughts](#silent-pictures-and-inner-thoughts)
- [Worked cases](#worked-cases)

## One speaking character per shot

Each shot carries lines from at most one character (user directive, 2026-11-09).
Split at every speaker change, including a reply in an otherwise readable two-shot.
Consecutive lines by the same speaker can share a shot. A → B → A needs three shots;
never gather A's nonconsecutive lines and lose the reply's order. Keep line IDs, exact
words, delivery, acting, pauses and reactions. This reduces MSR speaker-assignment risk;
it does not guarantee model adherence.

A shot may still show two principal characters: the listener stays silent. Choose size
and angle after allocating lines. Do not reuse the original two-shot camera plan on
both halves or ask a single generated clip to invent the reverse cut.

| Beat | Shot size and camera angle | Audio |
| --- | --- | --- |
| Face-to-face exchange | Speaker-facing medium/medium close-up OTS, then complementary reverse | Only the far visible character speaks; foreground listener stays silent. |
| Small emotional change | Close-up at eye level or a motivated three-quarter angle, mouth readable | One speaker's consecutive lines. |
| Shared action or spatial relation | Medium/wide two-shot when the action needs both bodies | One speaker only; reply gets its own shot. |
| Listener reaction, insert or establishing view | Reaction close-up, relevant detail or wide view | No dialogue: image2video. Purposeful off-screen physical speech retains one explicit speaker. |
| Inner thought | Reaction close-up or purposeful POV/detail; no speaking mouth | image2video plus timed character TTS. |

Keep both cameras on the same side of the dialogue axis, complementary eyelines,
world positions, prop ownership, lighting and action state. A low/high angle needs a
story reason. Set size, angle, view, focus, movement and opening/closing action for each
resulting shot with `shot_icons`; then create its own opening image.

## Author before generating

1. Before `shot_dialogue`, split the planned exchange at every speaker change and
   compare the single speaking identity with the planned visible face. For an existing
   multi-speaker board, repair it before final `shot_icons`. Snapshot the complete affected
   shots and narration records before splitting. Create the reverse story with `story_shot`, then set its `shot_characters`.
   `story_shot` appends a new shot to its scene: read it back, then move the complete new
   record immediately after the source with one `storyboard_apply` using `removeShotIds`
   and `insertShots:[{afterId:sourceId,shots:[completeNewShot]}]`. Keep its stable ID;
   reconcile positional references (including the inserted shot's `eyeline.matchShot`) to
   the final order and verify other shots still target the intended IDs after the move.
   Redistribute lines with `shot_dialogue`, processing the source before the destination
   to release transferred line IDs. Supply each shot's complete remaining line list.
   Preserve IDs, words, order, speaker and delivery. This tool does not accept `acting`
   and only preserves it for lines already in that destination: restore transferred acting
   and other authored performance fields from the snapshot with `storyboard_apply.shotsById`
   using complete current shot records, not partial replacements. Do not attach the original
   whole-shot video/audio to a new shot as if it were newly verified. Reconcile speech/media
   bindings with the existing speech workflow; retain old files as provenance. Compare all
   before/after line records for omissions, duplicates and acting loss. Reconcile story/event
   links, performance groups, transitions, continuity and speech-derived timing.
2. Keep both principal characters in `visual.character` when a listener's shoulder or
   head is visible. A silent foreground listener is still cast; one speaking character
   does not mean one visible character. Omit a character only if entirely outside frame.
3. For OTS, name the foreground listener and the far, speaking face. In the reverse,
   exchange those roles while keeping cameras on the same side of the dialogue axis.
   Preserve complementary eyelines, world positions, prop ownership, lighting and action
   state; do not mirror the image or move actors to manufacture a reverse. Match the
   background view to the camera, using the shared location layout.
4. Set framing/icons and blocking for each resulting shot, then make its own start image.
   Inspect actual pixels at the delivery aspect: the speaking mouth is unobstructed and
   sufficiently large; the silent listener may stay soft while the speaking face stays readable.
   Portrait layouts and foreground depth must not hide the speaking face. A frame
   label or a current receipt is not visual verification.
5. After images, write `shot_prompt` action/end/sound in English. Dialogue stays only in
   `shot_dialogue`; do not paste spoken quotes into action. For an MSR speaker, inspect
   the start image and pass `speakerBindings` with its viewer-relative position and
   appearance. Image/Audio indices are reference slots, not left/right.
   Rebuild bindings after image changes, including a reverse; never copy them blindly.
6. Plan the revised clips and reconcile duration and cost with existing authorization.
   A split is not permission to generate more media, exceed the budget or replace an
   approved clip. Changed inputs require fresh plans and the existing `video_approve`
   rules (including an existing approve-all); do not invent a new quality approval gate.
   Re-export the canonical storyboard after edits. If discovered at the video stage,
   return to the story/lines/icons/image steps; a prompt-only patch cannot fix wrong coverage.

## Silent pictures and inner thoughts

In an MSR project, use MSR only for a single character's physical dialogue
(`on_screen`, or intentional `off_screen`). Silent shots and shots containing only
`voiceover` use image2video, keeping the saved engine/model/resolution. Set
`frames.mode:"first"`, not `reference`; use the composed shot image as the first frame.
Never send inner thoughts as MSR prompt dialogue or a character voice reference.
Separate a character's physical speech and inner thoughts into shots with their own
route. `shot_dialogue` and `video_plan` report `shot_speaker_limit` for multiple speakers;
explicit silent/voiceover MSR plans report `msr_speech_route` before generation.

Mark an inner thought `delivery:"voiceover"` with the character's own speaker ID, not
the narrator's. Retain its acting/performance metadata and explain the thought in the
story/action. Keep visible mouths closed and omit speech text from the video prompt.
Generate each line with the pinned character voice using the saved TTS provider, attach
its real audio and measure it. Use `speech_manage` timing and `compose-speech.js` to
place it at the authored lead-in, speech interval and tail-out alongside action beats.
Retime from measured audio before `video_plan`; plan video for the full composed/action
duration and split if it exceeds the adapter limit. Never truncate a thought, accelerate
speech silently, loop footage or freeze-pad a short clip to cover missing action.

Use `generateAudio:false` for these image2video plans and `sound.audioSource:"speech"`
for thought shots so assembly uses the composed TTS track, not an old MSR soundtrack.
Silent shots need only a finite visual clock and no TTS call. If TTS is disabled or
unconfigured, report the missing speech setup; do not invent a voice or send the thought
to MSR instead. See [shot speech](../../produce/references/shot-speech.md).

## Worked cases

- **A asks, B answers, A reacts aloud:** three independently generated shots in that
  order. Use OTS toward A, reverse toward B, then A's reaction framing. Each shot may
  include the silent listener. Bind the one speaker from that shot's actual image.
- **A continues for three lines:** one speaker-facing shot can carry all three lines.
- **Both faces readable:** a two-shot still has just one speaker; cut for the reply.
- **A thinks, then speaks:** thought close-up uses image2video plus A's timed TTS;
  the next shot uses MSR for A's physical speech. The thought never animates a mouth.
- **Silent action/reaction:** image2video with no invented dialogue or TTS take.

Re-export the canonical storyboard. Already usable clips remain reusable; these rules
do not authorize paid regeneration. When a review is requested, inspect actual frames,
voices, mouth movement, thought timing, joins and omitted/duplicated lines. A successful
request or text-plan score is not proof of generated-media quality.
