#!/usr/bin/env python3
"""bake-object.py — 슬라이드에 세울 물체를 SDF 레이마처로 굽는다 (rendered-object.md).

  python3 bake-object.py --shape disc --out slides/assets/s5-obj \
      --keys "-21,26,0 -17,22,0 -10,19,45 -4,16.5,241 -1,16,241" --frames "1:11 2:27 3:19 4:14"
  python3 bake-object.py --shape disc --preview -10 45        # 한 프레임만 미리 본다

물체는 벡터로 그리지 않고 광선을 쏴서 렌더한다. 점광원 하나(왼쪽 위 — 슬라이드의 스튜디오 판과
같은 리그), 부드러운 그림자, 자국마다 생기는 자체 그늘, 구운 점토의 결, 손으로 빚어 완전한 원이
아닌 테두리. 바닥이 아니라 벽에 걸리고, 그림자는 뒤 벽에 떨어져 알파로만 나가므로 무대 PNG 위에
그대로 얹힌다 — 바닥 원근을 맞출 필요가 없다.

  --keys    키프레임 N+1 개 — 시작 상태 하나 + 그룹마다 끝 상태 하나. 각 키는 "각도,기울기,자국수"
            (도·도·개). 프레임 사이는 부드럽게(각도·기울기) 또는 선형으로(자국 수) 잇는다.
  --frames  그룹마다 새 프레임 수 "g:n …". 경계 프레임은 이웃 그룹이 나눠 가지므로 그룹 1 이
            0..11, 그룹 2 가 11..38 이 된다 — 이어 붙는 자리가 안 튄다.
  --out     <out>.png 시트 · <out>.js 사이드카(window.SLIDE_OBJECTS) · <out>-preview.png(끝 프레임).
            시트는 png 다 — check-slide.js 가 webp 를 확장자로 막는다(움직이는 webp 와 못 가른다).
  --signs   나선 위 자국의 총수(기본 241). 키의 자국 수는 이 안이다.

굽는 속도는 셀 760×600·2배 슈퍼샘플에서 프레임당 5~6초(M4). 72 프레임이면 7분, 회차당 0원.
형상은 지금 disc 하나다(둥근 기둥). 새 형상은 SHAPES 에 sdf 함수 하나를 더한다 — 조명·카메라·
그림자·시트·사이드카는 그대로 쓴다. 의존은 numpy·Pillow 뿐이다.
"""
import argparse, json, math, os, sys, time
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# ── 셀 배치 (슬라이드 캔버스 픽셀) ────────────────────────────────
CELL_W, CELL_H = 760, 600           # 폭은 가장 누운 키(기울기 26°)의 벽 그림자까지 — 실측 잉크 x 731, 630 이면 그림자가 직선으로 잘린다
CX, CY = 275.0, 245.0            # 셀 안 물체 중심
DISC_PX = 230.0                  # 원반 반지름(픽셀)
CAM_D = 6.0
FOCAL = DISC_PX * CAM_D

# ── 형상 ───────────────────────────────────────────────────────
R, HZ, RR = 1.0, 0.101, 0.032    # 반지름 · 반두께 · 모서리 반지름
WALL_Z = -0.44

def _n(v):
    v = np.asarray(v, np.float64); return v / np.linalg.norm(v)

# 키 라이트는 방향광이 아니라 점광원이다. 평평한 얼굴에 방향광을 쏘면 면 전체가 같은 밝기라
# 렌더가 납작해진다 — 거리 감쇠가 얼굴을 가로지르며 모델링을 만든다.
LAMP = np.array([-2.35, 2.55, 3.35])
LAMP_D0 = float(np.linalg.norm(LAMP))
FILL = _n([0.62, -0.34, 0.52])
ALBEDO = np.array([0.556, 0.238, 0.108])       # 구운 점토
KEY_C = np.array([1.000, 0.940, 0.852])
FILL_C = np.array([0.38, 0.49, 0.66])
AMB_C = np.array([0.24, 0.30, 0.42])
KEY_I, FILL_I, AMB_I, RIM_I = 0.86, 0.16, 0.14, 0.17
SPEC_I, SPEC_P = 0.075, 18.0
SHADOW_RGB = np.array([0.0008, 0.0016, 0.0034], np.float32) * 255.0   # 선형 공간 — sRGB 로 적으면 감마 뒤에 회청색 타원이 된다
SHADOW_A = 0.78

