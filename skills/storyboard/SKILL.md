---
name: storyboard
description: >
  Plans one episode before anything costs money — research, 3 scored scenarios, then scenes. Use when
  the user asks to "스토리보드 만들어", "스토리보드 작성", "이 주제로 영상 기획", "촬영 대본 만들어", "내가 녹화할 대본", "make
  a storyboard", "plan a video for topic X", or starts a new topic in a channel.
  Researches the topic, writes three scenario candidates in one fixed shape (주제 · dramatised
  훅 · what happened · what it means now · 2–3 present cases · 마무리 question · CTA), loops each
  through storyboard-reviewer scenario mode until 95 with P0=0 on curiosity · fear · intrigue ·
  comedy, shows all three in full for the pick, researches the winner further, and writes the
  storyboard under data/[channel]/episodes/[topic]/storyboard/. Format with the user first:
  9:16 shorts by default, or 16:9 long-form with chapters. The narration is then read on its own
  and looped to 95 until the spoken sentences alone carry the episode; six board reads run once
  each after that. Boundary — this stops at approval; produce builds from it, autoproduce skips the stop.
argument-hint: "<channel> <topic or topic hint>"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "Agent", "AskUserQuestion", "WebSearch", "WebFetch", "mcp__social-flow__capability_status", "mcp__social-flow__naver_search", "mcp__social-flow__serp_web_search", "mcp__social-flow__serp_news_search", "mcp__social-flow__serp_naver_search", "mcp__social-flow__serp_image_search", "mcp__social-flow__datago_search", "mcp__social-flow__datago_detail", "mcp__social-flow__datago_file_download", "mcp__social-flow__datago_file_fetch", "mcp__social-flow__datago_api_call", "mcp__social-flow__image_local_generate", "mcp__social-flow__gpt_image_text2img", "mcp__social-flow__suno_generate_lyrics", "mcp__social-flow__mlx_image_generate", "mcp__social-flow__mlx_image_edit"]
---

# Storyboard authoring — data/[channel]/episodes/[topic]/storyboard/

Takes one topic through **research → three scenario candidates (looped to 95) → one pick →
more research → scene design → narration read-through (looped to 95) → six one-round board
reviews (copy · per-scene · vocabulary · camera · sound) → image generation → image review →
storyboard approval**. The `scenes.js`
settled here is the one data source (SoT) for production (produce) — video, captions, and
per-platform text all derive from this file, so factual mismatch between platforms can't
arise in the first place.

Three candidate pages — seven items each: 주제 · 훅 · 전개 #1 · 전개 #2 · 전개 #3 · 마무리 · CTA —
loop through `storyboard-reviewer` scenario mode until **≥95 and P0 = 0** on curiosity, fear,
intrigue, comedy. Contract: [scenario-stage.md](references/scenario-stage.md). The narration
read-through (§4.4) is the other loop. The six board reads after it still run **once each**, with no score to clear.

| Review | What it looks at | What comes back |
|---|---|---|
| §2.2 scenario | Each of three candidates — whether curiosity · fear · intrigue · comedy actually work, and whether the seven items are there and do their job | loop until ≥95 · P0=0 |
| §4.4 narration | The narration alone, read in order without the picture — does the topic and the content come through | loop until ≥95 · P0=0 |
| §4.5 copy | The sentences of the whole storyboard — AI-sounding phrasing, hook, factual fidelity | one total score |
| §4.6 per-scene | The role and contextual fit of **each individual scene** | a score per scene + the lowest |
| §4.7 vocabulary | Whether the **words** in narration and titles are words people use | a score per scene + the lowest |
| §4.8 camera | The shot grammar — what each shot should make the audience feel (`shot.feel`) and whether its size, angle and frame space serve it — plus the four camera slots, the cut length, and the engine fit of every generated shot | a score per shot + the lowest |
| §4.9 sound | The episode's sound design — the music cue plan, clip audio, voice casting | one total score |
| §5.5 images | Whether the picture shows what the scene is saying | one total score |

**Board-review scores are a record, not a bar.** They go into `scenes.js` at approval so you can read back later which storyboard produced which performance. **Scenario, narration and authored-screen scores are the other thing:** each candidate loops to 95 with P0=0 (max 3 reads then one replacement), the spoken chain loops to 95 (cap 5 reads), and each HTML cut goes through `slide-reviewer` the same way. A candidate that misses that bar is replaced or dropped; a slide that misses it stays out of the build.

The three per-shot reviews report **the lowest** alongside the list, since an average lets a
good scene hide the one that collapsed.

```
data/<channel>/episodes/<topic slug>/storyboard/
├── research.md      # evidence, sources, cross-check log (skipped on channels that skip research)
├── candidates/      # d1.md · d2.md · d3.md — the three scored scenarios (§2.2); kept after the pick
├── scenario.md      # the winner, copied from candidates/ after the pick; consumed by §4
├── storyboard.md    # the human-readable storyboard — shot tables + embedded images
├── storyboard.html  # review render — loads scenes.js directly and draws it (template-based, §6)
├── scenes.js        # the machine-readable SoT — THEME + SCENES (+ narration segments)
├── images/          # per-scene 9:16 generated images (scene-<n>.png) — omitted in shooting mode
├── slides/          # every slide is a motion slide, reviewed at §5.6 before approval
└── script.md        # shooting mode only — the shooting script the user records against
```

## Procedure

### 1. Load the profile

**Call `capability_status` first.** It says which engines this machine actually has, grouped by
capability with an "N of M configured" count. Planning two Veo b-roll slots on a machine with no
`GEMINI_API_KEY` spends five review rounds before anything reveals the problem, and the tool
answers it in one call before any of that. If a capability the episode needs is missing, say so
now — with what one env var would turn on — rather than routing around it silently.

Read `data/<channel slug>/profile.md`. If it's missing, stop and point the user at
`/social-flow:channel add` first. Tone, voice, theme, verification policy, and the topic
slug rule are all inherited from that file.

**The channel profile outranks the generic format defaults.** Before choosing shots read
`motion_min_true`, `motion_allowed_kinds`, `motion_max_consecutive_stills`,
`motion_max_still_seconds`, `motion_require_action`, and `generated_video_max`; copy their
normalized values into `window.MOTION_POLICY` (scenes-schema §Channel true-motion policy).
`check-scenes.js` compares the snapshot with the profile, so no episode can weaken it. A
duration, shot-count or motion conflict stops here for the user to choose which contract changes.
Produce checks it again: `minTrueMotion: 1`, zero still-run limits and `motion-slide` allowed
means every photo is a motion slide whose subject or evidence changes with the narration. Ken
Burns, caption swaps and still swaps do not count.

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
[Short-form 9:16 (default) — 35–75s, up to 120 · 4–12 shots, all four platforms]
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
mode**. Confirm with AskUserQuestion when unsure.

