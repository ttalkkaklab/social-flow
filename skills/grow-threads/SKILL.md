---
name: grow-threads
description: >
  Runs one autonomous Threads growth tick — reply, join conversations, post. Use when the
  user asks to "스레드 키워", "스레드 성장 루프", "성장 틱 돌려", "grow the Threads account", or wants the
  growth loop running. One tick replies to inbox comments (golden hour first), snapshots
  insights, joins keyword conversations whenever it judges it has a real contribution (no
  daily cap), and writes and publishes new posts whenever there is something worth saying
  — slots are a rhythm, not a gate — attaching a generated image when one helps. Every
  outgoing text clears the growth-post-reviewer gate (95 or above, zero P0) before it goes
  out, inside the standing authorization in data/[channel]/growth/threads/growth-plan.md.
  Recur with /loop [interval] /social-flow:grow-threads [channel]. First run needs the
  init argument.
argument-hint: "<channel> [init|tick|status]"
# ⚠️ Deliberate pre-approval — this skill is an **explicit exception** to the
# plugin's "no pre-approved publish tools" contract. The user chose fully
# autonomous mode (decided 2026-08-11), and the growth-plan.md confirmed via
# HITL at init is the standing authorization that replaces per-post approval.
# Calling a publish tool without a plan is forbidden (§Absolute rules, 1).
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "Agent",
  "mcp__social-flow__sns_account_check", "mcp__social-flow__sns_comment_inbox",
  "mcp__social-flow__threads_insights", "mcp__social-flow__threads_search",
  "mcp__social-flow__threads_publish", "mcp__social-flow__sns_comment_reply",
  "mcp__social-flow__image_local_generate", "mcp__social-flow__gpt_image_text2img"]
---

# Threads growth loop — one autonomous tick

Growth skills are **split per platform** — tactics, tools, and state differ
platform by platform. This skill is Threads-only; grow-instagram, grow-youtube,
and grow-tiktok get added later on the same skeleton (plan = standing
authorization · judgment-based publishing + review gate · idempotent state).
That's also why the state path is scoped to `growth/threads/`.

One invocation = one growth-cycle tick. The harness handles repetition:

```
/social-flow:grow-threads <channel> init      # once — confirm the plan (HITL)
/loop 30m /social-flow:grow-threads <channel> # 30-min autonomous loop (the user picks the interval)
```

A 30-minute interval is the recommendation — it fits two inbox checks inside the
golden hour (first 60 minutes). The loop runs while the session is open. Closing
the session stops it; the next `/loop` resumes it (state.json carries over).

**Premise — why this structure**: Threads judges reach post by post, not by
follower count, and reply engagement plus early response speed are the strongest
signals. So the tick's priorities are ① reply fast to replies received →
② observe performance → ③ join other people's conversations → ④ new posts.
There is no fixed cap on publishing frequency — **judgment decides how many
posts go out, not a count rule**. Join any conversation where there's something
real to contribute, and write whenever a topic gives you something to say.
Conversely, a tick that publishes nothing because there's nothing to say is
normal — filler posts written to keep up volume are the fastest way to kill an
account. Tactics and style rules live in `references/growth-playbook.md`
(the source of truth — load it before authoring).

## Absolute rules (stop immediately on violation)

1. **No publishing without a plan** — if `data/<channel>/growth/threads/growth-plan.md`
   is missing or its frontmatter isn't `status: approved`, call no publish tool.
   Point the user to init. The plan is the standing authorization — if a post
   outside the plan's scope (topic pool, keywords, tone) is needed, don't do it
   autonomously; ask the user for a plan update.
