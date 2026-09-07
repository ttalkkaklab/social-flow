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

- **혼합 제작** — 영상 1~2개와 HTML 설명 슬라이드·이미지 카메라 무빙을 섞습니다.
- **전체 영상** — 모든 새 장면을 영상으로 만듭니다. 선택한 화풍을 모든 장면에 적용하며 생성비가 늘어납니다.

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
first call: the default range is 2–3 total attempts per shot, not 2–3 extra retries.
Identify provisional alternatives; they are comparison assumptions, not automatically rewritten
shot plans. Images, narration, music, editing, taxes and payment fees are outside this video quote.
Explain those exclusions rather than presenting a video-only number as the complete bill.

Use the returned numbers in this HITL wording, never literal example prices:

> 어떤 방식으로 만들까요? 아래 금액은 영상 생성비이며 재시도를 포함한 예상치입니다.
> - 혼합 제작: [영상 수·모델·해상도·음성 여부]. 최초 [금액], 평균 [횟수]회 시도 [범위]. 영상 예산 상한 [금액].
> - 전체 영상: [영상 수·모델·해상도·음성 여부]. 최초 [금액], 평균 [횟수]회 시도 [범위]. 영상 예산 상한 [금액].
> 원화는 1달러=[환율]원으로 가정했습니다. 이미지·내레이션·편집·세금은 별도입니다.

If the full-video estimate exceeds the channel cap, show the required episode-only cap in
that choice. Selecting a choice that explicitly includes that cap authorizes it; do not ask
the same question again. Do not silently alter the channel profile, resolution or model.
If approval is missing, wait. A timeout, silence or a cheaper estimate is not a choice.

## Persist the decision

Write `window.PRODUCTION` in scenes.js. It is independent of `window.MOTION_POLICY`, which
remains an exact channel snapshot. `production-mode.js` applies only the selected shot cap and
approved episode video budget on top; other channel constraints still apply. `hybrid` caps
generated shots at two (or a lower explicit channel cap). Plan 1–2 when available; if the
channel cannot permit one video, hold and revise that constraint with the user. `full_video` permits every generated scene to be a
video, including explanations. Existing user recordings and the shared outro retain their source.

```js
window.PRODUCTION = {
  mode: 'full_video',                 // hybrid | full_video
  imageProvider: 'host',              // use the host's included image-generation allowance
  maxAttempts: 3,                     // total per shot, first attempt included
  videoBudgetUsd: 15,                 // example ONLY: use the cap actually approved
  comparison: { model: 'seedance-1-5-pro-251215', resolution: '1080p', hybridShots: [1, 2] },
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
holds the subject plan only, and `spatial-prompts.js` assembles the motion prompt from both. Do not read the old HTML-only explanation and person-required video clauses as
overriding this explicit episode choice.

The initial question can use a provisional duration estimate. Before the final storyboard
approval, assemble the chosen shots, run `production-cost.js storyboard/ --json`, copy the
current `quoteFingerprint` into `approval`, and show that quote with the board. Only record
approval after the user actually approves; no program auto-approves. The signature excludes
generated clip paths so saving the result does not invalidate approval. Narration, source
prompts, style, video model/settings, duration, budget and the price table are bound to the quote.
If they change, update the quote and secure approval for the revised plan before more generation.

Copy `production-mode.js` with `render-routing.js` into storyboard/. Run
`cost-preview.js storyboard/ --sbdoc` and put its full cost block into `SB_DOC`; the approval
page shows both choices, retries and the selected cap, and flags a stale comparison.
The page displays a proposal; selection is recorded by the host's HITL, not a pretend HTML button.

## Autonomous callers

A growth plan can explicitly authorize `production_mode`, `video_budget_usd`, and
`video_max_attempts`. Copy its mode/cap/attempts and identify that exact plan in an approval
with `kind:'standing'`. A plain `autoproduce:true` does not authorize a switch to full_video.
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
