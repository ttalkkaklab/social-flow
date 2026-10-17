# Unattended lifecycle

Use for growth-loop calls to autoproduce. Story writing lives in storyboard/SKILL.md.

## Authorization and limits

Read `data/<channel>/growth/<platform>/growth-plan.md`, its `autoproduce` block and
`data/<channel>/growth/autoproduce.json`. Honor `enabled`, `topic_source`, topic areas and
banned subjects, `daily_produce_cap`, `max_cost_per_video`, `daily_cost_cap`, `weekly_cap`,
`mark_queues` and standing renderer/spending choices. Directory model settings override
old model recommendations. Missing production settings defer dependent production;
do not infer a standing choice. Publishing is outside this skill.

At most two attempts per caller platform per day, or the lower plan cap; count successes
and failures. Human invocations are outside that automatic count limit. Cost limits are
channel-wide across callers. Check them before paid work and update actual receipts as it
runs. An estimate must not replace a cost receipt.

## Channel lock

Use the channel-wide `growth/.autoproduce.lock` directory, acquired atomically with `mkdir`.
Write an ownership token, process/session identity and start time in its owner record.
If another live worker owns it, skip this tick. Age alone is not proof that a long-running
worker died: verify ownership/liveness before reclaiming a stale lock. Release in cleanup
on success, failure or interruption, but only if the token still matches this run.
Never delete another run's lock.

## Topic selection

Use the explicitly supplied topic. Otherwise follow the standing source:

- `pool`: choose an unused approved entry; an exhausted pool defers this tick.
- `keywords`: use the configured query and plugin search lane only when the plan chose it.
- `scout`: use the chosen topic in the channel's `growth/keywords/market-keywords.md`;
  missing or stale research needs topic-scout, not an invented trending claim.

Check topic fit and the plan's exclusions. For automatic discovery, skip an off-topic
candidate; after two rejected candidates report the exhaustion rather than spending on
unapproved territory. Explicit human requests already authorize their stated topic.

Run the installed `check-duplicate.py` with channel directory, candidate title and core
message; pass the plan's duplicate threshold if configured. Exit 0 is new, 2 is a suspected
duplicate, 1 is unavailable and 3 is invalid input. Unavailable is not a new-topic verdict.
Automatic runs skip suspected repeats; a human's explicit follow-up request may deliberately
revisit a subject. Follow the profile's slug rules and avoid an existing episode directory.

## Completion

Keep actual daily/weekly counts, costs and `producedTopics` with caller provenance. Preserve
failed attempts. Queue only the platforms covered by `mark_queues` and the standing plan;
a local request alone does not queue or publish anything. Record `auto_produced: true` and
`approved_by: autoproduce/<caller>` as automatic provenance, never human approval.
Technical delivery failures and missing spending/publication authorization are actionable;
a creative score alone is not a queue hold. Report unresolved findings with artifact paths,
actual cost and queue changes. Release this run's lock in all exits.
