#!/usr/bin/env bash
# 빌드된 본편 중간에 클립을 끼워 넣는다 — build-reel.sh 는 아웃트로만 접합하므로 후처리다.
#
#   사용: splice-clip.sh <workdir> <삽입클립.mp4> <삽입시각T초> [<클립2.mp4> <T2초>]
#
#   쓰이는 곳:
#     · 도입 b-roll (produce §3·§6) — 커버 다음 구간에 생성 영상을 넣는다.
#     · 본문 b-roll — 회차당 생성 영상은 최대 2칸이다 (scenes-schema §broll).
#     · 시리즈 오프너 스팅어 — 훅 뒤 배치가 프로파일 계약인 채널.
#
#   클립이 둘이면 **한 번의 실행에서 함께** 접합한다. 두 번 나눠 부르면 두 번째 호출이
#   reel.mp4 를 다시 읽어 첫 접합을 지운다 — 입출력 이름이 고정이기 때문이다.
#
#   T = 앞 씬이 끝나는 시각. build-report.txt 의 해당 card 줄에서 확정 길이를 읽는다.
#   **T 는 전부 원본(reel.mp4) 타임라인 기준**이다 — 앞 클립이 밀어낼 길이를 미리
#   더하지 않는다. 미는 계산은 이 스크립트가 한다.
#   결과: <workdir>/reel-spliced.mp4 · reel-sub-spliced.mp4 · subs-spliced.srt
#
# 왜 프레임 정확이 중요한가: 자막은 절대 시각으로 박혀 있다. 클립을 넣으면 그 시각 이후
# 모든 자막이 클립 길이만큼 밀리는데, 밀어주는 값이 실제 삽입 길이와 다르면 영상 끝까지
# 자막이 어긋난다. 그래서 재인코딩 후 실측 길이로 시프트한다(공칭 길이를 믿지 않는다).
# 클립이 둘이면 각 자막 큐는 **자기 앞에 끼어든 클립들의 실측 길이 합**만큼 밀린다.
#
# 번인본은 자막이 이미 화면에 태워져 있어 시프트가 필요 없다 — 클린본과 같은 T·같은
# 클립으로 분할·접합만 하면 build-reel 의 ASS 스타일이 그대로 보존된다(srt 로 다시
# 태우면 폰트·위치·아웃라인이 원본과 달라진다).
set -euo pipefail
export LC_ALL=en_US.UTF-8

