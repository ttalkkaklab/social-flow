# Video routing convergence

Target: 위의 내용대로 개선하고 테스트를 통해 적대적으로 평가하고 95점 이상이 될때까지 개선해줘.

Frozen 2026-10-18. User explicitly authorized implementation and convergence to 95;
the requested threshold supersedes the skill's default 90 and iteration-cap prompts.
No publishing or paid generation is part of verification.

Feature implementation rubric (additive from zero):

| Criterion | Weight | Award | Evidence | P0 |
|---|---:|---|---|---|
| Reachable functional completeness | 40 | 5 per fully implemented capability below | file:line and counterexample attempts | Any missing capability |
| Objective gate | 25 | All or nothing: npm run check and skill-lint exit 0 | commands and exit codes | Yes |
| Behavioral coverage | 15 | floor(15 × capabilities covered / 8) | meaningful tests exercising public paths | No |
| Conventions | 10 | 10 minus 2 per violation class, minimum zero; repository conventions prevail | changed code evidence | No |
| Scope and compatibility | 10 | All or nothing: changes limited to routing and its docs/tests/build; existing tests pass | diff and tests | Yes for behavior regression |

Capabilities: (1) deterministic snapshot/episode/shot selection with provenance;
(2) registry of implemented deployment/tool contracts and shared feature discovery;
(3) common plan/execute entrypoints and guarded legacy video routes;
(4) schema, input, configuration and disabled-tool checks before submission;
(5) atomic budget reservation and concurrency control across processes;
(6) durable request identity, submission receipts and safe ambiguous-failure handling;
(7) planning/speech/production consumers reuse routing contracts without creative gates;
(8) documented compatibility, host handoff boundaries and incremental migration.

Success requires score >=95, zero P0 defects, and passing objective gates.
Verifier runs in fresh context, read-only. Each report must end with
ASTRA_LOOP_RESULT: score=N verdict=PASS|FAIL p0=N iter=N.

Baseline unrelated changes: README.md research link and
docs/research/2026-10-18-video-model-api-pricing/ (preceding user task).
