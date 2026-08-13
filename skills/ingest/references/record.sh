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
      echo "ERROR: 이미 녹화 중 (pid $(cat "$PIDFILE"))" >&2; exit 1
    fi
    mkdir -p "$(dirname "$OUT")"

    # 입력(마이크) 준비 — -g 는 "기본 입력 장치"를 캡처하므로, 엉뚱한 마이크가
    # 잡혀 있으면 녹화가 끝난 뒤에야 안다. 값을 강제하지 않고 현재 상태를 찍어
    # 적는다. SF_MIC_DEVICE / SF_MIC_VOLUME 이 있으면 그 값으로 맞춘다.
    CURMIC="(SwitchAudioSource 없음 — brew install switchaudio-osx)"
    if command -v SwitchAudioSource >/dev/null 2>&1; then
      if [ -n "${SF_MIC_DEVICE:-}" ]; then
        SwitchAudioSource -t input -s "$SF_MIC_DEVICE" >/dev/null 2>&1 || \
          echo "WARN: 입력 장치 '$SF_MIC_DEVICE' 로 전환 실패 — 현재 장치로 진행" >&2
      fi
      CURMIC="$(SwitchAudioSource -t input -c 2>/dev/null || echo '?')"
    fi
    if [ -n "${SF_MIC_VOLUME:-}" ]; then
      osascript -e "set volume input volume ${SF_MIC_VOLUME}" >/dev/null 2>&1 || true
    fi
    CURVOL="$(osascript -e 'input volume of (get volume settings)' 2>/dev/null || echo '?')"
    echo "입력 장치: ${CURMIC} / 입력 볼륨: ${CURVOL}"

    # nohup+disown — 호출 셸이 끝나도 녹화가 살아남는다
    # -D 1 = 메인 디스플레이 고정 — 보조 모니터는 프레임에 포함되지 않는다
    nohup screencapture -v -g -x -D 1 "$OUT" >/dev/null 2>&1 &
    echo $! > "$PIDFILE"
    disown
    sleep 1
    if ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      rm -f "$PIDFILE"
      echo "ERROR: 녹화 시작 실패 — 화면 기록 권한(시스템 설정)을 확인하세요" >&2
      exit 1
    fi
    echo "녹화 시작 (pid $(cat "$PIDFILE"), 메인 디스플레이) → $OUT"
    echo "정지: record.sh stop $OUT"
    ;;
  stop)
    PID="$(cat "$PIDFILE" 2>/dev/null || true)"
    [ -n "$PID" ] || { echo "ERROR: 녹화 중이 아님 ($PIDFILE 없음)" >&2; exit 1; }
    kill -INT "$PID" 2>/dev/null || true
    # screencapture 가 mov 컨테이너를 확정(moov 기록)할 때까지 대기
    for _ in $(seq 1 40); do
      kill -0 "$PID" 2>/dev/null || break
      sleep 0.5
    done
    if kill -0 "$PID" 2>/dev/null; then
      echo "WARN: 종료 지연 — 강제 종료(파일 손상 가능)" >&2
      kill -TERM "$PID" 2>/dev/null || true
    fi
    rm -f "$PIDFILE"
    [ -s "$OUT" ] || { echo "ERROR: 산출 파일이 비어 있음: $OUT" >&2; exit 1; }
    DUR="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" 2>/dev/null || echo '?')"
    echo "녹화 종료: $OUT (${DUR}s)"
    ;;
  status)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "녹화 중 (pid $(cat "$PIDFILE")) → $OUT"
    else
      echo "녹화 중 아님"
    fi
    ;;
  *)
    echo "ERROR: 알 수 없는 명령: $CMD (start|stop|status)" >&2; exit 1
    ;;
esac
