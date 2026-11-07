# Verification 1 — 98/100, P0 0 (pre-integration tree)

This run scored the tropicbird working tree before it was rebased onto `origin/dev` d6cd3e0b (PR #537, the
storyboard-template loop from the moonfish session). That tree still returned `vertical` and `warnings` fields from
`shot_icons`/`shot_prompt` and printed them in `handlers.ts`; the integrated tree carries them as `warn` findings
instead (agreed with the moonfish session). So this PASS does not end the loop; iteration 2 scores the integrated tree.
The verifier stopped at its turn limit and wrote this report from the evidence it had already collected.

## Score breakdown

| Criterion | Awarded | Max | Evidence |
|---|---|---|---|
| 1 Functional completeness C1–C9 | 40 | 40 | 9 of 9. Probes: 7 angles × MSR and image prompts, 19 moves, headless Chrome render of a 38-shot board (ko and en), 9:16 and 16:9 handler calls, `hold` through `checkScene`. |
| 2 Objective gate | 25 | 25 | `npm run build` exit 0; `npm test` 2630/2630; `assemble-bg-prompt.js --selftest` exit 0; CI self-tests exit 0. |
| 3 Tests for changed behaviour | 8 | 10 | About 11 of 13 changed behaviours have cases. Untested: `ground`/`over` icons and Korean names, the handler text for vertical notes, the still chip card tooltip, Korean `depthTitle`, `mount()` setting `maxZoom`. |
| 4 Prompt probe P1–P10 | 10 | 10 | `storyboard.test.mjs` asserts P1–P10; P9 only for dolly in. |
| 5 Repository rules | 10 | 10 | D8 clean, test layout kept, dist identical to a rebuild, `video_prompt_language` intact, new throws are input checks. |
| 6 Scope | 5 | 5 | Every changed path is inside the scope list. |

## Findings (no P0)

1. P1 — `camera.end` was spliced into the camera sentence ("settling on A tight close-up of her eyes fills the frame., with a short pause…").
2. P1 — `{target}` meant the arrival for some moves and the subject for others; the `move.target` description only said "what the move arrives on".
3. P1 — Korean `target`/`from`/`to` were accepted by `shot_icons`, then `shot_prompt` failed with an error that blamed action, end and sound.
4. P2 — test gaps listed in criterion 3.
5. P2 — residual effect wording: still `tilt` "힘과 취약함", `ground` "낮아진 인물의 취약함".
6. P2 — the tool description and `film-techniques.md` said every card has pair and vertical; only some do.
7. P2 — the assembler selftest built its expected strings from `SIZE_WORDS`, so it could not catch a wrong value.
8. P2 — `animation-review-contract.cjs` left `hold` out of the still lane.
9. P2 — `ground` with a face-size shot contradicts itself; the card warns, `shot_icons` does not.

## Fix directives (as issued)

1. Put `camera.end` in its own clause and strip its trailing punctuation; test a sentence-form end.
2. Make `target` mean one thing and say so in the tool description.
3. Refuse non-English `target`/`from`/`to` in `shot_icons`, and name the field in the `shot_prompt` error.
4. Add the missing cases in existing test files.
5. Hedge the residual phrases.
6. Reword "each card gives …"; restore one literal expected string in the assembler selftest.
7. Commit dist with src and add the untracked loop and research paths.

ASTRA_LOOP_RESULT: score=98 verdict=PASS p0=0 iter=1
