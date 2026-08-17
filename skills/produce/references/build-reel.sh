#!/usr/bin/env bash
# make-reels 본편 빌드 파이프라인 v3 — 릴스 네이티브 (L0~L5)
#   v2(제로 드리프트: 오디오 주도 + 프레임 올림 + 샘플 정확 패딩)의 오디오 머신은 그대로 두고,
#   비디오 측을 확장한다: 문장 경계 검출 → reveal 크로스페이드 체인 → 켄번즈 → ASS 자막 → b-roll 윈도우.
#
# 사용법: build-reel.sh <workdir>
#   <workdir>/cards.tsv : idx <TAB> 나레이션오디오경로 <TAB> 목표속도(자/초) <TAB> zoom(in|out|auto|none) [<TAB> opts]
#                         zoom=none 은 켄번즈를 안 건다 — 실촬영 클립처럼 이미 움직이는 화면용.
#                         5열 opts 는 "k=v,k=v" 다(생략 가능 — 4열 파일은 오늘 그대로 돈다):
#                           sync=1        오디오가 화면과 한 몸인 카드(사용자 촬영 클립의 육성).
#                                         프리롤·포스트롤·최소길이 0, 무음 트림·속도 보정 없음 —
#                                         잘라 내면 입과 소리가 어긋난다. 정규화(loudnorm)만 건다
#                                         (무음 클립이면 그것도 건너뛴다). 오디오는 클립에서 뽑은
#                                         wav 를 그대로 준다 — 카드 길이 = 그 오디오 길이.
#                           subs=<tsv>    이 카드의 자막을 파일로 준다: start<TAB>end<TAB>문장,
#                                         시각은 카드 시작 기준 초. 발화 경계 검출을 안 거치는
#                                         자막(전사본)용. segs.tsv 의 자막표기 열과 같이 쓰면 둘 다 나온다
#                           pan=<방향>[:z] 정지 사진의 켄번즈를 줌 대신 팬으로 — l2r|r2l|u2d|d2u,
#                                         z 는 배율(기본 1.12, KB_ZOOM_MIN~KB_ZOOM_MAX 로 클램프).
#                                         가로 캔버스용 — 세로는 팬 폭이 없어 쓰지 않는다
#   <workdir>/segs.tsv  : idx <TAB> seg(0..) <TAB> 비주얼경로 <TAB> TTS대본문장 <TAB> 자막표기문장
#                         비주얼 = reveal 상태 PNG(reel-template ?reveal=k 캡처) 또는 .mp4(풀스크린 b-roll)
#                         '|' 로 여러 개를 나열하면 그 문장의 발화 창 안에서 균등 분할해 계단식으로
#                         등장한다 — 불릿 수가 문장 수보다 많은 카드는 반드시 이렇게 나눈다
#                         또는 "영상.mp4::오버레이.png" — 알파 PNG(reel.html?alpha=1 캡처)를 영상 위에 합성
#                         (페르소나 발화 영상 + 배지·인용·서명 오버레이). 같은 영상을 잇는 세그는
#                         xfade 시점만큼 -ss 로 앞당겨 재생을 이어붙인다(전환 시 영상 점프 방지).
#                         경로 앞에 "@" 를 붙이면 **한 번만 재생**한다 — 첫 프레임부터 틀고 끝
#                         프레임에서 멈춘다(앞당김·루프 없음). 타이핑 카드처럼 처음부터 끝까지가
#                         한 동작인 클립용. "@영상.mp4::오버레이.png" 로 오버레이와 같이 쓸 수 있다
#                         TTS대본 = 자수·비례폴백용(한글 발음 표기) / 자막표기 = 화면용(숫자·단위 원표기)
#   <workdir>/bgm.wav   : 배경음악 (본편보다 짧으면 루프)
#   <workdir>/sfx.tsv   : (선택) idx <TAB> seg <TAB> 오디오파일 <TAB> bgm(on|off)
#                         그 세그 구간에만 나는 소리와 BGM 차단. 오디오파일은 wav·mp4 아무거나
#                         (영상이면 그 안의 소리를 쓴다), 비워 두고 bgm 만 off 로 적어도 된다.
#                         시각 기준은 문장 경계가 아니라 그 비주얼의 등장 시각이다
#   <workdir>/outro.mp4 : (선택) 공통 아웃트로 — 있으면 xfade+acrossfade 접합
#   <workdir>/fonts/    : (선택) 자막 폰트 ttf/otf — libass 는 woff2 를 못 읽는다
# 출력: <workdir>/reel.mp4 (자막 없는 클린 마스터 — 자막 파일을 따로 받는 플랫폼용)
#       <workdir>/reel-sub.mp4 (자막 번인본 — 자막 파일 경로가 없는 플랫폼용, BURN=0 이면 생략)
#       <workdir>/subs.srt (게시 툴에 그대로 넘기는 자막 파일), subs.ass (번인 원본)
#       <workdir>/cover.jpg, build-report.txt
#
# 동기화 원리 (v3):
#   오디오는 v2 와 동일하게 카드당 1파일 — 카드 duration 을 프레임 올림으로 확정하고 오디오를 정확히
#   FRAMES*(48000/FPS) 샘플로 패딩 → 누적 드리프트 0. reveal 은 순수 비디오 측 타이밍(문장 경계에 맞춘
#   xfade)이라 오디오를 건드리지 않는다 — 경계가 ±0.3s 틀려도 드리프트는 0 그대로.
#   문장 경계 = silencedetect 로 문장 사이 무음을 찾고(세그 수-1 개, 긴 것 우선), 부족하면 자수 비례 폴백.
#   누적 reveal 상태 PNG 간 xfade = 프레임 차이가 신규 요소뿐이므로 신규 요소만 제자리 페이드-인.
set -euo pipefail
export LC_ALL=en_US.UTF-8

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # cd 전에 잡아둔다 (reveal-timing.py 경로)
WORKDIR="${1:?사용법: build-reel.sh <workdir>}"
cd "$WORKDIR"

# 포맷 프리셋 — format-resolve.js 가 쓴 `: "${VAR:=값}"` 블록.
# 인라인 기본값보다 **앞**에서 읽어야 우선순위가 산다: 호출자 env → format.env → 인라인.
# 뒤에 두면 아래 ${VAR:-…} 가 먼저 값을 박아 format.env 가 영영 못 이긴다.
# 파일이 없으면 오늘과 같다 — 세로 회차는 이 줄이 생겨도 동작이 안 바뀐다.
[ -f format.env ] && . ./format.env

