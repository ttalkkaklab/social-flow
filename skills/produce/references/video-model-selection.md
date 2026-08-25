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
the `referenceImages` array. The 2.5 guide loosens one half of this (2026-08-25 delta check):
*"Seedance 2.0 does not recommend using multi-view images as subject references, while
Seedance 2.5 supports them"* — but only as **separate files, one view each**; the same
sentence keeps the ban on one image containing several viewpoints. So the single-sheet ban
survives every generation, and what 2.5 opens is exactly the separate-panels convention this
repo already uses.

### The character panels — how a channel cast is stored

The rule above says *don't hand the model one sheet with several angles drawn on it*. It does
not say keep only one picture. Store the angles as **separate files**, one subject per file, and
hand over the two or three the shot actually needs:

```
data/<channel>/assets/characters/<id>/
  identity.md   # the canonical description — look, marks, expression, voice, veo verdict
  face.png      # face close-up — neutral, minimal shoulders, plain background. The headshot the vendor asks for
  body.png      # full body, front, HEADLESS — body, clothes, shoes. No face
  back.png      # full body, back (optional — add it when back-facing shots happen)
  front.png     # legacy: full body with the head on. Fallback when the panels don't exist yet
```

**The reference set is `[face.png, body.png]`, in that order.** That is the vendor's headshot +
full body, and array order is weight, so the face leads. Add `back.png` only for a shot where the
character is seen from behind. Never build a combined sheet out of the panels — the moment two
angles share one image, this whole section's warning applies again.

**Why the front panel is headless.** The face is already carried by `face.png` at a much larger
size, so a head on the body panel is the same information twice, and the more human figures a
reference set carries the more readily the model reads them as several people — the doppelgänger
failure. **This part is a creator practice, not vendor guidance**: ByteDance documents the
two-image set but says nothing about removing the head from the full body. Treat it as our
working default and settle it with an A/B (same shot, headless body vs `front.png`, ID drift
compared over a few 8-second cuts) — the open question is already logged in the camera research.

An outside practitioner reaches the same failure mode from the other direction `[course]`.
Higgsfield's course keeps the three-panel sheet as one image, but the step it insists on is
erasing the face from the full-body panel — "more than one face and Seedance wobbles; by the
fifth scene your lead is a stranger." So the two sources disagree on the container (one sheet
vs separate files) and agree on the rule underneath: **one face per reference set.** Their
container isn't ours to copy — their platform saves the sheet as a named Element and matches it
by tag, which is not what a raw `referenceImages` array does, and ByteDance's own warning
against multi-angle assets is `[vendor]`. Keep the panels split; take the confirmation.

**Light the sheet flat** `[course]`. A reference sheet gets rejected on lighting far more often
than on likeness, and every shot generated from it inherits the fault. What passes: soft
diffused light with almost no shadow, no glare on the hair, a visible catchlight in the eyes,
mid-grey seamless background (never white), the same light across all panels. What fails: half
the face in shadow, a hot rim on the hair, the whole panel underexposed. Ask for the grey
background by name — a background with nothing in it raises the hit rate on its own.

**A wardrobe or body change mid-episode needs its own sheet** `[course]`. When something about
the character changes inside the story — torn trousers after a claw swipe, a uniform put on, an
age jump — the model has no picture of the new state and quietly restores the old one (the
trousers sew themselves back up a beat later). Generate a second sheet for the changed state
(`<id>-torn`, `<id>-kid`) and hand it over from the cut where the change happens. The same goes
the other way for a flashback: age the character, the location and the props together, or the
flashback reads as a costume instead of a memory.

**A live-action character keeps its single image.** The panel convention is for drawn characters.
Where the canonical asset is a photograph (Ttalkkak Lab's `mouse/real.png` — the mouse-helmet
figure), that one file stays the reference and goes to `veo_reference`, because that is the path
we measured: the model invented a mouth on the drawn line art 5 times out of 5, and 0 times out
of 8 on the live-action helmet photo.

