# Narration and storyboard image grounding

Date: 2026-10-18. Scope: plugin authoring, source-image handoff and review guidance.

User objective: fix unrelated narration/storyboard images before video generation;
iterate with adversarial evaluation until at least 95/100, then merge to dev, update
the main worktree and remove the task worktree. Existing episode media is read-only.

Frozen rubric:

| Criterion | Points | Evidence |
|---|---:|---|
| Conte communicates its intended contribution | 35 | Behavioral cases distinguish direct depiction, reaction, context and missing visual information; no compulsory literal illustration |
| Image and video handoff preserves intent | 25 | Source assemblers preserve meaning and pre-action state; direct host path and video request review follow the same plan |
| Factual and reconstruction boundaries | 15 | No invented factual detail, archival proof, historical quotation or visible lettering to repair relevance |
| Regression evidence | 15 | Real assembler tests, independent behavior exercises, server check and skill lint pass |
| Scope and usability | 10 | Existing fields and old callers work; no compulsory quality/approval gates, paid generations or unrelated changes |

Completion requires score >=95, zero P0 defects, `cd server && npm run check` exit 0,
and `node skills/platform-guide/references/skill-lint.js` exit 0. The user's until-target
instruction governs iterations. Scores assess this plugin change, not unseen generated
media. Reviewers see artifacts and this rubric without the author's self-assessment.

P0: source prompt reverses the required opening/action order; repair fabricates historical
evidence; missing pixels are certified; unsupported provider payload or old-call regression;
automatic paid regeneration or approval gate outside the authorized scope.
