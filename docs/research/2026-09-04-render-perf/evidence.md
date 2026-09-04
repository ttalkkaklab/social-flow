# 실측 원본 출력 (2026-09-04) — 스크립트는 세션 스크래치패드(phase3.sh · bench.sh · cmpmp4.sh · cmp.py · gt-check.py · mp4gt.py · seamchk.py · subst.sh · brsum.py)

## phase3 — build-reel 1·2쌍 · 완주 벤치 · mp4 비교 · 계약 픽스처 · 이음매
```
=== build-reel profile old ===
brold: 14 cards, ── done, real 296.55 user 2174.08 sys 62.86 
=== build-reel profile new ===
brnew: 14 cards, ── done, real 1498.72 user 2182.08 sys 70.10 
=== build-reel profile old (2nd) ===
brold2: 14 cards, ── done, real 256.81 user 1868.61 sys 50.74 
=== build-reel profile new (2nd) ===
brnew2: 14 cards, ── done, real 500.36 user 2063.03 sys 61.19 
=== bench ===
old-s10-j1	s10-quarry-to-city.html	footage	1	3	459	197.49	2.3
new-s10-def	s10-quarry-to-city.html	footage	3	3	459	47.4	9.7
new-s10-def2	s10-quarry-to-city.html	footage	3	3	459	47.69	9.6
old-p2-def	s2-1776-origin.html	editorial	3	3	277	54.22	5.1
new-p2-def	s2-1776-origin.html	editorial	3	3	277	15.23	18.2
old-s5-j1	s5-empty-city-rumours.html	footage	1	5	784	386.76	2
new-s5-def	s5-empty-city-rumours.html	footage	4	5	784	87.06	9
=== mp4 compare s10 old vs new ===
r1.mp4: frames 133/133 psnr_avg 47.417536 · frames_not_identical 133 · per_frame_min 43.71
r2.mp4: frames 133/133 psnr_avg 50.324282 · frames_not_identical 132 · per_frame_min 45.71
r3.mp4: frames 193/193 psnr_avg 74.680580 · frames_not_identical 1 · per_frame_min 51.83
manifest k/frames/dur: same
=== mp4 compare s10 new vs new (determinism) ===
r1.mp4: frames 133/133 psnr_avg inf · frames_not_identical 0 · per_frame_min inf
r2.mp4: frames 133/133 psnr_avg inf · frames_not_identical 0 · per_frame_min inf
r3.mp4: frames 193/193 psnr_avg inf · frames_not_identical 0 · per_frame_min inf
manifest k/frames/dur: same
=== mp4 compare p2 old vs new ===
r1.mp4: frames 114/114 psnr_avg inf · frames_not_identical 0 · per_frame_min inf
r2.mp4: frames 120/120 psnr_avg inf · frames_not_identical 0 · per_frame_min inf
r3.mp4: frames 43/43 psnr_avg inf · frames_not_identical 0 · per_frame_min inf
manifest k/frames/dur: same
=== mp4 compare s5 old vs new ===
r1.mp4: frames 133/133 psnr_avg inf · frames_not_identical 0 · per_frame_min inf
r2.mp4: frames 133/133 psnr_avg inf · frames_not_identical 0 · per_frame_min inf
r3.mp4: frames 163/163 psnr_avg 48.450057 · frames_not_identical 162 · per_frame_min 43.27
r4.mp4: frames 192/192 psnr_avg 51.837078 · frames_not_identical 191 · per_frame_min 48.22
r5.mp4: frames 163/163 psnr_avg inf · frames_not_identical 0 · per_frame_min inf
manifest k/frames/dur: same
=== bench done ===
=== contract fixtures ===
fixture fx/storyboard/slides/s10-noapi.html: exit 1 — ✗ the page does not expose __seek/__groups/__size/__meta/__ready — built from motion-slide-template.html?
fixture fx/storyboard/slides/s10-stray.html: exit 1 — ✗ 1 animation(s) live outside any [data-rg] group — they would run on the wall clock and break determinism. Put every animated element in a reveal group
fixture fxm/storyboard/slides/s10-quarry-to-city.html: exit 1 — ✗ could not load: footage/s10-g1-MISSING.mp4, footage/s10-g1-MISSING.mp4 — a slide's images and video are local files next to it. Check the path, and use H.264 
=== seam check (sheet + keep-frames) ===
seam run groups 3 frames 459 sec 45.12 fps 10.2
seam g2 f0000 vs g1-end: DIFFER
seam g3 f0000 == g2-end: identical
=== phase3 done ===
```

