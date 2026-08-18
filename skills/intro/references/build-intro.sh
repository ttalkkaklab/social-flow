#!/usr/bin/env bash
# Channel intro render — normalizes the veo source to 1080×1920/30fps, layers the
# channel-name text plate slide-in + real-pixel lockup crossfade + aligned sonic-logo
# mix on top to build the master, then derives the stinger.
#
# Usage: build-intro.sh <workdir>
#   <workdir>/intro-raw.mp4  : final veo render (9:16 — any resolution, normalized to 1080×1920)
#   <workdir>/lockup.png     : 1080×1920 full lockup (background+character+channel name — lockup-template full capture)
#   <workdir>/text-plate.png : (optional) transparent text plate (text-mode alpha capture) —
#                              when present, slides in from TEXT_AT (channel-name reveal)
#   <workdir>/sonic.wav      : (optional) sonic logo — mixed aligned at SONIC_AT, veo audio ducked under it
# Output: <workdir>/intro-master.mp4 · intro-stinger.mp4 · frames/ (review frames)
#
# Encoding matches the build-outro.sh final-mux family — usable as an xfade splice input for main videos.
set -euo pipefail
export LC_ALL=en_US.UTF-8

WORKDIR="${1:?usage: build-intro.sh <workdir>}"
cd "$WORKDIR"

FPS=${FPS:-30}
TRIM_START=${TRIM_START:-0}      # cut a stalled opening (seconds) — to tighten the master into the 7s range
LOCKUP_XF=${LOCKUP_XF:-0.6}      # real-pixel lockup crossfade length — final fix for generation distortion
HOLD=${HOLD:-0.8}                # ending freeze hold — lets the lockup sink in (best practice 0.5–1s)
STINGER=${STINGER:-2.5}          # stinger length — tail cut of the master (≤2.5s for short-form splicing)
AUDIO=${AUDIO:-native}           # native = keep veo audio | none = drop veo audio
FADE_OUT=${FADE_OUT:-0.5}        # audio ending fade — keeps the sonic-logo tail, only cleans the very end
SONIC_VOL=${SONIC_VOL:-1.0}      # sonic-logo gain (balance before the final loudnorm)
ROOMTONE=${ROOMTONE:-0}          # 1 = mix a low-level room-tone bed across the whole clip (avoids silent starts and abrupt cutoffs)

[ -f intro-raw.mp4 ] || { echo "intro-raw.mp4 missing"; exit 1; }
[ -f lockup.png ]    || { echo "lockup.png missing"; exit 1; }
LDIM=$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0:s=x lockup.png)
[ "$LDIM" = "1080x1920" ] || { echo "lockup.png must be 1080x1920 (got $LDIM)"; exit 1; }

D_RAW=$(ffprobe -v error -show_entries format=duration -of csv=p=0 intro-raw.mp4)
D0=$(awk -v d="$D_RAW" -v t="$TRIM_START" 'BEGIN{printf "%.3f", d-t}')
awk -v d="$D0" 'BEGIN{exit !(d>1.5)}' || { echo "TRIM_START too large — ${D0}s left"; exit 1; }
D=$(awk -v d="$D0" -v h="$HOLD" 'BEGIN{printf "%.3f", d+h}')
ST=$(awk -v d="$D0" -v x="$LOCKUP_XF" 'BEGIN{printf "%.3f", d-x}')          # lockup fade start
TEXT_AT=${TEXT_AT:-$(awk -v s="$ST" 'BEGIN{printf "%.3f", (s>1.4)?s-1.2:0.2}')}   # channel-name reveal start
SONIC_AT=${SONIC_AT:-$(awk -v s="$ST" 'BEGIN{printf "%.3f", (s>0.2)?s-0.2:0}')}   # sonic-logo impact = landing
AFST=$(awk -v d="$D" -v f="$FADE_OUT" 'BEGIN{printf "%.3f", d-f}')
SONIC_MS=$(awk -v s="$SONIC_AT" 'BEGIN{printf "%d", s*1000}')
mkdir -p frames

# ── input array + variable indexes (text-plate/sonic join the inputs only when present)
HAS_AUDIO=$(ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 intro-raw.mp4 | head -1)
[ "$AUDIO" = "native" ] && [ -z "$HAS_AUDIO" ] && { echo "warning: no veo audio — ignoring"; AUDIO=none; }
IN=(-ss "$TRIM_START" -i intro-raw.mp4 -loop 1 -framerate "$FPS" -t "$D" -i lockup.png)
IDX=2; TP_IDX=""; SN_IDX=""
if [ -f text-plate.png ]; then IN+=(-loop 1 -framerate "$FPS" -t "$D" -i text-plate.png); TP_IDX=$IDX; IDX=$((IDX+1)); fi
if [ -f sonic.wav ];      then IN+=(-i sonic.wav); SN_IDX=$IDX; IDX=$((IDX+1)); fi

