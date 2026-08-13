# Threads 개설 플레이북 — ego lite 실측 레시피

이 문서는 SKILL.md 의 각 단계를 실제로 어떻게 조작하는지 담는다. Meta 계열
사이트(threads.com·threads.net·developers.facebook.com)는 ego 의 편의 헬퍼가
내부 대기에 걸려 무한 행하는 구간이 많아, **CDP 저수준 호출로만** 안정적으로
움직인다. 아래는 그 실측 레시피다.

## ego lite 조작 원칙 (공통)

먼저 `~/.claude/skills/ego-browser/SKILL.md`(사용자 머신의 ego 스킬)를 로드해 CLI
사용법을 확인한다. 호출은 `Bash` 로 `ego-browser nodejs <<'EOF' ... EOF` 히어독.

- **히어독마다 상태가 초기화된다.** 매 히어독 첫 줄에서 task space 를 다시 선점한다:
  `await useOrCreateTaskSpace('<세션 고유 이름>')` (핸드오프 복귀만
  `takeOverTaskSpace(id)`). 이름이 겹치면 다른 세션과 탭을 공유하니 세션마다
  고유한 이름을 쓴다.
- **Meta 사이트는 CDP 전용.** `click`·`js`·`gotoAndWait`·`snapshotText` 는 행에
  걸리기 쉽다. 대신:
  - 페이지 이동: `cdp('Page.navigate', {url})`
  - 값 읽기·DOM 조회: `cdp('Runtime.evaluate', {expression, returnByValue:true})`
  - **클릭은 신뢰 입력으로**: `cdp('Input.dispatchMouseEvent', {type:'mousePressed', x, y, button:'left', clickCount:1, buttons:1})` + 곧바로 `mouseReleased`.
    React 는 신뢰 이벤트(isTrusted)가 아니면 탭 전환·동의 클릭을 무시한다.
  - 팝업·리다이렉트 탭 찾기: `cdp('Target.getTargets', {})` → `switchTab(전체 targetId)`.
- **클릭 전 가림 확인**: `document.elementFromPoint(x, y)` 로 그 좌표의 실제 최상단
  요소를 확인한다. 모달이 덮고 있으면 다른 요소가 잡힌다. `getBoundingClientRect`
  폭이 490px 이상이면 버튼이 아니라 컨테이너를 잡은 것일 수 있다(오탐 주의).
- 화면 공유가 필요하면(사람 게이트) `handOffTaskSpace(id)` → 사용자 확인 →
  `takeOverTaskSpace(id)`. agent task space 탭은 GUI 에 안 보인다.

## 1단계 · 계정 개설

Threads 는 Instagram 계정으로 로그인한다.

1. 같은 핸들의 IG 계정이 이미 있는가? 있으면 이 단계는 로그인만이다.
   없으면 `/social-flow:setup-instagram <채널>` 을 먼저 끝내고 돌아온다.
2. `Page.navigate` 로 `https://www.threads.net/login` → IG 아이디·비밀번호를
   `Runtime.evaluate` 로 입력 필드에 채운다(비밀번호는 `<slug>/threads.credentials`
   에서 읽는다).
3. **로그인 버튼은 사용자에게 넘긴다** — 자동 클릭은 "연결할 수 없습니다"
   소프트블록. `handOffTaskSpace` 후 사용자가 누른다.
4. 로그인 후 프로필이 개설 대상 계정이 맞는지 화면으로 확인한다(절대 규칙 3).
   공개 계정인지도 본다.

## 2단계 · 프로필 브랜딩

프로필 이미지 자산은 `/social-flow:branding` 산출물을 쓴다(여기서 생성하지 않음).

- **프로필 사진**: IG 에서 설정한 프로필 사진이 Threads 로 자동 승계된다. IG 를
  먼저 브랜딩했다면 Threads 는 승계만 확인하면 된다.
- **bio**: profile.md 의 채널 카피로 채운다. **웹 저장이 2단계다** — "소개 수정"
  다이얼로그 상단 완료 → 프로필 편집 하단 완료. 자동 클릭이 이 순서와 어긋나
  저장이 안 되는 일이 잦으니, 마지막 완료는 사용자가 누르게 하거나 저장 후
  새로고침해 bio 가 실제로 반영됐는지 확인한다.
- **공개 설정**: 비공개면 도달이 막힌다 — 공개로 둔다.

## 3단계 · Meta 앱 준비 (테스터 + 이용 사례 권한)

앱은 `developers.facebook.com` 에서 다룬다. 이 계정을 테스터로 넣고 스코프를 켠다.

1. **앱 소유 계정 확인** — Meta 앱은 개설하려는 SNS 계정이 아니라 **FB 개발자
   계정** 소유일 수 있다. 그 계정으로 콘솔에 로그인해야 앱이 보인다. 엉뚱한
   계정이면 다른 앱만 보인다(오인 주의).
