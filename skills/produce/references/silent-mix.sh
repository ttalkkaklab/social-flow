#!/usr/bin/env bash
set -euo pipefail
INPUT=${1:?silent narration WAV}; OUTPUT=${2:?output WAV}; BED=${3:-}
check_silent() {
  local PEAK
  PEAK=$(ffmpeg -hide_banner -nostats -i "$1" -af astats=metadata=0:reset=0 -f null - 2>&1 | awk '/Peak level dB:/ {print $NF}' | sort -u)
  [ "$PEAK" = "-inf" ] || { echo "Silent mix refuses nonzero or unmeasurable audio: $1" >&2; return 1; }
}
check_silent "$INPUT"
[ -z "$BED" ] || [ ! -f "$BED" ] || check_silent "$BED"
ffmpeg -y -v error -i "$INPUT" -ar 48000 -ac 2 -c:a pcm_s16le "$OUTPUT"
