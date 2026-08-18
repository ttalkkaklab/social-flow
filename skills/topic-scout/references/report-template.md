# Market keyword report template

Fill the slots below into `data/<channel>/growth/keywords/market-keywords.md`.
Leave no slot empty. Copy the numbers straight from the tool response, don't polish them.

The screen a human looks at is the HTML. Write the md, then run `render-report.py`.
Don't hand-write the HTML. The center of the screen is the content a keyword
covers and the episode we'll make. How we picked is one section at the end.
Don't leave English or Chinese fragments as they are, and don't use jargon like
seed, phrase, or outlier. The `## Chosen topics` line says "The market videos
cover ~. We ~." in plain words. Don't put multiplier or research-method
sentences in it. The script reads the last column of the topic-phrase table
(`yes` · `skip`) and reflects it in the cards and the family strip. The script
fills the interpretation blocks from the numbers too. Don't rewrite the same
commentary in the md. Fill the `## SNS issues` section only when you ran
`sns_issue_scout` — without it, drop the section entirely and render the HTML
without `--sns`.

```markdown
---
channel: <slug>
generated: <YYYY-MM-DD>
queries: ["<US seed>", "<CN seed>"]
markets: ["US", "CN"]
minMultiplier: 5
duration: short
via: api_key
---

# <channel display name> market keywords

As of <today's date>, topics from the last 90 days on US and Chinese YouTube
that came in at 5x or more the channel median. Not absolute views.

## Chosen topics

- <topic the user picked> — <The market videos cover ~. We ~. Don't write the multiplier>
- (if nothing is picked yet: "None — still choosing what to make")

## Topic phrases

| Phrase | Score | Outliers | Best multiplier | Already used |
| --- | --- | --- | --- | --- |
| | | | | yes/no |

## Outliers (evidence)

| Multiplier | Views | Channel median | Channel | Title | Gap |
| --- | --- | --- | --- | --- | --- |
| | | | | [title](permalink) | one-line comment question, or — |

Only the top 15. The rest are in the json.

## Channels scanned

N channels · N videos · N outliers · about N quota units.

Write one line for the channels skipped for too small a sample.

## SNS issues

N posts on Threads, X, and Instagram about the same topic within the last
<window> (sns-issues.json). This path has no likes or views, so the numbers
below are **how many posts mentioned it** — a different yardstick from the
multiplier table above.

| Phrase | Posts | Platforms |
| --- | --- | --- |
| | | whichever of threads · x · instagram it showed up on |

Only the top 8. Rising searches that overlap a seed: <"none" if there are none>.

Sample posts: [platform · author](url) · [platform · author](url) · [platform · author](url)

N searches · 1 rising-search call · N credits. Write one line if a platform or
seed dropped out.

## Next steps

- With a chosen phrase, `/social-flow:storyboard <channel> "<phrase>"` or
  `/social-flow:autoproduce <channel> "<phrase>"`
- To use it in the growth loop, add the phrase to the grow-youtube plan's
  `topic_source: scout` or `topic_pool` (confirm plan approval)
```
