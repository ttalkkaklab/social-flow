# YouTube·Instagram·TikTok·Facebook Reels 게시 API 조사 (2026-11-18)

대상 워크스페이스: `/Volumes/data/story/mochi_bo` (채널 slug `mochi-bo`, 9:16 쇼츠, 베트남어 음성)

공식 문서는 2026-11-18에 직접 열어 확인했습니다. 공식 페이지에서 확인하지 못한 내용은 **UNVERIFIED** 로 표시했습니다.
이 문서에서 새로 구현한 엔드포인트는 mock 시험만 통과했고, 실제 계정으로 게시해 보지는 않았습니다.

## 1. mochi_bo 연동 현황

`.social-flow/models.json` 의 `sns` 설정과 `~/.config/social-flow/mochi-bo/` 의 파일을 대조했습니다.

| 플랫폼 | 설정 상태 | 자격 파일 | 연동하려면 |
|---|---|---|---|
| TikTok | connected (`mochiandbo.vn`) | `tiktok-client.json`, `tiktok-oauth.json` | 끝났습니다. Direct Post 감사를 받기 전에는 `SELF_ONLY` 로만 게시할 수 있습니다 |
| Facebook Page | connected (Page `1383354374869971`) | `facebook_page_token` | 끝났습니다. Reels 로 올리려면 `facebook_publish` 에 `reel: true` 를 붙입니다(이번 수정). 단 Reel 은 90초까지라 지금 에피소드 대부분(100–215초)은 일반 Page 영상으로 올라갑니다 |
| Instagram | connected (2026-11-18) | `instagram_token` (만료 없는 페이지 토큰) | 새 Meta 앱은 Instagram 로그인을 쓸 수 없어서 Facebook 로그인 경로로 연결했습니다. 플러그인이 `EAA` 토큰을 graph.facebook.com 으로 보내도록 고쳤습니다 |
| YouTube | connected (2026-11-18) | `youtube-oauth-client.json` | GCP 프로젝트 `mochi-bo-youtube` 의 내부용 앱 `Mochi Bo Publisher` 로 스코프 5개를 받았습니다 |

mochi_bo 의 MCP 서버는 `.social-flow/production-runtime` 스냅샷에서 돌아갑니다. 따라서 이번 수정은 그 스냅샷을 새 빌드로 바꿔야 mochi_bo 에 반영됩니다.

## 2. 공통 흐름

모든 플랫폼이 같은 순서로 게시합니다: **인증 → 업로드 세션 열기 → 미디어 전송 → 처리 대기 → 게시 확정 → 상태 확인**.
다른 점은 세 가지입니다.

- **파일을 보내는 방법**
  - YouTube 와 TikTok 은 로컬 파일을 직접 올립니다.
  - Instagram(Instagram Login)은 공개 URL 만 받습니다.
  - Facebook Reels 는 둘 다 받습니다.
- **비공개로 시작할 수 있는지**
  - YouTube 는 `private` 로 올릴 수 있습니다.
  - TikTok 은 `SELF_ONLY` 로 올릴 수 있습니다.
  - Facebook 은 `DRAFT` 로 올릴 수 있습니다.
  - Instagram 은 API 로 비공개 게시하는 방법이 없습니다.
- **재시도 위험:** 게시 확정 요청은 어느 플랫폼에서도 멱등이 아닙니다. 응답을 잃었다면 상태 조회로 확인해야 하며 다시 게시하면 안 됩니다.

## 3. YouTube Data API v3 (Shorts)

출처:
- https://developers.google.com/youtube/v3/docs/videos/insert
- https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
- https://developers.google.com/youtube/v3/docs/videos/update
- https://developers.google.com/youtube/v3/docs/thumbnails/set
- https://developers.google.com/youtube/v3/revision_history

### 3.1 인증

- Google Cloud 프로젝트에서 YouTube Data API v3 를 켭니다. OAuth 클라이언트는 데스크톱 유형으로 만듭니다.
- 스코프별 용도:

| 스코프 | 열리는 기능 |
|---|---|
| `youtube.upload` | 업로드 |
| `youtube` 또는 `youtube.force-ssl` | `videos.update`(공개 전환) |
| `youtube.readonly` | `videos.list`(처리 상태 조회) |

- `youtube.upload` 만 있는 토큰으로는 공개 전환을 할 수 없습니다.
- 토큰은 refresh token 으로 `https://oauth2.googleapis.com/token` 에서 매번 access token 을 받습니다.

