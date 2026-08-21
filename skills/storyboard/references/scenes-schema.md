# scenes.js data contract (SoT)

`data/<channel>/episodes/<topic>/storyboard/scenes.js` — the one data source produce
consumes after storyboard approval. `video-template.html` loads it with
`<script src="./scenes.js">`.

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
window.SCENES = [ /* the shot array — one entry = one shot. Keep the identifier names */ ];
```

Don't change the array name (`SCENES`), the filenames (`scenes.js`, `images/scene-N.png`),
or the capture index (`frame.html?i=n`). Those are the machine identifiers produce reads.
Only the human-readable labels move to shot, scene, and sequence.

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
| Ken Burns pan | not used | used (scale 1.06–1.35) |
| Outro asset | `outro.mp4` | `outro-16x9.mp4` |
| Filmed scenes | the episode is either all filmed or all generated | **mixed within one episode** (§filmed scenes) |

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

## Playback order — cover → hooking → result → body

This is the skeleton that reduces drop-off. The cover shows the result at a glance, hooking
hooks why it's needed, and the body unspools only after **the finished thing has been shown
ahead of the method**. Method before result means listening to an explanation without knowing
the destination.

| `beat` | Name | What it does | Where |
|---|---|---|---|
| `hook` | cover | Puts the finished thing in the first frame; the first line gives a reason to stay | `type:"cover"` — it's the cover even unwritten |
| `hooking` | hooking | Problem, harm, loss, resolve. Why that result is needed — catches what the cover threw (the chosen opening strategy) and doesn't unpack the answer | **right after the cover, in every episode** (§hooking) |
| `result` | result | Shows the finished thing properly. Scrolling, demo, before/after | **right after hooking, before the body** |
| `body` | body | The method, evidence, and steps that made that result | After the result has been seen |
| `cta` | next | What gets finished in the next episode | At the very end. `type:"outro"` lands here even unwritten |

The cover's first frame and the result scene point at the same artifact. The cover is the
glance; the result unfolds it so the built parts show. Don't unfold the same finished thing
again at the end of the body.

Left unwritten, the renderer reads it this way. `type:"cover"` → hook, `type:"outro"` → cta,
`sequence` opening with `결과` → result, `기획`·`방법`·`단계`·`내용` → body, opening with
`문제`·`후킹` → hooking. `storyboard.html` warns when there's no hooking shot or the shot after
the cover isn't hooking, and when the piece is a build, tutorial, or before/after comparison
whose result sits behind the body.

```js
beat: "result"                    // hook | hooking | result | body | cta
sequence: "결과"                  // sequence head. Used with beat, the document groups them into one block
```

## Fields common to every shot

| Field | Required | Description |
|---|---|---|
| `type` | ✅ | `cover` \| `points` \| `quote` \| `broll` \| `outro` — the role |
| `narration` | ✅ (except `broll`, `outro`) | Segment array `[{tts, sub}, ...]` — one sentence = one segment = one reveal |
| `visual` | ✅ | The visual plan object (below) |
| `duration` | recommended | Target seconds — estimated as narration characters / 4.5, capped at 13s |
| `scene` | recommended | Grammar scene number. Same value for the same place and time. Without it the renderer assumes one scene per entry |
| `sceneSlug` | recommended when `scene` is set | `"place / time"` — e.g. `"salon chair / day"` |
| `sequence` | optional | Sequence name. Only when one episode has two purposes |
| `beat` | optional | `hook` \| `hooking` \| `result` \| `body` \| `cta` — the playback role. See §playback order above |
| `shot` | recommended | `{ size, info }` — below |

```js
shot: {
  size: "ws",                              // ws wide · two two-shot · ms medium · cu close-up
  info: "that the recommendations split two ways"   // one line on what this shot newly tells the audience
}
```

- If `info` matches another shot in the same scene, that shot can be dropped. That's what
  coverage design is.
- When you open on a close-up, pay back "where are we" with a wide or medium in the next shot.
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
  slide: null,                       // long-form slide scene (§slide scenes) — { file, plan, labels }
  character: null                    // the channel's shared character id — resolve-asset.py character <id>
}
```

One shot can overlap a **screen body** and **staging over the screen**. A cover floating the
title and figure in HTML over a still photo is the default. Don't merge the two into one badge.

