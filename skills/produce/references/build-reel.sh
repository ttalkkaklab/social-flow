#!/usr/bin/env bash
# make-reels feature build pipeline v3 — reels-native (L0~L5)
#   Keeps the v2 audio machine (zero drift: audio-driven + frame ceiling + sample-exact padding)
#   and extends the video side: sentence-boundary detection → reveal crossfade chain → Ken Burns
#   → ASS subtitles → b-roll windows.
#
# Usage: build-reel.sh <workdir>
#   <workdir>/cards.tsv : idx <TAB> narration-audio-path <TAB> target-rate(chars/sec) <TAB> zoom(in|out|auto|none|punch|hold) [<TAB> opts]
#                         in/out/auto zoom over the whole card by the card's span: span= when written,
#                         else KB_RATE × card seconds capped at KB_ZMAX (the baked text stays in the zone).
#                         zoom=none skips Ken Burns — for footage that already moves, like filmed clips.
#                         Refused on a still card (every segment visual an image): a still never sits
#                         frozen under the voice (owner directive 2026-09-03).
#                         zoom=punch lands ZOOM_SPAN (3.5%) inside the first PUNCH_D seconds (ease-out), then
#                         keeps creeping to the card's span — the cover-card move (the hook contract wants
#                         movement inside 0–3s, and nothing sits frozen after the hit).
#                         zoom=hold keeps a fixed scale with no zoom motion — the base for drift=1
#                         (pure handheld) or a pan= travel. A bare hold is refused on a still card too.
#                         All zoom/pan motion is eased (smoothstep) — KB_EASE=linear restores the old ramp.
#                         Column 5 opts is "k=v,k=v" (optional — 4-column files run unchanged today):
#                           sync=1        a card whose audio is one body with the picture (live voice
#                                         of a user-filmed clip). Pre-roll, post-roll and minimum
#                                         duration 0, no silence trim or tempo correction — cutting
#                                         desyncs mouth and sound. Only normalization (loudnorm) runs
#                                         (skipped too for a silent clip). Pass the wav extracted from
#                                         the clip as-is — card duration = that audio's duration.
#                           subs=<tsv>    subtitles for this card from a file: start<TAB>end<TAB>sentence,
#                                         times in seconds from card start. For subtitles that skip
#                                         speech-boundary detection (transcripts). Combined with the
#                                         subtitle-display column of segs.tsv, both appear
#                           pan=<dir>[:z] Ken Burns as a travel instead of a centre zoom — l2r|r2l|u2d|d2u
#                                         plus diagonals tl2br|br2tl|tr2bl|bl2tr. z is the scale (default
#                                         1.12, clamped to KB_ZOOM_MIN~KB_ZOOM_MAX). Travel = W(z-1)
#                                         horizontal / H(z-1) vertical — ~130px at z=1.12 on either
#                                         canvas, so portrait works too. Column 4 in/out adds a ZOOM_SPAN
#                                         zoom drift on top of the travel (the classic Ken Burns pan+zoom);
#                                         auto keeps the scale fixed while travelling.
#                           focus=fx:fy   zoom towards this point instead of the centre — normalized 0..1
#                                         canvas coordinates (0.5,0.5 = centre = today's behavior). The far
#                                         side of the frame shifts up to 2x the centre-zoom case, so use it
#                                         on cards whose text is centred or absent (safe-zone note in
#                                         pipeline.md). Ignored while pan= is set — the pan owns the path.
#                           drift=1       handheld drift — two non-integer-ratio sines per axis wobble the
#                                         window a few output pixels. Composes with in/out/punch (adds a
#                                         DRIFT_Z base scale for travel margin) or hold (pure handheld).
#                                         The micro-shake register: presence, unease, cutting the AI look
#                           span=<0..1.5> this card's zoom span, replacing the global ZOOM_SPAN — 0.4 means
#                                         the window grows (or shrinks) 40% over the card. Applies to in/out,
#                                         punch and the pan zoom drift; unused on hold/none (same as focus=).
#                                         Past base+span > ZOOM_BASE/canvas (base: pan z / drift 1.04 / else 1)
#                                         the source upscales — the build warns; raise ZOOM_BASE to match.
#                           ease=<mode>   this card's easing, replacing the global KB_EASE — smooth (default,
#                                         eased both ends) | linear | in (accelerating: starts unnoticed,
#                                         fastest at the cut point — action/CTA cards, cut away at the peak).
#                                         punch keeps its own ease-out ramp and ignores ease=.
#                           enter=<mode>  the join in front of this card — **written on every spoken card
#                                         after the first**, copied from the board's `transition` (produce
#                                         §6 has the mapping). jcut | cut | black | white | dissolve | iris |
#                                         blur | zoom | push:<l2r|r2l|u2d|d2u> | whip:<l2r|r2l|u2d|d2u>.
#                                         enter=1 still means black. An empty enter= is the legacy
#                                         4-column form: it falls back to a J-cut and the build warns,
#                                         because that is the one join nobody chose.
#                           exit=<mode>   the join behind it: cut (default) | black | white. exit=1 = black.
#                                         **Dip** (black/white) is two halves: exit= on the card that ends the
#                                         scene, enter= on the one that starts the next, SCENE_FADE (0.30s)
#                                         each. It passes through a solid frame — a beat of nothing.
#                                         **Carry** (jcut, dissolve, iris, blur, zoom, push, whip) is written
#                                         on the incoming card alone. That card opens on the previous card's
#                                         last frame and gets out of it — jcut holds it while the new line
#                                         already plays (SCENE_JCUT, 0.32s) then snaps to the new picture;
#                                         dissolve melts through it over SCENE_XF (0.45s); iris opens a circle
#                                         out of it (SCENE_IRIS, 0.45s); blur smears it sideways and melts
#                                         (SCENE_BLUR, 0.45s); push slides it off over SCENE_PUSH (0.32s);
#                                         whip slides it off smeared along the travel axis (SCENE_WHIP,
#                                         0.24s); zoom grows it past the camera (SCENE_ZOOM, 0.32s).
#                                         **Every carry is a split edit**: the next line starts at this
#                                         card's first frame, under the carried frame, so you hear the next
#                                         sentence before the picture has finished changing and the picture
#                                         never changes in silence (Murch; measured 0 stretches of >0.3s
#                                         silence on the 85s reference short). A carry therefore drops the
#                                         silent pre-roll (PRE seconds) from that card's length.
#                                         **cut** is the smash: picture and sound change together, the old
#                                         silent pre-roll. A dip keeps it too — its silence is the beat.
#                                         Every mode is drawn **inside one card's own encode**, so §9 still
#                                         stream-copies and drift stays 0. A dip keeps the card's frame
#                                         count (measured A/B: identical subs.srt, 12.000000s both ways).
#   <workdir>/segs.tsv  : idx <TAB> seg(0..) <TAB> visual-path <TAB> TTS-script-sentence <TAB> subtitle-display-sentence
#                         visual = reveal-state PNG (reel-template ?reveal=k capture) or .mp4 (fullscreen b-roll)
#                         Listing several with '|' splits the sentence's speech window evenly and they
#                         appear stepwise — a card with more bullets than sentences must be split this way
#                         Or "video.mp4::overlay.png" — composites an alpha PNG (reel.html?alpha=1 capture)
#                         over the video (persona speech video + badge/quote/signature overlays). Segs that
#                         continue the same video start earlier by the xfade offset via -ss so playback
#                         carries across the transition (no video jump at the cut).
#                         Prefixing the path with "@" plays it **once** — starts at the first frame and
#                         holds on the last (no -ss advance, no loop). For clips that are one motion from
#                         start to end, like a typing card. "@video.mp4::overlay.png" works with an overlay
#                         TTS-script = for char count/proportional fallback (Korean phonetic spelling) /
#                         subtitle-display = for the screen (numbers/units as written)
#   <workdir>/bgm.wav   : background music — the bed the episode opens on. Shorter than the
#                         feature is fine; it gets crossfaded onto itself, not butt-joined
#   <workdir>/bgm.tsv   : (optional) idx <TAB> audio-file — a music cue. idx is the card idx
#                         (0-based, the scenes.js array index — the same number sfx.tsv and
#                         chapters.tsv use). The bed changes to this file at that card and stays
#                         until the next row. A row for card 0 overrides bgm.wav as the opening bed;
#                         bgm.wav is still required either way. Cue changes crossfade over BGM_CUE_XF
#   <workdir>/sfx.tsv   : (optional) idx <TAB> seg <TAB> audio-file <TAB> bgm(on|off)
#                         A sound heard only during that seg, plus BGM gating. The audio file can be
#                         wav or mp4 (a video contributes its own sound); it can be empty with just
#                         bgm set to off. Times are keyed to the visual's appearance, not sentence boundaries
#   <workdir>/outro.mp4 : (optional) shared outro — joined with a black fade when present
#                         (total length = feature + outro)
#   <workdir>/fonts/    : (optional) subtitle fonts ttf/otf — libass can't read woff2
# Output: <workdir>/reel.mp4 (clean master without subtitles — for platforms that take a separate subtitle file)
#         <workdir>/reel-sub.mp4 (burned-in copy — for platforms with no subtitle-file path, skipped when BURN=0)
#         <workdir>/subs.srt (subtitle file handed to the publish tools as-is), subs.ass (burn-in source)
#         <workdir>/cover.jpg, build-report.txt
#
# Sync principle (v3):
#   Audio is one file per card, same as v2 — the card duration is fixed by frame ceiling and the audio
#   padded to exactly FRAMES*(48000/FPS) samples → cumulative drift 0. Reveals are pure video-side
#   timing (xfade aligned to sentence boundaries) and never touch the audio — even a boundary off by
#   ±0.3s keeps drift at 0.
#   Sentence boundary = silencedetect finds the pauses between sentences (seg count - 1, longest first);
#   when short, fall back to char-count proportion.
#   xfade between cumulative reveal-state PNGs = the frame difference is only the new element, so only
#   the new element fades in, in place.
set -euo pipefail
export LC_ALL=en_US.UTF-8

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # grab before cd (path to reveal-timing.py)
WORKDIR="${1:?usage: build-reel.sh <workdir>}"
cd "$WORKDIR"

# Format preset — the `: "${VAR:=value}"` block written by format-resolve.js.
# It must be read **before** the inline defaults for precedence to hold: caller env → format.env → inline.
# Placed after, the ${VAR:-…} below sets the value first and format.env never wins.
# Without the file this is today's behavior — portrait episodes don't change when this line appears.
[ -f format.env ] && . ./format.env

FPS=${FPS:-30}
SPF=$((48000 / FPS))               # audio samples per frame
PRE=${PRE:-0.40}                   # pre-roll (card entrance margin) — first card, smash cuts, dips
POST=${POST:-0.45}                 # post-roll (last-reveal hang + breath). Was 0.70; the J-cut
                                   # moved the next line onto the previous last frame, so the tail
                                   # only has to hold the last reveal (REVEAL_D 0.35) plus a blink
MIN_DUR=${MIN_DUR:-4.0}            # minimum card display time
MAX_DUR=${MAX_DUR:-13.0}           # warn when exceeded (signal to shorten the script)
RATE_TOL=${RATE_TOL:-0.05}
ATEMPO_MIN=${ATEMPO_MIN:-0.88}; ATEMPO_MAX=${ATEMPO_MAX:-1.18}
# The playback factor speedup.sh will apply after this build (produce §7.5). produce §1 appends the
# channel's factor to .work/format.env, which both scripts source, so the build and the pass agree.
# Sourced above; the inline default matches speedup.sh's for a hand-run build with no format.env.
SPEED=${SPEED:-1.2}
# Validate before deriving. A command substitution that exits non-zero takes the whole assignment
# down under `set -e`, so a guard placed after it never runs — the build would die with no reason.
awk -v f="$SPEED" 'BEGIN{exit !(f >= 0.5 && f <= 3.0)}' \
  || { echo "✗ SPEED $SPEED is outside 0.5~3.0 — the same range speedup.sh accepts" >&2; exit 1; }
# The ship gate measures [3.2, 6.2] chars/s on the **sped-up** subtitles, so on this timeline the
# band is that one divided by SPEED. Dividing only the top inverts it past 1.94; dividing both keeps
# it a band. Leaving it at 6.2 lets a card clear every writing check and then hard-block in §7.5.
RATE_LO=${RATE_LO:-$(awk -v f="$SPEED" 'BEGIN{printf "%.2f", 3.2 / f}')}
RATE_HI=${RATE_HI:-$(awk -v f="$SPEED" 'BEGIN{printf "%.2f", 6.2 / f}')}
BGM_SEP=${BGM_SEP:-10}             # LU the bed sits under the measured speech loudness (see bgm-scoring.md)
BGM_SEP_MIN=${BGM_SEP_MIN:-4}      # below this the build stops — the music is competing with the voice
BGM_LOOP_XF=${BGM_LOOP_XF:-2.0}    # crossfade when a cue is shorter than its span
BGM_CUE_XF=${BGM_CUE_XF:-2.0}      # crossfade between two cues (bgm.tsv)
export BGM_LOOP_XF BGM_CUE_XF
DUCK_RELEASE=${DUCK_RELEASE:-250}
SFX_VOL=${SFX_VOL:-0.85}           # per-segment sfx volume (sfx.tsv)
BGM_GATE_R=${BGM_GATE_R:-0.30}     # ramp around BGM-gated spans — a hard cut sounds chopped
XFADE=${XFADE:-0.6}                # feature↔outro transition length
SCENE_FADE=${SCENE_FADE:-0.30}     # dip half-length — the black/white a card fades through (cards.tsv enter=/exit=).
                                   # 0.6s through the colour, the outro seam's length (XFADE). Was 0.12: four
                                   # frames down, one black, four up — a blink nobody read as a fade (ep209 measured)
