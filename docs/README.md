# social-flow user manual

social-flow helps you run a video channel from a local folder. You work with a coding assistant to plan episodes, review shots, assemble videos and publish to the accounts you choose. A channel keeps its cast, voice choices and visual style across episodes.

Start with [Getting started](getting-started.md). The first exercise sets up a channel and gives you a synopsis to review before you spend money on episode media.

| What you want to do | Where to start |
| --- | --- |
| Install the plugin and check that its tools loaded | [Getting started](getting-started.md) |
| Choose models, configure keys and set a budget | [Configuration and costs](configuration.md) |
| Turn a synopsis into a storyboard, then a finished video | [Making an episode](making-an-episode.md) |
| Connect a channel, check its cover and publish | [Publishing](publishing.md) |
| Find a missing tool or recover an interrupted job | [Troubleshooting](troubleshooting.md) |

See a finished episode made with social-flow. [Watch Mochi & Bơ, episode 12](https://www.youtube.com/shorts/cO9SNY7vQRs)

## Other ways to work

- **Use your own footage.** Start with a recorded walkthrough. The ingest skill builds a timestamped timeline from the recording and transcript for the storyboard. [Screen recording workflow](../skills/ingest/SKILL.md)
- **Make a targeted change.** Ask for a particular line to be re-recorded or a single cut to be inspected. Include the channel, episode and shot so the assistant can find the existing material. [Speech editing](../skills/edit-speech/SKILL.md) · [Content inspection](../skills/inspect-content/SKILL.md)
- **Review published episodes.** Compare recent YouTube and Instagram results. If you want the assistant to act on a channel, its growth skill has a separate plan and authorization. [Recent performance](../skills/review-recent/SKILL.md) · [YouTube](../skills/grow-youtube/SKILL.md) · [Instagram](../skills/grow-instagram/SKILL.md) · [Threads](../skills/grow-threads/SKILL.md)
- **Prepare a character broadcast.** Use a channel character and its voice to prepare an opening, welcomes and moving standby clips. You can request a local preview and decide when to go live. [Character livestreams](../skills/live-character/SKILL.md)

For the browser edition, open `docs/index.html` from a checkout. It includes every chapter and works offline.

## Reference

- [Recovering an interrupted image request](image-request-recovery.md)
- [Stock media and attribution](stock-media.md)
- [Video model call reference](video-models.md): request fields, reference limits and character binding for every video model and operation
- [Video model prompt research and examples](research/2026-11-24-video-model-prompting/README.md) and [scene prompt design](research/2026-11-24-video-model-prompting/scene-prompt-design.md)
- [Reference limits for MiniMax H3, LTX-2.5 MSR and Seedance](research/2026-11-25-reference-limits/index.html): characters, voices and shot pictures per request
- [Local LTX video](mlx-ltx-2.5.md) and [FastH3 Omni video](fasth3-omni.md)
- [MCP tool contracts](tool-contracts.md) and the [pipeline manifest](pipeline-manifest.md)
- [Offline review pages](design-system/DESIGN.md), [motion graphics](design-system/MOTION.md) and [bundled fonts](design-system/FONTS.md)

For TTS, image, music and MiniMax H3 work, see the [open model integration requests](../CONTRIBUTING.md#help-with-model-integrations). For other changes, see the [contributing guide](../CONTRIBUTING.md) or [choose a first issue](https://github.com/ttalkkaklab/social-flow/contribute). Report a vulnerability using the [security policy](../SECURITY.md). The plugin is distributed under the [Apache License 2.0](../LICENSE).
