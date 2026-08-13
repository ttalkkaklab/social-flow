# 타임라인 데이터 계약 — recording/

`data/<채널>/<주제>/recording/` — ingest 스킬 산출. `timeline.md` 가
storyboard 스킬의 자료조사(research.md) 자리를 대체하는 **1차 소스**다.

```
recording/
├── raw/                 # transcribe.sh 원신호 (중간 산출 — 재실행 시 덮어씀)
│   ├── audio.wav        # 16kHz mono 추출 오디오
│   ├── transcript.json  # whisper.cpp STT (ms 오프셋)
│   ├── silences.tsv     # 무음 구간 start<TAB>end (초)
│   ├── scenes.tsv       # 화면 전환 시각 (초)
│   └── duration.txt     # 원본 길이 (초)
├── timeline.json        # 기계용 — 아래 스키마
├── timeline.md          # 사람용 — 씬 표 + 문장별 타임스탬프 + 키프레임 + 화면 설명
└── keyframes/seg-N.jpg  # 씬 대표 프레임 (960px, vision_analyze 입력)
```

## timeline.json

```json
{
  "source": "/abs/path/녹화.mov",        // 원본 절대경로 (복사하지 않는다)
  "duration": 312.4,
  "params": { "min_scene": 8.0, "max_scene": 45.0 },
  "scenes": [
    {
      "idx": 1,
      "start": 0.0, "end": 23.4, "duration": 23.4,
      "text": "씬 전체 발화 이어붙임",
      "sentences": [ { "start": 0.8, "end": 4.1, "text": "문장 하나" } ],
      "keyframe": "keyframes/seg-1.jpg"
    }
  ]
}
```

## timeline.md

frontmatter: `source` / `duration` / `scenes` / `generated` / `status`.
`status` 는 `draft`(build-timeline 직후) → `annotated`(화면 설명·전사 교정 후).
본문: 씬 요약 표(`| # | 구간 | 길이 | 발화 | 화면 |`) + 씬별 상세(키프레임 임베드,
문장별 `[mm:ss.s]` 타임스탬프, 화면 설명). **화면 열은 build-timeline 이
placeholder 로 남기고, ingest 스킬이 vision_analyze 결과로 채운다.**

전사 교정 계약: STT 오인식은 본문에 `원문(→교정)` 으로 표기하고(원문 삭제 금지),
말미 `## 전사 교정 로그` 표(`| 씬 | 시각 | 원문 | 교정 | 근거 |`)에 기록한다.
근거는 키프레임 OCR 또는 profile.md 용어 대조만 인정 — 근거 없는 교정은 금지.
`raw/transcript.json`·`timeline.json` 은 원신호 그대로 보존한다 (출처 사슬:
raw = whisper 원문, timeline.md = 근거 기반 교정본).

## alignment.json — 대본 정합 (스토리보드 선행 모드 한정)

`storyboard/script.md`(촬영 대본)가 있으면 ingest 가 타임라인 검수 후 **녹화와
스토리보드 씬의 정합**을 이 파일로 기록한다 — produce 편집 파이프라인
(produce `references/screencast-pipeline.md`)의 입력이며, `overlay` 필드만 더하면
그대로 edit.json 이 된다.

```json
{
  "source": "/abs/녹화.mov",           // timeline.json 과 같은 원본 절대경로
  "scenes": [
    {
      "idx": 1,                        // 스토리보드 씬 번호 (scenes.js 배열 인덱스+1)
      "start": 3.2, "end": 21.8,       // 원본 시계 컷 구간 — 무음 안에서 타이트하게
      "crop": [400, 200, 1600, 1200],  // (선택) 시연 초점 영역 [x,y,w,h] — 키프레임 근거
      "subs": [                        // 자막 — timeline.md 교정 표기, 원본 시계 그대로
        { "start": 3.4, "end": 6.1, "text": "문장" }
      ],
      "note": "테이크 2 채택 (0:41 재시작)"   // (선택) 정합 판단 기록
    }
  ]
}
```

정합 규칙:

- **사람(Claude)이 대조해 작성한다** — timeline.md 씬·문장과 script.md 씬을 읽고
  매칭한다. 알고리즘 자동 매칭이 아니므로 순서 바뀜·재촬영 테이크도 흡수한다.
- 컷 경계는 문장 타임스탬프 사이 **무음**에 놓는다 — 씬 시작은 첫 문장 0.2~0.4s
  앞, 끝은 마지막 문장 0.3~0.6s 뒤.
