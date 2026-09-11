# storyboard.md / research.md standard structure

## storyboard.md

The document a human reviews and approves. With per-shot tables and generated images embedded,
**this document alone must let you picture the final video**. The source of truth for units is
`scenes-schema.md` §grammar units and production layers.

```markdown
---
channel: <channel slug>
topic: <topic slug>
status: draft            # draft | approved | produced | published
created: <YYYY-MM-DD>
portal_episode: <uuid>   # optional — written at approval by storyboard_save when the ttalkkakstory portal MCP is registered
portal_url: <url>        # optional — the portal page of that episode
---

# <topic display name> — Storyboard

- **Channel**: <display name> (`data/<slug>/profile.md`)
- **Expected total length**: <NN>s (main <N> shots + outro, or main alone when the channel's `shortform_outro` is off)
- **Core message**: <the one sentence this video delivers>
- **Playback**: short: hook → drip (1–n) → cta (no `arc`). long-form: <answer-first / story> (`arc: <answer-first|story>`) — answer-first: cover → hooking → result → body; story: cover → hooking → body → turn → result
- **Opening strategy**: <fear / empathy / curiosity / spoiler> (`hookType: <fear|empathy|curiosity|spoiler>`) — <one line on how the title and segment ① carry that stimulus; all four are open on a short, and a spoiler cover may state the result on screen while the platform title still withholds it>
- **Hook form**: <paradox / gap / payoff / identify / number / secret> (`hookForm: <…>`) — <one line on how the title and segment ① take that shape, and which shot pays it — the last drip (short) or the result (long-form) on a withholding form, the cover itself on payoff>
- **Promises**: <the cover's hook → the last drip (short), the cover itself on a payoff cover, or the result shot (long-form); each sub-loop and plant → the shot that pays it> (`SB_DOC.craft.loops` in storyboard.html — the document draws the ledger and marks the unpaid ones)
- **Cover hook**: "<cover title>" — hero stat <stat>
- **Share trigger**: <the one sentence, figure or verdict the CTA shot hands the viewer to forward (`shot.share`) — an ask is optional, this is not>

## Sequence — <purpose>          # only when one episode has two purposes

## S#1. <location> / <time>

### Shot 1 — cover · medium close-up · eye level

![scene-1](images/scene-1.png)

| Item | Content |
|---|---|
| beat | short: cover / drip / CTA · long-form: cover / hooking / result / body / turn (story only) / CTA |
| feel of this shot | <what the viewer should feel here — written before size and angle> |
| size · angle | <els … ecu / composition> · <eye / high / low / overhead / dutch> — <why, if it leaves the directing-grammar §5 row> |
| info of this shot | <one line the viewer newly learns> |
| information route | other / timeline / statistic / principle — the last three require a moving editorial HTML frame |
| share of this shot | <the one sentence, figure or verdict a viewer would forward as-is — required on the CTA shot of a short, optional elsewhere> |
| share shape | fact / verdict / line / checklist / none |
| picture | still photo / AI video / recording / shared asset |
| overlay | HTML reveal · captions · typing / none |
| target length | ~<N>s |
| kicker | <value> |
| title | <value> (chars: N) |
| stat / statLabel | <value> / <value> |
| narration ① | tts: "<phonetic notation>" · sub: "<original notation>" |
| narration ② | tts: "…" · sub: "…" |
| background prompt | <bgPrompt summary> |

### Shot 2 — points · close-up
(same format — bullets table, reveal order stated. Same S# means the scene isn't split)

…more shots…

## Sources (research.md summary)

| Claim | Source | Checked | Status |
|---|---|---|---|
| <key figure> | [<outlet>](<URL>) | <date> | ✅ 2-source cross-check |

## Platform plan

| Platform | Form | Notes |
|---|---|---|
| instagram | Reels | |
| youtube | Shorts | title keywords: <…> |
| threads | casual-register body + video link | no attached image — the link is the IG reel |
| facebook | video post | |
```

## storyboard.html (review render — template-based)

Created by copying `references/storyboard-html-template.html` into storyboard/. It doesn't
copy the scene data — it loads the SoT directly with `<script src="./scenes.js">` and renders
from it, so fixing scenes.js updates the document automatically. The copy drift that
storyboard.md and script.md suffer is structurally impossible here.

- The only places to fill in are **`<title>` and the `✎ SB_DOC` block** — styles and renderer
  are off-limits.
- SB_DOC holds only editorial metadata that isn't in scenes.js: core message, docNotes,
  per-scene notes (sceneNotes), transitions, audio directions (audioNotes), privacy avoidance
  (privacy), source summary (sources), platform plan (platforms), shooting prep (prep), and
  the recheck list (recheck).
- Just open `storyboard.html` in a browser (no external resources). Use this document as the
  default when presenting for HITL approval.

What the document shows:

- **Shot card** — one `SCENES[]` entry. The header carries the role (`COVER`), size and angle,
  the opening-strategy, hook-form and arc name tags (cover only), the **beat** (short: cover, drip, CTA;
  long-form: cover, hooking, result, body, turn, CTA), and the two production-layer badges (picture / overlay). Entries sharing `scene` are grouped
  under a scene band (`S#1. location / time`). The last main shot is not stamped PAYOFF.
