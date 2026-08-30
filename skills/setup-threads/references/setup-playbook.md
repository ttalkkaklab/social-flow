# Threads setup playbook — field-tested recipes

This document holds how each step in SKILL.md is actually driven. On Meta-family
sites (threads.com · threads.net · developers.facebook.com), ego's convenience
helpers get stuck in internal waits and hang forever in many places, so things
only move reliably **with low-level CDP calls**. Below are the field-tested
recipes.

## Browser lane and driving principles

There is one lane — ego lite (SKILL.md §Browser lane). Every per-step recipe
below is written against it. Without ego lite, stop and tell the user; SKILL.md
§Manual fallback covers what is left.

### Driving ego lite

First load `~/.claude/skills/ego-browser/SKILL.md` (the ego skill on the user's
machine) to check CLI usage. Invoke via `Bash` with an
`ego-browser nodejs <<'EOF' ... EOF` heredoc.

- **State resets with every heredoc.** Re-claim the task space on the first line
  of every heredoc: `await useOrCreateTaskSpace('<session-unique name>')` (only
  the return from a handoff uses `takeOverTaskSpace(id)`). A duplicated name
  shares tabs with another session, so use a name unique to each session.
- **Meta sites are CDP-only.** `click` · `js` · `gotoAndWait` · `snapshotText`
  hang easily. Instead:
  - Page navigation: `cdp('Page.navigate', {url})`
  - Reading values / DOM queries: `cdp('Runtime.evaluate', {expression, returnByValue:true})`
  - **Click with trusted input**: `cdp('Input.dispatchMouseEvent', {type:'mousePressed', x, y, button:'left', clickCount:1, buttons:1})` followed immediately by `mouseReleased`.
    React ignores tab switches and consent clicks unless the event is trusted
    (isTrusted).
  - Finding popup/redirect tabs: `cdp('Target.getTargets', {})` → `switchTab(full targetId)`.
- **Check for covering elements before clicking**: use
  `document.elementFromPoint(x, y)` to see the actual topmost element at those
  coordinates. If a modal covers it, a different element comes back. If the
  `getBoundingClientRect` width is 490px or more, you may have grabbed a
  container instead of the button (beware false positives).
- When screen sharing is needed (human gates): `handOffTaskSpace(id)` → user
  confirms → `takeOverTaskSpace(id)`. Agent task space tabs are invisible in the
  GUI.

## Step 1 · Account signup

Threads logs in with an Instagram account.

1. Does an IG account with the same handle already exist? If so, this step is
   just logging in. If not, finish `/social-flow:setup-instagram <channel>` first
   and come back.
2. `Page.navigate` to `https://www.threads.net/login` → fill the IG username and
   password into the input fields with `Runtime.evaluate` (read the password
   from `<slug>/threads.credentials`).
3. **Hand the login button to the user** — an automated click hits the
   "연결할 수 없습니다" (can't connect) soft-block. `handOffTaskSpace`, then the
   user presses it.
4. After login, confirm on screen that the profile is the account being set up
   (absolute rule 3). Also check that the account is public.

## Step 2 · Profile branding

Profile image assets come from `/social-flow:branding` output (not generated
here).

- **Profile photo**: the profile photo set on IG carries over to Threads
  automatically. If you branded IG first, Threads only needs a carry-over check.
- **bio**: fill with the channel copy from profile.md. **The web save is
  two-step** — Done at the top of the "소개 수정" (edit bio) dialog → Done at
  the bottom of profile edit. Automated clicks often fall out of that order and
  the save silently fails, so either have the user press the final Done, or
  refresh after saving and confirm the bio actually took.
- **Visibility**: a private account blocks reach — keep it public.

## Step 3 · Meta app prep (tester + use-case permissions)

The app lives at `developers.facebook.com`. Add this account as a tester and turn
on the scopes.

1. **Confirm the app-owning account** — the Meta app may be owned by a **FB
   developer account**, not the SNS account being set up. You must log into the
   console with that account for the app to appear. With the wrong account you'll
   only see other apps (beware misreading).
2. **Add the tester** — under App > Roles (or Use cases > Threads > Settings),
   add this account as a **Threads tester**. The "사람 추가" (add people) dialog
   on the roles page has mutually exclusive radios (IG tester / Threads tester)
   plus re-renders that shift coordinates → grab the radio by ref and click it,
   and click the add button via DOM after confirming it's active (not
   `aria-disabled`).
