# Existing webtoon inspection and regeneration

User target: improve the plugin, reinstall, rewrite the existing webtoon through storyboard, and repeat adversarial evaluation until at least 95/100.
Confirmed: 2026-10-16, user replies “그래 기존 웹툰을 다시 작성해봐” and “고고” to the proposed rubric, five-cycle cap and local/webtoon/no_video planning scope.
Maximum cycles: 5. Stop early only at score >=95, zero P0 and passing objective gates.
Source: gate-webtoon / 20261015-gate-beyond, canonical source stays unchanged.
Scope ends at the reviewable storyboard. No generated episode video, publishing or portal upload.

## Frozen rubric

Generic end-state preset, with end-state split into functional and domain coverage; five points moved from scope hygiene to reproducible verification.

| Criterion | Points | Award rule |
|---|---:|---|
| Inspection functionality | 25 | 5 each for ordered silent/action speech, stable shot/context lookup, character image access, scope-specific inspect skill, honest stale/unverified evidence. Cite code and a live or regression exercise for each. |
| Installed regeneration evidence | 25 | 5 each for hash-verified reinstall, fresh installed process, source preserved, new candidates/selection/board actually produced, fresh revised output recreated after any failed review. Last criterion also earns 5 if first cycle passes without requiring revision. |
| Domain and story quality | 25 | 5 each for character consistency, background geometry/direction, prop identity/state, motivated observable story with earned payoff, complete shot-to-shot flow. Within each: 0 absent, 1–2 major omissions, 3 usable with material defect, 4 minor bounded issue, 5 supported with actual sources/images as applicable. |
| Objective regression gates | 15 | All or nothing: npm run check and skill-lint exit 0; relevant new regression tests must exercise changed paths. |
| Instructions and scope | 10 | 2 each for consistent character-view instructions, no invented approval/review, no generation/publishing outside scope, usable local review artifact, no unrelated changes. |

P0: failed objective gate; credentials leaked or unauthorized remote/write actions; fake approval/review/media observation; broken installed reader/generator; lost source; essential story/identity contradiction preventing meaningful storyboard review.
The 95 target evaluates plugin and storyboard planning. It does not certify ungenerated episode visuals, video playback or unheard speech.
Every evaluator is independent and receives artifacts, this rubric and objective results, not optimizer self-assessment.
