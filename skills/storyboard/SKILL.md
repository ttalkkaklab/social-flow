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
  exact filename to save it as, so the user can just follow it. Four adversarial
  convergence loops run before approval — the storyboard-reviewer agent scores the copy as
  a whole (AI-sounding phrasing, hook, factual fidelity), then every single scene for
  quality and contextual fit, then the word choice of every narration and title for
  human-sounding vocabulary, and finally the generated images (do they match what each
  scene actually says). The per-scene loops pass only when the LOWEST-scoring scene clears
  95, and the storyboard reaches HITL approval only once all four score ≥95 with zero P0
  defects.
argument-hint: "<channel> <topic or topic hint>"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "Agent", "AskUserQuestion", "WebSearch", "WebFetch", "mcp__social-flow__naver_search", "mcp__social-flow__serp_web_search", "mcp__social-flow__serp_news_search", "mcp__social-flow__serp_naver_search", "mcp__social-flow__serp_image_search", "mcp__social-flow__datago_search", "mcp__social-flow__datago_detail", "mcp__social-flow__datago_file_download", "mcp__social-flow__datago_file_fetch", "mcp__social-flow__datago_api_call", "mcp__social-flow__image_local_generate", "mcp__social-flow__gpt_image_text2img"]
---

# Storyboard authoring — data/[channel]/episodes/[topic]/storyboard/

Takes one topic through **research → scene design → copy convergence → per-scene
convergence → vocabulary convergence → image generation → image convergence →
storyboard approval**. The `scenes.js` settled here is the one data source (SoT) for
production (produce) — video, captions, and per-platform text all derive from this file,
so factual mismatch between platforms can't arise in the first place.

Before approval the adversarial reviewer (`storyboard-reviewer`) blocks four times.

| Gate | What it looks at | Pass bar |
|---|---|---|
| §4.5 copy | The sentences of the whole storyboard — AI-sounding phrasing, hook, factual fidelity | total ≥95 · P0 0 |
| §4.6 per-scene | The role and contextual fit of **each individual scene** | **lowest scene** ≥95 · P0 0 |
| §4.7 vocabulary | Whether the **words** in narration and titles are words people use | **lowest scene** ≥95 · P0 0 |
| §5.5 images | Whether the picture shows what the scene is saying | total ≥95 · P0 0 |

The two per-scene gates take **the lowest scene** rather than the average for one reason —
an average lets good scenes hide the one that collapsed. It amounts to a machine trying to
refute the work before a person looks at it, and all four gates have to fall before the
user-approval step.

