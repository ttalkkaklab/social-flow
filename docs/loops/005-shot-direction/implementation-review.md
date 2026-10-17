# Independent implementation review

Reviewed on 2026-10-17 by the direction_verifier agent against the frozen
implementation rubric in `loop.md`. The reviewer read `CLAUDE.md` first and did
not edit implementation files. This report evaluates plugin implementation only;
the LTX storyboard and generated video have not been scored.

## Initial review: 90/100

| Criterion | Award | Evidence |
| --- | ---: | --- |
| Functional completeness | 32/40 | Camera, incoming joins, offline export and authoring/production guidance each earned 8. Timing did not earn its 8 points because the new timeline ignored the established `SB_DOC.outro.seconds` source. |
| Objective checks | 25/25 | Completed initial full-check logs: workspace 1,981 passed; release 1,990 passed; zero failures/cancellations. Reviewer independently ran skill lint successfully in both trees. |
| Meaningful coverage | 15/15 | Movement semantics, special playback ordering, unknown times, escaped immutable inputs and offline refresh each earned 3. |
| UI and convention quality | 10/10 | Inspected desktop and mobile fixture images. Camera and join labels are readable; existing disclosure navigation opens and focuses the linked detail. No evidenced defect class. |
| Regression control | 8/10 | Known outro timing regressed. The distributable otherwise preserves the newer installed baseline and rendering does not mutate the plan. |

The concrete regression was reproducible with a three-second cover, an outro
without its own duration, and `SB_DOC.outro.seconds = 9`: the new timeline showed
an unknown length instead of the known nine-second outro. The reviewer also
identified an existing inconsistency exposed by the new timing view: the header
and contract treated missing main-shot durations as zero and displayed an exact
total. Neither issue was a critical defect under the frozen rubric.

## Repairs and follow-up review

`shot-direction.js:61` now resolves outro timing from the existing document
metadata without changing scene inputs. Both timeline and per-shot summary receive
that metadata. A second review caught the initially omitted summary argument;
`storyboard-html-template.html:4238` now passes it too.

`storyboard-html-template.html:2392` now sums only finite positive lengths and
tracks unknown main-shot lengths. Header and contract display the known planned
subtotal plus the unknown count, omit an exact outro-inclusive total when partial,
and avoid a misleading lower-band warning. A known subtotal above the hard cap
still reports the excess.

The reviewer independently executed these checks after the final repair in both
the workspace and the actual release tree:

```text
node --test server/test/shot-direction.test.mjs server/test/storyboard-html.test.mjs server/test/visual-direction.test.mjs
25 tests passed, 0 failed, exit 0 (each tree)
node skills/platform-guide/references/skill-lint.js
16 rules hold across 21 skills, exit 0 (each tree)
```

Coverage now includes the actual HTML renderer's unknown-main subtotal and known
outro timeline/card text, in addition to the helper checks. The source/refresh
tests verify immutable inputs, escaped authored text, original shot links and
offline helper replacement without rewriting `scenes.js`.

The reviewer compared the release at
`/Users/zeans/.local/state/social-flow-direction/builds/0.115.1-direction.1`
with the newer installed baseline at
`/Users/zeans/.local/state/social-flow-story-first/builds/0.115.0-story-first.2`,
then independently repeated the comparison against the concurrent installed update
`/Users/zeans/.local/state/social-flow-story-first/builds/0.115.0-story-first.3`.
Differences match the task's UI, guidance, tests, release metadata and provenance.
The built server bundle differs only in version strings; newer server behavior
was preserved, including the newer ASTRA speech-prompt warning and its tests and
guidance from `.3`. No remaining critical or substantive implementation defect
was found.

| Criterion | Revised award | Evidence |
| --- | ---: | --- |
| Functional completeness | 40/40 | All five capabilities are usable; known and unknown timing now agree across the new view and aggregate displays. |
| Objective checks | 25/25 | Final full checks completed: workspace 1,981/1,981; release 1,992/1,992; zero failures/cancellations. Both commands exited zero, and the reviewer reran lint successfully in both trees. |
| Meaningful coverage | 15/15 | All five frozen coverage categories are exercised; timing regression assertions were added. |
| UI and convention quality | 10/10 | No evidenced defect in labels, keyboard access, narrow layout, language or conventions. |
| Regression control | 10/10 | Outro compatibility repaired, newer baseline retained, no source-plan mutation. |

Revised score: **100/100**, with no critical defects, under the unchanged rubric.
The reviewer inspected the completed final summaries in
`/tmp/social-flow-direction-check-final.log` and
`/tmp/social-flow-direction-release-check-final.log`; the implementing agent
reported both process exit codes as zero. Final independent lint checks also
exited zero in both trees. The extra release tests cover behavior retained from
the newer installed baseline.

This is an implementation assessment, not a claim of generated footage quality,
measured retention or commercial performance. The desktop/mobile files inspected
were UI fixtures, not a completed episode or LTX artifact.

