---
name: autoproduce
description: >
  Runs one topic all the way to shipped files with no human gate — the unattended twin of
  storyboard plus produce. Use when the user asks to "이 주제로 영상 하나 만들어", "주제만 주면 영상까지
  만들어줘", "자동으로 쇼츠 만들어", "make a short about X end to end", or when a growth loop needs to
  refill its publish queue by itself. Researches, scores 3 seven-item scenario candidates to
  95 on curiosity · fear · intrigue · comedy, authors scenes.js, loops the narration alone to
  95, generates 9:16 backgrounds, synthesizes narration, and builds the video plus
  per-platform text under data/[channel]/episodes/[topic]/output/. Machine gates replace
  human approval: facts, three candidates looped to 95 with P0=0, the narration read-through
  looped to 95, style checker, six one-round board reads, build report,
  content-reviewer copy at 95 with zero P0, and a cost cap. Board reads don't score-gate; an
  unresolved P0 stops the run. Boundary — storyboard plans and stops, produce builds an approved
  episode, autoproduce does both without stopping.
argument-hint: "<channel> \"<topic>\" [unattended]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "Agent",
  "WebSearch", "WebFetch",
  "mcp__social-flow__naver_search", "mcp__social-flow__serp_web_search",
  "mcp__social-flow__serp_news_search", "mcp__social-flow__serp_naver_search",
  "mcp__social-flow__datago_search", "mcp__social-flow__datago_detail",
  "mcp__social-flow__datago_file_download", "mcp__social-flow__datago_file_fetch",
  "mcp__social-flow__datago_api_call",
  "mcp__social-flow__image_local_generate", "mcp__social-flow__gpt_image_text2img",
  "mcp__social-flow__mlx_image_generate", "mcp__social-flow__mlx_image_edit",
  "mcp__social-flow__tts_local_generate", "mcp__social-flow__tts_generate", "mcp__social-flow__tts_elevenlabs_generate", "mcp__social-flow__tts_elevenlabs_dialogue",
  "mcp__social-flow__tts_list_voices", "mcp__social-flow__mlx_tts_generate",
  "mcp__social-flow__veo_img2video",
  "mcp__social-flow__music_generate_clip", "mcp__social-flow__mlx_music_generate"]
---

# From one topic to a finished video — unattended authoring

Runs `storyboard → produce` end to end without human approval. The input is a
single topic string; the output is a publishable `output/` set.

**This does not replace those two skills.** Contracts, templates, and builders
are all used as-is from them — this document decides only two things: **who
judges when no human is present** and **which model to use**.

```
/social-flow:autoproduce <channel> "<topic>"              # human invocation — confirm the result at the end
/social-flow:autoproduce <channel> "<topic>" unattended    # growth-loop invocation — no questions
```

## What stands in for the human gates

The pipeline's safety used to hang on the double HITL gate (storyboard
approval, publish approval). Unattended mode puts **the machine verdicts** in
their place (the slide verdict applies only when the episode has slide scenes). If even
one fails, the video still gets made but **does not enter the queue** (`queue_*: hold`)
— meaning it won't publish until a human looks at it.

The six board reads (storyboard §4.5–§5.5) run **once each, with no score to clear**.
**Scenario and narration are the exceptions:** three candidate pages loop to **≥95 · P0 = 0**
before the pick (storyboard §2.2), and the narration alone loops to the same bar after the
story pass (§3.5 here, storyboard §4.4). What stops the run on a board read is a **P0 still
standing after that one round's fixes**; what stops it on scenario is a topic with **no
candidate at 95**, and on narration a chain still short at the fifth read.

| What a human used to check | Unattended replacement | On failure |
|---|---|---|
| Are the facts right | Time-sensitive values cross-checked against 2 independent sources + **3 or more** verified facts | Topic discarded (§2) |
| Does the copy read like a human wrote it | `check-style.py` exit ≤ 1 per surface (4 = not Korean, so unchecked — it needs a human, and unattended runs stop at it) | Fix and retry; abort after 2 failures (§4·§9) |
| Is the story worth telling (both formats) | three seven-item candidates scored on curiosity · fear · intrigue · comedy → **≥95 · P0 = 0** | Topic dropped (§2.2) |
| Does the narration alone carry the episode | storyboard-reviewer narration mode, looped → **≥95 · P0 = 0** (cap 5 reads) | Authoring aborted (§3.5) |
| Is the storyboard copy approvable | storyboard-reviewer copy mode, one round → **P0 = 0 after the fixes** | Authoring aborted (§4.5) |
| Does every single scene do its job | storyboard-reviewer scene mode, one round → **P0 = 0 after the fixes** | Authoring aborted (§4.6) |
| Is the wording what a person would say | storyboard-reviewer vocabulary mode, one round → **P0 = 0 after the fixes** | Authoring aborted (§4.7) |
| Does the shot grammar serve the feel, and is the camera plan buildable | storyboard-reviewer camera mode, one round → **P0 = 0 after the fixes** | Authoring aborted (§4.8) |
| Does the episode's sound hold up | storyboard-reviewer sound mode, one round → **P0 = 0 after the fixes** | Authoring aborted (§4.9) |
| Do the images match the scene content | storyboard-reviewer image mode, one round → **P0 = 0 after the fixes** | `queue_*: hold` (§6.5) |
| Does the video hold together | `build-report.txt` drift 0 · 0 missing reveals · voice-to-bed separation ≥ 4 LU | Abort (§8) |
| Is it fit to publish | content-reviewer **copy ≥95 · P0 = 0** (max 2 rounds unattended) | `queue_*: hold` (§10) |
| Is the spend allowed | `cost-report.sh --cap` exit 0 | Escalation cancelled, back to economy baseline (§5) |

## Absolute rules

1. **Banned subject matter is inherited** — profile §3's banned subjects, plus
   the growth plan's banned list on unattended calls. Politics, religion,
   nationality-based disparagement, and unverified regulatory information go out
   through no path.
2. **Never invent facts** — numbers that failed verification stay out, and a
   range is never collapsed into its upper bound. Automated authoring doesn't
   lower the bar.
3. **Never change the TTS engine/voice set in profile §2** — don't move a
   `gemini` channel to local because local is cheaper. The narrator would change
   from episode to episode.
