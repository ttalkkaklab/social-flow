# Narration quality gate

Every generated narration scene must pass `tts_generate_checked` before assembly.
The tool calls the selected generator, examines the actual WAV and retries only a rejected
take. `build-reel.sh` rejects missing, failed, unverified or stale proofs before rendering.
Assembly and the delivery speed pass verify the evidence again.

## Contents

- [Generation contract](#generation-contract)
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
Outer `outputPath` and `filename` control all attempts. Voice, model, style, speed, temperature
and seed stay unchanged. The expected text must match the generator's entire spoken text.

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
model; an unset or blank value uses the default. Restart the MCP server after changing it.
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
