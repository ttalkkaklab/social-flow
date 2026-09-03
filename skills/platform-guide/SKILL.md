---
name: platform-guide
description: >
  The per-platform writing rules, video specs and safe zones. Knowledge only, nothing
  runs. Use when the user asks about "플랫폼 문법", "플랫폼별 작성 규칙", "인스타 캡션 어떻게", "쇼츠 제목 규칙",
  "platform grammar", "how to write for Threads/Instagram/Facebook/YouTube", or when
  another social-flow skill needs the posting limits, caption rules, video specs or
  safe-zone numbers. The source of truth is references/platform-playbook.md.
---

# Platform guide — the SoT for grammar and specs

A knowledge-only skill holding the writing grammar, video specs, limits, and
anti-patterns for the four publishing platforms: Threads · Instagram · Facebook ·
YouTube. produce (§9 per-platform text), publish (approval-gate review), and the
content-reviewer agent all take this skill's playbook as their baseline.

## Core principles (summary)

1. **"Share the facts, never the sentences"** — even with the same material,
   redesign the speaker, register, sentence endings, and information density for
   each platform. Automatic cross-posting is banned.
2. **Plain language** — viewers are non-experts. No unexplained jargon, no
   translationese, no over-compressed sentences with the subject dropped. If a
   term is unavoidable, lead with the plain word and gloss the term in
   parentheses on first appearance only.
3. **The first encounter is everything** — the first line on Threads, the first
   125 characters of an IG caption, the YT title+thumbnail, the first 3 seconds
   of the video. If you don't win there, the rest never gets read.
4. **Golden-hour replies** — how fast you answer comments in the first 60
   minutes after publishing decides reach (Buffer's analysis of 1.9M posts:
   replying lifts engagement Threads +42% / IG +21% / FB +9.5%).
5. **Korean without AI tells** — one sentence of translationese, stock phrasing,
   or assistant-speak makes the whole post read as an ad and get scrolled past.
   The rules live in `references/korean-style.md`; the verdict comes from
   `references/check-style.py`. Narration, subtitles, copy, titles, and comment
   drafts are all in scope.

## Platforms at a glance

