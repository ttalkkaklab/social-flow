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
speech duration. `requiredSeconds`, first/last frames, LoRA, retake, supplied speech
and audio controls are not part of this MSR contract. Audio capabilities are
unverified, so plan separate speech/effects instead of promising synchronized speech.

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
