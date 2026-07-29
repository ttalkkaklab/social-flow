#!/usr/bin/env bash
# reveal 상태 / 알파 오버레이 PNG 캡처 — 헤드리스 Chrome 원샷.
#   --screenshot 는 파일을 쓰고도 프로세스가 안 죽는 이력이 있어 파일 폴링 + kill 로 우회한다.
#   알파 모드는 --default-background-color=00000000 이 필수 — 없으면 흰 배경이 베이크된다.
#
# 사용: capture-frames.sh <URL> <출력PNG> [alpha 0|1]
#   예) capture-frames.sh "file://.../reel.html?i=20&reveal=1&alpha=1&scrim=1" cards/a20r1.png 1
set -euo pipefail
URL="${1:?URL}"; OUT="${2:?출력경로}"; ALPHA="${3:-0}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
EXTRA=(); [ "$ALPHA" = "1" ] && EXTRA+=(--default-background-color=00000000)
mkdir -p "$(dirname "$OUT")"; rm -f "$OUT"
"$CHROME" --headless=new --disable-gpu --window-size=1080,1920 --hide-scrollbars \
  ${EXTRA[@]+"${EXTRA[@]}"} --screenshot="$OUT" "$URL" >/dev/null 2>&1 &
PID=$!
for _ in $(seq 1 60); do [ -s "$OUT" ] && sleep 0.4 && break; sleep 0.25; done
kill $PID 2>/dev/null || true; wait $PID 2>/dev/null || true
[ -s "$OUT" ] && echo "OK $OUT" || { echo "FAIL $URL" >&2; exit 1; }
