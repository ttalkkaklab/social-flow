#!/usr/bin/env bash
# Captures reveal states / alpha overlay PNGs — one-shot headless Chrome.
#   --screenshot has a history of writing the file without the process dying, so this works around it
#   with file polling + kill.
#   Alpha mode requires --default-background-color=00000000 — without it a white background is baked in.
#
# Usage: capture-frames.sh <URL> <output PNG> [alpha 0|1]
#   e.g. capture-frames.sh "file://.../reel.html?i=20&reveal=1&alpha=1&scrim=1" cards/a20r1.png 1
#
# Format: reads the file FORMAT_ENV points at to pick up CAP_W·CAP_H·URL_FMT.
#   **There is no cwd-relative fallback.** The intro skill calls this script from the repo root and
#   sends only the output to the episode directory — looking for `.work/format.env` relative to cwd
#   means that call never finds it and silently shoots portrait. The other way round, building an
#   intro from inside an episode directory leaks that episode's format into the lockup capture. Taking
#   only an absolute path closes both.
#
# **Never add --force-device-scale-factor.** At DPR 1, PNG pixels = CSS px, and every ffmpeg overlay
# coordinate and safe-zone calculation rests on that equality. A scale factor only makes the PNG
# bigger while the coordinates stay put, so the overlay lands off.
set -euo pipefail
URL="${1:?URL}"; OUT="${2:?output path}"; ALPHA="${3:-0}"

[ -n "${FORMAT_ENV:-}" ] && [ -f "$FORMAT_ENV" ] && . "$FORMAT_ENV"
CAP_W="${CAP_W:-1080}"; CAP_H="${CAP_H:-1920}"

# Auto-append the format parameter — appending it by hand at every call site misses one eventually.
# If it's already there, the caller's intent wins and it's left alone. Only a format= after `?`/`&`
# counts — though a URL with format= inside a `&bg=` value fools this check.
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

# Dimension assertion — holds the equality PNG pixels = requested window size = CSS px.
# What it catches: DPR contamination (slip in --force-device-scale-factor 2 and you get 2160x3840
# [measured]), Chrome clamping the window size, and a scrollbar coming back.
# **This assertion can't catch format.env not being propagated** — both the window and the expected
# value come from the same CAP_W/CAP_H, so they fall to portrait together with no contradiction
# [measured]. What catches that accident is the builder's asset precheck (an exact comparison of the
# overlay PNG against ${W}x${H}) and the capture-manifest.tsv audit record.
# This surface runs 200~240 times per episode, so it's silent on pass.
GOT=$(sips -g pixelWidth -g pixelHeight "$OUT" 2>/dev/null \
  | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{printf "%sx%s", w, h}')
if [ "$GOT" != "${CAP_W}x${CAP_H}" ]; then
  echo "✗ 캡처 치수 불일치: $OUT 이 $GOT (요청한 창 ${CAP_W}x${CAP_H})" >&2
  echo "  the PNG pixels no longer match the window size — suspect a DPR scale factor, a window clamp, or a scrollbar." >&2
  echo "  URL: $URL" >&2
  exit 1
fi

# Capture audit record — one file answers baseline reproduction, where a dimension assertion came
# from, and whether it ran with a landscape window.
# Only captures that passed the assertion get written. A mismatched PNG's URL mixed into the baseline
# list kills the replay right there. It adds nothing to stdout — a regression axis compares stdout
# character by character.
MANIFEST="${CAPTURE_MANIFEST:-$(dirname "$OUT")/capture-manifest.tsv}"
printf '%s\t%s\t%s\t%s\n' "$OUT" "$URL" "$CAP_W" "$CAP_H" >> "$MANIFEST" 2>/dev/null || true
echo "OK $OUT"
