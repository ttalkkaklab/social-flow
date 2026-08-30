# Channel intro playbook — best-practice SoT

The rationale document for intro (logo sting) design, prompting, and review
criteria. The intro skill pulls concept design and veo prompts from here.
Sources at the end.

## Contents

- [1. Placement — where it belongs, and where it must not go](#1-placement-where-it-belongs-and-where-it-must-not-go)
- [2. Length & timing contract](#2-length-timing-contract)
- [3. Designing the 4 concepts (for the HITL pick)](#3-designing-the-4-concepts-for-the-hitl-pick)
- [4. Character acting — motion design](#4-character-acting-motion-design)
- [5. The L.O.G.O. prompt formula (veo skeleton)](#5-the-logo-prompt-formula-veo-skeleton)
- [6. Channel-name reveal — text is deterministic render only](#6-channel-name-reveal-text-is-deterministic-render-only)
- [7. Sonic logo — a channel asset](#7-sonic-logo-a-channel-asset)
- [8. The final-frame contract (the most important rule)](#8-the-final-frame-contract-the-most-important-rule)
- [8.5 Field notes (2026-07-29 ttalkkak-lab E2E)](#85-field-notes-2026-07-29-ttalkkak-lab-e2e)
- [9. Common failures and corrections](#9-common-failures-and-corrections)
- [Sources](#sources)

## 1. Placement — where it belongs, and where it must not go

**Never put a brand intro in front of short-form content.** 50–60% of viewer
drop-off happens within the first 3 seconds, and logo animations or channel
title cards push the hook back and cut retention directly. In short-form,
branding is carried by style consistency (theme colors, subtitle tone) and the
outro.

Legitimate uses of the intro assets:

| Use | Asset | Notes |
|---|---|---|
| Channel trailer, profile intro video | master | YouTube channel page, pinned intro video |
| Series opener (spliced into the opening) | stinger ≤2.5s | placed after the hook — never before it |
| Ending brand moment | stinger | spliced before outro.mp4 (same encoding contract) |
| Live / premiere waiting screen | master loop | — |

**Use the same intro and the same sonic logo every time** — consistent
branding builds trust and recall (in a 2025 survey, 78% of viewers trusted
consistently branded channels more). Don't regenerate per topic.

**Default use (user-confirmed 2026-07-29)**: a brand closing **spliced after**
the main video — it's a build-once fixed asset, so voice and sound stay
intact, and it shares the encoding contract with build-reel/build-outro, so
xfade splicing just works.

## 2. Length & timing contract

- **master (4-second standard — user-confirmed 2026-07-29)**: veo **4s render
  (720p)** + 0.8s ending hold = **4.8s**. A post-roll closing is better the
  shorter it is (the bottom of the 3–7s logo-sting standard). For the
  4-second constraint see the field notes in §8.5.
- **Long version (trailer-only option)**: 8s render (1080p — 1080p is
  8s-only) + hold, with `TRIM_START` down to the 7s range recommended.
- **stinger**: **≤2.5s** — the social-splice standard (1–2.5s).
- **Ending sequence** (build-intro.sh default): channel-name reveal (1.2s
  before landing) → sonic-logo impact (0.2s before landing) → real-pixel
  lockup crossfade (0.6s) → freeze hold (0.8s).
- **Sonic logo**: 2–5s — the impact must align with the character/logo
  landing frame.

## 3. Designing the 4 concepts (for the HITL pick)

Before any veo call, **present 4 distinct concepts as options** and let the
user pick — generating multiple video candidates to choose from is banned on
cost. Design the 4 so the combinations of the axes below don't overlap, and
spread the emotional register (energy | trust | wit | cinematic).

- **Character action**: a signature gesture symbolizing the channel is the
  top candidate — the profile character shows with its body "what this
  channel does" (e.g., a click channel does the click gesture, an experiment
  channel mixes reagents).
- **Scene mood**: variations within the profile §3 background mood guidance
  (minimal studio | mini scene with props | abstract light | close-up
  entrance).
- **Sonic-logo character**: melodic synth sting | percussive impact |
  signature SFX motif (e.g., a mouse click made musical) — matched to the
  concept's emotional register.

Each option = label + scene scenario (what the character does at which
second) + sonic-logo description. The user may ask for a blend ("A's action
with C's mood") or a full redesign.

## 4. Character acting — motion design

The star of the intro is the profile character. It acts in 3 beats —
**entrance → signature gesture → settling front-facing** — and the final pose
converges to the character position and size on the lockup card.

| Gesture type | Description skeleton | Fits |
|---|---|---|
| **Signature action** | performs the channel's symbolic action, then looks straight at camera | mascots (default) |
| **Entrance & greeting** | walks in from off-frame, waves or bows | human-style, mascots |
| **Symbol assembly** | geometric fragments converge into the finished symbol | emblem/abstract logos |
| **Light sweep** | a beam sweeps across, revealing the symbol | all types (safest) |
| **Ink/light bloom** | accent light blooms into a silhouette | illustration logos |

Common rules: camera is `slow dolly in` or `static` — shake and fast cuts
cause motion sickness on small screens. **veo doesn't know `push in`** — the
word `push` appears 0 times in the full Vertex prompt guide, and the vendor
name for the approaching move is `dolly in` (camera research §02). Describe
motion with **decelerating easing**, and make the last second nearly static.
Effect stacks (particles+glitch+smoke at once) are the number-one reason
results look cheap — **one motion idea only**.

**Camera height is eye level.** Looking up or down at the character changes
the impression of size and power but not likability (p>.05), and in a short
frontal close-up, eye level is what gets trusted most (p=.007). An intro is
the channel's first greeting, so trust is the axis that wins here — use a low
angle only when you deliberately want the character to loom large.

## 5. The L.O.G.O. prompt formula (veo skeleton)

Generative models react to vague words like "cinematic" and "premium" by
**redesigning the character and logo**. Always order the prompt
`brand protection → single motion → sound → output spec`:

- **L — Logo rules (preservation)**: "Keep the mascot exactly on-model as shown in the
  reference/final frame — same shape, proportions, colors. Do not redraw or
  restyle."
- **O — Occasion (use)**: "9:16 vertical channel intro sting for social media."
- **G — Gesture (single motion)**: **one** from §4. State the timing split
  ("first 4 seconds …, then settles …").
- **O — Output (spec)**: "Slow confident easing, ends settled in the exact pose
  and framing of the final frame, last second nearly static."

**Exclusions go in the `negativePrompt` argument, not the prompt body.** The
grammar is a comma list of nouns and adjective phrases; don't write directives
like "no ~" — the Veo prompt guide marks that form not recommended, and
writing a noun you want excluded into the body makes the model draw it
(local image field test: 4 out of 4 failed).

Standing values: **`text, letters, captions, subtitles, watermark, lens flare, particle
effects, glitch effects`** (the channel name is handled by the deterministic
plate — §6) + the profile §3 banned subjects as noun phrases. Music too — add
`music, background score`. Musical content collides with the sonic logo (§7).
For audio, describe only motion SFX in the prompt body.

Rationale: `docs/research/2026-08-15-veo-seedance-prompting/` §03.

## 6. Channel-name reveal — text is deterministic render only

The intro must say "what channel this is" within 3 seconds — **channel name +
tagline (the content promise compressed, 2 lines max)** must appear on
screen. But text left to a generative model produces typos and near-glyphs
(P0). The contract:

1. Render text via `lockup-template.html` → headless capture (full lockup +
   transparent text plate). Every veo call puts `text` in `negativePrompt`.
2. build-intro.sh slides the text plate in just before landing (`TEXT_AT`) —
   the name reads first without covering the character's acting, then hands
   off to the lockup.
3. The three capture modes (full/text/char) share identical coordinates — the
   plate and the lockup match pixel-for-pixel, so the transition doesn't show.

## 7. Sonic logo — a channel asset

Three beats: **rise → impact (logo hit) → tail (decay)**, 2–5s. Generate with
`music_generate_clip` (Lyria), reflecting the concept's emotional register in
the prompt:

> "A 2.5-second sonic logo: soft rising synth swell, one warm confident
> impact, short airy decay. Clean, modern, memorable. No vocals."

- **Once confirmed, the sonic logo is locked and reused as a channel asset**
  (`<slug>-sonic-logo.wav`) — the value of sonic branding comes from
  repetition. Regenerate only when the user explicitly asks.
- build-intro.sh owns the mix: the impact aligns to the landing frame
  (`SONIC_AT`), and veo's native SFX sits underneath via sidechain ducking.
- Final loudness **-14 LUFS / TP -1.0** (same contract as main videos and the
  outro — no level jump at splices).

## 8. The final-frame contract (the most important rule)

**The final frame must exactly match the real brand lockup.** An intro that
ends on a generative approximation damages the brand asset. Three safeguards:

1. Put the **char card** (character lockup without text) in `veo_img2video`'s
   `lastImagePath` so the motion converges to the final pose.
2. build-intro.sh **crossfades the real-pixel full lockup** over the ending
   (`LOCKUP_XF`, 0.6s), wiping residual generation distortion.
3. The `HOLD` (0.8s) freeze lets the lockup sink in.

At no stage do logo, character, or text pixels ship as generative-model
output — the lockup is always the HTML-capture composite.

## 8.5 Field notes (2026-07-29 ttalkkak-lab E2E)

- **Native speech (veo audio dialogue) passes only in minimal form** — the
  `The mascot says: "<channel name>"` form generates, but adding style
  modifiers to the speech (cheerfully, announcer voice, rising tone) fails
  the audio safety filter. The voice differs per generation, so **sonic
  branding can't be locked in**, and the model picks the speech timing
  (measured: in 4s renders speech clusters at 0.4–2.1s and the text-reveal
  span is silent). That said, the intro is a build-once fixed asset (§1
  default use), so **keeping one well-generated native take as the asset is
  valid too** — the remaining edge of separate TTS is timing alignment with
  the text reveal and retake selection. Listen together with the user and decide.
- **durationSeconds=4 is 720p-only** (1080p is 8s-only) and **lastImagePath
  interpolation is rejected** (400 "use case not supported"). For 4s renders:
  first frame = char-card + "the framing and crop never change" in the
  prompt; ending alignment is guaranteed by the lockup crossfade. The build
  upscales the 720p source to 1080×1920.
- **Stretched TTS pronunciation is risky** — a "따알~~깍" directive either
  splits and over-stretches syllables (깍 broke off as a 0.1s burst) or
  returns a 500. Generating at natural pace and compressing only the silences
  is more stable; when compressing silences, verify with silencedetect that
  **every speech burst survived**. If a stretch overshoots, tighten just that
  segment with atempo (≤1.3).
- **The ffmpeg trim trap (cause of the silent-sting incident)** — an
  output-side `-ss` after `-i` applies **after** `-af`: `afade=t=out:st=1.9`
  ran first against the source timeline, muting the whole back span before
  the cut. When cutting part of a source together with a fade, always put
  **`-ss` before `-i` (input seeking)**. Before the gate, measure the
  premix's impact/hold energy with volumedetect (it was the reviewer who had
  to go all the way to a spectrogram — catch it at the build stage first).

## 9. Common failures and corrections

| Symptom | Correction |
|---|---|
| Character off-model (shape/color drift) | strengthen the L rules; switch to veo_reference with 1–3 reference images |
| Letters or near-glyphs appear | put `text, letters, captions, subtitles` in `negativePrompt` and regenerate (writing "no text" in the body backfires) |
| Effect soup | keep one gesture, delete the rest + `particles, smoke, sparks` in `negativePrompt` |
| Motion stays busy to the end | "last second nearly static, settles into the final frame pose" |
| Stalled first 1–2 seconds | cut with `TRIM_START` instead of regenerating (post is cheaper) |
| Sonic logo misses the landing | adjust `SONIC_AT` instead of regenerating (post is cheaper) |
| Final pose far from the lockup | check lastImagePath; re-emphasize "ends in the exact pose of the final frame" |

## Sources

- [Renderforest — How Long Should a YouTube Intro Be](https://www.renderforest.com/blog/how-long-should-youtube-intro-be) · [Intro Video Length by Platform](https://www.renderforest.com/blog/intro-video-length-by-platform) — length standards (1–5s, 3–5s safe default); Shorts exclude traditional intros
- [Renderforest — AI Logo Animation Prompts](https://www.renderforest.com/blog/ai-logo-animation-prompts) — the L.O.G.O. formula, single motion, final-frame match rule
- [Wheelhaus Media — All about logo stings](https://www.wheelhaus.media/blog/all-about-logo-stings) · [Motion Array — Logo Stings](https://motionarray.com/learn/video-effects/logo-stings/) — logo sting 5–10s cap, mobile optimization, sound as a Sonic ID
- [OpusClip — Ideal YouTube Shorts Length & Format](https://www.opus.pro/blog/ideal-youtube-shorts-length-format-retention) · [Virvid — First 3 Seconds](https://virvid.ai/blog/first-3-seconds-hook-faceless-shorts-2026) — 50–60% drop-off in the first 3 seconds; branding via style
- [InfluenceFlow — YouTube Channel Branding 2026](https://influenceflow.io/resources/youtube-channel-branding-best-practices-complete-2026-guide-for-creators/) — consistent-branding trust (78%)
- [Voices — Sonic Logos Master Class](https://www.voices.com/blog/sonic-logos/) · [ZillionDesigns — Sonic Logos](https://www.zilliondesigns.com/blog/sonic-logo-and-the-sound-in-branding/) — sound logos 2–5s, reflecting brand attributes
