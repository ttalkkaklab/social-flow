# Unattended lifecycle

Use for growth-loop calls to autoproduce. Story writing lives in storyboard/SKILL.md.

## Contents

- [Authorization and limits](#authorization-and-limits)
- [Setup report before lock](#setup-report-before-lock)
- [Daily cap](#daily-cap)
- [Channel lock](#channel-lock)
- [Topic selection](#topic-selection) · [Scout fallback](#scout-fallback)
- [Cap check](#cap-check)
- [Image check](#image-check)
- [Completion](#completion)

## Authorization and limits

Read `data/<channel>/growth/<platform>/growth-plan.md`, its `autoproduce` block and
`data/<channel>/growth/autoproduce.json`. Honor `enabled`, `topic_source`, topic areas and
banned subjects, `daily_produce_cap`, `max_cost_per_video`, `daily_cost_cap`, `weekly_cap`,
`mark_queues` and standing renderer/spending choices. Directory model settings override
old model recommendations, including a growth plan's `video_model` and `previz_renderer`
fields, which are optional overrides and not prerequisites. Missing production settings
defer dependent production; do not infer a standing choice. Publishing is outside this skill.

Cost limits are channel-wide across callers. Check them before paid work and update
actual receipts as it runs. An estimate must not replace a cost receipt.

## Setup report before lock

An unattended run whose `.social-flow/models.json` is incomplete reports
`project_setup_required` with the missing fields and stops there: no lock, no authoring,
no spending. Interactive runs ask the missing preferences once (project-init). Pending
SNS connections are not missing settings; they only defer publishing.

## Daily cap

At most two attempts per caller platform per day, or the lower plan `daily_produce_cap`;
successes and failures count together, per caller, in `autoproduce.json`'s daily bucket.
No plan raises the two. Human invocations are outside that automatic count.

## Channel lock

Use the channel-wide `growth/.autoproduce.lock` directory, acquired atomically with `mkdir`.
Write an ownership token, process/session identity and start time in its owner record.
If another live worker owns it, skip this tick. Age alone is not proof that a long-running
worker died: verify ownership/liveness before reclaiming a stale lock. Release in cleanup
on success, failure or interruption, but only if the token still matches this run.
Never delete another run's lock.

```bash
G=data/<channel>/growth; LOCK=$G/.autoproduce.lock; TOKEN=$(uuidgen)
mkdir -p "$G"
mkdir "$LOCK" 2>/dev/null || { echo "another loop is authoring — skipping this tick"; exit 0; }
printf '%s session=%s %s <platform>\n' "$TOKEN" "<session id>" "$(date -u +%FT%TZ)" > "$LOCK/owner"
# release — on every exit path, and only while the owner record still carries this run's token
grep -qF "$TOKEN" "$LOCK/owner" 2>/dev/null && rm -rf "$LOCK"
```

Record an identity that outlives one tool call (the session, not a shell pid — each Bash
call is a fresh shell). A lock may be reclaimed only after that recorded session is
verified gone; an old timestamp by itself is not that proof.

## Topic selection

Use the explicitly supplied topic. Otherwise follow the standing source:

- `pool`: choose an unused approved entry; an exhausted pool defers this tick.
- `keywords`: use the configured query and plugin search lane only when the plan chose it.
- `scout`: see the fallback below.

### Scout fallback

Use the topic marked as chosen in the channel's `growth/keywords/market-keywords.md`; with
no mark, take the top row of its keyword table. A file that is missing or older than 14 days
defers this tick and points to topic-scout. Do not invent a trending claim and do not
re-call the scout tool every tick.

Check topic fit and the plan's exclusions. For automatic discovery, skip an off-topic
candidate; after two rejected candidates report the exhaustion rather than spending on
unapproved territory. Explicit human requests already authorize their stated topic.

Run the installed `check-duplicate.py` with channel directory, candidate title and core
message; pass the plan's duplicate threshold if configured. Exit 0 is new, 2 is a suspected
duplicate, 1 is unavailable and 3 is invalid input. Unavailable is not a new-topic verdict.
Automatic runs skip suspected repeats; a human's explicit follow-up request may deliberately
revisit a subject. Follow the profile's slug rules and avoid an existing episode directory.

## Cap check

Before any paid call, write the whole-episode projection to `.work/cost-estimate.tsv` from
the saved models (`PRODUCTION.modelSettings`) and the planned cuts, then run
`cost-report.sh .work/cost-estimate.tsv --cap <max_cost_per_video>`. Exit 0 is within the
cap, 2 is over it, 1 means the verdict is unavailable (an unknown key or an unconfirmed
price — never a pass) and 3 is an input error. Over the cap, reduce the plan under the same
saved models — fewer generated cuts, still-camera or HTML routes for the rest — and report
the reduction; never switch engines and never pad the plan toward a ratio. The saved ratio
in `.social-flow/models.json` is the planning default; the plan's `max_cost_per_video`,
`daily_cost_cap` and `weekly_cap` are the spending authorization the tick may use. Rerun the
verdict on the estimate file before any regeneration. Daily and weekly spend accumulate in
`autoproduce.json`.

## Image check

After the stills are generated, look at each image once (Read) against what its scene
says. A picture unrelated to the scene, a baked-in pseudo-character, readable text or
lookalike glyphs disqualify it: regenerate once under the saved image model within the cap,
then report what remains with the artifact path. These findings never hold the queue.

## Completion

Keep actual daily/weekly counts, costs and `producedTopics` with caller provenance. Preserve
failed attempts. Queue only the platforms covered by `mark_queues` and the standing plan;
a local request alone does not queue or publish anything. Record `auto_produced: true` and
`approved_by: autoproduce/<caller>` as automatic provenance, never human approval.
Technical delivery failures and missing spending/publication authorization are actionable;
a creative score alone is not a queue hold. Report unresolved findings with artifact paths,
actual cost and queue changes. Release this run's lock in all exits.
