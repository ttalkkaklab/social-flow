# Still generation — the images the storyboard planned

**Automatic execution:** [Automation guidance](../../_shared/automation-guidance.md) supersedes creative quality gates, repeated approvals and review-score requirements here. Keep the concrete guidance and truthful review state. Enforce only actual runtime dependencies and the scope of external-action authorization.


The procedure for produce §1.5. The storyboard decided every still's prompt, engine and size
and generated nothing (storyboard §5, owner directive 2026-09-04 — a plan the user rejects
must cost nothing). This file is the execution half: which engine each still goes to, how the
call is made, what disqualifies the picture that comes back, and what gets written into the
ledger.

`visual.bgPrompt` arrives from the authored plan. Reuse it only while the narration meaning,
visual purpose, factual/reconstruction boundary, opening and referenced assets still agree.
If inspection finds a mismatch, correct the relevant plan fields within the requested scope
and reassemble the affected source prompt; do not patch only the stored string. A changed
camera is not the only reason to refresh it. Inspect unchanged pixels against revised words
before deciding whether regeneration is needed. Prompt refresh does not authorize new spending.

## Contents

- [1. Which engine, and why](#1-which-engine-and-why)
  - [The host image tool comes first](#when-the-saved-image-selection-uses-the-host)
  - [The API table](#the-api-table-claude-code-or-imageproviderapi)
- [2. Making the calls](#2-making-the-calls)
- [3. The image check](#3-the-image-check)
- [4. The ledger](#4-the-ledger)

## 1. Which engine, and why

**Text-bearing images use GPT Image 2 (owner directive, 2026-10-18).** For every
new still or edit that must display or preserve readable text, follow the
[mandatory text-image selection](../../_shared/image-routing.md#images-containing-text-gpt-image-2-required).
Use `gpt-image-2` even when the saved default is Z-Image or the host has its own
image tool. A host qualifies only if its actual model is verifiably GPT Image 2.
Apply this exception before the saved-choice and host-first recommendations below,
record the scoped choice, and inspect the actual lettering after generation.
If GPT Image 2 is unavailable, report it without automatic model substitution.

For server image calls, follow [image routing](../../_shared/image-routing.md).
Read `image_catalog`, plan the exact operation, then execute the saved plan. Existing
raw tools accept `imageContext`; configured production cannot bypass selection using
a raw tool. The same service handles episode shots and workspace branding assets.
The catalog and adapter contracts supersede historical model-capability claims in
this recipe. Saved choice wins over the initial recommendations below except for the mandatory text-image rule above.
GPT Image 2 supports preview transparency; mini accepts low input fidelity. MLX
editing, strength-based variation and alpha support differ by installed model family.
Do not add unexposed options or infer model quality from a successful contract check.


First resolve [directory model settings](../../_shared/model-settings.md). Use the
episode snapshot's image engine/model/quality and explicit user overrides for every
new still. Initial image setup recommends ASTRA GenAI (`astra-genai` / `z-image-turbo`);
the host and local adapters below apply only when selected. A saved API/local choice overrides host detection;
missing tools, failed calls and unsupported edits do not authorize substitution.

### When the saved image selection uses the host

The storyboard wrote `PRODUCTION.imageProvider` from the tool list of the CLI it ran in
(storyboard §1): `"host"` where the CLI ships `image_gen` — Codex, Grok — and `"api"` on Claude
Code or where the user chose the API lane for the episode. Under `"host"` the table below is
not consulted: every still, start and end frame and slide art goes to the host tool with the
approved `bgPrompt` resent verbatim, and the ledger line is `image.host` (subscription
allowance, $0 — a quota is not a price). Two CLIs, two mechanics:

- **Codex** — the built-in `image_gen` tool (OpenAI's image model, no `OPENAI_API_KEY`; the
  API-side gpt-image renders Korean, and the first text frame here still gets its glyphs read
  like on Grok). It saves under `$CODEX_HOME/generated_images/`; copy the picked file to
  `storyboard/images/scene-<n>.png`. A reference call (character panels, an end frame edited
  from the start frame) first shows the source with `view_image`, then edits it.
- **Grok** — `image_gen` with `aspect_ratio` from the format (`9:16` shorts, `16:9` long-form)
  and `image_edit` for anything with a reference image (`image` takes an absolute path; the
  character panels go face first, then body). Both return the saved file's absolute path; copy
  it to `storyboard/images/scene-<n>.png`. Hangul rendering is unmeasured on this tool: make a
  text-bearing frame once and read the glyphs; a broken read is reported in `build-report.txt` and
  the user is asked for an explicit exception before any other engine is billed — no silent switch.

A host call that fails, or a tool that is missing, is put to the user before any separately
billed API call — a fallback nobody approved is money nobody approved.

**Host image quality preference (owner directive, 2026-10-16).** Request the lowest
available generation quality from the host image tool, including images used as LTX or
other video-model references. Keep the approved `bgPrompt` verbatim and append this
execution instruction separately: "Use the lowest available generation quality. Preserve
the requested dimensions, composition, subject identity and required readable details."
If the host exposes a quality parameter, select its lowest supported value. Codex
`image_gen` currently exposes no such parameter: this is a prompt preference, not a
verified low-tier setting or a guarantee of lower cost or latency. Do not invent a
quality argument or report that the tool actually used `low` without tool evidence.
Keep the planned visual style and source-resolution requirements; do not request blur,
reduced detail or a rough sketch as a substitute for a quality setting. Video generation
and upscaling do not guarantee correction of source-image defects. Apply the existing
image checks. This preference does not change the separately billed API table below.

**A generated-video cut's still is edited from its previz first frame** (user directive
2026-09-11, storyboard blender-previz.md §6.6). `spatial-prompts.js --shot N` returns
`previzFirstFrame` and puts it first in `sourceImageArgs.referenced_image_paths`, ahead of the
style-pack image, with the composition lock already in `sourcePrompt`. Hand that frame to the
tool as the reference — Grok `image_edit` (`image` = the frame), Codex `image_gen` after
`view_image` on the frame, `gpt_image_img2img` on the API lane — so the camera, framing and
subject positions of the clip's frame 1 are the still's. A still designed from the prompt
alone and a previz that starts elsewhere hand the video model two different first frames.

For a bound persistent location, prepare shared set/camera/actor blocking before image
generation (storyboard §4b). `location_manage` action `previz` writes the location reference
and previz first frame together. The source assembler puts that location composition first,
deduplicates the shared image and assigns cast sheets to appearance only. Read returned
`spatialWarnings` when a legacy standalone previz is also attached; compare or rebuild it
from the shared plan. End-frame prompts use the closing actor and set state, not the opening
one. These references guide the model; inspect actual generated images for layout and gaze.

### The API table (Claude Code, or `imageProvider:"api"`)

The episode style chosen in [visual-style.md](../../storyboard/references/visual-style.md)
overrides the generic photo defaults below for every new still, start and end frame, in
every production mode. The miniature pack is attached only for cinematic-miniature;
every other preset uses its own treatment and approved character references. In
full_video use the approved look and world bible; physical subjects need no decorative person.

Measured 2026-08-12 (`docs/research/2026-08-12-local-image-generation`).

| Still | Engine | Price | Why |
|---|---|---|---|
| points backgrounds | `image_local_generate` (Z-Image) | $0 | only when selected; queue local calls sequentially |
| cover background (scene-1) | `gpt_image_text2img` `quality:"high"` | $0.22 | it is the thumbnail *and* the video model's input — the quality clause |
| any screen with text in it | `gpt_image_text2img` | per quality | the local engine breaks Korean jamo ("딸깍연구소" → "달닥연구소") |
| a scene with `visual.character` | `gpt_image_img2img` | per quality | the panels are the input, not a description |

The storyboard wrote the choice into `.work/decisions.tsv` and, where a scene departs from
the default, into the scene. Follow it. **A departure invented at call time generates
something nobody approved.**

`mlx_image_generate` / `mlx_image_edit` are an optional extra local lane when MLX Core is up.
They require an explicit local selection; readable text uses GPT Image 2; the plugin never
launches the app, so a down `:11234` fails closed. On a machine without mflux,
`image_local_generate` fails with install instructions — report the unavailable
selected engine and request an explicit alternative before any GPT Image call.

**Backgrounds that become video sources** — a scene with b-roll attached, a motion-background
scene — are made on the saved image model at its saved quality (model-settings.md), with something
in frame for the clip to move (rule 11 — a person only when the shot needs one). Blurry or
static, and those 8 seconds look like a still frame; a saved engine that cannot deliver a usable
source is reported for an explicit exception.

## 2. Making the calls

Read the size off the preset rather than typing it:

```bash
PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
node $PG/format-resolve.js storyboard/scenes.js --json | python3 -c \
  'import json,sys; f=json.load(sys.stdin); print(f["format"], f["image"])'
# shorts-9x16       {'gpt': '1088x1920', 'local': '1088x1920', …}
# youtube-long-16x9 {'gpt': '2560x1440', 'local': '2048x1152', …}
```

Portrait is 1088×1920 rather than an exact 9:16 because of gpt-image's multiple-of-16
constraint; it cover-crops onto the 1080×1920 canvas, so the 0.7% difference is ignorable.

Plan still-camera source dimensions before generating an image. All zoom ladder rows
use `peakZoom = 1 + rate × seconds` for push/pull/approach, and need at least
`ceil(canvas width × peakZoom / 1.5)` × `ceil(canvas height × peakZoom / 1.5)`.
Pan/tilt and optical effects use their actual fixed/end-point zoom instead.

| Speed | Rate | Example length | Minimum portrait | Minimum wide |
|---|---:|---:|---:|---:|
| Omitted / very slow | .04/s | 8s | 951×1690 | 1690×951 |
| slow | .06/s | 9s | 1109×1972 | 1972×1109 |
| fast (maximum 6s) | .14/s | 6s | 1325×2356 | 2356×1325 |
| very fast (maximum 5s) | .20/s | 5s | 1440×2560 | 2560×1440 |

The standard portrait 1088×1920 source supports at most 12.5s at .04/s or
8⅓s at .06/s: very slow 12.6s and slow 8.4s already need a larger source.
The local wide 2048×1152 source supports at most 15s at .04/s or 10s at .06/s.
Recalculate for every planned length; these are size limits, not permissions to exceed
the fast/very-fast duration caps. For fast rows, 1440×2560 portrait or 2560×1440 wide
covers the allowed durations. The renderer remains the final 1.5× guard; an earlier
PNG-header authoring check is outside this change.

Save each one as `storyboard/images/scene-<n>.png`, `<n>` counting from 1 — the same number
the strip calls "Shot n". Slide scenes have no still here (their screen is HTML, authored at
§3.6), and shooting mode has none at all.

**Generate from the shot plan, not an actor lookup.** Apply
[opening-frame planning](../../storyboard/references/visual-direction.md#plan-each-opening-frame-before-assigning-images).
Use shared face/body/location references to preserve identity and geography while the shot
plan controls framing, pose, expression and visible prop state. Do not bind `host.png` to
every host line or copy one portrait into separately numbered files. When editing a previous
scene image, explicitly describe the new composition and opening state; preserving the
character does not mean preserving the previous camera. Intentional return shots may reuse
an image after checking that it depicts the planned moment and recording why reuse fits.

**A character scene is a reference call.** Resolve the id to its panel directory and pass the
views the shot needs as separate reference inputs: face + body for front/three-quarter
shots, face alone for a facial close-up, and back for rear shots (add face only if visible).
Optional extra panels need a shot-specific reason. A new reference set must contain all three
required views even when the current shot uses only one..

```bash
CH=$(python3 ${CLAUDE_PLUGIN_ROOT}/skills/channel/references/resolve-asset.py "$CHANNEL_DIR" character claude)
```

Never merge the panels into one sheet before passing them
([video-model-selection.md](video-model-selection.md) §The character panels). This is the same set the video
engines get in §3, and using it here is what keeps the character the same person from the
still to the clip.

**Negative directions ride in the body.** Neither `gpt_image_text2img` nor
`image_local_generate` takes an exclusion argument, so the short noun list the storyboard put
in through `--exclude` stays inside `bgPrompt`. Don't write instruction-form negatives into
the body — "no maps" draws a map (measured: 4 of 4 failed). An element that keeps coming back
gets designed out of the scene sentence instead.

## 3. The image check

Apply [content grounding](../../storyboard/references/narration-visual-grounding.md#inspect-content-separately-from-appearance)
before judging style. Describe what the pixels actually show, then compare with the line,
shot purpose and opening state. Record content fit and its limits in existing review notes;
the styleMatch field below only describes style. An expressive face in the right room is
not evidence of a narrated event. Keep source-image inspection separate from future motion.

Compare all source images in playback order and compare recurring characters together before
video generation. Open the actual paths declared by the board, including legacy filenames;
`scene-*.png` alone may miss them. Read the shot-image warnings from `check-scenes.js` and
resolve the creative question: an intentional return shot, or an accidentally repeated
portrait? Inspect similar-looking files too: byte hashes cannot detect re-encoded copies or
small expression edits. Record the observed framing/action, not merely a filename or hash.

**Look at the picture that came out.** Open every `images/scene-*.png` (and the
`narration[].img` files in illustration mode) once with Read against that scene's `shot.info`
and narration. The criterion is right, not pretty. For cut storyboard images, review-cut-images uses a fresh independent host reviewer
under the fixed production workflow. The author cannot certify their own corrections. Shooting
mode skips this entirely.

For cinematic-miniature, also read the bundled [style guide](../../storyboard/assets/styles/tactile-miniature-v1/STYLE.md).
Use the assembler's actual reference-image arguments; a filename in prompt prose does not
attach an image. Narration edits require a fresh content check even when no camera field
changed. Reuse after a wording-only edit is allowed only after reading the image against the
new words. A checksum or a refreshed approval hash is not evidence of that read.

**Read the style as its own question**, after the content: is this the preset the shot carries
(`PRODUCTION.style.preset`, or the shot's approved `shot.style.preset`)? Photographic skin in
webtoon, a smooth plastic figure in claymation, a doll-like surface in photoreal, a painted-looking
photo in ink-wash — each is a mismatch (visual-style.md). Write the read to
`.work/still-review.json`, one entry per generated still:

```json
{ "shots": [{ "shot": 4, "imageSha256": "<sha256 of images/scene-4.png>", "preset": "webtoon",
              "styleMatch": true, "reviewer": "produce §3 read", "at": "2026-09-19T10:20:00+09:00",
              "evidence": "Drawn skin and cloth, clean contour lines, cel-shaded background." }] }
```

`check-production.js --ready` reports a generated still without a current entry, with
`styleMatch:false`, or reviewed against another preset than the shot now carries as a
`not_reviewed`/`stale` warning; the record is written only after actually looking. A
mismatch is remade in the shot's preset. When the preset itself is wrong for this picture, that
is the user's call: ask with AskUserQuestion, and only their approval writes `shot.style`
(visual-style.md §Per-shot style) — then the prompt is reassembled, the still regenerated and
read again. Never write an override to excuse a picture that already came back.

What disqualifies an image:

- a picture off the preset the shot carries (see the style read above)
- a picture unrelated to what the scene says
- a baked-in pseudo-character or a lookalike glyph
- readable text (unless the scene asked for it and went to gpt)
- a real person on a channel that generates its people
- a bright lower third under the cover's code-rendered bottom text block

**Remake only what fails, once.** Add the correction on top of the original prompt — don't
re-describe it wholesale, which loses the elements that had passed. Props with text engraved
on them (keyboards, calculators, signboards) can't be blocked with negative directions; taking
the object out of the composition is the answer.

**If the remake still looks wrong, don't buy a third attempt on your own.** Ship the better of
the two with the finding recorded in `build-report.txt` and the completion report, or change the
scene within the plan; a third paid attempt needs remaining spending authorization and is offered
as an option in the report, not asked as an approval. Unattended runs
([unattended-lifecycle.md#image-check](../../autoproduce/references/unattended-lifecycle.md#image-check))
ship the best attempt and report the limitation; a still that merely looks wrong writes no queue hold.

## 4. The ledger

**One line per call, written right after the call** — batching it later loses the
regenerations. The convention is
[cost-tally.md](../../autoproduce/references/cost-tally.md).

```bash
printf 'image.gpt-image-2.high\t1\tproduce: cover background scene-1\n' >> .work/cost-tally.tsv
printf 'image.local\t3\tproduce: points backgrounds scene-2~4\n'        >> .work/cost-tally.tsv
printf 'image.gpt-image-2.high\t1\tproduce: §1.5 remake scene-1\n'      >> .work/cost-tally.tsv
printf 'image.host\t5\tproduce: cover + points on the host image_gen\n'   >> .work/cost-tally.tsv   # Codex · Grok
```

Log local images too — the unit price is 0 so the total doesn't move, but the report showing
how many went where is what separates "image cost 0" as a tallied result from a tallying gap.
The `quality` of `gpt_image_text2img` decides the key (`high`·`medium`·`low`), and a discarded
remake still gets billed, so it gets its own line.

The storyboard's `SB_DOC.cost` is a **projection**, not a receipt — §10 compares the two, and
that comparison is only possible if every call here left a line.
