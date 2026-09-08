# The scenario stage — three candidates, scored, then one pick

Read [story-quality.md](story-quality.md) before drafting. It governs the meaning, evidence
and ending of every candidate. Keep the seven headings, but modern parallels are optional,
마무리 delivers the supported resolution, and CTA may be `없음` with a reason. No score
waives a missing message or unpaid promise. This supersedes conflicting item rules below.

`scenario.md` is what the storyboard skill writes before §4 opens a shot: one page that
lays out the episode as an investigation while a story candidate still costs a page
instead of a board. Both formats run this stage. On long-form a candidate used to be a
54–66 KB `scenes.js`; on a short the board is small, but a direction row (question · hook
· hero) is too thin to judge whether a viewer would stay — that is the "밋밋하다" failure
the 95-point loop exists to catch.

The loop happens **after first research and the three messages, before the pick** (storyboard
§2.1 · §2.2). Three different episodes this topic could be — one topic cut from each message
— are written as three pages **in one fixed shape — the seven items below** (user directive,
2026-09-02) — each one is scored, the user sees all three in full and picks among the ones
that cleared 95. Additional research and the board come after that, on the winner only.

## Contents

- [Its status: an upstream input, not a second contract](#its-status-an-upstream-input-not-a-second-contract)
- [Messages first — three things today's viewer takes away](#messages-first-three-things-todays-viewer-takes-away)
- [Viewer engines — what the 95 bar actually scores](#viewer-engines-what-the-95-bar-actually-scores)
- [The three-candidate loop](#the-three-candidate-loop-storyboard-22-autoproduce-gate-6a)
- [What the page carries — the seven items](#what-the-page-carries-the-seven-items)
- [Template](#template)
- [What it does not do](#what-it-does-not-do)

## Its status: an upstream input, not a second contract

`research.md` is the model. It is written before the board, it is read while the board is
written, and afterwards it is a record — nothing downstream parses it and no gate counts
it. `scenario.md` takes exactly that place. `scenes.js` stays the one data source for
production, and this file never becomes a place copy is maintained.

The repository's standing rule is that a document holding a second handwritten copy of the
lines drifts — `storyboard.md` and `script.md` are named as the documents that suffer it,
which is why `storyboard.html` loads `scenes.js` directly and `make-script.js` renders
rather than transcribes. A prose scenario is the third copy unless all four devices below
hold.

### The four devices

1. **The prose is raw material, not copy.** §4 rewrites it into the board in the board's
   own words; it does not paste sentences across. This is the rule `ingest` already applies
   to a recording transcript ("raw material, not a script") and it applies here for the
   same reason.
2. **Approved anchor lines are the exception.** The 훅's first sentence, the 마무리 resolution and
   any chosen CTA line go across verbatim as §4's first edit — they are the lines
   scenario-craft §12 says to write first, and the user approved them with the pick. From
   the moment they land in `scenes.js`, `scenes.js` is where they live.
3. **It freezes when §4 opens.** Stamp `frozen: <YYYY-MM-DD HH:MM>` in the frontmatter on
   entering §4. After that the file is a record; a change of mind is made in the board and
   noted on the §7 screen, never by editing this page to match.
4. **The checker watches the clock.** `check-scenes.js` warns when `scenario.md` is newer
   than `scenes.js` — an upstream input that changed after its consumer is the drift this
   stage was built to avoid.

## Messages first — three things today's viewer takes away

The order is fixed (user directive, 2026-09-07): **research enough → decide three messages
for the viewer living now → cut one topic from each message → write one scenario per topic.**
A direction row written before its message is a topic looking for a reason, and the
"밋밋하다" page usually started that way.

### The message

After the first research pass closes (storyboard §2.1: ten or more searches, three or more
Verified rows) and before any direction row, write `research.md` §Messages — **three rows**.
A message is one sentence in the viewer's words: what a viewer of this channel, living now,
**understands, reconsiders or can do** after the episode (story-quality §Design step 2). It
names the subject, what happened or works, and why that matters to them today — not a topic
label, not an emotion label, not "협력이 중요하다". Three different messages, not three
wordings; each rests on Verified rows already on the page, and the row says which.

### The topic, cut from the message

Each direction row (D1–D3) cites its message (`M1`–`M3`, one message per direction — two
rows on one message leave a message with no episode, and the checker rejects that) and
writes the **주제** — the concrete subject this episode is about, the event, the mechanism or
the person that will deliver that message, in one sentence with the question it answers. The
hook form, engine and hero are chosen for that topic. The candidate page carries the message
verbatim under its title and its 주제 item names the subject; at §4 the message becomes
`COMPREHENSION.takeaway` and `STORY.thesis`, and the 주제 becomes `COMPREHENSION.question`.

### A topic is never a report of ignorance

"X는 알 수 없다", "X는 아직까지 모른다", "X는 미스터리로 남았다" are not topics — an episode
built on one has nothing to hand over at the 마무리, and the viewer who stayed for the answer
is told there is none (reviewer P0-14 is the same take-back one item later). The mystery may
open the 훅 — that is where `intrigue` lives — but the message and the 주제 name what the
evidence **does** establish: what changed, what it did to people, what the viewer can do with
it. 로즈웰 is not "무엇이 떨어졌는지는 아직 모른다"; it is "설명이 바뀌면 사람들은 무엇을 믿게
되나", which the record answers.

`check-research.js --direction` (and the close) rejects a message or direction sentence
that ends on ignorance — the predicate forms `알 수 없다/없어요/없습니다`, `모른다/모릅니다/
몰라요/모르겠다/몰랐다`, `아무도 알지 못한다`, `밝혀지지/풀리지/알려지지/규명되지 않았다`,
`미스터리다/미스터리로 남았다`, `수수께끼로 남았다`, `미제로 남았다`, and the English
`nobody knows`, `remains a mystery`, `we still don't know`, `we/they may never know`. Only those
endings — "아무도 모르게 옮겼다", "아무도 모르는 곳", "미스터리다운 매력", "미제로 남기지
않으려" all carry the same words with a different job, and the checker lets them through. A
modifier ("정체를 알 수 없는 물체가 떨어진 뒤 군은 설명을 바꿨다") passes for the same reason,
its predicate sitting elsewhere — you still read the sentence for what it hands over. The reviewer's scenario mode raises
P0-15 on a candidate 주제 that is one of these, or that carries no message.

## Viewer engines — what the 95 bar actually scores

Read [retention-direction.md](retention-direction.md) §1 before drafting the three pages.
Use its expectation, early payment and causal-link tests within the seven items below.
After narration approval, §2 carries those decisions into the board and the production
handoff. A numeric score is an editorial judgment, not a forecast of viewer retention.

On the attended path the user is the judge of this stage; the reviewer reads it only on the
unattended path, once, all three pages in one call (0.50.0). The 95 bar below is what that
read scores, and what you test each page against yourself before showing it. The thing it
scores is not wording (the page never ships) and not shot grammar (there are no shots yet). It scores whether a viewer would
**want the next beat** — and, since 2026-09-02, whether the seven items are all there and
each does its job.

Four engines. A candidate names one as primary and may name one as secondary. The three
candidates on one topic take **three different primaries** — three wordings of the same
engine are three copies of one episode, which §2.1 already bans.

| Engine | Viewer feeling | Working looks like | Not working looks like | Craft |
|---|---|---|---|---|
| `curiosity` 호기심 | "that's interesting — how?" | a specific, closable gap about a surprising fact, paradox, or identity, paid in installments | a topic announcement, a definition, "today we look at" | scenario-craft §5 |
| `fear` 공포 | "this could happen to me" | a threat and its clock on the table in the opening, plus a doable door later | a jump scare saved for the end, or a threat with no step the viewer can take | scenario-craft §4 |
| `intrigue` 궁금증 | "I need to know what happens" | an unresolved outcome or secret whose paying item is named | a teaser with no named payer, or an opening that states the answer and then has nothing left to pay | scenario-craft §5 ledger · hookForm `gap`/`secret` |
| `comedy` 코믹 | "wait — that broke the pattern" | a pattern the body sets, a punchline that breaks it last | "funny" as an adjective, a joke explained in the next sentence | scenario-craft §6 |

`curiosity` and `intrigue` are not the same engine. Curiosity is an intellectual gap
("how does this even work"). Intrigue is an open outcome ("did it, or didn't it" / "who" /
"will it hold"). A number-hook is usually curiosity; a secret-hook is usually intrigue.

Empathy and awe may ride as a secondary. They are not a fifth primary — a candidate whose
only move is "that's me" or "wow" with none of the four still fails P0-10.

**Stuffing all four weakly is a defect, not a strategy.** The kitchen-sink candidate
scores near zero on the mix axis. One working primary beats four named ones.

`hookType` on the later board stays `fear` · `empathy` · `curiosity` · `spoiler`. Comedy
and intrigue do not become new `hookType` values — a comedy candidate usually rides
`curiosity` or `empathy` on the cover; an intrigue candidate rides `curiosity` with
`hookForm:"secret"` or `"gap"`. The engine is a scenario-stage field; the cover tags are
still the four opening strategies.

## The three-candidate loop (storyboard §2.2 · autoproduce gate 6a)

Runs after `check-research.js --direction` exits 0, before `Chosen:` is written, on both
formats. Channels that skip research skip this whole stage with the three-direction pick.

### Write

For each of the three direction rows, write
`storyboard/candidates/d<n>.md` from the template below — the message verbatim under the
title, then the seven items, in order, on every candidate. Frontmatter carries `direction`,
`message` (the `M#` it carries), `engine_primary`, `engine_secondary` (or `none`), `score`
and `p0` (empty until the first read), `round: 0`. Each item is a
paragraph (전개 #3 is a numbered list of its cases); on long-form the 전개 paragraphs run
longer, they do not multiply.

**Write the page in the words the narration will use.** These sentences are not a pitch to
an adult reader — the 주제 line and the 훅 are what §4 turns into spoken narration, so a page
written in essay Korean hands the vocabulary read a rewrite instead of a swap. The floor is
korean-style §Eye level: a 만 9~10세 viewer follows the 주제 sentence with nothing else on
screen. A term the episode is about (계엄, 파운드리) comes in with its plain wording beside it
on the page too, because that is where `COMPREHENSION.terms` is decided later. Check the words on each page before showing it — storyboard §2.2's command, which reads only
the E findings out of `check-style.py --surface narration --json candidates/d<n>.md`. The
other rules belong to the spoken sentences at §4.5, not to a page of headings and notes.

### Score

**Attended (storyboard):** no reviewer reads the candidates — the user picks from the three
full pages, and the narration reads (storyboard §4.4 · §4.5) catch a story that does not
carry. Before showing a page, test it yourself against the engine and shape rules below:
does the 훅 stage a moment, does 전개 #1 open on the false answer when the research holds
one, does the feel curve dip, is each 전개's last sentence one you would cut on, and is the
staging half a step off what the viewer would have guessed rather than a whole step into
something that has to be explained before it lands (scenario-craft §13). Frontmatter
`score` and `p0` stay empty on this path; `round: 0`.

**Unattended (autoproduce):** delegate **all three pages in one call** to
`storyboard-reviewer` scenario mode — the three candidate paths, `research.md`,
`profile.md`, `scenario-craft.md`, this file, and each page's claimed primary. It judges
the three in one context and returns one tail per page:

```
STORYBOARD_REVIEW: mode=scenario candidate=d<n> score=NN p0=N primary=<engine> secondary=<engine|none>
```

Stamp `score`, `p0`, `round` on each file's frontmatter. **Do not start §4 from a page that
has not been read on this path.**

### Loop (unattended only)

There is one re-read, not a loop. If no page is at `score ≥ 95` with `p0 = 0`, apply the
findings to the best page, P0 first, and delegate that one page again — the second and last
call. Still short: drop the topic. Do not rephrase a failed page into a fourth candidate,
and do not read the same page a third time. (0.50.0 — the per-candidate loop of 0.49 ran up
to fifteen reads an episode at two million tokens each, measured, and the human pick on the
attended path made most of them redundant.)

A read that comes back `p0 > 0` is not a pass even at 95.

### Pick

**Show the three pages in full first** — for each candidate, the seven items as written
(the opening, three developments, earned resolution and optional CTA decision)
and its engine. A one-line option is not what gets approved; the seven items are. Then
the choice.

- **Storyboard / human-invocation autoproduce:** AskUserQuestion. Recommended is the page
  whose engine you can point at in its own sentences, first in the list.
- **Unattended autoproduce:** take the highest at 95 with `p0 = 0`. **None: drop the topic**
  (same counter as a facts-floor drop). Do not author a board from a page that failed the bar.

Write `Chosen: D# (<YYYY-MM-DD>)` into `research.md` §Directions, copy the winner to
`storyboard/scenario.md` (keep the candidate files — they are the audit of the other
two), then §2.3 additional research on that direction only. Unchosen candidates never
become a claim or a caption.

### After extra research

If §2.3 turns up a fact that breaks an item, a false answer, or a promise on the winner,
edit `scenario.md` yourself and freeze. No reviewer reads the page again — storyboard §4.4
reads the narration it becomes.

Stamp `frozen:` when §4 opens. §4.4's narration read-through and §4.5's vocabulary read are
the two reviewer loops, and they read the board this page became; the board reads of 0.49
are not called any more.

## What the page carries — the seven items

Every candidate, on both formats, is the same seven items in this order (user directive,
2026-09-02). The order is the episode's order on a short and on `story`; `answer-first`
pulls 전개 #2 forward (the item-to-beat map below). Each item's header carries a feel sign
(scenario-craft §12), the engines sit in the frontmatter, and nothing else goes on the
page — no shot numbers, no camera, no prompts, no character counts (those are §4's, and
writing them here is what turns a scenario into a second board).

**The sign is read off the item, never copied from a template.** Write the sign and the
feeling next to it (`−2 · dread`, `+2 · relief`), and check the chart before scoring: the
minimum sits before the burst — usually the darkest beat inside 전개 #1, deeper than the 훅
— and the maximum sits on 전개 #2 or 전개 #3, with 마무리 and CTA holding that height. A
page whose signs run −2 · −1 · +1 · +1 · +2 · +2 with the peak on the question is the
straight climb §12 names as the least-read shape; on the first test run (2026-09-02) three
of five pages carried exactly that row, and the reviewer scored the curve axis 7–9 of 15.
The promise must leave necessary developments for the body. It may concern the historical
event itself; inventing a modern connection to prolong it is not a solution.

| # | Item | What goes in it |
|---|---|---|
| 1 | **주제** | The subject cut from the page's message — what this episode is about and the question it answers, one sentence in the viewer's words at the 초3~4 floor (korean-style §Eye level). Not a topic label ("로즈웰 사건"), and never a report of ignorance ("무엇이 떨어졌는지는 아직 모른다") — the sentence names what the evidence establishes ("군은 왜 발표를 바꿨을까 — 설명이 바뀌면 사람들이 무엇을 믿게 되는지"). `COMPREHENSION.question` is cut from this line; `takeaway` from the message (§Messages first). |
| 2 | **훅** | A dramatised scene that pulls the viewer in — a person at that moment, a "만약 그날 …" the viewer can picture. Its first spoken sentence names what is at stake before anything is asked; it ends on the promise — what the viewer will know by the end. It may invent a scene. It may not invent a fact (below). |
| 3 | **전개 #1** | What actually happened — the real event behind the hook, told as an account (who · when · what), every fact on a `research.md` row. Where the research holds an answer most viewers would guess first, this item opens on it and takes it apart (scenario-craft §11). |
| 4 | **전개 #2** | The next necessary evidence, choice or consequence that changes understanding. A modern bridge is optional. On answer-first this supplies the early result and names its subject directly. |
| 5 | **전개 #3** | Develop or test the answer with evidence, action or a limit. Use sourced modern cases only when they serve this content; no minimum case count. |
| 6 | **마무리** | The earned resolution: answer the opening with evidence or a decisive action and make the meaning understandable. State limits honestly. Do not outsource the answer to a generic opinion question. Name the one forwardable thing here — the fact, verdict, line or checklist a viewer could pass on as-is; §4 writes it into the closing shot's `shot.share`, where a short requires it. |
| 7 | **CTA** | Optional. Write `없음` and why the ending is sufficient, or one relevant ask after the resolution. Never use an ask to replace the answer. Subscribe and like stay banned. An ask stays optional; a forwardable thing does not — an ask requests behaviour from the viewer, while a forwardable thing is one sentence, figure or verdict they can pass on as-is. Asking to be shared is an ask, not a trigger. |

### 훅 may invent a scene, not a fact

"가상 연출" is licence to stage — a person waking, a hand on the jar, a "만약 그날 …" the
viewer can picture. It is not licence to add a name, a year, a figure or a quote that has
no row in `research.md`. Anything factual inside the 훅 either has a row or is marked as
hypothetical in the sentence itself ("만약", "…라고 해 봅시다"). §4 writes the staging on the
cover's `shot.info` ("연출 — 전개 #1 이 사실을 댄다") so copy mode reads a dramatised opening
rather than an unsourced claim, and 전개 #1's first sentence is where the fact lands.

### The cases in 전개 #3 exist before the pick

When a candidate uses modern cases, source them before the pick and connect each to the
main content. A candidate may use none. Raise the winner's used claims to Verified rows
at §2.3; unused cases never become a claim or caption.

### The seven items onto the board (§4 reads this)

| Item | Short (`hook → drip → cta`) | Long-form `answer-first` (the default) | Long-form `story` |
|---|---|---|---|
| 훅 | `hook` — the cover, 1 shot | cover + `hooking` | cover + `hooking` |
| 전개 #1 | `drip`, 1–2 shots | `body` | `body` |
| 전개 #2 | `drip`, 1 shot | `result` — the present answer plays before the body | `turn` |
| 전개 #3 | `drip`, 1–2 shots — where the held answer is first complete, or where the answer the cover already stated meets its hardest test | `body` | `result` |
| 마무리 + optional CTA | `cta` — the last narrated shot delivers the closing meaning and carries the forwardable thing in `shot.share`, with an optional ask after the answer; no fixed group count | `cta` | `cta` |

A short lands inside the 4–7 shot band (5–7 by this map). Long-form keeps the arc
storyboard §2.3 picked (scenes-schema §playback order): unfinished-sentence material is
`story`, where 전개 #2 is the turn; everything else is `answer-first`, where 전개 #2's present
answer is the result shown before the body. `COMPREHENSION.question` is the specific question
the episode answers, historical or present-day. A short candidate picks where its reveal
sits, and its 훅 item says which of the two it took. Held is the default: the last drip is
the first place the answer is complete (scenes-schema §playback order), and a question the
historical fact already answers puts that moment at 전개 #1. Stated up front is the other
legal shape — the 훅 says the result and the 전개 rows spend their time on why it is true,
what it cost and where it breaks. Take it when the fact itself is the surprise and the
reason is worth three items; the price is the finish, which no longer has a reveal to land
on, so 전개 #3 has to carry the hardest test instead. A cover that states the answer and
leaves the body nothing to develop is the intrigue row's failure case, not this shape. On
long-form, how 전개 #1's investigation is laid out inside (curiosity loop · problem stack
· …) is the one thing storyboard §2.5 still asks.

## Template

```markdown
---
channel: <slug>
topic: <slug>
direction: D1
message: M1
engine_primary: <curiosity | fear | intrigue | comedy>
engine_secondary: <curiosity | fear | intrigue | comedy | none>
structure: <short: hook-drip-cta | long-form: the arc + the shape 전개 #1 rides inside>
arc: <short: n/a | long-form: answer-first | story>
score:
p0:
round: 0
frozen:                     # stamped on entering §4, on scenario.md only
---

# <topic> — 시나리오 D1

**Message.** <the M1 sentence, verbatim from research.md §Messages>
**Engine.** primary <…> · secondary <…>

## 주제
<the subject cut from the message — what the episode is about and the question it answers,
one sentence in the viewer's words; never "…는 알 수 없다">

## 훅 — feel <sign · feeling>
<the dramatised scene. First spoken sentence verbatim: "…". Ends on the promise — and the
promise reaches the present: what the viewer will know about now, not only what happened.>

## 전개 #1 — feel <sign · feeling>
<what actually happened — who · when · what, on claims #N. The false answer set up and
taken apart, when the research holds one. Its darkest beat is usually the curve's minimum.>

## 전개 #2 — feel <sign · feeling>
<what that event makes us think about now — the bridge, as a spoken thought>

## 전개 #3 — feel <sign · feeling>
1. <case — what it is · what it has to do with the topic · row #N>
2. <case>
3. <case, optional>

## 마무리 — feel <sign · feeling>
<the earned resolution, verbatim: "…">
<forwardable — the one fact, verdict, line or checklist a viewer could pass on as-is, verbatim: "…">

## CTA — feel <sign · feeling>
<없음 + reason, or the optional relevant ask verbatim after the resolution>
```

## What it does not do

It does not approve wording — §7 is where sentences get read, and the reviewer's scenario
mode scores the engines and the shape, not the phrasing. It does not replace `research.md`:
the facts stay there, and every claim this page leans on has a row in that table. And it
does not become a second board — a page that names shots, cameras or prompts is P0-9, and
the fix is to delete those lines, not to keep them in sync.
