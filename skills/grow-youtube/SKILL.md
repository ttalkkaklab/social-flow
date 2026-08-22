---
name: grow-youtube
description: >
  This skill should be used when the user asks to "유튜브 키워", "쇼츠 성장 루프",
  "유튜브 성장 틱", "grow the YouTube channel", or wants the autonomous YouTube
  growth loop. Runs ONE growth tick for a channel — replies to inbox comments
  (golden hour first), snapshots channel/video analytics, refills the publish
  queue by authoring a new short end-to-end when it runs dry (autoproduce), and
  publishes queue-marked videos in plan-defined slots — fully autonomously within
  the standing authorization of data/<channel>/growth/youtube/growth-plan.md.
  Recur with /loop <interval> /social-flow:grow-youtube <channel>. First run:
  /social-flow:grow-youtube <channel> init.
argument-hint: "<channel> [init|tick|status]"
# ⚠️ Deliberate pre-authorization — this skill is an **explicit exception** to the
# plugin's "no pre-authorized publish tools" contract (same rationale as
# grow-threads). The growth-plan.md fixed via HITL at init is the standing
# authorization that stands in for per-publish approval, and that authorization
# **covers authoring too** — with the plan's `autoproduce.enabled: true` the loop
# picks a topic, builds the video, and stamps the queue marker itself (off, and
# only human-stamped episodes go out). Calling a publish tool without a plan is
# forbidden (§Absolute rules 1).
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "Agent",
  "WebSearch", "WebFetch",
  "mcp__social-flow__sns_account_check", "mcp__social-flow__sns_comment_inbox",
  "mcp__social-flow__youtube_insights", "mcp__social-flow__youtube_publish",
  "mcp__social-flow__sns_comment_reply",
  "mcp__social-flow__naver_search", "mcp__social-flow__serp_web_search",
  "mcp__social-flow__serp_news_search", "mcp__social-flow__youtube_topic_scout",
  "mcp__social-flow__image_local_generate", "mcp__social-flow__gpt_image_text2img",
  "mcp__social-flow__tts_local_generate", "mcp__social-flow__tts_generate", "mcp__social-flow__tts_elevenlabs_generate", "mcp__social-flow__tts_elevenlabs_dialogue",
  "mcp__social-flow__tts_list_voices",
  "mcp__social-flow__veo_img2video",
  "mcp__social-flow__music_generate_clip"]
---

# YouTube growth loop — one autonomous tick

Growth skills are **split per platform** (same skeleton as grow-threads:
plan = standing authorization · tick ≠ publish · idempotent state). State paths
are scoped under `growth/youtube/`.

```
/social-flow:grow-youtube <channel> init      # once — fix the plan (HITL)
/loop 1h /social-flow:grow-youtube <channel>  # hourly autonomous loop
```

**One difference from Threads sets this skill's structure** — a Short is a video.
Making one takes research, authoring, images, voice, and a build. So publishing
happens **only from the queue**, and what enters the queue is the crux of this
loop. There are two ways to fill it.

- **A human fills it** — build with `/social-flow:storyboard → produce` and
  stamp `queue: ready` in storyboard.md.
- **The loop fills it** — with plan `autoproduce.enabled: true`, the moment the
  queue runs dry the tick builds an episode itself and stamps the marker (§2.5).
  Topics, subject scope, and the per-episode cost cap are all written in the
  plan, and only episodes that pass the machine gates enter the queue.

**Hourly is enough** — slot publishing and comment replies both live fine at
that resolution, and authoring only happens when the queue is empty anyway.

`references/growth-playbook.md` is the source of truth for tactics (always load
before writing). That document carries **only claims that passed verification**,
and circulating folklore that was rejected sits in its own do-not-cite list.

## Absolute rules (violation = stop immediately)

1. **No publishing without a plan** — if `data/<channel>/growth/youtube/growth-plan.md`
   is missing or its frontmatter isn't `status: approved`, call no publish tool.
   The plan is the standing authorization — if out-of-scope publishing is needed,
   ask the user to update the plan.
