# Independent adversarial verification — iteration 4

Reviewer: fresh-context `verify_framing_4`, read-only.

| Criterion | Awarded | Max | Evidence and refutation |
| --- | ---: | ---: | --- |
| Reported defects no longer reproduce | 40 | 40 | storyboard.ts:1637,1789,1865,1887; shot-view.md:59; generation skill:30. Checked crop conflict, missing/corrupt output, stale board/image inputs, changed panel registration and overlapping pending requests. Rejected completion preserves active bindings. |
| Regression proof | 20 | 20 | storyboard.test.mjs:616,631,654,673,684,707,926,1135; before logs. Independent module run: 70/70, exit 0. Registration coverage preserves active frames and direct-edit sole-source behavior. |
| Objective checks | 20 | 20 | Full check exit 0, log 1657/1657. Independent skill lint exit 0: 17 rules/29 skills. |
| Root-cause layer | 10 | 10 | storyboard.ts:1626,1643,1846,1865,1887; handlers.ts:1673. Shared prompt construction, provenance, reservation, completion and persistence; no episode special case. |
| Scope discipline | 10 | 10 | Scoped diff; handlers.ts:1677, tools.ts:4951, generation skill:73. Saved routing remains; completion bypasses generation. No creative gate or silent model switch. |

P0: none. No unresolved major or minor defect established in the scoped repairs.
No fix directive required.

The score verifies these repairs and regression evidence. It does not certify the
composition of generated images; input freshness and visual inspection remain separate.

ASTRA_LOOP_RESULT: score=100 verdict=PASS p0=0 iter=4
