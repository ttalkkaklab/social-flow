# Story interest — guidance change and adversarial content loop

User request, 2026-11-11: apply the recommendations drawn from the
[story-engagement survey](../../research/2026-11-11-story-engagement-craft/index.html), decide
the open items, then write several stories and iterate independent adversarial review until
each scores strictly above 95 for viewer interest and attention with no critical defect.

## What changed in the plugin

- New authoring reference [story interest](../../../skills/storyboard/references/story-interest.md):
  the open-question ledger, order of telling, who knows more, pressure that changes, scene and
  serial-episode endings, a failure table and evidence grades. It ports principles from the
  legacy scenario-craft rules without their story-v1 quotas or scores.
- The storyboard skill, character-led scenarios, autoproduce, video types and the README
  send story-led work to that reference. The scenario preview names the question the viewer
  waits on and the reason for a non-chronological order.
- `story_scene` accepts the optional `charge` the structure contract already reads, and the
  `story_sequence` and `story_scene` descriptions say how `question`, `payoff`, `turn`,
  `charge` and `out` serve story-led work. One test case covers the new input.
- The reviewer gained an on-request interest read: a scene-by-scene viewing log and an
  interest content rubric with the tail `mode=interest`.
- Three behavioral evaluation cases were added. Two rationale sentences that cited an
  untraceable first-seconds figure and the Zeigarnik effect were corrected.

## Decisions made for the open items

| Item | Decision | Reason |
|---|---|---|
| An interest axis in the default rubric | No. A separate on-request interest rubric | The default five axes keep their meaning and no score becomes a prerequisite |
| New `scenario_check` warnings | None | The 2026-10-31 directive defers checks until quality is known; the reviewer question covers it |
| A channel-level series ledger | None. Carried questions go in the existing `storyboard.md` note | No new file or schema for a note that already has a place |
| The telling-order experiment on the channel | Described in the reference, not run | It needs generation spending and publishing approval the user has not given |
| `charge` on `story_scene` | Added as an optional field | The contract warned about a field the story tool could not write |

## Method

The coordinator changes the reusable plugin and never writes or patches a benchmark story.
Each author is a fresh agent given a raw brief (genre, format, rough length, a premise seed)
and the path of the worktree's storyboard skill. Each reviewer is a fresh, read-only agent.
It receives the blind export first, one file per scene with only the place and the ordered
actions and speech, and saves a viewing log before it is sent the canon and asked to score.
Reviewers are not given the target score, earlier verdicts or the authoring reference. One
verdict is taken per revision; an unchanged draft is never re-reviewed.

**Waiver for this benchmark.** The skill requires project setup and finished character panels
before any text authoring. Neither exists in this workspace and panels cost generation, so
the authors were told: content only, no MCP tools, no generation, cast identities written as
text. The stories are therefore content plans. No board, image, voice or video was made.

**Frozen before the first author started.** The reviewer side does not change during the loop:

| File | SHA-256 |
|---|---|
| `agents/storyboard-reviewer.md` | `6e1c4e72c796b26037bf74f2291ff115901e7cb121edd414aff30148ee590e7d` |
| `skills/storyboard/references/character-scenarios.md` | `f87d75118297777f02300681a42d6a29d75ad055fbe3b8eb83ebf08f1a8f8f0e` |
| `skills/_shared/automation-guidance.md` | `6f3568276b1e4f9397edb18babda950e8ff34a2a9015cc1b4f36f758762b4765` |
| `skills/_shared/host-review.md` | `ed0e44db8f60eca712fd62495afb5c01a1a25a7e73950fe765003e55af98adf5` |
| blind export script (`tools/blind.js`) | `d696e521c6e00edf41bf2b487e3b7f0779ed7d7d322b1e09bc49c520b5ba70f7` |

Rubric, 100 points: comprehension and causality 20, opening question 15, forward pull at each
join 25, changing pressure 20, payoff and ending 20. Points are earned from the viewing log
and quoted events. Pass is the user's criterion: strictly above 95 and zero P0. This bar
belongs to this run and is not an authoring prerequisite.

## Benchmark stories

| Id | Raw brief |
|---|---|
| s1 | Vertical short drama, 60–90 s: a contract worker presents to executives while the team lead who took her proposal watches |
| s2 | Horizontal long-form mystery, 5–7 min: a guest vanishes from a rural guesthouse on a rainy day with no checkout record |
| s3 | Vertical short comedy, about 60 s: a new hire posts a complaint about the CEO to the whole-company chat, then shares a lift with the CEO |
| s4 | Vertical short-drama serial, episodes 1 and 2: a text arrives from the number of a twin sister who died a year ago |
| s5 | Vertical short, narration-led and quiet, 60–90 s: the last business day of a 30-year-old photo studio, with no villain or contest |

Drafts, blind exports, viewing logs and verdicts are local artifacts under
`data/bench/story-interest-20261111/<id>/run-NN/` (see the last section for their location).

