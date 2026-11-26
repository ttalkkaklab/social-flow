# Music selection and execution

New generated music follows `music_catalog → music_plan → music_execute`. Read
`music_status` after interruptions. A channel bed is reused by naming it as a cue's `asset`; a file made for another episode's cue is never a substitute (user directive 2026-11-14). No provider
fallback or quality score changes the saved choice. `music_catalog {engine, model}` returns
each matching adapter's engine and purpose, with JSON Schema for its shared inputs
(`parameters.common`) and adapter-specific inputs (`parameters.options`).
`music_plan` takes `engine` and `model` as a check on the saved
selection and never switches it (`music_selection_mismatch`).

## Settings and layers

Save `models.music: {engine, model}` with `project_manage update` or the model
settings helper and the user's actual selection. Valid pairs come from
`music_catalog` / `project_manage options.musicCatalog`. Engines: `lyria`,
`elevenlabs`, `suno-api` (sunoapi.org third party), `mlx` (MLX-Serve pack ID), and `stable-audio-mlx` (Stable Audio 3 Medium).
First setup asks for this choice directly after the video model and its credentials.
Save `models.music:{engine:"none"}` when the user chooses existing music or no score.
This also covers audience-only tonal cues. Requesting a new generation plan with that
choice reports `music_generation_disabled`. When an older workspace lacks this choice,
project-init asks before the next storyboard or video task. Existing snapshots stay intact.

1. **Selection:** episode `.work/model-settings.json` wins over workspace settings;
   existing `PRODUCTION.modelSettings.models.music` is the legacy board source.
   Explicit `modelSettings.overrides` with `scope:episode` or `scope:shot`, `request`
   and `music:{engine,model}` override it; shot scope matches the cue's `assetId`.
2. **Registry/schema:** native adapter fields, supported model, parameter bounds
   and reference hashes are checked. Unknown fields and model mismatches fail.
3. **Plan:** selection, authorization, payload, output and inputs produce an immutable
   hash ID. Changed settings or sources invalidate an unexecuted plan.
4. **Execution:** credential/tool checks, budget, attempts and concurrency precede
   submission. A short exclusive state transaction reserves the request.
5. **Media/receipt:** decode into 48 kHz stereo PCM WAV, measure duration/hash and
   publish without overwriting another asset. Record `not_reviewed` (no listening
   quality certification). Raw provider files stay in the request's raw directory.

The tools do not trim, loop or pad generated music. The existing sound compiler
and builder still handle cue placement, narration ducking and bed looping.

## Authorization and cost

Store an existing authorization in `PRODUCTION.musicAuthorization` or the target
asset directory's `.social-flow/music-authorization.json`:

```json
{"reference":"User-authorized music allocation for this episode","maxUsd":2,
 "maxConcurrent":1,"maxAttempts":3}
```

These example amounts are not defaults or approval. Allocate music within the
user's total episode budget alongside video/image/speech; these routers maintain
separate ledgers, not a shared account-wide billing cap. Model settings alone do
not authorize spending. Local MLX needs no paid authorization (hardware excluded).

`reserveUsd` is a positive caller estimate for the entire API request, including
both Suno variants. It is zero for local execution. There is no verified universal
music price table: this enforces the reserved allocation, **not the provider's
invoice**. Completed jobs retain their reservation until actual charges are known.
Existing legacy music receipts require explicit `openingSpendUsd` before the new
state starts. No hidden zero-cost assumption.

## Example: saved ElevenLabs music_v2_5

```json
{"directory":"/work/data/demo/episodes/intro","assetId":"base","requestId":"base-1",
 "reserveUsd":0.5,"args":{"prompt":"Warm piano, space for spoken narration",
 "forceInstrumental":true,"musicLengthMs":30000,
 "outputPath":".work","filename":"bgm.wav"}}
```

Call `music_plan` with this object. Pass the returned `directory` and `planId` to
`music_execute`. The response also carries the same value in `id` for existing callers. Omit the provider model in args to inherit it.
For Lyria song use `prompt`, optional Korean `lyrics` and `instrumental:false` for
singing. For Lyria RealTime use `prompts:[{text,weight}]`, `durationSeconds` and
optional `config`. For Suno V6 use `customMode:true`, `style`, `instrumental:true`
and optional `duration`; sung text belongs in `lyrics`. The two local models take different arguments, described below.

