# Shot speech and replaceable video adapters

Owner directive 2026-10-16: there is no automatic audio-quality review and no human listening
approval gate. Generate, record provenance and continue. A later user correction invokes
edit-speech. Do not report a generated file as listened to or approved. This supersedes older
mandatory `tts_generate_checked`, final listening, voice-lock ASR and speech-warning HITL steps.
Historical proof parsers remain for old artifacts; they are not new-production requirements.

## Common data

Set `SB_DOC.speechPlanVersion:1`. Include the narrator in `SB_DOC.characters` with its own
pinned `tts`, and set narratorCharacterId. Each narration entry is one ordered spoken line:
`{id, speaker, delivery, tts, sub}`. delivery is voiceover (narration or inner monologue),
on_screen (the character visibly speaks), or off_screen (a character speaks outside frame).
The field keeps its historical name `narration`, but carries all dialogue. Every line has an
explicit speaker, including narrator lines. Do not use a character's mere visual presence to
invent speech. Do not rewrite confession, warning or bargaining as summary merely to avoid
animating speech. List the dramatic exchange in the board before choosing a video model.

Stable shot ids and line ids survive reorder and model changes. `speech_manage` prepares,
finds and updates them and attaches audio hashes. Per-line audio records are not scene WAVs:
the current common builder takes one speaker per scene and one assembled WAV per card. Split
speaker changes into consecutive shots before production; preserve the line ids. Do not feed
a mixed-speaker WAV to the single-speaker builder. Its file/timing checks are not listening QA.

## Common voice layer

Resolve speaker to character.tts. Generate with the corresponding raw engine tool, not
`tts_generate_checked`. Save a generation receipt beside each scene WAV as `.generation.json`
with generator, voiceSettings (the actual arguments), generationSpeed, playbackSpeed:1,
expectedText, lineIds and audioSha256. For a single line the bound line WAV can be used
directly; a combined scene WAV needs this receipt bound to its actual bytes. Attach generated line WAVs with `speech_manage`.
No scores, STT, paid reviewer request or human approval is needed. File existence, hash,
voice-routing, duration and edit synchronization still matter. No pass score is invented.

## Adapter layer

For the selected provider/model, resolve and record capabilities with evidence:
`{provider, model, audioConditioning, lipSync, postLipSync, evidence}`.
`plan_video` uses capabilities only:

| Speech | Route | When speech changes |
|---|---|---|
| voiceover/off_screen | voiceover | Replace audio, retime subtitles/edit; keep suitable action footage |
| on_screen + audioConditioning and lipSync | audio_conditioned | Regenerate affected animation from the final voice WAV |
| on_screen + separate postLipSync | post_lipsync | Rerun the selected lip-sync adapter on affected footage |
| on_screen + neither capability | unsupported | Select a suitable adapter; do not mute the character |

Store the route in `visual.video.speechBinding` with line ids and audio hashes. Mark stale
bindings after edits and clear `speechStatus:stale` only after the new media is generated and
bound. A provider switch changes video generation, never the approved character voice or the
speech data model. The adapter owns endpoint names, upload format, channel count, frame limits
and duration rounding. The common layer must not import provider-specific frame rules.

## Current adapter examples, checked 2026-10-16

LTX official Audio-to-Video conditions video on existing audio; its open-source pipeline
returns the original waveform. Official LTX 2.5 supports this endpoint:
https://docs.ltx.io/models/ltx-2-5
https://ltx.io/blog/how-to-generate-video-from-audio

This plugin's ASTRA service exposes `astra_audio2video` with audioPath and optional imagePath.
It is a different API from LTX's public endpoint. Follow its actual schema and the measured
limits in video-model-selection.md: stereo WAV, frame ceiling and explicit duration. Never
copy public LTX duration limits into ASTRA calls. The stored local measurement says ASTRA
re-encodes the supplied audio as AAC; do not claim byte-for-byte waveform preservation there.
Generate speech first, then animate the source image from that speech. Audio consistency
comes from reusing the pinned voice audio, not a promise that lip synchronization is perfect.

Other models may support reference voices, audio-conditioned animation, or only silent video.
A reference-voice imitation is not guaranteed preservation of the original audio. Record the
actual adapter capability and preserve the source WAV; use an explicit synchronization route
when lip-sync matters. Never assume every video model accepts audio or requires LTX.

Generation receipts keep actual API arguments in voiceSettings. For Gemini and MLX,
which have no language argument, put the declared text language in generation.language
(e.g. ko). This is metadata, not an API parameter. Both attachment and assembly use the
same voice/language normalization rules.
