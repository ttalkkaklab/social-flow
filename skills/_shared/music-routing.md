# Music selection and execution

New generated music follows `music_catalog → music_plan → music_execute`. Read
`music_status` after interruptions. Reuse existing channel beds first. No provider
fallback or quality score changes the saved choice.

## Settings and layers

Save `models.music: {engine, model}` with `project_manage update` or the model
settings helper and the user's actual selection. Valid pairs come from
`music_catalog` / `project_manage options.musicCatalog`. Engines: `lyria`,
`elevenlabs`, `suno-api` (sunoapi.org third party), `mlx` (exact installed pack ID).
Old projects without music remain valid; generating new music reports
`music_setup_required`. Ask only for that missing choice. No key is stored here.

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

Call `music_plan` with this object and pass its `id` to `music_execute` as
`planId` with the same directory. Omit the provider model in args to inherit it.
For Lyria song use `prompt`, optional Korean `lyrics` and `instrumental:false` for
singing. For Lyria RealTime use `prompts:[{text,weight}]`, `durationSeconds` and
optional `config`. For Suno V6 use `customMode:true`, `style`, `instrumental:true`
and optional `duration`; sung text belongs in `lyrics`. MLX uses its native
`prompt`, `durationSeconds` and `instrumental` fields.

Configured production raw adapters require `musicContext` with `directory`,
`assetId`, `requestId` and API `reserveUsd`; that calls the same planner/executor.
Use the routing tools normally. Standalone calls outside configured production
remain available and do not get the managed budget or output contract.

## Interrupted requests

A completed request ID returns the cached receipt after checking the output hash.
An uncertain request holds its budget/concurrency slot and cannot be resubmitted.
Inspect `music_status`; check provider termination and billing. Use `action:reconcile`
with `spentUsd` and concrete `evidence` only after that check. A process-interrupted
`submitting` job also requires `executorStopped:true` and a stopped local owner.
Reconciliation marks that attempt failed; a deliberate retry uses a new request
ID. It never resends automatically. Preserve any downloaded raw audio for recovery.

Provider research and current implementation scope:
[2026-10-18 music models](../../docs/research/2026-10-18-music-models/README.md).
