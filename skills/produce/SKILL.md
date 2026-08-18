---
name: produce
description: >
  This skill should be used when the user asks to "영상 만들어", "콘텐츠 제작",
  "produce the video", "플랫폼별 콘텐츠 만들어", or after a storyboard is approved.
  Converts the approved scenes.js under data/<channel>/episodes/<topic>/storyboard/ into a
  narrated 9:16 video (1080x1920/30fps — generated backgrounds, TTS narration, BGM
  with ducking, kinetic subtitles, brand outro) plus per-platform text (Threads,
  Instagram, Facebook, YouTube) under data/<channel>/episodes/<topic>/output/, verified on a
  phone viewport before the publish step. When recording/alignment.json exists
  (storyboard-first shooting flow), it instead edits the user's screen recording
  into the 9:16 video (cut per scene, focus crop, title overlays, burned subtitles,
  BGM ducking) via build-screencast.sh.
argument-hint: "<채널> <주제> [플랫폼CSV|auto]"
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "AskUserQuestion", "Agent", "mcp__social-flow__tts_generate", "mcp__social-flow__tts_local_generate", "mcp__social-flow__tts_list_voices", "mcp__social-flow__music_generate", "mcp__social-flow__image_local_generate", "mcp__social-flow__gpt_image_text2img", "mcp__social-flow__veo_img2video", "mcp__social-flow__veo_reference", "mcp__social-flow__seedance_img2video", "mcp__social-flow__seedance_reference", "mcp__plugin_astra-methodology_chrome-devtools__new_page", "mcp__plugin_astra-methodology_chrome-devtools__navigate_page", "mcp__plugin_astra-methodology_chrome-devtools__emulate", "mcp__plugin_astra-methodology_chrome-devtools__take_screenshot", "mcp__plugin_astra-methodology_chrome-devtools__evaluate_script", "mcp__plugin_astra-methodology_chrome-devtools__close_page"]
---

# 플랫폼별 콘텐츠 제작 — data/[채널]/episodes/[주제]/output/

승인된 스토리보드(`storyboard/scenes.js`)를 9:16 나레이션 영상과 플랫폼별 텍스트로
변환한다. **scenes.js 가 유일한 데이터 원천** — 영상 화면·나레이션·자막·캡션이
전부 여기서 파생된다.

```
data/<채널>/episodes/<주제>/
├── storyboard/          # 입력 (approved 상태여야 함)
├── .work/               # 중간 산출물 (gitignore — cards/ broll/ pcm/ manifest)
└── output/
    ├── video/           # video.mp4(클린) · video-sub.mp4(번인) · subs.srt · cover.jpg · build-report.txt
    ├── threads/post.md  # 반말 본문 + 마지막 줄 영상 링크 (첨부 이미지 없음)
    ├── instagram/caption.md
    ├── facebook/post.md
    └── youtube/meta.md  # title · description · tags · thumbnail
```

## 절대 규칙

1. **사실 왜곡 금지** — 나레이션·캡션은 scenes.js 에 이미 있는 사실의 재구성만.
   범위를 상한 하나로 줄이지 않고, 수치를 새로 만들지 않는다.
2. **크로스포스팅 복붙 금지** — "사실은 공유하되 문장은 공유하지 않는다."
   플랫폼마다 어체·종결·정보 밀도를 다시 설계한다 (platform-guide 플레이북).
3. **쉬운 말** — 화면 텍스트·나레이션·자막·캡션 전부. 소리로만 듣고도 이해돼야 한다.
   **소리가 말한 것을 화면이 다시 쓰지 않는다**(사용자 지시 2026-08-14) — scenes.js 의
   빈 `title`·`bullets` 는 결함이 아니다. 렌더가 빈 칸을 임의로 채우거나 나레이션에서
   캡션을 만들어 넣지 않는다 (scenes-schema §화면 텍스트는 필요할 때만).
4. **AI 티 없는 한국어** — 번역투("~에 대해"·"되어진다")·상투구("결론적으로"·
   "시사하는 바가 크다")·조수 말투("함께 알아볼까요"·"도움이 되셨길")를 쓰지 않는다.
   규칙은 platform-guide `references/korean-style.md`, 판정은 `check-style.py` 가 한다
   — S1 이 남은 텍스트는 게시로 넘기지 않는다.
5. **생성 영상은 무드샷·캐릭터 발화만** — 사건 재연·실존 인물·국가 상징·뉴스 화면
   연출 금지. 카드(정지 텍스트)는 코드 렌더만.
6. **브랜딩은 아웃트로에서만** — 본편에 로고·배지를 넣지 않는다(첫 3초를 브랜드가
   먹으면 스킵 신호).
7. **TTS 보이스 고정** — profile.md §2 의 voiceName·stylePrompt 를 한 글자도 바꾸지
   않는다.
8. **생성 영상은 이미지에서 만든다** — `veo_text2video` 를 쓰지 않는다. 순서는 항상
   `gpt_image_text2img` → PNG 를 `storyboard/images/` 에 보관 → `veo_img2video`.
   이미지가 재현의 기준점이라, 영상이 마음에 안 들면 같은 PNG 로 모션 프롬프트만 바꿔
   다시 돌릴 수 있다. 글에서 바로 만든 영상은 같은 프롬프트로도 매번 다른 장면이 나와
   되돌릴 기준이 없다. **`storyboard/images/*.png` 는 지우지 않는다** — 지우면 그 회차를
   다시 만들 수 없다.
9. **생성 영상이 재생되는 구간에 나레이션을 겹치지 않는다** — 그 구간은 **영상이 가진
   소리**를 쓴다. TTS 를 얹으면 두 소리가 싸우고 생성 영상의 공간감이 합성 음성에 눌린다.
   그 씬은 `narration: []` 이고 자막도 없다(§6 이 자막 타임코드를 그만큼 밀어야 한다).
   **이 규칙은 b-roll 삽입 구간 이야기다** — 모션 배경 씬(scenes-schema §모션 배경,
   `visual.video`)은 빌더가 영상 트랙만 쓰므로 클립의 소리는 버려지고, 나레이션·자막을
   그대로 유지한다.
10. **커버(첫 화면)의 텍스트는 코드 렌더로만 만든다** — **생성 영상**을 커버에 쓰지
   않는다. **Veo 는 한글을 못 쓴다**(사용자 확인 2026-08-11). 커버는 훅 제목·히어로
   수치가 전부인 화면이라 글자가 깨지면 그 회차가 통째로 못 쓰게 된다. 생성 영상은
   **커버 다음 구간**에 무텍스트 b-roll 로 넣는다.
   **실녹화 클립은 예외다**(2026-08-15) — 한글 깨짐이라는 금지 근거가 스크린캐스트에는
   성립하지 않는다. 결과물 실화면(완성 사이트 스크롤·툴 실행 장면)을 커버 **배경**으로
   깔고 제목·수치는 종전대로 코드 렌더 오버레이를 얹는 구성은 허용이고, 첫 프레임에
   움직임이 생겨 훅에 유리하다(스킵률 실측 84.8~93.8% 개선 목표 — Veo 비용 0).
   클립은 사용자 제공 녹화 또는 ingest 산출물이어야 하며 저작권 있는 남의 화면은
   쓰지 않는다.
11. **생성 영상의 소스 이미지에는 사람이 있어야 한다** — 오브제만 놓인 정물을 넣으면
   Veo 가 움직일 대상이 없어 화면이 미묘하게 흔들리다 끝나고, 그 8초가 정지 컷처럼
   보인다. 사람이 있으면 모델이 머리카락 흔들림·고개 돌림·옷 주름 같은 **자연스러운
   움직임**을 만들어 품질이 확 올라간다. 실사 스타일로 만든다.
   - **실존 인물을 쓰지 않는다** — 연예인·공인의 얼굴, 실제 인물 사진을 소스로 넣는 것은
     금지다(초상권·명예). `gpt_image_text2img` 로 만든 **생성 인물**만 쓴다.
   - **인물은 시청자와 같은 인구집단으로** — 기본은 한국 여성이다(사용자 지시 2026-08-11).
     채널 프로파일 §3 이 타깃을 달리 정하면 그쪽을 따른다.
   - **소스 이미지는 `quality: "high"`** 로 만든다. b-roll 소스는 Veo 의
     입력이라 흐린 소스는 흐린 영상이 된다 — 여기서 아끼면 승급 비용이 헛돈이 된다.
   - **채널 주제가 화면 중심이 되는 각도**로 잡는다. 헤어 채널이면 헤어가 주인공이니
     뒤·측면 3/4 각도가 낫다 — 얼굴 정면은 시선을 얼굴로 끌어가고 인물 오인 위험도 커진다.
   - 실사 인물이 나오면 **AI 생성 고지 대상**이다 — YouTube 게시 시
     `containsSyntheticMedia: true`(publish 스킬 계약).
12. **커버 배경 PNG(메타 이미지)는 대충 만들지 않는다** — 커버 프레임이 그대로
   `cover.jpg`(YouTube 썸네일이자 IG·FB 영상의 첫 화면)가 된다. 주제와 무관한
   정물·추상 배경 금지 — 기본은 둘 중 하나다:
   **주제가 한눈에 보이는 실사 인물 장면**(규칙 11 의 인물 계약 그대로), 또는
   **주제 실물**(그 회차가 다루는 결과물 화면·제품 스크린샷 — 개발·툴 채널처럼
   증거가 인물이 아니라 화면인 주제에서. "전문성은 말이 아니라 증거로", 2026-08-15).
   어느 쪽이든 `quality: "high"` 로 만들고, 채널 profile §3 이 화풍을 달리 정하면
   그쪽이 우선이다. 텍스트는 여전히 코드 렌더다(규칙 10) — 이 규칙은
   배경 그림 이야기다.
   **b-roll 소스는 그 b-roll 이 붙는 씬(`after`)의 배경과 같은 파일이다** — 앞 씬이
   정지로 보여 준 사진이 그대로 움직이기 시작하는 전환이 되고, 이미지 1장이 두 역할을
   한다. 도입 b-roll(`after: 0`)이면 그 파일이 곧 커버 배경이다. 본문 b-roll 이면
   그 points 씬 배경인데, **그 장만은 로컬 Z-Image 가 아니라 `gpt_image_text2img`
   (high)로 만든다** — veo 입력이라 흐린 소스는 흐린 영상이 되고, 사람이 없으면
   모델이 움직일 대상을 못 찾는다(규칙 11).
   **한 회차에 영상으로 만드는 씬은 최대 둘이다**(사용자 지시 2026-08-14) —
   b-roll 칸과 모션 배경 씬(`visual.video`)을 **합쳐** 세고 veo 호출도 2회가 상한이다.
   계약은 scenes-schema §모션 배경(합산 상한)이 정본이다.