## phase4 — s10 프레임 단위 이전/새 비교 · 시트 · 원본 대조 · 이음매 · mp4 풀어 원본 대조 · build-reel 3·4쌍
```
=== A. s10 frames+sheet+mp4: old j1 · new ×2 · new j1 ===
q-old	s10-quarry-to-city.html	footage	1	3	459	200.12	2.3
q-new1	s10-quarry-to-city.html	footage	3	3	459	47.98	9.6
q-new2	s10-quarry-to-city.html	footage	3	3	459	49.26	9.3
q-newj1	s10-quarry-to-city.html	footage	1	3	459	76.95	6
--- PNG-level
q-new1 vs q-old: 459 frames, identical 457, missing 0, min PSNR 80.1 frames-r3/f0000.png
q-new2 vs q-new1: 459 frames, identical 459, missing 0, min PSNR inf 
q-newj1 vs q-new1: 459 frames, identical 457, missing 0, min PSNR 80.1 frames-r3/f0000.png
--- sheet-level
q-new1 sheet/g1-end.png vs old: DIFFER
q-new1 sheet/g1-mid.png vs old: DIFFER
q-new1 sheet/g2-end.png vs old: DIFFER
q-new1 sheet/g2-mid.png vs old: DIFFER
q-new1 sheet/g3-end.png vs old: DIFFER
q-new1 sheet/g3-mid.png vs old: DIFFER
q-new2 sheet/g1-end.png vs old: DIFFER
q-new2 sheet/g1-mid.png vs old: DIFFER
q-new2 sheet/g2-end.png vs old: DIFFER
q-new2 sheet/g2-mid.png vs old: DIFFER
q-new2 sheet/g3-end.png vs old: DIFFER
q-new2 sheet/g3-mid.png vs old: DIFFER
q-newj1 sheet/g1-end.png vs old: DIFFER
q-newj1 sheet/g1-mid.png vs old: DIFFER
q-newj1 sheet/g2-end.png vs old: DIFFER
q-newj1 sheet/g2-mid.png vs old: DIFFER
q-newj1 sheet/g3-end.png vs old: DIFFER
q-newj1 sheet/g3-mid.png vs old: DIFFER
--- mp4-level
[old vs new1]
r1.mp4: frames 133/133 psnr_avg inf · frames_not_identical 0 · per_frame_min inf
r2.mp4: frames 133/133 psnr_avg 50.324282 · frames_not_identical 132 · per_frame_min 45.71
r3.mp4: frames 193/193 psnr_avg 74.680580 · frames_not_identical 1 · per_frame_min 51.83
manifest k/frames/dur: same
[new1 vs new2]
r1.mp4: frames 133/133 psnr_avg inf · frames_not_identical 0 · per_frame_min inf
r2.mp4: frames 133/133 psnr_avg inf · frames_not_identical 0 · per_frame_min inf
r3.mp4: frames 193/193 psnr_avg inf · frames_not_identical 0 · per_frame_min inf
manifest k/frames/dur: same
[new1 vs newj1]
r1.mp4: frames 133/133 psnr_avg inf · frames_not_identical 0 · per_frame_min inf
r2.mp4: frames 133/133 psnr_avg 50.324282 · frames_not_identical 132 · per_frame_min 45.71
r3.mp4: frames 193/193 psnr_avg 74.680580 · frames_not_identical 1 · per_frame_min 51.83
manifest k/frames/dur: same
--- ground truth (PNG f0000..f0002)
q-old r1: f0000→src0 · f0001→src1 · f0002→src2
q-old r2: f0001→src1 · f0002→src2
q-old r3: f0001→src1 · f0002→src2
q-old ground truth: OK
q-new1 r1: f0000→src0 · f0001→src1 · f0002→src2
q-new1 r2: f0001→src1 · f0002→src2
q-new1 r3: f0001→src1 · f0002→src2
q-new1 ground truth: OK
q-new2 r1: f0000→src0 · f0001→src1 · f0002→src2
q-new2 r2: f0001→src1 · f0002→src2
q-new2 r3: f0001→src1 · f0002→src2
q-new2 ground truth: OK
q-newj1 r1: f0000→src0 · f0001→src1 · f0002→src2
q-newj1 r2: f0001→src1 · f0002→src2
q-newj1 r3: f0001→src1 · f0002→src2
q-newj1 ground truth: OK
--- seam
q-old seam g2 f0000 vs g1-end: identical
q-old seam g3 f0000 vs g2-end: 44 px differ (max 20/255, PSNR 80.1 dB)
q-new1 seam g2 f0000 vs g1-end: 3 px differ (max 1/255, PSNR 109.1 dB)
q-new1 seam g3 f0000 vs g2-end: identical
q-new2 seam g2 f0000 vs g1-end: 3 px differ (max 1/255, PSNR 109.1 dB)
q-new2 seam g3 f0000 vs g2-end: identical
q-newj1 seam g2 f0000 vs g1-end: identical
q-newj1 seam g3 f0000 vs g2-end: 44 px differ (max 20/255, PSNR 80.1 dB)
--- bench mp4 decoded ground truth (s10 · s5)
m-old-s10-j1 r1 (vfrom 0ms): f0000→src0 · f0001→src0 ✗(expected 1) · f0002→src2
m-old-s10-j1 r2 (vfrom 0ms): f0001→src1 · f0002→src2
m-old-s10-j1 r3 (vfrom 0ms): f0001→src1 · f0002→src2
m-old-s10-j1 decoded-mp4 ground truth: MISMATCH
m-new-s10-def r1 (vfrom 0ms): f0000→src0 · f0001→src1 · f0002→src2
m-new-s10-def r2 (vfrom 0ms): f0001→src1 · f0002→src2
m-new-s10-def r3 (vfrom 0ms): f0001→src1 · f0002→src2
m-new-s10-def decoded-mp4 ground truth: OK
m-old-s5-j1 r1 (vfrom 0ms): f0000→src0 · f0001→src1 · f0002→src2
m-old-s5-j1 r2 (vfrom 0ms): f0001→src1 · f0002→src2
m-old-s5-j1 r3 (vfrom 0ms): f0001→src0 ✗(expected 1) · f0002→src2
m-old-s5-j1 r4 (vfrom 0ms): f0001→src4 ✗(expected 1) · f0002→src4 ✗(expected 2)
m-old-s5-j1 r5 (vfrom 0ms): f0001→src1 · f0002→src2
m-old-s5-j1 decoded-mp4 ground truth: MISMATCH
m-new-s5-def r1 (vfrom 0ms): f0000→src0 · f0001→src1 · f0002→src2
m-new-s5-def r2 (vfrom 0ms): f0001→src1 · f0002→src2
m-new-s5-def r3 (vfrom 0ms): f0001→src1 · f0002→src2
m-new-s5-def r4 (vfrom 0ms): f0001→src4 ✗(expected 1) · f0002→src4 ✗(expected 2)
m-new-s5-def r5 (vfrom 0ms): f0001→src1 · f0002→src2
m-new-s5-def decoded-mp4 ground truth: MISMATCH
=== B. build-reel pairs (sampler2 running) ===
brold3: 14 cards, ── done, real 296.84 user 2166.55 sys 61.77  load-after { 14.99 13.01 12.06 }
brnew3: 14 cards, ── done, real 276.37 user 2347.15 sys 73.39  load-after { 13.49 16.00 13.98 }
brold4: 14 cards, ── done, real 290.90 user 2161.25 sys 62.31  load-after { 15.74 16.94 15.00 }
brnew4: 14 cards, ── done, real 267.28 user 2277.49 sys 70.70  load-after { 17.65 18.95 16.65 }
=== phase4 done ===
```