- 같은 씬을 여러 번 말했으면(재촬영) **마지막 테이크**를 채택하고 note 에 적는다.
- `crop` 은 키프레임을 보고 시연 초점 영역으로 잡는다 — 전체 화면(5K)을 그대로
  두면 1080 폭으로 4.7배 축소돼 글씨가 안 읽힌다 (3배 초과 축소는 빌더가 경고).
- `subs.text` 는 timeline.md 의 **교정 표기**(원문(→교정)의 교정 쪽, sub 원칙) —
  raw 원문을 넣으면 오인식이 화면에 박제된다.
- 대본에 있는데 녹화에 없는 씬(누락)·대본 밖 발화(즉흥)는 사용자에게 보고하고
  [부분 재촬영 / 씬 제외 / 즉흥 포함] 판단을 받은 뒤 확정한다.

## 경계 산출 원리

1. `silencedetect` 무음마다 `score_boundary(무음, 화면전환목록)` 점수 부여
   — ≥1.0 강한 경계 / 0~1 약한 경계 / ≤0 무시.
2. 강한 경계에서 우선 분할. 경계는 항상 **문장 사이 간극에 스냅**된다
   (전사 타임스탬프 ±0.2s 오차를 무음이 흡수).
3. `MAX_SCENE_SEC`(기본 45s) 초과 씬은 내부 최고점 약한 경계에서 재분할,
   `MIN_SCENE_SEC`(기본 8s) 미만 씬은 더 짧은 이웃과 병합.
4. 화면 전환만 있고 발화가 이어지는 지점은 경계가 아니다 —
   말이 계속되는데 씬을 자르면 나레이션 재구성 때 문장이 찢어진다.

## 조정 노브 (transcribe.sh 환경변수 · build-timeline.py 인자)

| 노브 | 기본 | 올리면 | 내리면 |
|---|---|---|---|
| `SIL_DB` | -35dB | 시끄러운 녹음에서 무음 검출 증가 | 조용한 방(-40dB)에서 미세한 쉼까지 검출 |
| `SIL_MIN` | 0.6s | 숨 고르기 무시(경계 감소) | 경계 후보 증가 |
| `SCENE_THRESH` | 0.04 | 스크롤 오탐 감소 (과다 시 0.15) | 미세한 화면 변화도 검출 |
| `--min-scene` | 8s | 잔 씬 병합 증가 | 짧은 씬 허용 |
| `--max-scene` | 45s | 긴 씬 허용 | 분할 증가 |

`WHISPER_PROMPT`(기본 없음)는 수치 노브가 아니라 **용어집 주입**이다 — 쉼표로
나열한 고유명사·도메인 용어(profile.md + 주제 예상 용어) 쪽으로 whisper 디코더를
편향시켜 오인식을 원천 감소시킨다. 설정 시 `--carry-initial-prompt` 로 긴 녹화
전 구간에 적용된다. 재실행 비용이 가장 싼 개선책 — 오인식이 광범위하면 사후
교정 대신 용어를 보강해 transcribe.sh 를 다시 돌린다.

## 함정

- **whisper 한국어 환각** — 무음 구간에서 문장을 지어내거나 같은 문장을
  반복한다. build-timeline 이 무음 70% 겹침·3연속 반복을 자동 제거하지만,
  timeline.md 검토 때 "말한 적 없는 문장"이 보이면 해당 구간을 의심하라.
- **스크롤은 화면 전환이 아니다** — scenes.tsv 에 스크롤 오탐이 다수 보이면
  `SCENE_THRESH=0.15` 로 재실행. 단 전환 시각은 무음 근처에서만 경계 점수에
  쓰이므로 발화 중 오탐은 무해하다 (민감한 쪽이 안전).
- **원본은 복사하지 않는다** — timeline.json 의 source 절대경로 참조.
  원본을 옮기면 키프레임 재추출이 불가능해지므로 이동 전에 ingest 를 끝낸다.
- **교정 환각** — LLM 교정은 근거(키프레임 OCR·profile.md 용어) 대조가 있을
  때만 한다. 근거 없이 "자연스럽게" 고치는 것은 1차 소스 오염 — 실제 발언이
  사라진다. 표기·로그 규칙은 위 timeline.md 절의 전사 교정 계약 참조.
- **전사는 인용이 아니다** — 구어 전사에는 필러·말실수·부정확한 수치가 있다.
  스토리보드 승인 전 시효성 수치는 storyboard 스킬의 검증 정책(교차 검증)을
  그대로 적용한다. 녹화에서 말했다는 사실이 출처가 되지 않는다.
