# Delivery preflight and continuation

**Resolve the whole delivery path before generating clips.** Check the pinned TTS
runtime, final encoder, destination and media-generation allowance. Speech uses raw TTS
and provenance under shot-speech.md; no listening-review capability, paid review allowance
or human listening approval is required. Resolve actual media spending authorization before
calling a paid generator and continue independent work while any required answer is pending.

**Resume through delivery in this session.** A directory of clips or a continuation
checkpoint is not a completed episode. Inspect `episode-state.js`, preserve existing
assets and approvals, then continue narration → manifests → assembly → final checks →
`output/`. Reuse approval for the exact disclosed warnings; do not repeatedly ask or
rewrite failed reviews as PASS. Exhausted quality retries follow the video HITL
contracts rather than silently ending the run. Only an actual missing authorization,
unavailable dependency or unresolved encoding/input error can require a pause; report
the specific remaining action and complete independent work first. Do not claim
completion until the delivered files and delivery proof validate. Publication is separate.
