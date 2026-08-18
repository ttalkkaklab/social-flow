# Video engine selection — Veo and Seedance

This plugin has two video generation engines. They're not substitutes — they're good at
different things.

- **Veo 3.1** (`veo_*`, `GEMINI_API_KEY`) — native audio, extending local files, live-action person references
- **Seedance** (`seedance_*`, `ARK_API_KEY`) — free-form length/ratio, much cheaper silent cuts, up to 30 reference images

This document is the source of truth for choosing between the two engines. Tool descriptions
carry their own summaries of it, and `skills/autoproduce/references/prices.tsv` is the source
of truth for unit prices.

Reference date 2026-08-15. The Seedance side was verified by opening the official BytePlus
ModelArk docs directly, with the write-up in `docs/api-reference/seedance.html`. The Veo prices
come from the repo's existing reference (`docs/api-reference/gemini-veo.html`, 2026-07-29) and
are unverified grade, so cross-engine cost comparisons are trustworthy to the order of
magnitude, not to the multiplier.

---

## The four selection rules — decide in this order

So we don't reread the price sheet and arena rankings every time, the conclusions are frozen
into four lines.

**1. If the source contains a live-action person, 2.x is out.** The Dreamina Seedance 2.5/2.0
family rejects input faces, so the choices are the three Veo tiers and Seedance 1.x. This rule
comes first — price and quality come after.

We probed both sides with the same face PNG (2026-08-15). Seedance 2.0 rejected it at
`first_frame` (`InputImageSensitiveContentDetected.PrivacyInformation`); **Veo 3.1 lite
passed**, produced 720p 4s, and the face held for all 4 seconds. Note the only mode actually
tested was `veo_img2video` — `veo_reference` has the same policy on paper but is untested
(fixed 8s, so verifying costs about $0.80). **Veo also blocks children's faces** — photo or
illustration, anything that looks underage is blocked (`Support code: 17301594`), and
permission goes through trust & safety policy review. Details in
`docs/api-reference/veo-portrait.html`.

**2. Once you've picked Veo, use the cheapest tier that has the features you need.** The three
tiers' blind-arena Elo is statistically identical (§Quality). The standard tier costs 4× fast
and people don't prefer it. If you need reference images, extension, or 4K, lite can't do
those, so step up to fast; if you don't need those three, it's **lite**. The standard tier is
only for when a human explicitly picks it.

**3. If the slot discards the sound, Seedance silent; if the slot uses the sound, Veo.** The
reasoning is §The one axis that splits them, below.

**4. Don't make an unevaluated model the default for an important cut.** 2.5 · 2.0 fast ·
2.0 mini · 1.0 pro fast are on no public arena at all (§Quality). If you want one because it's
cheap or feature-rich, run the same prompt on both once that episode and decide.

## One-line decisions

