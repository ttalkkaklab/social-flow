# Slide design — the look and the motion of an HTML slide

The source of truth for how a **motion slide** looks and moves. `motion-slide-template.html`
carries these rules as CSS tokens and helpers, `check-slide.js` machine-checks the
determinism half, and `slide-reviewer` scores a rendered slide against §5 — the rubric
lives here so the template, the author and the reviewer read one document. Every
`visual.slide` is a motion slide. There is no still-slide path.

Where the rules come from: the 2026-08-29 research
(`docs/research/2026-08-29-motion-slide-lane/`). The short version — animation raises
attention and engagement and leaves comprehension unharmed **only when the movement
carries meaning** (a number growing, a bar reaching a comparison, a step appearing when it
is spoken). Decorative motion buys nothing and costs comprehension. Every rule below
serves that one finding.

## Contents

- [1. Palette — ink, paper, one accent](#1-palette-ink-paper-one-accent)
- [2. Type — one family, weight does the hierarchy](#2-type-one-family-weight-does-the-hierarchy)
- [3. Composition — one fact, then the evidence](#3-composition-one-fact-then-the-evidence)
- [4. Motion — every movement says something](#4-motion-every-movement-says-something)
- [5. What reads as generated — and the rubric](#5-what-reads-as-generated-and-the-rubric)
- [6. Kinetic type — when the words are the picture](#6-kinetic-type-when-the-words-are-the-picture)
- [7. Character act — when someone is reacting](#7-character-act-when-someone-is-reacting)

## 1. Palette — ink, paper, one accent

| Token | Value | Role |
|---|---|---|
| `--ink` | `THEME.ink` | the ground. Flat. One faint radial vignette is the only depth |
| `--paper` | `#ECEAE2` | all text. A slightly warm off-white on a cold ink — chosen, not `#fff` |
| `--accent` | `THEME.accent` | **one** emphasis colour — the unit after a hero number, the kicker rule, bar fills, callout dots, `**bold**` |
| `--muted` | paper at 62% | labels, sources, secondary values |
| `--line` | paper at 24% | hairlines, bar tracks, brackets |

`THEME.accent2` is not used on slides. Two accents become a gradient, and a gradient on
text is the first thing a viewer reads as generated. The one allowed second emphasis is
`.bar.hot` — the value the scene is about, drawn in paper instead of accent.

## 2. Type — one family, weight does the hierarchy

Local stack only: `"Pretendard Variable", "Pretendard", "Apple SD Gothic Neo", "Noto Sans
KR", sans-serif`. No web font URLs (the renderer waits for `document.fonts.ready`, which
does not cover a font the page never used, and a CDN font is a render timeout waiting to
happen).

Sizes are the `formats.js` font ratios, mirrored inline in the template:

| Role | Portrait 1080×1920 | Wide 1920×1080 | Weight |
|---|---|---|---|
| kicker | 34px | 24px | 500, muted, accent rule before it |
| title | 60px | 43px | 700, `letter-spacing:-.02em` |
| hero number | 205px | 148px | 800, `letter-spacing:-.035em`, `tabular-nums` |
| hero number, stat poster (`.hero.max`) | 260px | 185px | same — up to 4 digits; more digits go back to the base size |
| unit | 30% of hero | 30% of hero | 600, accent |
| label | 50px | 36px | 600 |
| description / bar label / value | 35px | 25px | 400 |
| foot (source) | 26px | 24px | 400, muted |

Floor: nothing below `desc` size goes on screen. Digits everywhere are `tabular-nums`, and
the hero count-up additionally draws each digit in a fixed-width cell (`.hero .num i`)
padded to the final digit count — the machine that renders may not have Pretendard, and
Apple SD Gothic Neo has no `tnum`, so without the cells the unit after a counting number
walks 40px left and right (measured on the first fixture). Install Pretendard on the
render machine anyway; the cells make the layout right either way.

## 3. Composition — one fact, then the evidence

- **One hero per slide.** One big number, or one comparison, or one flow. A second hero
  is a second slide.
- **Pick an archetype before laying out freeform.** Four compositions ship in the template
  and fill the zone by construction: the **stat poster** (`.stage.spread` + `.hero.max` —
  one oversized number, title above, source anchored below), the **split compare**
  (`.split` — two columns against a center hairline), the **timeline rail** (`.timeline`),
  and the **evidence stack** (editorial custom DOM, ep10 s7 shape). Freeform is allowed,
  but the renderer measures how much of the zone the painted content covers
  (`zone_fill_pct` in the summary) and warns under 55% — the top-clustered, half-empty
  frame is the defect this measurement exists to catch.
- Content sits in the zone (`formats.js zone` — portrait x 176 · top 190 · bottom 570;
  wide x 96 · top 96 · bottom 285), vertically centred. The bottom band belongs to the
  subtitles; only the ground colour reaches it.
- Read order is top → bottom, left → right; the hero comes first in that order.
- Structure is drawn with **hairlines (1.5px)**, not boxes — a kicker rule, bar tracks,
  step connectors, corner brackets around a region under inspection. Cards with borders,
  rounded panels and drop shadows are what a slide deck looks like, and the produce rule
  "no slide (PPT) look" applies here too.
- At most **4 reveal groups and 6 lines of text** per slide. Past that the slide is two
  slides.
- Numbering (① ② ③) only when the content is a sequence the viewer must follow in order.
- A source line (`.foot`) whenever a number is on screen — the study, the report, the
  year. It reads small and muted and it is the difference between a claim and evidence.
  **It belongs to group 0** — every clip that shows a figure shows its source, and a
  source entering late is a second movement in a group that already has one.
- Bars and their labels enter as one element (the `bar()` helper wraps label, value and
  track in the group); a track that sits outside the group is an empty rail on screen
  before its sentence.

## 4. Motion — every movement says something

**The state rule** (template head · renderer · reviewer all cite this line): clip k opens
on groups 0..k-1 at rest, group k animates from t=0, and the last frame is group k at
rest. Group 0 is the base (kicker, title, axes) and never animates on its own — it is
clip 1's first frame. Groups are 1:1 with narration segments by default (segment 1 →
group 1), so each element enters the moment the sentence about it starts.

Tokens (CSS variables in the template):

| Token | Portrait | Wide | Used for |
|---|---|---|---|
| `--ease` | `cubic-bezier(.16,1,.3,1)` | same | spatial settle — a fast start that lands, no overshoot, no bounce. JS `EASES.out` samples the same curve. Rise, drop, grow, character enter |
| `--ease-mask` | `cubic-bezier(.4,0,.2,1)` | same | clip-path travel — a wipe or a drawn hairline you can actually watch. `--ease` finishes in the first third, so a mask on that curve pops on instead of travelling |
| `--fade` | 220ms linear | same | opacity only — fade is never eased, and never stacked on a mask |
| `--travel` | 28px | 20px | how far a rise travels. The eye still reads arrival, but on a phone the 8px it used to be sat under the perception floor — nothing appeared to move |
| `--travel-x` | 64px | 48px | how far a side move (`fx-travel` · `h.shift`) travels |
| `--press` | 56px | 40px | how far a press (`fx-press` · `h.press`) drops onto its bed |
| `--rise` | 560ms | 640ms | spatial settle of `fx-rise` (paired with `--fade`), and duration of `fx-in` — long enough for the 28px travel to read |
| `--grow` | 900ms | 1000ms | a bar filling on `--ease-mask` — Highcharts ~1000 / Heer ~1s. `--ease` would finish the fill in the first third, so the grow would not read |
| `--draw` | 560ms | same | a hairline drawing in by clip-path on `--ease-mask`, so stroke width stays constant and the line travels |
| `--count` | 1800ms | 2000ms | a hero count-up, ease-out — lands before the sentence ends |
| `--stagger` | 80ms | same | delay per item when several things enter in one group |
| `--hold` | 360ms | 420ms | rest frames appended to every clip so the freeze frame is a settled frame |

Rules:

- **One kind of movement per group.** A bar grows while its label fades — that is one
  event (labels fade for `--fade`, then the fill grows, still one event). A count-up and a
  bar growing in the same group are two, and the eye picks neither. Split the group or
  drop one. A flow is the same shape: both nodes enter, then the connecting line draws.
  An art that travels while its caption enters with `in` is one event — the picture
  arrives, then the word names it. Mixing `drop` and `wipe` on type is still two.
- **Type enters as a clip-path reveal** (`fx-in`) on `--ease-mask`, not a 14px hop and not
  a fade stacked on the settle curve. Dates, steps, nodes and kinetic lines use that
  default. The mask itself is the visibility — pairing opacity with `--ease` opened the
  wipe before the letters were on, so the travel never read. A bar fill still grows with
  `scaleX` on `--ease-mask`; a hairline draws with clip-path on the same curve so its
  weight never thins and the line is watched, not popped.
- **Entrance motion ends inside 2.6s**; the sustain layer then carries the group to its
  segment boundary. Without `--segs` a clip is entrance + hold as before, and a narration
  segment shorter than the clip cuts to the next clip's rest frame mid-motion — the
  renderer warns past the cap either way.
- **The sustain layer — the clip fills the sentence.** produce hands the renderer each
  segment's measured length (`--segs k:ms,…`; the storyboard gate estimates with
  `--segs auto` at the schema's 4.5 chars/s), and elements marked `sv` stretch their one
  meaning-bearing movement to it: a count-up counts while the sentence says the number, a
  bar keeps filling, a hairline keeps drawing, a dot grid keeps filling (`sv: true` on
  `h.count` · `h.bar` · `h.dots` · `h.range` · `h.link` · `h.axis` · `h.stem` · `h.bus`),
  and an entered element can settle for the length of its sentence (`sv: "settle"` — a
  4.5% scale landing in a nested wrapper). Before this layer, a 1.3s entrance under a 5s
  sentence froze the frame for 3.7s — measured on ep08 s4, and the single biggest reason
  finished videos read as a slideshow. The renderer warns when a group's frozen tail
  passes 40% of its segment. Type reveals and fades never stretch — a 4-second wipe over
  a word is a crawl, not an entrance.
- **Focus shift.** A group marked `dim: true` drops to muted (0.65) while the next group
  enters, so the eye follows the narration and the end frame keeps its hierarchy — the
  runtime computes it from (g, t), no animation to own, no seam to break. Use it on
  evidence rows the narration has moved past; keep the base (group 0) and the conclusion
  bright. A no-parameter browser preview shows even the last group dimmed — a state the
  finished video never shows.
- **Movement encodes the value.** A count-up says "this many"; a bar growing to 81% says
  "this much of that"; an actor sitting, a stem drawing, or a press landing says how
  the mechanism works.
  An element that merely slides in to look alive is decoration —
  use `rise` for it, at the `--rise` token, and nothing more. No loops, no idle motion, no ambient
  drift — the sustain layer is the one sanctioned continuous movement, and it is monotonic
  and value-bearing. Cyclic motion (gears turning) is still **outside this lane** — it
  would freeze on every hold. Render it as footage and place it with `visual.video.clip`
  instead. That footage can come from a slide: a one-group slide whose
  `__paint(1, durMs, fn)` runs the length of the shot renders to an `r1.mp4`
  you wire as a clip (scenes-schema §motion slides). What stays outside the lane is
  putting cyclic motion *under a multi-segment slide*, where the seams would freeze it.
- **A photo-backed motion slide moves the subject, not the camera.** The photo may fill the
  canvas, but every narration group changes the evidence inside it: a hand sorts the debris,
  a folder leaves the shelf, a reflector unfolds, a trace reaches its target. A scale or
  translate on the whole photo, drifting dust, a light pulse or a subtitle reveal is only
  decorative camera treatment and does not count as true motion. The scene's
  `visual.action` and `slide.plan` name the same per-group changes.
- **The end frame is the conclusion.** Every clip freezes on a complete state, and the
  last group's rest frame shows everything the scene claims, readable, with the source.
- Text rests for at least 0.5s before the next change — with 1:1 groups the narration
  guarantees it; with sub-reveals check the spacing.

## 5. What reads as generated — and the rubric

`slide-reviewer` scores a rendered slide (the `--sheet` frames) additively out of 100,
points only with frame-file evidence. PASS at **score ≥ 95 and p0 = 0**.

**One rubric, three kinds and two diagram treatments.** The P0 list and the four axes below
apply to every authored screen — diagram, kinetic type, and character act alike
(scenes-schema §the authored-screen lane). §5.1 adds the editorial-frame test; §6 and §7 add
the P0s that only their kind can commit and say what the axes look at there. Nothing is
subtracted for a kind: a kinetic screen is still judged on palette restraint, and a character
screen still has to put its number on screen legibly.

**P0 — any one fails the review**

1. Text outside the zone or under the subtitle band; a hero number clipped by the frame edge
2. On-screen text that is not in scenes.js (`title` · `bullets` · `slide.labels`) — `check-slide.js` catches literals; the reviewer catches rendered text that slipped past (a helper that formats its own words, a unit not in labels)
3. A figure on screen that contradicts `labels` / `bullets` / `research.md` (27 in the slide, 30 in the research)
4. A gradient on text, or more than one accent hue on the slide
5. Tofu / fallback glyphs, a font that did not load (visible in the sheet as a different face from the rest)
6. Movement with no meaning in a group whose narration states a value — the value appears without a count/grow or a shape moving while something decorative moves instead
7. A photo-backed slide only pans or zooms the whole image, adds ambient drift, or animates
   overlays while the subject and evidence stay unchanged
8. The end frame is not the conclusion (the last group's rest frame is missing an element the scene claims)
9. An editorial screen uses a full-frame raster as its composition and only adds text, callouts,
   or a camera move. A raster may supply a document, face, or symbol, but it cannot supply the
   visual argument by itself.

**P0-F — a near-empty frame.** The renderer's `zone_fill_pct` reports the painted content
under 40% of the zone on either axis, on a slide with no full-bleed raster. The frame
reads as unfinished, whatever the craft of what little is there — the renderer summary is
the evidence, no eyeballing needed.

**Axes (additive)**

- **Design craft (30)** — hierarchy: the hero is the first thing read, and read order
  follows the narration 10 / composition: negative space is used, nothing touches the
  zone edge, hairlines not boxes, and the frame actually fills the zone — the renderer's
  `zone_fill_pct` under 55% on either axis costs points here 10 / palette restraint:
  ink · paper · one accent, muted and line derived from paper, `.hot` used at most once 10
- **Nothing reads as generated (25)** — score 25 and subtract 5 per marker found, floor 0:
  gradient or glow on text · rounded cards / bordered panels / a 3-column card grid ·
  stacked drop shadows or glassmorphism · emoji, icon rows, decorative particles or blobs ·
  every element bouncing or sliding in the same way · a second accent or a rainbow of bar
  colours · decorative numbering on non-sequential content · centred-everything with no
  read order
- **Motion carries meaning (25)** — each group moves one thing and that thing is what the
  segment says 10 / durations inside the tokens and the 2.6s entrance cap, ease-out, no
  bounce, and no long frozen tail — a renderer coverage warning (a group frozen past 40%
  of its segment with no `.sv` sustain) costs points here 10 /
  the state rule holds — clip k's first frame equals clip k-1's rest frame (compare
  `g<k-1>-end` with the renderer's `r<k>` first frame when in doubt) 5
- **Legibility (20)** — every text ≥ the role's floor size, digits tabular 10 / contrast:
  paper on ink, muted still readable on the sheet at 25% scale 5 / a source line is present
  when a number is on screen 5

Findings that are a matter of taste go to fix directives, not P0. A P0 is something a
viewer would notice as wrong, not something a designer would do differently.

### 5.1 Editorial treatment — HTML owns the frame

The lane is `kind:"diagram", treatment:"editorial"`. It is the full-frame authored cut used
for evidence, relationships, mechanisms, timelines, statistics, transitions, and verdicts. It may include
local archival photos or document scans, but they are ingredients inside the composition rather
than one full-bleed background waiting for a box to move over it.

- **Build a visual argument.** A source statement becoming a reversal, a signal travelling
  across a map, layers of a mechanism separating, dates locking onto a rail, or evidence
  converging on a verdict. Each group changes what the viewer understands, not merely what is
  highlighted.
- **Carry one motif across the episode.** The same signal line, evidence stamp, paper tear, or
  date rail appears in every editorial cut. The compositions still differ: document table,
  technical diagram, timeline, and kinetic verdict should not be the same card with new labels.
- **Use 2–4 atomic moves across the scene.** One primary read changes per group. All moves sit on
  the one seekable timeline and finish at a readable rest state.
- **Let the information type choose the movement.** A timeline puts dates in order on a rail; a
  statistic counts, grows, fills, or draws an axis to its measured value; a principle sits
  ink actors (`shape-enter` / `h.fig` · `h.chamber`) and draws hairline relations
  (`shape-draw` / `h.stem` · `h.bus` · `h.ring`) — a press or a side move is
  `shape-travel`. Named states still use `flow-trace` · `node-enter` · `state-transform`
  and may skip arts. A principle that only reveals words is the same defect as a kinetic
  fallback. `motionBeats` names that movement before HTML is authored, and the rendered
  `data-primitive` has to match it for the same group.
- **The still-frame test.** Hide the largest raster image. If the relationship, hierarchy, and
  conclusion disappear with it, the HTML is an annotation layer, not the frame.

**P0, added for `treatment:"editorial"`**

- **P0-E1 annotation masquerading as composition** — one full-frame photo or AI image stays
  unchanged while outlines, brackets, arrows, captions, glow, or a whole-image pan provide all
  visible motion
- **P0-E2 declared role is not performed** — an `evidence` frame shows no source, a
  `relationship` frame never puts both sides together, a `mechanism` never shows an actor
  and a relation (illustration plus hairline) and never draws a shape or changes state, a
  `timeline` has no ordered dates, a `statistic` has no measured value or source, a `transition`
  does not carry a device into the next cut, or a `verdict` adds no synthesis
- **P0-E3 broken visual system** — an editorial frame drops the declared `motif`, or uses a
  different palette/type grammar from the episode's other editorial frames without a story reason
- **P0-E4 raster-backed pseudo illustration** — a photo, scan, or generated image holds the whole
  frame while type is the only authored layer. Put at least two code-native actors, paper pieces,
  relation lines, rails, masks, or plates into the argument. When narration says two signals meet,
  show them arriving and combining; do not write that relationship beside an unchanged image.

On the axes, design craft includes evidence hierarchy and a composition distinct from the other
editorial frames; motion meaning asks whether each move changes the visual argument; legibility
includes source/date readability at phone scale.

## 6. Kinetic type — when the words are the picture

The lane is `kind: "kinetic"` (scenes-schema §kinetic type). Everything in §1–§4 holds; what
changes is that type carries the whole frame, so the type decisions become the composition
decisions.

- **One big phrase, and it is the only big thing.** `--fs-word` is the hero size and there is
  one hero per screen, exactly as there is one hero number on a diagram slide. Everything else
  is `--fs-word2` or smaller. A one-line verdict or hook that is the whole screen takes
  `cls:"max"` (170px portrait / 120px wide) — at the base size alone it floats in the zone
  and the renderer's fill warning fires.
- **Five words to a line, four lines to a screen.** Korean breaks by word
  (`word-break:keep-all`), so a phrase that needs a sixth word is a phrase to cut, not to shrink.
- **One effect kind per screen.** `drop` is the default — the phrase fades in while it
  settles from just above (−16px). `wipe` is a clip-path reveal on `--ease-mask`, left to
  right, which is the reading direction, and suits a longer phrase. Supporting lines use
  `fx-in` (the same mask, shorter). Two effects on one screen reads as a template being
  demonstrated. An art that travels while the word enters with `in` is one event.
- **The kinetic sustain is the settle, the kinetic focus shift is the dim.** `sv:"settle"`
  keeps the entered phrase landing for the length of its sentence (the slow scale that is
  this genre's idiom), and `dim: true` on earlier lines drops them to muted as the next
  phrase enters — a resting stack of equally bright lines is how a kinetic screen dies.
  Neither counts as a second effect kind.
- **The struck-out phrase is the one device with a second meaning.** `h.cross` reveals the
  phrase, then draws a rule through it — the thing that turned out to be wrong. Once per
  screen at most.
- **What is on screen is not the subtitle.** The subtitle band is already carrying the sentence.
  The screen carries what is left when the sentence is cut to its point.

**P0, added for this kind**

9. A screen phrase identical to its segment's `sub` — the same sentence twice, once burned in and once as the picture
10. More than one hero-sized phrase, or a line past five words
11. Two effect kinds on one screen, or a word that rotates, bounces, or arcs in. An art that travels and a word that enters with `in` on the same group is one event, not two. Mixing `drop` and `wipe` is still two.

**What the axes look at here** — design craft reads type hierarchy and line breaking instead of
diagram composition; motion-carries-meaning asks whether each phrase lands on the sentence that
says it; legibility is mostly line length and the gap between lines.

## 7. Character act — when someone is reacting

The lane is `kind: "character"` (scenes-schema §character act). The figure is a polished,
large-head editorial character in this same design language. It may be a small cast when the
sentence is an event: a masked figure gathers, officers arrive, then a restraint closes. The
rules keep the scene from becoming a mascot show or a row of labelled boxes.

- **The figure is drawn in the palette, not on top of it** — paper stroke on ink, no fill, no
  face, no colour of its own. The accent stays where it always is: on the words.
- **One action per group, from the closed vocabulary** (`enter` · `point` · `nod` · `shrug` ·
  `think` · `wave` · `cheer` · `conceal` · `signal` · `inspect` · `gather` · `surround` ·
  `bind` · `escort` · `release`), declared in `scenes.js` as `visual.slide.acts`. A cast event
  uses `{ action, actor, target? }`, so the screen has an accountable subject and object. The action set is closed on
  purpose — a movement authored for one slide renders differently on the next re-render, and a
  figure whose motion is hand-tuned is exactly the "generated look" this document is against.
- **Every action returns to rest** but `enter`. Poses don't accumulate across cuts, which is what
  makes the clips joinable at all. `enter` is a visible slide from the left (−72px) on
  `--ease` — opacity stays at 1 so the walk is on screen, not covered by a fade.
- **The words say it, the figure reacts.** A gesture is never the only thing conveying a value or
  a claim — the style gate and the reviewer read text, and a point that exists only as a raised
  arm is a point nothing has checked.
- **Use illustration assets when available.** A character or prop is a matched, transparent,
  text-free plate created by the available image tool; HTML stages its arrival and relationship.
  The code-native large-head tableau is only the no-image-tool fallback. When an image tool is
  available, a decorated rectangle with text is not an illustration and fails this lane.
- **It earns its place on human beats and concrete events** — being stuck, deciding, an arrest,
  a document being discovered, the moment it works. On a screen that exists only to show a number,
  the figure is in the way.

**P0, added for this kind**

12. A CSS keyframe, an action outside the closed vocabulary, or an event actor/target missing from `cast` — motion authored inside the slide instead of chosen
13. A pose that persists into the next clip (an action that does not return to rest), visible as the figure starting group k+1 mid-gesture
14. The scene's claim or value exists only as a gesture, with no text on screen carrying it
15. The figure overlapping the text block or crossing the zone edge in any sheet frame

**What the axes look at here** — nothing-reads-as-generated adds the mascot markers (a face, a
fill colour, a second figure, an idle bob); motion-carries-meaning asks whether the chosen action
is the one the sentence calls for, not merely that something moved.
