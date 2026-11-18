# 에피소드 커버(썸네일) 설계

작성 2026-11-18. 근거 조사: [SNS 플랫폼별 썸네일 베스트 프랙티스](../../research/2026-11-18-thumbnail-best-practices/reports/SNS%20플랫폼별%20썸네일%20베스트%20프랙티스.md) (이하 "조사 보고서").

## 1. 왜 만드는가

에피소드마다 플랫폼에 맞는 커버·썸네일을 만드는 단계가 플러그인에 없다.

- 스토리 우선(드라마) 경로는 화면 위 글자를 모두 지우고(`skills/produce/references/full-video.md:487`), `build-reel.sh:1710` 이 완성 영상의 `COVER_TS`(기본 3.2초) 프레임을 잘라 `cover.jpg` 로 쓴다. 디자인한 커버가 아니라 그 시각에 걸린 장면이다.
- 롱폼 형식은 산출물에 `thumbnail.jpg` 를 적어 두었지만(`skills/platform-guide/references/formats.js:303`) 그 파일을 만드는 코드가 없다.
- `facebook_publish` 에는 썸네일 입력이 없다.

조사 보고서의 결론: 썸네일이 클릭을 직접 좌우하는 곳은 YouTube 롱폼이고, 세로 숏폼 커버는 프로필 그리드·검색·채널 페이지에서 일한다. 가장 단단한 규칙은 "본편이 실제로 보여 주는 장면만 약속한다"이고, 디자인 요소(얼굴·채도)의 측정 효과는 작다. 그래서 이 기능은 새 그림을 지어내는 도구가 아니라 **본편의 샷을 골라 코드로 쓴 짧은 문구를 얹고, 플랫폼마다 잘리는 범위를 견디게 만드는 편집 도구**다.

## 2. 목표 · 비목표 · 반목표

**목표**
- 에피소드마다 커버 결정(어느 장면, 어떤 문구, 왜)을 기록하고, 그 결정에서 플랫폼별 파일을 결정적으로(같은 입력 → 같은 출력) 렌더한다.
- 기본 경로는 $0: 이미 만든 샷 시작 이미지를 쓴다.
- 크롭 미리보기와 측정값(띠 이탈, 대비, 축소 판독)을 보여 주고 경고로 보고한다.
- YouTube·Instagram·Facebook·TikTok 게시 단계가 렌더된 파일을 쓴다.

**비목표**
- 설명형 옛 경로의 첫 화면 커버 카드(produce 규칙 10)를 바꾸지 않는다. 이 카드와 2026-09-05 "영상 위 글자 금지"의 관계는 소유자 결정 사항으로 남겨 둔다.
- YouTube Test & Compare 자동화(공개 API 없음), TikTok 커버 이미지 API 업로드(필드 없음), Threads 커버(파라미터 없음).
- 썸네일 점수, CTR 예측, 품질 게이트.

**반목표 (기술적으로 돌아가도 실패로 본다)**
- 본편에 없는 장면·사건·숫자를 약속하는 커버.
- 경고 때문에 빌드나 게시가 멈추는 것.
- 승인 없는 유료 생성.
- 이미지 모델이 한글을 그리는 것.

## 3. 제약

- 저장소 지침: 검사는 보고하고 막지 않는다(2026-10-31, 2026-10-16). 하드 오류는 플랫폼 API 가 받지 못하는 파일(형식·용량)과 읽을 수 없는 입력뿐이다.
- 글자가 든 생성 이미지는 GPT Image 2(2026-10-18). 이 설계는 글자를 코드로 렌더하므로 해당하지 않는다. 배경 생성은 저장된 이미지 모델과 `image_plan` → `image_execute` 를 탄다.
- 영상 위에 아무것도 그리지 않는다(2026-09-05). 커버는 영상에 들어가지 않는 별도 정지 이미지다.
- 문구는 에피소드의 `STORY.language` 로 쓴다(2026-11-18). 스토리 언어 지침의 우선순위를 따른다.
- 서버 변경은 `npm run build` 와 dist 커밋, README 도구 표 갱신, 테스트는 모듈당 한 파일(2026-10-18).
- 조사 보고서가 확인하지 못한 플랫폼 사실(Shorts 가로 표면 크롭, TikTok Studio 저장 비율, Instagram 탐색 탭 비율)은 설정값이고, 각각이 틀려도 설계가 무너지지 않아야 한다.
- 게시는 지금처럼 경로를 명시적으로 넘긴다. 공개 게시 도구가 파일을 암묵적으로 고르지 않는다.

