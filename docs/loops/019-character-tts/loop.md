# Character TTS regeneration — frozen rubric

Date: 2026-11-10

Target: Improve character TTS regeneration so a selected sample cannot silently become default speech in a video. Evaluate adversarially and improve until score >= 95/100, with no target-blocking defect and passing objective checks.

User requested repetition until the threshold; no iteration cap or publishing is inferred. Evaluation uses a fresh, read-only reviewer. No live generation, audio quality certification or changes to local episode artifacts are included.

| Criterion | Weight | Award rule and required evidence |
| --- | ---: | --- |
| Voice selection correctness | 35 | 10: selected gateway sample cannot generate with default; 10: shared/episode voice drift is exposed and refused before new generation; 10: raw gateway and router reject changed voice/text/revision and output alias bypasses; 5: errors identify a concrete recovery path. Cite implementation and regression tests for each award. |
| Generation evidence | 25 | 10: attachment verifies actual receipt voice/generator/text against the pin; 5: completion status, output path and bytes are checked; 10: composition and assembly recheck attached receipts and expose tampering. Cite implementation and executable regressions. |
| Compatibility and scope | 20 | 5 each: sample auditions and native MSR remain usable; intentional documented episode voice/model exceptions remain usable; existing attached recordings/native clips remain reusable without forced migration; no automatic retry/provider switch, generation spending, or unrelated/data changes. Cite code and tests/diff. |
| Validation and delivery | 20 | 10: focused regressions exercise old failure paths and would fail before these edits; 5: npm run check exits 0; 5: skill-lint exits 0 and generated server/dist matches the source build. Cite tests and command results. |

Scoring starts at zero. Missing evidence earns zero for that subitem. Any remaining route that makes the target false is target-blocking (P0); a failing objective command is also P0. PASS requires >=95, zero P0, and both objective commands passing. Native MSR sample optionality and historical-media reuse are owner directives, not new-generation escape hatches. A local receipt proves recorded inputs and bytes, not that an external model acoustically reproduced a voice.

Objective commands:

- `cd server && npm run check`
- `node skills/platform-guide/references/skill-lint.js`
- `cd server && npm run check:dist`
