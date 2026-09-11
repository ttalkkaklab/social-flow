# The person short — one person, one turn, a cut per sentence

A 30–60 s history short about one real person and the one thing that happened to them.
The shape comes from a survey of seven history shorts channels (2026-09-10 —
[docs/research/2026-09-10-history-shorts-storytelling](../../../docs/research/2026-09-10-history-shorts-storytelling/));
what they share is not a topic but a way of opening, turning and closing, and a screen that
changes with every sentence. None of it adds a beat: the seven items (scenario-stage
§the seven items) and hook → drip → cta stay. It adds one declaration, `STORY.person`, and
the checks below hang off it. Every other board ignores this file.

## Contents

- [1. When to pick it](#1-when-to-pick-it)
- [2. The story — cause, block, one blow](#2-the-story-cause-block-one-blow)
- [3. The screen — a cut per sentence](#3-the-screen-a-cut-per-sentence)
- [4. What not to import](#4-what-not-to-import)
- [5. Declaring and checking](#5-declaring-and-checking)
- [Sources](#sources)

## 1. When to pick it

The episode is about one person and one event with a turn in it — a survivor, a deserter, a
general's one wrong order. Pick it at the §2.2 candidate stage when the wow is a reversal in
one life. It is not the shape for a mechanism, a comparison of numbers, or a period overview
with three actors; those keep the ordinary board. A channel that runs mostly person episodes
sets `length_max_seconds: 60` in its profile so the band matches the shape, and
`length_min_seconds: 30` if it wants the short end of it (the plugin default floor is 35 s).

## 2. The story — cause, block, one blow

- **Open inside the event.** The first spoken sentence is a scene already under way — a hand
  on a rope, a letter being read, a gun that does not fire. No name, no year, no
  introduction, no result. The title on the cover may carry the person's name (playbook §2
  still keeps the result out of it); the first sentence does not. This is scenario-craft
  §11's cold open, held strictly: `hookType` is `fear`, `curiosity` or `empathy`, never
  `spoiler`, and `hookForm` is `gap`, `identify`, `secret` or `paradox` — `payoff` states the
  result and `number` leads with the figure, and the checker refuses both on a person short.
  A span or an age in the first sentence ("300년째 서 있는 성벽", "500년이 흘렀어요") is scene
  texture and passes; a calendar year, a century or a dated day does not.
- **One person, one turn.** The 전개 items are 원인 → 막힘 → 한 방: 전개 #1 is what set the
  person moving, 전개 #2 is the wall they hit, 전개 #3 is the one stroke that changed the
  outcome — scenario-craft §9's double hit, on the `drip` shot `STORY.payoff` points at, with
  `sound.drop: true` on it (§7: the music goes out at the peak). One name is spoken in the
  episode; everyone else is a role — "the captain", "his brother". A second named person
  with their own arc is a second episode — the reviewer's read holds this one (§5).
- **Close on one scene, and say the message over it.** 마무리 is one picture and one sentence
  after the blow — where the person was the next morning, what was found in the pocket, the
  door that stayed shut — and the sentence over that picture is the message: `STORY.thesis`,
  the research.md M# line in the narration's words, true with the person's name gone (scenario-
  stage §The message). Not a summary, not a moral, not a list of what happened afterwards, not
  the blow said again, and not the picture described in words — the picture does that. The
  2026-09-11 김만덕 board closed on "못 건너던 바다를 건넌 여자가 열린 문으로 걸어 나가요", which is
  the picture and the payoff again, and the viewer left with nothing to carry. `STORY.ending`
  is a different group from `STORY.payoff`; the checker also requires the thesis to be heard at
  or after the payoff and refuses one that names the person. When the record is disputed — two chronicles, a
  legend against a ledger — the last sentence says so and shows the two sides in one line:
  "기록 두 개가 서로 다르게 적어 놨거든요". That is the natural `cta: "question"`, and
  `shot.share` carries the disputed point in one forwardable sentence; a certain record
  closes with `cta: "none"` and the scene.
- **Every sentence lands a fact or a move.** 30–60 s at one sentence a shot is 7–12
  sentences. There is no room for a sentence that only sets mood; the picture does that.

## 3. The screen — a cut per sentence

- **The picture changes with every sentence.** One narration group per shot; the checker
  refuses a shot that speaks two. A sentence that needs two pictures is two sentences.
- **Mix the sources by what each sentence needs** — render-routing.md decides the route,
  this is where the person short usually lands: period paintings, photographs, maps and
  documents on `still_camera` with a real image (the free-source list in
  [docs/research/2026-09-07-free-stock-sources](../../../docs/research/2026-09-07-free-stock-sources/)
  covers most of them); one short `generated_video` reenactment on the blow, because that is
  the one cut where continuous action is the meaning; `editorial_html` only when the
  document's own words are the subject. The generated-video cap and the text-plate cap are
  unchanged. A still per sentence under a real camera move (directing-grammar §4 still lane)
  is what these channels cut on, and it costs nothing.
- **Subtitles are big, low, one word at a time, and only the year and the name change
  colour.** Build with `SUB_MODE=word` (or `phrase`), `SUB_ACCENT=<THEME accent RRGGBB>` and
  `SUB_ACCENT_WORDS="<name> <aliases>"`; produce §subtitles has the contract. A year
  (`1592년` · `16세기` · `1950-06-25`) is coloured automatically, names from the list. Nothing
  else on the line changes weight or colour.
- **The voice tells it, it does not read it.** The register is the one korean-style D9
  keeps for spoken surfaces — a person telling the story across a table, in the channel's
  politeness level. A sentence that ends in 「-ㄴ다」 is a caption, not a voice.
- **The music sits low and goes out on the blow.** A single bed under the whole episode,
  `sound.drop: true` on the payoff shot; the drop is the only music event. No swell at the
  end, no sting on the reveal.

## 4. What not to import

- The gossip channels' rough talk — the register that gets them views is the one
  check-style D5 and the profile's politeness level refuse. Keep the pace, not the mouth.
- The first-frame fact card — several of the surveyed channels open on a still with the
  name, the dates and the claim written out. That collides with playbook §2 (the result
  stays inside the video) and with the cover rule above. The first frame is a scene.

## 5. Declaring and checking

```js
window.STORY = {
  version: "story-v1", kind: "evidence",
  // …the ordinary contract (story-quality.md)…
  person: { name: "이순신", aliases: ["이 장군"] }   // declares the person short
};
```

`check-story.js` (and full `check-scenes.js`) then adds these to the ordinary contract:

1. The first spoken group does not contain the name or an alias.
2. The first spoken group does not carry a year, a century or a dated day.
3. The cover is not `hookType:"spoiler"`, `hookForm:"payoff"` or `hookForm:"number"`.
4. `STORY.payoff` and `STORY.ending` are different groups — the closing scene follows the blow.
5. Every narrated shot speaks one group, and that group is one sentence — a sentence closes
   on a period, or on `?`/`!` unless the mark ends an embedded question ("사실일까? 궁금했어요")
   or is followed by its attribution, a reporting verb or the thought it sits in ("무슨 일이야?
   하고 중얼거렸어요", "괜찮아? 물었어요", "사실일까요? 싶었어요"); an ellipsis pause never closes. "무슨 일이야? 아무도 몰랐어요" is two
   sentences and two pictures, in any register.

Two things the checks cannot tell apart, so pick around them: an alias that is also inside
an ordinary word ("만수" inside 만수국) flags the opening and colours that word in the subtitle
(`SUB_ACCENT_WORDS` matches the same way) — choose the fuller name; and a
span is read two ways and no other, and only on a three-digit number: a marker
(째·동안·넘게·만에·간·이상·가까이·가량·남짓 — "300년째", "500년 동안", "100년 넘게 버틴 성벽"), or a particle
(이·을·를·은·는·만·이나) with a finite past span verb a year cannot be the subject of ("500년이
흘렀어요", "100년이 넘었어요" — 흘렀·넘었·버텼·견뎠·기다렸·이어졌). Four digits before 년 are always
a year, so an age past 999 years is spelled out ("천 년 묵은 탑"). Everything else reads as a
year, including an age before a noun ("100년 묵은 성벽", "918년 넘은 탑", "300년을 버틴 성벽" —
the same words a year would use) and 되다·지나다 in any form ("200년이 됐어요", "100년이 지났어요").
Write those as "100년 넘게 버틴 성벽", "300년째", "100년이 흘렀어요". After a `?` or `!`, what keeps the sentence whole is the next
word: 하고·라고·이라고·라며·하며·라는·이라는, a reporting verb (물었·되물었·중얼거렸·소리쳤·
소리 질렀·외쳤·말했·되뇌었) or 싶·궁금. A subject in between ("정말 갈 거니? 그가 물었어요")
splits the shot — add 하고, or move the subject in front of the quote.

[person-short-fixture.js](person-short-fixture.js) is an explicitly fictional board that
passes this gate (`node check-story.js person-short-fixture.js --draft`) — nine sentences,
one a shot, opening on a hand counting matches and closing on a house with no door. It is
the shape, not a script; its sentences are not to be reused.

What stays a human read: whether the opening is actually a scene and not a riddle, whether
the blow is one stroke and not three, whether the close is a picture with the message over it
and not a moral, the blow again or the picture described,
whether a second person gets a name and an arc of their own, and — on a disputed record —
whether both sides are on the screen and neither is invented. The narration read-through
(storyboard §4.4) judges those — storyboard-reviewer's narration mode P0-12 lists the five,
and it reads them only when STORY declares `person`; the checker only holds the shape.

## Sources

- Seven history shorts channels surveyed 2026-09-10 (Zack D. Films · Simple History ·
  MrBallen Shorts · History Matters · Daily Dose Of History Facts on YouTube Shorts; The
  History Gossip · 60SecondHistories_ on TikTok) — the opening, the one-person-one-turn
  body, the single closing scene, the per-sentence cut, the word subtitles with coloured
  years and names. Field practice, observed on top episodes; no retention measurement.
  Collected in [docs/research/2026-09-10-history-shorts-storytelling](../../../docs/research/2026-09-10-history-shorts-storytelling/).
- scenario-craft §7 (the end is a designed beat, music out at the peak), §9 (the double
  hit), §11 (the cold open) — the rules this shape holds strictly.
