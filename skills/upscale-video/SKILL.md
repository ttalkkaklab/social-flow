---
name: upscale-video
description: >
  Upscales existing clips or batches with a chosen adapter; stops before assembly.
  Use for "해상도 올려줘", "4K 업스케일", "이 컷 선명하게", "전체 컷 업스케일" or "upscale shot 7".
  Supports local Real-ESRGAN restoration, Lanczos comparison and opt-in generative LTX 2x.
  Does not generate new shots or change speech. Use produce for a requested integrated master.
argument-hint: "<clip path or episode + shot ids>"
allowed-tools: ["Read", "Bash", "mcp__social-flow__video_upscale_catalog", "mcp__plugin_social-flow_social-flow__video_upscale_catalog", "mcp__social-flow__video_upscale_start", "mcp__plugin_social-flow_social-flow__video_upscale_start", "mcp__social-flow__video_upscale_job", "mcp__plugin_social-flow_social-flow__video_upscale_job", "mcp__social-flow__astra_video_upscale", "mcp__plugin_social-flow_social-flow__astra_video_upscale", "mcp__social-flow__astra_video_capabilities", "mcp__plugin_social-flow_social-flow__astra_video_capabilities", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read", "mcp__social-flow__host_review", "mcp__plugin_social-flow_social-flow__host_review"]
---

# Upscale Video

Use existing media only. Upscaling is opt-in; it does not become a mandatory pass on
all productions. Reuse the user's accepted adapter and settings for an authorized batch.
A request for a sample stops at that sample. A request for the whole episode includes all
selected clips without asking again at every shot. No character body settings, generation
prompt or cast setup is needed for local post-processing.

## Choose the adapter

| Adapter | Tool | Behaviour |
|---|---|---|
| `realesrgan` | `video_upscale_start` | Local Real-ESRGAN general x4v3 + WDN; native-frame 4x inference, then fit to the output canvas. No API call. Preserves frame count/rate and copies original audio packets. |
| `lanczos` | `video_upscale_start` | Conventional resize for comparison, without AI restoration. Same timing/audio contract. |
| LTX `pixel-upscaler-x2` | `astra_video_upscale` | Existing generative re-render route. Faces, mouths and props can change; the tool reports dropped trailing frames. Choose explicitly, never as a silent fallback. |

Local tools use replaceable `UpscaleAdapter` implementations in the bundled Python worker.
The common runner handles media checks, progress, cancellation, resumable clips and receipts.
Adding another local backend means implementing that interface and registering its capabilities;
do not copy the job controller or audio handling into a one-off episode script.

## Local workflow

1. Read actual source paths from the board or the user's files. Preserve the originals.
   Call `video_upscale_catalog` to check FFmpeg, Python, dependencies and weight locations.
   The default runtime is `~/.local/share/social-flow/upscale-tools/venv/bin/python`, falling
   back to `python3`; default weights are in the sibling `models/` directory. Explicit
   `pythonPath` and `modelsDirectory` support other installations. The tools do not install
   dependencies or download models. For an authorized setup, run
   [setup-local.sh](references/setup-local.sh); it uses an isolated venv and verifies the
   official weight checksums. Python 3.11+, FFmpeg and a POSIX host are required.
2. Resolve the requested canvas. Without width/height the tools use 2x dimensions.
   For 4K landscape set `width:3840,height:2160`. `fit:"contain"` preserves the whole image
   with padding; `fit:"cover"` crops centrally. Reuse an accepted framing choice. Neither
   mode changes playback speed. Zero-start CFR SDR media is supported; VFR, rotated and HDR
   sources need an explicit preparation step, not silent conversion. All source audio tracks
   must fit the MP4 container; unsupported packet copies fail without transcoding.
3. Call `video_upscale_start` with the explicit adapter, ordered `sources` and an output
   directory. For the accepted conservative restoration use `denoiseStrength:0.3`.
   `device:"auto"` selects MPS, CUDA or CPU; it never changes the restoration adapter.
   GPU memory grows with the native source size. No tiling or face enhancement is applied.
   Keep source resolution and choose a smaller sample when measuring runtime; do not claim
   a universal ETA. Hardware acceleration still may take hours for a full episode.
4. Keep the returned `jobDirectory`. Poll `video_upscale_job {action:"status",jobDirectory}`.
   The detached worker survives MCP disconnection. Status includes clip counts, the current
   frame and elapsed seconds. It writes one output and receipt per clip, plus `status.json`
   and `worker.log`. Identical start requests reuse the same job directory.
5. Cancel with `action:"cancel"`. Resume a cancelled, failed or interrupted job with
   `action:"resume"`; completed clips are reused only when their hashes still match.
   A partial clip restarts from its first frame. Changed source bytes, model weights, worker/runtime versions or settings are
   refused. One official local AI job runs at a time per user; a concurrent job reports the
   resource conflict and can be resumed later. Source files and verified outputs are never
   overwritten. Do not start a second render just because a tool response was interrupted.
6. Compare matching source/output frames and playback when inspecting quality. Technical
   checks do not prove natural skin, identity, mouths, signs or fine textures. Report only
   what was actually reviewed; receipts retain `not_reviewed`. When the user already accepted
   a sample and asked to continue the batch, proceed under that authorization.

## Requested integrated master

If the user also requests integration, continue with [produce](../produce/SKILL.md) after the
batch finishes. Preserve the established shot order, transitions, dialogue pauses and music.
Use each completed receipt's output path/hash for the video binding and retained-soundtrack
binding. Keep the original clip path/hash in provenance. Do not generate new speech.

Set the build canvas explicitly to the requested dimensions, prepare the outro at that size
and render graphic slides cleanly. The common builder chooses the H.264 level from the actual
canvas/rate. Run the canonical builder and speed pass; check master duration, frame count and
sound against the approved edit. An already-approved final mix can be stream-copied when the
visual timeline is identical, followed by fresh assembly and delivery proofs. Keep the earlier
master and deliver a new version with a clickable file link. The local tools themselves do not
rewrite a storyboard or assemble a master.

## Existing LTX route

Call `astra_video_capabilities` before proposing a generative re-render. Source sides must be
multiples of 32 and the doubled frame must fit the moving-reference ceiling. For the existing
wrapper that is 1,867,776 pixels: 512x896 → 1024x1792 fits; 720x1280 does not. Never downscale a
larger original just to fit LTX. Describe the source subject/action/setting in the required
English prompt; a bare "upscale" prompt invented content in testing. The wrapper selects the
largest supported 8k+1 frame count and reports dropped frames, then remuxes source audio.
Inspect faces, lip sync and props before replacing an approved clip. No automatic seed loop
or fallback to another provider.
