#!/usr/bin/env bash
# 카드의 reveal 상태를 "빠짐없이" 캡처한다 — 몇 개인지 사람이 고르지 않는다.
#
#   ?reveal=k 는 그룹 k 이하만 불투명하게 만든다. k 가 마지막 그룹을 넘어서면 그림이 더 이상
#   변하지 않으므로, k 를 올리며 찍다가 직전과 바이트 동일해지는 지점이 곧 상태 수 N 이다.
#   (document.title 의 rev= 를 읽는 방법은 못 쓴다 — 이 Chrome 은 --dump-dom 이 빈 출력이다.)
#
#   상태를 골라 찍으면 반드시 사고가 난다: v4 초판은 불릿 4개 카드에서 r1/r2/r4 만 찍어
#   한 전환에 불릿 2개가 동시에 등장했고, 불릿 3개인 프레임이 아예 존재하지 않았다.
#
# 사용: capture-reveals.sh <idx> <URL(reveal= 제외)> <출력접두어> [alpha 0|1] [최대탐색 12]
#   예) capture-reveals.sh 21 "file://…/reel.html?i=21&alpha=1&scrim=1&dim=1" cards/a21r 1
#       → cards/a21r0.png … cards/a21r4.png 캡처 + cards/reveals.tsv 에 "21<TAB>5" 기록
#
# 출력: 상태 수 N 을 stdout 에. REVEALS_TSV(기본 <접두어의 디렉토리>/reveals.tsv)에 idx<TAB>N 갱신.
#       이 파일이 있으면 build-reel.sh 가 "마지막 상태까지 다 썼는지"를 강하게 검사한다.
set -euo pipefail

IDX="${1:?사용법: capture-reveals.sh <idx> <URL> <출력접두어> [alpha] [최대]}"
URL="${2:?URL (reveal= 파라미터를 넣지 말 것)}"
PREFIX="${3:?출력접두어 — 예 cards/a21r}"
ALPHA="${4:-0}"
MAXK="${5:-12}"

case "$URL" in *reveal=*) echo "✗ URL 에 reveal= 이 있으면 안 된다 — 이 스크립트가 붙인다" >&2; exit 1;; esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CAP="$HERE/capture-frames.sh"
[ -x "$CAP" ] || { echo "✗ capture-frames.sh 없음: $CAP" >&2; exit 1; }

OUTDIR="$(dirname "$PREFIX")"; mkdir -p "$OUTDIR"
TSV="${REVEALS_TSV:-$OUTDIR/reveals.tsv}"
SEP=$([ "${URL#*\?}" = "$URL" ] && echo "?" || echo "&")

N=0
for ((k=0; k<=MAXK; k++)); do
  F="${PREFIX}${k}.png"
  "$CAP" "${URL}${SEP}reveal=${k}" "$F" "$ALPHA" >/dev/null
  if [ "$k" -gt 0 ] && cmp -s "${PREFIX}$((k-1)).png" "$F"; then
    rm -f "$F"          # k 는 마지막 그룹을 넘었다 — 앞 상태와 같은 그림
    N=$k
    break
  fi
done
[ "$N" -gt 0 ] || { echo "✗ card $IDX: ${MAXK}단계까지 상태가 계속 변한다 — 템플릿 rg 배정을 확인하라" >&2; exit 1; }

touch "$TSV"
awk -F'\t' -v i="$IDX" '$1!=i' "$TSV" > "$TSV.tmp"
printf '%s\t%s\n' "$IDX" "$N" >> "$TSV.tmp"
sort -k1,1n "$TSV.tmp" > "$TSV" && rm -f "$TSV.tmp"

echo "$N"
