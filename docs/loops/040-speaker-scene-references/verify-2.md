# Verification, iteration 2

Reviewer: loop-verifier (fresh context), final tree c25b0e32. Full suite exit 0 (1480 tests).

| Criterion | Awarded | Max |
|---|---:|---:|
| C1 split counts natively voiced speakers only | 8 | 8 |
| C2 request sends only speakers' pictures and names omitted ones | 8 | 8 |
| C3 freed slots keep H3 shot pictures and LTX object references | 8 | 8 |
| C4 defaults, larger override, LTX grid, H3 step budget | 8 | 8 |
| C5 H3 two pinned voices in schema and catalog | 8 | 8 |
| Objective gate | 25 | 25 |
| Tests cover the new behavior | 15 | 15 |
| Documentation consistency | 9 | 10 |
| No unrelated edits | 10 | 10 |

Refutation targets checked: the H3 step advice and the setup guidance both give 18 steps at 736x1280 / 345 frames, with the default of 50 flagged; the split and the sent cast agree for off-screen-only scenes, voice-only speakers, audio-conditioned scenes and legacy per-shot clips; engines other than astra-genai keep their declared references.

P0: none. P2 wording findings, fixed after the review: the `h3_step_budget` message now says the 18-step ceiling counts loading and decoding; `docs/video-models.md` names the standalone MSR adapter's two-character limit apart from the GenAI speaker rule.

ASTRA_LOOP_RESULT: score=98 verdict=PASS p0=0 iter=2
