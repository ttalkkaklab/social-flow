# Video routing contract

Declare everyone who speaks in the story scene. Submit one scene with `video_plan {episode,sceneNo,requestId}`. The planner chooses an operation from the saved model and the authored inputs.

A scene is planned for one model call. The planner writes the scene's one prompt and returns it as `promptTemplate`. On the GenAI engine the scene is one `mode:"scene"` request to the gateway's common API (`astra_genai_scene`, user directive 2026-11-25): the request carries the prompt with its `{cast.role}` names, the gateway numbers them and adds no sentence, and each shot opens on its own composition picture. `video_plan` uploads the files and compiles the scene with `POST /v1/generations/validate`; a scene the gateway numbers, times or cuts differently from the plan is refused. The model paces the cuts. On the other routes a later shot's composition image the operation cannot send is named (`shot_reference_omitted`).

GenAI scene mode takes no supplied soundtrack, no ending or timed picture inside a shot and no line pinned to a frame, and it runs `ltx-2.5-22b-distilled`; such a scene is refused at planning (`scene_mode_audio_unsupported`, `scene_inputs_unsupported`, `scene_mode_model_unsupported`). One GenAI scene binds at most two pinned voices across its cuts. A scene without a cast picture sends its opening as an `object` reference as well. The clip renders on the next 8k+1 frame count and is cut back to the storyboard's frames. Execution posts the exact validated body under an `X-Request-Id` derived from it and keeps it beside the receipt, so `video_status` with `action:"refresh"` recovers a lost response by replaying that request, which returns the first job. A plan saved under a retired rendering mode reads `video_plan_stale`.

A plan call may name `engine` and `model`. They are checked against the saved selection and never change it (`model_selection_mismatch`).

Each generated shot needs a composition image before video planning. The scene opening can cover its first shot. For each later shot, attach `referenceImage` or a start image at the opening frame of its per-shot timeline. The selected operation determines which images the provider receives.

- Use an opening image for a picture with no visible dialogue. Keep off-screen-only speech and narration on the external soundtrack. Declare visual references for silent cast members whose appearance must carry through.
- Use audio-to-video when a finished scene-length recording must drive the performance, regardless of how many people speak on it. Generate a fresh speaking take for a changed line. Post-render lip-sync of synthesized speech to existing footage is forbidden, including after a failed native take or a voice change.
- For authored dialogue in pinned character voices, bind each speaker's sample to their identity. GenAI scene mode combines each shot's opening picture, up to four subject images and one background, and its first two subjects carry voice samples for the whole scene. A scene exceeding the selected model's capacity needs an authoring decision.
- Seedance 2.0 reference accepts up to nine images and three audio clips in one request. Its opening image guides composition. Veo can generate dialogue when the board explicitly selects `videoDirection.dialogueVoice: "model_generated"`. Its Standard/Fast asset mode accepts up to three images of one subject. The planner reports any required input the selected operation cannot send before approval.

Seedance 2.0 reference mode binds composition images by shot ID and numbered image within one scene request. Its image limit includes other reference images. A pinned first or last frame uses a different operation. Distilled LTX combined I2V takes its start and end frames separately from up to four scene-wide subject references and one background. A single character leaves three subject slots for other subjects or objects. These slots carry no shot index. The single-shot route may use its background slot for a composition guide when a subject is present. Inspect `sceneRequest.shotReferenceImages` for the disposition of each guide.

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

`video_plan` accepts `episode`, `sceneNo`, a stable `requestId`, `operation` (text,
image, reference, audio, keyframe, control, extend, edit, retake) and adapter `args`.
Alternatively specify an exact `tool`. Conflicting tool/operation/model/resolution
or unknown arguments fail. Local input contents and prices are pinned in a saved plan.
ASTRA retake inherits source dimensions; planning probes the source and matches the
selected resolution without adding unsupported width/height fields.
Remote URL contents cannot be pinned; use immutable provider assets or local files.
Re-plan after changes. No network submission occurs during planning.

### Scene frames and adapter inputs

