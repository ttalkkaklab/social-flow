## Target verification report — iteration 3

Verify current Seedance models through the same production workflow as LTX and Veo. The frozen threshold is 95/100 with zero P0 defects.

### Overall score — 90/100

| Criterion | Awarded | Max | Evidence and refutation |
|---|---:|---:|---|
| Reachable behavior | 32 | 40 | Selection/catalog 8. I checked the distributed tool schemas and found all five IDs on each of the three tools. Motion, b-roll and quote overrides dispatched Flash against a different saved default in `server/test/video-routing.test.mjs:1226`. Shot and scene routing 0. A typical single-shot scene loses its authored edit instruction and transmits an image beyond the declared reference list. ModelArk payloads 8. The HTTP mock captured the model ID, reference video role, adaptive ratio and edit/extension durations at `server/test/seedance-client.test.mjs:31`. Rejected HTML, MPEG-4 Part 2 and extreme aspect-ratio input yielded zero hosting and task calls at line 69. Budget/settlement 8. The rates in `server/src/video-pricing.ts:10` match both official rate tables. Successful short output retains measured charges, and moderation releases reservations on normal and recovery paths at `server/test/video-routing.test.mjs:1158` and line 1201. Provider-ID recovery 8. HTML and truncated downloads, successful recovery and a subsequently removed output use GET only at line 1128. |
| Objective gate | 25 | 25 | The parent recorded exit 0 for the full server check. I inspected its output at `/tmp/hafgufa-seedance-iter3-serial.log`, which records 1,215 passed, zero failed and zero skipped. I reran skill lint and `git diff --check`. Both exited 0. Skill lint reported 17 rules across 34 skills. |
| Regression coverage | 15 | 15 | Five areas have executable coverage. Saved models and selection appear at `server/test/video-routing.test.mjs:1108` and line 1226, scene planning at line 184 and line 1245, transport and local validation at `server/test/seedance-client.test.mjs:31` and line 69, budget at `server/test/video-pricing.test.mjs:20` and `server/test/video-routing.test.mjs:1201`, and recovery at line 1128. My independent rerun of eight focused tests passed with zero skips, including stale approval, provider failure, media validation and GET-only recovery. |
| Code and documentation consistency | 8 | 10 | The I2V ratio guidance, activation alternatives and asset URI descriptions agree with the adapter and the supplied ModelArk create-task reference at lines 13–17, 311 and 545. One distinct reference-scope contract still differs between the scene adapter and `skills/storyboard/references/scenes-schema.md:908`. See defect 2. |
| Existing behavior and scope | 10 | 10 | The 2.0 default remains at `server/src/seedance-client.ts:185`. The suite includes existing snapshot/override precedence at `server/test/video-routing.test.mjs:127` and retired Veo workspace recovery at line 1097. I found no unrelated functional regression. |

### P0 defects

1. **The scene can lose the approved edit instruction.** I set a five-second Flash shot's stored prompt to “Edit @Video 1 to replace the red jacket with a blue jacket.” The card had the summary “The actor walks home.” and the scene had the emotion “The actor misses the last bus.” With `omniReferenceTaskType: 'edit'` and `referenceVideoUrls: ['asset://source']`, the shot plan preserved the jacket change and reached the local mock dispatcher. Both `sceneNo` plans, with and without 24 fps, failed the Video 1 binding check. Putting “Edit @Video 1” in the emotion made both plans pass, but neither generated prompt contained the jacket instruction. The scene picks the summary ahead of the stored prompt at `skills/storyboard/references/scene-direction.js:72`. Scene request construction replaces the shot prompt at `server/src/video-routing.ts:536` and line 554. The existing fixture repeats the slot's instruction in the emotion at `server/test/video-routing.test.mjs:1245`, masking the loss. The production entry point directs callers to omit `args.prompt` at `skills/generate-cut-videos/SKILL.md:24`.
2. **Scene planning promotes a display or image-only opening to a submitted reference.** I used reference mode with `frames.start: 'open.png'` and one named video reference `prop.png`. The shot's mock dispatch received only `prop.png`. Both scene plans submitted `['prop.png', 'open.png']`. I then explicitly set the opening's reference to `use: 'image'`. The distributed scene compiler still produced a video input for `open.png`. The timed compiler filters out image-only inputs and then appends the opening at `server/src/scene-video.ts:111`. The legacy projection appends it at `skills/_shared/video-selection.js:178`. The board contract at `skills/storyboard/references/scenes-schema.md:908` assigns video submission to video/both references, including a named opening when desired. This changes which local image reaches the external provider on an otherwise valid plan.

### P1/P2 findings

The eight independent focused cases passed locally. In particular, all three defects reported in iteration 2 passed their original reproductions. The two findings above require changing the fixture data to expose the differences between the shot and scene entry points.

### Fix directives

1. Preserve each authored single-shot Seedance generation prompt, including edit instructions and indexed references, in both scene paths. Retain compiled scene direction and dialogue. Exercise all three documented card slots with an independent summary and scene emotion. Assert the actual mock dispatch includes the requested change.
2. Apply the board's video/both reference scope consistently to Seedance scenes. Exercise a distinct display-only opening, an explicit image-only reference to that opening, and an explicitly named video opening. Assert identical ordered provider inputs across shot, legacy scene and timed scene calls. Rebuild the distributed server and rerun both gates.

### Verification scope

All transport and hosting calls in this audit used local mocks. The media probes used locally generated files. Model IDs, supported codecs and pricing were checked against the supplied BytePlus documents. Account entitlement and live inference remain unverified.

ASTRA_LOOP_RESULT: score=90 verdict=FAIL p0=2 iter=3
