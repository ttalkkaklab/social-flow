#!/usr/bin/env bash
# Playback speed-up pass — runs after the build (and after any clip splice), before output/.
#
#   Usage: speedup.sh <workdir> [factor]
#
#   Why it's a pass of its own and not a build option: the whole picture has to speed up, the
#   generated clips included. Speeding up only the TTS shortens the cards but leaves every
#   generated clip at its own rate, which is exactly the "still looks like slow motion" reject
#   (ttalkkak-lab profile.md, 2026-08-22, twice). And it can't live inside build-reel.sh either —
#   splice-clip.sh's T values are on the original timeline, so a build that already sped up would
#   put every insert in the wrong place.
#
#   Factor: the argument, else $SPEED, else format.env, else 1.2.
#
#   Input — the newest set in the workdir, the same rule output/ copies by:
#     reel-spliced.mp4 / reel-sub-spliced.mp4 / subs-spliced.srt  when a splice ran
#     reel.mp4         / reel-sub.mp4         / subs.srt          otherwise
#   Output: reel-fast.mp4 · reel-sub-fast.mp4 · subs-fast.srt · chapters-fast.txt
#           (cover.jpg is a still — the same frame at any speed, so it carries over untouched)
#   Reading the un-sped files and writing new names makes the pass idempotent — run it twice with
#   a different factor and it recomputes from the original instead of stacking passes.
#
#   **The outro stays at 1.0x.** It's a brand asset with its own cut and its own sonic logo; a
#   sped-up logo sting reads as a glitch. Only the feature speeds up, and the tail is re-joined
#   untouched. The boundary is the outro asset's own duration, minus the xfade overlap when the
#   builder used one (build-screencast.sh xfades; build-reel.sh joins through black with no overlap).
#
#   Subtitle and chapter times are divided by the factor over the feature and shifted by a constant
#   over the outro tail, so a cue never drifts off the word it belongs to.
set -euo pipefail
export LC_ALL=en_US.UTF-8

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="${1:?usage: speedup.sh <workdir> [factor]}"
cd "$WORK"

# Format preset — read **before** the inline defaults, the same precedence contract the three
# builders hold: caller env → format.env → inline.
[ -f format.env ] && . ./format.env

SPEED=${2:-${SPEED:-1.2}}
FPS=${FPS:-30}
OUTRO_ASSET=${OUTRO_ASSET:-outro.mp4}
XFADE=${XFADE:-0.6}
SPEED_TOL=${SPEED_TOL:-0.15}        # measured-vs-expected duration tolerance (s)
FINAL_SPEECH_RATE_MAX=${FINAL_SPEECH_RATE_MAX:-6.2}
REPORT=build-report.txt

awk -v f="$SPEED" 'BEGIN{exit !(f >= 0.5 && f <= 3.0)}' \
  || { echo "✗ factor $SPEED is outside 0.5~3.0 — atempo's usable range and the audible limit" >&2; exit 1; }

say() { printf '%s\n' "$1"; [ -f "$REPORT" ] && printf '%s\n' "$1" >> "$REPORT"; }
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
check_final_rate() {
  [ -f subs-fast.srt ] || { say "✗ subs-fast.srt missing — final speech rate cannot be checked"; return 1; }
  local RATE_OUT
  if ! RATE_OUT=$(python3 "$HERE/check-final-speech-rate.py" subs-fast.srt --max "$FINAL_SPEECH_RATE_MAX" 2>&1); then
    say "✗ final speech rate exceeds ${FINAL_SPEECH_RATE_MAX} chars/s after the speed pass"
    printf '%s\n' "$RATE_OUT" | tee -a "$REPORT" >&2
    return 1
  fi
  say "── $RATE_OUT"
}

# ── 1) Pick the input set — spliced when it exists, plain otherwise
if [ -f reel-spliced.mp4 ]; then
  VIN=reel-spliced.mp4; SIN=reel-sub-spliced.mp4; TIN=subs-spliced.srt
else
  VIN=reel.mp4;         SIN=reel-sub.mp4;         TIN=subs.srt
fi
[ -f "$VIN" ] || { echo "✗ $VIN missing — run build-reel.sh (and splice-clip.sh) first" >&2; exit 1; }

