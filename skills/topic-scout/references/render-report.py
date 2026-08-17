#!/usr/bin/env python3
"""시장 키워드 JSON·md 를 도표 위주 A4 HTML 로 뽑는다.

사람이 보는 화면은 HTML 이다. md 는 grow-youtube / autoproduce 가 읽는
숫자·고른 구 정본이고, 채팅에 표를 다시 그리지 않는다.

화면의 중심은 키워드가 다루는 콘텐츠와, 우리가 만들 편이다.
어떻게 골랐나는 마지막 한 섹션이다.

사용:
  render-report.py --json data/<채널>/growth/keywords/market-keywords.json
                   [--md data/<채널>/growth/keywords/market-keywords.md]
                   [--out data/<채널>/growth/keywords/market-keywords.html]
                   [--name 딸깍랩]
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CSS_PATH = os.path.join(HERE, "report.css")

ACCENT = "#0b4f9e"
NAVY = "#0b2545"
INK = "#1a1a1a"
SUB = "#555"
NEUTRAL = "#f5f7fa"
NEUTRAL_BD = "#9aa2ae"
EMPH = "#e8f1fb"


def esc(value) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def clip(text: str, n: int) -> str:
    t = re.sub(r"\s+", " ", (text or "")).strip()
    return t if len(t) <= n else t[: n - 1] + "…"


def comma(n) -> str:
    try:
        return f"{int(round(float(n))):,}"
    except (TypeError, ValueError):
        return "—"


def num(n, default=0.0) -> float:
    try:
        return float(n)
    except (TypeError, ValueError):
        return default


def parse_chosen(md: str) -> list[tuple[str, str]]:
    """## 고른 주제 아래 '- 구 — 한 줄' 을 읽는다. '없음' 이면 빈 목록."""
    m = re.search(r"^## 고른 주제\s*$", md, re.M)
    if not m:
        return []
    rest = md[m.end() :]
    nxt = re.search(r"^## ", rest, re.M)
    block = rest[: nxt.start()] if nxt else rest
    out: list[tuple[str, str]] = []
    for raw in block.splitlines():
        line = raw.strip()
        if not line.startswith("- "):
            continue
        body = line[2:].strip()
        if body.startswith("없음"):
            return []
        if "—" in body:
            phrase, why = body.split("—", 1)
        elif " - " in body:
            phrase, why = body.split(" - ", 1)
        else:
            phrase, why = body, ""
        phrase = phrase.strip()
        if phrase:
            out.append((phrase, why.strip()))
    return out


def parse_flags(md: str) -> dict[str, str]:
    """주제어 표 마지막 칸(이미 씀 / 걸러)을 구 → 표시 로 읽는다."""
    flags: dict[str, str] = {}
    for line in md.splitlines():
        if not line.startswith("|") or line.startswith("| ---") or line.startswith("| 구"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 5:
            continue
        flags[cells[0]] = cells[4]
    return flags


# 사람이 보는 HTML 전용. md·json 의 영어·중국어 조각은 그대로 두고,
# 화면에는 아래 쉬운 말로 옮긴다.
_LABELS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"secret websites|earn dollars|숨은 사이트", re.I), "돈 되는 숨은 사이트"),
    (re.compile(r"coding.?sidehustle|sidehustle.*coding|do this sidehustle|코딩으로 부업", re.I), "코딩으로 부업"),
    (re.compile(r"claude|websitebuilder|appbuilder|클로드로 웹", re.I), "클로드로 웹·앱 만들기"),
    (re.compile(r"cloud storage|클라우드 저장", re.I), "비싼 클라우드 저장소 대신"),
    (re.compile(r"powerful websites|aitools|알아두면 좋은", re.I), "알아두면 좋은 AI 사이트"),
    (re.compile(r"에이스 직원"), "AI로 일 잘하는 직원 뽑기"),
    (re.compile(r"隐藏的 max|숨은 맥스|codex.*max", re.I), "코덱스 숨은 맥스 모드"),
    (re.compile(r"做视频搞钱|영상 부업|装完codex", re.I), "코덱스로 영상 부업"),
    (re.compile(r"带货|띠화|판매 영상", re.I), "AI로 판매 영상 한 번에"),
    (re.compile(r"cloudflare|클라우드플레어", re.I), "AI로 클라우드플레어 세팅"),
    (re.compile(r"1200|크레딧|白送", re.I), "코덱스 1200달러 크레딧"),
    (re.compile(r"robotvacuum|climb stairs|로봇청소기", re.I), "계단 오르는 로봇청소기"),
    (re.compile(r"perfume|향수", re.I), "향수 리필로 아끼기"),
    (re.compile(r"baggage|수하물", re.I), "부서진 짐 보상 받는 법"),
    (re.compile(r"fanvue|ofm|influencer", re.I), "AI 인플루언서 성인 부업"),
    (re.compile(r"indonesian army|army news|뉴스", re.I), "뉴스 영상"),
    (re.compile(r"5-camera|smartphone|스마트폰", re.I), "카메라 다섯 개 스마트폰"),
    (re.compile(r"xchat", re.I), "엑스챗 설치"),
    (re.compile(r"클로드|gpt|그록", re.I), "클로드·GPT·그록 비교"),
    (re.compile(r"AI side hustle", re.I), "AI로 부업"),
    (re.compile(r"AI work automation", re.I), "AI로 업무 자동화"),
    (re.compile(r"AI tools comparison", re.I), "AI 도구 비교"),
    (re.compile(r"AI副业"), "AI 부업"),
    (re.compile(r"AI办公自动化"), "AI 업무 자동화"),
    (re.compile(r"AI工具对比"), "AI 도구 비교"),
]


