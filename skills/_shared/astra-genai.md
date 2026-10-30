# Unified ASTRA GenAI adapters

Use the saved `engine: "astra-genai"` selection. Legacy `astra` keeps its original
server and local `zimage` keeps mflux. Do not switch engines after an error.
Images that display or preserve readable text use **GPT Image 2**, including edits
of packaging, signs and lettered clothing; apply the scoped image-model override.

## Choose an operation from the shot or asset

| Need | Managed operation / tool | Preparation |
|---|---|---|
| New illustration or source frame | image `text` / `astra_genai_text2img` | Describe subject, setting, composition and lighting. |
| Change an existing image's style or overall appearance | image `edit` / `astra_genai_edit`, `mode:"img2img"` | Reuse one inspected source. Start near strength 0.6 and specify what to preserve. |
| Correct one region while keeping the surrounding image | image `edit` / `astra_genai_edit`, `mode:"inpaint"` | Source plus same-size mask: white (grayscale ≥128) changes, black stays. |
| Preserve a character, outfit, prop and setting in a moving shot | video `reference` / `astra_genai_msr` | Reuse inspected character, clothing, prop and location sheets; up to four subject images plus one background. |
| Animate a particular first frame or reach a final frame | video `image` / `astra_genai_img2video` | Source URI and optional last-frame URI. MSR references do not pin temporal frames. |
| Motion without identity references | video `text` / `astra_genai_text2video` | Explicit action, timing and camera intent. |
| A clip that follows a recorded speech or sound track | video `audio` / `astra_genai_audio2video` | One mono/stereo audio file; optional first/last image. The clip length equals the audio. |

Actively consider these operations during asset and shot planning. Prefer a targeted
edit when the existing asset already fits most of the shot. Prefer MSR when continuity
requires separate identity/outfit/prop/background sheets. A single reference also
works; do not invent extra references to fill slots. Z-Image cannot fuse multiple
source images into one still. Never hide that limit by dropping references.

Write each reference's role and prompt index in the shot's generation plan. Put
non-background references first and the background last: the gateway moves the
background to the final slot. Describe actions with those image numbers. Inspect
results for identity, clothing, object ownership, background and unintended text;
metadata or a completed response is not a visual review.

## Credentials and selection

`ASTRA_GENAI_API_KEY` is the `gk_` token issued by the approved GenAI console account.
`ASTRA_GENAI_URL` defaults to `https://genai.astravision.co.kr`. Company Google login
supports verified `astravision.co.kr` and `astratech.vn` accounts; pending accounts
need console approval. A Firebase ID token and `ASTRA_VIDEO` key are not substitutes.
Keep credentials in the environment or external SNS token directory, never the board.

LTX v2 uses saved `model` (`ltx-2.5-22b-distilled` or `ltx-2.5-22b-dev`) and
`resolution`. **MSR uses the server's dedicated deployment, not those v2 weights**;
it accepts no model parameter. Choosing reference/MSR explicitly chooses that
operation's deployment. The plan retains the saved selection for provenance and
its adapter deployment identifies MSR. Saved `WIDTHxHEIGHT` becomes width/height;
unsupported geometry fails rather than being silently resized. Image selection
uses the deployed model, currently `z-image-turbo`.

Use `image_catalog` → `image_plan` → `image_execute` and
`video_catalog` → `video_plan` → `video_execute`. Set the actual spending authorization
in `PRODUCTION.imageAuthorization` / `videoAuthorization`. Supply explicit
`reserveUsd` (image plan field, video args field); gateway pricing is unverified.
Zero is an explicit estimate, not an inferred price. Existing approval persists.
Use `videoProvider:"api"` for storyboard compatibility. Do not use legacy
`prepare-astra-shot.js` or `render-astra-shot.js` for this engine.

## Images and prompt expansion

