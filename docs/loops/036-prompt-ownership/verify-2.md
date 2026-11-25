# Round 2

Fresh `loop-verifier`, 2026-11-25, on the tree after the round 1 edits. It ran the full suite
once, rebuilt `server/dist` once, reran both plan id probes on the committed build and the
working build, and checked the record's statements about the gateway against three of the
files saved from its `main` at `9d4cfe0` (`video_local.py`, `schemas/scene.py`, `ltx.py`).

Result: 98/100, no critical finding. No file under review changed after this round.

## Scores

| Criterion | Awarded | Gap the reviewer named |
| --- | ---: | --- |
| No gateway-written prompt outside `per_shot` | 29/30 | The stale-plan guard compares a saved value the type no longer allows through a cast. It found no behavioural defect. |
| The author owns the one-call prompt | 20/20 | |
| `per_shot` is explicit and honest | 10/10 | |
| Engine, model and parameter schema (video) | 19/20 | It did not read the image and music plan cases, so it could not say how much of that wiring they cover. |
| Spending path and regressions | 10/10 | |
| Documents | 10/10 | |

## Findings

All four are minor and the reviewer asked for no fix.

1. `approvedContext` in `server/src/video-routing.ts` casts `plan.sceneRendering` to a string
   to recognise a retired mode. A retired value can only come from a saved file, which is the
   case the guard exists for.
2. `assertSelection` is tested directly, and the image and music plan tools by two lines each
   in their routing tests. The rubric does not score image and music.
3. The case that sent a large soundtrack through the chunked upload to the validation route
   left with `validateScenePayload`. The upload path keeps its own cases.
4. The video mismatch code is `model_selection_mismatch` when the engine differs too. The
   message names the field.

## What the reviewer ran

- `cd server && HOME=$(mktemp -d) npm test`: 1,387 tests, 1,387 pass, 0 fail.
- `npm run build`: exit 0, with `server/dist` and `skills/_shared` byte-identical before and
  after.
- Plan ids on both builds: `per_shot` `8e4e1514…`, the default plan `81b8e6b8…776c9491` with
  the same prompt and template hashes.

## Not verified by the reviewer

- Other engines' adapters were not captured for prompt equality, as the record says.
- `live-native.ts` and `handlers.ts` were checked by search only for another sender of shot
  text or an execution mode.
- The image and music mismatch cases were not run end to end by the reviewer. They pass in
  the suite.
