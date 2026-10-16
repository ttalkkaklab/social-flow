## Target Verification Report — iteration 1

### Target

Improve repeated-shot-image detection, install on this MacBook, and verify until score ≥95 with zero P0, without changing the original episode or adding creative approval gates.

### Overall Score: 61/100

### Score Breakdown

| Criterion | Awarded | Max | Evidence | Refutation attempted |
|---|---:|---:|---|---|
| Functional completeness C1 | 0 | 10 | `skills/storyboard/references/shot-image-review.js:28–35` | Re-encoded the actual Meleon `host.png` to temporary JPEG using `ffmpeg -q:v 2`. Two shots referencing the PNG and JPEG returned `[]`. No decoded-image comparison exists. |
| Functional completeness C2 | 0 | 10 | `skills/storyboard/references/shot-image-review.js:43–44,63` | Three valid intentional compositions with different headroom and eye height were reported as the “same … composition … plan.” The grouping key ignores these fields. |
| Functional completeness C3 | 10 | 10 | `skills/storyboard/references/check-scenes.js:3106`; `skills/produce/references/check-production.js:165`; `server/test/shot-image-review.test.mjs:58–77` | Confirmed source-reference warnings, stable shot IDs, checker/preflight integration and explicit unverified wording for repeated missing/remote references. Targeted tests exited 0. |
| Functional completeness C4 | 10 | 10 | `skills/storyboard/references/visual-direction.md:49–77`; `skills/produce/references/full-video.md:296–303`; `skills/produce/references/still-generation.md:183` | Instructions explicitly separate identity references from source frames, require opening-state planning and actual-image inspection, and prohibit merging independent cuts by filename. Installed copies match staging. |
| Objective gate | 25 | 25 | `docs/loops/004-shot-image-review/iter-1-tests.log` ends `EXIT_CODE=0`, 1,891 passing tests; `iter-1-lint.log` ends `EXIT_CODE=0` | Current binary patch hash matches the staged source receipt. Independently reran skill lint and all five shot-image tests: exit 0. |
| Regression coverage R1 | 3 | 3 | `server/test/shot-image-review.test.mjs:23–35` | Exact/renamed copies and normalized paths are exercised; test passes. |
| Regression coverage R2 | 0 | 3 | `server/test/shot-image-review.test.mjs:23–78` | No re-encoding or small-pixel-change case exists; actual re-encoding escapes detection. |
| Regression coverage R3 | 0 | 3 | `server/test/shot-image-review.test.mjs:37–46` | Tests missing files and coarse metadata changes only. The valid composition-change counterexample refutes the required distinction. |
| Regression coverage R4 | 3 | 3 | `server/test/shot-image-review.test.mjs:49–63` | Exclusions, common identity references and repeated unavailable references pass targeted tests without claiming visual approval. |
| Regression coverage R5 | 0 | 3 | `docs/loops/004-shot-image-review/iter-1-installed-tests.log:2398,2433` | Installed regression suite fails. Original preservation alone does not satisfy the combined case. |
| Installed artifact verification | 0 | 10 | `docs/loops/004-shot-image-review/iter-1-installed-tests.log:2427–2433` | Both installations contain the staged bundle, but its version is `0.114.0` while their manifests declare `0.114.0-shot-images.1`; installed suite exits 1. |
| Scope and truthful documentation | 10 | 10 | Current `git diff`; original manifest `.work/shot-image-loop/meleon-before.json`; `visual-direction.md:70–77` | All 143 recorded original episode files retain their hashes. Changes concern this feature. Documentation accurately describes current byte-level limits and advisory behavior. |

### P0 Defects

1. **C1: Visually near-identical images escape detection.**
   `skills/storyboard/references/shot-image-review.js:28–35` uses SHA-256 only. Re-encoding Meleon’s actual host image produces no finding when used in another shot. The frozen rubric explicitly requires this capability.

2. **C2: Different composition plans are described as identical.**
   `skills/storyboard/references/shot-image-review.js:43–44` groups by `composition.position || composition.type`, omitting canonical composition fields. Three otherwise matching shots with `headroom/eyeHeight` values `generous/0.6`, `natural/0.33`, and `cropped/0.1` trigger the inaccurate assertion at line 63.

3. **Installed runtime and manifest disagree; installed tests fail.**
   `docs/loops/004-shot-image-review/iter-1-installed-tests.log:2427–2433` records the version mismatch and `EXIT_CODE=1`. Matching installed files to staging does not remedy a defective staged artifact.

### P1/P2 Findings

1. `shot-image-review.js:31,54` silently omits distinct missing/unsupported images unless another reference repeats. Return explicit unknown coverage so an empty finding list cannot be mistaken for completed pixel inspection.
2. `shot-image-review.js:48–52` drops structured image references from findings. Repeated-setup warnings contain IDs but no comparison image paths.
3. `shot-image-review.js:61` ignores a setup occurring exactly twice, including a nonadjacent return. Consider reporting pairs as advisory candidates.

### Fix Directives for Next Iteration

1. **C1 / R2:** Add local pixel comparison that detects re-encoded copies and minor edits. Report candidates with image paths, stable IDs and uncertainty; preserve advisory behavior. Test actual decodable images.
2. **C2 / R3:** Compare canonical composition/depth fields and visible-state evidence. Distinguish incomplete metadata from matching plans. Add tests for meaningful headroom, framing, viewpoint and state differences.
3. **Installed verification / R5:** Rebuild the preserved-base-plus-patch bundle with the staged version before installation. Verify runtime handshake version, rerun the installed suite and repeat fresh MCP probes for both hosts.
4. Add explicit unavailable-image coverage and real comparison references to checker/preflight evidence; keep unavailable pixels unknown.

ASTRA_LOOP_RESULT: score=61 verdict=FAIL p0=3 iter=1