2. **No engagement begging** — "좋아요 눌러" (hit like), "댓글 YES" (comment
   YES), "팔로우하면 알려드려요" (follow and I'll let you know) are patterns
   Meta has explicitly said it suppresses. Don't join seuhari swap rooms
   (Korean follow/like/repost reciprocity — playbook §Seuhari culture) or
   organized follow-for-follow either.
3. **No blind retry of non-idempotent publishes** — when threads_publish /
   sns_comment_reply fails, don't blindly repeat the same call (duplicate post).
   Log the failure in growth-log and move on to the next tick.
4. **No plaintext token exposure** — tokens live only in files under
   `~/.config/social-flow/<channel-slug>/`. Don't store whole API responses in
   state.json or growth-log.md (only the fields you need).
5. **No publishing without passing the review gate** — every outgoing piece of
   copy (new post, search engagement, inbox reply) must pass the §Adversarial
   review gate (score ≥95 and P0=0 — the user lowered the bar from 95 to 90 on
   2026-08-12, then retracted that on 2026-08-13 and restored 95. The P0
   condition and the 3-round cap are unchanged).
   If a draft can't clear it within 3 rounds, don't publish it — record it in
   growth-log as skipped, with its score. There is no per-day or per-tick count
   cap — the only remaining limits are the platform's own quotas (publish
   250/24h · search 2,200/24h) and the qualitative rules (no re-engaging the
   same post, no trailing the same account with back-to-back replies).
6. **Every tool call specifies `channel: <channel-slug>`** — use only the
   channel's token, with no fallback to a default token (prevents
   wrong-account publishing).

## File layout (all local — data/ is not committed)

