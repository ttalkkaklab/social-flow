# Round 1 verification

Fresh `astra-methodology:loop-verifier`, read-only on the repository, 26 tool calls, against
the frozen rubric in [loop.md](loop.md). Report as returned, lightly condensed.

## A. Executed break attempts

Probe files imported the built modules of the frozen build (`d9c4b613`) and of HEAD.

| # | Ran | Expected if broken | Result |
|---|---|---|---|
| 1 | `cd server && HOME=$(mktemp -d) npm test` | non-zero exit | exit 0, 1,419 tests, 1,419 pass, 135 s |
| 2 | One scene on MSR, FastH3, hosted MiniMax and single-shot Seedance 2.0 and 2.5, both builds; bodies compared without `id`, `promptGuidance`, `contextRevision`, `voiceContinuity` | body or id drift outside multi-shot Seedance | only the random `requestId` and `args.filename` differ; ids unchanged outside multi-shot Seedance |
| 3 | The frozen build's Seedance template with "Then cut directly." sent as `prompt` on 2.0 and 2.5 | refusal | both plan |
| 4 | All `Shot N:` labels dropped, 2.0 and 2.5 | refusal | both plan |
| 5 | Labels renumbered to `Shot 5/6`, 2.0 and 2.5 | refusal | both plan |
| 6 | `Shot 2:` replaced by "Then cut directly.", 2.0 and 2.5 | refusal | both plan |
| 7 | A reworded sentence under a label | accepted | refused (`scene_direction_unverified`, `scene_dialogue_speaker`) |
| 8 | `Shot A:` as a label | accepted | refused (`scene_direction_unverified`); new wording, not earlier wording |
| 9 | Earlier-wording prompts with and without labels on MSR, FastH3, MiniMax | new refusals | all plan; the frozen build answers the same strings alike |
| 10 | Seedance prompt grown from 200 to 5,000 characters, both builds | labels push a prompt over the limit | the new prompt is 3 characters shorter at every size |
| 11 | A Seedance card with only a line | changed outcome | `scene_inputs_unsupported` on both builds, byte-identical |
| 12 | Host engine and a `per_shot` scene | changed plan or crash | same errors as before; a host plan carries `promptGuidance` with empty advice |
| 13 | Seedance plan saved with `persist=true` | guidance in the signed manifest | absent from the saved JSON; saved id equals preview id |
| 14 | Seedance 2.0 and 2.5 with the 3-second fixture samples | wrong or missing advice | 2.0 `reference_assets_over_recommended` (7 files); 2.5 `voice_sample_length` for both speakers |
| 15 | FastH3 at 209 frames; the 181+181 test at 512×288 | missing advice or refusal | 209: no advice; 362: `frames_over_reference_pipeline`, no refusal |
| 16 | `videoCatalog()` | missing `promptReference` | 8 rows carry it (3 Seedance, 2 MSR/LTX, 3 H3); Veo and desktop rows do not |
| 17 | `characterBindings` of a Seedance plan | counter reads wrong fields | `media` is `Image` or `Audio` and `character` is set, as the counter reads them |
| 18 | `Shot 2:` typed into MSR and Seedance prompts | new refusal | refused on the frozen build too; not a regression |

A five-person Seedance 2.0 scene or a six-voice 2.5 scene could not be built from the
fixtures, so `reference_people_over_recommended` and `voice_subjects_over_recommended` are
covered by `referenceAdvice` unit cases and by the binding shape in row 17.

## B. Score

| Criterion | Awarded | Max | Note |
|---|---|---|---|
| 1 Completeness | 36 | 36 | all six items hold |
| 2 Objective gate | 20 | 20 | exit 0 |
| 3 Reports never refuse, earlier work plans | 14 | 14 | no refuted case |
| 4 Tests | 8 | 10 | no case shows advice leaves the plan id alone apart from `saved.id === preview.id`; 5 of 6 behaviors |
| 5 Accuracy | 12 | 12 | 14 statements checked against the guides, the study page, code and the H3 takes; none false; no stale sentence in a white-space-collapsed sweep |
| 6 Scope and conventions | 8 | 8 | D8 scan 22 hits, all in CLAUDE.md; a second build leaves `git status` unchanged |

Total 98.

## C. P0

None.

## D. Fix directives (non-blocking)

1. `server/test/video-routing.test.mjs`: assert the plan id equals the hash of the body
   without `promptGuidance`.
2. `server/test/video-routing.test.mjs`: a call-site case for
   `reference_people_over_recommended` and `voice_subjects_over_recommended`.

The verifier could check the numbers of the H3 record but not that its rule was written
before the takes were viewed.

ASTRA_LOOP_RESULT: score=98 verdict=PASS p0=0 iter=1