Both image tools accept `model`, `prompt` (1–800 characters), optional `seed`,
`steps` (1–12; server default 9), and `promptExtend` (default false).
`steps` maps to API `parameters.num_inference_steps`.

Edits require explicit `mode` and exactly one `imagePath` or `imageUri`. Inpaint
also requires exactly one `maskPath` or `maskUri`; img2img takes no mask.
Local PNG/JPEG files become data URIs. URI inputs accept public HTTPS PNG/JPEG
or PNG/JPEG data URIs; the gateway rejects internal addresses and redirects.
Local source/mask files are hash-bound to managed plans so changed files need a
new plan. Sources are limited to 32 MiB and 4096 pixels per side.

`strength` is greater than 0 and at most 1 (server defaults: img2img 0.6, inpaint 1).
Omit `size` in edits to keep source dimensions within server limits; explicit
`WIDTH*HEIGHT` means cover plus center crop. Text generation defaults to `1024*1536`.
No negative prompt, nonzero CFG, quantization or multiple-source fusion is exposed.

Use `promptExtend:true` for short descriptive prompts that benefit from more scene
detail. Keep it false for precise masking instructions, reference numbering, exact
composition or already detailed prompts. The shared Ollama rewrites the prompt;
errors, timeouts and empty responses use the original and continue generation.
The result and saved receipt expose `promptExtension: applied|fallback` from the
response header and `usedPrompt` from the response text. Inspect that text when
available; do not claim a rewrite happened without evidence. First calls may be
slower. A fallback is not a reason to repeat generation automatically.

Example `image_plan` args for a local correction (operation `edit`):

```json
{"mode":"inpaint","prompt":"Replace only the sky with a violet sunset; retain the building and person.","imagePath":"assets/source.png","maskPath":"assets/sky-mask.png","strength":0.9,"steps":9,"promptExtend":false}
```

## MSR and v2 video

`astra_genai_msr` accepts `prompt` (1–2000 characters), `references` (1–5) and
`reserveUsd`. Each reference has exactly one `imagePath` or `imageUri`, plus optional
`background:true` (maximum one). Local paths are relative to the episode in managed
plans and become PNG/JPEG data URIs at execution. They are hash-bound to the plan.
Backend upload IDs are not accepted.

Optional MSR controls: `referenceStrength` 0–1 (default 1), `referenceFrames` 25 or
33 (default 33), `width`/`height` multiples of 64, each 64–1920 and total at most
2,064,384 pixels; `frameRate` 1–60 (default 24), `seed` 0–2147483647 (default 42).
Use `numFrames` (25–361, `8k+1`, default 121) **or** `duration` in seconds.
Duration rounds to the nearest `8k+1` with ties shorter and must fit 25–361 frames.
Measure actual output duration before assembly; do not assume it covers an exact
speech duration. `requiredSeconds`, first/last frames, LoRA, retake and a supplied
speech track are not part of this MSR contract.

MSR renders speech and diegetic effects into its own soundtrack. **Voice samples are
optional (2026-10-31, user directive).** `video_plan` lays the prompt out as the model
card does (2026-10-31): the reference block first (`Image N: <role>, <purpose>` per image,
then the panel sentence, then `Audio N: <name>'s voice, belongs only to Image M.`), a blank
line, the author's action text, then each authored line the prompt does not already quote,
as `Image M speaks with visible lip movement synchronized with Audio N while the other
characters listen silently with their lips closed. Audio N (Image M): "…"`. Write each MSR
reference's `purpose` as a visible description (who or what, clothing, materials), since
it becomes that image's description. For on-screen dialogue `video_plan` attaches each
speaker's pinned `voiceReference` sample to the subject image listed in that character's
`voiceReference.imagePaths`, as `references[i].audioPath`. Only subjects 1 and 2
take a sample (the gateway pairs `audio_ref1`/`audio_ref2` with `pic1`/`pic2`). A speaker
without a pinned sample, a speaker shown as subject 3 or later, or a gateway without sample
support leaves that speaker voiced from the prompt, with a plan warning; a sample longer
than five seconds and Korean dialogue also get warnings. A cut without
dialogue is a valid MSR cut; a voiceover line is a planning error because MSR's soundtrack
is the cut's audio. References are never reordered. The sample is a timbre reference, at
most 10 seconds of voice with no background sound; the model imitates it and does not
preserve it. A sample mixed with a music bed spread that bed under the whole tested scene,
and a clean sample left the room silent apart from the authored effects.