13. **돈이 나가는 생성은 계획 검증을 통과한 뒤에만** — 커버 배경·b-roll 은 스토리보드에
   계획(소스 프롬프트·모션·사용 길이+근거)이 먼저 있어야 하고, content-reviewer
   **계획 모드**에 위임해 `PLAN_REVIEW: PASS` 를 받은 뒤에만 `gpt_image_text2img`(high)·
   `veo_img2video` 를 호출한다. FAIL 이면 계획을 고쳐 재위임한다 — 나쁜 소스에 veo
   비용을 태우지 않는다.
14. **화면의 주인공은 사진이다 — 슬라이드(PPT) 룩 금지.** 씬 텍스트는 상·하단 밴드
   안에만 산다: points 는 상단 블록(제목 + 캡션 **한 번에 하나** + 출처), cover 는
   하단 블록, 나레이션 내용은 하단 자막이 말한다. 화면 중앙을 덮는 박스·슬래브·
   풀스크린 딤을 만들지 않는다 — 배경 사진이 그대로 보여야 영상이고, 가리면
   슬라이드다(사용자 지적 2026-08-12 "너무 PPT 스럽다"). 스크림은 밴드형만 쓴다
   (video-template 이 씬 타입별로 처리 — cover=하단 밴드, points=상단 밴드).
   **quote 정지 인용 카드만 예외** — 인용문이 화면 중앙에 앉는 씬이라 풀워시를
   유지한다(슬라이드 룩 판정 대상이 아니다).
   사진이 화면 그 자체가 된 만큼, points 배경도 은유 정물이 아니라 **주제 실사
   컷**으로 만들고 내용 축이 바뀌는 지점마다 컷을 바꾼다(한 장 돌려쓰기는 본문
   40여 초를 같은 정지 화면으로 만든다).

## 절차

### 1. 입력 확인

- `storyboard/storyboard.md` frontmatter `status: approved` 확인 — 아니면 중단하고
  `/social-flow:storyboard` 승인부터 안내.
- `data/<채널>/profile.md` 로드 (보이스·테마·플랫폼·아웃트로).
- **소스 판별**: 세 경로다. `window.FORMAT` 과 씬의 `visual.source` 가 정한다.

  | 조건 | 경로 |
  |---|---|
  | `recording/alignment.json` 있음 + 세로 | **촬영 편집** — `references/screencast-pipeline.md` |
  | 촬영 씬(`visual.source==="recording"`)이 섞여 있음 | **섞어 찍기** — 이 문서 그대로 + §3.5 |
  | 그 외 | 생성 (§2~7) |

  **촬영 편집 경로**는 §2~7 대신 `references/screencast-pipeline.md` §편집 절차를
  따른다 (오버레이 캡처 → edit.json → build-screencast.sh — TTS·생성 배경·reveal
  없음, 음성은 사용자 육성). 산출물 이름(reel.mp4·reel-sub.mp4·subs.srt·cover.jpg·
  build-report.txt)이 같으므로 §8~10(폰 검수·플랫폼 텍스트·품질 게이트)은 그대로
  진행한다. 게이트 판정표는 screencast-pipeline.md 의 것을 쓴다.

  **`alignment.json` + 가로는 성립하지 않는다.** `build-screencast.sh` 의 밴드
  상수(BAND_MAX_H 900·BAND_CY 880·BAND_MIN_Y 460)와 배경 합성이 세로 절대 px 라
  가로 캔버스로 못 간다. 이 조합을 만나면 **멈추고** 사용자에게 알린다 — 씬마다
  파일로 나눠 저장하면 섞어 찍기 경로로 갈 수 있다. 그냥 돌리면 12분치를 다 찍은
  뒤 마지막 캔버스 대조에서 죽는다.

  **섞어 찍기**는 촬영 씬과 생성 씬을 한 타임라인에 붙인다 — 빌더는 생성 회차와
  같은 `build-reel.sh` 이고, 촬영 씬만 §3.5 의 준비를 더 거친다. 슬라이드 씬
  (`visual.slide`)과 전 씬 육성 회차(`window.VOICE === "user"`)는 §3.6 을 더 거친다 —
  슬라이드 상태 캡처와 사용자 음성(`voice/s<n>.wav`) 수용이다.
- 작업 디렉토리 준비: `.work/{cards,broll,motion,pcm,fonts}` 생성, 플랫폼 목록 확정
  (인자 CSV 또는 profile §4 게시 플랫폼).
- **포맷 확정 — `.work/format.env` 를 쓴다. 건너뛰지 않는다.**

  ```bash
  PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
  node $PG/format-resolve.js storyboard/scenes.js --sh > .work/format.env
  ```

  `scenes.js` 최상위 `window.FORMAT` 이 포맷 축이고 **없으면 `shorts-9x16`** 이다.
  기존 회차는 전부 이 키가 없으므로 오늘과 같은 값이 나온다 — 방출값이 빌더 인라인
  기본값과 문자 동일하다는 것이 단위 테스트로 고정돼 있다(`format-resolve.test.mjs`).
  포맷과 무관하게 항상 쓰는 이유는 하나다. 조건부로 두면 "가로일 때만 쓴다"를 누가
  한 번 빠뜨렸을 때 그 회차가 조용히 세로 기본값으로 빌드된다.

  캡처 호출은 이 파일을 **명령줄 접두**로 받는다(§4). `export` 로는 안 나른다 —
  Bash 툴이 호출마다 셸을 새로 띄우므로 export 한 변수가 그 호출과 함께 사라진다.
- **`.work/cost-tally.tsv` 를 지우지 않는다** — storyboard 가 이미지 비용을 적어 둔
  회차 원장이고, §10 이 그 파일 하나로 스토리보드부터 영상까지를 합산한다. 파일이
  없으면 이번 회차부터 새로 적되, `storyboard/images/*.png` 가 있는데 원장이 없으면
  이미지 비용이 집계에서 빠진 상태다 — §10 이 그 사실을 보고에 적는다.

### 2. 프레임 렌더 준비

```bash
sed 's|</body>|<script src="./scenes.js"></script>\n</body>|' \
  ${CLAUDE_PLUGIN_ROOT}/skills/produce/references/video-template.html > .work/frame.html
cp storyboard/scenes.js storyboard/images/*.png .work/   # file:// 상대 참조용
```

템플릿·scenes.js 를 고칠 때마다 frame.html 을 다시 만든다 — 안 하면 옛 렌더를
캡처하고도 모른다. 반드시 절대 경로로 실행한다(`cd` 후 상대 경로 리다이렉트는
조용히 실패).

### 3. 비주얼 생성

파일 경로는 §6 manifest 가 그대로 참조하므로 아래 규약을 지킨다.
**커버 배경과 b-roll 은 계획 게이트를 먼저 통과한다**(절대 규칙 13) — scenes.js 의
cover `bgPrompt`·broll 씬과 profile.md §3 경로를 content-reviewer 에 "계획 모드" 로
위임해 `PLAN_REVIEW: PASS p0=0` 을 확인한 뒤에 생성 호출을 시작한다.

**이미지 엔진 분담** — 기본은 `image_local_generate`(로컬 Z-Image, 장당 비용 0 —
points 정지 배경 등 텍스트 없는 이미지, storyboard §5 가 이 규약으로 생성해 둔다).
커버 배경 = b-roll 소스는 썸네일이자 veo 입력이라 품질 조항으로
`gpt_image_text2img`(high)를 유지하고, 글자가 필요한 이미지는 항상 gpt_image 다
(로컬 한글 실측: "딸깍연구소" → "달닥연구소" 로 깨짐).

**영상 엔진 분담** — 엔진이 둘이고(`veo_*` · `seedance_*`) 잘하는 일이 다르다.
판단표 정본은 [video-model-selection.md](references/video-model-selection.md) 이고,
이 스킬은 그 문서의 순서를 그대로 따른다 — **얼굴 → 소리 → 격자**다.

**① 그 컷에 누가 있나** — 값도 품질도 이 다음에 본다. 얼굴이 엔진을 먼저 지운다.

- **성인 실사 얼굴**: Veo 는 받는다(`veo_img2video` 실측 2026-08-15 — 720p 4초 동안
  얼굴이 유지됐다). Seedance 는 1.5 pro·1.0 pro 만 받고 **2.x 는 태스크 생성 단계에서
  거부한다**(`InputImageSensitiveContentDetected.PrivacyInformation` — 거부는 무과금이라
  경계를 재는 실험은 공짜다). `veo_reference` 는 문서상 같은 정책이지만 미실측이다.
- **미성년으로 보이는 얼굴**: 사진이든 일러스트든 **Veo 이미지 레인이 막는다**
  (Support code 17301594). Seedance 1.x 쪽은 확인 안 됐다. 우회를 찾지 말고 그 컷을
  다시 그린다 — 얼굴을 빼거나 인물을 성인으로 바꾼다.
- **얼굴이 안 보이는 컷**(뒷모습·실루엣·손과 화면만): 전 모델이 다 받는다. 공개
  아레나 이미지→영상 1위인 `dreamina-seedance-2-0-260128` 이 열리는 자리가 여기다.
- **입 없는 캐릭터**(딸깍랩 마우스 머리류): **엔진이 정반대로 갈린 유일한 축이다.**
  Veo 는 0.2초에 없던 입을 그려 넣지만(5전 5패 실측, 부정 지시로 막히는 종류가 아니다),
  **Seedance 2.0 은 15초 1080p 클립 내내 입을 만들지 않았다**(2026-08-15 실측 — 감정
  연기 컷까지 마우스 머리에 사선 눈 둘 그대로). 그 얼굴이 화면에 있으면 Veo 를 부르지
  않고 Seedance 로 간다. 채널 프로파일 §3 의 veo 금지는 그대로 두되, 그 금지가 엔진
  전체가 아니라 Veo 에만 걸린다는 뜻이다.

