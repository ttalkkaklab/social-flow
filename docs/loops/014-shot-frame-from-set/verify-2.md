# Verify 2 — loop 014 (iter 2)

Gate run by the verifier: `npm run build` exit 0; `npm test` (env -u gateway overrides, isolated HOME) 2700 pass / 0 fail;
`skill-lint.js` 17 rules hold; D8 scan clean on changed non-CLAUDE files. Real Blender render of 8 shots re-run (ok);
contact sheet re-read.

Iteration 1 directives, checked in the diff:
1. dutch: storyboard.ts:1305 and :1337 drop "horizon" when `dutch`; :1338 adds "Image 1 is level; tilt the whole picture to the dutch angle". Test storyboard.test.mjs:791-794 asserts it. Fixed.
2. "grey" gone from the role and lock sentences (storyboard.ts:1305, :1337 say "plain unpainted surfaces"). The real render is flat pastel clay; "placeholders" reads true. Fixed.
3. Lock sentence adds "continue the place into any flat dark area past the set's edge" (storyboard.ts:1337); docs location-assets.md:142 agree. Fixed.
4. video-image-inputs.ts:93-94 skips `role:"composition"` in the host handoff; test video-image-inputs.test.mjs:82 asserts 3 bindings. Fixed.

| # | Criterion | Awarded/Max | Evidence |
|---|-----------|-------------|----------|
| 1 | Set render as Image 1 | 20/20 | storyboard.ts:1296-1297 shotFrame, :1320 `head = composition`, ordered[0] is the render; imageUrl demoted to look |
| 2 | Size | 20/20 | location-assets.js shotCamera unchanged since iter 1 (projected probe held); contact sheet fs head-to-toe, cu face, ms/mfs cut as specified |
| 3 | Angle | 15/15 | high/low/ground/overhead/over/pov/back unchanged; dutch warns (location-assets.md:129) and the prompt now agrees |
| 4 | Subject and side | 10/10 | unchanged; ots/two-person frames in the sheet keep the pair on one side |
| 5 | Prompt | 10/10 | roles :1304-1305 (camera, framing, architecture, positions; look from the sheet picture), lock :1337, inventory/invariants/state/proxy colours via assemble `location`; no sentence contradicts the render (dutch, grey, dark void closed) |
| 6 | Aspect | 5/5 | shotFrame sizes to the picture aspect; contact sheet 3:2 frames |
| 7 | End frame | 5/5 | storyboard.ts:1320 start image then end render; lock :1336 |
| 8 | Provenance | 5/5 | recordShotImage `visual.locationFrame`; cache test passes |
| 9 | Fallbacks | 5/5 | no-manifest warning :1299; one-picture model drops look :1325-1328; Blender failure throws |
| 10 | Tests, build, docs | 5/5 | gate green, dist rebuilt, docs match code, D8 clean |

## Overall score: 100/100

## P0 defects
None.

## Notes (non-blocking)
1. location-assets.md:17 and :100 still call the board "grey"; they describe the previz workflow, not the start-image prompt.
2. Real renders show a navy void outside the open side (contact.png row 2); the lock sentence now covers it in the prompt.

ASTRA_LOOP_RESULT: score=100 verdict=PASS p0=0 iter=2
