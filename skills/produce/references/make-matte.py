#!/usr/bin/env python3
"""make-matte.py — a subject matte for a footage clip, so drawn marks can pass behind people.

usage: make-matte.py <clip.mp4> <out.webm> [--model isnet-general-use] [--feather 2] [--fps 30]
       make-matte.py --selftest          # proves the ffmpeg VP9-alpha path without rembg

What it makes: a VP9 webm with an alpha channel that holds ONLY the foreground subject
(people, horses, whatever the segmenter keeps) — everything else transparent. The slide
lays it above the marks with `h.matte(rg, "slides/footage/s<n>-g<k>-fg.webm")`
(motion-slide-template.html), and a hatch or route drawn under it reads as painted on
the ground behind the figures. The reference history short does exactly this for its
ground marks and leaves direction arrows on top (measured 2026-09-02).

How: frames out with ffmpeg → rembg per frame (`only_mask`) → the frame's own RGB with the
mask as alpha → VP9 webm (`-pix_fmt yuva420p`, the one alpha format the renderer's Chrome
decodes). Chrome reads VP9 alpha in webm; H.264 has no alpha, so the matte is never mp4.

Needs rembg: `uv tool install "rembg[cpu]"` (or `pip install "rembg[cpu]"`) — the first run
downloads the model (~170 MB) into ~/.u2net. `isnet-general-use` keeps animals and objects;
`u2net_human_seg` is tighter on people only. A 4-second 1080×1920 clip is ~120 frames and
takes a few minutes on CPU; run it once per shot that needs occlusion, not on every shot.

The matte is optional. A slide whose marks stay off the figures needs none, and a wrong
matte (a rider's leg cut off) is worse than an arrow drawn over the rider.
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"✗ {' '.join(cmd[:2])} failed:\n{r.stderr.strip()}")
    return r.stdout


def encode_alpha(frames_dir, fps, out):
    run(["ffmpeg", "-y", "-v", "error", "-framerate", str(fps), "-i", os.path.join(frames_dir, "f%05d.png"),
         "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "3M", "-row-mt", "1", out])


def selftest():
    from PIL import Image, ImageDraw
    tmp = tempfile.mkdtemp(prefix="matte-selftest-")
    fdir = os.path.join(tmp, "f"); os.makedirs(fdir)
    for i in range(12):
        im = Image.new("RGBA", (216, 384), (0, 0, 0, 0))
        ImageDraw.Draw(im).ellipse((40 + i * 8, 120, 120 + i * 8, 260), fill=(40, 44, 52, 255))
        im.save(os.path.join(fdir, f"f{i:05d}.png"))
    out = os.path.join(tmp, "fg.webm")
    encode_alpha(fdir, 12, out)
    info = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name:stream_tags=alpha_mode",
                "-of", "default=nw=1", out])
    ok = "codec_name=vp9" in info and "alpha_mode=1" in info
    shutil.rmtree(tmp, ignore_errors=True)
    print(("✓" if ok else "✗") + " selftest: VP9 alpha webm " + ("encoded with alpha_mode=1" if ok else "did not carry alpha — " + info.strip()))
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("clip", nargs="?")
    ap.add_argument("out", nargs="?")
    ap.add_argument("--model", default="isnet-general-use")
    ap.add_argument("--feather", type=int, default=2, help="mask blur radius in px — softens the cut edge")
    ap.add_argument("--fps", type=int, default=0, help="frame rate to sample (default: the clip's own)")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        sys.exit(selftest())
    if not a.clip or not a.out:
        ap.error("clip and out are required")
    if not a.out.endswith(".webm"):
        ap.error("the matte is a .webm (VP9 alpha) — H.264 mp4 has no alpha channel")
    try:
        from rembg import new_session, remove
        from PIL import Image, ImageFilter
    except ImportError:
        sys.exit("✗ rembg is not installed — uv tool install \"rembg[cpu]\"  (or pip install \"rembg[cpu]\"); "
                 "the first run downloads the model into ~/.u2net")
    fps = a.fps
    if not fps:
        r = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", a.clip]).strip()
        num, den = (r.split("/") + ["1"])[:2]
        fps = max(1, round(float(num) / float(den)))
    tmp = tempfile.mkdtemp(prefix="matte-")
    src = os.path.join(tmp, "src"); dst = os.path.join(tmp, "dst")
    os.makedirs(src); os.makedirs(dst)
    run(["ffmpeg", "-y", "-v", "error", "-i", a.clip, "-vf", f"fps={fps}", os.path.join(src, "f%05d.png")])
    frames = sorted(os.listdir(src))
    session = new_session(a.model)
    for i, f in enumerate(frames):
        im = Image.open(os.path.join(src, f)).convert("RGB")
        mask = remove(im, session=session, only_mask=True).convert("L")
        if a.feather > 0:
            mask = mask.filter(ImageFilter.GaussianBlur(a.feather))
        im.putalpha(mask)
        im.save(os.path.join(dst, f))
        if i % 24 == 0:
            print(f"  {i + 1}/{len(frames)} frames", file=sys.stderr)
    encode_alpha(dst, fps, a.out)
    shutil.rmtree(tmp, ignore_errors=True)
    print(f"✓ {a.out}  ({len(frames)} frames @ {fps} fps, model {a.model})")


if __name__ == "__main__":
    main()
