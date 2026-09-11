---
name: grow-youtube
description: >
  Runs one autonomous YouTube Shorts growth tick — reply, measure, refill, publish, then
  watch what spreads. Use when the user asks to "유튜브 키워", "쇼츠 성장 루프", "유튜브 성장 틱",
  "grow the YouTube channel", or wants the growth loop running. One tick replies to inbox
  comments (golden hour first), snapshots channel and video analytics, refills the publish
  queue by authoring a new short end to end through autoproduce when it runs dry, publishes
  queue-marked videos in the plan's slots, and samples a fresh video's live view counter to
  see whether it is breaking out — all inside the standing authorization in
  data/[channel]/growth/youtube/growth-plan.md. Recur with /loop [interval]
  /social-flow:grow-youtube [channel]. First run needs the init argument.
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
  "mcp__social-flow__mlx_image_generate", "mcp__social-flow__mlx_image_edit",
  "mcp__social-flow__tts_local_generate", "mcp__social-flow__tts_generate", "mcp__social-flow__tts_elevenlabs_generate", "mcp__social-flow__tts_elevenlabs_dialogue",
  "mcp__social-flow__tts_list_voices", "mcp__social-flow__mlx_tts_generate",
  "mcp__social-flow__veo_img2video",
  "mcp__social-flow__music_generate_clip", "mcp__social-flow__mlx_music_generate"]
---

# YouTube growth loop — one autonomous tick

Growth skills are **split per platform** (same skeleton as grow-threads:
plan = standing authorization · tick ≠ publish · idempotent state). State paths
are scoped under `growth/youtube/`.

