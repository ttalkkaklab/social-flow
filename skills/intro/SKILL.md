---
name: intro
description: >
  This skill should be used when the user asks to "인트로 영상 만들어", "채널 인트로",
  "오프닝 영상", "로고 애니메이션 영상", "make a channel intro video", "create a logo
  sting", or right after /social-flow:branding installs the channel profile image.
  Designs 4 intro concepts (character action × mood × sonic logo) for a HITL pick,
  then generates the character-acting intro with veo (mandatory video-generation path),
  reveals the channel name via a deterministic text plate, aligns a Lyria sonic logo
  to the landing frame, gates through brand-reviewer's intro mode (score ≥90, p0=0),
  and installs master/stinger/lockup/sonic assets under data/<slug>/assets/intro/.
argument-hint: "<채널> [추가 지시]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "Agent", "mcp__social-flow__gpt_image_text2img", "mcp__social-flow__gpt_image_img2img", "mcp__social-flow__veo_img2video", "mcp__social-flow__veo_reference", "mcp__social-flow__music_generate_clip", "mcp__social-flow__tts_generate"]
---

# 채널 인트로 영상 — data/[채널]/assets/intro/

채널의 프로필 캐릭터가 **직접 연기하는** 인트로(로고 스팅)를 만든다 —
**컨셉 4종 HITL 선택 → veo 영상 생성(필수 경로) → 채널명 리빌·로고음 정렬 →
적대적 수렴(90점) → HITL 시청 승인** 순서. 시청자가 3초 안에 "무슨 채널인지"
알 수 있도록 채널명·태그라인이 반드시 나오고, 귀에 남는 로고음이 착지 프레임에
정렬된다. 설계 근거는 `references/intro-playbook.md` 가 SoT 다 — **시작 전에
반드시 읽는다.**

## 산출물 (경로 계약)

```
data/<slug>/assets/intro/
├── .work/                          # 중간 산출물 (커밋 제외)
│   ├── brief.md                    # 컨셉 4종 + 선택 결과 + veo 프롬프트 기록
│   ├── lockup.html                 # 락업 카드 인스턴스 (템플릿 치환본)
│   ├── lockup.png                  # 풀 락업 (배경+캐릭터+채널명) 1080×1920
│   ├── text-plate.png              # 투명 텍스트 플레이트 (채널명 리빌용)
│   ├── char-card.png               # 캐릭터 카드 (텍스트 없음 — veo lastImagePath)
│   ├── open-frame.png              # (컨셉에 따라) 오프닝 키프레임
│   ├── intro-raw.mp4               # veo 렌더 (재생성 시 intro-raw-r2.mp4 …)
│   ├── sonic.wav                   # 로고음 작업본
│   ├── frames/                     # 검수 프레임 (build-intro.sh 산출)
│   └── preview.html                # 브라우저 미리보기 (후보·최종 검수)
├── <slug>-intro-master.mp4         # 확정 마스터 (~4.8s — 본편 뒤 접합 클로징·트레일러)
├── <slug>-intro-stinger.mp4        # 스팅어 (≤2.5s — 시리즈 오프너·초압축 결합)
├── <slug>-intro-lockup.png         # 풀 락업 카드 (커버·엔드카드 재사용)
└── <slug>-sonic-logo.wav           # 로고음 (전 영상 공용 — 재생성 금지)
```

## 절차

### 1. 전제 로드

- `data/<slug>/profile.md` — 없으면 중단, `/social-flow:channel add` 안내.
  §1 정체성(주제·타깃·콘텐츠 약속)·§3 THEME·금지 소재를 고정 제약으로.
- **로고(캐릭터) 마스터** `assets/branding/<slug>-logo-master-1024.png` — 없으면
  중단하고 `/social-flow:branding` 을 먼저 안내한다 (인트로는 확정 캐릭터 기준).
- `references/intro-playbook.md` 를 읽는다 — 컨셉 축·프롬프트 골격·검수 기준의 SoT.
- 기존 인트로가 있으면 반드시 확인받는다 — 교체 시 기존 게시물과 브랜드 톤이
  어긋난다. 기존 `<slug>-sonic-logo.wav` 는 **재사용이 기본** (교체는 명시 요청 시).
- `GEMINI_API_KEY` 설정 여부 확인 — 없으면 `music_generate_clip` 이 실패하므로
  로고음 없이 veo 네이티브 사운드만으로 진행함을 §2 에서 미리 고지한다.

