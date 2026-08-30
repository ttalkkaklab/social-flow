# Slide authoring — after approval, on episodes that have slide scenes

Storyboard §8. Read it **after the approval gate**, and only when scenes.js has a slide
scene. Nothing here writes new copy: every character on a slide already cleared the copy
gates inside scenes.js.

## Contents

- [Static slides and motion slides](#8-slide-authoring-after-approval-only-on-episodes-with-slide-scenes) — which kind a scene gets
- The closed motion vocabulary, the design review, and what produce consumes are in the
  body below in that order.

Related contracts: `references/slide-design.md` (the design rubric the reviewer scores
against), `references/check-slide.js` (the machine check), and produce §3.6 for how the
rendered slides enter the build.

### 8. Slide authoring (after approval · only on episodes with slide scenes)

Build the per-scene HTML slides from the approved storyboard's `plan` and `labels`. Every copy
gate has already passed, so no new text gets written here — **every character on a slide comes
from scenes.js** (`title`, `bullets`, `slide.labels`). Plant a new Korean string here and text
that never passed the style gate goes on screen.

Two paths. A **static slide** (no `motion`) follows steps 1–5; **anything that moves**
(`slide.motion: true`) follows §8.1 instead of steps 1 and 4 — and within that, the
`slide.kind` says which template it starts from and which design section judges it:
`"diagram"` (the default) §8.1 · `"kinetic"` §8.2 · `"character"` §8.3. The procedure is one
procedure; only the template and the design rules differ. All of them share the text rule
above, `check-slide.js`, and the §7 approval that came before.

1. **Per scene**, copy `references/slide-template.html` to `slides/<the visual.slide.file name>`,
   change `SLIDE_SHOT` to that shot's number (its array position), and rewrite only
   `renderSlide()` into that scene's diagram. Keep the determinism contract at the head of the
   template — no CSS animations or transitions, no web fonts, no `Math.random` / `Date`. All the
   motion there is comes from the builder's xfade.
2. **Assign reveal groups 1:1 with the narration segments** (group 0 = the base skeleton). Only
   scenes using sub-reveals (`A|B`) have more groups than segments.
3. **Machine check** — `node references/check-slide.js <storyboard directory>` verifies the
   three-way match between filename, `SLIDE_SHOT`, and scenes.js, catches Korean literals absent
   from scenes.js, and catches determinism violations. Don't move on unless it exits 0.
4. **Self-verify the state capture** — enumerate the states for each scene.

   ```bash
   REF=${CLAUDE_PLUGIN_ROOT}/skills/produce/references
   CAP_W=1920 CAP_H=1080 $REF/capture-reveals.sh <shot number - 1> \
     "file://$PWD/slides/s<shot number>-<slug>.html" .work/slide-check/a<shot number - 1>r 0
   ```

   If the state count differs from **segment count + sub-reveal count + 1** (group 0 included),
   the rg assignment is wrong — produce's "missing reveal state" gate checks the same thing again
   at build time. Open the last state PNG and confirm by eye that every `labels` entry is
   visible and that the text sits inside the zone (clear of the 285px subtitle band at the bottom).
5. Slides are captured locally, so they cost nothing — there's nothing to write in the ledger
   (`.work/cost-tally.tsv`), and the absence of a generation call is itself the record.

#### 8.1 Motion slides — author, render, and pass the design gate

A motion slide is built from **`references/motion-slide-template.html`** and judged by
**`references/slide-design.md`** — read both before writing a line. The template's head
carries the contract (the state rule, what may move, what is forbidden); the design doc
carries the look (ink · paper · one accent, hairlines not boxes, one hero per slide) and the
rubric the reviewer applies.

1. **Author.** Copy the motion template to `slides/<the visual.slide.file name>`, set
   `SLIDE_SHOT`, and rewrite only `renderSlide()` using the helpers — `h.count(rg, value,
   {unit})` for the hero number, `h.bar(rg, pct, label, value)` for a comparison,
   `h.step(rg, t, d)` for a sequence, `h.callout(rg, label)` and `h.rv(rg, html, {fx:"rise"})`
   for everything else. Group numbers follow the approved `plan` — segment 1 is group 1.
   Group 0 is the kicker and title. One kind of movement per group.
2. **Machine check** — `node references/check-slide.js <storyboard directory>` (the motion
   branch: `__seek` present, no `transition`, no clocks or timers, no web fonts, every Korean
   string in scenes.js). Don't move on unless it exits 0.
3. **Render the sheet** (free, ~10s a slide). Run from the storyboard directory, like
   step 4 of the static path — `slides/` and `.work/slide-check/` are relative to it:

   ```bash
   REF=${CLAUDE_PLUGIN_ROOT}/skills/produce/references
   node $REF/render-motion-slide.mjs slides/s<shot number>-<slug>.html \
     --out .work/slide-check/s<shot number> --sheet --png-only --keep-frames
   ```

   The renderer stops (exit 1) on a contract breach and says which: a page script that
   threw (the exception is printed), an animation outside any reveal group, an infinite
   animation, a group with no motion, fewer groups than segments.

   Read the summary line: the group count must equal the segment count (or the segment
   count plus the `A|B` sub-reveals you wrote), and no group may pass the 2.9s cap. Open
   `sheet/g<k>-end.png` for the last group and confirm by eye that everything the scene
   claims is on it, inside the zone.
4. **The design gate — delegate to `slide-reviewer`** with the slide file, the sheet
   directory, `manifest.tsv`, scenes.js, research.md, profile.md and
   `references/slide-design.md`. It returns findings and a `SLIDE_REVIEW: score=NN p0=N
   verdict=PASS|FAIL` tail. **Apply every fix directive, re-run steps 2–3, and delegate
   again with the previous findings attached, until the tail says PASS (score ≥ 95 and
   p0 = 0).** Hard cap 3 rounds (user directive 2026-08-29) — a slide that hasn't converged
   by then goes back to the user with the last findings and the sheet, not into the build. Log each round's score
   in storyboard.md under the slide table (`s5 · round 1 → 78 · round 2 → 96 PASS`), so the
   convergence is a record and not a claim.
5. Nothing goes in the ledger — the render is local. The `.work/slide-check/` frames stay
   for produce to compare against (§3.6 re-renders the clips from the same file).

`autoproduce` does not run this gate yet — an unattended episode with motion slides gets
the machine check and the render, not the reviewer round. That is a known gap, written
down here so it isn't mistaken for coverage. **The two kinds below inherit that same gap** —
adding them widens what an unattended run can put on screen without a reviewer, and that is
stated here rather than left to be discovered.

#### 8.2 Kinetic type — the same procedure, a different template

`kind: "kinetic"` (scenes-schema §kinetic type) is §8.1 with three substitutions:

1. Start from **`references/kinetic-type-template.html`** and rewrite `renderKinetic()`.
   Helpers: `h.word` (the one big phrase) · `h.line` · `h.sub` · `h.cross` (a phrase with a
   rule struck through it) · `h.rule`.
2. The design section is **`slide-design.md` §6**, and slide-reviewer applies its three extra
   P0s — a screen phrase that repeats the subtitle sentence, a second hero-sized phrase or a
   line past five words, two effect kinds on one screen.
3. Steps 2–5 (machine check, sheet render, the design gate at ≥ 95 / p0 = 0, three-round cap,
   scores logged in storyboard.md) are unchanged, including the same `render-motion-slide.mjs`
   command — the renderer only asks for the seek contract and does not care what is drawn.

The one thing to check by eye before delegating: open `sheet/g<k>-end.png` beside the scene's
`narration[k].sub` and confirm the screen is not reading the sentence back. That is the defect
this kind produces, and it is invisible while authoring because both texts came from the same
storyboard.

#### 8.3 Character act — the actions come from scenes.js

`kind: "character"` (scenes-schema §character act) is §8.1 with the same three substitutions —
**`references/character-act-template.html`**, `renderCharacter()`, `slide-design.md` §7 — plus
one rule that has no equivalent in the other kinds:

**Don't write motion here.** The figure's movement is `visual.slide.acts` in scenes.js, one name
per reveal group from the seven the template defines (`enter` · `point` · `nod` · `shrug` ·
`think` · `wave` · `cheer`). `renderCharacter()` lays out the words; it never touches a keyframe.
`check-slide.js` fails on a name outside the seven and on fewer acts than narration segments, and
a keyframe added by hand is a §7 P0 in the review.

If the beat genuinely needs an action that isn't in the seven, that is a change to the template,
`check-slide.js`, and `slide-design.md` §7 together — bring it to the user rather than solving it
inside one slide. A slide that invents its own motion renders differently on the next re-render,
which is the whole reason the vocabulary is closed.

When that's done you're waiting — once the user's `footage/` and `voice/` files arrive, produce
uses the slide state captures (static) or the per-group clips (motion) as the segment visuals
(produce §3.6).