FPS=${FPS:-30}
SPF=$((48000 / FPS))               # 프레임당 오디오 샘플 수
PRE=${PRE:-0.40}                   # 프리롤 (카드 등장 여백)
POST=${POST:-0.70}                 # 포스트롤 (문장 여운)
MIN_DUR=${MIN_DUR:-4.0}            # 카드 최소 표시 시간
MAX_DUR=${MAX_DUR:-13.0}           # 초과 시 경고 (대본 축약 신호)
RATE_TOL=${RATE_TOL:-0.05}
ATEMPO_MIN=${ATEMPO_MIN:-0.88}; ATEMPO_MAX=${ATEMPO_MAX:-1.18}
RATE_LO=${RATE_LO:-3.2}; RATE_HI=${RATE_HI:-6.2}
BGM_VOL=${BGM_VOL:-0.28}
DUCK_RELEASE=${DUCK_RELEASE:-250}
SFX_VOL=${SFX_VOL:-0.85}           # 세그먼트 효과음 볼륨 (sfx.tsv)
BGM_GATE_R=${BGM_GATE_R:-0.30}     # BGM 차단 구간 앞뒤 램프 — 하드 컷은 끊겨 들린다
XFADE=${XFADE:-0.6}                # 본편↔아웃트로 전환 길이
XFADE_T=${XFADE_T:-fadeblack}      # 전환 종류 — fade 는 마지막 카드(인물 클로즈업)와 로고를 겹쳐 이중노출
REVEAL_D=${REVEAL_D:-0.35}         # reveal 페이드 최대 길이 (쉼이 짧으면 그 안에 맞춰 줄어든다)
REVEAL_GAP=${REVEAL_GAP:-0.05}     # 다음 문장 시작 이만큼 전에 등장 완료
REVEAL_LEAD=${REVEAL_LEAD:-0.30}   # 폴백 리드 — 쉼을 못 찾았을 때(자수 비례)만 쓰인다
SIL_DB=${SIL_DB:--37}              # 문장 경계 무음 임계 (dB)
SIL_MIN=${SIL_MIN:-0.16}           # 문장 경계 최소 무음 길이 (s)
ZOOM_SPAN=${ZOOM_SPAN:-0.035}      # 카드당 켄번즈 총 줌 폭 (3.5%)
W=${W:-1080}                       # 캔버스 폭 — 포맷이 정한다
H=${H:-1920}                       # 캔버스 높이
ZOOM_BASE=${ZOOM_BASE:-1620x2880}  # 켄번즈 소스 해상도 (캔버스의 1.5배)
ZB=${ZOOM_BASE/x/:}                # ffmpeg scale= 는 콜론 표기라 한 번 바꾼다
SUB=${SUB:-1}                      # 1=자막 데이터 생성(subs.srt·subs.ass), 0=자막 없음
BURN=${BURN:-1}                    # 1=번인본 reel-sub.mp4 도 산출, 0=클린 마스터만
SUB_FONT=${SUB_FONT:-Pretendard}   # fonts/ 에 ttf 가 없으면 fontconfig 폴백
OUTRO_ASSET=${OUTRO_ASSET:-outro.mp4}   # 접합할 아웃트로 — 포맷마다 다른 파일이다
STRICT_DIM=${STRICT_DIM:-0}        # 1=자산 해상도 불일치에 exit 1, 0=경고 한 줄
URL_FMT=${URL_FMT:-}               # 캡처 URL 에 붙일 포맷 파라미터 (세로는 빈 값)
SUB_SIZE=${SUB_SIZE:-58}           # ASS Fontsize
SUB_ML=${SUB_ML:-250}              # 자막 좌 마진
SUB_MR=${SUB_MR:-250}              # 자막 우 마진
SUB_MV=${SUB_MV:-380}              # 자막 하단 마진 (밴드 y≈1380)
SUB_OUT=${SUB_OUT:-5}              # 외곽선 두께
SUB_SHA=${SUB_SHA:-1.7}            # 그림자
KB_ZOOM_MIN=${KB_ZOOM_MIN:-1.06}   # 팬 베이스 배율 하한 (cards.tsv pan= 옵션)
KB_ZOOM_MAX=${KB_ZOOM_MAX:-1.35}   # 팬 베이스 배율 상한 — 이동폭 = W(z-1)
PAN_Z=${PAN_Z:-1.12}               # pan= 에 배율을 안 적었을 때

rm -rf work && mkdir -p work
# 옛 빌드의 자막·번인본을 먼저 지운다 — SUB=0 으로 다시 빌드했을 때 이전 subs.srt 가
# 남아 있으면 타이밍이 어긋난 자막이 게시된다(publish 는 파일 존재만 보고 복사한다)
rm -f subs.srt subs.ass reel-sub.mp4
REPORT=build-report.txt
: > "$REPORT"
WARN=0
say() { echo "$1"; echo "$1" >> "$REPORT"; }
f2() { awk -v v="$1" 'BEGIN{printf "%.2f", v}'; }
asstime() { awk -v t="$1" 'BEGIN{if(t<0)t=0; h=int(t/3600); m=int((t-h*3600)/60); s=t-h*3600-m*60; printf "%d:%02d:%05.2f", h, m, s}'; }
# SRT 는 hh:mm:ss,mmm — ASS(h:mm:ss.cc)와 자리수·구분자가 달라 역변환하지 않고 같은 원본에서 따로 찍는다
srttime() { awk -v t="$1" 'BEGIN{if(t<0)t=0; h=int(t/3600); m=int((t-h*3600)/60); s=t-h*3600-m*60; printf "%02d:%02d:%06.3f", h, m, s}' | tr '.' ','; }

[ -f cards.tsv ] || { echo "cards.tsv 없음"; exit 1; }
[ -f segs.tsv ] || { echo "segs.tsv 없음"; exit 1; }
[ -f bgm.wav ] || { echo "bgm.wav 없음"; exit 1; }

say "── make-reels build v3 ($(basename "$WORKDIR"))"

# 카드별 총 reveal 상태 수 — capture-reveals.sh 가 캡처하며 적는다. 있으면 "마지막 상태까지
# 다 썼는지"까지 검사한다(파일명만으로는 알 수 없는 결함). 없으면 건너뜀 검사만 돈다.
RTOTAL=""
for C in cards/reveals.tsv reveals.tsv; do [ -f "$C" ] && { RTOTAL="$C"; break; }; done
[ -n "$RTOTAL" ] || say "· reveals.tsv 없음 — 상태 완결성 검사는 '건너뜀'만 수행(캡처는 capture-reveals.sh 권장)"

# ── 0.5) 캔버스 프로브 + 자산 해상도 선검사
#   오늘은 두 사고가 전부 §12 에서, 즉 TTS·이미지·veo 비용을 다 쓴 뒤에 터진다.
#   여기서 3초 안에 잡는다. 통과하면 아무 말도 안 한다 — 게이트는 위반에서만 말한다.

# 프로브: CSS 캔버스가 창을 안 따라온 경우. frame.html?probe=1 이 캔버스 전체를 #FF00FF 로
# 칠하므로 네 모서리 픽셀이 전부 마젠타여야 한다.
# **이번 실행이 만든 frame.html 에만 건다** — frame.html 은 회차별 냉동 사본이라 보관본은
# probe 파라미터를 모르고 씬 0 을 평소대로 그린다. 무조건 걸면 옛 회차 재빌드가 첫 ffmpeg
# 전에 죽는다.
probe_canvas() {
  local html=$1 png=work/probe.png corner ok=1
  grep -q 'probe' "$html" 2>/dev/null || return 0
  # 창 크기를 **명시로 넘긴다** — capture-frames.sh 는 자식 프로세스이고 위 `${W:-1080}` 은
  # export 가 아니라 안 넘어간다. 안 넘기면 가로 빌드가 1080x1920 창으로 찍고 모서리를
  # (1919,1079) 에서 읽어 PNG 밖을 겨눈다 — 정상 캔버스인데 exit 1 하는 가짜 실패다.
  # format 파라미터도 같이 간다. 캔버스 크기가 템플릿의 .wide 클래스에 달려 있다.
  env CAP_W="$W" CAP_H="$H" "$HERE/capture-frames.sh" \
    "file://$PWD/$html?probe=1${URL_FMT:+&format=$URL_FMT}" "$png" 0 >/dev/null 2>&1 || {
    say "✗ 캔버스 프로브 캡처 실패 — $html"; exit 1; }
  for corner in "0:0" "$((W-1)):0" "0:$((H-1))" "$((W-1)):$((H-1))"; do
    local x=${corner%%:*} y=${corner##*:}
    local hex
    hex=$(ffmpeg -v error -i "$png" -vf "crop=1:1:$x:$y,format=rgb24" -f rawvideo - 2>/dev/null | xxd -p)
    [ "$hex" = "ff00ff" ] || { say "✗ 캔버스 프로브: (${x},${y}) 가 #${hex} — 마젠타가 아니다"; ok=0; }
  done
  [ "$ok" = 1 ] || { say "  CSS 캔버스가 ${W}x${H} 창을 안 따라왔다. 템플릿 :root 의 --w/--h 를 확인한다."; exit 1; }
}
[ -f frame.html ] && probe_canvas frame.html

# 자산 선검사: 검사 강도가 자산마다 다르다 — 필터 그래프가 그것을 어떻게 먹는지가 정한다.
#   접합 자산(아웃트로)  xfade 직결        → 정확 일치. 다르면 ffmpeg 이 죽는다
#   오버레이 PNG(:: 뒤)  overlay=0:0       → 정확 일치. 어긋나면 조용히 밀린다
#   b-roll·배경          scale=increase,crop → 방향만. 어떤 해상도든 받는다
# b-roll 에 정확 일치를 걸면 멀쩡한 회차가 경고를 문다 — 실측으로 720x1280 b-roll 이 있다.
DIMBAD=0
dim_of() {
  case "$1" in
    *.png|*.PNG) sips -g pixelWidth -g pixelHeight "$1" 2>/dev/null \
      | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{printf "%sx%s", w, h}' ;;
    *) ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
         -of csv=p=0:s=x "$1" 2>/dev/null ;;
  esac
}
assert_exact() {   # <경로> <역할>
  local got; got=$(dim_of "$1")
  [ -n "$got" ] || { say "⚠ $2 $1 치수를 못 읽었다"; DIMBAD=1; return; }
  [ "$got" = "${W}x${H}" ] || {
    say "⚠ $2 $1 이 ${got} — 캔버스 ${W}x${H} 와 정확히 같아야 한다"; DIMBAD=1; }
}
assert_orient() {  # <경로> <역할> — 방향만 본다
  local got w h; got=$(dim_of "$1")
  [ -n "$got" ] || { say "⚠ $2 $1 치수를 못 읽었다"; DIMBAD=1; return; }
  w=${got%%x*}; h=${got##*x}
  if [ "$W" -gt "$H" ]; then [ "$w" -gt "$h" ] || {
    say "⚠ $2 $1 이 ${got} — 가로 캔버스인데 세로 소스다. 중앙 크롭으로 화각 대부분이 잘린다"; DIMBAD=1; }
  else [ "$w" -lt "$h" ] || {
    say "⚠ $2 $1 이 ${got} — 세로 캔버스인데 가로 소스다. 중앙 크롭으로 화각 대부분이 잘린다"; DIMBAD=1; }
  fi
}

[ -f "$OUTRO_ASSET" ] && assert_exact "$OUTRO_ASSET" "아웃트로"
# segs.tsv 3열 파싱 — 빌드 루프와 **같은 규칙**이다(| 분해 · @ 접두 제거 · :: 뒤 절단).
# 다르게 짜면 선검사가 보는 집합과 빌드가 읽는 집합부터 어긋난다.
while IFS=$'\t' read -r _ _ VIS _; do
  [ -z "${VIS:-}" ] && continue
  IFS='|' read -ra PARTS <<< "$VIS"
  for PART in "${PARTS[@]}"; do
    [ -z "$PART" ] && continue
    PBASE="$PART"; POVL=""
    case "$PBASE" in *::*) POVL="${PBASE#*::}"; PBASE="${PBASE%%::*}";; esac
    PBASE="${PBASE#@}"
    [ -n "$PBASE" ] && [ -f "$PBASE" ] && assert_orient "$PBASE" "비주얼"
    [ -n "$POVL" ] && [ -f "$POVL" ] && assert_exact "$POVL" "오버레이"
  done
