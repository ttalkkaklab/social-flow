# People, objects and settings that fit the cut's purpose

## Contents

- [Choosing the treatment](#choosing-the-treatment)
- [Authoring order](#authoring-order)
- [Optional: the scope of 2.5D illustration](#optional-the-scope-of-25d-illustration)
- [Catalog callouts that point at a part](#catalog-callouts-that-point-at-a-part)
- [Verification](#verification)

## Choosing the treatment

| The point of the cut | Treatment | Movement |
|---|---|---|
| Introducing a person, a mood, a place | A finished still with a camera move | Travel slowly toward the expression or the object of interest. |
| A principle, a quantity, an operation, a situation | HTML animation with real 3D objects | Change the part, position or state the narration describes. |
| An explanation in which a person acts | An HTML scene with a cute 3D doll character in the same style | Match gaze, hand gestures and contact with objects to the explained action. |

The name of a person or an object appearing in the line is no reason to choose an
explanation cut. Write the change the viewer must understand first. A principle that needs no
person is built from objects alone. A cart is a cart with wheels, an axle and a bed; a device
shows how its parts join and work. A real object is never replaced by a labelled box or circle.
Bars and relation lines that compare abstract quantities remain fine.

Give explanation scenes a setting that fits the situation. Offer clues that identify the
place, such as an office, a supply depot or a workbench, and set the distances of foreground,
floor and background. Black or a flat colour is not the default. Unify the materials, light
and perspective of character, objects and setting. Realistic figure paintings with separate 3D
props laid on top are not a substitute for a cute 3D doll performing the action.

## Authoring order

1. Decide where the person's gaze and hands go. Write what changes in the next sentence.
2. Place foreground, person and background. Build distance with windows, tables, architecture
   or a far landscape.
3. Match the light direction, exposure, colour temperature and floor viewpoint of the 3D
   character, objects and background.
4. Reserve the space for title and subtitles at image-generation time. Never put text over a
   face.
5. Separate quiet breathing, head and wrist motion from the action the sentence describes.
   Large actions use a rigged model or separately produced motion material.

Camera direction follows the cut's meaning. Introducing a person: focus in on the face. From
a hand's action to a judgement: rack focus from hand to face. Stressing a small clue:
approach that part. When the surroundings matter, pull back from the person. Use a foreground
reveal to uncover something hidden and depth parallax when the space itself matters. Never
cycle effects by cut number. Write the focus position and the reason for the move into the
plan, and confirm the face and hand coordinates on the actual picture. A foreground move
needs a transparent layer and a background filled in behind it.

Where possible the character performs the line's action itself. Build the sequence of moving
a piece, stamping a document or pulling a cart: anticipation, hand contact, the moment of
effort, release. While walking, match feet and body travel, and keep the hand on the object
it holds. Repeated nods and fan waving cannot stand in for different actions.

Generated images follow the image tool the host and the user chose. Files made with the host's
built-in `image_gen` (Codex, Grok) are copied into the project. Never switch to a separate API on your own.

## Optional: the scope of 2.5D illustration

The default for a person or mood cut is a camera move over the whole image. Partial
deformation is used only when chosen separately. `illustrated-scene-runtime.js` deforms small
regions of a still illustration and moves the camera slowly. It is not a real 3D mesh or
skeletal animation; record it as `illustration2.5d` in outputs and verification notes. Do not
imitate a large arm movement, walking, speech or picking up an object this way. When the
operation of a machine or a prop is the point, use the real meshes in
[mesh-objects.md](mesh-objects.md).

`ILLUSTRATED_SCENE.mount(canvas, decodedImage, config)` returns `draw(seconds, duration)`.
`config.duration` is a finite length in seconds. `joints` holds at most 8 entries, each with:

| Value | Meaning |
|---|---|
| `region: [x,y,rx,ry]` | Normalized centre and influence radius in the source image. y grows downward. |
| `start`, `duration` | Start and length of the motion, in seconds. |
| `dx`, `dy` | Displacement normalized to the image size; absolute value at most 0.025. |
| `angle` | Rotation in radians; absolute value at most 0.09. |
| `breath`, `frequency`, `phase` | Breathing displacement and period factors; displacement at most 0.004. |

The limits are not a quality guarantee. Check the deformation of face, hands and background in
actual playback and reduce it further when needed. If a window bar or a desk edge bends along,
re-place the region or remove that motion.

`__ready()` waits for image decode and initialization. `__seek(tMs, group)` calls `draw()` with
the absolute time that adds the measured lengths of earlier groups. Breathing and the camera
must not restart when the group changes. When narration length changes, update the total
length and the group boundaries with it. Add diagnostics to `__meta()` and never let a missing
image or a WebGL initialization failure pass. No infinite loops, wall clocks or autoplay in an
authored slide.

Dimming a background to make text readable uses the template's `.scrim`. Do not invent a
background effect under another name to get around the text-gradient and glow ban.

## Catalog callouts that point at a part

When the character's action makes the point clear, add no marks. Explaining an object's
principle points at only the necessary parts, one at a time and briefly. Write the reason and
the start and end time of every mark into the plan. When a part has to be pointed at, use the
small ring and leader line in [catalog-callouts.js](catalog-callouts.js): a thin line starts at
the part and runs to a label in clear space. Never circle the subject with a large ring or
cover it with an arrowhead. `h.mark.arrow` is for direction of movement only.

Pass `group`, `part`, `label: [x,y]`, `side`, `text` and `project()` to
`CATALOG_CALLOUTS.mount(svg, specs)`. Label strings come from `scenes.js`. `project()` returns
the part's current screen coordinates `{x,y,visible}`, from the mesh runtime's
`project(part, localPoint)` or the viewport element's `projectMeshPoint(part, localPoint)`.
When a parent element is enlarged by a camera move, account for the position and size from
`getBoundingClientRect()`.

`draw(group, tMs)` shows ring, line and label in order. No arrowheads or repeated pulses on
the line. The anchor follows the moving part; the label stays fixed in clear space. When lines
cross or a label hides a face, re-place the label. Never invent numbers, dimensions or part
names the narration does not say. `style:"restrained"` uses a small anchor, a light line
backing, a dark leader line and unnumbered labels. `delayMs` and `endMs` make it appear briefly
and disappear. Parts and letters must stay readable on a phone.

## Verification

Look at still frames and at actual playback. Seek back to the same time six or more times and
confirm the state reproduces. Check that person and camera continue across the boundary of
adjacent narration groups. On a phone, face, key text and arrows must not hide one another.
When a bright, simple 3D prop floats over a dark photoreal illustration, match material and
light or recompose the explanation area. A passed check or the use of a mesh does not decide
polish on its own.

The downloadable HTML includes images, runtime, models and voice. Delivery is not finished
while a source picture's path exists only in a developer folder or a thumbnail or linked video
is an earlier version.
