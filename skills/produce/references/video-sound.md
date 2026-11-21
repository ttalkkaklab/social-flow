# Model-aware effects

A shot’s video soundtrack carries the ambience and sounds made by visible actions.
The separate effects track is for emotional cues for the audience, such as a surprise
hit or a tension rise. Mark those with `sound.effects[].audience`. Music is scored
separately. An approved request confirms generation, and playback confirms the sound.

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

| Mode | Scene sound |
|---|---|
| Seedance with audio support | Native sound and explicit generateAudio=true |
| ASTRA ordinary generation | Native sound when enabled |
| ASTRA GenAI MSR | The video supplies speech, effects and ambience |
| Silent, audio-to-video or separate speech route | Keep the chosen speech source. Omit effects that the route cannot render |

Describe each action and its result in the prompt. A legacy cue with a description
and trigger can be routed to native audio when the selected request allows it.
Asset-only cues and cues on routes without native sound are omitted from the
separate effect track. The result reports omissions. Existing conditioned audio
can already contain sound, so keep its selected clip soundtrack intact. Reference
audio in Seedance is conditioning and may change.

Authored dialogue stays on its existing speech lane. MSR carries dialogue in its
own clip soundtrack, with the speaker’s pinned sample when available. Use
`speech_manage attach_video` to bind that soundtrack to the dialogue revisions.
For other tools, the speech and video provenance requirements still apply.

## Assembly and corrections

Native/input effects set `audioSource:'video'`. The builder extracts the clip's soundtrack
as the card's one audio source and sets sync=1; it does not overlay the separate TTS too.
This supports one continuous source per card with pre/post=0. `edit.in` and `edit.out`
trim the card as one body, picture and sound together
([cinematic edit](cinematic-edit.md)), so a take needs no separately cut file. The helper
checks both streams and writes hash-bound extraction evidence to source-audio.json.
It never silently falls back to TTS when the source audio is missing.

The audio check measures the delivered soundtrack. If a generated clip is silent or
missing an important scene sound, fix the native take or keep the documented speech
route. A separate Foley file would duplicate the scene’s sound ownership. Generated
cards end any authored room-tone bed at their boundary. Still cards may use an
existing room tone when specified.

Resolve and place only audience cues in post. Use the accepted shot and its actual
reaction time, then audition the mix at delivery level. The compiler resolves the
cue’s asset and timing and reads only the music-off flags from a legacy `sfx.tsv`.
Existing media and manual rows remain available. Signal checks establish level and
timing. Playback establishes what the sound conveys.

## Audience effects

Read `storyboard_read.audienceSpotting` for each scene's decision and reason. Trace a `use`
to the event carrying that moment. If a `none` scene still contains a cue, reread its reason
and listen for any sound carried from the previous scene. Correct the decision or event to
match the intended cut. Choose the observable reaction from the [situation index](../../storyboard/references/audience-sound/index.md).
When the scene names a perspective, shift and exit, watch for those beats on the accepted
take. For a contestant who smiles before the start call, the cue can follow the smile
and end before the first syllable. Keep the call and contact on their existing tracks.
Describe only the cue's pitch, texture and envelope in the music prompt. If the take
places the smile later, adjust the cue to the performance. When a scene note changes,
compare the shot event's intent, trigger and release with the revised note. Re-place
the event if the beat moved. Editing the note alone keeps the WAV and its placement.
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

Read the planned event in `storyboard_read` at level `shots`. Its `source.kind`
is `catalog` for a reused sound or `music` for an original instrumental cue.
When adding a drone to an existing edit, set `source:"music"` on that event's
`storyboard_apply.audienceEffects` plan. Its music prompt comes from
`sfxEntries[id].prompt` or the description of the musical cue. Earlier events keep
their original sources. Leave the board version as written.
For a music source, follow [music routing](../../_shared/music-routing.md).
Pass its `directory`, `assetId` and `requestId` to `music_plan`; pass its `outputPath`
and `filename` inside `args`. Use its `prompt` and requested length in the selected
adapter's native arguments. Ask for enough vocal-free material through the release.
Execute within the approved allocation and check `music_status` after an interruption.
Once the WAV is available, reread the cue's timing basis and place it. If the recording
opens with silence or a later passage fits the reaction, set `sourceStartSeconds` on
`op:"place"`. For example, `atSeconds:0.4, sourceStartSeconds:5.75` starts the sound
0.4 s into the trimmed shot and plays from 5.75 s into the original WAV. To bring in
a sustained tone gradually, add `fadeInSeconds` within the length of the excerpt.
Listen to the entrance and release with the dialogue. The original WAV and music receipt
keep their full length.

When a generated take has the right timbre but its melody distracts from the scene,
choose a held note and stretch it into a texture with `prepare-audience-texture.py`.
Give the texture its own cue ID. Keep its WAV and adjacent `<id>.source.json` together
in the episode's `.work/music/audience/`. The detailed board read matches the original
music request and the hashes of both WAVs and the recipe. During assembly the compiler
repeats that recipe and compares its output. The resulting span and delivery proof
attribute the texture to the original music request.

A scene scored
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
