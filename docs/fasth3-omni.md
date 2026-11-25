# FastH3 Omni local adapter

Use `fasth3_omni_reference` for FastH3 Omni and `ltx_video_generate` for LTX.
`mlx_video_generate` remains a deprecated LTX alias so saved calls and receipts
continue to resolve. New catalog-based LTX planning selects the canonical name.
MLX-Serve is the internal backend; `engine:"mlx"` in saved settings is unchanged.
No existing settings or episode snapshots are migrated implicitly.

## Mac image and video settings

Select `{"engine":"mlx","model":"ddalcu/MiniMax-H3-Image-MLX-Serve-4bit"}` for
images and `{"engine":"mlx","model":"ddalcu/FastH3-Omni-MLX-Serve-8bit","operation":"reference"}`
for talking shots. The Mac image tools send requests directly to MLX-Serve.
Check its model catalog for the installed image checkpoint. Use `image_plan`
and `image_execute` for a managed generation or edit. For an edit, pass
the source in `imagePath` and up to nine ordered `refImagePaths`. The result
keeps the source dimensions up to the worker’s 6272-pixel long-side limit.
The plan records the expected output size. The worker owns the six sampling steps. Use
GPT Image 2 when the image must display or preserve readable text.

Managed direct H3 image plans pin the MLX endpoint and reference hashes. After
a disconnect, refresh the original image request with `image_status`. A saved
native PNG under the plan ID can finish delivery without another inference.
A request that has not returned any bytes stays unresolved.

A separately selected legacy gateway binding uses its own image receipt and
request lookup. Existing plans keep their approved destination.

For an on-screen speaker, pin the character's voice sample and list the owned
face under `voiceReference.imagePaths`. Give each shot its own composition
image. Keep the dialogue in the storyboard and set `STORY.language`, for example
`vi`. The planner compiles a speaker tag, a picture index, an audio index and
the original words in a `<d>[Vietnamese] …</d>` span.

A 240-frame scene at 24 fps needs a 243-frame native take. Managed FastH3
execution keeps the original MP4 in `.work/fasth3/<plan-id>/native.mp4` and
delivers the authored frame count with its matching audio duration. After a
disconnect, call `video_status` with the original request ID and `action:"refresh"`.
A complete local take can finish delivery without another model invocation.
If the worker disconnected before returning media, the request remains unresolved.

For character dialogue, inspect `voiceReferenceCheck` on the delivery receipt.
On the Mac test, a take generated the requested Vietnamese line and replayed
its Korean reference recording later in the same shot. The waveform check
reports the reference index, time and correlation for a possible full-sample
replay. Exclude that interval from speaker-similarity scoring and listen to
the complete clip before adoption. Short phrases or paraphrases can escape
the waveform check.

## Architecture

`local-video-models.ts` is a small Strategy registry. Each entry owns its schema,
frame grid, model match and request serializer. `fasth3-omni.ts` validates and
converts reference media. `mlx-serve-client.ts` is the common HTTP Adapter and
RGB/PCM-to-MP4 writer. No inheritance, dependency injection framework or second
routing system is needed. `video_plan` keeps input hashes, saved selection,
spending reservations and duplicate protection for both models.

## Setup

Run MLX-Serve with `ddalcu/FastH3-Omni-MLX-Serve-8bit` installed. Configure
`MLX_SERVE_URL` if the service is not at `http://127.0.0.1:11234`. The adapter does
not download models or start the application. The transformer is ~37.3 GB;
the full pack is ~71.4 GB. Identical encoder/VAE files may be shared with the
MiniMax H3 FL2VA pack after verifying their hashes. Model weights use the
MiniMax H3 Community License; the MLX-Serve conversion is a separate runtime
from FastVideo's Python MLX implementation.

Example saved video selection (explicitly select it; do not overwrite unrelated settings):

```json
{"engine":"mlx","model":"ddalcu/FastH3-Omni-MLX-Serve-8bit","resolution":"768x448"}
```

For a configured episode, use `video_plan` with `operation:"reference"`, record
the approved plan with `video_approve` and submit it with `video_execute`.
A standalone adapter accepts the following inputs.

```json
{
  "prompt":"The person in <Picture 1> waves. Birds chirp.",
  "referenceImagePaths":["/absolute/character.png"],
  "width":768,"height":448,"numFrames":124,"seed":2026,
  "outputPath":"/absolute/output","filename":"fasth3.mp4"
}
```

## Call contract

The MLX-Serve request fields, reference limits (images, videos, audio, totals and clip lengths), the
`17k+5` frame ladder, canvas and RGB caps, prompt labels and voice binding are in the
[video model call reference](video-models.md#fasth3-omni), together with what MLX-Serve, FastVideo and
the MiniMax model card each accept.

## Verification

`npm --prefix server run check` builds shipped artifacts and runs contract tests.
The FastH3 tests cover the frame-grid mismatch, reference limits, image/video/audio
serialization and explicit trimming. Routing tests verify saved selection and
input hashes. A real generation is still required to measure speed and inspect
picture/sound on a particular Mac.

Local smoke test on 2026-10-29: M4 Max, 128 GB, MLX-Serve 26.10.3, the
8-bit pack above, one image, seed 2026, 384x256, 124 frames, 8 steps. The
streaming adapter wrote an MP4 in 244 seconds. ffprobe confirmed H.264,
24 fps, 124 frames (5.166667 seconds), AAC stereo at 32 kHz. Five sampled
frames were inspected; audio presence was measured, not listened to for
quality. This is an integration smoke test, not a quality or speed benchmark.
The earlier 768x448 non-streaming request disconnected before completion;
SSE progress handling fixes that client timeout. Audio/video reference inputs
have serialization tests but have not had separate real-model generation tests.
