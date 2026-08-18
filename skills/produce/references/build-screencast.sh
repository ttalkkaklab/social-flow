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
BGM_VOL=${BGM_VOL:-0.22}           # live voice is more dynamic than TTS — start low
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

# ── 0) 매니페스트 전개 — 씬 표(work/scenes.tsv) + ASS 자막 본문(work/subs.body)
#      씬 길이 프레임 올림과 자막 절대 시각 재배치를 한 곳(파이썬)에서 계산한다 —
#      bash 부동소수 루프로 나누면 자막 시각과 concat 오프셋이 서로 어긋난다.
SRC=$(python3 - "$FPS" <<'PYEOF'
import json, math, sys
fps = int(sys.argv[1])
d = json.load(open("edit.json"))
def asstime(t):
    if t < 0: t = 0.0
    h = int(t // 3600); m = int((t - h*3600) // 60); s = t - h*3600 - m*60
    return "%d:%02d:%05.2f" % (h, m, s)
def srttime(t):                       # SRT 는 hh:mm:ss,mmm — ASS 와 자리수·구분자가 다르다
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
    cs = totf / fps                       # 이 씬의 최종 타임라인 절대 오프셋
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
# 게시용 SRT 는 같은 subs 리스트에서 찍는다 — 번인본과 자막 파일이 한 원천을 공유해야
# 두 파일이 서로 다른 시각을 갖는 사고가 없다. 페이드 태그는 ASS 전용이라 뺀다.
with open("work/subs.srtbody", "w") as f:
    for i, (a, b, t) in enumerate(subs, 1):
        f.write("%d\n%s --> %s\n%s\n\n" % (i, srttime(a), srttime(b), t))
print(d["source"])
PYEOF
)
[ -f "$SRC" ] || { say "✗ 원본 녹화 없음: $SRC"; exit 1; }

SRCWH=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$SRC" | head -1)
SRCW=${SRCWH%%,*}; SRCH=${SRCWH##*,}
AUD=$(ffprobe -v error -select_streams a:0 -show_entries stream=index -of csv=p=0 "$SRC")
[ -n "$AUD" ] || { say "✗ 원본에 오디오 스트림 없음 — record.sh(-g 마이크 캡처)로 녹화했는지 확인"; exit 1; }
say "── 원본: $SRC (${SRCW}x${SRCH})"

# ── 0.5) 자산 해상도 선검사
#   강도가 자산마다 다르다 — 필터 그래프가 그것을 어떻게 먹는지가 정한다.
#     아웃트로  xfade 직결               → 정확 일치. 다르면 ffmpeg 이 죽는다
#     오버레이  overlay=0:0(스케일 없음)  → 정확 일치. 어긋나면 조용히 밀린다
#   녹화 원본은 검사하지 않는다 — scale=decrease,pad 가 어떤 해상도든 받는 것이 이 빌더의
#   전제이고, 크기 문제는 SHRINK 경고가 따로 본다. 통과하면 아무 말도 안 한다.
DIMBAD=0
assert_exact() {   # <경로> <역할>
  local got
  case "$1" in
    *.png|*.PNG) got=$(sips -g pixelWidth -g pixelHeight "$1" 2>/dev/null \
      | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{printf "%sx%s", w, h}') ;;
    *) got=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
         -of csv=p=0:s=x "$1" 2>/dev/null) ;;
  esac
  [ -n "$got" ] || { say "⚠ $2 $1 치수를 못 읽었다"; DIMBAD=1; return; }
  [ "$got" = "${W}x${H}" ] || {
    say "⚠ $2 $1 이 ${got} — 캔버스 ${W}x${H} 와 정확히 같아야 한다"; DIMBAD=1; }
}
[ -f "$OUTRO_ASSET" ] && assert_exact "$OUTRO_ASSET" "아웃트로"
while IFS=$'\t' read -r _ _ _ _ _ SOVL; do
  [ "${SOVL:-}" = "-" ] && continue
  [ -n "${SOVL:-}" ] && [ -f "$SOVL" ] && assert_exact "$SOVL" "오버레이"
done < work/scenes.tsv
if [ "$DIMBAD" = 1 ]; then
  if [ "$STRICT_DIM" = 1 ]; then
    say "✗ 자산 해상도 불일치 — STRICT_DIM=1 이라 첫 ffmpeg 전에 중단한다"; exit 1
  fi
  WARN=1
