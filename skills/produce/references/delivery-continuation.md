# Delivery preflight and continuation

**Resolve the whole delivery path before generating clips.** Check the pinned TTS
runtime, listening-review capability and allowance, final encoder and destination.
Local synthesis is free but the default listening review is paid: quote both scene
reviews and final listening, including bounded provider retries, before a long video
generation run. A configured key is not spending approval. If an allowance is missing,
ask immediately and continue independent authorized work while the answer is pending.
Do not postpone the question until all clips have been generated.

**Resume through delivery in this session.** A directory of clips or a continuation
checkpoint is not a completed episode. Inspect `episode-state.js`, preserve existing
assets and approvals, then continue narration → manifests → assembly → final checks →
`output/`. Reuse approval for the exact disclosed warnings; do not repeatedly ask or
rewrite failed reviews as PASS. Exhausted quality retries follow the video/speech HITL
contracts rather than silently ending the run. Only an actual missing authorization,
unavailable dependency or unresolved encoding/input error can require a pause; report
the specific remaining action and complete independent work first. Do not claim
completion until the delivered files and delivery proof validate. Publication is separate.
