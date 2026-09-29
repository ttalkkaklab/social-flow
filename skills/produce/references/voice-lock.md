# Lock generated dialogue to the character voice

After a model generates speech (LTX, Seedance, Veo or another provider), run
`voice_lock_apply` before selecting that cut for assembly. Use the speaking
character's `tts` block from `portal_character_get` or the approved board. Keep
that voiceId across cuts and episodes. A missing character or voice is a setup
error; do not silently choose a different voice.

## Character contract

Existing `tts.engine`, `voiceId`, `model`, `speed`, `language`, `stylePrompt` stay.
`tts.voiceLock` adds `enabled` (true), `model` (`eleven_multilingual_sts_v2`),
`removeBackgroundNoise` (true), and optional `referenceAudioUrl`. An absent block
uses those defaults. Enabled conversion requires `tts.engine: "elevenlabs"`.
`portal_character_tts_set` preserves the block when omitted, replaces it when
supplied, and fills defaults inside the replacement. STS never uses the TTS model
or changes speed.

The local comparison sample is `data/<channel>/assets/characters/<key>/voice.wav`.
The portal upload URL is `tts.voiceLock.referenceAudioUrl`. Samples support
preview/comparison; uploading one does not clone a voice. STS receives the source
cut's dialogue and the pinned voiceId, not the comparison sample.

## Per-cut pass

1. Identify one speaker and the approved spoken text. For multiple speakers,
   split into non-overlapping single-speaker stems first. For music/effects,
   preserve a separate background stem. Noise removal is not speaker separation.
   Never convert a mixed soundtrack to one voice or discard its background.
2. Call `voice_lock_apply` with `sourcePath`, `outputPath` pointing to the episode's
   `output/voice-lock`, `shotId`, `characterId`, `tts`, `expectedText` and
   `inputKind: "single_speaker"` (clean audio/video) or `"dialogue_stem"` (audio stem).
   This is a paid STS pass; include it in the approved episode budget. The tool
   makes one paid call and never retries automatically.
3. The tool copies the input, extracts 24 kHz mono WAV, checks its signal, and
   runs blind local Qwen3-ASR before spending. Source transcript differences are
   recorded as warnings: conversion may make a noisy syllable intelligible. Missing
   ASR fails; a source warning does not waive the converted transcript check.
4. STS uses `eleven_multilingual_sts_v2`, the character's voiceId and the configured
   noise removal. The tool checks the converted signal, blind transcript (<=2%
   CER) and length drift (<=120 ms). It preserves the original video stream in a
   new MP4 for passing video inputs; no speed change or silent trimming.
5. Store the result under the shot's `voiceLock`. The JSON report includes status,
   characterId, voiceId, model, source/output SHA-256, source/output durations,
   source/converted transcripts, expectedText and error. Retain the full report
   and original alongside the output. With portal credentials, call
   `portal_api_episodes_episode_shots_shot_voice_lock_put` with `channel`, `episodeId`,
   portal shot row UUID as `shotId` (not the local S01 key), and `body` containing
   the shared fields above plus optional `sourceTranscript`, `sourceCer`,
   `outputCer`, `warnings`. Omit local paths, requestId and the local shotId from
   body. It writes `PUT /episodes/{episodeId}/shots/{shotId}/voice-lock`.
   Send failed and skipped outcomes too. Keep local production usable without a
   portal key; if a configured portal write fails, report the sync failure and
   retain the local JSON for retry. Local paths stay in the local report.
6. `passed` means text/signal checks passed, not proof of identical voice or lip
   sync. Listen beside the pinned reference and watch the mouth movements. Remix
   converted stems with the preserved background. Inspect the final mix again.
   Use the new media path only after this review and record it in the shot media.

`failed` must appear as a failed cut in the production report and portal. Show the
actual transcript, duration drift or API/ASR error. Follow [tts-hitl.md](tts-hitl.md)
for measured findings: an explicit owner acceptance applies to those exact files,
not a fabricated PASS. A missing file or review that never ran still stops.
`skipped` means voiceLock was explicitly disabled, not verified. Do not silently
fall back to the original voice or another engine; surface that configuration.

The REST contract is [ElevenLabs Voice Changer](https://elevenlabs.io/docs/api-reference/speech-to-speech/convert):
`POST /v1/speech-to-speech/{voice_id}`, multipart audio, `model_id`,
`remove_background_noise`, and query `output_format=pcm_24000`. The client wraps
returned PCM in WAV. Timing and delivery are conversion goals, verified per take.
