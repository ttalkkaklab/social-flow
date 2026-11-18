# Verify 2 — 025 cliche-use

평가자: `astra-methodology:loop-verifier` (새 컨텍스트, 읽기 전용) · 대상 커밋 7d9d3e95 · 도구 호출 39회, 약 5분. 아래는 평가자가 돌려준 보고서 원문이다.

## Target Verification Report — iteration 2

**Target:** a cliché selection step in social-flow synopsis and storyboard writing: default for drama, romance and comedy, recommend then user-picked for other types, shown on the review page. Adversarial score of 95 or more.

### Overall Score: 98/100. Verdict: PASS, 0 P0 defects.

### Score Breakdown
| # | Criterion | Awarded | Max | Evidence | Refutation attempted |
|---|---|---|---|---|---|
| 1 | Functional completeness | 35 | 35 | I reached all six by execution. K1: `cliches.js pick --need meet --genre romance --limit 3` returned 3 of 4 with exit 0, and `pick` with no need refused with the need vocabulary (exit 2). K2: a drama episode on the fixture project printed the undecided line on `story_sequence` and `story_scene`, stopped after `story_cliche`, and `story_shot` then printed "1 in the story". K3: a documentary project refused an applied cliché with `cliche_user_choice`, and a drama project saved as `off` refused it too. A documentary project saved as `on` recorded `basis:"user"`. K4: ko and en pages rendered the strip for none, undecided, used and hostile records. K5: `cliche_caution`, `cliche_quote` and `cliche_repeat` come out as codes. K6: the documents agree with the code (see item 4 below). | I looked for a placeholder, an unreachable romance or comedy path, and documents that disagree with the code. None found. `pick --genre comedy` errors because the genre list has no `comedy` (see P2). |
| 2 | Objective gate | 25 | 25 | I re-ran `bash docs/loops/025-cliche-use/gate.sh`. It printed `GATE OK`, `skill-lint: 17 rules hold across 30 skills`, and exited 0. `git status --short` afterwards lists only `?? .claude/`. | None. |
| 3 | Tests per feature | 10 | 10 | K1: `cliches.test.mjs:14` and `:49`. K2: `storyboard.test.mjs:552` (asserts the `cliche_undecided` code at `:559`) and `cliches.test.mjs:32`. K3: `storyboard.test.mjs:585` (refusal at `:591`, off and on at `:604-607`). K4: `storyboard-html.test.mjs:96`. K5: `storyboard.test.mjs:624` (asserts `cliche_caution`, `cliche_quote`, `cliche_repeat` at `:634`) and `cliches.test.mjs:49`. All run new code paths. One file per module. | The `cliche_practice` code is never asserted by code, but the picker exclusion is tested at `cliches.test.mjs:55`. The K5 score is not affected. |
| 4 | Repo rules | 10 | 10 | The D8 scan over `git diff --name-only origin/dev...HEAD` matches only the CLAUDE.md rule section. The `story_cliche` description is 1822 characters with "Use it", "Do NOT" and "Returns". `TOOLS.length` is 157, matching README lines 747, 750 and 823. The allowed-tools pair is at `skills/storyboard/SKILL.md:11`. `check:dist` passes in the gate. No score gate was added; findings are warnings only. | I looked for prose-only tests, a missing marker and a tool-count drift. None found. |
| 5 | No unrelated edits or regressions | 10 | 10 | 44 files, all inside the allowed scope. Regression runs on an episode board with a record all kept the record: `story_scene`, `story_shot`, `shot_characters`, `story_music`, a whole-block write-back through `ROUTES.storyboard_apply`, and `removeScenes` (which printed the dangling note). A first `story_sequence` on a drama episode stamped `{version:1,uses:[]}`. | I hunted for the new guard breaking a legitimate write. It did not. |
| 6 | Catalogue quality (seed 025-2) | 5 | 5 | 28 of 30 correct (table below). | The two weak rows are #89 and #129. |
| 7 | Break attempts | 3 | 5 | More than 40 new executed rows. Two P2 defects, no P0 and no P1. | See defects. |

Total: 35 + 25 + 10 + 10 + 10 + 5 + 3 = 98.

