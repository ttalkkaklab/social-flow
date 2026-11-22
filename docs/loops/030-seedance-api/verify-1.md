## Target verification report — iteration 1

Verify first-class Seedance production support on the LTX/Veo workflow. The frozen acceptance threshold is 95/100 with zero P0 defects.

### Overall score — 72/100

| Criterion | Awarded | Max | Evidence and refutation |
|---|---:|---:|---|
| Reachable behavior | 16 | 40 | Selection/catalog 8. A fresh SDK client connected to `server/dist/bundle.js` and found all five model IDs, including Flash, on each of the three Seedance tools. Defaults remain at `server/src/seedance-client.ts:184`. Shot and scene routing 0. Shots, paired frames and spoken scenes have working paths, but a changed authored reference can still reach paid dispatch under the old approval, as reproduced below. ModelArk payload 8. The mock at `server/test/seedance-client.test.mjs:31` captures actual POST bodies for edit and extend. The IDs, roles, duration and adaptive ratio agree with the official create-task and model-release documents. Budget/settlement 0. The token tiers and adaptive-duration reservation match the pinned pricing tables, but an explicit zero-cost provider failure retains the full reservation. Provider-ID recovery 0. The recorded ID produces GET-only recovery, but a non-video response completes the request and prevents another recovery attempt. |
| Objective gate | 25 | 25 | The parent recorded exit 0 for both required commands. The full log at `/tmp/hafgufa-seedance-gate.log` reports 1,211 passed, zero failed and zero skipped. I reran skill lint independently and received exit 0 with 17 rules passing across 34 skills. |
| Regression coverage | 15 | 15 | Executable cases cover selection in `server/test/video-routing.test.mjs:1101`, spoken scene binding at line 177, HTTP payloads in `server/test/seedance-client.test.mjs:31`, pricing in `server/test/video-pricing.test.mjs:20` and GET-only refresh in `server/test/video-routing.test.mjs:1121`. The recovery fixture exposes a faulty completion expectation. The four focused regressions in the supplied scene log also passed. |
| Code and documentation consistency | 6 | 10 | The five-model table and task restrictions agree with BytePlus `model-release-announcement.md:11` and `create-video-generation-task-api.md:239`. The token table matches `model-pricing.md:154` and line 167. Two stale instructions survive in the active model-selection guide, detailed below. |
| Existing behavior and scope | 10 | 10 | The default remains Seedance 2.0, and `server/test/video-routing.test.mjs:120` exercises saved snapshot and override precedence. The full check includes the other providers. `git diff --check` passed. The browser catalog and generated server bundle include the new model. |

### P0 defects

1. **An approved shot can submit an obsolete reference.** In a temporary project using the built router, I saved and approved a Flash extension with `referenceVideoUrls:["asset://old"]`, changed the authored shot to `["asset://new"]`, then executed the saved plan against a mock dispatcher. The dispatcher received `["asset://old"]`. The planner folds the authored fields into caller arguments and stores them as `sourceArgs`. Replanning for execution reapplies those stored arguments over the current board. The single-shot revision omits the affected fields. See `server/src/video-routing.ts:394`, line 705, line 810, and `skills/_shared/video-selection.js:196`.
2. **An explicit unbilled failure continues consuming the episode budget.** In the same fixture I interrupted polling after recording a provider ID, then returned ModelArk status `failed` with a moderation error on refresh. The job ended as `failed`, with `settledUsd` absent and `reserveUsd:3.640896`. The next request counts all $3.640896 as spend. Both the normal and refresh paths can retain that amount. BytePlus charges only for successful generation, according to its [pricing rules](https://docs.byteplus.com/en/docs/ModelArk/model-pricing). See `server/src/seedance-client.ts:532` and line 560, and `server/src/video-routing.ts:838`, line 859 and line 1010.
3. **Recovery can declare an unusable artifact complete.** The new recovery test returns the seven text bytes `fixture` from its fake download URL and asserts that the job completed. The download accepts any nonempty body. The next refresh sees the completed status and returns it without consulting the provider. A 200 HTML response or truncated payload can therefore consume the sole recovery path. See `server/test/video-routing.test.mjs:1124`, `server/src/vendor-video.ts:101`, and `server/src/video-routing.ts:982`. The synchronous HTTP test also treats `media fixture` as a finished video at `server/test/seedance-client.test.mjs:50`.

### P1 and P2 findings

1. The active I2V guidance says every nonadaptive ratio center-crops the input. The 2.5 and Flash schema rejects that request. Qualify the crop behavior by model. See `skills/produce/references/video-model-selection.md:444` and `server/src/seedance-client.ts:296`.
2. The same guide says a timed-out task must be recovered from the console. The managed Seedance route already polls the existing provider ID through `video_status`. See `skills/produce/references/video-model-selection.md:456` and `server/src/video-routing.ts:993`.

### Fix directives for iteration 2

1. Keep explicit caller arguments distinguishable from board-derived Seedance fields, and bind changes to those fields into the single-shot revision. Add an approval and execution regression that edits, replaces or removes the authored reference/task or sound setting after planning and verifies zero dispatches.
2. Propagate definitive, unbilled provider-terminal status through normal polling and GET recovery, and settle those failures at zero. Keep successful provider work billable when the output fails a local timing check. Exercise the next request against a tight budget after the provider-reported failure.
3. Verify the downloaded temporary Seedance file contains playable video before publishing it and marking the job complete. A bad download must leave the original ID eligible for GET-only recovery. Test a 200 non-media or truncated body followed by a valid tiny MP4 from the same ID, and test the normal download path with real media bytes.
4. Correct both active model-selection instructions and rerun the two objective gates. Keep the model-specific behavior consistent with the current BytePlus reference.

The verification used local fixtures, a fresh packaged STDIO session and the supplied copies of the official BytePlus documents. Provider-side account entitlements and remote inference were outside the authorized test scope.

ASTRA_LOOP_RESULT: score=72 verdict=FAIL p0=3 iter=1
