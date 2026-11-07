# Loop: 스토리보드 템플릿과 단계 도구·스킬 개선

- 날짜: 2026-10-31
- 목표(원문): 새롭게 업데이트된 스토리보드 템플릿을 분석하고 도구나 스킬의 개선점이 있는지 적대적으로 평가하고 개선해줘. 평가점수 95점 이상 될때까지 개선해줘.
- 분류: Preset E(generic)를 대상에 맞게 고침
- 대상: `skills/storyboard/references/storyboard-html-template.html`, 이를 채우는 단계 도구
  (`story_sequence`·`story_scene`·`story_shot`·`shot_characters`·`shot_dialogue`·`shot_icons`·
  `shot_image`·`shot_prompt`·`video_approve`, `server/src/storyboard.ts`·`tools.ts`·`handlers.ts`),
  관련 스킬 문서(`skills/storyboard/`, `skills/_shared/production-workflow.md`, `skills/generate-cut-*`)
- TEST_CMD: `cd server && npm test`
- 통과 기준: 점수 ≥ 95 AND P0 == 0 AND TEST_CMD exit 0 (사용자 지정 95점, 기본 90점보다 높다)
- 최대 반복: 5

## 고정 루브릭

| # | 기준 | 배점 | 채점 규칙 | 증거 | P0 |
|---|------|------|-----------|------|----|
| 1 | 템플릿↔도구 필드 계약: 단계 도구가 쓰는 필드(샷 스토리·캐릭터·대사·아이콘 속성·시작/종료 이미지·참조·영상 프롬프트·승인 상태)를 템플릿이 그리고, 템플릿이 읽는 단계 필드를 도구가 실제로 쓴다 | 30 | 30 − 5 × 어긋난 필드 수(최소 0). 리뷰어가 승인에 필요한 정보를 못 보는 어긋남이 하나라도 있으면 P0 | 도구 file:line ↔ 템플릿 file:line | yes |
| 2 | 단계 도구 정확성: 재실행·수정·종료 이미지 낡음·캐스트·순서 같은 경계 사례에 결함이 없다 | 20 | 20 − 5 × 재현 가능한 결함 수(최소 0). 데이터 손실이나 잘못된 생성 입력을 만드는 결함은 P0 | 코드 file:line + 재현 경로 | yes |
| 3 | 스킬 문서↔도구 일치: 문서의 도구 이름·인자·순서·거부 코드가 코드와 같다 | 15 | 15 − 3 × 틀린 서술 수(최소 0) | 문서 file:line ↔ 코드 file:line | no |
| 4 | 객관 게이트: `server`의 `npm test` exit 0, `server/dist`가 `server/src`와 동기화 | 15 | 둘 다 → 15, 아니면 0 | 명령 + exit code | yes |
| 5 | 바뀐 동작의 테스트: CLAUDE.md 테스트 규칙(모듈당 한 파일, 바뀐 동작마다 한 케이스, 구조 검증) | 10 | 10 × (테스트된 동작 변경 / 동작 변경), 내림. 동작 변경이 없으면 10 | test file:line ↔ 변경 | no |
| 6 | 범위 밖 수정 없음, 바뀐 문서·주석에 D8 금지어 없음 | 10 | 둘 다 → 10, 하나 → 5, 없음 → 0 | `git diff --name-only`, D8 스캔 출력 | no |

## Result

달성 — 5회차에 99점, P0 0, `npm test` 통과.

| 회차 | 점수 | P0 | 객관 게이트 | 판정 |
|---|---|---|---|---|
| 1 | 56 | 1 | 통과 | FAIL |
| 2 | 76 | 0 | 통과 | FAIL |
| 3 | 94 | 1 | 통과 | FAIL |
| 4 | 84 | 1 | 통과 | FAIL |
| 5 | 99 | 0 | 통과 | PASS |

남은 P2는 verify-5.md에 적었다. 산출물: loop.md, verify-1~5.md, iter-1~4-summary.md.