2. **No publishing a video without `queue: ready`** — queue eligibility is only
   topics whose storyboard.md frontmatter `status` is `produced` **or**
   `published` with `queue: ready`. produced only means "production finished",
   not "cleared to post" — whether it goes out is decided by the `queue` marker.
   Why `published` counts toward eligibility is in §3 (when another path
   publishes first, the status flips). The marker is stamped by a human or by
   §2.5's autoproduce. **Autoproduce stamps `ready` only on episodes that passed
   every machine gate, and `hold` if even one failed** — hold never publishes;
   a human has to look and flip it. And autoproduce itself runs only when the
   plan turned it on — with `autoproduce.enabled` false or absent, §2.5 is
   skipped whole, and it never authors past the budgets (per-episode, daily,
   weekly).
3. **No blind retry of non-idempotent publishes** — on youtube_publish failure,
   don't blindly repeat the same call. A duplicate video upload costs more to
   recover than a duplicate post (two copies of the same video cannibalize each
   other's views, and the metrics stay even after deletion). On a timeout,
   next tick **first check whether it published** via the recent-uploads list in
   `youtube_insights`.
4. **Don't turn off AI disclosure** — `containsSyntheticMedia` defaults true and
   the loop never lowers it. It may only come down when everything in the video
   falls under the exemption list in the playbook §AI disclosure, and that
   judgment belongs to the user (recorded in the plan).
5. **No plaintext token exposure** — tokens live only in files under
   `~/.config/social-flow/<channel-slug>/`. Don't store whole API responses in
   state.json or growth-log.md (needed fields only).
6. **Hard caps** — publishing up to the plan's slot count (max 3/day);
   autoproduce up to `daily_produce_cap` (default 1) and the cost caps — never
   past **2 episodes/day** for this plan (autoproduce absolute rule 7). Only
   inbox replies are uncapped.
7. **Every tool call sets `channel: <channel-slug>`** — channel tokens only, no
   default-token fallback (prevents posting to the wrong account).

## Deliberately not done

- **Commenting on other people's videos.** On Threads reply participation is a
  ranking signal, so search-driven engagement is a tick stage — but YouTube
  doesn't use a brand account's comments on others' videos as a reach signal.
  It's spam-adjacent behavior and only erodes account signals. search.list also
  costs 100 units per call (10,000/day default), so the price doesn't work either.
- **Hiding or deleting comments.** `sns_comment_moderate` doesn't support
  YouTube (the API only offers review hold/reject, which mean something
  different). Spam gets reported only and handled in Studio.
- **Auto-setting Related video.** The Data API has no such field — a human sets
  it in Studio after publishing, and the loop goes only as far as reminding (§3).

## File layout (all local — data/ is not committed)

```
data/<channel slug>/growth/
├── youtube/
│   ├── growth-plan.md   # standing authorization (init writes it via HITL, status: approved)
│   ├── state.json       # state carried across ticks (the basis for double-publish prevention)
│   └── growth-log.md    # one line per tick + metric deltas (observation ledger)
├── autoproduce.json     # channel-shared — authoring budget and history (shared with the Instagram loop)
└── .autoproduce.lock/   # channel-shared lock — keeps the two loops from authoring at once
```

**The last two are channel-shared** (not split per platform). One video goes out
to both platforms, so budget and lock must be channel-level too — count per
platform and the caps leak double; lock per platform and the lock stops nothing.

The template and state schema are in `references/growth-plan-template.md`.

## init — fix the plan (once, HITL)

1. Load `data/<channel>/profile.md` — if missing, point to
   `/social-flow:channel add` first and stop. Tone, target, and forbidden
   subjects inherit into the plan defaults.
2. Confirm the YOUTUBE token with `sns_account_check(channel)` → one
   `youtube_insights(channel, days: 7, videoLimit: 3)` call to **verify scopes**.
   Also verify `sns_comment_inbox(channel, platforms: ["YOUTUBE"], postLimit: 3)`
   once (the comment scope is separate).

   **A scope error at this step is normal** — an existing token issued for
   publishing has only `youtube.upload`, so it lacks the read and comment
   scopes. Relay the reissue guide carried in the error (token-setup.md) to the
   user and **stop**. Don't start the loop without insights (observing results
   is the loop's eyes).
3. Fix the plan items with AskUserQuestion: 1–3 publish slots (the target's
   active hours), queue eligibility (default `status: produced` +
   `queue: ready`), comment-reply tone (profile inheritance is the default),
   reply exclusions (spam, hostility), AI disclosure policy (default: always
   disclose).

   **Autoproduce is asked separately** — it's the point where the loop's
   authority widens from publishing to authoring, so it's never on by default.
   On or off; where topics come from (`pool` default / `keywords` / `scout`);
   the topic-pool entries; the per-episode cost cap (default $0.30); daily and
   weekly cost caps; authoring runs per day (default 1 — within this platform's
   hard cap of 2); minimum queue level (default 1); which platform queues to
   stamp on success (`mark_queues` — offer only platforms with an approved
   growth plan). If the channel profile §2 TTS engine is `gemini` or
   `elevenlabs`, say so right there: *"This channel uses a paid voice engine,
   so every episode carries a voice cost (about $0.015 per 400 characters on
   Gemini, $0.04 on ElevenLabs). Switching to the zero-cost local engine means
   editing profile §2, and the narrator's voice will change."*
4. Write `growth-plan.md` from the template, **show the full text and get
   explicit approval**, then save with `status: approved`. Always state:
   *"This plan is the standing authorization — the loop publishes videos stamped
   `queue: ready` publicly in their slots with no per-publish approval, and
   replies to incoming comments on its own. Stop by stopping /loop; change scope
   by editing the plan."* If autoproduce is on, add one line: *"When the queue
   runs dry, the loop picks a topic and builds a video itself, and if it passes
   machine verification it publishes before a human sees it. It stays within
   N episodes/day and $X per episode."*
5. Initialize `state.json`, write the growth-log.md header.

## tick — autonomous cycle (default mode)

### 0. Load and gate

Load `growth-plan.md` (confirm approved), `state.json`,
`references/growth-playbook.md`.
If the state's date bucket isn't today, reset the daily counters.

### 1. Inbox replies (top priority — golden hour)

`sns_comment_inbox(channel, platforms: ["YOUTUBE"], sinceHours: 48)` →
if `summary.withinGoldenHour` isn't 0, those comments come first. Write reply
copy per the playbook §Replies and post with
`sns_comment_reply(platform: "YOUTUBE")`.

Dedup is guaranteed by the inbox's `answeredByUs` filter — for YouTube it's
judged by the time of our last reply within the thread, so a new comment that
arrived **after** our reply stays unanswered and gets picked up correctly. Pass
a nested-comment id and the tool re-targets the thread root.

**Copy passes the style gate before sending** — replies are person-to-person
conversation, where AI tells get caught fastest.

```bash
CS=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-style.py
printf '%s\n' "$reply_copy" | python3 $CS --surface reply -; echo "gate_exit=$?"
```

exit 2 (S1) means fix, then send. Rules: platform-guide
`references/korean-style.md`.

**Read the detection list even on exit 0** — S2 only deducts points and passes,
so "green means send" kills the gate. **If C7 (no long sentence) fires, don't
send as-is**: the copy is all short sentences, so lengthen one or re-pick the
subject and hook.

**Copy that passed the machine gate goes to the growth-post-reviewer agent for
adversarial verification** — delegate the tick's reply copy as one batch
(`inbox_reply` surface), and attach, per copy, the original comment and the
title and description of our video it was left on (without these the context
axis scores 0). Include the `growth-plan.md` and `profile.md` paths and the
self-check exit codes. **Only copy with score ≥95 and p0=0 gets sent.** Fix a
FAIL by deletion only, per the correction directives — planting a simile or
stock phrase that wasn't there is a fresh AI tell. Max 3 rounds; if it never
clears, don't send that reply and log it in growth-log as `skipped (gate NN)`.

Spam and hate comments get no reply, only a mention in the next tick summary
(hiding is outside autonomous scope — YouTube has no tool support anyway;
handle it in Studio).

### 2. Insights snapshot (observation)

`youtube_insights(channel, days: 7, videoLimit: 10)` → compare with
`state.lastInsights`, write one growth-log line with the subscriber delta and
view trend, and update state.

**Analytics lags 2–3 days** — empty values for yesterday and today are not an
outage. Compare 7-day windows against each other. If the subscriber count is
hidden (`subscriberCountHidden`) it's a rounded value — don't use it for delta
judgment; read only the view and watch metrics.

From the per-video metrics, read **the type of the top-reach videos** (subject,
length, format) and `averageViewPercentage` into the next plan — without this
learning loop, automation repeats the same video. If views are low but early
pass-through and retention are alive, don't clone that format. Open the next
episode's title and cover with the problem the viewer feels, not the method or
tool (content_feedback angle lever · platform-playbook §1 ②). Report
observations to the user; planning changes happen with a human in the
storyboard pipeline.

The swipe-away rate (Studio's "How many chose to view") isn't in the API —
judge hooks by `averageViewPercentage`, and when the swipe metric is needed,
suggest checking Studio.

### 2.5 Queue refill — autoproduce (only when the plan turned it on)

If the plan isn't `autoproduce.enabled: true`, skip this stage whole.

**Build only when the queue runs dry.** Author only when the count of
unpublished `queue: ready` topics is below the plan's `autoproduce.min_queue`
(default 1); otherwise do nothing. Don't build ahead to stockpile — inventory
is money, and time-sensitive material goes stale into wrong information.

Pre-authoring checks, in order (any failure: don't author, report the reason
only):

1. Queue `ready` level < `min_queue`
2. `autoproduce.json`'s today and this-week totals within `daily_cost_cap` and
   `weekly_cap`
3. Today's authoring count **for this plan** (success and failure included,
   autoproduce.json `counts.<platform>`) below **min(`daily_produce_cap`, 2)** —
   2 is the per-platform hard cap (autoproduce absolute rule 7). Other platform
   loops' authoring doesn't count here
4. The channel lock (`data/<channel>/growth/.autoproduce.lock`) can be taken —
   if not, the other platform's loop is authoring, so just move on

On pass, Read `${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/SKILL.md` and **follow
the unattended-mode procedure as written**. Pass the metric read in §2
(`averageViewPercentage`) as the tier-judgment input — the judgment is a trend
(if the last 3 episodes' average worsened 5%p or more against the previous 3,
promote the cover to motion). Under 6 published episodes, no promotion
(source of truth: autoproduce `references/cost-tiers.md`).

**On authoring success, stamp every platform queue in the plan's
`autoproduce.mark_queues`.** One 9:16 master goes out to both platforms — build
per platform and the cost doubles while the same channel posts a different
video on each platform. But stamp **approved platforms only** — only when that
platform's `growth-plan.md` exists with `status: approved`. A missing standing
authorization is not ours to write on its owner's behalf.

Authoring takes minutes (longer with Veo). A long tick is normal, and once
authoring finishes it proceeds straight into §3 — **publishing can happen
within the same tick**.

On failure, it depends on where it fell. Failed at the research gate: drop the
topic (leave no files) and move to the next candidate, but after two drops give
up authoring for this tick. Built the video and then failed a quality gate:
leave it at `queue: hold` and **never rebuild the same topic** — repeated
failure just burns money.

**However it ends, record the cost spent so far in `autoproduce.json`.** Count
without the failures and a channel that keeps failing gates spends the budget
without limit. Today's authoring count also includes successes and failures
together. Reasons go in growth-log and the report.

### 3. Slot publishing (queue drain)

Scan the queue only when today has a slot whose **time already passed · within
3 hours of it · not in `filledSlots[today]`** (if several, the earliest one).
Slots more than 3 hours past are skipped (prevents the accident where a loop
that was off all day dumps the morning slot at night).

Queue candidates are the `data/<channel>/episodes/*/storyboard/storyboard.md`
whose frontmatter `status` is `produced` **or** `published` with `queue: ready`,
and whose topic isn't in `state.publishedTopics`. If several, the one with the
oldest `queue_at` (file mtime if absent).

**Not excluding `published` matters.** `status` is a single field with no
platform dimension; when the same topic is queued on several platforms and
another path (the publish skill, or a human publishing an episode
grow-instagram marked) goes out first, the value flips to `published`. Accept
only `produced` and at that moment the topic is **silently dropped from the
YouTube-side candidates with no error** — `queue: ready` still in place. With
autoproduce stamping both platform queues as the default path, this situation
became common. What prevents double publishing is not `status` but the `queue`
marker, `state.publishedTopics`, and the publish-log check below.

Pre-publish checks — first, **look for an existing YOUTUBE row in
`output/publish-log.md`.** If present, the topic already went out via the
publish skill: don't publish, clean up to `queue: done`, and report
(`state.publishedTopics` holds only what this loop published, so it can't block
what a human published). Then check that `output/video/video.mp4` (**the clean
master without subtitles**) and `output/youtube/meta.md` exist, that
`output/video/cover.jpg` exists (without it an arbitrary frame becomes the
thumbnail — report to the user and skip), and that `output/video/subs.srt`
exists. **No subtitle file, no publish — report it** — subtitles upload
separately from the video by principle (publish skill rule 8), and fixing a
video that went out without them means uploading the file later by hand. An
old build needs a rebuild via `/social-flow:produce`.

`youtube_publish(channel, videoFilePath, title, caption, thumbnailFilePath, captionFilePath)` —
`captionFilePath` is the local `output/video/subs.srt` path.
Don't set `containsSyntheticMedia` (defaults true). If the response carries
`captionWarning`, **the publish succeeded** — don't republish; put the warning
in the tick report (the most common cause is a token missing the
`youtube.force-ssl` scope). On success:

- Update storyboard.md frontmatter to `status: published`, `queue: done`
- Record the permalink in `output/publish-log.md` (same format as the publish
  skill)
- Record in state's `filledSlots` and `publishedTopics`
- **Put the videoId into `pendingRelatedVideo`** — Related video can't be set
  via the API. Put "needs the long-form linked at Studio > Content > that
  Short > Related video" in the tick report so a human handles it (playbook
  §Funnel).
