# H3 prompt structure: the planner's form against the six-section form

MiniMax publishes the output format of its H3 prompt rewriter for reference renders: six
sections (`subject_definitions`, `summary`, `retention_analysis`, `detailed_description`,
`overall_soundscape`, `non_diegetic_music`) with `[Shot N] At MM:SS.mmm` cuts. The planner
writes a shorter form for the same model family. The
[reference limits study](../../research/2026-11-25-reference-limits/index.html#h3) found no
source that says whether the model needs the full form. This is a comparison on the local
FastH3 Omni build.

## Method (written before any take was viewed)

- One scene, two shots, two speakers with one Korean line each, 158 frames at 24 fps on a
  384×512 canvas. The first plan asked for 124 frames and was refused: the two lines need
  6.14 seconds (`video_duration_short`).
- References, the same for every take: two face pictures made with the local H3 image model,
  two voice samples made with local VoxCPM2, and one opening picture composed from the two
  faces with the H3 image edit lane.
- Prompt A is `args.prompt` from `video_plan` on a board built from those files, taken from
  the committed build (`d9c4b613`) unchanged.
- Prompt B carries the same shots, lines, references and positions in the six-section form,
  following the vendor's published complete example. It was written by hand.
- Each prompt is rendered with seeds 11 and 22 on the committed build: the same pictures,
  samples, canvas, frame count and steps. Four takes, in the order A, B, B, A. The
  `fasth3_omni_reference` tool asks for a ready project, which this scratch scene has not,
  so the takes call the adapter's own entry (`generateLocalVideo('fasth3_omni_reference')`)
  with the plan's arguments.
- B needs words A has not: the format's subject definitions describe each subject, so B
  carries the appearance words of the prompts that made the two faces, a sentence for the
  setting and a room-tone line. A and B therefore differ in more than layout.

## Decision rule (written before any take was viewed)

Each take is read on three axes.

1. **Lines.** The soundtrack is transcribed with the local Qwen3-ASR route. A take passes when
   both authored lines appear in order and nothing else is spoken.
2. **Cut.** Frames are sampled across the take. A take passes when the view changes between
   the two shots.
3. **Cast.** In the sampled frames both characters are recognisable against their face
   pictures, and the speaker of each shot is the one on screen.

The compiler changes to the six-section form only if B passes an axis that A fails in both
seeds and A passes no axis that B fails. Any other outcome is recorded as tested and
unchanged. Two seeds on one scene cannot show that one form is better in general; the rule
only guards against changing the compiler without evidence.

Not judged: voice likeness to the samples and lip sync. Neither was listened to or measured.
