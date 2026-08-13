---
name: autoproduce
description: >
  This skill should be used when the user asks to "이 주제로 영상 하나 만들어",
  "주제만 주면 영상까지 만들어줘", "자동으로 쇼츠 만들어", "make a short about X
  end to end", or when a growth loop needs to refill its publish queue by itself.
  Takes a single topic and runs the whole chain unattended — research with the
  search tools, author scenes.js, generate 9:16 backgrounds, synthesize narration,
  build the 9:16 video (clean master + burned copy + subs.srt) and per-platform
  text under data/<channel>/<topic>/output/ — on the cheapest model tier that
  works, escalating only when measured metrics say the hook is failing. Machine
  gates (fact verification, style checker, build report, content-reviewer P0,
  cost cap) stand in for the human approval gates of storyboard/produce.
argument-hint: "<채널> \"<주제>\" [unattended]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "Agent",
  "WebSearch", "WebFetch",
  "mcp__social-flow__naver_search", "mcp__social-flow__serp_web_search",
  "mcp__social-flow__serp_news_search",
  "mcp__social-flow__image_local_generate", "mcp__social-flow__gpt_image_text2img",
  "mcp__social-flow__tts_local_generate", "mcp__social-flow__tts_generate",
  "mcp__social-flow__tts_list_voices",
  "mcp__social-flow__veo_img2video",
  "mcp__social-flow__music_generate_clip"]
---

# 주제 하나로 영상까지 — 무인 저작

`storyboard → produce` 를 사람 승인 없이 한 번에 통과시킨다. 입력은 주제
문자열 하나, 출력은 게시 가능한 `output/` 한 벌이다.

**두 스킬을 대체하지 않는다.** 계약·템플릿·빌더는 전부 그쪽 것을 그대로 쓴다
— 이 문서가 정하는 것은 **사람이 없을 때 누가 판단하나** 와 **어느 모델을
쓰나** 둘뿐이다.

```
/social-flow:autoproduce <채널> "<주제>"              # 사람 호출 — 끝에 결과 확인
/social-flow:autoproduce <채널> "<주제>" unattended    # 성장 루프 호출 — 질문 없음
```

## 사람 게이트를 무엇이 대신하나

파이프라인의 안전은 HITL 이중 게이트(스토리보드 승인·게시 승인)에 걸려 있었다.
무인 모드는 그 자리에 **기계 판정 다섯**을 세운다. 하나라도 떨어지면 영상은
만들어지되 **큐에 들어가지 않는다**(`queue_*: hold`) — 사람이 볼 때까지 게시되지
않는다는 뜻이다.

| 원래 사람이 보던 것 | 무인 대체 | 떨어지면 |
|---|---|---|
| 사실이 맞나 | 시효성 값 독립 출처 2개 교차검증 + 검증 통과 사실 **3건 이상** | 주제 폐기 (§2) |
| 문장이 사람 글인가 | `check-style.py` 표면별 exit ≤ 1 | 고쳐서 재시도, 2회 실패면 중단 (§4·§9) |
| 영상이 성립하나 | `build-report.txt` drift 0 · reveal 누락 0 | 중단 (§8) |
| 게시해도 되나 | content-reviewer **P0 = 0** (무인 최대 2라운드) | `queue_*: hold` (§10) |
| 돈이 나가도 되나 | `cost-report.sh --cap` exit 0 | 승급 취소 후 경제 기본 (§5) |

## 절대 규칙

1. **금지 소재는 상속한다** — profile §3 금지 소재와, 무인 호출이면 성장 플랜의
   금지 소재 목록. 정치·종교·국적 비하, 미검증 제도 정보는 어느 경로로도 나가지
   않는다.
2. **없는 사실을 만들지 않는다** — 검증에 실패한 수치는 넣지 않고, 범위를 상한
   하나로 줄이지 않는다. 자동 저작이라고 기준이 낮아지지 않는다.
3. **profile §2 의 TTS 엔진·보이스를 바꾸지 않는다** — 로컬이 싸다는 이유로
   `gemini` 채널을 갈아타지 않는다. 회차마다 나레이터가 바뀐다.
4. **경제 기본으로 시작한다** — 모델 사다리와 승급 조건은
   `references/cost-tiers.md` 가 정본이다. 승급은 관측 지표가 시킬 때만.
5. **무인 모드는 게시하지 않는다** — 이 스킬은 큐 마커까지만 찍는다. 게시는
   성장 루프의 슬롯 단계나 publish 스킬이 한다.
