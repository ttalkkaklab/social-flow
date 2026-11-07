# Asset sheets before shot design

Follow [production order](../../_shared/production-workflow.md). Complete project setup,
then character text/images before text storyboard authoring. Derive props from that text
and complete their text/images, then backgrounds, before composing the image storyboard.
Inspect and reuse existing sheets. Missing media or spending authorization is reported, never
silently bypassed; it stops no other step except the episode cast's own panels (production-workflow.md).

- **Characters:** follow [character identity](../../channel/references/character-identity.md).
  Read/create `assets/characters/<id>/identity.md`, export the shared character sheet, and
  bind the selected identities through `cast.json` and `SB_DOC.characters`. Include identity,
  appearance, wardrobe, behavior and speech/voice choices, marking unresolved fields honestly.
  New visual sheets use headless front/back mannequin panels and one face close-up;
  follow the linked character-panel contract for generation and legacy reuse.
- **Props:** use [prop continuity](prop-continuity.md). Write canonical `SB_DOC.props` in
  `scenes.js`: stable id, name, concrete appearance/material/scale, references and tracking.
  For handled/transferred props, establish `propContinuity` initial ownership, custody,
  location and condition before adding shot events. Link appearances with `visual.props`.
  Do not create a second editable prop-sheet file.
- **Backgrounds/locations:** write canonical `SB_DOC.locations` in `scenes.js`, including
  one-off backgrounds and abstract stages. Each entry has `id`, `name`, `description`,
  `layout` (entrances, landmarks, actor/object positions and movement space), `lighting`
  (time/weather/light), `invariants` (what stays consistent), `panels: {front, back}`
  (image paths relative to the storyboard), and optional legacy `imageUrl`, `sheetPath`,
  `manifest`. Generate **both front and back camera views by default**, as separate images,
  with the saved image model and existing spending authorization. Plan and quote both calls.
  Define front as the establishing camera looking into the space; back looks across that same
  space from the opposite side, 180 degrees around it. Describe both camera positions, look
  targets and visible landmarks in `layout` before generating. Make the front first, then
  use it as a reference for the back with the opposite viewpoint explicitly described:
  preserve architecture, object world positions, materials, time and light; reveal the
  opposite side, never mirror the front image. Follow [image routing](../../_shared/image-routing.md)
  for the saved model's reference support; never switch models silently. Inspect both images
  and save their paths in `panels.front` and `panels.back`. `imageUrl` may alias the front for
  older readers. Explicit text-only requests record the two planned views without generating.
  Reuse existing panels; report a missing direction and generate it within authorization.
  Missing media is reported with the background sheet. Use `visual.locationId` to reference
  this planning sheet. For each shot, choose `shot_icons.backgroundView:"front"|"back"`
  from its opening camera position relative to this layout. It saves
  `visual.camera.backgroundView`; omission keeps the earlier choice, initially `front`.
  A reverse shot uses `back` when it looks toward the opposite side of this space;
  a character turning around, a high/low angle or camera movement alone does not change it.
  `shot_image` selects that panel, never both opposing views. Legacy `imageUrl` is reused
  with a missing-view warning when the selected panel is absent. It does not replace the production `visual.location` binding.
  For built sets, also follow [location assets](location-assets.md); link the real manifest
  and its shared views. A written location sheet does not require Blender or a 3D render.

If a category has no subjects, set `SB_DOC.assetSheetNotes.characters`, `.props` or
`.locations` to an explicit not-applicable reason. Do not manufacture a character for a
wordless object scene or a physical location for an abstract graph. Missing sheets and
not-applicable categories must remain distinguishable. Explicit text-only drafts record
the same information in their requested text format without inventing production fields.

Review the inventory against the selected scenario, then add shot links as cuts are written.
Return the character sheet paths and the canonical prop/location sheet source with the board.
Refresh and check the shared HTML using [storyboard design](storyboard-design.md); its prop
and background/location sections must show the actual data, unresolved media and shot links.
