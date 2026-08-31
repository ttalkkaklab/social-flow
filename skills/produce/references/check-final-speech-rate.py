#!/usr/bin/env python3
"""Check the speech rate on the subtitle timeline that actually ships.

Usage:
  check-final-speech-rate.py <subs.srt> [--max 6.2] [--json]
  check-final-speech-rate.py --selftest

The builder normalizes source cards before assembly. A later whole-video speed pass can undo
that work, so this checker reads the final retimed SRT. It counts Unicode letters and numbers,
not spaces or punctuation, and divides by the time each cue is visible.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import unicodedata
from pathlib import Path

STAMP = re.compile(r"^(\d\d):(\d\d):(\d\d),(\d\d\d)\s+-->\s+(\d\d):(\d\d):(\d\d),(\d\d\d)")
TAG = re.compile(r"<[^>]+>")


def seconds(parts: tuple[str, ...]) -> float:
    h, m, s, ms = (int(value) for value in parts)
    return h * 3600 + m * 60 + s + ms / 1000


def compact_count(text: str) -> int:
    return sum(1 for char in TAG.sub("", text) if unicodedata.category(char)[:1] in {"L", "N"})


def read_srt(path: Path) -> list[dict[str, object]]:
    if not path.is_file():
        raise ValueError(f"subtitle file not found: {path}")
    blocks = re.split(r"\r?\n\s*\r?\n", path.read_text(encoding="utf-8-sig").strip())
    cues: list[dict[str, object]] = []
    for block in blocks:
        lines = block.splitlines()
        timing_index = next((i for i, line in enumerate(lines) if STAMP.match(line.strip())), None)
        if timing_index is None:
            continue
        match = STAMP.match(lines[timing_index].strip())
        assert match is not None
        start = seconds(match.groups()[:4])
        end = seconds(match.groups()[4:])
        duration = end - start
        if duration <= 0:
            raise ValueError(f"cue {len(cues) + 1} has a non-positive duration")
        text = " ".join(line.strip() for line in lines[timing_index + 1 :] if line.strip())
        chars = compact_count(text)
        cues.append({
            "cue": len(cues) + 1,
            "start": start,
            "end": end,
            "duration": duration,
            "chars": chars,
            "rate": chars / duration,
            "text": TAG.sub("", text),
        })
    if not cues:
        raise ValueError("no subtitle cues found")
    return cues


def evaluate(path: Path, maximum: float, min_cue_chars: int = 6) -> dict[str, object]:
    cues = read_srt(path)
    spoken = [cue for cue in cues if int(cue["chars"]) > 0]
    chars = sum(int(cue["chars"]) for cue in spoken)
    duration = sum(float(cue["duration"]) for cue in spoken)
    overall = chars / duration if duration else 0.0
    over = [cue for cue in spoken if int(cue["chars"]) >= min_cue_chars and float(cue["rate"]) > maximum]
    return {
        "file": str(path),
        "max": maximum,
        "minCueChars": min_cue_chars,
        "cues": len(cues),
        "chars": chars,
        "spokenSeconds": round(duration, 3),
        "overallRate": round(overall, 3),
        "peakCueRate": round(max(float(cue["rate"]) for cue in spoken), 3),
        "overLimit": [
            {
                "cue": cue["cue"],
                "rate": round(float(cue["rate"]), 3),
                "chars": cue["chars"],
                "duration": round(float(cue["duration"]), 3),
                "text": cue["text"],
            }
            for cue in over
        ],
        "passed": overall <= maximum and not over,
    }


def selftest() -> int:
    cases = [
        ("passes a readable final timeline", "1\n00:00:00,000 --> 00:00:02,000\n열두 글자예요\n", 6.2, True),
        ("rejects a rushed cue", "1\n00:00:00,000 --> 00:00:01,000\n여덟글자입니다\n", 6.2, False),
        ("ignores punctuation in the count", "1\n00:00:00,000 --> 00:00:01,000\n가, 나! 다?\n", 3.1, True),
    ]
    failed = 0
    with tempfile.TemporaryDirectory(prefix="speech-rate-") as directory:
        for index, (name, body, maximum, expected) in enumerate(cases, 1):
            path = Path(directory) / f"case-{index}.srt"
            path.write_text(body, encoding="utf-8")
            got = bool(evaluate(path, maximum)["passed"])
            ok = got is expected
            print(("ok   " if ok else "FAIL ") + name)
            failed += 0 if ok else 1
    if failed:
        print(f"{failed} check(s) failed", file=sys.stderr)
        return 1
    print("check-final-speech-rate selftest OK")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("srt", nargs="?")
    parser.add_argument("--max", type=float, default=6.2, dest="maximum")
    parser.add_argument("--min-cue-chars", type=int, default=6)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        return selftest()
    if not args.srt:
        parser.error("an SRT path is required")
    if args.maximum <= 0 or args.min_cue_chars < 1:
        parser.error("--max and --min-cue-chars must be positive")
    try:
        result = evaluate(Path(args.srt), args.maximum, args.min_cue_chars)
    except (OSError, UnicodeError, ValueError) as error:
        print(f"check-final-speech-rate: {error}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        mark = "PASS" if result["passed"] else "FAIL"
        print(
            f"{mark} final speech rate: {result['overallRate']:.3f} chars/s overall · "
            f"{result['peakCueRate']:.3f} peak · cap {result['max']:.3f}"
        )
        for cue in result["overLimit"][:8]:
            print(
                f"  cue {cue['cue']}: {cue['rate']:.3f} chars/s · "
                f"{cue['duration']:.3f}s · {cue['text']}"
            )
        if len(result["overLimit"]) > 8:
            print(f"  … {len(result['overLimit']) - 8} more cue(s)")
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