- **Set the Shorts vertical-surface frame** — `thumbnailFilePath` changes only
  the landscape surface; the vertical frame in the Shorts feed and the
  channel's Shorts tab changes only through the YouTube app's frame picker
  (publish skill `references/shorts-surface-adb.md`). If the channel's
  dedicated AVD (profile.md §4) is still logged in on its snapshot, the tick
  runs it directly and confirms `oardefault.jpg` 200. If the emulator is
  missing or logged out, **don't halt the loop** — write the videoId and the
  hold reason into growth-log and the tick report for a human (the frame picker
  is unstable for ~5 minutes after upload, so deferring to the next tick is
  fine).

On failure, don't record filledSlots and **don't retry within this tick**
either (the next tick retries the same slot). Write the failure reason in
growth-log. A `thumbnailWarning` means the publish succeeded, so don't
re-upload — report the warning only.

### 4. Save and report

Save `state.json` (update lastTickAt) → append one tick-summary line to
growth-log.md → one report line to the user:
`[tick hh:mm] replies n · authored n($x, tier) · published n(slot) · subscribers ±n · Related pending n`.
A tick with no actions logs "observation only" — quiet ticks are normal.

## status — state report

Summarize from state.json + the last 20 lines of growth-log.md + one
`youtube_insights` call: subscriber and view trends, publishes in the last
7 days, the top 3 reach videos with average view percentage, topics left in the
queue, the next slot, and the list of unset Related videos. No publishing.
If autoproduce is on, also report from `autoproduce.json`: today's and this
week's spend against the caps, the topic-pool level, and the topics stuck at
`queue: hold` — hold never publishes until a human looks, so without this
reminder they're forgotten.

## Error handling (the loop keeps running)

- **Scope error** (with the reissue guide) → skip just that stage and put the
  guide in the tick summary. If it repeats next tick, recommend stopping the
  loop. The read and comment scopes are separate, so one side can be blocked
  alone.
- **Quota exceeded** — Data API 10,000 units/day; uploads have a separate
  bucket (100/day). The inbox spends units proportional to video count (1–2
  per video), so lower `postLimit` and resume.
- **Comments-disabled video** → 403 is normal and arrives only as
  `commentsError` (ignore).
- **Token expired or revoked** → all publishing is blocked, so recommend
  stopping the loop and walk through the token-setup.md renewal steps. A
  YouTube refresh_token issued after production publishing is near-permanent,
  but one issued in testing mode expires in 7 days.
