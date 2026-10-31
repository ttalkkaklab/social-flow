# Character voice continuity

## Contents

- [Identity and samples](#identity-and-samples)
- [Runtime design](#runtime-design)
- [Provider recipes](#provider-recipes)
- [Exact speech and assembly](#exact-speech-and-assembly)
- [Evidence and limits](#evidence-and-limits-checked-2026-10-18)

Use the character's pinned voice throughout an episode. Treat speaker identity,
line acting, recording environment and mouth synchronization as separate concerns.
This contract supplements [shot-speech.md](shot-speech.md) and is implemented by
`server/src/video-voice.ts` inside `video_plan`; it does not change model selection,
authorize generation, synthesize samples or add a listening approval gate.

## Identity and samples

`SB_DOC.characters[].tts` remains the synthesis authority. Keep engine, model,
voice ID, language and supported synthesis settings stable. Use confirmed
`character.speech.timbre`, `character.speech.pace`, `character.speech.accent` and `tts.voiceDirection` (legacy
`stylePrompt` as fallback) for the video prompt's acoustic identity. Do not infer
gender, pitch or accent from a face or a voice ID. Do not send TTS IDs as if they
were a video model's voice selector. Per-line `acting` supplies the performance; room
acoustics and microphone treatment belong to the shot prompt, not the identity.

The character compiler exports `voiceReference` when the identity has a selected
audition whose recorded hash and TTS settings match. It uses the selected take,
even if an older `voice.wav` exists; video planning verifies the bytes when used.
Missing audition records produce `voiceReferenceWarning` and prevent that fallback,
without blocking unrelated stills or TTS. Copy the complete compiler result into the cast.
An existing episode voice override needs a sample of that episode's voice; never
overwrite the shared identity just to make the sample match.

For a sample that was already generated with known settings, attach this record
to the character. Paths are absolute or relative to `storyboard/scenes.js`:

```js
voiceReference: {
  path: "../.work/voices/hero.wav",
  sha256: "THE_ACTUAL_SHA256_OF_THE_FILE",
  tts: { /* exact pinned TTS settings used for this sample */ },
  imagePaths: ["../../../assets/characters/hero/face.png"]
}
```

`imagePaths` is optional ownership information, not extra image uploads. Only
images already passed in adapter `referenceImagePaths` get numbered mappings.
Do not infer that the first image belongs to the first speaker: it may be a source
frame, previz or style reference. A shared sample without generation evidence may
still be used, but its provenance is `legacy_sample_unverified`. The planner can
find `assets/characters/[id]/voice.wav` under the nearest channel `profile.md` when
the current shared identity's TTS matches the episode. This fallback is explicitly
unreviewed, not proof that the sample was synthesized with those settings.

Use a clean single-speaker sample without music or effects. A short sample in the
character's usual register is practical; obey the selected model's actual audio
duration limits. A sample conditions timbre and accent. It is not the final line's
audio. Do not tell the model both to repeat sample words and to say new dialogue.

## Runtime design

1. `video_plan` resolves the saved model and operation as before.
2. It reads the shot's explicit speakers and pinned cast settings. A read-only
   continuity compiler returns provider arguments plus `voiceContinuity`.
3. For audible reference-lane calls (`seedance_reference`, `fasth3_omni_reference`)
   with on-screen dialogue or a native-audio clip slot, it adds each available pinned sample once. Existing reference order
   stays intact; a reused sample keeps its actual `Audio N` index. It writes the
   speaker/image/audio mapping and a stable acoustic description into the prompt.
4. An adapter with no voice lane refuses a spoken cut (`voice_lane_required`, below).
   Supplied-audio adapters and external narration keep their audio-first prompts.
5. The final arguments pass the existing adapter schema and cost quote. Extra
   references cannot bypass model limits or the spending authorization. The caller's
   original `sourceArgs` are saved separately so replay does not append guidance twice.
6. Execution rebuilds the plan from the original arguments. Changes to dialogue,
   acting, pinned voice, reference bytes or the final request invalidate the plan.
   Declared sample hash/TTS mismatches fail as stale inputs, not subjective quality.

`voiceContinuity` records the strategy, speaker settings, sample hashes, actual
reference indices and warnings. Voice identity, dialogue accuracy, speaker assignment
and lip sync each remain `not_reviewed`. Missing descriptions or samples produce
warnings without inventing an identity or switching engines. A plan's hash proves
which inputs were used, not what a listener heard.

The catalog exposes operation-specific `voice` capabilities. `voiceReference`
means imitation, `suppliedSpeech` means animation from supplied audio, and
`exactAudioPreservation` is false for the installed video adapters. ASTRA audio2video
re-encodes the track; other ASTRA operations do not inherit its audio input contract.

Every adapter declares a voice lane, shown as `voice.lane` with `voice.dialogue:
allowed|refused`: `reference` (`astra_genai_msr`, `seedance_reference`,
`fasth3_omni_reference` — a pinned per-character sample sets the speaker's timbre),
`supplied` (`astra_audio2video`, `astra_genai_audio2video`,
`astra_genai_desktop_audio2video` — the pinned TTS track drives the clip) or `none`
(everything else). `video_plan` refuses a lane-`none` adapter with
`voice_lane_required` when the shot has an `on_screen` line, or when the model would
voice lines natively: audio on in a native slot (`visual.clip` or `type:'broll'`).
Narration or voiceover over a non-speaking picture, an external TTS track, passes on
any adapter; a `visual.clip` slot with lines sets `generateAudio:false` there. Veo, Gemini Omni and
Seedance 1.x left the plugin on 2026-10-31 because none takes a voice reference;
their existing clips stay reusable through `visual.reuse`.

## Provider recipes

| Selected route | Practice | Boundary |
| --- | --- | --- |
| Seedance 2.5 reference | Pass `generateAudio:true`; map each speaker to its sample and explicitly owned images using `@Audio N` / `@Image N`. | No promise of waveform preservation or exact line timing. |
| Seedance 2.0 / Fast / Mini reference | Same ownership mapping with `Audio N` / `Image N`; obey model input limits. | Do not automatically upgrade to 2.5. The installed schema requires an image with reference audio. |
| ASTRA GenAI MSR | Write the dialogue in the prompt; a pinned sample rides on the speaker's subject image when the speaker is subject 1 or 2 and the gateway accepts samples ([GenAI MSR](../../_shared/astra-genai.md#msr-and-v2-video)). | Without a usable sample the prompt voices the speaker and the plan warns. A sample sent to a gateway without sample support fails (`msr_voice_unsupported`). Every MSR line is spoken on screen; no TTS take. |
| FastH3 Omni reference (local) | Same ownership mapping; the plan writes each pinned sample's actual reference index. | No promise of waveform preservation or exact line timing. |
| Supplied lane: ASTRA, ASTRA GenAI and desktop audio2video | Generate final pinned-voice lines, compose the shot WAV, then animate from that WAV. | The track is re-encoded; mouth and speaker correctness stay unreviewed. |
| Lane `none`: image/text-to-video, keyframes, retake, `ltx_video_generate` | Non-speaking pictures only; narration stays a separate pinned TTS track. | An on-screen line or native voicing is refused (`voice_lane_required`). Do not enable sound just to fill a quota. |
| Host | Preserve external TTS and inspect the actual host's capabilities. | Do not invent an audio input or silently change model. Host calls remain outside managed enforcement. |

For Seedance 2.5, write Korean explicitly as the dialogue language. Its documented
prompt conventions distinguish dialogue `{}`, music `()` and effects `<>`; these
are prompt guidance, not API parameters or a guarantee. Keep action and performance
instructions intact. Map each speaker even when one is off screen. Start with
short, unambiguous turns; do not automatically split an approved dramatic exchange
or remove reactions just to simplify the model's job.

The installed Seedance 2.0 schema accepts English/Chinese direction text.
If pinned acoustic metadata is Korean, the compiler keeps it in the plan and
warns instead of injecting invalid direction text. Author a faithful English or
Chinese rendering in the shot prompt; do not invent a different voice or hide the
direction inside dialogue quotes. Seedance 2.5 receives the original description.

## Exact speech and assembly

`speech_manage plan_video` still describes synchronization with the **finished
supplied WAV**. A reference-voice model must not be marked `audioConditioning:true`
or `lipSync:true` merely because it imitates a sample. Its exact-WAV route remains
unsupported without a suitable synchronization adapter. Native generation uses
`video_plan` and the existing native-audio clip/b-roll assembly path; do not attach
it as proof of supplied-WAV synchronization.

`visual.video` is the motion-background route: assembly uses separate speech and
discards its generated soundtrack. The planner warns if a native speaking request
targets this route. Use audio-conditioned animation for exact spoken WAV timing,
or the existing `visual.clip` native-audio slot when native dialogue is intended.
Never quietly replace the final fixed TTS with a model-improvised voice. An ordinary
audio replacement does not fix mouth synchronization; voice conversion/post-lipsync
are not installed adapters and must not be advertised as available.

No automatic listening/scoring/STT or paid regeneration is introduced. If the user
requests review, compare voice identity, correct words, speaker assignment and
mouth timing separately against the actual references. Report findings independently.

## Evidence and limits (checked 2026-10-18)

Official API contracts take precedence over community recipes:

- [BytePlus Seedance 2.5](https://docs.byteplus.com/en/docs/modelark/seedance-2-5) and [prompt guide](https://docs.byteplus.com/en/docs/modelark/seedance-2-5-prompt-guide): explicit reference responsibilities and audio/voice guidance.
- [Seedance 2.0](https://docs.byteplus.com/en/docs/modelark/seedance-2-0): multimodal reference inputs; use deployment-specific constraints.
- [Creator's audio-first Seedance workflow](https://www.reddit.com/r/generativeAI/comments/1v4hb7k/voice_consistency_tutorial_with_consistent/) and [multi-speaker failure report](https://www.reddit.com/r/Seedance_AI/comments/1wdr851/seedance_25_voice_consistence_with_multiple/): useful anecdotes, not measured success rates or synchronization guarantees.

Contract tests verify mapping, stale inputs, replay, payload limits and capability
boundaries. They do not measure perceptual voice similarity or live vendor output.
