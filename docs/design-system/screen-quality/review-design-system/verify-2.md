## Screen Quality Report — iteration 2 (app)

Overall score: 54/100 · threshold (user) 95 · P0 1 · verdict FAIL
(The first run of this iteration ended on an API connection error; this is the re-run.)

| Criterion | Awarded | Max |
|---|---|---|
| A1 Token-only | 0 | 12 |
| A2 Components | 4 | 8 |
| A3 Dark & responsive | 4 | 8 |
| A4 Type/spacing | 3 | 7 |
| B1 Shell parity | 5 | 10 |
| B2 Rhythm | 4 | 8 |
| B3 Navigation | 6 | 6 |
| B4 Interaction | 3 | 6 |
| C1 Anti-AI | 4 | 10 |
| C2 States | 6 | 9 |
| C3 Hierarchy | 5 | 8 |
| C4 Accessibility | 6 | 8 |

P0: A1 — literal px for radius/padding/margin/gap/inset and an 11px font size in review.css; #000 in a mask.

Fix directives: tokenise radius/spacing px; replace #000; 11px → --ds-text-micro; unify thumb focus with the global ring; reuse primitives instead of character-* card copies; add active/disabled/loading; read screenshots for B1/C1/C3.

ASTRA_SCREEN_RESULT: score=54 verdict=FAIL p0=1 iter=2
