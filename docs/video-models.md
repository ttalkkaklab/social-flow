# Video model call reference

This page records how social-flow calls each video model, model by model and operation by operation.
For every engine it gives the plugin's adapter input, the request the adapter sends, and the vendor's
own specification. It covers text-to-video, image-to-video, audio-to-video and reference generation,
and it pays particular attention to character consistency: how a face and a voice reach the model and
how many references one request can carry.

The facts were collected on 2026-11-25 from the plugin source at `f4fb5359` plus the adapter changes
listed under [Changes made with this survey](#changes-made-with-this-survey), from vendor pages fetched
that day, and from read-only calls to the services that were reachable. Each engine section has its own
numbered source list; `[n]` refers to that section's list. A value no source confirmed is marked
`unverified`.

The plugin's own schema is authoritative for what a call accepts. `video_catalog {engine, operation}`
returns each adapter's parameters as JSON Schema, read from the adapter's zod schema, and
`video_plan` reports the limits it applied. Where this page and the code disagree, the code wins and
this page is out of date.

## Engines and operations

`engine` is the value saved in `.social-flow/models.json`. "vendor only" means the vendor offers the
operation and the plugin does not expose it; "—" means the vendor does not offer it.

| Engine | Text-to-video | Image-to-video | Audio-to-video | Reference (characters) | Other operations |
| --- | --- | --- | --- | --- | --- |
| [`astra-genai`](#astra-genai-gateway-ltx-25-and-licon-msr) LTX-2.5 and MSR | `astra_genai_text2video` | `astra_genai_img2video` | `astra_genai_audio2video` (dev) | `astra_genai_msr`; `astra_genai_img2video` with `references` | scene (`astra_genai_scene`, one `/v1/generations` request per storyboard scene); retake, extend, HDR, reframe, upscale vendor only |
| [`astra-genai-desktop`](#ltx-desktop) | `astra_genai_desktop_text2video` | `astra_genai_desktop_img2video` | `astra_genai_desktop_audio2video` | vendor only (Ingredients IC-LoRA) | `astra_genai_desktop_keyframes`, `_extend`, `_retake` |
| [`ltx-desktop-local`](#ltx-desktop) | `ltx_desktop_text2video` | `ltx_desktop_img2video` | `ltx_desktop_audio2video` | vendor only (Ingredients IC-LoRA) | — |
| [`ltx-api`](#hosted-ltx-api) | vendor only | `ltx_api_img2video` | `ltx_api_audio2video` | — | retake, extend, HDR, reframe, upscale vendor only |
| [`mlx`](#local-mlx-serve) LTX-2.5 pack | `ltx_video_generate` | `ltx_video_generate` | vendor only | — | — |
| [`mlx`](#local-mlx-serve) FastH3 Omni | — on this pack | vendor only (FL2VA packs) | — | `fasth3_omni_reference` | — |
| [`seedance`](#seedance-byteplus-modelark) | `seedance_text2video` | `seedance_img2video` | — | `seedance_reference` | edit, extend (`seedance_reference`, 2.5); draft vendor only |
| [`minimax`](#minimax-hosted-video-minimax-open-platform) | vendor only | `minimax_img2video` | — | `minimax_reference` | Context-IR, 2K regeneration vendor only |
| [`heygen`](#heygen) | vendor only | `heygen_img2video` | other HeyGen products, vendor only | `heygen_reference` | — |
| [`veo`](#google-cloud-vertex-ai-veo) | `veo_text2video` | `veo_img2video` | — | `veo_reference` | `veo_extend` |
| [`astra`](#legacy-astra-self-hosted-ltx-server) (legacy) | `astra_text2video` | `astra_img2video` | `astra_audio2video` | `astra_ic_lora` (one ingredients sheet) | `astra_keyframe_video`, `astra_ic_lora`, `astra_video_retake` |

`mlx_video_generate` is a deprecated alias of `ltx_video_generate`.

## Character consistency at a glance

How each reference lane carries a character. Counts are per request. "Prompt" means the vendor has no
field that ties a picture or a voice to a person; the prompt text does it.

| Lane | Images | Videos | Audio | Total | Identity binding | Voice binding | Speakers per render (plugin) | Voice sample length | First frame with references | Prompt labels the plugin writes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `astra_genai_msr` | 4 subjects + 1 background | 0 | 2 | 7 | slot order; background always last | `references[i].audio_uri` on subject 1 or 2 | 2 | model uses the first 5 s; gateway takes ≤ 10 s | no frame pins on MSR; allowed on `astra_genai_img2video` (distilled) | `Image N`, `Audio N (Image N): "…"` |
| `seedance_reference` 2.5 | 30 | 10 | 10 | 50 | prompt; portraits by `asset://` | prompt | 10 (plugin reading of clip count) | 2–30 s per clip, 30 s total | no | `@Image N`, `@Video N`, `@Audio N` |
| `seedance_reference` 2.5 Flash | 10 | 5 | 5 | 20 | prompt; portraits by `asset://` | prompt | 5 | 2–30 s per clip, 30 s total | no | `@Image N`, `@Video N`, `@Audio N` |
| `seedance_reference` 2.0 / Fast / Mini | 9 | 3 | 3 | 15 | prompt; portraits by `asset://` | prompt | 3 | 2–15 s per clip, 15 s total | no | `Image N`, `Video N`, `Audio N` |
| `minimax_reference` | 9 | 3 (plugin sends none) | 3 | 12 | prompt | prompt | 3 voices, 2 characters | 2–15 s per clip, 15 s total | no | `reference image N`, `reference audio N` |
| `heygen_reference` | 9 | 3 (plugin sends none) | 3 | 15 or 12 (vendor pages differ); plugin 12 | list order | prompt | 3 | unverified | no | `<Picture N>`, `<Audio N>` |
| `fasth3_omni_reference` | 9 | 3 | 3 | 12 | position in `ref_images` | prompt | 3 | 2–15 s per clip, 15 s per type (plugin) | server accepts both; plugin sends no frames | `<Picture N>`, `<Video N>`, `<Audio N>`; video soundtracks take audio numbers first |
| `veo_reference` | 3 asset images of one subject, or 1 style image | 0 | 0 | 3 | one subject per request | none: the model voices from the prompt | model-generated voice only | — | no | none (prose) |
| `astra_ic_lora` ingredients (legacy) | 1 sheet | — | 0 | 1 | one composite sheet | none | — | — | plugin sends none | none |
| Desktop Ingredients IC-LoRA | 1–10 (vendor only) | — | — | — | reference sheet | none | — | — | — | `Reference sheet: … Generated video: …` |

Lanes with no reference input:
- **Audio-to-video** (`astra_genai_audio2video`, `ltx_api_audio2video`, both Desktop `audio2video`
  tools, `astra_audio2video`) takes one finished soundtrack. The track supplies every voice; a face
  comes only from the start image.
- **Image-to-video** on every engine carries a face only through the pixels of its frames.
- **Veo** and the hosted **LTX API** have no voice-sample input at all.

## Changes made with this survey

The survey found adapter defects. These were fixed in the same change:

- **Hosted LTX API** — data URI limits (7 MB image, 15 MB audio) are now checked on the base64 size, as
  the vendor measures them. A 6 MiB PNG used to pass the plugin and fail at the vendor.
- **Veo** — adapters take `enhancePrompt` and send it when the call sets it. Vertex defaults to `true`
  and may rewrite the prompt; `false` is not the default yet because no live call has confirmed that the
  3.1 models accept it.
- **MLX-Serve LTX** — the decoded RGB cap is 768 MiB, MLX-Serve's own limit (was 800 MiB).
- **Seedance 2.5** — the face-video note uses `@Video N`, matching the rest of a 2.5 prompt.
- **MiniMax** — both adapters take `generateAudio`, sent as `generate_audio`. Planning now sets it on
  `minimax_img2video` shots without lines: `true` keeps scene sound, `false` when the shot's sound is an
  external speech track or its direction reads `silent`.
- **LTX Desktop** — extend and retake now send `promptProvenance:"enhanced"` for a written prompt
  (Desktop rewrites `typed` prompts there too); the local adapter no longer accepts `.ogg`, which
  Desktop's asset ingest refuses; a model whose spec reports `capabilities: null` no longer breaks the
  local catalog.

Each engine section lists the differences that remain open.

## ASTRA GenAI gateway (LTX-2.5 and Licon MSR)

The in-house GenAI gateway runs the open LTX-2.5 22B weights (distilled and dev) and the Licon
MSR IC-LoRA on its own GPUs. Its per-model `/v1/ltx/v2/*` routes copy the names of Lightricks'
hosted API [12]; the plugin calls none of them. Every GenAI video request goes through the
gateway's common generation API: `POST /v1/generations`, `POST /v1/generations/validate`,
`GET /v1/generations/{id}` and `GET /v1/models` (user directive, 2026-11-25). The saved selection for LTX is `{engine:"astra-genai", model:"ltx-2.5-22b-distilled",
operation:"reference", resolution:"1024x576"}` (`576x1024` for 9:16; `1280x736` / `736x1280` as an explicit override)
([model-settings.md](../skills/_shared/model-settings.md)). Status: current. Credentials:
`ASTRA_GENAI_API_KEY`, with the base URL in `ASTRA_GENAI_URL`
([astra-genai-client.ts](../server/src/astra-genai-client.ts)). The Desktop adapters
(`astra_genai_desktop_*`) and the legacy `astra_*` tools are separate families.

### Models

| Model ID | In plugin | Notes |
|---|---|---|
| `ltx-2.5-22b-distilled` | yes | T2V, I2V, I2V with MSR references, scene mode. Render records seen on 2026-11-25 [13]. The 8-step distilled schedule runs with CFG 1 [6]. |
| `ltx-2.5-22b-dev` | yes | T2V, I2V and A2V, run guided. Listed only [13]. |
| `ltx-msr` | yes, no model field (`astra_genai_msr`) | Server-selected MSR deployment. Listed only [13]. |
| `minimax-h3` | no | Gateway scene mode and `/v1/ltx/h3` [12]. Render records seen on 2026-11-25: 2 succeeded, 3 failed [13]. |
| `ltx-2-3-fast/pro`, `ltx-2-5-fast/pro` | no (here) | Hosted-only models; this gateway answers 422 [12]. The hosted LTX API is its own family. |

The render records are one token's job history, about 24 hours long. A finished job says
nothing about output quality. The job status does not show whether an I2V job carried MSR
references.

### Calling it

- **Submit:** `POST /v1/generations {kind:"video", model, mode, input, parameters}` with `mode`
  `text2video`, `image2video`, `audio2video`, `msr` or `scene`. The gateway answers 202 with `{id}`.
  A scene is first sent to `POST /v1/generations/validate`, which reserves nothing.
- **Poll:** `GET /v1/generations/{id}`. Status is `queued|running|succeeded|failed|cancelled`, and
  the file URL is `outputs[0].url` ([astra-genai-video.ts](../server/src/astra-genai-video.ts)).
- **Timing:** the plugin polls for up to 30 min and waits up to 15 min for the submit
  acknowledgement ([astra-genai-client.ts](../server/src/astra-genai-client.ts)). POSTs are never
  retried.
- **Receipt:** a receipt beside the output records the job id. Recovery reads the receipt and never
  resubmits. A scene is posted under an `X-Request-Id` derived from its exact body and output path,
  and the body is kept beside the receipt; within 23 hours `video_status` recovers a lost response by
  posting that body again, which returns the first job [12].
- **Uploads:** local pictures and voices go up first through the chunked `POST /v1/uploads` and
  travel as `genai-file://` ids ([astra-genai-upload.ts](../server/src/astra-genai-upload.ts)). Each
  file may be at most 32 MiB. If the gateway has no upload API, the inline body is capped at 8 MB.
- **Result URL lifetime:** `unverified` for `/v1/generations` outputs.

```json
{"kind": "video", "model": "ltx-2.5-22b-distilled", "mode": "image2video",
 "input": {"text": "…", "images": [{"url": "genai-file://…"}]},
 "parameters": {"width": 1280, "height": 720, "fps": 24, "generate_audio": true, "num_frames": 121}}
```

### Operations

| Operation | Vendor | Plugin tool |
|---|---|---|
| Text-to-video | yes | `astra_genai_text2video` |
| Image-to-video (first, first+last, timed keyframes) | yes | `astra_genai_img2video` |
| Audio-to-video (supplied track) | yes, dev only on this backend | `astra_genai_audio2video` |
| Reference (MSR) | yes | `astra_genai_msr`; `astra_genai_img2video` with `references` |
| Scene (`/v1/generations` `mode:"scene"`) | yes | `video_plan` on a storyboard scene (`astra_genai_scene`) |
| MiniMax H3 (`/v1/ltx/h3`, scene `minimax-h3`) | yes | not exposed |
| Retake, extend, HDR, reframe, upscale | yes | not exposed |

#### Text-to-video

- **Plugin input** ([astra-genai-video.ts](../server/src/astra-genai-video.ts)):
  - `prompt`: 1–2000 characters.
  - `model`: distilled or dev.
  - `resolution`: `WxH` with even sides of at least 64. The sides, rounded up to multiples of 64,
    must each be at most 1920 and multiply to at most 2,064,384.
  - Length: `duration` (integer ≥1, or `null` for automatic length) or `numFrames` (25–361,
    `8k+1`).
  - `fps`: 24, 25, 48 or 50 (default 24). `generateAudio`: default `true`.
  - `seed`, `numGeneratedKeyframes` (0–16).
  - `lora`: 1–2 names, plain distilled only. The live catalog lists `cinemagraph` and
    `slow-motion` [13].
  - Dev only: `negativePrompt` (≤2000), `numInferenceSteps` (1–50) and `guidance`.
- **Wire request:**
  `POST /v1/generations {kind:"video", model, mode:"text2video", input:{text}, parameters:{width, height, fps, generate_audio, duration_seconds|num_frames, seed?, lora?, num_generated_keyframes?, guidance?, num_inference_steps?, negative_prompt?}}`.
  Optional fields are first checked against `/v1/models` `parameters_by_mode`. The plugin's
  bodies for every direct mode pass the gateway's own `VideoGeneration` model and adapter
  (`docs/loops/038-genai-common-api/gateway-validate.md`).
- **Limits:**
  - Frames: 25–361, `8k+1`. The gateway rounds a duration up to `8k+1` and trims back [12]. The
    `8k+1` rule comes from the model [5].
  - Prompt: 2000 characters on the local backend; the gateway schema allows 5000 [12].
  - Audio: `generate_audio` switches the soundtrack on or off.
- **Plugin vs vendor:**
  - The hosted API takes only presets: 6–20 s, 720p to 4K, and a `camera_motion` enum [7][8].
    The gateway takes any even `WxH` and refuses `camera_motion` [12].
  - The gateway still accepts `shots` (2–4). The plugin no longer sends it.

#### Image-to-video

- **Plugin input:** everything in Text-to-video, plus:
  - Start image: exactly one of `imageUri` or `imagePath`. PNG or JPEG, at most 32 MiB and
    4096 px per side.
  - End image: optional `lastFrameUri` or `lastFramePath`.
  - `keyframes[]`: `{frameIdx 0–360, strength 0–1, crf 0–51}`. Start, end and keyframes share
    **8** slots, and every index must be distinct and inside the clip.
  - An end image or keyframes need `duration` or `numFrames`.
  - Without references the prompt is capped at 2000
    ([astra-genai-video.ts](../server/src/astra-genai-video.ts)).
- **Wire request:**
  `POST /v1/generations {…, mode:"image2video", input:{text, images:[{url}], last_frame?:{url}, keyframes?:[{url, frame_idx, strength?}], references?}}`.
- **Limits:** frames and resolution as in Text-to-video. The live `/v1/models` I2V limits are
  `first_frame:1`, `last_frame:1` and `temporal_images_including_endpoints:8` [13]. An end image
  cannot be combined with automatic length [12].
- **Plugin vs vendor:**
  - Hosted I2V takes only a first and a last frame [9].
  - The open pipelines take `--image PATH FRAME_IDX STRENGTH` repeatedly, with no count limit
    found in the code [5]. The gateway and the plugin cap the pins at 8.

#### Audio-to-video

- **Plugin input** ([astra-genai-video.ts](../server/src/astra-genai-video.ts)):
  - Audio: exactly one of `audioPath` or `audioUri`. Formats `.wav .mp3 .m4a .ogg .opus`. A data
    URI may hold at most 15,000,000 base64 characters.
  - `prompt`: 1–2000 characters.
  - Optional start image, plus an end image that needs the start image. Keyframes share 8 slots
    with the endpoints.
  - `fps`: 24, 25, 48 or 50.
  - Dev only: `negativePrompt`, `guidance` and `numInferenceSteps`.
  - There is no duration field; the audio sets the length.
- **Wire request:**
  `POST /v1/generations {…, mode:"audio2video", input:{text, audio:{url}, images?:[{url}], last_frame?, keyframes?}, parameters:{width, height, fps, seed?, guidance?, negative_prompt?}}`.
- **Limits** [12]:
  - Frames: the shortest `8k+1` count (at least 25) that covers the audio, up to 361. That is
    15.04 s at 24 fps.
  - Channels: mono or stereo; three or more answer 422.
  - Sample rate: an AAC standard rate between 7350 and 96000 Hz, otherwise 422.
  - Output: the engine muxes the input once as AAC, and the trim copies that stream.
- **Voice:** supplied full track only.
- **Plugin vs vendor:**
  - The local backend runs **dev only**. The plugin enum also lists distilled, which the live
    catalog does not offer, so the plugin refuses it before submission [12][13].
  - Hosted A2V needs at least 2 s of audio. Its maximum is 10 or 20 s by model and resolution
    [10].

#### Reference

- **Plugin input** (`astra_genai_msr`,
  [astra-genai-video.ts](../server/src/astra-genai-video.ts);
  [msr-opening.ts](../server/src/msr-opening.ts)):
  - `references[]`: 1–5 entries `{imageUri|imagePath, background, nonCharacter?, audioUri|audioPath?}`.
  - `openingPositions[]`: required, `{character, images:[subject numbers], position}`.
  - `referenceStrength`: 0–1, default 1. `referenceFrames`: 25 or 33, default 33.
  - `width` and `height`: multiples of 64 from 64 to 1920, at most 2,064,384 px in all. Default
    1536×1024.
  - Length: `numFrames` (25–361, `8k+1`, default 121) or `duration`, which rounds to the nearest
    `8k+1`.
  - `frameRate`: 1–60, default 24. `seed`: default 42.
  - `skipStage2`: renders at half size.
  - `negativePrompt` needs `guidanceScale` above 1 or `nagScale` above 0.
  - `astra_genai_img2video` with `references` follows the same rules and adds the start and end
    images and keyframes. That form is distilled only and needs an explicit length.
- **Wire request:**
  `POST /v1/generations {kind:"video", model:"ltx-msr", mode:"msr", input:{text, images:[{url, background, audio?:{url}}]}, parameters:{width, height, fps, seed, num_frames, reference_strength, reference_frames, skip_stage_2?, negative_prompt?, guidance_scale?, nag_*?}}`.
  The plugin prefixes the prompt with `Opening frame, from the viewer’s perspective:` followed by
  one line per character, `<character> (Image 1, Image 2): <position>`. That header counts toward
  the prompt limit.
- **Checks before submission:** optional fields and the prompt cap are read from the model's
  `GET /v1/models` row; the gateway refuses at submission what its backend does not take.
- **References per request:**
  - Images: 4 subjects plus 1 background, 5 in all [1][3][12][13].
  - Videos: none.
  - Audio: up to 2 voice samples, so 7 files in all.
  - Size: each picture at most 32 MiB and 4096 px per side
    ([astra-genai-client.ts](../server/src/astra-genai-client.ts) 112-128).
  - Strength: the live gateway pins `reference_strength` at exactly 1.0, and lower values answer
    400 for GPU memory [13].
- **Identity:** slot order is the order of the non-background `references[]` entries. The
  gateway always moves the background to the last slot [12]. The prompt names pictures `Image N`,
  and the background takes the next number.
- **Voice:**
  - Binding: `references[i].audio_uri` on subject 1 or 2 pairs with that picture [1][12]. A
    sample on the background or on subject 3 or later is refused.
  - Speakers: 2 per render [3]. Lightricks calls two speaking subjects "the practical sweet spot"
    and suggests covering a third with cuts [4]. A third speaker can still talk without a sample,
    voiced from the prompt.
  - Length: the V2 weights condition on the first 5 s (`reference_audio_slot_duration_seconds
    = 5.0`, read from the weights' header). The tail is cut and a short clip is not padded
    [2][3]. The gateway accepts up to 10 s [12].
  - Plugin checks: refuses a sample over 10 s and warns over 5 s
    ([video-voice.ts](../server/src/video-voice.ts)); the scene path refuses one over 10 s before
    anything is reserved ([genai-scene.ts](../server/src/genai-scene.ts) `checkSceneVoices`).
  - Audio output: MSR always renders speech and effects natively. On I2V with references,
    `generateAudio:false` mutes the output after the render [12].
- **First frame with references:**
  - Allowed only through `astra_genai_img2video` with distilled. The gateway checks
    `image_conditioning`, which is true today [13].
  - `astra_genai_msr` takes no frame pins.
  - No upstream source combines frame pins with MSR, and the gateway README leaves the quality
    to a GPU check after deployment [12].
- **Prompt labels:**
  - Reference line: `Audio N: <name>'s voice, belongs only to Image N.`
  - On-screen turn: `Turn K: Image N (<name>) speaks using Audio N. … Audio N (Image N): "<line>"`.
  - Scene-direction boards: `<id> (Image N, Audio N): "<line>"`
    ([video-voice.ts](../server/src/video-voice.ts)).
  - The model card advises labels such as `Image 1` and `Image 2` and matching each audio to its
    subject [3].
- **Plugin vs vendor:**
  - Licon's Guide still accepts a hidden `audio_ref3` [1]. The card, the gateway and the plugin
    all use 2 voices.
  - Prompt limit: the schemas advertise 5000. The deployed MSR backend reports 2000 [13]; the
    gateway refuses a longer prompt at submission.
  - `referenceStrength` is advertised as 0–1 but live is fixed at 1.0. The plugin refuses other
    values before submission.
  - Known model issue: environmental sound needs background music in the voice sample [3].

#### Scene

- **Plugin input:** a storyboard scene planned with `video_plan {episode, sceneNo, requestId}` on a
  distilled selection; the plan's tool is `astra_genai_scene`
  ([genai-scene.ts](../server/src/genai-scene.ts), [video-routing.ts](../server/src/video-routing.ts)).
  The planner composes the scene as one LTX MSR render and names each input after the cast member
  and picture it shows (`{hero.face}`, `{hero.voice}`, `{opening.image}`).
- **Wire request:**

  ```
  POST /v1/generations/validate      (free; no job)
  POST /v1/generations               (X-Request-Id: scene-<sha256 of body and output path>)

  {kind:"video", model, mode:"scene",
   input:{prompt, cast:[{id, images:[{role, uri}], voice?:{uri}}], references:[{id, role, uri}],
          shots:[{id, seconds, image?:{uri, strength?}}]},
   parameters:{width, height, fps, seed?}}
  ```

  The gateway numbers the names (voiced cast first, then cast order, objects, background last) and
  adds no sentence. Planning refuses a compilation whose numbering, frame count or cut frames differ
  from the plan and shows it as `sceneValidation`; execution validates once more.
- **Limits** [12][13]:
  - Shots 1–8; frames rendered on the next `8k+1` count from 25 to 361 and cut back to the
    storyboard's frames. Nothing is trimmed by the gateway.
  - At most 4 subject pictures and 1 background across the scene; 2 voices of up to 10 s.
  - Prompt: 2000 characters after the names are numbered on `ltx-2.5-22b-distilled`.
  - The opening picture is reproduced; a later shot's picture only guides, and the model paces
    the cuts.
- **How the plugin fits a board to it** (user's choices, 2026-11-25):
  - The people the scene's shots reference become one cast with the sheet panel rule for that
    many (one: face, front, back; two: each face, then each front; three or four: one face each).
    More than four is refused (`scene_cast_exceeded`).
  - An ending or timed picture inside a shot, and a panel the cast leaves out, are not sent; the
    plan names them (`scene_picture_omitted`, `scene_reference_omitted`).
  - A prompt over the cap is composed again with fewer optional words, step by step; the plan
    names what went (`scene_prompt_fitted`) and one still over is refused before upload
    (`scene_prompt_too_long`).
  - A scene on `ltx-2.5-22b-dev`, one driven by a supplied soundtrack and a line pinned to a frame
    are refused at planning.

#### Gateway offers, plugin does not expose

- **H3 scene profile** of `/v1/generations` `mode:"scene"` [12]: `<Picture N>` / `<Audio N>`, an
  8000-character prompt, 24 fps, frames `17k+5` from 124 to 345, 3 voices of up to 15 s at 32 kHz (the plugin binds 2 per scene),
  and 9 images.
- **`minimax-h3`, `POST /v1/ltx/h3`** [12]:
  - Tasks: `t2va`, `fl2va` and `ref2va`.
  - `ref2va` references: up to 9 images, 3 videos and 3 audio, 12 in all, and never audio
    alone.
  - Frames: rounded up to `17n+5` from 124 to 345.
  - Size: sides of 256–2048 in multiples of 32, at most 1,032,192 px.
  - Steps: 8–50.
- **Retake and extend** [12]:
  - Both run distilled only.
  - Retake takes `replace_audio_and_video` only.
  - Extend appends to the end only, 2–20 s.
- **Other routes:** `video-to-video-hdr`, `video-to-video-reframe` and `/v1/ltx/upscale`
  (1080p or 1440p) [12].

### Gaps and differences

- Vendor offers, plugin does not expose:
  - `minimax-h3` (both routes)
  - retake, extend, HDR, reframe and upscale on this gateway
- Mismatches still open:
  - The MSR prompt cap reads 5000 in the plugin schemas and in the live `/v1/models` `ltx-msr`
    row, but 2000 on the deployed backend [13]. On the direct tools the gateway refuses a longer
    prompt at submission; the scene path fits or refuses it at planning.
  - `ltx-2.5-22b-distilled` is in the `astra_genai_audio2video` enum, but production serves A2V
    on dev only.
  - `referenceStrength` is advertised as 0–1; the live value is fixed at 1.0.
  - Combined start/end pins plus MSR references have no upstream example. The gateway's own scene
    profile notes that later shot images were not reproduced in production runs [12].
- Unverified:
  - The result URL lifetime of `/v1/generations` outputs.
  - Any render on the common API: the plugin's scene bodies pass the production `/validate`, but no
    job was submitted on the new path as of 2026-11-25.
  - Whether any completed I2V job used MSR references.
  - Renders on dev, MSR and A2V: none in the job window.
  - The MSR paper's training-share figures.
  - Hosted input formats and sizes (`/input-formats` not fetched).

### Sources

1. [liconstudio/ComfyUI-LTX2.5-MSR `nodes.py` @03061c18](https://github.com/liconstudio/ComfyUI-LTX2.5-MSR/blob/03061c18f8a79d26f3c63931dd8e28f5e5d872a6/nodes.py) — fetched 2026-11-25
2. [ComfyUI-LTX2.5-MSR `README-AVref.md`](https://github.com/liconstudio/ComfyUI-LTX2.5-MSR/blob/03061c18f8a79d26f3c63931dd8e28f5e5d872a6/README-AVref.md) — fetched 2026-11-25
3. [LiconStudio/LTX-2.5-Multiple-Subject-Reference model card and V2 weights metadata](https://huggingface.co/LiconStudio/LTX-2.5-Multiple-Subject-Reference) — fetched 2026-11-25
4. [Lightricks/LTX-2 issue 320, three-subject MSR](https://github.com/Lightricks/LTX-2/issues/320) — fetched 2026-11-25
5. [Lightricks/LTX-2 `ltx_pipelines/utils/args.py` @c3a7efb1](https://github.com/Lightricks/LTX-2/blob/c3a7efb18256cba2d76cc32f5b47811d7c9ad642/packages/ltx-pipelines/src/ltx_pipelines/utils/args.py) — fetched 2026-11-25
6. [Lightricks/LTX-2.5 model card](https://huggingface.co/Lightricks/LTX-2.5) (gated; read as a summary) — fetched 2026-11-25
7. [LTX-2.5 support matrix](https://docs.ltx.io/models/ltx-2-5) — fetched 2026-11-25
8. [Hosted API: text to video](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-text-to-video) — fetched 2026-11-25
9. [Hosted API: image to video](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-image-to-video) — fetched 2026-11-25
10. [Hosted API: audio to video](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-audio-to-video) — fetched 2026-11-25
11. [LTX prompting guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide) — fetched 2026-11-25
12. genai-gateway source, private repository `ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway` @d3edd756. Files read: `gateway/schemas/video.py`, `gateway/schemas/scene.py`, `gateway/adapters/video_local.py`, `gateway/ltx.py`, `gateway/generation_scene.py`, `gateway/generations.py`, `integrations/ltx_production/README.md` — read 2026-11-25
13. Live read-only GETs on the gateway at `ASTRA_GENAI_URL`: `/v1/models`, `/v1/ltx/msr/capabilities`, `/v1/ltx/v2/capabilities`, `/v1/ltx/v2/scene-to-video/capabilities`, `/v1/jobs?limit=100` — 2026-11-25

Code: [`astra-genai-video.ts`](../server/src/astra-genai-video.ts),
[`astra-genai-client.ts`](../server/src/astra-genai-client.ts),
[`astra-genai-upload.ts`](../server/src/astra-genai-upload.ts),
[`genai-scene.ts`](../server/src/genai-scene.ts), [`msr-opening.ts`](../server/src/msr-opening.ts),
[`video-voice.ts`](../server/src/video-voice.ts),
[`video-registry.ts`](../server/src/video-registry.ts)

## LTX Desktop

LTX Desktop is Lightricks' open-source desktop app, and it runs LTX models on the machine it is installed on [1]. The plugin reaches it in two ways:

- **Gateway Desktop** (`{engine:"astra-genai-desktop"}`, deployment `gateway-desktop-v1`): an ASTRA GenAI gateway forwards jobs to a Desktop app on the gateway's own host [17][18].
  - Credentials: `ASTRA_GENAI_DESKTOP_URL` and `ASTRA_GENAI_DESKTOP_API_KEY`. Without them it falls back to `ASTRA_GENAI_URL` and `ASTRA_GENAI_API_KEY` ([astra-genai-client.ts](../server/src/astra-genai-client.ts)).
- **Local app** (`{engine:"ltx-desktop-local"}`, deployment `native-desktop-loopback`): the plugin calls the Desktop backend on the MCP host.
  - Address: `LTX_DESKTOP_BASE_URL`, default `http://127.0.0.1:41954`, loopback only [13].
  - Credential: the backend bearer `LTX_DESKTOP_API_KEY` [14] ([ltx-desktop-local.ts](../server/src/ltx-desktop-local.ts)).

Status: current, local. On 2026-11-25 the configured production gateway answered `/v1/ltx/desktop/models` with HTTP 503 "Desktop is not configured", and no local app was running on the survey machine. Every per-device cell below is therefore `unverified`.

### Models

| Model ID | In plugin | Notes |
|---|---|---|
| `ltx-2.5-fast` | yes | Local offering, checkpoint `ltx-2.5-22b-distilled`. Default model in the app UI [8][3] |
| `ltx-2.3-fast` | yes | Local offering, checkpoint `ltx-2.3-22b-distilled-1.1`, else `ltx-2.3-22b-distilled` [8] |
| `fast`, `pro`, `fast-2.5`, `pro-2.5` | gateway keyframes only (`fast`) | Pipeline ids on the legacy `/api/generate` route. The gateway forces `fast` [20][17] |

- Both offerings run the local pipeline `fast` [8].
- The gateway route takes only the two offering ids ([astra-genai-desktop.ts](../server/src/astra-genai-desktop.ts); [19]).
- The local route takes any `ltx-*` id listed in the live `downloaded_local_models` ([ltx-desktop-local.ts](../server/src/ltx-desktop-local.ts)).

### Calling it

**Gateway** ([astra-genai-desktop.ts](../server/src/astra-genai-desktop.ts)):
1. Each input file goes to `POST /v1/ltx/desktop/assets` as multipart `file`, which returns `{id}`.
   - The asset is owned by the token and expires 24 h after creation [22].
   - Accepted inputs: `.png .jpg .jpeg .webp .wav .mp3 .m4a .mp4 .mov .webm`, at most 100 MiB each and at most 50 MiB for images [18].
2. The plugin writes a receipt `<video>.astra-genai.json`, then calls `POST /v1/ltx/desktop/generations/{feature}`. The answer is `202` with a job `id` [17].
3. It polls `GET /v1/ltx/desktop/generations/{id}` every 5 s for up to 30 min ([astra-genai-client.ts](../server/src/astra-genai-client.ts)).
   - `status` is `queued | running | cancelling | succeeded | failed | cancelled`.
   - The job also carries `outputs[]`, `resolved_params` and `error` [18].
4. It downloads the one `media_kind:"video"` output from its `url` (`/v1/ltx/desktop/assets/{id}/bytes`) with the same token. The lifetime is the asset's 24 h [18][22].
5. Recovery uses `astra_genai_desktop_status` with the receipt. The plugin never resubmits.

**Local** ([ltx-desktop-local.ts](../server/src/ltx-desktop-local.ts), [vendor-video.ts](../server/src/vendor-video.ts)):
1. It reads `GET /api/generate/models-specs` to check the cell. A model whose `spec.capabilities` is `null` (allowed by [1]) reads as unavailable.
2. It registers each file by path with `POST /api/assets {path}` [1].
3. It submits `POST /api/generations/{feature}` and reads `id` [2].
4. It polls `GET /api/generations/{id}` every 2.5 s, up to 1440 polls (60 min). The `error_code` values are listed in [1].
5. It downloads `GET /api/assets/{id}/bytes` and checks for an MP4 `ftyp` box.

Desktop ingest accepts images `.png .jpg .jpeg .webp` up to 50 MiB and 50 MP, and audio `.wav .mp3 .m4a` up to 100 MiB [7]. The local adapter checks the same extensions before calling the app, so `.ogg` is refused.

Common envelope, both routes [1][20]:

```json
{"params": {"model": "ltx-2.5-fast", "prompt": "…", "resolution": "540p", "fps": 24,
            "duration": 5, "aspectRatio": "16:9", "promptProvenance": "enhanced"},
 "contract_version": 1,
 "inputs": {"startFrame": {"assetId": "…"}}}
```

The gateway validates against a contract pinned to the Desktop OpenAPI of 2026-10-25, with `additionalProperties:false` [20]. Fields added upstream after that date cannot pass the gateway.

### Operations

| Operation | Vendor | Plugin tool |
|---|---|---|
| Text-to-video | yes | `astra_genai_desktop_text2video`, `ltx_desktop_text2video` |
| Image-to-video | yes | `astra_genai_desktop_img2video`, `ltx_desktop_img2video` |
| Audio-to-video (supplied track) | yes | `astra_genai_desktop_audio2video`, `ltx_desktop_audio2video` |
| Reference (character consistency) | yes (Ingredients IC-LoRA) | not exposed |
| Keyframes | yes | `astra_genai_desktop_keyframes` (gateway only) |
| Extend | yes | `astra_genai_desktop_extend` (gateway only) |
| Retake | yes | `astra_genai_desktop_retake` (gateway only) |
| LoRA recipes, IC-LoRA video control, motion track | yes | not exposed |

Rules shared by all operations:
- **Duration:** an integer in {2,3,4,5,6,8,10,12,14,16,18,20} s. This covers t2v, i2v and keyframes [1][20].
- **fps:** 24, 25, 48 or 50.
- **Resolution tiers:** 270p, 360p, 540p, 720p, 1080p, 1440p or 2160p. 1440p and 2160p are provisional and run in windows [16].
- **Aspect ratios:** 21:9, 16:9, 3:2, 4:3, 1:1, 4:5 or 9:16. The models were trained on 16:9 and 9:16 [3].
- **Device check:** the live device matrix decides which cells run. The plugin and the gateway both check it before submitting ([scene-video.ts](../server/src/scene-video.ts); [19]).
- **Frame grid:** 8k+1.
- **Prompts:** no schema sets a prompt character limit [1][20], and the plugin sets none. No prompt label syntax exists.
- **Prompt rewriting:** `promptProvenance` is `typed` (the default: the app may rewrite the prompt) or `enhanced` (no rewrite) [4]. The plugin sends `enhanced` for every written prompt on both routes unless the call names `typed` ([astra-genai-desktop.ts](../server/src/astra-genai-desktop.ts)).

#### Text-to-video

- **Plugin input:**
  - `model`
  - `prompt` (min 1)
  - `resolution` (required)
  - `duration` (gateway, required) or `durationSeconds` (local, default 2)
  - `fps` (default 24)
  - `aspectRatio` (default 16:9)
  - `seed` (≥0)
  - gateway only: `cameraMotion` (9 values), `loras: [{ref, scale 0–4, default 1}]`, `promptProvenance`, `reserveUsd`
- **Wire request:** `POST /v1/ltx/desktop/generations/text-to-video` (gateway) or `POST /api/generations/text-to-video` (local), with `{"params":{model,prompt,resolution,fps,duration,aspectRatio,promptProvenance:"enhanced",loras?,cameraMotion?,seed?},"contract_version":1}`.
- **Limits:**
  - The shared duration, fps and tier sets apply. Vendor defaults are 5 s, 1080p and 16:9 [20].
  - The soundtrack is always generated, with no switch. A 2026-10-25 270p T2V with no `audio` field came back as 512×288 with AAC [3][23].
- **Plugin vs vendor:**
  - The local tool does not expose `cameraMotion` or `loras`.
  - Upstream now also accepts `negativePrompt`, NAG and `passShape` here [1]. The gateway's pinned contract lacks them, and it refuses `negativePrompt` outside A2V [19].

#### Image-to-video

- **Plugin input:** the text-to-video fields without `loras`, plus:
  - `imagePath` (start frame, required)
  - `lastFramePath` (optional)
  - `aspectRatio`, default `auto` (follows the start frame)
- **Wire request:** `POST …/generations/image-to-video` with `"inputs":{"startFrame":{"assetId":"…"},"endFrame":{"assetId":"…"}}`.
- **Limits:**
  - 1 start and 1 end image; total 2 [19].
  - An end frame needs an explicit duration [18].
  - The prompt may be empty upstream [20].
- **Plugin vs vendor:** no difference in inputs. I2V takes no LoRA on either side [20].

#### Audio-to-video

- **Plugin input (gateway):**
  - `audioPath` (required)
  - `imagePath` (optional start frame)
  - `prompt` (default `""`). A prompt or a start frame is required.
  - `resolution` (default 540p) and `aspectRatio` (default 16:9, `auto` allowed)
  - `negativePrompt` (≤2000), `nagScale` 0–100, `nagAlpha` 0–1, `nagTau` 0–10
  - `passShape` (`auto | one_pass | parts`)
  - `audioStartTime`
  - `audioMaxDuration` or `numFrames` (8k+1, ≥9), not both
  - `allowAudioTruncation` (default false)
- **Plugin input (local):** `audioPath`, `imagePath?`, `prompt` (min 1), `resolution`, `fps`, `seed` and `aspectRatio` (no `auto`). The full track only.
- **Wire request:** `POST …/generations/audio-to-video` with `"inputs":{"audio":{"assetId"},"startFrame"?:{"assetId"}}`.
  - The gateway route adds a top-level `"allowAudioTruncation":false`, a gateway-only field [17].
  - The plugin cuts the window locally into a WAV before upload. It never sends `audioStartTime`, `audioMaxDuration` or `numFrames`.
- **Limits:**
  - The output length follows the audio, at least 2 s [19].
  - Audio over the cell's longest duration is refused. The UI doc says up to 20 s, and 10 s at 1080p [3].
  - Frames are `8·max(1, floor((ms·fps−1000)/8000))+1`. A track that would lose audio to that floor is refused unless truncation is allowed [19] ([astra-genai-desktop.ts](../server/src/astra-genai-desktop.ts)). The local route never allows it.
  - The original waveform becomes the soundtrack [12].
- **References per request:** 1 audio, 1 image, 0 video. Audio is at most 100 MiB [7].
- **Identity:** the start frame only. There is no character reference.
- **Voice:** a supplied full track only, with no voice-sample input. Any number of voices can be on the track, and none is bound to a face [1].
- **First frame with references:** n/a, because there are no reference images.
- **Prompt labels:** none.
- **Plugin vs vendor:**
  - The local tool requires a prompt and has no `auto` aspect. The vendor allows a blank prompt with a start frame, and `auto` [11].
  - The UI doc says A2V runs at 24 fps [3]. The contract accepts 24/25/48/50 [20].

#### Reference

The vendor offers this; the plugin does not expose it.
- Desktop's "Ingredients" IC-LoRA takes 1–10 images and stitches them in order into one reference sheet. The aim is to keep the characters, props and places on the sheet consistent [9][10].
- The route is `POST /api/generations/ic-lora-recipes/ingredients` [2].
- The gateway routes it and enforces the live 1–10 limit [18][19]. Its v2 compatibility layer refuses MSR requests with "use desktop IC-LoRA ingredients instead" [21].

Vendor bullets:
- **References per request:** 1–10 images (`inputs.images[].assetId`), 0 video, 0 audio [1]. Images are at most 50 MiB [7].
- **Identity:** one panel per character, prop or place on the sheet, in input order [10]. The model "won't invent identities that aren't on the reference sheet" [9].
- **Voice:** no voice-sample input. `audioMode` is `source`, `generated` or `off`; the catalog default is `generated` [1][9].
- **First frame with references:** not available. The request takes `images` only [1].
- **Prompt labels:** the vendor asks for `Reference sheet: {panels}. Generated video: {action}.` [9].
- **Other params:** `duration` and `aspectRatio` are required. `resolution` defaults to 720p and `scale` runs 0–2 [20]. The catalog lists durations 5, 6, 8, 10 and 20 s [9].
- The weights need a Hugging Face login [9].

#### Keyframes

- **Plugin input (gateway only):**
  - the text-to-video fields, `loras` included
  - `audio` (boolean, default false)
  - `keyframes`: 1–10 items of `{imagePath, frameIndex ≥0, strength 0–1 default 1}`, with unique indices below `floor(duration·fps/8)·8+1`
- **Wire request:** `POST /v1/ltx/desktop/keyframes` with `{"params":{"model":"fast",…,"audio":false,"promptProvenance":"enhanced"},"keyframes":[{"assetId","frameIndex","strength"}]}`. There is no `contract_version`.
  - The gateway runs it synchronously on the legacy `/api/generate`, using the active offering [17].
  - The plugin first checks that `model` equals the catalog's `active_model`, then waits up to 30 min for the answer.
- **Limits:** up to 10 images; the per-model cap is `multi_keyframe_max_count` [1][24]. The gateway refuses the call when Desktop is forced to the LTX API [17].
- **Plugin vs vendor:**
  - Upstream now has a queued `POST /api/generations/keyframes` with `KeyframesParams`, which allows `aspectRatio:auto` and has no `audio` field [2][25]. The pinned gateway does not use it.
  - Whether `audio:false` silences a local render is unverified. Upstream reads `req.audio` only on its forced-API path [15].

#### Extend

- **Plugin input (gateway only):**
  - `sourceVideoPath`
  - `duration` 2–20
  - `mode` (`start | end`, default `end`)
  - `targetResolution {width,height}` (a cap; it never upscales)
  - `prompt` (default `""`), `seed`
- **Wire request:** `POST /v1/ltx/desktop/generations/extend` with `{"params":{model,prompt,duration,mode,resolution?:{width,height},seed?,promptProvenance?:"enhanced"},"contract_version":1,"inputs":{"video":{"assetId"}}}`.
  - Before reserving, the gateway runs Desktop's edit preflight and refuses cells over the source or device limits [18].
- **Limits:** the contract allows 2–20 s [20]. The UI offers 4, 6, 8, 10 and 12 s [3].
- **Plugin vs vendor:**
  - A blank prompt is sent as `typed`, and the app may then write one from the source video [5][6].
  - Upstream `contextMode` and NAG are not in the gateway contract [1][20].

#### Retake

- **Plugin input (gateway only):** as for extend, plus:
  - `startTime` ≥0 (required)
  - `duration` 2–10
  - `mode`: `replace_audio_and_video` (default), `replace_video` or `replace_audio`
- **Wire request:** `POST /v1/ltx/desktop/generations/retake` with `{"params":{…,startTime,duration,mode},"contract_version":1,"inputs":{"video":{"assetId"}}}`.
- **Plugin vs vendor:** a written prompt goes as `enhanced` and is not rewritten [6]. Upstream's user doc says retake and extend never rewrite, but upstream code does rewrite `typed` prompts [3][5].

### Gaps and differences

- **Vendor offers, plugin does not expose:**
  - Ingredients multi-image reference.
  - Catalog LoRA recipes (`recipes/{id}`, such as Transition).
  - IC-LoRA video control (Layout to Render, Restore and others).
  - Motion track.
  - Custom LoRA generation.
  - Keyframes, extend and retake on the local route.
  - `cameraMotion` and LoRAs on the local route.
  - The queued `/api/generations/keyframes`.
- **Mismatches still open:**
  - The gateway contract dates from 2026-10-25. It refuses upstream's newer `negativePrompt`, NAG and `passShape` outside A2V, and `contextMode` on extend/retake [1][19][20].
  - The gateway adapter sends any file extension and images up to 100 MiB, but the gateway refuses other extensions and images over 50 MiB [18].
  - Local A2V requires a prompt and lacks `aspectRatio:auto`.
  - The schema dump in `video_catalog` drops refinements: the duration set, the 8k+1 `numFrames` rule and the keyframe index bound.
  - The dump also shows a negative minimum for the local `seed`, while the adapter refuses negatives.
- **Unverified:**
  - Every device cell (resolution × fps × duration × aspect), because no Desktop was reachable on 2026-11-25.
  - The exact pixel size per tier, beyond one 270p 16:9 sample of 512×288 [23].
  - The effect of keyframes `audio:false`.
  - Which Desktop version a gateway host runs.
  - Any prompt token limit.

### Sources

1. [LTX Desktop backend OpenAPI](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/frontend/generated/backend-openapi.json) — fetched 2026-11-25
2. [LTX Desktop `_routes/generations.py`](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/backend/_routes/generations.py) — fetched 2026-11-25
3. [LTX Desktop tools and options](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/docs/tools-and-options.md) — fetched 2026-11-25
4. [`prompt_enhancement_handler.py`](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/backend/handlers/prompt_enhancement_handler.py) — fetched 2026-11-25
5. [`edit_executor.py`](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/backend/services/features/video/edit_executor.py) — fetched 2026-11-25
6. [`test_edit_executor_prompt_enhancement.py`](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/backend/tests/test_edit_executor_prompt_enhancement.py) — fetched 2026-11-25
7. [`media_probe.py`](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/backend/services/media_probe.py) — fetched 2026-11-25
8. [`offerings.py`](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/backend/runtime_config/offerings.py) — fetched 2026-11-25
9. [`lora_catalog.json` (`ingredients`)](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/backend/runtime_config/lora_catalog.json) — fetched 2026-11-25
10. [`reference_sheet.py`](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/backend/services/features/video/reference_sheet.py) and [`ic_lora_sheet_recipe.py`](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/backend/services/features/video/ic_lora_sheet_recipe.py) — fetched 2026-11-25
11. [`audio_to_video.py`](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/backend/services/features/video/audio_to_video.py) — fetched 2026-11-25
12. [`distilled_a2v_pipeline.py`](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/backend/inference/a2v_pipeline/distilled_a2v_pipeline.py) — fetched 2026-11-25
13. [`port_constant.py`](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/backend/runtime_config/port_constant.py) — fetched 2026-11-25
14. [`app_factory.py`](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/backend/app_factory.py) — fetched 2026-11-25
15. [`video_generation_handler.py`](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/backend/handlers/video_generation_handler.py) — fetched 2026-11-25
16. [Local compatibility matrix](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/docs/local-compat-matrix.md) — fetched 2026-11-25
17. [genai-gateway `desktop_routes.py`](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/d3edd756b29d82e14cfde189a790c8ec76875d02/gateway/desktop_routes.py) — fetched 2026-11-25
18. [genai-gateway `desktop.py`](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/d3edd756b29d82e14cfde189a790c8ec76875d02/gateway/desktop.py) — fetched 2026-11-25
19. [genai-gateway `models/video.py`](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/d3edd756b29d82e14cfde189a790c8ec76875d02/gateway/models/video.py) — fetched 2026-11-25
20. [genai-gateway pinned Desktop contract](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/d3edd756b29d82e14cfde189a790c8ec76875d02/gateway/contracts/ltx-desktop.json) — fetched 2026-11-25
21. [genai-gateway `desktop_compat.py`](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/d3edd756b29d82e14cfde189a790c8ec76875d02/gateway/desktop_compat.py) — fetched 2026-11-25
22. [genai-gateway migration `006_desktop_assets.sql`](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/d3edd756b29d82e14cfde189a790c8ec76875d02/gateway/migrations/006_desktop_assets.sql) — fetched 2026-11-25
23. [genai-gateway live T2V evidence](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/tree/d3edd756b29d82e14cfde189a790c8ec76875d02/docs/loops/002-ltx-desktop/evidence) — fetched 2026-11-25
24. [`api_model_specs.py`](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/backend/api_model_specs.py) — fetched 2026-11-25
25. [`keyframes.py`](https://github.com/Lightricks/LTX-Desktop/blob/2ab055b98f7590581c56f9e0b2ff55ac56d459b7/backend/services/features/video/keyframes.py) — fetched 2026-11-25

Code: [`astra-genai-desktop.ts`](../server/src/astra-genai-desktop.ts), [`ltx-desktop-local.ts`](../server/src/ltx-desktop-local.ts), [`hosted-video-routes.ts`](../server/src/hosted-video-routes.ts), [`vendor-video.ts`](../server/src/vendor-video.ts), [`astra-genai-client.ts`](../server/src/astra-genai-client.ts), [`scene-video.ts`](../server/src/scene-video.ts), [`video-registry.ts`](../server/src/video-registry.ts)

## Hosted LTX API

The official hosted LTX API from Lightricks, not the self-hosted ASTRA gateway or local MLX. A project
selects it with `{engine:"ltx-api", model:"ltx-2-5-pro", resolution:"1920x1080", operation:"audio"}`
([model-settings.md](../skills/_shared/model-settings.md)). The deployment is `ltx-api-v2` at
`https://api.ltx.io` [1]. Status: current. Credential: `LTX_API_KEY`
([config.ts](../server/src/config.ts)).

### Models

| Model ID | In plugin | Notes |
|---|---|---|
| `ltx-2-5-pro` | yes (default) | GA. Image-, text- and audio-to-video. 6, 8 or 10 s at every resolution and fps [5] |
| `ltx-2-5-fast` | yes | GA. Up to 20 s at 720p/1080p, 24/25 fps [5] |
| `ltx-2-3-pro` | no | GA. Text-, image- and audio-to-video, retake, extend. 16:9 and 9:16 only [1][6] |
| `ltx-2-3-fast` | no | GA. Text- and image-to-video only [1][6] |

No model newer than LTX-2.5 appears in the OpenAPI model enums, the docs index or the changelog
(latest entry 2026-11-10) [1][14][15]. The plugin lists the two 2.5 models
([ltx-api-video.ts](../server/src/ltx-api-video.ts)).

### Calling it

- **Submit:** `POST /v2/{endpoint}` with `Authorization: Bearer <key>` and a JSON body. The response is
  `202 {id, created_at}` [1][10]. The whole body is capped at 32 MB, else `413 request_too_large_error` [8].
- **Poll:** `GET /v2/{endpoint}/{id}`. `status` is `pending`, `processing`, `completed` or `failed`.
  A failed job still answers HTTP 200 with `error{type,message}` [10][4]. The vendor asks for at least 5 s
  between polls, with jitter [10].
- **Result:** `result.video_url`. The signed URL expires one hour after the status check; a new poll
  returns a fresh one. Job status is kept up to 24 h after the job ends, then `404` [4][10].
- **Plugin:** polls every 6,000 ms, at most 300 times (30 min), then stops and asks for
  `video_status action:reconcile`. It never repeats the paid POST
  ([ltx-api-video.ts](../server/src/ltx-api-video.ts), [vendor-video.ts](../server/src/vendor-video.ts)).
- **No webhook, no idempotency key, no seed, no negative prompt.** None of these appears in the OpenAPI
  spec [1]. A failed job cannot be resumed and must be submitted again [12].
- **Concurrency:** 2 running jobs per organization by default, up to 100 waiting in `pending`; the next
  submission returns `429 rate_limit_error` [11].
- **Output:** MP4, H.264 8-bit 4:2:0, BT.709 SDR, AAC stereo. No codec option [9].

```text
POST https://api.ltx.io/v2/image-to-video   → 202 {"id": "…", "created_at": "…"}
GET  https://api.ltx.io/v2/image-to-video/{id}
→ {"id": "…", "status": "completed", "created_at": "…", "completed_at": "…",
   "result": {"video_url": "https://…"}}
```

### Operations

| Operation | Vendor | Plugin tool |
|---|---|---|
| Text-to-video | yes | not exposed |
| Image-to-video (first frame, optional last frame) | yes | `ltx_api_img2video` |
| Audio-to-video (supplied track) | yes | `ltx_api_audio2video` |
| Reference (character consistency) | no | — |
| Keyframes (frames between first and last) | no | — |
| Retake (re-generate a section) | yes, `ltx-2-3-pro` only | not exposed |
| Extend | yes, `ltx-2-3-pro` only | not exposed |
| SDR to HDR, reframe, alpha matte, upscale | yes | not exposed |

#### Text-to-video

The vendor offers this; the plugin does not expose it.

- `POST /v2/text-to-video`. Required: `prompt` (≤ 5,000 chars), `model`, `duration` (integer or `null`),
  `resolution`. Optional: `fps` (default 24), `generate_audio` (default `true`), `camera_motion` [1][2].
- `duration: null` lets a 2.5 model choose the length from the prompt, up to the table maximum [5].
- Billed per second of generated video [13].

#### Image-to-video

- **Plugin input** (`ltx_api_img2video`, [ltx-api-video.ts](../server/src/ltx-api-video.ts)):
  - `prompt`: string, 1–5,000 chars, required.
  - `model`: `ltx-2-5-pro` | `ltx-2-5-fast`, default `ltx-2-5-pro`.
  - `resolution`: one of the 20 sizes below, default `1920x1080`.
  - `fps`: 24 | 25 | 48 | 50, default 24.
  - `durationSeconds`: integer that must be in the duration table for the chosen model, resolution and fps. Default 6.
  - `generateAudio`: boolean, default `false`.
  - `sourceImagePath`: required. PNG, JPEG or WEBP.
  - `lastImagePath`: optional.
  - `cameraMotion`: optional; one of `dolly_in`, `dolly_out`, `dolly_left`, `dolly_right`, `jib_up`, `jib_down`, `static` or `focus_shift`.
- **Wire request:**

  ```text
  POST /v2/image-to-video
  {"model": "ltx-2-5-pro", "resolution": "1920x1080", "fps": 24, "prompt": "…",
   "image_uri": "data:image/png;base64,…", "last_frame_uri": "data:image/png;base64,…",
   "camera_motion": "dolly_in", "duration": 6, "generate_audio": false}
  ```

  `last_frame_uri` and `camera_motion` are sent only when set. `duration` and `generate_audio` are
  always sent ([ltx-api-video.ts](../server/src/ltx-api-video.ts)).
- **Limits:** durations by model, resolution and fps [5]:

  | Model | Resolution | fps | Seconds |
  |---|---|---|---|
  | `ltx-2-5-fast` | 720p, 1080p | 24, 25 | 6, 8, 10, 12, 14, 16, 18, 20 |
  | `ltx-2-5-fast` | 720p, 1080p | 48, 50 | 6, 8, 10 |
  | `ltx-2-5-fast` | 1440p, 4K | 24, 25, 48, 50 | 6, 8, 10 |
  | `ltx-2-5-pro` | 720p to 4K | 24, 25, 48, 50 | 6, 8, 10 |

  Resolutions for 2.5 [5]:

  | Tier | 16:9 | 9:16 | 1:1 | 3:2 | 2:3 |
  |---|---|---|---|---|---|
  | 720p | 1280x720 | 720x1280 | 720x720 | 1080x720 | 720x1080 |
  | 1080p | 1920x1080 | 1080x1920 | 1080x1080 | 1620x1080 | 1080x1620 |
  | 1440p | 2560x1440 | 1440x2560 | 1440x1440 | 2160x1440 | 1440x2160 |
  | 4K | 3840x2160 | 2160x3840 | 2160x2160 | 3240x2160 | 2160x3240 |

  The prompt limit is 5,000 chars [1]. Native audio is on by default at the vendor; `generate_audio: false`
  makes a silent clip [1]. Images are PNG, JPEG or WEBP. An inline data URI may be at most 7 MB, an
  upload or HTTPS URL 15 MB [8]. Billed per second of generated video [13].
- **References per request:** two images, a first frame (`image_uri`) and a last frame (`last_frame_uri`).
  The vendor interpolates between them [1][7]. There are no videos or audio inputs.
- **Identity:** carried only by the pixels of the first frame. There is no identity field or slot [1].
- **Voice:** there is no voice-sample input [1]. `generate_audio` voices whatever the prompt describes,
  and dialogue goes in quotation marks [3]. The catalog lists the voice lane as `none` with dialogue refused
  ([hosted-video-routes.ts](../server/src/hosted-video-routes.ts)).
- **First frame with references:** first and last frame can be sent together; there are no other references.
  Automatic duration cannot be combined with `last_frame_uri` [5].
- **Prompt labels:** none. The guide asks for one chronological prose paragraph. It says not to use a shot
  list or numbered beats unless the prose also describes the cut [3].
- **Plugin vs vendor:**
  - `generate_audio` defaults to `true` at the vendor. The plugin defaults to `false` and always sends the field.
  - The plugin does not expose `duration: null`.
  - The plugin sends images only as data URIs, so its image limit is 7 MB, not the 15 MB an upload allows [8].
  - The plugin refuses the GenAI sizes (`576x1024` / `1024x576` and `736x1280` / `1280x736`) because none is on the vendor's list.

#### Audio-to-video

- **Plugin input** (`ltx_api_audio2video`, [ltx-api-video.ts](../server/src/ltx-api-video.ts)):
  - Takes the image-to-video fields except `durationSeconds` and `generateAudio`.
  - `prompt` defaults to `""`. `sourceImagePath` is optional.
  - `audioPath` is required: a `.wav`, `.mp3`, `.m4a` or `.ogg` file.
  - A first image is required when the prompt is empty or a last image is given.
  - Before sending, the plugin reads the track length with `ffprobe`. It refuses anything under 2 s or over the model's maximum.
- **Wire request:**

  ```text
  POST /v2/audio-to-video
  {"model": "ltx-2-5-pro", "resolution": "1920x1080", "fps": 24, "prompt": "",
   "image_uri": "data:image/png;base64,…", "audio_uri": "data:audio/wav;base64,…"}
  ```

  `image_uri`, `last_frame_uri` and `camera_motion` are sent only when set. `model` and `resolution` are always sent.
- **Limits:** the audio sets the clip length. Minimum 2 s. Maximum audio length [1][4]:

  | Model | Resolution | Max audio |
  |---|---|---|
  | `ltx-2-5-fast` | 720p, 1080p | 20 s |
  | `ltx-2-5-fast` | 1440p, 4K | 10 s |
  | `ltx-2-5-pro` | all | 10 s |
  | `ltx-2-3-pro` | 720p, 1080p | 20 s |
  | `ltx-2-3-pro` | 1440p, 4K | 10 s |

  Audio formats [8]:
  - WAV: PCM 16-bit, 24-bit or 32-bit float. AAC, MP3, Vorbis or FLAC inside WAV is also accepted.
  - MP3, M4A (AAC) and OGG (Opus or Vorbis).
  - 32-bit integer and 8-bit PCM are rejected.

  An inline audio data URI may be at most 15 MB, an upload or HTTPS URL 32 MB [8]. There is no `duration` or
  `generate_audio` field. Billed per second of input audio [13].
- **References per request:** one audio track, one first frame and one last frame. The last frame requires the first [1].
- **Identity:** first frame only [1].
- **Voice:** supplied full track only. The track may hold any number of voices. There is no per-speaker
  sample or speaker binding [1]. The catalog lists the voice lane as `supplied` with
  `exactAudioPreservation: false` ([hosted-video-routes.ts](../server/src/hosted-video-routes.ts)).
- **First frame with references:** first frame, last frame and audio can share one request [1].
- **Prompt labels:** none; prose as in image-to-video [3].
- **Plugin vs vendor:**
  - The vendor's default model is `ltx-2-3-pro`. The plugin always sends a 2.5 model.
  - When `resolution` is omitted, the vendor chooses 1080x1920 for a portrait image and 1920x1080 for a landscape one [1]. The plugin always sends `resolution`, defaulting to `1920x1080`, so a portrait first frame renders landscape unless the caller sets `1080x1920`.
  - The plugin checks the file extension, not the PCM bit depth inside a WAV.
  - The 7 MB image and 15 MB audio data URI limits are checked on the base64-encoded size, as the vendor measures them [8] ([vendor-video.ts](../server/src/vendor-video.ts)).

#### Reference

The vendor does not offer this. No endpoint takes subject images, identity images or voice samples [1].
Where the endpoint descriptions say "reference image" they mean the first frame [1].

#### Retake and extend

The vendor offers these for `ltx-2-3-pro` only; the plugin does not expose them [1].

- `POST /v2/retake` requires `video_uri`, `start_time` and `duration`.
  - The input video may be up to 3840x2160 and must have at least 73 frames.
  - The section is at least 2 s and at most 505 frames, and at least 2 s must remain after `start_time`.
  - `mode` is `replace_audio`, `replace_video` or `replace_audio_and_video` (the default).
  - Billed at $0.10 per second of input video [1][13].
- `POST /v2/extend` requires `video_uri` and `duration`.
  - `duration` is 2–20 s. `mode` is `end` (the default) or `start`.
  - `context` is 1–20 s, and `context + duration` must be at most 505 frames. The input video may be up to 100 MB.
  - Billed at $0.10 per second of the extension plus context [1][8][13].

#### Video post-processing

The vendor offers these; the plugin does not expose them. Each takes `video_uri` and no model:
`/v2/video-to-video-hdr`, `/v2/video-to-video-reframe`, `/v2/video-alpha-gen` and `/v2/video-upscale`
[1][15]. Input video may be up to 200 MB [8].

### Gaps and differences

- **Vendor offers, plugin does not expose:**
  - text-to-video;
  - automatic duration (`duration: null`);
  - upload and HTTPS-URL inputs (15 MB images);
  - the 2.3 models;
  - retake and extend;
  - HDR, reframe, alpha matte and upscale.
- **Mismatches still open:**
  - Audio-to-video always sends `resolution`, so the vendor's portrait/landscape choice from the first frame never applies.
  - The plugin does not reject WAV files with 32-bit integer or 8-bit PCM. The vendor rejects them after submission [8].
  - The plugin polls every 6 s with no jitter and stops after 30 min. The vendor keeps job status for 24 h and asks for jitter [10].
  - The size caps are in MiB (1,048,576 bytes) where the vendor writes "MB". Which unit the vendor means is unverified.
- **Unverified:**
  - whether the 20 s audio maximum also holds at 48 or 50 fps (the vendor table has no fps column, and the plugin ignores fps);
  - whether the supplied audio comes back unchanged;
  - how an image whose aspect differs from `resolution` is handled;
  - the shortest length automatic duration can choose;
  - whether separate generations keep the same voice.

### Sources

1. [LTX API OpenAPI 3.1 specification](https://docs.ltx.io/openapi.json) — fetched 2026-11-25
2. [Generate video from text](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-text-to-video.md) — fetched 2026-11-25
3. [Prompting Guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide.md) — fetched 2026-11-25
4. [Generate video from audio](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-audio-to-video.md) and [Get job status](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/get-job-status.md) — fetched 2026-11-25
5. [LTX-2.5](https://docs.ltx.io/models/ltx-2-5.md) — fetched 2026-11-25
6. [LTX-2.3](https://docs.ltx.io/models/ltx-2-3.md) — fetched 2026-11-25
7. [Generate video from image](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-image-to-video.md) — fetched 2026-11-25
8. [Input Formats](https://docs.ltx.io/input-formats.md) — fetched 2026-11-25
9. [Output Formats](https://docs.ltx.io/output-formats.md) — fetched 2026-11-25
10. [Async Jobs](https://docs.ltx.io/async-jobs.md) — fetched 2026-11-25
11. [Concurrency and Queue Limits](https://docs.ltx.io/rate-limits.md) — fetched 2026-11-25
12. [Error Handling](https://docs.ltx.io/errors.md) — fetched 2026-11-25
13. [Pricing](https://docs.ltx.io/pricing.md) — fetched 2026-11-25
14. [LTX documentation index](https://docs.ltx.io/llms.txt) — fetched 2026-11-25
15. [API Changelog](https://docs.ltx.io/changelog.md) — fetched 2026-11-25

Code: [`ltx-api-video.ts`](../server/src/ltx-api-video.ts),
[`hosted-video-routes.ts`](../server/src/hosted-video-routes.ts),
[`vendor-video.ts`](../server/src/vendor-video.ts), [`config.ts`](../server/src/config.ts),
[`model-settings.md`](../skills/_shared/model-settings.md)

## Local MLX-Serve

MLX-Serve is a native video server that runs on Apple silicon. The plugin sends it requests directly at
`MLX_SERVE_URL` (default `http://127.0.0.1:11234`), plus `MLX_SERVE_API_KEY` when the server
requires a key. Two packs are wired in: an LTX-2.5 pack through `ltx_video_generate`, and FastH3
Omni through `fasth3_omni_reference`. Both use the saved selection `{engine:"mlx", model:"…"}` with
deployment `local-mlx`. The deployment is local and costs nothing per call. The plugin does not
download weights or start the server. Setup is in [Local LTX video on Apple silicon](mlx-ltx-2.5.md)
and [FastH3 Omni local adapter](fasth3-omni.md).

Both packs use the same transport. The plugin reads `GET /v1/models` and loads a model with
`POST /v1/load-model` (never `default:true`) [mlx-serve-client.ts](../server/src/mlx-serve-client.ts).
It then sends one synchronous `POST /v1/video/generations`. There is no job ID and no result URL.
The response carries base64 RGB frames and PCM16 audio, which the plugin writes to MP4 with FFmpeg [1].
The plugin fails a call whose returned width, height, frame count or 24 fps differ from the request
[mlx-serve-client.ts](../server/src/mlx-serve-client.ts).

```text
// response body, or the SSE "complete" event payload when "stream": true
{"frames":49,"height":1280,"width":768,"fps":24,"format":"rgb8","data":"<b64>",
 "audio_sample_rate":24000,"audio_channels":2,"audio_format":"pcm_s16le","audio_data":"<b64>"}
```

The sample rate above is illustrative. FastH3 audio is 32 kHz [2]. The plugin falls back to 24 kHz when the field is absent.

### LTX-2.5 pack

#### Models

| Model ID | In plugin | Notes |
| --- | --- | --- |
| `ddalcu/LTX-2.5-MLX-Serve-4bit` | yes (any ID matching `/ltx/i`) | 36 GB pack. It has distilled and dev transformers, a Gemma-4 text encoder, VAEs, the audio VAE and ×2 upscalers. It has no diffusion decoder [3]. |
| `ddalcu/LTX-2.5-MLX-Serve-8bit` | yes (same match) | Ships the diffusion decoder [1]. |
| LTX 2.3 MLX packs (e.g. `dgrauet/ltx-2.3-mlx-q4`) | yes (same match) | The server claims them [1]. The plugin has not tested them. |

`mlx_video_generate` is a deprecated alias for the same adapter.

#### Calling it

`ltx_video_generate` sends no `stream` field. It makes one blocking POST with a 20-minute abort and
the default HTTP dispatcher [mlx-serve-client.ts](../server/src/mlx-serve-client.ts). The server
streams progress events only when the request carries `"stream": true` [1]. There is nothing to poll.

#### Operations

| Operation | Vendor | Plugin tool |
| --- | --- | --- |
| Text-to-video | yes | `ltx_video_generate` |
| Image-to-video (first, last, or both) | yes | `ltx_video_generate` |
| Audio-to-video (supplied track) | yes, two-stage only | not exposed |
| Reference (character consistency) | no | not exposed |
| Two-stage / HQ pipelines | yes | `ltx_video_generate` (`pipeline`) |
| Diffusion decoder | 8-bit pack only | `ltx_video_generate` (`decoder`) |

##### Text-to-video

- **Plugin input:**
  - `prompt` (1–32,000 chars);
  - `width` and `height` (integers 256–1920, default 768×1280; a multiple of 64, or of 32 with `pipeline:"one_stage"`);
  - `numFrames` (9–241, 8k+1, default 49);
  - `steps` (1–50);
  - `seed`;
  - `pipeline` (`one_stage` | `two_stage` | `two_stage_hq`);
  - `decoder` (`conv` | `diffusion`).

  Decoded RGB (W×H×frames×3) must be at most 768 MiB [mlx-serve-client.ts](../server/src/mlx-serve-client.ts).
- **Wire request:**
  ```text
  POST /v1/video/generations
  {"prompt":"…","model":"ddalcu/LTX-2.5-MLX-Serve-4bit","width":768,"height":1280,
   "num_frames":49,"steps":8,"seed":42,"pipeline":"one_stage","decoder":"conv"}
  ```
- **Limits:**
  - Frames and duration: 24 fps [1]. The plugin range is 9–241 frames (0.38–10.0 s).
  - Pipeline: the server runs `one_stage` when `pipeline` is absent. One-stage loads the distilled transformer first, and its schedule is fixed at 8 steps whatever `steps` says. Two-stage needs width and height divisible by 64 [1].
  - Size: the server refuses a response over 768 MiB of raw RGB [1].
  - Prompt: the server pads the prompt to 1,024 Gemma tokens and keeps the last 1,024. A longer prompt loses its beginning [1].
  - Audio: the soundtrack is generated whenever the pack has its audio VAE. Neither the server nor the plugin has an on/off control [1].
- **Plugin vs vendor:**
  - Server defaults are 384×256, 9 frames, seed 42 and `steps` 30 (dev) [1]. The plugin defaults to 768×1280 and 49 frames.
  - The server takes `steps` 1–100, plus `stage2_steps`, `cfg_scale`, `cfg_audio_scale`, `stg_scale`, `lora_paths`/`lora_scales` and `preview` [1]. The plugin exposes `steps` 1–50 and none of the others.
  - The server sets no 241-frame maximum. Only the RGB cap limits length [1].
  - The plugin requires the 64 px grid when `pipeline` is omitted, because a code comment says the server default is two-stage. The server default is `one_stage` [1].

##### Image-to-video

- **Plugin input:** `firstFrameImagePath` and `lastFrameImagePath` (local files), plus the text-to-video fields.
- **Wire request:** the same body with `"first_frame_image":"<b64>"` and `"last_frame_image":"<b64>"` added.
- **Limits:**
  - Images: both are cropped to the canvas on a 32 px grid [1].
  - Last frame: needs at least 9 frames and the VAE encoder, and is refused by name if it cannot be decoded [1].
  - First frame: a first frame that fails to decode, or a pack without the VAE encoder, falls back silently to text-to-video [1].
  - Timing: there are no keyframes at intermediate times.
- **Plugin vs vendor:**
  - The plugin sends the file bytes without checking the image type.
  - The plugin cannot detect the silent first-frame fallback, because geometry and frame count stay the same.
  - The model card describes first-frame conditioning only [3]. Last-frame quality is unverified.

##### Audio-to-video

The vendor offers this; the plugin does not expose it. The server takes `"audio":"<b64 WAV>"`
(PCM16, PCM24 or float32) only with `pipeline:"two_stage"` or `"two_stage_hq"`. The track conditions
the generation, is cut to the video length, and is muxed back into the result as the original clip,
downmixed to stereo at most. Clips shorter than about 50 ms are refused [1]. Spoken lines on this
adapter are refused at planning (voice lane `none`)
[video-registry.ts](../server/src/video-registry.ts).

##### Reference

The vendor does not offer this. The LTX server has no subject, reference-image or voice-sample
fields [1].

##### Diffusion decoder

`decoder:"diffusion"` needs `vae_diffusion_decoder.safetensors`, which the 8-bit pack ships and the
4-bit pack does not. The server refuses it by name otherwise [1][3]. The plugin offers the value for
any model.

### FastH3 Omni

#### Models

| Model ID | In plugin | Notes |
| --- | --- | --- |
| `ddalcu/FastH3-Omni-MLX-Serve-8bit` | yes (exact ID) | 8-bit conversion of `FastVideo/FastVideo-FastH3-Omni-8-Step-V1` [4]. Pack `tasks:["ref2va"]`, 8-step PDD student. |
| `ddalcu/MiniMax-H3-REF2VA-MLX-Serve-8bit` | no | Full REF2VA base with 30 default steps and an optional `turbo` LoRA [1][5]. |
| `ddalcu/MiniMax-H3-FL2VA-MLX-Serve-{8bit,4bit}` | no | Text-to-audio-video and first/last-frame keyframes, plus `chain_windows` 1–6 [1][5]. |
| `hancheng-ai/HyperFlow-H3-Flash-{FL2VA,REF2VA}-MLX-Serve-{8bit,4bit}` | no | Few-step two-time DiT that MLX-Serve serves [1][5]. |

#### Calling it

`fasth3_omni_reference` sends `"stream": true`. It reads Server-Sent Events until
`data: {"type":"complete", …}` or `{"type":"error"}`, with a 90-minute header and body timeout
[mlx-serve-client.ts](../server/src/mlx-serve-client.ts). A managed scene keeps the native take in
`.work/fasth3/<plan-id>/native.mp4`. `video_status` with `action:"refresh"` can finish delivery
without a second render [video-routing.ts](../server/src/video-routing.ts).

#### Operations

| Operation | Vendor | Plugin tool |
| --- | --- | --- |
| Text-to-video | FL2VA packs only; this pack refuses it | not exposed |
| Image-to-video (first/last frame) | FL2VA packs; parsed on this pack (see below) | not exposed |
| Audio-to-video (supplied track) | no | not exposed |
| Reference (character consistency) | yes | `fasth3_omni_reference` |
| Chained windows, turbo | FL2VA / base packs only | not exposed |

##### Text-to-video

The vendor offers this on FL2VA packs; this pack does not. It declares only `ref2va`, and MLX-Serve
refuses a request without an image or video reference [1][2][4].

##### Image-to-video

The vendor offers this on FL2VA packs; the plugin does not expose it. MLX-Serve parses
`first_frame_image` and `last_frame_image` (base64 PNG or JPEG) on every H3 pack. On this pack it
encodes them as condition rows ahead of the references, and does not refuse them [1]. Keyframes
alone do not satisfy the reference requirement [1]. Whether keyframes and references work together
on this pack is unverified. A reference image guides identity and composition. It does not pin the
first frame [fasth3-omni.md](fasth3-omni.md).

##### Audio-to-video

The vendor does not offer this. Audio enters only as a reference for timbre or ambience, and an
audio-only reference set is refused [2][6]. The plugin reports `suppliedSpeech:"unsupported"`
[video-registry.ts](../server/src/video-registry.ts).

##### Reference

- **Plugin input** [fasth3-omni.ts](../server/src/fasth3-omni.ts):
  - `prompt` (1–32,000 chars);
  - `width` and `height` (256–1536, multiples of 32, default 768×448);
  - `numFrames` (124–362, 17k+5, default 124);
  - `steps` (exactly 8);
  - `seed`;
  - `referenceImagePaths` (≤9 PNG/JPEG);
  - `referenceVideoPaths` (≤3);
  - `referenceAudioPaths` (≤3);
  - `trimReferenceVideos` (default `false`);
  - `referenceSize` (`match` | `max`, default `match`).
- **Wire request:**
  ```text
  POST /v1/video/generations
  {"stream":true,"model":"ddalcu/FastH3-Omni-MLX-Serve-8bit","prompt":"…",
   "width":768,"height":448,"num_frames":124,"steps":8,"seed":2026,"ref_image_size":"match",
   "ref_images":["<b64 PNG|JPEG>"],
   "ref_videos":[{"frames":["<b64 JPEG>", "…"],"audio":"<b64 WAV>"}],
   "ref_audios":["<b64 WAV>"]}
  ```
  How the plugin prepares references [fasth3-omni.ts](../server/src/fasth3-omni.ts):
  - It decodes each reference video to 24 fps JPEG frames, with a long side of 768 px at most.
  - It keeps at most `numFrames` frames, snapped down to 17k+5. A clip that would lose frames is refused unless `trimReferenceVideos` is set.
  - It converts soundtracks and standalone audio to 32 kHz stereo PCM16 WAV.
- **Limits:**
  - Frames: 24 fps. The plugin range is 124–362 frames (5.17–15.08 s). FastVideo and diffusers accept the same range [6][7]. The MiniMax card states output of 4–15 s [5]. MLX-Serve snaps any count of 5 or more up to 17k+5 [1].
  - Scene length: for a scene, the plugin renders the next 17k+5 count above the authored length, then trims to it [fasth3-omni.ts](../server/src/fasth3-omni.ts).
  - Canvas: the plugin caps decoded RGB at 256 MiB [fasth3-omni.ts](../server/src/fasth3-omni.ts). MLX-Serve caps it at 768 MiB and also checks memory per request [1]. MiniMax defaults to a 768 px short edge and supports 21:9 to 9:16 [5].
  - Prompt: the plugin allows 32,000 chars; the server limit is unverified.
  - Audio: always on, 32 kHz stereo [2][5]. There is no switch. The plugin fails a take that comes back silent when voice samples were sent [mlx-serve-client.ts](../server/src/mlx-serve-client.ts).
- **References per request:**
  - Counts: ≤9 images, ≤3 videos, ≤3 audio clips, ≤12 files in total, and at least one image or video [1][4][5].
  - Clip length: the plugin requires each video and audio clip to be 2–15 s, with each type at most 15 s in total. This matches MiniMax's stated limits [5]. MLX-Serve itself enforces only a minimum of 5 frames per video [1].
  - Encoded upload: the plugin caps it at 60 MiB. MLX-Serve accepts bodies up to 512 MiB [1].
- **Identity:**
  - There is no identity field. A picture is identified by its position in `ref_images`, and the prompt names it `<Picture i>`.
  - The plugin maps a speaker to pictures only through the character's `voiceReference.imagePaths`, never by array position. It refuses an on-screen speaker without an owned face and a pinned sample (`character_voice_required`) [video-voice.ts](../server/src/video-voice.ts).
- **Voice:**
  - The binding is written in the prompt only. The plugin adds `<Name> (speaker <id>), shown in <Picture i>, uses <Audio j> for voice timbre only.`
  - Each line becomes `<Subject N> (<Name>, <Picture i>, <Audio j>) (SN) says <d>[<Language>] <words></d>`, and dialogue that contains `<d>` is refused [video-voice.ts](../server/src/video-voice.ts).
  - The plugin allows up to 3 speakers per render (`referenceAudioPaths` maximum), within the 12-file total [video-registry.ts](../server/src/video-registry.ts).
  - The voice is imitated, not preserved. The plugin checks whether the sample was replayed into the take (`voiceReferenceCheck`) [fasth3-omni.ts](../server/src/fasth3-omni.ts).
- **First frame with references:** MLX-Serve accepts both in one request [1]. The plugin does not send frames. Quality is unverified.
- **Prompt labels:**
  - Labels are `<Picture i>`, `<Video k>` and `<Audio j>`, numbered from 1 within each type, in the order images, videos, standalone audio [1][4][7].
  - A reference video's soundtrack takes an `<Audio j>` number ahead of every standalone clip. With one video that has sound plus one voice sample, the soundtrack is `<Audio 1>` and the sample is `<Audio 2>` [1][5].
  - The plugin counts soundtracks with ffprobe and shifts the sample numbers [video-voice.ts](../server/src/video-voice.ts).
  - MiniMax's documented prompt adds a `subject_definitions:` line such as `<Audio 2> is the voice timbre reference for <Subject 1>'s voice` [5].
- **Plugin vs vendor:**
  - RGB cap: 256 MiB in the plugin, 768 MiB in MLX-Serve. The plugin refuses 1344×768×124 (384 MB).
  - Reference video length: by default the plugin refuses a reference video longer than the output. MLX-Serve would cut it silently [1].
  - Clip seconds: the 2–15 s per clip and 15 s total rules come from MiniMax's hosted-model card [5], not from MLX-Serve.
  - Audio cap: MLX-Serve's limit of 3 audio clips counts only `ref_audios`. Soundtracks count toward the 12-file total [1].

##### Chained windows and turbo

The vendor offers these; the plugin does not expose them. `chain_windows` (1–6) works on FL2VA
packs only. `turbo` needs a base pack with `turbo_lora.safetensors`. Both are refused on this pack,
and `fast` is off for distilled packs [1].

### Gaps and differences

- **Vendor offers, plugin does not expose:**
  - LTX: audio-to-video, `stage2_steps`, CFG/STG scales, LoRAs and `preview`.
  - H3: the FL2VA, REF2VA-base and HyperFlow Flash packs, first/last-frame keyframes, `chain_windows` and `turbo`.
- **Mismatches still open:**
  - LTX: the plugin requires a 64 px grid when `pipeline` is omitted, on the belief that the server default is two-stage. The server default is `one_stage` [1].
  - LTX: the plugin accepts prompts up to 32,000 chars, but the server keeps only the last 1,024 tokens [1].
  - LTX: a bad first frame turns the call into text-to-video, and the plugin cannot detect it [1].
  - LTX: `decoder:"diffusion"` is offered for the 4-bit pack, which lacks the decoder [3].
  - LTX: the plugin allows `steps` 1–50, but distilled one-stage always runs 8 [1]. The plugin's 241-frame maximum is not a server limit [1].
  - FastH3: the plugin's 256 MiB RGB cap is a third of MLX-Serve's 768 MiB [1].
  - FastH3: the plugin's 60 MiB upload cap is far below MLX-Serve's 512 MiB [1].
  - The deprecated `mlx_video_generate` catalog row gets a different scene writing guide from `ltx_video_generate` [scene-prompt-profile.ts](../server/src/scene-prompt-profile.ts).
  - The LTX model card's example uses port 11434, while the plugin default is 11234 [3].
- **Unverified:**
  - The frame count LTX returns for a `num_frames` that is not 8k+1. The plugin refuses those counts first.
  - Whether a non-streamed LTX render longer than about 5 minutes hits the HTTP client's default header timeout. No LTX pack was installed to test.
  - LTX last-frame quality.
  - FastH3 with first/last frames and references together.
  - FastH3 server prompt limit.

### Sources

1. [MLX-Serve source at commit 2201ec9](https://github.com/ddalcu/mlx-serve/tree/2201ec9a838246b7a361d96a20cd3fb39b749ac8) — `src/plugins/ltx/{plugin,engine,video,config}.zig`, `src/plugins/minimax_h3/{plugin,h3,geometry,vision}.zig`, `src/sdk/media/video_out.zig`, `src/host/media_jobs/{sse,gen}.zig`, `src/host/http/router.zig`, `docs/api.md`, `docs/reference.md` — fetched 2026-11-25
2. [FastVideo FastH3 Omni 8-Step V1 model card](https://huggingface.co/FastVideo/FastVideo-FastH3-Omni-8-Step-V1) — fetched 2026-11-25
3. [ddalcu/LTX-2.5-MLX-Serve-4bit model card](https://huggingface.co/ddalcu/LTX-2.5-MLX-Serve-4bit) — fetched 2026-11-25
4. [ddalcu/FastH3-Omni-MLX-Serve-8bit model card](https://huggingface.co/ddalcu/FastH3-Omni-MLX-Serve-8bit) — fetched 2026-11-25
5. [MiniMaxAI/MiniMax-H3 model card](https://huggingface.co/MiniMaxAI/MiniMax-H3) — fetched 2026-11-25; pack list from [Hugging Face models by ddalcu](https://huggingface.co/ddalcu) — fetched 2026-11-25
6. [FastVideo MLX runtime for MiniMax-H3](https://github.com/hao-ai-lab/FastVideo/tree/a04639fa976d9f27ea0ff0c3febb9e7643ecbc37/fastvideo/mlx_runtime) — `minimax_h3.py`, `minimax_h3_reference.py`, `minimax_h3_pipeline.py` — fetched 2026-11-25
7. [diffusers MiniMax-H3 pipeline docs](https://huggingface.co/docs/diffusers/main/en/api/pipelines/minimax_h3) — fetched 2026-11-25

Code: [`mlx-serve-client.ts`](../server/src/mlx-serve-client.ts), [`fasth3-omni.ts`](../server/src/fasth3-omni.ts),
[`local-video-models.ts`](../server/src/local-video-models.ts), [`video-registry.ts`](../server/src/video-registry.ts),
[`video-voice.ts`](../server/src/video-voice.ts), [`scene-prompt-profile.ts`](../server/src/scene-prompt-profile.ts),
[`video-routing.ts`](../server/src/video-routing.ts)

## Seedance (BytePlus ModelArk)

ByteDance's Dreamina Seedance 2.x models are hosted on BytePlus ModelArk in Singapore. Volcengine Ark in Beijing serves the same models under `doubao-` IDs [1][15]. The saved selection is `{engine:"seedance", model:"dreamina-seedance-2-…"}` with the `byteplus` deployment ([video-registry.ts](../server/src/video-registry.ts)). The family is current: the plugin carries the five 2.x models, and it dropped Seedance 1.x because 1.x takes no reference audio ([seedance-client.ts](../server/src/seedance-client.ts)). Credentials:
- `ARK_API_KEY` (bearer key for inference).
- `ARK_BASE_URL` (optional base URL).
- `BYTEPLUS_ACCESS_KEY_ID`, `BYTEPLUS_SECRET_ACCESS_KEY` and optional `BYTEPLUS_PROJECT_NAME` (default `default`) for portrait asset registration ([config.ts](../server/src/config.ts), [modelark-assets.ts](../server/src/modelark-assets.ts)).

### Models

| Model ID | In plugin | Notes |
|---|---|---|
| `dreamina-seedance-2-5-260628` | yes | GA. 480p/720p (8-bit), 1080p and 4K (10-bit). 4–30 s at 24 fps. Outputs mp4 or mov. Only 2.x model with Draft mode [3][6] |
| `dreamina-seedance-2-5-flash-261115` | yes | GA. Newest Seedance model (2026-11 release). 480p and 720p. 4–30 s [3][4] |
| `dreamina-seedance-2-0-260128` | yes (default) | GA. 480p/720p/1080p (8-bit), 4K (10-bit). 4–15 s. mp4 only [3] |
| `dreamina-seedance-2-0-fast-260128` | yes | GA. 480p and 720p. 4–15 s [3] |
| `dreamina-seedance-2-0-mini-260615` | yes | GA. 480p and 720p. 4–15 s. Listed as the replacement for 1.5 pro [3][5] |
| `seedance-1-0-pro-250528` | no | GA. 480p to 1080p. 2–12 s. No reference input [3] |
| `seedance-1-0-pro-fast-251015` | no | GA. First frame only. 2–12 s. No reference input [3] |
| `seedance-1-5-pro-251215` | no | Retired after 17:00 on 2026-11-11 (UTC+8) [5] |
| `doubao-seedance-2-5-260628`, `-2-5-flash-261115`, `-2-0-260128`, `-2-0-fast-260128`, `-2-0-mini-260615` | no | Volcengine IDs for the same five models [15] |

No ModelArk or Volcengine page announces a Seedance model newer than 2.5 flash [4][16].

The 2.x models need activation in the console. Activation requires an account balance over USD 30, an AI Savings Plan, or a resource pack [1].

Rate limits per account [3]:
- Non-4K: 600 RPM and 10 concurrent tasks for enterprise accounts; 180 RPM and 3 for individuals.
- 4K: 15 RPM and 1 concurrent task [6].

### Calling it

- **Submit:** `POST {base}/contents/generations/tasks`. The default base is `https://ark.ap-southeast.bytepluses.com/api/v3` [1].
  - The response carries the task id in `id` (`cgt-…`).
  - The body must be at most 64 MB [1]. The plugin checks this before sending ([seedance-client.ts](../server/src/seedance-client.ts)).
- **Poll:** `GET {base}/contents/generations/tasks/{id}` [2].
  - `status` is one of `queued`, `running`, `succeeded`, `failed`, `cancelled` or `expired`.
  - On success, `content.video_url` holds the video and `usage.completion_tokens` the billing basis.
  - The plugin polls every 10 s, up to 90 times (15 minutes). `video_status` refresh recovers a job that was already submitted ([seedance-client.ts](../server/src/seedance-client.ts), [video-routing.ts](../server/src/video-routing.ts)).
- **Lifetimes:** `video_url` is valid for 24 h; on 2.5 it can be downloaded at most 100 times. Task IDs are valid for 7 days, and Draft IDs for 14 [2].
  - The returned `duration` is floor(frames / 24) [1].

```json
{
  "model": "dreamina-seedance-2-0-260128",
  "content": [{"type": "text", "text": "<English prompt>"}],
  "ratio": "adaptive", "resolution": "720p", "duration": 5,
  "watermark": false, "generate_audio": false,
  "omni_reference_task_type": "reference"
}
```

Media parts are appended to `content` as shown under each operation. `omni_reference_task_type` applies to 2.5 only and is sent only when the call sets it ([seedance-client.ts](../server/src/seedance-client.ts) `buildBody`).

### Operations

| Operation | Vendor | Plugin tool |
|---|---|---|
| Text-to-video | yes, all models | `seedance_text2video` |
| Image-to-video | first frame on all models; first and last frames on 2.x and 1.0 pro | `seedance_img2video` |
| Audio-to-video (supplied track) | no | not exposed |
| Reference (character consistency) | yes, 2.x | `seedance_reference` |
| Edit video | yes, 2.x | `seedance_reference` with `omniReferenceTaskType:"edit"` (2.5 only) |
| Extend video | yes, 2.x | `seedance_reference` with `omniReferenceTaskType:"extend"` (2.5 only) |
| Draft preview | 2.5 only | not exposed |
| Keyframes | prompt instruction on 2.5 | through the prompt only |

#### Text-to-video

- **Plugin input** ([seedance-client.ts](../server/src/seedance-client.ts)):
  - `prompt`: string, required, no maximum length.
  - `model`: default `dreamina-seedance-2-0-260128`.
  - `resolution`: `480p`, `720p`, `1080p` or `4k`; default `720p`. A resolution the model lacks is refused.
  - `durationSeconds`: integer, default 5. Range 4–15 on 2.0 and 4–30 on 2.5, or -1 to let the model choose.
  - `ratio`: `16:9`, `9:16`, `4:3`, `3:4`, `1:1`, `21:9` or `adaptive`; default `16:9`. Planning sets `9:16` on a `shorts-9x16` board.
  - `generateAudio`: default `false`. `watermark`: default `false`.
- **Wire request:** `POST /contents/generations/tasks` with `content: [{"type":"text","text":"…"}]`.
- **Limits:**
  - 24 fps fixed. 4–15 s on 2.0 and 4–30 s on 2.5 [3].
  - No hard prompt limit. The vendor recommends at most 500 Chinese characters or 1,000 English words [1].
  - `generate_audio` turns native sound on or off [1].
- **Voice:** this tool has no voice-sample input, and planning refuses spoken lines on it ([video-voice.ts](../server/src/video-voice.ts)).
- **Plugin vs vendor:**
  - The vendor's ratio default is `adaptive` on 2.x; the plugin's is `16:9`.
  - The vendor's 2.5 duration default is -1; the plugin's is 5.
  - The vendor's `generate_audio` default is `true`; the plugin's is `false` [1].
  - The 2.5 series accepts Korean and eight other non-English prompt languages [1]. The plugin refuses non-Latin text outside quotes by owner directive ([prompt-language.ts](../server/src/prompt-language.ts)).

#### Image-to-video

- **Plugin input:**
  - `sourceImagePath` (required) and `lastImagePath` (optional).
  - `realFaceInput`.
  - `ratio`, default `adaptive`. 2.5 refuses anything but `adaptive`.
  - The common fields from Text-to-video ([seedance-client.ts](../server/src/seedance-client.ts)).
- **Wire request:** each image is a base64 data URI, or `asset://<id>` for a registered portrait:

  ```text
  "content": [
    {"type":"text","text":"…"},
    {"type":"image_url","image_url":{"url":"data:image/png;base64,…"},"role":"first_frame"},
    {"type":"image_url","image_url":{"url":"…"},"role":"last_frame"}
  ]
  ```

- **Limits:**
  - One image for the first frame, two for first and last frames [1].
  - Each image under 30 MB. 300–6000 px per side. Aspect ratio in [0.4, 2.5] [1].
  - 2.5 keeps the first frame's aspect ratio and needs `ratio: adaptive`. 2.0 center-crops to a requested ratio [1].
- **Voice:** no voice-sample input. With `videoDirection.dialogueVoice:"model_generated"`, the model voices the lines itself ([scene-prompt-profile.ts](../server/src/scene-prompt-profile.ts)).
- **Plugin vs vendor:**
  - The vendor accepts tiff on all models and heic and heif on 2.x [1][10]. The plugin takes only png, jpg, jpeg, gif, webp and bmp ([media-utils.ts](../server/src/media-utils.ts)).

#### Audio-to-video

The vendor does not offer this. The content roles are only `first_frame`, `last_frame`, `reference_image`, `reference_video`, `reference_audio` and `draft_task` [1]. A `reference_audio` clip can carry timbre, melody or dialogue content [7]. No page promises that the input track is kept as it was in the output.

#### Reference

- **Plugin input** (`seedance_reference`):
  - `referenceImagePaths[]`.
  - `referenceAudioPaths[]`: wav or mp3.
  - `referenceVideoPaths[]`: mp4 or mov, local files.
  - `referenceVideoUrls[]`: `https://` or `asset://`.
  - `referenceVideoTaskIds[]`: `cgt-…`.
  - `omniReferenceTaskType`: `auto`, `reference`, `edit` or `extend`; 2.5 only.
  - `ratio`: default `adaptive`.
  - Common fields as above. Reference audio requires `generateAudio: true` ([seedance-client.ts](../server/src/seedance-client.ts)).
- **Wire request:** parts go in a fixed order: images, then videos, then audio.
  - Local videos are first published to a public URL, because the vendor takes video only by URL or asset ID [1].

  ```text
  "content": [
    {"type":"text","text":"…"},
    {"type":"image_url","image_url":{"url":"asset://…"},"role":"reference_image"},
    {"type":"video_url","video_url":{"url":"https://…"},"role":"reference_video"},
    {"type":"audio_url","audio_url":{"url":"data:audio/wav;base64,…"},"role":"reference_audio"}
  ]
  ```

- **Limits:**
  - Duration, fps and resolution are the same as Text-to-video.
  - 2.5 edit needs `ratio: adaptive` and `duration: -1`.
  - 2.5 extend needs `ratio: adaptive` [1].
- **References per request:**

  | Model | Images | Videos | Audio clips | Total |
  |---|---|---|---|---|
  | 2.5 | 30 | 10 | 10 | 50 |
  | 2.5 flash | 10 | 5 | 5 | 20 |
  | 2.0 series | 9 | 3 | 3 | 15 |

  Sources: [1][6]. On 2.0, audio needs at least one image or video in the same request; 2.5 accepts audio alone [1].

  Per-file limits [1][6]:
  - Image: under 30 MB.
  - Video: mp4 or mov with H.264 or H.265; 24–60 fps; at most 200 MB.
    - 2–30 s per clip and 30 s in total on 2.5; edit inputs 4–30 s.
    - 2–15 s per clip and 15 s in total on 2.0.
    - 407,696 to 8,847,360 px per frame on 2.5; 407,696 to 8,295,044 on 2.0.
  - Audio: wav or mp3; at most 15 MB.
    - 2–30 s per clip and 30 s in total on 2.5.
    - 2–15 s per clip and 15 s in total on 2.0.

  The plugin enforces every one of these except the total-asset cap. That cap follows from the per-type maximums ([seedance-client.ts](../server/src/seedance-client.ts)).
- **Identity:**
  - **Vendor binding.** No field binds identity. The prompt names each asset by type and upload order: "the index is the asset's position in the request body" [12].
    - The guide recommends uploading subjects in the order they first appear [8].
  - **Real faces.** 2.x refuses directly uploaded real faces [1]. The vendor accepts three routes [11]:
    1. Preset digital characters.
    2. Trusted originals from the same account within 30 days: Seedance 2.x face videos, their last frames, and Seedream 5.0 images.
    3. Authorized real-person assets in a `LivenessFace` group created through H5 identity verification [14].
  - **Registered portraits (`modelark_portrait_register`).** The tool registers a character sheet panel (default `face`) in the private portrait library ([tools.ts](../server/src/tools.ts), [modelark-assets.ts](../server/src/modelark-assets.ts)).
    - Group type: `AIGC` for an original character, or `LivenessFace` with a consent-verified group ID for a real person.
    - The tool signs each control-plane request with AK/SK: `POST https://ark.ap-southeast-1.byteplusapi.com/?Action=…&Version=2024-01-01`.
    - Calls in order: `CreateAssetGroup` (AIGC), `CreateAsset` with `{Name, URL, AssetType:"Image", GroupId}`, then `GetAsset` until `Active` [13].
    - The receipt is written into the character sheet.
    - The video request then carries `asset://<id>` in that image slot.
  - **Plugin slot checks.** Planning binds each cast face and body panel to its `referenceImagePaths` slot by file identity, never by position ([seedance-bindings.ts](../server/src/seedance-bindings.ts)).
    - The asset ID, group, scope and sha256 are pinned in `characterBindings`.
    - A visible face without a registered portrait fails with `modelark_asset_sheet_required`.
    - Execution re-verifies the asset and checks the serialized body slot by slot ([seedance-client.ts](../server/src/seedance-client.ts)).
    - `asset://` requires the Singapore inference host.
  - **Slot order:**
    1. The caller's authored images.
    2. Cast panels: face, then body view.
    3. The shot's start image last, as an unpinned `reference_image` ([video-image-inputs.ts](../server/src/video-image-inputs.ts)).
  - **Reviewed Seedance originals.** A character's `faceTaskId` with a passed cast review becomes `referenceVideoTaskIds`. The planner appends "Use @Video N only for <character> facial identity…" on 2.5, or `Video N` on 2.0 ([video-registry.ts](../server/src/video-registry.ts)).
- **Voice:**
  - **Vendor.** A voice sample is a `reference_audio` clip, and only the prompt ties it to a person.
    - The 2.0 pattern is `"Character" says: "lines", voice timbre references "Audio n"` [7].
    - The 2.5 pattern is "Image 1 depicts the protagonist John and uses the voice timbre from Audio 1" [8].
    - The vendor sets no limit on speakers, only on clip counts.
    - The 2.5 guide recommends 1–5 subjects referenced by audio or video, with 5–10 s samples [8].
  - **Plugin.**
    - Each speaker's pinned sample is appended to `referenceAudioPaths`. Its position there is the speaker's `Audio N` ([video-voice.ts](../server/src/video-voice.ts)).
    - The speaker's images come only from `voiceReference.imagePaths`.
    - Each turn is written as `Turn N: @Image k (Name) speaks using @Audio m … @Audio m (@Image k): "line"`.
    - Speakers per render are capped at 10 (2.5), 5 (flash) or 3 (2.0), equal to the clip maximums. That cap is the plugin's reading, not a vendor limit ([video-registry.ts](../server/src/video-registry.ts)).
    - A speaker without a pinned sample fails with `character_voice_required`.
- **First frame with references:** not allowed. First frame, first and last frames, and omni reference "cannot be mixed" [1].
  - The vendor's workaround is to name an image as the opening frame in the prompt [1].
  - The 2.5 guide adds "Use Images X to X in order as keyframes" [8].
  - The plugin refuses a frame plan combined with video references ([video-image-inputs.ts](../server/src/video-image-inputs.ts)).
- **Prompt labels:**
  - Plugin: `Image N`, `Video N`, `Audio N` on 2.0 and `@Image N`, `@Video N`, `@Audio N` on 2.5 ([scene-prompt-profile.ts](../server/src/scene-prompt-profile.ts)).
  - Vendor: the 2.5 tutorial uses `@Image 1` [6]. The guides also use `Image 1`, `[Image 1]` and `<Image 1>`, and the 2.0 guide uses `@Image 1` too [8][9].
  - So the split by version is a plugin convention.
  - Dialogue: the API reference recommends double quotes [1]. Both prompt guides put dialogue in `{…}` [6][9].
  - A reference video must be named `Video 1` in the prompt ([seedance-client.ts](../server/src/seedance-client.ts)).
- **Plugin vs vendor:**
  - The plugin accepts audio only as local base64. The vendor also takes audio by URL and `asset://` [1].
  - The plugin's English-only check does not treat `{…}` as quotes. Non-Latin dialogue written in the vendor's brace style would be refused. This is read from the regex and was not run ([prompt-language.ts](../server/src/prompt-language.ts)).
  - The mp3 data URI label `audio/mp3` is unverified against a live call ([seedance-client.ts](../server/src/seedance-client.ts)).

#### Edit and extend

- **Plugin:** `seedance_reference` with `omniReferenceTaskType`.
  - The plugin mirrors the vendor rules: `edit` needs a reference video, `ratio: adaptive` and `durationSeconds: -1`; `extend` needs a reference video and `ratio: adaptive` ([seedance-client.ts](../server/src/seedance-client.ts)).
- **Vendor:** the task-type field is 2.5 only, but 2.0 also edits and extends from the prompt [1][3].
  - Under `auto`, a task-type error arrives asynchronously as `InvalidParameter.TaskTypeConstraint`.
  - A mismatch between the declared type and the prompt fails with `InvalidParameter.TaskTypeMismatch` [6].
  - 2.0 can join up to 3 clips into one video [7].

#### Draft and other options

The vendor offers these; the plugin does not expose them [1]:
- `draft: true` (480p, 2.5 only), then `content[{type:"draft_task", draft_task:{id}}]` for the final video.
- `output_format: "mov"` (2.5 series).
- `return_last_frame`, which adds `content.last_frame_url`.
- `callback_url`.
- `execution_expires_after`: 3600–259200 s, default 172800.
- `priority`: 0–9.
- `safety_identifier`: at most 64 characters.

### Gaps and differences

- **Vendor offers, plugin does not expose:**
  - Draft mode, MOV output, last-frame return, callback, expiry, priority and `safety_identifier` [1].
  - The edit and extend task type on 2.0 (prompt only) [3].
  - Audio and video assets (`AssetType` `Video`/`Audio`) and audio by URL or `asset://` [13][1].
  - tiff, heic and heif images [1].
  - Volcengine `doubao-` model IDs [15].
  - Seedance 1.0 pro and pro fast [3].
- **Mismatches still open:**
  - Trusted Seedance originals accept tasks up to 30 days old and re-read `content.video_url` from the task ([seedance-client.ts](../server/src/seedance-client.ts)). The URL lasts 24 h and the task ID 7 days [2]. A face original more than a day old probably cannot be fetched this way.
  - `{…}` dialogue from the vendor guides fails the English-only check when the text inside is non-Latin.
  - The `seedance_text2video` and `seedance_img2video` prompt descriptions forbid timecodes on every model ([tools.ts](../server/src/tools.ts)). The 2.5 guide supports whole-second timestamps; 2.0 responds only to shot numbers [8].
  - The code comment that "Seedance 2.5 added the @ prefix" is contradicted by the 2.0 guide's own `@Image 1` examples [9].
  - Defaults for `generate_audio`, `duration` (2.5) and text-to-video `ratio` differ from the vendor's on purpose [1].
- **Unverified:**
  - `GET /models` for a live account. No ModelArk key was present on the survey machine.
  - Whether `reference_audio` keeps an input track as it was.
  - The `audio/mp3` data URI label.
  - How many distinct speakers one render keeps apart.

### Sources

1. [Create a video generation task](https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api) — fetched 2026-11-25
2. [Retrieve a video generation task](https://docs.byteplus.com/en/docs/modelark/get-video-generation-task-api) — fetched 2026-11-25
3. [Model list](https://docs.byteplus.com/en/docs/ModelArk/model-list) — fetched 2026-11-25
4. [Model release announcement](https://docs.byteplus.com/en/docs/modelark/model-release-announcement) — fetched 2026-11-25
5. [Model deprecation notice](https://docs.byteplus.com/en/docs/modelark/model-deprecation-notice) — fetched 2026-11-25
6. [Dreamina Seedance 2.5 series tutorial](https://docs.byteplus.com/en/docs/ModelArk/seedance-2-5) — fetched 2026-11-25
7. [Dreamina Seedance 2.0 series tutorial](https://docs.byteplus.com/en/docs/ModelArk/seedance-2-0) — fetched 2026-11-25
8. [Dreamina Seedance 2.5 series prompt guide](https://docs.byteplus.com/en/docs/ModelArk/seedance-2-5-prompt-guide) — fetched 2026-11-25
9. [Dreamina Seedance 2.0 series prompt guide](https://docs.byteplus.com/en/docs/ModelArk/seedance-2-0-prompt-guide) — fetched 2026-11-25
10. [Video generation tutorial](https://docs.byteplus.com/en/docs/ModelArk/video-generation-tutorial) — fetched 2026-11-25
11. [Create portrait videos with Dreamina Seedance models](https://docs.byteplus.com/en/docs/ModelArk/seedance-portrait-asset-guide) — fetched 2026-11-25
12. [Private virtual avatar library guide](https://docs.byteplus.com/en/docs/modelark/private-virtual-avatar-library-guide-preview) — fetched 2026-11-25
13. [CreateAsset API](https://docs.byteplus.com/en/docs/modelark/create-asset-api) — fetched 2026-11-25
14. [Real-person portrait assets](https://docs.byteplus.com/en/docs/modelark/guide-preview) — fetched 2026-11-25
15. [Volcengine Ark model list (zh)](https://docs.volcengine.com/docs/ark/model-list?lang=zh) — fetched 2026-11-25
16. [Volcengine Ark release announcement (zh)](https://docs.volcengine.com/docs/ark/model-release-announcement?lang=zh) — fetched 2026-11-25

Code: [`seedance-client.ts`](../server/src/seedance-client.ts), [`seedance-bindings.ts`](../server/src/seedance-bindings.ts), [`video-registry.ts`](../server/src/video-registry.ts), [`scene-prompt-profile.ts`](../server/src/scene-prompt-profile.ts), [`video-voice.ts`](../server/src/video-voice.ts), [`video-image-inputs.ts`](../server/src/video-image-inputs.ts), [`modelark-assets.ts`](../server/src/modelark-assets.ts), [`tools.ts`](../server/src/tools.ts), [`config.ts`](../server/src/config.ts), [`prompt-language.ts`](../server/src/prompt-language.ts), [`media-utils.ts`](../server/src/media-utils.ts)

## MiniMax hosted video (MiniMax Open Platform)

MiniMax H3 is MiniMax's video model. It is offered on the MiniMax Open Platform as a pay-as-you-go API [1][7].
The saved selection is `{engine:"minimax"}` with deployment `minimax-open-platform-v2`, for example
`{engine:"minimax", model:"MiniMax-H3", resolution:"768P", operation:"reference"}`
([video-registry.ts](../server/src/video-registry.ts)). The status is current. The plugin calls only
the V2 (H3) API; the V1 Hailuo API is a legacy surface the plugin does not call. The credential is
`MINIMAX_API_KEY` ([config.ts](../server/src/config.ts)).

### Models

| Model ID | In plugin | Notes |
|---|---|---|
| `MiniMax-H3` | yes | Flagship. 480P, 768P or 2K; 4–15 s [1]. The 480P tier is served by RunningHub and billed as "MiniMax-H3-RH" [7]. The plugin allows only 768P and 2K. |
| `MiniMax-H3-Highspeed` | yes | Flagship. 480P or 768P; 4–15 s [1]. |
| `MiniMax-H3-Lite` | yes | Flagship. 480P or 768P; 4–15 s. A reference request needs a concrete ratio [1]. |
| `MiniMax-H3-Max` | yes | Extended model (provider fal [7]). 480P or 768P; 5–15 s. Takes `extra.prompt_expansion_mode` [1]. |
| `MiniMax-H3-Max-Turbo` | no | Extended model (fal). "A faster, lower-cost version of Max". 480P or 768P; 5–15 s; takes `extra` [1][7]. |
| `MiniMax-H3-MG` | no | Extended model (MachGen). 768P or 2K; 4–15 s [1][7]. |
| `MiniMax-H3-NC` | no | Extended model (Nunchux AI, "H3 Fast"). 480P or 768P; 4–15 s. A reference request needs a concrete ratio [1][7]. |
| `MiniMax-Hailuo-2.3`, `MiniMax-Hailuo-2.3-Fast`, `MiniMax-Hailuo-02` | no | Legacy V1 models. 2.3-Fast is image-to-video only. Output is 6 or 10 s at 768P, or 6 s at 1080P; 02 adds 512P [11][12][13][17]. |
| `T2V-01`, `T2V-01-Director`, `I2V-01`, `I2V-01-Director`, `I2V-01-live` | no | Legacy V1 models at 720P with a 6 s default [11][12]. |
| `S2V-01` | no | Legacy V1 face (subject) reference [14]. |

MiniMax's own pages disagree about `MiniMax-H3` at 480P. The create page and the price list allow
it [1][7]. The video guide, the models page and the China-region page still list only 768P and 2K
[6][17][16]. 1080P exists only on the V1 Hailuo models. No V2 model renders 1080P [1].

### Calling it

- **Submit:** `POST https://api.minimax.io/v2/video_generation` with `Authorization: Bearer <key>`.
  The response is `{"task_id": "…"}` [1].
- **Poll:** `GET /v2/query/video_generation/{task_id}` returns `task.status`, one of `queued`,
  `running`, `succeeded`, `failed` or `cancelled`. A failure carries `task.error {code, message}`.
  Only tasks from the last 7 days can be queried [2]. MiniMax recommends polling every 10 s [6].
- **Result:** `task.content.url`, which is time-limited. The exact lifetime is unverified [2].
  `task.usage` reports billed seconds and the input image count [2].
- **Plugin:** the submit timeout is 5 min. The plugin polls every 10 s, up to 180 times (30 min). It
  accepts both the `task` and the `flat` response shape. After a timeout it asks for
  `video_status` reconcile and never resubmits ([minimax-video.ts](../server/src/minimax-video.ts),
  [vendor-video.ts](../server/src/vendor-video.ts)). A 4xx answer is terminal except 408, 409, 425
  and 429.
- **Other endpoints the plugin does not call:**
  - list: `GET /v2/query/video_generation?page_num&page_size&filter.*` [3]
  - cancel or delete: `DELETE /v2/video_generation/{task_id}`. Only a `queued` task can be
    cancelled, and cancelling it costs nothing [4].
  - `callback_url`, which must echo a challenge within 3 s [1]
- **China region:** `platform.minimaxi.com` redirects to `platform.minimax.cn`, whose API host is
  `api.minimax.cn` [16]. The plugin uses only `api.minimax.io`.

```json
{ "model": "MiniMax-H3",
  "content": [ {"type": "text", "text": "…"},
               {"type": "image_url", "image_url": {"url": "data:image/png;base64,…"}, "role": "first_frame"} ],
  "resolution": "768P", "duration": 5, "ratio": "adaptive", "generate_audio": true }
```

Rules that apply to every V2 request [1][6]:
- One non-empty `text` item is required. It holds at most 7,000 characters.
- `duration` is a whole number from 4 to 15 (5–15 on Max and Max-Turbo).
- fps cannot be set; output is 24 fps with 32 kHz stereo sound [9].
- There is no `seed` and no negative prompt.
- `generate_audio` is optional and defaults to `true`; `false` returns a silent clip.
- A media item is a public URL, `mm_file://{file_id}` or a lowercase `data:` URI.
- The request body may be at most 64 MB.

### Operations

| Operation | Vendor | Plugin tool |
|---|---|---|
| Text-to-video | yes | not exposed |
| Image-to-video (first, first+last, last only) | yes | `minimax_img2video` (first or first+last) |
| Audio-to-video (supplied track) | no dedicated mode | not exposed |
| Reference (character consistency) | yes | `minimax_reference` |
| Prompt rewrite (H3-Context-IR) | yes | not exposed |
| 768P → 2K regeneration | yes | not exposed |
| Subject (face) reference, V1 `S2V-01` | yes (legacy) | not exposed |

#### Text-to-video

The vendor offers this; the plugin does not expose it. The request content is a single `text` item.
`ratio` is required and cannot be `adaptive` [1]. All seven V2 models support it [1][7].

#### Image-to-video

- **Plugin input** (`minimax_img2video`, [minimax-video.ts](../server/src/minimax-video.ts)):
  - `prompt`: string, 1–7000.
  - `model`: one of the four IDs; default `MiniMax-H3`.
  - `resolution`: `480P`, `768P` or `2K`; default `768P`. Checked per model: `MiniMax-H3` allows
    `768P`/`2K`, the others `480P`/`768P`.
  - `durationSeconds`: int, 4–15, default 5; Max needs at least 5.
  - `generateAudio`: optional boolean.
  - `sourceImagePath`: required; PNG, JPEG or WEBP.
  - `lastImagePath`: optional.
  - There is no `ratio` field; the vendor ignores `ratio` on this operation anyway [1].
- **Wire request:** `POST /v2/video_generation`
  ```json
  { "model": "MiniMax-H3", "content": [ {"type":"text","text":"…"},
      {"type":"image_url","image_url":{"url":"data:image/png;base64,…"},"role":"first_frame"},
      {"type":"image_url","image_url":{"url":"data:…"},"role":"last_frame"} ],
    "resolution": "768P", "duration": 5, "generate_audio": false }
  ```
  - `generate_audio` is sent only when `generateAudio` is set.
  - On `MiniMax-H3-Max` the body adds `"extra": {"prompt_expansion_mode": "disabled"}`.
  - For a shot with no lines the planner sends `generateAudio`. It is `false` when the shot's sound
    source is speech (an external voiceover track) or its sound direction reads `silent`.
    Otherwise it is `true`, so the clip keeps its scene sound
    ([video-routing.ts](../server/src/video-routing.ts)).
- **Limits** [1][6]:
  - One first frame and one last frame.
  - Each image is JPG, JPEG, PNG, WEBP, HEIC or HEIF, at most 30 MB, 256–5760 px per side, with an
    aspect ratio (w/h) of 0.4–2.5.
  - The image sets the output ratio.
  - Durations, resolutions and the audio switch are as above.
- **Plugin vs vendor:**
  - The vendor's content rules allow a last frame alone. Its own `role` description says a last frame
    "must be paired with first_frame" [1]. The plugin requires a first frame either way.
  - The plugin sends images only as inline data URIs (30 MiB per file on disk). It does not accept
    HEIC/HEIF, URLs or `mm_file://`.
  - The plugin does not check pixel size or aspect ratio. The vendor rejects bad images with 400
    after the POST; that answer is terminal and no job is created.
  - The plugin refuses spoken cuts on this tool: its voice lane is `none` and dialogue is refused
    (`video_catalog`).

#### Audio-to-video

The vendor does not offer this as a mode. V2 has no field for a full soundtrack that drives the
clip. Audio enters only as `reference_audio` in a reference request: at most 3 clips, 2–15 s each,
15 s in total [1]. The H3 reference prompt guide defines a `fully_copy` marker, "the complete source
audio serves as the target video's complete final audio track" [10]. Whether the hosted API honours
it is unverified. The plugin exposes no audio-to-video route. `minimax_reference` reports
`suppliedSpeech: "unsupported"` and `exactAudioPreservation: false`
([video-registry.ts](../server/src/video-registry.ts)).

#### Reference

- **Plugin input** (`minimax_reference`):
  - the common fields above, including `generateAudio`
  - `ratio`: `adaptive`, `21:9`, `16:9`, `4:3`, `1:1`, `3:4` or `9:16`; default `adaptive`. Lite
    refuses `adaptive`.
  - `referenceImagePaths`: 1–9, required.
  - `referenceAudioPaths`: 0–3 WAV or MP3 files, default `[]`.
  - The planner uses it only for shots in which a character speaks. Silent and voiceover shots are
    refused with `reference_speech_route` ([video-routing.ts](../server/src/video-routing.ts)).
- **Wire request:** `POST /v2/video_generation`
  ```json
  { "model": "MiniMax-H3", "content": [ {"type":"text","text":"…"},
      {"type":"image_url","image_url":{"url":"data:…"},"role":"reference_image"},
      {"type":"audio_url","audio_url":{"url":"data:audio/wav;base64,…"},"role":"reference_audio"} ],
    "resolution": "768P", "duration": 6, "ratio": "9:16" }
  ```
  Pictures go first, then audio. Before submitting, the plugin reads each sample's length with
  `ffprobe`: 2–15 s each and at most 15 s in total. A file over 15 MiB is refused
  ([minimax-video.ts](../server/src/minimax-video.ts)).
- **Limits:** duration, resolution, fps, the prompt limit and `generate_audio` are as in
  Calling it, above. `MiniMax-H3-Lite` and `MiniMax-H3-NC` need a concrete ratio [1].
- **References per request** [1][6][9]:
  - Images: at most 9; 30 MB each, 256–5760 px, aspect ratio 0.4–2.5.
  - Videos: at most 3; MP4 or MOV, H.264 or H.265, at most 50 MB each, 2–15 s each, at most 15 s in
    total, 23.976–60 fps.
  - Audio: at most 3; WAV or MP3, at most 15 MB each, 2–15 s each, at most 15 s in total.
  - All files together: at most 12.
  - The create page gives one table for every model. No per-model reference counts are documented.
- **Identity:** no identity field exists. A `reference_image` is tied to a character only by
  prompt text [1].
  - The planner sends the cast's sheet panels in cast order with the background picture left out.
    The shot's start image goes last.
  - It adds an "Image reference roles:" block that names each picture's role.
  - The standalone MSR adapter refuses more than two referenced characters (`msr_character_limit`); a GenAI scene references only its speakers
    ([video-image-inputs.ts](../server/src/video-image-inputs.ts)).
- **Voice:** a `reference_audio` clip is tied to a speaker only by prompt text.
  - MiniMax's API example reads "Voice timbre follows reference audio 1" [1].
  - The H3 guide writes `<Audio 1> is the voice-timbre reference for <Subject 1> (S1).` [10].
  - The plugin writes "<Name> (speaker <id>), shown in reference image i, uses reference audio k for
    voice timbre and accent only. Speak the authored shot dialogue, not the sample's words."
    ([video-voice.ts](../server/src/video-voice.ts)).
  - At most three sampled speakers fit in one render (`maxPinnedVoicesPerRender: 3`).
  - MiniMax states no limit on speakers and no claim of voice consistency across renders.
- **First frame with references:** not allowed. "Image-to-video and reference-to-video are
  mutually exclusive" [1]. The plugin sends the start image as the last `reference_image`, so the
  opening frame is not pinned.
- **Prompt labels:**
  - The plugin writes `reference image N` and `reference audio N`
    ([scene-prompt-profile.ts](../server/src/scene-prompt-profile.ts)).
  - MiniMax documents three styles:
    - plain ordinals in the API examples ("reference images 1 and 2", "reference video 1") [6]
    - "Image 1: …" in the feature gallery [8]
    - `<Subject N>`, `<Picture N>`, `<Video N>` and `<Audio N>` in the guide, with speaker IDs `(S1)`
      and dialogue in `<d>[Language] …</d>` [10][19]. Video and audio labels are numbered
      separately.
- **Plugin vs vendor:**
  - The plugin sends no `reference_video` (the vendor allows 3).
  - Spoken shots are capped at two characters, while three voice samples are allowed.
  - The plugin blocks `adaptive` on Lite but not on NC. NC is not in the plugin.
  - MP3 is sent as `data:audio/mpeg`. MiniMax asks for `data:audio/<format>` [1]. Whether `mpeg` is
    accepted is unverified.

#### Other operations

- **H3-Context-IR:** `POST /v2/h3_context_ir` [5]. The model is `MiniMax-H3` only. The `content`
  and `ratio` rules match the create endpoint, and `duration` is 4–15. The result is a rewritten
  prompt in `content.prompt` with `task_type=h3_context_ir` [2]. The model card "strongly
  recommend[s]" it [9]. The vendor offers this; the plugin does not expose it.
- **Regeneration to 2K:** `POST /v2/video_regeneration` with `model` `MiniMax-H3` and
  `resolution` `2K` only [18]. The input is either `source_task_id` (whitelisted accounts only) or a
  `content` list holding one `role:"base_video"`. A `base_video` must have a sound track, run at
  24 fps, have sides divisible by 32, cover 589,824–1,032,192 px and hold 107–362 frames in steps of
  17. The `text` limit is 40,000. `generate_audio` and `aigc_watermark` (default `false`) are
  available [18]. The vendor offers this; the plugin does not expose it.
- **Extend, keyframes, retake and edit:** there are no endpoints. Editing and continuation are
  reference tasks described in the prompt, using `reference_video` [6][10].
- **V1 legacy:**
  - `POST /v1/video_generation` takes `prompt` (up to 2,000 characters, with 15 bracket camera
    commands such as `[Pan left]`), `first_frame_image`, `last_frame_image` (`MiniMax-Hailuo-02`
    only) and `prompt_optimizer` [11][12][13].
  - `S2V-01` takes `subject_reference: [{type:"character", image:[<one image>]}]`. The image must be
    under 20 MB with a short side over 300 px [14].
  - Poll with `GET /v1/query/video_generation?task_id=`. The status is `Preparing`, `Queueing`,
    `Processing`, `Success` or `Fail`, and a finished task carries a `file_id` [15].
  - Fetch the file with `GET /v1/files/retrieve?file_id=`; its `download_url` is valid for 1 hour
    [15].
  - The limit is 20 RPM [20].
  - The vendor offers all of this; the plugin does not expose it.

### Gaps and differences

- **Vendor offers, plugin does not expose:**
  - text-to-video and last-frame-only image-to-video
  - `reference_video`
  - URL and `mm_file://` inputs, plus the 7-day upload `POST /v1/files/upload` [21]
  - HEIC/HEIF images
  - `callback_url` and `response_format`
  - list and cancel
  - Context-IR and 2K regeneration
  - Max-Turbo, MG and NC
  - all V1 models
  - the China-region host
- **Mismatches still open:**
  - The plugin refuses `MiniMax-H3` at 480P, which the create page and the price list allow [1][7].
  - The model list has 4 of the 7 V2 IDs. `prices.tsv` has no H3 480P, Max-Turbo, MG or NC rates.
  - The reference lane caps characters at 2 but advertises 3 pinned voices. MiniMax documents no
    character limit.
  - The `extra.prompt_expansion_mode` rule covers Max only. MiniMax applies it to Max-Turbo too.
  - The no-`adaptive` check covers Lite only. MiniMax lists NC too.
  - Image pixel size and aspect ratio are not checked before submission.
- **Unverified:**
  - the 2K pixel size and the lifetime of `content.url`
  - rate limits for any model other than `MiniMax-H3`, which is 300 RPM with 30 in flight [20]
  - whether hosted reference requests accept audio without a picture
  - whether `fully_copy` works on the hosted API
  - whether `data:audio/mpeg` is accepted
  - voice consistency across renders
  - live API behaviour: no key was available, so no read-only request was made

### Sources

1. [Create Video Generation Task (V2)](https://platform.minimax.io/docs/api-reference/video-generation-v2-create.md) — fetched 2026-11-25
2. [Query Task (V2)](https://platform.minimax.io/docs/api-reference/video-generation-v2-query.md) — fetched 2026-11-25
3. [List Tasks (V2)](https://platform.minimax.io/docs/api-reference/video-generation-v2-list.md) — fetched 2026-11-25
4. [Cancel or Delete Task (V2)](https://platform.minimax.io/docs/api-reference/video-generation-v2-delete.md) — fetched 2026-11-25
5. [Create H3-Context-IR Task](https://platform.minimax.io/docs/api-reference/video-generation-v2-h3-context-ir.md) — fetched 2026-11-25
6. [Video Generation guide](https://platform.minimax.io/docs/guides/video-generation.md) — fetched 2026-11-25
7. [Pricing overview](https://platform.minimax.io/docs/pricing/overview.md) — fetched 2026-11-25
8. [H3 Feature Highlights](https://platform.minimax.io/docs/guides/video-prompt.md) — fetched 2026-11-25
9. [MiniMax-H3 model card](https://huggingface.co/MiniMaxAI/MiniMax-H3) — fetched 2026-11-25
10. [H3 reference prompt writing guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md) — fetched 2026-11-25
11. [V1 Text-to-Video](https://platform.minimax.io/docs/api-reference/video-generation-t2v.md) — fetched 2026-11-25
12. [V1 Image-to-Video](https://platform.minimax.io/docs/api-reference/video-generation-i2v.md) — fetched 2026-11-25
13. [V1 First & Last Frame](https://platform.minimax.io/docs/api-reference/video-generation-fl2v.md) — fetched 2026-11-25
14. [V1 Subject-Reference to Video](https://platform.minimax.io/docs/api-reference/video-generation-s2v.md) — fetched 2026-11-25
15. [V1 Query](https://platform.minimax.io/docs/api-reference/video-generation-query.md) and [V1 Video Download](https://platform.minimax.io/docs/api-reference/video-generation-download.md) — fetched 2026-11-25
16. [China-region V2 create](https://platform.minimaxi.com/docs/api-reference/video-generation-v2-create.md) (redirects to platform.minimax.cn) — fetched 2026-11-25
17. [Models](https://platform.minimax.io/docs/guides/models-intro.md) — fetched 2026-11-25
18. [Create Video Regeneration Task](https://platform.minimax.io/docs/api-reference/video-generation-v2-regeneration.md) — fetched 2026-11-25
19. [H3 base prompt writing guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md) — fetched 2026-11-25
20. [Rate limits](https://platform.minimax.io/docs/guides/rate-limits.md) — fetched 2026-11-25
21. [Upload File](https://platform.minimax.io/docs/api-reference/file-management-upload.md) — fetched 2026-11-25

Code: [`minimax-video.ts`](../server/src/minimax-video.ts), [`vendor-video.ts`](../server/src/vendor-video.ts),
[`video-registry.ts`](../server/src/video-registry.ts), [`video-routing.ts`](../server/src/video-routing.ts),
[`video-image-inputs.ts`](../server/src/video-image-inputs.ts), [`video-voice.ts`](../server/src/video-voice.ts),
[`scene-prompt-profile.ts`](../server/src/scene-prompt-profile.ts), [`config.ts`](../server/src/config.ts)

## HeyGen

HeyGen Video 1 (`heygen-video-1`) is HeyGen's prompt-to-video model, built on MiniMax H3 and post-trained by HeyGen [1]. It renders picture and sound in one call. The plugin calls it through the common hosted-vendor layer as deployment `heygen-v3` ([video-registry.ts](../server/src/video-registry.ts)). The saved selection is `{engine:"heygen", model:"heygen-video-1", resolution:"768p", operation:"reference"}` ([model-settings.md](../skills/_shared/model-settings.md)). Status: current. Credential: `HEYGEN_API_KEY`.

### Models

| Model ID | In plugin | Notes |
| - | - | - |
| `heygen-video-1` | yes | Video 1 on `POST /v3/models/videos`. The only model this endpoint accepts [2]. GA. |
| `heygen_video_1` (Cinematic Avatar) | no | The same model reached through `POST /v3/videos` `type:"cinematic_avatar"`. Casts owned avatar looks with their linked voices [8]. |
| `heygen-avatar-6`, `heygen-avatar-6-turbo` | no | Avatar 6 on `POST /v3/models/avatars`. Animates a photo or video with supplied speech [9]. |
| Avatar IV / V / III engines | no | Engines on `POST /v3/videos` that animate an avatar look or a photo. Avatar IV is the default [7][10]. |

### Calling it

- Every local file is uploaded first with `POST https://api.heygen.com/v3/assets` (multipart field `file`). The returned `data.asset_id` is passed as `{type:"asset_id", asset_id}` ([heygen-video.ts](../server/src/heygen-video.ts)).
- An asset ID does not expire [4]. The vendor also accepts `url` and `base64` inputs [1]; the plugin never sends them.
- Submit: `POST /v3/models/videos` with header `x-api-key`. The answer is `202` with `data.video_id` and `status:"pending"` [2]. The plugin waits up to 5 minutes for that answer.
- Poll: `GET /v3/models/videos/{video_id}` [3]. Statuses are `pending`, `processing`, `completed`, `failed` and `cancelled`. On failure the record carries `failure_code`, one of `generation_failed`, `generation_cancelled` or `usage_limit_reached`, with `failure_message` [3].
- The plugin polls every 5 s, up to 360 times (30 minutes) ([heygen-video.ts](../server/src/heygen-video.ts)). A job still running after that is reported and never resubmitted ([vendor-video.ts](../server/src/vendor-video.ts)).
- Result: `data.video_url` is a signed link, and a new poll returns a fresh one [1][3]. Its lifetime is unverified.
- Retries: the vendor takes an optional `Idempotency-Key` header. A repeat with the same key within 24 hours replays the original answer, and a repeat while the original is in flight returns `409` [2]. The plugin sends no key.

```json
{"model":"heygen-video-1","mode":"image_to_video|reference_to_video","prompt":"…",
 "prompt_enhancement":"disabled","resolution":"768p","duration":5,"seed":42}
```

Shared rules:
- The schema is strict: unknown fields are rejected, and a field from another mode returns `400` when it carries a value [1][2].
- `prompt_enhancement` is `turbo`, `quality` (default), `ultraquality` or `disabled`. `disabled` keeps the text as written [1][2]. The plugin always sends `disabled` ([heygen-video.ts](../server/src/heygen-video.ts)).
- Output is MP4 H.264 at 24 fps, rounded up to the next whole frame ("a 7-second request encodes 175 frames"). Audio is AAC, 32 kHz stereo [1].
- There is no field that turns audio off. The prompt directs the sound: write `no music`, and leave out dialogue you do not want [1][2].

### Operations

| Operation | Vendor | Plugin tool |
| - | - | - |
| Text-to-video | yes | not exposed |
| Image-to-video (first frame, optional end image) | yes | `heygen_img2video` |
| Audio-to-video (supplied track) | not on Video 1; yes on Avatar 6, Talking Photo and Lipsync | not exposed |
| Reference (character consistency) | yes | `heygen_reference` |
| Cinematic Avatar | yes | not exposed |
| Keyframes, extend, retake, control | no | — |

#### Text-to-video

The vendor offers this; the plugin does not expose it.

- **Wire request** — `POST /v3/models/videos` `{mode:"text_to_video", model, prompt, aspect_ratio, resolution, duration, seed}` [2].
- **Limits**
  - Ratio: `aspect_ratio` is `21:9`, `16:9` (default), `4:3`, `1:1`, `3:4` or `9:16`. There is no `adaptive` [2].
  - Duration: 5–30 s or `"auto"` with `turbo` or `quality`, and 5–15 s with `disabled` or `ultraquality` [1].
  - Prompt: 16,000 characters [2].
- **Voice** — no voice-sample input. The model picks a voice for each generation.

#### Image-to-video

- **Plugin input**
  - `heygen_img2video` takes `prompt` (1–16,000), `resolution` (`480p` | `768p`, default `768p`) and `durationSeconds` (integer 5–15, default 5).
  - It also takes `seed` (0–4,294,967,295, optional), `sourceImagePath` (required) and `lastImagePath` (optional) ([heygen-video.ts](../server/src/heygen-video.ts)).
  - The voice lane is `none`, so spoken cuts are refused with `voice_lane_required` ([video-registry.ts](../server/src/video-registry.ts), [video-voice.ts](../server/src/video-voice.ts)).
- **Wire request** — `POST /v3/models/videos`:
  ```json
  {"mode":"image_to_video","model":"heygen-video-1","prompt":"…","prompt_enhancement":"disabled",
   "resolution":"768p","duration":5,"image":{"type":"asset_id","asset_id":"…"},
   "end_image":{"type":"asset_id","asset_id":"…"}}
  ```
- **Limits**
  - First and last frame: `image` is the literal first frame, and its EXIF orientation is followed. `end_image` guides the last frame and requires `image` [1][2].
  - Ratio: the output always follows `image`. A supplied `aspect_ratio` is ignored [2].
  - Duration: 5–30 s with `turbo` or `quality`; 5–15 s with `disabled` [1].
  - Resolution: `480p`, `768p`, `1080p` or `2k` [2].
  - Native audio is always on, with no control field [1].
- **Plugin vs vendor**
  - The plugin offers only `480p` and `768p`. Its code comment says `1080p` and `2k` have no published standard price ([heygen-video.ts](../server/src/heygen-video.ts)). The help center lists those prices as "—" after the promotion [13].
  - The plugin caps duration at 15 s. That matches the vendor's limit for the `disabled` enhancement the plugin sends [1].
  - A silent shot gets a closed-mouth, no-speech sentence in its prompt. There is no audio toggle to send ([video-routing.ts](../server/src/video-routing.ts)).

#### Audio-to-video

Video 1 has no supplied-track mode in HeyGen's official documents. One secondary source says a `reference_audio` clip becomes the clip's soundtrack when the prompt says "his speech is `<Audio 1>`, word for word" [14]. This is unverified with HeyGen.

The vendor offers supplied-speech rendering on other endpoints; the plugin does not expose any of them:

- **Avatar 6** — `POST /v3/models/avatars`, then poll `GET /v3/models/videos/{id}`. Fields [9]:
  - `model` is `heygen-avatar-6` or `heygen-avatar-6-turbo`.
  - `reference_images` takes one image and `reference_videos` one video of at least 2 s. A realistic-human video needs Enterprise access, else `422 realistic_human_reference_not_allowed`.
  - `audio` is required, and the video runs the length of the audio.
  - `resolution` is `1080p` (default) or `2k`, and the ratio follows the reference.
  - `motion_prompt` takes up to 1,200 characters, and `motion_expressiveness` is `default` or `less`.
- **Talking Photo (Avatar IV)** — `POST /v3/videos` `type:"image"`. It takes `image` plus either `script` with `voice_id`, or `audio_url`, or `audio_asset_id` [10][11].
  - The image needs a detectable human-like face, or the call returns `400` [10].
  - Resolution is `720p` or `1080p` [10].
  - Audio is MP3 or WAV up to 32 MB, and up to 30 minutes per request [11].
- **Avatar video from audio** — `POST /v3/videos` `type:"avatar"` with `audio_url` or `audio_asset_id`, on an owned avatar look [11].
- **Lipsync** — `POST /v3/lipsyncs` puts new audio on an existing video [7]. This is post-render lip-sync, which the project forbids for synthesized speech.

#### Reference

- **Plugin input**
  - `heygen_reference` takes the shared fields plus `ratio` (`adaptive` default, `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16`).
  - It also takes `referenceImagePaths` (1–9, required) and `referenceAudioPaths` (0–3, default `[]`). Images plus audio may total at most 12 ([heygen-video.ts](../server/src/heygen-video.ts)).
  - Registry: voice lane `reference` with `voiceByBackend`, so the catalog reports `voiceReference:"backend_dependent"`. Up to 3 pinned voices per render ([video-registry.ts](../server/src/video-registry.ts)).
  - Only shots where a character speaks go here. Silent and voiceover shots are refused with `reference_speech_route` ([video-routing.ts](../server/src/video-routing.ts)).
- **Wire request** — `POST /v3/models/videos`:
  ```json
  {"mode":"reference_to_video","model":"heygen-video-1","prompt":"…","prompt_enhancement":"disabled",
   "resolution":"768p","duration":5,"aspect_ratio":"adaptive",
   "reference_images":[{"type":"asset_id","asset_id":"…"}],
   "reference_audio":[{"type":"asset_id","asset_id":"…"}]}
  ```
- **Limits**
  - Duration: 5–30 s with `turbo` or `quality`; 5–15 s with `disabled` or `ultraquality`. `auto` gives 8–15 s [1][6].
  - Ratio: `adaptive` follows the first reference image, else the first reference video. `adaptive` resolves only at `480p` and `768p`. `1080p` and `2k` need `16:9` or `9:16` [1][2].
  - Resolution and pixel sizes for 16:9: `480p` 832×480, `768p` 1344×768, `1080p` 1890×1080, `2k` 2688×1536 [1].
  - Prompt: 16,000 characters [2]. Native audio is always on [1].
- **References per request**
  - The vendor allows 9 images, 3 videos and 3 audio clips [2].
  - The total is 15 per the model page and the OpenAPI description [1][2], and 12 per the September 2026 changelog and the Cinematic Avatar page [6][8].
  - Reference videos share a 15-second input budget. If they exceed it, each keeps up to its first 5 s and the rest is split equally [1].
  - Upload limits for an asset are PNG or JPEG images up to 32 MB, and MP3 or WAV audio up to 50 MB [5].
  - Inline limits are 16 MB (image) or 32 MB (audio or video) by URL, and 5 MB or 16 MB as base64 [1].
  - The maximum length of an audio sample is unverified. A secondary source gives 32 MB per audio file [14].
- **Identity**
  - The vendor binds by list order only: the first `reference_images` entry is `<Picture 1>`. There is no role or slot field [1].
  - The plugin sends the cast's sheet panels first. The shot's start image follows as a `composition` reference when a slot is free ([scene-video.ts](../server/src/scene-video.ts), [video-routing.ts](../server/src/video-routing.ts)).
- **Voice**
  - HeyGen documents `reference_audio` only as "Reference audio recordings. At most three." It has no `voice_id` and no field per subject [2]. The binding lives in prompt text.
  - A secondary source shows two uses. "speaks … in the voice of `<Audio 1>`" takes pitch and timbre and ignores the sample's words. "the advisor from `<Picture 1>` in the voice of `<Audio 1>`, the client from `<Picture 2>` in the voice of `<Audio 2>`" binds two speakers [14].
  - The plugin adds each speaker's pinned sample once and links it to images only through explicit `voiceReference.imagePaths` ownership ([video-voice.ts](../server/src/video-voice.ts)).
  - It then writes: "`<name>` (speaker `<id>`), shown in `<Picture i>`, uses `<Audio k>` for voice timbre and accent only. Speak the authored shot dialogue, not the sample's words." ([video-voice.ts](../server/src/video-voice.ts)).
  - Up to 3 speakers per render.
- **First frame with references** — not allowed together. `image` and `end_image` exist only in `image_to_video`, and a field from another mode returns `400` [1][2]. The shot's start image is sent as a picture reference and is not pinned as the first frame.
- **Prompt labels**
  - The plugin writes `<Picture N>` and `<Audio N>` ([scene-prompt-profile.ts](../server/src/scene-prompt-profile.ts)).
  - HeyGen documents `<Picture N>` and `<Video N>` and says images, videos and audio are numbered independently. It never writes `<Audio N>` [1]. That form appears only in the secondary source [14].
  - Prompt enhancement does not rewrite labels [1].
- **Plugin vs vendor**
  - `reference_videos` is not exposed.
  - The plugin requires at least one image. The vendor pages disagree on whether audio alone is allowed: the model page needs an image or video [1], while the OpenAPI example and the MCP tool text allow audio only [2][7].
  - The plugin's 12-reference cap is lower than the 15 on the model page. It cannot be reached in practice, because the plugin sends at most 9 + 3.
  - The plugin's voice sentence differs from the secondary source's tested phrase "in the voice of `<Audio N>`" [14].

#### Cinematic Avatar

The vendor offers this; the plugin does not expose it.

- `POST /v3/videos` with `type:"cinematic_avatar"` and `model:"heygen_video_1"` [8].
- `avatar_id` is an array of 1–3 owned look IDs. Each look's linked voice becomes that character's voice [8].
- `prompt` takes 1–10,000 characters. Output is `16:9` or `9:16` at `720p` only, 5–15 s (default 10) [8].
- References: 3 videos, 9 images and 3 audio clips, 12 in total including the avatars [8].

### Gaps and differences

- Vendor offers, plugin does not expose:
  - Video 1 text-to-video and `reference_videos`.
  - `1080p` and `2k`, and clips of 16–30 s (these need `turbo` or `quality` enhancement).
  - Avatar 6, Talking Photo, avatar-from-audio, Lipsync and Cinematic Avatar.
- Mismatches still open:
  - `<Audio N>` and the meaning of a voice sample rest on a secondary source only. The plugin's binding sentence is untested against HeyGen [1][14].
  - The plugin sends no `Idempotency-Key`. A submit whose answer is lost cannot be replayed safely; it is left for reconciliation ([heygen-video.ts](../server/src/heygen-video.ts)).
  - The plugin accepts `.webp` images, but the simple upload lists only PNG and JPEG [5] ([heygen-video.ts](../server/src/heygen-video.ts)).
  - The prompt limit differs across HeyGen's own pages: 16,000 in the OpenAPI schema [2], 32,000 on the model page [1], 5,000 in the September changelog [6]. The plugin uses 16,000.
  - The total reference cap differs across HeyGen pages: 15 [1][2] or 12 [6][8]. The plugin uses 12.
  - Insufficient credit returns `402` in the OpenAPI schema [2] and `400` on the model page [1]. The plugin treats both as terminal.
  - A stale header comment in [heygen-video.ts](../server/src/heygen-video.ts) cites the 5 MB base64 limit. The code uploads every file instead.
- Unverified:
  - The maximum length of an audio sample.
  - Whether "word for word" keeps the recording's waveform.
  - Voice consistency across clips.
  - Korean dialogue support.
  - WebP acceptance.
  - The lifetime of `video_url`.
  - Whether `/v3/models/videos` shares the write and concurrency limits that [12] gives for `/v3/videos`.

### Sources

1. [HeyGen Video (model guide)](https://developers.heygen.com/docs/models/heygen-video.md) — fetched 2026-11-25
2. [Create HeyGen Video (OpenAPI)](https://developers.heygen.com/reference/create-heygen-video.md) — fetched 2026-11-25
3. [Get HeyGen Video (OpenAPI)](https://developers.heygen.com/reference/get-heygen-video.md) — fetched 2026-11-25
4. [Assets overview](https://developers.heygen.com/assets.md) — fetched 2026-11-25
5. [Upload assets](https://developers.heygen.com/docs/upload-assets.md) — fetched 2026-11-25
6. [Changelog](https://developers.heygen.com/changelog.md) — fetched 2026-11-25
7. [llms-full.txt (routing notes and MCP tool table)](https://developers.heygen.com/llms-full.txt) — fetched 2026-11-25
8. [Cinematic Avatar](https://developers.heygen.com/cinematic-avatar.md) — fetched 2026-11-25
9. [Avatar 6](https://developers.heygen.com/docs/models/avatar-6.md) — fetched 2026-11-25
10. [Image to Video (Talking Photo)](https://developers.heygen.com/image-to-video.md) — fetched 2026-11-25
11. [Audio to Video](https://developers.heygen.com/audio-to-video.md) — fetched 2026-11-25
12. [Usage limits](https://developers.heygen.com/docs/usage-limits.md) — fetched 2026-11-25
13. [Introducing HeyGen Video (help center pricing, updated 2026-11-09)](https://help.heygen.com/en/articles/17272995-introducing-heygen-video-generate-cinematic-clips-from-a-prompt) — fetched 2026-11-25
14. [Runware: HeyGen Video 1.0 audio references (secondary)](https://runware.ai/docs/models/heygen-video-1-0/guides/audio-references) — fetched 2026-11-25

Code: [`heygen-video.ts`](../server/src/heygen-video.ts), [`vendor-video.ts`](../server/src/vendor-video.ts), [`video-registry.ts`](../server/src/video-registry.ts), [`video-voice.ts`](../server/src/video-voice.ts), [`video-routing.ts`](../server/src/video-routing.ts), [`scene-video.ts`](../server/src/scene-video.ts), [`scene-prompt-profile.ts`](../server/src/scene-prompt-profile.ts), [`model-settings.md`](../skills/_shared/model-settings.md)

## Google Cloud Vertex AI Veo

Google Cloud Veo 3.1 is called through the Vertex AI `predictLongRunning` API. Google now calls
the product Gemini Enterprise Agent Platform. The saved selection is `{engine:"veo"}` and the
deployment is `google-cloud-us-central1`. Veo is a current hosted route
([hosted-video-routes.ts](../server/src/hosted-video-routes.ts)).

Credentials:
- `GOOGLE_CLOUD_PROJECT` names the billing project ([config.ts](../server/src/config.ts)).
- Authentication uses Google Application Default Credentials.
- `GOOGLE_OAUTH_ACCESS_TOKEN` overrides ADC when it is set ([veo-video.ts](../server/src/veo-video.ts)).

### Models

| Model ID | In plugin | Notes |
| --- | --- | --- |
| `veo-3.1-generate-001` | yes (default) | GA, released 2025-11-17, retirement "May 4, 2027 or later" [1][12]. The only model with 4K output [1]. |
| `veo-3.1-fast-generate-001` | yes | GA, released 2025-11-17, retirement "May 4, 2027 or later" [1][12]. |
| `veo-3.1-lite-generate-001` | yes | Preview, released 2026-04-02 [1][14]. No reference images [1]. |
| `veo-3.0-generate-001`, `veo-3.0-fast-generate-001` | no | Retired 2026-06-30 [12][14]. |
| `veo-2.0-generate-001` | no | Retired 2026-06-30 [12]. |
| `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview` and older previews | no | Discontinued on Vertex. Google asked users to migrate before 2026-04-02 [14]. |
| Gemini API `veo-3.1-*-preview` | no | The Gemini API shut it down on 2026-10-22 [15]. The plugin refuses this route ([video-routing.ts](../server/src/video-routing.ts)). |

Google lists only Veo 3.1, 3.1 Fast and 3.1 Lite today [13]. There is no newer Veo model. The model
versions page names `gemini-omni-1.2-flash` as the replacement for Veo 3.1 [12]. Omni is a
separate model on a separate API (`interactions`), and the plugin does not use it.

### Calling it

Every operation uses the same submit and poll calls on the model resource
`projects/{GOOGLE_CLOUD_PROJECT}/locations/us-central1/publishers/google/models/{model}`
[2][5][veo-video.ts](../server/src/veo-video.ts).

- **Submit:** `POST https://us-central1-aiplatform.googleapis.com/v1/{model resource}:predictLongRunning`.
  The response `name` is `{model resource}/operations/{id}`. The plugin keeps that full name as the
  provider id and refuses a name outside the selected project and model.
- **Poll:** `POST …/{model resource}:fetchPredictOperation` with body `{"operationName": name}` [5].
  The plugin polls every 10 s, for at most 180 polls (30 min), and retries one failed read once
  ([vendor-video.ts](../server/src/vendor-video.ts)). It never resubmits.
- **Result:** when `done` is true, `response.videos[]` holds the video and `raiMediaFilteredCount`
  counts filtered outputs [5].
  - Without `storageUri` the video bytes come back in the response [5][6][8][9]. The plugin never
    sends `storageUri`.
  - The plugin reads `response.videos[0].bytesBase64Encoded`, checks `mimeType:"video/mp4"` and an
    MP4 `ftyp` header, and writes the file.
  - No URL is returned, so URL lifetime does not apply.

```text
{
  "instances": [{ "prompt": "…", "image": {…}, "lastFrame": {…}, "referenceImages": […], "video": {…} }],
  "parameters": { "sampleCount": 1, "aspectRatio": "16:9", "resolution": "720p",
                  "durationSeconds": 8, "generateAudio": true, "enhancePrompt": false,
                  "negativePrompt": "…", "seed": 0 }
}
```

The plugin always sends `sampleCount:1`, the vendor allows 1–4 [1][5]. `enhancePrompt` defaults
to `true` at the vendor, which then may rewrite the prompt [3]. The plugin sends the field only when
the call sets it ([veo-video.ts](../server/src/veo-video.ts)). Whether the 3.1 models accept `false`
has not been tried against the live API.

Common plugin fields on all four tools ([veo-video.ts](../server/src/veo-video.ts)):

| Field | Type and range | Default |
| --- | --- | --- |
| `model` | the three IDs | `veo-3.1-generate-001` |
| `prompt` | string, min 1, no maximum | (required) |
| `resolution` | `720p` / `1080p` / `4k`; `4k` only on the standard model | `720p` |
| `aspectRatio` | `16:9` / `9:16` | `16:9` |
| `generateAudio` | boolean | `true` |
| `enhancePrompt` | boolean | not sent (vendor default `true`) |
| `negativePrompt` | string | (optional) |
| `seed` | integer 0–4294967295 | (optional) |
| `outputPath`, `filename` | strings | (optional) |

### Operations

| Operation | Vendor | Plugin tool |
| --- | --- | --- |
| Text-to-video | yes: 3.1, Fast, Lite [1] | `veo_text2video` |
| Image-to-video | yes: first frame and first + last frame on 3.1, Fast, Lite [6][7] | `veo_img2video` |
| Audio-to-video (supplied track) | no [1][2] | not exposed |
| Reference (character consistency) | yes: 3.1 and Fast [1][8] | `veo_reference` |
| Extend | yes: 3.1, Fast, Lite [9] | `veo_extend` |
| Edit (mask) | yes; per-model support unverified [2][3] | not exposed |
| Upscale | yes (`task:"upscale"`); per-model support unverified [3] | not exposed |
| Camera presets (`cameraControl`) | yes, with `image` only; per-model support unverified [2] | not exposed |

#### Text-to-video

- **Plugin input:** the common fields, plus `durationSeconds` of 4, 6 or 8 (default 8).
- **Wire request:** `POST …:predictLongRunning` with
  `{"instances":[{"prompt":"…"}],"parameters":{…,"durationSeconds":8}}`.
- **Limits:**
  - 4, 6 or 8 s, default 8 [5]. 24 fps on all three models [1]. The plugin sends no `fps`.
  - 16:9 or 9:16 [1]. Output 720p or 1080p, plus 4K on `veo-3.1-generate-001` only [1].
  - Prompt length: unverified. No fetched page states a limit.
  - The documented prompt language is English [1].
  - Native audio is controlled by `generateAudio`, default `true` [3].
- **Dialogue:** the model synthesizes speech from the prompt.
  - Google writes speech as `A woman says: My name is Clara.`, with a colon and no quotation marks, so no text is drawn [10][11].
  - The planner refuses spoken dialogue on Veo unless the scene sets `videoDirection.dialogueVoice:"model_generated"`. It also refuses dialogue with `generateAudio:false` ([video-routing.ts](../server/src/video-routing.ts)).
- **Plugin vs vendor:**
  - The scene compiler writes `Speaker (delivery): "line"` with quotes ([scene-prompt.ts](../server/src/scene-prompt.ts)), against Google's advice [10].

#### Image-to-video

- **Plugin input:**
  - `sourceImagePath` (required): the first frame.
  - `lastImagePath` (optional): the last frame.
  - `durationSeconds` 4, 6 or 8 (default 8).
  - Images must be PNG or JPEG of at most 20 MB ([veo-video.ts](../server/src/veo-video.ts)).
- **Wire request:**
  `{"instances":[{"prompt":"…","image":{"mimeType":"image/png","bytesBase64Encoded":"…"},"lastFrame":{"mimeType":"image/png","bytesBase64Encoded":"…"}}],"parameters":{…}}`.
- **Limits:**
  - Durations, frame rate, aspect ratios and resolutions are the same as text-to-video [6][7].
  - The image must be `image/jpeg` or `image/png`, sent as base64 bytes or a `gcsUri` [2], at most 20 MB [1].
  - Google recommends an input of 720p or more at 16:9 or 9:16. Other shapes are resized or center-cropped [6].
  - `lastFrame` is accepted only with `image` [2].
- **Plugin vs vendor:**
  - `resizeMode` (pad or crop, default pad) is not exposed [3][6].
  - `cameraControl` is not exposed. Camera direction stays in the prompt.
  - Google's own pages disagree about Lite. The model card's modality table marks image input "Not supported" for Lite [1]. The same card's capability row and the image pages list Lite for image-to-video and first + last frame [1][6][7]. The plugin allows it.

#### Audio-to-video

The vendor does not offer this. The model card marks audio input "Not supported" on 3.1, Fast and
Lite [1], and the instance schema has no audio field [2]. The catalog row says
`suppliedSpeech:"unsupported"`. External narration is mixed in at assembly, outside the Veo call.

#### Reference

- **Plugin input:**
  - `referenceImagePaths`: 1–3 paths.
  - `durationSeconds` is fixed at 8.
  - The schema refuses `veo-3.1-lite-generate-001` ([veo-video.ts](../server/src/veo-video.ts)).
- **Wire request:**
  `{"instances":[{"prompt":"…","referenceImages":[{"referenceType":"asset","image":{"mimeType":"image/png","bytesBase64Encoded":"…"}}]}],"parameters":{…,"durationSeconds":8}}`.
- **Limits:**
  - 8 s only. Google states this for `veo-3.1-generate-001` [1][8]. The REST sample sets 8 for both supported models [8]. The Fast model card lists only "4, 6, or 8 seconds" [1].
  - 16:9 or 9:16 [8]. 9:16 was added on 2026-01-13 [14].
  - 720p or 1080p, and 4k on the standard model only [8].
- **References per request:**
  - Up to 3 `asset` images, or 1 `style` image [2]. The two kinds do not share a request.
  - No videos or audio.
  - Each image is PNG or JPEG. The plugin caps each at 20 MB. Google states 20 MB for image-to-video input [1]; a separate reference-image size limit is unverified.
- **Identity:**
  - All asset images must show one person, character or product [8]. The array carries no slot labels and no per-image role.
  - The plugin sends `referenceType:"asset"` in board order.
  - `veoSubjectIssue` maps face, outfit and bystander roles to one character, and also allows prop and continuity images. It refuses images that resolve to more than one character, panel folder or role ([veo-video.ts](../server/src/veo-video.ts)).
  - The scene planner refuses more than one opening position with images ([scene-video.ts](../server/src/scene-video.ts)).
  - Two people in one shot need an authored first frame on image-to-video.
- **Voice:**
  - There is no voice-sample input [1][2].
  - The model voices dialogue from the prompt.
  - Google keeps a voice consistent by repeating the same named character and voice description in each prompt and reusing the same `seed` [10].
- **First frame with references:** not allowed. `referenceImages` excludes `image`, `video` and `lastFrame` [2].
- **Prompt labels:** none. Google documents no `Image N` syntax, and the plugin writes none. The prompt describes the subject in prose [8].
- **Plugin vs vendor:**
  - `style` references are not exposed. The model card lists only "Asset images" for 3.1 and Fast [1], so style support on 3.1 is unverified.

#### Extend

- **Plugin input:**
  - `sourceVideoPath` (required).
  - `aspectRatio` (optional): it must match the source, and is taken from the source when left out.
  - No `durationSeconds` field.
  - Before submitting, ffprobe checks the source: a `.mp4` in an MP4 container, 1–30 s, exactly 24 fps, and 1280x720, 1920x1080, 3840x2160 or the portrait forms ([veo-video.ts](../server/src/veo-video.ts)).
- **Wire request:**
  `{"instances":[{"prompt":"…","video":{"mimeType":"video/mp4","bytesBase64Encoded":"…"}}],"parameters":{"sampleCount":1,"aspectRatio":"16:9","resolution":"720p",…}}`.
- **Limits:**
  - The input must be MP4, 1–30 s, 24 fps, 720p, 1080p or 4K, at 9:16 or 16:9 [9].
  - The extension is 7 s, and the output runs up to 37 s [9].
  - Output is 720p, 1080p or 4K [9]. The plugin allows 4K output on the standard model only.
  - The usage ledger bills 7 s ([usage-ledger.ts](../server/src/usage-ledger.ts)).
- **Voice:** there is no voice input [1]. The plugin refuses dialogue on extend (`allowsGeneratedVoice:false`, [scene-prompt-profile.ts](../server/src/scene-prompt-profile.ts)).
- **Plugin vs vendor:**
  - The plugin sends the whole MP4 inline as base64. Google's sample sends only `video.gcsUri` [9], although the schema allows inline bytes [2]. The inline request-size limit is unverified.
  - The model card lists input resolutions of 720p and 1080p [1]. The extend page also accepts 4K input [9]. The plugin follows the extend page.

#### Edit, upscale and camera presets

The vendor offers these; the plugin does not expose them.
- **Edit:** `instances.mask` with `video` and `maskMode` `insert`, `remove`, `remove_static` or `outpaint` [2].
- **Upscale:** `parameters.task:"upscale"` [3].
- **Camera presets:** `cameraControl` with `image`. The values are `fixed`, `pan_left`, `pan_right`, `tilt_up`, `tilt_down`, `truck_left`, `truck_right`, `pedestal_up`, `pedestal_down`, `push_in` and `pull_out` [2].

Which Veo 3.1 models accept each of these is unverified. The model card lists none of them [1].

### Gaps and differences

- Vendor offers, plugin does not expose:
  - `sampleCount` 2–4
  - `personGeneration`
  - `resizeMode`
  - `compressionQuality`
  - `storageUri` and `gcsUri` inputs
  - `fps`
  - `pubsubTopic`
  - `cameraControl`
  - `style` reference images
  - mask edit
  - upscale
- Mismatches still open:
  - Vertex enhances (rewrites) the prompt by default, so a plugin-written prompt can reach the model changed. A call can send `enhancePrompt:false`; making that the default waits on a live test.
  - Dialogue lines are compiled in quotation marks. Google advises a colon without quotes so that no text is rendered [10].
  - Veo prompts have no character budget in the plugin, so board compilation never trims them to a Veo limit. The vendor limit is unverified.
  - Extend sends the input video inline as base64. A 30 s 4K source may exceed an unverified request-size limit. Google's sample uses `gcsUri` [9].
  - The plugin accepts 4K extend input. The model card lists 720p/1080p input and the extend page lists 4K too [1][9].
- Unverified:
  - The prompt length limit.
  - The inline result field name. The plugin reads `videos[].bytesBase64Encoded`; Google's samples show only `videos[].gcsUri` [5] and `gcsUris[]` [4].
  - The 8 s-only reference rule on 3.1 Fast. It is taken from the REST sample [8].
  - Style reference support on 3.1.
  - Per-model support for edit, upscale and `cameraControl`.
  - The request-size limit for inline images and video.
  - Google's own pages conflict on four points:
    - The parameter reference lists resolution as 720p/1080p only [3]; the model card adds 4K for the standard model [1].
    - The model card's modality table marks Lite image input "Not supported" while its capability row lists Lite image-to-video [1].
    - The `personGeneration` spellings differ between pages (`dont_allow`/`allowAll` [3] against `disallow` [5]).
    - The `referenceToVideo` task mentions "optional reference audio" [3], but the instance has no audio field [2].

### Sources

1. [Veo 3.1 (model card: 3.1, 3.1 Fast, 3.1 Lite)](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate) — fetched 2026-11-25
2. [VideoGenerationModelInstance](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/Shared.Types/VideoGenerationModelInstance) — fetched 2026-11-25
3. [VideoGenerationModelParams](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/Shared.Types/VideoGenerationModelParams) — fetched 2026-11-25
4. [VideoGenerationModelResult](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/Shared.Types/VideoGenerationModelResult) — fetched 2026-11-25
5. [Generate videos from text](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-text) — fetched 2026-11-25
6. [Generate videos from an image](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-an-image) — fetched 2026-11-25
7. [Generate videos using first and last video frames](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-first-and-last-frames) — fetched 2026-11-25
8. [Generate videos from references](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-references) — fetched 2026-11-25
9. [Extend videos](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/extend-videos) — fetched 2026-11-25
10. [Best practices for generating videos](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/best-practice) — fetched 2026-11-25
11. [Video generation prompt guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/video-gen-prompt-guide) — fetched 2026-11-25
12. [Model versions and lifecycle](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions) — fetched 2026-11-25
13. [Google models](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/google-models) — fetched 2026-11-25
14. [Vertex AI generative AI release notes](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes) — fetched 2026-11-25
15. [Video generation in the Gemini API](https://ai.google.dev/gemini-api/docs/video) — fetched 2026-11-25 (comparison only)

Code:
- [`veo-video.ts`](../server/src/veo-video.ts)
- [`hosted-video-routes.ts`](../server/src/hosted-video-routes.ts)
- [`vendor-video.ts`](../server/src/vendor-video.ts)
- [`video-routing.ts`](../server/src/video-routing.ts)
- [`scene-video.ts`](../server/src/scene-video.ts)
- [`scene-prompt.ts`](../server/src/scene-prompt.ts)
- [`scene-prompt-profile.ts`](../server/src/scene-prompt-profile.ts)
- [`usage-ledger.ts`](../server/src/usage-ledger.ts)
- [`config.ts`](../server/src/config.ts)

## Legacy ASTRA self-hosted LTX server

The `astra` engine is a direct client to our self-hosted LTX-2.5 server. That server runs one job at a time and bills nothing per call. The saved selection is `{engine:"astra"}` with no `model` ([model-settings.md](../skills/_shared/model-settings.md)), and its deployment is `self-hosted-ltx`.

The engine is **legacy**. Its successor for LTX is `astra-genai`. It is still registered and selectable, and planning does not refuse it the way it refuses retired engines ([video-routing.ts](../server/src/video-routing.ts)). The credential is `ASTRA_VIDEO`, and `ASTRA_VIDEO_URL` overrides the host ([config.ts](../server/src/config.ts)).

### Models

| Model ID | In plugin | Notes |
|---|---|---|
| `ltx-2.5` | yes (implicit) | The only model the server reports; `version` is `null` [1]. The plugin sends no model field. |
| `fast` / `pro` aliases | no | Server aliases for `mode` `generate` / `guided_hq`. Sending one with `mode` is a 400 [1]. |
| LTX-2.5 22b dev and distilled | indirect | Upstream's current checkpoints, which back the server modes [2][3]. Which weights serve which mode is unverified. |
| LTX-2.3 22b | no | Upstream calls it legacy [3]. |

### Calling it

- **Upload:** `POST /v1/uploads`. The body is the raw file bytes, and `Content-Type` picks the kind. It returns `upload_id` and `expires_at`, plus `duration` for audio or `width/height/frames/fps` for video.
- **Submit:** `POST /v1/jobs` with a JSON body. It returns 202 `{job_id, status, queue_position, status_url, result_url}`.
- **Poll:** `GET /v1/jobs/{job_id}`. `status` moves `queued` → `running` → `succeeded` | `failed`, and the response echoes the `request` the server recorded.
- **Result:** `GET /v1/jobs/{job_id}/result` returns the mp4, or 409 while the file is not ready.
- **Plugin polling:** every 5 s, giving up at 1,800 s. That equals the server's `generation_timeout_seconds` [1].
- **Receipt:** the plugin writes `<video>.astra-job.json` so a timed-out call resumes without resubmitting ([astra-video-client.ts](../server/src/astra-video-client.ts)).
- **Uploads** expire after 24 h, with at most 200 files per key [1]. The server also has `POST /v1/jobs/{id}/cancel`, which the plugin does not use.

```json
{"mode": "generate", "prompt": "…", "num_frames": 121, "width": 1536, "height": 1024,
 "frame_rate": 24, "seed": 42, "images": [{"upload_id": "…", "frame_idx": 0, "strength": 1.0}],
 "generate_audio": false}
```

The plugin sends `generate_audio` only when it is `false`. It refuses any key outside its own per-mode allow-list before sending.

### Operations

| Operation | Vendor | Plugin tool |
|---|---|---|
| Text-to-video | yes | `astra_text2video` |
| Image-to-video | yes | `astra_img2video` |
| Audio-to-video (supplied track) | yes | `astra_audio2video` |
| Reference (character consistency) | yes (`msr`, `ingredients`) | `ingredients` only, via `astra_ic_lora`; `msr` not exposed |
| Keyframes | yes | `astra_keyframe_video` |
| Control (IC-LoRA) | yes | `astra_ic_lora`, `astra_video_upscale` |
| Retake | yes | `astra_video_retake` |
| Upscale (RealESRGAN), SDR→HDR | yes | not exposed |

Rules shared by every operation:

- Frames are 8k+1 from 25 and default to 121. The plugin caps all modes at **361**. The server allows **721** on `generate` and **481** on every other mode [1].
- `duration` in seconds becomes the nearest 8k+1 frame count, the shorter on a tie. The plugin converts it client-side.
- fps runs 1–60, default 24.
- Width and height sit on a 64 grid from 64 to 1920 (a 32 grid on `guided_fast`), with an area of at most 2,064,384 px. Defaults are 1536×1024 (768×512 on fast) [1]. For 9:16, use 1024×1920.
- Prompts take up to 2,000 characters and have no label syntax. Seeds run 0–2,147,483,647 [1].
- Every mode generates sound. `generate_audio:false` strips it after rendering, so GPU time is the same [1].

#### Text-to-video

- **Plugin input:**
  - `prompt`
  - `tier` (`default` | `guided` | `fast` | `hq` → `generate` | `guided` | `guided_fast` | `guided_hq`, default `default`)
  - `numFrames` 25–361, or `duration`, or `autoDuration{minSeconds,maxSeconds}` (≤121 frames)
  - `width`, `height`, `frameRate`, `seed`, `generateAudio`
  - `hdr` (`SRGB_LINEAR` | `ACESCG` | `ACESCCT`)
  - `lora`: ≤2 of `cinemagraph` | `slow-motion`, strength 0–2, tier `default` only
  - `negativePrompt`, `numInferenceSteps` 1–50 and `guidance`: guided tiers only
  - `numGeneratedKeyframes` 0–16
- **Wire request:** `POST /v1/jobs`, body `{mode, prompt, num_frames|auto_duration, width, height, frame_rate, seed, lora, negative_prompt, num_inference_steps, guidance{video_cfg_guidance_scale,…}, num_generated_keyframes, hdr}`.
- **Limits:** see the shared rules above. The server blocks `generate` at width 1280 with an image at 121/129/137 frames, and `guided` at width 1280 with an image at 121 [1].
- **Plugin vs vendor:**
  - The server also accepts `dialogue_segments` on `generate`. It publishes no schema for that field, and the plugin never sends it [1].

#### Image-to-video

- **Plugin input:** `firstFramePath` (png/jpg ≤32 MiB, required), optional `lastFramePath`, `strength` 0–1 (default 1.0), and the text-to-video fields except `hdr`. `autoDuration` is refused together with `lastFramePath`.
- **Wire request:** `POST /v1/jobs` with `{mode, prompt, images:[{upload_id, frame_idx:0, strength}, {upload_id, frame_idx:num_frames-1, strength}], …}`.
- **Limits:** the server accepts 0–8 `images` per request, each with `strength` 0–1, `crf` 0–51 and `frame_idx` 0…num_frames-1 [1]. Upstream binds an image as a guide at a 0-based pixel frame [2].
- **Plugin vs vendor:**
  - The plugin sends at most two images, at the first and last frame. The server takes eight [1].

#### Audio-to-video

- **Plugin input:**
  - Exactly one of `audioPath` (.wav/.mp3 ≤32 MiB) or `audioUploadId`
  - Optional `imagePath` (one portrait at frame 0) with `strength` 0–1, default 0.9
  - `audioStartTime`, and either `audioMaxDuration` or `numFrames`
  - `negativePrompt`, `numInferenceSteps`, `guidance`, `hdr` (not together with an image)
  - `expectLipSync`, `maxAttempts` 1–3 (planning forces 1)
- **Wire request:** `POST /v1/jobs` with `{mode:"audio2video", prompt, audio_upload_id, audio_start_time, audio_max_duration|num_frames, images:[{upload_id, frame_idx:0, strength}], …}`.
- **Limits:** the audio must be stereo; mono is a 400 at upload. A WAV more than 0.08 s shorter than the video is refused [1]. The output carries the supplied track re-encoded as AAC. Upstream renders stage 1 at half resolution with the audio frozen [2].
- **References per request:** 1 audio track and 1 image (plugin). The server takes 8 images [1].
- **Identity:** one portrait pinned at frame 0. There is no subject slot.
- **Voice:** supplied full track only. There is no per-speaker voice sample.
- **First frame with references:** n/a.
- **Prompt labels:** none.
- **Plugin vs vendor:**
  - With no length given, the plugin sends 121 frames. The server default is `null`, which takes the length from the audio [1].

#### Reference

- **Plugin input:** `astra_ic_lora` with `adapter:"ingredients"`, `referencePath` (one composite character sheet, png/jpg ≤32 MiB or mp4 ≤100 MiB) and `referenceStrength` 0–1.
- **Wire request:** `POST /v1/jobs` with `{mode:"ingredients", prompt, references:[{upload_id, strength}], …}`.
- **References per request:** exactly 1 image or video [1]. No audio.
- **Identity:** one composite sheet. There are no per-subject slots.
- **Voice:** no voice-sample input on any plugin `astra` tool ([video-registry.ts](../server/src/video-registry.ts)).
- **First frame with references:** the plugin sends no `images` with `ingredients`. The server allows 0–8 [1].
- **Prompt labels:** none.
- **Plugin vs vendor:** the server's `msr` mode is the full reference lane, and the plugin does not expose it. The plugin reaches MSR only through `astra-genai`. What the server offers [1]:
  - `references` 1–5 `{upload_id, background, audio_upload_id?}`: up to 4 subjects in arrival order, then 1 background in the last slot.
  - `audio_upload_id` attaches to subject slot 1 or 2 only, with samples up to 10 s.
  - `images` (first and last frame) may share the request with references.
  - `reference_strength` is fixed at 1.0, and `reference_frames` is 25 or 33.

#### Keyframes

- **Plugin input:** `images` 2–8 `{imagePath, frameIdx (0…numFrames-1), strength 0–1 (default 1.0), crf 0–51}`, plus `numFrames` or `duration`. There is no `autoDuration`, `lora` or `hdr`.
- **Wire request:** `POST /v1/jobs` with `{mode:"keyframe", prompt, images:[{upload_id, frame_idx, strength, crf}], num_frames, …}`.
- **Limits:** 2–8 images and up to 481 frames are server policy [1]. Upstream states no keyframe maximum [2].
- **Plugin vs vendor:**
  - The server runs `ltx_pipelines.keyframe_interpolation` [1]. That file is absent on upstream `main`, where the docs describe keyframing through `ti2vid_two_stages` [2][4].

#### Control (IC-LoRA)

- **Plugin input:**
  - `adapter`: `clean-plate` | `colorization` | `day-to-night` | `deblur` | `decompression` | `water-simulation` | `pixel-upscaler-x2` | `ingredients`
  - `referencePath`, `referenceStrength`
  - `conditioningMaskPath` (mp4), `conditioningMaskStrength`
  - `skipStage2` (half-resolution output)
- **Wire request:** `POST /v1/jobs` with `{mode:"ic_lora", adapter, prompt, references:[{upload_id, strength}], conditioning_mask:{upload_id, strength}, skip_stage_2}`.
- **Limits:**
  - A reference that feeds 2 or more frames needs an output of at most 1,867,776 px.
  - The mask must feed as many frames as the reference: 1, or 8k+1 [1].
  - `astra_video_upscale` requests exactly twice the source size through `pixel-upscaler-x2`.
- **Plugin vs vendor:**
  - Upstream LTX-2.5 also publishes Layout-To-Render, Refine-Details, Alpha-Gen, Restore and SDR-To-HDR IC-LoRAs, which the server does not load [5].

#### Retake

- **Plugin input:** `sourceVideoPath` (mp4 ≤100 MiB), `startTime`, `endTime`, `seed`, `generateAudio`. The output inherits the source's size, length and fps.
- **Wire request:** `POST /v1/jobs` with `{mode:"retake", prompt, video_upload_id, start_time, end_time, seed}`.
- **Limits:** upstream requires 8k+1 frames and sides divisible by 32 [2].
- **Plugin vs vendor:**
  - The plugin refuses an off-grid source. The server now pads it to the grid itself (`source_normalization`) [1].

### Gaps and differences

- **Vendor offers, plugin does not expose:**
  - `msr` (identity slots plus voice samples)
  - the RealESRGAN `upscale` mode
  - `sdr2hdr`
  - job cancel
  - `images` beyond two, and on `ingredients`/`ic_lora`
  - the `fast`/`pro` model aliases
- **Mismatches still open:**
  - Frame cap: plugin 361 vs server 721 (`generate`) and 481 (other modes) [1].
  - Rate limits: the plugin throttles itself to 5 submits/min, 60/h and 10 uploads/min. The server reports 1000/min, 100000/h and 1000 uploads/min [1].
  - Audio-to-video default length: the plugin sends 121 frames; the server derives the length from the audio [1].
  - Retake: the plugin refuses an off-grid source that the server would normalize [1].
  - Duration: the server publishes `duration.max` 30.208 s on modes capped at 481 frames (20.04 s at 24 fps) [1].
- **Unverified:**
  - What `dialogue_segments` (`generate`) and `output_profile` (`audio2video`) do.
  - Which weights serve each mode.
  - Whether the production `astra-genai` gateway's MSR runs on this server.
  - Quality above 361 frames.

### Sources

1. ASTRA video server capability report, `GET /v1/models` (authenticated, `generated_at` 2026-11-25T07:44:15Z) — read 2026-11-25
2. [LTX-2 pipelines reference](https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-pipelines/docs/pipelines.md) — fetched 2026-11-25
3. [Lightricks/LTX-2 README](https://github.com/Lightricks/LTX-2) — fetched 2026-11-25
4. [ltx_pipelines source listing](https://api.github.com/repos/Lightricks/LTX-2/contents/packages/ltx-pipelines/src/ltx_pipelines) — fetched 2026-11-25
5. [Lightricks IC-LoRA models on Hugging Face](https://huggingface.co/api/models?author=Lightricks&search=IC-LoRA) — fetched 2026-11-25

Code: [`astra-video-client.ts`](../server/src/astra-video-client.ts), [`video-registry.ts`](../server/src/video-registry.ts), [`video-routing.ts`](../server/src/video-routing.ts), [`config.ts`](../server/src/config.ts), [`tools.ts`](../server/src/tools.ts)
