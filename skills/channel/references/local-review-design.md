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
  locally; the portal's Google Sans Flex and other language families are not bundled.
- Shared CSS declares color and size tokens once; all review components use them.
  Responsive thresholds are 640px, 768px and 1024px (max-width rules use one pixel
  below the threshold). The 20px brand name follows the portal sidebar heading.
- Layout: 240px sidebar, left-aligned content, 32px desktop / 20px mobile padding,
  28px desktop / 22px mobile titles. Mobile navigation flows above the content.
- Character detail: basics, appearance (front/back/face plus extras), voice and
  full identity. Offline sheets are read-only; they do not offer server mutations.
- Storyboard: shots first, style next, then checks/costs and reference disclosures.
  Existing renderer nodes and validation remain intact. Source and alias use one
  template. Local frame/reveal previews remain richer than portal shot media cards;
  this is an offline review adaptation, not a claim of pixel-identical portal output.

`review-library.js <channelDir>` exports from existing files. `--check` is read-only.
No portal client, credentials or network are consulted. Existing handwritten HTML
and symlinked output paths are refused before any files are written. Export refreshes
current views; obsolete generated files are not deleted automatically. Indexes only
link current records. Production inputs are never moved.

A template comparison proves the local copies agree. Compare 1440px and 390px
renders against the recorded portal reference separately before claiming visual
parity; a new portal release requires a new comparison and reference revision.
