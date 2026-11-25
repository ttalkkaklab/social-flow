## Target Verification Report — iteration 1

### Target
The scene-to-video request path (`video_plan` authored prompt with named references, model-rule speaker limit, tool schema validity) withstands adversarial testing. Exit at score >= 95 with p0 == 0, and no paid generation.

### Overall Score: 76/100

### Score Breakdown
| Criterion | Awarded | Max | Evidence | Refutation attempted |
|---|---|---|---|---|
| Functional completeness | 29 | 35 | Capabilities 1–5 hold (5/6 × 35). Capability 6 fails: the docs contradict the code in two places (see P0). | Probed Image 1 against Image 10, `$&`/`$1`, `{…}` in dialogue, a cast id equal to a shot id, round trips on the img2video, MSR and H3 lanes, and a third speaker. |
| Objective gate | 20 | 20 | `HOME=$(mktemp -d) npm test` exited 0 on my own run (`gate.txt`). | None needed. |
| Adversarial robustness | 10 | 20 | 12 probes run, 2 defects reproduced (D1 and D2 below). No provider call was made. | See the defect list. |
| Tests cover the new behavior | 8 | 10 | `server/test/scene-prompt.test.mjs`, `video-routing.test.mjs:159-212`, and `contract.test.mjs` ('numeric bounds are numbers'). The cap-4 change only deleted a throw and a test line (`storyboard.test.mjs`). | I found no case where a two-speaker `shot_dialogue` write passes. |
| Documentation accuracy | 4 | 10 | Two false claims (D3, D4); the other claims I checked hold. | Checked 8 claims against code. |
| Surgical changes | 5 | 5 | `git diff --name-only` lists 28 files, all in scope. | None. |

The authored prompt resolved correctly in every pure-function and planner probe.
- `Image 10` was not read as `Image 1`.
- `$&`, `$1` and `$$` came through intact.
- The 😀 character-count limit held at exactly 12 and failed at 13 (`prompt_too_long`).
- A template sent back through `prompt` gives an identical provider prompt and no issues on the img2video, MSR and H3 lanes.
- A cast id equal to a shot id (`s1`) kept `{s1.face}` and `{s1.image}` distinct.
- A third speaker on the two-voice model gives `scene_render_voice_limit: scene 1 needs 3 pinned voices; astra_genai_msr accepts 2 per render`.
- `tools/list` from `dist/bundle.js` returns 152 tools with zero boolean `exclusiveMinimum` or `exclusiveMaximum`, and `astra_genai_msr`, `astra_genai_img2video`, `shot_prompt` and `video_plan` are all present.
- The execute path sent the authored prompt, and `args.prompt` / `sceneRequest.prompt` matched.

### P0 Defects
1. Capability 6 fails because the docs contradict the code. `skills/produce/SKILL.md:12` still says "MSR physical dialogue has one speaker per shot, including explicit off_screen delivery". The unchanged `skills/produce/references/voice-continuity.md:133` says the same. Both contradict capability 4 and the new `CLAUDE.md` section "Dialogue coverage" ("`shot_dialogue` no longer refuses a second speaker").

### P1/P2 Findings
- D1 (P1, robustness): the schema trims the prompt, but the docs say it is never trimmed.
  - Probe: `video_plan {prompt:'{hero.face}  \n\n  says   "You came."  '}`.
  - Observed: the two trailing spaces are gone from the provider prompt.
  - Expected: the text unchanged. `tools.ts` says "sentences are never rewritten or trimmed", and `SKILL.md` says "no sentence is rewritten, added or trimmed".
  - Cause: `.trim()` in `videoPlanSchema` at `server/src/video-routing.ts` (the `prompt:` line).
- D2 (P1, robustness): braces in quoted dialogue are refused, and no doc says so.
  - Probe: `{hero.face} says "I {sigh} now." {hero.voice}`.
  - Observed: `placeholder_unresolved: {sigh} is not a reference name`.
  - Neither the tool description nor `SKILL.md` lists this as a refusal. They say only "a name with no submitted reference". The code comment ("Braces have no other use") is the only statement of it. See `resolveScenePrompt`'s stray-brace loop in `server/src/scene-prompt.ts`.
- D3 (P2, docs): the "never trimmed" claim above, in `server/src/tools.ts` (the `prompt` description) and `skills/generate-cut-videos/SKILL.md`.
- D4 (P2, docs): the stale one-speaker sentences, in `skills/produce/SKILL.md:12` and `skills/produce/references/voice-continuity.md:133`.
- P2: `Image 1.5` is templated to `{x.face}.5`. It round-trips, but the template is misleading.
- P2: the cap-4 deletion in `storyboard.ts` has no positive test for a two-speaker write.

### Fix Directives
1. `server/src/video-routing.ts`, `videoPlanSchema`: remove `.trim()` from `prompt` and keep `.min(1)`. Add a refine that rejects a whitespace-only prompt. Add one test with leading and trailing whitespace. Unlocks robustness +5 and removes the false claim.
2. `skills/produce/SKILL.md:12` and `skills/produce/references/voice-continuity.md:133`: replace "one speaker per shot" with the model-capacity wording (two pinned voices per MSR render, `scene_render_voice_limit`). Unlocks the capability 6 P0 and +3 to +6 on docs.
3. Document the stray-brace refusal in the tool description, `SKILL.md` and `CLAUDE.md`: "Braces other than a reference name are refused as `placeholder_unresolved`". Or change the code to leave braces inside quotation marks alone. Unlocks robustness +5.
4. `server/test/storyboard.test.mjs`: add one case where `shot_dialogue` accepts two speakers in one shot. Unlocks tests +2.
5. Rebuild `server/dist` after any `src` change and rerun the gate.

### Recommendations
- Rubric: capability 6 is marked P0 through the functional criterion, but the rubric never says what counts as a "doc claim". I counted the stale lines as in scope because `skills/produce/SKILL.md` is in the changed set.

ASTRA_LOOP_RESULT: score=76 verdict=FAIL p0=1 iter=1
