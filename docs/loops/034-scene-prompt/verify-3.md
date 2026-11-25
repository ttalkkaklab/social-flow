## Target Verification Report — iteration 3

### Target
The scene-to-video path withstands adversarial testing. `video_plan` takes an authored prompt with named references, the per-shot speaker limit follows the selected model, and every tool schema is valid for the host. No paid generation.

### Overall Score: 95/100

### Score Breakdown
| Criterion | Awarded | Max | Evidence | Refutation attempted |
|---|---|---|---|---|
| Functional completeness | 35 | 35 | All six capabilities verified, details below | 14 lane and case probes; none produced a wrong number or a reworded sentence |
| Objective gate | 20 | 20 | My own `cd server && HOME=$(mktemp -d) npm test` exited `EXIT=0`, `fail 0` (log in my scratchpad `verify3/gate.log`) | none needed |
| Adversarial robustness | 15 | 20 | 30+ probes; one defect reproduced (D1 below) | -5 for D1 |
| Tests cover new behavior | 10 | 10 | Capabilities 1–5 each have a failing-on-break test (listed below) | Reasoned one mutation per capability |
| Documentation accuracy | 10 | 10 | 17 claims checked against code or probes; none false | Wrap-aware search for the removed one-speaker rule |
| Surgical changes | 5 | 5 | Every `git diff --name-only` file is in the stated scope | none |

### Capability evidence
1. **Numbers and untouched text**
   - On MSR, text with `$& $1 $$ $\` $'`, emoji, CRLF, tabs and leading or trailing white space came back unchanged apart from the filled names.
   - A cast order different from the prompt order (`{guest.face}` before `{hero.face}`) gave `Image 2 … Image 1`. That matches `args.references` and `voiceContinuity.speakers[].imageIndices` and `audioIndex`.
   - FastH3 gave `<Picture n>` and `<Audio n>` with the right numbers. MiniMax gave `reference image n` and `reference audio n`.
   - Seedance gave `{s2.image}` → `Image 4` and `{s1.image}` → `Image 5`, matching `referenceImagePaths`.
2. **Template round trip**
   - The template reproduced the identical prompt with no issues on MSR, FastH3, MiniMax, Seedance, Veo, default (`seedance_img2video`) and a directionless scene.
   - It also held on a board whose action or dialogue contains `{brace}`, `Image 1`, `Image 10`, `Image 1.5`, `<Picture 2>`, `@Image 2`, an unbalanced quote, curly quotes, a newline in dialogue, or `$&`.
3. **Codes**
   - Refused with a code: `placeholder_unresolved` for an unknown name, a lone brace, `{}`, `{{x}}`, a wrong case, or `a.b.c`.
   - Also refused with a code: `placeholder_unlabeled`, `scene_prompt_empty`, `scene_prompt_unsupported`, `scene_video_prompt` for `prompt` plus `args.prompt`, and `prompt_refused` (Seedance, for the missing `Video 1`).
   - `prompt_too_long` is exact at the limit: 2000 characters passes and 2001 is refused, with the 117-character header counted. Emoji count as one character each, and the 32000 cap gives a coded error.
   - `label_literal`, `reference_unmentioned`, `line_missing` and `text_policy_missing` were reported as warnings.
   - `video_voiceover_embedded` fires for an authored prompt on a voiceover board.
4. **Speaker limit**
   - Three speakers in one MSR or img2video shot gave `scene_render_voice_limit … accepts 2`.
   - The same 3-speaker card is also refused under `per_shot`.
   - `shot_speaker_limit` is gone from src and dist.
5. **Schemas**
   - I spawned `server/dist/bundle.js` over stdio. `tools/list` returned 152 tools, including `astra_genai_msr`, `astra_genai_img2video`, `shot_prompt` and `video_plan`.
   - Zero tools carry a boolean `exclusiveMinimum` or `exclusiveMaximum`.
6. **Docs.** The tool description, `skills/generate-cut-videos/SKILL.md`, `CLAUDE.md` and `README.md` match the code, including the sentences changed since iteration 2.

