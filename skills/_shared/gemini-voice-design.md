# Gemini character voice identity

Use this workflow for character samples, age/voice corrections and custom casting.
Ordinary dialogue keeps the selected voice ID and uses per-turn delivery directions.

1. Read the character's confirmed age, vocal gender, timbre, accent and examples.
   `character_voice_audition action:plan` extracts these targets. Unknown values stay
   unknown; do not infer gender from a name. Honor an existing explicit model choice.
2. For catalog casting, call `tts_list_voices source:library` with `languageCode`,
   `gender`, `pitch` and optional `search`/`persona`. Follow pagination with identical
   filters. `search` matches name/description substrings, not numeric age ranges.
   A catalog description such as “55-year-old” is candidate evidence, not proof of
   how old the generated speech sounds. `source:curated` is an offline 30-voice list.
3. When the user wants a custom voice or the existing voice sounds too young/old,
   call `tts_voice_design` with a stable identity prompt and a new output directory.
   Describe age, vocal gender, resonance, texture, accent and baseline delivery.
   Optional `baseVoice` asks for relative changes to an existing voice. This calls
   `POST /v1beta/voices`, `type:prompted`, `store:true`; it is a paid generation and
   stores a remote voice. A request to create/change the voice authorizes that work.
   Turn `style` controls performance; changing age words there with the same base
   ID is not a voice identity correction. Do not describe Voice Design as unsupported.
4. Preserve the returned `voiceId`, preview, hash, usage and receipt. An uncertain
   creation is not a reason to rerun it: inspect the receipt and search stored
   `type:[prompted]` voices by the distinct display name first. No silent fallback.
5. Generate the character's representative lines with `tts_gemini_38`, using the
   returned `voice_...` as `voice`. Use one request with several turns for a connected
   sample; put only delivery/emotion in their styles. The design preview is not the
   requested script. Keep the model and voice ID pinned for later dialogue.
6. Back up previous samples and settings. Apply within the user's scope, update
   identity `tts`, generation provenance and the rendered character sheet. Preserve
   older audition records as historical, never as evidence for the new sample.
   If the user requested options, show them for selection. If the user authorized
   replacement/regeneration, apply the result without inventing an approval gate.
   Sample-only changes do not rebuild existing episode snapshots or videos.
7. Verify usable audio and references. Record `not_reviewed` unless actual listening
   occurred. Report “generated with an age target” rather than “confirmed age fit”.
   Do not launch paid scoring/listening loops unless explicitly requested.

Stored voices have a project quota and expire after one year of inactivity; save
`expireTime` when returned. Synthesis or remix use extends retention. Keep prompts
and receipts for recovery; never promise byte-identical recreation.

Official contracts checked 2026-10-17:
- [Voice Design](https://ai.google.dev/gemini-api/docs/voice-design)
- [CreateVoice and ListVoices](https://ai.google.dev/api/voices)
- [Speech generation](https://ai.google.dev/gemini-api/docs/speech-generation)

## User preference and review disagreements

A user saying a candidate sounds right is the casting decision for that candidate.
Keep its exact audio and voice ID; do not regenerate it to satisfy a model reviewer.
Save the user's words and audio hash separately from the model review, preserving
both even when they disagree. Never relabel a negative review as a pass.

Model age impressions, naturalness judgments and scores are advisory. A rough or
stylized voice may fit the character better than a smoother, more natural one.
Do not turn `fail`, `unverified` or a score below 95 into a selection veto. Separate
verifiable defects (missing words, clipping, unusable files) from taste, and never
present model guesses about exact age or vocal physiology as measured causes.
When revising after a user complaint, preserve the qualities the user likes and
change only the stated issue. Present revisions without declaring them unusable
based on model taste. Do not continue paid review/regeneration loops unless asked.

Live API caveat (2026-10-17): the configured Gemini endpoint rejected
`voice.prompted.base_voice` with HTTP 400 unknown parameter despite its documented
schema. Treat remix support as endpoint-dependent. Preserve the refusal, do not
retry the same rejected payload, and distinguish fresh design from actual remix.
