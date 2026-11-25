## Target Verification Report — iteration 2

### Target
The scene-to-video path withstands adversarial testing: `video_plan` takes an authored prompt with named references, the per-shot speaker limit follows the selected model, and every tool schema is valid for the host. Exit at score ≥ 95 with p0 == 0. No paid generation.

### Overall Score: 91/100

### Score Breakdown
| Criterion | Awarded | Max | Evidence | Refutation attempted |
|---|---|---|---|---|
| Functional completeness | 29 | 35 | Capabilities 1–5 held under my probes. Capability 6 fails on a stale sentence at `skills/storyboard/SKILL.md:19`. 35×5/6 = 29. | Probes on six lanes plus the built server's tool list. |
| Objective gate | 20 | 20 | My own `cd server && HOME=$(mktemp -d) npm test` ended with `EXIT 0`. | None; the exit code is the evidence. |
| Adversarial robustness | 20 | 20 | About 50 distinct probes, none reproduced a defect I could count. | Details below. |
| Tests cover new behavior | 10 | 10 | Capabilities 1–5 each have a test that would fail if the behavior broke. | Mutation reasoning per capability, below. |
| Documentation accuracy | 7 | 10 | 12 claims checked, one false. | See the stale sentence below. |
| Surgical changes | 5 | 5 | All 31 changed files are in the declared scope. `server/dist` is newer than `src` (23:43 against 23:39). | Checked `git diff --name-only`. |

### Iteration-1 findings re-tested
- **Prompt trimming:** fixed. `video-routing.ts:927` restores the author's text after the adapter schema parses it. The plan keeps edge white space on the MSR, A2V and Veo lanes, and the documented trimming (MSR, audio-to-video, Desktop, LTX Desktop, Veo) matches the `.trim()` calls in the schemas.
- **Braces in quoted dialogue:** fixed. A brace the board itself puts in a line is kept. Any other brace is refused with `placeholder_unresolved`, and `tools.ts`, `SKILL.md` and `CLAUDE.md` now say so.
- **Stale one-speaker sentences:** the two named in iteration 1 are fixed (`skills/produce/SKILL.md:12`, `voice-continuity.md`). A third survives at `skills/storyboard/SKILL.md:19`; see below.
- **`Image 1.5`:** fixed. It round-trips, and the label pattern excludes `Image 10`, `Image 1.5` and `KeyImage 1`.
- **Two-speaker `shot_dialogue` write:** now covered by `server/test/storyboard.test.mjs`, which writes two speakers and asserts `['mina','narrator']`.

### What I probed
- **MSR lane:** `$&`, `$1`, `` $` `` and `$'` stay literal. Emoji, `“”` and `「」` quotes, CRLF and tabs are preserved. Hyphenated ids, and a cast id equal to a shot id (`s1`), resolve correctly.
- **Reversed cast order:** with a cast of guest then hero, the prompt gets `Image 2 Audio 2 Image 1 Audio 1` for hero then guest. `voiceContinuity.speakers[].imageIndices` and `audioIndex` agree with it.
- **Refusals:**
  - Refused with a code: `{ hero.face }`, `{{x}}`, unmatched `{`, `{Hero.face}`, `{hero.torso}`, `{guest.image2}`, a brace split by a newline, an empty prompt, 32001 characters, per-shot rendering, and `prompt` together with `args.prompt` (`scene_video_prompt`).
  - Accepted, no refusal: `{hero.face}.5`.
- **Limit edge:** the largest accepted body is 1883 characters (117-character header plus 1883 = 2000). It is the same with 1883 emoji. The A2V lane stops at exactly 2000.
- **Template round trip:** the template returns the identical provider prompt and no issues on MSR, img2video (one and two speakers, both cast orders), FastH3, Seedance, MiniMax, A2V and Veo. The "Image 1" inside a quoted spoken line survives.
- **Per-shot plans:** they return no `promptTemplate`, and an authored prompt on them is refused with `scene_prompt_unsupported`.
- **Staleness:** after a board edit, `f.execute` throws `video_plan_stale`. Replanning an authored prompt then reports `line_missing` for the changed line.
- **Header:** an author text that starts with the header does not duplicate it.
- **Adapter refusals:** a Seedance authored prompt with no `Video 1` returns `prompt_refused:`. Veo returns `video_prompt_language`.
- **Capability 5:** over stdio, the built `dist/bundle.js` lists 152 tools with no boolean `exclusiveMinimum` or `exclusiveMaximum`. `astra_genai_msr`, `astra_genai_img2video`, `shot_prompt` and `video_plan` are all present.

### P0 Defects
1. **Capability 6, the docs contradict the code.** `skills/storyboard/SKILL.md:19-20` still says "split at every speaker change without making every new speaker the picture's subject". The same file at line 532 says "A speaker change alone does not require a cut", and `dialogue-coverage.md:17` says "not at every speaker change". `writeShotDialogue` no longer refuses a second speaker. This is the same class of defect as iteration 1.

### P1/P2 Findings
1. **P2: raw zod error on a non-string `prompt`.** `ROUTES.video_plan({prompt:5})` throws a raw zod issue array rather than a coded line. The host's schema validation should normally catch this first, and other tools behave the same way, so I did not count it.
2. **P2: the limit counts edge white space.** The planner measures the untrimmed prompt. For adapters that trim at send (for example, a prompt of 1883 characters plus trailing spaces), it can refuse text the adapter would accept. The docs say only "over the model limit".
3. **P2: a cast id equal to a shot id.** For example, a cast member `s1` with a single picture has `{s1.image}` resolve to the shot image, and the cast picture is reachable only as `{s1.face}`. This is consistent, but undocumented.

### Fix Directives
1. In `skills/storyboard/SKILL.md:19-20`, replace "split at every speaker change without making every new speaker the picture's subject" with the model-capacity wording, for example "cut where the staging or the model's pinned-voice capacity calls for it, not at every speaker change". This unlocks capability 6 (+6 points) and documentation accuracy (+3 points), so +9 in all, which reaches the 95 threshold at 100.
2. Optional: say in the `SKILL.md` section "Writing the prompt yourself" that the character limit counts white space at the edges.

### Recommendations
- Rerun `rg -i "speaker change|every speaker|one speaker"` over `skills/` after the fix. The remaining hits I read were consistent: `skills/produce/SKILL.md:778`, `shot-speech.md:61`, `dialogue-coverage.md:17`.
- No rubric disagreements.

ASTRA_LOOP_RESULT: score=91 verdict=FAIL p0=1 iter=2
