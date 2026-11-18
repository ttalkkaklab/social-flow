# Opening by format and platform

Apply this to every new or substantially revised synopsis and storyboard, together with
[episode anticipation](episode-anticipation.md). That reference decides what the episode
promises and how it pays; this one decides where and how fast the promise reaches the viewer
for the episode's format (short-form or long-form) and the platforms it will be posted to.
It is the default writing process (user directive, 2026-11-18). It is not a score, a schema
requirement or a gate: board writes print a reading of the plan and never refuse.

Evidence: [research page](../../../docs/research/2026-11-18-opening-hooks/index.html) and its
two reports (short-form, long-form) in the same folder. Grades used below: **measured**
(platform data, an experiment or a large correlational study), **official** (a platform's
own definition or guidance), **practice** (creators' and tool vendors' rules of thumb),
**inference** (this plugin's synthesis). Most opening patterns in the research are practice:
of the 233 catalogued patterns, 7 have a measured effect and 129 rest on practitioners' opinion.

## Contents

- [1. Read the facts first](#1-read-the-facts-first)
- [2. One principle for both formats](#2-one-principle-for-both-formats)
- [3. Short-form: one opening, built for the earliest window](#3-short-form-one-opening-built-for-the-earliest-window)
- [4. Long-form: packaging first, the first 30 seconds as its receipt](#4-long-form-packaging-first-the-first-30-seconds-as-its-receipt)
- [5. Platforms](#5-platforms)
- [6. Story-led and claim-led openings](#6-story-led-and-claim-led-openings)
- [7. Write it down and read it back](#7-write-it-down-and-read-it-back)
- [8. Limits of the evidence](#8-limits-of-the-evidence)

## 1. Read the facts first

Before choosing an opening, read four things; none of them is asked again.

- **Format.** The board's `FORMAT`, handed off from the saved `production.format`:
  `shorts-9x16` is short-form (§3), `youtube-long-16x9` is long-form (§4). An explicit
  episode override wins.
- **Platforms.** The enabled SNS targets in the project settings (`project_manage status`,
  `sns.<platform>.enabled`); inside an episode `storyboard_read` returns them as
  `opening.platforms`. A pending connection still counts as a target. No targets: plan for
  the format alone.
- **The channel's opening format.** A channel that chose the provocative opening and rewind
  keeps it ([episode anticipation](episode-anticipation.md#a-provocative-opening-then-the-earlier-situation)).
- **The episode's kind.** Story-led (a relationship or event resolves) or claim-led (an
  explainer, tutorial, review or advertisement proves a result). §6 maps each to its opening.

## 2. One principle for both formats

The opening shows something concrete and leaves out its cause, its result or its cost; this
episode fills that gap. Formats differ in when the gap has to be visible, not in what makes
it work. Choose which pleasure the opening offers, on purpose:

- **Suspense** — tell the viewer a danger or deadline the character does not know, then go
  forward in time. In the one experiment that compared story orders (a four-page text story,
  read from a lecture summary of Brewer & Lichtenstein), this order scored highest: liking
  4.85, "story-likeness" 5.05.
- **Curiosity** — show the outcome first and hold its cause (result first, the provocative
  opening and rewind). It is the short-form default in practice, and it has a cost: the
  outcome-first version of the same story scored 3.65 and 4.50. Pay the cause inside the
  episode; do not use a result-first opening to close the question it opens.
- **Surprise** belongs to a turn, not to the opening: it needs an expectation to break.

A promise the episode never pays is the most expensive mistake: the version with the ending
removed fell to 2.75 on story-likeness (measured, same experiment). The author-facing
synopsis always states the answer.

## 3. Short-form: one opening, built for the earliest window

Short-form is shown to a viewer who did not choose it. The first frame is the packaging.

**One opening for every platform.** Shorts, Reels, Facebook Reels and TikTok get the same
cut. Build it for the earliest published window, the 3-second skip rate of Instagram and
Facebook Reels; an opening that lands by 3 s also lands inside TikTok's 6 s and YouTube's
unpublished "initial seconds". Platform differences go into packaging (§5), not into
per-platform first cuts: those cost extra generations and the research found no data that
they help.

The shared opening, second by second (inference from the measured and official rows below):

| Time | What happens | Why |
|---|---|---|
| 0 s | The first frame shows the subject of the promise already changed or mid-action: the result, the problem state, the before/after, the odd object, the incident under way. No logo, title card, greeting, black frame or establishing landscape. | Muted viewers get only this picture; a slow or scene-setting start gives them a reason to leave (practice). |
| 0–1 s | The first sound. When a line carries the promise, its first word starts inside the first second. | Brand Facebook Reels whose speech started within 3 s held 24.7% more viewers at 10 s than music-only ones (Emplifi, 10,110 Reels, correlational; the same group had 3.3% lower reach and 11.9% fewer rewatches). |
| by ~3 s | The promise is complete: one spoken sentence, or a visible event the viewer can read without sound. | The earliest window ends here (official, Reels). |
| 3–6 s | The first step toward payment: a first clue, a first attempt, the first piece of the result. | TikTok's ad guidance puts the hook inside 6 s (official, ads only). |
| end | The promise is paid on screen. A piece under about 7 s can loop seamlessly into its first frame. | Seamless loops of 7 s or less had 18.7% more rewatches (Emplifi, correlational). |

- **See and say.** The first line names what the first frame shows. Picture and line point
  at the same thing; a line about one subject over a picture of another makes the viewer
  decode instead of watch (Kallaway; Google's "see & say", practice). Nothing is drawn over
  video, so this pair replaces every text hook: on speech-led Reels, text overlays went with
  6% lower 10-second retention (Emplifi, correlational).
- **Speak or show, not both late.** A visible event can carry the promise without a line;
  then the line may come later. What fails is a silent setup followed by a late line.
- **A face is a choice, not a rule.** A person seen in the first 3 s went with 10.1% higher
  10-second retention but 7.4% lower reach (Emplifi, correlational). Put a person first when
  the promise is about that person.
- **Do not add cuts to "hook".** The editing pace of the first 3 s made almost no difference
  (Emplifi). Cut when the story changes, not to look busy.

## 4. Long-form: packaging first, the first 30 seconds as its receipt

Long-form is opened by a viewer who already chose it from a title and a thumbnail. The
opening confirms that choice.

**Write the packaging before the opening.** Decide the title and the thumbnail picture first
and record them (§7). YouTube's Intro value is the share of viewers still watching after the
first 30 seconds; videos at 50% or more are listed as "above typical intros", and the first
fix YouTube suggests for a weak intro is a title and thumbnail that match the video
(official, Help 12942217). Test & Compare picks the winning title and thumbnail by watch
time, not by click-through (official, Help 16391400). An opening written before its packaging
has nothing to confirm.

The opening, minute by minute (inference: the long-form report's combined timetable, built
from practitioners' skeletons):

| Time | What happens |
|---|---|
| 0–7 s | Confirm the click: the thumbnail's object, person or situation is on screen, and the first line says the title's promise. Repeating the thumbnail is not enough; show it happening. |
| 7–30 s | Widen: one question or stake bigger than the packaging, so the viewer knows what is still missing. |
| 30–60 s | Start the body's first action or attempt. A roadmap gets one sentence at most. |
| 1–3 min | Show, don't tell: the first proof on screen. |
| about 3 min | A scene only this subject can give. |
| each sequence or chapter turn | Open the next question there. There is no evidence for clock rules such as "a new hook every two minutes". |
| last sequence | The answer to the first question ends the video. |

- **The first minute is where most viewers go.** One leaked production document records 21
  million of 60 million clicks leaving in a video's first minute (MrBeast document, one video,
  not officially confirmed). Its stated causes were a dark first shot, not matching the
  packaging's expectation and saving the interesting part for later.
- **Nothing before the promise.** Greetings, channel intros, logo stings, subscribe asks,
  sponsor reads and chronological background all postpone it (practice; no controlled data).
- **A cold open from later in the video** connects visibly to what follows and leaves its
  question open (§2).
- **Series and long stories.** The first episode's job is to make the next one wanted:
  Netflix found that viewers are held by episode 2 to 4, not by the pilot (official, 2015).
- **Facebook** weights videos that hold attention for at least one minute (official, 2019);
  treat the first minute the way YouTube's 30 s are treated.

## 5. Platforms

| Platform | Format | Published opening window | What differs per platform |
|---|---|---|---|
| YouTube Shorts | short | "Stayed to watch" past the initial seconds; the length is not published; engaged views count only those viewers (official) | title; the first frame doubles as the cover |
| Instagram Reels | short | Skip rate: views skipped within the first 3 s (official, quoted by the press, August 2025) | cover and caption; the caption's hook sits inside its first 125 characters ([platform playbook](../../platform-guide/references/platform-playbook.md)) |
| Facebook Reels | short | Skip rate, 3 s (official, same Meta change, quoted by the press) | caption |
| TikTok | short | Ad guidance: the offer inside 3 s, the hook inside 6 s (official, ads only) | cover chosen while the post is private ([TikTok private cover](../../publish/references/tiktok-private-cover.md)) |
| YouTube | long | Intro = still watching at 30 s; 50% or more is above typical (official) | title and thumbnail, decided before the opening |
| Facebook | long | One-minute views weighted in ranking (official, 2019) | title and first-minute promise |

Every title, caption and cover carries the same promise as the opening, in the platform's
own words; none promises more than the episode pays. A packaging promise the video does not
keep is the one opening failure with a policy behind it (YouTube removes egregious clickbait
in news and current affairs in India since December 2024) and with ad data behind it (across 88,329 Meta ads, hook rate alone did not predict
click-through, and some of the highest-hook-rate ads barely broke even; Billo, ads only).
Threads has no video opening; its first line follows the platform playbook.

## 6. Story-led and claim-led openings

- **Story-led, short-form.** Either chronological suspense (§2), or the provocative opening
  and rewind: the consequential line or action and the listener's visible reaction inside
  about the first 3 s, then the oriented rewind and one catch-up
  ([episode anticipation](episode-anticipation.md#a-provocative-opening-then-the-earlier-situation)).
  Three seconds is a target, not permission to rush two speakers.
- **Story-led, long-form.** The title and thumbnail promise an event or a person; the first
  7 s show it, the next 20 s widen it into the episode's dramatic question. A rewind to the
  earlier situation follows the same rule as short-form; its time cue is dialogue, narration
  or a changed setting, prop, light or season, never a time label the user did not request.
- **Claim-led, both formats.** The first spoken line carries the one promised result
  ([claim-led episodes](episode-anticipation.md#claim-led-episodes-one-result-promised-proof-the-viewer-can-check)):
  inside the first 3 s on short-form, inside the 0–7 s click confirmation on long-form, where
  it restates the title's promise. The viewer's annoyance can come first when the subject
  removes it.

## 7. Write it down and read it back

- **Synopsis.** Every story-led or claim-led synopsis has an opening paragraph in prose: the
  format and platforms it was planned for; the first frame; the promise (the first line, or
  the visible event that states it); suspense or curiosity, and where the episode pays it;
  for long-form, the title, the thumbnail picture and the bigger question raised by 30 s. A
  synopsis-only request stops here.
- **Board.** `story_sequence` records the plan as `STORY.opening`: `promise`, `firstFrame`,
  and on long-form `title`, `thumbnail` and `widen`. A new value replaces the old one.
- **Shots.** The first shot's story enacts `firstFrame`; the first line in `shot_dialogue`
  says the promise, in the episode's language, as speech. Keep both when shots are revised.
- **What every board write prints.** On a story-first board, `opening (…)` lines: the format
  and each enabled platform's window, the recorded promise or its absence, long-form
  packaging that is missing, the shots that play inside the window (0–3 s or 0–30 s) once
  their lengths exist, and a first spoken line that starts after the window. `storyboard_read`
  returns the same reading as `opening`. These are readings, not targets; a write is never
  refused for them, and a visible event that carries the promise needs no early line.

## 8. Limits of the evidence

The windows in §5 and YouTube's Intro definition are official; the second-by-second tables
in §3 and §4 are inference built on them. No public study compared openings with and without
greetings, logos, intro lengths or sponsor positions, and none compared the same video with
and without on-screen text. The research lists circulating figures that cannot be traced to
a source; do not cite them (short-form report, "measured" section; long-form report,
"numbers not to use"). The most useful evidence is the channel's own: post the same body with
a different first 3 s or first 30 s and compare engaged views or stayed-to-watch (Shorts),
skip rate (Reels) and the Intro value against the last ten videos of similar length (YouTube).