**One recorded screen is not shooting mode.** A generated, TTS-narrated episode can splice a
single window of a screen recording into one card (`visual.source: "screencast"`), and
nothing else about the episode changes. Shooting mode is the other thing — the user narrates
while recording and their voice carries the episode.

**Long-form is a third case**: one episode mixes filmed and generated scenes, so the mode is
per scene rather than per episode, and narration defaults to the user's live voice throughout.

What changes once any scene is filmed — the `visual` contract, the relaxed character cap,
script.md, the hand-off to filming, and the long-form mixing rules — is in
[shooting-mode.md](references/shooting-mode.md). **A fully generated short-form episode, the
default, skips it.**

### 2. Research and fact-checking (follows profile §5 policy)

**Research comes first, in two passes, with a pick in between.** No scene is written until
the second pass closes (user note 2026-08-23). Create the topic directory now so the log has
a path (`mkdir -p data/<channel>/episodes/<topic slug>/storyboard`); §3 still reads
episode-state before scenes.

**§2.1 first research** (enough to offer three honest directions) → **§2.2 three scored
scenarios, then one pick** → **§2.3 additional research** on the chosen direction (the
exit). Tool choice, ingest, and the skip-research exception sit under all three, at the
end of this section.

#### 2.1 First research — enough to propose three directions

Do not lock every figure. Do not write scenes. The question map here is **what we need to
know to offer three honest directions** — what people ask, what's actually true, which
explanations compete — **3–5 rows**, not the episode's full 5–8.

1. **Write that map before the first search** (`research.md` §Questions). Each row ends
   answered by claim #N or written off.
2. **Search per question, not per topic, from more than one direction** (the tool guidance
   below). Two or more searches from different tools or types per question, **ten or more**
   logged in all — not three wordings of two lookups. Counter-evidence belongs after the pick.
3. **Put every claim in the evidence table** (`research.md` §Verified) — failed claims in
   §Failed. **Number the rows and keep the numbers.** Two independent sources for anything
   time-sensitive; one official origin counts as both. Don't shrink a range to its upper bound.
4. **Write `research.md` §Directions — three rows, none marked chosen yet.** A direction is
   **a different episode this topic could be**, not three wordings of the same one. Each row
   names the question, the hook form (`gap`·`number`·`identify`·`paradox`·`secret` — no
   `payoff` on a short), the **primary engine** (`curiosity`·`fear`·`intrigue`·`comedy` —
   three different primaries), the hero or unresolved thing, which claims hold it up, the
   **2–3 present-day cases 전개 #3 would use** (a search-log row each — so the question map
   has a row for them), and what the second pass still owes.

Three verified claims is the floor below which there is no video (the same floor autoproduce
drops a topic at), and **ten or more** searches is the floor below which there are no directions. Short of either, change the topic rather than inventing a third direction.

```bash
SB=${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references
node $SB/check-research.js storyboard/ --direction   # exit 1 = not enough to ask yet
```

**Does each direction's question survive to the last frame?** If the answer is "in one
sentence, halfway through", it is an explanation — don't offer it. Reframe it around
whatever stays unresolved, or drop that row (own-channel retention report, 2026-08-26).

#### 2.2 Three candidates, scored, then one pick — HITL, before more searching

Turn each direction row into `candidates/d<n>.md` — **the seven items, in this order, on
every candidate and both formats** (user directive, 2026-09-02): 주제 (what the viewer is
made to think about) · 훅 (a dramatised scene) · 전개 #1 (what actually happened) · 전개 #2
(what it makes us think about now) · 전개 #3 (2–3 present-day cases) · 마무리 (what do you
think?) · CTA. Loop each page through storyboard-reviewer scenario mode to **≥95 · P0 = 0**,
then pick. Three different primaries (`curiosity` · `fear` · `intrigue` · `comedy`). Items,
caps, template, the 훅's fact rule and the item-to-beat map:
[scenario-stage.md](references/scenario-stage.md). Skip-research channels skip this with
the three-direction pick.

