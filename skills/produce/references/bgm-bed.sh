#!/usr/bin/env bash
# bgm-bed.sh — render the music bed the mix stage lays under the narration.
#
# Usage: bgm-bed.sh <out.wav> <length-sec> <target-LUFS> <cuelist.tsv>
#   <cuelist.tsv> : start-sec <TAB> audio-file, sorted, the first row starting at 0.
#                   One row is a single bed for the whole feature — the old behavior.
#
# Three jobs, all of which the mix stage used to get wrong or skip:
#
#   1) **Every cue is measured and gained to the same integrated loudness.** The old mix
#      multiplied whatever file the channel had by a fixed 0.28, so the gap between the voice
#      and the music was a property of the source, not a decision — measured across 11 episodes
#      the source beds ran from -4.2 to +1.0 dBTP, two of them over full scale. Setting the bed
#      to `speech - N LU` makes that gap a number the caller picks. Gain is applied as a plain
#      static `volume`, never loudnorm's dynamic mode: compressing a bed is what makes it crowd
#      the voice in the first place.
#   2) **A cue shorter than its span is crossfaded onto itself.** `-stream_loop` butt-joins the
#      last sample to the first one, and a bed that doesn't happen to end on its own downbeat
#      clicks there once per lap (measured: a 90s bed jumping 2005 -> 0 in one sample at 90.00s).
#   3) **Cue changes are crossfaded**, so a section can get its own music without a hard cut.
#
# Output is 48kHz stereo, exactly <length-sec> long, with no fades — the caller owns the head
# and tail fades because it also owns the ducking and the gate windows.
set -euo pipefail
export LC_ALL=en_US.UTF-8

OUT="${1:?usage: bgm-bed.sh <out.wav> <length-sec> <target-LUFS> <cuelist.tsv>}"
LEN="${2:?length in seconds}"
TARGET="${3:?target integrated LUFS}"
CUES="${4:?cue list tsv}"

LOOP_XF=${BGM_LOOP_XF:-2.0}        # self-loop crossfade for a cue shorter than its span
CUE_XF=${BGM_CUE_XF:-2.0}          # crossfade between two different cues
TP_CEIL=${BGM_TP_CEIL:--1.0}       # the bed alone never goes above this true peak

WORK=$(dirname "$OUT")/bed.work
rm -rf "$WORK"; mkdir -p "$WORK"

dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

# Integrated loudness and true peak in one analysis pass. loudnorm's JSON is on stderr.
measure() {
  ffmpeg -hide_banner -nostats -v info -i "$1" -af loudnorm=print_format=json -f null - 2>&1 \
    | tr -d ' \t"' | awk -F: '$1=="input_i"{gsub(/,/,"",$2); i=$2} $1=="input_tp"{gsub(/,/,"",$2); t=$2} END{print i, t}'
}