SCENE_XF=${SCENE_XF:-0.45}         # cross-dissolve length (enter=dissolve) — the incoming card melts out of the previous card's last frame
SCENE_PUSH=${SCENE_PUSH:-0.32}     # push length (enter=push:<dir>) — the previous card's last frame slides off the incoming one
SCENE_JCUT=${SCENE_JCUT:-0.32}     # J-cut hold — previous last frame stays on while the new line already plays, then the picture cuts. Under the 0.3s silence ceiling of the reference short once POST is the only remaining gap.
SCENE_IRIS=${SCENE_IRIS:-0.45}     # iris length (enter=iris) — a circle opens out of the previous last frame. Same length as a dissolve: the eye has to follow the opening
SCENE_BLUR=${SCENE_BLUR:-0.45}     # blur-dissolve length (enter=blur) — the previous last frame smears sideways and melts. Dissolve's length because it reads as one
SCENE_WHIP=${SCENE_WHIP:-0.24}     # whip length (enter=whip:<dir>) — the shortest join here. A whip that lingers is a push with a blur on it
SCENE_ZOOM=${SCENE_ZOOM:-0.32}     # zoom-through length (enter=zoom) — the previous last frame grows past the camera. Push's length; the move itself carries the speed
WHIP_BLUR=${WHIP_BLUR:-40}         # whip smear radius in px, along the travel axis only (avgblur)
ZOOM_THRU=${ZOOM_THRU:-0.55}       # how far the carried frame grows on a zoom (1.0 → 1.55). Past ~0.8 the frame's own texture reads as a second picture
REVEAL_D=${REVEAL_D:-0.35}         # max reveal fade length (shrinks to fit a shorter pause)
REVEAL_GAP=${REVEAL_GAP:-0.05}     # finish appearing this long before the next sentence starts
REVEAL_LEAD=${REVEAL_LEAD:-0.30}   # fallback lead — used only when no pause was found (char-count proportion)
SIL_DB=${SIL_DB:--37}              # sentence-boundary silence threshold (dB)
SIL_MIN=${SIL_MIN:-0.16}           # sentence-boundary minimum silence length (s)
ZOOM_SPAN=${ZOOM_SPAN:-0.035}      # floor of the still zoom span, and the punch's landing size (3.5%)
ZOOM_SPAN=$(awk -v v="$ZOOM_SPAN" 'BEGIN{printf "%.3f", v}')   # %.3f normalized so span= report-tag compares stay exact
KB_RATE=${KB_RATE:-0.04}           # default still zoom per second when no span= is written — the observe row of
                                   #   the ladder (docs/research/2026-08-26-still-photo-camera-motion: the explain
                                   #   cut ran 4%/s; our old 3.5% per card was ten times slower, and read as a photo)
KB_ZMAX=${KB_ZMAX:-1.075}          # cap on the default's total scale. Text is baked into a still card, so a centre
                                   #   zoom pushes every edge of the text zone outward, and the cap is the tightest of
                                   #   the three. Portrait, zone y 190~1350 · x 176~904, canvas centre 960:
                                   #     bottom  390*z+960 <= 1380 (the burned-in subtitle band, line 1201) -> z <= 1.0769
                                   #     top     -770*z+960 = 132 at 1.075, still under the phone's status bar
                                   #     side    the 640px hero stat ends at x 884, inside the 890 action-bar icons
                                   #   The bottom edge is what binds. Landscape has its zone bottom (y 795) sitting on
                                   #   the worst-case subtitle top, so any z past 1 crosses it — that was already true
                                   #   at the old 3.5% and this cap does not change the shape of it (formats.js has no
                                   #   per-format zoom mirror). A span= written from the storyboard ladder is deliberate
                                   #   and is not capped here.
W=${W:-1080}                       # canvas width — the format decides
H=${H:-1920}                       # canvas height
ZOOM_BASE=${ZOOM_BASE:-1620x2880}  # Ken Burns source resolution (1.5x the canvas)
ZB=${ZOOM_BASE/x/:}                # ffmpeg scale= uses colon notation, so convert once
SUB=${SUB:-1}                      # 1=generate subtitle data (subs.srt·subs.ass), 0=no subtitles
BURN=${BURN:-1}                    # 1=also produce burned-in reel-sub.mp4, 0=clean master only
SUB_FONT=${SUB_FONT:-Pretendard}   # fontconfig fallback when fonts/ has no ttf
OUTRO_ASSET=${OUTRO_ASSET:-outro.mp4}   # outro to join — a different file per format
STRICT_DIM=${STRICT_DIM:-0}        # 1=exit 1 on asset dimension mismatch, 0=one warning line
URL_FMT=${URL_FMT:-}               # format parameter appended to capture URLs (empty for portrait)
SUB_SIZE=${SUB_SIZE:-58}           # ASS Fontsize
SUB_ML=${SUB_ML:-250}              # subtitle left margin
SUB_MR=${SUB_MR:-250}              # subtitle right margin
SUB_MV=${SUB_MV:-380}              # subtitle bottom margin (band y≈1380)
SUB_OUT=${SUB_OUT:-5}              # outline thickness
SUB_SHA=${SUB_SHA:-1.7}            # shadow
SUB_MODE=${SUB_MODE:-sentence}     # sentence | word | phrase — word burns one 어절 at a time, phrase one line of 3~6 어절 (the SRT keeps whole sentences)
SUB_WORD_SIZE=${SUB_WORD_SIZE:-84} # word-mode Fontsize — Pretendard draws a Hangul glyph at ~0.71× this, so 84 ≈ the 61px word the reference short runs
SUB_WORD_MV=${SUB_WORD_MV:-640}    # word-mode bottom margin — the word sits on the 65% line (y≈1248), not the 72% band
SUB_WORD_MIN=${SUB_WORD_MIN:-0.28} # a word cue shorter than this is glued to the next word
SUB_PHRASE_MAX=${SUB_PHRASE_MAX:-12}   # phrase-mode characters per line (spaces dropped) — the reference history short's 3~6 어절 line; 12 Hangul at 92px (~62px advance) plus spaces stays inside the 952px phrase width below
SUB_PHRASE_SIZE=${SUB_PHRASE_SIZE:-92} # phrase-mode Fontsize — Pretendard draws Hangul at ~0.71×, so 92 ≈ the 66px glyph measured on the reference
SUB_PHRASE_MV=${SUB_PHRASE_MV:-680}    # phrase-mode bottom margin — the line's centre sits on the 63% line (y≈1210), above the word-mode 65%
SUB_PHRASE_OUT=${SUB_PHRASE_OUT:-4}    # phrase-mode outline — 5 reads heavy at 92; the reference's edge is thin
SUB_PHRASE_ML=${SUB_PHRASE_ML:-64}     # phrase-mode side margins — the Sub style's 250/250 leaves 580px, which wraps a 12-character 92px line into two (measured with libass)
SUB_PHRASE_MR=${SUB_PHRASE_MR:-64}
case "$SUB_MODE" in
  word)   WSTYLE=Word;   PHRASE_ARG="" ;;
  phrase) WSTYLE=Phrase; PHRASE_ARG="--phrase $SUB_PHRASE_MAX" ;;
  *)      WSTYLE=Sub;    PHRASE_ARG="" ;;
esac
QWEN3_ASR_BIN=${QWEN3_ASR_BIN:-$HOME/.local/bin/mlx-qwen3-asr}   # word mode: forced aligner for real word times (falls back to proportion when absent)
KB_ZOOM_MIN=${KB_ZOOM_MIN:-1.06}   # pan base scale floor (cards.tsv pan= option)
KB_ZOOM_MAX=${KB_ZOOM_MAX:-1.35}   # pan base scale ceiling — travel = W(z-1)
PAN_Z=${PAN_Z:-1.12}               # when pan= gives no scale
KB_EASE=${KB_EASE:-smooth}         # smooth=smoothstep easing on zoom/pan | linear=the pre-easing ramp
PUNCH_D=${PUNCH_D:-0.4}            # zoom=punch rise time (s) — the zoom lands, then holds
DRIFT_Z=${DRIFT_Z:-1.04}           # drift=1 base scale — the travel margin the wobble moves inside
DRIFT_AMP=${DRIFT_AMP:-8}          # drift amplitude in ZOOM_BASE source px (~5.5 output px at 1.5x)
DRIFT_F1=${DRIFT_F1:-0.4}          # drift sine frequencies (Hz) — non-integer ratio so the path
DRIFT_F2=${DRIFT_F2:-1.1}          #   never visibly repeats inside a 13s card

rm -rf work && mkdir -p work
# Delete the old build's subtitles and burned-in copy first — rebuilding with SUB=0 while the
# previous subs.srt survives publishes mistimed subtitles (publish copies on file existence alone)
rm -f subs.srt subs.ass reel-sub.mp4
REPORT=build-report.txt
: > "$REPORT"
WARN=0
# §3.5 runs the forced aligner in the background; if the build dies between §3.5 and §8 the
# aligner would otherwise finish on its own and drop a stale json into the next build's work/.
ALIGN_PID=""
trap '[ -n "${ALIGN_PID:-}" ] && kill "$ALIGN_PID" 2>/dev/null' EXIT
say() { echo "$1"; echo "$1" >> "$REPORT"; }
f2() { awk -v v="$1" 'BEGIN{printf "%.2f", v}'; }
asstime() { awk -v t="$1" 'BEGIN{if(t<0)t=0; h=int(t/3600); m=int((t-h*3600)/60); s=t-h*3600-m*60; printf "%d:%02d:%05.2f", h, m, s}'; }
# SRT is hh:mm:ss,mmm — digits and separator differ from ASS (h:mm:ss.cc), so print both from the same source instead of converting
srttime() { awk -v t="$1" 'BEGIN{if(t<0)t=0; h=int(t/3600); m=int((t-h*3600)/60); s=t-h*3600-m*60; printf "%02d:%02d:%06.3f", h, m, s}' | tr '.' ','; }

[ -f cards.tsv ] || { echo "cards.tsv missing"; exit 1; }
[ -f segs.tsv ] || { echo "segs.tsv missing"; exit 1; }
[ -f bgm.wav ] || { echo "bgm.wav missing"; exit 1; }

say "── make-reels build v3 ($(basename "$WORKDIR"))"

# Total reveal-state count per card — capture-reveals.sh records it while capturing. When present,
# the build also checks "was the last state actually used" (a defect filenames alone can't show).
# Without it only the skipped-state check runs.
RTOTAL=""
for C in cards/reveals.tsv reveals.tsv; do [ -f "$C" ] && { RTOTAL="$C"; break; }; done
[ -n "$RTOTAL" ] || say "· no reveals.tsv — state completeness runs the skipped-state check only (capture with capture-reveals.sh)"

# ── 0.5) Canvas probe + asset dimension precheck
#   Today both accidents blow up in §12, i.e. after the TTS/image/veo budget is spent.
#   Catch them here within 3 seconds. Silent on pass — the gate speaks only on violation.

# Probe: the CSS canvas didn't follow the window. frame.html?probe=1 paints the whole canvas
# #FF00FF, so all four corner pixels must be magenta.
# **Only probe the frame.html this run created** — frame.html is a frozen per-episode copy, so an
# archived one doesn't know the probe parameter and draws scene 0 as usual. Probing unconditionally
# kills an old-episode rebuild before the first ffmpeg.
probe_canvas() {
  local html=$1 png=work/probe.png corner ok=1
  grep -q 'probe' "$html" 2>/dev/null || return 0
  # Pass the window size **explicitly** — capture-frames.sh is a child process and the `${W:-1080}`
  # above isn't exported, so it doesn't carry over. Without it a landscape build captures in a
  # 1080x1920 window and reads the corner at (1919,1079), aiming outside the PNG — a fake failure
  # that exits 1 on a healthy canvas.
  # The format parameter goes along too. The canvas size hangs on the template's .wide class.
  env CAP_W="$W" CAP_H="$H" "$HERE/capture-frames.sh" \
    "file://$PWD/$html?probe=1${URL_FMT:+&format=$URL_FMT}" "$png" 0 >/dev/null 2>&1 || {
    say "✗ canvas probe capture failed — $html"; exit 1; }
  for corner in "0:0" "$((W-1)):0" "0:$((H-1))" "$((W-1)):$((H-1))"; do
    local x=${corner%%:*} y=${corner##*:}
    local hex
    hex=$(ffmpeg -v error -i "$png" -vf "crop=1:1:$x:$y,format=rgb24" -f rawvideo - 2>/dev/null | xxd -p)
    [ "$hex" = "ff00ff" ] || { say "✗ canvas probe: (${x},${y}) is #${hex} — not magenta"; ok=0; }
  done
  [ "$ok" = 1 ] || { say "  the CSS canvas didn't follow the ${W}x${H} window. Check --w/--h in the template's :root."; exit 1; }
}
[ -f frame.html ] && probe_canvas frame.html

# Asset precheck: strictness differs per asset — decided by how the filter graph consumes it.
#   joined asset (outro)     straight into concat → exact match. ffmpeg dies otherwise
#   overlay PNG (after ::)   overlay=0:0          → exact match. Misaligned means silently shifted
#   b-roll/background        scale=increase,crop  → orientation only. Any resolution accepted
# Requiring exact match on b-roll makes healthy episodes warn — 720x1280 b-roll exists in practice.
DIMBAD=0
dim_of() {
  case "$1" in
    *.png|*.PNG) sips -g pixelWidth -g pixelHeight "$1" 2>/dev/null \
      | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{printf "%sx%s", w, h}' ;;
    *) ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
         -of csv=p=0:s=x "$1" 2>/dev/null ;;
  esac
}
assert_exact() {   # <path> <role>
  local got; got=$(dim_of "$1")
  [ -n "$got" ] || { say "⚠ $2 $1: couldn't read dimensions"; DIMBAD=1; return; }
  [ "$got" = "${W}x${H}" ] || {
    say "⚠ $2 $1 is ${got} — must exactly match the ${W}x${H} canvas"; DIMBAD=1; }
}
assert_orient() {  # <path> <role> — orientation only
  local got w h; got=$(dim_of "$1")
  [ -n "$got" ] || { say "⚠ $2 $1: couldn't read dimensions"; DIMBAD=1; return; }
  w=${got%%x*}; h=${got##*x}
  if [ "$W" -gt "$H" ]; then [ "$w" -gt "$h" ] || {
    say "⚠ $2 $1 is ${got} — portrait source on a landscape canvas. Center crop loses most of the frame"; DIMBAD=1; }
  else [ "$w" -lt "$h" ] || {
    say "⚠ $2 $1 is ${got} — landscape source on a portrait canvas. Center crop loses most of the frame"; DIMBAD=1; }
  fi
}

[ -f "$OUTRO_ASSET" ] && assert_exact "$OUTRO_ASSET" "outro"
# segs.tsv column-3 parsing — the **same rules** as the build loop (| split · strip @ prefix · cut after ::).
# Written differently, the set the precheck sees diverges from the set the build reads.
while IFS=$'\t' read -r _ _ VIS _; do
  [ -z "${VIS:-}" ] && continue
  IFS='|' read -ra PARTS <<< "$VIS"
  for PART in "${PARTS[@]}"; do
    [ -z "$PART" ] && continue
    PBASE="$PART"; POVL=""
    case "$PBASE" in *::*) POVL="${PBASE#*::}"; PBASE="${PBASE%%::*}";; esac
    PBASE="${PBASE#@}"
    [ -n "$PBASE" ] && [ -f "$PBASE" ] && assert_orient "$PBASE" "visual"
    [ -n "$POVL" ] && [ -f "$POVL" ] && assert_exact "$POVL" "overlay"
  done
done < segs.tsv
if [ "$DIMBAD" = 1 ]; then
  if [ "$STRICT_DIM" = 1 ]; then
    say "✗ asset dimension mismatch — STRICT_DIM=1, stopping before the first ffmpeg"; exit 1
  fi
  WARN=1
