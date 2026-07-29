---
name: branding
description: >
  This skill should be used when the user asks to "프로필 이미지 만들어", "채널 로고
  만들어", "브랜딩 이미지 생성", "make a channel profile image", "generate a channel
  logo", or right after /social-flow:channel add when the channel has no logo asset.
  Collects an image brief via AskUserQuestion, generates 4 candidate profile images
  in distinct style directions with gpt_image, opens a browser contact sheet for a
  HITL direction pick, then refines the chosen image through an adversarial review
  loop (brand-reviewer agent) until score ≥95 with zero P0 defects, and installs the
  master + platform resizes under data/<slug>/assets/branding/ with profile.md updated.
argument-hint: "<채널> [추가 지시]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "Agent", "mcp__social-flow__gpt_image_text2img", "mcp__social-flow__gpt_image_img2img"]
---

# 채널 프로필 이미지 — data/[채널]/assets/branding/

채널의 프로필 이미지(로고·아바타)를 **브리프 수집 → 4종 후보 생성 → HITL 방향
선택(브라우저) → 적대적 수렴(95점)** 순서로 제작한다. 확정본은 채널의 모든
플랫폼 계정 프로필에 쓰이는 브랜드 원본이므로, 자기 채점이 아니라
**brand-reviewer 에이전트의 판정으로만** 완료를 선언한다.

## 산출물 (경로 계약)

```
data/<slug>/assets/branding/
├── .work/                          # 후보·반복본·선택 페이지 (커밋 제외)
│   ├── brief.md                    # 수집한 브리프 + 4종 방향 프롬프트 기록
│   ├── candidate-{a,b,c,d}.png     # 방향성 후보 4종 (1024×1024)
│   ├── selection.html              # 브라우저 선택 페이지
│   └── iter-{0..5}.png / -192.png  # 수렴 루프 반복본 + 평가용 리사이즈
├── <slug>-logo-master-1024.png     # 확정 마스터
├── <slug>-logo-youtube-800.png     # 플랫폼별 리사이즈 (sips 파생)
├── <slug>-logo-instagram-320.png
└── <slug>-logo-192.png
```

## 절차

### 1. 프로파일 로드

`data/<slug>/profile.md` 를 읽는다 — 없으면 중단하고 `/social-flow:channel add` 를
안내한다. §1 정체성·§3 THEME(accent/accent2/ink)·금지 소재를 브리프의 고정
제약으로 삼는다. **기존 로고가 이미 있으면** 반드시 확인받는다 — 이미 플랫폼
계정에 올라간 프로필과 어긋나게 되고, 교체 시 전 플랫폼 재업로드가 필요하다.

### 2. 브리프 수집 (AskUserQuestion — 최대 4개, 이미 준 정보는 재질문 금지)

- **주체**: 마스코트 캐릭터(동물/사물 의인화) | 사람형 캐릭터 | 추상 심볼 |
  타이포 중심
- **이미지 내 텍스트**: 없음(권장 — 소형 아바타에서 글자는 뭉개진다) |
  이니셜 2~4자 | 채널명
- **배경**: THEME ink 단색 | ink→accent 그라데이션 | 장면형(소품 있는 미니 씬)
- **필수 모티프**: 꼭 들어가야 할 사물·행동·표정 (자유 입력 — 채널 정체성에서
  후보를 제안하되 Other 로 받는다)

답변을 `.work/brief.md` 에 기록한다 — 수렴 루프와 재실행의 기준 문서다.

### 3. 후보 4종 생성

`gpt_image_text2img`(size "1024x1024")로 **서로 다른 스타일 방향** 4종을 생성해
`.work/candidate-{a,b,c,d}.png` 에 저장한다. 기본 방향(브리프에 따라 대체 가능):

- **A flat-mascot** — 플랫 벡터 마스코트, 두꺼운 아웃라인, 단순 셰이프
- **B render-3d** — 소프트 3D 캐릭터 렌더, 스튜디오 라이팅
- **C emblem** — 미니멀 심볼·엠블럼, 기하 도형화, 네거티브 스페이스
- **D illust** — 회화적 일러스트, 질감·라이팅 무드 강조

프롬프트 공통 골격 (4종 모두 동일, 스타일 서술만 교체):

