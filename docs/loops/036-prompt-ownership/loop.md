# Prompt ownership and the engine interface

User directives, 2026-11-25: a video model takes one prompt per call, so the prompt belongs
to the scene and is written where the session can read and adjust it; the gateway never
assembles one. Tools are grouped by media type and take the engine and model as parameters,
with shared parameters apart from an adapter's own.

The acceptance threshold is 95/100 with zero critical findings and a green
`cd server && HOME=$(mktemp -d) npm test`. The rubric below was written before any source
changed and stays as written for every round. Each round uses a fresh reviewer.

## Target

1. No request this plugin builds asks the GenAI gateway to write a prompt for a single model
   call. `shots[]` text leaves the GenAI text and image adapters. `sceneRendering` loses
   `single_msr` and `auto`. A scene that fits one model call is planned as one request whose
   prompt the planner composed, the plan shows as `promptTemplate`, and the author may replace
   under the existing bounded-edit rules.
2. `sceneRendering:"per_shot"` stays as the one named exception. The gateway's
   `/v1/ltx/v2/scene-to-video` renders each shot separately and writes each shot's prompt from
   the manifest; it has no field for a caller's prompt. The plugin reaches it only when a call
   names `per_shot`, and every such plan says that the gateway writes the prompts.
3. `video_plan`, `image_plan` and `music_plan` take `engine` and `model` as assertions against
   the saved selection. `video_catalog`, `image_catalog` and `music_catalog` return, for one
   engine and operation, the full parameter schema split into shared and adapter-specific
   fields. The video catalog reads its model notes and scene capabilities from the registry
   entries instead of a chain of tool-name branches.

## Evidence the target rests on

- Gateway source at `faa3909` (2026-11-25 00:52 KST) and again at `9d4cfe0`, its `main` at
  2026-11-25T02:04:18Z: `shot_prompt()` in `gateway/adapters/video_local.py` returns
  `body.prompt` when `shots` is absent and is the same text at both commits, and
  `ImageVideo.msr()` passes that prompt on. The routes the plugin keeps
  (`/v1/ltx/v2/image-to-video`, `/v1/ltx/v2/msr`) therefore add no words. This is read from
  source, not measured on a render.
- Production `GET /v1/ltx/v2/scene-to-video/capabilities`. Corrected 2026-11-25T02:16Z: the
  first read that day listed no `execution_modes`, and this bullet said that retiring
  `single_msr` and `auto` removed nothing production ran. A second read at 02:16Z, after the
  gateway session reported a deployment, lists `["auto","single_msr","per_shot"]`. The
  retirement therefore removes two modes production gained that day. The directive is the
  reason for it, not their absence.
- A scene body that names no `execution` renders one unit per shot. At `9d4cfe0`,
  `gateway/schemas/scene.py` line 164 returns the separate units unless `execution` is `auto`
  or `single_msr`, and `gateway/ltx.py` line 287 answers `single_msr` only for a single unit.
  HEAD also left `execution` out of a `per_shot` body, so that request is unchanged.
- The default planner already plans a three-shot, two-voice exchange as one
  `astra_genai_img2video` request with both samples bound (probe on `1cc75288`). It refuses a
  scene length off the 8k+1 frame grid and sends no composition image for a later shot
  (`shot_reference_omitted`). Both are unchanged here. The dev gateway's `single_msr` placed
  a later shot's image on its first frame as a guide; the gateway's own note says production
  runs did not reproduce such images.

## Out of scope

- The gateway repository. Its composing routes stay as they are until its owner decides.
- A caller-written prompt for each `per_shot` render. It needs a gateway field.
- A client for `/v1/generations` scene mode. The kept routes already take the prompt as
  written. The gateway session reports that mode in production since 2026-11-25T02:12Z: it
  takes an authored prompt with named references, and `GET /v1/models` lists
  `scene.shots.image:"timed_guide"` for `ltx-2.5-22b-distilled`. It could carry the later
  shots' images that the one-call route here leaves out. Not built or tested in this loop.
- Hiding or renaming the adapter tools, and a plan/execute pair for speech.
- Image `promptExtend`. It defaults to false and the adapter sends it as false.
  Corrected 2026-11-25 before round 1: this bullet also listed Desktop `promptProvenance` as
  an opt-in rewrite. Omitted, it meant the Desktop default `typed`, which lets the app's
  enhancement settings rewrite the prompt. The Desktop adapters now send `enhanced` for a
  written prompt, and that change is in scope.