2. **테스터 추가** — 앱 > 역할(또는 이용 사례 > Threads > 설정)에서 이 계정을
   **Threads 테스터**로 추가한다. 역할 페이지의 "사람 추가" 다이얼로그는 라디오
   (IG 테스터/Threads 테스터)가 상호배타 + 재렌더로 좌표가 어긋난다 → 라디오를
   ref 로 잡아 클릭하고, 추가 버튼은 `aria-disabled` 가 아닌(활성) 상태를 확인해
   DOM 클릭한다.
3. **초대 수락** — 추가하면 계정 쪽에서 초대를 수락해야 "대기 중" 이 풀린다.
   Threads 웹 설정 > 웹사이트 권한 > **초대 탭**에서 수락한다. 탭 전환은 **신뢰
   입력**(Input.dispatchMouseEvent)이라야 먹는다.
4. **이용 사례 권한 추가** — 콘솔 이용 사례 > Threads API 액세스 > 권한에서
   `threads_content_publish` · `threads_manage_replies` · `threads_manage_insights`
   를 "추가". 기본은 `threads_basic` 만 켜져 있다. **첫 "추가" 클릭이 "문제가
   발생했습니다" 로 실패해도 30초 뒤 재시도하면 붙는다.**
   `threads_keyword_search` 는 별도 "추가" 가 필요하고, 개발 모드에서는 **자기
   계정 게시물만** 검색된다(공개 검색은 App Review 고급 액세스 필요 — 남의 글
   0건은 정상).

## 4단계 · OAuth authorize (code 회수)

콘솔의 "사용자 토큰 생성기" 는 팝업이 콘솔로 되돌아올 뿐 토큰을 표시하지 않는다.
쓰지 말고 **표준 OAuth authorize 를 task space 탭에서 직접** 연다.

1. 앱 env 파일에서 App ID 를 읽어 authorize URL 을 만든다:
   ```
   https://threads.net/oauth/authorize?client_id=<THREADS_APP_ID>
     &redirect_uri=https://localhost/callback/
     &scope=threads_basic,threads_content_publish,threads_manage_replies,threads_manage_insights,threads_keyword_search
     &response_type=code
   ```
   (scope 는 콤마 구분, 한 줄로.) `Page.navigate` 로 연다.
2. 동의 화면에서 "<계정>으로 계속" 을 **신뢰 클릭**. 개별 체크박스는 없고 scope
   파라미터로 전부 요청된다. **"액세스 권한 수정" 모달이 계속 계속 버튼을 덮는
   함정** — `elementFromPoint` 로 확인하고 모달의 X 를 눌러 닫은 뒤 계속을 누른다.
3. localhost 로 리다이렉트된다. 서버가 없어 chrome-error 가 뜨지만 **code 는 URL
   에 있다** — `Target.getTargets` 또는 `Page.getNavigationHistory` 엔트리의
   `localhost/callback?code=...` 에서 회수한다. `#_` 등 fragment 는 떼어 낸다.
4. code 는 1회용·단명이다. 회수 즉시 §5 로 넘어간다.

## 5단계 · 토큰 교환 (브라우저 무관 — curl)

이 절은 브라우저와 무관하다. **60일 갱신 때도 이 절만 다시 쓴다.** 앱 env 파일
(App ID/Secret)을 source 하고 curl 로 단기 → 장기 교환한다.

```bash
source <SNS_TOKEN_DIR>/<slug>/meta-app.env   # THREADS_APP_ID, THREADS_APP_SECRET
CODE='<4단계에서 회수한 code>'
DEST=<SNS_TOKEN_DIR>/<slug>/threads_token

SHORT=$(curl -s -X POST https://graph.threads.net/oauth/access_token \
  -F client_id="$THREADS_APP_ID" -F client_secret="$THREADS_APP_SECRET" \
  -F grant_type=authorization_code -F redirect_uri="https://localhost/callback/" \
  -F code="$CODE" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')

curl -s "https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=$THREADS_APP_SECRET&access_token=$SHORT" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))' \
  > "$DEST"
chmod 600 "$DEST"
```

- **셸 예약변수 함정**: bash/zsh 에서 `UID` 는 읽기전용 예약변수다. 스크립트 변수로
  쓰면 "failed to change user ID" 로 죽고, `set -e` 면 저장 전에 빠져나가 code 가
  소진된다. 사용자 id 등을 담을 땐 `IGUSER`·`ACCT` 같은 다른 이름을 쓴다.
- 토큰 값을 `echo` 하지 않는다 — 파일로 바로 리다이렉트한다.

## 60일 갱신 (재발급 아님)

만료 전(발급 24시간 경과 후) 토큰만 갱신할 때는 §1~§4 를 건너뛰고 이것만:

```bash
DEST=<SNS_TOKEN_DIR>/<slug>/threads_token
curl -s "https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=$(cat "$DEST")" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))' > "$DEST.new" \
  && mv "$DEST.new" "$DEST" && chmod 600 "$DEST"
```

갱신은 스코프를 늘리지 못한다 — 스코프를 추가하려면 §3~§5 로 재발급한다.
60일을 넘겨 만료되면 갱신도 불가하니 §3 부터 다시 한다.
