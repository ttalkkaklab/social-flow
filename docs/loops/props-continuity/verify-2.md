# Adversarial iteration 2

Independent reviewer: props_review_2. Score: 93/100. Verdict: FAIL. Critical defects: 0.

Deductions: functional 35/35, persistence 20/20, UI 18/20, installed/regression 10/15, production/docs 10/10.

Findings: the active Codex cache changed during a concurrent character installation; previous installed evidence was stale. Prop cards chose the first image rather than the selected condition. The previous browser log was empty.

Fixes: combine props with the active character and location features in an isolated build; preserve all three in both host caches and the local marketplace source. Select a matching condition reference with a generic fallback. Persist actual browser assertions to JSON. Add actual MCP valid-write, backup and stale-hash tests. The installer checks target snapshots before writing and preserves executable bits.
