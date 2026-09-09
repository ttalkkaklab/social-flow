# Blender previz — camera and blocking as numbers, through the bridge tools

Five MCP tools drive the Blender installed on this machine the way the Higgsfield Bridge
drives it for ChatGPT, without a relay, an add-on or a GUI: `blender_scene_read`,
`blender_scene_build`, `blender_camera_set`, `blender_object_animate`,
`blender_render_previz`. Each call is one short `blender --background` run that opens the
.blend file, applies one edit, saves and reports; the .blend on disk is the session. A read
takes about 1.2 s on an M4 Max, a 150-frame Workbench previz well under a minute.

The point of a previz is what a prompt cannot hold. "Low angle beside the wheel" is 15° to
one model and 30° to another; a storyboard has two axes and no depth. A previz says the
camera is at (1.5, -2.5, 0.6), looks at (0.3, -0.3, 1.2), 35 mm, and gets there by frame 72
— and a video model that takes a reference clip follows those numbers instead of guessing.

## Contents

- [1. Conversation shape](#1-conversation-shape)
- [2. Coordinates and units](#2-coordinates-and-units)
- [3. What each tool does](#3-what-each-tool-does)
- [4. Hand-off to generation — three channels](#4-hand-off-to-generation--three-channels)
- [5. Traps](#5-traps)

## 1. Conversation shape

1. **Read first, change nothing.** `blender_scene_read` on the file you are about to edit.
   On a fresh episode there is no file yet, so go straight to build.
2. **Build the set once.** `blender_scene_build` with `reset:true`, the frame range of the
   cut, the format's resolution, the floor, and a grey proxy per subject — `person` and
   `dog` for who is in the frame, `car`, `box`, `cylinder`, `sphere` for what. A GLB from
   mesh-objects.md or `mlx_3d_generate` goes in through `imports`.
3. **Frame it.** `blender_camera_set` with the lens and two to five keys: a location, a
   `target` the camera looks at, and a frame. One key with no frame is a locked-off shot.
4. **Move what moves.** `blender_object_animate` for the thrown can, the plane, the car —
   location and rotation keys in metres and degrees. People do not get animated here;
   their acting is a prompt sentence (§4), and a stiff proxy is exactly what you do not
   want a video model to copy.
5. **Render and look.** `blender_render_previz` writes an H.264 mp4 plus first, middle and
   last frame PNGs with the frame number, camera and lens stamped in the corner. Open the
   stills. Then iterate.

Iterate in numbers, never in adverbs. "More dynamic" means nothing to a coordinate; "camera
height 1.2 m", "arc 50 % wider — start at (-3, -3, 1), end at (3, -3, 1)", "lens 24 mm"
each become one more `blender_camera_set` call. Three or four rounds is normal and costs
nothing: the previz is local and free, and every round that happens here is a paid video
generation that does not.

## 2. Coordinates and units

Blender's own: **metres, Z up, +X to the right, +Y away from the front view**. Angles are
degrees. Proxies built here face **-Y**, so a camera at negative Y looking back at the origin
sees a character's front; a person 1.75 m tall has its eyes near z = 1.6.

`blender_camera_set` takes either `target` (a point in space — the tool derives the
rotation, the usual choice) or `rotationDeg` (Blender Euler XYZ; a camera at
`[90, 0, 0]` looks along +Y). `lensMm` is the focal length on a 36 mm sensor: 24 wide,
35 normal, 50–85 tight. `fovDeg` is the angle across the frame's longer side and is the
alternative, not an addition.

Keys interpolate `LINEAR` by default, which is what a previz wants — a constant-speed move
reads as intent. `BEZIER` eases in and out; `CONSTANT` cuts.

## 3. What each tool does

| tool | opens | writes | returns |
|---|---|---|---|
| `blender_scene_read` | the .blend | nothing | objects with world position, rotation, size, parent and keyframes; the active camera with lens, field of view and keyframes; frame range and fps |
| `blender_scene_build` | a new file (`reset:true`) or the existing one | the .blend | the same summary plus what was built |
| `blender_camera_set` | the .blend | the .blend | summary with the camera's keyframes; the frame range grows to include them |
| `blender_object_animate` | the .blend | the .blend | summary with the object's keyframes |
| `blender_render_previz` | the .blend | `<dir>/previz/<name>.mp4` and `-fNNNN.png` stills | paths, frame count, seconds, render time |

`workbench` is the default engine: flat studio light, material colours, cavity shading and
an outline, so a grey figure reads against a grey floor. `eevee` renders the scene's sun
light and materials, for a previz that also has to say something about mood; it takes a
few seconds a frame.

## 4. Hand-off to generation — three channels

A reference clip does not hand a video model the camera alone. It hands over every motion
in the clip — a proxy with straight arms and locked knees comes back as a person with
straight arms and locked knees. Vehicles have no joints and survive; people and animals
do not. So the information is split three ways, and nothing is asked of the channel that
cannot carry it:

| channel | carries |
|---|---|
| **previz clip** (this lane) | camera path, lens, timing, where each subject stands and how large it is in frame, what passes what, in which order |
| **image sheets** (`referenceImagePaths`) | face, clothing, props, the place, every look-related fact |
| **prompt** | the acting: weight shift, what the hand touches, where the eyes go, the expression, how the landing bends the knees |

The plan for a generated cut therefore names the previz as its camera source, the sheets as
its look source, and writes the acting as sentences. Whether the previz clip travels to the
model as a reference video depends on the route — Seedance 2.x reference mode takes video
references; Veo's reference lane takes images only — and the storyboard contract carries no
video-reference field yet, so until it does the previz is the author's own instrument: it
fixes the numbers the prompt and the camera sentence are then written from.

## 5. Traps

- **Names are exact.** `blender_object_animate` moves the object you name — the proxy's
  root, `can`, not its mesh `can.mesh`. The read-back lists every name.
- **A key with no `target` and no `rotationDeg` is rejected**, and so are two keys on the
  same frame. With several keys, every key needs a frame.
- **A box proxy needs `size`.** `person` and `dog` take `height`; `cylinder` and `sphere`
  take `radius` (and `height` for the cylinder); `car` takes an optional `size` that scales
  a 1.8 × 4.4 × 1.45 m default.
- **`reset:true` replaces the file — but only a file this lane made.** A .blend from
  anywhere else is refused unless `force:true`. Building onto an existing set is
  `reset:false`, which adds the new proxies and imports and keeps the camera, its keys,
  and the file's fps, frame range and resolution unless you name new ones.
- **One file, one Blender at a time.** Parallel calls on the same .blend are queued inside
  the server, so a camera call and an object call in one turn both land; different files
  run side by side.
- **Blender 4.2 or newer.** The bridge picks the engine name per version
  (`BLENDER_EEVEE_NEXT` on 4.2–4.5, `BLENDER_EEVEE` from 5.0) and sets the 5.0-only
  video media type only where it exists; an older Blender stops at the first call with a
  version message rather than an API error.
- **Do not hide a failed previz behind a still.** If the render fails, the tool says so;
  the mp4 is either the whole cut at the requested frame rate or absent.
