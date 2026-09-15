# Speech warnings and human approval

`tts_generate_checked` still generates, listens and retries as before, and `build-reel.sh`
and `speedup.sh` still run the checkers. What changed (user directive, 2026-09-15): a failed
verdict is a warning for the user to decide on, not a veto. This contract takes precedence
over instructions elsewhere that require a PASS proof before assembly or delivery.

Two gates, same shape as `assembly-video-hitl.md`:

| Gate | Runs in | Report | Approval |
|---|---|---|---|
| scene takes (`check-tts-quality.js`) | `verify-build-plan.js` before assembly, `verify-assembled.js` after | `.work/tts-warnings.json` | `.work/tts-approval.json` |
| final listening (`check-final-tts.js`) | `speedup.sh` before `delivery-proof.js` | `.work/final-tts-warnings.json` | `.work/final-tts-approval.json` |

## Scene takes

A clean check proceeds. With findings the check throws `TTS checks need HITL` and writes the
report: one line per card with the checker's reason and what the proof says — status, attempt
count, the four scores, the failures, every reported defect with its time, what was heard and
what was expected, and the blind transcript. Show the user the affected cards and those lines.
Offer **proceed with these takes** (assemble the current WAVs), **fix first** (regenerate the
affected scenes, correct the narration or a pronunciation dictionary), or **stop**. Ask with
the host's HITL tool. A request to make a video is not approval of warnings the user has not
seen. An explicit approval already given for these exact warnings and takes is sufficient; do
not ask twice.

After the user answers, record the actual answer or its conversation reference and rerun:

```bash
node "$REF/check-tts-quality.js" approve .work 'User approval message/reference'
node "$REF/verify-build-plan.js" .work storyboard    # or build-reel.sh, which runs it
```

The approval binds to the WAV bytes, the proof files and the normalized narration of every
generated card plus the exact warning list. A regenerated take, an edited proof, a changed
sentence or a new finding invalidates it and the updated warnings are presented again.
`build-plan-check.json` keeps the report as `ttsGate`, and the failed proof still travels in
the media provenance — it is not rewritten.

These stay errors, not warnings: a WAV that is missing, a card order that differs from
SCENES, and a generation or playback speed record that does not match the episode's explicit
speed request (`tts-speed.md` is its own authorization).

## Final listening

`speedup.sh` runs the final review on `reel-fast.mp4`. A PASS proceeds. A `fail` verdict
writes `.work/final-tts-warnings.json` with the scores (including continuity), the failures,
each defect with its time, and the continuity evidence, and stops for HITL. An `unverified`
review (missing key, outage, malformed answer) is still an error: there is nothing to decide
on until the review has run.

```bash
node "$REF/check-final-tts.js" approve .work 'User approval message/reference'
node "$REF/check-final-tts.js" .work
node "$REF/delivery-proof.js" .work "$SPEED"
```

Rerun those two commands, not `speedup.sh` — a re-encode changes the media bytes the approval
is bound to. The approval binds to the final media bytes, the narration and the exact warning
list, and `delivery-proof.json` carries it as `finalSpeech.approvedWarnings`. `publish` verifies
that approval against the delivered video the same way it verifies a PASS.

## What the approval does not do

Never run `approve` before the user answers or infer consent from elapsed time. Do not write
PASS reviews, lower thresholds, edit proofs or reset attempt budgets to make a gate look
clean. Approval covers assembly and delivery of the current takes only; it authorizes neither
new paid generations nor publishing, and it does not replace the copy or video approvals.
Unattended runs with unapproved warnings wait for the user. Report the approved warnings
alongside the output; do not use an accepted warning as a reason to stop again.
