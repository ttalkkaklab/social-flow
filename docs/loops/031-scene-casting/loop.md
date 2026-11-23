# Scene casting and episode video requests

The target is 95/100, a passing build and test suite, and no blocking defect.

| Criterion | Points | Evidence |
|---|---:|---|
| Functional coverage | 40 | 10 each for scene-only generation, authoring and planning speaker limits, speaker-owned scene references, and image-only silent cast. A missing capability blocks release. |
| Objective checks | 25 | Both server npm run check and skill-lint exit zero. Failure blocks release. |
| Regression tests | 15 | Proportional to the four capabilities exercised. |
| Conventions | 10 | Deduct two per distinct convention violation. |
| Scope and compatibility | 10 | Preserve existing receipts and unrelated behavior. |
