# Production choice with a cost estimate

For new episodes, inherit `production.mode`, `renderRatioVersion`, format and any
previz choice from the project snapshot created by project-init. The saved ratio
is a standing preference; do not ask it again. Populate the new board from the
project tool's handoff, then calculate the actual episode quote and preserve real
spending authorization. Existing episode choices and explicit overrides win.
This supersedes per-episode preference prompts below, not cost accounting.

**Automatic execution:** [Automation guidance](../../_shared/automation-guidance.md) supersedes creative quality gates, repeated approvals and review-score requirements here. Keep the concrete guidance and truthful review state. Enforce only actual runtime dependencies and the scope of external-action authorization.


## Six render ratios and local allocation (2026-09-22)

The machine-readable band table is [render-ratios.json](render-ratios.json).

New selections write `PRODUCTION.renderRatioVersion: 1` alongside `mode`. Count
**all SCENES entries**, by shot count, with `generated_video` and `stock_video` both
counting as video. This is a rendering ratio; the paid-generation cost denominator
is separate and still excludes supplied footage and reuse.

| Mode | Label | Video share |
|---|---|---|
| `full_video` | 전체 영상 | 100% |
| `video_80` | 80% 이상 영상 | [80%, 100%) |
| `video_50` | 50% 이상 영상 | [50%, 80%) |
| `video_30` | 30% 이상 영상 | [30%, 50%) |
| `video_lt10` | 10% 미만 영상 | [0%, 10%) |
| `no_video` | 0% 영상 | 0 shots |

The chosen ratio is a planning target and the cost ceiling (owner decision 2026-10-18).
Aim at `ceil(N × lower percentage)` video shots; the strict upper count is
`ceil(N × upper percentage) - 1`, and that upper count plus the budget are what
`production-mode.js` enforces through `check` and `policy` (`ratioBounds` exposes both
numbers). If the upper count falls below the target, the target is the ceiling too
(1 shot at 80% → 1; 2 shots at 30% → 1). At 10 shots, less than 10% allows zero; at 11,
it allows one. No duration weighting. Fewer video shots than the target is reported as
advice, never padded with video the story does not need, and never an error.
Do not relabel a legacy approval: without the version marker, `video_50` and
`video_30` count new cuts instead of all shots and carry no upper band, and `hook_only`
keeps its original hook. `hook_only`, `stills_only` and `hybrid` are legacy ids for
resumed boards only; on an explicit new selection, `hook_only` maps to `video_lt10`
and `stills_only` to `no_video`.

Choose each shot’s render route locally and record its purpose and reason in scenes.js.
A changed ratio requires a current cost quote and approval before spending.

## Contents

