# Prop sheets and story continuity

## Contents

- [Authoring](#authoring)
- [Contract version 1](#contract-version-1)
- [Production and review](#production-and-review)

Store the canonical sheet in `scenes.js` under `window.SB_DOC`. The review renderer
merges that metadata over the HTML's editorial defaults. Never keep two editable
copies of a prop sheet. Existing boards without props are unchanged.

## Authoring

Use `storyboard_read` to get `sha256` and the current `propSheet`, then
`storyboard_apply` with `expectedSha256` and `propSheet: {props, continuity}`.
This replaces the complete sheet atomically, preserves other SB_DOC fields,
validates the ledger and all shot links, and removes the old approval comment.
For existing boards, it backs up the original scenes.js under
`storyboard/.prop-history/<sha256>.js`. These are local episode artifacts, not Git files.
Read before writing; a stale hash fails. `dryRun:true` validates without writing.
Use companion `shotsById` edits when adding/removing appearances in the same change.
Use `globals.SB_DOC` to register characters; retain its existing editorial fields.

The standalone CLI ships without npm dependencies:

```sh
node skills/storyboard/references/prop-sheet-cli.js /absolute/storyboard
node skills/storyboard/references/prop-sheet-cli.js /absolute/storyboard --at 1:2 --character b
node skills/storyboard/references/prop-sheet-cli.js /absolute/storyboard --shot 1
node skills/storyboard/references/prop-sheet-cli.js /absolute/storyboard --apply /absolute/prop-sheet.json --expected-sha256 HASH_FROM_READ
```

The edit JSON is `{props: [...], continuity: {...}}`; the review's export button
produces this shape. The browser view is read-only: ask the agent to edit with MCP,
or edit the exported JSON and apply with the CLI. Refresh with `storyboard-html.js`
after saving. Do not imply that a download saved the storyboard.

## Contract version 1

`props[]`: stable `id`, optional `name`, `description`, `imageUrl`,
`appearanceVersion`, `references: [{path,version,condition?}]`, and
`tracking: appearance | continuity`. A physical duplicate has another id; damaged
and intact references of the same object share its id. `characterId` is legacy
ownership only; it never proves custody. Missing history stays unknown.

`continuity` becomes `SB_DOC.propContinuity`:

```json
{
  "version": 1,
  "timelineId": "story-main",
  "initial": [{
    "propId": "watch", "at": {"day": 1, "order": 0},
    "state": {"ownerId": "a", "holderId": "a", "location": "pocket", "condition": "intact"}
  }],
  "events": [{
    "id": "loan-1", "propId": "watch", "kind": "lend",
    "at": {"day": 1, "order": 2},
    "from": {"holderId": "a", "location": "pocket"},
    "to": {"holderId": "b", "location": "right hand"},
    "shotIds": ["s0001"], "reason": "A lends the watch to B",
    "recordedAt": "2026-10-16T00:00:00Z", "recordedBy": "author"
  }]
}
```

Every owner/holder references `SB_DOC.characters[].id`, or is `null` (none) or
`"unknown"`. Location and condition are text, null or "unknown". Reserve "unknown"
for unknown values, not a character id. Initial states precede all events.
`day` and `order` are nonnegative integers; they describe fictional story time,
never shot position, playback seconds or the edit timestamp. Events at a point
are effective inclusively. Shot start/end points query the state after that point.
Use a distinct order for the starting state before an on-screen transfer.

Event kinds: transfer, lend, return, pick_up, put_down, lose, damage, repair, move,
correct. `from` asserts every changed field against the preceding state. `to`
changes them in one transaction. Only transfer/correct can change ownership;
only damage/repair/correct can change condition. Damage and repair change condition only.
Loans/returns need a known sender and a different recipient; every custody change
updates location. Pick-up starts with no known holder. No-op events are rejected. Put-down requires holder=null
and a known location; loss requires unknown holder and location and keeps owner.
Corrections need a reason and author like every other event. Distinct events for
the same prop cannot share a story point. A replay refers to the original event
with another shot id, never a second transfer.

`visual.props` retains the registered ids. Every continuity-tracked appearance
also has `visual.propUsage: [{propId,start:{day,order},end:{day,order},visible?,position?,expectedStart?,expectedEnd?}]`.
The expected states are optional assertions, not another source of truth. Hidden
props stay in the ledger but do not enter image prompts. Appearance-only props
need no event log. Use separate timelineIds for alternate stories; never implicitly
join episodes in playback order. To continue an episode, explicitly copy the
reviewed ending states into the next initial states and record the source revision
in editorial metadata. Automatic cross-episode propagation is not enabled.

## Production and review

The shared `prop-continuity.js` validates MCP writes, `check-scenes.js`
and prompt generation. It computes snapshots without mutating input.
`check` warns about a registered prop that no shot links (`visual.props`,
`frames.endProps` or an event's `shotIds`): link it to its shots, or drop it if the
story does not need it.

`shot_image` reads the same snapshot for the props a frame shows. A prop hidden in
the shot (`visible:false`) stays out of the picture. Each other prop sends one
picture: the start image takes the reference drawn in the condition the prop has
when the shot opens, the end image the one for its closing state. A reference whose
`condition` matches comes before one without a condition, and one of the current
`appearanceVersion` before an older one. When none fits, `imageUrl` stands in, else
a reference of the current version; a known condition without its own reference is
warned about. The prop's `Image N` line carries its English description, holder,
location, condition and screen position; fields in another script stay out with a
warning. A prop without any picture is described in the prompt and warned about.
Ledger errors never stop the frame (`snapshot(..., {lenient:true})`): each prop is
checked on its own slice — its sheet entry, its initial state and events, and its
usage in this shot. A prop whose slice has errors, or whose ledger is malformed,
goes in without a state and with a warning naming them; the other props keep
their states whatever else on the board is broken.

The ordinary still assembler and spatial assembler include per-shot prop states;
source image arguments include prop reference images (`--json` on the ordinary
still CLI exports its snapshot and image arguments), with the same reference order.
Appearance-only props also carry description, version and references,
without a custody claim. Save `propSnapshot`
with generated asset records: it pins the appearance version, reference paths,
story points and before/after state. A snapshot is a plan, not visual verification.
Inspect the generated image/clip for matching object, holder, hand and condition.

The storyboard has a prop section, story-time and character selectors, per-prop
history, shot links and per-shot start/end states. `none` and `unknown` are distinct.
It uses the shared review stylesheet, works offline and prints expanded histories.