done < segs.tsv
if [ "$DIMBAD" = 1 ]; then
  if [ "$STRICT_DIM" = 1 ]; then
    say "✗ 자산 해상도 불일치 — STRICT_DIM=1 이라 첫 ffmpeg 전에 중단한다"; exit 1
  fi
  WARN=1
fi

# 세그먼트 효과음·BGM 차단 (선택) — sfx.tsv: idx <TAB> seg <TAB> 오디오파일 <TAB> bgm(on|off)
#   오디오파일은 wav 여도 mp4 여도 된다(영상이면 그 안의 소리를 쓴다). 비워 두고 bgm 만 off 로
#   적으면 그 세그 동안 음악만 빠진다.
SFXTSV=""; [ -f sfx.tsv ] && SFXTSV=sfx.tsv
# 챕터 입력(선택) — 챕터첫카드idx<TAB>ts문구. 부재 = chapters.txt 를 안 만든다.
CHAPTSV=""; [ -f chapters.tsv ] && CHAPTSV=chapters.tsv
: > work/chapstart.tsv
: > work/sfx.list
: > work/bgmgate.list

N=0
TOTF=0                              # 누적 프레임 (자막 절대 시각의 원천 — concat 이 샘플 정확이라 성립)
: > work/subs.body
: > work/subs.srtbody
SRTN=0                              # SRT 큐 순번 (1부터, 파일 전체 통번호)
: > work/order.txt

