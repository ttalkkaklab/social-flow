#!/usr/bin/env bash
# build-screencast.sh — filmed (screencast) edit pipeline
#   Cuts the screen recording the user filmed against the storyboard script per the edit.json
#   alignment and assembles a 9:16 short. The audio is the user's live voice (the recording's own
#   sound) — no TTS.
#
#   The zero-drift principle carries over from build-reel.sh v2: fix the scene duration by frame
#   ceiling and pad the audio to exactly FRAMES*(48000/FPS) samples → zero cumulative concat error.
#
# Usage: build-screencast.sh <workdir>
#   <workdir>/edit.json   : edit manifest (screencast-pipeline.md §edit.json contract)
#                           {source, scenes:[{idx,start,end,crop?,overlay?,subs?}]}
#                           start/end/subs times are all on the original recording's clock (seconds) —
#                           the build does the repositioning
#   <workdir>/cards/tN.png: (optional) scene title alpha overlay (screencast-overlay.html capture)
#   <workdir>/bgm.wav     : background music (loops if shorter than the feature)
#   <workdir>/outro.mp4   : (optional) shared outro — joined with xfade+acrossfade when present
#   <workdir>/fonts/      : (optional) subtitle font ttf — libass can't read woff2
# Output: <workdir>/reel.mp4 (clean master without subtitles) · reel-sub.mp4 (burned-in copy, skipped when BURN=0)
#         subs.srt (for publishing) · subs.ass (burn-in source) · cover.jpg · build-report.txt
#
# Composite geometry (1080×1920 canvas):
#   top    y 190~460   title block (overlay PNG — pairs with screencast-overlay.html's y=460 contract)
#   middle y≥460       recording band — fit to width 1080, height capped at BAND_MAX_H, centered on BAND_CY
#   bottom y 1380~1560 burned-in subtitle band (same style and margins as build-reel.sh)
set -euo pipefail
export LC_ALL=en_US.UTF-8

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # grab before cd (path to bgm-bed.sh)
WORKDIR="${1:?usage: build-screencast.sh <workdir>}"
cd "$WORKDIR"

# Format preset — same contract as build-reel.sh. Read **before** the inline defaults.
[ -f format.env ] && . ./format.env

