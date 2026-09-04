# Slide authoring — every slide is a motion slide, built after approval

Use this only when scenes.js has a slide scene. Every `visual.slide` is a motion slide
(`motion: true`). Frames are authored, rendered and read **in produce §3.6, after the
storyboard is approved** (owner directive 2026-09-04 — slide arts are generated images, and
no image is made before approval). What the user approved is the plan in scenes.js: the kind,
the `labels`, the `motionBeats`, the `arts` list. Nothing here writes new copy — every
character on a slide already cleared the copy gates inside scenes.js.

Related contracts: `references/slide-design.md` (the design rubric the reviewer scores
against), `references/check-slide.js` (the machine check), and produce §3.6 for how the
rendered slides enter the build.

### Slide authoring (produce §3.6 — after approval)

Build the per-scene HTML slides from the copy/camera/sound-reviewed storyboard's `plan` and
`labels`. Every copy
gate has already passed, so no new text gets written here — **every character on a slide comes
from scenes.js** (`title`, `bullets`, `slide.labels`). Plant a new Korean string here and text
that never passed the style gate goes on screen.

One path. `slide.motion: true` is required. `slide.kind` says which template it starts from
and which design section judges it: `"diagram"` (the default) · `"kinetic"` · `"character"`.
The procedure is one procedure; only the template and the design rules differ. All of them
share the text rule above, `check-slide.js`, and the §7 approval that follows.

Assign reveal groups 1:1 with the narration segments (group 0 = the base skeleton). Only
scenes using sub-reveals (`A|B`) have more groups than segments.

#### Motion slides — author, render, and read the sheet

A motion slide is built from **`references/motion-slide-template.html`** and judged by
**`references/slide-design.md`** — read both before writing a line. The template's head
carries the contract (the state rule, what may move, what is forbidden); the design doc
carries the look (ink · paper · one accent, rules not boxes, one hero per slide) and the
rubric the reviewer applies.

