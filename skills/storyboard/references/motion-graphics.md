# Motion graphics: choose a visual argument before a renderer

Use this reference whenever a shot is planned as motion graphics. `shot.motionGraphic`
is separate from `shot.render` (execution route), `shot.infoType` (information), camera,
visual style and transition. Existing boards remain readable without this new field.
Do not add it to ordinary footage merely because a camera moves.

## Contents

- Plan from the situation
- Type catalog and built-in content
- Design, timing and installed preparation

## Plan from the situation

1. Write the viewer takeaway and identify the relation: quantities, part/whole,
   ordered stages, connections, changed state, interaction, transformation, space,
   physical operation, human action, identity or emotion.
2. Consult `motion-graphics.js` (`prepare-motion-graphic.js --catalog` lists it).
   Select one primary type and explain why a plausible alternative loses. Numbers
   incidental to a mechanism do not automatically make a chart; a person mentioned
   in narration does not require a character; an abstract workflow does not require
   3D boxes. Do not choose by shot number, title keyword, or cycling a template list.
3. Identify evidence: `data`, `recording`, `reenactment`, `metaphor`. Supply real
   input/output evidence for claims of actual execution. Label mock UI as reenactment.
4. Design a meaningful initial state, visible change, and readable result. Specify
   normalized beats against the shot's measured narration; leave a final read hold.
5. Record the plan through storyboard_apply (complete shot upsert), or scenes.js;
   refresh storyboard-html.js. Its shot card displays the type, takeaway and reason.
6. Use the appropriate execution route. Built-in abstract SVG scenes use `motion_html`;
   mesh subjects, recordings and assets keep their existing supported routes. A catalog
   entry is not a promise of a canned renderer: `builtIn:false` requires authored work.

## Situation → type → inputs

| Type | Use when | Required material / avoid |
|---|---|---|
| kinetic_type | the statement itself is the visual subject | 1–3 concise lines; avoid full paragraphs |
| comparison | compare measured magnitudes | 2–6 labelled values, common unit and source |
| part_whole | show allocation or composition | 2–4 nonnegative parts summing exactly to total |
| trend | explain measured change | ordered observations, unit, source; do not invent intermediates |
| timeline | event order matters | 2–4 dates and labels; spacing need not imply elapsed time |
| process | ordered steps and handoffs | 2–4 steps; do not imply branching with a straight chain |
| relationship | connections matter more than order | nodes and explicit index-pair edges |
| causal | a variable drives a result | authored model, variable, response and limits |
| before_after | the same subject changes | matched input/output and the invariant |
| ui_demo | an action produces an interface response | input, action, output; mock is not recording |
| input_output | content transforms into a corresponding result | actual paired content or labelled reenactment |
| recorded_evidence | prove an operation happened | real supplied recording; no drawn marks over video |
| spatial | locate detail within a whole | authored map/space and focus route |
| layers | explain digital layers | 2–4 named layers; physical assemblies use mesh |
| mechanism | explain physical operation | articulated recognizable mesh; not labelled rectangles |
| product_hero | product appearance carries the message | real product asset and purposeful lighting/camera |
| character_action | human action/reaction explains the event | authored character, contact, action and reaction |
| metaphor | visual analogy connects concepts | explicit correspondences; not literal evidence |
| simulation | explain accumulation and limits | built-in queue: capacity 2–12, arrival/service per second; other models authored |
| brand_mark | identity should be remembered | supplied logo and signature motion |
| montage | energy and atmosphere are the goal | assets and beat map; not dense facts |

## Persisted contract

`shot.motionGraphic = {version:1, type, intent, reason, evidence, style:{palette,reason},
beats:[{at:0,action:'initial state'},{at:0.3,action:'meaningful change'},
{at:0.8,action:'hold the result'}], content:{...}}`.

The built-in runtime has fixed, type-specific choreography and uses measured total
shot time. `beats` describes editorial intent; it is not an executable keyframe API.
If speech needs different event positions, author a seekable slide rather than claim
that this metadata retimes the runtime. Report audio alignment as not_reviewed until
it has actually been observed. No score or review flag is needed to execute.

Content common: `title`, optional `subtitle`, `source`.
- comparison/part_whole/trend: `values:[{label,value}]`, `unit`, `source`; part_whole also `total`.
- process/timeline/layers/relationship: `items:[{label,detail?,date?,artifact?}]`; relationship also `edges:[[0,1]]`.
- before_after/input_output/ui_demo: `input`, `output`, optional `inputLabel`, `outputLabel`; ui_demo also `action`. Use concrete paired content, not generic labels such as “summary result”. input_output optionally uses `mappings:[{from,to}]` (1–3 rows) to animate content identity across the conversion. Portrait process stages optionally use `artifact` for a short visible output specimen.
- kinetic_type: `lines:[string]`.
- simulation: `capacity`, `arrival`, `service`. This visual is a bounded queue approximation, not a provider's real quota algorithm.

For built-in slides set `render:{mode:'motion_html',purpose:'motion_explanation',reason}`,
`visual.slide:{file:'slides/sN-name.html',kind:'diagram',motion:true,treatment:'editorial',
renderer:'motion-svg-v1',role:...,motif:...,motionBeats:[{group:1,primitive:'state-transform'}]}`.
Preserve truthful `infoType`, `role` and `subject` change records. A numeric chart may keep
its quantitative purpose; motion_html is an alternative route, not an exemption from facts.

## Art direction and output review

Use local Inter for Latin/numbers and Pretendard for Korean. The installed preparer copies
both licensed fonts; never rely on a family name with no font file. For JP/SC/TC or other
scripts not covered by these faces, use an authored slide with the appropriate bundled
review font instead. Check actual rendered text, never infer glyph coverage from CSS.

Palette choices are editorial (cool clear data), botanical (organic/process), plum
(creative transformation), midnight (technology/contrast). Choose by subject and channel;
these are starting points, not a mandate to restyle every shot. Keep number and unit
hierarchy, distinct shape roles, generous but purposeful space and quiet source text.
No glass gradients by default. Make the visual relation recognizable before decorative effects.

Build with the installed `skills/produce/references/prepare-motion-graphic.js BOARD --shot N`,
then run the returned renderer command at final fps. Use only the shared headless capture
lane. Inspect actual first/change/settled frames plus temporal playback or dense frame
sampling, random seeks and portrait/landscape variants. Inspect each sample individually:
wrong type, misleading evidence, collisions, unreadable labels, stale fonts, invalid data,
and empty or purely decorative motion. A contact sheet is not audio listening or full playback.

Review aesthetic quality independently from contract tests. Freeze the rubric for a requested
improvement loop, use an independent reviewer and retain failures. Do not manufacture a passing
score or make subjective quality gates prerequisites for unrelated execution.

Long labels, unusually large numbers and dense datasets need an authored composition if the built-in layout cannot fit them. Never abbreviate or drop source values silently. Check intermediate frames as well as the final hold: moving rows can collide even when the final layout fits.
