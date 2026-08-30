#!/usr/bin/env python3
"""Split one subtitle sentence into word cues — one 어절 on screen at a time.

usage: word-cues.py <cue-start> <cue-end> <speech-start> <speech-end> <min-cue> <sentence>
                    [--align <tokens.json> --offset <sec>] [--tts <spoken sentence>]
prints: start<TAB>end<TAB>word   (seconds, absolute — the same base the caller passed in)
        and one trailing comment line — "# aligned 94%" or "# proportional (<why>)".

Two ways to place the words:

① **aligned** — `--align` is the JSON mlx-qwen3-asr writes with `--timestamps` for this
  card's narration wav (token times, card-relative; `--offset` is the card's absolute
  speech start). The tokens inside the speech window become a stream of characters with a
  time each. `--tts` is what the voice actually said ("이천이십 년"); the display sentence
  ("2020년") is what goes on screen. Display words are mapped onto the spoken text by
  character position, the spoken text onto the heard stream by difflib (so a word the ASR
  misheard still lands where its neighbours are), and each display word takes the time of
  its first character. Spacing never matters, which is the point — Korean ASR and Korean
  scripts rarely agree on where the spaces go. Below 60% of characters matched the
  sentence falls back to ②.
② **proportional** — no JSON, or the match was too thin: the words are spread over the
  speech window by how long each takes to say (a Hangul syllable or a digit 1, a Latin
  letter 0.5, a comma or period a 0.4 pause). Measured against the aligner on ep07 card 3
  this path was off by 0.42 s on average and 1.18 s at worst, so it is the fallback, not
  the lane.

Either way the first cue is pulled back to the cue start and the last one held to the cue
end, so the outer edges match the sentence cue the SRT keeps, and a cue that would run
under <min-cue> is glued to the next word ("대체 왜" as one cue) — the reference short does
the same, which is why its cue count is 1.23 words, not 1.
"""
import difflib
import json
import sys


def weight(word: str) -> float:
    w = 0.0
    for ch in word:
        o = ord(ch)
        if 0xAC00 <= o <= 0xD7A3 or ch.isdigit():
            w += 1.0
        elif ch.isascii() and ch.isalpha():
            w += 0.5
        elif ch in ",.?!…":
            w += 0.4
    return max(w, 0.5)


def strip(s: str) -> str:
    return "".join(ch for ch in s if not ch.isspace() and ch not in ",.?!…")


def heard_chars(path: str, offset: float, lo: float, hi: float):
    """The aligner's tokens inside [lo, hi] → [(char, abs_time)], one time per character."""
    d = json.load(open(path, encoding="utf-8"))
    out = []
    for t in d.get("segments") or []:
        s, e = float(t["start"]) + offset, float(t["end"]) + offset
        if s < lo or s > hi:
            continue
        txt = strip(str(t.get("text", "")))
        n = len(txt)
        for i, ch in enumerate(txt):
            out.append((ch, s + (e - s) * i / n if n > 1 else s))
    return out


def aligned_starts(words, tts: str, heard):
    """Start time per display word, or None when the match is too thin."""
    disp = strip("".join(words))
    spoken = strip(tts) or disp
    hstr = "".join(ch for ch, _ in heard)
    if not disp or not hstr:
        return None, 0.0
    # display char index → spoken char index (position, since spellings differ on purpose)
    def d2s(i):
        return min(len(spoken) - 1, round(i * len(spoken) / len(disp)))
    # spoken char index → heard char index via matching blocks, interpolated between anchors
    sm = difflib.SequenceMatcher(None, spoken, hstr, autojunk=False)
    anchors = []
    matched = 0
    for a, b, n in sm.get_matching_blocks():
        for k in range(n):
            anchors.append((a + k, b + k))
        matched += n
    ratio = matched / len(spoken)
    if ratio < 0.6 or not anchors:
        return None, ratio
    def s2h(i):
        if i <= anchors[0][0]:
            return anchors[0][1] - (anchors[0][0] - i)
        if i >= anchors[-1][0]:
            return anchors[-1][1] + (i - anchors[-1][0])
        for (a0, b0), (a1, b1) in zip(anchors, anchors[1:]):
            if a0 <= i <= a1:
                return b0 + (b1 - b0) * (i - a0) / (a1 - a0) if a1 > a0 else b0
        return anchors[-1][1]
    starts, pos = [], 0
    for w in words:
        h = s2h(d2s(pos))
        h = max(0, min(len(heard) - 1, int(round(h))))
        starts.append(heard[h][1])
        pos += len(strip(w))
    # monotonic — a misheard stretch can fold time back on itself
    for k in range(1, len(starts)):
        if starts[k] < starts[k - 1]:
            starts[k] = starts[k - 1]
    return starts, ratio


def main() -> None:
    args = sys.argv[1:]
    align = offset = None
    tts = ""
    for flag in ("--align", "--offset", "--tts"):
        if flag in args:
            i = args.index(flag)
            val = args[i + 1]
            del args[i:i + 2]
            if flag == "--align":
                align = val
            elif flag == "--offset":
                offset = float(val)
            else:
                tts = val
    if len(args) != 6:
        sys.exit("usage: word-cues.py <cue-start> <cue-end> <speech-start> <speech-end> <min-cue> <sentence> [--align json --offset sec] [--tts spoken]")
    cue_s, cue_e, sp_s, sp_e, min_cue = (float(x) for x in args[:5])
    words = args[5].split()
    if not words:
        return
    if sp_e - sp_s < 0.2:
        sp_s, sp_e = cue_s, cue_e

    cues, note = None, ""
    if align and offset is not None:
        try:
            heard = heard_chars(align, offset, sp_s - 0.35, sp_e + 0.35)
            starts, ratio = aligned_starts(words, tts, heard)
        except (OSError, ValueError, KeyError) as e:
            starts, ratio, note = None, 0.0, f"proportional (align unreadable: {e})"
        if starts:
            cues = [[starts[k], starts[k + 1] if k + 1 < len(starts) else sp_e, w] for k, w in enumerate(words)]
            note = f"aligned {ratio:.0%}"
        elif not note:
            note = f"proportional (chars matched {ratio:.0%})"
    else:
        note = "proportional (no aligner)"

    if cues is None:
        span = sp_e - sp_s
        total = sum(weight(w) for w in words)
        cues, t = [], sp_s
        for w in words:
            d = span * weight(w) / total
            cues.append([t, t + d, w])
            t += d

    # The outer edges first: the last word holds to the cue end, so it is judged at its real
    # length and not glued backward just because the speech window closed on it.
    cues[0][0] = min(cue_s, cues[0][0])
    cues[-1][1] = max(cue_e, cues[-1][1])
    merged = []
    for c in cues:
        if merged and (merged[-1][1] - merged[-1][0]) < min_cue:
            merged[-1][1] = c[1]
            merged[-1][2] += " " + c[2]
        else:
            merged.append(c)
    if len(merged) > 1 and (merged[-1][1] - merged[-1][0]) < min_cue:
        merged[-2][1] = merged[-1][1]
        merged[-2][2] += " " + merged[-1][2]
        merged.pop()
    for s, e, w in merged:
        print(f"{s:.3f}\t{e:.3f}\t{w}")
    print(f"# {note}")


if __name__ == "__main__":
    main()
