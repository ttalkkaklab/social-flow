# Social publishing credential setup guide

The social-flow MCP server exposes **publish tools only for the platforms whose
credential file exists** in ListTools (evaluated at request time — adding a file takes
effect without a server restart. If either the default token or the channel directory
has the file, that platform's tool shows up).

## Contents

- [File convention — per-channel directories](#file-convention-per-channel-directories-the-default-convention)
- [Issuance procedures in brief](#issuance-procedures-in-brief)
  - [Threads](#threads)
  - [Instagram](#instagram)
  - [Facebook page](#facebook-page)
  - [YouTube](#youtube)
- [On expiry or failure](#on-expiry-or-failure)

## File convention — per-channel directories (the default convention)

**One channel (brand) = one directory** — use the same slug as `data/<slug>/`.
The shared root is `~/.config/social-flow/` (changeable with the `SNS_TOKEN_DIR`
environment variable):

```
~/.config/social-flow/
├── <channel-slug>/                 # e.g. my-channel/ — 1:1 with the publish tools' channel argument
│   ├── threads_token
│   ├── instagram_token
│   ├── facebook_page_token
│   └── youtube-oauth-client.json
└── (flat files)                    # used only when no channel is given — single channel, legacy
```

| Platform | Filename | Format | Lifetime |
|---|---|---|---|
| Threads | `threads_token` | one line, plain-text token | 60 days (refreshable) |
| Instagram | `instagram_token` | one line, plain-text token | 60 days (refreshable) |
| Facebook page | `facebook_page_token` | one line, plain-text token | indefinite |
| YouTube | `youtube-oauth-client.json` | `{"client_id","client_secret","refresh_token"}` | refresh token (near-permanent) |

```bash
mkdir -p ~/.config/social-flow/<channel-slug> && chmod 700 ~/.config/social-flow ~/.config/social-flow/<channel-slug>
# after saving a token, always:
chmod 600 ~/.config/social-flow/<channel-slug>/*
```

- **No fallback when a channel is given** — pass `channel` to a publish tool and only
  that channel directory's token is used. If the file isn't there it returns an
  explicit error (with the list of available channels) and **does not fall back** to
  the default (flat) token — a deliberate design that makes publishing to another
  brand's account impossible in the first place.
- The channel directory can hold extra files beyond the convention ones (an app secret
  env file, credentials from the issuance procedure, and so on) — the server only
  reads the convention filenames.
- The per-platform `*_TOKEN_FILE` env overrides apply **to the flat (default) path
  only**.
- **Token values are not taken from env** — Meta's 60-day refresh overwrites the file,
  so it has to be file-based for refresh to work, and it also keeps secrets out of a
  committed file (.mcp.json).
- **The publishing account is decided automatically from the token's /me** — there is
  deliberately no account-ID setting (which makes publishing to the wrong account
  through a token/account mismatch impossible).
- After setup, check the account id, name and validity with `sns_account_check` (with
  the channel given) — leave the channel out and it checks every channel directory
  plus the default token at once, grouped by channel.

## Issuance procedures in brief

### Threads

1. Create an app in the Meta developer console (developers.facebook.com) → enable the
   Threads API.
2. Scopes: `threads_basic`, `threads_content_publish`, plus `threads_manage_replies`
   if you also want reply management. **To use the grow-threads skill (the growth
   loop) you additionally need** `threads_manage_insights` (the threads_insights tool)
   and `threads_keyword_search` (the threads_search tool). In the consent flow, only
   **the scopes whose checkbox you ticked** ride along on the token — if an existing
   publishing token doesn't have those two, you have to add the scopes and **reissue
   the token** (refreshing doesn't add scopes). Keyword search returns only your own
   account's posts until the app has advanced access approved.
3. Get a short-lived token → exchange it for a long-lived one (60 days):
   `GET https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=…&access_token=…`
4. Refresh (before expiry, allowed once 24 hours have passed):
   `GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=$(cat ~/.config/social-flow/<channel-slug>/threads_token)`
   — save the token from the response **back into that same file only**, and don't
   print the value.

### Instagram

1. Switch the IG account to professional (business/creator).
2. Set up an Instagram API with Instagram Login app (or the FB-page-linked kind).
   Scopes: `instagram_business_basic`, `instagram_business_content_publish`.
3. Issuing and refreshing the long-lived (60-day) token follows the same pattern as
   Threads (`graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&…`).

### Facebook page

1. Give the app the `pages_manage_posts` and `pages_read_engagement` scopes, plus
   `pages_manage_engagement` for the first comment.
2. Long-lived user token → get the **page token** via `GET /me/accounts` — a page
   token obtained from a long-lived user token doesn't expire.

### YouTube

1. Create a project in the Google Cloud Console → enable the **YouTube Data API v3**.
   To use the growth loop (grow-youtube), turn on the **YouTube Analytics API** as well.
2. Create an OAuth client (desktop) → `client_id`/`client_secret`.
3. Turn the scopes on and consent once → get the `refresh_token`. Save the three
   values as JSON.

   | Scope | What it opens | When it's needed |
   |---|---|---|
   | `youtube.upload` | `youtube_publish` upload | publishing (required) |
   | `youtube.force-ssl` | **subtitle upload (`captionFilePath`)** + reading comments and replying | **publishing (required)** · growth loop |
   | `youtube.readonly` | the channel and video queries in `youtube_insights` | growth loop |
   | `yt-analytics.readonly` | period metrics (views, watch time, subscriber change) | growth loop |
   | `yt-analytics-monetary.readonly` | revenue metrics (`includeRevenue: true`) | optional |

   **`force-ssl` is now needed for publishing too** — this pipeline doesn't burn
   subtitles into the video, it uploads them separately with `captions.insert`, and
   that call is rejected by the upload-only `youtube.upload`. Publish with an old
   token that only has upload turned on and **the video goes up while the subtitles
   fail** (`captionWarning`). At that point the video is already public, so don't
   republish — reissue the token with the procedure below and then upload just the
   subtitles from Studio.

   **A token already issued for publishing doesn't have the four above** — a scope
   error on the first call to a subtitle or growth tool is normal, and the error
   carries these instructions. In the consent flow, **tick every checkbox one by one**
   (miss one and that one feature is blocked), reissue, and swap the `refresh_token`
   in `youtube-oauth-client.json`. Leave `client_id`/`client_secret` alone.
4. Setting a custom thumbnail needs channel phone verification (an intermediate
   feature) — without it the publish still succeeds and reports a `thumbnailWarning`.
   The Related video setting that links a short to a long-form video also needs at
   least phone verification (and the setting itself only exists in Studio — no API
   support).
5. **The shorts portrait surface (feed, shorts tab) thumbnail can't be changed through
   the API** — `thumbnailFilePath` applies to the landscape surface (share previews,
   search) only. The portrait surface frame can only be set through Edit → Edit
   thumbnail in the YouTube native app, so for a video where the first frame matters,
   set the cover frame from the app after publishing.

## On expiry or failure

- A Meta token past 60 days can't be refreshed — start over from the issuance procedure.
- Drop any platform where `sns_account_check` returns ok:false from the publish
  targets and report why — don't try to fix a token problem by guessing.
