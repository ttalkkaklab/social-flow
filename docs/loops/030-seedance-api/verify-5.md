## Target verification report — iteration 5

Verify the five Seedance models through managed shots and scenes, including model-specific payloads and costs, provider job recovery, portrait registration and audio-only character references. The frozen threshold is 95/100 with zero P0 defects.

### Overall score — 90/100

| Criterion | Awarded | Max | Evidence and attempted refutation |
|---|---:|---:|---|
| Reachable behavior | 32 | 40 | Selection/catalog 8. All five model IDs appear under each adapter in `skills/_shared/video-catalog.json:40`, `:280` and `:523`. Shot and scene routing 8. The selected cards retain their prompts and named references at `server/test/video-routing.test.mjs:1230` and `:1286`. ModelArk payloads 0. Edit and extension reach the mock with their correct fields at `server/test/seedance-client.test.mjs:31`, but a declared portrait with ordinary reference media produced the wrong payload or stopped before inference. Budget/settlement 8. Measured token charges and moderation release pass at `server/test/video-routing.test.mjs:1162` and `:1205`. Provider-ID recovery 8. A damaged download and a missing local output both reuse the original job at `server/test/video-routing.test.mjs:1112`. |
| Objective gate | 25 | 25 | The parent recorded exit 0 for the full server check. The gate log records 1,223 passed, zero failed and zero skipped. I reran skill lint and `git diff --check`. Both exited 0. Skill lint checked 17 rules across 35 skills. |
| Regression coverage | 15 | 15 | All five rubric areas have executable cases at `server/test/seedance-route.test.mjs:17`, `server/test/video-routing.test.mjs:1230`, `server/test/seedance-client.test.mjs:31`, `server/test/video-routing.test.mjs:1162` and `:1112`. My independent focused run passed 21 tests with zero skips. The new ambiguity reproduction at `server/test/modelark-assets.test.mjs:297` reaches the actual managed handler, proves the slot is released, corrects the cast and executes the same approved plan. |
| Code and documentation consistency | 8 | 10 | First-use registration now supplies the group type and real-person verification ID at `skills/register-seedance-portrait/SKILL.md:12`. The production guide directs callers to set the face flag at `skills/produce/references/video-generation.md:53`. The adjacent reference-field guidance permits character/product panel paths at `skills/produce/references/video-model-selection.md:294`. That combination fails on the distributed adapter. |
| Existing behavior and scope | 10 | 10 | The original 2.0/720p defaults remain at `server/src/seedance-client.ts:193`. Historical headless media with the flag false or absent passes at `server/test/modelark-assets.test.mjs:218`. The gate includes existing LTX/Veo dispatch and saved selection cases at `server/test/video-routing.test.mjs:837` and `:1036`. |

### P0 defect

1. **Declaring one portrait changes every other image into a portrait requirement.** I registered a face, created a distinct red headless back panel, and submitted them together with `realFaceInput:true` through the distributed Flash adapter. The local mock recorded two asset creations and received `[asset://asset-first, asset://asset-fitting]`. The fitting panel had no existing registration. Replacing that panel with an ordinary product image returned `modelark_asset_sheet_required` before a video POST. The board forwards the shot-wide flag at `skills/_shared/video-selection.js:31`. The adapter applies it to every file at `server/src/seedance-client.ts:674`, and the resolver treats it as sufficient for any canonical file at `server/src/modelark-assets.ts:431`. The existing mixed-media test at `server/test/modelark-assets.test.mjs:286` exercises an omitted flag.

### Fix directive

1. Preserve the intended portrait, clothing and product roles per input in declared-face requests. Keep the refusal for an explicitly face-bearing image that cannot be mapped. Exercise the actual managed dispatch with a reviewed portrait plus an ordinary fitting and product. Assert the ordered provider values, which file reaches registration and the number of inference requests. Align the production and tool guidance with the supported input contract.

### Other verified behavior

The registration tool preserves unrelated sheet data and reuses the reviewed face ID at `server/test/modelark-assets.test.mjs:134`. Entitlement refusal and uncertain-upload recovery pass at line 188. The managed reservation release passes at `server/test/video-routing.test.mjs:1314`. I reran the local Seorin voice-only check through `video_execute`. It matched the selected WAV digest, the exact Korean line and zero image inputs or portrait management calls. The local mock stopped at the inference POST. The supplied account result was HTTP 403 `SubscriptionRequired`. Successful production portrait enrollment and video rendering remain unverified.

ASTRA_LOOP_RESULT: score=90 verdict=FAIL p0=1 iter=5
