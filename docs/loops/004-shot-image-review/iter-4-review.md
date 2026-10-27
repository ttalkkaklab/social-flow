## Target Verification Report — iteration 4

### Target

Improve repeated-shot-image prevention and detection, update this MacBook’s Codex and Claude installations, and independently verify ≥95 points with zero P0 defects, without changing the original episode or introducing mandatory creative gates.

### Overall Score: 100/100

Points were awarded from zero under the frozen rubric. This score evaluates the scoped implementation and installation; it does not certify generated-video aesthetics.

### Score Breakdown

| Criterion | Awarded | Max | Evidence | Refutation attempted |
|---|---:|---:|---|---|
| Functional completeness C1 | 10 | 10 | `shot-image-review.js:11–36,79–100`; feature tests at `shot-image-review.test.mjs:23,89,124`; independent actual-Meleon probes below | Renaming, re-encoding or small edits might evade detection; missing pixels might silently pass. Counterexamples detected, unavailable pixels explicitly unverified. |
| Functional completeness C2 | 10 | 10 | `shot-image-review.js:54–76,102–105`; tests at lines 37,49,106 | Alternating speakers might hide recurrence; changed composition could be labelled identical. Nonadjacent recurrence detected; supplied composition, state, camera and location changes distinguished. Findings remain advisory. |
| Functional completeness C3 | 10 | 10 | `check-scenes.js:3106`; `check-production.js:165–168,187–197,328`; independent installed preflight and MCP probes | Evidence might exist only in an isolated helper. Both installed entrypoints surfaced real paths and stable IDs. |
| Functional completeness C4 | 10 | 10 | `visual-direction.md:49–81`; `still-generation.md:151–159,183–189`; `full-video.md:257–260,296–303`; `directing-grammar.md:47–52` | Guidance might preserve actor-to-portrait assignment or merge independent cuts. Instructions explicitly address opening state, framing, identity references, sequence inspection and separate generation inputs. |
| Objective gate | 25 | 25 | `iter-4-tests.log`: `npm run check`, 1,894 passed, `EXIT_CODE=0`; `iter-4-lint.log`: exit 0. Independently reran lint and eight feature tests, exit 0. Current tracked-patch SHA and both new-file hashes match staged receipt. | Logs might describe stale source or failing checks. Current patch SHA is `13dcd26c…77223`; new helper and test hashes match source and stage. |
| Regression coverage | 15 | 15 | R1: test line 23; R2: 89; R3: 37,106; R4: 49,60,124; R5: 68 plus installed probes and original-file hash comparison | Tests might omit renamed copies, pixel comparison, nonadjacent recurrence, exclusions or integration. All five cases exercised; feature assertions depend on the added helper/integration. |
| Installed artifact verification | 10 | 10 | Both registries resolve `0.114.0-shot-images.4`; independently compared all 796 staged files against both installations: zero mismatches. Both installed eight-test suites exit 0. Fresh current-byte MCP probes pass. | Cache folders could be unused, divergent, or runtime-inoperable. Registry, byte comparison, installed tests and fresh MCP processes defeated these counterexamples. |
| Scope and truthful documentation | 10 | 10 | `git status`/diff confined to declared scope and loop artifacts; all 143 baseline episode hashes unchanged. `visual-direction.md:73–81` explicitly describes heuristic limits and unverified pixels. | Original media might be changed, or heuristic output represented as a creative pass. Neither occurred in verified scope. Existing session restart and legacy-board failures remain distinct from installation success. |

### Independent adversarial evidence

- Re-encoded actual `minsu.png` as JPEG: detected, mean RGB distance `0.002715`, edge difference `1`.
- Added a small 24×24-pixel prop-like edit: detected, distance `0.000236`, edge difference `0`.
- Substantially cropped/reframed the same image: no similarity candidate. Visually inspected the original and crop to confirm the composition changed.
- Used actual `hall-sign.png` as another negative control: no similarity candidate.
- Temporary fixtures: `/var/folders/15/60g2wtt90rl8vms1ydjcq_2h0000gn/T/review4-real-FQEKot`.
- Both installed helpers report six shared-image groups and five similarity candidates on Meleon. Installed assembly preflight returns identical `imageReview` evidence.
- Both fresh MCP processes return version `0.114.0-shot-images.4`, real Meleon paths, stable shot IDs and decoded-image comparison warnings.
- Fresh runtime receipts: `/tmp/shot-review4-codex-probe.json` and `/tmp/shot-review4-claude-probe.json`.
- Independently verified current stage and both installed bundle hashes: `b42224cda09f42cab6b21fbcf15744e7a498fe7179880975686f20536be0f871`.

### P0 Defects

None.

### P1/P2 Findings

1. **P2 — stale runtime receipt:** `docs/loops/004-shot-image-review/iter-4-mcp-evidence.json:8,20` records bundle hash `df5ac19e…`, whereas current stage and both installations contain `b42224cd…`. The cause of that earlier drift was not established during this review. Independent fresh probes of the current bytes passed, so this does not block installed-artifact verification. Preserve those fresh receipts and supersede the stale summary.
2. **Verification boundary:** the original preservation baseline covers 143 files and excludes the episode’s `.work` tree. All 143 match. Do not expand that statement into a historical hash verification of every file under the episode.
3. **Existing episode limitations:** installed assembly preflight reports ten contract errors, and the MCP storyboard check reports existing legacy-board violations. Runtime success does not mean the original board passes all production contracts.

### Fix Directives for Next Iteration

No implementation iteration is required by the frozen rubric. Before closing the evidence package, replace or explicitly supersede the stale MCP summary using the fresh current-byte receipts.

### Recommendations

Keep the documented 32×32 comparison limits visible. Crops, relighting and semantic similarity remain outside reliable automatic detection; actual image inspection remains necessary. Existing application sessions must reload the updated plugin before claiming they use these bytes.

ASTRA_LOOP_RESULT: score=100 verdict=PASS p0=0 iter=4
