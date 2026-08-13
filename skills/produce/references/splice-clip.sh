#!/usr/bin/env bash
# 빌드된 본편 중간에 클립을 끼워 넣는다 — build-reel.sh 는 아웃트로만 접합하므로 후처리다.
#
#   사용: splice-clip.sh <workdir> <삽입클립.mp4> <삽입시각T초>
#
#   쓰이는 곳:
#     · 도입 b-roll (produce §3·§6) — 커버 다음 구간에 생성 영상을 넣는다.
#       그 구간은 영상 사운드를 쓰므로 나레이션이 없다(produce 절대 규칙 9).
#     · 시리즈 오프너 스팅어 — 훅 뒤 배치가 프로파일 계약인 채널.
#
#   T = 앞 씬이 끝나는 시각. build-report.txt 의 해당 card 줄에서 확정 길이를 읽는다.
#   결과: <workdir>/reel-spliced.mp4 · reel-sub-spliced.mp4 · subs-spliced.srt
#
# 왜 프레임 정확이 중요한가: 자막은 절대 시각으로 박혀 있다. 클립을 넣으면 T 이후 모든
# 자막이 클립 길이만큼 밀리는데, 밀어주는 값이 실제 삽입 길이와 다르면 영상 끝까지
# 자막이 어긋난다. 그래서 재인코딩 후 실측 길이로 시프트한다(공칭 길이를 믿지 않는다).
#
# 번인본은 자막이 이미 화면에 태워져 있어 시프트가 필요 없다 — 클린본과 같은 T·같은
# 클립으로 분할·접합만 하면 build-reel 의 ASS 스타일이 그대로 보존된다(srt 로 다시
# 태우면 폰트·위치·아웃라인이 원본과 달라진다).
set -euo pipefail
export LC_ALL=en_US.UTF-8

WORK="${1:?사용법: splice-clip.sh <workdir> <삽입클립.mp4> <T초>}"
CLIP="${2:?삽입할 mp4}"
T="${3:?삽입 시각(초)}"

cd "$WORK"
[ -f reel.mp4 ] || { echo "✗ reel.mp4 없음 — build-reel.sh 를 먼저 돌린다" >&2; exit 1; }
[ -f subs.srt ] || { echo "✗ subs.srt 없음" >&2; exit 1; }
CLIP_ABS=$(cd "$(dirname "$CLIP")" && pwd)/$(basename "$CLIP")
[ -f "$CLIP_ABS" ] || { echo "✗ 삽입 클립 없음: $CLIP_ABS" >&2; exit 1; }

FPS=${FPS:-30}
AFADE=${AFADE:-0.04}      # 조인 클릭음만 없앨 만큼 — 길이는 건드리지 않는다
mkdir -p splice

say() { printf '%s\n' "$*"; }

# ── 1) 본편을 T 에서 자른다 (프레임 정확 — 재인코딩)
VDUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 reel.mp4)
say "── 본편 ${VDUR}s · 삽입 시각 ${T}s"
awk -v t="$T" -v d="$VDUR" 'BEGIN{ if (t<=0 || t>=d) { print "✗ T 가 영상 범위를 벗어난다"; exit 1 } }' || exit 1

ENC=(-c:v libx264 -profile:v high -level 4.1 -pix_fmt yuv420p -r $FPS -c:a aac -ar 48000 -ac 2 -b:a 192k)
FOUT=$(awk -v t="$T" -v f="$AFADE" 'BEGIN{printf "%.3f", t-f}')

for V in reel reel-sub; do
  [ -f "$V.mp4" ] || { say "· $V.mp4 없음 — 건너뜀"; continue; }
  ffmpeg -y -v error -i "$V.mp4" -t "$T" \
    -af "afade=t=out:st=${FOUT}:d=$AFADE" "${ENC[@]}" "splice/${V}-a.mp4"
  ffmpeg -y -v error -ss "$T" -i "$V.mp4" \
    -af "afade=t=in:st=0:d=$AFADE" "${ENC[@]}" "splice/${V}-b.mp4"