fi
# A still never sits frozen under the voice (owner directive 2026-09-03). A card whose every
# segment visual is an image is a still card, and it needs a camera move: in/out/auto/punch,
# a pan= travel, or hold+drift=1. zoom=none and a bare hold are for footage that already
# moves. Checked here, before the first ffmpeg, with the loop's column-3 parsing. The same
# pass writes stillcards.txt — the card list the KB_RATE default below applies to, so a
# filmed card with no span= keeps the ZOOM_SPAN floor instead of the still ladder's push.
: > stillcards.txt
while IFS=$'\t' read -r _CI _ _ _CZ _CO; do
  [ -z "${_CI:-}" ] && continue
  STILLCARD=1; SEENVIS=0
  while IFS=$'\t' read -r _ _ VIS _; do
    [ -z "${VIS:-}" ] && continue
    IFS='|' read -ra PARTS <<< "$VIS"
    for PART in "${PARTS[@]}"; do
      [ -z "$PART" ] && continue
      PBASE="${PART%%::*}"; PBASE="${PBASE#@}"
      SEENVIS=1
      case "$PBASE" in *.mp4|*.mov|*.m4v|*.webm|*.MP4|*.MOV|*.M4V|*.WEBM) STILLCARD=0 ;; esac
    done
  done < <(awk -F'\t' -v i="$_CI" '$1==i' segs.tsv)
  if [ "$SEENVIS" != 1 ] || [ "$STILLCARD" != 1 ]; then continue; fi
  echo "$_CI" >> stillcards.txt
  case "${_CZ:-auto}" in
    none) ;;
    hold) case ",${_CO:-}," in *,drift=1,*|*,pan=*) continue ;; esac ;;
    *) continue ;;
  esac
  say "✗ card $_CI: a still card with zoom=${_CZ:-auto} — a still never sits frozen under the voice. Use in|out|auto|punch, pan=<dir>, or hold+drift=1 (none and a bare hold are for footage that already moves)"
  exit 1
done < cards.tsv

# Per-segment sfx + BGM gating (optional) — sfx.tsv: idx <TAB> seg <TAB> audio-file <TAB> bgm(on|off)
#   The audio file can be wav or mp4 (a video contributes its own sound). Left empty with just
#   bgm set to off, only the music drops out during that seg.
SFXTSV=""; [ -f sfx.tsv ] && SFXTSV=sfx.tsv
# Chapter input (optional) — chapter-first-card-idx<TAB>ts-label. Absent = chapters.txt isn't created.
CHAPTSV=""; [ -f chapters.tsv ] && CHAPTSV=chapters.tsv
: > work/chapstart.tsv
: > work/sfx.list
: > work/bgmgate.list

N=0
TOTF=0                              # cumulative frames (source of absolute subtitle times — holds because concat is sample-exact)
: > work/subs.body
: > work/subs.srtbody
SRTN=0                              # SRT cue number (from 1, file-wide running count)
: > work/order.txt

# Read via fd 3 — keeps ffmpeg inside the loop from eating stdin (trap inherited from v2)
# Column 5 (opts) is optional — read fills leftover variables with empty, so 4-column files run unchanged.
# A carry (jcut / dissolve / push) opens on the previous card's last frame, so that card has
# to leave one behind. J-cut is the default on every incoming card, so almost every predecessor
# dumps a tail — one extra half-second extract per card, not a re-encode. Skip the dump only
# when the next card opts out (enter=cut) or dips (it fades from a solid, not from the tail).
CARRY_PREV=""; _PV=""
while IFS=$'\t' read -r _CI _ _ _ _CO; do
  [ -z "${_CI:-}" ] && continue
  case "${_CO:-}" in
    *enter=cut*|*enter=0*|*enter=black*|*enter=white*|*enter=1*) ;;
    *) [ -n "$_PV" ] && CARRY_PREV="$CARRY_PREV $_PV " ;;
  esac
  _PV="$_CI"
done < cards.tsv
PREVIDX=""; PREVEXIT=""

