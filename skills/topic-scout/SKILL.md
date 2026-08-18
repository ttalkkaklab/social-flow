---
name: topic-scout
description: >
  This skill should be used when the user asks to "키워드 찾아", "시장 키워드",
  "잘 되는 주제", "우리 채널 키워드", "아웃라이어 주제", "지금 뭐가 핫해",
  "find keywords for my channel", "scout topics", "스레드/X/인스타에서 뭐가
  이슈야", or wants validated YouTube topics for a channel from what is already
  working in that niche plus what is being talked about on Threads/X/Instagram
  right now. Reads profile.md, calls youtube_topic_scout (channel-median ×
  multiplier, not raw views; default markets US+CN) and sns_issue_scout (SerpApi
  site: search over threads.com/x.com/instagram.com + Google Trends rising
  queries — mention counts, not engagement), writes
  data/<channel>/growth/keywords/market-keywords.md + chart-first HTML with a
  separate SNS section, and lets the user pick phrases for the storyboard /
  autoproduce / grow-youtube topic pool.
argument-hint: "<channel> [seed query]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "AskUserQuestion",
  "mcp__social-flow__youtube_topic_scout", "mcp__social-flow__sns_issue_scout",
  "mcp__social-flow__serp_trending_now"]
---

# Finding market-validated topics

Views usually don't come because you posted **what you wanted to say**.
This skill looks inside the channel's topic area for subjects people already
stayed with. It picks by **multiple of that channel's recent-upload median**,
never by absolute views — 100k on a huge channel and 100k on a new one mean
different things.

Next to YouTube there's a separate **SNS issues** section — what is going around
right now on Threads, X, and Instagram on the same topic (`sns_issue_scout`),
plus Google rising searches. That section uses a different yardstick. It's a
mention list with no engagement numbers, so it answers "what is being talked
about", not "what blew up", and it never gets mixed into the same column as the
YouTube multiplier table. The limits are spelled out in `references/method.md`
§SNS issues.

```
/social-flow:topic-scout my-channel
/social-flow:topic-scout my-channel "AI work automation"
```

The artifact a human looks at is `data/<channel>/growth/keywords/market-keywords.html`.
Write it so someone who isn't a YouTube analyst can tell what the topic is.
Page one is "the content we're making this time" — what the chosen keyword
covers in the market, and which episode we'll make. Page two is one identical
block per candidate keyword. How we picked is one section at the end. Don't
spend a page on evidence charts.
Don't use jargon like seed, phrase, outlier, gap, yardstick, or quota on screen.
Render English and Chinese titles as short plain wording. The script builds the
interpretation from the numbers.
Don't redraw the tables in chat.
`market-keywords.md` in the same folder is the source of truth for the numbers
and chosen phrases that grow-youtube / autoproduce read. `topic_source: scout`
reads that md.

The reasoning behind the method is in `references/method.md`. The md slots are in
`references/report-template.md`. Never hand-write the HTML — `references/render-report.py`
produces it.

## Procedure

1. **Confirm the channel** — with no argument, glob `data/*/profile.md` and pick.
   If `data/<slug>/profile.md` doesn't exist, point to `/social-flow:channel add` and stop.
2. **Seed queries** — if the user gave a query, keep it as the internal noun. If not,
   split profile §1 **topic area** into 2~3. If the line is long, take only the core
   nouns. Don't put the target-audience sentence into the seeds. Build the
   **English and Chinese seeds** with the table in `references/method.md`. Don't drop
   Korean seeds into US/CN search as-is.
3. **Call the tool** — call `mcp__social-flow__youtube_topic_scout` **once per market**.
   The default is the US and China. If the user says "Korea only", one KR/ko call.
   - US: `regionCode: US` `language: en` · English seeds
   - China: `regionCode: CN` `language: zh` · Chinese seeds
   - `query`: the first line of that market's seeds · `extraQueries`: the rest (max 2)
   - `channel`: slug
   - `duration`: `short` (`any` if the user mentions long-form)
   - `publishedAfterDays`: 90
   - `channelLimit`: 15 (per market)
   - `includeComments`: true
   - `limit`: 15
   Put the responses in `growth/keywords/us.json` and `cn.json`, then merge with
   `references/merge-scout.py --out market-keywords.json us.json cn.json`.
3b. **SNS issues** — call `mcp__social-flow__sns_issue_scout` **once**.
   Unlike YouTube, Korea is the default here — those three networks are where we
   post to a Korean timeline, so US and Chinese mentions aren't usable material.
   - `query`: the first Korean seed line · `extraQueries`: the rest (max 2)
   - `gl: kr` · `hl: ko` · `recency: week` (`day` if the user says "today's issues")
   - `platforms`: omit (all three — Threads, X, Instagram) · `includeTrending: true` · `limit: 15`
   Leave the response as-is in `growth/keywords/sns-issues.json`. Credits are
   3 platforms × number of seeds + 1 for rising searches (3 seeds = 10 calls,
   SerpApi free tier is 250/month).
   Don't call the same seed twice in one day — if the file carries today's date, read it.
   If there are `errors`, only that platform·seed dropped out, so write one line about
   it in the report.
   When the user asks only "what's hot right now" with no channel, answer with one
   `mcp__social-flow__serp_trending_now` call (`geo: KR`, `hours: 24`) and don't create files.