### RE-CHECK of the iteration-1 deductions
| Iteration-1 item | Result | What I ran |
|---|---|---|
| P0, row 21: `globals.CLICHES` on documentary | Fixed | `applyStoryboard({globals:{CLICHES:{version:1,uses:[{id:5,name:'x'}]}}})` threw `cliche_record` and nothing was stored. |
| Variation: forged `basis:"user"` | Fixed | Threw `cliche_record`. |
| Variation: offered-only block | Fixed | Threw `cliche_record`. |
| Variation: `CLICHES:null` | Fixed | Threw `cliche_record`, also on a drama board that has a record (record unchanged). |
| Variation: dry run | Fixed | Threw `cliche_record`. |
| Variation: MCP handler `ROUTES.storyboard_apply` | Fixed | Threw `cliche_record`. |
| Variation: `set:{CLICHES}` | Not a path | `set` takes only `structure` and `shots`; nothing was stored. |
| Variation: copy with keys reordered | Passes, as designed | Written, record unchanged. |
| Variation: copy with `basis` dropped, or an extra key | Fixed | Refused. |
| Related: `PRODUCTION.clicheUse:"on"` written through `storyboard_apply`, then `story_cliche` | Allowed | On a documentary episode this recorded a use with `basis:"user"` (see P2-1). |
| P2, row 32: whitespace-only name | Fixed | `uses:[{name:'   '}]` and `'\t'` through the handler: `Invalid arguments`. |
| P2, row 33: name `"#5"` and id 5 | Fixed | `#5`, `# 5`, `"#5 "`, `#05` and `{id:5,name:'#6'}` are all refused with "a catalogue number goes in id". |
| P2, row 29: `S#99` with no mark | Fixed | The ko and en pages show "S#99 보드에 없음" and "S#99 not on the board". |
| P2: page invents "기본 적용" | Fixed | A use with no basis shows "근거 미기록" / "basis not recorded". A use with `basis:'default'` shows "기본 적용" / "by default". |
| New codes appear once with the right `where` | Confirmed | `cliche_unpicked` is the only finding after switching drama to explainer. `cliche_not_recorded` appears once per missing target (two for `['A1','A1']`... 777 and the duplicate). `cliche_scene_missing` appears once for the removed scene. |

### BREAK ATTEMPTS (all executed, none run in iteration 1)
| # | Input | Observed |
|---|---|---|
| 1 | Two uses with the same id in one call (`{id:5}`, `{id:5,shift:'a'}`) | One entry, shift `a`. |
| 2 | `scenes:[MAX_SAFE_INTEGER]` and `[1e21]` | `story_order`, nothing written. |
| 3 | `need:'toString'` | `cliche_need`. |
| 4 | `shift` of 200,000 characters | Written (file 600,703 bytes). `readStoryboard` still reads decision `use`. |
| 5 | `shift` with U+2028, a backtick, `${1+1}` and a backslash | Round-trips unchanged. |
| 6 | Name with NUL, an emoji and an RTL override | Written as-is (trivial, see recommendations). |
| 7 | Two writes in sequence (`A1`, `B1`) | Both kept. |
| 8 | `character:'ghost'` on a board with no cast | Accepted, as documented for non-episode drafts. |
| 9 | `basis:'user'` on a drama board | Recorded as `user`. |
| 10 | `remove:[6,'A1','A1',777]` | Removed, with a `cliche_not_recorded` for each missing target. |
| 11 | scenes.js with a syntax error | A clear error, and the file is byte-identical afterwards. |
| 12 | Directory with no scenes.js | "no scenes.js at …", nothing created. |
| 13 | Read-only scenes.js (mode 444) | Written through an atomic replace, no crash. |
| 14 | Drama to documentary, then `remove:[5]` of the unpicked default use | Allowed, list emptied. |
| 15 | Documentary: `none`, then an offered use | `none` cleared, decision `offer`. |
| 16 | `storyboard_apply` with the same uses plus an extra key | Refused (`cliche_record`). |
| 17 | `offered:"yes"` through the handler | Schema refuses. |
| 18 | `uses:[{id:5,basis:'user'}]` (basis inside a use) | Schema refuses (strict). |
| 19 | Handler, relative path | Resolved and written. |
| 20 | Handler, `path` pointing at scenes.js | Written. |
| 21 | Handler, empty call | Dry run, nothing written. |
| 22 | Handler, `none` together with `uses` | Schema refuses. |
| 23 | Handler, unknown argument | Schema refuses. |
| 24 | Direct `writeStoryCliches(null)`, with no `path`, and with `uses:[]` | Schema errors. |
| 25 | Hostile hand-edited record rendered on the page (an `<img onerror>` name, `</script><b>` in the shift, scenes `[99,1]`, a use with no basis, an object name) | Escaped in ko and en. No script injected, no crash. The object-name use is skipped. |
| 26 | Page: no record, an empty record, `none`, and an old board | No strip; "미정 / undecided"; "쓰지 않음 / none used"; no strip. No error. |
| 27 | Project saved as documentary with `clicheUse:"on"`, "off", unset, and a comedy default; `clicheUse:"maybe"` | `user` basis; refused; refused; `default` basis; project setup rejects `maybe`. |
| 28 | `mode custom "로맨틱 코미디"`, `"로맨스 다큐"`, `"연애 팩트체크 다큐"` | apply; offer; offer. |
| 29 | `pick --limit 0` and `--limit -4`; `show 469`; `show 5 5`; `needs --x`; `board /nonexistent` | Exit 2 with usage, or a clear message. `show 469` prints "no such entry" (exit 0). |
| 30 | `pick --need meet --episodes /nonexistent` | Succeeded silently (see P2-2). |
| 31 | `pick --genre comedy` and `--genre western` | Exit 2 with the vocabulary printed. |
| 32 | `storyboard_apply` with PRODUCTION `clicheUse:'on'` on a documentary episode, then `story_cliche` | Recorded with `basis:"user"` (P2-1). |
| 33 | PRODUCTION `videoType:{id:'drama'}` written on a documentary board, then `story_cliche` | Recorded with `basis:"default"`. |

