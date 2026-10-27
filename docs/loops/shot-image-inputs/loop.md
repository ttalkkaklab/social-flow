# Shot image inputs

Target: improve shot-level start/end/additional image planning, review and actual provider handoff; adversarial evaluation until score >=95 with zero blocking defects.
User instruction (2026-10-26) supplies the completion threshold and authorizes iterative repair.

Frozen rubric (100 points):
- Functional completeness: 40, 8 each for structured role/usage planning, storyboard visibility, image-generation reference propagation, video adapter mapping without silent loss, complete image inventory/provenance.
- Objective gate: 25 only if `cd server && npm run check` and `node skills/platform-guide/references/skill-lint.js` exit 0. Blocking if either fails.
- Behavior tests: 15, 3 per capability above with tests exercising behavior.
- Conventions: 10 minus 2 per evidenced violation class.
- Scope and compatibility: 10 only if legacy behavior remains tested and changes stay within this feature.

Missing required input, unsupported input silently discarded, wrong asset submitted, stale input executed, or broken legacy execution is a blocking defect regardless of score. Provider support is limited to installed adapter contracts; this task does not enable undocumented API combinations. No paid calls or publication.
