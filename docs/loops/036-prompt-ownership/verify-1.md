# Round 1

Fresh `loop-verifier`, 2026-11-25. It read the uncommitted change against `1cc75288`, ran the
full suite once, reran the plan id probe on both builds and rebuilt `server/dist` once.

Result: 96/100, no critical finding. The edits below were made after this round, so its score
does not stand as the final one. Round 2 reviews the tree after them.

## Scores

| Criterion | Awarded | Gap the reviewer named |
| --- | ---: | --- |
| No gateway-written prompt outside `per_shot` | 28/30 | No case planned a retired plan's request again. Only the edited prompt's request body was compared with its preview. |
| The author owns the one-call prompt | 20/20 | |
| `per_shot` is explicit and honest | 10/10 | |
| Engine, model and parameter schema (video) | 20/20 | |
| Spending path and regressions | 9/10 | Its full run showed 1,386 of 1,387: one Chrome case in `cover.test.mjs` failed and passed 11/11 alone. |
| Documents | 10/10 | |

## Findings and what was done

1. Minor. The retired-plan case covered approval, execution and `video_status`, not planning
   the request again. Added: the same request planned with no mode returns a one-render plan
   with a `promptTemplate` under a new id, and the retired id is still refused.
2. Minor. The captured body was compared only with the edited plan. Added: the unedited
   plan is executed too, and both bodies equal their plans' prompts, opening positions
   included.
3. Minor. No Desktop case for the operations that take no rewrite policy. Added: `extend`
   sends none, and `keyframes` sends `enhanced`.
4. Minor. The record's suite line matched only a run without the Chrome failure. The round
   table now gives the reviewer's own run.

## Not verified by the reviewer

- No render compared a plugin-written prompt with a gateway-written one.
- It did not read the gateway source again. The record's reading stands on the author's.
- No live Desktop receipt or interrupted submission was run. The fingerprint was read in code.

## Also changed after this round, from the author's own review

- "As written" is said of the GenAI gateway only, in the tool text, CLAUDE.md and the
  routing guide. Other engines' adapters keep their own wire dialect, such as FastH3's
  dialogue tags, and the GenAI adapter writes `openingPositions` ahead of a directly
  submitted prompt.
- `parameters.common` is described as the names that mean the same across a media type's
  adapters. Not every adapter takes each of them.
- The `ltx-desktop-local` exception of `video_catalog` is stated in CLAUDE.md and the server
  instructions.
- The refusal report's `unverified` case, dropped with the removed validation, is back.
