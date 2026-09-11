# growth-plan.md template + state.json schema (YouTube)

init writes this via HITL. Without `status: approved`, grow-youtube doesn't
publish. Path: `data/<channel>/growth/youtube/` — growth skills are split per
platform, so each platform uses its own subdirectory.
After editing the plan, get user approval again and return it to approved.

```markdown
---
channel: my-channel
status: approved            # draft | approved — only approved allows autonomous publishing
approved_at: 2026-08-11
tone: 존댓말                # comment-reply tone — 존댓말 (polite) or 반말 (casual), inherited from profile.md
slots: ["09:00", "21:00"]   # 1–3 publish slots (local time, the target's active hours)
queue_rule: "status: produced|published + queue: ready"   # queue eligibility (default)
ai_disclosure: always       # always | per-topic — with always the loop never turns disclosure off
velocity_watch_minutes: 30  # sampling interval for a fresh video's view counter (0 = no watch) — see §Breakout
autoproduce:                # when the queue runs dry the loop authors directly (off by default)
  enabled: false            # turning this true widens the loop's authority from publishing to authoring
  topic_source: pool        # pool (approved list) | keywords (Naver 지식iN) | scout (market-keywords.md)
  min_queue: 1              # author only when the ready level is below this
  daily_produce_cap: 1      # this plan's episodes per day (success+failure combined, cap 2 — per-platform hard cap)
  duplicate_threshold: 0.5  # duplicate-verdict threshold (check-duplicate.py) — raise only for series channels
  max_cost_per_video: 1.00  # USD — passes the economy baseline ($0.27–0.29) and one lite b-roll promotion ($0.91–0.93); with a hook on the mini grade below the promotion needs 1.50, on 2.0 1080p 3.70
  daily_cost_cap: 2.00      # USD — two economy episodes with one promotion, or one episode with a mini hook and a promotion; a single episode must fit under it
  previz_renderer: threejs  # threejs | blender — the standing answer to PRODUCTION.previz (every generated cut is a 3D previz cut); absent = the loop plans no generated cut
  video_model: "dreamina-seedance-2-0-mini-260615 720p"   # a Seedance 2.x grade + resolution, the standing answer to PRODUCTION.videoModel (video-model-options.js prices the grades); absent = no generated cut
  weekly_cap: 7.00          # USD
  mark_queues: ["youtube"]  # queues to stamp on authoring success — only platforms with an approved growth plan
---

# <channel name> YouTube growth plan

## Publish queue rule

Only topics whose `data/<channel>/episodes/<topic>/storyboard/storyboard.md`
frontmatter `status` is `produced` **or** `published` with `queue: ready` are
autonomous publish targets. produced alone doesn't go out — "production
finished" and "cleared to post" are different things.
Don't drop `published` — `status` is a single field with no platform dimension,
so when the same topic is queued on Instagram too and that side goes out first,
it flips to `published` and silently vanishes from the YouTube candidates.
Double publishing is prevented by the `queue` marker and the publish-log check.

How to queue: add two lines to the storyboard.md frontmatter (with autoproduce
on, the loop writes the same two lines itself).

```yaml
queue: ready
queue_at: 2026-08-11        # oldest goes first when there are several (file mtime if omitted)
```

## Autoproduce

With `enabled: false` this section may as well not exist — only humans fill the
queue. If it's on, what follows is authoring's scope and its limits.

**Topics come only from here.** With `topic_source: pool`, use the unused
entries in the list below, oldest first. **When it's empty, the loop stops
authoring and reports — it doesn't invent topics.** Switch to `keywords` and it
digs material out of Naver 지식iN questions with the keywords below; that raises
subject risk, so revisit the forbidden-subjects list first. `scout` uses the
**chosen topics** in `data/<channel>/growth/keywords/market-keywords.md` (or
from the top of the topic-phrase table if none were chosen). If the file is
missing or more than 14 days old, don't author — point to
`/social-flow:topic-scout <channel>` instead. No videos from stale market
research.

```yaml
topic_pool:
  - "Vietnam temporary-residence registration steps"
  - "when the visa fee increase lands"
