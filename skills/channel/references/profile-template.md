# 채널 프로파일 템플릿

`data/<slug>/profile.md` 로 복사해 값을 채운다. 모든 섹션이 필수다 —
storyboard/produce/publish 스킬이 이 구조를 그대로 파싱해 읽는다.

```markdown
---
name: <채널 표시명>
slug: <kebab-slug>
status: active            # active | archived
created: <YYYY-MM-DD>
---

# <채널 표시명>

## 1. 정체성

- **주제 영역**: <이 채널이 다루는 범위 한 문장 — storyboard·autoproduce 가 새 주제를
  이 축과 대조하므로(축 밖이면 확인·폐기) 걸러낼 수 있는 폭으로 적는다.
  "재테크" 보다 "한국 직장인의 절세·연말정산 실무">
- **타깃 시청자**: <누가, 어떤 순간에 보는가 — 예: 베트남 주재원과 가족, 출퇴근 스크롤 중>
- **콘텐츠 약속**: <매 영상이 지키는 가치 — 예: 60초 안에 실무에 바로 쓰는 정보 1개>
- **로고 자산**: `data/<slug>/assets/branding/<slug>-logo-master-1024.png` —
  없으면 /social-flow:branding 으로 생성 (플랫폼별 리사이즈 `-youtube-800` ·
  `-instagram-320` · `-192` 자동 파생)

## 2. 톤 & 보이스

- **문체**: <존댓말 설명형 | 반말 톡톡형 | 다큐 나레이션형 | ...>
- **나레이션 화자 성격**: <예: 차분한 뉴스 브리핑 앵커>
- **TTS 보이스 (고정 — 변경 금지)**:
  - 엔진: `<local | gemini>` — 나레이션 기본은 `local`(비용 0·실시간 6.3배),
    감정 연기가 채널 정체성인 경우만 `gemini`
  - local 일 때 → voice: `<F1~F5 | M1~M5>` · lang: `ko` · speed: `<0.7~2.0, 기본 1.05>`
  - gemini 일 때 → voiceName: `<Gemini 보이스명>` ·
    stylePrompt: `<영문 스타일 지시 — 한 글자도 바꾸지 않고 재사용>`
  - 목표 발화 속도: <자/초, 기본 4.5>
- **쉬운 말 원칙**: 무설명 전문용어·직역어·주어 없는 과압축 금지. 용어가 꼭 필요하면
  쉬운 말을 앞세우고 첫 등장에서만 괄호 병기. (화면 텍스트·나레이션·자막·캡션 전부)
- **금칙**: <채널별 금지 표현·소재>

## 3. 비주얼 테마

video-template.html 의 THEME 계약 — scenes.js 에 그대로 들어간다:

```json
{
  "accent": "#5b8cff",
  "accent2": "#a05bff",
  "ink": "#0b1020",
  "brand": "<아웃트로에 표기할 브랜드/채널명>"
}
```

- **배경 무드 프롬프트 지침**: <이미지 생성 프롬프트에 항상 붙일 무드 서술 —
  예: "deep indigo and electric blue color grade, cinematic, moody, lower third fading into darkness">
- **배경 필수 부정 지시**: "no text, no logos, no signage, no readable characters,
  face not visible, no flags, no national emblems, no maps, no government buildings"
- **금지 소재**: <실존 인물·특정 장소 등 채널별 추가 금지>

## 4. 게시 플랫폼

| 플랫폼 | 사용 | 비고 |
|---|---|---|
| threads | ✅/❌ | 영상 불가 — 반말 본문 + 영상 링크(IG 릴스) 한 건, 첨부 이미지 없음 |
| instagram | ✅/❌ | 릴스 — 공개 HTTPS 호스팅 필요 |
| facebook | ✅/❌ | 일반 영상 게시 (릴스 아님) |
| youtube | ✅/❌ | 쇼츠 — 로컬 업로드, 업로드 쿼터 일 100회 |

- **플랫폼별 시그니처**: <해시태그 세트·CTA 문구 — 플랫폼 문법 한도 내에서>
- **미디어 공개 호스팅**: <IG/FB 용 공개 HTTPS 업로드 방법 — 없으면 "미정" 이라
  쓰고 publish 시점에 확인. Threads 는 첨부 미디어가 없어 호스팅이 필요 없다>

## 5. 사실 검증 정책

- **조사 필수 여부**: <필수(정보성) | 생략(창작·일상)>
- **선호 검색 도구**: naver_search(한국어 소재 1차) → WebSearch(범용) → serp_*(정밀·해외)
- **교차 검증 규칙**: 시효성 값(가격·세율·기한·시행일)은 독립 출처 2개 이상,
  검증 실패 주장은 본문에서 제외.

## 6. 인트로 · 아웃트로

- **인트로 자산 (선택)**: `data/<slug>/assets/intro/<slug>-intro-master.mp4`
  (트레일러·소개 영상용) · `<slug>-intro-stinger.mp4`(결합용 ≤2.5초) ·
  `<slug>-sonic-logo.wav`(로고음 — 전 영상 공용) — /social-flow:intro 로 생성.
  기본 용도는 **본편 뒤 접합**(브랜드 클로징 — 1회 제작 고정 자산).
  **쇼트폼 본편 앞에는 붙이지 않는다** (첫 3초 훅 원칙 — 용도는 intro-playbook.md §1)
- **문구**: <브랜드 클로징 대본 — 예: "이런 정보, 매주 올라옵니다. 팔로우하고 이어서 보세요.">
- **자산 경로**: `data/<slug>/assets/outro/default.mp4` — 없으면 produce 첫 회에
  build-outro.sh 로 생성 후 여기 저장 (주제마다 재생성하지 않는다).
  플랫폼마다 문구가 다르면 `outro/youtube.mp4` · `outro/instagram.mp4` 를 두고
  catalog 에 id 를 올린다. 옛 `assets/outro.mp4` 도 resolve-asset 이 찾는다.
- **카탈로그**: `data/<slug>/assets/catalog.md` — 공용물의 kind+id 표.
  규약은 `references/assets-catalog-template.md`.

## 7. 운영 규칙

- **주제 slug 규칙**: <예: YYYYMMDD-주제어 | 시리즈명-NN>
- **시리즈**: <운영 중인 시리즈명·넘버링 — 없으면 "없음">
```

