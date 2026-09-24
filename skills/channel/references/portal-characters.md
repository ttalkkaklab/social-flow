# Portal characters — `portal_character_*`

The channel's characters on the ttalkkakstory portal (portal #91), by the channel's
workspace key. Seven tools, one portal route each. They are listed only while a key
exists; without one every call answers a single line and the procedure below is skipped.

**Never a project id.** The portal hides the project layer (#88). `portal_character_create`
files the character under `project` = the channel name — the channel the key was read off
(`channel` or `episodeDir`), overridable with `project` — the same rule the storyboard
import uses, so the character is available to that channel's playlists.

## Steps

1. **Finish the local folder first** — `assets/characters/<id>/identity.md` (a `# Name`
   heading, `**역할**:` and `**생김새**:` lines) and the panels (`face.png` first). The
   folder name is the character `key` (lowercase letters, digits, hyphens).
2. **Check whether it is already there** — `portal_character_get` with `key: "<id>"`.
   Found → go to step 4 with its `id`. Not found → step 3.
3. **Create** — `portal_character_create` with `identityDir: "<abs>/assets/characters/<id>"`
   and `file: "<abs>/assets/characters/<id>/face.png"`. The tool reads key·name·role·
   appearance off the folder and `identity.md`; any field you pass explicitly wins. The panel
   is uploaded right after creation and the result carries `referenceImageUrl` (the portal's
   own authenticated URL — there is no public link) and `project`.
4. **Voice** — `portal_character_tts_set` with the channel's engine·voiceId·model·speed·
   language·stylePrompt from `profile.md`. Fields you leave out keep the character's current
   value, and only then fall back to the owner defaults (ElevenLabs `L4az9Gb378GIycFl2nAB`,
   `eleven_multilingual_v2`, speed 1.0). `speed` alone never touches `voiceId`. `id` alone
   applies the defaults to a character with no voice block.
5. **Say what you registered** — id, key, name, `referenceImageUrl`, tts — in one line per
   character.

## Refreshing

- Text fields → `portal_character_update` (`id` + only the fields that change; `null`
  clears role/appearance/referenceImageUrl/tts). Prefer `tts_set` for the voice block.
- A new panel → `portal_character_image_upload` (`id`, `file`). One image per character:
  different bytes replace the old one, the same bytes are a no-op. The tool verifies the
  returned sha256 against the file and fails loudly on a mismatch.
- Removing a character → `portal_character_delete` (`id`). The portal cascades its playlist
  registrations, scene links and image. **Ask the user first** when a playlist still narrates
  with it. Local files are untouched.

## Reading

- `portal_character_list` — `q` (name·role contains), `key` (exact), `page` (24 each).
- `portal_character_get` — exactly one of `id` or `key`.

Both return id · key · name · role · appearance · referenceImageUrl · tts · updatedAt.
