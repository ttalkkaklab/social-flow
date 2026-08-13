# YouTube 개설 플레이북 — ego lite 실측 레시피

SKILL.md 의 각 단계를 실제로 어떻게 조작하는지 담는다. Google 콘솔은 Meta 만큼
헬퍼가 행하지는 않지만, **활성 채널을 잘못 잡으면 남의 브랜드 채널을 오염**시키니
매 단계 채널 확인이 최우선이다.

## ego lite 조작 원칙 (공통)

먼저 `~/.claude/skills/ego-browser/SKILL.md` 를 로드해 CLI 사용법을 확인한다.
호출은 `ego-browser nodejs <<'EOF' ... EOF` 히어독.

- **히어독마다 상태 초기화** → 매 히어독 첫 줄에서 `await useOrCreateTaskSpace('<세션
  고유 이름>')`(핸드오프 복귀만 `takeOverTaskSpace(id)`). 세션마다 고유 이름.
- 이동 `cdp('Page.navigate',{url})`, 읽기 `cdp('Runtime.evaluate',{expression,
  returnByValue:true})`, 클릭은 신뢰 입력 `cdp('Input.dispatchMouseEvent', ...)`.
  화면 공유(사람 게이트)는 `handOffTaskSpace(id)`.
- **ego lite 의 Google 세션 프로필 주의** — 이 브라우저의 Google 세션에 어떤
  브랜드 채널이 보이는지 먼저 확인한다. 개설 대상이 아닌 다른 브랜드가 활성이면
  채널 전환기로 바꾸고 URL 채널 ID 로 재확인한 뒤 진행한다.

## 1단계 · 고급 기능 신원 인증

- 진입: `https://www.youtube.com/verify` 또는 스튜디오 > 설정 > 채널 > 기능 사용
  자격 > 고급 기능.
- **전화번호 인증**: 문자 수신 코드는 사용자가 입력(핸드오프).
- **6초 셀피 영상**: 화면의 QR 을 사용자가 폰으로 찍어 촬영·제출. 사람만 가능.
- 제출 후 **승인은 비동기**(수 시간~수 일). 이후에는 이 단계를 "대기" 로 두고
  **Gmail(승인 메일) 또는 계정 단위 페이지로만** 승인 여부를 본다. 다른 브랜드
  채널의 Studio 를 열어 확인하지 않는다.

## 2단계 · 브랜드 채널 생성 + 브랜딩 (승인 후)

1. `https://www.youtube.com/account` > 채널 만들기 > **브랜드 계정으로 새 채널**.
   채널명은 profile.md 브랜드명.
2. **생성 직후 활성 채널 확인** — URL 의 채널 ID(`/channel/UC...`)가 방금 만든
   채널인지 본다. 이후 모든 조작은 이 채널에서만.
3. 브랜딩: 스튜디오 맞춤설정 > 브랜딩에서 프로필 사진·배너 업로드(자산은
   `/social-flow:branding` 산출물 `profile-1024`·`banner-youtube-2048x1152`). 기본
   정보 탭에서 설명·링크 반영.

## 3단계 · OAuth authorize + 루프백 리스너 (code 회수)

Google OAuth 는 Meta 의 localhost/callback 트릭과 달리 **루프백 포트로 code 를
받는다**. scratchpad 에 작은 리스너를 띄운다.

1. **동의 화면 프로덕션 확인** — GCP 콘솔에서 OAuth 동의 화면이 "프로덕션" 인지
   먼저 본다. "테스트 중" 이면 발급 토큰이 7일 만료다. 프로덕션으로 게시(사용자
   확인 필요할 수 있음) 후 진행한다.
2. 리스너를 띄운다(예: 포트 8391):
   ```python
   # scratchpad/oauth-listener.py — code 를 받아 출력하고 종료
   import http.server, urllib.parse, sys
   class H(http.server.BaseHTTPRequestHandler):
       def do_GET(self):
           q = urllib.parse.urlparse(self.path).query
           code = urllib.parse.parse_qs(q).get('code', [''])[0]
           self.send_response(200); self.end_headers()
           self.wfile.write(b'ok - you can close this tab')
           if code: print(code); sys.exit(0)
       def log_message(self, *a): pass
   http.server.HTTPServer(('127.0.0.1', 8391), H).serve_forever()
   ```
