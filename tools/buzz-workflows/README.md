# Buzz reaction gates

Local operations tooling; this does not add a plugin skill or an MCP tool.
운영 훅 설치는 맥미니 `~/.buzz` 전용입니다.
The three kickoff jobs and channel watcher run on that Mac mini; do not install
these hooks on the MacBook. The standalone helper's Python requirements below do
not expand the deployment scope. Before editing any target, the installer collects
all missing files and exits with `missing: <path list>`; it never skips missing
hooks or installs only the available subset.
Requires Python 3.9+ on macOS/Linux and the authenticated `buzz` CLI. The caller's
identity must see the channel, create workflows and resolve the literal leader name
to exactly one channel member. Cleanup requires permission to delete the workflows
and channel. Run provisioning and cleanup with the same operational identity.

W1 `approval` installs ✅/🔁 with an exact `trigger_author` filter for the owner.
W2 `work` installs 🔍/🚀/🏁. These send threaded requests to the named leader; they do
not approve, merge, deploy or resolve tasks themselves. 🔍 accepts reactions from the
owner and 리더(푼); 🚀 and 🏁 accept the owner and both leaders. 🔍 intentionally differs from the agents'
automatic 👀 and 💬 markers: those reactions on workflow-authored messages cannot
retrigger the review gate. 🚀 and 🏁 requests explicitly say that a reaction is not
approval. `--review-leader` can route 🔍 to the opposite team's leader. The other two
go to `--leader` (default 리더(푼)).

```sh
python3 tools/buzz-workflows/install.py             # preflight all local hooks
python3 tools/buzz-workflows/install.py --apply     # install after review
python3 ~/.buzz/bin/buzz-workflows.py ensure --channel UUID --profile approval
python3 ~/.buzz/bin/buzz-workflows.py ensure --channel UUID --review-leader '리더(맥북)'
python3 ~/.buzz/bin/buzz-workflows.py close --channel UUID
```

For manually opened task channels, add the required people and leaders first, then
run `ensure` before sending the kickoff. Use `close` instead of direct channel deletion.
Project-linked channels still use the project's owner-reviewed creation flow.

The installer patches the local AI-news, Threads and Gemini-assets kickoff tools,
the Threads completion path, and the existing channel watcher. It checks every
replacement and script syntax before writing; changed local contexts stop installation.
It preserves originals under `var/workflows/backups`. Re-running is safe. The watcher
only opts W2-managed channels into deletion; other channels keep their existing policy.
The helper must remain installed while the hooks call it. Rollback restores backed-up
files and removes the helper only after all callers have been restored.

Definitions are JSON (valid YAML) with stable `buzz-gates/PROFILE/NAME` names.
The relay is the registry: an interrupted install discovers already-created gates on
retry. A per-relay/channel file lock prevents concurrent local registrations; multiple
hosts must not provision the same channel concurrently. Duplicate definitions stop
with an error. Failed workflow cleanup retains the channel. `ensure` recognizes the
emergency name `buzz-gates/work/review-disabled` as the review gate and updates that
same workflow ID in place. `remove` also treats it as review, while preserving every
other unrelated workflow.

`--test EVENT_ID` confines W2 triggers to one message and replaces action instructions
with a request to record receipt. Use real 🔍/🚀/🏁 reactions and collect the emitted
workflow messages plus the leader's replies; a successful trigger request alone does
not prove wake-up. Delete test workflows afterwards. `workflows runs` is not evidence
on relays that do not emit run events.

Validation: `python3 -m unittest discover -s tools/buzz-workflows -p 'test_*.py'`.
The live rollout additionally requires `workflows list` on all six project homes and
one actual leader response for each of the three W2 reactions.

The six deployment targets are listed in `project-homes.json` (bot.ttalkkaklab.com).
Run the approval command once per UUID using an authorized member identity; do not
substitute another account's credentials. A missing channel stops provisioning.
For deployment by a different operator, reconcile existing workflow ownership before
updates: workflow deletion may require the creating identity or channel administration.

Watcher cleanup uses `close --archive-unmanaged` to retain the previous policy for
unmanaged channels. A per-channel `.closing` marker preserves deletion intent if
workflow cleanup finishes but channel deletion fails, so the next run retries deletion.
Keep `var/workflows/gates-locks` when resuming failed cleanup.

`workflows delete` returning `accepted: true` proves only that the deletion event was
published. It does not prove that the engine applied the deletion. The relay can keep
the definition event visible in `workflows list/get`, so presence in those reads and
runnability are separate facts. Cleanup first renames each managed definition, guards
its only step with `if: false`, sends delete, then reads the channel workflow registry
again without triggering anything. It reports success only when no exact managed gate
name remains; retained renamed records are inert history. A failed readback retains the
channel. `ensure` re-upserts known IDs, including the emergency review-disabled name.
This behavior was verified against the relay and Buzz
`handlers/side_effects.rs::handle_a_tag_deletion` on 2026-09-27.

The helper's supported Buzz CLI error contract is a JSON object on stderr with
`error` equal to `relay_error` or `auth_error`, and a string `message`. It recognizes
these message fragments: `channel is archived`; `actor not authorized`, `forbidden`,
`not the owner` or `permission denied`; `channel not found`; and `workflow not found`.
Explicit permission phrases are also recognized in non-JSON stderr and in a
`network_error` envelope for compatibility with older CLI and transport failures.
Other non-JSON output, categories and messages are unclassified failures.

The helper reports only fixed error codes: exit 10 `archived`, 11 `forbidden`,
12 `channel_not_found`, 13 `workflow_not_found`, or 1 `failed`, with
`WORKFLOW_GATES_ERROR CODE` on stderr. No relay error text or signed headers are
forwarded. The channel watcher maps 10 to `already` and 11 to `forbidden`, preserving
its existing stop/escalation behavior. Both not-found codes and unknown errors keep
the channel for investigation.