| Situation | Use |
|---|---|
| **Motion background** (`visual.video` — a slot where the builder discards the sound) | `seedance_img2video` · `seedance-1-5-pro-251215` · 1080p · `generateAudio: false` — a price-first choice. On quality alone, Veo lite wins 59:41 (§Quality) |
| **b-roll slot** (produce absolute rule 9 uses the clip's own sound) | `veo_img2video` — a silent clip leaves that segment mute |
| Source background contains an **adult live-action person** | Veo (`veo_img2video`, verified pass) or Seedance 1.5 pro/1.0 pro — **only 2.x rejects face input** |
| You must **reproduce the composition** of a source picture | First/last frames (`sourceImagePath`+`lastImagePath`), not reference images — both engines. References carry look and style, not composition |
| **Register a character once and keep calling it** | Only the Seedance asset library (`asset://`) — Veo has no registry; it's base64 inline per request |
| **A cut with dialogue/sound effects** | `veo_text2video` / `veo_img2video` — Veo's audio is better |
| **Extending** an existing Veo clip | `veo_extension` — Seedance has no counterpart tool |
| Consistent person video from a **real person's photo** | `veo_reference` — Seedance 2.x rejects live-action faces *(untested)* |
| **Character/product** consistency from several photos | `seedance_reference` · 2.5 (up to 30 images) — Veo is 3 images, fixed 8s |
| Transfer a **sketch/toon style** by reference | `seedance_reference` — Veo 3.1 doesn't support `referenceType: "style"` |
| The source image contains a **child** | The Veo image→video lane is blocked (underage block) — the Seedance 1.x side is unverified |
| A length **other than 4/6/8s** | `seedance_*` — takes 2–30s in 1s steps |
| **21:9 / 4:3 / 1:1 / 3:4** frame | `seedance_*` — Veo only has 16:9 and 9:16 |
| **4K** | Both — Veo 3.1 (fixed 8s) or `dreamina-seedance-2-0-260128` |
| **Cheapest possible** single cut | `seedance-1-0-pro-fast-251015` — 9:16 1080p 5s ≈ $0.24 |

---

## The one axis that splits them — does the segment use its sound?

Veo generates only on a **4/6/8-second grid** and bills accordingly. 1080p and 4K are
8s-only, so filling a 4s slot at 1080p means generating 8s and paying for extra 4s.
Seedance generates **exactly the seconds you ask for** and charges just that. A 9:16 1080p 5s
silent clip is about $0.29 on 1.5 pro, about $0.24 on 1.0 pro fast — the same slot filled with
veo-3.1-fast (1080p, 8s) is about $0.96.

But cheap doesn't mean move everything. Produce absolute rule 9 says **b-roll segments don't
overlap narration and use the clip's own sound**. Put a silent clip there and 4 whole seconds
go quiet — you saved money and the video got worse.

Conversely, **for motion backgrounds (`visual.video`) the builder lays down the video track
only and discards the clip's sound.** There's no reason to pay Veo prices for sound you'll
throw away. This is the slot where you win with no downside.

| Slot | Uses the sound? | Engine |
|---|---|---|
| b-roll slot | Yes (absolute rule 9) | Veo — or Seedance with `generateAudio: true` |
| Motion background `visual.video` | Discarded | **Seedance silent** |
| Cover | Code-rendered (absolute rule 10) | No generated video at all |

---

## Price comparison

The billing structures differ from the start. **Veo is flat per second**, but length is fixed
to the 4/6/8s grid, 1080p/4K are 8s-only, and **audio is always included** — you can't turn it
off. **Seedance is token-based** (resolution × 24fps × length), so per-second cost rises with
resolution, but it takes length in 1s steps and charges just that. Neither has a free tier.

**Per-second price (USD/s)**

| | 480p | 720p | 1080p | 4K |
|---|---|---|---|---|
| **Veo 3.1** (audio included) | — | 0.40 | 0.40 | 0.60 |
| **Veo 3.1 fast** | — | 0.10 | 0.12 | 0.30 |
| **Veo 3.1 lite** | — | 0.05 | 0.08 | not supported |
| Seedance 2.5 | 0.103 | 0.231 | 0.569 *(from 8/17)* | — |
| Seedance 2.0 | 0.070 | 0.152 | 0.374 | 0.778 |
| Seedance 2.0 fast | 0.056 | 0.120 | — | — |
| Seedance 2.0 mini | 0.036 | 0.076 | — | — |
| Seedance 1.5 pro, audio | 0.024 | 0.052 | 0.116 | — |
| **Seedance 1.5 pro, silent** | 0.012 | 0.026 | **0.058** | — |
| Seedance 1.0 pro (silent) | 0.024 | 0.052 | 0.122 | — |
| **Seedance 1.0 pro fast** (silent) | 0.010 | 0.020 | **0.048** | — |

**Per-second price alone misleads the comparison** — Veo's minimum billed length kicks in.
What one cut actually costs:

**Real cost of one 9:16 cut (USD)**

| To make | Veo 3.1 lite | Veo 3.1 fast | Seedance 1.5 pro | Seedance 1.0 pro fast |
|---|---|---|---|---|
| 720p · 4s · audio | **0.20** | 0.40 | 0.21 | silent only |
| 720p · 4s · silent | 0.20 *(can't turn off)* | 0.40 | **0.10** | **0.08** |
| 1080p · 4s · audio | 0.64 *(billed as 8s)* | 0.96 | **0.46** | silent only |
| 1080p · 4s · silent | 0.64 *(billed as 8s)* | 0.96 | **0.23** | **0.19** |
| 1080p · 8s · silent | 0.64 | 0.96 | 0.46 | **0.38** |

How to read this: **at 720p with audio, Veo lite and Seedance 1.5 pro cost essentially the
same** (0.20 vs 0.21) — here the reason to switch engines is quality, not money. The gap opens
when two conditions stack. Go to **1080p** and Veo starts billing 8s; **turn audio off** and
only Seedance halves its price. Where both apply — 1080p, 4s, silent — the ratio becomes
2.8–3.4×.

Against `veo-3.1-fast`, which autonomous authoring uses, the gap is wider (0.96 vs 0.23,
4.2×). `veo-3.1-generate-preview` (standard) is $3.20 for 1080p 8s — a different order of
magnitude.

The Seedance figures are the official docs' 5s example prices divided down to per-second; the
Veo figures were confirmed directly on the
[Gemini API pricing page](https://ai.google.dev/gemini-api/docs/pricing) (both 2026-08-15).
Three time-limited discounts are not reflected — 2.5's 1080p at 72% of list (through ~09-17),
2.0 mini at 40% and 2.0 fast at 75% (through ~09-07).

---

## Quality — blind arena rankings

The evidence is the
[Artificial Analysis Video Arena](https://artificialanalysis.ai/video/leaderboard/image-to-video)
(checked 2026-08-15). People choose between two videos made from the same prompt without
knowing which model made which, and the tally is converted to Elo. As **independent blind
voting** rather than vendor self-evaluation, it's the strongest evidence available on this
question.

**Elo only compares within a board.** Each board anchors a different model — the image→video
and text→video (with audio) boards pin Seedance 1.5 pro at 1000, while the silent board pins
Mochi 1 at 1000. That's why the same 1.5 pro reads 1000 on one board and 1170 on another.
Cross-board number comparisons are meaningless.

**Image→video** — the lane this pipeline actually uses.

| Rank | Model | Elo | 95% CI | Sample |
|---|---|---|---|---|
| 1 | Dreamina Seedance 2.0 720p | 1,198 | ±7 | 12,599 |
| 10 | Veo 3.1 | 1,086 | ±7 | 7,893 |
| 13 | Veo 3.1 Fast | 1,076 | ±7 | 11,561 |
| 16 | Veo 3.1 Lite | 1,066 | ±8 | 7,193 |
| 22 | Seedance 1.5 pro | 1,000 *(anchor)* | 0 | 8,972 |

**Text→video (with audio)**: Seedance 2.0 720p 1,222 (3rd) · Veo 3.1 1,091 (11th) ·
Veo 3.1 Fast 1,090 · Veo 3.1 Lite 1,088 (15th) · Seedance 1.5 pro 1,000 (21st, anchor).

**Text→video (silent)**: Seedance 2.0 720p 1,265 (4th) · Veo 3.1 Lite 1,207 (20th) ·
Veo 3.1 1,200 · Veo 3.1 Fast 1,199 (22nd) · Seedance 1.5 pro 1,170 (33rd) ·
Seedance 1.0 1,134 (39th).

### Three things to read from it

**1. The three Veo tiers are effectively equal in quality.** On all three boards the gap is
within 20 Elo and the confidence intervals overlap. On the silent board the order even flips —
lite (1,207) sits above standard (1,200). Paying 8× for the standard tier doesn't make people
prefer it, so this repo's "no standard tier in autonomous authoring" policy holds on quality
grounds, not just price.

**2. Dreamina Seedance 2.0 is #1 in image→video.** 112 Elo over Veo 3.1 (66:34 preference on
the same prompt), 198 Elo over Seedance 1.5 pro (76:24). But what the arena tested is **720p
output**, this model rejects live-action face input, and it sits behind the $30-balance gate.

**3. Seedance 1.5 pro ranks below all three Veo tiers.** 66 Elo behind Veo lite in
image→video (59:41). The price is $0.23 vs $0.64 for 1080p 4s, so the trade is **saving 2.8×
in exchange for losing roughly one match in ten**. Which side is right depends on how much
that cut matters.

### The four models with no evaluation yet

`dreamina-seedance-2-5-260628` · `2-0-fast` · `2-0-mini` · `seedance-1-0-pro-fast-251015` are
**on no board at all**. For 2.5, ByteDance has published neither a tech report nor numeric
benchmarks (even the 2.0 report on arXiv only says "industry-leading in expert evaluation and
public user testing" without numbers), and the other three aren't listed either.

Which means **the cheapest option (1.0 pro fast) and the reference tool's default (2.5) are
the ones without quality evidence**. Before using either on an important cut, compare once
with the same prompt and decide.

The likely reason 2.5 is missing is that **its API just opened**. The date in the model ID
(260628) is the model version, not the API release date — 2.0's ID is `260128` but the
ModelArk release notes list it in **2026-04**. 2.5 has **no entry yet in either** ModelArk's
monthly release notes or product updates, its 1080p output only opens on 2026-08-17, and its
launch discount started 2026-08-14. The arena generates videos through vendor APIs and
collects blind votes, and listed models carry 2,000–20,000 votes — an API that's days old
can't have accumulated that. The arena's queue isn't public, so this couldn't be confirmed.
Expect it to be listed within weeks; recheck this section then.

`seedance-1-0-pro-250528` appears to be the same model as the arena's "Seedance 1.0"
(2025-06, silent board 1,134), but that couldn't be confirmed — the version labels differ.

### Where not to take the ranking at face value

The arena is people choosing among videos made from **general prompts**. What this pipeline
asks of the engine is a much narrower task: "push a pre-made background photo very slowly,
discard the sound." There's no guarantee general preference transfers to that narrow task.
The ranking is a starting point, not a conclusion — the real verdict is generating the same
cut from our own material on both sides and comparing.

The arena table's $/min price column disagrees with the vendor prices we verified (it lists
1.5 pro at $11.86/min, but official pricing works out to $6.96/min for 1080p with audio). For
prices, §Price comparison above is the source of truth.

---

## The traps this pipeline hits

**1. Live-action faces — 2.x won't take them as input.**
The Dreamina Seedance 2.5/2.0 family rejects reference images and videos containing real
human faces. This pipeline's cover backgrounds are live-action person PNGs (autoproduce
absolute rule 12), so anything sent to Seedance goes to **1.5 pro or 1.0 pro only**. That's
why the default model is 1.5 pro. Send it to 2.x and the whole episode stalls. The Veo side
accepts adult faces (`veo_img2video`, verified) so it doesn't hit this trap — but faces that
look underage are blocked on Veo's image lane, and cuts with no visible face (back view,
silhouette) are accepted by every model.

**2. Touching `ratio` crops the source.**
`seedance_img2video`'s ratio default is `adaptive` — it follows the source image's ratio.
Pass anything else and the server **center-crops**. Feed a 1088×1920 cover with `16:9` and
only the middle band of the frame survives. If you don't intend to change the ratio, don't
pass the argument.

**3. `generateAudio`'s vendor default is `true`; ours is `false`.**
Narration is added separately via `tts_*`, so a model-generated voice makes two layers. On
top of that, 1.5 pro with audio on costs **exactly 2×** ($1.2 → $2.4/1M tokens). The tool
default is flipped to `false` — leave it.

**4. Result URLs live for 24 hours.**
The server saves a local mp4 the moment polling completes and returns only the path, so
normally there's nothing to think about. But a task that failed on timeout (15 min) must be
retrieved from the ModelArk console, and even that disappears after a day.

**5. Seedance 2.0 hallucinates more captions in portrait.**
Unrequested text gets burned into the frame, and the vendor docs state the probability is
**clearly higher in portrait than landscape**, recommending "generate landscape, crop to
portrait in editing" as the workaround. The same docs admit constraint words can't block it
100%. Our pipeline assumes 9:16, so that workaround doesn't apply — **when generating
portrait on 2.0, eyeball the frames**. The other mitigation is removing text from reference
assets. The 2.5 docs drop this warning and provide caption negative control instead — this
advice is **2.0-specific**.

**6. Don't use a three-view character sheet as reference.**
Contrary to industry lore, ByteDance warns about this twice in its own docs — feed
multi-angle assets and the model **reads each angle as a different person**, worsening ID
drift and putting the same character on screen twice. The recommendation is two images:
**a headshot (face only, neutral, minimal shoulders/background) + a full body**. And **asset
order is weight** — the more precisely something must be referenced, the earlier it goes in
the `referenceImages` array.

---

## The seven models — what differs

| Model ID | Resolution | Length | Reference images | Audio | seed | Live-action face input |
|---|---|---|---|---|---|---|
| `dreamina-seedance-2-5-260628` | 480p·720p | 4–30s | 1–30 | ○ | ✗ | **rejected** |
| `dreamina-seedance-2-0-260128` | 480p–4K | 4–15s | 1–9 | ○ | ✗ | **rejected** |
| `dreamina-seedance-2-0-fast-260128` | 480p·720p | 4–15s | 1–9 | ○ | ✗ | **rejected** |
| `dreamina-seedance-2-0-mini-260615` | 480p·720p | 4–15s | 1–9 | ○ | ✗ | **rejected** |
| `seedance-1-5-pro-251215` **default** | 480p–1080p | 4–12s | ✗ | ○ | ○ | accepted |
| `seedance-1-0-pro-250528` | 480p–1080p | 2–12s | ✗ | ✗ | ○ | accepted |
| `seedance-1-0-pro-fast-251015` | 480p–1080p | 2–12s | ✗ | ✗ | ○ | accepted |

All models are fixed 24fps and accept every ratio: 16:9, 9:16, 4:3, 3:4, 1:1, 21:9, adaptive.
Only `seedance-1-0-pro-fast` is first-frame-only — it can't interpolate first+last frames.

2.5's 1080p opens on **2026-08-17 (UTC+8)** — after that date, add `'1080p'` to
`dreamina-seedance-2-5-260628.resolutions` in the `server/src/seedance-client.ts` capability
table. Until then it's rejected before the call.

**The Dreamina Seedance 2.5/2.0 family doesn't unlock on a key alone** — it activates only
with an account balance over $30 or a purchased resource pack. The 1.5 pro and 1.0 family
have no such gate.

---

## Prompt grammar — the two engines differ

This is what comes after engine selection. The evidence is both vendors' official docs, with
write-ups in the
[prompt grammar research](../../../docs/research/2026-08-15-veo-seedance-prompting/index.html)
and the
[camera technique research](../../../docs/research/2026-08-15-ai-video-camera-technique/index.html).
The latter corrected the former's sentence-skeleton entry — the table below is the corrected
version.

| | Veo 3.1 | Seedance |
|---|---|---|
| Sentence skeleton | Enumerate slots but **no order rule** — whichever of subject·action·context·camera·lens·style you need. Zero required/must across the three reference docs, and the Gemini API marks camera `[Optional]` | `subject + action + environment + camera move + aesthetics + sound` — the camera slot itself is `非必须` |
| Camera vocabulary | 12 vendor-named, defined moves. `zoom` doesn't move the camera; only `dolly` does | 11 moves (`推·拉·摇·移·跟·升·降·甩·环绕·旋转·变焦`) + 5 shot-size levels (景别). **Zero lens specs or camera-body vocabulary in the entire doc** |
| Exclusion directives | **The `negativePrompt` argument** — noun phrases, comma-separated (`wall, frame`) | No argument — re-describe the scene to avoid it |
| Dialogue | Wrap in quotes | Quotes + emotion/pace as plain sentences (no parameter) |
| Prompt language | English | Chinese/English only (Korean on 2.5 only) — Korean only in dialogue lines |
| Cutting shots | One cut per call | `Shot 1: … Shot 2: …` transitions within one call (1.5/2.0) |
| Timecodes | **Usable** — the 3.1 blog presents `[00:00-00:02]` interval splitting as an official workflow (blog grade) | **Don't** — 2.0 self-reports unstable precision timing (2.5 responds to whole seconds) |

**The "camera goes first" rule is retired.** The `[cinematography]+[subject]+[action]+
[context]+[style]` five-part formula exists in **one Google Cloud blog only**; the three
reference docs (Gemini API, DeepMind, Vertex) prescribe no word order and never even use the
word `Cinematography`. The Gemini API's only annotated example puts the camera at the **very
end** of the sentence. With no evidence that order changes results, just fill the slots and
write them in whatever order reads well.

**Exclusion directives are the most common mistake.** Write "no ~" in the body and that noun
tends to get drawn — there's a field-tested local-image case where `"no maps"` produced maps
(4 of 4 failed), and the Veo prompt guide itself marks directive phrasing not recommended.
The server's four `veo_*` tools expose the `negativePrompt` argument, so route all exclusions
there.

**Portrait must be explicit on Veo** — `aspectRatio` defaults to `16:9` and only two values
are allowed. A portrait start image doesn't carry it over. Developer-forum reports exist of
9:16 requests coming back landscape, so check the output mp4's resolution.

**Don't pin cross-cut consistency on seed** — Veo's determinism claim failed source
verification, and Dreamina 2.x, which handles references, has no seed at all. Build
consistency on reference images and first/last frames.

---

## Camera — this section is the source of truth

The evidence is the
[camera technique research](../../../docs/research/2026-08-15-ai-video-camera-technique/index.html).

**Each engine understands different words.** Carrying directives from one engine to the other
means instructing in vocabulary that vendor never exemplified. The full Veo source of truth
(the Vertex prompt guide) contains **not one occurrence** of `orbit`, `push`, `steadicam`, or
`gimbal`.

| Intent | Veo 3.1 | Seedance |
|---|---|---|
| Move closer | `dolly in` (not `zoom in` — that only changes the lens) | `推` |
| Move away | `dolly out` | `拉` |
| Circle the subject | `arc shot` (not `orbit`) | `环绕` |
| Sweep left/right | `pan` | `摇` |
| Sweep up/down | `tilt` | (unconfirmed) |
| Body moves sideways | `truck` | `移` |
| Body moves up/down | `pedestal` | `升` / `降` |
| Follow | (`tracking` in examples only) | `跟` |
| Locked off | `static` / `fixed` | (unconfirmed) |

`(unconfirmed)` doesn't mean "not understood" — it means **not confirmed in that vendor's
docs**. Vendor lists mostly end in `等`/"and more", i.e. open lists, so an absent word isn't a
banned word. Still, using words that are present is safer. The current practice of writing
English in the Seedance slot isn't vendor-confirmed vocabulary, but there's no evidence
against it either, so it stands — whether the trajectory differs is an item we still have to
measure.

**Shot-size vocabulary has weaker vendor backing than moves.** The Veo docs carry the warning
"some advanced directives are not officially supported and results vary by prompt" exactly
twice, and it's attached to the **angle section and the lens section** — `close-up`,
`medium shot`, `wide shot` live there. The 12-move section has no such warning. But "so moves
work better" is an inference from silence.

**Set moves-per-cut per model.** Our default model **Seedance 1.5 Pro has the vendor teaching
combinations** (Hitchcock shot = `推拉`+`变焦`), so up to 2 can be tried. The one-move-per-cut
advice is **2.0-only**, and even there hedged as `尽量` (where possible). Carrying a rule read
in one version to a sibling version collides head-on with the vendor docs.

**Don't use moves as emotional staging.** The folk belief that an approaching move changes the
viewer's valence or arousal has no empirical support (p=.84 / p=.21, Front Neurosci 2023). The
one significant effect was immersion, and even that was only consistent in neutral scenes
whose character wasn't yet established. The authors credit tone mainly to **set dressing**,
not the camera — set a cut's emotional tone with background, art, and props, and use moves for
immersion at openings and transitions. (45s silent landscape clips, n=44 — that's
non-detection, not proof of absence.)

**Angles, by contrast, have empirical support.** From high to eye-level to low, the subject
looks bigger and stronger (all 5 scales p<.001) but **likability doesn't move** (p>.05). In
15s talking-head close-ups, eye level is trusted most (eye level vs low p=.007). So keep
**hook cuts and speech clips at eye level** while the narrative isn't established yet, and use
low angles only on cuts that must make the subject imposing. It won't support banning high
angles — eye level vs high is only a trend (p=.082). This is a default guide, not a gate.

---

## What Seedance can't do

- **Extend or edit local video.** ModelArk's video input takes public URLs and asset IDs
  only, no base64. Our pipeline's mp4s are local files, so they can't go in as-is. That's why
  there is no `seedance_extension` tool, and extension belongs to `veo_extension`.
  (To use 2.x video reference/edit/extension you'd first upload to public hosting —
  `skills/grow-threads/references/upload-media.sh` is that slot. Not exposed as a tool for now.)
- **Audio reference.** 2.x's reference audio isn't on the tool surface yet.
- **Korean prompts.** Official support is 2.5 only. Write English for the other models.

---

## Key setup

```bash
export ARK_API_KEY="..."   # https://ai.byteplus.com/ark/region:ap-southeast-1/apikey
```

The region is `ap-southeast-1` (Singapore), the only one. `ARK_BASE_URL` can override it, but
the video models live only in that region, so normally leave it alone. Without this key,
`veo_*` still runs on `GEMINI_API_KEY` — the two engines don't block each other.