## Iterations

### Iteration 1

Five fresh authors wrote the first drafts from the raw briefs after reading the installed
skill, including the new reference. Fresh reviewers then read each blind export scene by
scene, saved the viewing log (hash recorded) and only afterwards received the canon.

| Story | Scenes · events | Comprehension 20 | Opening 15 | Pull 25 | Pressure 20 | Payoff 20 | Total | P0 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| s1 office drama | 4 · 37 | 20 | 13 | 22 | 18 | 16 | 89 | 0 |
| s2 guesthouse mystery | 7 · 132 | 17 | 11 | 20 | 17 | 16 | 81 | 0 |
| s3 lift comedy | 5 · 63 | 17 | 14 | 22 | 20 | 17 | 90 | 0 |
| s4 twin serial (2 episodes) | 7 · 58 | 19 | 15 | 22 | 18 | 15 | 89 | 0 |
| s5 photo studio | 3 · 41 | 18 | 11 | 20 | 14 | 19 | 82 | 0 |

The s4 reviewer was interrupted by an API limit after its viewing log and resumed from its
saved log before it saw any canon. Its main deductions match the list below: a predictable
reconciliation signalled by an earlier gesture, a motive answered only in the serial ledger,
and a promise first named in the final scene.

No story met the bar. The deductions shared one shape across genres: the reader made a
confident bet at a join and the next scene delivered it as bet. Causes the reviews named:

- A plant that announced its payoff (a rule of thumb spoken in scene 1 that the climax
  broke), clues that all pointed to one answer, and an out that stated both what a character
  would do next and how.
- A stake, clock or closing that lived only in metadata or notes: an ending's cost, a
  departure deadline, a question "closed" by a phone call the viewer cannot hear, a final
  gesture with two readings.
- The wall removed before the principal acted (the decider already doubted the opponent),
  and a decider rather than the principal making the decisive move.
- A middle scene in which people only waited with a clock added to the same obstacle.
- An object the story kept returning to that the ending never used, a tool first seen at
  the moment it was needed, and callbacks that returned exactly as the reader had pictured.

Iteration 2 adds these as general guidance to `story-interest.md` (bet on each join and move
the doubt; read the ledger off the screen; give a plant a job in its own scene; let the
opponent's move work at first; a clock on the same obstacle is the same obstacle; the
principal makes the decisive move; hand over the intention and hold back the form; the next
scene picks up the out; pay what the story kept naming; a callback returns changed) and three
failure-table rows. The reviewer side is unchanged. Authors revise from their saved drafts
with the review, its viewing log and the updated reference; fresh reviewers read the result.

### Iteration 2 and later rounds

Each revised draft is reviewed once by a new reviewer with the same two-phase procedure.
Results are added to the table below as they arrive.

| Story | Run | Scenes · events | Comprehension 20 | Opening 15 | Pull 25 | Pressure 20 | Payoff 20 | Total | P0 |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| s3 | run-02 | 5 · 70 | 17 | 14 | 25 | 18 | 19 | 93 | 0 |
| s1 | run-02 | 4 · 44 | 20 | 15 | 21 | 16 | 18 | 90 | 0 |
| s5 | run-02 | 3 · 42 | 19 | 15 | 21 | 19 | 18 | 92 | 0 |
| s2 | run-02 | 7 · 127 | 19 | 15 | 22 | 18 | 19 | 93 | 0 |
| s4 | run-02 | 7 · 63 | 18 | 15 | 22 | 20 | 19 | 94 | 0 |
| s1 | run-03 | 4 · 49 | 20 | 15 | 22 | 20 | 17 | 94 | 0 |
| s3 | run-03 | 5 · 71 | 19 | 15 | 25 | 20 | 17 | **96** | 0 |
| s5 | run-03 | 3 · 44 | 18 | 15 | 22 | 20 | 16 | 91 | 0 |
| s2 | run-03 | 7 · 126 | 18 | 15 | 23 | 17 | 18 | 91 | 0 |
| s4 | run-03 | 7 · 63 | 19 | 15 | 24 | 18 | 19 | 95 | 0 |
| s1 | run-04 | 4 · 52 | 19 | 14 | 21 | 19 | 18 | 91 | 0 |
| s2 | run-04 | 7 · 126 | 18 | 15 | 25 | 19 | 17 | 94 | 0 |
| s5 | run-04 | 3 · 45 | 18 | 11 | 22 | 19 | 19 | 89 | 0 |
| s4 | run-04 | 7 · 60 | 19 | 15 | 23 | 19 | 18 | 94 | 0 |
| s1 | run-05 | 5 · 49 | 19 | 15 | 25 | 20 | 17 | **96** | 0 |
| s5 | run-05 (fresh first draft) | 6 · 49 | 19 | 15 | 21 | 18 | 17 | 90 | 0 |
| s2 | run-05 | 7 · 129 | 17 | 15 | 25 | 20 | 19 | **96** | 0 |