## Gemini TTS 보이스 예시 (톤별)

| 톤 | voiceName | stylePrompt 예시 |
|---|---|---|
| 차분한 뉴스 브리핑 | Charon | Korean news brief narrator. Calm, informative, steady moderate pace, clear articulation, neutral broadcast tone. |
| 따뜻한 브랜드 내레이터 | Sulafat | Korean, warm brand narrator. Inviting, confident, gentle close, moderate pace. |
| 밝은 크리에이터 | Leda | Korean, friendly young content creator. Bright but clear, engaging, moderate pace, not overly excited. |
| 정확한 전문가 | Erinome | Korean, precise professional. Calm, clear, professional, measured moderate pace. |
| 친근한 실무자 | Achird | Korean, hands-on field practitioner. Friendly, direct, practical, moderate pace. |
| 무게감 있는 시니어 | Sadaltager | Korean, authoritative senior advisor. Knowledgeable, deliberate, calm weight, moderate pace. |

- stylePrompt 는 **"moderate pace" 로 통일** — 속도의 결정권은 빌드의 atempo 정규화가 갖는다.
- 전체 보이스 목록은 `mcp__social-flow__tts_list_voices` 로 조회할 수 있다.

## 로컬 TTS 보이스 (Supertonic)

`F1`~`F5`(여성) · `M1`~`M5`(남성) 10종. 공급사가 공개한 성격 라벨이 없어서 위와 같은
톤 표를 만들 수 없다 — **같은 문장을 두세 보이스로 뽑아 듣고 고른다.** 채널 하나에
하나를 배정해 고정하면 목소리가 일관되므로, 고정 10종이라는 제약이 실제 운영에서는
불리하지 않다.

시청 방법 — 그 채널의 실제 나레이션 한 문장으로 뽑는다(짧은 인사말로는 결이 안 드러난다):

```
mcp__social-flow__tts_local_generate
  text: "<대표 나레이션 두 문장>"  voice: "F1"  lang: "ko"
  outputPath: "data/<slug>/assets/scratch"  filename: "voice-test-F1.wav"
```

`afplay` 로 재생해 비교하고, 고른 값을 위 §2 에 적는다.

스타일 지시 인자가 없으므로 톤은 **문장 자체로** 만든다 — 문장을 짧게 끊고 마침표를
제대로 찍으면 낭독 호흡이 안정된다.
