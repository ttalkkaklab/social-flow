# growth-plan.md template + state.json schema (Instagram)

init writes this via HITL. Without `status: approved`, grow-instagram doesn't
publish. Path: `data/<channel>/growth/instagram/` — growth skills are split per
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
weekly_target: 4            # weekly publish target 3–5 (Buffer's measured balance point — a target, not a cap)
queue_rule: "status: produced|published + queue_instagram: ready + public URL resolvable"
media_hosting: base_url     # base_url | staged | off — with off the loop doesn't publish
media_base_url: "https://cdn.example.com/social-flow"
account_status_check: weekly   # cadence for the app's Account Status check (no API — a human checks)
autoproduce:                # when the queue runs dry the loop authors directly (off by default)
  enabled: false            # turning this true widens the loop's authority from publishing to authoring
  topic_source: pool        # pool (from the approved list) | keywords (dug from Naver 지식iN questions)
  min_queue: 1              # author only when the ready level is below this
  daily_produce_cap: 1      # this plan's episodes per day (success+failure combined, cap 2 — per-platform hard cap)
  duplicate_threshold: 0.5  # duplicate-verdict threshold (check-duplicate.py) — raise only for series channels
  max_cost_per_video: 1.00  # USD — passes the economy baseline with the hook motion background (~$0.61 seedance · ~$0.90 veo lite); the lite b-roll promotion needs 1.60
  daily_cost_cap: 2.00      # USD — two episodes at the veo-lite worst case; a single episode must fit under it
  weekly_cap: 7.00          # USD
  mark_queues: ["instagram"]  # queues to stamp on authoring success — only platforms with an approved growth plan
---

# <channel name> Instagram growth plan

## Media hosting (the precondition for publishing)

`instagram_publish`'s `videoUrl` must be a **publicly reachable HTTPS URL**.
The platform crawls it directly, so local paths and authenticated URLs don't
work. The loop can't produce this URL by itself, so pick one of three.

**The file to serve is the subtitle burn-in build (`video-sub.mp4`).** Other
platforms take the subtitles as a separate file, but the IG container has no
subtitle parameter — upload the clean master (`video.mp4`) and the subtitles
vanish entirely. The builder cuts both from the same source; just pick the
right one for hosting.

- **`base_url`** — stable hosting exists. The URL is built deterministically
  as `<media_base_url>/<topic slug>/video-sub.mp4`. Putting the file there is
  a human's job.
- **`staged`** — the human queuing the topic writes `video_url:` directly in
  the storyboard.md frontmatter. URLs may differ per topic but **must point at
  the burn-in build**.
- **`off`** — no stable hosting (temporary tunnels, etc.). **The loop doesn't
  publish**; it handles the inbox and observes metrics only, and puts the
  queue level in the tick report. Publishing is done by a human via
  `/social-flow:publish`.

> The loop never stands up a tunnel itself. Temporary tunnels pair with the
> publish skill's teardown verification (confirming serving stopped), and an
> autonomous loop has no one to run that procedure.

## Publish queue rule

Only topics whose `data/<channel>/episodes/<topic>/storyboard/storyboard.md`
frontmatter `status` is `produced` **or** `published` with
`queue_instagram: ready` are autonomous publish targets. Don't drop
`published` — `status` is a single field with no platform dimension, so when
the same topic is queued on YouTube too and that side goes out first, it flips
to `published` and silently vanishes from the Instagram candidates.

How to queue — add to the storyboard.md frontmatter.

```yaml
queue_instagram: ready
queue_at: 2026-08-11        # oldest goes first when there are several (file mtime if omitted)
video_url: https://…/video-sub.mp4   # only with media_hosting: staged (subtitle burn-in build)
```

**Why the marker is `queue_instagram:`, not `queue:`** — `queue:` is
grow-youtube's marker. If both loops read the same key, whichever runs first
flips it to `queue: done` and the other never publishes. For the same reason,
grow-instagram never touches `status:` **as a publish result** (flipping it to
`status: published` erases the YouTube queue eligibility). The fact of an
Instagram publish is recorded only in `queue_instagram: done` and
publish-log.md.
Autoproduce writing `status: produced` while creating a topic that didn't
exist is production-stage work — the exception. `produced` satisfies both
loops' queue eligibility.

## Autoproduce

With `enabled: false` this section may as well not exist — only humans fill
the queue. **It doesn't run with `media_hosting: off` either** — don't spend
money building a video with no road out.

**Topics come only from here.** With `topic_source: pool`, use the unused
entries in the list below, oldest first, and **when it's empty, stop authoring
and report — don't invent topics.** `keywords` is the mode that digs material
out of Naver 지식iN questions, which raises subject risk.

```yaml
topic_pool:
  - "Vietnam temporary-residence registration steps"
  - "when the visa fee increase lands"
topic_keywords: ["Vietnam visa", "expat paperwork"]   # only with topic_source: keywords
```

