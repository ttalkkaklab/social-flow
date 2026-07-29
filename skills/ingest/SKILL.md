---
name: ingest
description: >
  This skill should be used when the user asks to "녹화 분석해줘", "화면 녹화로
  스토리보드", "녹화한 영상 가져와", "말하면서 녹화한 거 정리", "ingest this
  recording", "녹화 시작해", "화면 녹화 해줘", or provides a screen recording
  (with voice narration) to turn into content. Can start/stop the screen+mic
  recording itself (record.sh, macOS screencapture), then extracts timestamped
  speech (whisper.cpp STT) + silence/scene-change signals from the recording,
  merges them into a per-scene timeline (data/<category>/<topic>/recording/
  timeline.md with keyframes + vision descriptions), which then feeds the
  storyboard skill as the primary source replacing web research. In the
  storyboard-first shooting flow (storyboard/script.md exists), it additionally
  aligns the recording to the storyboard scenes (recording/alignment.json) so
  produce can edit the footage into the final video.
argument-hint: "<카테고리> <녹화파일 경로|record> [주제 slug]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "mcp__fect-mcp__vision_analyze", "mcp__fect-mcp__vision_ocr"]
---

# 녹화 인제스트 — data/[카테고리]/[주제]/recording/

화면 녹화(음성 나레이션 포함)를 **타임라인별 텍스트**로 변환한다. 산출된
`timeline.md` 는 storyboard 스킬의 자료조사(research.md) 자리를 대체하는
1차 소스가 된다 — 녹화에서 말하고 보여준 것이 씬 설계의 재료다.

```
data/<카테고리>/<주제 slug>/recording/
├── raw/                 # STT·무음·화면전환 원신호 (transcribe.sh)
├── timeline.json        # 기계용 씬 타임라인
├── timeline.md          # 사람용 — 씬 표 + 문장 타임스탬프 + 화면 설명
├── keyframes/seg-N.jpg  # 씬 대표 프레임
└── alignment.json       # 촬영 모드 한정 — 스토리보드 씬 ↔ 녹화 컷 정합 (§5)
```

## 절차

### 0. 녹화 모드 (인자에 파일 대신 `record`)

이미 녹화된 파일이 없으면 **녹화 자체를 이 스킬이 수행**한다:

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/ingest/references
bash $REF/record.sh start ~/Movies/social-flow-rec-$(date +%Y%m%d-%H%M%S).mov
```

- 시작 전에 사용자에게 알린다: **마이크에 대고 말하면서** 화면을 시연하면 되고,
  끝나면 "녹화 끝"이라고 말해달라고. 시연 팁도 함께 — 화제를 바꿀 때 **1초 이상
  말을 멈추고 화면을 전환**하면 씬 경계가 정확해진다.
- **`storyboard/script.md` 가 있으면(촬영 모드)** 시작 전에 그 경로를 알리고
  **보조 모니터에 대본을 띄우라**고 안내한다 — 대본의 촬영 수칙(씬 사이 1초
  멈춤+전환, 앱 폰트 확대, 틀리면 그 씬 처음부터 다시)을 요약해 준다.
- 사용자가 끝을 알리면 `record.sh stop <같은 경로>` → 산출 mov 로 절차 1 진행.
- 시작 실패 시(권한): 시스템 설정 → 개인정보 보호 및 보안 → **화면 기록**과
  **마이크**에 터미널 앱을 허용하도록 안내한다.
- 녹화 대상은 **메인 모니터 하나뿐**이다 (record.sh 가 `-D 1` 고정) — 멀티
  모니터면 시연은 메인에서 하고, 보조 모니터는 현황 확인·메모 등 자유롭게
  써도 녹화에 찍히지 않는다.
- 녹화 중 메인 화면에서는 다른 작업을 하지 않는다 — 메인에 뜨는 모든 것이
  찍힌다 (알림 배너 포함 — 방해 금지 모드 권장).

### 1. 전제 확인

```bash
command -v whisper-cli && ls ~/.cache/whisper-cpp/ggml-large-v3-turbo.bin
```

없으면 안내 후 중단: `brew install whisper-cpp`, 모델은
`huggingface.co/ggerganov/whisper.cpp` 의 `ggml-large-v3-turbo.bin` (1.5GB) 을
`~/.cache/whisper-cpp/` 에 다운로드. 녹화 파일도 존재·재생 가능(ffprobe)한지
확인한다.

### 2. 프로파일 로드 + 주제 확정

`data/<카테고리>/profile.md` 를 Read 한다 — 없으면 중단하고
`/social-flow:category add` 안내. 주제 slug 는 인자로 받거나, 전사 후 내용을
보고 §7 slug 규칙으로 제안해 사용자 확인을 받는다 (전사 전에는 가칭 디렉토리
`recording-inbox/` 가 아니라 **전사를 먼저 스크래치에서 돌린 뒤** slug 를 정하고
정식 경로로 옮겨도 된다).

### 3. 원신호 추출 + 타임라인 병합

먼저 **용어집을 만들어 오인식을 예방**한다 — profile.md 의 도메인 용어와 주제에서
예상되는 고유명사(앱·제품·서비스 이름, 전문 용어)를 쉼표로 나열해
`WHISPER_PROMPT` 로 주입한다. whisper 디코더가 이 어휘 쪽으로 편향돼 음차
오인식("클라우드 코드" ← Claude Code)이 원천 감소한다.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/ingest/references
WHISPER_PROMPT="<profile.md 용어, 예상 고유명사 쉼표 나열>" \
  bash $REF/transcribe.sh <녹화파일 절대경로> data/<카테고리>/<주제>/recording
python3 $REF/build-timeline.py data/<카테고리>/<주제>/recording --src <녹화파일 절대경로>
```