## 4. 접근 비교

| | A. 스킬 + 렌더 스크립트 | **B. 스킬 + `episode_cover` 도구 (선택)** | C. 커버를 보드의 가짜 샷으로 |
|---|---|---|---|
| 기록 | `cover.json` 파일만 | 도구가 결정과 렌더 영수증을 쓰고 낡음을 판정 | 보드 샷 |
| 무인 실행 | 스킬이 호출될 때만 | 도구라서 autoproduce·Codex 에서 확실히 돈다 | 샷 순서에 묶임 |
| 비용 | 가장 작다 | 서버 모듈 하나, 테스트, dist | `shot_image` 순서 제약과 충돌 |

사용자가 B 를 골랐다(2026-11-18). 이유: 스토리 우선 보드가 결정마다 도구로 기록하는 방식과 맞고, 무인 실행에서 스킬보다 도구가 확실하며, 원본 해시로 낡은 커버를 **찾아낸다**(막지는 않는다. 다시 렌더하는 일은 스킬이 하고, 게시 도구는 해시를 보지 않는다 — 5.3 `read`). C 는 영상에 들어가지 않는 그림을 샷 순서 규칙(`shot_image` 가 모든 샷의 아이콘을 기다림)에 묶으므로 버렸다.

## 5. 설계

### 5.1 구성 요소

| 구성 | 위치 | 하는 일 |
|---|---|---|
| `episode_cover` MCP 도구 | `server/src/cover.ts`, `tools.ts` 등록 | `set` · `render` · `read` |
| 커버 템플릿 | `skills/generate-cover/references/cover-template.html` | 배경 + 문구를 한 장에 배치, 번들 폰트 |
| 플랫폼 커버 데이터 | `skills/platform-guide/references/formats.js` 의 형식별 `cover` 블록 | 캔버스, 크롭 띠, 미확인 설정값 |
| `generate-cover` 스킬 | `skills/generate-cover/SKILL.md` | 장면 고르기, 문구 쓰기, 미리보기 검토, 게시 연결 |
| `facebook_publish` 확장 | `server/src/sns-client.ts`, `tools.ts` | `thumbnailFilePath` |
| 게시·제작 문서 연결 | `skills/publish/SKILL.md`, `tiktok-private-cover.md`, `skills/produce/SKILL.md` | 렌더 파일 사용 |

### 5.2 결정 파일: `storyboard/cover.json`

`episode_cover set` 만 쓴다. 손으로 고친 파일도 읽지만, 형식이 틀리면 `read` 가 그 이유를 보고한다.

```json
{
  "version": 1,
  "language": "ko",
  "reason": "주인공이 계약서를 찢기 직전 — 3장에서 실제로 일어나는 결정",
  "source": { "kind": "shot", "shotId": "s0012", "path": "storyboard/images/s0012.png", "sha256": "…" },
  "focus": { "x": 0.52, "y": 0.41 },
  "copy": { "text": "찢을까 말까", "emphasis": "찢을까" },
  "variants": []
}
```