| `picture` | Screen body | The structural clue |
|---|---|---|
| `still` | Still photo or illustration. Ken Burns is added by the builder | `visual.bg` present, no `video` or `clip` |
| `ai-video` | Generated video — motion background, b-roll, speech clip | `type==="broll"`, or `visual.video`, or `visual.clip` |
| `recording` | **A clip the user filmed themselves** (§filmed scenes) | `visual.source==="recording"` |
| `asset` | A pre-made shared mp4 | `type==="outro"` |
| `slide` | **An HTML slide** — a text-and-shape diagram filling the frame (§slide scenes, long-form only) | `visual.slide` present |

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

## Contracts by type

### cover — the result in the first second, the promise in the first three

```js
{
  type: "cover",
  scene: 1,
  sceneSlug: "reporting desk / day",
  shot: { size: "cu", info: "that not filing means a fine" },
  hookType: "fear",                         // opening strategy — fear | empathy | curiosity | spoiler (§the four opening strategies)
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
  every single day". Solutions and methods belong to the hooking and body scenes. The kind of
  stimulus is whichever of §the four opening strategies is written in `hookType` — the
  "안 하면 과태료" in the example above is fear (`fear`).
- hookType: the strategy this episode's opening rides — one of `fear` · `empathy` ·
  `curiosity` · `spoiler` (showing the ending). Written on the cover shot only.
  Without it `storyboard.html` warns, and if none of the four is in the opening, it's a
  reviewer P0.
- reveal mapping: rg1=title ← segment ①, rg2=stat ← segment ②.

#### The first frame is the result, segment ① is a promise to the viewer

Build, tutorial, and before/after content shows **the finished result from the very first
frame** of `visual.bg` or `visual.shot`. It doesn't open on process screens, on an app being
launched, or on the speaker's face saying hello. The viewer sees the result in the first
second and hears why to keep watching in segment ①. Only informational topics that can't show
a result on screen use the problem situation or the key figure as the first frame.

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

The opening (cover title + segment ① + hooking — the first 20s of short-form, the first 60s of
long-form, the same window as the §hooking length) rides **one or more** of the four. Write
which one it rode on the cover shot as `hookType`. Overlapping two is fine — the first frame
showing the ending while segment ① opens on fear, say — and in that case `hookType` records what
the sound (segment ①) rides. **An opening with none of the four is a reviewer copy-mode P0.**

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
- **Hooking continues the strategy the cover picked.** The catch contract (same subject, same
  promise) is the hard rule; matching strategies isn't required — a cover opening on fear and
  hooking catching that loss with an empathy scene is natural. A title on fear with segment ①
  talking about something else counts as a catch violation.
- **Fear gets three guardrails.** ① The threat either has evidence in research.md or is hedged
  to a possibility, as in the example above ("~일 수도") — an unhedged assertion is an
  unverified assertion (P0). ② The body answers that threat — hooking catches it and the result
  and body unpack it. An opening that throws a threat and never unpacks it drags down the
  YouTube Intro metric (did the first 30 seconds match the title and thumbnail's promise).
  ③ The register is one of telling someone about a loss — not a scaring tone, and the polite
  register and spoken-surface rules (§title is a spoken hook, korean-style D9) hold.
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

### hooking — the shot after the cover. It hooks why they should stay

If the cover stopped the thumb, hooking carries the stopped person to the result. The two
stretches differ even in the metric the platform measures — the cover is the 3-second skip
rate, hooking is the drop-off curve over the first 30 seconds and first minute. **It exists in
every episode** — informational pieces too, not just builds. An informational piece may have no
result scene, but it still needs a "why stay". `type` is usually `points`, and it may be written
as `quote` when it's a character asking a question. Either way, write `beat: "hooking"`.

```js
{
  type: "points",
  beat: "hooking",
  scene: 1,                                  // same scene number when the place and time match the cover
  sceneSlug: "workroom / late at night",
  shot: { size: "ms", info: "that a night spent fearing no response is their own story" },
  title: "",                                 // usually left empty — the sound hooks, the screen shows the problem scene
  narration: [ {tts,sub}, {tts,sub} ],       // 1–3 segments. The viewer as the subject
  visual: { picture: "still", overlay: "html", bg: "images/scene-2.png", bgPrompt: "…" }
}
```

- **Where** — the shot right after the cover. An opening b-roll (`after: 0`) isn't a playback
  role but 4 seconds of the cover picture moving, so it can sit between — as long as the first
  shot after it is hooking. It comes before the result (in builds) and the first body scene.
- **Length** — short-form **1–3 shots · 4–15s**. Counting from the cover, the result (the first
  body scene for informational pieces) starts **within 20s**. Long-form is 1–3 shots · 20–60s,
  with the result inside the first 60s. These are provisional — the value sits between TikTok's
  6-second hook and YouTube's 30-second Intro, and of the two measured episodes buzz-agents
  (1 shot, 10s) is inside while neighborhood-change-radar (4 shots, 17.2s, result starting at
  20.6s) is outside. Revisit with average watch time and retention across 3 baseline episodes.
- **The four things it does** — this is where the sources overlap (evidence:
  [hooking research](../../../docs/research/2026-08-18-hooking-beat/)).
  1. **Catch** — continue the same subject and the same promise the cover threw. Don't drift to
     material the cover never had. This is the definition of the YouTube Intro metric — did the
     first 30 seconds match the thumbnail and title's promise.
  2. **Hook** — say the viewer's problem, loss, or gain **with the viewer as the subject**. This
     is where the opening strategy the cover picked (§the four opening strategies) continues.
     The form is one of four:

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
     the body. If hooking says the answer, what follows is a rerun. TikTok measurements put
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
  `beat` anyway — inference is for old files. `storyboard.html` warns when there's no hooking
  shot or the shot after the cover isn't hooking.

### points — one message per screen

```js
{
  type: "points",
  scene: 1,
  sceneSlug: "reporting desk / day",
  shot: { size: "ws", info: "that the deadline moved to the day of arrival" },
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
      prompt: "…draft veo_reference prompt (background unified to THEME dark)"
    }
  }
}
```

- On the alpha capture only the top signature (name + role) renders — the quotation itself is
  said by the narration and subtitles.
- No synthesizing a real person's face or voice. Characters only in styles that can't be
  mistaken for live action.

### Motion background (`visual.video`) — a scene background from image to video

```js
{
  type: "points",
  bullets: [ … ], footnote: "",
  duration: 8,                        // keep it ≤8s — one playthrough of the clip covers the scene
  narration: [ {tts, sub}, … ],       // kept — unlike b-roll, only the background moves while you talk
  visual: {
    picture: "ai-video", overlay: "html",
    bg: "images/scene-3.png",         // the veo parameter — gpt_image high · the §broll source clause (photorealistic people) applies as-is
    bgPrompt: "…",
    video: {
      prompt: "very slow dolly in, hair swaying gently, nearly static camera",  // English motion only
      clip: ".work/motion/motion-i2.mp4"   // produce output record — motion-i<scene index>.mp4
    }
  }
}
```

This takes the image the storyboard already showed, **makes a video from it as a parameter, and
lays it under the scene background**. The caption and subtitle overlays go on top via the alpha
capture (produce §4, §6).

**The storyboard doesn't pick the engine** — produce §3 decides in the order face → sound → grid
(the decision table's source of truth is produce `references/video-model-selection.md`), and
since this slot throws the clip's audio away the default is a silent Seedance. The storyboard's
one job is to write into the plan the facts that decision needs — **whether there's a face in
the source and, if so, whether it's an adult**. Faces that read as minors are blocked on the Veo
image lane, and Seedance 2.x refuses photorealistic faces outright, so filtering at the planning
stage avoids redrawing the picture.

**Write the `prompt` sentence in Seedance grammar** — that's the default engine. Don't write the
camera as a single verb; write it as a **stretch**: `opening frame composition + move + closing
frame composition`. The `very slow dolly in … nearly static camera` in the example above is that
form. The reason an approaching move is written as `dolly in` is that **this sentence may also
go to Veo** — without `ARK_API_KEY` the motion background falls back to `veo_img2video`, and the
word `push` appears 0 times in the canonical Veo text. Seedance's own vendor vocabulary is
Chinese (`推`), so neither is confirmed in English, and `dolly in` satisfies both paths. **This
isn't a format the vendor requires** — in the Seedance top-level formula the camera slot itself
is `非必须`, and the "move amplitude" once written as a required slot failed re-verification
against the original (2026-08-15 camera research). The reason for writing it as a stretch is our
own: **it's a motion-background cut whose composition has to be reproduced.** Moves per cut go
up to 2 on the default model 1.5 Pro — the one-move-per-cut recommendation is Seedance 2.0 only,
so carrying it over here would be wrong. Two things to avoid — **don't write seconds** (length is
set by the scene's `duration` and the edit trims it) and **don't write what to exclude into the
sentence** (Seedance has no exclusion-only argument — re-describe the scene so it doesn't appear.
That slot is the `negativePrompt` argument only when going to Veo). Write the sentence in English
— the prompt body takes only Chinese or English.

- **When to use it**: when the movement itself is the content. A place to show only the picture
  with nothing said is `broll` (spliced between scenes); **when the background has to move while
  you talk, that's a motion background**. Still is the default for scenes where still is enough —
  video buys cost and seam risk.
- **Don't write a plan that says "this scene is heavy, so push the camera in"** — the notion that
  moves change emotion has no empirical support (p=.84, camera research §07). A scene's tone comes
  from the background picture and the props, and the one thing moves actually raised was
  immersion. So use moves **where the character isn't set yet — openings and transitions** — and
  fix `bgPrompt` when you want to change the emotion.
- **Mixing movement into the middle scenes is favorable in itself** — a run of still cuts is a
  scroll-past signal (skip-rate measurement, 2026-08-15). But veo isn't the only source of
  movement: Ken Burns (the builder applies it per cut) and code-rendered animation (the cover's
  4→1 staging, typing cards — clips captured from HTML in a browser, cost 0 and safe for Korean)
  come first. A veo motion background is bought only when those fall short and **the movement
  itself is the content**. Count how long the fully-still stretches in the episode are first,
  confirm the slot can't be filled by a code render, and only then plan veo.
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
- **The combined generated-video cap — this section is the source of truth**: **at most 2 per
  episode, counting b-roll slots + motion-background scenes together** (user directive,
  2026-08-14). veo calls cap at 2 as well. quote speech clips don't count toward this total.
  Three or more gets a red badge from the `storyboard.html` check strip.
- **A motion-first channel lifts that cap, and only its own `profile.md` may declare it**
  (user directive 2026-08-21, in force on pundago). On such a channel three things all have to
  hold, not just the first: **① most cuts are video rather than a still, ② a person-shaped
  character performs the action that cut's line is about, and ③ the camera move follows that
  action.** Ken Burns over a still, a prop moving on its own, a character merely standing there,
  and a generic pan or zoom none of them satisfy it — the first assemblies of pundago ep01 and
  ep02 were rejected for exactly that.
  Read this as a change of **subject matter, not of mood dressing** — the point right above still
  holds, a move added for tone alone has no support (p=.84). The move earns its place by following
  an action.
  What the channel writes in `profile.md` is the declaration plus its own cap, because the 2-per-
  episode number above is the still-first default and a motion-first channel needs its own
  ceiling (pundago runs one clip per cut, 8 cuts). Cost stops being the reason to say no here, so
  say what the reason is instead: **one action per cut** (§one cut one thing) and the per-cut
  contract in the shot table's `action`/`camera` rows.
  A channel that declares nothing keeps the still-first default and the cap of 2.
- **points only** — the cover keeps its code-rendered still (produce absolute rule 10) and takes
  video as an opening b-roll. For quote, `clip` plays that role.
  **The one exception is an explicit per-episode user directive** (2026-08-15, the Ttalkkak Lab
  Seedance episode — "impact at the start"). Even then the body of absolute rule 10 stands —
  **the text is still a code-rendered overlay** and generated video isn't trusted with text.
  Three contracts come attached when using a video cover: **anchor the text at the top** (there's
  no guarantee the center stays empty when the subject moves), **switch to a top-heavy scrim**
  (the default cover scrim is bottom-heavy and can't protect text up top — measured, contrast
  collapsed to 4.35:1 the moment a white subject crossed the text line), and if you leave the
  narration empty, that stretch **uses the clip's own audio** (the same behavior as absolute rule
  9, so no subtitles either). The template applies the first two automatically when it sees a
  cover with `visual.video`.
- **Narration and subtitles are kept** — absolute rule 9 (use the video's audio, no narration) is
  about b-roll **splice stretches**. For a motion background the builder uses only the video
  track, so the clip's audio is discarded and TTS, subtitles, and BGM carry on.
- **Not combined with per-line illustrations (`narration[].img`)** — a motion background lays one
  video across the whole scene, so per-segment background swapping can't hold (the alpha capture
  has only text). To turn an illustration-mode scene into video, use the single representative
  illustration (`visual.bg`) as the source.
- Keep `duration` at 8 seconds or under — made with Veo it's fixed at 8s, so anything inside that
  is covered by one clip, and Seedance makes only as many seconds as you ask and bills that much.
  Go over and the loop shows its seam.
- The content-reviewer **plan mode** gate is the same as b-roll's (absolute rule 13) — don't call
  veo without `PLAN_REVIEW: PASS`.

### broll — a generated-video stretch (reference only) · spliced between scenes

```js
{
  type: "broll",
  after: 0,                          // spliced in after this scene index (the opening b-roll goes after the cover = 0)
  narration: [],                     // has to be empty — produce absolute rule 9
  duration: 4,                       // ★used length★ (4 by default, 6 or 8 with a reason) — write the reason in the comment
                                     // generation is fixed at 1080p and 8s (an API constraint) — produce trims the front and uses that
                                     // don't stretch it with a palindrome (the audio plays backwards)
  visual: {
    picture: "ai-video", overlay: "none",
    src: "images/scene-1.png",       // the same file as `SCENES[after]`'s visual.bg — absolute rules 8 and 12
    clip: ".work/broll/broll-a0-mixed.mp4",   // the trim + loudnorm + BGM mix (the 8s original is broll-a0.mp4)
    motion: "very slow dolly in, nearly static camera",   // the veo call — not push-in
    audio: "quiet studio room tone with a faint fabric rustle, no music, no speech"
  }
}
```

The generated-video cap **is set by §motion background's combined cap of 2** — b-roll slots and
motion-background scenes count together. One b-roll is usually the opening after the cover
(`after: 0`); the other can sit after any body scene — where the story's axis turns, or where a
run of still cuts is dragging.

- **Don't put it in the main manifest** — after the build, `../produce/references/splice-clip.sh`
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
upper screen — covering it with text hides what the cut is showing. The scrim also rises only
from the bottom, and the top 60% of the screen stays clear throughout.

- Captions are still **one at a time** (a swap). Being a filmed scene doesn't mean lining several
  up.
- A filmed scene with no text at all is normal — if the screen is already saying it, leave it
  empty.

#### Don't film in portrait

Long-form is 16:9. A portrait clip gets center-cropped, losing most of the frame, and the builder
stops with `STRICT_DIM=1` **before the first ffmpeg** (the landscape preset's default). This fact
is written at the top of `script.md`'s filming rules — learning it after filming everything means
filming again.

### Slide scenes — a screen where text and shapes are the subject (`visual.slide`, long-form only)

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
      plan: "the plugin folder structure revealing itself top to bottom, one entry at a time",
      labels: ["skills/", "agents/", "server/"]
    }
  }
}
```

