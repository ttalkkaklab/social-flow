#!/usr/bin/env python3
"""build-timeline.py — 원신호 3종을 병합해 타임라인을 산출한다.

사용법:
  build-timeline.py <출력디렉토리> --src <녹화파일> [--min-scene 8] [--max-scene 45]

입력  (transcribe.sh 산출):
  <출력디렉토리>/raw/transcript.json   whisper.cpp STT (ms 오프셋)
  <출력디렉토리>/raw/silences.tsv     무음 구간 (start<TAB>end, 초)
  <출력디렉토리>/raw/scenes.tsv       화면 전환 시각 (초)
  <출력디렉토리>/raw/duration.txt     원본 길이 (초)

출력:
  <출력디렉토리>/timeline.json        기계용 타임라인 (씬 경계·문장·키프레임)
  <출력디렉토리>/timeline.md          사람용 타임라인 표 (화면 열은 vision_analyze로 후속 기입)
  <출력디렉토리>/keyframes/seg-N.jpg  씬 대표 프레임 (--src 지정 시)

경계 산출 원리: 발화 쉼(무음)마다 score_boundary() 로 점수를 매기고,
강한 경계(>=1.0)에서 우선 분할 → MAX 초과 씬은 약한 경계에서 재분할 →
MIN 미만 씬은 이웃과 병합한다. 경계는 항상 문장 사이 간극에 스냅된다.
"""
import argparse
import datetime
import json
import subprocess
import sys
from pathlib import Path

# ──────────────────────────────────────────────────────────────
# 경계 점수 정책
# ──────────────────────────────────────────────────────────────

def score_boundary(silence, scene_times):
    """이 무음(쉼)이 '씬 경계'로서 얼마나 강한가를 점수로 반환한다.

    입력:
      silence     — {"start": float, "end": float}  # 초 단위. 길이 = end - start
      scene_times — list[float]                     # 화면 전환 시각들 (초)

    반환(float) 계약:
      >= 1.0  강한 경계 — 이 지점에서 무조건 씬을 나눈다
      0 ~ 1   약한 경계 — MAX_SCENE_SEC 초과 씬을 쪼갤 때만 후보로 쓴다
      <= 0.0  경계 아님

    ── 설계 노트 ────────────────────────────────────────────
    쓸 수 있는 신호는 둘:
      1) 무음 길이 — 길게 쉴수록 "다음 얘기로 넘어간" 신호.
         (0.6s 안팎은 문장 사이 숨, 1.5s 이상은 화제 전환에 가깝다)
      2) 무음 중심 근처(예: ±1.5s)에 화면 전환이 있는가 —
         말을 멈추고 화면을 넘겼다면 거의 확실한 씬 경계.
    트레이드오프:
      - 무음 길이만 후하게 치면 숨 고르기마다 씬이 쪼개진다 (씬 과다).
      - 화면 전환을 필수 조건으로 걸면 같은 화면에서 화제만 바뀐
        경우(말로만 단락 전환)를 놓친다.

    채택한 정책: 길이 기여분 + 화면 전환 가산점.
      - 1.5s 이상 쉬면 그것만으로 강한 경계 (말로만 단락 전환도 잡는다)
      - 0.9s 쉼 + 근처 화면 전환 = 강한 경계 (0.4 + 0.6 = 1.0)
      - 화면 전환 없는 짧은 쉼은 약한 경계로만 잡는다 (숨 고르기)
    """
    dur = silence["end"] - silence["start"]
    center = (silence["start"] + silence["end"]) / 2
    score = (dur - 0.5) / 1.0  # 0.6s≈0.1 … 1.5s=1.0 — 길이 단독으로도 강한 경계 가능
    if any(abs(t - center) <= 1.5 for t in scene_times):
        score += 0.6           # 말을 멈추고 화면을 넘겼다 — 거의 확실한 화제 전환
    return score


# ──────────────────────────────────────────────────────────────
# 입력 로드
# ──────────────────────────────────────────────────────────────

