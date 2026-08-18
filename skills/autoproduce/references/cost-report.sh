#!/usr/bin/env bash
# Generation cost tally — tally.tsv (what was used, how much) × prices.tsv (unit prices) → report
#
# Usage:
#   cost-report.sh <tally.tsv> [--cap <USD>] [--prices <prices.tsv>]
#
# tally.tsv (tab-separated; comments # and blank lines are ignored):
#   key <TAB> quantity <TAB> memo
#   e.g. image.gpt-image-2.high	1	storyboard: cover background scene-1
#       image.local	3	storyboard: points backgrounds scene-2~4
#       veo.lite.1080p	8	produce: b-roll a1 — 8s generated, 4s used
#       tts.local	0.412	produce: narration, 412 chars
#       music.lyria-clip	1	produce: BGM 30s
#
# **The quantity is whatever prices.tsv's unit column says** — an amount in that
#   unit, not a count. tts.* is per 1,000 characters, so 412 chars is 0.412.
#   Write 412 and the line is off by 1,000x (invisible on local at $0, but on
#   the gemini channel it shows up as the actual bill).
#   veo.* is **generated length** — generate 8s and use only 4s, still write 8
#   (1080p is 8s-only). seedance.* is the requested seconds as-is. Put the
#   measured completion_tokens in the memo column.
#
# Prefix the memo column with `storyboard:` / `produce:` — the report table
# then reads per stage. The conventions' source of truth is cost-tally.md.
#
# Exit codes — read literally:
#   0  ok (and within the cap, if one was given)
#   1  verdict unavailable — an unknown key, or a price still unconfirmed (?). **Never pass it through as $0**
#   2  over the cap
#   3  input error (file missing, format broken)
#
# The same script serves the pre-spend estimate and the post-hoc report — if
# the estimate and the bill come from different calculators, the cap means
# nothing.
set -euo pipefail

SELF_DIR=$(cd "$(dirname "$0")" && pwd)
PRICES="$SELF_DIR/prices.tsv"
CAP=""
TALLY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --cap)    CAP="${2:-}"; shift 2 ;;
    --prices) PRICES="${2:-}"; shift 2 ;;
    -*)       echo "unknown option: $1" >&2; exit 3 ;;
    *)        TALLY="$1"; shift ;;
  esac
done

[ -n "$TALLY" ] || { echo "usage: cost-report.sh <tally.tsv> [--cap USD] [--prices prices.tsv]" >&2; exit 3; }
[ -f "$TALLY" ]  || { echo "tally file missing: $TALLY" >&2; exit 3; }
[ -f "$PRICES" ] || { echo "prices file missing: $PRICES" >&2; exit 3; }

awk -F'\t' -v cap="$CAP" -v pf="$PRICES" '
  function trim(s) { gsub(/^[ \t\r]+|[ \t\r]+$/, "", s); return s }

  BEGIN {
    while ((getline line < pf) > 0) {
      if (line ~ /^[ \t]*#/ || trim(line) == "") continue
      n = split(line, f, "\t")
      if (n < 3) continue
      k = trim(f[1]); price[k] = trim(f[3]); unit[k] = trim(f[2]); grade[k] = (n >= 4 ? trim(f[4]) : "")
    }
    close(pf)
    printf "Generation cost report (price SoT: %s)\n", pf
    printf "%-34s %8s %10s %12s  %s\n", "item", "qty", "unitUSD", "subtotUSD", "basis"
    printf "%s\n", "----------------------------------------------------------------------------------------"
    bad = 0; total = 0
  }

  /^[ \t]*#/ { next }
  trim($0) == "" { next }

  {
    k = trim($1); q = trim($2); memo = (NF >= 3 ? trim($3) : "")
    if (k == "") next
    if (!(k in price)) { printf "!! unknown key: %s\n", k; bad = 1; next }
    if (price[k] == "?") { printf "!! price unconfirmed: %s (%s)\n", k, grade[k]; bad = 1; next }
    if (q !~ /^[0-9]+(\.[0-9]+)?$/) { printf "!! quantity is not a number: %s <%s>\n", k, q; bad = 1; next }
    sub_ = price[k] * q
    total += sub_
    printf "%-34s %8s %10.4f %12.4f  %s%s\n", k, q, price[k], sub_, grade[k], (memo == "" ? "" : " · " memo)
  }

  END {
    printf "%s\n", "----------------------------------------------------------------------------------------"
    printf "%-34s %31.4f\n", "total", total
    if (bad) { print "Verdict unavailable — until the !! lines above are resolved, do not use this report as a cost basis."; exit 1 }
    if (cap != "") {
      printf "cap %.4f USD ", cap+0
      if (total > cap + 1e-9) { printf "→ over (%.4f USD)\n", total - cap; exit 2 }
      printf "→ within (%.4f USD to spare)\n", cap - total
    }
    exit 0
  }
' "$TALLY"