**Default character references (2026-10-31, user directive).** A character's MSR references
are its sheet panels from `panels.json`: the face close-up, the headless front and the
headless back. A slot is an input source, not a declared subject, so `video_plan` adds a
sentence naming the panels that show one character and taking the head and hair from the
face close-up.
One character uses all three panels; two use each face, then each front, so the two
speakers sit on subjects 1 and 2, where a voice sample can ride. At most two characters take
references (user directive, 2026-10-31): describe anyone else on screen in the action and let
the model draw them; `video_plan` refuses references for a third character
(`msr_character_limit`), and the storyboard keeps two principal characters per shot
(`[character-limit]`). The background goes last. A test on 2026-10-31
(Kardum, same prompt and seed) kept one complete orc with the sheet's outfit front and back
with all three panels; the face alone invented a different armour. The panels-only render
dropped the topknot, which the face-panel hair instruction addresses.

MSR stages framing words wherever they sit in the prompt. On 2026-10-31 (s0101, seed 42)
the words "face close-up" in the panel sentence opened every render on a close-up of
Image 1; the same prompt without them opened wide, and moving the block after the action
turned the ending into a close-up cut instead. Keep shot sizes out of reference
descriptions and keep the reference block first.

A shot reference image is possible as one more slot (`role:"composition"`) or as the
background, but in the same test neither pinned the opening layout, which the model
recomposed; the subject slot cost the second character's outfit panel and the background
slot replaced the location. Use image-to-video when the first frame must match. Two
similar-looking characters (two green orcs) briefly traded outfits at the start of a
render, the subject blending the paper reports.

Model facts (Licon MSR V2 model card, arXiv 2609.18393, ComfyUI-LTX2.5-MSR 1.2.2). The
model takes up to five images; the paper trained mostly on two to five and has not
established more. It takes voice for up to two speakers, on pic1 and pic2; the node keeps a
hidden third audio input that the card does not support. Each voice slot is a 5-second
window with a 0.04-second margin: the first five seconds are used, the rest is cut, and a
shorter clip is not padded. Training captions are English; cross-language voice and unseen
voices are not established, and the paper reports voice mixing and inherited reference noise.
The card says ambient sound needs background music in the voice sample; this plugin still
sends voice-only samples, because a music bed in a sample spread under the whole tested
scene (2026-10-30), so ambience comes from the effects written in the prompt. The ComfyUI
text encoder left-pads prompts to at least 1,024 tokens and sets no upper cap; the binding
limit here is the gateway's 2,000-character MSR prompt. The official two-speaker sample
splits about 3,700 characters through a PromptRelay node into a reference-description block
(about 940) and an action script (about 2,700); the gateway bridge encodes one string.

`video_plan` and the tool ask `GET /v1/ltx/msr/capabilities` for sample support; a
direct request that carries a sample to a gateway without the route or a backend that
cannot take samples fails with `msr_voice_unsupported` before anything is submitted.
`visual.video.voice` is retired and `sound.audioSource:"speech"` is refused on MSR.
`prepare-video-sound.js` sets `sound.audioSource:"video"` and routes `auto` effects
into the MSR soundtrack.

