#!/usr/bin/env bash
# make-reels shared outro render — the brand closing video reused across every reel
# (rendered once → assets/outro/default.mp4. resolve also finds the old assets/outro.mp4)
#
# Usage: build-outro.sh <workdir>
#   <workdir>/outro-card.png   : brand outro card (1080x1920 fullframe recommended)
#   <workdir>/outro-voice.*    : brand narration (RIFF WAV or raw PCM 24k/s16/mono)
#   <workdir>/outro-bgm.wav    : (optional) outro-only BGM — without it, narration over silence
# Output: <workdir>/outro.mp4
#
# The xfade splice is only seamless if the layout and encoding parameters match the feature
# (build-reel.sh).
set -euo pipefail
export LC_ALL=en_US.UTF-8

WORKDIR="${1:?usage: build-outro.sh <workdir>}"
cd "$WORKDIR"

# Format preset — the same contract as build-reel.sh. Read **before** the inline defaults.
[ -f format.env ] && . ./format.env

FPS=${FPS:-30}
SPF=$((48000 / FPS))
W=${W:-1080}; H=${H:-1920}          # canvas — the format decides it
ZOOM_BASE=${ZOOM_BASE:-1620x2880}   # Ken Burns source resolution
ZB=${ZOOM_BASE/x/:}                 # ffmpeg scale= colon notation
CW=${CW:-1024}; CH=${CH:-1280}
CX=${CX:-28};   CY=${CY:-200}
PRE=${PRE:-0.50}                 # a slightly longer pre-roll than the feature, since it comes in on a crossfade
TAIL=${TAIL:-1.0}                # room to read the CTA — too long and a still frame lingers after the narration
BGM_VOL=${BGM_VOL:-0.30}
DUCK_RELEASE=${DUCK_RELEASE:-250}
TARGET_RATE=${TARGET_RATE:-4.4}  # target speech rate for the brand narration (chars/sec, spaces and punctuation excluded)
CHARS=${CHARS:-0}                # script char count — 0 skips atempo normalization

VOICE=$(ls outro-voice.* 2>/dev/null | head -1)
[ -n "$VOICE" ] || { echo "outro-voice.* missing"; exit 1; }
[ -f outro-card.png ] || { echo "outro-card.png missing"; exit 1; }
mkdir -p work

# ── 1) Narration normalization (same rule as build-reel.sh: loose trim + loudnorm -16)
if head -c 4 "$VOICE" | LC_ALL=C grep -q RIFF; then INARGS=(-i "$VOICE")
else INARGS=(-f s16le -ar 24000 -ac 1 -i "$VOICE"); fi
ffmpeg -y -v error "${INARGS[@]}" -af "
  silenceremove=start_periods=1:start_silence=0.10:start_threshold=-50dB:detection=peak,
  areverse,silenceremove=start_periods=1:start_silence=0.20:start_threshold=-55dB:detection=peak,areverse,
  loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000" -ac 1 -ar 48000 work/ov.wav
L=$(ffprobe -v error -show_entries format=duration -of csv=p=0 work/ov.wav)

# ── 1.5) Speech-rate normalization (same clamp as build-reel.sh [0.88, 1.18], skipped within ±5%)
if [ "$CHARS" -gt 0 ]; then
  R0=$(awk -v c="$CHARS" -v l="$L" 'BEGIN{printf "%.2f", c/l}')
  F=$(awk -v t="$TARGET_RATE" -v r="$R0" 'BEGIN{f=t/r; if (f>0.95 && f<1.05) f=1; if (f<0.88) f=0.88; if (f>1.18) f=1.18; printf "%.4f", f}')
  if [ "$F" != "1.0000" ]; then
    ffmpeg -y -v error -i work/ov.wav -af "atempo=$F" work/ov2.wav && mv work/ov2.wav work/ov.wav
    L=$(ffprobe -v error -show_entries format=duration -of csv=p=0 work/ov.wav)
  fi
  echo "outro: ${CHARS} chars, ${R0} chars/s → atempo x$F"
fi

# ── 2) Fix the duration (frame ceiling) + sample-exact audio
D0=$(awk -v p="$PRE" -v l="$L" -v t="$TAIL" 'BEGIN{printf "%.6f", p+l+t}')
FRAMES=$(awk -v d="$D0" -v f="$FPS" 'BEGIN{n=d*f; printf "%d", (n==int(n))?n:int(n)+1}')
D=$(awk -v n="$FRAMES" -v f="$FPS" 'BEGIN{printf "%.6f", n/f}')
SAMPLES=$((FRAMES * SPF))
PRE_MS=$(awk -v p="$PRE" 'BEGIN{printf "%d", p*1000}')
ffmpeg -y -v error -i work/ov.wav \
  -af "adelay=${PRE_MS}:all=1,apad=whole_len=$SAMPLES,atrim=end_sample=$SAMPLES" \
  -ac 1 -ar 48000 work/on.wav
