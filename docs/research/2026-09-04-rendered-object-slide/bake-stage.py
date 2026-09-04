#!/usr/bin/env python3
"""스튜디오 무대 판 — 사이클로라마 한 칸을 작은 알파 PNG 로 굽는다.

  python3 bake-stage.py portrait   # 270x480 · 지평선 0.8125 (y1560, 자막 자리)
  python3 bake-stage.py wide       # 480x270 · 지평선 0.86  (y929, 자막 자리)

motion-slide-template.html 의 html.studio 바탕이 이 PNG 다. 정지 층(키 라이트·벽·바닥·
비네트)을 한 장에 다 넣는다 — CSS radial-gradient 를 따로 한 층 올리면 캡처가 4.6 → 2.9 fps
로 떨어졌다(2026-09-04 실측). 출력은 data URI 텍스트 파일과 미리보기 PNG 다.
"""
import base64, io, pathlib, sys
import numpy as np
from PIL import Image

fmt = sys.argv[1] if len(sys.argv) > 1 else "portrait"
if fmt == "portrait":
    W, H, HZ, VC = 270, 480, 0.8125, 0.38
elif fmt == "wide":
    W, H, HZ, VC = 480, 270, 0.86, 0.40
else:
    sys.exit("portrait | wide")

yy, xx = np.mgrid[0:H, 0:W]
u, v = xx / (W - 1), yy / (H - 1)

def ell(cx, cy, rx, ry, p=2.0):
    d = np.sqrt(((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2)
    return np.clip(1 - d, 0, 1) ** p
def band(c, half, soft):
    return np.clip(1 - np.clip((np.abs(v - c) - half) / soft, 0, 1), 0, 1)
def smooth(a, b):
    x = np.clip((v - a) / (b - a), 0, 1)
    return x * x * (3 - 2 * x)

light = np.zeros((H, W), np.float32)
dark = np.zeros((H, W), np.float32)
# 키 라이트 — 왼쪽 위 하나. 판의 모서리·그림자·물체의 램프가 전부 이 방향이다.
light += 0.175 * ell(0.16, 0.05, 0.95, 0.80, 1.9)
# 뒷벽 — 위에서 온 빛이 아래로 갈수록 약해진다
dark += 0.16 * smooth(0.04, HZ - 0.01) * (v < HZ)
# 벽과 바닥이 만나는 이음 — 한 줄이 아니라 폭이 있다(사이클로라마)
seam = band(HZ, 0.004, 0.030)
light += 0.115 * seam
dark -= 0.06 * seam
# 바닥에 떨어진 키 — 지평선 바로 앞이 가장 밝고 앞으로 오면서 죽는다
floor = (v >= HZ).astype(np.float32)
light += 0.095 * ell(0.42, HZ + 0.045, 0.78, 0.115, 1.7) * floor
light += 0.075 * ell(0.52, HZ + 0.020, 0.52, 0.048, 1.3) * floor
dark += 0.34 * smooth(HZ + 0.075, 0.98) * floor
# 조명의 좌우 낙하 — 카메라 비네트가 아니라 빛이 안 닿는 자리
dark += 0.155 * np.clip((np.abs(u - 0.5) / 0.5) ** 2.2, 0, 1)
# 비네트도 여기서 굽는다
rad = np.sqrt(((u - 0.5) / 0.62) ** 2 + ((v - VC) / 0.60) ** 2)
dark += 0.50 * np.clip((rad - 0.78) / 0.72, 0, 1) ** 1.6

light = np.clip(light, 0, 1); dark = np.clip(dark, 0, 1)
warm = np.array([255, 240, 219], np.float32)
cool = np.array([1, 4, 9], np.float32)
a = np.clip(light + dark * (1 - light), 1e-6, 1)
rgb = (warm * light[..., None] + cool * (dark * (1 - light))[..., None]) / a[..., None]
img = Image.fromarray(np.concatenate([np.clip(rgb, 0, 255), (a * 255)[..., None]], 2).astype(np.uint8), "RGBA")
buf = io.BytesIO(); img.save(buf, "PNG", optimize=True); b = buf.getvalue()
here = pathlib.Path(__file__).resolve().parent
(here / f"stage-{fmt}.uri").write_text("data:image/png;base64," + base64.b64encode(b).decode(), encoding="utf-8")
ink = Image.new("RGBA", (W, H), (0x13, 0x22, 0x38, 255))
Image.alpha_composite(ink, img).convert("RGB").resize((W * 4, H * 4), Image.LANCZOS).save(here / f"stage-{fmt}-preview.jpg", quality=88)
print(f"stage-{fmt}.uri", len(b), "bytes png")
