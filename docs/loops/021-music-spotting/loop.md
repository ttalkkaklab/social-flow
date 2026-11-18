# Loop 021 — music spotting

Date: 2026-11-14. Classification: feature implementation (preset A, adjusted and confirmed by the user).

## Target (verbatim)

배경음악 배치 개선(음악 스포팅 단계·도구, 다른 편 곡 무단 재사용 방지, 채널 음악 방향 저장, 구간 시작 위치·작은 음량 경고)을 구현하고 insight-04 보드 사본에 플러그인으로 적용하는 가정 테스트를 통과시킨다. 적대 평가 95점 이상, P0 0건까지 반복.

## Frozen rubric

Exit gate: total ≥ 95 AND P0 == 0 AND the objective gate passes. Max 5 iterations.

| # | Criterion | Weight | Award rule | Evidence | P0 |
|---|-----------|--------|-----------|----------|----|
| 1 | Functional completeness — the five capabilities exist and are reachable: (a) a tool records a music decision for each scene, (b) a cue file reused from another episode without a generation receipt is detected, (c) the channel's music direction is saved in project settings and shown when spotting, (d) a timeline span can start its cue at a source offset, (e) music that sits too far under the speech is warned about | 30 | 30 × (implemented / 5), rounded down; a placeholder body counts 0 | file:line per capability | yes |
| 2 | Objective gate — `cd server && npm run check` exits 0 | 25 | all-or-nothing | command + exit code | yes |
| 3 | insight-04 application test on a copy of the board — (i) every scene carries a decision written by the plugin tool, (ii) the sound plan compiles and the timeline renders, (iii) every scored span has signal inside it, (iv) the bed is silent outside the spans, (v) the live insight-04 files are unchanged | 20 | 4 per verified sub-claim | commands, measured values, hashes | yes |
| 4 | Tests cover the new behavior — at least one case per capability, in the module's own test file | 10 | 10 × (covered / 5), rounded down | test file:line per capability | no |
| 5 | Repository rules — no new execution gate (new checks warn or report, except unreadable input), Korean style scan clean on changed files, README tool list and committed `server/dist` reflect the change | 10 | 10 − 2 per violation class, floor 0 | file:line or command output | no |
| 6 | No unrelated edits | 5 | all-or-nothing | `git diff --name-only` against the target scope | no |

Test command: `cd server && npm run check`.

The insight-04 test uses synthetic cue files and a synthetic edit clock. No music is generated, nothing is spent and nobody listens; it checks placement and signal, never musical quality.

## Result

Achieved at iteration 2 of 5.

| Iter | Score | P0 | Objective gate | Verdict |
|------|-------|----|----------------|---------|
| 1 | 98 | 0 | exit 0 (1722 pass) | PASS |
| 2 | 100 | 0 | exit 0 (1722 pass) | PASS |

Iteration 1 was a light pass, so iteration 2 re-verified the final tree with 18 executed break attempts. Two P2 findings from it were fixed afterwards and checked by the gate and the application test (verify-2.md).

Replay on real inputs, output to scratch: the new renderer on insight-03's last build reports the gift, responsibility and apology spans as 21 to 22 LU under the speech and the tension cue as looping; the new compiler on insight-03's first integrated build reports both cue files brought from insight-01 as having no receipt.

Not done here: no commit, no install, no change to the live insight workspace, no music generated and no listening.

Artifacts: loop.md, verify-1.md, verify-2.md, iter-1-summary.md, apply-board.mjs.
