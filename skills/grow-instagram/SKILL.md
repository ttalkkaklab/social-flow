---
name: grow-instagram
description: >
  Runs one autonomous Instagram growth tick — reply, measure, refill, publish. Use when
  the user asks to "인스타 키워", "릴스 성장 루프", "인스타그램 성장 틱", "grow the Instagram account", or
  wants the growth loop running. One tick replies to inbox comments (golden hour first),
  snapshots account and reel insights (skip rate, average watch time), refills the publish
  queue by authoring a new reel end to end through autoproduce when it runs dry, and
  publishes queue-marked reels in the plan's slots — all inside the standing authorization
  in data/[channel]/growth/instagram/growth-plan.md. Recur with /loop [interval]
  /social-flow:grow-instagram [channel]. First run needs the init argument.
argument-hint: "<channel> [init|tick|status]"
# ⚠️ Deliberate pre-authorization — this skill is an **explicit exception** to the
# plugin's "no pre-authorized publish tools" contract (same rationale as
# grow-threads and grow-youtube). The growth-plan.md fixed via HITL at init is
# the standing authorization that stands in for per-publish approval, and that
# authorization **covers authoring too** — with the plan's
# `autoproduce.enabled: true` the loop picks a topic, builds the reel, and
# stamps the queue marker itself (off, and only human-stamped episodes go out).
# Calling a publish tool without a plan is forbidden (§Absolute rules 1).
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "Agent",
  "WebSearch", "WebFetch",
  "mcp__social-flow__sns_account_check", "mcp__social-flow__sns_comment_inbox",
  "mcp__social-flow__instagram_insights", "mcp__social-flow__instagram_publish",
  "mcp__social-flow__sns_comment_reply",
  "mcp__social-flow__naver_search", "mcp__social-flow__serp_web_search",
  "mcp__social-flow__serp_news_search",
  "mcp__social-flow__image_local_generate", "mcp__social-flow__gpt_image_text2img",
  "mcp__social-flow__mlx_image_generate", "mcp__social-flow__mlx_image_edit",
  "mcp__social-flow__tts_local_generate", "mcp__social-flow__tts_generate", "mcp__social-flow__tts_elevenlabs_generate", "mcp__social-flow__tts_elevenlabs_dialogue",
  "mcp__social-flow__tts_list_voices", "mcp__social-flow__mlx_tts_generate",
  "mcp__social-flow__veo_img2video",
  "mcp__social-flow__music_generate_clip", "mcp__social-flow__mlx_music_generate"]
---

# Instagram growth loop — one autonomous tick

Growth skills are **split per platform** (same skeleton as grow-threads and
grow-youtube: plan = standing authorization · tick ≠ publish · idempotent
state). State paths are scoped under `growth/instagram/`.

```
/social-flow:grow-instagram <channel> init      # once — fix the plan (HITL)
/loop 1h /social-flow:grow-instagram <channel>  # hourly autonomous loop
```

**Two differences from Threads set this skill's structure.**

First, a reel is a video. One episode takes research, authoring, images,
voice, and a build. So publishing happens **only from the queue**, and there
are two ways to fill it. A human builds with
`/social-flow:storyboard → produce` and stamps `queue_instagram: ready`, or —
with plan `autoproduce.enabled: true` — the moment the queue runs dry, the
tick builds an episode itself and stamps the marker (§2.5, same as
grow-youtube).

Second, **there is no stage for joining other people's conversations.**
Threads finds posts to join via keyword search, but the Instagram Login API
this pipeline uses has no public post search. We don't imitate a feature that
doesn't exist.

`references/growth-playbook.md` is the source of truth for tactics (always
load before writing). That document carries **only claims that passed
verification**, and circulating folklore that was rejected sits in its own
do-not-cite list.

## Absolute rules (violation = stop immediately)

1. **No publishing without a plan** — if
   `data/<channel>/growth/instagram/growth-plan.md` is missing or its
   frontmatter isn't `status: approved`, call no publish tool. The plan is the
   standing authorization — if out-of-scope publishing is needed, ask the user
   to update the plan.
