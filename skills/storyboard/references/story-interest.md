# Story interest: order the questions, then the scenes

**Guidance, not a gate.** [Automation guidance](../../_shared/automation-guidance.md) applies:
nothing here is a quota, a score or a required field. Read it with
[character-led scenarios](character-scenarios.md) once the causal skeleton exists. That file
makes the story understandable; this one asks whether the viewer wants the next scene.
Every technique below is a conditional option. A story that needs no time jump, no twist and
no cliffhanger is complete without them.

Use it for story-led work: drama, comedy, mystery, serial fiction and narrative documentary.
An explainer, tutorial or review does not need a manufactured opponent; §4 says what its
progression is instead.

## Contents

- [1. Keep a ledger of open questions](#1-keep-a-ledger-of-open-questions)
- [2. Choose the order of telling](#2-choose-the-order-of-telling)
- [3. Choose who knows more](#3-choose-who-knows-more)
- [4. Make the pressure change](#4-make-the-pressure-change)
- [5. End a scene on the next question](#5-end-a-scene-on-the-next-question)
- [6. End a serial episode](#6-end-a-serial-episode)
- [7. A short as one sequence](#7-a-short-as-one-sequence)
- [Carry tension from synopsis to shots](#carry-tension-from-synopsis-to-shots)
- [8. When it is not working](#8-when-it-is-not-working)
- [9. Evidence and limits](#9-evidence-and-limits)

## 1. Keep a ledger of open questions

The unit of interest is the question the viewer is holding right now, not the scene. For each
scene know three things: which question it opens or closes, how well the viewer can guess the
answer, and whether the viewer knows more or less than the people on screen. Flash-forward,
dramatic irony, rising conflict and an episode ending are all entries in that one ledger.

- **One governing question per sequence.** It is specific and the story can answer it: who,
  why, how, or whether. Write it in `sequence.question` and name the scene that answers it in
  `sequence.payoff`. A short usually holds one; a long episode holds one per sequence.
- **Small questions close fast.** A question a scene raises is answered in that scene or by
  the next join. Only the governing question stays open across scenes.
- **The viewer can half-guess.** A puzzle with no context gives nothing to guess and a result
  shown whole leaves nothing to find out. Show enough that the viewer forms a guess and is
  not sure of it.
- **Bet on each join before writing the next scene.** Write down what a viewer would bet
  happens next and how sure they are. A bet that is certain and then delivered exactly as
  bet is an arrival, not a turn. Move the doubt instead of hiding the fact: when the viewer
  is sure a locked drawer will be opened, the open question becomes whether what is inside
  will be enough, what opening it costs or who else gets hurt, and the screen has to give a
  reason for that doubt. When the premise or the genre settles the outcome (a farewell
  everyone expects, a gentle story), "whether" is not a question. Ask how or at what cost,
  and show in action why the how is hard. You know the answer, so you will rate the
  viewer's certainty too low; when the screen points one way, count the bet as sure. When
  the screen offers a simpler explanation than yours, the viewer bets on that one.
- **Every opened question has a payer.** Before writing on, name the scene that answers each
  question that stays open. A question nobody answers costs trust in the next episode.
- **An answer hands over the next question.** When a scene closes a question, the answer
  itself raises the next one: the box is opened, and what is inside belongs to someone else.
  Close one question at a time; two answers in one short stretch leave the next join with
  little to want.

**Read the ledger off the screen.** For every question counted as open or closed, every
cost and every clock, point to the event that carries it. `time`, `turn`, notes and identity
sheets are never seen. A deadline holds the viewer only when it is seen or heard again as
it tightens. A question is closed by an event with one reading; a gesture that reads two
ways, a call the viewer cannot hear or an author's note closes nothing. That includes what a
decisive character knows: when the ending means one thing if they were fooled and another if
they saw through it, show their state before the ending with an act only one reading allows.

The existing fields hold the ledger; none is new or required. In `scenario-v2`,
`beats[].expectation` is what the viewer expects going in and `change` is what moves it;
`setups` pairs a planted detail with its return. On the board, `scene.turn` says what flipped,
`scene.charge` gives its sign and `scene.out` is what the scene ends on.

## 2. Choose the order of telling

The order of events and the order of telling are separate decisions. The same events told in
order build suspense about what will happen; told with a piece of the outcome first they
build curiosity about how it came to that; told with a key fact left out they end in surprise.

| Order | Use it when | Condition |
|---|---|---|
| Chronological | the cause-to-result run is itself the interest | none; it is the default |
| A piece of the outcome first | how or why matters more than what | show only part: hide at least one of who, why and how |
| Start in the middle | the setup is ordinary and the trouble is not | the missing setup arrives through action, not a recap |

- **The future piece is a key, not the answer.** A whole result shown first leaves nothing to
  find out. Decide which piece is hidden and record the scene that returns it. With
  `reveal: "upfront"`, put the shown piece in a `setups` row as `detail` and what the hidden
  piece changes as `reinterpretation`.
- **The piece belongs to the story's central choice.** A flash-forward that does not touch
  what the principal decides reads as a trick. If nothing connects, tell it in order.
- **A flashback enters from a trigger and leaves on a question.** Something in the present
  scene sends the story back: an object, a line, a place. It returns when the past has
  answered part of an open question and opened a new one. A flashback that only supplies
  background is exposition with a time stamp.
- **Jumps cost attention.** Each one asks the viewer to rebuild the timeline. A short carries
  at most one jump and one return. A long episode can replay the same future scene and add
  information each time.

**Mark time in the picture, never with drawn text.** Nothing is drawn over video, so no "3
hours earlier" card. Give each timeline its own visible code and keep it fixed: the state of
a prop (the cup whole, the cup broken), the light or weather, the place. A costume change
works only when the shot states it as scene state, since the character sheet pins the default
outfit. Write the depicted time in `scene.time`, explain the break with `continuityBreak` on
the first shot after it, and let a narrator or a line name the time when one is present. A
transition effect supports the code; alone it is not evidence that time moved. Limit a story
to two timelines unless it is long enough to teach a third.

## 3. Choose who knows more

For each sequence decide where the viewer stands against the principal character.

| The viewer knows | Effect | Costs |
|---|---|---|
| more than the character | dread or delight under an ordinary scene; the viewer waits for the character to find out | the character must have a reason not to know; their setbacks lower only them, so the viewer needs a doubt of their own |
| the same | investigation; the viewer guesses alongside | clues have to be visible when they occur |
| less | surprise at the reveal | shortest effect; needs a fair setup |

- **Showing the threat first lasts longer than springing it.** An ordinary conversation above
  a danger the viewer has seen holds attention for as long as the scene runs. A surprise is
  over when it lands. Prefer the first when a stretch has to carry time.
- **Not knowing needs a cause.** The character lacks the information because of where they
  stand, what they were told or what they refuse to believe. If only the plot keeps it from
  them, §8 names the repair. The same holds for what the viewer is not told: hide it with a
  cause the scene supplies (an interruption, a turned screen), not a convenient silence.
- **A twist is surprising and then obvious.** The detail that explains it was visible before
  the reveal and read as something else. Record it in `setups`. Each added twist lowers the
  value of the others, so spend one where the story turns.
- **Deny the obvious moment.** When the viewer knows the principal holds the key (the
  hidden proof, the secret ally), they bet on when it will be played. Let that moment pass
  without it for a reason the scene supplies, then let the key come out later, at a worse
  time and for a higher price. The interest moves from whether to when and at what cost.
- **A plant is noticed, not underlined.** Give it a beat in which something in the present
  scene depends on it, so the viewer registers it as part of what is happening now. Placed
  only for later, it announces the payment (a rule of thumb spoken early names the scene that
  will break it); standing as its own sentence, or beside a second plant, it draws the ending;
  buried in a list of other things, it is missed. Cut the half that foretells and keep plants
  apart. Until the reveal, the same clues should fit a rival explanation at least as well.
- **A mystery box needs its contents.** Withholding raises interest only while the viewer
  trusts that an answer exists. Know the answer before opening the question.

## 4. Make the pressure change

Frustration pulls the viewer forward under four conditions. Without them it is irritation.

1. **Sympathy before threat.** The viewer sides with the principal before the trouble starts:
   an unfair position, a small competence, something they protect.
2. **An opposing claim that can win.** The opposing person or force can actually prevent
   the goal. An unjust opponent can drive indignation; incompatible but defensible needs
   can drive a dilemma. A rescuer's duty, a worker's right to refuse and a patient's need
   may all be credible. Do not make a rival foolish or cruel merely to vindicate the lead.
3. **The barrier or the stakes change scene by scene.** The same obstacle met the same way is
   repetition. Move at least one of: who opposes, what is at risk, what ability is demanded.
   Rotate the kind of barrier among a person, a system and the principal's own flaw.
4. **The weight of the situation causes it, not foolishness.** The principal is blocked by a
   capable opponent, a real dilemma or a flaw the story has shown, never by overlooking what
   the viewer can plainly see.

- **End each attempt on "yes, but" or "no, and".** The attempt works and brings a new
  problem, or fails and makes things worse. A plain yes ends the story and a plain no repeats
  it. `scene.turn` names what flipped; `scene.charge` records the sign, with `--` or `++`
  when a scene deepens the previous direction.
- **The wall holds until the principal acts.** Let the lie be believed, the door stay shut
  or the first appeal fail. Until the principal moves, the person who judges stays unreadable
  or leans the wrong way; one early sign of sympathy and the viewer stops doubting, and a wall
  the judge knocks down unprompted was never a wall. The act that turns the story is the
  principal's; a judge, a rescuer or luck may only confirm it.
- **A changed mind needs its own trigger.** When someone refuses at noon and agrees at
  night, show what changed for them in between, on their side of the story. Time passing,
  or a change in someone else, is not their reason.
- **A price is paid on screen.** The principal pays what they could still have avoided, and
  the payment changes what someone decides. A confession forced by evidence already on the
  table costs nothing; a threat of payment after the ending is a promise; a price the
  character can undo once the scene ends (step out at the next floor) is no price. A lie or a
  concealment the viewer watched being made comes due in an act, not only in a look.
- **Signal progress inside a long low.** A stretch of setbacks still gives the viewer
  something each time: a fact learned, an ally, a weakness seen in the opponent.
- **Size the release to the build-up.** The reversal satisfies in proportion to the time the
  opponent was given and the sympathy the principal earned. A punishment larger than the
  wrong reads as cruelty.
- **Causality over intensity.** Louder events with no link between them tire the viewer.
  Each development is caused by the one before it.

Quiet and explanatory work has the same need in another form. Its pressure is the viewer's
expectation: each beat changes what the viewer believes about the subject, and the turn is a
shift of viewpoint, not a defeat. Do not add an antagonist to a story about noticing.

### When the request is for a more gripping story

Make the pressure concrete in events before adding atmosphere. Select the devices the
story needs; this is not a requirement for every scene to contain betrayal or danger.

- **Give each viable choice a different cost.** Confessing can clear an innocent person
  while costing the lead control; silence can preserve a useful arrangement while letting
  suspicion grow. Establish what each option could still save. Do not disguise an obvious,
  cost-free solution by making everyone overlook it.
- **Let the viewer see a consequential secret when anticipation is stronger than surprise.**
  Show who hides what, the immediate reason and who can expose it. The open question becomes
  when they act and what they will demand. Keep a character ignorant through credible access
  or a motivated lie, not a conversation everyone inexplicably avoids.
- **Make a useful action create leverage.** Care, protection, labor or a shared secret can
  earn trust and later become a demand. Show the benefit first and the exact request later.
  Do not jump from one kind act to unquestioned leadership, or treat a vulnerable person's
  dependency as consent. Attraction may complicate an established relationship; forced
  romance, extra nudity or victim humiliation is not a default tension repair.
- **Let the ally negotiate.** A person who can expose the lead has an independent objective,
  a credible reason to bargain and a way to refuse. A switch of allegiance changes access,
  work, risk or authority now; a knowing smile alone changes none of these.
- **Keep a material clock honest.** Weather, a search party's return or a dwindling reserve
  can close an option. Establish it before it decides the scene, make elapsed time readable,
  and check the available resources. Invented countdowns and instant starvation weaken the
  choice. A tense conversation can work without a literal clock.
- **Earn a harder next problem.** A lie saves today's meal but creates a witness; a rescue
  restores trust but exposes a broken promise. Give the answer a consequence rather than
  attaching an unrelated attack or unexplained new villain to the final minute.
- **Allow relief to matter.** A joke, a shared meal or unsolicited help can show the
  relationship worth keeping. The next pressure tests that specific bond. Constant shouting
  and repeated deprivation flatten the difference between danger and release.

## 5. End a scene on the next question

A scene that only closes gives the viewer a place to stop. Its last action or line closes
what the scene was about and leaves the next thing wanted.

- **Write the out before the middle** when a scene will not end. `scene.out` is the final
  line or visible action; it should force a "but" or a "therefore" into the next scene.
- **Hand over the intention, hold back the form.** An out that states both what a character
  will do next and how leaves the next scene nothing to deliver. The next scene's opening
  answers or uses what the out left; an out the following scene ignores was a pause.
- **Not every end is a shock.** A look, an object left behind or an unanswered question
  carries the join. Reserve the hard cut for the turn.
- **Read the joins forward.** After each scene ask what the viewer now wants to see. If the
  answer is "nothing in particular", move the answer later, split it over two scenes or put
  the consequence ahead of the explanation.
- **The last scene pays.** The governing question is answered with material the story
  already planted. An ending keeps what the story charged for: no "it was not certain after
  all", no frame that makes the events matter less. After the turn, a beat that only
  confirms the settled result is a lap of honour: cut it, or give it a new cost.
- **Keep a long plant alive.** A setup paid several scenes later is touched once in between,
  inside an action that does a present job, or the viewer forgets it and the payoff arrives
  as something new.
- **Pay what the story kept naming.** List each stake named more than once and each object
  the story returned to. The ending answers each one in an event, or the story stops
  returning to it. A tool the ending needs is seen in use earlier. A repeated line or
  gesture returns with a different doer, moment or order than the viewer pictured;
  returning exactly as drawn confirms the guess and moves nothing.

## 6. End a serial episode

- **Close one, open a larger one.** The episode answers the question it opened and the
  answer raises a bigger one. Stopping on a frozen danger with nothing answered leaves the
  viewer with tension and no reason to trust the next episode.
- **Cut after a choice or a revelation**, or just before the principal's counterattack. The
  viewer leaves knowing what the next episode is about.
- **Pay early in the next episode.** The previous ending is answered in the opening seconds;
  then the new episode opens its own question.
- **Plan ends before bodies.** For a run of episodes, fix each episode's opening and ending
  in two or three lines first, then fill the middle.
- **Carry the ledger.** Record the questions an episode leaves open in the existing
  `storyboard.md` note beside the starting and resulting state
  ([character depth](character-depth.md#carry-consequences-between-episodes)); the next
  episode reads it. No separate series file is required.

## 7. A short as one sequence

A 30–90 second short is about one sequence: one goal, one turn. A common shape, not a
schedule, and no beat owns a number of seconds:

1. Open on a situation that raises a specific question. A piece of the outcome is one way.
2. Establish why the viewer sides with the principal.
3. Two or three attempts joined by "therefore" or "but", each changing the barrier or stakes.
4. The turn: the governing question is answered with a planted detail. When the story began
   out of order, this is where the two timelines meet.
5. End right after the payoff. A serial opens one new question here.

## Carry tension from synopsis to shots

The same causal decision must survive each representation. Reuse existing fields and prose
notes; do not add a compulsory tension schema or a new approval pause.

| Artifact | What the author makes concrete | What does not count |
|---|---|---|
| Synopsis | A specific want, opposing claim, costly choice, changed relationship and actual episode payoff; identify a hidden fact and its disclosure when used | A teaser that withholds the ending from the author, or adjectives such as shocking and tense |
| Scenario | What each person knows, how they obtain it, the attempted tactic, refusal or counteroffer, the decision and its immediate cost in actions and attributed speech | Motives and consequences present only in character biographies or explanatory summaries |
| Storyboard | The reveal's prop or action, its recipient, necessary listener response, opening state and resulting state visible in the selected shots; preserve the sequence's question/payoff and scene turn/out | A close-up with no readable evidence, a reaction before the trigger, or a source image that already reveals a later secret |

After converting, read only the ordered performance and reconstruct who knows the secret,
what each option costs and what changed. Then compare that reconstruction with the synopsis.
Repair a lost cue where it belongs rather than add a narrator explaining an unperformed
betrayal. Respect one speaking character per shot and at most two principal characters in
frame; split coverage without changing the disclosure order or losing a silent listener.
An actual requested review is separate from this author's preservation pass.

For serials, carry losses, promises, material state and leverage into the next week. Preserve
the user's fixed arrival schedule and narrator/ending order. Newcomers can test the rule
this episode created, but their entrance does not excuse leaving its central choice unpaid.

## 8. When it is not working

| Symptom | Likely cause | Repair |
|---|---|---|
| The opening raises no curiosity | a puzzle with no context, or the whole result shown | show enough to guess; hide one of who, why, how |
| The viewer loses track of when | too many timelines or no visible code | two timelines, one fixed code each, one question each |
| The flash-forward feels like a trick | the future piece does not touch the central choice | connect it or tell the story in order |
| Frustration turns to irritation | the principal misses what the viewer plainly sees | move the cause to an able opponent, a dilemma or an established flaw |
| Conflict builds and bores | the same barrier, the same failure | change the opponent, the stakes or the ability demanded |
| The release does not satisfy | thin opponent, thin sympathy or an excessive punishment | give the opponent time, earn sympathy first, keep the answer proportionate |
| Stronger events, weaker response | too many reversals, no causal link | fewer turns, each caused by the last |
| Questions pile up | boxes opened and never closed | one long question, short small ones; close one as the next opens |
| The viewer knew it would happen, and it did | a plant that announces its payoff, clues that fit one answer, an out that states the form | give the plant a present job, add a rival reading, move the doubt to whether it works or what it costs |
| A stake or an object is raised and then fades | it was closed in notes or metadata, not in an event | pay it on screen with one reading, or stop naming it |
| A middle scene feels like waiting | the same obstacle with a clock; nothing learned | cut it or give it a turn of its own |
| The episode end loses the viewer | frozen danger with nothing answered, late payment next time | pair one answer with one new question; pay at the next opening |

Structure frameworks (three acts, fifteen beats, the story circle, eight sequences) work best
as diagnosis after a draft, to find a missing beat. Do not fill them in as a form.

## 9. Evidence and limits

These are editorial tests, not predictions of retention. Sources and the full grading are in
the [2026-11-11 survey](../../../docs/research/2026-11-11-story-engagement-craft/index.html).

The practical additions on costly choices, disclosure and consequences draw on practitioner
accounts: [Scriptnotes 655, Conflict and Stakes](https://johnaugust.com/2024/scriptnotes-episode-655-conflict-and-stakes-compendium-transcript),
[Scriptnotes 632, Mystery and Suspense](https://johnaugust.com/2024/scriptnotes-episode-632-mystery-and-suspense-transcript),
[Vince Gilligan's Television Academy interview](https://interviews.televisionacademy.com/interviews/vince-gilligan),
and [Tony Gilroy's BAFTA lecture](https://www.bafta.org/media-centre/press-releases/screenwriters-lecture-series-2013-tony-gilroy/).
Their application to the three artifacts above is editorial synthesis, not a measured
retention improvement or a guarantee that morally ambiguous characters are more enjoyable.

| Claim | Grade |
|---|---|
| Changing only the order of disclosure changes suspense, curiosity and surprise | several studies agree |
| A result fully shown first lowers enjoyment and suspense | several studies agree |
| Hiding one of who, why or how in an outcome-first opening | inference from one study and practice |
| Curiosity peaks when the viewer is about half sure | one small study on trivia; applying it to story is extrapolation |
| A viewer who knows more than the character feels tension in an ordinary scene | practitioner consensus, small studies support |
| Flashback entry and exit, yes-but and no-and, varying the barrier | practitioner method |
| Liking the principal raises suspense | mixed results |
| A cliffhanger raises the intention to watch the next episode | one study found arousal rose and intention did not |
| Unfinished tasks are remembered better (Zeigarnik) | not confirmed in a 2025 meta-analysis; do not cite it as the reason |
| Close one question and open a larger one at an episode end | inference, not directly tested |
| Everything in §7 | extrapolation; no peer-reviewed measurement on videos under 60 seconds was found |
| Rules drawn from the 2026-11-11 review loop: betting on each join, reading the ledger off the screen, a plant noticed not underlined, the wall that holds, a price paid on screen, denying the obvious moment, a changed mind's trigger, keeping a long plant alive, paying what was named | editorial: taken from independent reviews of revised benchmark drafts ([loop record](../../../docs/loops/020-story-interest/README.md)); not measured on audiences, and reviewer-to-reviewer spread in that loop was about three points |

Second-by-second retention figures repeated in creator guides could not be traced to a
source. Do not write them as rules. The channel can test the extrapolation itself: publish
one story in two orders and compare `hook` and `retain` from `youtube_insights`. That costs
generation and needs publishing approval, so it runs only when the user asks for it.
