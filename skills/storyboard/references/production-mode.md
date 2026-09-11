# Production choice with a cost estimate

## Contents

- [When to ask](#when-to-ask)
- [Persist the decision](#persist-the-decision)
- [Autonomous callers](#autonomous-callers)
- [Evaluation scenarios](#evaluation-scenarios)

## When to ask

First follow [visual-style.md](visual-style.md): ask for the visual style before storyboard authoring.
Style and production mode are independent choices. Apply the selected style to every new image.
After capability and format checks, before visual planning or paid assets, present **both**
choices in one HITL question. Format (9:16/16:9), filming and production mode are separate axes.
An explicit choice already made for this episode is authorization; reuse it on resume.
An old approved board with no choice gets this gate at produce entry, before generation.
Do not reinterpret an approval of a topic as approval of full-video spend.

- **hybrid** (혼합 제작) — one or two generated clips mixed with HTML explanation slides and
  still-camera images.
- **full_video** (전체 영상) — every new scene is a generated clip in the chosen style, which
  raises generation cost.

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
subscription price for this plugin's BytePlus API calls. Unknown prices stop the quote.

Show, for **each** choice: model/provider, resolution, generated audio on/off, clip count,
generated seconds, first-pass USD, retry-inclusive USD range, approximate KRW, its explicit
exchange-rate assumption, and the **maximum video budget to approve**. Attempts include the
first call: the default range is 2–3 total attempts per shot, not 2–3 extra retries. Under
`videoProvider:'host'` show the tool and its ceiling (Grok `image_to_video`, 720p, 1–15 s) where
the model and price would be.
Identify provisional alternatives; they are comparison assumptions, not automatically rewritten
shot plans. Images, narration, music, editing, taxes and payment fees are outside this video quote.
Explain those exclusions rather than presenting a video-only number as the complete bill.

Use the returned numbers in this HITL wording, never literal example prices. Each choice opens
with one plain sentence on what it makes and what that costs in practice, before the numbers
(user directive, 2026-09-08):

> 어떤 방식으로 만들까요? 아래 금액은 영상 생성비이며 재시도를 포함한 예상치입니다.
> - 혼합 제작 — 생성 영상 1~2개에 HTML 설명 슬라이드와 카메라 무빙 정지컷을 섞습니다. 값이 싸고 결과가 안정적입니다. [영상 수·모델·해상도·음성 여부]. 최초 [금액], 평균 [횟수]회 시도 [범위]. 영상 예산 상한 [금액].
> - 전체 영상 — 새 장면을 전부 생성 영상으로 만듭니다. 움직임이 풍부한 대신 비용과 재시도가 늘어납니다. [영상 수·모델·해상도·음성 여부]. 최초 [금액], 평균 [횟수]회 시도 [범위]. 영상 예산 상한 [금액].
> 원화는 1달러=[환율]원으로 가정했습니다. 이미지·내레이션·편집·세금은 별도입니다.

If the full-video estimate exceeds the channel cap, show the required episode-only cap in
that choice. Selecting a choice that explicitly includes that cap authorizes it; do not ask
the same question again. Do not silently alter the channel profile, resolution or model.
If approval is missing, wait. A timeout, silence or a cheaper estimate is not a choice.

### Two more questions on every episode with generated video (user directive 2026-09-11)

Every generated cut is pre-rendered in 3D and the render rides the video model as a reference
clip (blender-previz.md §6), so two more choices are the user's, and `production-mode.js`
refuses a board with generated cuts that has not recorded them.

**Before any Blender or three.js render — which renderer.** Ask once per episode, before the
first previz call (`capability_status` says whether Blender is installed; recommend that):

> 생성 컷의 카메라·배치를 3D 로 먼저 잡습니다. 어느 렌더러로 만들까요?
> - 블렌더 (Recommended when installed) — 관절 마네킹으로 몸 동작까지 잡고 모션 캡처를 얹을 수 있습니다. Blender 4.2+ 가 이 기계에 있어야 합니다.
> - three.js — 헤드리스 크롬 페이지로 카메라와 배치만 잡습니다. 설치가 필요 없고 컷당 10초 안팎이며 관절은 없습니다.

Persist as `PRODUCTION.previz = { renderer, selection }`; every shot's `visual.video.previz.renderer`
must equal it.

**Before any video call — which model.** Ask before the §7 board approval (the quote is
bound to the model) and again at produce entry when an older board has no record. Print the
table with real numbers first:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/produce/references/video-model-options.js storyboard/
```

> 생성 컷 [N]개를 어느 모델로 만들까요? 프리비즈 참조 영상은 Seedance 2.x 만 받고 입력 초까지 과금합니다. 아래는 이 보드 전체의 영상 생성비이고 재시도를 포함한 예상치입니다.
> - Seedance 2.0 1080p — 가장 또렷합니다. 최초 [금액], [횟수]회 시도 [범위]. [예산 초과 여부]
> - Seedance 2.0 fast 720p — 값과 속도 사이. 최초 [금액], [횟수]회 시도 [범위].
> - Seedance 2.0 mini 720p — 가장 쌉니다. 최초 [금액], [횟수]회 시도 [범위].
> - Seedance 2.5 1080p — 참조 영상 30초·이미지 30장까지, 고정 목소리가 필요할 때. 최초 [금액], [횟수]회 시도 [범위].
> 원화는 1달러=[환율]원으로 가정했습니다. 이미지·내레이션·편집·세금은 별도입니다.

Persist as `PRODUCTION.videoModel = { model, resolution, selection }` and write the same
`model` and `resolution` on every generated cut's `visual.video`; `render-routing.js` refuses a
shot whose model differs from the chosen one. Under `videoProvider:'host'` the tool is the
model, so the record is `{ model: 'host' }` or absent. A different answer later is a new quote
and a new approval.

## Persist the decision

Write `window.PRODUCTION` in scenes.js. It is independent of `window.MOTION_POLICY`, which
remains an exact channel snapshot. `production-mode.js` applies only the selected shot cap and
approved episode video budget on top; other channel constraints still apply. `hybrid` caps
generated shots at two (or a lower explicit channel cap). Plan 1–2 new clips, or zero new
clips with at least one explicit `visual.reuse` input. Zero of both is rejected. See the
[reuse contract](scenes-schema.md#existing-generated-clip-input-visualreuse) for file checks,
separate reuse counts and the final $0 estimate. Reuse does not relax the screen policy. `full_video` permits every generated scene to be a
video, including explanations. Existing user recordings and the shared outro retain their source.

`imageProvider` and `videoProvider` record which lane generates (owner directive 2026-09-07):
`host` when the CLI running the skill ships the tool — `image_gen` on Codex and Grok,
`image_to_video` on Grok — and `api` on Claude Code or where the user chose the plugin's API
engines for this episode. The host lanes bill nothing here (`image.host` and `video.host` rows
at $0), so under `videoProvider:'host'` both quotes come out at $0 and the approval shows the
720p ceiling where a price would be. An absent field reads as `api`, which is how boards from
before 2026-09-07 keep their quotes.

```js
window.PRODUCTION = {
  mode: 'full_video',                 // hybrid | full_video
  imageProvider: 'host',              // host | api — host where the CLI ships image_gen (Codex, Grok)
  videoProvider: 'host',              // host | api — host where the CLI ships image_to_video (Grok)
  maxAttempts: 3,                     // total per shot, first attempt included
  videoBudgetUsd: 15,                 // example ONLY: use the cap actually approved
  comparison: { model: 'seedance-1-5-pro-251215', resolution: '1080p', hybridShots: [1, 2] },
  previz: { renderer: 'blender',        // blender | threejs — asked before the first previz render
    selection: { kind: 'user', reference: 'ACTUAL_RENDERER_CHOICE' } },
  videoModel: { model: 'dreamina-seedance-2-0-260128', resolution: '1080p',   // asked before any video call, with video-model-options.js
    selection: { kind: 'user', reference: 'ACTUAL_MODEL_CHOICE' } },
  style: {
    preset: 'cinematic-miniature',
    selection: { kind: 'user', reference: 'ACTUAL_STYLE_CHOICE' },
    referencePack: 'tactile-miniature-v1',    // cinematic-miniature only
    reference: 'https://www.youtube.com/shorts/LQZjvQ5W2ck',   // where the look comes from: a URL or one line
    world: 'A rocky urban valley, with a stable mountain silhouette and stream route.',
    materials: 'Matte off-white concrete, detailed granite, restrained foliage.',
    palette: 'Warm grey, muted green, pale blue water.',
    lighting: 'Soft daylight with clear contact shadows and moderate depth of field.',
    camera: 'Purposeful slow reveals, consistent lens language and legible phone framing.'   // carried in every motion prompt
  },
  approval: {
    kind: 'user',                     // standing only when its written authorization names this mode and cap
    reference: 'The user selected full video and the displayed $15 cap in this episode.',
    at: '2026-09-06T10:00:00+09:00',   // actual approval time
    quoteFingerprint: 'COPY_FROM_THE_APPROVED_FINAL_QUOTE'
  }
};
```

Both modes keep the selected `style`; hybrid keeps purpose-based render routing.
For full_video, follow `full-video.md` in the produce skill and use the stored style across
every shot. Each generated shot's camera is the four `visual.camera` slots; `videoDesign`
holds the subject plan only, and `spatial-prompts.js` assembles the motion prompt from both.
The camera slots name a move the viewer can see (no `very slow`/`subtle`/`gentle`/`hold
composition`; `cameraFixed` only under `static`), and a full-video episode keeps static
cameras to one shot in three and wide framing to half (full-video.md §Camera dynamics). Do not read the old HTML-only explanation and person-required video clauses as
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
page shows both choices, retries and the selected cap, and flags a stale comparison.
The page displays a proposal; selection is recorded by the host's HITL, not a pretend HTML button.

## Autonomous callers

A growth plan can explicitly authorize `production_mode`, `video_budget_usd`,
`video_max_attempts`, and — for the two previz questions — `previz_renderer` and `video_model`
(the `autoproduce:` block; both or neither, and without them the unattended loop plans no
generated cut). Copy its mode/cap/attempts/renderer/model and identify that exact plan in an
approval, and in `PRODUCTION.previz.selection` / `PRODUCTION.videoModel.selection`, with
`kind:'standing'`. A plain `autoproduce:true` does not authorize a switch to full_video.
Existing unattended callers retain hybrid; if their written scope cannot cover the estimate,
hold before spending and ask at the next human interaction. Never raise an unattended cap.

## Evaluation scenarios

1. New 75-second episode: show both priced options before images; choosing full video authorizes
   only the displayed budget. Final approval contains actual per-shot durations and settings.
2. Resume an approved full-video episode: reuse its choice and accepted clips; changed model,
   duration or price invalidates the quote. Do not ask again when nothing changed.
3. Low channel cap or unavailable Seedance: show the conflict before assets; never silently
   substitute HTML, lower resolution, another provider or an unpriced call.
4. Unattended growth without full-video authorization: retain hybrid and its standing budget;
   no paid call follows a pending or absent choice.