- **Scene-frame rows** — one reveal = one row. A 9:16 frame on the left; on the right, the
  text and dialogue at that moment. A reveal is not a shot. A channel-color badge means AI
  video; an outline-only badge means HTML staging. On a cover the first row is the title
  reveal, and that is what the viewer sees at t=0 — the manifest opens on it, so there is no
  background-only frame in front of it. Read that row as the first-second check: the topic
  word or the figure legible, the movement already started.
- **Contract check** — at the top of the document. Beyond character counts, speech rate, shot
  length, and frame overflow: whether the recorded `picture`/`overlay` match the structure,
  whether `shot.info` within the same scene overlaps, whether `shot.infoType` routes timelines,
  statistics, and principles to their required motion HTML contract, and whether the playback order matches
  the format — **short: hook → drip → cta** (missing drip or spoken CTA, or a long-form beat,
  is a violation), **long-form answer-first: cover → hooking → result → body** (body before
  result is a violation, a `turn` beat a warning), **story: cover → hooking → body → turn →
  result** (result before body or before the turn is a violation; no turn, no result, or the
  shot before the payoff not being the turn is a warning). A first shot that isn't the cover is
  a violation, and so is a short cover that dumps the answer **without declaring a result-first
  opening** — `spoiler` and `payoff` are legal on a short, and a cover carrying either
  `hookType:"spoiler"` or `hookForm:"payoff"` is expected to speak the answer. A short whose `beat:"cta"` shot carries no `shot.share` (or one
  under 8 compacted characters) is a violation under the **share trigger** heading. On
  long-form a missing hooking shot, or the shot after the cover not being the hooking shot,
  is a warning (scenes-schema §hooking). A missing cover `hookType`, or
  a value outside the four, is an opening-strategy warning (§the four opening strategies —
  this is a name-tag check; whether one of the four is actually present in the opening is
  what the reviewer's copy mode looks at). The same name-tag check runs on `hookForm` (one of
  the six, §the six hook forms). And the **shot grammar** (directing-grammar §8): a shot with no
  `shot.feel`, a `shot.size` or `shot.angle` outside the vocabulary, a second `cu`/`choker`/`ecu`
  in one scene, a third `choker`/`ecu` in the episode, a second `dutch`, and a close-up opening
  not paid back by a non-close next shot — all warnings, weighed by the reviewer's camera mode
  and the person at the approval step.

The mode (shooting/generated) is auto-detected from `visual.source`, the illustration mode
from `narration[].img`. Shooting mode has one overlay per shot, so a single reveal row. The
timeline slots are shots, and b-roll plugs in at the playback position `after` sets.

**Check items** — character counts, speech rate, scene length, total length (against the
channel's band — `length_min_seconds` / `length_max_seconds`; unset, the preset's 35–120s
stands), cover title 16 chars, statLabel 18 chars, playback order (short: hook → drip → cta · long-form answer-first
cover → hooking → result → body · story cover → hooking → body → turn → result), plus:

- **Frame overflow** — draws each reveal on a 1080px canvas and measures whether text
  escapes the zone; on overflow it applies the same 3-step shrink as produce. Not fitting
  after three steps is a violation. Measurement also follows produce — generated mode
  measures text-zone overflow, shooting mode whether the top block's bottom crosses y=460.
  It shares produce's blind spot though — only text overflowing downward is caught, so in
  scenes whose block sits at the bottom or center (cover, quote, outro), text pushed
  **upward** escapes this check.
- **Hero stat width** — runs produce's 640px guard as-is. If it still overflows at minimum
  size, switch to a shorter notation.
- **b-roll** — at most 2 slots, the two slots' `after` differ, each slot's narration is
  empty, used length is ≤8s, and `src` matches the `after` scene's background.
- **Empty narration** — a scene holding out with no sound (speech-clip quote scenes are
  normal and excluded).
- **Missing outro length** — an outro scene exists but `SB_DOC.outro` is empty. No outro
  scene together with `SB_DOC.outro: null` is a complete board, not an omission — that is what a
  channel with `shortform_outro: off` looks like.
- **Share trigger** — the `beat:"cta"` shot of a short has no `shot.share`, or fewer than 8
  compacted characters in it. `check-scenes.js` also rejects a `shot.shareType` outside
  `fact`·`verdict`·`line`·`checklist`·`none`. A missing closing ask is not flagged; a missing
  forwardable thing is.
- **Unfilled placeholders** — blocks approval while `{{…}}` remains in SB_DOC.
- **Hook form** — the cover has no `hookForm`, or a value outside the six.
- **Arc / playback** — on a short, missing drip or spoken CTA, a long-form beat, or a
  non-`spoiler` cover dumping the answer; on long-form, the cover's `arc` is outside the two (read as
  answer-first); on a story arc, no `turn` or no `result` shot, or the shot right before the
  payoff isn't the turn; on answer-first, a `turn` beat, or body with no result shot; either
  arc, a first shot that isn't the cover.
