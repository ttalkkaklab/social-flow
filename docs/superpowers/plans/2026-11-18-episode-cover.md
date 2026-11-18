# Episode cover (episode_cover) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 에피소드마다 커버 결정을 기록하고, 그 결정에서 플랫폼별 커버·썸네일 파일을 $0 로 결정적으로 렌더하는 `episode_cover` 도구와 `generate-cover` 스킬을 만들고, Facebook 게시에 썸네일 입력을 더한다.

**Architecture:** `server/src/cover.ts` 가 `set`·`render`·`read` 를 구현한다. 이미지 자르기·축소·JPEG 인코딩·영상 프레임 추출은 ffmpeg, 글자 배치는 `skills/generate-cover/references/cover-template.html` 을 헤드리스 Chrome 으로 두 번(측정용 `--dump-dom`, 캡처용 `--screenshot`) 연다. 플랫폼 수치는 `formats.js` 의 `cover` 블록에서 읽는다.

**Tech Stack:** TypeScript(Node 20, zod), ffmpeg/ffprobe, Google Chrome headless, node:test.

**Spec:** `docs/superpowers/specs/2026-11-18-episode-cover-design.md`

## Global Constraints

- 경고는 보고만 한다. 하드 오류는 읽을 수 없는 입력, 에피소드 밖 경로, 보드에 없는 샷, 영수증 없는 이미지, 폰트 미지원(`cover_font_missing`), Chrome 없음, 플랫폼 상한 초과(IG 8MB, FB 10MB, YT 50MB)뿐이다.
- Chrome 실행에는 늘 `--use-mock-keychain` 을 붙인다.
- 문구 길이: 띄어쓰기 언어는 어절(롱폼 4, 숏폼 3), `ja`·`zh` 는 글자 수(롱폼 12, 숏폼 8).
- 대표 파일 복사(`output/video/cover.jpg`, 롱폼 `thumbnail.jpg`)는 `STORY.authoring:"story-first"` 보드에서만.
- 테스트는 `server/test/cover.test.mjs` 하나와 `sns-client.test.mjs` 의 케이스 하나. 경고 코드·필드만 확인한다.
- 문서·주석은 D8 금지 어미 없이. README 도구 수 156 → 157.

## Review Focus

- 원본 이미지가 캔버스보다 작다(예: 1080×1920 샷으로 2160×3840 커버) → 업스케일하지 않고 원본 해상도로 내되 최소 크기 미만이면 경고 `cover_source_small`.
- `frame` 원본의 `seconds` 가 영상 길이 이상 → `set` 이 거부.
- `video`·`path` 가 `..` 이나 절대 경로로 에피소드 밖을 가리킴 → 거부.
- 무글자(`copy: null`) 커버 → 글자 측정·대비 검사를 건너뛰고 렌더는 정상.
- 같은 결정으로 두 번 렌더 → 같은 바이트(결정적), `read` 는 `fresh`.

---

### Task 1: 플랫폼 커버 데이터

**Files:** Modify `skills/platform-guide/references/formats.js` (두 형식에 `cover` 블록)

- `shorts-9x16.cover = { canvases:[{id:'9x16',w:2160,h:3840,min:[1080,1920]}], bands:{core:{y0:.342,y1:.658},support:{y0:.219,y1:.781},outer:{y0:.125,y1:.875},x:{x0:.06,x1:.94}}, copyMax:{words:3,chars:8}, unverified:{shortsLandscapeCrop:'3:2',tiktokSavedRatio:'9:16'} }`
- `youtube-long-16x9.cover = { canvases:[{id:'16x9',w:3840,h:2160,min:[1920,1080]}], badge:{x0:.8,y0:.85}, bottom:.95, x:{x0:.04,x1:.96}, copyMax:{words:4,chars:12}, unverified:{} }`
- [ ] `node skills/platform-guide/references/format-lint.js` 통과.

### Task 2: `cover.ts` — set / read

**Files:** Create `server/src/cover.ts`; Test `server/test/cover.test.mjs`

