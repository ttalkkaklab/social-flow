# Produce and verify explanatory motion

Use the existing render routes. A timeline, relationship or quantity explanation needs
its subject to change in time. A PNG or an image score cannot prove that change.
An intentionally static quotation or archive photograph is valid when explicitly planned;
do not add arbitrary motion to satisfy a numeric threshold.

## Author and render

For charts, keep source values and timed reveals in `shot.render.data`. Follow
[chart design](../../storyboard/references/chart-design.md). Register the shared chart
slide in `visual.slide`; keep the planned mode `data_graph` instead of `generated_video`.
Use the existing narrator audio and its measured length when revising a visual alone.

```sh
node "$PLUGIN/skills/produce/references/prepare-chart-slide.js" "$BOARD" --shot 1
node "$PLUGIN/skills/produce/references/render-motion-slide.mjs" \
  "$BOARD/slides/s1-accounts.html" --out "$RENDER" --segs 1:5540 --fps 30 --reuse
```

[prepare-chart-slide.js](prepare-chart-slide.js) copies the canonical template and
runtimes to the registered slide, validates the handoff, and prints the render command.
The filenames and duration above are examples; use the selected shot and measured timing.
Render at final frame rate. Inspect opening, transition moments, completion, random
seeks and playback. If the result is wrong, change the shared renderer and rerun the same
input; do not substitute an episode-only drawing or FFmpeg PNG-loop script.

For a local one-segment review with existing speech, mux without changing the speech rate.
`apad` fills only the tail to the video clock; `-shortest` ends at the video duration.
This is a visual review sample, not episode assembly or publishing.

```sh
ffmpeg -i "$RENDER/r1.mp4" -i "$AUDIO" -map 0:v:0 -map 1:a:0 \
  -c:v copy -af apad -c:a aac -shortest -movflags +faststart "$SAMPLE"
```

`--reuse` checks the existing render proof, local dependencies, runtime code, timing,
options, tool versions and output hashes. Missing, stale or damaged outputs render again.
Remote dependencies and debug PNG modes do not reuse cached videos. Cache reuse never
converts a quality warning to a pass. Without `--reuse`, rendering always runs.

## Inspect actual encoded cuts

[motion-expectation.js](motion-expectation.js) exports
`assess(file, scene, {start, seconds, policy, fps})` for samples and the final assembler.
It measures `productionPlan.cuts` separately so adjacent footage cannot hide a static
explanation. `cut.start` seeks within the source; it is not a timeline start.
Keep `cuts[].seconds` synchronized with the actual edit. A graphic defaults to explanatory
motion; a `renderedFile` extension alone never proves subject motion.

For an intentionally static cut, use
`motionIntent: {type: 'intentional_still', reason: 'Hold the original quotation for reading'}`
on that cut. For an unsplit scene, use `visual.motionIntent`. A reason resolves intent;
contradictory generated/explanatory modes still produce findings. Never add this field
merely to suppress a missing animation warning.

Report three independent results: source-image agreement, encoded motion findings, and
semantic review. Keep semantic review `not_reviewed` until the host actually inspects it.
Pixel changes cannot certify explanation, narration alignment or action. Preserve findings
for thin-line animations as well as static images; do not lower thresholds or animate a
background to obtain a pass. Quality warnings do not create a new approval gate.

See [motion measurement](motion-contract.md) for proxy limits. In an explicitly requested
improvement loop, use an independent host reviewer, freeze the rubric, bind evidence to
exact media hashes and fix the shared production path before rerendering.
