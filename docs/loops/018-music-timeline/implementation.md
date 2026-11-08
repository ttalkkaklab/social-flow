# Music after picture assembly

User target: improve music placement after shot assembly, with adversarial convergence to
at least 95/100. The final independent deployment pre-merge review scored 100/100 with
zero findings at every severity. See [review evidence](verify-deployment.md). This is the
pre-merge review requested by the deployment workflow, not a claim that the earlier
ASTRA rubric/cycle-limit confirmation occurred.

## Implemented contract

- `MUSIC.$timeline` names cue spans with stable shot-ID/start-offset or end anchors.
- Picture assembly establishes the actual frame clock before rendering the music bed.
- A span starts its source at zero at the anchor and preserves playback and a single
  gain envelope across all intervening cuts. Explicit fades belong to the span.
- Gaps and `$timeline:[]` add no score; source scene audio and ambience retain their paths.
- A compiler ownership marker selects the active mode. Orphaned edited manifests do not
  reactivate timeline mode, and legacy shot gain files cannot modify a timeline bed.
- Legacy boards without `$timeline` keep their existing defaults.
- The resolved receipt records the plan, actual clock and bed SHA-256 hashes with
  `not_reviewed`; signal checks do not claim listening approval.

See [contract](../../../skills/storyboard/references/scenes-schema.md#music-cues-windowmusic-sound),
[renderer](../../../skills/produce/references/music-timeline.js) and
[tests](../../../server/test/music-timeline.test.mjs).

## Independent adversarial findings and fixes

Two read-only audits by a fresh-context agent attempted to refute the implementation.
After their fixes, an independent pre-merge review scored the final artifacts and reran
the required checks.

1. Removing `$timeline` after editing its generated manifest left a stale file that the
   builder selected by existence. Fixed by using the current compiler ownership marker;
   a regression executes the production mode-selection statement.
2. Markerless legacy `music-gain.tsv` still applied a shot-reset envelope to timeline
   music. Fixed by bypassing that manifest on the new path; the full-builder regression
   supplies an old -60 dB row and measures the actual ducked bed across cuts.
3. The review lane included the earlier shot when a span began at that shot's end.
   Fixed by excluding that start shot; the HTML renderer regression exercises the case.

## Validation

- `cd server && npm run check`: exit 0, 1,664 tests passed.
- `node skills/platform-guide/references/skill-lint.js`: exit 0, 17 rules across 29 skills.
- `git diff --check`: exit 0.
- Real FFmpeg signal checks cover entry/exit silence, source phase across cuts, a growing
  envelope, actual rather than draft durations, no-score output, invalid anchors and
  full build-reel assembly without a default BGM file. No provider calls or spending.

## Scope limits

This renderer consumes build-reel's rendered cards. Separately inserted b-roll/outros
and build-screencast have their own assembly routes and are not anchor targets here.
It does not identify emotional events automatically, guarantee musical motif adherence,
separate native soundtrack stems or certify perceptual quality. Observe the accepted
take before setting an event's exact offset. No unrelated audio-processing changes or
media generation/social publishing are part of this feature. Local plugin installation,
dev merge and worktree cleanup were explicitly requested afterwards.

## Final deployment review

The reviewer awarded functional correctness 35/35, compatibility 20/20, actual
audio/timing verification 25/25, storyboard/production consistency 10/10 and
maintainability 10/10. Required checks passed and critical/high/medium/low findings
were all zero. No perceptual listening approval is claimed by this code review.
