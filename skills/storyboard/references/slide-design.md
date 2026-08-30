# Slide design — the look and the motion of an HTML slide

The source of truth for how a **motion slide** looks and moves. `motion-slide-template.html`
carries these rules as CSS tokens and helpers, `check-slide.js` machine-checks the
determinism half, and `slide-reviewer` scores a rendered slide against §5 — the rubric
lives here so the template, the author and the reviewer read one document. The static
long-form template (`slide-template.html`, with its gradient `.em` chip and `.box` cards)
predates this document and is not scored by the reviewer; when a static slide gets
reworked, this is the look to bring it to.

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

| Token | Value | Used for |
|---|---|---|
| `--ease` | `cubic-bezier(.16,1,.3,1)` | everything — a fast start that settles, no overshoot, no bounce |
| `--rise` | 360ms | text entering: opacity + 14px rise |
| `--grow` | 800ms | a bar filling — Highcharts 500 / Chart.js 1000 / Heer & Robertson 1250 all sit here |
| `--draw` | 500ms | a hairline or callout lead drawing in |
| `--count` | 2400ms | a hero count-up, ease-out — lands before the sentence ends |
| `--stagger` | 90ms | delay per item when several things enter in one group |
| `--hold` | 240ms | rest frames appended to every clip so the freeze frame is a settled frame |

Rules:

- **One kind of movement per group.** A bar grows while its label rises — that is one
  event. A count-up and a bar growing in the same group are two, and the eye picks
  neither. Split the group or drop one.
- **A group's motion ends inside 2.6s** (clip ≤ 2.9s with the hold). A narration segment
  shorter than the clip cuts to the next clip's rest frame mid-motion, and that jump is
  visible; the renderer warns past the cap.
- **Movement encodes the value.** A count-up says "this many"; a bar growing to 81% says
  "this much of that". An element that merely slides in to look alive is decoration —
  use `rise` for it, at 360ms, and nothing more. No loops, no idle motion, no ambient
  drift. Continuous motion (gears turning, a line tracing for the whole scene) is
  **outside this lane** — it would freeze on every hold. Render it as footage and place
  it with `visual.video.clip` instead.
- **The end frame is the conclusion.** Every clip freezes on a complete state, and the
  last group's rest frame shows everything the scene claims, readable, with the source.
- Text rests for at least 0.5s before the next change — with 1:1 groups the narration
  guarantees it; with sub-reveals check the spacing.

## 5. What reads as generated — and the rubric

`slide-reviewer` scores a rendered slide (the `--sheet` frames) additively out of 100,
points only with frame-file evidence. PASS at **score ≥ 95 and p0 = 0**.

**One rubric, three kinds.** The P0 list and the four axes below apply to every authored
screen — diagram, kinetic type, and character act alike (scenes-schema §the authored-screen
lane). §6 and §7 add the P0s that only their kind can commit and say what the axes look at
there. Nothing is subtracted for a kind: a kinetic screen is still judged on palette
restraint, and a character screen still has to put its number on screen legibly.

**P0 — any one fails the review**