```
data/<channel>/episodes/<topic slug>/storyboard/
├── research.md      # evidence, sources, cross-check log (skipped on channels that skip research)
├── storyboard.md    # the human-readable storyboard — shot tables + embedded images
├── storyboard.html  # review render — loads scenes.js directly and draws it (template-based, §6)
├── scenes.js        # the machine-readable SoT — THEME + SCENES (+ narration segments)
├── images/          # per-scene 9:16 generated images (scene-<n>.png) — omitted in shooting mode
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
chapters) and the §5 image size; the procedure of the four convergence loops (§4.5–§5.5)
stays the same.

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

If even one filmed scene exists, §6 authors **`script.md` (the shooting script)** and the
hand-off after approval is filming (§7). The contract is `references/scenes-schema.md`
§filmed scenes; `references/shot-script-template.md` is the source of truth for the
document structure.

### 2. Research and fact-checking (follows profile §5 policy)

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
- Record in `research.md`: a table of source link, check date, and verification status per
  key claim. Channels that skip research (creative, everyday life) skip this whole step.

### 3. Create the topic directory

Make `data/<channel>/episodes/<topic slug>/storyboard/images/` using the profile §7 slug
rule. Topics don't live at the channel root — they go under `episodes/`, the same level as
`assets/` and `growth/`. If it already exists, ask the user whether to continue from it
(revising the existing storyboard).

### 4. Scene design — writing scenes.js

Write it to the contract in `references/scenes-schema.md`. Keep the array name (`SCENES`);
one entry is a **shot**. Group the same place and time with `scene`+`sceneSlug`, and write
`sequence` only when purposes diverge. Per shot, write `shot.size`, `shot.info`, and
`visual.picture` (still photo / AI video / recording / shared asset) plus `visual.overlay`
(HTML staging / none) — one shot can have both. A cover laying an HTML reveal over a still
photo is the default. The source of truth for field definitions is the schema's §grammar
units and production layers.

Core rules:

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

- **In long-form, decide per scene whether to film or generate it** (§1.6). There's one
  criterion — **if the evidence is on screen, film it; if it needs explaining, make it.**
  A generated picture can't stand in for an install actually completing, a result running
  on screen, or the moment a hand touches something. Conversely, a beat like "why is this
  fast" has no screen to film in the first place.
  Filmed scenes get `visual.clip` (filename), `shot` (what's visible), and `action` (what
  you do), and the filename follows the **`footage/s<scene number>-<slug>.mp4`** convention
  set by the storyboard — the user doesn't pick names. Whether the live voice carries the
  sound or narration covers it is decided here too (live voice means `narration: []`). The
  full text is scenes-schema §filmed scenes.
- **Long-form spreads one result across chapters over one episode; it isn't several
  short-form episodes stitched together.** A different topic per chapter makes a playlist,
  not an episode. The skeleton of cover → hooking → result → body is the same regardless of
  format; long-form just has that "body" split into chapters and running longer.
- **Playback order is cover → hooking → result → body.** Cover and hooking exist in every
  episode, and the result scene isn't left out of builds, tutorials, or before/after
  comparisons. The cover shows the finished thing at a glance, hooking hooks why it's
  needed, and **the result scene comes before the method and steps**. The body (how it was
  made) unspools only after the finished thing has been seen. Write a `beat` on each shot —
  `hook` · `hooking` · `result` · `body` · `cta`. The source of truth is scenes-schema
  §playback order.
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
- **The shot after the cover is hooking — informational episodes included.** If the cover
  stopped the thumb, hooking carries the stopped person to the result. The contract has four
  parts — **catch** what the cover threw (same subject, same promise; don't drift to new
  material), **hook** the viewer's problem, loss, or gain **with the viewer as the subject**
  (problem/harm = empathy / loss/risk = fear / unresolved tension = curiosity /
  resolve/criteria = declaration — continue the strategy the cover picked), **don't unpack**
  the answer, the method, or the finished thing (it makes what follows a rerun), and be
  **short** (short-form 1–3 shots · 4–15s, with the result or first body scene inside 20s
  counting from the cover). Don't fill it with greetings, self-introduction, channel
  introduction, or a "today we'll look at ~" trailer — the speaker-report-opening P0 applies
  to the first hooking segment too. The source of truth is scenes-schema §hooking; the
  evidence is [hooking research](../../docs/research/2026-08-18-hooking-beat/).
- **Result revealed in the first second**: the cover's first frame is the finished screen or
  the working result. The cover's first line says what benefit or change that result gives
  the viewer (showing the ending, of the four). Greetings, background, tool definitions, and
  "I tried it" get cut or moved behind hooking. The cover's glance and the result scene's
  unfolding point at the same artifact.
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

#### Turning channel measurements into story structure

If you can read `grow-youtube` output or YouTube Analytics records, settle each of the
following in one line before authoring and write it into the `storyboard.md` design rationale
and `SB_DOC.seriesNote`.

1. **A stopping problem** — if `stayed to watch` is low, change the first frame and the first
   line. Don't substitute a harder CTA for it.
2. **An interest problem** — if engaged views are low against raw views, cut explanation and
   pull the moment of reaching the result earlier.
3. **Conversion clues** — use the topic, result, and form of the video that produced
   subscribers as the common axis of the next 3–5 episodes. Don't clone a format that had
   high views and no subscribers.
   Conversely, when the early pass-through and retention are good but views alone are low,
   the problem is the title angle, not the form — reopen on a felt problem rather than a
   method or tool (platform-playbook §1 ②).
4. **The next promise** — write this episode's result and the next episode's result as one
   sentence each. If the two don't connect, it isn't a series, just one-offs on similar
   topics.

### 4.5 Copy convergence loop (storyboard-reviewer copy mode, target score ≥95 AND p0 = 0)

**Get the sentences through before making any images** — when the copy changes, so does the
picture that scene will show, so reversing the order means throwing away images you made.
**Hard cap 5 rounds**:

1. **Delegate to the storyboard-reviewer agent (Agent) in "copy mode"** — pass the paths to
   `scenes.js`, `research.md` (if present), and `profile.md`, plus unresolved findings from
   the previous round. Parse the verdict tail
   `STORYBOARD_REVIEW: mode=text score=NN p0=N verdict=PASS|FAIL`.
2. **PASS (score ≥95 and p0 = 0)** → on to §4.6.
3. **FAIL** → fix `scenes.js` as directed and delegate again.
   - **Only subtract** — don't plant metaphors or stock phrases that weren't in the original
     while erasing AI tells. The moment you add one, that's the new AI tell.
   - Don't paper over factual findings (P0-3, P0-4) by smoothing the sentence. Go back to
     research.md, recheck the evidence, and if there is none, drop the claim.
   - If the same finding repeats twice in a row, rewrite that scene — polishing the same
     sentence over and over just hardens the rhythm into something more mechanical.
4. On hitting the hard cap, carry **the highest-scoring version + the unresolved findings**
   into the §7 approval gate as they are and let the user judge. Don't dress up the score to
   force a pass.

**Shooting mode runs this loop too** — the lines are what the user reads aloud, so AI tells
are louder there.

### 4.6 Per-scene quality and context convergence loop (storyboard-reviewer scene mode, **every scene** ≥95 AND p0 = 0)

Where §4.5 looked at the storyboard as one lump, here **each scene is scored on its own.**
Storyboards where the overall average looks fine but one scene has collapsed do happen — the
average lets a 100-point scene hide a 90-point one. So this loop's pass bar isn't the average
but **the lowest scene's score**. There are two axes.

- **Quality** — does that scene do its job. The cover says what the story is about within 3
  seconds and **also gives a reason to stay** (segment ① carries whichever of fear, empathy,
  curiosity, or showing the ending is written in `hookType` — scenes-schema §the four opening
  strategies); hooking catches what the cover threw, hooks it with the viewer as the subject,
  and doesn't unpack the answer (§hooking); the result scene unfolds the finished thing; and
  body scenes say only how that result was made. points gives one message per screen, and
  quote says something that could plausibly come out of that person's mouth.
- **Contextual fit** — is there a reason for that scene to be here. Does it catch what the
  previous scene threw and open the next one, does the result come before the body in build
  content, is the premise something the profile §3 target will follow, and which entry in
  research.md does that claim hang on.

**Hard cap 5 rounds**:

1. **Delegate to the storyboard-reviewer agent (Agent) in "scene mode"** — pass the paths to
   `scenes.js`, `research.md` (if present), and `profile.md`, plus unresolved findings from
   the previous round. Parse the verdict tail
   `STORYBOARD_REVIEW: mode=scene score=NN p0=N worst=<scene number> verdict=PASS|FAIL`.
   **`score` is the lowest scene's score**, so ≥95 means every scene is at 95 or above.
2. **PASS (score ≥95 and p0 = 0)** → on to §4.7.
3. **FAIL** → start with the `worst` scene. Touch only the scenes below the bar; leave the
   ones that passed alone.
   - **A finding that says the role is empty can't be fixed by smoothing sentences** — if the
     video still stands with that scene gone, merge or drop it. When the scene count drops,
     stretch the remaining scenes to keep the total length.
   - For a broken-flow finding, suspect **the order around it**, not the scene itself. An
     arrangement that still makes sense when reordered had no flow to begin with. If, in
     build content, the method explanation sits before the finished thing, don't fix the
     sentences — move the result scene forward.
   - If you rewrote a scene or changed the order, **get through §4.5 again** before returning
     to this loop (the sentences changed).
4. On hitting the hard cap, carry **the lowest scene, its score, and the unresolved findings**
   into the §7 approval gate as they are.

### 4.7 Vocabulary convergence loop (storyboard-reviewer lexicon mode, **every scene** ≥95 AND p0 = 0)

Once the scene structure is settled, look **only at the words** — are the words used in
narration and titles words people actually use. Structure and rhythm were §4.5's job, role
and flow were §4.6's, so this loop stays at the vocabulary layer. Carrying the same meaning,
"제출 기한이 도래합니다" and "이날까지 안 내면 늦어요" are different writing, and the place a
viewer smells AI is usually the words.

What it looks at: hard Sino-Korean words and unexplained jargon, translationese
(`~를 통해`·`~에 있어서`·`수행합니다`), written-only vocabulary and report-style stative
verbs (korean-style §D8, §D9), AI stock phrases, over-repetition of the same word, and words
the profile §3 target doesn't use.

**Hard cap 5 rounds**:

1. **Delegate to the storyboard-reviewer agent (Agent) in "lexicon mode"** — pass `scenes.js`,
   `profile.md`, and unresolved findings from the previous round. Parse the verdict tail
   `STORYBOARD_REVIEW: mode=lexicon score=NN p0=N worst=<scene number> verdict=PASS|FAIL`.
   Here too, **`score` is the lowest scene's score**.
2. **PASS (score ≥95 and p0 = 0)** → on to §5.
3. **FAIL** → **only swap** the words that were flagged.
   - **Don't rewrite sentences** — if vocabulary fixing spreads into rewriting sentences, the
     structure §4.5 and §4.6 signed off on falls apart and both loops have to run again. Only
     when swapping a single word won't do do you touch that sentence, and when you do, say so
     in the next round's delegation.
   - **Only subtract.** Planting a metaphor or stock phrase that wasn't there while erasing a
     hard word is a new AI tell (same rule as the copy loop).
   - Don't touch figures, proper nouns, or `tts` phonetic spellings.
4. On hitting the hard cap, carry the lowest scene and unresolved findings into the §7
   approval gate.

**Shooting mode runs §4.6 and §4.7 too** — the user reads the script aloud, so the words
land louder. Only the image axis (§5, §5.5) is skipped.

### 5. Generate scene images (skipped in shooting mode)

Generate the per-scene background image **at the size the format sets** and save it to
`images/scene-<n>.png`. Don't memorize the sizes — read them from the preset.

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
  **`quality: "high"`**. The `face not visible` negative direction is the one place it changes
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
    `duration` ≤ 8s · points only · not combined with per-line illustrations.
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
  rather than metaphorical still lifes, and attach the profile §3 mood description + the
  **mandatory negative directions** ("no text, no logos, no signage, no readable characters,
  face not visible, no flags, no national emblems, no maps, no government buildings") +
  "lower third fading into darkness" (a bright bottom makes subtitles unreadable). The cover
  background inherits the same mood, negative directions, and lower third.
- Count is **1 cover (gpt high) + 3–6 points (local)** — reusing one image across every scene
  makes the body tens of seconds of the same still frame. Change the shot wherever the content
  axis turns, but keep continuity with a different angle on the same person and the same space.
  quote scenes need no background (speech clip or quotation card).
  **The long-form generated lane does this math differently** — making all 28–70 shots fresh
  takes hours even on the local engine, and gpt costs more than it's worth. Make **2–3
  backgrounds per chapter**, reuse them within that chapter through angle and crop, and change
  the setting when the chapter changes (the Ken Burns pan is enabled in landscape, so you can
  pull two compositions out of one image). Even so, past 30 images, look again at whether this
  material belongs in the filmed lane.
- Regenerate if generated characters get stamped in — the moment it reads as a fake document
  or signboard it becomes factual distortion.
- When planning a b-roll scene, write per slot — as the scenes-schema `broll` contract requires
  — the **used length `duration` (4s by default) and the reason for it**, `after`, `src`,
  motion (in English), and audio directions. Generation is fixed at 1080p and 8s (an API
  constraint), and produce trims it to the used length.
  Two slots using the same PNG means the same shot appears twice — specify a different source
  per slot.
- When planning a motion-background scene, write **English motion only** into
  `visual.video.prompt` (re-describing the scene makes the model redesign it — same rule as
  produce §3). The clip's audio isn't used in the build, so audio directions are optional.

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

### 5.5 Image context convergence loop (storyboard-reviewer image mode, target score ≥95 AND p0 = 0)

content-reviewer plan mode looked at the plan before generation; here **the picture that came
out** gets looked at — "does this picture show what that scene is saying". The criterion is
right, not pretty.
**Shooting mode skips this loop entirely** (the screen comes from the user's actual recording).
**Hard cap 3 rounds** — regeneration costs minutes per image even locally, and gpt high costs
money.

1. **Delegate to the storyboard-reviewer agent (Agent) in "image mode"** — pass every
   `images/scene-*.png` path plus `scenes.js` and `profile.md`, the `narration[].img` paths in
   illustration mode, and unresolved findings from the previous round. Parse the verdict tail
   `STORYBOARD_REVIEW: mode=image score=NN p0=N verdict=PASS|FAIL`.
2. **PASS (score ≥95 and p0 = 0)** → on to §6. Write storyboard.md once, with the images that
   passed (writing the document during the loop means redoing it every round).
3. **FAIL** → remake only the images that were flagged. Leave the ones that passed alone.
   - **Log regenerations in the §5 ledger too** — discarded images still get billed. Putting
     the round number in the note (`storyboard: §5.5 regenerate scene-1 (round 2)`) means the
     report later reads back exactly how much this loop spent on that episode.
   - Engines follow the §5 split. Add only the correction directions on top of the original
     prompt and **don't re-describe it wholesale** — tearing it all up loses the elements that
     had passed.
   - **Don't put negative directions in the prompt body** — putting "no maps" in the body
     draws a map instead (measured: 4 out of 4 failed). Split negative nouns into the
     exclusion-only argument — `--negative-prompt` for local images, `negativePrompt` for
     `veo_*`. The Veo prompt guide also marks the instruction form in the body as not
     recommended and advises listing noun phrases. Seedance has no such argument, so avoid it
     by changing the scene description itself.
   - **Props with text engraved on them can't be blocked with negative directions** (keyboards,
     calculators, signboards). Taking the object out of the composition is the answer.
   - If the same finding repeats twice in a row, change the scene's material — don't buy the
     same failure a third time by polishing the same prompt.
4. On hitting the hard cap, carry **the highest-scoring version + the unresolved findings** into
   the §7 approval gate as they are. It's an axis that keeps spending money, so getting the
   user's judgment here is cheaper.

### 6. Writing storyboard.md

Build the document a human reviews, in the `references/storyboard-template.md` structure —
under the scene head (`S#1. place / time`), a per-shot table (size, new information, screen
body, HTML staging, narration) with the generated images embedded via
`![scene-1](images/scene-1.png)`. Summarize and link research.md's key sources at the end.

