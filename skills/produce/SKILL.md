---
name: produce
description: >
  This skill should be used when the user asks to "영상 만들어", "콘텐츠 제작",
  "produce the video", "채널별 콘텐츠 만들어", or after a storyboard is approved.
  Converts the approved scenes.js under data/<category>/<topic>/storyboard/ into a
  narrated 9:16 video (1080x1920/30fps — generated backgrounds, TTS narration, BGM
  with ducking, kinetic subtitles, brand outro) plus per-channel text (Threads,
  Instagram, Facebook, YouTube) under data/<category>/<topic>/output/, verified on a
  phone viewport before the publish step. When recording/alignment.json exists
  (storyboard-first shooting flow), it instead edits the user's screen recording
  into the 9:16 video (cut per scene, focus crop, title overlays, burned subtitles,
  BGM ducking) via build-screencast.sh.
argument-hint: "<카테고리> <주제> [채널CSV|auto]"
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "AskUserQuestion", "Agent", "mcp__fect-mcp__tts_generate", "mcp__fect-mcp__tts_list_voices", "mcp__fect-mcp__music_generate", "mcp__social-flow__gpt_image_text2img", "mcp__social-flow__veo_text2video", "mcp__social-flow__veo_img2video", "mcp__social-flow__veo_reference", "mcp__plugin_astra-methodology_chrome-devtools__new_page", "mcp__plugin_astra-methodology_chrome-devtools__navigate_page", "mcp__plugin_astra-methodology_chrome-devtools__emulate", "mcp__plugin_astra-methodology_chrome-devtools__take_screenshot", "mcp__plugin_astra-methodology_chrome-devtools__evaluate_script", "mcp__plugin_astra-methodology_chrome-devtools__close_page"]
---

# 채널별 콘텐츠 제작 — data/[카테고리]/[주제]/output/

승인된 스토리보드(`storyboard/scenes.js`)를 9:16 나레이션 영상과 채널별 텍스트로
변환한다. **scenes.js 가 유일한 데이터 원천** — 영상 화면·나레이션·자막·캡션이
전부 여기서 파생된다.

```
data/<카테고리>/<주제>/
├── storyboard/          # 입력 (approved 상태여야 함)
├── .work/               # 중간 산출물 (gitignore — cards/ broll/ pcm/ manifest)
└── output/
    ├── video/           # video.mp4 · cover.jpg · build-report.txt
    ├── threads/post.md  # 본문 + 답글 체인 문안 (+커버 이미지 참조)
    ├── instagram/caption.md
    ├── facebook/post.md
    └── youtube/meta.md  # title · description · tags · thumbnail
```

## 절대 규칙

1. **사실 왜곡 금지** — 나레이션·캡션은 scenes.js 에 이미 있는 사실의 재구성만.
   범위를 상한 하나로 줄이지 않고, 수치를 새로 만들지 않는다.
2. **크로스포스팅 복붙 금지** — "사실은 공유하되 문장은 공유하지 않는다."
   채널마다 어체·종결·정보 밀도를 다시 설계한다 (channel-guide 플레이북).
3. **쉬운 말** — 화면 텍스트·나레이션·자막·캡션 전부. 소리로만 듣고도 이해돼야 한다.
4. **생성 영상은 무드샷·캐릭터 발화만** — 사건 재연·실존 인물·국가 상징·뉴스 화면
   연출 금지. 카드(정지 텍스트)는 코드 렌더만.
5. **브랜딩은 아웃트로에서만** — 본편에 로고·배지를 넣지 않는다(첫 3초를 브랜드가
   먹으면 스킵 신호).
6. **TTS 보이스 고정** — profile.md §2 의 voiceName·stylePrompt 를 한 글자도 바꾸지
   않는다.

## 절차

### 1. 입력 확인

- `storyboard/storyboard.md` frontmatter `status: approved` 확인 — 아니면 중단하고
  `/social-flow:storyboard` 승인부터 안내.
- `data/<카테고리>/profile.md` 로드 (보이스·테마·채널·아웃트로).
- **소스 판별**: `recording/alignment.json` 이 있으면 **촬영 편집 경로**다 —
  §2~7 대신 `references/screencast-pipeline.md` §편집 절차를 따른다 (오버레이
  캡처 → edit.json → build-screencast.sh — TTS·생성 배경·reveal 없음, 음성은
  사용자 육성). 산출물 이름(reel.mp4·cover.jpg·build-report.txt)이 같으므로
  §8~10(폰 검수·채널 텍스트·품질 게이트)은 그대로 진행한다. 게이트 판정표는
  screencast-pipeline.md 의 것을 쓴다.
- 작업 디렉토리 준비: `.work/{cards,broll,pcm,fonts}` 생성, 채널 목록 확정
  (인자 CSV 또는 profile §4 활성 채널).

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

파일 경로는 §6 manifest 가 그대로 참조하므로 아래 규약을 지킨다:

- **커버 모션**: 씬1 배경을 `veo_img2video`(1080p, 8초, fast)로 애니메이션 —
  프롬프트는 scenes.js `visual.motion`("very slow push-in / nearly static camera").
  팔린드롬 루프(정+역방향 16초, `references/pipeline.md` §팔린드롬)로 이음매를
  제거해 **`.work/broll/cover-palin.mp4`** 로 저장.
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
| cover (모션 배경 위) | `?i=n&alpha=1&scrim=1&dim=0` | 1 |
| points (b-roll/모션 위) | `?i=n&alpha=1&scrim=1&dim=1` | 1 |
| points (정지 배경) | `?i=n&bg=./scene-n.png&scrim=1&dim=1` | 0 |
| quote (발화 클립 위) | `?i=n&alpha=1` | 1 |
| quote (정지 인용 카드) | `?i=n&bg=…&scrim=1&dim=2` | 0 |

