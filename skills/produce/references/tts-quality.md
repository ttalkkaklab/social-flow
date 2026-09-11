# Narration quality gate

Every generated narration scene must pass `tts_generate_checked` before assembly.
The tool calls the selected generator, examines the actual WAV and retries only a rejected
take. `build-reel.sh` rejects missing, failed, unverified or stale proofs before rendering.
Assembly and the delivery speed pass verify the evidence again.

## Contents

- [Generation contract](#generation-contract)
- [Sentence spacing (ElevenLabs)](#sentence-spacing-elevenlabs)
- [What passes](#what-passes)
- [Retry and stop](#retry-and-stop)
- [Cost and prerequisites](#cost-and-prerequisites)
- [Assembly and final listening](#assembly-and-final-listening)

## Generation contract

Use the engine and voice from profile §2. Put its normal arguments inside `generation`.
Use the complete scene, with its narration segments joined by periods. Do not split a scene
into sentence calls. Keep `narration[].tts` as spoken words; put ElevenLabs acting tags only
in `generation.text` or `generation.inputs`. `expectedText` contains no acting tags or speaker
labels. Numbers, units and proper names must use their intended spoken spelling.

Example for a profile that specifies Supertonic F1 (replace these values with the profile):

```json
{
  "generator": "tts_local_generate",
  "generation": {"text": "오늘은 비가 옵니다.", "voice": "F1", "lang": "ko"},
  "expectedText": "오늘은 비가 옵니다.",
  "language": "Korean",
  "delivery": "A calm, conversational Korean narrator with clear endings and natural phrase breaks.",
  "outputPath": "/absolute/episode/.work/pcm",
  "filename": "c0.wav",
  "maxAttempts": 3
}
```

`generator` accepts `tts_generate`, `tts_multi_speaker`, `tts_local_generate`,
`tts_elevenlabs_generate`, `tts_elevenlabs_dialogue` or `mlx_tts_generate`.
Outer `outputPath` and `filename` control all attempts. Voice, model, style, speed and
temperature stay unchanged. A pinned ElevenLabs seed advances by one on each retake — the same
seed returns the same bytes, so a retake at the pinned seed would be the rejected take again;
each attempt records the seed it used. The expected text must match the generator's entire
spoken text.

Add `segments` on every scene: the scene's `narration[].tts` sentences in order (joined, they
read as `expectedText`). Add `playbackSpeed` when profile §2 sets a playback speed. Both feed
the sentence spacing below; on an engine without an alignment the take records
`spacing: { skipped: "engine has no alignment" }` and nothing else happens. On the ElevenLabs
lane they are part of the settings a PASS binds to, so changing `sentencePause`, `segments` or
`playbackSpeed` regenerates the take (the vendor audio is overwritten in place; there is no
offline re-spacing). The same binding means an ElevenLabs take checked before 0.74.0 is
regenerated once on its next call — its proof predates the timestamps and spacing settings.

## Sentence spacing (ElevenLabs)

ElevenLabs reads sentences back to back — 0.04–0.19 s of quiet between them on pundago ep10
(2026-08-31, the earlier voice) — so the builder's silence detection missed the boundary and
reveals and subtitle cues landed late. The checked tool therefore fetches every
`tts_elevenlabs_generate` take with timestamps and, before it measures or reviews anything,
lays the pauses in from the take's own character alignment:

- one fixed `sentencePause` (default 0.5 s) of digital silence at each segment boundary,
  cut from the short natural gap 0.12 s after the sentence's last letter — a take that already
  pauses longer than that is left alone there;
- the pause grows past `sentencePause`, up to 1.0 s, only where that sentence's subtitle cue
  would otherwise read faster than 6.0 chars/s after `playbackSpeed` (cue = sentence start to
  next sentence start; the ship gate is 6.2);
- a fixed 0.14 s lead before the first word (the builder keeps 0.10 s, so every card opens
  the same way), a 12 ms fade on either side of each cut, and not one speech sample changed.

It writes `<wav>.sentences.json` — each sentence's start and end in the shipped WAV — and
rewrites `.alignment.json` to that timeline (`vendor_alignment` keeps the original, `respaced`
the parameters). `build-reel.sh` snaps its sentence boundaries to that sidecar, so the reveal
fades inside the pause that was actually laid in. The proof binds to the re-spaced audio; the
review hears what ships. Measured 2026-09-11 on the pundago voice: a 0.50 s and a 0.39 s insert
reviewed at accuracy 100 · pronunciation 100 · naturalness 98 · clarity 98 with no defect.
A take with no usable alignment is kept as generated and `spacing.skipped` says why; the builder
then falls back to silence detection as before.

## What passes

| Check | Required result |
|---|---|
| WAV signal | Decodable, at least 0.25 seconds, at most 120 seconds, RMS at least -45 dBFS, no more than 0.1% clipped samples |
| Duration | At most twice spoken characters / 4.5, with a two-second allowance for very short utterances |
| Blind transcription | Character error rate at most 2%, ignoring punctuation, spacing and case |
| Accuracy | At least 98/100; quantities, names, endings, omissions and repetitions checked |
| Pronunciation | At least 95/100; native sounds, liaison and stress |
| Naturalness | At least 95/100; phrase breaks, breath, pacing and intonation |
| Clarity | At least 95/100; no audible noise, clipping, metallic sound or joins |
| Evidence | Full audio reviewed, confidence at least 0.9, concrete listening observations and no reported defect |

The blind transcription request does not receive the script. A separate request listens to
the audio with the script and delivery direction. It records defects with timestamps and
correction instructions. The listening judge cannot override a failed transcript comparison.
These are conservative operating thresholds, not calibrated human MOS scores. ASR can spell
a correct word differently and cause a false rejection; do not turn that rejection into PASS.

## Retry and stop

`maxAttempts` includes the first take and is capped at three. A failed acoustic or listening
check regenerates the scene at the same settings. The JSON proof keeps each attempt's hash,
measurements, transcript, scores and defects. Repeating the same request preserves the attempt
history; it does not grant three more takes. An unchanged PASS is reused.

A missing key/runtime, API error, invalid review or uncertain evaluation returns `unverified`.
It does not trigger another synthesis in that call. After fixing a review outage, the same
request reviews the saved candidate again. A valid review that rejects the take can then use
the remaining generation attempts. A concurrent call for the same WAV is refused.

On `fail` or `unverified`, stop production and set unattended queues to hold. Report the scene,
failed words/times, scores and attempted corrections. Do not edit a proof, reset its history,
change voices, lower thresholds or use a raw generation tool to bypass the gate. Correcting
the approved narration follows the existing storyboard approval rules, then generates and
reviews the corrected scene. Infrastructure recovery does not require a script change.

## Cost and prerequisites

The review uses the bundled server's Gemini API client with `gemini-3.8-flash` on API `v1`.
Set `SOCIAL_FLOW_TTS_REVIEW_MODEL` in the server environment to select another audio-input
model; an unset or blank value uses the default. `SOCIAL_FLOW_TTS_REVIEW_API_VERSION`
selects its API version (default `v1`, also used when blank). These settings affect only
the speech-review client. Restart the MCP server after changing either setting.
There is no automatic model fallback or API retry that spends on a different reviewer.
Changing the reviewer preserves synthesis attempts and resumes a pending candidate with
the same request and WAV hash. A previous PASS is reviewed again without another synthesis;
failed takes still count toward the three-take limit. It requires
`GEMINI_API_KEY` (or the existing Google key alias) and ffmpeg even when synthesis is local.
There is no silent local or text-only fallback. Before synthesis, include up to three takes
and up to six paid audio-review requests per scene in the episode's allowance. The first
generation attempt counts toward that limit. Existing provider error retries still apply.
An older zero-cost/local-only approval does not cover paid review; hold until the allowance
covers it. Never present local synthesis as a zero-cost reviewed episode.

Each synthesis and review writes an event to `.work/events.jsonl`, including rejected takes.
Review events include the model, stage and token usage. They remain unpriced until reconciled
with provider billing; a missing price is not zero. Carry unresolved review costs into the
cost report. Do not silently exceed the channel's overall budget.

## Assembly and final listening

`c0.wav.quality.json` is bound to the exact WAV and normalized scene text. The source-plan
checker records both file hashes. Replacing the WAV or changing the script invalidates PASS;
an old hand-authored WAV must be regenerated through the checked tool. There is no skip flag.
User recordings, native recorded speech and silent cards retain the existing playback QA.
Setting `sync=1` on generated narration does not exempt it.

Source speech review does not prove that trimming, tempo changes or the music mix preserved
every word. Keep final delivery-speed listening in retention-direction.md §5. If a first
line sounds robotic or a final syllable is clipped, return the affected scene to this gate
with `rejectTake: {audioSha256, reason}`. Use the current WAV hash and a concrete time/word
defect. This invalidates that take's PASS and uses only its remaining attempts. Then
rebuild and recheck the edited span and its joins. An unverified final listening check holds
publishing readiness regardless of the source speech scores.
