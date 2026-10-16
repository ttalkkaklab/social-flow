# Speech review when requested

Normal production uses raw Gemini or ElevenLabs `eleven_v4` generation and stores
`not_reviewed`. Local TTS, older ElevenLabs models and mandatory listening/retry
recipes are retired. Existing review records describe their original artifacts;
they are not prerequisites for new generation, assembly or delivery.

Read [shot speech](shot-speech.md) for generation receipts and stable line bindings.
Read [acting prompts](acting-prompts.md) for provider syntax, auditions and an
explicitly requested adversarial improvement loop. Never create a PASS record for
media that was not evaluated or treat transcript matching as an acting assessment.

Where the user requests listening review, evaluate the actual generated or assembled
file, retain its hash and save concrete findings. Use `tts_review_final` only within
that request and its spending authorization. State any unsupported review axis.
If speech changes afterward, reevaluate affected speech and joins before describing
the new artifact with the previous score. An unavailable evaluator is not a pass.

For `tts_generate_checked`, use only currently supported generator/schema inputs;
legacy examples containing local generators or older model IDs are not executable
recipes. Explicit loop targets apply only to the requested review, never to unrelated
tool execution. Preserve ordinary file, finite timing and speaker/voice contracts.

The historical chapter-proof TypeScript contract is [final-speech-chapters.d.ts](final-speech-chapters.d.ts).
User correction and selection policy is [tts-hitl.md](tts-hitl.md).
