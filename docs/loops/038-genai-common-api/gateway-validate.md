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