# fd 3 로 읽는다 — 루프 내부 ffmpeg 의 stdin 소비 방지 (v2 함정 승계)
# 5열(opts)은 없어도 된다 — read 가 남은 변수를 빈 값으로 채우므로 4열 파일은 오늘 그대로다.
while IFS=$'\t' read -r -u 3 IDX SRC TARGET ZDIR OPTS; do
  [ -z "${IDX:-}" ] && continue
  N=$((N+1))

  # ── 카드 옵션 (5열) — sync / subs / pan. 모르는 키는 실패다(오타가 조용히 무시되면
  #    sync 가 빠진 촬영 카드가 0.4초 어긋난 채 나가고 그것을 눈으로 잡아야 한다).
  SYNC=0; SUBSF=""; PAN=""; PZ="$PAN_Z"
  if [ -n "${OPTS:-}" ]; then
    IFS=',' read -ra OARR <<< "$OPTS"
    for KV in "${OARR[@]}"; do
      [ -z "$KV" ] && continue
      case "$KV" in
        sync=1) SYNC=1 ;;
        sync=0) SYNC=0 ;;
        subs=*) SUBSF="${KV#subs=}"; [ -f "$SUBSF" ] || { say "✗ card $IDX: subs 파일 없음 — $SUBSF"; exit 1; } ;;
        pan=*)  PAN="${KV#pan=}"; case "$PAN" in *:*) PZ="${PAN#*:}"; PAN="${PAN%%:*}";; esac
                case "$PAN" in l2r|r2l|u2d|d2u) : ;; *) say "✗ card $IDX: pan 방향 모름 — $PAN (l2r|r2l|u2d|d2u)"; exit 1;; esac
                PZ=$(awk -v z="$PZ" -v lo="$KB_ZOOM_MIN" -v hi="$KB_ZOOM_MAX" 'BEGIN{if(z<lo)z=lo; if(z>hi)z=hi; printf "%.3f", z}') ;;
        *) say "✗ card $IDX: cards.tsv 5열 옵션 모름 — $KV"; exit 1 ;;
      esac
    done
  fi
  # 촬영 카드(sync)는 여백을 안 둔다 — 프리롤이 있으면 화면은 0초부터 도는데 소리만 0.4초 늦다.
  if [ "$SYNC" -eq 1 ]; then CPRE=0; CPOST=0; CMIN=0; else CPRE=$PRE; CPOST=$POST; CMIN=$MIN_DUR; fi

  # 챕터 첫 카드면 절대 시작 프레임을 적어 둔다 — TOTF 는 아직 이 카드를 안 더한 값이라
  # 그대로 이 카드의 시작이다. 10단계 bgm.tsv 도 같은 값을 쓴다.
  if [ -n "$CHAPTSV" ]; then
    CHTS=$(awk -F'\t' -v i="$IDX" '$1==i{print $2; exit}' "$CHAPTSV")
    [ -n "$CHTS" ] && printf '%s\t%s\n' "$TOTF" "$CHTS" >> work/chapstart.tsv
  fi

  # ── 0) 카드의 세그먼트 로드 (seg 순서 보장)
  awk -F'\t' -v i="$IDX" '$1==i' segs.tsv | sort -t"$(printf '\t')" -k2,2n > "work/seg$IDX.tsv"
  VARR=(); TARR=(); SARR=(); CARR=(); CSV=""
  while IFS=$'\t' read -r -u 4 _ _SEG SVIS STTS SSUB; do
    [ -z "${SVIS:-}" ] && continue
    VARR+=("$SVIS"); TARR+=("$STTS"); SARR+=("$SSUB")
    SC=$(printf '%s' "$STTS" | sed -E 's/[[:space:][:punct:]]//g' | wc -m | tr -d ' ')
    CARR+=("$SC"); CSV="${CSV}${CSV:+,}${SC}"
  done 4< "work/seg$IDX.tsv"
  M=${#VARR[@]}
  [ "$M" -ge 1 ] || { say "✗ card $IDX: segs.tsv 에 세그먼트 없음"; exit 1; }
  TEXT=""; for t in "${TARR[@]}"; do TEXT="$TEXT$t"; done

  # ── 무발화 카드 (MUTE) ──────────────────────────────────────────────
  # 자수가 0인 카드가 있다. 영상 커버가 그 자리다 — 나레이션 없이 클립이 가진 소리로
  # 가고(produce 절대 규칙 9 와 같은 동작), cards.tsv 에는 그 길이만큼의 무음 wav 가
  # 오디오로 들어온다. 발화가 없으니 **발화속도라는 값 자체가 정의되지 않는다.**
  # 이 카드는 오디오 머신을 통째로 비켜 간다. 세 군데가 무발화에서 깨지기 때문이다(실측):
  #   ① silenceremove 가 무음을 전부 지워 길이가 N/A 가 되고 뒤의 ffmpeg 가 abort 한다
  #   ② loudnorm 이 무음을 증폭해 없던 잡음을 만든다
  #   ③ 발화속도 t/r 이 0 나눗셈으로 죽는다(awk 런타임 오류 + set -e)
  # 그래서 트림·정규화·속도 보정을 다 건너뛰고 준 오디오를 48k 로만 맞춰 그대로 쓴다.
  # 이 카드의 길이는 발화가 아니라 **오디오 길이 그대로**이고, 그 길이는 cards.tsv 를
  # 쓰는 쪽(§6)이 클립 길이에 맞춰 만든 무음 wav 가 정한다.
  C=$(printf '%s' "$TEXT" | sed -E 's/[[:space:][:punct:]]//g' | wc -m | tr -d ' ')
  MUTE=0; [ "$C" -eq 0 ] && MUTE=1

  # ── 1) 오디오: 포맷 판별 → 트림 → loudnorm  (v2 동일 · 무발화는 리샘플만)
  #   sync 카드는 세 번째 길이다 — 트림도 속도 보정도 없이 **정규화만**. 앞뒤를 자르면 그만큼
  #   화면과 어긋나고, loudnorm 은 시각을 안 옮긴다(클릭 1.000s → 1.000s 실측). 클립이 무음이면
  #   loudnorm 이 바닥 잡음을 -16 까지 끌어올리므로 그때는 리샘플만 한다.
  if head -c 4 "$SRC" | LC_ALL=C grep -q RIFF; then INARGS=(-i "$SRC")
  else INARGS=(-f s16le -ar 24000 -ac 1 -i "$SRC"); fi
  if [ "$SYNC" -eq 1 ]; then
    MEANV=$(ffmpeg -hide_banner "${INARGS[@]}" -af volumedetect -f null - 2>&1 | sed -n 's/.*mean_volume: \([-0-9.]*\) dB/\1/p')
    if [ -n "$MEANV" ] && awk -v v="$MEANV" 'BEGIN{exit !(v > -50)}'; then
      ffmpeg -y -v error "${INARGS[@]}" -af "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000" -ac 1 -ar 48000 "work/t$IDX.wav"
      SYNCNOTE="육성 정규화(loudnorm)"
    else
      ffmpeg -y -v error "${INARGS[@]}" -af "aresample=48000" -ac 1 -ar 48000 "work/t$IDX.wav"
      SYNCNOTE="무음 클립 — 정규화 생략"
    fi
    MUTE=1   # 아래 오디오 머신(속도·경고·atempo)을 통째로 비켜 간다 — 소리와 화면이 한 몸이다
  elif [ "$MUTE" -eq 1 ]; then
    ffmpeg -y -v error "${INARGS[@]}" -af "aresample=48000" -ac 1 -ar 48000 "work/t$IDX.wav"
  else
    ffmpeg -y -v error "${INARGS[@]}" -af "
      silenceremove=start_periods=1:start_silence=0.10:start_threshold=-50dB:detection=peak,
      areverse,silenceremove=start_periods=1:start_silence=0.20:start_threshold=-55dB:detection=peak,areverse,
      loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000" -ac 1 -ar 48000 "work/t$IDX.wav"
  fi

  L0=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "work/t$IDX.wav")
  R0=$(awk -v c="$C" -v l="$L0" 'BEGIN{printf "%.2f", (c>0 && l>0)? c/l : 0}')
  if [ "$SYNC" -eq 1 ]; then say "· card $IDX 촬영 sync — ${SYNCNOTE}, 트림·속도 보정 없음(오디오 ${L0}s 가 곧 카드 길이)"
  elif [ "$MUTE" -eq 1 ]; then say "· card $IDX 무발화 — 트림·정규화·속도 보정 건너뜀(오디오 원본 그대로 ${L0}s)"; fi

  # ── 2) TTS 재생성 권고 게이트 (v2 동일)
  if [ "$MUTE" -eq 0 ] && awk -v r="$R0" -v lo="$RATE_LO" -v hi="$RATE_HI" 'BEGIN{exit !(r<lo || r>hi)}'; then
    say "⚠ REGEN 권고: card $IDX 발화속도 ${R0}자/초 — 허용 [${RATE_LO},${RATE_HI}] 밖. 같은 레지스트리로 1회 재생성 후 재빌드하세요."
    WARN=1
  fi
  TAILV=$(ffmpeg -hide_banner -i "work/t$IDX.wav" -af "atrim=start=$(awk -v l="$L0" 'BEGIN{printf "%.3f",(l>0.2)?l-0.12:0}'),volumedetect" -f null - 2>&1 | sed -n 's/.*mean_volume: \([-0-9.]*\) dB/\1/p')
  if [ "$MUTE" -eq 0 ] && [ -n "$TAILV" ] && awk -v v="$TAILV" 'BEGIN{exit !(v > -20)}'; then
    say "⚠ REGEN 권고: card $IDX 끝 0.12s 음량 ${TAILV}dB — 문장이 잘린 채 생성됐을 수 있음. 청취 확인 필요."
    WARN=1
  fi

  # ── 3) 발화속도 정규화 atempo (v2 동일)
  if [ "$MUTE" -eq 1 ]; then F=1.0000
  else F=$(awk -v t="$TARGET" -v r="$R0" -v tol="$RATE_TOL" -v mn="$ATEMPO_MIN" -v mx="$ATEMPO_MAX" \
      'BEGIN{f=t/r; if (f>1-tol && f<1+tol) f=1; if (f<mn) f=mn; if (f>mx) f=mx; printf "%.4f", f}'); fi
  if [ "$F" = "1.0000" ]; then cp "work/t$IDX.wav" "work/s$IDX.wav"
  else ffmpeg -y -v error -i "work/t$IDX.wav" -af "atempo=$F" "work/s$IDX.wav"; fi
  L=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "work/s$IDX.wav")
  R=$(awk -v c="$C" -v l="$L" 'BEGIN{printf "%.2f", (c>0)? c/l : 0}')

  # ── 4) 문장 경계 검출 (세그 2개 이상일 때) — 무음 M-1개(긴 것 우선), 부족하면 자수 비례 폴백
  BLIST=""; BMETHOD="단일"
  if [ "$M" -gt 1 ]; then
    ffmpeg -hide_banner -nostats -i "work/s$IDX.wav" -af "silencedetect=noise=${SIL_DB}dB:d=$SIL_MIN" -f null - 2>&1 |
      awk '/silence_start:/{s=$NF}
           /silence_end:/{e=""; d=""; for(i=1;i<=NF;i++){if($i=="silence_end:")e=$(i+1); if($i=="silence_duration:")d=$(i+1)} if(e!="")print s, e, d}' \
      > "work/silraw$IDX.txt"
    awk -v L="$L" '$1>0.05 && $2<L-0.05' "work/silraw$IDX.txt" > "work/silin$IDX.txt"
    NSIL=$(wc -l < "work/silin$IDX.txt" | tr -d ' ')
    if [ "$NSIL" -ge $((M-1)) ]; then
      # 경계 = 무음 종료점(다음 문장의 시작) — reveal 은 이 시점 직전에 등장을 끝낸다
      BLIST=$(sort -k3,3gr "work/silin$IDX.txt" | head -n $((M-1)) | sort -k1,1g | awk '{printf "%s ", $2}')
      BMETHOD="검출 $((M-1))/$NSIL"
    else
      BLIST=$(awk -v L="$L" -v c="$CSV" 'BEGIN{n=split(c,a,","); tot=0; for(i=1;i<=n;i++)tot+=a[i];
              cum=0; for(i=1;i<n;i++){cum+=a[i]; printf "%.3f ", L*cum/tot}}')
      BMETHOD="비례폴백(무음 $NSIL/$((M-1)))"
      say "⚠ card $IDX 문장 경계 검출 실패(무음 $NSIL/$((M-1))) — 자수 비례로 폴백. 대본 문장 사이를 마침표로 분명히 끊으세요."
      WARN=1
    fi
    # 세그먼트 과단축 경고 (창이 0.9s 미만이면 reveal 이 겹쳐 보임)
    awk -v L="$L" 'BEGIN{p=0} {for(i=1;i<=NF;i++){if($i-p<0.9) short=1; p=$i}} END{if(L-p<0.9) short=1; exit !short}' <<< "$BLIST" \
      && { say "⚠ card $IDX 세그먼트 창 0.9s 미만 존재 — 문장 배분을 조정하세요."; WARN=1; }
  fi

  # ── 5) 카드 duration 확정 + 샘플 정확 오디오 조립 (v2 동일 — 드리프트 0 의 원천)
  D0=$(awk -v p="$CPRE" -v l="$L" -v q="$CPOST" 'BEGIN{printf "%.6f", p+l+q}')
  D1=$(awk -v d="$D0" -v m="$CMIN" 'BEGIN{printf "%.6f", (d>m)?d:m}')
  FRAMES=$(awk -v d="$D1" -v f="$FPS" 'BEGIN{n=d*f; printf "%d", (n==int(n))?n:int(n)+1}')
  D=$(awk -v n="$FRAMES" -v f="$FPS" 'BEGIN{printf "%.6f", n/f}')
  SAMPLES=$((FRAMES * SPF))
  if awk -v d="$D" -v m="$MAX_DUR" 'BEGIN{exit !(d>m)}'; then
    say "⚠ card $IDX 길이 ${D}s > ${MAX_DUR}s — 대본 축약을 권고합니다."
    WARN=1
  fi
  PRE_MS=$(awk -v p="$CPRE" 'BEGIN{printf "%d", p*1000}')
  ffmpeg -y -v error -i "work/s$IDX.wav" \
    -af "adelay=${PRE_MS}:all=1,apad=whole_len=$SAMPLES,atrim=end_sample=$SAMPLES" \
    -ac 1 -ar 48000 "work/n$IDX.wav"

  # ── 6) reveal 평탄화 + 전환 시각 산출
  #   상태 수를 문장 수에 묶지 않는다 — segs.tsv 비주얼을 '|' 로 나열하면 하위 reveal 이 된다.
  #   묶음의 마지막 상태만 쓰면 한 전환에서 불릿 2개+출처가 동시에 등장한다(v4 초판 실측 결함).
  #   시각은 reveal-timing.py 가 나레이션의 '쉼'에서 역산한다 — 고정 리드로는 가변 쉼에 못 맞춘다.
  BARR=(); for b in $BLIST; do BARR+=("$b"); done
  FVIS=(); SUBS=""
  for ((j=0; j<M; j++)); do
    IFS='|' read -r -a SUBV <<< "${VARR[$j]}"
    SUBS="${SUBS}${SUBS:+,}${#SUBV[@]}"
    for v in "${SUBV[@]}"; do FVIS+=("$v"); done
  done
  MV=${#FVIS[@]}
  FOFF=(0); FDUR=("$REVEAL_D")      # [0] 은 기저 상태 — 전환이 없다
  if [ "$MV" -gt 1 ]; then
    FB=""; case "$BMETHOD" in 비례폴백*) FB="--fallback";; esac   # 빈 배열은 bash 3.2 의 set -u 에서 죽는다
    TIMING=$(python3 "$HERE/reveal-timing.py" --pre "$CPRE" --speech "$L" --dur "$D" \
      --fade "$REVEAL_D" --gap "$REVEAL_GAP" --lead "$REVEAL_LEAD" \
      --silences "work/silin$IDX.txt" --bounds "$BLIST" --subs "$SUBS" \
      $FB --report 2>"work/rt$IDX.txt")
    while IFS=$'\t' read -r o d _w; do [ -n "$o" ] && { FOFF+=("$o"); FDUR+=("$d"); }; done <<< "$TIMING"
    [ "${#FOFF[@]}" -eq "$MV" ] || { say "✗ card $IDX 전환 시각 산출 실패(${#FOFF[@]}/$MV)"; exit 1; }
    GMIN=$(paste <(printf '%s\n' "${FOFF[@]:1}") <(printf '%s\n' "${FDUR[@]:1}") \
           | awk -v d="$D" '{if(NR>1){g=$1-pe; if(m==""||g<m)m=g} pe=$1+$2} END{g=d-pe; if(m==""||g<m)m=g; printf "%.2f", m}')
    awk -v g="$GMIN" 'BEGIN{exit !(g < 0.40)}' \
      && { say "⚠ card $IDX reveal 사이 여백 최소 ${GMIN}s (<0.40s) — 등장이 겹쳐 보입니다. 문장을 늘리거나 불릿을 줄이세요."; WARN=1; }
  fi
  # 상태 완결성 검사 — 캡처 규약 파일명 …r<k>.png 의 k 를 읽는다(순수 b-roll 세그는 자연히 빠진다).
  #   ① 건너뜀 → 그 전환에서 요소 여러 개가 동시에 등장한다
  #   ② 마지막 상태 미도달 → 마지막 요소가 영상에 한 번도 안 나온다
  #   ②는 파일명만으로는 알 수 없다. cards/reveals.tsv(capture-reveals.sh 가 캡처하며 남기는
  #   idx<TAB>총상태수)가 있어야 검사된다 — 없으면 ①만 돌고 리포트에 그 사실을 적는다.
  RSEQ=$(printf '%s\n' "${FVIS[@]}" | sed 's/.*:://' | sed -nE 's/.*r([0-9]+)\.png$/\1/p' | sort -n -u)
  if [ -n "$RSEQ" ]; then
    MISS=$(awk 'NR==1{p=$1; next} {if($1>p+1) for(k=p+1;k<$1;k++) printf "r%d ", k; p=$1}' <<< "$RSEQ")
    [ -n "$MISS" ] && { say "⚠ card $IDX reveal 상태 누락: $MISS — 한 전환에서 요소 여러 개가 동시에 등장합니다. 해당 세그 비주얼을 '|' 로 나눠 하위 reveal 로 배치하세요."; WARN=1; }
    if [ -n "$RTOTAL" ]; then
      RN=$(awk -F'\t' -v i="$IDX" '$1==i{print $2}' "$RTOTAL" | head -1)
      RMAX=$(tail -1 <<< "$RSEQ")
      if [ -n "$RN" ] && [ "$RMAX" -lt $((RN - 1)) ]; then
        say "⚠ card $IDX 마지막 reveal 상태 미사용: r$RMAX 까지만 씀 (총 ${RN}상태) — r$((RN-1)) 의 요소(마지막 불릿·출처)가 영상에 한 번도 안 나옵니다."
        WARN=1
      fi
    fi
  fi

  # ── 7) 비디오: 상태 체인(xfade) → 켄번즈(zoompan) — b-roll(.mp4)은 풀스크린 윈도우로 동참
  #        "영상::오버레이.png" 는 영상을 깔고 알파 PNG 를 합성. j>0 의 영상은 xfade 시점만큼 -ss 로
  #        앞당겨 시작해(루프 길이 모듈로) 전환을 넘어 재생이 이어진 것처럼 보이게 한다.
  #        경로 앞의 **`@` 는 한 번만 재생**이다 — 앞당기지도 잇지도 않고 클립 첫 프레임부터
  #        틀다가 끝 프레임에서 멈춘다. 타이핑 카드처럼 **처음부터 끝까지가 한 동작**인 클립용이다.
  #        (기본 동작을 그대로 두면 두 번 깨진다: j>0 은 모듈로 -ss 때문에 글자가 다 쳐진
  #         중간부터 시작하고, j=0 도 세그 창이 클립보다 길면 루프가 돌아 처음부터 다시 친다.)
  INS=(); FILT=""; NIN=0
  j=0
  for VIS in "${FVIS[@]}"; do
    if [ "$j" -eq 0 ]; then
      if [ "$MV" -gt 1 ]; then T=$(awk -v o="${FOFF[1]}" 'BEGIN{printf "%.3f", o+1.0}')
      else T=$(awk -v d="$D" 'BEGIN{printf "%.3f", d+0.5}'); fi
    else
      T=$(awk -v d="$D" -v o="${FOFF[$j]}" 'BEGIN{printf "%.3f", d-o+1.0}')
    fi
    BASE="$VIS"; OVL=""
    case "$VIS" in *::*) BASE="${VIS%%::*}"; OVL="${VIS#*::}";; esac
    ONESHOT=0; case "$BASE" in @*) ONESHOT=1; BASE="${BASE#@}";; esac
    BI=$NIN; HOLD=""
    case "$BASE" in
      *.mp4|*.mov|*.m4v|*.webm)
        if [ "$ONESHOT" = "1" ]; then
          # 클립이 세그 창보다 짧으면 끝 프레임을 복제해 채운다 — 루프가 아니라 정지다
          INS+=(-i "$BASE")
          HOLD="tpad=stop_mode=clone:stop=-1,trim=duration=$T,setpts=PTS-STARTPTS,"
        else
          SS=0
          if [ "$j" -gt 0 ]; then
            BDUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$BASE")
            SS=$(awk -v o="${FOFF[$j]}" -v d="$BDUR" 'BEGIN{if(d<=0){print 0; exit} printf "%.3f", o-int(o/d)*d}')
          fi
          INS+=(-ss "$SS" -stream_loop -1 -t "$T" -i "$BASE")
        fi ;;
      *) INS+=(-loop 1 -framerate "$FPS" -t "$T" -i "$BASE") ;;
    esac
    NIN=$((NIN+1))
    FILT+="[$BI:v]${HOLD}scale=$W:$H:force_original_aspect_ratio=increase:flags=lanczos,crop=$W:$H,fps=$FPS,settb=AVTB,setsar=1,format=yuv420p[b$j];"
    if [ -n "$OVL" ]; then
      OI=$NIN
      INS+=(-loop 1 -framerate "$FPS" -t "$T" -i "$OVL")
      NIN=$((NIN+1))
      FILT+="[$OI:v]format=rgba,settb=AVTB[o$j];[b$j][o$j]overlay=x=0:y=0:eof_action=repeat,format=yuv420p[i$j];"
    else
      FILT+="[b$j]null[i$j];"
    fi
    j=$((j+1))
  done
  CUR="[i0]"
  for ((j=1; j<MV; j++)); do
    FILT+="${CUR}[i$j]xfade=transition=fade:duration=${FDUR[$j]}:offset=${FOFF[$j]}[x$j];"
    CUR="[x$j]"
  done
  # 켄번즈 (in=푸시인 / out=풀아웃), auto 는 카드 홀짝 교대 — 컷마다 리듬이 바뀐다.
  #   z 는 반드시 출력 프레임 번호 on 의 함수로 쓴다. 흔히 보이는 누적 관용구
  #   min(zoom+step,top) 은 d=1 에서 동작하지 않는다 — zoompan 이 입력 프레임마다
  #   시퀀스를 새로 시작하며 zoom 을 초기값으로 되돌려 step 이 누적되지 않는다
  #   (ffmpeg 7.1.1 실측: 3초 클립 첫/끝 프레임의 요소 폭이 360px 로 동일 = 줌 0).
  ZLAST=$(( FRAMES > 1 ? FRAMES - 1 : 1 ))
  ZD="${ZDIR:-auto}"
  if [ "$ZD" = "auto" ]; then if [ $((N % 2)) -eq 1 ]; then ZD=in; else ZD=out; fi; fi
  if [ "$ZD" = "none" ]; then
    # 켄번즈 없음 — 실촬영 클립처럼 화면이 이미 움직이는 카드. 소스 확대(scale=ZB)도 안 한다.
    FILT+="${CUR}format=yuv420p[vout]"
  elif [ -n "$PAN" ]; then
    # 팬 — 배율 z 고정, 창이 한 방향으로 이동한다. 이동폭 = W(z-1)(가로) / H(z-1)(세로).
    case "$PAN" in
      l2r) PX="(iw-iw/zoom)*on/$ZLAST";     PY="ih/2-(ih/zoom/2)" ;;
      r2l) PX="(iw-iw/zoom)*(1-on/$ZLAST)"; PY="ih/2-(ih/zoom/2)" ;;
      u2d) PX="iw/2-(iw/zoom/2)";           PY="(ih-ih/zoom)*on/$ZLAST" ;;
      d2u) PX="iw/2-(iw/zoom/2)";           PY="(ih-ih/zoom)*(1-on/$ZLAST)" ;;
    esac
    ZD="pan:$PAN@$PZ"
    FILT+="${CUR}scale=$ZB:flags=lanczos,zoompan=z='$PZ':x='$PX':y='$PY':d=1:s=${W}x${H}:fps=$FPS,format=yuv420p[vout]"
  else
    if [ "$ZD" = "out" ]; then ZEXPR="1+$ZOOM_SPAN*(1-on/$ZLAST)"
    else ZEXPR="1+$ZOOM_SPAN*on/$ZLAST"; fi
    FILT+="${CUR}scale=$ZB:flags=lanczos,zoompan=z='$ZEXPR':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=$FPS,format=yuv420p[vout]"
  fi
  ffmpeg -y -v error "${INS[@]}" -filter_complex "$FILT" -map "[vout]" \
    -frames:v "$FRAMES" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p "work/v$IDX.mp4"

  # ── 7.5) 세그먼트 효과음 + BGM 차단 구간 (sfx.tsv 가 있을 때만)
  #   "그 구간에만 나는 소리"를 위한 자리다 — 타이핑 카드의 키보드 소리가 첫 사례다.
  #   시각 기준은 문장 경계가 아니라 **그 비주얼의 등장 시각 FOFF** 다. xfade 는 오프셋에서
  #   뒤 입력의 0초를 틀기 시작하므로, 경계에 맞추면 소리가 화면보다 서너 글자 앞선다.
  if [ -n "$SFXTSV" ]; then
    CS0=$(awk -v f="$TOTF" -v fps="$FPS" 'BEGIN{printf "%.4f", f/fps}')
    FJ=0
    for ((j=0; j<M; j++)); do
      SN=$(awk -F, -v k=$((j+1)) 'NR==1{print $k}' <<< "$SUBS")
      SPATH=$(awk -F'\t' -v i="$IDX" -v s="$j" '$1==i && $2==s{print $3}' "$SFXTSV" | head -1)
      SBGM=$(awk -F'\t' -v i="$IDX" -v s="$j" '$1==i && $2==s{print $4}' "$SFXTSV" | head -1)
      if [ -n "$SPATH" ] || [ "${SBGM:-}" = "off" ]; then
        WS=$(awk -v c="$CS0" -v o="${FOFF[$FJ]}" 'BEGIN{printf "%.3f", c+o}')
        if [ "$j" -lt $((M-1)) ]; then WE=$(awk -v c="$CS0" -v p="$CPRE" -v b="${BARR[$j]}" 'BEGIN{printf "%.3f", c+p+b}')
        else WE=$(awk -v c="$CS0" -v d="$D" 'BEGIN{printf "%.3f", c+d}'); fi
        if [ -n "$SPATH" ]; then
          [ -f "$SPATH" ] || { say "✗ card $IDX seg $j: sfx 파일 없음 — $SPATH"; exit 1; }
          printf '%s\t%s\n' "$WS" "$SPATH" >> work/sfx.list
        fi
        [ "${SBGM:-}" = "off" ] && printf '%s\t%s\n' "$WS" "$WE" >> work/bgmgate.list
        say "· card $IDX seg $j: 효과음 ${SPATH:-없음} @${WS}s · BGM ${SBGM:-on} (~${WE}s)"
      fi
      FJ=$((FJ + SN))
    done
  fi

  # ── 8) ASS 자막 라인 (자막표기 컬럼) — 시각은 카드 절대 오프셋(누적 프레임/FPS) 기준
  if [ "$SUB" = "1" ]; then
    CS=$(awk -v f="$TOTF" -v fps="$FPS" 'BEGIN{printf "%.4f", f/fps}')
    for ((j=0; j<M; j++)); do
      if [ "$j" -eq 0 ]; then ST=$(awk -v cs="$CS" -v p="$CPRE" 'BEGIN{s=p-0.15; if(s<0)s=0; printf "%.3f", cs+s}')
      else ST=$(awk -v cs="$CS" -v p="$CPRE" -v b="${BARR[$((j-1))]}" 'BEGIN{printf "%.3f", cs+p+b}'); fi
      if [ "$j" -lt $((M-1)) ]; then EN=$(awk -v cs="$CS" -v p="$CPRE" -v b="${BARR[$j]}" 'BEGIN{printf "%.3f", cs+p+b-0.06}')
      else EN=$(awk -v cs="$CS" -v p="$CPRE" -v l="$L" -v d="$D" 'BEGIN{e=p+l+0.45; if(e>d)e=d; printf "%.3f", cs+e}'); fi
      TXT=$(printf '%s' "${SARR[$j]}" | sed 's/[{}\\]//g')
      if [ -n "$TXT" ]; then
        printf 'Dialogue: 0,%s,%s,Sub,,0,0,0,,{\\fad(160,120)}%s\n' "$(asstime "$ST")" "$(asstime "$EN")" "$TXT" >> work/subs.body
        # 같은 ST/EN/TXT 에서 SRT 도 찍는다 — 번인본과 자막 파일이 한 원천을 공유해 드리프트가 생기지 않는다.
        # 페이드 태그({\fad})는 ASS 전용이라 뺀다 (SRT 는 서식 태그를 모른다).
        SRTN=$((SRTN+1))
        printf '%d\n%s --> %s\n%s\n\n' "$SRTN" "$(srttime "$ST")" "$(srttime "$EN")" "$TXT" >> work/subs.srtbody
      fi
    done
    # 파일 자막(subs=) — 카드 시작 기준 초를 절대 시각으로 옮긴다. 경계 검출을 안 거치므로
    # 전사본처럼 시각을 이미 아는 자막용이다. 카드 길이를 넘는 끝은 카드 끝으로 자른다.
    if [ -n "$SUBSF" ]; then
      NSF=0
      while IFS=$'\t' read -r FS FE FT; do
        [ -z "${FS:-}" ] && continue
        case "$FS" in \#*) continue;; esac
        FT=$(printf '%s' "${FT:-}" | sed 's/[{}\\]//g')
        [ -n "$FT" ] || continue
        ST=$(awk -v cs="$CS" -v s="$FS" 'BEGIN{if(s<0)s=0; printf "%.3f", cs+s}')
        EN=$(awk -v cs="$CS" -v e="$FE" -v d="$D" 'BEGIN{if(e>d)e=d; printf "%.3f", cs+e}')
        awk -v s="$ST" -v e="$EN" 'BEGIN{exit !(e>s)}' || continue
        printf 'Dialogue: 0,%s,%s,Sub,,0,0,0,,{\\fad(160,120)}%s\n' "$(asstime "$ST")" "$(asstime "$EN")" "$FT" >> work/subs.body
        SRTN=$((SRTN+1)); NSF=$((NSF+1))
        printf '%d\n%s --> %s\n%s\n\n' "$SRTN" "$(srttime "$ST")" "$(srttime "$EN")" "$FT" >> work/subs.srtbody
      done < "$SUBSF"
      say "· card $IDX 파일 자막 ${NSF}줄 ($SUBSF)"
    fi
  fi

  echo "$IDX" >> work/order.txt
  TOTF=$((TOTF + FRAMES))
  say "$(printf 'card %s | %s세그 | 경계 %s | %s자 | %s자/s | x%s | %s자/s | %.2fs | %ss | %sf | zoom:%s' \
        "$IDX" "$M" "$BMETHOD" "$C" "$R0" "$F" "$R" "$L" "$D" "$FRAMES" "$ZD")"
  # 변수 뒤에 한글이 붙으면 이름의 일부로 먹힌다 — 중괄호 필수
  if [ "$MV" -gt 1 ]; then
    say "  └ reveal ${MV}상태"
    while IFS= read -r line; do say "$line"; done < "work/rt$IDX.txt"
  fi
