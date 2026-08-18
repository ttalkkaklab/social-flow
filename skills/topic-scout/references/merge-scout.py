#!/usr/bin/env python3
"""Merge the per-market youtube_topic_scout JSON files into one.

Videos and channels are deduped by id, quota is summed. For topic phrases, when
the phrase is the same only the higher-scoring one is kept.

Usage:
  merge-scout.py --out market-keywords.json us.json cn.json
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import OrderedDict


def load(path: str) -> dict:
    return json.loads(open(path, encoding="utf-8").read())


def merge(parts: list[dict]) -> dict:
    if not parts:
        raise ValueError("no json to merge")
    queries: list[str] = []
    seen_q: set[str] = set()
    markets: list[dict] = []
    quota = 0
    errors: list[str] = []
    outliers: "OrderedDict[str, dict]" = OrderedDict()
    channels: "OrderedDict[str, dict]" = OrderedDict()
    keywords: "OrderedDict[str, dict]" = OrderedDict()
    excluded = None
    channel = parts[0].get("channel")
    method = dict(parts[0].get("method") or {})

    for part in parts:
        region = (part.get("method") or {}).get("regionCode") or "US"
        language = (part.get("method") or {}).get("language") or "en"
        qs = list(part.get("queries") or [])
        markets.append(
            {
                "regionCode": region,
                "language": language,
                "queries": qs,
                "scanned": part.get("scanned") or {},
                "quotaUnits": int(part.get("quotaUnits") or 0),
            }
        )
        for q in qs:
            key = q.lower()
            if key in seen_q:
                continue
            seen_q.add(key)
            queries.append(q)
        quota += int(part.get("quotaUnits") or 0)
        errors.extend(part.get("errors") or [])
        if part.get("excludedOwnChannelId"):
            excluded = part.get("excludedOwnChannelId")
        for o in part.get("outliers") or []:
            vid = o.get("videoId")
            if not vid:
                continue
            prev = outliers.get(vid)
            if prev is None or float(o.get("multiplier") or 0) > float(prev.get("multiplier") or 0):
                tagged = dict(o)
                tagged.setdefault("market", region)
                outliers[vid] = tagged
        for c in part.get("channels") or []:
            cid = c.get("channelId")
            if not cid:
                continue
            prev = channels.get(cid)
            if prev is None:
                tagged = dict(c)
                tagged.setdefault("market", region)
                channels[cid] = tagged
            else:
                prev["outlierCount"] = int(prev.get("outlierCount") or 0) + int(c.get("outlierCount") or 0)
        for kw in part.get("keywords") or []:
            phrase = (kw.get("phrase") or "").strip()
            if not phrase:
                continue
            key = phrase.lower()
            prev = keywords.get(key)
            if prev is None or float(kw.get("score") or 0) > float(prev.get("score") or 0):
                keywords[key] = dict(kw)

    ranked_out = sorted(outliers.values(), key=lambda o: float(o.get("multiplier") or 0), reverse=True)
    ranked_kw = sorted(keywords.values(), key=lambda k: float(k.get("score") or 0), reverse=True)
    method["markets"] = [m["regionCode"] for m in markets]
    method["regionCode"] = "+".join(m["regionCode"] for m in markets)
    method["language"] = "+".join(m["language"] for m in markets)

    return {
        "channel": channel,
        "queries": queries,
        "method": method,
        "markets": markets,
        "scanned": {
            "channels": len(channels),
            "videos": sum(int((m.get("scanned") or {}).get("videos") or 0) for m in markets),
            "outliers": len(ranked_out),
        },
        "quotaUnits": quota,
        "keywords": ranked_kw[:30],
        "outliers": ranked_out[:40],
        "channels": list(channels.values()),
        "errors": errors or None,
        "excludedOwnChannelId": excluded,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Merge the per-market scout JSON files")
    ap.add_argument("--out", required=True)
    ap.add_argument("inputs", nargs="+")
    args = ap.parse_args()
    parts = [load(p) for p in args.inputs]
    merged = merge(parts)
    open(args.out, "w", encoding="utf-8").write(json.dumps(merged, ensure_ascii=False, indent=2) + "\n")
    print(args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
