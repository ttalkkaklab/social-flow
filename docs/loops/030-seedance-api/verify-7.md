## Target verification report — iteration 7

Verify the common character binding and Seedance original-task support against the frozen 95/100 and zero-P0 threshold. This report covers the build tested in `/tmp/hafgufa-fullbody-final-gate.log`. Later repairs require a separate verification.

### Overall score — 64/100

| Criterion | Awarded | Max | Evidence and attempted refutation |
|---|---:|---:|---|
| Reachable behavior | 16 | 40 | Selection/catalog 8. The five models remain available across all three operations at `skills/_shared/video-catalog.json:40`, `:280` and `:523`. Shot/scene routing 0. The managed reference binder renumbered a saved prompt's images. ModelArk payloads 0. An explicit shot portrait declaration could be turned off, sending a canonical face as raw bytes. Budget/settlement 0. The cost forecast omitted a supported video source and used the image-only price. Output provider-ID recovery 8. The accepted generation ID survived corrupt or missing downloads, with GET-only recovery at `server/test/video-routing.test.mjs:1132`. The separate retry failure below concerns an input lookup before generation. |
| Objective gate | 25 | 25 | The recorded full server check passed all 1,226 tests, with zero failures or skips at `/tmp/hafgufa-fullbody-final-gate.log:1702`. I reran skill lint and observed exit 0 for 17 rules across 35 skills. |
| Regression coverage | 15 | 15 | Three points each for the five executable areas. See `server/test/seedance-route.test.mjs:17`, `server/test/video-routing.test.mjs:1230`, `server/test/seedance-client.test.mjs:64`, `server/test/video-pricing.test.mjs:20` and `server/test/video-routing.test.mjs:1112`. My focused rerun of five routing, recovery and character cases also exited 0. The character fixture starts without existing reference slots at `server/test/video-routing.test.mjs:1354`. The original lookup fixture ends after saving the plan at line 1418. |
| Code and documentation consistency | 8 | 10 | The common routing guide describes stable original IDs and late URL resolution at `skills/_shared/video-routing.md:80`. Its managed planner implements these operations, but the production forecast implements another input contract for the same supported original. |
| Existing behavior and scope | 0 | 10 | The existing saved request in finding 4 used two numbered reference slots. The new binder silently reassigned both. Defaults and the other managed provider smoke tests passed. |

### P0 defects

1. **Production cost and approval forecasting omitted original videos.** I passed a saved Flash/720p shot with `referenceVideoTaskIds:['cgt-original']` to `scenePlan`. Reference mode returned `seedance.2-5-flash.720p` with no original ID or reference duration. Edit and extend each threw `Editing and extension require a video and adaptive ratio`. In the tested snapshot `skills/produce/references/seedance-route.js:73`, line 102 and line 164 handled paths and URLs only. The managed reservation already counted originals at `server/src/video-pricing.ts:37`.
2. **A transient original lookup spent the only generation attempt.** I planned through the distributed MCP handler against a successful mock task lookup and approved with one allowed attempt. The execution-time GET returned HTTP 503. The result had `terminal:true` after zero inference POSTs, and the same plan then threw `video_request_failed` after the mock recovered. The lookup at `server/src/seedance-client.ts:982` followed the generic failure path at line 899. The failed job prevented retry at `server/src/video-routing.ts:871`.
3. **Caller arguments overrode the shot's portrait requirement.** I authored `realFaceInput:true`, an unregistered canonical face and a front camera view, then supplied `args.realFaceInput:false` to `video_plan`. The plan still listed the character's face. The approved `video_execute` issued an inference POST with two raw PNG data URIs and zero portrait-management calls. The merge at `server/src/video-routing.ts:417` let the caller replace the flag. The binder at `server/src/video-registry.ts:61` checked the false declaration only when a task ID was present. This reproduction used solid-color fixture images.
4. **Automatic panels changed existing prompt indices.** I authored a green bag as Image 1 and the actor's face as Image 2, with the prompt “Use @Image 1 only for the green bag. Match the dancer to @Image 2.” The actual managed plan listed `face.png, front.png, bag.png`. Its provider prompt kept both original numbers and appended conflicting image descriptions. The tested binder inserted all faces and bodies before the authored references at `skills/channel/references/character-panels.js:238`. Existing prompts could therefore send the actor and prop to the wrong image slots.

### Fix directives

1. Preserve authored video-reference slots, IDs and constraints when appending required character panels. Cover a bag-first saved shot with numbered prompt references and different image bytes.
2. Reject a caller's attempt to weaken a true storyboard portrait declaration before saving or submitting a request. Exercise the unregistered canonical face through the actual MCP handler.
3. Release reservations for proven original-task GET failures before any generation POST. Recover the same approved request after a transient 503 and verify exactly one subsequent inference POST.
4. Include original task IDs and character facial originals in the production forecast, count them toward video input limits and prices, and exercise reference, edit and extend.

### Existing audiovisual result

The separate Seorin full-body rehearsal receipt records one completed standard Seedance 2.0 job with a prior face task, body PNG and selected WAV. I probed the local MP4 and found 496×864 H.264 video, AAC audio and 4.064 seconds of container duration. The recorded estimate was $0.847066. A final charge, a listening judgment and a visual identity assessment were outside this verification. See `/Volumes/data/story/ears-up-club/assets/video/seedance/seorin-full-body-rehearsal/receipt.json:7`.

ASTRA_LOOP_RESULT: score=64 verdict=FAIL p0=4 iter=7
