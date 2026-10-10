# Slide duration and visible motion

`sv:true` gives an animation time to run. The duration check compares that declared time with
the narration segment. It cannot establish how much of the picture changed or whether the
movement explains the sentence. A check-slide or duration pass is not final motion approval.

The encoded diagnostic and `verify-assembled.js` use `measure-motion.js`: four samples per
second at 270×480, mean absolute luma difference below 1.5 counted as still, and more than
60% still samples reported for a slide card. The channel may lower the maximum continuous
still interval below the eight-second ceiling. No threshold or exemption changes with `sv`.

A full-width six-pixel line on a 1920px-high picture occupies only 6/1920 of the frame.
Even changing that whole area from black to white contributes about 0.80 to the global mean;
partial drawing contributes less. This area calculation explains dilution; it is not a strict
bound on resampling or codec output. The line can carry a useful relation and still produce a
numeric finding. Never mark that finding PASS because the helper has `sv:true`.

| Comparison | Pixel metric | Meaning/readability review |
| --- | --- | --- |
| Default thin line drawing | Can report still despite continuous drawing | Read the relation; inspect at final size |
| Completely static picture | Reports still | No sustained action |
| Tiny low-contrast flicker | Reports still | Noise cannot substitute for the subject |
| Moving background, static subject | Can have no pixel findings | Reject background drift as the explanation; subject states must differ |
| Large subject performing an action | Usually has no pixel findings | Confirm the actual before/after action and readable timing |

`render-motion-slide.mjs` measures each encoded slide group and writes
`summary.json.rendered_motion` with the same findings used by the assembler. It emits warnings
early; it does not grant assembly approval. `semanticReview: required` applies even with an empty
finding list. Camera slides use the same card check and `MOTION_POLICY` ceiling as assembly.
Previz and PNG-only captures report no encoded card diagnostic.
The final reel is measured again because trims, transitions and re-encoding change the pixels.

When a thin line is essential, inspect the clip and the narrated relation together. If a larger
subject action better explains it, revise that action and render again. Do not thicken a line,
add blinking, lower a global threshold or animate an unrelated background just to move a score.
Present real findings under [assembly-video-hitl.md](assembly-video-hitl.md); an approval covers
only the reported inputs and warnings. A new finding on the final output must be reported as new.

Regression comparisons live in `server/test/motion-contract.test.mjs`. They compare lossless
rendered frames with H.264 output and retain the background-only counterexample: a numeric
pass cannot establish semantic motion. Actual HTML helper captures use the optional local
fixture runner documented in that test. The tests do not replace watching the episode.
