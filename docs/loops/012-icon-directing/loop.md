# 아이콘 연출 기법 개선 루프

요청: "너의 분석에 기반해서 이 플러그인이 최고 품질의 영상을 만들도록 개선해줘. 개선 후, 적대적으로 평가해서 95점 이상이 될때까지 개선해줘."

목표: 2026-10-31 연출 기법 조사(`docs/research/2026-10-31-directing-technique-conventions/index.html`)의 결론과 코드 지적을 바탕으로, 스토리보드 아이콘 연출 기법(카메라 이동·샷 크기·앵글·심도·스틸 효과)이 샷마다 효과적으로 정해지고 이미지·영상 프롬프트에 정확히 실리도록 플러그인을 고친다. 컷 길이(`timing.*`)는 사용자 지침상 `shot_icons` 속성이 아니라서 카드 안내만 범위에 넣는다.

2026-10-31 고정. 사용자가 기준표(그대로)와 최대 반복 5회를 골랐다. 끝나는 조건은 95점 이상, P0 0건, 객관 게이트 통과다(스킬 기본값 90을 사용자 요청 95가 대신한다). 유료 생성과 게시는 검증에 넣지 않는다.

분류: 기능 구현(프리셋 A), 프롬프트 실측 기준 하나를 더하고 테스트·범위 비중을 5점씩 옮겼다.

## 기준표

| # | 기준 | 배점 | 채점 | 근거 | P0 |
|---|---|---:|---|---|---|
| 1 | 기능 완성도: 아래 C1~C9가 도구 흐름(`shot_icons` → `shot_image`·`shot_prompt` → 리뷰 HTML)에서 실제로 닿는다 | 40 | floor(40 × 구현된 기능 / 9). 자리표시만 있는 기능은 0 | 기능마다 file:line과 반례 시도 | 하나라도 빠지면 |
| 2 | 객관 게이트 | 25 | `cd server && npm run build && npm test` exit 0, `node skills/storyboard/references/assemble-bg-prompt.js --selftest` exit 0이면 25, 아니면 0 | 명령과 exit code | 예 |
| 3 | 새 동작 테스트 | 10 | floor(10 × 테스트가 있는 코드 기능 / 코드가 바뀐 기능). 모듈 테스트 파일에 케이스가 있어야 인정 | 테스트 file:line ↔ 기능 | 아니오 |
| 4 | 프롬프트 실측 | 10 | 종단 테스트(`server/test/`의 `shot_image`·`shot_prompt` 케이스)가 아래 P1~P10을 단언하고 통과. floor(10 × 통과 / 10) | 테스트 file:line과 실행 결과 | 하나라도 빠지면 |
| 5 | 저장소 규칙 | 10 | 10 − 2 × 위반 종류(최소 0). 종류: D8 금지 어미, 테스트 파일 규칙, dist 동기화, 영어 전용 프롬프트, 2026-10-31 지침에 어긋나는 새 실행 게이트, 주변 코드와 다른 관례 | grep 결과와 file:line | 아니오 |
| 6 | 범위 | 5 | 변경 파일이 모두 범위 목록 안이면 5, 아니면 0 | `git diff --name-only`, `git status` | 아니오 |

### 기능 C1~C9

- C1 앵글 7종 전부(`ground`·`over` 포함)가 (a) `assemble-bg-prompt.js` ANGLE_WORDS 낱말, (b) MSR `shot_prompt` 문장, (c) 리뷰 아이콘, (d) 한국어 이름과 툴팁을 갖는다.
- C2 리뷰 HTML의 크기·앵글·이동 칩 툴팁이 한국어 보기에서 한국어 설명 하나를 보여 준다. 영어 instruction이 그 자리를 대신하지 않고, 쓰이지 않는 설명 맵이 없다.
- C3 `shot_icons`가 받는 모든 값(크기 18, 앵글 7, 이동 기법 전부, 초점 기법, 심도 3, 스틸 효과 전부)에 쓸 때·피할 때·프롬프트에 적을 것이 있고 `storyboard_read`의 `techniqueCatalog`로 닿는다.
- C4 카메라 이동·앵글 문구가 조사에서 근거가 없거나 조건부인 정서 효과를 단정하지 않는다(이동의 정서, 로우 앵글의 힘·위협, 하이 앵글의 약함).
- C5 `shot_prompt`의 카메라 문장이 영상 모델 안내의 어휘(push in, pull back, pan, tilt, static frame 등)로 쓰이고, `shot_icons`에서 받은 속도와 도착점(target·end)을 담고, 이동 컷의 시작·끝 멈춤을 유지한다.
- C6 `shot_icons`의 focus가 두 대상(가까운 대상·먼 대상)을 받고, `shot_prompt`가 그 이름으로 랙 포커스 문장을 쓴다.
- C7 9:16 보드에서 `shot_icons` 결과가 고른 값의 세로 화면 안내를 돌려준다. 거부하지 않고, 16:9 보드에는 돌려주지 않는다.
- C8 스틸 효과 전부가 리뷰 아이콘 줄에서 서로 다른 아이콘 키와 그림을 갖는다(확대 ≠ 축소 ≠ 다가가기, 팬 ≠ 공개, 초점 모으기 ≠ 초점 이동).
- C9 `focusFrom`·`focusTo`를 적은 pan·tilt는 두 영역 거리만큼 창이 움직이도록 확대 배율을 정한다(원본과 화면 비율이 같아도 화면의 10% 이상). 영역 없는 옛 pan의 대각선 기본 동작은 그대로다. 정지(`hold`) 스틸 효과가 `shot_icons`·렌더러·검사·아이콘에서 동작한다.

