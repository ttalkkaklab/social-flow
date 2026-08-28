---
name: storyboard
description: >
  This skill should be used when the user asks to "스토리보드 만들어", "스토리보드 작성",
  "이 주제로 영상 기획", "촬영 대본 만들어", "내가 녹화할 대본", "make a storyboard",
  "plan a video for topic X", or starts a new post topic in a channel. Researches the
  topic (naver_search/WebSearch/serp_*), then authors an image-included storyboard under
  data/<channel>/episodes/<topic>/storyboard/ — human-readable storyboard.md + machine-readable
  scenes.js (the SoT that produce consumes) + generated scene images, or in
  screencast mode a shooting script (script.md) the user records against. Picks the format
  with the user first (9:16 shorts by default, or 16:9 YouTube long-form with chapters);
  long-form episodes mix scenes the user films with generated ones, and for every filmed
  scene the shooting script spells out what is on screen, what to do, what to say, and the
  exact filename to save it as, so the user can just follow it. Six adversarial reviews run
  **once each** before approval — the storyboard-reviewer agent reads the copy as a whole
  (AI-sounding phrasing, hook, factual fidelity), then every single scene for quality and
  contextual fit, the word choice of every narration and title, the camera plan (what each
  shot should make the audience feel, and whether its size, angle, frame space and move serve that feel),
  the episode's sound design, and finally the generated images (do they match what each scene
  actually says). There is no score to clear and nothing is delegated
  twice: each review's findings get applied once, and whatever is left over goes onto the
  HITL approval screen for the user to decide.
argument-hint: "<channel> <topic or topic hint>"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "Agent", "AskUserQuestion", "WebSearch", "WebFetch", "mcp__social-flow__naver_search", "mcp__social-flow__serp_web_search", "mcp__social-flow__serp_news_search", "mcp__social-flow__serp_naver_search", "mcp__social-flow__serp_image_search", "mcp__social-flow__datago_search", "mcp__social-flow__datago_detail", "mcp__social-flow__datago_file_download", "mcp__social-flow__datago_file_fetch", "mcp__social-flow__datago_api_call", "mcp__social-flow__image_local_generate", "mcp__social-flow__gpt_image_text2img", "mcp__social-flow__suno_generate_lyrics"]
---

# Storyboard authoring — data/[channel]/episodes/[topic]/storyboard/

Takes one topic through **research → scene design → six adversarial reviews (copy ·
per-scene · vocabulary · camera · sound) → image generation → image review → storyboard
approval**. The `scenes.js` settled here is the one data source (SoT) for
production (produce) — video, captions, and per-platform text all derive from this file,
so factual mismatch between platforms can't arise in the first place.

Before approval the adversarial reviewer (`storyboard-reviewer`) reads the storyboard six
times, **once each**. None of the six is a gate — there's no score to clear and nothing gets
delegated twice. Each one hands back findings, the findings get applied, and the run moves on.

| Review | What it looks at | What comes back |
|---|---|---|
| §4.5 copy | The sentences of the whole storyboard — AI-sounding phrasing, hook, factual fidelity | one total score |
| §4.6 per-scene | The role and contextual fit of **each individual scene** | a score per scene + the lowest |
| §4.7 vocabulary | Whether the **words** in narration and titles are words people use | a score per scene + the lowest |
| §4.8 camera | The shot grammar — what each shot should make the audience feel (`shot.feel`) and whether its size, angle and frame space serve it — plus the four camera slots, the cut length, and the engine fit of every generated shot | a score per shot + the lowest |
| §4.9 sound | The episode's sound design — the music cue plan, clip audio, voice casting | one total score |
| §5.5 images | Whether the picture shows what the scene is saying | one total score |

**The scores are a record, not a bar.** They go into `scenes.js` at approval so you can read
back later which storyboard produced which performance. The gate is the person: a finding the
single round didn't resolve doesn't stop the run — it goes onto the §7 approval screen with
the storyboard and the user decides.

The three per-shot reviews report **the lowest** alongside the list, since an average lets a
good scene hide the one that collapsed.

```
data/<channel>/episodes/<topic slug>/storyboard/
├── research.md      # evidence, sources, cross-check log (skipped on channels that skip research)
├── storyboard.md    # the human-readable storyboard — shot tables + embedded images
├── storyboard.html  # review render — loads scenes.js directly and draws it (template-based, §6)
├── scenes.js        # the machine-readable SoT — THEME + SCENES (+ narration segments)
├── images/          # per-scene 9:16 generated images (scene-<n>.png) — omitted in shooting mode
├── slides/          # long-form slide-scene HTML — authored in §8, after §7 approval
└── script.md        # shooting mode only — the shooting script the user records against
```

## Procedure

### 1. Load the profile

Read `data/<channel slug>/profile.md`. If it's missing, stop and point the user at
`/social-flow:channel add` first. Tone, voice, theme, verification policy, and the topic
slug rule are all inherited from that file.

**Check the topic axis** — compare the incoming topic against profile §1 topic areas and
target viewers. Recommendation is matching that predicts "viewers who'd like this content"
(grow-instagram playbook §principles), so a channel wandering across unrelated topics blurs
that prediction and stacks skip signals for existing viewers. If the material sits outside
the axis, say so with AskUserQuestion before proceeding — [proceed as is / re-angle to fit
the channel / hold]. "Re-angle" is usually the right answer — the same material comes back
inside the axis once you frame it as the target's problem (e.g. a travel channel's
"exchange rate spike" → "changing money this week — now or wait?"). If the topic area is
empty or you can't judge, just confirm rather than block — this gate is a warning, not a
barrier.

### 1.5 Pick the format — short-form 9:16 (default) vs YouTube long-form 16:9

**Two axes get settled here — format (landscape/portrait) and mode (generated/filmed).**
They're orthogonal, so all four combinations are valid (filming a landscape long-form is a
normal path).

**Short-form is the default** format. Treat the signals below as long-form candidates and
**confirm with AskUserQuestion** — don't decide by guessing. Getting the format wrong means
redoing everything from research through images.

- The user says so — "long-form", "a long video", "a 10-minute one", "the main YouTube
  video", "a lecture"
- The material doesn't fit in one episode — multi-step installs and setups, a tutorial you
  follow start to finish, a roundup comparing several cases
- You're making the **deep version** of a topic already covered in short-form

Present the options like this. **Say out loud that long-form is `provisional`** — the safe
area was measured only on desktop web, and subtitles and titles may come in a bit further
later (`references/scenes-schema.md` §format).

```
[Short-form 9:16 (default) — 35–75s · 4–7 shots, all four platforms]
[YouTube long-form 16:9 — 8–15 min · 28–70 shots · chapters, YouTube only. Safe area provisional]
```

Write the chosen value into the top-level `window.FORMAT` in `scenes.js`. **State it even
for short-form** — absence means short-form so the behavior is the same, but writing it
down leaves the file showing which contract this episode was checked against.

```js
window.FORMAT = "youtube-long-16x9";   // or "shorts-9x16"
```

What the format changes is the §4 composition rules (length, shot count, character counts,
chapters) and the §5 image size; the six reviews (§4.5–§5.5) run the same way either way.

### 1.6 Pick the mode — generated (default) vs filmed (screencast)

If it's a topic **the user will record themselves, demoing and narrating on screen**
("make a shooting script", "I'll record it", app demos and tutorials), it's **shooting
mode**. Confirm with AskUserQuestion when unsure. What differs in shooting mode (the
`references/shot-script-template.md` contract):

- Scene `visual` is `{ source: "recording", clip, shot, action }` — §5 image generation is
  skipped entirely (the on-screen footage comes from the user's actual recording).
- narration isn't a TTS script but **the sentences to speak** — the character cap relaxes
  (40 chars per sentence recommended, derived backwards from an 8–20s scene target).
- §6 authors **script.md (the shooting script)** alongside storyboard.md.
- After approval the hand-off is **recording**, not produce (§7 branch).

#### Long-form is a third case — one episode mixes both

A short-form episode is either all generated or all filmed, but **for long-form, mixing
filmed and generated scenes in one episode is the normal path.** Install screens, running
results, and hands-on moments are better actually filmed; background explanation and
concept pictures are cheap and fast to generate. There's no reason to fill 12 minutes with
one kind.

So in long-form the mode isn't per-episode but **per-scene**. Decide it one scene at a time
while designing them (§4) — is this shot filmed, or made?

```
[Landscape long-form · mixed]      ← the long-form default. The user films each filmed scene into a file
[Landscape long-form · all generated]  ← topics with nothing to film (explainers, roundups)
[Landscape long-form · all filmed]     ← a demo start to finish. Treated as a special case of mixed
```

**"All filmed" is also built as the mixed lane** — one file per scene, with zero generated
scenes. Short-form's `build-screencast.sh` path (shoot straight through once, then align)
is portrait-only and can't go landscape. If the user says "I want to shoot it in one go",
let them, but ask them to split the file at scene boundaries when saving.

**Narration in a mixed shoot defaults to live voice on every scene** — the user records
every scene's lines in their own voice (`window.VOICE = "user"`, scenes-schema
§all-live-voice episodes). Alternating the user's voice with TTS inside one episode
changes the speaker partway through. In that setup script.md carries the lines for every
shot, and shots that aren't filmed scenes are voice-only recordings
(`voice/s<shot number>.wav`). An episode covered by TTS happens only when the user asks
for it.

Generated scenes then split two ways in §4 — mood, place, and people become a **generated
image**, while a diagram that only reads once text and shapes are laid out becomes a
**slide** (scenes-schema §slide scenes). A slide scene carries only its plan in the
storyboard; the file is built in §8 after approval.

If even one filmed scene exists, §6 authors **`script.md` (the shooting script)** and the
hand-off after approval is filming (§7). The contract is `references/scenes-schema.md`
§filmed scenes; `references/shot-script-template.md` is the source of truth for the
document structure.

### 2. Research and fact-checking (follows profile §5 policy)

**Research comes first, and it is a step with an exit, not a background activity.** No scene is
written until `research.md` is done — a storyboard authored while still searching bends the
facts to the sentences already written, and a storyboard authored after the facts are on the
table gets its hook, its hero stat and its result from what is actually true (the measured
difference on our own episodes, user note 2026-08-23). The step has four parts, in order:

