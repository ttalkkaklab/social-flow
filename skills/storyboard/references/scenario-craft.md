# Scenario craft — six rules that run underneath the beats

The beat skeleton (`scenes-schema.md` §playback order) says **where** scenes go. This file
says **how scenes push each other** — the craft layer classic screenwriting settled long
before short-form existed, cut down to what a 4–70-shot storyboard can actually use. The
storyboard skill applies these while designing scenes (§4); the reviewer's scene mode reads
them as the yardstick behind its flow and role checks. None of them adds a `scenes.js`
field — every rule lands on fields that already exist (`beat` · `shot.feel` · `narration`
· `hookForm` · `chapter`).

Survey with sources: [docs/research/2026-08-25-scenario-craft](../../../docs/research/2026-08-25-scenario-craft/).
Grades follow the repo convention — **craft canon** (the standard playbook of a named
practitioner or theorist, no measurement), **measured** (published measurement), **field
practice** (practitioner reports, unsourced).

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
- Beat seams have natural connectives — hooking → result is a "therefore" (you have this
  problem, *therefore* here's the finished thing), body → turn is a "but" (everyone gave up,
  *but* one person looked again). A seam whose natural connective doesn't come out is
  usually a scene doing the wrong job, not a sentence problem.
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
  plant. Note the plant → payoff pair in the §7 hand-off note so the reviewer and the user
  can check it.
- One red herring is legitimate tension (it makes the viewer commit to a wrong read);
  stacked red herrings burn trust.

## 4. Fear runs on suspense, and it needs a door

Hitchcock's bomb: an explosion out of nowhere buys fifteen seconds of surprise; the same
bomb **shown to the audience first**, with a clock, buys fifteen minutes of suspense —
the ordinary conversation above it becomes unbearable because the viewer knows more than
the people on screen. For fear-type episodes (`hookType:"fear"`): put the threat and its
clock on the table in hooking, then let the ordinary scene run under it. Don't save the
threat for a jump at the end — surprise is the weaker tool. Craft canon (Hitchcock/Truffaut).

And the fear must open a door. Witte & Allen's meta-analysis (2000, **measured**): strong
fear beats weak fear, but only when paired with high **efficacy** — an action the viewer
can actually take, whose result they can see. Strong fear with no door produces defensive
avoidance — here, the swipe. This is the measured base under the §opening strategies fear
guardrail ② ("the body answers that threat"): the answer has to be a doable step, not
reassurance that it'll be fine.

## 5. Curiosity is a ledger — every loop opened gets a payer's name

Loewenstein's information-gap theory (1994): curiosity fires when a **specific, closable**
gap opens between what the viewer knows and what they want to know. Four openers — a
question, an event whose outcome is unknown, an expectation violated, someone else knows
something. A gap too far from what the viewer already knows lands as frustration, not
curiosity — the hook has to sit close enough that the answer feels reachable. Craft canon
(the theory) with the gap-specificity point measured in lab work.

- **Bookkeeping**: short-form carries **one main loop** (the `hookForm`) plus at most one
  sub-loop; long-form carries 2–4. Every loop names, at open time, the scene that pays it —
  put the pairs in the §7 hand-off note. An unclosed loop is the "stopped, then left"
  penalty plus trust damage on the next episode (§six hook forms holds this for the main
  hook; this extends it to every loop opened mid-episode).
- **Long-form re-hooks** (field practice): attention decays over 60–90s stretches, so each
  `chapter` opens with its own one-line mini-hook — why this chapter matters — and around
  the 50–70% mark one deliberate re-hook resets the room (a question to the viewer, a "the
  next one is the part people argue about"). A chapter title is a search phrase; the
  mini-hook is a narration sentence, and it's the chapter's own catch job.
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

## Sources

- Parker & Stone, NYU writers-room session (2011) — but/therefore. Craft canon.
- Robert McKee, *Story* + [mckeestory.com "Do Your Scenes Turn?"](https://mckeestory.com/do-your-scenes-turn/) — value turns. Craft canon.
- Chekhov's gun / plant-and-payoff + fair-play twist rules — [StudioBinder](https://www.studiobinder.com/blog/chekhovs-gun/), [ProseEngine](https://proseengine.app/blog/how-to-write-a-plot-twist). Craft canon.
- Hitchcock/Truffaut interviews — the bomb under the table. Craft canon.
- Witte & Allen, ["A Meta-Analysis of Fear Appeals"](https://journals.sagepub.com/doi/10.1177/109019810002700506) (Health Educ Behav, 2000) — fear × efficacy. Measured.
- Loewenstein, ["The Psychology of Curiosity"](https://www.cmu.edu/dietrich/sds/docs/golman/golman_loewenstein_curiosity.pdf) (1994, and Golman & Loewenstein 2015) — information gap. Craft canon / measured.
- Long-form re-hook cadence, pattern interrupts, loop endings — practitioner guides
  (retention-editing blogs, 2025–2026). Field practice, unsourced measurements.
- Stand-up structure guides (setup/punchline, rule of three) — practitioner playbooks. Craft canon.