# ── 자국 지도 ──────────────────────────────────────────────────
TN = 1024
TURNS = 5.4
R_OUT, R_IN = 0.93, 0.20
SIGN_R = 0.036
DEPTH = 0.017

def spiral_points(n):
    """바깥 테두리에서 안으로 감기는 나선 위에 n 개를 같은 간격으로 놓는다."""
    phimax = 2 * math.pi * TURNS
    phi = np.linspace(0, phimax, 4000)
    rr = R_OUT + (R_IN - R_OUT) * (phi / phimax)
    x, y = rr * np.cos(phi), rr * np.sin(phi)
    seg = np.hypot(np.diff(x), np.diff(y))
    s = np.concatenate([[0], np.cumsum(seg)])
    want = np.linspace(0, s[-1] * 0.995, n)
    idx = np.interp(want, s, np.arange(len(s)))
    px = np.interp(idx, np.arange(len(s)), x)
    py = np.interp(idx, np.arange(len(s)), y)
    tang = np.interp(idx, np.arange(len(s)), phi)
    return px, py, tang, (x, y)

def motif_shapes(rng, k):
    """도장 45종 — 원시 도형 둘셋으로 만든 자국. 글자로 읽히면 안 되고 찍힌 것으로 읽혀야 한다."""
    out = []
    kind = k % 9
    if kind == 0:   out += [("e", 0, -.25, .52, .40), ("e", 0, .40, .30, .30)]
    elif kind == 1: out += [("e", 0, 0, .62, .62), ("b", -.28, 0, .28, 0, .17)]
    elif kind == 2: out += [("t", 0, -.62, .62, .48), ("b", 0, .10, 0, .70, .16)]
    elif kind == 3: out += [("b", -.55, -.45, .55, -.45, .18), ("b", 0, -.45, 0, .62, .18)]
    elif kind == 4: out += [("e", -.28, -.18, .34, .34), ("e", .28, -.18, .34, .34), ("b", 0, .18, 0, .66, .15)]
    elif kind == 5: out += [("e", 0, 0, .60, .44), ("b", -.42, .46, .42, .46, .15)]
    elif kind == 6: out += [("t", 0, .58, .56, -.52), ("e", 0, -.34, .22, .22)]
    elif kind == 7: out += [("b", -.48, -.52, .48, .52, .19), ("b", .48, -.52, -.48, .52, .19)]
    else:           out += [("e", 0, 0, .30, .30), ("e", 0, 0, .66, .66)]
    if k % 3 == 1: out.append(("e", rng.uniform(-.3, .3), rng.uniform(-.6, -.4), .13, .13))
    if k % 5 == 2: out.append(("b", -.5, .70, .5, .70, .13))
    return out

