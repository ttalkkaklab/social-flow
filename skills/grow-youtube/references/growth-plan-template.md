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
daily_caps:
  publishes: 2              # = slot count (cap 3)
queue_rule: "status: produced|published + queue: ready"   # queue eligibility (default)
ai_disclosure: always       # always | per-topic — with always the loop never turns disclosure off
autoproduce:                # when the queue runs dry the loop authors directly (off by default)
  enabled: false            # turning this true widens the loop's authority from publishing to authoring
  topic_source: pool        # pool (approved list) | keywords (Naver 지식iN) | scout (market-keywords.md)
  min_queue: 1              # author only when the ready level is below this
  daily_produce_cap: 1      # this plan's episodes per day (success+failure combined, cap 2 — per-platform hard cap)
  duplicate_threshold: 0.5  # duplicate-verdict threshold (check-duplicate.py) — raise only for series channels
  max_cost_per_video: 0.30  # USD — the lite promotion passes; fast and standard are blocked
  daily_cost_cap: 0.60      # USD
  weekly_cap: 2.00          # USD
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
```

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
- `lastInsights` — the baseline for the next tick's delta. Because Analytics
  lags 2–3 days, day-level comparison is meaningless, so 7-day-window values
  are stored.

## autoproduce.json — channel-shared authoring budget and history

`data/<channel>/growth/autoproduce.json` is **channel-shared**, not
per-platform — one video goes out to both platforms. The schema and lock
protocol: `skills/autoproduce/SKILL.md` §0 is the source of truth — not copied
here. Both growth loops write the same file, so read→author→write happens
entirely inside the lock.

## growth-log.md — observation ledger (append only)

```markdown
# <channel name> YouTube growth log

| time | replies | authored | published | subscribers | avg view % | notes |
| --- | --- | --- | --- | --- | --- | --- |
| 08-11 09:30 | 3 | - | 1(09:00) | 412(+7) | 71.3% | visa-fee episode top reach · Related unlinked |
| 08-11 10:30 | 0 | 1($0.05 economy) | 0 | - | - | queue 0 → autoproduce |
| 08-11 11:30 | 0 | - | 0 | - | - | observation only |
```

Once a week (Monday's first tick) add a summary line: the weekly 4 metrics
(engagedViews · average view percentage · subscriber delta · per-video view
distribution) + one line on the top-reach video types.
