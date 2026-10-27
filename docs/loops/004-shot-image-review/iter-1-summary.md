# Iteration 1 — 61/100, three P0 defects

Source: 1,891 tests and skill lint passed. Both hosts were updated to
0.114.0-shot-images.1, preserving the existing 0.114.0 feature set.
Installed suite: 1,901/1,902 passed; runtime version disagreed with the manifests.

Independent review refuted re-encoded-image detection and accurate composition grouping.
Fixes: decode local stills and compare pixels; compare all supplied composition/depth/state
fields; expose unavailable pixels and source references; rebuild staged runtime at its
actual installation version. Full report: iter-1-review.md.
