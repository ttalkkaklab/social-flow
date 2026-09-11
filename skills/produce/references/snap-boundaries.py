#!/usr/bin/env python3
"""Pick the card's sentence boundaries from the checked take's sentence sidecar.

Usage:
  snap-boundaries.py <audio>.sentences.json <silences.txt> <segments> [--tempo F] [--tol 0.6]
  snap-boundaries.py --selftest

build-reel.sh §4 used to take the M-1 longest pauses inside a card as its sentence boundaries.
That guess fails when a sentence pauses longer inside itself than between sentences (ElevenLabs
holds 0.3-1.2 s after a comma, measured on pundago ep401/ep411). The checked TTS tool writes
<wav>.sentences.json with the start of every sentence in the WAV it shipped; this script snaps
each of those times to the nearest silence the builder detected, so the boundary is the pause
that was actually laid in — and the reveal fades inside it.

Prints the silence ends, ascending, space separated (what build-reel.sh reads as BLIST).
Exits 1 with a reason on stderr when the sidecar and the silences do not agree — the builder
then falls back to the longest-pause rule and says so in the report.

The silences file is silencedetect output as build-reel.sh keeps it: "start end duration" per
line. --tempo is the card's atempo factor (1.0 unless the build opted in); the sidecar's times
are divided by it. --tol is the widest distance a sidecar time may sit from a detected silence
end: the builder trims the lead to 0.10 s (the sidecar has 0.14 s) and silencedetect reads a
few hundredths late, so the true match sits within ~0.1 s.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path


def load_silences(path: Path) -> list[tuple[float, float, float]]:
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) >= 3:
            out.append((float(parts[0]), float(parts[1]), float(parts[2])))
    return out


def snap(boundaries: list[float], silences: list[tuple[float, float, float]], tol: float) -> list[float]:
    """Nearest silence end per boundary; every boundary must find its own silence."""
    chosen: list[int] = []
    for b in boundaries:
        best = None
        for i, (_, end, _) in enumerate(silences):
            if i in chosen:
                continue
            d = abs(end - b)
            if d <= tol and (best is None or d < best[0]):
                best = (d, i)
        if best is None:
            raise ValueError(f"no detected pause within {tol:.2f}s of sidecar boundary {b:.3f}s")
        chosen.append(best[1])
    ends = sorted(silences[i][1] for i in chosen)
    if len(set(ends)) != len(ends):
        raise ValueError("two sidecar boundaries snapped to the same pause")
    return ends


def run(sidecar: Path, silences_path: Path, segments: int, tempo: float, tol: float) -> list[float]:
    data = json.loads(sidecar.read_text(encoding="utf-8"))
    boundaries = [float(b) / tempo for b in data.get("boundaries", [])]
    if len(boundaries) != segments - 1:
        raise ValueError(f"sidecar has {len(boundaries)} boundaries for {segments} segments")
    return snap(boundaries, load_silences(silences_path), tol)


def selftest() -> int:
    with tempfile.TemporaryDirectory() as d:
        side = Path(d) / "c0.wav.sentences.json"
        sil = Path(d) / "silin0.txt"
        side.write_text(json.dumps({"boundaries": [3.12, 6.44]}), encoding="utf-8")
        # a longer comma pause at 1.5s must not win over the true boundaries
        sil.write_text("1.10 1.52 0.42\n2.60 3.09 0.49\n5.95 6.41 0.46\n", encoding="utf-8")
        got = run(side, sil, 3, 1.0, 0.6)
        assert got == [3.09, 6.41], got
        # tempo scales the sidecar times before matching
        side.write_text(json.dumps({"boundaries": [3.12 * 1.2, 6.44 * 1.2]}), encoding="utf-8")
        assert run(side, sil, 3, 1.2, 0.6) == [3.09, 6.41]
        # a boundary with no pause near it is a refusal, not a guess
        side.write_text(json.dumps({"boundaries": [3.12, 8.0]}), encoding="utf-8")
        try:
            run(side, sil, 3, 1.0, 0.6)
        except ValueError as e:
            assert "no detected pause" in str(e), e
        else:
            raise AssertionError("expected a refusal")
        # a segment count the sidecar does not describe is a refusal too
        side.write_text(json.dumps({"boundaries": [3.12]}), encoding="utf-8")
        try:
            run(side, sil, 3, 1.0, 0.6)
        except ValueError as e:
            assert "boundaries for" in str(e), e
        else:
            raise AssertionError("expected a refusal")
    print("snap-boundaries selftest OK")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("sidecar", nargs="?")
    ap.add_argument("silences", nargs="?")
    ap.add_argument("segments", nargs="?", type=int)
    ap.add_argument("--tempo", type=float, default=1.0)
    ap.add_argument("--tol", type=float, default=0.6)
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if not (a.sidecar and a.silences and a.segments):
        ap.error("sidecar, silences and segments are required")
    try:
        ends = run(Path(a.sidecar), Path(a.silences), a.segments, a.tempo, a.tol)
    except (ValueError, OSError, json.JSONDecodeError) as e:
        print(str(e), file=sys.stderr)
        return 1
    print(" ".join(f"{e:.6f}" for e in ends))
    return 0


if __name__ == "__main__":
    sys.exit(main())