FPS=${FPS:-30}
SPF=$((48000 / FPS))               # audio samples per frame
BG=${BG:-#0b1020}                  # canvas background — THEME.ink is passed in
BG="${BG#\#}"; BG="${BG#0x}"; BG="0x${BG}"   # normalize either '#' or '0x' notation to 0xRRGGBB
# Canvas — used today for the ASS PlayRes and the stage-4 asset precheck. The background composite
# (:144) and the shrink factor (:142) stay portrait literals until stage 13 builds a separate
# landscape branch. The band constants (BAND_MAX_H 900 · BAND_CY 880 · BAND_MIN_Y 460) are absolute
# px, so turning only the canvas into a variable would fake a generality that isn't there — it would
# look as if 720x1280 works.
W=${W:-1080}                       # canvas width
H=${H:-1920}                       # canvas height
BAND_MAX_H=${BAND_MAX_H:-900}      # recording band height cap (keeps it out of the 1380 subtitle band)
BAND_CY=${BAND_CY:-880}            # target vertical center of the band
BAND_MIN_Y=${BAND_MIN_Y:-460}      # floor for the band's top edge (title block y=460 contract)
MAX_SCENE=${MAX_SCENE:-20}         # warn above this (a signal to split the scene or reshoot)
SHRINK_WARN=${SHRINK_WARN:-3.0}    # screen shrink-factor warning threshold (text legibility)
BGM_SEP=${BGM_SEP:-12}             # LU the bed sits under the measured voice — 2 wider than a TTS
                                   # episode, because a live voice swings more than a synthetic one
BGM_SEP_MIN=${BGM_SEP_MIN:-4}      # below this the build stops (bgm-scoring.md §1)
BGM_LOOP_XF=${BGM_LOOP_XF:-2.0}
export BGM_LOOP_XF
DUCK_RELEASE=${DUCK_RELEASE:-250}
XFADE=${XFADE:-0.6}                # feature↔outro transition length
XFADE_T=${XFADE_T:-fadeblack}
SUB=${SUB:-1}                      # 1=generate subtitle data (subs.srt·subs.ass), 0=no subtitles
BURN=${BURN:-1}                    # 1=also produce the burn-in reel-sub.mp4, 0=clean master only
SUB_FONT=${SUB_FONT:-Pretendard}   # falls back to fontconfig when fonts/ has no ttf
SUB_SIZE=${SUB_SIZE:-58}           # ASS Fontsize — must match build-reel.sh
SUB_ML=${SUB_ML:-250}              # subtitle left margin
SUB_MR=${SUB_MR:-250}              # subtitle right margin
SUB_MV=${SUB_MV:-380}              # subtitle bottom margin
SUB_OUT=${SUB_OUT:-5}              # outline thickness
SUB_SHA=${SUB_SHA:-1.7}            # shadow
COVER_TS=${COVER_TS:-1.2}          # cover still timestamp (a frame where the title overlay is visible)
OUTRO_ASSET=${OUTRO_ASSET:-outro.mp4}   # outro to splice — a different file per format
STRICT_DIM=${STRICT_DIM:-0}        # 1=exit 1 on asset dimension mismatch, 0=one warning line

rm -rf work && mkdir -p work
# Delete the old build's subtitles and burned-in copy first — rebuilding with SUB=0 while the
# previous subs.srt survives publishes mistimed subtitles (publish copies on file existence alone)
rm -f subs.srt subs.ass reel-sub.mp4
REPORT=build-report.txt
: > "$REPORT"
WARN=0
say() { echo "$1"; echo "$1" >> "$REPORT"; }

[ -f edit.json ] || { echo "edit.json missing"; exit 1; }
[ -f bgm.wav ] || { echo "bgm.wav missing"; exit 1; }

say "── screencast build v1 ($(basename "$WORKDIR"))"

# ── 0) Expand the manifest — scene table (work/scenes.tsv) + ASS subtitle body (work/subs.body)
#      The scene-duration frame ceiling and the subtitle absolute-time repositioning are computed in
#      one place (python) — split across a bash floating-point loop, subtitle times and concat
#      offsets drift apart from each other.
SRC=$(python3 - "$FPS" <<'PYEOF'
import json, math, sys
fps = int(sys.argv[1])
d = json.load(open("edit.json"))
def asstime(t):
    if t < 0: t = 0.0
    h = int(t // 3600); m = int((t - h*3600) // 60); s = t - h*3600 - m*60
    return "%d:%02d:%05.2f" % (h, m, s)
def srttime(t):                       # SRT is hh:mm:ss,mmm — digits and separator differ from ASS
    if t < 0: t = 0.0
    h = int(t // 3600); m = int((t - h*3600) // 60); s = t - h*3600 - m*60
    return ("%02d:%02d:%06.3f" % (h, m, s)).replace(".", ",")
rows, subs, totf = [], [], 0
for sc in d["scenes"]:
    idx = sc["idx"]; st = float(sc["start"]); en = float(sc["end"])
    if en <= st: raise SystemExit("scene %s: end<=start" % idx)
    frames = math.ceil((en - st) * fps - 1e-9)
    D = frames / fps
    crop = sc.get("crop")
    if crop:
        x, y, w, h = [int(v) for v in crop]
        w -= w % 2; h -= h % 2; x -= x % 2; y -= y % 2
        cropstr = "%d:%d:%d:%d" % (w, h, x, y)
    else:
        cropstr = "-"
    ov = sc.get("overlay") or "-"
    cs = totf / fps                       # this scene's absolute offset on the final timeline
    for u in (sc.get("subs") or []):
        a = max(0.0, float(u["start"]) - st)
        b = min(float(u["end"]), en) - st
        if b <= a: continue
        txt = str(u.get("text", "")).replace("{", "").replace("}", "")
        txt = txt.replace("\\", "").replace("\t", " ").strip()
        if txt:
            subs.append((cs + a, cs + min(b, D), txt))
    rows.append("%s\t%.3f\t%.6f\t%d\t%s\t%s" % (idx, st, D, frames, cropstr, ov))
    totf += frames
open("work/scenes.tsv", "w").write("\n".join(rows) + "\n")
with open("work/subs.body", "w") as f:
    for a, b, t in subs:
        f.write("Dialogue: 0,%s,%s,Sub,,0,0,0,,{\\fad(160,120)}%s\n" % (asstime(a), asstime(b), t))
# The publish SRT comes from the same subs list — burn-in and subtitle file must share one source,
# or the two files end up with different times. The fade tag is ASS-only, so it's dropped.
with open("work/subs.srtbody", "w") as f:
    for i, (a, b, t) in enumerate(subs, 1):
        f.write("%d\n%s --> %s\n%s\n\n" % (i, srttime(a), srttime(b), t))
print(d["source"])
PYEOF
)
[ -f "$SRC" ] || { say "✗ source recording missing: $SRC"; exit 1; }

SRCWH=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$SRC" | head -1)
SRCW=${SRCWH%%,*}; SRCH=${SRCWH##*,}
AUD=$(ffprobe -v error -select_streams a:0 -show_entries stream=index -of csv=p=0 "$SRC")
[ -n "$AUD" ] || { say "✗ source has no audio stream — check that it was recorded with record.sh (-g mic capture)"; exit 1; }
say "── source: $SRC (${SRCW}x${SRCH})"

# ── 0.5) Asset resolution precheck
#   The strictness differs per asset — what decides it is how the filter graph consumes it.
#     outro    fed straight into xfade      → exact match. ffmpeg dies on a mismatch
#     overlay  overlay=0:0 (no scaling)     → exact match. A mismatch shifts it silently
#   The source recording isn't checked — this builder assumes scale=decrease,pad takes any
#   resolution, and the SHRINK warning covers size problems separately. Silent on pass.
DIMBAD=0
assert_exact() {   # <path> <role>
  local got
  case "$1" in
    *.png|*.PNG) got=$(sips -g pixelWidth -g pixelHeight "$1" 2>/dev/null \
      | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{printf "%sx%s", w, h}') ;;
    *) got=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
         -of csv=p=0:s=x "$1" 2>/dev/null) ;;
  esac
  [ -n "$got" ] || { say "⚠ couldn't read the dimensions of $2 $1"; DIMBAD=1; return; }
  [ "$got" = "${W}x${H}" ] || {
    say "⚠ $2 $1 is ${got} — it must match the canvas ${W}x${H} exactly"; DIMBAD=1; }
}
[ -f "$OUTRO_ASSET" ] && assert_exact "$OUTRO_ASSET" "outro"
while IFS=$'\t' read -r _ _ _ _ _ SOVL; do
  [ "${SOVL:-}" = "-" ] && continue
  [ -n "${SOVL:-}" ] && [ -f "$SOVL" ] && assert_exact "$SOVL" "overlay"
done < work/scenes.tsv
if [ "$DIMBAD" = 1 ]; then
  if [ "$STRICT_DIM" = 1 ]; then
    say "✗ asset resolution mismatch — STRICT_DIM=1, stopping before the first ffmpeg"; exit 1
  fi
  WARN=1
fi

# ── 1) Per-scene cut — video (crop→fit→pad→overlay) + audio (loudnorm→sample-exact padding)
N=0
while IFS=$'\t' read -r -u 3 IDX ST D FRAMES CROP OVL; do
  [ -z "${IDX:-}" ] && continue
  N=$((N+1))
  SAMPLES=$((FRAMES * SPF))

  CROPF=""; EFFW=$SRCW
  if [ "$CROP" != "-" ]; then CROPF="crop=$CROP,"; EFFW=${CROP%%:*}; fi
  SHRINK=$(awk -v w="$EFFW" 'BEGIN{printf "%.1f", w/1080}')
  if awk -v s="$SHRINK" -v t="$SHRINK_WARN" 'BEGIN{exit !(s>t)}'; then
    say "⚠ scene $IDX screen scaled down ${SHRINK}× (>${SHRINK_WARN}) — small text won't read. Narrow the crop or enlarge the demo app's font and reshoot."
    WARN=1
  fi
  if awk -v d="$D" -v m="$MAX_SCENE" 'BEGIN{exit !(d>m)}'; then
    say "⚠ scene $IDX duration $(printf '%.1f' "$D")s > ${MAX_SCENE}s — split the scene or tighten the speech."
    WARN=1
  fi

  # Band: fit to width 1080 (height capped at BAND_MAX_H) → pad to 1080×1920. y is centered and then
  # clamped at the ceiling — the even snap is for yuv420p chroma alignment. tpad fills a short tail
  # with clones of the last frame and -frames:v cuts it exactly.
  BASEF="[0:v]${CROPF}scale=w=1080:h=${BAND_MAX_H}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad=1080:1920:(ow-iw)/2:trunc(max(${BAND_MIN_Y}\,${BAND_CY}-ih/2)/2)*2:${BG},fps=${FPS},settb=AVTB,setsar=1[base]"
  HAS_OVL=0
  if [ "$OVL" != "-" ] && [ -f "$OVL" ]; then
    HAS_OVL=1
    ffmpeg -y -v error -ss "$ST" -t "$D" -i "$SRC" \
      -loop 1 -framerate "$FPS" -t "$D" -i "$OVL" -filter_complex "
      $BASEF;[1:v]format=rgba,settb=AVTB[ov];
      [base][ov]overlay=0:0:eof_action=repeat,tpad=stop=-1:stop_mode=clone,fps=$FPS,format=yuv420p[v]" \
      -map "[v]" -frames:v "$FRAMES" -an -c:v libx264 -preset medium -crf 18 "work/v$IDX.mp4"
  else
    [ "$OVL" != "-" ] && { say "⚠ scene $IDX overlay file missing: $OVL — continuing without a title"; WARN=1; }
    ffmpeg -y -v error -ss "$ST" -t "$D" -i "$SRC" -filter_complex "
      $BASEF;[base]tpad=stop=-1:stop_mode=clone,fps=$FPS,format=yuv420p[v]" \
      -map "[v]" -frames:v "$FRAMES" -an -c:v libx264 -preset medium -crf 18 "work/v$IDX.mp4"
  fi

  # Audio — clean up the live voice (low end · clarity · proximity effect) → per-scene loudnorm
  #         (normalizes level variation) → sample-exact padding/trim. apad and atrim must come last —
  #         the concat drift assertion (2ms) hangs on this sample count.
  #
  # sidechaincompress ducks only the low end (≤250Hz), triggered by the full signal. A cardioid mic
  # swells the bass only when you speak loudly up close (proximity effect), so cutting it with a fixed
  # EQ thins the voice when you speak quietly. That's what the "boomy" resonance actually is.
  ffmpeg -y -v error -ss "$ST" -t "$D" -i "$SRC" -vn -filter_complex \
    "[0:a]aresample=48000,\
highpass=f=80:poles=2,\
equalizer=f=250:t=q:w=1.2:g=-3,\
equalizer=f=3200:t=q:w=1.4:g=3,\
asplit=3[full][lo0][hi0];\
[lo0]lowpass=f=250:poles=2[lo];\
[hi0]highpass=f=250:poles=2[hi];\
[lo][full]sidechaincompress=threshold=0.03:ratio=6:attack=5:release=120:makeup=1[loc];\
[loc][hi]amix=inputs=2:normalize=0,\
loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,\
apad=whole_len=${SAMPLES},atrim=end_sample=${SAMPLES}[na]" \
    -map "[na]" -ac 1 -ar 48000 "work/n$IDX.wav"

  echo "$IDX" >> work/order.txt
  say "$(printf 'scene %s | cut %ss + %.2fs | %sf | crop %s | shrink x%s | overlay %s' \
        "$IDX" "$ST" "$D" "$FRAMES" "$CROP" "$SHRINK" "$([ "$HAS_OVL" = 1 ] && echo yes || echo no)")"
done 3< work/scenes.tsv

# ── 2) Main-part concat + drift assertion
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
say "── main part: video ${VT}s / voice ${NT}s / drift ${DRIFT}s (${N} scenes)"
awk -v d="$DRIFT" 'BEGIN{exit !(d<=0.002)}' || { say "✗ drift over the 2ms tolerance — build stopped"; exit 1; }
if awk -v t="$VT" 'BEGIN{exit !(t>90)}'; then
  say "⚠ main part ${VT}s > the 90s cap — tighten the scene cuts or drop scenes."
  WARN=1
fi

# ── 3) BGM ducking mix (the same machine as build-reel.sh)
#   The bed is measured and gained to sit BGM_SEP under the voice, and a bed shorter than the
#   recording is crossfaded onto itself instead of butt-joined. Cue changes are the one thing
#   this builder doesn't take — a screencast is one continuous take, so it gets one bed.
FOUT=$(awk -v t="$NT" 'BEGIN{printf "%.3f", t-2.2}')
SPEECH_I=$(ffmpeg -hide_banner -nostats -i work/narration.wav -af loudnorm=print_format=json -f null - 2>&1 \
  | tr -d ' \t"' | awk -F: '$1=="input_i"{gsub(/,/,"",$2); print $2}')
BED_I=$(awk -v s="$SPEECH_I" -v d="$BGM_SEP" 'BEGIN{printf "%.2f", s-d}')
say "── BGM bed: voice ${SPEECH_I} LUFS → bed ${BED_I} LUFS (${BGM_SEP} LU under)"
printf '0.0000\tbgm.wav\n' > work/bgmcue.list
"$HERE/bgm-bed.sh" work/bed.wav "$NT" "$BED_I" work/bgmcue.list > work/bed.log 2>&1 \
  || { cat work/bed.log; say "✗ the music bed failed to render"; exit 1; }
while IFS= read -r L; do say "$L"; done < work/bed.log

ffmpeg -y -v error -i work/narration.wav -i work/bed.wav -filter_complex "
  [0:a]aformat=channel_layouts=stereo,asplit=2[vo_key][vo_mix];
  [1:a]atrim=0:$NT,asetpts=PTS-STARTPTS,
       afade=t=in:st=0:d=1.2,afade=t=out:st=$FOUT:d=2.2[bgv];
  [bgv][vo_key]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=$DUCK_RELEASE:makeup=1,
       asplit=2[duck][duckqa];
  [vo_mix][duck]amix=inputs=2:duration=first:dropout_transition=0,
       loudnorm=I=-14:TP=-1.0:LRA=11,aresample=48000[out]
" -map "[out]" -ac 2 -ar 48000 work/mix.wav \
  -map "[duckqa]" -ac 2 -ar 48000 work/bed-ducked.wav

BED_D=$(ffmpeg -hide_banner -nostats -i work/bed-ducked.wav -af loudnorm=print_format=json -f null - 2>&1 \
  | tr -d ' \t"' | awk -F: '$1=="input_i"{gsub(/,/,"",$2); print $2}')
SEP=$(awk -v s="$SPEECH_I" -v b="$BED_D" 'BEGIN{printf "%.1f", s-b}')
say "── voice-to-bed separation ${SEP} LU (voice ${SPEECH_I} / ducked bed ${BED_D})"
if awk -v v="$SEP" -v m="$BGM_SEP_MIN" 'BEGIN{exit !(v < m)}'; then
  say "✗ separation ${SEP} LU is under the ${BGM_SEP_MIN} LU floor — the bed is competing with the voice"
  exit 1
fi

# ── 4) ASS subtitle file — same style as build-reel.sh (band y≈1380~1560, symmetric margins 250)
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
  # Publish SRT — line endings are CRLF (the original SubRip spec)
  awk '{printf "%s\r\n", $0}' work/subs.srtbody > subs.srt
  say "── subtitles: $(grep -c '^Dialogue' subs.ass) lines (burn-in subs.ass / publish subs.srt) / font $SUB_FONT"
else
  rm -f subs.srt
  say "── no subtitles (subs.body is empty, or SUB=0)"
fi

# ── 5) Render + outro splice — never -shortest (105ms of accumulation measured; carried over from build-reel)
#      Subtitles go up separately by default, so reel.mp4 is the clean master. The burn-in is for
#      platforms that can't take a subtitle file; it isn't a re-encode of the clean copy but a second
#      pass from the same source.
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
fi

# ── 6) Final verification + cover still
RV=$(ffprobe -v error -select_streams v -show_entries stream=duration -of csv=p=0 reel.mp4)
RA=$(ffprobe -v error -select_streams a -show_entries stream=duration -of csv=p=0 reel.mp4)
LUFS=$(ffmpeg -hide_banner -i reel.mp4 -af loudnorm=I=-14:TP=-1:LRA=11:print_format=summary -f null - 2>&1 | sed -n 's/.*Input Integrated: *\(.*\)/\1/p')
FSTART=$(xxd -l 48 reel.mp4 | grep -c moov || true)
say "── reel.mp4: video ${RV}s / audio ${RA}s / loudness ${LUFS} / faststart $([ "$FSTART" -ge 1 ] && echo OK || echo unconfirmed)"
# The burn-in comes from the same source through the same filter chain, so its duration must match the clean copy — a mismatch means one of the two is an older build
if [ -f reel-sub.mp4 ]; then
  SV=$(ffprobe -v error -select_streams v -show_entries stream=duration -of csv=p=0 reel-sub.mp4)
  if awk -v a="$RV" -v b="$SV" 'BEGIN{exit (a-b<0.05 && b-a<0.05) ? 0 : 1}'; then
    say "── reel-sub.mp4: video ${SV}s (matches the clean copy)"
  else
    say "✗ reel-sub.mp4 duration ${SV}s ≠ reel.mp4 ${RV}s — not from the same build"; exit 1
  fi
fi
[ -s subs.srt ] && say "── subs.srt: $(grep -c ' --> ' subs.srt) cues / $(wc -c < subs.srt | tr -d ' ') bytes (FB cap 200K)"
# ── Canvas comparison (gate 6) — don't proceed when the declared and measured sizes disagree.
#   The check runs regardless of format; only the report line is conditional on format.env.
#   It uses the `── ` prefix and doesn't start with `card `.
RDIM=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x reel.mp4)
if [ "$RDIM" != "${W}x${H}" ]; then
  say "✗ reel.mp4 is ${RDIM} but the declared canvas is ${W}x${H} — an asset or a filter is off"
  exit 1
fi
[ -f format.env ] && say "── canvas: declared ${W}x${H} · measured ${RDIM}"

ffmpeg -y -v error -ss "$COVER_TS" -i reel.mp4 -frames:v 1 -q:v 2 cover.jpg
[ "$WARN" -eq 1 ] && say "── warnings present: check the ⚠ items above"
say "── done"
