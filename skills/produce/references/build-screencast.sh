#!/usr/bin/env bash
# build-screencast.sh — 촬영(스크린캐스트) 편집 파이프라인
#   사용자가 스토리보드 대본대로 촬영한 화면 녹화를 edit.json 정합대로 잘라
#   9:16 쇼트폼으로 조립한다. 오디오는 사용자 육성(녹화 원음) — TTS 없음.
#
#   드리프트 0 원리는 build-reel.sh v2 승계: 씬 길이를 프레임 올림으로 확정하고
#   오디오를 정확히 FRAMES*(48000/FPS) 샘플로 패딩 → concat 누적 오차 0.
#
# 사용법: build-screencast.sh <workdir>
#   <workdir>/edit.json   : 편집 매니페스트 (screencast-pipeline.md §edit.json 계약)
#                           {source, scenes:[{idx,start,end,crop?,overlay?,subs?}]}
#                           start/end/subs 시각은 전부 원본 녹화 시계(초) — 재배치는 빌드가 한다
#   <workdir>/cards/tN.png: (선택) 씬 타이틀 알파 오버레이 (screencast-overlay.html 캡처)
#   <workdir>/bgm.wav     : 배경음악 (본편보다 짧으면 루프)
#   <workdir>/outro.mp4   : (선택) 공통 아웃트로 — 있으면 xfade+acrossfade 접합
#   <workdir>/fonts/      : (선택) 자막 폰트 ttf — libass 는 woff2 를 못 읽는다
# 출력: <workdir>/reel.mp4 (자막 없는 클린 마스터) · reel-sub.mp4 (번인본, BURN=0 이면 생략)
#       subs.srt (게시용) · subs.ass (번인 원본) · cover.jpg · build-report.txt
#
# 합성 지오메트리 (1080×1920 캔버스):
#   상단 y 190~460   타이틀 블록 (오버레이 PNG — screencast-overlay.html 의 y=460 계약과 짝)
#   중단 y≥460       녹화 밴드 — 폭 1080 fit, 높이 상한 BAND_MAX_H, 중심 BAND_CY 정렬
#   하단 y 1380~1560 번인 자막 밴드 (build-reel.sh 와 동일 스타일·마진)
set -euo pipefail
export LC_ALL=en_US.UTF-8

WORKDIR="${1:?사용법: build-screencast.sh <workdir>}"
cd "$WORKDIR"

FPS=${FPS:-30}
SPF=$((48000 / FPS))               # 프레임당 오디오 샘플 수
BG=${BG:-#0b1020}                  # 캔버스 배경 — THEME.ink 를 넘긴다
BG="${BG#\#}"; BG="${BG#0x}"; BG="0x${BG}"   # '#'/'0x' 어느 표기든 0xRRGGBB 로 정규화
BAND_MAX_H=${BAND_MAX_H:-900}      # 녹화 밴드 높이 상한 (1380 자막 밴드 침범 방지)
BAND_CY=${BAND_CY:-880}            # 밴드 수직 중심 목표
BAND_MIN_Y=${BAND_MIN_Y:-460}      # 밴드 상단 하한 (타이틀 블록 y=460 계약)
MAX_SCENE=${MAX_SCENE:-20}         # 초과 시 경고 (씬 분할·재촬영 신호)
SHRINK_WARN=${SHRINK_WARN:-3.0}    # 화면 축소 배율 경고 임계 (글씨 가독)
BGM_VOL=${BGM_VOL:-0.22}           # 육성은 TTS 보다 다이내믹 — 낮게 시작
DUCK_RELEASE=${DUCK_RELEASE:-250}
XFADE=${XFADE:-0.6}                # 본편↔아웃트로 전환 길이
XFADE_T=${XFADE_T:-fadeblack}
SUB=${SUB:-1}                      # 1=자막 데이터 생성(subs.srt·subs.ass), 0=자막 없음
BURN=${BURN:-1}                    # 1=번인본 reel-sub.mp4 도 산출, 0=클린 마스터만
SUB_FONT=${SUB_FONT:-Pretendard}   # fonts/ 에 ttf 가 없으면 fontconfig 폴백
COVER_TS=${COVER_TS:-1.2}          # 커버 스틸 시각 (타이틀 오버레이가 보이는 프레임)

rm -rf work && mkdir -p work
# 옛 빌드의 자막·번인본을 먼저 지운다 — SUB=0 으로 다시 빌드했을 때 이전 subs.srt 가
# 남아 있으면 타이밍이 어긋난 자막이 게시된다(publish 는 파일 존재만 보고 복사한다)
rm -f subs.srt subs.ass reel-sub.mp4
REPORT=build-report.txt
: > "$REPORT"
WARN=0
say() { echo "$1"; echo "$1" >> "$REPORT"; }

[ -f edit.json ] || { echo "edit.json 없음"; exit 1; }
[ -f bgm.wav ] || { echo "bgm.wav 없음"; exit 1; }

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
    printf '[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n'
    printf '[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n'
    printf 'Style: Sub,%s,58,&H00FFFFFF,&H00FFFFFF,&H00281810,&H78000000,-1,0,0,0,100,100,0,0,1,5,1.7,2,250,250,380,1\n\n' "$SUB_FONT"
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
[ -f outro.mp4 ] && OFF=$(awk -v t="$VT" -v x="$XFADE" 'BEGIN{printf "%.6f", t-x}')

render() {                          # $1=출력파일  $2=자막필터(빈 문자열이면 번인 없음)
  local OUT="$1" SF="${2:-}" VSRC="[0:v]"
  [ -n "$SF" ] && VSRC="[vsub]"
  if [ -f outro.mp4 ]; then
    ffmpeg -y -v error -i work/video.mp4 -i work/mix.wav -i outro.mp4 -filter_complex "
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
if [ -f outro.mp4 ]; then say "── 아웃트로 접합: xfade ${XFADE_T} ${XFADE}s @ ${OFF}s"
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
ffmpeg -y -v error -ss "$COVER_TS" -i reel.mp4 -frames:v 1 -q:v 2 cover.jpg
[ "$WARN" -eq 1 ] && say "── 경고 있음: 위 ⚠ 항목 확인"
say "── 완료"
