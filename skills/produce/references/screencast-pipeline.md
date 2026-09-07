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
  copied to `.work/outro.mp4` — **when the channel's `shortform_outro` is on, which is the
  default**. With it off, skip the copy and append `: "${OUTRO:=0}"` to `.work/format.env`
  (produce §1 writes that line beside `SPEED`); the builder then muxes the recording alone and
  says so. The flag decides, not the file: `OUTRO=1` with nothing to splice stops the build, and a
  leftover `outro.mp4` under `OUTRO=0` is ignored by the builder and the speed pass alike. Flip the
  flag between the build and the pass and the pass stops — it reads the build report, not the file.
- Then the **speed pass, which a shooting edit gets too** — `$REF/speedup.sh .work` (produce
  §7.5). This builder joins the outro with an xfade, and the pass reads that from the report
  line, so the outro tail still comes out at 1.0x; with `OUTRO=0` there is no tail and the whole
  file speeds up. The default factor is 1.0, which preserves the
  user's recorded voice and timing. This builder has no rate normalization of its own.
  A channel-selected 1.2x raises a take at the 5~6 characters/s shooting standard to 6.0~7.2,
  which can exceed the final 6.2 characters/s gate. Profile.md §2 can override the default.
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
| Total length | the channel's band (`length_min_seconds`/`length_max_seconds`); unset, the preset's 35–120s stands, of which 35–75s is the recommendation, and 180s is the platform's own cap. This builder overlaps its xfade, so expect main + outro − 0.6s with the outro on, main alone with `OUTRO=0` — **measured on the speed pass's output** |
| `── no outro (OUTRO=0, …)` | Expected on a channel whose `shortform_outro` is off; with the outro on, **do not proceed** — fix `OUTRO` in `.work/format.env` and rebuild |
| `✗ OUTRO=1 but <asset> isn't in the workdir` | **Do not proceed** — copy the outro under `format.env`'s `OUTRO_ASSET` name, or set `OUTRO=0` |
| `✗ OUTRO=0 but the build spliced an outro` | **Do not proceed** — the flag changed after the build, so the spliced outro would be sped up with the feature. Rebuild under the flag you want |
| `✗ OUTRO=1 but the build joined no outro` | **Do not proceed** — the flag changed after the build, so the tail would be cut out of the recording and its last seconds shipped unsped. Rebuild under the flag you want |
| `⚠ first cue at …s — past the 1.0s mark` | The opening second carries no words. Not a build failure: look at `.work/qa/first-frame.png` and, if the take opens on a held frame, recut the first scene |
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