For a single LTX generation, `story_scene.videoDirection.keyframes` can pin an intermediate action state, for example `[{"frame":64,"path":"images/handle-released.png"}]`. Frame numbers start at zero for the whole scene. Use `scene.frames.start` and `scene.frames.end` for the endpoints. The GenAI image-to-video request carries the interior images in `keyframes[]` alongside its endpoints and supported speaker references. Ordinary `referenceImage` entries keep their composition-only role. The generation plan identifies the image file and frame for each pin.

Write one shot per camera setup. A cut from a wide to a hand insert, or a reverse angle, starts a new card. A pan, tilt, dolly, zoom or entrance during continuous filming stays on its card. Set `videoDirection.oneTake` only for an explicitly uninterrupted scene. A duration or generation count does not specify the number of shots.

`story_scene.videoDirection.fps` sets the scene clock (default 24). Each `story_shot.timeline` records `startFrame` inclusive, `endFrame` exclusive, the incoming `transition` (open, hard_cut, dissolve or fade), and English `framing` and `action`. The board assigns stable shot IDs. Each `images[]` entry has a storyboard-relative `path`, scene `frame` and `role` (start, keyframe, end, face or outfit). Face/outfit entries name their `character`. An optional English `cue` describes the action at that frame. An ending pose may begin before the last frame. In one shot, keyframes guide continuous motion. At a cut the new setup must appear at the first frame of the next shot. Describe entrances on the shot timeline, including anyone who starts off screen.

`videoDirection.audio` names one scene-length file with any lead-in mixed in. Its `cues` pair scene frame numbers with actions. Frame 42 at 24 fps means 1.75 seconds from the beginning of the file. For per-shot generation the saved dev A2V model conditions each shot on its interval of the continuous file. Choose `audio.mode:"mix"` with distilled I2V to mix the complete file once with native dialogue and ambience. A post-production music selection alone does not request model conditioning. Omit `args.prompt`. The planner compiles the scene from every card, and an edited copy of its prompt goes in the top-level `prompt`. It collects existing frame pairs, intermediate pins and video references as well as explicit timeline entries. Conflicting temporal pins require a storyboard correction.

Keep each spoken line in its card’s narration. To start a reply on the cut, add
`timeline.dialogueCues:[{lineId:"s0001-l1",frame:171}]` to the incoming card.
Its `timeline.openingPositions` uses that card’s subject image numbers. The
scene manifest keeps each line with its shot interval, cast ID and selected
voice sample. Native speech without an explicit cue keeps model pacing.
The I2V refusal includes the deployed endpoint’s input fields when discovery
succeeds. A refused request has no reservation or provider job.

A single continuous shot with intermediate guides selects the indexed keyframe route on Desktop or direct ASTRA when the saved model leaves the operation open. An explicit operation still governs. Veo Standard and Fast accept up to three scene-wide subject pictures in an eight-second reference-only request; the Lite model has no reference route. Keep the cast’s opening positions and later entrances in the scene direction.

Set scene identity images in `story_scene.speakerReferences` and positions in `story_scene.videoDirection`. A creative revision after a terminal result takes a new request ID and names the previous one in `basedOnRequestId`.

**LTX contracts checked 2026-11-22; GenAI requests go through the common API since 2026-11-25**

| Operation | Images and cuts | Audio accepted in the same request |
|---|---|---|
| GenAI scene mode (`POST /v1/generations`), distilled | One request for 1–8 shots. Each shot opens on its own picture: the first is reproduced, a later one guides. Up to four subject pictures (cast and object references) and one background span the scene. The model paces the cuts; no ending or timed picture inside a shot. | The model's own soundtrack. The first two subjects carry pinned voice samples for the whole scene. No supplied track. |
| GenAI T2V (`text2video`) | One prompt, sent as written. Describe every cut in it. The adapter takes no `shots` text, and no per-shot frame address or image. | Generated sound or mute. |
| GenAI I2V (`image2video`), dev | Up to eight temporal images including endpoints. Shot descriptions go into the prompt. | Generated sound or mute. |
| GenAI I2V (`image2video`), distilled | Up to eight temporal images including endpoints. With explicit length and MSR image conditioning the same generation can use four subject references and one background. The two leading subjects can carry voice samples with backend support. Each subject slot spans the scene. | Generated sound or mute. Voice samples condition identity. |
| GenAI A2V (`audio2video`), dev | Up to eight temporal images including endpoints. The renderer conditions on their frame indices. | One supplied track sets the duration. |
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

