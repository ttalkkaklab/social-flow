# Asset sheets before shot design

Prepare all three categories after the scenario direction is known and before detailed
scene/shot authoring. Shared character identities are read earlier for casting. Existing
sheets are reused after inspection; new or changed subjects need drafts before continuing.
A sheet records concrete design decisions, not only a name or an empty placeholder.
Images, voice samples and 3D renders may be pending; planning does not authorize paid media.

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
  (time/weather/light), `invariants` (what stays consistent), and optional `imageUrl`,
  `sheetPath`, `manifest`. Missing media is pending. Use `visual.locationId` to reference
  this planning sheet. It does not replace the production `visual.location` binding.
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
