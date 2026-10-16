# Local storyboard review design

Use [storyboard-html-template.html](storyboard-html-template.html) for every review.
Edit only `<title>` and the marked `SB_DOC` metadata block. Scene data stays in
`scenes.js`. Episode art style and `THEME` describe the video, not a custom review UI.

Create or refresh the review with the bundled script:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/storyboard/references/storyboard-html.js" "<episodeDir>/storyboard"
```

Refresh preserves the title and metadata and copies the current runtime, CSS and
bundled font. Fill the metadata after first creation, then refresh the library copy.
Before delivery, run:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/storyboard/references/storyboard-html.js" "<episodeDir>/storyboard" --check
```

If the template check fails, refresh, inspect and check again. The shared generator
is the only review renderer. It also exports the channel library, whose storyboard
copies use a relative base URL to the same episode assets.

The review uses a neutral palette, bundled Wanted Sans, a 240px desktop sidebar and
shot-first reading order. Below 1024px navigation moves above the document. Frames
and dialogue precede camera details; checks and costs stay reachable from the audit
shortcut. Print expands the review disclosures. Preserve all metadata, previews,
checks and event handlers when changing layout.

Character changes refresh `skills/channel/references/review-library.js <channelDir>`.
Follow [local review design](../../channel/references/local-review-design.md) for
shared assets, historical design provenance and viewport/interaction regression checks.
