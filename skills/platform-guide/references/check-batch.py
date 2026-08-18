#!/usr/bin/env python3
"""Batch homogenization check — measures not one post but **whether the posts from
one round resemble each other**.

Why it exists separately: `check-style.py` reads one manuscript at a time. But
individual quality and batch diversity move **in opposite directions** — in a
preregistered experiment, AI-assisted posts each got more novel (+6.7%) while
posts from the same condition grew more alike (Doshi & Hauser, Science
Advances 2024). So ten posts that each scored 100 on the single-post gate can
all look the same, and that defect is **in principle** invisible from any one
post. This checker is that axis.
Sister-plugin field data: two manuscripts differing only in material scored
100/100 each, with a mutual overlap of 0.77.

The metric is document-pair longest common subsequence (word-level, Rouge-L
family) — the same metric used by the research that actually measured
homogenization (Padmakumar & He, ICLR 2024). The similarly named self-BLEU
family is not used: the claim linking that metric to human-soundingness failed
verification, 0 of 3 votes.

**There is no threshold. There is no rejection.** The numbers in the research
above come from English essay experiments, and there are no grounds to carry
them over as a cutoff for Korean copy. Hard-coding a groundless number as a
threshold would violate the very principle this gate protects. So instead of a
verdict it emits **rankings and lists** — which two posts are most alike and
which phrases got reused — and a human decides what to rewrite.

    python3 check-batch.py post1.md post2.md post3.md
    python3 check-batch.py --split round-threads.md   # one piece per markdown header
    python3 check-batch.py --json --top 5 data/ch/*/output/threads.md

exit 0 pass (always) / 3 execution error. No dependencies (stdlib only).
Grounds: fect-persona `docs/research/llm-style-interventions/index.html`
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict

# LCS cost ceiling. 1200×1200 words is what each pair costs — must equal the
# sister plugin's (JS) value so the same manuscript gets the same number.
MAX_TOKENS = 1200

# ---------------------------------------------------------------------------
# Normalization — strip what isn't style first
# ---------------------------------------------------------------------------
# Skip this and **templates get flagged as style**. Re-measuring two storyboards
# raw in the sister plugin, all ten "reused phrase" lines were skeleton —
# frontmatter and `images/scene-3.png` (field-tested). Only sentences a human
# can rewrite pass through.
#
# **Order matters.** Strip punctuation first and `images/scene-1.png` splits
# into `images/scene-1` + `png`, leaving only the extension alive.
_FRONTMATTER = re.compile(r"\A---\n.*?\n---\n", re.S)
_FENCE = re.compile(r"```.*?```", re.S)
_URL = re.compile(r"https?://\S+")
# Strip paths only. Deleting everything with a slash is wrong — prose has
# slashes too ("찬성/반대", "km/h"). Treat as a path only with an extension
# attached or three or more segments.
_PATH_EXT = re.compile(r"\S*/\S*\.[A-Za-z0-9]{1,6}\b")
_PATH_DEEP = re.compile(r"\S+/\S+/\S*")
_FILENAME = re.compile(
    r"\S+\.(png|jpe?g|webp|mp4|mp3|wav|js|mjs|ts|json|tsv|csv|md|html?|css|py|sh)\b",
    re.I)
_LEADING = re.compile(r"(?m)^[ \t]*[>#|*\-+]+[ \t]*")
_SYMBOLS = re.compile(r"[|*_`~\[\]()<>\"'“”‘’]")
_PUNCT = re.compile(r"[.,!?…:;]")
_HEADER = re.compile(r"(?m)^(#{2,4})\s*(.+)$")


def tokens(text: str) -> list[str]:
    flat = unicodedata.normalize("NFC", text)
    for rx in (_FRONTMATTER, _FENCE, _URL, _PATH_EXT, _PATH_DEEP,
               _FILENAME, _LEADING, _SYMBOLS, _PUNCT):
        flat = rx.sub(" ", flat)
    return flat.split()


def sections(text: str) -> list[tuple[str, str]]:
    """One piece per markdown header (`##`~`####`) — same rule as check-style.py `--split`."""
    heads = list(_HEADER.finditer(text))
    if not heads:
        return [("(all)", text)]
    out = []
    for i, h in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
        piece = text[h.end():end].strip()
        if piece:
            out.append((h.group(2).strip(), piece))
    return out


def labels(paths: list[str]) -> list[str]:
    """File labels. Round manuscripts routinely share names (one `threads.md`
    per episode), so bare filenames yield "threads.md ↔ threads.md" and you
    can't tell which pair it is — a spot we stepped on in the field. On
    collision, prepend parent directories until they differ."""
    parts = [[s for s in p.split("/") if s] for p in paths]
    depth = 1
    while depth < 6 and len({"/".join(s[-depth:]) for s in parts}) < len(paths):
        depth += 1
    return ["/".join(s[-depth:]) for s in parts]


# ---------------------------------------------------------------------------
# Metric 1: document-pair overlap (word LCS-based F1 — Rouge-L family)
# ---------------------------------------------------------------------------

def lcs_len(a: list[str], b: list[str]) -> int:
    """Standard LCS carrying only two rows.

    **Words present on only one side are removed first.** A common subsequence
    can only contain words present on both sides, so the result doesn't change
    (lengths use the originals — see the F1 computation below). This is a pure
    Python loop; without the reduction, 1200×1200 takes seconds per pair.
    """
    common = set(a) & set(b)
    a = [t for t in a if t in common]
    b = [t for t in b if t in common]
    if not a or not b:
        return 0
    prev = [0] * (len(b) + 1)
    for ai in a:
        cur = [0] * (len(b) + 1)
        for j, bj in enumerate(b, 1):
            cur[j] = prev[j - 1] + 1 if ai == bj else max(prev[j], cur[j - 1])
        prev = cur
    return prev[len(b)]


def analyze(docs: list[dict], top: int, ngram: int) -> dict:
    pairs = []
    for i in range(len(docs)):
        for j in range(i + 1, len(docs)):
            a, b = docs[i], docs[j]
            if not a["tokens"] or not b["tokens"]:
                continue
            l = lcs_len(a["tokens"], b["tokens"])
            p = l / len(b["tokens"])
            r = l / len(a["tokens"])
            f = (2 * p * r) / (p + r) if p + r else 0.0
            pairs.append({"a": a["name"], "b": b["name"], "overlap": round(f, 4)})
    pairs.sort(key=lambda x: -x["overlap"])
    mean = sum(p["overlap"] for p in pairs) / len(pairs) if pairs else 0.0

    # Metric 2: reused phrases — the pair score only says "they're alike".
    # To fix it you need **which phrase**.
    seen_in = defaultdict(set)
    for di, d in enumerate(docs):
        t = d["tokens"]
        for i in range(len(t) - ngram + 1):
            seen_in[" ".join(t[i:i + ngram])].add(di)
    repeated = sorted(
        ({"text": k, "docs": len(v)} for k, v in seen_in.items() if len(v) >= 2),
        key=lambda x: (-x["docs"], -len(x["text"])),
    )

    # Metric 3: opening/ending clustering. When a batch opens with the same
    # words and closes on the same endings, the feed reads like one author even
    # if every post scores well. An axis the single-post gate doesn't have.
    def tally(keys: list[str]) -> list[dict]:
        c = Counter(k for k in keys if k)
        return [{"key": k, "n": n, "share": round(n / len(keys), 3)}
                for k, n in c.most_common()]

    opens = tally([d["tokens"][0] if d["tokens"] else "" for d in docs])
    closes = []
    for d in docs:
        last = next((t for t in reversed(d["tokens"]) if re.search(r"[가-힣]{2}$", t)), "")
        closes.append(re.sub(r"[^가-힣]", "", last)[-2:] if last else "")

    return {
        "docs": len(docs),
        "truncated": [d["name"] for d in docs if d["truncated"]],
        "meanOverlap": round(mean, 4),
        "topPairs": pairs[:top],
        "repeatedPhrases": repeated[:top * 2],
        "openings": [o for o in opens if o["n"] >= 2],
        "endings": [c for c in tally(closes) if c["n"] >= 2],
    }


def render(r: dict, ngram: int) -> str:
    out = [f"{r['docs']} manuscripts · mean pair overlap {r['meanOverlap']}"]
    if r["truncated"]:
        out.append(f"  (cut at {MAX_TOKENS} words: {', '.join(r['truncated'])})")
    out.append("\nMost similar pairs")
    for p in r["topPairs"]:
        out.append(f"  {p['overlap']}  {p['a']} ↔ {p['b']}")
    if r["repeatedPhrases"]:
        out.append(f"\nReused phrases ({ngram} words matching verbatim)")
        for x in r["repeatedPhrases"]:
            out.append(f"  {x['docs']} docs  \"{x['text']}\"")
    if r["openings"]:
        out.append("\nSame opening words")
        for o in r["openings"]:
            out.append(f"  {o['n']} docs ({round(o['share'] * 100)}%)  \"{o['key']}…\"")
    if r["endings"]:
        out.append("\nSame sentence endings")
        for c in r["endings"]:
            out.append(f"  {c['n']} docs ({round(c['share'] * 100)}%)  \"…{c['key']}\"")
    out.append(
        "\nNo verdict — there are no field-tested grounds for a threshold (the research "
        "numbers come from English essay experiments).\nPick the pairs with standout "
        "overlap and the reused phrases from the rankings above and rewrite those.")
    return "\n".join(out)


# ---------------------------------------------------------------------------

def selftest() -> int:
    """Pins down that the metric actually reacts to homogenization.

    a·b are the same skeleton with the material swapped; c is a different post.
    All three pass `check-style.py` with full marks — which is why this checker
    exists.
    """
    a = ("요즘 비자 연장 때문에 출입국에 다녀왔어요. 접수증은 그 자리에서 주는데 "
         "처리까지는 닷새 걸린다고 하더라고요. 서류는 여권 원본이랑 사본 두 장, "
         "거주지 확인서까지 챙겨 가면 한 번에 끝나요.")
    b = ("요즘 노동허가증 때문에 노동청에 다녀왔어요. 접수증은 그 자리에서 주는데 "
         "처리까지는 열흘 걸린다고 하더라고요. 서류는 계약서 원본이랑 사본 두 장, "
         "건강검진서까지 챙겨 가면 한 번에 끝나요.")
    c = ("어제 세관에서 짐을 찾다가 황당한 일을 겪었어요. 통관 번호를 잘못 적었다며 "
         "창구 직원이 서류를 되돌려 줬거든요. 다시 줄을 서서 두 시간을 버렸는데 알고 "
         "보니 시스템에 이미 등록돼 있었더군요.")
    docs = []
    for name, text in (("a", a), ("b", b), ("c", c)):
        t = tokens(text)
        docs.append({"name": name, "tokens": t[:MAX_TOKENS],
                     "truncated": len(t) > MAX_TOKENS})
    r = analyze(docs, 5, 4)
    top = r["topPairs"][0]
    checks = [
        ("the same-skeleton pair ranks first", {top["a"], top["b"]} == {"a", "b"}),
        ("same-skeleton overlap exceeds 0.5", top["overlap"] > 0.5),
        ("pairs with the different post stay under 0.2",
         all(p["overlap"] < 0.2 for p in r["topPairs"] if "c" in (p["a"], p["b"]))),
        ("reused phrases are found", len(r["repeatedPhrases"]) >= 3),
        ("paths and extensions are not words",
         tokens("images/scene-1.png 와 scenes.js 는 뼈대다") == ["와", "는", "뼈대다"]),
        ("slash expressions are kept", "찬성/반대" in tokens("찬성/반대 의견을 적었다")),
    ]
    failed = 0
    for name, ok in checks:
        failed += 0 if ok else 1
        print(f"[{'PASS' if ok else 'FAIL'}] {name}")
    print(f"\n{len(checks) - failed}/{len(checks)} passed "
          f"(same-skeleton overlap {top['overlap']}, mean {r['meanOverlap']})")
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="batch homogenization check (no verdict)")
    p.add_argument("paths", nargs="*", help="manuscript files to check")
    p.add_argument("--split", action="store_true",
                   help="split one file into one piece per markdown header")
    p.add_argument("--json", action="store_true", help="structured output")
    p.add_argument("--top", type=int, default=5, help="pairs to show (default 5)")
    p.add_argument("--ngram", type=int, default=4, help="reused-phrase length in words (default 4)")
    p.add_argument("--selftest", action="store_true", help="self-check that the metric reacts")
    args = p.parse_args(argv)

    if args.selftest:
        return selftest()
    if not args.paths:
        p.error("manuscript files are required (use --selftest to verify the metric only)")

    names = labels(args.paths)
    docs = []
    for path, name in zip(args.paths, names):
        try:
            raw = sys.stdin.read() if path == "-" else open(path, encoding="utf-8").read()
        except OSError as e:
            print(f"check-batch: could not read — {e}", file=sys.stderr)
            return 3
        for piece_name, piece in (sections(raw) if args.split else [(name, raw)]):
            t = tokens(piece)
            docs.append({
                "name": f"{name}#{piece_name}" if args.split else piece_name,
                "tokens": t[:MAX_TOKENS],
                "truncated": len(t) > MAX_TOKENS,
            })

    if len(docs) < 2:
        print(f"check-batch: only {len(docs)} manuscript(s) — the batch check needs 2 or more.",
              file=sys.stderr)
        return 3

    r = analyze(docs, args.top, args.ngram)
    print(json.dumps(r, ensure_ascii=False, indent=2) if args.json else render(r, args.ngram))
    return 0


if __name__ == "__main__":
    sys.exit(main())
