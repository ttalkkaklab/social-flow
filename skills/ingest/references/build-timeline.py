#!/usr/bin/env python3
"""build-timeline.py — merge the three raw signals into a timeline.

Usage:
  build-timeline.py <outdir> --src <recording> [--min-scene 8] [--max-scene 45]

Input (produced by transcribe.sh):
  <outdir>/raw/transcript.json   STT (ms offsets — Qwen3-ASR or whisper.cpp)
  <outdir>/raw/silences.tsv      silence spans (start<TAB>end, seconds)
  <outdir>/raw/scenes.tsv        screen-change times (seconds)
  <outdir>/raw/duration.txt      source length (seconds)

Output:
  <outdir>/timeline.json         machine timeline (scene boundaries, sentences, keyframes)
  <outdir>/timeline.md           human timeline table (the Screen column is filled in later by vision_analyze)
  <outdir>/keyframes/seg-N.jpg   scene keyframe (when --src is given)

How boundaries are derived: score every speech pause (silence) with
score_boundary(), split at strong boundaries (>=1.0) first → re-split scenes over
MAX at a weak boundary → merge scenes under MIN into a neighbor. Boundaries always
snap to the gap between sentences.
"""
import argparse
import datetime
import json
import subprocess
import sys
from pathlib import Path

# ──────────────────────────────────────────────────────────────
# Boundary scoring policy
# ──────────────────────────────────────────────────────────────

def score_boundary(silence, scene_times):
    """Score how strong this silence (pause) is as a 'scene boundary'.

    Input:
      silence     — {"start": float, "end": float}  # seconds. length = end - start
      scene_times — list[float]                     # screen-change times (seconds)

    Return (float) contract:
      >= 1.0  strong boundary — always split the scene here
      0 ~ 1   weak boundary — only a candidate when splitting a scene over MAX_SCENE_SEC
      <= 0.0  not a boundary

    ── Design note ──────────────────────────────────────────
    There are two usable signals:
      1) Silence length — the longer the pause, the more it signals "moved on to
         the next thing". (Around 0.6s is a breath between sentences, 1.5s and up
         is closer to a subject change.)
      2) Whether a screen change sits near the middle of the silence (say ±1.5s) —
         if they stopped talking and flipped the screen, it's almost certainly a
         scene boundary.
    Trade-offs:
      - Score silence length generously and every breath splits a scene (too many scenes).
      - Require a screen change and you miss the case where the subject changed on
         the same screen (a paragraph break carried by speech alone).

    The policy we picked: a length contribution plus a screen-change bonus.
      - A pause of 1.5s or more is a strong boundary on its own (catches speech-only breaks)
      - A 0.9s pause + a nearby screen change = strong boundary (0.4 + 0.6 = 1.0)
      - A short pause with no screen change only ever reaches weak (catching a breath)
    """
    dur = silence["end"] - silence["start"]
    center = (silence["start"] + silence["end"]) / 2
    score = (dur - 0.5) / 1.0  # 0.6s≈0.1 … 1.5s=1.0 — length alone can reach strong
    if any(abs(t - center) <= 1.5 for t in scene_times):
        score += 0.6           # stopped talking and flipped the screen — almost certainly a subject change
    return score


# ──────────────────────────────────────────────────────────────
# Load input
# ──────────────────────────────────────────────────────────────

