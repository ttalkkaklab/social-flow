# 016 · 스토리보드 템플릿 기준 감사 모순 해소

- 날짜: 2026-11-04
- 목표(원문): 스토리보드 템플릿 기준 감사에서 나온 모든 모순(상 7·중·하 항목)을 고치고, 적대적 평가 95점 이상·P0 0건까지 반복
- 분류: Preset E(generic) 변형 — 감사 항목 해소가 중심이고 버그 두 건에는 회귀 테스트를 붙인다
- 합격선: 95점 이상 AND P0 0건 AND 자동 검사 exit 0 (사용자가 기본 90점을 95점으로 올림)
- 최대 반복: 5회
- TEST_CMD: `cd server && HOME=$(mktemp -d) npm test` · `node skills/platform-guide/references/format-lint.js` · `node skills/storyboard/references/storyboard-html.js <오크 보드 사본> --check`

## 감사 항목 (21건)

### 상 (미해소 시 P0)

- H1 `story_shot` 삽입·이동 때 다음 샷에 저장된 전환(`transition`·`edit`)이 함께 옮겨 가서, 전환이 엉뚱한 샷 사이로 붙는다 (`server/src/storyboard.ts:897-906`, `:1220`).
- H2 레퍼런스 패널 구성이 문서마다 다르다. 계약은 face·front·back(한 명 3장, 두 명 각 face 다음 각 front). 템플릿 라벨·순서·주석(`body`=앞면, `front`=이전 이름, `PANEL_ORDER`), `produce/SKILL.md:408-412`, `video-model-selection.md:499-505`, `assets-catalog-template.md:27`, `production-workflow.md:101`, `scenes-schema.md:2187-2188`.
- H3 스토리 우선(story-v2) 보드에 설명형 규칙이 bad로 뜬다: `COMPREHENSION` 없음, 챕터 수, 커버·훅·비트 순서, 템플릿 자체 `{{…}}` 자리표시자.
- H4 템플릿 검사(`production-mode.js` check)는 `videoBudgetUsd`·`maxAttempts` 1–5만 인정하고, 서버(`video-routing.ts:201`)는 `videoAuthorization`(최대 20회)을 먼저 받는다. 에피소드 설정 스냅숏 없이 보드만 보고 "Legacy board has no explicit video selection"을 낸다.
- H5 자막: 템플릿 쇼츠 미러 `burn:true`(실제 `formats.js` false), `format-lint.js`가 템플릿 `burn`을 비교하지 않음, 화면에 그려지지 않는 프레임용 자막·글자 영역 토글(자막 기본 켜짐).
- H6 `shot_image`가 키·외모·이름을 `SB_DOC.characters[].character`/`name`에서 읽는데 도구는 `{id, panels}`만 쓴다. 신원이 시작 이미지·영상 프롬프트에 닿지 않는다.
- H7 `produce/SKILL.md`가 `storyboard.md`의 `status: approved`를 지출 경계로 삼고, 스토리보드가 이미지를 만들지 않았다는 전제(§1.5)로 쓴다. 현재 계약은 샷별 `video_approve`와 `shot_image`.

### 중

- M1 클립 프롬프트 경고가 `shot_prompt` 대신 `assemble-bg-prompt.js --engine seedance`를 안내하고, `engineOf`가 이름 없는 샷을 seedance로 본다.
- M2 `location-assets.md:16-18`, `produce/SKILL.md:310`이 이미지 전에 블렌더 렌더를 지시한다(블렌더 구도는 요청 시에만).
- M3 `SB_DOC.transitions`는 쓰는 도구가 없는 죽은 필드다(템플릿 주석·검사, `storyboard-template.md:88`, `cinematic-edit.md:19`).
- M4 SB_DOC 주석: 출연진 출처(`cast.json`), `visual.location`(실제는 `shot.location`), `narratorCharacterId` "required".
- M5 템플릿 머리 주석의 레이아웃 설명과 `storyboard-template.md:96-105`가 현재 렌더러와 다르다. 쓰지 않는 `segRows`.
- M6 깨진 섹션 참조: 템플릿 "SKILL §4"(챕터), "SKILL §6"(craft.loops), "scenes-schema §per-type contract", `scenario-craft.md:137`, README §4.4/§4.5, README:621 "유일한 차단".
- M7 `production-mode.js:579-581`이 ASTRA에 이미지 경로가 없다고 하고 `imageProvider`를 host|api로 제한한다. CLAUDE.md의 `(host | astra | api)`가 두 필드 모두에 걸리는 것처럼 읽힌다.