### 프롬프트 실측 P1~P10

P1 크기 낱말, P2 앵글 낱말, P3 `ground` 앵글 낱말(이미지 프롬프트), P4 `over` 앵글 낱말(MSR 영상 프롬프트), P5 심도 문장(MSR), P6 이동 동사, P7 속도, P8 도착점(target 또는 end), P9 이동 컷의 시작·끝 멈춤, P10 랙 포커스 두 대상 이름.

### 범위 목록

`skills/storyboard/**`, `skills/_shared/**`, `server/src/**`, `server/dist/**`, `server/test/**`, `docs/research/2026-10-31-directing-technique-conventions/**`, `docs/index.html`, `docs/loops/012-icon-directing/**`. `server/node_modules`는 git 추적 대상이 아니다.

## 시작 상태

- 앞선 작업: 조사 문서 `docs/research/2026-10-31-directing-technique-conventions/`와 `docs/index.html` 카드.
- 샷 크기 조사 에이전트가 사용자 지시("조사 결과에 기반해서 … 베스트 프렉티스로 수정해줘")로 루프 시작 전에 고친 파일: `film-techniques.js`·`film-techniques.md`·`assemble-bg-prompt.js`·`storyboard-html-template.html`, `server/src/tools.ts`·`storyboard.ts`, `server/test/film-techniques.test.mjs`, `server/dist/` 3개. 이 변경도 같은 기준으로 채점한다.
- 검증 에이전트는 새 맥락에서 읽기만 하고, 보고서 끝에 `ASTRA_LOOP_RESULT: score=N verdict=PASS|FAIL p0=N iter=N`을 적는다. PASS는 95점 이상이면서 P0 0건일 때만이다.

## 결과

달성: 2회차 98점, P0 0건, 객관 게이트 통과.

| 회차 | 점수 | P0 | 객관 게이트 | 판정 |
|---|---:|---:|---|---|
| 1 | 98 | 0 | 통과 | PASS. 통합 전 트리라서 루프를 이어 갔다 |
| 2 | 98 | 0 | 통과(빈 `HOME`, CI와 같은 조건) | PASS |

2회차 뒤에 손본 것은 재채점하지 않았다. 테스트 2639개와 check.yml 전 단계로 확인했다.

- dev가 #538(7b116e78)로 움직여서 그 위로 옮기고 dist를 다시 빌드했다.
- 원본이 이미 1.5배 업스케일 한도에 닿아 있어도 영역 팬·틸트가 멈추지 않는다. 이때는 줌 1.13을 지킨다.
- `tools.ts`의 스틸 카메라 설명에 `hold`와 영역 기반 줌을 적었다.
- `camera.low`의 세로 안내와 `camera.arc`의 쓰임 문구를 앞뒤 컷 조건으로 바꿨다.
- 테스트를 더했다.
  - 스틸 컷을 영상 컷으로 바꾸면 intentional still이 빠지는지
  - 손으로 쓴 한국어 끝 구도에 필드 이름을 대고 오류를 내는지
  - 대상 없는 랙 포커스가 경고를 내는지

다음은 하지 않았다.

- 실제 생성으로 효과를 재 보지 않았다. 유료 생성은 범위 밖이다.
- `mount()`의 `maxZoom` 계산은 브라우저 캔버스가 필요해서 단위 테스트를 두지 않았다.
- 서로 어긋나는 입력에는 경고를 넣지 않았다. 느린 휩 팬, `depth.focus`와 `focus.from`이 다른 경우가 그렇다. 2026-10-31 지침에 따른 판단이고, 카드 문구가 이 조합을 안내한다.
