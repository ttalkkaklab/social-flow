# Verify 5 — 025 cliche-use

평가자: `astra-methodology:loop-verifier` (새 컨텍스트, 읽기 전용) · 대상 커밋 c28ece27 · 도구 호출 51회, 약 6분. 최대 반복 횟수의 마지막 회차다. 아래는 평가자가 돌려준 보고서 원문이다.

## Target Verification Report — iteration 5

### Target
Add a cliché-selection step to social-flow synopsis and storyboard authoring: drama, romance and comedy apply by default, other types recommend and apply only on the user's pick, and the review page shows it. Improve until the adversarial score reaches 95 or more.

### Overall Score: 98/100. Verdict: PASS, 0 P0.

### Score Breakdown
| # | Criterion | Awarded | Evidence |
|---|---|---|---|
| 1 | Functional completeness (K1–K6) | 35/35 | All six were reached by execution (details below). |
| 2 | Objective gate | 25/25 | I re-ran `bash docs/loops/025-cliche-use/gate.sh` at HEAD c28ece27. The log ends `skill-lint: 17 rules hold across 30 skills`, `GATE OK`, `EXIT 0`. `git status --short` afterwards lists only `?? .claude/`. |
| 3 | Tests | 10/10 | Mapping below. `server/test/cliches.test.mjs` is the only cliché module file. |
| 4 | Repo rules | 10/10 | Detail below. No violation class found. |
| 5 | No unrelated edits or regression | 10/10 | 44 changed paths, all inside the loop's scope list. Picker output for `--seed ABC`, `--seed Abc --limit 3`, `--exclude 185,456 --limit 2` and `--genre comedy --layer scene --seed ZZ` is byte-identical between b096b87a and HEAD (old script copied to scratch and diffed). The same holds for six earlier argument sets. |
| 6 | Catalogue quality (seed `025-5`) | 5/5 | 30 of 30 judged acceptable (table below). |
| 7 | Break attempts | 3/5 | More than 150 new rows executed. Two P2 defects (D and C below). No P0 or P1. |

**Criterion 1, by feature (what I ran)**
- **K1:**
  - `cliches.js pick --need MEET`, `Meet,SECRET --layer Scene --genre Comedy`, `' meet '` and `--need meet,meet` all work, exit 0.
  - `--need ''`, `nonsense`, `--limit 0` and `--layer scene` with no need give a clean exit 2 with the vocabulary.
  - Default pick returns no caution or practice entry. `--include-caution` grows the pool from 73 to 75.
  - The catalogue has 468 entries: 371 numbered and 97 unverified.
- **K2:**
  - A drama episode board reads `undecided` with `cliche_undecided`, on the real `setupProject` and `manageProject` episode path.
  - Recording uses moves it to `use` with `basis:"default"`.
  - A draft board outside an episode gets no open record, as designed.
- **K3:**
  - Documentary: an apply without `basis` is refused (`cliche_user_choice`), `offered:true` is accepted, and `basis:"user"` is accepted.
  - 9 forged `storyboard_apply globals.CLICHES` variants are refused with `cliche_record`: `basis:user`, `offered:0`, `offered:"false"`, `offered:true`, none-only, empty uses, null, `__proto__`, and a handler call.
  - Saved `off`, set through `manageProject update`, refuses a default apply. The same call with `basis:"user"` is accepted.
- **K4:**
  - Headless Chrome with `--use-mock-keychain`, ko and en.
  - The strip shows the status ("이야기에 4개 · 추천 1개, 선택 대기", "none used — …").
  - Chips show the need, "기본 적용" / "by default", "사용자 선택" / "your pick", "추천 · 적용 전", the shift, and the caution mark.
  - Scene lanes are present, and scenes are sorted: `S#1, S#3, S#99 보드에 없음`.
  - `</script><script>document.title="PWN"</script>` and `<img onerror>` stay inert; the page title is unchanged.
  - I viewed the ko screenshot.
- **K5:**
  - Id 25 gives `cliche_caution`. Id 258 gives `cliche_quote`. Id 306 gives `cliche_practice`.
  - Repeat across episodes e1 and e2 gives `cliche_repeat`. A repeat by catalogue name also resolves, giving two repeats for #5 and #25.
  - `cliche_character` and `story_order` are refused.
  - Applying all 468 ids in one call succeeds with warnings only.