| | Threads | Instagram | Facebook | YouTube |
|---|---|---|---|---|
| Form | text (+link card)/1 image (no video) | reels · carousel ≤10 images | text/image/regular video | Shorts (9:16 ≤3 min) |
| Body limit | 500 chars | caption 2,200 chars | 5,000 chars | title 100 · description 5,000 |
| Register | casual spoken, 1–3 lines | hook + save CTA | structured expository | one spoken sentence, result withheld |
| Links | 1 in body (`linkUrl` card) | caption links not clickable → comment | banned in body → first comment | description OK |
| Hashtags | ≤1 (ranking weight 0) | 3–5 | 0–2 | 3–5 (#Shorts by preset) |
| Media | link card (video episodes) · public HTTPS URL | public HTTPS URL | public HTTPS URL | local file upload |
| Limits | 250 posts/24h | 100 posts/24h | — | 100 uploads/day |

Detailed grammar, copy formulas, the anti-pattern checklist, and video specs
(safe zones, subtitles, length) are in `references/platform-playbook.md` —
Read it before writing for any platform, without exception.

## Style gate

After writing or editing any Korean text, run the checker for its surface.
The code gives the verdict; a human or agent fixes the sentences.

```bash
PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
python3 $PG/check-style.py --surface <surface> <file>
node $PG/extract-text.js ./storyboard/scenes.js <narration|subtitle|screen> | \
  python3 $PG/check-style.py --surface <surface> -
```

8 surfaces: `narration` `subtitle` `screen` `threads` `ig` `fb` `yt` `reply`.
exit 0 pass / 1 warning (S2 accumulation) / 2 fail (S1) / 3 gate did not run
(empty input · path error).

**S1 gets fixed and re-run, no exceptions.** exit 3 is not a pass either — fix
the path and run again. Write paths against `${CLAUDE_PLUGIN_ROOT}`
(produce·publish run from `data/<channel>/episodes/<topic>/`, so relative paths
won't resolve).

The YouTube meta file gets a second, structural check on top of the style one —
`node $PG/check-meta.js output/youtube/meta.md` reads the playbook §6 layout,
the title limits, the preset hashtags, the summary voice, and a verbatim copy of
`COMPREHENSION.answer` (it finds scenes.js from the episode layout). Same exit
codes. Its 0 is "layout and verbatim leak clean" — a paraphrased result is the
reviewer's blind read.

## Adversarial review gate — the shared contract for outgoing copy

Every piece of Korean copy the plugin authors for the outside world publishes
only after passing two stages. Stage 1 is the style checker above (the machine
verdict is the source of truth); stage 2 is an adversarial reviewer agent — it
tries to refute the copy: does it sound AI-written, and can a first-time reader
follow the vocabulary. **Publish only at score ≥95 with P0=0**; if the copy
can't clear that within 3 rounds (2 on unattended paths), don't publish —
not posting beats posting copy that falls short.

**Storyboard copy is read differently** — as the narration alone, before any
shot exists, twice: the story read (storyboard §4.4) and the vocabulary read
(§4.5), each looped to 95 in at most three reads with the sentences handed to
the reviewer inline. The board itself is not delegated (0.50.0 — the six board
reads of 0.49 were measured at 2–8 million tokens a call); the checkers and the
author's own read stand there, and the human approval step in storyboard §7 is
what blocks. Everything else in the table below keeps the 95 bar.

| Outgoing copy | Authored by | Reviewer | Verdict tail |
|---|---|---|---|
| Storyboard narration (the spoken sentences alone) | storyboard · autoproduce | storyboard-reviewer narration mode, then vocabulary mode — **looped to 95, cap 3 reads each, sentences inline** | `STORYBOARD_REVIEW` |
| Platform copy (threads · ig · fb · yt) | produce · autoproduce | content-reviewer copy axis | `CONTENT_REVIEW` |
| Growth copy (new posts · search-driven engagement · inbox replies) | grow-threads · grow-instagram · grow-youtube | growth-post-reviewer | `GROWTH_POST_REVIEW` |
| Post-publish replies | publish | growth-post-reviewer | `GROWTH_POST_REVIEW` |
| bio · channel description · tagline | channel · intro | growth-post-reviewer `standalone` | `GROWTH_POST_REVIEW` |

The 95 bar is a user directive from 2026-08-13 (growth copy was lowered to 90
on 2026-08-12, then restored to 95 by that directive). The storyboard row
changed shape twice — single board reads on 2026-08-22, then the two narration
loops with the board reads removed on 2026-09-03 (0.50.0). Don't build a new skill
with an outgoing-copy path that bypasses the reviewer — when a new surface
appears, add a row to this table and extend an existing reviewer.

## Additional Resources

### Reference Files

- **`references/platform-playbook.md`** — per-platform grammar in detail, copy formulas, video specs, anti-pattern checklist (SoT)
- **`references/korean-style.md`** — Korean style SoT: AI-tell pattern tables (T·D·C·A), severities, per-surface application, delete-only principle
- **`references/check-style.py`** — deterministic style checker (stdlib only; `--surface` · `--json` · `--doc` · `--selftest`)
- **`references/check-meta.js`** — the YouTube meta.md gate: the §6 layout, title limits (100 chars · no `<>` · front-loading warning), the format preset's required hashtags, the summary voice, and a verbatim `COMPREHENSION.answer` in the title or description (`--print title|description|tags` · `--selftest`)
- **`references/pipeline.js`** — pipeline SoT: the stage ladder, every gate (attended and unattended), the reviewer verdict-tail contract, and produce's three build lanes. `episode-state.js` derives an episode's stage from it; `docs/pipeline-manifest.md` explains the design
- **`references/pipeline-lint.js`** — checks the SKILL.md gate prose against `pipeline.js` (9 rules, read-only; `--list` · `--selftest`)
- **`references/extract-text.js`** — scenes.js → per-surface text extraction (narration · subtitle · screen; handles the `window.SCENES` global contract)
- **`references/safezone-landscape.md`** — the 16:9 safe-zone measurements (2026-08-17): x 96/1920 · top 96/1080 · bottom 285/1080, and which surfaces stay provisional. `formats.js`, the video template and the storyboard template all cite it
- **`references/reply-gate.md`** — the two gates every growth-loop reply passes: `check-style.py --surface reply`, then the growth-post-reviewer agent at ≥95 with p0=0, plus what to attach per platform
- **`references/formats.js`** / **`references/format-resolve.js`** / **`references/format-lint.js`** — the format presets, the resolver the builders call, and the linter that holds the inline mirrors to them
- **`references/skill-lint.js`** — the skill-surface check: routing descriptions, tool lanes, reference links and orphans, manifest parity, the tool count in prose (12 rules; `--list` · `--selftest`)