# 키워드 → (묶음, 시장이 다루는 내용, 우리가 만들 편)
# 클로드 웹·앱 패턴이 비교 패턴보다 앞에 와야 한다.
_BRIEFS: list[tuple[re.Pattern[str], str, str, str]] = [
    (
        re.compile(r"secret websites|earn dollars|숨은 사이트", re.I),
        "부업 실험",
        "잘 안 알려진 사이트에서 달러로 일한다는 소개다. 공개 설명에서 이름이 나온 곳은 AI 학습 알바 Outlier 하나다.",
        "사이트 목록은 베끼지 않는다. 버즈(Buzz) 오픈소스로 우리가 직접 돌려 보고 걸린 시간과 결과만 보여 준다.",
    ),
    (
        re.compile(r"coding.?sidehustle|sidehustle.*coding|do this sidehustle|코딩으로 부업", re.I),
        "부업 실험",
        "코딩으로 돈 버는 부업을 권하는 짧은 영상이다. 무엇을 만들었는지는 제목에 거의 없다.",
        "남의 부업을 소개하지 않는다. 우리가 쓰는 도구로 한 건을 만들어 보고 숫자로 말한다.",
    ),
    (
        re.compile(r"claude|websitebuilder|appbuilder|클로드로 웹", re.I),
        "도구 실험",
        "클로드에게 웹이나 앱을 만들게 하는 영상이다. 같은 채널이 비슷한 편을 여러 개 올렸다.",
        "클로드로 우리가 쓸 페이지 하나를 처음부터 만들고 어디까지 되고 어디서 멈추는지 보여 준다.",
    ),
    (
        re.compile(r"cloud storage|클라우드 저장", re.I),
        "도구 실험",
        "비싼 클라우드 저장소 대신 싸게 쓰는 법을 소개한다.",
        "우리가 쓰는 저장 방법을 골라 한 달 비용을 숫자로 비교한다. 특정 서비스 광고처럼 쓰지 않는다.",
    ),
    (
        re.compile(r"powerful websites|aitools|알아두면 좋은", re.I),
        "도구 실험",
        "알아 두면 좋은 AI 사이트 목록이다.",
        "이미 만든 편이다. 같은 목록을 다시 찍지 않는다.",
    ),
    (
        re.compile(r"에이스 직원", re.I),
        "도구 실험",
        "AI로 일 잘하는 직원을 뽑는다는 소개다.",
        "이미 만든 편이다. 같은 주제를 다시 찍지 않는다.",
    ),
    (
        re.compile(r"隐藏的 max|숨은 맥스|codex.*max", re.I),
        "도구 실험",
        "코덱스에 잘 안 보이는 맥스 모드가 있고 쓰면 사용량이 크게 줄어든다는 소개다.",
        "맥스 모드를 우리가 켜 보고 같은 일을 할 때 사용량이 정말 줄어드는지 숫자로 보여 준다.",
    ),
    (
        re.compile(r"做视频搞钱|영상 부업|装完codex", re.I),
        "부업 실험",
        "코덱스를 깔고 나서 영상으로 돈 버는 법을 알려 준다.",
        "코덱스에게 우리 영상 한 편의 초안을 맡겨 보고 쓸 만한지와 실패한 지점까지 보여 준다.",
    ),
    (
        re.compile(r"带货|띠화|판매 영상", re.I),
        "부업 실험",
        "AI로 판매용 영상을 한 번에 만든다는 소개다. 수입이 늘었다는 말이 제목에 있다.",
        "수입 숫자는 베끼지 않는다. 우리 제품 하나로 판매 영상을 만들어 보고 결과물이 어떤지만 보여 준다.",
    ),
    (
        re.compile(r"cloudflare|클라우드플레어", re.I),
        "도구 실험",
        "AI에게 클라우드플레어 설정을 맡긴다는 소개다. 댓글에 질문이 남아 있다.",
        "우리가 쓰는 도메인 하나로 설정을 맡겨 보고 된 것과 막힌 것을 보여 준다.",
    ),
    (
        re.compile(r"1200|크레딧|白送", re.I),
        "부업 실험",
        "오픈AI가 코덱스 구독 크레딧 1,200달러를 준다는 소개다. 신청 조건이 댓글에 있다.",
        "우리가 신청해 보고 조건과 실제로 받은 액수만 보여 준다. 무조건 받을 수 있다고 말하지 않는다.",
    ),
    (
        re.compile(r"robotvacuum|climb stairs|로봇청소기", re.I),
        "우리 주제 아님",
        "계단 오르는 로봇청소기 광고다.",
        "",
    ),
    (
        re.compile(r"perfume|향수", re.I),
        "우리 주제 아님",
        "향수 리필로 아끼는 법이다. AI 실험이 아니다.",
        "",
    ),
    (
        re.compile(r"baggage|수하물", re.I),
        "우리 주제 아님",
        "부서진 짐 보상을 받는 여행 팁이다.",
        "",
    ),
    (
        re.compile(r"fanvue|ofm|influencer", re.I),
        "우리 주제 아님",
        "성인 쪽 AI 인플루언서 부업이다.",
        "",
    ),
    (
        re.compile(r"indonesian army|army news|뉴스", re.I),
        "우리 주제 아님",
        "뉴스 영상이다.",
        "",
    ),
    (
        re.compile(r"5-camera|smartphone|스마트폰", re.I),
        "우리 주제 아님",
        "카메라 다섯 개 스마트폰 소개다.",
        "",
    ),
    (
        re.compile(r"xchat", re.I),
        "우리 주제 아님",
        "메신저 설치 안내다.",
        "",
    ),
    (
        re.compile(r"클로드|gpt|그록", re.I),
        "모델 비교",
        "세 모델을 나란히 비교한 대박 영상은 아직 없다. 가까운 편은 클로드로 웹·앱 만들기다.",
        "누가 1등인지 표를 만들지 않는다. 같은 일을 세 모델에 시켜 보고 걸린 시간과 결과만 보여 준다.",
    ),
]