**Show the three pages in full before asking** — for each candidate print the seven items as
written (the 훅's first sentence, the three 전개 paragraphs, the 마무리 question, the CTA line)
with its engine and score. A one-line option is not what the user approves; the seven items are. Then AskUserQuestion:

```
[D1 · <주제> — <engine> · score NN (Recommended)]
[D2 · <주제> — <engine> · score NN]
[D3 · <주제> — <engine> · score NN]
```

Recommended is the highest at 95 with `p0 = 0`. **Approval of the seven items is what starts
the rest** — write `Chosen: D#`, copy the winner to `scenario.md`, then §2.3. Unattended
autoproduce picks the recommended one; zero at 95 drops the topic.

#### 2.3 Additional research — close the chosen direction

Now the question map is the 5–8 questions **this** episode has to answer. Write off
questions that belonged to unchosen directions. Search the remaining claims; every key
claim gets one **counter-evidence search** ("X 아니다", "X 논란", "X 바뀜") and every
time-sensitive value gets one **freshness search** inside the last year
(`serp_naver_search period`). **A key claim is one the hook, the hero stat or the result
rests on** — mark it with `★` in the Verified `#` column (`| ★3 |`). A log that marks
nothing is read as "every row is key". §4's narration sentences point back at the numbered
rows with `claim` (scenes-schema §claim traceability).

**Check sufficiency before leaving the step.** Three verified claims is the floor below
which there is no video; a short normally leaves with **five or more**, a long-form with
**twelve or more**, and **every question in the map is answered or written off**. Short of
the floor, change the angle or the topic — don't pad the body. Only then §2.5 and §4.

**Have the check run against the page, not against your memory of it.** This is the one
gate with nobody on the other side — the agent that searched also writes that it was enough.

```bash
SB=${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references
node $SB/check-research.js storyboard/        # exit 1 = the research does not close
```

It counts the Verified rows against the Sufficiency line, reads every question's status,
counts searches against the question map, checks counter-evidence against the key claims,
and reads the direction pick (three rows and one `Chosen:`). Headings may carry a number
or a word in front (`## 2. 검증 통과`, `## 사실 검증표`).

The hook material comes out of this pass — `kin` questions are the `identify` and `gap`
forms, the verified figure is the `number` form and the hero stat. On long-form the shown
result is the `payoff` form; **on a short `payoff` stays off the cover** (scenes-schema
§the six hook forms). A hook written before the second pass is a promise you don't yet
know you can keep. **On long-form the arc is decided here too** — unfinished-sentence
material (tried → failed → someone saw it differently) is `arc: "story"` with a loop-open
form (`gap`·`secret`·`paradox`·`identify`); otherwise `answer-first`. **A short does not
pick an arc** — hook → drip → cta (scenes-schema §playback order).

- **When `recording/timeline.md` exists (produced by the ingest skill)** use it as the
  primary source. The three directions are three cuts of the same recording; additional
  research only checks figures inside the chosen cut. What was said is a claim, not evidence.
- Search tool choice: **Korean material goes to `naver_search` first** → general and
  overseas material to WebSearch → `serp_web_search`/`serp_news_search` for operators and
  date filters. Don't repeat the same search just by swapping tools. Shared arguments:
  `query`, `limit`, `page`. `naver_search` types: **`kin` (지식iN)** for what people actually
  ask (hook material), `cafe` sentiment, `blog` hands-on, `encyc` term definitions, `local`
  addresses, `news` time-sensitive values. `serp_naver_search` adds **video search**
  (`where: "video"`) and a **date filter** (`period: "1d"~"1y"`); everywhere else prefer
  `naver_search` (the larger quota).
- For **reference images**, `serp_image_search` or `naver_search(type: "image")`. A searched
  image used as-is needs `license` — unspecified results have no rights check. **Screens you
  make yourself get generated, not searched** (engine split in §5).
- **Government-origin evidence** (statistics, policy, regional status) comes from
  `datago_search` (data.go.kr). One official origin satisfies the cross-check. Collection,
  attribution, and the data-as-of-date trap: the **datago skill**.
- Time-sensitive values (prices, tax rates, deadlines, effective dates) need **two or more
  independent sources**. Failed claims stay out — don't invent figures and don't shrink a
  range to its upper bound.
- Record in `research.md` in the `references/storyboard-template.md` structure. Channels
  that skip research (creative, everyday life) skip this whole step — and then the copy
  review's "no basis" P0 is switched off for that channel.

### 2.5 Confirm the structure — settled by the §2.2 approval, before any scene exists

The seven items the user approved are the storyline on both formats: 훅 → 전개 #1 (what
happened) → 전개 #2 (what it means now) → 전개 #3 (2–3 present cases) → 마무리 → CTA. Lay them
onto beats with scenario-stage's item-to-beat map — a short writes `beat:"drip"` on the 전개
shots and `beat:"cta"` on the last narrated shot; long-form keeps the §2.3 arc (`story`: 전개 #2
is the `turn` · `answer-first`: its present answer is the `result`, first). The lines scenario-craft §12 says to write first —
the 훅's first spoken sentence, the 마무리 question, the CTA callback — are items on the
approved page and go across verbatim as §4's first edit; the feel sign sits on each item's
header. Nothing here is asked again.

**On long-form one thing is still open — how 전개 #1's investigation is laid out inside.** When
the material could go two ways, ask with AskUserQuestion, recommended first, one line per option
on what it changes: curiosity loop (mystery → false answer → turn — the informational default) ·
problem stack · transformation arc · expert contrast · ticking clock · reveal ladder
(scenario-craft §11). Write the pick into the scenes.js header comment and the storyboard.md
design rationale; §7 shows it back. The four §11 rules hold whatever the pick: the cold open (the
훅 is a staged moment, never the start of the timeline), a promise sentence inside the opening,
the false-answer beat at the top of 전개 #1 when the research holds one, and heavy context as
bridges past the first tension. Skip-research channels skip this with §2.2.

### 3. Create the topic directory

Make `data/<channel>/episodes/<topic slug>/storyboard/images/` using the profile §7 slug
rule. Topics don't live at the channel root — they go under `episodes/`, the same level as
`assets/` and `growth/`. §2 already created the storyboard directory so `research.md` had a
path; this step adds `images/` and reads state.

**If the directory already exists, read where it got to before touching anything.** An episode
runs across sessions, and the thing that stalls one is a half-finished state nobody can see.
If `research.md` has three directions and no `Chosen:` line, the next step is the §2.2
candidate loop — not scenes. If `candidates/` is missing, write those pages first.

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

### 3.5 Scenario — freeze the winner

`storyboard/scenario.md` is already the §2.2 winner. After §2.3 extra research (and §2.5's
long-form pick), patch that page if a new fact breaks an item, a false answer or a promise — then
loop **that one page** again to 95 (3-read cap, no replacement; skip if nothing changed). Stamp
`frozen:` when §4 opens. Four devices: [scenario-stage.md](references/scenario-stage.md). Don't
start a fourth read here — from here §4.4 loops and the six board reviews (§4.5–§5.5) run once.

### 4. Scene design — writing scenes.js

Write it to the contract in `references/scenes-schema.md`. Keep the array name (`SCENES`);
one entry is a **shot**. Group the same place and time with `scene`+`sceneSlug`, and write
`sequence` only when purposes diverge. Per shot, write `shot.feel`, `shot.size`, `shot.angle`,
`shot.info`, `shot.infoType`, `shot.space` on a generated still, and `visual.picture` (still photo / AI video / recording / shared asset) plus `visual.overlay`
(HTML staging / none) — one shot can have both. A cover laying an HTML reveal over a still
photo is the default. The source of truth for field definitions is the schema's §grammar
units and production layers.

**Write it in two passes.** **4a — story**: `window.COMPREHENSION` · `beat` · `shot.feel` ·
`shot.info` · `shot.infoType` · `narration` · `arc` · `hookType`/`hookForm` · `title` and the approved scenario's
three verbatim lines only, so shots stay cheap to cut; the cover's `shot.info` says the 훅 is staged
("연출 — 전개 #1 이 사실을 댄다"). 4a is done when §4.4 clears. **4b — machine**, after §4.6: everything else. scenario-craft §12 measures it.
Core rules:
- **Compress the episode before polishing its sentences.** `window.COMPREHENSION` names one question,
  answer, takeaway, cross-scene branches, and unfamiliar terms. A short informational episode has
  no cross-scene branch. Every `shot.info` reaches the answer or takeaway; otherwise cut it. Explain
  each term verbatim in its first shot and cut disposable proper names. See scenes-schema
  §comprehension contract; `check-scenes.js --draft` enforces it before camera work.
- **Feel first — every shot says what the audience should feel before any dial is set.** Write
  `shot.feel`, then use directing-grammar §5 for size, angle, space, move, length and sound.
  `shot.info` is what viewers learn; a `feel` that repeats it or merely captions a chosen camera
  is unset. Put size, angle and `shot.space` (`frame`, `layout`, `facing`, and `line` for a pair)
  into `bgPrompt` through `assemble-bg-prompt.js`; object-centric left/right and metres fail.
  Across shots establish then go close, use one `cu` per scene, `choker`/`ecu` once or twice per
  episode, and one reasoned `dutch`; keep hooks and speech at `eye`, and hold a wide ≥1.5× a close
  (directing-grammar §6). The same fields steer filmed-shot distance, eye height and 180° line (§7).