topic_keywords: ["Vietnam visa", "expat paperwork"]   # only with topic_source: keywords
```

- **Cost** — per-episode cap `max_cost_per_video`; daily and weekly totals
  accrue in the channel-shared `data/<channel>/growth/autoproduce.json`. The
  ladder and promotion conditions: `skills/autoproduce/references/cost-tiers.md`
  is the source of truth.
- **Quality** — only episodes that pass every machine gate (fact check, style,
  storyboard-review copy, images, build report, content-reviewer P0, cost)
  become `queue: ready`; one failure leaves `queue: hold`, waiting for a human.
- **Duplicates** — before authoring, `check-duplicate.py` compares the candidate
  against all of the channel's existing topics. A different slug but the same
  story reworded drops the candidate (threshold `duplicate_threshold`,
  default 0.5).
- **Episode count** — this plan authors at most **2 per day** (per-platform hard
  cap, success and failure included). `daily_produce_cap` can only go down
  within it. The Instagram plan carries its own cap, so with both on, the
  channel can build up to 4 a day — the cost cap (`daily_cost_cap`) is
  channel-total, and that's what squeezes the volume.
- **Queues stamped together** — the platforms in `mark_queues`. One video goes
  out to both platforms, so adding `instagram` here makes the Instagram loop
  publish the same episode. **Only add a platform whose growth-plan.md is
  approved.**

## Comment-reply scope

- Reply to: questions, impressions, added information, error reports
- Don't reply (report only): spam/ads, hate/put-downs, bait and provocation,
  exposed personal data
- When unsure, don't reply; raise it in the next tick summary

## Forbidden subjects (never publish without a plan update)

- Politics, religion, disparaging any nationality
- Unverified policy or regulation info (effective dates and amounts only after
  the storyboard pipeline's verification)

## AI disclosure policy

Default `always` — `containsSyntheticMedia` stays on. This channel's videos use
Veo and Lyria, so they're in disclosure scope, and disclosure costs nothing in
exposure or revenue.
If a topic ever falls entirely under the exemptions (script, subtitles, cloning
your own voice, unrealistic animation only), write that topic here as an
exception and the user decides directly.

## Related video policy

A human links it in Studio after publishing (no API support). Default link
target: <the long-form video or the series' flagship video>. With no target,
leave it empty and the loop's reminders can be ignored.

## Breakout — the velocity watch and the one-video push

`velocity_watch_minutes` sets the sampling interval (default 30; 0 turns the
watch off). Samples land only when a tick runs, so the `/loop` interval has to
come down to match for as long as a window is open — on an hourly loop the
readings are hourly whatever this number says.

**What is sampled**: each watched video's `lifetime.views` · `likes` ·
`comments`, the Data API's public counter, read out of the `youtube_insights`
response the tick already fetched. No extra call and no lag.

**What can't be**: everything Analytics serves — `shares`,
`averageViewPercentage`, `engagedViews`, the whole `period` block — runs 2–3
days behind at day granularity. **Sharing is not observable in the first
hours.** Sharing gets judged in the weekly summary and never in a same-day
rule.

- **Window** — 6 hours from publish.
- **Baseline** — 5 earlier watched episodes with a growth-log reading at about
  the same age. Below that count the loop samples and declares nothing.
- **Candidate** — views at that age at or above **2×** the baseline median,
  and the lead holding across two consecutive samples. The 2× is a starting
  placeholder, not a measured line: no public number exists for it and this
  channel has none yet, so read the first weeks off the growth-log ledger and
  write the real one here.
- **Edit freeze** — while a window is open the video's title, description,
  tags, thumbnail, captions and privacy stay as published. The Shorts vertical
  frame is exempt; it's unfinished publish work rather than an edit.

```yaml
push_targets: []            # platforms allowed to push a candidate — [] means the loop only records it
```

**A platform listed here still publishes nothing by itself.** The push post
goes out from that platform's own growth loop under that platform's plan, so
the target plan needs its own push clause first (Threads:
`skills/grow-threads/references/growth-plan-template.md` §Cross-platform push).
Only list a platform whose `growth-plan.md` is approved — a missing standing
authorization is not ours to write on its owner's behalf. There is no count to
set: a candidate gets one post per target, and the target loop records that
push in its own state so it never posts about the same video again.

The handoff is `data/<channel>/growth/breakout.json`, channel-shared and
written only by the YouTube loop.

**None of this is machine-checked.** No checker reads growth-plan.md,
state.json or growth-log.md. The watch, the candidate rule, the push targets
and the edit freeze hold only as far as the loop reads these lines.
```

