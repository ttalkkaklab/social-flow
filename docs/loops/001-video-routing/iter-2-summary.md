# Iteration 2

Applied the three independent fix directives:
- Normalize legacy ASTRA/host board markers in the shared pure selection contract.
- Reuse that contract from production checks and filesystem-backed routing.
- Retake keeps its source dimensions, verified with ffprobe, without unsupported fields.

Added public planning, mocked execution, mismatched-source and consumer parity tests.
Preserved legacy board checks while explicit saved/overridden choices use the resolver.
Full npm run check: exit 0, 2264/2264 tests, /tmp/whitefish-routing-iter2-check.log.
Focused regression suite: exit 0, 104/104. Skill-lint: exit 0, 16 rules across21 skills.
Fresh review pending. No paid generation or publishing.
