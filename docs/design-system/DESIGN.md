# Offline review pages

The storyboard, channel library, cast sheets, props and locations share a light canvas so an image can be judged against the same background throughout production. The storyboard detail page is the visual reference.

## Edit the source

Change tokens and shared components in [design-system.css](../../skills/channel/references/review-assets/design-system.css). The [storyboard exporter](../../skills/storyboard/references/storyboard-html.js) and [library exporter](../../skills/channel/references/review-library.js) copy the assets into episode and channel folders. Regenerate the review page to inspect a change.

| Part | Convention |
| --- | --- |
| Surfaces | Use the canvas and surface tokens for the page and cards. Place thumbnails on the recessed surface. Limit blur to floating navigation. |
| Color | The storyboard reads the channel accent from its theme. Library pages use the default accent. Reserve status colors for findings and pair them with a label. |
| Type | Use Inter for Latin text, Pretendard for Korean and the appropriate regional Noto Sans for Japanese or Chinese. The font files, licenses and hashes ship with the review library. |
| Navigation | Use a visible keyboard focus ring and a minimum 44 px tap target. Move the sidebar above the content below 1024 px. |
| Layout | At widths below 768 px, stack the image and settings on a sheet. Below 640 px, lists use a single column. Reserve thumbnail space before the media loads. |
| Accessibility | Keep reading surfaces opaque in high-contrast and reduced-transparency modes. Respect reduced motion and preserve content order for printing. |

For new library pages, use the shared `.ds-card`, `.ds-panel`, `.ds-tabs` and related components. The storyboard's existing classes use the same tokens. Inspect a generated board and character sheet at phone and desktop widths, including the empty image state, long dialogue, keyboard focus and print view. [Review page implementation notes](../../skills/channel/references/local-review-design.md)
