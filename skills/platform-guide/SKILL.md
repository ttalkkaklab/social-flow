---
name: platform-guide
description: >
  The per-platform writing rules, video specs and safe zones. Knowledge only, nothing
  runs. Use when the user asks about "플랫폼 문법", "플랫폼별 작성 규칙", "인스타 캡션 어떻게", "쇼츠 제목 규칙",
  "platform grammar", "how to write for Threads/Instagram/Facebook/YouTube", or when
  another social-flow skill needs the posting limits, caption rules, video specs or
  safe-zone numbers. The source of truth is references/platform-playbook.md.
---
**Automatic execution policy:** Read [automation guidance](../_shared/automation-guidance.md) first. Creative rules and review findings guide improvements; scores, review/hash/freeze records, CTA choices and intermediate approval steps do not block authorized work. Preserve actual external-action authorization and stop at the artifact the user requested. This policy supersedes older quality-gate wording below.


# Platform guide — the SoT for grammar and specs

A knowledge-only skill holding the writing grammar, video specs, limits, and
anti-patterns for the four publishing platforms: Threads · Instagram · Facebook ·
YouTube. produce (§9 per-platform text), publish (approval-gate review), and the
content-reviewer agent all take this skill's playbook as their baseline.

## Core principles (summary)

1. **"Share the facts, never the sentences"** — even with the same material,
   redesign the speaker, register, sentence endings, and information density for
   each platform. Automatic cross-posting is banned.
2. **Plain language** — use the channel audience's knowledge and voice; default to adult non-specialists. No unexplained jargon, no
   translationese, no over-compressed sentences with the subject dropped. If a necessary
   term is unfamiliar to that audience, lead with the plain word and gloss the term in
   parentheses on first appearance only.
3. **The first encounter is everything** — the first line on Threads, the first
   125 characters of an IG caption, the YT title+thumbnail, the first second and
   then the first 3 seconds of the video. If you don't win there, the rest never
   gets read. The first second is a measurement, not a feeling: after the build,
   the first subtitle cue's start time is read off the shipped SRT, and past
   1.0s it warns (playbook §7).
4. **Golden-hour replies** — answer comments in the first 60 minutes after
   publishing; the same reactions spread further when they land early (grow-threads
   `references/growth-playbook.md` §Principles). The one sourced lift figure is
   Buffer's 10.2M-post Threads set: posts where the author replied to their own
   post took +42% engagement, the largest of the six platforms it tracks.
5. **Korean without AI tells** — one sentence of translationese, stock phrasing,
   or assistant-speak makes the whole post read as an ad and get scrolled past.
   The rules live in `references/korean-style.md`; the findings come from
   `references/check-style.py`. Narration, subtitles, copy, titles, and comment
   drafts are all in scope.

## Platforms at a glance

| | Threads | Instagram | Facebook | YouTube |
|---|---|---|---|---|
| Form | text · 1 image · video on the post (`videoUrl`) | reels · carousel ≤10 images | text/image/regular video | Shorts (9:16 ≤3 min) |
| Body limit | 500 chars | caption 2,200 chars | 5,000 chars | title 100 · description 5,000 |
| Register | casual spoken, short by default (§3) | hook in the first 125 chars; a save prompt is optional | structured expository | one spoken sentence, result withheld |
| Links | none in the body — the video rides on the post; a self-reply link only as the fallback (§3) | caption links not clickable → comment | banned in body → first comment | description OK |
| Hashtags | ≤1 (ranking weight 0) | no fixed count — topic markers in the caption | 0–2 | `#Shorts` required by preset; 3–5 is guidance |
| Media | video/image as public HTTPS URL | public HTTPS URL | public HTTPS URL | local file upload |
| Limits | 250 posts/24h | 100 posts/24h | — | 100 uploads/day |

Detailed grammar, copy formulas, the anti-pattern checklist, and video specs
(safe zones, subtitles, length) are in `references/platform-playbook.md` —
Read it before writing for any platform, without exception.

## Style check

After writing or editing any Korean copy, run the checker for its surface.
The code lists the findings; a human or agent reads them and fixes the sentences.

```bash
PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
python3 $PG/check-style.py --surface <surface> <file>
node $PG/extract-text.js ./storyboard/scenes.js <narration|subtitle|screen> | \
  python3 $PG/check-style.py --surface <surface> -
```

8 surfaces: `narration` `subtitle` `screen` `threads` `ig` `fb` `yt` `reply`.
exit 0 pass / 1 warning (S2 accumulation) / 2 S1 found / 3 the check did not run
(empty input · path error) / 4 skip (the text is not Korean, so the rules have
nothing to say about it).

