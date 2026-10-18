# Price reference — what a generated episode costs

> **Freshness** — verified 2026-08-15 · source: vendor pricing pages plus our own measured
> runs; the numbers themselves live in [prices.tsv](prices.tsv), which this file never copies ·
> recheck every 90 days.

This document explains how an episode's cost is read and projected. **No price numbers
live here** — `prices.tsv` is the source of truth and `cost-report.sh` reads only that.
Write a number in two places and one of them always goes stale.

Engines are not chosen here either. Every new still, clip and speech line uses the models
saved in `.social-flow/models.json` ([model settings](../../_shared/model-settings.md)),
snapshotted into `PRODUCTION.modelSettings`. A metric trend, a cost rung or a cheaper row
in the price table never switches an engine; only the user changes a saved model. The
unattended loop's two production choices — video model and previz renderer — are satisfied
by `models.json` (`models.video`, `production.previzRenderer`); a growth plan's
`video_model` / `previz_renderer` fields are optional overrides.

## Contents

- [Where the money goes](#where-the-money-goes)
- [Choosing cuts before pricing them](#choosing-cuts-before-pricing-them)
- [The cap — a ceiling, not a quota](#the-cap-a-ceiling-not-a-quota)
- [Non-money budgets — search quotas](#non-money-budgets-search-quotas)
- [When updating a price](#when-updating-a-price)

## Where the money goes

| Layer | Billed as | Notes |
|---|---|---|
| Stills — cover, scene stills, slide art plates | the saved image model's `image.*` row | host tool at $0 on the allowance; gpt-image by its saved quality tier; Z-Image and MLX at $0. `cost-preview.js` reads the saved model for every still |
| Generated video | the saved video model's row (`seedance.*`, `veo.*`, `video.host`, `video.astra`, `video.mlx`) | Veo bills generated length (1080p is 8s-only, so a 4s cut pays 8); Seedance bills the requested seconds; a reference-video lane bills input plus output seconds |
| Narration | `tts.gemini-*` or `tts.elevenlabs*` by the saved speech model | quantity is characters ÷ 1000; ElevenLabs logs the metered header, not the text length (cost-tally.md) |
| BGM | one 30s `music.lyria-clip` | variable-length `music.lyria-realtime` has no confirmed price, so its row is `?` and the report stops on it |
| Ken Burns stills, HTML motion slides, ffmpeg assembly | free | the builder's work; no vendor call |

Measured points worth keeping as history: a still-only short with one gpt high cover ran
about $0.27–0.29; a 6 s previz-guided hook on Seedance 2.0 mini 720p about $0.54 and
$2.74 on 2.0 1080p; a Veo lite 1080p 8 s b-roll added $0.64. In blind-arena
testing Veo standard, fast and lite were statistically identical, so the quality that
money buys there does not measure (video-model-selection §quality).

## Choosing cuts before pricing them

Choose the treatment before estimating its cost. Use
[render-routing.md](../../storyboard/references/render-routing.md) for each cut, including the
opening. Still-camera, character HTML, object HTML and data-graph cuts consume no generated
video. Generate video only for essential continuous motion. The episode's ratio choice
([production-mode.md](../../storyboard/references/production-mode.md)) is the planning target
and the cost ceiling: fewer generated cuts than the target is reported, never padded. A channel
may explicitly require a video opening (`hook_video: on` in the profile); it is not the plugin
default. Recalculate from the selected assets with `cost-preview.js`.

## The cap — a ceiling, not a quota

A growth plan's `max_cost_per_video` (template default **$1.00** since 2026-09-05; plans
written earlier carry $0.30) is the per-episode spending authorization of an unattended
episode. The profile's `video_budget_usd` (plugin default $10) bounds generated video in the
storyboard check. Neither is a target to spend up to.

**The cap verdict happens before spending** — the procedure and the priority between the
saved ratio and the plan's caps are in
[unattended-lifecycle.md#cap-check](unattended-lifecycle.md#cap-check). Over the cap, reduce
the plan under the same saved models; never switch engines. If a profile's `hook_video: on`
asks for a clip the cap cannot pay for, the tick stops before spending and names the cap in
its report; the two ways out are both user settings — raise `max_cost_per_video`, or set
`hook_video: off` so the still cover with the `punch` move opens the episode again.

The estimate is `.work/cost-estimate.tsv` and the actual ledger is
`.work/cost-tally.tsv` — separate files (mix them in one and the post-hoc
report counts the same spend twice). Mid-generation re-verdicts also use the
estimate file: when you decide to regenerate, put that line on the estimate
and rerun `--cap`. Judge against the actual ledger alone and the spend that hasn't
gone out yet (BGM, narration) is missing, the total looks small, and a
cap-busting regeneration passes.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
$REF/cost-report.sh .work/cost-estimate.tsv --cap 1.00; echo "cost_exit=$?"
```

Read `cost_exit` literally — 0 within / 1 **verdict unavailable** / 2 over the
cap / 3 input error. **Never read 1 as a pass.** Hit an unknown key or an
unconfirmed price (`?`) and the total can look like 0. That doesn't mean free
— it means the math didn't happen.

Daily and weekly cumulative caps accumulate in the channel-shared
`data/<channel>/growth/autoproduce.json`; the growth loop checks them before authoring
([daily cap](unattended-lifecycle.md#daily-cap) · [cap check](unattended-lifecycle.md#cap-check)).

## Non-money budgets — search quotas

What the research stage spends isn't money — it's quota. These are guidance for spending
it well, not a search count to hit or a limit that discards a topic.

- **`naver_search`, 25,000/day** — the first tool for Korean material. Start here.
- **Built-in WebSearch** — general-purpose and international.
- **`serp_*`, 250/month (free)** — precision searches; about two per automated episode is
  the usual need. Don't repeat the same search with a different tool.

## When updating a price

Edit one file only: `prices.tsv`. Keep the evidence grade
(official/derived/unverified) and the source on the same line, and leave
unconfirmed values as `?` — a `?` fails the report and summons a human. Fill
in an invented number and the cap is silently disarmed.

Veo's per-second prices were promoted to **official** on 2026-08-15 after
opening the official pricing page directly (the Seedance side is **derived** —
official example prices divided by seconds). The Lyria clip price was promoted
the same day. The one item still unconfirmed is **`music.lyria-realtime`** — the
official price table has no row for it at all. One billed call and an actual
invoice would upgrade its grade.
