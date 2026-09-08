# 3D objects and motion on HTML slides

## Contents

- [Plan the object before authoring](#plan-the-object-before-authoring)
- [Recipe and assets](#recipe-and-assets)
- [Author and verify](#author-and-verify)
- [Bundle maintenance](#bundle-maintenance)

Use this lane for physical subjects in explanatory shots. People, mood and place can instead
use a high-quality still with a camera move; a physical noun alone does not require this lane.
Build a contextual environment and add a matching cute 3D character only when its action
helps explain the narration, as described in [illustrated-scenes.md](illustrated-scenes.md). Choose `illustration3d` for designed, tactile models
with rounded edges, restrained colour and soft studio light. Choose `photoreal3d` for an
embedded GLB with authored PBR materials and textures. A generated 3D-looking PNG can be an
illustration prop, but moving its rectangle does not demonstrate a physical mechanism.
Keep numbers and abstract relationships as diagrams. Never turn people, carts, vessels or
machines into labelled disks merely because HTML is the delivery format.

## Plan the object before authoring

```js
slide: {
  kind: "diagram", motion: true, treatment: "editorial", role: "mechanism",
  quality: "object-state-v1",
  subject: {kind: "object", changes: [
    {group: 1, before: "lid closed", after: "lid raised", driver: "articulation"}
  ]},
  object: {
    renderer: "mesh", file: "slides/assets/s2-container.json",
    style: "illustration3d", plan: "The hinge raises the lid and reveals the contents."
  },
  motionBeats: [{group: 1, primitive: "object-move"}]
}
```

Write the ordinary file, labels and motif too. `mesh` renders the actual model at each output
frame using the template's `__seek(timeMs,group)` contract. There is no turntable loop, real-time
clock or low-rate sprite sampling. The existing baked PNG lane is still supported with
`renderer:"sheet"` or no renderer field. Use mesh for new articulated or spatial subjects.

Which of the two draws the frames is a machine question as much as a shot question:
`python3 references/bake-blender.py --capacity` reads the GPU backend, cores and memory and answers
with `mesh`, `blender` or `blender-unattended` plus the render-tab count that memory allows
([blender-objects.md](blender-objects.md) §1 carries the trade table).

The same recipe can be baked by Blender Cycles instead of drawn by the browser —
`renderer:"blender"` with a `sheet`, `engine`, `samples` and `fps` ([blender-objects.md](blender-objects.md)):
path-traced light, a real cast shadow on the studio floor, and a faster capture, at the price of
minutes of local render per cut. It needs Blender on the machine (`capability_status` →
`3d_generation`); when the review keeps asking for material, light and contact, that is the lane.

## Recipe and assets

The JSON recipe has `version:1`, `style`, `camera:{position,target,fov}`, `nodes`, `states`
and `groups`. Coordinates use metres, Y up, rotations in degrees. Frame the complete subject
inside the viewport throughout its motion. The default shadow plane is at Y=-1.4; set
`floorY` to the object's ground contact. Camera FOV is 15–65 degrees.

- Each node has a unique `id`, optional `parent` (defined earlier), `pose` and either
  `source:"model.glb"`, `geometry` or neither (a pivot/group). A source is a filename beside
  the recipe. Export GLB with embedded buffers/textures and without Draco, Meshopt or KTX2.
  `mlx_3d_generate` output can enter here after inspection; this does not authorize a new
  generation call or override the user's image-generation tool preference.
- `geometry` builds real mesh parts: `roundedBox` size `[width,height,depth]`, `sphere`
  `[radius]`, `cylinder` `[radiusTop,radiusBottom,height]`, `torus` `[radius,tubeRadius]`.
  Rounded boxes accept `bevel`. Combine parts into recognizable objects with proper joinery,
  wheels, handles, surfaces and thickness. An isolated primitive is not a finished subject.
- Procedural parts accept `material:{color,roughness,metalness,clearcoat,finish}`. `finish:"wood"` or `"linen"` adds deterministic surface grain. Imported GLBs keep
  their materials. The renderer supplies an environment reflection, warm key, cool fill,
  rim light, soft shadow and filmic tone mapping. `photoreal3d` requires an imported model;
  naming a primitive assembly photoreal does not improve it.
  A GLB material may opt into subtle base-colour-derived relief with
  `extras.socialFlowMicrorelief` greater than 0 and at most 0.03 metres. This is an
  approximation for grain, not a substitute for authored normal or roughness textures.
- `states` contains the start plus one end state per narration group. Each state's `pose`
  maps target ids to `position`, `rotation`, `scale`. These are complete states: omitted
  properties return to the node's base pose, not the previous call's pose. Animate a hinge
  parent for articulation. Avoid a half-turn or more in one quaternion interpolation.
- To pose a named GLB part, declare `bindings:[{id:"lid",asset:"box",node:"Lid"}]` and set
  its complete local pose. To play a rigged animation, use state
  `clips:{box:{name:"Open",time:0}}` and end at the clip's measured time. Keep the same clip
  name across the states. Missing parts, clips or out-of-range times stop rendering.
- `groups:[{group:1,durationMs:4000,ease:"smoother"}]` follows narration order. Use `smoother`
  for zero velocity and acceleration at a boundary; `linear` only for steady motion.
  Measured narration durations supplied by `__setSegs` replace the planned durations.
  Every group must change the subject itself. A camera push or moving caption cannot pass.
- Optional `motionWindow:[0.15,0.6]` confines the action to that fraction of the measured
  narration group. Both endpoints must be between 0 and 1 and strictly ordered. Match a
  prop's action window to the hand that touches it; preserve the settled pose afterward.
- Optional `lighting` controls `exposure`, `environment`, `key`, `fill`, `rim`,
  `keyColor`, `keyPosition` and `shadowOpacity`. Match the surrounding image's light
  direction and brightness before adding contrast. Inspect the final composite.
- Optional `contactShadows:[{target:"wheel",size:[0.7,0.4],opacity:0.6}]` adds a soft
  local contact patch on `floorY`. It follows the target's horizontal position. These
  patches approximate contact; they are not physically traced shadows. Use them only
  for grounded parts and inspect both the opening and final pose.

## Author and verify

Copy `mesh-runtime.js` from this reference directory to `slides/assets/mesh-runtime.js` and
include `<script src="assets/mesh-runtime.js"></script>` before the slide's main script.
It is bundled with Three.js and its loaders; marketplace users install no npm packages.
Use `h.object(1,"s2-container",{slot:620})` inside `renderSlide()`. The helper reserves the
viewport in the safe zone. Use one composed scene with several actors when objects interact.
The checker verifies the recipe, local GLBs and the exact runtime copy before capture.

For product-catalog annotations, use [illustrated-scenes.md](illustrated-scenes.md).
`project(part, localPoint)` returns viewport pixels and frustum visibility for an actual
mesh part; the viewport exposes it as `projectMeshPoint`. Account for the viewport's
screen position and any parent camera transform. Separate nearby targets enough that
their rings remain distinct at phone size.

Use `h.mark.arrow(group, [[x,y],...], {w:6,head:22,duration:950,delayMs:120})` for relations.
Coordinates are full-canvas pixels. The rounded curve draws with a head following its tangent;
both use the same quintic progress. Leave space at both ends and avoid crossing silhouettes
or type. One restrained accent is enough. Default `h.mark.route` uses this style too;
`pen:true` is only for an intentionally hand-drawn annotation, never the default.

Render through `render-motion-slide.mjs` with measured segment durations at the final 30 fps.
Inspect early, middle and final frames plus actual playback. Check silhouettes, materials,
contact shadows, object continuity, arrow placement, type hierarchy and phone readability.
Check random seeks against sequential seeks. Record concrete findings and repairs in
`.work/slide-quality-review.md`. Schema success does not establish visual quality.
If a model or renderer is unavailable, report it; do not substitute circles or claim a pass.

## Bundle maintenance

`server/slide-mesh-runtime.mjs` is the source; `npm run build` in server builds the committed
reference bundle. Three.js 0.180.0 is pinned in the lockfile (MIT license preserved in the
bundle). Keep the generated runtime in the same change as its source and contract.
