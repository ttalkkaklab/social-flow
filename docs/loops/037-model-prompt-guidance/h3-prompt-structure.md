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

## Results (written after the four takes were viewed)

Every take is 158 frames (6.58 s) at 384×512 with a soundtrack, rendered on FastH3 Omni
8-bit through MLX-Serve on a shared machine; render times are wall-clock under load from
other sessions. The first attempt went through the `fasth3_omni_reference` tool route and
all four calls stopped at `project_setup_required` before any render; the takes below come
from the second attempt, through the adapter's own entry.

| Take | Render | Cut (ffmpeg scene change) | Line 1 heard | Line 2 heard | Transcript | Lines | Cut | Cast |
|---|---|---|---|---|---|---|---|---|
| A, seed 11 | 1,428 s | 2.58 s | 0.24–2.08 s | 4.48–6.40 s | 오늘은 창구가 참 조용하네요. 뒷문은 제가 직접 잠갔습니다. | pass | pass | pass |
| B, seed 11 | 1,036 s | 3.17 s | 0.16–1.92 s | 4.24–6.08 s | 오늘은 창구가 참 조용하네요. 뒷문은 제가 직접 잠갔습니다. | pass | pass | pass |
| B, seed 22 | 1,047 s | 3.17 s | 0.08–1.84 s | 3.36–5.12 s | 오늘은 창구가 참 조용하네요. 뒷문은 제가 직접 잠갔습니다. | pass | pass | pass |
| A, seed 22 | 1,145 s | 2.17 s | 0.16–1.84 s | 2.16–4.96 s | 오늘은 창구가 참 조용하네요. 네, 문은 제가 직접 잠갔습니다. 잠갔습니다. | fail | pass | pass |

- **Lines.** A with seed 22 adds a "네" at the cut, loses "뒷" and repeats "잠갔습니다". The
  other three takes say both lines word for word, in order. Transcripts are Qwen3-ASR 1.7B's
  reading; a misheard syllable cannot be told apart from a spoken one without listening, and
  nobody listened.
- **Cut.** Every take changes from the two-shot to a close-up of Jun once, after the first
  line ends.
- **Cast.** In the sampled frames Mina and Jun match their face pictures, Mina speaks in the
  two-shot with Jun listening, and Jun is on screen for his line. In both A takes and in B with
  seed 22 the close-up's background is the plain grey of Jun's face picture and not the room;
  in A with seed 11 it is an office. No axis covers the background.

**Decision.** B passed every axis in both seeds. A failed one axis, Lines, in one seed. The
rule asks for an axis A fails in both seeds, so the compiler is unchanged and the planner
keeps its form for FastH3 and hosted H3. One scene and two seeds per form cannot rank the
forms; the one failure is a reason to repeat the comparison on more scenes before writing
the six-section form, not a finding that it is better.

## Prompt B as rendered

```text
subject_definitions:
<Subject 1> is Mina, the woman in <Picture 1>, with shoulder-length black hair, a blue knitted cardigan and a white shirt.
<Subject 2> is Jun, the man in <Picture 2>, with short wavy black hair and a grey zip jacket over a dark t-shirt.
<Subject 3> is the bank counter setting in <Picture 3>, with a wooden service counter, a brass desk lamp and a window on the left.
<Audio 1> is the voice-timbre reference for <Subject 1> (S1).
<Audio 2> is the voice-timbre reference for <Subject 2> (S2).

summary:
[keyframe completion + reference generation + audio reference] The target video opens on <Picture 3>, where <Subject 1> stands behind the counter on the left and <Subject 2> stands in front of it on the right. <Subject 1> speaks one line in a medium shot, then the video cuts to a close-up of <Subject 2>, who answers with one line. <Audio 1> and <Audio 2> are the voice-timbre references for the two speakers.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - Mina's facial identity, shoulder-length black hair and blue cardigan are retained.
<Subject 2> (appears in [Shot 1], [Shot 2]): fully_preserved - Jun's facial identity, short wavy black hair and grey zip jacket are retained.
<Subject 3> (appears in [Shot 1], [Shot 2]): fully_preserved - the wooden counter, brass desk lamp and window light are retained.
<Picture 3> ([Shot 1] first frame): fully_preserved - the opening composition is used as the first frame.
<Audio 1>: reference - its vocal timbre guides the dialogue delivery of <Subject 1> without copying the original signal.
<Audio 2>: reference - its vocal timbre guides the dialogue delivery of <Subject 2> without copying the original signal.

detailed_description:
The target video uses a photorealistic live-action style with soft daylight and a calm mood at closing time. The image stays free of subtitles, captions and any on-screen text.
[Shot 1] A medium shot at eye level opens on <Picture 3> in <Subject 3>. <Subject 1> (S1), Mina, stands behind the wooden counter on the left, and <Subject 2>, Jun, stands in front of the counter on the right with his mouth closed. <Subject 1> (S1) looks across the counter at <Subject 2> and says in the voice timbre referenced from <Audio 1>, <d>[Korean] 오늘은 창구가 참 조용하네요.</d> She closes her lips while <Subject 2> listens quietly.
[Shot 2] At 00:03.292, the shot cuts to a close-up at eye level of <Subject 2> (S2), Jun. He nods toward the back of the room and says in the voice timbre referenced from <Audio 2>, <d>[Korean] 뒷문은 제가 직접 잠갔습니다.</d> He closes his mouth after the final syllable.

overall_soundscape:
Quiet indoor room tone continues throughout the scene.

non_diegetic_music:
N/A
```

Prompt A is the planner's own prompt for the same board, the one the committed build
returns; its first lines are quoted in the method above as "Opening frame, from the
viewer's perspective".
