---
name: setup-youtube
description: >
  This skill should be used when the user asks to "유튜브 채널 개설", "유튜브 브랜드
  채널 만들어", "유튜브 API 연동해줘", "쇼츠 붙여줘", "set up a YouTube channel",
  or wants to stand up a LIVE YouTube brand channel for a channel and wire it into
  social-flow. Drives advanced-feature identity verification, brand channel creation,
  branding, and Google OAuth refresh_token issuance through the ego lite browser with
  HITL handoffs (phone·selfie verification·consent), then saves
  <SNS_TOKEN_DIR>/<slug>/youtube-oauth-client.json and verifies with sns_account_check.
  Spans multiple days (verification approval is async) — resumable, detects state and
  continues; a status mode reports what is pending.
argument-hint: "<채널> [status|verify|create|token]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "mcp__social-flow__sns_account_check"]
---

# YouTube 채널 개설 — ego lite HITL

채널(브랜드) 하나에 **살아 있는 YouTube 브랜드 채널을 붙이는** 스킬이다. 고급 기능
신원 인증, 브랜드 채널 생성, 브랜딩, Google OAuth `refresh_token` 발급까지를 ego
lite 로 몰고 가되 **사람 손이 필요한 지점만 넘긴다**. 끝나면
`<SNS_TOKEN_DIR>/<slug>/youtube-oauth-client.json` 이 저장되고 쇼츠를
`channel: "<slug>"` 로 게시할 수 있다.

**이 개설은 여러 날에 걸친다** — 새 브랜드 채널을 만들려면 고급 기능 신원 인증
(전화 + 6초 셀피 영상)이 필요하고 그 **승인이 비동기(수 시간~수 일)**다. 그래서
선형 1회 실행이 아니라 **상태를 탐지해 이어 가는** 구조로 짠다. 승인 대기 중에는
`status` 로 현황만 본다.

개설 스킬은 플랫폼별로 분리한다 — 성장 스킬(`grow-<플랫폼>`)과 나란한
`setup-<플랫폼>` 계열이다. Threads·Instagram 이 Meta 쪽이라면 YouTube 는 Google 쪽
이라 콘솔·OAuth 가 아예 다르다.

## 무엇을 자동으로, 무엇을 넘기나

ego lite 로 페이지 이동·폼 입력·동의 진행까지 자동으로 한다. 다음은 사람 게이트라
**사용자에게 넘긴다**:

- **신원 인증** — 전화번호 수신 코드, QR 로 폰에서 찍는 6초 셀피 영상. 사람만 가능.
- **Google 로그인·2FA** — 계정 인증.
- **동의 스코프 체크박스** — 스코프마다 사용자가 직접 체크(§token 함정).

핸드오프는 `handOffTaskSpace` → 사용자 완료 확인 → `takeOverTaskSpace`.

## 전제 조건

- `data/<slug>/profile.md` 가 있어야 한다 — 없으면 `/social-flow:channel add` 안내
  후 중단.
- **ego lite**(`ego-browser` CLI) — 이 머신의 도구. 없으면 §수동 폴백.
- **Google Cloud OAuth 클라이언트**(데스크톱) — `client_id`/`client_secret`. 기존
  채널의 것을 재사용해도 된다(같은 Google 프로젝트).
- YouTube Data API v3 활성화. 성장 루프(grow-youtube)까지 쓰려면 YouTube
  Analytics API 도 켠다.

## 절대 규칙 (위반 시 즉시 중단)

1. **활성 채널 확인 — 매 작업 전** — 하나의 Google 계정에 **여러 브랜드 채널**이
   달릴 수 있다. 채널 전환기로 개설 대상 채널을 고른 뒤 **URL 의 채널 ID·화면으로
   활성 채널을 확인**하고 진행한다. 다른 브랜드 채널의 Studio·설정·업로드·브랜딩은
   절대 건드리지 않는다. 확신이 서지 않으면 멈추고 사용자에게 확인한다.
2. **토큰 값 비노출** — `refresh_token`·`client_secret` 을 화면·로그·커밋에 평문으로
   남기지 않는다. JSON 파일로만, `chmod 600`.
3. **채널 디렉토리에만 저장** — `<SNS_TOKEN_DIR>/<slug>/youtube-oauth-client.json`.
4. **프로덕션 단계에서만 발급** — OAuth 동의 화면이 "테스트 중" 상태면 발급된
   `refresh_token` 이 **7일 만에 만료**된다. 반드시 동의 화면을 "프로덕션" 으로
   게시한 뒤 발급한다(§token 함정).
5. **사람 게이트는 넘긴다** — 신원 인증·로그인·동의 체크를 자동으로 뚫지 않는다.

## 상태 탐지·재개 (기본 호출)

승인 대기로 며칠이 걸리니 **기본 호출은 현재 상태를 판정하고 다음 단계로 이어
간다**. 아래 순서로 확인한다:

1. `<SNS_TOKEN_DIR>/<slug>/youtube-oauth-client.json` 이 있으면 →
   `sns_account_check(channel)` 검증. ok 면 **완료** — 채널·스코프 요약 후 끝.
2. 브랜드 채널은 있는데 토큰이 없으면(사용자 확인) → §3 OAuth 토큰부터.
3. 고급 기능 인증은 승인됐는데 채널이 없으면 → §2 채널 생성부터.
4. 신원 인증 제출은 했는데 미승인이면 → **대기 보고**(status 와 동일). 재촉하지
   말고 Gmail·계정 페이지로만 승인 여부를 확인한다(다른 브랜드 Studio 접근 금지).
5. 아무것도 없으면 → §1 신원 인증부터.

서브커맨드: `verify`(신원 인증) · `create`(채널 생성+브랜딩) · `token`(OAuth) ·
`status`.

