# Loop 002 — episode cast gate

- Date: 2026-11-01
- Target (verbatim): 목표: 에피소드 작성 전에 주요 캐릭터(정체성 + 캐릭터 시트)가 설정되도록 social-flow 플러그인 코드와 문서를 개선한다. 종료 기준: 적대적 평가 95점 이상, P0 0개.
- Owner decision (HITL, 2026-11-01): missing sheet panels block before the story (`story_sequence`), not only at `shot_image`. Text-only requests also need the cast's identities and panels.
- Classification: Preset A (feature implementation), adjusted
- Exit gate: score ≥ 95 AND p0 == 0 AND `TEST_CMD` exit 0 (user threshold 95 overrides the preset's 90)
- Max iterations: 5
- TEST_CMD: `cd server && HOME=$(mktemp -d) npm test` (CI has no `~/.config/social-flow/disabled-tools.json`), plus `npm run build` and the `.github/workflows/check.yml` steps

## Frozen rubric

| # | Criterion | Weight | Award rule | Evidence | P0 |
|---|-----------|--------|-----------|----------|----|
| 1 | Functional completeness: (a) `story_sequence` refuses to start a new board inside an episode until `storyboard/cast.json` names at least one character; (b) every cast entry resolves to an existing `assets/characters/<id>/identity.md`; (c) every on-screen cast member has its face, front and back sheet panels before the story starts; (d) a story-first board cannot bypass the cast through `SB_DOC.characters` alone, and `shot_characters`/`shot_dialogue` apply the same cast rules | 40 | 40 × (capabilities implemented and reachable / 4), rounded down | file:line per capability | yes |
| 2 | Objective gate: `HOME=$(mktemp -d) npm test` in `server/` exits 0 and `npm run build` leaves `server/dist` in sync | 20 | all-or-nothing | command + exit code | yes |
| 3 | Tests cover the new behavior: one case per capability in the module's test file | 15 | 15 × (covered / 4), rounded down | test file:line ↔ capability | no |
| 4 | Docs and tool descriptions agree with the code (CLAUDE.md, production-workflow.md, storyboard SKILL §1, character-scenarios.md, character-identity.md, tools.ts, README) and the §1 vs production-order contradiction is gone | 15 | 15 − 3 per contradiction or stale sentence (floor 0) | file:line | no |
| 5 | Style and CI: CLAUDE.md D8 scan clean on changed prose; the check.yml steps that touch changed files pass | 5 | 5 − 1 per violation (floor 0) | command output | no |
| 6 | Surgical changes: changed files ⊆ target scope | 5 | all-or-nothing | `git diff --name-only origin/dev` | no |

## Result

Achieved in iteration 1.

| Iter | Score | P0 | Objective gate | Verdict |
|------|-------|----|----------------|---------|
| 1 | 96 | 0 | 2691/2691, dist in sync | PASS |

After the pass, two P2 findings were fixed: `readCast` reads the older object-form `cast.json` again, and a case covers shot_dialogue's repeated cast check. A narrator-only cast stays allowed, since narrator-only explainers are a valid video type.
