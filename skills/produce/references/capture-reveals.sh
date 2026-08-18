#!/usr/bin/env bash
# Captures a card's reveal states "with none missing" — nobody picks how many by hand.
#
#   ?reveal=k makes only groups up to k opaque. Once k passes the last group the picture stops
#   changing, so shooting with k increasing, the point where the output is byte-identical to the
#   previous one is the state count N.
#   (Reading rev= from document.title isn't an option — --dump-dom gives empty output on this Chrome.)
#
#   Hand-picking which states to shoot always ends in an accident: the first v4 shot only r1/r2/r4 on
#   a 4-bullet card, so 2 bullets appeared at once in one transition and the 3-bullet frame didn't
#   exist at all.
#
# Usage: capture-reveals.sh <idx> <URL (no reveal=)> <output prefix> [alpha 0|1] [max probe 12]
#   e.g. capture-reveals.sh 21 "file://…/reel.html?i=21&alpha=1&scrim=1&dim=1" cards/a21r 1
#        → captures cards/a21r0.png … cards/a21r4.png + records "21<TAB>5" in cards/reveals.tsv
#
# Output: the state count N on stdout. Updates idx<TAB>N in REVEALS_TSV (default
#         <the prefix's directory>/reveals.tsv). When that file exists, build-reel.sh runs the strong
#         check for "was every state used through the last one".
set -euo pipefail

IDX="${1:?usage: capture-reveals.sh <idx> <URL> <output prefix> [alpha] [max]}"
URL="${2:?URL (do not include a reveal= parameter)}"
PREFIX="${3:?output prefix — e.g. cards/a21r}"
ALPHA="${4:-0}"
MAXK="${5:-12}"

case "$URL" in *reveal=*) echo "✗ the URL must not contain reveal= — this script appends it" >&2; exit 1;; esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CAP="$HERE/capture-frames.sh"
[ -x "$CAP" ] || { echo "✗ capture-frames.sh missing: $CAP" >&2; exit 1; }

OUTDIR="$(dirname "$PREFIX")"; mkdir -p "$OUTDIR"
TSV="${REVEALS_TSV:-$OUTDIR/reveals.tsv}"
SEP=$([ "${URL#*\?}" = "$URL" ] && echo "?" || echo "&")

N=0
for ((k=0; k<=MAXK; k++)); do
  F="${PREFIX}${k}.png"
  "$CAP" "${URL}${SEP}reveal=${k}" "$F" "$ALPHA" >/dev/null
  if [ "$k" -gt 0 ] && cmp -s "${PREFIX}$((k-1)).png" "$F"; then
    rm -f "$F"          # k went past the last group — the same picture as the previous state
    N=$k
    break
  fi
done
[ "$N" -gt 0 ] || { echo "✗ card $IDX: the state keeps changing all the way to step ${MAXK} — check the template's rg assignment" >&2; exit 1; }

touch "$TSV"
awk -F'\t' -v i="$IDX" '$1!=i' "$TSV" > "$TSV.tmp"
printf '%s\t%s\n' "$IDX" "$N" >> "$TSV.tmp"
sort -k1,1n "$TSV.tmp" > "$TSV" && rm -f "$TSV.tmp"

echo "$N"