**S1 findings are suggestions.** Fix the sentence and re-run, or write down why it
stays; neither the exit code nor a score decides whether authorized work goes on
(owner directive 2026-10-16). exit 3 is not a pass — fix the path and run again.
exit 4 is `not_applicable`, not a pass and not a failure. Write paths against
`${CLAUDE_PLUGIN_ROOT}` (produce·publish run from `data/<channel>/episodes/<topic>/`,
so relative paths won't resolve).

The YouTube meta file gets a second, structural check on top of the style one —
`node $PG/check-meta.js output/youtube/meta.md` reads the playbook §6 layout,
the title limits, the preset hashtags, the summary voice, and a verbatim copy of
`COMPREHENSION.answer` (it finds scenes.js from the episode layout). Same exit
codes. Its 0 is "layout and verbatim leak clean" — a paraphrased result is the
reviewer's blind read. A short whose cover opens on the result
(`hookType:"spoiler"`) keeps this check: the cover may say the answer, the title
and the description still withhold it (playbook §2). Only long-form answer-first
episodes skip it.

## Editorial review guidance for outgoing copy

Read outgoing copy for factual support, natural language and fit with the channel
and conversation. A style checker or independent reviewer can help when a concrete
issue needs another look. Findings and scores inform revisions; no threshold,
review count or intermediate approval blocks already-authorized work. Record
missing reviews honestly. Publication and replies still require actual user or
standing authorization for that external action.

| Outgoing copy | Authored by | Reviewer | Verdict tail |
|---|---|---|---|
| Storyboard narration (the spoken sentences alone) | storyboard · autoproduce | storyboard-reviewer narration mode, then vocabulary mode — optional reads with the actual actions and attributed speech | `STORYBOARD_REVIEW` |
| Platform copy (threads · ig · fb · yt) | produce · autoproduce | content-reviewer copy axis | `CONTENT_REVIEW` |
| Growth copy (new posts · search-driven engagement · inbox replies) | grow-threads · grow-instagram · grow-youtube | growth-post-reviewer | `GROWTH_POST_REVIEW` |
| Post-publish replies | publish | growth-post-reviewer | `GROWTH_POST_REVIEW` |
| bio · channel description · tagline | channel · intro | growth-post-reviewer `standalone` | `GROWTH_POST_REVIEW` |

## Additional Resources

### Reference Files

- **`references/platform-playbook.md`** — per-platform grammar in detail, copy formulas, video specs, anti-pattern checklist (SoT)
- **`references/korean-style.md`** — Korean style SoT: AI-tell pattern tables (T·D·C·A·E), severities, per-surface application, the prefer-deletion principle
- **`references/check-style.py`** — deterministic style checker (stdlib only; `--surface` · `--json` · `--doc` · `--selftest`); findings are suggestions, exit codes report severity
- **`references/check-meta.js`** — the YouTube meta.md check: the §6 layout, title limits (100 chars · no `<>` · front-loading warning), the format preset's required hashtags, the summary voice, and a verbatim `COMPREHENSION.answer` in the title or description (`--print title|description|tags` · `--selftest`)
- **`references/pipeline.js`** — the step catalog: the stage ladder, the checks and reviews on the attended and unattended paths with what each one decides (only operational contracts stop work; reviews file findings), the reviewer verdict-tail contract, and produce's three build lanes. `episode-state.js` derives an episode's stage from it; `docs/pipeline-manifest.md` explains the design
- **`references/pipeline-lint.js`** — checks the workflow entrypoints and reviewer table against `pipeline.js` (7 rules, read-only; `--list` · `--selftest`)
- **`references/extract-text.js`** — scenes.js → per-surface text extraction (narration · subtitle · screen; handles the `window.SCENES` global contract)
- **`references/safezone-landscape.md`** — the 16:9 safe-zone measurements (2026-08-17): x 96/1920 · top 96/1080 · bottom 285/1080, and which surfaces stay provisional. `formats.js`, the video template and the storyboard template all cite it
- **`references/reply-gate.md`** — reply context and optional editing diagnostics, with actual sending authorization kept separate
- **`references/formats.js`** / **`references/format-resolve.js`** / **`references/format-lint.js`** — the format presets, the resolver the builders call, and the linter that holds the inline mirrors to them
- **`references/skill-lint.js`** — the skill-surface check: routing descriptions, tool lanes, reference links and orphans, manifest parity, the tool count in prose (16 rules; `--list` · `--selftest`)
