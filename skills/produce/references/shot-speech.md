> Output policy: spoken dialogue never becomes a caption overlay in the final video.
> Keep the clean master for every platform. Subtitle sidecars are optional (`SUB=1`);
> when requested, upload the SRT separately to YouTube. `BURN=1` does not enable burn-in.

# Shot speech and replaceable video adapters

## Contents

- [Common data](#common-data)
- [Delivery follows the story](#delivery-follows-the-story)
- [Direct each line and reaction](#direct-each-line-and-reaction)
- [Common voice layer](#common-voice-layer)
- [Adapter layer](#adapter-layer)
- [Current adapter examples](#current-adapter-examples-checked-2026-10-16)

Owner directive 2026-10-16: there is no automatic audio-quality review and no human listening
approval gate. Generate, record provenance and continue. A later user correction invokes
edit-speech. Do not report a generated file as listened to or approved. This supersedes older
mandatory `tts_generate_checked`, final listening, voice-lock ASR and speech-warning HITL steps.
Historical proof parsers remain for old artifacts; they are not new-production requirements.

## Common data

Set `SB_DOC.speechPlanVersion:1`. For story-v2, select a narrator only when the story needs one;
explicit character speakers and silent stories need no narrator. When selected, include the
narrator in `SB_DOC.characters` with its own pinned `tts` and set narratorCharacterId. Legacy
boards still need the narrator for their default speech routing. Each narration entry is one ordered spoken line:
`{id, speaker, delivery, tts, sub, acting?}`. delivery is voiceover (narration or inner monologue),
on_screen (the character visibly speaks), or off_screen (a character speaks outside frame).
The field keeps its historical name `narration`, but carries all dialogue. Every line has an
explicit speaker, including narrator lines. Do not use a character's mere visual presence to
invent speech. Do not rewrite confession, warning or bargaining as summary merely to avoid
animating speech. List the dramatic exchange in the board before choosing a video model.

## Delivery follows the story

An explanation video may be entirely narrator `voiceover`, including illustrated people
who never speak. In drama, a visible person addressing another character normally uses
`on_screen`: animate the speaking face, expression and body from that person's actual audio.
Do not convert a whole conversation to `off_screen` or closed-mouth action for convenience.
Use off-screen speech where the scene calls for a listener reaction, an insert or a speaker
outside the frame. A visible character can instead narrate, think, or read a text message;
that is `voiceover`, not physical speech. Record a short `deliveryReason` for such choices
when the picture could be mistaken for spoken dialogue. A narrator visibly presenting to
camera still uses `on_screen` when their mouth is supposed to speak. No speaking-shot quota
applies, and silent shots need no invented lines. The storyboard displays these distinctions
beside each speaker's portrait and dialogue bubble.

Stable shot ids and line ids survive reorder and model changes. `speech_manage` prepares,
finds and updates them and attaches audio hashes. Per-line audio records are not scene WAVs:
the current common builder takes one speaker per scene and one assembled WAV per card. Split
speaker changes into consecutive shots before production; preserve the line ids. Do not feed
a mixed-speaker WAV to the single-speaker builder. Its file/timing checks are not listening QA.

## Common voice layer

For new episodes, apply [directory model settings](../../_shared/model-settings.md)
before selecting speaker voices. Use its speech engine/model for new `tts` records
and retain only explicit character exceptions. Existing episode snapshots and
pinned voices survive default-model updates; resolve incompatible voices with the
user rather than silently changing engine, voice ID or model. Pass a selectable
model explicitly to the raw tool so its own default cannot drift between episodes.

Resolve speaker to character.tts. Call `speech_manage action:plan_audio` to compile
line acting into the selected provider’s arguments; use its generator/generation
output (`arguments` is an alias of `generation`). Do not overwrite the planned
scene direction with the character baseline stylePrompt. Attach with clean expectedText as `generation.text` and the actual tagged
request in `generation.voiceSettings`. Generate with the corresponding raw engine tool, not
`tts_generate_checked`. Save a generation receipt beside each scene WAV as `.generation.json`
with generator, voiceSettings (the actual arguments), generationSpeed, playbackSpeed:1,
expectedText, lineIds and audioSha256. For a single line without reaction padding the bound
line WAV can be used directly; a combined or padded scene WAV needs this receipt bound
to its actual bytes. Attach generated line WAVs with `speech_manage`.
No scores, STT, paid reviewer request or human approval is needed. File existence, hash,
voice-routing, duration and edit synchronization still matter. No pass score is invented.

## Direct each line and reaction

Keep the character's engine, model, voice ID/name and pinned synthesis settings stable.
The character's baseline delivery is a fallback; it cannot dictate the emotion of every
scene. Author optional `acting` on the line when the situation changes:

```js
acting: {
  direction: "quiet, briefly confused question",
  context: "The applicant has just mistaken a sales result for a job offer.",
  intent: "Find out what he thinks he passed.",
  emotion: "Brief confusion after the earlier celebration.",
  vocal: "Pause, then ask quietly with stress on passed; no sales smile or cheering.",
  visual: "Hands lower, smile fades, gaze turns to the applicant; no applause.",
  leadInSeconds: 0.25,
  tailOutSeconds: 0.4
}
```

Each context/intent/emotion/vocal/visual field is optional, at most 1,000 characters.
Existing `direction` (a short plain cue, at most 500 characters, no brackets, pipes or
line breaks) and `tags` (up to six bare English event names, at most 60 characters each)
remain supported. `direction` contributes scene delivery; tags are compiled into the
selected provider's supported syntax. Keep the clean line text separate from tagged
provider text; see [acting prompts](acting-prompts.md). `leadInSeconds` and `tailOutSeconds`
are optional finite seconds from 0 to 5, defaulting to zero. These are timing instructions,
not TTS API parameters. `context` records the immediate trigger, `intent` the speaker's
purpose, `emotion` the current change, `vocal` audible delivery and `visual` visible action.
Keep physical direction out of spoken text. Missing `acting` preserves legacy baseline
delivery; it does not prove the baseline fits the scene. `update patch.acting` replaces the
whole acting object; `null` clears it. Preserve unrelated fields when revising one detail.

Scene vocal direction replaces the baseline style instead of combining contradictory
instructions such as cheerful selling and confused questioning. Reuse the resolved line
direction for retakes unless the requested correction changes it. `plan_audio` reports
unsupported delivery controls. For ElevenLabs v4, only the explicit compact
`acting.direction` and `acting.tags` become inline speech cues. Keep context, intent,
emotion, vocal paragraphs and visual action as planning/video/review context; do not
flatten them into one long bracketed tag or copy them into spoken text. When rich
vocal direction has no compact direction or tags, the planner warns that this scene
direction is unsupported by the compiled request. Write a short audible cue that fits
the same scene, then replan; do not treat the warning as proof that the desired acting
was synthesized. Gemini retains its separate style/prompt mapping.

Gemini and ElevenLabs v4 are the supported speech engines; preserve existing recordings from removed engines without silently regenerating them. Do not add unsupported API keys, silently change models or claim that planning
alone improves the audible result. Preserve existing spending authorization.

Use the same context, intent and emotion with the visual action in `plan_video` and the
actual video prompt. Start each shot from an image with the planned expression, gaze,
hands and props. Reuse identity references, but do not force confusion or restraint to
start from an unrelated smiling sales pose. Preserve the previous shot's physical state
where the story continues. Create a new image only within the authorized asset scope.

Generate each emotional beat separately. Never concatenate nonconsecutive shots or
different reactions into one generation merely because they share an image, then slice
at audio-length boundaries. A deliberately continuous take needs ordered beat timings
and observed cut points before reuse; a prompt does not establish where the model acted.
The plans describe timing but do not render media. After attaching every line's current
audio, `build-reel.sh` calls [compose-speech.js](compose-speech.js) for speechPlanVersion 1
scenes with acting or multiple spoken lines. It reads cards.tsv, inserts each line's lead-in/tail-out, concatenates
the speech into `c{index}-speech.wav`, updates the card audio path and records measured
line intervals plus source hashes in `.generation.json`. The builder preserves that
padding and uses speech intervals for subtitle timing. For preparation before an
audio-conditioned video call, run the same composer explicitly:

```bash
node "$PLUGIN_ROOT/skills/produce/references/compose-speech.js" "$WORKDIR" "$STORYBOARD_DIR"
```

Include the full composed duration in video planning and pass the composed WAV to the
selected audio-conditioned adapter. Convert its channel layout only as that adapter
requires. If a provider rounds the request to a frame grid, pad the conditioning WAV
with explicit silence through the provider duration and record the extra padding; do not
speed up speech. Silence reserves reaction time; it does not animate a gesture or prove that
the generated character reacts correctly. Do not count provider padding as an acted
reaction or stretch speech to cover a missing pause.

No new listening or score gate applies. If the user requests a review loop, inspect
the actual audio and video against these line directions and report evidence and unresolved
differences. Code checks, prompts and still frames cannot certify prosody or continuous
acting; keep media that was not played/listened to explicitly `not_reviewed`.

For an explicitly requested paid audiovisual evaluation, `acting_review` can inspect a
local clip against the actual scene direction and expected speech. Supply requestedBy and
reason from that request, preserve the authorized budget, and call it only for that review
scope. It uploads media to Gemini and writes a receipt; it is never part of default speech
generation. Receipts use a shared content-hash cache at `~/.cache/social-flow/acting-reviews`
(or `SOCIAL_FLOW_ACTING_REVIEW_CACHE_DIR`), so copying a take does not create a new review.
They are local provenance records, not tamper-proof attestations. Audio-only results do not
certify facial expression, body action or lip sync.
Reuse the receipt for unchanged media/direction, including a failing result; improve the
take before evaluating it again. Report pass/fail/unverified and unresolved findings as
returned. A requested 95-point target is an evaluation criterion, not permission to invent
a passing score, reroll identical media, spend without a limit or block unrelated production.

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

Generation receipts keep actual API arguments in voiceSettings. For Gemini,
which have no language argument, put the declared text language in generation.language
(e.g. ko). This is metadata, not an API parameter. Both attachment and assembly use the
same voice/language normalization rules.

Per-line `acting: {direction?: string, tags?: string[]}` is separate from the pinned
identity voice and from visible/off-screen `delivery`. Use `speech_manage` to update
acting, invalidate affected speech, and preserve unchanged takes. Follow
[acting prompts](acting-prompts.md).
ElevenLabs permits `eleven_v4` only; Gemini remains supported. Local TTS is removed.
Read the [v4 API contract](../../_shared/elevenlabs-v4.md) for request limits,
language codes, IPA, continuity and provenance before calling ElevenLabs tools.
An explicitly requested review/improvement loop is permitted within its scope;
normal production continues without scoring or listening approval.