while IFS=$'\t' read -r -u 3 IDX SRC TARGET ZDIR OPTS; do
  [ -z "${IDX:-}" ] && continue
  N=$((N+1))

  # ── Card options (column 5) — sync / subs / pan / focus / drift / span / ease / enter / exit.
  #    An unknown key is a failure (silently ignored typos ship a filmed card missing sync 0.4s
  #    out of step, and only eyes would catch it). Two-value options use ":" inside the value
  #    (pan=l2r:1.12, focus=0.6:0.4) — "," is the k=v separator and stays out of values.
  SYNC=0; SUBSF=""; PAN=""; PZ="$PAN_Z"; FX=0.5; FY=0.5; DRIFT=0; SPAN="$ZOOM_SPAN"; EASE="$KB_EASE"; SPANSET=0
  ENTER=""; EXITM=""; PUSH_DIR=""
  case "${ZDIR:-auto}" in in|out|auto|none|punch|hold) : ;;
    *) say "✗ card $IDX: unknown zoom (column 4) — $ZDIR (in|out|auto|none|punch|hold)"; exit 1 ;; esac
  if [ -n "${OPTS:-}" ]; then
    IFS=',' read -ra OARR <<< "$OPTS"
    for KV in "${OARR[@]}"; do
      [ -z "$KV" ] && continue
      case "$KV" in
        sync=1) SYNC=1 ;;
        sync=0) SYNC=0 ;;
        subs=*) SUBSF="${KV#subs=}"; [ -f "$SUBSF" ] || { say "✗ card $IDX: subs file missing — $SUBSF"; exit 1; } ;;
        pan=*)  PAN="${KV#pan=}"; case "$PAN" in *:*) PZ="${PAN#*:}"; PAN="${PAN%%:*}";; esac
                case "$PAN" in l2r|r2l|u2d|d2u|tl2br|br2tl|tr2bl|bl2tr) : ;; *) say "✗ card $IDX: unknown pan direction — $PAN (l2r|r2l|u2d|d2u|tl2br|br2tl|tr2bl|bl2tr)"; exit 1;; esac
                PZ=$(awk -v z="$PZ" -v lo="$KB_ZOOM_MIN" -v hi="$KB_ZOOM_MAX" 'BEGIN{if(z<lo)z=lo; if(z>hi)z=hi; printf "%.3f", z}') ;;
        focus=*:*) FPT="${KV#focus=}"
                FX=$(awk -v v="${FPT%%:*}" 'BEGIN{if(v==""||v!=v+0){print "bad"; exit} if(v<0)v=0; if(v>1)v=1; printf "%.3f", v}')
                FY=$(awk -v v="${FPT#*:}"  'BEGIN{if(v==""||v!=v+0){print "bad"; exit} if(v<0)v=0; if(v>1)v=1; printf "%.3f", v}')
                { [ "$FX" = "bad" ] || [ "$FY" = "bad" ]; } && { say "✗ card $IDX: focus wants numbers 0..1 — $KV"; exit 1; } ;;
        focus=*) say "✗ card $IDX: focus needs fx:fy — $KV"; exit 1 ;;
        drift=1) DRIFT=1 ;;
        drift=0) DRIFT=0 ;;
        span=*) SPAN=$(awk -v v="${KV#span=}" 'BEGIN{if(v==""||v!=v+0){print "bad"; exit} if(v<0)v=0; if(v>1.5)v=1.5; printf "%.3f", v}')
                [ "$SPAN" = "bad" ] && { say "✗ card $IDX: span wants a number 0..1.5 — $KV"; exit 1; }
                SPANSET=1 ;;
        ease=*) EASE="${KV#ease=}"
                case "$EASE" in smooth|linear|in) : ;; *) say "✗ card $IDX: unknown ease — $EASE (smooth|linear|in)"; exit 1;; esac ;;
        # Scene-boundary transition — every mode is drawn **inside this card's own encode**, so the
        # concat stays stream-copy exact (see the §7.4 note). A dip keeps the card's frame count;
        # every carry drops the silent pre-roll from this card's length (§4.5).
        # `enter=` is the join in front of this card, `exit=` the one behind it. A dip needs both
        # halves written (exit on the card before, enter on this one); jcut, dissolve and push
        # need only `enter=` — they take the previous card's last frame as their material.
        enter=1|enter=black)     ENTER=black ;;
        enter=white)             ENTER=white ;;
        enter=dissolve)          ENTER=dissolve ;;
        enter=jcut)              ENTER=jcut ;;
        enter=iris)              ENTER=iris ;;
        enter=blur)              ENTER=blur ;;
        enter=zoom)              ENTER=zoom ;;
        enter=push:*)            ENTER=push; PUSH_DIR="${KV#enter=push:}"
                case "$PUSH_DIR" in l2r|r2l|u2d|d2u) : ;; *) say "✗ card $IDX: unknown push direction — $PUSH_DIR (l2r|r2l|u2d|d2u)"; exit 1;; esac ;;
        enter=push)              say "✗ card $IDX: push needs a direction — enter=push:l2r|r2l|u2d|d2u"; exit 1 ;;
        enter=whip:*)            ENTER=whip; PUSH_DIR="${KV#enter=whip:}"
                case "$PUSH_DIR" in l2r|r2l|u2d|d2u) : ;; *) say "✗ card $IDX: unknown whip direction — $PUSH_DIR (l2r|r2l|u2d|d2u)"; exit 1;; esac ;;
        enter=whip)              say "✗ card $IDX: whip needs a direction — enter=whip:l2r|r2l|u2d|d2u"; exit 1 ;;
        enter=0|enter=cut)       ENTER=cut ;;
        exit=1|exit=black)       EXITM=black ;;
        exit=white)              EXITM=white ;;
        exit=0|exit=cut)         EXITM="" ;;
        enter=*|exit=*) say "✗ card $IDX: unknown transition — $KV (enter: jcut|cut|black|white|dissolve|iris|blur|zoom|push:<dir>|whip:<dir> · exit: black|white|cut)"; exit 1 ;;
        *) say "✗ card $IDX: unknown cards.tsv column-5 option — $KV"; exit 1 ;;
      esac
    done
  fi
  # Past the ZOOM_BASE headroom the zoompan window upscales the source — visible blur. Checked
  # after the option loop so pan=/drift= anywhere in the k=v list counts into the real base zoom
  # (pan base PZ, drift base DRIFT_Z, else 1 — the same bases the Ken Burns section uses below).
  # hold/none never zoom, and a pan card zooms only under column-4 in/out (auto and punch
  # keep a fixed scale on a pan) — span is unused there.
  if [ "$SPANSET" -eq 1 ] && [ "${ZDIR:-auto}" != "hold" ] && [ "${ZDIR:-auto}" != "none" ] \
     && ! { [ -n "$PAN" ] && [ "${ZDIR:-auto}" != "in" ] && [ "${ZDIR:-auto}" != "out" ]; }; then
    if [ -n "$PAN" ]; then BASEZ="$PZ"; elif [ "$DRIFT" -eq 1 ]; then BASEZ="$DRIFT_Z"; else BASEZ=1; fi
    awk -v s="$SPAN" -v b="$BASEZ" -v zw="${ZOOM_BASE%x*}" -v w="$W" 'BEGIN{exit !(b+s > zw/w)}' \
      && { say "⚠ card $IDX: base $BASEZ + span=$SPAN zooms past ZOOM_BASE/canvas (${ZOOM_BASE%x*}/$W) — raise ZOOM_BASE and feed a higher-res source"; WARN=1; }
  fi
  # A filmed card (sync) gets no margins — with pre-roll the picture runs from 0s while the sound alone lags 0.4s.
  if [ "$SYNC" -eq 1 ]; then CPRE=0; CPOST=0; CMIN=0; else CPRE=$PRE; CPOST=$POST; CMIN=$MIN_DUR; fi

  # TOTF doesn't include this card yet, so it is exactly this card's start. Chapter marks and
  # step 9.5's music cues both key off this one number.
  printf '%s\t%s\n' "$IDX" "$(awk -v f="$TOTF" -v fps="$FPS" 'BEGIN{printf "%.4f", f/fps}')" >> work/cardstart.tsv
  if [ -n "$CHAPTSV" ]; then
    CHTS=$(awk -F'\t' -v i="$IDX" '$1==i{print $2; exit}' "$CHAPTSV")
    [ -n "$CHTS" ] && printf '%s\t%s\n' "$TOTF" "$CHTS" >> work/chapstart.tsv
  fi

  # ── 0) Load the card's segments (seg order guaranteed)
  awk -F'\t' -v i="$IDX" '$1==i' segs.tsv | sort -t"$(printf '\t')" -k2,2n > "work/seg$IDX.tsv"
  VARR=(); TARR=(); SARR=(); CARR=(); CSV=""
  while IFS=$'\t' read -r -u 4 _ _SEG SVIS STTS SSUB; do
    [ -z "${SVIS:-}" ] && continue
    VARR+=("$SVIS"); TARR+=("$STTS"); SARR+=("$SSUB")
    SC=$(printf '%s' "$STTS" | sed -E 's/[[:space:][:punct:]]//g' | wc -m | tr -d ' ')
    CARR+=("$SC"); CSV="${CSV}${CSV:+,}${SC}"
  done 4< "work/seg$IDX.tsv"
  M=${#VARR[@]}
  [ "$M" -ge 1 ] || { say "✗ card $IDX: no segments in segs.tsv"; exit 1; }
  TEXT=""; for t in "${TARR[@]}"; do TEXT="$TEXT$t"; done

  # ── Speechless card (MUTE) ──────────────────────────────────────────
  # Some cards have zero characters. The video cover sits there — no narration, the clip's own
  # sound carries it (same behavior as produce absolute rule 9), and cards.tsv brings a silent
  # wav of that length as the audio. With no speech, **speech rate isn't even defined.**
  # This card bypasses the audio machine entirely, because three spots break on silence (measured):
  #   ① silenceremove deletes all the silence, duration becomes N/A, and the next ffmpeg aborts
  #   ② loudnorm amplifies the silence and invents noise that wasn't there
  #   ③ speech rate t/r dies on division by zero (awk runtime error + set -e)
  # So trim, normalization and tempo correction are all skipped and the given audio is only
  # resampled to 48k. This card's duration is the **audio length as-is**, and that length comes
  # from the silent wav the cards.tsv producer (§6) made to match the clip.
  C=$(printf '%s' "$TEXT" | sed -E 's/[[:space:][:punct:]]//g' | wc -m | tr -d ' ')
  MUTE=0; [ "$C" -eq 0 ] && MUTE=1

  # ── 1) Audio: format detection → trim → loudnorm  (same as v2 · speechless resamples only)
  #   A sync card is the third kind — **normalization only**, no trim, no tempo correction. Cutting
  #   the ends desyncs the picture by that much, and loudnorm doesn't move time (click at 1.000s →
  #   1.000s, measured). If the clip is silent, loudnorm would pull the noise floor up to -16,
  #   so then only resample.
  if head -c 4 "$SRC" | LC_ALL=C grep -q RIFF; then INARGS=(-i "$SRC")
  else INARGS=(-f s16le -ar 24000 -ac 1 -i "$SRC"); fi
  if [ "$SYNC" -eq 1 ]; then
    MEANV=$(ffmpeg -hide_banner "${INARGS[@]}" -af volumedetect -f null - 2>&1 | sed -n 's/.*mean_volume: \([-0-9.]*\) dB/\1/p')
    if [ -n "$MEANV" ] && awk -v v="$MEANV" 'BEGIN{exit !(v > -50)}'; then
      ffmpeg -y -v error "${INARGS[@]}" -af "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000" -ac 1 -ar 48000 "work/t$IDX.wav"
      SYNCNOTE="live voice normalized (loudnorm)"
    else
      ffmpeg -y -v error "${INARGS[@]}" -af "aresample=48000" -ac 1 -ar 48000 "work/t$IDX.wav"
      SYNCNOTE="silent clip — normalization skipped"
    fi
    MUTE=1   # bypasses the audio machine below (rate/warnings/atempo) entirely — sound and picture are one body
  elif [ "$MUTE" -eq 1 ]; then
    ffmpeg -y -v error "${INARGS[@]}" -af "aresample=48000" -ac 1 -ar 48000 "work/t$IDX.wav"
  else
    ffmpeg -y -v error "${INARGS[@]}" -af "
      silenceremove=start_periods=1:start_silence=0.10:start_threshold=-50dB:detection=peak,
      areverse,silenceremove=start_periods=1:start_silence=0.20:start_threshold=-55dB:detection=peak,areverse,
      loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000" -ac 1 -ar 48000 "work/t$IDX.wav"
  fi

  L0=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "work/t$IDX.wav")
  R0=$(awk -v c="$C" -v l="$L0" 'BEGIN{printf "%.2f", (c>0 && l>0)? c/l : 0}')
  if [ "$SYNC" -eq 1 ]; then say "· card $IDX filmed sync — ${SYNCNOTE}, no trim or tempo correction (audio ${L0}s is the card duration)"
  elif [ "$MUTE" -eq 1 ]; then say "· card $IDX speechless — trim/normalization/tempo correction skipped (audio kept as-is, ${L0}s)"; fi

  # ── 2) TTS regeneration advisory gate (same as v2)
  if [ "$MUTE" -eq 0 ] && awk -v r="$R0" -v lo="$RATE_LO" -v hi="$RATE_HI" 'BEGIN{exit !(r<lo || r>hi)}'; then
    say "⚠ REGEN recommended: card $IDX speech rate ${R0} chars/s — outside the allowed [${RATE_LO},${RATE_HI}]. Regenerate once with the same registry, then rebuild."
    WARN=1
  fi
  TAILV=$(ffmpeg -hide_banner -i "work/t$IDX.wav" -af "atrim=start=$(awk -v l="$L0" 'BEGIN{printf "%.3f",(l>0.2)?l-0.12:0}'),volumedetect" -f null - 2>&1 | sed -n 's/.*mean_volume: \([-0-9.]*\) dB/\1/p')
  if [ "$MUTE" -eq 0 ] && [ -n "$TAILV" ] && awk -v v="$TAILV" 'BEGIN{exit !(v > -20)}'; then
    say "⚠ REGEN recommended: card $IDX last 0.12s at ${TAILV}dB — the sentence may have been generated clipped. Listen and check."
    WARN=1
  fi

  # ── 3) Speech-rate normalization atempo (same as v2)
  if [ "$MUTE" -eq 1 ]; then F=1.0000
  else F=$(awk -v t="$TARGET" -v r="$R0" -v tol="$RATE_TOL" -v mn="$ATEMPO_MIN" -v mx="$ATEMPO_MAX" \
      'BEGIN{f=t/r; if (f>1-tol && f<1+tol) f=1; if (f<mn) f=mn; if (f>mx) f=mx; printf "%.4f", f}'); fi
  if [ "$F" = "1.0000" ]; then cp "work/t$IDX.wav" "work/s$IDX.wav"
  else ffmpeg -y -v error -i "work/t$IDX.wav" -af "atempo=$F" "work/s$IDX.wav"; fi
  L=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "work/s$IDX.wav")
  R=$(awk -v c="$C" -v l="$L" 'BEGIN{printf "%.2f", (c>0)? c/l : 0}')

  # ── 3.5) Forced aligner, started early. Word and phrase cues (§8) want the aligner's token
  #   times, and it loads its model on every call — about 3 s a card, 41 s across ep209's 14 cards
  #   (measured 2026-09-04), the loop's largest phase after the video encodes. Nothing between
  #   here and §8 reads its output, so it runs in the background under this card's encode (§7)
  #   and §8 waits for it — the 14-card build went from 291–297 s to 267–276 s. fd 3 is the
  #   cards.tsv reader — closed for the child so the loop's input never sits in a process that
  #   outlives an iteration.
  ALIGN_PID=""
  if [ "$SUB" = "1" ] && { [ "$SUB_MODE" = "word" ] || [ "$SUB_MODE" = "phrase" ]; } && [ "$MUTE" -eq 0 ] && [ -x "$QWEN3_ASR_BIN" ]; then
    mkdir -p work/align
    "$QWEN3_ASR_BIN" --timestamps -f json --language Korean -o work/align "work/s$IDX.wav" > "work/align/s$IDX.log" 2>&1 3<&- &
    ALIGN_PID=$!
  fi

  # ── 4) Sentence-boundary detection (when there are 2+ segments) — M-1 silences (longest first),
  #        falling back to a char-count proportional split when there aren't enough
  BLIST=""; BMETHOD="single"
  if [ "$M" -gt 1 ]; then
    ffmpeg -hide_banner -nostats -i "work/s$IDX.wav" -af "silencedetect=noise=${SIL_DB}dB:d=$SIL_MIN" -f null - 2>&1 |
      awk '/silence_start:/{s=$NF}
           /silence_end:/{e=""; d=""; for(i=1;i<=NF;i++){if($i=="silence_end:")e=$(i+1); if($i=="silence_duration:")d=$(i+1)} if(e!="")print s, e, d}' \
      > "work/silraw$IDX.txt"
    awk -v L="$L" '$1>0.05 && $2<L-0.05' "work/silraw$IDX.txt" > "work/silin$IDX.txt"
    NSIL=$(wc -l < "work/silin$IDX.txt" | tr -d ' ')
    if [ "$NSIL" -ge $((M-1)) ]; then
      # boundary = end of the silence (start of the next sentence) — a reveal finishes appearing just before it
      BLIST=$(sort -k3,3gr "work/silin$IDX.txt" | head -n $((M-1)) | sort -k1,1g | awk '{printf "%s ", $2}')
      BMETHOD="detected $((M-1))/$NSIL"
    else
      BLIST=$(awk -v L="$L" -v c="$CSV" 'BEGIN{n=split(c,a,","); tot=0; for(i=1;i<=n;i++)tot+=a[i];
              cum=0; for(i=1;i<n;i++){cum+=a[i]; printf "%.3f ", L*cum/tot}}')
      BMETHOD="proportional fallback(silence $NSIL/$((M-1)))"
      say "⚠ card $IDX sentence-boundary detection failed (silence $NSIL/$((M-1))) — falling back to char-count proportions. Break the script's sentences apart clearly with periods."
      WARN=1
    fi
    # Over-short segment warning (a window under 0.9s makes reveals look overlapped)
    awk -v L="$L" 'BEGIN{p=0} {for(i=1;i<=NF;i++){if($i-p<0.9) short=1; p=$i}} END{if(L-p<0.9) short=1; exit !short}' <<< "$BLIST" \
      && { say "⚠ card $IDX segment window under 0.9s — rebalance the sentences."; WARN=1; }
  fi

  # ── 4.5) The join — every carry drops the silent pre-roll (sound leads picture)
  #   Every spoken card after the first takes its enter= from the board's `transition`
  #   (produce §6). An empty enter= is the legacy 4-column form: it falls back to a J-cut
  #   and says so, because the fallback is the one join nobody chose.
  #   A carry (jcut · dissolve · iris · blur · zoom · push · whip) opens on the previous last
  #   frame, and the next line starts at this card's first frame **under** that frame — the
  #   split edit on every carry, so the picture never changes in silence. CPRE is 0 there.
  #   First card, filmed sync, speechless cards, dips and an explicit enter=cut (the smash)
  #   keep the silent pre-roll: a dip's beat of nothing is the point.
  #   Reveal timing (§6) takes the same CPRE the audio is padded with. It used to take the
  #   J-cut hold (0.32s) instead, which put every reveal on a J-cut card 0.32s behind the
  #   speech — measured on the 4-card fixture: the reveal at 1.60s for a sentence that starts
  #   at 1.70s, where the dissolve card next to it landed 0.07s before its sentence.
  if [ -z "$ENTER" ] && [ -n "$PREVIDX" ] && [ "$SYNC" -eq 0 ] && [ "$MUTE" -eq 0 ]; then
    ENTER=jcut
    say "⚠ card $IDX: no enter= — J-cut fallback. Every card after the first takes the board's transition (produce §6)."; WARN=1
  fi
  case "$ENTER" in jcut|dissolve|iris|blur|zoom|push|whip) CPRE=0 ;; esac

  # ── 5) Fix the card duration + assemble sample-accurate audio (same as v2 — the source of zero drift)
  D0=$(awk -v p="$CPRE" -v l="$L" -v q="$CPOST" 'BEGIN{printf "%.6f", p+l+q}')
  D1=$(awk -v d="$D0" -v m="$CMIN" 'BEGIN{printf "%.6f", (d>m)?d:m}')
  FRAMES=$(awk -v d="$D1" -v f="$FPS" 'BEGIN{n=d*f; printf "%d", (n==int(n))?n:int(n)+1}')
  D=$(awk -v n="$FRAMES" -v f="$FPS" 'BEGIN{printf "%.6f", n/f}')
  SAMPLES=$((FRAMES * SPF))
  if awk -v d="$D" -v m="$MAX_DUR" 'BEGIN{exit !(d>m)}'; then
    say "⚠ card $IDX duration ${D}s > ${MAX_DUR}s — shorten the script."
    WARN=1
  fi
  PRE_MS=$(awk -v p="$CPRE" 'BEGIN{printf "%d", p*1000}')
  ffmpeg -y -v error -i "work/s$IDX.wav" \
    -af "adelay=${PRE_MS}:all=1,apad=whole_len=$SAMPLES,atrim=end_sample=$SAMPLES" \
    -ac 1 -ar 48000 "work/n$IDX.wav"

  # ── 6) Flatten reveals + compute transition times
  #   Don't tie the state count to the sentence count — listing segs.tsv visuals with '|' makes sub-reveals.
  #   Using only a bundle's last state dumps 2 bullets + the source into one transition (measured defect in the first v4).
  #   reveal-timing.py works the times back from the narration's pauses — a fixed lead can't match variable pauses.
  BARR=(); for b in $BLIST; do BARR+=("$b"); done
  FVIS=(); SUBS=""
  for ((j=0; j<M; j++)); do
    IFS='|' read -r -a SUBV <<< "${VARR[$j]}"
    SUBS="${SUBS}${SUBS:+,}${#SUBV[@]}"
    for v in "${SUBV[@]}"; do FVIS+=("$v"); done
  done
  MV=${#FVIS[@]}
  FOFF=(0); FDUR=("$REVEAL_D")      # [0] is the base state — no transition
  if [ "$MV" -gt 1 ]; then
    FB=""; case "$BMETHOD" in 'proportional fallback'*) FB="--fallback";; esac   # an empty array dies under set -u in bash 3.2
    TIMING=$(python3 "$HERE/reveal-timing.py" --pre "$CPRE" --speech "$L" --dur "$D" \
      --fade "$REVEAL_D" --gap "$REVEAL_GAP" --lead "$REVEAL_LEAD" \
      --silences "work/silin$IDX.txt" --bounds "$BLIST" --subs "$SUBS" \
      $FB --report 2>"work/rt$IDX.txt")
    while IFS=$'\t' read -r o d _w; do [ -n "$o" ] && { FOFF+=("$o"); FDUR+=("$d"); }; done <<< "$TIMING"
    [ "${#FOFF[@]}" -eq "$MV" ] || { say "✗ card $IDX transition-time computation failed (${#FOFF[@]}/$MV)"; exit 1; }
    GMIN=$(paste <(printf '%s\n' "${FOFF[@]:1}") <(printf '%s\n' "${FDUR[@]:1}") \
           | awk -v d="$D" '{if(NR>1){g=$1-pe; if(m==""||g<m)m=g} pe=$1+$2} END{g=d-pe; if(m==""||g<m)m=g; printf "%.2f", m}')
    awk -v g="$GMIN" 'BEGIN{exit !(g < 0.40)}' \
      && { say "⚠ card $IDX min gap between reveals ${GMIN}s (<0.40s) — the appearances look overlapped. Lengthen the sentence or drop bullets."; WARN=1; }
  fi
  # State completeness check — reads the k out of the capture convention filename …r<k>.png
  # (pure b-roll segments naturally drop out).
  #   ① skipped → several elements appear at once in that transition
  #   ② last state never reached → the last element never shows up in the video
  #   ② can't be seen from filenames alone. It needs cards/reveals.tsv (idx<TAB>total-states,
  #   which capture-reveals.sh writes while capturing) — without it only ① runs and the report says so.
  RSEQ=$(printf '%s\n' "${FVIS[@]}" | sed 's/.*:://' | sed -nE 's/.*r([0-9]+)\.png$/\1/p' | sort -n -u)
  if [ -n "$RSEQ" ]; then
    MISS=$(awk 'NR==1{p=$1; next} {if($1>p+1) for(k=p+1;k<$1;k++) printf "r%d ", k; p=$1}' <<< "$RSEQ")
    [ -n "$MISS" ] && { say "⚠ card $IDX missing reveal state: $MISS — several elements appear at once in one transition. Split that segment's visual with '|' into sub-reveals."; WARN=1; }
    if [ -n "$RTOTAL" ]; then
      RN=$(awk -F'\t' -v i="$IDX" '$1==i{print $2}' "$RTOTAL" | head -1)
      RMAX=$(tail -1 <<< "$RSEQ")
      if [ -n "$RN" ] && [ "$RMAX" -lt $((RN - 1)) ]; then
        say "⚠ card $IDX last reveal state unused: only up to r$RMAX is used (${RN} states total) — the element in r$((RN-1)) (last bullet/source) never shows up in the video."
        WARN=1
      fi
    fi
  fi

  # ── 7) Video: state chain (xfade) → Ken Burns (zoompan) — b-roll (.mp4) joins in as a fullscreen window
  #        "video::overlay.png" lays the video down and composites the alpha PNG on top. A video at j>0
  #        starts -ss earlier by the xfade time (modulo the loop length) so playback looks continuous
  #        across the transition.
  #        A leading **`@` on the path means play once** — no shifting, no looping; it plays from the
  #        clip's first frame and freezes on the last. For clips where **start to finish is one motion**,
  #        like a typing card.
  #        (Leave the default behavior and it breaks twice: j>0 starts mid-way, after the text is fully
  #         typed, because of the modulo -ss; and even j=0 loops and retypes from the start when the
  #         segment window is longer than the clip.)
  INS=(); FILT=""; NIN=0
  j=0
  for VIS in "${FVIS[@]}"; do
    if [ "$j" -eq 0 ]; then
      if [ "$MV" -gt 1 ]; then T=$(awk -v o="${FOFF[1]}" 'BEGIN{printf "%.3f", o+1.0}')
      else T=$(awk -v d="$D" 'BEGIN{printf "%.3f", d+0.5}'); fi
    else
      T=$(awk -v d="$D" -v o="${FOFF[$j]}" 'BEGIN{printf "%.3f", d-o+1.0}')
    fi
    BASE="$VIS"; OVL=""
    case "$VIS" in *::*) BASE="${VIS%%::*}"; OVL="${VIS#*::}";; esac
    ONESHOT=0; case "$BASE" in @*) ONESHOT=1; BASE="${BASE#@}";; esac
    BI=$NIN; HOLD=""
    case "$BASE" in
      *.mp4|*.mov|*.m4v|*.webm|*.MP4|*.MOV|*.M4V|*.WEBM)
        if [ "$ONESHOT" = "1" ]; then
          # If the clip is shorter than the segment window, clone the last frame to fill — a freeze, not a loop
          INS+=(-i "$BASE")
          HOLD="tpad=stop_mode=clone:stop=-1,trim=duration=$T,setpts=PTS-STARTPTS,"
        else
          SS=0
          if [ "$j" -gt 0 ]; then
            BDUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$BASE")
            SS=$(awk -v o="${FOFF[$j]}" -v d="$BDUR" 'BEGIN{if(d<=0){print 0; exit} printf "%.3f", o-int(o/d)*d}')
          fi
          INS+=(-ss "$SS" -stream_loop -1 -t "$T" -i "$BASE")
        fi ;;
      *) INS+=(-loop 1 -framerate "$FPS" -t "$T" -i "$BASE") ;;
    esac
    NIN=$((NIN+1))
    FILT+="[$BI:v]${HOLD}scale=$W:$H:force_original_aspect_ratio=increase:flags=lanczos,crop=$W:$H,fps=$FPS,settb=AVTB,setsar=1,format=yuv420p[b$j];"
    if [ -n "$OVL" ]; then
      OI=$NIN
      INS+=(-loop 1 -framerate "$FPS" -t "$T" -i "$OVL")
      NIN=$((NIN+1))
      FILT+="[$OI:v]format=rgba,settb=AVTB[o$j];[b$j][o$j]overlay=x=0:y=0:eof_action=repeat,format=yuv420p[i$j];"
    else
      FILT+="[b$j]null[i$j];"
    fi
    j=$((j+1))
  done
  CUR="[i0]"
  for ((j=1; j<MV; j++)); do
    FILT+="${CUR}[i$j]xfade=transition=fade:duration=${FDUR[$j]}:offset=${FOFF[$j]}[x$j];"
    CUR="[x$j]"
  done
  # Ken Burns (in=push in / out=pull out); auto alternates on the card's odd/even index — the rhythm
  #   changes cut to cut.
  #   z must be written as a function of the output frame number on. The common accumulating idiom
  #   min(zoom+step,top) does not work at d=1 — zoompan restarts the sequence on every input frame,
  #   resetting zoom to its initial value, so step never accumulates
  #   (measured on ffmpeg 7.1.1: an element is 360px wide in both the first and last frame of a 3s
  #   clip = zero zoom).
  #   Every motion runs on the eased progress E (smoothstep) — a constant-speed ramp starts and stops
  #   like a machine, and the ease is what reads as an operated camera. KB_EASE=linear restores the ramp.
  #   The window position comes from the focus point (default 0.5:0.5 = centre — identical to the old
  #   centre expressions); drift adds a two-sine wobble on top and a DRIFT_Z base scale for margin.
  ZLAST=$(( FRAMES > 1 ? FRAMES - 1 : 1 ))
  ZD="${ZDIR:-auto}"
  if [ "$ZD" = "auto" ]; then if [ $((N % 2)) -eq 1 ]; then ZD=in; else ZD=out; fi; fi
  # Default still move (no span= written): KB_RATE × card seconds, capped so the total scale
  # stays under KB_ZMAX on top of this card's base (pan scale · drift 1.04 · else 1) — a pan
  # card keeps the 3.5% floor on its zoom drift, the travel is its motion. A written span= is
  # the storyboard ladder's decision and passes through untouched. Only still cards take this
  # ladder (stillcards.txt, written by the pre-flight pass): a filmed clip already moves, and
  # a 10% push on top of it — the overlay's baked title included — shakes the frame.
  if [ "$SPANSET" -eq 0 ] && grep -qxF "$IDX" stillcards.txt; then
    if [ -n "$PAN" ]; then KBB="$PZ"; elif [ "$DRIFT" -eq 1 ]; then KBB="$DRIFT_Z"; else KBB=1; fi
    SPAN=$(awk -v r="$KB_RATE" -v d="$D" -v zmax="$KB_ZMAX" -v b="$KBB" -v floor="$ZOOM_SPAN" \
      'BEGIN{s=r*d; c=zmax-b; if(s>c)s=c; if(s<floor)s=floor; printf "%.3f", s}')
  fi
  PEXPR="(on/$ZLAST)"
  # Per-card EASE (ease= option, default KB_EASE). "in" accelerates to the cut point — quadratic
  # progress, so the rate climbs linearly and peaks exactly where the cut lands (the action/CTA
  # register measured in docs/research/2026-08-26-still-photo-camera-motion).
  case "$EASE" in linear) E="$PEXPR" ;; in) E="($PEXPR*$PEXPR)" ;; *) E="($PEXPR*$PEXPR*(3-2*$PEXPR))" ;; esac
  KTAG=""
  # A pan card reports its span only when the zoom drift actually uses it — pan + in/out runs
  # PZE=($PZ+$SPAN*$E); pan + auto is a fixed scale and the number would be noise.
  [ "$SPAN" != "$ZOOM_SPAN" ] && [ "$ZD" != hold ] && [ "$ZD" != none ] \
    && { [ -z "$PAN" ] || [ "$ZDIR" = in ] || [ "$ZDIR" = out ]; } && KTAG="+span=$SPAN"
  [ "$EASE" != "$KB_EASE" ] && KTAG="$KTAG+ease-$EASE"
  if [ "$DRIFT" -eq 1 ]; then
    DXE="+$DRIFT_AMP*(0.6*sin(2*PI*$DRIFT_F1*on/$FPS)+0.4*sin(2*PI*$DRIFT_F2*on/$FPS+1.7))"
    DYE="+0.7*$DRIFT_AMP*(0.6*sin(2*PI*$DRIFT_F1*on/$FPS+0.9)+0.4*sin(2*PI*$DRIFT_F2*on/$FPS+2.6))"
    ZBASE="$DRIFT_Z"; DTAG="+drift"
  else DXE=""; DYE=""; ZBASE=1; DTAG=""; fi
  FTAG=""; case "$FX:$FY" in 0.5:0.5|0.500:0.500) : ;; *) FTAG="@$FX:$FY";; esac
  if [ "$ZD" = "none" ]; then
    # No Ken Burns — a card whose picture already moves, like filmed footage. It doesn't scale the source (scale=ZB) either.
    FILT+="${CUR}format=yuv420p[vkb];"
  elif [ -n "$PAN" ]; then
    # Pan — the window travels; the cross axis stays centred (the pan owns the path, focus= is ignored).
    # Travel = W(z-1) (horizontal) / H(z-1) (vertical) — ~130px at z=1.12 on either canvas orientation.
    case "$PAN" in
      l2r)   PX="(iw-iw/zoom)*$E";     PY="ih/2-(ih/zoom/2)" ;;
      r2l)   PX="(iw-iw/zoom)*(1-$E)"; PY="ih/2-(ih/zoom/2)" ;;
      u2d)   PX="iw/2-(iw/zoom/2)";    PY="(ih-ih/zoom)*$E" ;;
      d2u)   PX="iw/2-(iw/zoom/2)";    PY="(ih-ih/zoom)*(1-$E)" ;;
      tl2br) PX="(iw-iw/zoom)*$E";     PY="(ih-ih/zoom)*$E" ;;
      br2tl) PX="(iw-iw/zoom)*(1-$E)"; PY="(ih-ih/zoom)*(1-$E)" ;;
      tr2bl) PX="(iw-iw/zoom)*(1-$E)"; PY="(ih-ih/zoom)*$E" ;;
      bl2tr) PX="(iw-iw/zoom)*$E";     PY="(ih-ih/zoom)*(1-$E)" ;;
    esac
    # Column 4 in/out layers a ZOOM_SPAN zoom drift over the travel (Ken Burns proper); auto = fixed scale
    case "$ZDIR" in
      in)  PZE="($PZ+$SPAN*$E)";     ZD="pan:$PAN@$PZ+in" ;;
      out) PZE="($PZ+$SPAN*(1-$E))"; ZD="pan:$PAN@$PZ+out" ;;
      *)   PZE="$PZ";                     ZD="pan:$PAN@$PZ" ;;
    esac
    ZD="$ZD$DTAG$KTAG"
    FILT+="${CUR}scale=$ZB:flags=lanczos,zoompan=z='$PZE':x='$PX$DXE':y='$PY$DYE':d=1:s=${W}x${H}:fps=$FPS,format=yuv420p[vkb];"
  else
    case "$ZD" in
      punch) # ZOOM_SPAN (3.5%) lands in the first PUNCH_D seconds (ease-out), then the window keeps
             # creeping (smoothstep — velocity 0 at the join, 0 at the cut) up to the card's span by
             # the last frame. The hit is the hook's first-frame movement; the creep is what keeps
             # the cover from sitting frozen behind the title for the next four seconds. A span at
             # or under the landing size is the old punch-and-hold.
             PF=$(awk -v d="$PUNCH_D" -v fps="$FPS" 'BEGIN{f=int(d*fps+0.5); if(f<1)f=1; print f}')
             PP="(min(on/$PF,1))"
             PLAND=$(awk -v s="$SPAN" -v l="$ZOOM_SPAN" 'BEGIN{printf "%.3f", (s<l)?s:l}')
             PCREEP=$(awk -v s="$SPAN" -v l="$PLAND" 'BEGIN{c=s-l; if(c<0)c=0; printf "%.3f", c}')
             PT=$(( ZLAST > PF ? ZLAST - PF : 1 ))
             PC="(max(0,(on-$PF)/$PT))"
             ZEXPR="($ZBASE+$PLAND*(1-(1-$PP)*(1-$PP))+$PCREEP*$PC*$PC*(3-2*$PC))" ;;
      hold)  ZEXPR="$ZBASE" ;;
      out)   ZEXPR="($ZBASE+$SPAN*(1-$E))" ;;
      *)     ZEXPR="($ZBASE+$SPAN*$E)" ;;
    esac
    ZD="$ZD$FTAG$DTAG$KTAG"
    FILT+="${CUR}scale=$ZB:flags=lanczos,zoompan=z='$ZEXPR':x='(iw-iw/zoom)*$FX$DXE':y='(ih-ih/zoom)*$FY$DYE':d=1:s=${W}x${H}:fps=$FPS,format=yuv420p[vkb];"
  fi
  # ── 7.4) Scene-boundary transition (cards.tsv enter= / exit=) ──
  #   The seam between two cards is a hard cut: §9 joins them with the concat demuxer and
  #   -c copy, and the whole zero-drift contract rests on that being stream-exact. An xfade
  #   between cards would break it twice over — the total would shrink by the transition length
  #   per seam and trip the 2ms assertion, and xfade renumbers the tail's PTS from 0 anyway (the
  #   measurement is written out at the outro seam below).
  #
  #   So **every transition is drawn inside the incoming card's own encode.** Nothing overlaps
  #   in the concat, so §9 still stream-copies and drift stays 0. A dip keeps this card's
  #   frame count; every carry drops the silent pre-roll (PRE) from this card's length
  #   because the next line occupies it (§4.5).
  #   Three ways to draw one:
  #
  #   ① dip (`enter=black|white` + `exit=black|white`) — the outgoing card fades its own tail
  #     into the colour, the incoming card fades its own head out of it. Two halves, one per
  #     card. It passes through a solid frame, which is what a dip is for: a beat of nothing.
  #   ② carry (`enter=jcut|dissolve|iris|blur|zoom`, `enter=push:<dir>`, `enter=whip:<dir>`) —
  #     the incoming card opens on **the previous card's last frame** (work/tail<prev>.png) and
  #     gets out of it. jcut holds it while the new line already plays, then snaps; dissolve
  #     melts through it; iris opens a circle out of it; blur smears it sideways and melts;
  #     push slides it off; whip slides it off with the smear a fast pan leaves; zoom grows it
  #     past the camera. Only the incoming card writes anything — no overlapping frame in the
  #     concat.
  #   ③ smash (`enter=cut`) — picture and sound change together. The old silent pre-roll.
  #
  #   **Why iris/blur may use xfade when the seam may not.** The ban above is on an xfade
  #   *between cards*, where it eats one transition length out of the concat total and renumbers
  #   the tail's PTS. Inside one card's encode neither applies: the inputs are the TD-long tail
  #   loop and this card's own [vkb], so the output runs TD + cardlen − TD = cardlen (verified —
  #   frame-identical to the overlay carries at 90/90 frames, 3.000s, on the 2-card fixture), and
  #   the encode stamps fresh PTS regardless. It buys the whole xfade catalogue for one case line
  #   per mode. Do not lift it to the seam in §9; that is still the thing that breaks drift.
  #
  #   Audio runs straight through. Every carry puts the next line under the previous last frame
  #   so the picture never changes in silence; a dip keeps the card's own PRE/POST — its silence
  #   is the beat. The BGM bed is rendered across the whole feature — fading it at a scene
  #   change would punch a hole in the music.
  VF_FADE=""; SRCL="[vkb]"
  if [ -n "$EXITM" ]; then
    # Half the seam belongs to each side, and it has to fit the shorter card: never more than
    # a quarter of this card, so a 1-second insert dips rather than blinking through black.
    SF_D=$(awk -v d="$SCENE_FADE" -v dur="$D1" 'BEGIN{m=dur/4; if(d>m)d=m; if(d<0.02)d=0.02; printf "%.3f", d}')
    VF_FADE=",fade=t=out:st=$(awk -v t="$D1" -v d="$SF_D" 'BEGIN{printf "%.3f", t-d}'):d=$SF_D:c=$EXITM"
    ZD="$ZD exit:$EXITM@$SF_D"
  fi
  case "$ENTER" in
    black|white)
      SF_D=$(awk -v d="$SCENE_FADE" -v dur="$D1" 'BEGIN{m=dur/4; if(d>m)d=m; if(d<0.02)d=0.02; printf "%.3f", d}')
      VF_FADE=",fade=t=in:st=0:d=$SF_D:c=$ENTER$VF_FADE"
      ZD="$ZD enter:$ENTER@$SF_D" ;;
    dissolve|push|jcut|iris|blur|whip|zoom)
      [ -n "$PREVIDX" ] || { say "✗ card $IDX: enter=$ENTER has no card in front of it to carry — the first card can only dip"; exit 1; }
      TAILPNG="work/tail$PREVIDX.png"
      [ -f "$TAILPNG" ] || { say "✗ card $IDX: enter=$ENTER needs card $PREVIDX's last frame — $TAILPNG is missing"; exit 1; }
      [ -n "$PREVEXIT" ] && { say "⚠ card $IDX: enter=$ENTER carries card $PREVIDX's last frame, but that card has exit=$PREVEXIT — it is carrying a frame of solid $PREVEXIT. Drop one of the two."; WARN=1; }
      # A carry lives entirely in this card's head, so it can take a third of it and no more.
      case "$ENTER" in
        dissolve) TBASE=$SCENE_XF ;;  push) TBASE=$SCENE_PUSH ;;  iris) TBASE=$SCENE_IRIS ;;
        blur)     TBASE=$SCENE_BLUR ;; whip) TBASE=$SCENE_WHIP ;;  zoom) TBASE=$SCENE_ZOOM ;;
        *)        TBASE=$SCENE_JCUT ;;
      esac
      TD=$(awk -v d="$TBASE" -v dur="$D1" 'BEGIN{m=dur/3; if(d>m)d=m; if(d<0.04)d=0.04; printf "%.3f", d}')
      INS+=(-loop 1 -framerate "$FPS" -t "$TD" -i "$TAILPNG")
      TI=$NIN; NIN=$((NIN+1))
      FILT+="[$TI:v]scale=$W:$H:force_original_aspect_ratio=increase:flags=lanczos,crop=$W:$H,fps=$FPS,settb=AVTB,setsar=1"
      if [ "$ENTER" = "dissolve" ]; then
        FILT+=",format=yuva420p,fade=t=out:st=0:d=$TD:alpha=1[tcar];"
        FILT+="[vkb][tcar]overlay=0:0:eof_action=pass,format=yuv420p[vtr];"
      elif [ "$ENTER" = "jcut" ]; then
        # Hold the previous last frame for TD, then snap. The new line is already playing (CPRE=0, §4.5).
        FILT+=",format=yuv420p[tcar];"
        FILT+="[vkb][tcar]overlay=0:0:enable='lt(t,$TD)':eof_action=pass,format=yuv420p[vtr];"
      elif [ "$ENTER" = "iris" ] || [ "$ENTER" = "blur" ]; then
        # xfade composites the two pictures itself, so the carried frame needs no alpha ramp.
        # It also wants both inputs on one timebase — vkb comes out of zoompan without one, so
        # stamp it here rather than in the three places vkb is built (§7.2 stays untouched).
        case "$ENTER" in iris) XFT=circleopen ;; *) XFT=hblur ;; esac
        FILT+=",format=yuv420p[tcar];[vkb]settb=AVTB,setsar=1[vkbx];"
        FILT+="[tcar][vkbx]xfade=transition=$XFT:duration=$TD:offset=0,format=yuv420p[vtr];"
      elif [ "$ENTER" = "whip" ]; then
        # A push with the smear a fast pan leaves. The blur runs along the travel axis only —
        # blurring both axes reads as out-of-focus, not as speed.
        case "$PUSH_DIR" in
          l2r) OXY="x='W*t/$TD':y=0";  WB="sizeX=$WHIP_BLUR:sizeY=1" ;;
          r2l) OXY="x='-W*t/$TD':y=0"; WB="sizeX=$WHIP_BLUR:sizeY=1" ;;
          u2d) OXY="x=0:y='H*t/$TD'";  WB="sizeX=1:sizeY=$WHIP_BLUR" ;;
          d2u) OXY="x=0:y='-H*t/$TD'"; WB="sizeX=1:sizeY=$WHIP_BLUR" ;;
        esac
        FILT+=",avgblur=$WB,format=yuv420p[tcar];"
        FILT+="[vkb][tcar]overlay=$OXY:eof_action=pass,format=yuv420p[vtr];"
      elif [ "$ENTER" = "zoom" ]; then
        # The carried frame grows past the camera and thins out as it goes. Doubling it first
        # keeps the growing window off the upscaler; the alpha ramp finishes at 65% of the join
        # so the last third is the new card alone — a frame still visible at full size reads as
        # a second picture stuck on top.
        ZAF=$(awk -v t="$TD" 'BEGIN{printf "%.3f", t*0.65}')
        FILT+=",scale=$((W*2)):-1:flags=lanczos,zoompan=z='1+$ZOOM_THRU*on/($FPS*$TD)':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=${W}x${H}:fps=$FPS,settb=AVTB,setsar=1"
        FILT+=",format=yuva420p,fade=t=out:st=0:d=$ZAF:alpha=1[tcar];"
        FILT+="[vkb][tcar]overlay=0:0:eof_action=pass,format=yuv420p[vtr];"
      else
        # The carried frame slides off in the named direction, uncovering this card underneath.
        case "$PUSH_DIR" in
          l2r) OXY="x='W*t/$TD':y=0" ;;
          r2l) OXY="x='-W*t/$TD':y=0" ;;
          u2d) OXY="x=0:y='H*t/$TD'" ;;
          d2u) OXY="x=0:y='-H*t/$TD'" ;;
        esac
        FILT+=",format=yuv420p[tcar];"
        FILT+="[vkb][tcar]overlay=$OXY:eof_action=pass,format=yuv420p[vtr];"
      fi
      SRCL="[vtr]"
      ZD="$ZD enter:$ENTER${PUSH_DIR:+:$PUSH_DIR}@$TD" ;;
  esac
  FILT+="${SRCL}null${VF_FADE}[vout]"

  ffmpeg -y -v error "${INS[@]}" -filter_complex "$FILT" -map "[vout]" \
    -frames:v "$FRAMES" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p "work/v$IDX.mp4"

  # The last frame, for the next card to carry. -update overwrites the same file frame by frame,
  # so what survives the last half-second of the clip is exactly the final frame — no reverse pass.
  case "$CARRY_PREV" in *" $IDX "*)
    ffmpeg -y -v error -sseof -0.5 -i "work/v$IDX.mp4" -update 1 "work/tail$IDX.png" ;;
  esac
  PREVIDX="$IDX"; PREVEXIT="$EXITM"

  # ── 7.5) Segment sound effects + BGM mute windows (only when sfx.tsv exists)
  #   This is the slot for "a sound that only plays in that stretch" — the typing card's keyboard
  #   sound was the first case.
  #   The time base is **the visual's appearance time FOFF**, not the sentence boundary. xfade starts
  #   playing the later input from its 0s at the offset, so aligning to the boundary puts the sound
  #   three or four characters ahead of the picture.
  if [ -n "$SFXTSV" ]; then
    CS0=$(awk -v f="$TOTF" -v fps="$FPS" 'BEGIN{printf "%.4f", f/fps}')
    FJ=0
    for ((j=0; j<M; j++)); do
      SN=$(awk -F, -v k=$((j+1)) 'NR==1{print $k}' <<< "$SUBS")
      SPATH=$(awk -F'\t' -v i="$IDX" -v s="$j" '$1==i && $2==s{print $3}' "$SFXTSV" | head -1)
      SBGM=$(awk -F'\t' -v i="$IDX" -v s="$j" '$1==i && $2==s{print $4}' "$SFXTSV" | head -1)
      if [ -n "$SPATH" ] || [ "${SBGM:-}" = "off" ]; then
        WS=$(awk -v c="$CS0" -v o="${FOFF[$FJ]}" 'BEGIN{printf "%.3f", c+o}')
        if [ "$j" -lt $((M-1)) ]; then WE=$(awk -v c="$CS0" -v p="$CPRE" -v b="${BARR[$j]}" 'BEGIN{printf "%.3f", c+p+b}')
        else WE=$(awk -v c="$CS0" -v d="$D" 'BEGIN{printf "%.3f", c+d}'); fi
        if [ -n "$SPATH" ]; then
          [ -f "$SPATH" ] || { say "✗ card $IDX seg $j: sfx file missing — $SPATH"; exit 1; }
          printf '%s\t%s\n' "$WS" "$SPATH" >> work/sfx.list
        fi
        [ "${SBGM:-}" = "off" ] && printf '%s\t%s\n' "$WS" "$WE" >> work/bgmgate.list
        say "· card $IDX seg $j: sfx ${SPATH:-none} @${WS}s · BGM ${SBGM:-on} (~${WE}s)"
      fi
      FJ=$((FJ + SN))
    done
  fi

  # ── 8) ASS subtitle lines (the subtitle-text column) — times are card absolute offsets (cumulative frames/FPS)
  if [ "$SUB" = "1" ]; then
    CS=$(awk -v f="$TOTF" -v fps="$FPS" 'BEGIN{printf "%.4f", f/fps}')
    # Word mode wants real word times. The forced aligner was started in §3.5 on the trimmed
    # narration and has been running under the encode; its token times are card-relative, so the
    # offset handed to word-cues.py is this card's absolute speech start (CS + pre-roll).
    ALIGNJ=""
    if { [ "$SUB_MODE" = "word" ] || [ "$SUB_MODE" = "phrase" ]; } && [ "$MUTE" -eq 0 ]; then
      if [ -n "$ALIGN_PID" ]; then
        wait "$ALIGN_PID" \
          && [ -s "work/align/s$IDX.json" ] && ALIGNJ="work/align/s$IDX.json" \
          || { say "⚠ card $IDX: forced aligner failed (work/align/s$IDX.log) — word cues fall back to char-count proportion"; WARN=1; }
        ALIGN_PID=""   # reaped — the EXIT trap must not signal a reused pid
      else
        say "⚠ card $IDX: no forced aligner at $QWEN3_ASR_BIN — word cues fall back to char-count proportion (uv tool install --python 3.12 \"mlx-qwen3-asr[aligner]\")"; WARN=1
      fi
    fi
    for ((j=0; j<M; j++)); do
      if [ "$j" -eq 0 ]; then ST=$(awk -v cs="$CS" -v p="$CPRE" 'BEGIN{s=p-0.15; if(s<0)s=0; printf "%.3f", cs+s}')
      else ST=$(awk -v cs="$CS" -v p="$CPRE" -v b="${BARR[$((j-1))]}" 'BEGIN{printf "%.3f", cs+p+b}'); fi
      if [ "$j" -lt $((M-1)) ]; then EN=$(awk -v cs="$CS" -v p="$CPRE" -v b="${BARR[$j]}" 'BEGIN{printf "%.3f", cs+p+b-0.06}')
      else EN=$(awk -v cs="$CS" -v p="$CPRE" -v l="$L" -v d="$D" 'BEGIN{e=p+l+0.45; if(e>d)e=d; printf "%.3f", cs+e}'); fi
      TXT=$(printf '%s' "${SARR[$j]}" | sed 's/[{}\\]//g')
      if [ -n "$TXT" ]; then
        if [ "$SUB_MODE" = "word" ] || [ "$SUB_MODE" = "phrase" ]; then
          # One 어절 per cue (word) or one short line of a few 어절 (phrase), hard swaps, no fade. The speech window is the sentence's real
          # voice span: a detected boundary is the END of the pause (the next sentence's first
          # sound), so the window closes at that pause's START — the silin line whose end is
          # the boundary. A proportional-fallback boundary has no pause and stays as it is.
          if [ "$j" -eq 0 ]; then PB=0; else PB="${BARR[$((j-1))]}"; fi
          SPS=$(awk -v cs="$CS" -v p="$CPRE" -v b="$PB" 'BEGIN{printf "%.3f", cs+p+b}')
          if [ "$j" -lt $((M-1)) ]; then
            SPE=$(awk -v cs="$CS" -v p="$CPRE" -v b="${BARR[$j]}" 'BEGIN{e=b} FILENAME!="" && ($2-b)<0.002 && ($2-b)>-0.002 {e=$1} END{printf "%.3f", cs+p+e}' "work/silin$IDX.txt" 2>/dev/null \
                  || awk -v cs="$CS" -v p="$CPRE" -v b="${BARR[$j]}" 'BEGIN{printf "%.3f", cs+p+b}')
          else SPE=$(awk -v cs="$CS" -v p="$CPRE" -v l="$L" 'BEGIN{printf "%.3f", cs+p+l}'); fi
          AOFF=$(awk -v cs="$CS" -v p="$CPRE" 'BEGIN{printf "%.3f", cs+p}')
          python3 "$HERE/word-cues.py" "$ST" "$EN" "$SPS" "$SPE" "$SUB_WORD_MIN" "$TXT" ${ALIGNJ:+--align "$ALIGNJ" --offset "$AOFF" --tts "${TARR[$j]}"} $PHRASE_ARG |
            while IFS=$'\t' read -r WS WE WT; do
              case "$WS" in \#*) say "· card $IDX seg $j words: ${WS#\# }"; continue;; esac
              printf 'Dialogue: 0,%s,%s,%s,,0,0,0,,%s\n' "$(asstime "$WS")" "$(asstime "$WE")" "$WSTYLE" "$WT" >> work/subs.body
            done
        else
          printf 'Dialogue: 0,%s,%s,Sub,,0,0,0,,{\\fad(160,120)}%s\n' "$(asstime "$ST")" "$(asstime "$EN")" "$TXT" >> work/subs.body
        fi
        # Print the SRT from the same ST/EN/TXT — burn-in and subtitle file share one source, so they can't drift apart.
        # The fade tag ({\fad}) is ASS-only, so it's dropped (SRT doesn't know formatting tags).
        SRTN=$((SRTN+1))
        printf '%d\n%s --> %s\n%s\n\n' "$SRTN" "$(srttime "$ST")" "$(srttime "$EN")" "$TXT" >> work/subs.srtbody
      fi
    done
    # File subtitles (subs=) — shifts seconds measured from the card start onto absolute time. It skips
    # boundary detection, so it's for subtitles whose times are already known, like a transcript.
    # An end past the card duration is clipped to the card end.
    if [ -n "$SUBSF" ]; then
      NSF=0
      while IFS=$'\t' read -r FS FE FT; do
        [ -z "${FS:-}" ] && continue
        case "$FS" in \#*) continue;; esac
        FT=$(printf '%s' "${FT:-}" | sed 's/[{}\\]//g')
        [ -n "$FT" ] || continue
        ST=$(awk -v cs="$CS" -v s="$FS" 'BEGIN{if(s<0)s=0; printf "%.3f", cs+s}')
        EN=$(awk -v cs="$CS" -v e="$FE" -v d="$D" 'BEGIN{if(e>d)e=d; printf "%.3f", cs+e}')
        awk -v s="$ST" -v e="$EN" 'BEGIN{exit !(e>s)}' || continue
        if [ "$SUB_MODE" = "word" ] || [ "$SUB_MODE" = "phrase" ]; then
          python3 "$HERE/word-cues.py" "$ST" "$EN" "$ST" "$EN" "$SUB_WORD_MIN" "$FT" $PHRASE_ARG |
            while IFS=$'\t' read -r WS WE WT; do
              case "$WS" in \#*) continue;; esac
              printf 'Dialogue: 0,%s,%s,%s,,0,0,0,,%s\n' "$(asstime "$WS")" "$(asstime "$WE")" "$WSTYLE" "$WT" >> work/subs.body
            done
        else
          printf 'Dialogue: 0,%s,%s,Sub,,0,0,0,,{\\fad(160,120)}%s\n' "$(asstime "$ST")" "$(asstime "$EN")" "$FT" >> work/subs.body
        fi
        SRTN=$((SRTN+1)); NSF=$((NSF+1))
        printf '%d\n%s --> %s\n%s\n\n' "$SRTN" "$(srttime "$ST")" "$(srttime "$EN")" "$FT" >> work/subs.srtbody
      done < "$SUBSF"
      say "· card $IDX file subtitles ${NSF} lines ($SUBSF)"
    fi
  fi

  echo "$IDX" >> work/order.txt
  TOTF=$((TOTF + FRAMES))
  say "$(printf 'card %s | %s segs | boundary %s | %s chars | %s chars/s | x%s | %s chars/s | %.2fs | %ss | %sf | zoom:%s' \
        "$IDX" "$M" "$BMETHOD" "$C" "$R0" "$F" "$R" "$L" "$D" "$FRAMES" "$ZD")"
  # Non-ASCII glued right after a variable gets absorbed into the name — braces are mandatory
  if [ "$MV" -gt 1 ]; then
    say "  └ reveal ${MV} states"
    while IFS= read -r line; do say "$line"; done < "work/rt$IDX.txt"
  fi
