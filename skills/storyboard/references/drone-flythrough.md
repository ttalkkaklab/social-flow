# Drone fly-through shots

## Contents

- [Plan](#plan)
- [Prepare and render](#prepare-and-render)
- [Review](#review)
- [MCP input fields](#mcp-input-fields)

`visual.camera.preset: "drone-flythrough"` is a shot camera preset, independent of
`PRODUCTION.style.preset`. Offer it when travelling through space reveals a connection,
a hidden landmark or a route. A place name alone still uses the normal still-camera route.

User-facing choices:

- **드론 경로 비행 · 부드러운 항공 촬영** — 수평선을 유지하며 지형 사이로 이동해 장소의 구조와 동선을 보여줍니다.
- **드론 경로 비행 · FPV** — 굽이에서 카메라를 기울여 계곡이나 건물 사이를 통과하는 움직임을 강조합니다.

This is not a Google Earth data provider or a Gemini model selection. It follows the
existing host-first image/video lanes, renderer/model choices and cost approval. No new API
is introduced. Google Earth imports and image-drawn path recognition are outside this preset.

## Plan

Use `generated_video`, purpose `place` or `live_action`, and
`videoDesign.motion.kind: "spatial_reveal"`. Write `subject`, `visibleChange` and `reason`.
Always record `render.motionEssential:true` and `render.whyNotStill`, including full_video.
Keep the normal before/action/after, continuity, reject, narration and visual.why fields.

Use a volumetric look: photoreal, cinematic-miniature, toon-3d, or claymation with a pace
that suits its material. Arcade, paper-cutout and ink-wash conflict with a flying 3D camera.
Do not add a person or animate buildings merely to satisfy a subject-action rule.

The camera below is authoring input. `drone-previz.js` fills its four camera slots; copy
those generated slots back to the shot before assembling prompts or checking the plan.

```js
visual: {
  camera: {
    preset: 'drone-flythrough',
    variant: 'fpv', // cinematic keeps every rollDeg at zero
    trajectory: {
      coordinateSpace: 'local-meters', // X right, Y forward, Z up; not latitude/longitude
      seconds: 4, // billed duration, matching the selected model's resolved length
      lensMm: 24,
      keys: [
        { at: 0, position: [0,-20,8], target: [0,0,4], rollDeg: 0, label: 'the valley entrance' },
        { at: 2, position: [8,-5,7], target: [2,10,4], rollDeg: 20, label: 'the ridge' },
        { at: 4, position: [0,15,6], target: [0,25,3], rollDeg: 0, label: 'the bridge' }
      ],
      proxies: [
        { name: 'bridge', kind: 'box', size: [12,2,4], keys: [{frame:1,position:[0,25,0]}] },
        { name: 'ridge', kind: 'box', size: [8,8,8], keys: [{frame:1,position:[-6,5,0]}] }
      ]
    }
  }
}
```

Use 2–32 ordered keys from zero through the billed duration (2–30 whole seconds), a
12–50 mm lens, and a target distinct from the position. Labels are English because they
feed the model prompt. FPV bank is authored explicitly within ±35°, not inferred from a
red line. Choose a look-ahead target at each bend. Avoid vertical targets, reversals and
obstacles. The spline may overshoot the waypoint polygon: inspect the actual flight.
Proxies use the [previz contract](previz-contract.js); model the important occluders and
landmarks, with enough clearance for the complete interpolated camera path.

## Prepare and render

```bash
node skills/storyboard/references/drone-previz.js data/CHANNEL/episodes/TOPIC/storyboard \
  --shot 2 --out data/CHANNEL/episodes/TOPIC/storyboard/previz/s2-r1
```

The output directory must be new, so a preparation never replaces an approved revision.
`camera-plan.json` contains the normalized `camera`, a three.js `spec`, `blenderCamera`
arguments and `previzCamera`. `previz.html` and its offline runtime are ready to render.
This command only prepares files; it does not render, generate assets or record approval.

For **three.js**, use the existing renderer:

```bash
node skills/produce/references/render-motion-slide.mjs \
  data/CHANNEL/episodes/TOPIC/storyboard/previz/s2-r1/previz.html \
  --out data/CHANNEL/episodes/TOPIC/storyboard/previz/s2-r1/render --previz
```

For **Blender**, build the proxy scene from `spec.actors` (box `size`, position and
frame values use the same coordinates), set its frame range to `1..fps*seconds`, then
call `blender_camera_set` with `blenderCamera` plus the actual `blendPath`.
Render using `blender_render_previz`. Both routes use the same sampled trajectory;
`rollDeg` rotates the camera around its local Z axis after aiming. Camera keys are baked
at up to 480 intervals so they fit the bridge's 500-key limit.

Copy `camera-plan.json.camera` into `visual.camera`. Record the actual rendered clip,
first frame, byte hash, fps, seconds and renderer in `visual.video.previz` as usual.
Set its `camera` to `camera-plan.json.previzCamera`, which includes `trajectoryBinding`.
This binding detects a changed plan; it is not evidence that the clip follows it.
Do not attach that binding to an older clip. Rebuild after a path, lens, variant or proxy
change, update the source image from the new first frame, and refresh the quote/approval.

Generate the source still from the actual previz first frame using the selected episode
look. Assemble the video prompt with `spatial-prompts.js`. The selected model's existing
reference_video or frame_and_prompt handoff applies; prompt-only handoff cannot guarantee
exact path adherence. No automatic switch to another model, provider or paid retry.

## Review

The storyboard shows the sampled path from above, numbered landmarks, time, height,
bank and endpoint beside the existing source-image/previz panels. The diagram is a plan,
never an overlay on the final video. Propellers are not part of this first preset.

Inspect the whole previz and generated clip, including random seeks and bends:

- The route exposes the planned landmark; near and far objects show changing parallax.
- Turns and banking stay continuous, without flips, collisions or unexplained cuts.
- The endpoint and timing match the plan; trees, terrain and buildings keep their identity.
- The picture contains no route line, HUD or added marker; only normal burned subtitles.

A valid drone shot is excluded from the full-video wide-shot ratio. Other shots keep their
existing limits, and repeated framing/movement still triggers the repetition check.
Schema errors and stale bindings are preflight errors. Actual visual findings follow
[assembly video HITL](../../produce/references/assembly-video-hitl.md); do not fabricate a
PASS or turn those findings into an unconditional assembly veto.

## MCP input fields

`storyboard_apply` exposes the same shot schema under `set.shots[]`, `shots[].shot` and
`insertShots[].shots[]`. Its tool definition lists playback `type`, `shot.render.mode`
and `purpose`, `shot.videoDesign.look` and motion kind, plus `visual.camera.preset`,
`variant` and the complete trajectory fields. A camera preset does not choose the render
mode or the episode look automatically.

Drone camera input is validated when the MCP request is parsed, including waypoint order,
coordinate vectors and cinematic/FPV bank limits. Derived camera slots may be absent during
a draft; prepare them before `storyboard_check` or generation. Render-purpose compatibility,
source assets, previz bindings and the rest of the production contract remain the checker's
job. Ordinary cameras need no preset, and extra visual/video fields are preserved. An
upsert replaces the complete shot: read it first and send its other fields with the edit.
