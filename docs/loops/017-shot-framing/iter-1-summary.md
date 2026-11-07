# Iteration 1

Objective gate: `cd server && npm run check` exited 1. 1653/1654 tests passed.
The tool-description contract rejected the expanded `shot_image` description at
4335 characters. Skill lint passed (17 rules, 29 skills).

No independent evaluator ran because the objective gate failed.

Fix directive: shorten only the affected tool description while preserving its
generation/completion contract and aligning background wording with crop precedence.
Then rebuild and run both objective checks before independent evaluation.

ASTRA_LOOP_RESULT: score=0 verdict=FAIL p0=1 iter=1
