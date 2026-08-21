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
---

# <topic display name> — Storyboard

- **Channel**: <display name> (`data/<slug>/profile.md`)
- **Expected total length**: <NN>s (main <N> shots + outro)
- **Core message**: <the one sentence this video delivers>
- **Playback order**: cover → hooking → result → body
- **Opening strategy**: <fear / empathy / curiosity / spoiler (show the ending first)> (`hookType: <fear|empathy|curiosity|spoiler>`) — <one line on how the title, segment ①, and the hooking shot carry that stimulus>
- **Cover hook**: "<cover title>" — hero stat <stat>

## Sequence — <purpose>          # only when one episode has two purposes

## S#1. <location> / <time>

### Shot 1 — cover · wide

![scene-1](images/scene-1.png)

| Item | Content |
|---|---|
| beat | cover / hooking / result / body / CTA |
| info of this shot | <one line the viewer newly learns> |
| picture | still photo / AI video / recording / shared asset |
| overlay | HTML reveal · captions · typing / none |
| target length | ~<N>s |
| kicker | <value> |
| title | <value> (chars: N) |
| stat / statLabel | <value> / <value> |
| narration ① | tts: "<phonetic notation>" · sub: "<original notation>" |
| narration ② | tts: "…" · sub: "…" |
| background prompt | <bgPrompt summary> |
| action | <who does what — one action, and it has to be the thing this shot's line is about> |
| camera | <opening framing + move + closing framing — the move follows the action> |

`action` and `camera` are filled per shot on a **motion-first channel** (one whose `profile.md`
declares it — see scenes-schema §motion background). A still cut writes `action: —` and says in
one line why a still is enough there. Writing `Ken Burns on a still` or `the prop moves` into
`action` does not satisfy it: a person-shaped character has to be doing the thing.

Keep `camera` in the same stretch form the video prompt takes — `opening frame + move + closing
frame` — so the shot table and `scenes.js` `motion` say the same scene. Do not add a move for
mood alone (§motion background: moves don't shift emotion, p=.84); the move exists to follow the
action.

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

- **Shot card** — one `SCENES[]` entry. The header carries the role (`COVER`), size, the
  opening-strategy name tag (cover only), the **beat** (cover, hooking, result, body, CTA),
  and the two production-layer badges (picture / overlay). Entries sharing `scene` are grouped
  under a scene band (`S#1. location / time`). The last main shot is not stamped PAYOFF.
- **Scene-frame rows** — one reveal = one row. A 9:16 frame on the left; on the right, the
  text and dialogue at that moment. A reveal is not a shot. A channel-color badge means AI
  video; an outline-only badge means HTML staging.
- **Contract check** — at the top of the document. Beyond character counts, speech rate, shot
  length, and frame overflow: whether the recorded `picture`/`overlay` match the structure,
  whether `shot.info` within the same scene overlaps, and whether the playback order is
  **cover → hooking → result → body**. Body before result is a violation; a missing hooking
  shot, or the shot after the cover not being the hooking shot, is a warning (scenes-schema
  §hooking — informational episodes have a hooking shot too). A missing cover `hookType`, or
  a value outside the four, is an opening-strategy warning (§the four opening strategies —
  this is a name-tag check; whether one of the four is actually present in the opening is
  what the reviewer's copy mode looks at).

The mode (shooting/generated) is auto-detected from `visual.source`, the illustration mode
from `narration[].img`. Shooting mode has one overlay per shot, so a single reveal row. The
timeline slots are shots, and b-roll plugs in at the playback position `after` sets.

**Check items** — character counts, speech rate, scene length, total length, cover title 16
chars, statLabel 18 chars, playback order (cover → hooking → result → body), plus:

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
- **Missing outro length** — an outro scene exists but `SB_DOC.outro` is empty.
- **Unfilled placeholders** — blocks approval while `{{…}}` remains in SB_DOC.

This is where text clipping and contract violations get caught before production — if it
flags here, fix and reopen.

## research.md

The ledger of research and verification. **Every factual claim** that lands in the storyboard
must map 1:1 to an entry here.

```markdown
# <topic> — research & verification log (<YYYY-MM-DD>)

## Verified

| # | Claim | Source 1 | Source 2 | Tool | Notes |
|---|---|---|---|---|---|
| 1 | <figure·deadline·effective date> | <URL> | <URL> | naver_search | source excerpt: "…" |

## Failed verification → excluded

| Claim | Reason |
|---|---|
| <claim> | sources conflict — excluded from the body |

## Search history

| Tool | Query | Result summary |
|---|---|---|
| naver_search(news) | "<query>" | … |
| WebSearch | "<query>" | … |
```

## Status transitions

`draft` → (HITL approval) → `approved` → (produce done) → `produced` → (publish done) → `published`

Each skill updates `status` in the storyboard.md frontmatter when its stage completes — the
directory alone tells you where the pipeline stands.
