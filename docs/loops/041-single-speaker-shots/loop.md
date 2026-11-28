# One speaking identity per shot

Target (2026-11-28): prevent the LLM from assigning two people's dialogue to one shot and iterate until independent adversarial review scores at least 95/100 with zero P0 findings.

| Criterion | Points | Evidence |
| --- | ---: | --- |
| Structured authoring invariant | 40 | 10 each for atomic refusal by shot_dialogue, bulk storyboard writes, speech edits, and episode planning from externally edited boards. Any bypass of these structured entry points is P0. |
| Regression coverage | 20 | 5 each for public-entry tests of those four paths. |
| Objective gate | 20 | Both server npm run check and skill-lint exit 0. Failure is P0. |
| Correct scope | 10 | 5 for counting all delivery modes including one-takes, 5 for permitting silence, multiple visible actors and different speakers across shots. |
| Authoring guidance | 10 | 10 minus 2 per distinct contradictory active instruction, floored at zero. |

The score measures the storyboard software. Generated audio quality requires inspecting a take.

## Result

| Iteration | Independent score | P0 | Outcome |
| --- | ---: | ---: | --- |
| 1 | 94 | 0 | Correct conflicting guidance and the bracketed speaker-label case. |
| 2 | 98, then 100 after the wording amendment | 0 | Passed. |

The server check passed 1,482 tests. The final wording amendment passed 48 tool contract and bundle tests. Skill lint passed 17 rules across 35 skills. The independent reports are in [verify-1.md](verify-1.md) and [verify-2.md](verify-2.md).