### 2. 컨셉 4종 설계 → HITL 선택

플레이북 §3 의 축(캐릭터 동작 × 씬 무드 × 로고음 성격)으로 **서로 다른 컨셉
4종**을 설계한다 — 시그니처 제스처(채널을 상징하는 동작)를 최소 1종에 반드시
포함하고, 감정가(에너지/신뢰/위트/시네마틱)를 분산한다.

AskUserQuestion 1문항·보기 4개로 제시한다 — 각 보기는 라벨(짧은 컨셉명) +
description(동작·무드·로고음 한 줄) + **preview 에 씬 시나리오**(초 단위로
캐릭터가 무엇을 하는지 3~4줄). Other 로 절충("A 동작에 C 무드")·전체 재설계를
받을 수 있다 — 절충이면 반영해 확정, 재설계면 4종을 다시 만든다.

확정 컨셉·시나리오·프롬프트 초안을 `.work/brief.md` 에 기록한다 — 수렴 루프와
재실행의 기준 문서다. 태그라인(§1 콘텐츠 약속 압축, 2줄 이내)도 이때 확정한다.

### 3. 브랜드 카드 3종 캡처 (결정적 — 로고 픽셀은 생성 모델 미통과)

`references/lockup-template.html` 을 `.work/lockup.html` 로 sed 치환한다 —
`{{INK}}`·`{{ACCENT}}`·`{{ACCENT2}}`(profile §3 hex), `{{CHANNEL_NAME}}`,
`{{TAGLINE}}`(줄바꿈은 `<br>`), `{{LOGO_SRC}}`(로고 마스터 — `.work/` 로 복사해
파일명 참조). produce 공유 캡처 스크립트로 3모드를 찍는다:

```bash
CAP=${CLAUDE_PLUGIN_ROOT}/skills/produce/references/capture-frames.sh
W="data/<slug>/assets/intro/.work"
$CAP "file://$PWD/$W/lockup.html?mode=full" "$W/lockup.png" 0
$CAP "file://$PWD/$W/lockup.html?mode=text" "$W/text-plate.png" 1   # 알파 필수
$CAP "file://$PWD/$W/lockup.html?mode=char" "$W/char-card.png" 0
```

캡처 3장을 Read 로 열어 확인한다 — 채널명 오탈자·태그라인 줄바꿈·캐릭터 크롭.
여기서 틀리면 뒤 전부가 틀린다.

태그라인은 화면에 박히면 못 고친다. 문체 게이트를 한 번 통과시킨다(채널명은
고유명사라 검사 대상 밖이다).

```bash
echo "<태그라인>" | python3 ${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-style.py --surface screen -
```

### 4. 오프닝 키프레임 (롱 버전 전용 — 4초 표준에서는 생략)

컨셉이 씬 도입형(소품 있는 미니 씬, 어두운 스튜디오 등)이면
`gpt_image_img2img`(로고 마스터 레퍼런스, 1080×1920)로 첫 프레임을 생성한다
(로컬 기본 경로의 예외 — 레퍼런스 편집은 image_local_generate 에 없다) —
캐릭터 등장 전 상태 또는 실루엣, profile 부정 지시 + "no text" 포함,
`.work/open-frame.png`. 캐릭터 정면 등장형 컨셉이면 생략한다.

### 5. 영상 생성 (veo — 필수 경로)

인트로의 본체는 **반드시 영상 생성 툴로 만든다** — HTML 캡처·ffmpeg 조립만으로
대체하지 않는다 (카드·텍스트는 §7 의 마감 오버레이일 뿐이다).

- **기본 (4초 표준 — 사용자 확정)**: `veo_img2video` — `sourceImagePath` =
  **`char-card.png`** (첫 프레임 = 최종 포즈 카드), aspectRatio `9:16`,
  resolution `720p`, durationSeconds **`4`**, model
  **`veo-3.1-lite-generate-preview`** (Lite 우선 — 1/8 비용). 4초는 **720p
  전용**이고 `lastImagePath` 보간이 **거부**된다(실측 400 — 플레이북 §8.5).
  프롬프트에 "the framing and crop never change" + "returns to the exact
  starting pose by the 3-second mark" 를 넣고, 엔딩 정합은 §7 의 락업
  크로스페이드가 보증한다. 720p 원본은 빌드가 1080×1920 으로 업스케일한다.
  quality(기본) 모델은 §8 에스컬레이션의 마지막 1회에만 쓴다.
