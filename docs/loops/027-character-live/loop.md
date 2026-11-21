# Character live streaming

Target: implement character-sheet streaming for YouTube and TikTok. Run a real unlisted Mochi & Bơ YouTube test and improve the result to at least 95/100. Inspect gateway compatibility. The operator delegated scoring and iteration count. Review in batches of five, stopping on success or an external blocker.

| Criterion | Points | Evidence |
|---|---:|---|
| Functional outcomes | 40 | 8 each for character animation with its voice, a contextual chat reply played in the stream, YouTube broadcast/ingest/chat integration, TikTok RTMPS output with a supported operator event input, and a real Mochi & Bơ YouTube broadcast with confirmed reply and closure. No substitute for platform evidence on the last item. |
| Build and contracts | 25 | Both server npm run check and skill-lint pass. |
| New regression coverage | 15 | Five each for character/media timing, platform lifecycle and chat processing. |
| Operational safety | 10 | Two each for target identity/visibility, credential redaction, bounded input, shutdown/recording, failure recovery. |
| Change scope | 10 | Only requested functionality, documentation, tests and generated distribution. |

P0: broken checks, wrong channel/visibility, leaked secret, or missing requested real YouTube broadcast. A platform blocker can leave implementation independently reviewed and the overall target unmet.

## Results through November 21, 2026

The functional rubric remains fixed. The first check failed. After the full checks passed, fresh verifiers awarded 90, 91, 91 and 92 points across iterations two through five. All four functional implementation cases passed in the fifth evaluation. The real-channel case still has zero of eight points and remains a required P0. The latest full suite passed 2,020 cases with no skips.

The owner-scoped YouTube request reached the real API and was rejected before a broadcast ID was issued. Studio recorded channel activation on November 21 at 16:29 KST. A local scheduler has the unlisted real-platform test for November 22 at 16:34 KST. Reassess the real broadcast, platform message ID, played answer and closure when that session runs. [Fifth evaluation](verify-5.md)
