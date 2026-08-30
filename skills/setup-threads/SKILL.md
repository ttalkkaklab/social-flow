---
name: setup-threads
description: >
  Opens a live Threads account and wires its API token into social-flow. Use when the user
  asks to "스레드 채널 개설", "스레드 계정 만들어", "스레드 API 연동해줘", "스레드 붙여줘", "set up a Threads
  channel/account". Drives signup, profile branding, Meta app tester and permission setup,
  and OAuth token issuance in the browser through ego lite, handing the screen to the user
  for login, verification codes and consent, then saves the 60-day token under
  SNS_TOKEN_DIR/[slug]/threads_token and verifies it with sns_account_check. Resumable —
  it detects what is already done and continues from the first unfinished step.
argument-hint: "<channel> [status|signup|brand|token]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "mcp__social-flow__sns_account_check"]
---

# Threads channel setup — browser HITL

This skill attaches **a live Threads account** to one channel (brand). It drives
account signup, profile branding, Meta app permission setup, and OAuth token
issuance through the browser, but **hands over only the points that need human
hands** (login click · verification code · birthdate · consent screen). When it's
done, a 60-day long-lived token sits at `<SNS_TOKEN_DIR>/<slug>/threads_token`
and you can publish with `channel: "<slug>"`.

Setup skills are **split per platform** — the signup flow, app console, and token
exchange differ completely between platforms. Threads and Instagram share a Meta
app but differ in tester path and scopes, and YouTube is on the Google side,
different altogether. This is the `setup-<platform>` family, parallel to the
growth skills (`grow-<platform>`).

## What runs automatically, what gets handed over

Form filling, page navigation, and consent clicks run automatically through the
browser. The following **must be handed to the user because automation gets
soft-blocked** — don't try to punch through with automated clicks:

- **Clicking the login button** — an automated click triggers the
  "연결할 수 없습니다" (can't connect) soft-block. Fill in the username and
  password, then have the user press only the login button.
- **Entering verification codes** — email/SMS codes. With the user's permission
  you can read Gmail to find the code, but confirm before the final entry and
  submit.
- **Birthdate · CAPTCHA · 2FA** — gates that need human judgment.

Hand the screen over with `handOffTaskSpace`, confirm the user is done, then
reclaim it with `takeOverTaskSpace`. An agent task space is invisible in the GUI
until that handoff, so skipping it leaves the user pressing nothing.

## Prerequisites

- `data/<slug>/profile.md` must exist — if not, point to `/social-flow:channel add`
  first and stop. Handle and brand tone are inherited from there.
- **ego lite** — the browser lane. It doesn't ship with this plugin; it's a tool
  of the user's machine. Details: §Browser lane below.
- A Meta developer app (with Threads API enabled). One app can be shared by
  multiple channels. Keep the App ID/Secret in the channel directory's app env
  file and source it at token-exchange time.

## Browser lane — ego lite only

`ego lite` is the one browser lane. Check for it with `command -v ego-browser`.
It reuses the user's login state inside an agent-only task space, so it never
collides with the user's own tabs, and every field-tested recipe below is written
against it (`references/setup-playbook.md`).

**There is no second lane.** ego lite runs on macOS only. Where it is missing —
Windows, Linux, a machine without it installed — say so and stop. Don't reach for
another browser tool. What still works without a browser is §Manual fallback
below (token issuance only).

**The human gates stay the same** — the login button, verification codes, and
consent checks get pressed by the user. Meta's soft-blocks fired even on ego's
trusted clicks, so plan for the handoff rather than around it.

## Absolute rules (stop immediately on violation)

1. **Never expose token values** — no tokens, secrets, or passwords in plain text
   on screen, in logs, or in commits. Save to file only, `chmod 600`. Don't
   record API responses wholesale.
2. **Store only in the channel directory** — the token goes to
   `<SNS_TOKEN_DIR>/<slug>/threads_token` (default `~/.config/social-flow/<slug>/`).
   The signup password goes in the same directory as the `threads.credentials`
   convention file (a never-commit path).
3. **Protect shared accounts** — **another brand's channel may be alive** in the
   same browser or the same Meta/Google account. Before every step, verify on
   screen and via `/me` that the account you're touching is the one being set up,
   and never touch another brand's profile, settings, or content. If a
   logout/re-login pushed out someone else's web session, agree on recovery with
   the user.
4. **Exchange the short-lived code immediately** — the OAuth authorization code
   is single-use and short-lived. The moment you recover it, move straight to
   token exchange. If a failure burns the code, re-navigate to authorize for a
   fresh one (with login intact, re-confirming consent issues it immediately).
5. **Hand over the human gates** — don't punch through the points listed under
   "what gets handed over" with automated clicks.

## State detection & resume (default invocation)

Setup may not finish in one sitting — human steps like waiting for a verification
code or accepting a tester invite get in the way. So **the default invocation
first determines the current state and resumes from the first unfinished step**:

1. If `<SNS_TOKEN_DIR>/<slug>/threads_token` exists → verify with
   `sns_account_check(channel)`. If ok, **already done** — report a summary of
   account and scopes, then stop.
2. No token but the account seems to exist (user confirms) → start from §3 app &
   token.
3. No account either → start from §1 account signup.

Subcommands can target a specific step: `signup` (account signup) · `brand`
(profile branding) · `token` (app permissions + OAuth token). `status` reports
current state only.

## Step 1 · Account signup (signup)

A Threads account is tied to an Instagram account. If an IG account with the same
handle already exists, logging into Threads with that account completes signup
(profile photo and name carry over). If there's no IG account, point to
`/social-flow:setup-instagram <channel>` first.

Follow `references/setup-playbook.md` §1 for the procedure and the ego CDP
recipe. The core: go to threads.net → log in with the IG account (the login
button is a user handoff) → confirm the account is public. Verify on screen that
this is the account being set up before proceeding (absolute rule 3).

## Step 2 · Profile branding (brand)

The profile image **asset itself is made by `/social-flow:branding <channel>`** —
don't rerun the convergence loop here. This step only **applies** the finished
assets to the live account: upload the profile photo (IG→Threads carries over
automatically), set the bio (channel copy from profile.md), confirm the account
is public. The web bio save is a two-step dialog and the final Done button is
easy to miss — follow the save-verification procedure in playbook §2.

## Step 3 · App permissions + OAuth token (token)

Add this account as a tester in the Meta app, turn on the scopes, then get the
token via OAuth. This step is the body of the setup and the traps cluster here —
treat `references/setup-playbook.md` §3–§5 as the source of truth and follow it
as written. The gist:

- **Accept the tester invite** — add this account as a Threads tester under app
  roles, and accept the invite with **trusted input** on the invites tab of
  website permissions in Threads web settings (synthetic events can't switch the
  tab).
- **Add use-case permissions** — in the console, "추가" (add) content_publish ·
  manage_replies · manage_insights. Even if the first attempt fails with
  "문제가 발생했습니다" (something went wrong), retrying makes it stick.
  In development mode keyword_search only finds your own account's posts (normal).
- **OAuth authorize** — open `threads.net/oauth/authorize` directly in a task
  space tab, request the 5 scopes comma-separated → consent → recover the code
  from the localhost redirect URL. There's a trap where the "액세스 권한 수정"
  (edit access) modal keeps **covering** the continue button (close it with the
  X and proceed). The console's "토큰 생성기" (token generator) button doesn't
  show a token, so don't use it.
- **Token exchange** — playbook §5 (browser-independent, curl). Short-lived →
  60-day long-lived.

The 5 scopes: `threads_basic` · `threads_content_publish` · `threads_manage_replies`
· `threads_manage_insights` · `threads_keyword_search`. The last two are for
grow-threads (the growth loop) — the first three are enough if you'll only
publish, but growing scopes later means reissuing the token, so turning on all 5
from the start is recommended.

## Save · verify · record

1. Save the long-lived token to `<SNS_TOKEN_DIR>/<slug>/threads_token` and
   `chmod 600`. **Never print the value.**
2. `sns_account_check(channel=<slug>)` → confirm threads ok plus the account
   username and id.
3. Update the Threads row of the `data/<slug>/profile.md` §8 (SNS accounts)
   table — account handle, user_id, issue date, scope count. Set the status to
   "✅ API connected".
4. One-line report: account, scopes, next step
   (`/social-flow:grow-threads <channel> init`).

## status — current-state report

Summarize integration state only, from token-file presence +
`sns_account_check(channel)`. If unfinished, point out which steps remain and
where human hands are needed. No publishing, no changes.

## Manual fallback (no browser lane)

With no usable lane, the user does signup and branding directly in their browser,
and this skill helps with **token issuance only**: build the authorize URL and
hand it to the user → after consenting in the browser address bar, the user
pastes the full redirected `https://localhost/callback/?code=...` URL → extract
the code and exchange via playbook §5. The absolute rules (no token exposure,
channel-directory storage) apply on this path too.

## Additional Resources

- **`references/setup-playbook.md`** — ego CDP driving principles, field-tested
  per-step recipes, standalone token exchange & 60-day refresh sections.
