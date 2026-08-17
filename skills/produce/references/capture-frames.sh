#!/usr/bin/env bash
# reveal 상태 / 알파 오버레이 PNG 캡처 — 헤드리스 Chrome 원샷.
#   --screenshot 는 파일을 쓰고도 프로세스가 안 죽는 이력이 있어 파일 폴링 + kill 로 우회한다.
#   알파 모드는 --default-background-color=00000000 이 필수 — 없으면 흰 배경이 베이크된다.
#
# 사용: capture-frames.sh <URL> <출력PNG> [alpha 0|1]
#   예) capture-frames.sh "file://.../reel.html?i=20&reveal=1&alpha=1&scrim=1" cards/a20r1.png 1
#
# 포맷: FORMAT_ENV 가 가리키는 파일을 읽어 CAP_W·CAP_H·URL_FMT 를 받는다.
#   **cwd 상대 폴백을 두지 않는다.** intro 스킬은 저장소 루트에서 이 스크립트를 부르고
#   출력만 회차 디렉토리로 보낸다 — `.work/format.env` 를 cwd 로 찾으면 그 호출이 영영
#   못 찾고 조용히 세로로 찍는다. 반대로 회차 디렉토리에서 인트로를 만들면 그 회차의
#   포맷이 락업 캡처로 새어 든다. 절대 경로만 받으면 두 경로가 함께 닫힌다.
#
# **--force-device-scale-factor 를 넣지 않는다.** DPR 1 이라 PNG 픽셀 = CSS px 이고,
# ffmpeg 오버레이 좌표·안전영역 계산이 전부 그 등식 위에 있다. 배율을 주면 PNG 만
# 커지고 좌표는 그대로라 오버레이가 어긋난다.
set -euo pipefail
URL="${1:?URL}"; OUT="${2:?출력경로}"; ALPHA="${3:-0}"

[ -n "${FORMAT_ENV:-}" ] && [ -f "$FORMAT_ENV" ] && . "$FORMAT_ENV"
CAP_W="${CAP_W:-1080}"; CAP_H="${CAP_H:-1920}"

# 포맷 파라미터 자동 부착 — 호출부마다 손으로 붙이면 한 자리를 빠뜨린다.
# 이미 적혀 있으면 호출자 뜻을 이긴다고 보고 그대로 둔다. `?`/`&` 뒤의 format= 만
# 본다 — 다만 `&bg=` 값 안에 format= 이 든 주소를 넘기면 이 검사가 속는다.
if [ -n "${URL_FMT:-}" ]; then
  case "$URL" in
    *[?\&]format=*) : ;;
    *\?*) URL="$URL&format=$URL_FMT" ;;
    *)    URL="$URL?format=$URL_FMT" ;;
  esac
fi

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
EXTRA=(); [ "$ALPHA" = "1" ] && EXTRA+=(--default-background-color=00000000)
mkdir -p "$(dirname "$OUT")"; rm -f "$OUT"
"$CHROME" --headless=new --disable-gpu --window-size=$CAP_W,$CAP_H --hide-scrollbars \
  ${EXTRA[@]+"${EXTRA[@]}"} --screenshot="$OUT" "$URL" >/dev/null 2>&1 &
PID=$!
for _ in $(seq 1 60); do [ -s "$OUT" ] && sleep 0.4 && break; sleep 0.25; done
kill $PID 2>/dev/null || true; wait $PID 2>/dev/null || true
[ -s "$OUT" ] || { echo "FAIL $URL" >&2; exit 1; }

# 치수 단언 — PNG 픽셀 = 요청한 창 크기 = CSS px 이라는 등식을 지킨다.
# 잡는 것은 DPR 오염(--force-device-scale-factor 2 를 끼우면 2160x3840 이 나온다【실측】),
# Chrome 이 창 크기를 클램프하는 경우, 스크롤바가 살아난 경우다.
# **format.env 미전파는 이 단언으로 못 잡는다** — 창도 기대값도 같은 CAP_W/CAP_H 에서
# 나오므로 함께 세로로 떨어져 자기모순이 없다【실측】. 그 사고를 잡는 것은 빌더의 자산
# 선검사(오버레이 PNG 를 ${W}x${H} 와 정확 대조)와 capture-manifest.tsv 감사 기록이다.
# 회차당 200~240회 도는 표면이라 통과할 때는 아무 말도 안 한다.
GOT=$(sips -g pixelWidth -g pixelHeight "$OUT" 2>/dev/null \
  | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{printf "%sx%s", w, h}')
if [ "$GOT" != "${CAP_W}x${CAP_H}" ]; then
  echo "✗ 캡처 치수 불일치: $OUT 이 $GOT (요청한 창 ${CAP_W}x${CAP_H})" >&2
  echo "  PNG 픽셀이 창 크기와 달라졌다 — DPR 배율·창 클램프·스크롤바를 의심한다." >&2
  echo "  URL: $URL" >&2
  exit 1
fi

# 캡처 감사 기록 — 기준선 재현·치수 단언의 출처·가로 창으로 돌았는지의 증거를 한 파일이 푼다.
# 단언을 통과한 캡처만 적는다. 어긋난 PNG 의 URL 이 기준선 목록에 섞이면 재생이 그 자리에서
# 죽는다. stdout 에는 아무것도 안 더한다 — 회귀 축이 stdout 을 문자 대조한다.
MANIFEST="${CAPTURE_MANIFEST:-$(dirname "$OUT")/capture-manifest.tsv}"
printf '%s\t%s\t%s\t%s\n' "$OUT" "$URL" "$CAP_W" "$CAP_H" >> "$MANIFEST" 2>/dev/null || true
echo "OK $OUT"
