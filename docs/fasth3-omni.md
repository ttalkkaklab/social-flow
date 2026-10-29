# FastH3 Omni local adapter

Use `fasth3_omni_reference` for FastH3 Omni and `ltx_video_generate` for LTX.
`mlx_video_generate` remains a deprecated LTX alias so saved calls and receipts
continue to resolve. New catalog-based LTX planning selects the canonical name.
MLX-Serve is the internal backend; `engine:"mlx"` in saved settings is unchanged.
No existing settings or episode snapshots are migrated implicitly.

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

For configured episodes use `video_plan` with `operation:"reference"`, then
`video_execute`. A standalone adapter request:

```json
{
  "prompt":"The person in <Picture 1> waves. Birds chirp.",
  "referenceImagePaths":["/absolute/character.png"],
  "width":768,"height":448,"numFrames":124,"seed":2026,
  "outputPath":"/absolute/output","filename":"fasth3.mp4"
}
```

## Verified upstream call surfaces

Checked on 2026-10-29 against the following primary sources:

- [FastVideo release and examples](https://haoailab.com/blogs/fastvideo-omniref-update/).
- [FastVideo MLX reference types and validation](https://github.com/hao-ai-lab/FastVideo/blob/7203b4976eefcd70a52728ca1281797ce96734eb/fastvideo/mlx_runtime/minimax_h3_reference.py).
- [FastVideo MLX generate signature](https://github.com/hao-ai-lab/FastVideo/blob/7203b4976eefcd70a52728ca1281797ce96734eb/fastvideo/mlx_runtime/minimax_h3_pipeline.py).
- [MLX-Serve HTTP parser](https://github.com/ddalcu/mlx-serve/blob/49977fe79744dbe622403bb0a21ffa831122d516/src/plugins/minimax_h3/plugin.zig) and [reference ordering](https://github.com/ddalcu/mlx-serve/blob/49977fe79744dbe622403bb0a21ffa831122d516/src/plugins/minimax_h3/h3.zig).
- [Installed conversion model card](https://huggingface.co/ddalcu/FastH3-Omni-MLX-Serve-8bit/blob/main/README.md).

These are different APIs. FastVideo Python accepts `generate(prompt, output_path=..., references=[MiniMaxH3Reference(source=..., media_type="image" | "video" | "audio")], num_steps=8, ...)`. References may also specify `soundtrack`, `fps` and `sample_rate` where applicable. The social-flow adapter uses the separately maintained MLX-Serve HTTP API, not this Python signature.

| social-flow input | MLX-Serve JSON field | Wire value |
| --- | --- | --- |
| `referenceImagePaths` | `ref_images` | Ordered base64 PNG/JPEG strings |
| `referenceVideoPaths` | `ref_videos` | Objects with base64 `frames` and optional WAV `audio` |
| `referenceAudioPaths` | `ref_audios` | Ordered base64 WAV strings |
| `referenceSize` | `ref_image_size` | `match` or `max` |
| `numFrames` | `num_frames` | Exact frame count |
| `steps` | `steps` | 8 |

The adapter POSTs to `/v1/video/generations` with `model`, `prompt`, `width`, `height`, optional `seed` and `stream:true`. It consumes SSE progress and the final RGB/PCM payload, then writes the MP4 locally. File paths are adapter inputs; they are not passed directly to the HTTP server.

Both the official Ref2VA validator and this conversion require a visual reference: audio-only and text-only requests are rejected. An image reference guides identity/composition; it does not pin the exact first frame. MLX-Serve also parses `first_frame_image` and `last_frame_image` in its shared H3 implementation, but this adapter does not expose those fields: their quality and semantics with this Omni pack have not been verified. `chain_windows > 1` explicitly rejects REF2VA packs. Do not infer these capabilities from FL2VA or hosted services.

The 256 MiB RGB ceiling, 60 MiB encoded upload limit, dimension range and explicit trim opt-in below are adapter policies. They are not universal FastH3 model limits.

## Contract

- Exactly 8 steps. 24 fps, frames on the `17k+5` ladder from 124 through 362.
  `requiredSeconds` rounds UP on this ladder; LTX still uses `8k+1`.
- Width/height: multiples of 32, 256–1536. Decoded RGB must fit this adapter's
  256 MiB compatibility limit (the installed MLX-Serve 26.10.3 UI limit). A 15-second request needs a smaller canvas than a 5-second one.
- Up to 9 PNG/JPEG images, 3 videos and 3 audio files; at most 12 total and at
  least one image or video. Each clip is 2–15 seconds; video references total
  at most 15 seconds. The encoded request must fit 60 MiB.
- Reference videos are decoded to JPEG frames at 24 fps with a maximum 768px
  side. Their soundtracks are converted to stereo 32kHz PCM WAV. By default,
  references that require tail trimming fail. `trimReferenceVideos:true`
  permits truncation to the output frame count and the `17k+5` ladder; paired
  audio is trimmed to that same duration. Standalone audio is also converted
  to stereo 32kHz PCM WAV.
- `referenceSize:"match"` is the default; `max` costs more time and memory.
- Prompt image labels are `<Picture N>`. Video soundtrack audio labels precede
  standalone `<Audio N>` labels. Automatic pinned-character voice mapping
  probes video soundtracks and offsets standalone audio labels accordingly.
- This adapter supports reference generation, not first/last keyframes or clip
  continuation. Reactor's API capabilities must not be assumed for this pack.
- Voice reference means timbre guidance. Exact supplied speech, original WAV
  preservation and validated lip-sync remain unsupported. Output quality is
  `not_reviewed` until actual playback has been inspected.

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