**Engine routing doesn't change** — a drawn character goes to `seedance_reference` (1–30 images
on 2.5, 1–9 on 2.0), a photorealistic human face goes to `veo_reference` (**at most 3 images** —
`server/src/video-client.ts` validates `.max(3)`, which is the source of truth here), and
Seedance 2.x rejects real faces outright. On the image lane, the same panels go to
`gpt_image_img2img` / `nanobanana_img2img` as input images, same order, same reason.

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

**API deltas the tool surface doesn't carry yet** (2026-08-25 delta check — candidates for
`seedance-client.ts`, not exposed today):

- **`duration: -1`** — the model picks a whole-second length inside its valid range (1.5 pro
  and 2.0; the 2.5 *default*; the 1.0 family doesn't take it). Our pipeline computes each
  scene's length from the narration, so the deterministic path stays the rule — `-1` is for a
  cut whose length genuinely doesn't matter.
- **Draft mode, 1.5 pro only** — a cheap 480p preview to check scene structure, shot
  scheduling and subject motion before paying the full price; confirm with the returned
  `draft_task.id` and the original inputs are reused verbatim. The official cheap lane for
  validating a multi-cut plan.
- **2.5 only**: `output_format: "mov"` (H.264 + YUV 4:4:4 + PCM — color-safe for edit/extend
  chains) and `omni_reference_task_type` (declares reference/edit/extend up front so bad
  combinations fail at submission instead of as async errors).
- **Reading order**: this vendor updates the **Chinese docs first** (the 1.5 pro ZH guide
  gained a cut-timing section and a voice-casting formula on 2026-08-13 that the EN page,
  frozen at 07-06, still lacks). Open the volcengine ZH page first, use BytePlus EN to
  cross-check.

---

## Prompt grammar — the two engines differ

This is what comes after engine selection. The evidence is both vendors' official docs, with
write-ups in the
[prompt grammar research](../../../docs/research/2026-08-15-veo-seedance-prompting/index.html),
the
[camera technique research](../../../docs/research/2026-08-15-ai-video-camera-technique/index.html),
and the
[timing and prompting delta check](../../../docs/research/2026-08-25-veo-seedance-timing-prompting/index.html)
(2026-08-25 — re-verified against the moved official docs; Google's Veo pages now live under
`docs.cloud.google.com/gemini-enterprise-agent-platform/`, and the old Vertex URLs 301 there).
The camera research corrected the prompt research's sentence-skeleton entry — the table below
carries both corrections.

| | Veo 3.1 | Seedance |
|---|---|---|
| Sentence skeleton | Enumerate slots but **no order rule** — whichever of subject·action·context·camera·lens·style you need. Zero required/must across the three reference docs, and the Gemini API marks camera `[Optional]` | `subject + action + environment + camera move + aesthetics + sound` — the camera slot itself is `非必须` |
| Camera vocabulary | 12 vendor-named, defined moves. `zoom` doesn't move the camera; only `dolly` does | 11 moves (`推·拉·摇·移·跟·升·降·甩·环绕·旋转·变焦`) + 5 shot-size levels (景别). **Zero lens specs or camera-body vocabulary in the entire doc** |
| Exclusion directives | **The `negativePrompt` argument** — noun phrases, comma-separated (`wall, frame`) | No argument — re-describe the scene to avoid it, and put what must hold into a positive-locks tail (§positive locks) |
| Dialogue | **`speaker says: line` — colon, no quotation marks.** Quotes make the model render the line as on-screen text (Best practices, 2026-08-24 — this overturns the older Gemini-API "use quotes" rule; the delta check has both texts). Voice casting rides in front: `In a crisp, analytical voice, Clara says: It has to be here` | Quotes + emotion/pace as plain sentences (no parameter) |
| Prompt language | English | Chinese/English only (Korean on 2.5 only) — Korean only in dialogue lines |
| Cutting shots | One cut per call | `Shot 1: … Shot 2: …` transitions within one call (1.5/2.0) |
| Timecodes | **Usable** — the 3.1 blog presents `[00:00-00:02]` interval splitting as a workflow (blog grade — still absent from every reference doc, checked 2026-08-25) | **Split by generation** — 2.0 *"does not respond to timestamps and only responds to shot numbers"*; 1.5 pro's guide is silent and every example times cuts by dialogue/action beats, so our "don't" there is contract, not vendor ban; **2.5 officially takes integer-second forms** ("0-3 seconds", "[1s-4s]", "at the 2-second mark" — leave no gaps in the timeline, and don't use it for high-frequency action) |

**A multi-cut call opens wide.** Seedance keeps no memory of where anyone sat in the last
generation — it knows what the current frame tells it. Inside one call, though, the later cuts
inherit the layout the first cut established, so a `Shot 1: … Shot 2: …` call that opens on a
wide gives the model one floor plan to hold and the close-ups that follow land in the same room.
Open on the close-up instead and the model re-invents the space at every cut. `[course]` — the
same establishing rule as directing-grammar §6.2, here as a mechanism inside a single call. Our
pipeline writes one cut per call, so this bites only where a scene is deliberately generated as
a sequence.

The multi-cut form itself is vendor-exemplified **on 1.5 pro too** (2026-08-25 delta check):
both `Shot 1: …` numbering and prose transitions ("The shot cuts to …"), examples running 2–5
cuts. Three rules ride with it — time the cut by a **dialogue or action beat**, not a clock
("as she opens her palm, cut to a close-up of the hand"); give each cut its own shot size and
distinct content (the ZH guide's three cut principles, 2026-08-13 — this vendor updates the
Chinese docs first, so open the volcengine ZH page before the BytePlus EN one); and **don't
constrain per-segment durations** — the 2.0 guide says outright to let the model pace the
segments from the plot. What packs too much into the time comes back as extra cuts you didn't
ask for or dropped plot (2.5's wording) — the same "muddled or incomplete" failure Veo names.

**One clip is one moment — now vendor text.** Veo's Best practices (2026-08-24): *"dedicate
each prompt to a single, focused moment. Trying to chain multiple distinct events (A then B
then C) in one prompt for a short video often leads to muddled or incomplete videos."* That is
the vendor naming the failure our §cut-length table predicts (handed too many seconds or too
many beats, the model fills by inventing), and it is the engine-side half of the pipeline's
**one scene = one call** contract (scenes-schema §clip prompt). The one sanctioned way to put
several beats in one Veo call is the timestamp workflow — `[00:00-00:02] …` spans, the
official example cutting 8s into four 2-second beats, each span carrying a shot size, the
action, and an `SFX:`/`Emotion:` label. That workflow is still blog-grade (checked 2026-08-25:
zero occurrences in the Gemini API, Agent Platform, or DeepMind reference docs), so use it
where the payoff is real — pinning the beat you will keep inside the head of a trimmed 8s
clip — and don't build a contract on it.

**On the image lane, prompt motion only — now vendor text.** Best practices: *"Your source
image already provides the subject, scene, and style. Focus your prompt on the motion you want
to see"*, with re-describing the character, background or lighting marked Not recommended —
the official form of the rule this pipeline already had (the PNG locked the space). The
sanctioned motion vocabulary is three kinds, alone or combined: **camera motion** ("Slow dolly
in on the subject."), **subject animation** ("Her hair and clothes flutter gently in the
wind."), **environmental animation** ("Fog rolls in slowly across the landscape."). And call
the person in the source image by a general noun — *"the subject", "the woman", "he", "she"* —
not by a re-description.

**Seedance's image lane reads differently — identity words stay, layout words go.** The 1.5
pro prompt guide has no i2v section at all (the EN text never says "image"); the official
pattern lives in the Seedream→Seedance best-practice doc, and it is not motion-only: reuse the
source image prompt's **identity words** (who and what the subject is), drop the **static
composition words** (where things sit — the frame already holds that), add the motion and a
brief camera line, and close with a **consistency lock**: "the subject stays exactly
consistent with the input frame; keep appearance, proportions and materials; add no unrelated
elements" (the vendor's own lipstick example is this shape). The two engines agree on the
invariant — never re-describe layout, facing or lighting — and split on the subject: Veo wants
a general noun, Seedance keeps the identity description. If the composition still drifts on a
1.x model, `cameraFixed: true` is exposed and holds the frame.

**Detail up, and know the rewriter is always on.** The prompt cap is 1,024 tokens; DeepMind's
line is "the more detail, the more control", and Veo 3/3.1's prompt rewriter **cannot be
disabled** — a prompt under 30 words gets LLM-expanded (and the rewritten text returned in the
response). A short vague prompt is therefore someone else's prompt. The practical floor: fill
the slots you need with concrete detail and stay comfortably under the cap.

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

**Consistency rides on references and first/last frames; seed is now a sanctioned assist on
Veo.** The 2026-08-15 verdict was "don't pin consistency on seed" — the 2026-08-24 Best
practices partially overturns it, explicitly recommending the **same seed across scenes**
(visual, style and voice consistency) plus pasting the character description verbatim into
every scene. The Gemini API docs still say seed *"doesn't guarantee determinism, but slightly
improves it"*, so it stays an assist layered on references, never a replacement — and Dreamina
2.x still has no seed at all. Our `veo_*` tools don't expose seed yet; that's a server change
to weigh, not a prompt trick to fake. One more doc delta to know: `negativePrompt` vanished
from the Gemini API doc page (2026-08-25 check) while the SDK types and Vertex REST examples
still carry it — treat it as alive on the text/img lanes, and verify once on the next paid
call that the nouns actually stay out. **The reference lane is different**: it rejects the
argument outright (400 "Negative prompt is not supported in your use case", measured
2026-08-15), so exclusions there are positive re-description in the prompt body.

### Positive locks — what an exclusion turns into on Seedance

`[course]`. Seedance has no exclusion argument, so the table's exclusion row says "re-describe
the scene". The working shape of that re-description is a **positive-locks tail**: a last
paragraph naming, in plain positive sentences, what has to hold in every frame. What it ends up
reading like is a continuity supervisor's note.

> POSITIVE LOCKS — the drawing on the map stays identical in every frame: red X on the island,
> dashed line from the ship. The lantern stays lit in every cut. The door stays closed until
> CUT 4. Only two people ever appear. Every object on the desk keeps a stable shape and moves
> only when his hands move it.

Four rules come with it:

- **A phrase that only refuses a category tells the camera nothing.** "NO CGI", "not a game",
  "not cheap-looking" keep pointing at the thing you don't want; the model has no picture to
  draw instead. Rewrite each one as light, texture, movement, contact or composition that can
  appear in the frame — "not a game" becomes "where is the camera, and what does this cut
  reveal that the last one didn't"; "no weightlessness" becomes "what bends, stops, rebounds
  or flies after the hit". A repeated ban that survives two batches is a rewrite signal, not a
  reroll signal.
- **Give every reference its scope in one clause.** `@ocean_location — controls water and sky
  atmosphere only`, `@main_ship_sheet — controls hull, deck, masts and rigging only`,
  `@button — appears ONLY inside the spyglass view`. Left unscoped, a reference leaks: the
  studio-sheet background comes along with the character, or the only face in the reference set
  gets lent to a different person. Where a one-shot extra shares a frame with a referenced
  character, the scope clause has to say the face does not transfer. The storyboard writes the
  clause, not produce — `visual.character` takes `{ id, scope }` entries
  (`scenes-schema.md` §character reference), and the check strip warns when a generated clip
  hands over two or more references with no scope on any of them.
- **Say who cuts.** A multi-cut Seedance call takes a line like *"Sequence of cuts, no
  timecodes — cuts only at the specified points, the camera does not cut on its own."* This is
  the same finding as the timecode row above, in the form the prompt actually uses: name the
  cuts, refuse the clock, and forbid cuts you didn't ask for.
- **Cover the reverse angle.** The preflight question is literal: *if the camera turned 180°
  right now, which approved reference explains that frame?* No answer means the space isn't
  locked, and the background will shift between shots that are supposed to sit in the same room
  — the failure that makes a shot/reverse pair impossible to cut together. Where a scene plays
  across the 180° line (`shot.space.line`), generate the opposite view of the location as its
  own reference and hand both over. It is the same move as the oasis case: when one location
  image can't hold everything the scene needs, split the place into two named references rather
  than asking one prompt to build it all.

**One carve-out, from the vendor itself (2026-08-25 delta check): the artifact classes may
stay negative.** The 2.0 guide templates directive negatives for exactly three artifact
classes — *"keep it subtitle-free"*, *"avoid generating any text or subtitles"*, *"do not
generate a logo"*, *"do not generate a watermark"* — and 2.5 adds audio control (*"No BGM"*,
*"No audio"*). Those aren't scene content the model could draw instead; they're output
artifacts, and the vendor's own template speaks of them in the negative. So on a Seedance
route the machine checks let a negative through when it names subtitles, text, logos,
watermarks or BGM — everything else still gets re-described positively. (The same vendor
admits constraint words can't block portrait captions 100% — the carve-out is permission, not
a guarantee.) On Veo all of it stays in the `negativePrompt` argument.

### The batch-failure ladder — which level to change

`[course]`. A batch of four comes back wrong. Before rewriting anything, read the batch as
evidence rather than as four verdicts:

| What you see | What it means | What to change |
|---|---|---|
| all four fail the same way | the brief or a reference is missing something | that level only — add the missing reference, or name the action the prompt left out |
| three land, one breaks (a limb clips, a body resets) | one bad roll | nothing — generate again |
| the shot is "almost right" | not a diagnosis | split it: pose continuity · time continuity · material behaviour · image polish, then fix the one that broke |

The levels to name are **asset · action · camera · roll**. Change one. Rewriting the whole
prompt after a partial success throws away the directions that were already working, and the
next batch fails somewhere new. Repeating a ban is not a change at that level — when a
reference keeps coming back wrong (a bone blade rendered as a hand holding a sword), the fix
that lands is positive and visible: raise the arm so the structure faces the camera.

And judge takes by **what each one got right**, not on a good/bad axis. Across a batch, one
clip usually holds the opening, another the middle action, another the ending; the finished cut
is assembled from those parts. Where our pipeline can only take one clip per slot, the same
reading still picks the winner — the take whose *performance* lands, since polish stopped being
the differentiator.

---

## Camera — this section is the source of truth for engine vocabulary and routing

This section owns **which word each engine understands and how many moves a model takes per
cut**. Which technique a shot should use — the size, the angle, the move, the length and the
sound that serve what the audience should feel there — is owned by
`../../storyboard/references/directing-grammar.md` (feel → technique); the field contract is
`../../storyboard/references/scenes-schema.md`. The evidence behind this section is the
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
| Lens only | `zoom in` / `zoom out` (the lens changes focal length — the body stays) | `变焦` |
| Whip across | `whip pan` | `甩` |
| Shake | `handheld` / `shaky cam` | (unconfirmed) |
| Rise or fall on an arm | `crane` | (unconfirmed) |
| From the air | `aerial` / `drone` | (unconfirmed) |
| Vertigo | `dolly zoom` (dolly one way, zoom the other — the one two-action move) | `推拉+变焦` |

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

**Set moves-per-cut per model — what the engine allows.** Our default model **Seedance 1.5 Pro
has the vendor teaching combinations** (Hitchcock shot = `推拉`+`变焦`), so a second move can be
tried there. The one-move-per-cut advice is **2.0-only**, and even there hedged as `尽量` (where
possible). Carrying a rule read in one version to a sibling version collides head-on with the
vendor docs. **What the storyboard writes is a separate contract** — one move per cut by default,
a second only on 1.5 Pro and only with the reason written on the shot (scenes-schema §camera ·
directing-grammar §4): the engine allows two, the pipeline asks why.

**A move supports the shot's feel; it doesn't carry it.** The storyboard picks the move from
the feel it declared (directing-grammar §4–§5 — realisation → `dolly in`, pressure → slow
`zoom in`, travel → `truck`, closing → `pedestal up` …). The measured part is narrow: an
approaching move on its own didn't change the viewer's valence or arousal (p=.84 / p=.21,
Front Neurosci 2023); the one significant effect was immersion, and even that was only
consistent in neutral scenes whose character wasn't yet established. The authors credit tone
mainly to **set dressing**, not the camera — so background, art, props, the size and the angle
carry the feel, and the move is what makes the audience move with the cut, spent mostly at
openings and transitions. A move that contradicts the declared feel is the defect; a static shot
whose framing serves the feel is not. (45s silent landscape clips, n=44 — that's non-detection,
not proof of absence.)

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
