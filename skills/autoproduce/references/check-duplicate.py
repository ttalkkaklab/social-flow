#!/usr/bin/env python3
"""Judge whether a candidate topic is a story this channel already has.

A different slug looks like a new topic, but the content can be the same
("비자 수수료 인상" and "베트남 비자 수수료 오른다" — two phrasings of "visa
fees are going up"). Automated authoring can't leave that call to a human, so
this makes the verdict deterministic — character-bigram Jaccard similarity.

It compares against **every existing topic** on the channel — what autoproduce
made and what humans made alike (the point is to stop the same story going up
twice). Three identities are extracted per topic — the directory slug, the
storyboard.md title, and the scenes.js cover title. The highest of the three
scores becomes that topic's score.

Usage:
  check-duplicate.py --channel-dir data/<channel> --title "<candidate title>"
                     [--message "<core message>"] [--threshold 0.45] [--json]

Exit codes — read literally:
  0  new (below the threshold)
  2  suspected duplicate — drop this candidate and move to the next
  1  verdict unavailable (channel directory missing, etc.). **Never read as new**
  3  input error
"""
import argparse
import json
import os
import re
import sys

# Threshold 0.5 — calibrated against the fixtures. It catches pairs telling the
# same story in different words (0.5~1.0) and passes different topics on the
# same channel (0.0~0.25). To change it, start with the --selftest fixtures.
# **It leans toward blocking** — skipping a candidate is cheap, a rehash going
# out in public is expensive. Series-style titles with a shared prefix trip
# this threshold, so call such channels with a higher --threshold (plan
# duplicate_threshold) or have a human make them with storyboard.
DEFAULT_THRESHOLD = 0.5

_KEEP = re.compile(r'[^0-9A-Za-z가-힣]+')


def normalize(s: str) -> str:
    s = s.replace('**', ' ')
    s = _KEEP.sub('', s)
    return s.lower()


def bigrams(s: str) -> set:
    s = normalize(s)
    if len(s) < 2:
        return {s} if s else set()
    return {s[i:i + 2] for i in range(len(s) - 1)}


def similarity(a: str, b: str) -> float:
    """Overlap coefficient — how much of the shorter string sits in the longer.

    Jaccard docks the score just because one side is longer and misses rehashes
    ("베트남 비자 수수료 오른다" ↔ "비자 수수료 인상 시점" passes at 0.29).
    But the overlap coefficient hits 1.0 too easily on short strings, so fall
    back to Jaccard when there are fewer than 4 bigrams."""
    ba, bb = bigrams(a), bigrams(b)
    if not ba or not bb:
        return 0.0
    inter = len(ba & bb)
    if min(len(ba), len(bb)) < 4:
        return inter / len(ba | bb)
    return inter / min(len(ba), len(bb))


def cover_title(scenes_path: str):
    """The first title value in scenes.js. Pulled with a regex, no parser —
    not executing the JS is this script's contract."""
    try:
        with open(scenes_path, encoding='utf-8') as f:
            src = f.read()
    except OSError:
        return None
    m = re.search(r'title:\s*"((?:[^"\\]|\\.)*)"', src)
    return m.group(1) if m else None


def doc_title(md_path: str):
    try:
        with open(md_path, encoding='utf-8') as f:
            for line in f:
                if line.startswith('# '):
                    return line[2:].split('—')[0].strip()
    except OSError:
        return None
    return None


# Slots kept at the channel root — nothing under these is an episode
_RESERVED = frozenset({'assets', 'growth', 'episodes', 'scratch', 'output'})


def _topic_roots(channel_dir: str):
    """Directories that hold episodes. episodes/ first, plus the legacy layout (channel root)."""
    roots = []
    epi = os.path.join(channel_dir, 'episodes')
    if os.path.isdir(epi):
        roots.append(epi)
    roots.append(channel_dir)
    return roots


