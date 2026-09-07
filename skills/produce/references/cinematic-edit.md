# Continuous motion and deliberate cuts

Use `build-reel.sh <workdir> <storyboard-dir>` for delivery. It compiles the source edit
plan, renders live transitions and checks the resulting master. An episode-specific
FFmpeg concatenation script cannot substitute for this path. Diagnostic exports are
previews and must not be copied into the delivery queue.

## Plan the connection before generating clips

Choose each cut by the action and the audience's attention. A clean cut on an action,
eyeline or matched composition is often the natural connection. A dissolve fits a passage
of time or a gentler change of place. J-cut lets the next narration start while the previous
picture continues moving. Reserve dip for a chapter break; whip, iris and zoom need a
specific narrative or camera motivation. Do not cycle effects or assign `cut` to every
shot merely because production mode is full video.

For every new boundary, write `transition` and `edit.reason`. In `edit.continuity`, name
what carries across the join: subject position, gaze, motion direction, framing, light,
colour or a sound. Explain an intentional discontinuity. Match neighbouring source images
before generating video; an effect cannot repair a different face or inconsistent geography.
Inspect the outgoing action and incoming action together, not only the two clips separately.

```js
// Incoming shot. The source plan owns these values, not cards.tsv.
transition: 'jcut',
edit: {
  in: 0.2,
  pre: 0,
  post: 0.12,
  transitionSeconds: 0.24,
  reason: 'The next explanation begins while the cart finishes crossing the doorway.',
  continuity: 'Keep the cart moving left to right; the next view keeps the door on the right.'
}
```

`edit.in` selects the source-video start in seconds without moving narration or subtitles.
Use it to avoid an idle generated lead-in and choose the visible action that fits the line.
Do not use it on authored slide reveal groups or sync footage. `pre` and `post` control
added narration margins (0..2 seconds). Default pre is zero, post is 0.12 seconds; dip has
0.30 seconds of pre. Source-recorded breaths still count, so listen before adding a pause.
Sync footage retains its original timing and has no added margins. There is no default
four-second minimum. Short inserts can stay short.

Moving joins accept `transitionSeconds` from 0.08 to 0.8 seconds and must fit within one
third of the incoming card. Defaults: J-cut/whip 0.24, dissolve/iris/blur 0.40, push/zoom
0.32. These durations are rounded up to a whole output frame. Dip uses two 0.30-second
halves, shortened for short cards. Do not supply `transitionSeconds` on cut or dip.

Preview the source edit plan before assets with:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/produce/references/edit-plan.js storyboard/
```

## Reserve moving handles

The outgoing picture continues past its audio boundary by the next shot's join duration.
The renderer splits one continuous render into the displayed card and its **next unseen
frames**. It uses those frames during the incoming transition. It never replays the tail,
extracts a last-frame PNG or freezes a short source to make a handle.

A continuous source needs at least:

`edit.in + measured card duration + outgoing handle duration`

For example, a 5.12-second card with source in 0.20 and a following 0.40-second dissolve
needs at least 5.72 seconds of source video. Allow a frame of rounding margin. Include the
handle in the generation-duration choice and approved cost quote before generating anything.
If an existing clip is too short, choose a better trim, replan narration/cut length or quote
a longer generation. Never silently substitute a cut, loop, still, slowdown or freeze.
For authored animation, capture enough continuously moving frames in the final reveal group.

The incoming picture plays underneath the outgoing handle. Its opening is partly hidden
(and completely hidden for J-cut). Place essential new action after the join, use an earlier
source in-point or choose a cut when the first frame must be seen. This preserves the audio
clock, subtitle cues and full episode duration without pretending every visual onset is audible.
Sync footage requires cut/dip; a moving handle with separate narration needs a separately
planned silent source, not a lip-synced shot treated as silent B-roll.

## Assembly and verification

Keep source audio, zoom and media references in `cards.tsv` and `segs.tsv`. `enter` and `exit`
may be omitted: `verify-build-plan.js` writes `cards.resolved.tsv` and `edit-plan.json` from
`scenes.js`, including both halves of a dip and each predecessor's handle. If supplied options
contradict the source plan, assembly stops. Change `scenes.js` deliberately instead of editing
the resolved file. This applies to every production mode.

The builder writes `work/edit-timeline.tsv` with card frame counts and applied joins.
`verify-assembled.js` checks the compiled plan and samples the clean master's actual boundary
frames against the rendered cards. Missing proofs, ignored transitions and replaced outputs
block the checked delivery path. `speedup.sh` writes `delivery-proof.json` for the final file
set; copy it into `output/video/` with the video and subtitles. `episode-state.js` blocks an
unpublished episode with a missing/stale proof or a storyboard changed after assembly. `edit-check.json` records the checks and flags handles with
little visible motion for inspection; it does not claim aesthetic approval.

Watch every file in `work/seams/`, which contains the final master's boundary excerpts with
sound. Also watch the entire final clean and subtitled exports at normal speed. Record in
`edit-review.md` the master hash, boundaries inspected, observed action continuity, voice
spacing, visible defects and their resolution. Check:

- Motion continues through the boundary without a stop, reversal or repeated action.
- The outgoing task reaches the intended cut point; the incoming action is not hidden.
- Faces, geography, gaze and motion direction remain understandable.
- Lighting, colour and shot size change deliberately; no accidental flash or black frame.
- Narration flows across related shots and breathes at actual thought or chapter boundaries.
- Subtitles follow the voice, and music or effects support the cut without masking words.

If a join feels wrong, fix the source trim, neighbouring composition or timing first. Rebuild
and review the same boundary. More effects are not a substitute for an intelligible edit.