**If there's even one filmed scene**, use a per-shot "screen" column instead of image embeds,
and additionally author `script.md` (the shooting script) in the
`references/shot-script-template.md` structure — the filming rules (film landscape, script on
the secondary display, enlarge app fonts, restart the same shot from the top) and per-shot
[file to save / screen / action / lines] blocks. **The user films by following this document
straight through** — what has to be on screen, what to operate, what to say, and which filename
to save it as have to sit together in one block. The lines get carried over from the scenes.js
narration (no maintaining two copies — scenes.js is the SoT).

For long-form mixed shooting, carry **only the filmed scenes** and put a "what to film today"
table (filename, scene, what to film, target length) at the top. Generated scenes have nothing
for the user to film, so they don't go in the script — putting them in blurs what has to be
done.

**storyboard.html (the review render)** — copy `references/storyboard-html-template.html` into
storyboard/ and fill in **only the `<title>` and the `✎ SB_DOC` block**. Never write scene data
(title, lines, bullets, shot, duration, THEME) into the HTML — the document loads the SoT
directly with `<script src="./scenes.js">` and renders it, so fixing scenes.js updates the
document automatically and copy drift is structurally impossible. SB_DOC holds only editorial
metadata that isn't in scenes.js (core message, per-scene notes, transitions, audio directions,
privacy avoidance, source summary, platform plan, shooting prep, recheck list).