def build_face(signs, seed=7):
    """자국 높이 지도 HT(월드 단위, 음수 = 파인 자국)와 순서 지도 ORD(1..signs)를 만든다."""
    SS = 2
    N = TN * SS
    ink = Image.new("L", (N, N), 0); dr = ImageDraw.Draw(ink)
    order = Image.new("I", (TN, TN), 0); do = ImageDraw.Draw(order)
    rng = np.random.default_rng(seed)

    def to_px(x, y, s=1):
        return ((x / R + 1) * 0.5 * (TN * s), (1 - (y / R + 1) * 0.5) * (TN * s))

    px, py, tang, curve = spiral_points(signs)
    # 나선 홈 — 자국 사이를 잇는 얕은 골. 자국 하나마다 한 토막이라 자국과 같이 나타난다.
    cx, cy = curve
    seg = np.linspace(0, len(cx) - 1, signs + 1).astype(int)
    for i in range(signs):
        a0, a1 = seg[i], seg[i + 1] + 1
        sub = list(zip(cx[a0:a1], cy[a0:a1]))
        if len(sub) < 2: continue
        dr.line([to_px(a, b, SS) for a, b in sub], fill=78, width=int(0.0055 * TN * SS), joint="curve")
        do.line([to_px(a, b) for a, b in sub], fill=i + 1, width=int(0.0058 * TN))

    for i in range(signs):
        a = tang[i] + math.pi / 2
        ca, sa = math.cos(a), math.sin(a)
        sc = SIGN_R
        for sh in motif_shapes(rng, i % 45):
            def T(u, v):
                return (px[i] + (u * ca - v * sa) * sc, py[i] + (u * sa + v * ca) * sc)
            if sh[0] == "e":
                _, u, v, rx, ry = sh
                q = [T(u - rx, v - ry), T(u + rx, v + ry)]
                for d, s, val in ((dr, SS, 255), (do, 1, i + 1)):
                    x0, y0 = to_px(*q[0], s); x1, y1 = to_px(*q[1], s)
                    d.ellipse([min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)], fill=val)
            elif sh[0] == "b":
                _, u0, v0, u1, v1, w = sh
                for d, s, val in ((dr, SS, 255), (do, 1, i + 1)):
                    d.line([to_px(*T(u0, v0), s), to_px(*T(u1, v1), s)], fill=val, width=max(1, int(w * sc * TN * s)))
            else:
                _, u, v, w, h = sh
                tri = [T(u, v), T(u - w, v - h), T(u + w, v - h)]
                for d, s, val in ((dr, SS, 255), (do, 1, i + 1)):
                    d.polygon([to_px(*t, s) for t in tri], fill=val)

    ink = ink.resize((TN, TN), Image.LANCZOS)
    HT = np.asarray(ink, np.float32) / 255.0
    ORD = np.asarray(order, np.int32)
    # 결 — 구운 점토는 완전히 매끈하지 않다. 이 한 겹이 없으면 플라스틱으로 읽힌다.
    g = rng.standard_normal((TN, TN)).astype(np.float32)
    g = np.asarray(Image.fromarray(((g * 0.16 + 0.5).clip(0, 1) * 255).astype(np.uint8))
                   .filter(ImageFilter.GaussianBlur(1.1)), np.float32) / 255.0 - 0.5
    g2 = rng.standard_normal((TN // 4, TN // 4)).astype(np.float32)
    g2 = np.asarray(Image.fromarray(((g2 * 0.16 + 0.5).clip(0, 1) * 255).astype(np.uint8))
                    .filter(ImageFilter.GaussianBlur(1.6)).resize((TN, TN), Image.BICUBIC), np.float32) / 255.0 - 0.5
    GR = (g * 0.85 + g2 * 1.5) * 0.0055
    return HT, ORD, GR.astype(np.float32)

def face_maps(HT, ORD, GR, k, ldir2, lz):
    """자국 k 개까지만 남기고(흐리기 전에 — 아직 안 찍힌 이웃이 번지지 않게) 높이·법선·자체 그늘을 만든다."""
    m = (ORD > 0) & (ORD <= max(k, 0))
    h = HT * m
    h = np.asarray(Image.fromarray((h * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.0)), np.float32) / 255.0
    hw = -h * DEPTH + GR
    du = 2.0 * R / TN
    gy, gx = np.gradient(hw, du)
    occ = np.zeros_like(hw)
    if abs(lz) > 1e-3:
        slope = math.hypot(*ldir2) / max(lz, 1e-3)
        for s in (2, 4, 7, 11):
            sx = int(round(ldir2[0] * s)); sy = int(round(-ldir2[1] * s))
            sh = np.roll(np.roll(hw, sy, 0), sx, 1)
            occ = np.maximum(occ, (sh - hw) - s * du * slope)
    occ = np.clip(occ / (DEPTH * 0.6), 0, 1)
    return hw, gx, gy, occ

# ── SDF — 형상마다 함수 하나. 새 형상은 여기 더한다. ─────────────
def sdf_disc(p):
    """둥근 기둥. 손으로 빚은 테두리 — 세 주파수의 흔들림이 완전한 원을 깬다."""
    ang = np.arctan2(p[..., 1], p[..., 0])
    wob = 0.0090 * np.sin(3.1 * ang + 1.2) + 0.0052 * np.sin(7.7 * ang) + 0.0031 * np.sin(13.3 * ang + 2.0)
    dxy = np.hypot(p[..., 0], p[..., 1]) - (R - RR + wob)
    dz = np.abs(p[..., 2]) - (HZ - RR)
    a = np.minimum(np.maximum(dxy, dz), 0.0)
    b = np.hypot(np.maximum(dxy, 0.0), np.maximum(dz, 0.0))
    return a + b - RR

SHAPES = {"disc": sdf_disc}

def rot_matrix(theta, tilt):
    ct, st = math.cos(tilt), math.sin(tilt)
    Rx = np.array([[1, 0, 0], [0, ct, -st], [0, st, ct]])
    cy_, sy_ = math.cos(theta), math.sin(theta)
    Ry = np.array([[cy_, 0, sy_], [0, 1, 0], [-sy_, 0, cy_]])
    M = Rx @ Ry
    return M, M.T

def sphere_range(ro, rd, rad=1.06):
    """경계 구 — 안 스치는 광선은 아예 건너뛴다."""
    b = np.einsum('...i,...i', ro, rd)
    c = np.einsum('...i,...i', ro, ro) - rad * rad
    disc = b * b - c
    ok = disc > 0
    sq = np.sqrt(np.maximum(disc, 0))
    return ok, np.maximum(-b - sq, 0.0), -b + sq

def march(sdf, ro, rd, W2O, t0, t1, steps=64):
    t = t0.copy()
    d = np.full(t.shape, 1.0, np.float32)
    for _ in range(steps):
        p = ro + rd * t[..., None]
        d = sdf(p @ W2O.T).astype(np.float32)
        adv = (d > 6e-4) & (t < t1)
        if not adv.any(): break
        t = np.where(adv, t + np.maximum(d, 0) * 0.82, t)
    return t, (d <= 3e-3) & (t < t1)

def lamp_dir(p):
    v = LAMP - p
    d = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / d, d[..., 0]

def soft_shadow(sdf, p, ld, W2O, steps=40, k=9.0):
    ok, ta, tb = sphere_range(p, ld)
    res = np.ones(p.shape[:-1], np.float32)
    idx = ok & (tb > 0)
    if not idx.any(): return res
    pp = p[idx]; dd = ld[idx]
    t = np.maximum(ta[idx], 0.01).astype(np.float32)
    end = tb[idx].astype(np.float32)
    r = np.ones(t.shape, np.float32)
    for _ in range(steps):
        d = sdf((pp + dd * t[..., None]) @ W2O.T).astype(np.float32)
        r = np.minimum(r, k * d / np.maximum(t, 1e-3))
        t = t + np.clip(d, 0.008, 0.20)
        if (t > end).all(): break
    res[idx] = np.clip(r, 0, 1)
    return res

def render(sdf, theta, tilt, k, HT, ORD, GR, ss=2):
    """프레임 하나 — RGBA uint8 (CELL_H, CELL_W, 4). 물체는 불투명, 벽 그림자는 알파만."""
    O2W, W2O = rot_matrix(theta, tilt)
    w, h = CELL_W * ss, CELL_H * ss
    j, i = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32), indexing='xy')
    xs = ((j + 0.5) / ss - CX) / FOCAL
    ys = -((i + 0.5) / ss - CY) / FOCAL
    rd = np.stack([xs, ys, -np.ones_like(xs)], -1)
    rd /= np.linalg.norm(rd, axis=-1, keepdims=True)
    ro = np.array([0, 0, CAM_D], np.float32)
    rob = np.broadcast_to(ro, rd.shape)

    ok, ta, tb = sphere_range(rob, rd)
    ta = np.where(ok, ta, 1e9).astype(np.float32)
    tb = np.where(ok, tb, 0.0).astype(np.float32)
    t, hit = march(sdf, rob, rd, W2O, ta, np.minimum(tb, 9.0))
    hit &= ok

    rgb = np.zeros((h, w, 3), np.float32)
    alp = np.zeros((h, w), np.float32)

    if hit.any():
        p = (rob + rd * t[..., None])[hit]
        e = 7e-4
        def sd(q): return sdf(q @ W2O.T)
        n = np.stack([sd(p + [e, 0, 0]) - sd(p - [e, 0, 0]),
                      sd(p + [0, e, 0]) - sd(p - [0, e, 0]),
                      sd(p + [0, 0, e]) - sd(p - [0, 0, e])], -1)
        n /= np.linalg.norm(n, axis=-1, keepdims=True)

        po = p @ W2O.T
        rad = np.hypot(po[:, 0], po[:, 1])
        face = (po[:, 2] > 0) & (rad < R - RR * 1.4)

        LD, LDIST = lamp_dir(p)
        lo = W2O @ _n(LAMP)
        hw, gx, gy, occ = face_maps(HT, ORD, GR, k, (lo[0], lo[1]), lo[2])
        tex = np.zeros(len(p), np.float32)
        dep = np.zeros(len(p), np.float32)
        mot = np.zeros(len(p), np.float32)
        if face.any():
            u = np.clip(((po[face, 0] / R + 1) * 0.5 * (TN - 1)).astype(np.int32), 0, TN - 1)
            v = np.clip(((1 - (po[face, 1] / R + 1) * 0.5) * (TN - 1)).astype(np.int32), 0, TN - 1)
            nb = np.stack([-gx[v, u], gy[v, u], np.ones(len(u), np.float32)], -1)
            nb /= np.linalg.norm(nb, axis=-1, keepdims=True)
            n[face] = nb @ O2W.T
            tex[face] = occ[v, u]
            dep[face] = hw[v, u]
            mot[face] = np.clip(GR[v, u] / 0.006, -1, 1)

        atten = (LAMP_D0 / LDIST) ** 2
        ndl = np.maximum(np.einsum('ij,ij->i', n, LD), 0) * atten
        sh = soft_shadow(sdf, p + n * 3e-3, LD, W2O)
        sh = np.minimum(sh, 1.0 - 0.88 * tex)
        ndf = np.maximum(np.einsum('ij,j->i', n, FILL), 0)
        vdir = -rd[hit]
        # 가장자리에서만 차가운 빛 한 줄 — 어두운 벽에서 물체를 떼어 놓는다
        ndr = (1.0 - np.maximum(np.einsum('ij,ij->i', n, vdir), 0)) ** 3.4
        hv = LD + vdir; hv /= np.linalg.norm(hv, axis=-1, keepdims=True)
        spe = np.maximum(np.einsum('ij,ij->i', n, hv), 0) ** SPEC_P
        cav = np.clip(1.0 + dep / (DEPTH * 1.35), 0.42, 1.0)      # 파인 자리는 빛을 덜 받는다
        alb = ALBEDO * (1.0 + 0.17 * mot)[:, None]
        col = (alb * (KEY_C * (KEY_I * ndl * sh)[:, None] + FILL_C * (FILL_I * ndf)[:, None] + AMB_C * (AMB_I * cav)[:, None])
               + KEY_C * (SPEC_I * spe * sh)[:, None] + np.array([.82, .88, 1.0]) * (RIM_I * ndr)[:, None])
        rgb[hit] = col
        alp[hit] = 1.0

    wall = ~hit
    if wall.any():
        tw = (WALL_Z - CAM_D) / rd[..., 2]
        pw = (rob + rd * tw[..., None])[wall]
        wld, _ = lamp_dir(pw)
        vis = soft_shadow(sdf, pw + np.array([0, 0, 3e-3], np.float32), wld, W2O, k=13.0)
        rgb[wall] = SHADOW_RGB / 255.0
        alp[wall] = (1.0 - vis) * SHADOW_A

    pm = rgb * alp[..., None]
    pm = pm.reshape(CELL_H, ss, CELL_W, ss, 3).mean((1, 3))
    aa = alp.reshape(CELL_H, ss, CELL_W, ss).mean((1, 3))
    out = np.zeros((CELL_H, CELL_W, 4), np.float32)
    nz = aa > 1e-5
    out[..., :3][nz] = pm[nz] / aa[nz][:, None]
    out[..., 3] = aa
    out[..., :3] = np.clip(out[..., :3], 0, 1) ** (1 / 2.2)
    return (np.clip(out, 0, 1) * 255).astype(np.uint8)

