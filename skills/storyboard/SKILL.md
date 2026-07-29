---
name: storyboard
description: >
  This skill should be used when the user asks to "스토리보드 만들어", "스토리보드 작성",
  "이 주제로 영상 기획", "촬영 대본 만들어", "내가 녹화할 대본", "make a storyboard",
  "plan a video for topic X", or starts a new post topic in a category. Researches the
  topic (naver_search/WebSearch/serp_*), then authors an image-included storyboard under
  data/<category>/<topic>/storyboard/ — human-readable storyboard.md + machine-readable
  scenes.js (the SoT that produce consumes) + generated 9:16 scene images, or in
  screencast mode a shooting script (script.md) the user records against — and gets
  HITL approval before production/recording.
argument-hint: "<카테고리> <주제 또는 주제 힌트>"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "WebSearch", "WebFetch", "mcp__social-flow__naver_search", "mcp__social-flow__serp_web_search", "mcp__social-flow__serp_news_search", "mcp__social-flow__serp_naver_search", "mcp__social-flow__datago_search", "mcp__social-flow__datago_detail", "mcp__social-flow__datago_file_download", "mcp__social-flow__datago_file_fetch", "mcp__social-flow__datago_api_call", "mcp__social-flow__gpt_image_text2img"]
---

# 스토리보드 저작 — data/[카테고리]/[주제]/storyboard/

주제 하나를 받아 **조사 → 씬 설계 → 이미지 생성 → 스토리보드 승인**까지 진행한다.
여기서 확정된 `scenes.js` 가 이후 제작(produce)의 유일한 데이터 원천(SoT)이다 —
영상·캡션·채널별 텍스트가 전부 이 파일에서 파생되므로 채널 간 사실 불일치가
원천 차단된다.

```
data/<카테고리>/<주제 slug>/storyboard/
├── research.md      # 근거·출처·교차검증 기록 (조사 생략 카테고리는 생략)
├── storyboard.md    # 사람이 읽는 스토리보드 — 씬 표 + 이미지 임베드
├── scenes.js        # 기계가 읽는 SoT — THEME + SCENES(+나레이션 세그먼트)
├── images/          # 씬별 9:16 생성 이미지 (scene-<n>.png) — 촬영 모드는 생략
└── script.md        # 촬영 모드 한정 — 사용자가 보며 녹화하는 촬영 대본
```

## 절차

### 1. 프로파일 로드

`data/<카테고리 slug>/profile.md` 를 Read 한다. 없으면 중단하고
`/social-flow:category add` 를 먼저 안내한다. 톤·보이스·테마·검증 정책·주제 slug
규칙을 이 파일에서 상속한다.

### 1.5 모드 결정 — 생성(기본) vs 촬영(screencast)

