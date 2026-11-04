# Iteration 1 요약

## 자동 검사

- `cd server && npm run build` → 오류 없음
- `cd server && HOME=$(mktemp -d) npm test` → pass 1605 · fail 0
- `node skills/platform-guide/references/format-lint.js` → `137 mirrors match` (템플릿 `burn` 규칙 2건 추가. 쇼츠 `burn:true`로 되돌리면 `✗ storyboard.html shorts-9x16 burn`으로 실패하는 것을 확인했다)
- `node skills/storyboard/references/check-scenes.js --selftest` → OK
- `node skills/storyboard/references/storyboard-html.js <scratch>/orc/storyboard --check` → PASS

## 오크 보드 실렌더 (scratchpad 사본, 라이브 보드는 건드리지 않음)

| 회차 | bad | 내용 |
|---|---|---|
| 시작 전 | 63 (warn 253) | COMPREHENSION·챕터·자리표시자·지출 형식·Legacy selection 등 |
| 1회차 후 | 55 | 제목 28 + 영상 프롬프트 없음 27 |

남은 bad 55건의 분류:

- `nothing goes over full-video footage; clear title…` 28건 — 보드 데이터. 이전 `story_shot`이 "Short shot heading"으로 받던 `title`이 그대로 남아 있다. `title`은 화면에 그려지는 글자다(`video-template.html` `points-title`, `full-video.md:484`). 1회차에서 `story_shot` 입력에서 `title`을 뺐으니 새 보드에는 생기지 않는다. 사본에서 제목만 지운 `orc-notitle`의 bad는 아래 27건뿐이다.
- `store the motion prompt before generation (shot_prompt)` 27건 — 보드 미완성. 샷 1만 영상 프롬프트가 있고, 나머지는 `shot_prompt` 단계 전이다.

레거시 보드 비교(HEAD 템플릿 → 새 템플릿): gateglass bad 226 → 221, meleon 131 → 103. 새로 생긴 bad 종류는 없다(meleon의 `full_video needs a narrated…` 9건은 `visual.video`가 있으면서 slide/source/clip이 붙은 샷이다).

## 항목별 수정 위치

- H1 `server/src/storyboard.ts` `applyPatch` — 직전 샷이 바뀐 샷의 `transition`과 `edit.reason/continuity/transitionSeconds`를 지우고 warn을 낸다(같은 패치의 `transitions`는 유지). `story_shot`도 같은 경로(`writeOutline` → `applyStoryboard` → `applyPatch`)를 지난다. 테스트: `server/test/storyboard.test.mjs` "a shot that gets a new predecessor loses the join…"
- H2 템플릿 패널 라벨·`PANEL_ORDER`·SB_DOC 주석, `produce/SKILL.md`, `video-model-selection.md`, `assets-catalog-template.md`, `production-workflow.md` 예시, `scenes-schema.md`, `character-panels.md`(board uses `panels.body` → 같은 이름)
- H3 템플릿 COMPREHENSION·재생 순서 검사를 `STORY_V2`면 건너뛴다(`scenes-schema.md` §comprehension contract·§playback order "story-v1 only"). `check-scenes.js`도 같이 맞췄다. 챕터 3개 미만은 warn(빌더가 chapters.txt를 건너뛸 뿐). story-v2 보드는 HTML 블록의 `{{…}}` 예시 키를 버린다.
- H4 `production-mode.js` `check`가 `videoAuthorization`(서버 `video-routing.ts:201`과 같은 범위)을 받고, `snapshotVideo` 옵션으로 에피소드 `.work/model-settings.json`의 선택을 쓴다. `storyboard-html.js`가 `window.REVIEW_VIDEO_SNAPSHOT`으로 싣고, `check-scenes.js`도 같은 파일을 읽는다. `videoAuthorization`이 있으면 여섯 모드 견적 부재는 warn. full_video에서 영상이 아닌 샷은 advice(`production-mode.md` "never an error").
- H5 쇼츠 미러 `burn:false`, `format-lint.js` burn 규칙, 화면에 없는 프레임용 토글(글자 영역·자막)과 `body.subs`·문자열·CSS 제거, 머리 주석의 ASS 설명 정리, 훅 컷 메시지에서 "code-rendered title" 삭제
- H6 `applyStoryboard`의 패널 동기화가 `cast.json` → `identity.md`에서 `name`(제목줄)과 `character`를 함께 싣는다. 테스트: "board writes copy the cast identity…"
- H7 `produce/SKILL.md` 지출 경계 문단, §1.5 첫 문단
- M1 템플릿·`check-scenes.js` `engineOf`가 이름 없는 샷에 저장된 엔진을 쓴다(astra/astra-genai 포함). 프롬프트 없음 경고가 story-first 보드에서는 `shot_prompt`를 안내한다.
- M2 `location-assets.md` 공간 계획 문단, `produce/SKILL.md` Persistent locations
- M3 템플릿 `SB_DOC.transitions` 필드·검사 삭제, `storyboard-template.md`, `cinematic-edit.md`(story-first는 `shot_icons next`)
- M4 템플릿 SB_DOC 주석(출연진 출처, `shot.location`, `narratorCharacterId`)과 머리 주석
- M5 템플릿 머리 주석 재작성, `.conti` CSS 주석, `segRows` 삭제, `storyboard-template.md` 샷 카드 설명
- M6 템플릿 §4/§6/§per-type 참조, `scenario-craft.md:137`, README §4.4/§4.5와 "the one thing that blocks"
- M7 `production-mode.js` astra 주석, CLAUDE.md `imageProvider` 값
- L1 `shot_icons` 설명에 거부 목록
- L2 `storyboard_apply` scene 모양에 `summary`, 출연진 검사 위치
- L3 `story_scene` 요약 "one sentence"(스키마 2곳, tools.ts)
- L4 `storyboard_check` 설명
- L5 템플릿 샷 본문에 세트 렌더(`visual.locationFrame`)와 MSR 화자 위치(`visual.video.speakerBindings`)
- L6 `asset-sheets.md` 두 곳, `storyboard/SKILL.md:116`
- L7 `shot_icons` `render.purpose`를 `render-routing.js PURPOSES`로 검사

감사 범위에서 함께 고친 것: `story_shot`의 `title` 입력 삭제(제목은 화면 글자라 full_video와 충돌), `character_panel` 설명의 "SB_DOC.characters를 따로 갱신" 문장.

## 다음 회차로 넘길 것

없음(검증 결과를 기다림).