- **Shot grammar** — a shot with no `shot.feel`; a `shot.size`/`shot.angle` outside the
  vocabulary; a second `cu`/`choker`/`ecu` in one scene; a third `choker`/`ecu` in the
  episode; a second `dutch`; a close-up opening not paid back by the next shot
  (directing-grammar §6 · §8).

This is where text clipping and contract violations get caught before production — if it
flags here, fix and reopen.

## research.md

The ledger of research and verification. **Every factual claim** that lands in the storyboard
must map 1:1 to an entry here.

```markdown
# <topic> — research & verification log (<YYYY-MM-DD>)

## Questions this episode has to answer          # §2.1: 3–5 direction-finding rows. §2.3: rewrite to the chosen episode's 5–8.

| # | Question | Why it's needed (hook · result · figure on screen · line) | Status |
|---|---|---|---|
| Q1 | <what the viewer asks / what the hook promises> | hook | answered by claim 1 |
| Q2 | <the figure that will be the hero stat> | stat | answered by claim 2 |
| Q3 | <…> | line | written off — no two sources; not used |

## Verified                                      # ★ = a key claim (hook · hero stat · result) — counter-evidence is owed to these after the pick

| # | Claim | Source 1 | Source 2 | Tool | Checked | Notes |
|---|---|---|---|---|---|---|
| ★1 | <figure·deadline·effective date> | <URL> | <URL> | naver_search | <YYYY-MM-DD> | source excerpt: "…" |
| 2 | <context the lines lean on> | <URL> | <named source> | WebSearch | <YYYY-MM-DD> | |

## Wow                                          # three or more gaps a viewer would say 진짜? at (SKILL §2.1, scenario-stage §The wow first) — decided before any message. The 믿는 것 half is something the profile §1 viewer actually believes; the 실제로는 half is on Verified rows and never ends on 모른다.

| # | 믿는 것 — what the viewer walks in believing | 실제로는 — what the evidence shows | Type | On claims | → M# |
|---|---|---|---|---|---|
| W1 | <the belief, in the viewer's words> | <the reversal, said plainly> | 반전 | 1, 3 | → M1 |
| W2 | <a different belief> | <a figure that should not be possible> | 숫자 | 2 | → M2 |
| W3 | <…> | <…> | 숨은 원인 | 3 | → M3 |

## Messages                                     # three things a viewer living now takes away (SKILL §2.1) — each the so-what of one wow, decided before any direction. A sentence true with the names gone: what leads to what, present tense, no figure, no name (scenario-stage §The message). None is what happened, and none is a report of ignorance ("X는 알 수 없다").

| # | Wow | Message — what the viewer understands, reconsiders or can do after this | Why it reaches them today | On claims | Status |
|---|---|---|---|---|---|
| M1 | W1 | <one sentence — the subject, what happened or works, why it matters to them> | <what in their life it touches> | 1, 3 | → D1 |
| M2 | W2 | <a different message, not a rephrase> | <…> | 2 | → D2 |
| M3 | W3 | <…> | <…> | 3 | → D3 |

## Directions                                   # three different episodes this topic could be — one topic cut from each message (SKILL §2.1). None marked chosen until §2.2 picks one.

| # | Message | 주제 · the question this episode answers | Hook form | Engine | Hero / stake | Already verified | Still to research | Score | Status |
|---|---|---|---|---|---|---|---|---|---|
| D1 | M1 | <one sentence — the subject that delivers M1; never "…는 아직 모른다"> | gap | curiosity | <a stat · a person · a mechanism> | 1 | <what the second pass still owes> | 96 | chosen |
| D2 | M2 | <one sentence — a different episode, not a rephrase> | number | fear | <…> | 2 | <…> | 95 | not used |
| D3 | M3 | <one sentence> | identify | comedy | <…> | 3 | <…> | 91 | not used |

Chosen: D1 (<YYYY-MM-DD>) — <one line why, including the engine>

## Counter-evidence & freshness                   # one row per key claim (SKILL §2.3)

| Claim # | Counter-evidence search | What came back | Freshness search (≤1y) | Still current? |
|---|---|---|---|---|
| 1 | "<X> 아니다 / 논란 / 바뀜" | <nothing contradicting / a correction — and what was done> | period:1y news | yes · <as-of date> |

## Failed verification → excluded

| Claim | Reason |
|---|---|
| <claim> | sources conflict — excluded from the body |

## Sufficiency                                    # the exit of SKILL §2 — checked before §4 opens

verified claims: <N> (floor 3 — aim 5+ short / 12+ long) · questions answered: <n>/<total> · written off: <list>

## Search history                                # one row per search — §2.1 floor 10; the checker also counts against 2 × questions

| Tool | Query | Result summary |
|---|---|---|
| naver_search(news) | "<query>" | … |
| WebSearch | "<query>" | … |
```

## Status transitions

`draft` → (HITL approval) → `approved` → (produce done) → `produced` → (publish done) → `published`

Each skill updates `status` in the storyboard.md frontmatter when its stage completes — the
directory alone tells you where the pipeline stands.