- **Cost** — per-episode cap `max_cost_per_video`; daily and weekly totals
  accrue in the channel-shared `data/<channel>/growth/autoproduce.json`. The
  ladder and promotion conditions:
  `skills/autoproduce/references/cost-tiers.md` is the source of truth, and
  Instagram's promotion trigger is a 3-episode average `reels_skip_rate` above
  55 (percentage-point scale).
- **Quality** — only episodes that pass every machine gate (fact check, style,
  storyboard-review copy, images, build report, content-reviewer P0, cost)
  become `queue_instagram: ready`; one failure means `hold`.
- **Duplicates** — before authoring, `check-duplicate.py` compares the
  candidate against all of the channel's existing topics. A different slug but
  the same story reworded drops the candidate (threshold
  `duplicate_threshold`, default 0.5). Rehashes also erode IG's originality
  verdict.
- **Episode count** — this plan authors at most **2 per day** (per-platform
  hard cap, success and failure included). `daily_produce_cap` can only go
  down within it. The YouTube plan carries its own cap, so with both on, the
  channel can build up to 4 a day — the cost cap (`daily_cost_cap`) is
  channel-total, and that's what squeezes the volume.
- **Authored ≠ ready to publish** — a reel needs a public HTTPS URL to go out,
  and the loop can't upload files to hosting. Even after autoproduce finishes,
  nothing publishes until a human uploads, and the loop says so in the tick
  report.
- **Queues stamped together** — `mark_queues`. One video goes out to both
  platforms, so adding `youtube` here makes the YouTube loop publish the same
  episode (that side uploads the local file directly and needs no hosting).
  **Only add a platform whose growth-plan.md is approved.**

## Comment-reply scope

- Reply to: questions, impressions, added information, error reports
- Don't reply (report only): spam/ads, hate/put-downs, bait and provocation,
  exposed personal data
- When unsure, don't reply; raise it in the next tick summary

## Forbidden subjects (never publish without a plan update)

- Politics, religion, disparaging any nationality
- Unverified policy or regulation info (effective dates and amounts only after
  the storyboard pipeline's verification)

## Originality (the line that keeps account eligibility)

Publish targets are **our pipeline's outputs**
(`output/video/video-sub.mp4`) only. Videos taken from elsewhere, files with
another platform's watermark left on, speed-only re-edits: never queued —
fail the originality verdict and it's not one post, the whole account drops
out of non-follower recommendations (playbook §Losing eligibility).

## Account Status check

The app's **Account Status** has no API, so the loop can't read it. A human
checks weekly, and when reach craters it comes before the editing. Log each
check here in one line.

| checked | eligible | notes |
| --- | --- | --- |
| 2026-08-11 | eligible | — |
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
  "lastAccountStatusPrompt": "2026-08-10",
  "lastInsights": {
    "capturedAt": "2026-08-11T09:30:00+09:00",
    "followersCount": 412,
    "reach7d": 9100,
    "views7d": 18400,
    "profileViews7d": 260,
    "topReel": {
      "mediaId": "18012...",
      "views": 8200,
      "reelsSkipRate": 41.0,
      "avgWatchTimeMs": 7300,
      "shares": 12
    }
  }
}
```

- `filledSlots` — recorded only on publish success. A failed slot is retried
  by the next tick.
- `publishedTopics` — published topic slugs. **The last line of defense
  against re-uploading the same reel.** It doubles the frontmatter's
  `queue_instagram: done` because if the file write fails, the surviving state
  still blocks the duplicate. Keep the latest 200.
- `lastAccountStatusPrompt` — the last day an Account Status check was
  requested. When the plan's `account_status_check` cadence lapses, the tick
  report carries it again.
- `lastInsights` — the baseline for the next tick's delta. `followersCount`
  is the profile field value, not an insight (insights' follower_count is
  empty under 100 followers).

## autoproduce.json — channel-shared authoring budget and history

`data/<channel>/growth/autoproduce.json` is **channel-shared**, not
per-platform — one video goes out to both platforms. The schema and lock
protocol: `skills/autoproduce/SKILL.md` §0 is the source of truth — not copied
here. Both growth loops write the same file, so read→author→write happens
entirely inside the lock.

## growth-log.md — observation ledger (append only)

```markdown
# <channel name> Instagram growth log

| time | replies | authored | published | followers | skip rate | avg watch | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 08-11 09:30 | 3 | - | 1(09:00) | 412(+7) | 0.41 | 7.3s | visa-fee episode top reach |
| 08-11 10:30 | 0 | 1($0.05 economy) | 0 | - | - | - | queue 0 → autoproduce · awaiting upload |
| 08-11 11:30 | 0 | - | 0 | - | - | - | observation only |
```

Once a week (Monday's first tick) add a summary line: the weekly 4 metrics
(`reels_skip_rate` · `ig_reels_avg_watch_time` · shares per reach · account
`profile_views`) + one line on the top-reach reel types + this week's publish
count against the target (3–5).