**② 그 구간의 소리를 쓰나**

- **b-roll 칸은 Veo 다** — 절대 규칙 9 로 그 구간은 클립이 가진 소리를 쓴다.
  네이티브 오디오는 Veo 가 낫고, 무음 클립을 넣으면 그 4초가 통째로 조용해진다.
- **모션 배경(`visual.video`)은 Seedance 로 보낼 수 있다** — 빌더가 영상 트랙만
  깔고 **클립의 소리는 버린다**. 버릴 소리에 Veo 값을 낼 이유가 없고, Veo 는
  1080p 를 8초로만 만드는데 Seedance 는 요청한 초만큼만 만들고 그만큼만 받는다.
  `seedance_img2video`(`resolution: "1080p"` · `durationSeconds`= 그 씬이 실제로
  쓰는 길이 · 모델 `seedance-1-5-pro-251215` · `generateAudio: false`).
  비율 인자는 넘기지 않는다 — 기본 `adaptive` 가 1088×1920 소스를 그대로 따르고,
  `9:16` 을 명시해도 결과는 같지만 다른 값을 넣으면 소스가 중앙에서 잘린다.

**③ 길이·해상도가 Veo 격자에 맞나** — Veo 는 4·6·8초만 만들고 1080p·4K 는 8초
전용이며 음성을 못 끈다. 그 격자 밖의 길이·비율이 필요하면 Seedance 다.

엔진과 무관하게 걸리는 두 줄도 여기 둔다.

- **구도를 재현해야 하면 참조 이미지가 아니라 첫·끝 프레임이다.** 참조는 외형
  (Veo `asset`)이나 화풍(Seedance)을 옮기지 구도를 옮기지 않는다. 등장·소멸·자세
  변화처럼 그림대로 가야 하는 컷은 `sourceImagePath` + `lastImagePath` 자리이고,
  두 PNG 는 같은 배경에서 대상만 다르게 만든다.
- **화풍 이식은 Seedance 뿐이다.** Veo 3.1 에는 `referenceType: "style"` 이 아예
  없다(공식 문서가 오디오도 못 내는 2.0 실험 모델을 쓰라고 안내한다). 스케치·툰
  콘티를 화풍으로 넘기려면 `seedance_reference` 다.

`ARK_API_KEY` 가 없으면 Seedance 호출은 실패한다. 그때는 종전대로 Veo 로 만들되
①의 얼굴 조항은 그대로 지킨다 — 두 엔진은 서로를 막지 않는다.

**영상 프롬프트 문법 — 엔진마다 다르다.** 엔진을 고른 다음 문장을 어떻게 쓰는지가
여기다. 근거는 두 벤더 공식 문서이고 정리본이
[프롬프트 문법 조사](../../docs/research/2026-08-15-veo-seedance-prompting/index.html)와
[카메라 기법 조사](../../docs/research/2026-08-15-ai-video-camera-technique/index.html) 둘이다.
**카메라 항목의 정본은 `references/video-model-selection.md` §카메라**이고 여기엔 요약만 둔다.

- **배제는 프롬프트 본문에 쓰지 않는다** — Veo 는 `negativePrompt` 인자로 받고,
  문법은 명사·형용사구를 콤마로 나열하는 것이다(`text, subtitles, black bars`).
  본문에 "no ~" 를 적으면 그 명사가 오히려 그려진다(로컬 이미지 실측 4장 전패이고,
  Veo 프롬프트 가이드도 그 형태를 not recommended 로 적는다). Seedance 에는 이 인자가
  없으므로 배제할 소재는 아예 안 그려지게 장면을 다시 서술한다.
- **슬롯 순서에 규칙이 없다** — 카메라를 문장 첫 낱말에 두라는 5부 공식은 구글 클라우드
  블로그 한 곳에만 있고, 레퍼런스 문서 세 곳은 어순을 규정하지 않으며 Gemini API 는
  카메라를 `[Optional]` 로 적는다. 필요한 슬롯을 채우는 데만 신경 쓴다.
- **카메라 어휘는 그 벤더가 쓴 말로 적는다** — Veo 호출이면 `orbit` 이 아니라 `arc shot`,
  `push in` 이 아니라 `dolly in` 이다(정본 문서 전문에 `orbit`·`push` 가 0건). `zoom in` 은
  카메라가 안 움직이고 화각만 좁아지므로 다가가는 컷에는 쓰지 않는다.
- **무브를 정서 연출로 쓰지 않는다** — 다가가는 무브가 정서를 바꾼다는 근거가 실증에서
  안 나왔다(p=.84). 톤은 배경·미술로 잡고, 무브는 도입·전환의 몰입에 쓴다. 반대로
  **앵글에는 실증이 있다** — 훅 컷과 발화 클립의 카메라 높이는 눈높이가 기본값이다.
- **Seedance 카메라는 구간으로 적으면 좋다** — `시작 구도 + 무브 + 종료 구도`. 벤더가
  요구하는 형식은 아니고(카메라 칸 자체가 `非必须`) **구도를 재현해야 하는 모션 배경 컷에서
  우리가 쓰는 형식**이다. 프롬프트 본문은 중국어·영어만 받으므로 지시는 영어로 쓴다.
  컷당 무브는 기본 모델 1.5 Pro 에서 2개까지 — 컷당 1종 권고는 2.0 한정이다.
- **Seedance 프롬프트에 초를 적지 않는다** — 길이는 씬의 `duration` 이 정하고 편집이
  자르기 때문이다. 벤더 고지가 있는 쪽은 2.0 이고(2.5 는 정수 초에 응답한다) 기본 모델
  1.5 Pro 는 확인된 바 없다 — 규칙의 근거는 우리 파이프라인이지 벤더 문서가 아니다.
  **Veo 는 반대다** — 3.1 은 `[00:00-00:02]` 형식의 구간 분할을 정식 워크플로로 제시한다.

- **커버 배경 = b-roll 소스 (한 장, `storyboard/images/scene-1.png`)**:
  `gpt_image_text2img`, `size: "1088x1920"`, **`quality: "high"`**. **사람이 있는 실사
  스타일**(절대 규칙 11·12) — 생성 인물만(기본 한국 여성), 채널 주제가 화면 중심이 되는
  각도, 주제가 한눈에 보이는 장면. 프로파일 §3 무드·필수 부정 지시와
  "lower third fading into darkness" 를 상속하되 `face not visible` 은
  **`seen from behind, face turned away`** 로 바꿔 사람이 분명히 보이게 한다.
  커버 캡처(`bg=./scene-1.png`)와 veo 입력이 같은 파일을 쓰므로 커버가 끝나면
  그 사진이 그대로 움직이기 시작한다.
- **b-roll (scenes.js 의 `broll` 씬 — 회차당 최대 2칸)**: 각 칸의 `visual.src` PNG 를
  `veo_img2video`(`aspectRatio: "9:16"` · `resolution: "1080p"` · `durationSeconds: 8` ·
  **`veo-3.1-lite-generate-preview`**)로 애니메이션한다. lite 를 쓰는 근거는 블라인드
  아레나에서 Veo 세 티어의 Elo 격차가 20 이내이고 신뢰구간이 겹친다는 것이다
  (video-model-selection §품질) — 같은 그림에 fast 는 8초당 $0.96, lite 는 $0.64 다.
  **단서 하나**: 아레나는 영상과 소리를 묶어 평가해서 오디오 품질만 따로 재지 않았다.
  이 칸은 클립의 소리를 쓰는 자리이므로(절대 규칙 9), 리뷰가 b-roll **소리**를 P0 로
  지적하면 그 편은 fast 로 올려 다시 만든다. 절대 규칙 8·10 — 소스는 **이미 만들어 둔 이미지**여야
  하고, **커버 자체는 코드 렌더로 만든다**(Veo 는 한글을 못 쓴다).
  **스토리보드에 있는 만큼만 만든다** — 계획된 칸을 빼먹으면 승인된 씬이 조용히
  사라지고, 없는 칸을 더 만들면 계약 위반이자 헛돈이다.
  - **생성은 8초, 사용은 필요한 만큼** — 1080p 는 API 가 8초만 허용한다. 본편이
    1080×1920 이라 720p 생성 후 업스케일하지 않는다(사용자 결정 2026-08-11 — 업스케일이
    필요하면 그냥 1080p). 실제로 쓰는 길이는 스토리보드 broll 씬의 `duration`(기본
    4초)이고, §6 접합 직전에 원본 앞부분만 잘라 쓴다. 원본 8초
    (**`.work/broll/broll-a<after>.mp4`**)는 보관한다 — 재트림의 기준점이다.
    파일명에 `after` 를 넣는 이유는 하나다 — 두 칸이 같은 이름으로 서로를 덮어쓴다.
  프롬프트는 scenes.js `visual.motion`("very slow dolly in / nearly static camera")을
  **영어로 모션만** 옮기고 끝에 오디오 지시를 붙인다 — 이 칸은 Veo 호출이라 `push in` 이
  아니라 `dolly in` 이다(위 어휘 규칙). 예:
  `Audio: quiet studio room tone with a faint fabric rustle, no music, no speech.`
  이미지에 이미 보이는 인물·배경·조명을 다시 묘사하면 모델이 장면을 재설계한다.
  - **두 칸은 각자의 소스로 만든다** — 같은 PNG 를 모션만 바꿔 두 번 돌리면 같은
    장면이 두 번 나와 영상이 제자리를 맴돈다. 두 번째 칸의 소스는 그 칸이 붙는 씬의
    배경이고, 그 장은 gpt_image high 로 만든 인물 실사여야 한다(절대 규칙 11·12).
  - **팔린드롬 루프를 쓰지 않는다** — 정+역 이어붙이기는 소리가 거꾸로 재생된다
    (절대 규칙 9 로 이 구간은 영상 사운드를 쓴다).
  - 이 구간은 manifest 에 넣지 않고 **빌드 후 접합**한다(§6 끝). 카드당 오디오 1개인
    빌더 계약에 무발화 오디오를 끼우면 발화속도·문장경계 계산이 깨진다.