6. **락 없이 저작하지 않는다** — 두 성장 루프가 같은 채널에서 동시에 돌 수 있다
   (§0). 락 없이 들어가면 같은 주제를 두 번 만들고 돈도 두 번 나간다.
7. **플랫폼 루프당 하루 2편을 넘지 않는다** — YouTube 플랜과 Instagram 플랜이
   각각 하루 최대 2편이다. 성공·실패를 합쳐 세고, 호출자(플랜)별로 센다 —
   `autoproduce.json` 의 일 버킷이 호출자 구분을 담는 이유다. 플랜의
   `daily_produce_cap` 은 이 안에서만 내릴 수 있고 올리지 못한다. 사람이 직접
   부르는 호출은 이 캡 밖이다 — 사람이 그 자리에서 편수를 결정하고 있어서다.
8. **같은 이야기를 두 번 만들지 않는다** — 후보 주제는 §1 의
   `check-duplicate.py` 판정을 통과해야 한다. slug 이 달라도 내용이 같으면
   재탕이고, 재탕은 IG 원본성 판정과 채널 신뢰 양쪽을 깎는다.

## 산출물

`storyboard/` 를 통째로 보관한다 — 무인 게이트는 근거 없이 감사할 수 없고,
publish·큐·QA 하네스가 전부 이 파일들을 읽는다.

```
data/<채널>/<주제 slug>/
├── storyboard/
│   ├── research.md      # 출처·확인일·검증 상태 — 자동 저작일수록 이게 유일한 감사 흔적
│   ├── scenes.js        # SoT
│   ├── storyboard.md    # frontmatter 에 status·auto_produced·queue 마커
│   ├── storyboard.html
│   └── images/
├── .work/
│   ├── cost-tally.tsv   # 무엇을 몇 개 썼나 (§5 부터 한 줄씩 append)
│   └── …
└── output/
    ├── video/           # video.mp4(클린) · video-sub.mp4(번인) · subs.srt · cover.jpg
    │                    #   · build-report.txt · cost-report.txt
    ├── instagram/caption.md · youtube/meta.md · (플랫폼별)
    └── publish-log.md
```

## 절차

### 0. 로드·락·예산

`data/<채널>/profile.md` 로드(없으면 중단). 무인 호출이면 호출한 성장 플랜의
`autoproduce:` 블록도 함께 읽는다.

**락은 채널 단위다** — 두 성장 루프가 한 채널을 공유하므로 플랫폼별로 잠그면
소용이 없다. `mkdir` 의 원자성을 쓴다.

```bash
G=data/<채널>/growth; LOCK=$G/.autoproduce.lock
TOKEN=$(uuidgen)                     # 이번 실행의 소유권 증표
mkdir -p "$G"
# 60분 넘게 잡혀 있으면 죽은 락이다 (Veo 비동기가 최대 6분이라 여유를 크게 둔다)
[ -d "$LOCK" ] && [ -n "$(find "$LOCK" -maxdepth 0 -mmin +60 2>/dev/null)" ] && rm -rf "$LOCK"
mkdir "$LOCK" 2>/dev/null || { echo "다른 루프가 저작 중 — 이번 틱은 건너뛴다"; exit 0; }
printf '%s %s <호출자>\n' "$TOKEN" "$(date -u +%FT%TZ)" > "$LOCK/owner"
```

락을 잡았으면 **성공·실패·중단 어느 경로로 끝나든 해제한다.** 잊으면 다음 틱이
60분을 기다린다. 다만 지우기 전에 **그 락이 아직 내 것인지 확인한다.**

```bash
grep -qF "$TOKEN" "$LOCK/owner" 2>/dev/null && rm -rf "$LOCK"
```

무조건 `rm -rf` 하면 이런 일이 난다 — 내가 60분을 넘겨 늘어지는 사이 다음 틱이
죽은 락으로 보고 회수해 자기 락을 새로 만든다. 뒤늦게 끝난 내가 **남의 락을
지운다.** 그러면 세 번째 루프가 그 틈으로 들어와 같은 채널에서 저작이 겹친다.

`$G/autoproduce.json`(없으면 생성)에서 오늘·이번 주 누적을 읽는다. 다음 중
하나라도 걸리면 저작하지 않고 사유를 보고한다.