- **Decide each join after the scenes are settled (4b).** Omit `transition` (builder J-cuts
  spoken cards); `"cut"` is a smash. Spend the rest from scenes-schema §scene transition.
- **Composition — the format picked in §1.5 sets the band.** The source of truth for the
  constants is `formats.js`, and the `storyboard.html` check strip measures against those
  values for you.
  - **Short-form 9:16**: hook + drip (1–n) + spoken CTA = **4–12 shots · 35–75s** (up to 120s when the story carries it)
    (typically 2–5 drips). The shared outro asset sits after the CTA and is not a
    spoken shot. When going over 75s, write into the `storyboard.md` design rationale why
    dropping the demo or evidence in question would make the result impossible to
    understand (180s is the absolute cap).
  - **YouTube long-form 16:9**: **28–70 shots · 8–15 min** (20 min absolute cap) +
    **5–10 chapters** (3 or more in the filmed lane). The chapter contract is
    `references/scenes-schema.md` §chapter — write only the `chapter` string on the scene
    and the builder makes timestamps from measured times. The first chapter goes on the
    cover so it opens at 0:00.
  When channel Analytics measurements exist, they outrank generic benchmarks — go by
  **stayed to watch, engaged views, and subscribers gained per video**. Pick length and
  format from the episodes that produced engaged views and subscriptions, not raw views.
- **Meet the channel's true-motion floor before calling a still "enough."** Only
  `window.MOTION_POLICY.allowedKinds` counts: `ai-video`, `recording`, or `motion-slide`.
  Ken Burns, camera instructions, caption changes and still swaps do not. With `requireAction`,
  each qualifying shot writes the visible subject change in `visual.action`; the full checker
  blocks a weak ratio, an overlong still, or too many still shots in a row.
- **Pick the screen body by the information job, not by the motion quota.** Film visible evidence;
  generate mood, place or people; draw structure, comparisons, steps and number flows. A picture cannot
  replace a running result or hand action. Short informational episodes reserve **1–3 full-frame
  editorial HTML cuts** for a document comparison, causal relation, mechanism,
  timeline, transition or verdict: set `treatment:"editorial"`, `role`, and one repeated `motif`.
  Classify every narrated shot first: `shot.infoType:"timeline"` for ordered periods or dated
  events, `"statistic"` for measured counts·rates·shares·comparisons, `"principle"` for
  causes·mechanisms·state changes, and `"other"` for the rest. The first three are mandatory
  full-frame seekable HTML animations with `kind:"diagram"`, `motion:true`, `treatment:"editorial"`, and role `timeline` · `statistic` · `mechanism` respectively.
  Declare one `{group, primitive}` in `slide.motionBeats` for every narration segment. A still,
  footage, kinetic type, or a photo with animated annotations cannot replace these cuts. If a
  shot needs two types, split it. On a **principle** frame sit ink actors (`slide.arts` ·
  `h.fig`) and draw hairlines (`h.stem` · `h.bus` · `h.chamber` · `h.ring` · `h.press`). Named
  states keep `flow-trace` · `node-enter` · `state-transform` and may skip arts. Shape
  primitives require `slide.arts` (`slides/assets/s<shot>-<slug>.png`, sit with `h.fig`);
  generated at §5.6; kinetic may carry an art or a disk, type-only is valid for a verdict or
  a cross. A slide also carries `file` (`slides/s<shot number>-<slug>.html`), `plan`, and every
  screen string in `labels`; build the moving files in §5.6. See scenes-schema §slide scenes.
  **When the slide states a value** — a count, a share, a comparison, steps that arrive one
  per sentence — it is a **motion slide** (`slide.motion: true` is required, scenes-schema
  §motion slides): the number counts up and the bar grows the moment its sentence starts, and
  the `plan` says what moves on which sentence ("① 27 counts up · ② the bar grows"). This is
  the one free way to put movement on a body scene — the generated-video cap doesn't apply
  to it. Beats only: a scene that needs continuous motion (gears turning under the whole
  narration) is footage, not a slide.
  Filmed scenes get `visual.clip` (filename), `shot` (what's visible), and `action` (what
  you do), and the filename follows the **`footage/s<scene number>-<slug>.mp4`** convention
  set by the storyboard — the user doesn't pick names. Whether the live voice carries the
  sound or narration covers it is decided here too (live voice means `narration: []`). The
  full text is scenes-schema §filmed scenes.
- **On a motion-required short, pick the moving body before the background.** An event, a
  place or an action beat on an `ai-video` channel is a **footage slide** — `treatment:"footage"`,
  one generated clip per sentence with wordless marks drawn over it (`references/footage-lane.md`).
  A place, object or document that changes inside a photograph is `photo-action`: every group
  changes a hand, debris, folder or trace, mirrored in `visual.action` and `slide.plan`. Whole-photo
  moves, drifting dust, flashing accents and animated subtitles still fail either contract.
- **Long-form spreads one result across chapters over one episode; it isn't several
  short-form episodes stitched together.** A different topic per chapter makes a playlist,
  not an episode. Long-form walks cover → hooking → … with the arc picking the rest; the
  "body" is split into chapters and runs longer.
- **Playback order follows the format, then (on long-form) the cover's `arc`.** The source of
  truth is scenes-schema §playback order. **A short is always hook → drip (1–n) → cta.** Write
  `beat:"hook"` on the cover, `beat:"drip"` on every middle shot, `beat:"cta"` on the last
  narrated shot. n ≥ 1. `hooking` · `result` · `body` · `turn` on a short are defects.
  `hookType:"spoiler"` and `hookForm:"payoff"` are forbidden. The cover does not speak
  `COMPREHENSION.answer`; the last drip is the first place that answer is complete; each
  non-final drip pays one piece and opens the next gap. The CTA is a spoken shot, not the
  shared outro. **Long-form still uses two arcs.** Cover and hooking exist in every long-form
  episode. **`answer-first`** (the default): cover → hooking → result → body — the cover
  shows the finished thing at a glance, hooking hooks why it's needed, and **the result scene
  comes before the method and steps**. **`story`**: cover → hooking → body → turn → result —
  the cover opens a loop on the moment it went wrong and never says how it ended, hooking is
  the setup, the body builds the conflict, the turn is the moment someone saw it differently,
  and the result is the payoff, **the first place the answer appears**. Write a `beat` on each
  shot. **Inside the long-form skeleton, the body's beats follow the structure the user picked
  in §2.5** (scenario-craft §11).
