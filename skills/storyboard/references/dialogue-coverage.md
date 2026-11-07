# Dialogue coverage for generated shots

## Contents

- [Choose the view from the exchange](#choose-the-view-from-the-exchange)
- [Author before generating](#author-before-generating)
- [Worked coverage and review cases](#worked-coverage-and-review-cases)
- [Evidence and limits](#evidence-and-limits-2026-11-07)

## Choose the view from the exchange

For face-to-face dialogue, prefer speaker-facing over-the-shoulder (OTS) and reverse
coverage when the beat needs each speaker's expression. A two-shot is useful for shared
action, distance or simultaneous reactions; do not force characters to face the camera
merely to keep both mouths visible. These are authoring defaults, not execution gates,
a ban on two-speaker MSR, or proof of generated-media quality.

| Intended beat | Coverage | Speech in each generated clip |
| --- | --- | --- |
| Face-to-face exchange; each expression matters | Over B's shoulder toward A, then reverse over A toward B | A speaks in the first clip; B speaks in the reverse. The foreground listener stays silent. |
| Short exchange whose shared action/reaction matters | Medium two-shot with both faces and mouths readable at delivery size | Both may speak in explicit order; the other listens silently during each turn. |
| Two-shot with strict profiles, overlapping faces, tiny mouths or one soft face | Reblock if that preserves the scene; otherwise use speaker-facing coverage | Do not treat the label `two` as evidence that two-speaker delivery is suitable. |
| One speaker continues across several lines | Hold the existing speaker-facing view while it serves the beat | Keep the same speaker's lines together; do not cut at every sentence or pause. |
| Intentional listener reaction under another person's speech | Purposeful reaction coverage with explicit speech ownership | Check the selected adapter's delivery contract; do not relabel a hidden speaker merely to bypass it. |

The reliability concern is **two speaking identities in a fixed OTS composition where
only one face is readable**, not OTS itself. Default to separate generation units for
A and B in that case, rather than asking one generation to invent a reverse cut.
This is a production-motivated boundary, not a universal one-line/one-speaker rule.
Keep listening, pauses, action and the exchange's meaning when redistributing lines.
Overlapping speech or a camera orbit that hides mouths adds another difficulty; simplify
coverage or explicitly retain it as an unverified creative exception, not guaranteed output.

## Author before generating

1. After `shot_dialogue` and before final `shot_icons`, compare speaking identities with
   planned visible faces. Snapshot the complete affected shots and narration records before
   splitting. Create the reverse story with `story_shot`, then set its `shot_characters`.
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
   sufficiently large; for a two-speaker two-shot both faces stay readable and in focus.
   Portrait layouts and foreground depth must not hide the second speaking face. A frame
   label or a current receipt is not visual verification.
5. After images, write `shot_prompt` action/end/sound in English. Dialogue stays only in
   `shot_dialogue`; do not paste spoken quotes into action. With two MSR on-screen speakers,
   inspect each start image and pass `speakerBindings` with distinct viewer-relative
   positions and appearance. Image/Audio indices are reference slots, not left/right.
   Rebuild bindings after image changes, including a reverse; never copy them blindly.
6. Plan the revised clips and reconcile duration and cost with existing authorization.
   A split is not permission to generate more media, exceed the budget or replace an
   approved clip. Changed inputs require fresh plans and the existing `video_approve`
   rules (including an existing approve-all); do not invent a new quality approval gate.
   Re-export the canonical storyboard after edits. If discovered at the video stage,
   return to the story/lines/icons/image steps; a prompt-only patch cannot fix wrong coverage.

Keep the selected model and voice lane. MSR uses its native soundtrack; no external TTS
workaround is introduced here. The MSR compiler supports intentional `off_screen` and `voiceover` turns, instructing
it not to show that speaker or animate visible mouths. That is not the same composition
as a visible foreground shoulder speaking. For a deliberate listener-only reaction, keep
the speaker entirely outside frame, preserve explicit delivery and identity, and verify
the actual result; native off-screen speech is not guaranteed by a prompt. Do not relabel
a visible hidden-mouth speaker as off-screen just to avoid bindings. Other routes retain
their existing delivery contracts. Already usable clips remain reusable;
this guidance does not trigger retroactive regeneration.

## Worked coverage and review cases

- **Fixed OTS, A asks and B answers:** make clip 1 over B toward A with A's question;
  clip 2 over A toward B with B's answer. Both casts include A and B. Keep a purposeful
  listening beat, but no duplicated question in clip 2. Generate independently and join
  at the authored transition; do not put both turns into clip 1's prompt.
- **A continues for three lines:** one speaker-facing OTS can carry all three; a line
  boundary alone is not a cut. Preserve B's reaction when it changes the scene.
- **Both faces readable, short shared exchange:** retain one two-shot. Bind A and B from
  the image and author sequential turns; do not split solely because the speaker changes.
- **Face-to-face two-shot, mouths only in strict profile:** prefer OTS/reverse when facial
  performance matters. Do not rotate both actors toward the lens against their eyelines.
- **Listener-only reaction, MSR:** the speaker is entirely outside the frame and the line
  explicitly uses `off_screen`; the visible listener stays silent. Keep native audio and
  inspect playback for wrong mouth movement. Do not silently switch models/TTS.
- **OTS already has only the far speaker's lines:** retain it. This is the intended case,
  not a warning merely because two characters are visible.

When a review is requested, inspect all affected shots and their joins, not just labels.
Try to find swapped lines/voices, listener mouth movement, hidden speaking mouths,
missing/duplicated turns, axis jumps and prop discontinuity. Playback evidence is required
to claim a generated clip passes; a text-plan score assesses guidance only. Do not add an
automatic review or regeneration requirement to otherwise authorized production.

## Evidence and limits (2026-11-07)

- [LTX-2 technical report](https://videos.ltx.io/LTX-2/grants/LTX_2_Technical_Report_compressed.pdf)
  identifies incorrect assignment of speech to characters in multi-speaker scenes. This
  is a base-model limitation report, not an OTS-versus-two-shot benchmark for MSR V2.
- [Licon MSR V2 model card](https://huggingface.co/LiconStudio/LTX-2.5-Multiple-Subject-Reference/blob/aa19b48f845995525d8ace60cdc89b842e951ce6/README.md)
  supports two voice references paired with their images and recommends explicit subject
  relationships. Its [sample workflow](https://huggingface.co/LiconStudio/LTX-2.5-Multiple-Subject-Reference/blob/2b35039311ef46aedaf309897beb0398ae8ade6e/LTX2.5-MSR-sample-workflow-V2.json)
  demonstrates OTS coverage: OTS is possible, not prohibited by the model.
- [Runway performance guidance](https://help.runwayml.com/hc/en-us/articles/42311337895827-Performance-Capture-with-Act-Two)
  recommends a visible face; its [multi-character workflow](https://help.runwayml.com/hc/en-us/articles/41748090660499-Creating-Multi-Character-Dialogues-with-Act-Two)
  isolates each performance before compositing. Those are Act-Two practices, not MSR API requirements.

The coverage defaults combine these sources with the user's observed OTS failures and
preferred face-to-face staging. No comparative success rate was established. Visibility
and simpler speaker assignment are the rationale, not a claim that every two-shot succeeds.
