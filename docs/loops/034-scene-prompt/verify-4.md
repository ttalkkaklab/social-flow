## Target Verification Report — iteration 4

### Target
The scene-to-video request path withstands adversarial testing: `video_plan` takes an authored prompt with named references, the per-shot speaker limit follows the selected model, and every tool schema is valid for the host. Exit at score >= 95 and p0 == 0, with no paid generation.

### Overall Score: 95/100

### Score Breakdown
| Criterion | Awarded | Max | Evidence | Refutation attempted |
|---|---|---|---|---|
| Functional completeness | 35 | 35 | All six capabilities held under probing (details below). | Hunted a wrong number, a rewritten sentence and a dropped input on four lanes and by name probes. None reproduced. |
| Objective gate | 20 | 20 | My run of `cd server && HOME=$(mktemp -d) npm test` exited 0 (`EXIT 0`, tests 1364, pass 1364, fail 0). | Ran it myself, not the worker's log. |
| Adversarial robustness | 15 | 20 | 20 − 5 for one defect (D1 below). About 70 distinct probes in total. | Probed text preservation, template round trips, limit edges, refusals, per-shot rendering, saved-plan staleness and the iteration-3 fix. |
| Tests cover new behavior | 10 | 10 | Capability 1: `server/test/video-routing.test.mjs:159` and `server/test/scene-prompt.test.mjs:24`. Capability 2: the same test, `planVideo({...input,prompt:compiled.promptTemplate})`, plus the FastH3 round trip near line 221. Capability 3: `scene-prompt.test.mjs:47,48,59,65,66` and `video-routing.test.mjs:174,196`. Capability 4: `video-routing.test.mjs:245-255`, `scene-video.test.mjs:459,463`, and the new two-speaker `writeShotDialogue` case in `storyboard.test.mjs`. Capability 5: `contract.test.mjs` "numeric bounds are numbers". | Reasoned about one mutation each. Each test breaks if its behavior breaks. |
| Documentation accuracy | 10 | 10 | 15 claims checked (list below). | Ran a wrap-aware search for the removed one-speaker rule using about 20 phrasings. No stale statement of it remains. |
| Surgical changes | 5 | 5 | `git diff --name-only` lists only files in the stated scope. `docs/loops/034-scene-prompt/` is untracked. | Compared every changed file with the scope list. |

### What I probed and observed
- **Iteration-3 fix.** On a plain scene, `args.prompt` alone gives `scene_video_prompt`, and `prompt` plus `args.prompt` also gives `scene_video_prompt`. A plain scene with a saved hand-written prompt and no authored prompt still reports both `Legacy prompt has no promptSource…` and `camera_move_contradicted`. An authored prompt gives `directionWarnings=[]`, including when it equals the saved prompt.
- **Preservation.** `$&`, `$1`, `$$`, a backtick, emoji, NBSP, a zero-width space, tabs, CRLF and edge white space all came back byte-identical. A reproduced `Image 1.5` stays `Image 1.5`, and the `{hero.face}.5` case yields `Image 1.5`.
- **Template round trip.**
  - It holds on MSR, image2video, FastH3 and MiniMax. The `indexed`, `picture_audio_tags` and `at_indexed` label styles also round-trip.
  - Duplicate pictures are named `a.face`, `a.face2`, `a.front` and round-trip. `Image 11` is not read as `Image 1`.
  - Embedded or lookalike text round-trips: `Image 11a`, `Subimage 1`, `image 1`, `Image  1`, `Image 01`, `{a.face}s`, `x{a.face}`.
- **Numbers against the submitted request.**
  - On MSR the references are `hero.png`, `guest.png`, `opening.png`, and `voiceContinuity` gives hero `[1]`/audio 1 and guest `[2]`/audio 2.
  - A reversed authoring order gives `Image 2 … Image 1` and `Audio 2 … Audio 1`.
  - FastH3 gives `<Picture 2> <Picture 1> … <Audio 2><Audio 1>`.
  - MiniMax gives `reference image 1/2` and `reference audio 1/2` in the order of `referenceImagePaths` and `referenceAudioPaths`.
- **Refusals, all coded:**
  - `placeholder_unresolved` for an unknown name, an unpaired brace, `{}`, `{.}`, or a `{hero.front}` that is not submitted.
  - `placeholder_unlabeled` for `{s1.image}` on a lane that sends it as a timed frame.
  - `scene_prompt_empty` for an empty prompt.
  - `scene_prompt_unsupported` for `per_shot` plus a prompt.
  - `scene_video_prompt` for `args.prompt`.
  - `prompt_too_long`: for the 117-character header, a body of 1883 passes and 1884 is refused; emoji count as two UTF-16 units.
