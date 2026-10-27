# Independent adversarial review — iteration 1

Reviewer: image_inputs_adversarial (fresh context, read-only).

Score: 89/100. FAIL, 2 blocking defects.

1. `video-routing.ts` review enforcement tests references only, while compilation also activates for frames.start. Explicit new start/end without references can use unreviewed images. Use the same predicate everywhere.
2. `spatial-prompts.js` ending inputs without a location contain only appearance references; its prompt instructs editing the absent opening image. Include opening first and numbered endpoint-specific role/purpose guidance.
3. `video-image-inputs.ts` duration-to-frame rounding differs from the ASTRA adapter. 4.2s/24fps compiles ending index 104 but adapter renders 97 frames. Reuse framesForSeconds.

Scores: structured planning 8, visibility 8, image propagation 4, video mapping 5, provenance 4, objective gates 25, behavior tests 15, conventions 10, compatibility/scope 10.

ASTRA_LOOP_RESULT: score=89 verdict=FAIL p0=2 iter=1
