# Verify 2 — loop-verifier report (iteration 2)

Score 100/100, P0 0, verdict PASS. Tail line: `ASTRA_LOOP_RESULT: score=100 verdict=PASS p0=0 iter=2`.
This pass ran 38 tool calls and 18 executed break attempts.

| Criterion | Awarded | Max | Verifier's evidence |
|---|---|---|---|
| 1 Five capabilities | 30 | 30 | `story_music` listed and callable on the real stdio server; an unreceipted cue warns and a receipted one does not; `musicDirection` refuses 21 notes, a 301-character note, a number, a blank and a string; `sourceStartSeconds` rendered; a -30 dB span reported as 44 LU under the speech |
| 2 Objective gate | 25 | 25 | `cd server && npm run check` exit 0, 1722 pass; `git status --short` the same before and after |
| 3 insight-04 application | 20 | 20 | own run 14 of 14; a dropped spot failed 5 checks and a -30 dB span failed 2, so the checks are not vacuous |
| 4 Tests | 10 | 10 | one case per capability in the module's own file |
| 5 Repository rules | 10 | 10 | D8 scan clean on the changed files, README count 143 equals `TOOLS.length`, new refusals are unreadable input, story order or the existing timeline contract |
| 6 No unrelated edits | 5 | 5 | changed files are in scope |

## Break attempts

| # | Attempt | Held |
|---|---|---|
| 1 | Real MCP server: list, read, unknown key, bad enum, cue with prompt and asset | yes |
| 2 | Span over scenes 1 and 2, then scene 1 alone | yes |
| 3 | One scene twice in a call; scenes [2,2]; `none` with a cue | yes |
| 4 | Refused call, board bytes before and after | yes |
| 5 | Cue names `a/b`, `$mix`, `$timeline`; four-decimal times; gain -61 | yes |
| 6 | Cue switched from prompt to asset; offset 0 | yes |
| 7 | Scene with no shots; no scenes.js | yes |
| 8 | Hand-broken STRUCTURE through `story_music` | no — raw TypeError (F3) |
| 9 | Legacy `sound.cue` board without STRUCTURE | yes |
| 10 | Compiler: corrupt state, `jobs:null`, no `.work`, asset cue, two spans on one cue, `$mix` only, limit 99, broken STRUCTURE | yes |
| 11 | Offset equal to the cue length | clear error (F1) |
| 12 | Offset 10 ms before the end | no — opaque bed-renderer failure (F1) |
| 13 | Fully silent cue file | bed renderer stops first, so the absent-music warning cannot fire for it (F2) |
| 14 | Old six-argument CLI, NaN speech, 0.3 s span, overlapping spans, limit 0 | yes |
| 15 | Full `build-reel.sh` on a story-first fixture with an undecided scene, an unreceipted cue and a -15 dB span | yes — exit 0 and all three ⚠ lines |
| 16 | Legacy one-bed build at 10 and 25 LU | yes |
| 17 | `musicDirection` validation, corrupt settings, nested board dir | yes |
| 18 | Application script on corrupted plans | yes |

## Findings (all P2 or lower) and what was done after the verdict

- F1 fixed: an offset that leaves under 0.5 s of cue now fails with one clear message; test added in `music-timeline.test.mjs`.
- F3 fixed: `story_music` reports on a hand-broken STRUCTURE and refuses a write with a readable message; test added in `storyboard.test.mjs`.
- F2 kept: a fully silent cue file was already a bed-renderer error. The absent-music warning covers a span whose played stretch is silent inside a file that is not.
- F4 kept: the receipt check reads cues the board names. The legacy one-bed flow copies the channel bed to `bgm.wav` by design, so checking it would warn on the documented path. CLAUDE.md states the limit.

The two fixes came after this verdict. They were checked by the full gate (`npm run check` exit 0, 1722 pass), skill-lint and a rerun of the application test (14 of 14), not by a third verifier pass.
