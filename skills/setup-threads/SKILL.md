---
name: setup-threads
description: >
  This skill should be used when the user asks to "스레드 채널 개설", "스레드 계정
  만들어", "스레드 API 연동해줘", "스레드 붙여줘", "set up a Threads channel/account",
  or wants to stand up a LIVE Threads account for a channel and wire it into
  social-flow. Drives account signup, profile branding, Meta app tester/permission
  setup, and OAuth token issuance through a browser lane — ego lite first, the
  claude-in-chrome tools as fallback — with HITL handoffs (login·verification
  code·consent), then saves the 60-day token to
  <SNS_TOKEN_DIR>/<slug>/threads_token and verifies with sns_account_check.
  Resumable — detects what is already done and continues from the first unfinished step.
argument-hint: "<채널> [status|signup|brand|token]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "mcp__social-flow__sns_account_check", "mcp__claude-in-chrome__tabs_context_mcp", "mcp__claude-in-chrome__tabs_create_mcp", "mcp__claude-in-chrome__tabs_close_mcp", "mcp__claude-in-chrome__navigate", "mcp__claude-in-chrome__javascript_tool", "mcp__claude-in-chrome__computer"]
---

# Threads 채널 개설 — 브라우저 HITL

채널(브랜드) 하나에 **살아 있는 Threads 계정을 붙이는** 스킬이다. 계정 개설부터
프로필 브랜딩, Meta 앱 권한 설정, OAuth 토큰 발급까지를 브라우저로
몰고 가되, **사람 손이 필요한 지점만 사용자에게 넘긴다**(로그인 클릭·인증코드·
생년월일·동의 화면). 끝나면 60일 장기 토큰이 `<SNS_TOKEN_DIR>/<slug>/threads_token`
에 저장되고 `channel: "<slug>"` 로 게시할 수 있다.

개설 스킬은 **플랫폼별로 분리**한다 — 개설 흐름·앱 콘솔·토큰 교환이 플랫폼마다
전혀 달라서다. Threads·Instagram 은 Meta 앱을 공유하지만 테스터 경로와 스코프가
다르고, YouTube 는 Google 쪽이라 아예 다르다. 성장 스킬(`grow-<플랫폼>`)과 나란한
`setup-<플랫폼>` 계열이다.

## 무엇을 자동으로, 무엇을 넘기나

브라우저로 폼 입력·페이지 이동·동의 클릭까지는 자동으로 한다. 다음은 **자동화가
소프트블록되므로 반드시 사용자에게 넘긴다** — 자동 클릭으로 뚫지 않는다:

- **로그인 버튼 클릭** — 자동 클릭 시 "연결할 수 없습니다" 소프트블록이 뜬다.
  아이디·비밀번호는 채워 두고 로그인 버튼만 사용자가 누른다.
- **인증코드 입력** — 이메일/문자 코드. 사용자가 허락하면 Gmail 을 읽어 코드를
  찾아 줄 수 있으나, 최종 입력·제출은 확인 후 진행한다.
- **생년월일·캡차·2FA** — 사람 판단이 필요한 게이트.

핸드오프 방식은 레인마다 다르다 — ego lite 는 `handOffTaskSpace` 로 화면을 노출하고
사용자 완료를 확인한 뒤 `takeOverTaskSpace` 로 회수한다. Chrome 레인은 화면이 처음부터
사용자 것이라 노출 절차가 없다. 무엇을 눌러야 하는지 알리고 완료만 확인한다.

## 전제 조건

- `data/<slug>/profile.md` 가 있어야 한다 — 없으면 `/social-flow:channel add` 부터
  안내하고 중단한다. 핸들·브랜드 톤은 여기서 상속한다.
- **브라우저 레인 하나** — ego lite 또는 claude-in-chrome. 둘 다 이 플러그인의
  구성물이 아니라 사용자 머신·세션의 도구다. 고르는 기준은 아래 §브라우저 레인.
- Meta 개발자 앱(Threads API 사용 설정). 앱 하나를 여러 채널이 공유해도 된다.
  App ID·Secret 은 채널 디렉토리의 앱 env 파일에 두고 토큰 교환 때 source 한다.

## 브라우저 레인 — ego lite 우선, Chrome 폴백

브라우저 조작은 세 갈래고 위에서부터 고른다.

