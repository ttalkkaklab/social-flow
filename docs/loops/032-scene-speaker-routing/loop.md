# Episode scene speech routing

Implement mandatory speaker-based routing for episode generation. Use I2V for a non-speaking picture, A2V with the finished track for one speaking character, and two bound voice references with the opening picture for a two-character exchange. Split before a third speaker. Check the complete scene and enforce the contract across planner, adapter calls and execution.

The user approved this rubric and asked to continue until at least 95/100 with zero P0 defects.

| Criterion | Points | Award |
|---|---:|---|
| Functional coverage | 40 | Ten points for each of the four routes, including validation of required inputs and enforcement at public entry points. A missing route or executable bypass blocks acceptance. |
| Objective checks | 25 | Full server build and tests and repository skill lint exit zero. Failure blocks acceptance. |
| Regression tests | 15 | Proportional to the four branches covered through relevant entry points. |
| Conventions | 10 | Deduct two per distinct repository convention violation. |
| Scope and compatibility | 10 | Preserve unrelated operations, historical receipts and approved input ownership. Deduct five per independent regression. |

Checks: `cd server && npm run check` and `node skills/platform-guide/references/skill-lint.js`.