**Interfaces — Produces:**
- `coverSchema` (zod): `{ path: string, action: 'set'|'render'|'read', decision?: CoverDecisionInput }`
- `setCover(path, decision) → { file, decision, warnings: Warning[] }`
- `readCover(path) → { status:'missing'|'unrendered'|'fresh'|'stale', changed: string[], decision, files, publish, warnings, unverified, plan }`
- `Warning = { code: string, message: string }`

- [ ] 테스트: 보드에 없는 샷 거부(`cover_shot_unknown`), 시작 이미지 없는 샷 거부, 영수증 없는 `image` 거부, 에피소드 밖 `video` 거부, 문구 어절 초과는 `cover_copy_long` 경고, MSR 샷은 `cover_source_reference_frame` 경고, 원본 해시가 바뀌면 `read` 가 `stale` 와 `changed:['source']`.
- [ ] 구현 후 `cd server && npm run build && node --import ./test/isolate.mjs --test test/cover.test.mjs` 통과.

### Task 3: `cover.ts` — render, 템플릿

**Files:** Create `skills/generate-cover/references/cover-template.html`, `skills/generate-cover/references/cover-font-data.js`(Noto JP/SC/TC 커버리지, 생성기는 `tools/build-motion-fonts.py` 확장); Modify `server/src/cover.ts`

- 렌더 순서: 원본 확보(샷 이미지 / 이미지 영수증 / ffmpeg 프레임) → ffmpeg 로 `focus` 기준 크롭·스케일한 배경 PNG → 템플릿에 배경·폰트·문구·배치 영역 주입 → Chrome `--dump-dom` 으로 글자 상자 측정 → `--screenshot` → ffmpeg JPEG(품질을 낮춰 상한 맞춤) → 미리보기·대조표 → 측정·경고 → `render.json`.
- 폰트 선택: 한글 포함이면 `paperlogy`, 아니면 `pretendard`(wght 800), `ja` 는 Noto JP, `zh` 는 Noto SC(번체 글자가 SC 에 없으면 TC). cmap 이 덮지 못하면 `cover_font_missing`.
- [ ] 테스트: 합성 원본으로 9:16 렌더 → 파일 크기·치수, `render.json.files`, 두 번째 렌더 바이트 동일, `read` 가 `fresh`. Chrome 이 없으면 skip. 폰트 미지원 문구는 `cover_font_missing`. 옛 보드에서는 `output/video/cover.jpg` 를 만들지 않는다. `frame` 원본 케이스 하나(ffmpeg 합성 영상).

### Task 4: 도구 등록

**Files:** Modify `server/src/tools.ts`(도구 정의), `server/src/handlers.ts`(`episode_cover`), `README.md`(도구 표, 156→157)

- [ ] `npm run build`, `node skills/platform-guide/references/skill-lint.js --selftest` 통과.

### Task 5: Facebook 썸네일

**Files:** Modify `server/src/sns-client.ts`(`FacebookPublishInput.thumbnailFilePath`, 게시 후 `POST /{videoId}/thumbnails` 멀티파트 `source`, `is_preferred=true`), `server/src/tools.ts`(입력·출력 스키마 `thumbnailSet`·`thumbnailWarning`); Test `server/test/sns-client.test.mjs`

- [ ] 테스트: 썸네일 요청이 400 을 돌려줘도 `ok:true`, `thumbnailSet:false`, `thumbnailWarning` 존재. 게시 전 파일 검증(확장자, 10MB).

### Task 6: 스킬과 문서 연결

**Files:** Create `skills/generate-cover/SKILL.md`; Modify `skills/publish/SKILL.md`, `skills/publish/references/tiktok-private-cover.md`, `skills/produce/SKILL.md`(커버 단계 한 줄과 링크)

- [ ] skill-lint, D8 스캔 통과.

### Task 7: 전체 검증

- [ ] `cd server && HOME=$(mktemp -d) npm run check`, `npm run check:dist`, check.yml 의 selftest 전부.
