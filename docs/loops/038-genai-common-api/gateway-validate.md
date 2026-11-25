# Production gateway evidence

Scene plans built by the plugin with `video_plan` (`planManagedVideo`) against the production gateway, on synthetic boards of the server test fixture (flat-colour 64x64 pictures, 1-second sine voice samples). Each plan uploaded its files and ran `POST /v1/generations/validate`; nothing was submitted for rendering and nothing was metered. Uploads are left out of the call lists.

Gateway: genai.astravision.co.kr, run 2026-11-25T08:21:52.385Z

### two speakers, three shots
- tool: astra_genai_scene; shots: s1:57, s2:56, s3:56; cast: hero+voice, guest+voice; references: none
- gateway calls (uploads omitted): GET /v1/models 200; POST /v1/generations/validate 200
- /v1/generations/validate: num_frames 169, labels {"hero.face":"Image 1","guest.face":"Image 2","hero.voice":"Audio 1","guest.voice":"Audio 2"}, warnings []
- resolved prompt equals the plan's prompt with labels filled in: true (and equals plan.sceneRequest.prompt: true)

### storyboard frames off the 8k+1 grid (167)
- tool: astra_genai_scene; shots: s1:50, s2:60, s3:57; cast: hero+voice, guest+voice; references: none
- gateway calls (uploads omitted): POST /v1/generations/validate 200
- /v1/generations/validate: num_frames 169, labels {"hero.face":"Image 1","guest.face":"Image 2","hero.voice":"Audio 1","guest.voice":"Audio 2"}, warnings []
- resolved prompt equals the plan's prompt with labels filled in: true (and equals plan.sceneRequest.prompt: true)

### every card with a timeline
- tool: astra_genai_scene; shots: s1:57, s2:56, s3:56; cast: hero+voice, guest+voice; references: none
- gateway calls (uploads omitted): POST /v1/generations/validate 200
- /v1/generations/validate: num_frames 169, labels {"hero.face":"Image 1","guest.face":"Image 2","hero.voice":"Audio 1","guest.voice":"Audio 2"}, warnings []
- resolved prompt equals the plan's prompt with labels filled in: true (and equals plan.sceneRequest.prompt: true)

### no cast picture
- tool: astra_genai_scene; shots: s1:57, s2:56, s3:56; cast: none; references: opening:object
- gateway calls (uploads omitted): POST /v1/generations/validate 200
- /v1/generations/validate: num_frames 169, labels {"opening.image":"Image 1"}, warnings []
- resolved prompt equals the plan's prompt with labels filled in: true (and equals plan.sceneRequest.prompt: true)

No render was submitted on the new path. A scene job submitted earlier the same day on the retired per-shot route (job 396df49c…) was left to the gateway after the user cancelled the test.

## Direct modes against the gateway's own schema (offline)

The direct tools' bodies were built with the plugin's builders (`buildGenaiVideoBody`, `buildGenaiAudioBody`, `buildGenaiMsrBody`) from small synthetic files and run, without a network call, through the gateway's production `VideoGeneration` model and `VideoAdapter().prepare()` (`git show origin/main` of the gateway, 2026-11-25). Every body was accepted and mapped to the legacy schema the gateway submits:

```
OK   audio2video        -> AudioVideo: allow_audio_truncation, audio_uri, fps, image_uri, keyframes, model, negative_prompt, resolution, seed
OK   image2video_frames -> ImageVideo: duration, fps, generate_audio, guidance_scale, image_uri, keyframes, last_frame_uri, model, nag_alpha, nag_scale, nag_tau, negative_prompt, reference_frames, reference_strength, references, resolution
OK   image2video_msr    -> ImageVideo: fps, generate_audio, guidance_scale, image_uri, keyframes, model, nag_alpha, nag_scale, nag_tau, num_frames, reference_frames, reference_strength, references, resolution, skip_stage_2
OK   msr                -> MsrVideo: frame_rate, guidance_scale, height, nag_alpha, nag_scale, nag_tau, negative_prompt, num_frames, reference_frames, reference_strength, references, seed, skip_stage_2, width
OK   text2video         -> TextVideo: duration, fps, generate_audio, model, resolution, seed
OK   text2video_auto    -> TextVideo: fps, generate_audio, model, resolution
```

No render was submitted on any direct mode either.

## Dry run on two boards rendered on the retired per-shot route

Scratch copies of pundago ep02 and mochi_bo ep15 (boards, cast and channel assets, settings snapshot; no video) were planned
scene by scene with `planVideo(..., false)`, which neither uploads nor submits. Base is the code at f4fb5359. The user then
chose to pool shot-scoped references into one scene cast and to leave out, and name, pictures scene mode cannot take.

| Board | Base, `sceneRendering:"per_shot"` | This branch, first dry run | This branch after pooling |
|---|---|---|---|
| pundago ep02 (7 scenes, 26 cards) | 6 planned, 1 refused | 7 refused, `scene_inputs_unsupported` | 4 `scene_prompt_too_long` (4,191 to 7,234 characters), 3 `scene_frames_exceeded` (461 to 838 frames) |
| mochi_bo ep15 (6 scenes, 24 cards) | 6 planned | 6 refused, `scene_image_scope` | 5 `scene_mode_audio_unsupported`, 1 `scene_frames_exceeded` (381 frames) |

Pundago scene 3 was also sent to the production `/v1/generations/validate` (free, no job) before the local length check
existed. The gateway refused it: `prompt_too_long`, 4,225 characters after substitution, at most 2,000 for
`ltx-2.5-22b-distilled`. `/v1/models` reports the same 2,000 for the scene prompt.

On pundago scene 3 (two shots, two people) the fixed part of the numbered prompt was about 1,190 characters: the
opening positions (242), four reference lines, two "show one character" sentences of about 280 each, the voice line and
the text-free sentence. That left about 810 characters for shot words that ran about 3,040. Those words were already the
timeline's `concise` form, and the planner's over-limit fallback did not run on this path, since its lines are bound
without `bindSceneTurns`.

### Fitting the scene prompt (user's choice, 2026-11-25)

The user chose to have the plugin fit the prompt. A scene over the cap is composed again in up to five steps: (1) each
sentence said once and a short panel sentence that keeps every `Image N` whole, (2) design notes, (3) timed acting beats
and delivery cues, (4) expressions, (5) per-shot sound, blocking, closing states, axis and continuity. Size, angle,
camera move, action and lines always stay. The plan names the steps taken (`scene_prompt_fitted`); a scene still over
at step 5 is refused before any upload (`scene_prompt_too_long`).

| Pundago scene | Before | After fitting | Production `/v1/generations/validate` |
|---|---|---|---|
| 1 (2 shots) | 6,315 | 2,935, refused | not sent |
| 2 (5 shots) | 7,234 | 2,531, refused | not sent |
| 3 (2 shots) | 4,224 | 1,817 at step 5 | accepted; resolved prompt equals the plan's |
| 5 (2 shots) | 4,191 | under 2,000 at step 5 | accepted; resolved prompt equals the plan's |

Scenes 1 and 2 stay over because their authored shot framing and action sentences are long (scene 1's first shot
action alone runs 773 characters); they need shorter shot text or a split. With the other refusals unchanged
(pundago 4, 6, 7 and mochi_bo 5 over 361 frames; mochi_bo 1 to 4 and 6 driven by a supplied soundtrack), 2 of the 13
scenes plan and validate. No render was submitted.
