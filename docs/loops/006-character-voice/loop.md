# Character voice identity convergence

Target: connect character age, explicit vocal gender, timbre and speech/personality
evidence to casting and supported synthesis controls. Generate real Gemini samples
for the seven canonical Meleon characters and obtain adversarial audio evaluations
of at least 95, then merge to dev and clean up the task worktree.

The user authorized Gemini TTS with a total USD 20 ceiling. This spending ceiling
replaces an unbounded retry policy; stop before a call whose reserved cost would
exceed it. Preserve original identities, pinned ElevenLabs voices and recordings.
Generated candidates are recommendations until the user explicitly selects one.

## Frozen implementation rubric

| Criterion | Points | Evidence | Blocking |
|---|---:|---|---|
| Identity target, metadata comparisons, shared persistent baseline, opt-in character-fit evaluation all reachable | 40 | 10 per capability with code and exercised call | yes |
| Build, full contract suite and skill lint exit zero | 25 | command transcripts | yes |
| Regression tests cover changed identity, missing/conflicting metadata, baseline with acting, provenance, overlength and wrong character | 15 | tests exercising each path | no |
| Actual requested media and truthful hash-bound review evidence for all seven characters | 10 | local manifests, audio hashes and reviewer receipts | yes |
| Scope, saved model settings, user selection and spending ceiling preserved | 10 | diff and audit records | yes |

Implementation completion requires >=95 and zero blocking defects.

## Frozen audio rubric

`tts_review_acting` with `characterTarget`: character fit 40%, accuracy 20%, acting
15%, naturalness 15%, audio quality 10%. Character fit assesses specified vocal
gender, plausible age band, timbre and audible character. PASS requires total >=95,
characterFit >=95, full listening, confidence >=0.9, consistent timestamped
deduction evidence and no major/critical issue. An evaluator's uncertainty is not
a reason to raise or lower scores. Do not reroll an unchanged take for a better score.

Audio and personal channel artifacts stay outside the plugin repository at
`/Volumes/data/story/meleon/data/voice-fit-eval-20261017/`. Provider metadata is
casting evidence, never proof of an audible match. Scores describe a model's audio
judgment, not human approval or a guarantee for unseen future lines.