if awk -v f="$SPEED" 'BEGIN{exit !(f == 1)}'; then
  # An explicit 1.0 is a channel saying "ship at the recorded pace". Copy the set through under the
  # -fast names so the finalize step stays one fixed set of paths and the gate still sees its marker.
  cp -f "$VIN" reel-fast.mp4
  [ -f "$SIN" ] && cp -f "$SIN" reel-sub-fast.mp4
  [ -f "$TIN" ] && cp -f "$TIN" subs-fast.srt
  [ -f chapters.txt ] && cp -f chapters.txt chapters-fast.txt
  check_final_rate
  say "── speedup x1.00: passed through at the recorded pace ($VIN → reel-fast.mp4)"
  exit 0
fi

TOT=$(dur "$VIN")

# ── 2) Where the feature ends and the outro begins
#   build-reel.sh joins through black (total = feature + outro), build-screencast.sh xfades
#   (total = feature + outro − XFADE). The report line says which one ran.
KEEP=0
if [ -f "$OUTRO_ASSET" ]; then
  OD=$(dur "$OUTRO_ASSET")
  if [ -f "$REPORT" ] && grep -q 'outro splice: xfade' "$REPORT"; then
    KEEP=$(awk -v o="$OD" -v x="$XFADE" 'BEGIN{printf "%.6f", o-x}')
  else
    KEEP=$OD
  fi
fi
B=$(awk -v t="$TOT" -v k="$KEEP" 'BEGIN{printf "%.6f", t-k}')
awk -v b="$B" 'BEGIN{exit !(b > 0.5)}' \
  || { echo "✗ the feature computes to ${B}s — the outro length doesn't fit the video" >&2; exit 1; }
EXP=$(awk -v b="$B" -v k="$KEEP" -v f="$SPEED" 'BEGIN{printf "%.3f", b/f + k}')

