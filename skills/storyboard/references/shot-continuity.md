# Carry a scene across shots

## Contents

- [Plan the action and its opening](#plan-the-action-and-its-opening)
- [Use an observed endpoint](#use-an-observed-endpoint)
- [Respect adapter inputs](#respect-adapter-inputs)
- [Review the assembled connection](#review-the-assembled-connection)

This workflow uses existing scene, camera, blocking, prop and edit fields. Findings
are advice, not a quality score, approval step or automatic generation veto. Preserve
authorization and model choices. Do not regenerate existing footage just to fill records.

## Plan the action and its opening

Write the continuous scene before dividing it into shots. A dialogue line does not
require a cut. Keep a tray set-down, doorway crossing or handover in one shot when
that conveys it clearly. When splitting an action, choose its actual phase at the cut.
An intentional time skip can use a reaction or motivated change of view; state that
choice in `edit.reason` and `edit.continuity` instead of pretending motion is continuous.

Use `shot.videoDesign.before` for the physical opening: actor position, body direction,
gaze, hands and prop contact. Use the final motion beat (or `after`) for the closing
state. "Before dialogue/action" is not an observable pose. An opening still shows the
instant before the promised change: before hiding, before a head turn, before placing
the tray. A picture of the completed action cannot serve that purpose.

On a recurring set, use `shot.location.continuityGroup` and `blocking` to carry all
actors' end poses into the next start, including actors outside the crop. Retain prop
custody in the existing prop ledger. Author distinct numerical cameras for the wide,
insert and reverse view; changing `visual.camera.framing` does not move a location camera.
Inspect the rendered set with its actors. A blank wall or an empty set is not a useful
blocking reference merely because the render succeeded. Verify door, desk, actor positions
and viewing direction before styling the image. Correct an obstructed camera locally.

`shot-continuity.js` derives connections in playback order, including scheduled inserts.
Explicit groups may continue across an intercut. Without a group, adjacent shots in the
same scene/place are review candidates; legacy same-location links are labelled inferred.
Different explicit scenes/places are not silently joined. An incoming location
`continuityBreak` explains a deliberate skip. Missing groups or blocking remain visible
as warnings, including on old boards. No fields are auto-filled with invented poses.

## Use an observed endpoint

Generate dependent shots in scene order. After inspecting and selecting a clip, set
`visual.video.clip` to the accepted file, `edit.in` to the selected source start and
`duration` to the measured used duration. After a crop, point at the cropped clip first.
Capture the last source frame inside that selected interval, not the unused file tail:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/storyboard/references/shot-continuity.js" \
  /episode/storyboard --shot 9 --capture --apply
node "$CLAUDE_PLUGIN_ROOT/skills/storyboard/references/shot-continuity.js" \
  /episode/storyboard --shot 10
```

The capture writes a PNG under `images/continuity/` and a `visual.video.observedEnd`
record with clip/image hashes, selected interval and source frame. It requires one local
constant-frame-rate generated clip. Grouped/imported footage needs separate inspection;
the helper does not guess its selection. The default command without capture is read-only.
Capture is not visual review, and no planned ending image is relabelled as observed.

`spatial-prompts.js` returns `continuity` and attaches a current observed endpoint to
`sourceImageArgs.referenced_image_paths`. Preserve those arguments when calling the
selected image tool. The source prompt distinguishes its state reference from the
current composition and cast/style references. For an unchanged numerical camera and
framing, `continuity.suggestedFirstFrame` identifies a possible direct continuation;
inspect it against the authored opening before using it. A changed angle uses the same
actor/prop world state rendered from the new camera, not copied screen-left/right.
The location/previz composition retains priority. Do not concatenate reference images
into the shot or silently replace an already approved opening.

Changed clip bytes, selected interval, camera, location or action state make the capture
stale. A changed captured PNG also invalidates it. Stale images are omitted from automatic
reference arguments; recapture an accepted local edit or continue with honest missing
evidence. This does not authorize regeneration spending. `storyboard_read` and
`speech_manage plan_video` expose this same context; a speech plan is not evidence that
the caller actually supplied a referenced image to a video adapter.

## Respect adapter inputs

For ASTRA image-to-video, the actual schema accepts `firstFramePath` and optionally
`lastFramePath`. Use the authored opening/ending images only when they match the intended
selected action; plan enough duration for it. `visual.frames.end` is the planned endpoint,
and `visual.video.observedEnd` is evidence from a generated result. Keep them distinct.
ASTRA audio-to-video accepts one `imagePath` at frame zero; it has no last-frame or previz
video argument. Use a correctly staged opening and inspect the returned action. Never
claim endpoint control from a prompt or invent unsupported arguments. Other selected
adapters follow their own real schemas and capability evidence; do not switch engines.

## Review the assembled connection

After trimming, cropping or replacing a clip, compare its new opening/closing frames
with both neighbours. Restore required shoulders, door frames, contact points and gaze
targets if a crop removed the relationship. Reconcile the shot plan with the accepted
framing. A text-removal crop or a short usable excerpt does not itself repair continuity.

The canonical builder writes `work/seams/*.mp4` and paired PNGs from each actual master
boundary. The left image is the outgoing last frame; the right is the incoming first
frame. `edit-check.json` records their frame numbers, image hashes and `not_reviewed`.
Inspect those pairs and normal-speed excerpts for repeated gestures, missing travel,
prop contact, gaze, screen direction and shot size. Moving joins may hide the new action;
inspect the whole excerpt as well. Encoding and pixel-provenance checks establish that
the intended edit was rendered; they do not certify that the connection looks natural.
