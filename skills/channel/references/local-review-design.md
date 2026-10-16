# Offline review design

Reference: ttalkkak-story commit `d29f1a6` (2026-10-11), design system 1.2.0.
Source components: `src/components/ui/page.tsx`, `globals.css`,
`features/characters/components/character-card.tsx`, `character-form.tsx`,
`character-image-slots.tsx`, and `features/storyboard/components/shot-tree.tsx`.

- Palette: background #fcfcfd, text #18181b, secondary text #52525b,
  separators #e4e4e7, actions #2563eb, positive state #147a4b.
- Typography: bundled Wanted Sans Variable 1.0.3; source npm wanted-sans@1.0.3,
  `fonts/webfonts/variable/complete/woff2/WantedSansVariable.woff2`.
  OFL license travels beside the font. No CDN requests. Latin text uses Wanted Sans
  locally; other font families are not bundled.
- Shared CSS declares color and size tokens once; all review components use them.
  Responsive thresholds are 640px, 768px and 1024px (max-width rules use one pixel
  below the threshold). The brand name is 20px.
- Layout: 240px sidebar, left-aligned content, 32px desktop / 20px mobile padding,
  28px desktop / 22px mobile titles. Navigation flows above the content below 1024px so a tablet does not lose
  240px of reading space to a rail. Content can grow to 1280px.
- Character detail: appearance (front/back/face plus extras), basics, voice and
  full identity. Offline sheets are read-only; they do not offer server mutations.
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