### 3.2 업로드: `videos.insert` (resumable)

1. **세션 시작:** `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`
   - 헤더: `Authorization: Bearer`, `Content-Type: application/json; charset=UTF-8`, `X-Upload-Content-Length`, `X-Upload-Content-Type: video/*`
   - 응답: `200` 과 `Location` 헤더(세션 URI)
2. **전송:** 세션 URI 로 `PUT` 합니다.
   - 청크로 나누면 마지막을 뺀 모든 청크가 256KiB 의 배수여야 합니다.
   - 중간 청크는 `308`, 마지막 청크는 `201` 과 video 리소스를 받습니다.
3. **이어 올리기:** 빈 `PUT` 에 `Content-Range: bytes */<total>` 를 보냅니다.
   - `308` 과 `Range: bytes=0-N` 이 오면 N+1 번째 바이트부터 이어 보냅니다.
   - `404` 는 세션 만료입니다. 새 세션을 열어야 합니다.

요청 본문(video 리소스):

| 필드 | 타입 | 제약 |
|---|---|---|
| `snippet.title` | string | 100자 이하, `<` `>` 금지 |
| `snippet.description` | string | 5000 **바이트** 이하 |
| `snippet.tags[]` | string[] | 전체 합 500자 이하 |
| `snippet.categoryId` | string | `videoCategories.list` 의 ID |
| `snippet.defaultLanguage` | string | 제목·설명의 언어 (BCP-47) |
| `snippet.defaultAudioLanguage` | string | 오디오 언어 (BCP-47) |
| `status.privacyStatus` | `private`/`unlisted`/`public` | **생략하면 public** |
| `status.publishAt` | datetime | private 일 때만 예약 공개 |
| `status.selfDeclaredMadeForKids` | bool | 아동용 자기 신고 |
| `status.containsSyntheticMedia` | bool | 사실처럼 보이는 합성·변조 콘텐츠 공개 |
| `status.license`, `embeddable`, `publicStatsViewable` | | 선택 |

응답(요약):

```json
{"kind":"youtube#video","id":"VIDEO_ID",
 "snippet":{"title":"…","categoryId":"22","defaultAudioLanguage":"vi"},
 "status":{"uploadStatus":"uploaded","privacyStatus":"private","selfDeclaredMadeForKids":false,"containsSyntheticMedia":true}}
```

(응답 예시는 리소스 스키마로 재구성한 것입니다. UNVERIFIED)

### 3.3 한도·분류·썸네일

- **쿼터:** `videos.insert` 는 전용 "Video Uploads" 버킷에서 호출당 1 unit, 하루 100회입니다(2026-06-01 분리). 다른 메서드는 하루 10,000 unit 을 함께 씁니다.
- **미검증 프로젝트:** 이제 비공개로 강제되지 않습니다(2026-11-02 문서 개정).
- **Shorts 분류:** 정사각형이나 세로 화면비에 3분 이하이면 Shorts 입니다. API 에 Shorts 전용 플래그는 없습니다.
- **`thumbnails.set`:** `POST https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=…`
  - 파일은 50MB 까지 됩니다(2026-09-14 전에는 2MB).
  - 2026-11-03부터 Shorts 에도 쓸 수 있습니다. 단 `processingDetails.processingStatus = succeeded` 뒤에 불러야 합니다. 그 전에 부르면 적용되지 않을 수 있습니다.
- **`videos.update`:** `PUT …/videos?part=snippet,status`
  - 지정한 part 를 통째로 덮어씁니다. 빠진 필드는 지워지거나 기본값으로 돌아갑니다.
  - 그래서 `videos.list` 로 현재 값을 읽고, 바꿀 값만 고쳐 다시 보냅니다.

## 4. Instagram Reels (Instagram Graph API)

출처:
- https://developers.facebook.com/docs/instagram-platform/content-publishing/
- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-container
- https://developers.facebook.com/docs/instagram-platform/content-publishing/resumable-uploads

### 4.1 로그인 방식

| 방식 | 스코프 | 호스트 | 로컬 파일 업로드 |
|---|---|---|---|
| Instagram Login (플러그인이 쓰는 방식) | `instagram_business_basic`, `instagram_business_content_publish` | `graph.instagram.com` | **안 됨.** `video_url` 만 받습니다 |
| Facebook Login for Business | `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` | `graph.facebook.com` | rupload resumable 가능 |

