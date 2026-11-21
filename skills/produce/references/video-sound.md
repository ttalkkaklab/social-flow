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
| Seedance with audio support | Native effects and explicit generateAudio=true |
| Explicit generateAudio=false | Post effects |
| ASTRA ordinary generation | Native effects unless audio was explicitly disabled |
| ASTRA audio2video | Post effects; its prompt cannot create an additional soundtrack |
| ASTRA GenAI MSR | Native effects; audioSource=video always (speech is refused) |
| sound.audioSource=speech | Post effects, retaining the authored speech source |

Legacy `{sfx, atSeconds}` entries stay post effects. They never silently enable a paid
audio mode. Explicit unsupported native/input requests fail instead of pretending to work.
Reference audio in Seedance is conditioning, not a promise of byte-identical preservation.
When the shot has authored dialogue, the CLI defaults to audioSource=speech to preserve
the existing voice. MSR is the exception (2026-10-30): its own speech-and-effects
soundtrack is the cut's audio, voiced from the speaker's pinned sample when one rides on the
subject image ([GenAI MSR](../../_shared/astra-genai.md#msr-and-v2-video)). Its lines get no
TTS take: `speech_manage attach_video` binds the clip to their revisions (the `native` route)
and sets audioSource=video. On other tools, selecting audioSource=video still requires the
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
This supports one continuous source per card with pre/post=0. `edit.in` and `edit.out`
trim the card as one body, picture and sound together
([cinematic edit](cinematic-edit.md)), so a take needs no separately cut file. The helper
checks both streams and writes hash-bound extraction evidence to source-audio.json.
It never silently falls back to TTS when the source audio is missing.

The encoded feature must have a soundtrack with measurable signal. A generated shot
card whose entire rendered interval is below −60 dBFS needs a repaired soundtrack or
a post effect or ambience cue before delivery. This check uses the feature's shot
timeline before separately spliced inserts. Deliberate silent-film builds use the
existing `SILENT=1` mode. Signal measurements do not identify the intended sounds.

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

Sources: [Seedance API](https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api),
[LTX A2V](https://docs.ltx.io/open-source-model/usage-guides/audio-to-video).

A silent retained soundtrack uses a -16 LUFS mixing reference for post effects and
ambience; this is a fallback reference, not a measured speech level. The final
loudness pass can change absolute gain. Check the resulting contact sound in context.
If native/input ownership meets an unmanaged or edited `sfx.tsv`, reconcile those
rows explicitly before rebuilding. The compiler preserves the conflicting file and
reports it rather than silently replaying an old effect over the retained soundtrack.

## Audience effects

Read `storyboard_read.audienceSpotting` for each scene's decision and reason. Trace a `use`
to the event carrying that moment. If a `none` scene still contains a cue, reread its reason
and listen for any sound carried from the previous scene. Correct the decision or event to
match the intended cut. Choose the observable reaction from the [situation index](../../storyboard/references/audience-sound/index.md).
Plan its trigger, release, sound description and emotional change with `storyboard_apply.audienceEffects`.
Use `expectedSha256` from the latest board read. After viewing the accepted cut, read the cue's
`currentTimingBasis` and place it at seconds from the first trimmed frame. With a new end shot,
request `audienceEndFor:{shotId,id,endShotId}` and use `proposedTimingBasis`. To clear an end
and fade, pass both as null and request the start-only basis with `endShotId:null`.
A changed take, trim or trigger reads stale. Rewatch, then place again. Remove just the event
when the actor or score already carries the moment. The sound, gestures and lines captured
in the original clip retain their owner. Leave the audience cue out of video prompts and input WAVs.

For example, a woman recognizes her forged signature. In a four-second shot her finger
stops under the first signature at 1.20 s. Start a dry low drone there. She turns the page
at 3.00 s. If the turn should raise tension, bring in a 1.40 s riser whose recorded peak
coincides with the duplicate signature coming into view at 0.40 s of the next shot. End
the drone and riser there. If her recognition needs a sharper accent, a short stinger can
land as her eyes meet the witness's at 0.70 s and decay before his first word at 1.00 s.
Use the parts the scene earns. In this cut the drone needs 3.20 s of sound; an end marker
alone cannot extend a shorter recording. Listen for the rise, peak and decay within each
WAV and use the accepted shots' timings for placement.

Read the planned event in `storyboard_read` at level `shots`. On a new board `source.kind`
is `catalog` for a reused sound or `music` for an original instrumental cue.
For a music source, follow [music routing](../../_shared/music-routing.md).
Pass its `directory`, `assetId` and `requestId` to `music_plan`; pass its `outputPath`
and `filename` inside `args`. Use its `prompt` and requested length in the selected
adapter's native arguments. Ask for enough vocal-free material through the release.
Execute within the approved allocation and check `music_status` after an interruption.
Once the WAV is available, reread the cue's timing basis and place it. A scene scored
with no BGM can still use this audience cue. The post
mixer places the WAV only on the audience track. When the take already supplies a door,
footstep or room tone, keep its soundtrack. For a changed timbre, choose a new asset ID.
A mono mix can express two viewpoints with two timbres. Audition on a phone before relying on bass.

Open the accepted footage, place the actual reaction, and leave the original voice lane assigned.
To compare, run `build-reel.sh WORK BOARD --audience-sfx compare --from-shot s0007 --to-shot s0008`
with the usual build settings. Play `audience-off.mov` and `audience-on.mov` in WORK.
They share the same body cut, base gain and dialogue before the delivery speed pass.
Record which files you heard, whether the cue gives away the reveal, and whether it masks a word.
`work/audience-resolved.json` reports body times and natural expiry. A render alone is unreviewed.

After the speed pass, `delivery-proof.json.audienceEffects` gives body and delivery start/end times.
The delivery clock uses the actual speed and measured splice pieces. A historical splice proof without its piece clock reports body times only.
The comparison files share one preview gain. The delivery master has its usual final loudness processing.
