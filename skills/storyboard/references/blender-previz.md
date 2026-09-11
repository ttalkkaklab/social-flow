# 3D previz — camera, blocking and body timing as numbers, before any video call

**Every `generated_video` cut is pre-rendered in 3D first** (user directive 2026-09-11): a
Blender previz through the bridge tools below, or a three.js previz through
`previz-template.html` (§6.5) where Blender is not installed. `check-scenes.js` refuses a
generated cut without `visual.video.previz`, and the video model receives the render — as the
reference clip on Seedance 2.x, or as the composition of the still and the numbers in the
prompt on a host video tool that takes no clip (§6.7). Imported clips (`visual.reuse`), stock
footage, recordings and the outro carry none, and neither do b-roll (`type:"broll"`) and speech
clips (`visual.clip`): those are Veo sound-lane slots with no clip input, and the reference
route is a motion-background (`visual.video`) route. **Which renderer and which video model are the
user's choices**, asked with AskUserQuestion before the first previz render and before any
video call and recorded in `PRODUCTION.previz` and `PRODUCTION.videoModel`
(production-mode.md §Two more questions); every shot's `previz.renderer` and `video.model`
must match them.

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
— and a video model that takes a reference clip follows those numbers instead of guessing —
Seedance 2.x does, through `seedance_reference`'s `referenceVideoPaths` (§6).
Since 0.66.0 a person in the previz is a jointed mannequin, so a cut whose content is the
body — a dance, a fall, a gesture — carries its timing the same way: which count the arm
goes up, when the knee bends, how far the lean goes.

## Contents

