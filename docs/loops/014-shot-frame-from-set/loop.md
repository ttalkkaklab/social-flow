# Loop 014 — the set reaches the start image from the shot's camera

- Date: 2026-11-01
- Target (verbatim): 지금 배경 시트에서 작성된 배경이 영상 생성의 첫 장면이미지의 참조이미지로 정확하게 전달되는지 분석해줘. 해당 장면의 카메라 앵글에 맞게 샷사이즈에 맞게 3d 구성을 전달하고 정확하게 첫장면 이미지를 생성하는지 적대적으로 평가하고 95점 이상이 될 때까지 개선해줘
- Classification: Preset A (feature implementation), adjusted
- Exit gate: score ≥ 95 AND p0 == 0 AND `TEST_CMD` exit 0
- Max iterations: 5
- TEST_CMD: `cd server && HOME=$(mktemp -d) npm test`, plus `npm run build` leaving `server/dist` in sync

## Finding before the change

`shotImageRequest` (server/src/storyboard.ts) sent only `SB_DOC.locations[].imageUrl` as Image 1.
The sheet's built set (`SB_DOC.locations[].manifest`), a shot's `shot.location` binding and its
Blender renders never reached the start image. Shot size and angle reached the prompt as words
only, and `assemble()` got no `location` option, so the set inventory, invariants and the
proxy-to-character mapping were missing too.

## Frozen rubric

| # | Criterion | Weight | Award rule | P0 |
|---|-----------|--------|-----------|----|
| 1 | Set render as Image 1: a start frame whose location sheet names a built set sends a Blender render of that set from a camera derived from the shot, as Image 1 (the edit source), not `imageUrl` or an angle-sheet view | 20 | all-or-nothing | yes |
| 2 | Size: the derived camera frames the subject the way each size reads (fs head to toe … cu face … ecu a detail), with a lens per size and the distance from the field of view; checked by projecting points through the camera | 20 | 20 × sizes correct / sizes in the vocabulary (els ls ws fs mfs ms mcu cu choker ecu), composition sizes count as one | yes, when the subject leaves the frame |
| 3 | Angle: eye, high, low, ground and overhead set camera height and pitch correctly; over and pov place the camera at the named person; back stands behind; dutch (no roll in the renderer) warns instead of pretending | 15 | 15 × handled / 8 | no |
| 4 | Subject and side: aims at the shot's cast in the bound blocking; stands in front of one person; keeps the side of the bound or first registered camera for two people (180° rule); without blocking the frame is set-centred and a warning says the places come from the prompt | 10 | 2.5 each | no |
| 5 | Prompt: says what Image 1 controls (camera, framing, architecture, positions) and what the other images control, carries set inventory, invariants, state, and proxy colour → character; no sentence contradicts the render | 10 | 10 − 3 per gap | no |
| 6 | Aspect: the render has the output picture's aspect | 5 | all-or-nothing | no |
| 7 | End frame of a first_last shot: the set's end-pose render from the same camera rides after the start image | 5 | all-or-nothing | no |
| 8 | Provenance: the render path, hash, camera and fingerprint are recorded on the shot; the same inputs reuse the cached render | 5 | all-or-nothing | no |
| 9 | Fallbacks: no manifest keeps `imageUrl` with a warning; a one-picture model still works (render replaces `imageUrl`); the place picture joins as a look reference only when the model has room; a Blender failure stops instead of falling back silently | 5 | 5 − 2 per gap | yes, for a silent fallback |
| 10 | Tests, build, docs: cases in the module test files, TEST_CMD green, dist built, docs and tool description agree, D8 scan clean | 5 | 5 − 1 per gap | yes, for a failing test |

## Result

Achieved in iteration 2.

| Iter | Score | P0 | Objective gate | Verdict |
|------|-------|----|----------------|---------|
| 1 | 94 | 0 | 2700/2700, build, skill-lint | FAIL (prompt: dutch kept the horizon, render called grey) |
| 2 | 100 | 0 | 2700/2700, build, skill-lint | PASS |

Real Blender renders of the example set (fs, ms, cu, ms high, ms low, ls, ots, mfs two-shot)
were inspected before the verdicts. They exposed an off-shot person in front of the subject and a
two-shot cropped by the walls, which led to the clear-view swing and the per-wall pull-in.
No paid image generation ran, so how well an image model keeps the render's composition is not yet measured.
