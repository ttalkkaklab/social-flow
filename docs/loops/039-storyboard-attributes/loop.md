# Storyboard attributes and request-time video prompts

The requested acceptance threshold is 95/100, zero blocking defects and passing repository checks. A fresh reviewer scores the implementation against these criteria. The scope includes the storyboard authoring tools, validators, review page, image and video handoff, legacy readers and installed plugin artifacts.

| Criterion | Weight | Award rule |
|---|---:|---|
| Functional completeness | 40 | Five points each for independent scene rules and shot choices, optical scale versus view/arrangement/purpose, timed focus and camera action, optical depth versus sound perspective, review of scenes before shots and route-specific controls, prompt-free authoring across writers and checks, request-time compilation from current attributes, and legacy board and approval handling. A missing core capability blocks acceptance. |
| Objective checks | 25 | Full server build and test suite plus skill lint must exit zero. Any failure blocks acceptance. |
| Regression coverage | 15 | Award floor(15 × covered capabilities / 8). Cite runnable tests or reproducible offline UI probes against each capability. |
| Contracts and guidance | 10 | Deduct two per distinct remaining contradiction in public schemas, skill instructions, field ownership or review labels. |
| Scope and artifacts | 10 | Changed files must support the request, preserve unrelated work and include the shipped bundle. |

The score measures the plugin through request construction and review. A provider's photographic performance is outside this test.
