# Storyboard review design

The ttalkkakstory storyboard screen is the visual reference for both portal and
local review. Choosing local HTML changes storage only. It never authorizes a
different layout, palette, type scale, shot card, or section order. Episode art
style and `THEME` describe the video, not a custom review interface.

## One local renderer

Use [storyboard-html-template.html](storyboard-html-template.html) for every review,
including episodes that sync with the portal. Edit only `<title>` and the marked
`SB_DOC` metadata block. Scene data stays in `scenes.js`. Do not generate a new HTML
page from prose or patch CSS in an individual episode.

Create or refresh the review with the bundled script:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/storyboard/references/storyboard-html.js" "<episodeDir>/storyboard"
```

On refresh it preserves the existing title and `SB_DOC` block, replaces the review
shell with the current template, and copies its runtime helpers, shared review CSS and bundled font. It never
reads a key or calls the portal. Fill the metadata after first creation. Before
delivery in either mode, run:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/storyboard/references/storyboard-html.js" "<episodeDir>/storyboard" --check
```

A failed check means the episode's layout/runtime has drifted from the bundled
template. Refresh, inspect, and check again. Do not waive it because the episode
is local or has no API key.

## Updating the portal design

When the portal's review screen changes, update this shared template and its
helpers in the same change, using the actual portal components/styles or an
authenticated rendered screen as the reference. Record the source revision and
compare the same episode in both views: header and navigation, sequence/scene
groups, shot frames and media, narration, camera/sound details, status and cost.
Inspect desktop and narrow widths, empty media, and populated media. Use the
repository's browser and screenshot lanes.

The local template check proves consistency across generated HTML copies; it
does **not** prove visual parity with a remote portal release. If the portal
source/screen is unavailable, preserve the bundled design and report that parity
could not be verified. Do not describe a guessed layout as matching the portal.
Ship the template in the plugin so keyless users never need a portal connection
to render or review a board.

## Offline library and portal source (2026-10-15)

The shell now uses the portal's neutral palette, Wanted Sans 1.0.3, left-aligned
240px sidebar and shot-first reading order. Source: ttalkkak-story `d29f1a6`
(2026-10-11), DESIGN.md 1.2.0, CharacterForm, CharacterCard, PageShell and ShotTree.
`review-layout.js` rearranges existing rendered nodes; all checks, costs, scene
previews, metadata and event handlers remain available. The closed checks summary
shows the actual warning/error totals. Printing expands the review disclosures.
The local review remains read-only and does not impersonate portal editing controls.

When invoked on `data/<channel>/episodes/<topic>/storyboard`, storyboard-html.js also
exports/checks the channel library. After editing SB_DOC, run it again so the copy
at `storyboards/<topic>/index.html` is current. That copy adds only a relative base
URL to the SAME renderer, never an independently authored storyboard UI.

Character changes call `skills/channel/references/review-library.js <channelDir>`.
Shared review assets live under the channel skill’s `review-assets/` directory.
See `skills/channel/references/local-review-design.md` for provenance and scope.
A local template pass still does not certify parity with a newer portal deployment.

## Responsive review refinement (2026-10-16)

The owner-authorized generator refinement uses the same shared assets in both
review destinations. Below 1024px navigation moves above the document. Each shot
shows its frames and dialogue before a direction/camera disclosure; review checks
and costs remain reachable from a shortcut carrying the actual audit totals.
The shortcut opens the target and moves keyboard focus, including in library
copies with a relative base URL. Print still includes the full review.

This updates the local renderer, not the portal application. Do not claim fresh
portal parity without the separate comparison described above. Follow the
[local review design](../../channel/references/local-review-design.md) for the
viewport and interaction regression checks.
