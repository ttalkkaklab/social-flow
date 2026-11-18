# Verify 3 — 025 cliche-use

평가자: `astra-methodology:loop-verifier` (새 컨텍스트, 읽기 전용) · 대상 커밋 860d3710 · 도구 호출 44회, 약 4분. 통과 뒤 수정이 새 결함을 만들지 않았는지 확인한 회차다. 아래는 평가자가 돌려준 보고서 원문이다.

## Target Verification Report — iteration 3

### Overall Score: 97/100. Verdict: PASS, 0 P0.

### Score Breakdown
| # | Criterion | Awarded | Evidence |
|---|---|---|---|
| 1 | Functional completeness | 35/35 | I reached all six by execution. K1: `cliches.js pick --need meet --genre romance --limit 2` printed "2 of 4 matching"; `pick --need` with no value, `--limit -1` and `--need meet,zzz` each errored with the vocabulary. K2: a drama episode with `setupProject` started as `{version:1, uses:[]}` and reported `undecided`. K3: documentary and drama-saved-`off` boards refused an applied cliché with `cliche_user_choice`, and drama-saved-`on` recorded `basis:"user"`. K4: ko and en screenshots show the strip, with the `none`, offered and used records. K5: coercive, quote and production-practice entries gave `cliche_caution`, `cliche_quote` and `cliche_practice`. K6: the 468 / 371 / 97 counts, the 157 tool count and the scenes-schema example ids (#45, #228, #9) match the code. |
| 2 | Objective gate | 25/25 | `bash docs/loops/025-cliche-use/gate.sh` printed `GATE OK` and `EXIT 0`. Afterwards `git status --short` lists only `?? .claude/`. |
| 3 | Tests | 10/10 | K1: cliches.test.mjs:14, 49. K2: cliches.test.mjs:32, 81 and storyboard.test.mjs:552. K3: storyboard.test.mjs:585. K4: the storyboard-html.test.mjs strip case. K5: cliches.test.mjs:49 and :113, plus storyboard.test.mjs:617–628. Each module has one file (project-settings, storyboard, storyboard-html, cliches). |
| 4 | Repo rules | 10/10 | The D8 scan over changed files matches only CLAUDE.md's own rule section, by design. `story_cliche` description is 1,822 chars and `storyboard_apply` 3,658, both under 4,096, and both carry Use it, Do NOT and Returns. `TOOLS.length` is 157, matching README lines 747, 750 and 823. The allowed-tools pair for `story_cliche` is in SKILL.md:11. The gate's check:dist passed. I found no score gate or approval pause. |
| 5 | No unrelated edits or regression | 10/10 | Every file in `git diff --name-only origin/dev...HEAD` is inside the loop's scope list. The tests behind the gate pass, and unrelated writes printed no cliché findings: on a draft board with no type, a scene write returned `[]` findings and no cliché board line. |
| 6 | Catalogue quality (seed `025-3`) | 5/5 | 30 of 30 correct (table below). |
| 7 | Break attempts | 2/5 | Three P2 findings, one point each (below). There is no P0 or P1. |

### RE-CHECK of verify-2
| Finding | Result | What I ran |
|---|---|---|
| P2-1 forged `PRODUCTION.clicheUse` | Fixed for `clicheUse`. | On a drama episode the forge `on` was dropped with `cliche_choice_kept` and the value stayed unset. Changing to `off`, `{clicheUse: undefined}` and `{}` on a saved-`off` board all kept `off`. A same-value patch, and mode, cost-quote and style patches, gave no finding. `PRODUCTION:null`, a string or an array wipes the whole object, but `story_cliche` then falls back to recommend, so it fails safe. A draft board dropped the forge with the same warning. A brand-new episode board through the handler is refused (`no scenes.js … new board written with set`). A `CLICHES` forge gives `cliche_record`. The sibling `videoType` forge is open (P2-A). |
| P2-2 `--episodes` | Fixed. | `/nonexistent` and a regular file both gave `cliches: --episodes: no directory at …`. An empty directory and `""` behave normally. |
| P2-3 comedy guidance | Fixed. | `cliches.js needs` prints the comedy line. `pick --genre comedy` still errors, but the error lists the real genres and cliche-use.md §2 explains the relief route. |
| #89 and #129 | Fixed. | `show 89` has the in-story description with `parting`. `show 129` has `obstacle, parting`. |

### BREAK ATTEMPTS (new executed rows)
| # | Input | Observed |
|---|---|---|
| 1 | Documentary project saved `off`, `PRODUCTION: {}` patch | `{clicheUse:"off"}` was kept, `cliche_choice_kept` came out, and the applied cliché was refused. |
| 2 | Drama project saved `on`, `PRODUCTION: {}` patch | `on` was kept and an apply recorded `basis:"user"`. This is by design for a saved `on`. |
| 3 | `PRODUCTION: null`, `"x"`, `[]` on drama-`on`, drama-`off` and documentary | No finding, and the write wiped PRODUCTION (pre-existing). `story_cliche` then recommends, so the apply was refused each time. |
| 4 | Documentary board, `PRODUCTION: {videoType:{id:"drama"}}` through `applyStoryboard` | No finding. The next `story_cliche` ran in `apply` mode with `basis:"default"`. (P2-A) |
| 5 | Same patch through the handler `ROUTES.storyboard_apply` | The write was refused only because the board had no shots (`the board has no shots`, pre-existing). |
| 6 | New episode board by `storyboard_apply` without `set` | Refused: `no scenes.js … a new board is written with set`. |
| 7 | Drama saved-`on` episode, same-value `PRODUCTION` patch, then a cost-quote/style patch | `[]` findings both times. |
| 8 | `globals: {CLICHES: …}` on an episode | `cliche_record` refusal. |
| 9 | Names: `傘を返す`, `Chiếc ô trả lại`, `＃５번 약속`, `# 5번`, `🌂 우산`, `"우산" — …; (그것)` | All accepted. |
| 10 | Names: `#5`, `＃５`, `#５`, `# 5 `, `a\tb`, `a\nb`, RLO `a‮b`, `⁦x` | All rejected by the schema. |
| 11 | Name `#٥` (Arabic-Indic), `№5`, `\u0085x`, 5,000 characters | All accepted. There is no length cap or C1 control rule. (P2-B) |
| 12 | The same name twice in one call | Merged silently to one use. |
| 13 | `uses:[{id:99999}]`, `need:'zzz'`, `scenes:[7]`, `character:'ghost'` | Refused with `cliche_unknown`, `cliche_need`, `story_order` and `cliche_character`. |
| 14 | Schema: `none+uses`, `none+remove`, `none:"   "`, `uses:[]`, `scenes [0]/[1.5]/["1"]`, unknown keys | All `success:false`. |
| 15 | `basis:"user"` and `offered` sent as input keys | `unrecognized_keys`: callers cannot set `basis`; the tool derives it. |
| 16 | `shift` of 10,000 characters | Stored whole. There is no cap. |
| 17 | Review page, name and shift `<img onerror=…>` | Rendered as escaped text and no title change. I looked at the ko and en screenshots. |
| 18 | Review page, `scenes:[1,1,99,-1,"x",null]`, `basis:"zzz"`, `offered:"yes"`, a `null` use and a `5` use | The page rendered. It printed `S#1, S#1, S#99 보드에 없음, … S#null 보드에 없음`. This is cosmetic, on hand-edited records only. (P2-C) |
| 19 | `uses:"oops"` and `none:{reason:…}`, as hand edits | Both read as `undecided` with no crash. |
| 20 | 300 uses on a board | The board line truncates to "+292 more" and the page renders 306 chips without error. |
| 21 | `remove:["＃<id>","#<id>"]` | `cliche_not_recorded` for both. Remove takes a catalogue id or a name, so this matches the schema. |
| 22 | Coercive, quoted and production-practice entries on a drama episode | Recorded with `cliche_caution`, `cliche_quote` and `cliche_practice` and no refusal. |
| 23 | `pick --need meet --genre comedy`, `show abc`, `show 99999`, `mode ""` | Each printed a clean error or a "no such entry" line. |

### SAMPLE (seed `025-3`)
Judged against each entry's own `desc` and the tagging spec. #333, #181, #360, #7 and #163 were also checked against their report rows. #420 and #458 are ids above 371 and have no row.

| id | verdict | reason |
|---|---|---|
| 271 | ok | line, secret: postponing the important words. |
| 19 | ok | device, bind and reveal: the childhood tie revealed late. |
| 274 | ok | line, obstacle: family opposition. |
| 163 | ok | device, obstacle and payback: heir rivalry that ends in comeuppance. |
| 48 | ok | character, obstacle, `coercion` mark: pursuit that refuses a no. |
| 397 | ok | scene, payback and reveal: courtroom reversal. |
| 343 | ok | scene, closeness and danger: carrying someone instead of calling 119. |
| 117 | ok | scene, reveal: consulting a jailed killer. |
| 57 | ok | device, secret: twins swap lives. |
| 208 | ok | device, rule first: regression rules. |
| 458 | ok | format, closing: a post-credits scene. |
| 159 | ok | device, payback and secret: infiltrating a hospital to topple a villain. |
| 434 | ok | character, relief: the naive youngest. |
| 126 | ok | device, obstacle first: the witness is killed and the investigation resets. |
| 215 | ok | device, rule and danger: whether the world knows about zombies. |
| 376 | ok | scene, outburst: kneeling in the rain. |
| 420 | ok | character, danger: a juvenile offender at the centre. |
| 64 | ok | device, secret and bind: a drugged drink and a hidden pregnancy. |
| 184 | ok | device, parting and closing: the avenger dies. |
| 221 | ok | scene, danger first: alarm and a closing door. |
| 7 | ok | device, obstacle: a rival triangle. |
| 360 | ok | character, closeness: restraint, with no coercion mark. |
| 306 | ok | format, closing, `analysis` mark: production practice. |
| 333 | ok | place, setting: a telescope prop. |
| 382 | ok | device, payback and parting: the survivor's revenge. |
| 66 | ok | device, secret: a faked pregnancy. |
| 180 | ok | device, payback and status: reputation as a weapon. |
| 283 | ok | line, status: the sageuk line. |
| 181 | ok | format, relief and closing: humour before the punishment, romance at the end. |
| 258 | ok | line, status, `quote` mark: a named actor's line. |

30 of 30 correct, so 5 points.

### P0 Defects
None.

### P1/P2 Findings
- **P2-A (incomplete closure of verify-2 P2-1).** A `storyboard_apply` patch can still change `PRODUCTION.videoType`. I ran it through `applyStoryboard` with `outline:true`: documentary to drama. No finding came out, and `story_cliche` then applied in `apply` mode with `basis:"default"` and no user pick. Through the real handler the write was refused only because that board had no shots, which is incidental. The guard protects `clicheUse` but not the other field that decides the mode.
- **P2-B.** Cliché names and `shift` have no length cap. The name rule also misses C1 controls such as `\u0085`, and the number-only check does not catch Arabic-Indic digits like `#٥`.
- **P2-C.** The review page prints duplicate or `null` scene numbers (`S#1, S#1`, `S#null`). This happens only on hand-edited records.

### Fix Directives (ordered)
1. In `applyPatch` (`server/src/storyboard.ts` near line 768), apply the same keep-and-warn rule to `PRODUCTION.videoType`, for example `cliche_choice_kept` or a new `production_type_kept`. Add a test that a documentary episode patched to drama still recommends.
2. Add a length limit on cliché `name`, `shift` and `none`, and extend the control-character rule to `\u0080-\u009f` and zero-width characters. This is `storyClicheSchema`, near `storyboard.ts:1498`.
3. In the strip code of `storyboard-html-template.html`, de-duplicate scene numbers and drop non-integers.

### Recommendations (non-blocking)
- `pick --genre comedy` is a documented error. Accepting `comedy` as an alias for `any` would remove the dead end.
- Earlier cautions are re-reported on every `story_cliche` call because the record persists. Say so in the report line, or print them only once.

ASTRA_LOOP_RESULT: score=97 verdict=PASS p0=0 iter=3
