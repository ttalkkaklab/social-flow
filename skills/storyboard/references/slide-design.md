# Slide design — the look and the motion of an HTML slide

The source of truth for how a **motion slide** looks and moves. `motion-slide-template.html`
carries these rules as CSS tokens and helpers, `check-slide.js` machine-checks the
determinism half, and `slide-reviewer` scores a rendered slide against §5 — the rubric
lives here so the template, the author and the reviewer read one document. Every
`visual.slide` is a motion slide. There is no still-slide path.

Where the rules come from: three pieces of research. The 2026-08-29 motion-slide lane
(`docs/research/2026-08-29-motion-slide-lane/`) established that animation raises attention
and engagement and leaves comprehension unharmed **only when the movement carries meaning**.
The 2026-09-02 broadcast design pass (`docs/research/2026-09-02-broadcast-slide-design/`)
looked at why the finished slides still read as a text document instead of a broadcast
graphic, and found four structural causes: a flat single-colour ground, type set at UI
scale, hairlines a phone cannot resolve, and every element entering at the same instant
with the same curve. The 2026-09-04 object-slide pass
(`docs/research/2026-09-04-rendered-object-slide/`) asked what stands in the space once the
type and plates are right, compared a vector illustration, a generated image and a lit studio
plate, and settled on a studio ground with slab materials plus an object that is rendered, not
drawn (§1, §9). Every rule below serves one of those findings.

## Contents

