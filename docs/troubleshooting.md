# Troubleshooting

Start in the workspace that owns the episode. Keep the channel slug, episode slug and any request ID from the original operation. Those identify the existing work when you reconnect.

| Symptom | What to check |
| --- | --- |
| The skill appears, but its tools are missing | In Claude Code, open `/mcp` and inspect the social-flow connection. The marketplace install needs Node on the host's executable path. For a clone, point `--plugin-dir` at the repository root. |
| `project_setup_required` | Run `/social-flow:project-init status` with the selected workspace. Complete the listed choices with `project-init`. After moving a workspace, select the new directory. |
| A provider looks configured but the request fails | `capability_status` reports locally visible configuration. Check the selected operation, endpoint and model catalog in the same MCP session. Restart the server after changing its environment. |
| A publishing tool is missing or shows the wrong account | Check the credential directory and run `sns_account_check` with the same channel slug you passed to publish. Verify the live account and scopes before uploading. |
| `cast_required`, `cast_source_missing` or `character_panel_missing` | Inspect the episode's `storyboard/cast.json`. Restore the referenced identity and the visible character's face, front and back panels. Authorize any needed generation before resuming the board. |
| The render needs more images or voice inputs than the model accepts | Inspect the named shot and its role-labelled references in the plan. Revise the inputs or explicitly change the model, then plan the scene again. |
| A video request timed out | Ask for `video_status` with the episode and original request ID. Keep the receipt, provider job ID and output. If submission is uncertain, check the same job before starting another paid request. |
| A posted video still looks private | Inspect the existing platform ID and publish log. For YouTube, check the private upload and requested visibility. For TikTok, verify the private cover and change visibility on the same post. |

## Check a local installation

From the plugin checkout, these commands inspect setup options and workspace state. Supply the absolute path to your own content workspace.

```sh
node skills/_shared/project-settings.js options
node skills/_shared/project-settings.js status "$HOME/Videos/field-notes"
```

For an assembly problem, check that the host can run `ffmpeg -version`, `ffprobe -version` and `python3 --version`, and that Google Chrome is installed. Include the stage that failed and its error text in a bug report. For provider issues, include the model, operation and status. Remove account identifiers, private file paths, media and credential values you do not intend to share. [Reporting bugs](../CONTRIBUTING.md#reporting-bugs) · [Private security reports](../SECURITY.md)