3. **Accept the invite** — after adding, the account side must accept the invite
   before "대기 중" (pending) clears. Accept it in Threads web settings >
   Website permissions > **Invites tab**. The tab switch only takes with
   **trusted input** (Input.dispatchMouseEvent).
4. **Add use-case permissions** — under console Use cases > Threads API access >
   Permissions, "추가" (add)
   `threads_content_publish` · `threads_manage_replies` · `threads_manage_insights`.
   Only `threads_basic` is on by default. **Even if the first "추가" (add) click
   fails with "문제가 발생했습니다" (something went wrong), retrying after 30
   seconds makes it stick.**
   `threads_keyword_search` needs its own "추가" (add), and in development mode
   it only searches **your own account's posts** (public search needs App Review
   advanced access — zero results for others' posts is normal).

## Step 4 · OAuth authorize (code recovery)

The console's "사용자 토큰 생성기" (user token generator) popup just bounces
back to the console and never displays a token. Don't use it — open **standard
OAuth authorize directly in a task space tab**.

1. Read the App ID from the app env file and build the authorize URL:
   ```
   https://threads.net/oauth/authorize?client_id=<THREADS_APP_ID>
     &redirect_uri=https://localhost/callback/
     &scope=threads_basic,threads_content_publish,threads_manage_replies,threads_manage_insights,threads_keyword_search
     &response_type=code
   ```
   (scope is comma-separated, on one line.) Open with `Page.navigate`.
2. On the consent screen, **trusted-click** "<계정>으로 계속" (continue as
   <account>). There are no individual checkboxes; everything is requested via
   the scope parameter. **Trap: the "액세스 권한 수정" (edit access) modal keeps
   covering the continue button** — confirm with `elementFromPoint`, close the
   modal with its X, then press continue.
3. It redirects to localhost. With no server, a chrome-error shows, but **the
   code is in the URL** — recover it from `localhost/callback?code=...` via
   `Target.getTargets` or a `Page.getNavigationHistory` entry. Strip fragments
   like `#_`.
4. The code is single-use and short-lived. Move to §5 the moment you recover it.

## Step 5 · Token exchange (browser-independent — curl)

This section has nothing to do with the browser. **The 60-day refresh also
reuses only this section.** Source the app env file (App ID/Secret) and exchange
short-lived → long-lived with curl.

```bash
source <SNS_TOKEN_DIR>/<slug>/meta-app.env   # THREADS_APP_ID, THREADS_APP_SECRET
CODE='<code recovered in step 4>'
DEST=<SNS_TOKEN_DIR>/<slug>/threads_token

SHORT=$(curl -s -X POST https://graph.threads.net/oauth/access_token \
  -F client_id="$THREADS_APP_ID" -F client_secret="$THREADS_APP_SECRET" \
  -F grant_type=authorization_code -F redirect_uri="https://localhost/callback/" \
  -F code="$CODE" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')

curl -s "https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=$THREADS_APP_SECRET&access_token=$SHORT" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))' \
  > "$DEST"
chmod 600 "$DEST"
```

- **Shell reserved-variable trap**: in bash/zsh, `UID` is a read-only reserved
  variable. Use it as a script variable and the script dies with "failed to
  change user ID"; under `set -e` it bails before saving and the code is burned.
  When holding a user id or similar, use a different name like `IGUSER` or `ACCT`.
- Don't `echo` the token value — redirect it straight to the file.

## 60-day refresh (not reissuance)

To refresh only the token before expiry (24+ hours after issuance), skip §1–§4
and run just this:

```bash
DEST=<SNS_TOKEN_DIR>/<slug>/threads_token
curl -s "https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=$(cat "$DEST")" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))' > "$DEST.new" \
  && mv "$DEST.new" "$DEST" && chmod 600 "$DEST"
```

A refresh can't grow scopes — to add scopes, reissue via §3–§5.
Past 60 days the token expires and can't be refreshed either; start over from §3.
