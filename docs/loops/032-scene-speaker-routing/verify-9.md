# Independent review, iteration 9

The candidate at 6be375b0 passed 1,278 tests and skill lint. The independent reviewer ran seven targeted cases and reconstructed the earlier three-speaker binding. Speech planning, attachment and assembly all rejected that binding on the two-voice model.

| Criterion | Score |
|---|---:|
| Functional coverage | 31/40 |
| Objective checks | 25/25 |
| Regression tests | 13/15 |
| Repository conventions | 10/10 |
| Scope and compatibility | 10/10 |

P0. After a dialogue change, attaching a different shot's already-bound native clip marked the changed shot current. Both shots claimed the whole clip with different lines. The reel builder accepted the claims and produced a two-second reel.

P0. The receipt for an archived native binding identified post-render lip-sync and matched the clip's SHA-256. The attachment entry point rejected the file. The reel builder accepted the saved binding and exported it.

ASTRA_LOOP_RESULT: score=89 verdict=FAIL p0=2 iter=9