- 계정은 프로페셔널(비즈니스·크리에이터) 계정이어야 합니다.
- 토큰은 60일짜리이며 `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=…` 로 갱신합니다.
- 발급 뒤 24시간이 지나야 갱신할 수 있고, 만료된 토큰은 갱신할 수 없습니다.

### 4.2 게시 3단계

**1단계: 컨테이너 생성**
- 요청: `POST https://graph.instagram.com/v23.0/{ig-user-id}/media`

| 파라미터 | 필수 | 설명 |
|---|---|---|
| `media_type` | Y | `REELS` |
| `video_url` | Y | 공개 URL. Meta 가 직접 가져갑니다 |
| `caption` | N | 2,200자, 해시태그 30개, 멘션 20개 |
| `share_to_feed` | N | false 면 Reels 탭에만 보입니다 |
| `thumb_offset` | N | 커버로 쓸 프레임 위치(ms). 기본값 0 = 첫 프레임 |
| `cover_url` | N | 커버 JPEG URL. 지정하면 `thumb_offset` 은 무시됩니다 |
| `is_ai_generated` | N | AI 사용 자기 신고 |
| `collaborators` | N | 최대 3명 |
| `audio_name`, `location_id`, `user_tags` | N | |
| `trial_params` | N | 팔로워가 아닌 사람에게만 보이는 trial reel |

- 응답: `{"id":"<IG_CONTAINER_ID>"}`

**2단계: 처리 대기**
- 요청: `GET /{container-id}?fields=status_code,status`
- `status_code` 값: `IN_PROGRESS`, `FINISHED`, `ERROR`(이유는 `status` 에), `EXPIRED`(24시간 안에 게시하지 않음), `PUBLISHED`
- 권장: 1분에 한 번씩, 최대 5분까지 조회합니다.

**3단계: 게시**
- 요청: `POST /{ig-user-id}/media_publish` (`creation_id`) → `{"id":"<IG_MEDIA_ID>"}`

### 4.3 사양과 한도

- **영상:** MP4·MOV, H.264·HEVC, AAC 48kHz, 23–60fps, 3초–15분, 300MB 이하, 9:16 권장
- **커버:** JPEG 8MB 이하
- **게시 한도:** 24시간에 50건 또는 100건입니다. 문서끼리 숫자가 달라서 `GET /{ig-user-id}/content_publishing_limit?fields=quota_usage,config` 의 `quota_total` 을 기준으로 삼습니다.
- **컨테이너 한도:** 24시간에 400개
- **비공개 게시:** API 로 비공개 게시하거나 숨기는 파라미터가 없습니다.

## 5. Facebook Page Reels

출처:
- https://developers.facebook.com/docs/video-api/guides/reels-publishing
- https://developers.facebook.com/docs/graph-api/reference/page/video_reels

### 5.1 권한

- Page access token 을 씁니다(장기 사용자 토큰에서 `/me/accounts` 로 받으면 만료되지 않습니다).
- 권한: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`
- 게시하는 사람에게 `CREATE_CONTENT` 작업 권한이 있어야 합니다.

### 5.2 게시 3단계

**1단계: 시작**
- 요청: `POST https://graph.facebook.com/v23.0/{page-id}/video_reels` (`upload_phase=start`)
- 응답: `{"video_id":"…","upload_url":"…"}`

**2단계: 업로드**
- 요청: `POST https://rupload.facebook.com/video-upload/v23.0/{video-id}`

| 헤더 | 쓰는 경우 | 설명 |
|---|---|---|
| `Authorization` | 항상 | `OAuth <PAGE_TOKEN>` |
| `file_url` | 호스팅된 파일 | 공개 URL. `facebookexternalhit` 가 접근할 수 있어야 하고 fbcdn URL 은 거부됩니다 |
| `offset`, `file_size` | 로컬 파일 | 본문은 바이너리(`application/octet-stream`) |

- 응답: `{"success":true}`

**3단계: 마무리**
- 요청: `POST /{page-id}/video_reels`

| 파라미터 | 필수 | 설명 |
|---|---|---|
| `upload_phase` | Y | `finish` |
| `video_id` | Y | 1단계에서 받은 ID |
| `video_state` | Y | `PUBLISHED` / `DRAFT` / `SCHEDULED` |
| `description` | N | 본문 |
| `title` | N | 제목 |
| `scheduled_publish_time` | SCHEDULED 일 때 Y | 10분 뒤 ~ 29일 이내의 unix 시각 |
| `is_ai_generated` | N | AI 사용 자기 신고 |
| `place` | N | 위치 Page |

