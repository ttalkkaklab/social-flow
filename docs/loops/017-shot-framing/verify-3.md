# Independent adversarial verification — iteration 3

Reviewer: fresh-context `verify_framing_3`, read-only.

| Criterion | Awarded | Max | Evidence |
| --- | ---: | ---: | --- |
| Reported defects no longer reproduce | 35 | 40 | storyboard.ts:1789 crop precedence, :1884 decode-before-adoption; shot-view.md:59 guidance. Changed character registration bypasses freshness. |
| Regression proof | 20 | 20 | storyboard.test.mjs:616–711,901,1110; before logs; independent module run exit 0, 69/69. |
| Objective checks | 20 | 20 | Full log 1656/1656 exit 0; independently reran skill lint exit 0, 17 rules/29 skills. |
| Root-cause layer | 9 | 10 | storyboard.ts:1625–1647,1862–1923; reference-selection provenance incomplete. |
| Scope discipline | 10 | 10 | Scoped diff, no paid calls, creative gate or model switch. |

P0: none. Missing/invalid output is rejected before replacing active frames.

## P1 and fix directive

Changing registered character references can still adopt a stale host result.
`storyboard.ts:1633` snapshots board character data and :1646 hashes old selected
files, but neither tracks the current panel selections read from panels.json by
`skills/channel/references/character-panels.js:130–150`.

Independent temporary-fixture reproduction: defer a request; change Mina's registered
face from face.png to new-face.png, preserving face.png; a new request selects the new
face, but the old request completes with written:true and binds its old output.

Snapshot and revalidate canonical panel selections for the request cast, or relevant
registry hashes. Add the reproduction to the existing module test, asserting rejection
and unchanged active bindings. Preserve byte hashes, effective style and output decode.

ASTRA_LOOP_RESULT: score=94 verdict=FAIL p0=0 iter=3
