# scenes.js 데이터 계약 (SoT)

`data/<카테고리>/<주제>/storyboard/scenes.js` — 스토리보드 승인 후 produce 가
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
| `type` | ✅ | `cover` \| `points` \| `quote` \| `outro` |
| `narration` | ✅(outro 제외) | 세그먼트 배열 `[{tts, sub}, ...]` — 문장 하나 = 세그먼트 하나 = reveal 하나 |
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
  title: "7월 24일부터 **이렇게** 바뀝니다",   // 74px (rg1)
  bullets: [                                  // 3~4개 권장 (rg2, rg3, …)
    { t: "도착 즉시 신고", d: "종전 24시간 → 도착 당일로" },
    { t: "온라인 제출 허용", d: "앱·포털 어디서든" }
  ],
  footnote: "출처: 공안부 시행령 NN/2026",      // 마지막 rg
  narration: [ … ],                            // 1+α세그 — ①제목 도입 + 불릿 세그들
  visual: { bg: "images/scene-2.png", bgPrompt: "…" }
}
```

- **불릿 수 ≠ 문장 수여도 reveal 은 불릿 1개씩** — 불릿 여러 개를 한 문장으로 묶어
  읽는 건 정상이지만, 화면 등장은 produce 의 하위 reveal(`A|B` 표기)로 하나씩 쪼갠다.
- reveal 매핑: rg1=title, rg2..=불릿 순서대로, 마지막 rg=footnote.

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

### outro — 브랜드 클로징 (참조만)

```js
{ type: "outro", title: "매주 이런 정보 올라옵니다", sub: "팔로우하고 이어서 보세요" }
```

- **본편 manifest 에 넣지 않는다** — 공용 `data/<카테고리>/assets/outro.mp4` 를
  빌드가 접합한다. 이 씬은 outro.mp4 최초 생성(build-outro.sh) 시에만 렌더된다.

## 저작 검증 체크리스트 (storyboard 스킬이 승인 요청 전 자가 점검)

- [ ] cover title ≤16자 + 주제어 포함, statLabel ≤18자
- [ ] 씬 수: cover 1 + 본문 4~5 (총 60~75초, 90초 상한)
- [ ] narration 자수 상한 준수, 문장당 8~25자, 전 문장 마침표 종결
- [ ] tts/sub 표기 이원화 완료 (숫자·외래어)
- [ ] 수치 범위 왜곡 없음 (범위는 범위로)
- [ ] 모든 사실 주장이 research.md 의 검증 통과 항목과 일치
- [ ] 쉬운 말 원칙 — 무설명 전문용어·과압축 없음
- [ ] bgPrompt 에 필수 부정 지시 포함, 생성 이미지에 문자·국가 상징 없음
- [ ] THEME 이 profile.md §3 과 일치
