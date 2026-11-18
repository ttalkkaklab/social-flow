# Verify 4 — 025 cliche-use

평가자: `astra-methodology:loop-verifier` (새 컨텍스트, 읽기 전용) · 대상 커밋 b096b87a · 도구 호출 30회, 약 4분. 아래는 평가자가 돌려준 보고서 원문이다.

## Target Verification Report — iteration 4

### Target
Add a cliché-selection step to social-flow synopsis and storyboard authoring. Drama, romance and comedy apply by default. Other types get a recommendation, and a cliché applies only on the user's pick. The review page displays all of it. Improve until the adversarial score reaches 95 or more.

### Overall Score: 99/100. Verdict: PASS, 0 P0.

### Score Breakdown
| # | Criterion | Awarded | Evidence |
|---|---|---|---|
| 1 | Functional completeness (K1–K6) | 35/35 | Each of K1–K6 was reached by execution. |
| 2 | Objective gate | 25/25 | I re-ran `bash docs/loops/025-cliche-use/gate.sh`. The log ends `skill-lint: 17 rules hold across 30 skills`, `GATE OK`, `EXIT 0`. Afterwards `git status --short` lists only `?? .claude/`. |
| 3 | Tests | 10/10 | See the mapping below. |
| 4 | Repo rules | 10/10 | See the list below. |
| 5 | No unrelated edits or regression | 10/10 | 48 changed files. Every path is inside the loop's scope list; the only non-ASCII-looking paths are the research reports and notes, which are in scope. The same-seed picker output is unchanged, since the catalogue was not touched in `860d3710..b096b87a`. No regression showed up in the mode-change matrix (rows T and M below). |
| 6 | Catalogue quality (seed `025-4`) | 5/5 | 30 of 30 judged correct (table below). |
| 7 | Break attempts | 4/5 | More than 100 new executed rows. One P2 (invisible or blank-looking name characters). No P0 or P1. |

**Criterion 1, by feature**
- **K1:** `cliches.js pick --need relief --genre comedy --limit 3` prints `3 of 28 matching` and the comedy note, exit 0. Other inputs gave clean exit-2 errors with the vocabulary: `--need ""`, `--limit abc`, an unknown layer, and `--genre COMEDY`.
- **K2:** a drama board with no record reads `decision:"undecided"` and reports `cliche_undecided`.
- **K3:**
  - A board with no saved type applying id 5 gives `cliche_user_choice`.
  - A drama board applying id 5 records `basis:"default"`.
  - A saved `off` survives every attempted overwrite: `on`, `"ON"`, `null`, and an absent key each give `cliche_choice_kept`.
- **K4:** the ko screenshot and the en `--dump-dom` show the strip, the status, the `your pick` and `by default` labels, the shift text, and the `not on the board` mark.
- **K5:**
  - Id 25 records with `cliche_caution`.
  - Id 306 records with `cliche_practice`.
  - Id 258 records with `cliche_quote`.
  - Retyping back to documentary yields `cliche_unpicked` once per use (2).
- **K6:**
  - The CLAUDE.md directive, `cliche-use.md` and `scenes-schema.md:567` agree with the code on `cliche_choice_kept`, `cliche_record`, `cliche_unpicked` and the 120/300 limits.
  - `TOOLS.length` is 157, matching README lines 747, 750 and 823.
  - The `story_cliche` allowed-tools pair is present in `skills/storyboard/SKILL.md`.
  - The JSON-schema need enum equals the picker's `NEEDS` keys.

**Criterion 3, test mapping**
- K1: `server/test/cliches.test.mjs:14` and `:49`. The `:49` case now also covers `--genre comedy`.
- K2: `cliches.test.mjs:32` and `:84`, and `server/test/storyboard.test.mjs:552`.
- K3: `storyboard.test.mjs:585` and `server/test/project-settings.test.mjs:194`.
- K4: `server/test/storyboard-html.test.mjs:96`. Its scene-number case now includes duplicate, null and string scene numbers.
- K5: `cliches.test.mjs:116` and `storyboard.test.mjs:636`.
- The new `cliche_mode_changed` assertion sits in `storyboard.test.mjs:585`.
- One test file per module, and `cliches.test.mjs` is the only cliché file. Assertions use codes and fields.

**Criterion 4, violation classes: none**
- **D8:** the scan over added diff lines of `CLAUDE.md`, `README.md`, `skills`, `server/src`, `server/test` and `docs/loops` has no hits. Whole-file hits are only in `CLAUDE.md`, from its own rule section.
- **Descriptions:** `story_cliche` is 1,822 characters, `storyboard_apply` 3,658, `storyboard_read` 3,861. All are under 4,096 and carry Use it, Do NOT and Returns.
- **dist:** `check:dist` passed in the gate.
- **Score gates:** `cliche_mode_changed` is a `warn`, not a refusal.

