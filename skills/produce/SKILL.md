---
name: produce
description: >
  This skill should be used when the user asks to "영상 만들어", "콘텐츠 제작",
  "produce the video", "플랫폼별 콘텐츠 만들어", or after a storyboard is approved.
  Converts the approved scenes.js under data/<channel>/<topic>/storyboard/ into a
  narrated 9:16 video (1080x1920/30fps — generated backgrounds, TTS narration, BGM
  with ducking, kinetic subtitles, brand outro) plus per-platform text (Threads,
  Instagram, Facebook, YouTube) under data/<channel>/<topic>/output/, verified on a
  phone viewport before the publish step. When recording/alignment.json exists
  (storyboard-first shooting flow), it instead edits the user's screen recording
  into the 9:16 video (cut per scene, focus crop, title overlays, burned subtitles,
  BGM ducking) via build-screencast.sh.
argument-hint: "<채널> <주제> [플랫폼CSV|auto]"
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "AskUserQuestion", "Agent", "mcp__social-flow__tts_generate", "mcp__social-flow__tts_local_generate", "mcp__social-flow__tts_list_voices", "mcp__social-flow__music_generate", "mcp__social-flow__image_local_generate", "mcp__social-flow__gpt_image_text2img", "mcp__social-flow__veo_img2video", "mcp__social-flow__veo_reference", "mcp__plugin_astra-methodology_chrome-devtools__new_page", "mcp__plugin_astra-methodology_chrome-devtools__navigate_page", "mcp__plugin_astra-methodology_chrome-devtools__emulate", "mcp__plugin_astra-methodology_chrome-devtools__take_screenshot", "mcp__plugin_astra-methodology_chrome-devtools__evaluate_script", "mcp__plugin_astra-methodology_chrome-devtools__close_page"]
---

# 플랫폼별 콘텐츠 제작 — data/[채널]/[주제]/output/

승인된 스토리보드(`storyboard/scenes.js`)를 9:16 나레이션 영상과 플랫폼별 텍스트로
변환한다. **scenes.js 가 유일한 데이터 원천** — 영상 화면·나레이션·자막·캡션이
전부 여기서 파생된다.