**Protocol deviation found in round 2.** Every run-02 `notes.md` recorded the previous
reviewer's score, and the reviewers read `notes.md` in phase 2, so they saw an earlier
verdict. The phase-1 viewing logs were written before that and are unaffected. One reviewer
reported the exposure and stated that it set deductions before the total; the two reviewers
still in phase 2 were told to do the same and to report it. No exposed score met the bar,
so no draft was re-reviewed. From run-03 the authors are told to keep scores and verdicts
out of their notes, and notes are checked before review.

**Other deviations.** The phase-2 request the coordinator sends gained a few example cues
after round 1 ("a stake that lives only in notes or metadata", "a clock or stake that lives
only in notes or metadata", and an instruction to disclose any earlier score seen). The
reviewer file itself never changed; its hash and the other frozen files still match. From
run-03 the authors' notes carried their own summary of earlier findings (no scores), and the
phase-2 reviewers read it. One s4 reviewer was interrupted by an API limit and resumed from
its saved log. Authors shared the session scratchpad and one overwrote another's helper
scripts; no story file was affected, and later authors kept helpers inside their run.

**Guidance during the loop.** In rounds 2–4 a rule was added after almost every review. After
round 4 the reference was pruned to causes that appeared in at least two stories' reviews,
and the rest was folded into those rules or dropped: betting on each join and moving the
doubt, reading the ledger off the screen, a plant that is noticed but not underlined, the
wall that holds until the principal acts, a price paid on screen, denying the obvious moment,
a changed mind's own trigger, keeping a long plant alive and paying what the story kept
naming. Section 9 of the reference grades them as editorial and untested on audiences.

Three of the five stories met the bar (s1, s2 and s3 at 96); s4 peaked at 95 and s5 at 92.
Reviewers also read the rubric differently: some deducted for a correct guess held with
medium confidence, others only for a confident one, as the rubric is written.

These results do not show that the guidance raised the scores. Every gain came with the
reviewer's findings in hand, and reader-to-reader spread was about three points: s5's opening
axis went 11, 15, 15 and 11 across four readers for the same premise-level fact.

## The cap and the outcome

After round 4 the rounds in flight were declared the last, because further patches moved the
score within the reviewer spread. s5, where every reader had bet with confidence on the same
outcome, received a fresh first draft from the raw brief and the pruned reference, with no
earlier draft or review. It is the only first-draft test of the revised guidance: it scored
90 against 82 for s5's round-1 first draft. One sample does not establish an effect.

| Story | Runs | Best | Last | Bar (>95, P0 0) | Note |
|---|---:|---:|---:|---|---|
| s1 office drama | 5 | 96 (run-05) | 96 | met | the reviewer noted a one-point hedge on the pull axis (95 if a retrospective point is accepted) |
| s2 guesthouse mystery | 5 | 96 (run-05) | 96 | met | the reviewer's draft before reading the notes was 93; it raised two axes by applying the rubric's wording (only a confident correct guess loses points) to every join and by rechecking its own log, and records both changes |
| s3 lift comedy | 3 | 96 (run-03) | 96 | met | the reviewer noted the ending axis could drop if the two readings of the boss weigh more |
| s4 twin serial | 4 | 95 (run-03) | 94 | not met | 95 is not above 95 |
| s5 photo studio | 5 | 92 (run-02) | 90 (fresh draft) | not met | every reader settled the outcome early; the fresh draft did not change that |

## Background music

The user asked for background music made with the Gemini API. Seven instrumental cues were
generated with Lyria 3.5 through `music_plan` → `music_execute`: one per short story, one per
s4 episode and two for the s2 long-form (the rainy-morning investigation and the 8:20 bus).
The bench's `bgm/` directory records the explicit model choice in a board `PRODUCTION` block
and an authorization file (`maxUsd` 5). Each request reserved 0.5 USD, 3.5 USD in total; that
is a caller estimate, as no verified Lyria price exists, not an invoice. Masters are 48 kHz
stereo WAV (60–150 s, about −11 to −12 LUFS integrated). The listening copies in the
integrated edition are MP3 normalised to −16 LUFS and −1.5 dBTP. Nobody listened to or
reviewed them (`not_reviewed`).

## Integrated edition

The final script of each story, its score history, the last reviewer's main points and its
music are collected on one page, a private claude.ai artifact visible to its owner:
[다음 장면 대본집](https://claude.ai/artifact/GrXtNF59pHEQbR3B9PadeJ). Scripts are the last revision of each
story; the score board shows every round.

## Where the artifacts are

Drafts, blind exports, viewing logs, verdicts, the music masters and receipts were copied to
`data/bench/story-interest-20261111/` in the main checkout before the work worktree was
removed. `data/` is never committed.