- **롱 버전 (트레일러 용도일 때만)**: durationSeconds `8` + resolution `1080p`
  + `lastImagePath` = char-card (첫+끝 보간, §4 오프닝 키프레임 사용 가능).
- **마스코트 연기 강조 컨셉**: `veo_reference` — 로고 마스터(+가능하면 다른
  각도 1~2장)를 referenceImagePaths 로, 9:16. 캐릭터 온모델 유지가 강점.
- 프롬프트는 플레이북 §5 L.O.G.O. 골격: 캐릭터 보존 규칙 → 컨셉의 단일
  제스처(초 단위 시간 배분) → 모션 SFX 서술 + **"no music"** → "ends settled in
  the exact pose of the final frame, last second nearly static" + **"no text,
  no letters, no captions"** + profile 금지 소재. `.work/intro-raw.mp4` 저장.

### 6. 로고음

기존 `<slug>-sonic-logo.wav` 있으면 `.work/sonic.wav` 로 복사만 한다 (소닉
브랜딩 = 반복). 없으면 `music_generate_clip`(Lyria)으로 컨셉의 로고음 서술
(플레이북 §7 — 라이즈→임팩트→테일, 2~3초, no vocals)을 생성해 `.work/sonic.wav`
저장. `GEMINI_API_KEY` 미설정 시 이 단계를 건너뛴다 (veo 네이티브 사운드만).

**보이스 태그 (선택 — 사용자가 원할 때)**: 채널명을 임팩트 있게 낭독한 TTS 를
스팅에 프리믹스한다. `tts_generate` 로 생성하되 **태그 전용 보이스·발성**을
브리프에서 확정한다 (채널 나레이션 보이스와 달라도 된다 — 예: 남성 보이스로
"딸~~깍. 랩↗" 같은 시그니처 발성. 늘임·억양은 텍스트 표기("따알~~깍")와
stylePrompt 로 지시). 무음 트림 후 **낭독 종료를 스팅 임팩트에 정렬**해
사이드체인 덕킹으로 프리믹스(`.work/sonic.wav` 갱신)하고, `TEXT_AT` 을 낭독
시작에 동기화한다(글자 등장 = 낭독 시작). 확정 프리믹스가 `<slug>-sonic-logo.wav`
자산이 된다 — 보이스 태그도 소닉 브랜딩이라 한번 확정하면 바꾸지 않는다.

