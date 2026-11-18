# Verify 1 — 025 cliche-use

평가자: `astra-methodology:loop-verifier` (새 컨텍스트, 읽기 전용) · 대상 커밋 f93f32ef · 도구 호출 12회, 약 2분. 아래는 평가자가 돌려준 보고서 원문이다.

## Target Verification Report — iteration 1

### Target
Add a cliché choice step to social-flow synopsis and storyboard writing. Drama, romance and comedy apply it by default; other types get a recommendation and apply it only on user choice. The review page shows it. Adversarial score of 95 or more.

### Overall Score: 93/100. Verdict: FAIL, 1 P0 defect.

### Score Breakdown
| # | Criterion | Awarded | Max | Evidence | Refutation attempted |
|---|---|---|---|---|---|
| 1 | Functional completeness | 35 | 35 | I reached K1 to K6 by execution. K1: the `cliches.js` picker runs (`pick --need meet --genre romance` returned 4 candidates, exit 0), and with no need it refuses (exit 2). K2: a drama board with no decision warns "no decision yet" on every write (`server/src/storyboard.ts:1552`). K3: `story_cliche` refuses an applied cliché on documentary without `basis:"user"`, and refuses it when the channel's saved choice is off (`:1521-1524`). K4: the review page screenshot shows the cliché panel in Korean with decision counts, per-use basis, shift and scene tags. K5: caution, analysis, quote and repeat notes are emitted (`:1555-1561`). K6: the `story_cliche` allowed-tools pair, the SKILL.md hooks and the tool list entry are all present. | Looked for placeholders, a refused romance/comedy path and dead tool wiring. Found none. K3 is still bypassable through `storyboard_apply`, counted under criterion 7. |
| 2 | Objective gate | 25 | 25 | I re-ran `bash docs/loops/025-cliche-use/gate.sh`. It printed `GATE OK` and exited 0. `git status --short` afterwards lists only `.claude/`. | None. |
| 3 | Tests per feature | 8 | 10 | `server/test/cliches.test.mjs` (132 lines) plus new cases in `storyboard.test.mjs`, `storyboard-html.test.mjs` and `project-settings.test.mjs`. | I did not trace a case for every K1 to K5 path to a line. K5 repeats and quote notes are unconfirmed, so 4 of 5 are counted. |
| 4 | Repo rules | 8 | 10 | D8 scan over the changed files: only the CLAUDE.md rule section matches, as expected. The `story_cliche` allowed-tools pair is present at `skills/storyboard/SKILL.md:11`. `tools.ts:4926` has the "Do NOT" clause. No score gate was added. | I did not measure the description against 4,096 characters, and did not confirm the "Use it" and "Returns" markers or the README tool count of 157. Gate `check:dist` passes. |
| 5 | No unrelated edits or regressions | 10 | 10 | All 42 files in `git diff --name-only origin/dev...HEAD` fall inside the allowed scope. A legacy board without STORY reads `tracked:false` and `undecided`, with no stamp and no refusal. After a cliché write, `story_scene` keeps `CLICHES`. | None. |
| 6 | Catalogue data quality | 5 | 5 | 30-row table below: 29 or 30 correct. | See the borderline rows. |
| 7 | Break attempts | 2 | 5 | 40 executed rows (table below). A P0 bypass, plus P2 findings. | See defects. |

Total: 35 + 25 + 8 + 8 + 10 + 5 + 2 = 93.

