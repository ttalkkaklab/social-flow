# scenes.js 데이터 계약 (SoT)

`data/<채널>/<주제>/storyboard/scenes.js` — 스토리보드 승인 후 produce 가
소비하는 유일한 데이터 원천. `video-template.html` 이 `<script src="./scenes.js">`
로 로드한다.

## 전체 구조

```js
// approved: 2026-07-29        ← storyboard 스킬이 HITL 승인 시 기록
window.THEME = {
  accent:  "#5b8cff",          // 강조 그라데이션 시작 — profile.md §3 그대로
  accent2: "#a05bff",          // 강조 그라데이션 끝
  ink:     "#0b1020",          // 베이스 다크 (배경·자막 아웃라인)
  brand:   "채널 이름"          // 아웃트로 브랜드 표기
};
window.SCENES = [ /* 씬 배열 — 아래 타입별 계약 */ ];
```

## 씬 공통 필드

| 필드 | 필수 | 설명 |
|---|---|---|
| `type` | ✅ | `cover` \| `points` \| `quote` \| `broll` \| `outro` |
| `narration` | ✅(`broll`·`outro` 제외) | 세그먼트 배열 `[{tts, sub}, ...]` — 문장 하나 = 세그먼트 하나 = reveal 하나 |
| `visual` | ✅ | 비주얼 계획 객체 (아래) |
| `duration` | 권장 | 목표 초 — 나레이션 자수/4.5 로 추정, 13초 상한 |

### narration 세그먼트

```js
narration: [
  { tts: "사천칠백만 동이 기준입니다.", sub: "4,700만 동이 기준입니다." },
  { tts: "안 내면 과태료가 붙습니다.",  sub: "안 내면 과태료가 붙습니다." }
]
```

- `tts` — 한글 발음 표기 (숫자·외래어를 소리 나는 대로: "4,700만"→"사천칠백만", "eTax"→"이택스")
- `sub` — 자막 원표기 (숫자·고유명사 원형 유지)
- `img`·`imgPrompt` (선택) — **대사별 삽화 모드**: 세그먼트마다 삽화 1장을 붙일 때
  경로와 생성 프롬프트(장면 내용부)를 적는다. storyboard.html 렌더러가 이 필드를
  감지하면 나레이션을 표 대신 왼쪽 그림·오른쪽 대사 행으로 그린다.
  produce 는 캡처 단계에서 소비한다 — reveal 상태마다 그 대사의 `img` 를 `&bg=` 로
  넘기고 흰 배경 라인아트면 `&light=1`(라이트 모드)을 켠다 (produce SKILL §4 삽화
  모드 절차). 커버용 삽화는 캐릭터를 하단 1/3 에 두는 구도로 생성한다(라이트 모드가
  커버 텍스트를 상단에 앉힌다). `visual.bg` 는 대표 삽화(1행)로 유지 — 커버 정지
  이미지·썸네일의 원천이다. 첫 사례: 2026-08-12 드롭쉬핑 스토리보드.
- 문장은 마침표로 분명히 끊는다 — 빌드의 문장 경계 검출(silencedetect)이 마침표
  무음을 찾는다. 쉼표 나열 장문은 경계가 안 잡힌다.
- 자수 상한(공백·구두점 제외): cover 총 ≤40자, points/quote 총 ≤50자.
  문장당 8~25자 — 8자 미만은 reveal 창이 0.9초 미만으로 좁아진다.
- 마지막 문장은 특히 짧게(전환 직전 여운).

### visual 계획

```js
visual: {
  bg: "images/scene-1.png",          // 생성 배경 (storyboard 단계 산출)
  bgPrompt: "…",                     // 생성에 쓴 프롬프트 (재생성·감사용 기록)
  motion: "very slow push-in",       // cover 만: veo img2video 카메라 지시
  clip: null                         // quote 만: 발화 클립 계획 (아래)
}
```

## 타입별 계약

### cover — 첫 3초가 전부

```js
{
  type: "cover",
  kicker: "베트남 생활 · 행정",              // 상단 시리즈 라벨 (rg0)
  title: "임시거주 신고, 안 하면 **과태료**",  // 16자 이내 + 주제어 필수 (rg1)
  stat: "500만₫",                           // 히어로 수치 (rg2)
  statLabel: "미신고 과태료 상한",            // 18자 이내 한정어
  narration: [ {tts,sub}, {tts,sub} ],      // 2세그 — ①훅 ②히어로 수치
  visual: { bg: "images/scene-1.png", bgPrompt: "…", motion: "very slow push-in" }
}
```