## Incremental previz compatibility review: direction.2

Production exposed an execution-contract incompatibility: LTX's 145 frames at
24 fps require `145 / 24` seconds, while the previz validator accepted only whole
seconds. The patch accepts finite positive durations spanning whole frames,
checks key endpoints against the rounded frame count and clamps playback to that
same count. The distributed `previz-runtime.js` was rebuilt.

The independent review found a zero-frame edge case in the first patch:
`seconds: 1e-12` at 24 fps passed the tolerance check, while `frameAt` returned
zero. The repair requires at least one rounded frame. Regression tests now reject
tiny positive lengths, zero, negative lengths, NaN, Infinity and numeric strings,
and accept the 25/121/145/193-frame LTX lengths with their final keys intact.

After that repair, the reviewer independently ran the four previz tests in both
the workspace and `0.115.1-direction.2`; both passed with exit zero. Additional
checks exercised 222 combinations of frame counts and integer fps values from
24 through 60 without a precision failure. The reviewer loaded the actual bundled
runtime in a Node VM and checked 12 cases per tree: invalid durations, valid
145/24 seconds, and invalid keyframes. Bundled validation matched the source
validator; the valid duration proceeded to WebGL creation. This VM check verifies
validation parity, not an actual WebGL render or generated footage.

No remaining defect was found in the repaired incremental code. The reviewer
inspected the completed final logs: workspace 1,982/1,982 passed in
`/tmp/social-flow-direction2-workspace-check.log`, and release 1,993/1,993 passed
in `/tmp/social-flow-direction2-release-final.log`, with zero failures or
cancellations. The implementing agent confirmed both process exit codes were
zero. The reviewer independently reran lint in both trees: 16 rules across 21
skills, exit zero.

The reviewer verified that `direction-release.json` now identifies
`0.115.1-direction.2`, retains the `.3` baseline, records those checks, and that
every listed file hash matches the release file. The implementation score remains
**100/100** for the repaired `.2` release: functional completeness 40, objective
checks 25, meaningful coverage 15, UI/conventions 10 and regression control 10.
No critical defect remains. No LTX video score is awarded by this addendum.

## Incremental silent-character review: direction.3

The reviewer inspected the changes to `character-identity.js`,
`character-voice.js` and `character-sheet.js`. For a story-v2 episode,
`requiresSpeech` derives each character's speech requirement from nonempty
narration attributed to that character. Missing speakers conservatively require
speech readiness. Legacy episodes retain their existing strict requirement.
Pending speech identity fields may remain truthful for a silent character;
visual identity, field types, handoff direction, local identity hashes and any
supplied voice settings still undergo validation. The optional source voice must
be explicit `tts: null`; a missing source voice block is rejected.

The reviewer independently ran character identity and voice tests in the
workspace and `.3` release: 13/13 passed in each, exit zero. Additional adversarial
checks verified a silent actor beside a voiced narrator; rejection when the actor
gains a voiceover, on-screen or off-screen line; unchanged legacy strictness;
missing-speaker rejection; malformed optional voice rejection for false, zero,
empty string, array and invalid engine values; and rejection of an absent source
voice block. Existing source tests also verify that pending appearance and stale
identity records cannot pass.

No concrete defect or weakening of spoken-line voice validation was found. The
reviewer inspected complete full-check logs: release 1,994/1,994 in
`/tmp/social-flow-direction3-check.log`, and workspace 1,983/1,983 in
`/tmp/social-flow-root-direction3-check.log`, with zero failures or cancellations.
The implementing agent confirmed both process exit codes were zero. Independent
lint runs passed in both trees: 16 rules across 21 skills, exit zero. A duplicate
reviewer workspace check was interrupted and was not used as evidence.

The reviewer verified the refreshed `.3` provenance version, check counts and all
listed hashes against release files. The implementation score remains
**100/100** for `0.115.1-direction.3` under the same rubric: functional
completeness 40, objective checks 25, meaningful coverage 15, UI/conventions 10,
regression control 10. No critical defect remains. This review makes no claim
about generated video or audio quality.

## Incremental visual sampling review: direction.4

The reviewer verified the installed Google GenAI SDK's `VideoMetadata` contract:
unspecified video sampling defaults to 1 fps, and the permitted explicit range
is greater than zero through 24 fps. Its request conversion preserves
`videoMetadata`. The patch supplies 8 fps only for visual/audiovisual review of
video, preserves original bytes and MIME type, and does not alter review prompts,
score thresholds, evidence requirements or failure handling.

The initial patch changed the policy identifier globally. The reviewer identified
that this would invalidate an unchanged audio-only review's cache identity and
permit another paid call despite no change to audio review behavior. The repair
retains `acting-review-v6` for audio-only requests and uses `acting-review-v7` for
visual review. Request hashing, cache validation and stored receipts all use that
mode-specific policy. Earlier visual receipts retain their original identity and
are not overwritten by the new sampling policy.

