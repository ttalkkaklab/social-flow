---
name: grow-threads
description: >
  Runs one autonomous Threads growth tick — reply, join conversations, post. Use when the
  user asks to "스레드 키워", "스레드 성장 루프", "성장 틱 돌려", "grow the Threads account", or wants the
  growth loop running. One tick replies to inbox comments (golden hour first), snapshots
  insights, joins keyword conversations whenever it judges it has a real contribution (no
  daily cap), and writes and publishes new posts whenever there is something worth saying
  — slots are a rhythm, not a cap — attaching a generated image when one helps. Every
  outgoing text is recorded as a draft and reviewed, and the server binds the published
  body to the reviewed draft, inside the standing authorization in
  data/[channel]/growth/threads/growth-plan.md.
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
  "mcp__social-flow__threads_draft_create", "mcp__social-flow__threads_review_submit",
  "mcp__social-flow__threads_publish", "mcp__social-flow__sns_comment_reply",
  "mcp__social-flow__image_local_generate", "mcp__social-flow__gpt_image_text2img"]
---
**Automatic execution policy:** Read [automation guidance](../_shared/automation-guidance.md) first. Creative rules and review findings guide improvements; scores, review/hash/freeze records, CTA choices and intermediate approval steps do not block authorized work. Preserve actual external-action authorization and stop at the artifact the user requested. This policy supersedes older quality-gate wording below.


# Threads growth loop — one autonomous tick

Growth skills are **split per platform** — tactics, tools, and state differ
platform by platform. This skill is Threads-only; grow-instagram and grow-youtube
sit on the same skeleton (plan = standing
authorization · judgment-based publishing + editorial review · idempotent state).
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
   Point the user to init. The plan is the standing authorization the publish
   tools' descriptions refer to (`growth-plan.md` status: approved) — if a post
   outside the plan's scope (topic pool, keywords, tone) is needed, don't do it
   autonomously; ask the user for a plan update. A breakout push handed over by
   the channel's YouTube loop sits outside that scope as well: it becomes
   publishable only once the plan says `push_allowed: true` and carries the
   §Cross-platform push section that explains it.
