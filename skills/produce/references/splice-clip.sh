#!/usr/bin/env bash
# Splices a clip into the middle of a built feature — post-processing, since build-reel.sh only joins the outro.
#
#   Usage: splice-clip.sh <workdir> <clip.mp4> <insert-time-T-seconds> [<clip2.mp4> <T2-seconds>]
#
#   Where it's used:
#     · Opening b-roll (produce §3·§6) — puts a generated video in the stretch after the cover.
#     · Body b-roll — at most 2 generated-video slots per episode (scenes-schema §broll).
#     · Series opener stinger — for channels whose profile contract places it after the hook.
#
#   With two clips, splice them **in a single run**. Split across two calls, the second one rereads
#   reel.mp4 and wipes the first splice — the input and output names are fixed.
#
#   T = the time the preceding scene ends. Read the fixed duration from that card's line in build-report.txt.
#   **Every T is on the original (reel.mp4) timeline** — don't pre-add the length an earlier clip will
#   push out. This script does the pushing.
#   Result: <workdir>/reel-spliced.mp4 · reel-sub-spliced.mp4 · subs-spliced.srt
#
# Why frame accuracy matters: subtitles are pinned to absolute times. Insert a clip and every subtitle
# after that time shifts by the clip's length; if the shift differs from the real insert length, the
# subtitles stay off for the rest of the video. So it shifts by the measured length after re-encoding
# (it doesn't trust the nominal length). With two clips, each subtitle cue shifts by **the sum of the
# measured lengths of the clips inserted before it**.
#
# The burn-in needs no shift — its subtitles are already baked into the picture. Splitting and joining
# it at the same T with the same clips preserves build-reel's ASS styling as-is (re-burning from srt
# would change the font, position and outline from the original).
set -euo pipefail
export LC_ALL=en_US.UTF-8

