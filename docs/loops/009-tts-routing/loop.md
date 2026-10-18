# TTS routing improvement loop

Date: 2026-10-18. Classification: refactoring.

User target: 지금 다른세션에서 작업중인 영상 모델의 레이어와 게이트화를 통해 모듈화하고 더 좋은 코드가 되게 개선하는 부분을 참고해서 tts 모델 사용 방식도 개선해줘. 개선후 테스트를 통해 적대적으로 평가해서 95점 이상될때까지 개선해줘.

The user explicitly requested iteration until at least 95, overriding the skill's default 90 threshold and fixed iteration cap. No paid generation, uploads or publishing are part of this code task. The following weights were announced before implementation and are frozen.

| Criterion | Weight | Evidence |
|---|---:|---|
| Contract correctness | 30 | Exact implemented model selection, supported payloads, media/timing validation; no silent discarded direction |
| Compatibility | 25 | Existing supported tools and consumers, defaults and provenance; tests pass |
| Modular structure | 20 | Shared model capabilities, adapter preparation, execution boundary; minimal provider dispatch duplication |
| Failure handling | 15 | No blind billable retries, durable uncertain results, concurrency/output locks and replay integrity |
| Tests and documentation | 10 | Adversarial regression cases, usage instructions and honest limitations |

Score additively from zero. P0: wrong model/provider silently selected; unsupported request reaches provider; duplicate automatic billable submission; corrupt media certified successful; objective gate failure. Require >=95, zero P0 and all objective gates passing. This is a code correctness score, not a listening or acting-quality score.

Objective gate: `cd server && npm run check`; `node skills/platform-guide/references/skill-lint.js`. Fresh-context read-only verifier reports concrete file/line evidence and a final `ASTRA_LOOP_RESULT: score=N verdict=PASS|FAIL p0=N iter=N` line. Each report is stored separately.

Reference: the other session's `whitefish/docs/loops/001-video-routing/loop.md` describes capabilities, plan/execute, guarded direct adapters, concurrency and durable identity. No files in that worktree are modified. This TTS change does not implement video-specific budget quotes or claim provider idempotency.