- 원본은 **복사하지 않는다** — timeline.json 이 절대경로를 참조한다.
- 무음·화면전환 검출 감도가 안 맞으면 `references/timeline-schema.md` §조정
  노브의 환경변수로 재실행한다 (재실행은 raw/ 를 덮어쓰므로 안전).
- 씬이 지나치게 많거나 적으면 `--min-scene`/`--max-scene` 을 조정한다.

### 4. 화면 설명 기입 + 전사 교정 + 개인정보 검수

키프레임마다 `vision_analyze`(language "ko") 로 두 가지를 한 번에 묻는다:
① 화면에 무엇이 보이는가(앱·화면·조작 내용 요약), ② **개인정보·민감정보**
(알림 배너, 이메일 주소, 계정명, 토큰·키, 금액 등)가 보이는가.
화면에 글자가 많아 정확한 판독이 필요하면 `vision_ocr` 를 보조로 쓴다.

- 화면 설명을 timeline.md 의 씬 표 "화면" 열과 상세 "화면 설명" 에 기입하고
  frontmatter `status: annotated` 로 갱신한다.
- **전사 교정 (근거 필수)** — 씬별 전사를 화면 텍스트(vision_analyze·vision_ocr
  결과)와 profile.md 용어에 대조해 오인식을 교정한다:
  - 화면 OCR·프로파일 용어집과 대조되는 **근거 있는 경우에만** 고친다.
    "더 자연스럽게" 다듬기는 교정이 아니라 1차 소스 오염이다 (교정 환각 금지).
  - 본문 표기는 `원문(→교정)` — 원문을 지우지 않는다.
  - timeline.md 말미에 `## 전사 교정 로그` 표를 추가한다:
    `| 씬 | 시각 | 원문 | 교정 | 근거 |` — 근거 없는 행은 만들 수 없다
    (근거 예: `seg-2 OCR "Claude Code"`, `profile.md 용어 "ISA"`).
  - `raw/transcript.json`·`timeline.json` 은 원신호 그대로 둔다 — 교정은
    timeline.md 에만 반영한다.
  - 오인식이 광범위하면 교정으로 때우지 말고 `WHISPER_PROMPT` 에 용어를 보강해
    §3 을 재실행하는 쪽이 낫다 (재실행은 raw/ 덮어쓰기라 안전).