# render_seg <src> <length> <out> — one cue, gained and stretched to exactly <length>.
render_seg() {
  local SRC="$1" L="$2" O="$3" D I TP G XF N i FC MIX
  D=$(dur "$SRC")
  read -r I TP <<< "$(measure "$SRC")"
  case "$I" in ''|*[!0-9.+-]*) echo "✗ bgm-bed: could not measure $SRC" >&2; exit 1;; esac
  awk -v i="$I" 'BEGIN{exit !(i > -60)}' \
    || { echo "✗ bgm-bed: $SRC is silent (integrated ${I} LUFS)" >&2; exit 1; }
  # Gain to the target, then pull back further if that would push the bed's own peak over the ceiling.
  G=$(awk -v t="$TARGET" -v i="$I" -v tp="$TP" -v c="$TP_CEIL" \
        'BEGIN{g=t-i; h=c-tp; if(g>h)g=h; printf "%.2f", g}')

  if awk -v d="$D" -v l="$L" 'BEGIN{exit !(d >= l)}'; then
    ffmpeg -y -v error -i "$SRC" \
      -af "atrim=0:$L,asetpts=PTS-STARTPTS,volume=${G}dB,aresample=48000" \
      -ac 2 -ar 48000 -c:a pcm_s16le "$O"
    echo "  cue $(basename "$SRC"): ${I} LUFS / ${TP} dBTP → ${G}dB, ${L}s (no loop)"
    return
  fi

  # Shorter than its span: lay copies end to end with a crossfade. The crossfade can't eat more
  # than a third of the source or the lap starts before the previous one has said anything.
  XF=$(awk -v x="$LOOP_XF" -v d="$D" 'BEGIN{m=d/3; if(x>m)x=m; printf "%.3f", x}')
  N=$(awk -v d="$D" -v l="$L" -v x="$XF" 'BEGIN{n=1; t=d; while(t<l){t+=d-x; n++} print n}')
  [ "$N" -le 20 ] || echo "  ⚠ $(basename "$SRC") is ${D}s under a ${L}s span — ${N} laps. A longer bed sounds less repetitive." >&2
  local IN=(); FC=""; MIX=""
  for ((i=0; i<N; i++)); do
    IN+=(-i "$SRC")
    FC+="[$i:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[c$i];"
  done
  MIX="[c0]"
  for ((i=1; i<N; i++)); do
    FC+="${MIX}[c$i]acrossfade=d=$XF:c1=tri:c2=tri[m$i];"; MIX="[m$i]"
  done
  ffmpeg -y -v error "${IN[@]}" -filter_complex \
    "${FC}${MIX}atrim=0:$L,asetpts=PTS-STARTPTS,volume=${G}dB[o]" \
    -map "[o]" -ac 2 -ar 48000 -c:a pcm_s16le "$O"
  echo "  cue $(basename "$SRC"): ${I} LUFS / ${TP} dBTP → ${G}dB, ${D}s ×${N} crossfaded (${XF}s) → ${L}s"
}

# ── Read the cue list, turn starts into spans.
STARTS=(); FILES=()
while IFS=$'\t' read -r S F || [ -n "${S:-}" ]; do
  [ -z "${S:-}" ] && continue
  [ -f "$F" ] || { echo "✗ bgm-bed: cue file missing — $F" >&2; exit 1; }
  STARTS+=("$S"); FILES+=("$F")
done < "$CUES"
NC=${#FILES[@]}
[ "$NC" -ge 1 ] || { echo "✗ bgm-bed: $CUES has no rows" >&2; exit 1; }
awk -v s="${STARTS[0]}" 'BEGIN{exit !(s < 0.001)}' \
  || { echo "✗ bgm-bed: the first cue starts at ${STARTS[0]}s — it has to start at 0" >&2; exit 1; }

if [ "$NC" -eq 1 ]; then
  render_seg "${FILES[0]}" "$LEN" "$OUT"
  rm -rf "$WORK"; exit 0
fi

# Each cue is rendered CUE_XF longer than its span so it has something to hand over. Chaining
# acrossfade eats exactly that overlap back, which puts every boundary on its own cue start.
SEGS=()
for ((k=0; k<NC; k++)); do
  if [ $((k+1)) -lt "$NC" ]; then NEXT="${STARTS[$((k+1))]}"; else NEXT="$LEN"; fi
  SPAN=$(awk -v a="${STARTS[$k]}" -v b="$NEXT" -v x="$CUE_XF" 'BEGIN{printf "%.3f", b-a+x}')
  awk -v s="$SPAN" -v x="$CUE_XF" 'BEGIN{exit !(s > x)}' \
    || { echo "✗ bgm-bed: cue $((k+1)) is shorter than the ${CUE_XF}s crossfade" >&2; exit 1; }
  render_seg "${FILES[$k]}" "$SPAN" "$WORK/seg$k.wav"
  SEGS+=("$WORK/seg$k.wav")
done

IN=(); FC=""; MIX="[0:a]"
for ((k=0; k<NC; k++)); do IN+=(-i "${SEGS[$k]}"); done
for ((k=1; k<NC; k++)); do
  FC+="${MIX}[$k:a]acrossfade=d=$CUE_XF:c1=tri:c2=tri[m$k];"; MIX="[m$k]"
done
ffmpeg -y -v error "${IN[@]}" -filter_complex "${FC}${MIX}atrim=0:$LEN,asetpts=PTS-STARTPTS[o]" \
  -map "[o]" -ac 2 -ar 48000 -c:a pcm_s16le "$OUT"
echo "  ${NC} cues joined with a ${CUE_XF}s crossfade → ${LEN}s"
rm -rf "$WORK"
