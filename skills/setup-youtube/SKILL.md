---
name: setup-youtube
description: >
  Opens a live YouTube brand channel and wires its OAuth token into social-flow. Use when
  the user asks to "유튜브 채널 개설", "유튜브 브랜드 채널 만들어", "유튜브 API 연동해줘", "쇼츠 붙여줘", "set up a
  YouTube channel". Drives advanced-feature identity verification, brand channel creation,
  branding, and Google OAuth refresh_token issuance in the browser through ego lite,
  handing the screen to the user for phone and selfie verification and consent, then saves
  SNS_TOKEN_DIR/[slug]/youtube-oauth-client.json and verifies it with sns_account_check.
  Spans several days because verification approval is asynchronous — resumable, and a
  status mode reports what is still pending.
argument-hint: "<channel> [status|verify|create|token]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "mcp__social-flow__sns_account_check"]
---

# YouTube channel setup — browser HITL

This skill attaches **a live YouTube brand channel** to one channel (brand). It
drives advanced-features identity verification, brand channel creation, branding,
and Google OAuth `refresh_token` issuance through the browser, but **hands over
only the points that need human hands**. When it's done,
`<SNS_TOKEN_DIR>/<slug>/youtube-oauth-client.json` is saved and you can publish
Shorts with `channel: "<slug>"`.

**This setup spans multiple days** — creating a new brand channel requires
advanced-features identity verification (phone + a 6-second selfie video), and
its **approval is asynchronous (hours to days)**. So it's structured **to detect
state and continue**, not as a linear one-shot run. While waiting on approval,
check progress with `status` only.

Setup skills are split per platform — the `setup-<platform>` family, parallel to
the growth skills (`grow-<platform>`). Where Threads and Instagram are on the
Meta side, YouTube is on the Google side, so the console and OAuth differ
altogether.

## What runs automatically, what gets handed over

Page navigation, form filling, and consent progression run automatically through
the browser. The following are human gates, so **hand them to the user**:

- **Identity verification** — the phone-number code, and the 6-second selfie
  video shot on the phone via QR. Humans only.
- **Google login · 2FA** — account authentication.
- **Consent scope checkboxes** — the user checks each scope directly (§token
  trap).

Hand the screen over with `handOffTaskSpace`, confirm the user is done, then
reclaim it with `takeOverTaskSpace`. An agent task space is invisible in the GUI
until that handoff, so skipping it leaves the user pressing nothing.

## Prerequisites

- `data/<slug>/profile.md` must exist — if not, point to `/social-flow:channel add`
  and stop.
- **ego lite** — the browser lane. Details: §Browser lane below.
- **A Google Cloud OAuth client** (desktop) — `client_id`/`client_secret`.
  Reusing an existing channel's is fine (same Google project).
- YouTube Data API v3 enabled. To use the growth loop (grow-youtube) as well,
  also enable the YouTube Analytics API.

## Browser lane — ego lite only

`ego lite` is the one browser lane. Check for it with `command -v ego-browser`.
It reuses the user's login state inside an agent-only task space, so it never
collides with the user's own tabs, and every field-tested recipe below is written
against it (`references/setup-playbook.md`).

**There is no second lane.** ego lite runs on macOS only. Where it is missing —
Windows, Linux, a machine without it installed — say so and stop. Don't reach for
another browser tool. What still works without a browser is §Manual fallback
below (token issuance only).

**The human gates stay the same** — identity verification, login, and consent
checks get done by the user.

**Another brand's channel may be the active one.** Per absolute rule 1, confirm
the channel ID in the URL before every action.

## Absolute rules (stop immediately on violation)

1. **Confirm the active channel — before every action** — one Google account can
   carry **multiple brand channels**. Pick the target channel with the channel
   switcher, then **confirm the active channel via the URL's channel ID and the
   screen** before proceeding. Never touch another brand channel's Studio,
   settings, uploads, or branding. When in doubt, stop and check with the user.
2. **Never expose token values** — no `refresh_token` or `client_secret` in
   plain text on screen, in logs, or in commits. JSON file only, `chmod 600`.
3. **Store only in the channel directory** —
   `<SNS_TOKEN_DIR>/<slug>/youtube-oauth-client.json`.
4. **Issue only at the production stage** — if the OAuth consent screen is in
   "테스트 중" (testing) status, the issued `refresh_token` **expires in 7
   days**. Publish the consent screen to "프로덕션" (production) before issuing
   (§token trap).
5. **Hand over the human gates** — don't punch through identity verification,
   login, or consent checks automatically.

## State detection & resume (default invocation)

Approval waits can take days, so **the default invocation determines the current
state and continues to the next step**. Check in this order:

1. If `<SNS_TOKEN_DIR>/<slug>/youtube-oauth-client.json` exists → verify with
   `sns_account_check(channel)`. If ok, **done** — summarize channel and scopes,
   then stop.
2. Brand channel exists but no token (user confirms) → start from §3 OAuth
   token.