echo "outro: speech ${L}s → total ${D}s (${FRAMES}f)"

# ── 3) Video — if the card is already 1080×1920 fullframe, Ken Burns it as-is (v4 reels-native);
#      otherwise treat it as an old 4:5 card and pixel-pin it over a blurred background (v3 compatible)
CDIM=$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0:s=x outro-card.png)
if [ "$CDIM" = "${W}x${H}" ]; then
  ffmpeg -y -v error -loop 1 -framerate "$FPS" -t "$D" -i outro-card.png -filter_complex "
    [0:v]scale=$ZB:flags=lanczos,
         zoompan=z='1+0.035*on/$((FRAMES-1))':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':
         s=${W}x${H}:fps=$FPS,fade=t=in:st=0:d=0.45,format=yuv420p
  " -frames:v "$FRAMES" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p work/ovid.mp4
else
  # [portrait only] Old 4:5 card compatibility — pixel-pinned overlay on a blurred background (the v3
  # family). The coordinates (CW/CH/CX/CY) and the blurred background (1440x2560) are all absolute
  # values chosen for a 1080x1920 canvas, so they lose their meaning on any other canvas. As written,
  # feeding it a 1920x1080 card produces, with no error, a video with a landscape card on a portrait
  # blurred background — this turns that silent failure into a failure.
  CDW=${CDIM%%x*}; CDH=${CDIM##*x}
  [ "$W" = 1080 ] && [ "$H" = 1920 ] || {
    echo "✗ a ${W}x${H} outro needs a fullframe card — outro-card.png is ${CDIM}"
    echo "  the old 4:5 compatibility branch is for the 1080x1920 canvas only. Remake the card at ${W}x${H}."
    exit 1
  }
  [ "$CDW" -lt "$CDH" ] || {
    echo "✗ outro-card.png is landscape (${CDIM}) — the portrait canvas's old 4:5 branch takes portrait cards only"
    echo "  left as is, it would stretch the landscape card to ${CW}x${CH} over a portrait blurred background."
    exit 1
  }
  ffmpeg -y -v error -loop 1 -framerate "$FPS" -t "$D" -i outro-card.png -filter_complex "
    [0:v]scale=1440:2560:force_original_aspect_ratio=increase:flags=lanczos,crop=1440:2560,
         gblur=sigma=52,eq=brightness=0.10:saturation=0.85[bgsrc];
    [bgsrc]zoompan=z='1.02+0.02*on/$FRAMES':d=$FRAMES:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':
           s=1080x1920:fps=$FPS[bg];
    [0:v]scale=$CW:$CH:flags=lanczos,format=rgba,fade=t=in:st=0:d=0.40:alpha=1[card];
    [bg][card]overlay=x=$CX:y='$CY + 26*max(0\,1-t/0.40)':format=auto,format=yuv420p,fps=$FPS
  " -frames:v "$FRAMES" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p work/ovid.mp4
fi

# ── 4) Audio mix — duck when there's BGM, full fade-out at the end (the video's final close)
if [ -f outro-bgm.wav ]; then
  FOUT=$(awk -v d="$D" 'BEGIN{printf "%.3f", d-1.8}')
  ffmpeg -y -v error -i work/on.wav -stream_loop -1 -i outro-bgm.wav -filter_complex "
    [0:a]aformat=channel_layouts=stereo,asplit=2[vo_key][vo_mix];
    [1:a]atrim=0:$D,asetpts=PTS-STARTPTS,volume=$BGM_VOL,
         afade=t=in:st=0:d=0.4,afade=t=out:st=$FOUT:d=1.8[bgv];
    [bgv][vo_key]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=$DUCK_RELEASE:makeup=1[duck];
    [vo_mix][duck]amix=inputs=2:duration=first:dropout_transition=0,
         loudnorm=I=-14:TP=-1.0:LRA=11,aresample=48000[out]
  " -map "[out]" -ac 2 -ar 48000 work/omix.wav
else
  ffmpeg -y -v error -i work/on.wav -af "aformat=channel_layouts=stereo,loudnorm=I=-14:TP=-1.0:LRA=11,aresample=48000" \
    -ac 2 -ar 48000 work/omix.wav
fi

# ── 5) Mux (the same encoding family as the feature's final — it's used as an xfade re-encode input)
ffmpeg -y -v error -i work/ovid.mp4 -i work/omix.wav -map 0:v -map 1:a \
  -c:v libx264 -profile:v high -level 4.1 -preset slow -crf 18 -pix_fmt yuv420p \
  -g $((FPS*2)) -keyint_min "$FPS" -sc_threshold 0 -r "$FPS" \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart outro.mp4

RV=$(ffprobe -v error -select_streams v -show_entries stream=duration -of csv=p=0 outro.mp4)
RA=$(ffprobe -v error -select_streams a -show_entries stream=duration -of csv=p=0 outro.mp4)
echo "outro.mp4: video ${RV}s / audio ${RA}s"
