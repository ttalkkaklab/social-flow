# TTS routing result

The fresh adversarial loop reached 95/100 with zero P0 in iteration 5.
The remaining medium uppercase-extension issue was fixed before merge and
independently rechecked: 14/14 routing tests passed, zero unresolved review findings.

| Iteration | Score | P0 | Outcome |
|---|---:|---:|---|
| 1 | 0 | 1 | Objective gate failure; startup/path/schema regressions corrected |
| 2 | 0 | 1 | Objective gate failure; lazy registry proxy replaced with a function |
| 3 | 94 | 1 | Invalid WAV format/width combination; corrected and regression added |
| 4 | 91 | 1 | Corrupt MP3 payload; strict decoding and end-to-end regression added |
| 5 | 95 | 0 | Target met; uppercase-extension follow-up also resolved |

Implemented: shared model contracts and adapter preparation, capabilities/plan/execute
router, strict direct entrypoints, tool/credential/output/concurrency gates, durable
request identity, hash-checked replay, conservative uncertain receipts, one speech
submission per call, usable-media/timing checks, and honest not_reviewed provenance.
Plans and replay add no usage-ledger charge rows. Existing hosted providers/defaults
remain; no research-only provider or automatic acting/listening gate was introduced.

Validation uses local media and mocked provider responses. This score assesses code
contracts and failure handling, not emotional delivery, pronunciation or voice identity.
No paid audio generation, uploads or publication occurred during the implementation.

Final validation after the uppercase-extension fix:

- `npm --prefix server run check`: exit 0, 2,231 tests passed, 197 suites, no failures/skips.
- `node skills/platform-guide/references/skill-lint.js`: exit 0, 16 rules across 21 skills.
- Skill-lint selftest: passed.
- `git diff --check`: passed.
- Follow-up independent routing regression: 14/14 passed; severity counts all zero.

The user subsequently authorized dev merge, main-worktree pull and removal of this
worktree. Existing changes in the main worktree must be preserved during that handoff.