3. Advanced-features verification approved but no channel → start from §2
   channel creation.
4. Identity verification submitted but not yet approved → **report the wait**
   (same as status). Don't push it along — check approval only via Gmail and the
   account-level page (no touching another brand's Studio).
5. Nothing yet → start from §1 identity verification.

Subcommands: `verify` (identity verification) · `create` (channel creation +
branding) · `token` (OAuth) · `status`.

## Step 1 · Advanced-features identity verification (verify)

Creating a new brand channel requires advanced features, and advanced features
require identity verification.

Procedure: apply for advanced features at `youtube.com/verify` or Studio
Settings > Channel > Feature eligibility → **phone verification** (the user
enters the received code) → **6-second selfie video** (the user scans the QR
with their phone, records, and submits). Both are human gates — hand off the
screen and let the user proceed.

After submission, **approval is asynchronous** (hours to days). From then on,
treat this step as waiting and check approval only via `status`/the default
invocation — **only through Gmail (the approval email) or the account-level
page**. Don't open another brand channel's Studio to check (absolute rule 1).

## Step 2 · Brand channel creation + branding (create) — after approval

Only possible once advanced features are approved.

1. **Create the brand channel** — `youtube.com/account` > create a channel > new
   channel with a brand account. The channel name is the brand name from
   profile.md. Right after creation, **confirm via the URL's channel ID that the
   active channel is the one just created** (absolute rule 1).
2. **Apply branding** — the profile photo and banner **assets come from
   `/social-flow:branding <channel>` output** (this skill doesn't make them, it
   applies them). In Studio Customization > Branding, upload the profile photo
   (`profile-1024`) and banner (`banner-youtube-2048x1152`), and set the
   description and links. **Only on the channel being set up.**

## Step 3 · Google OAuth refresh_token (token)

Reuse the existing OAuth client (`client_id`/`client_secret`), select the target
channel, and consent to issue a fresh `refresh_token`. Treat
`references/setup-playbook.md` §3–§4 as the source of truth. The gist:

- **Production stage required** — if the consent screen is "테스트 중" (testing),
  the refresh_token expires in 7 days. Publish to production, then issue
  (absolute rule 4).
- **Loopback redirect** — open authorize with
  `redirect_uri=http://localhost:<PORT>` and receive the code with a small
  listener in the scratchpad (listener included in playbook §3).
- **Channel selection** — during consent, in the account/channel picker, choose
  **the brand channel being set up**. Pick the wrong channel and you get that
  channel's token (absolute rule 1).
- **Unverified-app warning** — proceed via "고급 → 이동" (Advanced → Go to).
- **Turn on every scope checkbox, one by one** — continuing unchecked brings up
  "액세스를 허용하지 않음" (access not granted) and issues a scope-less code.
  Required scopes:

  | Scope | What it opens | When |
  |---|---|---|
  | `youtube.upload` | video upload | publish (required) |
  | `youtube.force-ssl` | caption upload + comment reads/replies | publish (required) · growth |
  | `youtube.readonly` | channel/video reads | growth |
  | `yt-analytics.readonly` | period metrics (views, watch time, subscriber change) | growth |
  | `yt-analytics-monetary.readonly` | revenue metrics | optional |

  If `force-ssl` is missing, **the video uploads but only the captions fail**
  (this pipeline uploads captions separately via `captions.insert`). The first
  two are enough if you'll only publish, but growing scopes later means
  reissuing, so turning them all on from the start is recommended.

## Save · verify · record

1. Save `{"client_id","client_secret","refresh_token"}` to
   `<SNS_TOKEN_DIR>/<slug>/youtube-oauth-client.json`, `chmod 600`. **Never
   expose the values.**
2. `sns_account_check(channel=<slug>)` → youtube ok, confirm channel name and
   channel ID. At this point, **re-confirm the channel ID is the setup target**
   (not another brand channel's token).
3. Update the YouTube row of `data/<slug>/profile.md` §8 (channel name, channel
   ID, issue date, scopes, status "✅ API connected").
4. One-line report + next step (`/social-flow:grow-youtube <channel> init`).

## status — current-state report

Summarize integration state only, from token presence + `sns_account_check`. If
unfinished, point out where it stopped — especially whether it's **waiting on
identity-verification approval**. While waiting, suggest checking Gmail only;
don't push for or prompt a resubmission. No publishing, no changes.

## Manual fallback (no browser lane)

The user does identity verification, channel creation, and branding directly,
and this skill helps with **token issuance only**: start the loopback listener
and build the authorize URL for the user → the user consents in their browser as
the target channel (all scopes checked) → the listener receives the code and
playbook §4 exchanges it for the `refresh_token`. The absolute rules (production
stage, active channel, no token exposure) still apply.

## Additional Resources

- **`references/setup-playbook.md`** — ego driving principles, field-tested
  identity verification & channel creation, loopback listener + OAuth code
  exchange & refresh_token issuance sections.