2. **No engagement begging** — "좋아요 눌러" (hit like), "댓글 YES" (comment
   YES), "팔로우하면 알려드려요" (follow and I'll let you know) are patterns
   Meta has explicitly said it suppresses. Don't join seuhari swap rooms
   (Korean follow/like/repost reciprocity — playbook §Seuhari culture) or
   organized follow-for-follow either.
3. **No blind retry of non-idempotent publishes** — when threads_publish /
   sns_comment_reply fails, don't blindly repeat the same call (duplicate post).
   Log the failure in growth-log and move on to the next tick.
4. **No plaintext token exposure** — tokens live only in files under
   `<SNS_TOKEN_DIR>/<slug>/` (default `~/.config/social-flow/<slug>/`). Don't store
   whole API responses in state.json or growth-log.md (only the fields you need).
5. **Use review findings as guidance** — read outgoing copy in context and fix
   concrete problems. Missing thresholds, low scores and a fixed review-count limit
   do not block an authorized post or reply. Preserve the plan's actual posting
   scope, platform quotas, account identity and duplicate-post protection.

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

One file outside this directory matters: `data/<channel>/growth/breakout.json`.
The YouTube loop writes a breakout candidate there and this loop reads it in §4
— channel-shared for the same reason `autoproduce.json` is, since both loops
are talking about one video. **Read only.** The push gets recorded in this
loop's own `state.json`, so neither loop writes the other's file and no lock is
needed.

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
   cap; the loop decides within the authorized scope. Creative reviews guide editing and their scores do not grant or remove publishing permission. To stop, stop /loop; to change scope, edit the plan."*
5. Initialize `state.json`, write the growth-log.md header.

## Editorial review guidance for outgoing copy

Use review when it helps improve outgoing text (new post, search-engagement reply,
inbox reply), within existing publication or reply authorization. Consider two things — **does it read
as written by a person** (no AI tells), and **does it fit the context**
(consistent with the source post, the plan, and the channel identity).

1. **Optional style diagnostic** — inspect a draft when useful:

   ```bash
   CS=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-style.py
   printf '%s\n' "$draft" | python3 $CS --surface threads -   # new post (a chain: once per part)
   printf '%s\n' "$draft" | python3 $CS --surface reply -     # replies (search engagement · inbox)
   ```

   Read the findings in context and fix concrete language problems. S1, S2 and
   C7 findings are suggestions, not automatic publication vetoes; do not rewrite
   natural copy only to raise a score. See platform-guide
   `references/korean-style.md` for examples.

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

2. **Editorial review (delegated to the growth-post-reviewer agent)** — this
   read is the review of record. Batch the drafts that passed the self-check by
   stage and delegate them in one call (inbox-reply batch · search-engagement
   batch · new post). The delegation prompt must carry: the full draft texts
   (numbered, surface stated), for replies the source context (target post and
   original comment in full — without this the context axis scores 0), the
   paths to `growth-plan.md` and `profile.md`, and the self-check exit code.
   **A chain goes up as one `post_chain` draft** — its parts numbered in
   reading order in the one draft, so the reviewer judges the hook, each part
   and the whole the way a reader meets them; a finding on any part is a
   finding on the chain. The reviewer returns a
   `GROWTH_POST_REVIEW: draft=N score=NN p0=N verdict=PASS|FAIL` tail per
   draft. The label and the score are the reviewer's assessment, recorded as
   evidence (§Server publishing contract, step 2). What keeps a draft from
   going out is a P0 that names an unresolved problem — a fact the copy asserts
   without support, a reply aimed past what the source says, a policy
   violation — or missing authorization, never the score
   (platform-guide `references/reply-gate.md`).

3. **Revise** — fix the findings as the directives say. When fixing, **prefer
   deletion** — plant a metaphor or stock phrase that wasn't there and that's
   the new AI tell; what may be added is a fact or qualifier the sentence needs
   to stay true.

   **The costliest trap is not metaphor but the urge to fill the empty spot.**
   Delete the flagged expression and the text gets shorter and starts to feel
   like it "won't be understood." The material added at that moment becomes the
   next revision's defect — the 2026-08-12 new post went through three revisions
   **in exactly this structure** and was not sent: tactics-document vocabulary
   (`뿌려지고`) → reviewer-verdict vocabulary from the log (`드러날 자리였어`)
   → **an unverified factual addition** (summarizing the other person's post,
   it invented a claim not in the original — and that reply would have sat
   under their post, where the author could read it). That last one is the
   kind of problem that does keep a draft from going out. One rule — **end
   every fix by deleting, not adding.** If it feels bare after deleting, don't
   hunt for new material; **first read whether the preceding passage already
   fills that spot** (all three times, it did).

   **Read a finding for what it is before acting on it — a problem to resolve,
   or a deduction to absorb.** The same day, two candidate engagement replies
   flipped on this: the delete-only version carried one deduction (a premise
   the other person hadn't stated) and read well, while the version that
   reworked its first sentence to erase even that deduction came back with two
   P0s (reviewer-critique vocabulary inflow + internal notation the other
   person never used). **Pushing copy that already reads well toward a perfect
   score is what creates P0s.**

   When the call could go either way, don't decide alone — **delegate both
   versions together**. In the case above that's what kept the bad version off
   the feed. Even a direction the reviewer didn't recommend goes up alongside
   if there are grounds — and grounds come only from what's inside the copy
   (is the fact verified, did the reviewer attach a condition), never from
   score arithmetic.

   Re-delegate only the revised drafts when a finding needs a second read, and
   include the previous round's findings so the reviewer rules on whether
   they're resolved. There is no fixed round count: stop when the findings are
   addressed or justified, and send within the existing authorization.

4. **Record the assessment** — write the actual findings and the score into
   growth-log as evidence (§5) and submit the read as the draft's review record
   (§Server publishing contract, step 2). Continue within the existing
   publishing authorization; a draft that falls short of a numerical creative
   threshold is reported, not skipped.

## Server publishing contract — draft, review record, publish

Run from the project root containing `data/`. The server keeps one operational
contract: **the body that gets published is the body that was recorded and
reviewed.** It keeps no score threshold, no required review per axis, no P0 veto
and no `gate.json`; the style check runs and returns suggestions (owner decision
2026-10-18).

1. Call `threads_draft_create(channel, body, readerMessage, purpose, selfReply?,
   surface?, replyToId?, purposeEvidence?, flow?, comicElements?, submitter?,
   submitterContext?)`. The response supplies `draftId` and `bodyHash` (SHA-256
   of the normalized body + selfReply). `readerMessage` is a one-sentence
   summary; `purpose` is exactly one of `fun`, `moved`, `info`, `empathy`.
   `purposeEvidence`, `flow` (`hook`, `turn`, `residue`) and `comicElements` are
   optional notes for the record — supply them when they help the review, and a
   supplied `purposeEvidence` must quote the body verbatim (whitespace-only
   normalization). For a conversation or inbox reply, pass `surface: "reply"`
   and `replyToId`; this target is bound to the draft.
2. Record the editorial review (§Editorial review guidance, step 2) with
   `threads_review_submit(draftId, bodyHash, axis: "voice", score, reasons,
   improvements, reviewer, reviewerContext, findings)` — the growth-post-reviewer's
   score and its findings, each with `quote`, `issue` and `severity` (`pass`,
   `P0`, `P1`, `P2`); a clean read still quotes the passage supporting it. The
   server checks that each quote occurs in the draft (whitespace normalized).
   `voice` is the one axis the loop submits, for posts and replies alike;
   `purpose` and `flow` stay available for a read that was made on those axes.
   A review is evidence bound to the hash; it never blocks the publish. Do not
   call paid model APIs or use `OPENAI_API_KEY` / `GEMINI_API_KEY` for review —
   the host subagent reads within the subscription.
3. Call `threads_publish(channel, draftId, caption, selfReply?, imageUrl?,
   replyToId?, dryRun?)` with the reviewed text. The server verifies that the
   normalized body+selfReply SHA-256 equals the draft's `bodyHash`, that the
   channel matches and that the reply target matches the draft's `replyToId` —
   that binding is the whole check. It also runs the bundled `check-style.py`
   (`threads` for a post, `reply` for replies) and returns the findings as
   suggestions; exit 1, 2 and 4 are logged as warnings and never refuse the
   call. `dryRun: true` validates the draft binding without reading credentials
   or calling publishing APIs. A successful live call posts the main body and
   then its optional self-reply. If the self-reply fails after the main post
   succeeds, retain the returned root post ID and warning; never retry the
   whole post.

Changing either text means a new draft (the hash no longer matches) and a fresh
review record. Audit records go to `data/<channel>/growth/threads/gate-log.jsonl`;
malformed calls with no resolvable channel go to
`data/unknown/growth/threads/gate-log.jsonl`. Scores and findings remain reviewer
claims: exact quotation proves textual grounding, not sound judgment. Reviewer
and context identifiers are self-reported. The server cannot distinguish
subagents in the same session or enforce reviewer independence; matching
submitter identifiers are logged, not rejected. Unknown submitters are recorded
as unknown. Local draft and episode-approval files assume a trusted workspace
writer.

Every `threads_publish` in the growth loop, including image posts and keyword
replies below, carries a `draftId`. Never use an episode reference to publish
growth copy. Inbox `sns_comment_reply(platform: "THREADS")` also takes the reply
draft's `draftId`; its `commentId` must match the draft's `replyToId`. The draft
is the record of what was sent; it needs no review to be publishable. This covers
the plugin MCP routes, not external direct API clients.

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
2. **Generate** — under Codex or Grok use the host `image_gen` (subscription
   allowance, `image.host`); on Claude Code use `image_local_generate` (local
   Z-Image — the default, zero cost). Reflect the profile's §THEME colors and channel tone in the
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
4. **Publish** — `threads_publish(caption, imageUrl, channel, draftId)` with the
   reviewed body copy (§Editorial review guidance).

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
to answer again), create a `surface: "reply"` draft with `replyToId: commentId`, run
the §Editorial review and record it (§Server publishing contract), then post via
`sns_comment_reply(platform: "THREADS", channel, commentId, message, draftId)` — replies are person-to-person conversation, where AI
tells get caught fastest. For successful posts, the inbox's `answeredByUs`
filter guarantees dedup.

**Comments the loop decides not to answer get recorded in
`gateSkippedCommentIds` and closed out.** A reply stays unsent only for an
unresolved factual or context problem — the answer would assert something
unverified, or it can't be written without inventing — or for missing
authorization; a creative shortfall is revised, not a reason to skip
(reply-gate.md). Leave a closed-out comment without `answeredByUs` and every
tick will re-draft and re-review it forever (the biggest reviewer-call leak in
an unattended loop). Report "n not answered" with the reason in the tick
summary so a human can decide whether to reply personally.

**Watching only the inbox misses half the conversation** —
`sns_comment_inbox` scans only our **root posts**, so when someone answers a
reply we left on their post, it never shows up. That's exactly where
conversations continue, and the golden hour gets missed wholesale. Query
`/{id}/replies` directly with the recent reply IDs in
`state.recentReplyIds` and handle those too (`references/api-limits.md` §4).

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
promotion or links, 8+ words), run the §Editorial review and record it, then publish via
`threads_publish(channel, draftId, caption, replyToId: <postId>)`. Add the postId to `engagedPostIds`
(keep the latest 500 — prevents re-engaging the same post). **Add postIds the
loop drafted for and then did not send (an unresolved factual or context
problem) exactly the same way** — it's the record of "attempted". Otherwise
every tick re-drafts and re-reviews that post until it ages out of the 24-hour
search window.