WORK="${1:?사용법: splice-clip.sh <workdir> <삽입클립.mp4> <T초> [<클립2.mp4> <T2초>]}"
shift
[ $# -ge 2 ] || { echo "✗ 삽입할 (클립 T) 쌍이 없다" >&2; exit 1; }
[ $(($# % 2)) -eq 0 ] || { echo "✗ 클립과 T 는 쌍으로 준다 — 인자 수가 홀수다" >&2; exit 1; }

CLIPS=(); TS=()
while [ $# -ge 2 ]; do
  C="$1"; T="$2"; shift 2
  [ -f "$C" ] || { echo "✗ 삽입 클립 없음: $C" >&2; exit 1; }
  CLIPS+=("$(cd "$(dirname "$C")" && pwd)/$(basename "$C")")
  TS+=("$T")
done
N=${#CLIPS[@]}
[ "$N" -le 2 ] || echo "⚠ 클립 $N 개 — 회차당 생성 영상 상한은 2칸이다(scenes-schema §broll)" >&2

cd "$WORK"
[ -f reel.mp4 ] || { echo "✗ reel.mp4 없음 — build-reel.sh 를 먼저 돌린다" >&2; exit 1; }
[ -f subs.srt ] || { echo "✗ subs.srt 없음" >&2; exit 1; }

FPS=${FPS:-30}
AFADE=${AFADE:-0.04}      # 조인 클릭음만 없앨 만큼 — 길이는 건드리지 않는다
mkdir -p splice
rm -f splice/*.mp4 splice/list-*.txt 2>/dev/null || true

say() { printf '%s\n' "$*"; }

# ── 0) 삽입 시각 정렬·검증 (입력 순서와 무관하게 시각 오름차순으로 처리한다)
for ((i = 0; i < N; i++)); do
  for ((j = 0; j < N - 1 - i; j++)); do
    if awk -v a="${TS[j]}" -v b="${TS[j+1]}" 'BEGIN{exit !(a > b)}'; then
      t=${TS[j]}; TS[j]=${TS[j+1]}; TS[j+1]=$t
      c=${CLIPS[j]}; CLIPS[j]=${CLIPS[j+1]}; CLIPS[j+1]=$c
    fi
  done
done

VDUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 reel.mp4)
say "── 본편 ${VDUR}s · 삽입 ${N}건"
for ((i = 0; i < N; i++)); do
  awk -v t="${TS[i]}" -v d="$VDUR" 'BEGIN{ if (t <= 0 || t >= d) exit 1 }' \
    || { echo "✗ 삽입 시각 ${TS[i]}s 가 영상 범위(0~${VDUR}s)를 벗어난다" >&2; exit 1; }
  if [ "$i" -gt 0 ]; then
    awk -v a="${TS[i-1]}" -v b="${TS[i]}" 'BEGIN{ if (b - a < 0.5) exit 1 }' \
      || { echo "✗ 삽입 시각 ${TS[i-1]}s·${TS[i]}s 가 너무 가깝다 — 사이 조각이 0.5s 미만이다" >&2; exit 1; }
  fi
  say "   · $(basename "${CLIPS[i]}") → ${TS[i]}s"
done

ENC=(-c:v libx264 -profile:v high -level 4.1 -pix_fmt yuv420p -r $FPS -c:a aac -ar 48000 -ac 2 -b:a 192k)

# ── 1) 본편을 삽입 시각들에서 조각낸다 (프레임 정확 — 재인코딩)
#    조각 경계 = 0 · T1 · T2 · … · 끝. 조각은 클립 수 + 1 개다.
BOUNDS=(0 "${TS[@]}" "$VDUR")
NSEG=$((N + 1))
for V in reel reel-sub; do
  [ -f "$V.mp4" ] || { say "· $V.mp4 없음 — 건너뜀"; continue; }
  for ((k = 0; k < NSEG; k++)); do
    ST=${BOUNDS[k]}; EN=${BOUNDS[k+1]}
    D=$(awk -v a="$ST" -v b="$EN" 'BEGIN{printf "%.6f", b - a}')
    # 페이드는 조각의 이음매에만 건다 — 영상 처음(k=0)과 끝(k=NSEG-1)은 원본 그대로 둔다
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

# ── 2) 삽입 클립을 같은 인코딩 계약으로 정규화 (오디오는 클립의 것을 그대로 살린다)
for ((i = 0; i < N; i++)); do
  CDUR_RAW=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${CLIPS[i]}")
  HAS_A=$(ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${CLIPS[i]}" | head -1)
  if [ -n "$HAS_A" ]; then
    ffmpeg -y -v error -i "${CLIPS[i]}" \
      -af "afade=t=in:st=0:d=$AFADE,afade=t=out:st=$(awk -v d="$CDUR_RAW" -v f="$AFADE" 'BEGIN{printf "%.3f", d - f}'):d=$AFADE" \
      "${ENC[@]}" "splice/clip${i}.mp4"
  else
    # 무음 클립 — 침묵 트랙을 붙여야 concat 이 성립한다
    say "· $(basename "${CLIPS[i]}") 에 오디오가 없다 — 침묵 트랙을 채운다"
    ffmpeg -y -v error -i "${CLIPS[i]}" -f lavfi -i anullsrc=r=48000:cl=stereo \
      -shortest "${ENC[@]}" "splice/clip${i}.mp4"
  fi
done

# ── 3) 실측 길이로 시프트량을 확정한다 (공칭 길이를 믿지 않는다)
SHIFTS=(); TOTAL_SHIFT=0
PIECES="조각"
for ((i = 0; i < N; i++)); do
  S=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "splice/clip${i}.mp4")
  SHIFTS+=("$S")
  TOTAL_SHIFT=$(awk -v a="$TOTAL_SHIFT" -v b="$S" 'BEGIN{printf "%.6f", a + b}')
done
for ((k = 0; k < NSEG; k++)); do
  SD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "splice/reel-s${k}.mp4")
  PIECES="$PIECES s${k}=$(awk -v v="$SD" 'BEGIN{printf "%.3f", v}')s"
  [ "$k" -lt "$N" ] && PIECES="$PIECES + 클립$((k + 1))=$(awk -v v="${SHIFTS[k]}" 'BEGIN{printf "%.3f", v}')s +"
done
say "── $PIECES"

# ── 4) 이어붙이기 (클린·번인 각각)
for V in reel reel-sub; do
  [ -f "splice/${V}-s0.mp4" ] || continue
  : > "splice/list-$V.txt"
  for ((k = 0; k < NSEG; k++)); do
    printf "file '%s-s%d.mp4'\n" "$V" "$k" >> "splice/list-$V.txt"
    [ "$k" -lt "$N" ] && printf "file 'clip%d.mp4'\n" "$k" >> "splice/list-$V.txt"
  done
  ffmpeg -y -v error -f concat -safe 0 -i "splice/list-$V.txt" -c copy -movflags +faststart "${V}-spliced.mp4"
  OUTD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${V}-spliced.mp4")
  say "── ${V}-spliced.mp4 ${OUTD}s (기대 $(awk -v d="$VDUR" -v s="$TOTAL_SHIFT" 'BEGIN{printf "%.3f", d + s}')s)"
done

# ── 5) 자막 시프트 — 각 큐를 자기 앞에 끼어든 클립들의 실측 길이 합만큼 뒤로
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
    """큐 시작 a 보다 앞선 삽입들의 실측 길이 합 — 뒤 삽입은 이 큐를 밀지 않는다"""
    return sum(s for t, s in zip(TS, SH) if a >= t)

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
            straddle[i] += 1       # T 를 걸치는 큐 — 삽입 클립이 자막 중간을 끊는다
    d = shift_for(a)
    if d:
        a += d; b += d; moved += 1
    out.append(f"{to_ts(a)} --> {to_ts(b)}")
open('subs-spliced.srt', 'w', encoding='utf-8').write("\n".join(out) + "\n")
print(f"── 자막: {moved}개 큐 시프트 (총 +{sum(SH):.3f}s)")
for i, t in enumerate(TS):
    print(f"   · {t}s 삽입(+{SH[i]:.3f}s) — 걸친 큐 {straddle[i]}개")
if any(straddle):
    print("⚠ T 를 걸친 자막이 있다 — 삽입 시각을 문장 경계로 옮겨야 한다")
PY

# ── 6) 길이 일치 확인 — 두 벌이 어긋나면 게시 후 자막만 밀린다
if [ -f reel-sub-spliced.mp4 ]; then
  CD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 reel-spliced.mp4)
  SD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 reel-sub-spliced.mp4)
  awk -v a="$CD" -v b="$SD" 'BEGIN{ d=a-b; if (d<0) d=-d;
    printf "── 길이 일치 검사: 클린 %.3fs vs 번인 %.3fs (차 %.3fs)\n", a, b, d;
    if (d > 0.05) { print "⚠ 두 벌의 길이가 다르다 — 접합 조각을 확인할 것"; } }'
fi

say "✓ reel-spliced.mp4 · reel-sub-spliced.mp4 · subs-spliced.srt"
