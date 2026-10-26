# Independent adversarial review — iteration 2

Reviewer: image_inputs_review_2 (fresh context, read-only).
Score: 94/100. FAIL, 2 blocking defects.

1. Structured first_last with references:[] and no location returns no ending input while marking endFrameReady. Always attach the opening image.
2. requireCompositionReference skips explicit frames.start when references is omitted. Use the same structured-plan predicate as video compilation and inventory.

Scores: structured planning 8, visibility 8, image propagation 2, video mapping 8, provenance 8, objective gates 25, behavior tests 15, conventions 10, compatibility/scope 10.
Evidence: 2499 tests and 17 lint rules passed; screenshot inspected. Prior fixes verified.

ASTRA_LOOP_RESULT: score=94 verdict=FAIL p0=2 iter=2
