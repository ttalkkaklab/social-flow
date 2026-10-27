# Image routing contract

Use `image_catalog` → `image_plan` → `image_execute`. The catalog lists installed
adapters and dated model contracts, not proof of provider access or perceptual quality.
`image_status` reads receipts and can explicitly reconcile an ambiguous terminal request.
No automatic model substitution, generation retry or subjective review gate exists.

## Layers

- `image-models.ts`: GPT aliases, retirement dates and token rates; MLX family capabilities.
- `image-registry.ts`: adapter/schema bindings, strict arguments, input image contracts.
- `image-selection.js`: snapshot/workspace choice and explicit scoped overrides.
- `image-routing.ts`: plan, revalidation, environment checks, dispatch and output receipt.
- `image-state.ts`: cross-process budget/concurrency/attempt reservations and recovery.
- `image-media.ts`: actual PNG/JPEG/WebP headers and output decode verification.
- `image-pricing.ts`: caller reservation estimates and reported-token cost calculations.

The build commits `image-catalog.json` for CommonJS settings; it is generated from
server contracts. Add an adapter by registering its schema and handler, explicit
capabilities and billing behavior, then rebuild the catalog and bundled server.
Do not claim research-only GPT 2.5, BFL, Krea, Model Studio or xAI APIs are installed.
Their implementation is separate from the existing local and host lanes.

## Images containing text: GPT Image 2 required

Owner directive, 2026-10-18: use `gpt-image-2` for every new generation or edit that
must display or preserve readable text, in any language. This includes signs,
posters, product labels, packaging, lettered clothing and wordmarks. It overrides
workspace/snapshot image defaults and host-first recommendations for these assets.
Before planning and quoting, record this standing directive as the actual request
in an explicit scoped override: `image: {engine:'gpt-image', model:'gpt-image-2'}`.
Use a shot override whose `shotId` matches `assetId` in the episode or workspace
board; the selector also uses stable IDs for branding assets. Keep the scope narrow;
do not change the workspace default for unrelated images. A host tool can serve the
asset only if its actual model is verifiably GPT Image 2; `host-managed` alone is
not evidence. Use the plugin adapter otherwise. Never substitute another model
when GPT Image 2 is unavailable; report the missing capability or credential.
This selects a model, not a new spending budget. Reuse existing authorization and
inspect actual spelling after generation; model choice does not certify correctness.
Preserve existing assets. Code-rendered typography does not invoke this model rule.

## Selection and planning

`directory` is an absolute episode or workspace directory. Episode snapshots win over
later workspace edits; a board's explicit image choice supports legacy episodes.
Explicit episode overrides apply next, then shot overrides whose `shotId` matches
`assetId`. Each override replaces the complete image choice and records the user's
actual request. Branding/character assets use stable asset IDs in the workspace.

```js
window.PRODUCTION.modelSettings.overrides = [{
  scope: 'shot', shotId: 's1', request: 'Use GPT Image 2 for this source frame',
  image: { engine: 'gpt-image', model: 'gpt-image-2', quality: 'low' }
}];
```

Plan without contacting providers:

```json
{
  "directory": "/absolute/workspace/data/channel/episodes/topic",
  "assetId": "s1",
  "requestId": "s1-source-attempt-1",
  "operation": "text",
  "reserveUsd": 0.5,
  "args": { "prompt": "A blue ceramic cup on a wooden table", "size": "1024x1024" }
}
```

Use `operation:text|edit|variation` or an exact adapter `tool`. Model/quality inherit
from selection; conflicting values and unknown arguments fail. Local references are
read and hashed before submission. Base64 GPT inputs are included in the private plan
hash. Outputs stay in `directory`; distinct attempts use distinct output files and
cannot overwrite inputs or previous assets. Saved plans contain prompts and reference
bytes; `.work/image-routing/` is a private local artifact and never committed.

Execute with `{directory, planId}`. Changed settings, authorization, reference bytes or
normalized contract require replanning. GPT retirement is checked before new calls,
never used to silently pick a replacement. Already completed receipts remain readable.

## Spending and operational gates

API plans require a positive `reserveUsd` estimate covering prompt, references and
output. It is an application reservation, **not a provider-enforced invoice ceiling**.
Auto quality, large references and retries can make flat output-only estimates wrong.
No API calls are made to obtain a quote. Local/host reservations are zero, excluding
hardware and subscription costs. Host calls remain outside server enforcement.

Reuse the actual user/standing spending instruction. Episodes record it in
`PRODUCTION.imageAuthorization`; workspace assets can use
`.social-flow/image-authorization.json` with the same object:

```json
{
  "reference": "Actual existing user instruction or standing spending authorization",
  "maxUsd": 5,
  "maxConcurrent": 1,
  "maxAttempts": 3
}
```

Settings and catalog inspection are not spending permission. No new approval is needed
when the existing authorization covers the work. Legacy video approval is not silently
reinterpreted as an image budget. If old image events/tallies exist, reconcile their
cost into `openingSpendUsd` before the first managed call; do not set it to zero merely
to pass the gate. Standalone calls outside configured production remain compatible
but have no workspace budget protection.

Transactions reserve cost and concurrency before dispatch, including ambiguous calls.
OpenAI SDK retries are disabled. Returned usage and provider request IDs are preserved;
reported token counts use dated Standard prices with no assumed cache discount.
Unmetered success keeps its reservation as an estimate. If reported cost exceeds the
reservation it is recorded in full and reduces the next available budget. Original
usage is evidence, while the conversion to USD is still a price-based calculation.

Quality stays `not_reviewed`. Output format/dimensions/hash and a one-frame decode are
checked; those checks do not certify legible text, visual grounding or identity.
Requested dimensions/steps are not presented as measured backend output.

## Recovery and compatibility

A `requestId` identifies one attempt. Completed calls return the same receipt after
checking output integrity. Pending/ambiguous calls never dispatch again, even after
settings change. Read `image_status` after interruption and inspect provider billing.
`action:reconcile` requires an evidence reference and verified `spentUsd`; use it only
after the provider job is terminal. For an interrupted `submitting` request, also
verify the executor has exited and pass `executorStopped:true`; a live local owner PID
is rejected. Older receipts without owner metadata require that explicit verification. It closes the request as failed, releases occupied
concurrency and preserves its charge and attempt count. It does not recover output or
resubmit. A subsequent authorized attempt needs a new request ID and output path.
A crash that leaves a lock requires verifying the owner has exited before removing
that lock; never steal a live process's lock.

Existing `gpt_image_*`, `image_local_generate`, `mlx_image_*` tools accept:

```json
{
  "imageContext": {
    "directory": "/absolute/episode",
    "assetId": "s1",
    "requestId": "s1-source-attempt-1",
    "reserveUsd": 0.5
  },
  "prompt": "A blue cup"
}
```

These entrypoints route through the same planner/service. The server detects configured
ancestors from cwd and output paths; an unrelated external workspace cannot be inferred
without context. A host plan returns `host_handoff`: execute with that host's current
tool schema and allowance, then inspect the actual image. `image_execute` never calls
an API on behalf of a host plan.

MLX accepts basic text generation for unknown packs, but advanced features require a
registered family. Krea uses strength-based variation, Mage uses an Edit pack, Qwen 2.1
supports nine extra references and optional native alpha on compatible servers. Qwen
Turbo accepts only its eight-step schedule. Model names identify contracts, not runtime
compatibility guarantees; server failures still surface without fallback.
