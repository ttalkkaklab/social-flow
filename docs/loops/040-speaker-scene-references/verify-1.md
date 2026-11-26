# Verification, iteration 1

Reviewer: loop-verifier (fresh context), commit a2271ed5.

| Criterion | Awarded | Max |
|---|---:|---:|
| C1 split counts natively voiced speakers only | 8 | 8 |
| C2 request sends only speakers' pictures and names omitted ones | 8 | 8 |
| C3 freed slots keep H3 shot pictures and LTX object references | 8 | 8 |
| C4 576x1024 / 1024x576 defaults, 736x1280 / 1280x736 override, LTX grid, H3 step budget | 8 | 8 |
| C5 H3 two pinned voices in schema and catalog | 8 | 8 |
| Objective gate (build + full suite, 1479 tests) | 25 | 25 |
| Tests cover the new behavior | 15 | 15 |
| Documentation consistency | 7 | 10 |
| No unrelated edits | 10 | 10 |

P0: none.

P2 findings, fixed after the review:
1. `skills/storyboard/references/dialogue-coverage.md:24` still gave a silent cast member an image slot.
2. `server/src/storyboard.ts:230` (`speakerReferences` description) still implied silent faces reach every engine.

Recommendation also applied: `docs/video-models.md` notes that the plugin binds two H3 voices where the gateway profile lists three.

ASTRA_LOOP_RESULT: score=97 verdict=PASS p0=0 iter=1