- 무인 호출: 오늘 **이 호출자(플랜)의** 저작 편수(성공·실패 합산) ≥
  **min(플랜 `daily_produce_cap`, 2)** — 2 는 절대 규칙 7 의 플랫폼별 하드캡이라
  플랜으로도 올리지 못한다. 사람 호출(`user`)은 편수 캡을 받지 않는다.
- 비용 누적(채널 합산 — 호출자 구분 없이 다 더한다)이 플랜
  `daily_cost_cap`·`weekly_cap` 초과

```json
{
  "channel": "ttalkkak-lab",
  "daily":  { "2026-08-11": { "counts": { "youtube": 1, "instagram": 0, "user": 0 }, "usd": 0.054 } },
  "weekly": { "2026-W33":   { "count": 3, "usd": 0.162 } },
  "producedTopics": [
    { "slug": "20260811-visa-fee", "title": "비자 수수료 인상", "at": "2026-08-11T09:12:00+09:00",
      "usd": 0.054, "tier": "economy", "by": "youtube", "queues": ["youtube", "instagram"] }
  ]
}
```

편수는 호출자별(`counts`), 비용은 채널 합산(`usd`)이다 — 편수 상한은 플랫폼마다
따로 받으라는 요구이고, 돈은 어느 루프가 썼든 같은 지갑에서 나가기 때문이다.

### 1. 주제 확정

인자로 주제가 왔으면 그대로 쓴다. 무인 호출이고 인자가 없으면 플랜의
`topic_source` 를 따른다.

- **`pool`(기본)** — 플랜 `topic_pool` 의 미사용 항목에서 하나. 사람이 승인한
  목록이라 소재 위험이 없다. **비었으면 저작하지 않고 "주제 풀 소진" 을
  보고한다** — 주제를 지어내지 않는다.
- **`keywords`** — 플랜 `topic_keywords` 로 `naver_search(type: "kin")` 을 돌려
  사람들이 실제로 묻는 것 중 하나를 고른다. 지식iN은 "무엇을 모르는지"가 질문
  그대로 남아 있어 훅의 재료가 된다. 이 모드는 init 에서 사용자가 명시로 고른
  경우만 쓴다.

**중복 게이트 (절대 규칙 8)** — 후보가 정해지면 저작을 시작하기 전에 판정한다.
slug 정확 일치(`producedTopics`·기존 디렉토리)는 앞에서 걸러졌어도, "비자 수수료
인상"과 "베트남 비자 수수료 오른다"처럼 **말만 바꾼 같은 이야기**는 사람 없이
잡아야 하므로 결정적 검사기를 돌린다.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
python3 $REF/check-duplicate.py --channel-dir data/<채널> \
  --title "<후보 제목>" --message "<핵심 메시지 한 문장>"; echo "dup_exit=$?"
```

채널의 **기존 주제 전부**(사람이 만든 것 포함)에서 slug·storyboard.md 제목·
scenes.js 커버 title 을 뽑아 비교한다. `dup_exit` 를 그대로 읽는다 —
0 신규 / 2 **중복 의심** / 1 판정 불가 / 3 입력 오류.

- **2** — 무인 모드는 그 후보를 버리고 다음 후보로 간다(§2 와 같이 두 번 버리면
  이번 저작 포기). 사람 호출 모드는 가장 닮은 기존 주제를 보여주고 계속할지
  묻는다 — 같은 소재의 후속편(다른 각도)은 사람만 판단할 수 있다.
- **1 을 신규로 읽지 않는다** — 채널 디렉토리를 못 읽었다는 뜻이므로 중단하고
  보고한다.
- 시리즈물처럼 제목 접두어가 같은 채널은 임계에 걸리기 쉽다. 플랜의
  `duplicate_threshold`(기본 0.5)를 올려 `--threshold` 로 넘기거나 그 채널은
  사람이 storyboard 로 만든다.

slug 은 profile §7 규칙으로 만든다.

### 2. 조사·검증 (게이트 1)

profile §5 정책대로 조사한다. 도구 순서와 쿼터 절약은 `references/cost-tiers.md`
§돈이 아닌 예산 — **`serp_*` 는 한 편에 최대 2회**.

`research.md` 에 주장별로 [출처 링크 · 확인일 · 검증 상태]를 적는다.
시효성 값(가격·세율·기한·시행일)은 독립 출처 2개 이상.

**검증을 통과한 사실이 3건 미만이면 그 주제를 버리고 다음 후보로 간다.**
사람이라면 "이걸로는 영상이 안 나오는데" 하고 멈출 자리다. 사실이 부족한 채로
진행하면 남는 건 화면만 그럴듯한 빈 영상이다. 후보를 두 번 버리면 저작을
포기하고 보고한다.

### 3. scenes.js 저작

`../storyboard/references/scenes-schema.md` 가 계약 정본이고, 설계 규칙은
storyboard 스킬 §4 를 그대로 따른다. 특히 자동 저작이 자주 어기는 것:

- 커버 제목 **16자 이내 + 주제어 필수**. 자극만 있고 무엇의 이야기인지 없으면
  스킵된다.
- 나레이션은 **세그먼트(문장) 배열** — 문장 하나가 reveal 하나. 자수 상한은
  cover ≤40자, points/quote ≤50자, 문장당 8~25자.
- `tts` 는 한글 발음 표기("4,700만"→"사천칠백만"), `sub` 는 원표기.
- THEME 은 profile §3 값을 그대로 복사.
- 구성은 cover 1 + points/quote 4~5, 본편 60~75초.

### 4. 문체 게이트 — 영상 표면 (게이트 2)

```bash
PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
for S in narration subtitle screen; do
  node $PG/extract-text.js ./storyboard/scenes.js $S > .work/text-$S.txt || { echo "[$S] gate_exit=3"; continue; }
  python3 $PG/check-style.py --surface $S .work/text-$S.txt; echo "[$S] gate_exit=$?"
