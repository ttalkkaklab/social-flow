# Standard structure of the shooting script (script.md)

`data/<channel>/episodes/<topic>/storyboard/script.md` — after storyboard approval **the user
records the screen while reading this script**. It's a document a person reads and follows
literally, so per shot the [screen / action / lines / filename to save] have to sit together in
one block.

## Two lanes — decide which one first

| | **Whole-episode shoot** (short-form) | **Mixed** (long-form) |
|---|---|---|
| Format | `shorts-9x16` portrait | `youtube-long-16x9` landscape |
| Scene makeup | every scene is recorded | filmed scenes + generated scenes in one episode |
| Recording | shot straight through in one go | **filmed scene by scene, saved as files** |
| Alignment | ingest makes `alignment.json` | none — the filename is the alignment |
| Editing | `build-screencast.sh` | `build-reel.sh` (the same builder as generated scenes) |
| script.md | carries every shot | carries **only the filmed scenes** |

A whole-episode shoot talks start to finish with the screen rolling, and the edit finds the cuts
in the silences. Mixed can't do that — generated scenes go in between, so **one filmed scene is
one file**. That's why the long-form script prints the filename to save for each shot.

## The scenes.js side of the contract

- A filmed scene's `visual` is **filming directions** instead of a generated image —
  `{ source: "recording", clip, shot, action }`. `scenes-schema.md` §filmed scenes is the source
  of truth for what each field means, and `bg`/`bgPrompt`/image generation all drop out.
- The `narration` segments aren't a TTS script but **the sentences to speak** — `tts` = the
  sentence to say, `sub` = the subtitle's original notation (numbers and proper nouns as
  written). The real subtitles come from the corrected transcript of the recording, so the
  sentences here serve as the filming guide and the alignment reference.
  For scenes that lay narration over instead of using the live voice, they're a TTS script as
  usual (§filmed scenes, two lanes).
- **The character cap relaxes**: whatever length a person says naturally is fine — 40 characters
  per sentence recommended, no limit on sentences per scene. But **the longer you talk, the
  longer the scene** — derive the sentence count backwards from the scene's target length
  (speech runs roughly 5–6 characters a second). Short-form scenes are 8–20s; long-form filmed
  scenes have no cap — one chunk of recording coming in as one scene is normal.
- On-screen text sits in a different place per lane. A short-form whole-episode shoot puts
  **only kicker + title** in the top block (the cover adds stat/statLabel); long-form filmed
  scenes get the title, one caption, and the source in the **lower third at the bottom left**.
  Either way, one caption at a time.
- Build and tutorial shoots start **with the finished screen already up in the first frame**. The
  cover's first sentence says, within 3 seconds, what benefit or change that result brings.
- **The first sentence opens on one of the four opening strategies** — fear, empathy, curiosity,
  or showing the ending (scenes-schema §the four opening strategies). Which one is written in the
  scenes.js cover `hookType`, and since the shooting script is the surface where the user says
  that sentence out loud, it carries the same stimulus verbatim. Sentences starting with
  "~해 봤습니다" or "오늘은 ~ 보여 드릴게요" don't go in the script — finding out after recording
  means refilming the first scene.
- The recording order is **cover → hooking → result → body**. Show the finished thing at a
  glance, hook the problem, unfold the result, and only then film the method. Don't record the
  method screens before the result. Hooking exists in informational pieces too — the shot after
  the cover hooks why to stay, with the viewer as the subject, and defers the answer
  (scenes-schema §hooking). Match each shot to its scenes.js `beat`
  (`hook`·`hooking`·`result`·`body`·`cta`).

## The script.md structure

```markdown
---
topic: <topic slug>
mode: screencast          # screencast = whole-episode shoot | mixed = long-form mixed lane
format: youtube-long-16x9 # or shorts-9x16
scenes: <shots to film> / <shots in total>
target: 8–15 min          # 35–75s for short-form
generated: <YYYY-MM-DD>
---

# 촬영 대본 — <cover title>

## What to film today (at a glance)

| Filename | Scene | What to film | Target length |
|---|---|---|---|
| `footage/s2-install.mp4` | S#2 | typing the install command, the result appearing | ~40s |
| `footage/s5-run-cli.mp4` | S#5 | the finished video playing | ~25s |

> Save every file under `data/<channel>/episodes/<topic>/footage/` **under exactly these
> names**. A different name means the edit can't find that scene.

## 촬영 수칙 (read once before you start recording)

- **Film landscape** — long-form is 16:9. A portrait clip loses most of the frame and the
  builder stops before the first ffmpeg. Finding out after filming everything means refilming.
- **Put this script on your secondary display** — the recording captures the main display only
  (record.sh -D 1).
- **One shot = one file** (mixed lane). Start recording, film only that shot, stop. Leave about
  a second of slack at each end, and don't talk during that slack.
- **Enlarge the fonts and windows of the app you're demoing** (browser ⌘+) — the screen gets
  scaled down, so small text won't read. If the demo focus is part of the screen, the edit crops
  in on that area.
- If you fumble, don't stop recording — **say that shot again from the top**; the edit uses the
  last take only. (In the mixed lane it's faster to delete that file and refilm.)
- Turn on do-not-disturb — notification banners on the main screen get recorded too.
- You don't have to recite the sentences exactly — speak naturally, but say **the key figures
  and proper nouns exactly as scripted** (they're the reference values for the subtitles and the
  fact check).

## S#2. terminal / day

### 샷 4 — does the install really work (result · 목표 ~40초)

**저장할 파일**: `footage/s2-install.mp4`
**이 샷의 정보**: that one command line finishes the install
**화면**: an empty terminal window — close any tab showing account names or tokens beforehand
**행동**: type the install command slowly and wait until the whole result is out
**대사**:
1. <the sentence to say — in the order of the scenes.js narration segments>
2. <...>

**끝나면**: stop recording → save under the filename above

### 샷 5 — ...
```

- Match the shot heading's title and target length to scenes.js (they're the alignment
  reference).
- **Line number = narration segment order** — don't write new sentences, carry them over from
  scenes.js (no maintaining two copies: scenes.js is the SoT, script.md is the render).
- For a **shot filmed in silence**, write `(don't speak — narration goes on later)` in the lines
  slot and put only what you operate under **행동**.
- The whole-episode lane adds a "recording done: say '녹화 끝' and stop" note after the last
  scene. The mixed lane ends at each shot, so it doesn't need that note.

## Traps

- **Script and speech differing is fine as long as the facts match** — alignment and subtitles
  follow the actual speech (the corrected transcript). But if a figure or proper noun was spoken
  differently from the script, ingest reports it, and the user decides between refilming and
  correcting the subtitle (what's said in a recording isn't evidence — the scenes.js figures
  already passed cross-checking, so the script is the reference).
- **When a short-form shot goes over 20 seconds** the edit report warns — splitting the shot at
  the script stage is cheaper than refilming. Long-form filmed scenes have no such cap.
- **Don't put personal information on screen** — spell out in the **화면** item that screens
  showing account names, emails, or tokens are to be avoided at the script stage (ingest §4
  detects them, but avoiding them up front is better).
- **The user doesn't change the filenames** — the name the storyboard set is paired with the
  scenes.js `clip`. Changing it means fixing the storyboard and getting it re-approved.
