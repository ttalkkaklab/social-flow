# Instagram 개설 플레이북 — ego lite 실측 레시피

SKILL.md 의 각 단계를 실제로 어떻게 조작하는지 담는다. Meta 계열 사이트
(instagram.com·developers.facebook.com)는 ego 편의 헬퍼가 무한 행하는 구간이 많아
**CDP 저수준 호출로만** 안정적으로 움직인다.

## ego lite 조작 원칙 (공통)

먼저 `~/.claude/skills/ego-browser/SKILL.md` 를 로드해 CLI 사용법을 확인한다.
호출은 `ego-browser nodejs <<'EOF' ... EOF` 히어독.

- **히어독마다 상태 초기화** → 매 히어독 첫 줄에서 `await useOrCreateTaskSpace('<세션
  고유 이름>')`(핸드오프 복귀만 `takeOverTaskSpace(id)`). 세션마다 고유 이름.
- **CDP 전용**: 이동 `cdp('Page.navigate',{url})`, 읽기 `cdp('Runtime.evaluate',
  {expression,returnByValue:true})`, **클릭은 신뢰 입력** `cdp('Input.dispatchMouseEvent',
  {type:'mousePressed',x,y,button:'left',clickCount:1,buttons:1})` + `mouseReleased`.
  React 는 isTrusted 이벤트가 아니면 무시한다. 팝업·리다이렉트 탭은
  `cdp('Target.getTargets',{})` → `switchTab(전체 targetId)`.
- 클릭 전 `document.elementFromPoint(x,y)` 로 가림 확인. 화면 공유는
  `handOffTaskSpace(id)`(agent 탭은 GUI 에 안 보임).

## 1단계 · 계정 개설

1. 가입 전 다른 브랜드 계정이 웹에 로그인돼 있으면 로그아웃이 필요하다 —
   **사용자 승인 + 복구 credentials 확인 후** 로그아웃한다(절대 규칙 3).
2. `Page.navigate` 로 `https://www.instagram.com/accounts/emailsignup/` → 이메일·
   이름·핸들·비밀번호를 `Runtime.evaluate` 로 채운다(비밀번호는
   `<slug>/instagram.credentials` 에 먼저 저장). IG 핸들 자동완성은 칩이 이중으로
   붙는 오작동이 있으니 입력 후 값을 검증한다.
3. **제출·생년월일·이메일 코드는 사용자 핸드오프.** reCAPTCHA 가 뜰 수 있다.
   사용자가 허락하면 Gmail 에서 코드를 찾아 전달하되 최종 입력은 확인 후.
4. 가입 완료 후 개설 대상 계정이 맞는지 확인한다.

## 2단계 · 프로페셔널 전환 + 브랜딩

- **프로페셔널 전환**: 설정 > 계정 유형 및 도구 > 프로페셔널 계정으로 전환 →
  비즈니스 또는 크리에이터. 확인은 웹 UI 대신 API 가 확실하다:
  `GET https://graph.instagram.com/v23.0/me?fields=account_type&access_token=...`
  → `BUSINESS` 또는 `MEDIA_CREATOR` 면 프로페셔널이다. 토큰이 동작한다는 사실만으로도
  프로페셔널이 확정된다(개인 계정은 연동 자체가 불가).
- **프로필 사진**: `/social-flow:branding` 로고 자산 업로드. IG→Threads 자동 승계.
- **bio·이름·카테고리**: profile.md 채널 카피. 공개 계정 확인.

## 3단계 · 앱 테스터 (Instagram Login) + 초대 수락

**핵심**: IG 게시 토큰은 "Instagram API with Instagram Login"(비즈니스 로그인)으로
발급한다. 앱 역할 페이지의 "IG 테스터" 라디오 설명이 "Instagram Basic Display
API"(폐기됨)라고 적혀 있어도 그건 낚시다 — 실제 발급은 instagram.com OAuth 경로다.