The reviewer also identified an overly broad previz documentation claim. The
revised text now distinguishes integer-second adapter requirements from the
ASTRA/LTX `numFrames` / `frameRate` exception, matching the existing routing
validator rather than weakening it.

Independent targeted tests passed in both workspace and candidate `.4`: 26/26,
exit zero. They cover sampling payloads, unchanged audio receipt reuse, distinct
visual policy, retained unfavorable observations, identical-request reuse and
existing coverage constraints. No remaining incremental defect was found.

The reviewer inspected the completed final logs:
`/tmp/social-flow-direction4-root-final.log` reports 1,985/1,985 passing tests;
`/tmp/social-flow-direction4-release-final.log` reports 1,996/1,996. Both have zero
failures or cancellations, and the implementing agent confirmed exit zero.
Workspace lint independently passed with 16 rules across 21 skills. The
implementing agent confirmed release lint passed before removal of the development
dependency symlink. A reviewer rerun after that cleanup could not resolve the
development dependency `zod`; it was not recorded as another lint pass or as a
failure of the self-contained server bundle.

The reviewer verified `.4` provenance and all listed release hashes. The score
remains **100/100** for `0.115.1-direction.4` under the unchanged implementation
rubric: 40 functional, 25 objective checks, 15 coverage, 10 UI/conventions and 10
regression control, with no critical defect. The reviewer did not inspect the
production clip for this code review and makes no claim that 8 fps guarantees
correct model observations or a passing video.

## Merged development branch and silent assembly review: 0.115.2

The reviewer compared the merged storyboard template with both the prior
direction implementation and `origin/dev`. Story-v2 content-based timing and
explicit length constraints coexist with original shot references, camera/join
summaries, known outro metadata and unknown-length displays. Review found one
integration defect: the explicit minimum warning treated a known subtotal as a
complete duration. The repair suppresses that minimum comparison while lengths
are unknown. Independent execution of the actual renderer verified three cases:
unknown minimum suppressed, complete minimum violation retained, and a known
subtotal already above the explicit maximum still reported.

The new `frame-clock.js` recovers the integer 48 kHz audio sample count before
rounding up to video frames. This prevents the six-decimal ffprobe representation
of 145/24 seconds from acquiring an extra frame. Boundary tests cover
25/121/145/193 frames at 24/25/30/48/50/60 fps, preserving a genuinely additional
audio sample rather than discarding it.

The explicit `SILENT=1`, `OUTRO=0` branch bypasses music loudness normalization,
checks narration and optional music samples are zero, and writes 48 kHz stereo
PCM without changing the sample clock. The default music mix remains in the
unchanged non-silent branch. The reviewer identified that manifest-only cue
checks missed legacy source `sound.cue`, `sound.sfx` and `sound.ambience` fields
when the sound compiler did not emit TSVs. The new `silent-plan.js` checks the
source before speech composition, rejecting those cues, extended effects and
authored spoken text. Manifest and actual-audio checks remain in place.

Independent targeted tests passed 28/28, including generated zero/tone WAV
fixtures that verify 290,000 samples, stereo output, and rejection of nonzero
narration/music. Shell syntax checks passed for the builder and silent mixer.

The reviewer also checked the motion-proxy advisory change in
`verify-assembled.js`. Low-difference findings now persist as warnings with
`needs-review`, consistent with the repository's automatic-execution guidance.
The patch does not suppress ffprobe/decoder exceptions, source/output hashes or
edit/timing checks, and adds no frame padding or substitution. The targeted test
with actual moving/still fixtures passed and retained the measured warnings.
This changes whether a proxy measurement blocks assembly; it does not certify
the footage or waive the separate user-requested artifact review.

The extraction-based assembly fixtures were adapted to the new helper dependency
without changing their asserted behavior: the audio fixture receives `HERE`, and
the main-concat fixture's existing section boundary stays before the new silent
branch. The reviewer inspected the fixture adjustment and the completed targeted
assembly log: 14/14 tests passed.

The reviewer inspected the completed merged full-check log at
`/tmp/social-flow-direction-merged-final3-check.log`: **2,018/2,018** tests passed,
with zero failures, cancellations or skipped tests. The implementing agent
confirmed process exit zero. Independent lint passed: 16 rules across 21 skills,
exit zero. Earlier failing extraction-fixture runs were repaired and are not
represented as passes.

No remaining substantive or critical implementation defect was found. The score
is **100/100** for merged version `0.115.2-direction.1` under the unchanged rubric:
functional completeness 40, objective checks 25, meaningful coverage 15,
UI/conventions 10 and regression control 10. This assessment is of the merged
implementation revision. It does not claim that the subsequent published or
installed package has already been verified, and makes no final-film quality or
actual production-playback claim.