| Field | Required | What |
|---|---|---|
| `slide.file` | ✅ | `slides/s<shot number>-<slug>.html` — **shot number = the SCENES array position (from 1)**, the same number as script.md's shot and `voice/s<n>.wav` |
| `slide.plan` | ✅ | One line on what to draw. The §7 approval reads this plan — the file is built afterwards |
| `slide.labels` | ✅ when the shapes carry text | Every piece of text to draw on the slide beyond `title` and `bullets`. The style gate's screen surface checks this array — plant Korean text in the slide file that isn't here and characters that never passed the check go on screen |

**The file is not built at the storyboard stage.** The storyboard carries only `plan` and
`labels`; once §7 approval is done, storyboard §8 authors it against the
`references/slide-template.html` contract. Copy changes change the slide, so flipping the order
throws away slides you already made — the same reason as §5 images, except here what you spend
is authoring time rather than money.

- A slide scene has no `bg` or `bgPrompt` — it drops out of §5 image generation and the §5.5
  image loop, and storyboard-reviewer's image mode doesn't treat its missing `scene-N.png` as
  a defect.
- **Reveal groups are 1:1 with narration segments** by default, and using sub-reveals (`A|B`)
  makes more groups than segments — the same contract as video-template, so produce's state
  capture and xfade become the slide animation as they are.
