# Video routing contract

Use `video_catalog` → `video_plan` → `video_approve` (the user's yes to that shot, or `auto:true`
for every shot) → `video_execute` for episode video. The registry
contains installed adapter contracts, not a vendor availability claim. MiniMax H3
and the official LTX API remain unimplemented; ASTRA is a separate self-hosted
LTX deployment. Do not substitute one for another.

## Layers and selection

`video-selection.js` reads the episode snapshot and uses the pure `resolveVideoChoice`
contract exported by `production-mode.js`. Production checks use that same resolver.
It resolves pre-existing episode/shot board
choices, explicit episode overrides, then explicit shot overrides. Within a scope,
the last explicit change wins. Workspace edits affect future snapshots only.
`video-registry.ts` owns adapter discovery and derives contracts from adapter schemas;
`skills/_shared/video-catalog.json` is its committed build projection for CommonJS planners.
`node skills/_shared/model-settings.js catalog` reads the same projection.

An override replaces the whole video selection; one naming Veo, Gemini Omni or Seedance 1.x
fails with `video_engine_unsupported`. Record the user's actual instruction:

```js
window.PRODUCTION.modelSettings = { overrides: [
  { scope: 'shot', shotId: 's1', request: 'Use Seedance 2.0 Fast for this shot',
    video: { engine: 'seedance', model: 'dreamina-seedance-2-0-fast-260128', resolution: '720p' } }
] };
```

`video_plan` accepts `episode`, `shotId`, a stable `requestId`, `operation` (text,
image, reference, audio, keyframe, control, extend, edit, retake) and adapter `args`.
Alternatively specify an exact `tool`. Conflicting tool/operation/model/resolution
or unknown arguments fail. Local input contents and prices are pinned in a saved plan.
ASTRA retake inherits source dimensions; planning probes the source and matches the
selected resolution without adding unsupported width/height fields.
Remote URL contents cannot be pinned; use immutable provider assets or local files.
Re-plan after changes. No network submission occurs during planning.

Character speech also uses the [voice continuity contract](../produce/references/voice-continuity.md).
The planner adds stable acoustic descriptions and, on audible Seedance reference
requests, pinned character samples with explicit speaker/image/audio mappings.
It saves original `sourceArgs` separately from the compiled request and records
`voiceContinuity` with hashes, warnings and four independent `not_reviewed` fields.
Revalidation includes dialogue, acting, cast voice settings and sample bytes.
The catalog's `voice.lane` is `reference` (sample imitation), `supplied` (animates supplied
speech) or `none`, with `voice.dialogue: allowed|refused`. `video_plan` refuses a spoken cut
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
provider billing first. This is an application reservation limit, not a provider-side
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
After a timeout or crash, inspect that provider ID at the provider and reconcile the
terminal state and billing. There is no automated provider polling/reconciliation
command yet. Do not release reservations, invent a new request ID or delete state
merely because the client timed out. A stale lock requires confirming its owning
process has exited before manually removing only `state.lock`.

Managed requests write the existing usage event stream once after dispatch, using
normalized arguments. Legacy cost reports remain estimates. Routing state is the
budget authority; repeated cached reads never add a charge. State, plans and input
hashes live under the episode's `.work/video-routing/` and are local artifacts.

## Compatibility and boundaries

Existing video tools accept `videoContext: {episode, shotId, requestId}` and use the
same service. Calls targeting a configured episode/workspace without context fail.
Standalone calls outside configured production remain compatible and have no episode
budget enforcement. The server cannot infer an arbitrary external workspace if neither
its working directory nor the output path points to that workspace.

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
