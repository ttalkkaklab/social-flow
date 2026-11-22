# Video routing contract

Use `video_catalog` → `video_plan` → `video_approve` (the user's yes to that scene or a standing `auto:true`) → `video_execute` for episode video. The registry
contains installed adapter contracts, not a vendor availability claim. The hosted LTX API and Google Cloud Veo register their operations in `server/src/hosted-video-routes.ts`. ASTRA deployments and local MLX use their existing adapter contracts.

## Layers and selection

`video-selection.js` reads the episode snapshot and uses the pure `resolveVideoChoice`
contract exported by `production-mode.js`. Production checks use that same resolver.
It resolves pre-existing episode/shot board
choices, explicit episode overrides, then explicit shot overrides. Within a scope,
the last explicit change wins. Workspace edits affect future snapshots only.
`video-registry.ts` owns adapter discovery and derives contracts from adapter schemas;
`skills/_shared/video-catalog.json` is its committed build projection for CommonJS planners.
`node skills/_shared/model-settings.js catalog` reads the same projection.

An override replaces the whole video selection; one naming Gemini Developer API Veo previews, Gemini Omni or Seedance 1.x
fails with `video_engine_unsupported`. Record the user's actual instruction:

```js
window.PRODUCTION.modelSettings = { overrides: [
  { scope: 'shot', shotId: 's1', request: 'Use Seedance 2.0 Fast for this shot',
    video: { engine: 'seedance', model: 'dreamina-seedance-2-0-fast-260128', resolution: '720p' } }
] };
```

`video_plan` accepts `episode`, `sceneNo` (or `shotId` for an explicit single shot), a stable `requestId`, `operation` (text,
image, reference, audio, keyframe, control, extend, edit, retake) and adapter `args`.
Alternatively specify an exact `tool`. Conflicting tool/operation/model/resolution
or unknown arguments fail. Local input contents and prices are pinned in a saved plan.
ASTRA retake inherits source dimensions; planning probes the source and matches the
selected resolution without adding unsupported width/height fields.
Remote URL contents cannot be pinned; use immutable provider assets or local files.
Re-plan after changes. No network submission occurs during planning.

### Scene frames and adapter inputs

Write one shot per camera setup. A cut from a wide to a hand insert, or a reverse angle, starts a new card. A pan, tilt, dolly, zoom or entrance during continuous filming stays on its card. Set `videoDirection.oneTake` only for an explicitly uninterrupted scene. A duration or generation count does not specify the number of shots.

`story_scene.videoDirection.fps` sets the scene clock (default 24). Each `story_shot.timeline` records `startFrame` inclusive, `endFrame` exclusive, the incoming `transition` (open, hard_cut, dissolve or fade), and English `framing` and `action`. The board assigns stable shot IDs. Each `images[]` entry has a storyboard-relative `path`, scene `frame` and `role` (start, keyframe, end, face or outfit). Face/outfit entries name their `character`. An optional English `cue` describes the action at that frame. An ending pose may begin before the last frame. In one shot, keyframes guide continuous motion. At a cut the new setup must appear at the first frame of the next shot. Describe entrances on the shot timeline, including anyone who starts off screen.

`videoDirection.audio` names one scene-length file with any lead-in mixed in. Its `cues` pair scene frame numbers with actions. Frame 42 at 24 fps means 1.75 seconds from the beginning of the file. For per-shot generation the saved dev A2V model conditions each shot on its interval of the continuous file. Choose `audio.mode:"mix"` with distilled I2V to mix the complete file once with native dialogue and ambience. A post-production music selection alone does not request model conditioning. Omit `args.prompt` and `args.shots`. The planner compiles the scene from every card. It collects existing frame pairs, intermediate pins and video references as well as explicit timeline entries. Conflicting temporal pins require a storyboard correction.

Keep each spoken line in its card’s narration. To start a reply on the cut, add
`timeline.dialogueCues:[{lineId:"s0001-l1",frame:171}]` to the incoming card.
Its `timeline.openingPositions` uses that card’s subject image numbers. The
scene manifest keeps each line with its shot interval, cast ID and selected
voice sample. Native speech without an explicit cue keeps model pacing.
The I2V refusal includes the deployed endpoint’s input fields when discovery
succeeds. A refused request has no reservation or provider job.

A single continuous shot with intermediate guides selects the indexed keyframe route on Desktop or direct ASTRA when the saved model leaves the operation open. An explicit operation still governs. Veo Standard and Fast accept up to three scene-wide subject pictures in an eight-second reference-only request; the Lite model has no reference route. Keep the cast’s opening positions and later entrances in the scene direction.

For a protected storyboard, pass `shotBindings` with the exact shot IDs. Each entry can name existing reference IDs with their cast IDs and roles, opening positions and dialogue cues. A revision can also supply shorter framing and action directions, within-shot keyframes, or MSR negative guidance. For a reviewed camera move, set the card’s `motionPrefix` to a matching MP4 of 9–121 frames on the 8k+1 grid. The renderer fixes its latent frames in both diffusion stages. For a reply on a specific cut, set `performanceAudio` to the timed stereo 48 kHz PCM WAV containing the line and its room sound. Include the selected voice sample as a separate identity reference. Fit the recording to the native frame count, including its short tail. The plan records these choices and hashes its media before approval. The gateway validates the staged files and the chosen model’s limits. On a lost response, `video_status` with `action:"refresh"` looks up the original scene request. A creative revision after a terminal result takes a new request ID and names the previous one in `basedOnRequestId`.

**LTX contracts checked 2026-11-22**

| Operation | Images and cuts | Audio accepted in the same request |
|---|---|---|
| GenAI v2 scene-to-video, distilled | With explicit consent, `sceneRendering:"per_shot"` stages the original files and validates the complete scene against the running renderer. Each card has its own temporal pins and cast references. The worker trims each shot and joins the frames at the authored hard cuts. | A single native soundtrack in shot order. Each shot carries its speakers, lines, voice samples and sound direction. A frame-cued line requires a prepared performance WAV. Both diffusion stages condition on its audio, and the renderer returns the original waveform. Review the words and timing in the output. |
| GenAI v2 T2V | Prompt plus 2–4 optional shot descriptions. Later shots can request a hard cut in text. No per-shot frame address or image. | Generated sound or mute. |
| GenAI v2 I2V, dev | Up to eight temporal images including endpoints. Shot descriptions go into the prompt. | Generated sound or mute. |
| GenAI v2 I2V, distilled | Up to eight temporal images including endpoints. With explicit length and MSR image conditioning the same generation can use four subject references and one background. The two leading subjects can carry voice samples with backend support. Each subject slot spans the scene. | Generated sound or mute. Voice samples condition identity. |
| GenAI v2 A2V, dev | Up to eight temporal images including endpoints. The renderer conditions on their frame indices. | One supplied track sets the duration. |
| Desktop T2V / I2V / A2V | T2V takes text. I2V takes first/last. A2V takes an optional first image. None declares timed cuts or subject slots. | A2V takes one supplied track. |
| Desktop keyframes / direct ASTRA keyframes | Respectively 1–10 / 2–8 images with frame indices. Temporal conditioning interpolates within a shot. Neither operation exposes a frame-addressed hard cut. | No supplied track in the keyframe request. Desktop also requires an active compatible offering. |

The production [OpenAPI](https://genai.astravision.co.kr/openapi.json) exposes `VideoShot.description`, optional `audio` (text) and `transition`; the [gateway mapper](https://github.com/ASTRA-TECHNOLOGY-COMPANY-LIMITED/genai-gateway/blob/330717ba568710cac2f14130c32de6e52f90adb1/gateway/adapters/video_local.py#L141) converts those entries into prompt sentences. The official [LTX pipelines](https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-pipelines/docs/pipelines.md) support indexed image conditioning and zero-blend chunk seams. The official [A2V implementation](https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-pipelines/src/ltx_pipelines/a2vid_two_stage.py) accepts images alongside conditioning audio. These Python inputs and chunk seams do not supply arbitrary frame-addressed cuts in the v2 HTTP API.

`scene_inputs_unsupported` reports the complete requested scene and every unmapped input. No executable plan ID is issued. A gateway for the full busking scene needs to expose and implement timed images, two frame-addressed cuts and one continuous supplied track together, retaining identity references separately when requested. The offline multipart adapter in the EP01 regression exercises that contract without publishing an endpoint or submitting a job. A compatible subset, such as a one-shot A2V with first/last images, uses the real adapter and its existing request body.

GenAI I2V on `ltx-2.5-22b-distilled` can combine a first image, optional last
image and four subject references plus one background. `video_plan` keeps the
temporal frames distinct from `references` and hashes every submitted local
image. Execution checks the gateway's `image_conditioning` MSR capability
before upload/submission; an unsupported combination never drops references or
switches the saved model. Dev takes temporal pins. Direct Desktop I2V takes
the two endpoints. See [GenAI image conditioning](astra-genai.md).

For a shot with `visual.frames.mode: "reference"`, a named `visual.character` and a front, rear or profile subject view, the planner reads the face and directional body panel from the cast sheet. For explicit control set `visual.characterInputs: [{character:"seorin", bodyView:"front"}]`. Include every visible principal, specify ambiguous views per character, and keep the spoken line in narration. The plan’s `characterInputs`, `imageBindings` and `voiceContinuity.speakers` show which files and slots the adapter can carry. A missing required panel or selected voice blocks approval. Seedance also accepts a character’s `faceTaskId` for a recent eligible same-account original. The plan records the stable task ID and the adapter obtains the signed video URL when it submits. Veo can carry the visual references on eligible models. A speaking shot that requires the actor’s WAV needs a voice-capable adapter.

Character speech also uses the [voice continuity contract](../produce/references/voice-continuity.md).
The planner adds stable acoustic descriptions and, on audible Seedance reference
requests, pinned character samples with explicit speaker/image/audio mappings.
It saves original `sourceArgs` separately from the compiled request and records
`voiceContinuity` with hashes, warnings and four independent `not_reviewed` fields.
Revalidation includes dialogue, acting, cast voice settings and sample bytes.
The catalog's `voice.lane` is `reference` (sample imitation), `supplied` (animates supplied
speech), `conditional_reference` (GenAI distilled I2V with subject images) or `none`.
For the conditional lane, `voice.dialogue` is `requires_subject_references`. Keep the opening
frame in `imagePath` and place each voice sample in its subject reference’s `audioPath`. `video_plan` refuses a spoken cut
on a `none` lane as `voice_lane_required`; narration over a non-speaking picture passes on any
adapter. These fields never certify perceptual consistency or exact lip sync.

`video_execute` takes `episode` and `planId`. It rechecks selection, inputs, prices,
provider configuration and disabled-tool settings, then reserves budget under an
exclusive filesystem lock before dispatching the adapter. It never switches engines.
Quality scores, storytelling choices and review stamps are not execution gates.

## Spending authorization and receipts

`PRODUCTION.videoAuthorization.maxUsd` is the one ceiling routing enforces; when it is
absent, routing falls back to the legacy quote — `PRODUCTION.approval` (its
`quoteFingerprint` must still match the board), `videoBudgetUsd` and `maxAttempts`.
The channel's `video_budget_usd` and the project's `production.episodeBudgetUsd` are
planning ceilings routing never reads; the author carries the applicable one into
`maxUsd`. For an explicit spending instruction not represented by the legacy quote,
record its reference and limits without manufacturing approval:

```js
window.PRODUCTION.videoAuthorization = {
  reference: 'The actual user instruction or standing authorization reference',
  maxUsd: 10, maxConcurrent: 1, maxAttempts: 3
};
```

Limits apply per episode across processes on a local filesystem. The cap includes
completed estimated/settled costs, pending reservations and imported historical
video events. Unknown historical spending stops migration; reconcile it against
provider billing first, then record the total as `videoAuthorization.openingSpendUsd`,
which replaces the event import when the episode's routing state is first created. This is an application reservation limit, not a provider-side
guaranteed invoice cap. Self-hosted API cost is zero; infrastructure is excluded.
Seedance reserves padded pixel costs and maximum reference duration, then settles
reported completion tokens. Other providers retain the quoted estimate, explicitly
not measured billing. Provider price changes can exceed a pinned estimate.

A stable `requestId` identifies one logical attempt. Completed requests return the
cached result. Pending or ambiguous requests never submit again. Managed ASTRA audio requests bind
`maxAttempts: 1`; explicit multi-generation adapter retries are rejected. Use the
episode attempt limit for separately tracked attempts after a terminal result.
The one documented exception to the plan route is the ASTRA audio-conditioned shot
(`skills/produce/references/render-astra-shot.js`, owner directive 2026-10-17): it submits
through the ASTRA runtime with the composed speech WAV and records a provisional candidate;
its reseed count is that script's own setting, and each reseed is a separately recorded request.
If an adapter unexpectedly submits multiple jobs, every reported provider ID is
retained and the request remains ambiguous even if the adapter returns an earlier clip. `video_status`
reads the original provider ID, reserved cost, tokens and result without network I/O.
A request the provider explicitly rejected (a 4xx on submission, an adapter error before
submission, or a job the provider reports failed) closes as `failed` and frees its
concurrency slot; one never submitted is settled at $0, a submitted one keeps its
reservation until reconciled. After a timeout or crash, inspect that provider ID at the
provider, then close the request with `video_status action:reconcile` with the terminal
`evidence` and the verified `spentUsd` (`executorStopped:true` for a request still marked
submitting). Do not release reservations, invent a new request ID or delete state
merely because the client timed out. A `state.lock` whose owning process has exited on
this host, or that is older than a minute, is recovered by the next transaction.

Managed requests write the existing usage event stream once after dispatch, using
normalized arguments. Legacy cost reports remain estimates. Routing state is the
budget authority; repeated cached reads never add a charge. State, plans and input
hashes live under the episode's `.work/video-routing/` and are local artifacts.

## Compatibility and boundaries

Existing video tools accept `videoContext: {episode, shotId, requestId}` and use the
same service. Video plans, approvals and execution require the destination's selected
workspace to be ready. A direct adapter call needs episode context or a channel asset
under that ready workspace. Calls without a selected project stop before generation.

Host selection returns `host_handoff`. The host CLI owns its tools, allowance and
execution; MCP cannot enforce those calls. `video_execute` refuses host plans rather
than substituting an API. Speech planning in snapshotted episodes derives synchronization
capabilities from the registry and rejects conflicting caller claims. Capabilities are
adapter input contracts, not a guarantee that generated lip movement is correct.

Migration: preserve snapshots and existing choices, obtain the installed catalog,
plan a single shot, then move callers to plan/execute or add `videoContext`. Confirm
historical spend before the first managed call. Add a new provider by implementing
its adapter/schema and registering its deployment; update pricing and behavioral
tests, regenerate the catalog/bundle, then expose it in settings. Research alone
never enables an unimplemented API.

## Single-speaker shots and MSR routing

Split every speaker change before final camera icons and images. Each shot has at most
one speaking character, while a silent listener may share the picture. For a saved
GenAI MSR (`operation:"reference"`) project, silent and voiceover-only shots resolve to
`operation:"image"` with the same engine/model/resolution. This is the standing
2026-11-09 operation rule, not a provider fallback. Explicit MSR requests for those
shots fail before generation (`msr_speech_route`); multiple speakers report
`shot_speaker_limit`. The hosted reference lanes (`minimax_reference`,
`heygen_reference`) follow the same rule (`reference_speech_route`): they get the cast's
panels, the start image as the last picture (not a pinned first frame) and the speaker's
sample, and silent shots plan `operation:"image"`. A saved `ltx-api` selection plans
spoken shots with `operation:"audio"` and the composed pinned-voice track as `args.audioPath`. Split physical speech and inner thoughts into their own shots.

Use the composed opening image, `generateAudio:false` and closed-mouth action for
thoughts. `speech_manage` plans external TTS voiceover and binds assembly to
`sound.audioSource:"speech"`. Generate/attach the character's pinned TTS, compose real
measured intervals with action and lead-in/tail-out, and plan the full video coverage.
Missing speech setup must be reported; it does not authorize a new voice or native MSR.

GenAI and LTX API image-to-video plans without dialogue default to a scene soundtrack.
Describe the room tone and the sounds made by visible actions. Set `generateAudio:false`
when effects and ambience will be supplied in the edit.

## Plans, candidate takes and local review

`video_plan` compiles the storyboard's `performance` events and the current camera
settings through the same compiler as `speech_manage plan_video`. It preserves action
order, concurrent speech/action groups and lead-in/tail-out. Attached, hash-matching
speech can supply measured intervals; native speech stays `model_timed` until measured.
Do not invent timestamps for unresolved speech. MSR dialogue is still added once, with
its actual image/audio bindings. Passing `args.prompt` bypasses this compilation and
returns a warning; prefer updating the board and omitting that argument.

Optional `visual.references[].preserve` and `.avoid` are arrays of English instructions.
They say what to retain and what not to copy from that reference. Image authoring keeps
these fields when refreshing the same reference, and video mapping carries them to the
actual input slot. A reference used only for the opening image is not claimed as a
separately submitted video input.

Use `purpose: "draft" | "final" | "revision"`, `basedOnRequestId` and `changeNote` on
`video_plan` to compare takes. These fields do not change models or resolution. An
optional cheaper draft uses a supported, explicitly selected setting; never switch the
saved model silently or force every shot through two generations. A new high-resolution
take can drift from the draft. Every attempt keeps its own output filename, plan and
receipt; execution refuses to overwrite another candidate. These are all real attempts
under the existing budget and concurrency limits, not extra free retries.

`video_status {episode}` reads the episode's candidate list without provider calls.
`storyboard_read.videoProduction` returns the same view. The shared board shows the
saved authored prompt, final adapter prompt, reference/voice mappings, changed inputs,
candidate lineage, attached file, costs and recorded runtime endpoint. Completed-shot
counts deduplicate attempts and require a local output; review counts remain separate.
Only a matching bound file with explicit review evidence counts as reviewed. A missing
background hash check leaves claimed review passes unverified (`reviewedShots: null`),
not zero; an explicit read or HTML export verifies the attached bytes. A missing
runtime observation or unmeasured duration is unknown, never a fabricated healthy state
or ETA. API cost zero excludes hardware and elapsed time.

The board loads `video-production-data.js`, a local snapshot refreshed by planning,
state changes, storyboard/speech edits or `storyboard-html.js`. Reload the page after
changes. Background exports do not rehash all media; an explicit read/export checks
input bytes. The snapshot is advisory and cannot execute, approve, attach or retry a
request. Use `speech_manage attach_video` for a chosen take so existing speech and
performance binding checks still apply. Provider credentials, full result payloads,
signed URLs and arbitrary request fields are not included in the snapshot.

When repairing a reviewed defect, start with the smallest applicable change: trim an
ending, adjust volume, upscale resolution, revise speech, or fix the source image or
staging before regeneration. Keep the original file. Dubbing native dialogue can break
lip sync; do not apply it automatically. Unknown submissions retain their original
request ID and reservation; the review view supplies the same-request status command.

## LTX and Google Cloud Veo

Select the engine, model and resolution in the project's video settings. The operation is optional. Use the same managed call across the gateway LTX, hosted LTX and Google Cloud Veo deployments:

```json
{"episode":"/absolute/episode","sceneNo":1,"requestId":"scene-1","maxCostUsd":2}
```

The planner reads the saved choice and the storyboard. Each provider adapter serializes its own request. A numeric `maxCostUsd` caps the planned reservation. The gateway needs an explicit reservation and uses that amount when no legacy `args.reserveUsd` was supplied. Hosted adapters compute their quote from their price table. Approve and execute the resulting plan ID in the usual way.

| Storyboard input | Gateway LTX | Hosted LTX | Google Cloud Veo |
| --- | --- | --- | --- |
| First and optional last frame | Image-to-video, `image_uri` and `last_frame_uri` | Image-to-video, `image_uri` and `last_frame_uri` | Image-to-video, `image` and `lastFrame` |
| Character references | Distilled I2V combines the opening with subject images when supported. Spoken MSR accepts subject images and a background. | The image endpoint requires an opening and has no subject slots. | Standard/Fast accept 1–3 images of one subject for eight seconds. A timeline pin cannot accompany the assets. |
| Continuous supplied speech | Dev A2V accepts the authored audio track. | Audio-to-video takes the supplied track, which sets the duration. | The managed planner reports unsupported dialogue or supplied scene audio. |

Explicit operations and existing per-shot settings remain available. The planner reports inputs that the selected deployment cannot represent before approval. The hosted LTX API uses `LTX_API_KEY`. Local LTX and gateway deployments retain their own settings.

For Google Cloud, enable the Vertex AI API in your billing project, grant the caller prediction access and configure Application Default Credentials (for local development, `gcloud auth application-default login`). Set `GOOGLE_CLOUD_PROJECT` in the MCP server's environment. For workload credentials, ADC also supports `GOOGLE_APPLICATION_CREDENTIALS`. Restart the MCP server after changing its environment. The adapter calls `us-central1-aiplatform.googleapis.com`. [Google Cloud authentication](https://cloud.google.com/docs/authentication/provide-credentials-adc) · [Veo model specifications](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate)

| Example saved video choice | Production use |
|---|---|
| `{"engine":"ltx-api","model":"ltx-2-5-pro","resolution":"1920x1080","operation":"audio"}` | Drive a clip with the supplied character track. Non-speaking shots use the existing image route. |
| `{"engine":"veo","model":"veo-3.1-fast-generate-001","resolution":"720p","operation":"image"}` | Animate a JPEG or PNG opening and optionally pin the ending. Set scene sound or use external narration. |
| `{"engine":"veo","model":"veo-3.1-generate-001","resolution":"720p","operation":"reference"}` | Generate eight seconds from one to three subject pictures. Keep temporal frames out of this request. |

Veo also accepts text-only requests and extension of a 1–30 second 24 fps MP4 by seven seconds. A scene with a pinned opening uses the image route. Text and extension requests use an unpinned shot or a configured channel asset. Each call produces one local MP4. Lite (`veo-3.1-lite-generate-001`) supports text, frames and extension. Lite is a Google Cloud preview with fixed-quota or provisioned-throughput access. Check the project quota before selecting it. Standard supports 4K. Fast and Lite expose 720p/1080p. A saved Gemini Developer API preview ID requires an explicit model change. Rates in the episode estimate distinguish Google Cloud audio and silent seconds from the historical Gemini rate keys.

The Veo adapter sends one `instances` entry with an English `prompt`. Image requests carry `image` and optionally `lastFrame`. Reference requests carry `referenceImages` entries with `referenceType: "asset"`. Extension requests carry `video`. Local media becomes `{mimeType, bytesBase64Encoded}`. The `parameters` object includes `sampleCount: 1`, aspect ratio, resolution and the sound flag. Text and frame requests take 4, 6 or 8 seconds. Submit with `predictLongRunning`, then send the returned operation name to `fetchPredictOperation`. The local tool schemas in `tools/list` specify the required paths and defaults for each operation. [Veo API reference](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation) · [LTX API specification](https://docs.ltx.io/openapi.json)

Use `video_status` with the original request ID and `action:"refresh"` after an interrupted hosted LTX or Veo request. The provider job ID is recorded before polling. A submission with no known provider ID requires reconciliation. Repeated status reads never submit a generation.

### Adding a hosted provider

Implement wire requests and status decoding in a provider module. Register each operation in `server/src/hosted-video-routes.ts` with its input schema, model constraints, frame and sound capabilities, duration grid, configuration check, preflight, generator and status reader. The MCP tool definitions, dispatch, catalogue, duration planning and status recovery consume these registrations. Providers own authentication, data transfer and unit prices. Add the billing mapping to `usage-ledger.ts` and the rates to `prices.tsv`. Register model selection and any new image binding in the shared planner. A visual reference operation can declare voice support independently of its image inputs. Verify the existing LTX contracts and the new provider's mocked submit, poll, output and failure cases before building the distribution.

For an I2V scene refusal, set `validateScenePayload: true` on `video_plan` to send the saved model, geometry, shot images, voice samples, cut frames and dialogue to the gateway’s validation-only route. The planner first checks that the route and submission endpoint use the same schema. The response records the request ID and the validation result. A schema check does not create a generation job.
