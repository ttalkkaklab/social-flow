#!/usr/bin/env python3
"""reveal 전환 시각·길이를 나레이션의 '쉼'에 맞춰 산출한다.

왜 별도 계산인가
    고정 리드(REVEAL_LEAD)로 "문장 시작 N초 전"에 페이드를 시작하면 쉼 길이에 맞출 수 없다.
    실측(v4): 쉼이 0.55~0.83s 인데 리드가 0.8s 라 6개 전환 중 5개가 **앞 문장이 아직 발화 중일 때**
    페이드를 시작했고, 전부 문장 시작 0.45s 전에 끝나 죽은 시간이 남았다.

계약
    페이드는 문장 사이의 쉼 **안에서** 일어나고, 다음 문장이 시작되는 순간에는 이미 완료돼 있다.
      · 페이드 종료 = 문장 시작 - gap
      · 페이드 길이 = min(최대, 쉼 안에 들어가는 만큼)  · 하한 MIN_FADE
      · 페이드 시작 >= 쉼 시작 (앞 문장 침범 금지)
    쉼을 못 찾은 경우(자수 비례 폴백)만 고정 리드로 되돌아간다.

하위 reveal (한 문장이 불릿 여러 개를 담을 때)
    그 불릿은 발화되지 않으므로 '정답' 시각이 없다. 차선은 문장 안의 숨쉬기(미검출 쉼)에 얹는 것.
    창 안에 쓸 만한 쉼이 있으면 거기에 스냅하고, 없으면 균등 분할한다.

입출력
    stdin  없음. 무음 목록 파일은 --silences (silencedetect 결과: start end duration).
    stdout 전환마다 한 줄: offset<TAB>duration<TAB>근거   (카드 시간 기준, PRE 포함)
    stderr 동기화 리포트 (--report 지정 시)
"""
import argparse
import sys

MIN_FADE = 0.18   # 이보다 짧으면 페이드로 안 보이고 깜빡임이 된다
MIN_GAP = 0.15    # 전환 사이 최소 간격 (앞 페이드 종료 → 다음 페이드 시작)


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
    """쉼 안에 페이드를 넣는다 — 문장 시작 gap 초 전에 완료, 쉼 시작보다 앞서지 않게."""
    fade_end = sentence_start - gap
    dur = min(fade_max, max(MIN_FADE, fade_end - pause_start))
    start = max(pause_start, fade_end - dur)
    return start, min(dur, max(MIN_FADE, fade_end - start))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pre", type=float, required=True)       # 프리롤 (카드 시간 = 발화 시간 + pre)
    ap.add_argument("--speech", type=float, required=True)    # 발화 길이 L
    ap.add_argument("--dur", type=float, required=True)       # 카드 총 길이 D
    ap.add_argument("--fade", type=float, default=0.35)       # 페이드 최대 길이
    ap.add_argument("--gap", type=float, default=0.05)        # 문장 시작 전 완료 여유
    ap.add_argument("--lead", type=float, default=0.8)        # 폴백 리드 (쉼 정보가 없을 때만)
    ap.add_argument("--silences", default="")
    ap.add_argument("--bounds", default="")                   # 문장 시작 시각들 (= 채택된 무음의 종료)
    ap.add_argument("--subs", default="")                     # 세그별 하위 상태 수, 콤마 구분
    ap.add_argument("--fallback", action="store_true")        # 경계가 자수 비례 추정치임
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()

    bounds = [float(x) for x in a.bounds.split()] if a.bounds.strip() else []
    subs = [int(x) for x in a.subs.split(",")] if a.subs.strip() else [1]
    sil = load_silences(a.silences)

    # 문장 j 의 발화 시작 (발화 시간 기준). 문장 0 은 0.
    starts = [0.0] + bounds
    nseg = len(subs)
    if len(starts) < nseg:
        starts += [a.speech] * (nseg - len(starts))

    events = []   # (fade_start, dur, 근거, 기준시각 or None)

    for j in range(nseg):
        w0 = starts[j]
        w1 = starts[j + 1] if j + 1 < len(starts) else a.speech
        k = max(1, subs[j])

        # ① 세그먼트 경계 전환 (j>=1) — 문장 시작에 맞춘다
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
                events.append((st, du, "쉼정렬", sentence_start))
            else:
                events.append((sentence_start - a.lead, a.fade, "리드폴백", sentence_start))

        # ② 하위 reveal — 발화되지 않는 불릿. 창 안의 남은 쉼에 스냅, 없으면 균등 분할
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
                # 숨쉬기가 끝나 발화가 재개되는 시점(best[1]) 직전에 등장을 끝낸다
                st, du = fit_in_pause(best[0], best[1], a.fade, a.gap)
                events.append((st, du, "숨쉬기스냅", best[1]))
            else:
                events.append((target - a.fade / 2, a.fade, "균등분할", None))

    events.sort(key=lambda e: e[0])

    # 단조 증가 + 상한 강제 (카드 시간으로 옮기며)
    out = []
    prev_end = 0.05
    for st, du, why, ref in events:
        st += a.pre
        if st < prev_end + MIN_GAP:
            st = prev_end + MIN_GAP
            why += "+밀림"
        hi = a.dur - du - 0.05
        if st > hi:
            st = hi
            why += "+상한"
        out.append((st, du, why, ref))
        prev_end = st + du

    for st, du, why, ref in out:
        print(f"{st:.4f}\t{du:.4f}\t{why}")

    if a.report:
        for st, du, why, ref in out:
            if ref is None:
                print(f"      {st:6.2f}s +{du:.2f}s  {why}", file=sys.stderr)
            else:
                # 문장 시작 대비 페이드 완료 시점 (음수 = 문장 시작 후에도 등장 중)
                err = (ref + a.pre) - (st + du)
                print(f"      {st:6.2f}s +{du:.2f}s  {why}  문장시작 {err:+.2f}s 전 완료", file=sys.stderr)


if __name__ == "__main__":
    main()
