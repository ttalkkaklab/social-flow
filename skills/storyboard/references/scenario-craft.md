# Scenario craft — thirteen rules that run underneath the beats

The beat skeleton (`scenes-schema.md` §playback order) says **where** scenes go. Short-form
is three beats, always: hook → drip (1–n) → cta. Long-form still walks two arcs. This file
says **how scenes push each other** — the craft layer classic screenwriting settled long
before short-form existed, cut down to what a 4–70-shot storyboard can actually use. On a
short the "body" in the rules below is the drip shots. The
storyboard skill applies these while designing scenes (§4); the reviewer's scene mode reads
them as the yardstick behind its flow and role checks. None of them adds a `scenes.js`
field — every rule lands on fields that already exist (`beat` · `shot.feel` · `narration`
· `hookForm` · `chapter` · `duration` · `shot.size`/`angle`/`space` · `sound.drop`).

Before any of that, storyboard §2.2 scores three candidate pages on whether **curiosity,
fear, intrigue or comedy** actually work for a viewer. The engine table and the 95-point
loop live in the scenario-stage reference the skill loads. §4 · §5 · §6 here are what
"working" means for those four; the candidate stage is where they are the bar.

Survey with sources: [docs/research/2026-08-25-scenario-craft](../../../docs/research/2026-08-25-scenario-craft/).
Grades follow the repo convention — **craft canon** (the standard playbook of a named
practitioner or theorist, no measurement), **measured** (published measurement), **field
practice** (practitioner reports, unsourced).

Rules 8–10 and the additions inside §3 · §4 · §5 · §7 come from a screenwriting lecture the
user pointed at (AInspire, "망하는 시나리오 vs 터지는 시나리오", 2026-07-10 — Breaking Bad ·
나의 아저씨 · Signal read as one grammar; transcript from a local Qwen3-ASR run, 2026-08-29).
Their grade: craft canon where the lecture cites Aristotle and Hitchcock, field practice for
its readings of the three dramas. One thing holds the whole list up: **the frame stays fixed
and only the content moves.** Breaking Bad ran the same cold-open format for 62 episodes, and
that constancy is what made a small variation read as an event. It's why the rationing rules
count once per episode — one `dutch`, one `drop`, one dissolve — a device only reads as a
device against a frame that doesn't change.

**§13 comes from a different kind of source** — a working screenwriter describing her own
procedure rather than a critic reading finished work. 김은숙 said the same two things in 2011
and in 2023, and the twelve years between the two statements are the only evidence behind
them; there is no measurement, and none of her method was calibrated on a 60-second video. It
sits last because it is the layer the other twelve leave open — they say what has to be in the
episode, and it says in what order to write it and how far off the obvious to place it.

## Contents