fi

# ── 1) 씬별 컷 — 비디오(크롭→fit→pad→오버레이) + 오디오(loudnorm→샘플 정확 패딩)
N=0
while IFS=$'\t' read -r -u 3 IDX ST D FRAMES CROP OVL; do
  [ -z "${IDX:-}" ] && continue
  N=$((N+1))
  SAMPLES=$((FRAMES * SPF))

  CROPF=""; EFFW=$SRCW
  if [ "$CROP" != "-" ]; then CROPF="crop=$CROP,"; EFFW=${CROP%%:*}; fi
  SHRINK=$(awk -v w="$EFFW" 'BEGIN{printf "%.1f", w/1080}')
  if awk -v s="$SHRINK" -v t="$SHRINK_WARN" 'BEGIN{exit !(s>t)}'; then
    say "⚠ scene $IDX 화면 축소 ${SHRINK}배 (>${SHRINK_WARN}) — 작은 글씨가 안 읽힙니다. crop 을 좁히거나 시연 앱 폰트를 키워 재촬영을 권고."
    WARN=1
  fi
  if awk -v d="$D" -v m="$MAX_SCENE" 'BEGIN{exit !(d>m)}'; then
    say "⚠ scene $IDX 길이 $(printf '%.1f' "$D")s > ${MAX_SCENE}s — 씬 분할 또는 발화 압축을 권고."
    WARN=1
  fi

  # 밴드: 폭 1080 fit(높이 상한 BAND_MAX_H) → 1080×1920 패딩. y 는 중심 정렬 후
  # 상한 클램프 — 짝수 스냅은 yuv420p 크로마 정렬용. tpad 는 원본 꼬리 부족분을
  # 마지막 프레임 클론으로 채우고 -frames:v 가 정확히 자른다.
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
    [ "$OVL" != "-" ] && { say "⚠ scene $IDX 오버레이 파일 없음: $OVL — 타이틀 없이 진행"; WARN=1; }
    ffmpeg -y -v error -ss "$ST" -t "$D" -i "$SRC" -filter_complex "
      $BASEF;[base]tpad=stop=-1:stop_mode=clone,fps=$FPS,format=yuv420p[v]" \
      -map "[v]" -frames:v "$FRAMES" -an -c:v libx264 -preset medium -crf 18 "work/v$IDX.mp4"
  fi

  # 오디오 — 육성 정리(저역·명료도·근접효과) → 씬별 loudnorm(음량 편차 정규화)
  #          → 샘플 정확 패딩/트림. apad·atrim 은 반드시 마지막이다 — concat 드리프트
  #          단언(2ms)이 이 샘플 수에 걸려 있다.
  #
  # sidechaincompress 가 저역(≤250Hz)만 전체 신호를 트리거로 눌러 준다. 카디오이드
  # 마이크는 가까이서 크게 말할 때만 저음을 부풀리므로(근접효과) 고정 EQ 로 깎으면
  # 조용히 말할 때 목소리가 얇아진다. "웅~" 하는 울림의 정체가 이것이다.
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
  say "$(printf 'scene %s | 컷 %ss + %.2fs | %sf | crop %s | 축소 x%s | overlay %s' \
        "$IDX" "$ST" "$D" "$FRAMES" "$CROP" "$SHRINK" "$([ "$HAS_OVL" = 1 ] && echo yes || echo no)")"
done 3< work/scenes.tsv

# ── 2) 본편 concat + 드리프트 단언
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
say "── 본편: video ${VT}s / voice ${NT}s / drift ${DRIFT}s (${N}씬)"
awk -v d="$DRIFT" 'BEGIN{exit !(d<=0.002)}' || { say "✗ 드리프트 허용치(2ms) 초과 — 빌드 중단"; exit 1; }
if awk -v t="$VT" 'BEGIN{exit !(t>90)}'; then
  say "⚠ 본편 ${VT}s > 90s 상한 — 씬 컷을 조이거나 씬을 줄이세요."
  WARN=1
fi