```
data/<채널>/<주제>/
├── storyboard/          # 입력 (approved 상태여야 함)
├── .work/               # 중간 산출물 (gitignore — cards/ broll/ pcm/ manifest)
└── output/
    ├── video/           # video.mp4(클린) · video-sub.mp4(번인) · subs.srt · cover.jpg · build-report.txt
    ├── threads/post.md  # 본문 + 답글 체인 문안 (+커버 이미지 참조)
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
10. **커버(첫 화면)는 코드 렌더로만 만든다** — 생성 영상을 커버에 쓰지 않는다.
   **Veo 는 한글을 못 쓴다**(사용자 확인 2026-08-11). 커버는 훅 제목·히어로 수치가
   전부인 화면이라 글자가 깨지면 그 회차가 통째로 못 쓰게 된다. 생성 영상은 **커버
   다음 구간**에 무텍스트 b-roll 로 넣는다.
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
   `cover.jpg`(모든 플랫폼의 썸네일)가 된다. 주제와 무관한 정물·추상 배경 금지 —
   **주제가 한눈에 보이는 실사 인물 장면**(규칙 11 의 인물 계약 그대로)을
   `quality: "high"` 로 만든다. b-roll 이 있는 편은 **커버 배경과 b-roll 소스가 같은
   파일**이다 — 커버(정지+텍스트)가 끝나면 그 사진이 그대로 움직이기 시작하는 전환이
   되고, 이미지 1장이 두 역할을 한다. 텍스트는 여전히 코드 렌더다(규칙 10) — 이 규칙은
   배경 그림 이야기다.
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
- **소스 판별**: `recording/alignment.json` 이 있으면 **촬영 편집 경로**다 —
  §2~7 대신 `references/screencast-pipeline.md` §편집 절차를 따른다 (오버레이
  캡처 → edit.json → build-screencast.sh — TTS·생성 배경·reveal 없음, 음성은
  사용자 육성). 산출물 이름(reel.mp4·reel-sub.mp4·subs.srt·cover.jpg·build-report.txt)이 같으므로
  §8~10(폰 검수·플랫폼 텍스트·품질 게이트)은 그대로 진행한다. 게이트 판정표는
  screencast-pipeline.md 의 것을 쓴다.
- 작업 디렉토리 준비: `.work/{cards,broll,pcm,fonts}` 생성, 플랫폼 목록 확정
  (인자 CSV 또는 profile §4 게시 플랫폼).

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

- **커버 배경 = b-roll 소스 (한 장, `storyboard/images/scene-1.png`)**:
  `gpt_image_text2img`, `size: "1088x1920"`, **`quality: "high"`**. **사람이 있는 실사
  스타일**(절대 규칙 11·12) — 생성 인물만(기본 한국 여성), 채널 주제가 화면 중심이 되는
  각도, 주제가 한눈에 보이는 장면. 프로파일 §3 무드·필수 부정 지시와
  "lower third fading into darkness" 를 상속하되 `face not visible` 은
  **`seen from behind, face turned away`** 로 바꿔 사람이 분명히 보이게 한다.
  커버 캡처(`bg=./scene-1.png`)와 veo 입력이 같은 파일을 쓰므로 커버가 끝나면
  그 사진이 그대로 움직이기 시작한다.
- **도입 b-roll (커버 *다음* 구간)**: 그 커버 배경 PNG 를 `veo_img2video`
  (`aspectRatio: "9:16"` · `resolution: "1080p"` · `durationSeconds: 8` · fast 모델)로
  애니메이션한다. 절대 규칙 8·10 — 소스는 **이미 만들어 둔 이미지**여야 하고,
  **커버 자체는 코드 렌더로 만든다**(Veo 는 한글을 못 쓴다).
  - **생성은 8초, 사용은 필요한 만큼** — 1080p 는 API 가 8초만 허용한다. 본편이
    1080×1920 이라 720p 생성 후 업스케일하지 않는다(사용자 결정 2026-08-11 — 업스케일이
    필요하면 그냥 1080p). 실제로 쓰는 길이는 스토리보드 broll 씬의 `duration`(기본
    4초)이고, §6 접합 직전에 원본 앞부분만 잘라 쓴다. 원본 8초
    (**`.work/broll/cover-broll.mp4`**)는 보관한다 — 재트림의 기준점이다.
  프롬프트는 scenes.js `visual.motion`("very slow push-in / nearly static camera")을
  **영어로 모션만** 옮기고 끝에 오디오 지시를 붙인다 — 예:
  `Audio: quiet studio room tone with a faint fabric rustle, no music, no speech.`
  이미지에 이미 보이는 인물·배경·조명을 다시 묘사하면 모델이 장면을 재설계한다.
  - **팔린드롬 루프를 쓰지 않는다** — 정+역 이어붙이기는 소리가 거꾸로 재생된다
    (절대 규칙 9 로 이 구간은 영상 사운드를 쓴다).
  - 이 구간은 manifest 에 넣지 않고 **빌드 후 접합**한다(§6 끝). 카드당 오디오 1개인
    빌더 계약에 무발화 오디오를 끼우면 발화속도·문장경계 계산이 깨진다.
- **quote 발화 클립**(계획된 경우): `veo_reference`(아바타 1장, 9:16, 720p) —
  프롬프트에 캐릭터 묘사 반복 + "static camera" + "wide chest-up framing … subject
  appears small in the frame" + 배경은 THEME 다크 통일 + "no text, no black bars".
  `frame-persona-clip.py <입력> .work/broll/<화자>-palin.mp4` 로 프레이밍 통일 +
  팔린드롬. 여러 클립은 hstack 으로 나란히 붙여 눈으로 배율을 비교한다. 발화
  클립이 없으면 정지 인용 카드로 대체(불투명 캡처).
- **BGM**: `music_generate`(Lyria, 인스트루멘털) 90초 — "leaves space for a spoken
  voiceover, no melody in the vocal frequency range". **`.work/bgm.wav`** 로 저장
  (build-reel.sh 가 이 이름을 찾는다).

### 4. reveal 상태 캡처

씬마다 `capture-reveals.sh` 로 **상태 수를 스스로 도출**시킨다 (몇 개 찍을지
사람이 고르면 누락 사고가 난다):

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/produce/references
$REF/capture-reveals.sh <idx> "file://$PWD/.work/frame.html?i=<idx>&alpha=1&scrim=1&dim=1" .work/cards/a<idx>r 1
```

| 씬 | URL 파라미터 (reveal= 제외) | 알파 |
|---|---|---|
| **cover (코드 렌더 — 절대 규칙 10)** | `?i=n&bg=./scene-n.png&scrim=1&dim=0` | 0 |
| points (b-roll/모션 위) | `?i=n&alpha=1&scrim=1&dim=1` | 1 |
| points (정지 배경) | `?i=n&bg=./scene-n.png&scrim=1&dim=1` | 0 |
| quote (발화 클립 위) | `?i=n&alpha=1` | 1 |
| quote (정지 인용 카드) | `?i=n&bg=…&scrim=1&dim=2` | 0 |

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
  `capture-frames.sh` 로 다시 찍어 교체한다. 매핑: cover 는 r1←세그①, r2←세그②.
  points 는 r1(제목)←세그①, 캡션 r k 는 그 캡션을 읽는 세그먼트의 삽화.
