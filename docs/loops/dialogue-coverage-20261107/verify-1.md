# Iteration 1 — independent adversarial review

Score: 80/100. FAIL, one critical defect. Reviewer: dialogue_verifier, fresh context.

Coverage decisions 25/30; workflow reachability 25/25; existing contracts 10/20;
cases and evidence 10/15; objective verification 10/10.

Findings:
- Critical: reference incorrectly said MSR requires on-screen dialogue. The compiler
  supports off_screen and voiceover (server/src/video-voice.ts:320); the old provider
  table repeated the stale restriction.
- shot_dialogue cannot accept acting and only preserves destination-local existing
  acting (server/src/storyboard.ts:970,1118). Release source IDs before destination
  writes to avoid duplicate-ID rejection; snapshot and restore performance fields.
- story_shot appends to the scene (server/src/storyboard.ts:928). Explicitly place the
  reverse after its source, then reconcile positional continuity references.
- The pinned MSR example was incorrectly described as a foreground-speaker example.
  Use only its supported demonstration of OTS coverage.

Required checks passed: npm run check (1640 tests), skill-lint (17 rules, 29 skills),
whitespace and changed-prose D8. Score concerns instructions, not rendered videos.

ASTRA_LOOP_RESULT: score=80 verdict=FAIL p0=1 iter=1