1. **Author.** Copy the motion template to `slides/<the visual.slide.file name>`, set
   `SLIDE_SHOT`, and rewrite only `renderSlide()` using the helpers — `h.tag(rg, text)` for
   the kicker plate, `h.title(rg, text)` for the title (a mask rise), `h.stat(rg, value,
   {unit, label, underline, cls:"max"})` for the hero number, `h.bar(rg, pct, label, value)`
   for a comparison, `h.step(rg, t, d)` for a sequence, `h.band(rg, text, {tone})` for a
   verdict or name plate, `h.plate(rg, html, {tone, edge})` for an evidence cell or quote,
   `h.callout(rg, label)` and `h.rv(rg, html, {fx:"mask"})` for type, `h.foot(0, source)`
   for the source line. Group numbers follow the storyboard `plan` — segment 1 is group 1.
   **Group 1 is the opening chain**: the tag, then the title (`lead:1`), then the first
   value (`lead:2`), each `--lead` after the last — the base (group 0) holds only the
   source, a scrim or an axis. Text may carry `**accent**` and `==highlight plate==`.
   Timeline, statistic, and principle frames use the helper named by each `motionBeats`
   primitive: `h.date` · `h.range` · `h.link`; `h.count` · `h.bar` · `h.dots` · `h.axis`;
   `h.flow` · `h.node` · `h.state`; `h.fig` · `h.stem` · `h.bus` · `h.chamber` ·
   `h.disk` · `h.ring` · `h.press` · `h.shift`. Those helpers stamp `data-primitive` into
   the frame, and the renderer matches it to the same narration group. Group 0 is the
   kicker and title. One kind of movement per group.
   - **Pick an archetype before laying out freeform** (slide-design.md §4): the stat poster
     (`h.stage("spread")` + `h.stat` with `cls:"max"`), the `.split` compare (cells with
     `h.vdiv(rg)` between them), the `.timeline` rail, the plate grid (`h.plate` cells), or
     the band verdict. `h.stage("spine")` stands the accent edge bar on diagram and evidence
     slides. The renderer measures zone fill and a freeform layout that clusters in the top
     half gets flagged.
   - **Structure is plates and rules, not cards** (slide-design.md §4): square,
     single-colour, no radius, no border, no floating shadow (the studio slab's lit edge and
     contact shadow come from the template head, never from `renderSlide()`). Lines are `--hair` 3px, `--rule` 6px
     or `--band` 10px — nothing thinner goes on a phone. Never add a gradient inside
     `renderSlide()` (the ground plate and the photo scrim already live in the template's
     head CSS; `check-slide.js` blocks a gradient in the authored region).
   - **Mark the sustain layer and the focus shift while authoring** (slide-design.md §5):
     `sv: true` on the one meaning-bearing movement of any group whose sentence runs past
     its entrance (count-up, bar fill, dot fill, draws), `sv: "settle"` on an entered
     element that should keep landing for its sentence — a text block or a large actor, since
     the settle scales by 4.5% and a small shape moves less than a pixel — `dim: true` on
     evidence the narration moves past. Without a `.sv`, a long sentence sits on a frozen frame and the
     renderer says which group and for how long.
   - A **principle** frame is ink actors plus drawn relations, not a stack of labels.
     Sit the cast in `.cast`. `h.fig` arrives (`shape-enter`), `h.stem` / `h.bus` /
     `h.ring` draw (`shape-draw`), `h.chamber` boxes a terminal or room (`shape-enter`),
     `h.press` / `h.shift` travel (`shape-travel`). Labels name the actors; they are not
     the picture. `h.flow` · `h.node` · `h.state` stay for named states and may skip
     arts. Shape primitives require `slide.arts`. A principle that only reveals words is
     the same defect as a kinetic fallback.
   - When `slide.arts` is set, generate each plate into `slides/assets/` **before** this
     check — flat ink illustration of the actor, paper fill on ink, no background, no
     readable text, no photorealism, local png/jpg. Sit a principle actor with
     `h.fig(rg, i)`; sit a kinetic still with `h.art(rg, i)`. The picture has no letters;
     HTML type stays in `labels`. `move` is `travel` · `rise` · `in` · `drop` · `press` ·
     `none`. An art that travels while its caption enters with `in` is one event.
   - A diagram with `treatment:"editorial"` is not limited to the stock count/bar/step layout.
     Rewrite `renderSlide()` and add scene CSS/DOM for its declared `role`: archival paper,
     evidence tables, technical layers, maps, date rails, masks, and kinetic verdict type are
     all valid. Keep the runtime and zone intact. Use 2–4 atomic moves, one primary read per
     group, and repeat the declared `motif` across the episode's editorial frames.
     A raster is an ingredient, never the composition: an editorial screen with an image uses at
     least two authored visual actors or relations (`h.art` / `h.fig`, paper or document pieces,
     rails, masks, signal lines, stems, rings, or custom DOM equivalents). Build the connection
     the narration claims on screen. For example, two gesture plates can enter separately, meet
     on a sourced symbol, and keep the source label visible; that is an online interpretation,
     not proof that the gestures created the symbol. `check-slide.js` rejects a raster-only
     editorial render before the visual reviewer sees it.
   - A diagram with `treatment:"editorial"` sits on the **studio ground** by default
     (slide-design.md §1): a cyclorama plate, slab material on every tag, band and plate, a cast
     shadow under the type, the stage alone drifting 1% a group. Nothing to call — `h.stage("flat")`
     is the way back to the plain plate. Marks drawn over a studio slide take `pen:true`. Call
     `h.stage(…)` before any `h.mark.*` — the mark layer reads the studio class when it is made.
   - A diagram with **`slide.object`** places a **rendered object** (`rendered-object.md`,
     slide-design.md §9): bake the sheet first —
     `python3 references/bake-object.py --shape disc --out slides/assets/s<n>-obj --keys … --frames …`
     with the keys and frames from scenes.js — then read the sidecar it wrote
     (`<script src="assets/s<n>-obj.js">` after scenes.js) and sit the object with
     `h.object(rg, "s<n>-obj", { x, y, slot, out, html, aside })`. The entry and exit groups declare
     `object-move` in `motionBeats`; a group where the object changes under a count declares the
     count. The object's frames stretch to the segment on their own. The source line goes to the
     corner (`h.foot(0, …, { corner: true })`) when the slot and a hero spend the zone.
   - A diagram with `treatment:"photo-action"` places the photo with `h.photo(0, file)` and
     darkens the text areas with `h.scrim(0)` (both in the base group), but the subject or
     evidence itself must change as `visual.action` and `slide.plan` say. Animating only
     brackets, callouts, captions, glow, or the whole image fails review.
   - A diagram with `treatment:"footage"` is authored **after its clips exist** (produce §3,
     `footage-lane.md`). Run `footage-frames.sh <storyboard dir> s<n>` for the mid frames, then in
     `renderSlide()` lay `h.footage(k, shots[k-1].clip)` for every group and draw the mark the plan
     names — `h.mark.route` · `x` · `ring` · `hatch` · `box` · `dot` · `path`, coordinates in canvas
     pixels read off the mid frame — and `h.matte(k, shots[k-1].matte)` on a shot that has one. No
     `h.tag`, no `h.title`, no plate: the clip is the ground and the subtitle is the type.
     slide-design.md §6.2 is the rubric; `zone_fill_pct` is `null` on this treatment and the
     renderer skips the entrance cap (the clip runs the whole segment by design).
