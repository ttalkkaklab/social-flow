#!/usr/bin/env python3
"""Unifies persona speech-clip framing + palindrome loop.

Even on the same prompt, veo wobbles the subject's size and position from run to run. Used as-is, the
face looks a different size on every card, so this measures the face center and the top of the head
from skin-tone pixels and works the crop back from them (face center x -> 540, head top y -> TOP).
Then it concatenates forward + reverse (a palindrome) into a double-length clip with no jump at the
loop boundary — safe even when the card is longer than the clip.

Usage: frame-persona-clip.py <input.mp4> <output.mp4> [head-top-target=430]
"""
import subprocess, sys, tempfile, os
from PIL import Image

SRC, DST = sys.argv[1], sys.argv[2]
TOP = int(sys.argv[3]) if len(sys.argv) > 3 else 430
CW, CH = 600, 1066          # 1.8× blowup against 1080x1920 — bust framing

with tempfile.TemporaryDirectory() as td:
    probe = os.path.join(td, "p.png")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "4", "-i", SRC,
                    "-frames:v", "1", probe], check=True)
    im = Image.open(probe).convert("RGB"); w, h = im.size; px = im.load()
    skin = [(x, y) for y in range(0, h, 2) for x in range(0, w, 2)
            if (lambda r, g, b: r > 150 and 100 < g < 215 and 70 < b < 190
                and r > g > b and (r - b) > 40)(*px[x, y])]
    if not skin:
        sys.exit(f"no skin-tone pixels found: {SRC} — check the prompt and the background")
    fx = sum(p[0] for p in skin) / len(skin)
    htop = min(p[1] for p in skin)

x0 = max(0, min(w - CW, round(fx - CW / 2)))
y0 = max(0, min(h - CH, round(htop - TOP * CW / 1080)))
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", SRC, "-filter_complex",
    f"[0:v]crop={CW}:{CH}:{x0}:{y0},scale=1080:1920:flags=lanczos,split[a][b];"
    f"[b]reverse[r];[a][r]concat=n=2:v=1:a=0,fps=30,format=yuv420p[v]",
    "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "18", DST], check=True)
print(f"{os.path.basename(SRC)}: face-center-x={fx:.0f} head-top-y={htop} → crop {CW}x{CH}+{x0}+{y0} → {DST}")