3. authorize URL(scope 는 공백 → `%20` 또는 `+`, 한 줄):
   ```
   https://accounts.google.com/o/oauth2/v2/auth?client_id=<CLIENT_ID>
     &redirect_uri=http://localhost:8391
     &response_type=code&access_type=offline&prompt=consent
     &scope=https://www.googleapis.com/auth/youtube.upload%20https://www.googleapis.com/auth/youtube.force-ssl%20https://www.googleapis.com/auth/youtube.readonly%20https://www.googleapis.com/auth/yt-analytics.readonly
   ```
   `access_type=offline` + `prompt=consent` 라야 `refresh_token` 이 나온다.
   `Page.navigate` 로 연다.
4. 로그인·2FA 는 사용자 핸드오프. **계정/채널 선택에서 개설 대상 브랜드 채널을
   고른다.** 미인증 앱 경고는 "고급 → 이동".
5. **스코프 체크박스를 하나씩 다 켠다** — 미체크로 계속하면 "액세스를 허용하지
   않음" 다이얼로그가 뜨고 scope 없는 code 가 발급된다.
6. 동의하면 리스너가 code 를 받아 출력한다. code 는 1회용·단명 → 즉시 §4.

## 4단계 · code → refresh_token 교환 (브라우저 무관 — curl)

```bash
source <SNS_TOKEN_DIR>/<slug>/gcp-oauth.env   # CLIENT_ID, CLIENT_SECRET
CODE='<3단계 리스너가 받은 code>'
DEST=<SNS_TOKEN_DIR>/<slug>/youtube-oauth-client.json

RT=$(curl -s -X POST https://oauth2.googleapis.com/token \
  -d client_id="$CLIENT_ID" -d client_secret="$CLIENT_SECRET" \
  -d code="$CODE" -d grant_type=authorization_code \
  -d redirect_uri="http://localhost:8391" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("refresh_token",""))')

python3 - "$CLIENT_ID" "$CLIENT_SECRET" "$RT" "$DEST" <<'PY'
import json,sys
cid,csec,rt,dest=sys.argv[1:5]
json.dump({"client_id":cid,"client_secret":csec,"refresh_token":rt}, open(dest,"w"))
PY
chmod 600 "$DEST"
```

- `refresh_token` 이 빈 값이면 authorize 에 `access_type=offline&prompt=consent` 가
  빠졌거나 이미 동의한 앱이라 안 준 것이다 — `prompt=consent` 로 다시 받는다.
- **refresh_token 을 `echo` 하지 않는다** — 파이썬으로 JSON 에 바로 쓴다.
- 셸 변수명에 `UID` 를 쓰지 않는다(읽기전용 예약변수 — 스크립트가 죽는다).

## 검증·함정 정리

- `sns_account_check(channel)` 로 youtube ok 와 **채널 ID** 를 확인 — 개설 대상
  채널이 맞는지 반드시 대조한다(다른 브랜드 채널 토큰이 아닌지).
- **7일 만료 함정**: "테스트 중" 단계에서 발급한 refresh_token 은 7일 뒤 죽는다.
  프로덕션 게시 후 재발급한다.
- **게시용 토큰엔 성장 스코프가 없다**: 업로드만 켜고 발급했으면 자막·성장 툴 첫
  호출에서 스코프 에러가 나는 게 정상이다. 스코프를 늘리려면 §3~§4 로 재발급하고
  JSON 의 `refresh_token` 만 교체한다(`client_id`/`client_secret` 유지).
- **커스텀 썸네일·Related video**: 최소 전화번호 인증(중급 기능)이 필요하고, 쇼츠
  세로 표면 썸네일은 API 로 못 바꾼다(YouTube 앱 Edit thumbnail 전용).
