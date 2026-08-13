---
name: channel
description: >
  This skill should be used when the user asks to "채널 만들어", "채널 추가",
  "채널 목록", "프로파일 수정", "add a channel", "set up a content channel",
  or wants to create/update the per-channel directory and profile under data/.
  Creates data/<slug>/profile.md defining target audience, tone, TTS voice, visual
  theme, target platforms, and fact-check policy — the SoT every storyboard/produce/publish
  run reads first.
argument-hint: "[add|list|update] [채널명]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "mcp__social-flow__tts_local_generate", "mcp__social-flow__tts_list_voices"]
---

# 채널 관리 — data/[채널]/profile.md

채널은 social-flow 파이프라인의 최상위 단위다 — 사용자가 운영하는 **콘텐츠 채널
(브랜드) 하나**가 `data/` 디렉토리 하나에 대응하며, 그 산출물이 여러 SNS 플랫폼
(Threads·Instagram·Facebook·YouTube) 계정으로 게시된다. 채널마다 `data/<slug>/`
디렉토리와 `profile.md`(채널 프로파일)를 두며, 이후 모든 스토리보드·제작·게시가
이 프로파일을 **첫 단계에서 로드**해 톤·보이스·테마·플랫폼·검증 정책을 상속받는다.

```
data/
└── <채널 slug>/
    ├── profile.md            # 채널 프로파일 (SoT)
    ├── assets/               # 채널 공용 자산 (outro.mp4, 로고 등 — 선택)
    └── <주제 slug>/          # 게시 주제별 디렉토리 (storyboard 스킬이 생성)
        ├── storyboard/
        └── output/
```

## 인자 해석

`[add|list|update] [채널명]`

- `add <이름>` — 새 채널 생성 (아래 절차)
- `list` — `data/*/profile.md` 를 Glob 으로 찾아 채널·설명·게시 플랫폼을 표로 보고
- `update <이름>` — 기존 profile.md 를 읽고 사용자가 지정한 항목만 수정
- 인자가 없으면 `list` 로 현황을 보여준 뒤 다음 행동을 묻는다

## add 절차

1. **slug 결정** — 채널명을 kebab-case 영문 slug 로 변환해 제안한다
   (예: "베트남 생활" → `vn-life`). 디렉토리·경로에 쓰이므로 한글 slug 는 피한다.
   이미 존재하면 중단하고 update 를 안내한다.

2. **핵심 정보 수집** — AskUserQuestion 으로 다음을 확인한다 (한 번에 최대 4개,
   사용자가 이미 준 정보는 다시 묻지 않는다):
   - 타깃 시청자 (누가, 어떤 순간에 보는가)
   - 톤 (존댓말 설명형 / 반말 톡톡형 / 다큐 나레이션형 등) — 여기서 정한 격식이
     이후 전 산출물의 정본이다. 문체 게이트는 이 격식을 바꾸지 않고 AI 티만
     걷어낸다(platform-guide `references/korean-style.md`)
   - 게시 플랫폼 (threads / instagram / facebook / youtube 중)
   - 사실 검증 정책 (정보성=조사 필수 / 창작·일상=생략)

3. **TTS 보이스 배정** — `mcp__social-flow__tts_list_voices` 결과 또는
   `references/profile-template.md` 의 보이스 예시에서 톤에 맞는 Gemini 보이스를
   1개 제안하고 stylePrompt 를 확정한다. **한번 확정한 voiceName·stylePrompt 는
   이후 절대 바꾸지 않는다** — Gemini TTS 는 스타일 지시를 자연어로 해석하므로
   문구가 흔들리면 회차마다 목소리가 달라진다. 변경은 사용자가 명시할 때만.

4. **비주얼 테마 확정** — `video-template.html` 의 THEME 계약(accent/accent2/ink/brand)에
   맞춰 색을 제안한다. 기본값은 다크 시네마틱(잉크 네이비 + 블루→바이올렛 그라데이션)
   이며, 채널 개성은 accent 색과 배경 무드 프롬프트로 낸다.

5. **profile.md 생성** — `references/profile-template.md` 를 복사해 수집한 값으로
   채운다. 빈 섹션을 남기지 않는다 — 모르는 값은 사용자에게 묻거나 근거 있는
   기본값을 쓰고 `(기본값)` 표기를 붙인다.

6. **SNS 토큰 디렉토리 안내** — 게시 자격증명은 채널별 디렉토리
   `~/.config/social-flow/<slug>/` 에 둔다 (data/<slug> 와 동일 slug — 게시 툴
   `channel` 인자가 이 디렉토리를 가리킨다. 채널 지정 시 기본 토큰 폴백 없음):

   ```bash
   mkdir -p ~/.config/social-flow/<slug> && chmod 700 ~/.config/social-flow/<slug>
   ```

   토큰 발급·파일 규약은 publish 스킬의 `references/token-setup.md` 를 안내하고,
   설정 후 `sns_account_check`(channel=<slug>)로 게시 예정 계정을 확인하게 한다.
   계정을 처음부터 개설해야 하면 플랫폼별 개설 스킬을 안내한다 — 계정 개설·브랜딩·
   API 토큰 발급을 ego lite 로 사용자와 함께 진행한다:
   `/social-flow:setup-threads <채널>` · `/social-flow:setup-instagram <채널>` ·
   `/social-flow:setup-youtube <채널>`.
   토큰 없이도 스토리보드·제작은 진행 가능하다 — 게시 시점까지만 준비되면 된다.

7. **보고** — 생성된 profile.md 전문을 보여주고 다음 단계를 안내한다:
   프로필 이미지(로고)가 없으면 먼저 `/social-flow:branding <채널>` (4종 후보 →
   HITL 방향 선택 → 적대적 수렴), 로고 확정 후 선택적으로
   `/social-flow:intro <채널>` (캐릭터가 연기하는 채널 인트로 영상 — 컨셉 4종
   HITL → veo 생성), 그다음 `/social-flow:storyboard <채널> <주제>`.

## update 절차

1. `data/<slug>/profile.md` 를 Read 한다 (없으면 목록을 보여주고 재확인).
2. 사용자가 지정한 항목만 Edit 한다 — 특히 **TTS 보이스와 THEME 색 변경 시 경고**:
   이미 게시된 영상과 톤이 어긋나며, 채널 공용 outro.mp4 도 다시 만들어야 한다.
3. 변경 전/후를 표로 보고한다.

## 규칙

- **profile.md 가 유일한 SoT** — 톤·보이스·테마를 세션 기억이나 다른 파일에 두지
  않는다. storyboard/produce/publish 스킬은 항상 이 파일을 먼저 읽는다.
- **플랫폼 시그니처는 플랫폼 문법 안에서** — 해시태그·CTA 는 platform-guide 스킬의
  플레이북 한도(Threads 해시태그 ≤1, YouTube 3~5개 등)를 넘지 않게 정의한다.
- 채널 삭제는 제공하지 않는다 — 게시 이력이 담긴 디렉토리라 비가역이다.
  사용자가 원하면 profile.md 상단에 `status: archived` 를 추가하는 방식을 안내한다.

## Additional Resources

### Reference Files

- **`references/profile-template.md`** — profile.md 표준 템플릿 (섹션 구조·THEME 계약·보이스 예시 포함)