- **K6:**
  - Every code the code emits (17 `cliche_*` codes plus `story_order`) is named in `cliche-use.md` §7. `CLAUDE.md:138` names `cliche_mode_changed`, `cliche_choice_kept` and `cliche_record`. `scenes-schema.md:538,567,569` agree. The `storyboard_apply` description names `cliche_mode_changed` (`tools.ts:5201`).
  - Counts match: `TOOLS.length` is 157, matching README lines 747, 750 and 823. The catalogue counts 468 / 371 / 97 and evidence tallies body 148 / wiki 101 / community 78 / snippet 44, matching `cliche-use.md` §9.
  - The `story_cliche` allowed-tools pair is in storyboard `SKILL.md:11` and autoproduce `SKILL.md:11`.

**Criterion 3, test mapping**
- K1: `cliches.test.mjs:14` and `:49`. The new `findByName` and uppercase-need assertions are in it.
- K2: `cliches.test.mjs:32` and `:87`, and `storyboard.test.mjs:552`.
- K3: `storyboard.test.mjs:585` and `project-settings.test.mjs:194`.
- K4: `storyboard-html.test.mjs:96`. It includes a hand-edited scenes case with `9, 3, 3, null, 'x', 1e21`.
- K5: `cliches.test.mjs:119` and `storyboard.test.mjs:636`, which holds the `cliche_matched` (about lines 662–667) and `cliche_unreadable` (about line 671) cases.
- The negative `cliche_mode_changed` case is at `storyboard.test.mjs:622–624`.
- The visible-text refusals cover `ㅤ`, `⠀`, `­` and ` `; the accepted names include ja, vi and a ZWJ emoji sequence.

**Criterion 4**
- D8: the scan over added diff lines (excluding research docs) has 0 hits. Whole-file hits are only `CLAUDE.md:426–463`, its own rule section.
- Descriptions: `story_cliche` 1,822 characters, `storyboard_apply` 3,658, `storyboard_read` 3,861. All have Use it, Do NOT and Returns, and all are under 4,096.
- `check:dist` passed in the gate.
- `test-layout` passed in the gate (147 test files).
- `cliche_mode_changed` is a warn. No score gate and no new approval pause.

### RE-CHECK of verify-4's findings
| Finding | Result | What I ran |
|---|---|---|
| P2 invisible-name list | **Fixed** | Refused: U+3164, U+2800, U+115F, U+1160, U+FFA0, `a­b`, U+2028, tag char U+E0041, lone surrogate, combining marks only, ZWJ alone, ZWNJ alone, bidi override. Accepted: ko, ja, zh, vi, th, ar, es, fr, de, en with quotes and parentheses, emoji with VS16, ZWJ family emoji, NBSP and ideographic space inside a name, Hindi virama+ZWJ, Persian ZWNJ, emoji-only. Limits: `name` 120 accepted and 121 refused. `shift` and `none` 300 accepted and 301 refused. Newline, tab and CRLF in `shift` or `none` are refused, which is the stated plain-text rule. |
| Negative `cliche_mode_changed` | **Fixed** | drama→comedy and comedy→drama give `[]`, as does custom(doc)→custom(doc). drama→documentary, doc→drama and explainer→custom-romance warn. |
| Scene numbers sorted on the page | **Fixed** | `[3,99,1e21,1,'2',null,1.5]` renders `S#1, S#3, S#99` with `S#99` marked as not on the board. |
| `cliche_mode_changed` in CLAUDE.md and apply text | **Fixed** | `CLAUDE.md:138` and `tools.ts:5201`. |