```
/social-flow:grow-youtube <channel> init       # once — fix the plan (HITL)
/loop 1h /social-flow:grow-youtube <channel>   # resting cadence
/loop 15m /social-flow:grow-youtube <channel>  # while a fresh video is under watch (§2b)
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

**Hourly is the resting cadence** — slot publishing and comment replies both
live fine at that resolution, and authoring only happens when the queue is
empty anyway. **The velocity watch is the one thing that hourly can't hold.**
The tick samples a video's view counter only as often as the tick runs, so a
watch left on `/loop 1h` produces hourly readings and the first-hour shape —
the part that says whether this one is going anywhere — never gets recorded.
While `state.watching` holds a video, run the loop at 15 or 30 minutes, then
put it back. What that costs in quota is under §Error handling — the watch adds
almost nothing; the inbox is what scales with the interval.

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
8. **Don't edit a video while it's spreading** — while a videoId sits in
   `state.watching`, none of its metadata changes: no `youtube_update` on
   title, description, tags or privacy, no thumbnail re-upload, no caption
   re-upload. The certain cost is measurement — change the title mid-window and
   the later samples belong to a different video than the earlier ones, so the
   candidate rule compares two things. Whether an edit also resets the promotion
   itself is creator lore nobody has verified; that it can't be ruled out is
   reason enough to wait a few hours. Fixes wait until the window closes, and a
   factual error is the only exception — that one goes to the user first. **The
   Shorts vertical frame is not an edit** — it's publish work that was never
   finished (§3), so a deferred frame picker still runs inside the window.
9. **One push, one video** — external traffic goes to at most one breakout
   candidate at a time, and only to a platform whose own `growth-plan.md` is
   approved **and** carries the cross-platform push clause. This loop never
   publishes on another platform itself. It writes the candidate to the
   channel-shared handoff and that platform's own loop decides whether to
   write a post (§2b).

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
- **Spreading a breakout by hand.** No self-promotion in other channels'
  comment sections, no reply-bait, and no putting the same push copy on two
  platforms — automatic cross-posting is banned plugin-wide (platform-guide
  §Core principles 1), so a push post is written for the one platform it goes
  out on. This loop's whole part in a push is naming the candidate.

## File layout (all local — data/ is not committed)

```
data/<channel slug>/growth/
├── youtube/
│   ├── growth-plan.md   # standing authorization (init writes it via HITL, status: approved)
│   ├── state.json       # state carried across ticks (the basis for double-publish prevention)
│   └── growth-log.md    # one line per tick + metric deltas (observation ledger)
├── autoproduce.json     # channel-shared — authoring budget and history (shared with the Instagram loop)
├── .autoproduce.lock/   # channel-shared lock — keeps the two loops from authoring at once
└── breakout.json        # channel-shared — the breakout candidate this loop hands to the Threads loop
```

**The last three are channel-shared** (not split per platform). One video goes
out to both platforms, so budget and lock must be channel-level too — count per
platform and the caps leak double; lock per platform and the lock stops nothing.
`breakout.json` is channel-shared for the same reason: the YouTube tick writes
the candidate and the Threads tick reads it, so it can't live under
`growth/youtube/`. **Only this loop writes it** — the Threads loop reads it and
records its push in its own `growth/threads/state.json`, so no second lock is
needed the way autoproduce.json needs one. To report pushes, read that file;
never write it.

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

   **The breakout watch and the push are asked together, and separately from
   the rest** — the watch only observes, but the push spends a second
   platform's authorization. Ask: the sampling interval
   (`velocity_watch_minutes`, default 30; 0 turns the watch off), how long a
   window stays open (default 6 hours), how many earlier watched episodes have
   to sit on the ledger before any verdict is allowed (default 5), the margin
   over that baseline that makes a candidate (default twice the median at the
   same age), which platforms may be pushed (offer only platforms whose
   `growth-plan.md` is approved — no platform at all is a fine answer). How many
   pushes a candidate gets is not asked: it is one post per target, and that
   target's loop never posts about the same video twice. Two things get said out
   loud here: the watch needs the `/loop` interval shortened for as long as a
   window is open, and a named push target still publishes nothing until that
   platform's own plan gains its push clause.
4. Write `growth-plan.md` from the template, **show the full text and get
   explicit approval**, then save with `status: approved`. Always state:
   *"This plan is the standing authorization — the loop publishes videos stamped
   `queue: ready` publicly in their slots with no per-publish approval, and
   replies to incoming comments on its own. Stop by stopping /loop; change scope
   by editing the plan."* If autoproduce is on, add one line: *"When the queue
   runs dry, the loop picks a topic and builds a video itself, and if it passes
   machine verification it publishes before a human sees it. It stays within
   N episodes/day and $X per episode."* If a push target was named, add one
   more: *"When a fresh video's view count runs ahead of this channel's own
   recent episodes, the loop writes it down as a breakout candidate, and the
   <platform> loop publishes one post pointing at it with no per-post
   approval — once you've added the push clause to that platform's plan."*
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

**Both gates run before the reply goes out** — the machine style check
(`check-style.py --surface reply`) and then the growth-post-reviewer agent, batched once
per tick. Only copy with score ≥95 and p0=0 gets sent, fixes are by deletion only, and a
reply that hasn't cleared in 3 rounds is skipped and logged. The contract, the exact
command, and what to attach per platform: [reply-gate.md](../platform-guide/references/reply-gate.md).

YouTube's row in that table: attach the original comment and **the title and description
of our video** it was left on.

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

**The lag covers half the response, not all of it.** Everything Analytics
serves — the channel `metrics` block, each video's `period` block,
`averageViewPercentage`, `engagedViews`, `shares` — runs 2–3 days behind and
has day granularity at best. Two blocks come from the Data API's public
counters with no lag: each video's `lifetime` (`views` · `likes` ·
`comments`) and the channel `account`, where `subscriberCount` lives. So the
subscriber delta above is a live read and the view trend a lagged one; §2b
samples live `lifetime` too. Never compare a live number with a lagged one.

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

### 2b. Velocity watch (only while a video is under watch)

Skip this stage whole when `state.watching` is empty or the plan's
`velocity_watch_minutes` is 0.

**It costs no extra call.** §2 already fetched the videos array, so a sample is
just a read of the watched videoId's entry in that same response: take
`lifetime.views`, `lifetime.likes`, `lifetime.comments`, stamp the current
time, and append the four scalars to that watch entry's `samples` (the whole
response never goes into state — absolute rule 5). Keep `videoLimit` at 10 or
higher so a video published a few uploads ago is still in the list.

**If the response carries `videosError`, write no sample.** An empty videos
array can mean the lookup failed, and a zero written into the ledger is worse
than a gap — the candidate rule medians over these numbers later.

**What can and can't be watched.** `lifetime` is a cached public counter: it
coarsens, and on a fresh low-count video it can sit still for a stretch. A flat
reading is not evidence of a dead video. So no verdict comes from one sample —
a rise has to hold across two in a row. And **share velocity does not exist
here**: `shares` is an Analytics metric, 2–3 days behind, so nothing in the
first hours can be judged on sharing. Don't substitute another number for it
and don't call likes a proxy for it.

**Breakout candidate — the rule, and why it has no absolute number.** A watched
video is a candidate when all three hold:

1. **A baseline exists** — at least the plan's baseline count (default 5) of
   earlier watched episodes have a growth-log reading at about the same age
   (within one sampling interval).
2. **It is ahead of that baseline** — its views at that age are at or above the
   plan's margin (default twice) the median of those readings.
3. **The lead held** — two consecutive samples, not one jump off a counter that
   had been frozen.

Under the baseline count there is **no verdict** — sample, log, and say
"calibrating" in the report. That period is the point: this channel's own
ledger is the only source for what "ahead" means here, and no published number
exists to borrow (playbook §Velocity and the one-video push). Nothing about
this is machine-checked.

**On a candidate**, append it to `data/<channel>/growth/breakout.json` —
`{ videoId, topic, permalink, publishedAt, declaredAt, samples: [...], pushTargets: [...] }`,
where `pushTargets` copies the plan's push targets and is empty when the plan
names none. Empty targets still get written: the record is the point. Then
report it, and leave the pushing to the target platform's own loop (absolute
rule 9).

**When the window closes** (the plan's window length past `publishedAt`), drop
the entry from `state.watching` and write one closing line into growth-log with
the final reading and the verdict. Absolute rule 8's edit freeze lifts at the
same moment, so anything held for it goes into the tick report.

### 2.5 Queue refill — autoproduce (only when the plan turned it on)

If the plan isn't `autoproduce.enabled: true`, skip this stage whole.

**A watch also holds authoring.** While `state.watching` has an open window,
author nothing — an autoproduce run takes minutes to tens of minutes and eats
the next sample or two, which is exactly the stretch the candidate rule needs.
The queue-empty line will then repeat in every tick of the window; that's
expected, not a problem to fix. Authoring resumes when the window closes.

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

**An open watch does not hold a slot.** Only authoring pauses (§2.5), and for a
timing reason rather than a distribution one: each Short is evaluated on its own
and upload frequency is not a ranking input (playbook §Principle), so a second
video published during a watch takes nothing away from the one being watched.
Holding slots would also strand them — a slot pushed past the 3-hour rule is
gone for the day.

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
- **Open the velocity watch** — append
  `{ videoId, topic, publishedAt, samples: [], verdict: null }` to
  `state.watching`, `publishedAt` off our own clock (`youtube_publish` returns
  the videoId and the permalink but no publish time). Take t0 here rather than
  at the next tick, with one extra
  `youtube_insights(channel, days: 7, videoLimit: 3)` — §2's response was
  fetched before this upload existed, so the video isn't in it. If the upload
  hasn't reached the uploads playlist yet, leave `samples` empty and let the
  next tick take the first reading; a zero written now would sit in the ledger
  as a real number (§2b). Skip the bullet whole when the plan's
  `velocity_watch_minutes` is 0. From this point the video's metadata is frozen
  (absolute rule 8) — the vertical frame above is the one thing still allowed
  to finish. Put in the report that the watch wants a shorter `/loop` interval
  for as long as the window is open.

On failure, don't record filledSlots and **don't retry within this tick**
either (the next tick retries the same slot). Write the failure reason in
growth-log. A `thumbnailWarning` means the publish succeeded, so don't
re-upload — report the warning only.

### 4. Save and report

Save `state.json` (update lastTickAt) → append one tick-summary line to
growth-log.md → one report line to the user:
`[tick hh:mm] replies n · authored n($x, tier) · published n(slot) · subscribers ±n · Related pending n · watch <videoId> +N/30m · candidate yes|no|calibrating · pushed n`.
The watch fields only appear while a window is open, and `pushed` is read out
of the Threads loop's state (this loop never writes it). A tick with no actions
logs "observation only" — quiet ticks are normal, and a tick that only took a
sample is one of them.

## status — state report

Summarize from state.json + the last 20 lines of growth-log.md + one
`youtube_insights` call: subscriber and view trends, publishes in the last
7 days, the top 3 reach videos with average view percentage, topics left in the
queue, the next slot, and the list of unset Related videos. No publishing.
If autoproduce is on, also report from `autoproduce.json`: today's and this
week's spend against the caps, the topic-pool level, and the topics stuck at
`queue: hold` — hold never publishes until a human looks, so without this
reminder they're forgotten.
Report the watch side too: open watches with their elapsed time and last
reading, candidates in `breakout.json` that no push has picked up, and the
pushes of the last 7 days with their platform (read from the target loop's
state). An open watch nobody drains is forgotten state, same as a `queue: hold`.
Leave `videoLimit` at its default of 10 here — don't lower it, or a watched video that
has slipped down the uploads list drops out of the response.

## Error handling (the loop keeps running)

- **Scope error** (with the reissue guide) → skip just that stage and put the
  guide in the tick summary. If it repeats next tick, recommend stopping the
  loop. The read and comment scopes are separate, so one side can be blocked
  alone.
- **Quota exceeded** — Data API 10,000 units/day; uploads have a separate
  bucket (100/day). The inbox spends units proportional to video count (1–2
  per video), so lower `postLimit` and resume. **The watch itself is nearly
  free** — §2b reads the response §2 already paid for, and that call costs 3
  units (channels.list → playlistItems.list → videos.list), so four times an
  hour stays under 300 units a day; the t0 read in §3 adds 3 more per publish.
  What a shortened interval multiplies is the inbox, which scales with video
  count. At a large `postLimit` that quadrupling is what runs the budget out —
  lower `postLimit` for the length of the window rather than dropping §1, since
  golden-hour replies outrank the watch.
- **Comments-disabled video** → 403 is normal and arrives only as
  `commentsError` (ignore).
- **Token expired or revoked** → all publishing is blocked, so recommend
  stopping the loop and walk through the token-setup.md renewal steps. A
  YouTube refresh_token issued after production publishing is near-permanent,
  but one issued in testing mode expires in 7 days.
