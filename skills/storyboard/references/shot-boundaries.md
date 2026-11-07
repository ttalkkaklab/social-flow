# Decide a cut from the complete scene

Run this authoring pass after `shot_dialogue` and again after camera/blocking or timing
changes, before new shot images. It is part of writing, not a separate reviewer call,
approval, score or execution gate. Requested `review-camera` adds an independent review.

## Compare the uninterrupted performance first

1. Read each complete scene's ordered speech and physical actions without its proposed
   shot breaks. Mark the discovery, decision or consequence that changes attention.
2. Call `storyboard_read` and use `boundaryReview.shots` and `boundaries` in **playback**
   order. It includes every join, not just suspected mistakes. `no` is a storage locator,
   not a stable id; use `id` for edits and `playbackPosition` for order. Missing or duplicate
   ids must be resolved before an id-addressed change. Review silent actions and readable
   two-person exchanges too; a change of speaker is not automatically a cut.
3. For each join compare three options: hold the current frame, motivate a move/reframe,
   or cut. Choose the simplest option that carries the whole performance. Do not replace
   every cut with a complicated camera move. State what the viewer must see that the
   current frame cannot convey, or the time/place change or verified generation limit.
   Check [dialogue coverage](dialogue-coverage.md): a fixed OTS with only one readable
   speaking face may need a reverse for the other speaker; never force a two-shot or
   relabel a visible hidden-mouth speaker as offscreen merely to reduce cuts.
   A glance, pause, new sentence or hand movement alone is insufficient. Intentional
   reaction shots, reveals, POVs and spatial clarification can earn a cut even with the
   same speaker and framing.
4. Set a concrete reason through `shot_icons.next` on the outgoing shot. The tool stores
   that incoming transition and its `edit.reason` on the **following** shot. “Continue the
   action”, “change attention” and a repeated camera adjective do not explain a boundary.
   For inserted b-roll/outro, `incoming:null` means inspect the splice/edit plan; do not
   borrow an unrelated raw-array join. No hint is a verdict or a reason to delete a cut.
5. Estimate the resulting whole performance, overlapping simultaneous speech/actions and
   allowing independent handling, travel and reactions. Check its selected `videoTiming`
   route after the revision. Per-shot `fits` values do not establish a merged shot fits.
   Unknown timing/limits stay unknown; fetch the actual adapter limits before generating.
   If capacity requires splitting, make the fewest motivated divisions without truncating
   speech, changing fps/model, or moving a necessary visible event offscreen just to fit.

`boundaryReview.version` is `shot-boundaries-v1`; its status is always `not_reviewed`.
Continuing speakers, repeated casts, silent actions and repeated reasons are factual review
prompts, not “merge candidates” certified by code. Camera, focus, depth, blocking and eyeline
may distinguish two otherwise similar setups. Missing fields are unknown, not matching.
The output does not measure performance, inspect images or mutate the board.
If this field or `videoTiming` is absent, the running MCP server lacks this workflow.
Check the active plugin/server installation and reconnect after updating. Do not assume
updated skill files updated an already-running server, hardcode an older bundle path, or
invent the missing report. A manual scene comparison can continue; report unavailable
capacity evidence honestly.

## Preserve the performance when changing boundaries

Use existing `storyboard_apply.shotsById` with `removeShotIds` in one patch for a merge;
retain a surviving stable id. Each `shotsById` entry replaces a whole shot, not selected
fields: start from `storyboard_read` full/raw shot objects, modify copies, and include
every retained field. Never submit a summary-only or partial visual replacement.
Use story tools for added shot stories, then characters,
lines and icons. Keep the original source assets; editing metadata is not media approval.
Before and after, compare:

- Every line id, exact text, order, speaker and acting. Keep delivery unless a deliberate
  framing choice changes it; explain offscreen staging and preserve audible presence.
- Ordered performance beats, their 1-based dialogue groups and `withGroup` references.
  Renumber groups against the merged narration, remove repeated anticipation/settling,
  and recalculate estimates instead of summing separately padded source clips.
- Opening pose, contact hands, prop custody and final pose. Reconcile `visual.action`,
  `camera.view/end`, `shot.videoDesign`, per-line acting and performance actions; updating
  only one field can retain a contradictory old instruction.
- The surviving shot's cast, view, references, scene membership, prop ledger, eyeline
  targets and other inbound links to removed ids. A two-character reference limit is not
  a reason to omit a third person's essential visible action. Reblock or keep necessary
  coverage; use offscreen speech only when the scene supports it.
- Outer joins into/out of the new shot; reassess them after removal, not just internal
  joins. Invalidate stale image/prompt/clip evidence and retain the actual approval state.
  Reusing the opening image requires that it still matches the new opening, not merely
  that its file exists. Do not run media generation as part of a read-only review.

Read the revised whole scene once more. A boundary reduction is not a quality score;
keep a cut when its removal loses information, geography, performance or feasible timing.

## Adversarial cases

| Case | Expected decision and evidence |
| --- | --- |
| One student introduces a report, then announces entry in the same locked camera | One performance through the head turn; cut when the newly noticed person is shown. |
| Refusing a question, then stating a condition, same speaker and listener | Keep the complete answer unless the next view reveals evidence the current frame cannot. |
| Boss confirms identity, grants permission and sends regards | One sustained performance can include pauses and departure; do not allocate a shot to each clause. |
| Two people exchange several lines in a readable two-shot | Keep responses together; changed speakers alone do not justify cuts. |
| Same face/size but an offscreen sound changes its meaning | Keep an earned reaction cut when timing/viewpoint supports it; matching metadata does not mandate merging. |
| Block then counterattack, adjacent silent beats | Prefer continuous readable action; keep an insert/reverse only for a concrete contact or geography need. |
| Opposing OTS views have identical size and cast | Compare viewer/subject, axis, reveal and reaction; size/cast equality does not mean the same frame. |
| Explicit time jump at the same location and with the same cast | Retain the time transition; do not merge on repeated identity. |
| Continuous performance exceeds the selected adapter limit | Recompute overlapping action timing, then split only as much as actual capacity requires; retain line order and ends. |
| Several short shots each fit, proposed merge has unknown timing | No merged-fit claim from adding separate `fits` results. |
| Missing scene, cast, framing or timing | Read original scene and supply missing evidence; do not treat nulls as equality or a pass. |
| B-roll inserted between two stored dialogue shots | Inspect actual three-way playback and audio timing; those dialogue shots are not adjacent. |
| Merged speech while retained performance repeats a nod or points to old group 1 | Repair performance/group links and reread the scene before making images. |
