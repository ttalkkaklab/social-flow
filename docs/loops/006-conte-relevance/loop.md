# Conte relevance and repetition

User request: improve the plugin, install it on this MacBook, use the installed plugin
to rewrite the Kim Gu storyboard and independently reevaluate until the image score
exceeds 95. Preserve this install-author-review order on every iteration.

Frozen image rubric: content agreement 50, nonrepetition/new visual information 35,
visual craft 15. Scores describe actual inspected pixels and their sequence, not plans.
Report every shot, its component panels, mean, minimum and unverified count. Success
requires the requested image result above 95 with no unresolved severe mismatch; no
chapter score may be assigned to a shot. Missing images cannot pass. Do not show the
reviewer the target or past scores. Keep all actual verdicts.

Scope: plugin fixes and local storyboard images. No new voice/video generation or
publication. Preserve original board/media in a local backup. Retain historical facts,
qualifiers and narrative scope; recutting is allowed, deleting content to fit spare art
is not. Existing host-managed Codex image selection remains in force.

Baseline evidence: 43 representative images reference 34 unique files. Full editorial
inventory reveals 66 cuts in 43 blocks; 21 blocks have multiple cuts. The first-image
attachment omitted later cut coverage from the visible board. Previous 53.4 assessment
therefore describes representative conte images, not completed video.

Root causes: local attach-longform-plan.cjs selected cuts[0]; a generic nodes() factory
rendered distinct informational needs as the same three-box diagram; chapter review
scores were copied into shots; prior rubric assigned only 10 percent to nonrepetition.
The plugin had semantic-grounding prose but no complete-cut inventory and no complete
editorial-cut display. Reviewer instructions lacked explicit scope aggregation safeguards.

Changes are tested using server npm run check and skill-lint, then installed as a backed-up
file overlay into the active Codex and Claude caches. Each author records installed
entrypoint hashes; installed CLI and renderer produce the reviewable board.

User follow-up: after quality completion merge into dev, pull the main worktree and
remove this task worktree. Main worktree is on dev at
/Volumes/data/repository/ttalkkaklab/ttalkkak-story/social-flow. Its preexisting changes
to .gitignore, AGENTS.md and CLAUDE.md must be preserved. Keep remote task branches.
Dedicated GitHub credential was verified as ttalkkaklab with push permission; no token
was printed or persisted. Reapply that environment only for Git/gh publication commands.

Before receiving the first independent verdict, success aggregation is explicit:
every shot total must be strictly greater than 95 (not merely the mean), all panels
inspected, and no unresolved severe mismatch. This interprets the user's per-shot
assessment request conservatively; the 50/35/15 rubric is unchanged.

Iteration 1: installed overlay before authoring; 43 unchanged narration blocks,45 panels.
Independent native-image review: mean87.21, minimum71, all panels inspected. Main findings:
semantic repetition of cream graphic cards; central-hub topology falsely implying leadership;
book, purse and workbook continuity; generic culture context and open prison gate.
The reviewer preserved the original verdict and wrote a separate scoring-notes.md admitting
that some deductions in12 no-issue/retain shots lacked an observable defect. These notes do
not rescore the board. Later reviewers receive neither earlier scores nor the target;
deductions must identify actual defects rather than reserve points without evidence.

Iteration 2: semantic topology and actual-prop comparison guidance added; installed8 files
to both Mac caches with verified hashes before author reload. All-cut renderer now honors
video source ranges and exposes missing/short media; inventory catches within-block copies
and protocol-relative remote references. Author rebuilds scenes from the installed plugin.
Rebased baseline by fast-forward to current dev b7bdd43 without changing unrelated files.
Full build/contracts:2177 tests in196 suites passed; lint16 rules across21 skills passed.

Iteration 2 independent result: mean99.20, minimum86.5,46/46 panels inspected,
P0=0, P1=1, P2=4. The average does not satisfy the per-shot criterion. Findings:
a redundant final close-up, reused comparison images, return-recipient identity and
book/purse details. The frozen verdict is retained unchanged.

Iteration 3: added exact identifying-detail checks, whole-transaction participant
continuity and explicit removal of redundant inserts without deleting narration or
inventing outcomes. This is guidance only. Skill lint and diff checks pass; executable
code is unchanged since the2177-test passing run. Installed the8-file overlay on both
Mac caches at2026-10-18T00:27:39.758Z, verified every hash, then requested author reload.

Baseline calibration: the earlier53.4 was a preliminary representative-image assessment.
A later auditable independent43-shot baseline review uses the frozen50/35/15 rubric and
scores82.16 (minimum46). Keep both records; use the auditable per-shot baseline in the
comparison table, not the preliminary number as a mechanically comparable improvement.

Integration: merged current dev cabfbc2 without conflicts;2209 tests in196 suites pass.
The intermediate20-file dev-sync cache overlay reconciles incoming motion-production dependencies while
preserving iteration3 author input hashes. This sync does not rewrite the frozen board.

Iteration3 independent result: mean99.49, minimum94,45/45 panels inspected,
P0=0,P1=0,P2=5. s0016=95 and s0034=94 do not exceed95. Preserve this verdict.
Iteration4 adds comparison-anchor economy, connector direction and cropped-garment
continuity guidance. Lint/diff checks pass; executable files are unchanged since the
2209-test run. The20-file overlay was installed in both Mac caches before author reload.

Iteration4: mean99.814, minimum95,45/45 panels inspected,P0=0,P1=0,P2=2.
The helper's vest/lanyard continuity costs5 points at s0043; strict greater-than95
still fails. No earlier verdict is rescored. Iteration5 adds uninterrupted wardrobe
layer/accessory checks and the lesson from rejected micro-edits. Lint/diff pass;
installed both caches before author reload. Executable code is unchanged.

Iteration5 final:mean99.81395348837209,minimum96,45/45 native panels,43/43 shots,
unreviewed0,P0=0,P1=0,P2=2. Every shot strictly above95; criterion achieved.
Minor printed-guide-line(s0007) and garment-texture(s0009) defects retained honestly.
Proceed to user-authorized dev merge, main-worktree pull and isolated-worktree cleanup.
