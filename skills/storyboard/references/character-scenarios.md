# Character-led scenarios and whole-story review

**Use this contract for every newly authored scenario.** The new authoring path is
causal story → complete acted scenes → blind comprehension → shots/staging → derived timing.
Legacy authoring and reviewer instructions are separate references for existing unversioned
or story-v1 episodes only. Do not load them for new work or migrate an approved episode
silently. No runtime, shot-count, research-count, engine-mix or spoken-thesis quota defines
story quality. Explicit user constraints, actual adapter limits and budgets still apply.

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
- [Resolve the story direction](#resolve-the-story-direction)
- [Complete scenes before shots](#complete-scenes-before-shots)
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

## Resolve the story direction

Start with one scenario for settled material or an existing draft. Explore alternatives
only when a material choice is unresolved or the user requests them. Their number follows
the decision, not a three-candidate quota. A targeted revision need not restart selection. Preserve the requested genre and its
particular audience experience; the points below are craft options, not a universal formula.

1. Decide the audience experience and the ending: understanding, amusement, tenderness,
   suspense, awe or another concrete response. Choose an engine that fits the material:
   curiosity, fear, intrigue, comedy, empathy, awe or discovery. Candidates may share an engine.
2. Give the central character a want and an obstacle. For explanation, this can be the
   audience's question and the demonstration that resolves it. Cast only necessary characters.
   For dramatic principals, use the character-depth guidance linked from storyboard:
   identify what makes the pursuit personally costly, how a relationship affects their
   method, and which performed choice reveals it. A single clear want can carry a plot
   without yet revealing a complex person. Do not force every role into an inner conflict.
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

Store the subject in `premise` and group the story into ordered `beats`. Existing hook,
development and ending labels remain compatible, but the actual events decide how many
scenes or shots they need. Do not invent three developments to fill labels. No camera,
timing or generation prompts yet.
A `difference` sentence states how each candidate differs in dramatic situation, choice or
payoff; paraphrases do not resolve a real choice even if the checker passes.

When comparing alternatives, read their **causal skeletons** from the events alone: opening
situation → central choice → consequence → final observable change. Record that comparison
in the candidate review. Shared cast, setting, historical facts or an initial incident are
allowed. Changing engine labels, premise notes or the antagonist's last demand while keeping
the same choices and consequences does not establish distinct story directions. The checker
warns when any candidates copy the exact observable event sequences of the hook and every
development (ignoring whitespace and author notes). This is a narrow warning, not a
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

## Complete scenes before shots

After selecting the causal direction, write the scene sequence as observable performance.
For each scene establish enough place/time and starting situation to follow who wants what,
what interferes, the choice they make and what changes. Keep the audience's necessary
information in actions, actual speech or available sounds; identity sheets are not on screen.
Use existing `STRUCTURE.scenes` fields for the scene handoff rather than a new required form.
In a dramatic exchange, let the counterpart's response affect the tactic and expose a
priority or tension. Preserve the cost and aftermath of important choices. For serialized
fiction, read relevant canonical prior endings before resetting trust, knowledge or an arc;
note the episode's starting/resulting state in storyboard.md when useful, not in a duplicate
identity schema. Unapproved alternatives do not establish series history.

Allow a scene to hold multiple lines, multiple speakers and silence. Cut only after the
scene reads coherently. The first speaker's line, second speaker's answer and listener's
response can share a shot. Set dialogue `to` to the actual addressee; `audience` means a real
address to the viewer, not a placeholder for unknown blocking. A narrator-only explanation
and a silent visual story are valid expressions.

Test important transitions with concrete questions: what caused this next choice; how did
this character learn the information; what can they see/hear from their position; who holds
the object now; what does the last action make the other person do? `necessity` should answer
what becomes unclear or unearned if an event disappears. Trope names and generic goals do
not answer it. Do not make characters speak that metadata aloud.

Give an independent reader only the complete actions and actual words first. Ask them to
reconstruct the event and consequence, including uncertainty. Only after this blind read
show character wants, plot intent or the synopsis. Distinguish intentionally withheld answers
from missing prerequisites. A mystery can be ambiguous and fair; a joke can be unstated and
clear. Repair the event that caused the misunderstanding rather than its author explanation.

When converting scenes to shots, preserve spatial relations, eyelines, prop custody and
reaction. An opening image must show the state before the essential action; it cannot start
after a handoff and still promise to show that handoff. Put the receiver or listener in a
readable frame, or plan the cut/sound that delivers their response. Generic head motion and
a camera push do not perform an object transfer, discovery or changed decision.

Keep actor-relative left/right separate from camera-relative screen position. A reverse
angle changes what appears at the frame edge, not which arm carries a bag. Match each
shot's final body pose, object custody and location to the next opening. Before estimating
time, trace the source pose, necessary travel, contact, handling and response in order.
Only overlap actions that are physically compatible and explicitly staged together. One
compound action entry may still need several sequential movements and enough time to read
them; it is not automatically one quick gesture. Use existing direction/timing fields.
For eating or drinking, stage the bite/sip, chewing or swallowing, breath and speech in a
physically plausible order. Do not schedule clear dialogue through an occupied mouth merely
to overlap events. If an interrupted or muffled line is intentional, describe that delivery.
Keep consequential object contact and handling inside the chosen framing; a face-only shot
cannot convey an unseen hand action just because the performance text names it.

## Scenario file (scenario-v2)

Frontmatter: `version: scenario-v2`, `channel`, `topic`, `direction: D<n>` (D1, D2, … — as many
directions as the decision needs), and
`frozen:` (empty until board authoring). One fenced `scenario-json` object is the canonical
candidate. Render its actual beats and events for the user; do not maintain another script.

Object fields. `check-scenario.js` requires readable data shapes: `kind`, `engine`, `expression`,
`reveal`, `premise`, `viewerExperience`, `message`, `endingReason`, a non-empty `cast` with
`role`/`want`/`voice`/`reason`, `beats` whose non-CTA rows carry `events` (each with `kind`,
`character`, `text`, `basis`; factual events cite Verified claim IDs), a `setups` array and
`adaptationBoundary` on adapted work. A missing `difference` is a warning (a single settled
scenario has nothing to differ from); `expectation`/`change`/`necessity` and the suggested beat
order are warnings too. The rest below is recommended:

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
  (use the actual beat positions). Empty is valid without a held reveal.
- `adaptationBoundary` for adapted stories.

Run `node check-scenario.js storyboard/candidates/` when comparing alternatives, then
`node check-scenario.js storyboard/scenario.md` after selecting and freezing the winner.
General authored scenes need no minimum facts. Evidence/adapted candidates need actual factual
support; fiction needs none unless it makes real-world assertions. Record the selection in
storyboard.md with its provenance. Keep the alternatives actually considered and the selected page.

Show the readable candidate choices when requested. In automatic work, compare their
causal skeletons, choose the strongest available story and continue; scores and freeze
stamps are diagnostics/provenance, not prerequisites. Keep original candidates and the
selection reason when useful. Never fabricate a reviewer verdict or user approval.

## Board handoff and review (story-v2)

Owner directive 2026-10-17: spoken dialogue remains in the audio, never as subtitles
or captions inside the video. Use text-free source images and video prompts, including
speaking shots. Keep exact dialogue in the plan for speech verification and optional
separate YouTube caption tracks when requested. Pass plan_video.videoPrompt to the
adapter; do not copy literal spoken lines into an audio-conditioned prompt when the
WAV already supplies them. Inspect actual output for accidental text and report it
as a defect rather than treating a no-text instruction as proof of compliance.


Keep production speech in `narration[]`, including character dialogue. Every v2 speech group
has an explicit `speaker` ID, including the narrator. Do not rename the production array.
Copy selected identities and their actual TTS settings into the existing SB_DOC cast contract.
`STORY.cast` holds the selected role/want/voice/source records, not a second TTS configuration.
Follow [shot speech](../../produce/references/shot-speech.md): assign stable shot/line IDs,
delivery and `SB_DOC.speechPlanVersion:1` before review. Set
`SB_DOC.performanceTimingVersion:1` on new boards so production requires finite timing for
independent actions. Unknown action durations are valid draft findings; older unversioned
timing retains its compatibility path and an explicit warning, not a fabricated duration. Keep each speaker’s lines and audio
receipts separate. A shot may contain several speakers: the speech composer joins their
attached takes in performance order, including anticipation, independent actions and reactions. Split
shots when the staging calls for a cut and update performance group references.

Translate the dramatic situation into optional per-line `acting` before production:
`context`, `intent`, `emotion`, `vocal`, `visual`, `leadInSeconds` and `tailOutSeconds`.
Choose the line boundary by speech purpose as well as emotion. One calm speaker can identify
themselves, listen, then question an offer. Preserve these as separate speech groups with
their own context, intent and vocal contour in the same shot; place listening in the ordered
performance. Do not describe the entire turn as a question when its opening identifies the
speaker. A period alone does not scope a global acting cue. Conversely, several sentences
with the same purpose and delivery may stay together; do not split mechanically at punctuation.
Use the [speech contract](../../produce/references/shot-speech.md#direct-each-line-and-reaction)
for field limits and generation planning. The character's identity voice stays fixed while
confusion, restraint, celebration and other reactions follow the current beat. Write the
trigger and observable response instead of repeating a generic confident/cheerful tone.
Reserve time to notice the trigger and react after speech when the scene needs it. Align
the planned source image's expression, gaze, hands and props with that starting state;
a shared portrait is an identity reference, not a universal acting pose. Pass the same
situation to voice and video generation. Distinct emotional beats and nonconsecutive
shots are separate generation units even if they share a character or reference image.

Each shot has an ordered `performance` array:

```js
narration: [{id: "line-1", tts: "Did you eat?", sub: "Did you eat?", speaker: "child", delivery: "on_screen"}],
performance: [
  {kind: "dialogue", character: "child", to: "father", group: 1},
  {kind: "action", character: "father", text: "He slides his untouched bowl toward the child."}
]
```

Speech events reference 1-based narration groups, exactly once in their playback order;
action events carry text and no speech-reference `group`. Optional `durationSeconds` gives
an authored action estimate. Optional `withGroup: 1` starts it with that 1-based speech
group; without its own duration it spans that group, and a longer duration extends the
interval by the maximum, not by adding two simultaneous events. An independent action
without a duration has unknown timing, not zero. An all-visual shot has narration: [] and
a planned finite duration. Transfer observable actions to visual.action and the corresponding video,
still sequence, HTML motion or filming plan; never assume performance metadata animates itself.
Call `speech_manage` with `{path, action: "plan_video", shotId, capabilities}`; it reads
the whole stored scene, including performance. Do not restrict this handoff review to line
IDs or invent an inline shot argument. Compare the returned event order, source state,
visual action, listener reactions and warnings against the
scene. `shot.videoDesign` before/action/after/motion and camera directions must agree with
the performance; a text field alone is not proof of an executable or rendered action.

Estimate shot time only after laying out words and actions. Per-line `acting.visual`
happens with speech; an independent action or response may need its own interval. Do not
use a universal speech-plus-padding formula. Match later measured audio and clip timing to
this plan. If the take exceeds an adapter limit, split at an action boundary while keeping
the necessary setup and consequence. If a user duration limit cannot fit the story, simplify
or split the episode; do not silently omit causal events. 9:16 and 16:9 describe canvas,
not how long the story must run.

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

### Story-v2 STORY example

The shape `story-performance.js` reads. Replace every value; a quote is an exact substring of
that event's observable text, and `review` exists only after an actual read (otherwise the
story is `not_reviewed`, which is a finding, not a stop):

```js
window.STORY = {
  version: "story-v2",
  kind: "fiction",                 // evidence | fiction | adapted (adapted adds adaptationBoundary)
  expression: "mixed",             // narration | dialogue | visual | mixed
  reveal: "held",                  // held | upfront | none
  viewerNeed: "Why the clerk lets the stranger through",
  thesis: "Trust goes to the person who shows what they risk",   // author intent; need not be spoken
  basis: "Invented events under the channel's world rules; no factual claim",
  endingReason: "The stranger's own loss is what the clerk saw before deciding",
  cast: [
    { id: "clerk", role: "gatekeeper", want: "to keep the ledger clean", voice: "clipped, formal",
      source: "../../assets/characters/clerk/identity.json" }
  ],
  opening: { shot: 1, event: 1, quote: "closes the ledger as the stranger reaches the counter" },
  payoff:  { shot: 4, event: 2, quote: "slides the key across without a word" },
  ending:  { shot: 5, event: 1, quote: "leaves the coin on the counter" },
  cta: "none",                     // optional: ask: { shot, event, quote }
  beats: [
    { shot: 1, change: "The viewer expects a refusal", necessity: "Without it the key means nothing" }
    // one row per performance shot
  ],
  review: {                        // written only after an actual read
    hash: "<node check-story.js storyboard/ --hash>",
    verdict: "pass", unresolved: [],
    meaning:     { reason: "…", refs: [{ shot: 4, event: 2, quote: "slides the key across" }] },
    progression: { reason: "…", refs: [{ shot: 2, event: 1, quote: "…" }] },
    payoff:      { reason: "…", refs: [{ shot: 4, event: 2, quote: "…" }] },
    grounding:   { reason: "…", refs: [{ shot: 1, event: 1, quote: "…" }] },
    character:   { reason: "…", refs: [{ shot: 3, event: 1, quote: "…" }] }
  }
};
```

`node check-story.js storyboard/ --text` extracts only observable actions and attributed speech
in playback order. `--map` maps findings to shot/event; `--text --speech` extracts words alone
for vocabulary review. No author intention, thesis or expectation goes in the first blind read.
Then compare what the reviewer understood with STORY, character identities and relevant evidence.

Use the existing reviewer wire name `narration` for the whole-performance read. Assess:
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

When scoring is requested, use the rubric agreed before the read. Default plan axes are
meaning and causality 25; character knowledge/motivation 20; setup/payoff 15; visual staging
and action continuity 25; rhythm/economy 15. Cite performed events and the relevant visual
handoff, and subtract concrete defects rather than awarding metadata. No secondary-engine
bonus and no compulsory fear/twist/moral. If only an early scenario is available, describe
staging as provisional instead of pretending a full production plan was reviewed.

Ordinary authoring has no numerical pass threshold. A user-requested improvement loop keeps
their exact criterion; “over 95” is strictly >95 for each requested story with zero P0.
Do not show the target score to the blind reader before their initial reconstruction.
A reviewer must not edit the artifact they score, and prior scores do not constrain their
new verdict. No plan score establishes that generated video will perform the planned action.
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
