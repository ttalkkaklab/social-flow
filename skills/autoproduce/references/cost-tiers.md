# The model ladder — start cheap, move up only when the metrics say so

> **Freshness** — verified 2026-08-15 · source: vendor pricing pages plus our own measured
> runs; the numbers themselves live in [prices.tsv](prices.tsv), which this file never copies ·
> recheck every 90 days.

The default for an automated episode is **a build that never calls a video
generation tool**. Three or four still images with Ken Burns on top, plus
narration, subtitles, and BGM. About **$0.27–0.29** per episode (the cover
background is the meta image, so quality high — absolute rule 12. It's this
build's biggest cost item). One Veo call from here nearly quintuples the
price, so the metrics decide whether to make it.

This document sets the ladder and the escalation conditions. **No price
numbers live here** — `prices.tsv` is the source of truth and `cost-report.sh`
reads only that. Write a number in two places and one of them always goes
stale.

## Contents

- [Why Ken Burns is the default](#why-ken-burns-is-the-default)
- [Economy baseline (the automated-authoring default)](#economy-baseline-the-automated-authoring-default)
- [Escalation — one opening b-roll slot](#escalation-one-opening-b-roll-slot)
- [What autonomous authoring doesn't use](#what-autonomous-authoring-doesnt-use)
- [The cap — over it, drop the escalation and go economy baseline](#the-cap-over-it-drop-the-escalation-and-go-economy-baseline)
- [Non-money budgets — search quotas](#non-money-budgets-search-quotas)
- [When updating a price](#when-updating-a-price)

## Why Ken Burns is the default

Veo 3.1 makes at most 8 seconds per call. Fill a 60-second video with
generated footage alone and you're pulling eight clips and stitching them —
and the stitching edit layer is needed anyway. That leaves exactly one
question — **which slot gets generated video.**
The evidence and Veo hard specs are canonical in the
[AI video production guide](../../../docs/guides/ai-video-production/index.html).
That document's §9 notes that "without a per-episode budget there is no
principled way to decide which scene gets generated video." This document
fills that blank.

The answer is **the first 3 seconds only**. A still-frame hook gets scrolled
past — short-form operating common sense. In the body the photos show as-is
(absolute rule 14 — captions use only the top band), but the shot changes per
scene and Ken Burns, caption swaps, and subtitles carry the rhythm, so it
reads less like stills even without generated video. That's why even when
escalation is needed, only **the one cover slot** goes up.

## Economy baseline (the automated-authoring default)

| Layer | What's used | Notes |
|---|---|---|
| Cover background | `gpt_image_text2img` quality **`high`**, 1088x1920, 1 image | Photorealistic human scene (default: a Korean woman) — the cover frame becomes the thumbnail as-is (absolute rule 12). On escalated episodes it doubles as the veo source |
| Points backgrounds | `image_local_generate` (local Z-Image) 1088x1920, **2–4 images** — **$0** | The photo is the star (absolute rule 14) — captions use only the top band so the photo shows in full. Change the shot when the content axis changes. Only machines without mflux fall back to `gpt_image_text2img` quality `low` ($0.007/image) |
| Motion | ffmpeg Ken Burns still lane (eased zoom · focus · pan · punch · drift, 3.5%) | The builder already does this. **Zero Veo calls** |
| Narration | whatever engine profile §2 says | `local` (Supertonic) costs 0; `gemini` bills per 1,000 characters |
| BGM | one 30s `music_generate_clip` | The builder crossfades it onto itself to reach length. Variable-length generation has no confirmed price, so it isn't used — which also means the economy tier takes one bed, not cues |
| Subtitles | the builder emits `subs.srt`·`subs.ass` together | free |

With points backgrounds moved to local Z-Image (2026-08-12), that share
($0.007 × 2–4 images) drops out — a local-TTS channel runs **about $0.26** per
episode (1 high image + 1 BGM clip); a Gemini-engine channel adds **$0.015**
for a 400-character narration, about $0.275. The image-count cap also stops
being about cost (pick 2–4 purely on screen rhythm).
The old arithmetic returns **only on the mflux-missing fallback (gpt low)** —
recomputed from prices.tsv: local $0.274 (2 low images) to $0.288 (4), Gemini
$0.289–$0.303, and **a Gemini channel using 4 low images busts the default
$0.30 cap.** Use at most 3 ($0.296) in that case.

> **Never switch engines on your own.** "Narration costs 0" is true only when
> the channel is already set to `local`. Move a `gemini` channel to local
> because it's cheaper and **the narrator turns into a different person
> partway through the channel's run** — the exact accident the produce skill
> forbids. Engine changes happen only when the user edits profile §2.

## Escalation — one opening b-roll slot

**The schema allows 2 slots (scenes-schema §broll), but the unattended path
escalates at most 1 on its own** — the opening b-roll in the segment after the
cover. Veo bills on generated length (8s), so one more slot doubles the
episode's spend — a call a human makes when approving the storyboard, not
something the unattended loop decides autonomously. If a human-approved
storyboard has 2 slots written in, then **make both as written** — quietly
dropping an approved scene over cost makes the video diverge from the plan
(that episode's budget is guarded separately by §the cap).

`veo_img2video` animates that slot's source PNG (for the opening slot, the
cover background).

```
model veo-3.1-lite-generate-preview · 1080p · 8s generation · 9:16
Used length is the broll scene's duration (default 4s) — produce §6 cuts only the head of the original.
The source must be the already-made cover-background PNG — veo_text2video is never used (absolute rule 8),
and the plan passes the author's rule-13 check first.
Prompt = the storyboard's stored visual.prompt, sent verbatim (scenes-schema §clip prompt);
fallback on older files is English, motion only — re-describing the person, background, or lighting
already visible in the source image degrades the result (Google's official image-to-video guidance).
Camera in veo vocabulary — a closing-in shot is dolly in, not push in.
e.g. "very slow dolly in, nearly static camera, subtle particle drift.
     Audio: quiet room tone, no music, no speech."
```

Billing is on **generated length (8s)** — using only 4 doesn't cut the cost.
Cutting it would mean dropping to 720p (4s and 6s generation allowed), which
the 1080×1920 body would need upscaled, so it isn't used (user decision
2026-08-11 — "if it needs upscaling, just use 1080").

**The cover itself never escalates.** Veo can't write Korean, so the cover
(hook title, hero figure) is code-rendered (produce absolute rule 10). The
b-roll attaches **after** the cover.

**No narration over that segment** — the video's own sound plays (absolute
rule 9). That saves one scene's worth of TTS calls. In exchange there's one
more `splice-clip.sh` splice step, and **no palindrome loops** (forward +
reverse means the audio plays backwards).

1080p·8s generation costs more than 720p·4s. It's still the combination, for
two reasons — the body is 1080×1920 so 720p would need upscaling, and the API
allows 1080p only at 8 seconds. "Only as much as needed" happens in the **used
length** (the trim), not in generation.

**Escalation conditions are observed values, and the verdict is a trend, not
an absolute threshold** (revised 2026-08-15). With an absolute threshold (say,
skip over 55), a channel whose measured numbers sit above it permanently — our
own channel's four reels all measured 84.8–93.8 — turns the unattended loop
into **every episode escalated = every episode at 5x cost**, and that money
doesn't fix the problem, because the b-roll attaches *after* the cover while
the skipping happens *inside* it. So the three verdicts become:

| Platform | Metric | Escalation verdict |
|---|---|---|
| YouTube | `averageViewPercentage` | last-3-episode average **down 5+ points from the previous 3** |
| Instagram | `reels_skip_rate` | last-3-episode average **up 5+ points from the previous 3** |
| Common | under 6 published episodes (no comparison window) | **no escalation** |

**`reels_skip_rate` arrives as a percentage, not a 0–1 ratio** — measured
values print like 85.5 (2026-08-15, our own channel's reels). Same unit as
`averageViewPercentage`.

**Right after a hook-contract revision, unattended escalation is frozen** —
from the cover segment-① contract (scenes-schema §segment ① is a promise to
the viewer, 2026-08-15) until 3 new-baseline episodes accumulate, skip the
escalation verdict entirely and run economy baseline only. Once the hook
changes, earlier episodes' metrics are no comparison.

Escalation is **per episode** — if the condition stays true the next episode
escalates too, but nothing locks into an "escalated mode" automatically.

## What autonomous authoring doesn't use

These aren't excluded over money. They're excluded because **they need
judgment**.

- **`veo-3.1-generate-preview` (standard) · 1080p · 4K** — 8 seconds of
  standard is $3.20 per episode. Sixty times the economy baseline is not a
  decision for an unattended loop. And the price isn't the only problem — in
  blind-arena testing, standard is statistically identical to lite and fast,
  so the quality that money buys doesn't measure (video-model-selection
  §quality).
- **`veo_reference` (character speech clips) · `veo_extension`** — the lite
  tier doesn't support them at all, and character acting is footage a human
  should look at.
- **`seedance_*` (the second video engine)** — the unattended loop's
  escalation slot is the opening b-roll, and that segment **uses the clip's
  own audio** under produce absolute rule 9. Put the cheaper silent engine
  there and 4 seconds go quiet — a swap that hurts the result, not the wallet.
  The spot where Seedance wins with nothing lost is motion backgrounds that
  throw the audio away (`visual.video`), and the unattended path doesn't use
  that slot. The prices sit in `prices.tsv`'s `seedance.*` rows, so when a
  human uses that slot in a storyboard the tally works as-is. The decision
  table's source of truth is
  `skills/produce/references/video-model-selection.md`.
- **`suno_*` (sung full songs and loop beds)** — about $0.06 and 2–3 minutes
  per call, and vocals fight the narration. The unattended path stays on the
  30-second `music_generate_clip` instrumental. An episode where the song is
  the content goes through the human produce path's `suno_generate`.
- **Emotive acted narration** — mix two TTS engines in one video and the
  differing sample rates break the concatenation (ElevenLabs at its default
  `wav_24000` matches Gemini's 24kHz and could share a timeline; local 44.1kHz
  can't join either). A topic with shots that need acting is **not
  automated-authoring material** — a human starts it with
  `/social-flow:storyboard`.
- **Quality escalation for points backgrounds** — no text goes into
  backgrounds (negative directives block it, and all screen text is
  code-rendered). Only on a P0 finding that a background is smeared,
  regenerate once at `medium` for that episode alone, and **re-run the cap
  verdict before regenerating** — economy baseline is already ~$0.27, so a
  medium regeneration (+$0.05) busts the default $0.30 cap. On exit 2, don't
  regenerate; report that P0 to a human as unresolved.
  (The cover background is already high, so it never escalates.)

## The cap — over it, drop the escalation and go economy baseline

The plan's `max_cost_per_video` (default **$0.30**) is the per-episode cap.
With the cover background at high (absolute rule 12), this value **passes only
the economy baseline (~$0.27) and blocks every veo escalation** — a
lite·1080p·8s escalation runs about $0.91 per episode (economy baseline +
$0.64), so the cap has to rise to **$1.00 or more** to let it through (before
2026-08-15 it was fast at $1.23 with a $1.30 cap — the three tiers' quality
differences fell inside the confidence interval in blind-arena testing, so we
dropped to the cheapest tier. `max_cost_per_video` itself is a user setting
and wasn't touched). The unattended loop never decides a cap raise — until the
user raises it in the plan, episodes are made at economy baseline even while
the escalation condition is true (and the completion report says so).

**The cap verdict happens before spending.** At the moment escalation is
decided, run `cost-report.sh --cap` on the projected tally; on exit 2, cancel
the escalation and go economy baseline. Don't abort — there's no reason not to
make the episode cheaply when you can.

The estimate is `.work/cost-estimate.tsv` and the actual ledger is
`.work/cost-tally.tsv` — separate files (mix them in one and the post-hoc
report counts the same spend twice). **Mid-generation re-verdicts also use the
estimate file** — when you decide to regenerate, put that line on the estimate
and rerun `--cap`. Judge against the actual ledger and the spend that hasn't
gone out yet (BGM, narration) is missing, the total looks small, and a
cap-busting regeneration passes.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
$REF/cost-report.sh .work/cost-estimate.tsv --cap 0.30; echo "cost_exit=$?"
```

Read `cost_exit` literally — 0 within / 1 **verdict unavailable** / 2 over the
cap / 3 input error. **Never read 1 as a pass.** Hit an unknown key or an
unconfirmed price (`?`) and the total can look like 0. That doesn't mean free
— it means the math didn't happen.

Daily and weekly cumulative caps accumulate in the channel-shared
`data/<channel>/growth/autoproduce.json`, and the growth loop checks them
before authoring (SKILL.md §load · lock · budget).

## Non-money budgets — search quotas

What the research stage spends isn't money — it's quota. Run out and that
day's research is blocked, so spend it as carefully as the ladder.

- **`naver_search`, 25,000/day** — the first tool for Korean material. Start
  here.
- **Built-in WebSearch** — general-purpose and international.
- **`serp_*`, 250/month (free)** — precision searches only. **At most 2 per
  automated episode**. Don't repeat the same search with a different tool.

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