2. **Machine check** — `node references/check-slide.js <storyboard directory> --require-all`
   (`motion:true` written, `__seek` present, no `transition`, no clocks or timers, no web
   fonts, every Korean string in scenes.js, no shadow or gradient outside the template's studio
   rules, and — with `slide.object` — the sheet, its sidecar, the include, the `h.object` call
   and the object's ink inside the zone). Don't move on unless it exits 0.
3. **Render the sheet** (free, ~10s a slide). Run from the storyboard directory —
   `slides/` and `.work/slide-check/` are relative to it:

   ```bash
   REF=${CLAUDE_PLUGIN_ROOT}/skills/produce/references
   node $REF/render-motion-slide.mjs slides/s<shot number>-<slug>.html \
     --out .work/slide-check/s<shot number> --sheet --png-only --keep-frames --segs auto
   ```

   `--segs auto` estimates each segment from its narration characters (schema rate,
   4.5/s) so the sustain layer stretches to roughly what the finished sentence will be;
   produce re-renders with measured lengths (optional-lanes.md §3.6). The sheet frames
   carry the plate ground but not the film grain — grain is added at the mp4 encode
   (`--grain`, default 6) and never shows in `--png-only` output. The renderer stops
   (exit 1) on a contract breach and says which: a page script that
   threw (the exception is printed), an animation outside any reveal group, an infinite
   animation, a group with no motion, fewer groups than segments.

   Read the summary line: the group count must equal the segment count (or the segment
   count plus the `A|B` sub-reveals you wrote); `zone_fill_pct` at 55%+ on both axes (a
   lower number is a composition finding, not a note); and no coverage warning (a group
   frozen past 40% of its segment wants a `.sv` sustain). Open
   `sheet/g<k>-end.png` for the last group and confirm by eye that everything the scene
   claims is on it, inside the zone.
4. **The design gate — your own read of the sheet.** For every authored cut open
   `sheet/g<k>-end.png` for its last group and the `g<k>-mid.png` of any group that moves, with
   `summary.json` beside them (the renderer writes it next to the manifest — `zone_fill_pct` and
   the coverage warnings live there), and judge the cut against `references/slide-design.md`
   §6 — text inside the zone, every on-screen word in scenes.js, every figure matching `labels`
   and research.md, one accent and no gradient text, a plate ground and not a flat fill, motion
   that means the value spoken, an end frame that is the conclusion. A cut that fails a point is
   re-authored once and re-rendered (steps 2–3). The `slide-reviewer` loop of 0.49 (five
   delegations an episode) is no longer part of the flow — it was the largest reviewer sink
   measured, 46 calls and 674 million tokens on one episode — and stays available for a read the
   user asks for by name; when it runs it still returns a `SLIDE_REVIEW: slide=<file> score=NN
   p0=N verdict=PASS|FAIL` tail per slide, judged in one context, and a slide under 95 is a
   failed cut. Log what you changed in storyboard.md under the slide table
   (`s5 · authored → re-authored: zone overflow`), so the check is a record and not a claim. A
   cut still wrong after the re-author goes back to the user with the sheet, not into the build.
5. Nothing goes in the ledger — the render is local. The `.work/slide-check/` frames stay
   for produce to compare against (§3.6 re-renders the clips from the same file).

`autoproduce` runs this same check before narration and build; a slide still wrong after the
re-author aborts the unattended build.

#### Kinetic type — the same procedure, a different template

`kind: "kinetic"` (scenes-schema §kinetic type) is the motion path with three substitutions:

1. Start from **`references/kinetic-type-template.html`** and rewrite `renderKinetic()`.
   Helpers: `h.tag` (the kicker plate) · `h.word` (the one big phrase) · `h.line` · `h.sub` ·
   `h.cross` (a phrase with a rule struck through it) · `h.band` (the verdict plate) ·
   `h.rule` · `h.art` (a still from `slide.arts`) · `h.disk` (a supporting shape). When `slide.arts` is set, default `renderKinetic` places the first
   art on group 1 then the title with `in` — that pair is one event. Type-only (a verdict,
   a cross) skips arts. Mixing `drop` and `wipe` on type is still two kinds.
2. The design section is **`slide-design.md` §7**, with three extra P0s to check on your own
   read (slide-reviewer applies the same three when asked) — a screen phrase that repeats the subtitle sentence, a second hero-sized phrase or a
   line past five words, two effect kinds on one screen. The default entrance is `mask`
   (`words:true` staggers it word by word and counts as the same kind); `h.band` is the
   verdict plate and the last thing to enter.
3. Steps 2–5 (machine check, sheet render, your own read of the sheet, the change log in
   storyboard.md) are unchanged, including the same `render-motion-slide.mjs`
   command — the renderer only asks for the seek contract and does not care what is drawn.

The one thing to check by eye before delegating: open `sheet/g<k>-end.png` beside the scene's
`narration[k].sub` and confirm the screen is not reading the sentence back. That is the defect
this kind produces, and it is invisible while authoring because both texts came from the same
storyboard.

#### Character act — characters and props enact the sentence

`kind: "character"` (scenes-schema §character act) is the motion path with the same three
substitutions — **`references/character-act-template.html`**, `renderCharacter()`,
`slide-design.md` §8 — plus one rule that has no equivalent in the other kinds:

**Do not write motion here.** The movement belongs in `visual.slide.acts`, one action per reveal
group. A simple reaction may use the named actions directly. A historical or explanatory event
uses `cast` plus action objects so the screen says who does what to whom:

```js
cast: [
  { id: "masked", archetype: "masked", label: "비밀 결사" },
  { id: "police", archetype: "police", count: 2, label: "바이에른 경찰" }
],
acts: [
  { action: "gather", actor: "masked" },
  { action: "surround", actor: "police", target: "masked" },
  { action: "bind", actor: "police", target: "masked" }
]
```

The closed vocabulary is `enter` · `point` · `nod` · `shrug` · `think` · `wave` · `cheer` ·
`conceal` · `signal` · `inspect` · `gather` · `surround` · `bind` · `escort` · `release`.
`renderCharacter()` lays out the words and the template tableau; it never adds a keyframe.
`check-slide.js` fails an unknown action, a missing cast actor, or fewer acts than narration
segments. A keyframe added by hand is a §7 P0 in the review.

**Make the claim happen in the picture.** “The government banned the group” is not a date over a
paper texture: a large-head masked figure is met by two police figures and a restraint line closes
around the figure. The written date and source still carry the fact; the action gives the sentence
its visual cause and effect. For a relationship claim, bring both characters or props onto the same
frame before a line joins them.

**Use image plates when the image tool is available.** Generate a consistent set of transparent,
text-free character and prop plates first (same illustrated material, same camera angle, no real
person likeness), place them through `slide.arts`, then make HTML control their entrances,
relations, and state changes. The code-native chibi tableau is the fallback only when no image tool
is configured. Do not replace an available illustration pass with labelled boxes.

If the beat genuinely needs an action that isn't in the seven, that is a change to the template,
`check-slide.js`, and `slide-design.md` §7 together — bring it to the user rather than solving it
inside one slide. A slide that invents its own motion renders differently on the next re-render,
which is the whole reason the vocabulary is closed.

When that's done you're waiting — once the user's `footage/` and `voice/` files arrive, produce
uses the per-group clips as the segment visuals (produce §3.6).
