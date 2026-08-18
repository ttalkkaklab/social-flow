#!/usr/bin/env python3
"""Computes reveal transition times and durations against the pauses in the narration.

Why it's computed separately
    A fixed lead (REVEAL_LEAD) that starts the fade "N seconds before the sentence starts" can't
    match the pause length. Measured (v4): pauses ran 0.55~0.83s while the lead was 0.8s, so 5 of 6
    transitions started their fade **while the previous sentence was still being spoken**, and all of
    them finished 0.45s before the sentence started, leaving dead time.

Contract
    The fade happens **inside** the pause between sentences and is already finished the moment the
    next sentence starts.
      · fade end = sentence start - gap
      · fade duration = min(max, as much as fits inside the pause)  · floor MIN_FADE
      · fade start >= pause start (never intrude on the previous sentence)
    Only when no pause is found (the char-count proportional fallback) does it revert to the fixed lead.

Sub-reveals (when one sentence holds several bullets)
    Those bullets aren't spoken, so there's no "correct" time. The next best thing is to land them on
    a breath (an undetected pause) inside the sentence. If there's a usable pause in the window, snap
    to it; otherwise divide evenly.

Input/output
    stdin  none. The silence list file comes from --silences (silencedetect output: start end duration).
    stdout one line per transition: offset<TAB>duration<TAB>reason  (on card time, PRE included)
    stderr sync report (when --report is given)
"""
import argparse
import sys

MIN_FADE = 0.18   # shorter than this doesn't read as a fade, it reads as a flicker
MIN_GAP = 0.15    # minimum gap between transitions (previous fade end → next fade start)


def load_silences(path):
    out = []
    if not path:
        return out
    try:
        with open(path) as f:
            for line in f:
                p = line.split()
                if len(p) >= 3:
                    out.append([float(p[0]), float(p[1]), float(p[2]), False])  # start, end, dur, used
    except FileNotFoundError:
        pass
    return out


def fit_in_pause(pause_start, sentence_start, fade_max, gap):
    """Fits the fade inside the pause — finishing gap seconds before the sentence starts, never earlier than the pause start."""
    fade_end = sentence_start - gap
    dur = min(fade_max, max(MIN_FADE, fade_end - pause_start))
    start = max(pause_start, fade_end - dur)
    return start, min(dur, max(MIN_FADE, fade_end - start))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pre", type=float, required=True)       # pre-roll (card time = speech time + pre)
    ap.add_argument("--speech", type=float, required=True)    # speech duration L
    ap.add_argument("--dur", type=float, required=True)       # total card duration D
    ap.add_argument("--fade", type=float, default=0.35)       # maximum fade duration
    ap.add_argument("--gap", type=float, default=0.05)        # margin for finishing before the sentence starts
    ap.add_argument("--lead", type=float, default=0.8)        # fallback lead (only when there's no pause information)
    ap.add_argument("--silences", default="")
    ap.add_argument("--bounds", default="")                   # sentence start times (= ends of the chosen silences)
    ap.add_argument("--subs", default="")                     # sub-state count per segment, comma separated
    ap.add_argument("--fallback", action="store_true")        # the boundaries are char-count proportional estimates
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()

    bounds = [float(x) for x in a.bounds.split()] if a.bounds.strip() else []
    subs = [int(x) for x in a.subs.split(",")] if a.subs.strip() else [1]
    sil = load_silences(a.silences)

    # Speech start of sentence j (on speech time). Sentence 0 is 0.
    starts = [0.0] + bounds
    nseg = len(subs)
    if len(starts) < nseg:
        starts += [a.speech] * (nseg - len(starts))

    events = []   # (fade_start, dur, reason, reference time or None)

    for j in range(nseg):
        w0 = starts[j]
        w1 = starts[j + 1] if j + 1 < len(starts) else a.speech
        k = max(1, subs[j])

        # ① Segment-boundary transition (j>=1) — aligned to the sentence start
        if j >= 1:
            sentence_start = starts[j]
            pause = None
            if not a.fallback:
                for s in sil:
                    if abs(s[1] - sentence_start) < 0.002:
                        pause = s
                        break
            if pause:
                pause[3] = True
                st, du = fit_in_pause(pause[0], sentence_start, a.fade, a.gap)
                events.append((st, du, "pause-aligned", sentence_start))
            else:
                events.append((sentence_start - a.lead, a.fade, "lead-fallback", sentence_start))

        # ② Sub-reveal — a bullet that isn't spoken. Snap to a leftover pause in the window, or divide evenly
        span = w1 - w0
        for i in range(1, k):
            target = w0 + i * span / k
            tol = span / (2 * k)
            best = None
            for s in sil:
                if s[3]:
                    continue
                mid = (s[0] + s[1]) / 2
                if w0 < s[0] and s[1] < w1 and abs(mid - target) <= tol:
                    if best is None or abs(mid - target) < abs((best[0] + best[1]) / 2 - target):
                        best = s
            if best:
                best[3] = True
                # Finish the appearance just before the breath ends and speech resumes (best[1])
                st, du = fit_in_pause(best[0], best[1], a.fade, a.gap)
                events.append((st, du, "breath-snap", best[1]))
            else:
                events.append((target - a.fade / 2, a.fade, "even-split", None))

    events.sort(key=lambda e: e[0])

    # Force monotonic increase + the ceiling (while shifting onto card time)
    out = []
    prev_end = 0.05
    for st, du, why, ref in events:
        st += a.pre
        if st < prev_end + MIN_GAP:
            st = prev_end + MIN_GAP
            why += "+pushed"
        hi = a.dur - du - 0.05
        if st > hi:
            st = hi
            why += "+capped"
        out.append((st, du, why, ref))
        prev_end = st + du

    for st, du, why, ref in out:
        print(f"{st:.4f}\t{du:.4f}\t{why}")

    if a.report:
        for st, du, why, ref in out:
            if ref is None:
                print(f"      {st:6.2f}s +{du:.2f}s  {why}", file=sys.stderr)
            else:
                # Fade completion relative to the sentence start (negative = still appearing after it starts)
                err = (ref + a.pre) - (st + du)
                print(f"      {st:6.2f}s +{du:.2f}s  {why}  done {err:+.2f}s before the sentence starts", file=sys.stderr)


if __name__ == "__main__":
    main()
