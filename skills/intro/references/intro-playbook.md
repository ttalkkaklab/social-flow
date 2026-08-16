# 채널 인트로 플레이북 — 베스트 프랙티스 SoT

인트로(로고 스팅) 설계·프롬프트·검수 기준의 근거 문서. intro 스킬이 컨셉 설계와
veo 프롬프트를 이 문서에서 가져온다. 근거 출처는 문서 끝.

## 1. 배치 원칙 — 어디에 쓰고, 어디에 쓰면 안 되는가

**쇼트폼 본편 앞에 브랜드 인트로를 붙이지 않는다.** 시청자 이탈의 50~60%가
첫 3초 안에 일어나며, 로고 애니메이션·채널 타이틀 카드는 훅을 밀어내 리텐션을
직접 깎는다. 쇼트폼의 브랜딩은 스타일 일관성(테마 색·자막 톤)과 아웃트로가 담당한다.

인트로 자산의 정당한 용도:

| 용도 | 자산 | 비고 |
|---|---|---|
| 채널 트레일러·프로필 소개 영상 | master | YouTube 채널 페이지·소개 고정 영상 |
| 시리즈 오프너 (본편 도입 결합) | stinger ≤2.5s | 훅 다음에 배치 — 훅보다 앞 금지 |
| 엔딩 브랜드 모먼트 | stinger | outro.mp4 앞 접합 (동일 인코딩 계약) |
| 라이브·프리미어 대기 화면 | master 루프 | — |

**매번 같은 인트로·같은 로고음을 쓴다** — 일관 브랜딩은 신뢰·상기도를 만든다
(2025 조사에서 시청자 78%가 일관 브랜딩 채널을 더 신뢰). 주제마다 재생성하지 않는다.

**기본 용도 (사용자 확정 2026-07-29)**: 본편 영상 **뒤에 접합**하는 브랜드
클로징이다 — 1회 제작 고정 자산이라 목소리·사운드가 그대로 보존되며,
build-reel/build-outro 와 동일 인코딩 계약이라 xfade 접합이 바로 된다.

## 2. 길이·타이밍 계약

- **master (4초 표준 — 사용자 확정 2026-07-29)**: veo **4초 렌더(720p)** + 엔딩
  홀드 0.8s = **4.8초**. 뒤 접합 클로징은 짧을수록 좋다 (로고 스팅 표준 3~7초의
  하단). 4초 제약은 §8.5 실측 노트 참조.
- **롱 버전 (트레일러 전용 옵션)**: 8초 렌더(1080p — 1080p 는 8초 전용) + 홀드,
  `TRIM_START` 로 7초대 권장.
- **stinger**: **≤2.5초** — 소셜 결합용 표준(1~2.5초).
- **엔딩 시퀀스** (build-intro.sh 기본): 채널명 리빌(착지 1.2s 전) → 로고음
  임팩트(착지 0.2s 전) → 실픽셀 락업 크로스페이드(0.6s) → 정지 홀드(0.8s).
- **로고음**: 2~5초 — 임팩트가 캐릭터·로고 착지 프레임과 정렬돼야 한다.

## 3. 컨셉 4종 설계 (HITL 제시용)

veo 호출 전에 **서로 다른 컨셉 4종을 보기로 제시**하고 사용자가 고른다 — 영상
후보를 여러 개 뽑아 고르는 방식은 비용상 금지. 4종은 아래 축의 조합이 겹치지
않게 설계하고, 감정가를 분산한다 (에너지 | 신뢰 | 위트 | 시네마틱).

- **캐릭터 동작**: 채널을 상징하는 시그니처 제스처가 최우선 후보 — 프로필
  캐릭터가 "무엇을 하는 채널인지"를 몸으로 보여준다 (예: 클릭 채널이면 딸깍
  클릭 동작, 실험 채널이면 시약을 섞는 동작).
- **씬 무드**: profile §3 배경 무드 지침 안에서 변주 (미니멀 스튜디오 |
  미니 씬(소품) | 추상 라이트 | 클로즈업 등장).
- **로고음 성격**: 멜로딕 신스 스팅 | 타악 임팩트 | 시그니처 SFX 모티프
  (예: 마우스 클릭음을 음악적으로) — 컨셉의 감정가와 일치시킨다.

