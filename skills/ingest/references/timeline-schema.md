# Timeline data contract — recording/

`data/<channel>/episodes/<topic>/recording/` — the ingest skill's output.
`timeline.md` is the **primary source** that takes the place of the storyboard
skill's research (research.md).

```
recording/
├── raw/                 # transcribe.sh raw signals (intermediate — overwritten on re-run)
│   ├── audio.wav        # 16kHz mono extracted audio
│   ├── transcript.json  # STT (ms offsets) — Qwen3-ASR or whisper.cpp
│   ├── silences.tsv     # silence spans, start<TAB>end (seconds)
│   ├── scenes.tsv       # screen-change times (seconds)
│   └── duration.txt     # source length (seconds)
├── timeline.json        # machine-readable — schema below
├── timeline.md          # human-readable — scene table + per-sentence timestamps + keyframes + screen descriptions
└── keyframes/seg-N.jpg  # scene keyframe (960px, read directly with the Read tool)
```

## timeline.json

```json
{
  "source": "/abs/path/recording.mov",   // absolute path to the source (never copied)
  "duration": 312.4,
  "params": { "min_scene": 8.0, "max_scene": 45.0 },
  "scenes": [
    {
      "idx": 1,
      "start": 0.0, "end": 23.4, "duration": 23.4,
      "text": "all speech in the scene, joined",
      "sentences": [ { "start": 0.8, "end": 4.1, "text": "one sentence" } ],
      "keyframe": "keyframes/seg-1.jpg"
    }
  ]
}
```

## timeline.md

frontmatter: `source` / `duration` / `scenes` / `generated` / `status`.
`status` goes `draft` (straight out of build-timeline) → `annotated` (after screen
descriptions and transcript corrections).
Body: the scene summary table (`| # | Range | Length | Speech | Screen |`) plus
per-scene detail (embedded keyframe, per-sentence `[mm:ss.s]` timestamps, screen
description). **build-timeline leaves the Screen column as a placeholder and the
ingest skill fills it from what it reads off the keyframes.**

Transcript correction contract: write an STT misrecognition in the body as
`original(→corrected)` (never delete the original), and log it in the
`## Transcript correction log` table at the end
(`| Scene | Time | Original | Corrected | Evidence |`).
Only keyframe OCR or a profile.md term match counts as evidence — corrections
without evidence aren't allowed.
`raw/transcript.json` and `timeline.json` keep the raw signal untouched (the
chain of custody: raw = whisper's own words, timeline.md = the evidence-backed
corrected version).

## alignment.json — script alignment (storyboard-first mode only)

When `storyboard/script.md` (the shooting script) exists, ingest records **the
alignment between the recording and the storyboard scenes** in this file after the
timeline review. It's the input to the produce editing pipeline
(produce `references/screencast-pipeline.md`), and adding only the `overlay` field
turns it into edit.json as-is.

```json
{
  "source": "/abs/recording.mov",      // same absolute source path as timeline.json
  "scenes": [
    {
      "idx": 1,                        // storyboard scene number (scenes.js array index + 1)
      "start": 3.2, "end": 21.8,       // cut range on the source clock — tight, inside silence
      "crop": [400, 200, 1600, 1200],  // (optional) demo focus area [x,y,w,h] — evidenced by the keyframe
      "subs": [                        // subtitles — corrected notation from timeline.md, source clock as-is
        { "start": 3.4, "end": 6.1, "text": "a sentence" }
      ],
      "note": "take 2 adopted (restarted at 0:41)"   // (optional) record of the alignment call
    }
  ]
}
```

Alignment rules:

- **A human (Claude) writes it by comparison** — read the timeline.md scenes and
  sentences against the script.md scenes and match them. It isn't algorithmic
  matching, so it absorbs reordering and re-shot takes.
- Put cut boundaries in the **silence** between sentence timestamps — the scene
  start 0.2~0.4s before the first sentence, the end 0.3~0.6s after the last.
