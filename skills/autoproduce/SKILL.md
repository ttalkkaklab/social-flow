---
name: autoproduce
description: >
  Builds or improves an episode in the story-first production order. Use when the
  user asks to "이 주제로 영상 하나 만들어", "자동으로 쇼츠 만들어", "make a short end to end",
  "기존 스토리보드 개선", or an authorized growth loop refills its queue. Develops complete causal scenes,
  plans shots and content-led timing, then produces the media within saved choices and
  spending limits. Storyboard stops at a plan; produce builds an existing approved board.
argument-hint: "[episode-or-storyboard-path | channel topic]"
allowed-tools: ["mcp__social-flow__character_manage", "mcp__social-flow__character_panel", "mcp__plugin_social-flow_social-flow__character_manage", "mcp__plugin_social-flow_social-flow__character_panel", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow", "mcp__social-flow__music_catalog", "mcp__plugin_social-flow_social-flow__music_catalog", "mcp__social-flow__music_plan", "mcp__plugin_social-flow_social-flow__music_plan", "mcp__social-flow__music_execute", "mcp__plugin_social-flow_social-flow__music_execute", "mcp__social-flow__music_status", "mcp__plugin_social-flow_social-flow__music_status", "mcp__social-flow__music_generate_song", "mcp__plugin_social-flow_social-flow__music_generate_song", "mcp__social-flow__music_elevenlabs_generate", "mcp__plugin_social-flow_social-flow__music_elevenlabs_generate", "mcp__social-flow__suno_generate", "mcp__plugin_social-flow_social-flow__suno_generate", "mcp__social-flow__project_manage", "mcp__plugin_social-flow_social-flow__project_manage", "mcp__social-flow__capability_status", "mcp__plugin_social-flow_social-flow__capability_status", "Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "Agent", "mcp__social-flow__astra_genai_catalog", "mcp__plugin_social-flow_social-flow__astra_genai_catalog", "mcp__social-flow__tts_astra_genai", "mcp__plugin_social-flow_social-flow__tts_astra_genai"]
  "WebSearch", "WebFetch",
  "mcp__social-flow__naver_search", "mcp__plugin_social-flow_social-flow__naver_search", "mcp__social-flow__serp_web_search", "mcp__plugin_social-flow_social-flow__serp_web_search",
  "mcp__social-flow__serp_news_search", "mcp__plugin_social-flow_social-flow__serp_news_search", "mcp__social-flow__serp_naver_search", "mcp__plugin_social-flow_social-flow__serp_naver_search",
  "mcp__social-flow__datago_search", "mcp__plugin_social-flow_social-flow__datago_search", "mcp__social-flow__datago_detail", "mcp__plugin_social-flow_social-flow__datago_detail",
  "mcp__social-flow__datago_file_download", "mcp__plugin_social-flow_social-flow__datago_file_download", "mcp__social-flow__datago_file_fetch", "mcp__plugin_social-flow_social-flow__datago_file_fetch",
  "mcp__social-flow__datago_api_call", "mcp__plugin_social-flow_social-flow__datago_api_call",
  "mcp__social-flow__image_local_generate", "mcp__plugin_social-flow_social-flow__image_local_generate", "mcp__social-flow__gpt_image_text2img", "mcp__plugin_social-flow_social-flow__gpt_image_text2img", "mcp__social-flow__gpt_image_img2img", "mcp__plugin_social-flow_social-flow__gpt_image_img2img",
  "mcp__social-flow__mlx_image_generate", "mcp__plugin_social-flow_social-flow__mlx_image_generate", "mcp__social-flow__mlx_image_edit", "mcp__plugin_social-flow_social-flow__mlx_image_edit",
  "mcp__social-flow__speech_manage", "mcp__plugin_social-flow_social-flow__speech_manage", "mcp__social-flow__tts_generate", "mcp__plugin_social-flow_social-flow__tts_generate", "mcp__social-flow__tts_gemini_38", "mcp__plugin_social-flow_social-flow__tts_gemini_38", "mcp__social-flow__tts_elevenlabs_generate", "mcp__plugin_social-flow_social-flow__tts_elevenlabs_generate", "mcp__social-flow__tts_elevenlabs_dialogue", "mcp__plugin_social-flow_social-flow__tts_elevenlabs_dialogue", "mcp__social-flow__sfx_elevenlabs_generate", "mcp__plugin_social-flow_social-flow__sfx_elevenlabs_generate",
  "mcp__social-flow__tts_list_voices", "mcp__plugin_social-flow_social-flow__tts_list_voices",
  "mcp__social-flow__shot_image", "mcp__plugin_social-flow_social-flow__shot_image", "mcp__social-flow__shot_prompt", "mcp__plugin_social-flow_social-flow__shot_prompt", "mcp__social-flow__video_approve", "mcp__plugin_social-flow_social-flow__video_approve",
  "mcp__social-flow__video_catalog", "mcp__plugin_social-flow_social-flow__video_catalog", "mcp__social-flow__video_plan", "mcp__plugin_social-flow_social-flow__video_plan", "mcp__social-flow__video_execute", "mcp__plugin_social-flow_social-flow__video_execute", "mcp__social-flow__video_status", "mcp__plugin_social-flow_social-flow__video_status",
  "mcp__social-flow__music_generate_clip", "mcp__plugin_social-flow_social-flow__music_generate_clip", "mcp__social-flow__mlx_music_generate", "mcp__plugin_social-flow_social-flow__mlx_music_generate"]
---

# One topic to a finished local episode

