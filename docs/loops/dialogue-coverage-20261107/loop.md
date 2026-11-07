# Dialogue coverage convergence

Target: improve face-to-face dialogue guidance and adversarially evaluate until at
least 95/100, with no critical defects. User requested this threshold on 2026-11-07.
Scope: authoring guidance and its skill entry points, not a new runtime gate or paid
video experiment. Baseline working tree was clean. User's until-95 instruction controls
termination. Evaluation criteria below are fixed before independent evaluation.

| Criterion | Points | Award rule |
| --- | ---: | --- |
| Coverage decisions | 30 | 5 each: face-to-face OTS/reverse preference; separate fixed-OTS speakers; valid two-speaker two-shot; profile/occlusion treatment; continuing speaker retained; intentional reaction exception bounded |
| Workflow reachability | 25 | 5 each: storyboard; image generation; video generation; produce; requested camera review reach actionable shared guidance |
| Existing contracts | 20 | 5 each: visible cast vs speaker; line preservation and story order; MSR bindings/voice route; spending/approval/reuse and no new gate |
| Cases and evidence | 15 | 5 each: positive/negative worked cases; primary sources with model-specific limits; no unsupported success-rate or generated-quality claim |
| Objective verification | 10 | 4 for npm run check exit 0; 4 for skill-lint exit 0; 2 for diff whitespace and changed prose D8 scan clean |

Score additively from zero with file:line or command evidence. Deduct each uncovered
item's full points; do not round upward to the target. A contradicted contract, dropped
speech, blanket OTS/two-speaker ban, new execution gate or failed required check is a
critical defect and forces FAIL regardless of total. PASS requires >=95 and no critical
defects. A score measures the instructions, not actual video generation reliability.

## Result

| Iteration | Score | Critical defects | Objective checks | Verdict |
| --- | ---: | ---: | --- | --- |
| 1 | 80 | 1 | Pass | FAIL |
| 2 | 100 | 0 | Pass | PASS |

Corrected off-screen MSR documentation, line/acting transfer, reverse-shot placement
and the source description after the first independent review. The second independent
review confirmed API compatibility with a temporary synthetic split scenario. Target met.
