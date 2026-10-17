# Story-first authoring — local release record

Current local candidate: `0.115.0-story-first.4` (supersedes `.3`). This is a local development update for the
Mac's installed Codex and Claude Code plugins, not a remote release.

The earlier workflow could produce isolated spoken lines whose causal connections
existed only in writer notes. It could also omit listener reactions and independent
physical action from speech-led video plans. The change makes complete scenes the
authoring unit, divides them into shots after their dramatic content is clear, and
uses the resulting action/dialogue plan to derive timing. No default duration or
shot-count quota should override an essential causal cue or reaction.

Adversarial review starts with audience-visible actions and audible dialogue before
reading the full explanation. This user's requested quality loop uses a frozen
100-point rubric and requires every tested case to exceed 95 with no critical
causal or visual-plan defect. The number is a benchmark for this task, not a new
automatic prerequisite for unrelated plugin execution.

Local benchmark artifacts live outside the repository under
`/Volumes/data/story/meleon/data/storyboard-quality-eval-20261017/`.
They preserve the frozen rubric, topic briefs, installed-plugin hashes, author
invocations, versioned boards and independent critiques. Cases cover period
melodrama, modern dialogue comedy, a silent emotional story and a fair-clue
mystery. A fresh holdout follows the required cases when they pass.

The runtime validation completed with `npm run check`: 1,984 tests across 188
suites passed. Focused runtime checks also passed (109 checks and a final
23-check duration/direction run). The installation and authoring-evaluation
status are recorded separately with the local benchmark artifacts; this note
does not imply a completed benchmark or an already-restarted host session. No paid media generation or publishing is part
of this run. Storyboard scores do not certify rendered images, audio, performances
or continuous video playback.

## Local candidate 0.115.0-story-first.2

The second candidate removes remaining production guidance that contradicted
whole-scene performance planning and strengthens the visual handoff for legible
physical action and clean footage. Source-prompt regression expectations were
updated for the intended no-visible-text instruction. The full build and contract
suite passed again: 1,984 tests, zero failures.

At the user's request, benchmark authoring now runs sequentially and may resume
existing drafts and author sessions. Independent reviewers remain fresh. The
frozen scoring weights, strict greater-than-95 threshold and zero-critical rule
are unchanged. Case C's .1 storyboard received 96/100 with no critical defects;
its original board and review are preserved. That result covers its plan only.
Case B resumes from a separate copy of its .1 checkpoint after the .2 install.

The `.2` native local update completed for both Codex and Claude Code. The
source, versioned snapshot and both installed caches match on the exercised
skill/runtime files. A fresh Codex prompt resolves the `.2` storyboard skill;
the installed MCP bundle initialized with `.2`, listed its tools and read an
existing board. B's copied continuation is ready under run-02. This release
record was updated after installation; the immutable installed package retains
its pre-install release note. Actual installation receipts and file hashes live
in the local benchmark `installation/` directory.

## Local candidate 0.115.0-story-first.3

This candidate adds practical guidance for the order of mouth actions and spoken
lines, and for keeping consequential objects readable in the framing. ASTRA
video plans warn when the prompt exceeds its actual 2,000-character request
limit. The warning does not truncate the plan or impose a creative gate.
The full build and tests passed: 1,986 tests, zero failures.

Case B's .2 storyboard received 97/100 with no critical defects. Case C's .1
96/100 result and both accepted boards remain unchanged. Case A resumes from
a separate copy of its .1 37-shot draft after the .3 native local update.
The local installation receipts record actual host versions, loaded skill paths
and bundle hashes; they are the source for installation completion status.


## Local candidate 0.115.0-story-first.4

Fresh code review reproduced three production handoff gaps: unchanged video bytes
could acquire a new performance revision, silent shots skipped action timing,
and performance text could be appended after the Seedance prompt validation.
The follow-up preserves stale provenance, validates new silent timelines against
supplied audio duration, and validates the complete adapter prompt. Legacy untimed
boards retain their existing path. Optional event `videoDirection` carries an
adapter-language rendering while preserving the original authored action.

The four frozen storyboard cases completed independent plan reviews: A 96,
B 97, C 96 and D 96, each with zero critical findings. These scores apply to the
reviewed boards and do not certify generated media. The follow-up changes neither
the frozen boards nor their scores. The final build and contract suite passed 1,992 tests across 188 suites; skill
lint passed all 16 rules across 21 skills. Independent code re-review reported
zero critical, high, medium or low findings after the focused fixes. The research
checker now pins its archived authoring contract and verifies that the current
skill links it, without restoring old research quotas to new story authoring.
Installation evidence is recorded separately with the benchmark artifacts.
