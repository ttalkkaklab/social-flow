---
name: ingest
description: >
  This skill should be used when the user asks to "녹화 분석해줘", "화면 녹화로
  스토리보드", "녹화한 영상 가져와", "말하면서 녹화한 거 정리", "ingest this
  recording", "녹화 시작해", "화면 녹화 해줘", or provides a screen recording
  (with voice narration) to turn into content. Can start/stop the screen+mic
  recording itself (record.sh, macOS screencapture), then extracts timestamped
  speech (Qwen3-ASR STT, whisper.cpp fallback) + silence/scene-change signals from the recording,
  merges them into a per-scene timeline (data/<channel>/episodes/<topic>/recording/
  timeline.md with keyframes + vision descriptions), which then feeds the
  storyboard skill as the primary source replacing web research. In the
  storyboard-first shooting flow (storyboard/script.md exists), it additionally
  aligns the recording to the storyboard scenes (recording/alignment.json) so
  produce can edit the footage into the final video.
argument-hint: "<channel> <recording path|record> [topic slug]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "mcp__social-flow__stt_local_transcribe", "mcp__fect-mcp__vision_analyze", "mcp__fect-mcp__vision_ocr"]
---

# Recording ingest — data/[channel]/episodes/[topic]/recording/

Turn a screen recording (with voice narration) into **text laid out on a
timeline**. The resulting `timeline.md` becomes the primary source that takes the
place of the storyboard skill's research (research.md) — what got said and shown
in the recording is the material for the scene design.

```
data/<channel>/episodes/<topic slug>/recording/
├── raw/                 # STT, silence, screen-change raw signals (transcribe.sh)
├── timeline.json        # machine-readable scene timeline
├── timeline.md          # human-readable — scene table + sentence timestamps + screen descriptions
├── keyframes/seg-N.jpg  # scene keyframes
└── alignment.json       # shooting mode only — storyboard scene ↔ recorded cut alignment (§5)
```

## Procedure

### 0. Recording mode (`record` instead of a file in the argument)

If there's no recording yet, **this skill does the recording itself**:

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/ingest/references
bash $REF/record.sh start ~/Movies/social-flow-rec-$(date +%Y%m%d-%H%M%S).mov
```

- Tell the user before starting: demo the screen **while talking into the mic**,
  and say "recording done" when finished. Add the demo tips too — **pausing for a
  second or more and then switching the screen** when changing subject makes the
  scene boundaries land accurately.
- **If `storyboard/script.md` exists (shooting mode)**, give them that path before
  starting and tell them to **put the script on a second monitor** — summarize the
  script's shooting rules (a one-second pause plus a switch between scenes, enlarge
  app fonts, restart the scene from the top if you fluff it).
- When the user signals the end, `record.sh stop <same path>` → take the resulting
  mov into step 1.
- **Check the `Input device / input volume` line that start prints before moving on**
  — `-g` captures whatever the default input device is at that moment. Plugging in
  an external mic doesn't automatically change the macOS default input, so if it's
  the wrong mic or the volume is too low you find out only after the take is over.
  To pin it, start with the `SF_MIC_DEVICE` (device name) and `SF_MIC_VOLUME`
  (0~100) environment variables.
- If start fails (permissions): tell them to allow the terminal app under System
  Settings → Privacy & Security → **Screen Recording** and **Microphone**.
- Only the **main display** is recorded (record.sh pins `-D 1`) — on a multi-monitor
  setup, demo on the main one; the secondary is free for checking status, taking
  notes, whatever, and none of it lands in the recording.
- Don't do other work on the main screen while recording — everything on it gets
  captured (notification banners included — Do Not Disturb recommended).

### 1. Check prerequisites

```bash
command -v mlx-qwen3-asr || command -v whisper-cli
```

The default Korean STT is `mlx-qwen3-asr` (Qwen3-ASR-1.7B). If missing:
`uv tool install --python 3.12 "mlx-qwen3-asr[aligner]"` — the first call downloads
~3.4GB of weights into `~/.cache/huggingface`. Until then the fallback is
`brew install whisper-cpp` plus `~/.cache/whisper-cpp/ggml-large-v3-turbo.bin`.
Check that the recording file exists and plays (ffprobe). Stop if neither engine
is available.

### 2. Load the profile + settle the topic

Read `data/<channel>/profile.md` — if it's missing, stop and point to
`/social-flow:channel add`. Take the topic slug from the argument, or after
transcription look at the content and propose one by the §7 slug rules for the
user to confirm (rather than a provisional `recording-inbox/` directory before
transcription, it's fine to **run the transcription in scratch first**, then settle
the slug and move it to the real path).

### 3. Extract raw signals + merge the timeline

First **build a glossary to prevent misrecognition** — list the domain terms from
profile.md and the proper nouns you expect for the topic (app, product, and service
names, technical terms) comma-separated, and inject them as `WHISPER_PROMPT`.
Qwen3-ASR takes it as `--context`, the whisper fallback as `--prompt` — either way
the decoder biases toward that vocabulary, which cuts transliteration errors
("클라우드 코드" ← Claude Code) at the source.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/ingest/references
WHISPER_PROMPT="<profile.md terms and expected proper nouns, comma-separated>" \
  bash $REF/transcribe.sh <absolute path to recording> data/<channel>/episodes/<topic>/recording
python3 $REF/build-timeline.py data/<channel>/episodes/<topic>/recording --src <absolute path to recording>
```

