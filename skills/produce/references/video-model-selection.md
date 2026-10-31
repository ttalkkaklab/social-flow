# Video engine selection — voice lanes, LTX and Seedance

> **Freshness** — verified 2026-08-25, engine set 2026-10-31 · source: vendor documentation plus
> our own generation runs (each claim carries its own measurement date inline)
> · recheck every 90 days, and when a vendor ships a model tier.

The plugin keeps only video engines that can keep a character's voice, or that render a picture
nobody speaks in (owner directive 2026-10-31). Veo, Gemini Omni and Seedance 1.x left the plugin
on 2026-10-31 because none takes a voice reference.

- **ASTRA GenAI** (`astra_genai_*`, `ASTRA_GENAI_API_KEY`) — LTX through the gateway:
  `astra_genai_msr` (MSR reference with per-character images and an optional voice sample) and
  text/image/audio-to-video ([astra-genai.md](../../_shared/astra-genai.md))
- **ASTRA GenAI desktop** (`astra_genai_desktop_*`) — text, image, audio, keyframes, extend, retake
- **Seedance** (`seedance_*`, `ARK_API_KEY`) — Dreamina Seedance 2.x only: free-form length/ratio,
  up to 30 reference images, a reference voice on `seedance_reference`
- **Local MLX** — `ltx_video_generate`, and `fasth3_omni_reference` (FastH3 Omni, a local
  MiniMax-style pack with a reference voice lane)
- **ASTRA** (`astra_*`, below) and the **host** tool (§The host video tool comes first)

## ASTRA — our own LTX box

**ASTRA video** (`astra_*`, `ASTRA_VIDEO`) is our own
LTX-2.5 box, so a call costs wall clock instead of money and no vendor policy applies — but it
renders one job at a time (66-184s each plus whatever is queued ahead of you). Take it for batch
work nobody is waiting on, for a cinemagraph or slow-motion look, for a clip that has to pass
through several supplied stills, or to re-roll one span of an existing cut; stay on the saved
API model whenever the answer is needed now. It does not change the default route for anything
below.

A board asks for this lane per shot with `visual.video.engine: "astra"` (b-roll and quote cuts
take the same key). The lane name is `astra`, not `ltx` — a board that writes the model name
gets `unknown video engine: ltx` from scenePlan, because a silently-ignored engine would have
planned a Seedance call and billed for it. Like the host lane it carries the same source and
prompt as any other engine and none of the Seedance planning fields (`model`, `modelPurpose`, `modelReason`,
`referenceImagePaths`, `referenceAudioPaths`); naming one of those on an astra shot is refused
rather than dropped. The engine stays opt-in: nothing routes here unless the board says so.

ASTRA's `fast` tier is a lower-resolution draft that finishes sooner than `guided`; measured at
121s, it was slower than the default pipeline's 66s. Automatic duration selection stops at 121
frames and its rounded range must contain an 8k+1 frame count. Direct `numFrames` accepts
25-361 on the same grid on every mode, the live server ceiling (`/v1/models`, 2026-10-17). For `astra_audio2video`,
choose `numFrames` or `audioMaxDuration`, never both; the tool also checks that `audioStartTime`
is before the uploaded track ends. Retakes check source frames, 32-pixel dimensions and the
requested end time against uploaded metadata before submission.

The front door has returned 403 for a runtime-default User-Agent, so every ASTRA request sends
`User-Agent: social-flow/<version>`. Per key, uploads are limited to 10/min and jobs to 5/min and
60/hour; the waiting queue holds 20 jobs, and `/v1/jobs` bodies stop at 1 MiB.

Uploads expire after 24 hours and each key has a storage ceiling of **200 files** (live 2026-10-18 contract).
Use `astra_video_list_uploads` with no arguments to find ids, then
`astra_video_delete_upload({uploadId: "the-exact-id"})` only for inputs no longer needed
by queued/running jobs or planned reuse. Deleting an upload does not delete a local source file.
These tools require server `GET /v1/uploads` and `DELETE /v1/uploads/<id>` support:
the reported server baseline is GET 404 and DELETE 501 (2026-10-03). They fail explicitly
on those responses or HTML, including HTML served as HTTP 200; they never turn them into
an empty list or a successful deletion. Until server support and a valid key are available,
only mocked transport tests establish client behavior, not live operation.
The provisional success contract is `{uploads: [{upload_id, kind, bytes, expires_at}]}`
for listing and HTTP 204 or HTTP 200 `{upload_id, deleted: true}` for deletion.
It must be checked against the server before this change becomes ready for use.

Two things to know before you write the call. Sizes sit on a 64-pixel grid with a 2,064,384-pixel
area ceiling (`LTX_MAX_PIXELS=2064384`, measured 2026-09-30). Read the board's existing `FORMAT`:
use **1024x1920 for `shorts-9x16`**, then widen it to 1080x1920 in the edit; use **1920x1024 for
`youtube-long-16x9`**, then scale it to 1920x1080. Both source sizes contain 1,966,080 pixels.
1088x1920 exceeds the ceiling at every frame count. 1080x1920 is refused because 1080 is a
multiple of neither 64 nor 32. The edit may add padding instead of scaling when composition needs it.

