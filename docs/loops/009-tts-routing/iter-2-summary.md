# Iteration 2 — objective gate failed

Full regression identified 11 character/audition failures caused by the lazy
registry's array proxy: `Array.some` observed no properties on its empty target.
Score 0, P0 1 (objective gate); no subjective verifier was invoked for this state.

Fix: replace the proxy with an explicit lazy `getTtsModels()` function. Startup
still works without the skills tree. Character, audition and routing regression
subset: 32 passed. Re-run the full build/tests before independent verification.

Additional mechanical checks now validate dialogue voice segments and reject a
conflicting single-speaker voice in a dialogue request. Router usage logging excludes
plans and completed-request replays. Public docs explain receipt recovery and costs.
