# YouTube setup playbook — field-tested recipes

Holds how each step in SKILL.md is actually driven. The Google console doesn't
hang the helpers as badly as Meta, but **grabbing the wrong active channel
contaminates someone else's brand channel**, so the channel check at every step
comes first.

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
- Navigate with `cdp('Page.navigate',{url})`, read with
  `cdp('Runtime.evaluate',{expression, returnByValue:true})`, click with trusted
  input `cdp('Input.dispatchMouseEvent', ...)`.
  Screen sharing (human gates) is `handOffTaskSpace(id)`.
- **Watch ego lite's Google session profile** — first check which brand channels
  this browser's Google session can see. If a brand other than the setup target
  is active, switch with the channel switcher and re-confirm via the URL's
  channel ID before proceeding.

## Step 1 · Advanced-features identity verification

- Entry: `https://www.youtube.com/verify` or Studio > Settings > Channel >
  Feature eligibility > Advanced features.
- **Phone verification**: the user enters the SMS code (handoff).
- **6-second selfie video**: the user scans the on-screen QR with their phone,
  records, and submits. Humans only.
- After submission, **approval is asynchronous** (hours to days). From then on,
  treat this step as waiting and check approval **only through Gmail (the
  approval email) or the account-level page**. Don't open another brand
  channel's Studio to check.

## Step 2 · Brand channel creation + branding (after approval)

1. `https://www.youtube.com/account` > create a channel > **new channel with a
   brand account**. The channel name is the profile.md brand name.
2. **Confirm the active channel right after creation** — check that the URL's
   channel ID (`/channel/UC...`) is the channel just created. Every action from
   here on happens only on this channel.
3. Branding: in Studio Customization > Branding, upload the profile photo and
   banner (assets are the `/social-flow:branding` output `profile-1024` ·
   `banner-youtube-2048x1152`). Set the description and links on the basic info
   tab.

## Step 3 · OAuth authorize + loopback listener (code recovery)

Unlike Meta's localhost/callback trick, Google OAuth **receives the code on a
loopback port**. Start a small listener in the scratchpad.

1. **Confirm the consent screen is in production** — first check in the GCP
   console that the OAuth consent screen is "프로덕션" (production). If it's
   "테스트 중" (testing), issued tokens expire in 7 days. Publish to production
   (may need user confirmation), then proceed.
2. Start the listener (e.g. port 8391):
   ```python
   # scratchpad/oauth-listener.py — receives the code, prints it, exits
   import http.server, urllib.parse, sys
   class H(http.server.BaseHTTPRequestHandler):
       def do_GET(self):
           q = urllib.parse.urlparse(self.path).query
           code = urllib.parse.parse_qs(q).get('code', [''])[0]
           self.send_response(200); self.end_headers()
           self.wfile.write(b'ok - you can close this tab')
           if code: print(code); sys.exit(0)
       def log_message(self, *a): pass
   http.server.HTTPServer(('127.0.0.1', 8391), H).serve_forever()
   ```
3. The authorize URL (scope separated by spaces → `%20` or `+`, one line):
   ```
   https://accounts.google.com/o/oauth2/v2/auth?client_id=<CLIENT_ID>
     &redirect_uri=http://localhost:8391
     &response_type=code&access_type=offline&prompt=consent
     &scope=https://www.googleapis.com/auth/youtube.upload%20https://www.googleapis.com/auth/youtube.force-ssl%20https://www.googleapis.com/auth/youtube.readonly%20https://www.googleapis.com/auth/yt-analytics.readonly
   ```
   Only `access_type=offline` + `prompt=consent` yields a `refresh_token`.
   Open with `Page.navigate`.
4. Login and 2FA are user handoffs. **In the account/channel picker, choose the
   brand channel being set up.** For the unverified-app warning, "고급 → 이동"
   (Advanced → Go to).
5. **Turn on every scope checkbox, one by one** — continuing unchecked brings up
   the "액세스를 허용하지 않음" (access not granted) dialog and issues a
   scope-less code.
6. On consent, the listener receives and prints the code. The code is single-use
   and short-lived → §4 immediately.

## Step 4 · code → refresh_token exchange (browser-independent — curl)

```bash
source <SNS_TOKEN_DIR>/<slug>/gcp-oauth.env   # CLIENT_ID, CLIENT_SECRET
CODE='<code received by the step 3 listener>'
DEST=<SNS_TOKEN_DIR>/<slug>/youtube-oauth-client.json

RT=$(curl -s -X POST https://oauth2.googleapis.com/token \
  -d client_id="$CLIENT_ID" -d client_secret="$CLIENT_SECRET" \
  -d code="$CODE" -d grant_type=authorization_code \
  -d redirect_uri="http://localhost:8391" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("refresh_token",""))')

python3 - "$CLIENT_ID" "$CLIENT_SECRET" "$RT" "$DEST" <<'PY'
import json,sys
cid,csec,rt,dest=sys.argv[1:5]
json.dump({"client_id":cid,"client_secret":csec,"refresh_token":rt}, open(dest,"w"))
PY
chmod 600 "$DEST"
```

- An empty `refresh_token` means authorize was missing
  `access_type=offline&prompt=consent`, or the app was already consented to and
  Google withheld it — get it again with `prompt=consent`.
- **Don't `echo` the refresh_token** — write it straight into the JSON with
  Python.
- Don't use `UID` as a shell variable name (read-only reserved variable — the
  script dies).

## Verification & trap roundup

- Confirm youtube ok and the **channel ID** with `sns_account_check(channel)` —
  always cross-check that it's the channel being set up (not another brand
  channel's token).
- **The 7-day expiry trap**: a refresh_token issued at the "테스트 중" (testing)
  stage dies after 7 days. Reissue after publishing to production.
- **A publish-only token has no growth scopes**: if it was issued with upload
  only, a scope error on the first caption/growth-tool call is normal. To grow
  scopes, reissue via §3–§4 and swap only the `refresh_token` in the JSON
  (keep `client_id`/`client_secret`).
- **Custom thumbnails · Related video**: they need at least phone verification
  (intermediate features), and the Shorts portrait-surface thumbnail can't be
  changed via API (YouTube app Edit thumbnail only).
