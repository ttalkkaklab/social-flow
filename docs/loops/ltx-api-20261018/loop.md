# LTX API integration verification

Date: 2026-10-18. Baseline: 4c3b52a. Target: improve the plugin against the supplied
LTX API manual and repeat adversarial review until at least 95/100.

## Frozen rubric

| Criterion | Points | Evidence |
| --- | ---: | --- |
| API contract fidelity | 30 | Published fields, ranges, rejection rules, explicit compatibility choices |
| Production option propagation | 25 | Authored controls survive preparation and wire serialization; unsupported combinations fail clearly |
| Regression and boundary tests | 25 | Behavioral tests, mocked transport, build and full contract suite |
| Documentation and install artifacts | 20 | Accurate tool/skill guidance, reproducible snapshots, rebuilt committed-distribution files |

Passing requires score >=95, zero P0 defects, `cd server && npm run check` exit 0,
and `node skills/platform-guide/references/skill-lint.js` exit 0. A fresh read-only
reviewer scores from artifacts and executable evidence, not the implementer's self-rating.
The user's requested 95-point threshold replaces the loop skill's 90-point default.

## Scope and evidence limits

- Preserve tier naming; no server model alias added to the tools.
- Forward authored HQ/guidance/LoRA/audio controls through the existing shot helper.
- Accept contract-valid guided/HQ dimensions without asserting unmeasured quality.
- Reject conflicting length selectors; honor every mode's per-edge and pixel limits.
- Expose opt-in HDR only on text and audio without visual input. HDR assembly quality is unmeasured.
- Keep historical audio omission behavior deterministic with explicit 121 frames.
  The live capability field says omission derives length from audio, while its own
  contract_notes still say 121. Do not assert a corrected server implementation.
- Update upload limits and describe list/delete endpoints as provisional extensions.
- Live authenticated reads only: /v1/models and /openapi.json. No GPU jobs, uploads,
  deletion, publication or production-server mutation were used for this change.
- Test snapshots were captured from the live server on 2026-10-18 KST. They contain
  public contract metadata, no credentials. Snapshot tests detect local drift; a future
  server deployment requires another explicit capture.

## Result

| Review iteration | Score | P0 | Objective gate | Verdict |
| --- | ---: | ---: | --- | --- |
| 1 | 99 | 0 | 2,169 tests pass; skill lint passes | PASS |

Independent reviewer evidence is in verify-1.md. A stale HDR comment was removed
and distribution rebuilt during review. The remaining low-priority suggestion is
an additional public-route HDR transport test; current schema/serializer tests pass.
The requested threshold was achieved without a live GPU generation claim.
