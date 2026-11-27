# Seedance 2.0 and 2.5: what the guides recommend

Read this when the saved video model is a Seedance model and a scene has two or more
characters or several shots. The planner writes the scene prompt. This page says what the
vendor's prompt guides recommend inside the limits the API enforces, what the planner writes
for this family and what to change on the board when a take fails.

Where the other facts live:

- Hard limits per model: `video_catalog {engine:"seedance", operation:"reference"}` and the
  [model table](../../produce/references/video-model-selection.md#the-five-seedance-models--what-differs).
- Prompt grammar, positive locks and the failure ladder:
  [Prompt grammar: Seedance](../../produce/references/video-model-selection.md#prompt-grammar--seedance).
- Which picture and sample a speaker sends:
  [the Seedance character contract](../../_shared/video-routing.md).
- The request body, reference counts per model and the portrait asset route:
  [call reference: Seedance](../../../docs/video-models.md#seedance-byteplus-modelark).
- Sources for every vendor figure below, with the passages quoted:
  [reference limits study](../../../docs/research/2026-11-25-reference-limits/index.html#seedance).

## Recommended ranges

The API refuses a request past a hard limit. Inside the limit the guides still recommend
less, and `video_plan` reports each count outside these ranges in `promptGuidance.advice`.
A report never refuses a plan and never changes its id.

| Series | What is counted | The guide recommends | Reported as |
|---|---|---|---|
| 2.0 | Reference people in one request | At most 4. Past it the guide reports a wrong number of people or a duplicated character | `reference_people_over_recommended` |
| 2.0 | Reference files of every kind | 4 to 5 in all, and not the full limit | `reference_assets_over_recommended` |
| 2.5 | Subjects given as pictures | 1 to 8. The guide allows trying 9 to 12 with less stable output | `reference_people_over_recommended` |
| 2.5 | Subjects given as audio or video | 1 to 5. The guide allows trying 6 to 10 with less stable output | `voice_subjects_over_recommended` |
| 2.5 | Length of one audio or video subject reference | 5 to 10 seconds | `voice_sample_length` |

The counts are read from the submitted request. People are the cast members it shows in a
picture or a video; a voice alone is not counted as a person. Files are every picture,
voice sample and video reference together. Voice subjects are the speakers bound to a voice
sample, and the length check reads those samples.

Two recommendations are not counted by the planner.

- 2.0: use a separate photo of one person for each character. The guide advises against
  three-view and multi-view sheets.
- 2.5: past five subjects give each a single view, and upload references in the order the
  subjects first appear. The planner numbers face pictures in the scene's declared speaker
  order and voices in speaking order (probed on a two-speaker scene). It does not reorder
  pictures by first appearance.

## What the planner writes

- A scene of two or more shots introduces each as `Shot 1:`, `Shot 2:`. The 2.0 guide calls
  precise timing unstable and recommends `Shot 1`, `Shot 2` identifiers, and the 2.5 guide
  states that 2.0 responds to shot numbers and not to timestamps. So the prompt carries no
  seconds and the model paces each shot (`scene_cut_timing_model_paced`). The 2.5 guide
  reads shot numbers or whole-second ranges. Both versions keep numbered shots and explicit
  transition directions. The planner includes ranges on 2.5 when every shot boundary lands
  on a whole second. In both versions the times guide generation.
- References are `Image N` and `Audio N` on 2.0 and `@Image N` and `@Audio N` on 2.5.
- Each referenced speaker sends a face and a front view, and the scene sends its opening
  picture. Two speakers with their voices are therefore seven files, so a two-speaker scene
  on 2.0 reads `reference_assets_over_recommended`. The reference contract is unchanged; the
  report says the count.
- In an authored prompt (an explicit `video_plan {prompt}` generation edit) the `Shot N:` label may be
  kept, dropped or renumbered. A draft written before shots were numbered, with
  "Then cut directly." between them, still plans.

## When a take fails

| What the take shows | Change on the board | Basis |
|---|---|---|
| A missing, extra or duplicated person on 2.0 with more than four referenced people | Split the scene at a cut so each request references four or fewer. A silent person the start image already shows goes in `visual.bystanders` or `visual.extras`, which the video call does not reference | The 2.0 guide's own remedy first makes pictures of four or fewer people each and renders the video from those. Splitting at a cut is this project's way to stay at four and is not measured |
| An unstable voice on 2.5 from a sample shorter than 5 or longer than 10 seconds | Pin a voice sample of 5 to 10 seconds for that character | The 2.5 guide's recommended length; it says longer inputs may reduce stability |
| A cut that lands at the wrong moment on 2.0 | Leave seconds out and describe the order of events on each shot card. Cut to length in the edit | The 2.0 guide: precise timing is unstable and forcing a duration can break the result |
| The first person on screen wears another character's face on 2.5 | Declare the scene's speakers in the order they first appear, then plan again and check the numbering in `promptSlots` | The 2.5 guide's remedy is to number references by first appearance |

No Seedance render was made for this page. The ranges are the vendor's statements, not
measurements from this project.
