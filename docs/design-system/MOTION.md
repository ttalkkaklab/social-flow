# Motion design system

Status: contextual themes and bundled role-based typography implemented; review evidence is stored with local rendered artifacts.
Executable tokens: `skills/storyboard/references/motion-graphics.js` (`THEMES`).

## Intent

A theme coordinates the presentation of an argument. A semantic motion type
chooses the representation; a theme controls typography, spacing, surface geometry,
color and temporal character. Never select a theme by shot number or rotate themes
for variety. Channel identity wins; otherwise choose the communication context.

## Composition plan

- Report: left-aligned claim, common plot region, aligned data and units. Use scale
  and exact labels to explain evidence. Keep color count low.
- Product: a task and its result share generous working space. Distinguish an
  actionable surface from an output. A mock must remain labelled as a mock.
- Learning: connected stages or relationships, deliberate reading order, time to
  follow each handoff. Sequence numbers are appropriate only for sequences.
- Campaign: display type carries a short statement; keep supporting material quiet.
  This is not the default for long paragraphs or dense charts.

Landscape: `[claim / context]` above `[representation and change]` above `[source]`.
Portrait: preserve reading order and stack paired states; do not shrink a landscape
composition. Theme dimensions use the 1600×900 or 900×1600 design coordinate system.

## Type and timing

Bundled Paperlogy, Black Han Sans, Gowun Batang and Jua supply thematic titles.
Space Grotesk and Roboto Flex supply Latin and numeric roles; Pretendard supplies
body text and a verified whole-text fallback. See FONTS.md for sources and roles. Variable
weights and tracking differentiate theme roles without relying on a system font.
Numbers retain tabular alignment. Titles are balanced by available width; source
text stays subordinate. Font-family variety alone does not establish good design.

The theme's end fraction maps the complete deterministic animation to a bounded
interval; the remaining time holds the complete result. Every animation branch,
including cursors and model counters, uses the same remapped clock. Easing changes
acceleration, never the numerical meaning of data or simulation rates.

## Critique before expansion

Six theme palettes alone cannot fix a weak illustration or generic composition.
The current system provides a reproducible contract and tokens; it does not yet
provide bespoke art direction for all 21 semantic families. Physical subjects
still require authored assets and articulated meshes. Themes must not replace
those with rectangles. Realistic UI proof still requires a recording.

Inspect horizontal and vertical renders, the beginning, transformation and hold,
plus arbitrary seeks. Check overlapping text, numerical geometry, subject fit and
visual hierarchy independently of input validation. The previous aesthetic score
was rejected by the user and is not inherited by this system.

## Episode consistency

`THEME.motionGraphicTheme` is the storyboard-level default. Shots with no theme or
an automatic choice without context inherit it. Explicit shot ids/contexts are
exceptions. `storyboard_apply` recomputes inherited resolutions; preparation and
browser rendering resolve against the same board default. The header exposes the
common theme and each shot exposes its resolved theme and reason.

Expressive themes use different compositions: campaign uses a saturated poster
and an emphasized closing phrase, story centers a quiet serif passage, playful
uses rounded type with author-selected word emphasis or alternating entrances. Phrase reveals never cut across a
Hangul syllable. Quantitative labels count against the same progress as their bars;
comparison deltas connect the endpoints. Input/output keeps its source visible as
individual fields are copied and reordered when the author supplies shared field substrings; queue saturation changes state color and exposes overflow.

Part/whole labels connect directly to segments. Semantic emphasis and field reorder metadata are optional: the storyboard author selects the meaningful word or shared fields, while the runtime preserves complete phrases, whitespace and deterministic seeks.
