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

A failed check means the episode's layout/runtime or library files have drifted, or
the library has a structural problem such as missing/unsupported storyboard HTML.
Identity and voice readiness warnings are printed separately as `Content readiness`
and do not fail this design check when the exported files match. They remain visible
in the library and in `exportChannel().warnings` and `contentWarnings`; they are not
a content pass. Standalone `review-library.js <channelDir> --check` still fails on
every warning, including incomplete legacy character identities and voices. Do not
invent structured identity data to make a shell check pass.

When the episode's layout/runtime has drifted from the bundled template, refresh,
inspect, and check again. Do not waive it because the episode
uses local files.

The shared generator is the only review renderer. Channel library copies use a relative base URL to the same episode assets.

The review uses a neutral palette, bundled Wanted Sans, a 240px desktop sidebar and
shot-first reading order. Below 1024px navigation moves above the document. Frames
and dialogue precede camera details; checks and costs stay reachable from the audit
shortcut. Print expands the review disclosures. Preserve all metadata, previews,
checks and event handlers when changing layout.

Character changes refresh `skills/channel/references/review-library.js <channelDir>`.
Follow [local review design](../../channel/references/local-review-design.md) for
shared assets, historical design provenance and viewport/interaction regression checks.
