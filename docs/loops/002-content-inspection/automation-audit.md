# Automation audit

The owner requested CTA checks removed and creative practices primarily expressed
as skill guidance. The following entry points were exercised, not just searched.

| Entry point | Resulting behavior | Evidence |
|---|---|---|
| scenario candidate CLI | accepts one readable candidate; creative metadata/score/engine advice; malformed events still fail | character-scenarios.test.mjs |
| story read CLI | readable text/map without review; malformed script fails | story-contract.test.mjs |
| storyboard apply/read/check | sparse plans save; ordered actions/speech and context readable; duplicate IDs and dangling references fail | guided-storyboard, storyboard-read, structure-shot-ids tests |
| routing and production | rationale, repetition, duration/style records and review quality advise; unsupported adapter arguments remain errors | automatic-production-guidance.test.mjs |
| existing-video assembly | generation-era quotes/metadata no longer gate existing usable files; file/hash/timing and stable references still checked | assembly-video-gate, build-plan-cli, explicit-subtitles tests |
| location image references | no review PASS required; real render/receipt/files must match | location.test.mjs |
| local review HTML | incomplete character identity/voice advises; stale renderer or missing referenced board still fails design check | review-library.test.mjs |
| skills and reviewers | shared policy linked from 20 skills and five reviewers; existing user authorization reused; no invented PASS | skill-lint and independent code audit |

The first independent audit found two defects that passing legacy tests did not
cover: residual camera/previz quality gates and assembly converting duplicate shot
IDs into warnings. Both received targeted regression coverage before final evaluation.

Manual low-level diagnostic helpers remain useful for requested criticism. They do
not define default authoring acceptance. Explicit user requests for quality loops
still apply to their task. A review score never grants spending or publication rights.
