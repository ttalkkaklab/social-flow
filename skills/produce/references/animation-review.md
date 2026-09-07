# An animation review collection built by the plugin

Use this path when the user asks for samples of each treatment. It is a review collection of
independent cuts; it does not replace the approval, story and hook checks of a publishable
episode. Record it as `awaiting-user-review` until the user gives feedback. Never attach a
polish score or a completion verdict on your own.

## Storyboard

Apply the per-purpose criteria in [illustrated-scenes.md](../../storyboard/references/illustrated-scenes.md).
The collection has three lanes of its own: `still_camera` for people and mood,
`character_explanation` for an explanation a person acts out, and `object_explanation` when
objects alone explain it. Physical objects in explanation cuts are real meshes.

Images come from the tool the host and the user chose. In Codex use the built-in image tool,
which can also take an already approved image as input. Never switch to a separately billed
API.

```bash
node "$PLUGIN/skills/storyboard/references/plan-animation-review.mjs" \
  --out "$EPISODE/storyboard/animation-review.json" \
  --images "$PORTRAIT_A" "$PORTRAIT_B" "$PORTRAIT_C"
```

The planner writes a default collection of 3 camera cuts, 3 character explanation cuts and 3
object explanation cuts. The generated JSON's titles, on-screen sentences, intents, lengths
and images can be edited to fit the topic. The check contract is
`animation-review-contract.cjs`; it rejects a template outside its lane and a missing asset.

## Production

```bash
node "$PLUGIN/skills/produce/references/build-animation-review.mjs" \
  "$EPISODE/storyboard/animation-review.json" --out "$DELIVERY" --posters
```

`$PLUGIN` is the installed path that carries your changes. The builder takes only the JSON and
writes the HTML from its bundled templates. Do not slip in a separate model script from the
episode folder or a hand-edited delivery HTML. Fix a recurring defect in the plugin source and
rerun the same input.

- Camera: choose focus-in, rack focus, approach, pull, foreground reveal or depth parallax
  from the cut's purpose. Never bend the pixels of a face or a hand.
- Character: moving a piece, stamping a document, pulling a cart. Move elbow, hand and foot
  joints and keep the hand's contact.
- Object: meshing gears, a fixed pulley, a toolbox hinge. Use the real shape and the joints
  between parts.
- Emphasis: character cuts carry no marks by default. Object cuts mark one part at a time,
  briefly, with a light line backing and a dark leader line that separate from the background.

`purpose` maps to camera templates as `introduce → focus-in`, `inspect → rack-focus`,
`detail → approach`, `context → pull`, `discovery → reveal`, `depth → parallax`. Choose by the
actual content and assets of the cut. `focusFrom` and `focusTo` are normalized `[x,y,rx,ry]`
coordinates in the source picture. Focus effects are simulated with a soft region mask; they
do not recover real depth. `reveal` and `parallax` need same-size transparent PNG
`layers:[{image,depth}]` and a background filled in behind them. Without layers, raise an
error; do not substitute another treatment on your own.

Object marks are written as `annotations:[{target,text,reason,start,end}]`. `target` is the
template's part number 0 or 1; times are in seconds. Windows do not overlap and each lasts at
most 45% of the cut. Nothing is shown when unspecified, and marks are never generated from
the older `labels` alone.

These templates are procedurally built 3D mesh illustrations. Do not label them generated GLB,
skeletal rigs or photoreal models. A large character action or a new device needs its own
model asset and motion contract. Do not describe a silent review as narrated.

## Verification and delivery

The builder writes capture HTML and the renderer API together under `slides/`. Capture the
opening, middle and end with the installed `render-motion-slide.mjs`. Check actual playback,
pause, random seeks and the phone view with `ego lite`. Page capture uses the plugin's headless
path only. The 9 individual HTML files include their assets and play without the internet; the
index references the posters in the same folder.

`build-record.json` holds the executed installation path, the SHA-256 of inputs and runtime,
and the list of outputs. The record confirms the production path; visual quality is judged
separately, and unverified items are listed separately.
