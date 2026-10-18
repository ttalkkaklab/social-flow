# Causal dialogue and situational comedy — local improvement run

User request: research story craft, improve the plugin, update the Mac installation,
rewrite the same first episode without images, then iterate independent adversarial
content review until strictly greater than 95 with no critical causal defect.

Research precedes the change: [findings and sources](../../research/2026-10-18-causal-comedy/README.md).
The source already contained story-first and blind-reading principles. This revision adds
practical line triggers, recognition versus inference, comic consequences, and a whole-story
revision read. It gives content-only work an explicit branch that defers production planning.
No new creative execution gate, runtime schema, paid generation or publication is introduced.

The installed package keeps version 0.118.0 with a local source overlay. Both active Mac
caches (Codex and Claude Code) receive only the changed skill/reviewer files with backups
and before/after fingerprints. This is not a marketplace release or a claim that running
host sessions reload skills automatically. The new author explicitly reads installed files
and records hashes. See installation receipts in this directory.

The author owns the content. The coordinator fixes the reusable plugin rather than writing
benchmark scenes. Reviewers are fresh, read-only and receive the action/dialogue export
before canon. They do not receive the target score or previous verdicts. The fixed rubric is
causality/comprehension 25, knowledge/motivation 20, situational comedy 20, setup/payoff 20,
dialogue/rhythm 15. Image, speech and rendered acting quality are outside this score.

Episode drafts and review records are local artifacts under:
`/Volumes/data/story/meleon/data/gyeongseong-family-farce/episodes/ep01-fake-bride/content-rewrite-20261018/`.
Original storyboard and media are preserved. Each iteration has its own directory.

Validation of the first change: `npm run check --prefix server` passed all 2,354 tests;
skill-lint passed 17 rules across 21 skills. No new executable behavior was introduced,
so behavioral evaluation cases were added to the existing skill evaluation document
instead of tests asserting prose. Korean research prose passed its style check and D8 scan.

Independent plugin review found an ambiguous content-only branch; it was clarified and
reinstalled before author delivery. Evaluation status and final installation evidence
are recorded below and in the installation receipts.

## Iteration 1

The first installed-skill draft contains 5 scenes and 116 events. Independent review:
88/100 (23/25, 16/20, 18/20, 18/20, 13/15), P0 0. This does not meet the user's criterion.
The entrance and recognition chain worked; weak points were the benefit of buying time,
the costly agreement's specific motive, handling a foreseeable exposure, and repeated
comic refusals without escalation. The reviewer preserved a blind reconstruction before
reading canon. The author separately noted a small paper-custody ambiguity.

Iteration 2 adds general guidance on proportional motives, the present benefit of a
time-buying plan, precautions disrupted by another character, and variation in repeated
comic beats. It does not prescribe a replacement scene or expose the benchmark answer
in the plugin. The author reloads this installation before revising the complete story.

## Iteration 2

The second draft contains 5 scenes and 133 events. A fresh independent reader scored
94/100 (25/25, 18/20, 18/20, 20/20, 13/15), P0 0. This still does not meet the criterion.
The reader independently checked the channel profile and six identity sources; the
canonical relationships and secret timing were preserved. Remaining deductions concern
the goal's emotional weight, an explicit announcement of the coming mishap, a redundant
envelope gesture and prolonged agreement paperwork. These are not critical causal errors.

Iteration 3 adds an economy pass after clarity repairs and an economical behavioral cue
for a goal's personal significance. The rubric and reviewer instructions remain unchanged;
the response is to improve the authored work, not lower the standard or prescribe a
benchmark-specific answer. Anticipation is still valid and essential context must survive.

## Iteration 3 and result

The third draft contains 5 scenes and 134 separately identified action/speech events.
The count is not a target runtime or a claim that every event needs its own shot. A new
independent reviewer scored 96/100 (25/25, 19/20, 19/20, 20/20, 13/15), P0 0. This exceeds
95 under the unchanged content rubric, so the requested loop ends. The reviewer first
saved a blind reading, then compared the actual profile and six character identity files.
No prior score or target was provided. All three drafts and reviews are retained locally.

The reviewed source is run-03/content.json, SHA256
`4cd3c11f9faaf475384826fb3e9ab385a92bc5f790c28420a614c4d751f1daef`.
Its generated blind.md and index.html contain every event in the same order, with valid
speaker/addressee IDs and no image/audio/video elements. The review's hashes bind to the
delivered files. Original storyboard source hash is unchanged. New media calls: zero.

The four remaining deductions are minor: specificity of hiring trust, a less inventive
late interrogation exchange, the order of a doorway reaction, and an unprompted reversal
of a letter handoff. They are retained in the delivered review, not relabelled as fixed.
This is a content-plan judgment, not measured laughter or certification of acting/rendering.

Final installation: install-03.json and installed-03.json bind the changed four files in
both Mac caches to the repository. The author reloaded the installed reference before
run-03. Final skill lint and diff checks pass. The runtime remains unchanged from the full
2,354-test passing run; no redundant prose-assertion tests were added. Final draft, canon
and author notes pass the Korean style checker; changed repository prose has no D8 findings.
