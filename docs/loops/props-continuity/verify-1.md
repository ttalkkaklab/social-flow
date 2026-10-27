# Independent adversarial review — iteration 1

Evaluator: fresh-context props_review_1 (read-only).
Score: functional 25/35; persistence 18/20; UI 17/20; installed evidence 9/15; production/docs 6/10. Total 75/100, critical defects 1.

Reproduced findings:
1. Critical: lend accepts a null sender; damage can transfer custody. Enforce action-specific preconditions and allowed fields, with negative tests.
2. Ordinary still assemble ignores propPrompt (only clipAssemble used it). Test the actual still CLI.
3. MCP discovery omits propSheet and expectedSha256 despite handler support. Installed smoke fails.
4. Appearance-only props in visual.props disappear from snapshots and per-shot view.
5. Reserved character id unknown is accepted and collides with the unknown sentinel.
6. UI resolves location/condition through character names, corrupting literal display.

Source objective gate: 3701/3701 tests pass, 416 suites. Skill lint: 16 rules across 18 skills.
Independent probes show negative-coverage gaps despite those passes.
Installed MCP smoke: failed. Browser preliminary flow passed; mobile screenshot inspected by parent.
Native portal UI is explicitly outside this plugin change; metadata roundtrip is documented and tested.

Fix directives: repair all six findings; rebuild/reinstall; rerun source gate, installed MCP, still/spatial prompts and real-browser appearance/continuity checks. Keep the rubric unchanged.

ASTRA_LOOP_RESULT: score=75 verdict=FAIL p0=1 iter=1