### BREAK ATTEMPTS (executed against `server/dist/storyboard.js`, `cliches.js` and the review page)
| # | Input | Observed |
|---|---|---|
| 1 | Documentary board, `uses:[{id:1}]` with no basis | Refused with `cliche_user_choice`. |
| 2 | Documentary, `offered:true` | Recorded as `decision:"offer"`. |
| 3 | Documentary, `basis:"user"` | Recorded as `use`. |
| 4 | Revise a user-picked use with `scenes:[9]` (scene absent) | `story_order` error, nothing written. |
| 5 | `id:99999` | `cliche_unknown`. |
| 6 | `id:1.5` | Schema rejects it. |
| 7 | `none` together with `uses` | Schema rejects it. |
| 8 | `uses:[]` | Schema rejects it. |
| 9 | `basis` placed inside a use | Schema rejects it (strict). |
| 10 | `need:"__proto__"` and `need:"constructor"` | `cliche_need` for both. |
| 11 | Scenes `[2,1,2]` | Stored as `[1,2]`. |
| 12 | Scene 3 missing | `story_order`. |
| 13 | `none`, then a use | `none` is cleared and the use is recorded. |
| 14 | Use, then `none` | The list is emptied and `decision:"none"`. |
| 15 | Name and shift containing `</script>`, `<img onerror>` and `${1+1}`, on the page (ko and en) | All escaped. I found no injected `onerror` in the cliché panel. |
| 16 | `remove:[777]` | Warns "nothing was removed". |
| 17 | Caution entry and analysis entry | Both warnings emitted. |
| 18 | Legacy board with no STORY, drama type | `undecided`, `tracked:false`. |
| 19 | Nonexistent board path | Plain error, nothing created. |
| 20 | Empty call (read only) on documentary | Reads the existing record, writes nothing. |
| 21 | `storyboard_apply` with `globals.CLICHES` holding an applied use with no basis, on documentary | Written. `written:true`, no finding, reading says `decision:"use"` (details in P0 below). |
| 22 | Hand-broken `CLICHES` values: null, `[]`, `"x"`, `5`, `{uses:"a"}`, `{none:{}}` | Each reads as `undecided`, no crash. One array with junk entries reads as `use` from its valid entries. |
| 23 | Board type switched from drama to documentary, then revise a default-basis use | Refused with `cliche_user_choice`. |
| 24 | Saved `clicheUse:"off"` plus a drama apply | Refused. |
| 25 | Saved `clicheUse:"on"` plus documentary apply | Recorded with `basis:"user"` (from the saved choice). |
| 26 | `clicheUse:"maybe"` | Treated as unset, refused. |
| 27 | `offered:true` plus `basis:"user"` | Stays `offer`. |
| 28 | 468 uses in one call | All recorded, 47 findings, no crash. |
| 29 | Hand-broken uses rendered on the page (non-object name, `scenes:"zz"`, `scenes:[99]`) | Page renders, no crash. `S#99` is shown with no dangling mark. |
| 30 | Offered id, then apply with no basis, on documentary | Refused. |
| 31 | Applied with basis, downgrade to offered, then apply with no basis | Refused. |
| 32 | `uses:[{name:"   "}]` on drama | `written:true`, nothing recorded, no warning (P2). |
| 33 | Name `"#5"` and id 5 in one call | Two separate entries (P2). |
| 34 | `cliches.js pick --need x` | Exit 2 with the vocabulary printed. |
| 35 | `pick --need meet --limit 99999999 --exclude abc,,1` | Works, limit capped. |
| 36 | `show 0 -1 abc` | Usage, exit 2. |
| 37 | `board /nonexistent` | ENOENT message, exit 2. |
| 38 | `pick --need` with no value | "--need needs a value". |
| 39 | `pick --need meet,meet --layer line --genre horror --include-caution --json` | Valid JSON. |
| 40 | `mode` with custom detail variants | No crash. |

### P0 Defects
1. **An applied cliché can be recorded on a recommending type without the user's pick, through `storyboard_apply`.**
   - On a documentary board, `applyStoryboard({globals:{CLICHES:{version:1,uses:[{id:5,name:'x'}]}}},{outline:true})` returned `written:true` (row 21).
   - The reading then reports `decision:"use"` with no `basis`, and no finding is emitted.
   - The guard exists only in `writeStoryCliches` (`server/src/storyboard.ts:1521`). The digest reader at `:1147` and `reading()` at `cliches.js:167` accept such an entry silently.
   - Rubric criterion 7 names this case as P0. The loop's decision 3 says an applied record without user basis is not accepted.

