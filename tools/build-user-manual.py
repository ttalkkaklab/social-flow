# /// script
# requires-python = ">=3.9"
# dependencies = ["Markdown==3.8.2"]
# ///
"""Render the public Markdown guides as one offline HTML manual."""

import re
from html import escape
from pathlib import Path
from urllib.parse import quote, urlsplit

import markdown

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
CHAPTERS = (
    "README.md", "getting-started.md", "configuration.md", "making-an-episode.md",
    "publishing.md", "troubleshooting.md", "image-request-recovery.md", "stock-media.md", "mlx-ltx-2.5.md",
    "fasth3-omni.md", "tool-contracts.md", "pipeline-manifest.md",
    "design-system/DESIGN.md", "design-system/MOTION.md", "design-system/FONTS.md",
)
ANCHORS = {
    (DOCS / name): "manual" if name == "README.md" else Path(name).stem.lower()
    for name in CHAPTERS
}
REPOSITORY = "https://github.com/ttalkkaklab/social-flow"


def chapter_link(source, href):
    link = urlsplit(href)
    if link.scheme or link.netloc:
        return href
    target = (source.parent / link.path).resolve() if link.path else source
    if target in ANCHORS:
        suffix = f"-{link.fragment}" if link.fragment else ""
        return f"#{ANCHORS[target]}{suffix}"
    if not target.exists():
        raise ValueError(f"Missing link in {source.name}: {href}")
    kind = "tree" if target.is_dir() else "blob"
    fragment = f"#{link.fragment}" if link.fragment else ""
    return f"{REPOSITORY}/{kind}/main/{quote(target.relative_to(ROOT).as_posix())}{fragment}"


def render_chapter(source, anchor):
    title, body = source.read_text(encoding="utf-8").split("\n", 1)
    if not title.startswith("# "):
        raise ValueError(f"{source.name} needs a chapter title")
    title = escape(title[2:].strip())
    html = markdown.markdown(body, extensions=["tables", "fenced_code", "toc"])
    html = re.sub(r' id="([^"]+)"', lambda m: f' id="{anchor}-{m[1]}"', html)
    html = re.sub(r' href="([^"]+)"', lambda m: f' href="{chapter_link(source, m[1])}"', html)
    html = html.replace("<table>", '<div class="table-scroll"><table>').replace("</table>", "</table></div>")
    return title, f'<article id="{anchor}"><h1>{title}</h1>\n{html}\n</article>'


def main():
    navigation = []
    articles = []
    for path, anchor in ANCHORS.items():
        title, article = render_chapter(path, anchor)
        navigation.append(f'<li><a href="#{anchor}">{title}</a></li>')
        articles.append(article)
    links = "\n".join(navigation)
    content = "\n".join(articles)
    html = f'''<!doctype html>
<!-- Generated from docs/*.md by tools/build-user-manual.py. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Install social-flow, make your first episode and publish it to your channel.">
<title>social-flow user manual</title>
<link rel="stylesheet" href="assets/reference.css">
</head>
<body>
<a class="skip" href="#manual">Skip to the manual</a>
<header><a href="#manual">social-flow</a><a href="{REPOSITORY}">GitHub repository</a></header>
<div class="layout">
<nav aria-label="Chapters"><h2>Chapters</h2><ul>
{links}
</ul></nav>
<main>{content}</main>
</div>
</body>
</html>
'''
    (DOCS / "index.html").write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