- **모션 배경 (scenes.js 의 `visual.video` — 생성 영상 합산 상한 안에서)**: 그 씬의
  `visual.bg` PNG 를 애니메이션해 **`.work/motion/motion-i<씬 인덱스>.mp4`** 로 저장한다.
  **여기가 Seedance 자리다**(위 영상 엔진 분담) — `seedance_img2video`
  (`resolution: "1080p"` · `durationSeconds`= 그 씬이 쓰는 길이 ·
  `seedance-1-5-pro-251215` · `generateAudio: false`). `ARK_API_KEY` 가 없으면
  `veo_img2video`(`aspectRatio: "9:16"` · `resolution: "1080p"` · `durationSeconds: 8` ·
  `veo-3.1-lite-generate-preview`)로 만든다. 프롬프트는 `visual.video.prompt`(영어 모션만 — 장면 재묘사는 모델이
  장면을 재설계한다)를 그대로 쓴다. 클립의 소리는 빌드에서 쓰이지 않으므로(§6 조립이
  영상 트랙만 깐다) 오디오 지시는 없어도 된다. 계획 게이트(절대 규칙 13)는 b-roll 과
  같은 위임에서 함께 받는다. **스토리보드에 있는 만큼만 만든다** — b-roll 과 합산 2가
  상한이다(scenes-schema §모션 배경 정본).
- **quote 발화 클립**(계획된 경우): `veo_reference`(아바타 1장, 9:16, 720p,
  `veo-3.1-fast-generate-preview` — 참조 이미지는 lite 가 지원하지 않아 fast 가
  최저 티어다. 표준 티어는 아레나에서 fast 와 동점이라 4배를 낼 이유가 없다) —
  프롬프트에 캐릭터 묘사 반복 + "static camera" + "wide chest-up framing … subject
  appears small in the frame" + 배경은 THEME 다크 통일. **배제는 본문이 아니라
  `negativePrompt` 인자다** — `text, subtitles, black bars, letterboxing`.
  `frame-persona-clip.py <입력> .work/broll/<화자>-palin.mp4` 로 프레이밍 통일 +
  팔린드롬. 여러 클립은 hstack 으로 나란히 붙여 눈으로 배율을 비교한다. 발화
  클립이 없으면 정지 인용 카드로 대체(불투명 캡처).
  아바타에도 ①의 얼굴 조항이 그대로 걸린다 — 입 없는 캐릭터면 Veo 를 부르지 않고
  정지 인용 카드로 간다. 참조는 외형만 옮기므로 **아바타의 구도를 그대로 지켜야
  하면 참조가 아니라 `veo_img2video` 첫·끝 프레임**이다.
- **BGM**: 채널 공용 침대가 있으면 그걸 쓴다.
  ```bash
  ASSET=${CLAUDE_PLUGIN_ROOT}/skills/channel/references/resolve-asset.py
  if BGM=$(python3 "$ASSET" data/<채널> bgm default 2>/dev/null); then
    cp "$BGM" .work/bgm.wav
  else
    # 없을 때만 생성 — 다음 편에도 쓰려면 assets/audio/bgm/default.wav 로
    # 복사하고 resolve-asset.py --ensure 로 catalog 에 올린다
    : # music_generate (Lyria, 인스트루멘털) 90초 → .work/bgm.wav
  fi
  ```
  생성 프롬프트: "leaves space for a spoken voiceover, no melody in the vocal
  frequency range". **`.work/bgm.wav`** 가 빌더가 찾는 이름이다.

**호출마다 `.work/cost-tally.tsv` 에 한 줄 적는다** — storyboard 가 쓰던 원장을 그대로
이어 쓴다. 규약 정본은 [cost-tally.md](../autoproduce/references/cost-tally.md) 다.

```bash
printf 'image.gpt-image-2.high\t1\tproduce: 커버 배경 재생성\n'          >> .work/cost-tally.tsv
printf 'veo.lite.1080p\t8\tproduce: b-roll a1 — 8초 생성·4초 사용\n'     >> .work/cost-tally.tsv
printf 'seedance.1-5-pro-silent.1080p\t5\tproduce: 모션 배경 i3 (completion_tokens 102960)\n' >> .work/cost-tally.tsv
printf 'music.lyria-realtime\t90\tproduce: BGM 90초 — 단가 미확인\n'     >> .work/cost-tally.tsv
```

단위를 틀리기 쉬운 자리가 둘이다.

- **veo 는 생성 길이를 적는다** — 8초 만들어 4초만 써도 `8` 이다. 1080p 는 API 가
  8초만 허용하고, 트림은 청구를 줄이지 않는다. 4를 적으면 그 편 영상비의 절반이
  리포트에서 사라진다.
- **seedance 는 요청한 초 그대로** 적고, 응답의 `completion_tokens`(실제 청구 근거)는
  메모에 옮겨 둔다. 단가표의 초당 값은 공식 예시가에서 나온 환산이라, 나중에 둘을
  대조하면 환산이 맞는지 검산된다.

**BGM 은 단가가 확인되지 않은 항목이다.** `music_generate` 가 부르는 Lyria RealTime 은
공식 요금표에 행이 없다(2026-08-15 확인). 그래도 원장에는 적는다 — 0 으로 적거나 줄을
빼면 그 편 비용이 조용히 줄어든다. 리포트가 exit 1 을 내는 것이 정상 동작이고, §10 이
"집계 제외 1건"으로 보고한다.

### 3.5 촬영 클립 수용 (섞어 찍기 회차만)

사용자가 `footage/` 에 저장한 파일을 **한 번 정규화해** `.work/footage/` 로 옮긴다.
원본을 그대로 빌더에 넣지 않는다 — 폰·화면 녹화는 가변 프레임률(VFR)이 흔하고,
그대로 붙이면 뒤로 갈수록 입과 소리가 밀린다.

```bash
mkdir -p .work/footage .work/pcm
for SRC in footage/*.mp4 footage/*.mov footage/*.m4v; do
  [ -f "$SRC" ] || continue
  B=$(basename "${SRC%.*}")
  # 중간본은 .mov 다 — 무손실 PCM 을 담아야 육성이 2세대 손실을 안 입는데,
  # PCM 을 mp4 에 넣는 건 ffmpeg 7 대에서야 열렸다(그 전 버전은 먹싱을 거부한다).
  # mov 는 어느 버전에서나 표준이고 빌더도 .mov 를 그대로 받는다.
  ffmpeg -y -v error -i "$SRC" \
    -r 30 -vsync cfr -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
    -c:a pcm_s16le -ar 48000 -ac 1 ".work/footage/$B.mov"
  # 오디오는 **정규화한 파일에서** 뽑는다 — 그래야 카드 오디오와 빌더가 쓰는
  # 영상 트랙이 같은 파일에서 나온다
  ffmpeg -y -v error -i ".work/footage/$B.mov" -vn -ar 48000 -ac 1 ".work/pcm/$B.wav"
done
```

- **먼저 확인한다** — scenes.js 촬영 씬의 `visual.clip` 이 전부 실재하는가.
  하나라도 없으면 **거기서 멈추고** 어느 파일이 비었는지 사용자에게 알린다.
  없는 채로 진행하면 그 씬만 빠진 영상이 나오고 그걸 나중에 발견한다.
- **방향 검사**: 가로 회차에 세로 클립이 들어오면 빌더가 `STRICT_DIM=1` 로 첫
  ffmpeg 전에 멈춘다. 재촬영이므로 사용자에게 바로 알린다.
- **길이 검사**: 나레이션을 덮는 씬은 클립이 `나레이션 + PRE + POST` 보다 길어야
  한다. 짧으면 마지막에 화면이 얼어붙는다 — 그 씬 대본을 줄이거나 클립을 다시 받는다.
- 오버레이는 씬마다 **알파 캡처 한 장**이다(로어서드). reveal 열거는 육성 씬에
  안 쓴다 — 화면이 바뀌는 건 녹화 쪽이지 우리 글자가 아니다.

  ```bash
  FORMAT_ENV="$PWD/.work/format.env" \
    $REF/capture-frames.sh "file://$PWD/.work/frame.html?i=<idx>&alpha=1&scrim=1&dim=1" .work/cards/a<idx>.png 1
  ```
- **자막은 전사에서 만든다.** 클립 오디오를 `ingest` 의 `transcribe.sh` 로 전사하고
  교정한 뒤, 카드 시작 기준 초로 `.work/cards/s<idx>subs.tsv`(`start<TAB>end<TAB>문장`)
  를 쓴다. 이 파일을 §6 의 `cards.tsv` 5열 `subs=` 로 넘긴다 — 육성 씬은 발화 경계
  검출을 안 거치므로 자막 시각이 전사에서만 나온다.

### 3.6 슬라이드 씬·육성 음성 수용 (해당 회차만)

**슬라이드 씬**(`visual.slide`, scenes-schema §슬라이드 씬)의 세그 비주얼은
`frame.html` 이 아니라 **storyboard 의 슬라이드 파일에서** 캡처한다. 저작·자가
검증은 storyboard §8 이 끝냈고, 여기서는 상태를 열거해 카드 재료로 만들 뿐이다.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/produce/references
# 불투명 캡처(alpha 0) — 슬라이드가 화면 전체라 배경 합성이 없다
FORMAT_ENV="$PWD/.work/format.env" \
  $REF/capture-reveals.sh <idx> "file://$PWD/storyboard/slides/s<샷번호>-<slug>.html" \
  .work/cards/a<idx>r 0
```

- 슬라이드는 `../scenes.js` 를 상대 경로로 읽으므로 **storyboard/slides/ 제자리에서**
  캡처한다 — .work 로 복사하면 SoT 를 못 찾는다.
- 상태 수가 세그 수와 안 맞으면 §7 리포트의 「reveal 상태 누락」이 잡는다 — 그때는
  슬라이드의 rg 배정을 고치고 다시 캡처한다(스토리보드 §8 계약).

**전 씬 육성 회차**(`window.VOICE === "user"`)는 TTS 를 만들지 않는다(§5 통째로
건너뜀). 촬영 씬은 §3.5 대로 클립에서 소리를 뽑고, 나머지 씬은 사용자가 녹음한
`voice/s<샷번호>.wav`(샷번호 = 배열 순번 1부터 = 카드 idx+1)를 쓴다.

```bash
mkdir -p .work/pcm
for SRC in voice/s*.wav; do
  [ -f "$SRC" ] || continue
  # 트림·정규화는 빌더가 한다 — 여기서는 48k 모노로만 맞춘다
  ffmpeg -y -v error -i "$SRC" -ar 48000 -ac 1 ".work/pcm/$(basename "$SRC")"