### RE-CHECK of verify-3's findings
| Finding | Result | What I ran |
|---|---|---|
| P2-A `PRODUCTION.videoType` patch | **Decided otherwise, accepted.** | `applyStoryboard` PRODUCTION patches gave `cliche_mode_changed` for documentary→drama, drama→documentary, comedy→explainer, none→drama and a custom description flipped. Same-mode changes (drama→comedy, explainer→custom, documentary→explainer, drama→drama) and a no-type board's first style patch gave `[]`. The same warning came back through `ROUTES.storyboard_apply` for documentary→drama. A saved `on` or `off` stays kept. Retyping a board with an `offered` record to drama leaves that record `offer`, and an applied record retyped to documentary reads `use` under mode `offer`, which `cliche_unpicked` flags. |
| P2-B length and character rule | **Fixed, with a gap.** | Boundaries behave: 120 accepted and 121 rejected; 300 accepted and 301 rejected, for both `shift` and `none`. Rejected: C1 `\u0090`, zero-width space, left-to-right mark, tab, newline, `#٥` and `#५`. Accepted: Korean, Japanese, Chinese, Vietnamese, Spanish, French, German, English with quotes and parentheses, and ZWJ emoji. The gap is the new P2 below. |
| P2-C scene numbers | **Fixed.** | `[2,1,2,1.5,-3,0,'2']` renders `S#2, S#1` with duplicates, fractions, negatives, zero and strings dropped. A script-closing name and a 300-character shift stayed escaped in the page, and the title did not change. |
| `--genre comedy` | **Fixed.** | Exit 0, a note, `comedy:true` in JSON, and the pool is unchanged versus no genre. `COMEDY` (upper case) still errors with the vocabulary. |

My view on the decision not to freeze `videoType`: I side with the author. `model-settings.md` makes a per-episode type change a user-requested override. Freezing it would block that route. The repo directives say to report, not refuse. The opening is also bounded:
- The change is warned on the write that makes it.
- Reversing it is caught later by `cliche_unpicked`.
- A saved `on` or `off` cannot be overridden this way.