done 3< cards.tsv

# ── 9.0) chapters.txt — only when chapters.tsv exists
#   The input has 2 columns: `chapter-first-card-idx<TAB>chapter-title`. Times come from card absolute
#   time (cumulative frames/FPS), so nobody has to count mm:ss by hand. Absent = today's behavior
#   (the file isn't created).
#
#   **It rounds down.** A chapter boundary sits in the pause between sentences, so a timestamp slightly
#   ahead of the real start lands the viewer in the pause, while slightly behind clips the first word.
#   splice rounds up instead, because it protects something different — keeping the marker out of the
#   inserted clip's range, which only rounding up guarantees (shifted time ≥ clip end).
if [ -n "$CHAPTSV" ] && [ -s work/chapstart.tsv ]; then
  # The gap has to clear 10s **after** §7.5 divides it by SPEED, so on this timeline it needs 10*SPEED.
  CHAP_GAP=$(awk -v f="$SPEED" 'BEGIN{printf "%.2f", 10 * f}')
  awk -F'\t' -v fps="$FPS" -v gap="$CHAP_GAP" -v f="$SPEED" '
    function ts(v,   h, m, s) { s = int(v); m = int(s/60); s -= m*60; h = int(m/60); m -= h*60;
      return h ? sprintf("%d:%02d:%02d", h, m, s) : sprintf("%02d:%02d", m, s) }
    { sec = int($1 / fps); printf "%s\t%s\n", ts(sec), $2; secs[NR] = sec; n = NR }
    END {
      bad = 0
      if (secs[1] != 0) { printf "✗ the first chapter is %s — it has to be 00:00\n", ts(secs[1]) > "/dev/stderr"; bad = 1 }
      if (n < 3) { printf "✗ %d chapters — YouTube requires at least 3\n", n > "/dev/stderr"; bad = 1 }
      for (i = 2; i <= n; i++) if (secs[i] - secs[i-1] < gap) {
        printf "✗ %s → %s is %ds apart — under the %.0fs minimum (10s after the x%.2f speed pass)\n",
               ts(secs[i-1]), ts(secs[i]), secs[i]-secs[i-1], gap, f > "/dev/stderr"; bad = 1 }
      exit bad
    }' work/chapstart.tsv > chapters.txt || {
      say "✗ chapters.tsv breaks YouTube's chapter requirements — fix the items above"
      rm -f chapters.txt; exit 1; }
  say "── chapters: $(wc -l < chapters.txt | tr -d ' ') → chapters.txt"