- `source.kind` 는 세 가지다. 그 밖의 경로는 받지 않는다. 출처 없는 그림을 막는 장치다.
  - `frame`: 이 에피소드의 채택된 클립 또는 완성 영상의 한 프레임. `{ kind:"frame", video, seconds, shotId?, sha256 }` 이고 해시는 영상 파일의 것이다. $0 이고 본편에 있다는 것이 가장 확실하므로 **영상이 있으면 기본값**이다. HTML 슬라이드·reuse·stock 샷과 옛 보드도 이 경로로 커버를 만든다.
  - `shot`: 보드 샷의 시작 이미지(`visual.frames.start`). 영상이 아직 없을 때의 기본값. MSR(`frames.mode:"reference"`) 샷의 시작 이미지는 배경 슬롯 참조라 완성 클립과 구도가 다를 수 있으므로 `set` 이 `cover_source_reference_frame` 경고를 내고, 클립이 생기면 `frame` 으로 바꾸라고 알린다.
  - `image`: 이 에피소드의 `image_execute` 완료 영수증이 있는 파일(유료 배경, 5.5 의 4단계).
  [내 결정: 리뷰에서 시작 이미지가 없는 샷과 MSR 불일치가 지적되어 `frame` 을 추가했다.]
- `focus` 는 크롭 기준점(0–1). 없으면 이미지 가운데.
- `copy` 는 `null` 일 수 있다(무글자 커버). `emphasis` 는 `text` 의 부분 문자열 하나.
- `variants` 는 롱폼 Test & Compare 용 최대 2개 추가 변형(본 커버 포함 3개). 각 변형은 `source`·`focus`·`copy` 를 덮어쓴다. 기본은 비어 있다.

### 5.3 `episode_cover` 도구

**`set`** — 결정을 검증하고 쓴다. 생성·지출 없음.
- 거부: 보드에 없는 `shotId`, 시작 이미지가 없는 샷(`kind:"shot"`), 에피소드 밖이거나 길이를 넘는 `frame`, 완료 영수증이 없는 `image`, 읽을 수 없는 이미지, `emphasis` 가 `text` 에 없음, 변형 3개 초과.
- 경고(쓰기는 진행): 문구 길이가 형식 기준을 넘음, 제목과 문구가 같거나 제목에 통째로 포함됨, `language` 가 에피소드 언어와 다름, 원본이 캔버스 최소 크기보다 작음, MSR 참조 시작 이미지.
- 문구 길이 단위 [내 결정]: 띄어쓰기가 있는 언어는 어절(단어) 수(롱폼 4, 숏폼 3), 일본어·중국어는 글자 수(롱폼 12, 숏폼 8).
- 에피소드 언어 [내 결정]: `STORY.language`, 없으면 저장된 `languages.speech`, 없으면 `ko`. 서버에 이미 이 우선순위를 푸는 함수가 있으면 그것을 쓴다.
- 제목 비교 [내 결정]: `output/youtube/meta.md` 가 있을 때만 하고, `set`·`render`·`read` 모두에서 다시 한다. 파일이 없으면 조용히 건너뛴다.
- 반환: 저장한 결정, 경고, 결정 해시.

**`render`** — 로컬 결정적 렌더. $0, 네트워크 없음.
- 형식의 `cover.canvases` 마다 원본을 `focus` 기준으로 잘라 맞추고, 템플릿에 문구를 얹어 헤드리스 Chrome 으로 캡처한다(`--use-mock-keychain` 포함).
- 출력(`output/cover/`):
  - 세로 형식: `cover-9x16.jpg`(2160×3840, 원본이 작으면 원본 해상도 기준이되 1080×1920 미만이면 경고), 설정이 3:4 저장이면 `cover-3x4.jpg`(1080×1440).
  - 롱폼: `thumbnail-16x9.jpg`(3840×2160, 최소 1920×1080), 변형은 `thumbnail-16x9-b.jpg` 처럼.
  - `previews/`: 롱폼 160×90 축소본, 세로 커버의 3:4·1:1·가운데 16:9 크롭본과 한 장짜리 대조표.
  - `render.json`: 결정 해시, 원본 해시, 템플릿·폰트 버전, 각 파일의 크기·해시, 측정값, 경고.
