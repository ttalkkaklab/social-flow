# Channel profile template

Copy this to `data/<slug>/profile.md` and fill in the values. Every section is
required — the storyboard/produce/publish skills parse this structure as written.

```markdown
---
name: <channel display name>
slug: <kebab-slug>
status: active            # active | archived
created: <YYYY-MM-DD>
---

# <channel display name>

## 1. Identity

- **Topic area**: <one sentence for the range this channel covers — storyboard and
  autoproduce check every new topic against this axis (outside it means confirm or
  discard), so write it narrow enough to filter with.
  "tax savings and year-end settlement for Korean office workers", not "personal finance">
- **Target audience**: <who watches, in what moment — e.g. expat families in Vietnam, scrolling on the commute>
- **Content promise**: <the value every video keeps — e.g. one immediately usable piece of information within 60 seconds>
- **Logo asset**: `data/<slug>/assets/branding/<slug>-logo-master-1024.png` —
  if missing, generate it with /social-flow:branding (per-platform resizes
  `-youtube-800` · `-instagram-320` · `-192` are derived automatically)

## 2. Tone & voice

- **Register**: <polite explanatory (존댓말) | casual punchy (반말) | documentary narration | ...>
- **Narrator personality**: <e.g. a calm news-briefing anchor>
- **TTS voice (fixed — do not change)**:
  - Engine: `<local | gemini>` — the default for narration is `local` (zero cost,
    6.3x real time); use `gemini` only when acted emotion is the channel's identity
  - With local → voice: `<F1~F5 | M1~M5>` · lang: `ko` · speed: `<0.7~2.0, default 1.05>`
  - With gemini → voiceName: `<Gemini voice name>` ·
    stylePrompt: `<the English style direction — reused without changing a character>`
  - Target speaking rate: <characters/sec, default 4.5>
- **Plain-language principle**: no unexplained jargon, no literal translationese, no
  over-compressed subjectless sentences. When a term is genuinely needed, lead with
  the plain word and put the term in parentheses on first appearance only. (Screen
  text, narration, subtitles, and captions — all of it.)
- **Banned**: <expressions and subjects this channel doesn't touch>

## 3. Visual theme

The THEME contract of video-template.html — it goes into scenes.js as-is:

```json
{
  "accent": "#5b8cff",
  "accent2": "#a05bff",
  "ink": "#0b1020",
  "brand": "<the brand/channel name shown in the outro>"
}
```

- **Background mood prompt direction**: <the mood description always appended to
  image-generation prompts — e.g. "deep indigo and electric blue color grade,
  cinematic, moody, lower third fading into darkness">
- **Required background negatives**: "no text, no logos, no signage, no readable characters,
  face not visible, no flags, no national emblems, no maps, no government buildings"
- **Banned subjects**: <per-channel additions — real people, specific places, etc.>

## 4. Publish platforms

| Platform | Used | Notes |
|---|---|---|
| threads | ✅/❌ | no video — one casual post body + a video link (IG reel), no attached image |
| instagram | ✅/❌ | reels — needs public HTTPS hosting |
| facebook | ✅/❌ | ordinary video post (not a reel) |
| youtube | ✅/❌ | shorts — local upload, 100 uploads/day quota |

- **Per-platform signature**: <hashtag set, CTA wording — within the platform's grammar>
- **Public media hosting**: <how to upload publicly over HTTPS for IG/FB — if there
  isn't one, write "undecided" and settle it at publish time. Threads attaches no
  media, so it needs no hosting>

## 5. Fact-check policy

- **Research required?**: <required (informational) | skipped (creative, daily life)>
- **Preferred search tools**: naver_search (Korean material first) → WebSearch (general) → serp_* (precise, overseas)
- **Cross-check rule**: time-sensitive values (prices, tax rates, deadlines, effective
  dates) need two or more independent sources; a claim that fails verification stays
  out of the body.

## 6. Intro · outro

- **Intro assets (optional)**: `data/<slug>/assets/intro/<slug>-intro-master.mp4`
  (for trailers and channel introductions) · `<slug>-intro-stinger.mp4` (for splicing, ≤2.5s) ·
  `<slug>-sonic-logo.wav` (the sonic logo — shared across all videos) — generate with /social-flow:intro.
  The default use is **splicing after the main video** (a brand close — a fixed asset made once).
  **Never placed in front of a short-form main video** (the first-3-seconds hook principle — the uses are in intro-playbook.md §1)
- **Wording**: <the brand closing script — e.g. "이런 정보, 매주 올라옵니다. 팔로우하고 이어서 보세요." ("More like this every week. Follow and keep watching.")>
- **Asset path**: `data/<slug>/assets/outro/default.mp4` — if missing, generate it on
  the first produce run with build-outro.sh and save it here (don't regenerate per topic).
  When the wording differs per platform, keep `outro/youtube.mp4` and `outro/instagram.mp4`
  and put the ids in the catalog. resolve-asset also finds the old `assets/outro.mp4`.
- **Catalog**: `data/<slug>/assets/catalog.md` — the kind+id table for shared assets.
  The conventions are in `references/assets-catalog-template.md`.

## 7. Operating rules

- **Topic slug rule**: <e.g. YYYYMMDD-keyword | series-name-NN>
- **Series**: <the series names and numbering in use — "none" if there aren't any>
```

## Gemini TTS voice examples (by tone)

| Tone | voiceName | stylePrompt example |
|---|---|---|
| calm news briefing | Charon | Korean news brief narrator. Calm, informative, steady moderate pace, clear articulation, neutral broadcast tone. |
| warm brand narrator | Sulafat | Korean, warm brand narrator. Inviting, confident, gentle close, moderate pace. |
| bright creator | Leda | Korean, friendly young content creator. Bright but clear, engaging, moderate pace, not overly excited. |
| precise expert | Erinome | Korean, precise professional. Calm, clear, professional, measured moderate pace. |
| approachable practitioner | Achird | Korean, hands-on field practitioner. Friendly, direct, practical, moderate pace. |
| weighty senior | Sadaltager | Korean, authoritative senior advisor. Knowledgeable, deliberate, calm weight, moderate pace. |

- stylePrompt is **standardized on "moderate pace"** — the build's atempo normalization owns the speed decision.
- The full voice list is available via `mcp__social-flow__tts_list_voices`.

## Local TTS voices (Supertonic)

Ten voices: `F1`~`F5` (female) and `M1`~`M5` (male). The vendor publishes no
personality labels, so there's no tone table like the one above — **render the same
sentence in two or three voices, listen, and pick.** Assigning one per channel and
pinning it keeps the voice consistent, so being limited to ten fixed voices doesn't
hurt in practice.

How to audition — render one real narration sentence from that channel (a short
greeting won't show the texture):

```
mcp__social-flow__tts_local_generate
  text: "<two representative narration sentences>"  voice: "F1"  lang: "ko"
  outputPath: "data/<slug>/assets/scratch"  filename: "voice-test-F1.wav"
```

Play them with `afplay` to compare, then write the chosen value into §2 above.

There's no style-direction argument, so the tone comes **from the sentences
themselves** — cut them short and punctuate properly and the delivery settles.