**Before picking a topic, read `state.gateSkippedDrafts` first** — a topic not
sent for a factual or context problem, resurfaced with only the surface changed
(new post → reply), carries the same problem. A surface change is not a fix.
Measured (2026-08-12): a topic not sent the previous day was reused as a reply
the next day and the same finding came back word for word. If a skip record
carries `lesson` · `reusable`, follow those directives.

**Compare by the problem type in `why`, not by `topic`** — there are paths
where the same problem follows even when the topic differs completely. At 11:50
the same day, a draft on an entirely different topic axis (about someone
else's speech-style example) came back with **the same problem** as the 07:30
skip: "automation self-exposure with only the tool name removed, function left
in". Scanning topics alone won't show it.

**When two findings cancel each other out, skip.** That draft's structure was:
write it truthfully and the automated authorship shows; avoid that and you must
claim outcomes never experienced — delete either side and zero material
remains. The dividing line from the revision that saved a draft the same
morning is **whether real material remains after deleting.** If none remains,
that's a target we have nothing true to give — not a creative shortfall — and
skipping is the answer.

**If `threads_search` returns zero posts from other people, that's normal** —
before the app's advanced-access approval, only your own posts come back (not
a bug). Then find in the browser — ego lite, the only browser lane; if it is
missing, say so and skip this stage — and reply via the API. The discovery path,
the ID-extraction rules (3 traps), and the pre-publish re-check are in
`references/api-limits.md` §2 — the source of truth. **Pull the body and the
ID from different places and they shift by one — the reply lands on the wrong
post** — measured; we nearly replied to a political post.