- `dim=1` 로 통일한다(화이트 워시 기본값). 밝기 고민이 없는 모드라 dim=2 는 안 쓴다.

오버플로 검증: 헤드리스 원샷 캡처로는 `document.title` 을 못 읽으므로,
chrome-devtools 가 있으면 `navigate_page`(같은 URL) 후 `evaluate_script` 로
`window.__overflow === 0` 을 확인하고, 없으면 상태 PNG 를 육안으로 확인한다
(잘림·겹침 — 템플릿이 tight1~3 자동 축소 후 잔여만 노출).

### 5. TTS 생성 (씬당 1콜)

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

로컬 엔진이 "Python interpreter not found" 나 "No module named 'supertonic'" 으로
실패하면 **그 자리에서 멈추고 사용자에게 설치를 요청한다.** Gemini 로 조용히 갈아타지
않는다 — 목소리가 바뀐 채로 영상이 만들어지고, 회차마다 화자가 달라진다.

### 6. manifest 작성 + 빌드

`.work/cards.tsv`·`segs.tsv` 를 scenes.js 에서 변환한다 (탭 구분, 아웃트로 제외):

```
cards.tsv : idx <TAB> 오디오절대경로 <TAB> 목표자/초 <TAB> zoom(in|out|auto)
segs.tsv  : idx <TAB> seg(0부터) <TAB> 비주얼 <TAB> tts문장 <TAB> sub문장
```

비주얼 열: 상태 PNG / `영상.mp4::오버레이.png`(커버·발화) / `A|B`(하위 reveal —
불릿을 묶어 읽은 문장도 화면 등장은 하나씩). 아웃트로는 profile §6 자산을
`.work/outro.mp4` 로 복사만 한다(없으면 `build-outro.sh` 로 최초 1회 생성 후
`data/<채널>/assets/` 에 저장). 자막 폰트를 지정하려면 ttf 를 `.work/fonts/`
에 넣는다(woff2 불가 — 없으면 fontconfig 폴백으로도 게시 품질은 나온다).

```bash
$REF/build-reel.sh .work    # → .work/reel.mp4(클린) · reel-sub.mp4(번인) · subs.srt · cover.jpg · build-report.txt
```

**영상 하나가 아니라 두 벌이 나온다.** 자막은 영상에 태우지 않고 파일로 따로 올리는
것이 이 파이프라인의 원칙이다 — 게시 후에도 자막만 고칠 수 있고, 시청자가 끄고 켤 수
있고, YouTube 는 그 파일로 자동 번역까지 만든다. 번인 자막은 오타 하나에 재인코딩과
재게시를 부른다. 그래서 `reel.mp4` 는 자막이 없는 클린 마스터고, `subs.srt` 가 게시
툴에 함께 넘어간다.

#### 도입 b-roll 접합 (§3 에서 만든 경우)

생성 영상 구간은 **빌드가 끝난 뒤** 커버 씬 종료 시각 T 에 끼워 넣는다. `build-reel.sh`
는 아웃트로만 접합하므로 이건 빌더 밖 후처리다.

접합 전에 **트림 + 음량 정규화 + BGM 을 한 번의 재인코딩**으로 처리한다 — 원본 8초에서
broll 씬 `duration`(사용 길이) 만큼만 자르면서 veo 사운드를 본편 기준으로 맞추고 BGM 을
얹는다(생성 사운드는 본편보다 작다 — 실측 인물 소스 mean −18~−22dB):

```bash
USE=4   # scenes.js broll 씬의 duration — 스토리보드가 정한 사용 길이
ffmpeg -y -i .work/broll/cover-broll.mp4 -stream_loop -1 -i .work/bgm.wav -t $USE \
  -filter_complex "[0:a]loudnorm=I=-20:TP=-2:LRA=7[va];
    [1:a]volume=0.15,afade=t=in:st=0:d=0.4,afade=t=out:st=$((USE-1)):d=1[bg];
    [va][bg]amix=inputs=2:duration=first:normalize=0[a]" \
  -map 0:v -map "[a]" -r 30 -c:v libx264 -profile:v high -level 4.1 -pix_fmt yuv420p \
  -c:a aac -ar 48000 -ac 2 -b:a 192k .work/broll/cover-broll-mixed.mp4
```

**믹스본을 다시 자르지 않는다** — 페이드가 길이 기준으로 박혀 있어, 자르면 끝 페이드가
사라지고 BGM 페이드 위치가 어긋난다. 길이를 바꾸려면 원본 8초에서 다시 믹스한다.
(veo 출력은 24fps 라 30fps 재인코딩이 여기서 함께 일어난다.)

```bash
$REF/splice-clip.sh .work .work/broll/cover-broll-mixed.mp4 <T>
# → reel-spliced.mp4 · reel-sub-spliced.mp4 · subs-spliced.srt
```