done
```

- **먼저 확인한다** — narration 이 있는 비촬영 씬 전부에 voice 파일이 실재하는가.
  하나라도 없으면 멈추고 어느 샷이 비었는지 사용자에게 알린다.
- 카드 계약(§6): 오디오 = 그 wav, **일반 레인**이다 — `sync=1` 을 걸지 않는다.
  트림·loudnorm·문장 경계 검출이 다 필요하고(경계가 리빌 전환을 몰아 준다),
  입 모양이 화면에 없어 동기 제약도 없다.
- **빌드는 `ATEMPO_MIN=1 ATEMPO_MAX=1` 로 돌린다** — 사람 발화에 기계 속도 보정을
  걸지 않는다(잠정 2026-08-18, 첫 육성 회차 빌드에서 확인). 발화속도 REGEN 권고가
  떠도 재생성 대상이 아니다 — 그 샷은 재녹음이거나 대본 조정이다.
- 녹음 앞머리 소음이 트림 문턱(-50dB)에 안 걸려 데드에어로 나오면 그 카드만
  수동 트림한다 — 이것도 첫 회차에서 잰다.

### 4. reveal 상태 캡처

씬마다 `capture-reveals.sh` 로 **상태 수를 스스로 도출**시킨다 (몇 개 찍을지
사람이 고르면 누락 사고가 난다):

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/produce/references
FORMAT_ENV="$PWD/.work/format.env" \
  $REF/capture-reveals.sh <idx> "file://$PWD/.work/frame.html?i=<idx>&alpha=1&scrim=1&dim=1" .work/cards/a<idx>r 1
```

| 씬 | URL 파라미터 (reveal= 제외) | 알파 |
|---|---|---|
| **cover (코드 렌더 — 절대 규칙 10)** | `?i=n&bg=./scene-n.png&scrim=1&dim=0` | 0 |
| points (b-roll/모션 위) | `?i=n&alpha=1&scrim=1&dim=1` | 1 |
| points (정지 배경) | `?i=n&bg=./scene-n.png&scrim=1&dim=1` | 0 |
| quote (발화 클립 위) | `?i=n&alpha=1` | 1 |
| quote (정지 인용 카드) | `?i=n&bg=…&scrim=1&dim=2` | 0 |

**모션 배경 씬(`visual.video`)은 표의 "points (b-roll/모션 위)" 행이다** — alpha 캡처로
텍스트만 뜨고 영상은 §6 조립이 밑에 깐다. 삽화 모드 회차라면 이 씬도 `&light=1` 을
유지한다(흰 기조 영상 위 잉크 텍스트 — 라이트 워시가 alpha 캡처에 함께 담긴다).

**스크림은 풀스크린 딤이 아니라 밴드다**(절대 규칙 14) — 템플릿이 씬 타입을 보고
cover 는 하단 밴드, points 는 상단 밴드(+자막 보험용 얕은 하단)를 그린다. 화면
중앙은 어느 dim 에서도 맑다 — **quote 정지 인용 카드만 예외**로 구 풀워시를
유지한다(인용문이 화면 중앙에 앉는 씬이다). **`dim` 은 텍스트 밴드가 앉는 구간의 배경 밝기를 보고
고른다** — 밝으면 `dim=1` 로는 흰 제목이 묻히고 강조 칩(accent 그라데이션)이 배경에
잠긴다. 그때는 `dim=2` 로 올린다. 씬마다 다른 값을 쓰지 말고 **그 회차의 points 전
씬을 같은 값으로** 통일한다(룩이 달라진다).
실측: 밝은 스튜디오·페일 리넨 배경은 `dim=2` 가 필요했고, 어두운 배경은 `dim=1` 로
충분했다 (2026-08-12 밴드 스크림 재실측 동일).

points 의 reveal 전환은 **캡션 교체(스왑)** 다 — 상태 수 = 1(배경) + 1(제목·출처) +
캡션 수. 불릿이 리스트로 쌓이지 않고 활성 캡션 하나만 보인다(절대 규칙 14).

**삽화(라이트) 모드 — 흰 배경 라인아트 대사별 삽화** (scenes-schema §narration 의
`img`/`imgPrompt`, 첫 사례 2026-08-12 드롭쉬핑):
- 모든 캡처 URL 에 **`&light=1`** 을 붙인다. 다크 스크림은 흰 그림을 회색으로
  죽인다(실측) — 이 모드는 텍스트를 잉크색으로 뒤집고 밴드를 화이트 워시로 그린다.
  커버 텍스트는 상단 앵커로 옮겨진다 — **커버용 삽화는 캐릭터·소품을 하단 1/3 에
  작게 두고 위 2/3 를 비우는 구도로 생성**해야 한다(중단 구도면 스탯이 얼굴을 덮는다).
- 대사별 삽화 스왑은 캡처가 푼다 — 빌드 수정은 없다(세그 경계 xfade 가 배경까지
  함께 크로스페이드한다): ① `capture-reveals.sh` 를 1행 삽화 bg 로 돌려 상태 수를
  도출하고(reveals.tsv 기록) ② 상태→대사 매핑에 따라 bg 가 다른 상태만
  `capture-frames.sh` 로 다시 찍어 교체한다(**`FORMAT_ENV="$PWD/.work/format.env"` 접두를
  똑같이 붙인다** — 여기만 빠뜨리면 교체된 카드만 세로 창으로 찍혀 한 회차 안에서 크기가
  어긋난다). 매핑: cover 는 r1←세그①, r2←세그②.
  points 는 r1(제목)←세그①, 캡션 r k 는 그 캡션을 읽는 세그먼트의 삽화.
- `dim=1` 로 통일한다(화이트 워시 기본값). 밝기 고민이 없는 모드라 dim=2 는 안 쓴다.

오버플로 검증: 헤드리스 원샷 캡처로는 `document.title` 을 못 읽으므로,
chrome-devtools 가 있으면 `navigate_page`(같은 URL) 후 `evaluate_script` 로
`window.__overflow === 0` 을 확인하고, 없으면 상태 PNG 를 육안으로 확인한다
(잘림·겹침 — 템플릿이 tight1~3 자동 축소 후 잔여만 노출).

### 5. TTS 생성 (씬당 1콜)

**전 씬 육성 회차(`window.VOICE === "user"`)는 이 절 전체를 건너뛴다** — 카드
오디오가 전부 클립(§3.5)과 `voice/`(§3.6)에서 나온다. 문체 게이트는 스토리보드가
이미 통과시켰다.

**읽히기 전에 문체를 본다.** 나레이션은 소리로 한 번 지나가서 되감기가 없고,
자막·카드 텍스트는 게시 후 고칠 수 없다. TTS 콜 전에 세 표면을 검사한다.

```bash
PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
for S in narration subtitle screen; do
  node $PG/extract-text.js ./storyboard/scenes.js $S > .work/text-$S.txt || { echo "[$S] gate_exit=3 (추출 실패)"; continue; }
  python3 $PG/check-style.py --surface $S .work/text-$S.txt; GATE=$?
  echo "[$S] gate_exit=$GATE"
done
```

`gate_exit` 를 그대로 읽는다 — 0 통과 / 1 경고 / 2 S1 검출 / 3 게이트 미실행
(추출 실패·경로 오류). **3 은 통과가 아니다.** 경로부터 고치고 다시 돌린다.
1 인데 머리줄에 `인용면제 N` 이 있으면 그 인용을 research.md 로 확인한다 — 영상은
자막·카드까지 박제되므로 확인 못 한 인용은 따옴표를 풀고 우리 문장으로 다시 쓴다.

**출력을 줄여 보려고 `| head` 나 `| sed` 를 붙이지 않는다.** 붙이면 `$?` 가 검사기가
아니라 그 명령의 것이 되어, S1 이 6건인 FAIL 이 `gate_exit=0` 으로 보인다(실측).
꼭 파이프를 써야 하면 앞에 `set -o pipefail` 을 둔다.

exit 2 면 **scenes.js 를 고치고** 여기서 다시 시작한다 — `.work/text-*.txt` 만
고치면 영상과 어긋난다(scenes.js 가 유일한 원천). 고칠 때 수치·고유명사는 그대로
두고 문장 결만 손본다.

씬마다 음성 1콜 — profile 레지스트리 그대로, 대본은 narration 세그먼트의
`tts` 문장들을 마침표로 이어 붙인 전문. `.work/pcm/c<n>.wav`.
씬을 문장별로 쪼개 여러 콜 하지 않는다(콜 간 목소리 편차).

**엔진은 profile §2 가 정한다.** 새 채널의 나레이션 기본값은 `tts_local_generate`
(Supertonic, 로컬) 다 — 키·쿼터가 없고 회차를 아무리 돌려도 비용이 0이라 재생성이
자유롭다. 스타일 지시가 필요한 대사, 즉 감정을 연기해야 하는 컷만 `tts_generate`
(Gemini) 로 보낸다. 로컬 쪽에는 stylePrompt 가 없다.

**엔진 필드가 없는 기존 프로파일은 `gemini` 로 간주하고 적힌 voiceName 을 그대로
쓴다.** 로컬이 기본이라는 이유로 갈아타지 않는다 — 이미 몇 회차가 나간 채널의
나레이터가 중간에 다른 사람이 된다. 로컬 전환은 사용자가 프로파일 §2 를 갱신해
엔진을 명시할 때만 일어난다.

**한 영상 안에서 두 엔진을 섞지 않는다** — 44.1kHz(로컬)와 24kHz(Gemini)가 한
타임라인에 들어가면 이어붙이기가 깨진다. 굳이 섞어야 하면 빌드 전에 한쪽을
리샘플링한다.

