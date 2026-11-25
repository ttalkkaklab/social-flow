# Round 1 → round 2

Round 1 scored 90 with no P0 (`verify-1.md`). All ten missing points were criterion 6.

What round 2 changed:

- `server/src/tools.ts:1070`: the MCP server instructions no longer describe the removed per-shot mode. They say the GenAI scene is one scene-mode request whose names the gateway numbers.
- The per-shot receipt label now has one definition, `PER_SHOT_SCENE_OPERATION` in `skills/_shared/scene-speech-receipt.js`, exported beside `perShotSceneOperation`. The tests that build receipts of old per-shot clips (`speech.test.mjs`, `tts-quality.test.mjs`, `video-routing.test.mjs`) import it instead of repeating the string. The support itself stays: clips the retired route made exist in the user's workspaces (pundago ep02, mochi_bo ep15 on 2026-11-25), and their speech bindings and assembly are still verified from their archived requests. Splitting the string to slip past a grep was suggested and not done.
- The retired-mode tests use `single_msr` and `auto`, both real retired values, since the stale-plan guard refuses any saved `sceneRendering` value.

Not done, with the reason:

- `X-Request-Id` on the direct text, image, audio and MSR submits. The gateway's `create_generation` passes the header only to scene mode (`generations.py`), so a header on the other modes would not make their recovery possible. A lost response there stays "identity unknown", which never renders twice.
- `speech_manage` still plans a GenAI dev-model shot as `audio_conditioned`. The direct `astra_genai_audio2video` tool renders that mode through the common API, and a clip made with it is still attached through `speech_manage`; only `video_plan` refuses such a scene.

Gate after the changes: `npm run build` exit 0, `HOME=$(mktemp -d) npm test` exit 0 with 1413 of 1413 passing.

Files touched in round 2: `server/src/tools.ts`, `skills/_shared/scene-speech-receipt.js`, `server/test/speech.test.mjs`, `server/test/tts-quality.test.mjs`, `server/test/video-routing.test.mjs`, rebuilt `server/dist`, this directory.
