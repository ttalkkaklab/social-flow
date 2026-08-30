#!/usr/bin/env bash
# cut-screencast.sh — turns one window of a screen recording into one card visual.
#   scenes-schema §screencast splice · produce §3.7.
#
#   A screen recording is landscape and a short is portrait, so a recording can't be dropped
#   into a card the way a filmed clip can. This cuts the window the scene asks for, crops to
#   the region that carries the point, and fits the result onto the episode canvas over the
#   ink background — the same shape build-reel.sh already plays as an `@clip` visual (play
#   once, freeze on the last frame). The builder itself needs no change.
#
#   The whole-episode path (build-screencast.sh) is a different thing: it owns the episode,
#   the voice is live, and the recording sits in a band with the title above it. This one is
#   a single card inside an ordinary TTS episode.
#
# Usage: cut-screencast.sh <source> <out.mp4> [--at <start>-<end>] [options]
#   --at <start>-<end>   window on the SOURCE recording's clock, seconds (12.5-19 or 12.5-19.0).
#                        Omitted, the whole file is the cut — which is the normal shape when the
#                        user recorded one file per shot, as script.md asks them to
#   --focus x:y:w:h      crop on the source frame in source pixels, before the fit.
#                        Omitted, the whole frame is fitted (readable only on wide UI)
#   --card <seconds>     the card's narration-driven duration — turns on the two length
#                        warnings below. Omitted, no length check runs
#   --canvas <WxH>       output canvas (default from format.env in the working directory,
#                        else 1080x1920)
#   --fps <n>            default from format.env, else 30
#   --bg <color>         pad colour — THEME.ink (default 0x0b1020). '#rrggbb' is accepted too
#   --keep-audio         also write <out>.wav (48k mono PCM) for the sync=1 lane.
#                        By default the clip is muted — TTS narration covers the card
#   --shrink-warn <f>    legibility threshold (default 3.0, same value as build-screencast.sh):
#                        warn when the cropped width shrinks by more than this into the canvas
#
# Output: <out.mp4> — canvas-sized, CFR, yuv420p, no audio unless --keep-audio
#         one summary line on stdout: source window, crop, fit scale, duration, frames
#
# Exit 0 ok (warnings still print) · 1 the cut can't be made · 2 usage.
set -euo pipefail
export LC_ALL=en_US.UTF-8

usage() { echo "usage: cut-screencast.sh <source> <out.mp4> [--at <start>-<end>] [--focus x:y:w:h] [--card s] [--canvas WxH] [--fps n] [--bg 0xRRGGBB] [--keep-audio] [--shrink-warn f]" >&2; exit 2; }
die()   { echo "✗ $1" >&2; exit 1; }

SRC=""; OUT=""; AT=""; FOCUS=""; CARD=""; CANVAS=""; FPS_ARG=""; BG_ARG=""; KEEP=0; SW_ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --at)          AT="${2:-}"; shift 2 ;;
    --focus)       FOCUS="${2:-}"; shift 2 ;;
    --card)        CARD="${2:-}"; shift 2 ;;
    --canvas)      CANVAS="${2:-}"; shift 2 ;;
    --fps)         FPS_ARG="${2:-}"; shift 2 ;;
    --bg)          BG_ARG="${2:-}"; shift 2 ;;
    --keep-audio)  KEEP=1; shift ;;
    --shrink-warn) SW_ARG="${2:-}"; shift 2 ;;
    -*)            usage ;;
    *)             if [ -z "$SRC" ]; then SRC="$1"; elif [ -z "$OUT" ]; then OUT="$1"; else usage; fi; shift ;;
  esac
done
[ -n "$SRC" ] && [ -n "$OUT" ] || usage
[ -f "$SRC" ] || die "source not found: $SRC"

