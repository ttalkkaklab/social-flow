# Shooting (screencast) edit pipeline — contracts, gates, pitfalls

The production half of the **storyboard-first shooting flow**. The user records their screen
following `storyboard/script.md` (the shooting script), ingest produces the transcription and
alignment (`recording/alignment.json`), and produce follows this document to **cut the raw
recording into a 9:16 short**. Unlike the TTS/generated-background pipeline (pipeline.md),
**the voice is the user's own and the screen is a real recording** — scenes.js is used only as
the source for title overlays and platform text.

```
storyboard (script) → user shoots (ingest record) → transcribe/align (ingest) → edit (this doc)
```

## Contents

- [Composite geometry (1080×1920)](#composite-geometry-1080×1920)
- [edit.json contract (build-screencast.sh input)](#editjson-contract-build-screencastsh-input)
- [Edit procedure (performed by the produce skill)](#edit-procedure-performed-by-the-produce-skill)
- [Build report gate (build-report.txt)](#build-report-gate-build-reporttxt)
- [Pitfalls](#pitfalls)

## Composite geometry (1080×1920)

```
y 190–460    title block — screencast-overlay.html capture (kicker+title; cover adds the stat)
y ≥460       recording band — width 1080 fit, height cap BAND_MAX_H (900), center BAND_CY (880)
y 1380–1560  burned-in subtitle band — same style as build-reel.sh (symmetric 250 margins)
```

The overlay's y=460 lower bound and the builder's `BAND_MIN_Y=460` are a **paired contract** —
change only one side and the title gets buried under the recording band.

## edit.json contract (build-screencast.sh input)

The same structure as `recording/alignment.json` (the ingest alignment output) plus one extra
`overlay` field — produce captures the overlays, fills in the paths, and saves it as
`.work/edit.json`.

```json
{
  "source": "/abs/recording.mov",      // absolute path to the original (as in alignment.json)
  "scenes": [
    {
      "idx": 1,                        // storyboard scene number (1-based — scenes.js array index +1)
      "start": 3.2, "end": 21.8,       // cut range on the source clock (seconds) — tight against silence boundaries
      "crop": [400, 200, 1600, 1200],  // (optional) source pixels [x,y,w,h] — zoom into the demo focus area
      "overlay": "cards/t1.png",       // (optional) title alpha PNG — produce fills this in
      "subs": [                        // (optional) subtitles — source clock; the builder re-times them
        { "start": 3.4, "end": 6.1, "text": "corrected-notation sentence" }
      ]
    }
  ]
}
```

- **All times are on the source recording clock** — copy sentence timestamps from timeline.json
  as-is. Final timeline re-placement (adding scene offsets, clamping to boundaries) is done by
  the builder's Python expansion.
- `subs.text` uses **the corrected notation from timeline.md (the sub principle: numbers and
  proper nouns in original notation)** — the sentence after §4 correction, not raw whisper
  output. The builder strips `{}`, `\`, and tabs, so escaping isn't a concern.
- Odd `crop` coordinates are snapped to even by the builder (yuv420p chroma alignment).
- Scene-to-scene transitions are **hard cuts** — the user stopped talking and switched screens
  at each scene boundary, so the cut feels natural. Place cut points inside silence (never
  mid-speech).

## Edit procedure (performed by the produce skill)

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/produce/references
# ① prepare the overlay renderer — same sed injection as video-template (same literal pitfall)
sed 's|</body>|<script src="./scenes.js"></script>\n</body>|' \
  $REF/screencast-overlay.html > .work/overlay.html
cp storyboard/scenes.js .work/
# ② capture per-scene titles — ?i is 0-based (edit.json idx-1), files named t<idx>.png
FORMAT_ENV="$PWD/.work/format.env" \
  $REF/capture-frames.sh "file://$PWD/.work/overlay.html?i=0&alpha=1" .work/cards/t1.png 1
#    the prefix sets the window size (CAP_W/CAP_H) and the URL's &format= together. Skip it
#    and only the builder's asset precheck catches it — after all 12 minutes are captured.
# ③ write .work/edit.json from alignment.json + overlay paths, prepare BGM (.work/bgm.wav)
# ④ build — pass THEME.ink as BG
BG="#0b1020" $REF/build-screencast.sh .work   # → reel.mp4 (clean) · reel-sub.mp4 (burn-in) · subs.srt · cover.jpg · build-report.txt
```

- After capturing overlays, confirm `window.__overflow === 0` via `evaluate_script` or by eye
  (long titles auto-shrink through tight1–3, remainder exposed).
- BGM is the same as produce §3 — copy the file that `resolve-asset.py data/<channel> bgm
  default` returns, and only when there is none, generate a `music_generate` instrumental. It
  sits under a live voice, which swings more than TTS, so the builder puts it 12 LU under the
  measured voice rather than the 10 a TTS episode gets (`BGM_SEP`). Cues aren't taken here — a
  screencast is one continuous take, so it gets one bed.
- The outro is the **same shared asset** as the TTS pipeline
  (`resolve-asset.py data/<channel> outro <platform|default>` —
  default `assets/outro/default.mp4`; the legacy `assets/outro.mp4` is also found),
  copied to `.work/outro.mp4`.
- Then the **speed pass, which a shooting edit gets too** — `$REF/speedup.sh .work` (produce
  §7.5). This builder joins the outro with an xfade, and the pass reads that from the report
  line, so the outro tail still comes out at 1.0x. The default factor is 1.2, and it speeds up the
  user's own recorded voice — this builder has no rate normalization of its own, so whatever was
  said goes out 1.2x faster. A take at the 5~6 characters/s shooting standard lands at 6.0~7.2 and
  the final 6.2 characters/s gate rejects it. A channel that records at speaking pace sets
  `Playback speed: 1.0` in profile.md §2.
- From here on, phone-mode review, platform text, and the quality gates follow produce
  SKILL.md §8–10 unchanged.

## Build report gate (build-report.txt)

| Report line | Verdict |
|---|---|
| `drift` ≠ 0.0000s | **Do not proceed** — pipeline bug |
| `✗ source has no audio stream` | the recording was made without -g (mic) — reshoot |
| `⚠ screen scaled down N× (>3.0)` | check text legibility — narrow the crop (zoom the focus) or enlarge the demo app's font and reshoot |
| `⚠ scene N duration > 20s` | split the scene (two cuts in alignment) or reshoot with tighter speech |
| `⚠ overlay file missing` | capture missed — redo ② |
| `⚠ main part > 180s` | tighten cuts or drop scenes |
| Total length | 35–75s recommended, up to 120s, 180s cap (main + outro − 0.6s) — **measured on the speed pass's output** |
| No `── speedup x…` line | **Do not proceed** — the required speed pass never ran (produce §7.5) |

## Pitfalls

- **Cut boundaries go in silence** — alignment start/end landing mid-speech clips words. Place
  cuts in the gaps (silence) between timeline.json sentence timestamps. Scene start 0.2–0.4s
  before the first sentence and end 0.3–0.6s after the last feels natural.
- **Retakes: keep the later take** — if the user re-spoke a scene, alignment cuts only the last
  take's range and drops the earlier one (paired with the reshoot rule in the shooting script).
- **A full 5K screen dropped straight into the band makes text unreadable** — it gets scaled
  down 4.7× to 1080 width. If the demo focus is a region of the screen, set a crop. The builder
  warns above 3× shrink.
- **One crop per scene** — if the focus moves a lot within a scene, split the scene and crop
  each part (pan/zoom animation isn't supported in v1).
- **Subtitles use corrected notation** — pasting raw/transcript.json text embalms
  misrecognitions on screen. Copy from the corrected timeline.md.
- **BGM must be instrumental** — vocals mask-collide with the user's voice (same as
  pipeline.md).
- **Voice cleanup is the builder's job — don't pre-EQ outside it.** The builder processes each
  scene in order: low-end cleanup (80Hz high-pass, 250Hz −3dB) → clarity boost (3.2kHz +3dB) →
  dynamic low-end compression against proximity effect → loudnorm. Pre-processing doubles up
  and thins the voice. A cardioid mic inflates the lows only when you speak **loudly up close**
  (that boomy ring), so a fixed EQ cut hollows out the quiet passages — that's why
  `sidechaincompress` pushes the lows down only on loud moments.
- **No -shortest muxing** — never remux audio/video outside the builder.
- **Never add a literal body-closing tag to the overlay html** — the sed injection replaces
  that spot (same contract as the measured video-template incident).