- 주체·모티프(브리프) + THEME hex 명시("dominant background #<ink>, key accent
  #<accent>") + "square 1:1 social media avatar, subject centered within the
  central 70% safe area for circular crop"
- 부정 지시: "no watermark, no signature, no photo frame, no stock-photo look"
  + 텍스트 배제 시 "no text, no letters" + profile 금지 소재

### 4. HITL 방향 선택 (브라우저)

1. `references/selection-template.html` 을 `.work/selection.html` 로 복사하고
   토큰(`{{CHANNEL}}`, `{{IMG_A}}`~`{{IMG_D}}`, `{{LABEL_*}}`, `{{DESC_*}}`)을
   sed 로 치환한다 — 이미지는 같은 디렉토리라 파일명만 넣으면 된다.
2. `open .work/selection.html` 로 기본 브라우저에 띄운다 — 각 후보의 원본과
   **원형 크롭 미리보기(대·소)** 가 함께 보인다 (실제 플랫폼 노출 형태).
3. AskUserQuestion 으로 A~D 중 선택받는다. Other 로 "B 로 하되 표정은 A처럼"
   같은 절충 지시나 전체 재생성 요구를 받을 수 있다 — 절충·재생성이면 §3 을
   조정 반영해 반복한다 (선택 라운드에 횟수 제한은 없다).

### 5. 적대적 수렴 루프 (brand-reviewer, 목표 score ≥95 AND p0 = 0)

선택본을 `.work/iter-0.png` 으로 복사하고 반복한다 (**하드캡 5회**):

1. `sips -z 192 192 iter-N.png --out iter-N-192.png` 로 평가용 소형본을 만든다.
2. **brand-reviewer 에이전트(Agent)에 위임** — iter-N.png·iter-N-192.png·
   profile.md·`.work/brief.md` 경로와 이전 라운드 미해결 지적을 전달한다.
   판정 tail `BRANDING_REVIEW: score=NN p0=N verdict=PASS|FAIL` 을 파싱한다.
3. **PASS(score ≥95 이고 p0 = 0)** → §6 으로.
4. **FAIL** → 지적을 교정 지시로 변환해 `gpt_image_img2img` 로 수정한다.
   - 레퍼런스 = **현재 최고 점수 이미지** (직전본이 아니라 — 퇴행 방지)
   - 프롬프트 = §3 의 방향 프롬프트 + 교정 지시만 추가. **전면 재서술 금지** —
     방향성이 드리프트하면 사용자가 고른 HITL 결정을 무효화하는 것이다.
   - 같은 지적이 2회 연속 반복되면 전략을 바꾼다: 마스크 인페인팅으로 문제
     영역만 수정하거나, 해당 요소를 제거하는 쪽으로 프롬프트를 뒤집는다.
5. 하드캡 도달 시 **최고 점수 버전 + 미해결 지적**을 사용자에게 그대로 보고하고
   수락 / 루프 계속 / 방향 변경(§4 복귀)을 묻는다 — 점수를 꾸며 통과시키지 않는다.

### 6. 확정·배포·보고

```bash
BR="data/<slug>/assets/branding"
cp "$BR/.work/iter-<최종>.png" "$BR/<slug>-logo-master-1024.png"
sips -z 800 800 "$BR/<slug>-logo-master-1024.png" --out "$BR/<slug>-logo-youtube-800.png"
sips -z 320 320 "$BR/<slug>-logo-master-1024.png" --out "$BR/<slug>-logo-instagram-320.png"
sips -z 192 192 "$BR/<slug>-logo-master-1024.png" --out "$BR/<slug>-logo-192.png"
```

profile.md §1 의 **로고 자산** 라인을 마스터 경로로 갱신한다(없으면 추가).
보고: 최종 점수·반복 횟수·P0 이력·산출 경로 표 + 다음 단계 안내 — 채널 인트로
영상 `/social-flow:intro <채널>` (확정 캐릭터가 연기하는 인트로 — 선택), 본편
`/social-flow:storyboard <채널> <주제>`. 각 플랫폼 계정 프로필에 올리는
것은 수동 작업임을 명시한다 (플랫폼 API 는 프로필 이미지 교체를 지원하지 않는다).

## 규칙

- **판정 권한은 brand-reviewer 에만 있다** — 스킬 실행자가 이미지를 보고 "충분해
  보인다"로 루프를 끝내지 않는다. 점수 조작·자기 채점 종료 금지.
- **후보·반복본은 `.work/`** (gitignore 등록) — 확정본 4종만 `assets/branding/`.
- **이미지 내 텍스트는 기본 배제** — 사용자가 명시로 원할 때만 이니셜 2~4자.
- **실존 인물·기존 캐릭터 모사 금지** — README 안전 계약 승계. profile 금지
  소재는 프롬프트 부정 지시에 항상 포함한다.
- 방향성(스타일)은 §4 의 HITL 선택 이후 **수렴 루프에서 바꾸지 않는다** — 바꿔야
  할 상황이면 루프를 멈추고 §4 로 돌아가 다시 선택받는다.

## Additional Resources

### Reference Files

- **`references/selection-template.html`** — 4종 후보 브라우저 선택 페이지 (2×2 그리드 + 원형 크롭 미리보기, 토큰 치환용)