_EVIDENCE_SENT = re.compile(
    r"\d+(?:\.\d+)?\s*배|시드|아웃라이어|중앙값|쿼터|조사에|평소보다"
)


def ko_label(text: str, limit: int = 18) -> str:
    """영어·중국어 조각·해시태그를 짧은 한국어 주제로 옮긴다."""
    raw = re.sub(r"#\S+", " ", text or "")
    raw = re.sub(r"\s+", " ", raw).strip()
    for pat, ko in _LABELS:
        if pat.search(raw) or pat.search(text or ""):
            return clip(ko, limit)
    if re.search(r"[가-힣]", raw):
        return clip(raw, limit)
    return clip(raw, limit) if raw else "주제"


def ko_seeds(queries: list[str]) -> str:
    seen: list[str] = []
    for q in queries:
        lab = ko_label(q, 16)
        if lab not in seen:
            seen.append(lab)
    return " · ".join(seen) if seen else "검색어"


def lookup_brief(*texts: str) -> tuple[str, str, str] | None:
    blob = " ".join(t for t in texts if t)
    if not blob:
        return None
    for pat, family, covers, make in _BRIEFS:
        if pat.search(blob):
            return family, covers, make
    return None


def _drop_evidence(text: str) -> str:
    parts = [p.strip() for p in re.split(r"(?<=다)\.\s+|(?<=요)\.\s+", text.strip()) if p.strip()]
    keep: list[str] = []
    for p in parts:
        p = p.rstrip(".")
        if not p:
            continue
        if _EVIDENCE_SENT.search(p):
            continue
        keep.append(p + ".")
    return " ".join(keep)


