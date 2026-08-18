# growth-plan.md template + state.json schema

## growth-plan.md — the standing authorization

init writes this via HITL. Unless it says `status: approved`, grow-threads
publishes nothing. The path is `data/<channel>/growth/threads/` — growth
skills are split per platform, so each platform uses its own subdirectory.
After editing the plan, get the user's approval again and set it back to
approved.

```markdown
---
channel: my-channel
status: approved            # draft | approved — only approved allows autonomous publishing
approved_at: 2026-08-11
tone: 반말                  # 반말 (casual) | 존댓말 (polite) — one per channel (inherited from profile.md)
slots: ["09:00", "21:00"]   # 1–3 new-post rhythm slots (local time, target audience's active hours)
                            # a rhythm guide, not a cap — the loop judges publishing frequency
---

# <channel name> Threads growth plan

## Keywords of interest (for search engagement, 3–5 — rotated each tick)

- visa renewals abroad
- expat daily life
- Hanoi restaurants

## Topic pool (new-post idea categories — topics outside it are barred from autonomous publishing)

- mistakes made in visa and paperwork procedures
- local price and exchange-rate observations
- everyday details that differ from home

## Banned topics (never published without a plan update)

- politics, religion, disparaging any nationality
- unverified policy information (effective dates and amounts only after the storyboard pipeline's verification)

## Link policy

Default: links go in a self-reply. Update here once body-link A/B measurements accumulate.
```

## state.json — state carried between ticks

This file is the basis for double-post prevention. Read it at the start of
every tick, save it at the end. If a date key isn't today, reset that bucket.
Never store raw API responses.

```json
{
  "channel": "my-channel",
  "lastTickAt": "2026-08-11T09:30:00+09:00",
  "filledSlots": { "2026-08-11": ["09:00"] },
  "engagedPostIds": ["17891234567890123"],
  "gateSkippedCommentIds": ["17899876543210987"],
  "keywordCursor": 1,
  "lastInsights": {
    "capturedAt": "2026-08-11T09:30:00+09:00",
    "followersCount": 132,
    "viewsTotal7d": 4210,
    "topPost": { "postId": "…", "views": 1830, "replies": 12 }
  }
}
```

- `filledSlots` — recorded only on a successful slot publish. A failed slot
  gets retried by the next tick.
- `engagedPostIds` — posts where search engagement was **attempted**
  (successful publishes and 3-round gate-failure skips alike). Keep only the
  latest 500 (drop the oldest first). Leave the skips out and every tick
  re-drafts and re-reviews the same post.
- `gateSkippedCommentIds` — inbox comment ids closed out as not-answered after
  3 failed gate rounds. Skipped from the next tick on; only reported, so a
  human can decide whether to answer personally.
- `keywordCursor` — keyword rotation position (from 0, cycling through the
  keyword count).

**Legacy keys** — the old plan's `daily_caps` frontmatter and state.json's
`searchRepliesToday` are retired (the daily-cap regime itself is gone). Ignore
them if read from existing files, and drop them when saving state. Existing
channel plans get migrated to this template and re-approved at the next init
or plan edit.

## growth-log.md — observation ledger (append only)

```markdown
# <channel name> growth log

| time | replies | engagements | new posts | followers | memo |
| --- | --- | --- | --- | --- | --- |
| 08-11 09:30 | 2 | 1 | 1(09:00) | 132(+3) | FX post top reach |
| 08-11 10:00 | 0 | 0 | 0 | - | observation only |
```

Once a week (Monday's first tick), add a summary line: the 4 weekly metrics
(reach per post · replies per post · follower growth rate · profile visits)
plus one line on the top-reach post types.

## posts.md — published-copy ledger (append only)

Every time a new post is published, append its copy verbatim. The headers are
`##` because the batch checker's `--split` reads each header as one piece.

```markdown
# <channel name> Threads published copy

## 17841400000000000 08-11 09:12

미용실에 사진까지 보여줬는데 왜 다른 색이 나왔지?
알고 보니 새 색은 지금 머리에 남은 색 위에 올라가는 거였어.

## 17841400000000001 08-11 18:40

…
```

**Why a separate file**: growth-log is one summary line per tick so no copy
survives there, and `threads_insights` gives metrics only. Batch
homogenization only shows when the published drafts sit in one place — this
file is the input measured with `check-batch.py --split` every five posts
(SKILL.md §5).
