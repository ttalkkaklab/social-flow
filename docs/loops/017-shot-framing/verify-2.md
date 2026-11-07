# Independent adversarial verification — iteration 2

Reviewer: fresh-context `verify_framing_2`, read-only.

| Criterion | Awarded | Max | Evidence |
| --- | ---: | ---: | --- |
| Reported defects no longer reproduce | 32 | 40 | storyboard.ts:1787,1883–1889; shot-view.md:59; generate-cut-images/SKILL.md:30. Crop precedence and active-frame preservation hold; some consumed inputs and host warnings are omitted. |
| Regression proof | 20 | 20 | storyboard.test.mjs:616–711; regression-before logs. Independent module run: 67/67, exit 0. |
| Objective checks | 20 | 20 | Full check exit 0, 1654/1654. Independently reran skill lint: exit 0, 17 rules/29 skills. |
| Root-cause layer | 9 | 10 | storyboard.ts:1624–1645,1859–1920; handlers.ts:1673–1689. Common construction/persistence fixed, provenance incomplete. |
| Scope discipline | 10 | 10 | Scoped diff; no unrelated feature, paid generation, quality gate or model switch. |

P0: none. Missing or invalid output is rejected before active bindings mutate.

## Fix directives

1. P1: pending-request freshness omits consumed inputs. `shotImageSourceBasis` omits
   effective episode style consumed through `production-mode.js` `shotStyle`.
   `inputHashes` hashes only transport images, so changed original JPEG references or
   source-crop originals bypass freshness when prepared copies remain unchanged.
   Snapshot effective style and original as well as transport hashes. Add module cases
   for changed style and changed original reference after preparation.
2. P2: the host branch in handlers.ts:1685–1689 omits `request.warnings`, exposing
   warnings only on completion after generation. Render them in the handoff and add
   a route assertion for a warning-producing request.

Keep decode-before-adoption and preservation of active frames.

ASTRA_LOOP_RESULT: score=91 verdict=FAIL p0=0 iter=2