- **Underneath the beats, run the twelve craft rules** (`references/scenario-craft.md`). After
  drafting, walk the scenes top to bottom and speak the connective at every seam — each one
  reads "그래서" or "그런데", never "그리고" (an and-then seam is a scene to merge, cut, or
  reorder); check each scene turns a charge (what's at stake reads differently at close than
  at open — `shot.feel` should swing or deepen, never repeat three shots straight). Then the
  technique the episode rides: a story `turn` planted early and fair-play, fear put on the
  table with its clock plus a doable answer (suspense over surprise, Witte's efficacy rule),
  every curiosity loop opened mid-episode paired at open time with the scene that pays it
  (loops beyond the main `hookForm`: short informational 0, short narrative 1 at most,
  long-form 2–4 — the
  pairs go into `SB_DOC.craft.loops` in §6, where storyboard.html draws the ledger and marks
  the unpaid ones), the body paying its answer in installments so each
  body scene opens the next question as it closes one (seam gaps stay off that ledger),
  and jokes built as pattern breaks that land last. On a story arc, three more: the body holds
  before it bursts — the protagonist's holds written as a rising `shot.feel` series and the
  release as an action, not the emotion (§8); the `turn` is a double hit — the situation flips
  and the plant re-reads in the same shot, with the outcome still kept for the result (§9); and
  the premise is shown working once (claim · act · result) rather than told — a hooking line or
  `quote` that explains the world is the explainer-character tell (§10). On every arc the
  payoff shot copies its plant's frame — same `shot.size` · `angle` · `space` (§3) — the
  signature line lands once (§7), and `sound.drop` on the turn is the music going out at the
  peak rather than up (§7). On every arc the feel chart carries a sign per shot and dips before
  it lifts — the minimum before `craft.burst`, the maximum on the turn or the result — the
  cover's first sentence names a loss or a stake before it asks anything, and on both formats
  the cta is the 마무리 question plus the callback and one outward act (a comment invite or a
  next-episode promise) with no subscribe verb (§12, catharsis). On
  informational episodes, walk §11's four checks last — the body's
  order against event time (the chronological-trap fingerprint), the promise sentence in the
  opening, the plausible wrong answer some scene takes apart, and the heaviest context stretch
  sitting behind the first tension rather than in front of it.
- **The opening runs on one of four — fear · empathy · curiosity · showing the ending.**
  Every episode uses one of them (user-relayed creator lecture, 2026-08-18). Decide in one
  line, before authoring, which stimulus the opening uses to stop the viewer, and write it
  on the cover shot as `hookType` (`fear`·`empathy`·`curiosity`·`spoiler`). **A short does not
  use `spoiler`.** Fear is a loss the viewer may already be carrying, empathy is a problem
  scene that reads as "that's me", curiosity is a twist, a figure, or unresolved tension, and
  showing the ending is putting the finished thing on screen first (long-form answer-first
  builds). The cover title and the platform title carry the same stimulus. If you pick fear,
  the threat needs evidence in research.md or a hedge to a possibility, and the drips (short)
  or the body (long-form) have to answer that threat. An opening with none of the four is a
  copy-mode P0. The source of truth is scenes-schema §the four opening strategies.
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
  make the title and segment ① actually take that shape, then **keep it** in the last drip
  (short) or the result (long-form). **A short does not use `payoff`.** storyboard.html is
  tables, frames and badges, not drawn panels — the form of the storyboard is irrelevant, its
  function is to force these four jobs.
- **The hold job is won in the drip shots, not at the entrance** (measured on our own channel,
  n=4 — retention report, 2026-08-26). Retention ranked our four Shorts in exactly
  the order views ranked them (52% → 38% → 26% → 19%, 1,367 views down to 453), and the
  longest episode (90s) came first on both — the slope was the variable, not the length.
  Winner and loser both cleared the first 3 seconds; the loser then leaked a few percent a
  second through the body and sat under 50% by the 17-second mark. So when an episode
  underperforms, **rework the drips before touching the opening** — every drip except the last
  closes one gap and opens the next in the same breath (`references/scenario-craft.md` §5), and
  a scene that only finishes an explanation is where the curve bends. Cutting shorter isn't
  the fix either: what wins is a flat curve, so trim the stretches that sag and let a held
  90 seconds run.
- **On a short the shots after the cover are drip, then CTA.** n ≥ 1 drip shots. Each
  non-final drip pays one piece and opens the next gap; the last drip completes the answer;
  the last narrated shot is `beat:"cta"` with one outward act. Do not write `beat:"hooking"`.
  **On long-form the shot after the cover is hooking** — informational episodes included. If
  the cover stopped the thumb, hooking carries the stopped person to the result. The contract
  has four parts — **catch** what the cover threw, **hook** the viewer's problem with the
  viewer as the subject, **don't unpack** the answer, and be **short** (1–3 shots · 20–60s,
  with the result or the build inside the first 60s). Don't fill it with greetings,
  self-introduction, or a "today we'll look at ~" trailer. The source of truth is
  scenes-schema §hooking; the evidence is [hooking research](../../docs/research/2026-08-18-hooking-beat/).
- **On a short the cover is a gap, not the result.** The first frame and segment ① open a
  question; they do not speak `COMPREHENSION.answer`. Greetings, background, tool definitions,
  and "I tried it" get cut. **On long-form answer-first the result is in the first second**:
  the cover's first frame is the finished screen or the working result, and the cover's
  glance and the result scene's unfolding point at the same artifact. **On a story arc the
  opposite holds** — the first frame is the moment it went wrong, close, and the ending stays
  out of the cover, the setup, the build and the turn; the cta's frame is what points back at
  the cover.
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
  empty and the ending nobody reviewed is exactly the last second that drifts.
  `movement: "static"` is a decision, not a blank. On stills the block is optional —
  write it when the still should move with intent: `movement` picks the builder's Ken Burns
  move (eased zoom towards a focus point, pan, cover punch, handheld drift — the feel each
  serves is directing-grammar §5's Still column). The vocabulary rules (vendor words, one move,
  no seconds, no exclusions) are `references/scenes-schema.md` §camera, and the move itself
  comes from the shot's `feel` (directing-grammar §4–§5) — it supports the feel, it doesn't
  carry it alone, and `framing` restates the shot's size and angle in the engine's words.
- **Every generated still leaves here with its floor plan decided** — `shot.space` filled
  (`frame: "camera"` · `layout` — empty only on an `insert`/`ecu` that fills the frame with one
  object · `facing` when a person is on screen · `line` when two people, or a person and what
  they look at, share the scene). Image models do not infer camera position or object-centric
  left/right (directing-grammar §3.5). The assembler writes the prefix; the scene and mood follow. A
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