## 1단계 · 고급 기능 신원 인증 (verify)

새 브랜드 채널 생성에는 고급 기능이 필요하고, 고급 기능은 신원 인증을 요구한다.

절차: `youtube.com/verify` 또는 스튜디오 설정 > 채널 > 기능 사용 자격에서 고급 기능
신청 → **전화번호 인증**(수신 코드 사용자 입력) → **6초 셀피 영상**(QR 을 폰으로
찍어 촬영·제출). 둘 다 사람 게이트다 — 화면을 핸드오프해 사용자가 진행한다.

제출하면 **승인이 비동기**다(수 시간~수 일). 제출 후에는 이 단계를 "대기" 로 두고
`status`/기본 호출로만 승인 여부를 확인한다 — **Gmail(승인 메일) 또는 계정 단위
페이지로만** 본다. 다른 브랜드 채널의 Studio 를 열어 확인하지 않는다(절대 규칙 1).

## 2단계 · 브랜드 채널 생성 + 브랜딩 (create) — 승인 후

고급 기능이 승인된 뒤에만 가능하다.

1. **브랜드 채널 생성** — `youtube.com/account` > 채널 만들기 > 브랜드 계정으로
   새 채널. 채널명은 profile.md 의 브랜드명. 생성 직후 **활성 채널이 방금 만든
   채널인지 URL 채널 ID 로 확인**한다(절대 규칙 1).
2. **브랜딩 적용** — 프로필 사진·배너 **자산은 `/social-flow:branding <채널>`
   산출물**을 쓴다(이 스킬은 만들지 않고 적용만). 스튜디오 맞춤설정 > 브랜딩에서
   프로필 사진(`profile-1024`)·배너(`banner-youtube-2048x1152`) 업로드, 설명·링크
   반영. **개설 대상 채널에서만** 한다.

## 3단계 · Google OAuth refresh_token (token)

기존 OAuth 클라이언트(`client_id`/`client_secret`)를 재사용하고, 개설 대상 채널을
선택해 동의로 `refresh_token` 을 새로 발급한다. `references/setup-playbook.md`
§3~§4 를 정본으로 한다. 요지:

- **프로덕션 단계 필수** — 동의 화면이 "테스트 중" 이면 refresh_token 이 7일 만료.
  프로덕션으로 게시 후 발급한다(절대 규칙 4).
- **루프백 리디렉션** — `redirect_uri=http://localhost:<PORT>` 로 authorize 를 열고
  scratchpad 의 작은 리스너로 code 를 받는다(playbook §3 에 리스너 포함).
- **채널 선택** — 동의 중 계정/채널 선택에서 **개설 대상 브랜드 채널**을 고른다.
  엉뚱한 채널을 고르면 그 채널 토큰이 발급된다(절대 규칙 1).
- **미인증 앱 경고** — "고급 → 이동" 으로 진행.
- **스코프 체크박스를 하나씩 다 켠다** — 미체크로 계속하면 "액세스를 허용하지
  않음" 이 뜨고 스코프 없는 code 가 발급된다. 필요 스코프:

  | 스코프 | 무엇이 열리나 | 시점 |
  |---|---|---|
  | `youtube.upload` | 영상 업로드 | 게시(필수) |
  | `youtube.force-ssl` | 자막 업로드 + 댓글 조회·답글 | 게시(필수)·성장 |
  | `youtube.readonly` | 채널·영상 조회 | 성장 |
  | `yt-analytics.readonly` | 기간 지표(조회·시청·구독 증감) | 성장 |
  | `yt-analytics-monetary.readonly` | 수익 지표 | 선택 |

  `force-ssl` 이 빠지면 **영상은 올라가고 자막만 실패**한다(이 파이프라인은 자막을
  `captions.insert` 로 따로 올린다). 게시만 할 거면 앞 둘로 되지만, 나중에 성장
  스코프를 늘리려면 재발급이 필요하니 처음부터 다 켜 두길 권한다.

## 저장·검증·기록

1. `<SNS_TOKEN_DIR>/<slug>/youtube-oauth-client.json` 에
   `{"client_id","client_secret","refresh_token"}` 저장, `chmod 600`. **값 비노출.**
2. `sns_account_check(channel=<slug>)` → youtube ok, 채널명·채널 ID 확인. 이때
   **채널 ID 가 개설 대상이 맞는지** 재확인한다(다른 브랜드 채널 토큰이 아닌지).
3. `data/<slug>/profile.md` §8 의 YouTube 행 갱신(채널명·채널 ID·발급일·스코프,
   상태 "✅ API 연동 완료").
4. 한 줄 보고 + 다음 단계(`/social-flow:grow-youtube <채널> init`).

## status — 현황 보고

토큰 유무 + `sns_account_check` 로 연동 상태만 요약한다. 미완이면 어느 단계에서
멈췄는지 — 특히 **신원 인증 승인 대기**인지 — 를 짚는다. 승인 대기 중이면 Gmail
확인만 권하고 재촉·재제출을 유도하지 않는다. 게시·변경 없음.

## 수동 폴백 (ego lite 없을 때)

신원 인증·채널 생성·브랜딩은 사용자가 직접 하고, 이 스킬은 **토큰 발급만** 돕는다:
루프백 리스너를 띄우고 authorize URL 을 만들어 사용자에게 주면 → 사용자가 브라우저
에서 개설 대상 채널로 동의(스코프 전부 체크) → 리스너가 code 를 받아 playbook §4
로 `refresh_token` 교환. 절대 규칙(프로덕션 단계·활성 채널·토큰 비노출)은 그대로.

## Additional Resources

- **`references/setup-playbook.md`** — ego 조작 원칙, 신원 인증·채널 생성 실측,
  루프백 리스너 + OAuth code 교환·refresh_token 발급 절.