- If the same scene was spoken several times (a re-shoot), adopt the **last take**
  and write it in `note`.
- Set `crop` from the keyframe, on the demo focus area — leave the full screen (5K)
  as-is and it shrinks 4.7x to 1080 wide, where the text can't be read (the builder
  warns past 3x reduction).
- `subs.text` is the **corrected notation** from timeline.md (the corrected side of
  original(→corrected), the sub principle) — put the raw original in and the
  misrecognition is fixed on screen forever.
- Scenes in the script but missing from the recording, and speech outside the
  script (improvised), get reported to the user; settle it after they choose
  [re-shoot that part / drop the scene / keep the improvisation].

## How boundaries are derived

1. Score every `silencedetect` silence with `score_boundary(silence, screen-change list)`
   — ≥1.0 strong boundary / 0~1 weak boundary / ≤0 ignore.
2. Split at strong boundaries first. A boundary always **snaps to the gap between
   sentences** (the silence absorbs the ±0.2s error in transcript timestamps).
3. Scenes over `MAX_SCENE_SEC` (default 45s) get re-split at their highest-scoring
   internal weak boundary; scenes under `MIN_SCENE_SEC` (default 8s) merge into the
   shorter neighbor.
4. A point with only a screen change while speech continues is not a boundary —
   cutting a scene mid-speech tears sentences apart when the narration gets rebuilt.

## Tuning knobs (transcribe.sh environment variables · build-timeline.py arguments)

| Knob | Default | Raise it | Lower it |
|---|---|---|---|
| `SIL_DB` | -35dB | more silence detected in a noisy recording | catches even faint pauses in a quiet room (-40dB) |
| `SIL_MIN` | 0.6s | ignores catching a breath (fewer boundaries) | more boundary candidates |
| `SCENE_THRESH` | 0.04 | fewer scroll false positives (0.15 when they pile up) | detects even small screen changes |
| `--min-scene` | 8s | more merging of tiny scenes | allows short scenes |
| `--max-scene` | 45s | allows long scenes | more splitting |

`WHISPER_PROMPT` (no default) isn't a numeric knob but **a glossary injection** — a
comma-separated list of proper nouns and domain terms (profile.md plus terms you
expect for the topic). Qwen3-ASR takes it as `--context`, the whisper fallback as
`--prompt` (with `--carry-initial-prompt` across a long recording) — either way the
decoder biases toward that vocabulary and misrecognition drops at the source.
It's the cheapest fix to re-run — when misrecognition is widespread, strengthen the
glossary and run transcribe.sh again instead of correcting after the fact.

## Traps

- **STT Korean hallucination** — the engine invents sentences over silence or
  repeats the same one (Qwen3-ASR does it less than whisper). build-timeline
  automatically drops anything with 70% silence overlap and 3-in-a-row repeats,
  but if you see a "sentence nobody said" while reviewing timeline.md, be
  suspicious of that span.
- **Scrolling is not a screen change** — if scenes.tsv is full of scroll false
  positives, re-run with `SCENE_THRESH=0.15`. But transition times only feed the
  boundary score near a silence, so false positives during speech are harmless
  (the sensitive side is the safe side).
- **Never copy the source** — timeline.json references the source by absolute path.
  Moving the source makes keyframe re-extraction impossible, so finish ingest
  before moving it.
- **Correction hallucination** — an LLM correction happens only with evidence
  (keyframe OCR, profile.md terms) to compare against. "Smoothing" it without
  evidence contaminates the primary source — what was actually said disappears.
  For the notation and log rules, see the transcript correction contract in the
  timeline.md section above.
- **A transcript is not a citation** — spoken transcripts contain fillers, slips,
  and imprecise numbers. Before storyboard approval, apply the storyboard skill's
  verification policy (cross-checking) to time-sensitive numbers as written. The
  fact that it was said in the recording doesn't make it a source.