When `grow-youtube` output or YouTube Analytics records exist for the channel, settle the six
items in `references/measurements-to-structure.md` in one line each **before authoring** — a
stopping problem, an interest problem, a holding problem, an engagement problem, the conversion
clue, and the next promise — and write them into the `storyboard.md` design rationale and
`SB_DOC.seriesNote`. Channel measurements outrank generic benchmarks wherever the two disagree.

#### Run the contract checker before delegating anything

```bash
SB=${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references
node $SB/check-scenes.js storyboard/ --draft  # after 4a — machine-layer absences deferred
node $SB/check-scenes.js storyboard/          # after 4b — exit 1 = a violation
```

**`--draft` is the story pass** — machine-layer absences deferred and counted; vocabularies and
beat order still fail.

It reads the structural half of the contract — fields that have to exist, values that have to
come from a fixed vocabulary (`shot.size`, `shot.angle`, `beat`, `hookType`, `hookForm`, `transition`), the
four camera slots on every generated shot, b-roll's `after` resolving to a real scene, a
`sound.cue` naming a cue that exists, and the profile's true-motion floor and still-run limits.
Every format band comes from the format preset, while motion limits come from the profile, so
there is no second policy copy to drift.

**Fix what it finds before a reviewer reads the file.** A delegation spent on a storyboard with
an empty camera slot buys a finding the checker gives away, and a reviewer that trips over a
structural fault reads the rest of the file worse.

It is the structural half only. Frame overflow, hero-stat width and speech rate are measured
against a rendered canvas — those stay in `storyboard.html`'s check strip, and duplicating them
here would create the mirror drift `format-lint.js` exists to police.

### 4.4 Narration read-through (storyboard-reviewer narration mode — loop to 95)

**The story pass is done when the narration alone carries the episode** (user directive,
2026-09-02). Before the six one-round reads and before a shot gets a camera, the spoken sentences
are read in order with nothing else open — the phone in a pocket, or the subtitles with the sound off.

1. With `check-scenes.js --draft` at exit 0, **delegate to the storyboard-reviewer agent
   (Agent) in "narration mode"** — pass `scenes.js`, `scenario.md` (if present — a skip-research
   channel has none; the reviewer reads `COMPREHENSION` instead), `research.md` (if present) and `profile.md`. The reviewer extracts the sentences itself (`extract-text.js … subtitle`)
   and reads them before it opens anything else. Tail: `STORYBOARD_REVIEW: mode=narration score=NN p0=N`.
2. **Apply the directives in `scenes.js` as spoken sentences** — add the antecedent, say what
   the picture would have shown, speak the present link, name the case's connection, explain
   the term where it first appears. Never answer a finding with a caption or a picture. Keep
   `COMPREHENSION.terms` and the character caps in step (`--draft` again).
3. Re-delegate, saying which findings you applied. **Loop until `score ≥ 95` and `p0 = 0`;
   cap 5 reads.** Still short at the cap: go back to the approved scenario — a chain that
   won't close in sentences is usually an item the board dropped — and carry the last verdict
   to §7 in the reviewer's words. Unattended autoproduce stops instead (its §3.5).

The score at §7 has to be the shipped narration's. §4.5–§4.7 only subtract, drop and swap; a cut
that removes a link this read relied on (a term's plain wording, the sentence that names the next
one's referent) is not applied. **If any narration segment changed at §4.5–§4.7, one confirming
read runs after §4.7**, inside the same cap; a drop below 95 is fixed and read again before §4.8.

### 4.5 Copy review (storyboard-reviewer copy mode — one round)

**This reads the story pass (4a)** — a scene it asks to drop costs nothing yet.
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
  or curiosity is written in `hookType` on a short; long-form may also show the ending —
  scenes-schema §the four opening strategies). **On a short**, every middle shot is a drip:
  each one except the last pays one piece and opens the next gap, and the last drip is the
  first place the answer is complete; the last narrated shot is the CTA. **On long-form**,
  hooking catches what the cover threw and doesn't unpack the answer (§hooking); the result
  scene unfolds the finished thing (on a story arc it is the first place the answer appears);
  body scenes say only how that result was made. points gives one message per screen, and
  quote says something that could plausibly come out of that person's mouth.
- **Contextual fit** — is there a reason for that scene to be here. Does it catch what the
  previous scene threw and open the next one, does a short walk hook → drip → cta, does the
  result come before the body on long-form answer-first and after the turn on a story arc, is
  the premise something the profile §3 target will follow, and which entry in research.md
  does that claim hang on.

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
     arrangement that still makes sense when reordered had no flow to begin with. If a short
     is not hook → drip → cta, reorder the beats rather than rewriting sentences. If, on
     long-form answer-first, the method explanation sits before the finished thing, move the
     result scene forward; on a story arc it is the reverse — a payoff that sits ahead of the
     turn moves back behind it.
   - **Rewriting a scene or reordering changes the sentences §4.5 already read.** Don't rerun
     copy mode for it — apply the same rule you got there (only subtract) as you rewrite, and
     say in the §7 note which scenes moved after the copy review.
3. **Write down whatever you didn't apply**, with the lowest scene and its score, for §7.

**4b starts here** — fill the machine layer, then run the checker without `--draft` before §4.7.

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
  keeps its `space.line` (directing-grammar §6). **The join** — scenes-schema §scene transition.

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
   `${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references/scenes-schema.md` (§camera · §cut length · §scene transition),
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
screen is not an image but HTML: every slide is a motion slide, built at §5.6 before
approval. Both the image count and the cost ledger count image scenes only.
Don't memorize the sizes — read them from the preset.

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
  `mlx_image_generate` / `mlx_image_edit` are optional when MLX Core is up; they are not
  the default, and Hangul still goes to gpt_image.
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
- **Pick still or video per scene — the format's generated-video cap is the default, and the
  channel profile may override it** (the source of truth is scenes-schema §motion background).
  There are two generated forms and they count together:
  - **`broll`** — inserted between scenes. A stretch where only the picture moves and nothing
    is said (absolute rule 9 means that stretch uses the video's own audio, and using both
    slots cuts roughly 8 seconds out of the time spent delivering information).
  - **Motion background (`visual.video`)** — the scene itself as video. The storyboard's image
    for that scene becomes a parameter for a veo video laid under the background, and
    **narration, captions, and subtitles stay**. Use it on scenes where the background has to
    move while you talk — where the movement itself is the content.
    `duration` inside one clip (veo 8s · the default seedance 1.5 pro 4–12s,
    server-validated) · points only · not combined with per-line illustrations.
  Still is the default only after the channel motion floor and still-run limits are met — video
  buys cost and seam risk. A Ken Burns move, caption change, or still swap does not count toward
  that floor. **Backgrounds that become veo sources (scenes with b-roll attached, motion-background
  scenes) have to be
  photorealistic people made with `gpt_image_text2img` (high)**, not the local engine — blurry
  or peopleless, and those 8 seconds look like a still frame. The two b-roll slots need
  different `after` values.