done 3< cards.tsv

# ── 9.0) chapters.txt — chapters.tsv 가 있을 때만
#   입력은 `챕터첫카드idx<TAB>ts문구` 2열이다. 시각은 카드 절대 시각(누적 프레임/FPS)에서
#   나오므로 사람이 mm:ss 를 세는 자리가 없다. 부재 = 오늘 동작(파일을 안 만든다).
#
#   **내림을 쓴다.** 챕터 경계는 문장 사이 쉼에 앉으므로, 타임스탬프가 진짜 시작보다 조금
#   앞서면 시청자가 쉼에 착지하고 조금 뒤서면 첫 낱말이 잘린다. splice 쪽은 반대로 올림인데
#   거기서는 지켜야 할 것이 다르다 — 삽입 클립 구간 안에 마커가 앉지 않는 것이고, 올림만이
#   그것을 보장한다(시프트 후 시각 ≥ 클립 끝).
if [ -n "$CHAPTSV" ] && [ -s work/chapstart.tsv ]; then
  awk -F'\t' -v fps="$FPS" '
    function ts(v,   h, m, s) { s = int(v); m = int(s/60); s -= m*60; h = int(m/60); m -= h*60;
      return h ? sprintf("%d:%02d:%02d", h, m, s) : sprintf("%02d:%02d", m, s) }
    { sec = int($1 / fps); printf "%s\t%s\n", ts(sec), $2; secs[NR] = sec; n = NR }
    END {
      bad = 0
      if (secs[1] != 0) { printf "✗ 첫 챕터가 %s 다 — 00:00 이어야 한다\n", ts(secs[1]) > "/dev/stderr"; bad = 1 }
      if (n < 3) { printf "✗ 챕터 %d개 — 유튜브는 3개 이상을 요구한다\n", n > "/dev/stderr"; bad = 1 }
      for (i = 2; i <= n; i++) if (secs[i] - secs[i-1] < 10) {
        printf "✗ %s → %s 간격 %ds — 10초 미만이다\n", ts(secs[i-1]), ts(secs[i]), secs[i]-secs[i-1] > "/dev/stderr"; bad = 1 }
      exit bad
    }' work/chapstart.tsv > chapters.txt || {
      say "✗ chapters.tsv 가 유튜브 챕터 요건을 어긴다 — 위 항목을 고친다"
      rm -f chapters.txt; exit 1; }
  say "── 챕터: $(wc -l < chapters.txt | tr -d ' ')개 → chapters.txt"