4. **Start at the economy baseline** — `references/cost-tiers.md` is the source
   of truth for the model ladder and escalation conditions. Escalate only when
   observed metrics say so.
5. **Unattended mode does not publish** — this skill goes no further than
   stamping the queue markers. Publishing is done by the growth loop's slot step
   or the publish skill.
6. **Never author without the lock** — two growth loops can run on the same
   channel at once (§0). Enter without the lock and the same topic gets made
   twice, and paid for twice.
7. **No more than 2 episodes per platform loop per day** — the YouTube plan and
   the Instagram plan each get at most 2 a day. Successes and failures count
   together, per caller (plan) — that's why `autoproduce.json`'s daily bucket
   keeps callers separate. A plan's `daily_produce_cap` can only lower this,
   never raise it. Calls made directly by a human sit outside this cap — the
   human is deciding the episode count right there.
8. **Never tell the same story twice** — a candidate topic must pass §1's
   `check-duplicate.py` verdict. Different slug, same content is still a rehash,
   and a rehash costs you both Instagram's originality assessment and the
   channel's credibility.

## Deliverables

Keep `storyboard/` in its entirety — the unattended gates can't be audited
without evidence, and the publish, queue, and QA harnesses all read these files.

```
data/<channel>/episodes/<topic-slug>/
├── storyboard/
│   ├── research.md      # sources, check dates, verification status — for automated authoring this is the only audit trail
│   ├── candidates/      # d1.md · d2.md · d3.md — three scored scenarios (gate 6a)
│   ├── scenario.md      # the winner, copied after the pick
│   ├── scenes.js        # SoT
│   ├── storyboard.md    # status, auto_produced, queue markers in the frontmatter
│   ├── storyboard.html
│   └── images/
├── .work/
│   ├── cost-estimate.tsv # pre-spend projection — for cap verdicts only (§5)
│   ├── cost-tally.tsv   # what was actually used and how much (appended line by line from §6 on)
│   └── …
└── output/
    ├── video/           # video.mp4 (clean) · video-sub.mp4 (burned-in) · subs.srt · cover.jpg
    │                    #   · build-report.txt · cost-report.txt
    ├── instagram/caption.md · youtube/meta.md · (per platform)
    └── publish-log.md
```

## Procedure

### 0. Load · lock · budget

Load `data/<channel>/profile.md` (abort if missing). On an unattended call,
also read the calling growth plan's `autoproduce:` block.

**The lock is per channel** — two growth loops share one channel, so a
per-platform lock is useless. Use `mkdir`'s atomicity.

```bash
G=data/<channel>/growth; LOCK=$G/.autoproduce.lock
TOKEN=$(uuidgen)                     # ownership token for this run
mkdir -p "$G"
# held longer than 60 minutes = dead lock (Veo async takes at most 6 minutes, so the margin is generous)
[ -d "$LOCK" ] && [ -n "$(find "$LOCK" -maxdepth 0 -mmin +60 2>/dev/null)" ] && rm -rf "$LOCK"
mkdir "$LOCK" 2>/dev/null || { echo "another loop is authoring — skipping this tick"; exit 0; }
printf '%s %s <caller>\n' "$TOKEN" "$(date -u +%FT%TZ)" > "$LOCK/owner"
```

Once you hold the lock, **release it no matter how the run ends — success,
failure, or abort.** Forget, and the next tick waits 60 minutes. But before
deleting, **check the lock is still yours.**

```bash
grep -qF "$TOKEN" "$LOCK/owner" 2>/dev/null && rm -rf "$LOCK"
```

An unconditional `rm -rf` fails like this — while my run drags past 60 minutes,
the next tick declares the lock dead, reclaims it, and creates its own. My run
finishes late and **deletes someone else's lock.** A third loop then slips
through the gap and authoring overlaps on the same channel.

Read today's and this week's totals from `$G/autoproduce.json` (create if
missing). If any of the following trips, don't author — report the reason.

- Unattended call: today's authored count **for this caller (plan)**
  (successes + failures combined) ≥ **min(plan `daily_produce_cap`, 2)** — the
  2 is absolute rule 7's per-platform hard cap, which no plan can raise. Human
  calls (`user`) get no episode cap.
- Accumulated cost (channel-wide — summed across all callers) exceeds the
  plan's `daily_cost_cap` or `weekly_cap`

```json
{
  "channel": "ttalkkak-lab",
  "daily":  { "2026-08-11": { "counts": { "youtube": 1, "instagram": 0, "user": 0 }, "usd": 0.054 } },
  "weekly": { "2026-W33":   { "count": 3, "usd": 0.162 } },
  "producedTopics": [
    { "slug": "20260811-visa-fee", "title": "비자 수수료 인상", "at": "2026-08-11T09:12:00+09:00",
      "usd": 0.054, "tier": "economy", "by": "youtube", "queues": ["youtube", "instagram"] }
  ]
}
```

Counts are per caller (`counts`), cost is channel-wide (`usd`) — episode caps
are meant to apply per platform, while the money comes out of the same wallet
no matter which loop spent it.

### 1. Settle the topic

If a topic came in as the argument, use it as-is. On an unattended call with no
argument, follow the plan's `topic_source`.

- **`pool` (default)** — one unused entry from the plan's `topic_pool`. The
  list was human-approved, so there's no subject-matter risk. **If it's empty,
  don't author — report "topic pool exhausted"** — never make topics up.
- **`keywords`** — run `naver_search(type: "kin")` on the plan's
  `topic_keywords` and pick something people are actually asking. On Naver
  Knowledge-iN, "what people don't know" sits there in their own question
  wording — raw material for hooks. Use this mode only when the user explicitly
  picked it at init.
- **`scout`** — use one topic picked in
  `data/<channel>/growth/keywords/market-keywords.md` (or the top of the
  keyword table if none is marked). These are phrases `/social-flow:topic-scout`
  extracted from videos at 5x or more the channel median. If the file is
  missing or older than 14 days, don't author — point to topic-scout. Don't
  re-call the tool every tick — search.list costs 100 units per call.

