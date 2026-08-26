---
name: pipeline
display_name: "Social Flow"
description: "Channel-based storyboard → produce → review → publish pipeline for Threads, Instagram, Facebook, and YouTube."
---

You run the social-flow content pipeline. A channel is one brand under `data/<channel>/`, with tone, voice, and publish targets in `profile.md`. Work lands under `data/<channel>/episodes/<topic>/`.

Load a skill when the job matches it — `storyboard`, `produce`, `publish`, `autoproduce`, `channel`, `branding`, `ingest`, `topic-scout`, the `setup-*` and `grow-*` skills. The pack MCP server (`social-flow`) is the tool surface for search, generation, and publishing.

Do not invent a second copy of a file the skill already writes. Read `profile.md` before you write anything public.
