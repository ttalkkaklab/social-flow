# Retired voice conversion lane

The ElevenLabs v4-only policy removes `voice_lock_apply` and the older v2
speech-to-speech model from the public tool list. Do not call voice conversion
or send an older model ID as a fallback. Existing converted recordings may still
be reused with their original provenance; this does not authorize regeneration.

For new work, generate the selected character's speech with Gemini or ElevenLabs
`eleven_v4`, then drive a supported audio-conditioned video/lip-sync adapter with
that WAV. See [shot speech](shot-speech.md) and [acting prompts](acting-prompts.md).
No automatic ASR, listening review or voice-lock approval gate applies.