**LTX project default (2026-10-30, user directive).** Choosing LTX at project setup
saves `{engine:"astra-genai", model:"ltx-2.5-22b-distilled", operation:"reference",
resolution:"1792x1024"}` (16:9; `1024x1792` for 9:16). `video_plan` uses the saved
`operation` when a call names none, so episode cuts plan MSR. A direct "LTX로 만들어줘"
request means `astra_genai_msr` with the character image, the dialogue in the prompt
and the character's voice sample when one is pinned. The v2 operations take a provider `resolution` string,
and the gateway refused `1792x1024` there (`unknown provider resolution`, 2026-10-30):
a v2 call in such a project needs its own supported resolution.

The gateway acknowledged an MSR submission after 480 seconds while busy (2026-10-30), so
GenAI video submissions wait up to 15 minutes for the job ID.

Example `video_plan` args for operation `reference` (dimensions inherit selection):

```json
{"prompt":"The person in image 1 wears the jacket in image 2 and walks along the street in image 3.","references":[{"imagePath":"assets/person.png"},{"imagePath":"assets/jacket.png"},{"imagePath":"assets/street.jpg","background":true}],"duration":5,"referenceStrength":1,"reserveUsd":0}
```

The v2 tools retain explicit `duration` (integer or null) and `resolution`, optional
`fps` 24/25/48/50, `generateAudio` and provider `cameraMotion`. Image-to-video adds
`imageUri` and optional `lastFrameUri`; it does not upload local files. The gateway
validates deployment limits. Do not send MSR fields to v2 or reuse legacy upload IDs.

Audio-to-video takes exactly one `audioPath` (local `.wav`/`.mp3`/`.m4a`/`.ogg`/`.opus`,
sent as a data URI) or `audioUri` (HTTPS, or an `audio/wav`, `audio/mpeg`, `audio/mp4`
or `audio/ogg` data URI), plus `prompt`, `model` `ltx-2.5-22b-dev` (distilled is 422),
`resolution` and `fps`. Optional first image `imagePath`/`imageUri` and last frame
`lastFramePath`/`lastFrameUri` (needs a first image). There is no `duration`,
`generateAudio` or `cameraMotion`: the output length equals the audio, up to 361
frames (15.04 s at 24 fps, 14.44 s at 25, 7.52 s at 48, 7.22 s at 50; longer is 422).
A data URI may carry at most 15,000,000 base64 characters (about 11.25 MB of audio);
use HTTPS for larger files. Three or more channels are 422, never downmixed. The sample rate is not
changed: only AAC standard rates 7350–96000 Hz (e.g. 48000, 44100) pass; others such
as 192000 are 422. The
soundtrack is the supplied audio after one backend encode, not a bit-identical copy.
Lip-sync quality is not yet measured on this gateway; inspect mouths before acceptance.

## Recovery and evidence

Generation POSTs are never retried automatically. Each output has a private
`.astra-genai.json` sidecar; an unknown submission identity requires usage inspection.
`video_status action:refresh` recovers v2 and MSR jobs via their original endpoints.
Standalone `astra_genai_video_status` takes `receiptPath` and optional `download:true`.
Reusing the same standalone video output and unchanged request resumes its existing job.
`image_status action:refresh` recovers text or edit downloads from the saved synchronous
response. An interrupted image POST has no status endpoint; never guess a request ID.
Result downloads carry no gateway token. Keep receipts private; they can contain
signed result URLs. Existing outputs are not overwritten and cached hashes must match.

