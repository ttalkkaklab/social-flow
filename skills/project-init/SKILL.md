---
name: project-init
description: >
  Sets up multi-episode project defaults; stops before content generation. Use
  for "프로젝트 초기 설정", "초기 구성", "SNS 연결 환경설정", "장르 화풍 영상비중 설정",
  "set up a video project", or completing missing workspace preferences. Saves
  SNS targets and connection records, genre, media models, visual style, video ratio
  and format together. For only a channel profile or character edit use channel;
  storyboard plans an episode and autoproduce builds one.
argument-hint: "[init|status|update] [project-directory]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "mcp__social-flow__project_manage", "mcp__social-flow__capability_status", "mcp__social-flow__sns_account_check", "mcp__social-flow__character_voice_audition", "mcp__social-flow__tts_list_voices", "mcp__social-flow__tts_elevenlabs_voices"]
---

# Project setup

Set up the user-selected workspace for repeated episodes. The single settings file
is `.social-flow/models.json`: it now includes project identity, SNS, genre, models,
style and production defaults. Existing model-only files are valid legacy inputs;
complete only missing categories. Never initialize the plugin install directory as
a user's project unless they explicitly selected it.

Use `project_manage` for deterministic file operations. The equivalent CLI and a
complete input example are in [settings.md](references/settings.md). No media is
generated, billed, uploaded or published by this skill. If the user also requested
episode work, continue to that skill after setup without asking for the same choices.

## Read and collect

1. Resolve the absolute project directory from the user's request or session. Create
   that directory if it does not exist, then call `project_manage action:status`.
   A ready project returns its choices: reuse them. A malformed file is a repair
   task; do not replace it. `status` itself never writes files.
2. For new setup, settle project name and channel slug. If a channel profile already
   exists, read it and keep its identity, tone and pinned voices. With multiple
   channels ask which one this project's defaults should target; do not pick the first.
   `project.channel` selects one primary channel; other existing directories are preserved.
3. Call `project_manage action:options` and `capability_status`. Follow
   [model settings](../_shared/model-settings.md) for **genre → video model → speech
   model → image model**. Reuse explicit prior answers and existing settings.
4. Ask for the missing **visual style**, **video ratio**, and **output format** — asked
   once here, then reused (the owner's exception to assistant-decided preferences).
   Show the rendering descriptions in [visual style](../storyboard/references/visual-style.md).
   The six ratio IDs come from options: `full_video`, `video_80`, `video_50`,
   `video_30`, `video_lt10`, `no_video`. Explain the actual ranges (100%, 80–<100%,
   50–<80%, 30–<50%, <10%, 0%) and that the ratio counts shots, not running time.
   The ratio is a planning target and cost ceiling: the band's upper bound and the
   budget are enforced, the lower bound is not. Integer rounding follows the
   production contract. Explain cost implications
   using the selected model; an exact quote needs an actual episode plan.
   Select `shorts-9x16` or `youtube-long-16x9`. Save optional palette/material/
   lighting directions when supplied. Save a previz renderer and per-episode USD
   ceiling (`episodeBudgetUsd`) if the user chooses them; the author carries that ceiling
   into `PRODUCTION.videoAuthorization.maxUsd` for routing. A ceiling is not permission to spend.
5. Ask which SNS platforms are targets and whether to connect now or later.
   Record all four platforms: disabled ones use `enabled:false,status:disabled`;
   selected but unverified ones use `enabled:true,status:pending`.
   Record the user's connect-now/later choice, then save the local project below
   BEFORE starting platform setup: those skills need the channel profile to exist.
   Never put token values, client secrets or refresh tokens in project JSON.

Ask missing preferences in small groups, with one sentence per option explaining
what changes. Do not infer an unchosen preference, copy example choices or re-ask
saved choices. An unattended caller with incomplete setup returns
`project_setup_required` and the missing fields; it does not create defaults.

## Save and verify

For a new channel, author `profileMarkdown` from the
[profile template](../channel/references/profile-template.md) using channel skill's
audience, tone, voice and theme procedure. Keep its platform table and voice engine
consistent with the selected settings. Do not generate sample media during setup.
Pass the completed profile to `project_manage init`; for an existing profile omit
it so the file stays untouched. The tool creates the catalog and episodes slot,
adds local data/settings ignore rules, and preserves all existing assets.

For platforms the user chose to connect now, continue with the platform setup
skill or [token setup](../publish/references/token-setup.md), then call
`sns_account_check` with this channel. Account creation uses setup-threads,
setup-instagram or setup-youtube; Facebook uses token setup. Complete any
login/consent step with the user. Save connected, accountId, public handle when
available and the actual checkedAt only after verification. If connection fails
or is deferred, keep pending and report the next concrete step. Production can
still start. Persist partial progress so an interrupted login can resume without
repeating the genre, model, style or ratio questions.

`init` can fill absent legacy fields but rejects conflicting existing values.
For an explicit default change, read status, send only the requested category with
`update`, its `expectedRevision` and the actual request. Categories replace in
full, so preserve unedited style/production/SNS values in that category. Model
updates replace only supplied model categories. Channel identity cannot be renamed
by changing settings. Re-read on a revision conflict; never remove another lock.

After a successful SNS setup or recheck, persist that platform's record with
`update`, preserving the other platforms. Do not silently synchronize a historical
episode snapshot. On publishing, recheck live account identity and resolve a
mismatch with the saved account before uploading.

Read status again. Show the settings path, genre/models, style, ratio, format,
channel and per-platform connection state. State pending connections honestly.
`ready` means local authoring is configured, not that every provider or SNS token
works. Link the channel profile and report any profile/default conflicts without
rewriting existing voices or an already-approved episode.

Project settings readiness does not mean character readiness. Before continuing to
an episode, follow [shared character preparation](../channel/references/character-identity.md#prepare-the-shared-sheet-before-episode-authoring).
Create/reuse the needed identity drafts and export their bundled sheets before
candidate writing. Do not generate media during project setup or substitute an
ad hoc page for the shared sheet. Report absent images as pending.

## Starting subsequent episodes

Call `project_manage episode` with the workspace and topic slug before authoring a
new board. It creates `storyboard/`, `.work/`, `output/` and the immutable settings
snapshot, returning the `FORMAT`/`PRODUCTION` handoff. Copy those values into a new
board and apply model adapter mapping from model-settings.md. Existing episode
resumes use their snapshot/board and explicit overrides; never copy new defaults
over them. Episode-only changes belong to that episode, not workspace settings.

The plugin's `hooks/hooks.json` supplies read-only SessionStart context in Claude
Code. It never chooses preferences, starts setup or prevents unrelated work.
Other hosts use this skill and the same CLI/MCP status call; setup does not rely
on a hook being available.
