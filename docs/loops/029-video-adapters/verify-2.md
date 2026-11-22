# Independent review 2

| Criterion | Score |
| --- | ---: |
| Common call and automatic selection | 35/35 |
| Schema mapping and input preservation | 22/30 |
| Tests and lint | 25/25 |
| Structure and compatibility | 8/10 |

The original legacy reference now reached all three scopes, and the server and lint gates passed. Three counterexamples remained.

1. A cloned legacy card lost its outgoing 0.4-second dissolve because timing looked up the edit by object identity. Veo accepted an eight-second plan for an 8.4-second requirement.
2. Repeating the first endpoint of a legacy pair caused the binder to return early and omit the authored last frame from the Veo body.
3. Two legacy reference paths in different character directories passed the single-subject constraint because their normalized role was `continuity`.

ASTRA_LOOP_RESULT: score=90 verdict=FAIL p0=3 iter=2
