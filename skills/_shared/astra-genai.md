# Unified ASTRA GenAI adapters

Use `engine: "astra-genai"` for the unified gateway. Legacy `engine: "astra"`
continues to use `ASTRA_VIDEO` and video.astravision.co.kr; local `zimage`
continues to invoke mflux. Never migrate saved selections implicitly.

## Credentials and endpoint

Set `ASTRA_GENAI_API_KEY` to the gateway token issued by the GenAI console.
`ASTRA_GENAI_URL` defaults to `https://genai.astravision.co.kr`. Keep credentials
in the shell/app environment or the external SNS token directory's `.env`, never
in models.json, episode snapshots or the repository. The legacy key is not a fallback.

## Selection and requests

Video selection requires `model`: `ltx-2.5-22b-distilled` or `ltx-2.5-22b-dev`.
Save a provider resolution string in `resolution`. Image selection requires the
actual deployed DashScope model ID; the provider documents `z-image-turbo`, but
this gateway's OpenAPI does not enumerate image deployments.

Use `video_catalog` → `video_plan` → `video_execute`, or
`image_catalog` → `image_plan` → `image_execute`. Set
`PRODUCTION.videoAuthorization` or `imageAuthorization` with the actual spending
authorization. Use `videoProvider: "api"` for GenAI storyboard compatibility;
record `engine: "astra-genai"` and the selected model on the relevant shots/settings.
Do not run legacy `prepare-astra-shot.js` or `render-astra-shot.js` for this engine.

- Video tools: `astra_genai_text2video`, `astra_genai_img2video`.
  Supply `prompt`, explicit `duration` (integer seconds or null), `resolution`,
  `model` and `reserveUsd`. Saved model/resolution are inherited by managed plans.
  Optional `fps` is 24, 25, 48 or 50; `generateAudio` defaults true.
  `cameraMotion` accepts the provider's declared camera enum.
  `requiredSeconds` and legacy frame-count rounding are unsupported because the
  gateway does not publish duration limits or null-duration semantics.
- Image-to-video adds `imageUri` and optional `lastFrameUri`. The gateway validates
  accepted URI schemes and model support. No local-file upload or legacy upload-ID
  conversion is implemented. Do not promise support for data URIs without verifying
  the deployed gateway. No intermediate keyframes, external speech, IC-LoRA or retake.
- Image tool: `astra_genai_text2img`. Supply `model` and a prompt up to 800 characters.
  Optional `size` defaults to `1024*1536`, `seed` accepts 0–2147483647 or null,
  and `promptExtend` defaults false. No editing, masks, references, steps or quantization.
- Gateway prices are unverified. Supply an explicit `reserveUsd` in video arguments
  or the image plan/context. Zero is accepted only as an explicit caller estimate;
  it is never inferred from the legacy self-hosted route. Reservations are not invoices.

## Recovery

Generation POSTs are never retried automatically. Each output has a private
`.astra-genai.json` sidecar. A submitting receipt without a provider identity is
ambiguous: inspect provider usage before any new generation.

`video_status` with `action: "refresh"` queries the existing GenAI job, downloads a
completed MP4 and updates its managed receipt. `astra_genai_video_status` takes a
`receiptPath` and optional `download: true` for standalone jobs. Reusing the same
standalone video output and matching request resumes its job instead of submitting.

`image_status` with `action: "refresh"` recovers a download from the saved DashScope
response and updates its managed receipt. The image generation route is synchronous
and exposes no status endpoint; an interrupted POST cannot be recovered by guessing
an ID. Existing files are not overwritten. Cached results must retain their hashes.

Result downloads never carry the gateway Bearer token. Receipts retain response URLs
for image download recovery, so keep sidecars private. Outputs are checked for usable
media, while visual quality and lip sync remain `not_reviewed`.

## Contract evidence and limitations

Request fields are pinned in `server/test/fixtures/astra-genai-openapi-20261018.json`,
from [the gateway OpenAPI](https://genai.astravision.co.kr/openapi.json).
Its success-response schemas are incomplete. Response parsing follows the advertised
provider compatibility contracts:
[LTX v2](https://docs.ltx.io/quickstart) uses `id`, `status` and `result.video_url`;
[DashScope](https://help.aliyun.com/en/model-studio/z-image-api-reference) uses
`request_id`, `output.choices[].message.content[].image` and `usage`.
Unexpected responses fail explicitly and preserve recovery evidence. Provider docs
do not prove this gateway's live generation behavior, limits or model availability.

Live image probe, 2026-10-18: `z-image-turbo` returned PNG images. The deployed
gateway rejects `promptExtend:true` with HTTP 422 / `GatewayUnsupportedParameter`
because its local backend has no prompt-rewrite service; use false. The OpenAPI
boolean alone does not establish live support. For images that must contain or
preserve readable text, follow the [GPT Image 2 rule](image-routing.md#images-containing-text-gpt-image-2-required)
instead of this adapter. No live video generation was performed in this probe.
