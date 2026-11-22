# Configuration and costs

The project settings file, `.social-flow/models.json`, records your channel, genre, languages, models, visual style, format, generated-video share and target accounts. Use `project-init` to set or change defaults. An episode keeps its own snapshot in `.work/model-settings.json`, so you can finish it after changing the defaults for future episodes. [Settings reference](../skills/project-init/references/settings.md)

## Choose the services you intend to use

Use `project_manage` with action `options` to see setup choices. Ask for `capability_status` in the running session to see the credentials and local installations the server detects. The available operations depend on the selected model, host, credentials and local software.

| Task | Example configuration |
| --- | --- |
| Research | SerpApi uses `SERPAPI_API_KEY`. Naver uses `NAVER_CLIENT_ID` and `NAVER_CLIENT_SECRET`. |
| Images | The project can use a configured image provider, a supported host tool or a local engine. A generated image that needs readable text uses GPT Image 2. The OpenAI adapter reads `OPENAI_API_KEY`. |
| Video | Hosted LTX uses `LTX_API_KEY`. Google Cloud Veo uses a billing project and Google Cloud credentials. For LTX Desktop on the plugin host, select `ltx-desktop-local` and query `video_catalog` for its downloaded models. The MLX adapter uses a separate model server and pack. |
| Speech and music | Gemini uses `GEMINI_API_KEY` or `GOOGLE_API_KEY`. ElevenLabs uses `ELEVENLABS_API_KEY`. Choose no separate TTS or no new music when appropriate. |
| ASTRA GenAI | Configure the gateway URL and key visible to the MCP server. Image and speech can have separate URL/key pairs. Check available model aliases with `astra_genai_catalog`. |
| Publishing | Credentials belong to the target channel. Account setup and publishing are separate steps. [Publishing](publishing.md) |

The repository includes a [variable list](../.env.example), [model selection guide](../skills/_shared/model-settings.md) and [video adapter reference](../skills/_shared/video-routing.md).

## Supply credentials to the server

A local server can inherit variables from its host. It also reads `~/.config/social-flow/.env`, or `.env` inside the directory named by `SNS_TOKEN_DIR`. A nonempty environment value takes precedence. Use a private editor to enter only the variables your selected providers require.

```sh
mkdir -p ~/.config/social-flow
chmod 700 ~/.config/social-flow
touch ~/.config/social-flow/.env
chmod 600 ~/.config/social-flow/.env
```

Keep keys out of the project settings, storyboard, prompts and issue reports. After changing variables, reconnect the MCP server or start a fresh host session. Check the configuration from that session. For ASTRA, inspect the catalog for the media type you selected. A key in a terminal alone does not establish which endpoint a running host uses.

## Budget an episode

The generated-video share counts **shots**. For example, `video_50` targets 50% to under 80% generated shots and `no_video` targets zero. Still images, speech and music can each have their own provider costs. An episode with no generated video can still include these assets.

Set an optional `episodeBudgetUsd` at project setup. Review the estimate for the episode, including possible retries, before authorizing generation. A configured cap limits spend. After a run, inspect `output/video/cost-report.txt` and the saved generation receipts. The provider's billing record gives the final charge.

For assembly, install FFmpeg (including FFprobe), Python 3 and Google Chrome for headless capture. Blender supports 3D location and composition work. Local transcription and local image or video models have their own runtime requirements. [Requirements](../README.md#requirements) · [Local LTX runbook](mlx-ltx-2.5.md)
