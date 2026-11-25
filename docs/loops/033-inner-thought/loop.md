# Inner thought delivery

A character's private line belongs to their timed external voice. The moving picture carries the authored gesture and the other actor's ongoing action. Preserve physical dialogue in nearby shots, including speech delivered off screen.

Runway recommends describing observable actions, gestures and expressions in the image-to-video prompt. Google's Veo guide shows how scripted dialogue can drive synchronized audio. Social Flow uses those two observations to choose where each part of a thought goes. [Runway prompting guide](https://help.runwayml.com/hc/en-us/articles/39789879462419-Gen-4-Video-Prompting-Guide) · [Google's Veo prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)

For example, give the character's voice track the exact line “He kept the key.” Give the video model “Her thumb pauses on the empty hook. Across the table, he keeps folding the newspaper.” If she then asks for the key aloud, author that question as a spoken turn.

| Criterion | Points | Evidence |
|---|---:|---|
| Picture prompt | 35 | Inspect shot compilation, scene descriptions and the outgoing request for private words, vocal cues and implied speaking or listening. |
| Speech and routing | 25 | Trace the thinking character's external TTS, physical dialogue ownership, supported mixed cuts and unsupported input handling. |
| Authoring and compatibility | 20 | Exercise the optional designation, edits, storyboard display and older unmarked lines. |
| Regression coverage | 15 | Build the installable bundle and pass the server suite and skill lint. Verify the provider request with a capture. |
| Scope and maintainability | 5 | Keep the existing data and generation paths and limit changes to the feature. |

Accept at 95/100 or higher with both commands passing and no critical defect. Treat a reproducible private line sent as physical dialogue, lost authored speech, or an invalid media binding as critical. Use a fresh read-only reviewer for each scoring round. Review local implementation and contracts. Live model performance requires a separate media run.

## Result

Round 16 reached **97/100 with zero critical defects**. The server suite passed all 1,339 tests. Skill lint passed all 17 rules across 35 skills. [Final independent review](verify-16.md)

| Round | Score | Critical defects | Main finding |
|---:|---:|---:|---|
| [1](verify-1.md) | 72 | 2 | Copied script, mixed audio and stale source ownership |
| [2](verify-2.md) | 86 | 3 | Unquoted directions, archived shot identity and performance reuse |
| [3](verify-3.md) | 91 | 1 | Short replies and words shared with visual actions |
| [4](verify-4.md) | 89 | 1 | Smart punctuation and generated subtitle instructions |
| [5](verify-5.md) | 88 | 1 | Attributed speech with intervening words and longer object names |
| [6](verify-6.md) | 88 | 1 | Attribution following dialogue and observed motion |
| [7](verify-7.md) | 89 | 1 | Singing, mouthing and unrelated action clauses |
| [8](verify-8.md) | 89 | 1 | Mouth instructions and grammatical subjects |
| [9](verify-9.md) | 89 | 1 | A legacy scene with a whisper stored in the picture description |
| [10](verify-10.md) | 90 | 1 | Punctuation and previously spoken words in a sealed request |
| [11](verify-11.md) | 90 | 1 | A global direction and image cue applicable to a private shot |
| [12](verify-12.md) | 86 | 1 | Explicit talking and an adjacent audible repetition |
| [13](verify-13.md) | 90 | 1 | A remux of an overlapping native performance |
| [14](verify-14.md) | 91 | 1 | Private onset missing from the composed WAV |
| [15](verify-15.md) | 91 | 1 | A render-only external cue differed from the mixer clock |
| [16](verify-16.md) | 97 | 0 | Passed with a recoverable authoring false positive |