def split_why(why: str) -> tuple[str, str]:
    """md 한 줄에서 근거 문장을 빼고, 시장 내용 / 우리 실험으로 가른다."""
    if not why:
        return "", ""
    m = re.search(r"(우리는\s+.+)$", why.strip())
    if m:
        covers = _drop_evidence(why[: m.start()])
        make = m.group(1).rstrip(".") + "."
        return covers, make
    cleaned = _drop_evidence(why)
    if not cleaned:
        return "", ""
    if re.search(r"만들지|실험|시켜|보여", cleaned):
        return "", cleaned
    return cleaned, ""


def flag_status(flag: str) -> str:
    if "걸러" in (flag or ""):
        return "skip"
    if "예" in (flag or ""):
        return "used"
    return "keep"


def topic_brief(
    phrase: str,
    why: str = "",
    title: str = "",
    flag: str = "",
    picked: bool = False,
) -> dict:
    """화면 한 줄에 쓸 콘텐츠 브리프."""
    hit = lookup_brief(phrase, why, title)
    family = hit[0] if hit else "후보"
    covers = hit[1] if hit else ""
    make = hit[2] if hit else ""
    w_covers, w_make = split_why(why)
    if w_covers:
        covers = w_covers
    if w_make:
        make = w_make
    covers = re.sub(r"^시장 영상은\s+", "", covers or "")
    if not covers:
        lab = ko_label(title or phrase, 22)
        covers = f"시장 영상은 '{lab}' 를 다룬다."
    status = "pick" if picked else flag_status(flag)
    if status == "skip":
        make = ""
        if family == "후보":
            family = "우리 주제 아님"
    elif status == "used" and not make:
        make = "이미 만든 편이다. 같은 주제를 다시 찍지 않는다."
    elif status in ("keep", "pick") and not make:
        make = "제목은 베끼지 않는다. 우리가 직접 실험한 숫자만 보여 준다."
    return {
        "phrase": phrase,
        "label": ko_label(phrase, 22),
        "family": family,
        "covers": covers,
        "make": make,
        "status": status,
    }