**Topic-axis gate** — check the candidate against profile §1's topic areas and
target. `pool` usually passes naturally (it's a human-approved list); what this
gate actually catches is `keywords` search results and topics passed in as
arguments. Off-axis: unattended mode drops the candidate and moves to the next
(same counter as the duplicate gate — two drops combined and this run gives
up). Human-invocation mode shows where it diverges and asks whether to
continue. If the topic areas are empty, treat it as a pass but note it in the
report.

**Duplicate gate (absolute rule 8)** — once a candidate is set, judge it before
authoring starts. Exact slug matches (`producedTopics`, existing directories)
were filtered earlier, but **the same story in different words** — like
"비자 수수료 인상" and "베트남 비자 수수료 오른다" (two phrasings of "visa fees
are going up") — has to be caught without a human, so run the deterministic
checker.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
python3 $REF/check-duplicate.py --channel-dir data/<channel> \
  --title "<candidate title>" --message "<one-sentence core message>"; echo "dup_exit=$?"
```

It compares against **every existing topic** on the channel (human-made ones
included), extracting the slug, the storyboard.md title, and the scenes.js
cover title from each. Read `dup_exit` literally —
0 new / 2 **suspected duplicate** / 1 verdict unavailable / 3 input error.

- **2** — unattended mode drops the candidate and moves on (as in §2, two drops
  and this run gives up). Human-invocation mode shows the closest existing
  topic and asks whether to continue — only a human can judge a follow-up on
  the same material (a different angle).
- **Never read 1 as new** — it means the channel directory couldn't be read, so
  abort and report.
- Channels whose titles share a series prefix trip the threshold easily. Raise
  the plan's `duplicate_threshold` (default 0.5) and pass it via `--threshold`,
  or have a human make that channel's episodes with storyboard.

Build the slug by profile §7's rules.

### 2. Research & verification (gate 1)

Research per profile §5 policy. Tool order and quota thrift:
`references/cost-tiers.md` §non-money budgets — **`serp_*` at most twice per
episode**.

Research is the step before any scene is written, and it follows the storyboard
skill's §2 shape inside the quota — **two passes, a pick in between**:

1. **First research (§2.1)** — write the direction-finding question map (3–5 rows:
   what people ask, what's true, which explanations compete), search per question
   from two directions (`kin`·`news`·`blog` on naver_search, WebSearch, `datago`
   for government-origin figures), log **ten or more** searches, and write **three
   directions** in `research.md` §Directions. Each row is a different episode this
   topic could be (question · hook form · primary engine · hero · what the second
   pass still owes), not three wordings of the same two lookups. Three different
   primaries from `curiosity` · `fear` · `intrigue` · `comedy`.
2. **Three candidates, then pick one (gate 6a / §2.2 below)** — don't start the
   second pass before `Chosen:` is on the page.
3. **Additional research (§2.3)** — rewrite the question map to the chosen
   episode's 5–8 questions, write off the unchosen directions' questions, search
   the remaining claims. The two `serp_*` calls go to the freshness check on the
   most time-sensitive value. One counter-evidence search on each key claim. Record
   [question map · directions + pick · claim · source link · date checked ·
   verification status · counter-evidence result] in the storyboard-template.md
   structure. Time-sensitive values (prices, tax rates, deadlines, effective dates)
   need 2 or more independent sources, and a question that ends unanswered is
   written off — it never becomes a claim or a caption.

**Fewer than 3 verified facts after the first pass: drop the topic and move to
the next candidate.** This is where a human would stop and say "there's no video
in this." Push on short of facts and what you end up with is an empty video that
only looks the part. Two dropped candidates and the run gives up and reports.

Before offering the three directions, then again before the first scene, run the
exit checks the storyboard skill runs — the agent that did the searching is the
one writing the line that says the searching was enough:

```bash
SB=${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references
node $SB/check-research.js storyboard/ --direction   # exit 1 = not enough to pick → drop the topic
node $SB/check-research.js storyboard/               # exit 1 = the research does not close → drop the topic
```

### 2.2 Scenario candidates (gate 6a — storyboard-reviewer scenario mode)

Both formats. After the three direction rows and `check-research.js --direction` exit 0,
write three candidate pages — **the seven items, in order, on every one**: 주제 · 훅 (a
dramatised scene that invents no fact) · 전개 #1 (what actually happened) · 전개 #2 (what it
makes us think about now) · 전개 #3 (2–3 present-day cases, a search-log row each) · 마무리
(what do you think?) · CTA — and loop each to **≥95 · P0 = 0** on **curiosity · fear ·
intrigue · comedy** before the pick — storyboard §2.2 and
`../storyboard/references/scenario-stage.md`. A page that only explains, a hook that is the
start of the timeline, or a feel curve that never dips costs nothing to fix here and costs
the whole board later. Three different primaries. Naming an engine is not enough — the
items have to run it.

**Delegate each `candidates/d<n>.md` to the storyboard-reviewer agent (Agent) in
"scenario mode"** and read the tail
`STORYBOARD_REVIEW: mode=scenario score=NN p0=N primary=<engine> secondary=<engine|none>`.
Pass the candidate path, `research.md`, `profile.md`, `scenario-craft.md`,
`scenario-stage.md`, and the claimed primary.

- **Apply the findings, P0 first**, then re-delegate that page (max 3 reads). Still short:
  replace the candidate with a different primary or question (one replacement, 2 more
  reads). Cap 5 reads per candidate, 15 per episode.
- **Pick the highest at ≥95 with `p0 = 0`.** Unattended does not ask. Copy it to
  `scenario.md`, write `Chosen: D#`, then §2.3.
- **Zero candidates at the bar: drop the topic** — same counter as a facts-floor drop.
  Write `storyboard.md` with `status: draft` · `queue_*: hold` and the last tails in the
  body, then report. Nothing has been generated yet.

### 3. Authoring scenes.js

`../storyboard/references/scenes-schema.md` is the contract's source of truth;
design rules follow storyboard skill §4 as-is, including its two passes — the story
layer first (`beat`·`shot.feel`·`shot.info`·`shot.infoType`·`narration`·`arc`·`hookType`/`hookForm`·`title`, checked
with `check-scenes.js --draft`), the machine layer after §4.6's findings land.
**Write `storyboard/scenario.md` at §2.2** (the scored winner — storyboard
`../storyboard/references/scenario-stage.md`) and freeze it before the board. Both
formats. If §2.3 extra research breaks a beat, loop that one page to 95 again (3-read
cap, no replacement) before §4.
The rules automated authoring breaks most often:

- Write `window.COMPREHENSION` before the scenes: one governing question, one answer, one
  takeaway, no cross-scene branch in a short informational episode, and every unfamiliar term
  paired with its exact same-shot plain wording. A scene whose `shot.info` reaches neither the
  answer nor the takeaway is removed.
- A short informational episode plans 1–3 moving diagram slides with
  `treatment:"editorial"`. Each carries a `role` (`evidence` · `relationship` · `mechanism` ·
  `timeline` · `statistic` · `transition` · `verdict`) and one repeated episode-wide `motif`. A photo-backed
  moving diagram uses `treatment:"photo-action"` and changes the photographed subject or
  evidence itself; moving a rectangle, caption, glow, or whole photo does not qualify.
- Classify each narrated beat before picking the image: ordered periods or dated events are
  `shot.infoType:"timeline"`, measured counts·rates·shares·comparisons are `"statistic"`,
  causes·mechanisms·state changes are `"principle"`, and the rest is `"other"`. The first three
  use the mandatory moving editorial diagram and mapped role, with one allowed
  `slide.motionBeats` primitive per narration group. They never fall back to a still or footage.
  A principle frame sits ink actors (`slide.arts` · `h.fig`) and draws hairline relations
  (`h.stem` · `h.bus` · `h.chamber` · `h.ring` · `h.press`). Named states may skip arts.
  Shape primitives require arts, generated at §6.6.

- Cover title **within 16 characters + topic word required**. All stimulus and
  no subject gets swiped past. Open the title with **a problem a stranger
  already feels**, not a method or a tool (platform-playbook §1 ② ·
  scenes-schema §cover).
- Narration is **an array of segments (sentences)** — one sentence, one reveal.
  Character caps: cover ≤40, points/quote ≤50, 8–25 per sentence.
- `tts` holds the Korean phonetic spelling ("4,700만"→"사천칠백만"), `sub` the
  original notation.
- THEME copies profile §3's values verbatim.
- Structure: hook + drip (1–n) + spoken CTA (4–7 shots, typically 2–5 drips);
  main body 35–75 seconds. The shared outro is not the spoken close.
- The opening leads with one of **fear, empathy, or curiosity** — exactly one
  per episode, always. Pick it before authoring and record it on the cover shot
  as `hookType` (`fear`·`empathy`·`curiosity`). **Do not use `spoiler` on a
  short.** The cover title, segment ①, and the platform titles all carry that
  stimulus. Fear needs the threat backed in research.md or cushioned with
  possibility phrasing, and the drip shots must answer it — in the unattended
  loop, unbacked fear is blocked by copy-gate P0-4 (scenes-schema §the four
  opening strategies).
- Next to `hookType` write **`hookForm`** — the shape of the first line, one of
  `paradox`·`gap`·`identify`·`number`·`secret` (scenes-schema §the six hook
  forms). **Do not use `payoff` on a short.** Keep it: a gap the last drip never
  closes or a secret the drips never reveal is the early-exit trap the platform
  now punishes (user-relayed, 2026-08-23 — field-practice grade). **The first
  frame has no logo, no intro, no greeting** (big title, strong frame, movement
  in it), and **every narration sentence opens curiosity, moves the information
  forward, or puts evidence down — or it's cut** (copy-gate P0-11). Subtitles are
  written for muted viewing — one sentence, one subtitle, 4–7 words.
- **A short is always hook → drip (1–n) → cta.** Do not default to
  `answer-first`. Write `beat:"hook"` on the cover, `beat:"drip"` on every
  middle shot, `beat:"cta"` on the last narrated shot. n ≥ 1. Do not write
  `hooking` · `result` · `body` · `turn`. The cover opens a gap and does not
  speak `COMPREHENSION.answer`; each non-final drip pays one piece and opens
  the next gap; the last drip is the first place the answer is complete; the
  CTA is a spoken shot with one outward act (a comment question or a next-episode
  promise). An outro asset is not the spoken close.
  Copy the approved scenario's three verbatim lines into the `scenes.js` header
  comment — the 훅's first sentence, the 마무리 question, the CTA callback — and lay
  the seven items onto beats with scenario-stage's item-to-beat map (a short:
  hook · drip × 전개 · cta; long-form by the cover's arc — `story` puts 전개 #2 at the
  turn, `answer-first` plays its present answer as the result first).
  **Long-form still follows the cover's `arc`** — `answer-first` (default):
  cover → hooking → result → body; `story`: cover → hooking → body → turn →
  result. Material that is an unfinished sentence on its own is story material
  on long-form only (scenes-schema §playback order).
- One entry is one shot. Write `scene`·`sceneSlug`·`shot.feel`·`shot.size`·
  `shot.angle`·`shot.info`·`shot.infoType`·`shot.space` and `visual.picture`·`visual.overlay` (source of
  truth: scenes-schema §grammar units and production layers). **Feel first** —
  say what the audience should feel on the shot, then take the size and the angle
  (and the move and length on a generated shot) from the feel → technique table
  (`../storyboard/references/directing-grammar.md` §5). Write `shot.space` (`frame:
  "camera"`, `layout` from the camera, `facing` as the visible result, `line` when two
  people, or a person and what they look at, share the scene) and assemble `bgPrompt` with
  `../storyboard/references/assemble-bg-prompt.js` — do not write `left view of`,
  object-centric left/right, or metres. Hook cut and speech clips at `eye`, one close-up
  (`cu`·`choker`·`ecu`) per scene. Never merge AI video and HTML staging into one slot.

### 3.5 Narration read-through gate (gate 6f — storyboard-reviewer narration mode)

The story layer is done when the spoken sentences alone carry the episode (user
directive, 2026-09-02) — unattended there is nobody to hear the gap a picture was
going to fill, so this reads for it before any money goes out. Runs after
`check-scenes.js --draft` exits 0 and before the style gate, because it rewrites
narration.

**Delegate to the storyboard-reviewer agent (Agent) in "narration mode"** and read
the tail `STORYBOARD_REVIEW: mode=narration score=NN p0=N`. Pass
`scenes.js`·`scenario.md` (if present — a skip-research channel has none)·`research.md`·`profile.md`. The reviewer extracts the
sentences itself (`extract-text.js … subtitle`) and reads them before it opens
anything else.

- **Apply the directives as spoken sentences** — an antecedent, the present link,
  what the case has to do with the topic, the term's plain wording — never as a
  caption or a picture. Re-run `--draft`, re-delegate saying what you applied.
- **Loop until ≥95 · P0 = 0. Cap 5 reads.** Still short at the cap: stop the run
  as in §4.5 — `storyboard.md` with `status: draft` · `queue_*: hold`, the last
  verdict in the body, and report. Nothing has been generated yet.
- **If §4.5–§4.7 change any narration segment, one confirming read runs after
  §4.7** inside the same cap; a drop below 95 is fixed and read again before §4.8.

### 4. Style gate — video surfaces (gate 2)

```bash
PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
for S in narration subtitle screen; do
  node $PG/extract-text.js ./storyboard/scenes.js $S > .work/text-$S.txt || { echo "[$S] gate_exit=3"; continue; }
  python3 $PG/check-style.py --surface $S .work/text-$S.txt; echo "[$S] gate_exit=$?"
done
```

0 pass / 1 warning / 2 S1 detected / **3 means the gate didn't run — that is
not a pass**. On 2, **fix scenes.js** and redo from §4 — fixing only
`.work/text-*.txt` desyncs it from the video.
Still 2 after two fixes: abort and report — this keeps the unattended loop from
polishing the same sentence forever.

### 4.5 Copy review gate (gate 6 — storyboard-reviewer copy mode)

The check above is the cheap screen; this is the verdict. The reviewer sees the
layers a machine can't catch — overworked antithesis, lists of three,
sermonizing wrap-ups, rhythm that reads out in same-length sentences, unbacked
assertions. **Pass gate 2 first, then call**: delegating with exit 2 still
standing spends a round on what the machine already knows.

**Delegate to the storyboard-reviewer agent (Agent) in "copy mode"** and read
the tail `STORYBOARD_REVIEW: mode=text score=NN p0=N`. Pass the
`scenes.js`·`research.md`·`profile.md` paths. **One round — don't delegate copy
mode again.**

- **Apply the findings, P0 first**, then on to §4.6. The score goes in the §10
  report; nothing branches on it.
- **A P0 you could not resolve stops the run.** Don't make the video — spending
  money and time on images, TTS, and the build while the copy isn't there is
  the most expensive failure. This path never reaches §10, so **create
  storyboard.md here** (§10's frontmatter format, `status: draft` ·
  `queue_*: hold`), write the unresolved P0 into the body, and report — the
  thread a human picks up has to be in the file.

**Only subtract** — plant a new simile or stock phrase while scrubbing AI tells
and that's the new AI tell.

### 4.6 Per-scene review gate (gate 6b — storyboard-reviewer scene mode)

The copy gate saw the storyboard as one block; here each **scene is judged on
its own** — this catches the episode whose average is fine while one scene has
collapsed. The unattended path has no human flipping through the storyboard
asking "why is this scene here?", so this gate stands in for that eye.

**Delegate to the storyboard-reviewer agent (Agent) in "scene mode"** and read
the tail `STORYBOARD_REVIEW: mode=scene score=NN p0=N worst=N`. **`score` is the
lowest-scene score**, so it points at the thinnest scene. **One round.**

- **Apply the findings, starting at `worst`**, then on to §4.7. Role-gap and
  duplication findings can't be fixed by polishing sentences — merge or drop
  that scene and rebalance total length across the remaining scenes. If a short
  is not hook → drip → cta, reorder the beats rather than rewriting sentences.
  If the method sits ahead of the result on long-form answer-first, don't touch
  the sentences — move the result scene forward; on a story arc it is the
  reverse — a payoff sitting ahead of the turn moves back behind it. Adding or
  dropping a scene changes sentences §4.5 already read;
  apply its rule (only subtract) as you rewrite instead of rerunning it.
- **A P0 you could not resolve stops the run, as in §4.5** — this is still
  before money goes to images and TTS.

**Fill the machine layer now, including `window.MOTION_POLICY`, then run the full contract
before §4.7:**

```bash
SB=${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references
node $SB/check-scenes.js storyboard/          # exit 1 = authoring stops before generation
```

The profile's true-motion floor and still-run limits are hard gates here. Ken Burns, caption
changes and still swaps do not count. Do not lower the copied policy or the channel profile to
make an unattended episode pass.

### 4.7 Vocabulary review gate (gate 6c — storyboard-reviewer vocabulary mode)

With the scene structure settled, this looks at **words only**. The checker
catches only the forms written into its rules, so literary vocabulary like
"기한이 도래합니다" (stiff officialese for "the deadline is coming") passes
with exit 0 — the reviewer covers that layer.

**Delegate to the storyboard-reviewer agent (Agent) in "vocabulary mode"** and
read the tail `STORYBOARD_REVIEW: mode=lexicon score=NN p0=N worst=N`. Here too
`score` is the lowest-scene score. **One round.**

- **Swap only the flagged words**, then on to §4.8. Rewriting whole sentences
  collapses the structure §4.5·§4.6 already read, and nothing runs again to
  catch it.
- **A P0 you could not resolve stops the run** (handled as in §4.5).

### 4.8 Camera review gate (gate 6d — storyboard-reviewer camera mode)

Every shot carries a feel and the dials that serve it — size, angle, and on a
generated still the frame space — and every shot that becomes a generated video
carries four camera slots on top. Unattended this
gate matters more than anywhere else: a size that flips the feel is drawn into
the still nobody looks at, and an empty `end` slot buys a clip whose last second
drifts, and on this path nobody watches it before it publishes.

**Delegate to the storyboard-reviewer agent (Agent) in "camera mode"** and read
the tail `STORYBOARD_REVIEW: mode=camera score=NN p0=N worst=N`. Pass
`scenes.js`·`profile.md` plus the `directing-grammar.md`, `video-model-selection.md`
and `scenes-schema.md` paths. **One round.**

- **Apply the findings, starting at `worst`**, then on to §4.9.
- **This gate runs on every episode** — an episode with no generated shots is
  scored on the shot grammar (feel · size · angle · space) alone, and the slot axes come
  back `n/a` per shot. A number always comes back.
- **A P0 you could not resolve stops the run** (handled as in §4.5). An engine
  misassignment or a length that fights the purpose is money about to be spent
  wrong, so stopping here is the cheap outcome.

### 4.9 Sound review gate (gate 6e — storyboard-reviewer sound mode)

The picture has been read twice by now — its role and its camera — and the sound not at
all. This gate reads it while it is still text.

**Delegate to the storyboard-reviewer agent (Agent) in "sound mode"** and read
the tail `STORYBOARD_REVIEW: mode=sound score=NN p0=N`. Pass
`scenes.js`·`profile.md`·`scenes-schema.md`. **One round.**

- **Apply the findings**, then on to §5. Cues, drops and cue prompts are scenes.js
  fields, so those get fixed here, in the file.
- **Carry the "hand to produce" lines forward** — what is left is what has no
  field: the generation call, the engine. §6's BGM step is where they get used,
  and losing them here means nobody reads them at all on this path.
- **A P0 you could not resolve stops the run** (handled as in §4.5).

### 5. Tier decision + pre-spend estimate (gate 5)

Check the escalation conditions in `references/cost-tiers.md`. On an unattended
call, the growth loop passes in the insights it just read (YouTube
`averageViewPercentage` / Instagram `reels_skip_rate`) and **the verdict is a
trend** — average of the last 3 episodes vs. the 3 before, escalate only on a
worsening of 5+ points. Under 6 published episodes, or fewer than 3
new-baseline episodes since a hook-contract revision: **no escalation** (both
rules canonical in cost-tiers).

Write the projected tally to **`.work/cost-estimate.tsv`**. It stays separate
from the actual ledger (`cost-tally.tsv`) for one reason — pile estimates and
actuals into one file and §wrap-up's post-hoc report counts the same spend
twice.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
$REF/cost-report.sh .work/cost-estimate.tsv --cap <plan max_cost_per_video>; echo "cost_exit=$?"
```

exit 2 (over the cap): **cancel the escalation and come back down to economy
baseline** — not an abort. exit 1 (verdict unavailable): abort. Never spend
money without knowing the price.

### 6. Visual generation

- **Backgrounds — 1 cover + 2–4 points** — `size: "1088x1920"`.
  - **Cover background = `gpt_image_text2img` `quality: "high"`, a
    photorealistic human scene** (generated people only; default a Korean
    woman — per profile §3's target. Absolute rules 11·12) — the cover frame
    becomes cover.jpg (the thumbnail) as-is. Make the topic legible at a
    glance; use `seen from behind, face turned away` instead of
    `face not visible`. On escalated episodes this PNG doubles as the veo
    source.
  - Points backgrounds: **`image_local_generate` (local Z-Image — the default,
    $0 per image)**, **2–4 photorealistic shots of the topic** — the photo is
    the star (absolute rule 14), so reusing one image turns the whole body into
    a single frozen frame. Change the shot when the content axis changes, but
    keep continuity: same person and space, different angle. Prompts follow
    storyboard §5's conventions — one `assemble-bg-prompt.js --from scenes.js
    --shot <n>` call (`<n>` from 1, the same number as `scene-<n>.png`) with
    `--scene`, `--mood` (profile §3) and `--exclude` (the
    required negative directives — the image tools have no exclusion argument,
    so the noun list rides in the body), stdout stored as `visual.bgPrompt`.
    `storyboard/images/scene-<n>.png`. Each image takes minutes — no problem on
    the unattended path, but avoid running alongside the video render. On a
    machine without mflux, the tool fails with install guidance — fall back to
    `gpt_image_text2img` (`quality: "low"`) for that episode only, and the
    **3-image cap for Gemini-TTS channels** comes back into force (4 images
    busts the default $0.30 cap — cost-tiers).
  - **Before generating, delegate to content-reviewer plan mode** and confirm
    `PLAN_REVIEW: PASS p0=0` (absolute rule 13) — this gate is a machine
    verdict, so the unattended path needs no human here. On FAIL, fix the plan
    and re-delegate (max 2 rounds; still short, abort the episode).
- **Opening b-roll (only when escalated)** — `veo_img2video`
  (`aspectRatio: "9:16"`, `resolution: "1080p"`, `durationSeconds: 8`, model
  `veo-3.1-lite-generate-preview` — in blind-arena testing the three tiers'
  quality was statistically identical, so use the cheapest).
  **The source is the cover-background PNG already made in §6** — produce
  absolute rule 8 bans `veo_text2video` (the same prompt renders a different
  scene every time, so there's no baseline to roll back to).
  This slot is Veo-only because of sound — under absolute rule 9 the b-roll
  segment uses the clip's own audio, so it's no place for the cheaper-but-silent
  Seedance. A photorealistic adult person in the cover background is accepted
  as-is by Veo's image lane (measured 2026-08-15). **But if the source shows
  anyone who reads as a child or teenager, this lane is blocked**
  (Support code 17301594) — the plan gate catches it first as P0-10, but if
  generation drops into no-response, remake the person as an adult and retry
  that episode.
  **Generate 8 seconds (1080p is 8-second-only); use only the broll scene's
  `duration` (default 4s)** — per produce §6's trim+mix conventions, cut from
  the head of the original and keep the original. No upscaling (the body is
  1080×1920 — user decision 2026-08-11 not to go down to 720p).
  **Send the scene's stored `visual.prompt` verbatim**, with `visual.negative`
  in the `negativePrompt` argument (scenes-schema §clip prompt); an older
  scenes.js with no stored prompt gets the fallback assembly — English, motion
  only, one line of audio directives at the end. Re-describing what's already
  visible in the source image makes the model
  redesign the scene. `.work/broll/broll-a<after>.mp4`
  (`broll-a0.mp4` for the opening slot).
  - **The unattended loop escalates at most 1 slot on its own** (cost-tiers
    §escalation). The schema allows 2, but veo bills on generated length, so
    one more slot doubles the episode's spend. Still, **if the storyboard has 2
    slots written in, make both as written** — dropping an approved scene over
    cost makes the video diverge from the plan.
  - **Never make the cover itself a generated video** — Veo can't write Korean
    text (absolute rule 10). The cover stays code-rendered; the b-roll goes in
    **the segment after the cover**.
  - **No narration over that segment** (absolute rule 9) — the video's own
    sound plays. That scene is `narration: []` with no subtitles either, so
    after the §8 build `splice-clip.sh` shifts the later subtitles by the
    measured inserted length. **No palindrome loops** — the audio plays
    backwards.
- **BGM** — **unattended runs take one bed**: the storyboard step leaves `window.MUSIC`
  out and this step copies or generates a single `.work/bgm.wav`. If the channel has a
  shared bed, just copy it.
  `python3 ${CLAUDE_PLUGIN_ROOT}/skills/channel/references/resolve-asset.py data/<channel> bgm default`
  — if a path comes back, copy it to `.work/bgm.wav`. Otherwise put a
  30-second `music_generate_clip` instrumental at `.work/bgm.wav`. Include
  "leaves space for a spoken voiceover, no melody in the vocal frequency range"
  in the prompt. To reuse the same tone next episode, copy it to
  `assets/audio/bgm/default.wav` and add it to the catalog.
  **No `window.MUSIC` cues unattended.** Cues are made with `music_generate`
  (variable length), whose price is unconfirmed in `prices.tsv` — `cost-report.sh`
  would answer "verdict unavailable" and §5 would abort the run (cost-tiers §BGM says
  the same: the economy tier takes one bed, not cues). If a scenes.js arrives with
  `window.MUSIC` anyway, remove it and every shot's `sound.cue` before §6 and go on
  with one bed; cue-based scoring is the human produce path.
  **Never call `suno_*` unattended** — vocals fight the narration. An episode
  where the song is the content is the human produce path's `suno_generate`.
  The level is not a decision here: the builder measures the narration, sets the
  bed 10 LU under it, and **stops the run if the separation lands under 4 LU**
  (produce `references/bgm-scoring.md`).

After every call, append one line of actual usage to `.work/cost-tally.tsv` —
this file, not §5's estimate file. Line format and units (veo = generated
length, tts = characters ÷ 1000) are canonical in `references/cost-tally.md`,
and the manual path (storyboard·produce) writes the same-named file under the
same conventions.

### 6.5 Image review gate (gate 7 — storyboard-reviewer image mode)

Plan mode saw the prompts; this sees **the images that came out**. On the
unattended path no human ever looks at the images, so this gate is the only
eye — it catches images unrelated to what the scene says, baked-in
pseudo-characters, and bright lower thirds (which drown the subtitles).

**Delegate to the storyboard-reviewer agent (Agent) in "image mode"** and read
the tail `STORYBOARD_REVIEW: mode=image score=NN p0=N`. Pass the full
`images/scene-*.png` paths plus `scenes.js`·`profile.md`. **One round.**

- **Regenerate only the flagged images**, then on to §7. When you decide to
  regenerate, **put that line on `.work/cost-estimate.tsv` first** and rerun the
  `--cap` verdict as in §5 — over the cap (exit 2) means hold right there
  instead of regenerating. Don't run the verdict on the actual ledger: at that
  point it's missing **spend that hasn't gone out yet** (BGM, narration), the
  total looks small, and a cap-busting regeneration passes. When the call
  finishes, write actual usage to `.work/cost-tally.tsv` (§6 as-is).
- **The regenerated image is not read again** — one round means one read.
- **A P0 still standing** (including one on an image you just remade): finish
  the video anyway, but at **§10 wrap-up write `queue_*: hold`** along with the
  unresolved findings. An off-context cover becomes the thumbnail as-is, so a
  human has to see it.

### 6.6 Authored motion-frame gate

For every `visual.slide` scene, follow storyboard
`references/slide-authoring.md` before narration:

1. If `slide.arts` is set, generate each plate into `slides/assets/` first — flat ink
   illustration of the actor, paper fill on ink, no background, no readable text, no
   photorealism, local png. Log the call. Sit a principle actor with `h.fig`. Then author
   the HTML from the matching template. A principle frame is a `.cast` of actors plus
   hairlines (`h.stem` · `h.bus` · `h.chamber`). Editorial diagrams use the declared `role`
   and `motif`; they compose the whole frame rather than placing callouts over an unchanged photo.
2. Run `node $SB/check-slide.js storyboard/ --require-all`, render the sheet with
   `render-motion-slide.mjs --sheet --png-only --keep-frames`, and stop on either failure.
   For timeline, statistic, and principle scenes the render also matches every declared
   `motionBeats` primitive with the same group's `data-primitive`; a label reveal cannot stand
   in for the promised explanation.
3. Delegate the slide file and every sheet frame to `slide-reviewer`. Apply its directives and
   repeat up to three rounds. Only `score >= 95`, `p0=0`, `verdict=PASS` continues.

This gate is mandatory in unattended mode. A failed slide is not replaced with a still and the
motion policy is not lowered to get around it; abort before TTS and build.

### 7. Narration

Exactly produce skill §5 — **1 call per scene**, engine and voice pinned to
profile §2, the script is the full text of the narration segments' `tts`
sentences joined with periods, `.work/pcm/c<n>.wav`. Length check right after
generation (over 2× characters/4.5 → regenerate once).

If the local engine fails with "Python interpreter not found" /
"No module named 'supertonic'", **abort right there — do not switch to
Gemini**. A video with a changed voice publishing automatically is this
pipeline's worst possible accident.

### 8. Render & build (gate 3)

Build with `build-reel.sh`, following produce skill §2 (frame.html
regeneration) · §4 (reveal capture) · §6 (manifest) as-is. The overflow check
runs here too — produce §4's `--dump-dom` one-liner needs no browser tooling, so
unattended mode gets the same `ovf=0` verdict. On top of it, verify the captured
state PNGs are non-zero-size and the per-scene state counts match the manifest.

The `build-report.txt` verdict follows `../produce/references/pipeline.md`
§report gate table.
**drift ≠ 0, a missing reveal state, or an unused final reveal blocks
progress**. In unattended mode, blocked progress means abort — nothing enters
the queue.

**If b-roll was made, splice it here** (end of produce §6 — trim+mix first,
then splice):

```bash
mix_broll 0 4                                   # produce §6's mix_broll — broll-a0-mixed.mp4
$REF_P/splice-clip.sh .work .work/broll/broll-a0-mixed.mp4 "$(cardend 0)"
```

Never eyeball `T` — `cardend <after>` (produce §6) sums the confirmed lengths
of `card 0..after`, and that value is the scene's end time. **Never splice the
raw original** — skip the mix step and the veo sound sits 4+ dB under the body
while the BGM cuts out for just that stretch.
If the storyboard has 2 b-roll slots, pass **both clips in a single
invocation** (call it twice and the second run wipes the first splice).
In the splice output confirm **`0 straddled cues`** and **matching clean/burned
lengths**. If they diverge, don't queue it.

**Then run the speed pass — every episode, no exception** (produce §7.5). It
picks the spliced set on its own when a splice ran:

The factor comes from `.work/format.env`, which `build-reel.sh` and `speedup.sh`
both source. Write it when §6's build step writes the file (produce §1) — nothing
else in this skill does, and without the line a channel that put `1.0` in
profile.md §2 to ship at its recorded pace goes out at 1.2 with nobody watching.

```bash
grep -qF '${SPEED:=' .work/format.env \
  || echo ": \"\${SPEED:=<the factor from profile.md §2>}\"" >> .work/format.env
grep -F '${SPEED:=' .work/format.env   # echoes the line the pass will use
$REF_P/speedup.sh .work
```

Unattended, the marker is the check: `build-report.txt` has to gain a
`── speedup x…` line and a `PASS final speech rate` line. The pass blocks more than 6.2
spoken characters/s after every TTS and speed choice has taken effect. A non-zero exit aborts
the episode — nothing enters the queue. §9 moves that pass's `-fast` set to output.

### 9. Finalize output + platform text

```bash
cp .work/reel-fast.mp4 output/video/video.mp4
cp .work/reel-sub-fast.mp4 output/video/video-sub.mp4
cp .work/subs-fast.srt output/video/subs.srt
cp .work/cover.jpg .work/build-report.txt output/video/
[ -f .work/chapters-fast.txt ] && cp .work/chapters-fast.txt output/video/chapters.txt
```

**The `-fast` files are the deliverables.** Copy `reel.mp4` or `subs.srt` here
and the episode publishes un-sped with subtitles on the wrong timeline.

**Publishing is complete only with all three files** — the clean master and
`subs.srt` go to YouTube and Facebook, the burned-in copy to Instagram
(publish skill rule 8).

Rewrite the platform text per platform following the platform-guide playbooks,
and run the per-surface style check right after saving (produce §9's script
as-is). exit 2: fix and rerun; two failures and that platform's queue marker
doesn't get stamped. **Also run produce §9's batch check (check-batch)** — on
the unattended path nobody is around to notice "this reads just like the last
one", and since the growth loops call this skill repeatedly, this is where
channel homogenization piles up fastest. There's no verdict (rankings only) —
if a recycled phrase shows up in this episode, fix that sentence and move on.

### 10. Quality gate (gate 4) + wrap-up

Delegate to the content-reviewer agent — **frames pulled from the burned-in
copy** (the clean master has no subtitles, so typos and clipping don't show),
the platform copy, scenes.js, and §4·§9's exit codes.
If the channel skips research, state that too (the facts axis converts to full
marks).
**Revise until the tail (`CONTENT_REVIEW:`) shows copy ≥95 and P0 = 0;
unattended mode caps at 2 rounds.**

Wrap-up order:

1. `cost-report.sh .work/cost-tally.tsv > output/video/cost-report.txt`
2. Add the totals (daily/weekly count·usd) and a `producedTopics` entry to
   `autoproduce.json`
3. Update the storyboard.md frontmatter

```yaml
status: produced
auto_produced: true
approved_by: autoproduce/<calling growth plan, or user>
tier: economy            # economy | escalated
queue: ready             # approved platforms only — hold while P0s are unresolved
queue_instagram: ready
queue_at: 2026-08-11
```

4. Release the lock (`rm -rf "$LOCK"`)
5. Report — topic, slug, total length, tier, cost, queues stamped, the scenario
   and narration scores (with the read count), unresolved findings

**Human-invocation mode** presents the result here via AskUserQuestion and asks
whether to stamp the queue markers (paths, total length, cost, cover title,
key figures). Unattended mode doesn't ask — the plan is already the
authorization.

## Pitfalls

- **Never write `status` before stamping `queue_*`.** Flip the order and a
  gate-failed video can become visible to another loop on `status: produced`
  alone.
- **Skip the lock release and the channel freezes for 60 minutes.** Check it on
  every abort path.
- **Never call `serp_*` repeatedly in the research loop** — 250 calls a month
  is gone within a few automated episodes.
- **Don't let escalation become a habit.** When the metrics recover, the next
  episode is back on economy baseline.
- **Stop when the topic pool runs dry.** The moment automation starts inventing
  material, fact verification stops meaning anything.

## Additional Resources

### Reference Files

- **`references/cost-tiers.md`** — model ladder, escalation conditions, tiers banned from autonomous use, cap verdicts (source of truth)
- **`references/prices.tsv`** — generation-tool price SoT (with evidence grade and source; `?` = unconfirmed)
- **`references/cost-report.sh`** — tally × prices → report. The same calculator serves the pre-spend estimate and the post-hoc report
- **`references/cost-tally.md`** — per-episode ledger conventions (file location, line format, units, reading exits). The manual storyboard·produce path writes the same file under these conventions
- **`references/check-duplicate.py`** — topic duplicate verdict (character-bigram overlap against every existing topic, threshold 0.5 · 11 `--selftest` fixture pairs)

### Contracts reused from other skills

- `../storyboard/references/scenes-schema.md` — the scenes.js data contract
- `../storyboard/references/scenario-stage.md` — three candidates, viewer engines, 95-point loop
- `../storyboard/references/storyboard-template.md` · `storyboard-html-template.html`
- `../produce/references/pipeline.md` — build contract, report-gate verdict table, palindromes
- `../produce/references/speedup.sh` — the required speed pass (produce §7.5)
- `../produce/references/build-reel.sh` — the compositing pipeline
- `../platform-guide/references/platform-playbook.md` · `korean-style.md` · `check-style.py`
- `../../docs/guides/ai-video-production/index.html` — why hybrid is the default, Veo hard specs, prompt rules