1. **IG 테스터 추가** — 앱 > 역할 > 사람 추가에서 이 계정을 IG 테스터로. 역할
   다이얼로그 라디오(IG/Threads 테스터)는 상호배타 + 재렌더로 좌표가 어긋난다 →
   라디오를 ref 로 잡아 클릭, 추가 버튼은 활성(aria-disabled 아님) 상태 확인 후 클릭.
2. **초대 수락** — IG 웹에서 수락한다:
   `https://www.instagram.com/accounts/manage_access/` → **테스터 초대 탭**에서
   **신뢰 클릭**으로 수락(합성 이벤트로는 안 됨).

## 4단계 · OAuth authorize (code 회수)

1. 앱 env 에서 App ID 를 읽어 authorize URL 을 만든다(scope 콤마 구분, 한 줄):
   ```
   https://www.instagram.com/oauth/authorize?client_id=<IG_APP_ID>
     &redirect_uri=https://localhost/callback/
     &scope=instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_messages,instagram_business_manage_insights
     &response_type=code
   ```
   `Page.navigate` 로 연다.
2. `force_reauth` 로 로그인 폼이 뜨면 아이디·비밀번호를 채우되 **로그인 버튼은
   사용자 핸드오프**(자동 클릭은 "연결할 수 없습니다" 소프트블록).
3. 동의 화면 **"허용" 신뢰 클릭**.
4. `https://localhost/callback/?code=...` 로 리다이렉트된다. 서버가 없어 에러
   페이지지만 code 는 URL 에 있다 — `Target.getTargets`/`Page.getNavigationHistory`
   에서 회수한다. 끝의 `#_` 를 떼어 낸다.
5. code 는 1회용·단명 → 회수 즉시 §5.

## 5단계 · 토큰 교환 (브라우저 무관 — curl)

이 절은 브라우저와 무관하다. **60일 갱신 때도 이 절만 다시 쓴다.**

```bash
source <SNS_TOKEN_DIR>/<slug>/meta-app.env   # IG_APP_ID, IG_APP_SECRET
CODE='<4단계에서 회수한 code>'
DEST=<SNS_TOKEN_DIR>/<slug>/instagram_token

SHORT_JSON=$(curl -s -X POST https://api.instagram.com/oauth/access_token \
  -F client_id="$IG_APP_ID" -F client_secret="$IG_APP_SECRET" \
  -F grant_type=authorization_code -F redirect_uri="https://localhost/callback/" \
  -F code="$CODE")
ST=$(echo "$SHORT_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
# 주의: 사용자 id 는 IGUSER 등으로 받는다. UID 는 셸 예약변수다(아래 함정).
IGUSER=$(echo "$SHORT_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("user_id",""))')

curl -s "https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=$IG_APP_SECRET&access_token=$ST" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))' > "$DEST"
chmod 600 "$DEST"
```

- **셸 예약변수 함정(중요)**: bash/zsh 에서 `UID` 는 읽기전용 예약변수다. 사용자
  id 를 `UID=$(...)` 로 담으면 "failed to change user ID: operation not permitted"
  로 죽는다. `set -e` 스크립트면 토큰 저장 전에 빠져나가고 **단명 code 가 소진**돼
  버린다(실측 사고 1건). 반드시 `IGUSER`·`ACCT` 등 다른 이름을 쓴다.
- 토큰 값을 `echo` 하지 않고 파일로 바로 리다이렉트한다. 단기 토큰이 214자, 장기가
  약 158자, `expires_in` 5184000(60일)이면 정상이다.

## 60일 갱신 (재발급 아님)

만료 전 토큰만 갱신할 때는 §1~§4 를 건너뛰고 이것만:

```bash
DEST=<SNS_TOKEN_DIR>/<slug>/instagram_token
curl -s "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=$(cat "$DEST")" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))' > "$DEST.new" \
  && mv "$DEST.new" "$DEST" && chmod 600 "$DEST"
```

갱신은 스코프를 늘리지 못한다 — 스코프 추가는 §3~§5 로 재발급. 60일 초과 만료면
갱신 불가, §3 부터 다시.