- 측정과 경고:
  - 글자 상자와 얼굴 기준점(`focus`)이 핵심 띠 밖으로 나감. 띠는 형식 데이터에서 읽는다(5.4).
  - 글자와 바로 뒤 배경(외곽선 포함 경계 바깥 표본)의 명도 대비 3:1 미만.
  - 160×90 축소본에서 글자 높이가 기준(구현이 정하는 px 값, `render.json` 에 기록) 미만.
  - 롱폼에서 오른쪽 아래 폭 20%×높이 15% 또는 하단 5% 띠에 글자가 걸림.
- 하드 오류: 원본을 읽을 수 없음, Chrome 을 찾을 수 없음, 문구의 글자를 그릴 번들 폰트가 없음(`cover_font_missing`), 플랫폼 상한을 넘는 출력(Instagram JPEG 8MB, Facebook 10MB, YouTube 50MB). 상한은 JPEG 품질을 낮춰 맞추고, 그래도 넘을 때만 오류.
- 폰트 [내 결정]: 문구 언어와 글자에 맞춰 번들 폰트를 고른다. 한글은 `skills/storyboard/references/motion-fonts/` 의 굵은 서체, 중국어는 `skills/channel/references/review-assets/fonts/` 의 Noto SC·TC. 고른 폰트의 cmap 이 문구의 모든 글자를 덮는지 확인하고(README 의 폰트 커버리지 확인과 같은 데이터), 덮지 못하면 □ 가 찍힌 커버를 내지 않고 `cover_font_missing` 으로 거부한다. 작성자는 무글자 커버로 다시 `set` 하거나 폰트를 추가한다.
- 대표 파일 복사 [내 결정]: **스토리 우선 보드(`STORY.authoring:"story-first"`)에서만** 세로 형식은 `cover-9x16.jpg` 를, 롱폼은 `thumbnail-16x9.jpg` 를 `output/video/cover.jpg` 로, 롱폼은 `output/video/thumbnail.jpg` 로도 복사한다. 새 에피소드는 모두 스토리 우선으로 시작하고, 옛 보드는 첫 화면 커버 카드에서 뜬 `cover.jpg` 를 그대로 둔다(비목표). 옛 보드에서도 `output/cover/` 파일은 만들어지므로 작성자가 명시적으로 쓸 수 있다. 이 파일을 읽는 기존 코드(`episode-state.js:254`, publish 스킬)는 그대로 둔다.

**`read`** — 결정, 렌더 상태, 플랫폼별 파일 대응표를 돌려준다.
- 상태: `missing`(결정 없음) · `unrendered` · `fresh` · `stale`(결정·원본 이미지나 영상·템플릿 중 하나가 렌더 뒤 바뀜). `stale` 은 바뀐 항목을 이름으로 적는다.
- `stale` 일 때도 대응표에 파일을 그대로 싣고 `stale: true` 를 붙인다 [내 결정]. 렌더는 $0 이고 결정적이므로 스킬이 게시 전에 `stale` 을 보면 `render` 를 다시 한다. 게시 도구는 `render.json` 해시를 확인하지 않는다(반목표: 경고로 게시를 멈추지 않는다).
- `publish` 대응표: `youtube`(형식에 맞는 파일), `instagram`(`cover-9x16.jpg`, 호스팅 필요 표시), `facebook`(형식에 맞는 파일), `tiktok`(Studio 업로드용 파일, 설정에 따라 9:16 또는 3:4), `threads`(없음).
- 미확인 설정값과 현재 값을 함께 적는다(사람이 실제 계정 확인 후 바꿀 수 있게).

### 5.4 플랫폼 커버 데이터 (`formats.js`)

형식별로 `cover` 블록을 둔다. 서버는 `production-workflow.ts` 가 `structure-contract.js` 를 부르듯 이 파일을 불러 쓴다.

