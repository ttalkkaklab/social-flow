---
name: review-recent
description: >
  This skill should be used when the user asks to "최근 영상 피드백", "유튜브 인스타
  평가", "게시분 보고서", "지표 보고서 만들어", "review recent posts", "feedback on
  the last videos", or wants a YouTube + Instagram report on the latest published
  videos. Calls content_feedback for the last 5 posts per platform, writes a
  chart-first HTML report under data/<channel>/growth/review-recent.html, and
  opens it.
argument-hint: "<channel> [limit]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "AskUserQuestion", "mcp__social-flow__content_feedback"]
---

# Feedback on recent posts — HTML report

Scores the latest YouTube and Instagram posts **in separate platform sections**. Don't
spell the scores out in chat. Write an HTML built around tables, funnels and bar
charts, then open that file.

```
/social-flow:review-recent my-channel
/social-flow:review-recent my-channel 5
```

## Procedure

1. **Confirm the channel** — with no argument, look through `data/*/profile.md` and
   pick the channel. If there's no `data/<slug>/profile.md`, point at
   `/social-flow:channel add` and stop.
2. **Call the tool** — `mcp__social-flow__content_feedback`
   - `channel`: slug
   - `limit`: the argument, or 5 (max 10)
   - `days`: 28
   - `outputPath`: `data/<slug>/growth/review-recent.html` (relative to cwd)
3. **Archive copy** — copy it once more into the same folder as
   `review-recent-YYYYMMDD-HHMM.html` (overwrite history).
4. **Open it** — if ego lite is around, open the report over `file://`. Otherwise just
   report the path.
5. **Report in chat** — one line with the path + per platform "fix N · watch N ·
   pending N". The per-episode numbers belong to the HTML. Don't redraw the table in
   chat.

## Metrics (the tool is the source of truth)

The comparison baseline is the **median across these N episodes**. No absolute lines
like YouTube's 70% at 30 seconds.

| Platform | What to look at | Lever to pull when it drops |
| --- | --- | --- |
| YouTube | early pass-through `engagedViews/views` · average view % · views | hook · retention · angle (if views alone are low while hook and retention hold, treat the title as the problem) |
| Instagram reels | 3-second drop-off · average watch seconds · shares against reach | hook · retention · shares |

YouTube click-through rate, subscribers per episode, and per-reel follows on Instagram
are either not given by the platform or unstable. Leave those cells empty in the
report rather than pretending they don't exist.

A platform without a token gets "none" in that section only; write the rest.
If both fail, stop and point at setup-youtube / setup-instagram.

## Rules

- Don't have a human re-polish the report. The HTML the tool wrote is the artifact.
- Don't change growth loop state (`growth-plan.md`). Observe only.
- Don't call publish tools.