fi

# ── 9) Main-part concat + drift assertion (same as v2)
: > work/list.txt
while read -r i; do echo "file 'v$i.mp4'" >> work/list.txt; done < work/order.txt
ffmpeg -y -v error -f concat -safe 0 -i work/list.txt -c copy work/video.mp4

INPUTS=(); FC=""
K=0
while read -r i; do INPUTS+=(-i "work/n$i.wav"); FC+="[$K:a]"; K=$((K+1)); done < work/order.txt
ffmpeg -y -v error "${INPUTS[@]}" -filter_complex "${FC}concat=n=$K:v=0:a=1[vo]" \
  -map "[vo]" -ar 48000 -ac 1 work/narration.wav

VT=$(ffprobe -v error -show_entries format=duration -of csv=p=0 work/video.mp4)
NT=$(ffprobe -v error -show_entries format=duration -of csv=p=0 work/narration.wav)
DRIFT=$(awk -v a="$VT" -v b="$NT" 'BEGIN{d=a-b; if(d<0)d=-d; printf "%.4f", d}')
say "── main part: video ${VT}s / narration ${NT}s / drift ${DRIFT}s"
awk -v d="$DRIFT" 'BEGIN{exit !(d<=0.002)}' || { say "✗ drift over the 2ms tolerance — build stopped"; exit 1; }

