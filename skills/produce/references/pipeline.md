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
- Ken Burns margin: a still card with no `span=` zooms `KB_RATE` (4%/s) × card seconds,
  capped at a total scale of `KB_ZMAX` 1.075. Text is baked into the card, so the cap is the
  zone math on all three edges, and the tightest one binds. The bottom is the tightest: the
  zone runs to y 1350 and the burned-in subtitle band starts at 1380, so `390·z + 960 ≤ 1380`
  gives z ≤ 1.0769 — at 1.075 a zone-filling card's last line ends at 1379, just above the band.
  The top ends at y≈132 (under the phone's status bar, not behind it) and the template's 640px
  hero stat ends at x 884, inside the 890 where the action-bar icons start. Landscape is the
  one place the cap does not decide the bottom — its zone bottom (y 795) sits on the worst-case
  subtitle top, so any zoom past 1 crosses it, which was already true at the old 3.5%.
  **Every column-4 move keeps this cap** — easing changes the timing,
  not the span; `punch` lands 3.5% early and creeps to the same span; `drift` moves ±6px
  inside a 1.04 base scale that the crop absorbs. A `span=` written from the storyboard
  ladder is deliberate and passes the cap — the fast rows want a bigger source image and
  centred or absent text. The one option that eats into it is `focus=` off centre:
  at `focus=1:y` the window shifts wholly one way, and an element at x=176 lands at
  x≈144 — inside the 96px phone crop but out of the symmetric text zone. So `focus=`
  belongs on cards whose text is centred or absent (cover b-roll sources, full-bleed
  photos), not on text-heavy cards.

## What build-reel.sh does (in order)

Silence trim → loudnorm -16 → measured speech rate (warning band only — the voice is not time-stretched; `ATEMPO_MIN`/`ATEMPO_MAX` default to 1.0 since 2026-09-11)
→ sentence-boundary detection (silencedetect — character-count proportional fallback on failure) → card
duration rounded up to whole frames + sample-accurate audio padding (**zero drift**) → reveal transition
timing (reveal-timing.py) → visual chain (video + alpha overlay composite → reveal xfade) → Ken Burns
zoompan (4%/s on stills, capped at 1.075) → concat → BGM sidechain ducking → subtitle files (`subs.srt` for publishing ·
`subs.ass` for burn-in) → outro splice through black (only when the channel's outro is on) → loudnorm -14 final encode (H.264 High 4.1, faststart)
→ cover still extraction (`COVER_TS`, and the frame it pulls now comes out of a moving still —
a 5s punch cover sits at scale 1.062 at 3.2s, so the thumbnail is that bit tighter).

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

The source storyboard owns scene transitions and per-shot `edit` timing. The builder compiles
`cards.resolved.tsv`, rejects contradictory options and reserves unseen outgoing frames for
moving transitions. Default narration margins are pre=0 and post=0.12s; dip pre=0.30s.
Sync footage keeps its original timing. See [cinematic-edit.md](cinematic-edit.md) for the
handle contract, source trims and final boundary playback review. No missing transition
falls back silently and no short video loops or freezes to fill its window.

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
| `REGEN recommended` (speech rate outside [3.2/factor, 6.2/factor] — [3.2, 6.2] at the 1.0 default · clipped ending) | Recheck that card through the checked speech gate within its remaining attempt allowance, then rebuild. If exhausted, hold and correct the script through the existing approval rules |
| `boundary proportional fallback` | OK to continue — if it recurs, fix the script's sentence boundaries (periods) |
| `segment window under 0.9s` | Merge the short sentence with a neighbor |
| `min gap between reveals <0.40s` | Trim bullets or lengthen the sentence |
| `duration > 13s` (card) | Shorten the script and regenerate that card's TTS |
| `separation <N> LU is under the <floor> LU floor` | **Do not proceed** — the build exits 1; the bed is competing with the voice. Lower the bed (`BGM_SEP`), swap in a quieter cue, or fix a narration track that came in hot, then rebuild |
| `separation <N> LU is no wider than the <N> LU resting distance` | The ducking never fired — the voice key went silent or the bed reached the mix around it. Rebuild after fixing; continue only if the voice is audibly clear over the music |
| `── voice-to-bed separation <N> LU` (no mark) | OK — at or above the 4 LU floor and wider than the resting distance |
| Total length | the channel's band (`length_min_seconds`/`length_max_seconds`); unset, the preset's 35–120s stands, of which 35–75s is the recommendation, and 180s is the platform's own cap. Expect main + outro here (build-screencast.sh overlaps its xfade, so main + outro − 0.6s on that lane) and main alone with `OUTRO=0` — **measured on the final pace pass's output** |
| `── no outro (OUTRO=0, …)` | Expected on a **short** from a channel whose `shortform_outro` is off. On long-form the toggle doesn't apply and the outro always splices, so there — or on a short whose channel keeps its outro — **do not proceed**: `OUTRO` in `.work/format.env` contradicts the channel, so fix the flag and rebuild |
| `✗ OUTRO=1 but <asset> isn't in the workdir` | **Do not proceed** — the build stops there. Copy the outro under `format.env`'s `OUTRO_ASSET` name (produce §6), or set `OUTRO=0` when the channel ships without one |
| `✗ OUTRO=0 but the build spliced an outro` | **Do not proceed** — the speed pass stops there. The flag was changed after the build, so the outro is sitting inside the feature and would be sped up with it. Rebuild under the flag you want |
| `✗ OUTRO=1 but the build joined no outro` | **Do not proceed** — the speed pass stops there. The flag was changed after the build, so the tail boundary would be cut out of the feature and its last seconds shipped unsped. Rebuild under the flag you want |
| `⚠ first cue at …s — past the 1.0s mark` | The opening second carries no words. Not a build failure: look at `.work/qa/first-frame.png`, and if the frame is bare too, bring the cover's first sentence forward and rebuild |
| `── first cue …s` (no mark) | OK — the first subtitle is up inside the first second, and the t=0 still is in `.work/qa/` |
| No `── speedup x…` line | **Do not proceed** — the required speed pass (produce §7.5) never ran, and `output/` would get the un-sped build. Run `speedup.sh .work` and copy the `-fast` set |
| No `PASS final speech rate` line, or a `final speech rate` failure | **Do not proceed** — the shipped subtitle timeline was not checked or exceeds 6.2 characters/s. Lower the profile factor or shorten the dense line, rerun the pass, and use only the new `-fast` set |
| `reel-fast.mp4 is …s but …s was expected` | **Do not proceed** — the speed pass exits 1; the filter didn't take. Check that the `outro.mp4` in the workdir is the same file the build spliced — a flag the build and the pass disagree on is caught earlier, by the `✗ OUTRO=…` lines above |
| `apart after the speed-up — YouTube drops chapters under 10s` | Long-form only. Merge the chapters that landed under 10s apart and rebuild — YouTube drops the entire list, not just that entry |

## Three TTS failure modes and responses (Gemini TTS, field-tested)

All generated narration first passes `tts_generate_checked` as defined in `tts-quality.md`.
Missing/stale/failed speech proofs block assembly. The wrapper owns the three-take limit;
legacy advisories below never authorize extra takes or changing the profile model.
Unavailable review holds production. After any audio replacement, obtain a new proof.

1. **Duration degeneration** — a short script can contain minutes of trailing silence.
   The checked tool rejects abnormal duration and uses only the remaining take allowance.
2. **`No content parts in response`** — the Gemini client retries its request at fixed settings.
   If it still fails, the checked tool holds production. Do not change the profile's model
   or rewrite the script merely to make the request succeed.
3. **`INTERNAL 500`** — provider retries stay inside the client. Persistent failure is
   unverified, not an instruction to spend three more takes.

The three axes of voice consistency: ① fixed stylePrompt/voiceName ② loudnorm per-segment
normalization ③ one pace chosen at the engine and kept on every cut — the build no longer
stretches cards toward a chars/s target (measured 2026-09-11: the engine ran 5.3–6.4 chars/s
against a 4.5 target, so every card sat at the 0.88 floor and adjacent cards differed by up to
30%). Output may be raw PCM (24kHz/s16/mono) — the build auto-detects via the RIFF magic.
temperature 0.4.

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
