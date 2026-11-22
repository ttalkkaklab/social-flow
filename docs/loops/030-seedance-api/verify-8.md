# Seedance adapter verification, iteration 8

**98/100, PASS, zero P0 defects.** I tested the corrected working tree against the frozen rubric. The four failures from iteration 7 passed their reproductions. The provider calls in this verification used local mocks.

| Criterion | Awarded | Evidence |
|---|---:|---|
| Reachable behavior | 40/40 | Selection and catalog 8. Shot and scene routing 8. ModelArk reference, edit and extension payloads 8. Model-specific forecasts and token settlement 8. Recovery of an accepted generation by its existing provider ID 8. The final suite exercised saved Flash selection, paired frames, shot and scene inputs, edit settlement and GET-only recovery. |
| Objective gate | 25/25 | The full server check passed 1,226 tests with zero failures, cancellations or skips. I independently reran skill lint and all 17 rules passed across 35 skills. `git diff --check` also exited 0. |
| Regression coverage | 15/15 | Executable tests cover each of the five behaviors. The new original-source fixture checks the signed URL in the provider payload, the stable task ID and six known input seconds in the result. The shared character test covers Seedance, GenAI LTX and Veo, including the selected WAV on supported speaking routes and rejection of voiced Veo input. |
| Code and documentation consistency | 8/10 | The production and generation skills now direct readers to the managed planner, and the model-selection guide documents original task IDs. One display discrepancy remains. Adding a facial original to a five-second Flash card moved the actual forecast from `seedance.2-5-flash.720p` to `seedance.2-5-flash-video.720p`, but both boards returned the same `costFingerprint`. The review page can therefore display an old cost snapshot as current until the estimate is refreshed. The managed request uses the correct quote. See `skills/autoproduce/references/cost-preview.js:319` and `skills/storyboard/references/storyboard-html-template.html:5215`. |
| Existing behavior and scope | 10/10 | Existing quoted and b-roll boards, single-shot and timed scenes, saved operation choices, other provider routes and provider-ID recovery passed. Distinct authored images retained their slot numbers and instructions in my independent fixture. |

## Reproductions

1. **Forecast.** Flash at 720p selected `seedance.2-5-flash-video.720p` for reference, edit and extension with direct task IDs and with a cast member's facial original. The forecast test includes an explicitly empty image reference array. I reproduced an obsolete image-only validation error on an earlier snapshot and verified that the corrected managed planner saves the same structured board. The quote includes the permitted input duration.
2. **Retry after an original lookup failure.** With one allowed attempt, I planned against a successful original-task GET and then made its execution-time GET return HTTP 503. The distributed execution handler reported `videoSubmitted:false` and the job table was empty. I restored the mock, executed the same approved plan and observed exactly one inference POST followed by a GET for the newly returned provider ID. The terminal response to that last GET was a deliberate fixture response.
3. **Portrait declaration.** I authored `realFaceInput:true` and passed `args.realFaceInput:false` to the distributed `video_plan` handler. It raised `character_inputs_mismatch` before any fetch. The same shot planned with the authored declaration when the caller omitted the override.
4. **Image numbering and authorship.** I generated separate green, red and yellow PNG fixtures for a bag, face and rear body panel. The managed plan preserved Image 1 for the bag and Image 2 for the face and appended the back panel as Image 3. The first two IDs, the instruction to keep the cheek scar, the green-handle preservation instruction and the clothing exclusion survived in the provider prompt. All three bound hashes differed.

The full gate record is `/tmp/hafgufa-fullbody-delivery.log`. This score covers the planner, adapter and recovery behavior. The separate live clip's appearance, motion and voice require audiovisual review.

## Post-score verification

The cost-display discrepancy recorded above is fixed. I reran the five-second Flash/720p case against the fingerprint functions from the CLI and storyboard HTML. Adding either a direct original task ID or a character’s facial original moved the forecast to the video-input tier and marked the old fingerprint stale. Changing the selected task ID invalidated the fingerprint again. The CLI and template agreed in every case, and `cost-preview.js --selftest` passed.

ASTRA_LOOP_RESULT: score=98 verdict=PASS p0=0 iter=8
