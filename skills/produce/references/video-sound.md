# Model-aware effects

Use this before any generated shot with `sound.effects`. Music selection is separate.
The same sound intent has three owners: `native` (model output), `input` (already in
the supplied waveform), or `post` (assembly). Never place a native/input effect in
the post manifest too. A successful request is not evidence that the effect is audible.

## Author and prepare

New effects describe the cause, material and audible result:

```js
sound: {
  effects: [{id: 'hangup', delivery: 'auto',
    trigger: 'When the receiver contacts the telephone cradle, once',
    description: 'A short hollow Bakelite clack followed by a small mechanical click, close and dry'}]
}
```

Prepare the chosen adapter's ordinary request JSON first. Then run:

```bash
node "$PLUGIN_ROOT/skills/produce/references/prepare-video-sound.js" \
  "$STORYBOARD_DIR" "$SHOT_ID" "$VIDEO_TOOL" "$REQUEST_JSON" --apply
```

This command generates no media. It validates the actual adapter schema, reports the
updated quote, and persists resolved `sound.effects` ownership and `sound.audioSource`.
Submit its returned `arguments` to its returned `tool`. Preserve existing spending limits;
Seedance audio can change the quote. Re-run from the original request when changing the
model or mode; set effects back to `auto` if a new automatic routing decision is wanted.
ASTRA's shot preparer also returns `soundPlan`; persist that resolved `sound` using this
command before assembly. Do not feed a previously augmented prompt back into preparation.

| Mode | Auto policy |
|---|---|
| Veo / Omni | Native effects, with visual cause and sound in the prompt |
| Seedance with audio support | Native effects and explicit generateAudio=true |
| Silent Seedance version or explicit generateAudio=false | Post effects |
| ASTRA ordinary generation | Native effects unless audio was explicitly disabled |
| ASTRA audio2video | Post effects; its prompt cannot create an additional soundtrack |
| sound.audioSource=speech | Post effects, retaining the authored speech source |

Legacy `{sfx, atSeconds}` entries stay post effects. They never silently enable a paid
audio mode. Explicit unsupported native/input requests fail instead of pretending to work.
Reference audio in Seedance is conditioning, not a promise of byte-identical preservation.
When the shot has authored dialogue, the CLI defaults to audioSource=speech to preserve
the existing voice. Selecting audioSource=video is explicit and still requires the
existing line/voice/video provenance for dialogue-bound shots; extraction is not a
waiver of pinned speech contracts. On silent action shots, native audio is the default.

For audio2video only, choose `delivery:'input'` when the sound must drive motion (a knock
rhythm, for example). Mix it into the actual `audioPath` before calling the planner.
The planner does not create or mix it. Describe which hand/object makes it. Review the
mouth and contact timing; the previous one-seed experiment does not establish reliability
for overlapping dialogue. Most dialogue-led shots should keep the post default.

## Assembly and corrections

Native/input effects set `audioSource:'video'`. The builder extracts the clip's soundtrack
as the card's one audio source and sets sync=1; it does not overlay the separate TTS too.
This currently supports one continuous source per card, with in/pre/post=0. For a trimmed
take, make an explicitly trimmed video first and use that file in segs.tsv. The helper
checks both streams and writes hash-bound extraction evidence to source-audio.json.
It never silently falls back to TTS when the source audio is missing.

Exact pinned speech and an independently editable native Foley stem are different
requirements. If exact external speech must be retained, use `audioSource:'speech'` and
post effects. Do not assume a mixed native soundtrack can be separated losslessly.

After viewing the chosen take, resolve post entries to `{delivery:'post', sfx:'asset-id',
atSeconds:3.33, separationLu:12}`. The time is relative to the final card/source, not
the whole episode. Choose level for material, distance and dialogue; 12 LU is an example,
not a global default. Unresolved assets/timing fail at assembly rather than silently
placing the cue at zero. Native/input entries generate no sfx.tsv row.

If a native effect is absent, change that event to post and supply the correction asset
and observed contact time. Keep audioSource=video to preserve the rest of the soundtrack.
If it is present but wrong, adding another impact will double it: edit/remove the old
sound first or replace the soundtrack explicitly. The compiler cannot hear duplicates.
Keep semantic quality `not_reviewed` until actual playback/listening; signal tests only
establish presence, timing and level, not a convincing performance.

Sources: [Veo prompting](https://cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide),
[Seedance API](https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api),
[LTX A2V](https://docs.ltx.io/open-source-model/usage-guides/audio-to-video).

A silent retained soundtrack uses a -16 LUFS mixing reference for post effects and
ambience; this is a fallback reference, not a measured speech level. The final
loudness pass can change absolute gain. Check the resulting contact sound in context.
If native/input ownership meets an unmanaged or edited `sfx.tsv`, reconcile those
rows explicitly before rebuilding. The compiler preserves the conflicting file and
reports it rather than silently replaying an old effect over the retained soundtrack.