1. **ego lite** — `command -v ego-browser` 로 확인한다. 사용자 로그인 상태를 쓰면서도
   agent 전용 task space 에서 돌아 사용자 탭과 부딪히지 않는다. 실측 레시피가 이 레인
   기준으로 쓰여 있다(`references/setup-playbook.md`).
2. **claude-in-chrome** — ego 가 없을 때. 윈도우·리눅스가 대표적이다(ego lite 는
   macOS 전용). 사용자의 실제 Chrome 세션에 붙어 로그인 상태를 그대로 쓰지만
   **격리가 없다** — 작업 중 사용자 브라우저를 점유하고, 사이트별 권한 승인을 먼저
   받아야 한다. CDP 레시피와의 대응은 playbook §브라우저 레인의 표를 본다.
3. **수동 폴백** — 둘 다 없으면 아래 §수동 폴백으로 간다(토큰 발급만 돕는다).

레인이 바뀌어도 **사람 게이트는 그대로다** — 로그인 버튼·인증코드·동의 체크는
어느 레인에서든 사용자가 누른다. 소프트블록은 ego 의 신뢰 클릭으로도 걸렸으니,
Chrome 레인이라고 뚫리리라 기대하지 않는다.

## 절대 규칙 (위반 시 즉시 중단)

1. **토큰 값 비노출** — 토큰·시크릿·비밀번호를 화면·로그·커밋에 평문으로 남기지
   않는다. 파일로만 저장하고 `chmod 600`. API 응답을 통째로 기록하지 않는다.
2. **채널 디렉토리에만 저장** — 토큰은 `<SNS_TOKEN_DIR>/<slug>/threads_token`
   (기본 `~/.config/social-flow/<slug>/`). 가입 비밀번호는 같은 디렉토리의
   `threads.credentials` 규약 파일로 둔다(커밋 금지 경로).
3. **공유 계정 보호** — 같은 브라우저·같은 Meta/Google 계정에 **다른 브랜드 채널이
   살아 있을 수 있다.** 매 단계 전에 지금 다루는 계정이 개설 대상이 맞는지 화면·
   `/me` 로 확인하고, 다른 브랜드의 프로필·설정·콘텐츠는 절대 건드리지 않는다.
   로그아웃·재로그인으로 남의 웹 세션을 밀어냈다면 복구를 사용자와 합의한다.
4. **단명 code 즉시 교환** — OAuth authorization code 는 1회용·단명이다. 회수하면
   바로 토큰 교환으로 넘어간다. 실패해 code 가 소진되면 authorize 재이동으로
   새 code 를 받는다(로그인 유지 상태면 동의 재확인만으로 즉시 발급).
5. **사람 게이트는 넘긴다** — 위 "무엇을 넘기나"의 지점을 자동 클릭으로 뚫지 않는다.

## 상태 탐지·재개 (기본 호출)

개설은 한 번에 안 끝날 수 있다 — 인증코드 대기, 테스터 초대 수락 같은 사람 단계가
끼기 때문이다. 그래서 **기본 호출은 먼저 현재 상태를 판정하고 첫 미완 단계부터
재개**한다:

1. `<SNS_TOKEN_DIR>/<slug>/threads_token` 이 있으면 → `sns_account_check(channel)`
   로 검증. ok 면 **이미 완료** — 계정·스코프만 요약 보고하고 끝낸다.
2. 토큰이 없고 계정은 있어 보이면(사용자 확인) → §3 앱·토큰 단계부터.
3. 계정도 없으면 → §1 계정 개설부터.

서브커맨드로 특정 단계를 지정할 수 있다: `signup`(계정 개설) · `brand`(프로필
브랜딩) · `token`(앱 권한 + OAuth 토큰). `status` 는 현황만 보고한다.

## 1단계 · 계정 개설 (signup)

Threads 계정은 Instagram 계정에 묶인다. 같은 핸들의 IG 계정이 이미 있으면 그
계정으로 Threads 에 로그인하는 것으로 개설이 끝난다(프로필 사진·이름 승계). IG
계정이 없으면 `/social-flow:setup-instagram <채널>` 을 먼저 안내한다.

절차·ego CDP 레시피는 `references/setup-playbook.md` §1 을 따른다. 핵심만:
threads.net 접속 → IG 계정으로 로그인(로그인 버튼은 사용자 핸드오프) → 공개 계정
확인. 개설 대상 계정이 맞는지 화면으로 검증하고 진행한다(절대 규칙 3).