각 보기는 라벨 + 씬 시나리오(캐릭터가 몇 초에 무엇을 하는지) + 로고음 서술로
구성한다. 사용자는 절충("A 동작에 C 무드")이나 전체 재설계를 요구할 수 있다.

## 4. 캐릭터 연기 — 모션 설계

인트로의 주인공은 프로필 캐릭터다. 캐릭터가 **등장 → 시그니처 동작 → 정면
정착** 3박으로 연기하고, 마지막 포즈는 락업 카드의 캐릭터 위치·크기로 수렴한다.

| 제스처 유형 | 서술 골격 | 적합 |
|---|---|---|
| **시그니처 동작** | 채널 상징 행동 수행 후 카메라 정면 응시 | 마스코트 (기본값) |
| **등장·인사** | 프레임 밖에서 걸어 들어와 손 인사·목례 | 사람형·마스코트 |
| **심볼 조립** | 기하 파편이 수렴해 심볼 완성 | 엠블럼·추상 로고 |
| **라이트 스윕** | 광선이 쓸고 지나가며 심볼 드러남 | 전 유형 (가장 안전) |
| **잉크/빛 번짐** | accent 빛이 번지며 실루엣 형성 | 일러스트 로고 |

공통: 카메라는 `slow dolly in` 또는 `static` — 흔들림·빠른 컷은 소형 화면에서
멀미를 만든다. **veo 는 `push in` 을 모른다** — Vertex 프롬프트 가이드 전문에 `push`
라는 낱말이 0건이고, 다가가는 무브의 벤더 이름이 `dolly in` 이다(카메라 조사 §02).
모션은 **감속 이징**으로 서술하고, 마지막 1초는 거의 정지시킨다.
이펙트 스택(입자+글리치+연기 동시)은 저가형으로 보이는 첫째 원인 — **모션
아이디어는 하나만**.

**카메라 높이는 눈높이다.** 캐릭터를 올려다보거나 내려다보면 크기·힘 인상은 바뀌어도
호감도는 안 움직이고(p>.05), 짧은 정면 클로즈업에서는 눈높이가 가장 신뢰받는다
(p=.007). 인트로는 채널의 첫인사라 신뢰 쪽이 남는 축이다 — 로우앵글은 캐릭터를
일부러 크게 세울 때만 쓴다.

## 5. L.O.G.O. 프롬프트 공식 (veo 골격)

생성 모델은 "cinematic", "premium" 같은 모호어에 반응해 **캐릭터·로고를
재설계해 버린다**. 프롬프트는 항상 `브랜드 보호 → 단일 모션 → 사운드 → 출력
스펙` 순서로:

- **L — Logo rules (보존)**: "Keep the mascot exactly on-model as shown in the
  reference/final frame — same shape, proportions, colors. Do not redraw or
  restyle."
- **O — Occasion (용도)**: "9:16 vertical channel intro sting for social media."
- **G — Gesture (단일 모션)**: §4 에서 **하나만**. 시간 배분을 명시한다
  ("first 4 seconds …, then settles …").
- **O — Output (스펙)**: "Slow confident easing, ends settled in the exact pose
  and framing of the final frame, last second nearly static."

**부정 지시는 프롬프트 본문이 아니라 `negativePrompt` 인자로 보낸다.** 문법은
명사·형용사구를 콤마로 나열하는 것이고, "no ~" 같은 지시문을 쓰지 않는다 —
Veo 프롬프트 가이드가 그 형태를 not recommended 로 적고, 본문에 배제할 명사를
적으면 그 명사가 오히려 그려진다(로컬 이미지 실측 4장 전패).

상비 값: **`text, letters, captions, subtitles, watermark, lens flare, particle
effects, glitch effects`** (채널명은 결정적 플레이트가 담당 — §6) + profile §3
금지 소재를 명사구로 옮겨 붙인다. 음악도 여기다 — `music, background score` 를
넣는다. 음악 성분은 로고음(§7)과 충돌한다. 오디오는 프롬프트 본문에 모션 SFX
만 서술한다.

근거: `docs/research/2026-08-15-veo-seedance-prompting/` §03.

## 6. 채널명 리빌 — 텍스트는 결정적 렌더만

