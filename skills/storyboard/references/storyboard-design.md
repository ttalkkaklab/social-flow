# Local storyboard review design

Use [storyboard-html-template.html](storyboard-html-template.html) for every review. It is
the one storyboard design (user directive, 2026-10-31). Change the design in the bundled
template, never in an episode or library copy.
Edit only `<title>` and the marked `SB_DOC` metadata block. Scene data stays in
`scenes.js`. Episode art style and `THEME` describe the video, not a custom review UI.

Create or refresh the review with the bundled script:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/storyboard/references/storyboard-html.js" "<episodeDir>/storyboard"
```

When revising an existing board, apply the scene changes with `storyboard_apply` and read the
saved SHA with `storyboard_read`. Use the installed plugin's [document revision command](revise-story-documents.js)
before refreshing the HTML. Run `node "$CLAUDE_PLUGIN_ROOT/skills/storyboard/references/revise-story-documents.js" "<episodeDir>/storyboard" request.json`.
The request has an `expectedStoryboardSha256` and a `documents` array. Each entry takes a `name`
(`scenario.md`, `storyboard.md`, `script.md` or `review-localization.json`), its current
`expectedSha256` (or `null` for a new document), and the full authored UTF-8 `content` as a string.
Pass `-` for standard input or append `--dry-run` to preview. The receipt records the plugin version,
board SHA and each file's before and after hashes. Repeating the same request preserves completed edits.

When a companion document cites a still as the evidence for a reveal or response, resolve
the active frame from its shot or scene and open that same image from the exported page.
Check the visible cue in the chosen version. Label a previous take explicitly when showing
it for comparison. A newer attachment can leave an older, working image link in the prose.

Refresh preserves the title and metadata and copies the current runtime, CSS and
bundled fonts and licenses. Fill the metadata after first creation, then refresh the library copy.
To see whether a copy drifted from the bundled template, run:

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

The shared generator is the only review renderer, including content-plan HTML.
Prepare [asset sheets](asset-sheets.md) before shot authoring. The review displays canonical
`SB_DOC.props` with custody/history and `SB_DOC.locations` with layout, lighting, invariants,
reference images and shot links. `visual.locationId` links a shot to its planning sheet;
Blender's `visual.location` remains a separate production binding. An absent sheet displays
as missing; `SB_DOC.assetSheetNotes` supplies explicit not-applicable reasons. Channel library copies use a relative base URL to the same episode assets.

The review uses a light Liquid Glass navigation layer, bundled Inter/Pretendard/
regional Noto Sans, a 240px desktop navigation column and
shot-first reading order. Below 1024px navigation moves above the document. Frames
and dialogue precede camera details; checks and costs stay reachable from the audit
shortcut. Print expands the review disclosures. Preserve all metadata, previews,
checks and event handlers when changing layout.

Each spoken line shows its speaker's profile image and name, delivery label, and speech
bubble in the existing reveal order. Prefer the explicit face panel, then an existing channel
face image, then the production cast image; a missing image shows the speaker's initial.
An absent speaker is displayed as unassigned unless a legacy narrator was explicitly set.
Keep spoken wording, alternate subtitle wording and optional `deliveryReason` visible.
Narrator-only explainers are supported; drama distinguishes on-screen dialogue from
purposeful off-screen lines. Silent shots show “No dialogue”. These are review elements,
not overlays burned onto the video. Refresh existing boards with the same generator.

Character changes refresh `skills/channel/references/review-library.js <channelDir>`.
Follow [local review design](../../channel/references/local-review-design.md) for
shared assets, historical design provenance and viewport/interaction regression checks.

Typography is independent of the UI language picker: set `SB_DOC.contentLanguage`
to `ko`, `en`, `ja`, `zh-Hans`, `zh-Hant`, `vi`, `de`, `fr` or `es`. Optional
`SB_DOC.shotLanguages` maps one-based shot numbers to language overrides. Preserve
explicit region tags for Han text; glyph shape cannot identify its language reliably.
Font selection covers the review and its inline frame approximation, not embedded
HTML slide documents or the final video renderer.
