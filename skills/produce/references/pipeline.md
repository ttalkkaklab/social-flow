# Video pipeline details — contracts, gates, pitfalls

The composition contract around build-reel.sh, plus pitfalls verified in real builds.
Inherited from the fect-persona make-reels pipeline (same script, same contract).

## Contents

- [Safe zone (measured on tall phones — do not shrink these numbers)](#safe-zone-measured-on-tall-phones-do-not-shrink-these-numbers)
- [What build-reel.sh does (in order)](#what-build-reelsh-does-in-order)
- [Reveal timing contract (reveal-timing.py)](#reveal-timing-contract-reveal-timingpy)
- [Build report gate table (build-report.txt)](#build-report-gate-table-build-reporttxt)
- [Three TTS failure modes and responses (Gemini TTS, field-tested)](#three-tts-failure-modes-and-responses-gemini-tts-field-tested)
- [Palindrome loop (8s clip → 16s)](#palindrome-loop-8s-clip-→-16s)
- [Field-tested pitfalls](#field-tested-pitfalls)

## Safe zone (measured on tall phones — do not shrink these numbers)

```
top 190px        system UI + IG/YT top-left wordmark
left/right 176px IG action-bar avoidance (symmetric, since text is center-aligned)
bottom 570px     burned-in subtitle band (y 1380–1560) + IG caption / YT channel overlay (y≥1580)
→ text zone x 176–904 (width 728) · y 190–1350. Only the background visual uses the full 1080×1920.
```

- Why 176px per side: on a 19.5:9 tall phone, IG aspect-fills the 9:16 video and crops
  96px off each side, and in that cropped view the action-bar icons start at video
  coordinate x≈890. `reel-qa.html?fit=crop` reproduces this crop.
- Ken Burns margin: the build zooms 3.5%, so an element at x=904 grows to 917 in the
  final frame. The template auto-shrinks the hero stat to a 640px width.
  **Every column-4 move keeps this margin** — easing changes the timing, not the span;
  `punch` lands the same 3.5% early and holds; `drift` moves ±6px inside a 1.04 base
  scale that the crop absorbs. The one option that eats into it is `focus=` off centre:
  at `focus=1:y` the window shifts wholly one way, and an element at x=176 lands at
  x≈144 — inside the 96px phone crop but out of the symmetric text zone. So `focus=`
  belongs on cards whose text is centred or absent (cover b-roll sources, full-bleed
  photos), not on text-heavy cards.

## What build-reel.sh does (in order)

Silence trim → loudnorm -16 → measured speech rate + atempo normalization (outside ±5%, clamped 0.88–1.18)
→ sentence-boundary detection (silencedetect — character-count proportional fallback on failure) → card
duration rounded up to whole frames + sample-accurate audio padding (**zero drift**) → reveal transition
timing (reveal-timing.py) → visual chain (video + alpha overlay composite → reveal xfade) → Ken Burns
zoompan (3.5%) → concat → BGM sidechain ducking → subtitle files (`subs.srt` for publishing ·
`subs.ass` for burn-in) → outro xfade 0.6s splice → loudnorm -14 final encode (H.264 High 4.1, faststart)
→ cover still extraction (`COVER_TS`).

**The build produces two videos** — `reel.mp4` (clean master, no subtitles) and `reel-sub.mp4`
(bottom-band burn-in). The rule is to upload subtitles as a separate file instead of burning them
into the video, so the clean copy is the default; the burn-in copy is for IG Reels, which can't
take a subtitle file. The burn-in copy is not a re-encode of the clean master — it's rendered
**once more from the same source** (both are first-generation). SRT and ASS are both written at
the very spot the subtitle lines are produced — converting one from the other lets their timings
diverge.

**Synchronization comes from structure** — audio is one file per card, and card length is fixed
by frame rounding + sample-accurate padding. Reveals are pure video-side timing, so even a wrong
boundary detection produces zero drift. Always composite through build-reel.sh (an -shortest mux
was measured to accumulate 105ms).

**Card joins default to a J-cut.** An incoming spoken card with no `enter=` opens on the
previous last frame for `SCENE_JCUT` (0.32s) while the next line already plays, then the
picture cuts. `POST` is 0.45s (last-reveal hang). Write `enter=cut` for a smash with the old
silent pre-roll. Dissolve, iris, blur, zoom, push, whip and dip stay explicit spent effects
drawn inside the incoming card, so concat `-c copy` and drift 0 still hold — iris and blur
reach for an xfade there, which is safe inside one encode and still banned at the seam
(build-reel.sh §7.4 says why). A J-cut drops that card's silent
`PRE` from its length because the next line occupies it.

## Reveal timing contract (reveal-timing.py)

- **Segment-boundary transition** = fade **inside** the detected pause, completing 0.05s before
  the next sentence starts.
- **Sub-reveals** (`A|B`, bullets that aren't spoken) = snap to an undetected pause (a breath)
  inside the window; if there is none, divide evenly.
- The report prints a reason for every transition — pause-aligned / breath-snap / even-split /
  lead-fallback. **If you see lead-fallback, fix the script's sentence periods.**
- Set `COVER_TS` (the cover still timestamp) **after** the report's cover-transition completion
  time — the hook only lands on a frame where the hero number has fully appeared.

## Build report gate table (build-report.txt)

| Report line | Verdict |
|---|---|
| `drift` ≠ 0.0000s | **Do not proceed** — pipeline bug |
| `missing reveal state: r<k>` | **Do not proceed** — capture the missing state and split that segment into `A\|B` sub-reveals, then rebuild |
| `last reveal state unused` | **Do not proceed** — the last bullet/source never appears in the video. If `no reveals.tsv` shows, this check is off (capture-reveals.sh wasn't used) |
| `REGEN recommended` (speech rate outside [3.2/factor, 6.2/factor] — [2.67, 5.17] at the 1.2 default · clipped ending) | Regenerate only that card once with the same registry → rebuild. If it repeats, shorten the script |
| `boundary proportional fallback` | OK to continue — if it recurs, fix the script's sentence boundaries (periods) |
| `segment window under 0.9s` | Merge the short sentence with a neighbor |
| `min gap between reveals <0.40s` | Trim bullets or lengthen the sentence |
| `duration > 13s` (card) | Shorten the script and regenerate that card's TTS. Hitting the atempo ceiling (1.18) is also a shorten signal |
| `separation <N> LU is under the <floor> LU floor` | **Do not proceed** — the build exits 1; the bed is competing with the voice. Lower the bed (`BGM_SEP`), swap in a quieter cue, or fix a narration track that came in hot, then rebuild |
| `separation <N> LU is no wider than the <N> LU resting distance` | The ducking never fired — the voice key went silent or the bed reached the mix around it. Rebuild after fixing; continue only if the voice is audibly clear over the music |
| `── voice-to-bed separation <N> LU` (no mark) | OK — at or above the 4 LU floor and wider than the resting distance |
| Total length | 35–75s recommended, up to 120s, 180s cap (main + outro − 0.6s) — **measured on the final pace pass's output** |
| No `── speedup x…` line | **Do not proceed** — the required speed pass (produce §7.5) never ran, and `output/` would get the un-sped build. Run `speedup.sh .work` and copy the `-fast` set |
| No `PASS final speech rate` line, or a `final speech rate` failure | **Do not proceed** — the shipped subtitle timeline was not checked or exceeds 6.2 characters/s. Lower the profile factor or shorten the dense line, rerun the pass, and use only the new `-fast` set |
| `reel-fast.mp4 is …s but …s was expected` | **Do not proceed** — the speed pass exits 1; the filter didn't take. Check that `outro.mp4` in the workdir is the same file the build spliced |
| `apart after the speed-up — YouTube drops chapters under 10s` | Long-form only. Merge the chapters that landed under 10s apart and rebuild — YouTube drops the entire list, not just that entry |

## Three TTS failure modes and responses (Gemini TTS, field-tested)

1. **Duration degeneration** — a short script comes out as 24s, 61s, 655s, all silence after the
   speech. Skip the post-generation ffprobe length check (over 2× chars/4.5 → regenerate) and the
   whole build breaks.
2. **`No content parts in response`** — regenerate with the same parameters. **3–4 in a row**
   means flash won't produce that script — switch to `model: "gemini-2.5-pro-preview-tts"` and it
   passes in one try (voiceName is unchanged, so no tone shift).
3. **`INTERNAL 500`** — regenerate with the same parameters.

The three axes of voice consistency: ① fixed stylePrompt/voiceName ② loudnorm per-segment
normalization ③ atempo speech-rate normalization. Output may be raw PCM (24kHz/s16/mono) — the
build auto-detects via the RIFF magic. temperature 0.4.

## Palindrome loop (8s clip → 16s)

> **Never use it in a segment that uses the video's own sound.** It's forward+reverse
> concatenation, so audio plays backwards in the second half. For b-roll under produce absolute
> rule 9 (generated-video segments use the clip's own sound), **cut only the used length (the
> broll scene duration, default 4s) from the 8s generation**; if that's not enough, trim the
> scene plan — don't stretch with a palindrome. Palindromes are only for segments that discard
> the sound (e.g. quote scenes that lay narration over a speech clip).

```bash
ffmpeg -y -i cover-motion.mp4 -filter_complex \
  "[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0,fps=30,format=yuv420p[v]" \
  -map "[v]" -c:v libx264 -preset medium -crf 18 speaker-palin.mp4
```

## Field-tested pitfalls

- **The reveal contract is "layout invariance"** — the template hides future elements with
  `opacity:0` only. Switching to `display:none`/conditional rendering shifts layout between
  states and contaminates the xfade into a full-frame crossfade.
- **Don't tie the state count to the sentence count** — reading 4 bullets in 3 sentences makes
  the last transition dump 2 bullets + the source at once. Split bundled segments into `A|B`
  sub-reveals. Verify by extracting frames and counting bands — they must grow 1→2→3→4 one step
  at a time.
- **Boundary detection is made by periods** — a long comma-spliced sentence produces no silence
  and goes down the proportional fallback path.
- **Stretching a square image to 9:16 with `veo_img2video` bakes in letterboxing** — use
  `veo_reference` for character speech.
- **Speech clip scale** — frame-persona-clip.py fixes position but can't fix scale. Put "subject
  appears small in the frame" in the prompt and regenerate only the misaligned clips. An hstack
  comparison is the only way to detect it.
- **Korean glued right after a bash variable gets absorbed into the name** — braces are
  mandatory, as in `"${MV}상태"`. Regression check:
  `grep -nP '\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]'`.
- **BGM must be instrumental** — vocals mask-collide with the narration (Lyria defaults to
  instrumental, so it's safe).
- **Don't put the outro in the manifest** — the closing line plays twice.
- **Never measure oversized typography width with scrollWidth** — in a centered flex container
  `scrollWidth == clientWidth`, so the shrink loop never runs. Measure with
  `getBoundingClientRect().width` (built into the template).
- **Fonts**: libass can't read woff2 — drop a ttf into `.work/fonts/` and it's used
  automatically; without one, the fontconfig fallback (Apple SD Gothic Neo) still yields
  publishable quality.
- **Headless Chrome --screenshot has a history of not exiting after saving** — capture-frames.sh
  works around it with file polling + kill.
- **Subtitle side margins are symmetric** — asymmetric margins push center-aligned subtitles off
  the screen center.
- **Phone-mode review with `resize_page` alone (no `emulate`) captures only a narrow strip** —
  viewport "390x844x3,mobile,touch" is mandatory.