## 시트 픽셀 비교(cmp -s 는 파일 바이트라 DIFFER, 픽셀은 같다)
```
q-new1/q-new2/q-newj1 sheet/*.png vs q-old: 6/6 pixel-identical (file bytes 2732707 vs 2978269 for g1-end)
```

## 치환 실험 (subst.sh)
```
[re-encode of new frames as-is vs new renderer's r2.mp4]
r2.mp4: frames 133/133 psnr_avg inf · frames_not_identical 0 · per_frame_min inf
[new frames with old f0000 swapped in vs old renderer's r2.mp4]
r2.mp4: frames 133/133 psnr_avg inf · frames_not_identical 0 · per_frame_min inf
```

## build-reel 단계별 (brsum.py)
```
brnew2: span 500s · card loop 81s · aligner 54.1s (overlapping ffmpeg 52.8s) · mux 334s · burn-in 67s · ffmpeg sum 489s
brold3: span 297s · card loop 113s · aligner 40.6s (overlapping ffmpeg 0.7s) · mux 82s · burn-in 83s · ffmpeg sum 244s
brnew3: span 276s · card loop 99s · aligner 66.0s (overlapping ffmpeg 64.8s) · mux 78s · burn-in 80s · ffmpeg sum 264s
brold4: span 291s · card loop 115s · aligner 40.6s (overlapping ffmpeg 0.7s) · mux 78s · burn-in 79s · ffmpeg sum 239s
brnew4: span 267s · card loop 94s · aligner 61.7s (overlapping ffmpeg 60.7s) · mux 76s · burn-in 79s · ffmpeg sum 255s
```

## 이전 렌더러를 새 판과 같은 옵션(기본 탭 수)으로 — old-s10-def
```
old-s10-def exit 0 wall 227s
load samples during run:
--- mp4 compare old-s10-def vs new-s10-def
r1.mp4: frames 133/133 psnr_avg 48.567181 · frames_not_identical 124 · per_frame_min 47.45
r2.mp4: frames 133/133 psnr_avg 51.726962 · frames_not_identical 110 · per_frame_min 48.12
r3.mp4: frames 193/193 psnr_avg inf · frames_not_identical 0 · per_frame_min inf
manifest k/frames/dur: same
--- decoded ground truth
m-old-s10-def r1 (vfrom 0ms): f0000→src0 · f0001→src1 · f0002→src2
m-old-s10-def r2 (vfrom 0ms): f0001→src1 · f0002→src2
m-old-s10-def r3 (vfrom 0ms): f0001→src1 · f0002→src2
m-old-s10-def decoded-mp4 ground truth: OK
```
--- old-s10-def r1 이 새 판과 갈라지기 시작하는 프레임(f0009, 디코드 비교)
old-def vs new-def r1 decoded f0009: pixels >4: 835 bbox x 0-1076 y 236-1919
old-def vs new-def r1 decoded f0009: pixels >8: 33 bbox x 40-106 y 1208-1470
old-def vs new-def r1 decoded f0009: pixels >16: 0
max diff 16
