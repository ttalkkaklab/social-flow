## Target verification report — iteration 6

Verify five Seedance models through managed shots and scenes, including portrait registration, voice-only requests, pricing and recovery. The frozen threshold is 95/100 with zero P0 defects.

### Overall score — 96/100

| Criterion | Awarded | Max | Evidence and attempted refutation |
|---|---:|---:|---|
| Reachable behavior | 40 | 40 | Selection/catalog 8. The same five models reach the text, frame and reference catalogs at `skills/_shared/video-catalog.json:40`, `:280` and `:523`. Shot/scene routing 8. The managed dispatcher preserves the authored prompt and references across card types, timed scenes and legacy scenes at `server/test/video-routing.test.mjs:1230` and `:1286`. Payloads 8. The distributed client sends the provider's edit and extend fields at `server/test/seedance-client.test.mjs:64`. My additional three-image managed request preserved both ordinary files byte for byte around the reviewed face. Budget/settlement 8. The five models have distinct rates or input tiers at `server/src/video-pricing.ts:11`. Measured token charges and zero-cost moderation passed at `server/test/video-routing.test.mjs:1162` and `:1205`. Recovery 8. The saved provider ID survived corrupt downloads and deletion of the local result. Recovery used eight GET requests and zero new submissions at `server/test/video-routing.test.mjs:1132`. |
| Objective gate | 25 | 25 | The parent recorded exit 0 for the full server check. Its log at `/tmp/hafgufa-portrait-iter6-gate.log:1697` records 1,223 passed with zero failures or skips. I reran skill lint. It exited 0 with 17 rules across 35 skills. `git diff --check` also exited 0. |
| Regression coverage | 15 | 15 | Three points each for the catalog comparison at `server/test/seedance-route.test.mjs:17`, shot/scene dispatch at `server/test/video-routing.test.mjs:1230`, the actual task body at `server/test/seedance-client.test.mjs:31`, price bounds at `server/test/video-pricing.test.mjs:20` and recovery at `server/test/video-routing.test.mjs:1112`. My runs of four complete test files and nine selected managed-routing tests passed 22 and 9 tests respectively, both with exit 0. |
| Code and documentation consistency | 6 | 10 | The registration skill documents both character types and first-use inputs at `skills/register-seedance-portrait/SKILL.md:11`. The registered tool describes mixed media at `server/src/tools.ts:2482`. Two distinct pieces of active selection guidance remain stale, listed below. |
| Existing behavior and scope | 10 | 10 | Default 2.0 and 720p remain at `server/src/seedance-client.ts:193`. An existing headless reference still uses ordinary image bytes at `server/test/modelark-assets.test.mjs:218`. I reran the saved LTX and Veo request cases at `server/test/video-routing.test.mjs:837` and `:1036`. Both passed. |

### Previous P0 and account checks

- I registered one fictional portrait through the distributed tool, then called `video_plan`, `video_approve` and `video_execute` on a shot with `realFaceInput:true`. The local inference mock received three image slots in order: the red back-panel bytes, the reviewed face URI and the green bag bytes. It saw one inference POST. The management mock saw one group creation and one asset creation. The repository test also varies the flag between true and omitted for each ordinary input at `server/test/modelark-assets.test.mjs:285`. The resolver distinguishes fitting panels at `server/src/modelark-assets.ts:434`, and the adapter preserves the input order at `server/src/seedance-client.ts:681`.
- The entitlement mock returned HTTP 403 and the structured `videoSubmitted:false` response with zero video calls. An interrupted asset creation recovered the existing upload at `server/test/modelark-assets.test.mjs:188`. The managed slot was released and the same approved plan could run again at `server/test/video-routing.test.mjs:1314`. The ambiguous cast fixture also exercised refusal, repair and retry through the actual managed handler at `server/test/modelark-assets.test.mjs:349`.
- I reran the Seorin voice-only capture. The mock received the selected WAV's digest, the authored line “하나, 둘, 시작!”, native audio enabled and zero images. No portrait-management call occurred. The existing account receipt at `/Volumes/data/story/ears-up-club/assets/video/seedance/seorin-count-in/receipt.json:12` records HTTP 403 `SubscriptionRequired`, zero video jobs and no output. Enterprise enrollment and a successful production render remain unverified.

### P0 defects

None.

### P1/P2 findings

1. The general production guide calls a real face on Seedance a storyboard defect at `skills/produce/references/video-generation.md:35`. The selection table at `skills/produce/references/video-model-selection.md:338` directs such shots to LTX, and the model table at line 538 says every model rejects face input. Those passages omit the registered-portrait route documented at line 258.
2. The quick decision table at `skills/produce/references/video-model-selection.md:343` lists only ASTRA tools for extension. The same guide documents the 2.5 and Flash extension operation at line 548.

### Follow-up

Clarify how reviewed face assets differ from raw images in the decision guidance and include Seedance in the quick extension lookup. Both are documentation changes.

ASTRA_LOOP_RESULT: score=96 verdict=PASS p0=0 iter=6
