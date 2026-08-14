#!/usr/bin/env python3
"""묶음 동질화 검사 — 글 하나가 아니라 **한 라운드에서 나온 글들이 서로 닮았는지**를 잰다.

왜 따로 있나: `check-style.py` 는 원고를 한 편씩 본다. 그런데 개별 글의 품질과 발행
묶음의 다양성은 **반대로 움직인다** — 사전등록 실험에서 AI 를 쓴 글은 하나하나는
참신해졌는데(+6.7%) 같은 조건에서 나온 글끼리는 서로 더 비슷해졌다(Doshi & Hauser,
Science Advances 2024). 그래서 한 편 게이트가 100점을 준 글 열 편이 서로 똑같이 생길
수 있고, 그 결함은 한 편만 봐서는 **원리적으로** 안 보인다. 이 검사기가 그 축이다.
자매 플러그인 실측: 소재만 바꾼 두 원고가 각각 100/100 인데 서로 겹침 0.77.

지표는 문서쌍 최장공통부분열(어절 기준 Rouge-L 계열)이다 — 동질화를 실제로 측정한
연구가 쓴 지표를 그대로 따랐다(Padmakumar & He, ICLR 2024). 이름이 비슷한 self-BLEU
계열은 쓰지 않는다: 그 지표를 사람다움과 이은 주장은 검증 3표 중 0표로 탈락했다.

**임계값이 없다. 반려도 없다.** 위 연구의 숫자는 영어 에세이 실험값이라 한국어 카피의
문턱으로 옮길 근거가 없다. 근거 없는 숫자를 문턱으로 박으면 이 게이트가 지키려는
원칙을 스스로 어긴다. 그래서 판정 대신 **순위와 목록**을 낸다 — 어느 두 글이 가장
닮았고 어떤 구절을 돌려썼는지 보여 주고, 고칠지는 사람이 정한다.

    python3 check-batch.py post1.md post2.md post3.md
    python3 check-batch.py --split round-threads.md   # 마크다운 헤더마다 한 편으로
    python3 check-batch.py --json --top 5 data/ch/*/output/threads.md

exit 0 통과(항상) / 3 실행 오류. 의존성 없음(표준 라이브러리만).
근거: fect-persona `docs/research/llm-style-interventions/index.html`
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict

# LCS 비용 상한. 어절 1200×1200 이 쌍마다 도는 한도다 — 자매 플러그인(JS)과 같은
# 값이라야 같은 원고에 같은 숫자가 나온다.
MAX_TOKENS = 1200

# ---------------------------------------------------------------------------
# 정규화 — 문체가 아닌 것을 먼저 걷어낸다
# ---------------------------------------------------------------------------
# 안 걷으면 **템플릿이 문체로 잡힌다**. 자매 플러그인에서 스토리보드 두 편을 그대로
# 재 봤더니 "돌려쓴 구절" 열 줄이 전부 프런트매터와 `images/scene-3.png` 같은
# 뼈대였다(실측). 사람이 고칠 수 있는 문장만 통과시킨다.
#
# **순서가 중요하다.** 구두점을 먼저 지우면 `images/scene-1.png` 가
# `images/scene-1` + `png` 로 쪼개져 확장자만 살아남는다.
_FRONTMATTER = re.compile(r"\A---\n.*?\n---\n", re.S)
_FENCE = re.compile(r"```.*?```", re.S)
_URL = re.compile(r"https?://\S+")
# 경로만 걷는다. 빗금이 들어갔다고 다 지우면 안 된다 — "찬성/반대"·"km/h" 처럼
# 산문에도 빗금이 온다. 확장자가 붙었거나 구간이 셋 이상일 때만 경로로 본다.
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
    """마크다운 헤더(`##`~`####`)마다 한 편으로 나눈다 — check-style.py `--split` 과 같은 규칙."""
    heads = list(_HEADER.finditer(text))
    if not heads:
        return [("(전체)", text)]
    out = []
    for i, h in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
        piece = text[h.end():end].strip()
        if piece:
            out.append((h.group(2).strip(), piece))
    return out


def labels(paths: list[str]) -> list[str]:
    """파일 이름표. 라운드 원고는 이름이 겹치기 일쑤라(`threads.md` 가 회차마다 하나씩)
    파일명만 쓰면 "threads.md ↔ threads.md" 가 되어 어느 쌍인지 알 수 없다 — 실측으로
    밟은 자리다. 겹치면 갈릴 때까지 상위 디렉터리를 붙인다."""
    parts = [[s for s in p.split("/") if s] for p in paths]
    depth = 1
    while depth < 6 and len({"/".join(s[-depth:]) for s in parts}) < len(paths):
        depth += 1
    return ["/".join(s[-depth:]) for s in parts]


# ---------------------------------------------------------------------------
# 지표 1: 문서쌍 겹침 (어절 LCS 기반 F1 — Rouge-L 계열)
# ---------------------------------------------------------------------------

def lcs_len(a: list[str], b: list[str]) -> int:
    """행 두 줄만 들고 도는 표준 LCS.

    **한쪽에만 있는 어절을 먼저 뺀다.** 공통부분열에는 양쪽에 다 있는 어절만 들어갈
    수 있으므로 결과가 바뀌지 않는다(길이는 원본 것을 쓴다 — 아래 F1 계산 참고).
    파이썬 순수 루프라 이 축소가 없으면 1200×1200 이 쌍마다 초 단위로 돈다.
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

    # 지표 2: 되풀이 구절 — 문서쌍 점수는 "닮았다"까지만 말한다.
    # 고치려면 **어느 구절인지**가 필요하다.
    seen_in = defaultdict(set)
    for di, d in enumerate(docs):
        t = d["tokens"]
        for i in range(len(t) - ngram + 1):
            seen_in[" ".join(t[i:i + ngram])].add(di)
    repeated = sorted(
        ({"text": k, "docs": len(v)} for k, v in seen_in.items() if len(v) >= 2),
        key=lambda x: (-x["docs"], -len(x["text"])),
    )

    # 지표 3: 문두·종결 쏠림. 묶음이 같은 말로 시작하고 같은 어미로 끝나면, 글마다
    # 점수가 좋아도 피드에서는 한 사람이 쓴 것처럼 보인다. 한 편 게이트에 없는 축이다.
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
    out = [f"원고 {r['docs']}편 · 문서쌍 평균 겹침 {r['meanOverlap']}"]
    if r["truncated"]:
        out.append(f"  ({MAX_TOKENS}어절에서 자른 원고: {', '.join(r['truncated'])})")
    out.append("\n가장 닮은 쌍")
    for p in r["topPairs"]:
        out.append(f"  {p['overlap']}  {p['a']} ↔ {p['b']}")
    if r["repeatedPhrases"]:
        out.append(f"\n돌려쓴 구절 ({ngram}어절이 그대로 겹친 것)")
        for x in r["repeatedPhrases"]:
            out.append(f"  {x['docs']}편  \"{x['text']}\"")
    if r["openings"]:
        out.append("\n같은 말로 시작")
        for o in r["openings"]:
            out.append(f"  {o['n']}편 ({round(o['share'] * 100)}%)  \"{o['key']}…\"")
    if r["endings"]:
        out.append("\n같은 어미로 끝남")
        for c in r["endings"]:
            out.append(f"  {c['n']}편 ({round(c['share'] * 100)}%)  \"…{c['key']}\"")
    out.append(
        "\n판정하지 않는다 — 문턱으로 쓸 실측 근거가 없다(연구 숫자는 영어 에세이 "
        "실험값이다).\n위 순위에서 겹침이 두드러진 쌍과 돌려쓴 구절만 골라 다시 쓴다.")
    return "\n".join(out)