2. **No publishing a reel without `queue_instagram: ready`** — queue
   eligibility is only topics whose storyboard.md frontmatter `status` is
   `produced` **or** `published` with `queue_instagram: ready`. produced only
   means "production finished", not "cleared to post" — whether it goes out is
   decided by the `queue_instagram` marker. Why `published` counts toward
   eligibility is in §3 (when another platform publishes first, the status
   flips). The marker is stamped by a human or by §2.5's autoproduce.
   Autoproduce stamps `ready` only on episodes that passed every machine gate,
   and `hold` if even one failed. And autoproduce itself runs only when the
   plan's `autoproduce.enabled` turned it on.
3. **Never change `status:` as a publish result** — even on success, all this
   loop updates is `queue_instagram`. Flip it to `status: published` and
   grow-youtube's queue eligibility (`status: produced`) disappears — the same
   topic never reaches YouTube. The two loops read the same file.
   **The one exception is a new topic §2.5's autoproduce creates** — writing
   `status: produced` while creating a file that didn't exist is
   production-stage work, not publish-result recording. `produced` satisfies
   both loops' queue eligibility.
4. **The loop never creates hosting** — `videoUrl` must be a public HTTPS URL.
   An autonomous loop standing up a temporary tunnel is forbidden (no one is
   there to verify the teardown). With plan `media_hosting: off`, skip the
   publish stage whole and report only the queue level. **The authoring stage
   (§2.5) turns off with it** — don't spend money building a video with no
   road out.
5. **No blind retry of non-idempotent publishes** — on instagram_publish
   failure, don't blindly repeat the same call. Duplicate reels cannibalize
   each other's reach, and the metrics stay even after deletion. On a timeout,
   next tick **first check whether it published** via the recent media list in
   `instagram_insights`.
6. **Don't cross the originality line** — publish targets are our pipeline's
   outputs only. Files with another platform's watermark left on, re-edits
   that only change speed: never published. Fail the originality verdict and
   it doesn't end with one post — **the whole account** drops out of
   non-follower recommendations.
7. **No plaintext token exposure** — tokens live only in files under
   `~/.config/social-flow/<channel-slug>/`. Don't store whole API responses in
   state.json or growth-log.md (needed fields only).
8. **Hard caps** — publishing up to the plan's slot count (max 3/day);
   autoproduce up to `daily_produce_cap` (default 1) and the cost caps — never
   past **2 episodes/day** for this plan (autoproduce absolute rule 7). Only
   inbox replies are uncapped.
9. **Every tool call sets `channel: <channel-slug>`** — channel tokens only, no
   default-token fallback (prevents posting to the wrong account).

## Deliberately not done

- **Commenting on others' posts.** The API has no public search, so there's no
  way to find targets — and a brand account commenting on unknown posts is
  spam-adjacent behavior that erodes account signals.
- **Hiding comments.** `sns_comment_moderate` supports Instagram, but the hide
  judgment is outside autonomous scope — spam gets reported only; the user
  decides.
