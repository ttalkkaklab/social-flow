# Blender bake — a mesh recipe rendered by Cycles into a frame sheet

The third way a `slide.object` gets its frames. The recipe is the one in
[mesh-objects.md](mesh-objects.md) — camera, nodes, states, groups, bindings, lighting —
and the slide side is the sheet contract of [rendered-object.md](rendered-object.md): a PNG
sheet, a sidecar, `h.object`. What changes is who draws the frames. The browser mesh lane
rasterises Three.js in headless Chrome, which runs WebGL on SwiftShader (a software
renderer: three directional lights, a 1024 shadow map, no bounce light, 1–3 fps capture).
`bake-blender.py` builds the same scene in Blender and path-traces every frame with Cycles —
soft area shadows on a shadow-catcher floor, bounced light, procedural surface grain — then writes
the sheet the slide already knows how to play. The slide, the checker and the renderer see a
baked object; nothing about the seek contract changes.

Measured on the zhuge-liang cart (2026-09-07, M4 Max 40-core GPU, 760×600 cell, 64 samples):
0.8–1.7 s a frame, a two-sentence cut of 292 frames in 9 minutes wall clock, and the slide
then captured at 6.3 fps against 1.1–2.6 fps for the same cut through the browser mesh lane.

## Contents

- [1. When to bake with Blender](#1-when-to-bake-with-blender)
- [2. The scene declaration](#2-the-scene-declaration)
- [3. Probe first, for this machine's minutes per cut](#3-probe-first-for-this-machines-minutes-per-cut)
- [4. Bake, author, rebake](#4-bake-author-rebake)
- [5. What the bake does with the recipe](#5-what-the-bake-does-with-the-recipe)
- [6. Traps](#6-traps)

## 1. When to bake with Blender

The two lanes trade opposite resources, so the machine decides as much as the shot does. Ask it:

```bash
python3 $REF/bake-blender.py --capacity      # no recipe needed
# blender lane — Cycles renders on METAL; run --probe on the recipe for this machine's seconds a
# frame, and render the slide with --jobs 4 so the decoded sheet (0.6 GB a tab) fits memory
# {"blender":"5.2.1 LTS","backend":"METAL","ramGB":137,"cores":16,"lane":"blender","jobs":4, …}
```

`lane` is one of three. **`mesh`** — Blender is absent, the installed Blender is older than 4.2 (the
report says `"tooOld": true`), or the machine has under 8 GB and cannot hold a decoded sheet beside
Chrome; use `renderer:"mesh"`. **`blender-unattended`** — Cycles has no GPU
backend, so a cut bakes at tens of seconds a frame; author on the mesh lane and leave the bake to an
unattended run. **`blender`** — a GPU backend is there; `jobs` is how many render tabs its memory
allows, and `--probe` on the actual recipe gives the minutes. What the choice trades:

| | browser mesh lane | Blender bake |
|---|---|---|
| when the work happens | every frame, at capture | once, before capture |
| processor | CPU — Chrome runs headless with `--disable-gpu` for determinism, so WebGL falls to SwiftShader | GPU for the bake (Metal · OptiX · CUDA · HIP · oneAPI), CPU only to assemble the sheet |
| capture rate (measured) | 1.1–2.6 fps | 6.3–6.9 fps |
| first pass, one two-sentence cut | about 5 min | 9–13 min bake plus about 1 min |
| re-render after a text edit | the same 5 min | about 1 min |
| re-render after a camera or pose edit | the same 5 min | the full bake again |
| memory | the GLB and the runtime in one tab | the decoded sheet, up to 0.64 GB in **every** render tab |
| disk per episode | none beyond the GLB | a 20–35 MB sheet per cut |

Then the shot decides:

- The subject is a physical thing whose material, light and contact carry the sentence — a
  cart that rolls, a lid that lifts, a stamp that lands — and the browser mesh lane's flat
  shadow and even light are what the review keeps flagging ("surface simpler than the
  background", "wheel contact weak").
- Blender resolves on this machine. `capability_status` lists it under `3d_generation` with the
  machine's cores and memory; without it the lane is unavailable — report that and stay on
  `renderer:"mesh"` only when the user chooses it. Never fall back silently
  (object-state-quality.md production gate).
- The cut is at most a few sentences. Frames per group are `fps × seconds`, all of them in
  one PNG, and the checker caps the sheet at 160 megapixels (§6). Long cuts stay on the
  browser lane or split.
- The look is still being found. Every camera or pose change costs a full rebake, so settle the
  staging with `--preview` single frames (a few seconds each) before committing to a bake.

It is not a way to render people. A doll character with an authored act belongs to the
character lane; an environment for a cut belongs to the still or the diorama plan.

## 2. The scene declaration

```js
slide: {
  kind: "diagram", motion: true, treatment: "editorial", role: "mechanism",
  quality: "object-state-v1",
  subject: { kind: "object", changes: [
    { group: 1, before: "sack above cart", after: "sack loaded", driver: "spatial" },
    { group: 2, before: "cart waiting", after: "loaded cart travels, wheels turning", driver: "spatial" }
  ]},
  object: {
    renderer: "blender",
    file:  "slides/assets/s4-supply.json",      // the mesh recipe (mesh-objects.md)
    sheet: "slides/assets/s4-supply-obj.png",   // the sheet the bake writes
    style: "illustration3d",
    engine: "cycles", samples: 64, fps: 30,
    plan: "① the sack settles into the bed · ② the loaded cart rolls left, wheels turning"
  },
  motionBeats: [{ group: 1, primitive: "object-move" }, { group: 2, primitive: "object-move" }]
}
```

| Field | Required | What |
|---|---|---|
| `renderer` | ✅ | `"blender"` |
| `file` | ✅ | the mesh recipe, `slides/assets/s<shot>-<slug>.json`, GLBs beside it — checked with the mesh lane's rules (`mesh-contract.js`, embedded uncompressed GLB) |
| `sheet` | ✅ | `slides/assets/s<shot>-<slug>.png` — the bake's `--out` plus `.png`; the sidecar is the same name with `.js` |
| `style` | ✅ | `illustration3d` or `photoreal3d`, equal to the recipe's |
| `engine` | ✅ | `cycles` — the only engine with a shadow catcher on a transparent film |
| `samples` · `fps` | ✅ | the bake arguments (8–1024 · 15/24/30); the sidecar records them and `check-slide.js` compares |
| `plan` | ✅ | what the object does on which sentence — the approval page reads this line |

`check-scenes.js` (through `slide-quality.js`) refuses a blender object without these, and
`check-slide.js` refuses a sheet whose sidecar came from a different recipe, engine, samples
or fps — the sidecar carries the recipe's SHA-256, so editing the recipe means rebaking.

## 3. Probe first, for this machine's minutes per cut

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references
python3 $REF/bake-blender.py --recipe slides/assets/s4-supply.json --probe --segs 1:4160,2:5523
# Blender 5.2.1 LTS · METAL Apple M4 Max (GPU - 40 cores) · 64 samples · 0.78s/frame · 291 frames ≈ 3.8 min …
# {"backend":"METAL", … "estimatedMinutes":3.8, "forecast":"…"}
```

The probe builds the scene, renders frame 0 twice and reports the second time as the steady
rate (the first render after an install compiles the Metal kernels once — 108 s measured —
and the probe prints that separately), then renders the motion's endpoint frames and prints
the fit line: the cell the crop will make, the sheet's megapixels against the cap, and
whether the ink touches a canvas edge (the object or its shadow would be clipped — enlarge
`--cell` or pull the camera back). Show the forecast line in the HITL that approves the
object plan, alongside the cost lines production-mode.md already shows: the bake is ₩0 but
it is minutes of the user's machine, and on a base M2 mini (10 GPU cores against 40) expect
roughly four times the M4 Max figure. Lower `--samples` (32 is fine for an illustration
style) before lowering `--fps`; the directive is subject motion at the capture rate.

A CPU-only machine renders too, at tens of seconds a frame — an overnight bake for
autoproduce, not an interactive one. The probe's `backend` says `CPU` when that is the case.

## 4. Bake, author, rebake

```bash
# storyboard stage — the recipe's durationMs plan (or --segs auto, the same thing)
python3 $REF/bake-blender.py --recipe slides/assets/s4-supply.json --out slides/assets/s4-supply-obj
# produce §3.6 — the measured narration lengths, one per group, like render-motion-slide --segs
python3 $REF/bake-blender.py --recipe slides/assets/s4-supply.json --out slides/assets/s4-supply-obj \
    --segs 1:4160,2:5523 --samples 64 --fps 30
# one frame to judge the look before a long bake (group 2 at 50%)
python3 $REF/bake-blender.py --recipe slides/assets/s4-supply.json --preview 2:0.5 --out .work/cart
```

Run from the storyboard directory. The bake prints the two lines the slide needs:

```html
<script src="assets/s4-supply-obj.js"></script>                      <!-- after scenes.js -->
h.object(1, "s4-supply-obj", { x: -7, y: 0, slot: true })              // inside renderSlide()
```

Authoring is rendered-object.md §4 — the id is the sheet's basename, `slot`/`x`/`y` place
the cell, the ink box must stay inside the zone. One addition since the sheet lane was
written: a group where the sheet keeps moving but the object neither enters nor recedes —
group 2 of the cart above — declares `object-move` in `motionBeats` as usual, and `h.object`
now emits an empty `data-primitive="object-move"` marker for it, so the renderer's declared
versus rendered primitive check passes without a decorative `out`.

Rebake whenever the narration is re-cut: frames per group follow `--segs`, and the runtime
stretches a group's range over the measured segment, so a sheet baked for 4.0 s under a
5.5 s sentence plays at 22 fps. The sidecar records `segs`; `check-slide.js` only checks the
group count against the narration, so the author reads the summary line.

Then render as any motion slide — `render-motion-slide.mjs … --segs … --sheet` — and inspect
the sheet frames and actual playback (random seeks, the group boundary) before the review.
A decoded 160 Mpx sheet is 640 MB in a Chrome tab; pass the `jobs` figure `--capacity` reports (2 on a 16 GB machine, 4 on 128 GB).

## 5. What the bake does with the recipe

- **Same pose at the same (group, progress).** `sample_recipe`, `pose_for`, the quintic
  `smoother` ease, `motionWindow`, Three.js's Euler-XYZ quaternion and its slerp are ported
  line for line and pinned by `--selftest` against values computed with three@0.180. The
  frame at the end of group k is the frame at the start of group k+1.
- **Axes.** Recipes are Y-up; Blender is Z-up. Positions go (x, y, z) → (x, −z, y), scales
  (x, z, y), quaternions (w, x, −z, y) — the glTF importer's own conversion, so a recipe pose
  and an imported GLB part share one frame. Imported parts keep their authored local
  transform as the baseline; an omitted pose field returns to it, as in the runtime.
- **Camera and lights.** Vertical FOV on a `VERTICAL` sensor fit, the same look-at. Key,
  fill and rim become sun lamps (the key with a 4° disc for soft edges and the only shadow),
  the room becomes a gradient world. The strengths are the recipe's `key`·`fill`·`rim`·
  `environment` times multipliers measured against the browser runtime's frame of the same
  recipe (lit-pixel mean 186·144·107 on the cart); `--light` scales all four, `--view`
  picks the transform (`Khronos PBR Neutral` keeps authored colours; `AgX`/`Filmic` are softer).
- **Floor.** A shadow-catcher plane at `floorY`; the shadow lands in the alpha channel and
  composites over the studio plate. `contactShadows` and `shadowOpacity` are the runtime's
  approximations and are ignored — Cycles traces the contact. The catcher also records the
  faint veil the object casts by blocking the room light, a few percent of alpha across the
  whole visible floor; `--shadow-floor` (0.06) cuts alpha below that and rescales the rest,
  so the crop hugs the real shadow instead of the canvas (measured: the cart's ink box went
  from the full 900×640 to 620×432 at the same frame).
- **The key's angular size.** `blender.keyAngle` (degrees, 0.05–20, default 4) sets how sharp a
  contact shadow reads — 4° is an overcast edge that blends two figures' shadows into one wash, and
  about 1° is a hard sun that gives each its own patch. It is a Blender-only hint like
  `blender.materials`; the browser lane ignores it.
- **Endpoints first.** The first and last frame of every group render before the rest; their
  ink union is the crop the bake will make, so a sheet over the cap or clipped at the canvas
  edge stops within seconds with the reason, and `--probe` reports the same fit line.
- **Materials.** Procedural parts get a Principled BSDF from `material`; `finish:"wood"` is a
  wave-texture grain with bump, `"linen"` a fine noise. GLB materials arrive through the glTF
  importer; `extras.socialFlowMicrorelief` becomes a bump from the base colour, as in the
  runtime. Animated `clips` are refused — pose the parts with `bindings`. A recipe may carry a
  Blender-only block, `"blender": {"materials": {"atlas-linen": {"saturation": 0.62, "value": 1.04}}}` —
  a hue/saturation/value node placed before the BSDF of every material whose name is the key, or the
  key with the `.001`-style suffix the glTF importer adds to duplicates. A key that matches nothing
  stops the bake rather than rendering an unchanged material. It exists because path-traced light
  shows a texture's true chroma where the browser lane's over-lit room washed it out, and
  slide-design.md §2 wants the object's saturation below the accent's (the cart's straw sacks
  measured S 0.42–0.50 against the accent's 0.47 before the override, 0.30 after). The browser
  lane ignores the block; a prefix that matches nothing stops the bake.
- **Sheet.** Every frame renders on the `--cell` canvas (760×600 default) with a transparent
  film; the cells are then cropped to the union of all frames' ink plus 8 px, so the sheet is
  as small as the motion allows. The sidecar's `crop` and `canvas` say where the cell sat.
- **Determinism.** Fixed seed, no animated seed, persistent data. The same machine reproduces
  the sheet within denoiser noise; the sheet file, not the bake, is the artefact of record.

## 6. Traps

- **The 160 Mpx cap.** `object-sheet.js` refuses a larger PNG; the bake stops before writing
  one and says so. Frames × cell pixels is the budget: 292 frames leave 548 K px a cell
  (about 900×600). Frame the camera tighter, raise the key light so the cast shadow is
  shorter (the union crop includes the whole shadow), or split the cut — before lowering fps.
- **Recipe edits invalidate the sheet.** `check-slide.js` compares the recipe's SHA-256 with
  the sidecar's. A camera nudge after the bake fails the slide until the rebake.
- **The first frame is not the rate.** Kernel compile on a fresh install (Metal 108 s measured)
  is one-time per machine; the probe's `firstFrameSeconds` shows it. Judge a bake by the
  steady figure and expect the real bake to run somewhat slower than the probe (1.65 s
  against 0.78 s on the cart — persistent data plus denoising on every frame).
- **Headless GPU.** Blender renders without a display, and Metal initialised inside this
  plugin's sandboxed shell on macOS 26 (measured). A restricted container without GPU access
  falls to CPU — read the probe's `backend` before planning a long bake.
- **GLB part names.** `bindings[].node` is matched against the imported object names, exact
  first, then the `.001`-suffixed duplicates Blender adds. A part the importer renamed
  stops the bake with `GLB node missing`.
- **A sheet still is not the clip frame, pixel for pixel.** `render-motion-slide.mjs` captures the
  `--sheet` PNGs clean and encodes the clips with film grain (`--grain`, default 6), so diffing a still
  against the matching video frame reports tens of thousands of changed pixels at a low threshold and
  none at a high one — measured 3,305 above 24 and 0 above 60 on the office cut, against 20,820 for a
  genuinely different pose. Compare stills with stills, or raise the threshold above 60.
- **Placement moved with the crop.** The bake's suggested `x` puts the ink's right edge at
  the zone's edge; a tighter camera changes the cell, so re-read the two printed lines after
  every bake instead of keeping the old `h.object` numbers.
