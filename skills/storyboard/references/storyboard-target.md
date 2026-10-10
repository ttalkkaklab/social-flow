# Storyboard destination — local HTML or ttalkkakstory

Resolve this before reading a remote profile, researching, or calling any `portal_*`
tool. It applies to storyboard and to the episode's produce, autoproduce and publish
continuations. A listed tool, a configured key, `.portal.json`, and a previous upload
are not a user's destination choice.

## Check the target channel locally

Call `capability_status` with `channel: <channel slug>`. Its `storyboard_portal` field
uses the same credential precedence as the client: the channel's
`<SNS_TOKEN_DIR>/<channel>/ttalkkakstory.json`, then the flat file, then
`TTALKKAKSTORY_API_KEY`. It makes no network request and never returns the key.
Another channel can expose portal tools in the tool list; that does not configure
this channel. Do not read or print credential contents to make this choice.

| Result | Action |
| --- | --- |
| `missing` | Continue with local `storyboard/storyboard.html`. No destination question or key-setup detour. |
| `invalid` | Explain that the portal configuration could not be read and continue with local HTML. Never fall through to another channel's key. |
| `configured` | Reuse this episode's explicit choice, or ask the HITL below before any portal call. Configuration does not prove the key still works. |

## Ask once when a key exists

Use `AskUserQuestion` (or the host's user-input tool) and wait for the answer:

> 이 스토리보드를 어디에 저장할까요?
>
> - **로컬 HTML** — 이 컴퓨터에 저장하고 브라우저에서 검토합니다. 딸깍 스토리에는 업로드하지 않습니다.
> - **딸깍 스토리 연동** — 포털에 저장하고 동기화합니다. 로컬 HTML도 같은 디자인으로 만듭니다.

An explicit choice already made in this conversation counts; do not ask again.
No answer is not portal consent. Keep independent local work, but do not call the
portal while the choice is pending. An unattended run reuses an explicit episode
choice or a user-written standing destination authorization covering this episode;
otherwise a configured key holds that queue item for this HITL. It cannot invent
consent from `unattended`, production approval, or a spending budget.

Once resolved, write `<episodeDir>/.storyboard-target.json`:

```json
{
  "version": 1,
  "target": "local",
  "chosenBy": "user",
  "reason": "로컬 HTML 선택",
  "decidedAt": "2026-10-10T10:00:00+09:00"
}
```

Use `target: "local" | "portal"`; `chosenBy: "user" | "environment" | "standing"`.
For automatic local mode, use `environment` and `reason: "missing" | "invalid"`.
Use the actual time and answer; `standing` names the authorization file and section
in `reason`. Never store credentials here. Create only the episode directory and
this local record before the profile if necessary; author the board after profile
loading. A missing or malformed choice record gives no portal permission. Preserve
a malformed record for repair and repeat the decision above.
This machine's choice record is excluded from portal attachments, so a remote
backup cannot overwrite the user's local destination choice.

Reuse `user`/`standing` choices across sessions and skills until the user changes
them. Recheck `environment` choices on entry: if a key has since appeared, ask.
If a portal choice exists but the key is now absent or invalid, use local HTML for
this run and keep the choice for a later resume. A local choice stays local even
when a key is added. Switching a linked copy to local mode preserves `.portal.json`
and its base revision; never delete that state to bypass a conflict.

## Apply the choice throughout the episode

**Local:** create and deliver `storyboard.html` from the shared template, with
`scenes.js` and its helper files. Keep research, candidates, approvals, media and
publish logs locally. Skip **all** `portal_*` calls, including workspace checks,
channel pull, asset searches, character fetches, leases, render allocation,
checkpoints, image/attachment uploads and produced/published status. Omit the
optional `portal` argument on Blender, Seedance and TTS calls. A saved portal ID
does not override this mode. Existing local assets remain usable; when a required
asset only exists remotely, explain it and ask before changing the destination.

**Portal:** only after consent and a configured key, call `portal_workspace_check`,
then `portal_channel_sync` before reading the profile, and follow storyboard §3's
lease/pull sequence before any candidate upload. Existing revision, lease,
workspace and media recovery rules apply. Network/auth failures get one warning
and local output; do not discard local files or claim a successful sync. A 409
still needs the existing reconciliation procedure before another portal write.

Both modes always build the same review HTML from
[storyboard-html-template.html](storyboard-html-template.html). Destination is a
storage choice, not a design choice. Never author a separate local-only layout.
Follow [storyboard-design.md](storyboard-design.md) when updating the shared design.