# ---------------------------------------------------------------------------

def selftest() -> int:
    """지표가 실제로 동질화에 반응하는지 못박는다.

    a·b 는 소재만 바꾼 같은 틀이고 c 는 다른 글이다. 셋 다 `check-style.py` 는
    만점으로 통과시킨다 — 그게 이 검사기가 있는 이유다.
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
        ("같은 틀 쌍이 1위다", {top["a"], top["b"]} == {"a", "b"}),
        ("같은 틀 겹침이 0.5 를 넘는다", top["overlap"] > 0.5),
        ("다른 글 쌍은 0.2 미만이다",
         all(p["overlap"] < 0.2 for p in r["topPairs"] if "c" in (p["a"], p["b"]))),
        ("돌려쓴 구절을 찾아낸다", len(r["repeatedPhrases"]) >= 3),
        ("경로·확장자는 어절이 아니다",
         tokens("images/scene-1.png 와 scenes.js 는 뼈대다") == ["와", "는", "뼈대다"]),
        ("빗금 표현은 안 걷는다", "찬성/반대" in tokens("찬성/반대 의견을 적었다")),
    ]
    failed = 0
    for name, ok in checks:
        failed += 0 if ok else 1
        print(f"[{'PASS' if ok else 'FAIL'}] {name}")
    print(f"\n{len(checks) - failed}/{len(checks)} 통과 "
          f"(같은 틀 겹침 {top['overlap']}, 평균 {r['meanOverlap']})")
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="묶음 동질화 검사 (판정하지 않는다)")
    p.add_argument("paths", nargs="*", help="검사할 원고 파일들")
    p.add_argument("--split", action="store_true",
                   help="파일 하나를 마크다운 헤더마다 한 편으로 나눈다")
    p.add_argument("--json", action="store_true", help="구조화 출력")
    p.add_argument("--top", type=int, default=5, help="보여 줄 쌍 수 (기본 5)")
    p.add_argument("--ngram", type=int, default=4, help="되풀이 구절 어절 수 (기본 4)")
    p.add_argument("--selftest", action="store_true", help="지표 반응 자가 검증")
    args = p.parse_args(argv)

    if args.selftest:
        return selftest()
    if not args.paths:
        p.error("검사할 원고 파일이 필요하다 (지표 검증만 할 때는 --selftest)")

    names = labels(args.paths)
    docs = []
    for path, name in zip(args.paths, names):
        try:
            raw = sys.stdin.read() if path == "-" else open(path, encoding="utf-8").read()
        except OSError as e:
            print(f"check-batch: 읽지 못했다 — {e}", file=sys.stderr)
            return 3
        for piece_name, piece in (sections(raw) if args.split else [(name, raw)]):
            t = tokens(piece)
            docs.append({
                "name": f"{name}#{piece_name}" if args.split else piece_name,
                "tokens": t[:MAX_TOKENS],
                "truncated": len(t) > MAX_TOKENS,
            })

    if len(docs) < 2:
        print(f"check-batch: 원고가 {len(docs)}편뿐이다 — 묶음 검사는 2편 이상이 필요하다.",
              file=sys.stderr)
        return 3

    r = analyze(docs, args.top, args.ngram)
    print(json.dumps(r, ensure_ascii=False, indent=2) if args.json else render(r, args.ngram))
    return 0


if __name__ == "__main__":
    sys.exit(main())
