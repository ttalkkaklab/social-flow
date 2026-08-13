#!/usr/bin/env python3
"""후보 주제가 이 채널에 이미 있는 이야기인지 판정한다.

slug 이 다르면 사람 눈에는 새 주제로 보이지만 내용은 같을 수 있다("비자 수수료
인상" 과 "베트남 비자 수수료 오른다"). 자동 저작은 그 판단을 사람에게 맡길 수
없으므로 여기서 결정적으로 판정한다 — 글자 바이그램 자카드 유사도다.

비교 대상은 채널의 **모든 기존 주제**다. autoproduce 가 만든 것과 사람이 만든
것을 다 본다(같은 이야기를 두 번 올리는 것을 막는 게 목적이므로).
각 주제에서 뽑는 신원은 셋이다 — 디렉토리 slug · storyboard.md 제목 · scenes.js
커버 title. 셋 중 가장 높은 점수를 그 주제의 점수로 쓴다.

사용:
  check-duplicate.py --channel-dir data/<채널> --title "<후보 제목>"
                     [--message "<핵심 메시지>"] [--threshold 0.45] [--json]

종료 코드 — 그대로 읽는다:
  0  신규 (임계 미만)
  2  중복 의심 — 이 후보를 버리고 다음 후보로 간다
  1  판정 불가 (채널 디렉토리 없음 등). **신규로 읽지 않는다**
  3  입력 오류
"""
import argparse
import json
import os
import re
import sys

# 임계 0.5 — 픽스처로 보정한 값. 같은 이야기를 다르게 쓴 쌍(0.5~1.0)은 잡고
# 같은 채널의 다른 주제(0.0~0.25)는 통과시킨다. 바꾸려면 --selftest 픽스처부터
# 손댄다. **막는 쪽으로 치우쳐 있다** — 후보를 하나 건너뛰는 값은 싸고, 재탕이
# 공개로 나가는 값은 비싸다. 시리즈물처럼 접두어가 같은 제목은 이 임계에 걸리므로
# 그런 채널은 --threshold 를 올려 부르거나(플랜 duplicate_threshold) 사람이
# storyboard 로 만든다.
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
    """포함도(overlap coefficient) — 짧은 쪽이 긴 쪽에 얼마나 들어 있나.

    자카드를 쓰면 한쪽이 길다는 이유로 점수가 깎여 재탕을 놓친다
    ("베트남 비자 수수료 오른다" ↔ "비자 수수료 인상 시점" 이 0.29 로 통과).
    다만 포함도는 짧은 문자열에서 1.0 이 쉽게 나오므로, 바이그램이 4개 미만이면
    자카드로 되돌아간다."""
    ba, bb = bigrams(a), bigrams(b)
    if not ba or not bb:
        return 0.0
    inter = len(ba & bb)
    if min(len(ba), len(bb)) < 4:
        return inter / len(ba | bb)
    return inter / min(len(ba), len(bb))


def cover_title(scenes_path: str):
    """scenes.js 의 첫 title 값. 파서를 두지 않고 정규식으로 뽑는다 —
    JS 를 실행하지 않는 것이 이 스크립트의 계약이다."""
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


def collect(channel_dir: str):
    """[(slug, [신원 문자열들])] — 주제 디렉토리마다 하나."""
    out = []
    for name in sorted(os.listdir(channel_dir)):
        sb = os.path.join(channel_dir, name, 'storyboard')
        if not os.path.isdir(sb):
            continue
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
        # (후보, 기존, 중복이어야 하나, 메모)
        ("베트남 비자 수수료 오른다", "비자 수수료 인상 시점", True, "같은 사실을 다르게 씀"),
        ("임시거주 신고, 안 하면 과태료", "임시거주 신고 안 하면 과태료입니다", True, "어미만 다름"),
        ("비자 수수료 인상", "비자 수수료 인상", True, "완전 동일"),
        ("임시거주 신고 절차", "임시거주 신고, 안 하면 과태료", True, "같은 제도, 다른 각도"),
        ("환율 급등, 송금 언제", "2026년 환율 급등기 송금 타이밍", True, "연도·조사만 다름"),
        # 보수적 판정 — 시리즈물이라 사람 눈에는 다른 편이지만 접두어가 같아 막힌다.
        # 오판이 아닌 설계된 치우침이다(막는 쪽이 싸다).
        ("연말정산 의료비 공제", "연말정산 월세 공제", True, "시리즈 접두어 — 보수적으로 막음"),
        ("임시거주 신고 절차", "비자 수수료 인상 시점", False, "무관"),
        ("7월 환율 변동", "임시거주 신고, 안 하면 과태료", False, "무관"),
        ("주재원 건강보험 가입", "주재원 자녀 학교 등록", False, "타깃만 같음"),
        ("비자 수수료 인상", "비자 발급 절차 바뀜", False, "소재만 같음"),
        ("전기요금 누진제 개편", "도시가스 요금 인상", False, "분야만 같음"),
    ]
    bad = 0
    for cand, prior, dup, memo in cases:
        s = similarity(cand, prior)
        got = s >= DEFAULT_THRESHOLD
        if got != dup:
            bad += 1
        print(f"  {'ok ' if got == dup else 'FAIL'} {s:.3f} 중복={dup} · {memo}")
        print(f"        {cand!r} ↔ {prior!r}")
    print("selftest PASS" if not bad else f"selftest FAIL {bad}건")
    return 0 if not bad else 1


def main() -> int:
    p = argparse.ArgumentParser(description='주제 중복 판정 (글자 바이그램 자카드)')
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
        print('--channel-dir 와 --title 이 필요하다 (규칙 검증만 할 때는 --selftest)', file=sys.stderr)
        return 3
    if not os.path.isdir(a.channel_dir):
        print(f'채널 디렉토리 없음: {a.channel_dir} — 판정 불가', file=sys.stderr)
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
        print(f'중복 판정 — 후보 "{a.title}" · 기존 주제 {len(scored)}개 · 임계 {a.threshold}')
        for v, s in top:
            print(f'  {v:.3f}  {s}')
        print('판정 중복 — 이 후보를 버린다' if dup else '판정 신규')
    return 2 if dup else 0


if __name__ == '__main__':
    sys.exit(main())