- A vendor's own prompt rewriting. The MiniMax adapter sends
  `prompt_expansion_mode:"disabled"` for H3 Max and the HeyGen adapter
  `prompt_enhancement:"disabled"`. The Veo, Seedance and LTX API adapters name no such
  switch, so the vendor default applies there. Not measured.

## What changed

- `server/src/astra-genai-video.ts`, `astra-genai-tools.ts`: the GenAI text and image
  adapters take no `shots`. Their schemas are strict, so a call naming it is refused.
- `server/src/video-routing.ts`: `sceneRendering` accepts `per_shot` only
  (`scene_render_selection`). A `per_shot` plan carries `gateway_composed_prompt` beside the
  hashed manifest. Approval and execution refuse a saved plan under a retired mode
  (`video_plan_stale`) before any upload. `engine` and `model` on a plan call are checked
  against the saved selection.
- `server/src/genai-scene.ts`: the scene body names no execution, and a validation answer
  for another execution is refused. `validateScenePayload` and its `video_plan` flag are
  removed (added to the scope 2026-11-25 after a review): with no mode named it posted the
  shot manifest to `/v1/ltx/v2/image-to-video/validate`. The refusal report in
  `scene-video.ts` still reads the route's published schema and capabilities and sends
  nothing of the scene.
- `server/src/astra-genai-desktop.ts`: `buildDesktopBody` sends
  `promptProvenance:"enhanced"` for a non-empty prompt on text, image, audio and keyframes
  unless the call names a value. It is not a schema default, so plan arguments are unchanged.
- `server/src/adapter-parameters.ts` (new), the three registries, `handlers.ts`, `tools.ts`,
  `music-tools.ts`: the catalog tools take `engine` with `operation` (video, image) or
  `model` (music) and return `parameters.common` and `parameters.options`. The plan tools
  take `engine` and `model` as assertions.
- `server/src/video-registry.ts`: timed images, the scene renderer, model notes, the
  replacement tool and the voice limits are fields on the registry entries.
  `videoCatalog()`, `sceneInputCapabilities()` and `videoVoiceCapabilities()` read them.
- Intended lines in `skills/_shared/video-catalog.json` against HEAD (48 removed, 3 added):
  `shotDescriptions` leaves all 35 adapters, `shots` leaves the two GenAI field lists, the
  two scene renderers lose `executionModes` and `requiresUserChoice` and gain
  `promptWriter:"gateway"`, and the text-to-video note is reworded. The image and music
  projections are unchanged.

## Evidence before round 1

- Suite before round 1, `cd server && HOME=$(mktemp -d) npm test`, 2026-11-25, the author's
  run: 1,387 tests, 1,387 pass, 0 fail. The build exited 0. Each round's own run is in the
  round table.
- Plan ids against the committed build. `git archive HEAD server/dist skills` was unpacked
  beside the working tree with the same `node_modules`, the three-shot, two-voice fixture of
  `server/test/video-routing.test.mjs` was exported once, and each build planned a fresh copy
  of it at the same absolute path under `test/isolate.mjs`.
  - `sceneRendering:"per_shot"`: id `8e4e1514c6e9b358…97f58cac` on both builds.
  - No `sceneRendering`, through the `video_plan` handler: id `81b8e6b82e8d666c…776c9491`,
    the same prompt (sha256 `ec24a755…92b89fe3`, 1,186 characters) and the same
    `promptTemplate` (sha256 `e26ed84d…679546a9`) on both builds. The two outputs are
    byte-identical.
  - HEAD planned `auto` and `single_msr` for that directory. The working build refuses both.
- Submitted prompt equals the preview: the case "a three-shot exchange is one request
  carrying the prompt its plan showed, and the gateway-written modes are refused" captures
  the `POST /v1/ltx/v2/image-to-video` bodies of the planner's own plan and of an edited
  one. Its fixture has opening positions, which the planner writes into `args.prompt` ahead
  of the scene and the adapter does not repeat. This is shown for the GenAI distilled image
  route. Other engines' adapters were not captured.
- Production's capabilities answer of 02:16Z, with `execution_modes`, parses with the working
  build's `parseSceneCapabilities`.