### P1/P2 Findings
1. P2: a whitespace-only `name` is accepted and silently recorded as nothing (row 32).
2. P2: a name `"#5"` and id 5 coexist as two uses (row 33).
3. P2: the review page shows a nonexistent scene (`S#99`) without a warning mark, although the tool warns (row 29).
4. P2: a hand-written use with no basis is displayed as "기본 적용" (default applied). The page invents a basis for it.

### Criterion 6 sample (30 entries, fixed seed)
| Id | Name | Layer, needs | Verdict and reason |
|---|---|---|---|
| 423 | Time-travel item | device, rule | Correct. |
| 34 | Piggyback carry | scene, closeness | Correct. |
| 315 | Overseas-brand PPL | format, setting, analysis | Correct. Production practice, flagged analysis. |
| 418 | Powerful parents cover up school violence | device, obstacle, status, secret | Correct. Obstacle as the main job is defensible. |
| 212 | Korean everyday space as social satire | place, setting, bind, status | Correct. |
| 323 | Late-night convenience store | place, setting | Correct. |
| 152 | Full-service hospital with term captions | place, setting | Correct. |
| 260 | "Do you like me?" | line, closeness, quote | Correct. |
| 83 | Spitting a drink at a secret | scene, outburst | Correct. |
| 215 | Worlds that know and don't know zombies | device, rule, danger | Correct. |
| 38 | Dressing a wound | scene, closeness | Correct. |
| 296 | Music forcing emotion | directing, outburst | Correct. Borderline need, defensible. |
| 374 | Hospital corridor and morgue wailing | scene, outburst, parting, setting | Correct. |
| 452 | Split screen | directing, setting, closeness | Correct. |
| 158 | Hero surgeon | character, status | Correct. |
| 342 | Liquor and chrysanthemums at a grave | place, setting | Correct. |
| 85 | Coincidence overuse | device, reveal | Correct. |
| 414 | Revenger's emptiness in the final episode | device, closing, payback | Correct. |
| 206 | Powerful figure wakes in another body | device, rule, status | Correct. |
| 401 | Cardiac arrest and miracle recovery in surgery | scene, danger, reunion | Correct. |
| 257 | "Baby, let's go" | line, closeness, quote | Correct. |
| 39 | Watching a sleeping face | scene, closeness | Correct. |
| 195 | Lead becomes teacher in the sequel | format, reunion | Correct. |
| 15 | Cross-dressing identity known first by a friend | device, secret | Correct. |
| 179 | Supernatural revenge | device, payback, rule | Correct. |
| 255 | "Love? Don't make me laugh…" | line, outburst, status, quote | Correct. |
| 335 | Birthday seaweed soup | place, closeness, setting | Correct. |
| 371 | Sad-ending rom-com | format, closing, parting | Correct. |
| 298 | Male lead sings the OST | directing, closeness | Correct. |
| 328 | Jjimjilbang sheep-head towel | place, setting | Correct. |

29 or 30 of 30 are defensible against the tagging spec, so criterion 6 scores 5.

### Fix Directives (ordered by impact)
1. Close the `storyboard_apply` bypass. In `applyStoryboard`, where `win.CLICHES` is written or read, refuse (or at least report as a `bad` finding) any non-offered use that has no `basis` when `mode(PRODUCTION).mode` is not `apply`. Alternatively make `cliches.js reading()` and `digest` flag such a use, and make `story_cliche` repair it. This lifts the P0 and restores criterion 7.
2. In `writeStoryCliches`, reject or warn on a whitespace-only `name`: apply `.trim()` in the schema. Treat a name of the form `#<n>` as id `<n>`.
3. In the review template, mark a scene tag that is not in `STRUCTURE` (`S#99`) as missing. Do not show "기본 적용" for a use with no basis.
4. Re-check the unverified items: `story_cliche` description length against 4,096 characters, the "Use it" and "Returns" markers, the README count of 157 tools, and one test case each for K5 repeats and quote.

### Recommendations
1. Item 1 of the Fix Directives is the only blocker. A single guard in the shared apply path fixes every caller, and a regression case belongs in `server/test/storyboard.test.mjs`.

ASTRA_LOOP_RESULT: score=93 verdict=FAIL p0=1 iter=1