For reference-mode shots, the planner binds each named principal’s sheet panels and selected voice. Set a camera subject and view or specify the body view per character in `visual.characterInputs`. Veo can carry visual references on eligible models. Native spoken performances need a voice-capable adapter.

Seedance reads visible principals, camera subjects and on-screen speakers on each card, including older boards. Give an ambiguous performer a body view or specify `visibility: "body_only"` or `"hands_only"` for that crop. A direct rear view uses the back panel. Set `visibility: "face_visible"` and a body view for a performer who turns to show their face. Keep a speaker heard over an insert in `off_screen` delivery. For a visible face, register the canonical sheet panel first. The managed plan pins the active account-scoped asset, the digest and the numbered provider slot. Read `characterBindings` beside the quote. A missing input appears in the storyboard and in the planning tool’s structured error, with no executable plan.

For a reviewed Seedance original, select `faceTaskId` and a storyboard-relative `faceReviewPath` on the same character input. The review JSON records `character`, `providerJob` and `status: "passed"` after checking that performer in the actual take. The planner pins the review digest and verifies the provider task. A failed or missing review requires a new appearance decision. See the [cast binding contract and retry rules](../../docs/research/2026-11-22-seedance-api/character-identity-design.md).

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
The retired [shot-render CLI](../produce/references/render-astra-shot.js) directs existing callers to the scene planner.
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

Existing video tools accept `videoContext: {episode, sceneNo, requestId}` and use the
same service. Video plans, approvals and execution require the destination's selected
workspace to be ready. A direct adapter call needs episode context or a channel asset
under that ready workspace. Calls without a selected project stop before generation.

Host selection returns `host_handoff`. The host CLI owns its tools, allowance and
execution; MCP cannot enforce those calls. `video_execute` refuses host plans rather
than substituting an API. Speech planning in snapshotted episodes derives synchronization
capabilities from the registry and rejects conflicting caller claims. Capabilities are
adapter input contracts, not a guarantee that generated lip movement is correct.

Migration: preserve snapshots and existing choices, obtain the installed catalog,
plan a complete scene, then move callers to plan/execute or add `videoContext`. Confirm
historical spend before the first managed call. Add a new provider by implementing
its adapter/schema and registering its deployment; update pricing and behavioral
tests, regenerate the catalog/bundle, then expose it in settings. Research alone
never enables an unimplemented API.

## Dialogue coverage and native renders

A shot keeps every line spoken in its view, replies included. Each native render binds the selected adapter's number of pinned voices, and `video_plan` reports a render over it (`scene_render_voice_limit`). A distilled LTX render can bind two pinned voices to the first two subject slots. A scene with cuts can use different subjects on successive child renders. The hosted reference adapters receive their own ordered pictures and voice samples. On their reference-only routes the opening picture guides composition. A hosted LTX audio-to-video request takes the composed track as `args.audioPath`.

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

## Model-specific scene prompts

`video_catalog {engine, operation}` returns each matching adapter's `sceneWritingGuide` with its parameters as JSON Schema: `parameters.common` holds the names that mean the same on every video adapter that takes them and `parameters.options` the adapter's own. A row whose model family has a reference page names it as `promptReference`. `video_plan` returns the ordered storyboard shots in `sceneRequest`, the selected writing rules in `promptProfile` and, in `promptGuidance`, the writing sentence for the selected model, its reference page and an `advice` entry for each count outside the range the vendor's guide recommends. Advice is said beside the plan: it never refuses one and is not part of the manifest an approval signs. The profile gives the cut timing style and reference labels for the selected operation and model version. The compiled prompt in `args.prompt` contains the actual directions. For ordinary cuts Veo gets time ranges, Seedance gets numbered shots (`Shot 1:`, `Shot 2:`) whose lengths the model paces, and voiced LTX MSR scenes get approximate holds. The planner retains the storyboard frame clock for review. A short prompt limit can remove a hold while keeping its speaker and line together.

