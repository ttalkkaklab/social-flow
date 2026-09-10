# Blender previz — camera, blocking and body timing as numbers, through the bridge tools

Seven MCP tools drive the Blender installed on this machine the way the Higgsfield Bridge
drives it for ChatGPT, without a relay, an add-on or a GUI: `blender_scene_read`,
`blender_scene_build`, `blender_camera_set`, `blender_object_animate`, `blender_pose_key`,
`blender_motion_import`, `blender_render_previz`. Each call is one short
`blender --background` run that opens the .blend file, applies one edit, saves and reports;
the .blend on disk is the session. A read takes about 1.2 s on an M4 Max, a 150-frame
Workbench previz well under a minute.

The point of a previz is what a prompt cannot hold. "Low angle beside the wheel" is 15° to
one model and 30° to another; a storyboard has two axes and no depth. A previz says the
camera is at (1.5, -2.5, 0.6), looks at (0.3, -0.3, 1.2), 35 mm, and gets there by frame 72
— and a video model that takes a reference clip follows those numbers instead of guessing.
Since 0.66.0 a person in the previz is a jointed mannequin, so a cut whose content is the
body — a dance, a fall, a gesture — carries its timing the same way: which count the arm
goes up, when the knee bends, how far the lean goes.

## Contents

- [1. Conversation shape](#1-conversation-shape)
- [2. Coordinates and units](#2-coordinates-and-units)
- [3. What each tool does](#3-what-each-tool-does)
- [4. Posing a person by channel](#4-posing-a-person-by-channel)
- [5. Motion capture onto the mannequin](#5-motion-capture-onto-the-mannequin)
- [6. Hand-off to generation — three channels](#6-hand-off-to-generation--three-channels)
- [7. Traps](#7-traps)

## 1. Conversation shape

1. **Read first, change nothing.** `blender_scene_read` on the file you are about to edit.
   On a fresh episode there is no file yet, so go straight to build.
2. **Build the set once.** `blender_scene_build` with `reset:true`, the frame range of the
   cut, the format's resolution, the floor, and a proxy per subject — `person` (a jointed
   mannequin on a 19-bone rig) and `dog` for who is in the frame, `car`, `box`, `cylinder`,
   `sphere` for what. A GLB from mesh-objects.md or `mlx_3d_generate` goes in through
   `imports`.
3. **Frame it.** `blender_camera_set` with the lens and two to five keys: a location, a
   `target` the camera looks at, and a frame. One key with no frame is a locked-off shot.
4. **Move what moves.** `blender_object_animate` for the thrown can, the plane, the car,
   and for a person's path across the floor — key the person's root, the body rides along.
5. **Act the body.** When the cut is about what a person does, give the mannequin its
   motion: `blender_motion_import` retargets a motion-capture clip (a BVH or an animated
   FBX) onto the rig — the natural-motion path; `blender_pose_key` writes poses by hand in
   plain channels for accents and short beats (§4). Both report where the hands, feet and
   head ended up, so the next call can be a correction in numbers.
6. **Render and look.** `blender_render_previz` writes an H.264 mp4 plus first, middle and
   last frame PNGs with the frame number, camera and lens stamped in the corner. Open the
   stills. Then iterate.

Iterate in numbers, never in adverbs. "More dynamic" means nothing to a coordinate; "camera
height 1.2 m", "arc 50 % wider — start at (-3, -3, 1), end at (3, -3, 1)", "left arm to
120, elbow 40 on frame 36" each become one more call. Three or four rounds is normal and
costs nothing: the previz is local and free, and every round that happens here is a paid
video generation that does not.

## 2. Coordinates and units

Blender's own: **metres, Z up, +X to the right, +Y away from the front view**. Angles are
degrees. Proxies built here face **-Y**, so a camera at negative Y looking back at the origin
sees a character's front; a person 1.75 m tall has its eyes near z = 1.6. A person's **own
left is +X** — the `.L` bones, the `armL`/`legL` channels — and its right is -X.

`blender_camera_set` takes either `target` (a point in space — the tool derives the
rotation, the usual choice) or `rotationDeg` (Blender Euler XYZ; a camera at
`[90, 0, 0]` looks along +Y). `lensMm` is the focal length on a 36 mm sensor: 24 wide,
35 normal, 50–85 tight. `fovDeg` is the angle across the frame's longer side and is the
alternative, not an addition.

Keys interpolate `LINEAR` by default for the camera and objects — a constant-speed move
reads as intent — and `BEZIER` for the body, which is how a body moves. `CONSTANT` cuts.

## 3. What each tool does

| tool | opens | writes | returns |
|---|---|---|---|
| `blender_scene_read` | the .blend | nothing | objects with world position, rotation, size, parent and keyframes (a rig shows its bone count); the active camera with lens, field of view and keyframes; frame range and fps |
| `blender_scene_build` | a new file (`reset:true`) or the existing one | the .blend | the same summary plus what was built |
| `blender_camera_set` | the .blend | the .blend | summary with the camera's keyframes; the frame range grows to include them |
| `blender_object_animate` | the .blend | the .blend | summary with the object's keyframes |
| `blender_pose_key` | the .blend | the .blend | summary with the rig's keyframes and the bones keyed, plus hand, foot and head positions at the last key |
| `blender_motion_import` | the .blend and the clip | the .blend | summary with the baked range, which rig bone took which source bone, the scale and facing corrections, plus hand, foot and head positions at the first baked frame |
| `blender_render_previz` | the .blend | `<dir>/previz/<name>.mp4` and `-fNNNN.png` stills | paths, frame count, seconds, render time |

`workbench` is the default engine: flat studio light, material colours, cavity shading and
an outline, so a grey figure reads against a grey floor. `eevee` renders the scene's sun
light and materials, for a previz that also has to say something about mood; it takes a
few seconds a frame.

A person is three objects: the root (`dancer`, an empty — the thing `blender_object_animate`
moves), the rig (`dancer.rig`, 19 bones: hips · spine · chest · neck · head, and shoulder ·
upper_arm · forearm · hand, thigh · shin · foot per side) and the mannequin mesh
(`dancer.body`, a rigid piece per bone with joint balls, weighted 100 % to its bone). The
figure bends at the joints and nowhere else — a wooden drawing mannequin. The pose tools
take the root's name.

## 4. Posing a person by channel

`blender_pose_key` takes keys of `{ frame, pose }`, and a pose is body groups in degrees in
the figure's own frame:

| group | channels | what + does |
|---|---|---|
| `armL` / `armR` | `raise` `side` `twist` `elbow` | raise: forward and up (90 horizontal in front, 180 straight up) · side: out from the body (90 a T, 180 straight up) · twist: about the arm's length · elbow: 0–150, the forearm folds toward the front of the upper arm |
| `legL` / `legR` | `raise` `side` `knee` `ankle` | raise: thigh forward (90 a high kick or a seat) · side: out · knee: 0–150, the shin folds back · ankle: + points the toes |
| `torso` | `bow` `lean` `turn` | bow: forward · lean: to the figure's left · turn: to the figure's left — split across spine and chest |
| `head` | `nod` `tilt` `turn` | nod: down · tilt: to the left shoulder · turn: look left — split across neck and head |
| `hips` | `offset` `turn` `bow` `lean` | offset `[x, y, z]` metres from rest (-z crouches, ±x sways); the rotations tip the pelvis and everything on it |
| `bones` | `{ "<bone>": [x, y, z] }` | the raw path: any rig bone, degrees about the figure's side, front-back and up axes, applied after the groups |

A group that is present keys every bone it covers, with omitted channels at 0 — so
`armL: {}` is "the left arm at rest, keyed here", and a group that is absent leaves those
bones alone at that frame. The rest pose is standing straight with the arms hanging.

Worked poses:

- **A point.** `armR: { raise: 90 }`, `head: { turn: -20 }`.
- **A bow.** frame 1 `torso: {}` → frame 18 `torso: { bow: 45 }`, `head: { nod: 20 }` → frame 40 `torso: {}`, `head: {}`.
- **A crouch and jump.** frame 1 `hips: {}`, `legL: {}`, `legR: {}` → frame 12 `hips: { offset: [0, 0, -0.25] }`, `legL: { raise: 50, knee: 95 }`, `legR: { raise: 50, knee: 95 }`, `torso: { bow: 25 }`, `armL: { raise: -30 }`, `armR: { raise: -30 }` → frame 20 `hips: { offset: [0, 0, 0.35] }`, legs and torso at `{}`, arms `{ raise: 150 }`.
- **A dance count on the beat.** At 120 bpm a count is 15 frames at 30 fps: alternate
  `hips: { offset: [0.06, 0, -0.03], lean: 5 }` and `hips: { offset: [-0.06, 0, -0.03], lean: -5 }`
  every count with the arms trading `raise` 60/20, and the knees at 15 between.

The reply's landmark line — `hand.L (0.32, -0.45, 1.19) · hand.R … · foot.L … · head …`
in world metres at the last key — is the check: a hand that should be at head height and is
not becomes a bigger `raise` on the next call, not a guess.

Keys more than about 120° apart on one joint need an intermediate key, or the joint may
swing the long way round. A full dance by hand is hundreds of keys and reads mechanical;
for that, import a clip (§5) and hand-key only the accents on top with `clearExisting:false`.
A baked clip has a key on every frame, so a layered key takes over a window: the keyed
bone's clip keys within ±`ease` frames (default 6) are dropped and the pose is eased into
from the clip and back out to it. `ease: 0` changes that one frame alone. `clearExisting:true`
(the default) also puts every bone back at rest, so a bone this call does not key is not
left holding the previous call's pose.

## 5. Motion capture onto the mannequin

`blender_motion_import` reads a BVH or an animated FBX, matches its skeleton to the rig
by name — the vocabularies of Biovision/CMU/Mixamo (`LeftUpLeg`, `LeftLeg`), Unreal
(`thigh_l`, `calf_l`), Bandai (`UpperLeg_L`, `LowerLeg_L`), Rigify (`thigh.L`) and SMPL
(`L_Hip`, `L_Knee`) are known; `boneMap` names anything else — and bakes one key per frame.
Three corrections make any clip land on the figure: the pose comes from the source's joint
positions, not its bone rotations, so the file's rest pose, units and bone rolls do not
matter; the clip is scaled by the actor's leg length to the figure's; the actor is turned
to face -Y at the first frame, and the lowest the feet get in the slice becomes the floor.

Arguments that shape the bake:

- `fromSeconds` / `toSeconds` cut a slice; `frameStart` places it in the cut. A 60 s
  dance clip does not go in whole — the cut is 5 s, so the slice is the count that fits it.
- `speed` retimes (1.2 plays 20 % faster); `loop` repeats the slice to the scene's last
  frame. At most 3000 baked frames per call.
- `rootMotion` — `inplace` (default) keeps the pelvis over the figure's root and only lets
  it rise and fall, so the formation is yours through `blender_object_animate`; `full`
  keeps the actor's travel across the floor.
- `clearExisting:false` layers the clip over hand-made keys rather than replacing them
  (bones the clip does not drive keep whatever they hold); the default replaces everything
  and puts every bone back at rest first.
- An FBX keeps the file's own frame rate for its keys; the bridge reads that rate for the
  slice maths and gives the scene its fps back, so a 30 fps clip in a 24 fps cut plays at
  the right speed (the reply names the source fps).

Where clips come from: the CMU library (free BVH, converted by cgspeed), the Bandai Namco
Research motion dataset-1 (BVH, **CC BY-NC 4.0 — research and personal use, not a
published commercial cut**; its dance clips start with the actor walking to the mark, so
the first ~9 s are idle), Mixamo (FBX, an Adobe login and a browser download), or a capture
of your own. Read the clip before slicing it: the reply's first-frame landmark line and a
quick render of the whole slice tell you whether the count you picked is the one you
wanted.

What the mannequin loses: fingers, the face, the twist of a limb about its own length (a
cylinder has none to show), and a source hand or foot whose end site has no length (that
bone holds its rest pose relative to the parent — the reply lists it under unmatched).

## 6. Hand-off to generation — three channels

A reference clip does not hand a video model the camera alone. It hands over every motion
in the clip — a proxy with straight arms and locked knees came back as a person with
straight arms and locked knees, which is why people were not animated here before 0.66.0.
With a jointed mannequin the body's timing travels too, and it travels as it is: natural
when it came from a capture, mechanical when it was hand-keyed in eight poses. So the
information is still split three ways, and nothing is asked of a channel that cannot carry it:

| channel | carries |
|---|---|
| **previz clip** (this lane) | camera path, lens, timing, where each subject stands and how large it is in frame, what passes what, in which order — and, for a person, the body's timing: the count the arm goes up, the knee bend, the lean |
| **image sheets** (`referenceImagePaths`) | face, clothing, props, the place, every look-related fact |
| **prompt** | the acting the mannequin cannot show: what the hand touches, where the eyes go, the expression, the weight in the landing |

The plan for a generated cut therefore names the previz as its camera and timing source,
the sheets as its look source, and writes the acting as sentences. Whether the previz clip
travels to the model as a reference video depends on the route — Seedance 2.x reference
mode takes video references; Veo's reference lane takes images only — and the storyboard
contract carries no video-reference field yet, so until it does the previz is the author's
own instrument: it fixes the numbers the prompt and the camera sentence are then written
from.

## 7. Traps

- **Names are exact.** `blender_object_animate` moves the object you name — the proxy's
  root, `can`, not its mesh `can.mesh`. `blender_pose_key` and `blender_motion_import`
  take the person's root too — `dancer`, not `dancer.rig`. The read-back lists every name.
- **A key with no `target` and no `rotationDeg` is rejected**, and so are two keys on the
  same frame. With several keys, every key needs a frame.
- **An empty pose `{}` is rejected; an empty group `{}` is a rest key.** `pose: { armL: {} }`
  keys the left arm hanging at that frame.
- **A box proxy needs `size`.** `person` and `dog` take `height`; `cylinder` and `sphere`
  take `radius` (and `height` for the cylinder); `car` takes an optional `size` that scales
  a 1.8 × 4.4 × 1.45 m default.
- **Only people are jointed.** A dog or a car posed with `blender_pose_key` is refused;
  they move whole through `blender_object_animate`.
- **`reset:true` replaces the file — but only a file this lane made.** A .blend from
  anywhere else is refused unless `force:true`. Building onto an existing set is
  `reset:false`, which adds the new proxies and imports and keeps the camera, its keys,
  and the file's fps, frame range and resolution unless you name new ones.
- **One file, one Blender at a time.** Parallel calls on the same .blend are queued inside
  the server, so a camera call and an object call in one turn both land; different files
  run side by side.
- **A clip needs a skeleton with keys.** An FBX of a mesh alone is refused; a skeleton
  whose hips the vocabulary does not recognise is refused with its bone list and needs
  `boneMap`. A one-frame clip is accepted and bakes one key — a pose, not a motion.
- **Blender 4.2 or newer.** The bridge picks the engine name per version
  (`BLENDER_EEVEE_NEXT` on 4.2–4.5, `BLENDER_EEVEE` from 5.0) and sets the 5.0-only
  video media type only where it exists; an older Blender stops at the first call with a
  version message rather than an API error.
- **Do not hide a failed previz behind a still.** If the render fails, the tool says so;
  the mp4 is either the whole cut at the requested frame rate or absent.
