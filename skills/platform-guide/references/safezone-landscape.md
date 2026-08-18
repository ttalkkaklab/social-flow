# 16:9 long-form safe zone — measured source of truth

**Measured** 2026-08-17 · **Surface** YouTube desktop web (ego lite / chromium 150) ·
**Method** DOM `getBoundingClientRect()` normalized to 1920×1080 canvas units.

All coordinates are **canvas units**. Multiply screen px by `S = 1920 /
player-width` to get them. Normalization was cross-checked every time with
`player-height × S == 1080`.

Nothing here was eyeballed — capturing the screen and measuring by hand mixes
in scaling and crop, so it can't be reproduced. Converting DOM rects to canvas
units is this repository's measurement contract.

## Confirmed values

```js
zone: { x: 96, top: 96, bottom: 285, anchor: 'top' }
```

| Axis | Value | Grounds |
|---|---|---|
| x (sides) | 96 | 5% of frame width. The bottom-right button cluster eats 36px worst-case, leaving 60px of margin |
| top | 96 | The top gradient is 144px worst-case, but it only darkens — it doesn't cover. 96 equals the 5%-width inset, so the four edges balance visually |
| bottom | 285 | **Comes from the worst-case 2-line subtitle top at y795.** User decision (2026-08-17): worst-case basis |

The text area is **1728 × 699**. That's 0.60 of the height (1160), which looks
narrow. Long-form puts fewer characters on screen at once, so this isn't a
constraint — the cover-block cross-check is in §6.

## Measurements

### ① The control bar is a fixed 59px on the physical screen

Its canvas-unit height is **inversely proportional** to window width. Smaller
windows get covered more.

| Window width | Player width | S | Control bar (canvas) | Physical |
|---|---|---|---|---|
| 1024 | 640 | 3.000 | **177** | 59 |
| 1280 | 873 | 2.199 | 130 | 59 |
| 1440 | 989 | 1.941 | 115 | 59 |
| 1600 | 1105 | 1.738 | 103 | 59 |
| 1920 | 1337 | 1.436 | 85 | 59 |
| 2200 | 1540 | 1.247 | 74 | 59 |
| 2560 | 1801 | 1.066 | 63 | 59 |

The progress bar is likewise fixed at 6 physical px.

### ② Subtitles are the source of truth for the bottom constraint

The worst-case top of a 2-line subtitle was tracked per window for 35–70s at
200ms intervals. This video never showed 3 lines (456 samples, only 1 and 2
lines).

| Player width | Worst 2-line subtitle top | Bottom height covered | Samples |
|---|---|---|---|
| 873 (window 1280) | **y795** | **285** | 160 |
| 1337 (window 1920) | y846 | 234 | 137 |
| 1801 (window 2560) | y871 | 209 | 159 |

The subtitle font is a constant **48px in canvas units** (22–45px physical).
Subtitle position was also confirmed independent of control-bar visibility —
y871 in both states.

### ③ Side insets

| Element | 1280 wide | 1920 wide | 2560 wide |
|---|---|---|---|
| Left button cluster x | 26 | 17 | 13 |
| Right button cluster (from right) | 27 | 18 | 13 |
| Fullscreen button (from right) | **36** | 23 | 17 |

Worst case is 36px, so the x inset of 96 leaves 60px of margin.

### ④ Gradients

| Window width | Top (canvas) | Physical |
|---|---|---|
| 1024 | **144** | 48 |
| 1280 | 106 | 48 |
| 1920 | 69 | 48 |
| 2560 | 51 | 48 |

The bottom gradient's CSS height spans the whole player, so it can't produce a
constraint — which is why the bottom uses the subtitle measurement instead.

## What couldn't be measured

- **The top title bar** (`.ytp-title-text`) renders 0 in this client. Normal
  playback, fullscreen, and forced autohide-off were all `hidden`. So the
  grounds for zone top 96 are the gradient and width symmetry, not title-bar
  avoidance. Worth re-measuring in environments where the title bar shows
  (embeds · TV apps).
- **Mobile web landscape** couldn't be measured. Even with
  `Emulation.setDeviceMetricsOverride` faking an iPhone, ego lite kept serving
  the desktop layout (window snapped back to 2560×1409 · dpr 1). Needs a real
  device or an AVD.
- **End-screen coordinates** are author-placed, so the player can't measure
  them. Official docs give no pixel spec — only rules were confirmed: last
  5–20s · video ≥25s · 16:9 allows at most 4 elements【primary:
  support.google.com/youtube/answer/6388789】. If our channel adopts end
  screens we place them ourselves, so keeping them inside the bottom 285 works.
- **The card teaser** (`.ytp-cards-teaser`) was `hidden` because this video has
  no cards. It appears top-right, where zone top 96 already gives clearance.

## One-line summary

Landscape text goes inside **x 96–1824 · y 96–795**. The bottom 285px belongs
to subtitles.