- **T 는 `build-report.txt` 의 `card 0` 줄에서 읽는다** — 그 카드의 확정 길이(프레임
  올림 후 초)가 커버 종료 시각이다. 눈대중으로 잡으면 커버 마지막 프레임이 잘린다.
- 클린본과 번인본을 **같은 T·같은 클립으로 각각** 접합한다. 번인본은 자막이 이미 화면에
  태워져 있어 타임코드 시프트가 필요 없고, 빌더의 ASS 스타일이 그대로 보존된다
  (srt 로 다시 태우면 폰트·위치·아웃라인이 원본과 달라진다).
- `subs.srt` 는 **T 이후 큐만** 실측 삽입 길이만큼 뒤로 민다. 공칭 길이(예: 8초)가 아니라
  **재인코딩 후 ffprobe 로 잰 값**을 쓴다 — 프레임 올림 때문에 수십 ms 가 어긋나고,
  그 오차가 영상 끝까지 누적돼 자막이 밀린다.
- **T 를 걸치는 자막 큐가 0 인지 확인한다.** 걸치면 문장 중간에 b-roll 이 끼어든다 —
  T 를 문장 경계로 옮긴다.
- 접합 후 **클린본과 번인본 길이가 일치**하는지 본다. 어긋나면 한쪽 조각이 잘못 잘렸다.

번인본(`reel-sub.mp4`)을 따로 두는 이유는 하나다 — **인스타그램은 자막 파일을 받는
경로가 없다.** IG Content Publishing 컨테이너에 자막 파라미터가 없어서, 거기서는 화면에
태운 영상만이 자막을 전달하는 방법이다. 두 파일은 같은 원본에서 각각 인코딩되므로
둘 다 1세대이며(클린본 재인코딩이 아니다), 빌더가 길이 일치를 검증한다.

### 7. 빌드 리포트 게이트

`build-report.txt` 를 반드시 읽고 판정한다 — **drift 는 0.0000s 여야 하며**,
`reveal 상태 누락`/`마지막 reveal 상태 미사용` 은 진행 금지 신호다. 전체 판정표는
`references/pipeline.md` §리포트 게이트. 총길이 60~75초 권장, 90초 상한.
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

platform-guide 플레이북(`../platform-guide/references/platform-playbook.md`)을 Read
하고 플랫폼별로 재작성한다 — Threads 구어체 1~3줄+답글 체인 / IG 캡션 첫 125자
훅+저장 CTA / FB 구조화 본문+첫 댓글 링크 문안 / YT 키워드 제목+설명+#Shorts
해시태그. 각 `output/<플랫폼>/` 에 저장하고, 영상·커버는
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
미달 시 미해결 지적을 사용자에게 그대로 보고하고 판단을 위임한다. 통과하면 storyboard.md `status: produced` 갱신, 산출물 표(경로·길이·
플랫폼)와 함께 `/social-flow:publish` 를 안내한다.

## Additional Resources

### Reference Files

- **`references/pipeline.md`** — 빌드 계약·리포트 게이트 판정표·TTS 장애 3종·팔린드롬 루프·실측 함정 모음
- **`references/screencast-pipeline.md`** — 촬영 편집 경로: edit.json 계약·편집 절차·게이트·함정 (alignment.json 이 있을 때 §2~7 대체)
- **`references/build-screencast.sh`** — 촬영 편집 빌더 (씬 컷→크롭→9:16 합성→자막 번인→BGM 덕킹→아웃트로, 드리프트 0)
- **`references/screencast-overlay.html`** — 씬 타이틀 알파 오버레이 렌더러 (상단 y 190~460 블록, scenes.js 주입)
- **`references/video-template.html`** — 1080×1920 씬 렌더러 (THEME 주입·reveal·alpha·세이프존·오버플로 가드)
- **`references/build-reel.sh`** — 합성 파이프라인 SoT (무음 트림→loudnorm→경계 검출→reveal xfade→켄번즈→자막→아웃트로 접합)
- **`references/build-outro.sh`** — 채널 공용 아웃트로 생성
- **`references/splice-clip.sh`** — 빌드 후 클립 삽입 (도입 b-roll·시리즈 스팅어). 클린·번인 각각 접합 + 자막 T 이후 실측 시프트 + T 걸친 큐·길이 일치 검사
- **`references/capture-frames.sh` / `capture-reveals.sh`** — 헤드리스 캡처 (상태 수 자동 도출)
- **`references/reveal-timing.py`** — 나레이션 '쉼' 역산 reveal 타이밍
- **`references/frame-persona-clip.py`** — 발화 클립 프레이밍 통일 + 팔린드롬
- **`references/reel-qa.html`** — 폰 모드 검수 하네스 (IG/YT UI 목업·crop 재현·세이프존 가이드)