**사용자가 직접 화면을 시연·해설하며 녹화할 주제**("촬영 대본 만들어", "내가
녹화할게", 앱 시연·튜토리얼류)면 **촬영 모드**다. 확실치 않으면 AskUserQuestion
으로 확인한다. 촬영 모드의 차이 (`references/shot-script-template.md` 계약):

- 씬 `visual` 은 `{ source: "recording", shot: "보여줄 화면" }` — §5 이미지 생성을
  통째로 건너뛴다 (영상 화면은 사용자의 실제 녹화에서 나온다).
- narration 은 TTS 대본이 아니라 **말할 문장** — 자수 상한 완화 (문장당 40자 권장,
  씬 목표 8~20s 로 역산).
- §6 에서 storyboard.md 와 함께 **script.md(촬영 대본)** 를 저작한다.
- 승인 후 안내가 produce 가 아니라 **녹화**다 (§7 분기).

### 2. 자료조사·사실검증 (프로파일 §5 정책에 따름)

- **`recording/timeline.md` 가 있으면 (ingest 스킬 산출)** 이를 1차 소스로
  사용한다 — 씬 구성·핵심 메시지를 타임라인에서 가져오고, 웹 조사는 전사 속
  시효성 수치의 교차 검증에만 쓴다. 녹화 속 발언은 주장이지 근거가 아니다 —
  검증 실패 수치는 넣지 않는다. 이 경우 research.md 에는 timeline 씬별 요지와
  검증 결과 표를 기록한다.
- 검색 도구 선택: **한국어 소재는 `naver_search`(news/blog/cafe) 1차** → 범용·해외는
  내장 WebSearch → 정밀 검색(연산자·기간 필터)이 필요하면 `serp_web_search`/`serp_news_search`.
  상황에 맞는 조합을 쓰되 같은 검색을 도구만 바꿔 반복하지 않는다.
- **통계·제도·지역 현황처럼 정부 원천 데이터가 근거인 주제**는 `datago_search`
  (공공데이터포털)로 원천 데이터셋을 확보한다 — 공식 원천은 그 자체가 1차 출처라
  기사 재인용보다 우선하며, 원천 1개면 교차검증 요건을 충족한다. 수집 절차·출처
  표기·데이터 기준일 함정은 **datago 스킬** 참조.
- 시효성 값(가격·세율·기한·시행일)은 **독립 출처 2개 이상** 교차 검증. 검증 실패
  주장은 스토리보드에 넣지 않는다 — 수치를 새로 만들거나 반올림으로 의미를 바꾸지
  않는다("300만~500만"을 "500만"으로 줄이면 왜곡).
- `research.md` 에 기록: 핵심 주장별 출처 링크·확인 날짜·검증 상태 표.
  조사 생략 카테고리(창작·일상)는 이 단계 전체를 건너뛴다.

### 3. 주제 디렉토리 생성

프로파일 §7 slug 규칙으로 `data/<카테고리>/<주제 slug>/storyboard/images/` 를 만든다.
이미 존재하면 사용자에게 이어서 작업할지(기존 스토리보드 개정) 확인한다.

### 4. 씬 설계 — scenes.js 작성

`references/scenes-schema.md` 의 계약대로 작성한다. 핵심 규칙:

- **구성**: cover 1 + points/quote 4~5 + outro 참조 = 본편 총 60~75초 목표
  (유지율은 길이에 반비례 — 90초 상한).
- **커버 제목은 16자 이내 + 주제어 필수** — 자극만 있고 무엇의 이야기인지 없으면
  스킵된다. 강조어는 `**굵게**`(그라데이션 칩). statLabel 은 18자 이내.
- **나레이션 = 세그먼트(문장) 배열** — 문장 하나가 reveal 하나와 1:1. 자수 상한
  (공백·구두점 제외): cover ≤40자, points/quote ≤50자. 문장당 8~25자, 마침표로
  분명히 끊는다(TTS 무음 경계 검출용). 표기 이원화: `tts` 는 한글 발음
  표기("4,700만"→"사천칠백만"), `sub` 는 원표기 유지.
- **쉬운 말 원칙(프로파일 §2)** — 화면 텍스트·나레이션 모두. 덱 저작 단계에서
  용어를 풀어 써야 나레이션도 쉬워진다.
- THEME 은 프로파일 §3 값을 그대로 복사한다.

### 5. 씬 이미지 생성 (촬영 모드는 건너뛴다)

씬별 배경 이미지를 `gpt_image_text2img`(size "1088x1920" — 9:16 근사, 가로·세로
16의 배수 제약)로 생성해 `images/scene-<n>.png` 에 저장한다 (1080×1920 캔버스에
cover 크롭되므로 0.7% 비율 차는 무시된다):

- 프롬프트 = 씬 내용과 은유적으로 연결된 장면 + 프로파일 §3 무드 서술 +
  **필수 부정 지시**("no text, no logos, no signage, no readable characters,
  face not visible, no flags, no national emblems, no maps, no government buildings")
  + "lower third fading into darkness"(하단이 밝으면 자막이 안 읽힌다).
- cover 1장 + points 공통 1장이면 충분하다(리스트가 화면을 덮어 배경 차이가 잘 안
  보인다). quote 씬은 배경 불요(발화 클립 또는 인용 카드).
- 생성 문자가 박히면 재생성 — 가짜 문서·간판으로 오독되는 순간 사실 왜곡이 된다.

### 6. storyboard.md 작성

`references/storyboard-template.md` 구조로 사람이 검토할 문서를 만든다 —
씬별 표(타입·길이 목표·나레이션 문장·화면 텍스트·비주얼 계획)와 생성 이미지를
`![scene-1](images/scene-1.png)` 로 임베드한다. research.md 의 핵심 출처를
말미에 요약 링크한다.

**촬영 모드**는 이미지 임베드 대신 씬별 "화면(shot)" 열을 쓰고, 추가로
`script.md`(촬영 대본)를 `references/shot-script-template.md` 구조로 저작한다 —
촬영 수칙(보조 모니터에 대본·씬 사이 1초 멈춤+전환·앱 폰트 확대·재촬영은 같은
씬 처음부터)과 씬별 [화면/대사/전환] 블록. 대사는 scenes.js narration 에서
옮긴다(두 벌 관리 금지 — scenes.js 가 SoT).

### 7. HITL 승인 게이트

AskUserQuestion 으로 스토리보드를 제시한다 — storyboard.md 경로, 씬 수·예상
총길이, 커버 제목, 핵심 수치와 출처. 선택지: [승인 — 제작 진행 / 수정 요청 /
주제 보류]. **승인 없이 produce 로 넘어가지 않는다.** 수정이면 반영 후 재제시.
승인되면 scenes.js 상단에 `// approved: <YYYY-MM-DD>` 주석을 남기고
`/social-flow:produce <카테고리> <주제>` 를 안내한다.

**촬영 모드**의 승인 후 안내는 녹화다 — `/social-flow:ingest <카테고리> record
<주제>` (script.md 를 보조 모니터에 띄우고 촬영). 녹화·정합이 끝나면 produce 가
편집 파이프라인으로 영상을 만든다.

## 함정

- **scenes.js 는 살아있는 파일이 아니다** — 승인 후 produce 가 소비하는 확정본이다.
  제작 중 고치고 싶으면 스토리보드 개정 → 재승인부터.
- **범위는 범위로** — 수치 범위를 상한 하나로 줄이지 않는다(실제 발생 사례).
- **이미지에 국가 상징 금지** — 국기·국장·지도·정부청사·제복 인물은 사전 승인
  없이 생성하지 않는다.
- SerpApi 는 검색 1회 = 크레딧 1건(무료 250/월) — naver_search(일 25,000회)와
  WebSearch 를 우선하고, serp 는 정밀 검색에만 아껴 쓴다.

## Additional Resources

### Reference Files

- **`references/scenes-schema.md`** — scenes.js 데이터 계약 전문 (타입별 필드·나레이션 세그먼트·검증 체크리스트)
- **`references/storyboard-template.md`** — storyboard.md 표준 구조 + research.md 표 형식
- **`references/shot-script-template.md`** — 촬영 모드 한정: script.md(촬영 대본) 구조 + 촬영 수칙 + scenes.js 변형 계약