# ── video graph — normalize → (text slide-in) → lockup crossfade → ending hold
VF="[0:v]scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,
    fps=${FPS},setpts=PTS-STARTPTS[base];"
BASE="[base]"
if [ -n "$TP_IDX" ]; then
  VF+="[${TP_IDX}:v]format=rgba,fade=t=in:st=${TEXT_AT}:d=0.45:alpha=1[tp];
       ${BASE}[tp]overlay=0:'26*max(0\,1-(t-${TEXT_AT})/0.45)':format=auto[vt];"
  BASE="[vt]"
fi
VF+="[1:v]format=rgba,fade=t=in:st=${ST}:d=${LOCKUP_XF}:alpha=1[lk];
     ${BASE}[lk]overlay=0:0:format=auto,
     tpad=stop_mode=clone:stop_duration=${HOLD},format=yuv420p[v]"

# ── audio graph — 4 paths across veo audio × sonic logo, unified at loudnorm -14
AF=""; AMAP=""
if [ "$AUDIO" = "native" ]; then
  AF+="[0:a]asetpts=PTS-STARTPTS,aformat=channel_layouts=stereo,aresample=48000,
       apad,atrim=0:${D}[nat];"
fi
if [ -n "$SN_IDX" ]; then
  AF+="[${SN_IDX}:a]aformat=channel_layouts=stereo,aresample=48000,volume=${SONIC_VOL},
       adelay=${SONIC_MS}:all=1,apad,atrim=0:${D}[sn];"
fi
if [ "$AUDIO" = "native" ] && [ -n "$SN_IDX" ]; then
  AF+="[sn]asplit=2[sn_key][sn_mix];
       [nat][sn_key]sidechaincompress=threshold=0.05:ratio=6:attack=20:release=300[natd];
       [natd][sn_mix]amix=inputs=2:duration=first:dropout_transition=0[amix];"
  APRE="[amix]"
elif [ "$AUDIO" = "native" ]; then APRE="[nat]"
elif [ -n "$SN_IDX" ];       then APRE="[sn]"
else
  IN+=(-f lavfi -t "$D" -i "anullsrc=r=48000:cl=stereo"); APRE="[${IDX}:a]"; IDX=$((IDX+1))
fi
if [ "$ROOMTONE" = "1" ]; then
  IN+=(-f lavfi -t "$D" -i "anoisesrc=colour=pink:sample_rate=48000:amplitude=0.003")
  AF+="[${IDX}:a]lowpass=f=500,volume=0.35,aformat=channel_layouts=stereo[rt];
       ${APRE}[rt]amix=inputs=2:duration=first:dropout_transition=0[abed];"
  APRE="[abed]"; IDX=$((IDX+1))
fi
AF+="${APRE}loudnorm=I=-14:TP=-1.0:LRA=11,aresample=48000,
     alimiter=limit=0.891:attack=5:release=50,
     apad,atrim=0:${D},afade=t=out:st=${AFST}:d=${FADE_OUT}[a]"   # guarantees length and peak (-1dBFS)

ffmpeg -y -v error "${IN[@]}" -filter_complex "${VF};${AF}" -map "[v]" -map "[a]" \
  -c:v libx264 -profile:v high -level 4.1 -preset slow -crf 18 -pix_fmt yuv420p \
  -g $((FPS*2)) -keyint_min "$FPS" -sc_threshold 0 -r "$FPS" \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart intro-master.mp4

# ── stinger — tail cut of the master (the span with channel name, sonic logo, lockup), short audio fade-in only
SS=$(awk -v d="$D" -v s="$STINGER" 'BEGIN{printf "%.3f", (d>s)?d-s:0}')
ffmpeg -y -v error -i intro-master.mp4 -ss "$SS" -af "asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.15" \
  -c:v libx264 -profile:v high -level 4.1 -preset slow -crf 18 -pix_fmt yuv420p \
  -g $((FPS*2)) -keyint_min "$FPS" -sc_threshold 0 -r "$FPS" \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart intro-stinger.mp4

# ── review frames — 1fps sequence + final frame (for the lockup-match verdict)
ffmpeg -y -v error -i intro-master.mp4 -vf fps=1 frames/f%02d.png
ffmpeg -y -v error -sseof -0.05 -i intro-master.mp4 -frames:v 1 -update 1 frames/last.png

RM=$(ffprobe -v error -show_entries format=duration -of csv=p=0 intro-master.mp4)
RS=$(ffprobe -v error -show_entries format=duration -of csv=p=0 intro-stinger.mp4)
echo "intro-master.mp4: ${RM}s (source ${D_RAW}s, trim ${TRIM_START}s, hold ${HOLD}s)"
echo "timeline: text reveal ${TEXT_AT}s → sonic logo ${SONIC_AT}s → lockup XF ${ST}s"
echo "intro-stinger.mp4: ${RS}s / review frames: frames/ ($(ls frames | wc -l | tr -d ' ') files)"