4. **Overlap with existing topics** — read the `data/<slug>/episodes/*/` directory names
   and storyboard titles, and mark phrases already covered as `yes` in the
   Already-used column of the md topic-phrase table. The tool doesn't throw those
   results away — they can become follow-up episodes.
5. **Report** — fill the `references/report-template.md` slots into
   `data/<slug>/growth/keywords/market-keywords.md`. In the same folder put
   `market-keywords.json` (the raw tool response) and a `market-keywords-YYYYMMDD.md`
   copy. Then render the HTML.

   ```
   python3 ${CLAUDE_PLUGIN_ROOT}/skills/topic-scout/references/render-report.py \
     --json data/<slug>/growth/keywords/market-keywords.json \
     --sns  data/<slug>/growth/keywords/sns-issues.json \
     --md   data/<slug>/growth/keywords/market-keywords.md \
     --name "<channel display name>"
   ```

   The script writes `market-keywords.html` and `market-keywords-YYYYMMDD.html`.
   With `--sns`, a "what SNS is talking about right now" page gets appended at the
   end — it shares colors and tables with the YouTube pages, but the script adds a
   sentence saying the scores mean something different.
   Fill the md's `## SNS issues` section per the `report-template.md` slots (top 8
   phrases · the rising searches that overlap a seed · three sample post links).
   Don't hand-draw the SVG. Don't hand-polish the interpretation sentences either.
   The `## Chosen topics` line says "The market videos cover ~. We ~." in plain words.
   Don't put multiplier or research-method sentences in it.
   `report.css` and the script hold the token and node grammar (single blue · viewBox
   width 700 · no red in the figures · no left accent border).
6. **Pick** — show the top 8 with AskUserQuestion and let the user choose which phrases
   to use (multi-select). Don't mix the SNS phrases into the same list — label them
   "what SNS is talking about" and add only two or three separately. Putting a
   YouTube-validated topic and a mention list on the same line makes the user read
   them as equally weighted. Write the chosen phrases into the md's `## Chosen topics`,
   then **run the script once more** to refresh the HTML cards.
   If a grow-youtube plan exists, ask once more whether to add them to the topic pool
   or `topic_keywords`.
   **Don't touch the plan frontmatter without approval.** Even when adding, only append
   to the list and confirm with the user whether `status: approved` stays.
7. **Report back** — one line with the HTML path + the chosen phrases + a pointer to
   "storyboard this topic" / "one episode via autoproduce". Don't redraw the
   per-episode view table in chat. The source of truth a human reads is the HTML;
   the one the loop reads is the md.
   If ego lite is available, open the HTML with `file://`.

## Credentials

If the YouTube tool comes back 400, point to one of the two routes and stop. Don't
make anything up.
The SNS issue tool uses only `SERPAPI_API_KEY` — 401 is the key, 429 means the 250
monthly calls are used up. In that case leave the SNS section empty and write only
the YouTube section (and the reverse — the report goes out even when one side is missing).

- **Recommended** — `YOUTUBE_API_KEY` (a public key with YouTube Data API v3 enabled
  in Google Cloud). It doesn't consume the publish quota.
- **Fallback** — `youtube.readonly` from
  `~/.config/social-flow/<slug>/youtube-oauth-client.json`. A token holding only
  `youtube.upload` for publishing gets search (100 units) refused. For reissuing,
  see publish `references/token-setup.md`.

## Rules

- **Reference topics, don't copy them.** Don't reuse a title, thumbnail, or script.
  When an outlier has `gaps` (questions in the comments), do one thing better — fill
  that gap.
- Mark phrases outside the channel topic area as `skip` in the md topic-phrase table.
  Leave them in if the user wants. The HTML family strip reads that column.
- This skill doesn't approve growth plans or queue markers. It observes and lists.
- It doesn't call publish tools.
- Don't put a 5x on 10 views up as a topic — the tool's `minViews` default of 1000 is
  that floor. Lower it only when told to explicitly.
- Don't quote an SNS snippet as if it were the post body — it's Google's summary and
  can differ from the post (for Threads, an auto-generated topic summary sometimes
  comes back). Open the URL if you want to quote.
- Don't call SNS phrases "topics that blew up". They're mention counts with no
  engagement behind them.

## Additional Resources

### Reference Files

- **`references/method.md`** — US and China by default, the EN/ZH seed table, quota, the limits of the SNS issue path
- **`references/merge-scout.py`** — merge the per-market JSON
- **`references/report-template.md`** — the `market-keywords.md` slots
- **`references/render-report.py`** — JSON + md (+ SNS JSON) → chart-first HTML
- **`references/report.css`** — HTML tokens (the same blue and navy as the proposal)
