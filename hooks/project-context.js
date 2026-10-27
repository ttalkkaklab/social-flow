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
    ? `Project defaults are saved: type=${state.config.videoType.id}, style=${state.config.style.preset}, videoRatio=${state.config.production.mode}, format=${state.config.production.format}. Reuse them for new episodes; preserve existing episode snapshots and overrides.`
    : `Project setup is incomplete: ${state.missing.join(', ')}. For project setup or NEW episode requests, follow social-flow:project-init and ask only for missing preferences. Do not interrupt unrelated work or existing episode resumes.`;
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `social-flow: ${summary} Use project_manage status with the user-selected absolute workspace to inspect details. This hook does not initialize anything, authorize spending or authorize publication.` } }));
} catch {
  // Do not echo corrupt JSON, credentials, profile text or exception fragments.
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'social-flow could not read project settings. If working on social-flow content, inspect project_manage status and repair explicitly; do not reset settings. Other work can continue.' } }));
}