mkdir -p work-fast
rm -f work-fast/*.mp4 work-fast/*.wav work-fast/join-*.txt 2>/dev/null || true

# Same encoder settings as the builders, so the two pieces concat without a re-encode at the seam.
VENC=(-c:v libx264 -profile:v high -level 4.1 -preset slow -crf 19 -pix_fmt yuv420p
      -g $((FPS*2)) -keyint_min "$FPS" -sc_threshold 0 -r "$FPS")
AENC=(-c:a aac -b:a 192k -ar 48000 -ac 2)

# ── 3) One video: feature sped up, tail untouched, joined by the concat demuxer.
#   Video and audio are built in separate ffmpeg runs and muxed at the end — one filter_complex
#   carrying both chains makes ffmpeg 7.1.1's scheduler drop audio frames (measured 2026-08-19,
#   build-reel.sh §12 carries the same note).
speed_one() {                       # $1=input  $2=output
  local IN="$1" OUT="$2" TAG
  TAG=$(basename "$OUT" .mp4)

  # -t goes **before -i** — as an output option it caps the sped-up result at $B instead of
  # reading $B of source, which silently ships the original length back (measured).
  ffmpeg -y -v error -t "$B" -i "$IN" \
    -vf "setpts=PTS/$SPEED,fps=$FPS,setsar=1,format=yuv420p" -an "${VENC[@]}" "work-fast/body-$TAG.mp4"
  ffmpeg -y -v error -t "$B" -i "$IN" \
    -af "atempo=$SPEED,aresample=48000" -vn -c:a pcm_s16le -ac 2 "work-fast/body-$TAG.wav"

  if awk -v k="$KEEP" 'BEGIN{exit !(k > 0)}'; then
    ffmpeg -y -v error -ss "$B" -i "$IN" \
      -vf "setsar=1,format=yuv420p" -an "${VENC[@]}" "work-fast/tail-$TAG.mp4"
    ffmpeg -y -v error -ss "$B" -i "$IN" -vn -c:a pcm_s16le -ar 48000 -ac 2 "work-fast/tail-$TAG.wav"
    printf "file 'body-%s.mp4'\nfile 'tail-%s.mp4'\n" "$TAG" "$TAG" > "work-fast/join-$TAG.txt"
    ffmpeg -y -v error -i "work-fast/body-$TAG.wav" -i "work-fast/tail-$TAG.wav" \
      -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1[a]" -map "[a]" -c:a pcm_s16le "work-fast/aud-$TAG.wav"
  else
    printf "file 'body-%s.mp4'\n" "$TAG" > "work-fast/join-$TAG.txt"
    cp -f "work-fast/body-$TAG.wav" "work-fast/aud-$TAG.wav"
  fi

  ffmpeg -y -v error -f concat -safe 0 -i "work-fast/join-$TAG.txt" -i "work-fast/aud-$TAG.wav" \
    -map 0:v -map 1:a -c:v copy "${AENC[@]}" -movflags +faststart "$OUT"
}

speed_one "$VIN" reel-fast.mp4
[ -f "$SIN" ] && speed_one "$SIN" reel-sub-fast.mp4

# ── 4) Verify — the measured length has to match feature/factor + tail
RV=$(dur reel-fast.mp4)
awk -v a="$RV" -v e="$EXP" -v tol="$SPEED_TOL" 'BEGIN{d=a-e; if(d<0)d=-d; exit !(d <= tol)}' \
  || { say "✗ reel-fast.mp4 is ${RV}s but ${EXP}s was expected — the speed pass didn't take"; exit 1; }
if [ -f reel-sub-fast.mp4 ]; then
  SV=$(dur reel-sub-fast.mp4)
  awk -v a="$RV" -v b="$SV" 'BEGIN{d=a-b; if(d<0)d=-d; exit !(d <= 0.05)}' \
    || { say "✗ reel-sub-fast.mp4 ${SV}s ≠ reel-fast.mp4 ${RV}s — the two didn't come from the same pass"; exit 1; }
fi

# ── 5) Subtitles and chapters follow the same time map — divided over the feature,
#      shifted by a constant over the outro tail (a cue there would otherwise slide back into it).
if [ -f "$TIN" ]; then
  python3 - "$TIN" subs-fast.srt "$B" "$SPEED" <<'PY'
import re, sys
src, dst, B, F = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
def secs(s):
    h, m, rest = s.split(":"); sec, ms = rest.split(",")
    return int(h)*3600 + int(m)*60 + int(sec) + int(ms)/1000
def stamp(t):
    if t < 0: t = 0
    h = int(t//3600); m = int((t-h*3600)//60); s = t - h*3600 - m*60
    return ("%02d:%02d:%06.3f" % (h, m, s)).replace(".", ",")
def mapped(t):
    return t/F if t <= B else B/F + (t - B)
pat = re.compile(r"(\d\d:\d\d:\d\d,\d\d\d) --> (\d\d:\d\d:\d\d,\d\d\d)")
out = []
for line in open(src, encoding="utf-8"):
    m = pat.match(line.strip())
    if m:
        out.append("%s --> %s\r\n" % (stamp(mapped(secs(m.group(1)))), stamp(mapped(secs(m.group(2))))))
    else:
        out.append(line.rstrip("\r\n") + "\r\n")
open(dst, "w", encoding="utf-8", newline="").write("".join(out))
PY
  say "── subs-fast.srt: $(grep -c ' --> ' subs-fast.srt) cues retimed"
fi

if [ -f chapters.txt ]; then
  awk -F'\t' -v b="$B" -v f="$SPEED" '
    function secs(v,   p, n) { n = split(v, p, ":"); return n == 3 ? p[1]*3600 + p[2]*60 + p[3] : p[1]*60 + p[2] }
    function ts(v,   h, m, s) { s = int(v); m = int(s/60); s -= m*60; h = int(m/60); m -= h*60;
      return h ? sprintf("%d:%02d:%02d", h, m, s) : sprintf("%02d:%02d", m, s) }
    { t = secs($1); t = (t <= b) ? t/f : b/f + (t-b); v = int(t); printf "%s\t%s\n", ts(v), $2; at[NR] = v; n = NR }
    END { for (i = 2; i <= n; i++) if (at[i] - at[i-1] < 10)
            printf "⚠ %s → %s is %ds apart after the speed-up — YouTube drops chapters under 10s\n",
                   ts(at[i-1]), ts(at[i]), at[i]-at[i-1] > "/dev/stderr" }
  ' chapters.txt > chapters-fast.txt 2> work-fast/chap-warn.txt
  say "── chapters-fast.txt: $(wc -l < chapters-fast.txt | tr -d ' ') chapters retimed"
  # The warning has to reach build-report.txt — produce §7's reader and episode-state.js both
  # judge from the report, and stderr alone never gets there (pipeline.md lists it as a gate row).
  while IFS= read -r W; do [ -n "$W" ] && say "$W"; done < work-fast/chap-warn.txt
fi

check_final_rate
TAIL=$(awk -v k="$KEEP" 'BEGIN{printf "%.2f", k}')
say "── speedup x$(awk -v f="$SPEED" 'BEGIN{printf "%.2f", f}') ($VIN): ${TOT}s → ${RV}s (feature ${B}s at speed, ${TAIL}s outro tail at 1.00x)"