- The Seedance reference adapter adds its notes to the prompt in `bindCharacterSources`,
  which the planner calls while building the plan, so they are in the preview.
- Between `faa3909` and `9d4cfe0` the gateway's `video_local.py` differs in a `sample_rate`
  argument and an error field name, not in how a prompt is handled.
- Retired plans: the case "a plan saved under a retired rendering mode never reaches the
  gateway, and the job it submitted is still collected". Approval and execution rebuild a
  saved plan first, and that rebuild answers `video_plan_stale` with no network call.
- Desktop: `buildDesktopBody` has one caller, `generateDesktopVideo`, at submission. The
  receipt fingerprint hashes the parsed call arguments and input file hashes, not the request
  body, so neither a plan id nor the receipt of an interrupted submission changes.
- `server/dist`: a second `npm run build` leaves every file under `server/dist` and
  `skills/_shared` byte-identical.
- D8 scan: 22 hits, all in the CLAUDE.md section that quotes the banned forms.
- Unchanged and reported, not fixed: the one-call plan for the fixture carries
  `scene_cut_timing_model_paced` and `shot_reference_omitted` for its second and third shots.

## Rubric

| Criterion | Points | Evidence for full credit |
| --- | ---: | --- |
| No gateway-written prompt outside `per_shot` | 30 | A captured request body for a multi-shot voiced scene carries one `prompt` equal to the plan preview and no `shots`, `description`, `dialogue` or `opening_positions` text. The GenAI text and image adapters refuse `shots`. `video_plan` refuses `single_msr` and `auto` with a coded message. A saved plan carrying a retired mode is refused before any upload or submission, reads as stale on replanning, and its in-flight job still downloads. |
| The author owns the one-call prompt | 20 | The scene the retired modes covered returns `promptTemplate` and `promptSlots`. An authored `prompt` reaches the submitted body with its names filled in. Speaker, line order and voice bindings hold. The bounded-edit refusals still apply. |
| `per_shot` is explicit and honest | 10 | Only the literal `per_shot` selects scene-to-video. No other input leads there. A validate answer naming another execution is refused. Each `per_shot` plan carries a coded warning that the gateway writes the prompts. An approved `per_shot` plan keeps the id it had before this change. |
| Engine, model and parameter schema (video) | 20 | `video_plan` accepts matching `engine` and `model` and refuses a mismatch without switching. `video_catalog` with an engine and operation returns `parameters.common` and `parameters.options` whose union equals the adapter schema's keys for every adapter. With no argument, and with `engine:"ltx-desktop-local"` alone, it answers as before. `videoCatalog()` and `sceneInputCapabilities()` hold no tool-name branch, and the catalog projection changes only on the intended lines. |
| Spending path and regressions | 10 | The full suite passes. Budget, approval, ledger and no-resubmission behaviour is unchanged. Existing `tool` and `operation` callers keep working. `server/dist` matches the source. |
| Documents | 10 | CLAUDE.md carries the dated directive and the sentences it supersedes are gone from CLAUDE.md, README.md, the shared video routing guide, the cut-video skill and the prompt research note. The tool descriptions match the behaviour. The D8 scan is clean for the files changed. |

Image and music receive the same `engine`, `model` and catalog parameters as video. They are
checked by the suite and are not scored.

Critical findings: a plugin path that sends gateway-assembled prompt text without the literal
`per_shot`; a submitted prompt that differs from the approved preview; a hidden engine or
model switch; a paid submission that can repeat; a failing suite; a claim in this record or
in the documents that the code does not support.

## Rounds

| Round | Score | Critical | Suite | Notes |
| --- | ---: | ---: | --- | --- |
| [1](verify-1.md) | 96 | 0 | 1,386 of 1,387 in the reviewer's run. The one failure, a Chrome case in `cover.test.mjs`, passed 11/11 alone. | Four minor findings on test coverage and the record's wording. Fixed, with the author's own scoping of "as written", before round 2. The score is superseded by the edits. |
| [2](verify-2.md) | 98 | 0 | 1,387 of 1,387 in the reviewer's run. | Four minor findings, none asking for a fix. The tree under review did not change after this round. The score is against this record's rubric, which keeps `per_shot` as a named exception: on that one path the gateway still writes the prompts. |
