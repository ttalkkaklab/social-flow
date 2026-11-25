# Independent review, round 11

The reviewer scored the picture prompt 34/35, speech and routing 19/25, authoring and compatibility 19/20, regression coverage 14/15 and scope 4/5. Eleven focused tests and all lint rules passed.

The reviewer moved the same spoken instruction to the archived scene-wide prompt and a shot's image cue. The shot-description check passed both. The public attachment test accepted the affected opening interval from the sealed scene. The fix must inspect all model-facing positive directions that govern the interval and leave adjacent shot-local speech in its own interval.

ASTRA_LOOP_RESULT: score=90 verdict=FAIL p0=1 iter=11