WORK="${1:?usage: splice-clip.sh <workdir> <clip.mp4> <T-seconds> [<clip2.mp4> <T2-seconds>]}"
shift
[ $# -ge 2 ] || { echo "✗ no (clip T) pair to insert" >&2; exit 1; }
[ $(($# % 2)) -eq 0 ] || { echo "✗ pass clips and Ts in pairs — the argument count is odd" >&2; exit 1; }

CLIPS=(); TS=()
while [ $# -ge 2 ]; do
  C="$1"; T="$2"; shift 2
  [ -f "$C" ] || { echo "✗ clip to insert missing: $C" >&2; exit 1; }
  CLIPS+=("$(cd "$(dirname "$C")" && pwd)/$(basename "$C")")
  TS+=("$T")
done
N=${#CLIPS[@]}
[ "$N" -le 2 ] || echo "⚠ $N clips — the cap is 2 generated-video slots per episode (scenes-schema §broll)" >&2

cd "$WORK"
[ -f reel.mp4 ] || { echo "✗ reel.mp4 missing — run build-reel.sh first" >&2; exit 1; }
[ -f subs.srt ] || { echo "✗ subs.srt missing" >&2; exit 1; }

# Format preset — the same contract as the three builders. Read **before** the inline defaults.
# Without this line the guard runs exactly backwards — a 1920x1080 piece that's correct in landscape
# clashes with the portrait defaults and warns every time, while the portrait stinger it was built to
# catch passes silently.
[ -f format.env ] && . ./format.env

FPS=${FPS:-30}
W=${W:-1080}; H=${H:-1920}      # canvas — the baseline for the piece-resolution assertion
STRICT_DIM=${STRICT_DIM:-0}     # 1=exit 1 on mismatch, 0=one warning line (today's behavior)
AFADE=${AFADE:-0.04}      # just enough to kill the click at the join — it doesn't touch the length
mkdir -p splice
rm -f splice/*.mp4 splice/list-*.txt 2>/dev/null || true

say() { printf '%s\n' "$*"; }

# ── 0) Sort and validate the insert times (processed in ascending time order, whatever order they came in)
for ((i = 0; i < N; i++)); do
  for ((j = 0; j < N - 1 - i; j++)); do
    if awk -v a="${TS[j]}" -v b="${TS[j+1]}" 'BEGIN{exit !(a > b)}'; then
      t=${TS[j]}; TS[j]=${TS[j+1]}; TS[j+1]=$t
      c=${CLIPS[j]}; CLIPS[j]=${CLIPS[j+1]}; CLIPS[j+1]=$c
    fi
  done
done

VDUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 reel.mp4)
say "── main part ${VDUR}s · ${N} inserts"
for ((i = 0; i < N; i++)); do
  awk -v t="${TS[i]}" -v d="$VDUR" 'BEGIN{ if (t <= 0 || t >= d) exit 1 }' \
    || { echo "✗ insert time ${TS[i]}s is outside the video's range (0~${VDUR}s)" >&2; exit 1; }
  if [ "$i" -gt 0 ]; then
    awk -v a="${TS[i-1]}" -v b="${TS[i]}" 'BEGIN{ if (b - a < 0.5) exit 1 }' \
      || { echo "✗ insert times ${TS[i-1]}s and ${TS[i]}s are too close — the piece between them is under 0.5s" >&2; exit 1; }
  fi
  say "   · $(basename "${CLIPS[i]}") → ${TS[i]}s"
done

# ── 0.5) Resolution assertion
#   `concat -c copy` joins 1920x1080 and 1080x1920 **without an error**, and ffprobe reports only the
#   first piece's resolution — it only shows up if you pull a middle frame out of the output yourself
#   [measured]. So it's measured before joining. The inserted clip carries its own resolution through,
#   because normalization (§2) doesn't scale.
VDIM=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x reel.mp4)
DIMBAD=0
if [ "$VDIM" != "${W}x${H}" ]; then
  say "⚠ reel.mp4 is ${VDIM} but the declared canvas is ${W}x${H} — format.env and the build disagree"
  DIMBAD=1
fi
for ((i = 0; i < N; i++)); do
  CDIM=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "${CLIPS[i]}")
  if [ "$CDIM" != "$VDIM" ]; then
    say "⚠ $(basename "${CLIPS[i]}") 가 ${CDIM} — 본편 ${VDIM} 과 다르다. concat 은 에러 없이 붙이고 그 구간만 다른 화면비가 된다"
    DIMBAD=1
  fi
done
if [ "$DIMBAD" = 1 ] && [ "$STRICT_DIM" = 1 ]; then
  echo "✗ resolution mismatch — STRICT_DIM=1, stopping" >&2
  exit 1
fi

ENC=(-c:v libx264 -profile:v high -level 4.1 -pix_fmt yuv420p -r $FPS -c:a aac -ar 48000 -ac 2 -b:a 192k)

# ── 1) Cut the main part at the insert times (frame-accurate — re-encoded)
#    Piece boundaries = 0 · T1 · T2 · … · end. There are (number of clips + 1) pieces.
BOUNDS=(0 "${TS[@]}" "$VDUR")
NSEG=$((N + 1))
for V in reel reel-sub; do
  [ -f "$V.mp4" ] || { say "· no $V.mp4 — skipped"; continue; }
  for ((k = 0; k < NSEG; k++)); do
    ST=${BOUNDS[k]}; EN=${BOUNDS[k+1]}
    D=$(awk -v a="$ST" -v b="$EN" 'BEGIN{printf "%.6f", b - a}')
    # Fades go only on the seams between pieces — the video's start (k=0) and end (k=NSEG-1) stay untouched
    AF=""
    [ "$k" -gt 0 ] && AF="afade=t=in:st=0:d=$AFADE"
    if [ "$k" -lt $((NSEG - 1)) ]; then
      FOUT=$(awk -v d="$D" -v f="$AFADE" 'BEGIN{printf "%.3f", d - f}')
      [ -n "$AF" ] && AF="$AF,"
      AF="${AF}afade=t=out:st=${FOUT}:d=$AFADE"
    fi
    if [ "$k" -eq 0 ]; then
      ffmpeg -y -v error -i "$V.mp4" -t "$EN" -af "$AF" "${ENC[@]}" "splice/${V}-s${k}.mp4"
    elif [ "$k" -lt $((NSEG - 1)) ]; then
      ffmpeg -y -v error -ss "$ST" -i "$V.mp4" -t "$D" -af "$AF" "${ENC[@]}" "splice/${V}-s${k}.mp4"
    else
      ffmpeg -y -v error -ss "$ST" -i "$V.mp4" -af "$AF" "${ENC[@]}" "splice/${V}-s${k}.mp4"
    fi
  done
done

# ── 2) Normalize the inserted clips to the same encoding contract (the clip keeps its own audio)
for ((i = 0; i < N; i++)); do
  CDUR_RAW=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${CLIPS[i]}")
  HAS_A=$(ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${CLIPS[i]}" | head -1)
  if [ -n "$HAS_A" ]; then
    ffmpeg -y -v error -i "${CLIPS[i]}" \
      -af "afade=t=in:st=0:d=$AFADE,afade=t=out:st=$(awk -v d="$CDUR_RAW" -v f="$AFADE" 'BEGIN{printf "%.3f", d - f}'):d=$AFADE" \
      "${ENC[@]}" "splice/clip${i}.mp4"
  else
    # Silent clip — concat only works if a silence track is attached
    say "· $(basename "${CLIPS[i]}") has no audio — filling in a silence track"
    ffmpeg -y -v error -i "${CLIPS[i]}" -f lavfi -i anullsrc=r=48000:cl=stereo \
      -shortest "${ENC[@]}" "splice/clip${i}.mp4"
  fi
done

# ── 3) Fix the shift amounts from the measured lengths (don't trust the nominal length)
SHIFTS=(); TOTAL_SHIFT=0
PIECES="pieces"
for ((i = 0; i < N; i++)); do
  S=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "splice/clip${i}.mp4")
  SHIFTS+=("$S")
  TOTAL_SHIFT=$(awk -v a="$TOTAL_SHIFT" -v b="$S" 'BEGIN{printf "%.6f", a + b}')
done
for ((k = 0; k < NSEG; k++)); do
  SD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "splice/reel-s${k}.mp4")
  PIECES="$PIECES s${k}=$(awk -v v="$SD" 'BEGIN{printf "%.3f", v}')s"
  [ "$k" -lt "$N" ] && PIECES="$PIECES + clip$((k + 1))=$(awk -v v="${SHIFTS[k]}" 'BEGIN{printf "%.3f", v}')s +"
done
say "── $PIECES"

# ── 4) Join them back up (clean and burn-in separately)
for V in reel reel-sub; do
  [ -f "splice/${V}-s0.mp4" ] || continue
  : > "splice/list-$V.txt"
  for ((k = 0; k < NSEG; k++)); do
    printf "file '%s-s%d.mp4'\n" "$V" "$k" >> "splice/list-$V.txt"
    [ "$k" -lt "$N" ] && printf "file 'clip%d.mp4'\n" "$k" >> "splice/list-$V.txt"
  done
  ffmpeg -y -v error -f concat -safe 0 -i "splice/list-$V.txt" -c copy -movflags +faststart "${V}-spliced.mp4"
  OUTD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${V}-spliced.mp4")
  say "── ${V}-spliced.mp4 ${OUTD}s (expected $(awk -v d="$VDUR" -v s="$TOTAL_SHIFT" 'BEGIN{printf "%.3f", d + s}')s)"
done

# ── 5) Subtitle shift — move each cue back by the sum of the measured lengths of the clips inserted before it
python3 - "${TS[*]}" "${SHIFTS[*]}" <<'PY'
import re, sys
TS = [float(x) for x in sys.argv[1].split()]
SH = [float(x) for x in sys.argv[2].split()]

def to_s(ts):
    h, m, rest = ts.split(':')
    s, ms = rest.split(',')
    return int(h)*3600 + int(m)*60 + int(s) + int(ms)/1000

def to_ts(v):
    if v < 0: v = 0.0
    ms = int(round(v * 1000))
    h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def shift_for(a):
    """Sum of measured lengths of inserts before cue start a — later inserts don't push this cue"""
    return sum(s for t, s in zip(TS, SH) if a >= t)

def shift_end(b):
    """Cue end b uses a different condition — no equals sign (an insert at exactly b doesn't push it).

    A cue straddling T (a < t < b) has to have its end pushed by one more insert than its start, so
    that it stretches by the clip's length. Adding the same shift_for(a) to both sides makes that cue
    disappear one insert-length early. For a cue that doesn't straddle, the two values are equal anyway.
    """
    return sum(s for t, s in zip(TS, SH) if t < b)

src = open('subs.srt', encoding='utf-8').read()
LINE = re.compile(r'^(\d\d:\d\d:\d\d,\d\d\d) --> (\d\d:\d\d:\d\d,\d\d\d)\s*$')
out, straddle, moved = [], [0]*len(TS), 0
for line in src.splitlines():
    m = LINE.match(line)
    if not m:
        out.append(line); continue
    a, b = to_s(m.group(1)), to_s(m.group(2))
    for i, t in enumerate(TS):
        if a < t < b:
            straddle[i] += 1       # a cue straddling T — the inserted clip cuts the subtitle in half
    da, db = shift_for(a), shift_end(b)
    if da or db:
        a += da; b += db; moved += 1
    out.append(f"{to_ts(a)} --> {to_ts(b)}")
open('subs-spliced.srt', 'w', encoding='utf-8').write("\n".join(out) + "\n")
print(f"── subtitles: {moved} cues shifted (total +{sum(SH):.3f}s)")
for i, t in enumerate(TS):
    print(f"   · insert at {t}s (+{SH[i]:.3f}s) — {straddle[i]} cues straddled")
if any(straddle):
    print("⚠ some subtitles straddle a T — move the insert time to a sentence boundary")
PY

# ── 5.5) Chapter shift — only when chapters.txt exists
#   It uses **the same shift_for()** as the subtitles (equals sign included). Chapters only have a
#   start time, so shift_end() isn't used. The equals sign is the policy — put a stinger at a chapter
#   boundary T and the chapter start moves **after** the stinger, which attaches the stinger to the
#   tail of the previous chapter. A viewer who clicks the chapter lands in the content, not on a
#   brand sting.
#   00:00 is protected by the `T > 0` assertion at :69-70 — insert times are greater than 0, so the
#   first chapter never moves.
if [ -f chapters.txt ]; then
python3 - "${TS[*]}" "${SHIFTS[*]}" <<'CHAPPY'
import math, sys
TS = [float(x) for x in sys.argv[1].split()]
SH = [float(x) for x in sys.argv[2].split()]

def shift_for(a):
    """Same rule as the subtitle cues — sum of measured lengths of inserts before start time a."""
    return sum(s for t, s in zip(TS, SH) if a >= t)

def to_s(ts):
    p = [int(x) for x in ts.split(':')]
    return p[0] * 3600 + p[1] * 60 + p[2] if len(p) == 3 else p[0] * 60 + p[1]

def to_ts(v):
    m, s = divmod(int(v), 60)
    h, m = divmod(m, 60)
    return f"{h:d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"

rows, moved = [], 0
for line in open('chapters.txt', encoding='utf-8'):
    line = line.rstrip('\n')
    if not line.strip():
        continue
    ts, _, label = line.partition('\t')
    a = to_s(ts.strip())
    d = shift_for(a)
    # Round up — rounding down puts the timestamp ahead of the real chapter start, and a viewer who
    # clicks there hears the tail of the previous chapter. Being 0.x seconds late beats hearing a
    # fragment of the previous line.
    b = math.ceil(a + d) if d else a
    if b != a:
        moved += 1
    rows.append((b, label))

bad = []
if rows and rows[0][0] != 0:
    bad.append(f"the first timestamp is {to_ts(rows[0][0])} — it must be 00:00")
if len(rows) < 3:
    bad.append(f"{len(rows)} chapters — YouTube requires at least 3")
for i in range(1, len(rows)):
    gap = rows[i][0] - rows[i - 1][0]
    if gap < 10:
        bad.append(f"{to_ts(rows[i-1][0])} → {to_ts(rows[i][0])} gap {gap}s — under 10 seconds")

if bad:
    sys.stderr.write("✗ after the shift the chapters break YouTube's requirements\n")
    for b in bad:
        sys.stderr.write(f"   · {b}\n")
    sys.exit(1)

with open('chapters-spliced.txt', 'w', encoding='utf-8') as f:
    for b, label in rows:
        f.write(f"{to_ts(b)}\t{label}\n")
print(f"── chapters: {moved} of {len(rows)} shifted → chapters-spliced.txt")
CHAPPY
fi

# ── 6) Duration match check — if the two copies disagree, only the subtitles end up shifted after publishing
if [ -f reel-sub-spliced.mp4 ]; then
  CD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 reel-spliced.mp4)
  SD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 reel-sub-spliced.mp4)
  awk -v a="$CD" -v b="$SD" 'BEGIN{ d=a-b; if (d<0) d=-d;
    printf "── duration match check: clean %.3fs vs burn-in %.3fs (diff %.3fs)\n", a, b, d;
    if (d > 0.05) { print "⚠ the two copies differ in duration — check the spliced pieces"; } }'
fi

say "✓ reel-spliced.mp4 · reel-sub-spliced.mp4 · subs-spliced.srt"
