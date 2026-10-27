# Iteration 2 changes

- Equalized catalogue artwork and missing-cover stages at 260px.
- Removed the generic 4.5em paragraph minimum and its obsolete overrides.
- Cleared the language-picker float before header descriptions, preserving full
  text width on mobile.
- Paused voice previews when filtering hides their card.
- Scoped the narrower library content width to library pages; storyboard detail
  keeps its original 1280px maximum.

Scope: review-library.js, review-assets/review.css and review.js,
server/test/review-library.test.mjs. Local Meleon exports refreshed with the
shared exporter; episode scripts and original media are unchanged.