- 응답: `{"success":true}`. 레퍼런스에는 `post_id` 필드도 있지만 실제로 오는지는 UNVERIFIED 입니다.

**상태 확인:** `GET /{video-id}?fields=status`
- `video_status`: `uploading`, `processing`, `ready`, `error`, `expired`, …
- `uploading_phase`, `processing_phase`, `publishing_phase`: 각각 `status` 와 `error` 를 가집니다.
- `publishing_phase.publish_status`: `published`, `draft`, `scheduled`
- 완료 표기는 레퍼런스가 `completed`, 예시가 `complete` 입니다. 둘 다 처리해야 합니다.

### 5.3 사양과 한도

- **영상:** 9:16, 1080×1920 권장(최소 540×960), 24–60fps, **3–90초**, H.264·H.265, AAC 48kHz
- **게시 한도:** Page 당 24시간에 30건
- **커버 이미지:** `POST /{video-id}/thumbnails` 로 바꿉니다(`source`, `is_preferred`).
- **`/{page-id}/videos` 와의 차이:** `/videos` 는 일반 Page 영상을 올리는 엔드포인트입니다. 세로 영상을 이리로 올렸을 때 Reel 이 된다고 쓴 공식 문서는 없습니다. Reel 로 올리려면 `video_reels` 를 씁니다.

## 6. TikTok Content Posting API

출처:
- https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
- https://developers.tiktok.com/doc/content-posting-api-reference-upload-video
- https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
- https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status
- https://developers.tiktok.com/doc/content-sharing-guidelines
- https://developers.tiktok.com/doc/oauth-user-access-token-management

### 6.1 인증

- 데스크톱 Login Kit 으로 OAuth 를 진행합니다. 플러그인은 PKCE 의 `code_challenge` 를 SHA256 hex 로 보내고, 이 방식으로 실제 연결에 성공했습니다(문서 대조는 UNVERIFIED).
- 토큰 발급과 갱신은 모두 `POST https://open.tiktokapis.com/v2/oauth/token/` 입니다.
- 현재 문서상 수명은 access token 2시간, refresh token 180일입니다.
- 갱신할 때마다 refresh token 이 새로 오므로 반드시 바꿔 저장해야 합니다.
- 스코프별 용도:

| 스코프 | 용도 |
|---|---|
| `video.publish` | Direct Post |
| `video.upload` | inbox 초안 업로드 |
| `user.info.basic` | 계정 확인 |

### 6.2 게시 단계

공통 헤더: `Authorization: Bearer`, `Content-Type: application/json; charset=UTF-8`

**1단계: 크리에이터 정보 조회**
- 요청: `POST /v2/post/publish/creator_info/query/` (분당 20회)
- 응답:
  - `privacy_level_options[]`
  - `comment_disabled`, `duet_disabled`, `stitch_disabled`
  - `max_video_post_duration_sec`
  - `creator_nickname`

**2단계: 게시 시작**
- Direct Post: `POST /v2/post/publish/video/init/` (분당 6회)
- inbox 초안: `POST /v2/post/publish/inbox/video/init/`. `source_info` 만 받습니다.

```json
{"post_info":{"title":"…","privacy_level":"SELF_ONLY","disable_comment":true,"disable_duet":true,
  "disable_stitch":true,"video_cover_timestamp_ms":6000,"brand_content_toggle":false,
  "brand_organic_toggle":false,"is_aigc":true},
 "source_info":{"source":"FILE_UPLOAD","video_size":12345678,"chunk_size":10000000,"total_chunk_count":1}}
```

- 응답: `{"data":{"publish_id":"v_pub_file~…","upload_url":"https://open-upload.tiktokapis.com/…"},"error":{"code":"ok"}}`

**3단계: 청크 업로드**
- 요청: `upload_url` 로 `PUT` 합니다.
- 헤더: `Content-Type: video/mp4`, `Content-Range: bytes {first}-{last}/{total}`
- 청크 규칙:
  - 청크는 5–64MB 이고, 마지막 청크만 128MB 까지 커질 수 있습니다.
  - 5MB 미만 파일은 한 번에 올립니다.
  - 청크 수는 1–1000 개이며 `floor(size/chunk)` 로 셉니다.
- 응답 코드: 중간 청크 `206`, 마지막 청크 `201`
- 1시간 안에 끝내야 합니다.

