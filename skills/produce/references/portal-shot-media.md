## Shot media on the portal — before the video call
When a workspace key exists, save/pull the episode first so `.portal.json` records its workspace, episode and base revision. Keep each file inside this episode directory. A missing key silently keeps local-only production.

For every shot, use this order:
1. Render the Blender previz with `portal: { episodeDir, shotId }` (`shotNo` only for an ID-less board). The handler uploads and checkpoints its MP4 before returning. For three.js or an existing previz, call `portal_shot_media_upload` with the same target, `kind:"previz"`, and `file` immediately after rendering.
2. Create the source image and call `portal_shot_media_upload` with `kind:"image"` as soon as it exists. This uses the host image lane as usual.
3. Only after the previz upload and checkpoint succeed, call the selected video tool. Seedance calls take `portal: { episodeDir, shotId, previzFile }`; the wrapper awaits previz upload/checkpoint before its vendor callback, then uploads the generated MP4. For host/other video tools, explicitly await step 1 before the call and upload the result with `kind:"video"` immediately afterwards.
4. Pass `portal: { episodeDir, shotId }` to `tts_generate_checked`; the completed WAV is uploaded even when its review is a warning. For existing narration, use `kind:"narration"`. Uploading does not approve failed speech or authorize spending.

The uploader writes only UUIDs into `portalImageId` / `portalMedia.{previz,video,narration}`, preserves authored JavaScript, and updates the local base. Await uploads for the same episode sequentially. The portal's shot card shows all four kinds; absent files say “아직 없음”. Image limit 5 MiB, MP4 10 MiB, WAV/MP3 10 MiB. Portal quotas remain shared across all kinds.

If a file exists but its portal step fails, keep that file and retry `portal_shot_media_upload` after resolving the reported error; never pay to regenerate it. A previz upload failure stops the next video call while a key is configured, except for a file above the size limit: skip only that file, append its kind/path/size/limit to `.portal-media-skips.jsonl`, and continue production (owner direction 2026-09-23). A conflict requires a side pull and merge, preserving local files and `.portal-local/media-*/uploaded-scenes.js`; no blind retry and no deletion of the base revision. A missing key silently skips; oversized files skip with the local log. Neither exception approves new spending.


Previz framing: explicitly set Blender width/height from the episode format or approved shot render ratio, then check the returned dimensions before upload. The bridge preserves .blend dimensions when omitted; it does not infer them from portal metadata. See storyboard/references/blender-previz.md §6.1.
