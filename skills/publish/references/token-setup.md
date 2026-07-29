# SNS 게시 자격증명 설정 가이드

social-flow MCP 서버는 **자격증명 파일이 존재하는 채널의 게시 툴만** ListTools 에
노출한다 (요청 시점 평가 — 파일 추가가 서버 재시작 없이 반영된다).

## 파일 규약

공통 디렉토리 `~/.config/social-flow/` (환경변수 `SNS_TOKEN_DIR` 로 변경 가능,
채널별 `*_TOKEN_FILE` env 로 개별 오버라이드):

| 채널 | 파일명 | 형식 | 수명 |
|---|---|---|---|
| Threads | `threads_token` | 평문 토큰 1줄 | 60일 (갱신형) |
| Instagram | `instagram_token` | 평문 토큰 1줄 | 60일 (갱신형) |
| Facebook 페이지 | `facebook_page_token` | 평문 토큰 1줄 | 무기한 |
| YouTube | `youtube-oauth-client.json` | `{"client_id","client_secret","refresh_token"}` | 리프레시 토큰 (반영구) |

```bash
mkdir -p ~/.config/social-flow && chmod 700 ~/.config/social-flow
# 토큰 저장 후 반드시:
chmod 600 ~/.config/social-flow/*
```

- **토큰 값은 env 로 받지 않는다** — Meta 60일 refresh 가 파일을 덮어쓰는 구조라
  파일 기반이어야 갱신이 되고, 커밋 파일(.mcp.json)에 시크릿이 실리는 것도 막는다.
- **게시 계정은 토큰의 /me 로 자동 결정** — 계정 ID 설정은 의도적으로 없다
  (토큰·계정 불일치로 잘못된 계정에 게시되는 사고가 원천 불가능).
- 설정 후 `sns_account_check` 로 계정 id·이름·유효 여부를 확인한다.

## 발급 절차 요약

### Threads

1. Meta 개발자 콘솔(developers.facebook.com)에서 앱 생성 → Threads API 사용 설정.
2. 스코프: `threads_basic`, `threads_content_publish`, 답글 관리까지 쓰려면
   `threads_manage_replies`.
3. 단기 토큰 발급 → 장기 토큰(60일) 교환:
   `GET https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=…&access_token=…`
4. 갱신(만료 전, 24시간 경과 후 가능):
   `GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=$(cat ~/.config/social-flow/threads_token)`
   — 응답 토큰을 **파일로만 저장**하고 값을 출력하지 않는다.

### Instagram

1. IG 계정을 프로페셔널(비즈니스/크리에이터)로 전환.
2. Instagram API with Instagram Login (또는 FB 페이지 연결형) 앱 설정.
   스코프: `instagram_business_basic`, `instagram_business_content_publish`.
3. 장기 토큰(60일) 발급·갱신은 Threads 와 같은 패턴
   (`graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&…`).

### Facebook 페이지

1. 앱에 `pages_manage_posts`, `pages_read_engagement`, 첫 댓글용
   `pages_manage_engagement` 스코프.
2. 사용자 장기 토큰 → `GET /me/accounts` 로 **페이지 토큰** 획득 — 장기 사용자
   토큰에서 얻은 페이지 토큰은 무기한이다.

### YouTube

1. Google Cloud Console 에서 프로젝트 생성 → YouTube Data API v3 활성화.
2. OAuth 클라이언트(데스크톱) 생성 → `client_id`/`client_secret`.
3. 스코프 `https://www.googleapis.com/auth/youtube.upload` 로 1회 동의 →
   `refresh_token` 획득. 세 값을 JSON 으로 저장.
4. 커스텀 썸네일 지정에는 채널 전화번호 인증(중급 기능)이 필요 — 없으면 게시는
   성공하고 `thumbnailWarning` 으로 보고된다.
5. **쇼츠 세로 표면(피드·쇼츠 탭) 썸네일은 API 로 못 바꾼다** —
   `thumbnailFilePath` 는 가로 표면(공유 미리보기·검색)만 적용된다. 세로 표면
   프레임은 YouTube 네이티브 앱의 Edit → Edit thumbnail 로만 지정 가능하니,
   첫 화면이 중요한 영상은 게시 후 앱에서 커버 프레임을 지정한다.

## 만료·장애 시

- Meta 계열 60일 초과 만료 → 갱신 불가, 재발급 절차부터 다시.
- `sns_account_check` 가 ok:false 를 주는 채널은 게시 대상에서 제외하고 사유를
  보고한다 — 토큰 문제를 추측으로 고치려 하지 않는다.
