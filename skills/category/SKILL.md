---
name: category
description: >
  This skill should be used when the user asks to "카테고리 만들어", "카테고리 추가",
  "카테고리 목록", "프로파일 수정", "add a category", "set up a content category",
  or wants to create/update the per-category directory and profile under data/.
  Creates data/<slug>/profile.md defining target audience, tone, TTS voice, visual
  theme, channels, and fact-check policy — the SoT every storyboard/produce/publish
  run reads first.
argument-hint: "[add|list|update] [카테고리명]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion"]
---

# 카테고리 관리 — data/[카테고리]/profile.md

카테고리는 social-flow 파이프라인의 최상위 단위다. 카테고리마다 `data/<slug>/` 디렉토리와
`profile.md`(카테고리 프로파일)를 두며, 이후 모든 스토리보드·제작·게시가 이 프로파일을
**첫 단계에서 로드**해 톤·보이스·테마·채널·검증 정책을 상속받는다.

```
data/
└── <카테고리 slug>/
    ├── profile.md            # 카테고리 프로파일 (SoT)
    ├── assets/               # 카테고리 공용 자산 (outro.mp4, 로고 등 — 선택)
    └── <주제 slug>/          # 게시 주제별 디렉토리 (storyboard 스킬이 생성)
        ├── storyboard/
        └── output/
```

## 인자 해석

`[add|list|update] [카테고리명]`

- `add <이름>` — 새 카테고리 생성 (아래 절차)
- `list` — `data/*/profile.md` 를 Glob 으로 찾아 카테고리·설명·활성 채널을 표로 보고
- `update <이름>` — 기존 profile.md 를 읽고 사용자가 지정한 항목만 수정
- 인자가 없으면 `list` 로 현황을 보여준 뒤 다음 행동을 묻는다

## add 절차

1. **slug 결정** — 카테고리명을 kebab-case 영문 slug 로 변환해 제안한다
   (예: "베트남 생활" → `vn-life`). 디렉토리·경로에 쓰이므로 한글 slug 는 피한다.
   이미 존재하면 중단하고 update 를 안내한다.

2. **핵심 정보 수집** — AskUserQuestion 으로 다음을 확인한다 (한 번에 최대 4개,
   사용자가 이미 준 정보는 다시 묻지 않는다):
   - 타깃 시청자 (누가, 어떤 순간에 보는가)
   - 톤 (존댓말 설명형 / 반말 톡톡형 / 다큐 나레이션형 등)
   - 활성 채널 (threads / instagram / facebook / youtube 중)
   - 사실 검증 정책 (정보성=조사 필수 / 창작·일상=생략)

3. **TTS 보이스 배정** — `mcp__fect-mcp__tts_list_voices` 결과 또는
   `references/profile-template.md` 의 보이스 예시에서 톤에 맞는 Gemini 보이스를
   1개 제안하고 stylePrompt 를 확정한다. **한번 확정한 voiceName·stylePrompt 는
   이후 절대 바꾸지 않는다** — Gemini TTS 는 스타일 지시를 자연어로 해석하므로
   문구가 흔들리면 회차마다 목소리가 달라진다. 변경은 사용자가 명시할 때만.

4. **비주얼 테마 확정** — `video-template.html` 의 THEME 계약(accent/accent2/ink/brand)에
   맞춰 색을 제안한다. 기본값은 다크 시네마틱(잉크 네이비 + 블루→바이올렛 그라데이션)
   이며, 카테고리 개성은 accent 색과 배경 무드 프롬프트로 낸다.

5. **profile.md 생성** — `references/profile-template.md` 를 복사해 수집한 값으로
   채운다. 빈 섹션을 남기지 않는다 — 모르는 값은 사용자에게 묻거나 근거 있는
   기본값을 쓰고 `(기본값)` 표기를 남긴다.

6. **보고** — 생성된 profile.md 전문을 보여주고, 다음 단계
   (`/social-flow:storyboard <카테고리> <주제>`)를 안내한다.

## update 절차

1. `data/<slug>/profile.md` 를 Read 한다 (없으면 목록을 보여주고 재확인).
2. 사용자가 지정한 항목만 Edit 한다 — 특히 **TTS 보이스와 THEME 색 변경 시 경고**:
   이미 게시된 영상과 톤이 어긋나며, 카테고리 공용 outro.mp4 도 다시 만들어야 한다.
3. 변경 전/후를 표로 보고한다.

## 규칙

- **profile.md 가 유일한 SoT** — 톤·보이스·테마를 세션 기억이나 다른 파일에 두지
  않는다. storyboard/produce/publish 스킬은 항상 이 파일을 먼저 읽는다.
- **채널 시그니처는 채널 문법 안에서** — 해시태그·CTA 는 channel-guide 스킬의
  플레이북 한도(Threads 해시태그 ≤1, YouTube 3~5개 등)를 넘지 않게 정의한다.
- 카테고리 삭제는 제공하지 않는다 — 게시 이력이 담긴 디렉토리라 비가역이다.
  사용자가 원하면 profile.md 상단에 `status: archived` 를 추가하는 방식을 안내한다.

## Additional Resources

### Reference Files

- **`references/profile-template.md`** — profile.md 표준 템플릿 (섹션 구조·THEME 계약·보이스 예시 포함)
