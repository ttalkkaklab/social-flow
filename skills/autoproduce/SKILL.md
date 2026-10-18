---
name: autoproduce
description: >
  Builds an episode unattended locally; runs storyboard then produce. Use when the
  user asks to "이 주제로 영상 하나 만들어", "자동으로 쇼츠 만들어", "make a short end to end",
  or an authorized growth loop refills its queue. Develops complete causal scenes,
  plans shots and content-led timing, then produces the media within saved choices and
  spending limits. Storyboard stops at a plan; produce builds an existing approved board.
argument-hint: "<channel> \"<topic>\" [unattended <platform>]"
allowed-tools: ["mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow", "mcp__social-flow__music_catalog", "mcp__plugin_social-flow_social-flow__music_catalog", "mcp__social-flow__music_plan", "mcp__plugin_social-flow_social-flow__music_plan", "mcp__social-flow__music_execute", "mcp__plugin_social-flow_social-flow__music_execute", "mcp__social-flow__music_status", "mcp__plugin_social-flow_social-flow__music_status", "mcp__social-flow__music_generate_song", "mcp__plugin_social-flow_social-flow__music_generate_song", "mcp__social-flow__music_elevenlabs_generate", "mcp__plugin_social-flow_social-flow__music_elevenlabs_generate", "mcp__social-flow__suno_generate", "mcp__plugin_social-flow_social-flow__suno_generate", "mcp__social-flow__project_manage", "mcp__plugin_social-flow_social-flow__project_manage", "mcp__social-flow__capability_status", "mcp__plugin_social-flow_social-flow__capability_status", "Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "Agent",
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
`video_catalog` → `video_plan` → `video_execute` under produce's routing contract, never a
direct adapter call.

Prepare shared identities and export the [character sheets](../channel/references/character-identity.md#prepare-the-shared-sheet-before-episode-authoring)
before text authoring. Follow [production order](../_shared/production-workflow.md):
project setup, character text/images, text storyboard, prop text/images, background
text/images, image storyboard, then video. Missing authorization blocks generation.

For growth-loop calls, read the calling platform's `growth-plan.md` and follow
[unattended lifecycle](references/unattended-lifecycle.md) for channel locking, topic
selection, duplicate checks, counters and queue scope. Human-invoked local drafting does
not inherit a publishing schedule or automatic queue authorization.

## Author once, then produce

1. Run the storyboard skill's current workflow. Start from the settled material or saved
   draft; compare causal alternatives only when a decision needs them or the user asks.
   No human selection pause is needed when automatic selection is already authorized. Record that it was an
   automatic choice; never call it a user approval. Follow storyboard's scenario-preview
   rule. Complete character sheets before text; finish props and backgrounds after text
   and before the image storyboard. Advance production_workflow at each boundary.
   Delegated writers receive the same skill, sheet and shared-template contract.
2. Write complete scenes before shots. Inspect character knowledge, decisive motivation,
   setup/payoff and prop/spatial continuity. Plan listener responses and silence alongside
   words. If review is useful, use the [storyboard reviewer](../../agents/storyboard-reviewer.md):
   first supply audience-visible actions and speech only, then reveal intentions and sources.
3. Turn scenes into shots while preserving their events. For narration-led work, apply
   [visual grounding](../storyboard/references/narration-visual-grounding.md) before conte prompts:
   distinguish the spoken information from each picture's contribution. Estimate time from
   words, sequential actions and concurrent actions. A hard duration limit calls for simpler content or an
   episode split, not unexplained jumps. Pass whole shots to speech/video planning.
4. Run the relevant storyboard diagnostics and refresh its local review HTML. Fix technical
   execution errors. Resolve concrete editorial findings in scope and report any remainder.
   A schema pass is not an audience-comprehension or visual-quality pass.
5. Music may use existing alternate arrangements and multiple cues; additional generation stays
   within the saved model and authorized allocation. Use shot-relative gain curves for dramatic
   swells and restrained dialogue. A single bed is optional, not an unattended restriction.
   If production is authorized, follow produce for the complete generation/build path. Read
   [production mode](../storyboard/references/production-mode.md), confirm the saved model
   and existing approved cap against the content-derived quote, and preserve real attempt
   limits. An estimate is not a receipt. Unknown pricing stays visibly unknown.
6. Produce plans and inspects source images, relevant previz and generated shots. Compare
   adjacent shots as a scene: visible action, listener response, object state, eyelines and
   sound must carry the story the board promised. Sample frames alone cannot certify
   continuous action or voice delivery. Report precisely what was not viewed or heard.
7. Deliver the clean master and requested platform text through produce's current delivery
   verification. Follow [shot speech](../produce/references/shot-speech.md): speech has real
   provenance and `not_reviewed` status; do not add automated listening/STT/scoring gates.
   Do not burn dialogue into the video. Optional separate captions follow the user's scope.

Keep research when factual claims need it, all candidates, the selected scenario,
`scenes.js`, readable board, HTML, actual review records and production receipts locally.
Keep decisions and actual costs in `.work/`; use the current builders rather than copying
an old shell pipeline or fixed playback speed from historical notes.

## Reviews and explicit improvement loops

Reviews improve the work; they do not impose an automatic approval gate. Do not manufacture
scores, freeze stamps or media reviews. Do not hold a growth queue solely for a creative
score. Readability, usable files, supported payloads, finite execution timing, concurrency,
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
