# Iteration 2 repair summary

Independent score: 94; 2 blocking defects.

- `hasStructuredImages` is now shared by the browser contract, spatial prompt assembly, video compilation, image inventory and direct image-input enforcement.
- Structured endpoint handoffs always include the opening image, even with empty/omitted extra reference arrays.
- The endpoint opening-image requirement also applies when references is absent.
- Existing-module regression cases cover both empty-array and missing-property variants.
