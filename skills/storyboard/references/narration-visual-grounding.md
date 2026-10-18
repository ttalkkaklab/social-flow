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


## Review the complete visual sequence, not its cover

A narration block can contain several editorial cuts. `visual.src` is only its
representative image when `productionPlan.cuts` exists; it is not proof of complete
coverage. Enumerate every cut in playback order, with its path, duration and actual
image or inspected video frame. Never attach only `cuts[0]` and call the block reviewed.
Video-only entries remain visually unverified until opened or sampled; sampled frames
establish composition only. Preserve the distinction between a source opening, a conte
panel, an editorial cut and completed playback.

Before drawing, make an episode-wide picture sequence. Compare each cut with both its
neighbours and earlier uses: subject, action, object state, scale, camera position,
setting and graphic structure. Changing words in the same three-box diagram is still
visual repetition. Changing a filename, crop or camera push does not create a new event.
A deliberate callback needs a visible new consequence or a bounded editorial role;
its repetition cost still counts. Do not delete substantive narration to fit spare art.

Use a map for spatial relations, a quantitative chart for amounts, attributable evidence
for documentary claims and staged action for reconstructed events. These are choices
based on the information, not quotas. A generic card factory must not silently replace
missing maps, documents, action or reactions. Related words on a card do not establish
that its arrows express a meaningful causal, temporal or organizational relation.

For a requested image-improvement loop, freeze the user's rubric before authoring.
When relevance and repetition are the priority, use content agreement 50, new visual
information/nonrepetition 35 and visual craft 15. Open actual images, describe visible
facts first, then justify each deduction. An absent decisive comparison cannot receive
near-full agreement; a duplicate with no new consequence cannot receive near-full novelty.
Keep planned actions and pixels separate. Attractive light cannot repay lost meaning.

Score each requested shot and each constituent cut before aggregating. Report the mean,
minimum, unreviewed count and severe defects separately. Never copy a chapter average to
individual shots or declare every shot passed because the mean passed. Bind reviews to
exact paths/hashes and their coverage; changed text, images or edit order stale that scope.
Existing review files are historical evidence, never a prior score to reproduce.

When improving the plugin against an episode, fix reusable authoring/review causes first,
run tests, install the changed files on the user's machine and verify their hashes. Only
then may an author reload the installed skill and rewrite the episode. Retain the previous
board and reviews, record the installed root and hashes used, and use an independent
reviewer who does not see the desired score or prior scores. Repeat installation before
each authoring iteration. A rewritten plan without its actual images cannot satisfy an
image-quality target. Keep factual qualifiers, scope and existing media authorization.

Run the read-only inventory before visual review:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/storyboard/references/visual-coverage-audit.js" storyboard/
```

It lists every editorial cut, byte-identical images, unavailable images and shared review
scores. It does not infer semantic fit, perceive template similarity or assign scores.
Use its complete inventory to choose which actual assets to open, not as visual approval.

## Repair meaning and continuity before another image batch

For a revision, translate each observed defect into a visible acceptance condition before
generating. Keep that condition in the existing shot notes: the information to add, the
misreading to remove, the exact reference to preserve and the adjacent cut it must match.
Do not replace one abstract diagram with another merely to change its silhouette.

Audit graphic semantics independently of their text. A central hub implies leadership or
control; equal membership belongs within an organization boundary without invented counts.
An overlap claims a shared set; an arrow claims direction, sequence or causation; area and
height imply magnitude. Use them only for supported relations. Geographic connectors must
distinguish approximate movement from a documented itinerary. Dates belong on an explicit
chronological axis, not an unexplained rising and falling line.

For each repeated prop, compare the actual adjacent images together: colour, binding, page
design, closure, size, custody and state. Carry the chosen reference into subsequent image
edits. A book comparison needs the same spread; receiving and returning money needs the
same purse; a help/result sequence needs the same recipient and work in progress. Preserve
character identity and recurring officials too. Different camera angles alone cannot turn
the same teacher-leaning-over-pupil action into new information; show preparation, a specific
learning task and the learner's independent result when those fit the narration.

Choose documentary treatment from the evidence, not a quote-card template. Distinct source
details, a carefully bounded comparison or a source-led chronology can explain different
claims. Keep attribution legible and distinguish original scans from modern typesetting.
Do not invent archival-looking receipts, handwriting or result sheets. Reconstruction and
conceptual-example qualifiers must be visible in the storyboard presentation, with a clear
plan for the audience-facing edit; buried metadata does not establish that viewers see them.
This does not authorize marks on video or a second set of burned captions.

Reinspect the whole sequence after local repairs. Check that replacing a generic card has
not created a new run of identical tables, source pages or close-ups. A callback should
juxtapose concrete earlier evidence with a new consequence, not repeat a familiar label.
For a long still, add another panel only when it supplies necessary new information; do
not claim that future camera movement fixes an image that currently adds nothing.