## 2단계 · 프로필 브랜딩 (brand)

프로필 이미지 **자산 자체는 `/social-flow:branding <채널>` 이 만든다** — 여기서
수렴 루프를 다시 돌리지 않는다. 이 단계는 만들어진 자산을 라이브 계정에 **적용**
하는 것까지다: 프로필 사진 업로드(IG→Threads 자동 승계), bio 반영(profile.md 의
채널 카피), 공개 설정 확인. bio 웹 저장은 다이얼로그가 2단계라 마지막 완료 버튼을
놓치기 쉽다 — playbook §2 의 저장 확인 절차를 따른다.

## 3단계 · 앱 권한 + OAuth 토큰 (token)

Meta 앱에서 이 계정을 테스터로 넣고 스코프를 켠 뒤 OAuth 로 토큰을 받는다. 이
단계가 개설의 몸통이고 함정도 여기 몰려 있다 — `references/setup-playbook.md`
§3~§5 를 정본으로 삼아 그대로 따른다. 요지:

- **테스터 초대 수락** — 앱 역할에 이 계정을 Threads 테스터로 추가하고, 초대는
  웹 설정의 웹사이트 권한 초대 탭에서 **신뢰 입력**으로 수락한다(합성 이벤트로는
  탭 전환이 안 된다).
- **이용 사례 권한 추가** — 콘솔에서 content_publish·manage_replies·
  manage_insights 를 "추가". 첫 시도가 "문제가 발생했습니다" 로 실패해도 재시도하면
  붙는다. keyword_search 는 개발 모드에서 자기 계정 글만 검색된다(정상).
- **OAuth authorize** — `threads.net/oauth/authorize` 를 task space 탭에서 직접
  열어 스코프 5종을 콤마로 요청 → 동의 → localhost 리다이렉트 URL 에서 code 회수.
  동의 화면의 "액세스 권한 수정" 모달이 계속 버튼을 **덮는** 함정이 있다(X 로 닫고
  진행). 콘솔의 "토큰 생성기" 버튼은 토큰을 보여주지 않으니 쓰지 않는다.
- **토큰 교환** — playbook §5(브라우저 무관, curl). 단기 → 60일 장기.

스코프 5종: `threads_basic` · `threads_content_publish` · `threads_manage_replies`
· `threads_manage_insights` · `threads_keyword_search`. 뒤 둘은 grow-threads(성장
루프)용이다 — 게시만 할 거면 앞 셋으로도 되지만, 나중에 스코프를 늘리려면 토큰을
재발급해야 하니 처음부터 5종을 켜 두길 권한다.

## 저장·검증·기록

1. 장기 토큰을 `<SNS_TOKEN_DIR>/<slug>/threads_token` 에 저장하고 `chmod 600`.
   **값은 출력하지 않는다.**
2. `sns_account_check(channel=<slug>)` → threads ok 와 계정 username·id 확인.
3. `data/<slug>/profile.md` §8(SNS 계정) 표의 Threads 행을 갱신한다 — 계정 핸들·
   user_id·발급일·스코프 수. 상태를 "✅ API 연동 완료" 로.
4. 한 줄 보고: 계정·스코프·다음 단계(`/social-flow:grow-threads <채널> init`).

## status — 현황 보고

토큰 파일 유무 + `sns_account_check(channel)` 로 연동 상태만 요약한다. 미완이면
어느 단계가 남았는지, 사람 손이 필요한 지점이 무엇인지 짚는다. 게시·변경 없음.

## 수동 폴백 (브라우저 레인이 없을 때)

쓸 수 있는 레인이 없으면 개설·브랜딩은 사용자가 브라우저에서 직접 하고, 이 스킬은
**토큰 발급만** 돕는다: authorize URL 을 만들어 사용자에게 주고 → 사용자가 브라우저
주소창에서 동의 후 리다이렉트된 `https://localhost/callback/?code=...` URL 전체를
붙여넣으면 → code 를 뽑아 playbook §5 로 교환한다. 이 경로에도 절대 규칙(토큰
비노출·채널 디렉토리 저장)은 그대로 적용된다.

## Additional Resources

- **`references/setup-playbook.md`** — ego CDP 조작 원칙, 단계별 실측 레시피,
  독립된 토큰 교환·60일 갱신 절.