- **The builder's xfade is all the animation there is.** Add a CSS animation, a transition, or
  a blinking cursor and the state capture's byte-identity check (capture-reveals.sh's exit
  condition) never finishes. A slide has to render deterministically for a given `?reveal=k`.
- Keep text inside the zone (x 96 · top 96 · bottom 285) — even with no Ken Burns
  (`zoom=none`), the bottom 285px is the subtitle band.

## Authoring verification checklist (the storyboard skill's self-check before requesting approval)

The machine-measurable items below (character counts, speech rate, scene length, total length,
cover title, frame overflow, hero stat width, the b-roll contract) **show up in the check strip at
the top when you open `storyboard.html` in a browser** — don't count by hand, just confirm the
strip says no violations.

- [ ] cover title ≤16 chars + topic word included, statLabel ≤18 chars. The title opens on a felt
      problem rather than a method or tool (platform-playbook §1 ②)
- [ ] **The cover `hookType` is one of the four** (`fear`·`empathy`·`curiosity`·`spoiler`), and the
      title, segment ①, and hooking actually ride that strategy — writing it down while the opening
      opens on a different stimulus is the same as not writing it (§the four opening strategies)
- [ ] **Every scene title is a spoken hook** — something a person blurts out (casual-register
      exclamation, question, hearsay), not an explanatory statement, a `-하기` nominalization, or
      newspaper-style `-ㄴ다` (§title is a spoken hook)
