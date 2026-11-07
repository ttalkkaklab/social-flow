# Loop 013 — character required/optional fields

- Date: 2026-10-31
- Classification: Preset A (feature implementation), adjusted
- Exit gate: score ≥ 95 AND p0 == 0 AND `TEST_CMD` exit 0 (user-raised threshold)
- Max iterations: 5
- TEST_CMD: `cd server && HOME=$(mktemp -d) npm test`

## Target (verbatim)

캐릭터 설정 필수/선택 재설계: 상단 기본항목(이름·성별·종족·나이·역할·한 줄 소개·키)+이미지(face/front/back)+음성은 필수, 하단 나머지 항목은 모두 선택(키 생략 허용). 전용 MCP 도구 character_manage(기본항목 필수 인자, 나머지 선택 인자) 추가, 스킬 문서 정합. 목표 점수 95 이상, P0 0.

## Capabilities (functional completeness denominator = 7)

1. `identity.gender` (성별) exists and is required.
2. Validator: name heading, gender, species, age, role, summary, heightCm required; every other field optional and may be omitted (missing key or group).
3. Consumers stay safe when optional fields/groups are omitted (direction, review sheet, voice target, video voice, storyboard references).
4. Images: the sheet reports missing face/front/back panels; `shot_image` refuses a missing panel instead of skipping it.
5. Voice: required for a character with lines (handoff fails, sheet warns); docs and code agree on the draft state.
6. `character_manage` MCP tool: required basics as required arguments, other fields optional; writes identity.md and keeps tts/prose.
7. Existing channel identities (orc, gateglass, meleon) carry gender and validate.

## Frozen rubric

| Criterion | Weight | Award rule | Evidence | P0 |
|---|---|---|---|---|
| Functional completeness — the 7 capabilities above exist and are reachable | 40 | 40 × (implemented / 7), rounded down; placeholder = 0 | file:line per capability | yes |
| Objective gate — test runner exits 0 | 25 | all-or-nothing | command + exit code | yes |
| Tests cover the new behavior — one case per capability 1–6 (7 is data, verified by command) | 15 | 15 × (covered / 6), rounded down | test file:line ↔ capability | no |
| Skill/doc consistency — no doc still states "all catalog fields required", traits-with-behavior, or contradicts the new required set | 10 | 10 − 2 per contradicting passage (floor 0) | grep + file:line | no |
| No unrelated edits (Surgical Changes) | 10 | all-or-nothing: changed files ⊆ character identity scope (schema, consumers, sheet, tool, docs, tests, dist, this loop dir) | `git diff --name-only` | no |

## Result

Achieved in iteration 1.

| Iter | Score | P0 | Objective gate | Verdict |
|---|---|---|---|---|
| 1 | 97 | 0 | npm test exit 0 (2669/2669) | PASS |
