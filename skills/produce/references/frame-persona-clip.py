#!/usr/bin/env python3
"""페르소나 발화 클립 프레이밍 통일 + 팔린드롬 루프.

veo 는 같은 프롬프트에도 인물 크기·위치가 회차마다 흔들린다. 클립을 그대로 쓰면 카드마다
얼굴 크기가 달라 보이므로, 피부톤 픽셀로 얼굴 중심과 머리 상단을 실측해 크롭을 역산한다
(얼굴 중심 x -> 540, 머리 상단 y -> TOP). 그다음 정방향+역방향을 이어 붙여(팔린드롬)
루프 경계에서 점프가 없는 2배 길이 클립을 만든다 — 카드가 클립보다 길어도 안전하다.

사용: frame-persona-clip.py <입력.mp4> <출력.mp4> [머리상단목표=430]
"""
import subprocess, sys, tempfile, os
from PIL import Image

SRC, DST = sys.argv[1], sys.argv[2]
TOP = int(sys.argv[3]) if len(sys.argv) > 3 else 430
CW, CH = 600, 1066          # 1080x1920 기준 1.8배 확대 — 흉상 프레이밍

with tempfile.TemporaryDirectory() as td:
    probe = os.path.join(td, "p.png")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "4", "-i", SRC,
                    "-frames:v", "1", probe], check=True)
    im = Image.open(probe).convert("RGB"); w, h = im.size; px = im.load()
    skin = [(x, y) for y in range(0, h, 2) for x in range(0, w, 2)
            if (lambda r, g, b: r > 150 and 100 < g < 215 and 70 < b < 190
                and r > g > b and (r - b) > 40)(*px[x, y])]
    if not skin:
        sys.exit(f"피부톤 픽셀을 못 찾음: {SRC} — 프롬프트/배경을 확인하세요")
    fx = sum(p[0] for p in skin) / len(skin)
    htop = min(p[1] for p in skin)

x0 = max(0, min(w - CW, round(fx - CW / 2)))
y0 = max(0, min(h - CH, round(htop - TOP * CW / 1080)))
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", SRC, "-filter_complex",
    f"[0:v]crop={CW}:{CH}:{x0}:{y0},scale=1080:1920:flags=lanczos,split[a][b];"
    f"[b]reverse[r];[a][r]concat=n=2:v=1:a=0,fps=30,format=yuv420p[v]",
    "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "18", DST], check=True)
print(f"{os.path.basename(SRC)}: 얼굴중심x={fx:.0f} 머리상단y={htop} → crop {CW}x{CH}+{x0}+{y0} → {DST}")