인트로는 "무슨 채널인지"를 3초 안에 알려야 한다 — **채널명 + 태그라인(콘텐츠
약속 압축, 2줄 이내)** 이 반드시 화면에 나온다. 단, 텍스트를 생성 모델에
맡기면 오탈자·유사문자(P0)가 나온다. 계약:

1. 텍스트는 `lockup-template.html` → 헤드리스 캡처로 렌더한다 (풀 락업 +
   투명 텍스트 플레이트). veo 호출에는 항상 `negativePrompt` 에 `text` 를 넣는다.
2. build-intro.sh 가 텍스트 플레이트를 착지 직전(`TEXT_AT`)에 슬라이드 인 —
   캐릭터 연기를 가리지 않으면서 이름이 먼저 읽히고, 락업으로 이어진다.
3. 세 캡처 모드(full/text/char)의 좌표는 동일 — 플레이트와 락업이 픽셀 일치해
   전환이 이음매 없이 보인다.

## 7. 로고음 (소닉 로고) — 채널 자산

구조는 3박: **라이즈(rise) → 임팩트(logo hit) → 테일(decay)**, 2~5초.
`music_generate_clip`(Lyria)으로 생성하며 프롬프트에 컨셉 감정가를 반영한다:

> "A 2.5-second sonic logo: soft rising synth swell, one warm confident
> impact, short airy decay. Clean, modern, memorable. No vocals."

- **한번 확정한 로고음은 채널 자산으로 고정·재사용한다** (`<slug>-sonic-logo.wav`)
  — 소닉 브랜딩의 가치는 반복에서 나온다. 재생성은 사용자가 명시할 때만.
- 믹스는 build-intro.sh 가 담당: 임팩트를 착지 프레임에 정렬(`SONIC_AT`),
  veo 네이티브 SFX 는 사이드체인 덕킹으로 밑에 깐다.
- 최종 라우드니스 **-14 LUFS / TP -1.0** (본편·아웃트로와 동일 계약 — 접합 시
  음량 점프 방지).

## 8. 마지막 프레임 계약 (가장 중요한 규칙)

**최종 프레임은 실제 브랜드 락업과 정확히 일치해야 한다.** 생성 모델이 그린
근사치로 끝나는 인트로는 브랜드 자산 훼손이다. 3중 장치:

1. `veo_img2video` 의 `lastImagePath` 에 **char 카드**(텍스트 없는 캐릭터
   락업)를 넣어 모션이 최종 포즈로 수렴하게 한다.
2. build-intro.sh 가 엔딩 `LOCKUP_XF`(0.6s)에 **실픽셀 풀 락업을 크로스페이드**
   로 덮어 생성 잔여 왜곡을 제거한다.
3. `HOLD`(0.8s) 정지 홀드로 각인 여운을 만든다.

로고·캐릭터·텍스트 픽셀은 어떤 단계에서도 생성 모델의 출력을 최종본으로 쓰지
않는다 — 락업은 항상 HTML 캡처 합성본이다.

## 8.5 실측 노트 (2026-07-29 딸깍랩 E2E)

- **네이티브 발화(veo 오디오 대사)는 최소 표기만 통과** — `The mascot says: "채널명"`
  형식은 생성되지만, 발화에 스타일 수식(cheerfully, announcer voice, rising tone)을
  붙이면 오디오 안전 필터로 실패한다. 목소리는 생성마다 달라 **소닉 브랜딩 고정이
  불가**하고, 발화 시점도 모델이 정한다(실측: 4초 렌더에서 발화가 0.4~2.1s 에 몰리고
  텍스트 리빌 구간은 무음). 단, 인트로는 1회 제작·고정 자산이므로(§1 기본 용도)
  **한 번 잘 뽑힌 네이티브 발화를 그대로 자산화하는 것도 유효**하다 — TTS 분리의
  남는 우위는 텍스트 리빌과의 타이밍 정렬·리테이크 선택이다. 사용자와 함께
  들어보고 결정한다.
