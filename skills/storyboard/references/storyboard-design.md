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
shell with the current template, and copies its four runtime helpers. It never
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
