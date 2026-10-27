# Prop continuity implementation and installed verification

Target: implement the agreed prop sheets, ownership/custody story timeline and shot integration; install on this MacBook and repeat adversarial review, fixes, reinstall and tests until score >= 95 with no critical defects.

Frozen rubric:
- Functional correctness and temporal invariants: 35
- Persistence, migration and compatibility: 20
- Review UI and accessibility: 20
- Installed package and regression evidence: 15
- Production integration and documentation: 10

Objective gate: `cd server && npm run check`; `node skills/platform-guide/references/skill-lint.js`.
Critical failures include data loss, fabricated history, ownership changing after shot reorder, accepting invalid custody transfers, broken existing boards, or claiming an installation/test that did not run.

User explicitly requested repeated improvement until >=95; this replaces the skill's default 90-point threshold and fixed iteration cap. Each independent evaluation uses this unchanged rubric and fresh context.
