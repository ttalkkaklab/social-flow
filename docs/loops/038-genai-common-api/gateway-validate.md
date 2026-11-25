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
scene by scene with `planVideo(..., false)`, which neither uploads nor submits. Base is the code at f4fb5359.

| Board | Base, default call | Base, `sceneRendering:"per_shot"` | This branch |
|---|---|---|---|
| pundago ep02 (7 scenes, 26 cards) | 7 refused, `scene_inputs_unsupported` | 6 planned, 1 refused | 7 refused, `scene_inputs_unsupported`: shot ending pictures and shot-scoped character references |
| mochi_bo ep15 (6 scenes, 24 cards) | 6 refused, `scene_prompt_unsupported` | 6 planned | 6 refused, `scene_image_scope`: 30 in-shot keyframes on the cards' timelines |

Scene mode takes one opening picture per shot and scene-wide references, so these boards need re-authoring, a plugin
change that pools shot-scoped references into the scene cast, or a gateway change before they plan again. The decision
is the user's and is open as of this record.
