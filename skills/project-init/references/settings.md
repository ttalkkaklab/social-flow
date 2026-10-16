# Project settings and CLI

Use `.social-flow/models.json` as the only workspace defaults file. Version 1 is
extended with `project`, `style`, `production` and `sns`; old model-only records and
episode snapshots stay readable. `videoType` is the video genre, independent of
visual style and format. `request` and `updatedAt` record the last explicit change.

The helper `skills/_shared/project-settings.js` and MCP `project_manage` share the
same implementation. Every operation needs the explicit absolute workspace except
`options`. `init`/`update` read JSON on stdin; paths with spaces are supported.

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/_shared/project-settings.js" options
node "$CLAUDE_PLUGIN_ROOT/skills/_shared/project-settings.js" status "$WORKSPACE"
node "$CLAUDE_PLUGIN_ROOT/skills/_shared/project-settings.js" init "$WORKSPACE" < setup-input.json
node "$CLAUDE_PLUGIN_ROOT/skills/_shared/project-settings.js" episode "$WORKSPACE" history-01
node "$CLAUDE_PLUGIN_ROOT/skills/_shared/project-settings.js" update "$WORKSPACE" < change-input.json
```

Example `setup-input.json` (illustrative choices, never automatic defaults):

```json
{
  "request": "The user's actual choices belong here",
  "settings": {
    "project": {"name":"History stories","channel":"history"},
    "videoType": {"id":"documentary"},
    "models": {
      "video": {"engine":"seedance","model":"seedance-1-5-pro-251215","resolution":"720p"},
      "speech": {"engine":"gemini","model":"gemini-3.8-flash-tts"},
      "image": {"engine":"host","model":"host-managed","host":"codex"}
    },
    "style": {"preset":"webtoon","palette":"Muted ochre and blue"},
    "production": {"mode":"video_50","renderRatioVersion":1,"format":"shorts-9x16","previzRenderer":"blender","episodeBudgetUsd":5},
    "sns": {
      "threads": {"enabled":false,"status":"disabled"},
      "instagram": {"enabled":true,"status":"pending"},
      "facebook": {"enabled":false,"status":"disabled"},
      "youtube": {"enabled":true,"status":"pending"}
    }
  },
  "profileMarkdown": "Supply a completed channel profile with matching slug frontmatter, or omit when profile.md already exists."
}
```

For an existing model-only file, send only missing project/style/production/SNS
fields; existing genre and models are retained. An explicit update passes
`expectedRevision` from status alongside `request` and `settings`. Each supplied
style/production/SNS object replaces that category; keep its unchanged fields.
Models are merged by video/speech/image category. Existing episode snapshots never
change. Repeating identical initialization preserves file bytes and revision.

SNS records include `enabled`, `status`, optional public `handle`, verified
`accountId` and `checkedAt`. The helper adds `credentialRef`, for example
`${SNS_TOKEN_DIR}/history/youtube-oauth-client.json`. This is a reference, not a
credential. Resolve the variable using the server's `SNS_TOKEN_DIR` or its default
`~/.config/social-flow`. No token contents are read by project setup or the hook.
`connected` is historical evidence, not a claim that a token is still valid.

Local files and settings are protected from accidental Git inclusion with
`/.social-flow/` and `/data/` entries in the workspace `.gitignore`. Existing rules
are retained. The project tool does not stage or commit anything.

`episode` returns `created`, `resumed` or `legacy_episode`. A legacy board without
a snapshot is kept unchanged. A new snapshot stores all preferences, including
SNS records, and a hash of the config. Its handoff provides authoring defaults;
it is not an approved storyboard, generation budget approval or publish request.

Hook registration follows the [Claude Code plugin hook convention](https://code.claude.com/docs/en/plugins-reference#hooks)
and [SessionStart context schema](https://code.claude.com/docs/en/hooks#sessionstart).
Only the session's explicit `cwd` is checked; it does not search parent projects
or initialize an arbitrary working directory. Hosts without this hook use the
same skill preflight. Hook execution itself is network-free and read-only.