fi

# ── 9) 본편 concat + 드리프트 단언 (v2 동일)
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
say "── 본편: video ${VT}s / narration ${NT}s / drift ${DRIFT}s"
awk -v d="$DRIFT" 'BEGIN{exit !(d<=0.002)}' || { say "✗ 드리프트 허용치(2ms) 초과 — 빌드 중단"; exit 1; }

# ── 10) BGM 덕킹 믹스 (v2 동일) — sfx.tsv 가 있으면 효과음 트랙과 BGM 차단 구간이 얹힌다
FOUT=$(awk -v t="$NT" 'BEGIN{printf "%.3f", t-2.2}')

# 10a) 효과음 트랙 — 본편 길이의 무음에 각 효과음을 시작 시각만큼 지연시켜 얹는다.
#      나레이션에 섞지 않고 따로 만드는 이유: 덕킹의 키(vo_key)는 목소리만이어야 한다.
#      효과음이 키에 들어가면 키보드 소리가 BGM 을 눌러 음악이 딸꾹질한다.
SFXIN=""
if [ -s work/sfx.list ]; then
  SI=(-f lavfi -t "$NT" -i "anullsrc=r=48000:cl=mono"); SFC=""; SMIX="[0:a]"; SN2=1
  while IFS=$'\t' read -r ST SP; do
    SI+=(-i "$SP")
    SFC+="[$SN2:a]aresample=48000,aformat=channel_layouts=mono,adelay=$(awk -v s="$ST" 'BEGIN{printf "%d", s*1000}'):all=1,atrim=0:$NT[x$SN2];"
    SMIX+="[x$SN2]"; SN2=$((SN2+1))
  done < work/sfx.list
  ffmpeg -y -v error "${SI[@]}" -filter_complex \
    "${SFC}${SMIX}amix=inputs=$SN2:duration=first:normalize=0,volume=$SFX_VOL,apad,atrim=0:$NT[sx]" \
    -map "[sx]" -ac 1 -ar 48000 work/sfx.wav
  SFXIN="-i work/sfx.wav"
  say "── 효과음: $((SN2-1))개 (볼륨 $SFX_VOL)"
