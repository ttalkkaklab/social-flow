# Independent final adversarial evaluation

Evaluator: `/root/automation_audit`, 2026-10-16. This evaluator did not implement
the changes. Scope: `loop.md` plus `scope-update.md`; local storyboard planning,
not generated episode imagery, audio, video or publishing.

**Result: 96/100, zero unresolved P0 or P1 within the reviewed scope.**

**Subsequent CI status — locally reverified:** Additional standalone CI selftests
exposed assertions tied to the retired gating policy. The addendum below assesses
their fixes and the new installation. The final local evaluation remains 96/100;
the final commit must also pass remote CI before merge. The earlier 1,848-test
result alone was not evidence that every standalone CI command had passed.

| Criterion | Score | Evidence and limits |
|---|---:|---|
| Inspection functionality | 25/25 | Installed `storyboard_read` returns 27 ordered shots, silent actions and attributed speech; selected s0021 correctly returns s0020/s0022 neighbours. STORY, production, document, props and media paths are available. The inspector covers all five requested domains and explicitly separates plans from viewed media. Local character images opened successfully. Each of the five rubric items earns 5. |
| Installed regeneration evidence | 25/25 | `install-final.json` records three installations with 690 verified files each; obsolete portal files were removed with backups. The final fresh MCP process serves the installed bundle and all three calls pass. Source scenes and all three active-character identity files were independently hash-compared. Candidate/selection generation is reproducible in `generate-episode.mjs`; the final board was regenerated after earlier findings. Each item earns 5. |
| Domain and story quality | 22/25 | Character plan 4: source clothing and facial references are available, but existing body templates intentionally lack facial detail and must be paired with face references. Background plan 4: entrances, locked inner door, east/west dry/wet areas and witness sightline are explicit, but remain unrendered geometry. Prop plan 5: notebook disclosure, payment envelope, room key and blank-paper bundle have observable custody transitions; returned benefits stay at the office. Narrative 5: confession does not undo the arrest or buy forgiveness; returning both benefits precedes a supervised low-risk task. Flow 4: all 27 cuts connect, but 119 seconds in a short-form board is a dense reading experience whose pacing cannot be certified before production. |
| Objective regression gates | 15/15 | Release check log records 1,848 tests, zero failures/skips; its hash matches `verification-final.json`. Independently reran skill-lint (16 rules, 20 skills), focused guidance/assembly/storyboard tests, and both original P1 reproductions. |
| Instructions and scope | 9/10 | Local access and no invented observation/approval are explicit; generation and publication remain outside scope. Review HTML is usable at 1440 and 390 widths. Deduct 1 for the HTML label “위반 31건”, which groups ungenerated-artifact readiness items under violation wording despite nonblocking CLI/MCP behaviour. |

## Original adversarial failures rechecked

1. **Creative metadata blocked production (P1, fixed).** The original minimal
   generated-video fixture with `imperceptible pan`, no previz selection and no
   `visual.why` now returns no execution errors from production mode/routing.
   Focused tests retain blockers for unsupported renderer/effect/provider and
   contradictory `cameraFixed` payloads. Advice does not fabricate approval.
2. **Assembly waived duplicate stable references (P1, fixed).** The original
   two-shot fixture with duplicate `s0001` now throws an execution error before
   assembly. Missing media and invalid timing remain execution constraints.

CTA presence, position, wording and share-line enforcement no longer determine
whether an authorized storyboard operation can proceed. Useful creative checks
remain advisory, with shared skill guidance explaining how to improve the result.
Actual paid/external-action authorization remains separate.

## Actual inspection coverage

Read the complete ordered story and final installed MCP responses. Opened both
final desktop/mobile captures and the following six local reference images with
the native image reader: `minjae/body.png`, `minjae/face.png`,
`yeonhwa/body.png`, `yeonhwa/face.png`, `jang-seokju/body.png`,
`jang-seokju/face.png`, under the final channel's `assets/characters/` directory.
Body sheets establish clothing/silhouette; separate face sheets establish facial
features, including Minjae's glasses. Back images were not opened by this evaluator.
No newly generated shot image exists, no video playback was inspected, and no voice
was listened to. Blank preview frames are expected planned media, not viewed outputs.
The old portal-image tests are not evidence for this local-only final build.