```js
cover: {
  canvases: [{ id: '9x16', w: 2160, h: 3840, min: [1080, 1920] }],
  bands: {            // 1080×1920 기준 비율, 조사 보고서의 계산값
    core: { y0: 0.342, y1: 0.658 },   // 가운데 16:9 조각
    support: { y0: 0.219, y1: 0.781 }, // 1:1 크롭
    outer: { y0: 0.125, y1: 0.875 },   // 3:4 그리드
    x: { x0: 0.06, x1: 0.94 },
  },
  copyMaxWords: 3,
  unverified: {
    shortsLandscapeCrop: '3:2',   // '9:16' 로 확인되면 core 를 support 로 넓힌다
    tiktokSavedRatio: '9:16',     // '3:4' 로 확인되면 cover-3x4.jpg 를 렌더
  },
}
```

롱폼은 `canvases: [{ id: '16x9', w: 3840, h: 2160, min: [1920, 1080] }]`, `badge: { x0: 0.8, y0: 0.85 }`, `bottom: 0.95`, `copyMaxWords: 4`. 수치는 조사 보고서의 기본값이고, `safezone-landscape.md` 실측과 겹치는 값은 실측을 따른다.

### 5.5 `generate-cover` 스킬

트리거: "썸네일 만들어", "커버 만들어", "thumbnail", "cover image", 그리고 produce·autoproduce·publish 의 해당 단계.

순서:
1. **장면 고르기** — 보드를 읽고 샷 하나를 고른다. 드라마는 결정이나 위협의 순간에 놓인 인물 한두 명(놀란 얼굴을 기본으로 고르지 않는다. 그 샷의 `shot_characters.expression` 이 장면의 감정이다), 설명·주장형은 증거 샷(`sequence.payoff`), 튜토리얼·리뷰는 결과물·제품. 본편에 실제로 있는 순간만 쓰고 `reason` 에 그 순간이 몇 장에 있는지 적는다. 원본은 영상이 있으면 그 샷 클립의 프레임(`frame`), 없으면 시작 이미지(`shot`). 증거 샷이 HTML 슬라이드면 슬라이드 글자 위에 문구가 겹치므로 무글자 커버로 두거나 슬라이드 글자가 아직 나오기 전 프레임을 고른다.
2. **문구** — `STORY.language` 로, 롱폼 2~4어절, 숏폼 1~3어절. 제목을 반복하지 않고 보탠다. 강조어 하나. 드라마·오락은 무글자도 허용하되 기본값으로 두지 않는다.
3. **`set` → `render`** — 미리보기 대조표를 사용자에게 보여 주고 경고를 그대로 전한다. 경고는 고칠지 말지 작성자가 정한다.
4. **비율이 맞지 않을 때만 유료 배경** — 예: 세로 샷만 있는데 16:9 썸네일이 필요함. `image_plan`(편집·확장, 글자 없음 프롬프트, `assetId: "cover-bg"`) → 사용자 지출 승인 → `image_execute` → `set source.kind:"image"`.
5. **게시 연결** — `read` 의 대응표를 publish 스킬에 넘긴다.

무인 실행(autoproduce)은 1~3을 그대로 하고 4는 기존 지출 승인 범위 안에서만 한다. 승인 범위 밖이면 샷 이미지를 그대로 쓰고 비율 경고를 `render.json` 에 적는다.

제작 순서상 위치: 샷 시작 이미지(4단계) 뒤 아무 때나, 게시 전. 영상 생성을 기다리지 않는다.

### 5.6 게시 연결

