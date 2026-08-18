# Threads tool limits and workarounds — field-tested source of truth (2026-08-11)

The API walls the growth loop runs into, and the verified ways around them.
Everything written here was confirmed with real calls. The point of this
document is that no session, even a fresh one, spends time on the same wall
twice.

## 1. You can't follow via the API

The Threads API has no follow/unfollow endpoint (confirmed 2026-08). If a
follow is needed, the browser is the only way, and then **you must confirm the
logged-in account is that channel** — multiple brand sessions pass through one
browser, so a follow can go out under the wrong brand.

No mechanical follow-backs, no seuhari swap circles (§Absolute rules, 2). A
real-world account from 2026-08-09 describes running seuhari/banhari and
getting the account permanently banned within a day — that's account-death
risk, not a reach penalty.

## 2. Keyword search returns only your own posts until approval

Even with the scope (`threads_keyword_search`) and app permission all in
place, `threads_search` under **development-mode standard access** returns
only your own account's posts. Searching other people's public posts requires
App Review advanced access. **"Zero posts from others" is normal behavior, not
an error** — don't burn time mistaking it for a bug.

### The unlock path is effectively blocked — the apply button demands a business-status change (measured 2026-08-12)

The path is Meta app → Use cases → Threads API access → **Permissions and
features** tab → the `threads_keyword_search` row → options → **Add to App
Review**. But pressing that button opens not an application form but this
dialog:

> To add a permission or feature to App Review, become a Tech Provider …
> **This decision cannot be reversed after you've been identified as a Tech Provider.**
> Business verification → access verification → App Review

So **even getting onto the review list** requires converting to Tech Provider
first. Three things to know:

- **Tech Provider is per business (legal entity), not per app.** Creating a
  new app under the same business doesn't dodge it. Conversely, a dedicated
  business portfolio isolates the entity's other Meta assets.
- The official docs and the dialog disagree. The docs
  (`docs/development/release/tech-providers/`) describe losing and
  automatically regaining the certification **status**, but what the dialog
  nails down as irreversible is the **self-classification** — "we are a tech
  provider accessing other people's data" — and the standing heightened
  scrutiny that comes with it. Don't read only the docs and conclude "it can
  be undone."
- Three cost stages: business verification (corporate paperwork) → access
  verification (about 5 days of review) → App Review. The docs offer no
  exception path for an app that uses only first-party data (its own account).

**So the default call is: don't apply** (user decision, 2026-08-12). All
advanced access buys is search automation, engagement already works through
the workaround below, and App Review examines "why do you need other people's
data" — growth automation is a weak case. The price is irreversible; the gain
is convenience. The next session doesn't press that button again either.

### Workaround — find in the browser, reply via the API

Engagement works even before approval. Do the discovery in the browser and
the posting with the channel token. Since the write goes through the API,
**whatever account the browser is logged into, the publishing identity is the
channel** — wrong-account accidents are structurally impossible.

```
threads.com/search?q=<keyword>&filter=recent   ← discovery (read-only)
  → open the candidate post's permalink
  → pull the root post ID and body from that same page
  → threads_publish(replyToId: <that ID>)       ← publish (channel token)
```

**ID-extraction rules — there are three traps.** Confirmed by checking
against our own posts, where the right answer is known.

| What | Verdict |
| --- | --- |
| The **first `"XDTTextPostAppMediaInfo:<id>"`** on the detail page | ✅ root post ID (same value as the API) |
| `"pk"` | ❌ a different ID scheme (19 digits) — pass it and you hit the wrong post |
| The **first `"fbid"`** | ❌ an account constant that shows the same value on every page |

**The body must come from `document.title` of that same page.** Walk DOM
parents in the search-results list to grab a body and it **shifts one slot off
from the ID** (measured — we nearly attached an AI-automation reply to a
political post). If the ID and the body come from the same page, they can't
disagree.

Cross-check once more right before publishing: is the extracted ID the one
from that code, is `title` the post we actually read, and is it clear of the
plan's banned topics.

## 3. Replies must be published after the container reaches FINISHED

This was the cause of `threads_publish(replyToId=someone else's post)` and
`sns_comment_reply(THREADS)` failing with
`400 code 24 subcode 4279009 "미디어를 찾을 수 없음"` ("media not found").
Not a permissions problem — **right after creation the container status is
`IN_PROGRESS`, turning `FINISHED` about 3 seconds later** (measured by
polling). The old code only polled when `imageUrl` was present, so text
replies always published immediately.

The server is fixed (`publishThreads` now polls unconditionally). **But the
MCP server process runs on the dist loaded at session start, so until a
restart the old code keeps failing.** The workaround then is the 2-step
direct call:

```bash
TOK=$(cat ~/.config/social-flow/<channel>/threads_token)
C=$(curl -sS -X POST "https://graph.threads.net/v1.0/me/threads" \
     -d media_type=TEXT_POST --data-urlencode "text@draft.txt" \
     -d "reply_to_id=<target-id>" -d "access_token=$TOK" | jq -r .id)
# poll every 3 seconds until status is FINISHED (usually 1–2 tries)
curl -sS -X POST "https://graph.threads.net/v1.0/me/threads_publish" \
     -d "creation_id=$C" -d "access_token=$TOK"
```

**Never publish a container later whose publish already failed** — if the
workaround already posted in the meantime, that's a duplicate. Containers
disappear on their own after 24 hours.

Don't conclude "publishable" from the container creation returning 200 alone.
Creation does not validate reply permission (we got this wrong once).

## 4. The inbox scans only our root posts

`sns_comment_inbox` walks our recent **posts** and collects their comments.
So **when someone answers a reply we left on their post, the inbox never
catches it** — exactly where the conversation continues, and the golden hour
gets missed wholesale.

Each tick, check directly with our recent reply IDs:

```bash
curl -sS "https://graph.threads.net/v1.0/<our-reply-id>/replies\
?fields=id,username,text,timestamp&access_token=$TOK"
```

Keep the recent reply IDs in state and run this query.

## 5. Post-level metrics lag account-level ones

A just-published post showing `views` of 0 is usually pre-aggregation. The
account's daily total rises first and the per-post numbers fill in later
(measured: 0 at 13 minutes → 183 at 43 minutes). **Don't read a 0 as a
failure** — comparisons only make sense between posts of the same age.

The browser shows it immediately — `"impression_count"` in the post detail
page's HTML.

**The response shape differs between account and post** — this bites when you
sweep with raw curl (measured 2026-08-12). `me/threads_insights` (account)
returns `total_value.value`, but `/{id}/insights` (a single post) returns
`values[0].value`. A parser assuming only the account shape shows **every
field as `None` while HTTP stays 200**, so the metrics look like zeros.
Accept both shapes:

```python
vals = x.get('values') or []
v = vals[0].get('value') if vals else (x.get('total_value') or {}).get('value')
```

Also note `replies` arrives at the post level under the `name`
`thread_replies`.