# Canvas and fps follow the format preset like every other stage — format.env is what
# format-resolve.js wrote next to the build. Flags win over it, it wins over the portrait
# default. The flags are parsed into their own names above so sourcing can't clobber them.
if [ -f format.env ]; then . ./format.env; fi
W=${W:-1080}; H=${H:-1920}; FPS=${FPS:-30}
[ -n "$CANVAS" ] && { W=${CANVAS%x*}; H=${CANVAS#*x}; }
[ -n "$FPS_ARG" ] && FPS="$FPS_ARG"
# Same precedence for the legibility thresholds: flag → format.env → inline default. Assigned
# before the source, an inline default would win and the preset could never move them.
SHRINK_WARN=${SW_ARG:-${SHRINK_WARN:-3.0}}
BLOWUP_WARN=${BLOWUP_WARN:-1.5}
case "${W}x${H}" in *[!0-9x]*|x*|*x) die "--canvas wants WxH, got \"$CANVAS\"" ;; esac
BG=${BG_ARG:-${BG:-0x0b1020}}
BG="${BG#\#}"; BG="${BG#0x}"; BG="0x${BG}"          # '#rrggbb' and '0xrrggbb' both land here

probe() { ffprobe -v error -select_streams v:0 -show_entries "stream=$1" -of csv=p=0 "$SRC" | head -1; }
SW=$(probe width); SH=$(probe height)
[ -n "$SW" ] && [ -n "$SH" ] || die "$SRC has no video stream ffprobe can read"
SRC_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC" | head -1)

if [ -n "$AT" ]; then
  case "$AT" in
    *-*) START="${AT%%-*}"; END="${AT##*-}" ;;
    *)   die "--at wants <start>-<end> in seconds, got \"$AT\"" ;;
  esac
  awk -v a="$START" -v b="$END" 'BEGIN{exit !(a ~ /^[0-9]+(\.[0-9]+)?$/ && b ~ /^[0-9]+(\.[0-9]+)?$/ && b > a)}' \
    || die "--at \"$AT\" — both ends must be seconds and the end must be past the start"
  awk -v e="$END" -v d="${SRC_DUR:-0}" 'BEGIN{exit !(d <= 0 || e <= d + 0.05)}' \
    || die "--at ends at ${END}s but $SRC is only ${SRC_DUR}s long"
  DUR=$(awk -v a="$START" -v b="$END" 'BEGIN{printf "%.3f", b - a}')
else
  # One file per shot — the whole recording is the cut.
  [ -n "$SRC_DUR" ] || die "$SRC has no readable duration — pass --at to say which window to take"
  START=0; END="$SRC_DUR"; DUR=$(awk -v d="$SRC_DUR" 'BEGIN{printf "%.3f", d}')
fi

# ── crop ────────────────────────────────────────────────────────────────────
# The crop is what makes a screen recording readable in portrait: a 1920-wide frame fitted
# into a 1080-wide canvas is a 1.78x shrink before the letterbox, and the letterbox eats the
# height. Cropping to the panel that carries the point is the difference between a card the
# audience reads and a card they scroll past.
CW=$SW; CH=$SH; CROP_F=""
if [ -n "$FOCUS" ]; then
  IFS=: read -r FX FY FW FH REST <<EOF
$FOCUS
EOF
  for N in "${FX:-}" "${FY:-}" "${FW:-}" "${FH:-}"; do
    case "$N" in ''|*[!0-9]*) die "--focus wants x:y:w:h in source pixels, got \"$FOCUS\"" ;; esac
  done
  [ -z "${REST:-}" ] || die "--focus wants x:y:w:h in source pixels, got \"$FOCUS\""
  [ $((FX + FW)) -le "$SW" ] && [ $((FY + FH)) -le "$SH" ] \
    || die "--focus $FOCUS runs outside the ${SW}x${SH} source frame"
  [ "$FW" -ge 16 ] && [ "$FH" -ge 16 ] || die "--focus region ${FW}x${FH} is too small to read"
  CW=$FW; CH=$FH; CROP_F="crop=${FW}:${FH}:${FX}:${FY},"
fi

