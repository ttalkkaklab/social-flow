# Publishing an episode

Start with a finished episode. Play its master video, inspect the cover at the target crop, and read the caption, title and any first comment. Keep the channel and episode slugs handy so you can find the same files and receipts if a session is interrupted.

## Connect the intended account

For a channel named `field-notes`, run the setup skill for the platform you intend to use. For example:

```text
/social-flow:setup-youtube field-notes
```

Follow the account selection and consent prompts. Ask the assistant to run `sns_account_check` for **field-notes** and show the account attached to that channel. Check the handle or channel ID. Setting up an account and uploading an episode are separate requests.

| Platform | Setup | What to check at delivery |
| --- | --- | --- |
| YouTube | [YouTube setup](../skills/setup-youtube/SKILL.md) | The plugin uploads the local master privately. Check the video and thumbnail or Shorts cover before switching the approved upload to public. |
| Instagram | [Instagram setup](../skills/setup-instagram/SKILL.md) | The platform fetches the media over HTTPS. Open the published Reel and inspect its profile crop. |
| Facebook Pages | [Page token setup](../skills/publish/references/token-setup.md) | Verify the Page identity, public media URL, returned post and cover. |
| Threads | [Threads setup](../skills/setup-threads/SKILL.md) | Review the approved text and media URL. Confirm the published post and any requested reply. |
| TikTok | [TikTok setup](../skills/setup-tiktok/SKILL.md) | Start with **Only you**, edit and reopen the cover in ego lite, then make that same post public and verify it. An inbox delivery is a draft. |

The channel's credential directory defaults to `~/.config/social-flow/field-notes/`. Tools called with a channel use that channel's files. A new credential file can make a platform tool available. Check the account again if authorization, scopes or identity change.

## Publish to a specific platform

In Claude Code, the following command selects YouTube for this episode:

```text
/social-flow:publish field-notes window-light youtube
```

Review the target account, final copy, media and visibility before authorizing publication. For platforms that fetch media, provide the hosting method for this channel. The platform needs to be able to fetch the approved file from a public HTTPS URL. YouTube accepts the local video file.

After publishing, open the returned permalink and check the actual visibility and cover. The episode records platform IDs and permalinks in `output/publish-log.md` and first-comment receipts in `output/first-comments.json` when applicable. After a timeout, use the recorded ID to check what the platform already received before retrying. [Publishing procedure](../skills/publish/SKILL.md) · [TikTok cover and visibility](../skills/publish/references/tiktok-private-cover.md)
