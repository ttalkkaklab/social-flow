# Per-model guidance in the scene-to-video flow

User directive, 2026-11-25: analyse the scene-to-video flow and improve it as recommended
after the [reference limits study](../../research/2026-11-25-reference-limits/index.html),
then improve it under adversarial review until it scores 95 or more.

The acceptance threshold is 95/100 with zero critical findings and a green
`cd server && HOME=$(mktemp -d) npm test`. The rubric below was written before any source
changed and stays as written for every round. Each round uses a fresh reviewer. The loop
stops after five rounds at the latest. The loop skill asks the user to confirm the rubric and
the round cap; the user set the bar in the request and was not asked again, so both are the
author's choice and are stated here.

## Where the flow stood

`video_plan {episode, sceneNo}` builds one request per scene: the board's shot cards become
one prompt (`scene-prompt.ts`), the cast's pictures and voice samples become numbered
references, and the adapter's hard limits are checked before a quote. The study found three
gaps in that path.

- A vendor's guide recommends less than its API accepts. Seedance 2.0 accepts nine images
  and its guide reports less stable output past four reference people and recommends four
  to five assets in all. The planner checked only the hard limits, so a plan inside them
  said nothing.
- The Seedance 2.0 guide says the series follows shot numbers and does not follow
  timestamps; the 2.5 guide takes either. The planner wrote "Then cut directly." between
  shots on both. Corrected 2026-11-25 before round 1: the sentence about shot numbers and
  timestamps is in the 2.5 guide's comparison of the two series. The 2.0 guide itself
  recommends `Shot 1`, `Shot 2` identifiers and calls precise timing unstable.
- `video_catalog` gave one writing sentence per adapter, the same for Seedance 2.0 and 2.5,
  and no page said what each model family's guide recommends below its limits.

## Target

1. **Recommended ranges are reported.** `video_plan` returns `promptGuidance.advice`, a list
   of `{code, detail}`, when a request is inside the adapter's limits and outside the range
   the vendor's guide recommends: Seedance 2.0 past four reference people or five reference
   assets; Seedance 2.5 past eight image subjects, past five voice subjects or with a voice
   sample outside 5 to 10 seconds. Nothing is refused and the plan id does not change.
2. **The writing guide follows the model.** A plan's `promptGuidance` carries the writing
   sentence for the selected model and the path of that model family's reference page.
   Each `video_catalog` row whose family has a page names it as `promptReference`.
3. **Seedance scenes number their shots.** A Seedance scene prompt of two or more shots
   introduces each as `Shot N:` on both series. An authored prompt or saved draft written
   against the earlier wording still plans.
4. **One reference page per model family** under `skills/generate-cut-videos/references/`
   for MiniMax H3 (hosted and FastH3), LTX-2.5 with MSR, and Seedance 2.0 and 2.5, linked
   from the generate-cut-videos and storyboard skills. A page adds the recommended ranges,
   what the planner writes for that family and what to change on the board when a take
   fails. A fact another document already holds is linked, not repeated.
5. **The H3 prompt structure is tested before it is changed.** MiniMax publishes a
   six-section prompt format for H3 reference renders. The planner's current FastH3 prompt
   and a six-section prompt for the same scene are rendered on the local FastH3 build with
   the same references, frame count and two seeds, under a decision rule written before the
   takes are viewed. The compiler changes only if the rule says so. The record is in this
   directory.
6. **The FastH3 frame ceiling is reported.** The adapter accepts 362 frames. The model's
   published reference pipeline stops at 15 seconds, which is 345 frames on the `17k+5`
   ladder. A FastH3 plan past 345 frames says so in `promptGuidance.advice`.

## Out of scope

- A free-form prompt rewriter, and the vendors' own rewriter skills (`h3-prompt-writing`,
  `sd25-pe`). They would replace the bounded edit of 2026-11-25 and need the user's decision.
- Reordering Seedance references by first appearance, which the 2.5 guide recommends. The
  planner numbers references by cast order and this loop does not change it.