The document shows three things.

- **Shot cards** — one `SCENES[]` entry. The header carries the role, the size, the **beat**
  (cover · hooking · result · body · CTA — plus the opening-strategy name tag on the cover
  card) and the **two production-layer badges** (screen body = still photo / AI video /
  recording / shared asset, on-screen = HTML reveal · captions · typing / none). Entries
  sharing `scene` are grouped into a scene band (`S#1. place / time`). The last main shot
  isn't stamped PAYOFF. Channel color means AI video; an outline-only badge means HTML
  staging. Don't merge them into one badge.
- **Scene-frame rows** — one reveal (the moment text appears within the same shot) is one row.
  Not one shot. A 9:16 frame on the left, the text and lines of that moment on the right.
  Background, motion, and prompt go in the shot metadata below the row. The timeline slots are
  shots, and b-roll plugs into the playback position `after` sets.
- **The contract check strip** — violations collected in one place at the top of the document.
  On top of character counts, speech rate, scene length, total length, and cover title, it
  measures **frame overflow** and **hero stat width** the same way produce does (1080px canvas
  · 3-step shrink · 640px guard), and it also catches the b-roll contract (no narration, 8s or
  under, same src as the cover background, `after` pointing at a real scene), missing scene
  length, missing `tts`, unrecorded outro length, unfilled `{{…}}` in SB_DOC, **playback order**
  (cover → hooking → result → body — a warning when there's no hooking shot or the shot after
  the cover isn't hooking, a violation when body comes before result), and **opening strategy**
  (a warning when the cover has no `hookType` or a value outside the four). This is where text
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
**Carry the results of the four convergence loops here too** — the final score and round count
for copy, per-scene, vocabulary, and images each, with **which scene was lowest and at what
score** for the per-scene and vocabulary ones, and any unresolved findings as they are if a
hard cap was hit. The options:
[Approve — proceed to production / Request changes / Hold the topic]. **Don't move to produce
without approval.**
For a change request, apply it, **get the affected axis back through its gate**, and present
again — from §4.5 if you fixed sentence structure, from §4.6 if you added or removed scenes,
§4.7 if you only swapped words, §5.5 if you remade images (the re-presentation round starts the
hard cap over).
Once approved, write two lines at the top of scenes.js — `// approved: <YYYY-MM-DD>` and
`// review: text=NN(R rounds) scene=NN(R rounds) lexicon=NN(R rounds) image=NN(R rounds)` —
and point the user at `/social-flow:produce <channel> <topic>`, so you can trace later which
score of copy produced which performance.

**If there are filmed scenes**, the hand-off after approval is recording. It differs by lane.

- **Short-form whole-episode shoot** — `/social-flow:ingest <channel> record <topic>` (put
  script.md on the secondary display and shoot it in one go). Once recording and alignment
  finish, produce builds the video through the editing pipeline.
- **Long-form mixed** — the user films **scene by scene** per the "what to film today" table in
  `script.md` and saves each into `data/<channel>/episodes/<topic>/footage/` under that
  filename. No ingest alignment step (the filename is the alignment). When all the files are
  there, `/social-flow:produce <channel> <topic>` joins the filmed and generated scenes into one
  timeline. **Show the list of files to film on the approval screen as-is** — the user uses that
  list as a checklist.

## Traps

- **Only storyboard-reviewer has verdict authority** — whoever is running the skill doesn't read
  their own copy and end the loop on "good enough". The AI tells in your own sentences are the
  ones you see least. No score manipulation, no self-scored exit; a pass is declared only by the
  tail's `verdict=PASS`.
- **Don't reorder the four loops** — copy (§4.5) → per-scene (§4.6) → vocabulary (§4.7) → images
  (§5.5). Images are last because changing a sentence changes the picture that scene will show,
  and vocabulary comes after per-scene because polishing the words of a scene that's about to be
  dropped is wasted work. Running it backwards throws away work that had passed.
- **The score at the per-scene and vocabulary gates is the lowest scene, not the average** — the
  tail's `score` is the lowest scene's score. Don't read it as "average 96, so it passes".
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
- **`references/storyboard-template.md`** — the standard storyboard.md structure + the research.md table format
- **`references/storyboard-html-template.html`** — the storyboard.html render template — loads scenes.js dynamically and shows contract checks automatically; fill in only the `✎ SB_DOC` block
- **`references/shot-script-template.md`** — shooting mode only: the script.md (shooting script) structure + filming rules + the scenes.js variant contract
- **`../autoproduce/references/cost-tally.md`** — the episode cost-ledger convention (where §5 and §5.5 write, the line format, the units). The source of truth for unit prices is `prices.tsv` in the same directory

### Delegated agents

- **`storyboard-reviewer`** — four modes. §4.5 copy mode (AI tells, hook, factual fidelity) ·
  §4.6 scene mode (per-scene role and contextual fit) · §4.7 lexicon mode (are the words words
  people use) · §5.5 image mode (scene content against the picture's contextual fit). All four
  pass at 95 points with 0 P0 defects, and for scene mode and lexicon mode that 95 is on the
  **lowest scene**. `agents/storyboard-reviewer.md` is the source of truth for the rubric, the
  P0 list, and the tail format
- **`content-reviewer` plan mode** — prompt verification right before the §5 generation calls
  (`PLAN_REVIEW`). It looks at something different from storyboard-reviewer image mode — this
  one is the prompt, that one is the output