- **Get the plan reviewed before any generation call** (produce absolute rule 13) — delegate
  the cover bgPrompt, every b-roll and motion-background scene **and every footage shot** to
  content-reviewer **plan mode** in one call and generate only after `PLAN_REVIEW: PASS`. Footage
  stills and clips are generated here too, after the §5 cost gate (footage-lane.md §3).
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
  image). Even so, past 30 images, look again at whether this material belongs in the filmed lane.
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
   `scene-N.png` there is not a defect (their screen arrives in §5.6). Read the tail
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

### 5.6 Motion-frame authoring and review (before approval)

If any scene has `visual.slide`, author it now with
[slide-authoring.md](references/slide-authoring.md). **Generate `slide.arts` first** when
the array is set — `slides/assets/s<shot>-<slug>.png`, ink actor illustration, no readable text
(`image_local_generate`; gpt/mlx when needed). Log the call; sit a principle actor with `h.fig`.
A principle frame is a `.cast` of actors plus rules (`h.stem` · `h.bus` · `h.chamber`); kinetic `renderKinetic`
puts the first art on group 1 then the title with `in`; type-only skips arts. A footage slide waits for its clips (footage-lane.md §4).

Then run `node references/check-slide.js <storyboard directory> --require-all`, render its
key-state sheet, and take it through `slide-reviewer` to score ≥95 with p0=0. This is part of
the storyboard, not a post-approval detail: a plan line cannot reveal that an “HTML frame”
is only a photo with an animated rectangle. Timeline, statistic, and principle frames must
match every `motionBeats` primitive with the same group's `data-primitive`. Keep each sheet
under `.work/slide-check/s<n>/sheet/` and embed its end states in storyboard.md.

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
storyboard/ and fill in **only the `<title>` and the `✎ SB_DOC` block**. Its labels follow the
reader's language (`?lang=en` · `?lang=ko`, or the picker at the end of the section menu); the
episode's own copy stays in the language scenes.js is written in, so nothing here needs setting. Never write scene data
(title, lines, bullets, shot, duration, THEME) into the HTML — the document loads the SoT
directly with `<script src="./scenes.js">` and renders it, so fixing scenes.js updates the
document automatically and copy drift is structurally impossible. SB_DOC holds only editorial
metadata that isn't in scenes.js (core message, per-scene notes, transitions, audio directions,
privacy avoidance, source summary, platform plan, shooting prep, recheck list, **the cast**,
**the promise ledger**).

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