- Dropping the front-view panel from Seedance 2.0 requests to reach the recommended asset
  count. The report names the count; the reference contract stays.
- The `exclusiveMinimum` schema error that hid `astra_genai_img2video`, `astra_genai_msr` and
  `shot_prompt` from this session's host. Commit `735379ff` on dev already writes a number
  there; the working build lists 170 tools with no boolean bound. The installed plugin
  (0.128.0) predates it.
- The gateway repository, hosted renders and any spending. Nothing here was rendered on
  Seedance, hosted MiniMax or the production gateway.
- `docs/research/2026-11-25-reference-limits/`, `docs/README.md` and `docs/index.html`,
  which the earlier request of the same day changed and which were already in the tree.

## Rubric (frozen 2026-11-25, before any source change)

| # | Criterion | Weight | Award rule | Evidence | Critical |
|---|-----------|--------|-----------|----------|----------|
| 1 | Completeness: each of the six target items exists and is reachable the way the target says | 36 | 6 per item that holds in full; an item that is partly present, a placeholder or unreachable earns 0 | file:line and an executed call per item | yes |
| 2 | Objective gate: `cd server && HOME=$(mktemp -d) npm test` exits 0 | 20 | all or nothing | command and exit code from the reviewer's own run | yes |
| 3 | Reports never refuse, and earlier work still plans: no request that planned before the change is refused after it; plan ids change only for Seedance scenes of two or more shots; an authored prompt in the earlier wording still plans | 14 | 14 minus 7 per refuted case, floor 0 | an executed probe per claim | yes |
| 4 | Tests cover the changed behavior in the owning module's test file and assert structure, not prose | 10 | 10 × (covered behaviors / changed behaviors), rounded down. Behaviors: each advice code, the unchanged plan id, shot numbering, the earlier-wording draft, the per-model guide, the catalog page path | test file:line per behavior | no |
| 5 | Accuracy: every vendor figure in code, pages and this record traces to the cited source or is labelled as this project's own or unmeasured; no sentence in `skills/`, `docs/` or `CLAUDE.md` is made false by the change | 12 | 12 minus 3 per false, unsourced or stale statement, floor 0 | source excerpt or file:line per check, at least eight checks | no |
| 6 | Scope and conventions: changed files stay inside the target; repository prose is English; the D8 scan adds no hit; `server/dist` and `skills/_shared/video-catalog.json` are rebuilt and a second build leaves them byte-identical; one test file per module | 8 | 8 minus 2 per violation class, floor 0 | `git status`, scan output, build diff | no |

`TEST_CMD`: `cd server && HOME=$(mktemp -d) npm test`

## What changed

- `server/src/scene-prompt-profile.ts`: `promptGuidance(tool, model)` returns the writing
  sentence, the reference page and the recommended ranges; `referenceAdvice(ranges, counts)`
  returns one `{code, detail}` for each count outside them. The ranges are data in this
  module, apart from the adapters' hard limits.
- `server/src/video-routing.ts`: every plan carries `promptGuidance`. On the main path the
  counts are read from the built request: people from the Seedance character bindings that
  are a picture or a video, files from every reference field the request carries, voices
  from the speakers bound to a sample, sample lengths by `ffprobe`, frames from `numFrames`.
  The field is attached beside the hashed body and `saveVideoPlan` leaves it out of the
  saved manifest, as it does `promptProfile`.
- `server/src/scene-prompt.ts`: the Seedance writer heads each shot of a multi-shot scene
  with `Shot N:`. `assertSceneDialogue` reads that label as a label when the planner's own
  prompt is numbered: a sentence is compared without it, and "Then cut directly" counts as
  one of the planner's sentences.
- `server/src/video-registry.ts`: a catalog row names its family's page as `promptReference`.
  `skills/_shared/video-catalog.json` gains that line on eight rows and nothing else.
- `server/src/video-voice.ts`: `sampleSeconds` is exported. `server/src/tools.ts`: the
  `video_plan` and `video_catalog` descriptions name the new fields.