```
data/<channel slug>/growth/threads/
├── growth-plan.md   # standing authorization (init writes it via HITL, status: approved)
├── state.json       # state carried between ticks (the basis for double-post prevention)
├── growth-log.md    # one line per tick + insight deltas (observation ledger)
└── posts.md         # ledger of published new-post copy (`## <postId> <time>` + body) — batch-check input
```

Why `posts.md` exists separately: batch homogenization only shows when **the
published drafts sit in one place**. growth-log is one summary line per tick so
no copy survives there, and `threads_insights` gives metrics only.

The template and the state schema are in `references/growth-plan-template.md`.

## init — plan confirmation (once, HITL)

1. Load `data/<channel>/profile.md` — if missing, point to `/social-flow:channel add`
   first and stop. The plan inherits tone, target, and banned topics as defaults.
2. `sns_account_check(channel)` to confirm the THREADS token → one call to
   `threads_insights(channel, postLimit: 3)` to **verify scopes**. On a scope
   error, relay the reissue guidance embedded in the error (token-setup.md) to
   the user and stop — don't start the loop without insights (performance
   observation is the loop's eyes). Also verify `threads_search` once
   (the threads_keyword_search scope).
3. Confirm the plan items via AskUserQuestion: 3–5 keywords of interest (for
   search engagement), 1–3 posting-rhythm slots (e.g. 09:00 · 12:30 · 21:00 —
   the target audience's active hours; explain that these are a rhythm guide,
   not a cap), the topic pool (post-idea categories), banned topics, and speech
   style (inheriting the profile is the default).
4. Write `growth-plan.md` from the template and, **after showing the full text,
   get explicit approval**, then save with `status: approved`. At that moment,
   disclose without fail: *"This plan is the standing authorization — within its
   scope (topic pool, keywords, tone) the loop publishes publicly and
   immediately without per-post approval, and publishing frequency has no fixed
   cap; the loop decides. Only copy that passes the adversarial review gate
   (95 points) goes out. To stop, stop /loop; to change scope, edit the plan."*
5. Initialize `state.json`, write the growth-log.md header.

## Adversarial review gate (required before publishing — all copy)

Every outgoing text (new post, search-engagement reply, inbox reply) gets
published only after passing this gate. It checks two things — **does it read
as written by a person** (no AI tells), and **does it fit the context**
(consistent with the source post, the plan, and the channel identity).

1. **Self style check (deterministic, immediate)** — run the checker on every
   draft:

   ```bash
   CS=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-style.py
   printf '%s\n' "$draft" | python3 $CS --surface threads -   # new post
   printf '%s\n' "$draft" | python3 $CS --surface reply -     # replies (search engagement · inbox)
   ```

   On exit 2 (S1), fix and re-check. Even on exit 0, read the detection list —
   S2 only deducts points and still passes, so "green means send" will kill you.
   In particular, **never leave a new post where C7 (no long sentence) fired** —
   it's a post of nothing but short sentences (channel measurement: posts
   flagged C7 trailed 2.6x in reach at the same age). The machine verdict is the
   source of truth — don't override it with your own judgment. The rules are in
   platform-guide `references/korean-style.md`.

   **Two orthographic issues the checker can't see get a manual sweep** — typos,
   and **a space between a digit/Latin token and the particle that follows it**.
   The latter is whitespace human typing never produces (it only appears when
   tokens get concatenated), so it's an AI orthography signal in itself. It
   recurred three times in one day (measured — "200 으로" · "AI 한테" ·
   "반응 0 이"). Sweep mechanically right before publishing:

   ```bash
   python3 - <<'PY'
   import re
   t = open('draft.txt').read()
   print(re.findall(r'[0-9A-Za-z]+\s+(?:이|가|은|는|을|를|에|의|로|으로|와|과|도|만'
                    r'|한테|에서|부터|까지|랑|이랑)\b', t) or 'none')
   PY
   ```

   **The path where internal-document vocabulary leaks into copy is also
   blocked mechanically.** Read a tactics document and write right after, and
   that document's **analysis vocabulary** lands verbatim in public copy —
   caught twice on 2026-08-12: `뿌려지고` (from the playbook §Form line
   "정보만 던지는 글은 뿌려지고") in a new post, and `드러날 자리였어` (from a
   reviewer verdict in growth-log, "안 읽은 게 드러나는 자리") in its revision.
   To the reader these are our internal jargon, words with no visible origin.
   Include **the log and state** in the comparison corpus (verdicts pile up
   there):

   ```bash
   python3 - <<'PY'
   import re
   docs = ''.join(open(f, encoding='utf-8').read() for f in [
     'skills/grow-threads/references/growth-playbook.md',
     'skills/grow-threads/SKILL.md',
     'data/<channel>/growth/threads/growth-log.md',
     'data/<channel>/growth/threads/state.json'])
   draft = open('draft.txt', encoding='utf-8').read()
   pairs = re.findall(r'([가-힣]{2,})\s+([가-힣]{2,})', draft)   # look at two-word chains
   print([f'{a} {b}' for a, b in pairs if f'{a} {b}' in docs] or 'none')
   PY
   ```

   Single-word matching flags ordinary vocabulary and is unusable — **two-word
   chains** are what separate out analysis vocabulary. If a flagged chain came
   from the source conversation or the subject matter itself, leave it; if it's
   wording we coined to analyze a phenomenon, rewrite it from material already
   inside the draft.

   **This scan has two blind spots, so the machine alone doesn't finish the
   job** (measured 2026-08-12): ① **single-token notation slips through** —
   `3단계` ("stage 3") is our internal notation and it passed (the other person
   had only used arrows; the numbering was ours, so "at stage 3" was a false
   reference). ② **the previous round's reviewer critique has no file to
   compare against** — the verdict exists only in the conversation, where the
   scan can't see it. In practice `헛것이 위로 올라오는` was carried over
   verbatim from a reviewer critique and became a P0 (third incident on this
   same path).

   **② closes once you turn it into a file** — actually blocked that way at
   13:55 the same day. Reviewer verdicts land in full at
   `<session tasks directory>/<agentId>.output`, and advice received before
   delegating can be jotted into the scratchpad. Put both into the corpus and
   **separate the sources in code**:

   ```python
   corpus = internal_docs + reviewer_verdict_full + advice_notes   # compare against these
   prior  = all_my_previous_drafts                                 # words here are not leaks
   hits = [ph for ph in two_word_chains(draft) if ph in corpus and ph not in prior]
   ```

   Excluding `prior` is the key — the critique quotes my copy, so those passages
   all surface as false positives (measured: 3 of 4 hits were my earlier drafts,
   1 was a quote of the other person's post). The real inflows this scan caught
   were two: three advice-note expressions landing verbatim in the first draft
   (`기본 셸이` · `섹션에 이런`), and **`셸 루프` ("shell loop"), absent from
   every draft of mine, first appearing in the reviewer's critique and nearly
   landing in the revision.** Write right after reading advice or a verdict and
   its phrasing flows straight in — write revisions **from the original event
   only**.

2. **Adversarial review (delegated to the growth-post-reviewer agent)** —
   batch the drafts that passed the self-check by stage and delegate them in
   one call (inbox-reply batch · search-engagement batch · new post). The
   delegation prompt must carry: the full draft texts (numbered, surface
   stated), for replies the source context (target post and original comment in
   full — without this the context axis scores 0), the paths to
   `growth-plan.md` and `profile.md`, and the self-check exit code. The
   reviewer returns a
   `GROWTH_POST_REVIEW: draft=N score=NN p0=N verdict=PASS|FAIL` tail per draft.

3. **Improvement loop (3 rounds max)** — fix FAIL drafts as the correction
   directives say. When fixing, **only delete** — plant a metaphor or stock
   phrase that wasn't there and that's the new AI tell.

   **The costliest trap is not metaphor but the urge to fill the empty spot.**
   Delete the flagged expression and the text gets shorter and starts to feel
   like it "won't be understood." The material added at that moment becomes the
   next round's defect — the 2026-08-12 new post failed all 3 rounds **in
   exactly this structure** and was skipped: tactics-document vocabulary
   (`뿌려지고`) → reviewer-verdict vocabulary from the log (`드러날 자리였어`)
   → **an unverified factual addition** (summarizing the other person's post,
   it invented a claim not in the original — and that reply would have sat
   under their post, where the author could read it). One rule — **end every
   fix with deletion.** If it feels bare after deleting, don't hunt for new
   material; **first read whether the preceding passage already fills that
   spot** (all three times, it did).

   **Check first whether a finding is a P0 or a deduction; if a deduction,
   absorb it.** The same day, two candidate engagement replies flipped on this
   rule — the delete-only version carried a −2 deduction (one premise the other
   person hadn't stated) and **passed at 96**, while the version that reworked
   its first sentence to erase even that −2 scored **77 with two P0s**
   (reviewer-critique vocabulary inflow + internal notation the other person
   never used). **Trying to push copy that already cleared the bar toward a
   perfect score is what creates P0s.**

   When the call could go either way, don't decide alone — **delegate both
   versions together**. In the case above that's what kept the bad version off
   the feed. Even a direction the reviewer didn't recommend goes up alongside
   if there are grounds — doing so at 13:55 the same day earned 92, two points
   above the recommended version's 90, and those two points decided
   publish-or-skip right after the bar had been lowered to 90.

   **But never argue from score arithmetic.** One of the three grounds that
   time was rejected — "the recommended version caps at 91, so burning the
   last round equals a skip" is **not a fact about the copy.** Working
   backwards from the deduction ledger to "I need N points" amounts to asking
   for a one-time exemption from one of the accumulated deductions — scoring
   fitted to the outcome. The `3 rounds short = skip` rule exists precisely
   for that situation. Grounds come only from what's inside the copy (is the
   fact verified, did the reviewer attach a condition).

   Re-delegate only the fixed drafts, and include the previous round's
   findings so the reviewer rules on whether they're resolved.

4. **Verdict** — **only drafts with score ≥95 and p0=0 get published.** Still
   short after 3 rounds — don't publish; write `skipped (gate NN)` in
   growth-log. Not posting beats posting a sub-par post. Also note each
   published draft's final score in the growth-log memo — that's the window
   through which the user observes whether the gate actually works.

## Image procedure — generate and upload

When a new post is judged to need an image (§4 criteria), produce a public URL
with this procedure. `threads_publish`'s `imageUrl` only accepts a public URL
the platform can crawl, so upload the local file to the user-designated media
hosting to get one.

1. **Hosting gate** — if the `MEDIA_UPLOAD_URL` and `MEDIA_UPLOAD_API_KEY`
   shell environment variables are missing, turn the whole image stage off and
   publish text only. The autonomous loop does not go hunting for alternative
   hosting or temporary tunnels (same principle as the grow-instagram hosting
   gate). The same applies when the upload fails with 404 (no endpoint) or 503
   (server key unset) — write one line in growth-log and proceed without the
   image.
2. **Generate** — use `image_local_generate` (local Z-Image — the default,
   zero cost). Reflect the profile's §THEME colors and channel tone in the
   prompt, and **put no text inside the image** — Korean glyph rendering
   breaks easily (local measurement: "딸깍연구소" → "달닥연구소") and broken
   glyphs are an AI tell all by themselves. The body copy does the talking;
   the image only sets the scene or the mood of a number. Since the attachment
   carries no text, local quality is enough — use `gpt_image_text2img` only
   for a cut with a specific reason to raise quality. Save under
   `data/<channel>/growth/threads/.work/`.
3. **Upload · verify** — `references/upload-media.sh <file>` does the upload
   plus a round-trip check of the public URL (GET 200) and returns the URL as
   a single line. Never put an unverified URL into `imageUrl`. jpg/png/webp/gif
   · ≤10MB (shrink with sips if over) · type is judged from the leading bytes,
   so a disguised extension won't pass. On 429 (60-per-10-minutes cap), give
   up on the image this tick and try next tick.
4. **Publish** — `threads_publish(caption, imageUrl, channel)` with body copy
   that passed the gate (§Adversarial review).

> Hosting is the operator's to provide — any endpoint that accepts `POST` with
> an `x-api-key` header and raw bytes, returns `201 {data:{url}}`, and serves
> that url as an unauthenticated public GET will plug in (the contract in the
> script header). Until it's ready, the hosting gate keeps the image stage off
> and text posts go out as they are.

## tick — autonomous cycle (default mode)

### 0. Load · gate

Load `growth-plan.md` (confirm approved), `state.json`, and
`references/growth-playbook.md`. If the state's date bucket isn't today,
reset it.

### 1. Inbox replies (top priority — golden hour)

`sns_comment_inbox(channel, platforms: ["THREADS"])` → if
`summary.withinGoldenHour` is non-zero, start with those comments. Skip
comments listed in `state.gateSkippedCommentIds` (below). Write the reply per
playbook §Replies (plan tone, 1–3 sentences, leave room for the other person
to answer again), pass it through the §gate, then post via
`sns_comment_reply` — replies are person-to-person conversation, where AI
tells get caught fastest. For successful posts, the inbox's `answeredByUs`
filter guarantees dedup.

**Comments that fail the gate's 3 rounds get recorded in
`gateSkippedCommentIds` and closed out** — leave them without `answeredByUs`
and every tick will re-draft and re-review the same comment forever (the
biggest reviewer-call leak in an unattended loop). Report "n unanswered due to
gate" in the tick summary so a human can decide whether to reply personally.

**Watching only the inbox misses half the conversation** —
`sns_comment_inbox` scans only our **root posts**, so when someone answers a
reply we left on their post, it never shows up. That's exactly where
conversations continue, and the golden hour gets missed wholesale. Query
`/{id}/replies` directly with the recent reply IDs in
`state.recentReplyIds` and handle those too (`references/api-limits.md` §4).

If a reply post fails with `code 24 / subcode 4279009` ("media not found"),
it's a container-polling problem, not permissions — handle it with the
workaround in §3 of the same document and never blind-retry (duplicate post).

Spam and hate comments get no reply — just report them in the next tick
summary (hiding is outside autonomous scope — the user decides).

### 2. Insights snapshot (observation)

`threads_insights(channel, days: 7, postLimit: 10)` → compare with
`state.lastInsights`, write one growth-log line with follower delta and view
trend, and update state. From the per-post metrics, identify **the type of
post reaching the widest** (topic · form) and feed it into step 4's topic
selection — without this learning loop, automation just repeats the same post.

### 3. Keyword conversation engagement

Rotate the plan keywords via `state.keywordCursor` and search only 1–2 this
tick: `threads_search(channel, searchType: "RECENT", sinceHours: 24)`.
Candidate criteria: root post (`isReply: false`), not in
`state.engagedPostIds`, and the channel actually has something to contribute.
**How many to engage is decided by candidate quality** — only posts where a
real contribution exists, and exactly as many as exist. There's no count cap,
but the moment even one presence-only reply slips in, the whole account's
signal takes the hit — that's the yardstick. Write the copy per playbook
§Search engagement (experience and information contributions only, no
promotion or links, 8+ words), pass the §gate, then publish via
`threads_publish(replyToId: <postId>)`. Add the postId to `engagedPostIds`
(keep the latest 500 — prevents re-engaging the same post). **Add postIds
skipped after 3 failed gate rounds exactly the same way** — it's the record of
"attempted". Otherwise every tick re-drafts and re-reviews that post until it
ages out of the 24-hour search window.

**Before picking a topic, read `state.gateSkippedDrafts` first** — resurface a
gate-blocked topic with only the surface changed (new post → reply) and the
same P0 follows it. A surface change is not a defect fix. Measured
(2026-08-12): a topic skipped at 52 the previous day was reused as a reply the
next day and blocked again at 60, with the skip reason reproduced word for
word. If a skip record carries `lesson` · `reusable`, follow those directives.

**Compare by the defect type in `why`, not by `topic`** — there are paths
where the same defect follows even when the topic differs completely. At 11:50
the same day, a draft on an entirely different topic axis (about someone
else's speech-style example) was blocked with **the same defect** as the 07:30
skip: "automation self-exposure with only the tool name removed, function left
in". Scanning topics alone won't show it.

**When two P0s block each other, skip without running rounds.** That draft's
structure was: write it truthfully and the automated authorship shows; avoid
that and you must claim outcomes never experienced — delete either side and
zero material remains. The dividing line from the round deletion saved (10:00
the same day, 73→96) is **whether real material remains after deleting.** If
none remains, that's a target we have nothing to give, and skipping is the
answer.

**If `threads_search` returns zero posts from other people, that's normal** —
before the app's advanced-access approval, only your own posts come back (not
a bug). Then find in the browser and reply via the API. The discovery path,
the ID-extraction rules (3 traps), and the pre-publish re-check are in
`references/api-limits.md` §2 — the source of truth. **Pull the body and the
ID from different places and they shift by one — the reply lands on the wrong
post** — measured; we nearly replied to a political post.

Target selection criteria are in playbook §Engagement targets — not exposure,
but **whether we can give something we actually experienced**. There are
measured cases of skipping big-reach posts (a keyboard app at 7,232 exposures
· a clickbait hook at 617).

### 4. New post authoring (judgment-based — slots are a rhythm guide)

**When there's something to say, write — any time.** The gate on a new post is
the material, not the clock — first judge, from the topic pool × step-2
learning, whether there is "something this channel is worth hearing on right
now"; if yes, author it per playbook §New-post style (1–3 lines, hook not
spent, question ending, hashtags ≤1), pass the §gate, then `threads_publish`.
If not, don't write even at slot time — filler posting is the worst move.

Plan slots are not a cap but a **rhythm guide**: reminders that help posts go
out during the target audience's active hours. If a slot time has passed and
it isn't in `filledSlots[today]`, review material for that slot first, and on
a successful publish record the slot into filledSlots (prevents double-filling
a slot). Outside slots, publish whenever timely material appears (something
found in a conversation just joined, the day's observation). Conversely, if
the previous post is still inside its golden hour (60–90 min), hold the new
one — your own posts would split the early distribution. **On a publish
failure, don't retry within the tick** (the next tick retries — duplicate-post
prevention).

**If an image would help the post, attach one** — image posts beat text-only
on reach (playbook §New-post style, rule 5). Material with a number, a
comparison, or a scene is the candidate. Generation and upload follow §Image
procedure; put the verified public URL into `imageUrl`. If the post stands
without an image, publish text-only — no decorative images.

**Before writing, pin the reader in one line** — "who among profile.md's
targets reads this, and what will they be able to judge within 60 seconds."
If the answer only works with our tool or pipeline names in it, change the
topic. Even if it's inside the topic pool.

Measured evidence (2026-08-11): two posts published the same day in the same
time band ended differently. The one organizing our API traps into a numbered
list: 30 views · 0 likes at the same age. The confessional one laying our
metrics bare: 78 views (267 three hours later · 5 likes · 3 replies). Neither
had vocabulary tells. The difference was **whether the reader has a stake in
the post** — the former applies only to people building Threads automation on
the API; the latter reads as their own story to anyone growing an account.

So the hook's first sentence carries **a number or situation the reader
knows**. Never open with tool names or internal terms.

**Don't write the first sentence right away — jot down 3–4 entry points
first** — pick among a lived incident / a number / a question back / a
counter-example. Write cold and the model converges on the blandest opening
every time, so each post passes the gate while the whole timeline speaks in
one voice. The evidence grade is low — one measurement has candidate-widening
lifting diversity 1.6–2.1x, but it's an English creative-writing preprint with
no Korean field data. The procedure costs nearly nothing, so it's in.

### 5. Save · report

Save `state.json` (update lastTickAt) → if a new post was published, append
its full copy to `posts.md` under a `## <postId> <time>` header → append one
tick-summary line to growth-log.md — the memo carries each published draft's
gate score (skips included) → one report line to the user:
`[tick hh:mm] replies n · engagements n · new posts n · gate passed n/skipped n · followers ±n`.
A tick with no actions gets "observation only" — quiet ticks are normal.

