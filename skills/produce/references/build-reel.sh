#!/usr/bin/env bash
# make-reels feature build pipeline v3 — reels-native (L0~L5)
#   Keeps the v2 audio machine (zero drift: audio-driven + frame ceiling + sample-exact padding)
#   and extends the video side: sentence-boundary detection → reveal crossfade chain → Ken Burns
#   → ASS subtitles → b-roll windows.
#
# Usage: build-reel.sh <workdir>
#   <workdir>/cards.tsv : idx <TAB> narration-audio-path <TAB> target-rate(chars/sec) <TAB> zoom(in|out|auto|none) [<TAB> opts]
#                         zoom=none skips Ken Burns — for footage that already moves, like filmed clips.
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
#                           pan=<dir>[:z] Ken Burns on a still photo as a pan instead of a zoom — l2r|r2l|u2d|d2u,
#                                         z is the scale (default 1.12, clamped to KB_ZOOM_MIN~KB_ZOOM_MAX).
#                                         For landscape canvases — portrait has no pan width, don't use it
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
#   <workdir>/bgm.wav   : background music (loops if shorter than the feature)
#   <workdir>/sfx.tsv   : (optional) idx <TAB> seg <TAB> audio-file <TAB> bgm(on|off)
#                         A sound heard only during that seg, plus BGM gating. The audio file can be
#                         wav or mp4 (a video contributes its own sound); it can be empty with just
#                         bgm set to off. Times are keyed to the visual's appearance, not sentence boundaries
#   <workdir>/outro.mp4 : (optional) shared outro — joined with xfade+acrossfade when present
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
PRE=${PRE:-0.40}                   # pre-roll (card entrance margin)
POST=${POST:-0.70}                 # post-roll (sentence tail room)
MIN_DUR=${MIN_DUR:-4.0}            # minimum card display time
MAX_DUR=${MAX_DUR:-13.0}           # warn when exceeded (signal to shorten the script)
RATE_TOL=${RATE_TOL:-0.05}
ATEMPO_MIN=${ATEMPO_MIN:-0.88}; ATEMPO_MAX=${ATEMPO_MAX:-1.18}
RATE_LO=${RATE_LO:-3.2}; RATE_HI=${RATE_HI:-6.2}
BGM_VOL=${BGM_VOL:-0.28}
DUCK_RELEASE=${DUCK_RELEASE:-250}
SFX_VOL=${SFX_VOL:-0.85}           # per-segment sfx volume (sfx.tsv)
BGM_GATE_R=${BGM_GATE_R:-0.30}     # ramp around BGM-gated spans — a hard cut sounds chopped
XFADE=${XFADE:-0.6}                # feature↔outro transition length
XFADE_T=${XFADE_T:-fadeblack}      # transition type — plain fade double-exposes the last card (person close-up) with the logo
REVEAL_D=${REVEAL_D:-0.35}         # max reveal fade length (shrinks to fit a shorter pause)
REVEAL_GAP=${REVEAL_GAP:-0.05}     # finish appearing this long before the next sentence starts
REVEAL_LEAD=${REVEAL_LEAD:-0.30}   # fallback lead — used only when no pause was found (char-count proportion)
SIL_DB=${SIL_DB:--37}              # sentence-boundary silence threshold (dB)
SIL_MIN=${SIL_MIN:-0.16}           # sentence-boundary minimum silence length (s)
ZOOM_SPAN=${ZOOM_SPAN:-0.035}      # total Ken Burns zoom span per card (3.5%)
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
KB_ZOOM_MIN=${KB_ZOOM_MIN:-1.06}   # pan base scale floor (cards.tsv pan= option)
KB_ZOOM_MAX=${KB_ZOOM_MAX:-1.35}   # pan base scale ceiling — travel = W(z-1)
PAN_Z=${PAN_Z:-1.12}               # when pan= gives no scale