**4단계: 상태 확인**
- 요청: `POST /v2/post/publish/status/fetch/` (`publish_id`)
- `status` 값: `PROCESSING_UPLOAD`, `PROCESSING_DOWNLOAD`, `SEND_TO_USER_INBOX`, `PUBLISH_COMPLETE`, `FAILED`
- 그 밖의 필드: `fail_reason`, `publicaly_available_post_id`(문서 원문 철자 그대로)

### 6.3 사양·감사·한도

- **영상:** MP4·WebM·MOV, H.264·H.265·VP8·VP9, 양 변 360–4096px, 23–60fps, 4GB 이하, 최대 10분. 실제 상한은 크리에이터별 `max_video_post_duration_sec` 입니다.
- **감사 전 클라이언트**
  - 24시간에 최대 5명만 게시할 수 있습니다.
  - 게시하는 계정이 비공개 계정이어야 하고, 게시물은 `SELF_ONLY` 로만 올라갑니다.
- **크리에이터당 게시 상한:** 하루 약 15건
- **오류 코드:** `spam_risk_too_many_posts`, `unaudited_client_can_only_post_to_private_accounts`, `privacy_level_option_mismatch`, `rate_limit_exceeded`. init 에서는 403·429 로 옵니다.
- **Direct Post 화면 요건**
  - 크리에이터 nickname 을 표시합니다.
  - 공개 범위에 기본값을 두지 않습니다.
  - 댓글·Duet·Stitch 는 꺼진 상태에서 시작합니다.
  - 상업 콘텐츠 공개 토글을 둡니다.
  - Music Usage Confirmation 동의 문구를 보여 줍니다.

## 7. 플러그인 구현 적대 분석 (2026-11-18)

대상 파일: `server/src/sns-client.ts`, `server/src/tiktok-client.ts`, `server/src/tools.ts`, `server/src/handlers.ts`

| # | 플랫폼 | 발견 | 근거 | 조치 |
|---|---|---|---|---|
| 1 | Facebook | 영상이 `/{page}/videos` 로만 게시돼 일반 Page 영상이 됩니다. 도구 설명에도 "not Reels" 라고 적혀 있습니다. 사용자가 원하는 Reels 를 만들지 못합니다 | reels-publishing 가이드 | `reel: true` 일 때 `video_reels` start → rupload(`file_url`) → finish(`PUBLISHED`) 순서로 보내고, 처리·게시 단계를 조회합니다. 처리 실패면 이유를 돌려줍니다. 시간 안에 끝나지 않으면 `processingWarning` 과 함께 성공으로 돌려줍니다. 다시 호출하면 Reel 이 두 번 올라가기 때문입니다 |
| 2 | Instagram | 컨테이너가 `ERROR` 일 때 `status_code` 만 읽어서 실패 이유가 빠집니다 | ig-container 레퍼런스 | `status_code,status` 를 함께 읽어 이유를 붙입니다. Threads 는 문제 해결 문서의 예시 요청(`fields=status,error_message`)대로 `error_message` 를 읽습니다 |
| 3 | Instagram | Reels 처리 대기가 2초 간격으로 2분까지라 문서의 5분 창보다 짧습니다. 긴 영상이 시간 초과로 끝날 수 있습니다 | 같은 문서(1분 간격, 최대 5분) | Reels 는 10초 간격으로 5분까지 기다립니다. 이미지와 Threads 는 그대로 둡니다 |
| 4 | Instagram | 커버(`thumb_offset`, `cover_url`), `share_to_feed`, `is_ai_generated` 를 보낼 수 없어서 그리드에 첫 프레임이 커버로 나옵니다 | ig-user/media 레퍼런스 | 네 값을 선택 입력으로 추가했습니다. 값을 줬을 때만 보냅니다 |
| 5 | YouTube | 업로드 직후 곧바로 `thumbnails.set` 을 부릅니다. 2026-11-03 문서는 Shorts 썸네일을 처리가 끝난 뒤에 설정하라고 합니다 | thumbnails/set | Shorts 모양(세로·정사각, 3분 이하, ffprobe 로 판별)이면 `processingStatus = succeeded` 를 최대 5분 기다린 뒤 설정합니다. 가로 영상은 기다리지 않습니다. 상태를 읽을 스코프(`force-ssl` 또는 `readonly`)가 없으면 기다리지 않고 설정한 뒤 `processingNote` 로 알립니다 |
| 6 | YouTube | 썸네일 크기 상한이 예전 값인 2MB 로 남아 있습니다 | thumbnails/set (50MB) | 50MB 로 고쳤습니다 |
| 7 | YouTube | `defaultLanguage`·`defaultAudioLanguage` 를 보낼 수 없습니다. mochi_bo 는 베트남어 음성입니다 | videos 리소스 | 선택 입력으로 추가했습니다 |
| 8 | YouTube | `youtube_update` 의 `changed.privacyStatus` 를 요청 값으로 계산해서 API 가 다른 값을 남겨도 알 수 없습니다 | videos.update | 응답 값과 비교하도록 고쳤습니다 |
| 9 | TikTok | init 이 4xx(예: `spam_risk_too_many_posts`)로 분명히 거절돼도 영수증에 `submission_unknown` 이 기록됩니다. 그래서 같은 requestId 로 영영 다시 보낼 수 없습니다 | direct-post 오류 표 | 4xx 거절은 `rejected` 로 남기고 같은 requestId 로 다시 보낼 수 있게 했습니다. 연결 끊김과 5xx 는 그대로 `submission_unknown` 입니다 |
| 10 | 문서 | `token-setup.md` 가 `force-ssl` 을 자막 전용이라고 적었고 Shorts 커버는 API 로 못 바꾼다고 적었습니다. 그러나 공개 전환(`videos.update`)에도 `force-ssl` 이 필요합니다 | videos/update, thumbnails/set | 스코프 표와 커버 항목을 고쳤습니다(`setup-youtube` 는 이미 맞았습니다) |