# ── 9.5) The music bed — conditioned, cue-sequenced, seam-free, exactly as long as the feature.
#   The old mix multiplied whatever file the channel handed over by a fixed 0.28, so the gap
#   between the voice and the music was whatever that file happened to be: across 11 episodes the
#   source beds measured -4.2 to +1.0 dBTP. Here the speech is measured first and the bed is set
#   a stated number of LU under it, which is what makes the gap a decision instead of an accident.
#   Why the speech is the reference and not a fixed LUFS: the final loudnorm rescales the whole
#   mix anyway, so only the distance between the two survives to the listener.
SPEECH_I=$(ffmpeg -hide_banner -nostats -i work/narration.wav -af loudnorm=print_format=json -f null - 2>&1 \
  | tr -d ' \t"' | awk -F: '$1=="input_i"{gsub(/,/,"",$2); print $2}')
BED_I=$(awk -v s="$SPEECH_I" -v d="$BGM_SEP" 'BEGIN{printf "%.2f", s-d}')

: > work/bgmcue.list
if [ -f bgm.tsv ]; then
  while IFS=$'\t' read -r CI CF || [ -n "${CI:-}" ]; do
    [ -z "${CI:-}" ] && continue
    CT=$(awk -F'\t' -v i="$CI" '$1==i{print $2; exit}' work/cardstart.tsv)
    [ -n "$CT" ] || { say "✗ bgm.tsv names card $CI, which isn't in this build"; exit 1; }
    printf '%s\t%s\n' "$CT" "$CF" >> work/bgmcue.list
  done < bgm.tsv
  sort -n -o work/bgmcue.list work/bgmcue.list
fi
# Something has to be playing at 0s. Without a cue on card 0 (t=0), bgm.wav opens the episode.
CUE0=$(head -1 work/bgmcue.list | cut -f1)
if [ -z "$CUE0" ] || ! awk -v s="$CUE0" 'BEGIN{exit !(s < 0.001)}'; then
  { printf '0.0000\tbgm.wav\n'; cat work/bgmcue.list; } > work/bgmcue.tmp
  mv work/bgmcue.tmp work/bgmcue.list
fi
say "── BGM bed: speech ${SPEECH_I} LUFS → bed ${BED_I} LUFS (${BGM_SEP} LU under) · $(wc -l < work/bgmcue.list | tr -d ' ') cue(s)"
"$HERE/bgm-bed.sh" work/bed.wav "$NT" "$BED_I" work/bgmcue.list > work/bed.log 2>&1 \
  || { cat work/bed.log; say "✗ the music bed failed to render"; exit 1; }
while IFS= read -r L; do say "$L"; done < work/bed.log

# ── 10) BGM ducking mix (same as v2) — with sfx.tsv, the sfx track and BGM mute windows go on top
FOUT=$(awk -v t="$NT" 'BEGIN{printf "%.3f", t-2.2}')

# 10a) SFX track — silence the length of the main part, with each effect delayed to its start time.
#      Why it's built separately instead of mixed into the narration: the ducking key (vo_key) must be
#      voice only. Put sfx in the key and the keyboard sound pushes the BGM down, making the music hiccup.
SFXIN=""
if [ -s work/sfx.list ]; then
  SI=(-f lavfi -t "$NT" -i "anullsrc=r=48000:cl=mono"); SFC=""; SMIX="[0:a]"; SN2=1
  while IFS=$'\t' read -r ST SP; do
    SI+=(-i "$SP")
    SFC+="[$SN2:a]aresample=48000,aformat=channel_layouts=mono,adelay=$(awk -v s="$ST" 'BEGIN{printf "%d", s*1000}'):all=1,atrim=0:$NT[x$SN2];"
    SMIX+="[x$SN2]"; SN2=$((SN2+1))
  done < work/sfx.list
  ffmpeg -y -v error "${SI[@]}" -filter_complex \
    "${SFC}${SMIX}amix=inputs=$SN2:duration=first:normalize=0,volume=$SFX_VOL,apad,atrim=0:$NT[sx]" \
    -map "[sx]" -ac 1 -ar 48000 work/sfx.wav
  SFXIN="-i work/sfx.wav"
  say "── sfx: $((SN2-1)) (volume $SFX_VOL)"
fi

