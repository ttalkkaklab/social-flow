# Choose each cut's production route

## Contents

- [Decision order](#decision-order)
- [Routes](#routes)
- [Recording the choice, and the checks](#recording-the-choice-and-the-checks)
- [Connecting to the builder](#connecting-to-the-builder)
- [Limits on graphs and video](#limits-on-graphs-and-video)
  - [Donut, pie and map choices](#donut-pie-and-map-choices)
- [Start and end frame planning](#start-and-end-frame-planning)

## Decision order

Read the approved production mode in `window.PRODUCTION` first. `hybrid` follows the order
below. `full_video` keeps each cut's real `purpose` and `infoType` and uses `generated_video`
for every new scene: the model's action and the camera move explain the cut, and
`videoDesign` records the opening state, the action, the final state, continuity and the
review criteria. Both modes' estimated generation cost and retry cost are shown in HITL
first; the cost and approval contract is [production-mode.md](production-mode.md).

Read the narration and write down the one thing the viewer must learn from this cut. Do not
start from the nouns that appear or from the APIs available. Answer these questions, then
write `shot.render`.

1. Is the point a comparison of size, ratio, trend or distribution? Use a data-graph HTML scene.
2. Does it explain a sequence a person performs, or an interaction with an object? Use a 3D
   character HTML scene.
3. Does it explain how parts join, how force travels, or a physical state change? Use a 3D
   object HTML scene.
4. Does the continuous action itself have to be seen, more than explained? Write why a still
   is not enough and consider generated video: complex expressions, cloth, a crowd in motion.
5. Does real footage of it exist — the actual place, the actual era, the actual event? A free
   stock or archive clip beats a generated one when reality is the point, and costs nothing.
   Run `stock_search`, keep an item only when its license record says commercial and modify,
   and route the cut as `stock_video`. A stock photograph feeds a still-camera cut the same
   way: `visual.bg` under `images/stock/` plus `visual.license`, no `bgPrompt`.
6. Is the point who a person is, a mood, a place or a clue? Use a still with a camera move
   that fits the purpose.

When two things are the point at once, split the cut. When one is supporting information,
choose the one route that fits the point. "Sixteen and thirty-two teeth mesh" explains an
operation, so it is an object scene; "compare the two products' sales" is a data graph. A
person who is only introduced is a still. Recorded evidence and user-supplied footage keep
their source and stay outside this classification.

## Routes

| The point of the cut | `purpose` | `mode` | Example |
|---|---|---|---|
| Who a person is, mood, place, clue | `portrait`, `atmosphere`, `place`, `detail` | `still_camera` | Approach an inventor's face; reveal a workshop by pulling back. |
| A process a person performs | `human_process` | `character_html` | A worker sorts items or loads a cart, shown directly. |
| How an object works or changes | `mechanism`, `physical_state` | `object_html` | Gears meshing, a hinge turning, a valve opening. |
| Quantities and time order | `comparison`, `trend`, `share`, `distribution`, `geographic`, `timeline` | `data_graph` | Sales compared, change over time, composition. A timeline uses dates. |
| A short quotation or verdict | `evidence_quote`, `verdict` | `editorial_html` | A quotation with its source; a verdict in a few words. |
| Continuous action that carries the meaning | `live_action` | `generated_video` | Cloth in the wind, or a person's movement, when that movement is the point. |
| Real footage of the actual place, era or event | `archive` (this route only); `live_action`, `atmosphere` and `place` may take it instead of their default | `stock_video` | A 1950 newsreel of the street; a real launch from the NASA library; a real market at dawn from Pexels. The license record travels with the cut (scenes-schema §stock material). |

Stills also record `camera.effect`, `target` and `reason` — eight effects: `focus-in` ·
`rack-focus` · `approach` · `pull` · `pan` · `push` (the plain slow zoom-in, still-camera.js's
default) · `reveal` · `parallax`. Focus-in suits introducing a
person, approach suits stressing a clue, rack focus a shift of attention, pull a place. Do
not repeat one effect on every cut. Foreground reveals and depth parallax need prepared
layers. Asset conditions are in [illustrated-scenes.md](illustrated-scenes.md).

Characters move hands and feet to show the actual process; a nod or a waving fan is not an
explanation. Character cuts default to no marks, and an object cut shows one part label at a
time, only when needed. A model or action the user rated well is not changed while marks are
being fixed.

## Recording the choice, and the checks

```js
shot: {
  infoType: 'principle',
  render: {
    mode: 'character_html',
    purpose: 'human_process',
    reason: 'Shows the order in which a person loads the cart and sets off.',
    actors: ['the carrier'],
    action: 'Lifts the sack onto the cart, takes the handle and starts moving.'
  }
}
```

Apply the repetition limits and per-scene review in [visual-direction.md](visual-direction.md).
Copying one reason across three or more cuts fails the check. Text-led screens are at most two
per short and at most 20% of generated cut length in long-form. One cut lasts at most 8
seconds; `motionBeats` cannot get around that. `evidence_quote` records
`evidence:{source,quote}`; to show the document itself, use a still-camera cut.

Every generated cut needs `mode`, `purpose` and `reason`; recordings and the shared outro are
exempt. Characters need `actors` and `action`; objects need `action`. Generated video also
needs `motionEssential:true`, `action` and `whyNotStill`. A stock clip needs `action` (what
the viewer sees happen), `visual.source: "stock"` and the `visual.license` record — provider,
url, license, licenseUrl, `commercial` and `modify` both true, `attributionRequired` with the
credit text when true, `retrievedAt`; share-alike and non-commercial records are refused, and
before production the file has to sit under `footage/` as `visual.clip`. Quantities need
`data:{chart,source,unit,values:[{label,value}],baseline}`; a timeline uses `date` instead of
`value`, and a share adds the whole as `total`. The label each sentence emphasizes goes in
`data.beats`. Chart choice and the shared SVG template follow [chart-design.md](chart-design.md);
a screen that only enlarges a number is not a substitute.

[render-routing.js](render-routing.js) checks that purpose matches mode, that the required
evidence is present and that assets are linked. `check-scenes.js --draft` catches a missing
choice or a semantic conflict; production also compares the chosen mode with the actual
handoff in `visual`. The review page shows the mode and the reason. Interpreting the
narration remains the author's job: the checker cannot tell whether a recorded intent matches
the sentence, so compare the narration with the reasons once more before approval.

## Connecting to the builder

| `mode` | Connection to the existing production path |
|---|---|
| `still_camera` | `visual.bg` and `visual.camera` go to the image camera path. Focus and layer effects are authored as `visual.slide.kind:"camera"`. |
| `character_html` | `visual.slide` with `kind:"diagram"`, `motion:true`, `treatment:"editorial"`, `subject.kind:"object"`, `object.renderer:"mesh"`. Actors and contact actions link to the model plan. |
| `object_html` | The same mesh path, without characters the explanation does not need. |
| `data_graph` | `subject.kind:"data"` moves values and relations. A graph is never a decorative 3D object. |
| `editorial_html` | `kind:"diagram"`, `motion:true`, `treatment:"editorial"`, `subject.kind:"type"` for a short quotation or verdict. |
| `generated_video` | `visual.video` or a video cut, with the reason in `visual.why`, and its 3D previz in `visual.video.previz` (§Every generated video cut is previz-guided). The existing engine, cost and reference-image rules apply; under `PRODUCTION.videoProvider:"host"` the slot is `engine:"host"` (the CLI's own `image_to_video`) and the previz shapes the still and the prompt. |
| `stock_video` | `visual.source: "stock"` and `visual.clip` under `footage/` — the same supplied-file lane as a recording. Produce downloads and normalizes it, drops its audio and trims from `visual.in`; TTS, subtitles and BGM run over it, nothing is drawn on it. It bills nothing and sits outside the generated-video cap. |

Camera HTML copies [camera-slide-template.html](camera-slide-template.html) and changes only
`SLIDE_SHOT` to the cut number; copy [still-camera.js](still-camera.js) into `slides/assets/`.
Focus regions and layers are read from `shot.render.camera`'s `focusFrom`, `focusTo` and
`layers`; a focus region is normalized `[x,y,rx,ry]`. Prepare the image with the chosen host
image tool first; an existing HTML file is no reason to skip generating `visual.bg`. Wrapped
in HTML or not, this is a still-camera cut and does not count toward the true-motion ratio.

Run `check-scenes.js` before generating. When an asset is missing or an engine is not ready,
do not switch routes quietly; revisit the reason, revise the plan, then check again. Already
approved sentences or published posts are not remade to apply this rule.

## Limits on graphs and video

Choose the chart by data type and by the relation to show, following the UK Office for
National Statistics [chart choice guidance](https://service-manual.ons.gov.uk/data-visualisation/chart-types/choosing-a-chart-type):
bars or dots for category comparison, a line for a trend over time, a stacked bar for
composition, a histogram for a distribution. Record the source, the unit and the values; a
chart that compares by length starts at zero. Never invent a missing value or bend the data
to suit an animation.

The generated-video count is a ceiling. A stock clip is not a generated slot: it neither
counts against the cap nor frees a slot for one more generated cut. The first cut goes through the same choice;
`hook_video` is off by default. When a channel switched it on explicitly, design an opening
that needs continuous action while keeping that constraint. Every generated-video cut needs a
reason a still or a controllable HTML action would not do. Do not add an unrelated
character, graph or clip to meet a budget or a motion ratio.

### Donut, pie and map choices

A whole's composition uses `share` with `donut`, `pie` or `stacked-bar`; when similar values
must be compared exactly, use bars. Donut and pie keep the ratio of the total to each slice.
When geographic distribution is the point, use `geographic` with `map`: rates and densities
as per-region colour, counts as circle area. Boundaries and coordinates need a source. A
region with no data is hatched, which is different from zero. Each format's data contract and
examples are in [chart-design.md](chart-design.md).

## Every generated video cut is previz-guided

Every `generated_video` cut with a `visual.video` slot pre-renders its camera and blocking in
3D first (user directive 2026-09-11) — a Blender previz through the `blender_*` bridge or a
three.js previz through `previz-template.html` — rendered at the cut's billed length, 24 fps,
and stored as `visual.video.previz` with `renderer`, `clip`, `firstFrame`, `sha256`, `fps`,
`seconds` and `camera.movement`. `checkScene` refuses the cut without it after the draft pass;
`checkPreviz` refuses a renderer other than `blender`/`threejs`, a clip that is not a local mp4
rendered at whole seconds and 24–60 fps, a first frame that is not a local png, a missing hash,
a `camera.movement` that differs from `visual.camera.movement`, and — on the Seedance route
(`handoff:"reference_video"`, `modelPurpose:"previz"`) — a `referenceImagePaths[0]` that is not
the source still, an end frame, or a prompt that does not bind `Video 1` and `Image 1` and
close the clay read with "Do not reference its visual content". On `engine:"host"` the handoff
is `frame_and_prompt`: the still is edited from the first frame and the prompt carries the
move. Imported clips (`visual.reuse`) carry none. The contract, both renderers, the first-frame
still and the prompt skeleton are in [blender-previz.md](blender-previz.md) §6.

## Start and end frame planning

For every newly authored image-to-video shot, set `visual.frames.mode` to `first` or
`first_last` and write `reason`. Use `first_last` when the final position, a camera destination,
opening/closing, assembly, removal or another visible state change must be controlled. Write
`endState` before generating images. Use `first` for a mood shot or subtle ambient motion with
no required destination. The decision is per shot, independent of hybrid/full-video choice.

```js
visual: {
  bg: 'images/s1-start.png',
  frames: {
    mode: 'first_last',
    reason: 'The camera must end close to the closed book.',
    endState: 'The same closed book fills the lower center; furniture stays in place.',
    end: 'images/s1-end.png'
  },
  video: { engine: 'seedance', model: 'seedance-1-5-pro-251215',
    resolution: '1080p', generateAudio: false, prompt: 'Slow forward dolly toward the closed book.' }
}
```

`visual.bg` is the start image. `visual.frames.end` is the end image; the Seedance router
forwards it as `lastImagePath`. Do not maintain a second divergent end path. Legacy
`visual.video.lastImagePath` still works; if both exist they must match. Before calling the
media tool, resolve both paths relative to storyboard/ and send their absolute paths.

The HTML shows a single input or two adjacent inputs, their reason, final state and pending
image slots. Each thumbnail opens the full image. Keep image framing, identities, objects,
lighting and spatial layout consistent; change only the planned action or camera endpoint.
Generate the start first, inspect it, then use it as the end-image edit reference. A two-frame
plan cannot proceed to video with a missing end image or identical start/end paths. Store the
source/end hashes with the playback review. Changing frame plans invalidates the cost approval.
End frames guide endpoints; they do not prove that intermediate movement is physically correct.
Do not convert a continuity failure into a passing review because both stills look good.