- **Auto-checking Account Status.** There is no API — the loop goes only as far
  as reminding (same pattern as grow-youtube's Related video).
- **Hashtag-count optimization.** Ground with no primary evidence, so the
  playbook offers no number. Putting them in the caption as topic markers is
  as far as evidence-backed execution goes.

## File layout (all local — data/ is not committed)

```
data/<channel slug>/growth/
├── instagram/
│   ├── growth-plan.md   # standing authorization (init writes it via HITL, status: approved)
│   ├── state.json       # state carried across ticks (the basis for double-publish prevention)
│   └── growth-log.md    # one line per tick + metric deltas (observation ledger)
├── autoproduce.json     # channel-shared — authoring budget and history (shared with the YouTube loop)
└── .autoproduce.lock/   # channel-shared lock — keeps the two loops from authoring at once
```

**The last two are channel-shared** (not split per platform). One video goes
out to both platforms, so budget and lock must be channel-level too — count
per platform and the caps leak double; lock per platform and the lock stops
nothing.

The template and state schema are in `references/growth-plan-template.md`.

## init — fix the plan (once, HITL)

1. Load `data/<channel>/profile.md` — if missing, point to
   `/social-flow:channel add` first and stop. Inherit tone, target, and
   forbidden subjects as the plan defaults, and read **§4 media public
   hosting** to set the `media_hosting` default (undecided → `off`).
2. Confirm the INSTAGRAM token with `sns_account_check(channel)` → one
   `instagram_insights(channel, days: 7, mediaLimit: 3)` call to **verify
   scopes**. Also verify
   `sns_comment_inbox(channel, platforms: ["INSTAGRAM"], postLimit: 3)` once
   (the comment scope is separate).

   **A scope error at this step is normal** — an existing token issued for
   publishing may lack `instagram_business_manage_insights`. Relay the reissue
   guide carried in the error (token-setup.md) to the user and **stop**. Don't
   start the loop without insights (observing results is the loop's eyes).
3. Fix the plan items with AskUserQuestion: 1–3 publish slots (the target's
   active hours), the weekly publish target (default 4 — the 3–5-per-week
   balance point in playbook §Rhythm), the media hosting mode (`base_url` /
   `staged` / `off`), comment-reply tone (profile inheritance is the default),
   reply exclusions (spam, hostility), and the Account Status check cadence
   (default weekly).

   **Autoproduce is asked separately** — it's the point where the loop's
   authority widens from publishing to authoring, so it's never on by default.
   On or off; where topics come from (`pool` default / `keywords`); the
   topic-pool entries; the per-episode cost cap (default $0.30); daily and
   weekly cost caps; authoring runs per day (default 1 — within this
   platform's hard cap of 2); minimum queue level (default 1); which platform
   queues to stamp on success (`mark_queues` — offer only platforms with an
   approved growth plan). If hosting is `off`, say right there that
   autoproduce won't run either. If the profile §2 TTS engine is `gemini` or
   `elevenlabs`, also say each episode carries a voice cost (about $0.015 per
   400 characters on Gemini, $0.04 on ElevenLabs — switching to local changes
   the voice).
4. Write `growth-plan.md` from the template, **show the full text and get
   explicit approval**, then save with `status: approved`. Always state:
   *"This plan is the standing authorization — the loop publishes reels
   stamped `queue_instagram: ready` publicly in their slots with no
   per-publish approval, and replies to incoming comments on its own.
   Publishing goes out only by the public-URL rule written in the plan, and
   with hosting `off` it doesn't publish. Stop by stopping /loop; change scope
   by editing the plan."* If autoproduce is on, add one line: *"When the queue
   runs dry, the loop picks a topic and builds a reel itself, and if it passes
   machine verification it publishes before a human sees it. It stays within
   N episodes/day and $X per episode."*
5. Initialize `state.json`, write the growth-log.md header.

## tick — autonomous cycle (default mode)

### 0. Load and gate

Load `growth-plan.md` (confirm approved), `state.json`,
`references/growth-playbook.md`.
If the state's date bucket isn't today, reset the daily counters.

### 1. Inbox replies (top priority — golden hour)

`sns_comment_inbox(channel, platforms: ["INSTAGRAM"], sinceHours: 48)` →
if `summary.withinGoldenHour` isn't 0, those comments come first. Write reply
copy per the playbook §Replies and post with
`sns_comment_reply(platform: "INSTAGRAM")`.

**Instagram replies attach only to top-level comments** — to answer a nested
comment, pass the inbox response's `parentCommentId` as the commentId. Dedup
is guaranteed by the inbox's `answeredByUs` filter (if a top-level comment's
children include ours, it counts as handled).

**Both gates run before the reply goes out** — the machine style check
(`check-style.py --surface reply`) and then the growth-post-reviewer agent, batched once
per tick. Only copy with score ≥95 and p0=0 gets sent, fixes are by deletion only, and a
reply that hasn't cleared in 3 rounds is skipped and logged. The contract, the exact
command, and what to attach per platform: [reply-gate.md](../platform-guide/references/reply-gate.md).

Instagram's row in that table: attach the original comment and **the caption of our post**
it was left on.

Spam and hate comments get no reply, only a mention in the next tick summary
(hiding is outside autonomous scope).

### 2. Insights snapshot (observation)

`instagram_insights(channel, days: 7, mediaLimit: 10)` → compare with
`state.lastInsights`, write one growth-log line with the follower delta and
reach trend, and update state.

The follower count uses `account.followersCount` — insights' `follower_count`
is an empty value for accounts under 100 followers, so it's unusable on a new
channel.

**Read two metrics off reels (`mediaProductType: "REELS"`).**
`reels_skip_rate` is the hook verdict and `ig_reels_avg_watch_time` (ms) the
retention verdict — the ranking model directly predicts "probability of
watching under 3 seconds" and "probability of watching longer than 95% of
same-length viewers", so these two are the closest observables. Images and
carousels don't have these metrics (platform doesn't support them).

Read the type of the top-reach reels (subject, length, format) and report the
observations to the user — without this learning loop, automation repeats the
same video. Planning changes happen with a human in the storyboard pipeline.

**Per-reel follow conversion can't be read.** `follows` and `profile_visits`
are FEED-only (images, carousels); request them on a reel and you get a 400
while **that media's metrics come back empty altogether** (measured
2026-08-15). Account-side `follows_and_unfollows` is also empty on new
channels (same pattern as `follower_count`), so judge by the account's
`profile_views` delta and `account.followersCount` instead.