- **durationSeconds=4 는 720p 전용**(1080p 는 8초 전용)이고 **lastImagePath
  보간이 거부된다**(400 "use case not supported"). 4초 렌더는 첫 프레임 =
  char-card + 프롬프트에 "the framing and crop never change" 를 넣고, 엔딩 정합은
  락업 크로스페이드가 보증한다. 720p 원본은 빌드가 1080×1920 으로 업스케일한다.
- **TTS 늘임 발음은 위험** — "따알~~깍" 지시는 음절이 분리·과신장되거나(깍이 0.1초
  버스트로 떨어져 나감) 500 오류가 난다. 자연 속도로 뽑아 무음만 압축하는 쪽이
  안정적이며, 무음 압축 시 **모든 발화 버스트를 보존**했는지 silencedetect 로
  확인한다. 늘임이 과하면 해당 세그먼트만 atempo(≤1.3)로 조인다.
- **ffmpeg 트림 함정 (스팅 무음 사고 원인)** — `-i` 뒤의 출력측 `-ss` 는 `-af`
  **이후에** 적용된다: `afade=t=out:st=1.9` 가 원본 타임라인 기준으로 먼저 걸려
  뒷구간이 통째로 무음이 된 뒤 잘린다. 원본 일부를 페이드와 함께 절단할 때는
  반드시 **`-ss` 를 `-i` 앞(입력 시킹)** 에 둔다. 프리믹스 산출물은 게이트 전에
  volumedetect 로 임팩트·홀드 구간 에너지를 계측해 확인한다 (스펙트로그램까지
  간 것은 리뷰어였다 — 빌드 단계에서 먼저 잡을 것).

## 9. 흔한 실패와 교정

| 증상 | 교정 |
|---|---|
| 캐릭터 오프모델 (형태·색 변형) | L 규칙 강화, veo_reference 로 전환해 참조 1~3장 제공 |
| 글자·유사문자 출현 | `negativePrompt` 에 `text, letters, captions, subtitles` 를 넣고 재생성 (본문에 "no text" 를 적으면 역효과) |
| 이펙트 범벅 | 제스처 1개만 남기고 삭제 + `negativePrompt` 에 `particles, smoke, sparks` |
| 모션이 끝까지 부산함 | "last second nearly static, settles into the final frame pose" |
| 도입 1~2초 정체 | 재생성 대신 `TRIM_START` 로 컷 (후처리가 더 싸다) |
| 로고음-착지 어긋남 | 재생성 대신 `SONIC_AT` 조정 (후처리가 더 싸다) |
| 최종 포즈가 락업과 동떨어짐 | lastImagePath 확인, "ends in the exact pose of the final frame" 재강조 |

## 출처

- [Renderforest — How Long Should a YouTube Intro Be](https://www.renderforest.com/blog/how-long-should-youtube-intro-be) · [Intro Video Length by Platform](https://www.renderforest.com/blog/intro-video-length-by-platform) — 길이 표준(1~5초, 3~5초 안전 기본), 쇼츠는 전통 인트로 배제
- [Renderforest — AI Logo Animation Prompts](https://www.renderforest.com/blog/ai-logo-animation-prompts) — L.O.G.O. 공식·단일 모션·최종 프레임 일치 규칙
- [Wheelhaus Media — All about logo stings](https://www.wheelhaus.media/blog/all-about-logo-stings) · [Motion Array — Logo Stings](https://motionarray.com/learn/video-effects/logo-stings/) — 로고 스팅 5~10초 상한·모바일 최적화·사운드는 Sonic ID
- [OpusClip — Ideal YouTube Shorts Length & Format](https://www.opus.pro/blog/ideal-youtube-shorts-length-format-retention) · [Virvid — First 3 Seconds](https://virvid.ai/blog/first-3-seconds-hook-faceless-shorts-2026) — 첫 3초 이탈 50~60%, 브랜딩은 스타일로
- [InfluenceFlow — YouTube Channel Branding 2026](https://influenceflow.io/resources/youtube-channel-branding-best-practices-complete-2026-guide-for-creators/) — 일관 브랜딩 신뢰도(78%)
- [Voices — Sonic Logos Master Class](https://www.voices.com/blog/sonic-logos/) · [ZillionDesigns — Sonic Logos](https://www.zilliondesigns.com/blog/sonic-logo-and-the-sound-in-branding/) — 사운드 로고 2~5초·브랜드 속성 반영