# ── 타임라인 ───────────────────────────────────────────────────
def parse_keys(s):
    keys = []
    for tok in s.split():
        a, t, k = tok.split(",")
        keys.append((float(a), float(t), int(k)))
    return keys

def parse_frames(s):
    out = {}
    for tok in s.split():
        g, n = tok.split(":")
        if int(g) in out:
            sys.exit(f"--frames 에 그룹 {g} 가 두 번 있다")
        out[int(g)] = int(n)
    return out

def timeline(keys, frames):
    """(각도, 기울기, 자국 수) 프레임 목록과 그룹별 구간. 각도·기울기는 smoothstep, 자국 수는 선형."""
    groups = sorted(frames)
    if groups[0] < 1:
        sys.exit(f"--frames 의 그룹 번호는 1 이상이다: {groups}")   # 상한은 check-scenes 가 나레이션 수로 본다 — 첫 구간 전·구간 사이 그룹은 런타임이 첫/직전 프레임으로 세운다
    if any(frames[g] < 1 for g in groups):
        sys.exit("--frames 의 프레임 수는 1 이상이다")
    if len(keys) != len(groups) + 1:
        sys.exit(f"--keys 는 {len(groups) + 1}개(시작 + 그룹마다 하나)여야 하는데 {len(keys)}개다")
    ranges, start = {}, 0
    for g in groups:
        ranges[g] = [start, start + frames[g]]
        start += frames[g]
    n = start + 1
    th, ti, ks = [0.0] * n, [0.0] * n, [0] * n
    for gi, g in enumerate(groups):
        a, b = ranges[g]
        for i in range(a, b + 1):
            x = (i - a) / max(b - a, 1)
            e = x * x * (3 - 2 * x)
            for arr, j in ((th, 0), (ti, 1), (ks, 2)):
                v0, v1 = keys[gi][j], keys[gi + 1][j]
                arr[i] = v0 + (v1 - v0) * (x if j == 2 else e)
    return ([math.radians(v) for v in th], [math.radians(v) for v in ti], [int(round(v)) for v in ks], n, ranges)