**When reach craters, don't suspect the editing first.** The diagnosis order
is ① check Account Status ② the last 30 days' originals share ③ content
(playbook §Diagnosis order). ① has no API, so put a check request in the tick
report.

### 2.5 Queue refill — autoproduce (only when the plan turned it on)

If the plan isn't `autoproduce.enabled: true`, skip this stage whole.
**Skip it on `media_hosting: off` too** — don't spend money building a video
with no road out. If a hosting-less channel needs authoring, a human calls
`/social-flow:autoproduce` directly.

**Build only when the queue runs dry.** Author only when the count of
unpublished `queue_instagram: ready` topics is below the plan's
`autoproduce.min_queue` (default 1). Don't build ahead to stockpile —
inventory is money, and time-sensitive material goes stale into wrong
information.

Pre-authoring checks, in order (any failure: don't author, report the reason
only):

1. Queue `ready` level < `min_queue`
2. `autoproduce.json`'s today and this-week totals within `daily_cost_cap` and
   `weekly_cap`
3. Today's authoring count **for this plan** (success and failure included,
   autoproduce.json `counts.<platform>`) below **min(`daily_produce_cap`, 2)** —
   2 is the per-platform hard cap (autoproduce absolute rule 7). Other
   platform loops' authoring doesn't count here
4. The channel lock (`data/<channel>/growth/.autoproduce.lock`) can be taken —
   if not, the YouTube loop is authoring, so just move on

On pass, Read `${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/SKILL.md` and **follow
the unattended-mode procedure as written**. Pass the metrics read in §2 as the
tier-judgment input — the judgment is a **trend**, not an absolute threshold
(the last 3 episodes' average `reels_skip_rate` up 5%p or more against the
previous 3, in percentage points). No promotion under 6 published episodes, or
before a new baseline has accrued after a hook-contract revision
(source of truth: autoproduce `references/cost-tiers.md`).