### Re-tested findings of iterations 1 and 2
- The white space of the author's text is preserved in the plan and in the fake-dispatch args. `buildGenaiVideoBody` keeps it too. The `.trim()` in `astra-genai-video.ts` (lines 212 and 245) applies at the real send, as the docs say.
- Braces inside quoted dialogue are kept when they are the board's own. An unknown `{zzz}` in quotes is refused, and the docs state that.
- A two-speaker `shot_dialogue` write passes. The test is at `storyboard.test.mjs`, in the diff hunk at line 480.
- `Image 1.5` no longer becomes `{x.face}.5`; the round trip holds.
- A wrap-aware search of all docs for the removed rule found no remaining stale sentence. `skills/storyboard/SKILL.md:21` and `:534` now say a speaker change alone needs no cut. The matches in `dialogue-coverage.md`, `scenes-schema.md`, `shot-boundaries.md`, `evals.md`, `film-techniques.js` and the other changed docs are consistent with the new rule.
- A cast id equal to a shot id: the first keeps `{id.image}`, and the doc now says so in `skills/generate-cut-videos/SKILL.md`.
- The iteration-3 change in `scenePromptSlots` (the short name `{castId.image}` never takes a shot's own picture name) behaves as written. In the probe with cast `s1` and `s1` as the opening shot, `{s1.image}` names the opening.

### P0 Defects
None.

### P1/P2 Findings
- **D1 (P2, counted -5): spurious camera warning on an authored prompt.**
  - Setup: a directionless scene (the `fixture(t)` scene, no `videoDirection`) with saved `visual.video.prompt:'A boat crosses a lake.'` and `camera.movement:'dolly in'`.
  - Input: `planVideo({operation:'image',args:{generateAudio:false},prompt:'A boat crosses a lake. The camera pushes in slowly toward the boat. Silent picture.'})`.
  - Output: `directionWarnings` carries `camera_move_missing: the saved prompt omits the planned move…` and "Legacy prompt has no promptSource…". The authored prompt does contain the push-in, and the saved prompt is not sent.
  - Cause: `server/src/video-routing.ts:795-796` computes `rawPrompt = input.args.prompt ?? video?.prompt` and `cameraDrift` ignores `input.prompt`.
  - It reports on text that is not submitted. The docs say camera direction is not read from an authored prompt.
- P2: a non-string `prompt` (for example `5`) returns a raw Zod JSON dump instead of a coded error. A compliant host never sends it, because the input schema says `type:string`.
- P2: a non-Latin cast id fails `video_prompt_language` while composing the plan. This is the existing English-only rule, outside this feature.
- P2 (unchanged): the limit counts white space at the ends of the text, and the docs state this.
- P2: `skills/produce/references/check-tts-quality.js:49` still throws "Character speech needs one speaker per scene". It is a legacy checker, not part of the plan path.
- `label_literal` also fires for `Image 1` in the exact text `@Image 1`, because only a letter or digit before it blocks the match. That is harmless as a warning.

### Fix Directives
1. `server/src/video-routing.ts:795-796`: when `authored`, skip `cameraDrift` and the "Legacy prompt…" warning, or run `cameraDrift` on `input.prompt`. Rebuild dist and add one case to `video-routing.test.mjs`. This restores 5 points in robustness.
2. Optional: have the `video_plan` route return a coded `prompt_invalid` for a non-string `prompt` instead of the Zod dump.

### Tests per capability
- 1: `video-routing.test.mjs:171-179, 228-229` (exact string and `args.references` order).
- 2: `:164-169, 218, 227`, plus `:201-203` for braces.
- 3: `:191-197, 215`, plus `scene-prompt.test.mjs:59, 65-66` for `label_literal`, `line_missing` and `text_policy_missing`.
- 4: `:244-257` for `scene_render_voice_limit`, plus the `storyboard.test.mjs` two-speaker write.
- 5: the new `contract.test.mjs` case "numeric bounds are numbers". Reverting `openingPositionsProperty` to the openApi3 target would fail it.

### Recommendations
- The 95 here is exactly at the user's threshold, and the one reproduced defect (D1) is cheap to fix.
- Your iteration-2 P2 list is otherwise unchanged and acceptable.

ASTRA_LOOP_RESULT: score=95 verdict=PASS p0=0 iter=3
