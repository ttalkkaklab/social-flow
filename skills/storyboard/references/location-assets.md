# Persistent locations (v1)

A location is an immutable Blender set plus semantic JSON, not a collection of independently generated angles. Use the existing storyboard/produce skills; `location_manage` is the bundled local tool. It never calls paid providers. Blender is required for location authoring/rendering; existing three.js previz remains available for other shots.

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

A generated video's grey motion previz and the location still must share the same numerical camera and blocking. The location render does not replace the existing required motion previz. Inspect the start image against the set before spending on video. Inspect start/middle/end and disocclusion moments in the clip; metadata approval is not visual quality proof. Existing assembly HITL rules still apply. Direct Blender location renders are available when exact architecture is required.

## Interactive review and camera changes

Refresh with `storyboard-html.js`. The shared HTML embeds a location section with GLB orbit, shot camera, top view, wall visibility, object lookup, camera-path scrub, and reference images. Serve the channel directory over local HTTP; file URL GLB loading is not guaranteed by browsers. All runtime assets are bundled; no CDN is required.
Exploration and wall hiding never write the set or the shot. `Export camera proposal` downloads a versioned JSON patch; apply with `{action:"camera",board:".../scenes.js",patch:"/downloaded/proposal.json"}`. It refuses a stale base fingerprint. Render, inspect, approve and refresh afterward. This is an explicit proposal workflow, not a pretend save button on a read-only page. The shared local review shell is preserved.

## Checks and compatibility

`check` returns location findings; `ready:true` requires current reviewed renders. Full check-scenes invokes the same check. Existing boards with no location binding keep their behavior. Storyboard apply validates bound manifests before writing. All location artifacts belong under ignored `data/`. Installations ship server/dist and the compiled viewer.

A runnable authored set is [location-example.js](location-example.js): `node location-example.js /absolute/data/location-review`. This writes a spec and a test board, not a publishable episode. Use `receipt` after an actual generation with provider, callId, referencePaths and output to bind the output bytes to the sent references. The viewer shows the recorded result beside the references. State changes export a `location-state` proposal and use the same `camera` apply action.

After inspecting actual generated pixels, call `review` with verdict pass/warning/fail, reviewer and observed notes. Receipt and review bind output bytes; a changed output fails validation. The viewer displays the verdict without inventing a pass. End-frame generation requires the real generated opening image in visual.bg: `endFrameReady` stays false until that file has a current receipt and passing pixel review, then endFrameImageArgs contains opening image followed by the location endpoint render.

The general still assembler also carries location inputs: run `assemble-bg-prompt.js --json` and forward its image arguments. Bound locations reject text-only output so references cannot disappear silently. Production pre-call checks revalidate bindings and generated outputs.