done
```

0 통과 / 1 경고 / 2 S1 검출 / **3 은 게이트가 안 돈 것이지 통과가 아니다**.
2 면 **scenes.js 를 고쳐** §4 부터 다시 한다 — `.work/text-*.txt` 만 고치면
영상과 어긋난다.
두 번 고쳐도 2 면 중단하고 보고한다 — 무인 루프가 같은 문장을 무한히 다듬는
것을 막는다.

### 5. 티어 결정 + 사전 견적 (게이트 5)

`references/cost-tiers.md` 의 승급 조건을 확인한다. 무인 호출이면 성장 루프가
방금 읽은 인사이트(YouTube `averageViewPercentage` / Instagram
`reels_skip_rate` 최근 3편 평균)를 인자로 받아 판정하고, 게시 이력이 3편 미만이면
**승급하지 않는다**.

예상 tally 를 `.work/cost-tally.tsv` 에 적고 상한을 확인한다.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
$REF/cost-report.sh .work/cost-tally.tsv --cap <플랜 max_cost_per_video>; echo "cost_exit=$?"
```

exit 2(초과)면 **승급을 취소하고 경제 기본으로 내려온다** — 중단이 아니다.
exit 1(판정 불가)이면 중단한다. 단가를 모르는 채로 돈을 쓰지 않는다.

### 6. 비주얼 생성

- **배경 — 커버 1장 + points 2~4장** — `size: "1088x1920"`.
  - **커버 배경 = `gpt_image_text2img` `quality: "high"` 실사 인물 장면**(생성 인물만,
    기본 한국 여성 — profile §3 타깃 기준. 절대 규칙 11·12) — 커버 프레임이 그대로
    cover.jpg(썸네일)가 된다. 주제가 한눈에 보이는 장면으로, `face not visible` 대신
    `seen from behind, face turned away`. 승급 편은 이 PNG 가 veo 소스를 겸한다.
  - points 배경은 **`image_local_generate`(로컬 Z-Image — 기본, 장당 비용 0)**,
    **주제 실사 컷 2~4장** — 사진이 주인공이라(절대 규칙 14) 한 장 돌려쓰기는 본문
    전체를 같은 정지 컷으로 만든다. 내용 축이 바뀔 때 컷을 바꾸되 같은 인물·공간의
    다른 앵글로 연속성을 지킨다. 프롬프트는 storyboard §5 규약(profile §3 무드 +
    필수 부정 지시 + "lower third fading into darkness").
    `storyboard/images/scene-<n>.png`. 장당 수 분 걸린다 — 무인 경로에선 문제가
    없지만 영상 렌더와 동시 실행은 피한다. mflux 미설치 머신이면 툴이 설치 안내와
    함께 실패한다 — 그 회차만 `gpt_image_text2img`(`quality: "low"`)로 폴백하며,
    그때는 **Gemini TTS 채널 3장 상한**이 되살아난다(4장이면 기본 상한 $0.30 초과 —
    cost-tiers).
  - **생성 전에 content-reviewer 계획 모드에 위임**해 `PLAN_REVIEW: PASS p0=0` 를
    확인한다(절대 규칙 13) — 무인 경로에서도 이 게이트는 기계 판정이라 사람이 필요
    없다. FAIL 이면 계획을 고쳐 재위임한다(최대 2라운드, 미달 시 그 편 중단).
