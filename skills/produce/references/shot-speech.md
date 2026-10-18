> Output policy: spoken dialogue never becomes a caption overlay in the final video.
> Keep the clean master for every platform. Subtitle sidecars are optional (`SUB=1`);
> when requested, upload the SRT separately to YouTube. `BURN=1` does not enable burn-in.

# Shot speech and replaceable video adapters

## Contents

- [Common data](#common-data)
- [Delivery follows the story](#delivery-follows-the-story)
- [Direct each line and reaction](#direct-each-line-and-reaction)
- [Speech purpose boundaries](#speech-purpose-boundaries)
- [Common voice layer](#common-voice-layer)
- [Adapter layer](#adapter-layer)
- [Current adapter examples](#current-adapter-examples-checked-2026-10-16)

Owner directive 2026-10-16: there is no automatic audio-quality review and no human listening
approval gate. Generate, record provenance and continue. A later user correction invokes
edit-speech. Do not report a generated file as listened to or approved. This supersedes older
mandatory `tts_generate_checked`, final listening, voice-lock ASR and speech-warning HITL steps.
Historical proof parsers remain for old artifacts; they are not new-production requirements.

## Common data

Set `SB_DOC.speechPlanVersion:1` and, on newly authored boards,
`SB_DOC.performanceTimingVersion:1`. For story-v2, select a narrator only when the story needs one;
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
the shared composer accepts several speakers in one shot and makes one timed WAV per card.
Keep each line bound to its own speaker, voice and audio receipt. Split an exchange when
staging or the selected adapter calls for a cut, not merely because the speaker changes.
The composer's file/timing checks are not listening QA.

## Common voice layer

Use [TTS routing](../../_shared/tts-routing.md) for model capabilities, pure payload
planning and restart-safe execution. Raw synthesis tools share the execution checks;
only `tts_route execute` accepts a stable request ID for replay protection.

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

Generate each change of speech purpose or vocal delivery separately, including changes
without a new emotion. Never concatenate nonconsecutive shots or
different reactions into one generation merely because they share an image, then slice
at audio-length boundaries. A deliberately continuous take needs ordered beat timings
and observed cut points before reuse; a prompt does not establish where the model acted.
The plans describe timing but do not render media. After attaching every line's current
audio, `build-reel.sh` calls [compose-speech.js](compose-speech.js) for speechPlanVersion 1
scenes with acting, multiple spoken lines or independent actions. It reads cards.tsv and
the ordered `performance`, places measured speech with lead-in/tail-out and action intervals
in `c{index}-speech.wav`, updates the card audio path and records measured line intervals
plus source hashes in `.generation.json`. Optional subtitle sidecars use those speech
intervals; they do not appear in the clean video.

For a standalone action, `durationSeconds` is an authored estimate; `withGroup` optionally
starts it with a 1-based speech group. Without a separate duration, that concurrent action
spans the group; a longer action extends the interval instead of being added twice.
Independent action time must be finite before composing new boards carrying
`performanceTimingVersion:1`. Draft unknowns stay visible. Older boards without the marker
retain the legacy speech clock with an unverified-action warning; do not silently migrate
an approved episode. A silent shot needs a finite visual timeline and no invented speech WAV.
For new timing-version boards, the supplied silent card WAV must cover the complete
action timeline; extra provider padding is allowed. Its measured length drives assembly,
so the checker does not require equality with the board's earlier duration estimate.

Call `speech_manage` with `{path, action: "plan_video", shotId, capabilities}` to inspect
the whole stored shot, including actions and addressees. Do not restrict that handoff to
line IDs. A successful speech plan does not establish that the adapter can stage several
visible speakers correctly; use its actual capabilities and inspect the resulting action.
For `capabilities.provider: "astra"`, the plan reports `promptLength` with the actual and
maximum character counts and warns when its `videoPrompt` exceeds the adapter's prompt
limit. It preserves the full prompt and actions. Other adapters do not inherit that limit.
Shorten redundant wording or split a take at a natural action boundary; do not discard the
story's necessary action merely to fit the request.
For preparation before an audio-conditioned video call, run the same composer explicitly:

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

For ASTRA, prepare the real request with `prepare-astra-shot.js` after composition:

```bash
node "$PLUGIN_ROOT/skills/produce/references/prepare-astra-shot.js" "$STORYBOARD_DIR" \
  --shot "$SHOT_ID" --audio "$COMPOSED_STEREO_WAV" --output "$CLIP_DIR" --filename "$CLIP_NAME"
```

Submit the returned `tool` and `arguments` unchanged. This installed helper resolves the
whole-shot plan, source image and supported adapter schema, then writes natural motion
prose without spoken words or screenplay labels. Keep the structured performance prompt
as provenance rather than submitting it as ASTRA's final prompt. Audio2video receives one
authored opening image at frame zero, not the previous clip or every continuity reference.
Capture the selected preceding endpoint and stage the next opening from its actual state.
Silent and off-screen shots use the image-to-video route and retain authored end images.
An explicit episode voice exception belongs in
`PRODUCTION.modelSettings.overrides.speech` with `engine`, `model` and the user's
`request`. Keep the selected voice in each cast entry's `tts`. Assembly accepts that
matching voice exception while still checking the shared identity hash and character
fields; do not rewrite the shared identity just to change this episode's speech engine.

No new listening or score gate applies. If the user requests a review loop, inspect
the actual audio and video against these line directions and report evidence and unresolved
differences. Code checks, prompts and still frames cannot certify prosody or continuous
acting; keep media that was not played/listened to explicitly `not_reviewed`.

For an explicitly requested paid audiovisual evaluation, `acting_review` can inspect a
local clip against the actual scene direction and expected speech. Supply requestedBy and
reason from that request, preserve the authorized budget, and call it only for that review
scope. It prepares host-review evidence for the executing host to inspect (no upload to an
external evaluator, host-review.md) and writes a receipt; it is never part of default speech
generation. Receipts use a shared content-hash cache at `~/.cache/social-flow/acting-reviews`
(or `SOCIAL_FLOW_ACTING_REVIEW_CACHE_DIR`), so copying a take does not create a new review.
They are local provenance records, not tamper-proof attestations. Audio-only results do not
certify facial expression, body action or lip sync.
Reuse the receipt for unchanged media/direction, including a failing result; improve the
take before evaluating it again. Report pass/fail/unverified and unresolved findings as
returned. A requested 95-point target is an evaluation criterion, not permission to invent
a passing score, reroll identical media, spend without a limit or block unrelated production.

## Speech purpose boundaries

A speech line is a span with one communicative purpose and compatible vocal delivery.
It is not necessarily a sentence, a speaker turn or a shot. Split where intent or vocal
contour changes: identification then questioning, reassurance then a command, or a quoted
question followed by the speaker's own explanation. Keep consecutive sentences together
when purpose and delivery continue. Punctuation alone cannot decide these boundaries.

Before generating, read the words in their actual situation. Use `acting.context` for the
immediate trigger, `intent` for what this speaker is doing to the listener, and `vocal` for
audible phrasing, stress and completion. For example, answering a phone with one's own
name/rank is a declarative self-introduction even when the sentence ends in Korean `요`.
It needs a firm falling completion; a following skeptical question needs its own direction.
Emotion labels such as stern or suspicious do not specify that difference.

```js
narration: [
  {
    id: "tanaka-identify", speaker: "officer-tanaka", delivery: "on_screen",
    tts: "경찰서 다나카 경부요.", sub: "경찰서 다나카 경부요.",
    acting: {
      context: "Answering an incoming telephone call.",
      intent: "State his own affiliation, name and rank to the caller.",
      vocal: "Dry, grounded adult male voice. Matter-of-fact self-identification; finish low and firmly downward on 경부요."
    }
  },
  {
    id: "tanaka-confirm", speaker: "officer-tanaka", delivery: "on_screen",
    tts: "독립운동가를 잡게 해주겠다고?", sub: "독립운동가를 잡게 해주겠다고?",
    acting: {
      context: "The caller has just offered to help catch an independence activist.",
      intent: "Verify the caller's offer.",
      vocal: "Same dry, grounded voice. A restrained skeptical confirmation question."
    }
  }
],
performance: [
  {kind: "dialogue", character: "officer-tanaka", to: "uncle", group: 1},
  {kind: "action", character: "officer-tanaka", text: "He listens to the caller's offer.", durationSeconds: 1},
  {kind: "dialogue", character: "officer-tanaka", to: "uncle", group: 2}
]
```

The listening duration is an authored example, not a universal pause. Stage any pickup
before the self-introduction when the opening image still has the receiver on its cradle.
Preserve this event order in video direction; do not describe the whole shot only as listening
and questioning. A speech boundary alone does not introduce another camera cut.

Plan and attach each line independently with the same pinned voice. Inspect the compiled
`generation` arguments, not just the prose in the board: the identification style must apply
only to its own text, and the question style only to the question. Keep Gemini 3.8's resolved
turn style within its 500-character adapter limit. For ElevenLabs, author a compact audible
`direction`/`tags` cue per line; rich prose alone is not an inline control. Compose current
line audio with the performance timeline before generating any audio-conditioned video.

For an existing combined line, a narrowly scoped correction may explicitly describe the two
sentence deliveries in that line's supported style. If editing its structure, preserve text,
speaker, surrounding IDs and all performance group references through storyboard editing;
`speech_manage update` changes one line and does not insert a second line. Treat dependent
speaking video as stale after changing either speech or performance, and report it honestly.

When the user requests an improvement loop, keep the scene intent and rubric fixed, review
the actual generated audio, and retain each take's exact prompt, hash, usage and findings.
Fix a concrete audible defect before generating the next take. Do not reroll a review of
unchanged media to seek a passing number, soften the intended delivery, or treat a pitch
trace as proof of natural acting. Normal production still has no automatic listening gate.

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
Reattaching unchanged video bytes after a performance edit or a changed audio take preserves
the original binding and reports stale provenance. It does not certify that the revised
action or speech synchronization was generated.

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

LTX 2.5 sometimes renders the character without following the voice, and which seeds do
this is luck (research 2026-10-17: HF LTX-2.5 discussion #44, Wan2GP #2200). When every
line in the composed WAV is `on_screen`, pass `expectLipSync: true`; `prepare-astra-shot.js`
sets it. After each render the tool correlates picture motion with the speech loudness
(ffmpeg only, any OS, no upload). Under the routing contract a request submits once
(`maxAttempts: 1`, video-routing.md); when no region moves with the speech the tool reports the
measurement, and a retake with the same audio, image and prompt and a new seed is a new request
within the episode attempt limit. `render-astra-shot.js`, which calls the runtime outside routing,
keeps the runtime's own `maxAttempts` (default 2) for that retry and reserves `-attemptN` candidates.
Every attempt's seed and measurement is written into the attempt's
`.astra-job.json`. Speech cut off by the frame count and a clip track that differs from the
WAV are reported without a retry, because another seed fixes neither. Mixed on-screen and
off-screen lines in one track keep the check off, since the visible mouth should be still
during the off-screen voice. The measurement shows that something moves with the voice.
Phoneme-level sync, which visible person spoke and voice identity remain `not_reviewed`.
A clip still failing after the cap ships with its finding, never as an error.

Calibration, 2026-10-17. Five real ASTRA LTX 2.5 audio2video close-ups whose mouths
stayed closed through the line (a chipmunk at two seeds, gate-webtoon scene-6, 8 and 11)
scored margins from −0.23 to −0.08. A synthetic mouth opening with the speech scored +0.45,
one that never moved +0.06; the pass threshold is 0.1. No real LTX clip that did follow the
voice was available, so the passing side is shown only on synthetic footage. In medium and
wide shots the mouth covers a few proxy pixels and body motion dominates; read a finding
there as unverified. Reseeding rarely fixed the refusal: the chipmunk's second seed and
the gate-webtoon takes 1–3 of the same shot all stayed closed. When the second attempt
also fails, change the opening image (a larger, open-mouthed face), the prompt or
`strength` rather than spending more seeds. Three of the day's six audio2video requests
failed server-side with `생성기 rc=1` (1024×1536×169, 704×1024×169 and a 916×1717 source
image at 1280×704×121); 1280×704×121 with a 1024×1536 source image succeeded three times.

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

## Retiming after a voice replacement

Use the built-in `speech_manage` sequence, not an episode-specific timing script:

1. `attach_audio` returns the measured shot clock and long-action warnings. Compare it
   with the authored timing. A concurrent speaking gesture normally omits its own
   `durationSeconds`; use one only for an independently timed visible action.
2. `retime` with the current `expectedRevision` updates the shot from measured speech.
   `timingPatch.speechBoundActions:true` explicitly removes inherited concurrent-action
   durations. `timingPatch.actions:[[index,seconds]]` changes only the named standalone
   actions. No text, acting direction, voice identity or speech audio is rewritten.
3. Recompose speech. For ASTRA call [render-astra-shot.js](render-astra-shot.js) with
   `BOARD --shot ID --audio COMPOSED_WAV --output DIR --filename UNIQUE.mp4`. It uses
   the canonical planner, pads a separate transport WAV to the provider frame grid,
   preserves the speech and edit clocks, and records the generation before waiting.
   Existing candidate/submission records prevent an accidental duplicate request.
4. Inspect candidates and adjacent cuts within the existing authorization. A motion/audio
   correlation ranking is only a provisional candidate, not a visual or phoneme review.
   `attach_video` preserves hash-bound synchronization warnings; assembly surfaces them.
   Missing or unresolved quality evidence stays advisory and never becomes a fabricated pass.
5. For existing footage with the same audio and event starts, `attach_video` with
   `reuse:"tail_trim"` can bind a shorter ending without regeneration. The server verifies
   unchanged dialogue, action semantics, audio hashes and timing starts. Changed speech,
   changed staging, later actions that moved, and extensions are rejected by this reuse
   route. Inspect the actual action completion; preserve the original source binding.

The local [retime-performance.js](retime-performance.js) CLI uses the same timing helper
for offline previews: `BOARD SHOT_ID --speech-bound-actions`, optional
`--action INDEX SECONDS`, then `--apply`. Prefer the revisioned tool for production writes.
Do not copy provider frame counts into action or scene durations. Refresh selected endpoints
and the edit manifest after retiming. Playback and voice quality remain unverified unless
actually inspected; capability flags and schema checks cannot verify either one.