def load_transcript(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    segs = []
    for item in data.get("transcription", []):
        text = item["text"].strip()
        if not text:
            continue
        segs.append({
            "start": item["offsets"]["from"] / 1000.0,
            "end": item["offsets"]["to"] / 1000.0,
            "text": text,
        })
    return segs


def load_tsv_pairs(path):
    out = []
    p = Path(path)
    if not p.exists():
        return out
    for line in p.read_text().splitlines():
        parts = line.strip().split("\t")
        if len(parts) == 2:
            out.append({"start": float(parts[0]), "end": float(parts[1])})
    return out


def load_scalar_list(path):
    p = Path(path)
    if not p.exists():
        return []
    return [float(x) for x in p.read_text().split() if x.strip()]


# ──────────────────────────────────────────────────────────────
# whisper 환각 필터 — 무음 위 전사·반복 루프 제거
# ──────────────────────────────────────────────────────────────

def filter_hallucinations(segs, silences):
    def silence_overlap_ratio(seg):
        dur = max(seg["end"] - seg["start"], 1e-6)
        covered = 0.0
        for sil in silences:
            lo = max(seg["start"], sil["start"])
            hi = min(seg["end"], sil["end"])
            covered += max(0.0, hi - lo)
        return covered / dur

    # 1) 세그먼트의 70% 이상이 검출 무음 위에 있으면 환각으로 간주
    kept = [s for s in segs if silence_overlap_ratio(s) < 0.7]

    # 2) 같은 문장이 3회 이상 연속되면 반복 루프 — 첫 회만 유지
    out, run = [], 0
    for i, s in enumerate(kept):
        norm = s["text"].replace(" ", "")
        prev = kept[i - 1]["text"].replace(" ", "") if i else None
        run = run + 1 if norm == prev else 1
        if run < 3:
            out.append(s)
    dropped = len(segs) - len(out)
    if dropped:
        print(f"  환각 필터: {dropped}개 세그먼트 제거")
    return out


# ──────────────────────────────────────────────────────────────
# 경계 산출 + 씬 조립
# ──────────────────────────────────────────────────────────────

def assign_gap_scores(segs, silences, scene_times):
    """문장 사이 간극(gap)마다 경계 점수를 배정한다. gap i = seg[i]와 seg[i+1] 사이."""
    gap_scores = {}
    for sil in silences:
        score = score_boundary(sil, scene_times)
        if score <= 0:
            continue
        center = (sil["start"] + sil["end"]) / 2
        # 무음 중심이 속한(또는 가장 가까운) 문장 간극에 스냅
        best_i, best_d = None, None
        for i in range(len(segs) - 1):
            lo, hi = segs[i]["end"], segs[i + 1]["start"]
            d = 0.0 if lo <= center <= hi else min(abs(center - lo), abs(center - hi))
            if best_d is None or d < best_d:
                best_i, best_d = i, d
        if best_i is not None and best_d <= 1.0:  # 간극에서 1초 이상 먼 무음은 무시
            gap_scores[best_i] = max(gap_scores.get(best_i, 0.0), score)
    return gap_scores


def assemble_scenes(segs, gap_scores, min_sec, max_sec):
    # 1) 강한 경계에서 분할
    groups, cur = [], [segs[0]]
    for i in range(len(segs) - 1):
        if gap_scores.get(i, 0.0) >= 1.0:
            groups.append(cur)
            cur = []
        cur.append(segs[i + 1])
    groups.append(cur)

    def dur(g):
        return g[-1]["end"] - g[0]["start"]

    def gap_index(seg):
        return segs.index(seg)  # 전역 gap 번호 = 앞 문장의 전역 인덱스

    # 2) MAX 초과 씬 → 내부 최고점 약한 경계에서 재분할 (없으면 최장 간극)
    changed = True
    while changed:
        changed = False
        for gi, g in enumerate(groups):
            if dur(g) <= max_sec or len(g) < 2:
                continue
            cand = range(len(g) - 1)
            weak = [(gap_scores.get(gap_index(g[j]), 0.0), j) for j in cand]
            scored = [w for w in weak if w[0] > 0]
            if scored:
                _, j = max(scored)
            else:  # 점수 있는 간극이 없으면 시간 간극이 가장 넓은 곳
                j = max(cand, key=lambda k: g[k + 1]["start"] - g[k]["end"])
            groups[gi:gi + 1] = [g[:j + 1], g[j + 1:]]
            changed = True
            break

    # 3) MIN 미만 씬 → 더 짧은 이웃과 병합
    changed = True
    while changed and len(groups) > 1:
        changed = False
        for gi, g in enumerate(groups):
            if dur(g) >= min_sec:
                continue
            neighbors = [i for i in (gi - 1, gi + 1) if 0 <= i < len(groups)]
            tgt = min(neighbors, key=lambda i: dur(groups[i]))
            lo, hi = sorted((gi, tgt))
            groups[lo:hi + 1] = [groups[lo] + groups[hi]]
            changed = True
            break
    return groups


# ──────────────────────────────────────────────────────────────
# 출력
# ──────────────────────────────────────────────────────────────

def fmt_ts(t):
    return f"{int(t // 60):02d}:{t % 60:04.1f}"


def extract_keyframe(src, t, out_path):
    subprocess.run(
        ["ffmpeg", "-y", "-ss", f"{t:.2f}", "-i", str(src), "-frames:v", "1",
         "-vf", "scale=960:-2", "-q:v", "3", str(out_path)],
        check=True, capture_output=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("outdir")
    ap.add_argument("--src", help="키프레임 추출용 원본 녹화 경로")
    ap.add_argument("--min-scene", type=float, default=8.0)
    ap.add_argument("--max-scene", type=float, default=45.0)
    args = ap.parse_args()

    out = Path(args.outdir)
    raw = out / "raw"
    segs = load_transcript(raw / "transcript.json")
    if not segs:
        sys.exit("ERROR: 전사 결과가 비어 있음 — raw/whisper.log 확인")
    silences = load_tsv_pairs(raw / "silences.tsv")
    scene_times = load_scalar_list(raw / "scenes.tsv")
    duration = float((raw / "duration.txt").read_text().strip())

    segs = filter_hallucinations(segs, silences)
    gap_scores = assign_gap_scores(segs, silences, scene_times)
    groups = assemble_scenes(segs, gap_scores, args.min_scene, args.max_scene)

    kf_dir = out / "keyframes"
    scenes = []
    for idx, g in enumerate(groups, 1):
        start, end = g[0]["start"], g[-1]["end"]
        kf = None
        if args.src:
            kf_dir.mkdir(exist_ok=True)
            kf = f"keyframes/seg-{idx}.jpg"
            extract_keyframe(args.src, (start + end) / 2, out / kf)
        scenes.append({
            "idx": idx, "start": round(start, 2), "end": round(end, 2),
            "duration": round(end - start, 2),
            "text": " ".join(s["text"] for s in g),
            "sentences": [{"start": round(s["start"], 2), "end": round(s["end"], 2),
                           "text": s["text"]} for s in g],
            "keyframe": kf,
        })

    (out / "timeline.json").write_text(json.dumps({
        "source": args.src, "duration": duration,
        "params": {"min_scene": args.min_scene, "max_scene": args.max_scene},
        "scenes": scenes,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    # 사람용 timeline.md
    today = datetime.date.today().isoformat()
    lines = ["---", f"source: {args.src or '(미지정)'}",
             f"duration: {duration:.1f}s", f"scenes: {len(scenes)}",
             f"generated: {today}", "status: draft", "---", "",
             "# 타임라인", "",
             "| # | 구간 | 길이 | 발화 | 화면 |", "|---|---|---|---|---|"]
    for sc in scenes:
        summary = sc["text"][:60] + ("…" if len(sc["text"]) > 60 else "")
        lines.append(f"| {sc['idx']} | {fmt_ts(sc['start'])}–{fmt_ts(sc['end'])} "
                     f"| {sc['duration']:.0f}s | {summary} | _(vision_analyze로 기입)_ |")
    lines += ["", "## 세그먼트 상세", ""]
    for sc in scenes:
        lines.append(f"### {sc['idx']}. {fmt_ts(sc['start'])}–{fmt_ts(sc['end'])} ({sc['duration']:.0f}s)")
        if sc["keyframe"]:
            lines.append(f"![seg-{sc['idx']}]({sc['keyframe']})")
        lines.append("")
        for s in sc["sentences"]:
            lines.append(f"- `[{fmt_ts(s['start'])}]` {s['text']}")
        lines += ["", "**화면 설명**: _(vision_analyze로 기입)_", ""]
    (out / "timeline.md").write_text("\n".join(lines), encoding="utf-8")

    print(f"타임라인 산출 완료: 씬 {len(scenes)}개 / {duration:.0f}s → {out}/timeline.md")


if __name__ == "__main__":
    main()
