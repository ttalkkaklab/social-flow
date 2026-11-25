# Iteration 3 summary

Score 95, P0 = 0. Report: `verify-3.md`. The exit condition (score ≥ 95 and P0 = 0) is met at this iteration.
The one deduction was a reproduced P2 defect (robustness −5), so the defect was fixed and a fourth run confirms
the tree as it now stands.

## Fix directives and what was done

1. D1, done. A scene without `videoDirection` planned with an authored `prompt` still reported the saved
   prompt's camera reading (`camera_move_missing: the saved prompt omits the planned move`) and the note
   "Legacy prompt has no promptSource", although the saved prompt is not sent. `buildVideoPlan`
   (`server/src/video-routing.ts`) now reports neither when `prompt` is given: the camera reading and the
   legacy note describe a prompt this request does not submit. One assertion was added to the existing case
   "planning compiles camera direction and refuses a caller replacing the scene prompt" in
   `server/test/video-routing.test.mjs`; `server/dist` was rebuilt.
2. Optional directive, not done. A non-string `prompt` returns the schema error every tool returns for a wrong
   type. The input schema declares `type: string`, so a host that follows it never sends one.

## Left as it is

- `label_literal` also names `Image 1` inside `@Image 1`. It is a warning on a hand-typed number either way.
- A non-Latin cast id is stopped by the English-only prompt rule (`video_prompt_language`), which predates this
  feature.
- `skills/produce/references/check-tts-quality.js` keeps "one speaker per scene" for legacy single-take
  receipts; it is not on the planning path.

## Evidence

- `cd server && HOME=$(mktemp -d) npm test`: 1364 pass, 0 fail.
- The new assertion fails on the code before the fix: the plan returned the two saved-prompt warnings.

## Files touched in iteration 4

`server/src/video-routing.ts`, `server/test/video-routing.test.mjs`, `server/dist/*`.