For image-conditioned calls, the server blocks **generate: {121,129,137}** at
width 1280 (measured at heights 704/768) and **guided: {121}** at width 1280 (measured at height 704). Guided 129 and 137 succeeded at 1280x704 in server probes (the only guided size probed);
the guided client ceiling is now 361 like every mode. Guided and hq sizes follow the server grid and pixel ceiling; unmeasured sizes are not quality guarantees. Within current client limits use
generate 113/145 (measured at 1280x704); generate 1536x704 and 1536x1024 at
121 frames also succeeded. The image-conditioned warning does not apply to `astra_text2video`: text-only
1280x704 at 121 frames succeeded. An upstream defect is a hypothesis, not a confirmed cause.
The server owns the failure-band acceptance gate; the client documents it without a second gate.

For `audio2video`, one 1536×1024 × 177-frame job (`09f0132b`) failed with
`CUDA error: an illegal memory access`. That single observation does not establish that
this combination always fails: resolution, frame count and prompt changed together.
A later 2026-10-04 07:3x UTC snapshot of 562 stored requests contained 20
`audio2video` jobs, eight with image conditions, and two failures: one CUDA failure
above and one mono-audio encoding failure (`ef33b3a4`, 1536×1024 × 81 frames).
The latter failed before denoising and does not establish a working resolution/frame pair.
Source: reviewer census report `c2c358f6063283651e0ac007d99fe4ff7d38484cdaf19303a0d2200c9f65b6b7`.
The earlier 2026-10-04 seven-job record contains six successful 1280×704 jobs
(121 frames × 3, 81 frames × 2, 89 frames × 1). The supplied timing log establishes
92 seconds for the **89-frame** job `6331bf1a`, not a 92–107-second range at 121 frames.
Source: `LTX_A2V_STRENGTH_EVIDENCE_20261004.tgz`, `logs/r253.log` and `ERRATA.md` §5/8.

`astra_audio2video` exposes portrait `strength` from 0 to 1, default **0.9**, and
sends it inside `images[]`. Without `imagePath`, strength is ignored. In the
2026-10-04 dialogue probes, 19.2 at 0.9 showed mouth movement following the audio;
19.2 at 0.7 showed mouth movement but changed the person. Prompts and upload ids
also changed, so these observations do not isolate strength.
**Conditioning-image visibility:** the 25.3 source is a wide side view of a bearded
face, with the lip line visible. The side view is a less useful reference for frontal
mouth opening; regeneration did not introduce that composition. The 19.2 source
is a full-body view with a small face: the mouth outline is visible, but it is not a
detailed mouth close-up. Neither local dialogue source supplies a detailed, unobscured
mouth close-up for evaluating source-mouth conditioning.
**Output visibility:** the 25.3 regeneration keeps the side view. Its lips are visible
and change shape across sampled frames 0/20/40/60/85. The side view, small face and
beard limit inspection, but do not make the lips invisible. These frame samples do
not establish synchronization with audio, just as the 19.2 samples do not.
The 19.2 outputs show the mouth in close-up after the full-body-to-close-up transition
described below; that does not describe the 19.2 source. The earlier 25.3 motion score
0.670 concerns overall movement, not mouth visibility or audio/mouth synchronization.
The isolated 8.1 pair (1.0 versus 0.5) showed no output mouth change; its source mouth
was not visible. **1.0 is unmeasured on cuts with a clearly detailed, unobscured mouth
close-up in the conditioning image; neither local dialogue source (19.2 or 25.3) meets that condition.**
The source close-up condition is a qualitative judgment, not a calibrated threshold.
Anyone testing 1.0 should record why the selected source meets that condition alongside
the results.
The default selects a value used by successful jobs, not a proven causal improvement.
Source: the same evidence bundle, server jobs `a361afa9`, `4a9e9f85`, `6331bf1a`,
`af272f36`, `df8561ed`; corrected local `README.md` and `ERRATA.md` §9/11/12.