### 7. 후처리 (build-intro.sh)

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/intro/references
$REF/build-intro.sh "data/<slug>/assets/intro/.work"
```

`.work/` 의 intro-raw.mp4 + lockup.png (+ text-plate.png · sonic.wav)를 읽어
**intro-master.mp4 · intro-stinger.mp4 · frames/** 를 만든다. 정규화(1080×1920/
30fps) → 채널명 플레이트 슬라이드 인 → 실픽셀 락업 크로스페이드 → 홀드 →
로고음 정렬 믹스(-14 LUFS) 순서. 노브(환경변수):

| 노브 | 기본 | 용도 |
|---|---|---|
| `TRIM_START` | 0 | 도입 정체 컷 (주로 롱 버전용 — 4초 표준은 보통 불필요) |
| `TEXT_AT` / `SONIC_AT` | 착지 −1.2s / −0.2s | 리빌·로고음 타이밍 미세 조정 |
| `LOCKUP_XF` / `HOLD` | 0.6 / 0.8 | 락업 전환·엔딩 홀드 |
| `STINGER` | 2.5 | 스팅어 길이 |
| `AUDIO` / `SONIC_VOL` | native / 1.0 | veo 오디오 제거 / 로고음 게인 |

### 8. 적대적 수렴 (brand-reviewer 인트로 모드, 목표 score ≥90 AND p0 = 0)

**brand-reviewer 에이전트(Agent)에 위임한다** — intro-master.mp4·frames/·
lockup.png·profile.md·`.work/brief.md` 경로와 이전 라운드 미해결 지적을 전달하고
"인트로 영상 모드" 임을 명시한다. 판정 tail
`INTRO_REVIEW: score=NN p0=N verdict=PASS|FAIL` 을 파싱한다.

- **PASS** → §9 로.
- **FAIL — 후처리로 해소 가능한 지적** (도입 정체·타이밍 어긋남·음량 밸런스):
  §7 을 노브만 바꿔 재실행한다 (veo 재호출 없음 — 싸다).
- **FAIL — 생성 결함** (캐릭터 오프모델·유사문자·이펙트 범벅): 지적을 플레이북
  §9 교정표로 프롬프트에 반영해 §5 를 재생성한다. **모델 에스컬레이션 계약**:
  ① Lite 로 개선 재생성 **최대 2회** → ② 그래도 FAIL 이면 **마지막 1회만
  기본(quality) 모델**로 렌더 → ③ 그래도 FAIL 이면 하드캡.
- 하드캡 도달 시 최고 점수 버전 + 미해결 지적을 그대로 보고하고 수락 / 루프
  계속 / 컨셉 변경(§2 복귀)을 묻는다 — 점수를 꾸며 통과시키지 않는다.

### 9. HITL 시청 승인 (브라우저)

`references/preview-template.html` 을 `.work/preview.html` 로 치환한다 —
`{{TITLE}}` "인트로 최종 검수", A = intro-master.mp4, B = intro-stinger.mp4,
DESC 에 타임라인(리빌·로고음·락업 시각) 기재. `open` 으로 띄우고 **음소거 해제
후 로고음까지 확인**하도록 안내한 뒤 AskUserQuestion 으로 승인받는다.
수정 요구는 성격에 따라 §7(노브) 또는 §5(재생성)로 돌아간다.

### 10. 설치·보고

```bash
IN="data/<slug>/assets/intro"
cp "$IN/.work/intro-master.mp4"  "$IN/<slug>-intro-master.mp4"
cp "$IN/.work/intro-stinger.mp4" "$IN/<slug>-intro-stinger.mp4"
cp "$IN/.work/lockup.png"        "$IN/<slug>-intro-lockup.png"
cp "$IN/.work/sonic.wav"         "$IN/<slug>-sonic-logo.wav"   # 로고음 새로 만든 경우만
```

profile.md §6 의 **인트로 자산** 라인을 갱신한다(없으면 추가). 보고: 최종
점수·재생성 횟수·타임라인·산출 경로 표 + 용도 안내(플레이북 §1 표 — **쇼트폼
본편 앞에는 붙이지 않는다**를 항상 명시). 플랫폼 채널 페이지(트레일러·프로필
소개)에 올리는 것은 수동 작업임을 밝힌다.

## 규칙

- **영상 본체는 반드시 veo 로 생성한다** — 카드 캡처·ffmpeg 는 마감(텍스트
  리빌·락업 보증·믹스)만 담당한다.
- **컨셉 확정 전에 veo 를 호출하지 않는다** — 선택은 §2 의 텍스트 컨셉 4종으로
  받는다. 영상 후보를 여러 개 생성해 고르는 방식은 비용상 금지.
- **판정 권한은 brand-reviewer(인트로 모드)에만 있다** — 자기 채점으로 루프를
  끝내지 않는다. 점수 조작 금지.
- **채널명·태그라인 텍스트는 생성 모델에 맡기지 않는다** — veo 프롬프트에 항상
  "no text", 텍스트는 락업 카드·플레이트(결정적 렌더)가 담당한다.
- **로고음은 채널 자산** — 한번 확정하면 전 영상에서 재사용, 재생성은 사용자
  명시 시에만.
- HITL 선택 이후 **컨셉 드리프트 금지** — 바꿔야 하면 루프를 멈추고 §2 로
  돌아가 다시 선택받는다.
- 중간 산출물은 `.work/`(gitignore), 확정본 4종만 `assets/intro/`.
- 인트로는 **쇼트폼 본편 앞에 배치하지 않는다** — 기본 용도는 **본편 뒤 접합**
  (브랜드 클로징)·트레일러·시리즈 오프너(훅 뒤). 플레이북 §1 표를 따른다.

## Additional Resources

### Reference Files

- **`references/intro-playbook.md`** — 베스트 프랙티스 SoT (배치·길이·컨셉 축·L.O.G.O. 프롬프트·로고음·마지막 프레임 계약·교정표)
- **`references/lockup-template.html`** — 브랜드 락업 카드 (full/text/char 3모드, 1080×1920 헤드리스 캡처용)
- **`references/build-intro.sh`** — 후처리 렌더 (정규화·텍스트 리빌·락업 크로스페이드·로고음 믹스·스팅어 파생)
- **`references/preview-template.html`** — 브라우저 미리보기 (2슬롯 영상 비교 — 최종 검수·후보 비교 겸용)
