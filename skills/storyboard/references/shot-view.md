# From the story beat to the opening image

## Contents

- [Plan attention across the scene](#plan-attention-across-the-scene)
- [Decide what the picture must prove](#decide-what-the-picture-must-prove)
- [Save one opening view](#save-one-opening-view)
- [Make and inspect the same picture](#make-and-inspect-the-same-picture)

Use this decision procedure for every new picture shot. It is the authoring source of
truth for content-led framing; the technique catalogue supplies vocabulary and examples.
Do not choose a camera by shot index, dialogue count, or a diversity quota.

## Plan attention across the scene

Before assigning each unit's visible cast and lines, read the complete scene as action
and speech. Name what changes, its visible cause and the response that proves the change.
Use existing story summaries and action fields; this is an authoring pass, not a new schema
or approval gate. Then compare the scene's views in playback order before making images:

1. Choose what the audience follows at each beat: a face, a consequential hand action,
   object state, observer's discovery or spatial relationship. A speaking character and
   the picture's attention subject are separate choices. Close-ups and two-shots remain
   valid when their performances carry the evidence.
2. Challenge runs of speaker A / speaker B / two-shot. Describe what each picture adds
   beyond identifying the voice. Compare a relevant action, POV or space view; replace a
   redundant portrait only when the alternative makes the event clearer. Different size
   labels, OTS shoulders or camera motion do not by themselves change the information.
3. Trace emotional continuity in visible behavior until a specific event changes it.
   Someone intimidated by a manager may grip a bag, stop at a doorway or follow at a
   distance. An invitation alone need not release that tension. Show the discovery and
   the manager's unexpected response before the first relaxed smile. Do not demand
   exaggerated fear, a new gesture every line or the same emotional arc in every story.
4. Select on_screen/off_screen from the chosen crop. Physical speech over a hand insert
   keeps its actual speaker and addressee; voiceover is for thoughts/narration, not a way
   to bypass speech routing. Retain visible body parts in the cast, keep unseen faces
   outside the crop and preserve axis, prop ownership and audible presence.
5. Reconcile story, expression, blocking, view, delivery and prompt together. If an old
   image already shows a relaxed pose before the release, replace that source image
   under the existing authorization before regenerating video. Metadata alone cannot
   turn an accepted portrait into an insert or establish a performance in the pixels.

Do not enforce insert/wide percentages or cut-count targets. Decorative object shots,
repeated nervous gestures and withheld essential reactions fail this pass even when the
size distribution looks varied. A sustained facial performance can be the best choice.

## Decide what the picture must prove

Read the shot story, opening action, spoken line and its neighbouring shots. First name
the visible evidence the audience needs, then choose the smallest frame that preserves it.
A monologue is speech, not a framing instruction: its face, hands or surroundings may carry
the story. Keep the character in the shot cast even when only their hand or foot is visible.

| Evidence in this beat | Size and opening view to consider | What would make it wrong |
| --- | --- | --- |
| A confession changes the face | cu, eye, a motivated three-quarter or frontal view; name the gaze and expression change | The face does not change, or the decisive hand action is cropped out |
| Words conceal fear, but the hand betrays it | insert or ecu on the named hand; choose side/high/overhead to expose its action | A portrait illustrates the speaker while hiding the evidence |
| A foot hesitates before crossing a boundary | insert on foot and boundary, low or ground; side view exposes the gap | A face close-up omits the decision's physical evidence |
| An object reveals the answer | insert on the object and its readable state; angle from which the clue is visible | An unrelated object or the whole room becomes the subject |
| Someone sees something before reacting | named observer → POV of named subject → reaction when needed | POV has no observer, or the reaction is revealed too early |
| Two people negotiate or confront each other | ms/mfs for simultaneous action; ots/reverse when one person's response matters | Automatic single shots for every line lose simultaneous reactions |
| Distance or isolation is the information | ls/els with the person and the relevant surroundings; eye/high as the geography requires | Close-up erases the relationship; high angle is chosen only to signify weakness |
| A whole-body action changes the situation | fs or mfs if the feet are irrelevant; side/three-quarter to expose contact and travel | Front view hides contact, or the crop removes a needed limb |
| The scene turns on what happens to an object | insert or cu on the object at the moment it changes, the hand or foot that changes it entering the crop | The object stays small inside a person's medium shot, so the event the scene turns on reads as background |
| Something vast comes into view, or the space changes around the people | ls/els, or a move that opens from the observer onto the whole | A medium shot crops the scale, so the reveal reads as a detail |

Height and horizontal viewpoint are separate: `angle:eye` never means “face the camera”.
Use low/high/overhead only for a visible relationship or useful view of the evidence.
When the angle is not eye, write in `view.reason` what that height shows that eye level
would hide: the ground a foot stands on, the layout of things on a table, how large
something looms over the person.
Front is deliberate when direct address, symmetry or a readable reaction calls for it.
Compare the candidate with one alternative and write why the chosen view shows the evidence
better. Name this beat's own object, gesture or place in the reason: one sentence frame
reused across shots with the nouns swapped says nothing about any of them. Repeated setups
are valid when their content calls for them; no close-up limit applies.

## Save one opening view

Use `shot_icons` to write size, angle and `view` together. It saves `view` at
`visual.camera.view` and uses its subject as `shot.info`. `why` is the size's reason and
`view.reason` the viewpoint's and height's. Neither is copied into the other: a shot written
without `why` keeps none, and the result names it.

```json
{
  "id": "s0001",
  "size": "cu",
  "angle": "eye",
  "why": "The admission is one small change in her face",
  "view": {
    "subject": "Mina's hesitation before admitting the truth",
    "reason": "From the listener's side her eyes slide away before she answers",
    "crop": "Mina's face and shoulder tops fill the frame, gaze toward the listener off camera-right",
    "mode": "three-quarter-left",
    "subjectId": "mina"
  }
}
```

`subject` and `crop` are English provider text; `reason` is editorial context. Include screen
placement and gaze in `crop` when relevant. Modes are front, three-quarter-left/right,
profile-left/right, rear, ots and pov. Left/right name the visible side of the subject:
profile-left exposes the left side, with the nose pointing camera-left. Front is 0°, left
three-quarter/profile +45°/+90°, right -45°/-90°, rear 180° relative to the subject's body.
For an object, bearings use the set's -Y front axis. OTS requires `subjectId` and `viewerId`
of different staged subjects, with a person as its subject. POV requires the observer's
`viewerId`; give `subjectId` when what they see is a staged actor or set object, and leave it
out when no id stands for what they see and `subject` describes it. POV uses eye height.

Write `crop` as visible boundaries, not a copy of `subject` or the action. “Mina reaches
for the key” describes an event but leaves the camera undecided. A usable insert crop is
“Only Mina's right hand and the key on the desk; wrist enters at bottom-left, fingertips
stop short of the key at centre-right; face and torso outside the frame.” Name the
body boundary for a portrait, the evidence that must fit, and relevant screen placement.
Do not add a face or the whole room just because their reference sheets show them.

Before generating, compare the previous shot's ending with this opening: who holds each
prop, which anatomical hand acts, who stands on each screen side, and what has already
happened. Anatomical left/right is not screen left/right. State a deliberate reverse or
new axis when screen positions change. Show the moment before the planned movement;
an opening that already completes it removes the action the video needs to perform.
That rule is about movement. The face opens in the shot's emotion (`shot_characters`
`expression`): a video model keeps an opening expression far more readily than it changes one.

`shot.size` owns the scale and `view.crop` refines that same scale. A person MS keeps
waist-up boundaries, MCU chest-up, CU face and shoulder tops, and FS head to toe even
when a view is present. Write both size and crop when changing the scale. Set
`view.subjectType:"object"|"detail"` when framing a prop or body detail despite a
character being in the cast; the ordinary default is `person`, while insert/ecu and
an explicit detail target use detail wording. Do not use an object override to hide a
contradictory person crop. A detail in a built set needs its actual target or object id.

Image planning and set-camera planning refuse explicit contradictory declarations
with `shot_framing_conflict` (for example CU plus “full body, head to toe”). Correct
size/crop or the second camera instruction in the image's action prompt, then retry.
This is an input-consistency check, not a judgment that the story needs a close-up,
and it cannot understand every natural-language description. The image prompt keeps
one size instruction rather than adding an older framing technique as a second size.

For a built set, name the blocked subject or visible object with `subjectId`. For a body
detail (`insert`/`ecu`), supply `target:{point:[x,y,z],span:...}`: the actual world-space
centre of the opening detail and its visible vertical extent in metres. Derive it from the
staged pose and inspect the local render; never invent a hand coordinate from standing
face height. For example a staged hand centred at `[0.3,-0.1,0.9]` with a 0.25 m crop uses
that point and `span:0.25`. That example is not a reusable anatomical default. A set object
can instead be targeted by `subjectId` and its actual bounds. Without a set, subject/crop
text carries the detail and no world-space coordinate is needed.

The structured view owns the opening crop and viewpoint. It supersedes legacy opening
`camera.framing`, rear/pov flags, viewpoint/framing techniques and space/composition prose;
keep those fields for older boards only. Use `camera.end` and numeric location endpoints
for a different closing view. A move describes travel from the chosen opening, not a second
opening viewpoint. Choose a move compatible with that view.

## Make and inspect the same picture

`shot_image` sends the same view to the set camera and image prompt. Explicit views do not
silently swing around an obstruction; fix the blocking or revise the view when the render
reports an obstruction. Missing subjects, observers or detail coordinates are invalid set
inputs, not permission to substitute a frontal portrait or room-wide crop.

Without a set, the selected front/back location panel supplies directional geography and
appearance, not a required wide frame. Preserve spatial relationships of visible landmarks;
landmarks outside the authored crop stay out. The authored size, angle and subject viewpoint
control the output. Character sheets supply identity, not pose. Even with a face panel
among the references, a hand-only crop must show the hand only. For each returned image,
compare the actual pixels with subject, crop, visible side, camera height and the opening
action. If the picture hides the evidence or contradicts the view, correct the earliest
wrong stage (story choice, view, blocking, then prompt) and regenerate within existing
authorization and attempt limits. A prompt/metadata match alone never certifies the image.
No extra review approval or paid test generation is implied.