1. Text outside the zone or under the subtitle band; a hero number clipped by the frame edge
2. On-screen text that is not in scenes.js (`title` · `bullets` · `slide.labels`) — `check-slide.js` catches literals; the reviewer catches rendered text that slipped past (a helper that formats its own words, a unit not in labels)
3. A figure on screen that contradicts `labels` / `bullets` / `research.md` (27 in the slide, 30 in the research)
4. A gradient on text, or more than one accent hue on the slide
5. Tofu / fallback glyphs, a font that did not load (visible in the sheet as a different face from the rest)
6. Movement with no meaning in a group whose narration states a value — the value appears without a count/grow while something decorative moves instead
7. The end frame is not the conclusion (the last group's rest frame is missing an element the scene claims)

**Axes (additive)**

- **Design craft (30)** — hierarchy: the hero is the first thing read, and read order
  follows the narration 10 / composition: negative space is used, nothing touches the
  zone edge, hairlines not boxes 10 / palette restraint: ink · paper · one accent, muted
  and line derived from paper, `.hot` used at most once 10
- **Nothing reads as generated (25)** — score 25 and subtract 5 per marker found, floor 0:
  gradient or glow on text · rounded cards / bordered panels / a 3-column card grid ·
  stacked drop shadows or glassmorphism · emoji, icon rows, decorative particles or blobs ·
  every element bouncing or sliding in the same way · a second accent or a rainbow of bar
  colours · decorative numbering on non-sequential content · centred-everything with no
  read order
- **Motion carries meaning (25)** — each group moves one thing and that thing is what the
  segment says 10 / durations inside the tokens and the 2.6s cap, ease-out, no bounce 10 /
  the state rule holds — clip k's first frame equals clip k-1's rest frame (compare
  `g<k-1>-end` with the renderer's `r<k>` first frame when in doubt) 5
- **Legibility (20)** — every text ≥ the role's floor size, digits tabular 10 / contrast:
  paper on ink, muted still readable on the sheet at 25% scale 5 / a source line is present
  when a number is on screen 5

Findings that are a matter of taste go to fix directives, not P0. A P0 is something a
viewer would notice as wrong, not something a designer would do differently.

## 6. Kinetic type — when the words are the picture

The lane is `kind: "kinetic"` (scenes-schema §kinetic type). Everything in §1–§4 holds; what
changes is that type carries the whole frame, so the type decisions become the composition
decisions.

- **One big phrase, and it is the only big thing.** `--fs-word` is the hero size and there is
  one hero per screen, exactly as there is one hero number on a diagram slide. Everything else
  is `--fs-word2` or smaller.
- **Five words to a line, four lines to a screen.** Korean breaks by word
  (`word-break:keep-all`), so a phrase that needs a sixth word is a phrase to cut, not to shrink.
- **One effect kind per screen.** `drop` is the default — the phrase arrives from just above and
  settles. `wipe` reveals left to right, which is the reading direction, and suits a longer
  phrase. Two effects on one screen reads as a template being demonstrated.
- **The struck-out phrase is the one device with a second meaning.** `h.cross` draws a rule
  through a phrase in the same group it appears — the thing that turned out to be wrong. Once
  per screen at most.
- **What is on screen is not the subtitle.** The subtitle band is already carrying the sentence.
  The screen carries what is left when the sentence is cut to its point.

**P0, added for this kind**

8. A screen phrase identical to its segment's `sub` — the same sentence twice, once burned in and once as the picture
9. More than one hero-sized phrase, or a line past five words
10. Two effect kinds on one screen, or a word that rotates, bounces, or arcs in

**What the axes look at here** — design craft reads type hierarchy and line breaking instead of
diagram composition; motion-carries-meaning asks whether each phrase lands on the sentence that
says it; legibility is mostly line length and the gap between lines.

## 7. Character act — when someone is reacting

The lane is `kind: "character"` (scenes-schema §character act). The figure is an ink line-drawing
in this same design language, and the rules exist to keep it from becoming a mascot.

- **The figure is drawn in the palette, not on top of it** — paper stroke on ink, no fill, no
  face, no colour of its own. The accent stays where it always is: on the words.
- **One action per group, from the seven** (`enter` · `point` · `nod` · `shrug` · `think` ·
  `wave` · `cheer`), declared in `scenes.js` as `visual.slide.acts`. The action set is closed on
  purpose — a movement authored for one slide renders differently on the next re-render, and a
  figure whose motion is hand-tuned is exactly the "generated look" this document is against.
- **Every action returns to rest** but `enter`. Poses don't accumulate across cuts, which is what
  makes the clips joinable at all.
- **The words say it, the figure reacts.** A gesture is never the only thing conveying a value or
  a claim — the style gate and the reviewer read text, and a point that exists only as a raised
  arm is a point nothing has checked.
- **It earns its place on human beats** — being stuck, deciding, being surprised, the moment it
  works. On a screen that exists to show a number, the figure is in the way.

**P0, added for this kind**

11. A CSS keyframe or an action name outside the seven — motion authored inside the slide instead of chosen
12. A pose that persists into the next clip (an action that does not return to rest), visible as the figure starting group k+1 mid-gesture
13. The scene's claim or value exists only as a gesture, with no text on screen carrying it
14. The figure overlapping the text block or crossing the zone edge in any sheet frame

**What the axes look at here** — nothing-reads-as-generated adds the mascot markers (a face, a
fill colour, a second figure, an idle bob); motion-carries-meaning asks whether the chosen action
is the one the sentence calls for, not merely that something moved.