- [When to ask](#when-to-ask)
- [Persist the decision](#persist-the-decision)
- [Autonomous callers](#autonomous-callers)
- [Evaluation scenarios](#evaluation-scenarios)

## When to ask

First follow [visual-style.md](visual-style.md): reuse the chosen visual style or choose and record one when the user delegated that decision.
Style and production mode are independent choices. Apply the selected style to every new image.
After capability and format checks, offer the six choices when the user wants to choose. In delegated authoring, choose an appropriate plan and record the assistant decision; confirm actual unapproved spending before paid calls. Format (9:16/16:9), filming and production mode are separate axes.
An explicit choice already made for this episode is authorization; reuse it on resume.
An old approved board with no choice gets this gate at produce entry, before generation.
Do not reinterpret an approval of a topic as approval of full-video spend.

Use the six modes in the table above. Legacy-only modes are not new choices.

A channel whose `generated_video_max` is 0 never reaches this comparison — there is no video to
buy and no cost to weigh, so no option is offered. Its board writes `mode: 'no_video'` with
`renderRatioVersion: 1` (`stills_only` is the legacy spelling kept on resumed boards). Use it
only while the channel cap stays 0, and only on a board that buys no video: no generated clip,
and no imported `visual.reuse` either (an imported clip keeps its own zero-generation shape
under legacy `hybrid`). The board still records its visual style, which is the one thing
`PRODUCTION` carries there. `check-production.js` skips the quote, the approval and the budget
comparison for legacy `stills_only` and refuses its `--before-call`: there is no video call to make.

The cap is read from the channel policy the caller resolved — `profile.md` first, the board's
`window.MOTION_POLICY` otherwise — in either spelling (`generated_video_max`,
`generatedVideoMax`). A board that records no cap anywhere is told to copy the profile policy in
rather than judged against a format default it never declared.

**What a no-video board still allows.** Footage the channel already owns is not generation:
the user's recording or screencast, a licensed stock clip (`visual.source` with a `clip` path)
and the shared outro. `eligible()` leaves all three outside every mode's generated count, and
barring them here would leave a recording-based board on a zero-cap channel with no passing
mode — the same hole this contract exists to close. The line the mode draws is *bought video*,
not *moving pixels*.

**Legacy approvals without renderRatioVersion:** count new cuts, not duration, and read the percentage as a target with no minimum. Exclude imported `visual.reuse` clips,
user recordings, supplied stock clips and the shared outro from the denominator; b-roll is
spliced by `after`, not a cut, so it sits on neither side of the ratio (it still fills a
generated slot, and hook-only allows the hook plus imported clips only).
The hook is the first `hooking` scene on long form, otherwise the `cover`, otherwise the first
new cut. If that hook is a supplied clip, resolve its source with the user before choosing
hook-only; do not silently generate a different cut. Existing `hybrid` approvals may resume,
but never offer hybrid in a new question. Percentage choices override the old two-clip cap;
hook-only overrides the optional-hook default. Keep the episode budget and the no-marks rule.
Partial modes retain purpose-based routing. When purpose routing yields fewer video cuts than
the chosen ratio's target, report the shortfall with the board and record it as an episode
note; never pad the story with cuts it does not need, and never exceed the band's upper count
or the approved budget.

Run the read-only calculator for the intended length before shots exist:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references/production-cost.js --seconds 75
```

Once shot lengths exist, use the actual board instead:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references/production-cost.js storyboard/ --json
```

The calculator uses `prices.tsv`, `cost-report.sh` and the production model router. It
counts **generated** seconds, including Seedance's minimum duration and Veo's fixed grid.
It never calls an API. Never use the earlier conversation's Replicate prices or a consumer
subscription price for this plugin's BytePlus API calls. Report unknown prices as an incomplete quote. They prevent unbounded paid calls, not local authoring.

Show, for **each** choice: model/provider, resolution, generated audio on/off, clip count,
generated seconds, first-pass USD, retry-inclusive USD range, approximate KRW, its explicit
exchange-rate assumption, and the **maximum video budget to approve**. Attempts include the
first call: the default range is 2–3 total attempts per shot, not 2–3 extra retries. Under
`videoProvider:'host'` show the tool and its ceiling (Grok `image_to_video`, 720p, 1–15 s) where
the model and price would be.
Identify provisional alternatives; they are comparison assumptions, not automatically rewritten
shot plans. Images, narration, music, editing, taxes and payment fees are outside this video quote.
Explain those exclusions rather than presenting a video-only number as the complete bill.

The six-way question below belongs to first setup ([project-init](../../project-init/SKILL.md))
or an explicit change request; a saved ratio is reused without asking, and the per-episode
step is the cost quote and the spending approval only. When the question is asked, use the
returned numbers in this HITL wording, never literal example prices. Each choice opens
with one plain sentence on what it makes and what that costs in practice, before the numbers
(user directive, 2026-09-08):

> 어떤 방식으로 만들까요? 아래 금액은 영상 생성비이며 재시도를 포함한 예상치입니다.
> - 전체 영상 — 새 컷을 전부 생성 영상으로 만듭니다. 여섯 옵션 중 생성할 컷이 가장 많습니다. [영상 수·모델·해상도·음성 여부]. 최초 [금액], [횟수]회 시도 [범위]. 영상 예산 상한 [금액].
> - 50% 이상 — 새 컷의 절반 이상을 생성 영상으로 만들고 나머지는 HTML·정지컷으로 구성합니다. [영상 수·모델·해상도·음성 여부]. 최초 [금액], [횟수]회 시도 [범위]. 영상 예산 상한 [금액].
> - 30% 이상 — 새 컷의 30% 이상을 생성 영상으로 만들고 나머지는 HTML·정지컷으로 구성합니다. [영상 수·모델·해상도·음성 여부]. 최초 [금액], [횟수]회 시도 [범위]. 영상 예산 상한 [금액].
> - 80% 이상 영상 — 영상 비율 80% 이상으로 배분합니다. [영상 수·모델·해상도·음성 여부·비용·상한].
> - 10% 미만 영상 — 영상 비율을 10% 미만으로 제한합니다. [영상 수·모델·해상도·음성 여부·비용·상한].
> - 0% 영상 — 모든 샷을 정지컷·HTML 설명으로 구성합니다. 영상 생성비 0, 다른 제작비는 별도입니다.
> 원화는 1달러=[환율]원으로 가정했습니다. 이미지·내레이션·편집·세금은 별도입니다.

If the full-video estimate exceeds the channel cap, show the required episode-only cap in
that choice. Selecting a choice that explicitly includes that cap authorizes it; do not ask
the same question again. Do not silently alter the channel profile, resolution or model.
If approval is missing, wait. A timeout, silence or a cheaper estimate is not a choice.

### Renderer and video model come from the saved settings

A generated cut may be pre-rendered in 3D (blender-previz.md §6); the previz is optional. It
carries camera and blocking to a model that takes a reference clip (Seedance 2.x
`reference_video`); on `frame_and_prompt` adapters it shapes the still and the prompt as
advice. No checker refuses a generated cut without one.

**Which renderer.** Reuse `.social-flow/models.json` `production.previzRenderer`, which the
project handoff already copies into `PRODUCTION.previz = { renderer, selection }` with
`selection.kind:'standing'`. Ask nothing when that record exists. When nothing is saved and a
previz is wanted, pick the renderer (`capability_status` says whether Blender is installed;
three.js needs no install) and record `selection: { kind: 'assistant', reference: '<why>' }`.
Every rendered shot's `visual.video.previz.renderer` matches the recorded renderer.

**Which video model.** Follow [directory model settings](../../_shared/model-settings.md):
copy the saved video selection into `PRODUCTION.videoModel` without another question. Only
missing first-time settings or an explicit change request opens model selection, and that
first-setup menu lists every installed adapter from `video_catalog` (host video, Seedance,
Veo, ASTRA, MLX where available), not one vendor. Preserve a legacy board's existing approved
choices. Quotes still bind the actual episode models; print the table with real numbers
before quoting:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/produce/references/video-model-options.js storyboard/
```

Persist `PRODUCTION.videoModel = { model, resolution, selection }` as an episode default,
or use `model: 'mixed'` to describe a per-cut choice. Each cut's `visual.video.model` and
`resolution` control its route and cost; they may differ across the episode. For example,
the first three cuts may use Seedance 2.5 and the rest Seedance 1.5 Pro. The options table
includes 1.5 Pro at 720p and 1080p. `modelReason` is optional.

For 1.5, use `previz.handoff: 'frame_and_prompt'` (also inferred from a 1.x model), omit
`referenceImagePaths` and `referenceAudioPaths`, and keep `visual.bg` as the start image.
The previz still supplies the composition and camera prompt; its clip is not sent or billed.
2.x can use `reference_video` as before. Actual model capabilities and price rows still apply.
Under `videoProvider:'host'`, the record is `{ model: 'host' }` or absent.
Changes to cut models or resolutions change the quote fingerprint; retain the budget and
approval checks. A recorded choice covering the mixed plan needs no extra model-selection question.

## Persist the decision

Write `window.PRODUCTION` in scenes.js. It is independent of `window.MOTION_POLICY`, which
remains an exact channel snapshot. `production-mode.js` applies only the selected shot cap and
approved episode video budget on top; other channel constraints still apply. On legacy boards
without `renderRatioVersion`, `video_50` and `video_30` allow up to all new cuts with no minimum
and `hook_only` allows exactly the opening hook (resumed boards only). Legacy `hybrid` caps
generated shots at two (or a lower explicit channel cap). Plan 1–2 new clips, or zero new
clips with at least one explicit `visual.reuse` input. Zero of both is rejected. Legacy `stills_only` is the
zero-cap contract instead: no generated clip, no reuse, no approval, and `policy()` keeps the
channel's 0; supplied recordings, stock clips and the outro stay allowed. See the
[reuse contract](scenes-schema.md#existing-generated-clip-input-visualreuse) for file checks,
separate reuse counts and the final $0 estimate. Reuse does not relax the screen policy. `full_video` permits every generated scene to be a
video, including explanations. Existing user recordings and the shared outro retain their source.

`imageProvider` and `videoProvider` derive from the saved directory selection
(`.social-flow/models.json`, [model-settings.md](../../_shared/model-settings.md)): `host` when
the selected engine is the CLI's own media tool (`image_gen` on Codex and Grok, `image_to_video`
on Grok), `astra` for the ASTRA video box, and `api` for every other engine, including local
tools. The host lanes bill nothing here (`image.host` and `video.host` rows at $0), so under
`videoProvider:'host'` the quotes come out at $0 and the approval shows the 720p ceiling where a
price would be. An absent field reads as `api`, which is how boards from before 2026-09-07
keep their quotes.

```js
window.PRODUCTION = {
  mode: 'video_50',                   // full_video | video_80 | video_50 | video_30 | video_lt10 | no_video (hook_only, stills_only, hybrid: resumed legacy boards only)
  renderRatioVersion: 1,              // marks the six-ratio contract; absent on legacy boards
  imageProvider: 'host',              // host | api — from the saved image selection
  videoProvider: 'host',              // host | astra | api — from the saved video selection
  maxAttempts: 3,                     // total per shot, first attempt included
  videoBudgetUsd: 15,                 // example ONLY: use the cap actually approved
  comparison: { model: 'seedance-1-5-pro-251215', resolution: '1080p' },
  previz: { renderer: 'blender',        // optional; blender | threejs — copied from models.json production.previzRenderer
    selection: { kind: 'standing', reference: '.social-flow/models.json' } },   // kind:'assistant' when nothing was saved and the author picked one
  videoModel: { model: 'dreamina-seedance-2-0-260128', resolution: '1080p',   // the saved directory selection (model-settings.md)
    selection: { kind: 'standing', reference: '.social-flow/models.json' } },
  style: {
    preset: 'cinematic-miniature',
    selection: { kind: 'user', reference: 'ACTUAL_STYLE_CHOICE' },
    referencePack: 'tactile-miniature-v1',    // cinematic-miniature only
    reference: 'https://www.youtube.com/shorts/LQZjvQ5W2ck',   // where the look comes from: a URL or one line
    world: 'A rocky urban valley, with a stable mountain silhouette and stream route.',
    worlds: { archive: 'A records room with dark wooden shelves and one paper window.' },
    materials: 'Matte off-white concrete, detailed granite, restrained foliage.',
    palette: 'Warm grey, muted green, pale blue water.',
    lighting: 'Soft daylight with clear contact shadows and moderate depth of field.',
    camera: 'Purposeful slow reveals, consistent lens language and legible phone framing.'   // carried in every motion prompt
  },
  cast: {
    guide: {
      name: 'The guide',
      sheet: 'An adult guide with a lean build, short dark hair, a charcoal field jacket and a canvas satchel.',
      image: 'images/cast-guide.png' // optional, relative to scenes.js
    }
  },
  approval: {
    kind: 'user',                     // standing only when its written authorization names this mode and cap
    reference: 'The user selected full video and the displayed $15 cap in this episode.',
    at: '2026-09-06T10:00:00+09:00',   // actual approval time
    quoteFingerprint: 'COPY_FROM_THE_APPROVED_FINAL_QUOTE'
  }
};
```

`PRODUCTION.cast` is optional and keyed by the ids used in `visual.character`. Each entry has
`name`, one positive English `sheet`, and an optional episode-relative `image`. The sheet is
the only place to describe the character's appearance. A matching episode id takes priority
over the channel cast. Once `PRODUCTION.cast` or any `shot.cutType` is present, generated
still and video cuts with `visual.bg` declare one of `action`, `reaction`, `insert`, `document`,
`map` or `scenery`. `style.worlds[shot.videoDesign.worldId]` may replace the default
`style.world` for one set; unknown ids use the default and produce a warning.

All six choices keep the selected `style`; hybrid keeps purpose-based render routing.
For full_video, follow `full-video.md` in the produce skill and use the stored style across
every shot. Each generated shot's camera is the four `visual.camera` slots; `videoDesign`
holds the subject plan only, and `spatial-prompts.js` assembles the motion prompt from both.
The camera slots name a move the viewer can see at `slow`, `steady` or `fast` (no `very
slow`/`subtle`/`gentle`/`hold composition`; `cameraFixed` only under `static`) — that is the
generated-video vocabulary; still-camera cuts use render-routing.md's `very slow`/`slow`/`fast`/
`very fast`. As advice, `production-mode.js` flags a full-video episode that holds a static camera
on more than one shot in three or frames more than half its shots wide (full-video.md §Camera
dynamics). Do not read the old HTML-only explanation and person-required video clauses as
overriding this explicit episode choice.

The initial question can use a provisional duration estimate. Before the final storyboard
approval, assemble the chosen shots, run `production-cost.js storyboard/ --json`, copy the
current `quoteFingerprint` into `approval`, and show that quote with the board. Only record
approval after the user actually approves; no program auto-approves. The signature excludes
generated clip paths so saving the result does not invalidate approval. Narration, source
prompts, style, video model/settings, duration, budget and the price table are bound to the quote.
If they change, update the quote and secure approval for the revised plan before more generation.

Copy `production-mode.js` with `render-routing.js` and `style-samples.js` into storyboard/. Run
`cost-preview.js storyboard/ --sbdoc` and put its full cost block into `SB_DOC`; the approval
page shows all six choices, retries and the selected cap, and flags a stale comparison.
The page displays a proposal; selection is recorded by the host's HITL, not a pretend HTML button.

## Autonomous callers

New unattended episodes take the ratio, the previz renderer and the video model from
`.social-flow/models.json`, which takes precedence over old growth-plan model defaults. A
complete config is required for new unattended production; without it report
`project_setup_required` and defer. Keep existing standing budgets. Do not ask for models
again on later ticks.

A growth plan can explicitly authorize `video_budget_usd` and `video_max_attempts`. Its
`production_mode`, `previz_renderer` and `video_model` fields (the `autoproduce:` block) are
legacy overrides, read only when the directory settings lack that field or when a resumed
board already carries them. Copy the cap/attempts and identify that exact plan in an
approval; a selection copied from models.json records `kind:'standing'` with the settings
path as reference. A plain `autoproduce:true` does not authorize a switch to full_video.
Resumed legacy approvals retain hybrid; if a plan's written scope cannot cover the estimate,
hold before spending and ask at the next human interaction. Never raise an unattended cap.

## Evaluation scenarios

1. New 75-second episode on a configured directory: reuse the saved ratio and models, show the
   quote before images; approving it authorizes only the displayed budget. Final approval
   contains actual per-shot durations and settings.
2. Resume an approved full-video episode: reuse its choice and accepted clips; changed model,
   duration or price invalidates the quote. Do not ask again when nothing changed.
3. Low channel cap or an unavailable selected model: show the conflict before assets; never silently
   substitute HTML, lower resolution, another provider or an unpriced call.
4. Unattended growth: a new episode takes ratio, renderer and model from models.json under the
   standing budget; a resumed legacy approval retains hybrid. No paid call follows a pending
   or absent spending approval.
