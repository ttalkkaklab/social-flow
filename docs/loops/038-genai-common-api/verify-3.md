# Round 3 review (commit fe95cf5b)

Reviewer: a fresh `loop-verifier` with the frozen rubric, after the two later user decisions: one scene cast pooled from
the shots by the sheet panel rule, and a scene prompt fitted step by step to the gateway's 2,000-character cap.

| Criterion | Awarded | Max | Reviewer's evidence |
|---|---|---|---|
| 1 Objective gate | 25 | 25 | `npm run build` exit 0, `check:dist` matches the committed build, `npm test` 1417 pass, 0 fail |
| 2 No legacy route call | 20 | 20 | No `/v1/ltx/v2/*-to-video`, scene-to-video, capability or `/v1/ltx/msr` call site in `server/src`, `skills` or `server/dist/bundle.js` |
| 3 Target structure | 20 | 20 | One scene request built in `sceneArgsFromComposed` (`server/src/genai-scene.ts`), validated at planning by `validateGenaiScenePlan` (`server/src/video-routing.ts`) |
| 4 Money and recovery | 15 | 15 | The fitting retry (`buildFittedPlan`) runs only while a plan is built: `scene_prompt_too_long` is thrown before any upload, nothing is saved for a failed step, an authored prompt is never retried, and the loop stops after the last step |
| 5 Gateway evidence | 5 | 5 | `gateway-validate.md`: pundago scenes 3 and 5 accepted by the production `/v1/generations/validate`, resolved prompt equal to the plan's |
| 6 Removed behaviour swept | 8 | 10 | One retained site as in round 2: the per-shot receipt label in `skills/_shared/scene-speech-receipt.js`, kept to verify clips the retired route made |
| 7 Proportionate diff | 5 | 5 | Changes sit in the touched modules and their test files |

Total 98, P0 0. Tail line: `ASTRA_LOOP_RESULT: score=98 verdict=PASS p0=0 iter=3`.

The reviewer also checked that the `shotVisualWords` refactor keeps its output for other engines (same filter and
de-duplication order) and that the short panel sentence keeps every `Image N` whole, so the gateway's renumbering
reaches it. Its first recommendation, a case that a scene still too long at the last step leaves no plan or
blocked-plan record, was added to `video-routing.test.mjs`. Splitting the retained label to pass a grep was suggested
again and not done.