def load_transcript(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    segs = []
    # whisper.cpp (-oj), or the compatible shape transcribe.sh folds Qwen3-ASR output into
    for item in data.get("transcription", []):
        text = (item.get("text") or "").strip()
        if not text:
            continue
        offsets = item.get("offsets") or {}
        segs.append({
            "start": offsets.get("from", 0) / 1000.0,
            "end": offsets.get("to", 0) / 1000.0,
            "text": text,
        })
    if segs:
        return segs
    # raw Qwen3-ASR JSON (seconds) — in case the transcribe.sh conversion was skipped.
    # Prefer utterance-level chunks; segments are word fragments and must not become scenes.
    for item in data.get("chunks") or data.get("segments") or []:
        text = (item.get("text") or "").strip()
        if not text:
            continue
        segs.append({
            "start": float(item.get("start") or 0),
            "end": float(item.get("end") or 0),
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
# whisper hallucination filter — drop transcription over silence and repeat loops
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

    # 1) if 70% or more of a segment sits over detected silence, treat it as a hallucination
    kept = [s for s in segs if silence_overlap_ratio(s) < 0.7]

    # 2) the same sentence 3 times in a row is a repeat loop — keep only the first
    out, run = [], 0
    for i, s in enumerate(kept):
        norm = s["text"].replace(" ", "")
        prev = kept[i - 1]["text"].replace(" ", "") if i else None
        run = run + 1 if norm == prev else 1
        if run < 3:
            out.append(s)
    dropped = len(segs) - len(out)
    if dropped:
        print(f"  hallucination filter: dropped {dropped} segments")
    return out


# ──────────────────────────────────────────────────────────────
# Boundary derivation + scene assembly
# ──────────────────────────────────────────────────────────────

def assign_gap_scores(segs, silences, scene_times):
    """Assign a boundary score to each gap between sentences. gap i = between seg[i] and seg[i+1]."""
    gap_scores = {}
    for sil in silences:
        score = score_boundary(sil, scene_times)
        if score <= 0:
            continue
        center = (sil["start"] + sil["end"]) / 2
        # snap to the sentence gap the silence center falls in (or the nearest one)
        best_i, best_d = None, None
        for i in range(len(segs) - 1):
            lo, hi = segs[i]["end"], segs[i + 1]["start"]
            d = 0.0 if lo <= center <= hi else min(abs(center - lo), abs(center - hi))
            if best_d is None or d < best_d:
                best_i, best_d = i, d
        if best_i is not None and best_d <= 1.0:  # ignore silences more than a second from a gap
            gap_scores[best_i] = max(gap_scores.get(best_i, 0.0), score)
    return gap_scores


def assemble_scenes(segs, gap_scores, min_sec, max_sec):
    # 1) split at strong boundaries
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
        return segs.index(seg)  # global gap number = global index of the preceding sentence

    # 2) scenes over MAX → re-split at the highest-scoring weak boundary inside (or the longest gap)
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
            else:  # with no scored gap, take the widest gap in time
                j = max(cand, key=lambda k: g[k + 1]["start"] - g[k]["end"])
            groups[gi:gi + 1] = [g[:j + 1], g[j + 1:]]
            changed = True
            break

    # 3) scenes under MIN → merge into the shorter neighbor
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
# Output
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
    ap.add_argument("--src", help="path to the source recording, for keyframe extraction")
    ap.add_argument("--min-scene", type=float, default=8.0)
    ap.add_argument("--max-scene", type=float, default=45.0)
    args = ap.parse_args()

    out = Path(args.outdir)
    raw = out / "raw"
    segs = load_transcript(raw / "transcript.json")
    if not segs:
        sys.exit("ERROR: transcript is empty — check raw/qwen3-asr.log or raw/whisper.log")
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

    # human-readable timeline.md
    today = datetime.date.today().isoformat()
    lines = ["---", f"source: {args.src or '(unspecified)'}",
             f"duration: {duration:.1f}s", f"scenes: {len(scenes)}",
             f"generated: {today}", "status: draft", "---", "",
             "# Timeline", "",
             "| # | Range | Length | Speech | Screen |", "|---|---|---|---|---|"]
    for sc in scenes:
        summary = sc["text"][:60] + ("…" if len(sc["text"]) > 60 else "")
        lines.append(f"| {sc['idx']} | {fmt_ts(sc['start'])}–{fmt_ts(sc['end'])} "
                     f"| {sc['duration']:.0f}s | {summary} | _(filled in by vision_analyze)_ |")
    lines += ["", "## Segment detail", ""]
    for sc in scenes:
        lines.append(f"### {sc['idx']}. {fmt_ts(sc['start'])}–{fmt_ts(sc['end'])} ({sc['duration']:.0f}s)")
        if sc["keyframe"]:
            lines.append(f"![seg-{sc['idx']}]({sc['keyframe']})")
        lines.append("")
        for s in sc["sentences"]:
            lines.append(f"- `[{fmt_ts(s['start'])}]` {s['text']}")
        lines += ["", "**Screen description**: _(filled in by vision_analyze)_", ""]
    (out / "timeline.md").write_text("\n".join(lines), encoding="utf-8")

    print(f"timeline done: {len(scenes)} scenes / {duration:.0f}s → {out}/timeline.md")


if __name__ == "__main__":
    main()
