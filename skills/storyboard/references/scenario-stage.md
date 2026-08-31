# The scenario stage — three candidates, scored, then one pick

`scenario.md` is what the storyboard skill writes before §4 opens a shot: one page that
lays out the episode as an investigation while a story candidate still costs a page
instead of a board. Both formats run this stage. On long-form a candidate used to be a
54–66 KB `scenes.js`; on a short the board is small, but a direction row (question · hook
· hero) is too thin to judge whether a viewer would stay — that is the "밋밋하다" failure
the 95-point loop exists to catch.

The loop happens **after first research and before the pick** (storyboard §2.2). Three
different episodes this topic could be are written as three pages, each one is scored, and
the user (or autoproduce) picks among the ones that cleared 95. Additional research and
the board come after that, on the winner only.

## Contents

- [Its status: an upstream input, not a second contract](#its-status-an-upstream-input-not-a-second-contract)
- [Viewer engines — what the 95 bar actually scores](#viewer-engines-what-the-95-bar-actually-scores)
- [The three-candidate loop](#the-three-candidate-loop-storyboard-22-autoproduce-gate-6a)
- [What the page carries](#what-the-page-carries)
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
2. **Two lines are the exception.** The cover's first spoken sentence and the cta's
   callback line go across verbatim as §4's first edit — they are what §2.5 settled and
   what scenario-craft §12 says to write first. From the moment they land in `scenes.js`,
   `scenes.js` is where they live.
3. **It freezes when §4 opens.** Stamp `frozen: <YYYY-MM-DD HH:MM>` in the frontmatter on
   entering §4. After that the file is a record; a change of mind is made in the board and
   noted on the §7 screen, never by editing this page to match.
4. **The checker watches the clock.** `check-scenes.js` warns when `scenario.md` is newer
   than `scenes.js` — an upstream input that changed after its consumer is the drift this
   stage was built to avoid.

## Viewer engines — what the 95 bar actually scores

The copy, per-scene, vocabulary, camera, sound and image reads still run once each, with
no score to clear. **This stage is the exception**, on the same pattern as `slide-reviewer`:
loop until `score ≥ 95` and `p0 = 0`. The thing it scores is not wording (the page never
ships) and not shot grammar (there are no shots yet). It scores whether a viewer would
**want the next beat**.

Four engines. A candidate names one as primary and may name one as secondary. The three
candidates on one topic take **three different primaries** — three wordings of the same
engine are three copies of one episode, which §2.1 already bans.

| Engine | Viewer feeling | Working looks like | Not working looks like | Craft |
|---|---|---|---|---|
| `curiosity` 호기심 | "that's interesting — how?" | a specific, closable gap about a surprising fact, paradox, or identity, paid in installments | a topic announcement, a definition, "today we look at" | scenario-craft §5 |
| `fear` 공포 | "this could happen to me" | a threat and its clock on the table in the opening, plus a doable door later | a jump scare saved for the end, or a threat with no step the viewer can take | scenario-craft §4 |
| `intrigue` 궁금증 | "I need to know what happens" | an unresolved outcome or secret whose paying beat is named on the ledger | a teaser with no named payer, or the answer dumped in the opening | scenario-craft §5 ledger · hookForm `gap`/`secret` |
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
`storyboard/candidates/d<n>.md` from the template below. Frontmatter carries `direction`,
`engine_primary`, `engine_secondary` (or `none`), `score` and `p0` (empty until the first
read), `round: 0`. A short's Beats section is three paragraphs — hook, drip, cta. A
long-form's is one paragraph per beat of the structure that row would ride.

### Score

Delegate each page to `storyboard-reviewer` **scenario mode**. Pass the candidate path,
`research.md`, `profile.md`, `scenario-craft.md`, this file, and the claimed primary.
Read the tail:

```
STORYBOARD_REVIEW: mode=scenario score=NN p0=N primary=<engine> secondary=<engine|none>
```

Stamp `score`, `p0`, `round` on that file's frontmatter. Apply the findings, P0 first —
improve the page, or replace it (below). **Do not start §4 from a candidate that has not
been read.**

### Loop

Per candidate, until `score ≥ 95` and `p0 = 0`, or the cap:

1. Improve the same page against the directives and re-delegate. Max **3 reads** on one
   page (write counts as round 0; the first read is round 1).
2. Still short after 3: **replace** the candidate with a different episode this topic
   could be — a different primary engine, or a different question the research already
   holds. Do not rephrase the failed page. The replacement gets up to **2 more reads**.
3. One replacement per slot. Cap **5 reads per candidate**, **15 per episode**.

A read that comes back `p0 > 0` is not a pass even at 95. Fix the P0s and read again;
that read counts.

### Pick

Show the three scores, primaries, and one-line questions. Recommended is the highest that
cleared 95 with `p0 = 0`, first in the list.

- **Storyboard / human-invocation autoproduce:** AskUserQuestion. A sub-95 pick needs the
  user to say so on that screen — don't recommend one.
- **Unattended autoproduce:** take the recommended one. **Zero candidates at 95 with
  `p0 = 0`: drop the topic** (same counter as a facts-floor drop). Do not author a board
  from a page that failed the bar.

Write `Chosen: D# (<YYYY-MM-DD>)` into `research.md` §Directions, copy the winner to
`storyboard/scenario.md` (keep the candidate files — they are the audit of the other
two), then §2.3 additional research on that direction only. Unchosen candidates never
become a claim or a caption.

### After extra research

If §2.3 turns up a fact that breaks a beat, a false answer, or a promise on the winner,
edit `scenario.md`, run the loop on **that one page** (same 3-read cap, no replacement —
the pick already happened), and only then freeze. A page that was already at 95 and did
not change is not read again.

Stamp `frozen:` when §4 opens. §4.5–§5.5 stay one round with no score to clear.

## What the page carries

Eight items, plus the engine line, none of them a shot. No shot numbers, no camera, no
prompts, no character counts — those are §4's, and writing them here is what turns a
scenario into a second board.

| Item | One line on it |
|---|---|
| The engines | Primary and optional secondary, from the four |
| The question | The one question the episode investigates, in the viewer's words |
| Cold open | The strongest moment or piece of evidence — never the start of the timeline |
| Promise sentence | What the viewer will know or be able to do by the end, said in the opening |
| The body's beats | One paragraph per beat. Short: hook · drip · cta. Long-form: the structure that row rides. Prose, not a table |
| The two lines | The cover's first spoken sentence and the cta's callback, verbatim |
| The feel curve | A sign per beat and where it bottoms out and peaks |
| Loops and plants | Each one opened, with the beat that pays it — the seed of `SB_DOC.craft.loops` |
| False answer · bridges | The wrong answer the body takes apart, and where heavy context gets delivered |

## Template

```markdown
---
channel: <slug>
topic: <slug>
direction: D1
engine_primary: <curiosity | fear | intrigue | comedy>
engine_secondary: <curiosity | fear | intrigue | comedy | none>
structure: <short: hook-drip-cta | long-form: curiosity loop | problem stack | …>
arc: <short: n/a | long-form: story | answer-first>
score:
p0:
round: 0
frozen:                     # stamped on entering §4, on scenario.md only
---

# <topic> — Scenario D1

**Engine.** primary <…> · secondary <…>
**The question.** <one sentence>
**Cold open.** <the moment or the evidence the episode opens on>
**Promise.** "<the sentence the viewer hears in the opening>"

## The two lines
- Cover, first spoken: "<…>"
- CTA, callback: "<…>"  ·  memory question: "<…>"

## Beats
### <beat name> — feel <−2>
<a paragraph. What is at stake when it opens, what has changed when it closes.>

## Ledger
| Opened | Paid at |
|---|---|
| <loop or plant> | <beat> |

## False answer
<the answer most viewers would guess, and the evidence that takes it apart>

## Bridges
<the heavy context, and the beat it is delivered at — past the midpoint>
```

## What it does not do

It does not approve wording — §7 is where sentences get read, and the reviewer's scenario
mode scores the engines and the shape, not the phrasing. It does not replace `research.md`:
the facts stay there, and every claim this page leans on has a row in that table. And it
does not become a second board — a page that names shots, cameras or prompts is P0-9, and
the fix is to delete those lines, not to keep them in sync.
