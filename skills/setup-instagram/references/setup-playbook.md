# Instagram setup playbook — field-tested recipes

Holds how each step in SKILL.md is actually driven. On Meta-family sites
(instagram.com · developers.facebook.com), ego's convenience helpers hang forever
in many places, so things only move reliably **with low-level CDP calls**.

## Contents

- [Browser lane and driving principles](#browser-lane-and-driving-principles)
- [Step 1 · Account signup](#step-1-account-signup)
- [Step 2 · Professional conversion + branding](#step-2-professional-conversion-branding)
- [Step 3 · App tester (Instagram Login) + invite acceptance](#step-3-app-tester-instagram-login-invite-acceptance)
- [Step 4 · OAuth authorize (code recovery)](#step-4-oauth-authorize-code-recovery)
- [Step 5 · Token exchange (browser-independent — curl)](#step-5-token-exchange-browser-independent-curl)
- [60-day refresh (not reissuance)](#60-day-refresh-not-reissuance)

## Browser lane and driving principles

There is one lane — ego lite (SKILL.md §Browser lane). Every per-step recipe
below is written against it. Without ego lite, stop and tell the user; SKILL.md
§Manual fallback covers what is left.

### Driving ego lite

First load `~/.claude/skills/ego-browser/SKILL.md` to check CLI usage.
Invoke via an `ego-browser nodejs <<'EOF' ... EOF` heredoc.

- **State resets with every heredoc** → on the first line of every heredoc,
  `await useOrCreateTaskSpace('<session-unique name>')` (only the return from a
  handoff uses `takeOverTaskSpace(id)`). A unique name per session.
- **CDP only**: navigate with `cdp('Page.navigate',{url})`, read with
  `cdp('Runtime.evaluate', {expression,returnByValue:true})`, **click with
  trusted input** `cdp('Input.dispatchMouseEvent',
  {type:'mousePressed',x,y,button:'left',clickCount:1,buttons:1})` +
  `mouseReleased`. React ignores events that aren't isTrusted. Popup/redirect
  tabs: `cdp('Target.getTargets',{})` → `switchTab(full targetId)`.
- Before clicking, check for covering elements with
  `document.elementFromPoint(x,y)`. Screen sharing is `handOffTaskSpace(id)`
  (agent tabs are invisible in the GUI).

## Step 1 · Account signup

1. If another brand's account is logged into the web before signup, a logout is
   needed — log out **only after user approval + confirming recovery
   credentials** (absolute rule 3).
2. `Page.navigate` to `https://www.instagram.com/accounts/emailsignup/` → fill
   email, name, handle, and password with `Runtime.evaluate` (save the password
   to `<slug>/instagram.credentials` first). IG handle autocomplete has a glitch
   where the chip attaches twice, so verify the value after entry.
3. **Submit, birthdate, and the email code are user handoffs.** reCAPTCHA may
   appear. With the user's permission, find the code in Gmail and pass it along,
   but confirm before the final entry.
4. After signup, confirm this is the account being set up.

## Step 2 · Professional conversion + branding

- **Professional conversion**: Settings > Account type and tools > Switch to
  professional account → business or creator. The API is a surer check than the
  web UI:
  `GET https://graph.instagram.com/v23.0/me?fields=account_type&access_token=...`
  → `BUSINESS` or `MEDIA_CREATOR` means professional. The mere fact that the
  token works already proves professional (a personal account can't integrate at
  all).
- **Profile photo**: upload the `/social-flow:branding` logo asset. IG→Threads
  carries over automatically.
- **bio · name · category**: channel copy from profile.md. Confirm the account
  is public.

## Step 3 · App tester (Instagram Login) + invite acceptance

**Key**: the IG publishing token is issued via "Instagram API with Instagram
Login" (business login). Even though the "IG 테스터" (IG tester) radio's
description on the app roles page says "Instagram Basic Display API"
(deprecated), that's bait — actual issuance goes through the instagram.com OAuth
path.

1. **Add the IG tester** — under App > Roles > add people, add this account as
   an IG tester. The roles dialog's radios (IG/Threads tester) are mutually
   exclusive plus re-render and shift coordinates → grab the radio by ref and
   click, and click the add button after confirming it's active (not
   aria-disabled).
2. **Accept the invite** — accept on IG web:
   `https://www.instagram.com/accounts/manage_access/` → **tester invites tab**,
   accept with a **trusted click** (synthetic events won't work).

## Step 4 · OAuth authorize (code recovery)

1. Read the App ID from the app env and build the authorize URL (scope
   comma-separated, one line):
   ```
   https://www.instagram.com/oauth/authorize?client_id=<IG_APP_ID>
     &redirect_uri=https://localhost/callback/
     &scope=instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_messages,instagram_business_manage_insights
     &response_type=code
   ```
   Open with `Page.navigate`.
2. If `force_reauth` brings up the login form, fill the username and password but
   **hand the login button to the user** (an automated click hits the
   "연결할 수 없습니다" (can't connect) soft-block).
3. **Trusted-click "허용" (allow)** on the consent screen.
4. It redirects to `https://localhost/callback/?code=...`. With no server it's an
   error page, but the code is in the URL — recover it via
   `Target.getTargets`/`Page.getNavigationHistory`. Strip the trailing `#_`.
5. The code is single-use and short-lived → §5 the moment you have it.

## Step 5 · Token exchange (browser-independent — curl)

This section has nothing to do with the browser. **The 60-day refresh also
reuses only this section.**

```bash
source <SNS_TOKEN_DIR>/<slug>/meta-app.env   # IG_APP_ID, IG_APP_SECRET
CODE='<code recovered in step 4>'
DEST=<SNS_TOKEN_DIR>/<slug>/instagram_token

SHORT_JSON=$(curl -s -X POST https://api.instagram.com/oauth/access_token \
  -F client_id="$IG_APP_ID" -F client_secret="$IG_APP_SECRET" \
  -F grant_type=authorization_code -F redirect_uri="https://localhost/callback/" \
  -F code="$CODE")
ST=$(echo "$SHORT_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
# note: take the user id as IGUSER or similar. UID is a shell reserved variable (trap below).
IGUSER=$(echo "$SHORT_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("user_id",""))')

curl -s "https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=$IG_APP_SECRET&access_token=$ST" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))' > "$DEST"
chmod 600 "$DEST"
```

- **Shell reserved-variable trap (important)**: in bash/zsh, `UID` is a
  read-only reserved variable. Put the user id in `UID=$(...)` and the script
  dies with "failed to change user ID: operation not permitted". In a `set -e`
  script it bails before the token is saved and **the short-lived code is
  burned** (one real incident). Always use a different name like `IGUSER` or
  `ACCT`.
- Don't `echo` the token value — redirect it straight to the file. A short-lived
  token of 214 chars, a long-lived one of about 158 chars, and `expires_in`
  5184000 (60 days) means it worked.

## 60-day refresh (not reissuance)

To refresh only the token before expiry, skip §1–§4 and run just this:

```bash
DEST=<SNS_TOKEN_DIR>/<slug>/instagram_token
curl -s "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=$(cat "$DEST")" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))' > "$DEST.new" \
  && mv "$DEST.new" "$DEST" && chmod 600 "$DEST"
```

A refresh can't grow scopes — adding scopes means reissuing via §3–§5. Past the
60-day expiry no refresh is possible; start over from §3.