### BREAK ATTEMPTS (new executed rows; abridged, 20 shown)
| # | Input | Observed |
|---|---|---|
| 1 | Patch `PRODUCTION:{videoType:null}` on a drama board | `cliche_mode_changed`. The type was wiped, which is true and pre-existing. |
| 2 | Cost-quote, approval and mode patch on a drama board without `videoType` | `cliche_mode_changed`. Accurate, because the patch drops the type. |
| 3 | Documentary→drama through the handler | Warning text returned. |
| 4 | Documentary→drama, apply ids 5 and 9, then back to documentary | Back-patch warns. `story_cliche` then reports mode `offer`, decision `use`, and `cliche_unpicked` twice. |
| 5 | Saved `on`, explainer→documentary, patch without `clicheUse` | `cliche_choice_kept`. No mode warning, since the mode did not change. |
| 6 | `CLICHES` as a string, array, `uses:null`, `version:99`, or `none:5`, then add id 5 | A clean record is written. Malformed entries, i.e. non-object or null items, are dropped silently. Valid entries are kept. |
| 7 | Mixed record with `{id:"6"}`, a string, null and a valid use, then add id 9 | The valid uses, `{id:"6"}` and the new one are kept. The string and null are dropped. Unknown fields on a use are preserved. |
| 8 | Corrupt `scenes.js` (trailing `}}}syntax`) | Throws `failed to evaluate`, and the file is unchanged. |
| 9 | Nonexistent path | `no scenes.js at /nonexistent/x/scenes.js`. |
| 10 | Path given as the `scenes.js` file itself | Works. |
| 11 | Handler call with `dryRun` or `force` keys | Zod rejects them as unrecognized keys. |
| 12 | `uses:[null]`, `remove:[""]`, `remove:[0]`, and `id:"5"` | Each is refused with an argument error. |
| 13 | 200 uses in one call | Written, 200 stored. |
| 14 | `id:1e9`, `id:2**53`, `scenes:[1e21]` | `cliche_unknown`, `cliche_unknown` and `story_order`. |
| 15 | `uses:[{id:9,need:'payback'}]` where payback is not one of the entry's needs | Accepted with no new finding. |
| 16 | `{id:10}` plus `{name:'삼각·사각관계'}` (the catalogue name of #5, no id) | Both recorded with no duplicate warning. |
| 17 | `none` on a drama board, then `uses:[{id:6}]` | The `use` replaces the `none` silently. |
| 18 | Review page with a name `</script><script>document.title="PWN"</script>`, scenes `[1e21,NaN,Infinity,2]`, and ` ` in a name | Escaped, with no script injection and no title change. `scenes.js` escapes `<`. The page shows `S#1e+21 not on the board`. |
| 19 | CLI `show 0`, `show 5.5`, `board /nonexistent`, `pick --need meet --exclude 5,x,-1` | `no such entry` with exit 0, usage with exit 2, a raw ENOENT with exit 2, and a normal list. |
| 20 | Names that pass the schema: U+3164 (Hangul filler), U+2800 (Braille blank), U+00AD (soft hyphen), U+2028, tag character U+E0041, a lone surrogate, NBSP in the middle | Round-trip through the handler into `scenes.js`. This is the P2 below. |

### SAMPLE (seed `025-4`)
Judged against each entry's `desc` and the tagging spec. I also checked the report rows for ids ≤ 371. Entries 447, 395, 416, 428, 460, 453, 449, 419 and 94's second sentence have no report row or are above 371.

| id | verdict | reason |
|---|---|---|
| 41 | ok | scene, closeness, romance: asleep on a shoulder. |
| 151 | ok | scene, danger and outburst, medical: ambulance dash. |
| 395 | ok | device, danger and obstacle, crime: profiler versus killer. |
| 416 | ok | scene, danger and setting, school: exam-day escort. |
| 321 | ok | place, setting: pojangmacha. |
| 50 | ok | device, secret and reveal: birth secret. |
| 153 | ok | scene, obstacle, danger, status: emergency patient bumped for a VIP. |
| 235 | ok | character, obstacle: the villainess type. |
| 428 | ok | device, danger and rule, horror: experiment monster. |
| 224 | ok | device, rule, horror: God aids the priest. |
| 95 | ok | device, obstacle and secret: the male lead's illness set up early. |
| 25 | ok | scene, closeness, `coercion`: wall-pin kiss. |
| 129 | ok | character, obstacle and parting: detective misses family occasions. |
| 78 | ok | scene, outburst: shouting grandfather. |
| 94 | ok | device, parting: terminal illness. |
| 447 | ok | line, outburst: "It's all your fault". |
| 152 | ok | place, setting: large hospital. Mixed with captions, but place fits. |
| 350 | ok | scene, closeness: pinky promise. |
| 278 | ok | line, reveal: birth-secret cry. |
| 342 | ok | place, setting: graveside liquor. |
| 460 | ok | format, closeness: first kiss in episode eight. |
| 453 | ok | format, closing: replaying the last ending. |
| 349 | ok | place, relief and setting: flick penalty ritual. |
| 449 | ok | line, danger and status: "the chairman collapsed". |
| 67 | ok | device, obstacle and status: succession feud. |
| 164 | ok | scene, reveal, outburst, obstacle: illegitimate son storms the office. |
| 230 | ok | character, status: Candy heroine. |
| 244 | ok | character, obstacle, outburst, status: violent boss. No `violence` flag, matching the spec's ordinary-melodrama rule. |
| 83 | ok | scene, outburst: spit take. |
| 419 | ok | device, reveal and secret: transfer student digs up bullying. |

30 of 30 correct, so 5 points.

### P0 Defects
None.

### P1/P2 Findings
1. **P2: the invisible-character blacklist is incomplete.** `clicheText` in `server/src/storyboard.ts` (the regex at about line 1511) blocks `\u0000-\u001f`, `\u007f-\u009f`, `​`, `‎/f`, `‪-e`, `⁠-⁩` and `﻿`. These still pass: U+3164 and U+2800 (names that render blank, in a Korean-language tool), U+00AD, U+2028/2029, tag characters and lone surrogates. I stored a `ㅤ` name through `ROUTES.story_cliche`. This is cosmetic, since the page escapes it. It defeats the check's stated purpose of text that changes how a line reads without showing. Criterion 7 takes 1 point.
2. P3 (no deduction):
   - The page lists scene numbers in stored order, so `S#2, S#1` is not sorted.
   - A huge integer prints as `S#1e+21`.
   - `show 0` and a missing id exit 0.
   - `--genre` is case-sensitive.
   - A name equal to a catalogue name but without its id raises no duplicate note.
3. The `cliche_mode_changed` assertion has no negative case. A same-mode type change that must stay silent is untested. I confirmed the behaviour by hand (rows T above).
4. `cliche_mode_changed` is documented only in `cliche-use.md` and its code. The `storyboard_apply` tool description and CLAUDE.md do not name it.

### Fix Directives (ordered, all optional before merge)
1. In `clicheText`, switch to a Unicode-property rule such as `\p{Cf}`, `\p{Cc}`, `\p{Zl}`, `\p{Zp}` with a ZWJ exception. Add a check that the text has at least one `[\p{L}\p{N}\p{P}\p{S}]`, so U+3164 and U+2800 names are rejected. Add one case to `storyboard.test.mjs:650`. This unlocks the final criterion 7 point.
2. Add a negative case beside the `cliche_mode_changed` assertion: a drama→comedy patch gives no `cliche_mode_changed`.
3. Name `cliche_mode_changed` in the CLAUDE.md cliché section and the `storyboard_apply` description's findings line.
4. Sort scene numbers in the strip (`Array.sort`).

### Recommendations (non-blocking)
- A saved `on` or `off` is frozen against `storyboard_apply`, while `videoType` is not. The asymmetry is defensible given the override procedure, but one sentence in `cliche-use.md` §1 saying so would stop a later reader from filing it as a bug.
- Silently dropping null and string items from a malformed hand-edited `CLICHES` record could carry a one-line `cliche_record` warning.

ASTRA_LOOP_RESULT: score=99 verdict=PASS p0=0 iter=4
