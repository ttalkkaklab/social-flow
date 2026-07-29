#!/usr/bin/env bash
# 채널 인트로 렌더 — veo 생성 원본을 1080×1920/30fps 로 정규화하고,
# 채널명 텍스트 플레이트 슬라이드 인 + 실픽셀 락업 크로스페이드 + 로고음 정렬 믹스를
# 얹어 마스터를 만들고 스팅어를 파생한다.
#
# 사용법: build-intro.sh <workdir>
#   <workdir>/intro-raw.mp4  : veo 최종 렌더 (9:16 — 해상도 무관, 1080×1920 로 정규화)
#   <workdir>/lockup.png     : 1080×1920 풀 락업 (배경+캐릭터+채널명 — lockup-template full 캡처)
#   <workdir>/text-plate.png : (선택) 투명 텍스트 플레이트 (text 모드 alpha 캡처) —
#                              있으면 TEXT_AT 부터 슬라이드 인 (채널명 리빌)
#   <workdir>/sonic.wav      : (선택) 로고음 — SONIC_AT 에 정렬 믹스, veo 오디오는 덕킹
# 출력: <workdir>/intro-master.mp4 · intro-stinger.mp4 · frames/ (검수 프레임)
#
# 인코딩은 build-outro.sh 최종 먹싱과 동일 계열 — 본편 xfade 접합 입력으로 쓸 수 있다.
set -euo pipefail
export LC_ALL=en_US.UTF-8

WORKDIR="${1:?사용법: build-intro.sh <workdir>}"
cd "$WORKDIR"

FPS=${FPS:-30}
TRIM_START=${TRIM_START:-0}      # 도입 정체 컷 (초) — 마스터 총장을 7초대로 조일 때
LOCKUP_XF=${LOCKUP_XF:-0.6}      # 실픽셀 락업 크로스페이드 길이 — 생성 왜곡 최종 보정
HOLD=${HOLD:-0.8}                # 엔딩 정지 홀드 — 락업 각인 여운 (베스트 프랙티스 0.5~1s)
STINGER=${STINGER:-2.5}          # 스팅어 길이 — 마스터 꼬리 컷 (쇼트폼 결합용 ≤2.5s)
AUDIO=${AUDIO:-native}           # native = veo 오디오 사용 | none = veo 오디오 제거
FADE_OUT=${FADE_OUT:-0.5}        # 오디오 엔딩 페이드 — 소닉 로고 테일은 살리고 끝만 정리
SONIC_VOL=${SONIC_VOL:-1.0}      # 로고음 게인 (최종 loudnorm 전 밸런스)
ROOMTONE=${ROOMTONE:-0}          # 1 = 저레벨 룸톤 베드 전 구간 믹스 (무음 개시·급단절 방지)

[ -f intro-raw.mp4 ] || { echo "intro-raw.mp4 없음"; exit 1; }
[ -f lockup.png ]    || { echo "lockup.png 없음"; exit 1; }
LDIM=$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0:s=x lockup.png)
[ "$LDIM" = "1080x1920" ] || { echo "lockup.png 은 1080x1920 이어야 함 (현재 $LDIM)"; exit 1; }

D_RAW=$(ffprobe -v error -show_entries format=duration -of csv=p=0 intro-raw.mp4)
D0=$(awk -v d="$D_RAW" -v t="$TRIM_START" 'BEGIN{printf "%.3f", d-t}')
awk -v d="$D0" 'BEGIN{exit !(d>1.5)}' || { echo "TRIM_START 과다 — 잔여 ${D0}s"; exit 1; }
D=$(awk -v d="$D0" -v h="$HOLD" 'BEGIN{printf "%.3f", d+h}')
ST=$(awk -v d="$D0" -v x="$LOCKUP_XF" 'BEGIN{printf "%.3f", d-x}')          # 락업 페이드 시작
TEXT_AT=${TEXT_AT:-$(awk -v s="$ST" 'BEGIN{printf "%.3f", (s>1.4)?s-1.2:0.2}')}   # 채널명 리빌 시작
SONIC_AT=${SONIC_AT:-$(awk -v s="$ST" 'BEGIN{printf "%.3f", (s>0.2)?s-0.2:0}')}   # 로고음 임팩트 = 착지
AFST=$(awk -v d="$D" -v f="$FADE_OUT" 'BEGIN{printf "%.3f", d-f}')
SONIC_MS=$(awk -v s="$SONIC_AT" 'BEGIN{printf "%d", s*1000}')
mkdir -p frames

