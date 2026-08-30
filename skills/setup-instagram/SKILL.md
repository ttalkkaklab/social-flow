---
name: setup-instagram
description: >
  Opens a live Instagram professional account and wires its token into social-flow. Use
  when the user asks to "인스타 채널 개설", "인스타그램 계정 만들어", "인스타 API 연동해줘", "릴스 붙여줘", "set up an
  Instagram channel/account". Drives signup, professional conversion, profile branding,
  Meta app tester setup (Instagram API with Instagram Login, not Basic Display) and OAuth
  token issuance in the browser through ego lite, handing the screen to the user for
  login, verification codes and consent, then saves the 60-day token under
  SNS_TOKEN_DIR/[slug]/instagram_token and verifies it with sns_account_check. Resumable —
  it detects what is already done and continues from the first unfinished step.
argument-hint: "<channel> [status|signup|brand|token]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "mcp__social-flow__sns_account_check"]
---

# Instagram channel setup — browser HITL

This skill attaches **a live Instagram account** to one channel (brand). It
drives account signup, professional conversion, profile branding, Meta app tester
setup, and OAuth token issuance through the browser, but **hands over only the
points that need human hands**. When it's done, a 60-day long-lived token sits at
`<SNS_TOKEN_DIR>/<slug>/instagram_token` and you can publish reels with
`channel: "<slug>"`.

Setup skills are split per platform — the `setup-<platform>` family, parallel to
the growth skills (`grow-<platform>`). It shares a Meta app with Threads but
**the issuance path differs** — IG uses "Instagram API with Instagram Login"
(business login), not the "Basic Display API" (§token trap).

## What runs automatically, what gets handed over

Form filling, page navigation, and consent clicks run automatically through the
browser. The following get soft-blocked under automation, so **hand them to the
user**:

- **Clicking the login button** — an automated click triggers the
  "Instagram에 연결할 수 없습니다" (can't connect to Instagram) soft-block. Fill
  in the username and password, and the user presses only the button.
- **Verification codes · reCAPTCHA · birthdate** — human gates. A reCAPTCHA
  challenge appears when web login is automated.

Hand the screen over with `handOffTaskSpace`, confirm the user is done, then
reclaim it with `takeOverTaskSpace`. An agent task space is invisible in the GUI
until that handoff, so skipping it leaves the user pressing nothing.

## Prerequisites

- `data/<slug>/profile.md` must exist — if not, point to `/social-flow:channel add`
  and stop.
- **ego lite** — the browser lane. Details: §Browser lane below.
- A Meta developer app (Instagram product). Keep the App ID/Secret in the channel
  directory's app env file.
- **Professional account required** — a personal account can't integrate with the
  Graph API at all. Convert to business/creator during setup. Account type can't
  be changed via API — it's app/web UI only.

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
CAPTCHAs get pressed by the user. Meta's soft-blocks fired even on ego's trusted
clicks, so plan for the handoff rather than around it.

**Another brand's IG session may already be alive in the task space.** Before
logging anyone out, follow absolute rule 3 as written: get the user's approval
first.

## Absolute rules (stop immediately on violation)

1. **Never expose token values** — no tokens, secrets, or passwords in plain text
   on screen, in logs, or in commits. File only, `chmod 600`.
2. **Store only in the channel directory** — the token goes to
   `<SNS_TOKEN_DIR>/<slug>/instagram_token`. The signup password goes in the same
   directory as the `instagram.credentials` convention file.
3. **Protect shared accounts** — **another brand's account may be logged into**
   the same browser's web IG session. If signup/login pushed that session out,
   agree on recovery with the user, and don't touch another brand's profile,
   settings, or content. Before every step, confirm via `/me` (account_type
   lookup) and on screen that the current account is the one being set up.
4. **Exchange the short-lived code immediately** — the authorization code is
   single-use and short-lived. Exchange the moment you recover it. If a failure
   burns it, re-navigate to authorize (with login intact, just re-confirm
   consent) for a fresh code.
5. **Hand over the human gates** — don't punch through the login button,
   verification codes, or CAPTCHAs with automated clicks.

## State detection & resume (default invocation)

The default invocation determines the current state and resumes from the first
unfinished step:

1. If `<SNS_TOKEN_DIR>/<slug>/instagram_token` exists → verify with
   `sns_account_check(channel)`. If ok, **done** — report a summary of account
   and scopes, then stop.
2. No token but the account exists → start from §3 app & token.
3. No account either → start from §1 signup.

Subcommands: `signup` · `brand` · `token` · `status`.

## Step 1 · Account signup (signup)

Fill the `instagram.com` signup form with ego — email, name, handle, password
(save the password to the `<slug>/instagram.credentials` convention file first).
**Login/submit, birthdate, and the email code are user handoffs**. reCAPTCHA may
appear. Details in `references/setup-playbook.md` §1.

- **Watch for an existing web session**: if another brand's account is logged in
  before signup, a logout is needed — get the user's approval before logging out,
  and confirm the recovery path (that account's credentials) first (absolute
  rule 3).

## Step 2 · Professional conversion + branding (brand)

- **Professional conversion** — switch to business/creator in settings. Without
  this, the §3 token is pointless (a personal account can't integrate with the
  API).
- **Profile photo** — upload the `/social-flow:branding <channel>` output (the
  logo). This skill doesn't make assets, it only applies them. The IG profile
  photo carries over to Threads automatically.
- **bio · name · category** — fill with the channel copy from profile.md.
  Confirm the account is public.

## Step 3 · App tester + OAuth token (token)

**The IG publishing token is issued via "Instagram API with Instagram Login"** —
even though the "IG 테스터" (IG tester) radio's description under app roles says
"Instagram Basic Display API" (deprecated 2024-12-04), don't take that bait.
Issuance goes through instagram.com OAuth. Treat `references/setup-playbook.md`
§3–§5 as the source of truth. The gist:

- **Add & accept the IG tester** — add this account as an IG tester under app
  roles, and accept the invite via **IG web accounts/manage_access → tester
  invites tab with a trusted click**.
- **OAuth authorize** — open `instagram.com/oauth/authorize` directly in a task
  space tab and request the 5 scopes comma-separated. With `force_reauth`, fill
  the login form but **hand the login button to the user** (automated clicks get
  soft-blocked) → trusted-click "허용" (allow) on the consent screen → recover
  the code from the `https://localhost/callback/` redirect URL.
- **Token exchange** — playbook §5 (browser-independent, curl).
  api.instagram.com short-lived → graph.instagram.com 60-day long-lived.
  **Watch the shell `UID` reserved-variable trap** (§5).

The 5 scopes: `instagram_business_basic` · `instagram_business_content_publish` ·
`instagram_business_manage_comments` · `instagram_business_manage_messages` ·
`instagram_business_manage_insights`. The last one is for grow-instagram (the
growth loop).

## Save · verify · record

1. Save the long-lived token to `<SNS_TOKEN_DIR>/<slug>/instagram_token`,
   `chmod 600`. **Never expose the value.**
2. `sns_account_check(channel=<slug>)` → instagram ok, confirm username and
   ig_user_id.
3. Update the Instagram row of `data/<slug>/profile.md` §8 (handle, ig_user_id,
   issue date, scope count, status "✅ API connected").
4. One-line report + next step (`/social-flow:grow-instagram <channel> init`).
   Also point out that reels publishing needs **public HTTPS hosting** (IG can't
   take local file uploads).

## status — current-state report

Summarize integration state only, from token presence + `sns_account_check` +
account_type. Point out unfinished steps and human gates. No publishing, no
changes.

## Manual fallback (no browser lane)

The user does signup, conversion, and branding directly, and this skill helps
with token issuance only: build the authorize URL and hand it over → after
consenting, the user pastes the full redirected `localhost/callback/?code=...`
URL → extract the code and exchange via playbook §5. The absolute rules still
apply.

## Additional Resources

- **`references/setup-playbook.md`** — ego CDP driving principles, field-tested
  per-step recipes, standalone token exchange & 60-day refresh sections.
