# Narration naturalness regression, 2026-09-12

The plugin now derives neighboring text from an ordered episode manifest, preserves its seed
across retries, passes native ElevenLabs speed and versioned pronunciation dictionaries, blocks
post-synthesis tempo changes, and reviews the final assembled speech with a continuity threshold
of 95. Accuracy requires 98; pronunciation, naturalness and clarity each require 95. Any audible
defect or unavailable review holds delivery. These are model listening scores, not human MOS.

## Live listening evidence

The tests used the existing local pundago voice ID, explicit test configurations, ElevenLabs
synthesis, real ffmpeg encoding, and Gemini `gemini-3.8-flash` audio review. No channel profile,
episode script or publication was changed. The ep409 artifacts cited by the user were not
present in this checkout, so this is a plugin regression test rather than an ep409 rebuild.

| Test | Accuracy | Pronunciation | Naturalness | Clarity | Continuity | Result |
|---|---:|---:|---:|---:|---:|---|
| v2, three scenes with text context | 100 | 100 | 98 | 98 | 96 | pass |
| v3, complete narration with 어을우동 | 100 | 100 | 97 | 98 | 98 | pass |
| v3, encoded final MP4 | 100 | 100 | 98 | 100 | 98 | pass |
| Negative control, pitch change at 15 seconds | 100 | 98 | 82 | 95 | 65 | fail |

The v2 test contains three separately generated scenes with the same voice, seed 210836,
stability 0.65 and native speed 1.2. Every scene received the complete neighboring scene text.
It includes the name 이순신 and the spoken year 천사백팔십년. All three scene checks passed on
their first takes; the final joined WAV also passed. Its duration is 22.107 seconds.

The v3 test reads six sentences together, including 어을우동 and 천사백팔십년. It uses the same
voice and seed, stability 0.5 and native speed 1.2, without a pronunciation dictionary. Its
source WAV is 30.300 seconds; the encoded MP4 audio is 30.336 seconds. The source, whole-WAV
review and final MP4 review all passed. v3 does not accept text context; the wrapper omits
those fields while preserving the episode manifest and seed for multiscene v3 production.
It never switches a channel's model automatically.

The negative control changes pitch after 15 seconds while preserving the complete words and
rough duration. Blind transcription remained accurate. The reviewer reported voice drift and
scored continuity 65, so the gate rejected it despite accuracy 100. The reported issue ended
slightly beyond the measured duration, which independently failed timestamp validation. The
reviewer described the direction of the pitch change incorrectly; the deliberately changed
voice, low continuity score and rejection are the supported conclusions.

## Difficult-name findings

The v2 voice repeatedly read 어을우동 as 어우루동. An identity alias, a liaison spelling alias,
a rule covering the attached ending, and an episode-wide speed/stability adjustment did not
solve that pronunciation. A v3 IPA dictionary trial also failed. These failed proofs are kept;
they were not relabelled as passes, and the script name was never split or deleted.

The v3 native-text trial pronounced the intact name correctly. This shows why dictionary
registration alone cannot guarantee quality. Keep the approved model unless the owner chooses
a change. If its name pronunciation fails, production holds; do not quietly use the passing
v3 test configuration for an existing v2 channel. Non-English phoneme dictionaries require v3;
multilingual_v2 uses alias rules. Dictionary creation and HTTP transport are tested separately.

## Adversarial code findings and repairs

A separate read-only reviewer found four production defects during development: multiscene v3
had no valid assembly route; recording backgrounds with TTS skipped review; recorded speech in
mixed episodes was missing from the expected final script; and removing the storyboard could
waive final delivery validation. The fixes have regression tests. A follow-up review also found a punctuation-only score
reroll; that is fixed and covered by the focused suite. The independent reviewer rechecked all
five findings and reported no additional blocking defect. The final script now uses
`storySpeech` playback order, including `STORY.transcripts` and inserted b-roll speech.

Further regression tests reject seed drift, missing/reordered episode context, changed voice
settings, doubled speed, malformed dictionary locators, stale media, low continuity and missing
listening evidence. Identical rejected synthesis stops before another paid listening call.
Final failed audio cannot obtain a new score by rerunning the request or changing only container
metadata: a canonical lossless audio hash binds the cached rejection. A changed audio candidate
can be reviewed again. Review outages remain unverified and resume without another synthesis.

## Reproduction and artifacts

Run the required local gates from the repository root:

```sh
npm run check --prefix server
node skills/platform-guide/references/skill-lint.js
```

Final validation: `npm run check --prefix server` passed 1,216 tests with no failures or skips;
`skill-lint.js` passed 15 rules across 18 skills. The focused continuity suite passed 10 tests.

The focused tests are `server/test/narration-continuity.test.mjs`,
`server/test/tts-quality.test.mjs` and `server/test/sentence-spacing.test.mjs`.
They use real ffmpeg processing with mocked vendor responses and spend no API credits.
The live tests above used actual paid APIs, not those mocks.

Local live scripts, requests, WAVs, MP4s, dictionary IDs, transcripts, per-attempt failures and
review scores are under `data/_checks/narration-naturalness/`. Run the matching `live-*.mjs`,
`negative.mjs` or `video-review.mjs` from the repository root to repeat a live test. They require
the existing API credentials and can incur synthesis/review charges. Generated artifacts stay
under ignored `data/`; plugin source, tests and rebuilt `server/dist/` belong in the change.

The final gate accepts up to 30 minutes, 12,000 script characters and a lossless FLAC payload
under 14 MiB. The long-form limits were not live-tested; the live clips here are 22–30
seconds. Larger media holds for a chapter review workflow rather than receiving a partial pass.

Official API references checked with ego lite:

- [Text-to-speech request fields](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
- [Create dictionary rules](https://elevenlabs.io/docs/api-reference/pronunciation-dictionaries/create-from-rules)
- [Dictionary model support](https://elevenlabs.io/docs/eleven-api/guides/cookbooks/text-to-speech/pronunciation-dictionaries)

## Artifact hashes

- `v2-context/joined.wav`: `543490235ba3be965638790c66bf6907176ffa50af9c20c9a24254808db3c1cd`
- `v3-native/narration.wav`: `6ac8120172789846d2e3cccec31a875fe27a7a014c524ff6fddd001b031656e1`
- `v3-native/final.mp4`: `d74995f5f551c3527a9eafdb4b2cb3ed45999c013279344a88b6f31e593a9a40`
- `v3-native/drift-negative.wav`: `f4c40004d5e9578dd948e4bd862530112e6e5551e39cbab94b69944b28bd82e9`