def font_face(out_path: str) -> str:
    here = os.path.dirname(os.path.abspath(out_path))
    candidates = [
        os.path.join(here, "fonts", "PretendardVariable.woff2"),
        os.path.join(here, "..", "assets", "fonts", "Pretendard-Bold.ttf"),
        os.path.join(here, "..", "..", "assets", "fonts", "Pretendard-Bold.ttf"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            rel = os.path.relpath(path, here).replace(os.sep, "/")
            fmt = "woff2-variations" if rel.endswith(".woff2") else "truetype"
            return (
                "@font-face{\n"
                '  font-family:"Pretendard Variable";\n'
                f'  src:url("{rel}") format("{fmt}");\n'
                "  font-weight:45 920; font-style:normal; font-display:swap;\n"
                "}\n"
            )
    return ""


def marker_defs(ids: list[str], color: str = ACCENT) -> str:
    bits = []
    for mid in ids:
        bits.append(
            f'<marker id="{mid}" viewBox="0 0 10 10" refX="9" refY="5" '
            f'markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{color}"/></marker>'
        )
    return "<defs>" + "".join(bits) + "</defs>"


def figure(svg: str, caption: str, note: str = "") -> str:
    extra = f"<span>{esc(note)}</span>" if note else ""
    return (
        f'<figure>\n<div class="fig-box">\n{svg}\n'
        f"<figcaption>{esc(caption)}{extra}</figcaption>\n"
        f"</div>\n</figure>"
    )


def funnel_svg(queries: list[str], scanned: dict, n_out: int) -> str:
    seeds = ko_seeds(queries)
    ch = int(scanned.get("channels") or 0)
    vid = int(scanned.get("videos") or 0)
    return f"""<svg viewBox="0 0 700 248" role="img" aria-label="검색어에서 잘 된 영상까지">
{marker_defs(["ar"])}
<rect x="10" y="10" width="680" height="40" rx="3" fill="{NEUTRAL}" stroke="{NEUTRAL_BD}" stroke-width="1"/>
<text x="350" y="36" text-anchor="middle" font-size="13.5" font-weight="800" fill="{NAVY}">{esc(clip(seeds, 42))}</text>
<line x1="350" y1="50" x2="350" y2="66" stroke="{ACCENT}" stroke-width="1.8" marker-end="url(#ar)"/>
<rect x="90" y="70" width="520" height="36" rx="3" fill="#fff" stroke="{ACCENT}" stroke-width="1.2"/>
<text x="350" y="94" text-anchor="middle" font-size="13.5" font-weight="800" fill="{ACCENT}">비슷한 채널 {ch}곳 · 최근 영상 {vid}편</text>
<line x1="350" y1="106" x2="350" y2="122" stroke="{ACCENT}" stroke-width="1.8" marker-end="url(#ar)"/>
<rect x="160" y="126" width="380" height="36" rx="3" fill="{EMPH}" stroke="{ACCENT}" stroke-width="1.6"/>
<text x="350" y="150" text-anchor="middle" font-size="13.5" font-weight="800" fill="{NAVY}">그 채널 평소보다 조회 5배 넘는 편만</text>
<line x1="350" y1="162" x2="350" y2="178" stroke="{ACCENT}" stroke-width="1.8" marker-end="url(#ar)"/>
<rect x="210" y="182" width="280" height="44" rx="3" fill="{NAVY}"/>
<text x="350" y="210" text-anchor="middle" font-size="15" font-weight="800" fill="#fff">잘 된 영상 {n_out}편</text>
</svg>"""


def families_html(briefs: list[dict]) -> str:
    """키워드를 콘텐츠 묶음으로 한 줄씩 보여 준다. 근거 차트가 아니다."""
    order = ["부업 실험", "도구 실험", "모델 비교"]
    buckets: dict[str, list[dict]] = {k: [] for k in order}
    for b in briefs:
        if b["status"] == "skip":
            continue
        fam = b["family"] if b["family"] in buckets else "도구 실험"
        if not any(x["label"] == b["label"] for x in buckets[fam]):
            buckets[fam].append(b)
    cols = []
    for fam in order:
        items = buckets[fam]
        if items:
            chips = []
            for b in items:
                cls = f"chip {b['status']}"
                chips.append(f'<span class="{cls}">{esc(clip(b["label"], 14))}</span>')
            body = "".join(chips)
        else:
            body = '<span class="chip empty">이번 조사에 없음</span>'
        cols.append(
            f'<div class="fam">'
            f'<span class="fh">{esc(fam)}</span>'
            f'{body}</div>'
        )
    return (
        '<div class="famstrip">' + "".join(cols)
        + '<p class="small" style="margin:6px 0 0">푸른 칸 = 이번에 만들 편 · 회색 = 이미 만든 편</p>'
        + "</div>"
    )


_STOP = {
    "ai", "the", "and", "for", "with", "you", "should", "know",
    "최신", "비교", "gpt", "claude", "grok", "openai", "chatgpt",
    "gemini", "클로드", "그록",
}


def match_outlier(phrase: str, why: str, outliers: list[dict], keywords: list[dict]) -> dict:
    """고른 구를 근거 영상에 붙인다. 배수 → 키워드 → 제목 토큰 순."""
    m = re.search(r"(?:미국|중국|한국)\s+(\d+(?:\.\d+)?)\s*배", why or "")
    if m and "없다" not in (why or "")[max(0, m.start() - 8) : m.end() + 12]:
        target = float(m.group(1))
        for o in outliers:
            if abs(num(o.get("multiplier")) - target) < 0.05:
                return o
    pl = (phrase or "").lower()
    if not pl:
        return {}
    plab = ko_label(phrase, 30)
    for kw in keywords:
        kp = (kw.get("phrase") or "").lower()
        if kp and (kp in pl or pl in kp or ko_label(kp, 30) == plab):
            vid = ((kw.get("evidence") or [{}])[0]).get("videoId")
            for o in outliers:
                if vid and o.get("videoId") == vid:
                    return o
    for o in outliers:
        if ko_label(o.get("title") or "", 30) == plab:
            return o
    tokens = [
        t for t in re.findall(r"[가-힣a-z0-9]{2,}", pl)
        if t not in _STOP
    ]
    best, best_n = {}, 0
    for o in outliers:
        title = (o.get("title") or "").lower()
        n = sum(1 for tok in tokens if tok in title)
        if n > best_n:
            best, best_n = o, n
    return best if best_n >= 2 else {}


def collect_briefs(
    chosen: list[tuple[str, str]],
    keywords: list[dict],
    flags: dict[str, str],
    outliers: list[dict],
) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []

    def add(phrase: str, why: str = "", flag: str = "", picked: bool = False) -> None:
        key = ko_label(phrase, 30)
        if not phrase or key in seen:
            return
        ev = match_outlier(phrase, why, outliers, keywords)
        title = ev.get("title") or ""
        if not title:
            for kw in keywords:
                if (kw.get("phrase") or "") == phrase:
                    title = ((kw.get("evidence") or [{}])[0]).get("title") or ""
                    break
        brief = topic_brief(phrase, why, title, flag, picked)
        seen.add(key)
        out.append(brief)

    for phrase, why in chosen:
        add(phrase, why, picked=True)
    ranked = sorted(
        keywords,
        key=lambda kw: (
            2 if "걸러" in flags.get(kw.get("phrase") or "", "") else
            1 if "예" in flags.get(kw.get("phrase") or "", "") else 0,
            -num(kw.get("bestMultiplier")),
        ),
    )
    for kw in ranked:
        ph = kw.get("phrase") or ""
        add(ph, "", flags.get(ph, ""), picked=False)
    return out


def chosen_briefs_html(briefs: list[dict]) -> str:
    picked = [b for b in briefs if b["status"] == "pick"]
    if not picked:
        return (
            '<div class="brief">'
            '<div class="bh">아직 만들 편을 고르지 않았다</div>'
            '<div class="bg"><div class="bc" style="grid-column:1/-1">'
            "아래 키워드에서 만들 편을 고르면 이 칸이 채워진다."
            "</div></div></div>"
        )
    bits = []
    for i, b in enumerate(picked, 1):
        bits.append(
            f'<div class="brief">'
            f'<div class="bh">{i}. {esc(b["label"])}'
            f'<span class="fam">{esc(b["family"])}</span></div>'
            f'<div class="bg">'
            f'<div class="bc"><div class="bl">시장 영상은</div>{esc(b["covers"])}</div>'
            f'<div class="bc make"><div class="bl">우리는 이렇게</div>{esc(b["make"])}</div>'
            f"</div></div>"
        )
    return "".join(bits)


def keyword_rows_html(briefs: list[dict]) -> str:
    rows = [b for b in briefs if b["status"] == "keep"]
    used = [b for b in briefs if b["status"] == "used"]
    skipped = [b for b in briefs if b["status"] == "skip"]
    if not rows:
        return '<p class="small">후보 키워드가 없다.</p>'
    bits = []
    for b in rows:
        tag = "만들 편" if b["status"] == "pick" else "후보"
        bits.append(
            f'<div class="kwcard {esc(b["status"])}">'
            f'<div class="kn">{esc(b["label"])}<span class="tag">{esc(tag)}</span></div>'
            f'<div class="bl">시장 영상은</div><div>{esc(b["covers"])}</div>'
            f'<div class="bl">우리는 이렇게</div><div class="wm">{esc(b["make"])}</div>'
            "</div>"
        )
    notes = []
    if used:
        notes.append("이미 만든 편 " + " · ".join(b["label"] for b in used))
    if skipped:
        notes.append("빼 둔 것 " + " · ".join(b["label"] for b in skipped))
    note_html = f'<p class="small">{esc(" · ".join(notes))}</p>' if notes else ""
    return f'<div class="kwgrid">{"".join(bits)}</div>{note_html}'


def key_html(title: str, body: str) -> str:
    return f'<div class="key"><div class="kt">{esc(title)}</div>{body}</div>'


def interpret_pick(briefs: list[dict]) -> tuple[str, str]:
    picked = [b for b in briefs if b["status"] == "pick"]
    if not picked:
        n = sum(1 for b in briefs if b["status"] == "keep")
        return (
            "아직 만들 편을 고르지 않았다",
            f"후보 키워드 {n}개가 있다. 고르면 이 칸에 우리가 만들 편이 채워진다.",
        )
    names = " · ".join(b["label"] for b in picked)
    return (
        "이번에 만들 편",
        f"고른 키워드는 <b>{esc(names)}</b> 이다. "
        "시장 영상 제목은 베끼지 않고 우리가 직접 실험한 숫자만 보여 준다.",
    )


def interpret_funnel(scanned: dict, n_out: int, min_m: float) -> tuple[str, str]:
    n_vid = int(scanned.get("videos") or 0)
    n_ch = int(scanned.get("channels") or 0)
    if n_vid <= 0:
        return "이번 조사", "본 영상이 없다."
    return (
        "조회가 크다고 고르지 않았다",
        f"비슷한 채널 {n_ch}곳, 최근 영상 {n_vid}편을 보고 "
        f"그 채널 평소보다 {min_m:g}배 잘 된 {n_out}편만 주제로 올렸다. "
        "큰 채널의 평범한 날을 주제로 쓰지 않기 위해서다.",
    )


def links_html(outliers: list[dict]) -> str:
    parts = []
    for o in outliers[:5]:
        href = o.get("permalink") or (
            f"https://www.youtube.com/watch?v={o['videoId']}" if o.get("videoId") else ""
        )
        if not href:
            continue
        parts.append(f'<a href="{esc(href)}">{esc(clip(ko_label(o.get("title") or "영상", 14), 18))}</a>')
    return " · ".join(parts) if parts else "—"


def render(data: dict, md: str, name: str, out_path: str) -> str:
    queries = data.get("queries") or []
    method = data.get("method") or {}
    scanned = data.get("scanned") or {}
    outliers = data.get("outliers") or []
    keywords = data.get("keywords") or []
    chosen = parse_chosen(md)
    flags = parse_flags(md)
    briefs = collect_briefs(chosen, keywords, flags, outliers)
    slug = data.get("channel") or ""
    generated = data.get("generated") or ""
    if not generated:
        generated = os.path.basename(out_path)
    days = int(method.get("publishedAfterDays") or 90)
    duration = method.get("duration") or "short"
    dur_l = "짧은 영상(4분 미만)" if duration == "short" else "길이 무관"
    market_names = {"US": "미국", "CN": "중국", "KR": "한국", "JP": "일본", "GB": "영국", "TW": "대만"}
    raw_markets = data.get("markets") or []
    if raw_markets:
        market_l = " · ".join(
            market_names.get(m.get("regionCode"), m.get("regionCode") or "")
            for m in raw_markets
            if m.get("regionCode")
        )
    else:
        code = str(method.get("regionCode") or "US")
        market_l = " · ".join(market_names.get(p, p) for p in code.split("+") if p)
    if not market_l:
        market_l = "미국"
    min_m = num(method.get("minMultiplier"), 5)
    min_v = int(method.get("minViews") or 1000)
    n_out = int(scanned.get("outliers") or len(outliers))
    n_pick = sum(1 for b in briefs if b["status"] == "pick")
    css = open(CSS_PATH, encoding="utf-8").read()
    face = font_face(out_path)
    display = name or slug
    title = f"{display} 지금 만들면 좋은 주제"
    k_pick = interpret_pick(briefs)
    k_funnel = interpret_funnel(scanned, n_out, min_m)

    page1 = f"""<section class="page" data-pg="1">
  <h2>{esc(display)} · 이번에 만들 콘텐츠</h2>
  <p class="lead">최근 {days}일 {esc(market_l)} 에서 우리랑 비슷한 채널이
  잘 된 주제를 찾아, <b>그 키워드가 실제로 무엇을 다루는지</b>와
  <b>우리는 어떤 편을 만들지</b>만 적었습니다. 제목과 화면은 베끼지 않습니다.</p>
  <div class="stats">
    <div class="stat"><div class="v">{n_pick}<small> 개</small></div><div class="l">이번에 만들 편</div></div>
    <div class="stat"><div class="v">{sum(1 for b in briefs if b["status"]=="keep")}<small> 개</small></div><div class="l">다음 후보</div></div>
    <div class="stat"><div class="v">{sum(1 for b in briefs if b["status"]=="used")}<small> 개</small></div><div class="l">이미 만든 편</div></div>
    <div class="stat"><div class="v">{n_out}<small> 편</small></div><div class="l">시장에서 잘 된 편</div></div>
  </div>
  {key_html(*k_pick)}
  {chosen_briefs_html(briefs)}
  <div class="nextbar">
    <div class="nl">다음에 할 일</div>
    <div>고른 주제로 스토리보드를 쓰거나, 한 편을 끝까지 만든다. 성장 계획에 넣으려면 그 계획을 따로 승인한 뒤에만 넣는다.</div>
  </div>
</section>"""

    page2_lead = (
        "위에 고른 편 말고 같은 조사에서 나온 다음 후보입니다. "
        "시장이 이미 찍은 내용과 우리가 찍으면 좋은 실험을 나란히 적었습니다."
        if n_pick else
        "잘 된 영상에서 뽑은 키워드입니다. "
        "시장이 이미 찍은 내용과 우리가 찍으면 좋은 실험을 나란히 적었습니다."
    )
    page2 = f"""<section class="page" data-pg="2">
  <p class="runhead">{esc(display)} · 키워드가 다루는 콘텐츠</p>
  <h3>1. 이 키워드로 어떤 영상을 만들까</h3>
  <p class="lead">{esc(page2_lead)}</p>
  {families_html(briefs)}
  {keyword_rows_html(briefs)}
</section>"""

    page3 = f"""<section class="page" data-pg="3">
  <p class="runhead">{esc(display)} · 어떻게 골랐나</p>
  <h3>2. 고른 근거</h3>
  <p class="lead">조회수가 크다고 고르지 않았습니다. 그 채널이 늘 올리던 영상보다
  조회가 {min_m:g}배 넘게 나온 편만 주제로 올렸습니다.</p>
  {figure(funnel_svg(queries, scanned, n_out), "[그림 2] 어떻게 좁혔나", "비슷한 채널을 모은 뒤, 평소보다 훨씬 잘 된 편만 고른다")}
  {key_html(*k_funnel)}
  <p class="small">숫자 원본: market-keywords.md · market-keywords.json · 참고 영상 {links_html(outliers)} · 조회 {comma(min_v)} 미만은 빼 둠</p>
</section>"""

    return f"""<meta charset="utf-8">
<title>{esc(title)} ({esc(generated)})</title>
<style>
{face}{css}
</style>
<div class="toolbar">
  <strong>{esc(title)}</strong>
  <span class="small" style="color:#bbb">{esc(generated)} · {esc(market_l)} · 최근 {days}일 {esc(dur_l)} · 평소보다 {min_m:g}배</span>
  <span class="spacer"></span>
  <button onclick="window.print()">인쇄 / PDF 저장</button>
</div>
{page1}
{page2}
{page3}
"""


def main() -> int:
    ap = argparse.ArgumentParser(description="시장 키워드 HTML 보고서를 뽑는다")
    ap.add_argument("--json", required=True, help="youtube_topic_scout 응답을 저장한 json")
    ap.add_argument("--md", help="고른 주제·걸러 표시가 있는 md (없으면 json 옆)")
    ap.add_argument("--out", help="쓸 HTML 경로 (기본 json 옆 market-keywords.html)")
    ap.add_argument("--name", help="채널 표시명")
    args = ap.parse_args()

    json_path = os.path.abspath(args.json)
    if not os.path.isfile(json_path):
        print(f"json 없음: {json_path}", file=sys.stderr)
        return 1
    if not os.path.isfile(CSS_PATH):
        print(f"report.css 없음: {CSS_PATH}", file=sys.stderr)
        return 1

    data = json.loads(open(json_path, encoding="utf-8").read())
    md_path = os.path.abspath(args.md) if args.md else os.path.join(os.path.dirname(json_path), "market-keywords.md")
    md = open(md_path, encoding="utf-8").read() if os.path.isfile(md_path) else ""
    out_path = os.path.abspath(args.out) if args.out else os.path.join(os.path.dirname(json_path), "market-keywords.html")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    generated = data.get("generated") or ""
    if not generated and md:
        m = re.search(r"^generated:\s*(\S+)", md, re.M)
        if m:
            generated = m.group(1)
            data["generated"] = generated

    html_out = render(data, md, args.name or "", out_path)
    open(out_path, "w", encoding="utf-8").write(html_out)

    if generated:
        dated = os.path.join(os.path.dirname(out_path), f"market-keywords-{generated.replace('-', '')}.html")
        shutil.copyfile(out_path, dated)

    print(out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
