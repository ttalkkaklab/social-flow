# Motion graphics: choose a visual argument before a renderer

Use this reference whenever a shot is planned as motion graphics. `shot.motionGraphic`
is separate from `shot.render` (execution route), `shot.infoType` (information), camera,
visual style and transition. Existing boards remain readable without this new field.
Do not add it to ordinary footage merely because a camera moves.

## Contents

- Plan from the situation
- Type catalog and built-in content
- Design, timing and installed preparation

## Contextual themes

For every newly planned motion graphic, set `style.theme` as below. Keep the semantic
`type` separate: comparison describes what the scene explains; report describes how
it looks and moves. The executable design-system source is `motion-graphics.js`;
`prepare-motion-graphic.js --themes` lists its tokens.

```json
{"style":{"theme":{"id":"auto","context":"software"}}}
```

| Theme | Context | Use | Typography, composition and timing |
|---|---|---|---|
| report | research | Data, evidence, measured change | Blue ink on cool paper, compact title, tight geometry, smooth measured movement |
| product | software | UI actions, digital transformations | Violet accent, wider margins, medium title weight, softer surfaces, quick settling |
| learning | education | Processes, relationships, models | Green ink, restrained title scale, spacious stages, longer sequential reveals |
| campaign | campaign | Short statements and identity | Rose accent, heavy display type, larger title, earlier result hold |

Select context from the intended communication, audience and channel brief, never
from a keyword match or shot number. `auto` with context selects the corresponding
theme; without context it uses the semantic type as a deterministic fallback.
For example, comparison defaults to report, but a comparison of software outputs
can use product by setting `context:"software"`. UI demo defaults to product;
process to learning; kinetic type to campaign. Avoid campaign for dense evidence.

For a consistent episode, set `window.THEME.motionGraphicTheme` through
`storyboard_apply.globals.THEME`, preserving the other THEME fields:

```json
{"THEME":{"brand":"Channel","motionGraphicTheme":{"id":"product","reason":"A connected software walkthrough"}}}
```

Automatic shots inherit that common choice. An explicit shot theme id or explicit
shot context overrides it. Changing the common theme refreshes all inherited
`resolved` records. The storyboard header displays the common theme; shot cards
show their actual choice and reason. Without a common theme, automatic selection
continues to use shot context and semantic type. Existing palette-only boards
change only if a common theme is explicitly added or the shot is migrated.

A channel's approved theme takes priority: supply its explicit id and a brief
subject-specific `reason`. Use one theme across a connected sequence unless a
change of purpose justifies a switch. Do not cycle all six themes in an episode.
`storyboard_apply` persists `style.theme.resolved` (id, reason, selectedBy and
systemVersion); it recomputes automatic choices after edits. An explicit id wins
over context. Unknown ids/contexts are input errors, not silent fallbacks.

The renderer consumes bundled font roles: Paperlogy titles for report/product/learning,
Black Han Sans for campaign, Gowun Batang for story, and Dongle for playful. Body
text uses Pretendard; numeric/Latin roles use Space Grotesk or Roboto Flex. Font
files, cmap coverage, source URLs, hashes and OFL notices ship with the plugin.
The preparer records whole-text fallback to bundled Pretendard when a title font
lacks a character, and reports characters that no bundled fallback can render.
Do not claim glyph support from `document.fonts.check` alone.

It consumes theme-specific
weights, size, tracking, spacing, corner geometry, colors and motion curve from the
theme. This is a first theme system, not evidence that all its compositions meet a
visual quality target. Review actual rendered clips for hierarchy, content fit,
readability, purposeful motion and subject fit. Do not turn a functional test into
an aesthetic score. Existing palette-only boards remain unchanged; migrate them
explicitly. A theme never authorizes a mock recording or a flat physical mechanism.

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
Liquid Glass is the material for the canonical chart (chart-design.md §Liquid Glass material);
elsewhere the default stays restrained, with no glass gradients unless the subject calls for
them. Make the visual relation recognizable before decorative effects.

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

For playful kinetic type, set `content.emphasis` to one exact substring per line (empty string skips emphasis). The selected word grows into focus, moves to its reading position, and the remaining phrase resolves around it. Choose the word that carries the sentence’s change; do not emphasize arbitrary words for decoration.

For input/output mappings that reorder fields, provide `mappings[].fields` with 1–2 exact substrings shared by `from` and `to`. The renderer copies each highlighted field, reorders it at the destination, then resolves the full output. Rows travel together at a fixed pitch, then reorder one row at a time so neighbouring fields never cross. Without field metadata it uses the simpler whole-row transition.

Portrait process artifacts may declare `artifactKind:"frames"` or `"checklist"` with 1–3 short `artifactItems`; retain `artifact` as the readable summary. Use miniature frames for an actual storyboard output and a checklist for actual review criteria, not arbitrary variation. Other artifacts retain the simple document specimen.

Frame specimens can pair each `artifactItems` label with `artifactVisuals` (`bars`, `flow`, or `check`) when that representation describes the actual planned frame. The miniature is a storyboard sketch, never evidence of a rendered or recorded asset.
