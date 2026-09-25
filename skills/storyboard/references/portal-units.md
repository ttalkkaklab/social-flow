# Portal unit tools

Use `portal_storyboard_create/get/update/delete` alongside the existing list tool.
Creation takes `value: {title, characterId}`; this workflow helper derives the project
from that narrator character. The underlying project records are available through
`portal_api_projects_get/post` and `portal_api_projects_project_get/patch/delete`, using
the exact API `body` and path fields. `portal_episode_list/get/update/delete` complements
create/status/lease/checkpoint/revisions/restore. Episode update accepts title,
status and stage; edit content metadata with the settings tools below.

The `portal_api_*` family mirrors every workspace-key API route from the generated
contract. Use it when there is no local-file workflow helper or when the caller needs
the API's complete field set. Inputs keep path fields at the top level, query fields
inside `query`, and JSON payloads inside `body`. For example,
`portal_api_storyboards_get` accepts `query: {q,status,projectId,page}` and
`portal_api_storyboards_storyboard_episodes_post` accepts
`{storyboardId, body:{slug,title,format?,stage?,ordinal?,meta?,sourceChannelSlug?}}`.
Binary GET tools require an absolute `targetFile` and refuse to overwrite it.

`portal_sequence_*`, `portal_scene_*`, `portal_shot_*` provide list, get, create,
update, delete and reorder. Sequence identifiers are `id`, story scenes are `no`,
and shots use stable source `id` (`s0001`), never the transient database row UUID.
Creates take `value`; updates merge `value` recursively, preserving unknown fields.
Arrays are explicit replacements. Reorder takes every identifier exactly once.
A create can supply a zero-based `index`; otherwise it appends.

Every read returns `headRevisionNo`. Send that as `baseRevisionNo` on a write.
The entire resulting board passes scenes-vm, the shared structure contract and
storyboard_check before the existing checkpoint creates a revision. `draft:true`
uses the normal draft checker. A validation failure writes nothing. A 409 lease or
head conflict requires a new read and reconciliation; the tool never retries a
write or advances a local `.portal.json` automatically.

Lease use is optional: callers can reserve an episode with `portal_episode_lease`
(`action:"acquire"`, then `action:"release"` when done, using the same channel).
Unit tools never acquire or release it automatically. A write is allowed when no active lease exists;
another subject or holder's active lease returns 409 `leased`, with a
`portal_episode_lease` `action:"status"` hint. Wait for release/expiry, then read
and reconcile; absence of a lease does not cause a 409.

A new sequence can include companion `scenes` and `shots` so its first checkpoint
already has a valid hierarchy. `moveScenes:true` explicitly moves existing scenes
into a new sequence. A new scene names `sequenceId` and can move existing `shotIds`.
Deleting a parent with children requires `cascade:true`, or an explicit
`targetSequenceId`/`targetSceneNo` to transfer its children. The result must still
pass the full board contract.

All unit writes accept a companion `globals` object for atomic metadata patches.
For example, inserting a narrated shot also changes `STORY.beats` and the shot
numbers of opening/payoff/ending/ask quotes. Patch those in the same request.
Unspecified review and media fields are preserved. Eyeline positional references
are remapped by stable shot IDs; deletion of a referenced target is rejected.

Settings use `portal_episode_meta_get/update` with `key` (THEME, COMPREHENSION,
STORY, PRODUCTION, MOTION_POLICY, STRUCTURE, PREVIZ, SLIDE_OBJECTS, MUSIC, VOICE).
Music and legacy voice have `portal_episode_music_get/update` and
`portal_episode_voice_get/update` aliases. Character TTS remains the speaking
voice authority. Music `$mix` uses targetLufs, truePeakDbtp, bedSeparationLu,
minimumSeparationLu and the existing mix contract, not abbreviated unit names.

Use `portal_api_settings_get` to read the workspace name. `portal_api_settings_patch`
is intentionally absent because renaming remains an admin browser-session action.
Persist an episode's selected visual style with
`portal_api_episodes_episode_style_preset_post`. Its `body` requires `preset`,
`baseRevisionNo`, `sourceHost`, `chosenBy`, and `source`; add `reason` when useful.
Record the actual selector in `chosenBy` (`user`, `standing`, `auto`, or `imported`) and
never label an automated choice as `user`.

For an exact revision restore, use
`portal_api_episodes_episode_revisions_revision_restore_post` with `episodeId`,
`revisionNo`, and `body: {baseRevisionNo, sourceHost?, note?}`. The convenience
`portal_episode_restore` remains available for local `.portal.json` integration, but
the route tool exposes the API's explicit optimistic-lock field.

Shot field tools use `shotId`:

- `portal_shot_narration_*`: list/get/create/update/delete/reorder, zero-based
  `index`, line `value: {tts,sub?,speaker?}`. Unknown fields such as TTS media survive.
- `portal_shot_camera_get/update`: patch the `visual.camera` object.
- `portal_shot_background_get/update`: `value: {bgPrompt}`.
- `portal_shot_slide_get/update`: patch `visual.slide`.
- `portal_shot_sound_get/update`: `value: {sound?,effect?}`, including their sfx.
- `portal_shot_transition_get/update`: `value: {transition,reason,continuity?,
  transitionSeconds?}`. Producer vocabulary and 0.08–0.8-second moving joins apply;
  cut/dip/dip:white do not take a join duration. This is not the story scene's turn.

`portal_background_*` and `portal_prop_*` provide list/get/create/update/delete,
register/unregister using `storyboardId` and entity UUID `id`. Creation plus
registration is one portal transaction. Props also require their owner characterId.
Save/import accepts `SB_DOC.backgrounds: [{id,description?,imageUrl?}]` and
`SB_DOC.props: [{id,characterId,description?,imageUrl?}]`; import prop characterId
is the source character key. Source registry IDs map to names; use unique names
within a project. Shots reference `visual.background` and `visual.props` by those
source IDs or registered master UUIDs; the portal creates scoped FK links. Snapshots
and export include the registry definitions.

`portal_episode_audio_upload` takes episodeId, kind (`music`/`sfx`) and a local WAV
or MP3 file (up to 10 MiB). To retain it with a shot/revision, patch its returned id
into that shot's `portalMedia.music`/`portalMedia.sfx`; unlinked uploads follow the
portal's existing recovery cleanup policy. `portal_scene_search` searches by query.
`portal_scenario_delete` takes candidate D1–D3. `portal_render_allocation_create`
takes `value: {mode}` and baseRevisionNo; the existing allocation tool reads/submits it.
