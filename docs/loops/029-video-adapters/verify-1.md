# Independent review 1

| Criterion | Score |
| --- | ---: |
| Common call and automatic selection | 31/35 |
| Schema mapping and input preservation | 25/30 |
| Tests and lint | 25/25 |
| Structure and compatibility | 8/10 |

A ready board with one legacy `visual.video.referenceImagePaths` entry selected `veo_reference` but lost its image on a direct shot call. The same scene failed frame validation without an explicit frame rate and passed at 24 fps. A structured reference passed in all three cases.

ASTRA_LOOP_RESULT: score=89 verdict=FAIL p0=1 iter=1