- [ ] **`window.FORMAT` matches this episode's format** — omitted or `"shorts-9x16"` for
      short-form, `"youtube-long-16x9"` for long-form. Leaving it out gets a long-form script
      checked against the portrait contract, and it passes
- [ ] Shot count and total length are inside the format band (§format table · the source of truth
      is `formats.js`)
      - Short-form: cover 1 + body 3–6 = **4–7 shots · 35–75s** (90s hard cap)
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
      is built in §8 after approval
- [ ] **On an all-live-voice episode** `window.VOICE = "user"` is present and every scene that
      has narration filled it (§all-live-voice episodes) — the filmed-scene "live voice = `[]`"
      rule is for TTS episodes only
- [ ] Every shot has `scene`, `sceneSlug`, `shot.size`, `shot.info` — `info` doesn't overlap within
      the same scene
- [ ] `visual.picture` and `visual.overlay` match the structure. AI video and HTML staging aren't
      merged into one badge
- [ ] Builds, tutorials, and before/after comparisons show the finished result in the first frame,
      and the first line promises the viewer that result's benefit or change
- [ ] The playback order is **cover → hooking → result → body**. The finished thing
      (`beat:"result"`) comes before the method and steps (`beat:"body"`). The cover's glance and
      the result's unfolding point at the same artifact