- **Never copy the source** — timeline.json references it by absolute path.
- If the silence and screen-change sensitivity is off, re-run with the environment
  variables in `references/timeline-schema.md` §Tuning knobs (re-running is safe, it
  overwrites raw/).
- If there are far too many or too few scenes, adjust `--min-scene`/`--max-scene`.

### 4. Fill in screen descriptions + correct the transcript + review for private data

For each keyframe, ask `vision_analyze` (language "ko") two things at once:
① what's on screen (a summary of the app, the view, the actions), and
② whether any **personal or sensitive information** is visible (notification
banners, email addresses, account names, tokens and keys, amounts of money).
When there's a lot of text on screen and you need an exact read, use `vision_ocr`
as a backup.

- Write the screen descriptions into timeline.md's "Screen" column in the scene
  table and into the detailed "Screen description", and update the frontmatter to
  `status: annotated`.
- **Transcript correction (evidence required)** — check each scene's transcript
  against the on-screen text (vision_analyze and vision_ocr results) and the
  profile.md terms, and correct the misrecognitions:
  - Fix something **only when there's evidence** from screen OCR or the profile
    glossary. Smoothing it "to read more naturally" isn't correction, it's
    contaminating the primary source (no correction hallucination).
  - Write it in the body as `original(→corrected)` — never delete the original.
  - Add a `## Transcript correction log` table at the end of timeline.md:
    `| Scene | Time | Original | Corrected | Evidence |` — a row without evidence
    can't exist (evidence examples: `seg-2 OCR "Claude Code"`,
    `profile.md term "ISA"`).
  - Leave `raw/transcript.json` and `timeline.json` as raw signal — corrections go
    into timeline.md only.
  - When misrecognition is widespread, don't paper over it with corrections;
    strengthen the terms in `WHISPER_PROMPT` and re-run §3 instead (re-running is
    safe, it overwrites raw/).
- **When sensitive data is found, report the list of affected scenes to the user** —
  whether those frames must stay out of the video is the user's call.

### 5. Script alignment — only when `storyboard/script.md` exists

In shooting mode (storyboard first), **align the finished timeline to the storyboard
scenes** — write `recording/alignment.json` per the
`references/timeline-schema.md` §alignment.json contract:

- Compare the timeline.md scenes and sentences against the script.md scenes and set
  a recorded-cut range [start, end] for every storyboard scene number (idx) — put the
  cut in the **silence** between sentence timestamps (0.2~0.4s before the scene
  start, 0.3~0.6s after the end).
- If the same scene was spoken several times (a re-shoot), adopt the **last take**
  and record it in note.
- Look at each scene's keyframe, and when the demo focus is only part of the screen,
  set `crop` [x,y,w,h] — leave the full screen and the text can't be read (the
  editing builder warns past 3x reduction).
- `subs` carries the **corrected notation** sentences from timeline.md on the
  original clock.
- **Report deviations**: improvised speech that isn't in the script, missing scenes,
  reordering, and numbers or proper nouns spoken differently from the script all go
  to the user as a table; settle alignment.json after they choose [re-shoot that
  part / drop the scene / keep it as is].

### 6. Present the timeline + hand off to storyboard

Present the result with AskUserQuestion — the timeline.md path, scene count and
total length, and a one-line summary per scene. Options: [go to storyboard / fix the
timeline (re-run with adjusted boundaries) / stop here]. For storyboard, point to
`/social-flow:storyboard <channel> <topic>` — when `recording/timeline.md` exists,
the storyboard skill uses it as the primary source instead of web research.

**In shooting mode (having gone through §5)** the storyboard is already approved, so
the options differ: [go to editing production / fix the alignment / stop here] —
for the first, point to `/social-flow:produce <channel> <topic>` (produce finds
alignment.json and takes the editing pipeline).

## Traps

- **A spoken transcript is not narration** — fillers ("어", "이제 여기서" — "uh",
  "now here"), repetitions, and slips are all in there. It's raw material for the storyboard to
  rebuild, not sentences to copy into scenes.js (the character limits and the plain-
  language principle get applied at the storyboard stage).
- **A spoken number is not a source** — time-sensitive values (prices, tax rates,
  deadlines) still have to pass the storyboard's cross-checking policy as written. A
  statement in the recording is a claim, not evidence.
- **STT hallucination, scroll false positives, sensitivity tuning** —
  `references/timeline-schema.md` §Traps.
- **Long recordings** — Qwen3-ASR-1.7B transcribes faster than real time on this
  class of Mac; whisper large-v3-turbo runs at roughly 3~5x real time. A 10-minute
  recording is usually 1~3 minutes — run it in the background (run_in_background)
  and prepare other things meanwhile.

## Additional Resources

### Reference Files

- **`references/record.sh`** — start/stop the screen+mic recording (macOS screencapture, PID file management)
- **`references/transcribe.sh`** — extract audio → Qwen3-ASR STT (whisper fallback) → silence detection → screen-change detection (4 raw signals)
- **`references/build-timeline.py`** — merge the signals → derive scene boundaries → timeline.json/md + keyframe extraction
- **`references/timeline-schema.md`** — the recording/ data contract · how boundaries are derived · tuning knobs · traps