**On authoring success, stamp every platform queue in the plan's
`autoproduce.mark_queues`.** One 9:16 master goes out to both platforms —
build per platform and the cost doubles. But stamp **approved platforms only**
(that platform's `growth-plan.md` at `status: approved`).

**The loop cannot create the hosting URL** (rule 4). With
`media_hosting: base_url`, the authored episode's public URL is determined as
`<media_base_url>/<topic slug>/video-sub.mp4`, but **putting the file there is
a human's job**. So §3 rarely publishes right after autoproduce — being
blocked at the URL check (§3-4) is the normal case; put
"authored · awaiting upload" in the tick report so a human uploads the file.

On failure, it depends on where it fell. Failed at the research gate: drop the
topic and move to the next candidate, but after two drops give up authoring
for this tick. Built the video and then failed a quality gate: leave it at
`queue_instagram: hold` and **never rebuild the same topic**. However it ends,
**record the cost spent so far in `autoproduce.json`** — count without the
failures and the budget becomes infinite.

### 3. Slot publishing (queue drain)

With plan `media_hosting: off`, skip this stage and report only the queue
level.

Scan the queue only when today has a slot whose **time already passed · within
3 hours of it · not in `filledSlots[today]`** (if several, the earliest one).
Slots more than 3 hours past are skipped (prevents the accident where a loop
that was off all day dumps the morning slot at night).

Queue candidates are the `data/<channel>/episodes/*/storyboard/storyboard.md`
whose frontmatter `status` is `produced` **or** `published` with
`queue_instagram: ready`, and whose topic isn't in `state.publishedTopics`.
If several, the one with the oldest `queue_at` (file mtime if absent).

**Not excluding `published` matters.** `status` is a single field with no
platform dimension, and grow-youtube flips it to `published` on publish
success. Accept only `produced` and, with the same topic queued on both
platforms, the moment YouTube goes out first the Instagram side is **silently
dropped with no error** — while the human believes it's queued. What prevents
double publishing is the `queue_instagram` marker and
`state.publishedTopics`, not `status`.

Pre-publish checks:

1. **Look for an existing INSTAGRAM row in `output/publish-log.md`.** If
   present, the topic already went out via the publish skill: don't publish,
   clean up to `queue_instagram: done`, and report (this closes the gap opened
   by widening the gate to `published`).
2. `output/instagram/caption.md` exists — the caption body is read from here.
3. Resolve the video's public URL — with `media_hosting: base_url` it's
   `<media_base_url>/<topic slug>/**video-sub.mp4**`; with `staged`, the
   frontmatter `video_url`. **IG gets the subtitle burn-in build** — other
   platforms take the subtitles as a separate file, but the IG container has
   no subtitle parameter, so uploading the clean build (`video.mp4`) loses the
   subtitles entirely (publish skill rule 8). A `staged` `video_url` must also
   point at the burn-in build; if the filename ends in `video.mp4`, check with
   a human.
4. `curl -sI <URL>` to **confirm 200 and a video MIME**. On failure, don't
   publish and report the reason (the file isn't on the hosting yet — a human
   handles it).

`instagram_publish(channel, videoUrl, caption)`. On success:

- Update storyboard.md frontmatter to `queue_instagram: done` (**leave
  `status:` alone** — rule 3)
- Record the permalink in `output/publish-log.md` (same format as the publish
  skill)
- Record in state's `filledSlots` and `publishedTopics`

On failure, don't record filledSlots and **don't retry within this tick**
either (the next tick retries the same slot). Write the failure reason in
growth-log.

### 4. Save and report

Save `state.json` (update lastTickAt) → append one tick-summary line to
growth-log.md → one report line to the user:
`[tick hh:mm] replies n · authored n($x, tier) · published n(slot) · followers ±n · skip rate 0.nn · avg watch n.n s`.
A tick with no actions logs "observation only" — quiet ticks are normal.

If the plan's `account_status_check` cadence has lapsed (per
`state.lastAccountStatusPrompt`), append one line to the report: "Check
recommendation eligibility at app > Settings > Account Status".

## status — state report

Summarize from state.json + the last 20 lines of growth-log.md + one
`instagram_insights` call: follower and reach trends, publishes in the last
7 days against the weekly target (3–5), the top 3 reach reels with skip rate
and average watch time, topics left in the queue, the next slot, and the last
Account Status check date. No publishing.
If autoproduce is on, also report from `autoproduce.json`: today's and this
week's spend against the caps, the topic-pool level, the topics stuck at
`queue_instagram: hold`, and **the topics authored but not yet uploaded to
hosting** — neither ever publishes without a human's hands.

## Error handling (the loop keeps running)

- **Scope error** (with the reissue guide) → skip just that stage and put the
  guide in the tick summary. If it repeats next tick, recommend stopping the
  loop. The insights and comment scopes are separate, so one side can be
  blocked alone.
- **Publish quota exceeded** — 100 per 24-hour rolling window. This loop's cap
  (3/day) can't reach it, so if it trips, it's combined with another path (the
  publish skill, manual publishing).
- **Container processing failure** — reels are encoded after upload. If the
  server's polling ends in failure, it's URL accessibility or a codec problem,
  so don't retry; report the reason.
- **Token expiry** (Meta 60 days) → all publishing is blocked, so recommend
  stopping the loop and walk through the token-setup.md renewal steps.