Final artifact directory:
`/Volumes/data/repository/ttalkkaklab/ttalkkak-story/social-flow/data/review-lab-melusine-20261016/final-guided/gate-webtoon/episodes/gate-beyond-rewrite/storyboard`

Independently checked hashes:

- Installed bundle: `114ec9ebf8e995344b3345567df18819adde2eb613d8711ee7cafc22d617bf5c`.
- Final scenes: `cf947db47b894d43220ddef555121d8b35f59e63149ad04040c5807ed3892a36`.
- Preserved original scenes: `c352263296665cc1fe3dfbb098a1ed1d1aafcc797bce1ce3416b2e7244ab349b`.
- Release check log: `5f3712a0e51c8bb4e79ee84e126a1347b9a1fa384039f2d1d00a7b133826247c`.

The score evaluates the plugin and a reviewable planning artifact. It does not
certify unseen visuals, historical costume accuracy, final pacing or speech quality.
The minor readiness-label wording can be improved without imposing another approval
step or inventing a passing media review.

## Addendum: standalone CI alignment

The evaluator independently inspected the subsequent diff in `pipeline-lint.js`
and `check-scenes.js`. Pipeline lint no longer counts obsolete approval gates or
requires their old headings. It checks actual shared-guidance links, honest review
state, prior-consent reuse and external-action boundaries instead. Other reviewer,
lane and stage hand-off rules remain. Scene selftests now expect creative findings
as advice; camera advice is collected and surfaced rather than silently discarded.
Missing scene references and missing executable speech text still fail. No test was
deleted merely to hide an execution failure.

Direct reruns by this evaluator passed:

- `node skills/storyboard/references/check-scenes.js --selftest`.
- `node skills/platform-guide/references/pipeline-lint.js --selftest`.
- `node skills/platform-guide/references/skill-lint.js --selftest`.

The new `/tmp/melusine-ci-aligned-check.log` finishes with 1,848 passes, zero
failures and zero skips; SHA-256 is
`c36b4f861e30d3b501085a834fe8ab5b8c11c6304846d390471ee08467bae05c`.
The parent additionally reports the remaining standalone CI commands and dist
freshness check passed. This evaluator reviewed the workflow command inventory;
those remaining executions are parent-provided evidence, not independent reruns.

`install-ci-aligned.json` records three fresh installations, 690 verified files
each. This evaluator hash-compared both changed reference files against the
installed Codex copies. `installed-ci-aligned.json` records a fresh installed MCP
process with all three calls passing and no portal tool support. The installed
bundle hash remains `114ec9ebf8e995344b3345567df18819adde2eb613d8711ee7cafc22d617bf5c`;
the changed files are loaded references outside that bundle.

The current board is in the same preserved artifact tree under `final-ci-aligned`
instead of `final-guided`. Its scenes hash is
`093d992165435e1149f134f3e930513a90f8d58d5fdc495b03e08d8c1b155ce6`.
The installed response still contains 27 playback shots, and its complete STORY
object is byte-equivalent after JSON serialization to the previous evaluated
response. Earlier visual observations remain observations of the `final-guided`
captures and reference images; no fresh visual-generation claim follows from this
code-only alignment. The P2 readiness-label wording and all media limitations
remain unchanged. No additional score deduction or inflation is warranted.
The evaluator subsequently hash-compared both new `final-ci-aligned` desktop and
mobile captures with the previously viewed files: both are identical. The final
`verification-ci-aligned.json` agrees with the independently checked helper,
bundle, board and test-log evidence.

**Final independent local result: 96/100, no unresolved P0/P1 in the reviewed
scope. Remote CI on the final commit remains a merge prerequisite, not a result
claimed by this report.**