- **Execution.** A fake-dispatch execute sends exactly the planned prompt. After a board edit the plan is refused with `video_plan_stale`. Re-planning one request id with a different prompt returns a different plan id.
- **Capability 4.** Three speakers on the MSR lane give `scene_render_voice_limit: scene 1 needs 3 pinned voices; astra_genai_msr accepts 2 per render`. The limit is read from `voice.maxPinnedVoicesPerRender` in the per-model adapter catalog.
- **Capability 5.** Built `server/dist/bundle.js` over stdio lists 152 tools, including `astra_genai_msr`, `astra_genai_img2video`, `shot_prompt` and `video_plan`. No tool schema carries a boolean `exclusiveMinimum` or `exclusiveMaximum`.
- **Built output.** I rebuilt with `tsc --outDir` into scratch. `video-routing`, `scene-prompt`, `storyboard`, `astra-genai-tools` and `tools` match `server/dist` byte for byte.

### P0 Defects
None.

### P1/P2 Findings
- **D1 (counted, −5): a plan report describes text that was not submitted.**
  - Input: a scene with `visual.video.promptSource={action:'A boat crosses the lake.'}`, `visual.camera={movement:'dolly in',speed:'slow',target:'the boat'}` and `techniques:[{id:'camera.dolly-in'}]`.
  - Plan call: `planVideo({episode, sceneNo:1, operation:'image', args:{generateAudio:false}, prompt:'A boat sits still. The camera holds.'})`.
  - Output: `args.prompt` is `A boat sits still. The camera holds.`, but `directionBindings` still lists `move … via:"prompt", instruction:"The camera slowly pushes in toward the boat…"`. It also lists `technique camera.dolly-in via:"prompt"`. `sourcePrompt` is `"Old."`, the saved board prompt, and the saved plan keeps that value.
  - The iteration-3 fix cleared `directionWarnings` for this case but left these two fields, so they claim the camera reached the prompt when it did not.
  - Location: `directionOf` and the `compiled` branch in `server/src/video-routing.ts`, near lines 796-810.
- Not counted: a non-string `prompt` returns a raw Zod array instead of a coded refusal. A trailing-white-space prompt that fits only after the adapter trims is refused as `prompt_too_long`. A fixture mismatch (`scene_video_timing`) kept me from probing FastH3 with three speakers, and `Unsupported fasth3_omni_reference argument: reserveUsd` arose only because I passed `reserveUsd` there.

### Documentation claims checked (15), all matching the code
1. `promptTemplate` is returned on every plan rendered in one request.
2. Nothing in the text is reworded, and white space is kept.
3. Braces are refused unless they are a name or in the board's own text.
4. A spoken line keeps its braces.
5. The listed refusal codes match the code.
6. The model limit is counted after names are filled in.
7. The header counts toward the limit on the LTX lanes.
8. `per_shot` returns no template.
9. The trimming adapters named in the docs are real (MSR, audio-to-video, Desktop, Veo schemas).
10. A second picture of the same role ends in `2`.
11. `{castId.image}` works for a single picture.
12. A cast id equal to a shot id keeps only one name.
13. "Camera direction is not read from an authored prompt" matches the code.
14. The limit is reported as `scene_render_voice_limit`.
15. `README.md` and `skills/_shared/video-routing.md` say a shot keeps every line spoken in its view.

The removed-rule search turned up only the legacy `skills/produce/references/check-tts-quality.js:49` error ("one speaker per scene"). It states a per-scene TTS-proof rule that is not part of this feature.

### Fix Directives for Next Iteration
1. In `server/src/video-routing.ts`, when `replaced` is true and the scene has `promptSource`, stop returning the compiled `directionBindings` as `via:"prompt"`. Either drop the `move` and `technique` bindings or label them `via:"not_sent"`, and set `sourcePrompt` to the authored text. Add one assertion to the existing "planning compiles camera direction…" case. This unlocks +5 robustness.
2. Make a non-string `prompt` return a coded refusal such as `scene_prompt_empty` or `prompt_refused` instead of a raw schema array (optional, not scored).

### Recommendations
- Keep `check-tts-quality.js:49` out of the target scope, but note it still says "one speaker per scene" for the older TTS-proof route.
- The rubric is fine as written.

ASTRA_LOOP_RESULT: score=95 verdict=PASS p0=0 iter=4