**Measure the batch every five new posts** (the tick where the `##` count in
`posts.md` hits a multiple of 5). The gate sees one draft at a time, so it
**can't in principle see** the whole loop converging on one mold — individual
quality and batch diversity move in opposite directions (sister-plugin
measurement: two drafts differing only in topic scored 100/100 each with 0.77
mutual overlap). This loop sits in the middle of that risk surface.

```sh
python3 ${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-batch.py \
  --split data/<channel>/growth/threads/posts.md
```

Don't reject on it — there's no measured basis for a threshold, so it only
ranks. Write the expressions it lists under "reused phrases" and the
"same-opening" ratio into growth-log, and **stop using those expressions and
openings from the next post on** (published posts don't get edited). If the
overlap is conspicuous, revisit the topic pool first.

## status — status report

Summarize from state.json + the last 20 lines of growth-log.md + one
`threads_insights` call: follower trend, posts and engagements over the last
7 days, top 3 posts by reach, next slot. No publishing.

## Error handling (the loop keeps running)

- **Scope error** (with reissue guidance) → skip just that stage and carry the
  guidance in the tick summary. If it repeats next tick, recommend stopping
  the loop.
- **Quota exceeded** (search 2,200/24h · publish 250/24h) → skip that stage,
  resume next tick.
- **Token expiry** (Meta, 60 days) → all publishing is blocked, so recommend
  stopping the loop and walk through the token-setup.md renewal procedure.
- **Reply fails with `code 24 / subcode 4279009`** → the container was still
  `IN_PROGRESS` when published (not permissions). Handle with the 2-step
  workaround in `references/api-limits.md` §3. The server is fixed, but **the
  MCP process runs on the dist loaded at session start, so it keeps failing
  until a restart** — recommend restarting and take the workaround for this
  tick.
- **Post views showing 0** → not a failure but pre-aggregation (the account
  daily total rises first). Compare posts of the same age, and if an immediate
  value is needed, read `impression_count` in the browser (same document §5).

The wall-by-wall tool limits and workarounds, all experienced firsthand, are
in `references/api-limits.md` — no follow API, keyword-search advanced access,
the 3 ID-extraction traps, container polling, inbox limited to root posts,
metric lag. **A new session reads that document first** (never spend time on
the same wall twice).