A same-session 2026-10-04 09:47–09:50 UTC **19.2 pair** used strength 0.7 and 0.9
with identical prompt bytes (`diff` exit 0), seed 42, 1280×704, 81 frames and 24 fps.
Both used the same source image and stereo WAV bytes; fresh upload ids differed.
The submitted requests matched after excluding those ids and strength, and the server
recorded the requested strengths. Jobs `9bb19cea6f9d4b43ac2bab9a0152bd4e` (0.7, 86s)
and `4557a98c1a9a4e4f863f86784f91570f` (0.9, 88s) both produced 3.375-second clips.
**Observation (outputs):** sampled frames 0/16/32/48/64/80 show mouth-shape changes
in both clips. Despite attaching the full-body source at `frame_idx: 0`, including
at strength 0.9, both outputs show a close-up by sampled frame 32. This is how the
mouth becomes visible in close-up in the 19.2 outputs; the source provides only a
small mouth outline.
The close-up faces were not distinguishably different between the two strengths in
the reviewer's frame reading. The source face is too small to support an identity
comparison, so this pair does not establish that the earlier 0.7 person change recurred.
**Causal limit (conditioning image):** an obscured or small source mouth does not
provide the detailed mouth reference needed to assess source-mouth conditioning.
Repeating these same inputs cannot establish the effect of conditioning on a detailed,
visible source mouth; that requires a suitable conditioning image. This is not a claim
that strength cannot affect generated faces or that the audio cannot drive mouth motion.
**Causal limit (outputs):** this one pair does not establish better identity preservation
or lip-sync at 0.9; sampled frames do not measure audio/mouth synchronization, and no
repeated runs or identity metric were used. The earlier changed-person observation
at 0.7 must not be generalized to all 0.7 jobs.
1.0 was not tested in this pair. The default remains 0.9 without a causal quality claim.
Source: permanent discussion and review in
[ttalkkaklab/social-flow#398](https://github.com/ttalkkaklab/social-flow/pull/398)
and task `f5e0e15aa27a751a324ff1012f26d1747b1ca452675fc4d76ad6b6a9e9a1a919`.
Evidence local to this Mac: `WORK_LOGS/SENIOR_A2V_STRENGTH_PAIR_20261004/` —
`WIRE.json`, `PAIR_CHECK.json`, `PROMPT_DIFF.txt`, `INPUT-19.2-s*.json`,
`RESULT-19.2-s*.json`, `FFPROBE_S*.json` and `FRAMES_S*.png`.
The 25.3 output limitation also refers to prior regeneration
`d9924624e3474c6482ce698fb9645e50`; the source/output distinction and face comparison
are documented in PR #398 review `5405432757`, with the later source-visibility
correction in PR comment `5978877144`. The 25.3 output observation above follows
the reviewer's inspection of frames 0/20/40/60/85 from job
`d9924624e3474c6482ce698fb9645e50`; it supersedes the earlier obscured-mouth claim.

Clips carry AAC (48kHz stereo); `generateAudio: false` strips it after generation (same render time). **audio2video carries the supplied
WAV re-encoded as AAC**, rather than newly generated sound: job `558632165cfe4678a631eb460bf89457`
measured 100ms RMS Pearson correlation 0.99997 at zero lag. Use stereo (2-channel) input;
mono WAV is refused at upload because it fails in the engine's audio encoder. With no
`duration`, `numFrames` or `audioMaxDuration`, the client explicitly sends 121 frames (~5.04s at 24fps) for compatibility, even for an
8-second WAV. `numFrames` fixes the length; `audioMaxDuration: 8` selects 185 frames (~7.71s)
at 24fps after rounding, so it can trim the tail. Drop or duck the output track in the edit
when laying another narration or BGM over it.

This document describes the engines' capabilities and prompt grammar; which engine an
episode uses is the saved directory model (model-settings.md), and the comparisons here serve first
setup and explicit change requests. Tool descriptions carry their own summaries of it, and
`skills/autoproduce/references/prices.tsv` is the source of truth for unit prices.

Reference date 2026-08-15. The Seedance side was verified by opening the official BytePlus
ModelArk docs directly, with the write-up in `docs/api-reference/seedance.html`.

---

## Contents

- [The host video tool comes first](#the-host-video-tool-comes-first)
- [The selection rules — decide in this order](#the-selection-rules-decide-in-this-order)
- [Seedance per-cut selection](#seedance-per-cut-selection)
- [One-line decisions](#one-line-decisions)
- [Price comparison](#price-comparison)
- [Quality — blind arena rankings](#quality-blind-arena-rankings)
  - [What to read from it](#what-to-read-from-it)
  - [The models with no evaluation yet](#the-models-with-no-evaluation-yet)
  - [Where not to take the ranking at face value](#where-not-to-take-the-ranking-at-face-value)
- [The traps this pipeline hits](#the-traps-this-pipeline-hits)
  - [The character panels — how a channel cast is stored](#the-character-panels-how-a-channel-cast-is-stored)
- [The four Seedance models — what differs](#the-four-seedance-models-what-differs)
- [Prompt grammar — Seedance](#prompt-grammar-seedance)
  - [Positive locks — what an exclusion turns into on Seedance](#positive-locks-what-an-exclusion-turns-into-on-seedance)
  - [The batch-failure ladder — which level to change](#the-batch-failure-ladder-which-level-to-change)
- [Camera — this section is the source of truth for engine vocabulary and routing](#camera-engine-vocabulary-and-moves-per-cut)
- [What Seedance can't do](#what-seedance-cant-do)
- [Key setup](#key-setup)

## The host video tool comes first

For a configured workspace, [directory model settings](../../_shared/model-settings.md)
take precedence: reuse the episode snapshot's video engine/model/resolution. The
host default and per-cut recommendations below guide first setup only. Do not
replace a saved choice because another host, cheaper tier or faster engine is now
available. A capability mismatch needs an explicit user exception before switching.

**Rule 0 (owner directive 2026-09-07; a first-setup recommendation since 2026-10-16).** When
the CLI running produce ships its own video tool, recommend that tool at directory setup; once
`.social-flow/models.json` holds a video model, that saved choice is the route, and the rules
below inform first setup or an explicit change request only. Today that CLI is **Grok**: `image_to_video` (one source
image, `duration` 1–15 s, `resolution` 480p or 720p, the aspect follows the source image) and
`reference_to_video` (several reference images, `duration` 6 or 10 s, preset `voices` for a
speaking subject). Codex and Claude Code ship no video tool, so `videoProvider` is `"api"` there.

What the route means in the plan:

- The storyboard writes `engine:"host"` on the slot (`visual.engine` for b-roll,
  `visual.video.engine` for a motion background, `visual.clip.engine` for a speech clip) and
  the forecast bills `video.host` at $0 for the requested seconds — the subscription allowance
  pays, so the episode budget only counts what the API engines still bill.
- The clip comes back at 720p at most; the builder's b-roll and background inputs take any
  resolution and scale onto the 1080p canvas, and the approval page shows the ceiling beside
  the slot. A cut that needs 1080p pixels, 4K, a local-file extension or a Seedance
  asset-library character writes that reason and takes the API engine.
- One clip is one call, the same source PNG and the same stored prompt as any other engine.
  The prompt reads as plain English with no timecodes and no negative directives; exclusions go in as positive description,
  the way the Seedance lock does it. A speech clip on `reference_to_video` names a preset
  voice; the channel's fixed voice still comes from TTS.
- Zero-data-retention accounts get no video tools at all (the CLI says so at the call); that
  is an `"api"` episode the user chooses, not a silent switch.
- A host call that fails is put to the user before any billed API call.

Quality is unmeasured through the CLI tool. The one published reading (Artificial Analysis
image-to-video arena, read 2026-08-16) put grok-imagine-video-1.5 below
Seedance 2.0; nothing in this repo has generated a clip through the tool yet, so the first host
episode reads its clips at full playback like any other and writes what it saw in
`build-report.txt`.

## The selection rules — decide in this order

So we don't reread the price sheet and arena rankings every time, the conclusions are frozen
into four lines.

**1. A spoken cut needs a voice lane.** Every adapter declares one, shown by `video_catalog` as
`voice.lane` with `voice.dialogue: allowed|refused`: `reference` (`astra_genai_msr`,
`seedance_reference`, `fasth3_omni_reference` — a pinned per-character voice sample sets the
speaker's timbre; Seedance binds `@Image N`/`@Audio N` on 2.5 and `Image N`/`Audio N` on 2.0),
`supplied` (`astra_audio2video`, `astra_genai_audio2video`, `astra_genai_desktop_audio2video` —
the pinned TTS track drives the clip) or `none` (everything else). `video_plan` refuses a
lane-`none` adapter with `voice_lane_required` when the shot has an `on_screen` line, or when the
model would voice lines natively (audio on in a `visual.clip` or `type:'broll'` slot). Narration
over a non-speaking picture passes on any adapter; a `visual.clip` slot with lines sets
`generateAudio:false` there. MSR's voice sample stays optional: without one the prompt voices the
speaker and the plan warns ([voice-continuity.md](voice-continuity.md)).

**2. If the source contains a live-action person, Seedance 2.x is out.** The Dreamina Seedance
2.5/2.0 family rejects input faces — probed 2026-08-15 with a face PNG, Seedance 2.0 rejected it
at `first_frame` (`InputImageSensitiveContentDetected.PrivacyInformation`). Photoreal real-person
sources go to the LTX lanes (ASTRA GenAI, ASTRA).

**3. (First setup) If the slot discards the sound, generate it silent** (`generateAudio:false`).
Once a model is saved it serves both slots.

**4. Don't make an unevaluated model the default for an important cut.** 2.5 · 2.0 fast ·
2.0 mini are on no public arena at all (§Quality). If you want one because it's cheap or
feature-rich, run the same prompt on both once that episode and decide.

A saved or override selection naming Veo, Omni or Seedance 1.x is refused by `video_plan`
(`video_engine_unsupported`); a `.social-flow/models.json` with such a video choice reads as
`migration_required` with `retired:['models.video']`, and saving one is refused. Choose again
with `project_manage`. Existing clips from those engines stay reusable through `visual.reuse`;
never regenerate one solely to migrate. `prices.tsv` keeps their rows so earlier ledgers still
price.

## Seedance per-cut selection

Each generated cut may choose its own supported model and resolution (user directive
2026-09-13). `PRODUCTION.videoModel` records the episode default or `model: 'mixed'`;
it does not constrain every cut to one model. A 3D previz is optional. On `seedance_img2video`
use `frame_and_prompt`: edit the source still from the previz first frame and carry the camera
and blocking in the prompt. Omit reference image/audio arrays; the ordinary image-to-video route
takes `visual.bg`. On `seedance_reference`, `reference_video` sends the previz clip and bills
input plus output seconds.
Model input limits, supported resolutions, price rows and approved budgets still apply.

Store the selection fields beside the prompt: `visual.video` for motion backgrounds,
`visual` for b-roll, `visual.clip` for speaking clips. The shared resolver is
`seedance-route.js`; check-scenes and cost-preview both call it.

| Field | Contract |
|---|---|
| `engine` | `seedance` for this route; other cuts take the saved engine |
| `modelPurpose` | `standard` (default), `complex-motion`, `reference`, `fixed-voice`, or `previz` (the 3D previz clip as `Video 1` — storyboard `blender-previz.md` §6; every generated_video cut on the Seedance route) |
| `modelReason` | Optional explanation of the action or reference requirement |
| `realFaceInput` | Set after inspecting all source/reference images. 2.x requires `false`; a generated photoreal face counts as a face too |
| `referenceImagePaths` | Planned character/product panel paths, in prompt reference order; one source frame is not a reference set |
| `referenceAudioPaths` | Planned fixed-voice samples; forces the 2.5 speaking/b-roll route |
| `previz` | `{ renderer, clip, firstFrame, sha256, fps, seconds, camera: { movement }, handoff?, actors?, blend? }` with `modelPurpose:"previz"` — the clip rendered at the billed length, `referenceImagePaths[0]` the source still, no end frame; billed as input + output seconds on the `…-video` price rows. On `engine:"host"` the same record carries `handoff:"frame_and_prompt"` and none of the Seedance fields |
| `model` | Optional exact model ID; omit to use the purpose-based selection. An explicit override must pass the same capability checks |
| `resolution` | The saved resolution for this model (720p allowed, CLAUDE.md 2026-09-12); the final canvas scales the source |

A photoreal face cannot ride a 2.x cut. Do not remove the face or change the shot merely to
qualify for 2.x; report the cut for an explicit exception to an LTX lane and replan it there
before generating, multi-reference and voice requirements included.

Produce reads each Seedance row's `generation` object from `cost-preview.js --json` and
uses its `tool`, `model`, `resolution`, `generateAudio`, and reference paths as the `video_plan`
operation args, with `requiredSeconds` from `plan-video-duration.js` for the length
(video-duration.md; the legacy `durationSeconds` is not sent beside it). Resolve relative reference paths from the storyboard directory.
Add the stored prompt and source/output paths. Do not send planning fields such as
`modelPurpose`, `modelReason`, `realFaceInput`, `priceKey`, or `kind` as tool arguments.
`seedance_img2video` takes the existing source still; `seedance_reference` takes the
resolved reference paths, and on a previz cut `referenceVideoPaths` too. Bind image/video/audio
indices in the stored prompt before approval.

The forecast bills the model's minimum duration and rounds fractional used seconds up;
a 3-second scene therefore pays for 4 seconds. It rejects overlong scenes. Changing
model, purpose, resolution, audio, or references invalidates the cost snapshot. Unknown
price combinations block a budget verdict. Forecasts use
list prices, including 2.5 at 1080p, so expiring discounts cannot understate the budget.

Keep upgrades inside the episode budget and existing approval scope. Unattended runs use the
saved directory model like attended ones; a legacy growth-plan `video_model` does not override it.
Do not make a paid A/B comparison by default. If a saved-model clip repeatedly misses an essential
action, or the saved model cannot take a required reference or voice input, report the limitation
with the spent ledger and request an explicit exception before any other model is billed.
Reference/voice requirements cannot be dropped just to fit the cap.

## One-line decisions

| Situation | Use |
|---|---|
| **The CLI you run in ships a video tool** (Grok) | `image_to_video` / `reference_to_video` — `engine:"host"`, $0 on the allowance, 720p ceiling (§The host video tool comes first). The rows below are the managed lane: `videoProvider:"api"`/`"astra"`, or a cut that wrote why the host tool cannot serve it |
| **A character speaks on screen**, timbre from a pinned sample | `astra_genai_msr` (at most two referenced characters; sample optional) · `seedance_reference` on 2.x with `generateAudio:true` · `fasth3_omni_reference` locally. `video_plan` maps pinned samples to their actual reference indices ([voice-continuity.md](voice-continuity.md)) |
| **The finished TTS WAV must drive the mouth** | `astra_genai_audio2video` · `astra_audio2video` · `astra_genai_desktop_audio2video` (the supplied lane) |
| **A non-speaking cut** — narration over the picture, mood, place | Any adapter: `astra_genai_img2video`, `seedance_img2video`, `astra_img2video` … (b-roll carries no narration — produce rule 9) |
| **Motion background** (`visual.video` — the builder discards the sound) | The saved model with `generateAudio: false`; on Seedance, `seedance_reference` with an optional previz as `referenceVideoPaths` (§Seedance per-cut selection) or `seedance_img2video` with a `frame_and_prompt` previz |
| **b-roll slot** (produce absolute rule 9 uses the clip's own sound) | The saved model with its audio on; a b-roll whose characters speak takes the voice-lane rows above |
| Source contains a **live-action person** | An LTX lane (ASTRA GenAI, ASTRA). Seedance 2.x rejects face input |
| You must **reproduce the composition** of a source picture | First/last frames (`sourceImagePath`+`lastImagePath`), not reference images. References carry look and style, not composition |
| **Register a character once and keep calling it** | The Seedance asset library (`asset://`) |
| **Character/product** consistency from several photos | `seedance_reference` · 2.5 (up to 30 images); MSR takes references for at most two characters plus the background |
| Transfer a **sketch/toon style** by reference | `seedance_reference` |
| **Extend** a clip or re-roll one span | `astra_genai_desktop_extend` · `astra_genai_desktop_retake` · `astra_video_retake` |
| A length past 15s in one call | Seedance 2.5 (4–30s); LTX lanes take frame counts ([video-duration.md](video-duration.md)) |
| **21:9 / 4:3 / 1:1 / 3:4** frame | `seedance_*` — every ratio |
| **4K** | `dreamina-seedance-2-0-260128` |
| **Cheapest** paid single cut | `dreamina-seedance-2-0-mini-260615` — 720p 5s ≈ $0.38; ASTRA and local MLX cost wall clock instead |

---

## Price comparison

**Seedance is token-based** (resolution × 24fps × length), so per-second cost rises with
resolution, but it takes length in 1s steps and charges just that. There's no free tier.
ASTRA and local MLX cost wall clock, not money.

**Per-second price (USD/s)**

| | 480p | 720p | 1080p | 4K |
|---|---|---|---|---|
| Seedance 2.5 | 0.103 | 0.231 | 0.569 *(from 8/17)* | — |
| Seedance 2.0 | 0.070 | 0.152 | 0.374 | 0.778 |
| Seedance 2.0 fast | 0.056 | 0.120 | — | — |
| Seedance 2.0 mini | 0.036 | 0.076 | — | — |

The Seedance figures are the official docs' 5s example prices divided down to per-second
(2026-08-15). Three time-limited discounts are not reflected — 2.5's 1080p at 72% of list (through ~09-17),
2.0 mini at 40% and 2.0 fast at 75% (through 2026-10-07, rechecked 2026-09-05).

---

## Quality — blind arena rankings

The evidence is the
[Artificial Analysis Video Arena](https://artificialanalysis.ai/video/leaderboard/image-to-video)
(checked 2026-08-15). People choose between two videos made from the same prompt without
knowing which model made which, and the tally is converted to Elo. As **independent blind
voting** rather than vendor self-evaluation, it's the strongest evidence available on this
question.

**Elo only compares within a board.** Each board anchors a different model at 1000, so
cross-board number comparisons are meaningless.

**Image→video** — the lane this pipeline actually uses.

| Rank | Model | Elo | 95% CI | Sample |
|---|---|---|---|---|
| 1 | Dreamina Seedance 2.0 720p | 1,198 | ±7 | 12,599 |

**Text→video (with audio)**: Seedance 2.0 720p 1,222 (3rd). **Text→video (silent)**: Seedance
2.0 720p 1,265 (4th).

### What to read from it

**Dreamina Seedance 2.0 is #1 in image→video.** But what the arena tested is **720p output**,
this model rejects live-action face input, and it sits behind the $30-balance gate. The LTX
lanes have no arena reading here; judge them on the episode's own clips.

### The models with no evaluation yet

`dreamina-seedance-2-5-260628` · `2-0-fast` · `2-0-mini` are **on no board at all**. For 2.5,
ByteDance has published neither a tech report nor numeric benchmarks (even the 2.0 report on
arXiv only says "industry-leading in expert evaluation and public user testing" without
numbers), and the other two aren't listed either.

Which means **the cheapest option (2.0 mini) and the longest-reach model (2.5) are the ones
without quality evidence**. Before using either on an important cut, compare once with the same
prompt and decide.

The likely reason 2.5 is missing is that **its API just opened**. The date in the model ID
(260628) is the model version, not the API release date — 2.0's ID is `260128` but the
ModelArk release notes list it in **2026-04**. 2.5 has **no entry yet in either** ModelArk's
monthly release notes or product updates, its 1080p output only opens on 2026-08-17, and its
launch discount started 2026-08-14. The arena generates videos through vendor APIs and
collects blind votes, and listed models carry 2,000–20,000 votes — an API that's days old
can't have accumulated that. The arena's queue isn't public, so this couldn't be confirmed.
Expect it to be listed within weeks; recheck this section then.

### Where not to take the ranking at face value

The arena is people choosing among videos made from **general prompts**. What this pipeline
asks of the engine is a much narrower task: "push a pre-made background photo very slowly,
discard the sound." There's no guarantee general preference transfers to that narrow task.
The ranking is a starting point, not a conclusion — the real verdict is generating the same
cut from our own material on both candidate models and comparing.

The arena table's $/min price column disagrees with the vendor prices we verified. For
prices, §Price comparison above is the source of truth.

---

## The traps this pipeline hits

**1. Live-action faces — 2.x won't take them as input.**
The Dreamina Seedance 2.5/2.0 family rejects reference images and videos containing real
human faces. A photoreal source with a real face goes to an LTX lane (ASTRA GenAI, ASTRA) or a
compatible host tool. Cuts with no visible face (back view, silhouette) are accepted by every
model.

**2. Touching `ratio` crops the source.**
`seedance_img2video`'s ratio default is `adaptive` — it follows the source image's ratio.
Pass anything else and the server **center-crops**. Feed a 1088×1920 cover with `16:9` and
only the middle band of the frame survives. If you don't intend to change the ratio, don't
pass the argument.

**3. `generateAudio`'s vendor default is `true`; ours is `false`.**
Narration is added separately via `tts_*`, so a model-generated voice makes two layers. The tool
default is flipped to `false` for separate narration. Authored native effects use [model-aware effects](video-sound.md) to enable it explicitly and preserve the source soundtrack. Another exception is a reference-audio call: a voice
reference into a silent clip has nothing to shape, so `seedance_reference` rejects
`referenceAudioPaths` with `generateAudio: false` before the call.

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

An episode may override a channel character with `PRODUCTION.cast[id]`. Its required `sheet`
supplies the same appearance sentence to every people cut. When the entry also has an `image`,
that episode-relative file is the appearance reference and takes priority over channel panels.
Without an episode image, resolve the same id from the channel directory below. Document, map
and scenery cuts omit episode cast image references even if `visual.character` was filled by mistake.

The rule above says *don't hand the model one sheet with several angles drawn on it*. It does
not say keep only one picture. Store the angles as **separate files**, one subject per file, and
hand over the two or three the shot actually needs:

```
data/<channel>/assets/characters/<id>/
  identity.md   # the canonical description — look, marks, expression, voice
  face.png      # face close-up — neutral, minimal shoulders, plain background. The headshot the vendor asks for
  body.png      # canonical front panel: headless mannequin, build, clothes and shoes
  costume.png   # optional wardrobe variant; baseline body/back already omit the head
  back.png      # matching headless rear mannequin — required for every new reference set
  front.png     # legacy: full body with the head on. Fallback when the panels don't exist yet
  voice.wav     # the fixed voice sample — 5–10 s of speech in the character's register, no music or effects. Reference audio for cuts the model voices
```

**Front-facing reference set: `[face.png, body.png]`, in that order.** That is the vendor's headshot +
body-reference pairing, with our headless wardrobe panel and the face first. Add
`back.png` for rear views. A rear shot still needs the head design from `face.png`
(or a separate approved rear-head reference); do not send the headless back alone.
A facial close-up uses face alone. State that body panels supply wardrobe/build,
while the face supplies the complete head; the scene depicts a complete character.
Keep body, back and face reference images locally. All three must be stored before
a new character reference set is complete; optional extra images serve specific poses/details. Never build a combined sheet out of the panels — the moment two
angles share one image, this whole section's warning applies again.

**Baseline and adapter inputs are separate.** The shared front panel follows
`../../channel/references/character-panels.md`: front and back omit the head;
the face close-up is the single facial identity reference. This is our authoring
convention, not a vendor API constraint. Preserve legacy originals and inspect
actual identity drift. For a first-frame image-to-video adapter, compose a complete
scene image using these references first; never use a headless panel as the literal
opening frame. Multiple panels in the review sheet do not imply a multi-panel
image should be submitted as one video start frame.

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
figure), that one file stays the reference and goes to an LTX lane, since Seedance 2.x rejects
real faces.

**Engine routing** — a drawn character goes to the saved reference adapter:
`seedance_reference` (1–30 images on 2.5, 1–9 on 2.0) or `astra_genai_msr` (one character uses
its face close-up, headless front and headless back; at most two characters take references,
`msr_character_limit`). A photorealistic human face goes to an LTX lane; Seedance 2.x rejects
real faces outright. On the image lane, the same panels go to
`gpt_image_img2img` / `nanobanana_img2img` as input images, same order, same reason.

---

## The four Seedance models — what differs

| Model ID | Resolution | Length | Reference images | Audio | Live-action face input |
|---|---|---|---|---|---|
| `dreamina-seedance-2-5-260628` | 480p–1080p | 4–30s | 1–30 | ○ | **rejected** |
| `dreamina-seedance-2-0-260128` **default** | 480p–4K | 4–15s | 1–9 | ○ | **rejected** |
| `dreamina-seedance-2-0-fast-260128` | 480p·720p | 4–15s | 1–9 | ○ | **rejected** |
| `dreamina-seedance-2-0-mini-260615` | 480p·720p | 4–15s | 1–9 | ○ | **rejected** |

All models are fixed 24fps and accept every ratio: 16:9, 9:16, 4:3, 3:4, 1:1, 21:9, adaptive.
Each takes first+last frames. `seedance_text2video`, `seedance_img2video` and
`seedance_reference` all default to `dreamina-seedance-2-0-260128`.

2.5's 1080p opened on **2026-08-17 (UTC+8)** and sits in the
`dreamina-seedance-2-5-260628.resolutions` capability table (`server/src/seedance-client.ts`)
— 10-bit color, and the one tier the 28%-off list campaign covers through 2026-09-17.
4K stayed 2.0-only.

**The Dreamina Seedance 2.5/2.0 family doesn't unlock on a key alone** — it activates only
with an account balance over $30 or a purchased resource pack.

**API deltas the tool surface doesn't carry yet** (2026-08-25 delta check — candidates for
`seedance-client.ts`, not exposed today):

- **`duration: -1`** — the model picks a whole-second length inside its valid range (2.0; the
  2.5 *default*). Our pipeline computes each
  scene's length from the narration, so the deterministic path stays the rule — `-1` is for a
  cut whose length genuinely doesn't matter.
- **2.5 only**: `output_format: "mov"` (H.264 + YUV 4:4:4 + PCM — color-safe for edit/extend
  chains) and `omni_reference_task_type` (declares reference/edit/extend up front so bad
  combinations fail at submission instead of as async errors).
- **Reading order**: this vendor updates the **Chinese docs first**. Open the volcengine ZH
  page first, use BytePlus EN to cross-check.

---

## Prompt grammar — Seedance

This is what comes after engine selection. The evidence is the vendor's official docs, with the
[camera technique research](../../../docs/research/2026-08-15-ai-video-camera-technique/index.html)
and a 2026-08-25 delta check against the moved official docs.

| | Seedance |
|---|---|
| Sentence skeleton | `subject + action + environment + camera move + aesthetics + sound` — the camera slot itself is `非必须` |
| Camera vocabulary | 11 moves (`推·拉·摇·移·跟·升·降·甩·环绕·旋转·变焦`) + 5 shot-size levels (景别). **Zero lens specs or camera-body vocabulary in the entire doc** |
| Exclusion directives | No argument — re-describe the scene to avoid it, and put what must hold into a positive-locks tail (§positive locks) |
| Dialogue | Quotes + emotion/pace as plain sentences (no parameter); speakers map to their `Audio N` samples ([voice-continuity.md](voice-continuity.md)) |
| Prompt language | English only on every model — the video's language only inside quoted dialogue |
| Cutting shots | `Shot 1: … Shot 2: …` transitions within one call |
| Timecodes | **Split by generation** — 2.0 *"does not respond to timestamps and only responds to shot numbers"*; **2.5 officially takes integer-second forms** ("0-3 seconds", "[1s-4s]", "at the 2-second mark" — leave no gaps in the timeline, and don't use it for high-frequency action) |

**A multi-cut call opens wide.** Seedance keeps no memory of where anyone sat in the last
generation — it knows what the current frame tells it. Inside one call, though, the later cuts
inherit the layout the first cut established, so a `Shot 1: … Shot 2: …` call that opens on a
wide gives the model one floor plan to hold and the close-ups that follow land in the same room.
Open on the close-up instead and the model re-invents the space at every cut. `[course]` — the
same establishing rule as directing-grammar §6.2, here as a mechanism inside a single call. Our
pipeline writes one cut per call, so this bites only where a scene is deliberately generated as
a sequence.

Three rules ride with the multi-cut form (vendor guides, 2026-08-25 delta check) — time the cut
by a **dialogue or action beat**, not a clock ("as she opens her palm, cut to a close-up of the
hand"); give each cut its own shot size and distinct content; and **don't constrain per-segment
durations** — the 2.0 guide says outright to let the model pace the segments from the plot.
What packs too much into the time comes back as extra cuts you didn't ask for or dropped plot
(2.5's wording).

**One clip is one moment.** Handed too many seconds or too many beats, the model fills by
inventing (scenes-schema §cut length) — the engine-side half of the pipeline's **one scene = one call**
contract (scenes-schema §clip prompt).

**Seedance's image lane — identity words stay, layout words go.** The official pattern lives in
the Seedream→Seedance best-practice doc: reuse the source image prompt's **identity words** (who
and what the subject is), drop the **static composition words** (where things sit — the frame
already holds that), add the motion and a brief camera line, and close with a **consistency
lock**: "the subject stays exactly consistent with the input frame; keep appearance, proportions
and materials; add no unrelated elements" (the vendor's own lipstick example is this shape).
Never re-describe layout, facing or lighting.

**Exclusion directives are the most common mistake.** Write "no ~" in the body and that noun
tends to get drawn — there's a field-tested local-image case where `"no maps"` produced maps
(4 of 4 failed). Every exclusion becomes positive description (§positive locks).

**Consistency rides on references and first/last frames** — Dreamina 2.x has no seed.

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
a guarantee.)

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

## Camera — engine vocabulary and moves per cut

This section owns **which word each engine understands and how many moves a model takes per
cut**. Which technique a shot should use — the size, the angle, the move, the length and the
sound that serve what the audience should feel there — is owned by
`../../storyboard/references/directing-grammar.md` (feel → technique); the field contract is
`../../storyboard/references/scenes-schema.md`. The evidence behind this section is the
[camera technique research](../../../docs/research/2026-08-15-ai-video-camera-technique/index.html).

**The English column is the pipeline's slot vocabulary** — the words `visual.camera` and
directing-grammar write into every English prompt. The Seedance column is that vendor's own
vocabulary.

| Intent | English (`visual.camera`) | Seedance |
|---|---|---|
| Move closer | `dolly in` (not `zoom in` — that only changes the lens) | `推` |
| Move away | `dolly out` | `拉` |
| Circle the subject | `arc shot` (not `orbit`) | `环绕` |
| Sweep left/right | `pan` | `摇` |
| Sweep up/down | `tilt` | (unconfirmed) |
| Body moves sideways | `truck` | `移` |
| Body moves up/down | `pedestal` | `升` / `降` |
| Follow | `tracking` | `跟` |
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

**One move per cut.** The 2.0 guide hedges its one-move advice as `尽量` (where possible); the
storyboard writes one move per cut (scenes-schema §camera · directing-grammar §4).

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
  only, no base64. `seedance_reference` publishes a local reference video for the life of the
  task (`MEDIA_UPLOAD_URL` hosting, else a cloudflared quick tunnel — `media-publish.ts`), but
  2.5's edit and extend task types are not wired, so extension goes to `astra_genai_desktop_extend`.
- **Prompt language.** Write every video prompt in English, 2.5 included; dialogue alone keeps the video's language inside quotes.

---

## Key setup

```bash
export ARK_API_KEY="..."   # https://ai.byteplus.com/ark/region:ap-southeast-1/apikey
```

The region is `ap-southeast-1` (Singapore), the only one. `ARK_BASE_URL` can override it, but
the video models live only in that region, so normally leave it alone. Without this key the
LTX lanes still run — the engines don't block each other.

ASTRA contract update (2026-10-18): the live audio2video capability field says omitted
length follows audio, but its contract_notes still say 121 frames. The plugin therefore
sends its historical 121-frame default explicitly when duration, numFrames and
audioMaxDuration are absent. Use audioMaxDuration to follow a bounded audio span.
Length selectors are mutually exclusive. HDR is available on text2video and audio2video
without imagePath; downstream assembly must preserve its BT.2020/HLG 10-bit color.
The shot preparation helper forwards authored tier, guidance, LoRA strength, inference
steps and generateAudio when the selected mode supports them. Unsupported tier/LoRA
choices on audio/keyframe shots produce an actionable error instead of being discarded.
Upload listing/deletion are provisional extensions, absent from the six official OpenAPI
routes; availability is not promised by the generation contract.
