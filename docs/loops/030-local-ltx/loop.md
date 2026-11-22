# Local LTX Desktop

Select the LTX Desktop model installed on the machine running the plugin and generate locally. Stop at 95/100 or higher with zero critical defects.

| Criterion | Points | Evidence |
|---|---:|---|
| Functional completeness | 40 | 10 each for discovering downloaded local models, persisting and routing a project selection, a real direct Desktop render, and recovery without submitting again. A missing capability blocks completion. |
| Objective gate | 25 | All repository checks pass. Failure blocks completion. |
| Regression tests | 15 | 5 each for selection and planning, local API handling, and recovery or refusal. |
| Conventions | 10 | Deduct 2 per distinct convention violation. |
| Existing behavior and scope | 10 | Existing routes stay compatible and changes serve this feature. |

Run `npm --prefix server run check` and `node skills/platform-guide/references/skill-lint.js`. A fresh reviewer inspects the changes, command results and render evidence.

## Result

The independent reviewer awarded 98/100 with zero P0 defects. The objective gate passed all 1,217 tests with no skips. [Independent report](verify-3.md) · [Native render receipts](render.json).

| Iteration | Objective gate | Independent score |
|---|---|---|
| 1 | Failed during cover and music tests | Skipped |
| 2 | Failed during cover rendering in the host browser | Skipped |
| 3 | Passed with two Node test workers and installed Chromium Headless Shell | 98/100 |
