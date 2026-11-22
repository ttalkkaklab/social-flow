'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { manageProject } = require('../skills/_shared/project-settings.js');

// Context only: no files, environment variables, network calls or automatic choices.
try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (input.hook_event_name !== 'SessionStart' || typeof input.cwd !== 'string' || !path.isAbsolute(input.cwd)) process.exit(0);
  const state = manageProject({ action: 'status', workspace: input.cwd });
  const summary = state.status === 'ready'
    ? `If this is the user's selected project, reuse its defaults: type=${state.config.videoType.id}, style=${state.config.style.preset}, videoRatio=${state.config.production.mode}, format=${state.config.production.format}. Preserve existing episode snapshots and overrides.`
    : `Project setup is incomplete: ${state.missing.join(', ')}. For storyboard or video work, first establish the directory the user selected. If unclear, ask and wait. Use project_manage select for an unbound directory, then project-init for missing choices. Wait for ready before writing or producing.`;
  const firstSetup = state.config?.models ? '' : ' At first setup, after the video model and credentials, ask which BGM model to use (music_catalog), including the option to reuse music or use no score. Then ask for an image model and a separate speech model or an explicit no-TTS choice.';
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `social-flow: ${summary}${firstSetup} Use project_manage status with the user-selected absolute workspace to inspect details. This hook does not initialize anything, authorize spending or authorize publication.` } }));
} catch {
  // Do not echo corrupt JSON, credentials, profile text or exception fragments.
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'social-flow could not read project settings. If working on social-flow content, inspect project_manage status and repair explicitly; do not reset settings. Other work can continue.' } }));
}