Target selection criteria are in playbook §Engagement targets — not exposure,
but **whether we can give something we actually experienced**. There are
measured cases of skipping big-reach posts (a keyboard app at 7,232 exposures
· a clickbait hook at 617).

### 4. New post authoring (judgment-based — slots are a rhythm guide)

**Before the ordinary judgment, check the breakout handoff.** If
`data/<channel>/growth/breakout.json` holds a candidate that names `threads` in
its `pushTargets`, that `state.pushes` has no entry for, and the plan's
`push_allowed` is true (§Cross-platform push) — that candidate is this tick's
material. Write a post that stands on its own about what the episode found
(playbook §New-post style: short unless the material holds a longer read, hook
not spent, question ending) and let the video hang off it. **A post whose whole
content is "go watch this" doesn't go out** — that's the engagement-begging
shape absolute rule 2 names, and it reads as an ad to everyone scrolling past. The link follows the plan's §Link
policy and its target is the YouTube watch URL, not the IG permalink the
episode fallback uses (playbook §Principles, the links bullet). The review runs
as it does on any other post, and so does the golden-hour hold below. On
publish, record `{ videoId, postId, at }` in `state.pushes` plus one line in
growth-log. One push per candidate — never a second post about the same video
in a later tick.

**What the reviewer does and doesn't cover here.** It catches the ask:
"공유해 주세요" is engagement begging with or without a candidate behind it
(growth-post-reviewer P0-2 names the push and exempts nothing). It doesn't
catch a link on the post surface — that P0 is scoped to search replies. So the
judgment about whether this post earns its link is yours, before the draft ever
reaches the reviewer.

