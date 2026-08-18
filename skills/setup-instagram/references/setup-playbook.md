# Instagram setup playbook — field-tested recipes

Holds how each step in SKILL.md is actually driven. On Meta-family sites
(instagram.com · developers.facebook.com), ego's convenience helpers hang forever
in many places, so things only move reliably **with low-level CDP calls**.

## Browser lanes and driving principles

There are two lanes — ego lite first, claude-in-chrome when it's absent
(SKILL.md §Browser lanes). The per-step recipes below are written against the
ego lane, but the skeleton of the driving is standard CDP, so it carries over to
the Chrome lane almost as-is.

### ego lite lane (default)

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

### Chrome lane (claude-in-chrome)

Map the CDP calls above like this. Tool names may carry different prefixes
depending on how they're loaded, so confirm the actual names with `/mcp` first.

| ego lane | Chrome lane |
|---|---|
| `cdp('Page.navigate',{url})` | `navigate` |
| `cdp('Runtime.evaluate',{expression,returnByValue:true})` | `javascript_tool` — both DOM reads and value entry |
| `cdp('Input.dispatchMouseEvent', …)` trusted click | `computer` |
| `cdp('Target.getTargets',{})` → `switchTab(targetId)` | tab tools — get the list with `tabs_context_mcp` and switch |
| `useOrCreateTaskSpace` isolation | none — occupies the user's browser while working |
| `handOffTaskSpace`/`takeOverTaskSpace` | not needed — the screen is already the user's, so just confirm completion |

At session start, check the current tabs first with `tabs_context_mcp`, and work
in a new tab. Don't take over tabs the user left open. Another brand's IG session
may be alive, so the logout decision follows SKILL.md absolute rule 3.

**This lane is untested on Meta sites.** Where things hang and which coordinates
grab containers was learned by running into them on the ego lane. On the first
run, re-verify those points and write them into this document. In particular,
whether `computer`'s click passes React's trusted-event check (the tester-invite
tab switch, the consent screen's "허용" (allow)) has never been tried — a point
to watch on the first run.

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