# 10b) BGM mute — multiply a gate in per window. A hard cut makes the music stop dead, so there's a
#      ${BGM_GATE_R}s ramp. gate = max(falling slope, rising slope) — 1 outside the window, 0 inside.
BGMGATE=""
if [ -s work/bgmgate.list ]; then
  BGMGATE=$(awk -F'\t' -v r="$BGM_GATE_R" '
    {printf "%smax(min(1\\,max(0\\,(%s-t)/%s))\\,min(1\\,max(0\\,(t-%s)/%s)))", (NR>1?"*":""), $1, r, $2, r}' work/bgmgate.list)
  BGMGATE=",volume=eval=frame:volume='$BGMGATE'"
  say "── BGM mute $(wc -l < work/bgmgate.list | tr -d ' ') windows (ramp ${BGM_GATE_R}s)"
fi

if [ -n "$SFXIN" ]; then VOMIX="[vo_raw][sfxa]amix=inputs=2:duration=first:normalize=0[vo_mix];"
else VOMIX="[vo_raw]anull[vo_mix];"; fi
#      The bed arrives already gained and already the right length, so this stage only shapes it:
#      head and tail fades, the gate windows, then ducking. bed-ducked.wav is tapped off for the
#      separation check below — measuring it after the amix would be measuring the voice too.
ffmpeg -y -v error -i work/narration.wav -i work/bed.wav $SFXIN -filter_complex "
  [0:a]aformat=channel_layouts=stereo,asplit=2[vo_key][vo_raw];
  ${SFXIN:+[2:a]aformat=channel_layouts=stereo[sfxa];}
  $VOMIX
  [1:a]atrim=0:$NT,asetpts=PTS-STARTPTS,
       afade=t=in:st=0:d=1.2,afade=t=out:st=$FOUT:d=2.2$BGMGATE[bgv];
  [bgv][vo_key]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=$DUCK_RELEASE:makeup=1,
       asplit=2[duck][duckqa];
  [vo_mix][duck]amix=inputs=2:duration=first:dropout_transition=0,
       loudnorm=I=-14:TP=-1.0:LRA=11,aresample=48000[out]
" -map "[out]" -ac 2 -ar 48000 work/mix.wav \
  -map "[duckqa]" -ac 2 -ar 48000 work/bed-ducked.wav

# 10c) Voice-to-bed separation — the one number that says whether the music is sitting under the
#      voice or next to it. Listening tests put the preferred commentary-over-music distance at
#      10 LU or more and treat 4 LU as the floor where speech stops being comfortably above the
#      background (bgm-scoring.md §1). Measured across the whole timeline, so the un-ducked gaps
#      are in it too — that makes this reading conservative, never flattering.
BED_D=$(ffmpeg -hide_banner -nostats -i work/bed-ducked.wav -af loudnorm=print_format=json -f null - 2>&1 \
  | tr -d ' \t"' | awk -F: '$1=="input_i"{gsub(/,/,"",$2); print $2}')
SEP=$(awk -v s="$SPEECH_I" -v b="$BED_D" 'BEGIN{printf "%.1f", s-b}')
say "── voice-to-bed separation ${SEP} LU (speech ${SPEECH_I} / ducked bed ${BED_D})"
if awk -v v="$SEP" -v m="$BGM_SEP_MIN" 'BEGIN{exit !(v < m)}'; then
  say "✗ separation ${SEP} LU is under the ${BGM_SEP_MIN} LU floor — the bed is competing with the voice"
  exit 1
elif awk -v v="$SEP" -v d="$BGM_SEP" 'BEGIN{exit !(v < d)}'; then
  # Ducking can only widen the gap, so a reading at or under the resting distance means the
  # sidechain never fired — the key went silent, or the bed reached the mix around it.
  say "⚠ separation ${SEP} LU is no wider than the ${BGM_SEP} LU resting distance — the ducking isn't firing"
  WARN=1
fi

# ── 11) ASS subtitle file — band y≈1380~1560 (a contract with the template's bottom safe zone,
#      above the IG caption zone)
#      Left and right margins are symmetric (250) — asymmetric ones push center-aligned subtitles off
#      the screen's center (measured 60px); at 168 a long single line crosses the action bar's start
#      line x≈890 (measured 907px); at 200 the clearance drops to 39~61px, the smallest of any screen
#      element — 250 puts it in the same clearance band as the list and hero
SUBFILTER=""
if [ "$SUB" = "1" ] && [ -s work/subs.body ]; then
  {
    printf "[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n"
    printf '[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n'
    printf "Style: Word,%s,${SUB_WORD_SIZE},&H00FFFFFF,&H00FFFFFF,&H00281810,&H78000000,-1,0,0,0,100,100,0,0,1,${SUB_OUT},${SUB_SHA},2,${SUB_ML},${SUB_MR},${SUB_WORD_MV},1\n" "$SUB_FONT"
    printf "Style: Phrase,%s,${SUB_PHRASE_SIZE},&H00FFFFFF,&H00FFFFFF,&H00281810,&H78000000,-1,0,0,0,100,100,0,0,1,${SUB_PHRASE_OUT},${SUB_SHA},2,${SUB_PHRASE_ML},${SUB_PHRASE_MR},${SUB_PHRASE_MV},1\n" "$SUB_FONT"
    printf "Style: Sub,%s,${SUB_SIZE},&H00FFFFFF,&H00FFFFFF,&H00281810,&H78000000,-1,0,0,0,100,100,0,0,1,${SUB_OUT},${SUB_SHA},2,${SUB_ML},${SUB_MR},${SUB_MV},1\n\n" "$SUB_FONT"
    printf '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
    cat work/subs.body
  } > subs.ass
  if [ -d fonts ] && ls fonts/*.[to]tf >/dev/null 2>&1; then SUBFILTER="subtitles=subs.ass:fontsdir=fonts"
  else SUBFILTER="subtitles=subs.ass"; fi
  # Publish SRT — line endings are CRLF (the original SubRip spec). Nobody has confirmed the platform
  # parsers accept LF, so this follows the spec. The one blank line at the end of the file marks the
  # last cue's end, so it stays.
  awk '{printf "%s\r\n", $0}' work/subs.srtbody > subs.srt
  ASSN=$(grep -c '^Dialogue:' work/subs.body || true)
  say "── subtitles: ${SRTN} lines in subs.srt · ${ASSN} burn-in cues (${SUB_MODE} mode) / font $SUB_FONT"
fi

# ── 12) Render + outro splice (no subtitles over the outro) — never -shortest (same as v2)
#      Subtitles go up as a separate file by default, so **the clean master is reel.mp4**. The burn-in
#      is a separate artifact for platforms with no subtitle-file path (IG Reels); it isn't a
#      re-encode of reel.mp4 but a second pass from the same source — no second-generation encoding,
#      both files are first-generation.
# Split into video and audio halves — the outro splice encodes the picture on its own
# and then stream-copies it, so the two halves have to be usable separately.
VENC=(-c:v libx264 -profile:v high -level 4.1 -preset slow -crf 19 -pix_fmt yuv420p
      -g $((FPS*2)) -keyint_min "$FPS" -sc_threshold 0 -r "$FPS")
AENC=(-c:a aac -b:a 192k -ar 48000 -ac 2)
ENC=("${VENC[@]}" "${AENC[@]}" -movflags +faststart)
# The splice runs in two steps — **the audio is built in a separate ffmpeg run.**
# Putting a video chain and an audio chain in one filter_complex makes ffmpeg 7.1.1's
# scheduler drop audio frames (measured 2026-08-19). ~200 AAC frames then pile up on a
# single PTS, the sound runs 1.28s ahead of the picture from the 4s mark on, and the
# outro vanishes entirely while the report still says "spliced". Freezing the audio to a
# file first and feeding it to the render with -map leaves one chain, which never hits it.
#
# The transition does not use xfade. xfade renumbers the tail frames' PTS from 0 (measured:
# 103.9→104.5 is followed by 0→3.33), so the encoder throws everything after the transition
# away. setpts, fps_mode and timebase normalisation all fail to fix it because the filter
# reinit resets the frame counter too. The transition goes through black anyway, so pulling
# it apart with no overlap looks the same — fade the feature's tail down to black, fade the
# outro's head up from it, join. That makes the total feature + outro (not the
# feature + outro − XFADE of the xfade era).
#
# The join is the **concat demuxer over two encoded files**, not the concat filter. The
# filter mangles the junction the same way (measured 2026-08-19): it repeats the feature's
# last frame 18 times and drops the outro's first 18, so the logo hard-cuts in out of a
# frozen black, and under -fps_mode passthrough those 19 frames vanish outright. Encoding
# the two pieces separately and stream-copying them together leaves no filter at the seam.
AUDSRC="work/mix.wav"; VDUR="$VT"; FO=""
if [ -f "$OUTRO_ASSET" ]; then
  OD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUTRO_ASSET")
  FO=$(awk -v t="$VT" -v x="$XFADE" 'BEGIN{printf "%.6f", t-x}')
  VDUR=$(awk -v t="$VT" -v o="$OD" 'BEGIN{printf "%.6f", t+o}')
  AFMT="aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo"
  ffmpeg -y -v error -i work/mix.wav -i "$OUTRO_ASSET" -filter_complex "
    [0:a]afade=t=out:st=$FO:d=$XFADE,$AFMT[ab];
    [1:a]afade=t=in:st=0:d=$XFADE,$AFMT[ao];
    [ab][ao]concat=n=2:v=0:a=1[a]
  " -map "[a]" -c:a pcm_s16le work/asplice.wav
  AUDSRC="work/asplice.wav"
fi

# The faded outro is identical for the clean and burned-in renders, so build it once.
if [ -f "$OUTRO_ASSET" ]; then
  ffmpeg -y -v error -i "$OUTRO_ASSET" \
    -vf "fade=t=in:st=0:d=$XFADE,setsar=1,format=yuv420p" -an "${VENC[@]}" work/outro-fade.mp4
fi

render() {                          # $1=output file  $2=subtitle filter (empty string = no burn-in)
  local OUT="$1" SF="${2:-}"
  if [ -f "$OUTRO_ASSET" ]; then
    # Subtitles ride the feature only — the outro carries none, so SF goes on the feature.
    # Both pieces get the same VENC so the concat demuxer can stream-copy them.
    ffmpeg -y -v error -i work/video.mp4 \
      -vf "${SF:+$SF,}fade=t=out:st=$FO:d=$XFADE,setsar=1,format=yuv420p" \
      -an "${VENC[@]}" "work/body-$(basename "$OUT" .mp4).mp4"
    printf "file '%s'\nfile '%s'\n" "body-$(basename "$OUT" .mp4).mp4" "outro-fade.mp4" \
      > "work/join-$(basename "$OUT" .mp4).txt"
    ffmpeg -y -v error -f concat -safe 0 -i "work/join-$(basename "$OUT" .mp4).txt" -i "$AUDSRC" \
      -map 0:v -map 1:a -c:v copy "${AENC[@]}" -movflags +faststart "$OUT"
  elif [ -n "$SF" ]; then
    ffmpeg -y -v error -i work/video.mp4 -i "$AUDSRC" -filter_complex "[0:v]$SF[v]" \
      -map "[v]" -map 1:a "${ENC[@]}" "$OUT"
  else
    ffmpeg -y -v error -i work/video.mp4 -i "$AUDSRC" -map 0:v -map 1:a "${ENC[@]}" "$OUT"
  fi
}

render reel.mp4 ""
if [ -f "$OUTRO_ASSET" ]; then say "── outro splice: black fade ${XFADE}s @ ${FO}s → total ${VDUR}s"
else say "── no outro: muxing the main part alone"; fi

rm -f reel-sub.mp4
if [ "$BURN" = "1" ] && [ -n "$SUBFILTER" ]; then
  render reel-sub.mp4 "$SUBFILTER"
  say "── burn-in reel-sub.mp4: for platforms that can't take a subtitle file (the clean master is reel.mp4)"
elif [ "$BURN" = "1" ]; then
  say "⚠ BURN=1 but there's no subtitle data, so no burn-in was made (SUB=$SUB)"
  WARN=1
else
  say "── burn-in skipped (BURN=0) — only correct when every publish target takes a subtitle file"
fi

# ── 13) Final verification (same as v2)
RV=$(ffprobe -v error -select_streams v -show_entries stream=duration -of csv=p=0 reel.mp4)
RA=$(ffprobe -v error -select_streams a -show_entries stream=duration -of csv=p=0 reel.mp4)
LUFS=$(ffmpeg -hide_banner -i reel.mp4 -af loudnorm=I=-14:TP=-1:LRA=11:print_format=summary -f null - 2>&1 | sed -n 's/.*Input Integrated: *\(.*\)/\1/p')
FSTART=$(xxd -l 48 reel.mp4 | grep -c moov || true)
say "── reel.mp4: video ${RV}s / audio ${RA}s / loudness ${LUFS} / faststart $([ "$FSTART" -ge 1 ] && echo OK || echo unconfirmed)"

# ── 13a) Splice hard gates — this is the spot where the report said "spliced" while the
#    outro had silently gone missing (measured 2026-08-19). These exit 1, they don't warn.
#    A defect that disappears quietly has to be caught by eye by the next person, and it
#    usually gets caught after the episode is already published.
#      ① Different video and audio durations mean one of the two got cut.
#      ② A total that misses the expected duration means the outro dropped or the feature
#         got truncated.
#      ③ Audio packets sharing one timestamp (normal spacing 1024/48000 = 0.0213s) make
#         players run the rest of the sound ahead of the picture.
ptspile() {   # $1=file → number of audio packets spaced abnormally close
  ffprobe -v error -select_streams a:0 -show_packets -of csv=p=0 \
    -show_entries packet=pts_time "$1" \
    | awk -F, 'NR>1{if($1-p<0.012) n++} {p=$1} END{print n+0}'
}
avgate() {    # $1=file $2=role
  local F="$1" ROLE="$2" V A P
  V=$(ffprobe -v error -select_streams v -show_entries stream=duration -of csv=p=0 "$F")
  A=$(ffprobe -v error -select_streams a -show_entries stream=duration -of csv=p=0 "$F")
  awk -v a="$V" -v b="$A" 'BEGIN{d=a-b; if(d<0)d=-d; exit !(d<=0.05)}' \
    || { say "✗ $ROLE: video ${V}s ≠ audio ${A}s — one of the two got cut"; exit 1; }
  awk -v a="$V" -v b="$VDUR" 'BEGIN{d=a-b; if(d<0)d=-d; exit !(d<=0.1)}' \
    || { say "✗ $ROLE: duration ${V}s ≠ expected ${VDUR}s — the outro splice dropped or the feature got cut"; exit 1; }
  P=$(ptspile "$F")
  [ "$P" -eq 0 ] \
    || { say "✗ $ROLE: ${P} audio packets share one timestamp — the sound will run ahead of the picture"; exit 1; }
  #    ④ The outro's fade-in has to actually ramp. A frame-count or duration check can't
  #       see this one: the concat filter used to hold the feature's last frame through the
  #       whole fade window, which keeps every count right while the logo hard-cuts in out
  #       of a frozen black (measured 2026-08-19). Sample brightness across the window and
  #       require it to move.
  if [ -f "$OUTRO_ASSET" ]; then
    local SPREAD
    SPREAD=$(ffmpeg -v info -nostats -ss "$FO" -t "$(awk -v x="$XFADE" 'BEGIN{printf "%.3f", x*3}')" \
        -i "$F" -vf "signalstats,metadata=print:key=lavfi.signalstats.YAVG" -f null - 2>&1 \
      | awk '/YAVG=/{split($0,b,"YAVG="); v=b[2]+0; if(n++==0){lo=v;hi=v} if(v<lo)lo=v; if(v>hi)hi=v}
             END{printf "%.1f", hi-lo}')
    awk -v s="$SPREAD" 'BEGIN{exit !(s >= 20)}' \
      || { say "✗ $ROLE: the outro seam is flat (brightness spread ${SPREAD}) — the fade froze or dropped"; exit 1; }
  fi
  say "── $ROLE splice check: duration ${V}s (expected ${VDUR}s) · A/V gap $(awk -v a="$V" -v b="$A" 'BEGIN{d=a-b; if(d<0)d=-d; printf "%.3f", d}')s · PTS pile-ups 0${SPREAD:+ · seam ramp ${SPREAD}}"
}
avgate reel.mp4 "reel.mp4"
# The burn-in comes from the same source through the same filter chain, so its duration must match the
# clean copy — a mismatch means one of the two files is a leftover from an older build (which ships a
# different video to different platforms).
if [ -f reel-sub.mp4 ]; then
  SV=$(ffprobe -v error -select_streams v -show_entries stream=duration -of csv=p=0 reel-sub.mp4)
  if awk -v a="$RV" -v b="$SV" 'BEGIN{exit (a-b<0.05 && b-a<0.05) ? 0 : 1}'; then
    say "── reel-sub.mp4: video ${SV}s (matches the clean copy)"
  else
    say "✗ reel-sub.mp4 duration ${SV}s ≠ reel.mp4 ${RV}s — not from the same build"; exit 1
  fi
  avgate reel-sub.mp4 "reel-sub.mp4"
fi
# The subtitle file goes straight to the publish tools — if it's empty here, that only surfaces at publish
if [ "$SUB" = "1" ]; then
  if [ -s subs.srt ]; then say "── subs.srt: ${SRTN} cues / $(wc -c < subs.srt | tr -d ' ') bytes (FB cap 200K)"
  else say "✗ SUB=1 but subs.srt is empty — check the subtitle-text column in segs.tsv"; exit 1; fi
fi
# ── Canvas comparison (gate 6) — don't proceed when the declared and measured sizes disagree.
#   **The check runs regardless of format; only the report line is conditional on format.env.** Adding
#   the line unconditionally would change the build-report.txt of an archived episode's rebuild right
#   there (regression axis ②).
#   It uses the `── ` prefix and doesn't start with `card ` — that keeps cardend()'s /^card / contract.
RDIM=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x reel.mp4)
if [ "$RDIM" != "${W}x${H}" ]; then
  say "✗ reel.mp4 is ${RDIM} but the declared canvas is ${W}x${H} — an asset or a filter is off"
  exit 1
fi
[ -f format.env ] && say "── canvas: declared ${W}x${H} · measured ${RDIM}"

# Cover = the moment everything up to the hero stat has appeared (an auto-picked frame fails to carry
# the hook — per the cover-optimization research)
# Pull it from the clean copy — a subtitle over the thumbnail collides with the cover copy
# The frame this pulls is the YouTube thumbnail as-is (absolute rule 12), and it is now pulled
# out of a moving still: a 5s punch cover sits at scale 1.062 at 3.2s (the zone top y190 lands at
# 143 instead of the old 163). A card holding a clip is unchanged at 1.035.
ffmpeg -y -v error -ss "${COVER_TS:-3.2}" -i reel.mp4 -frames:v 1 -q:v 2 cover.jpg
[ "$WARN" -eq 1 ] && say "── warnings present: check the ⚠ items above (regeneration advisories don't block the build)"
say "── done"