- **YouTube** — `thumbnailFilePath` ← 롱폼 `thumbnail-16x9.jpg`, 세로 `cover-9x16.jpg`. 롱폼 변형이 있으면 Studio Test & Compare 에 수작업으로 올리는 절차를 스킬에 적는다.
- **YouTube Shorts 의 세로 타일** [내 결정, 구현 중 수정] — 글자를 얹은 렌더 커버는 영상 안에 없으므로 Studio "Select from video" 로 고를 수 없다. 처음에는 Studio 업로드로 바꾸려 했지만, publish 스킬의 2026-08-19 실측에서 Studio `Change`(파일 업로드)는 가로 표면만 바꿨다. 그래서 `thumbnailFilePath` 로 API 가 렌더 커버를 넣게 하고(2026-11-03 Shorts 지원), 비공개 상태에서 Studio 썸네일 상자의 세로 이미지를 본다. 렌더 커버가 보이면 그대로 두고, 영상 프레임이 보이면 커버의 장면(`frame` 원본이면 그 `seconds`)을 "Select from video"로 고른 뒤 "세로 타일은 문구 없는 같은 장면"이라고 보고한다. 공개 Shorts 탭 확인 절차는 그대로 둔다.
- **Instagram** — `coverUrl` ← `cover-9x16.jpg` 를 영상과 같은 호스팅으로 올린 URL. 렌더 커버가 없을 때만 `thumbOffsetMs`(커버 원본이 `frame` 이면 그 시각, 아니면 지금처럼 `COVER_TS`).
- **Facebook** — `facebook_publish` 에 `thumbnailFilePath`(로컬 JPG/PNG, ≤10MB)를 더한다. 영상 게시가 성공한 뒤 `POST /{video-id}/thumbnails` 에 `source` 를 멀티파트로, `is_preferred=true` 로 보낸다. 실패하면 게시는 성공으로 두고 `thumbnailWarning` 을 돌려준다(YouTube 와 같은 계약). Reels(`reel: true`) 경로에도 시도하되 적용 여부는 미확인이라고 설명에 적는다.
- **TikTok** — `tiktok-private-cover.md` 의 비공개 단계에서 Studio 에 올릴 파일로 `read.publish.tiktok` 을 쓴다. 렌더 커버가 없으면 지금처럼 `coverTimestampMs`.
- **Threads** — 변경 없음.

### 5.7 테스트 (모듈당 한 파일)

- `server/test/cover.test.mjs`: `set` 이 보드에 없는 샷과 영수증 없는 이미지를 거부, `read` 가 원본 해시 변경을 `stale` 로 판정, `render` 가 플랫폼 상한을 넘는 출력을 줄이거나 거부, 폰트가 덮지 못하는 문구를 `cover_font_missing` 으로 거부, 옛 보드에서 `output/video/cover.jpg` 를 덮어쓰지 않음. 렌더 케이스 하나는 작은 합성 원본으로 Chrome 경로를 한 번 타고, `frame` 원본 케이스 하나는 몇 프레임짜리 합성 영상으로 ffmpeg 경로를 한 번 탄다.
- `sns-client` 테스트 파일: Facebook 썸네일 실패가 게시를 실패로 만들지 않는 케이스 하나.
- 문구·경고 문장은 단정하지 않는다. 경고 코드와 필드만 확인한다.

## 6. 빌더에게 맡기는 것

- Chrome 실행 방식: 서버에서 직접 띄울지, `skills/produce/references/capture-frames.sh` 를 부를지. 어느 쪽이든 `--use-mock-keychain` 을 붙인다.
- 문구 자동 배치(피사체 반대편, 핵심 띠 안)의 구체 알고리즘과 줄바꿈, 160×90 글자 높이 기준 px.
- 대비 측정의 표본 방식.
- 템플릿의 폰트 선택(번들 폰트 중 굵기 800 이상 한글 지원 서체), 외곽선 두께 비율.
- `build-reel.sh` 의 프레임 추출은 렌더 커버가 없을 때의 대체 경로로 계속 쓴다. produce 의 마지막 복사 단계(`cp .work/cover.jpg output/video/cover.jpg`)가 렌더 커버를 덮어쓰지 않게 하는 방법.

## 7. 실제 계정에서 확인한 뒤 바꿀 설정값

조사 보고서 "실제 계정에서 확인해야 할 것"의 1, 2, 5, 6, 9 가 이 설계의 설정값(`unverified`)과 직접 연결된다. 확인 전에는 위 기본값을 쓰고, `read` 가 미확인임을 매번 보여 준다.
