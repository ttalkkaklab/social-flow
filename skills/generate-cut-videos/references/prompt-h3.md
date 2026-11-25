# MiniMax H3 and FastH3: what the sources recommend

Read this when the saved video model is hosted MiniMax H3 (`minimax_reference`) or the local
FastH3 Omni build (`fasth3_omni_reference`) and a scene has two or more characters. The
planner writes the scene prompt. This page says what the published sources show inside the
limits, what the planner writes for this family and what was tested.

Where the other facts live:

- The local adapter's contract, reference counts and sample lengths:
  [call reference: FastH3 Omni](../../../docs/video-models.md#fasth3-omni).
- The hosted adapter's parameters: `video_catalog {engine:"minimax", operation:"reference"}`, and its
  wire request and limits: [call reference: MiniMax](../../../docs/video-models.md#minimax-hosted-video-minimax-open-platform).
- Sources for every upstream figure below, with the passages quoted:
  [reference limits study](../../../docs/research/2026-11-25-reference-limits/index.html#h3).

## Inside the limits

- One request takes nine pictures, three voice samples and three videos, twelve files in
  all. No source states a maximum number of characters or speakers: `<Subject N>` and
  `(S1)` are prompt text.
- The official English examples read for the study go no further than four subjects, four
  pictures and two speakers. The full nine pictures and a third voice are not shown in them.
  That is what the examples cover, not a recommendation the vendor states.
- A voice sample pins timbre. The prompt guide binds it in a sentence of the form
  `<Audio 1> is the voice-timbre reference for <Subject 1> (S1).`

## Frame ceiling on the local build

The local adapter accepts 124 to 362 frames. The model's published reference pipeline
generates 5 to 15 seconds at 24 fps, which ends at 345 frames on the `17k+5` ladder; 362
frames is 15.08 seconds. A FastH3 plan past 345 frames reads
`frames_over_reference_pipeline` in `promptGuidance.advice`. The plan is not refused.
Whether the local build renders 362 frames as asked was not tested.

## What the planner writes

- FastH3: pictures are `<Picture N>` and voices `<Audio N>`. A turn reads
  `<Subject 1> (name, <Picture 1>, <Audio 1>) (S1) says <d>[Language] …</d>`, and
  `Hard cut to the next camera setup.` separates shots.
- Hosted H3: references are `reference image N` and `reference audio N`. A turn reads
  `name (reference image 1, reference audio 1): "…"`, and `Cut to the next view.` separates
  shots.
- On both, the role of each reference and the voice binding follow the scene.

MiniMax also publishes a six-section prompt format for reference renders, written by its
own prompt rewriter. The planner does not write that format. On one two-speaker scene
rendered on local FastH3 with two seeds per form, the six-section prompt said both lines word
for word in both takes and the planner's prompt in one of two; both cut once and kept both
faces. That was not enough under the rule written before the takes to change the compiler.
The takes, transcripts and rule are in the
[loop record](../../../docs/loops/037-model-prompt-guidance/h3-prompt-structure.md).
