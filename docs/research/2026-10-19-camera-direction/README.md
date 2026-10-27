# Camera-direction adversarial verification

Scope: authoring guidance, advisory diagnostics, storyboard review surfaces and prompt
handoff. This is a planning/implementation review, not a score for generated footage.
The existing episode was inspected read-only; its shots and media were not rewritten.

## Fixed rubric and independent reviews

The rubric was fixed before review. Reviewers received artifacts and criteria without
prior scores or the requested target. They used the current host model in fresh contexts.
The second reviewer independently ran 144 focused tests and probed the six fresh author
fragments described below. No browser rendering or actual media playback was inspected.

| Criterion | Maximum | First review | Revised review |
| --- | ---: | ---: | ---: |
| Scene-specific authoring | 30 | 27 | 29 |
| Repetitive/missing direction detection | 25 | 12 | 23 |
| Production prompt propagation | 20 | 14 | 19 |
| Valid static/focus/reuse/text-only behavior | 15 | 13 | 15 |
| Tests and review UI | 10 | 7 | 9 |
| Total | 100 | 73 | 95 |

Both reviews found zero P0 issues. The first found a checker crash on malformed technique
records, omission of unchosen cameras, and copied hold reasons hidden by a different
angle reason. It also identified reason-only focus targets as a handoff risk. These were
repaired with guarded diagnostics, missing-choice advice, independent component checks,
explicit executable focus fields, and regression tests. The revised reviewer identified
no mandatory correction.

## Observed source failure

The inspected episode contained 95 shots: 78 static camera choices and 73 identical
camera-ending descriptions. Static was authored into the data, rather than substituted
by the review renderer. The original checker did not identify generic rationale reuse.
The HTML discarded production advice; the new camera-specific findings are displayed
explicitly and are also returned by storyboard read and check.

The revised diagnostic found 95 action-as-purpose records, three repeated-rationale
groups and one repeated-ending group in that episode. These identify review candidates,
not 99 independently proven artistic defects. A meaningful technique reason can coexist
with an obsolete action-only purpose field.

## Fresh author behavior evaluation

A separate author received six raw situations and current direction guidance, without
an answer key. It first proposed camera treatments, then encoded the same treatments in
actual shot fields. All six schema fragments passed `shotSchema.safeParse`, camera and
technique checks. The independent critic assessed the plans from their events.

| Situation | Authored treatment | Critic observation |
| --- | --- | --- |
| Tiny button press | Static extreme close-up | Preserves exact contact and displacement |
| Ring and recognizing witness | Static with rack focus after the witness stops | Names both targets, timing and focus order in consumed camera fields |
| Departure and empty chair | Slow dolly out after exit | Reveals the consequence of departure |
| Walking conversation | Parallel tracking with both faces visible | Retains listener and screen direction |
| Simultaneous quiet reactions | Held two-shot with both faces sharp | Preserves comparison rather than forcing a move |
| Unmotivated orbit in a low room | Reject orbit; retain eye-level hold | Uses narrative purpose and physical clearance rather than variety |

These are planning fragments, not an episode or generated media. Initial conceptual
phrases were translated into supported camera vocabulary before contract verification.
The evaluation did not spend on media generation.

## Verification

After integrating the then-current `origin/dev`:

- `cd server && npm run check`: 2,470 tests passed, zero failed or skipped.
- `node skills/platform-guide/references/skill-lint.js`: 17 rules passed.
- `node skills/storyboard/references/check-scenes.js --selftest`: passed.
- Fresh build produced no uncommitted dist/runtime drift.
- Git whitespace checks and the changed-file Korean D8 scan passed.

Regressions cover malformed technique records, missing choices, independent duplicated
rationale components, repeated endings, copied action-as-purpose, still-camera effects,
valid holds/rack focus, reuse/stock/outro/text-only exclusions, actual read/check/HTML
advice exposure and named focus-target propagation through Seedance and ASTRA assembly.

## Limits

The helper is intentionally lexical. Unique nonsense reasons such as “Banana” and
“Orange,” semantic paraphrases and arbitrary effect cycling cannot be certified by an
empty diagnostic result. Required authoring and critic guidance explicitly reviews the
sequence even when diagnostics are empty. Existing endpoint checks complement this
helper; the helper is not a complete shot validator.

Scores describe the inspected implementation and planning evidence. They do not guarantee
future author compliance, camera smoothness, image composition or generated acting.
Actual media must be inspected against the authored opening, action cue, attention change
and landing. Warnings never become a moving-shot quota or an unrelated execution gate.