**생성 직후 길이 검사** — 자수/4.5 의 2배를 넘으면 같은 파라미터로 1회 재생성.
`tts_local_generate` 는 응답이 오디오 길이를 담고 있어 그 값을 그대로 쓰면 되고,
`tts_generate` 는 ffprobe 로 잰다 (Gemini TTS 이상 산출 대처는
`references/pipeline.md` §TTS 장애).

씬 전체를 뽑았으면 원장에 한 줄 적는다. **수량은 자수가 아니라 자수÷1000 이다** —
단가가 1,000자 단위라 412자를 `412` 로 적으면 1000배가 된다. 로컬 엔진은 단가 0 이라
티가 안 나지만, Gemini 채널에서는 그대로 잘못된 청구액이 된다. 재생성한 씬은 그
몫을 한 줄 더 적는다.

```bash
# 로컬(Supertonic) 채널 — 전 씬 합계 1,840자
printf 'tts.local\t1.840\tproduce: 나레이션 5씬 1840자\n' >> .work/cost-tally.tsv
# Gemini 채널이면 모델에 맞는 키로 (기본 flash)
printf 'tts.gemini-flash\t1.840\tproduce: 나레이션 5씬 1840자\n' >> .work/cost-tally.tsv
```

로컬 엔진이 "Python interpreter not found" 나 "No module named 'supertonic'" 으로
실패하면 **그 자리에서 멈추고 사용자에게 설치를 요청한다.** Gemini 로 조용히 갈아타지
않는다 — 목소리가 바뀐 채로 영상이 만들어지고, 회차마다 화자가 달라진다.

### 6. manifest 작성 + 빌드

`.work/cards.tsv`·`segs.tsv` 를 scenes.js 에서 변환한다 (탭 구분, 아웃트로 제외):

```
cards.tsv : idx <TAB> 오디오절대경로 <TAB> 목표자/초 <TAB> zoom(in|out|auto|none) [<TAB> 옵션]
segs.tsv  : idx <TAB> seg(0부터) <TAB> 비주얼 <TAB> tts문장 <TAB> sub문장
sfx.tsv   : idx <TAB> seg <TAB> 오디오파일 <TAB> bgm(on|off)      (선택)
chapters.tsv : 챕터첫카드idx <TAB> 챕터 제목                       (롱폼)
```

**cards.tsv 5열(옵션)은 `k=v,k=v` 다.** 없어도 되고, 기존 4열 파일은 그대로 돈다.

| 옵션 | 무엇 | 언제 |
|---|---|---|
| `sync=1` | 프리롤·무음 트림·속도 보정을 전부 끈다. 정규화만 한다 | **촬영 씬의 육성** — 셋 중 하나만 걸려도 입과 소리가 어긋난다 |
| `subs=<tsv>` | 그 카드 자막을 파일로 준다(`start<TAB>end<TAB>문장`, 카드 시작 기준 초) | 전사에서 만든 자막 — 발화 경계 검출을 안 거치는 씬 |
| `pan=<방향>[:배율]` | 켄번즈를 줌 대신 팬으로 (`l2r`·`r2l`·`u2d`·`d2u`) | 가로 정지 배경. 이동폭 = 폭 × (배율−1) |

`zoom=none` 은 켄번즈 자체를 끈다 — **촬영 클립은 이미 움직이므로** 그 위에 줌을
또 얹으면 화면이 흔들린다. 촬영 씬 카드는 대개 `none` + `sync=1` 조합이다.

```
# 촬영 씬(육성) 한 줄 예
3	pcm/s3-run-cli.wav	0	none	sync=1,subs=cards/s3subs.tsv
# 슬라이드·생성 씬(사용자 녹음 나레이션 — window.VOICE) 한 줄 예: 일반 레인, sync 없음
11	pcm/s12.wav	0	none
```

**슬라이드 씬의 세그 비주얼**은 §3.6 에서 캡처한 상태 PNG(`cards/a<idx>r<k>.png`)를
생성 씬과 똑같이 적는다 — 상태 전환(xfade)이 곧 슬라이드 애니메이션이다. 켄번즈는
글자 화면에 어울리지 않으므로 `zoom` 은 `none` 이다. 사용자 녹음 카드의 목표자/초
(3열)는 0 으로 두고 빌드를 `ATEMPO_MIN=1 ATEMPO_MAX=1` 로 돌린다(§3.6 — 속도 보정
차단).

`sync` 카드의 오디오는 **그 클립에서 뽑은 wav** 를 준다(§3.5). 카드 길이가 곧 그
오디오 길이라, 원본 mov 에서 뽑은 것과 정규화본에서 뽑은 것이 다르면 그 차이만큼
화면이 밀린다.

**촬영 씬의 세그 비주얼**은 `@.work/footage/<이름>.mov::.work/cards/a<idx>.png` 다 —
클립을 첫 프레임부터 한 번만 틀고(`@`) 그 위에 로어서드 알파 PNG 를 얹는다. 육성
씬은 세그가 하나이므로 `@` 가 맞고, 나레이션을 덮는 씬이 세그 여럿이면 `@` 를 떼고
같은 경로를 이어 적는다(빌더가 `-ss` 로 재생을 이어 붙인다).

비주얼 열: 상태 PNG / `영상.mp4::오버레이.png`(커버·발화·모션 배경) / `A|B`(하위 reveal —
불릿을 묶어 읽은 문장도 화면 등장은 하나씩). **모션 배경 씬**의 세그 비주얼은
`.work/motion/motion-i<idx>.mp4::상태PNG`(alpha 캡처)다 — 세그가 여럿이면 같은 영상
경로를 이어 적는다(빌더가 xfade 오프셋만큼 `-ss` 로 앞당겨 재생을 이어 붙인다).

**`@` 접두 = 한 번만 재생** (`@타이핑.mp4` 또는 `@타이핑.mp4::배지.png`). 기본 영상
비주얼은 세그 창을 루프로 채우고 앞 세그에서 이어지도록 `-ss` 로 앞당겨 시작한다 —
b-roll 처럼 **어디서 잘라 붙여도 되는 그림**을 전제로 한 동작이다. 타이핑 카드처럼
**처음부터 끝까지가 한 동작**인 클립은 그러면 두 군데서 깨진다: 세그 2 이상이면 글자가
다 쳐진 중간부터 시작하고, 세그 1 이어도 창이 클립보다 길면 루프가 돌아 처음부터 다시
친다(실측). `@` 는 첫 프레임부터 틀고 끝 프레임에서 멈춘다.
**단 `@` 는 단일 세그 전용이다** — 클립 하나를 **연속 두 세그에 걸치면** `@` 가 세그
경계마다 클립을 처음부터 다시 시작시켜 타이핑이 리셋된다(2026-08-14 claude-skills 회차
실측 — 둘째 명령이 화면에 못 나왔다). 걸침 세그는 `@` 를 떼고 같은 경로를 이어 적으면
빌더가 `-ss` 이어재생으로 붙인다(모션 배경과 같은 동작). 창 합이 클립보다 짧으면 루프
없이 그 지점에서 끝나므로, 타이핑 완료 시각(타이핑초)이 창 합 안에 들어오는지만 확인한다.

**`sfx.tsv` = 그 세그 구간에만 나는 소리**. 오디오파일은 wav 든 mp4 든 되고(영상이면
그 안의 소리를 쓴다), 비워 두고 `bgm` 만 `off` 로 적으면 그 구간에서 음악만 빠진다.
시각 기준은 문장 경계가 아니라 **그 비주얼의 등장 시각**이다 — xfade 는 오프셋에서 뒤
입력의 0초를 틀기 시작하므로 경계에 맞추면 소리가 화면보다 서너 글자 앞선다.
덕킹의 키는 목소리만이라 효과음이 BGM 을 누르지 않는다. 볼륨은 `SFX_VOL`(기본 0.85),
BGM 차단 램프는 `BGM_GATE_R`(기본 0.30s) 로 조절한다.

**챕터(롱폼)** — scenes.js 의 `chapter` 문자열을 그 샷의 카드 idx 에 붙여 적는다.
타임스탬프는 적지 않는다. 빌더가 실측 시각에서 만들고 유튜브 3요건(첫 챕터 0:00 ·
3개 이상 · 간격 10초 이상)을 검사해 어기면 **거기서 멈춘다**.

```bash
# scenes.js 배열 인덱스 = 카드 idx (0부터). format-resolve 와 같은 vm 방식으로 읽는다
node -e '
const fs=require("fs"), vm=require("vm");
const sb={window:{},console:{log(){},warn(){},error(){}}}; sb.globalThis=sb;
vm.runInNewContext(fs.readFileSync("storyboard/scenes.js","utf8"), sb);
(sb.window.SCENES||[]).forEach((s,i)=>{ if(s.chapter) console.log(i+"\t"+s.chapter); });
' > .work/chapters.tsv
```

아웃트로는 catalog 에서 고른 파일을 **`format.env` 의 `OUTRO_ASSET` 이름 그대로**
복사한다 — 가로는 `outro-16x9.mp4` 라, `outro.mp4` 로 두면 빌더가 못 찾아 아웃트로
없이 붙는다(그게 리포트 한 줄로만 지나간다). 플랫폼을 알면 그 id(`youtube`·
`instagram`), 모르면 `default`.

```bash
ASSET=${CLAUDE_PLUGIN_ROOT}/skills/channel/references/resolve-asset.py
. .work/format.env                      # OUTRO_ASSET 을 읽는다
OUTRO=$(python3 "$ASSET" data/<채널> outro "${PLATFORM:-default}") \
  || OUTRO=$(python3 "$ASSET" data/<채널> outro default)
cp "$OUTRO" ".work/${OUTRO_ASSET}"
# 없으면 build-outro.sh 로 최초 1회 생성 → assets/outro/default.mp4 저장
#   python3 "$ASSET" --ensure data/<채널> outro default outro/default.mp4
if [ -d data/<채널>/assets/fonts ]; then
  mkdir -p .work/fonts
  cp data/<채널>/assets/fonts/*.[to]tf .work/fonts/ 2>/dev/null || true
fi
```

옛 `assets/outro.mp4` 도 resolve 가 찾는다. 자막 폰트는 `assets/fonts/` 의
ttf 를 `.work/fonts/` 로 복사한다(woff2 불가 — 없으면 fontconfig 폴백으로도
게시 품질은 나온다).