rm -rf work && mkdir -p work
# Delete the old build's subtitles and burned-in copy first — rebuilding with SUB=0 while the
# previous subs.srt survives publishes mistimed subtitles (publish copies on file existence alone)
rm -f subs.srt subs.ass reel-sub.mp4
REPORT=build-report.txt
: > "$REPORT"
WARN=0
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
#   joined asset (outro)     straight into xfade  → exact match. ffmpeg dies otherwise
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
while IFS=$'\t' read -r -u 3 IDX SRC TARGET ZDIR OPTS; do
  [ -z "${IDX:-}" ] && continue
  N=$((N+1))

  # ── Card options (column 5) — sync / subs / pan. An unknown key is a failure (silently ignored
  #    typos ship a filmed card missing sync 0.4s out of step, and only eyes would catch it).
  SYNC=0; SUBSF=""; PAN=""; PZ="$PAN_Z"
  if [ -n "${OPTS:-}" ]; then
    IFS=',' read -ra OARR <<< "$OPTS"
    for KV in "${OARR[@]}"; do
      [ -z "$KV" ] && continue
      case "$KV" in
        sync=1) SYNC=1 ;;
        sync=0) SYNC=0 ;;
        subs=*) SUBSF="${KV#subs=}"; [ -f "$SUBSF" ] || { say "✗ card $IDX: subs file missing — $SUBSF"; exit 1; } ;;
        pan=*)  PAN="${KV#pan=}"; case "$PAN" in *:*) PZ="${PAN#*:}"; PAN="${PAN%%:*}";; esac
                case "$PAN" in l2r|r2l|u2d|d2u) : ;; *) say "✗ card $IDX: unknown pan direction — $PAN (l2r|r2l|u2d|d2u)"; exit 1;; esac
                PZ=$(awk -v z="$PZ" -v lo="$KB_ZOOM_MIN" -v hi="$KB_ZOOM_MAX" 'BEGIN{if(z<lo)z=lo; if(z>hi)z=hi; printf "%.3f", z}') ;;
        *) say "✗ card $IDX: unknown cards.tsv column-5 option — $KV"; exit 1 ;;
      esac
    done
  fi
  # A filmed card (sync) gets no margins — with pre-roll the picture runs from 0s while the sound alone lags 0.4s.
  if [ "$SYNC" -eq 1 ]; then CPRE=0; CPOST=0; CMIN=0; else CPRE=$PRE; CPOST=$POST; CMIN=$MIN_DUR; fi

  # If this card opens a chapter, note its absolute start frame — TOTF doesn't include this card
  # yet, so it is exactly this card's start. Step 10's bgm.tsv uses the same value.
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
      *.mp4|*.mov|*.m4v|*.webm)
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
  ZLAST=$(( FRAMES > 1 ? FRAMES - 1 : 1 ))
  ZD="${ZDIR:-auto}"
  if [ "$ZD" = "auto" ]; then if [ $((N % 2)) -eq 1 ]; then ZD=in; else ZD=out; fi; fi
  if [ "$ZD" = "none" ]; then
    # No Ken Burns — a card whose picture already moves, like filmed footage. It doesn't scale the source (scale=ZB) either.
    FILT+="${CUR}format=yuv420p[vout]"
  elif [ -n "$PAN" ]; then
    # Pan — z stays fixed and the window travels one direction. Travel = W(z-1) (horizontal) / H(z-1) (vertical).
    case "$PAN" in
      l2r) PX="(iw-iw/zoom)*on/$ZLAST";     PY="ih/2-(ih/zoom/2)" ;;
      r2l) PX="(iw-iw/zoom)*(1-on/$ZLAST)"; PY="ih/2-(ih/zoom/2)" ;;
      u2d) PX="iw/2-(iw/zoom/2)";           PY="(ih-ih/zoom)*on/$ZLAST" ;;
      d2u) PX="iw/2-(iw/zoom/2)";           PY="(ih-ih/zoom)*(1-on/$ZLAST)" ;;
    esac
    ZD="pan:$PAN@$PZ"
    FILT+="${CUR}scale=$ZB:flags=lanczos,zoompan=z='$PZ':x='$PX':y='$PY':d=1:s=${W}x${H}:fps=$FPS,format=yuv420p[vout]"
  else
    if [ "$ZD" = "out" ]; then ZEXPR="1+$ZOOM_SPAN*(1-on/$ZLAST)"
    else ZEXPR="1+$ZOOM_SPAN*on/$ZLAST"; fi
    FILT+="${CUR}scale=$ZB:flags=lanczos,zoompan=z='$ZEXPR':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=$FPS,format=yuv420p[vout]"
  fi
  ffmpeg -y -v error "${INS[@]}" -filter_complex "$FILT" -map "[vout]" \
    -frames:v "$FRAMES" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p "work/v$IDX.mp4"

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
    for ((j=0; j<M; j++)); do
      if [ "$j" -eq 0 ]; then ST=$(awk -v cs="$CS" -v p="$CPRE" 'BEGIN{s=p-0.15; if(s<0)s=0; printf "%.3f", cs+s}')
      else ST=$(awk -v cs="$CS" -v p="$CPRE" -v b="${BARR[$((j-1))]}" 'BEGIN{printf "%.3f", cs+p+b}'); fi
      if [ "$j" -lt $((M-1)) ]; then EN=$(awk -v cs="$CS" -v p="$CPRE" -v b="${BARR[$j]}" 'BEGIN{printf "%.3f", cs+p+b-0.06}')
      else EN=$(awk -v cs="$CS" -v p="$CPRE" -v l="$L" -v d="$D" 'BEGIN{e=p+l+0.45; if(e>d)e=d; printf "%.3f", cs+e}'); fi
      TXT=$(printf '%s' "${SARR[$j]}" | sed 's/[{}\\]//g')
      if [ -n "$TXT" ]; then
        printf 'Dialogue: 0,%s,%s,Sub,,0,0,0,,{\\fad(160,120)}%s\n' "$(asstime "$ST")" "$(asstime "$EN")" "$TXT" >> work/subs.body
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
        printf 'Dialogue: 0,%s,%s,Sub,,0,0,0,,{\\fad(160,120)}%s\n' "$(asstime "$ST")" "$(asstime "$EN")" "$FT" >> work/subs.body
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
  awk -F'\t' -v fps="$FPS" '
    function ts(v,   h, m, s) { s = int(v); m = int(s/60); s -= m*60; h = int(m/60); m -= h*60;
      return h ? sprintf("%d:%02d:%02d", h, m, s) : sprintf("%02d:%02d", m, s) }
    { sec = int($1 / fps); printf "%s\t%s\n", ts(sec), $2; secs[NR] = sec; n = NR }
    END {
      bad = 0
      if (secs[1] != 0) { printf "✗ 첫 챕터가 %s 다 — 00:00 이어야 한다\n", ts(secs[1]) > "/dev/stderr"; bad = 1 }
      if (n < 3) { printf "✗ 챕터 %d개 — 유튜브는 3개 이상을 요구한다\n", n > "/dev/stderr"; bad = 1 }
      for (i = 2; i <= n; i++) if (secs[i] - secs[i-1] < 10) {
        printf "✗ %s → %s 간격 %ds — 10초 미만이다\n", ts(secs[i-1]), ts(secs[i]), secs[i]-secs[i-1] > "/dev/stderr"; bad = 1 }
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
ffmpeg -y -v error -i work/narration.wav -stream_loop -1 -i bgm.wav $SFXIN -filter_complex "
  [0:a]aformat=channel_layouts=stereo,asplit=2[vo_key][vo_raw];
  ${SFXIN:+[2:a]aformat=channel_layouts=stereo[sfxa];}
  $VOMIX
  [1:a]atrim=0:$NT,asetpts=PTS-STARTPTS,volume=$BGM_VOL,
       afade=t=in:st=0:d=1.2,afade=t=out:st=$FOUT:d=2.2$BGMGATE[bgv];
  [bgv][vo_key]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=$DUCK_RELEASE:makeup=1[duck];
  [vo_mix][duck]amix=inputs=2:duration=first:dropout_transition=0,
       loudnorm=I=-14:TP=-1.0:LRA=11,aresample=48000[out]
" -map "[out]" -ac 2 -ar 48000 work/mix.wav

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
  say "── subtitles: ${SRTN} lines (burn-in subs.ass / publish subs.srt) / font $SUB_FONT"
fi

# ── 12) Render + outro splice (no subtitles over the outro) — never -shortest (same as v2)
#      Subtitles go up as a separate file by default, so **the clean master is reel.mp4**. The burn-in
#      is a separate artifact for platforms with no subtitle-file path (IG Reels); it isn't a
#      re-encode of reel.mp4 but a second pass from the same source — no second-generation encoding,
#      both files are first-generation.
ENC=(-c:v libx264 -profile:v high -level 4.1 -preset slow -crf 19 -pix_fmt yuv420p
     -g $((FPS*2)) -keyint_min "$FPS" -sc_threshold 0 -r "$FPS"
     -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart)
OFF=""
[ -f "$OUTRO_ASSET" ] && OFF=$(awk -v t="$VT" -v x="$XFADE" 'BEGIN{printf "%.6f", t-x}')

render() {                          # $1=output file  $2=subtitle filter (empty string = no burn-in)
  local OUT="$1" SF="${2:-}" VSRC="[0:v]"
  [ -n "$SF" ] && VSRC="[vsub]"
  if [ -f "$OUTRO_ASSET" ]; then
    ffmpeg -y -v error -i work/video.mp4 -i work/mix.wav -i "$OUTRO_ASSET" -filter_complex "
      ${SF:+[0:v]$SF[vsub];}
      ${VSRC}[2:v]xfade=transition=$XFADE_T:duration=$XFADE:offset=$OFF[v];
      [1:a][2:a]acrossfade=d=$XFADE:c1=tri:c2=tri[a]
    " -map "[v]" -map "[a]" "${ENC[@]}" "$OUT"
  elif [ -n "$SF" ]; then
    ffmpeg -y -v error -i work/video.mp4 -i work/mix.wav -filter_complex "[0:v]$SF[v]" \
      -map "[v]" -map 1:a "${ENC[@]}" "$OUT"
  else
    ffmpeg -y -v error -i work/video.mp4 -i work/mix.wav -map 0:v -map 1:a "${ENC[@]}" "$OUT"
  fi
}

render reel.mp4 ""
if [ -f "$OUTRO_ASSET" ]; then say "── outro splice: xfade ${XFADE_T} ${XFADE}s @ ${OFF}s"
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
[ -f format.env ] && say "── 캔버스: 선언 ${W}x${H} · 실측 ${RDIM}"

# Cover = the moment everything up to the hero stat has appeared (an auto-picked frame fails to carry
# the hook — per the cover-optimization research)
# Pull it from the clean copy — a subtitle over the thumbnail collides with the cover copy
ffmpeg -y -v error -ss "${COVER_TS:-3.2}" -i reel.mp4 -frames:v 1 -q:v 2 cover.jpg
[ "$WARN" -eq 1 ] && say "── warnings present: check the ⚠ items above (regeneration advisories don't block the build)"
say "── done"