- **도입 b-roll (승급했을 때만)** — `veo_img2video`(`aspectRatio: "9:16"`,
  `resolution: "1080p"`, `durationSeconds: 8`, model `veo-3.1-fast-generate-preview`).
  **소스는 §6 에서 이미 만든 커버 배경 PNG** 다 — produce 절대 규칙 8 이 `veo_text2video`
  를 금지한다(같은 프롬프트로도 매번 다른 장면이 나와 되돌릴 기준이 없다).
  **생성은 8초(1080p 는 8초 전용), 사용은 broll 씬 `duration`(기본 4초)만** — produce
  §6 트림+믹스 규약대로 원본 앞부분만 잘라 쓰고 원본은 보관한다. 업스케일하지
  않는다(본편이 1080×1920 — 720p 로 내리지 않는 사용자 결정 2026-08-11).
  **프롬프트는 영어로 모션만** + 끝에 오디오 지시 한 줄. 소스 이미지에 이미 보이는
  것을 다시 묘사하면 모델이 장면을 재설계한다. `.work/broll/cover-broll.mp4`.
  - **커버 자체를 생성 영상으로 만들지 않는다** — Veo 는 한글을 못 쓴다(절대 규칙 10).
    커버는 코드 렌더로 두고 b-roll 은 **커버 다음 구간**에 넣는다.
  - **그 구간에는 나레이션이 없다**(절대 규칙 9) — 영상 사운드를 쓴다. 그 씬은
    `narration: []` 이고, 자막도 없으므로 §8 빌드 후 `splice-clip.sh` 가 뒤 자막을
    실측 삽입 길이만큼 민다. **팔린드롬 금지** — 소리가 거꾸로 재생된다.
- **BGM** — `music_generate_clip` 인스트루멘털 30초, `.work/bgm.wav`.
  프롬프트에 "leaves space for a spoken voiceover, no melody in the vocal
  frequency range". 빌더가 루프로 늘린다.

호출마다 `.work/cost-tally.tsv` 에 실제 사용량을 한 줄씩 append 한다.

### 7. 나레이션

produce 스킬 §5 그대로다 — **씬당 1콜**, profile §2 엔진·보이스 고정,
대본은 narration 세그먼트의 `tts` 문장을 마침표로 이어 붙인 전문,
`.work/pcm/c<n>.wav`. 생성 직후 길이 검사(자수/4.5 의 2배 초과 → 1회 재생성).

로컬 엔진이 "Python interpreter not found" / "No module named 'supertonic'" 으로
실패하면 **Gemini 로 갈아타지 않고 그 자리에서 중단**한다. 목소리가 바뀐 영상이
자동으로 게시되는 것이 이 파이프라인 최악의 사고다.

### 8. 렌더·빌드 (게이트 3)

produce 스킬 §2(frame.html 재생성) · §4(reveal 캡처) · §6(manifest) 을 그대로
따라 `build-reel.sh` 로 빌드한다. 무인 모드에서는 chrome-devtools 오버플로
확인을 못 할 수 있으므로, 캡처한 상태 PNG 의 파일 크기가 0 이 아닌지와 씬별
상태 수가 manifest 와 맞는지를 대신 확인한다.

`build-report.txt` 판정은 `../produce/references/pipeline.md` §리포트 게이트 표.
**drift ≠ 0 · reveal 상태 누락 · 마지막 reveal 미사용은 진행 금지**다. 무인
모드에서 진행 금지는 곧 중단이며, 큐에 넣지 않는다.

**도입 b-roll 을 만들었으면 여기서 접합한다** (produce §6 끝):

```bash
T=$(grep -E "^card 0" .work/build-report.txt | sed -E 's/.*\| ([0-9.]+)s \| [0-9]+f.*/\1/')
$REF_P/splice-clip.sh .work .work/broll/cover-broll.mp4 "$T"
```

`T` 는 눈대중으로 잡지 않는다 — `card 0` 의 확정 길이가 커버 종료 시각이다.
접합 출력에서 **`T 를 걸친 큐 0개`** 와 **클린·번인 길이 일치**를 확인한다. 어긋나면
큐에 넣지 않는다. 이후 §9 는 `reel-spliced.mp4`·`reel-sub-spliced.mp4`·`subs-spliced.srt`
를 output 으로 옮긴다.

