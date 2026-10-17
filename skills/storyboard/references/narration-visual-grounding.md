# Ground narrated meaning before drawing the storyboard

## Contents

- [Decide what the picture contributes](#decide-what-the-picture-contributes)
- [Turn the chosen contribution into a drawable opening](#turn-the-chosen-contribution-into-a-drawable-opening)
- [Inspect content separately from appearance](#inspect-content-separately-from-appearance)
- [Carry the same contribution into motion and review](#carry-the-same-contribution-into-motion-and-review)

Use for narration-led or mixed scenes, including documentary reconstructions. Apply it
before source-image prompts, then compare the actual images before video generation.
It supplements character, prop and location continuity; matching a face and a room does
not establish that the picture serves the sentence. Silent and dialogue-led scenes keep
their own event structure. No new schema, approval, score gate or paid call is required.

## Decide what the picture contributes

Read the complete scene and its narration before assigning shots. Identify what the viewer
needs to learn: an event, a cause, a comparison, an identity, a reaction or a transition.
Choose which information belongs in the voice and which visible detail supports it. One
sentence need not become one shot; one shot may support several lines, or one narrated
event may need an establishing view, an insert and a reaction.

In the existing `shot.info` state the audience information. In `shot.render.reason` explain
the picture's contribution and its limits: direct depiction, source evidence, reaction,
context or deliberate counterpoint. These are useful distinctions, not enum values or
required labels. A mood shot can be appropriate when the surrounding scene supplies the
event; it cannot silently take the place of every event in the scene.

Ask: could this same image accompany a different sentence about the same person without
changing anything? If so, identify its specific contextual purpose or redesign the cut.
Camera variety, expressive faces and consistent costumes do not answer that question.
Do not force literal illustration of abstract thought, negation or future consequences.

For example:

| Narrated information | Weak match | A useful direction, subject to available evidence |
|---|---|---|
| A student abandoned the examination after witnessing corruption | A lone student looks back at an empty courtyard | Attribute the recollection in the voice; use a verified source detail or clearly contextual exam setting, then the reaction. Do not invent a bribe or its participants. |
| He compared his face with a physiognomy book | A handsome face beside an unidentified book | Frame the book, mirror and eyeline so the comparison can develop; establish why this is that book without fabricating a historical page. |
| He valued a good heart over good looks | A beauty close-up with a relaxed brow | Connect the already established mirror/book comparison to a changed focus or deliberate handling of those objects. The voice carries the abstract proposition; the image carries a bounded reaction. |
| His later choices connected helping people with serving his country | A person opens a door | A doorway may close the opening as a deliberate forward-looking bridge, but does not illustrate later public service. Explain that role; plan actual later evidence only within the requested scope. Preserve approved narration and its factual qualifiers. |

These are editing alternatives, not claims that the historical actions happened. Research
establishes which sources may be shown and which details can be reconstructed.
Do not weaken or replace approved narration merely to fit convenient existing images.
Repair the visual plan first. If a wording change is genuinely needed, identify it as a
proposed editorial change and preserve the user's scope; a permitted forward reference
need not be deleted because its later scene is outside an opening-only deliverable.

## Turn the chosen contribution into a drawable opening

Write `shot.videoDesign.before` as one visible instant before the action. For a still,
use `visual.action` to describe the single depicted moment. Specify the subject, readable
object/detail, gaze or contact and framing that makes the contribution possible. Carry
this into `visual.bgPrompt`; `shot.info` alone is an author note, not a generated picture.
Use the selected assembler when applicable, and apply the same distinction to host image
calls made directly: editorial context explains purpose, while the opening specifies pixels.

For an image-to-video cut, the opening establishes the necessary people, objects and
relationships; the action delivers the later change. Do not put the completed transfer,
opened door or final realization into the opening merely to match the spoken outcome.
Do not demand that one still prove every clause of a sentence. In still-camera mode there
is no later subject action: recut or change the plan if the meaning depends on one.

Choose subject and evidence before reference images. Character sheets constrain appearance;
prop sheets constrain object identity; background sheets constrain geography. They do not
choose the story event, require the protagonist in every cut or prohibit an evidence insert.
A source document, object detail or establishing shot may be the most relevant picture.

For factual/adapted material preserve `STORY.adaptationBoundary` and the claim's qualifier.
A recollection is a recollection, a later witness account is not a verified last utterance,
and an illustrative reconstruction is not archival evidence. Do not invent a transaction,
quotation, date, historical page or named participant to make the image more literal.
Use verified archival material only with provenance and usage rights; otherwise keep the
image explicitly contextual and attribute uncertainty in the voice or permitted source
presentation. Follow the current clean-master policy; do not add generated lettering or
burned captions to compensate for weak imagery.

## Inspect content separately from appearance

Before motion, inspect each assigned source image alongside its actual line and immediate
neighbours. First describe only what is visible, without reading the intended action into
the pixels. Then compare that observation with the planned contribution and opening state.
Check content fit, factual implications and action readiness separately from identity,
style and spatial continuity. A blank book, unrelated portrait or generic empty room can
pass all three appearance checks while failing its narrative job.

Keep brief observations in the existing review notes: shot ID, line or meaning, observed
detail, role/limits, missing detail and proposed correction. Use `issue`, `verified` or
`unverified` honestly; a hash, schema pass or styleMatch flag cannot verify content.
When pixels are unavailable, assess the plan only and report image agreement as unverified.
Do not label a source still as proof that a later action was performed.

If the plan itself is weak, correct its staging before generating another image. If a good
plan produced the wrong picture, target the image correction. Reinspect changed narration,
purpose, grounding, source image or opening; refresh affected prompts instead of reusing a
stale `bgPrompt`. Stay within existing authorization and spending limits. An inspection-only
request does not authorize regeneration, and findings do not create a new approval gate.

## Carry the same contribution into motion and review

Compare `videoDesign.action`, `performance`, `narration[].acting.visual` and the final
provider request with the chosen opening and contribution. Correct contradictory copies.
In voiceover image-to-video routes, the model may receive neither the narration audio nor
its literal words. The authored visual action must therefore carry the intended relation;
do not expect the adapter to discover missing events from a generic head turn. Keep exact
spoken words out of motion prompts where the adapter's text policy requires it.

Review in two passes: what the pictures alone actually show, then how voice and pictures
work together. The picture-only pass need not reconstruct an entire documentary argument;
it detects generic or misleading imagery that narration masks. Report a deliberate context
or reaction shot as such, and assess its surrounding scene. Inspect actual playback for
completed actions and timing; sampled frames cannot certify the whole clip.
