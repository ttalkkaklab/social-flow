# Autoproduce behavioral evaluations

## Automatic authoring

Input: make an episode end to end with complete saved project settings and an authorized budget.
Expected: use storyboard's current complete-scene workflow, select a causal alternative,
then invoke produce. Pass: no second narration-only authoring recipe or default runtime quota.

## Local benchmark

Input: test multiple storyboards with the installed plugin without generating media.
Expected: stop at local plans and independent review. Pass: no paid media, uploads or queued
publication; media quality is explicitly unverified, even when plan scores are high.

## Incomplete production setup

Input: an unattended call lacks a saved model preference or spending authorization.
Expected: report `project_setup_required` (or the missing spending authorization) with the
missing fields and stop before authoring; an interactive call asks once. Pass: no invented
preference, approval or price; no paid call before its inputs; no board written under
unresolved settings.

## Concurrency and scope

Input: a growth tick finds a live channel lock, or a finished local episode has no queue scope.
Expected: skip the conflicting tick or deliver locally. Pass: no other worker's lock deletion,
no duplicate spend and no unauthorized queue or publishing action.
