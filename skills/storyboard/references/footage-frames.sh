#!/usr/bin/env bash
# footage-frames.sh — frames to author marks against (storyboard §5.6 · footage-lane.md §4).
#
#   footage-frames.sh <storyboard dir> [s<n>]
#
# For every slides/footage/s<n>-g<k>.mp4 (one shot, or all) it writes
#   .work/footage-frames/s<n>-g<k>-0.jpg    first frame
#   .work/footage-frames/s<n>-g<k>-mid.jpg  the frame at half the clip
#   .work/footage-frames/s<n>-g<k>-end.jpg  the last frame
#   .work/footage-frames/s<n>-sheet.jpg     every group's mid frame side by side, 540-wide tiles
# and prints each clip's size, duration and frame rate. Marks are placed in canvas pixels
# (1080×1920 portrait · 1920×1080 wide) — read the coordinates off the mid frame, since the
# camera drifts across the shot and the mark has to sit on the subject for the whole cut.
# A matte (s<n>-g<k>-fg.webm) is skipped; it has no composition of its own.
# Runs on the stock macOS bash 3.2 — no associative arrays (review M2).
set -euo pipefail
DIR=${1:?usage: footage-frames.sh <storyboard dir> [s<n>]}
ONLY=${2:-}
cd "$DIR"
OUT=.work/footage-frames; mkdir -p "$OUT"
shopt -s nullglob
clips=(slides/footage/${ONLY:-s*}-g*.mp4)
[ ${#clips[@]} -gt 0 ] || { echo "no clips under slides/footage/ (${ONLY:-s*}-g*.mp4) — generate them first (footage-lane.md §3)" >&2; exit 1; }
shots=""
for c in "${clips[@]}"; do
  base=$(basename "$c" .mp4)
  read -r w h fps dur < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate:format=duration -of csv=p=0 "$c" | tr ',' ' ' | awk 'NR==1{w=$1;h=$2;f=$3} NR==2{d=$1} END{print w, h, f, d}')
  half=$(awk -v d="$dur" 'BEGIN{printf "%.3f", d/2}')
  ffmpeg -v error -y -i "$c" -frames:v 1 -q:v 2 "$OUT/$base-0.jpg"
  ffmpeg -v error -y -ss "$half" -i "$c" -frames:v 1 -q:v 2 "$OUT/$base-mid.jpg"
  ffmpeg -v error -y -sseof -0.1 -i "$c" -frames:v 1 -update 1 -q:v 2 "$OUT/$base-end.jpg"
  printf '%s  %sx%s  %s fps  %.2fs  → %s/%s-{0,mid,end}.jpg\n' "$c" "$w" "$h" "$fps" "$dur" "$OUT" "$base"
  shot=${base%%-g*}
  case " $shots " in *" $shot:$w "*) ;; *) shots="$shots $shot:$w" ;; esac
done
for entry in $shots; do
  shot=${entry%%:*}; w=${entry##*:}
  files=("$OUT"/"$shot"-g*-mid.jpg)
  n=${#files[@]}
  factor=$(awk -v w="$w" 'BEGIN{printf "%.2f", w/540}')
  if [ "$n" -eq 1 ]; then
    # ffmpeg's hstack wants two inputs or more (review H4) — a one-group shot is a single scaled tile
    ffmpeg -v error -y -i "${files[0]}" -vf scale=540:-1 -q:v 3 "$OUT/$shot-sheet.jpg"
  else
    inputs=(); filt=""; labels=""
    for i in "${!files[@]}"; do inputs+=(-i "${files[$i]}"); filt+="[$i]scale=540:-1[t$i];"; labels+="[t$i]"; done
    ffmpeg -v error -y "${inputs[@]}" -filter_complex "${filt}${labels}hstack=inputs=$n" -q:v 3 "$OUT/$shot-sheet.jpg"
  fi
  echo "$OUT/$shot-sheet.jpg  ($n group(s), mid frames, 540px tiles — canvas coordinates are ${factor}× these pixels)"
done