- title: 자극 + **무엇의 이야기인지**(주제 명사)가 반드시 안에. `**…**` 는 그라데이션 칩.
- reveal 매핑: rg1=title ← 세그①, rg2=stat ← 세그②.

### points — 한 화면에 한 메시지

```js
{
  type: "points",
  title: "7월 24일부터 **이렇게** 바뀝니다",   // 60px 상단 고정 (rg1)
  bullets: [                                  // 3~4개 권장 — 화면에는 한 번에 하나만 (캡션 스왑)
    { t: "도착 즉시 신고", d: "종전 24시간 → 도착 당일로" },
    { t: "온라인 제출 허용", d: "앱·포털 어디서든" }
  ],
  footnote: "출처: 공안부 시행령 NN/2026",      // 제목과 함께 상시 노출 (rg1)
  narration: [ … ],                            // 1+α세그 — ①제목 도입 + 불릿 세그들
  visual: { bg: "images/scene-2.png", bgPrompt: "…" }
}
```

- **사진이 주인공이다**(produce 절대 규칙 14) — 불릿이 리스트로 쌓이는 슬라이드가
  아니라, 상단 블록에 제목·출처와 **활성 캡션 하나**만 얹힌다. 캡션은 한 줄이 좋다 —
  `t` ≤ 12자, `d` ≤ 22자 권장. 상세는 나레이션·자막이 말한다.
- **불릿 수 ≠ 문장 수여도 reveal 은 불릿 1개씩** — 불릿 여러 개를 한 문장으로 묶어
  읽는 건 정상이지만, 화면 등장은 produce 의 하위 reveal(`A|B` 표기)로 하나씩 쪼갠다.
- reveal 매핑: rg1=title+footnote, rg2..=캡션 순서대로 — 전환이 교체(스왑)로
  렌더된다. 상태 수 = 1(배경) + 1(제목·출처) + 캡션 수.

### quote — 발화/인용

```js
{
  type: "quote",
  speaker: "민지",
  role: "3년차 주재원 · AI",       // AI 표기 시 강조 렌더 — AI 명의 은폐 금지
  text: "저도 작년에 놓쳐서 벌금 냈어요.",
  narration: [ {tts,sub}, {tts,sub} ],   // 2세그 — 둘 다 같은 오버레이 사용
  visual: {
    bg: null,
    clip: {                               // 발화 클립 계획 (produce 가 생성) — 없으면 정지 인용 카드
      avatar: "…아바타 이미지 경로 또는 null",
      prompt: "…veo_reference 프롬프트 초안 (배경은 THEME 다크로 통일)"
    }
  }
}
```

- alpha 캡처 시 상단 서명(이름+역할)만 렌더 — 인용문은 나레이션·자막이 말한다.
- 실존 인물의 얼굴·음성 합성 금지. 캐릭터는 실사로 오인되지 않는 스타일만.

### broll — 생성 영상 구간 (참조만)

```js
{
  type: "broll",
  after: 0,                          // 이 씬 인덱스 뒤에 삽입 (보통 커버 = 0)
  narration: [],                     // 비어 있어야 한다 — produce 절대 규칙 9
  duration: 4,                       // ★사용 길이★ (기본 4, 근거 있으면 6·8) — 주석에 근거를 적는다
                                     // 생성은 1080p·8초 고정(API 제약) — produce 가 앞부분만 잘라 쓴다
                                     // 팔린드롬으로 늘리지 않는다(소리가 거꾸로 재생)
  visual: {
    src: "images/scene-1.png",       // 커버 배경과 같은 파일이어야 한다 — 절대 규칙 8·12
    clip: ".work/broll/cover-broll-mixed.mp4",   // 트림+loudnorm+BGM 믹스본 (원본 8초는 cover-broll.mp4 로 보관)
    motion: "very slow push-in, nearly static camera",
    audio: "quiet studio room tone with a faint fabric rustle, no music, no speech"
  }
}
```

