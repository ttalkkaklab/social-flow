#!/usr/bin/env bash
# make-reels 공통 아웃트로 렌더 — 전 릴스에서 재사용하는 브랜드 마무리 영상 (1회 렌더 → assets/outro.mp4 커밋)
#
# 사용법: build-outro.sh <workdir>
#   <workdir>/outro-card.png   : 브랜드 아웃트로 카드 (1080x1920 풀프레임 권장)
#   <workdir>/outro-voice.*    : 브랜드 나레이션 (RIFF WAV 또는 raw PCM 24k/s16/mono)
#   <workdir>/outro-bgm.wav    : (선택) 아웃트로 전용 BGM — 없으면 무음 위 나레이션만
# 출력: <workdir>/outro.mp4
#
# 본편(build-reel.sh)과 동일한 화면 구성·인코딩 파라미터를 유지해야 xfade 접합이 균질하다.
set -euo pipefail
export LC_ALL=en_US.UTF-8

WORKDIR="${1:?사용법: build-outro.sh <workdir>}"
cd "$WORKDIR"

FPS=${FPS:-30}
SPF=$((48000 / FPS))
CW=${CW:-1024}; CH=${CH:-1280}
CX=${CX:-28};   CY=${CY:-200}
PRE=${PRE:-0.50}                 # 크로스페이드로 들어오므로 본편보다 살짝 긴 프리롤
TAIL=${TAIL:-1.0}                # CTA 읽을 여운 — 길면 나레이션 끝난 정지 화면이 남는다
BGM_VOL=${BGM_VOL:-0.30}
DUCK_RELEASE=${DUCK_RELEASE:-250}
TARGET_RATE=${TARGET_RATE:-4.4}  # 브랜드 나레이션 목표 발화속도 (자/초, 공백·구두점 제외)
CHARS=${CHARS:-0}                # 대본 자수 — 0 이면 atempo 정규화 생략

VOICE=$(ls outro-voice.* 2>/dev/null | head -1)
[ -n "$VOICE" ] || { echo "outro-voice.* 없음"; exit 1; }
[ -f outro-card.png ] || { echo "outro-card.png 없음"; exit 1; }
mkdir -p work

# ── 1) 나레이션 정규화 (build-reel.sh 와 동일 규칙: 완화 트림 + loudnorm -16)
if head -c 4 "$VOICE" | LC_ALL=C grep -q RIFF; then INARGS=(-i "$VOICE")
else INARGS=(-f s16le -ar 24000 -ac 1 -i "$VOICE"); fi
ffmpeg -y -v error "${INARGS[@]}" -af "
  silenceremove=start_periods=1:start_silence=0.10:start_threshold=-50dB:detection=peak,
  areverse,silenceremove=start_periods=1:start_silence=0.20:start_threshold=-55dB:detection=peak,areverse,
  loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000" -ac 1 -ar 48000 work/ov.wav
L=$(ffprobe -v error -show_entries format=duration -of csv=p=0 work/ov.wav)

# ── 1.5) 발화속도 정규화 (build-reel.sh 와 동일 클램프 [0.88, 1.18], ±5% 이내 생략)
if [ "$CHARS" -gt 0 ]; then
  R0=$(awk -v c="$CHARS" -v l="$L" 'BEGIN{printf "%.2f", c/l}')
  F=$(awk -v t="$TARGET_RATE" -v r="$R0" 'BEGIN{f=t/r; if (f>0.95 && f<1.05) f=1; if (f<0.88) f=0.88; if (f>1.18) f=1.18; printf "%.4f", f}')
  if [ "$F" != "1.0000" ]; then
    ffmpeg -y -v error -i work/ov.wav -af "atempo=$F" work/ov2.wav && mv work/ov2.wav work/ov.wav
    L=$(ffprobe -v error -show_entries format=duration -of csv=p=0 work/ov.wav)
  fi
  echo "outro: ${CHARS}자, ${R0}자/s → atempo x$F"
fi

# ── 2) duration 확정 (프레임 올림) + 샘플 정확 오디오
D0=$(awk -v p="$PRE" -v l="$L" -v t="$TAIL" 'BEGIN{printf "%.6f", p+l+t}')
FRAMES=$(awk -v d="$D0" -v f="$FPS" 'BEGIN{n=d*f; printf "%d", (n==int(n))?n:int(n)+1}')
D=$(awk -v n="$FRAMES" -v f="$FPS" 'BEGIN{printf "%.6f", n/f}')
SAMPLES=$((FRAMES * SPF))
PRE_MS=$(awk -v p="$PRE" 'BEGIN{printf "%d", p*1000}')
ffmpeg -y -v error -i work/ov.wav \
  -af "adelay=${PRE_MS}:all=1,apad=whole_len=$SAMPLES,atrim=end_sample=$SAMPLES" \
  -ac 1 -ar 48000 work/on.wav
echo "outro: 발화 ${L}s → 총 ${D}s (${FRAMES}f)"

# ── 3) 비디오 — 카드가 이미 1080×1920 풀프레임이면 그대로 켄번즈(v4 릴스 네이티브),
#      아니면 구 4:5 카드로 보고 블러 배경 위에 픽셀 고정 오버레이(v3 호환)
CDIM=$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0:s=x outro-card.png)
if [ "$CDIM" = "1080x1920" ]; then
  ffmpeg -y -v error -loop 1 -framerate "$FPS" -t "$D" -i outro-card.png -filter_complex "
    [0:v]scale=1620:2880:flags=lanczos,
         zoompan=z='1+0.035*on/$((FRAMES-1))':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':
         s=1080x1920:fps=$FPS,fade=t=in:st=0:d=0.45,format=yuv420p
  " -frames:v "$FRAMES" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p work/ovid.mp4
else
  ffmpeg -y -v error -loop 1 -framerate "$FPS" -t "$D" -i outro-card.png -filter_complex "
    [0:v]scale=1440:2560:force_original_aspect_ratio=increase:flags=lanczos,crop=1440:2560,
         gblur=sigma=52,eq=brightness=0.10:saturation=0.85[bgsrc];
    [bgsrc]zoompan=z='1.02+0.02*on/$FRAMES':d=$FRAMES:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':
           s=1080x1920:fps=$FPS[bg];
    [0:v]scale=$CW:$CH:flags=lanczos,format=rgba,fade=t=in:st=0:d=0.40:alpha=1[card];
    [bg][card]overlay=x=$CX:y='$CY + 26*max(0\,1-t/0.40)':format=auto,format=yuv420p,fps=$FPS
  " -frames:v "$FRAMES" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p work/ovid.mp4
fi

# ── 4) 오디오 믹스 — BGM 있으면 덕킹, 끝은 완전 페이드아웃 (영상의 최종 마침)
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

# ── 5) 먹싱 (본편 최종과 동일 인코딩 계열 — xfade 재인코딩 입력으로 쓰인다)
ffmpeg -y -v error -i work/ovid.mp4 -i work/omix.wav -map 0:v -map 1:a \
  -c:v libx264 -profile:v high -level 4.1 -preset slow -crf 18 -pix_fmt yuv420p \
  -g $((FPS*2)) -keyint_min "$FPS" -sc_threshold 0 -r "$FPS" \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart outro.mp4

RV=$(ffprobe -v error -select_streams v -show_entries stream=duration -of csv=p=0 outro.mp4)
RA=$(ffprobe -v error -select_streams a -show_entries stream=duration -of csv=p=0 outro.mp4)
echo "outro.mp4: video ${RV}s / audio ${RA}s"
