# Generate the shortest supported source

New shots must use `requiredSeconds` instead of accepting a provider's default 8 seconds.
This optional input is available on Seedance text/image/reference, self-hosted ASTRA
text/image/keyframe/audio, MLX `ltx_video_generate` and `fasth3_omni_reference`. Explicit
legacy durations still work. The ASTRA GenAI gateway and desktop tools, extension, edit and
retake tools keep their own length inputs.

1. Measure the composed audio and performance, then resolve the edit plan. Source coverage
   is source trim + frame-rounded body + outgoing live transition handle. The body must
   cover both the planned shot and the measured audio with its pre/post margins.
2. Run the local read-only planner (no generation or upload):

   ```bash
   node skills/produce/references/plan-video-duration.js storyboard/ SHOT_ID seedance_img2video '{"resolution":"1080p","model":"dreamina-seedance-2-0-260128"}' /absolute/shot.wav
   ```

   The exported `plan` function also accepts measured `performanceSeconds`. The CLI cannot
   infer unrecorded acting; supply a scene duration covering it. Missing audio produces a
   warning. Re-run after changing dialogue, speed, source trim or the following transition.
   For ASTRA, `prepare-astra-shot.js` also reads the speech performance and optimizes frames.
3. Keep the selected model and resolution. Use the returned exact arguments, add the authored
   prompt/media, and refresh the previz and cost quote to the requested duration. Do not copy
   an old 193-frame count or a generic 8-second example. Never send `requiredSeconds` together
   with `durationSeconds`, `frames`, `numFrames`, `autoDuration` or `audioMaxDuration`.
   The planner returns `quote.key` and `quote.quantity` for the exact resolved request; use
   those coordinates in the final cost tally and budget check instead of the preliminary
   storyboard forecast. The MCP handler resolves the duration before submitting, and the usage ledger prices the
   same resolved request. Seedance reference-video billing also includes input video seconds.
4. Over-limit requests fail before submission. Split or replan the shot; do not silently
   truncate it, lower resolution, switch models or spend on an additional take.
5. Probe the downloaded file. Requested seconds and vendor-reported seconds are not measured
   playback coverage. Seedance's task duration may be rounded down to a whole second. Trim
   surplus locally only after verifying that the source covers the complete edit. Never
   stretch, loop or freeze-pad a short source to conceal missing action.

## API constraints checked 2026-10-17

| Route | Minimum covering request | Evidence |
| --- | --- | --- |
| Seedance 2.0 (with Fast, Mini) / 2.5 | Integers 4–15 / 4–30 seconds | [BytePlus task API](https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api) |
| ASTRA (every mode but retake) | 25–361 frames, 8k+1 | Live server's published `/v1/models` limit, 1–60 fps (24 default); above 121 only some modes and sizes are measured. Not a claim about every LTX deployment |
| MLX video | 9–241 frames, 8k+1 at 24 fps | Bundled local server contract; memory/resolution validation still applies |
| FastH3 Omni reference | 124–362 frames, 17k+5 at 24 fps | Bundled local pack contract (`FASTH3_FRAME_LIMITS`) |

Examples: a 3.2-second need requests 4 seconds on Seedance, or 81/24 on ASTRA at 24 fps.
Five seconds on ASTRA requires 121 frames (5.0417 seconds); eight requires 193.
Host-native tools have separate schemas: use their supported duration input
when present, record actual requested seconds, and do not invent `requiredSeconds` support.

Storyboard forecasts use authored durations before speech exists. Final requests must be
replanned from measured media. Seedance storyboard/previz plans keep their whole-second
contract.
