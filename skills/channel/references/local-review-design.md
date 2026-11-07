# Offline review design

Reference: ttalkkak-story commit `d29f1a6` (2026-10-11), design system 1.2.0.
Historical source components: `src/components/ui/page.tsx`, `globals.css`,
`features/characters/components/character-card.tsx`, `character-form.tsx`,
`character-image-slots.tsx`, and `features/storyboard/components/shot-tree.tsx`.

- Tokens: every color, radius, shadow, type size and spacing value comes from
  `review-assets/design-system.css`, measured from the storyboard detail screen
  (2026-10-31). Rationale and token table: [design system](../../../docs/design-system/DESIGN.md).
- Typography: local Inter 4.1, Pretendard Variable 1.3.9 and Noto Sans JP/SC/TC
  variable fonts, each with its OFL license. See the current typography section below.
- Responsive thresholds are 640px, 768px and 1024px (max-width rules use one pixel
  below the threshold). The brand name is 20px.
- Layout: 240px sidebar, left-aligned content, 32px desktop / 20px mobile padding,
  28px desktop / 22px mobile titles. Navigation flows above the content below 1024px so a tablet does not lose
  240px of reading space to a rail. Content can grow to 1280px.
- Character detail: photos with identity and voice, extras, the remaining
  identity groups and the full identity source. Offline sheets are read-only; they do not offer server mutations.
- Storyboard: shots first, style next, then checks/costs and reference disclosures.
  Existing renderer nodes and validation remain intact. Source and alias use one
  template with local frame/reveal previews.

`review-library.js <channelDir>` exports from existing files. `--check` is read-only.
No credentials or network are consulted. Existing handwritten HTML
and symlinked output paths are refused before any files are written. Export refreshes
current views; obsolete generated files are not deleted automatically. Indexes only
link current records. Production inputs are never moved.

A template comparison proves the local copies agree. Verify 1440px and 390px
renders when changing the shared design.

## Contents

