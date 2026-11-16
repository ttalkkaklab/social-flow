---
name: setup-tiktok
description: >
  Connects a TikTok account with OAuth; stops before uploading or publishing.
  Use for "틱톡 API 연동", "틱톡 채널 연결", "set up TikTok", or "connect TikTok".
  Checks the live account and developer app in ego lite, configures Desktop Login Kit
  and Content Posting API scopes, then uses tiktok_auth and sns_account_check.
  Reports app-review and user-consent blockers separately from browser login.
argument-hint: "<channel> [status|connect]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "mcp__social-flow__tiktok_auth", "mcp__plugin_social-flow_social-flow__tiktok_auth", "mcp__social-flow__sns_account_check", "mcp__plugin_social-flow_social-flow__sns_account_check", "mcp__social-flow__project_manage", "mcp__plugin_social-flow_social-flow__project_manage"]
---

Read [automation guidance](../_shared/automation-guidance.md). Reuse existing user
authorization. This skill connects an account; it does not authorize a test upload.

## Resume from evidence

1. Read `data/<channel>/profile.md` and `project_manage status`. Resolve the intended
   live handle. Never rename an existing account without the owner's instruction.
2. Run `tiktok_auth` with `action: "status"` and this channel. If the live account
   check succeeds, compare its username/open_id with the intended channel.
3. If credentials are missing, inspect the developer app in **ego lite only**.
   Read the host's ego-browser skill and run `ego-browser skill` before browser work.
   Keep one task space in the user-requested profile. No browser fallback.
4. Hand off login without supplied credentials, CAPTCHA, verification codes and
   user consent when the browser requests them. Resume the same task space after
   the user confirms. Do not request passwords or token values in chat.

## Developer app

TikTok channel login and [TikTok for Developers](https://developers.tiktok.com/)
login are separate. Register/reuse the owner's app, describe its actual purpose,
and select Desktop Login Kit. Use a registered redirect such as
`http://127.0.0.1:3456/callback/`. This adapter binds only to 127.0.0.1 with a fixed
port. A local `file://` storyboard is not a public app homepage or privacy policy.
Do not invent legal pages, app approval, ownership verification or audit evidence.

Request only app-approved scopes needed for the chosen workflow:

| Purpose | Scopes |
|---|---|
| Verify account identity and exact handle | `user.info.basic`, `user.info.profile` |
| Send draft to the TikTok inbox | `video.upload` |
| List public videos and counts | `video.list` |
| Account aggregate counts | `user.info.stats` |
| Direct Post, subject to review | `video.publish` |

Add Content Posting API for upload; add Display API for the read features.
Sandbox/test users and product/scope review are managed in the developer portal.
Approval of one scope does not prove approval of another.

**Direct Post has an eligibility restriction:** internal/private utilities for
uploading to the owner's or team's accounts are not an acceptable audit use case.
An unaudited client can only post SELF_ONLY and TikTok requires the account to be
private. Do not change account privacy just to bypass this restriction. Prefer
inbox upload with the owner's approval; the owner finishes the post inside TikTok.
A publicly distributed integration still needs TikTok's review and required UX;
this plugin's adapter is not proof of approval. See [API reference](references/api.md).

## Credentials and OAuth

Keep files outside the repository, under `${SNS_TOKEN_DIR}/<channel>/` (default
`~/.config/social-flow/<channel>/`). Use directory mode 0700 and file mode 0600.
Never log or return client secrets, access/refresh tokens or signed upload URLs.

Save the developer app credentials as `tiktok-client.json` with these fields:

```json
{
  "client_key": "COPY_FROM_OWN_APP",
  "client_secret": "COPY_FROM_OWN_APP_WITHOUT_LOGGING",
  "redirect_uri": "http://127.0.0.1:3456/callback/",
  "direct_post_audited": false
}
```

This is a format example, not a working credential. Never create a placeholder
`tiktok-oauth.json` to make the platform appear connected. Only set
`direct_post_audited: true` after verifying completed audit approval in the portal.

Call `tiktok_auth` with `action: "start"`, `channel`, `expectedHandle` (without @)
and the chosen scopes. Open its authorizationUrl in ego lite. Keep the MCP server
running: it handles the local callback for ten minutes. It validates state, TikTok's
hex-encoded S256 PKCE, granted scopes, exact username and any existing open_id.
No authorization code is passed through chat. The callback saves `tiktok-oauth.json`
atomically with 0600 permissions. Access/refresh expiry uses API response values;
rotated refresh tokens replace old ones under a cross-process lock.

Call `tiktok_auth status`, then `sns_account_check(channel)`. Record connected only
when the live account matches. Use `project_manage update` with a fresh revision,
preserving all existing SNS records, adding:

```json
{"tiktok":{"enabled":true,"status":"pending","handle":"mochiandbovn","credentialRef":"${SNS_TOKEN_DIR}/mochi-bo/tiktok-oauth.json"}}
```

After successful verification use `status: "connected"`, verified `accountId` and
`checkedAt`. The example contains only the new record; include unchanged platform
records in the actual update. If app review, login or OAuth is unfinished, retain
pending and explain the exact missing step. Never report browser login as API-ready.

## Handoff to publishing

Use [publish](../publish/SKILL.md) only for a finished, authorized episode.
`tiktok_upload` sends a draft; `tiktok_publish` uses Direct Post; `tiktok_status`
refreshes the receipt without resubmission; `tiktok_videos` reads public metrics.
Neither method schedules posts or manages comments. Photo posts, remote URL pull,
webhooks and Marketing/Research APIs are outside this adapter's current scope.
