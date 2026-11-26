# Speaker-only scene references and smaller GenAI canvases

Target (user, 2026-11-27, verbatim intent): reference only the characters who speak in a GenAI scene, split storyboard scenes by those speakers, use the freed picture slots for scene pictures, default GenAI video to 576x1024 (9:16) and 1024x576 (16:9) with 736x1280 and 1280x736 when needed, and align the H3 pinned-voice limit to two. Iterate with an adversarial reviewer until the score reaches 95.

Classification: Preset A (feature implementation), adjusted. Frozen on 2026-11-27. Before iteration 1 "on-screen speakers" was corrected to natively voiced speakers (off-screen replies included), because a pinned voice needs its speaker's picture.

Evidence from the gateway session (polyp-78, 2026-11-27): two-person H3 scenes (two faces, two voices, one opening picture, 124 frames, 14 steps) rendered on the backend at 576x1024 (job ede89f77…, 313.5 s, 58.9 GiB peak) and 736x1280 (job 3a4019ef…, 380.7 s, 58.9 GiB peak). The production gateway still accepts one scene character until gateway PRs #212 and #214 reach production. LTX was not tried at either size.

| Criterion | Weight | Award rule | Evidence | P0 |
|---|---:|---|---|---|
| Functional completeness | 40 | 8 points per capability, all-or-nothing each. C1: scene reference grouping and the storyboard split count only natively voiced speakers (a line that is not voice-over, in a scene that has on-screen dialogue — the predicate `sceneReferenceGroups` already used, since a pinned voice rides on its speaker's picture); a silent visible character, bystander, voice-over or voice-only speaker never forces a split, and the split is re-evaluated when lines are written. C2: the GenAI scene request (LTX and H3) sends character pictures only for those speakers, and each silent character picture the shots named is reported as `scene_reference_omitted`. C3: a scene with silent visible characters keeps its shot pictures (H3) and non-character object references (LTX) instead of spending slots on silent faces. C4: GenAI project setup guidance saves 576x1024 / 1024x576 by default and names 736x1280 / 1280x736 as the larger choice, with the LTX 64-pixel grid and the H3 step budget stated. C5: the H3 scene accepts at most two pinned voices in the schema and the catalog. | file:line per capability | yes |
| Objective gate | 25 | `cd server && npm run build && HOME=$(mktemp -d) npm test` exits 0. All or nothing. | command + exit code | yes |
| Tests cover the new behavior | 15 | floor(15 × covered capabilities / 5). A capability is covered when a test in the module's own test file fails without the change. | test file:line per capability | no |
| Documentation consistency | 10 | 10 − 2 per stale statement that still says silent cast members get video references, that two referenced people means any visible person, that 1792x1024 / 1024x1792 is the GenAI default, or that H3 takes three voices (CLAUDE.md, README.md, skills/, server/src tool descriptions). Floor 0. | grep pattern + file:line | no |
| No unrelated edits | 10 | All or nothing: every changed file serves the target (source, its dist output, its tests, its docs, version files, this loop folder). | `git diff --name-only` | no |

Exit: score ≥ 95 AND P0 = 0 AND objective gate exit 0. Maximum iterations: 3.

TEST_CMD: `cd server && npm run build && HOME=$(mktemp -d) npm test`

## Result

Achieved in iteration 1: score 97, P0 0, objective gate exit 0 (1479 tests).

| Iter | Score | P0 | Objective gate | Verdict |
|---|---:|---:|---|---|
| 1 | 97 | 0 | exit 0 | PASS |

The two P2 documentation findings were fixed after the review (see verify-1.md).

Not verified by this loop: the production gateway still accepts one scene character until gateway PRs #212 and #214 reach production, so a two-speaker scene returns 422 there until then; no LTX render at 576x1024 or 736x1280 has been made; boards already split under the earlier visible-person rule are not merged back; the H3 step advice scales one production measurement linearly.