`sfx.tsv` 세 번째 칸은 파일 경로 또는 catalog id 다. id 만 있으면
`python3 "$ASSET" data/<채널> sfx <id>` 로 푼다.

```bash
$REF/build-reel.sh .work    # → .work/reel.mp4(클린) · reel-sub.mp4(번인) · subs.srt · cover.jpg · build-report.txt
```

**영상 하나가 아니라 두 벌이 나온다.** 자막은 영상에 태우지 않고 파일로 따로 올리는
것이 이 파이프라인의 원칙이다 — 게시 후에도 자막만 고칠 수 있고, 시청자가 끄고 켤 수
있고, YouTube 는 그 파일로 자동 번역까지 만든다. 번인 자막은 오타 하나에 재인코딩과
재게시를 부른다. 그래서 `reel.mp4` 는 자막이 없는 클린 마스터고, `subs.srt` 가 게시
툴에 함께 넘어간다.

#### b-roll 접합 (§3 에서 만든 경우 — 최대 2칸)

생성 영상 구간은 **빌드가 끝난 뒤** 각 칸의 `after` 씬 종료 시각 T 에 끼워 넣는다.
`build-reel.sh` 는 아웃트로만 접합하므로 이건 빌더 밖 후처리다.

접합 전에 칸마다 **트림 + 음량 정규화 + BGM 을 한 번의 재인코딩**으로 처리한다 — 원본
8초에서 broll 씬 `duration`(사용 길이) 만큼만 자르면서 veo 사운드를 본편 기준으로 맞추고
BGM 을 얹는다(생성 사운드는 본편보다 작다 — 실측 인물 소스 mean −18~−22dB):

```bash
mix_broll() {           # mix_broll <after> <사용길이초>
  local A=$1 USE=$2
  ffmpeg -y -i .work/broll/broll-a$A.mp4 -stream_loop -1 -i .work/bgm.wav -t $USE \
    -filter_complex "[0:a]loudnorm=I=-20:TP=-2:LRA=7[va];
      [1:a]volume=0.15,afade=t=in:st=0:d=0.4,afade=t=out:st=$((USE-1)):d=1[bg];
      [va][bg]amix=inputs=2:duration=first:normalize=0[a]" \
    -map 0:v -map "[a]" -r 30 -c:v libx264 -profile:v high -level 4.1 -pix_fmt yuv420p \
    -c:a aac -ar 48000 -ac 2 -b:a 192k .work/broll/broll-a$A-mixed.mp4
}
mix_broll 0 4          # scenes.js broll 씬의 after 와 duration 을 그대로 넣는다
mix_broll 3 4          # 두 번째 칸이 있으면
```

**믹스본을 다시 자르지 않는다** — 페이드가 길이 기준으로 박혀 있어, 자르면 끝 페이드가
사라지고 BGM 페이드 위치가 어긋난다. 길이를 바꾸려면 원본 8초에서 다시 믹스한다.
(veo 출력은 24fps 라 30fps 재인코딩이 여기서 함께 일어난다.)

삽입 시각 T 는 `build-report.txt` 의 `card` 줄들에서 **`after` 카드까지의 확정 길이를
누적**해 구한다. broll·outro 는 manifest 에 없고 broll 씬은 배열 끝에 두므로,
**본편 씬 인덱스 = 카드 인덱스**가 그대로 성립한다.

```bash
cardend() {   # cardend <after> — card 0..after 확정 길이 합 = 그 씬이 끝나는 시각
  awk -v n="$1" -F'|' '/^card /{ split($1,a," "); if (a[2]+0 <= n) { gsub(/[^0-9.]/,"",$(NF-2)); s += $(NF-2) } }
                       END{ printf "%.3f", s }' .work/build-report.txt
}
$REF/splice-clip.sh .work \
  .work/broll/broll-a0-mixed.mp4 "$(cardend 0)" \
  .work/broll/broll-a3-mixed.mp4 "$(cardend 3)"
# → reel-spliced.mp4 · reel-sub-spliced.mp4 · subs-spliced.srt
```

- **두 칸을 한 번의 호출로 넘긴다.** 스크립트를 두 번 부르면 두 번째 호출이 `reel.mp4`
  를 다시 읽어 첫 접합이 사라진다(입출력 이름이 고정이다). T 는 둘 다 **원본 타임라인
  기준**으로 준다 — 앞 클립이 밀어낼 길이를 미리 더하지 않는다. 미는 계산은 스크립트가
  한다.
- **T 를 눈대중으로 잡지 않는다** — 카드의 확정 길이(프레임 올림 후 초)가 씬 종료
  시각이다. 어림으로 잡으면 그 씬 마지막 프레임이 잘린다.
- 클린본과 번인본을 **같은 T·같은 클립으로 각각** 접합한다. 번인본은 자막이 이미 화면에
  태워져 있어 타임코드 시프트가 필요 없고, 빌더의 ASS 스타일이 그대로 보존된다
  (srt 로 다시 태우면 폰트·위치·아웃라인이 원본과 달라진다).
- `subs.srt` 의 각 큐는 **자기 앞에 끼어든 클립들의 실측 길이 합**만큼 뒤로 밀린다.
  공칭 길이(예: 4초)가 아니라 **재인코딩 후 ffprobe 로 잰 값**을 쓴다 — 프레임 올림
  때문에 수십 ms 가 어긋나고, 그 오차가 영상 끝까지 누적돼 자막이 밀린다.
- **T 를 걸치는 자막 큐가 0 인지 확인한다**(스크립트가 T 별로 보고한다). 걸치면 문장
  중간에 b-roll 이 끼어든다 — 그 T 를 문장 경계로 옮긴다.
- 접합 후 **클린본과 번인본 길이가 일치**하는지 본다. 어긋나면 한쪽 조각이 잘못 잘렸다.
  출력 길이가 "기대"보다 수십 ms 큰 것은 정상이다(조각마다 프레임 경계로 올림된다) —
  칸이 둘이면 조각이 셋이라 그 오차도 조금 커진다.

번인본(`reel-sub.mp4`)을 따로 두는 이유는 하나다 — **인스타그램은 자막 파일을 받는
경로가 없다.** IG Content Publishing 컨테이너에 자막 파라미터가 없어서, 거기서는 화면에
태운 영상만이 자막을 전달하는 방법이다. 두 파일은 같은 원본에서 각각 인코딩되므로
둘 다 1세대이며(클린본 재인코딩이 아니다), 빌더가 길이 일치를 검증한다.

### 7. 빌드 리포트 게이트

`build-report.txt` 를 반드시 읽고 판정한다 — **drift 는 0.0000s 여야 하며**,
`reveal 상태 누락`/`마지막 reveal 상태 미사용` 은 진행 금지 신호다. 전체 판정표는
`references/pipeline.md` §리포트 게이트. 총길이 35~75초 권장, 90초 상한.
`cover.jpg` 가 히어로 수치까지 등장한 프레임인지 확인하고, 아니면 리포트의 커버
전환 완료 시각 이후로 `COVER_TS` 를 잡아 재빌드(또는 ffmpeg 로 해당 시각 스틸만
재추출)한다.

### 8. 폰 모드 검수 (게시 전 필수)

`reel-qa.html` 을 `.work/` 에 복사하고 chrome-devtools 로 **폰 뷰포트 + 플랫폼 UI
오버레이 위에서** 확인한다 — `emulate`(390x844x3,mobile,touch) →
`reel-qa.html?v=./reel-sub.mp4&ui=ig&fit=crop&zone=1` → 씬별 reveal 완료 시점
스크린샷. **자막 검수는 번인본(`reel-sub.mp4`)으로 한다** — 클린본에는 자막이 없어
잘림·침범을 볼 수 없고, 실제로 IG 에 나가는 것도 번인본이다. 점검: 액션바(x≈890)
침범 / 자막 중앙 정렬 / 히어로 수치 잘림 / 첫 프레임만 보고 주제 인지 / **화면
중앙에서 배경 사진이 그대로 보이는지**(밴드 밖 박스·딤이 있으면 슬라이드 룩 —
절대 규칙 14 위반). 문제 시 템플릿 수정 → frame.html 재생성 → 해당 상태만
재캡처 → 재빌드.

### 9. 플랫폼별 텍스트 저작

**첫 문장을 바로 쓰지 말고 진입점 3~4개를 먼저 적는다** — 겪은 일 / 숫자 / 되묻기 /
장면 묘사 중에서 고른다. 그냥 쓰면 모델이 매번 가장 무난한 도입으로 수렴해서, 편마다
카피는 게이트를 통과하는데 채널 피드에서는 전부 같은 목소리로 보인다. 근거 등급은
낮다(영어 창작 프리프린트, 다양성 1.6~2.1배 — `korean-style.md` §근거 등급).

platform-guide 플레이북(`../platform-guide/references/platform-playbook.md`)을 Read
하고 플랫폼별로 재작성한다 — Threads 반말 구어체 1~3줄 + 마지막 줄 영상 링크 /
IG 캡션 첫 125자 훅+저장 CTA / FB 구조화 본문+첫 댓글 링크 문안 / YT 키워드
제목+설명+#Shorts 해시태그. **제목·첫 줄의 자극은 scenes.js 커버 `hookType`
(공포·공감·호기심·결말 미리 보여주기)을 잇는다** — 영상은 공포로 열었는데 YT 제목이
방법 설명이면 제목 기대와 첫 30초가 어긋난다(플레이북 §1 ②·§6). **Threads 는 커버 이미지를 붙이지 않는다** — 링크
프리뷰 카드가 그 자리를 대신하므로 `post.md` 는 본문과 링크 URL 만 담는다. 링크
자리는 IG 릴스 permalink 라 게시 시점까지 값을 모른다 — `post.md` 에는
`<IG_REELS_URL>` 처럼 자리표시자를 두고 실제 URL 은 publish 가 채운다. 각 `output/<플랫폼>/` 에 저장하고, 영상·커버는
`cp .work/reel.mp4 output/video/video.mp4` · `cp .work/reel-sub.mp4 output/video/video-sub.mp4` ·
`cp .work/subs.srt output/video/` · `cp .work/cover.jpg output/video/cover.jpg` ·
`cp .work/build-report.txt output/video/` 로 확정한다 (이후 publish 는 output/ 만 본다).
**세 파일이 다 있어야 게시가 완결된다** — 클린본과 자막 파일은 YouTube·Facebook 으로,
번인본은 Instagram 으로 간다. 하나라도 빠지면 그 플랫폼에서 자막이 사라진다.

