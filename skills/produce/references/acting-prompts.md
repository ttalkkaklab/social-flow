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

For Gemini 3.8, use a short style for each turn and split turns when the emotion
changes. Put voice identity in voice selection/design. Non-speech events use
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
[ElevenLabs v4](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4),
[official prompting guidance](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices).

## Three character voice candidates

When creating a character sheet, list real voices for the selected engine and
choose three distinct candidate IDs that fit the character. Use the same short,
natural Korean sample from `speech.examples`, the same selected model and the
same restrained acting direction for all three. Generate real audio and save the
actual voice/model/settings, audio paths and hashes. Voice descriptions or stock
preview URLs alone do not replace these three generated samples.

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
