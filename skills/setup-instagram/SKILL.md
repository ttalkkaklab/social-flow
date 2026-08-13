---
name: setup-instagram
description: >
  This skill should be used when the user asks to "인스타 채널 개설", "인스타그램
  계정 만들어", "인스타 API 연동해줘", "릴스 붙여줘", "set up an Instagram
  channel/account", or wants to stand up a LIVE Instagram (professional) account for a
  channel and wire it into social-flow. Drives account signup, professional conversion,
  profile branding, Meta app tester setup (Instagram API with Instagram Login — NOT
  Basic Display), and OAuth token issuance through the ego lite browser with HITL
  handoffs (login·verification code·consent), then saves the 60-day token to
  <SNS_TOKEN_DIR>/<slug>/instagram_token and verifies with sns_account_check.
  Resumable — detects what is already done and continues from the first unfinished step.
argument-hint: "<채널> [status|signup|brand|token]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "mcp__social-flow__sns_account_check"]
---

# Instagram 채널 개설 — ego lite HITL

채널(브랜드) 하나에 **살아 있는 Instagram 계정을 붙이는** 스킬이다. 계정 개설,
프로페셔널 전환, 프로필 브랜딩, Meta 앱 테스터 설정, OAuth 토큰 발급까지를 ego
lite 로 몰고 가되 **사람 손이 필요한 지점만 사용자에게 넘긴다**. 끝나면 60일 장기
토큰이 `<SNS_TOKEN_DIR>/<slug>/instagram_token` 에 저장되고 릴스를
`channel: "<slug>"` 로 게시할 수 있다.

개설 스킬은 플랫폼별로 분리한다 — 성장 스킬(`grow-<플랫폼>`)과 나란한
`setup-<플랫폼>` 계열이다. Threads 와 Meta 앱을 공유하지만 **발급 경로가 다르다**
— IG 는 "Instagram API with Instagram Login"(비즈니스 로그인)이고, "Basic Display
API" 가 아니다(§token 함정).

## 무엇을 자동으로, 무엇을 넘기나

ego lite 로 폼 입력·페이지 이동·동의 클릭까지 자동으로 한다. 다음은 자동화가
소프트블록되니 **사용자에게 넘긴다**:

- **로그인 버튼 클릭** — 자동 클릭 시 "Instagram에 연결할 수 없습니다"
  소프트블록. 아이디·비밀번호는 채우고 버튼만 사용자가 누른다.
- **인증코드·reCAPTCHA·생년월일** — 사람 게이트. 웹 로그인 자동화 시 reCAPTCHA
  챌린지가 뜬다.

핸드오프는 `handOffTaskSpace` → 사용자 완료 확인 → `takeOverTaskSpace`.

## 전제 조건

- `data/<slug>/profile.md` 가 있어야 한다 — 없으면 `/social-flow:channel add` 안내
  후 중단.
- **ego lite**(`ego-browser` CLI) — 이 머신의 도구다. 없으면 §수동 폴백.
- Meta 개발자 앱(Instagram 제품). App ID·Secret 은 채널 디렉토리 앱 env 에 둔다.
- **프로페셔널 계정 필수** — 개인 계정은 Graph API 연동 자체가 불가하다. 개설 중
  비즈니스/크리에이터로 전환한다. 계정 유형은 API 로 못 바꾸고 앱/웹 UI 전용이다.

## 절대 규칙 (위반 시 즉시 중단)

1. **토큰 값 비노출** — 토큰·시크릿·비밀번호를 화면·로그·커밋에 평문으로 남기지
   않는다. 파일로만, `chmod 600`.
2. **채널 디렉토리에만 저장** — 토큰은 `<SNS_TOKEN_DIR>/<slug>/instagram_token`.
   가입 비밀번호는 같은 디렉토리 `instagram.credentials` 규약 파일로.
3. **공유 계정 보호** — 같은 브라우저 웹 IG 세션에 **다른 브랜드 계정이 로그인돼
   있을 수 있다.** 가입·로그인으로 그 세션을 밀어냈다면 복구를 사용자와 합의하고,
   다른 브랜드의 프로필·설정·콘텐츠는 건드리지 않는다. 매 단계 전 지금 계정이
   개설 대상이 맞는지 `/me`(account_type 조회)·화면으로 확인한다.
4. **단명 code 즉시 교환** — authorization code 는 1회용·단명. 회수 즉시 교환.
   실패로 소진되면 authorize 재이동(로그인 유지 시 동의 재확인만)으로 새 code.
5. **사람 게이트는 넘긴다** — 로그인 버튼·인증코드·캡차를 자동 클릭으로 뚫지 않는다.

## 상태 탐지·재개 (기본 호출)

기본 호출은 현재 상태를 판정하고 첫 미완 단계부터 재개한다:

1. `<SNS_TOKEN_DIR>/<slug>/instagram_token` 이 있으면 → `sns_account_check(channel)`
   검증. ok 면 **완료** — 계정·스코프 요약 보고 후 끝.
2. 토큰 없고 계정은 있으면 → §3 앱·토큰부터.
3. 계정도 없으면 → §1 개설부터.

서브커맨드: `signup` · `brand` · `token` · `status`.

## 1단계 · 계정 개설 (signup)

`instagram.com` 가입 폼을 ego 로 채운다 — 이메일·이름·핸들·비밀번호(비밀번호는
`<slug>/instagram.credentials` 규약 파일로 먼저 저장). **로그인/제출·생년월일·
이메일 코드는 사용자 핸드오프**. reCAPTCHA 가 뜰 수 있다. 상세는
`references/setup-playbook.md` §1.

- **기존 웹 세션 주의**: 가입 전에 다른 브랜드 계정이 로그인돼 있으면 로그아웃이
  필요하다 — 로그아웃 전에 사용자 승인을 받고, 복구 방법(그 계정 credentials)을
  확인해 둔다(절대 규칙 3).

## 2단계 · 프로페셔널 전환 + 브랜딩 (brand)

- **프로페셔널 전환** — 설정에서 비즈니스/크리에이터로 전환한다. 이걸 안 하면
  §3 토큰이 무의미하다(개인 계정은 API 연동 불가).
- **프로필 사진** — `/social-flow:branding <채널>` 산출물(로고)을 업로드한다. 이
  스킬은 자산을 만들지 않고 적용만 한다. IG 프로필 사진은 Threads 로 자동 승계된다.
- **bio·이름·카테고리** — profile.md 의 채널 카피로 채운다. 공개 계정 확인.

## 3단계 · 앱 테스터 + OAuth 토큰 (token)

**IG 게시 토큰은 "Instagram API with Instagram Login" 으로 발급한다** — 앱 역할의
"IG 테스터" 라디오 설명이 "Instagram Basic Display API"(2024-12-04 폐기)라고 적혀
있어도 그 낚시에 걸리지 않는다. 발급은 instagram.com OAuth 로 한다.
`references/setup-playbook.md` §3~§5 를 정본으로 삼는다. 요지:

- **IG 테스터 추가·수락** — 앱 역할에서 이 계정을 IG 테스터로 추가하고, 초대는
  **IG 웹 accounts/manage_access → 테스터 초대 탭에서 신뢰 클릭**으로 수락한다.
- **OAuth authorize** — `instagram.com/oauth/authorize` 를 task space 탭에서 직접
  열어 스코프 5종을 콤마로 요청. `force_reauth` 면 로그인 폼을 채우되 **로그인
  버튼은 사용자 핸드오프**(자동 클릭 소프트블록) → 동의 화면 "허용" 신뢰 클릭 →
  `https://localhost/callback/` 리다이렉트 URL 에서 code 회수.
- **토큰 교환** — playbook §5(브라우저 무관, curl). api.instagram.com 단기 →
  graph.instagram.com 60일 장기. **셸 `UID` 예약변수 함정 주의**(§5).

스코프 5종: `instagram_business_basic` · `instagram_business_content_publish` ·
`instagram_business_manage_comments` · `instagram_business_manage_messages` ·
`instagram_business_manage_insights`. 마지막은 grow-instagram(성장 루프)용이다.

## 저장·검증·기록

1. 장기 토큰을 `<SNS_TOKEN_DIR>/<slug>/instagram_token` 저장, `chmod 600`.
   **값 비노출.**
2. `sns_account_check(channel=<slug>)` → instagram ok, username·ig_user_id 확인.
3. `data/<slug>/profile.md` §8 의 Instagram 행 갱신(핸들·ig_user_id·발급일·스코프
   수, 상태 "✅ API 연동 완료").
4. 한 줄 보고 + 다음 단계(`/social-flow:grow-instagram <채널> init`). 릴스 게시엔
   **공개 HTTPS 호스팅**이 필요함을 함께 짚는다(IG 는 로컬 파일 업로드 불가).

## status — 현황 보고

토큰 유무 + `sns_account_check` + account_type 으로 연동 상태만 요약. 미완 단계와
사람 게이트를 짚는다. 게시·변경 없음.

## 수동 폴백 (ego lite 없을 때)

개설·전환·브랜딩은 사용자가 직접 하고, 이 스킬은 토큰 발급만 돕는다: authorize
URL 을 만들어 주고 → 사용자가 동의 후 리다이렉트된 `localhost/callback/?code=...`
URL 전체를 붙여넣으면 → code 를 뽑아 playbook §5 로 교환한다. 절대 규칙은 그대로.

## Additional Resources

- **`references/setup-playbook.md`** — ego CDP 조작 원칙, 단계별 실측 레시피,
  독립된 토큰 교환·60일 갱신 절.