# ── 입력 배열 + 가변 인덱스 (text-plate·sonic 은 있을 때만 입력에 든다)
HAS_AUDIO=$(ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 intro-raw.mp4 | head -1)
[ "$AUDIO" = "native" ] && [ -z "$HAS_AUDIO" ] && { echo "경고: veo 오디오 없음 — 무시"; AUDIO=none; }
IN=(-ss "$TRIM_START" -i intro-raw.mp4 -loop 1 -framerate "$FPS" -t "$D" -i lockup.png)
IDX=2; TP_IDX=""; SN_IDX=""
if [ -f text-plate.png ]; then IN+=(-loop 1 -framerate "$FPS" -t "$D" -i text-plate.png); TP_IDX=$IDX; IDX=$((IDX+1)); fi
if [ -f sonic.wav ];      then IN+=(-i sonic.wav); SN_IDX=$IDX; IDX=$((IDX+1)); fi

# ── 비디오 그래프 — 정규화 → (텍스트 슬라이드 인) → 락업 크로스페이드 → 엔딩 홀드
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

# ── 오디오 그래프 — veo 오디오 × 로고음 조합 4경로, 최종 loudnorm -14 통일
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
     apad,atrim=0:${D},afade=t=out:st=${AFST}:d=${FADE_OUT}[a]"   # 길이·피크(-1dBFS) 보증

ffmpeg -y -v error "${IN[@]}" -filter_complex "${VF};${AF}" -map "[v]" -map "[a]" \
  -c:v libx264 -profile:v high -level 4.1 -preset slow -crf 18 -pix_fmt yuv420p \
  -g $((FPS*2)) -keyint_min "$FPS" -sc_threshold 0 -r "$FPS" \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart intro-master.mp4

# ── 스팅어 — 마스터 꼬리 컷 (채널명·로고음·락업 포함 구간), 오디오만 짧게 페이드인
SS=$(awk -v d="$D" -v s="$STINGER" 'BEGIN{printf "%.3f", (d>s)?d-s:0}')
ffmpeg -y -v error -i intro-master.mp4 -ss "$SS" -af "asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.15" \
  -c:v libx264 -profile:v high -level 4.1 -preset slow -crf 18 -pix_fmt yuv420p \
  -g $((FPS*2)) -keyint_min "$FPS" -sc_threshold 0 -r "$FPS" \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart intro-stinger.mp4

# ── 검수 프레임 — 1fps 시퀀스 + 최종 프레임 (락업 일치 판정용)
ffmpeg -y -v error -i intro-master.mp4 -vf fps=1 frames/f%02d.png
ffmpeg -y -v error -sseof -0.05 -i intro-master.mp4 -frames:v 1 -update 1 frames/last.png

RM=$(ffprobe -v error -show_entries format=duration -of csv=p=0 intro-master.mp4)
RS=$(ffprobe -v error -show_entries format=duration -of csv=p=0 intro-stinger.mp4)
echo "intro-master.mp4: ${RM}s (원본 ${D_RAW}s, 트림 ${TRIM_START}s, 홀드 ${HOLD}s)"
echo "타임라인: 텍스트 리빌 ${TEXT_AT}s → 로고음 ${SONIC_AT}s → 락업 XF ${ST}s"
echo "intro-stinger.mp4: ${RS}s / 검수 프레임: frames/ ($(ls frames | wc -l | tr -d ' ')장)"
