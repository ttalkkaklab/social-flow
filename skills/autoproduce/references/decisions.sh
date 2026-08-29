#!/usr/bin/env bash
# Episode decision log reader — .work/decisions.tsv → what was chosen, and what it replaced.
#
# Usage:
#   decisions.sh <decisions.tsv>            current decisions (superseded ones folded in)
#   decisions.sh <decisions.tsv> --all      full history, in the order it was written
#   decisions.sh <decisions.tsv> --check    format and category check only, no output
#
# Line format (tab-separated; # comments and blank lines ignored):
#   stage <TAB> category <TAB> subject <TAB> selected <TAB> reason
#
# The key is the (category, subject) pair, not the category alone — one episode picks an engine
# for several shots, and those are different decisions, not revisions of each other. The last
# line for a pair is the current one; earlier lines for the same pair are what it replaced.
#
# The convention's source of truth is decision-log.md, in this directory.
#
# Exit codes — read literally:
#   0  ok
#   1  an unknown category, or a line without all five columns
#   3  input error (file missing, no path given)
set -euo pipefail

MODE="current"
FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --all)   MODE="all";   shift ;;
    --check) MODE="check"; shift ;;
    -*)      echo "unknown option: $1" >&2; exit 3 ;;
    *)       FILE="$1"; shift ;;
  esac
done

[ -n "$FILE" ] || { echo "usage: decisions.sh <decisions.tsv> [--all|--check]" >&2; exit 3; }
[ -f "$FILE" ] || { echo "decisions file missing: $FILE" >&2; exit 3; }

awk -F'\t' -v mode="$MODE" '
  function trim(s) { gsub(/^[ \t\r]+|[ \t\r]+$/, "", s); return s }

  BEGIN {
    # decision-log.md is the source of truth for this list — keep the two in step.
    split("engine_selection image_engine voice_selection music_source format_selection " \
          "tier fallback scope publish_target approval_policy", cats, " ")
    for (i in cats) known[cats[i]] = 1
    bad = 0; n = 0
  }

  /^[ \t]*#/ { next }
  trim($0) == "" { next }

  {
    if (NF < 5) {
      printf "!! line %d has %d columns, needs 5 (stage/category/subject/selected/reason)\n", NR, NF
      bad = 1; next
    }
    stage = trim($1); cat = trim($2); subj = trim($3); sel = trim($4); why = trim($5)
    if (!(cat in known)) {
      printf "!! line %d unknown category: %s\n", NR, cat
      bad = 1; next
    }
    n++
    order[n] = NR
    f_stage[n] = stage; f_cat[n] = cat; f_subj[n] = subj; f_sel[n] = sel; f_why[n] = why
    key = cat SUBSEP subj
    seen[key]++
    latest[key] = n           # the last line for a pair is the current decision
  }

  END {
    if (bad) {
      print "Decision log unreadable — fix the !! lines above (decision-log.md has the format)."
      exit 1
    }
    if (mode == "check") { printf "decisions: %d line(s), format ok\n", n; exit 0 }
    if (n == 0) { print "No decisions recorded for this episode."; exit 0 }

    if (mode == "all") {
      print "Decision history (in the order it was written)"
      printf "%-11s %-18s %-30s %s\n", "stage", "category", "subject", "selected"
      print  "------------------------------------------------------------------------------------------"
      for (i = 1; i <= n; i++) {
        key = f_cat[i] SUBSEP f_subj[i]
        mark = (latest[key] == i && seen[key] > 1) ? " (current)" : \
               (latest[key] != i ? " (superseded)" : "")
        printf "%-11s %-18s %-30s %s%s\n", f_stage[i], f_cat[i], f_subj[i], f_sel[i], mark
        printf "%13s%s\n", "", f_why[i]
      }
      exit 0
    }

    print "Decisions on this episode"
    printf "%-11s %-18s %-30s %s\n", "stage", "category", "subject", "selected"
    print  "------------------------------------------------------------------------------------------"
    for (i = 1; i <= n; i++) {
      key = f_cat[i] SUBSEP f_subj[i]
      if (latest[key] != i) continue                   # only the current line per pair
      revised = (seen[key] > 1) ? "  · revised (" (seen[key] - 1) " earlier)" : ""
      printf "%-11s %-18s %-30s %s%s\n", f_stage[i], f_cat[i], f_subj[i], f_sel[i], revised
      printf "%13s%s\n", "", f_why[i]
    }
    printf "\n%d decision(s), %d line(s). --all shows what was replaced.\n", length(latest), n
  }
' "$FILE"