Contract: [gateway docs](https://genai.astravision.co.kr/docs) and
[OpenAPI](https://genai.astravision.co.kr/openapi.json), pinned in
`server/test/fixtures/astra-genai-openapi-20261020.json`. Response parsing follows
LTX `id/status/result.video_url` and DashScope `request_id/output.choices/usage`.
Contract tests use synthetic media and mocked transport, not live GPU generation.

## Model-bound gateway (2026-10-25)

Existing `astra-genai` image/video selections keep the DashScope/LTX v2 contract.
Choose these explicit engines for the newer gateway; never infer deployment from a
model name, OS or localhost. All use the same `ASTRA_GENAI_URL` (root, without `/v1`)
and `ASTRA_GENAI_API_KEY`. Production may run without MLX.

```json
{
  "image": {"engine":"astra-genai-native","model":"qwen-image-fast"},
  "speech": {"engine":"astra-genai","model":"voxcpm2"},
  "video": {"engine":"astra-genai-desktop","model":"ltx-2.5-fast","resolution":"270p"}
}
```

This is a `models` fragment, not a complete project configuration. Replace aliases
with `astra_genai_catalog kind:image/speech/video` results. Preserve project, SNS,
style and production fields when updating; existing episode snapshots stay fixed.
No example grants spending permission. `capability_status` checks credentials only.

- Image `text` selects `astra_genai_image_generate`; `edit` selects
  `astra_genai_image_edit`. `size` uses `WIDTHxHEIGHT`, not `WIDTH*HEIGHT`.
  Edits accept `imagePath` plus up to nine `refImagePaths` in order and explicit
  `mode:edit|variation`. Actual model/protocol support comes from the image catalog.
  `loras:[{id,scale}]` uses registered IDs, maximum eight, scale 0–2; zero is kept.
  No masks, prompt expansion, arbitrary LoRA paths or reference dropping.
  Do not reuse DashScope step defaults: omit steps for the model's saved schedule.
- Speech uses `tts_astra_genai` with a stable `requestId`, or `tts_route` with
  that generator. `text` becomes `input`, `maxTokens` becomes `max_tokens` and
  `outputFormat` becomes `response_format`. The plugin supports WAV/MP3; the model
  may support fewer. VoxCPM2 requires WAV and speed 1. `voice` is an operator's
  registered ID; `instructions` require voice-design support. No client reference
  audio upload or continuation. Character `tts.engine` is `astra-genai`, with an
  explicit model alias and registered `voiceId`; `voiceDirection` maps to instructions.
  `speech_manage plan_audio`, auditions and provenance use the same adapter.
- Desktop video operations `text`, `image`, `audio`, `extend`, `retake`, `keyframe`
  select the corresponding `astra_genai_desktop_*` tool. Use `video_plan/execute`.
  The installed offering ID is `ltx-2.5-fast`, never a hosted or v2 checkpoint ID.
  Resolution/fps/duration combinations are device dependent; inspect the live catalog.
  I2V takes `imagePath` and optional `lastFramePath` (two temporal references).
  A2V takes `audioPath` and optional `imagePath`; no last frame or duration override.
  `allowAudioTruncation` defaults false: pad audio to the next 8k+1 frame boundary
  or explicitly opt into frame-grid loss. No automatic trim or padding occurs.
  Extend/retake use `sourceVideoPath` and optional `targetResolution:{width,height}`.
  Their source dimensions/fps are inherited; a saved p-tier applies to new generation,
  while an explicit saved WIDTHxHEIGHT becomes the edit cap. The server never upscales.
  Text/keyframes accept `loras:[{ref,scale}]` from `kind:loras`, scale 0–4.
  Queued I2V/A2V/edit schemas do not accept LoRAs. Keyframes accept 1–10 ordered
  `{imagePath,frameIndex,strength}` entries, distinct indices and strengths 0–1;
  selected model must equal the active model because the direct pipeline uses it.
  Keyframes use `audio` (default false); other native queued operations do not expose
  a `generateAudio` switch. No silent audio stripping is added.

The client uploads files as gateway-owned assets and downloads private output with
that same gateway credential. It never sends the token to external result URLs.
Generation writes a durable receipt before submission; lost responses stay uncertain.
Use `image_status action:refresh`, `video_status action:refresh`, or the corresponding
receipt recovery tool. Do not delete receipts or change request IDs to retry an
ambiguous generation. The gateway token must retain access to those jobs/assets.
LoRA compatibility and perceptual voice/video quality still need actual renders.