**Fill `SB_DOC.craft` with the promises the episode makes** — the loop ledger the §4 craft
rules ask for, in the one place the approver reads. `loops[]` first: the cover's own hook as
the first entry (`open: 1`, `pay:` the last drip on a short, the result shot on long-form), then every sub-loop opened mid-episode
and every deliberate plant (`kind: "plant"`), each with the shot that pays it and a one-line
`what`. On a story arc add what the arc actually uses: `holds[]` (the body shots where the
protagonist endures, in playback order) with `burst` (the shot the held charge comes out in),
`signature` (the one quotable line's shot), and `device` (`{ what, rule, shown: [claim, act,
result] }`). Shot numbers are the document's, counting from 1. The renderer draws the ledger
under the timeline, tags every shot it names on the card header (고리 엶 → 샷 6 · 떡밥 회수 ←
샷 3 · 참음 2/3 · 터짐 · 명대사 · 장치 검증), and the check strip warns on an empty ledger, a
loop with no payer or one paid before it opened, a cover promise paid anywhere but the last drip (short) or the result (long-form),
a plant paid in a different size · angle · layout than it was planted in, holds out of order
or on the same `shot.feel`, a burst before its last hold, and a device with no rule or no
verifying shots. A field left empty draws nothing; the one warning an empty block raises is
the empty `loops[]`.

The document shows six things.

- **Shot cards** — one `SCENES[]` entry. The header carries the role, the size and the angle,
  the **beat** (short: cover · drip · CTA; long-form: cover · hooking · result · body · turn · CTA — plus the opening-strategy,
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
- **The promise ledger** — `SB_DOC.craft`, drawn under the timeline: one row per loop and
  plant (kind · opening shot · paying shot · the promise · for a plant, the two frames side by
  side), then the story-arc lines — the device and its rule, the holds with their `shot.feel`,
  the burst, the signature line. It's the §7 loop ledger inside the document, so a promise
  with no payer is a warning in the strip and a tag on the shot rather than a line someone
  has to remember to compose.
- **The cost panel** — what the episode has already billed (images, from the ledger) beside what
  approving it commits (the generated-video slots, priced per shot). It draws only when
  `SB_DOC.cost` is filled, and it flags itself when the snapshot no longer matches the scenes.
- **The contract check strip** — violations collected in one place at the top of the document.
  On top of character counts, speech rate, scene length, total length, and cover title, it
  measures **frame overflow** and **hero stat width** the same way produce does (1080px canvas
  · 3-step shrink · 640px guard), and it also catches the b-roll contract (no narration, 8s or
  under, same src as the cover background, `after` pointing at a real scene), missing scene
  length, missing `tts`, unrecorded outro length, unfilled `{{…}}` in SB_DOC, **playback order**
  (short: hook → drip → cta, a violation when drip or a spoken CTA is missing or a long-form
  beat appears; long-form: the cover's arc — answer-first cover → hooking → result → body,
  story cover → hooking → body → turn → result; a warning when there's no hooking shot or the
  shot after the cover isn't hooking; on answer-first a violation when body comes before
  result, on story when result comes before body or the turn), **opening strategy**
  (a warning when the cover has no `hookType` or a value outside the four), **hook form** (no
  `hookForm`, or one outside the six), and the **shot grammar** (a shot with no `shot.feel`, a
  `shot.size`/`shot.angle` outside the vocabulary, a second `cu`/`choker`/`ecu` in one scene, a
  third `choker`/`ecu` in the episode, a second `dutch`, a close-up opening not paid back by the
  next shot, a generated still with no `shot.space.layout`, camera-inference or metres in the
  prompt — directing-grammar §3.5 · §6 · §8), **the promise ledger** (an empty
  `craft.loops`, a loop with no payer or paid before it opened, a cover promise paid off the
  last drip (short) or the result (long-form), a plant paid in a different frame than it was planted in, holds out of order or on
  one `shot.feel`, a burst before its last hold, a device without its rule or its verifying
  shots), and on a story arc **a music drop that isn't on the turn** (scenario-craft §7). This is
  where text clipping and contract violations get filtered out before production — though it
  shares produce's blind spot, so text pushed **upward** isn't caught (only downward overflow
  is measured).

Use this document as the default when presenting for approval. The text zones and the subtitle
toggle are at the head of the shot composition section.

### 7. HITL approval gate

Present the storyboard with AskUserQuestion — the **format** (short-form 9:16 / long-form 16:9),
the direction picked at §2.2 (the question, the engine, the score),
the storyboard.md and storyboard.html paths (opening the HTML in a browser shows the check
badges too), shot count and expected total length, the cover title, key figures and sources.
For long-form, also say **the chapter list and that the safe area is provisional** (§1.5).
If there are filmed scenes, show **the `script.md` path and how many files have to be filmed** —
approval is the start of filming, so the user needs to know what and how many from this screen.
If there are slide scenes, show **how many scenes are slides and each one's `plan` line**.
Every slide already has rendered sheet frames and a slide-reviewer score; show those actual
frames and name every editorial frame's `role` and shared `motif`.
**Show the motion contract too** — measured true-motion shots against the required count, the
longest still run in shots and seconds, the allowed motion kinds, and the generated-video cap.
The numbers come from the profile-backed `window.MOTION_POLICY`; a motion finding from
`check-scenes.js` blocks this approval screen rather than becoming an unresolved reviewer note.
**Carry the review results here too** — the winner's scenario score (and the other two
candidates'), the narration read-through's final score and how many reads it took, plus one score each for copy,
per-scene, vocabulary, camera, sound and images, with **which scene or shot was lowest and at what score**
for the three per-item ones, and **every finding you didn't apply, in the reviewer's own words**.
That last list is the point of the screen: the reviews no longer block, so this is where a
defect gets its only human look. **Say the money out loud too** — regenerate `SB_DOC.cost` (§6)
and put both numbers on the screen: what this episode has already billed, and what approving it
commits in generated video, per slot. Approval is the last point where deleting a b-roll is free;
after it the slot is an API call. If the preview came back exit 1, say the verdict is incomplete
and show the `!!` lines rather than a total that looks whole. **Show the decisions behind those
numbers too** — `decisions.sh .work/decisions.tsv` — so the engine and tier choices are approved
with everything else rather than discovered in the bill. **The loop ledger comes up here too** — read it off
storyboard.html's promise-ledger section (`SB_DOC.craft`, §6): every curiosity loop and deliberate
plant opened in the episode with the shot that pays it, the story-arc holds and burst, the
device (scenario-craft §3·§5 direct the pairs there). A pair with no payer is already a
warning in the strip; this screen is the last cheap place to act on it. The options:
[Approve — proceed to production / Request changes / Hold the topic]. **Don't move to produce
without approval.**
For a change request, apply it and present again. **A user-requested change may be re-read by
the one review that covers it** — §4.5 for sentence structure, §4.6 for scenes added or removed,
§4.7 for word swaps, §4.8 for camera slots, §4.9 for sound, §5.5 for remade images. That is the
one place a mode runs twice, and it runs because a person asked, not because a score fell short.
Once approved, write two lines at the top of scenes.js — `// approved: <YYYY-MM-DD>` and
`// review: scenario=NN narration=NN text=NN scene=NN lexicon=NN camera=NN sound=NN image=NN unresolved=N` — and point
the user at `/social-flow:produce <channel> <topic>`, so you can trace later which score of copy
produced which performance. `unresolved` is how many findings went to the user unfixed; `n/a`
goes in any slot whose review didn't run (image in shooting mode — camera runs on every episode,
since it reads the feel, size and angle of stills and filmed shots too; scenario now runs on
both formats).

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
  Motion slides already passed §5.6.

## Traps

- **Don't skip a review because you think the copy is fine** — whoever is running the skill
  doesn't get to read their own sentences and call it good. The AI tells in your own writing are
  the ones you see least, and the review costs one delegation. Six board reads run, every episode.
- **Don't delegate a board mode twice to chase a number.** Copy · scene · vocabulary · camera ·
  sound · image run once. A second round happens only when the user asks for a change at §7
  and that change lands in that mode's layer. **Scenario and narration are the exceptions** — §2.2
  loops each candidate to 95 and §4.4 loops the spoken chain, like a slide. Not the other six.
- **Don't reorder the six** — copy (§4.5) → per-scene (§4.6) → vocabulary (§4.7) → camera (§4.8)
  → sound (§4.9) → images (§5.5). Images are last because changing a sentence changes the picture
  that scene will show; vocabulary comes after per-scene because polishing the words of a scene
  that's about to be dropped is wasted work; camera and sound come after the scenes are settled
  because a shot that gets merged away takes its camera block with it.
- **The score at the per-scene, vocabulary, and camera reviews is the lowest one, not the
  average** — the tail's `score` is the lowest item's score. Don't read it as "average 96, fine".
- **A board-review score is a record, not permission.** Nothing in §4 or §5 stops on a number.
  Scenario at §2.2 and narration at §4.4 do — a candidate below 95 is improved or replaced,
  a chain below 95 is rewritten in sentences, not filed. Findings from the six board reads
  that you decided not to apply still have to reach the §7 screen in writing.
- **Don't answer a read-through finding with the picture.** "It's on screen" is the failure §4.4
  exists to catch; the fix is a spoken sentence. Self-check from the extract, not from scenes.js.
- **Don't open scenes.js while still searching** — research is two passes with a scored pick
  in between (§2.1 first research → §2.2 three candidates looped to 95 → §2.3 additional
  research, then the sufficiency check). Don't start the second pass before the pick. Don't
  offer three wordings of the same question, or three pages with the same primary engine, as
  three candidates. A hook written before the second pass is a promise you don't yet know
  you can keep (user-relayed, 2026-08-23).
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
- **A profile rule is not episode folklore** — never call it legacy or replace it with a
  convenient format default in `storyboard.md`. When the two contracts disagree, stop before
  authoring and ask which one changes; record that choice in the revised profile or format.
- **A range stays a range** — don't shrink a numeric range to its upper bound alone (this has
  actually happened).
- **No national symbols in images** — flags, national emblems, maps, government buildings, and
  people in uniform don't get generated without prior approval.
- SerpApi counts 1 search = 1 credit (250/month free) — prefer naver_search (25,000/day) and
  WebSearch, and spend serp only on precision searches.