- **본편 manifest 에 넣지 않는다** — 빌드 후 `../produce/references/splice-clip.sh` 가
  `after` 씬 종료 시각에 접합하고 뒤 자막을 실측 삽입 길이만큼 민다.
- **배열 끝에 둔다** (`outro` 와 같은 취급). 재생 순서상 커버 다음이지만 배열 중간에
  끼우면 뒤 씬들의 인덱스가 밀려 `frame.html?i=<n>` 캡처 URL 과 `cards.tsv`/`segs.tsv`
  의 idx 가 전부 어긋난다 — 이미 찍은 상태 PNG 를 다시 찍어야 한다.
  재생 위치는 배열 순서가 아니라 `after` 가 정한다.
- **`narration` 이 비어 있어야 한다.** 이 구간은 영상이 가진 소리를 쓴다 — TTS 를 얹으면
  두 소리가 싸운다(produce 절대 규칙 9).
- **커버에 쓰지 않는다.** Veo 는 한글을 못 쓰므로 훅 제목·히어로 수치가 있는 화면은
  코드 렌더로 만든다(절대 규칙 10). `after: 0` — 커버 **뒤**다.
- `src` 는 **커버의 `visual.bg` 와 같은 파일**이다(절대 규칙 12) — 사람이 있는 실사
  인물 장면(기본 한국 여성, profile §3 타깃 기준)을 `quality: "high"` 로 만든 PNG.
  이미 생성해 `storyboard/images/` 에 보관한 것이어야 하고, 재현의 기준점이므로
  지우지 않는다.
- **생성 호출 전에 이 씬과 커버 bgPrompt 를 content-reviewer 계획 모드로 검증받는다**
  (절대 규칙 13) — `PLAN_REVIEW: PASS` 없이 이미지·영상 생성(image_local_generate·gpt_image high·veo)을 부르지 않는다.

### outro — 브랜드 클로징 (참조만)

```js
{ type: "outro", title: "매주 이런 정보 올라옵니다", sub: "팔로우하고 이어서 보세요" }
```

- **본편 manifest 에 넣지 않는다** — 공용 `data/<채널>/assets/outro.mp4` 를
  빌드가 접합한다. 이 씬은 outro.mp4 최초 생성(build-outro.sh) 시에만 렌더된다.

## 저작 검증 체크리스트 (storyboard 스킬이 승인 요청 전 자가 점검)

- [ ] cover title ≤16자 + 주제어 포함, statLabel ≤18자
- [ ] 씬 수: cover 1 + 본문 4~5 (총 60~75초, 90초 상한)
- [ ] narration 자수 상한 준수, 문장당 8~25자, 전 문장 마침표 종결
- [ ] tts/sub 표기 이원화 완료 (숫자·외래어)
- [ ] 수치 범위 왜곡 없음 (범위는 범위로)
- [ ] 모든 사실 주장이 research.md 의 검증 통과 항목과 일치
- [ ] 쉬운 말 원칙 — 무설명 전문용어·과압축 없음
- [ ] AI 티 없음 — 세 표면 모두 exit 0 (S1 잔존 0):
      ```bash
      set -o pipefail        # 없으면 $? 가 검사기 것이 아니게 된다
      PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
      for S in narration subtitle screen; do
        node $PG/extract-text.js ./scenes.js $S | python3 $PG/check-style.py --surface $S -
        echo "[$S] gate_exit=$?"
      done
      ```
      규칙·처방은 platform-guide `references/korean-style.md`. exit 3 은 통과가 아니라
      게이트 미실행이다. 여기서 잡으면 produce §5 에서 재작업이 없다
- [ ] bgPrompt 에 필수 부정 지시 포함, 생성 이미지에 문자·국가 상징 없음
- [ ] points 배경: 주제 실사 컷 + 내용 축이 바뀔 때 컷 교체(전 씬 한 장 돌려쓰기
      금지 — produce 절대 규칙 14), 캡션 `t` ≤ 12자 · `d` ≤ 22자
- [ ] THEME 이 profile.md §3 과 일치
- [ ] `broll` 씬을 뒀다면 — `narration: []` · `after` 가 커버(0) 뒤 · `src` 가 커버
      `visual.bg` 와 같은 실존 PNG · `duration`(사용 길이)이 8 이하이고 근거 주석이
      있음 (팔린드롬으로 늘리지 않는다) · content-reviewer 계획 모드 PASS 기록
