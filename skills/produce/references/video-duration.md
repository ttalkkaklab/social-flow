# Generate the shortest supported source

New shots must use `requiredSeconds` instead of accepting a provider's default 8 seconds.
This optional input is available on Veo text/image/reference, Omni text/image, Seedance
text/image/reference, ASTRA text/image/keyframe/audio and MLX video generation. Explicit
legacy durations still work. Extension, edit and retake tools keep their own contracts.

1. Measure the composed audio and performance, then resolve the edit plan. Source coverage
   is source trim + frame-rounded body + outgoing live transition handle. The body must
   cover both the planned shot and the measured audio with its pre/post margins.
2. Run the local read-only planner (no generation or upload):

   ```bash
   node skills/produce/references/plan-video-duration.js storyboard/ SHOT_ID veo_img2video '{"resolution":"720p","model":"veo-3.1-lite-generate-preview"}' /absolute/shot.wav
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
| Veo 3.1 at 720p, text/image | 4, 6 or 8 seconds | [Google Veo API guide](https://ai.google.dev/gemini-api/docs/veo) |
| Veo 1080p/4k or reference images | 8 seconds only | Same guide; lowering resolution needs an explicit model plan change |
| Omni text/image | Integer 3–10 seconds | Existing repository live API measurements; [current guide](https://ai.google.dev/gemini-api/docs/omni) does not specify this numeric output range. Keep the measured adapter contract |
| Seedance 1.5 / 2.0 / 2.5 | Integers 4–12 / 4–15 / 4–30 seconds | [BytePlus task API](https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api) |
| Seedance 1.0 Pro/Fast | 29–289 frames, 1 mod 4, at 24 fps; legacy integer seconds 2–12 | Same API, `frames` only on these two models. Prefer upward frame rounding: 2.4 seconds → 61 frames, not vendor's nearest-frame example of 57 |
| ASTRA default/keyframe/audio | 25–193 frames, 8k+1 | Repository's deployed-service contract, 1–60 fps (24 default); guided/fast cap 121. Not a claim about every LTX deployment |
| MLX video | 9–241 frames, 8k+1 at 24 fps | Bundled local server contract; memory/resolution validation still applies |

Examples: a 3.2-second need requests 4 seconds on Veo 720p, 8 on Veo 1080p,
4 on Seedance 1.5, 77/24 seconds on Seedance 1.0, or 81/24 on ASTRA at 24 fps.
Five seconds on ASTRA requires 121 frames (5.0417 seconds); eight requires 193.
Omni currently uses a measured flat per-call price, so shorter output does not imply a
lower bill. Host-native tools have separate schemas: use their supported duration input
when present, record actual requested seconds, and do not invent `requiredSeconds` support.

Storyboard forecasts use authored durations before speech exists. Final requests must be
replanned from measured media. Existing Seedance storyboard/previz plans retain their whole-
second contract; using its 1.0 frame mode requires regenerating the previz and quote for
that precise request rather than reusing an integer-duration approval.
