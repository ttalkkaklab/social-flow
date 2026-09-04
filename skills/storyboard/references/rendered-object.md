# Rendered object — a baked 3D object on a studio slide

The lane that answers "what stands in the space" on an editorial slide. The type and the
plates stay CSS — crisp, free to re-author per episode — and the one thing that has to look
like a thing is not drawn but **rendered**: `bake-object.py` shoots rays at a signed-distance
shape, one point light, soft shadows, self-shadowed surface detail, a fired-clay grain, and a
hand-made rim, and writes every frame of the object's movement into one PNG sheet. The
slide plays that sheet back by moving `background-position`, so the frame at any (group,
time) is one number and the seek contract holds unchanged.

Where it comes from: the 2026-09-04 object-slide pass
(`docs/research/2026-09-04-rendered-object-slide/`). Three earlier attempts were measured
against each other — a vector "3D" illustration (no material), a generated image per group
(material, but $0.20 a group and coordinates re-measured every episode), and a studio plate
with lit slabs and type (right, but with nothing standing in the space). The rendered object is
the fourth: the studio plate kept, plus an object that is a render.

## Contents

- [1. When a scene gets a rendered object](#1-when-a-scene-gets-a-rendered-object)
- [2. Writing the scene (`slide.object`)](#2-writing-the-scene-slideobject)
- [3. Baking the sheet](#3-baking-the-sheet)
- [4. Authoring the slide](#4-authoring-the-slide)
- [5. What the runtime does with it](#5-what-the-runtime-does-with-it)
- [6. Traps](#6-traps)

## 1. When a scene gets a rendered object

- The sentence is about a **thing** whose state changes as the narration goes — a disc that
  gets stamped, a vessel that fills, a part that turns to face the camera — and the change
  *is* the value being spoken. The object's frames are the sustain layer for that sentence.
- The thing is a generic shape, not a specific artefact. A clay disc, a tablet, a coin, a
  block are shapes; the actual Phaistos Disc, a named person, a real building are not — those
  go to the footage lane (`footage-lane.md`), which was measured to carry material at $0.20 a
  group. `bake-object.py` ships one shape (`disc`, a rounded cylinder with an irregular rim);
  a new shape is one SDF function added to its `SHAPES` table, and the light rig, the camera,
  the wall-shadow compositing and the sheet contract are reused as they are.
- Cost is zero per episode. The bake is CPU work — a 72-frame sheet takes about five minutes
  on an M4 (5 s a frame at 760×600 with 2× supersampling).

A scene that only needs a number, a comparison or a verdict does not get an object. A frame
that turns a shape for the viewer to admire is decoration (slide-design.md §5) and fails the
motion axis exactly as a spinning icon would.

## 2. Writing the scene (`slide.object`)

`visual.slide` gains one field. Everything else on the slide scene is as in scenes-schema
§slide scenes — `treatment:"editorial"`, `role`, `motif`, `labels`, `motionBeats`.

```js
slide: {
  file: "slides/s5-disc.html",
  kind: "diagram", motion: true, treatment: "editorial",
  role: "statistic", motif: "clay disc",
  plan: "① the disc enters lying 26° back · ② 45 counts while stamps press in from the rim · ③ the spiral fills to 241 · ④ the disc recedes under the question band",
  motionBeats: [
    { group: 1, primitive: "object-move" }, { group: 2, primitive: "count-up" },
    { group: 3, primitive: "count-up" },    { group: 4, primitive: "object-move" }
  ],
  object: {
    file: "slides/assets/s5-obj.png",           // the sheet the bake writes
    shape: "disc",
    keys: "-21,26,0 -17,22,0 -10,19,45 -4,16.5,241 -1,16,241",   // start + one per group: yaw°, tilt°, stamp count
    frames: "1:11 2:27 3:19 4:14",              // new frames per group
    plan: "a 26° reclined disc rises to face the camera while 45, then 241 stamps press in from the rim inward"
  },
  labels: ["기원전 1700년", "도장", "자국", "이런 원반이 몇 장?", "NatGeo · World History"]
}
```

| Field | Required | What |
|---|---|---|
| `object.file` | ✅ | `slides/assets/s<shot>-<slug>.png` — the sheet. PNG only: `check-slide.js` blocks `.webp` by extension because a static and an animated webp look the same to a source scan |
| `object.shape` | ✅ | a name in `bake-object.py`'s `SHAPES` (`disc`) |
| `object.keys` · `object.frames` | ✅ | the bake arguments, kept here so the sheet is reproducible from scenes.js alone. `keys` is N+1 keyframes (the start state, then the state at the end of each group); `frames` is how many new frames each group gets |
| `object.plan` | ✅ | what the object does on which sentence — the approval screen reads this line |

`check-scenes.js` requires file, shape, keys and frames, and refuses more `frames` groups than
narration segments. `object-move` is the `motionBeats` primitive for a group whose meaning is
the object arriving, turning or receding; a group where the object changes under a count-up
declares the count-up, and the object follows.

## 3. Baking the sheet

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references
python3 $REF/bake-object.py --shape disc --out slides/assets/s5-obj \
    --keys "-21,26,0 -17,22,0 -10,19,45 -4,16.5,241 -1,16,241" --frames "1:11 2:27 3:19 4:14"
python3 $REF/bake-object.py --shape disc --preview -10 45 --tilt 19 --out .work/obj   # one frame, 5 s
```

Run from the storyboard directory. Needs `numpy` and `Pillow` — if `python3 -c 'import numpy, PIL'`
fails, `pip install numpy pillow`. The bake writes three files next to each other:

| File | What |
|---|---|
| `<out>.png` | the sheet — cells of 760×600 in 9 columns, one frame per cell, the wall shadow as alpha only. 72 frames is 6840×4800 and about 17 MB |
| `<out>.js` | the sidecar: `window.SLIDE_OBJECTS["s5-obj"] = { file, cell, cols, n, ranges, ink, … }`. The slide reads it with `<script src>`; `check-slide.js` reads it with `require`. Never edited by hand |
| `<out>-preview.png` | the last frame on an ink ground — open it before authoring, it is the object you are placing |

**Keys.** Each key is `yaw,tilt,count` in degrees, degrees and stamps. Yaw and tilt ease
between keys (smoothstep); the count is linear, so a stamp lands at even intervals. The
fixture's five keys read: the disc enters turned 21° away and reclined 26°, settles a little
during the first sentence, faces the camera by 10° and 19° while 45 stamps press in, comes
to 4° and 16.5° while the spiral fills to 241, and rests at 1° and 16° — 16° is where the
lower rim shows its thickness, the tell that this is a thing and not a picture of one.

**Frames.** Boundary frames are shared: with `1:11 2:27` group 1 plays frames 0–11 and group 2
plays 11–38, so the cut between clips lands on the same picture (the state rule). Frame counts
set the step rate: the runtime spreads a group's range over its segment, so 27 frames under a
5-second sentence is 5.4 steps a second at 0.3° a step — turning reads as continuous, and a
stamp landing is a step by nature. Fewer than about 10 frames under a long sentence reads as
a slideshow; more than 40 in a group buys nothing you can see and costs bake time and sheet
size.

**The ink box.** The sidecar's `ink` is the bounding box, over every frame, of pixels with any
alpha — the disc *and* its wall shadow, which reaches 226 px past the rim while the disc is
reclined (the first key). `check-slide.js`
uses it to keep the object inside the zone, because the penumbra is invisible until it is
measured: the first placement of the fixture put ink at x 932 with the zone ending at 904.

**The bake is deterministic.** Running the fixture command a second time produced a sheet that
`cmp` found byte-identical to the first and a sidecar with `"file": "assets/s5-obj.png"`
(2026-09-04), so a lost `slides/assets/` is rebuilt from scenes.js alone — nothing in it needs
to be kept by hand.

## 4. Authoring the slide

Authoring is the ordinary slide procedure (`slide-authoring.md`) with three lines added.

1. Read the sidecar after scenes.js — the bake prints this line:
   ```html
   <script src="../scenes.js"></script>
   <script src="assets/s5-obj.js"></script>
   ```
2. Sit the object in `renderSlide()`:
   ```js
   h.stage("spread");
   let out = h.tag(1, h.L(0)) + h.title(1, S.title, { lead: 1 });
   const card = h.plate(2, h.count(2, 45, { cls: "mid", sv: true }) +
     h.rv(2, '<div class="hero-sub">' + h.L(1) + "</div>", { fx: "mask", lead: 1 }));
   out += h.object(1, "s5-obj", { x: -10, y: -14, slot: 486, out: 4, html: card, aside: "top:193px;width:240px" });
   out += h.mark.route(2, [[400, 690], [438, 654], [490, 570]], { pen: true, lead: 9, head: 50, deg: 25 });
   out += h.count(3, 241, { unit: h.L(2), sv: true });
   out += h.band(4, h.L(3));
   out += h.foot(0, h.L(4), { corner: true });
   ```
   `h.object(rg, id, o)` — `rg` is the group the object enters in (a 720 ms rise from 42 px
   below); `id` is the sheet name; `out` is the group it recedes in (12 px up, 5% smaller,
   for the length of that segment). `slot:true` reserves the cell's height in the stage flow
   and `slot:<px>` a shorter slot when the ink is shorter than the cell (the disc's ink is
   515 px tall in a 600 px cell); `x`·`y` are then offsets inside the slot. Without `slot` the
   object is absolute at `x`·`y` from the zone's top-left and the author manages overlap.
   `html` puts an aside — the value card — at the slot's top-left, `aside` is its inline
   style. The entry and exit wrappers carry `data-primitive="object-move"`.
3. Bake before `check-slide.js` — it wants the sheet, the sidecar, the `<script>` include, the
   `h.object` call with the sheet's id, and the ink box inside the zone (horizontal when a slot
   is used, both axes when the object is absolute). Then render the sheet as usual; the
   renderer's `__ready()` decodes the whole PNG before the first capture.

Composition notes, all measured on the fixture:

- The stage is a flex column with a 40 px gap. Tag, title, a 486 px slot, a 260 px hero and a
  band already spend 1145 of the zone's 1160 px, so the source line goes to the top-right
  corner (`h.foot(0, …, { corner: true })` — still group 0, still small and muted). In the flow
  it overflowed the zone by 58 px.
- The aside card is a `.plate`; in studio mode every plate carries the slab material, so a
  value card overlapping the object's rim reads as a thing in front of a thing.
- Marks over a studio slide use `pen:true` — a tapering fill stroke with an open chevron head,
  drawn on through a mask, with a cast shadow from the head CSS (`html.studio .marks .mk`).
  Coordinates are canvas pixels; the marks layer sits above the stage in studio mode.
- The object's colour is a third colour beside ink, paper and the accent. It is the material
  of a thing, not a graphic colour, and its saturation stays below the accent's so the two
  never read as one hue (slide-design.md §2).

## 5. What the runtime does with it

The sheet is the fifth movement path in the template's determinism contract (head comment ⑤):
`h.object` emits one element with `data-sheet`, `data-sheet-cell`, `data-sheet-cols` and
`data-sheet-ranges="1:0-11 2:11-38 …"`, and the SEEK-RUNTIME block — identical in the three
authored-screen templates, `format-lint.js` checks that — sets its `background-position` on
every `__seek(t, g)`:

- group k with a range `[a, b]` shows frame `a + round((b − a) · t / dur[k])`;
- a group past the object's last range holds the last frame, a group before its first holds
  the first, a group between ranges holds the previous range's end;
- `dur[k]` is the `--count` token (1.8 s) until the renderer passes `--segs`, when it becomes
  the segment length — the object is a sustain element by definition, so it never freezes
  under its sentence. `__groups()` reports the sheet's durations so a group that moves only
  the object still gets a clip.
- the studio drift (`data-ground`) is not counted in `__groups()`; the runtime sets its duration
  to that group's clip length (`--ground-d`) after `__setSegs`, so the push ends where the cut is.

Why the runtime and not a painter: one background is shared by four groups, and a per-group
`__paint` would let the last-registered painter overwrite the frame the active group set —
the frame has to be computed from (g, t) together. Two sets of numbers, from two capture paths:
in ego lite on the sample page (one tab, a screenshot loop) moving the index costs nothing
(7.40 vs 7.41 fps with the index pinned), the object layer costs 1.13× (7.35 vs 8.32 fps) and
the slab shadows 2.5×; the plugin's own renderer, four tabs, did the fixture's 594 frames in
78 s at 7.6 fps. The same (g, t) reached by two different seek paths sets the same position
string — checked on (2, 1500 ms) and (4, 2000 ms).

## 6. Traps

- **The sidecar path is relative to the slide file**, not to the storyboard: `assets/s5-obj.png`.
  The bake writes it that way; a hand-written sidecar with the bare file name made the renderer
  stop with "could not load".
- **Bake the count in the sheet, not in the copy.** The keys' stamp counts have to be the
  figures the labels and research carry (45, 241); the reviewer reads the number off the frame.
- **The cell is nearly as wide as the zone.** Ink reaches x 731 of the 760 px cell (the wall
  shadow of the reclined first key), so on a 728 px zone `x` sits between -44 and -3; the
  fixture uses −10. A cell narrower than the shadow clips it to a straight edge — the first bake's
  630 px cell did, and the reviewer saw the edge before anyone else did.
- **Group durations without `--segs`** are the `--count` token; the browser preview
  (`?g=2&t=1500`) therefore runs the object faster than the finished clip. Judge timing on the
  rendered sheet with `--segs auto`, as for every sustain element.
- **The stage drift is the plate's alone.** The studio wrappers push only the cyclorama by up to
  1% a group; type and plates stay in the zone. A 3.3% push on the whole frame put the left
  edge of the type at x 159 on a 176 px zone (measured). The wrappers carry `data-ground`, so
  a group where nothing but the stage moves is still an empty group to the renderer.
- **Memory.** A decoded 5670×4800 sheet is about 109 MB per tab; `--jobs 4` holds four. Cut
  `--jobs` before cutting frames if a render machine is short of memory.