- [ ] **The shot after the cover is hooking** (`beat:"hooking"`) — informational pieces included.
      It catches what the cover threw, hooks with the viewer as the subject, and doesn't unpack the
      answer. In short-form the result (the first body scene for informational pieces) starts within
      20s of the cover (§hooking)
- [ ] One episode solves one problem and produces one result
- [ ] A serial's CTA promises the next episode's concrete result rather than making a vague
      subscribe request
- [ ] narration character caps respected, 8–25 chars per sentence, every sentence closed with a
      period
- [ ] tts/sub notation split done (numbers, loanwords)
- [ ] No distortion of numeric ranges (a range stays a range)
- [ ] Every factual claim matches a verification-passed entry in research.md
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
- [ ] THEME matches profile.md §3
- [ ] Generated video (`broll` + `visual.video` combined) is **at most 2** — unless `profile.md` declares the channel motion-first, in which case that channel's own cap applies (§motion background is
      the source of truth) · content-reviewer plan mode PASS recorded
- [ ] If you placed `broll` scenes — the two slots' `after` differ · each slot has `narration: []`
      · `src` is the same real PNG as `SCENES[after].visual.bg` (that image made with gpt_image
      high as a photorealistic person scene) · `duration` (used length) is 8 or under with a
      comment giving the reason (not stretched with a palindrome)
- [ ] If you placed a `visual.video` scene — points type · `duration` ≤ 8 · `narration[].img`
      unused · `prompt` is English motion only · the source `bg` is a real PNG (gpt_image high)
