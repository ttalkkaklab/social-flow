# Market topic scout — method

The source of truth for what `youtube_topic_scout` does and how the agent should
split the seeds.

## Contents

- [Why not absolute views](#why-not-absolute-views)
- [Markets — US and China by default](#markets-us-and-china-by-default)
- [How to split the seeds](#how-to-split-the-seeds)
- [Do one thing better](#do-one-thing-better)
- [Quota](#quota)
- [SNS issues — Threads, X, and Instagram use a different yardstick](#sns-issues-threads-x-and-instagram-use-a-different-yardstick)
- [What this skill does not do](#what-this-skill-does-not-do)

## Why not absolute views

The same 100k views means something different on every channel. Treat a big
channel's average piece and a small channel's breakout as the same number and
you'll only ever pick topics that are ordinary for channels that are already big.

So we gather channels first, take the **median views of that channel's recent
uploads**, and count only videos with `views ÷ median ≥ 5` as outliers. Same
place VidIQ's `5x`/`10x` sits. Channels with fewer than 3 videos in the median
sample get skipped.

Looking only at the top videos in the search box shows you "what is in the
ranking right now". This tool uses search to **gather channels**, then sweeps
their uploads. A topic their audience went wild for still gets caught even when
it's outside the ranking.

## Markets — US and China by default

Korean search rankings are not the default. The place short-form gets validated
first is the US and China. Until the user says "Korea only", sweep both markets
separately and then merge.

1. Pull 2~3 Korean nouns out of the topic area (an internal note).
2. Build the **English and Chinese seeds** with the table below. Don't drop
   Korean seeds into US/CN search as-is.
3. Call `youtube_topic_scout` twice — `regionCode: US` `language: en` and
   `regionCode: CN` `language: zh`.
4. Merge into one json with `merge-scout.py`.

| Korean (internal) | US seed | CN seed |
| --- | --- | --- |
| AI 부업 | `AI side hustle` | `AI副业` |
| AI 업무 자동화 | `AI work automation` | `AI办公自动化` |
| AI 도구 비교 | `AI tools comparison` | `AI工具对比` |
| 연말정산 | `tax refund` | `退税` |
| 직장인 절세 | `paycheck tax` | `工资节税` |

If it isn't in the table, translate it into a short English noun and a short
Chinese noun. Don't invent proper nouns.

Korea only: `regionCode: KR` `language: ko`, Korean seeds, one call.

`channelLimit` is 15 per market (about 30 across two markets).

## How to split the seeds

Don't drop the one-line profile §1 topic area straight into the search box.
YouTube search responds to short nouns.

Rules:

- 2~3 seeds per market. The tool merges them and cuts at 4 (`search.list` costs
  100 units per call).
- One seed is 2~6 words. Drop modifying clauses and audience description
  ("while scrolling on the commute").
- If the user gave a query, keep it as the internal noun and build EN·ZH from the
  table above.

## Do one thing better

Once you've picked an outlier, don't shoot the same thing. Go **one notch**
past that video.

1. `gaps` — questions left in the comments. A well-liked unanswered question is
   the gap.
2. Intro and thumbnail — changing what shows up in the first seconds has the
   biggest effect. Instead of "hi everyone, I'm so-and-so", use one of:
   authority, a reason to watch, or the target.
3. If it's a phrase our channel already covered, make the follow-up out of **that
   gap** rather than rehashing the same point.

Don't copy a title, thumbnail, or script. A topic itself isn't copyrightable.

## Quota

| Call | Units |
| --- | --- |
| `search.list` (1 seed) | 100 |
| `channels.list` / `playlistItems` / `videos.list` / `commentThreads` | 1 |

One market · 3 seeds + 15 channels + 5 comment calls ≈ 330 units.
US plus China is about 660. That fits inside the default 10,000 per day. Don't
repeat the same seed on the same day. If the report is dated today, read the file
and ask whether to call again.

Using `YOUTUBE_API_KEY` keeps this separate from the publishing OAuth quota.
With no key and only OAuth, it shares a bucket with uploads and insights.

## SNS issues — Threads, X, and Instagram use a different yardstick

YouTube's "multiple of the channel median" is possible because the Data API hands
over a per-channel upload list cheaply. On those three networks, the APIs we hold
can't give us engagement on other people's posts — Threads keyword search returns
only our own posts until the app gets advanced access (Tech Provider, irreversible),
the Instagram Login API has no public search, and X needs a separate metered
developer account (researched 2026-08-18). So `sns_issue_scout` gathers recent
posts by **appending `site:threads.com` / `site:x.com` / `site:instagram.com` to a
SerpApi Google search**. Field-tested on 2026-08-18 ("AI 자동화" · gl=kr ·
recency=week), all three platforms were indexed at post granularity — Threads down
to the date, X and Instagram with URL, author, and snippet.

What this path gives you and what it doesn't:

- **You get** — post URL, author, title, snippet; a relative date on Threads; the
  phrases (with frequency) that show up across several posts and several
  platforms; Google rising searches (rough search volume and growth).
- **You don't get** — engagement like likes, replies, or views. The ordering is
  Google relevance, not popularity. So the result is a mention list answering
  **"what is going around on this topic right now"**, not "what blew up".

A phrase's score is `posts mentioning it × (1 + 0.25 × (platform count − 1))`,
halved for single-word phrases. The query itself (a phrase made only of seed
words) is in every post, so it's dropped, and only phrases appearing in two or
more posts survive (three or more for single words). Posts that repost the same
sentence verbatim (a recruiting ad posted again) collapse into one — otherwise
every phrase in that post takes over the list as "appeared in two posts" (in the
field test, two course-recruitment posts did exactly that). Korean particles come
off only when the stem also appears alone somewhere in this batch — the guard that
stops mis-splits like 워크플로→워크플 or 전문가→전문.

Rising searches (`trending`) come from Google Trends, so they're keyed to **Google
search**, not SNS engagement. When one overlaps a seed or a top phrase,
`matchesSeed` turns on. Most of them are celebrity and news queries, so no overlap
is normal — treat them as timely material only when they do overlap.

In the report they go in a **separate section** from the YouTube multiplier table.
Put them in the same table and 12 mentions reads as 12x. The HTML attaches them as
a final page too (`render-report.py --sns`).

Credits: 3 platforms × N seeds × 1 page + 1 for rising searches. Three seeds is 10
calls, inside SerpApi's free 250/month. Timeouts and 5xx get one retry, and the
same search is served from SerpApi's cache at no credit cost. Don't repeat the same
seed on the same day.

Snippets are Google summaries and can differ from the post body — for Threads, the
page's auto-generated topic summary sometimes comes back as the snippet (seen once
in the field test). Open the URL to check before quoting.

## What this skill does not do

- Create a research-only YouTube account and subscribe with it — the tool takes
  that place.
- Install the VidIQ extension.
- Turn a topic into a video — that goes to storyboard / autoproduce.
- Apply for Threads keyword-search advanced access — converting to Tech Provider is
  irreversible, so on 2026-08-12 we decided not to apply
  (`grow-threads/references/api-limits.md` §2).
