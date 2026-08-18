#!/usr/bin/env bash
# record.sh — start/stop a screen+mic recording with macOS's built-in screencapture.
#
#   record.sh start <output.mov>    # start recording in the background (main display only)
#   record.sh stop  <output.mov>    # end with SIGINT → wait for the file to be finalized
#   record.sh status <output.mov>   # check whether a recording is running
#
# It always records the single display marked "main" in System Settings (-D 1, fixed).
# On a multi-monitor setup the secondary monitor isn't recorded, so it's free for
# checking status or doing other work.
#
# Prerequisites: the terminal app needs System Settings → Privacy & Security →
#                Screen Recording + Microphone. -g captures the default input
#                device (microphone) audio along with the screen.
#
# The microphone is whatever the "default input device" is at start time. The
# environment variables below can pin it down.
#   SF_MIC_DEVICE  name of the input device to switch to (e.g. "Shure MV6") — needs SwitchAudioSource
#   SF_MIC_VOLUME  input volume 0~100 — too low and the recording is quiet, too high and noise shows up
# Left unset, the current values stay as they are, but start prints the device and
# volume so they're on the record.
set -euo pipefail

CMD="${1:?usage: record.sh start|stop|status <output.mov>}"
OUT="${2:?output file path (.mov) required}"
PIDFILE="${OUT}.pid"

case "$CMD" in
  start)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "ERROR: already recording (pid $(cat "$PIDFILE"))" >&2; exit 1
    fi
    mkdir -p "$(dirname "$OUT")"

    # Microphone setup — -g captures the "default input device", so with the wrong
    # mic selected you find out only after the take is over. Rather than forcing a
    # value, print the current state. SF_MIC_DEVICE / SF_MIC_VOLUME override it.
    CURMIC="(no SwitchAudioSource — brew install switchaudio-osx)"
    if command -v SwitchAudioSource >/dev/null 2>&1; then
      if [ -n "${SF_MIC_DEVICE:-}" ]; then
        SwitchAudioSource -t input -s "$SF_MIC_DEVICE" >/dev/null 2>&1 || \
          echo "WARN: could not switch to input device '$SF_MIC_DEVICE' — continuing with the current one" >&2
      fi
      CURMIC="$(SwitchAudioSource -t input -c 2>/dev/null || echo '?')"
    fi
    if [ -n "${SF_MIC_VOLUME:-}" ]; then
      osascript -e "set volume input volume ${SF_MIC_VOLUME}" >/dev/null 2>&1 || true
    fi
    CURVOL="$(osascript -e 'input volume of (get volume settings)' 2>/dev/null || echo '?')"
    echo "Input device: ${CURMIC} / input volume: ${CURVOL}"

    # nohup+disown — the recording survives the calling shell exiting
    # -D 1 pins the main display — a second monitor never enters the frame
    nohup screencapture -v -g -x -D 1 "$OUT" >/dev/null 2>&1 &
    echo $! > "$PIDFILE"
    disown
    sleep 1
    if ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      rm -f "$PIDFILE"
      echo "ERROR: recording failed to start — check Screen Recording permission in System Settings" >&2
      exit 1
    fi
    echo "Recording started (pid $(cat "$PIDFILE"), main display) → $OUT"
    echo "To stop: record.sh stop $OUT"
    ;;
  stop)
    PID="$(cat "$PIDFILE" 2>/dev/null || true)"
    [ -n "$PID" ] || { echo "ERROR: not recording (no $PIDFILE)" >&2; exit 1; }
    kill -INT "$PID" 2>/dev/null || true
    # Wait for screencapture to finalize the mov container (write the moov atom)
    for _ in $(seq 1 40); do
      kill -0 "$PID" 2>/dev/null || break
      sleep 0.5
    done
    if kill -0 "$PID" 2>/dev/null; then
      echo "WARN: shutdown is dragging — forcing it (the file may be damaged)" >&2
      kill -TERM "$PID" 2>/dev/null || true
    fi
    rm -f "$PIDFILE"
    [ -s "$OUT" ] || { echo "ERROR: the output file is empty: $OUT" >&2; exit 1; }
    DUR="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" 2>/dev/null || echo '?')"
    echo "Recording stopped: $OUT (${DUR}s)"
    ;;
  status)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "Recording (pid $(cat "$PIDFILE")) → $OUT"
    else
      echo "Not recording"
    fi
    ;;
  *)
    echo "ERROR: unknown command: $CMD (start|stop|status)" >&2; exit 1
    ;;
esac