**Keys absent from an older plan** — `velocity_watch_minutes` missing means 30,
and no `## Breakout` section means no push targets. A plan written before this
section keeps working unchanged: the loop must not error on it, and it never
gains a push target by default.

## state.json — state carried across ticks

This file is the basis for double-publish prevention. Read it every tick, save
at the end. If a date key isn't today, reset that bucket. Don't store raw API
responses.

```json
{
  "channel": "my-channel",
  "lastTickAt": "2026-08-11T09:30:00+09:00",
  "filledSlots": { "2026-08-11": ["09:00"] },
  "publishedTopics": ["20260811-visa-fee"],
  "pendingRelatedVideo": [
    { "videoId": "abc123", "topic": "20260811-visa-fee", "publishedAt": "2026-08-11T09:02:00+09:00" }
  ],
  "watching": [
    {
      "videoId": "abc123",
      "topic": "20260811-visa-fee",
      "publishedAt": "2026-08-11T09:02:00+09:00",
      "samples": [{ "at": "2026-08-11T09:02:00+09:00", "views": 4, "likes": 0, "comments": 0 }],
      "verdict": null
    }
  ],
  "lastInsights": {
    "capturedAt": "2026-08-11T09:30:00+09:00",
    "subscriberCount": 412,
    "subscriberCountHidden": false,
    "views7d": 18400,
    "engagedViews7d": 11200,
    "averageViewPercentage7d": 71.3,
    "topVideo": { "videoId": "abc123", "views": 8200, "averageViewPercentage": 88.1 }
  }
}
```

- `filledSlots` — recorded only on publish success. A failed slot is retried by
  the next tick.
- `publishedTopics` — published topic slugs. **The last line of defense against
  re-uploading the same video.** It doubles storyboard.md's `status: published`
  because if the file write fails, the surviving state still blocks the
  duplicate. Keep the latest 200.
- `pendingRelatedVideo` — videos whose Related video isn't linked in Studio
  yet. Remove an entry when the user says it's handled. Entries older than
  30 days are dropped automatically.
- `watching` — videos inside their velocity window (§Breakout). Each sample is
  the four scalars only, never the API response (absolute rule 5). Drop the
  entry when the window closes, after writing its closing reading and verdict
  into growth-log — the log is what the next episode's baseline is medianed
  from, not this file. A window is 6 hours at a 30-minute interval, so a full
  entry holds about a dozen samples.
- `lastInsights` — the baseline for the next tick's delta. Because Analytics
  lags 2–3 days, day-level comparison is meaningless, so 7-day-window values
  are stored. That reasoning covers the Analytics half only: the samples in
  `watching` come from the Data API counter, which isn't lagged, and
  minute-level comparison works there and nowhere else in this file.
- Pushes are **not** stored here. The Threads loop publishes them and records
  them in its own `growth/threads/state.json`; this loop reads that file for
  reporting and never writes it.

## autoproduce.json — channel-shared authoring budget and history

`data/<channel>/growth/autoproduce.json` is **channel-shared**, not
per-platform — one video goes out to both platforms. The schema and lock
protocol: `skills/autoproduce/SKILL.md` §0 is the source of truth — not copied
here. Both growth loops write the same file, so read→author→write happens
entirely inside the lock.

## growth-log.md — observation ledger (append only)

```markdown
# <channel name> YouTube growth log

| time | replies | authored | published | subscribers | avg view % | velocity | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 08-11 09:30 | 3 | - | 1(09:00) | 412(+7) | 71.3% | abc123 t0 4 | visa-fee episode top reach · Related unlinked |
| 08-11 10:00 | 0 | - | 0 | - | - | abc123 +38/30m | age 30m · baseline 3/5, calibrating |
| 08-11 10:30 | 0 | 1($0.05 economy) | 0 | - | - | - | queue 0 → autoproduce |
| 08-11 11:30 | 0 | - | 0 | - | - | - | observation only |
```

The `velocity` column is the ledger the candidate rule medians over, so it
keeps a fixed shape — `<videoId> +N/<interval>` for a sample, `<videoId> t0 N`
for the first one, `-` for a tick that took none. The age and the verdict go in
notes.

Once a week (Monday's first tick) add a summary line: the weekly 5 metrics
(engagedViews · average view percentage · subscriber delta · per-video view
distribution · shares) + one line on the top-reach video types, plus any pushes
made and what moved after them. Shares sit in the weekly line and nowhere
faster: the number is Analytics and lags 2–3 days.
