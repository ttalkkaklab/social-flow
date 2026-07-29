#!/usr/bin/env bash
# transcribe.sh <녹화파일> <출력디렉토리>
#
# 화면 녹화(음성 포함)에서 타임라인 원신호 3종을 추출한다:
#   raw/transcript.json  — whisper.cpp STT (세그먼트 타임스탬프, ms)
#   raw/silences.tsv     — 발화 쉼 목록 (start<TAB>end, 초)
#   raw/scenes.tsv       — 화면 전환 시각 목록 (초, 1줄 1값)
#   raw/audio.wav        — 16kHz mono 추출 오디오
#   raw/duration.txt     — 원본 길이 (초)
# 신호 병합·씬 경계 산출은 build-timeline.py 가 담당한다.
#
# 환경변수 (기본값):
#   WHISPER_MODEL  ~/.cache/whisper-cpp/ggml-large-v3-turbo.bin
#   WHISPER_LANG   ko
#   WHISPER_PROMPT ""      도메인 용어집 주입 — 디코더 어휘를 편향시켜 고유명사
#                          오인식을 예방한다 (쉼표 나열, 예: "Claude Code, ISA").
#                          설정 시 --carry-initial-prompt 로 전 구간에 적용.
#   SIL_DB         -35dB   무음 판정 레벨 (조용한 방 녹음이면 -40dB 시도)
#   SIL_MIN        0.6     무음 최소 길이(초) — build-reel.sh 경계 검출과 동일 철학
#   SCENE_THRESH   0.04    화면 전환 감도 — 화면 녹화는 UI 전환 점수가 낮다(실측
#                          0.02~0.15). 전환 시각은 무음 근처에서만 경계 점수에
#                          반영되므로 민감한 기본값이 안전. 오탐 과다 시 0.15.
set -euo pipefail

REC="${1:?사용법: transcribe.sh <녹화파일> <출력디렉토리>}"
OUT="${2:?출력 디렉토리 필요}"
MODEL="${WHISPER_MODEL:-$HOME/.cache/whisper-cpp/ggml-large-v3-turbo.bin}"
LANG_CODE="${WHISPER_LANG:-ko}"
WHISPER_PROMPT="${WHISPER_PROMPT:-}"
SIL_DB="${SIL_DB:--35dB}"
SIL_MIN="${SIL_MIN:-0.6}"
SCENE_THRESH="${SCENE_THRESH:-0.04}"

WHISPER_BIN="$(command -v whisper-cli || command -v whisper-cpp || true)"
[ -n "$WHISPER_BIN" ] || { echo "ERROR: whisper-cli 없음 — brew install whisper-cpp" >&2; exit 1; }
[ -f "$MODEL" ] || { echo "ERROR: 모델 없음: $MODEL — huggingface ggerganov/whisper.cpp 에서 ggml-large-v3-turbo.bin 다운로드" >&2; exit 1; }
[ -f "$REC" ] || { echo "ERROR: 녹화 파일 없음: $REC" >&2; exit 1; }

mkdir -p "$OUT/raw"

# ── 1) 원본 길이 ──────────────────────────────────────────────
ffprobe -v error -show_entries format=duration -of csv=p=0 "$REC" > "$OUT/raw/duration.txt"
DUR="$(cat "$OUT/raw/duration.txt")"
echo "[1/4] 원본 길이: ${DUR}s"

# ── 2) 오디오 추출 (16kHz mono — whisper 입력 규격) ───────────
ffmpeg -y -i "$REC" -vn -ac 1 -ar 16000 -c:a pcm_s16le \
  "$OUT/raw/audio.wav" 2>"$OUT/raw/ffmpeg-audio.log"
echo "[2/4] 오디오 추출 완료"

# ── 3) STT + 무음 검출 ───────────────────────────────────────
# 용어집이 있으면 전 구간 프롬프트로 주입 (bash 3.2 의 set -u 빈 배열 가드)
PROMPT_OPTS=()
[ -n "$WHISPER_PROMPT" ] && PROMPT_OPTS=(--prompt "$WHISPER_PROMPT" --carry-initial-prompt)
"$WHISPER_BIN" -m "$MODEL" -l "$LANG_CODE" -f "$OUT/raw/audio.wav" \
  ${PROMPT_OPTS[@]+"${PROMPT_OPTS[@]}"} \
  -oj -of "$OUT/raw/transcript" -np 2>"$OUT/raw/whisper.log"
[ -s "$OUT/raw/transcript.json" ] || { echo "ERROR: STT 산출 없음 — raw/whisper.log 확인" >&2; exit 1; }

ffmpeg -i "$OUT/raw/audio.wav" -af "silencedetect=noise=${SIL_DB}:d=${SIL_MIN}" \
  -f null - 2>&1 | awk '
    /silence_start:/ { for (i=1;i<=NF;i++) if ($i=="silence_start:") s=$(i+1) }
    /silence_end:/   { for (i=1;i<=NF;i++) if ($i=="silence_end:")   e=$(i+1); print s "\t" e }
  ' > "$OUT/raw/silences.tsv"
echo "[3/4] STT $(python3 -c "import json;print(len(json.load(open('$OUT/raw/transcript.json'))['transcription']))" ) 세그먼트 · 무음 $(wc -l < "$OUT/raw/silences.tsv" | tr -d ' ') 곳"

# ── 4) 화면 전환 검출 ────────────────────────────────────────
ffmpeg -i "$REC" -an -vf "select='gt(scene,${SCENE_THRESH})',showinfo" -fps_mode vfr \
  -f null - 2>&1 | grep -Eo 'pts_time:[0-9.]+' | cut -d: -f2 > "$OUT/raw/scenes.tsv" || true
echo "[4/4] 화면 전환 $(wc -l < "$OUT/raw/scenes.tsv" | tr -d ' ') 곳 — 원신호 추출 완료: $OUT/raw/"
