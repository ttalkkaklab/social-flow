# Charts for narrated video

A chart lets the viewer compare evidence. Lead with a short factual headline, give the chart
most of the space, and keep units and sources legible. A giant number over a token bar is not
the default. Abstract quantities do not need 3D extrusion, glass, gradients, decorative
characters or a dashboard of rounded cards.

## Choose the chart from the relationship

| Relationship | `data.chart` | Source data | Treatment |
|---|---|---|---|
| Category magnitude | `bar` | labelled values | A shared zero baseline, direct values and one emphasized category. |
| Category position | `dot` | labelled values | Sparse guide lines, precise dots and direct values. |
| Change over time | `line` | labelled values with ISO dates | Time-proportional spacing, one line, focus on the discussed observations. |
| Parts of a whole | `stacked-bar` | nonnegative values plus `total` | One 100% bar; values must sum to the whole. |
| Distribution | `histogram` | contiguous equal-width `from`/`to` bins and frequencies | Adjacent columns; `binUnit` names the horizontal measurement. |
| Dated events | `timeline` | labels with ISO dates | An elapsed-time rail. Split crowded event clusters into another cut. |

Use at most six categories, four timeline events, or twelve line observations/histogram bins per cut.
Keep labels short. Do not drop source values merely to fit the cap; split the evidence or
aggregate only when the source and narration justify it. Do not switch chart types simply
to pass a variety test. Never invent comparison values for an isolated number.

## Plan the comparison and the spoken focus

```js
shot: {
  infoType: 'statistic',
  render: {
    mode: 'data_graph', purpose: 'comparison',
    reason: 'Compare two measured batch sizes on the same scale.',
    data: {
      chart: 'bar', source: 'Demonstration dataset, not a real-world claim',
      unit: 'items', baseline: 0, surface: 'paper', decimals: 0,
      values: [{label: 'Batch A', value: 16}, {label: 'Batch B', value: 32}],
      beats: [
        {group: 1, focus: ['Batch A'], insight: 'Batch A contains 16 items.'},
        {group: 2, focus: ['Batch B'], insight: 'Batch B contains twice as many.'}
      ]
    }
  }
}
```

There is one beat per narration segment. `focus` names existing source labels; `insight`
states the comparison, not the animation instruction. Repeating the same focus for adjacent
sentences is a cue to shorten the cut or show another comparison. The chart's final values
stay exact; motion reveals geometry and shifts attention without rescaling axes between groups.

The slide uses `kind:'diagram'`, `motion:true`, `treatment:'editorial'`,
`chartRenderer:'svg-v1'`, `subject.kind:'data'`, `quality:'object-state-v1'`, the matching
`role`, and one `{group,primitive:'chart-reveal'}` in `motionBeats` per segment. Write the
usual before/after subject states. A chart must show how the quantity or relationship changes,
not claim that a new caption is a data change.

## Production and visual style

Copy [chart-slide-template.html](chart-slide-template.html) to the registered slide filename;
change only `SLIDE_SHOT`. Copy [chart-runtime.js](chart-runtime.js) and
[render-routing.js](render-routing.js) to `slides/assets/`. The checker compares the template
and runtimes with the installed copies. Improve the shared renderer for new designs, not a
one-off episode file. Author titles, values, beats and sources in `scenes.js`.

- `surface:'paper'` is warm paper with deep green ink; `surface:'ink'` is dark ink with warm
  light type. The data surface is intentionally quiet, without the object scene's slabs and
  type shadows. Keep the same palette across related charts.
- `THEME.chartAccent` may supply one six-digit hex accent. It emphasizes the discussed marks;
  axes and reading text retain their high-contrast ink. A full rainbow is not a category key.
- Portrait uses a headline above a large chart. Landscape places the explanation beside
  the chart. Both reserve the format's subtitle area. Direct labels reduce legend hunting.
- Bars start from zero, including signed data. Time spacing reflects elapsed time. Values
  of a million or more use compact numeric notation; choose `decimals` to match source precision.
- Initial geometry reveals with a smooth ease. Subsequent groups keep the geometry and
  change the focus. No bounce, looping pulse or resetting count at every sentence.

Run `check-slide.js --require-all`, then render with measured segment durations using
`render-motion-slide.mjs`. Inspect beginning, middle, end and the join between groups.
Check negative/zero values, long labels, crowded dates, source wrapping and phone readability.
Inspect all chart types used in the episode. A correct scale does not guarantee a readable frame.