Read [automation guidance](../_shared/automation-guidance.md). This skill coordinates
[storyboard](../storyboard/SKILL.md) and [produce](../produce/SKILL.md); it does not contain
another writing recipe. Use their current contracts. For new episodes follow storyboard's
single `scenario-v2` → `story-v2` flow: causal alternatives, complete acted scenes, blind
comprehension, shot planning, then content-derived timing. Read
[character-led scenarios](../storyboard/references/character-scenarios.md).
For dramatic characters, read [character depth](../storyboard/references/character-depth.md)
before scenario selection. Carry the chosen conflict through performed choices, relationship
responses and shot framing; metadata alone does not deliver it. Narrators and incidental
roles need no compulsory inner-conflict subplot.

Use [legacy unattended notes](references/legacy-unattended.md) only to understand a resumed
unversioned or story-v1 episode's old files. Never load them as instructions for a new story.
No default runtime, shot count, engine mixture, fixed sentence length, mandatory narrator,
CTA or one-line-per-shot pattern guides new authoring. Preserve explicit user constraints,
real adapter limits and approved budget. Canvas and length are separate choices.

## Scope and setup

An invocation authorizes the requested local work; it does not authorize unbounded paid
media generation or publication. Reuse existing spending authorization. A storyboard-only
or benchmark request stops with plans even if it tests this automatic route.

Read the channel profile and [project initialization](../project-init/SKILL.md). Reuse saved
genre, model, style, ratio, format, voice and SNS targets. Create/snapshot a new episode with
`project_manage` or its CLI. Existing episodes retain their snapshots and explicit choices.
Interactive setup asks missing preferences once. An unattended run with incomplete settings
reports `project_setup_required` and the missing fields, then stops before the lock,
authoring or spending ([setup report](references/unattended-lifecycle.md#setup-report-before-lock));
it invents no choice. Pending SNS connections alone do not block local work.
Use [model settings](../_shared/model-settings.md) and `capability_status` to check the saved
adapters; do not silently switch provider or voice. Generated video goes through
`video_catalog` → `video_plan` → `video_approve` (the user's yes) → `video_execute` under
produce's routing contract, never a direct adapter call.

Prepare shared identities and export the [character sheets](../channel/references/character-identity.md#prepare-the-shared-sheet-before-episode-authoring)
before text authoring. Follow [production order](../_shared/production-workflow.md):
project setup and asset preparation, the story, characters and lines, icon attributes,
images, video prompts, then each shot's approved video. Missing authorization blocks generation.

For growth-loop calls, read the calling platform's `growth-plan.md` and follow
[unattended lifecycle](references/unattended-lifecycle.md) for channel locking, topic
selection, duplicate checks, counters and queue scope. Human-invoked local drafting does
not inherit a publishing schedule or automatic queue authorization.

## Coordinate the steps

Read [the production order](../_shared/production-workflow.md) (user directive 2026-10-31).
Only the story order is enforced; checks come back once the quality is known.

1. Storyboard: the story (`story_sequence` → `story_scene` → `story_shot`), each shot's
   characters and lines (`shot_characters` → `shot_dialogue`), then its icon attributes
   (`shot_icons`). Prepare props and backgrounds with their images.
2. Invoke [generate-cut-images](../generate-cut-images/SKILL.md): each shot's start image,
   and the end image a `first_last` shot needs, with `shot_image`.
3. Invoke [generate-cut-videos](../generate-cut-videos/SKILL.md): each video prompt with
   `shot_prompt`, then each shot's video after the user's yes (`video_approve`), or after
   they approve every shot.

[review-context](../review-context/SKILL.md), [review-camera](../review-camera/SKILL.md),
[compose-blender](../compose-blender/SKILL.md), [review-cut-images](../review-cut-images/SKILL.md)
and [review-cut-videos](../review-cut-videos/SKILL.md) run only when the user asks. For a
supplied existing episode, regenerate it in this order; preserve its story when the user
asks to. Enforce real spending/attempt limits. The coordinator never writes a reviewer's verdict.

After the videos, use produce for assembly, music, requested platform copy and final
delivery verification. Keep speech provenance without automatic speech-scoring/STT gates.
Publishing remains a separate authorization. Preserve actual costs and failed reports.

## Reviews and explicit improvement loops

Reviews run only when the user asks, and none of them gates a step. Do not manufacture
scores, freeze stamps or media reviews. Do not invent a passing result to fill a growth queue. Readability, usable files, supported payloads, finite execution timing, concurrency,
spending and publication authority remain real requirements.

When the user requests a convergence loop, run that loop to the stated criterion. Keep
writers and adversarial reviewers separate and preserve all results. Freeze the rubric
before the first read. A request for over 95 requires **score > 95 and no P0** for every
requested story, not an average across stories. Improve the reusable installed skill and
have its authors reload the update and resume saved drafts; restarting an author is optional.
Use fresh context for independent evaluation. Work sequentially when requested, carry a
resolved lesson into the next story and avoid repeating unchanged checks. Do not quietly
repair the evaluation artifacts from the coordinator.
A score for a plan describes the plan alone. Without generated video and actual playback,
rendered quality is `not_generated` / `not_reviewed` regardless of the story score.
[Evaluation cases](references/evals.md) cover automatic-route regressions.

## Finish and resume

Use produce's episode state and delivery proof for resumes. Do not regenerate an unchanged
approved asset merely because a creative score is absent. Track actual spending and failures,
release only this run's lock and update queues only within their standing authorization.
Present paths, estimated or measured duration, actual costs, review findings and unverified
media. For a local-only invocation stop with those artifacts; publishing belongs to the
publish skill or the authorized growth loop.