Keep each physical action's starting state, performer, movement and ending state on its own card. Write who lets go, whose hands stay clear and what moves next when that order matters. A generated take can show the correct four views and reverse one of those actions. Check the original video before selecting a take or changing a model default. A comparison can keep the model, prompt, opening picture and settings fixed while changing one supported input.

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
| Continuous supplied speech | Dev A2V accepts the authored audio track. | Audio-to-video takes the supplied track, which sets the duration. | Veo can synthesize the authored dialogue when the scene permits model-generated voices. It cannot take a supplied recording. |

An explicit operation must agree with the scene speech route. The planner reports inputs that the selected deployment cannot represent before approval. The hosted LTX API uses `LTX_API_KEY`. Local LTX and gateway deployments retain their own settings.

For Google Cloud, enable the Vertex AI API in your billing project, grant the caller prediction access and configure Application Default Credentials (for local development, `gcloud auth application-default login`). Set `GOOGLE_CLOUD_PROJECT` in the MCP server's environment. For workload credentials, ADC also supports `GOOGLE_APPLICATION_CREDENTIALS`. Restart the MCP server after changing its environment. The adapter calls `us-central1-aiplatform.googleapis.com`. [Google Cloud authentication](https://cloud.google.com/docs/authentication/provide-credentials-adc) · [Veo model specifications](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate)

| Example saved video choice | Production use |
|---|---|
| `{"engine":"ltx-api","model":"ltx-2-5-pro","resolution":"1920x1080","operation":"audio"}` | Drive a clip with the supplied character track. Non-speaking shots use the existing image route. |
| `{"engine":"veo","model":"veo-3.1-fast-generate-001","resolution":"720p","operation":"image"}` | Animate a JPEG or PNG opening and optionally pin the ending. Set scene sound or use external narration. |

Veo also accepts text-only requests and extension of a 1–30 second 24 fps MP4 by seven seconds. A scene with a pinned opening uses the image route. These provider operations remain available for configured channel assets. Each call produces one local MP4. Lite (`veo-3.1-lite-generate-001`) supports text, frames and extension. Lite is a Google Cloud preview with fixed-quota or provisioned-throughput access. Check the project quota before selecting it. Standard supports 4K. Fast and Lite expose 720p/1080p. A saved Gemini Developer API preview ID requires an explicit model change. Rates in the episode estimate distinguish Google Cloud audio and silent seconds from the historical Gemini rate keys.

The Veo adapter sends one `instances` entry with an English `prompt`. Image requests carry `image` and optionally `lastFrame`. Reference requests carry `referenceImages` entries with `referenceType: "asset"`. Extension requests carry `video`. Local media becomes `{mimeType, bytesBase64Encoded}`. The `parameters` object includes `sampleCount: 1`, aspect ratio, resolution and the sound flag. Text and frame requests take 4, 6 or 8 seconds. Submit with `predictLongRunning`, then send the returned operation name to `fetchPredictOperation`. The local tool schemas in `tools/list` specify the required paths and defaults for each operation. [Veo API reference](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation) · [LTX API specification](https://docs.ltx.io/openapi.json)

Use `video_status` with the original request ID and `action:"refresh"` after an interrupted hosted LTX or Veo request. The provider job ID is recorded before polling. A submission with no known provider ID requires reconciliation; for a GenAI gateway request, `astra_genai_jobs` lists the token's recent jobs as evidence of whether it is still running, finished or failed. Repeated status reads never submit a generation.

### Adding a hosted provider

Implement wire requests and status decoding in a provider module. Register each operation in `server/src/hosted-video-routes.ts` with its input schema, model constraints, frame and sound capabilities, duration grid, configuration check, preflight, generator and status reader. The MCP tool definitions, dispatch, catalogue, duration planning and status recovery consume these registrations. Providers own authentication, data transfer and unit prices. Add the billing mapping to `usage-ledger.ts` and the rates to `prices.tsv`. Register model selection and any new image binding in the shared planner. A visual reference operation can declare voice support independently of its image inputs. Verify the existing LTX contracts and the new provider's mocked submit, poll, output and failure cases before building the distribution.