- **민감정보가 검출되면 해당 씬 목록을 사용자에게 보고**한다 — 이 프레임들이
  나중에 영상 소재로 쓰이면 안 되는지 판단은 사용자 몫.

### 5. 대본 정합 — `storyboard/script.md` 가 있을 때만

촬영 모드(스토리보드 선행)면 §4 까지 끝난 타임라인을 **스토리보드 씬에 정합**한다
— `references/timeline-schema.md` §alignment.json 계약대로
`recording/alignment.json` 을 작성한다:

- timeline.md 의 씬·문장과 script.md 의 씬을 대조해 스토리보드 씬 번호(idx)마다
  녹화 컷 구간 [start, end] 를 잡는다 — 컷은 문장 타임스탬프 사이 **무음**에
  (씬 시작 0.2~0.4s 앞, 끝 0.3~0.6s 뒤).
- 같은 씬을 여러 번 말했으면(재촬영) **마지막 테이크**를 채택하고 note 에 기록.
- 씬별 키프레임을 보고 시연 초점 영역이 화면 일부면 `crop` [x,y,w,h] 를 잡는다 —
  전체 화면을 그대로 두면 글씨가 안 읽힌다 (편집 빌더가 3배 초과 축소를 경고).
- `subs` 는 timeline.md **교정 표기** 문장을 원본 시계 그대로 옮긴다.
- **이탈 보고**: 대본에 없는 즉흥 발화, 누락 씬, 순서 바뀜, 대본과 다른 수치·
  고유명사 발화는 사용자에게 표로 보고하고 [부분 재촬영 / 씬 제외 / 그대로 채택]
  판단을 받은 뒤 alignment.json 을 확정한다.

### 6. 타임라인 제시 + 스토리보드 연계

AskUserQuestion 으로 결과를 제시한다 — timeline.md 경로, 씬 수·총길이,
씬별 한 줄 요약. 선택지: [스토리보드 진행 / 타임라인 수정(경계 조정 재실행) /
여기까지]. 스토리보드 진행이면 `/social-flow:storyboard <카테고리> <주제>` 를
안내한다 — storyboard 스킬은 `recording/timeline.md` 가 있으면 웹 조사 대신
이를 1차 소스로 쓴다.

**촬영 모드(§5 를 거친 경우)** 는 스토리보드가 이미 승인돼 있으므로 선택지가
다르다: [편집 제작 진행 / 정합 수정 / 여기까지] — 진행이면
`/social-flow:produce <카테고리> <주제>` 를 안내한다 (produce 가
alignment.json 을 발견하고 편집 파이프라인을 탄다).

## 함정

- **구어 전사 ≠ 나레이션** — 필러("어", "이제 여기서")·반복·말실수가 그대로
  들어 있다. 스토리보드가 재구성할 원료일 뿐, scenes.js 에 문장을 복사하지
  않는다 (자수 상한·쉬운 말 원칙은 storyboard 단계에서 적용).
- **말한 수치는 출처가 아니다** — 시효성 값(가격·세율·기한)은 storyboard 의
  교차 검증 정책을 그대로 통과해야 한다. 녹화 속 발언은 주장이지 근거가 아니다.
- **whisper 환각·스크롤 오탐·감도 조정** — `references/timeline-schema.md` §함정.
- **긴 녹화** — large-v3-turbo 는 Apple Silicon 에서 대략 실시간의 3~5배 속도로
  전사한다. 10분 녹화면 2~3분 — 백그라운드 실행(run_in_background)으로 돌리고
  다른 준비를 병행한다.

## Additional Resources

### Reference Files

- **`references/record.sh`** — 화면+마이크 녹화 시작/정지 (macOS screencapture, PID 파일 관리)
- **`references/transcribe.sh`** — 오디오 추출 → whisper.cpp STT → 무음 검출 → 화면 전환 검출 (원신호 4종)
- **`references/build-timeline.py`** — 신호 병합 → 씬 경계 산출 → timeline.json/md + 키프레임 추출
- **`references/timeline-schema.md`** — recording/ 데이터 계약 · 경계 산출 원리 · 조정 노브 · 함정