If any condition is missing — no candidate, `threads` not among the targets, or
`push_allowed` false or absent — leave it alone and go on to the ordinary
judgment. **The plan is what most often blocks it**: one written before that
section has a topic pool that says nothing about our own episodes, so pushing
under it would publish outside the pool (absolute rule 1). Report the waiting
candidate and ask the user for a plan update; don't push first and explain
afterwards.

**When there's something to say, write — any time.** What decides a new post is
the material, not the clock — first judge, from the topic pool × step-2
learning, whether there is "something this channel is worth hearing on right
now"; if yes, author it per playbook §New-post style (short by default, hook
not spent, a question ending when the post is for conversation, hashtags ≤1),
run the §Editorial review and record it, then `threads_publish`. If not, don't
write even at slot time — filler posting is the worst move.

**Two decisions come before the first sentence** (playbook §Post types):

1. **Reach or conversation.** They come from different posts — a question
   doubles replies and costs response rate (measured: 46 vs 21 median replies,
   0.51% vs 0.70% response). Write down which one this post is for, because it
   decides the ending, the image and the type.
2. **Which type.** Verdict request · confession · scene · information. Our
   material is mostly information, and that is the type that collects 13
   median replies after 20,000–30,000 people see it. Converting it is the job:
   one judgment of our own, or a memory the reader can answer with, or a
   question **someone else holds the answer to**. A question we answered
   ourselves inside the post is the loop's standard failure and the reviewer
   scores it as an empty question.

**A chain is an option when the material is a list or a sequence** (playbook
§Chain posts) — a short hook post and the substance in self-replies. Procedure:

- Style-check every part on its own (`--surface threads`), then delegate the
  whole chain to the reviewer **as one draft** — the parts numbered in reading
  order on the `post_chain` surface, so the reviewer sees what a reader would
  see. A finding on any part is a finding on the chain.
- Publish part 1 with `threads_publish`, take its `postId`, publish part 2 with
  `replyToId: <part 1 postId>`, and keep chaining off the previous part's id.
- **Stop at the first failure and don't retry inside the tick** (absolute rule
  3). Record the parts that went out in posts.md and note the stop in
  growth-log; the chain does not resume in a later tick.
