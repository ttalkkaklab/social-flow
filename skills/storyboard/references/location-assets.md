# Persistent locations (v1)

A location is an immutable Blender set plus semantic JSON, not a collection of independently generated angles. Use the existing storyboard/produce skills; `location_manage` is the bundled local tool. It never calls paid providers. Blender is required for location authoring/rendering; existing three.js previz remains available for other shots.

## Contents

- [Spatial planning before storyboard images](#spatial-planning-before-storyboard-images)
- [Author and build](#author-and-build)
- [Bind and render a shot](#bind-and-render-a-shot)
- [Interactive review and camera changes](#interactive-review-and-camera-changes)
- [Checks and compatibility](#checks-and-compatibility)

## Spatial planning before storyboard images

After the story's scene actions are settled, build the recurring set once. Place all actors
and the important objects in world coordinates, then choose shot cameras. Render the grey
or simple-colour board before generating styled images. Compare the wide, close-up and
reverse views together. Keep actor identity, world facing and gaze separate from screen
left/right: a camera change can legitimately reverse a screen direction.

Bind shots in a continuous sequence with the same `continuityGroup`. The location check
compares each shot's start to the previous group member's end, including position, body
direction, gaze target, held-object inventory and set object state. It also warns when
cameras cross an authored action axis without a `shot.lineCrossing` plan. Findings are
advisory; they do not introduce a review-score or approval gate. An incoming
`continuityBreak`, such as "The next morning", explains a deliberate discontinuity.
Use distinct groups for independent action sequences; keep one group across an intercut
when its world state is meant to continue. Existing unbound boards keep their behavior.

`bind` accepts `blocking` and optional `endStateId` in addition to the existing fields:

```json
{
  "action": "bind", "board": "/episode/storyboard/scenes.js", "shotId": "s0001",
  "manifest": "/channel/assets/locations/room/v1/location.json",
  "stateId": "day", "cameraId": "wide", "continuityGroup": "conversation",
  "blocking": {
    "axis": ["A", "B"],
    "actors": [
      {"id":"A", "height":1.7, "color":"#d0342c",
       "start":{"position":[-1,0,0], "rotationZDeg":90, "gazeTarget":"B"},
       "end":{"position":[-0.5,0,0], "rotationZDeg":90, "gazeTarget":"B"}},
      {"id":"B", "height":1.7, "color":"#346cbe",
       "start":{"position":[1,0,0], "rotationZDeg":-90, "gazeTarget":"A"}}
    ]
  }
}
```

Actor IDs match cast IDs and cannot collide with set object IDs. Positions are floor points
in metres, Z up. Zero body rotation faces -Y; +90 degrees faces +X. `gazeTarget` is an actor
or set-object ID; omission follows body facing. `holds` optionally lists held set-object IDs.
Author those props' physical positions in the location states; custody metadata does not
pose hands or attach props. Actors are rigid body proxies with independently aimed heads,
not a substitute for articulated acting. Keep off-camera actors in blocking so a close-up
does not delete scene state. An omitted `end` holds the complete start pose; an authored
end is complete, not a partial patch. Copy the closing pose into the next cut's start.
`endStateId` supplies the closing set state, for example an opened door; omitted holds
`stateId`. The start/end renders use their respective actors and set states.

For motion, call `location_manage` with `action:"previz"`, `board`, `shotId`, the billed
`seconds` and optional `fps` (24 by default). It reopens the same immutable set and renders
the bound camera path, actor root movement and head gaze into a clean silent H.264 clip,
start/middle/end PNGs and a local working `.blend`. Translation, body rotation and camera
position/target/lens interpolate linearly between endpoints; gaze-target switches and
visibility changes occur at the closing endpoint. Complex body action still needs the
articulated Blender bridge. The operation uses the saved Blender renderer choice and
does not select a new video model or spend on generation. Duration must contain whole
frames (at most 3000); ordinary video routes use whole seconds, while ASTRA matches its
`numFrames/frameRate`. Width and height must be even for H.264.

The operation writes both `visual.location` and `visual.video.previz` with a shared
`locationBinding` fingerprint; its first frame is the location source reference itself.
Camera, blocking or endpoint-state changes invalidate that binding. Rebuild the location
previz after changes before requesting generated images. The prompt assembler prioritizes
the location composition and maps coloured proxies to the cast appearance references.
Legacy independent previz stays available with `spatialWarnings`; compare its camera and
blocking or rebuild from the shared set. No adapter claims exact spatial compliance:
compare generated opening/closing frames and actual clip playback with these references.

## Author and build

Write a JSON spec with schemaVersion:1, safe `id`, positive `revision`, `name`, `description`, `units:"metres"`, `up:"Z"`, provenance `{kind:"authored"|"measured"|"reconstructed",notes}`, nonempty `invariants`, `objects`, `states` and `cameras`.
Objects have permanent `id`, `label`, kind box/cylinder/sphere, position/size xyz in metres, optional rotation xyz degrees, hex color, optional role `wall`. Model recognizable assemblies (tabletop + legs, window frame + sill), not labelled boxes. Record inferred geometry in provenance.
States map IDs to `{label,light:0..5,objects:{objectId:{position?,rotation?,visible?}}}`. Do not move fixed architecture for a state; publish a new revision. Cameras map IDs to `{position,target,lensMm,width,height,end?}`. `end` may supply a second position/target for a linear path. A 36mm horizontal sensor fixes projection across Blender and the web viewer.

Call `location_manage` with `{action:"build",spec:"/absolute/spec.json",root:"/absolute/data/channel/assets/locations"}`. It creates `id/vN/location.json`, `source.blend`, `preview.glb` and hashes. Existing versions are never overwritten. Change the spec and increment revision for edits. GLB is the browser preview; Blender renders are the appearance authority. Do not edit generated files in place.

`{action:"sheet",manifest:".../location.json",stateId:"day",output:"/new/sheet-directory"}` renders every registered camera from the same set/state. Inspect these real images before approving a set. Regenerate into a new directory after changes.

## Bind and render a shot

`{action:"bind",board:".../storyboard/scenes.js",shotId:"s0001",manifest:".../location.json",stateId:"day",cameraId:"wide",mustShow:["door"]}` writes `shot.location`. `worldId` still controls the episode's world/style; location controls physical space. `visual.camera` remains the narrative camera direction; numerical location camera coordinates are not reconstructed from that prose.

`{action:"render",board:".../scenes.js",shotId:"s0001"}` writes clean start/end PNGs and `visual.location` evidence. Inspect the actual renders, then call `approve` with `reviewer` and observed `notes`. Approval binds to manifest bytes, state, camera, required landmarks and visual.camera. Changing any input makes evidence stale. A stale image may still be displayed in old HTML, but cannot enter new generation. Refresh the board after every change.

`references` returns verified absolute image paths, scopes and hashes. The full-video/still spatial prompt assembler attaches the location image to `sourceImageArgs.referenced_image_paths`. Pass those arguments to the host media tool first. Model input limits must be checked before a call; never silently omit location, character or style references. A reference image is not a depth-control input. No current adapter claims native depth/segmentation conditioning.

A generated video's grey motion previz and the location still share the same numerical camera and blocking when built with action `previz`. Inspect the start image against the set before spending on video. Inspect start/middle/end and disocclusion moments in the clip; metadata approval is not visual quality proof. Existing assembly HITL rules still apply. Direct Blender location renders are available when exact architecture is required.

## Interactive review and camera changes

Refresh with `storyboard-html.js`. The shared HTML embeds a location section with GLB orbit, shot camera, top view, wall visibility, object lookup, camera-path scrub, and reference images. Serve the channel directory over local HTTP; file URL GLB loading is not guaranteed by browsers. All runtime assets are bundled; no CDN is required.
Exploration and wall hiding never write the set or the shot. `Export camera proposal` downloads a versioned JSON patch; apply with `{action:"camera",board:".../scenes.js",patch:"/downloaded/proposal.json"}`. It refuses a stale base fingerprint. Render, inspect, approve and refresh afterward. This is an explicit proposal workflow, not a pretend save button on a read-only page. The shared local review shell is preserved.

## Checks and compatibility

`check` returns location findings; `ready:true` requires current reviewed renders. Full check-scenes invokes the same check. Existing boards with no location binding keep their behavior. Storyboard apply validates bound manifests before writing. All location artifacts belong under ignored `data/`. Installations ship server/dist and the compiled viewer.

A runnable authored set is [location-example.js](location-example.js): `node location-example.js /absolute/data/location-review`. This writes a spec and a test board, not a publishable episode. Use `receipt` after an actual generation with provider, callId, referencePaths and output to bind the output bytes to the sent references. The viewer shows the recorded result beside the references. State changes export a `location-state` proposal and use the same `camera` apply action.

After inspecting actual generated pixels, call `review` with verdict pass/warning/fail, reviewer and observed notes. Receipt and review bind output bytes; a changed output fails validation. The viewer displays the verdict without inventing a pass. End-frame generation requires the real generated opening image in visual.bg: `endFrameReady` stays false until that file has a current receipt and passing pixel review, then endFrameImageArgs contains opening image followed by the location endpoint render.

The general still assembler also carries location inputs: run `assemble-bg-prompt.js --json` and forward its image arguments. Bound locations reject text-only output so references cannot disappear silently. Production pre-call checks revalidate bindings and generated outputs.
