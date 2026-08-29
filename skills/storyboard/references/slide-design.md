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