def preview_png(frame, path):
    """끝 프레임을 잉크 바탕에 얹어 저장한다 — 시트를 열어 보지 않고도 물체를 본다."""
    bg = Image.new("RGBA", (CELL_W, CELL_H), (0x13, 0x22, 0x38, 255))
    fr = Image.fromarray(frame, "RGBA")
    bg.alpha_composite(fr)
    bg.convert("RGB").save(path)

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--shape", default="disc", choices=sorted(SHAPES))
    ap.add_argument("--keys", help='"각도,기울기,자국수 …" — 시작 하나 + 그룹마다 하나')
    ap.add_argument("--frames", help='"1:11 2:27 …" — 그룹마다 새 프레임 수')
    ap.add_argument("--signs", type=int, default=241)
    ap.add_argument("--cols", type=int, default=9)
    ap.add_argument("--ss", type=int, default=2, help="슈퍼샘플 배율")
    ap.add_argument("--out", default="obj", help="확장자 없는 출력 경로 — <out>.png · <out>.js · <out>-preview.png")
    ap.add_argument("--preview", type=float, nargs=2, metavar=("DEG", "K"), help="한 프레임만 굽는다(각도, 자국 수)")
    ap.add_argument("--tilt", type=float, default=16.0, help="--preview 의 기울기(도)")
    a = ap.parse_args()
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)   # --preview 도 여기로 쓴다

    sdf = SHAPES[a.shape]
    HT, ORD, GR = build_face(a.signs)
    if a.preview is not None:
        deg, k = a.preview
        img = render(sdf, math.radians(deg), math.radians(a.tilt), int(k), HT, ORD, GR, a.ss)
        preview_png(img, a.out + "-preview.png")
        print("preview →", a.out + "-preview.png")
        return
    if not a.keys or not a.frames:
        sys.exit("--keys 와 --frames 가 필요하다 (또는 --preview)")

    ths, tis, ks, n, ranges = timeline(parse_keys(a.keys), parse_frames(a.frames))
    if max(ks) > a.signs:
        sys.exit(f"키의 자국 수 {max(ks)} 가 --signs {a.signs} 를 넘는다")
    cols = a.cols
    rows = (n + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * CELL_W, rows * CELL_H), (0, 0, 0, 0))
    ink = [CELL_W, CELL_H, 0, 0]            # 잉크(알파 > 8) 상자 — 프레임 전체의 합
    t0 = time.time()
    last = None
    for i in range(n):
        img = render(sdf, ths[i], tis[i], ks[i], HT, ORD, GR, a.ss)
        ys, xs = np.nonzero(img[..., 3] > 8)
        if len(xs):
            ink = [min(ink[0], int(xs.min())), min(ink[1], int(ys.min())), max(ink[2], int(xs.max()) + 1), max(ink[3], int(ys.max()) + 1)]
        sheet.paste(Image.fromarray(img, "RGBA"), ((i % cols) * CELL_W, (i // cols) * CELL_H))
        last = img
        print(f"{i + 1}/{n}  {time.time() - t0:.1f}s", flush=True)

    sheet.save(a.out + ".png", optimize=True)
    preview_png(last, a.out + "-preview.png")
    ident = os.path.basename(a.out)
    out_abs = os.path.abspath(a.out)
    # 시트 경로는 슬라이드 HTML 기준이다 — 슬라이드는 사이드카 디렉토리(assets/)의 한 단계 위에 산다
    rel_file = os.path.join(os.path.basename(os.path.dirname(out_abs)), ident + ".png")
    meta = {"file": rel_file, "shape": a.shape, "cell": [CELL_W, CELL_H], "cols": cols, "n": n,
            "ranges": {str(g): r for g, r in ranges.items()}, "ink": ink,
            "keys": a.keys, "frames": a.frames, "signs": a.signs}
    with open(a.out + ".js", "w", encoding="utf-8") as f:
        f.write("// bake-object.py 가 쓴 사이드카 — 손으로 고치지 않는다. 슬라이드가 <script src> 로 읽고 h.object(rg, id) 가 쓴다.\n")
        f.write("window.SLIDE_OBJECTS = Object.assign(window.SLIDE_OBJECTS || {}, " + json.dumps({ident: meta}, ensure_ascii=False) + ");\n")
    print("sheet", sheet.size, os.path.getsize(a.out + ".png"), "bytes →", a.out + ".png")
    print("ink bbox (셀 안 픽셀)", ink)
    print("슬라이드에 넣을 두 줄:")
    print(f'  <script src="{os.path.join(os.path.basename(os.path.dirname(out_abs)), ident + ".js")}"></script>   (scenes.js 다음)')
    print(f'  h.object(1, "{ident}", {{ x: {728 - ink[2]}, y: 0, slot: true }})   (x 는 세로 존 728px 기준 — x+{ink[0]} ≥ 0, x+{ink[2]} ≤ 존 폭)')

if __name__ == "__main__":
    main()
