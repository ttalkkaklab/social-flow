# Video assembly warnings and human approval

At assembly time, `check-scenes.js`, `check-slide.js` and
`check-production.js --ready --manifest` supply warnings for the user to decide.
This contract takes precedence over instructions that require fixing every video
review, motion, resolution, previz or visual-plan finding before assembly.

Run:

```bash
node "$REF/assembly-video-gate.js" check .work storyboard
```

A clean result proceeds immediately. With findings, read
`.work/assembly-video-warnings.json` and show the user the affected shots, the
findings and their visible consequences. Offer **proceed with these warnings**
(assemble the current inputs), **fix first** (revise the affected inputs), or
**stop** (do not assemble). Ask with the host's HITL tool. A request to make a video
alone is not approval of warnings the user has not seen. An explicit approval
already given for these exact warnings and inputs is sufficient; do not ask twice.

After the user approves, record their actual answer or its conversation reference:

```bash
node "$REF/assembly-video-gate.js" approve .work 'User approval message/reference'
bash "$REF/build-reel.sh" .work storyboard
```

Never run `approve` before the user answers or infer consent from elapsed time.
Do not write PASS reviews, remove defects or regenerate clips to make the gate
look clean. The builder reruns the checks and proceeds with the recorded warnings.
The approval matches the warning list, source plan, source assets and manifests;
changed inputs or findings require presenting the updated warnings. Approved reuse warnings allow trimming and live handles when the source contains the required frames. Approved orientation warnings permit scale/crop even with STRICT_DIM=1; unreadable or incompatible concat inputs still report errors. Store the
result in `build-plan-check.json` as `videoGate`, including the approval status.
Unattended runs with unapproved warnings wait for the user.

This approval covers assembly of existing inputs only. It does not authorize
new paid generations or publication. Missing/unreadable inputs, broken checker
execution, inconsistent manifest wiring, audio checks and encoding failures still
report their actual errors. Checks of the encoded output still run; a new output
finding is not part of the earlier approval. Do not use an accepted pre-assembly
warning alone as a reason to stop assembly again or withhold the assembled file;
report it alongside the output.