- Every part counts against the publish quota (250/24h, api-limits.md).
- The golden-hour hold below is about root posts. Chain parts and the author's
  own reply are replies, so they go out back to back — that early stack of
  replies is the point.

**After publishing, reply to your own post once.** Buffer's 10.2M-post set
measured +42% engagement where the author replied to their own post, the
largest lift of the six platforms. One line that adds something — the detail
that didn't fit, the number behind the claim, a counter-case — through the same
review on the `post` surface, published with `replyToId: <the new post's id>`.
Skip it when the post already carries everything: a filler self-reply is the
engagement-begging register absolute rule 2 bans. A chain needs none, since its
parts already are the self-replies.

Plan slots are not a cap but a **rhythm guide**: reminders that help posts go
out during the target audience's active hours. If a slot time has passed and
it isn't in `filledSlots[today]`, review material for that slot first, and on
a successful publish record the slot into filledSlots (prevents double-filling
a slot). Outside slots, publish whenever timely material appears (something
found in a conversation just joined, the day's observation). Conversely, if
the previous post is still inside its golden hour (first 60 minutes), hold the new
one — your own posts would split the early distribution. **On a publish
failure, don't retry within the tick** (the next tick retries — duplicate-post
prevention).

**If an image would help the post, attach one** — an image lifts response and
costs reach (playbook §New-post style, rule 5: Buffer 4.55% vs text 2.79%
engagement; BlackTwist text-only 3,900 vs media 1,219 median views), so it
belongs on a post written for conversation and not on one written to travel.
Material with a number, a comparison, or a scene is the candidate. Generation
and upload follow §Image procedure; put the verified public URL into `imageUrl`. If the post stands
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
every time, so each post reads clean on its own while the whole timeline speaks
in one voice. The evidence grade is low — one measurement has candidate-widening
lifting diversity 1.6–2.1x, but it's an English creative-writing preprint with
no Korean field data. The procedure costs nearly nothing, so it's in.

### 5. Save · report

Save `state.json` (update lastTickAt) → if a new post was published, append
its full copy to `posts.md` under a `## <postId> <time>` header — **a chain is
one piece, not N**: one header carrying the first part's id (the rest listed
after it), the parts in reading order in the body, and the author's own first
reply under the post it answers. The batch checker splits on headers, so
filing the parts separately would read one chain as several near-identical
posts and cry homogenization → append one
tick-summary line to growth-log.md — the memo carries each draft's review score
and any not-sent reason → one report line to the user:
`[tick hh:mm] replies n · engagements n · new posts n · reviewed n/not sent n · followers ±n`.
A tick with no actions gets "observation only" — quiet ticks are normal.

**Measure the batch every five new posts** (the tick where the `##` count in
`posts.md` hits a multiple of 5). The reviewer sees one draft at a time, so it
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
7 days, top 3 posts by reach, next slot, and any breakout candidate sitting in
`breakout.json` that hasn't been pushed — with the reason it hasn't, since a
missing plan clause is a question for the user. No publishing.

## Error handling (the loop keeps running)

- **Scope error** (with reissue guidance) → skip just that stage and carry the
  guidance in the tick summary. If it repeats next tick, recommend stopping
  the loop.
- **Quota exceeded** (search 2,200/24h · publish 250/24h) → skip that stage,
  resume next tick.
- **Token expiry** (Meta, 60 days) → all publishing is blocked, so recommend
  stopping the loop and walk through the token-setup.md renewal procedure.
- **Post views showing 0** → not a failure but pre-aggregation (the account
  daily total rises first). Compare posts of the same age, and if an immediate
  value is needed, read `impression_count` in the browser with ego lite (same
  document §5); if ego lite is missing, say so and wait for the API value.

The wall-by-wall tool limits and workarounds, all experienced firsthand, are
in `references/api-limits.md` — no follow API, keyword-search advanced access,
the 3 ID-extraction traps, inbox limited to root posts, metric lag. **A new
session reads that document first** (never spend time on the same wall twice).
