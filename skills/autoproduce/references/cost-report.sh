#!/usr/bin/env bash
# 생성 비용 집계 — tally.tsv(무엇을 몇 개 썼나) × prices.tsv(단가) → 리포트
#
# 사용:
#   cost-report.sh <tally.tsv> [--cap <USD>] [--prices <prices.tsv>]
#
# tally.tsv (탭 구분, 주석 #, 빈 줄 무시):
#   key <TAB> 수량 <TAB> 메모
#   예) image.gpt-image-2.high	1	storyboard: 커버 배경 scene-1
#       image.local	3	storyboard: points 배경 scene-2~4
#       veo.lite.1080p	8	produce: b-roll a1 — 8초 생성·4초 사용
#       tts.local	0.412	produce: 나레이션 412자
#       music.lyria-clip	1	produce: BGM 30초
#
# **수량은 prices.tsv 의 unit 열이 정한다** — 개수가 아니라 그 단위의 양이다.
#   tts.* 는 1000자 단위라 412자면 0.412 다. 412 로 적으면 1000배가 된다
#   (local 은 0 이라 안 보이지만 gemini 채널에서 그대로 청구액으로 나타난다).
#   veo.* 는 **생성 길이**다 — 8초 생성해 4초만 써도 8 이다(1080p 는 8초 전용).
#   seedance.* 는 요청한 초 그대로. 실측 completion_tokens 는 메모 열에 적는다.
#
# 메모 열 앞에 `storyboard:` / `produce:` 를 붙인다 — 리포트 표에서 단계별로
# 읽힌다. 규약 정본은 cost-tally.md 다.
#
# 종료 코드 — 그대로 읽는다:
#   0  정상 (상한을 줬으면 이내)
#   1  판정 불가 — 알 수 없는 key 이거나 단가가 미확인(?)이다. **$0 으로 넘기지 않는다**
#   2  상한 초과
#   3  입력 오류 (파일 없음·형식 깨짐)
#
# 사전 견적(쓰기 전)과 사후 리포트(쓴 뒤)에 같은 스크립트를 쓴다 — 견적과 청구가
# 다른 계산기로 나오면 상한이 의미를 잃는다.
set -euo pipefail

SELF_DIR=$(cd "$(dirname "$0")" && pwd)
PRICES="$SELF_DIR/prices.tsv"
CAP=""
TALLY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --cap)    CAP="${2:-}"; shift 2 ;;
    --prices) PRICES="${2:-}"; shift 2 ;;
    -*)       echo "알 수 없는 옵션: $1" >&2; exit 3 ;;
    *)        TALLY="$1"; shift ;;
  esac
done

[ -n "$TALLY" ] || { echo "사용: cost-report.sh <tally.tsv> [--cap USD] [--prices prices.tsv]" >&2; exit 3; }
[ -f "$TALLY" ]  || { echo "tally 파일 없음: $TALLY" >&2; exit 3; }
[ -f "$PRICES" ] || { echo "prices 파일 없음: $PRICES" >&2; exit 3; }

awk -F'\t' -v cap="$CAP" -v pf="$PRICES" '
  function trim(s) { gsub(/^[ \t\r]+|[ \t\r]+$/, "", s); return s }

  BEGIN {
    while ((getline line < pf) > 0) {
      if (line ~ /^[ \t]*#/ || trim(line) == "") continue
      n = split(line, f, "\t")
      if (n < 3) continue
      k = trim(f[1]); price[k] = trim(f[3]); unit[k] = trim(f[2]); grade[k] = (n >= 4 ? trim(f[4]) : "")
    }
    close(pf)
    printf "생성 비용 리포트 (단가 정본: %s)\n", pf
    printf "%-34s %8s %10s %12s  %s\n", "항목", "수량", "단가USD", "소계USD", "근거"
    printf "%s\n", "----------------------------------------------------------------------------------------"
    bad = 0; total = 0
  }

  /^[ \t]*#/ { next }
  trim($0) == "" { next }

  {
    k = trim($1); q = trim($2); memo = (NF >= 3 ? trim($3) : "")
    if (k == "") next
    if (!(k in price)) { printf "!! 알 수 없는 key: %s\n", k; bad = 1; next }
    if (price[k] == "?") { printf "!! 단가 미확인: %s (%s)\n", k, grade[k]; bad = 1; next }
    if (q !~ /^[0-9]+(\.[0-9]+)?$/) { printf "!! 수량이 숫자가 아님: %s <%s>\n", k, q; bad = 1; next }
    sub_ = price[k] * q
    total += sub_
    printf "%-34s %8s %10.4f %12.4f  %s%s\n", k, q, price[k], sub_, grade[k], (memo == "" ? "" : " · " memo)
  }

  END {
    printf "%s\n", "----------------------------------------------------------------------------------------"
    printf "%-34s %31.4f\n", "합계", total
    if (bad) { print "판정 불가 — 위 !! 줄을 해결하기 전에는 이 리포트를 비용 근거로 쓰지 않는다."; exit 1 }
    if (cap != "") {
      printf "상한 %.4f USD ", cap+0
      if (total > cap + 1e-9) { printf "→ 초과 (%.4f USD)\n", total - cap; exit 2 }
      printf "→ 이내 (여유 %.4f USD)\n", cap - total
    }
    exit 0
  }
' "$TALLY"
