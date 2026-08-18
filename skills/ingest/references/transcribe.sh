#!/usr/bin/env bash
# transcribe.sh <recording> <outdir>
#
# Extract the three raw timeline signals from a screen recording (with audio):
#   raw/transcript.json  — whisper.cpp STT (segment timestamps, ms)
#   raw/silences.tsv     — list of speech pauses (start<TAB>end, seconds)
#   raw/scenes.tsv       — list of screen-change times (seconds, one per line)
#   raw/audio.wav        — 16kHz mono extracted audio
#   raw/duration.txt     — source length (seconds)
# Merging the signals and deriving scene boundaries is build-timeline.py's job.
#
# Environment variables (defaults):
#   WHISPER_MODEL  ~/.cache/whisper-cpp/ggml-large-v3-turbo.bin
#   WHISPER_LANG   ko
#   WHISPER_PROMPT ""      inject a domain glossary — biases the decoder's vocabulary
#                          to prevent misrecognized proper nouns (comma-separated,
#                          e.g. "Claude Code, ISA"). When set, --carry-initial-prompt
#                          applies it across the whole recording.
#   SIL_DB         -35dB   silence threshold level (try -40dB for a quiet room)
#   SIL_MIN        0.6     minimum silence length (seconds) — same philosophy as
#                          build-reel.sh boundary detection
#   SCENE_THRESH   0.04    screen-change sensitivity — screen recordings score low on
#                          UI transitions (measured 0.02~0.15). Transition times only
#                          feed the boundary score near a silence, so a sensitive
#                          default is safe. Use 0.15 when false positives pile up.
set -euo pipefail

REC="${1:?usage: transcribe.sh <recording> <outdir>}"
OUT="${2:?outdir required}"
MODEL="${WHISPER_MODEL:-$HOME/.cache/whisper-cpp/ggml-large-v3-turbo.bin}"
LANG_CODE="${WHISPER_LANG:-ko}"
WHISPER_PROMPT="${WHISPER_PROMPT:-}"
SIL_DB="${SIL_DB:--35dB}"
SIL_MIN="${SIL_MIN:-0.6}"
SCENE_THRESH="${SCENE_THRESH:-0.04}"

WHISPER_BIN="$(command -v whisper-cli || command -v whisper-cpp || true)"
[ -n "$WHISPER_BIN" ] || { echo "ERROR: no whisper-cli — brew install whisper-cpp" >&2; exit 1; }
[ -f "$MODEL" ] || { echo "ERROR: no model: $MODEL — download ggml-large-v3-turbo.bin from huggingface ggerganov/whisper.cpp" >&2; exit 1; }
[ -f "$REC" ] || { echo "ERROR: no recording file: $REC" >&2; exit 1; }

mkdir -p "$OUT/raw"

# ── 1) source length ─────────────────────────────────────────
ffprobe -v error -show_entries format=duration -of csv=p=0 "$REC" > "$OUT/raw/duration.txt"
DUR="$(cat "$OUT/raw/duration.txt")"
echo "[1/4] source length: ${DUR}s"

# ── 2) extract audio (16kHz mono — whisper input spec) ───────
ffmpeg -y -i "$REC" -vn -ac 1 -ar 16000 -c:a pcm_s16le \
  "$OUT/raw/audio.wav" 2>"$OUT/raw/ffmpeg-audio.log"
echo "[2/4] audio extracted"

# ── 3) STT + silence detection ───────────────────────────────
# inject the glossary as a whole-run prompt if present (bash 3.2 set -u empty-array guard)
PROMPT_OPTS=()
[ -n "$WHISPER_PROMPT" ] && PROMPT_OPTS=(--prompt "$WHISPER_PROMPT" --carry-initial-prompt)
"$WHISPER_BIN" -m "$MODEL" -l "$LANG_CODE" -f "$OUT/raw/audio.wav" \
  ${PROMPT_OPTS[@]+"${PROMPT_OPTS[@]}"} \
  -oj -of "$OUT/raw/transcript" -np 2>"$OUT/raw/whisper.log"
[ -s "$OUT/raw/transcript.json" ] || { echo "ERROR: no STT output — check raw/whisper.log" >&2; exit 1; }

ffmpeg -i "$OUT/raw/audio.wav" -af "silencedetect=noise=${SIL_DB}:d=${SIL_MIN}" \
  -f null - 2>&1 | awk '
    /silence_start:/ { for (i=1;i<=NF;i++) if ($i=="silence_start:") s=$(i+1) }
    /silence_end:/   { for (i=1;i<=NF;i++) if ($i=="silence_end:")   e=$(i+1); print s "\t" e }
  ' > "$OUT/raw/silences.tsv"
echo "[3/4] STT $(python3 -c "import json;print(len(json.load(open('$OUT/raw/transcript.json'))['transcription']))" ) segments · $(wc -l < "$OUT/raw/silences.tsv" | tr -d ' ') silences"

# ── 4) screen-change detection ───────────────────────────────
ffmpeg -i "$REC" -an -vf "select='gt(scene,${SCENE_THRESH})',showinfo" -fps_mode vfr \
  -f null - 2>&1 | grep -Eo 'pts_time:[0-9.]+' | cut -d: -f2 > "$OUT/raw/scenes.tsv" || true
echo "[4/4] $(wc -l < "$OUT/raw/scenes.tsv" | tr -d ' ') screen changes — raw signals extracted: $OUT/raw/"
