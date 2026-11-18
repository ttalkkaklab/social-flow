# TikTok integration reference

Verified: 2026-11-16. Recheck the official links before app submission and at least
monthly while operating; permission, audit and quota policies can change.

## API mapping

| Tool | Official endpoint / behavior |
|---|---|
| `tiktok_auth` | Desktop Login Kit + `/v2/oauth/token/` code exchange and rotating refresh |
| `sns_account_check` | `/v2/user/info/`, scope-aware identity and optional account counts |
| `tiktok_creator_info` | `/v2/post/publish/creator_info/query/` |
| `tiktok_upload` | `/v2/post/publish/inbox/video/init/`, FILE_UPLOAD |
| `tiktok_publish` | `/v2/post/publish/video/init/`, FILE_UPLOAD |
| `tiktok_status` | `/v2/post/publish/status/fetch/` |
| `tiktok_videos` | `/v2/video/list/`, public videos with basic engagement counts |

[Desktop Login Kit](https://developers.tiktok.com/docs/en/login-kit-desktop)
requires a registered loopback redirect and PKCE. TikTok specifies **hex SHA-256**
for code_challenge (not the usual base64url encoding). State is random per attempt.
[Token management](https://developers.tiktok.com/docs/en/oauth-user-access-token-management)
currently documents two-hour access tokens and 180-day refresh tokens; code uses
`expires_in` and `refresh_expires_in`, never those constants. Refresh rotates tokens.

[Inbox upload](https://developers.tiktok.com/docs/en/content-posting-api-get-started-upload-content)
requires app approval and creator authorization for video.upload. A delivered draft
requires the creator to open their inbox and finish editing/posting inside TikTok.
[Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post)
requires video.publish and fresh creator information. It supports commercial and
AI-generated content disclosures. Public visibility requires an audited client.

[Content sharing guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines)
exclude internal team-account upload utilities from acceptable audit use cases.
Unaudited clients are limited to SELF_ONLY with private creator accounts. Show an
editable preview/caption, creator identity, privacy choices without a default and
interactions initially off. Commercial disclosure must be selectable. Obtain the
creator's explicit upload consent plus applicable music/branded-content acceptance.
Do not add unwanted promotional watermarks. A tool call with boolean arguments does
not establish that a product satisfies the required UX or passes audit.

[Media transfer](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide)
allows MP4/MOV/WebM with H.264/H.265/VP8/VP9, 23–60 FPS, both dimensions 360–4096,
and up to 4 GB. Inbox video duration is at most ten minutes; Direct Post obeys the
creator's current limit. The adapter chooses 10 MB chunks, rounds chunk count down,
and includes trailing bytes in the final chunk. Small files use one whole chunk.
Uploads use only the signed HTTPS URL returned by TikTok, with no OAuth header.

[Post status](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status)
distinguishes processing, SEND_TO_USER_INBOX, PUBLISH_COMPLETE and FAILED. The
provider field `publicaly_available_post_id` has that spelling. The adapter saves
requestId and publishId before transfer; a lost initialization response stays
submission_unknown. Never discard the receipt or invent another ID to retry it.
No automatic init/chunk retries occur. An operator must inspect an interrupted
request and the TikTok account before starting a replacement attempt.

[User info](https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info)
uses basic/profile/stats scopes for different fields.
[Video list](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list)
needs video.list and returns public videos only. These metrics are not full Studio
analytics, private-video access, comment management, or Vietnam audience targeting.
Vietnamese copy and channel positioning do not guarantee delivery to Vietnam.
