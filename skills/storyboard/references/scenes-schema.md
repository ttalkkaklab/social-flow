# scenes.js data contract (SoT)

`data/<channel>/episodes/<topic>/storyboard/scenes.js` — the one data source produce
consumes after storyboard approval. `video-template.html` loads it with
`<script src="./scenes.js">`.

## Contents

- [Overall structure](#overall-structure)
- [Comprehension contract — `window.COMPREHENSION`](#comprehension-contract-windowcomprehension)
- [Format — `window.FORMAT`](#format-windowformat)
- [Grammar units and production layers](#grammar-units-and-production-layers)
- [Playback order — format picks the skeleton](#playback-order-format-picks-the-skeleton)
- [Fields common to every shot](#fields-common-to-every-shot)
  - [narration segments](#narration-segments)
  - [title is a spoken hook · narration explains in polite register (user directive, 2026-08-13)](#title-is-a-spoken-hook-narration-explains-in-polite-register-user-directive-2026-08-13)
  - [visual plan](#visual-plan)
- [Contracts by type](#contracts-by-type)
  - [cover — on a short, a gap; on long-form, the result or the moment](#cover-on-a-short-a-gap-on-long-form-the-result-or-the-moment)
  - [hooking — long-form only. The shot after the cover](#hooking-long-form-only-the-shot-after-the-cover)
  - [points — one message per screen](#points-one-message-per-screen)
  - [quote — speech / quotation](#quote-speech-quotation)
  - [Claim traceability (`claim`) — which research entry a sentence rests on](#claim-traceability-claim-which-research-entry-a-sentence-rests-on)
  - [Scene transition (`transition`) — the boundary before this shot](#scene-transition-transition-the-boundary-before-this-shot)
  - [Camera — the four slots (`visual.camera`)](#camera-the-four-slots-visualcamera)
  - [Frame space (`shot.space`)](#frame-space-shotspace)
  - [Character reference (`visual.character`)](#character-reference-visualcharacter)
  - [Clip audio (`visual.audio`)](#clip-audio-visualaudio)
  - [Clip prompt — one scene, one call, the prompt stored here](#clip-prompt-one-scene-one-call-the-prompt-stored-here)
  - [Music cues (`window.MUSIC` · `sound`)](#music-cues-windowmusic-sound)
  - [Cut length (`duration`) — decided by what the cut is for](#cut-length-duration-decided-by-what-the-cut-is-for)
  - [Motion background (`visual.video`) — a scene background from image to video](#motion-background-visualvideo-a-scene-background-from-image-to-video)
  - [broll — a generated-video stretch (reference only) · spliced between scenes](#broll-a-generated-video-stretch-reference-only-spliced-between-scenes)
  - [outro — a brand close with a next value (reference only)](#outro-a-brand-close-with-a-next-value-reference-only)
  - [chapter — long-form chapters (`youtube-long-16x9` only)](#chapter-long-form-chapters-youtube-long-16x9-only)
  - [Filmed scenes — clips the user shot themselves (`visual.source: "recording"`)](#filmed-scenes-clips-the-user-shot-themselves-visualsource-recording)
  - [Screencast splice — one recorded screen inside an ordinary episode (`visual.source: "screencast"`)](#screencast-splice-one-recorded-screen-inside-an-ordinary-episode-visualsource-screencast)
  - [The authored-screen lane — three kinds under one key (`visual.slide.kind`)](#the-authored-screen-lane-three-kinds-under-one-key-visualslidekind)
  - [Slide scenes — a screen where text and shapes are the subject (`visual.slide`)](#slide-scenes-a-screen-where-text-and-shapes-are-the-subject-visualslide)
  - [Motion diagram treatments — editorial frame or photo action (`visual.slide.treatment`)](#motion-diagram-treatments-editorial-frame-or-photo-action-visualslidetreatment)
  - [Motion slides — a slide whose numbers move (`visual.slide.motion: true`)](#motion-slides-a-slide-whose-numbers-move-visualslidemotion-true)
  - [Kinetic type — the words are the picture (`visual.slide.kind: "kinetic"`)](#kinetic-type-the-words-are-the-picture-visualslidekind-kinetic)
  - [Character act — a cast enacts the sentence on screen (`visual.slide.kind: "character"`)](#character-act-a-cast-enacts-the-sentence-on-screen-visualslidekind-character)
- [Authoring verification checklist (the storyboard skill's self-check before requesting approval)](#authoring-verification-checklist-the-storyboard-skills-self-check-before-requesting-approval)

## Overall structure

```js
// approved: 2026-07-29        ← recorded by the storyboard skill at HITL approval
window.FORMAT = "shorts-9x16"; // format axis — omitted means shorts-9x16 (§format)
window.VOICE = "user";         // all-live-voice episodes only (§all-live-voice episodes) — omitted means TTS
window.THEME = {
  accent:  "#5b8cff",          // emphasis gradient start — verbatim from profile.md §3
  accent2: "#a05bff",          // emphasis gradient end
  ink:     "#0b1020",          // base dark (background, subtitle outline)
  brand:   "channel name"      // brand wording on the outro
};
window.COMPREHENSION = { /* the one-question contract — see below */ };
// window.MUSIC = { … };   // named music cues (§music cues) — leave the line out for one bed all the way through
window.SCENES = [ /* the shot array — one entry = one shot. Keep the identifier names */ ];
```

Don't change the array name (`SCENES`), the filenames (`scenes.js`, `images/scene-N.png`),
or the capture index (`frame.html?i=n`). Those are the machine identifiers produce reads.
Only the human-readable labels move to shot, scene, and sequence.

## Comprehension contract — `window.COMPREHENSION`

This block is written in the story pass before a shot gets a camera or a prompt. It makes the
episode compressible to one question, one answer, and one thing the viewer should retain:

```js
window.COMPREHENSION = {
  mode: "informational",                    // informational | narrative
  question: "군은 왜 발표를 바꿨을까요?",
  answer: "기밀 풍선 임무를 숨기려고 날씨 기구라고 설명했어요.",
  takeaway: "설명 번복이 오래된 불신을 키웠어요.",
  branches: [],                              // cross-scene supporting questions only
  terms: [
    {
      term: "레이더 반사판",
      plain: "레이더 신호를 되돌리는 금속 구조물", // exact wording spoken in firstShot
      firstShot: 3
    }
  ]
};
```

- `question` is the governing viewer question. `answer` closes it. `takeaway` is the synthesis,
  not the answer repeated with different wording. In short-form their non-space character caps
  are 35, 60, and 45.
- `branches` lists only questions held across a cut. A question paid inside the same shot is a
  seam and stays out of this array. A short informational episode gets no cross-scene branch;
  it follows the governing question only. A short narrative may carry one. Long-form may carry
  up to four.
- `terms` lists every unfamiliar name or technical term that survives into narration. Short-form
  gets at most three. `plain` is the exact easy wording spoken in the same `firstShot`, before or
  beside the term. If a name changes neither the answer nor the takeaway, cut the name instead of
  adding it here.
- `check-scenes.js` treats a missing block, an over-budget branch or term list, a wrong first
  shot, and a plain wording that is not actually spoken as violations. The reviewer handles the
  semantic half: an undeclared branch, a disposable proper name, or a scene whose evidence never
  reaches the answer.

`SB_DOC.craft` still carries plants, the feel curve, and visual promises for the approval page.
It does not replace this block: craft tracks how a story lands; comprehension tracks what a
first-time viewer has to hold while it does.

## Format — `window.FORMAT`

This one line settles canvas, length, character counts, subtitles, and chapters all at once.
There are only two values.

| Value | What | Where to |
|---|---|---|
| `"shorts-9x16"` | short-form portrait 1080×1920 (**the default when omitted**) | YouTube Shorts · Instagram · Threads · Facebook |
| `"youtube-long-16x9"` | YouTube long-form landscape 1920×1080 | YouTube alone |

**The source of truth for the constants is
`skills/platform-guide/references/formats.js`.** The table below is the summary you consult
while authoring; the real values are what `format-resolve.js` hands the builder. When the two
disagree, the preset is right.

| Contract | Short-form 9:16 | Long-form 16:9 |
|---|---|---|
| Main total length | 35–75s (hard 90) | 8–15 min (hard 20 min) |
| Shot count | 4–7 | 28–70 |
| Scene length | 4–13s | 6–20s · **no cap in the filmed lane** |
| Narration characters | cover 40 · body 50 | cover 70 · body 90 |
| Sentence length | 8–25 chars | 12–40 chars |
| Subtitles | burned in (BURN=1) | **clean master + `subs.srt`** — not burned |
| Generated video, combined | 16s (8s × 2 slots) | 40s (8s × 5 slots) |
| Chapters | none | 5–10 (authored) · 3 or more in the filmed lane (derived) |
| Ken Burns pan | available — travel = W(z−1) ≈ 130px at 1.12, measured on portrait | used (scale 1.06–1.35) |
| Outro asset | `outro.mp4` | `outro-16x9.mp4` |
| Filmed scenes | the episode is either all filmed or all generated | **mixed within one episode** (§filmed scenes) |
| Screencast splice | **per scene** — one recorded screen inside a generated episode (§screencast splice) | per scene, same contract |

**Long-form is `provisional`.** The safe area was measured only on desktop web; mobile web
landscape and the top title bar haven't been measured yet (`safezone-landscape.md`). Those two
can only move in the direction of **narrowing** where text can sit, so long-form made with
today's values may end up with subtitles and titles a bit further in later. It doesn't block
authoring, but tell the user at the approval gate.

Writing an unknown value stops `format-resolve.js` with `exit 1` — a silent fall back to
portrait would only surface after burning 12 minutes' worth of captures.

## Grammar units and production layers

One short is a book, a sequence is a paragraph, a scene is a sentence, a shot is a word.

| Unit | Meaning | In this file |
|---|---|---|
| Sequence | Scenes bound by one purpose. "This stretch" | `sequence` — written only when purposes diverge. Omitted when the episode has one |
| Scene | One place, one event in one continuous stretch of time. The head is `S#1. inside the café / day` | `scene` + `sceneSlug`. A new number when place or time changes |
| Shot (a "cut" on set) | One unbroken chunk from recording ON to OFF | **one `SCENES[]` entry**. `type` is the role (cover/points/…), not a grammar unit |
| Reveal | The moment on-screen text appears within the same shot | `narration` segments and bullets. Not a shot — the scene-frame row label is "reveal" |
| Take | A retry of the same shot | Shooting script and generation rounds. Not an entry in this array |
| Coverage | Material from filming one scene at several sizes | Shots sharing a `scene` number. When `shot.info` overlaps, one of them is enough |

A short is usually one sequence. Scenes divide only when place or time breaks. Shots go **one
per new piece of information** — 4–6 shots in a dialogue scene is standard, but for a 35–75s
informational piece the floor is 2 shots at different sizes per scene (wide + close).

`type` (cover/points/quote/broll/outro) is the kind of screen. The **playback role** is `beat`.
It's orthogonal to the grammar axis.

## Playback order — format picks the skeleton

**`window.FORMAT` picks the skeleton.** Short-form and long-form do not share a beat list.

### Short-form (`shorts-9x16`, the default) — hook → drip (1–n) → cta

A short is three acts, always. `arc` is ignored; `hooking` · `result` · `body` · `turn` on a
short are defects, not aliases. `check-scenes.js` hard-fails them.

| `beat` | Name | What it does | Where |
|---|---|---|---|
| `hook` | cover | Opens a gap — a reason to stay in the first 3 seconds. **Does not dump `COMPREHENSION.answer`.** `hookType` is `fear` · `empathy` · `curiosity` (`spoiler` is forbidden). `hookForm` is `paradox` · `gap` · `identify` · `number` · `secret` (`payoff` is forbidden). No logo, no intro sting, no greeting | `type:"cover"` — it's the cover even unwritten |
| `drip` | curiosity stage | **1–n shots, n ≥ 1.** Each shot except the last pays one piece of the answer and opens the next gap in the same breath (scenario-craft §5). The last drip is the first place the answer is complete. Typically 2–5, so the 4–7 shot band still holds | usually `type:"points"` |
| `cta` | next / act | The last **narrated** shot. One outward act: a comment question, a next-episode promise, or a memory question that produces comments. Subscribe/like is still banned. A shared `type:"outro"` asset is not this beat | last narrated shot — write `beat:"cta"` |

The four drop-off jobs map onto those three beats:

| Job | Short-form beat | What it has to do | What kills it |
|---|---|---|---|
| **stop** | `hook` | 0–3 s: big title, a strong first frame, movement already in it, a gap the viewer can feel | a first frame the thumb slides past; the cover speaking the answer; `spoiler` / `payoff` |
| **hold** | `drip` (every shot except the last drip) | pay one piece, open the next — the viewer is never done wondering. Something changing on screen every 2–4 s | a drip that only explains; dumping the whole answer on drip 1 |
| **satisfy** | last `drip` | the first place `COMPREHENSION.answer` is complete | a hook the drips can't keep; ending on explanation with no complete answer |
| **act** | `cta` | after the answer, one outward loop — a comment question, the next episode's concrete result, or a memory question | a vague subscribe ask; no spoken CTA; ending on the shared outro alone |

Why this order: half or more of the viewers who leave a Short leave inside the first 3 seconds,
completion is the first distribution signal under 60 s, and a curiosity loop — a question thrown,
the answer delayed and paid in stages — is the strongest hold short-form has (user-relayed,
2026-08-23 — field-practice grade; own-channel retention, n=4, 2026-08-26 — the body that paid
in installments held flat, the body that explained something already accepted slid from the
third second). Zeigarnik is the name for the mechanism, not a measurement of it.

### Long-form (`youtube-long-16x9`) — one skeleton, two arcs (`arc`)

Long-form still walks stop · hold · satisfy · act. The cover shot says which path with `arc`.
A `drip` beat on long-form is read as `body`.

- **`answer-first`** (the default — a file with no `arc` is read as this) — **cover → hooking →
  result → body → cta**. The cover shows the result at a glance, hooking hooks why it's needed,
  the result unfolds it properly, and the body unspools only after **the finished thing has been
  shown ahead of the method**. Method before result means listening to an explanation without
  knowing the destination. Builds, tutorials, before/after comparisons, most informational pieces.
- **`story`** — **cover → hooking → body → turn → result → cta**. The cover opens a loop on the
  moment something went wrong or strange and **does not say how it ended**; hooking is the
  setup — who, when, what they were trying to do (the original goal has to be clear, or the
  reversal has nothing to land on); the body builds the conflict — why it was judged useless,
  why it nearly got buried; the turn is the moment someone or something saw it differently, the
  highest tension in the episode; the result is the payoff, **the first place the answer
  appears**, wide enough to see what it became; the cta is the afterglow — a frame that connects
  back to the cover, one question or the next episode. Material that is an unfinished sentence
  on its own ("he tried to make a super-glue and failed completely") is story material — the
  loop is already in it, and a payoff shown early closes the loop and takes away the reason to
  watch. As proportions of the main body: the setup stays under a fifth, the turn lands around
  the two-thirds mark, the payoff takes the last quarter before the cta.

Why the story arc is its own order: a piece with a clear narrative structure completes 2–3×
more often than a non-narrative one. Grade: practitioner blogs —
[GhostShorts](https://ghostshorts.com/blog/how-to-make-storytelling-videos-that-keep-viewers-hooked-2026)
(the 2–3× figure and hook → build → tension → payoff) and
[House Sparrow Films](https://housesparrowfilms.com/blogs/how-to-hook-viewers-in-the-first-3-seconds-tips-for-reels-and-shorts)
(curiosity loops); no method published (user-relayed, 2026-08-23).

| `beat` | Name | What it does | Where |
|---|---|---|---|
| `hook` | cover | answer-first: puts the finished thing in the first frame. story: the moment it went wrong, close, the ending withheld. Either way the first line gives a reason to stay | `type:"cover"` — it's the cover even unwritten |
| `hooking` | hooking / setup | answer-first: problem, harm, loss, resolve — why that result is needed; catches what the cover threw (the chosen opening strategy) and doesn't unpack the answer. story: the setup — era, person, the original goal — the ending still withheld | **right after the cover** (§hooking) |
| `result` | result / payoff | answer-first: shows the finished thing properly — scrolling, demo, before/after. story: the payoff — what it became, the loop closed, shown wide enough to see the whole thing | answer-first: **right after hooking, before the body**. story: **after the turn, before the cta** |
| `body` | body / build | answer-first: the method, evidence, and steps that made that result. story: the build — the conflict, the rejection, the reason it almost got lost, tension rising | answer-first: after the result has been seen. story: after the setup |
| `turn` | turning point | **story only** — the moment someone or something saw it differently; the peak of tension, the last beat before the answer. A double hit: the situation flips and the plant re-reads in the same shot, the outcome itself still withheld (scenario-craft §9) | right before the result |
| `cta` | next / afterglow | answer-first: what gets finished in the next episode. story: a frame that loops back to the cover — one question or the next episode | At the very end. `type:"outro"` lands here even unwritten |

**What each long-form beat does to the drop-off curve — stop · hold · satisfy · act.**

| Job | answer-first | story | What it has to do | What kills it |
|---|---|---|---|---|
| **stop** | `hook` | `hook` | 0–3 s: big title, a strong first frame, movement already in it — no logo, no intro sting, no greeting. story: the moment of failure, close, no hint of how it ended | a first frame the thumb slides past; a story cover that names the ending |
| **hold** | `hooking` | `hooking` · `body` · `turn` | keep the promise visible and the answer withheld — through the first 60 s, story through the turn (setup lean, tension climbing setup → build → peak), something changing on screen every 2–4 s | unpacking the answer; drifting from what the cover threw; a setup that dawdles |
| **satisfy** | `result` · `body` | `result` | pay the promise the cover made — answer-first: the result, then how; story: the payoff, the first time the answer is on screen | a hook the body can't keep |
| **act** | `cta` | `cta` | after the answer, open one loop outward — a judgment call the comments will argue over, a rewatch pointer, a share-worthy single fact, plus the next concrete thing; story: the frame that loops back to the cover (scenario-craft §5 loop ending) plus a callback and a memory question (scenario-craft §12) | a vague subscribe ask; the same judgment question verbatim every episode |

And in between, **every visual change resets attention for a few more seconds** — high-performing
Shorts change something on screen every 2–4 s (user-relayed, 2026-08-23 — field-practice grade,
unsourced). One narration sentence = one reveal gives that
cadence on its own (§narration segments); a stretch longer than ~4 s with nothing changing is a
stretch to cut or to give a caption swap, an image change or a move.

**Underneath the beats run ten craft rules** — the source of truth is
[`scenario-craft.md`](scenario-craft.md). The two that bind every episode: adjacent scenes
join with a "but" or a "therefore", never an "and then" (the connective test — an
"and-then" seam is scene-mode P0-2 material), and every scene turns a charge — what's at
stake reads differently at the scene's close than at its open, with `shot.feel` as the
place the turn shows (a scene that turns nothing is scene-mode P0-1 material). The other
five are per-technique: the story `turn` is planted in advance and fair-play
(misdirection, never deception), fear runs on suspense plus a doable answer, every
curiosity loop opened names the scene that pays it, comedy breaks a pattern with the
break landing last, and the peak and the end get designed as the two moments the episode
is judged by (scenario-craft §7). Three more bind the story arc: the body holds before it
bursts — a rising series of holds, the release an action rather than the emotion (§8); the
`turn` is a double hit — the situation flips and the plant re-reads in the same shot, the
outcome itself still kept for the result (§9); and the premise is shown working once (claim ·
act · result) rather than explained (§10). On every arc the payoff shot copies its plant's
frame (§3) and the signature line lands once (§7).

On a short the cover opens a gap and the last drip is the first place the answer is complete.
Don't put the finished answer on the cover, and don't unfold it again in the CTA. On long-form
answer-first the cover's first frame and the result scene point at the same artifact — the
cover is the glance; the result unfolds it so the built parts show. On a story arc they are
different on purpose — the cover is the moment, the result is what it became — and it is the
cta's frame that points back at the cover.

Left unwritten, the renderer reads it this way. `type:"cover"` → hook, `type:"outro"` → cta
(long-form only — a short still needs a spoken `beat:"cta"`), `sequence` opening with `풀기`·
`호기심`·`단계` → drip, `결과` → result, `기획`·`방법`·`내용` → body, `문제`·`후킹` → hooking,
`전환`·`반전` → turn. `check-scenes.js` and `storyboard.html` hard-fail a short that is missing
drip or a spoken CTA, that opens on hooking/result/body/turn, that dumps `COMPREHENSION.answer`
on the cover, or that uses `hookType:"spoiler"` / `hookForm:"payoff"`. On long-form they keep
the arc checks: first shot isn't the cover, no hooking or the shot after the cover isn't
hooking (warning); on answer-first, body before result is a violation; on a story arc, result
before body or before the turn is a violation. The promise ledger (`SB_DOC.craft`, storyboard
SKILL §6) is checked in the same strip — a loop with no payer, a cover promise paid off the
last drip (short) or the result (long-form), a plant paid in a different frame than it was
planted in.

```js
arc: "answer-first"               // long-form cover only — answer-first (default) | story. Ignored on a short
beat: "drip"                      // short: hook | drip | cta. long-form: hook | hooking | result | body | turn (story only) | cta
sequence: "풀기 1"                 // sequence head. Used with beat, the document groups them into one block
```

## Fields common to every shot

| Field | Required | Description |
|---|---|---|
| `type` | ✅ | `cover` \| `points` \| `quote` \| `broll` \| `outro` — the role |
| `narration` | ✅ (except `broll`, `outro`) | Segment array `[{tts, sub}, ...]` — one sentence = one segment = one reveal |
| `visual` | ✅ | The visual plan object (below) |
| `duration` | recommended | Target seconds — narration characters / 4.5, capped at 13s. A generated-video shot takes its length from what the cut is for instead (§cut length) |
| `scene` | recommended | Grammar scene number. Same value for the same place and time. Without it the renderer assumes one scene per entry |
| `sceneSlug` | recommended when `scene` is set | `"place / time"` — e.g. `"salon chair / day"` |
| `sequence` | optional | Sequence name. Only when one episode has two purposes |
| `transition` | optional | the boundary **before this shot**. Omit for a cut (the builder J-cuts spoken cards). `"cut"` is a smash. `"dissolve"` · `"dip"` · `"dip:white"` · `"push:<dir>"` are spent joins. See §scene transition |
| `beat` | optional on long-form, required on a short | short: `hook` \| `drip` \| `cta`. long-form: `hook` \| `hooking` \| `result` \| `body` \| `turn` \| `cta` (`turn` on the story arc only). See §playback order above |
| `arc` | long-form cover only | `answer-first` (default) \| `story` — which playback order a long-form episode walks. Ignored on a short. See §playback order above |
| `shot` | recommended | `{ feel, size, angle, info, infoType, space }` — below. `feel` and `infoType` are written **before** `size`·`angle`·`space`·`camera` are chosen (directing-grammar §5) |
| `sound` | optional | `{ cue, drop, sfx }` — what the audience hears under this shot (§music cues). Narrated shots only (`cover`, `points`, `quote`); `broll` and `outro` aren't cards, so there is nothing for a cue to key to |

```js
shot: {
  feel: "relief — it really is that short",  // what the audience should FEEL here — written first, the dials follow
  size: "mcu",                             // els · ls · fs · mfs · ms · mcu · cu · choker · ecu · insert
                                           // + compositions two · three · ots · pov · back · cutaway · reaction (ws = legacy ls)
  angle: "eye",                            // eye (default) · high · low · overhead · dutch — against the SUBJECT's eyes
  info: "that the install is one command", // one line on what this shot newly TELLS the audience
  infoType: "other",                       // other · timeline · statistic · principle
  space: {                                 // the floor plan of the frame (§frame space) — required on a generated still
    frame:  "camera",                      // the only allowed value — left means left of the picture
    layout: "person on the left third, kitchen door on the right",
    facing: "person faces camera-right, three-quarter view",
    line:   "A left, B right",             // 180° lock — two people, or a person and what they look at
    light:  "key from camera-left"         // optional
  }
}
```

- **`info` is what the viewer newly learns; `feel` is what the viewer should feel.** Two
  different lines — scene mode keys coverage on `info`, camera mode keys the technique on
  `feel`. A `feel` that restates `info` ("that it's one command") is unset.
- **`infoType` routes the explanation before a visual is chosen.** Use `timeline` for ordered
  periods or dated events, `statistic` for a measured count·rate·share·comparison, `principle`
  for a cause, mechanism, or state change, and `other` for every remaining beat. The first three
  are always full-frame seekable HTML motion diagrams. They cannot fall back to a still, footage,
  kinetic type, or a photo with moving annotations. If one shot needs two types, split the shot;
  one authored frame carries one visual argument.
- **Feel first, dials second.** Write `feel`, then pick `size`·`angle` (and `space` on a
  generated still, `camera` on a generated shot, `duration` on a clip) from the
  directing-grammar §5 table — the row is a default, and leaving it means writing why on the
  shot. The size words, the angle words and the space block go into `bgPrompt` too, since the
  still is where they get drawn — `assemble-bg-prompt.js` writes that prefix (directing-grammar
  §3.5). The vocabulary, the cut lines (never at a joint), the distances and the sound that
  matches each size are `directing-grammar.md` §2–§3.
- If `info` matches another shot in the same scene, that shot can be dropped. That's what
  coverage design is.
- When you open on a close-up, pay back "where are we" with a wide or medium in the next shot.
- **The close-up is rationed** — one close-up (`cu`·`choker`·`ecu`) per scene, `choker`/`ecu` once or twice per episode,
  one `dutch` per episode with its reason written on the shot. The check strip warns past those
  counts (directing-grammar §6).
- **Hook cuts and speech clips sit at `eye`** unless a reason is written — the one angle rule with
  a measurement behind it.
- produce runs fine on an old `scenes.js` without these fields. Only the human document and the
  checks look empty.

### narration segments

```js
narration: [
  { tts: "사천칠백만 동이 기준입니다.", sub: "4,700만 동이 기준입니다." },
  { tts: "안 내면 과태료가 붙습니다.",  sub: "안 내면 과태료가 붙습니다." }
]
```

- `tts` — Korean phonetic spelling (numbers and loanwords as they sound: "4,700만"→"사천칠백만",
  "eTax"→"이택스")
- `sub` — the subtitle's original notation (numbers and proper nouns kept as written)
- `img`, `imgPrompt` (optional) — **per-line illustration mode**: when attaching one
  illustration per segment, write the path and the generation prompt (the scene-content part).
  When the storyboard.html renderer detects these fields it switches to illustration mode,
  laying that line's illustration behind each panel and drawing in light mode — so the picture
  changing as the line changes is visible in the document itself.
  produce consumes them at the capture stage — it passes that line's `img` as `&bg=` per reveal
  state, and turns on `&light=1` (light mode) for white-background line art (the illustration
  mode procedure in produce SKILL §4). Generate cover illustrations with the character in the
  bottom third (light mode seats the cover text at the top). Keep `visual.bg` as the
  representative illustration (row 1) — it's the source for the cover still and the thumbnail.
  First case: the 2026-08-12 dropshipping storyboard.
- Cut sentences clearly on periods — the build's sentence-boundary detection (silencedetect)
  looks for the silence at a period. Long sentences strung together with commas give it no
  boundary.
- Character caps (spaces and punctuation excluded): cover ≤40 total, points/quote ≤50 total.
  8–25 per sentence — under 8 narrows the reveal window below 0.9s.
- Make the last sentence especially short (the beat before the transition).
- **Every sentence does one of three jobs, or it goes** — it opens or deepens curiosity, it
  moves the information forward, or it puts evidence on the table. A segment that does none
  of the three (a greeting, a restatement, a "so as you can see", a transition that carries
  nothing) is cut, not polished — in the body every second has to do one of the three (user
  directive, 2026-08-23). Copy mode reads for it (P0-11).
- **Subtitles are read with the sound off** — most short-form is watched muted. One segment is
  one subtitle: 4–7 words, which is the 8–25-character band above; high contrast on the
  builder's band (y 1380–1560, inside the bottom safe zone — platform-playbook §7); nothing the
  viewer has to hear to follow. If a line only works with the voice, the subtitle isn't doing
  its job.
- **One sentence = one reveal = one visual change**, and that is the 2–4 s cadence that keeps
  attention — don't merge two sentences into one reveal to save a caption, and don't let a
  stretch run past ~4 s with nothing changing on screen (§playback order, the cadence note).

### title is a spoken hook · narration explains in polite register (user directive, 2026-08-13)

Every scene's on-screen title is written as **what the viewer blurts out inwardly** — a
casual-register exclamation, question, or piece of hearsay.

```
원하던 색이 아닌데 ㅠㅠ  /  같은 염색약인데 왜 달라?  /  얼룩 없어지는 데 2년이래
```

An explanatory statement ("같은 염색약도 사람마다 다르다") isn't title material — captions and
narration carry that information. How the three surfaces divide the work:

| Surface | Register | Role |
|---|---|---|
| title | **spoken casual** (exclamation, question, `-대`, `-더라`, `-았어`; ㅠㅠ allowed) | Throws the emotion or question |
| caption (bullets) | written style allowed | One line of information |
| narration | **polite explanation** | Answers the question the screen threw |

- Now that the title is a spoken surface it follows D9 — don't close it with newspaper-style
  `-ㄴ다/-는다`.
- **Check for homophone traps** — a phrase standing alone on screen has no surrounding context,
  so it gets read first as a different word that sounds the same. Two measured cases:
  `얹힌대` (read as 체했대) and the hearsay ending `-는 거래` (read as 매매 去來). Before writing,
  say it aloud once and ask "reading only these characters, what does it look like"; if it
  catches, switch to a realization form (`-는 거였어?`) or a witnessed form (`-더라`).
- The character cap (16 displayed) and the topic-word rule are unchanged.
- It applies to **every points scene**, not just the cover.

### visual plan

```js
visual: {
  picture: "still",                  // still | ai-video | recording | asset | slide — the screen body
  overlay: "html",                   // html | none — HTML staging over the screen
  bg: "images/scene-1.png",          // generated background (produced at the storyboard stage)
  bgPrompt: "…",                     // the prompt used to generate it (record for regeneration and audit)
  motion: "very slow dolly in",      // cover only: the veo camera direction for the opening b-roll
                                     // written in veo vocabulary — push and orbit appear 0 times in the canonical docs
  video: null,                       // points only: the motion-background shot marker (§motion background) — omitted for stills
  clip: null,                        // quote only: the speech clip plan (below)
  source: null,                      // "recording" (§filmed scenes) | "screencast" (§screencast splice) — where the picture was recorded
  slide: null,                       // authored screen — { file, kind, treatment, role, motif, plan, labels, motion, acts }
  action: null,                      // visible subject action — required when the channel motion policy says so
  character: null,                   // who is on screen (§character reference) — "<id>" | ["<id>", …] | null
  camera: null                       // the four camera slots (§camera) — required on every generated-video shot
}
```

One shot can overlap a **screen body** and **staging over the screen**. A cover floating the
title and figure in HTML over a still photo is the default. Don't merge the two into one badge.

| `picture` | Screen body | The structural clue |
|---|---|---|
| `still` | Still photo or illustration. Ken Burns is added by the builder | `visual.bg` present, no `video` or `clip` |
| `ai-video` | Generated video — motion background, b-roll, speech clip | `type==="broll"`, or `visual.video`, or `visual.clip` |
| `recording` | **A clip the user filmed themselves** (§filmed scenes), or one window of a screen recording spliced into an otherwise generated episode (§screencast splice) | `visual.source==="recording"` \| `"screencast"` |
| `asset` | A pre-made shared mp4 | `type==="outro"` |
| `slide` | **An HTML screen we authored** — a text-and-shape diagram, words landing one per sentence, or a figure reacting (`slide.kind`, §the authored-screen lane). Every slide is a motion slide (`slide.motion: true`), both formats | `visual.slide` present |

**The verdict is per scene.** Generated and filmed scenes mixing within one episode is the
normal long-form path, so don't flip the whole episode into one mode — that makes a single
filmed scene put the generated scenes under the filming contract (character counts, speech
rate) too. The renderer, the check badges, and the reviewer all look per scene.

| `overlay` | Over the screen | When |
|---|---|---|
| `none` | No text overlay. Just the video itself | b-roll, the shared outro, slide scenes (the slide draws its own text) |

Left unwritten, storyboard.html infers from the clues above. When the written value disagrees
with the structure, the check strip catches it — `picture:"ai-video"` with no `video`, `clip`,
or broll can't produce a video.

Whether `video` is present is the **still / image→video** marker produce reads. `picture` is
the human-readable production layer, and the two have to agree.

### Channel true-motion policy

A channel that promises moving scenes writes the machine contract in `profile.md` frontmatter
and copies it into `scenes.js` so the browser approval page can check it too:

```js
window.MOTION_POLICY = {
  minTrueMotion: "majority",                 // majority | ratio from 0 to 1
  allowedKinds: ["ai-video", "recording"],  // ai-video | recording | motion-slide
  maxConsecutiveStills: 1,
  maxStillSeconds: 4,
  requireAction: true,
  generatedVideoMax: 7
};
```

The profile keys are `motion_min_true`, `motion_allowed_kinds`,
`motion_max_consecutive_stills`, `motion_max_still_seconds`, `motion_require_action`, and
`generated_video_max`. `check-scenes.js` blocks a missing or changed copy: the profile wins.

True motion is a b-roll or video clip, a motion background, a recording or screencast, or a
motion slide when its kind appears in `allowedKinds`. Ken Burns, a camera move over one image,
caption swaps, and still-image changes do not count. With `requireAction: true`, each qualifying
shot also needs `visual.action` to say what visibly changes in the subject. A camera instruction
is not an action. The ratio counts playback cuts and excludes the shared outro; b-roll is placed
at its `after` position before consecutive-still spans are measured.

The format preset owns the generated-video cap when the profile has no override. Raising the cap
does not approve the spend: the storyboard cost panel still lists every generated slot before
production starts.

To prohibit stills completely, set `minTrueMotion: 1`, `maxConsecutiveStills: 0` and
`maxStillSeconds: 0`. Include `motion-slide` in `allowedKinds` when photo-backed HTML motion
is the zero-cost route. In that lane the photo can fill the frame, but the subject or evidence
must visibly change for each narration group and `visual.action` names that change. Panning or
zooming the whole photo, ambient drift, subtitle animation and reveal swaps remain non-motion.

## Contracts by type

### cover — on a short, a gap; on long-form, the result or the moment

```js
{
  type: "cover",
  scene: 1,
  sceneSlug: "reporting desk / day",
  shot: { feel: "alarm — that might be me, unfiled", size: "mcu", angle: "eye", info: "that not filing means a fine",
          space: { frame: "camera", layout: "person on the left third, papers on the desk in the lower right",
                   facing: "person faces camera-right, three-quarter view", light: "key from camera-left" } },
  arc: "answer-first",                      // long-form only — answer-first (default) | story. Omit on a short (§playback order)
  hookType: "fear",                         // opening strategy — fear | empathy | curiosity | spoiler (§the four opening strategies)
  hookForm: "gap",                          // how the first line is built — paradox | gap | payoff | identify | number | secret (§the six hook forms)
  kicker: "베트남 생활 · 행정",              // top series label (rg0)
  title: "임시거주 신고, 안 하면 **과태료**",  // within 16 chars + topic word required (rg1) — the title rides that strategy too
  stat: "500만₫",                           // hero stat (rg2)
  statLabel: "미신고 과태료 상한",            // qualifier within 18 chars
  narration: [ {tts,sub}, {tts,sub} ],      // 2 segments — ① the hook ② the hero stat
  visual: {
    picture: "still", overlay: "html",
    bg: "images/scene-1.png", bgPrompt: "…", motion: "very slow dolly in"
  }
}
```

- title: the stimulus + **what the story is about** (the topic noun) has to be in there.
  `**…**` is the gradient chip. The angle is platform-playbook §1 ② — **a problem a stranger
  already feels, not a method or a tool**. Not "here's how with Notion" but "why am I tired
  every single day". Solutions and methods belong to the drips (short) or the hooking and
  body scenes (long-form). The kind of
  stimulus is whichever of §the four opening strategies is written in `hookType` — the
  "안 하면 과태료" in the example above is fear (`fear`).
- hookType: the strategy this episode's opening rides — one of `fear` · `empathy` ·
  `curiosity` · `spoiler` (showing the ending). Written on the cover shot only.
  Without it `storyboard.html` warns, and if none of the four is in the opening, it's a
  reviewer P0.
- hookForm: **how** the first line is built — one of the six forms in §the six hook forms
  (`paradox` · `gap` · `payoff` · `identify` · `number` · `secret`). `hookType` is why the viewer
  stops (the stimulus); `hookForm` is the shape the title and segment ① take to deliver it.
  Written on the cover shot. Without it `storyboard.html` warns; a form that doesn't serve
  the stimulus is a reviewer correction directive.
- **The first frame has no logo, no intro sting, no greeting.** The stop is decided in 0–3 s:
  a big title (≤16 chars, the gradient chip), a strong first frame (on a short: the gap, the
  person, the figure — not the finished answer; on long-form answer-first: the result), and
  movement already in it — the builder's Ken Burns (`punch` lands the cover's zoom
  inside the first half-second) and the cover's kicker → title → hero-stat staging
  are the floor, an opening b-roll or a real recorded clip is the ceiling. Branding lives in
  the outro (produce absolute rule 6), and the channel intro never sits in front of a short.
- reveal mapping: rg1=title ← segment ①, rg2=stat ← segment ②.

#### The first frame is a gap (short) or the result / the moment (long-form); segment ① is a promise to the viewer

**On a short the cover opens a gap and does not dump the answer.** The first frame and
segment ① name a loss, a stake, or a question the viewer already feels. They do not speak
`COMPREHENSION.answer`. `hookType:"spoiler"` and `hookForm:"payoff"` are forbidden — both dump
the ending at 0 s, which is the long-form answer-first move. `check-scenes.js` hard-fails them,
and it hard-fails a cover whose spoken text contains the compacted answer (8 letters or more).
The last drip is the first place that answer is complete.

On long-form answer-first, build, tutorial, and before/after content shows **the finished
result from the very first frame** of `visual.bg` or `visual.shot`. It doesn't open on process
screens, on an app being launched, or on the speaker's face saying hello. The viewer sees the
result in the first second and hears why to keep watching in segment ①. Informational topics
that can't show a result on screen use the problem situation or the key figure as the first
frame. A story arc opens on the moment instead — the failure or the strange thing, close, with
no hint of how it ended (§playback order) — at its strongest, things that don't belong together
in one frame with no line under them, so the picture asks the one question before the narration
does (scenario-craft §5, the gap as a picture). Either format, the first frame carries no logo,
intro sting or greeting.

The cover's first line (segment ①) is a hook surface separate from the on-screen title. There's
one contract — **the first sentence gives the listener a reason to stay.** That reason hangs on
one of the four opening strategies below.

**Don't open with the speaker reporting their own situation** — a first sentence announcing the
speaker's actions or plans ("I tried ~", "I'm going to ~", "today I'll introduce ~") is a
reviewer copy-mode P0. There's no reason to stay after hearing it. The same content keeps the
contract with the word order flipped — "클로드 코드로 홈페이지를 만들어 봤습니다" →
"순서 하나 바꿨더니 홈페이지가 달라졌습니다".

Evidence: the 2026 Reels skip-rate benchmark averages 25–35%, and even educational content sits
normally at 30–40%, while our own channel measured 84.8–93.8% across 4 episodes that opened with
a speaker report (2026-08-15). The shared condition in overseas hook guides is also one sentence
of promise or problem within 0.5–1.5s — in terms of the four below, that's showing the ending
and empathy.

#### The four opening strategies — fear · empathy · curiosity · showing the ending (one per episode, always)

The opening rides **one or more** of the four: cover title + segment ①, then the first drip on
a short, or hooking on long-form. Write which one it rode on the cover shot as `hookType`.
Overlapping two is fine — the first frame showing the ending while segment ① opens on fear,
say — and in that case `hookType` records what the sound (segment ①) rides. **An opening with
none of the four is a reviewer copy-mode P0.** A short never shows the ending.

| `hookType` | Strategy | What it hooks | Segment ① example |
|---|---|---|---|
| `fear` | fear | A loss or risk the viewer may **already** be carrying — it makes them stop and check | "당신 영상, 알고리즘한테 이미 버림받았을 수도 있습니다" |
| `empathy` | empathy | A problem scene the viewer lives — "that's me" | "대부분 이거 반대로 하고 있어요" |
| `curiosity` | curiosity | A twist, a figure, unresolved tension — something you want to know is visible but not yet filled in | "서버 임대료가 0원이었습니다" |
| `spoiler` | showing the ending | Shows the finished thing or the result first and promises how it got there — the default for build content | "순서만 바꾸면 결과가 달라집니다" (the first frame is the finished screen) |

- **The title carries the same stimulus.** The cover `title` fits the topic word and this
  stimulus into 16 characters, with the spoken-hook rule (§title is a spoken hook) unchanged —
  "임시거주 신고, 안 하면 과태료" (fear), "하루가 왜 늘 피곤하지" (empathy), "서버비가 0원이라고?"
  (curiosity), "순서 하나에 홈페이지가 달라졌어" (showing the ending). The platform title (the
  YouTube title, the IG first line) continues the strategy too (platform-playbook §1 ②, §6).
- **The shot after the cover continues the strategy the cover picked.** On a short that shot is
  the first drip; on long-form it is hooking. The catch contract (same subject, same promise)
  is the hard rule; matching strategies isn't required — a cover opening on fear and the next
  shot catching that loss with an empathy scene is natural. A title on fear with segment ①
  talking about something else counts as a catch violation.
- **A short never uses `spoiler`.** Showing the ending at 0 s is the long-form answer-first
  move; on a short it dumps the answer the drips are supposed to pay. `check-scenes.js`
  hard-fails it. A long-form `story` arc rides `curiosity` (or `empathy`·`fear` on the moment of
  failure) — `spoiler` is the ending in the first frame, which closes the loop at 0 s. Choosing
  it on a story arc takes a written reason on the cover, and the reviewer reads it as a strategy
  that doesn't serve the arc (a correction directive — the strategy P0 stays "none of the four").
- **Fear gets three guardrails.** ① The threat either has evidence in research.md or is hedged
  to a possibility, as in the example above ("~일 수도") — an unhedged assertion is an
  unverified assertion (P0). ② The drips (short) or the body (long-form) answer that threat —
  the first drip, or hooking on long-form, catches it and the later shots unpack it, **and
  the answer is a step the viewer can actually take**: the Witte &
  Allen meta-analysis (2000, measured) has strong fear beating weak fear only when paired with
  a doable action whose result is visible, and strong fear with no door producing defensive
  avoidance — here, the swipe (scenario-craft §4, which also carries the suspense-over-surprise
  rule: put the threat and its clock on the table early rather than saving it for a jump).
  An opening that throws a threat and never unpacks it drags down the
  YouTube Intro metric (did the first 30 seconds match the title and thumbnail's promise).
  ③ The register is one of telling someone about a loss — not a scaring tone, and the polite
  register and spoken-surface rules (§title is a spoken hook, korean-style D9) hold.
  **On a story arc the loss can be the character's** — "이 항아리가 썩었으면, 이 집은 봄까지 채소를
  한 입도 못 먹어요" — riding §4's "the viewer knows first" lane: guardrail ② is then paid inside
  the story (turn and result), not as a step for the viewer, and the cover's `shot.info` says so
  (scenario-craft §12, stakes before the question).
- **Mapping from the old names** — the previous contract's three segment-① forms (promise,
  problem statement, twist/figure) and three hooking forms (problem/harm, unresolved tension,
  resolve/criteria) are subsets of these four: promise = showing the ending, problem statement,
  problem, and harm = empathy, twist, figure, and unresolved tension = curiosity. Resolve and
  criteria are hooking-only forms, so the strategy continues the cover's. The reviewer judges
  by these four alone.

Source: a creator lecture relayed by the user (2026-08-18) — "the four opening strategies that
have performed best so far; every video uses one of them." The source video couldn't be checked
(field-practice grade). Our own measurements are only the 4 skip-rate episodes above, so which
of the four works on our channel is read from episode performance — change one variable at a
time on baseline episodes (see §motion background, the format-overhaul item).

#### The six hook forms — how the first line is built (`hookForm`)

The four strategies say **why** the viewer stops. The six forms below say **how** the title and
segment ① are shaped to deliver that stimulus — the top patterns measured on short-form in
2026 (user-relayed, 2026-08-23 — field-practice grade, unsourced). Pick one, write it on the
cover as `hookForm`, and make the title and segment ① actually take that shape. A form serves a
stimulus; the pairs below are the natural ones, and a form on a stimulus it doesn't serve is a
reviewer correction directive (the strategy P0 stays the four).

| `hookForm` | Form | What it does | Serves | Segment ① / title shape |
|---|---|---|---|---|
| `paradox` | paradox · provocation | a claim that contradicts what the viewer believes — "most people have this backwards", "if you want Y, stop doing X" | `curiosity`, `fear` | a flat contrarian sentence, the topic word inside it |
| `gap` | curiosity gap · open loop | throw a question or a claim and **withhold** the answer — "there's one food quietly slowing your progress" | `curiosity` | name the thing exists, not what it is |
| `payoff` | result first | show or hint the punchline in the first 1–3 s, then promise how | `spoiler` | the first frame is the finished thing; segment ① says what it gets you |
| `identify` | self-identification question | a question the viewer answers "that's me" — "editing on your phone and hitting the wall?" | `empathy` | the viewer is the subject, in the second person or the shared situation |
| `number` | number · framework | a precise figure or a counted structure — "the exact 3 steps we made [figure] with" | `curiosity`, `spoiler` | the number is the hero stat, the structure is the body's spine |
| `secret` | hidden · secret reveal | "hidden/secret" wording — a curiosity gap plus a trust loop (you'll be told) | `curiosity` | promise the reveal, keep it for the last drip (short) or the result (long-form) |

- **The form has to be kept, not just thrown.** The platform now tracks "stopped, then left
  inside 3 s" as a negative signal (user-relayed, 2026-08-23 — field-practice grade, unsourced)
  — a `gap` that the result never closes, a `secret` the body
  never reveals, a `number` the body doesn't count out, a `paradox` the evidence doesn't back,
  is a hook that costs distribution instead of buying it. That is the §playback order
  **satisfy** job, and copy mode docks the drip (short) or hooking (long-form) axis when the
  promise isn't paid.
- **Fear keeps its guardrails** whatever the form — a `paradox` or `number` on `fear` still
  needs the threat in research.md or hedged to a possibility.
- **A short never uses `payoff`.** It dumps the result at 0 s, which is the long-form
  answer-first cover. `check-scenes.js` hard-fails it. On long-form `answer-first` every form is
  open. On `story`, `gap` · `secret` · `paradox` · `identify` keep the loop open; `payoff` and
  `number` close it at 0 s (the payoff is the answer, a counted framework tells the end). Use
  those two on a story arc only with the reason written on the cover — the reviewer treats them
  as a form that doesn't serve the stimulus (correction directive, not a P0). "He tried to make
  a super-glue and failed completely" is a `gap` on its own: it names that the thing exists, not
  what it became.
- **The mapping to our fields** — `payoff` is what the cover contract already demands on build
  types on answer-first (the result in the first frame), `identify` is the hooking "problem·harm" form with
  the viewer as subject, `gap` is the §hooking "don't unpack" rule seen from the first line.
  The six don't replace the four or the hooking contract; they name the shape of the first
  sentence so it can be chosen on purpose and read back against performance.

### hooking — long-form only. The shot after the cover

**Short-form does not use this beat.** After the cover a short walks `drip` shots, then `cta`
(§playback order). `beat:"hooking"` on a short is a violation.

On long-form, if the cover stopped the thumb, hooking carries the stopped person to the result. The two
stretches differ even in the metric the platform measures — the cover is the 3-second skip
rate, hooking is the drop-off curve over the first 30 seconds and first minute. On a story arc
hooking is the **setup** — same slot, same hold job, but its subject is the protagonist and the
goal they had, and the ending stays out of it (§playback order). **It exists in
every episode** — informational pieces too, not just builds. An informational piece may have no
result scene (its first content shot then carries `beat:"result"` — §playback order), but it
still needs a "why stay". `type` is usually `points`, and it may be written
as `quote` when it's a character asking a question. Either way, write `beat: "hooking"`.

```js
{
  type: "points",
  beat: "hooking",
  scene: 1,                                  // same scene number when the place and time match the cover
  sceneSlug: "workroom / late at night",
  shot: { feel: "that's me — the night spent dreading no response", size: "ms", angle: "eye", info: "that a night spent fearing no response is their own story" },
  title: "",                                 // usually left empty — the sound hooks, the screen shows the problem scene
  narration: [ {tts,sub}, {tts,sub} ],       // 1–3 segments. The viewer as the subject
  visual: { picture: "still", overlay: "html", bg: "images/scene-2.png", bgPrompt: "…" }
}
```

- **Where** — the shot right after the cover. An opening b-roll (`after: 0`) isn't a playback
  role but 4 seconds of the cover picture moving, so it can sit between — as long as the first
  shot after it is hooking. It comes before the result (in builds) and the first body scene.
- **Length** — **long-form only, 1–3 shots · 20–60s**, with the result (or the build) inside
  the first 60s. Short-form does not use this beat — after the cover it walks drip shots
  (§playback order). These numbers are provisional — the value sits between TikTok's
  6-second hook and YouTube's 30-second Intro. Revisit with average watch time and retention
  across 3 baseline long-form episodes.
- **The four things it does** — this is where the sources overlap (evidence:
  [hooking research](../../../docs/research/2026-08-18-hooking-beat/)).
  1. **Catch** — continue the same subject and the same promise the cover threw. Don't drift to
     material the cover never had. This is the definition of the YouTube Intro metric — did the
     first 30 seconds match the thumbnail and title's promise.
  2. **Hook** — say the viewer's problem, loss, or gain **with the viewer as the subject**. This
     is where the opening strategy the cover picked (§the four opening strategies) continues.
     On a story arc the subject is the protagonist — era, person, the original goal — and the
     viewer's stake is the loop the cover left open. The form is one of four:

     | Form | Strategy | Example |
     |---|---|---|
     | problem·harm | empathy | "이 동네 첫 카페 개업이야! … 순식간에 카페거리가 돼버렸네." |
     | loss·risk | fear | "첫날 조회수가 두 자리에서 멈춘 적 있죠. 그게 그 신호예요." |
     | unresolved tension | curiosity | "반응이 없을 것 같은 영상이면, 너희들 결정은 뭐야?" |
     | resolve·criteria | declaration — the strategy continues the cover's | "주변 상가 오픈 정보를 미리 알 수 있게 서비스를 만들어야겠어." |

     The angle matches the cover title — a problem a stranger already feels, not a method or a
     tool (platform-playbook §1 ②). In an episode opened with showing the ending (`spoiler`),
     hooking keeps the finished thing on screen and hooks the why with one of the other three —
     showing the ending a second time isn't hooking.
  3. **Don't unpack** — the answer, the method, and the finished thing belong to the result and
     the body. If hooking says the answer, what follows is a rerun. On a story arc the rule runs
     through the build and the turn as well — the answer belongs to the payoff, and a body or
     turn beat that names it closes the loop early (scene mode reads it as hooking that unpacked
     the answer). TikTok measurements put
     watch time +16% when suspense sits at the front of the story, and curiosity only arises in
     the state where "something you want to know is visible but not yet filled in".
  4. **Be short** — inside the length above. A long hooking opens a gap between the cover's
     promise and the result.
- **What not to fill it with** — greetings, self-introduction, channel introduction, a
  "today we'll look at ~" trailer, tool definitions, background explanation. "Don't tell them
  what they'll see — show it." **The speaker-report-opening P0 applies to both the cover's
  segment ① and hooking's first segment.** That said, a character speaking their own situation
  in first person ("내가 밤을 새서 영상을 만들었어") is a problem scene, not a report — it passes
  when the reason to stay is in that sentence.
- **The screen talks too** — either the problem scene (the before) or holding the cover still.
  A build can leave the cover's result screen up while the sound hooks the why; an informational
  piece draws the problem situation. `title` is usually left empty — if you write one, it's a
  spoken hook (§title is a spoken hook).
- **Renderer inference** — a `sequence` opening with `문제` or `후킹` reads as hooking. Write
  `beat` anyway — inference is for old files. On long-form `storyboard.html` warns when there's
  no hooking shot or the shot after the cover isn't hooking. On a short those beats are
  violations.

### points — one message per screen

```js
{
  type: "points",
  scene: 1,
  sceneSlug: "reporting desk / day",
  shot: { feel: "relief — I can still make it in time", size: "ls", angle: "eye", info: "that the deadline moved to the day of arrival" },
  title: "7월 24일부터 **이렇게** 바뀝니다",   // fixed at 60px, top (rg1) — "" when absent (see §on-screen text only when needed below)
  bullets: [                                  // one at a time on screen (caption swap). 0 is normal too
    { t: "도착 즉시 신고", d: "종전 24시간 → 도착 당일로" },
    { t: "온라인 제출 허용", d: "앱·포털 어디서든" }
  ],
  footnote: "출처: 공안부 시행령 NN/2026",      // shown throughout alongside the title (rg1) — "" when absent
  narration: [ … ],                            // segment count varies per shot (1–3)
  visual: { picture: "still", overlay: "html", bg: "images/scene-2.png", bgPrompt: "…" }
}
```

- **The photo is the star** (produce absolute rule 14) — it isn't a slide where bullets stack
  into a list; the top block carries the title, the source, and **one active caption**. One line
  per caption is best — `t` ≤ 12 chars, `d` ≤ 22 chars recommended. The narration and subtitles
  say the detail.
- **Bullet count ≠ sentence count, but reveals go one bullet at a time** — reading several
  bullets as one sentence is normal, but their appearance on screen is split one at a time by
  produce's sub-reveals (the `A|B` notation).

#### On-screen text only when needed (user directive, 2026-08-14)

**Don't write text to fill a slot.** The habit of forcing 3–4 captions into every scene is
retired — `title`, `footnote`, and `bullets` can all be empty, and empty is closer to the
default.

There's one criterion. **The screen doesn't rewrite what the sound already said.** When the
narration explains something in a sentence and a caption lays the same meaning on top as a
summary, the viewer takes the same words in twice, through eyes and ears. In short-form that
isn't information, it's noise, and it covers the picture.

When you **do** use on-screen text:

| Place | Why it's needed |
|---|---|
| Cover | The place to catch someone scrolling soundlessly in the first 3 seconds. The hook, the topic word, and the figure have to be there as text |
| Numbers, proper nouns, deadlines | Values that slip past the ear. Things to confirm with the eye, like `4,700만₫` or `7월 24일` |
| Order and step numbers | Marking which step you're on in an episode that runs through several |
| Information the sound doesn't carry | Sources, qualifiers, term definitions the narration doesn't say (`적대적 평가 = 스스로 채점`) |
| Text meant to be copied | Commands, prompts, addresses. Anything where one wrong character breaks it |

When **not** to — a caption that shortens a narration sentence and moves it to the screen. The
subtitles already do that.

- A scene with one segment has **zero** captions (caption k ← segment k+1, so it works out that
  way arithmetically too). Keeping a short scene that's just picture passing by is good for the
  rhythm — there's no reason for every scene to weigh the same.
- Emptying `title` means only the picture shows during segment ①. In that case **caption count =
  segment count − 1**.
- **The picture has to carry whatever the on-screen text gave up** — a metaphorical still life
  as the background leaves the screen empty.
- reveal mapping: rg1=title+footnote, rg2..=captions in order — transitions render as swaps.
  State count = 1 (background) + 1 (title and source) + caption count.

### quote — speech / quotation

```js
{
  type: "quote",
  speaker: "민지",
  role: "3년차 주재원 · AI",       // marking AI renders with emphasis — never hide an AI byline
  text: "저도 작년에 놓쳐서 벌금 냈어요.",
  narration: [ {tts,sub}, {tts,sub} ],   // 2 segments — both use the same overlay
  visual: {
    picture: "ai-video", overlay: "html",  // no clip means picture:"still" — a still quotation card
    bg: null,
    clip: {                               // the speech clip plan (produce generates it) — without it, a still quotation card
      avatar: "…path to the avatar image, or null",
      prompt: "…the stored final veo_reference prompt (§clip prompt — assembled with --clip --with-space; background unified to THEME dark)"
      // no negative field here — the reference lane rejects negativePrompt (400, measured
      // 2026-08-15); exclusions are written into the prompt as positive description
    }
  }
}
```

- On the alpha capture only the top signature (name + role) renders — the quotation itself is
  said by the narration and subtitles.
- No synthesizing a real person's face or voice. Characters only in styles that can't be
  mistaken for live action.

### Claim traceability (`claim`) — which research entry a sentence rests on

```js
narration: [
  { tts: "삼십 개만 남았어요", sub: "30개만 남았어요", claim: 2 },
  { tts: "여든두 조각으로 갈라졌고요", sub: "82조각으로 갈라졌고", claim: [3, 7] },
  { tts: "이게 왜 놀라운 거냐면요", sub: "이게 왜 놀라운 거냐면" }   // no figure, no claim
]
```

**A sentence carrying a figure, a date, a name or a quantity names the research entry it came
from** — the `#` column of research.md's Verified table. One number, or an array when the
sentence leans on more than one. A sentence that asserts nothing checkable carries none, and
that is the normal case: connective lines, questions, and reactions have nothing to cite.

Why the number and not the prose: without it, "does this sentence match the research" is a
job somebody redoes from scratch every review, matching sentences to rows by reading. With
it, the claim either exists in the table or it doesn't, and the reviewer's factual pass starts
from the sentences that cite nothing rather than from all of them.

`check-research.js` reads both files and reports three things — a `claim` number no Verified
row has (the row was renumbered, or the number was invented), how many verified claims no
sentence ever used (research that never reached the video), and how many figure-carrying
sentences cite nothing at all.

**Channels whose profile skips research have no `claim` anywhere**, and nothing checks it —
the field appears only where there is a table to point at.

### Scene transition (`transition`) — the boundary before this shot

```js
{
  type: "points",
  transition: "dissolve",     // omit · cut | dissolve | dip | dip:white | iris | blur | zoom
                              //        | push:<l2r|r2l|u2d|d2u> | whip:<l2r|r2l|u2d|d2u>
  …
}
```

**Omit is a cut. `"cut"` is a smash.** They are not the same. The builder J-cuts every incoming
spoken card whose `enter=` is empty — the next line starts on the previous last frame
(`SCENE_JCUT`, 0.32 s), then the picture cuts. That is the professional split edit (Murch):
you hear the next sentence before you see the next shot, so the picture never changes in
silence. Measured on a reference short that holds attention for 85 s
(docs/research/2026-08-29-one-world-word-cue): six hard cuts, no dissolve, and no silence
longer than 0.3 s. Write `"cut"` only when picture and sound have to change together. Do not
write `"jcut"` — it is not a field; the builder applies it.

Pick from this table. One home; directing-grammar §6 rule 16 points here.

| What is happening | Write | What the audience sees |
|---|---|---|
| same place and time — two shots of one scene, size or angle changed | omit | a cut. The builder J-cuts spoken cards |
| smash — a hit, a reveal that has to land on the new frame | `"cut"` | picture and sound change together, silent pre-roll |
| time passed, or the place changed, and the two pictures belong to one world | `"dissolve"` | the new shot melts up **through** the old one for 0.45 s |
| a chapter / act break, a jump the story treats as a distance | `"dip"` / `"dip:white"` | through black (or white) — a beat of nothing. White is a flash |
| a list, a comparison, "meanwhile" — siblings, not a before and after | `"push:<l2r\|r2l\|u2d\|d2u>"` | the old shot slides off and uncovers the new one (0.32 s) |
| a find — the shot names the thing the episode has been circling | `"iris"` | a circle opens out of the old shot onto the new one (0.45 s) |
| a memory, a hypothetical, someone losing the thread | `"blur"` | the old shot smears sideways and melts (0.45 s) |
| the camera goes *in* — into the box, the building, the diagram | `"zoom"` | the old shot grows past the camera and thins out (0.32 s) |
| a hard swerve — the answer is somewhere else, and the turn is the point | `"whip:<l2r\|r2l\|u2d\|d2u>"` | the old shot smears along the travel and is gone (0.24 s) |

`dissolve` and `blur` are the same length and the same material, and they say different
things: a dissolve means the two pictures belong to one world, a blur means someone's
attention left. `push` and `whip` travel the same way; the smear is what makes the second
one a swerve instead of a list. Pick by what the audience should feel, not by what looks
different from the last one.

**Most boundaries omit the field.** A cut says the story continued. A visible join says
something moved that the picture alone cannot show. Spend it where that is true and nowhere
else. The 85 s reference feels soft because every shot is **moving** and every shot is in the
**same place**, not because the edit blurred them. When a cut feels abrupt, look at the two
pictures first: a still landing on a still, or a hall landing on a kitchen. A dissolve on
top of that is slow *and* abrupt.

**A short gets one visible join, or none.** Two is already a lot; a dissolve at every
boundary is the slideshow look. Long-form can carry one per chapter boundary. Softening
every join takes away the cut rhythm this pipeline uses to hold attention.

**Seven kinds, still one budget.** `check-scenes.js` caps a short at two visible joins
whatever the vocabulary holds, and it counts an iris the same as a dissolve. A wider
vocabulary is there so the one join you spend can be the right one — not so you can spend
more of them. An episode that uses four different kinds once each has spent four.

Where a visible join earns its place: a time jump inside one room (the cut would read as
continuous); a move the story treats as a distance; the turn on a story arc; into the cta
when the body ended on tension.

Where it does not: between two shots of the same `scene`; to paper over a jarring image
change; on the hook or the shot right after it. Consecutive stills in one scene change size
by two steps or the angle (directing-grammar §6 rule 16 · §7's 30° rule) — that is the
picture match, not a dissolve.

**Don't derive it from `scene` or `sceneSlug`.** The library uses them inconsistently —
measured across every episode with the field, several give every single shot its own
`scene` number, so "new scene → dissolve" would put one at every cut in half the channel.
The transition is written where it is wanted, one at a time.

**What produce does with it.** Every join is drawn inside one card's own encode — no
cross-card xfade, so the concat stays stream-copy exact (`../produce/references/build-reel.sh`
§7.4). Mapping, written on the incoming card unless noted:

| `transition` | `cards.tsv` |
|---|---|
| omitted | nothing — the builder J-cuts (`enter=jcut` is the default, not something to type) |
| `"cut"` | `enter=cut` — smash, old silent pre-roll |
| `"dissolve"` | `enter=dissolve` |
| `"push:<dir>"` | `enter=push:<dir>` |
| `"iris"` | `enter=iris` |
| `"blur"` | `enter=blur` |
| `"zoom"` | `enter=zoom` |
| `"whip:<dir>"` | `enter=whip:<dir>` |
| `"dip"` / `"dip:white"` | `exit=black` (or `white`) on the card before **and** `enter=black` (or `white`) on this one |

Every carry and dip keeps the card's frame count (measured A/B: identical `subs.srt`,
same duration both ways; the iris and blur joins are drawn with an xfade **inside** the
incoming card's encode and come out frame-identical to the overlay carries — 90/90 frames
at 3.000 s on the 2-card fixture). A J-cut drops that card's silent pre-roll (`PRE`, 0.40 s) because
the next line occupies it. `POST` is 0.45 s — last-reveal hang plus a blink. The BGM bed
runs across the whole feature; fading it at a scene change would punch a hole in the music.

### Camera — the four slots (`visual.camera`)

```js
camera: {
  movement: "dolly in",                                   // what the camera does — `static` is a choice, not an empty slot
  speed: "very slow",                                     // how fast it does it
  framing: "chest-up, eyes on the upper third",           // what is held while it moves
  end: "subject centred, hands entering the lower third"  // where it stops
}
```

**Required on every shot that becomes a generated video** — `broll`, a motion-background scene
(`visual.video`), and a `quote` speech clip (`visual.clip`). Optional on a still, where
`movement` picks the builder's Ken Burns move — the still lane fakes the camera by driving a
crop window (eased zoom towards the subject, pan with an optional zoom drift, a punch on the
cover, handheld drift), and the same vocabulary applies: `dolly in`/`zoom in` reads as a slow
push towards the subject, `dolly out` as a pull-out, `handheld` as drift, `truck` as a pan
(the feel each serves: directing-grammar §5 Still column; the option names: produce SKILL §6).
`speed` reads on a still too — it sets how hard the window moves, on the beat ladder in
directing-grammar §4 (still lane): `very slow` for explain, `slow` for the payoff, `fast` /
`very fast` for action and CTA cards, which also accelerate to the cut point. produce §6
converts the word into the card's `span=`/`ease=` knobs. A still with no camera keeps the
alternating default drift — most should. The reason it is
written here and not at generation time: **the four values are settled before the first call
that costs money.** The clip prompt is assembled out of these slots here and stored (§clip
prompt); produce sends it verbatim, it doesn't invent one.

`end` is the slot that gets dropped. Leave it empty and nothing tells the model where to stop, so
the last second drifts. It is also the slot our own vendor reading asks for — Seedance's camera
sub-formula is `opening frame composition + move + closing frame composition`, and `end` is that
closing composition.

**The slots become the camera span of the stored clip prompt** (§clip prompt) — assembled at
the storyboard by `assemble-bg-prompt.js --clip` in this order: `framing`, then
`speed movement`, then `ending on end`:

> `chest-up on the subject, very slow dolly in, ending on subject centred at mid-frame`

produce keeps the same recipe as its fallback for an older scenes.js with no stored prompt.

The rules that applied to the old one-string camera line now apply per slot:

- **Vendor vocabulary only** — `dolly in` not `push in`, `arc shot` not `orbit`. `push` appears 0
  times in the canonical Veo text, and without `ARK_API_KEY` a motion background falls back to
  Veo (§motion background).
- **`movement` holds one move.** Two is the ceiling on the default 1.5 Pro, and the
  one-move-per-cut rule is Seedance 2.0's alone — write a second move only with a reason. On a
  deliberate long take (10s+) it is one, no exception.
- **No seconds in any slot** — length is `duration` (§cut length).
- **No exclusions in any slot** — that is Veo's `negativePrompt` argument, and for Seedance it
  means re-describing the scene so the thing doesn't appear (§motion background).
- **The move is chosen from `shot.feel`, and it supports the feel rather than carrying it.**
  Pick it from the directing-grammar §4–§5 rows (realisation → `dolly in`, pressure → slow
  `zoom in`, travel → `truck`, presence → `handheld`, closing → `pedestal up` …). The measured
  part is narrow — a move on its own didn't change what viewers felt (p=.84, camera research
  §07); what it raised was immersion, on cuts whose character wasn't set yet. So size, angle,
  the picture and the sound carry the feel, the move makes the audience move with it, and for
  most body shots `movement: "static"` is the honest answer. The finding is a move that
  **contradicts** the declared feel, or a feel left to ride on the move alone.

`shot.size` and `shot.angle` are different axes and stay where they are — `size` is where the
frame cuts the person, `angle` is where the camera sits against their eyes, `camera` is what
the camera does and where it stops. `framing` restates size and angle in the engine's words so
the clip is drawn at the distance the storyboard decided. **`shot.space` is a fourth axis** —
what is where in the frame, which way it faces — and the still already drew it. A motion
prompt that re-describes sides, facing, or lighting makes the engine redesign the scene; the
clip inherits space from the PNG (§frame space).

### Frame space (`shot.space`)

```js
space: {
  frame:  "camera",
  layout: "person on the left third, kitchen door on the right",
  facing: "person faces camera-right, three-quarter view",
  line:   "A left, B right",
  light:  "key from camera-left"
}
```

**Required on every shot that becomes a generated still** — cover and points backgrounds, and
in illustration mode the representative illustration (`visual.bg`, row 1); the per-line
`narration[].imgPrompt`s draw their own pictures and are not covered by the shot's block. A
quote speech clip has no still, so its clip prompt carries the shot's `From the camera: …`
sentence (`assemble-bg-prompt.js --space-only`). Optional on a filmed shot, required there
when two people (or a person and what they look at) share the scene — that is the 180°
sentence the shooting script prints. Slide scenes have no still, so they skip this block.

The words, the banned forms, and the assembly order live in `directing-grammar.md` §3.5.
`assemble-bg-prompt.js` is the machine form: storyboard §5 runs it with
`--scene`·`--mood`·`--exclude` and stores the full stdout as `bgPrompt`; produce reruns it only
when a `shot` field changed on a still it regenerates (a plain regeneration resends the stored
string). produce assembles a video prompt from the camera slots and adds nothing from `space` —
the PNG already holds the floor plan.

| Slot | Required when | What it names |
|---|---|---|
| `frame` | space is present | `"camera"` only — left means left of the picture |
| `layout` | generated still, unless `insert`/`ecu` fills the frame with one object | sides from the camera (`left third`, `right of frame`, `centred`) |
| `facing` | a person is on screen (an oriented object — a car, a desk — may take one too) | the visible result (`faces camera-right`, `seen from behind`, `the car faces left of frame`). Never `left view of` |
| `line` | two people, or a person and what they look at, share the `scene` number | the 180° sentence, kept true on every shot of that scene |
| `light` | optional | key direction in the same camera frame (`key from camera-left`) |

produce runs fine on an old `scenes.js` without `space`. The check strip warns; camera mode
scores the gap; image mode compares the PNG to `layout` and `facing` when they are written.

Banned in `layout` · `facing` · `line` · `light` and in `bgPrompt` — the assembler exits 1 on
them anywhere in the assembled prompt, the `--scene`·`--mood`·`--exclude` text included:

- camera-inference — `left view of`, `right view of`, `front view of`, `back view of`
- allocentric — `from the car's right door`, `from X's left`, `to her right`, `on its left`
- metric distance — `1.5 m`, `3 meters`, `three meters away` (distance is `shot.size`)

### Character reference (`visual.character`)

```js
character: "claude"                  // one character on screen
character: ["mouse", "claude"]       // two — array order is reference weight, so the shot's subject goes first
character: null                      // nobody from the channel cast is on screen

character: [                         // an entry may carry its jurisdiction instead of being a bare id
  { id: "mouse",  scope: "controls the helmet and body only" },
  { id: "claude", scope: "appears only in the last second, and its face never transfers to anyone else" }
]
```

**`scope` is the reference's jurisdiction** — one clause saying what that reference governs, and
where it may appear. It exists because a reference leaks: hand over a character sheet and the
studio backdrop can come along with it, or the one face in the reference set gets lent to a
second figure in the frame (`video-model-selection.md` §positive locks). produce copies the
clause into the call's reference list, so it is written here rather than invented at generation
time. A bare id is still valid and stays the normal case — write `scope` when the shot hands
over more than one reference, when a one-shot extra shares the frame with a referenced
character, or when a location reference should control only the sky, the water, the walls.
**The check strip warns when a generated clip carries two or more references and none of them
is scoped** — one reference alone has nothing to leak into.

The id is the channel's shared character. `resolve-asset.py <channel dir> character <id>` turns it
into `assets/characters/<id>/`, and the panels inside that directory are the reference set
(`video-model-selection.md` §6). The storyboard says **who is on screen**; which panels go into
the call is produce's decision, because that depends on the framing.

Writing it buys three things — produce attaches the reference images without re-reading the scene
text, a veo ban attached to a character (a mouthless face: the model invents a mouth, measured 5
times) resolves per cut instead of per episode, and storyboard.html can show the cast with the
shots each one appears in, and each shot's `scope` under them.

### Clip audio (`visual.audio`)

```js
audio: "quiet studio room tone with a faint fabric rustle, no music, no speech"
```

One sentence saying what that clip sounds like. **Write it on every shot that becomes a generated
video** — the same three the camera slots cover (`broll`, a motion-background scene, a `quote`
speech clip). produce appends it to the call as `Audio: <this sentence>.`

Leave it out and the engine decides for itself, which on Veo means invented speech and invented
music arriving under a line the TTS is already speaking. Naming the room tone and saying what
isn't there is what keeps that stretch clear for the voice — and unlike picture prompts, where a
negative noun in the body draws the thing (measured 4 out of 4), the exclusion belongs **in this
sentence**: `no music, no speech` is the established wording (produce §b-roll).

What to write depends on whether the clip's own sound survives the build:

| The shot | What its audio does | What to write |
|---|---|---|
| `broll` | kept — `narration` is empty and the clip's own sound plays (absolute rule 9) | what the viewer should hear: room tone, one texture, no speech |
| motion background (`visual.video`) | discarded — TTS, subtitles and BGM carry on over it | write it anyway; the model composes a calmer clip when it isn't left to invent a soundtrack |
| `quote` speech clip | the character speaking is the point | what is heard besides the voice — the room, and nothing else |

### Clip prompt — one scene, one call, the prompt stored here

```js
engine: "seedance",                  // the planned route — written only when it departs the type default
                                     // (broll → veo, motion background → seedance, quote → veo_reference)
prompt: "chest-up on the subject, very slow dolly in, ending on subject centred at mid-frame. steam curling off the cup. Audio: quiet room tone, no music, no speech.",
negative: "text, subtitles, black bars"   // veo text/img lanes only — nouns for the negativePrompt argument, never the body
                                     // (the reference lane rejects the argument — 400, measured; there exclusions become positive description)
```

**Every shot that becomes a generated video is exactly one API call, and the storyboard stores
the call's final prompt** (user directive, 2026-08-25). The prompt's home follows the shot's
shape — `visual.prompt` on `broll`, `visual.video.prompt` on a motion background,
`visual.clip.prompt` on a `quote` speech clip — with the `negative` noun list beside it. The
reason it is written here and not at generation time is the same as `bgPrompt`'s: **the
sentence the model gets is the sentence the review read.** produce sends it verbatim, adds the
API arguments (`negativePrompt`, references, `durationSeconds`), and re-runs the assembler only
when a slot changed.

**Assemble it, don't prose it** — `assemble-bg-prompt.js --clip` builds the prompt from parts
that are each already reviewed, in this order:

1. *(quote only)* the `From the camera: …` space sentence (`--with-space`) and the subject
   description (`--scene`) — a quote clip has no still behind it, so its prompt carries the
   floor plan. A motion background and a b-roll **never re-describe the layout, facing or
   lighting**: the source PNG already drew them, and re-describing makes the engine redesign
   the scene. Who the subject *is* splits by route (video-model-selection §prompt grammar):
   a veo route calls the person by a **general noun** ("the subject", "the woman" — vendor
   text), a seedance route may reuse the bgPrompt's **identity words** (who and what, never
   where) with a consistency lock in `--locks` ("the subject stays exactly consistent with
   the input frame; add no unrelated elements" — the vendor's own i2v pattern).
2. the camera span from the four `visual.camera` slots — `framing`, then `speed movement`,
   then `ending on end` (§camera).
3. `--motion` — the subject motion: what moves in the picture while the camera does its one
   thing. Veo's own i2v vocabulary is three kinds, alone or combined — camera motion, subject
   animation, environmental animation ("fog rolls in slowly") — and the person in the source
   PNG is called by a **general noun** ("the subject", "the woman"), never re-described. An
   in-clip state change carries its own length **in words** ("the visor snaps shut
   in under half a second"); left open, the engine spreads the change across the whole clip.
4. `--locks` — the positive-locks tail on a multi-reference call: what holds in every frame,
   said positively, each reference given its scope (video-model-selection §positive locks).
5. the `visual.audio` sentence, closing the prompt as `Audio: …` (§clip audio).

The assembler exits 1 on what the route can't take, so a stored prompt is a checked prompt:
banned space language (§frame space), negative directives in the body (two exemptions — the
`Audio:` sentence, where "no music, no speech" is a state description, and on a seedance
route the vendor-templated **artifact classes**: subtitles, on-frame text, logos, watermarks,
BGM), timecodes and digit seconds on a seedance route, digit seconds on a veo route
(`--engine seedance-2.5` opens integer-second forms — that model officially takes them).

**Time inside the clip differs by route.** A Seedance-routed prompt names no clock — the 2.0
vendor docs self-report unstable precision timing, so beats are ordered by description
("then", "as the door closes") and cut in the edit. A Veo-routed prompt may pin beats to
`[mm:ss]` spans (`[00:00-00:02] she looks up. [00:02-00:06] the door closes.`) — a blog-grade
workflow the reference docs never took up (checked 2026-08-25), so it's a tool, not a
contract. Where it pays: the used length is shorter than the 8s the lane generates, and the
span pins the beat you will keep inside the head you will keep.

**One scene stays inside one clip — and one clip holds one moment.** Veo's Best practices
names the failure directly: chaining several distinct events into one short prompt comes back
*"muddled or incomplete"*. The scene was cut to one beat at design time; the call keeps that
cut. `duration` fits the routed engine's server-validated
range — veo 4/6/8s (1080p/4K and the reference lane 8s only), the default seedance 1.5 pro
4–12s (`server/src/seedance-client.ts` is the binding table). A scene that needs more is a
storyboard defect: trim the narration, split the scene, or route to a model that takes it —
never plan a looping clip. A Seedance scene with **internal cuts** may write them as
`Shot 1: … Shot 2: …` inside the one call — the form is vendor-exemplified on 1.5 pro
(examples run 2–5 cuts), the later cuts inherit the floor plan the first cut establishes, so
open on the widest frame, and the prompt carries the cut line: *"Sequence of cuts, no
timecodes — cuts only at the specified points, the camera does not cut on its own."* Time
each cut by a **dialogue or action beat**, not a clock ("as she opens her palm, cut to a
close-up of the hand"), give each cut its own shot size and distinct content, and don't
constrain per-segment durations — the vendor says to let the model pace the segments from the
plot, and packing too much into the time comes back as extra cuts or dropped plot. The camera
slots describe the opening cut; each further cut names its own framing in its `Shot n:`
sentence, with the reason the scene needs a sequence written on the shot.

### Music cues (`window.MUSIC` · `sound`)

One bed under the whole episode is the default and a perfectly good design. This is for when the
episode changes what it is doing and the music should say so.

```js
window.MUSIC = {
  base:  { prompt: "warm low strings under a calm explanation, leaves space for a spoken voiceover, no melody in the vocal frequency range", bpm: 88 },
  tense: { prompt: "same strings with a low pulsing bass, tighter, still no melody in the vocal range", bpm: 120 },
  close: { asset: "reflect" }            // a channel asset instead of a generated cue
};
```

Each key is a cue name. `prompt` goes to `music_generate`; `bpm`, `scale` and `seed` are optional
and passed through (`seed` is the only way to get the same cue twice). `asset` skips generation and
uses a channel bed instead — the id `resolve-asset.py <channel dir> bgm <id>` resolves, which is
`assets/audio/bgm/<id>.wav`. produce works out how long each cue has to run from the shots that use
it; don't write a length.

**`base` is optional.** With only `{ tense: … }` the episode still opens on the channel's shared
bed and switches at the first shot that asks for `tense`.

Per shot:

```js
sound: {
  cue:  "tense",    // the bed changes to this cue here and stays until another shot changes it
  drop: false,      // true = the bed goes silent under this shot (0.30s ramp, not a cut)
  sfx:  "whoosh"    // a shared sfx asset id, heard at the shot's first frame
}
```

- **`cue` names a key in `window.MUSIC`.** A name that isn't there is an error, not a new cue.
- **Omitting `sound` carries the previous bed.** Only write a cue where it changes.
- **Don't put `cue` and `drop` on the same shot** — the incoming cue would fade in muted, so the
  change lands on the following shot, where nobody planned it.
- **A drop is louder than a hit.** Spend it on the one line the episode is about. Two drops in a
  45-second short and neither reads.
- **Change the cue where the episode turns**, not on a timer — out of the hook into the body, into
  the close. Usually once in a short, often not at all.
- **On a story arc the drop goes on the turn.** The music goes out at the peak, and the turn is
  the peak; the result is where it comes back (scenario-craft §7). storyboard.html warns when a
  story arc's drop sits anywhere else.

Where the numbers under all this come from, and which of them are evidence and which are our own
practice: [bgm-scoring.md](../../produce/references/bgm-scoring.md). The short version — the bed
is set 10 LU under the measured narration and the build stops below 4 LU, and those two are the
only figures here with published listening tests behind them. Where a cue changes is craft.

### Cut length (`duration`) — decided by what the cut is for

A shot carrying narration takes its length from the speech — narration characters / 4.5, capped at
13s. That math is fixed; TTS, reveals and subtitles are synced to it.

**A generated video clip is a different question.** Its length is a design choice, and the model
fills whatever time it is handed: ask 8 seconds for a 4-second idea and it invents the other 4 —
the subject drifts, the middle goes dead. Both vendors now name this failure themselves
(2026-08-25 delta check): Veo — chaining several events into one short prompt comes back
*"muddled or incomplete"*; Seedance 2.5 — too little plot for the time and *"the model may
improvise more freely"*, too much and it adds cuts or drops plot. Pick the length from what
the cut is for:

| What the cut is for | Length |
|---|---|
| Object close-up, insert | 3–4s |
| A person moving, an action | 5–7s |
| A face carrying emotion, a line of speech | 7–10s |
| A shot establishing the space | 5–8s |
| A deliberate long take | 10s+ — and `camera.movement` stays one move |

The purpose row is the first pick; `shot.feel` refines it (directing-grammar §5 carries a length
per feel), and across shots **a wide holds at least 1.5× a close** — a wide frame takes longer to
read, a close-up carries one thing and can be short (directing-grammar §6).

**Ask for the length you will use.** Seedance makes only the seconds you request and bills them,
so `durationSeconds` is the used length. Veo is the exception — its reference lane is pinned to 8s,
so there the extra seconds get made and produce trims them (§broll).

The existing caps stand: a motion background stays inside one clip's length — the routed
engine's **server-validated** range, veo 8s fixed, the default seedance 1.5 pro **4–12s**
(the old 15s figure was Seedance 2.0's; `server/src/seedance-client.ts` holds the per-model
table, and the check strip warns past the route's cap. The real risk is a clip shorter than
its scene, which shows the loop's seam) — and a b-roll's used length is 4s by default. The
1.5 pro floor cuts the other way too: a scene under 4s still requests 4 and the build cuts
the tail at the scene boundary.

### Motion background (`visual.video`) — a scene background from image to video

```js
{
  type: "points",
  bullets: [ … ], footnote: "",
  duration: 8,                        // one playthrough of the clip covers the scene — veo 8s, seedance 1.5 pro 4–12s
  narration: [ {tts, sub}, … ],       // kept — unlike b-roll, only the background moves while you talk
  visual: {
    picture: "ai-video", overlay: "html",
    bg: "images/scene-3.png",         // the veo parameter — gpt_image high · the §broll source clause (photorealistic people) applies as-is
    bgPrompt: "…",
    video: {
      prompt: "chest-up, very slow dolly in, ending on subject centred. hair swaying gently. Audio: quiet room tone, no music, no speech.",
                                           // the stored final clip prompt (§clip prompt) — camera span from visual.camera + subject motion + the audio sentence
      negative: "",                        // used only when the call lands on veo (fallback) — nouns for negativePrompt
      clip: ".work/motion/motion-i2.mp4"   // produce output record — motion-i<scene index>.mp4
    },
    camera: { movement: "dolly in", speed: "very slow", framing: "chest-up", end: "subject centred" }
  }
}
```

This takes the image the storyboard already showed, **makes a video from it as a parameter, and
lays it under the scene background**. The caption and subtitle overlays go on top via the alpha
capture (produce §4, §6).

**The storyboard picks the planned route, and produce validates it** — the route is
deterministic from facts the storyboard already writes (who is in the source, whether the slot
uses its sound, the duration), so this slot's default is a silent Seedance (`visual.engine`
overrides — the decision table's source of truth is produce
`references/video-model-selection.md`, order face → sound → grid). Write into the plan the
facts the validation needs — **whether there's a face in the source and, if so, whether it's
an adult**. Faces that read as minors are blocked on the Veo image lane, and Seedance 2.x
refuses photorealistic faces outright, so filtering at the planning stage avoids redrawing
the picture.

**`prompt` is the stored final clip prompt, written in the route's grammar** (§clip prompt) —
for this slot that means Seedance grammar. The camera part is not written by hand: the
assembler builds it from the four `visual.camera` slots (§camera), which is exactly Seedance's
`opening frame composition + move + closing frame composition`. What `--motion` adds on top is
the subject motion — what moves in the picture while the camera does its one thing — and the
`visual.audio` sentence closes it. The reason an approaching move is written as `dolly in` is
that **this prompt may also go to Veo** — without `ARK_API_KEY` the motion background falls
back to `veo_img2video`, and the word `push` appears 0 times in the canonical Veo text.
Seedance's own vendor vocabulary is Chinese (`推`), so neither is confirmed in English, and
`dolly in` satisfies both paths; a Seedance-shaped prompt survives the fallback as written
(no timecodes by rule, and the stored `negative` list moves into the `negativePrompt`
argument). **The span isn't a format the vendor requires** — in the Seedance top-level formula
the camera slot itself is `非必须`, and the "move amplitude" once written as a required slot
failed re-verification against the original (2026-08-15 camera research). The reason for
writing it as a stretch is our own: **it's a motion-background cut whose composition has to be
reproduced.** The storyboard writes **one move**; a second goes in only on the default model
1.5 Pro (the vendor teaches combinations there — the one-move-per-cut recommendation is
Seedance 2.0's) and only with the reason written on the shot (§camera · directing-grammar §4).
Two things the assembler blocks — **seconds in the body** (length is set by the scene's
`duration`; an in-clip state change is written in words) and **exclusions in the body**
(Seedance has no exclusion-only argument — re-describe the scene so it doesn't appear; the
`negative` field is read only on a Veo call). Write the prompt in English — the body takes
only Chinese or English.

**A change of state inside the clip carries its own duration** — armour snapping on, a light
coming up, a door closing. Write it as "in under half a second" or "over two seconds"; left
open, the engine spreads the change across the whole clip and it stops reading as an event. The
ban just above is on the clip's *length* — that stays `duration`; how long a change inside the
clip takes is the one number that does belong in the prompt body. And
**if a prop has to be readable, spell the words out** — the exact three lines on the notepad,
the exact label on the box — and hold the shot long enough to read them (about 2 s for a short
line). Anything vaguer and the model fills the surface with squiggles that pass at speed and
read as slop the moment anyone pauses. Screen text for the viewer is a code-rendered overlay
either way (absolute rule 10); this is about words that live inside the picture.

- **When to use it**: when the movement itself is the content. A place to show only the picture
  with nothing said is `broll` (spliced between scenes); **when the background has to move while
  you talk, that's a motion background**. Still is the default only after the channel's
  true-motion floor and still-run limits are met — video buys cost and seam risk.
- **Start from the shot's `feel`, not from "this scene is heavy, so push the camera in"** — read
  the directing-grammar §5 row for that feel and take its move; the picture (`bgPrompt`), the
  size and the angle carry the tone, the move supports it (a move on its own didn't change
  what viewers felt — p=.84, camera research §07 — what it raised was immersion, on cuts whose
  character wasn't set yet). So spend moves **where the character isn't set yet — openings and
  transitions** — and when the tone is wrong, fix `bgPrompt`, size or angle before the move.
- **Mixing movement into the middle scenes is favorable in itself** — a run of still cuts is a
  scroll-past signal (skip-rate measurement, 2026-08-15). The channel policy decides which
  motion kinds satisfy its floor. A Ken Burns move, caption change, or still swap can improve a
  still cut but never counts as true motion. Code-rendered animation counts only when
  `motion-slide` appears in `allowedKinds`. A generated motion background is bought only when
  the approved plan calls for one and **the movement itself is the content**.
- **A character-level veo ban is resolved per cut** — even where the profile bans veo for a
  particular character (e.g. a mouthless face — the model invents a mouth, measured 5 times on
  Ttalkkak Lab), that ban applies only to **cuts where that character is on screen**. Cuts without
  the banned character (another character alone, silhouettes, prop close-ups) are still motion-
  background candidates. White-background line art is the worst case for a model inventing
  content in the empty space though (measured), so even a candidate isn't safe there — hand that
  fact to the plan gate along with the rest.
- **On a baseline episode right after a format overhaul, change one variable only** — piling a
  veo promotion onto the first episode that applies the hook contract and structure revision
  makes the next set of metrics unable to separate what worked (the same logic as cost-tiers
  §promotion freeze — that one is the unattended loop, this one is human planning). Experiment
  one slot at a time once the baseline is set.
- **The combined generated-video cap — this section is the source of truth**: the selected
  format supplies the default, and `generated_video_max` in the channel profile may override
  it. Count b-roll slots + motion-background scenes together; quote speech clips do not count.
  Going over the effective cap gets a red badge from the `storyboard.html` check strip.
- **points only** — the cover keeps its code-rendered still (produce absolute rule 10) and takes
  video as an opening b-roll. For quote, `clip` plays that role.
  **The one exception is an explicit per-episode user directive** (2026-08-15, the Ttalkkak Lab
  Seedance episode — "impact at the start"). Even then the body of absolute rule 10 stands —
  **the text is still a code-rendered overlay** and generated video isn't trusted with text.
  Two contracts come attached when using a video cover: **anchor the text at the top** (there's
  no guarantee the center stays empty when the subject moves — the template does this
  automatically when it sees a cover with `visual.video`), and if you leave the narration
  empty, that stretch **uses the clip's own audio** (the same behavior as absolute rule 9, so
  no subtitles either). No scrim backs the text up any more — gradient scrims are off (owner
  2026-08-25) — so check the clip's top stays dark or plain enough for white type before
  committing to a video cover.
- **Narration and subtitles are kept** — absolute rule 9 (use the video's audio, no narration) is
  about b-roll **splice stretches**. For a motion background the builder uses only the video
  track, so the clip's audio is discarded and TTS, subtitles, and BGM carry on.
- **Not combined with per-line illustrations (`narration[].img`)** — a motion background lays one
  video across the whole scene, so per-segment background swapping can't hold (the alpha capture
  has only text). To turn an illustration-mode scene into video, use the single representative
  illustration (`visual.bg`) as the source.
- Keep `duration` inside one clip — made with Veo it's fixed at 8s, so anything inside that is
  covered by one clip; Seedance makes only as many seconds as you ask and bills that much, but
  the default 1.5 pro takes **4–12s** (server-validated), and the check strip warns past the
  route's cap. The narration math (characters / 4.5, capped 13s) can outrun that cap — a
  13-second narration on a motion background is a storyboard defect: trim the narration or
  split the scene. A clip shorter than its scene loops, and the loop shows its seam.
- The content-reviewer **plan mode** gate is the same as b-roll's (absolute rule 13) — don't call
  veo without `PLAN_REVIEW: PASS`.

### broll — a generated-video stretch (reference only) · spliced between scenes

```js
{
  type: "broll",
  after: 0,                          // spliced in after this scene index (the opening b-roll goes after the cover = 0)
  narration: [],                     // has to be empty — produce absolute rule 9
  shot: { feel: "attention closing in on the one thing the cover showed", size: "mcu", angle: "eye" },   // b-roll is a shot too — feel first (directing-grammar §5); the strip warns when it is missing
  duration: 4,                       // ★used length★ — from what the cut is for (§cut length); write the reason in the comment
                                     // Veo: generation is pinned to 8s, so produce trims the front. Seedance: this is what gets requested
                                     // don't stretch it with a palindrome (the audio plays backwards)
  visual: {
    picture: "ai-video", overlay: "none",
    src: "images/scene-1.png",       // the same file as `SCENES[after]`'s visual.bg — absolute rules 8 and 12
    clip: ".work/broll/broll-a0-mixed.mp4",   // the trim + loudnorm + BGM mix (the 8s original is broll-a0.mp4)
    camera: {                                 // §camera — the span of the stored prompt is assembled from these four
      movement: "dolly in", speed: "very slow",
      framing: "chest-up on the subject", end: "subject centred at mid-frame"
    },
    audio: "quiet studio room tone with a faint fabric rustle, no music, no speech",
    prompt: "…the stored final clip prompt (§clip prompt — assemble-bg-prompt.js --clip --engine veo)",
    negative: "text, subtitles, black bars, letterboxing"   // veo negativePrompt argument — nouns only
  }
}
```

The generated-video cap **is set by §motion background's effective channel cap** — b-roll slots
and motion-background scenes count together. One b-roll is usually the opening after the cover
(`after: 0`); the other can sit after any body scene — where the story's axis turns, or where a
run of still cuts is dragging.

- **Don't put it in the main manifest** — after the build, `../../produce/references/splice-clip.sh`
  splices it at the `after` scene's end time and pushes the following subtitles by the measured
  insert length. If you used both slots, pass **both clips in one call** (the script sorts and
  processes them by time). Splitting it into two calls makes the second call re-read `reel.mp4`
  and the first splice disappears.
- **Put it at the end of the array** (treated like `outro`). Even though it plays earlier,
  slotting it into the middle of the array shifts the following scenes' indices, so the
  `frame.html?i=<n>` capture URLs and the idx values in `cards.tsv`/`segs.tsv` all fall out of
  step — state PNGs already captured have to be recaptured. The playback position comes from
  `after`, not from array order.
- **The two slots can't share an `after` value** — plugging two clips into the same spot leaves
  the insert order undefined, and splice fails because it would have to cut the piece between
  them to under 0.5s.
- **Don't put one after a `quote` scene** — quote has `visual.bg` as `null` (it uses a speech clip
  or a quotation card), so there's no photo to use as a source. The check also skips the
  comparison when `bg` is missing, so this mistake passes silently — put it only after scenes with
  a background photo (cover, points).
- **`narration` has to be empty.** This stretch uses the audio the video has — laying TTS on top
  makes two sounds fight (produce absolute rule 9). That much time goes without speech, so using
  both slots cuts roughly 8 seconds of information delivery out of the main body. Put them only
  where the episode can afford that loss within the length contract (the total-length band per
  format).
- **Don't use it on the cover.** Veo can't write Korean, so screens with the hook title and the
  hero stat are code-rendered (absolute rule 10). `after: 0` — that's **after** the cover.
- `src` is **the same file as `SCENES[after]`'s `visual.bg`** (absolute rule 12) — the transition
  is the photo the previous scene showed as a still starting to move, so one image does two jobs.
  It has to be a PNG of a photorealistic person scene (Korean women by default, per the profile §3
  target) made at `quality: "high"`, and since it's the reference point for reproduction, don't
  delete it.
- **Make the background of a scene with b-roll attached with `gpt_image_text2img` (high)** — the
  default engine for points backgrounds is the local Z-Image (§5 engine split), but images that
  become veo input are the exception. A blurry source makes a blurry video and wastes the veo
  spend. A still life with no people is out too (absolute rule 11 — the model finds nothing to
  move and the 8 seconds look like a still frame).
- **Filename convention**: the 8s original is `.work/broll/broll-a<after>.mp4`, the trim + mix is
  `.work/broll/broll-a<after>-mixed.mp4`. Putting `after` in the name keeps the two slots from
  overwriting each other. Older episodes' `cover-broll.mp4` and `cover-broll-mixed.mp4` remain
  valid.
- **Get these scenes and the cover bgPrompt verified by content-reviewer plan mode before any
  generation call** (absolute rule 13) — don't call image or video generation
  (image_local_generate, gpt_image high, veo) without `PLAN_REVIEW: PASS`.

### outro — a brand close with a next value (reference only)

```js
{ type: "outro", title: "다음엔 로그인 붙여요", sub: "완성 과정, 다음 편에서 이어집니다" }
```

- **Don't put it in the main manifest** — the build splices the shared
  `data/<channel>/assets/outro/default.mp4` (or `outro/youtube.mp4` · `outro/instagram.mp4` when
  per-platform). `resolve-asset.py` looks through the catalog, the default path, and the old
  `assets/outro.mp4`. This scene renders only when the outro is first created (build-outro.sh).
- Don't default to wording that asks only for channel behavior, like `"매주 올립니다"` or
  `"구독해 주세요"`. For a serial, say the result they'll get in the next episode; for a one-off,
  say one line of channel value about continuing to solve the same problem. If the shared outro
  video has fixed wording, promise the next result in the main body's last narration instead.

### chapter — long-form chapters (`youtube-long-16x9` only)

**What you write is one string.** Put `chapter: "title"` on the shot that opens the chapter and
you're done; timestamps, the 10-second merge, and the requirement checks are made by the builder
from **measured times**. People don't count seconds — scene lengths are settled in the edit, so
hand-written seconds are guaranteed to be off.

```js
{
  type: "points",
  chapter: "환율 확인하는 세 가지 방법",   // the chapter opens at this shot
  scene: 3, sceneSlug: "how-to-check",
  // …
}
```

- **Boundaries open only at a shot start.** So one shot always falls wholly inside one chapter.
  A chapter that cuts a shot in half can't be made.
- **The first chapter has to be 0:00** (a YouTube requirement). Write `chapter` on the cover shot.
- **Count**: 5–10 in the authored lane (45–120s per chapter); the filmed lane needs 3 or more and
  aims for 6–13. The reason no length band applies to the filmed lane is that scenes have no cap
  there — keeping a cap would just move the crowding from 20 seconds to 120.
- **Boundaries under 10 seconds fold into the previous chapter** (YouTube won't take them). If
  fewer than 3 remain after folding, the builder skips making `chapters.txt`.
- **Don't copy `title`.** `title` is the spoken hook that appears on screen ("이거 왜 이래?"),
  while the chapter is the search phrase stamped into the description ("환율 확인하는 세 가지
  방법"). Different registers.
- **Each chapter opens with its own one-line mini-hook** — a narration sentence on why this
  chapter matters, before its content starts; and around the 50–70% mark of the episode one
  deliberate re-hook resets the room (a question to the viewer, a tease of the part people
  argue about). Attention decays over 60–90s stretches in long-form, so a chapter that opens
  straight into its content spends its first seconds on viewers already drifting
  (scenario-craft §5 — field-practice grade).

The reason for adding chapters isn't ads — midroll slots are placed in Studio independently of
chapters (`chapter` never appears in the primary source, YouTube's midroll help page). The reason
is **navigation**. Korean long-form gets essentially no automatic chapters (0 across all 59
unauthored episodes · English had 7 of 13, Fisher p≈1.2e-06 measured), so without chapters a
viewer has no way to reach the part they want in a 15-minute video.

### Filmed scenes — clips the user shot themselves (`visual.source: "recording"`)

For long-form, **mixing generated and filmed scenes within one episode is the normal path**.
Install screens, running results, and hands-on moments are better actually filmed than drawn,
while background explanation and concept pictures are cheap and fast to generate. Both get used
in one episode.

```js
{
  type: "points",
  scene: 4, sceneSlug: "terminal / day",
  beat: "result",
  shot: { feel: "relief — it really runs", size: "ms", angle: "eye", info: "that one command really runs the whole thing" },
  title: "이게 진짜 도는 화면이야",          // the spoken hook that appears in the lower third
  bullets: [{ t: "명령 한 줄", d: "나머지는 알아서 돈다" }],
  duration: 24,                               // filmed scenes have no cap
  narration: [],                              // empty when using the live voice (the two lanes below)
  visual: {
    picture: "recording",
    source: "recording",
    clip: "footage/s4-run-cli.mp4",          // the user puts the file here
    shot: "the terminal with the command being typed and the result appearing",   // what's visible on screen
    action: "type the command slowly and wait until the whole result is out"      // what you do
  }
}
```

| Field | Required | What |
|---|---|---|
| `source` | ✅ | `"recording"` — this one field is what decides a filmed scene |
| `clip` | ✅ | `footage/s<scene number>-<slug>.mp4` — **the storyboard sets the filename** (below) |
| `shot` | ✅ | One line on what's visible on screen. Becomes the **화면** item in `script.md` |
| `action` | ✅ | What the user does. Becomes the **행동** item in `script.md` |
| `takeSec` | optional | Target filming length in seconds. Falls back to `duration` |

**People don't pick the filename.** The storyboard sets `footage/s<scene number>-<English slug of
sceneSlug>.mp4`, writes it into `clip`, and prints it as-is into `script.md`. The user only has to
save the filmed file under that name, and produce doesn't have to hunt for files.

**A filmed shot carries `shot.feel`·`size`·`angle` like any other** — they are what `script.md`
prints as 느낌 · 사이즈(거리) · 앵글(기준 높이) · 소리 per shot, so the person holding the camera
knows how far to stand, where the camera sits against the subject's eyes, and whether the room or
the voice leads the sound. `visual.shot` says what is on screen; `shot.size`·`angle` say how it is
framed. The distances, the joint rule, the 180° line and the 30° rule for re-filming are
directing-grammar §7.

#### Where the sound comes from — two lanes

| Lane | `narration` | Sound | Subtitles | When |
|---|---|---|---|---|
| **Live voice** | `[]` (empty) | The clip's own audio | Made from the transcript | Cuts where the user spoke while watching the screen |
| **Narration over** | Segment array | TTS | The segments' `sub` | Laying explanation over a screen filmed in silence |

The live-voice lane is the default — the voice the user demoed with owns that screen, and laying
a synthetic voice over it makes two sounds fight (the same reason as produce absolute rule 9).
The builder puts this card on the **`sync` lane**, skipping silence trimming, speed correction,
and preroll entirely. Any one of those three catching would desync the mouth from the sound.

The narration-over lane is used for the opposite — a cut filmed with only the screen and no
speech (scrolling, waiting for a run, a result screen), where TTS has no sound to collide with.

#### All-live-voice episodes — `window.VOICE = "user"` (the long-form default)

An episode where the user **records every scene's narration in their own voice** says so in
one top-level line. On the mixed lane this is the default — alternating the user's voice with
TTS inside one episode changes the speaker partway through (the same reason produce is barred
from quietly switching TTS engines). An episode covered by TTS happens only when the user
decides on it.

```js
window.VOICE = "user";   // narration on every scene = the user's own voice. Omitted means TTS
```

On such an episode the "live voice = `narration: []`" rule from the two-lane table above does
not apply — **every scene fills `narration`.** Those segments are not a TTS script but **the
sentences to speak** (a recording guide plus the reference for subtitles and alignment), and
they are why script.md carries the lines for every shot. Only the source of the sound differs
per scene.

| Scene | Sound | File |
|---|---|---|
| Filmed scene | the sound the clip already has (sync lane) | `footage/s<scene number>-<slug>.mp4` |
| Generated or slide scene | a separately recorded voice | `voice/s<shot number>.wav` — **shot number = the SCENES array position (from 1)**, the same number script.md uses |

`voice/` sits at the same level as `footage/` (the episode root), and the storyboard decides
the filenames and prints them in script.md — the same rule as the filmed clips.

#### On-screen text sits in the lower third

A filmed scene's `title`, `bullets`, and `footnote` sit in a **band at the bottom left**. They
don't fill the zones like a generated scene does, because the part the user is demoing is the
upper screen — covering it with text hides what the cut is showing. The top 60% of the
screen stays clear throughout, and no scrim backs the band (gradient scrims are off — owner
2026-08-25), so the footage itself keeps the lower third readable.

- Captions are still **one at a time** (a swap). Being a filmed scene doesn't mean lining several
  up.
- A filmed scene with no text at all is normal — if the screen is already saying it, leave it
  empty.

#### Don't film in portrait

Long-form is 16:9. A portrait clip gets center-cropped, losing most of the frame, and the builder
stops with `STRICT_DIM=1` **before the first ffmpeg** (the landscape preset's default). This fact
is written at the top of `script.md`'s filming rules — learning it after filming everything means
filming again.

### Screencast splice — one recorded screen inside an ordinary episode (`visual.source: "screencast"`)

A filmed scene is a whole production mode: live voice, a filming contract, script.md, and in
short-form the whole episode goes that way. But a lot of episodes need **one cut of a real
screen** and nothing more — the command actually running, the setting actually being switched,
the result actually appearing — inside an episode that is otherwise generated and narrated by
TTS. Rebuilding that one moment as a generated image is the wrong trade: the whole point is
that it is the real screen.

That is this lane. **It is per scene in both formats** — the one place a short mixes a recorded
picture with generated ones. What stays all-or-nothing in short-form is the camera-filmed lane
(`source: "recording"`), because that one changes the speaker, the character counts and the
speech rate for the whole episode. A screencast splice changes none of those: the voice is
still TTS, the card is still an ordinary card, and only the picture comes from a file.

```js
{
  type: "points",
  scene: 3, sceneSlug: "the terminal / day",
  beat: "result",
  shot: { feel: "relief — it really runs", size: "insert", angle: "eye", info: "that one command runs the whole thing" },
  title: "명령 한 줄이면 끝이야",
  duration: 7,
  narration: [ /* ordinary TTS segments — the recording is muted under them */ ],
  visual: {
    picture: "recording",
    source: "screencast",
    clip: "footage/s3-cli-run.mp4",   // the recording the user saves — one file, or a long one many scenes cut from
    at: "12.5-19.0",                  // the window on THAT file's clock, seconds
    focus: "160:220:1400:900",        // x:y:w:h on the source frame — the panel that carries the point
    shot: "the terminal with the command being typed and the result appearing",
    action: "type the command slowly and wait until the whole result is out"
  }
}
```

| Field | Required | What |
|---|---|---|
| `source` | ✅ | `"screencast"` — this one value is what makes it a splice rather than a filmed scene |
| `clip` | ✅ | `footage/s<shot number>-<slug>.mp4`. Several scenes may name the **same** file with different `at` windows — that is the normal shape when the user recorded one long pass |
| `at` | optional | `"<start>-<end>"` in seconds **on the source file's clock**, for when one long recording covers several scenes. Left out, the whole file is the cut — which is what one-file-per-shot recording gives, and what script.md asks the user for |
| `focus` | recommended | `"x:y:w:h"` in source pixels. Without it the whole frame is fitted, and a 1920-wide screen in a 1080-wide canvas is a 1.78× shrink sitting in a band a third of the height — legible for one beat, not for a card anyone has to read |
| `sync` | optional | `true` puts the card on the live-voice lane (the recording's own sound, `sync=1` in cards.tsv, subtitles from the transcript). Omitted, the recording is muted and TTS narration covers the card |
| `shot` (inside `visual`) | ✅ | one line on what is visible on screen — the **화면** item in script.md |
| `action` | ✅ | what the user does while recording — the **행동** item in script.md |

- **The clip plays once and freezes on its last frame** (`@` visual, §motion slides has the same
  contract). So the `at` window should be about the card's length: longer and the tail never
  plays, much shorter and the picture sits still while the voice runs on. `cut-screencast.sh`
  warns in both directions when produce passes it the card duration.
- **A screencast scene has no `bg` or `bgPrompt`** — it drops out of §5 image generation and the
  §5.5 image review, exactly like a slide scene. What is on screen is the recording.
- `zoom` is `none`. Ken Burns on a screen recording shakes text that is already small.
- **Not for a talking head.** A face and a voice is `source: "recording"` — the filmed lane, with
  its own sound and framing contract. This lane is for a screen.
- **Not for ambience.** A window scrolling under the whole narration is a background, not a
  point; that is `visual.video`. Cut to the moment where something changes and cut away.
- Until the user's file lands in `footage/`, the episode is blocked the same way a filmed scene
  blocks it — the storyboard sets the filename, `script.md` prints it, and `episode-state.js`
  reports it as missing.

### The authored-screen lane — three kinds under one key (`visual.slide.kind`)

`visual.slide` is not only diagrams. It is **the screen we author ourselves**: one HTML file per
shot, baked into clips by seek-rendering, checked by `check-slide.js`, and judged by
`slide-reviewer`. What that file draws is `kind`, and there are three:

| `kind` | What is on screen | Section |
|---|---|---|
| `"diagram"` (the default when absent) | text and shapes — structure, comparison, steps, a flow of numbers | §slide scenes · §motion slides |
| `"kinetic"` | the words themselves — one phrase landing per sentence | §kinetic type |
| `"character"` | a cast enacts the sentence — a figure reacts, officers surround, documents reveal | §character act |

Everything else is shared and does not change per kind: the file naming
(`slides/s<shot number>-<slug>.html`), reveal groups 1:1 with narration segments, the state rule,
the determinism contract, the zone, no `bg`/`bgPrompt`, no §5 image generation, the design gate
at score ≥ 95 with p0 = 0. **A new kind is a new template and new design rules — not a new
pipeline.**

Two rules bind every kind:

- **`motion: true` is required whenever `visual.slide` exists.** A still slide is not allowed.
  produce §3.6 and the storyboard check strip render the seek path only. Leave `motion` out and
  `check-scenes.js` / `check-slide.js` fail.
- **An absent `kind` is `"diagram"`.** Every episode written before this lane existed keeps
  behaving exactly as it did — except it now has to write `motion: true` too.

### Slide scenes — a screen where text and shapes are the subject (`visual.slide`)

For a passage where **the explanation has to be the screen** — structure, comparison, steps, a
flow of numbers — a slide beats a caption over a photo background. The criterion joins the one
in §filmed scenes in a single line: if the evidence is on screen, film it; if it's mood, place,
or people, generate an image; **if it only reads once text and shapes are laid out, make it a
slide.**

```js
{
  type: "points",
  scene: 8, sceneSlug: "the workroom / day",
  beat: "body",
  title: "세 폴더가 전부야",
  duration: 18,
  narration: [ /* segments — 1:1 with the slide's reveal groups */ ],
  visual: {
    picture: "slide",
    overlay: "none",                 // the slide IS the screen — nothing gets layered on top
    slide: {
      // If this shot is 12th in the array it's s12 — the array position, not the scene number (8)
      file: "slides/s12-plugin-layout.html",
      kind: "diagram", motion: true, treatment: "editorial",
      role: "mechanism", motif: "folder rail",
      plan: "the plugin folder structure revealing itself top to bottom, one entry at a time",
      labels: ["skills/", "agents/", "server/"]
      // arts: [{ file: "slides/assets/s12-plugin-layout.png", prompt: "…", group: 1, move: "travel" }]
    }
  }
}
```

| Field | Required | What |
|---|---|---|
| `slide.file` | ✅ | `slides/s<shot number>-<slug>.html` — **shot number = the SCENES array position (from 1)**, the same number as script.md's shot and `voice/s<n>.wav` |
| `slide.plan` | ✅ | One line on what to draw. For motion, number what changes on each narration group |
| `slide.labels` | ✅ when the shapes carry text | Every piece of text to draw on the slide beyond `title` and `bullets`. The style gate's screen surface checks this array — plant Korean text in the slide file that isn't here and characters that never passed the check go on screen |
| `slide.arts` | required on a principle shape beat; optional elsewhere | Generated stills that move on the slide: `{ file, prompt, group, move }`. `file` is `slides/assets/s<shot>-<slug>.png`. `move` is `travel` · `rise` · `in` · `drop` · `press` · `none`. On a principle frame each plate is a **flat ink actor** (person, agent, room) sitting with `h.fig`; hairlines (`h.stem` · `h.bus` · `h.chamber`) draw the relation. Named-state primitives may skip arts. An editorial frame that uses a raster still needs two or more authored actors, paper pieces, or relations — the raster is evidence, not the whole composition. The picture has no readable text; HTML type stays in `labels`. Generate at storyboard §5.6 |
| `slide.motion` | ✅ `true` | required. A still slide is not allowed. Numbers count up, bars grow, type reveals on its sentence (§motion slides) |
| `slide.treatment` | ✅ on a moving `diagram` | `"editorial"` when HTML owns the whole frame; `"photo-action"` when a photo fills the frame and the photographed subject or evidence itself changes |
| `slide.role` | ✅ on `treatment:"editorial"` | `evidence` · `relationship` · `mechanism` · `timeline` · `statistic` · `transition` · `verdict` |
| `slide.motif` | ✅ on `treatment:"editorial"` | The episode-wide visual device repeated across authored frames: signal line, evidence stamp, paper tear, date rail, or another concrete device |
| `slide.motionBeats` | ✅ when `shot.infoType` is `timeline` · `statistic` · `principle` | One `{group, primitive}` per narration group. The declared primitive has to exist in the rendered DOM for the same group |

The frame design is part of what the user approves, so storyboard renders and reviews key
states before §7. Author only text already present in `title`, `bullets`, and `slide.labels`.

- A slide scene has no `bg` or `bgPrompt` — it drops out of §5 image generation and the §5.5
  image review, and storyboard-reviewer's image mode doesn't treat its missing `scene-N.png` as
  a defect.
- **Reveal groups are 1:1 with narration segments** by default, and using sub-reveals (`A|B`)
  makes more groups than segments. produce lays clip k under segment k as a play-once visual.
- Keep text inside the zone (portrait x 176 · top 190 · bottom 570, wide x 96 · top 96 ·
  bottom 285) — the bottom band is the subtitle band.
- Both formats. The template carries both zones from `window.FORMAT`.

### Motion diagram treatments — editorial frame or photo action (`visual.slide.treatment`)

A moving diagram states which of two jobs HTML is doing. `check-scenes.js` and
`check-slide.js` reject an omitted treatment so a still photo with a moving box cannot quietly
stand in for a designed frame.

`"editorial"` means **HTML is the frame**. It composes archival documents, dates, maps, source
labels, type, lines, masks, and evidence into one screen. Use it when the viewer must compare two
claims, follow cause and effect, understand a mechanism, read a timeline, cross a transition, or
feel the verdict land. A short informational episode uses 1–3 editorial frames. Give them one
shared `motif`; vary the composition and let the motif provide continuity. Two to four atomic
moves may happen across the scene, but only one primary read changes at a time.

An editorial frame is not a text treatment for a photo. When it uses a local scan, photo, or
symbol, that raster is one plate inside a constructed visual argument. Put at least two authored
actors or relations on screen — for example, two paper fragments converging on a source card, a
date rail joining documents, or a signal line linking an eye gesture and a hand gesture to a
clearly labelled online interpretation. `check-slide.js` blocks a raster-only editorial file;
`slide-reviewer` grades the rendered result and requires 95 or more with P0=0.

Three information types make this lane mandatory. `check-scenes.js` rejects another visual,
`check-slide.js --require-all` rejects a missing HTML file, and `render-motion-slide.mjs` rejects
a declared movement that is absent from the rendered frame:

| `shot.infoType` | Required `slide.role` | Allowed `motionBeats[].primitive` |
|---|---|---|
| `timeline` | `timeline` | `date-enter` · `range-grow` · `event-link` |
| `statistic` | `statistic` | `count-up` · `bar-grow` · `dot-fill` · `axis-draw` |
| `principle` | `mechanism` | `flow-trace` · `node-enter` · `state-transform` · `shape-enter` · `shape-draw` · `shape-travel` |

Groups start at 1 and map to narration segments in order. One group declares one primary
primitive. `motion-slide-template.html` provides helpers with the matching names (`h.date`,
`h.range`, `h.link`, `h.count` · `h.stat`, `h.bar`, `h.dots`, `h.axis`, `h.flow`, `h.node`, `h.state`,
`h.disk`, `h.ring`, `h.press`, `h.shift`, `h.fig`, `h.stem`, `h.bus`, `h.chamber`), and a
plain `h.rv(rg, html, { primitive })` stamps the same marker on custom DOM.
The helper emits `data-primitive`, so the contract follows the pixels instead of trusting a plan.

A **principle** frame is an illustrated cast plus hairline relations — the same grammar as a
cast of actors with pipes drawing between them. `shape-enter` sits an actor or a chamber
(`h.fig` · `h.chamber`; `h.disk` only when the actor is abstract). `shape-draw` draws the
relation (`h.stem` down, `h.bus` across, `h.ring` around). `shape-travel` is a press or a
side move (`h.press` · `h.shift`). Labels name the actors; they are not the picture.
Shape primitives require `slide.arts` (ink actor, paper fill, no background, no readable
text, no photorealism). `flow-trace` · `node-enter` · `state-transform` stay for named
states and may skip arts. A principle shot that only reveals words is the same defect as a
kinetic fallback.

```js
slide: {
  file: "slides/s4-announcement-reversal.html",
  kind: "diagram", motion: true, treatment: "editorial",
  role: "relationship", motif: "radio signal line",
  plan: "① the July 8 statement enters · ② a signal line crosses to the reversal · ③ both dates lock into one contrast",
  labels: ["1947년 7월 8일", "비행 원반", "날씨 기구"]
}
```

`"photo-action"` means a local photo can fill the frame, but every narration group changes the
subject or evidence inside it: debris is sorted, a reflector unfolds, a folder leaves a shelf, a
trace reaches its target. `visual.action` and `slide.plan` name those same changes. A whole-photo
pan or zoom, drifting dust, a light pulse, a callout line, or a rectangle appearing over an
unchanged photo is not subject action and fails the slide review.

### Motion slides — a slide whose numbers move (`visual.slide.motion: true`)

For a passage that **states a value** — a count, a comparison, a share, steps that arrive
one per sentence — the number counts up, the bar reaches its mark, the step enters, **at the
moment the sentence about it starts**. The research behind the lane
(`docs/research/2026-08-29-motion-slide-lane/`): animation raises attention and engagement
and leaves comprehension unharmed only when the movement carries the value; decorative
motion costs comprehension. So the lane is deliberately narrow — beats, not ambience.

```js
{
  type: "points",
  scene: 5, sceneSlug: "the gear count", beat: "body",
  title: "톱니가 몇 개나 됐을까",
  duration: 11,
  narration: [ /* 3 segments — 1:1 with the slide's reveal groups */ ],
  bullets: [{ t: "큰 조각 하나", d: "27개" }, { t: "남은 조각 전부", d: "30개" }],
  visual: {
    picture: "slide", overlay: "none",
    slide: {
      file: "slides/s5-gear-count.html",
      kind: "diagram", motion: true, treatment: "editorial",
      role: "statistic", motif: "measurement rail",
      // what moves on which sentence — §7 approval reads this line
      plan: "① 27 counts up as the hero number · ② the 30 bar grows to 81% · ③ the 37 bar grows to full and the source line enters",
      motionBeats: [
        { group: 1, primitive: "count-up" },
        { group: 2, primitive: "bar-grow" },
        { group: 3, primitive: "bar-grow" }
      ],
      labels: ["톱니바퀴 개수", "큰 조각 하나", "Freeth et al., Nature 2006"]
    }
  }
}
```

**The state rule** — one sentence the template, the renderer and the reviewer all cite:
*clip k opens on groups 0..k-1 at rest, group k animates from t=0, and its last frame is
group k at rest.* Group 0 is the base (source, scrim, axes) and never animates on its
own — it is clip 1's first frame; the tag, the title and the first value open group 1 as
a chain (slide-design.md §5). Groups are 1:1 with narration segments (segment 1 →
group 1); sub-reveals (`A|B`) make more groups than segments, as on any card.

What that buys: **no narration timing is needed at render time.** `render-motion-slide.mjs`
(produce references) renders one clip per group, and produce lays clip k under segment k
as a play-once visual (`@motion/slide-s<n>/r<k>.mp4` in segs.tsv, whose paths are relative
to `.work/` — produce §3.6). The builder freezes
each clip on its last frame for the rest of the segment, and the reveal xfade at the
sentence boundary crosses two identical pictures (the previous rest state), so the seam
is invisible — measured 44 dB PSNR across the seam on the 2026-08-29 fixture. The motion
begins inside the pause before the sentence, which is where the caption contract already
puts the reveal.

| Field | Required | What |
|---|---|---|
| `slide.motion` | ✅ `true` | the marker. Without it `check-scenes.js` and `check-slide.js` fail |
| `slide.plan` | ✅ | **what moves on which sentence**, numbered by segment — "① 27 counts up · ② the bar grows". A plan that only says what is drawn is not a motion plan |
| `slide.labels` | ✅ | Figures may be typed in the slide, but every figure on screen must match `labels` / `bullets` / research.md — slide-reviewer reads them off the frames |

Contract (the template's head comment carries the same list; `check-slide.js` machine-checks it):

- Built from `references/motion-slide-template.html` (or the kinetic / character template for
  those kinds). It exposes `window.__seek(tMs, g)` · `__groups()` · `__size()` · `__meta()`,
  which the renderer calls (`__meta` reports stray and infinite animations; the renderer
  stops on either), plus `__setSegs({group: ms})` — the renderer's `--segs` hands over the
  narration segment lengths and elements marked `.sv` stretch their meaning motion to them
  (the sustain layer, slide-design.md §5).
- **Every movement is reproducible by seek**, and there are four ways to make one:
  CSS `@keyframes` (the template's `rise` · `in` · `grow` · `draw` · `fade`), `data-count` count-ups,
  a **painter** registered with `__paint(rg, durMs, fn)` whose `fn(tMs)` draws the frame at
  `t` (canvas 2D, WebGL, or SVG — the path for a rotation, a trace, anything keyframes can't
  hold; WebGL runs on SwiftShader, so it reproduces on the same machine rather than across
  machines), and
  a **`<video data-rg data-vfrom data-vdur>`** whose `currentTime` is set to the group's local
  time (`vfrom` and `vdur` are both milliseconds). A painter that attaches DOM keeps those nodes
  inside its own `[data-rg]` — outside it a CSS animation runs on the wall clock, and `__seek`
  pins it to t=0 and counts it so the renderer stops. `transition` is forbidden (its object
  exists only after a property change, so it can't be seeked). `Date` · `Math.random` · `performance.now` · `requestAnimationFrame` ·
  `setTimeout` are forbidden, inside a painter too — the frame is whatever `__seek(t, g)`
  says, and the same `(g, t)` draws the same picture.
  **Byte-identity across re-renders is not guaranteed**: Chrome's compositor still leaves
  sub-pixel antialiasing differences on some renders even with `Animation.ready` awaited
  (measured PSNR 55–72 dB — invisible at either end, and it predates this commit). Four
  consecutive renders coming out identical and the fifth differing is a measured outcome, so a
  two-run diff gives false passes and false failures alike. When you need to check determinism,
  render six to eight times and count how many classes the output falls into.
- Local fonts only, as on every slide — and local images and video, for the same reason.
  A remote URL makes the network decide the frame; `check-slide.js` fails on one. Stills are
  png or jpg — a gif, an apng, an animated webp or an SVG SMIL animation runs on the wall clock
  and creates no Animation object, so neither `__seek` nor `__meta` can see it; the checker
  fails on those too, and the painter is where that motion belongs. Video has to be H.264 or
  VP9 (HEVC won't decode under `--disable-gpu`), and a slide with `<video>` needs real Chrome —
  bare Chromium ships without the H.264 decoder.
  Painters get `__interp(x, [in0,in1], [out0,out1], ease)` and `__ease(name, x)` from the
  runtime (`linear` · `out` · `in` · `inOut`) so a curve isn't hand-rolled per slide.
- **One movement per group, entrance ≤ 2.6s of motion** (clip = 2.6s + the hold). A segment
  shorter than its clip cuts to the next rest frame mid-motion; the renderer warns. With
  `--segs`, a group's `.sv` element stretches past the cap to its segment length by design,
  and the renderer instead warns about the opposite defect — a clip frozen past 40% of its
  segment with no sustain.
- **Cyclic motion is outside this lane** — gears turning for the whole scene. That would
  freeze on every hold. Render it as footage and place it with `visual.video` /
  `visual.clip` (ep05's gear scenes went that way). Beats plus their sustain: count-ups,
  bar growth, step and callout entries, each allowed to keep moving monotonically to its
  own segment boundary.
  The footage itself can now come from a slide instead of a separate drawing program:
  author a one-group slide whose painter runs the length of the shot, render it, and wire
  the resulting `r1.mp4` as `visual.clip`. ep05 drew its gears frame by frame in Python
  because there was no painter; the same 11 seconds is a `__paint(1, 11000, fn)` today.
  What stays outside the lane is the *placement* — continuous motion under a multi-segment
  slide, where the state rule would freeze it at every seam.
- Both formats. The zone comes from `window.FORMAT` (portrait x 176 · top 190 · bottom
  570, wide x 96 · top 96 · bottom 285 — `formats.js` mirrored inline in the template).
- The look is `references/slide-design.md` — a plate ground (key light, vignette, grain at
  encode), ink · paper · one accent, square plates and 3/6/10px rules instead of cards and
  hairlines, broadcast type sizes (44px floor), one hero per slide, and the opening chain
  (tag → title → first value, `--lead` apart) in group 1. Its §6 is the rubric
  **`slide-reviewer`** scores the rendered frames against in storyboard §5.6, and a motion
  slide enters the build only at **score ≥ 95 with p0 = 0**.
- A motion slide has no `bg`/`bgPrompt` and skips §5 image generation and the image
  review; the storyboard's check strip and `episode-state.js` treat the file the same way
  (same naming, same "not authored yet" blocker).

### Kinetic type — the words are the picture (`visual.slide.kind: "kinetic"`)

Some lines don't need a picture behind them. A promise, a reversal, a name, a verdict — the
sentence itself is the thing, and a photo under it is decoration competing with the words. Then
the screen becomes the words: **one phrase lands per sentence** and stays while the next lands
on it.

```js
{
  type: "points",
  scene: 4, sceneSlug: "the verdict", beat: "turn",
  title: "**한 줄**이면 끝이야",
  duration: 10,
  narration: [ /* 3 segments — 1:1 with the phrases */ ],
  bullets: [{ t: "설정 파일 없음", d: "기본값이 정답이라" }, { t: "지우기도 한 줄", d: "" }],
  visual: {
    picture: "slide", overlay: "none",
    slide: {
      file: "slides/s4-one-line.html",
      kind: "kinetic", motion: true,
      plan: "① 제목이 큰 마디로 내려앉고 ② 설정 파일 없음 ③ 지우기도 한 줄이 얹힌다",
      labels: ["설치"]
    }
  }
}
```

- Built from **`references/kinetic-type-template.html`**. Helpers: `h.word` (the big phrase),
  `h.line` · `h.sub` (the ones receiving it), `h.cross` (a phrase with a rule struck through it —
  for the thing that turned out wrong), `h.rule`, `h.art` (a still from `slide.arts`), `h.disk`
  (a supporting shape). When `slide.arts` is set, default `renderKinetic` places the first art
  on group 1 then the title with `in` — that pair is one event. Type-only (a verdict, a cross)
  skips arts.
- **Don't put the subtitle on screen.** The subtitle band is already reading that sentence; a
  screen that repeats it word for word says everything twice and gives the eye nothing to do.
  What lands on screen is what survives the trim — `title`, `bullets`, `labels`. slide-reviewer
  reads a screen phrase identical to its segment's `sub` as a P0.
- **One big phrase per slide**, four lines at the very most, five words to a line. Past that it
  is a paragraph, and a paragraph belongs to the narration.
- **One effect kind per slide** — `drop` (from above, the default) or `wipe` (left to right, for
  a longer phrase). Mixing them inside one screen reads as a template showing off. An art that
  travels while the word enters with `in` is one event, not two.
- Words don't spin, bounce, or fly in on an arc. They arrive and stop. Same argument as the
  motion-slide lane: movement that carries meaning helps, decorative movement costs
  comprehension.
- **Not a diagram.** A value that counts up, a bar that grows, steps that arrive — that is
  §motion slides, and it stays there. This kind is for when the words are the whole point.

### Character act — a cast enacts the sentence on screen (`visual.slide.kind: "character"`)

An explanation with nobody in it is flat in a way a viewer feels before they can name. This kind
puts a drawn cast on screen that **enacts each sentence**. Use one figure for a reaction, or a
small cast for a concrete event: a masked figure gathers around a document, officers arrive, then
the restraint closes. The picture supplies cause and effect; verified text and sources still carry
the claim.

```js
{
  type: "points",
  scene: 6, sceneSlug: "why it got stuck", beat: "body",
  title: "여기서 한 번 막혀요",
  duration: 12,
  narration: [ /* 3 segments — 1:1 with acts */ ],
  bullets: [{ t: "이유는 따로 있었다", d: "설정이 아니라 순서였다" }],
  visual: {
    picture: "slide", overlay: "none",
    slide: {
      file: "slides/s6-stuck.html",
      kind: "character", motion: true,
      acts: ["enter", "think", "cheer"],     // one per segment — the vocabulary is fixed
      plan: "① 들어와 서고 ② 턱에 손을 대고 생각하고 ③ 두 팔을 들어 뛴다",
      labels: ["막히는 자리"]
    }
  }
}
```

| Field | Required | What |
|---|---|---|
| `acts` | ✅ | one action name or `{ action, actor, target? }` per reveal group, in order. **The vocabulary is closed**: `enter` · `point` · `nod` · `shrug` · `think` · `wave` · `cheer` · `conceal` · `signal` · `inspect` · `gather` · `surround` · `bind` · `escort` · `release`. `check-slide.js` fails on an unknown action, an unknown cast id, or fewer acts than narration segments |
| `cast` | required for a multi-actor event | `{ id, archetype, count?, label? }[]`. `archetype` is a visual role such as `masked`, `police`, `researcher`, `witness`, `document`, or `prop`; the plate stays text-free and its label stays in `labels` |
| `plan` | ✅ | what the figure does on which sentence, numbered by segment — the same shape as a motion slide's plan |
| `labels` | ✅ | as on every slide |

- Built from **`references/character-act-template.html`**. The figure is a polished large-head,
  simplified editorial character, not a generic icon. With an image tool, produce a matched set
  of transparent, text-free character and prop plates under `slides/assets/` and use HTML to
  stage their actions. Without one, the template's code-native tableau is the fallback. Labelled
  boxes are not a substitute when an illustration tool is available.
- **Actions are chosen, never authored.** Adding a keyframe of your own to a slide breaks the
  thing that makes the lane work: every action is defined once in the template, so it renders the
  same way in every episode, and hand-tuned motion doesn't survive a re-render. The vocabulary is
  `enter` · `point` · `nod` · `shrug` · `think` · `wave` · `cheer` · `conceal` · `signal` ·
  `inspect` · `gather` · `surround` · `bind` · `escort` · `release`. For a cast event, write
  `{ action, actor, target? }`; both ids must exist in `cast`. If an action the episode needs is
  absent, change the template, `check-slide.js` and `slide-design.md` together — not one slide.
- **Every action returns to rest** except `enter`. That is what lets clip k end where clip k+1
  begins, and it is why poses don't accumulate across cuts.
- **The character never carries the fact alone.** The value, the claim, the name are written on
  screen and checked like any other screen text; the figure reacts to them. A slide where the
  only thing conveying the point is a gesture has nothing for the style gate or the reviewer to
  read.
- **A maximum of three actors, no lip sync.** Entering, surrounding, escorting and a reversible
  restraint are allowed because they state the event. A walk cycle, a mouth moving to narration,
  or an unbounded crowd belongs in filmed or generated-video work.
- **Not the channel's mascot.** Using it on every scene turns an explainer into a cartoon and
  buries the evidence. It earns its place on beats about a person's experience — being stuck,
  deciding, being surprised.

## Authoring verification checklist (the storyboard skill's self-check before requesting approval)

The machine-measurable items below (character counts, speech rate, scene length, total length,
cover title, frame overflow, hero stat width, the b-roll contract, negative directives in a clip
prompt or camera slot, a multi-reference clip with no scope) **show up in the check strip at
the top when you open `storyboard.html` in a browser** — don't count by hand, just confirm the
strip says no violations.

- [ ] **`window.COMPREHENSION` reduces the episode to one question, answer, and takeaway.** A
      short informational episode has no cross-scene branch; a short narrative has at most one.
      Every unfamiliar term carries its exact plain wording in the same first shot, and every
      scene's `shot.info` reaches the answer or takeaway
- [ ] cover title ≤16 chars + topic word included, statLabel ≤18 chars. The title opens on a felt
      problem rather than a method or tool (platform-playbook §1 ②)
- [ ] **The cover `hookType` is one of the four** (`fear`·`empathy`·`curiosity`·`spoiler`), and the
      title and segment ① actually ride that strategy — writing it down while the opening
      opens on a different stimulus is the same as not writing it (§the four opening strategies).
      **A short does not use `spoiler`.** On long-form, hooking continues the same stimulus
- [ ] **Every scene title is a spoken hook** — something a person blurts out (casual-register
      exclamation, question, hearsay), not an explanatory statement, a `-하기` nominalization, or
      newspaper-style `-ㄴ다` (§title is a spoken hook)
- [ ] **`window.FORMAT` matches this episode's format** — omitted or `"shorts-9x16"` for
      short-form, `"youtube-long-16x9"` for long-form. Leaving it out gets a long-form script
      checked against the portrait contract, and it passes
- [ ] Shot count and total length are inside the format band (§format table · the source of truth
      is `formats.js`)
      - Short-form: hook + drip (1–n) + spoken CTA = **4–7 shots · 35–75s** (90s hard cap)
      - Long-form: **28–70 shots · 8–15 min** (20 min hard cap) + chapters (§chapter).
        An episode with many filmed scenes normally has fewer shots than this band — one chunk of
        recording comes in as one scene. The badge only warns; it doesn't block
- [ ] **If there are filmed scenes** (§filmed scenes), each has `clip`, `shot`, and `action`, and
      `clip` follows the `footage/s<scene number>-<slug>.mp4` convention. The live-voice lane has
      `narration: []`, the narration-over lane has segments — having both makes the sound collide
- [ ] **Filmed-scene lines are one copy with `script.md`** — scenes.js is the SoT and script.md is
      the render. Don't create sentences that exist only in the shooting script (the render is
      `make-script.js`)
- [ ] **If there are slide scenes** (§slide scenes) each one has `slide.file` and `slide.plan`,
      and file follows the `slides/s<shot number>-<slug>.html` convention (shot number = array
      position). Every piece of text to draw on the shapes is in `slide.labels` — the file itself
      is built and reviewed at §5.6 before approval. `slide.motion: true` is required
- [ ] **If there are slide scenes** (`slide.motion: true`, §motion slides) the `plan` says what
      moves on which sentence (numbered by segment), the movement is a value being spoken (a
      count, a bar, a step) and not ambience, and no scene relies on continuous motion — that
      is footage, not a slide. Groups are 1:1 with narration segments unless `A|B` sub-reveals
      are written
- [ ] **Every moving diagram has `slide.treatment`.** Short informational episodes use 1–3
      `editorial` frames with a valid `role` and one repeated `motif`; `photo-action` frames name
      a real subject/evidence change in both `visual.action` and `slide.plan`. A photo with a
      moving box or line does not count
- [ ] **Every narrated shot declares `shot.infoType`.** `timeline`, `statistic`, and `principle`
      use the required moving editorial diagram, mapped role, and one allowed `motionBeats`
      primitive per narration group. `check-slide.js --require-all` sees every HTML file and the
      renderer confirms those primitives in the DOM
- [ ] **On an all-live-voice episode** `window.VOICE = "user"` is present and every scene that
      has narration filled it (§all-live-voice episodes) — the filmed-scene "live voice = `[]`"
      rule is for TTS episodes only
- [ ] Every shot has `scene`, `sceneSlug`, `shot.feel`, `shot.size`, `shot.angle`, `shot.info`, `shot.infoType` —
      `info` doesn't overlap within the same scene, `feel` doesn't restate `info`, and `size`·`angle`
      (and `camera`·`duration` on a generated shot) follow the directing-grammar §5 row for that
      feel or say why not. One close-up (`cu`·`choker`·`ecu`) per scene, `choker`/`ecu` ≤2 and `dutch` ≤1 per episode (with
      its reason written), hook cut and speech clips at `eye`, a close-up opening paid back by a
      wide or medium in the next shot (`directing-grammar.md` §6)
- [ ] **Every generated still has `shot.space`** (`frame: "camera"` · `layout` — it may stay
      empty only on an `insert`/`ecu` that fills the frame with one object · `facing` when a
      person is on screen · `line` when two people, or a person and what they look at, share
      the scene) — assembled into `bgPrompt`
      by `assemble-bg-prompt.js` (directing-grammar §3.5 · §frame space). No `left view of`, no
      allocentric "from X's right", no metres in the space slots. Image→video motion prompts
      do not re-describe sides, facing, or lighting
- [ ] **A still whose subject is the place is framed three-quarter** (two walls visible), and a
      scene that moves to a new place or time names its palette in three colours rather than a
      mood word (directing-grammar §3.5). A shot that follows a hard cut, a flashback, or the
      `turn` gets its own beat to land in before the next line (§6 rule 13)
- [ ] **Each join is a decision** — omit `transition` for a cut (the builder J-cuts spoken
      cards); write `"cut"` only for a smash; spend `dissolve` / `dip` / `push:<dir>` from
      §scene transition, never from the `scene` number. A short spends at most one visible
      join, never on the hook. Consecutive stills in one scene change size by two steps or
      the angle (directing-grammar §6 rule 16)
- [ ] **Every generated clip's prompt closes with positive locks** — what has to hold in every
      frame, written as positive sentences, with each reference given its scope in
      `visual.character` (`{ id, scope }` — "controls the helmet and body only", "appears only in
      the last second"). No "no ~" phrasing in the clip prompt or the camera slots, no bare
      category refusals ("not a game", "no CGI"); a state change inside the clip carries its
      duration (`video-model-selection.md` §positive locks · §motion background). The check strip
      catches the negative directives and a multi-reference clip with no scope anywhere
- [ ] `visual.picture` and `visual.overlay` match the structure. AI video and HTML staging aren't
      merged into one badge
- [ ] **On a short the cover opens a gap and does not dump `COMPREHENSION.answer`** — no
      `hookType:"spoiler"`, no `hookForm:"payoff"`, no compacted answer in the cover's spoken
      text. On long-form answer-first, builds, tutorials, and before/after comparisons show the
      finished result in the first frame; on a story arc the first frame is the moment it went
      wrong and the ending stays out of it
- [ ] **Playback order matches the format** — **short: hook → drip (1–n) → cta**, n ≥ 1, last
      narrated shot is `beat:"cta"` (an outro asset is not the spoken close), no
      hooking/result/body/turn; **long-form answer-first: cover → hooking → result → body**, the
      finished thing before the method; **long-form story: cover → hooking → body → turn →
      result**, the answer appearing for the first time in the result, a `turn` shot right before
      it
- [ ] **On a short every middle shot is `beat:"drip"`** — each shot except the last drip pays
      one piece and opens the next gap (scenario-craft §5); the last drip is the first place the
      answer is complete. **On long-form the shot after the cover is hooking** (`beat:"hooking"`)
      — it catches what the cover threw, hooks with the viewer as the subject, and doesn't unpack
      the answer, with the result or the build starting within 60s of the cover (§hooking)
- [ ] One episode solves one problem and produces one result
- [ ] A serial's CTA promises the next episode's concrete result rather than making a vague
      subscribe request
- [ ] narration character caps respected, 8–25 chars per sentence, every sentence closed with a
      period
- [ ] tts/sub notation split done (numbers, loanwords)
- [ ] No distortion of numeric ranges (a range stays a range)
- [ ] Every factual claim matches a verification-passed entry in research.md, research.md was
      finished **before** the first scene was written (storyboard SKILL §2 — two passes with a
      pick in between: first research → three directions → additional research · first pass
      logs ten or more searches · sufficiency: floor 3 verified claims, 5+ on a short, 12+ on
      a long-form, every question answered or written off, one `Chosen:` direction), and no
      claim sits on a written-off question
- [ ] **The cover has `hookForm`** (`paradox`·`gap`·`payoff`·`identify`·`number`·`secret`) and the
      title and segment ① take that shape, and the last drip (short) or the result (long-form)
      pays it (a gap closed, a secret revealed, a number counted out — §the six hook forms).
      **A short does not use `payoff`.** The first frame has no logo, no intro, no greeting; every
      narration segment opens curiosity, moves the information forward, or puts evidence down;
      one sentence = one subtitle = one reveal (§narration segments)
- [ ] Plain-language principle — no unexplained jargon, no over-compression
- [ ] No AI tells — exit 0 on all three surfaces (0 S1 findings left):
      ```bash
      set -o pipefail        # without it, $? stops being the checker's
      PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
      for S in narration subtitle screen; do
        node $PG/extract-text.js ./scenes.js $S | python3 $PG/check-style.py --surface $S -
        echo "[$S] gate_exit=$?"
      done
      ```
      The rules and prescriptions are platform-guide `references/korean-style.md`. exit 3 isn't a
      pass, it's the gate not running. Catching it here means no rework at produce §5
- [ ] bgPrompt includes the mandatory negative directions; generated images have no text and no
      national symbols
- [ ] points backgrounds: photorealistic topic shots + a new cut whenever the content axis turns
      (no reusing one image across every scene — produce absolute rule 14), captions `t` ≤ 12 chars
      · `d` ≤ 22 chars
- [ ] **On-screen text doesn't duplicate the sound** — no caption or title summarizing what the
      narration says. No text written to fill a slot (§on-screen text only when needed). Empty
      `title`, `footnote`, and `bullets` are normal, not defects
- [ ] **Sound plan** (§music cues) — every `sound.cue` names a key that exists in `window.MUSIC`,
      no shot carries `cue` and `drop` together, and the drop count is what the episode can carry
      (one in a short). `window.MUSIC` missing entirely is a valid single-bed episode, not a gap.
      Every shot that becomes a generated video has `visual.audio` (§clip audio)
- [ ] THEME matches profile.md §3
- [ ] **`window.MOTION_POLICY` matches the profile frontmatter** when the channel declares one.
      The true-motion ratio, allowed kinds, longest still run, action requirement, and generated
      video cap all pass `check-scenes.js`. Ken Burns and caption swaps do not count
- [ ] Generated video (`broll` + `visual.video` combined) stays inside the format default or the
      profile's explicit `generated_video_max` override (§motion background) · content-reviewer
      plan mode PASS recorded
- [ ] If you placed `broll` scenes — the two slots' `after` differ · each slot has `narration: []`
      · `src` is the same real PNG as `SCENES[after].visual.bg` (that image made with gpt_image
      high as a photorealistic person scene) · `duration` (used length) is 8 or under with a
      comment giving the reason (not stretched with a palindrome)
- [ ] If you placed a `visual.video` scene — points type · `duration` inside the route's one-call
      cap (veo 8 · 1.5 pro 4–12, server-validated) · `narration[].img`
      unused · the source `bg` is a real PNG (gpt_image high)
- [ ] **Every generated-video shot stores its final prompt and route** (§clip prompt) —
      `visual.prompt` / `visual.video.prompt` / `visual.clip.prompt` assembled with
      `assemble-bg-prompt.js --clip --engine <route>` and stored whole, exclusion nouns in the
      sibling `negative` field, no timecodes or digit seconds on a seedance route
- [ ] **Every generated-video shot has all four `visual.camera` slots filled** (§camera) — b-roll,
      motion background, and quote speech clips. An empty `end` is the defect this checks for;
      `movement: "static"` is a filled slot, not an empty one
- [ ] **A generated clip's `duration` matches what the cut is for** (§cut length) — an insert
      isn't 8 seconds because 8 was the default
- [ ] **`visual.character` names whoever from the channel cast is on screen** (§character
      reference) — the subject of the shot first in the array
- [ ] **Every generated-video shot says what it sounds like in `visual.audio`** (§clip audio) —
      left blank, the engine invents speech under the narration