### SAMPLE (30 entries with the smallest sha1 of `025-2:<id>`)
| Id | Verdict | Reason |
|---|---|---|
| 360 | Correct | Character, closeness: restraint as the appeal. |
| 86 | Correct | Format, analysis marked: adding secrets when ratings drop is a production practice. |
| 51 | Correct | Device, secret: swapped babies. |
| 414 | Correct | Device, closing and payback. |
| 298 | Correct | Directing, closeness. Borderline need, defensible. |
| 322 | Correct | Place, closeness and setting. No named drama, so no quote mark. |
| 344 | Correct | Scene, danger. Not graphic, so no caution. |
| 369 | Correct | Device, bind and payback. |
| 463 | Correct | Format, closing. |
| 46 | Correct | Device, parting. |
| 386 | Correct | Device, obstacle and status. |
| 254 | Correct | Character, closeness and bind. |
| 5 | Correct | Device, obstacle. |
| 244 | Correct | Character, obstacle, outburst, status. Hitting a subordinate is not graphic, so null caution holds. |
| 333 | Correct | Place, setting. |
| 147 | Correct | Character, status and setting. |
| 205 | Correct | Directing, rule. |
| 308 | Correct | Format, closing and reunion. |
| 177 | Correct | Device, payback and parting. |
| 89 | Weak | "출연진 하차 11명" is a production fact, and `analysis` is not marked. The device itself (characters dying one after another) is storable. |
| 98 | Correct | Device, secret, parting and reunion, as the spec says. |
| 129 | Weak | First need is `parting`; the main job is `obstacle`, or `bind` (work blocks family life). |
| 279 | Correct | Line, status. A stock catchphrase with no named source, so no quote mark. |
| 167 | Correct | Scene, status and setting. |
| 267 | Correct | Line, quote true (모래시계, 최민수). |
| 275 | Correct | Line, secret: the heroine's explanation is cut off. |
| 334 | Correct | Place, setting. |
| 458 | Correct | Format, closing. A cookie scene is writable, so no analysis mark. |
| 373 | Correct | Place, setting and reveal. |
| 424 | Correct | Device, rule and reunion. |

### P0 Defects
None.

### P1/P2 Findings
1. **P2-1: `PRODUCTION.clicheUse` can be forged through `storyboard_apply`.** On a documentary episode, `globals.PRODUCTION` with `clicheUse:'on'` is accepted. The next `story_cliche` then records an applied use with `basis:"user"` and no finding. This stays an honor-system boundary of the same kind as passing `basis:"user"` directly, which the tool description already forbids. It adds no new reach, so I rate it P2. A stricter reader could argue it is the iteration-1 P0 by another route.
2. **P2-2: `cliches.js pick --episodes <nonexistent dir>` is silent.** Repeat detection is quietly off. Running `board` on a missing path errors, but this does not.
3. **P2-3: comedy has no genre tag.** `pick --genre comedy` is refused with the vocabulary printed. The `relief` need covers the case, but nothing tells the user this.

### Fix Directives (optional; none blocks PASS)
1. In `skills/storyboard/references/cliches.js`, make `--episodes` fail (exit 2) when the directory does not exist.
2. Say in `cliche-use.md` that comedy picks go through the `relief` need and the `any` genre, or add a comedy genre.
3. Refuse a `PRODUCTION.clicheUse` change through `storyboard_apply` when it differs from the episode's saved handoff, or report it with a finding.

### Recommendations (non-blocking)
1. Retag #129 with `obstacle` first, and mark #89 as `analysis` or reword its description.
2. Strip control characters (NUL, RTL override) from a use's `name`. A fullwidth `＃５` name is also still accepted as a separate use.
3. The two weak sample rows give 28 of 30, so criterion 6 is not at risk.

ASTRA_LOOP_RESULT: score=98 verdict=PASS p0=0 iter=2