### BREAK ATTEMPTS (new executed rows; abridged to 28 of 150+)
| # | Input | Observed |
|---|---|---|
| 1 | `name:"LOVE TRIANGLE OR SQUARE"` on drama | `cliche_matched`, recorded as #5, one entry. |
| 2 | `{name:'  삼각·사각관계  '}` | Matched to #5. |
| 3 | Documentary, `{name:<catalogue name>}` with no basis | `cliche_user_choice`. |
| 4 | Same with `basis:"user"` | Recorded as #5, `basis:"user"`. |
| 5 | Offered then applied then offered again by name | Single entry flips offered, user, offered. No duplicate. |
| 6 | Caution entry by Korean or English name, on apply and on offered | `cliche_caution` and `caution:"coercion"` stored. |
| 7 | `{id:6,name:<name of #5>}` | Recorded as #6 with the supplied label. No match, as the id leads. |
| 8 | Two same-entry names in one call | One entry and two `cliche_matched`. |
| 9 | `uses:null`, string or object (hand-edited) | `cliche_unreadable` with `skipped:1`. Then a write succeeds. |
| 10 | Mixed uses `[valid, 'str', null, {id:5.5}, {name:'  '}, {id:'6'}, {id:7}]` | `skipped:5` on read. The write keeps ids 5 and 7 and adds 9. |
| 11 | Clean record, `uses:[]`, none-only, version 99, no version, `CLICHES` as string, array, number or null | `cliche_unreadable` is never emitted. |
| 12 | Garbage entry (`name:{a:1}`, `scenes:'x'`, `id:99999`, `id:-3`, `none:42`) | The read and a later write succeed, the entries are kept, and the export HTML and CLI `board` do not crash. |
| 13 | `PRODUCTION:{videoType:'documentary'}` or `[]` on drama | `cliche_mode_changed`. |
| 14 | `--need MEET --seed q`, `--genre Comedy`, `--exclude 5,x,-1` | Normal list, exit 0. |
| 15 | `show 0` / `05` / `0x5` | "no such entry" (exit 0) / `#5` / `#5`. The hex form shows #5, which is odd and harmless. |
| 16 | `story_cliche` with an extra key, no path, `uses:'5'`, `{id:0}`, `{id:1.5}`, `scenes:[0]`, an empty `character` | Zod refusals, no write. |
| 17 | `scenes:[]`, `uses:[]`, `remove:[]` | Refused (min 1). A use cannot be detached from scenes without `remove` and re-add. |
| 18 | `none` then a `use`, `none` plus `uses`, `none:''` | `use` replaces `none`; `none`+`uses` refused; empty refused. |
| 19 | 468 ids in one call | Written in 10 ms, warnings only. |
| 20 | Nonexistent board path | `no scenes.js at …`. |
| 21 | Real episode, characters `mina` and `nobody` | Accepted and `cliche_character`. |
| 22 | Saved `off`, then repeat in a later episode | Refused without `basis`, accepted with it, `cliche_repeat` ×2. |
| 23 | `storyboard_apply` global key `cliches` (lowercase) | Written as an inert global, no effect on the record. |
| 24 | Review page, `lang=ko` and `lang=en`, with `<img onerror>` in `shift` | Escaped, no title change. |
| 25 | Seven record shapes (none, undecided, offered, applied, caution, hand-edit and garbage), each rendered | Page exports and renders each. |
| 26 | `cliches.js mode custom "documentary romance"`, `mode DRAMA`, `--saved ON` | offer (hybrid) / offer (id is lowercase-only) / apply (a saved on wins). |
| 27 | NFD-decomposed Hangul name, and a name with a double space | Recorded by name: no `cliche_matched` and no caution. See D3. |
| 28 | Legacy name-only record `{name:'삼각·사각관계',scenes:[1],shift}`, then `{name:…}` | A second entry `#5` is added. See D2. |

### SAMPLE (seed `025-5`: 112, 361, 54, 52, 12, 281, 411, 172, 298, 330, 142, 398, 122, 20, 460, 77, 236, 90, 134, 268, 181, 443, 425, 120, 67, 219, 1, 343, 414, 55)
Rows for ids ≤ 371 were checked against the report row. Ids 411, 398, 460, 443, 425 and 414 have no report row and were judged on `desc` alone.