done

# ── 2) 삽입 클립을 같은 인코딩 계약으로 정규화 (오디오는 클립의 것을 그대로 살린다)
CDUR_RAW=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$CLIP_ABS")
HAS_A=$(ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "$CLIP_ABS" | head -1)
if [ -n "$HAS_A" ]; then
  ffmpeg -y -v error -i "$CLIP_ABS" \
    -af "afade=t=in:st=0:d=$AFADE,afade=t=out:st=$(awk -v d="$CDUR_RAW" -v f="$AFADE" 'BEGIN{printf "%.3f", d-f}'):d=$AFADE" \
    "${ENC[@]}" splice/clip.mp4
else
  # 무음 클립 — 침묵 트랙을 붙여야 concat 이 성립한다
  say "· 삽입 클립에 오디오가 없다 — 침묵 트랙을 채운다"
  ffmpeg -y -v error -i "$CLIP_ABS" -f lavfi -i anullsrc=r=48000:cl=stereo \
    -shortest "${ENC[@]}" splice/clip.mp4
fi

# ── 3) 실측 길이로 시프트량을 확정한다 (공칭 길이를 믿지 않는다)
SHIFT=$(ffprobe -v error -show_entries format=duration -of csv=p=0 splice/clip.mp4)
AD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 splice/reel-a.mp4)
BD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 splice/reel-b.mp4)
say "── 조각: a=${AD}s + 클립=${SHIFT}s + b=${BD}s"

# ── 4) 이어붙이기 (클린·번인 각각)
for V in reel reel-sub; do
  [ -f "splice/${V}-a.mp4" ] || continue
  printf "file '%s-a.mp4'\nfile 'clip.mp4'\nfile '%s-b.mp4'\n" "$V" "$V" > "splice/list-$V.txt"
  ffmpeg -y -v error -f concat -safe 0 -i "splice/list-$V.txt" -c copy -movflags +faststart "${V}-spliced.mp4"
  OUTD=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${V}-spliced.mp4")
  say "── ${V}-spliced.mp4 ${OUTD}s (기대 $(awk -v a="$AD" -v s="$SHIFT" -v b="$BD" 'BEGIN{printf "%.3f", a+s+b}')s)"
done

# ── 5) 자막 시프트 — T 이후 큐를 SHIFT 만큼 뒤로
python3 - "$T" "$SHIFT" <<'PY'
import re, sys
T = float(sys.argv[1]); SHIFT = float(sys.argv[2])

def to_s(ts):
    h, m, rest = ts.split(':')
    s, ms = rest.split(',')
    return int(h)*3600 + int(m)*60 + int(s) + int(ms)/1000

def to_ts(v):
    if v < 0: v = 0.0
    ms = int(round(v * 1000))
    h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

src = open('subs.srt', encoding='utf-8').read()
LINE = re.compile(r'^(\d\d:\d\d:\d\d,\d\d\d) --> (\d\d:\d\d:\d\d,\d\d\d)\s*$')
out, straddle, moved = [], 0, 0
for line in src.splitlines():
    m = LINE.match(line)
    if not m:
        out.append(line); continue
    a, b = to_s(m.group(1)), to_s(m.group(2))
    if a < T < b:
        straddle += 1          # T 를 걸치는 큐 — 삽입 클립이 자막 중간을 끊는다
    if a >= T:
        a += SHIFT; b += SHIFT; moved += 1
    out.append(f"{to_ts(a)} --> {to_ts(b)}")
open('subs-spliced.srt', 'w', encoding='utf-8').write("\n".join(out) + "\n")
print(f"── 자막: {moved}개 큐를 +{SHIFT:.3f}s 시프트 · T 를 걸친 큐 {straddle}개")
if straddle:
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