- [1. The connective test — every cut is a "but" or a "therefore"](#1-the-connective-test-every-cut-is-a-but-or-a-therefore)
- [2. Every scene turns — open on one charge, close on another](#2-every-scene-turns-open-on-one-charge-close-on-another)
- [3. Plant and payoff — the turn is paid for in advance](#3-plant-and-payoff-the-turn-is-paid-for-in-advance)
- [4. Fear runs on suspense, and it needs a door](#4-fear-runs-on-suspense-and-it-needs-a-door)
- [5. Curiosity is a ledger — every loop opened gets a payer's name](#5-curiosity-is-a-ledger-every-loop-opened-gets-a-payers-name)
- [6. The laugh is a broken pattern — comedy at sentence length](#6-the-laugh-is-a-broken-pattern-comedy-at-sentence-length)
- [7. The peak and the end are what get remembered](#7-the-peak-and-the-end-are-what-get-remembered)
- [8. Restraint sets the price of the burst](#8-restraint-sets-the-price-of-the-burst)
- [9. The turn is a double hit — the fortune flips and the plant re-reads in the same shot](#9-the-turn-is-a-double-hit-the-fortune-flips-and-the-plant-re-reads-in-the-same-shot)
- [10. Rules are verified, not explained](#10-rules-are-verified-not-explained)
- [11. The storyline is an investigation, not a diary](#11-the-storyline-is-an-investigation-not-a-diary)
- [12. The arc goes down before it comes up — catharsis is release that was paid for](#12-the-arc-goes-down-before-it-comes-up-catharsis-is-release-that-was-paid-for)
- [13. Cut points first, then half a step](#13-cut-points-first-then-half-a-step)
- [Sources](#sources)

## 1. The connective test — every cut is a "but" or a "therefore"

Between any two adjacent scenes, say the link out loud. **"그래서" (therefore)** — the
previous scene forces this one. **"그런데" (but)** — this one blocks or reverses what the
previous one built. **"그리고" (and then)** — a list, not a story; the beat order can be
shuffled and nothing breaks, which means nothing was holding it together.

Source: Trey Parker and Matt Stone's writers-room rule (NYU, 2011) — beats joined by "and
then" are "pretty boring"; replace every joint with "but" or "therefore". Craft canon.

- **Apply after drafting §4**: walk `SCENES` top to bottom and speak the connective at each
  boundary. It's a scratch check, not a field. A boundary that only reads as "and then" is
  scene-mode P0-2 (broken flow) material — merge, cut, or reorder until the chain holds.
- Beat seams have natural connectives — on a short, hook → drip is a "therefore" (you want
  this answer, *therefore* here is the first piece) and drip → drip is a "but" (that piece
  landed, *but* it opens the next gap); on long-form, hooking → result is a "therefore"
  (you have this problem, *therefore* here's the finished thing), body → turn is a "but"
  (everyone gave up, *but* one person looked again). A seam whose natural connective
  doesn't come out is usually a scene doing the wrong job, not a sentence problem.
- b-roll is a comma, not a beat — run the test across it (the scene before the b-roll
  against the scene after).

## 2. Every scene turns — open on one charge, close on another

Name what is at stake in the scene and its polarity at the open and at the close. If the
charge is the same at both ends, the scene has activity but no event — McKee's verdict is
"a nonevent": trash it and weave its information into another scene. Turns run + → −,
− → +, or deeper into the same pole (bad → worse is a turn). Craft canon (McKee, *Story*).

- **`shot.feel` is where the charge reads.** Chart the feel sequence across the episode —
  it should swing or deepen shot to shot. Three consecutive shots whose feel is the same
  note is a flat stretch, and a flat stretch is where the hold job (§playback order) dies.
- This is the concrete test behind scene-mode P0-1 (no role): "take the scene out and the
  video still works" almost always means nothing turned inside it.
- points scenes turn on information (didn't know → know is a − → + turn), so a points scene
  fails this only when its message repeats a previous scene's — which is why P0-3
  (duplication) reads as the same defect at the information layer.
- **Screen time follows the turn.** Weight seconds by how much turns in a scene, not by how
  much there is to say. On the 2026-08 worst-retention episode the central event — the wrong
  part going into the circuit — got 5 seconds, the shortest of eight shots, while scenes that
  only confirmed what the viewer already knew ran 7–8 each. When the timeline's shortest slot
  holds the episode's biggest turn, redistribute before cutting anything. Field practice, own
  channel, one episode.

## 3. Plant and payoff — the turn is paid for in advance

Chekhov's gun, both directions: what the storyboard shows early must matter later, and what
fires late must have been planted early. For the story arc's `turn` beat this is the fair-play
rule — **misdirection** (show true information, let the viewer draw the wrong conclusion)
builds a twist; **deception** (hide or falsify what the viewer needed) cheats it. After the
payoff, replaying the cover should show the clue was there all along, and the reveal should
recontextualize earlier scenes without contradicting them. Craft canon.

- **Where the plant goes**: inside a scene doing another job — a caption that reads as
  atmosphere, a detail in the hooking scene's picture. A plant the viewer clocks as a plant
  is a spoiler; one they only see on replay is the trick working.
- **On `arc:"story"`**: the turn's clue sits in the setup or an early build shot. A turn
  with no plant reads as a cheat; a plant with no payoff is an unpaid promise — the same
  debt the §six hook forms rule tracks for the main hook, extended to every deliberate
  plant. Write the plant → payoff pair into `SB_DOC.craft.loops` (`kind: "plant"`, storyboard
  SKILL §6) — storyboard.html draws the ledger and tags both shots, so the reviewer and the
  user can check it at §7.
- One red herring is legitimate tension (it makes the viewer commit to a wrong read);
  stacked red herrings burn trust.
- **The plant is two seconds and looks like nothing.** An insert so short the viewer files it
  as texture — the lily-of-the-valley pot at the edge of a slow pan, the shovel, the drum.
  Breaking Bad's plants hold for a beat and move on; the reveal is one camera move over the
  same pot with no line under it. On our timeline that is a short-`duration` shot whose
  `shot.info` names the object, or a caption that reads as atmosphere. Lecture reading, field
  practice.
- **The payoff copies the plant's frame.** Same `shot.size`, same `shot.angle`, same
  `shot.space` — the viewer recognizes the object because they stand where they stood when
  it was planted, and no narration has to say "remember this". A payoff in a fresh frame has
  to explain itself, and the explaining is the tell (directing-grammar §6 rule 14). Write the
  pair into `SB_DOC.craft.loops` as `{ open: n, pay: m, kind: "plant" }` (storyboard SKILL §6)
  — storyboard.html compares the two frames and warns when the size, angle or layout differs.
- **An odd angle on an object is the promise that it matters.** Looking up at the shovel from
  inside the drum says "this drum is not set dressing" before anything happens. Spend it on
  the plant, not the payoff — it's the one legitimate reason for an object-level `low` or
  `dutch` outside a person shot — and a `dutch` spent here still counts against the one-dutch ration.
- **Names and rules can be plants.** 나의 아저씨 hid the drama's question in the protagonist's
  name (지안 = 至安, reaching peace); Signal locked the detective's death into the device's
  rule (the radio opens at 23:23, the minute he died). A plant carried by a name, a time or a
  constraint pays off without a shot — the viewer re-reads it the moment the fact lands.
- **Serialized: scatter the fragments, answer once.** Breaking Bad's season-2 cold opens showed
  a pink teddy bear in a pool, then the bear fished out, then a body bag — four fragments
  across four episodes, answered by the plane crash in the finale. The long-form or serialized
  version of plant-and-payoff: each episode's opening carries one fragment and one episode
  pays them all. The ledger (§5) then runs across episodes — a fragment nobody pays by the
  series' end is the same unpaid promise at series scale.

## 4. Fear runs on suspense, and it needs a door

Hitchcock's bomb: an explosion out of nowhere buys fifteen seconds of surprise; the same
bomb **shown to the audience first**, with a clock, buys fifteen minutes of suspense —
the ordinary conversation above it becomes unbearable because the viewer knows more than
the people on screen. For fear-type episodes (`hookType:"fear"`): put the threat and its
clock on the table in the first drip (short) or in hooking (long-form), then let the ordinary
scene run under it. Don't save the threat for a jump at the end — surprise is the weaker
tool. Craft canon (Hitchcock/Truffaut).

And the fear must open a door. Witte & Allen's meta-analysis (2000, **measured**): strong
fear beats weak fear, but only when paired with high **efficacy** — an action the viewer
can actually take, whose result they can see. Strong fear with no door produces defensive
avoidance — here, the swipe. This is the measured base under the §opening strategies fear
guardrail ② ("the body answers that threat"): the answer has to be a doable step, not
reassurance that it'll be fine.

**The device isn't fear-only — it's the viewer knowing first.** Signal tells the audience early
that the 1989 detective is already dead, so every scene where he laughs plays as tragedy while
nothing tragic is on screen: Hitchcock's bomb with the clock replaced by a fact. On a story arc
the strongest `hooking` hands the viewer a piece of the ending-state the characters don't have
— not the payoff (the result still shows that first), but the condition the body will be read
under. Lecture reading of Signal, field practice.

## 5. Curiosity is a ledger — every loop opened gets a payer's name

Loewenstein's information-gap theory (1994): curiosity fires when a **specific, closable**
gap opens between what the viewer knows and what they want to know. Four openers — a
question, an event whose outcome is unknown, an expectation violated, someone else knows
something. A gap too far from what the viewer already knows lands as frustration, not
curiosity — the hook has to sit close enough that the answer feels reachable. Craft canon
(the theory) with the gap-specificity point measured in lab work.

- **The gap can be a picture.** Breaking Bad's cold open — a man in underpants and a gas mask
  driving an RV with bodies in the back, not a word — is a `gap` hook with no sentence: three
  things that don't belong together in one frame, and the viewer's head asks the one question
  (어쩌다 여기까지 왔지?). On a story arc, when the cover's first frame can carry the
  incongruity, let the picture open the loop and keep segment ① for the promise; a narration
  line that explains what's odd about the frame spends the gap. Lecture reading, field practice.
- **Bookkeeping**: a short informational episode carries **one governing loop only** (the
  `hookForm`). A question paid in the same shot or by the next seam is welcome, but it never
  becomes another branch the viewer has to remember. A short narrative may carry one
  cross-scene sub-loop because a person or event can hold that promise. Long-form carries
  2–4. Every loop names, at open time, the scene that pays it —
  put the pairs into `SB_DOC.craft.loops` (storyboard SKILL §6 — the document draws them and
  the §7 screen reads them). An unclosed loop is the
  "stopped, then left" penalty plus trust damage on the next episode (§six hook forms holds this for the main
  hook; this extends it to every loop opened mid-episode).
- **The drips (short) / the body (long-form) pay the answer in installments** (measured on our own channel, n=4 —
  retention report, 2026-08-26). Four episodes ranked by retention came out in exactly the
  order their view counts did (52% → 38% → 26% → 19%, a 3× spread in views), and the curve
  that won held flat across 90 seconds while the curve that lost slid from the third second
  onward. Both openings worked, so what separated them was the body: the winner handed over
  no answer whole — each scene closed one gap and opened the next in the same breath, so the
  viewer was never done wondering — while the loser explained something the viewer already
  accepted ("hearts beat in a rhythm"), and a question answered with nothing behind it is
  where the curve bends. §1 reads a seam backward ("does this follow from the last scene?");
  read it forward too — "what does this scene make me want to know next?" A body scene that
  only closes gets rewritten: split the answer over two scenes, hold back the figure that
  makes it surprising, or put the consequence ahead of the mechanism. **Seam gaps stay off
  the ledger** — the next scene pays them by construction, so the bookkeeping above still
  counts only loops left hanging, one named payer per open loop and not one per sentence.
  Grade: measured, but on four episodes with the body-drop pattern confirmed from a single
  curve; the report's own §6 asks for re-verification on the next episodes.
- **The hand-over happens inside the sentence** (own-channel production guide, 2026-08 —
  field practice). The narration line that pays a gap opens the next one in the same
  sentence, not in the next scene's first line: "케블라는 강철보다 5배 강했어요. 근데 정작
  만든 본인은 쓸모없다고 생각했죠." pays *how strong* and opens *why worthless* in one
  breath. The joints are the spoken connectives — 근데 · 문제는 · 그런데 여기서 · 정작 ·
  알고 보니 · 이유는 — one at the end of a scene's last segment, where §1 reads the seam:
  the "but/therefore" between scenes lands hardest said out loud by the narration itself.
  A last segment that merely states an answer is a closed door, and the swipe happens in
  the silence after it.
- **Long-form re-hooks** (field practice): attention decays over 60–90s stretches, so each
  `chapter` opens with its own one-line mini-hook — why this chapter matters — and around
  the 50–70% mark one deliberate re-hook resets the room (a question to the viewer, a "the
  next one is the part people argue about"). A chapter title is a search phrase; the
  mini-hook is a narration sentence, and it's the chapter's own catch job.
- **Short-form re-hooks ride the cut** (measured on one reference short, 85 s, 2026-08-29 —
  docs/research/2026-08-29-one-world-word-cue). The piece opens a new question every 13–15 s,
  and those are the only places its picture cuts: 「그럼 대체 왜 저걸 입고 들어가는 걸까요?」
  at 13 s, 「근데 진짜 재앙은 따로 있습니다」 at 33 s, 「그럼 납으로 만들면 되지 않을까요?」
  at 48 s (the viewer's own objection, asked for them), 「결국 인류는 막는 걸 포기합니다」 at
  63 s (the turn). Each re-hook is one sentence and the next sentence starts paying it;
  between them the body runs on §1 seams with no cut. This fits the bookkeeping above — the
  sub-loop is re-opened three times, but each is paid before the next opens, so at no point
  is more than one hanging. What the ledger caps is open loops, not questions asked.
- **Loop ending** (field practice): a Short whose last sentence flows into its first frame
  replays — measured AVD above clip length on looping Shorts. The story arc's "cta frame
  points back at the cover" is the visual half of this; writing the cta's final narration
  segment so it hands back to the cover's first line is the audio half. Optional, one
  episode in a while — a forced loop reads as a trick.

## 6. The laugh is a broken pattern — comedy at sentence length

A joke is the curiosity machinery run at sentence scale: the setup builds an expectation,
the punchline forces a re-interpretation (incongruity resolved late). Rule of three: two
items establish the pattern, the third breaks it — three is the smallest count that makes
a pattern at all. And the break lands **last** — the funny word at the end of the sentence,
the funny reveal at the end of the scene; anything after the break dilutes it. Craft canon
(stand-up playbooks).

- **Where it lands in our fields**: `quote` lines and spoken-hook titles carry jokes;
  a points list of three takes the rule of three (two straight, one broken); a comic cold
  open is misdirection, so a comic episode usually rides `curiosity` or `empathy` — no new
  `hookType` exists or is needed.
- **Register survives the joke**: the punchline still passes profile §2 politeness and the
  D9 spoken-surface rules — a punchline delivered in newspaper endings isn't one. Don't
  explain the joke in the caption; the screen holding still one beat after the punchline
  is the timing.

## 7. The peak and the end are what get remembered

Peak-end rule: people judge an experience by its most intense moment and its last moment,
not by the average of every second (Redelmeier & Kahneman 1996; Fredrickson & Kahneman
1993 — **measured**, but in clinical and lab affect studies, not on short-form video; the
transfer is our working bet). For an episode: the peak decides "was that worth watching",
the end decides "what do I do about it" — and the engagement acts the promotion gate reads
(like · comment · share, growth-playbook §observed metrics) all happen after the last
frame, so the end is where they are won or thrown away.

- **One deliberate peak, mid-episode.** On `arc:"story"` the `turn` beat is it — the
  tightest frame of the episode (directing-grammar §6 rule 12) and the `sound.drop` both
  already point there. Answer-first episodes carry it at the result's before/after moment.
  If the `shot.feel` chart (§2) has no clear maximum, the episode is flat and nothing
  marks it in memory.
- **The end is a designed beat, not a fade.** The act job's outward loop (scenes-schema
  §playback order, act row) is what "strongest last beat" means in practice — a question
  the comments will argue over beats a summary of what was just said. Closing softly
  costs both handles at once: nothing to remember the episode by, nothing to do about it.
- The two don't substitute: an episode with a great peak and a trailing end gets
  remembered but not acted on; a strong CTA after a flat body has nothing to convert.
- **The music goes out at the peak, not up.** Breaking Bad's crawl-space scene — the scream
  turning into laughter — runs in silence; the instinct to swell the bed at the climax is the
  thing to resist. `sound.drop: true` on the turn shot is that rule already (scenes-schema
  §music cues — a drop is louder than a hit, spend it on the one line the episode is about),
  and it's why the drop lands on the turn and not on the result — storyboard.html warns when a
  story arc's drop sits anywhere else. Lecture reading, field practice.
- **The signature line lands once.** "I am the one who knocks" is said once in a season;
  나의 아저씨's "아무것도 아니야" is said early as one man's self-defense and at the end as the
  sentence that saves the other person — the same words, the meaning turned over. Power comes
  from spacing, not frequency: one quotable line per episode, at the turn or the last beat,
  and the other scenes' titles don't rephrase it (scene mode reads the rephrasing as
  duplication, P0-3). The one echo allowed is the §5 loop ending — the cta's last sentence
  handing back to the cover's first line is a designed return, not a repeat.
  `SB_DOC.craft.signature` names the shot; the document warns when it's neither the turn nor
  the last beat.
- **A serialized end cuts at the bill, not at the solution.** Signal's cliffhangers: the case
  is solved and the price arrives in the same minute — someone else is dead now — cut. The cta
  of a serialized episode opens its outward loop on what this episode's answer costs, not on
  "next time"; the tease that connects (the opposite of scene-mode P0-9) is the consequence.
  And the last frame is the protagonist's face, close — what the viewer carries out is a face,
  not a summary card.

## 8. Restraint sets the price of the burst

나의 아저씨 has almost no crying in it. The camera holds the protagonist's blank face for three
seconds at a time; she endures once, twice, three times; then the one release isn't tears — she
runs, half a city, and the held-back charge comes out as motion. The amount held back is what
the release is worth: three holds make one burst land, and a burst after no hold is just
loudness. Field practice (lecture reading) — and the same mechanism the rule of three runs on
(§6): two beats set the pattern, the third breaks it.

- **Fields: `shot.feel` across the body, plus `duration`.** On a story arc the body is where the
  antagonist provokes and the protagonist holds — write the holds as a rising series in `feel`
  ("held — first time", "held — harder, the jaw", "held — it's about to go"), never the same
  note three times. §2 reads three identical feels as a flat stretch; a hold is **deepening in
  the same pole**, which §2 already counts as a turn, and the feel text is what tells the
  reviewer which of the two it's reading. A held face gets held time too — 3 s on a face doing
  nothing is the point, not a stretch to cut (the 2–4 s cadence still wants something on
  screen to change, so hold the face and move the caption). List the holds in
  `SB_DOC.craft.holds` and the release in `craft.burst` (storyboard SKILL §6) — the document
  tags them and warns when two holds share a `feel` or the burst comes before the last hold.
- **The burst is an action, not the emotion.** Write the release as something the character
  does — runs, throws, laughs at the wrong moment — and let `feel` name the emotion underneath.
  A release that is the emotion itself (crying, shouting) is the one the viewer has already
  priced.
- **On informational episodes the same shape is the withheld figure** (§5): a body that holds
  back the number that makes the answer surprising is holding, and the reveal is the burst.
  Hold once there, not three times — a short has no room for more.

## 9. The turn is a double hit — the fortune flips and the plant re-reads in the same shot

Aristotle's pair: *peripeteia* (the reversal — the protagonist's situation flips) and
*anagnorisis* (the recognition — something true comes into view). Put them in the same moment
and the catharsis is at its largest; put them in separate scenes and each is half the size. The
lecture's point is that the AI shorts drama already runs on this 2,300-year-old rule whether its
author knows it or not. Craft canon (*Poetics*).

- **Field: the story arc's `beat:"turn"` shot.** The turn already has to be the tightest frame
  (directing-grammar §6 rule 12) and the peak (§7); this rule says what happens inside it — the
  situation reverses **and** the plant (§3) re-reads. Recognition here means the misdirection
  resolving — the viewer sees the clue was there and reads the earlier scenes again — **not the
  outcome**: the result beat is still the first place the answer is on screen (scenes-schema
  §playback order), and a turn that names the payoff has closed the loop a scene early. A turn
  that only flips fortune is a plot event with no click; one that only recognizes is exposition
  with no stakes.
- **Turns are plural.** The lecture's 25 · 50 · 75 % rule: a piece changes direction at each
  quarter, not once. On a 60 s story short those are the seam from setup into build (the goal
  meets its first obstacle), the double-hit turn, and the payoff's own reversal (what it became
  isn't what anyone was making). §1's connective at those three seams should read "그런데" — a
  quarter mark that reads "그래서" is a turn that didn't turn.
- **The lecture's fold of the three-act into five minutes**, kept here as a reading aid — the
  proportions the schema sets for our 35–75 s story arc (setup under a fifth, turn around
  two-thirds, payoff the last quarter) stay the source of truth. 0–5 %: the unjust situation,
  no line. 5–15 %: who the protagonist is and what they want, no explaining line. 15–30 %:
  the clue objects as two-second inserts. 30–55 %: the antagonist provokes, the protagonist
  holds (§8). ~55 %: the double hit. ~75 %: the catharsis. The last 5–7 %: don't resolve
  everything — cut on a bigger hook, and the last frame is the protagonist's face, close (§7).
- **After the hit, hold a shot** (directing-grammar §6 rule 13) — the re-reading needs a second
  of screen with nothing new on it.

## 10. Rules are verified, not explained

Signal is a fantasy with exactly one impossible thing — an old radio — and three constraints on
it: it can't be opened at will, the information comes in fragments, and changing the past
rewrites the present. Everything else is autopsy, profiling and office politics, and that
realism is what the one device buys. None of the three rules is ever explained: the first call
says "dig there and you'll find a body", the profiler digs that night, bones come up —
prophecy, act, confirmation, and the audience has accepted the rule without a line of
exposition. The lecture's verdict: **the moment you write an explainer character (설명충),
you've proven you couldn't write the script.** Craft canon (show, don't tell, in its sharpest
form); the readings are field practice.

- **Fields: the story arc's `hooking` narration and any `quote`.** The setup names the one
  device and its constraint and then shows it working once — a claim, an act, a result, three
  shots at most — before the body leans on it. A `quote` whose only job is to tell the viewer
  how the world works, or a hooking segment that explains the premise instead of showing it,
  is the explainer character (scene mode reads it as a correction directive on a story arc,
  not a P0). Write the device into `SB_DOC.craft.device` — `{ what, rule, shown: [claim, act,
  result] }` — so the three verifying shots are tagged on the document.
- **One device, its constraint written.** A story premise carries one impossible or unusual
  thing, and the tension comes from what it can't do. Two devices dilute each other; a device
  with no constraint has no bill.
- **Every solution has a bill.** Signal's third rule is the engine of every cliffhanger: solve
  the case and the present is rewritten — not for the better. On a story arc the cost of the
  answer is what the cta cuts on (§7); on a serialized channel it is the connective into the
  next episode.
- **On informational episodes the same rule is "evidence before the statement"** — put the
  result on the table and let the viewer see it work before the narration says what it proves
  (the three-jobs rule, scenes-schema §narration segments). Don't carry the explainer verdict
  over: explaining is the informational body's job, and the tell is only a premise told
  instead of shown.

## 11. The storyline is an investigation, not a diary

Informational material arrives as a timeline — first we installed, then we hired, then it
broke. Telling it in that order is the named anti-pattern of informational long-form (the
**chronological trap**): the strongest moment sits minutes deep behind context nobody asked
for yet, and the seams read "and then", which §1 already bans one cut at a time. This rule
bans it at the storyline level: lay the episode out as an **investigation of one question**,
and let the storyboard skill's §2.5 HITL settle which investigation shape 전개 #1 rides
inside, before any scene exists (the seven-item skeleton around it is fixed at §2.2). Survey with graded sources:
[docs/research/2026-08-29-longform-storyline](../../../docs/research/2026-08-29-longform-storyline/).
Our own retention report (2026-08-26, n=4) points the same way — the mystery-shaped subject
held a flat curve and finished first.

Four rules hold whatever shape gets picked:

- **Cold open.** The first scene is the strongest moment or the strongest piece of evidence
  — the failure on screen, the number that shouldn't be possible — never the start of the
  timeline. Every tier of the sourcing agrees: the leaked MrBeast handbook calls the first
  minute the biggest exit and puts the wow element inside it (field practice), YouTube's own
  playbook tells how-to content to open on the finished result (platform official, **long-form
  how-to only**), and Harris front-loads the visual anchors (field practice). **A short never
  opens on the finished result** — the cover is a gap, and the last drip is the first place
  the answer is complete (scenes-schema §playback order).
- **The promise sentence.** Inside the opening the viewer hears, in one sentence, what they
  will know or be able to do by the end. Curiosity alone underdelivers for informational
  content — the promise is the title and thumbnail's claim said out loud, and the episode is
  then judged on keeping it.
- **The false-answer beat.** When the material has an answer most viewers would guess first,
  the body's first beat sets that answer up and takes it apart with evidence. Presenting only
  the correct explanation leaves viewers **more confident in what they already believed**
  (Muller 2008 — measured, the strongest-backed beat in this file). "요금 폭탄인가? →
  아니었다, 98%는 캐시 재사용" is the shape.
- **Context is a bridge, not a block.** Installs, definitions, backstory — deliver them in
  short bridges at the moment the investigation needs them, and push the heaviest ones past
  the midpoint (attention past the middle tolerates longer explanation; the front does not —
  the MrBeast handbook's segment ladder says the same from the other side). A "setup chapter"
  standing in front of the first tension is the trap wearing a chapter title.

Six named body shapes — the §2.5 menu (field practice; beat lists from the structure survey):

| Structure | Beats | Fits |
|---|---|---|
| Curiosity loop | mystery → false answer → complication → turn → resolution → takeaway | deep dives, retrospectives, "why did X happen" — the informational default |
| Problem stack | symptom → surface fix (fails) → deeper cause → … → root cause → real fix → synthesis | troubleshooting, technical deep dives |
| Transformation arc | before → stakes → catalyst → process → setback → after → lesson | challenges, "I tried X" |
| Expert contrast | common approach → expert approach → results side by side → bridge for the viewer | comparisons, craft content |
| Ticking clock | constraint → strategy → progress → obstacle → adaptation → outcome | deadline and limited-resource builds |
| Reveal ladder | criteria → ascending items → top pick → bonus | rankings, listicles |

The structure names the body's beat pattern; the playback contract stays `arc`
(scenes-schema §playback order). The arc is storyboard §2.3's call — unfinished-sentence
material is `story`, the rest `answer-first` — and the shape lays 전개 #1 out inside whichever
arc; on `story` a problem stack's root cause is the turn.

Checks the pass runs (§10's spirit — verified, not explained):

- Read the body's scene order against event time. Matching one for one is not a defect by
  itself, but it is the trap's fingerprint — ask what the cold open is and whether the first
  tension lands inside the opening window (short-form ~20s, long-form ~60s).
- Find the promise sentence in the opening. A hook that only teases has not made one.
- If research holds a plausible wrong answer that no scene takes apart, the false-answer
  beat was skipped.
- Find the heaviest context stretch. If it stands in front of the first tension, it is a
  block, not a bridge.

## 12. The arc goes down before it comes up — catharsis is release that was paid for

Catharsis is not a strong feeling; it is a feeling let go after being held. Aristotle's
purgation, StudioBinder's repression → breaking point → aftermath, Zak's lab reading of the
same shape (cortisol while the stakes are live, oxytocin when they resolve, and a flat story
producing neither — no attention, no action afterwards): three descriptions of one mechanism,
and the mechanism has a prerequisite. Something has to be pressed down first. Reagan et al.
(2016, **measured** on 1,327 Gutenberg novels — the transfer to a 60 s short is our bet) found
six arc shapes and that the most-downloaded ones all dip before they lift: Icarus, Oedipus,
and two "man in a hole" arcs back to back. A straight climb was the least popular shape. The
user's own reading of the v4 draft — "밋밋하다" — was this: a hook that only asked, a body that
stayed at one level, an end that summarized.

- **Read `shot.feel` as a curve with a sign.** §2 already refuses three identical feels; this
  adds the direction. Give every shot's feel a polarity when you chart it in storyboard.md
  (− / + and how far), and the chart has to reach its minimum before `craft.burst` and its
  maximum at the turn or the result. On a story arc the default shape is man in a hole: cover
  and hooking already below zero (something is at stake), the body deepening the low — §8's
  holds are the descent, written as a worsening series, not a repeated one — the turn flipping
  the sign (§9), result and cta holding the high. A chart that never goes below zero has
  nothing for the §7 peak to rise from; one that never comes back above leaves the viewer with
  the cortisol and none of the release, which is the episode that gets watched and not acted on.
- **Stakes before the question — the first line names what is lost.** A curiosity hook asks;
  a stakes hook puts the loss on the table and lets the viewer hold it while the ordinary
  scene runs (§4's bomb). Losses weigh about twice what gains do (Kahneman & Tversky 1979,
  **measured**; the same 2× in the Korean Shorts hook guides is field practice) — "이 항아리가
  썩었으면, 이 집은 봄까지 채소를 한 입도 못 먹어요" stops a thumb harder than "김치는
  맛있으라고 만든 게 아니에요", and the second sentence is still true inside the first.
  Two lanes: on **answer-first** the loss is the viewer's own (`hookType:"fear"`, guardrails
  ①–③ unchanged — the door is a step they can take). On a **story arc** the loss belongs to
  the character, and it rides §4's "the viewer knows first" lane: the door is paid inside the
  story (turn and result), not as advice to the viewer. Write that reason on the cover's
  `shot.info` so copy mode reads a narrative stake, not an unanswered threat.
- **Pick high-arousal feelings for both poles.** Berger & Milkman (2012, **measured** on
  NYT sharing, not video): awe, anger and anxiety travel; sadness — deactivating — does not.
  So the low is dread or anger ("열기 전까진 아무도 몰라요, 해마다요"), not melancholy, and the
  high is awe or relief ("안 상했어요 — 익었더라고요"), not "nice". The Korean short-drama
  recipe is the same list from the practice side — conflict inside 1–3 s, then 억울·분노·
  긴장, then the hint of a turn, then cut at the most curious moment (field practice). A body
  resting on a low-arousal feeling is where the swipe lives, whatever its sign.
- **Deliver the ending before considering an ask.** Read [story-quality.md](story-quality.md).
  On both formats, resolve the opening with specific evidence, action or a demonstrated
  result. A callback can make the opening mean something different on replay. Default to
  no CTA; if a relevant question or action helps, place it after the payoff. Do not require
  two closing lines or a memory poll. Subscribe and like asks stay banned.
- **Write the hook and the last line first.** 윤수영 (first-generation short-form writer):
  two or three lines of hook and ending, then everything in between — and what makes a scene
  land is 의외성, not description (field practice). The v4→v5 rewrite was exactly this: the
  loss line and the callback line were written before any body scene was touched, and the
  body then only had to descend between them. **The place for those lines is the scenario
  page the user approves at the storyboard skill's §2.2** (since 2026-09-02; §2.5 only
  confirms it) — before a shot exists, because §4 is where a sentence can first be written
  down, and §4 asks for forty-odd values a shot at once (ep07's nine shots carry 449 between
  them), so a rule about writing order can't live there. The 훅's first spoken sentence, the
  마무리 resolution and any chosen CTA are items on that page, and the sign of the feel
  curve sits on every item's header. Those approved lines go across verbatim; everything else
  §4's story pass rewrites into the board in its own words, and §7 is where the sentences
  are read. What the user agrees to at §2.2 is the shape — this stake, this callback, this
  curve — while scenes are free. Unattended runs copy the same three lines into the
  `scenes.js` header comment; there is no gate to mirror.

  **The two layers this splits are measured.** When ep07 was rewritten after the user called
  the draft flat — a new hook, a new last line, a worsening feel series across five shots — 24
  of the values that changed were `narration`, `title`, `shot.feel` and `shot.info`, while
  `bgPrompt`, `shot.space`, the four camera slots and the engine route changed **zero**, and
  not one of the nine images was remade. That is why storyboard §4 fills the board in a story
  pass and then a machine pass: the story layer already comes apart from the layer that costs
  money, and authoring them in one breath is what makes a story fix feel expensive.

Checks the pass runs (§10's spirit):

- The feel chart in storyboard.md carries a sign per shot; the minimum precedes `craft.burst`,
  the maximum sits on the turn or the result.
- The cover's first spoken sentence names a loss or a stake before it names a question.
- The 마무리 pays the promise with specific content. CTA is optional and follows the answer.
  No line in the episode contains a subscribe or like ask.
- Every feel is earned by a development. Quiet discovery, sadness and a pause can work;
  intensity labels do not compensate for a scene without a purpose.

## 13. Cut points first, then half a step

김은숙 (파리의 연인 2004 · 시크릿 가든 2010 · 태양의 후예 2016 · 도깨비 2016 · 미스터 션샤인
2018 · 더 글로리 2022 · 다 이루어질지니 2025) stated her method twice, twelve years apart, and
the two accounts agree almost word for word. Two moves. **The cut points are fixed before the
content**, and the content that fills each gap is the cliché **moved exactly half a step**. The
tie-breaker under both is stated as flatly in 2011 ("드라마는 예술이 아니라 한 시간짜리
엔터테인먼트다") as in 2023 ("재미와 의미 중 하나를 택해야 한다면 단연 드라마는 재미가
먼저다") — when a scene can be true or interesting and not both, the rules above already chose
truth, and this one says the remaining freedom goes to interest. Craft canon (a named
practitioner's stated method; no measurement behind any of it, and none of it was calibrated on
short-form). Survey with sources:
[docs/research/2026-09-04-kim-eunsook-craft](../../../docs/research/2026-09-04-kim-eunsook-craft/).

> "저는 1회부터 20회까지 각 편당 엔딩지점만 잡고, 인상적인 장면 10개 정도만 미리 만들어 놓고
> 스토리를 만들어요." — 『방송작가』 2011년 2월호

- **Write each drip's out-line before its body.** §12 already puts the hook and the last line
  first; this extends the same order to every segment. Before writing a drip's `narration`,
  write the sentence it goes out on — the one that makes the next drip necessary — and only then
  fill the middle. §1's connective is the test: an out-line that doesn't force a "그런데" or a
  "그래서" into the next shot is a pause, not a cut point. On long-form the same move lands on
  the chapter seam. This is what stops the middle of an episode from being written forward until
  it runs out of things to say, which is the shape a "and then" chain arrives in.
- **Name the set pieces before the joins.** Ten scenes fixed in advance carried a 20-episode
  series; on a 4–12 shot short that scales to **two or three shots you can name as moments**
  before anything else is designed. Write them as what the viewer feels there in `shot.feel`,
  then let the rest of the board be what connects them. A board where every shot got equal
  design attention has no peak, which §7 needs exactly one of — and the way that failure reads
  from inside is that you cannot say which shot is the one.
- **List at least five ways the moment could go, then pick.** Her definition of character is
  procedural — "사건에 부딪혔을 때, 사건을 해결해 나가는 방식" — so the work at a named moment is
  enumeration, not invention. Write down five things that could happen there before writing the
  `shot.info`/`narration` pair. The first one to arrive is the one the viewer also thought of;
  five exists to get past it. (Her own worked example: cream on the woman's lip — tease her, wipe
  it off, pretend not to see, kiss her. The fourth became 시크릿 가든's most-parodied scene.)
- **Half a step, not a whole one.** This is the pick criterion, and she words it the same way
  across twelve years — "시청자들이 상상할 수 있는 것보다 반 보 더 앞서서" (2011), "한보 말고
  반보만 신선하게 써라" (2023). Keep the familiar material and move one property of it: the
  재벌 who reads books, the school-violence revenge staged as a game of 바둑. A whole step buys
  nothing — a new world, an unexplained term, a premise that needs setup before it lands — and
  her own filmography carries the counter-example (더 킹, 2020: opened at 11%, bottomed in the
  6% range and closed at 8.1%, with critics naming "who is who" confusion in the parallel world
  as the cause — 국민일보·PD저널). On our surface a
  whole step is the shot whose picture the narration has to explain, and the fix is never more
  narration — it is moving the staging back half a step toward what the viewer already knows.
- **The heavier the material, the lighter the handling** — "끔찍한 신일수록 깜찍하게 써라". The
  half step applied to register rather than content: the fact stays, the way it is handled moves
  one notch off what the fact implies. This does not fight §12's high-arousal rule — the dread
  stays dread in `shot.feel`, while the sentence carrying it doesn't also perform gravity. A
  heavy fact narrated heavily raises the entry barrier twice, and 더 글로리's first episode is
  her worked case of paying that barrier deliberately rather than by accident ("폭력의 수위가
  높을수록 진입 장벽이 높아진다는 것을 알았기에 감독님과 고민을 많이 했다").

**One thing here is not portable, and no checker will stop you.** Her signature lines are
literary register by her own account — "저는 드라마는 일반인들이 쓰지 않는 화법을 쓰는 것이라고
생각했거든요. 그래서 좀 문어체적인 그런 대사가 나와요". The rule that blocks that register,
`korean-style` D9, is deliberately **off on the `narration` surface** — it scopes to threads and
captions, because narration is dialogue already bound to the 8–25-character schema — so a
literary line reaches the video with the machine silent. What does run on narration at full
priority is the D10 family, and the shapes her lines take are mostly in it: the noun-stopped
sentence, the announced reveal, the abstract subject that rewrites the world in one verb, the
mirrored antithesis. The rest of the register passes.

So this one is a hand rule. **Take the spacing, not the register** — §7 already carries the
spacing (one quotable line an episode, unrepeated) and that is the whole of what transfers. A
sentence written to sound like 김은숙 is either a D10 hit the vocabulary read (§4.5) reports or
something only a person rereading the narration will catch, and there is no third outcome where
the checker saves it.

**Two failure modes she owns, because both are ours too.**

- **A memorable sentence is not a memorable moment.** She conceded the charge herself at the
  도깨비 press conference — "'서사 없이 대사발만 있다'는 지적 … 명백한 제 잘못" — and named the
  episode it broke on. The check is mechanical: for each shot named as a set piece, say what
  *happens* in it. A set piece whose entire content is a good sentence is §2's flat stretch in
  better clothes, and it survives a narration read because the sentence itself is fine.
- **An ending must not cancel what it charged for.** Three of her endings drew the same
  complaint and each one took something back — 파리의 연인 revealed the story had been a
  character's novel, 태양의 후예 undid a fatal wound at no cost, 시크릿 가든 swapped the tragedy
  it had designed for a happy ending she herself then rated "20부가 재미없었어요". The one
  ending critics called complete, 미스터 션샤인, paid its bill in full. On our surface the same
  move is a 마무리 that tells the viewer the episode was less than it seemed: "사실 확실한 건
  아닙니다", "결국 별거 아니었죠", a frame reveal. Uncertainty belongs in the body where the
  viewer can still do something with it — §10 already says a rule is verified, not asserted — and
  the last beat hands over what the episode earned. This is scenario-mode P0-14.

Checks the pass runs (§10's spirit):

- Every drip's last sentence was written before its body, and reads as a "그런데" or a "그래서"
  into the next shot.
- Two or three shots are nameable as the episode's moments, and each has an event under it, not
  only a sentence.
- No shot needs its narration to explain what its picture is.
- The 마무리 takes nothing back from what the body charged the viewer for.

## Sources

- Parker & Stone, NYU writers-room session (2011) — but/therefore. Craft canon.
- Robert McKee, *Story* + [mckeestory.com "Do Your Scenes Turn?"](https://mckeestory.com/do-your-scenes-turn/) — value turns. Craft canon.
- Chekhov's gun / plant-and-payoff + fair-play twist rules — [StudioBinder](https://www.studiobinder.com/blog/chekhovs-gun/), [ProseEngine](https://proseengine.app/blog/how-to-write-a-plot-twist). Craft canon.
- Hitchcock/Truffaut interviews — the bomb under the table. Craft canon.
- Witte & Allen, ["A Meta-Analysis of Fear Appeals"](https://journals.sagepub.com/doi/10.1177/109019810002700506) (Health Educ Behav, 2000) — fear × efficacy. Measured.
- Muller, "Saying the wrong thing: improving learning with multimedia by including misconceptions" (J. Computer Assisted Learning, 2008) — the false-answer beat (§11). Measured.
- ["How to succeed in MrBeast production"](https://simonwillison.net/2024/Sep/15/how-to-succeed-in-mrbeast-production/) (leaked handbook, 2024) — first-minute exit, expectation match, segment ladder (§11). Field practice.
- [YouTube Creator Playbook — the first 15 seconds](https://blog.youtube/creator-and-artist-stories/youtube-creator-playbook-tips-first-15/) — open on the finished result (§11). Platform official.
- Structure survey (chronological-trap naming, the six body shapes, layered loops) — blog grade, collected and graded in [docs/research/2026-08-29-longform-storyline](../../../docs/research/2026-08-29-longform-storyline/). Field practice.
- Loewenstein, ["The Psychology of Curiosity"](https://www.cmu.edu/dietrich/sds/docs/golman/golman_loewenstein_curiosity.pdf) (1994, and Golman & Loewenstein 2015) — information gap. Craft canon / measured.
- Redelmeier & Kahneman, ["Patients' memories of painful medical treatments"](https://doi.org/10.1016/0304-3959(96)02994-6) (Pain, 1996) + Fredrickson & Kahneman (1993) — peak-end rule. Measured (clinical/lab, not short-form).
- Own-channel analytics, 4 Shorts (2026-08) — retention rank vs. view rank, watch-time
  curves of the best and worst episodes. Measured (n=4, body-drop pattern from one curve).
- Long-form re-hook cadence, pattern interrupts, loop endings — practitioner guides
  (retention-editing blogs, 2025–2026). Field practice, unsourced measurements.
- Stand-up structure guides (setup/punchline, rule of three) — practitioner playbooks. Craft canon.
- AInspire, ["망하는 시나리오 vs 터지는 시나리오, 딱 '이것'이 다릅니다"](https://youtu.be/L89Z8oOiZuk)
  (YouTube, 2026-07-10, 16 min; transcript from a local Qwen3-ASR run on 2026-08-29) — the
  three dramas read as six shared moves (result first · the viewer knows first · plant
  trivially and pay off from the same angle · ration the line · music out at the peak · fixed
  format, moving content), the three-act folded into a 300 s seven-beat drama, and the readings
  behind §8–§10 and the §3 · §4 · §5 · §7 additions. Craft canon where it cites Aristotle and
  Hitchcock, field practice for the readings.
- Aristotle, *Poetics* — peripeteia and anagnorisis, the double hit (§9). Craft canon.
- Aristotle, *Poetics* — katharsis; [StudioBinder, "What is Catharsis"](https://www.studiobinder.com/blog/what-is-catharsis-definition/) — repression → breaking point → aftermath (§12). Craft canon.
- Paul J. Zak, ["Why Your Brain Loves Good Storytelling"](https://hbr.org/2014/10/why-your-brain-loves-good-storytelling) (HBR, 2014) — cortisol under tension, oxytocin at resolution, flat arcs producing neither (§12). Measured in the lab, relayed as an essay.
- Reagan, Mitchell, Kiley, Danforth & Dodds, ["The emotional arcs of stories are dominated by six basic shapes"](https://link.springer.com/article/10.1140/epjds/s13688-016-0093-1) (EPJ Data Science 5:31, 2016) — six arcs on 1,327 Gutenberg novels; the most-downloaded dip before they lift (§12). Measured on novels, not short-form.
- Berger & Milkman, ["What Makes Online Content Viral?"](https://journals.sagepub.com/doi/10.1509/jmr.10.0353) (J. Marketing Research, 2012) — high-arousal emotions (awe, anger, anxiety) share more, sadness less (§12). Measured on NYT articles.
- Kahneman & Tversky, "Prospect Theory: An Analysis of Decision under Risk" (Econometrica, 1979) — loss aversion, the ~2× (§12). Measured.
- [Alphacut, "유튜브 쇼츠 조회수 안 나오는 진짜 이유 — 후킹 전략 5가지"](https://alphacut.video/blog/shorts-hooking-strategy) · [피카클립, "숏드라마가 터지는 이유"](https://fikad.boo/blog/183059) — loss-first hooks, the short-drama beat recipe (§12). Field practice, unsourced.
- [레이디경향, 스토리피아 랩 인터뷰 ③ — 윤수영](https://lady.khan.co.kr/culture/article/202410310700011) (2024-10) — hook and ending first, 의외성 (§12). Field practice.
- Short-form CTA practitioner guides ([Zebracat](https://www.zebracat.ai/post/best-youtube-shorts-call-to-actions), [The Indie Practice](https://www.theindiepractice.com/blog/short-form-video-call-to-actions-cta-ideas)) — one CTA, tied to the message, no stacked asks (§12). Field practice.
- Collected and graded in [docs/research/2026-08-30-shortform-catharsis](../../../docs/research/2026-08-30-shortform-catharsis/).
- 김은숙 interview, 『방송작가』 2011년 2월호 — "신데렐라 이야기의 종결자 <시크릿가든> 김은숙
  작가" (김주영 책임편집위원, `ktrwawebzine.kr/common/pdf/2011/2011-02.pdf`) — the endings-first
  grid, the ten set pieces, the five options, the half step, character as a way of solving,
  the literary register, her own verdict on the 시크릿 가든 finale (§13). Craft canon.
- [씨네21, 올해의 작가 김은숙 인터뷰 ①](https://cine21.com/news/view/?mag_id=104078) ·
  [②](https://cine21.com/news/view/?mag_id=104079) (2023) — "한보 말고 반보만", "끔찍한 신일수록
  깜찍하게", holding the viewer first and letting them see the story afterwards, 재미 before 의미,
  the 더 글로리 opening, the 시크릿 가든 ending she changed (§13). Craft canon.
- [조이뉴스24, 도깨비 제작발표회](https://www.joynews24.com/view/992623) (2016) — her own
  concession that strong lines had been standing in for narrative (§13). Craft canon.
- [경향신문, 김은숙 드라마는 왜 유독 결말에 관심이 쏠릴까](https://www.khan.co.kr/article/201701171141001)
  (2017, 윤석진·정덕현) · [서울신문, 황당 엔딩 BEST3](https://www.seoul.co.kr/news/entertainment/broadcastN/2016/04/18/20160418500298)
  (2016) · [PD저널](https://www.pdjournal.com/news/articleView.html?idxno=71429) ·
  [국민일보](https://www.kmib.co.kr/article/view.asp?arcid=0014688869) (더 킹, 2020) — the
  endings that took something back, and the whole-step premise that lost its audience (§13).
  Field practice.
- Collected and graded in [docs/research/2026-09-04-kim-eunsook-craft](../../../docs/research/2026-09-04-kim-eunsook-craft/).