- [Generator refinement (2026-10-16)](#generator-refinement-2026-10-16)
- [Character detail refinement (2026-10-16)](#character-detail-refinement-2026-10-16)
- [Multilingual typography and Liquid Glass (2026-10-18)](#multilingual-typography-and-liquid-glass-2026-10-18)
- [Library pages on the design system (2026-10-31)](#library-pages-on-the-design-system-2026-10-31)

## Generator refinement (2026-10-16)

The owner requested a simpler, more polished responsive review interface. This is
a local refinement. The shared generator remains the only source.

- Character galleries show the complete silhouette without a fade mask, with a
  360px desktop art stage. Detail images open a native modal with a visible close
  button, Escape handling and focus restoration. The underlying links still open
  the source file without JavaScript.
- Artwork precedes character fields. Search fills the available toolbar width;
  small screens stack controls. Neutral surfaces, bundled type and one blue action
  accent keep attention on the art rather than decorative chrome.
- Shot frames and dialogue precede production grammar. Direction/camera details
  remain in native disclosures. Checks/costs retain their actual error totals in
  an always-visible shortcut; choosing it opens the disclosure and moves focus.
- Shot columns respond to their container width, including the desktop sidebar.
  Print expands all disclosures and then restores each previous state.
- Validate new output at 320, 390, 768, 1024 and 1440 CSS pixels. Exercise search,
  no results, image modal keyboard behavior, alias fragment navigation, language,
  disclosures and print restoration. Do not infer visual quality from --check.

See [the scored UX review](../../../docs/design-system/screen-quality/review-generator-20261016.md).

## Character detail refinement (2026-10-16)

The `.character-sheet` surface shows the name with its ID. Labeled pictogram links
lead to the identity block and the specification. Existing storyboard type pictograms
are preserved.
Section icons are decorative SVGs paired with visible translated text.

- Use a 1120px reading canvas with 16px body text and a 72ch maximum for values.
  The sheet opens with the storyboard cast card's layout (2026-10-31): a lit 2:3 stage
  shows one panel (face first, filling the frame; front and back uncropped), a thumbnail
  strip picks another. The right column is the identity group ("기본 설정": name, ID,
  species, age, role, summary) with the voice sample, transcript and voice settings right
  below it; the remaining groups follow as cards. Version, review status, panel
  registration and image-check findings are not shown on the sheet or its catalogue card
  (2026-10-31); `--check` still reports them. Each thumbnail links to its file without
  JavaScript. Below 768px the stage, strip and identity column stack.
- The sheet borrows the storyboard detail's surfaces (2026-10-31): the hero, each
  specification group, additional images and the source are 20–24px glass cards;
  group and voice titles carry an accent icon tile like the video settings bar; section
  links sit in the storyboard's sunk tab track; the voice sample is a speech bubble.
- Render each shown identity field once (identity, height and weight beside the photos;
  the rest in the specification). The body group is not shown; the speech group shows
  register, habits and pace only (2026-10-31). Use
  label/value rows instead of form-like boxes. Arrays are semantic lists. Native
  disclosures start open, retain keyboard controls and show pending counts even
  when collapsed. Pending/inapplicable reasons stay beside their status.
- Keep voice playback and the local sample transcript visible. Technical voice
  settings and the original identity document use separate disclosures. Never
  infer a transcript, missing identity value or review pass.
- Print expands identity groups and voice settings, then restores their previous
  state. Gallery links retain the original-image fallback without JavaScript.
- Scope detail styles to the character surface; list and storyboard layouts keep
  their existing rules. `review-library.js` regenerates every sheet from this
  template, with the same offline assets and review freshness checks.

Evaluation rubric and independent reports: [character detail review](../../../docs/loops/003-character-detail/loop.md).

Upstream image diagnostics and episode links remain available beneath the gallery.
Diagnostic details show their count when collapsed; they do not override the
character content review or imply that matching the template certifies the art.

## Multilingual typography and Liquid Glass (2026-10-18)

The canvas is a static cool light field. Floating navigation uses the glass surface,
a white rim, 24px blur and the float shadow. Shot cards use the reading surface
without blur. Values: `design-system.css`.

Font stacks are design-system tokens (`--ds-font-*`); `review-typography.css` picks
one by authored language. Inter supplies Latin (English, Vietnamese, German, French and Spanish). Pretendard
supplies Korean. Noto Sans JP/SC/TC supplies Japanese, Simplified and Traditional
Chinese. All faces and individual OFL files travel with generated boards and library
copies via `review-fonts.js`; no CDN or installed font is required. Provenance and
coverage live in `review-assets/fonts/manifest.json`. Legacy Wanted Sans assets are
not copied by the current generator.

The base is 15px/1.65; dialogue 16px/1.8; shot headings 18–20px; document headings
28–36px, weight 650. Script language is `SB_DOC.contentLanguage`, with optional
one-based `SB_DOC.shotLanguages` overrides. Explicit Chinese script tags control
regional glyphs independently of the English/Korean interface picker. Han-only
legacy text has an unknown language and an SC fallback; set the region explicitly.

The rail occupies the existing 240px column, inset 16px with a 224px visible surface.
It flows above the content below 1024px. The timing chart is a native disclosure
so a long episode does not push the first shot far down a mobile screen.
Reduced transparency, greater contrast, no-blur support and print have opaque
alternatives. Fonts settle before preview measurements and dependent views mount.

Research, screenshots and independent evaluation:
[typography review](../../../docs/loops/009-review-typography/research.md).

## Library pages on the design system (2026-10-31)

Headers use the storyboard document title. Search sits in a glass bar. Catalogue,
hub and character cards are glass cards with sunk media wells, hairline fact rows
and arrow links; covers fill their well. Prop detail pages reuse the `.character-sheet`
hero with a 1:1 stage. Location detail pages keep
`location-review.css` and the 3D runtime.