# ── 3) BGM 덕킹 믹스 (build-reel.sh 와 동일 머신)
FOUT=$(awk -v t="$NT" 'BEGIN{printf "%.3f", t-2.2}')
ffmpeg -y -v error -i work/narration.wav -stream_loop -1 -i bgm.wav -filter_complex "
  [0:a]aformat=channel_layouts=stereo,asplit=2[vo_key][vo_mix];
  [1:a]atrim=0:$NT,asetpts=PTS-STARTPTS,volume=$BGM_VOL,
       afade=t=in:st=0:d=1.2,afade=t=out:st=$FOUT:d=2.2[bgv];
  [bgv][vo_key]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=$DUCK_RELEASE:makeup=1[duck];
  [vo_mix][duck]amix=inputs=2:duration=first:dropout_transition=0,
       loudnorm=I=-14:TP=-1.0:LRA=11,aresample=48000[out]
" -map "[out]" -ac 2 -ar 48000 work/mix.wav

# ── 4) ASS 자막 파일 — build-reel.sh 와 동일 스타일 (밴드 y≈1380~1560, 대칭 마진 250)
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
  # 게시용 SRT — 줄끝은 CRLF(SubRip 원 스펙)
  awk '{printf "%s\r\n", $0}' work/subs.srtbody > subs.srt
  say "── 자막: $(grep -c '^Dialogue' subs.ass)줄 (번인 subs.ass / 게시 subs.srt) / 폰트 $SUB_FONT"
else
  rm -f subs.srt
  say "── 자막 없음 (subs.body 비어 있음 또는 SUB=0)"
fi

# ── 5) 렌더 + 아웃트로 접합 — -shortest 금지 (105ms 누적 실측, build-reel 승계)
#      자막은 따로 올리는 것이 원칙이라 reel.mp4 가 클린 마스터다. 번인본은 자막 파일을
#      못 받는 플랫폼용이며 클린본 재인코딩이 아니라 같은 원본에서 한 번 더 뽑는다.
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
fi

# ── 6) 최종 검증 + 커버 스틸
RV=$(ffprobe -v error -select_streams v -show_entries stream=duration -of csv=p=0 reel.mp4)
RA=$(ffprobe -v error -select_streams a -show_entries stream=duration -of csv=p=0 reel.mp4)
LUFS=$(ffmpeg -hide_banner -i reel.mp4 -af loudnorm=I=-14:TP=-1:LRA=11:print_format=summary -f null - 2>&1 | sed -n 's/.*Input Integrated: *\(.*\)/\1/p')
FSTART=$(xxd -l 48 reel.mp4 | grep -c moov || true)
say "── reel.mp4: video ${RV}s / audio ${RA}s / 라우드니스 ${LUFS} / faststart $([ "$FSTART" -ge 1 ] && echo OK || echo 미확인)"
# 번인본은 같은 원본·같은 필터체인이라 길이가 클린본과 같아야 한다 — 어긋나면 둘 중 하나가 옛 빌드다
if [ -f reel-sub.mp4 ]; then
  SV=$(ffprobe -v error -select_streams v -show_entries stream=duration -of csv=p=0 reel-sub.mp4)
  if awk -v a="$RV" -v b="$SV" 'BEGIN{exit (a-b<0.05 && b-a<0.05) ? 0 : 1}'; then
    say "── reel-sub.mp4: video ${SV}s (클린본과 일치)"
  else
    say "✗ reel-sub.mp4 길이 ${SV}s ≠ reel.mp4 ${RV}s — 같은 빌드 산출물이 아니다"; exit 1
  fi
fi
[ -s subs.srt ] && say "── subs.srt: $(grep -c ' --> ' subs.srt)큐 / $(wc -c < subs.srt | tr -d ' ')바이트 (FB 상한 200K)"
# ── 캔버스 대조 (게이트 6) — 선언과 실측이 어긋나면 진행 금지.
#   검사는 포맷과 무관하게 돌고 리포트 줄만 format.env 가 있을 때 붙인다.
#   `── ` 접두를 쓰고 `card ` 로 시작하지 않는다.
RDIM=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x reel.mp4)
if [ "$RDIM" != "${W}x${H}" ]; then
  say "✗ reel.mp4 가 ${RDIM} 인데 선언 캔버스는 ${W}x${H} 다 — 자산이나 필터가 어긋났다"
  exit 1
fi
[ -f format.env ] && say "── 캔버스: 선언 ${W}x${H} · 실측 ${RDIM}"

ffmpeg -y -v error -ss "$COVER_TS" -i reel.mp4 -frames:v 1 -q:v 2 cover.jpg
[ "$WARN" -eq 1 ] && say "── 경고 있음: 위 ⚠ 항목 확인"
say "── 완료"
