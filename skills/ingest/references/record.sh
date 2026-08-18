#!/usr/bin/env bash
# record.sh — macOS 내장 screencapture 로 화면+마이크 녹화를 시작/정지한다.
#
#   record.sh start <출력.mov>    # 백그라운드 녹화 시작 (메인 모니터만)
#   record.sh stop  <출력.mov>    # SIGINT 로 종료 → 파일 확정 대기
#   record.sh status <출력.mov>   # 녹화 중인지 확인
#
# 녹화 대상은 항상 시스템 설정의 "메인" 디스플레이 하나다 (-D 1 고정).
# 멀티 모니터에서 보조 모니터는 녹화되지 않으므로 현황 확인·다른 작업에
# 자유롭게 쓸 수 있다.
#
# 전제: 터미널 앱에 시스템 설정 → 개인정보 보호 및 보안 → 화면 기록 +
#       마이크 권한. -g 가 기본 입력 장치(마이크) 오디오를 함께 캡처한다.
#
# 마이크는 start 시점의 "기본 입력 장치"가 그대로 쓰인다. 아래 환경변수로 고정할 수 있다.
#   SF_MIC_DEVICE  전환할 입력 장치 이름 (예: "Shure MV6") — SwitchAudioSource 필요
#   SF_MIC_VOLUME  입력 볼륨 0~100 — 너무 낮으면 녹음이 작고, 너무 높으면 노이즈가 뜬다
# 설정하지 않으면 현재 값을 그대로 쓰되, start 가 장치·볼륨을 출력해 적는다.
set -euo pipefail

CMD="${1:?사용법: record.sh start|stop|status <출력.mov>}"
OUT="${2:?출력 파일 경로(.mov) 필요}"
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
