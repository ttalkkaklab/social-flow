# Loop: 에피소드 커버(episode_cover) 구현

- 날짜: 2026-11-18
- 목표(원문): 설계에 맞게 구현 진행해줘. 구현 후 적대 평가로 95점 이상이 될때까지 개선해줘.
- 분류: Preset E(generic)를 대상에 맞게 고침
- 설계: `docs/superpowers/specs/2026-11-18-episode-cover-design.md`, 계획: `docs/superpowers/plans/2026-11-18-episode-cover.md`
- 대상: `git diff origin/dev...HEAD` — `server/src/cover.ts`, `server/src/sns-client.ts`(Facebook 썸네일), `server/src/tools.ts`·`handlers.ts`, `skills/generate-cover/`, `skills/platform-guide/references/formats.js`(`cover`), `skills/publish/`, `skills/produce/SKILL.md`, `README.md`
- TEST_CMD: `cd server && HOME=$(mktemp -d) npm test` (빌드 뒤), `npm run check:dist`, `node skills/platform-guide/references/skill-lint.js --selftest`, `node skills/platform-guide/references/format-lint.js`
- 통과 기준: 점수 ≥ 95 AND P0 == 0 AND TEST_CMD 전부 exit 0 (사용자 지정 95점)
- 최대 반복: 5

## 고정 루브릭

| # | 기준 | 배점 | 채점 규칙 | 증거 | P0 |
|---|------|------|-----------|------|----|
| 1 | 설계 충족: 설계 문서의 `set`·`render`·`read` 동작, 거부·경고 코드, 출력 파일과 크기, 스토리 우선 보드에서만 하는 복사, 게시 연결(5.6)이 코드와 스킬에 있다 | 25 | 25 − 5 × 설계와 어긋난 동작 수(최소 0). 커버를 얻지 못하거나 잘못된 파일이 게시 경로로 가는 어긋남은 P0 | 설계 절 ↔ 코드 file:line | yes |
| 2 | 정확성과 경계 사례: 경로 탈출, 원본 변경과 낡음 판정, 폰트 선택, 작은 원본, 프레임 시각, 변형, 크롭·띠·측정 계산, Chrome·ffmpeg 실패 처리, Facebook 썸네일 실패 처리에 재현 가능한 결함이 없다 | 25 | 25 − 5 × 재현된 결함 수(최소 0). 에피소드 밖 파일을 읽거나 쓰는 것, 사용자 파일을 잃게 하는 덮어쓰기, 공개 게시를 막거나 다시 올리게 만드는 결함은 P0 | 재현 명령과 출력 | yes |
| 3 | 렌더 결과: 실제로 렌더한 커버와 미리보기에서 글자 깨짐(□), 문구 잘림, 띠 밖 배치, 외곽선이 글자 안을 메움, 미리보기 크롭이 설명과 다름이 없다 | 15 | 15 − 5 × 결함 수(최소 0). □ 가 찍힌 커버가 출력되면 P0 | 렌더한 파일 경로와 관찰 | yes |
| 4 | 문서↔코드 일치: SKILL.md, README 표, 도구 설명, publish·TikTok 절차의 도구 이름·인자·코드·파일명이 코드와 같다 | 10 | 10 − 2 × 틀린 서술 수(최소 0) | 문서 file:line ↔ 코드 file:line | no |
| 5 | 객관 게이트: TEST_CMD 전부 exit 0 | 10 | 전부 → 10, 아니면 0 | 명령과 exit code | yes |
| 6 | 테스트 규칙: 모듈당 한 파일, 바뀐 동작마다 한 케이스, 문구가 아니라 코드·필드 검증, 실제 대기 없음 | 10 | 10 − 2 × 위반 또는 빠진 핵심 케이스 수(최소 0) | test file:line | no |
| 7 | 범위와 문체: 범위 밖 수정 없음, 바뀐 문서·주석에 D8 금지어 없음 | 5 | 둘 다 → 5, 하나 → 2, 없음 → 0 | `git diff --name-only origin/dev...HEAD`, D8 스캔 | no |

## Result

(루프가 끝나면 채운다)