def collect(channel_dir: str):
    """[(slug, [identity strings])] — one per topic directory."""
    out = []
    seen = set()
    for root in _topic_roots(channel_dir):
        try:
            names = os.listdir(root)
        except OSError:
            continue
        for name in sorted(names):
            if name in _RESERVED or name.startswith('.') or name in seen:
                continue
            sb = os.path.join(root, name, 'storyboard')
            if not os.path.isdir(sb):
                continue
            seen.add(name)
            ids = [name.replace('-', ' ')]
            t = doc_title(os.path.join(sb, 'storyboard.md'))
            if t:
                ids.append(t)
            c = cover_title(os.path.join(sb, 'scenes.js'))
            if c:
                ids.append(c)
            out.append((name, ids))
    return out


def selftest() -> int:
    cases = [
        # (candidate, existing, should-be-duplicate, memo)
        ("베트남 비자 수수료 오른다", "비자 수수료 인상 시점", True, "same fact, different wording"),
        ("임시거주 신고, 안 하면 과태료", "임시거주 신고 안 하면 과태료입니다", True, "only the sentence ending differs"),
        ("비자 수수료 인상", "비자 수수료 인상", True, "identical"),
        ("임시거주 신고 절차", "임시거주 신고, 안 하면 과태료", True, "same policy, different angle"),
        ("환율 급등, 송금 언제", "2026년 환율 급등기 송금 타이밍", True, "only the year and particles differ"),
        # Conservative verdict — to a human these are different episodes of a
        # series, but the shared prefix blocks them. Not a misjudgment: a
        # designed bias (blocking is the cheap side).
        ("연말정산 의료비 공제", "연말정산 월세 공제", True, "series prefix — conservatively blocked"),
        ("임시거주 신고 절차", "비자 수수료 인상 시점", False, "unrelated"),
        ("7월 환율 변동", "임시거주 신고, 안 하면 과태료", False, "unrelated"),
        ("주재원 건강보험 가입", "주재원 자녀 학교 등록", False, "only the target audience matches"),
        ("비자 수수료 인상", "비자 발급 절차 바뀜", False, "only the material matches"),
        ("전기요금 누진제 개편", "도시가스 요금 인상", False, "only the domain matches"),
    ]
    bad = 0
    for cand, prior, dup, memo in cases:
        s = similarity(cand, prior)
        got = s >= DEFAULT_THRESHOLD
        if got != dup:
            bad += 1
        print(f"  {'ok ' if got == dup else 'FAIL'} {s:.3f} dup={dup} · {memo}")
        print(f"        {cand!r} ↔ {prior!r}")
    print("selftest PASS" if not bad else f"selftest FAIL {bad} cases")
    return 0 if not bad else 1


def main() -> int:
    p = argparse.ArgumentParser(description='Topic duplicate verdict (character-bigram Jaccard)')
    p.add_argument('--channel-dir')
    p.add_argument('--title')
    p.add_argument('--message', default='')
    p.add_argument('--threshold', type=float, default=DEFAULT_THRESHOLD)
    p.add_argument('--json', action='store_true')
    p.add_argument('--selftest', action='store_true')
    a = p.parse_args()

    if a.selftest:
        return selftest()
    if not a.channel_dir or not a.title:
        print('--channel-dir and --title are required (use --selftest to check only the rules)', file=sys.stderr)
        return 3
    if not os.path.isdir(a.channel_dir):
        print(f'channel directory missing: {a.channel_dir} — verdict unavailable', file=sys.stderr)
        return 1

    cand = a.title if not a.message else f'{a.title} {a.message}'
    scored = []
    for slug, ids in collect(a.channel_dir):
        best = max((similarity(cand, i) for i in ids), default=0.0)
        scored.append((best, slug))
    scored.sort(reverse=True)

    top = scored[:3]
    dup = bool(scored) and scored[0][0] >= a.threshold

    if a.json:
        print(json.dumps({
            'candidate': a.title, 'threshold': a.threshold, 'duplicate': dup,
            'compared': len(scored),
            'top': [{'slug': s, 'score': round(v, 4)} for v, s in top],
        }, ensure_ascii=False))
    else:
        print(f'duplicate verdict — candidate "{a.title}" · {len(scored)} existing topics · threshold {a.threshold}')
        for v, s in top:
            print(f'  {v:.3f}  {s}')
        print('verdict: duplicate — drop this candidate' if dup else 'verdict: new')
    return 2 if dup else 0


if __name__ == '__main__':
    sys.exit(main())
