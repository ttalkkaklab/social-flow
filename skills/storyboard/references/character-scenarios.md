# Character-led scenarios and whole-story review

Owner directive, 2026-10-16. **Use this contract for every newly authored scenario.** It
supersedes the legacy research quotas, mandatory wow/engine mix, spoken thesis, speech-only
review and mandatory narrator speech in scenario-stage, scenario-craft, story-quality,
storyboard, autoproduce and their reviewer instructions. Existing unversioned scenarios and
story-v1 boards retain their checks; do not silently migrate approved episodes.

## Automation directive (2026-10-16)

CTA is optional metadata in every story/scenario version. Its absence, wording, type,
position, speech and share fields never block authoring or production. The suggestions
below guide writing; they are not approval, score or freeze gates. Continue automatic
work after reporting editorial findings. Missing/stale/non-pass review records mean
unreviewed or unresolved, never an invented pass. Explicitly requested review diagnostics
may inspect those records without turning them into production prerequisites.

## Contents

- [Choose content and expression separately](#choose-content-and-expression-separately)
- [Read the pool, then cast each candidate](#read-the-pool-then-cast-each-candidate)
- [Write three different stories](#write-three-different-stories-not-three-engine-labels)
- [Scenario file](#scenario-file-scenario-v2)
- [Board handoff and review](#board-handoff-and-review-story-v2)
- [Reviewer rubric](#reviewer-rubric)
- [Craft sources and limits](#craft-sources-and-limits)

## Choose content and expression separately

Record `kind: evidence | fiction | adapted` and `expression: narration | dialogue | visual | mixed`.
Use the user's established intent; ask only when the distinction is genuinely unclear.

- **Evidence:** research factual statements and causal claims, including character quotations.
  Search opposing evidence for key claims and current evidence for time-sensitive claims.
  Keep numbered Verified rows in research.md, with actual sources, dates and uncertainty.
  Two independent sources for time-sensitive claims (one official origin may suffice under
  the channel policy). Judge sufficiency by the story's claims, not a search-count quota.
- **Fiction:** invent events, dialogue and worlds. No research.md, minimum searches, Verified
  count, popular misconception or factual wow is required. Check motivation, causal continuity,
  world rules and earned resolution. Any assertion presented as real-world fact still cites
  Verified rows; putting it in a character's mouth does not exempt it.
- **Adapted:** research the real basis and state `adaptationBoundary`: what is documented,
  inferred and invented. Mark each event accordingly. Never pass invented dialogue off as a
  documented quotation. Fictional staging can support a factual explanation in this lane.

For v2 use `check-scenario.js`, not legacy `check-research.js` with its three-wow/search floors.
The checker checks references; the reviewer checks the cited evidence and its limits.
Keep factual evidence distinct from fictional canon. Neither is a requirement for a moral.

## Read the pool, then cast each candidate

First follow [shared character preparation](../../channel/references/character-identity.md#prepare-the-shared-sheet-before-episode-authoring): create/reuse identities and export the bundled sheets before writing candidates. Images may remain pending; no generation or repeated approval is implied.

Read the channel's catalog and character identity documents, including narration characters.
Use `resolve-asset.py --list <channelDir>` and the current character library. Do not invent
an existing character's voice, identity or ID. If no suitable character exists, use the channel
creation workflow before finalizing the cast. No new voice or media generation at this stage.

Create `storyboard/cast.json` as a snapshot of the available pool:

```json
{"characters":[{"id":"mina","source":"../../../assets/characters/mina/identity.md"}]}
```

Paths are relative to storyboard/. Read each source; the snapshot is a locator, not a second
identity file. The checker verifies selected IDs and existing source files. On another machine
restore the channel assets and refresh these paths; do not fake an identity to clear a check.
Candidate cast entries contain `id`, episode `role`, `want`, `voice` (speech style, not TTS
configuration) and `reason` (why this person belongs). Stable identity and episode role differ:
a character may narrate here and act in another episode. A narrator is selected when needed,
not required to speak. Keep existing narrator/default-voice metadata for production compatibility.

## Write three different stories, not three engine labels

1. Decide the audience experience and the ending: understanding, amusement, tenderness,
   suspense, awe or another concrete response. Choose an engine that fits the material:
   curiosity, fear, intrigue, comedy, empathy, awe or discovery. Candidates may share an engine.
2. Give the central character a want and an obstacle. For explanation, this can be the
   audience's question and the demonstration that resolves it. Cast only necessary characters.
3. Draft the opening situation and the final observable change. Give the audience enough
   information to anticipate a result. A promise may be enacted; an explanatory promise
   sentence, loss hook and question are not mandatory for drama or visual comedy.
4. Work backward through necessary choices, obstacles and consequences. Each development
   changes what the viewer expects and causes or motivates the next. Pay something useful
   early. Do not postpone every answer or manufacture danger to fill the middle.
5. For a **twist**, plant an honest detail that supports an initial interpretation and a later
   reinterpretation. Record the setup/payoff; do not introduce a new world rule at the reveal.
   A result stated upfront can sustain interest through its cause, cost or limit. No twist is
   also valid (`reveal: none`).
6. For **comedy**, establish an expectation, let a character's specific pursuit complicate it,
   then break or reconnect the pattern. Test audience context and whether the violation feels
   safe enough to laugh at. Do not append an explanation of the punchline or a compulsory moral.
7. For **emotion**, establish what the relationship or goal means, then show a costly choice,
   recognition, reunion or changed relationship. An action, reaction or silence may deliver the
   ending. Do not force grief, a positive ending or a downward-then-upward numeric curve.
8. Remove repeated explanation. Preserve subtext: what the character wants is author metadata;
   what the viewer sees/hears is the evidence. Theme may be inferred rather than spoken aloud.

Suggested planning items: subject, hook, developments 1–3, ending, optional CTA. Store the
subject in `premise`, the other six in ordered `beats`. No camera, timing or generation prompts.
A `difference` sentence states how each candidate differs in dramatic situation, choice or
payoff; three paraphrases fail human/reviewer judgment even if the checker passes.

Before scoring, compare the three **causal skeletons** from the events alone: opening
situation → central choice → consequence → final observable change. Record that comparison
in the candidate review. Shared cast, setting, historical facts or an initial incident are
allowed. Changing engine labels, premise notes or the antagonist's last demand while keeping
the same choices and consequences does not establish three different stories. The checker
warns when any candidates copy the exact observable event sequences of the hook and all
three developments (ignoring whitespace and author notes). This is a narrow warning, not a
semantic similarity score: reviewers still judge the full stories, including legitimate
branches from a shared setup and paraphrases that evade exact matching.

When a decisive turn grants trust, access or responsibility after betrayal or exposed danger,
make the reason observable **before** the assignment. Show what the decision-maker has
actually learned, why help is needed and what risk they accept or control. A confession,
apology or withheld destination does not by itself establish a safe or motivated decision.
Where the character's established duties demand it, show the concrete safety response:
notify affected allies, stop or change an exposed route, limit cargo/access, arrange an
escort or confirm the next safe handoff. Choose controls that fit this story; these are not
mandatory props or a requirement to make every fictional choice prudent. A reckless choice
can work when its motivation and consequences are delivered on screen.

Trace knowledge across scenes as carefully as physical props. If a costly refusal happens
elsewhere, the person granting trust cannot silently know it happened. Show a witness,
communication or directly observable evidence, or write their decision from the information
they do have. Compare this chain with each selected identity's priorities and boundaries.

## Scenario file (scenario-v2)

Frontmatter: `version: scenario-v2`, `channel`, `topic`, `direction: D1 | D2 | D3`, and
`frozen:` (empty until board authoring). One fenced `scenario-json` object is the canonical
candidate. Present it as the seven readable items for the user; do not maintain another script.

Recommended object fields (the checker still validates readable data shapes):

- `kind`, `expression`, `engine`, `reveal: held | upfront | none`.
- `premise`, `viewerExperience`, `message` (intended meaning, not a mandatory closing line),
  `endingReason`, `difference`; optional `cta` can describe a desired ask.
- `cast: [{id, role, want, voice, reason}]` from cast.json.
- `beats: [{item, expectation, change, necessity, events}]`, with suggested items
  `훅`, `전개 #1`, `전개 #2`, `전개 #3`, `마무리`. A CTA row is optional and may be empty
  or appear where it serves the story; no CTA reason or prescribed position is required.
- `events: [{kind, character, text, basis, to?, claims?}]`: kind is action, dialogue or
  narration; character is a cast ID; dialogue `to` is another ID, self or audience. `text`
  describes observable action or actual spoken words. `basis` is fact, interpretation or
  invented; fact/interpretation requires `claims: [N]` pointing to Verified rows.
- `setups: [{open, pay, detail, reinterpretation}]`, 1-based beat indices, open before pay
  (pay at most 5, before CTA). Empty is valid without a held reveal.
- `adaptationBoundary` for adapted stories.

Run `node check-scenario.js storyboard/candidates/` before showing/scoring all three, then
`node check-scenario.js storyboard/scenario.md` after selecting and freezing the winner.
General authored scenes need no minimum facts. Evidence/adapted candidates need actual factual
support; fiction needs none unless it makes real-world assertions. Record the selection in
storyboard.md with its provenance. Keep all three candidates and the selected page.

Show the readable candidate choices when requested. In automatic work, compare their
causal skeletons, choose the strongest available story and continue; scores and freeze
stamps are diagnostics/provenance, not prerequisites. Keep original candidates and the
selection reason when useful. Never fabricate a reviewer verdict or user approval.

## Board handoff and review (story-v2)

Keep production speech in `narration[]`, including character dialogue. Every v2 speech group
has an explicit `speaker` ID, including the narrator. Do not rename the production array.
Copy selected identities and their actual TTS settings into the existing SB_DOC cast contract.
`STORY.cast` holds the selected role/want/voice/source records, not a second TTS configuration.
Follow [shot speech](../../produce/references/shot-speech.md): assign stable shot/line IDs,
delivery and `SB_DOC.speechPlanVersion:1` before review. Split speaker changes into consecutive
shots for the current one-speaker-per-scene builder, then update performance group references.

Each shot has an ordered `performance` array:

```js
narration: [{id: "line-1", tts: "Did you eat?", sub: "Did you eat?", speaker: "child", delivery: "on_screen"}],
performance: [
  {kind: "dialogue", character: "child", to: "father", group: 1},
  {kind: "action", character: "father", text: "He slides his untouched bowl toward the child."}
]
```

Speech events reference 1-based narration groups, exactly once in their playback order;
action events carry text and no group. An all-visual shot has narration: [] and a planned
finite duration. Transfer observable actions to visual.action and the corresponding video,
still sequence, HTML motion or filming plan; never assume performance metadata animates itself.
A narrative ending may use beat:drip, including a silent action. CTA beats and share
metadata remain available but are never required, prescribed speech or terminal-position gates.
For live recordings use existing STORY.transcripts with speaker IDs and actual source/times.

For story-v2, a scene may deliver its turn through ordered actions and attributed speech
inside one shot. Do not add a second size solely to satisfy the legacy narrated-scene
coverage warning or make a character speak the turn labels or COMPREHENSION.takeaway.
The scene's out can be its final action event. Review implied meaning against the actual
performance order; lexical absence of an abstract label does not prove absent meaning.
Missing events, reversed explicit evidence, contradictory charge/feel, incorrect framing
and unsupported event plans still need correction. Action metadata describes a plan, not
proof that an image or animation renders it; preserve the production-plan and media checks.

Set STORY.version to story-v2. Keep viewerNeed, thesis, basis, endingReason, kind, expression,
reveal, cta, cast and beats (one change/necessity per performance shot). Opening, payoff, ending,
optional ask, and review refs use `{shot, event, quote}` against the actual performance event.
The thesis is author intent and need not occur verbatim in speech. Adapted adds adaptationBoundary.

`node check-story.js storyboard/ --text` extracts only observable actions and attributed speech
in playback order. `--map` maps findings to shot/event; `--text --speech` extracts words alone
for vocabulary review. No author intention, thesis or expectation goes in the first blind read.
Then compare what the reviewer understood with STORY, character identities and relevant evidence.

Use the existing narration reviewer call/budget (wire name `narration`, no extra loop) to assess:
meaning, progression, payoff, grounding and character. Grounding means real evidence for factual
claims, internal rules and causality for invented events, both for adapted work. Quote actual
events in all five STORY.review entries; do not substitute declared intent for delivered meaning.
When review is requested, report the actual score and unresolved findings. Vocabulary follows on speech only, with character
voice/context; no speech means vocabulary is not applicable, not a fabricated score. A word edit
that changes meaning requires rechecking the whole performance. Use substantive findings to improve the next pass without stopping automatic production. Record the review hash; actions, cast, speech and story edits invalidate it.

A requested review shows the complete readable performance with speaker names and actions, followed
by intent and review findings. Record actual consent separately when needed for spending or publishing.
After generation verify that actual acting, timing and voices deliver the planned events; a plan
review cannot establish that the rendered scene conveys them. Keep existing media HITL exceptions.

## Reviewer rubric

Meaning and audience investment 20; causal progression/necessary developments 20; character
motivation and distinctive speech 20; setup/payoff or earned discovery/relationship change 25;
clarity, economy and ending 15. No secondary-engine bonus and no compulsory fear/twist/moral.
P0: unresolvable factual claim, undisclosed invention presented as fact, contradictory world rule,
unmotivated decisive choice, unearned ending, missing setup essential to a held reveal, unknown
speaker, or an essential meaning present only in author notes. Cosmetic preferences are directives.
This is editorial evaluation, not a prediction of retention or virality.

For the causal and character scores, quote the event that motivates each decisive assignment
of trust or authority and the event that supplies the decision-maker's knowledge. Treat a
missing essential reason as the existing **unmotivated decisive choice** P0, not a cosmetic
preference. Deduct for an established safety priority that exists only in identity/author
notes while the performed events ignore it. Do not award credit merely because notes say
"limited trust", "earned" or "the character decides". Apply this to candidate selection and
again to the storyboard's actual performance order, where cuts can accidentally erase the
evidence or place it after the decision.

## Craft sources and limits

- [Pixar/Khan Academy](https://www.khanacademy.org/computing/pixar/storytelling): wants,
  needs, obstacles, stakes and character arcs.
- [Andrew Stanton, TED](https://blog.ted.com/my-life-in-story-backwards-andrew-stanton-at-ted2012/amp/):
  audience inference and an ending worth following; not a mandatory spoken explanation.
- [Sean Baker, BAFTA](https://www.bafta.org/media-centre/press-releases/bafta-screenwriters-lecture-series-sean-baker/):
  a circumstance reveal can change the audience's judgment of a character.
- [Alec Berg, Scriptnotes](https://johnaugust.com/2018/scriptnotes-ep-344-comedy-geometry-transcript):
  choices, consequences and intersecting setups can generate comedy.
- [McGraw and Warren](https://leeds-faculty.colorado.edu/mcgrawp/pdf/mcgraw.warren.2010.pdf):
  benign violation is a useful humor model, not a universal joke formula.
- [Kama muta research](https://doi.org/10.1037/emo0000450): relational closeness is one supported
  route to feeling moved; it does not prove a particular script will succeed.
- [YouTube/Jenny Hoyos](https://blog.youtube/creator-and-artist-stories/youtube-shorts-deep-dive/):
  immediate audience interest and a concise satisfying moment; creator practice, not a timing law.