- [1. Conversation shape](#1-conversation-shape)
- [2. Coordinates and units](#2-coordinates-and-units)
- [3. What each tool does](#3-what-each-tool-does)
- [4. Posing a person by channel](#4-posing-a-person-by-channel)
- [5. Motion capture onto the mannequin](#5-motion-capture-onto-the-mannequin)
- [6. Hand-off to generation — the previz is Video 1](#6-hand-off-to-generation)
  - [6.5 The three.js previz](#65-the-threejs-previz)
  - [6.6 The first frame becomes the still](#66-the-first-frame-becomes-the-still)
  - [6.7 A host video tool that takes no clip](#67-a-host-video-tool-that-takes-no-clip)
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
   last frame PNGs; the stills carry the frame number, camera and lens stamped in the corner
   and the mp4 stays clean, because the mp4 is what generation receives (§6). Open the
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
from the clip and back out to it. `ease: 0` changes that one frame alone. On a clip the
`hips` group is a delta — the clip's own pelvis turn and floor height stay and `offset`,
`turn`, `bow`, `lean` move it from there — while every other group is the absolute pose
it always is. `clearExisting:true` (the default) also puts every bone back at rest, so a
bone this call does not key is not left holding the previous call's pose.

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

## 6. Hand-off to generation

The previz clip goes to the video model as a reference video. Seedance 2.x takes one
(`role: reference_video`), and its 2.5 prompt guide documents exactly this use under the
name **3D clay-model reference**: a coarse, textureless render supplies camera movement, shot
rhythm, subject trajectory and blocking, and the model renders it in the target look. The
plugin wires it as `seedance_reference` → `referenceVideoPaths`; Veo 3.1 takes no video
input, and Seedance 1.x takes none either, so a previz-guided cut is a 2.x cut.

What travels on which channel is still split, and nothing is asked of a channel that cannot
carry it:

| channel | carries |
|---|---|
| **previz clip** (`Video 1`) | camera path, lens, timing, where each subject stands and how large it is in frame, what passes what, in which order — and, for a person, the body's timing |
| **source still** (`Image 1`) | the composition in the chosen visual style — "Image 1 is the first frame" |
| **character sheets** (`Image 2…`) | face, clothing, props, every look-related fact |
| **prompt** | the acting the mannequin cannot show, the environment, materials and lighting, and which coloured model is which character |

One vendor rule shapes the whole hand-off: first-frame mode and the reference lane are
**mutually exclusive**, so a previz cut cannot also pin `first_frame`. The still rides as a
reference image instead, which the vendor says lands "similar, not identical". That is the
trade: exact camera and timing from the clip, a close first frame from the still.

### 6.1 Rendering the clip for the model

- **Whole seconds, equal to the billed length.** The cut's `duration` rounds up to the
  model's floor (2.0: 4–15 s); render exactly that many seconds — `frameEnd = fps × seconds`
  — and the route refuses a mismatch. Practitioners keep a previz-guided move to 3–8 s and
  one camera move per shot. One idea per move: the camera moves or the subject moves, both
  only when the cut needs both — a 12 s clip with a dolly, a walk and a pan made the model pick
  a random part each take, a 6 s dolly alone landed every time
  (docs/research/2026-09-11-previz-mandatory §7.5–7.6).
- **24 fps.** The vendor takes 24–60 and outputs 24; rendering at 24 makes frame n of the
  previz frame n of the result, which is what the QA overlay compares. Set it in
  `blender_scene_build` (`fps: 24`).
- **Format resolution.** 1080×1920 or 1920×1080 pass the vendor's pixel window
  (407,696–8,295,044 a frame); so does 720×1280.
- **Workbench, no stamp on the clip, no gizmos.** The mp4 is never stamped (only the stills
  are); nothing else may be in frame either — no grid, camera cone, trajectory line or
  coordinate axis. The vendor lists those as distractions.
- **One flat colour per actor, everything else grey.** `blender_scene_build` proxies take
  `color`. The prompt then binds "the red model in Video 1" to a character image, the way
  the vendor's own example does. Simple primitives beat detailed models for the reference.
- **No face anywhere in the inputs.** A previz cut on the API lane is a 2.x cut, so a source
  still with a real face cannot be generated there at all — take the face out of the still
  (turned away, small in frame, illustrative) or use the host lane. 2.x moderation rejects real human faces in reference
  images and videos; the mannequin has none, and the still and the sheets must not either.

### 6.2 What the storyboard stores

On the motion-background record (scenes-schema §motion background):

```js
video: {
  engine: "seedance", modelPurpose: "previz",
  modelReason: "The camera orbits the cart while the load shifts — timing has to land on the sentence",
  realFaceInput: false, resolution: "1080p",
  referenceImagePaths: ["images/scene-4.png", "../../assets/characters/porter/body.png"],  // [0] is visual.bg
  previz: {
    renderer: "blender",                 // or "threejs" (§6.5)
    clip: "previz/s4.mp4", blend: "previz/s4.blend",
    firstFrame: "previz/s4-f0001.png",   // frame 1, rendered clean (stamp:false) — the composition the still is edited from (§6.6)
    sha256: "<64 hex>", fps: 24, seconds: 5,
    camera: { movement: "arc shot" },    // the move the clip performs — must equal visual.camera.movement
    handoff: "reference_video",          // implied on the API lane; frame_and_prompt on a host tool (§6.7)
    actors: [{ color: "red", is: "the porter", image: 2 }]   // optional — the colour bindings §6.3 writes
  },
  prompt: "…"   // §6.3
}
```

`check-scenes.js` rejects the record when the renderer is not `blender` or `threejs`, the clip
is not a local mp4, the first frame is not a local png, the hash is missing, the seconds are not
whole, the fps is outside 24–60, `camera.movement` is absent or differs from
`visual.camera.movement`, `referenceImagePaths[0]` is not the source still, an end frame is
declared, or the prompt lacks the bindings in §6.3 — and it rejects a `generated_video` cut with
a `visual.video` slot and no `previz` at all (the draft pass defers this to the camera pass).
`seedance-route.js` routes it to `seedance_reference` on 2.0 (2.5 when a fixed voice or more
than nine images ride along) and prices it on the `…-video` rows: the vendor bills **input
plus output seconds**, at a lower per-token rate, so a 5 s cut with a 5 s previz bills 10 s
(2.0 1080p ≈ $2.28, against $1.87 without the clip). The approval page shows the previz next
to the source still, and the hash is part of the approved quote — re-rendering the previz
after approval means approving again.

### 6.3 The prompt

Written from the vendor's clay-model template, in this order:

1. `Image 1 is the first frame.`
2. `Use Video 1, a 3D clay-model previz, as the only reference for camera movement, shot
   rhythm, shot-size changes, subject positions, motion trajectory and blocking; strictly
   keep its camera path, pacing and order of actions.`
3. `Do not reference its visual content.` (The clay replacement goes into the positive
   lock in 7: every surface is rendered in the episode's style and the figures are the
   characters from the images — a "no grey clay, no mannequins" tail is an exclusion the
   prompt gate rejects.)
4. The colour bindings: `The red model in Video 1 is the porter from Image 2.`
5. The scene, materials, lighting and the episode's visual style, written in full — the
   clip carries no look, so an unmentioned surface is the model's guess.
6. The acting in general terms (what the hand touches, where the eyes go, the weight in the
   landing). When the mannequin's motion is hand-keyed and stiff, say the clip supplies
   *camera and positions* and describe the performance in words.
7. The usual close: one of each character in frame, no subtitles, no logo, and the
   consistency lock every Seedance prompt ends on.

On 2.0 write shot labels, never timestamps; 2.5 takes integer-second timestamps and Korean.
The two negative sentences in 2–3 are the vendor's exact wording and are the only exclusions
the prompt gate lets through on this route; anything else goes into the positive lock.
`spatial-prompts.js` writes 1–4 itself from `previz.actors` when the cut is on the reference
route, ahead of the camera span, so a full-video board never types them by hand.

**The text must not fight the clip.** The camera span in the prompt is written from the four
`visual.camera` slots, and the clip performs `previz.camera.movement`; the checker refuses the
two disagreeing, because a prompt that says `static camera` under a clip that pushes in
produces a shake, not a choice. Keep the style adjectives few — past three, the model drops the
movement for the look — and when a retake drifts, change one thing at a time so the cause is
known (docs/research/2026-09-11-blender-to-video-ai-handoff).

### 6.4 The call and the check

`seedance_reference` takes the clip as `referenceVideoPaths`, probes it with ffprobe (length,
fps, pixels) before anything is published, then serves it to the vendor — through
`MEDIA_UPLOAD_URL` when the operator has media hosting, otherwise through a cloudflared quick
tunnel for the life of the task — and releases it when the task settles. The vendor takes
video by public URL only; base64 is refused.

Every 2.x take is a fresh draw (no seed), so check the result against the previz before
accepting it: a contact sheet of both clips at 0, 25, 50, 75 and 100 %, and an edge overlay
of the result on the previz silhouettes, catches a drifted camera, a missing actor or a
late beat. When timing slips on the reference route, the tighter lock is 2.5's edit task type
(`omni_reference_task_type: edit`, aspect and length locked to the input clip) — not wired
here yet, and its prompt must replace every grey surface, since edit keeps what it is not
told to change.

### 6.5 The three.js previz

The same plan renders without Blender: `previz-template.html` is a page on `previz-runtime.js`
(three.js, flat Lambert shading, a grey floor, one flat colour per actor, no shadows, no
gizmos) that the slide renderer captures frame by frame. The spec keeps Blender's coordinates
— metres, Z up, a proxy faces -Y — so numbers move between the two renderers unchanged
(`previz-contract.js`, which also holds the checks and the interpolation):

```js
window.PREVIZ = {
  fps: 24, seconds: 5, width: 1080, height: 1920,
  camera: { lensMm: 35, keys: [{ frame: 1, position: [0, -4.5, 1.4], target: [0, 0, 1] },
                               { frame: 120, position: [1.6, -2.6, 1.2], target: [0.2, 0, 1] }] },
  actors: [{ name: 'subject', kind: 'person', color: '#d0342c', height: 1.7,
             keys: [{ frame: 1, position: [0, 0, 0] }, { frame: 120, position: [0.3, 0.6, 0], rotationZDeg: 25 }] },
           { name: 'gate', kind: 'box', size: [2.4, 0.3, 2.6], keys: [{ frame: 1, position: [0, 1.5, 0] }] }]
};
```

Proxies: `person` (height — a mannequin of legs, trunk, arms and head, unjointed), `box`
(size), `cylinder` (radius, height), `sphere` (radius), `car` (optional size). Keys are LINEAR by
frame and clamp outside their range; a key's position is the proxy's floor point; frame 1 is
t = 0 and the last frame is fps × seconds. The lens is a 36 mm sensor on the longer side, as in
Blender.

```bash
cp $SB/previz-template.html storyboard/previz/s4-previz.html     # $SB = the plugin's storyboard/references
cp $SB/previz-contract.js $SB/previz-runtime.js storyboard/previz/
node ${CLAUDE_PLUGIN_ROOT}/skills/produce/references/render-motion-slide.mjs \
  storyboard/previz/s4-previz.html --out storyboard/previz/s4 --previz
cp storyboard/previz/s4/r1.mp4 storyboard/previz/s4.mp4
cp storyboard/previz/s4/r0.png storyboard/previz/s4-f0001.png
shasum -a 256 storyboard/previz/s4.mp4
```

`--previz` renders one clip for the whole cut at 24 fps with no grain and none of the slide
rules (the page has one reveal group whatever the narration count); a 5 s spec captures exactly
120 frames (fps × seconds, t = 0 … 119/24 s), the length the Blender lane renders and the
vendor bills. Measured 2026-09-11: 1080×1920, 121 frames in 9 s on an M4 before the count was
pinned to fps × seconds. Record `renderer: "threejs"`. What this lane
cannot do: a jointed body — a dance, a fall, a gesture whose count is the joke needs the Blender
mannequin (§4–§5). Open `r0.png` and a late frame before storing the clip, the way §1 step 6
opens the Blender stills.

### 6.6 The first frame becomes the still

The source still of a previz cut is edited from the previz's first frame, not designed from the
prompt alone. The frame is a **clean** still — `blender_render_previz` with `stamp:false` for the
frame-1 PNG (the stamped stills are for your own read; a frame number and lens burned into the
corner would be kept as composition), and the three.js lane's `r0.png` is clean already: `spatial-prompts.js` puts `previz.firstFrame` first in `sourceImageArgs` and adds
the composition lock to `sourcePrompt` — keep the camera, the framing and where every subject
stands and how large it is, render every surface in the episode style. The image tool gets
that frame as a reference (host `image_edit`, Codex `image_gen` with the frame shown first,
`gpt_image_img2img` on the API lane; produce still-generation.md §1), so the composition the
clip starts on is the composition the still has, and "Image 1 is the first frame" is close to
true rather than hoped for. The approval page shows the frame beside the clip.

### 6.7 A host video tool that takes no clip

Under `PRODUCTION.videoProvider:"host"` the slot is `engine:"host"` and the host tool takes a
still and a prompt, no reference video. The previz is still rendered and stored — the directive
has no exception — with `handoff:"frame_and_prompt"` (implied on that lane): the still is edited
from `firstFrame` (§6.6), the prompt's camera span is the previz's move (the checker holds
`camera.movement` equal to the slot), and the playback review compares the result with the
previz the same way (§6.4). None of the Seedance fields apply on that lane, and the route does
not bill previz seconds there.

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