### 하

- L1 `shot_icons` 설명이 `story_order` 밖의 거부를 적지 않는다.
- L2 `storyboard_apply` 설명의 scene 모양에 `summary`가 없고, 출연진·두 인물 제한 검사가 `shot_characters`/`storyboard_check` 몫이라는 말이 없다.
- L3 `story_scene` 요약 "한두 문장" ↔ CLAUDE.md 한 문장.
- L4 `storyboard_check` 설명이 생성 전 필수 단계처럼 읽힌다.
- L5 `visual.locationFrame`, `visual.video.speakerBindings`가 보드에 보이지 않는다.
- L6 `asset-sheets.md:6,24`, `storyboard/SKILL.md:116`의 "완료를 막는다" ↔ `production-workflow.md` 단계 순서 자유.
- L7 `render.purpose`: 도구 스키마는 목록 제한, 서버 검사는 아무 문자열이나 받는다.

## 고정 기준표

| 기준 | 배점 | 채점 규칙 | 증거 | P0 |
|---|---|---|---|---|
| 감사 21건 해소 | 45 | 45 × 해소 건수/21, 내림. 상 항목 하나라도 미해소면 P0 | 항목마다 file:line | 예 |
| 자동 검사 | 20 | TEST_CMD 세 개 모두 exit 0이면 20, 아니면 0 | 명령과 exit code | 예 |
| 오크 보드 실렌더 | 15 | 오크 보드 사본을 headless Chrome으로 렌더링했을 때 템플릿·계약 모순에서 나온 bad 0건이면 15. 종류당 −5(최저 0). 보드 자체 미완성 데이터(아직 쓰지 않은 프롬프트 등)는 제외 | 렌더 결과의 bad 목록 | 예 |
| 회귀 테스트 | 10 | H1·H6 각 5점. 해당 모듈 테스트 파일에 있고, 수정 전 코드에서는 실패해야 함 | 테스트 file:line과 근거 | 아니오 |
| 새 모순 없음·문체 | 5 | 수정이 새 모순을 만들지 않았고 CLAUDE.md D8 스캔이 이번 변경에서 깨끗하면 5 | 스캔 결과 | 아니오 |
| 범위 밖 수정 없음 | 5 | 바뀐 파일이 모두 감사 항목·테스트·빌드 산출물(`server/dist`)·이 루프 문서 안이면 5 | `git diff --name-only` | 아니오 |

## Result

달성 — 1회차에서 합격선(95점 · P0 0건 · 자동 검사 통과)을 넘었다.

| 회차 | 점수 | P0 | 자동 검사 | 판정 |
|---|---|---|---|---|
| 1 | 97 | 0 | npm test 1605/0 · format-lint 137 · --check PASS | PASS |

루프 뒤에 반영: `scenario-craft.md:347`의 `craft.holds`·`craft.burst` 근거를 `legacy-authoring §6`으로 바꿨다(verify-1 P2 3).

남겨 둔 것:

- `storyboard_apply` `set`으로 순서를 바꾸면 같은 값으로 다시 적은 전환도 지워지고 warn이 하나 붙는다. `story_shot`이 같은 경로를 쓰므로 그대로 둔다.
- 기존 story-first 보드의 `title`(오크 28건)은 보드 데이터라 `storyboard_apply`로 한 번 지워야 한다. 라이브 보드는 이 루프에서 건드리지 않았다.
