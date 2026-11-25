# Round 1 review (commit d8ee7b70)

Reviewer: a fresh `loop-verifier` with the frozen rubric and the changed files only.

| Criterion | Awarded | Max | Reviewer's evidence |
|---|---|---|---|
| 1 Objective gate | 25 | 25 | `npm run build` exit 0 and no `server/dist` drift after a fresh build; the worker's `npm test` exit 0 (1413 pass) was not re-run |
| 2 No legacy route call | 20 | 20 | No `/v1/ltx/v2/*-to-video`, `/v1/ltx/v2/scene-to-video`, `/v1/ltx/msr` or capability route in `server/src`, `skills`, `server/dist/bundle.js`, README or CLAUDE.md; only the out-of-scope `/v1/ltx/desktop/*` routes remain |
| 3 Target structure | 20 | 20 | Every GenAI body is built in `astra-genai-video.ts` and posted to `GENERATIONS_ROUTE`; scenes are validated at planning and before submission; the live character reaches the same path |
| 4 Money and recovery | 15 | 15 | Atomic receipt claim and follow; scene replay under the same `X-Request-Id` inside 23 hours; download checked against the resolved frames and cut back; each with a test |
| 5 Gateway evidence | 5 | 5 | `gateway-validate.md`: four production `/validate` runs whose resolved prompt equals the plan's prompt with labels filled in |
| 6 Removed behaviour swept | 0 | 10 | At least five sites: a stale `per_shot` sentence in the MCP server instructions (`server/src/tools.ts:1070`), the per-shot receipt check in `skills/_shared/scene-speech-receipt.js`, and test fixtures writing `operation:'scene-to-video'` receipts and `per_shot` plan values |
| 7 Proportionate diff | 5 | 5 | One test file per module, no unrelated edits, repository prose in English |

Total 90, P0 0. Tail line: `ASTRA_LOOP_RESULT: score=90 verdict=FAIL p0=0 iter=1`.

Fix directives, in the reviewer's order:

1. Reword `server/src/tools.ts:1070` to drop the `per_shot` sentence and rebuild.
2. Remove the other `per_shot` and `scene-to-video` sites, either by deleting the legacy per-shot receipt support or by keeping one label for it; drop `per_shot` from the retired-mode test values.
3. Optional: send `X-Request-Id` on the direct text, image, audio and MSR submits.