fi

# 10b) BGM 차단 — 구간마다 게이트를 곱한다. 하드 컷은 음악이 뚝 끊겨 들리므로 ${BGM_GATE_R}s 램프를 둔다.
#      게이트 = max(내려가는 경사, 올라가는 경사) — 구간 밖은 1, 구간 안은 0 이다.
BGMGATE=""
if [ -s work/bgmgate.list ]; then
  BGMGATE=$(awk -F'\t' -v r="$BGM_GATE_R" '
    {printf "%smax(min(1\\,max(0\\,(%s-t)/%s))\\,min(1\\,max(0\\,(t-%s)/%s)))", (NR>1?"*":""), $1, r, $2, r}' work/bgmgate.list)
  BGMGATE=",volume=eval=frame:volume='$BGMGATE'"
  say "── BGM 차단 $(wc -l < work/bgmgate.list | tr -d ' ')구간 (램프 ${BGM_GATE_R}s)"
fi

if [ -n "$SFXIN" ]; then VOMIX="[vo_raw][sfxa]amix=inputs=2:duration=first:normalize=0[vo_mix];"
else VOMIX="[vo_raw]anull[vo_mix];"; fi
ffmpeg -y -v error -i work/narration.wav -stream_loop -1 -i bgm.wav $SFXIN -filter_complex "
  [0:a]aformat=channel_layouts=stereo,asplit=2[vo_key][vo_raw];
  ${SFXIN:+[2:a]aformat=channel_layouts=stereo[sfxa];}
  $VOMIX
  [1:a]atrim=0:$NT,asetpts=PTS-STARTPTS,volume=$BGM_VOL,
       afade=t=in:st=0:d=1.2,afade=t=out:st=$FOUT:d=2.2$BGMGATE[bgv];
  [bgv][vo_key]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=$DUCK_RELEASE:makeup=1[duck];
  [vo_mix][duck]amix=inputs=2:duration=first:dropout_transition=0,
       loudnorm=I=-14:TP=-1.0:LRA=11,aresample=48000[out]
" -map "[out]" -ac 2 -ar 48000 work/mix.wav

# ── 11) ASS 자막 파일 — 밴드 y≈1380~1560 (템플릿 하단 세이프존과 계약, IG 캡션 존 위)
#      좌우 마진은 대칭(250) — 비대칭이면 중앙 정렬 자막이 화면 중심에서 밀리고(실측 60px),
#      168 이면 장문 한 줄이 액션바 시작선 x≈890 을 넘고(실측 907px), 200 이면 여유가
#      39~61px 로 화면 요소 중 최소가 된다 — 250 이 리스트·히어로와 같은 여유대다
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
  # 게시용 SRT — 줄끝은 CRLF(SubRip 원 스펙). 플랫폼 파서가 LF 를 받는지는 확인된 바 없어
  # 스펙 쪽에 맞춘다. 파일 끝 빈 줄 하나는 마지막 큐의 종료 표시라 남겨 둔다.
  awk '{printf "%s\r\n", $0}' work/subs.srtbody > subs.srt
  say "── 자막: ${SRTN}줄 (번인 subs.ass / 게시 subs.srt) / 폰트 $SUB_FONT"
fi

# ── 12) 렌더 + 아웃트로 접합 (아웃트로엔 자막 없음) — -shortest 금지 (v2 동일)
#      자막은 영상과 따로 올리는 것이 원칙이라 **클린 마스터가 reel.mp4** 다. 번인본은
#      자막 파일 경로가 없는 플랫폼(IG 릴스)용 별도 산출물이며, reel.mp4 를 다시 인코딩하지
#      않고 같은 원본에서 한 번 더 뽑는다 — 2세대 인코딩을 피해 두 파일 모두 1세대다.
ENC=(-c:v libx264 -profile:v high -level 4.1 -preset slow -crf 19 -pix_fmt yuv420p
     -g $((FPS*2)) -keyint_min "$FPS" -sc_threshold 0 -r "$FPS"
     -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart)
OFF=""
[ -f "$OUTRO_ASSET" ] && OFF=$(awk -v t="$VT" -v x="$XFADE" 'BEGIN{printf "%.6f", t-x}')

render() {                          # $1=출력파일  $2=자막필터(빈 문자열이면 번인 없음)
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
if [ -f "$OUTRO_ASSET" ]; then say "── 아웃트로 접합: xfade ${XFADE_T} ${XFADE}s @ ${OFF}s"
else say "── 아웃트로 없음: 본편 단독 먹싱"; fi

rm -f reel-sub.mp4
if [ "$BURN" = "1" ] && [ -n "$SUBFILTER" ]; then
  render reel-sub.mp4 "$SUBFILTER"
  say "── 번인본 reel-sub.mp4: 자막 파일을 못 받는 플랫폼용 (클린 마스터는 reel.mp4)"
elif [ "$BURN" = "1" ]; then
  say "⚠ BURN=1 이지만 자막 데이터가 없어 번인본을 만들지 않았다 (SUB=$SUB)"
  WARN=1
else
  say "── 번인 생략(BURN=0) — 모든 게시 대상이 자막 파일을 받는 경우에만 맞다"
fi

# ── 13) 최종 검증 (v2 동일)
RV=$(ffprobe -v error -select_streams v -show_entries stream=duration -of csv=p=0 reel.mp4)
RA=$(ffprobe -v error -select_streams a -show_entries stream=duration -of csv=p=0 reel.mp4)
LUFS=$(ffmpeg -hide_banner -i reel.mp4 -af loudnorm=I=-14:TP=-1:LRA=11:print_format=summary -f null - 2>&1 | sed -n 's/.*Input Integrated: *\(.*\)/\1/p')
FSTART=$(xxd -l 48 reel.mp4 | grep -c moov || true)
say "── reel.mp4: video ${RV}s / audio ${RA}s / 라우드니스 ${LUFS} / faststart $([ "$FSTART" -ge 1 ] && echo OK || echo 미확인)"
# 번인본은 같은 원본·같은 필터체인이라 길이가 클린본과 같아야 한다 — 어긋나면 두 파일 중
# 하나가 옛 빌드의 잔존물이다(플랫폼별로 다른 영상이 나가는 사고).
if [ -f reel-sub.mp4 ]; then
  SV=$(ffprobe -v error -select_streams v -show_entries stream=duration -of csv=p=0 reel-sub.mp4)
  if awk -v a="$RV" -v b="$SV" 'BEGIN{exit (a-b<0.05 && b-a<0.05) ? 0 : 1}'; then
    say "── reel-sub.mp4: video ${SV}s (클린본과 일치)"
  else
    say "✗ reel-sub.mp4 길이 ${SV}s ≠ reel.mp4 ${RV}s — 같은 빌드 산출물이 아니다"; exit 1
  fi
fi
# 자막 파일은 게시 툴에 그대로 넘어간다 — 여기서 비어 있으면 게시 단계에서야 발견된다
if [ "$SUB" = "1" ]; then
  if [ -s subs.srt ]; then say "── subs.srt: ${SRTN}큐 / $(wc -c < subs.srt | tr -d ' ')바이트 (FB 상한 200K)"
  else say "✗ SUB=1 인데 subs.srt 가 비었다 — segs.tsv 의 자막표기 컬럼을 확인할 것"; exit 1; fi
fi
# ── 캔버스 대조 (게이트 6) — 선언과 실측이 어긋나면 진행 금지.
#   **검사는 포맷과 무관하게 돌고 리포트 줄만 format.env 가 있을 때 붙인다.** 무조건 줄을
#   더하면 보관 회차 재빌드의 build-report.txt 가 그 자리에서 달라진다(회귀 축 ②).
#   `── ` 접두를 쓰고 `card ` 로 시작하지 않는다 — cardend() 의 /^card / 계약을 지킨다.
RDIM=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x reel.mp4)
if [ "$RDIM" != "${W}x${H}" ]; then
  say "✗ reel.mp4 가 ${RDIM} 인데 선언 캔버스는 ${W}x${H} 다 — 자산이나 필터가 어긋났다"
  exit 1
fi
[ -f format.env ] && say "── 캔버스: 선언 ${W}x${H} · 실측 ${RDIM}"

# 커버 = 히어로 스탯까지 모두 등장한 시점(자동 프레임은 훅 전달 실패 — 커버 최적화 조사 준거)
# 클린본에서 뽑는다 — 썸네일에 자막이 얹히면 커버 카피와 겹친다
ffmpeg -y -v error -ss "${COVER_TS:-3.2}" -i reel.mp4 -frames:v 1 -q:v 2 cover.jpg
[ "$WARN" -eq 1 ] && say "── 경고 있음: 위 ⚠ 항목 확인 (재생성 권고는 빌드를 막지 않음)"
say "── 완료"
