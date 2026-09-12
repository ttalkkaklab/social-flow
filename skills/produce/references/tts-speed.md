# TTS speed requires a human request

Use 1.0 for synthesis, saved narration and final playback unless the user explicitly
requests another factor for this episode. A channel profile, target characters per
second, quality reviewer, retry or previous episode cannot authorize a change.
Do not infer a request from “make it natural” or “fit the duration”. Do not change
speaking speed through style prompts, delivery instructions, shell filters or provider
fallbacks to bypass this policy. Shorten the script or report the failed rate check.

Assembly always preserves 1.0x, including the outro. Legacy `ATEMPO_MIN`, `ATEMPO_MAX`
and target-rate values cannot enable per-scene correction. A human request may select
one synthesis factor or one final feature factor; it never enables automatic scene rates.
ElevenLabs still forbids post-synthesis stretching, even with an approval.

For a non-1 factor, record the actual user's request in `speed-authorization.json`
in the generation output directory and in the episode `.work` directory used by the
builder. Use the same record in both places when they differ. This is an audit record,
not an identity authentication mechanism. Never invent the quote or copy another
song, channel or episode's approval. With no request, omit the file and use 1.0.

```json
{
  "version": 1,
  "requests": [
    {
      "source": "explicit-user-request",
      "scope": "generation",
      "factor": 1.2,
      "request": "Read this episode at 1.2x synthesis speed.",
      "requestedAt": "2026-09-12T00:00:00Z"
    }
  ]
}
```

Replace the example with the real request and timestamp. `scope` is `generation` for
native synthesis or `final` for final playback (including `playbackSpeed` used to size
subtitle pauses). Permission for one scope or factor does not authorize another.
The existing provider limits and final speech-rate checks still apply.

Direct local and ElevenLabs tools check before synthesis. The checked TTS tool checks
before preflight, cache reuse or saving audio and records actual factors and approval
in the audio quality proof. Assembly requires these speed records and checks the
current request before reusing non-1 narration. Audio without recorded speed must be
regenerated with the checked tool; do not relabel old audio as 1.0.

The final pass checks every engine, even if `cards.tsv` or quality sidecars are absent.
An unapproved non-1 factor fails before encoding. Existing output is not automatically
rewritten by installing this policy; rebuild episodes from approved source audio.