Configured production raw adapters require `musicContext` with `directory`,
`assetId`, `requestId` and API `reserveUsd`; that calls the same planner/executor.
Use the routing tools normally. Standalone calls outside configured production
remain available and do not get the managed budget or output contract.

## Local music on Apple Silicon

Both models use the same `music_plan` and `music_execute` tools and reserve $0.
Select the pair under `models.music`. The catalog lists supported models on all hosts.
`capability_status` checks local configuration. Each generation records the measured output length.

| Engine and model | Example `music_plan.args` | Native call and output |
|---|---|---|
| `mlx` / `ddalcu/MiniMax-Music3-MLX-Serve-8bit` | `{"prompt":"Warm folk-pop, picked guitar and a close lead voice","instrumental":false,"lyrics":"[verse]\nMorning light across the bay","durationSeconds":12,"seed":17}` | MLX-Serve 26.11.3, `POST /v1/audio/music-generations`. JSON in, 44.1 kHz stereo WAV out. |
| `stable-audio-mlx` / `stabilityai/stable-audio-3-medium` | `{"prompt":"Fingerpicked nylon guitar and brushed snare","durationSeconds":8.5,"steps":8,"seed":17}` | Official MLX CLI, `--dit medium --decoder same-l`. Output is a 44.1 kHz stereo PCM WAV. |

**MiniMax Music 3.** Put genre, vocal direction and arrangement in `prompt`.
Supply section-tagged `lyrics` with `instrumental:false` for vocals. The plugin defaults
to `instrumental:true`; omit lyrics for an instrumental request. This setting steers
the model and can leave vocal texture. `durationSeconds` maps to the integer
`duration_seconds`, a 1–360 second upper bound (plugin default 30). The installed
server takes `steps` (4–100, default 30) and `seed` (default 42). It adds `bpm`
(30–300) and `keyscale` to the caption as text guidance. It rejects reference audio,
cover tasks, time signatures and vocal language fields.
[Versioned request parser](https://github.com/ddalcu/mlx-serve/blob/v26.11.3/src/plugins/music3/plugin.zig) ·
[Caption conditioning](https://github.com/ddalcu/mlx-serve/blob/v26.11.3/src/plugins/music3/music3.zig)

**Stable Audio 3 Medium.** The adapter runs the installed
`.venv/bin/python scripts/sa3_mlx.py` offline. Set `STABLE_AUDIO_MLX_DIR` to the
absolute `optimized/mlx` directory, or save `{"directory":"/path/to/stable-audio-3/optimized/mlx"}`
in `~/.config/social-flow/stable-audio-mlx.json`. The environment takes precedence. Text generation uses
the Medium DiT, T5Gemma and SAME-L decoder. Audio editing also uses the SAME-L encoder.
Describe music in English in `prompt`. The CLI supports fractional seconds up to
the model's 380-second limit. Social Flow passes `durationSeconds` as `--seconds`,
chooses a seed when omitted and returns it in the receipt.
`negativePrompt` and `apg` require `cfg` other than 1. For variations pass
`initAudioPath` and `initNoiseLevel` (e.g. 0.6). To regenerate seconds 2–4 of
that clip, add `inpaintRange:[2,4]`. Managed plans hash the input recording.
[MLX CLI and argument definitions](https://github.com/Stability-AI/stable-audio-3/blob/790793b89ddceea612be9ce42ff6830d18f6fa57/optimized/mlx/scripts/sa3_mlx.py) ·
[Model limits](https://github.com/Stability-AI/stable-audio-3/blob/790793b89ddceea612be9ce42ff6830d18f6fa57/README.md#models)

## Interrupted requests

A completed request ID returns the cached receipt after checking the output hash.
An uncertain request holds its budget/concurrency slot and cannot be resubmitted.
Inspect `music_status`; check provider termination and billing. Use `action:reconcile`
with `spentUsd` and concrete `evidence` only after that check. A process-interrupted
`submitting` job also requires `executorStopped:true` and a stopped local owner.
Reconciliation marks that attempt failed; a deliberate retry uses a new request
ID. It never resends automatically. Preserve any downloaded raw audio for recovery.

Provider research and current implementation scope:
[2026-10-18 music models](https://github.com/ttalkkaklab/social-flow/blob/1eabc4fb598b99135fe39a1a2be1f7dbe07fd5a9/docs/research/2026-10-18-music-models/README.md).
