# Portal characters — `portal_character_*`

The channel's characters on the ttalkkakstory portal (portal #91), by the channel's
workspace key. Eight tools, one portal route each. They are listed only while a key
exists; without one every call answers a single line and the procedure below is skipped.

**Never a project id.** The portal hides the project layer (#88). `portal_character_create`
files the character under `project` = the channel name — the channel the key was read off
(`channel` or `episodeDir`), overridable with `project` — the same rule the storyboard
import uses, so the character is available to that channel's playlists.

## Steps

1. **Generate three separate panels** in `assets/characters/<id>/`, with one consistent
   character, outfit, proportions and channel visual style: `body.png` = front full body
   without a face, `back.png` = back full body without a face, `face.png` = face close-up.
   All three are required for new reference sets. Inspect each image; never merge them
   into one sheet. Use the host image tool first where available. Optional poses/details
   are extra files. Write `identity.md` (`# Name`, `**역할**:`, `**생김새**:`); the folder
   name is the character `key` (lowercase letters, digits, hyphens).
2. **Check whether it is already there** — `portal_character_get` with `key:"<id>"`.
   Found → reuse its `id`; not found → `portal_character_create` with `identityDir`.
   The legacy create `file` argument uploads to **front**, so never pass the face panel there.
3. **Upload** with `portal_character_image_upload` three times, supplying `id`, `file`
   and `view`: `body.png` → `front`, `back.png` → `back`, `face.png` → `face`.
   Optional images use `view:"extra"`, `label` and optionally `sort`.
   Read `portal_character_get` and verify `imagesComplete:true`; false means the set
   is still incomplete. Legacy single images become front only and need back and face.
4. **Voice** — `portal_character_tts_set` with the channel's engine·voiceId·model·speed·
   language·stylePrompt from `profile.md`. Fields you leave out keep the character's current
   value, and only then fall back to the owner defaults (ElevenLabs `L4az9Gb378GIycFl2nAB`,
   `eleven_multilingual_v2`, speed 1.0). `speed` alone never touches `voiceId`. `id` alone
   applies the defaults to a character with no voice block.
5. **Say what you registered** — id, key, name, `imagesComplete`, images, tts — in one line per
   character.

## Refreshing

- Text fields → `portal_character_update` (`id` + only the fields that change; `null`
  clears role/appearance/referenceImageUrl/tts). Prefer `tts_set` for the voice block.
- A replacement panel → `portal_character_image_upload` (`id`, `file`, `view`). The default
  is front. Required slots replace only that view; identical bytes keep the image id.
  `extra` appends a new id on every POST, so inspect the list before retrying an ambiguous
  response. The tool verifies sha256 against the local file.
- Remove one extra → `portal_character_extra_delete` (`id`, `imageId` from `images.extra`).
  Confirm the specific deletion with the user unless already explicitly requested.
- Removing a character → `portal_character_delete` (`id`). The portal cascades its playlist
  registrations, scene links and image. **Ask the user first** when a playlist still narrates
  with it. Local files are untouched.

## Reading

- `portal_character_list` — `q` (name·role contains), `key` (exact), `page` (24 each).
- `portal_character_get` — exactly one of `id` or `key`.

Both return id · key · name · role · appearance · referenceImageUrl · images ·
imagesComplete · tts · updatedAt. `images` has front/back/face URLs or null, plus
`extra:[{id,url,label,sort}]`. These URLs require workspace authentication. Only front
sets `referenceImageUrl`. Old servers without slots report `imagesComplete:false`.

## Selecting shot references

Use face + front for a front or three-quarter character shot, face alone for a facial
close-up, and back for a rear shot (include face only when the face is visible).
Add only the extra detail the shot needs. Map portal front to local `body.png`, back to
`back.png`, face to `face.png`; use matching local originals as host-tool reference inputs.
Never treat an authenticated portal URL as a public vendor input. Keep one view per file.