- `skills/generate-cut-videos/references/prompt-h3.md`, `prompt-ltx-msr.md`,
  `prompt-seedance.md` (new); `skills/generate-cut-videos/SKILL.md`,
  `skills/storyboard/SKILL.md`, `skills/_shared/video-routing.md` and `CLAUDE.md` point to
  them, and the sentence "Seedance gets action beats" in `video-routing.md` now says
  numbered shots.
- Tests: `scene-prompt.test.mjs` (guidance per model, each advice code, shot numbering, the
  label in an authored prompt), `adapter-parameters.test.mjs` (the page on catalog rows) and
  `video-routing.test.mjs` (a Seedance plan's numbering, earlier-wording draft, advice and
  saved manifest; a 362-frame FastH3 plan). One existing case split a Seedance prompt on
  "Then cut directly." and now splits on the shot labels.

## Evidence before round 1

- **Baseline.** On the unchanged tree at `d9c4b613` the suite ran 1,387 cases: 1,383 passed
  and four timed out (`a shot cover reaches the library and reports a changed source`,
  `legacy frame covers render literal copy`, `long-form renders the thumbnail and its Test &
  Compare variants`, `full builder adds timeline music after editing without requiring a
  default bed`). The machine was shared with other sessions and a local render at the time
  (317 s for a suite that takes about 30 s). None of the four is in a module this loop
  changes.
- **Same plan before and after.** One two-speaker, two-shot scene was planned on five
  routes (MSR, FastH3, hosted MiniMax, Seedance 2.0, Seedance 2.5) on the committed build
  and on the working build. Two runs of the committed build differ from each other in
  `contextRevision` and `voiceContinuity.revision`, which hash the fixture's temporary
  paths. On MSR, FastH3 and hosted MiniMax the two builds differ in those two fields and
  nothing else. On both Seedance series they differ in those two and in the prompt fields
  (`args.prompt`, `sourcePrompt`, `promptTemplate`, `sceneRequest.prompt`).
- **Earlier wording still plans.** The `promptTemplate` the committed build returned for the
  Seedance scene, with "Then cut directly." between the shots, was sent back as `prompt` to
  the working build on both series. Both planned and submitted the wording as written. The
  working build's own template also round-trips to the same prompt.
- **Timestamps do not reach Seedance today.** A scene with a dissolve between its shots is
  refused on Seedance before and after the change (`scene_inputs_unsupported`), so the
  timed "At N seconds" heading is not written for this family; only model-paced scenes
  plan. Shot numbers are therefore the one form the Seedance writer needs.
- **Reference order.** On the probed scene the face pictures are numbered in the scene's
  declared speaker order and the voices in speaking order.
- **Advice on the probed scene.** Seedance 2.0: `reference_assets_over_recommended` (seven
  files). Seedance 2.5: `voice_sample_length` for each of the two samples, which are shorter
  than five seconds. MSR, FastH3 and hosted MiniMax: none.
- **Schema error.** The working build lists its tools with no boolean `exclusiveMinimum`;
  commit `735379ff` had already replaced it. Nothing was changed for it here.
- **Style scan.** The D8 scan prints 22 hits, all inside `CLAUDE.md`'s own section that
  quotes the forms, the same count as before the change.
- **dev moved.** Nine commits reached dev while this ran (#713, #714). They were merged in
  before round 1; `server/dist/bundle.js` conflicted and was rebuilt, `npm run check:dist`
  reports the committed build fresh, and every selftest step of `.github/workflows/check.yml`
  exits 0.

## Result

| Round | Score | P0 | Objective gate | Verdict |
|---|---|---|---|---|
| 1 | 98 | 0 | exit 0, 1,419 of 1,419 | PASS |

The target was met in round 1 ([verify-1.md](verify-1.md)). The two non-blocking directives,
a test that the plan id ignores advice and call-site cases for the people and voice-subject
codes, were not applied: the loop stops at its bar and neither changes behavior. The H3
comparison kept the compiler unchanged on one scene and two seeds per form; the six-section
form spoke the lines exactly in both takes and the planner's form in one, which is a reason
to compare again on more scenes.