- [1. Ground — a plate, not a colour](#1-ground-a-plate-not-a-colour)
- [2. Palette — ink, paper, one accent](#2-palette-ink-paper-one-accent)
- [3. Type — broadcast hierarchy](#3-type-broadcast-hierarchy)
- [4. Composition — one fact, then the evidence](#4-composition-one-fact-then-the-evidence)
- [5. Motion — every movement says something](#5-motion-every-movement-says-something)
- [6. What reads as generated — and the rubric](#6-what-reads-as-generated-and-the-rubric)
- [7. Kinetic type — when the words are the picture](#7-kinetic-type-when-the-words-are-the-picture)
- [8. Character act — when someone is reacting](#8-character-act-when-someone-is-reacting)
- [9. Rendered object — a thing that is a render](#9-rendered-object-a-thing-that-is-a-render)

## 1. Ground — a plate, not a colour

A broadcast graphic never sits on a flat fill. BBC News lays a gradient overlay under every
plate, Bloomberg treats light as part of the palette, and the standard finishing list for
motion graphics is gradient, vignette, texture. A flat ink field with small type on it is the
first reason the old slides read as a document.

The template ships the ground as three layers, none of them authored per slide:

| Layer | What | Where |
|---|---|---|
| ink | `THEME.ink`, the flat base | `body` |
| plate | a key light top-left (paper at 10%) and a bottom vignette (black to 42%), baked into one small alpha PNG and scaled to the frame | `body::before` — outside `#stage`, so the renderer's zone-fill measurement never counts it |
| grain | static luma noise, strength 6 of 255 (about 2.5%), fixed seed | added by `render-motion-slide.mjs` at the mp4 encode (`--grain`, default 6) |

Why the plate is a bitmap and the grain lives in the encoder: drawing them in CSS
(`radial-gradient` plus an SVG `feTurbulence` tile) dropped the capture rate from 21 to
3 fps under software rendering, and a noisy frame halves the PNG capture rate on its own.
The bitmap plate costs nothing measurable; grain at encode time costs only bitrate
(0.09 → 0.76 MB per second of clip at crf 14). The sheet frames the reviewer reads carry
the plate but not the grain.

**The studio ground — the default for an editorial diagram since 0.52.0.** The plate above is
a light on a wall. The studio is a room: a cyclorama cell whose wall and floor meet in a soft
seam *below the zone* (y 1560 portrait, y 929 wide — the subtitle band), a key light top-left,
the floor falling into darkness at the front, the light falling off at the sides. It is one
270×480 alpha PNG (480×270 wide) in the template head (`.studio-plate`,
`docs/research/2026-09-04-rendered-object-slide/bake-stage.py`), scaled to the frame, and the
template turns it on for every `treatment:"editorial"` diagram; `h.stage("flat")` keeps the
plate. The kinetic-type and character-act templates keep the plate above unchanged, so an
episode that mixes a kinetic screen with a studio diagram mixes two grounds — the author's
call, not the template's. Three things come with it and only with it:

| Layer | What | Where |
|---|---|---|
| slab material | every `.kicker`, `.band` and `.plate` gets a lit top-left edge, a hard offset for thickness, a short dark contact shadow and a wide faint spread — one `box-shadow` list on the template's part selectors, so `h.tag` · `h.band` · `h.plate` are unchanged | `html.studio …` rules in the head |
| lift | the stage type carries a cast shadow (no extrusion — extruded type is word art); small muted lines (`.foot`, `.hero-sub`, bar labels, captions) do not | same |
| drift | the plate alone is pushed by up to 1% per group (`.studio-cam`, one wrapper per group, `data-ground`); plates and type stay pinned in the zone | injected after `renderSlide()` |

A photo-backed slide (`treatment:"photo-action"`) replaces the plate with the photo and a
scrim (`h.photo` + `h.scrim`): ink rising from the bottom to 72% at a third of the height
and a lighter ink from the top, so the tag and title read on any photograph.

A footage slide (`treatment:"footage"`, §6.2) has neither plate nor scrim. The generated clip is
the ground with its own light, and the template drops the plate layer once `h.footage` is on the
page — a key light and a vignette over a photographed scene read as a filter, not as a graphic.

## 2. Palette — ink, paper, one accent

| Token | Value | Role |
|---|---|---|
| `--ink` | `THEME.ink` | the ground |
| `--paper` | `#ECEAE2` | all text. A slightly warm off-white on a cold ink — chosen, not `#fff` |
| `--accent` | `THEME.accent` | **one** emphasis colour, and it stays on the value chain: the tag plate, the unit and underline after a hero number, a bar fill, the spine, `**bold**`, a `==highlight==` plate. Never the source line, a sub or a caption — those are `--muted` and `--line` |
| `--panel` | ink 84% + paper | the face of a plate or band that must not shout — evidence cells, quotes |
| `--muted` | paper at 62% | labels, sources, secondary values |
| `--line` | paper at 30% | rules, bar tracks, brackets. 30 rather than 24 so a 3px rule still reads on a phone |

`THEME.accent2` is not used on slides. Two accents become a gradient, and a gradient on
text is the first thing a viewer reads as generated. Data series follow the same rule:
the value the sentence is about carries the accent (or paper, `.bar.hot`), the rest sit in
`--line` or `.dimmed`. A rainbow of bar colours is the tell of a chart library, not a
broadcast.

Plates come in three tones — `accent` (ink text on accent), `paper` (ink text on paper),
`panel` (paper text on panel) — and that is the whole colour system of a slide: SBS and
MBC news run their headline and name plates on exactly two such pairs.

A rendered object (§9) is the one thing on a slide with a colour of its own — fired clay,
bronze, stone — because that colour is the material of a thing, not a graphic choice; a blue
clay disc would be a lie. It stays outside the accent rule on one condition: its saturation
sits below the accent's, so the two never read as one hue (the fixture's clay measures
R/B 1.84 against the accent's 5.2).

## 3. Type — broadcast hierarchy

Local stack only: `"Pretendard Variable", "Pretendard", "Apple SD Gothic Neo", "Noto Sans
KR", sans-serif`. No web font URLs (the renderer waits for `document.fonts.ready`, which
does not cover a font the page never used, and a CDN font is a render timeout waiting to
happen). Weight does the hierarchy: 900 for the hero number, 800 for titles and words,
700 for labels and tags, 400 for the rest. Nothing lighter than 400 goes on screen.

| Role | Portrait 1080×1920 | Wide 1920×1080 | Weight · tracking |
|---|---|---|---|
| kicker / tag | 34px | 26px | 700, `.03em`, ink on an accent plate |
| title | 76px | 56px | 800, `-.03em`, line-height 1.18 |
| hero number | 260px | 180px | 900, `-.03em`, `tabular-nums` |
| hero number, stat poster (`.hero.max`) | 340px | 230px | same — up to 3 digits; more digits go back to the base size |
| second value (`.hero.mid`) | 122px | 90px | same |
| unit | 30% of hero, never below `--fs-desc` (44) | 30% of hero, never below `--fs-desc` (32) | 700, accent |
| label / band | 54px | 40px | 700 (band 800) |
| description / bar label / value | 44px | 32px | 400 (bar value 800) |
| foot (source) | 28px | 24px | 400, muted |

Floor: nothing below `desc` size goes on screen. 44px is the mobile caption minimum the
research converged on, and 16 Korean characters at 44px fill the 728px zone width, which
is the Netflix Korean line length. Titles run 2 lines at most; a whole slide holds at most
4 text lines besides the hero and the source. Korean tracking never goes past `-.03em`
(Pretendard already carries Inter-style spacing) and never positive on running text; the
tag's `.03em` is the one exception, because it sits on a plate.

Digits everywhere are `tabular-nums`, and the hero count-up additionally draws each digit
in a fixed-width cell (`.hero .num i`) padded to the final digit count — the machine that
renders may not have Pretendard, and Apple SD Gothic Neo has no `tnum`, so without the
cells the unit after a counting number walks 40px left and right (measured on the first
fixture). Install Pretendard on the render machine anyway; the cells make the layout right
either way.

**Strokes.** A 1.5px hairline at 1080 wide is 0.09mm on a phone — under the eye's
resolving limit at arm's length, and the codec smears it further. Every line on a slide
is one of three weights: `--hair` 3px for dividers, tracks and brackets; `--rule` 6px for
axes, connectors, the timeline rail dot ring and the spine; `--band` 10px for an underline
or the strike-through. Bar tracks are `--bar-h` 44px tall.

## 4. Composition — one fact, then the evidence

- **One hero per slide.** One big number, or one comparison, or one flow. A second hero
  is a second slide.
- **Pick an archetype before laying out freeform.** Five compositions ship in the template
  and fill the zone by construction: the **stat poster** (`h.stage("spread")` + `h.stat`
  with `cls:"max"` — one oversized number with its underline, title above, source anchored
  below), the **split compare** (`.split` — two cells with `h.vdiv` between them), the
  **timeline rail** (`.timeline` + `h.date`), the **plate grid** (`.plate` cells for
  reasons, documents, evidence — ep11 s6 shape), and the **band verdict** (`h.band`).
  Freeform is allowed, but the renderer measures how much of the zone the painted content
  covers (`zone_fill_pct` in the summary) and warns under 55% — the top-clustered,
  half-empty frame is the defect this measurement exists to catch.
- **Structure is plates and rules, not cards.** A plate is a square, single-colour band
  or panel that sits flush on the grid: the tag behind the kicker, the accent band under a
  verdict, the panel cells of an evidence grid. What it never has is a rounded corner, a
  border, a translucent glass fill or a **floating** shadow — a wide soft shadow with no
  contact shadow under it, the card hovering over the page. Those are what a slide deck and
  an AI front end look like. The studio slab (§1) is the opposite thing: a lit edge, a hard
  thickness, a short dark shadow where it touches the wall, and only then a spread — a thing
  standing on a set, not a card floating over one. That material lives in the template head
  and nowhere else; `check-slide.js` blocks a shadow, a glass fill and a radius past 8px in
  the authored region and in any head rule outside the template's `html.studio` set.
- **A source line may take the corner.** When the vertical budget is spent — an object slot
  and a hero on one slide — `h.foot(0, …, { corner: true })` sits the source at the zone's
  top-right instead of the bottom of the flow. Still group 0, still small and muted; in the
  flow it overflowed the zone by 58 px on the object fixture.
- **The spine.** `h.stage("spine")` stands a 6px accent bar at the left of the zone for
  the height of the content — the edge bar every news graphic carries. Use it on diagram
  and evidence slides; a stat poster and a kinetic screen do without.
- Content sits in the zone (`formats.js zone` — portrait x 176 · top 190 · bottom 570;
  wide x 96 · top 96 · bottom 285), vertically centred with a 4% optical lift. The bottom
  band belongs to the subtitles; only the ground reaches it.
- Read order is top → bottom, left → right; the hero comes first in that order. Left
  alignment is the default (the headline plate on every Korean news set sits top-left);
  centre only a hero number that is the whole screen.
- At most **4 reveal groups** per slide. Past that the slide is two slides.
- Numbering (① ② ③) only when the content is a sequence the viewer must follow in order.
- A source line (`h.foot`) whenever a number is on screen — the study, the report, the
  year. It reads small and muted behind a short accent rule, and it is the difference
  between a claim and evidence. **It belongs to group 0** — every clip that shows a figure
  shows its source, and a source entering late is a second movement in a group that
  already has one.
- Bars and their labels enter as one element (the `bar()` helper wraps label, value and
  track in the group); a track that sits outside the group is an empty rail on screen
  before its sentence. The same goes for the split divider: `h.vdiv(rg)` enters with the
  second cell, never as a static line.

## 5. Motion — every movement says something

**The state rule** (template head · renderer · reviewer all cite this line): clip k opens
on groups 0..k-1 at rest, group k animates from t=0, and the last frame is group k at
rest. Group 0 is the base (source, scrim, axes) and never animates on its own — it is
clip 1's first frame. Groups are 1:1 with narration segments by default (segment 1 →
group 1), so each element enters the moment the sentence about it starts.

**The opening chain.** The tag, the title and the first value all belong to group 1, each
starting `--lead` after the one before (`lead:1`, `lead:2` on the helpers). That is the
broadcast lower-third order — plate first, name a few frames later, description after
that — and the reviewer reads the chain as one event. Before this rule the title sat in
group 0 and never moved, and the first clip opened on a finished frame.

Tokens (CSS variables in the template):

| Token | Portrait | Wide | Used for |
|---|---|---|---|
| `--ease` | `cubic-bezier(.05,.7,.1,1)` | same | the one entrance curve — Material's emphasized decelerate: a fast start and a long visible settle. JS `EASES.out` samples the same curve. Mask rise, pop, lift, character enter |
| `--ease-mask` | `cubic-bezier(.4,0,.2,1)` | same | clip-path travel — a wipe, a plate opening, a drawn line you can actually watch. `--ease` finishes in the first third, so a mask on that curve pops on instead of travelling |
| `--fade` | 200ms | same | opacity only — fade is never eased, and never stacked on a mask |
| `--rise` | 560ms (17f) | 600ms | a mask rise or a lift settling — inside the 0.3–0.8s the practice puts on text |
| `--plate` | 400ms (12f) | same | a plate or band opening left to right |
| `--lead` | 170ms (5f) | same | plate → text, and each link of the opening chain |
| `--pop` | 360ms | same | a tag popping on with a 3% overshoot — the one overshoot on a slide, never on a value |
| `--travel` | 48px | 36px | how far a lift travels. 28px was UI scale on a 1920px frame |
| `--travel-x` | 96px | 72px | how far a side move (`fx-travel` · `h.shift`) travels |
| `--press` | 72px | 56px | how far a press (`fx-press` · `h.press`) drops onto its bed |
| `--grow` | 1000ms | same | a bar filling on `--ease-mask` — Chart.js 1000 / Heer ~1s |
| `--draw` | 560ms | same | a rule drawing in by clip-path on `--ease-mask`, so stroke width stays constant |
| `--count` | 1800ms | 2000ms | a hero count-up when no segment length is passed; with `--segs` a `.sv` count runs the sentence. Counters decelerate on their own quadratic curve so the last digit lands near the end, not at 40% |
| `--stagger` | 100ms (3f) | same | delay per item when several things enter in one group |
| `--wstagger` | 80ms (2.4f) | same | delay per word in `h.words` / `words:true` |
| `--hold` | 360ms | 420ms | rest frames appended to every clip so the freeze frame is a settled frame |

Rules:

- **One kind of movement per group.** A bar grows while its label fades — that is one
  event (labels fade for `--fade`, then the fill grows, still one event). A plate opens and
  its text rises `--lead` later — one event. The opening chain — one event. A count-up and
  a bar growing in the same group are two, and the eye picks neither. Split the group or
  drop one. A flow is the same shape: both nodes enter, then the connecting line draws.
  An art that travels while its caption enters is one event — the picture arrives, then
  the word names it. Mixing `drop` and `wipe` on type is still two.
- **Type enters as a mask rise** (`fx-mask`, the helpers' default for titles, dates, words,
  lines): the text climbs out of its own line box on `--ease` — the way a news headline
  enters since JTBC moved theirs from left-to-right to bottom-to-top. The mask itself is the
  visibility; no fade is stacked on it. `fx-in` (a left-to-right clip reveal on
  `--ease-mask`) stays for steps, nodes and callouts. A bar fill still grows with `scaleX`
  on `--ease-mask`; a rule draws with clip-path on the same curve. A tag pops (`fx-pop`).
  A plate or band opens (`fx-plate`) and its text follows.
- **Entrance motion ends inside 2.6s**; the sustain layer then carries the group to its
  segment boundary. Without `--segs` a clip is entrance + hold as before, and a narration
  segment shorter than the clip cuts to the next clip's rest frame mid-motion — the
  renderer warns past the cap either way.
- **The sustain layer — the clip fills the sentence.** produce hands the renderer each
  segment's measured length (`--segs k:ms,…`; the storyboard gate estimates with
  `--segs auto` at the schema's 4.5 chars/s), and elements marked `sv` stretch their one
  meaning-bearing movement to it: a count-up counts while the sentence says the number, a
  bar keeps filling, a rule keeps drawing, a dot grid keeps filling (`sv: true` on
  `h.count` · `h.stat` · `h.bar` · `h.dots` · `h.range` · `h.link` · `h.axis` · `h.stem` · `h.bus`),
  and an entered element can settle for the length of its sentence (`sv: "settle"` — a
  4.5% scale landing in a nested wrapper). The settle is proportional, so it only reads on a
  text block or a large actor: on an 88px shape 4.5% is under a pixel after 700ms and the
  sentence sits frozen with the coverage check none the wiser (measured on a press disc, the
  renderer's warning stayed quiet because the group declared a sustain). Sustain a small group
  by putting `sv: true` on the element that actually travels, not `settle` on the one that arrived. Before this layer, a 1.3s entrance under a 5s
  sentence froze the frame for 3.7s — measured on ep08 s4, and the single biggest reason
  finished videos read as a slideshow. The renderer warns when a group's frozen tail
  passes 40% of its segment. Type reveals and fades never stretch — a 4-second wipe over
  a word is a crawl, not an entrance.
- **Focus shift.** A group marked `dim: true` drops to 55% while the next group
  enters, so the eye follows the narration and the end frame keeps its hierarchy — the
  runtime computes it from (g, t), no animation to own, no seam to break. Use it on
  evidence rows the narration has moved past; keep the base (group 0) and the conclusion
  bright. A no-parameter browser preview shows even the last group dimmed — a state the
  finished video never shows.
- **A rendered object is a sustain element** (§9). Its frames for a group spread over the
  whole segment — a disc turns to face the camera while the sentence runs, stamps press in
  while the number counts — and the frame at any (g, t) is one index. The step rate follows
  from the frame count: 27 frames under a 5 s sentence is 5.4 steps a second at 0.3° a step.
- **The stage may drift; nothing else may.** The studio's cyclorama is pushed by at most 1%
  per group — for the length of that group's clip, so no movement crosses a cut — behind
  pinned plates and type — the parallax that separates a set from a wall.
  That is the one ambient movement on a slide, it is the ground's, and it never counts as a
  group's motion (`data-ground`): a group where only the stage moves is still an empty group
  to the renderer.
- **Movement encodes the value.** A count-up says "this many"; a bar growing to 81% says
  "this much of that"; an actor sitting, a stem drawing, or a press landing says how
  the mechanism works.
  An element that merely slides in to look alive is decoration —
  use `rise` for it, at the `--rise` token, and nothing more. No loops, no idle motion, no
  ambient drift — the sustain layer is the one sanctioned continuous movement, and it is
  monotonic and value-bearing. Cyclic motion (gears turning) is still **outside this lane** — it
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
- **No overshoot on a value.** A bar, a count, a rule, a date land on the decelerate curve
  and stop. The 3% overshoot lives in the tag pop alone; bounce, elastic, spin and
  typewriter entrances are not in the vocabulary.
- **The end frame is the conclusion.** Every clip freezes on a complete state, and the
  last group's rest frame shows everything the scene claims, readable, with the source.
- Text rests for at least 0.5s before the next change — with 1:1 groups the narration
  guarantees it; with sub-reveals check the spacing.

## 6. What reads as generated — and the rubric

`slide-reviewer` scores a rendered slide (the `--sheet` frames) additively out of 100,
points only with frame-file evidence. PASS at **score ≥ 95 and p0 = 0**.

**One rubric, three kinds and three diagram treatments.** The P0 list and the four axes below
apply to every authored screen — diagram, kinetic type, and character act alike
(scenes-schema §the authored-screen lane). §6.1 adds the editorial-frame test, §6.2 the footage
marks; §7 and §8 add
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
7. A photo-backed slide (`photo-action`) only pans or zooms the whole image, adds ambient drift,
   or animates overlays while the subject and evidence stay unchanged
8. The end frame is not the conclusion (the last group's rest frame is missing an element the scene claims)
9. An editorial screen (`editorial`) uses a full-frame raster as its composition and only adds
   text, callouts, or a camera move. A raster may supply a document, face, or symbol, but it
   cannot supply the visual argument by itself. A footage slide is judged by §6.2 instead — there
   the clip is the ground on purpose.
10. Any text set below its role's size in the §3 table for the slide's format, or a
    structural line thinner than that format's `--hair` (dividers) or `--rule` (axes,
    connectors, rails) — the slide is unreadable on the phone it is made for
11. **One picture under the narration** — the slide's picture does not change for longer than
    the channel's static-ground limit (`window.MOTION_POLICY.maxStaticGroundSeconds`, default
    4 s). A plate, a kinetic screen or a photo that runs the whole scene while only the type,
    a number, a callout or a camera move changes is a slideshow, not a video (owner directive
    2026-09-03 — "the viewer has to feel a video: image changes, animation, camera moves").
    The clock resets only when the picture itself changes: the next footage clip, a new
    photograph under the next sentence, a recording. So an authored plate is a one-sentence
    card (a verdict, a single number) and everything longer is a footage slide with `labels`;
    `check-scenes.js` blocks the estimate before the slide is authored and this review reads
    the sheet: `g<k>-mid` and `g<k>-end` showing the same picture across two or more groups is
    this P0

12. **A rendered object that does not do what the sentence says** — the object turns or
    recedes while the narration states a count, the stamp count on the frame disagrees with
    `labels` (the bake is the copy), the object holds one frame across two groups' `g<k>-mid`
    frames, or its ink (the sidecar's `ink` box — disc plus shadow penumbra) crosses the zone

**P0-F — a near-empty frame.** The renderer's `zone_fill_pct` reports the painted content
under 40% of the zone on either axis, on a slide with no full-bleed raster. The frame
reads as unfinished, whatever the craft of what little is there — the renderer summary is
the evidence, no eyeballing needed. Read the number knowing what it measures: the bounding
box of everything painted inside `#stage` (the plate ground is outside it and never
counts), so one full-width element — a bar track, a band, a bus line — sets `w_pct` to
100 by construction. On the diagram archetypes `h_pct` is the axis that carries the
verdict, and horizontal spread stays a judgement made by eye.

**Material-texture exception (Jin directive, 2026-09-05).** Reference-quality material
expression is allowed on every HTML screen. CSS gradients, baked texture, or both may imitate
clay, stone, paper, metal, or another physical surface when the result gives the object visible
grain, thickness, and a shadow that answers the studio light. This is quality work, not a
generated-look marker. The exception does not permit gradients or glow on text, decorative
colour washes, glass cards, or floating shadows.

**Axes (additive)**

- **Design craft (30)** — hierarchy: the hero is the first thing read, and read order
  follows the narration 10 / composition: negative space is used, nothing touches the
  zone edge, plates and rules not cards, the frame fills the zone and reads as one
  system with the episode's other slides — the renderer's `zone_fill_pct` under 55% on
  either axis costs points here (on a diagram slide only `h_pct` moves — P0-F says why)
  10 / palette restraint: ink · paper · one accent at one point, panel and muted derived
  from them, `.hot` used at most once 10
- **Nothing reads as generated (25)** — score 25 and subtract 5 per marker found, floor 0:
  gradient or glow on text · rounded cards, bordered or translucent panels, a 3-column
  card grid · a floating shadow (a spread with no contact shadow — the studio slab's lit
  edge, thickness and contact shadow are the broadcast material, not this marker) or
  glassmorphism · emoji, icon rows, decorative particles or
  blobs · every element entering at the same instant or with the same effect · a second
  accent or a rainbow of bar colours · decorative numbering on non-sequential content ·
  centred-everything with no read order · a flat ground with type floating in it (the
  plate missing — a slide not built from the template) · a rendered object that is a
  vector illustration — flat fills with an outline, no material, no shadow on the wall
- **Motion carries meaning (25)** — each group moves one thing and that thing is what the
  segment says; a plate-then-text or the opening chain counts as one 10 / durations
  inside the tokens and the 2.6s entrance cap, the decelerate curve, no overshoot on a
  value, and no long frozen tail — a renderer coverage warning (a group frozen past 40%
  of its segment with no `.sv` sustain) costs points here 10 /
  the state rule holds — clip k's first frame equals clip k-1's rest frame (compare
  `g<k-1>-end` with the renderer's `r<k>` first frame when in doubt) 5
- **Legibility (20)** — every text ≥ the role's size in §3, digits tabular, lines ≤ 16
  Korean characters, titles ≤ 2 lines 10 / contrast: paper on ink, muted still readable on
  the sheet at 25% scale, ink on an accent plate 5 / a source line is present when a
  number is on screen 5

Findings that are a matter of taste go to fix directives, not P0. A P0 is something a
viewer would notice as wrong, not something a designer would do differently.

### 6.1 Editorial treatment — HTML owns the frame

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
  ink actors (`shape-enter` / `h.fig` · `h.chamber`) and draws relations
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
  and a relation (illustration plus rule) and never draws a shape or changes state, a
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

### 6.2 Footage treatment — marks over generated footage

> ⛔ **Marks retired (2026-09-05, Jin).** `treatment:"footage"` is allowed only with no
> arrows, circles, brackets, hatching, numbers or explanatory marks over the video. The current
> rule is in `skills/storyboard/SKILL.md` under “Pick the screen body by the information job.”

The lane is `kind:"diagram", treatment:"footage"` (scenes-schema §footage treatment). The ground
is one generated clip per reveal group; HTML draws wordless marks over it. The look was measured
on a reference history short on 2026-09-02 (the numbers are in the storyboard skill's
`footage-lane.md`): a muted photoreal clip every 1.8 seconds, coral strokes about 14px wide drawn
on in under a second, a ground mark behind the figures, a direction arrow over them, no label
anywhere, one subtitle line.

**The grammar — six marks, one meaning each**

| Mark | Helper | Says | Draws as |
|---|---|---|---|
| route | `h.mark.route(rg, pts, {dash, arrow})` | movement — a march, a sea lane, a retreat | a smoothed line through the points, drawn from the start; a dashed route is revealed through a mask; the arrowhead is the next stroke |
| X | `h.mark.x(rg, x, y)` | defeat, a stop, a block | two strokes, the second `--mark-lead` after the first |
| ring | `h.mark.ring(rg, x, y, r)` | the target — the one thing to look at | one circle drawn from the top |
| hatch | `h.mark.hatch(rg, poly, {gap, angle, wave})` | spread — an army across a plain, an area, a flood | parallel lines clipped to a polygon, one after another at `--mark-stagger` |
| box | `h.mark.box(rg, x, y, w, h)` | a place — a settlement, a building, a thing | four corner brackets |
| dot | `h.mark.dot(rg, x, y)` | a position | a pop — the one overshoot on this slide |

`h.mark.path(rg, d)` draws any SVG path the same way (a shield, a flag) and `h.mark.label`
sets a short label from `labels` when the sentence carries a number or a name the picture
cannot show. `h.matte(rg, webm)` lays the subject back over the marks so a ground mark passes
behind the people (`make-matte.py`); a direction arrow stays on top and needs none.

Rules:

- **One or two marks per shot, and each is the sentence.** The route is drawn while the
  sentence says they moved; the X lands when it says they lost. A mark that decorates —
  brackets around nothing, a ring on the prettiest part of the frame — is P0-G2.
- **Marks are placed against the clip, not the still.** Read the coordinates off the mid frame
  (`footage-frames.sh`), keep the mark on its subject through the whole cut, and keep the camera
  `very slow` or `static` on a marked shot. A mark that slides off its subject is P0-G3.
- **Wordless by default.** The frame carries the subtitle and nothing else. A label is an
  exception with a reason, sits inside the zone, and is in `labels`.
- **One colour, one stroke.** `THEME.accent`, `--mark-w`, round caps and joins, `.94` opacity.
  No second colour, no fill but the dot, no glow, no shadow, no gradient — the generated-look
  markers of every slide apply here too. The material is per treatment: on footage the stroke
  is flat, because a shadow on a photographed ground reads as a sticker; on a studio slide
  (§1) the same helpers draw a tapering pen stroke (`pen:true`) with a cast shadow from the
  head CSS, because there the ground is a set and a flat stroke reads as a marker on glass.
- **Write-on, not fade.** Every mark is drawn (`stroke-dashoffset`) or pops; nothing fades in.
  A stroke takes `--mark-draw` (700ms); the arrowhead and the second stroke of an X follow at
  `--mark-lead`; hatching staggers at `--mark-stagger`. The whole mark is complete inside 1.5s so
  it reads before the cut.
- **The clip fills the segment.** The renderer stretches each clip to its segment length and
  warns when the file is shorter — a frozen last frame is the slideshow this lane exists to
  remove. Generate `duration` at the segment estimate plus one second.
- **No face under a mark.** A ring around a head or an X across a face is P0-G4 — the mark
  sits on the ground, the road, the ridge, the formation, beside the person.
- **The plate is off and the ground is the clip.** No key light, no vignette, no scrim, no
  title chain. The subtitle is the only type; the episode's subtitle mode is `phrase`.

**P0, added for `treatment:"footage"`**

- **P0-G1 still ground** — a clip that does not move (a Ken Burns over a still, a frame frozen
  for most of the segment), or a group whose "clip" is the previous group's last frame
- **P0-G2 decorative mark** — a mark whose meaning is not in the segment's sentence, more than
  two marks on one shot, or a shot whose declared `mark` is missing from the frame
- **P0-G3 mark off its subject** — the mark sits on empty ground while the thing it names is
  elsewhere in the frame, or slides off the subject during the cut (compare `g<k>-mid` with
  `g<k>-end`)
- **P0-G4 mark over a face**, or a label outside the zone
- **P0-G5 a second colour or a fade** — a mark in another hue, a gradient or glow on a stroke, a
  mark that fades in instead of drawing
- **P0-G6 the wrong layer** — a ground mark drawn over the figures when a matte is declared, or a
  matte that cuts the subject (a missing limb, a hole in a body)

**What the axes look at here** — design craft is stroke discipline and how the mark sits in the
frame's composition (does it lead the eye to the subject, does it follow the road and the
horizon), not zone fill (the renderer reports `null`); nothing-reads-as-generated adds the
photoreal tells of the clip itself — a duplicated face, melting hands, text-like scribbles on
banners — because the clip is now part of what was authored; motion meaning asks whether each
mark is the sentence and whether the cut lands on the sentence start; legibility is the mark's
stroke at 25% scale and the subtitle staying readable over a bright clip.

## 7. Kinetic type — when the words are the picture

The lane is `kind: "kinetic"` (scenes-schema §kinetic type). Everything in §1–§5 holds; what
changes is that type carries the whole frame, so the type decisions become the composition
decisions.

- **One big phrase, and it is the only big thing.** `--fs-word` (124px) is the hero size and
  there is one hero per screen, exactly as there is one hero number on a diagram slide.
  Everything else is `--fs-word2` (68px) or smaller. A one-line verdict or hook that is the
  whole screen takes `cls:"max"` (176px portrait / 128px wide) — at the base size alone it
  floats in the zone and the renderer's fill warning fires.
- **Five words to a line, four lines to a screen.** Korean breaks by word
  (`word-break:keep-all`), so a phrase that needs a sixth word is a phrase to cut, not to shrink.
- **One effect kind per screen.** `mask` is the default — the phrase climbs out of its line
  box; `words:true` staggers the same rise word by word at `--wstagger` and still counts as
  the same kind. `drop` (a settle from 24px above) and `wipe` (a clip-path reveal on
  `--ease-mask`, left to right, for a longer phrase) are the alternatives. Supporting lines
  use the same kind as the hero phrase. Two kinds on one screen reads as a template being
  demonstrated. An art that travels while the word enters is one event.
- **The band is the verdict.** `h.band` opens an accent (or paper, or panel) plate across
  the zone and lifts the phrase into it `--lead` later — the name plate and the verdict of
  every news set. One band per screen, and it is the last thing to enter.
- **The kinetic sustain is the settle, the kinetic focus shift is the dim.** `sv:"settle"`
  keeps the entered phrase landing for the length of its sentence (the slow scale that is
  this genre's idiom), and `dim: true` on earlier lines drops them to 55% as the next
  phrase enters — a resting stack of equally bright lines is how a kinetic screen dies.
  Neither counts as a second effect kind.
- **The struck-out phrase is the one device with a second meaning.** `h.cross` reveals the
  phrase, then draws a 10px rule through it — the thing that turned out to be wrong. Once
  per screen at most.
- **What is on screen is not the subtitle.** The subtitle band is already carrying the sentence.
  The screen carries what is left when the sentence is cut to its point.

**P0, added for this kind**

11. A screen phrase identical to its segment's `sub` — the same sentence twice, once burned in and once as the picture
12. More than one hero-sized phrase, or a line past five words
13. Two effect kinds on one screen, or a word that rotates, bounces, or arcs in. An art that travels and a word that enters on the same group is one event, not two. Mixing `drop` and `wipe` is still two; `mask` and `words:true` are one.

**What the axes look at here** — design craft reads type hierarchy and line breaking instead of
diagram composition; motion-carries-meaning asks whether each phrase lands on the sentence that
says it; legibility is mostly line length and the gap between lines.

## 8. Character act — when someone is reacting

The lane is `kind: "character"` (scenes-schema §character act). The figure is a polished,
large-head editorial character in this same design language. It may be a small cast when the
sentence is an event: a masked figure gathers, officers arrive, then a restraint closes. The
rules keep the scene from becoming a mascot show or a row of labelled boxes.

- **The figure is drawn in the palette, not on top of it** — paper stroke on ink, no fill, no
  face, no colour of its own. The accent stays where it always is: on the words and the tag.
- **One action per group, from the closed vocabulary** (`enter` · `point` · `nod` · `shrug` ·
  `think` · `wave` · `cheer` · `conceal` · `signal` · `inspect` · `gather` · `surround` ·
  `bind` · `escort` · `release`), declared in `scenes.js` as `visual.slide.acts`. A cast event
  uses `{ action, actor, target? }`, so the screen has an accountable subject and object. The action set is closed on
  purpose — a movement authored for one slide renders differently on the next re-render, and a
  figure whose motion is hand-tuned is exactly the "generated look" this document is against.
- **Every action returns to rest** but `enter`. Poses don't accumulate across cuts, which is what
  makes the clips joinable at all. `enter` is a visible slide from the left (−72px) on
  `--ease` — opacity stays at 1 so the walk is on screen, not covered by a fade.
- **The words say it, the figure reacts.** The sentence rises as a mask rise (`h.said`), the
  earlier lines dim, the last one settles. A gesture is never the only thing conveying a value or
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

14. A CSS keyframe, an action outside the closed vocabulary, or an event actor/target missing from `cast` — motion authored inside the slide instead of chosen
15. A pose that persists into the next clip (an action that does not return to rest), visible as the figure starting group k+1 mid-gesture
16. The scene's claim or value exists only as a gesture, with no text on screen carrying it
17. The figure overlapping the text block or crossing the zone edge in any sheet frame

**What the axes look at here** — nothing-reads-as-generated adds the mascot markers (a face, a
fill colour, a second figure, an idle bob); motion-carries-meaning asks whether the chosen action
is the one the sentence calls for, not merely that something moved.

## 9. Rendered object — a thing that is a render

The lane is `kind:"diagram", treatment:"editorial"` with `slide.object`
(scenes-schema §slide scenes, procedure in `rendered-object.md`). Everything in §1–§6 holds;
what changes is that one element on the slide is a raster that was **rendered, not drawn**:
`bake-object.py` shoots rays at a signed-distance shape under one point light — soft shadows,
self-shadowed surface detail, a fired-clay grain, a hand-made rim — and writes every frame of
the object's movement into one PNG sheet. The slide plays it back by moving
`background-position`, and the frame at any (group, time) is one number.

- **The object is the sentence's value.** Its keys change state where the narration does — a
  disc lying back rises to face the camera; 45 stamps press in from the rim while 45 counts;
  the spiral fills to 241 while 241 counts; the disc recedes under the question. The count in
  the bake is the count in `labels`. A turn that only shows the object off is the decoration
  §5 forbids.
- **One material, one light.** The object's colour is the material's (§2) and its light is
  the studio's key light, top-left, the same one the slabs' edges and shadows answer to. That
  shared direction is what makes a CSS plate and a rendered object read as one scene; the
  wall shadow is baked as alpha only so it lies on the cyclorama without any floor perspective
  to match.
- **Two layers, split on purpose.** Type and plates stay CSS — crisp, re-authored per episode
  for free. Only the object is a render. A broadcast set builds its 3D element and its name
  plate separately for the same reason.
- **Generic shapes only.** A disc, a tablet, a coin, a block. A specific artefact or a person
  is the footage lane (§6.2). One shape ships (`disc`); a second is one SDF function.
- **Placement is measured, not eyeballed.** The sidecar's `ink` box includes the shadow's
  wall shadow, which reaches 226 px past the rim while the disc is reclined; `check-slide.js`
  holds it inside the zone.

**P0, added for this lane** — P0-12 above: the object moving against the sentence, a frame
count that contradicts `labels`, a frozen object across groups, or ink across the zone.

**What the axes look at here** — design craft reads whether the object sits in the composition
(the value card in front of its rim, the hero below it, the read order still top-left first)
and whether the studio ground's horizon stays below the zone; nothing-reads-as-generated adds
the vector-illustration tell (flat fills, an outline, no wall shadow) and the plastic tell (a
surface with no grain); motion-carries-meaning compares `g<k>-mid` with `g<k>-end` on the
object itself — stamps landed, angle changed — against the sentence; legibility is unchanged,
with the object's shadow never under text.
