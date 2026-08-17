#!/usr/bin/env python3
"""채널 assets/catalog.md 에서 kind+id 를 파일 경로로 바꾼다.

사용:
  resolve-asset.py <채널dir> <kind> [id]
  resolve-asset.py --list <채널dir>
  resolve-asset.py --ensure <채널dir> <kind> <id> <path> [note]
  resolve-asset.py --selftest

탐색 순서: catalog 표 → 잘 알려진 기본 경로 → 옛 경로(assets/outro.mp4).
없으면 exit 1. path 는 assets/ 기준 상대이고, 출력은 존재하는 절대(또는
정규화한 상대) 경로 한 줄이다.
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

HEADER = """# assets catalog

두 편 이상에서 다시 쓰는 채널 공용물만 적는다.
한 편용 생성물(회차 BGM·씬 PNG·TTS)은 주제 디렉토리의 `.work/` 에 둔다.

produce·storyboard 는 `skills/channel/references/resolve-asset.py` 로
kind+id 를 경로로 바꾼다. path 는 `assets/` 기준 상대 경로다.

"""


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(code)


def assets_dir(channel_dir: Path) -> Path:
    return channel_dir / "assets"


def catalog_path(channel_dir: Path) -> Path:
    return assets_dir(channel_dir) / "catalog.md"


def parse_catalog(text: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for line in text.splitlines():
        s = line.strip()
        if not s.startswith("|"):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if len(cells) < 3:
            continue
        kind, ident, path = cells[0], cells[1], cells[2]
        if kind in {"kind", "---"} or set(kind) <= {"-"}:
            continue
        if not kind or not ident or not path:
            continue
        rows.append({
            "kind": kind,
            "id": ident,
            "path": path,
            "note": cells[3] if len(cells) > 3 else "",
        })
    return rows


def load_catalog(channel_dir: Path) -> list[dict[str, str]]:
    p = catalog_path(channel_dir)
    if not p.is_file():
        return []
    return parse_catalog(p.read_text(encoding="utf-8", errors="replace"))


def well_known(channel_dir: Path, kind: str, ident: str) -> list[Path]:
    """존재하지 않아도 후보를 돌려준다 — 호출 쪽이 exists 를 본다."""
    assets = assets_dir(channel_dir)
    slug = channel_dir.name
    kind, ident = kind.lower(), ident.lower()
    out: list[Path] = []

    def add(p: Path) -> None:
        if p not in out:
            out.append(p)

    if kind == "logo" and ident in {"master", "default"}:
        add(assets / "branding" / f"{slug}-logo-master-1024.png")
    elif kind == "intro":
        names = {
            "master": f"{slug}-intro-master.mp4",
            "stinger": f"{slug}-intro-stinger.mp4",
            "lockup": f"{slug}-intro-lockup.png",
            "sonic": f"{slug}-sonic-logo.wav",
            "default": f"{slug}-intro-master.mp4",
        }
        if ident in names:
            add(assets / "intro" / names[ident])
    elif kind == "outro":
        add(assets / "outro" / f"{ident}.mp4")
        if ident != "default":
            add(assets / "outro" / "default.mp4")
        add(assets / "outro.mp4")  # 옛 경로
    elif kind == "bgm":
        add(assets / "audio" / "bgm" / f"{ident}.wav")
        if ident != "default":
            add(assets / "audio" / "bgm" / "default.wav")
    elif kind == "sfx":
        add(assets / "audio" / "sfx" / f"{ident}.wav")
        add(assets / "audio" / "sfx" / f"{ident}.mp4")
    elif kind == "character":
        add(assets / "characters" / ident)
    elif kind == "still":
        add(assets / "stills" / ident)
    elif kind == "font" and ident in {"dir", "default"}:
        add(assets / "fonts")
    return out


def catalog_hit(channel_dir: Path, kind: str, ident: str) -> Path | None:
    assets = assets_dir(channel_dir)
    for row in load_catalog(channel_dir):
        if row["kind"].lower() == kind.lower() and row["id"].lower() == ident.lower():
            return (assets / row["path"]).resolve()
    return None


def resolve(channel_dir: Path, kind: str, ident: str = "default") -> Path:
    hit = catalog_hit(channel_dir, kind, ident)
    if hit is not None and hit.exists():
        return hit
    # catalog 행은 있는데 파일이 없으면 기본 경로로 내려간다
    for cand in well_known(channel_dir, kind, ident):
        if cand.exists():
            return cand.resolve()
    if hit is not None:
        die(f"catalog 경로는 있으나 파일이 없다: {hit}")
    die(f"자산 없음: kind={kind} id={ident} (채널 {channel_dir})")
    raise AssertionError


def list_assets(channel_dir: Path) -> None:
    rows = load_catalog(channel_dir)
    if not rows:
        print("(catalog 비어 있음 — 기본 경로만 탐색)")
        return
    assets = assets_dir(channel_dir)
    for row in rows:
        p = assets / row["path"]
        flag = "ok" if p.exists() else "missing"
        note = f"  {row['note']}" if row["note"] else ""
        print(f"{row['kind']}\t{row['id']}\t{flag}\t{p}{note}")


def ensure_row(channel_dir: Path, kind: str, ident: str, rel: str, note: str = "") -> None:
    assets = assets_dir(channel_dir)
    assets.mkdir(parents=True, exist_ok=True)
    cat = catalog_path(channel_dir)
    if not cat.is_file():
        cat.write_text(HEADER, encoding="utf-8")
    text = cat.read_text(encoding="utf-8", errors="replace")
    rows = parse_catalog(text)
    replaced = False
    new_rows: list[dict[str, str]] = []
    for row in rows:
        if row["kind"].lower() == kind.lower() and row["id"].lower() == ident.lower():
            new_rows.append({"kind": kind, "id": ident, "path": rel, "note": note})
            replaced = True
        else:
            new_rows.append(row)
    if not replaced:
        new_rows.append({"kind": kind, "id": ident, "path": rel, "note": note})

    # 표만 갈아끼운다 — 머리글은 보존
    lines = text.splitlines()
    kept: list[str] = []
    in_table = False
    table_seen = False
    for line in lines:
        s = line.strip()
        if s.startswith("|"):
            in_table = True
            table_seen = True
            continue
        if in_table and not s.startswith("|"):
            in_table = False
            # 표를 지나온 뒤의 본문은 버린다 — catalog 는 표가 본체
            continue
        if not in_table and not table_seen:
            kept.append(line)
    body = "\n".join(kept).rstrip()
    if not body:
        body = HEADER.rstrip()
    table = ["| kind | id | path | note |", "|---|---|---|---|"]
    for row in new_rows:
        table.append(f"| {row['kind']} | {row['id']} | {row['path']} | {row['note']} |")
    cat.write_text(body.rstrip() + "\n\n" + "\n".join(table) + "\n", encoding="utf-8")


def selftest() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        ch = Path(tmp) / "demo"
        assets = ch / "assets"
        (assets / "outro").mkdir(parents=True)
        (assets / "outro" / "default.mp4").write_bytes(b"x")
        (assets / "audio" / "bgm").mkdir(parents=True)
        (assets / "audio" / "bgm" / "default.wav").write_bytes(b"y")
        ensure_row(ch, "outro", "default", "outro/default.mp4", "본편 뒤")
        ensure_row(ch, "bgm", "default", "audio/bgm/default.wav", "")
        got = resolve(ch, "outro", "default")
        assert got.name == "default.mp4", got
        got = resolve(ch, "bgm", "default")
        assert got.name == "default.wav", got
        # catalog 없이 옛 경로
        ch2 = Path(tmp) / "legacy"
        (ch2 / "assets").mkdir(parents=True)
        (ch2 / "assets" / "outro.mp4").write_bytes(b"z")
        got = resolve(ch2, "outro", "default")
        assert got.name == "outro.mp4", got
        # 없는 자산
        try:
            resolve(ch, "sfx", "whoosh")
        except SystemExit as e:
            assert e.code == 1
        else:
            raise AssertionError("없는 sfx 가 통과했다")
        # ensure 갱신
        ensure_row(ch, "outro", "default", "outro/default.mp4", "갱신")
        rows = load_catalog(ch)
        outros = [r for r in rows if r["kind"] == "outro"]
        assert len(outros) == 1, outros
        assert outros[0]["note"] == "갱신"
    print("selftest ok")


def main(argv: list[str]) -> None:
    if not argv or argv[0] in {"-h", "--help"}:
        print(__doc__.strip())
        raise SystemExit(0)
    if argv[0] == "--selftest":
        selftest()
        return
    if argv[0] == "--list":
        if len(argv) < 2:
            die("사용법: resolve-asset.py --list <채널dir>")
        list_assets(Path(argv[1]))
        return
    if argv[0] == "--ensure":
        if len(argv) < 5:
            die("사용법: resolve-asset.py --ensure <채널dir> <kind> <id> <path> [note]")
        note = argv[5] if len(argv) > 5 else ""
        ensure_row(Path(argv[1]), argv[2], argv[3], argv[4], note)
        return
    if len(argv) < 2:
        die("사용법: resolve-asset.py <채널dir> <kind> [id]")
    channel = Path(argv[0])
    kind = argv[1]
    ident = argv[2] if len(argv) > 2 else "default"
    print(resolve(channel, kind, ident))


if __name__ == "__main__":
    main(sys.argv[1:])