| id | verdict | reason |
|---|---|---|
| 112 | ok | character, obstacle/status, sageuk: the merchant guild type. |
| 361 | ok | character, closeness/bind, any: womance (bind is soft). |
| 54 | ok | character, payback/status: illegitimate child of a chaebol family. |
| 52 | ok | device, secret/obstacle, family/romance: possible siblings. |
| 12 | ok | device, bind/status, romance/office: boss and secretary. |
| 281 | ok | line, danger, medical: "tonight is critical". Not a quote. |
| 411 | ok | device, payback/status: returns successful after "10 years later". |
| 172 | ok | device, payback/parting: staged death and revenge. |
| 298 | ok | directing, closeness, romance: OST singing. Row 298 mentions both in-story singing and an OST release, so `analysis:false` is defensible. |
| 330 | ok | place, status/setting: homes show the wealth gap. |
| 142 | ok | device, obstacle/status, legal/office. The meta-note does not outweigh the device. |
| 398 | ok | character, payback, legal/revenge: dark hero lawyer. |
| 122 | ok | device, obstacle/secret/bind, crime: reassigned case and secret base. |
| 20 | ok | directing, meet, romance: slow-motion pass. |
| 460 | ok | format, closeness, romance: first kiss in episode 8. |
| 77 | ok | scene, outburst, family/office: clutching the neck. |
| 236 | ok | character, danger/obstacle: motiveless villain. |
| 90 | ok | scene, danger, `violence`: the desc names burial and rape. |
| 134 | ok | character, danger, crime: ubiquitous loan sharks. |
| 268 | ok | line, payback/parting, `quote:true`: row names the actor and the drama. |
| 181 | ok | format, relief/closing, revenge: humour before punishment. |
| 443 | ok | line, obstacle/status: stock line, `quote:false`. |
| 425 | ok | character, rule/parting, fantasy/horror: hero resolves ghosts' grudges. |
| 120 | ok | format, `analysis:true`: viewers guessing is viewer behaviour. |
| 67 | ok | device, obstacle/status, family/office: succession feud. |
| 219 | ok | device, danger/obstacle, horror: humans scarier than monsters. |
| 1 | ok | device, status/obstacle, romance/office: Cinderella story. |
| 343 | ok | scene, closeness/danger: piggyback instead of 119. |
| 414 | ok | device, closing/payback: hollow finale. |
| 55 | ok | device, reveal/secret, family: adoption secret exposed. |

### P0 Defects
None.

### P1/P2 Findings
1. **D, P2 (scored).** Remove-by-name is asymmetric after `cliche_matched`.
   - Input: record `{name:"삼각·사각관계"}`. The tool stores it as #5.
   - Then `remove:["삼각·사각관계"]` returns `cliche_not_recorded`. The record still holds #5.
   - Removing by id works. `cliche-use.md` §7 says remove is "by id or name" without that caveat.
   - Cause: `server/src/storyboard.ts`, the `remove` loop (about line 1588) keys by `name:` and never calls `findByName`.
2. **C, P2 (scored).** A name-only record already holding a catalogue name stays when the same name is recorded.
   - Input: a hand-edited or earlier record `{name:'삼각·사각관계',scenes:[1],shift:'keep me'}`, then `uses:[{name:'삼각·사각관계'}]`.
   - Result: two entries, the old name-only one and a new `#5`. Its shift and scenes are not carried over.
   - Only a hand edit can create the old shape now, so this is minor.
3. **D3, informational (not scored).** `findByName` is an exact, case-insensitive match. An NFD-normalised name or one with an inner double space is not matched. It is then recorded by name, with no caution or repeat reading.
4. **Informational (not scored).** `uses:null` or a string counts as "1 entry unreadable".
5. **Informational (not scored).** `story_cliche` refuses `scenes:[]`, so a use cannot be detached from its scenes except by remove and re-add.

### Fix Directives (optional, none blocks)
1. `writeStoryCliches` remove loop: resolve a string target through `lib.findByName` to its `#id` key when the record has no `name:` entry. Matching `cliche-use.md` §7 and a test case follow.
2. In the use loop, when a name matches and an old `name:` entry has the same name, replace that entry instead of adding one.
3. In `findByName`, normalise NFC and collapse inner whitespace before comparing.
4. Let `scenes:[]` detach a use from its scenes, or say in the description that it cannot.

### Recommendations
- Verify-4's decision not to freeze `videoType` still stands. A mode change is warned on the write that makes it, and reversing it is caught later by `cliche_unpicked`.
- The review page shows no strip on an untracked board. A tracked-but-empty drama record shows `미정`; I confirmed that string in the template but did not render a tracked empty board.

ASTRA_LOOP_RESULT: score=98 verdict=PASS p0=0 iter=5
