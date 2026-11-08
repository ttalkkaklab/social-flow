# Shot framing and image handoff

Date: 2026-11-08. Preset: B (bugfix). Maximum: 5 iterations.

User target: “개선해줘. 개선하고 적대적으로 평가해서 95점 이상이 될때까지 개선해줘.”
The user delegated rubric and iteration choices on 2026-11-08.

Scope: repair conflicting reference/crop instructions, distinguish story action from
frame boundaries in authoring guidance, and keep usable active images until a host
generation completes. Preserve saved routing and spending contracts. Do not introduce
creative-quality gates or claim that metadata certifies pixels.

| Criterion | Points | Evidence |
| --- | ---: | --- |
| Reported defects no longer reproduce | 40 | Authored crop takes precedence over a sheet's frame extent while directional geography remains; actionable crop/continuity guidance; pending, failed or stale host results cannot replace active frames (P0: unusable output destroys active binding) |
| Regression proof | 20 | Meaningful failure before the fix and success after it in existing module tests |
| Objective checks | 20 | `cd server && npm run check` and root `node skills/platform-guide/references/skill-lint.js` exit 0 (P0 on failure) |
| Root-cause layer | 10 | Fix prompt construction and handoff persistence, not episode-specific exceptions |
| Scope discipline | 10 | No unrelated edits, paid generations, new review gate or silent model switch |

Success requires at least 95/100, no P0 or other unresolved major defect, and both
objective checks passing. Independent reviewers read artifacts and tests, without
worker rationale. Scores measure these repairs, not a promise of perfect generated images.
The rubric stays fixed; results live in separate iteration reports.
