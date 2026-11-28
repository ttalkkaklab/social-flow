# LTX-2.5 with MSR: what the sources recommend

Read this when the saved video model is distilled LTX-2.5 (`astra_genai_msr`, or
`astra_genai_img2video` with subject references) and a scene has two or more characters.
The planner writes the scene prompt. This page says what the model's maintainers and the
MSR paper say inside the limits, what the planner writes for this family and what to change on
the board when a take fails.

Where the other facts live:

- The request contract, frame grid and prompt length: [MSR and v2 video](../../_shared/astra-genai.md#msr-and-v2-video).
- Slots, voice binding and limits beside the gateway's and Licon's own:
  [call reference: ASTRA GenAI](../../../docs/video-models.md#astra-genai-gateway-ltx-25-and-licon-msr).
- Which panels fill the subject slots and where the start image goes:
  [scene frames and adapter inputs](../../_shared/video-routing.md#scene-frames-and-adapter-inputs).
- Sources for every upstream figure below, with the passages quoted:
  [reference limits study](../../../docs/research/2026-11-25-reference-limits/index.html#msr).

## Limits the planner already enforces

Nothing on this family is report-only. The two counts the sources care about are hard
limits here, so `promptGuidance.advice` stays empty.

| What is counted | Limit | Where it stops |
|---|---|---|
| Subject pictures in one render | 4, shared by faces, outfits and props, plus one background | `msr_subject_limit` on `astra_genai_msr`; both routes share a references list of one to five entries |
| Speakers with a pinned voice in one render | 2, and they sit in the first two subject slots | `scene_render_voice_limit` |
| Length of a voice sample | Over 5 seconds the model conditions on the first 5 and the plan warns. Over 10 seconds is refused | the plan's voice warnings |

## What the sources say inside those limits

- A Lightricks maintainer, answering a repository issue on 4 November 2026, calls two
  subjects the practical number and suggests keeping two speaking subjects per shot and
  covering a third with cuts or reverse shots. This describes upstream model capacity. Social Flow starts a new shot at every change of speaker.
- The MSR paper names two failures: subjects with similar looks or clothes can blend, and a
  character's appearance can drift when they turn away or return to the frame.
- Almost every training example carried two to five reference pictures: 20.35 percent had
  two, 25.99 three, 29.53 four and 23.89 five. Six or more together were 0.24 percent.

## What the planner writes

- Reference descriptions first (`Image N: …`, `Audio N: …'s voice, belongs only to Image N`),
  then the action, then each turn as `name (Image N, Audio N): "…"`.
- Each shot says about how long its view holds, and `Then cut directly.` separates shots.
  The model paces the cuts (`scene_cut_timing_model_paced`).
- The opening picture rides in the background slot. A later shot's composition picture
  that the operation cannot send is named in `shot_reference_omitted`.

## When a take fails

| What the take shows | Change on the board | Basis |
|---|---|---|
| A scene needs a third pinned voice | Split it into scenes of two speakers each: one GenAI scene-mode request binds two voices across all its cuts | the planner's `scene_render_voice_limit` |
| Two characters blend into one look | Give them clearly different clothes or hair on their sheets, then plan again | the paper names similar looks as a cause; the remedy is ours and is not measured |
| A character looks different after turning away or returning | Keep the character in view, or end the shot before the turn and start the next on a face | the paper names the drift; the remedy is ours and is not measured |

No MSR render was made for this page.
