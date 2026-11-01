# Verify 1 — loop 014 (iter 1)

Gate run by the verifier: `npm run build` ok, `npm test` (env -u gateway overrides, isolated HOME) 2700 pass / 0 fail,
skill-lint 17 rules hold, `server/dist` rebuilt (bundle, storyboard, tools in the diff), D8 scan clean on changed files.
Probes: projected 12 sizes x 2 aspects (1536x1024, 1024x1536) through `shotCamera`; angle sweep (eye high low ground overhead
over pov back dutch + unknown); contact sheet read (8 renders).

| # | Criterion | Awarded/Max | Evidence |
|---|-----------|-------------|----------|
| 1 | Set render as Image 1 | 20/20 | storyboard.ts:1296-1331 (`composition` leads `ordered`, `imageUrl` demoted to look); test storyboard.test.mjs "a sheet with a built set..." asserts inputs[0] = `locations/s0002-frame-*/start.png` |
| 2 | Size | 20/20 | location-assets.js PERSON_SPAN/SIZE_LENS; projected head/feet for all 10 sizes + two/ots: fs head .87/feet -.73, cu head .91 (face in frame), ecu detail centred (lens 100, 0.35 m), mfs/ms bottoms cut as specified; no subject leaves frame |
| 3 | Angle | 15/15 | probe: high 35 deg (z 1.97 vs 1.49), low z .79, ground z .15, overhead straight down above target, over/pov at the named person (pov camera at jun's eyes z 1.64), back flips `u` (size), dutch warns, unknown angle warns |
| 4 | Subject and side | 10/10 | shotCamera two-person square-to-line + 180 deg side, single person `facing`, unblocked warning "not blocked ... prompt places them" |
| 5 | Prompt | 4/10 | two gaps, see P1-1 and P1-2 (-3 each) |
| 6 | Aspect | 5/5 | shotFrame sizes the render 1280x854 for 1536x1024 (1.4988 vs 1.5, even pixels), 854x1280 for 9:16; storyboard.ts:1291 passes the picture size |
| 7 | End frame | 5/5 | storyboard.ts:1320 end head = start image then `set.end` render; test asserts inputs order and "Move the figures ... Image 2" |
| 8 | Provenance | 5/5 | `visual.locationFrame` (storyboard.ts recordShotImage) keeps camera, fingerprint, hashes; location.test "renders once per camera and reuses" asserts one Blender run for two asks |
| 9 | Fallbacks | 5/5 | no manifest warns (storyboard.ts:1299); `location_render_failed` thrown, no fallback (location-assets.js shotFrame, tested); look dropped with warning when the model has no room (tested with FLUX klein) |
| 10 | Tests, build, docs | 5/5 | gate green, dist in sync, docs/tool description agree on render, cache, `visual.locationFrame` |

## Overall score: 94/100 (threshold 95)

## P0 defects
None.

## P1 findings (each withheld points under criterion 5)
1. Dutch contradiction. For `angle:"dutch"` the render stays level (location-assets.js shotCamera warns "the prompt tilts the horizon"),
   assemble-bg-prompt.js:122 adds "at a dutch angle, horizon tilted", but the lock sentence (storyboard.ts:1334) orders "Keep Image 1's camera
   position, <lens>, horizon and framing". The prompt both keeps and tilts the horizon.
2. The Image 1 role sentence (storyboard.ts:1303) and the lock say its "plain grey surfaces are placeholders" / "paint its grey placeholder
   surfaces". The real render (scratchpad/real/contact.png) is pastel and coloured (wood floor, teal shelves, coloured books), not grey.
3. (not scored) ls/ms-low renders from outside the open south side show a dark navy void (contact.png row 2, left two). The sentence
   "paint its placeholder surfaces" does not cover it; the model may paint it as a wall or leave it. Consider a neutral backdrop colour or
   a prompt sentence "the dark area outside the set is empty space".
4. (not scored) `role:"composition"` refs sit in `visual.references` with `use:"image"`; the host-handoff path (video-image-inputs.ts:93)
   lists every reference as a binding, so a host video tool is told about the grey/clay render. Not submitted to MSR/adapters (use filter at :67).

## Fix directives
1. storyboard.ts ~1334: when `plan.angle === 'dutch'` drop "horizon" from the lock sentence ("Keep Image 1's camera position, lens and framing; the horizon tilt comes from the prompt").
2. storyboard.ts:1303 and :1335: describe the render as "plain unpainted surfaces" / "flat clay colours" instead of "grey", and say the render's colours are placeholders for materials.
3. Optional: add one sentence to the lock when a dark void shows (camera outside the set bounds), or keep the camera inside the set's x/y extent.
4. Optional: filter `role:"composition"` out of the host handoff in video-image-inputs.ts so it never reaches a video tool.

ASTRA_LOOP_RESULT: score=94 verdict=FAIL p0=0 iter=1
