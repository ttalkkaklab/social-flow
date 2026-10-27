# Independent adversarial review — iteration 3

Reviewer: /root/sound_verifier_3, fresh context, read-only.
Score 87/100 — FAIL, 1 P0, 1 P1. Check5 pending at review time.

| Criterion | Score |
|---|---:|
| Model/mode correctness | 25/30 |
| Production and assembly | 24/30 |
| Regression | 18/20 |
| Installed delivery | 20/20 |

P0: ASTRA keyframe preparation inserts generateAudio=false when not authored and
skips planning for explicit audioSource=video with effects=[]. The request silently
turns off audio; auto/native effects instead reject the synthetic false as explicit.
Reproduced through real prepare() in astra-shot-input-v6pL53 temporary fixture.
Fix: distinguish defaults from explicit flags; plan explicit ownership with empty
lists; add preparation-level keyframe tests.

P1: video-to-speech transition after compositor changes the WAV path preserves
owned sync=1 and discards restoration receipts. Reproduced in
astra-shot-input-DHXd1y; no demonstrated audio loss. Restore owned flags while
preserving newly composed audio, and test this transition.

Previous silent-source and unmanaged-manifest P0 fixes pass independent tests.
Four sound tests and skill-lint pass. Six critical installed files match all three
isolated roots. No provider perceptual review claimed.

ASTRA_LOOP_RESULT: score=87 verdict=FAIL p0=1 iter=3
