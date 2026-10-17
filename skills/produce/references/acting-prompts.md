# Acting prompts and voice auditions

## Contents

- [Identity, line intent and generated text](#identity-line-intent-and-generated-text)
- [Provider mapping](#provider-mapping)
- [Three character voice candidates](#three-character-voice-candidates)
- [Requested review and improvement](#requested-review-and-improvement)


Use Gemini or ElevenLabs `eleven_v4`. Local speech engines and older ElevenLabs
speech models are removed. Preserve an existing recording; a removed model is not
permission to regenerate it with another voice.

## Identity, line intent and generated text

The character's `tts` records identity: provider, model, voice ID, language and
supported pinned settings. Keep the dramatic action in the script plan, such as
"reassure a frightened friend, then ask them to act". Translate that intent into
short audible cues rather than sending a biography to the synthesizer.

Gemini identities may also pin `tts.voiceDirection` (1–400 characters): a stable,
compact acoustic baseline describing perceived age, vocal gender when explicitly
specified, timbre and habitual phrasing. The shared compiler preserves it alongside
scene acting in both Gemini 3.8 turn style and earlier Gemini `stylePrompt`.
Scene emotion replaces a legacy emotional `stylePrompt`, not this stable baseline.
Keep conditional emotions and biography out of `voiceDirection`. A combined 3.8
baseline and acting style over 500 characters fails before synthesis; shorten the
authored controls rather than silently dropping identity. ElevenLabs does not accept
this field: select an appropriate base voice and use its short supported acting cues.

Each line may carry `acting: {direction?: string, tags?: string[]}`. It may also
record `context`, `intent`, `emotion`, `vocal`, `visual`, `leadInSeconds` and
`tailOutSeconds`; see [shot speech](shot-speech.md#direct-each-line-and-reaction)
for the shared scene direction and materialized reaction timing. Scene vocal cues
replace the character baseline rather than appending contradictory emotions. Keep `tts` as
spoken words and `sub` as display words. Tags are bare English names, for example
`"sigh"`; do not store angle or square brackets in the tag array. These line-level
cues apply at the start of the line. For an exact mid-line event, split the line at
the event and attach the cue to the next line. Never imply the simple tag array
stores offsets or alter the compiled tagged text outside the recorded acting plan.

```json
{
  "id": "d-reassure",
  "speaker": "mina",
  "delivery": "on_screen",
  "tts": "괜찮아. 내가 옆에 있어.",
  "sub": "괜찮아. 내가 옆에 있어.",
  "acting": {"direction": "soft, reassuring", "tags": ["sigh"]}
}
```

`delivery` describes whether speech is visible, off-screen or voiceover. It is not
an emotion setting. Edit acting with `speech_manage action:update`, the exact
line ID and current revision. An acting-only edit invalidates that line's audio
and dependent speaking video just as changed spoken words do. Preserve other takes.

Call `speech_manage action:plan_audio` for the selected line after an update. Its
`audioPlans` entries include `generator`, provider-ready `generation`, clean
`expectedText`, `language` and `speechRevision`; `arguments` is an alias of
`generation` for the same provider request. Call that generator with the
compiled generation arguments plus output path/filename. When attaching the actual
WAV, use `generation.text: expectedText` and `generation.voiceSettings` containing
the actual provider request, including tags/turn styles. `attach_audio` checks
acting against the compiled plan; prose directions alone are not generation proof.


## Provider mapping

| Provider | Sustained delivery | Momentary event | Settings |
|---|---|---|---|
| Gemini 3.8 | `tts_gemini_38.turns[].style` | English angle tags in that turn's `text`, e.g. `<sigh>` | Pinned voice; no identity biography in style |
| Earlier supported Gemini | `tts_generate.stylePrompt` | Use that model's documented prompt controls | Do not assume it accepts 3.8 metadata |
| ElevenLabs v4 | Explicit compact `acting.direction` becomes a square tag, e.g. `[reassuring]` | Square tags such as `[sigh]` | `stability` and `similarity`; no speed/style slider or SSML |

Gemini example: `{"text":"<sigh> 괜찮아. 내가 옆에 있어.","style":"soft, reassuring"}`.
ElevenLabs example: `[soft, reassuring] [sigh] 괜찮아. 내가 옆에 있어.` with
`model:"eleven_v4"`. These illustrate syntax, not a listening-tested promise.

For Gemini 3.8, use a short style for each turn and split lines when speech purpose or
vocal contour changes, even if the emotion stays restrained. A self-introduction followed
by a skeptical question needs separate contexts, intents and vocal directions; a global
questioning cue must not cover the identification. Keep both lines in the same shot when
staging calls for it and retain listening/reaction in performance order. Several sentences
with unchanged purpose may stay together; punctuation is not an automatic splitting rule.
Use the speech-purpose example in the shot speech contract. Put voice identity in
voice selection/design. Non-speech events use
English tags even when the dialogue is Korean.
[Google speech generation](https://ai.google.dev/gemini-api/docs/speech-generation).

For ElevenLabs, use a voice suited to the intended performance. Only the explicit
compact `acting.direction` and bare `acting.tags` compile into inline controls.
The richer context/intent/emotion/vocal/visual fields remain available for planning,
video and review; the compiler does not turn those paragraphs into speech tags.
A scene with rich vocal direction but no compact cue gets an unsupported-direction
warning. Author a concise audible cue that preserves the intended performance and
replan before generation. Do not silently count rich metadata as a supported cue.
Tags are natural language cues, not a guaranteed enum. Start with a small set of clear directions,
place them where delivery changes, and avoid conflicting cues. Punctuation and
wording also affect performance. Keep v4 model-specific settings; never send
legacy style/speed sliders or SSML pauses.
For pronunciation, use v4's slash-delimited `/IPA/` or a pinned alias dictionary;
keep subtitle spelling separate from the spoken request. See the
[v4 API contract](../../_shared/elevenlabs-v4.md) for examples and continuity options.
[ElevenLabs v4](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4),
[official prompting guidance](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices).

## Three character voice candidates

When creating a character sheet, list real voices for the selected engine and
choose three distinct candidate IDs that fit the character. Use the same short,
natural Korean sample from `speech.examples`, the same selected model and the
same restrained acting direction for all three. Generate real audio and save the
actual voice/model/settings, audio paths and hashes. Voice descriptions or stock
preview URLs alone do not replace these three generated samples.

First call `character_voice_audition action:plan` with `identityPath`. This reads
confirmed character age, timbre, phrasing, register, habits and personality into a
casting target without generating audio. Vocal gender comes only from an explicit
`voiceProfile.vocalGender` or an unambiguous vocal-timbre description, never a name,
family role or appearance. An optional `voiceProfile` in the identity JSON beside
`character` and `tts`, or an explicit call override, can specify `vocalGender`
(`female`, `male`, `neutral`, `unspecified`), `perceivedAge` and a compact
`baselineDirection`. Call overrides do not edit the source identity.

For Gemini, prefer `tts_list_voices source:library` and follow pagination to find
language-appropriate voices. Its metadata includes gender, pitch and descriptions;
curated one-word traits do not establish gender or age. Pass actual lookup evidence
as each candidate's `metadata`: `voiceId`, `source`, `retrievedAt` and available
`gender`, `age`, `pitch`, `description`. The ID must match the candidate. Plans and
auditions report matched, conflicting and unknown attributes; absent information is
unknown, not a passing match. Numeric age proximity is only a casting hint. Timbre,
personality and native delivery still require actual listening when requested.

With candidates and `sampleText`, plan also returns the exact shared-compiler
requests. Create derives Gemini `voiceDirection` from the target when the candidate
does not already pin one. It records the target, metadata, comparisons, effective
voice settings, actual provider request and media hashes. Gemini 3.8 auditions can
use `sampleTurns: [{text, acting}]` for distinct example situations. Join the turn
texts with spaces to reproduce `sampleText` exactly and omit top-level `acting`.
Each turn uses the same candidate voice and preserves its stable baseline; author
only the performance appropriate to that excerpt. Plans expose every turn's exact
style, and selection checks those requests against the saved audition. Other TTS
models reject this option before generation rather than flattening the directions.
After explicit selection,
the chosen baseline travels with `tts` into production; ordinary speech uses the
same compiler. Do not silently replace saved voices or existing recordings.

Call `character_voice_audition action:create` with an absolute `identityPath`,
`sampleText` (up to 300 characters), exactly three `candidates` and optional `acting`.
Each candidate carries `{label, reason, tts}`; `tts` includes the selected engine/model,
voiceId, language and speed 1, plus supported stability/similarity settings. The tool
makes three paid generation calls and returns `auditionPath` and a `previewPath`
HTML page with three audio players. Open that page and play candidates separately.
Use `action:read` with auditionPath to inspect the saved record.

Expose all three audio files with clear candidate labels in the character sheet
or review page and make playback available. Ask the user to select one; explain
how the candidates differ without claiming to hear anything you did not review.
Do not choose on the user's behalf, use silence as selection, or store a candidate
as the confirmed character voice before the explicit selection. A draft sheet may
exist while selection is pending. After selection, call `action:select` with `auditionPath`, `candidateId` (`1`, `2` or
`3`) and `userSelection` containing the user's actual selection words. The tool
verifies identity/audio hashes and persists exactly that candidate's
voice settings and reference audio to the character identity/sheet. Model defaults
do not substitute for this per-character voice choice.

## Requested review and improvement

Normal production records `not_reviewed`; no automatic speech scoring, STT,
retry loop or listening approval is required. When a user explicitly requests an
adversarial improvement loop, review actual audio and follow that request's target
and authorized spending scope. A target such as 95 applies to that requested loop,
not every future generation or assembly.

For a requested loop, keep the script, voice and model stable while changing one
performance cue at a time. Judge exact wording/pronunciation, naturalness,
character consistency, intended emotion and transitions. Record the evaluator,
file hashes, axis scores, concrete time-localized defects and changes for each take.
The critic should try to disprove quality, not reward prompt wording or metadata.

For a requested character-fit evaluation, pass the plan/audition target's acoustic
fields as `tts_review_acting.characterTarget` (omit plan-only `baselineDirection`,
`sources`, `warnings`). The reviewer independently describes the voice heard and
scores characterFit40/accuracy20/acting15/naturalness15/audioQuality10. A pass needs
both total and characterFit at least 95, full listening, confidence at least 0.9,
consistent timestamped deductions and no major/critical issue. A correct transcript
cannot compensate for the wrong voice. Preserve failed takes and reviewer responses;
do not reroll an unchanged recording just to obtain a higher score. This opt-in
review never becomes a prerequisite for normal production or user voice selection.
The validator rejects deductions that cite score compression or explicitly admit
there was no audible defect. Preserve such responses as invalid evaluation evidence;
never repair their numbers by hand. Review receipts record model and API version so
an explicitly chosen independent reviewer can be distinguished from a synthesis retry.
Recheck corrected speech and joins. If listening is unavailable or the evaluator
cannot assess an axis, report that limitation without inventing a passing score.
An automated 95 is that evaluator's judgment, not a guarantee of human preference.

### Field notes from the 2026-10-17 Korean audition

In one three-voice v4 audition, a long paragraph inside a single direction tag
produced repeated lines and false starts. A second audition using a short cue
(`gentle reassurance, intimate conversation`) and stability 0.65 removed those
repetitions. Two settings changed, so this is a practical starting point, not
proof that either setting alone caused the improvement. Keep rejected takes.
When a requested critic reports repetition, corroborate the words with a separate
transcript before treating the diagnosis as certain. Transcription alone cannot
judge warmth, character fit or natural acting.

Check the critic too: a report that says every word is correct but subtracts
accuracy points without an audible example is inconsistent. Preserve its original
scores, reject unsupported deductions and re-evaluate with the same rubric.
Never raise scores by hand to reach a requested target.

## Requested audio evaluation

When the user explicitly requests an acting-quality loop, call `tts_review_acting` with the actual WAV, clean expectedText, scene direction, language and the actual request in requestedBy. It uses fixed weights (accuracy 25, acting 30, naturalness 25, audio quality 20), returns timestamped defects and binds its report to the audio hash. This is a model judgment, not human approval. Keep rejected takes and reports. Correct the reported defect and generate a new take only within the requested scope. Never call it during normal production without a review request.

The audio critic uses the published professional band consistently: scores of 95–100
may have positive observed evidence and no defect. Scores below 95 require a
timestamped issue on that axis; scores below 90 require a major or critical issue.
This does not raise provider scores or erase findings. Whole-clip confidence, the
95 overall/character-fit thresholds and rejection of major/critical issues still apply.
When correcting an older verdict, preserve its raw observation and original verdict,
then write a separate record naming both the source evaluator and new verdict policy.

Prefer concise, positive acoustic actions such as fully voiced falling endings or
clipped confident bargaining. Avoid long lists of unwanted vocal effects in synthesis
notes; compare actual takes because a direction is intent, not evidence of delivery.
