# Research material before choosing the story

## Contents

- [Inventory before searching](#1-inventory-before-searching)
- [Verify the search connection](#2-verify-the-search-connection)
- [Read the event](#3-read-the-event-not-just-the-search-snippet)
- [Choose enough material](#4-choose-enough-material-for-a-decision)
- [Transform and carry the material](#5-transform-and-carry-the-material)

Use this for new story-led synopses, scenarios and boards, including fiction inspired by
real events. Read the user's existing material first. A settled supplied premise, a small
revision or an explicit invention-only request does not need unrelated browsing. An explicit
request to research or supplement cases does require searching and reading sources before
presenting a researched recommendation. This is authoring guidance, not a tool gate.

## 1. Inventory before searching

Read the channel profile, character identities, world rules, canonical prior endings and
the local research directory. Summarize what the collection already covers, what was only
a search lead and which missing details would change the story. Keep old case IDs and
source links; add dated supplements rather than replacing another author's collection.
Prior drafts and imagined character arcs are not events that already happened.

Search for mechanisms, not only similar settings: rationing exceptions, hidden reserves,
information control, disputed rescue decisions, unequal risks, care work, refusal to work,
control of tools, newcomers, exit rights, private bargains and changing alliances. Also look
for cooperation, repaired trust and evidence against the attractive sensational account.
Choose the mechanisms that fit these characters; do not make every story use all of them.

## 2. Verify the search connection

Use the plugin's research tools: `mcp__social-flow__serp_web_search` /
`mcp__plugin_social-flow_social-flow__serp_web_search`, or the configured Naver lane.
A key in a shell is not evidence that the connected MCP process received it. If the server
reports a missing key, distinguish that from an invalid key or exhausted quota. On Codex
STDIO, check that `SERPAPI_API_KEY` is in `mcp_servers.social-flow.env_vars`; persist variable
names only. When setup is authorized, update the relevant connection and verify an actual
search on a fresh plugin MCP process with the whitelist. An existing session stays stale
until reconnected. Never print a key or call an external search MCP as a substitute.

If neither SerpApi nor the Naver pair is available to the server, host WebSearch is the
allowed search fallback. Keep failed requests in the research log; no silent fallback,
identical-query retry loop or claim that configuration alone proves a working connection.
Use `site:domain` for domain searches; check returned domains and relevance. A successful
HTTP response or a large result count is not useful research by itself.

## 3. Read the event, not just the search snippet

Start with institutions, archives, original research, participant records and direct
interviews. Follow leads to the actual page or document. A snippet is a discovery lead,
not confirmation of a detailed incident. Note who produced a record and their involvement;
an official account and a participant's recollection can each omit or dispute details.
For a contested incident, seek an independent account or correction before using the claim.
If a source cannot be read, retain it as an unchecked lead and omit unsupported detail.

Record compact case notes in the existing collection or a dated local supplement:

| Item | What to retain |
|---|---|
| Identity | Stable case ID, place, period and type of isolation or external control |
| Evidence | What the opened source actually supports; direct URL, title, publisher and access date |
| Decision | Who wanted what, what constrained them, available alternatives and the choice made |
| Consequence | What changed immediately and later; distinguish sequence from proven causation |
| Knowledge | Who knew what and when, only where the source establishes it |
| Limits | Disputed numbers, absent testimony, external support and important differences from the fictional world |
| Invention | Proposed fictional dilemma, affected character and changed circumstances, explicitly labelled as invented |

Do not invent motives, quotations, sabotage, romances or medical facts to make a real case
more exciting. Allegations stay allegations. A movie adaptation is not corroboration of the
event it dramatizes. A collection of disasters cannot prove that isolation causes cruelty;
include a relevant cooperation case or counterexample when testing that premise.

## 4. Choose enough material for a decision

Search in batches with different purposes: broaden possible mechanisms, deepen promising
cases, then challenge the preferred explanation. Keep query text, useful sources, rejected
leads and unresolved questions. Stop when another search is unlikely to change the material
choice, not when a fixed search count or page count has been reached.

Before drafting, the packet should let the author compare genuinely different conflicts,
trace the chosen event from trigger through choice to consequence, and explain a relevant
counterexample or limitation. If all results repeat one anecdote or only name disasters,
research is still shallow. Target the gap. If access or quota prevents filling it, report
what is missing and label any resulting draft as provisional; never claim exhaustive work.

Present a short material shortlist: source case, verified event, possible fictional choice,
why it fits this cast, what must change and why it is selected or deferred. Avoid a catalogue
dump when only a few cases affect this episode. Preserve unused leads for later episodes.
Keep research local under `data/<channel>/research/`; carry selected case IDs and links in
the existing scenario or `storyboard.md` notes. No new mandatory schema is needed.

## 5. Transform and carry the material

For fiction, borrow a conflict mechanism and build new people, choices and consequences.
Research inspiration does not automatically change `kind: fiction` to `adapted`. Use
`adapted` when depicting an identifiable actual event; preserve its documented/inferred/
invented boundary. Never splice separate historical incidents into one claimed true event.

Before a synopsis, check the world's actual resources, distances, tools, skills and social
rules. A hidden reserve needs a plausible origin, custodian, quantity and discovery path;
do not create shortages or instant recoveries just to force a betrayal. Keep unapproved
world additions explicitly proposed. The narrative still follows the user's episode
calendar, cast limits, narrator placement and ending contract.

For a world with hidden recurring rules, keep the author's mechanism separate from each
character's observations, hypotheses and verified predictions. Record arrival and discovery
separately; a discovered object may have appeared earlier. Give the protagonist accessible
clues and a test with a cost, rather than unexplained certainty. Preserve established counts,
separate spawn locations and unrevealed information across the synopsis, scenes and shots.
Specific fictional rules belong to that project's world notes, not this general workflow.

Use the selected material to create a consequential choice in the synopsis, an observable
decision and response in the scenario, and readable evidence in the board. Source notes do
not substitute for that action. Relief, humor and generosity can establish what later
conflict threatens. Research quality and audience enjoyment are separate judgments.
