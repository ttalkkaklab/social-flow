# TTS model and execution layers

The implemented speech contracts live in `tts-models.js`. The server's adapter
registry validates each raw payload, then invokes that provider's client. Saved
character voice settings and `compileActing` share the same exact model registry.
Unknown models fail; a provider failure never switches voices, models or providers.
The character compiler selects the model's direction syntax: legacy Gemini prompt,
Gemini 3.8 turn metadata, ElevenLabs inline tags, or free-text gateway/local direction. Research candidates are not adapters.
Character limits in this registry are local adapter limits, not vendor token limits.

## Speech tools

1. Read `tts_catalog` for installed models and their single-speaker or dialogue generators. Pass `engine` and an optional `model` to inspect the adapter parameter schemas.
2. Save the take with `tts_plan`. Supply an absolute output `directory` and a stable
   `requestId`. For a character line, copy the fields in the line's
   `speech_manage plan_audio` result under `ttsPlan`. For standalone speech, supply
   `generator` and its `generation` arguments directly. The plan stores the normalized
   arguments, voice binding and local conditioning hashes. Planning makes no provider call.
3. Call `tts_execute` with the returned `directory` and `planId`. Execution rechecks
   the character and input files, dispatches the saved take and records the receipt.
   Matching completed requests reuse the audio and its usage entry.
4. After interruption read `tts_status` with the same `directory` and `requestId`.
   It reports the recorded execution state. `not_found` means no execution receipt
   exists. A plan alone has no receipt. Inspect a `submitting` or `uncertain`
   request before making another take.

Example standalone `tts_plan` arguments:

```json
{"directory":"/absolute/project/.work/speech","requestId":"intro-r1","generator":"tts_local_voxcpm2","generation":{"model":"voxcpm2","text":"Welcome back.","filename":"intro.wav"}}
```

The compatibility tool `tts_route` still takes `action: "capabilities"`, `"plan"`
or `"execute"`. Its plan only validates arguments in memory. Its execute action
takes the same generator and generation with an outputPath and a requestId.
Both interfaces use the same execution receipts and duplicate-request checks.

## Character retakes

A selected sample is not a registered TTS voice. Gateway character speech with a
selected sample cannot use `voiceId:"default"`; register the chosen sample with the
gateway operator and save its returned voice ID in the identity and requested episode
pin. After registration, use `character_voice_audition action:bind_registered` with
identityPath, its current expectedIdentitySha256 (from the character handoff), the
operator-returned registeredVoiceId and the actual confirmation in userSelection.
This local operation binds that ID to the chosen sample hash and preserves the
audition's original synthesis settings. It does not upload or remotely register a
voice. Then refresh the requested episode's tts and voiceReference from the handoff.
Never guess that a character ID is a registered voice. Auditions may still design
a new voice with `default`. Samples used by native MSR retain their separate contract.

`speech_manage plan_audio` checks the shared character voice against the episode pin
without rewriting it. A mismatch refuses a new take and `list` exposes it in
`generationPlan.warnings`; existing recordings stay reusable. Applying the current
sheet requires an explicit episode update. An intentional same-model exception uses
`PRODUCTION.modelSettings.overrides.speech` with engine, model, the exact voiceId and
the user's request. Existing explicit engine/model changes remain supported.

Gateway plans include `generation.speechContext:{path,lineId,expectedRevision}`.
Copy it unchanged, along with the planned voice and instructions. The raw gateway
tool and common router verify the current board, speaker, selected sample hash and
provider arguments before submission. Missing context for an episode output refuses
generation; channel asset auditions are separate. Context is local provenance and
is not sent to `/v1/audio/speech`.

For new gateway `attach_audio`, pass the completed execution `receiptPath` inside
`generation`, with the clean line text, declared language and actual voiceSettings.
Attachment checks the receipt's actual generator arguments and exact output bytes,
then stores those arguments. Composition and assembly recheck attached receipts.
The actual provider text/turns must be present; a clean text claim beside a receipt
does not replace its request text. Gateway instructions must match the compiled
plan even when the line has no acting and the character has no baseline direction.
Do not relabel transformed audio with an original take's receipt: it covers only the
original bytes. Historical attachments without a receipt remain reusable with their
existing checks; the new requirement applies when attaching a new gateway take.

Raw synthesis tools share these runtime checks. Use a saved plan and a stable request ID for restart-safe replay. Auditions and the legacy checked wrapper use
the same adapter preparation; they do not acquire automatic listening review.

## Execution gates and receipts

Before submission: exact schema/model, tool enablement, credentials, output path and
extension, request/output locks and a provider credential concurrency slot. Configure
`SOCIAL_FLOW_TTS_MAX_CONCURRENCY` (1–32, default 2) consistently across processes.
Slots use atomic directories on the local machine; this is not a distributed lock.
Audio names with the same stem share a lock because alignment sidecars share that stem.
No automatic speech retry occurs, including timeout, 429, 5xx or missing audio.

`.speech-runs/<requestId>.json` records submission state, normalized arguments,
model, attempts, output hashes and `review: "not_reviewed"`. A successful provider
response still must pass media and alignment validation. Failures after entering the
provider adapter are conservatively `uncertain`; a missing response does not prove
there was no charge. Receipts are execution evidence, not invoices. Provider usage
sidecars are retained where the adapter supplies them; normal usage-ledger tracking
continues. Plans do not reserve a budget or authorize spending.

Interrupted locks are never stolen automatically. Inspect the receipt, confirm that
the process has stopped and reconcile the provider outcome before manually removing
its `.lock`/`.speech-lock` directory and credential slot under the system temporary
directory. Retrying an uncertain receipt requires an explicit new request ID.
Do not remove the receipt to disguise a potentially charged attempt.

WAV checks run locally; compressed ElevenLabs output requires `ffprobe` and `ffmpeg` on PATH.
Compressed payloads must decode without errors and produce audio samples.
These checks detect broken containers and invalid timings, not pronunciation,
emotional delivery, voice identity or transcript fidelity. Those remain `not_reviewed`
unless the user requests actual listening review.

### Local VoxCPM2 on Apple Silicon

Select speech engine `mlx-audio` and model `voxcpm2` for an offline WAV. Set `python` (the interpreter with mlx-audio installed) and `model` (the downloaded VoxCPM2 directory) to absolute paths in `~/.config/social-flow/voxcpm2.json`. The MCP process can override them with `VOXCPM2_PYTHON` and `VOXCPM2_MODEL_PATH`. The MLX-Serve GUI can be closed.

Use `tts_plan` with generator `tts_local_voxcpm2`, an output directory and a stable request ID. Supply `text` and `model` in `generation`. Execute by plan ID. For a new voice use `instructions`. For a recurring speaker pass the original `referenceAudio`. A continuation uses both `continuationAudio` and its verbatim `continuationText`. Both audio roles can be supplied together. Optional sampling controls are `steps`, `guidance` and `maxTokens`. Each plugin execution releases its local worker after the take.

For a character choose `voiceId: default`, speed 1, and the local engine. Cast and pin the audition through the usual character workflow. For episode dialogue copy the result of `speech_manage plan_audio`; it includes the pinned audio path, digest and scene revision. Attach the completed receipt. Hosted VoxCPM2 continues to use engine `astra-genai` with its gateway-registered voice ID.