### 9. output 확정 + 플랫폼 텍스트

```bash
cp .work/reel.mp4 output/video/video.mp4
cp .work/reel-sub.mp4 output/video/video-sub.mp4
cp .work/subs.srt .work/cover.jpg .work/build-report.txt output/video/
```

**세 파일이 다 있어야 게시가 완결된다** — 클린본과 `subs.srt` 는 YouTube·
Facebook 으로, 번인본은 Instagram 으로 간다(publish 스킬 규칙 8).

플랫폼 텍스트는 platform-guide 플레이북대로 플랫폼마다 다시 쓰고, 저장 직후
표면별 문체 검사를 돌린다(produce §9 의 스크립트 그대로). exit 2 면 고쳐서 재실행,
두 번 실패면 그 플랫폼 큐 마커를 찍지 않는다.

### 10. 품질 게이트 (게이트 4) + 마무리

content-reviewer 에이전트에 위임한다 — **번인본에서 뽑은 프레임**(클린본에는
자막이 없어 오탈자·잘림이 안 보인다)·플랫폼 카피·scenes.js·§4·§9 의 exit code.
**P0 = 0 이 될 때까지 수정, 무인 모드는 최대 2라운드.**

마무리 순서:

1. `cost-report.sh .work/cost-tally.tsv > output/video/cost-report.txt`
2. `autoproduce.json` 에 누적(일·주 count·usd)과 `producedTopics` 항목 추가
3. storyboard.md frontmatter 갱신

```yaml
status: produced
auto_produced: true
approved_by: autoproduce/<호출한 성장 플랜 또는 user>
tier: economy            # economy | escalated
queue: ready             # 승인된 플랫폼만 — P0 미해결이면 hold
queue_instagram: ready
queue_at: 2026-08-11
```

4. 락 해제(`rm -rf "$LOCK"`)
5. 보고 — 주제·slug·총길이·티어·비용·찍은 큐·미해결 지적

**사람 호출 모드**는 여기서 AskUserQuestion 으로 결과를 제시하고 큐 마커를 찍을지
묻는다(경로·총길이·비용·커버 제목·핵심 수치). 무인 모드는 묻지 않는다 — 플랜이
이미 승인서다.

## 함정

- **`queue_*` 를 찍기 전에 `status` 부터 쓰지 않는다.** 순서가 뒤집히면 게이트에
  떨어진 영상이 `status: produced` 만으로 다른 루프에 보일 수 있다.
- **락 해제를 빼먹으면 채널이 60분 얼어붙는다.** 중단 경로마다 확인한다.
- **`serp_*` 를 조사 루프에서 반복 호출하지 않는다** — 월 250회는 자동 저작
  몇 편이면 소진된다.
- **승급이 습관이 되지 않게 한다.** 지표가 좋아지면 다음 편은 다시 경제 기본이다.
- **주제 풀이 비면 멈춘다.** 자동화가 소재를 발명하기 시작하면 그때부터
  사실 검증이 무의미해진다.

## Additional Resources

### Reference Files

- **`references/cost-tiers.md`** — 모델 사다리·승급 조건·자율 금지 티어·상한 판정 (정본)
- **`references/prices.tsv`** — 생성 툴 단가 SoT (근거등급·출처 포함, `?` 는 미확인)
- **`references/cost-report.sh`** — tally × 단가 → 리포트. 사전 견적과 사후 리포트에 같은 계산기를 쓴다
- **`references/check-duplicate.py`** — 주제 중복 판정 (기존 전 주제 대비 글자 바이그램 포함도, 임계 0.5 · `--selftest` 픽스처 11쌍)

### 다른 스킬의 계약을 그대로 쓴다

- `../storyboard/references/scenes-schema.md` — scenes.js 데이터 계약
- `../storyboard/references/storyboard-template.md` · `storyboard-html-template.html`
- `../produce/references/pipeline.md` — 빌드 계약·리포트 게이트 판정표·팔린드롬
- `../produce/references/build-reel.sh` — 합성 파이프라인
- `../platform-guide/references/platform-playbook.md` · `korean-style.md` · `check-style.py`
- `../../docs/guides/ai-video-production/index.html` — 하이브리드가 기본인 이유·Veo 하드 스펙·프롬프트 규칙
