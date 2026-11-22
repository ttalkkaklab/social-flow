# Scene and shot direction

The requested threshold is 95/100 with zero critical defects. Continue correcting findings until it is reached. Freeze these criteria before implementation.

| Criterion | Points | Evidence |
| --- | --- | --- |
| Reachable functionality | 40 | Eight points each for early scene defaults, scoped shot exceptions, visual and performance cues in scene requests, single-shot and multi-shot adapter bodies, and offline icons with readable scope. All five are required. |
| Repository checks | 25 | Both server npm run check and skill-lint exit zero. Required. |
| Regression coverage | 15 | Three points per capability exercised by a targeted test. |
| Usability and conventions | 10 | Deduct two per class of issue in readability, accessibility, language, reuse or compatibility. |
| Scope and regression safety | 10 | Changes stay in scope and existing board data is preserved. |

The verifier inspects the work independently. Record scores and corrections after each review.

## Result

The eighth independent review met the 95-point threshold with no critical defects.

| Review | Score | Critical defects | Server and skill checks |
| --- | ---: | ---: | --- |
| 1 | 82 | 2 | Passed |
| 2 | 82 | 2 | Passed |
| 3 | 90 | 1 | Passed |
| 4 | 90 | 0 | Passed |
| 5 | 92 | 1 | Passed |
| 6 | 92 | 1 | Passed |
| 7 | 92 | 1 | Passed |
| 8 | 98 | 0 | Passed |

The last run passed all 2,045 server tests. Skill lint checked 17 rules across 34 skills. A fresh build matched the committed bundle. Offline desktop and mobile storyboard reviews used the same three-shot example as the scope checks. See [the final review](verify-8.md) for the remaining prompt repetition.
