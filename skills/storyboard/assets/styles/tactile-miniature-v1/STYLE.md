# Tactile miniature · the default full-video look

This pack ships reference images and rules together so another machine starts from the same
materials and spatial treatment. The images are explanatory pictures generated for this
project. They are not frames from the YouTube reference, not historical material, and not the
likeness of any real person. They do not promise pixel-identical output; results vary with the
model and the scene.

## What to design first

Settle the meaning of the line first. For each cut, write one sentence naming who does what to
whom and what the viewer has to see. An introduction needs the person visible; complicity in an
arrest needs the victim and the relation of complicity visible; a reported story needs the
speaker and the person writing it down. Placing a book, a road or a room does not by itself
carry the line.

Then apply this pack's materials and light. A ship in a reference does not put a ship in
another topic, and a period costume in a reference does not dress a modern person. An
uncertain anecdote uses a staging that shows it as a claim, such as a model inside a book.
Never fabricate a real photograph or document.

## Choosing a reference

| Role · `visual.styleRole` | Image | What to borrow |
|---|---|---|
| `environment` | `cutaway.png` | walls and floors with thickness, connected rooms, timber and plaster texture |
| `character` | `character.png` | natural anatomy, restrained expression, cloth, side light that keeps the face readable |
| `interaction` | `conversation.png` | a person acting on someone or something, separate hands and props, matching eyelines |
| `transport` | `low-light.png` | cool exterior shadow with warm lamps, the scale of a person in a large space |
| `reported_story` | `paper-account.png` | a paper stage on a book, distinct from the real event; only for uncertain hearsay |

Roles are chosen by what the line is about, never by cycling through cut numbers. The style
reference for a first scene and the identity reference for a person are different things: the
first time a person is made, borrow the style only; connected cuts afterwards add the
approved image of that person as a further reference. Keep the person's age, costume and hair.

## Materials, light and composition

- Wood grain, paper fibre, plaster and stone surfaces and cloth should be felt. When a new
  topic's real material is metal or glass, switch to that material rather than defaulting to
  brown timber.
- Preserve contact shadows on the floor, wall thickness, and the joints of roofs and columns.
  Remake a floating object or a hand, door or prop that passes through another.
- The default is soft side light in ivory and brown. A threatening scene may use blue-grey
  shadow with warm interior lamps, as long as people and the action stay out of the dark.
- Compose so the relation of foreground, action space and background reads. Shallow depth of
  field that blurs the key subject is a failure. On a vertical screen the person, the hands
  and the relevant prop must still be recognizable.
- Expression and posture go only as far as the line supports. Explaining a wrongdoing does not
  add a demonic face, an unverified assault, or lines and inner thoughts for the victim.

## Handing off to video

Plan one action or one camera move per cut. In the start image, prepare the space that action
needs and the position of hands and props. When the end state matters, such as a closed door
or an arrival point, edit the start image into the end image rather than generating the two
independently.

The end image references that cut's start image directly. Never build a new scene from the
style sample alone. Two stills that agree do not prove that the video between them is right.
After an image edit, do not reuse the previous clip's review result.

## Order of calls to the generation tool

1. Run `spatial-prompts.js` from the installed plugin location. Read the `styleGuidePath` it
   prints and open the actual images in `sourceReferenceImages`.
2. Pass the output's `sourcePrompt` together with `sourceImageArgs.referenced_image_paths` to
   the built-in image tool. Writing a file path into the prompt does not attach the image.
3. Store the output's `styleBinding` in the scene's `visual.stylePack`. It holds the pack id,
   version, digest and plugin-relative paths, independent of the installation location. Never
   copy another machine's absolute paths.
4. Compare the generated picture with the line: the required person, action and recipient, a
   prop that could mislead, period-appropriate costume, fake lettering, and the start-to-end
   link, each checked separately. Beauty and content match are different things.
5. When the model cannot take image references or a pack file is missing, do not assume the
   same style quietly. Report the missing capability and ask before switching to a separately
   billed API.

When the line changes, compare the related image and plan again. A wording-only change can
keep the picture; a change of action, period, recipient or the certainty of a claim means a
redesign. A file's existence or a checksum is never recorded as a passed content review.