저장 직후 표면별로 문체 검사기를 돌린다 — Bash 한 번, LLM 콜 아님.

```bash
CS=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-style.py
python3 "$CS" --selftest >/dev/null 2>&1 \
  || echo "gate_exit=3 (검사기 없음·손상·규칙 레드 — 아래 결과는 전부 미검증)"
for P in threads:output/threads/post.md ig:output/instagram/caption.md \
         fb:output/facebook/post.md yt:output/youtube/meta.md; do
  python3 $CS --surface ${P%%:*} ${P#*:}; echo "[${P%%:*}] gate_exit=$?"
done
```

**같은 채널에 편이 셋 이상 쌓였으면 묶음도 잰다.** 위 검사기는 카피를 한 편씩만 봐서
채널 전체가 한 틀로 찍히는 것을 **원리적으로 못 본다** — 개별 품질과 묶음 다양성은
반대로 움직인다(자매 플러그인 실측: 소재만 바꾼 두 원고가 각각 100/100 인데 서로
겹침 0.77). 회차를 거듭할수록 이 축이 실제 위험이다.

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-batch.py \
  --split ../*/output/threads/post.md
```

반려하지 않는다 — 순위만 나온다. `post.md` 는 본문과 운영 메모가 한 파일이라
`--split` 이 필수다(안 나누면 겹침 상위가 전부 "답글 게시 성공 직후 replyToId" 같은
운영 문구로 찬다 — 실측). **본문 섹션끼리의 쌍**만 보고, 돌려쓴 구절이 이번 편에
있으면 그 문장을 다시 쓴다. 지난 편은 고치지 않는다.

검사기 파일이 없으면 python 이 exit 2 를 낸다 — 판정 2와 구분되지 않으므로 존재
확인 줄을 먼저 둔다. 설치가 깨진 상태를 "전 표면 S1"으로 읽고 멀쩡한 카피를 고치면
안 된다.

exit 2(S1)면 해당 파일을 고쳐 재실행한다. 고칠 때는 **빼기만** 한다 — 없던 비유·
상투구를 새로 심으면 그게 새 AI 티다. 수치·고유명사·해시태그는 건드리지 않는다
(검사기가 이미 그 구간을 가리고 판정한다). exit 3 은 게이트가 안 돈 것이니 통과로
치지 않는다.

exit 1 은 두 갈래다. S2 누적이면 고치고, 머리줄에 `인용면제 N` 이 있으면 출처를
확인한다 — 검사기는 출처가 진짜인지 모른 채 그 위반을 점수에서 뺐다. 원문 인용이
맞으면 그대로 두고 §10 위임 프롬프트에 건수를 적어 넘긴다. 아니면 따옴표를 풀고
우리 문장으로 고친다(따옴표는 면제받는 자리이지 문장을 숨기는 자리가 아니다).

### 10. 품질 게이트 + 완료 보고

content-reviewer 에이전트(Agent)에 산출물 검증을 위임한다 — 영상 프레임
스크린샷(**번인본 `reel-sub.mp4` 에서 뽑은 것** — 클린본에는 자막이 없어 오탈자·잘림을
볼 수 없다)·플랫폼별 카피·scenes.js 를 주고 P0(오탈자·잘림·사실 불일치·플랫폼 금기·
복붙 문장·무설명 전문용어·AI 티) 검출과 축별 점수를 받는다. 위임 프롬프트에
`check-style.py` 경로와 §5·§9 에서 나온 exit code·인용 면제 건수를 함께 넘긴다 —
리뷰어는 그 수치를 정본으로 쓰고 자기 인상으로 덮어쓰지 않는다. 조사 생략 채널이면
그 사실도 위임 프롬프트에 명시한다(리뷰어가 사실 축을 만점 환산한다).
**tail(`CONTENT_REVIEW:`)의 카피 ≥95 이고 P0=0 이 될 때까지 수정(최대 3라운드)** —
미달 시 미해결 지적을 사용자에게 그대로 보고하고 판단을 위임한다.

**첫 3초 점검** (2026-08-15 — 스킵률 실측이 강제. 리뷰어 위임과 별개로 저작자가
직접 한다):

- [ ] 도입 0~3초 구간을 실제로 **본다** — 첫 프레임에 주제 실물 또는 움직임이
      있는가, 표지 카드 한 장이 3초를 정지로 버티고 있지 않은가
- [ ] 첫 세그 TTS 를 실제로 **듣는다** — 로봇 낭독처럼 들리면 그 세그만 재생성
      (faceless 콘텐츠 이탈의 1순위가 도입 목소리 품질이다. 스킵은 3초 안에
      일어나므로 첫 문장의 목소리가 곧 훅이다)

**비용 집계 (필수)** — 회차 원장을 리포트로 만들고 그 결과를 완료 보고에 싣는다.
스토리보드 이미지부터 이번 영상까지가 한 파일에 있으므로, 여기가 그 편에 든 돈을
사람이 처음이자 마지막으로 보는 자리다. 촬영 편집 경로(screencast)도 똑같이 돌린다 —
생성 호출이 거의 없어 합계가 0 에 가깝더라도, 0 이 집계 결과라는 것 자체가 정보다.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
$REF/cost-report.sh .work/cost-tally.tsv > output/video/cost-report.txt; echo "cost_exit=$?"
cat output/video/cost-report.txt
```

`cost_exit` 를 그대로 읽는다 (판정 정본은
[cost-tally.md](../autoproduce/references/cost-tally.md) §exit 읽기).

- **0** — 합계가 그 회차 비용이다.
- **1** — `!!` 줄을 보고에 그대로 옮긴다. `알 수 없는 key` 면 키 이름을 고치고 다시
  돌리고, `단가 미확인` 이면(현재는 BGM 하나) 합계 뒤에 **"집계 제외 1건"** 을 붙여
  적는다. **1을 통과로 읽지 않는다.**
- **3** — 원장이 없다. 이번 회차에 생성 호출이 정말 없었는지 확인하고, 있었으면
  파일을 세어 사후에 채운 뒤 채운 사실을 보고에 적는다.

보고는 **단계와 항목을 함께** 보여준다 — 사용자가 알고 싶은 것은 총액만이 아니라
"어디서 나갔나" 다. 원장 메모의 `storyboard:` / `produce:` 접두어가 그 구분이다.

```
비용 — 이 편에 든 돈 (스토리보드 ~ 영상)
  스토리보드   이미지 6장 (gpt high 2 · 로컬 4)        $0.44
    · 그중 재생성 1장 (§5.5 2라운드)                   $0.22
  제작         b-roll veo lite 1080p 8초 생성           $0.64
               나레이션 1,840자 (로컬)                  $0.00
               BGM 90초                                집계 제외 — 단가 미확인
  ────────────────────────────────────────────────────────────
  합계                                                  $1.08  (+ 집계 제외 1건)
  전문: output/video/cost-report.txt
```

**합계 $0 을 그냥 보고하지 않는다.** 이미지가 생성돼 있는데 합계가 0 이면 공짜로
만든 것이 아니라 원장에 적기를 빠뜨린 것이다. 로컬 이미지·로컬 TTS 만 쓴 회차는
진짜로 0 일 수 있고, 그때는 리포트에 그 줄들이 보인다 — 줄이 있어서 0 인지 줄이
없어서 0 인지를 확인하고 보고한다.

통과하면 storyboard.md `status: produced` 갱신, 산출물 표(경로·길이·
플랫폼)와 비용 요약을 함께 제시하고 `/social-flow:publish` 를 안내한다.

## Additional Resources

### Reference Files

- **`references/pipeline.md`** — 빌드 계약·리포트 게이트 판정표·TTS 장애 3종·팔린드롬 루프·실측 함정 모음
- **`references/screencast-pipeline.md`** — 촬영 편집 경로: edit.json 계약·편집 절차·게이트·함정 (alignment.json 이 있을 때 §2~7 대체)
- **`references/build-screencast.sh`** — 촬영 편집 빌더 (씬 컷→크롭→9:16 합성→자막 번인→BGM 덕킹→아웃트로, 드리프트 0)
- **`references/screencast-overlay.html`** — 씬 타이틀 알파 오버레이 렌더러 (상단 y 190~460 블록, scenes.js 주입)
- **`references/video-template.html`** — 1080×1920 씬 렌더러 (THEME 주입·reveal·alpha·세이프존·오버플로 가드)
- **`references/build-reel.sh`** — 합성 파이프라인 SoT (무음 트림→loudnorm→경계 검출→reveal xfade→켄번즈→자막→아웃트로 접합)
- **`references/build-outro.sh`** — 채널 공용 아웃트로 생성
- **`references/splice-clip.sh`** — 빌드 후 클립 삽입 (b-roll 최대 2칸·시리즈 스팅어). `<클립> <T>` 쌍을 여러 개 받아 **한 번의 실행**으로 접합하고(두 번 나눠 부르면 첫 접합이 지워진다), 클린·번인 각각 처리 + 각 자막 큐를 앞선 삽입들의 실측 길이 합만큼 시프트 + T 걸친 큐·길이 일치 검사
- **`references/capture-frames.sh` / `capture-reveals.sh`** — 헤드리스 캡처 (상태 수 자동 도출)
- **`references/reveal-timing.py`** — 나레이션 '쉼' 역산 reveal 타이밍
- **`references/frame-persona-clip.py`** — 발화 클립 프레이밍 통일 + 팔린드롬
- **`references/reel-qa.html`** — 폰 모드 검수 하네스 (IG/YT UI 목업·crop 재현·세이프존 가이드)
- **`../autoproduce/references/cost-tally.md`** — 회차 비용 원장 규약 (§3·§5 가 적고 §10 이 집계하는 파일). 단가 정본 `prices.tsv` · 계산기 `cost-report.sh` 가 같은 디렉토리에 있다
- **`../channel/references/resolve-asset.py`** — 공용 아웃트로·BGM·효과음·캐릭터 시트 조회 (catalog + 기본 경로 + 옛 `assets/outro.mp4`)
