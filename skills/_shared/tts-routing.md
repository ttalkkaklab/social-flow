# TTS model and execution layers

The implemented speech contracts live in `tts-models.js`. The server's adapter
registry validates each raw payload, then invokes that provider's client. Saved
character voice settings and `compileActing` share the same exact model registry.
Unknown models fail; a provider failure never switches voices, models or providers.
The character compiler selects the model's direction syntax: legacy Gemini prompt,
Gemini 3.8 turn metadata, or ElevenLabs inline tags. Research candidates are not adapters.
Character limits in this registry are local adapter limits, not vendor token limits.

## Common tool

`tts_route` accepts:

- `action: "capabilities"`: read the six implemented model contracts without a key or generation.
- `action: "plan"`, `generator`, `generation`: parse the selected raw tool payload,
  apply defaults and report capabilities, tool enablement and warnings. No provider
  request or output directory is created. This is not a quote or spending approval.
- `action: "execute"`, the same `generator` and `generation`, plus a stable
  `requestId` (letters, digits, `_`, `-`, at most 100 characters). `generation.outputPath`
  is required so the receipt survives a restart. Use an absolute episode work directory.

Example plan:

```json
{"action":"plan","generator":"tts_gemini_38","generation":{"model":"gemini-3.8-flash-tts","voice":"Kore","turns":[{"text":"잠깐, 그 말 진심이야?","style":"Quiet disbelief, then a short pause."}],"outputPath":"/absolute/episode/.work/speech","filename":"line-01.wav"}}
```

Execute the returned `generation` with the same generator and a request ID such as
`episode-line-01-r1`. Reusing that ID in the same canonical output directory reuses
completed bytes only if arguments and audio/sidecar hashes match. It returns
`replayed: true` and does not add another usage entry. Changing text, voice or settings
requires a new ID. `speech_manage plan_audio` remains the character/line planning
entrypoint; its generator/arguments can be passed to this common tool.

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

The existing five raw synthesis tools remain available and share these runtime
checks. They allocate a fresh request ID per call, so callers needing restart-safe
replay must use `tts_route execute`. Auditions and the legacy checked wrapper use
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