1. **Write the question map before the first search.** In `research.md` §Questions, list the
   5–8 questions this episode has to answer — what the viewer asks, what the hook promises, what
   the result has to show, every figure, date, price and name that will appear on screen or in a
   line. Each question gets a row; each row ends the step as *answered by claim #N* or
   *written off* (and a written-off question never becomes a claim or a caption).
2. **Search per question, not per topic, and from more than one direction.** Each question gets
   **two or more searches from different tools or types** (the tool guidance below — `kin` for
   what people actually ask, `news` for time-sensitive values, `blog`/`cafe` for how it plays out,
   WebSearch/serp for overseas and precision, `datago` for government-origin figures). Every key
   claim gets one **counter-evidence search** ("X 아니다", "X 논란", "X 바뀜", the opposing source)
   and every time-sensitive value gets one **freshness search** inside the last year
   (`serp_naver_search period`, a news date filter) — an outdated figure that was true last year
   is a factual mismatch this year.
3. **Put every claim in the evidence table** — claim · source 1 · source 2 · date checked · status
   (`research.md` §Verified) — and everything that failed in §Failed (with why). Two independent
   sources for anything time-sensitive, one official origin (data.go.kr, the vendor's own doc)
   counts as both. Don't round a range, don't shrink it to its upper bound.
4. **Check sufficiency before leaving the step.** Three verified claims is the floor below
   which there is no video (the same floor autoproduce drops a topic at); a short normally
   leaves with **five or more**, a long-form with **twelve or more**, and **every question in
   the map is answered or written off**. Short of the floor, change the angle or the topic —
   don't pad the body. Only then §3 (the directory) and §4 (the scenes).

**The subject itself gets checked here — does its question survive to the last frame?**
Retention is set more by what the episode is about than by how it is cut (own-channel retention
report (2026-08-26) — measured, n=4): the mystery subject held a flat curve for 90 seconds and
came first in both retention and views, while the episode explaining something the viewer
already accepts ("hearts beat in a rhythm") slid from the third second on and finished at a
third of the views. Before writing scenes, say the episode's question out loud and name where
it gets answered. If that answer is "in one sentence, halfway through", the material is an
explanation and not a mystery — reframe it around whatever stays unresolved (what nobody
could explain about it, the figure that shouldn't be possible, why it was built this way and
not the obvious way), or change the topic. Editing can't rescue a subject the viewer already
agrees with.

The hook material comes out of this step too — the questions people actually ask (`kin`) are
the `identify` and `gap` forms, the verified figure is the `number` form and the hero stat, the
result that's actually been shown is the `payoff` form (scenes-schema §the six hook forms). A
hook written before the research is a promise made before knowing whether it can be kept.
**The arc is decided here too** — if the material is an unfinished sentence on its own (tried →
failed → someone saw it differently), it is story material: write `arc: "story"` on the cover,
keep the payoff for the result after the turn, and pick a form that leaves the loop open
(`gap`·`secret`·`paradox`·`identify`); otherwise `answer-first` (scenes-schema §playback order).

- **When `recording/timeline.md` exists (produced by the ingest skill)** use it as the
  primary source — take the scene structure and key messages from the timeline, and use web
  research only to cross-check time-sensitive figures inside the transcript. What was said
  in a recording is a claim, not evidence — figures that fail verification don't go in. In
  this case research.md records the gist per timeline scene plus a verification result
  table.
- Search tool choice: **Korean material goes to `naver_search` first** → general and
  overseas material to the built-in WebSearch → `serp_web_search`/`serp_news_search` when
  you need precision search (operators, date filters). Use whatever combination fits, but
  don't repeat the same search just by swapping tools. The search tools share argument
  names — `query`, `limit` (result count), `page`.
- `naver_search` has 8 `type` values and they're used differently. At the topic-discovery
  stage **`kin` (지식iN, a Q&A site)** is particularly strong — what people actually don't
  know sits there as their own questions, which is raw material for hook sentences. `cafe`
  is sentiment and complaints, `blog` is hands-on reviews, `encyc` is term definitions (the
  one-line explanation for a caption), `local` is addresses and coordinates of local
  businesses, `news` is for verifying time-sensitive values.
- `serp_naver_search` gives you two things the official API doesn't — **video search**
  (`where: "video"` — how others covered the same topic, their lengths and view patterns)
  and a **date filter** (`period: "1d"~"1y"` — narrowing time-sensitive values to a recent
  window). For everything else use `naver_search`, which has the larger quota.
- For **reference images** to put on screen, use `serp_image_search` (composition, seeing
  the real thing) or `naver_search(type: "image")` (Korean material). To use a searched
  image in the video as-is you have to specify `license` though — unspecified results are
  images with no rights check. **Screens you make yourself get generated, not searched** —
  engine split is in §5 (`image_local_generate` by default, `gpt_image_text2img` for the
  cover and any screen containing text).
- **Topics whose evidence is government-origin data — statistics, policy, regional status**
  — get their source dataset from `datago_search` (data.go.kr). An official origin is
  itself a primary source, so it outranks a news re-quote, and one origin satisfies the
  cross-check requirement. For the collection procedure, source attribution, and the
  data-as-of-date trap, see the **datago skill**.
- Time-sensitive values (prices, tax rates, deadlines, effective dates) get cross-checked
  against **two or more independent sources**. Claims that fail verification don't go in the
  storyboard — don't invent figures and don't change their meaning by rounding (shrinking
  "3–5 million" to "5 million" is distortion).
- Record in `research.md` in the `references/storyboard-template.md` structure — the question
  map, the verified-claims table (source link, check date, status per claim), the failed list,
  the counter-evidence and freshness checks, and the search history. Channels that skip
  research (creative, everyday life) skip this whole step — and then the copy review's
  "no basis" P0 is switched off for that channel, which is the only way a claim gets in without
  a row.

### 3. Create the topic directory

Make `data/<channel>/episodes/<topic slug>/storyboard/images/` using the profile §7 slug
rule. Topics don't live at the channel root — they go under `episodes/`, the same level as
`assets/` and `growth/`.

**If the directory already exists, read where it got to before touching anything.** An episode
runs across sessions, and the thing that stalls one is a half-finished state nobody can see.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
node $REF/episode-state.js data/<channel>/episodes/<topic>      # exit 1 = blocked
node $REF/episode-state.js data/<channel> --all                 # the whole channel, one line each
```

It derives the stage from what the skills already wrote — no state file to go stale — and lists
what the directory promised and didn't deliver (filmed scenes with no footage, images the scenes
name that aren't on disk, a `queue_*: ready` marker pointing at no video). Show the user that
before asking whether to continue from the existing storyboard, so the choice is made against
the real state rather than a guess.

### 4. Scene design — writing scenes.js

Write it to the contract in `references/scenes-schema.md`. Keep the array name (`SCENES`);
one entry is a **shot**. Group the same place and time with `scene`+`sceneSlug`, and write
`sequence` only when purposes diverge. Per shot, write `shot.feel`, `shot.size`, `shot.angle`,
`shot.info`, `shot.space` on a generated still, and `visual.picture` (still photo / AI video / recording / shared asset) plus `visual.overlay`
(HTML staging / none) — one shot can have both. A cover laying an HTML reveal over a still
photo is the default. The source of truth for field definitions is the schema's §grammar
units and production layers.

Core rules:

- **Feel first — every shot says what the audience should feel before any dial is set.** Write
  `shot.feel` in your own words ("relief — it really is that short", "alone in a big room",
  "something's wrong"), then pick the technique that serves it from
  `references/directing-grammar.md` §5: the size (`shot.size` — how far the audience stands),
  the angle (`shot.angle` — the seat you give them; `eye` by default), on a generated still the
  frame space (`shot.space` — who sits where, which way they face), on a generated shot the
  move (`visual.camera`) and the cut length, and what the shot sounds like. The row is a default,
  not a cage — leave it and write why on the shot. `feel` and `info` are different lines: info is
  what the viewer newly learns, feel is what they should feel; a feel that restates the info is
  unset. A feel written after the camera was chosen is a caption for the camera, and the review
  reads it as unset. The size words, the angle words and the space block go into `bgPrompt` too
  — the still is where they get drawn. Write `shot.space` (`frame: "camera"`, `layout`, `facing`,
  `line` when two people, or a person and what they look at, share the scene) and let
  `assemble-bg-prompt.js` put them at the front
  of the prompt (directing-grammar §3.5). Don't write `left view of`, object-centric left/right,
  or metres — the assembler exits 1 on those. Across shots: establish then go close (a close-up opening pays its debt in the next shot), one
  `cu` per scene and `choker`/`ecu` once or twice per episode, one `dutch` per episode with its
  reason written, hook cut and speech clips at `eye`, a wide held ≥1.5× a close on generated and
  filmed shots (directing-grammar §6). The same fields steer the shooting script on filmed shots
  (distance, eye-height baseline, the 180° line — §7 of the same file).

- **Composition — the format picked in §1.5 sets the band.** The source of truth for the
  constants is `formats.js`, and the `storyboard.html` check strip measures against those
  values for you.
  - **Short-form 9:16**: cover 1 + points/quote 3–6 + outro reference = **4–7 shots ·
    35–75s**. When going over 75s, write into the `storyboard.md` design rationale why
    dropping the demo or evidence in question would make the result impossible to
    understand (90s is the absolute cap).
  - **YouTube long-form 16:9**: **28–70 shots · 8–15 min** (20 min absolute cap) +
    **5–10 chapters** (3 or more in the filmed lane). The chapter contract is
    `references/scenes-schema.md` §chapter — write only the `chapter` string on the scene
    and the builder makes timestamps from measured times. The first chapter goes on the
    cover so it opens at 0:00.

  When channel Analytics measurements exist, they outrank generic benchmarks — go by
  **stayed to watch, engaged views, and subscribers gained per video**. Pick length and
  format from the episodes that produced engaged views and subscriptions, not raw views.

- **In long-form, pick one of three per scene** (§1.6) — film it, generate an image, or
  draw it as a slide. One line joins the criteria: **if the evidence is on screen, film
  it; if it's mood, place, or people, generate an image; if it only reads once text and
  shapes are laid out, make it a slide.** A generated picture can't stand in for an
  install actually completing, a result running on screen, or the moment a hand touches
  something. A beat like "why is this fast" has no screen to film in the first place, and
  structure, comparisons, steps, and number flows read faster as a diagram than over a
  photo background.
  A slide scene gets `visual.slide` with `file` (`slides/s<shot number>-<slug>.html` —
  the shot number is the array position, decided by the storyboard), `plan` (one line on
  what to draw), and `labels` (every piece of text that goes into the shapes) — the file
  itself is built in §8 after approval. Full text: scenes-schema §slide scenes.
  Filmed scenes get `visual.clip` (filename), `shot` (what's visible), and `action` (what
  you do), and the filename follows the **`footage/s<scene number>-<slug>.mp4`** convention
  set by the storyboard — the user doesn't pick names. Whether the live voice carries the
  sound or narration covers it is decided here too (live voice means `narration: []`). The
  full text is scenes-schema §filmed scenes.
- **Long-form spreads one result across chapters over one episode; it isn't several
  short-form episodes stitched together.** A different topic per chapter makes a playlist,
  not an episode. The skeleton (cover → hooking → … with the arc picking the rest) is the
  same regardless of format; long-form just has that "body" split into chapters and running
  longer.
- **Playback order follows the cover's `arc` — two orders, one skeleton.** Cover and hooking
  exist in every episode. **`answer-first`** (the default): cover → hooking → result → body —
  the cover shows the finished thing at a glance, hooking hooks why it's needed, and **the
  result scene comes before the method and steps**; the body (how it was made) unspools only
  after the finished thing has been seen, and the result scene isn't left out of builds,
  tutorials, or before/after comparisons. **`story`**: cover → hooking → body → turn → result —
  the cover opens a loop on the moment it went wrong and never says how it ended, hooking is
  the setup (the protagonist, the original goal), the body builds the conflict, the turn is
  the moment someone saw it differently, and the result is the payoff, **the first place the
  answer appears**; a payoff shown early closes the loop and removes the reason to watch.
  Write a `beat` on each shot — `hook` · `hooking` · `result` · `body` · `turn` (story only) ·
  `cta`. The source of truth is scenes-schema §playback order.
- **Underneath the beats, run the seven craft rules** (`references/scenario-craft.md`). After
  drafting, walk the scenes top to bottom and speak the connective at every seam — each one
  reads "그래서" or "그런데", never "그리고" (an and-then seam is a scene to merge, cut, or
  reorder); check each scene turns a charge (what's at stake reads differently at close than
  at open — `shot.feel` should swing or deepen, never repeat three shots straight). Then the
  technique the episode rides: a story `turn` planted early and fair-play, fear put on the
  table with its clock plus a doable answer (suspense over surprise, Witte's efficacy rule),
  every curiosity loop opened mid-episode paired at open time with the scene that pays it
  (loops beyond the main `hookForm`: short-form one sub-loop at most, long-form 2–4 — note
  the pairs in the §7 hand-off note), the body paying its answer in installments so each
  body scene opens the next question as it closes one (seam gaps stay off that ledger),
  and jokes built as pattern breaks that land last.
- **The opening runs on one of four — fear · empathy · curiosity · showing the ending.**
  Every episode uses one of them (user-relayed creator lecture, 2026-08-18). Decide in one
  line, before authoring, which stimulus the opening (cover title + segment ① + hooking —
  the first 20s of short-form, the first 60s of long-form) uses to stop the viewer, and
  write it on the cover shot as `hookType` (`fear`·`empathy`·`curiosity`·`spoiler`).
  Fear is a loss the viewer may already be carrying ("your videos may already have been
  written off by the algorithm"), empathy is a problem scene that reads as "that's me",
  curiosity is a twist, a figure, or unresolved tension, and showing the ending is putting
  the finished thing on screen first and promising how it got there (the default for build
  content). The cover title and the platform title carry the same stimulus. If you pick
  fear, the threat needs evidence in research.md or a hedge to a possibility, and the body
  has to answer that threat. An opening with none of the four is a copy-mode P0. The source
  of truth is scenes-schema §the four opening strategies.
- **Short-form is run by early drop-off — stop · hold · satisfy · act, not the look of the
  panels.** Half or more of the viewers who leave a Short leave inside the first 3 seconds,
  completion decides distribution under 60 s, and the platform now reads "stopped, then left
  inside 3 s" as a negative signal, so a bait hook the body can't keep costs reach instead of
  buying it (user-relayed, 2026-08-23 — field-practice grade; scenes-schema §playback order
  maps the four jobs onto the beats). Three rules follow — ③ is copy-mode P0-11, ① rides the
  speaker-report P0 and the cover contract, ② is the builder's subtitle band plus the check
  strip's character caps (no reviewer axis of its own, so the approval screen is where a
  subtitle that only works with the voice gets caught):
  **① the first frame has no logo, no intro, no greeting** — big title, strong first frame,
  movement already in it (the stop is decided in 0–3 s); **② subtitles are written for muted
  viewing** — one sentence = one subtitle, 4–7 words (the 8–25-character band), high contrast,
  inside the bottom safe band, nothing the viewer must hear to follow; **③ every sentence opens
  curiosity, moves the information forward, or puts evidence on the table — or it goes**
  (scenes-schema §narration segments). Keep the visual changing every 2–4 s — one sentence =
  one reveal gives that cadence; a stretch past ~4 s with nothing changing gets a caption swap,
  an image change, a move, or the cut. And **pick the hook's shape on purpose**: next to
  `hookType` (why they stop) write `hookForm` (how the first line is built) — `paradox` ·
  `gap` · `payoff` · `identify` · `number` · `secret` (scenes-schema §the six hook forms) — and
  make the title and segment ① actually take that shape, then **keep it** in the result (a
  `gap` the body never closes is the early-exit trap). storyboard.html is tables, frames and
  badges, not drawn panels — the form of the storyboard is irrelevant, its function is to force
  these four jobs.
- **The hold job is won in the body, not at the entrance** (measured on our own channel,
  n=4 — retention report, 2026-08-26). Retention ranked our four Shorts in exactly
  the order views ranked them (52% → 38% → 26% → 19%, 1,367 views down to 453), and the
  longest episode (90s) came first on both — the slope was the variable, not the length.
  Winner and loser both cleared the first 3 seconds; the loser then leaked a few percent a
  second through the body and sat under 50% by the 17-second mark. So when an episode
  underperforms, **rework the body before touching the opening** — every body scene closes
  one gap and opens the next in the same breath (`references/scenario-craft.md` §5), and a
  scene that only finishes an explanation is where the curve bends. Cutting shorter isn't
  the fix either: what wins is a flat curve, so trim the stretches that sag and let a held
  90 seconds run.
- **The shot after the cover is hooking — informational episodes included.** If the cover
  stopped the thumb, hooking carries the stopped person to the result. The contract has four
  parts — **catch** what the cover threw (same subject, same promise; don't drift to new
  material), **hook** the viewer's problem, loss, or gain **with the viewer as the subject**
  (problem/harm = empathy / loss/risk = fear / unresolved tension = curiosity /
  resolve/criteria = declaration — continue the strategy the cover picked; on a story arc
  the hooking is the setup, with the protagonist and the original goal as the subject),
  **don't unpack** the answer, the method, or the finished thing (it makes what follows a
  rerun — on a story arc that holds through the build and the turn too), and be
  **short** (short-form 1–3 shots · 4–15s, with the result or first body scene — the build,
  on a story arc — inside 20s counting from the cover). Don't fill it with greetings, self-introduction, channel
  introduction, or a "today we'll look at ~" trailer — the speaker-report-opening P0 applies
  to the first hooking segment too. The source of truth is scenes-schema §hooking; the
  evidence is [hooking research](../../docs/research/2026-08-18-hooking-beat/).
- **Result revealed in the first second (answer-first)**: the cover's first frame is the
  finished screen or the working result. The cover's first line says what benefit or change
  that result gives the viewer (showing the ending, of the four). Greetings, background, tool
  definitions, and "I tried it" get cut or moved behind hooking. The cover's glance and the
  result scene's unfolding point at the same artifact. **On a story arc the opposite holds** —
  the first frame is the moment it went wrong, close, and the ending stays out of the cover,
  the setup, the build and the turn; the cta's frame is what points back at the cover.
- **One result per episode**: one video solves one problem or produces one change. Install,
  setup, and demo don't all go in one episode. Push the leftover steps to the next episode
  and finish only this result.
- **Design subscription conversion as the next value**: for topics suited to builds and
  serials, don't scatter standalone one-offs — bundle them into a series that advances the
  same artifact. The closing CTA isn't "please subscribe" but a concrete promise of **what
  gets finished in the next episode**. Each episode has to make sense to a first-time
  viewer; a series number doesn't substitute for context.
- **Cover title within 16 characters + the topic word is mandatory** — stimulus with no
  sense of what it's about gets skipped. The stimulus is the strategy written in `hookType` —
  if the title opens on fear and segment ① talks about something else, that's a catch
  violation. Emphasis is `**bold**` (gradient chip). statLabel within 18 characters.
- **On-screen text only when it's needed** (user directive, 2026-08-14) — don't fill a
  caption slot in every scene. `title`, `footnote`, and `bullets` can be empty, and **the
  screen doesn't rewrite what the sound already said** (a caption that shortens a narration
  sentence collides with the subtitles). Text belongs on the cover, on numbers, on step
  numbers, on information not in the sound (sources, term definitions), and on text meant to
  be copied. A single-segment scene has zero captions and that's normal — the full contract
  is `references/scenes-schema.md` §on-screen text only when needed.
- **Every scene title is a spoken hook** (user directive, 2026-08-13) — what the viewer
  blurts out inwardly (casual-register exclamation, question, or hearsay: "원하던 색이
  아닌데 ㅠㅠ", "같은 염색약인데 왜 달라?"). Explanatory statements belong to captions and
  narration, not to the title. Narration stays polite-register explanation — the screen
  throws the emotion or question and the sound answers politely
  (`references/scenes-schema.md` §title is a spoken hook).
- **Narration = an array of segments (sentences)** — one sentence maps 1:1 to one reveal.
  The character cap follows the format too (spaces and punctuation excluded).
  - Short-form: cover ≤40 chars · points/quote ≤50 chars · 8–25 chars per sentence
  - Long-form: cover ≤70 chars · points/quote ≤90 chars · 12–40 chars per sentence

  Portrait is shorter not because the screen is narrow but **because the subtitles are burned
  in** — burn-in subtitles top out at two lines at a time. Landscape hands `subs.srt` to the
  player separately with a clean master, so the player handles line breaks. Either way, cut
  clearly on periods (the TTS silence-boundary detector needs them). Two notations: `tts`
  is Korean phonetic spelling ("4,700만"→"사천칠백만"), `sub` keeps the original notation.
- **Plain-language principle (profile §2)** — for on-screen text and narration alike.
  Unpacking the terms at the deck-authoring stage is what makes the narration plain too.
- THEME is copied verbatim from the profile §3 values.
- **Every generated-video shot leaves here with its camera decided** — `visual.camera`'s four
  slots (`movement` · `speed` · `framing` · `end`) filled on b-roll, motion-background scenes,
  and quote speech clips. The clip prompt is assembled out of them here and stored; leave `end`
  empty and the ending nobody reviewed is exactly the last second
  that drifts. `movement: "static"` is a decision, not a blank. On stills the block is optional —
  write it when the still should move with intent: `movement` picks the builder's Ken Burns
  move (eased zoom towards a focus point, pan, cover punch, handheld drift — the feel each
  serves is directing-grammar §5's Still column). The vocabulary rules (vendor words, one move,
  no seconds, no exclusions) are `references/scenes-schema.md` §camera, and the move itself
  comes from the shot's `feel` (directing-grammar §4–§5) — it supports the feel, it doesn't
  carry it alone, and `framing` restates the shot's size and angle in the engine's words.
- **Every generated still leaves here with its floor plan decided** — `shot.space` filled
  (`frame: "camera"` · `layout` — empty only on an `insert`/`ecu` that fills the frame with one
  object · `facing` when a person is on screen · `line` when two people, or a person and what
  they look at, share the scene). Image
  models do not infer camera position or object-centric left/right
  (directing-grammar §3.5). The assembler writes the prefix; the scene and mood follow. A
  motion prompt for image→video does **not** rewrite sides, facing, or lighting — the PNG
  already locked them. A quote speech clip has no still, so its prompt carries the shot's
  `From the camera: …` sentence (`assemble-bg-prompt.js --space-only`).
- **Name whoever from the channel cast is on screen** in `visual.character` — one id, or an array
  with the shot's subject first (order is reference weight). It is what lets produce attach the
  character panels without re-reading the scene, and what resolves a character's veo ban per cut
  instead of per episode. Ids come from the channel's `assets/catalog.md`
  (`resolve-asset.py --list <channel dir>`). **Where a generated clip hands over more than one
  reference, write each entry as `{ id, scope }`** — one clause per reference saying what it
  governs and where it may appear ("controls the helmet and body only", "appears only in the last
  second, and its face never transfers"). Unscoped references leak into each other, and the check
  strip warns on a multi-reference clip with no scope anywhere (scenes-schema §character
  reference).
- **Every generated-video shot leaves here as one API call with its final prompt stored**
  (scenes-schema §clip prompt). The scene is the call: pick the planned route (`visual.engine`
  or the type default — b-roll → veo, motion background → seedance, speech clip →
  veo_reference), fit `duration` to that route's server-validated grid, and assemble the
  prompt with `references/assemble-bg-prompt.js --clip --from scenes.js --shot N --engine
  <route>` — the four camera slots become the span, `--motion` carries what moves in the
  picture, `--locks` the positive-locks tail on a multi-reference call, and the `visual.audio`
  sentence closes it. Store the stdout whole (`visual.prompt` · `visual.video.prompt` ·
  `visual.clip.prompt` per type); produce sends it verbatim and the check strip warns on a
  generated shot without one. Exclusion nouns go in the sibling `negative` field, never the
  body. The assembler blocks what each route can't take — timecodes and digit seconds on
  seedance, digit seconds on veo (in-clip state changes are written in words; on a Veo route
  `[mm:ss]` spans may pin beats instead).
- **A generated clip's `duration` comes from what the cut is for**, not from a default — insert
  3–4s, action 5–7s, a face carrying emotion 7–10s, an establishing shot 5–8s, a deliberate long
  take 10s+ with one move; the directing-grammar §5 row for the shot's feel refines it, and a
  wide holds ≥1.5× a close. The model fills whatever time it is handed, so asking 8 seconds for a
  4-second idea buys 4 seconds of invention (§cut length). Narration-carrying scenes keep the
  speech math — characters / 4.5 — **and on a motion background that math has to land inside
  the route's one-call cap** (seedance 12s on the default 1.5 pro, veo 8s): a 13-second
  narration over a 12-second clip is a loop seam nobody planned, so trim the narration or
  split the scene.
- **Write what the episode sounds like, not only what it looks like.** Every shot that becomes a
  generated video gets `visual.audio` — one sentence on what that clip sounds like, ending in
  `no music, no speech` unless speech is the point. Leave it out and the engine invents a
  soundtrack under a line the TTS is already speaking.
  **Then decide whether the music stays one bed.** One bed all the way through is a real design
  and the default — leave `window.MUSIC` out and the channel's shared bed carries the episode.
  Where the episode turns, name a cue in `window.MUSIC` and point the shot at it with
  `sound.cue`; where one line has to land alone, give that shot `sound.drop: true`. A short
  usually gets one change or none, and one drop at most. The contract is
  `references/scenes-schema.md` §music cues, and the levels behind it —
  the bed sits 10 LU under the narration, the build stops below 4 — are
  `../produce/references/bgm-scoring.md`.

#### Turning channel measurements into story structure

If you can read `grow-youtube` output or YouTube Analytics records, settle each of the
following in one line before authoring and write it into the `storyboard.md` design rationale
and `SB_DOC.seriesNote`.

1. **A stopping problem** — if `stayed to watch` is low, change the first frame and the first
   line. Don't substitute a harder CTA for it.
2. **An interest problem** — if engaged views are low against raw views, cut explanation and
   pull the moment of reaching the result earlier.
3. **A holding problem** — if `averageViewPercentage` trails the channel median, or the
   Studio curve slides through the body while the first seconds hold, the body is closing
   loops without opening new ones. Rework the body into installments
   (`references/scenario-craft.md` §5) and leave the opening the curve says is working alone.
4. **An engagement problem** — if retention sits at or above the channel median while
   `likes`·`comments` (`youtube_insights` per-video) sit at the floor, the video held
   people who then did nothing — the second promotion layer is failing, not the body
   (growth-playbook §observed metrics). Redesign the act beat's outward loop
   (`references/scenes-schema.md` §playback order, act row) and rotate its form so it
   isn't the same question every episode.
5. **Conversion clues** — use the topic, result, and form of the video that produced
   subscribers as the common axis of the next 3–5 episodes. Don't clone a format that had
   high views and no subscribers.
   Conversely, when the early pass-through and retention are good but views alone are low,
   the problem is the title angle, not the form — reopen on a felt problem rather than a
   method or tool (platform-playbook §1 ②).
6. **The next promise** — write this episode's result and the next episode's result as one
   sentence each. If the two don't connect, it isn't a series, just one-offs on similar
   topics.

### 4.5 Copy review (storyboard-reviewer copy mode — one round)

**Get the sentences read before making any images** — when the copy changes, so does the
picture that scene will show, so reversing the order means throwing away images you made.

1. **Delegate to the storyboard-reviewer agent (Agent) in "copy mode"** — pass the paths to
   `scenes.js`, `research.md` (if present), and `profile.md`. Read the tail
   `STORYBOARD_REVIEW: mode=text score=NN p0=N`.
2. **Apply the findings to `scenes.js`, P0 first**, then go to §4.6. **Don't delegate copy
   mode a second time.**
   - **Only subtract** — don't plant metaphors or stock phrases that weren't in the original
     while erasing AI tells. The moment you add one, that's the new AI tell.
   - Don't paper over factual findings (P0-3, P0-4) by smoothing the sentence. Go back to
     research.md, recheck the evidence, and if there is none, drop the claim.
3. **Write down whatever you didn't apply** — one line per finding, in the reviewer's own
   words, into the §7 hand-off note. A finding you disagreed with goes down as a
   disagreement with its reason, not as a deletion.

**Shooting mode runs this review too** — the lines are what the user reads aloud, so AI tells
are louder there.

### 4.6 Per-scene quality and context review (storyboard-reviewer scene mode — one round)

Where §4.5 looked at the storyboard as one lump, here **each scene is scored on its own.**
Storyboards where the overall average looks fine but one scene has collapsed do happen — the
average lets a 100-point scene hide a 90-point one, which is why the reviewer reports **the
lowest scene** next to the list. There are two axes.

- **Quality** — does that scene do its job. The cover says what the story is about within 3
  seconds and **also gives a reason to stay** (segment ① carries whichever of fear, empathy,
  curiosity, or showing the ending is written in `hookType` — scenes-schema §the four opening
  strategies); hooking catches what the cover threw, hooks it with the viewer as the subject
  (the protagonist and their goal on a story arc), and doesn't unpack the answer (§hooking);
  the result scene unfolds the finished thing (on a story arc it is the first place the
  answer appears); body scenes say only how that result was made (on a story arc they build
  the conflict, and the turn is the peak right before the payoff). points gives one message per screen, and
  quote says something that could plausibly come out of that person's mouth.
- **Contextual fit** — is there a reason for that scene to be here. Does it catch what the
  previous scene threw and open the next one, does the result come before the body on
  answer-first (build content) and after the turn on a story arc, is the premise something the profile §3 target will follow, and which entry in
  research.md does that claim hang on.

1. **Delegate to the storyboard-reviewer agent (Agent) in "scene mode"** — pass the paths to
   `scenes.js`, `research.md` (if present), `profile.md`, and
   `${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references/scenario-craft.md` (the yardstick
   behind the flow and role checks). Read the tail
   `STORYBOARD_REVIEW: mode=scene score=NN p0=N worst=<scene number>`. **`score` is the
   lowest scene's score**, so it tells you where the storyboard is thinnest.
2. **Apply the findings, starting at the `worst` scene**, then go to §4.7. Touch only the
   scenes that were flagged; leave the rest alone.
   - **A finding that says the role is empty can't be fixed by smoothing sentences** — if the
     video still stands with that scene gone, merge or drop it. When the scene count drops,
     stretch the remaining scenes to keep the total length.
   - For a broken-flow finding, suspect **the order around it**, not the scene itself. An
     arrangement that still makes sense when reordered had no flow to begin with. If, on
     answer-first (build content), the method explanation sits before the finished thing, don't fix the
     sentences — move the result scene forward; on a story arc it is the reverse — a payoff
     that sits ahead of the turn moves back behind it.
   - **Rewriting a scene or reordering changes the sentences §4.5 already read.** Don't rerun
     copy mode for it — apply the same rule you got there (only subtract) as you rewrite, and
     say in the §7 note which scenes moved after the copy review.
3. **Write down whatever you didn't apply**, with the lowest scene and its score, for §7.

### 4.7 Vocabulary review (storyboard-reviewer lexicon mode — one round)

Once the scene structure is settled, look **only at the words** — are the words used in
narration and titles words people actually use. Structure and rhythm were §4.5's job, role
and flow were §4.6's, so this review stays at the vocabulary layer. Carrying the same meaning,
"제출 기한이 도래합니다" and "이날까지 안 내면 늦어요" are different writing, and the place a
viewer smells AI is usually the words.

What it looks at: hard Sino-Korean words and unexplained jargon, translationese
(`~를 통해`·`~에 있어서`·`수행합니다`), written-only vocabulary and report-style stative
verbs (korean-style §D8, §D9), AI stock phrases, over-repetition of the same word, and words
the profile §3 target doesn't use.

1. **Delegate to the storyboard-reviewer agent (Agent) in "lexicon mode"** — pass `scenes.js`
   and `profile.md`. Read the tail
   `STORYBOARD_REVIEW: mode=lexicon score=NN p0=N worst=<scene number>`. Here too, **`score`
   is the lowest scene's score**.
2. **Swap only the words that were flagged**, then go to §4.8.
   - **Don't rewrite sentences** — if vocabulary fixing spreads into rewriting sentences, the
     structure §4.5 and §4.6 already read falls apart. Only when swapping a single word won't
     do do you touch that sentence, and when you do, note it for §7.
   - **Only subtract.** Planting a metaphor or stock phrase that wasn't there while erasing a
     hard word is a new AI tell (same rule as the copy review).
   - Don't touch figures, proper nouns, or `tts` phonetic spellings.
3. **Write down whatever you didn't swap**, with the lowest scene, for §7.

**Shooting mode runs §4.6 and §4.7 too** — the user reads the script aloud, so the words
land louder. §4.8 runs as well — it reads the feel, the size with its distance and the angle
with its baseline on every filmed shot (the slot axes come back `n/a` per shot, since nothing
is generated), §4.9 runs on the live voice's own layer — pauses, speaker, spellings the user
will read — and §5 and §5.5 are the only ones skipped.

### 4.8 Camera review (storyboard-reviewer camera mode — one round)

Every shot carries a feel and the dials that serve it — `shot.feel`, `shot.size`,
`shot.angle`, `shot.space` on a generated still — and every shot that becomes a generated
video carries four camera slots on top — `movement`, `speed`, `framing`, `end` (scenes-schema
§camera). This review reads both layers **before the first call that costs money**, because a
dial fixed here costs nothing and the same dial fixed after generation costs the clip, and on a
filmed shot it costs a refilm.

What it looks at, per shot:

- **Is the feel written, and does the technique serve it** — the size and the angle against the
  directing-grammar §5 row for that feel (a "trust" talking head at `low`, a "scale" shot at
  `cu`, an "alone" shot at `mcu` are findings), a feel that restates `info`, a feel written as
  "cinematic" or "dynamic" (a request for a move, not a feeling).
- **Is the frame space written for a generated still** — `shot.space.frame` is `camera`,
  `layout` names sides from the camera, `facing` is the visible result (not `left view of`),
  `line` is set when two people, or a person and what they look at, share the scene, and none
  of layout/facing/line/light uses
  camera-inference, allocentric, or metric language (directing-grammar §3.5).
- **The rationing and the sequencing** — one close-up (`cu`·`choker`·`ecu`) per scene, `choker`/`ecu` once or twice per
  episode, one `dutch` per episode with its reason written, a close-up opening paid back in the
  next shot, the hook cut and speech clips at `eye`, a wide held ≥1.5× a close, a scene that
  keeps its `space.line` (directing-grammar §6).

And per generated shot, on top:

- **The four slots, filled and in vendor words.** `end` is the one that goes missing, and with
  nothing in it the model is never told where to stop, so the last second drifts. `dolly in`,
  not `push in`; `arc shot`, not `orbit` — `push` appears 0 times in the canonical Veo text.
- **One move per cut, chosen from the feel**, and `static` written out rather than left blank.
  A move that contradicts the declared feel is a finding (a `dolly in` on "loss", a `dolly out`
  on "realisation"); so is a feel left to ride on the move while size, angle and the picture
  stayed at their defaults — a move on its own didn't change what viewers felt (p=.84), it
  raised immersion, and size, angle, the picture and the sound are what carry the feel.
- **The cut length against what the cut is for** — the table in scenes-schema §cut length and the
  feel row. A 3-second face carrying a line, or a 12-second insert, is the model being handed
  time it will fill by inventing.
- **Engine fit** — a drawn character sent to `veo_reference`, a real face sent to Seedance 2.x
  (which refuses them), more than 3 references on Veo, a `visual.character` id that isn't in the
  cast.
- **Slots that swallowed something else** — seconds written into a slot, an exclusion written
  into a slot instead of `negativePrompt`, or the camera direction and the scene description
  mashed into one blob so the camera block can't be reused on the next scene.
- **The stored clip prompt against its route** (scenes-schema §clip prompt) — every generated
  shot has one, it says what the slots say (a prompt panning where the slot dollies is two
  instructions fighting), the timing grammar fits the planned route (no timecodes or digit
  seconds on a seedance route; digit seconds on veo — `[mm:ss]` spans are the veo form), the
  `duration` sits inside that route's server grid (veo 4/6/8 · 1.5 pro 4–12s), and exclusions
  live in the `negative` field rather than the body.

1. **Delegate to the storyboard-reviewer agent (Agent) in "camera mode"** — pass `scenes.js`,
   `profile.md`, `${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references/directing-grammar.md`,
   `${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references/scenes-schema.md` (§camera · §cut length),
   and `${CLAUDE_PLUGIN_ROOT}/skills/produce/references/video-model-selection.md`.
   Read the tail `STORYBOARD_REVIEW: mode=camera score=NN p0=N worst=<shot number>`.
2. **Apply the findings to `scenes.js`**, starting at `worst`, then go to §4.9.
3. **Write down whatever you didn't apply**, for §7.

**This review runs on every episode** — a filmed shot has a feel, a size, an angle and a distance
to judge even though the user holds the camera, and a still has the size, angle and space its
`bgPrompt` will draw. Only the slot axes go `n/a` per shot, on shots that don't become generated
video.

### 4.9 Sound review (storyboard-reviewer sound mode — one round)

The picture gets read three times over — its role, its camera, then the frame that came out —
and the sound gets read none. That gap is what this review closes. It reads the sound the episode will actually make, while changing it is still free.

What it looks at:

- **Clip audio on every generated video shot.** Leave `visual.audio` unwritten and the engine
  invents its own sound — speech or music that then fights the TTS laid over it. A shot whose
  own audio is thrown away says so, and a shot that keeps its audio says what that audio is.
- **Voice casting against profile §2.** A character speaking in someone else's voice is a P0;
  so is a scene with three speakers, since multi-speaker TTS tops out at two and the third
  voice has to be a separate call spliced in.
- **`tts` phonetic spellings.** Numbers and units written as digits, and the endings the engine
  swallows — the final sound of 팔·에잇·Eight goes missing, so it gets spelled 「에이트」.
- **The music plan** (`window.MUSIC` + each shot's `sound`). Whether the cue changes where the
  episode turns rather than on a timer, whether the drop is spent on the line the episode is
  about, and whether every `sound.cue` names a cue that exists — a name with nothing behind it is
  a P0, because the bed then silently stays where it was. A reveal that lands while the music is
  at full level doesn't land, but **one bed with no drop is a design, not a defect** — that costs
  points, it doesn't stop anything.
- **The narration's own rhythm** — every sentence the same length reads out flat no matter what
  the bed does, and a scene with no pause anywhere gives the builder no sentence boundary to cut
  on.

1. **Delegate to the storyboard-reviewer agent (Agent) in "sound mode"** — pass `scenes.js`,
   `profile.md`, and `${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references/scenes-schema.md`.
   Read the tail `STORYBOARD_REVIEW: mode=sound score=NN p0=N`.
2. **Apply the findings to `scenes.js`**, then go to §5.
3. **What has no field goes to produce** — the mix, the generation call, the engine. Cues, drops
   and cue prompts are all scenes.js fields, so those get fixed here. Write the rest into the §7
   note under "hand to produce" and let it travel with the approval.

### 5. Generate scene images (skipped in shooting mode)

Generate the per-scene background image **at the size the format sets** and save it to
`images/scene-<n>.png`. **Slide scenes (`visual.slide`) are excluded here too** — their
screen is not an image but the slide §8 builds after approval. Both the image count and
the cost ledger count image scenes only. Don't memorize the sizes — read them from the
preset.

```bash
PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
node $PG/format-resolve.js storyboard/scenes.js --json | python3 -c \
  'import json,sys; f=json.load(sys.stdin); print(f["format"], f["image"])'
# shorts-9x16       {'gpt': '1088x1920', 'local': '1088x1920', …}
# youtube-long-16x9 {'gpt': '2560x1440', 'local': '2048x1152', …}
```

Portrait is 1088×1920 rather than an exact 9:16 because of gpt-image's multiple-of-16
constraint (1080 doesn't fit). It gets cover-cropped onto a 1080×1920 canvas, so the 0.7%
ratio difference is ignorable.

**When the scene has a `visual.character`, the image is a reference call, not a text call** —
resolve the id and pass that character's panels as input images (`gpt_image_img2img` /
`nanobanana_img2img`), face first, then body; `back.png` only for a back-facing shot. This is
the same set produce hands to the video engines, and using it here is what keeps the character
the same person from the still to the clip. Never merge the panels into one sheet before
passing them (`../produce/references/video-model-selection.md` §6).

**Engine split** (measured 2026-08-12 — docs/research/2026-08-12-local-image-generation):

- **points backgrounds = `image_local_generate` (local Z-Image — the default).** Cost per
  image 0. Each takes a few minutes, so queue them sequentially and meanwhile pre-write the
  **parts of §6 that don't involve images** (SB_DOC editorial metadata, source summary).
  Write the image embeds and shot tables after §5.5 passes — a regeneration means redoing
  that much work.
  On a machine without mflux the tool fails with install instructions — fall back to
  `gpt_image_text2img` (quality "low") for that episode only.
- **Cover background (scene-1) = `gpt_image_text2img` (quality "high").** It's the thumbnail
  and the veo source, so the quality clause applies.
- **Any screen that has to contain text goes to `gpt_image_text2img`** whatever the scene —
  the local engine breaks Korean jamo (measured: "딸깍연구소" → "달닥연구소").

- **The cover background (scene-1) is this episode's meta image** — the cover frame becomes
  `cover.jpg` (the YouTube thumbnail and the first frame of the IG and FB videos) as-is. Not a
  metaphorical still life but **a photorealistic person scene where the topic is visible at a
  glance** (generated people only, Korean women by default — per the profile §3 target), at
  **`quality: "high"`**, framed at the cover shot's `shot.size`·`shot.angle` — `eye` unless the
  cover wrote a reason, since the hook cut is where the trust axis wins (directing-grammar §3).
  The `face not visible` negative direction is the one place it changes
  to `seen from behind, face turned away` (produce absolute rules 11 and 12).
  In episodes with an opening b-roll, this PNG doubles as the veo source — when the cover
  ends, that photo starts moving.
- **Pick still or video per scene — video is capped at 2 combined per episode** (user
  directive, 2026-08-14; the source of truth is scenes-schema §motion background). There are
  two forms and they count together:
  - **`broll`** — inserted between scenes. A stretch where only the picture moves and nothing
    is said (absolute rule 9 means that stretch uses the video's own audio, and using both
    slots cuts roughly 8 seconds out of the time spent delivering information).
  - **Motion background (`visual.video`)** — the scene itself as video. The storyboard's image
    for that scene becomes a parameter for a veo video laid under the background, and
    **narration, captions, and subtitles stay**. Use it on scenes where the background has to
    move while you talk — where the movement itself is the content.
    `duration` inside one clip (veo 8s · the default seedance 1.5 pro 4–12s,
    server-validated) · points only · not combined with per-line illustrations.
  Still is the default when still is enough — video buys cost and seam risk. **Backgrounds
  that become veo sources (scenes with b-roll attached, motion-background scenes) have to be
  photorealistic people made with `gpt_image_text2img` (high)**, not the local engine — blurry
  or peopleless, and those 8 seconds look like a still frame. The two b-roll slots need
  different `after` values.
- **Get the plan reviewed before any generation call** (produce absolute rule 13) — delegate
  the cover bgPrompt and every b-roll and motion-background scene to content-reviewer
  **plan mode** and generate only after `PLAN_REVIEW: PASS`. It's the last gate before calls
  that cost money (high images, veo).
- **points backgrounds are the star of the screen too** (produce absolute rule 14 — captions
  use only the top band, so the photo shows through). Make them **photorealistic topic shots**
  rather than metaphorical still lifes. **Assemble `bgPrompt` from the shot's fields**, don't
  prose a competing layout:

  ```bash
  SB=${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references
  node $SB/assemble-bg-prompt.js --from storyboard/scenes.js --shot <n> \
    --scene "<the scene content — who, where, what they are doing>" \
    --mood "<profile §3 mood>" \
    --exclude "no text, no logos, no signage, no readable characters, face not visible, no flags, no national emblems, no maps, no government buildings"
  # <n> counts from 1 — the strip's "Shot n", the same n as scene-<n>.png (--index is the raw
  # array position from 0). stdout is the whole bgPrompt. Exits 1 on left-view-of / allocentric
  # / metres anywhere in it (space slots, --scene, --mood, --exclude). Add --no-person on a still
  # with nobody in it, so the size words describe the subject instead of a body.
  ```

  The assembler writes size, angle, `From the camera: layout. facing. line. light.`, then the
  scene, the mood, the exclusions, then a fill-the-frame tail (directing-grammar §3.5).
  **Never** append `lower third fading into darkness` or any top/bottom letterbox instruction
  (owner 2026-08-25). The **mandatory negative directions** go in through `--exclude` — neither
  `gpt_image_text2img` nor `image_local_generate` has an exclusion argument, so the short noun
  list stays in the body as before; `veo_*` is the one call that takes `negativePrompt`. The
  cover background inherits the same assembly and the same exclusions, and swaps `face not
  visible` for `seen from behind, face turned away` in `facing`. Store the assembler's stdout
  as `visual.bgPrompt` — the whole string; a plain regeneration resends it as-is, and only a
  changed `shot` field makes produce rerun the assembler.
- Count is **1 cover (gpt high) + 3–6 points (local)** — reusing one image across every scene
  makes the body tens of seconds of the same still frame. Change the shot wherever the content
  axis turns, but keep continuity with a different angle on the same person and the same space.
  quote scenes need no background (speech clip or quotation card).
  **The long-form generated lane does this math differently** — making all 28–70 shots fresh
  takes hours even on the local engine, and gpt costs more than it's worth. Make **2–3
  backgrounds per chapter**, reuse them within that chapter through angle and crop, and change
  the setting when the chapter changes (the Ken Burns pan pulls two compositions out of one
  image). Even so, past 30 images, look again at whether this
  material belongs in the filmed lane.
- Regenerate if generated characters get stamped in — the moment it reads as a fake document
  or signboard it becomes factual distortion.
- When planning a b-roll scene, write per slot — as the scenes-schema `broll` contract requires
  — the **used length `duration` (4s by default) and the reason for it**, `after`, `src`,
  the camera slots and audio, and store the assembled final prompt in `visual.prompt`
  (§clip prompt — `--clip --engine veo`). Generation is fixed at 1080p and 8s (an API
  constraint), and produce trims it to the used length.
  Two slots using the same PNG means the same shot appears twice — specify a different source
  per slot.
- When planning a motion-background scene, store the assembled final prompt in
  `visual.video.prompt` (§clip prompt — `--clip --engine seedance`; English, and it never
  re-describes the layout the PNG drew — re-describing makes the model redesign it, same rule
  as produce §3). Write `visual.audio` anyway — the build discards the clip's sound, but the
  model composes a calmer clip when it isn't left to invent a soundtrack.

**Write one line into the cost ledger per call.** This episode's money starts going out here —
one cover costs $0.22, and produce may run days later in a different session. For it to add up
then, the ledger has to be in the topic directory. The source of truth for the convention is
[cost-tally.md](../autoproduce/references/cost-tally.md).

```bash
mkdir -p .work
# Write the call down right after generating — batching it later loses the regenerations
printf 'image.gpt-image-2.high\t1\tstoryboard: cover background scene-1\n' >> .work/cost-tally.tsv
printf 'image.local\t3\tstoryboard: points backgrounds scene-2~4\n'        >> .work/cost-tally.tsv
```

Log local images too — the unit price is 0 so the total doesn't move, but the report showing
how many went where is what separates "image cost 0" as a tallied result from a tallying gap.
The `quality` of `gpt_image_text2img` decides the key (`high`·`medium`·`low`).

**Write down the choices that could have gone another way**, in
`.work/decisions.tsv` — which engine a generated shot goes to and what you rejected, why the
points backgrounds went local, a route you took because the planned one was unreachable. The
ledger says what it cost; this says why. The convention is
[decision-log.md](../autoproduce/references/decision-log.md).

```bash
printf 'storyboard\tengine_selection\tmotion background shot 3\tseedance-1-5-pro-silent\tsilent slot, builder discards audio; rejected veo.lite (pays 8s for a 4s cut)\n' >> .work/decisions.tsv
printf 'storyboard\timage_engine\tpoints backgrounds\timage_local_generate\tno text in frame, $0; rejected gpt high (cost, not needed here)\n' >> .work/decisions.tsv
```

One line per decision, not per action. If the only honest reason is "the default, and nothing
argued against it", there was no decision to record.

### 5.5 Image context review (storyboard-reviewer image mode — one round)

content-reviewer plan mode looked at the plan before generation; here **the picture that came
out** gets looked at — "does this picture show what that scene is saying". The criterion is
right, not pretty.
**Shooting mode skips this review entirely** (the screen comes from the user's actual recording).

1. **Delegate to the storyboard-reviewer agent (Agent) in "image mode"** — pass every
   `images/scene-*.png` path plus `scenes.js` and `profile.md`, and the `narration[].img` paths
   in illustration mode. Say explicitly that slide scenes are out of scope — a missing
   `scene-N.png` there is not a defect (their screen arrives in §8). Read the tail
   `STORYBOARD_REVIEW: mode=image score=NN p0=N`.
2. **Remake only the images that were flagged**, leave the rest alone, then go to §6 and write
   storyboard.md once.
   - **Log regenerations in the §5 ledger too** — discarded images still get billed. Say so in
     the note (`storyboard: §5.5 regenerate scene-1`) and the report later reads back exactly
     what this review cost on that episode.
   - Engines follow the §5 split. Add only the correction directions on top of the original
     prompt and **don't re-describe it wholesale** — tearing it all up loses the elements that
     had passed.
   - **Don't put negative directions in the prompt body where an exclusion argument exists**
     — putting "no maps" in the body draws a map instead (measured: 4 out of 4 failed). Split
     negative nouns into `negativePrompt` for `veo_*` (the Veo prompt guide also marks the
     instruction form in the body as not recommended and advises listing noun phrases).
     `gpt_image_text2img` and `image_local_generate` have no such argument, so their list stays
     the short noun phrases `--exclude` writes (§5), and an element that keeps coming back is
     designed out of the scene sentence — the same move as for Seedance, which has no argument
     either.
   - **Props with text engraved on them can't be blocked with negative directions** (keyboards,
     calculators, signboards). Taking the object out of the composition is the answer.
   - **A regenerated image is not read again.** One round means one read — if the remake looks
     wrong to you, don't buy a third attempt; put it on the §7 screen and let the user look.
3. **Write down whatever you didn't remake**, for §7. This axis spends money on every attempt,
   so the user's judgment is the cheaper one.

### 6. Writing storyboard.md

Build the document a human reviews, in the `references/storyboard-template.md` structure —
under the scene head (`S#1. place / time`), a per-shot table (feel, size · angle, new
information, screen body, HTML staging, narration) with the generated images embedded via
`![scene-1](images/scene-1.png)`. Summarize and link research.md's key sources at the end.

**If there's even one filmed scene**, use a per-shot "screen" column instead of image embeds,
and additionally author `script.md` (the shooting script) in the
`references/shot-script-template.md` structure — the filming rules (film landscape, script on
the secondary display, enlarge app fonts, restart the same shot from the top) and per-shot
[file to save / screen / action / lines] blocks. **The user films by following this document
straight through** — what has to be on screen, what to operate, what to say, and which filename
to save it as have to sit together in one block. The lines get carried over from the scenes.js
narration (no maintaining two copies — scenes.js is the SoT).

For long-form mixed shooting, **render it with `references/make-script.js`** — don't copy
it over by hand (`node make-script.js <storyboard directory>`, re-run whenever the copy
changes). An all-live-voice episode (the default) carries **every shot** — filmed shots as
[file / screen / action / lines], generated and slide shots marked voice-only
(`voice/s<shot number>.wav`). There is sound for the user to record on every shot, which is
why. The "what to film today" table at the top lists both the footage files and the voice
files. Only a TTS episode carries filmed scenes alone — there the generated scenes have
nothing for the user to do, and including them blurs what has to be done.

**storyboard.html (the review render)** — copy `references/storyboard-html-template.html` into
storyboard/ and fill in **only the `<title>` and the `✎ SB_DOC` block**. Never write scene data
(title, lines, bullets, shot, duration, THEME) into the HTML — the document loads the SoT
directly with `<script src="./scenes.js">` and renders it, so fixing scenes.js updates the
document automatically and copy drift is structurally impossible. SB_DOC holds only editorial
metadata that isn't in scenes.js (core message, per-scene notes, transitions, audio directions,
privacy avoidance, source summary, platform plan, shooting prep, recheck list, **the cast**).

**Fill `SB_DOC.cost` by generating it, never by typing it.** The approval screen has to say
what has already been billed and what saying yes commits — by §7 the images are spent and every
generated-video slot is still free to delete, so that is the last moment the number can change
a decision.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
node $REF/cost-preview.js storyboard/ --sbdoc     # paste the block into SB_DOC
node $REF/cost-preview.js storyboard/             # the same numbers, human-readable
```

It reads the video slots out of scenes.js, writes the projection to `.work/cost-forecast.tsv`,
and totals both that and the `.work/cost-tally.tsv` ledger through `cost-report.sh` — one
calculator, one price table, so the estimate and the later bill can be compared. **Exit 1 means
the verdict is incomplete** (an unknown key or an unconfirmed price): fix the key or carry the
`!!` lines onto the approval screen as they are. Never present the totals as though they were
whole.

The block carries a fingerprint of the video slots, and the check strip recomputes it from the
live scenes — so a snapshot that no longer matches shows up as a violation instead of a stale
number. Regenerate it after any §7 change that adds, retimes, reroutes or moves a video slot.

**Fill `SB_DOC.characters` with the characters this episode actually uses** — the ids that appear
in any scene's `visual.character`, no more. One entry each: `id`, `name`, `role` (one line from
`identity.md`), `panels` (the panel paths relative to the storyboard directory —
`../../../assets/characters/<id>/face.png` and so on; list only files that exist), `note` (what
governs this character on screen — a veo ban, a fixed voice), and `veo` (`"banned"` when the
profile bans it, otherwise omitted). Leave the array out entirely and the document simply has no
cast section. `resolve-asset.py --list <channel dir>` prints the ids and paths.

The document shows four things.

- **Shot cards** — one `SCENES[]` entry. The header carries the role, the size and the angle,
  the **beat** (cover · hooking · result · body · turn · CTA — plus the opening-strategy,
  hook-form and arc name tags on the cover card) and the **two production-layer badges** (screen body = still photo / AI video /
  recording / shared asset, on-screen = HTML reveal · captions · typing / none); under it the
  **feel line** (what the audience should feel) and the info line (what it newly tells). Entries
  sharing `scene` are grouped into a scene band (`S#1. place / time`). The last main shot
  isn't stamped PAYOFF. Channel color means AI video; an outline-only badge means HTML
  staging. Don't merge them into one badge.
- **Scene-frame rows** — one reveal (the moment text appears within the same shot) is one row.
  Not one shot. A 9:16 frame on the left, the text and lines of that moment on the right.
  Background, motion, and prompt go in the shot metadata below the row. The timeline slots are
  shots, and b-roll plugs into the playback position `after` sets.
- **The cast section** — the characters in `SB_DOC.characters`, each with its panels (face,
  body, back), the line that governs it, and the shots it appears in (read off `visual.character`).
  It's reachable from the menu at the top, and it's where a reviewer checks that the reference
  set going into generation is the right one before any money is spent.
- **The cost panel** — what the episode has already billed (images, from the ledger) beside what
  approving it commits (the generated-video slots, priced per shot). It draws only when
  `SB_DOC.cost` is filled, and it flags itself when the snapshot no longer matches the scenes.
- **The contract check strip** — violations collected in one place at the top of the document.
  On top of character counts, speech rate, scene length, total length, and cover title, it
  measures **frame overflow** and **hero stat width** the same way produce does (1080px canvas
  · 3-step shrink · 640px guard), and it also catches the b-roll contract (no narration, 8s or
  under, same src as the cover background, `after` pointing at a real scene), missing scene
  length, missing `tts`, unrecorded outro length, unfilled `{{…}}` in SB_DOC, **playback order**
  (the cover's arc — answer-first cover → hooking → result → body, story cover → hooking →
  body → turn → result; a warning when there's no hooking shot or the shot after
  the cover isn't hooking; on answer-first a violation when body comes before result, on
  story when result comes before body or the turn), **opening strategy**
  (a warning when the cover has no `hookType` or a value outside the four), **hook form** (no
  `hookForm`, or one outside the six), and the **shot grammar** (a shot with no `shot.feel`, a
  `shot.size`/`shot.angle` outside the vocabulary, a second `cu`/`choker`/`ecu` in one scene, a
  third `choker`/`ecu` in the episode, a second `dutch`, a close-up opening not paid back by the
  next shot, a generated still with no `shot.space.layout`, camera-inference or metres in the
  prompt — directing-grammar §3.5 · §6 · §8). This is where text
  clipping and contract violations get filtered out before production — though it shares
  produce's blind spot, so text pushed **upward** isn't caught (only downward overflow is
  measured).

Use this document as the default when presenting for approval. The text zones and the subtitle
toggle are at the head of the shot composition section.

### 7. HITL approval gate

Present the storyboard with AskUserQuestion — the **format** (short-form 9:16 / long-form 16:9),
the storyboard.md and storyboard.html paths (opening the HTML in a browser shows the check
badges too), shot count and expected total length, the cover title, key figures and sources.
For long-form, also say **the chapter list and that the safe area is provisional** (§1.5).
If there are filmed scenes, show **the `script.md` path and how many files have to be filmed** —
approval is the start of filming, so the user needs to know what and how many from this screen.
If there are slide scenes, show **how many scenes are slides and each one's `plan` line** —
what's being approved is that plan, and the files get built in §8 afterwards.
**Carry the results of the six reviews here too** — one score each for copy, per-scene,
vocabulary, camera, sound, and images, with **which scene or shot was lowest and at what score**
for the three per-item ones, and **every finding you didn't apply, in the reviewer's own words**.
That last list is the point of the screen: the reviews no longer block, so this is where a
defect gets its only human look. **Say the money out loud too** — regenerate `SB_DOC.cost` (§6)
and put both numbers on the screen: what this episode has already billed, and what approving it
commits in generated video, per slot. Approval is the last point where deleting a b-roll is free;
after it the slot is an API call. If the preview came back exit 1, say the verdict is incomplete
and show the `!!` lines rather than a total that looks whole. **Show the decisions behind those
numbers too** — `decisions.sh .work/decisions.tsv` — so the engine and tier choices are approved
with everything else rather than discovered in the bill. **The loop ledger comes up here too** — every curiosity
loop and deliberate plant opened in the episode, each named with the scene that pays it
(scenario-craft §3·§5 direct the pairs to this note). A pair with no payer on this screen
is the last cheap place to catch an unkept promise. The options:
[Approve — proceed to production / Request changes / Hold the topic]. **Don't move to produce
without approval.**
For a change request, apply it and present again. **A user-requested change may be re-read by
the one review that covers it** — §4.5 for sentence structure, §4.6 for scenes added or removed,
§4.7 for word swaps, §4.8 for camera slots, §4.9 for sound, §5.5 for remade images. That is the
one place a mode runs twice, and it runs because a person asked, not because a score fell short.
Once approved, write two lines at the top of scenes.js — `// approved: <YYYY-MM-DD>` and
`// review: text=NN scene=NN lexicon=NN camera=NN sound=NN image=NN unresolved=N` — and point
the user at `/social-flow:produce <channel> <topic>`, so you can trace later which score of copy
produced which performance. `unresolved` is how many findings went to the user unfixed; `n/a`
goes in any slot whose review didn't run (image in shooting mode — camera runs on every episode,
since it reads the feel, size and angle of stills and filmed shots too).

**If there are filmed scenes**, the hand-off after approval is recording. It differs by lane.

- **Short-form whole-episode shoot** — `/social-flow:ingest <channel> record <topic>` (put
  script.md on the secondary display and shoot it in one go). Once recording and alignment
  finish, produce builds the video through the editing pipeline.
- **Long-form mixed** — the user films **scene by scene** per the "what to film today" table in
  `script.md` and saves each into `data/<channel>/episodes/<topic>/footage/` under that
  filename (on an all-live-voice episode the same table also lists the `voice/s<n>.wav` files
  for the voice-only shots). No ingest alignment step (the filename is the alignment). When
  all the files are there, `/social-flow:produce <channel> <topic>` joins the filmed and
  generated scenes into one timeline. **Show the list of files to film on the approval screen
  as-is** — the user uses that list as a checklist.
  **If there are slide scenes, go straight to §8 after approval** — authoring the slides while
  the user records means both jobs run at once and neither waits on the other.

### 8. Slide authoring (after approval · only on episodes with slide scenes)

Build the per-scene HTML slides from the approved storyboard's `plan` and `labels`. Every copy
gate has already passed, so no new text gets written here — **every character on a slide comes
from scenes.js** (`title`, `bullets`, `slide.labels`). Plant a new Korean string here and text
that never passed the style gate goes on screen.

1. **Per scene**, copy `references/slide-template.html` to `slides/<the visual.slide.file name>`,
   change `SLIDE_SHOT` to that shot's number (its array position), and rewrite only
   `renderSlide()` into that scene's diagram. Keep the determinism contract at the head of the
   template — no CSS animations or transitions, no web fonts, no `Math.random` / `Date`. All the
   motion there is comes from the builder's xfade.
2. **Assign reveal groups 1:1 with the narration segments** (group 0 = the base skeleton). Only
   scenes using sub-reveals (`A|B`) have more groups than segments.
3. **Machine check** — `node references/check-slide.js <storyboard directory>` verifies the
   three-way match between filename, `SLIDE_SHOT`, and scenes.js, catches Korean literals absent
   from scenes.js, and catches determinism violations. Don't move on unless it exits 0.
4. **Self-verify the state capture** — enumerate the states for each scene.

   ```bash
   REF=${CLAUDE_PLUGIN_ROOT}/skills/produce/references
   CAP_W=1920 CAP_H=1080 $REF/capture-reveals.sh <shot number - 1> \
     "file://$PWD/slides/s<shot number>-<slug>.html" .work/slide-check/a<shot number - 1>r 0
   ```

   If the state count differs from **segment count + sub-reveal count + 1** (group 0 included),
   the rg assignment is wrong — produce's "missing reveal state" gate checks the same thing again
   at build time. Open the last state PNG and confirm by eye that every `labels` entry is
   visible and that the text sits inside the zone (clear of the 285px subtitle band at the bottom).
5. Slides are captured locally, so they cost nothing — there's nothing to write in the ledger
   (`.work/cost-tally.tsv`), and the absence of a generation call is itself the record.

When that's done you're waiting — once the user's `footage/` and `voice/` files arrive, produce
uses the slide state captures as the segment visuals (produce §3.6).

## Traps

- **Don't skip a review because you think the copy is fine** — whoever is running the skill
  doesn't get to read their own sentences and call it good. The AI tells in your own writing are
  the ones you see least, and the review costs one delegation. Six run, every episode.
- **Don't delegate the same mode twice to chase a number.** One round is the contract. A second
  round happens only when the user asks for a change at §7 and that change lands in that mode's
  layer. Re-delegating on your own judgment brings back the loop this skill just dropped.
- **Don't reorder the six** — copy (§4.5) → per-scene (§4.6) → vocabulary (§4.7) → camera (§4.8)
  → sound (§4.9) → images (§5.5). Images are last because changing a sentence changes the picture
  that scene will show; vocabulary comes after per-scene because polishing the words of a scene
  that's about to be dropped is wasted work; camera and sound come after the scenes are settled
  because a shot that gets merged away takes its camera block with it.
- **The score at the per-scene, vocabulary, and camera reviews is the lowest one, not the
  average** — the tail's `score` is the lowest item's score. Don't read it as "average 96, fine".
- **A score is a record, not permission.** Nothing in §4 or §5 stops on a number. The only stop
  in this skill is the user at §7, so a finding you decided not to apply has to reach that
  screen in writing — dropping it silently removes the last look anyone gives it.
- **Don't open scenes.js while still searching** — research is a step with an exit (§2: the
  question map, two-direction searches, counter-evidence and freshness, the sufficiency check),
  and a scene written before it closes bends the facts to the sentence. The hook in particular
  is a promise, and a promise made before the research is a promise you don't yet know you can
  keep — which is the early-exit trap the platform punishes (user-relayed, 2026-08-23 —
  field-practice grade; §4's short-form principles carry the same tag).
- **Don't write the feel after the camera** — a `shot.feel` fitted to a move already chosen is a
  caption, not a decision, and the camera review reads it as unset. Feel, then size and angle,
  then space, then (on a generated shot) the move and the length. "Cinematic" and "dynamic" aren't feelings
  — they're a request for a move with the reason left out.
- **Don't ask the image model to infer a camera seat.** `left view of X`, `from the car's right
  door`, and `1.5 m apart` are the three forms that fail (directing-grammar §3.5). Write the
  visible result in `shot.space` and run the assembler. A motion prompt that re-describes the
  sides the still already drew redesigns the scene.
- **scenes.js isn't a living file** — after approval it's the settled version produce consumes.
  To change it during production, start from a storyboard revision and re-approval.
- **A range stays a range** — don't shrink a numeric range to its upper bound alone (this has
  actually happened).
- **No national symbols in images** — flags, national emblems, maps, government buildings, and
  people in uniform don't get generated without prior approval.
- SerpApi counts 1 search = 1 credit (250/month free) — prefer naver_search (25,000/day) and
  WebSearch, and spend serp only on precision searches.

## Additional Resources

### Reference Files

- **`references/scenes-schema.md`** — the full scenes.js data contract (fields by type, narration segments, verification checklist)
- **`references/directing-grammar.md`** — feel → technique (SoT): what the audience should feel on each shot, and the size, angle, frame space, move, cut length and sound that serve it · the size ladder with cut lines, phone distances and matching sound · angle rules (the subject's eyes as baseline, angle as change, the dutch fee) · frame space (§3.5 — camera frame, visible result, no metres) · the move table with the feel each serves · rationing across shots · the 180° and 30° rules for filmed shots. Engine vocabulary stays in `../produce/references/video-model-selection.md` §Camera
- **`references/assemble-bg-prompt.js`** — writes `bgPrompt` from `shot.size` · `shot.angle` · `shot.space` (`--from scenes.js --shot <n>`, n from 1) plus `--scene`·`--mood`·`--exclude`; `--space-only` gives a quote clip its `From the camera: …` sentence; `--no-person` swaps the size ladder for a still with nobody in it; `--check` exits 1 on camera-inference / allocentric / metric language. storyboard §5 runs it before the generation call. `--selftest` pins the banned-language checks and fails if the HTML template's copy of the three regexes drifts
- **`references/storyboard-template.md`** — the standard storyboard.md structure + the research.md table format
- **`references/storyboard-html-template.html`** — the storyboard.html render template — loads scenes.js dynamically and shows contract checks automatically; fill in only the `✎ SB_DOC` block
- **`references/shot-script-template.md`** — shooting mode only: the script.md (shooting script) structure + filming rules + the scenes.js variant contract
- **`references/make-script.js`** — the long-form script.md renderer — builds the shooting script from scenes.js (never maintain two copies). All shots on an all-live-voice episode, filmed scenes only on a TTS episode
- **`references/slide-template.html`** — the §8 slide-scene render template — the `?reveal=k` reveal contract + the determinism contract; change only `SLIDE_SHOT` and `renderSlide()`
- **`references/check-slide.js`** — the §8 slide machine check — filename↔scenes.js match, Korean literals outside the SoT, determinism violations
- **`../autoproduce/references/cost-tally.md`** — the episode cost-ledger convention (where §5 and §5.5 write, the line format, the units). The source of truth for unit prices is `prices.tsv` in the same directory
- **`../autoproduce/references/episode-state.js`** — derives where an episode stands (drafted · approved · produced · published), what to run next, and what the directory promised and hasn't delivered. No state file — it reads what the skills already write. `--all` sweeps a channel, `--json` for tooling
- **`../autoproduce/references/decision-log.md`** — the episode decision log convention (`.work/decisions.tsv`): what was chosen, what was rejected, and how a change of mind is appended rather than overwritten. Read it back with `decisions.sh`
- **`../autoproduce/references/cost-preview.js`** — the §6·§7 approval-screen preview: totals the ledger, prices the generated-video slots out of scenes.js, writes `.work/cost-forecast.tsv`, and emits the `SB_DOC.cost` block (`--sbdoc`) or JSON (`--json`). `--selftest` pins the routing table and the fingerprint copy the HTML template carries

### Delegated agents

- **`storyboard-reviewer`** — six modes, one round each. §4.5 copy mode (AI tells, hook, factual
  fidelity) · §4.6 scene mode (per-scene role and contextual fit) · §4.7 lexicon mode (are the
  words words people use) · §4.8 camera mode (the shot grammar — feel · size · angle · space of every
  shot, plus the four slots, cut length, engine fit of generated shots) · §4.9
  sound mode (clip audio, voice casting, where the sound gets out of the way) · §5.5 image mode
  (scene content against the picture's contextual fit). None of them is a pass/fail gate — each
  returns a score and its findings, and scene, lexicon, and camera mode report **the lowest
  item**. `agents/storyboard-reviewer.md` is the source of truth for the rubric, the P0 list, and
  the tail format
- **`content-reviewer` plan mode** — prompt verification right before the §5 generation calls
  (`PLAN_REVIEW`). It looks at something different from storyboard-reviewer image mode — this
  one is the prompt, that one is the output
