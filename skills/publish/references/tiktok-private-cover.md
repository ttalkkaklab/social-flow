# TikTok: private upload, browser cover, public post

Owner directive, 2026-11-18. Applies to all new TikTok publications. Existing
public posts stay public unless the user explicitly asks to change visibility;
do not delete or re-upload an existing post to apply this workflow retroactively.

## Prepare and upload privately

1. Reuse authorization for the exact episode and channel. Verify the live handle
   in TikTok Studio against the channel profile. Read the host ego-browser skill
   and run `ego-browser skill`; use ego lite only for browser work.
2. Inspect the clean final video, caption and intended cover. Keep faces and text
   within the profile preview crop, including a centered 3:4 crop when shown.
   Do not confuse a 9:16 source image with its cropped profile presentation.
3. In Studio select **Only you** before submitting the upload. Keep required AI
   and commercial disclosures truthful. If the interface cannot combine the
   required disclosure with private visibility, stop before submission and report
   that conflict. Never change account-wide privacy to make an API route work.
4. Wait for processing and record the stable post ID/link and **Only you** state.
   An inbox draft must first be finished as a private post. API PUBLISH_COMPLETE
   alone does not prove public visibility. Keep the same receipt after a timeout;
   inspect Studio/the original request before deciding whether it failed.

## Edit and verify the cover while private

5. Open that post's available edit control in Studio. Inspect the actual UI rather
   than assuming an edit button exists. Upload/select the intended cover in the
   cover editor and inspect its crop. Save the cover editor and the enclosing post
   editor separately when the UI requires both. Keep visibility **Only you**.
6. Reopen or reload the post and inspect the persisted static cover and profile
   crop. Check all title text and relevant faces. Move the pointer away from the
   tile: hover video playback is not the saved cover. A selected file, upload
   receipt or unsaved preview does not establish that the cover was saved.
7. If editing is disabled, rate-limited, app-only or cannot be verified, leave
   the post private. Record the exact UI message and the prepared cover path.
   Do not promise an app edit button, assume a midnight reset, bypass a disabled
   control, publish without the cover, or start a replacement upload. Resume the
   same post when the restriction is resolved.

## Make the same post public

8. With the saved cover verified, change that post's visibility to **Everyone**
   in the browser and save. Reuse the existing publication authorization. The
   bundled TikTok tools have no visibility-update or cover-image-update endpoint;
   `tiktok_publish` creates a new submission and must not be used for this step.
9. Verify the final **Everyone** state and the public profile's static cover and
   post link. If processing or review prevents verification, report public
   verification pending rather than success; do not resubmit. Then send any
   authorized first comment and handle supported playlists under the publish skill.

## Publication record and resumption

In `publish-log.md`, record account, source video and cover paths, post ID/link,
any API requestId/publishId/receipt, observed visibility, cover-save verification,
public verification and any blocker with its observation time. Keep these outcomes
separate: inbox delivered, private post confirmed, cover saved and verified,
public post confirmed. Continue from the last verified state on the same post.

The browser steps depend on the account's current controls. This workflow does
not guarantee that TikTok will permit editing a private post; an unavailable
control leaves a private post awaiting completion, not a public success.
