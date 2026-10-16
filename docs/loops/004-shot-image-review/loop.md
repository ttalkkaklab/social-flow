# Shot image repetition: local installation and adversarial verification

Date: 2026-10-17. Classification: A, feature completion / regression prevention.

## Target

User request: 개선작업을 진행하고 플러그인을 이 맥북에 업데이트해서 테스트를 진행해서 적대적으로 평가해서 95점 이 상이 될때까지 개선하고, 다시 플러그인을 이 맥북에 업데이트하고 다시 테스트 및 적대평가 개선 반복으로 95점 이상이 될때까지 개선해줘.

Improve prevention and detection of accidentally repeated shot images, install on this
MacBook, test the installed artifact, and repeat independent adversarial review until
score >= 95 with zero P0 defects. Scope includes the existing uncommitted shot-image work.
Do not regenerate or edit the original Meleon episode, publish content, or introduce
mandatory creative scoring gates into normal production.

The user's explicit repeat-until-95 instruction overrides the skill's default 90 threshold
and iteration-cap confirmation. This rubric is fixed before evaluation; it is not a claim
that the user separately approved its weights. Continue until the target or a real blocker.

## Frozen rubric

| Criterion | Weight | Award rule | Required evidence | P0 |
| --- | ---: | --- | --- | --- |
| Functional completeness | 40 | 10 per capability C1–C4 verified below; absent or refuted capability earns 0 | Reproduction commands, actual assets, code locations | Any missing capability |
| Objective gate | 25 | All or nothing: `cd server && npm run check` and `node skills/platform-guide/references/skill-lint.js` both exit 0 for evaluated source | Logs with exit codes and source fingerprint | Yes |
| Regression coverage | 15 | 3 per case R1–R5 that fails without the change and passes with it | Test locations and commands | No |
| Installed artifact verification | 10 | 5 for Codex, 5 for Claude: installed version resolves, runtime files match staged source, installed entrypoints pass tests | Install receipt, hashes, commands; stale session distinguished from fresh process | Yes |
| Scope and truthful documentation | 10 | 5 for no unrelated edits/original-episode mutation, 5 for accurate limits and operating instructions | Changed-file list, before/after hashes, docs | No |

C1: Detect shared paths, renamed byte copies, and visually near-identical local images
such as re-encoded copies or small expression/prop edits. Similarity candidates are
evidence for visual review, not automatic creative failure. Unavailable pixels stay unknown.

C2: Review nonadjacent returns of an actor/setup without claiming that genuinely different
composition, camera/location or visible state is identical. Intentional reverse shots,
imported clips and common identity references remain valid; evidence is advisory.

C3: Reach the review evidence through storyboard checking and production preflight, with
stable shot IDs, actual source references and actionable findings. Missing/unsupported
assets must not silently become a verified visual pass.

C4: Authoring/production instructions address the root cause: opening state and framing
before assigning source images, appearance references separate from source frames, compare
the actual sequence, and do not merge independent cuts merely because their image matches.
An installed reviewer must be able to inspect real comparison evidence.

R1 exact/renamed copies; R2 re-encoded and small visual changes; R3 nonadjacent recurrence
and meaningful composition differences; R4 exclusions/unavailable media/no false pass;
R5 installed checker/preflight integration and original Meleon preservation.

## Verification protocol

Each iteration: improve source -> run objective gates -> stage a uniquely versioned local
plugin -> update Codex and Claude -> verify installed files and execute installed checks
on Meleon and synthetic edge cases -> fresh-context read-only adversarial verifier.
Store commands and receipts per iteration. The evaluator scores from zero using this rubric
and ends with `ASTRA_LOOP_RESULT: score=N verdict=PASS|FAIL p0=N iter=I`.
PASS requires score >= 95, no P0 and successful objective gates. Reports are evidence,
not a quality claim about ungenerated future videos.