# ── fit ─────────────────────────────────────────────────────────────────────
# Fit inside the canvas, keep the aspect, pad the rest with ink. `decrease` shrinks the target
# box to the source's aspect — it does not stop an upscale, so both directions get a warning:
# too small and the text can't be read, too enlarged and it goes soft.
SCALE=$(awk -v cw="$CW" -v ch="$CH" -v w="$W" -v h="$H" 'BEGIN{s=w/cw; t=h/ch; printf "%.4f", (s<t?s:t)}')
SHRINK=$(awk -v s="$SCALE" 'BEGIN{printf "%.2f", (s<1 ? 1/s : 1)}')
WARN=0
awk -v s="$SHRINK" -v t="$SHRINK_WARN" 'BEGIN{exit !(s > t)}' && {
  echo "⚠ the picture shrinks ${SHRINK}x on the way into the canvas — screen text this small is unreadable on a phone. Crop to the panel that matters with --focus" >&2; WARN=1; }
awk -v s="$SCALE" -v t="$BLOWUP_WARN" 'BEGIN{exit !(s > t)}' && {
  echo "⚠ the crop is blown up ${SCALE}x to fill the canvas — screen text goes soft past about 1.5x. Record at a higher resolution, or take a wider --focus region" >&2; WARN=1; }

VF="${CROP_F}scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:${BG},setsar=1,fps=${FPS},format=yuv420p"

mkdir -p "$(dirname "$OUT")"
# -ss before -i seeks by keyframe and then decodes forward to the exact time because the
# output is re-encoded — fast and frame-accurate both. -t (not -to) so the length is the
# window's own length regardless of where the seek landed.
ffmpeg -y -v error -ss "$START" -i "$SRC" -t "$DUR" \
  -vf "$VF" -r "$FPS" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -an "$OUT" \
  || die "ffmpeg could not cut $SRC"

if [ "$KEEP" = 1 ]; then
  # The sync=1 lane needs the window's own sound as PCM, pulled from the same window so the
  # card's length and its picture come from one cut.
  ffmpeg -y -v error -ss "$START" -i "$SRC" -t "$DUR" -vn -ar 48000 -ac 1 "${OUT%.*}.wav" \
    || die "the source has no audio track to keep — drop --keep-audio, or the card can't run on sync=1"
fi

OUT_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" | head -1)
FRAMES=$(awk -v d="$OUT_DUR" -v f="$FPS" 'BEGIN{printf "%d", d * f + 0.5}')

if [ -n "$CARD" ]; then
  # An `@clip` visual plays once and freezes on its last frame. Longer than the card and the
  # tail is never seen; much shorter and the card sits on a still while the voice runs on.
  awk -v c="$OUT_DUR" -v k="$CARD" 'BEGIN{exit !(c > k + 0.15)}' && {
    echo "⚠ the clip is ${OUT_DUR}s but the card is ${CARD}s — the last $(awk -v c="$OUT_DUR" -v k="$CARD" 'BEGIN{printf "%.1f", c-k}')s never plays. Tighten --at or give the scene another sentence" >&2; WARN=1; }
  awk -v c="$OUT_DUR" -v k="$CARD" 'BEGIN{exit !(c < k - 1.0)}' && {
    echo "⚠ the clip is ${OUT_DUR}s against a ${CARD}s card — the picture freezes for the last $(awk -v c="$OUT_DUR" -v k="$CARD" 'BEGIN{printf "%.1f", k-c}')s. Fine on a card that ends on a held result, wrong on one that should keep moving" >&2; WARN=1; }
fi

[ "$KEEP" = 1 ] && AUDIO=" · audio kept" || AUDIO=""
# The warnings above are on stderr; the summary says whether there were any, so a caller
# reading only stdout still knows to go look.
[ "$WARN" = 1 ] && FLAG=" · see the warnings above" || FLAG=""
echo "✓ $(basename "$OUT") — ${START}s+${DUR}s of $(basename "$SRC") (${SW}x${SH}${FOCUS:+ → focus ${CW}x${CH}}) fitted ${SCALE}x into ${W}x${H} · ${OUT_DUR}s · ${FRAMES} frames${AUDIO}${FLAG}"
exit 0