확인한 뒤 고치지 않은 것:

- **YouTube 쿼터 설명("1 unit, 하루 100회"):** 현재 문서와 맞습니다.
- **TikTok PKCE hex 인코딩:** 이번에 문서로 확인하지는 않았습니다. 근거는 이 방식으로 mochi-bo 계정이 실제로 연결됐다는 사실(2026-11-16)입니다.
- **TikTok 청크 계획(10MB 단위, 나머지는 마지막 청크에):** 5–64MB 규칙과 1청크 예외를 지킵니다.
- **Graph API `v23.0`:** 최신은 v27.0(2026-11-04)입니다. changelog 에 v23.0 은 2027-10-08 까지 쓸 수 있다고 적혀 있어 그대로 둡니다. 그 전에 올려야 합니다.
- **Instagram 로컬 파일 업로드:** Instagram Login 토큰은 rupload 를 쓸 수 없어서 `video_url` 방식을 유지합니다.
- **TikTok 비공개 시작:** CLAUDE.md 가 정한 대로 작업 흐름 규칙으로 두고, 서버가 강제하지 않습니다.
- **YouTube Shorts 세로 커버의 Studio 수동 단계:** API 커버가 Shorts 탭에 실제로 나오는지 이 채널에서 측정한 적이 없어서 유지합니다.
- **YouTube `paidProductPlacementDetails`:** 2026-11-16부터 기본값이 없습니다. 유료 PPL 이 없는 채널은 보내지 않아도 되는지 확인되지 않았습니다(UNVERIFIED).

### 7.1 mochi_bo 영상 길이와 플랫폼 한도

납품된 `output/video/video.mp4` 길이는 76–215초입니다(ep03 77초, ep01 127초, ep04 215초 등).

| 플랫폼 | 한도 | mochi_bo 에 미치는 영향 |
|---|---|---|
| Facebook Reel | 3–90초 | ep03 만 Reel 로 올릴 수 있습니다. 나머지는 `reel` 없이 일반 Page 영상으로 올립니다 |
| YouTube Shorts | 세로·3분 이하 | ep04(215초)는 Shorts 가 아니라 세로 일반 영상으로 분류됩니다 |
| Instagram Reels | 3초–15분 | 모두 가능합니다 |
| TikTok | 크리에이터별 `max_video_post_duration_sec` | 게시 직전 creator_info 로 확인합니다 |

## 8. 남은 확인

- **Facebook Reel 실제 게시:** 처음 실제로 올릴 때 finish 응답에 `post_id` 가 오는지와 `facebook_comment` 가 video ID 로 달리는지 확인합니다.
- **YouTube Shorts 커버:** 공개 전환 뒤 Shorts 탭 타일이 API 커버를 보여 주는지 확인합니다.
- **Instagram 게시 한도:** 연동 뒤 `content_publishing_limit` 로 실제 한도(50 또는 100)를 확인합니다.