오버플로 검증: 헤드리스 원샷 캡처로는 `document.title` 을 못 읽으므로,
chrome-devtools 가 있으면 `navigate_page`(같은 URL) 후 `evaluate_script` 로
`window.__overflow === 0` 을 확인하고, 없으면 상태 PNG 를 육안으로 확인한다
(잘림·겹침 — 템플릿이 tight1~3 자동 축소 후 잔여만 노출).

### 5. TTS 생성 (씬당 1콜)

씬마다 `tts_generate` 1콜 — profile 레지스트리 그대로, 대본은 narration 세그먼트의
`tts` 문장들을 마침표로 이어 붙인 전문. `.work/pcm/c<n>.wav`. **생성 직후 ffprobe
로 길이 검사** — 자수/4.5 의 2배를 넘으면 같은 파라미터로 1회 재생성
(Gemini TTS 이상 산출 대처는 `references/pipeline.md` §TTS 장애).
씬을 문장별로 쪼개 여러 콜 하지 않는다(콜 간 목소리 편차).

### 6. manifest 작성 + 빌드

`.work/cards.tsv`·`segs.tsv` 를 scenes.js 에서 변환한다 (탭 구분, 아웃트로 제외):

```
cards.tsv : idx <TAB> 오디오절대경로 <TAB> 목표자/초 <TAB> zoom(in|out|auto)
segs.tsv  : idx <TAB> seg(0부터) <TAB> 비주얼 <TAB> tts문장 <TAB> sub문장
```

비주얼 열: 상태 PNG / `영상.mp4::오버레이.png`(커버·발화) / `A|B`(하위 reveal —
불릿을 묶어 읽은 문장도 화면 등장은 하나씩). 아웃트로는 profile §6 자산을
`.work/outro.mp4` 로 복사만 한다(없으면 `build-outro.sh` 로 최초 1회 생성 후
`data/<카테고리>/assets/` 에 저장). 자막 폰트를 지정하려면 ttf 를 `.work/fonts/`
에 넣는다(woff2 불가 — 없으면 fontconfig 폴백으로도 게시 품질은 나온다).

```bash
$REF/build-reel.sh .work    # → .work/reel.mp4 · cover.jpg · build-report.txt
```

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
`reel-qa.html?v=./reel.mp4&ui=ig&fit=crop&zone=1` → 씬별 reveal 완료 시점
스크린샷. 점검: 액션바(x≈890) 침범 / 자막 중앙 정렬 / 히어로 수치 잘림 / 첫
프레임만 보고 주제 인지. 문제 시 템플릿 수정 → frame.html 재생성 → 해당 상태만
재캡처 → 재빌드.

### 9. 채널별 텍스트 저작

channel-guide 플레이북(`../channel-guide/references/channel-playbook.md`)을 Read
하고 채널별로 재작성한다 — Threads 구어체 1~3줄+답글 체인 / IG 캡션 첫 125자
훅+저장 CTA / FB 구조화 본문+첫 댓글 링크 문안 / YT 키워드 제목+설명+#Shorts
해시태그. 각 `output/<채널>/` 에 저장하고, 영상·커버는
`cp .work/reel.mp4 output/video/video.mp4` · `cp .work/cover.jpg output/video/cover.jpg` ·
`cp .work/build-report.txt output/video/` 로 확정한다 (이후 publish 는 output/ 만 본다).

### 10. 품질 게이트 + 완료 보고

content-reviewer 에이전트(Agent)에 산출물 검증을 위임한다 — 영상 프레임
스크린샷·채널별 카피·scenes.js 를 주고 P0(오탈자·잘림·사실 불일치·채널 금기·복붙
문장·무설명 전문용어) 검출과 축별 점수를 받는다. **P0=0 이 될 때까지 수정
(최대 3라운드)** — 미달 시 미해결 지적을 사용자에게 그대로 보고하고 판단을
위임한다. 통과하면 storyboard.md `status: produced` 갱신, 산출물 표(경로·길이·
채널)와 함께 `/social-flow:publish` 를 안내한다.

## Additional Resources

### Reference Files

- **`references/pipeline.md`** — 빌드 계약·리포트 게이트 판정표·TTS 장애 3종·팔린드롬 루프·실측 함정 모음
- **`references/screencast-pipeline.md`** — 촬영 편집 경로: edit.json 계약·편집 절차·게이트·함정 (alignment.json 이 있을 때 §2~7 대체)
- **`references/build-screencast.sh`** — 촬영 편집 빌더 (씬 컷→크롭→9:16 합성→자막 번인→BGM 덕킹→아웃트로, 드리프트 0)
- **`references/screencast-overlay.html`** — 씬 타이틀 알파 오버레이 렌더러 (상단 y 190~460 블록, scenes.js 주입)
- **`references/video-template.html`** — 1080×1920 씬 렌더러 (THEME 주입·reveal·alpha·세이프존·오버플로 가드)
- **`references/build-reel.sh`** — 합성 파이프라인 SoT (무음 트림→loudnorm→경계 검출→reveal xfade→켄번즈→자막→아웃트로 접합)
- **`references/build-outro.sh`** — 카테고리 공용 아웃트로 생성
- **`references/capture-frames.sh` / `capture-reveals.sh`** — 헤드리스 캡처 (상태 수 자동 도출)
- **`references/reveal-timing.py`** — 나레이션 '쉼' 역산 reveal 타이밍
- **`references/frame-persona-clip.py`** — 발화 클립 프레이밍 통일 + 팔린드롬
- **`references/reel-qa.html`** — 폰 모드 검수 하네스 (IG/YT UI 목업·crop 재현·세이프존 가이드)
