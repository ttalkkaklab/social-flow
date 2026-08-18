---
name: publish
description: >
  This skill should be used when the user asks to "게시해", "올려줘", "SNS 게시",
  "publish to social", "스레드/인스타/페북/유튜브에 올려", or after production is
  complete. Takes the finished per-platform content under data/<channel>/episodes/<topic>/output/
  through account checks, public media hosting, a mandatory HITL approval gate, and
  publishes via the social-flow MCP platform tools (threads/instagram/facebook/
  youtube_publish — immediate public post), then records permalinks in publish-log.md.
argument-hint: "<channel> <topic> [platformCSV|auto]"
# *_publish/facebook_comment are deliberately left un-pre-approved — the native
# permission prompt on every irreversible publish call has to act as a second line of
# defense, separate from the HITL approval gate.
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "mcp__social-flow__sns_account_check"]
---

# Platform publishing — public immediately after HITL approval

Publishes the finished artifacts in `output/` with the per-platform publish tools.
**The publish tools have no review gate, so calling one = instantly public.** This
skill's approval gate (§2) and the native permission prompt that fires on every
publish call (never pre-approved) are the two lines of defense. Don't nudge the user
into promoting that prompt to "always allow".

## Absolute rules (violation = stop immediately)

1. **User approval before publishing is mandatory (HITL)** — before any call, present
   the full final text for each platform with AskUserQuestion and get explicit
   approval. IG can't swap the image after publishing, and every platform pins it to
   a brand account (irreversible).
2. **No cross-post copy-paste** — the same sentence must not go out on two platforms
   verbatim.
3. **Never expose a token in plain text** — handle tokens only as files under
   `~/.config/social-flow/<channel-slug>/`. Even when debugging with curl, use inline
   `$(cat …)` references only; never print token values or the access_token field
   into the conversation.
7. **Every publish and comment tool call takes `channel: <channel-slug>`** — use this
   skill's first argument (data/<channel-slug>) as is. With a channel given, only that
   channel's token is used, with no fallback to the default token (prevents publishing
   from the wrong account — a server contract). If you get an error saying the channel
   has no token, walk the user through the channel-directory procedure in
   `references/token-setup.md`.
4. **No distorting the facts** — publish only within the approved artifacts. If a
   caption needs fixing on the spot, take the corrected version back through the
   approval gate.
5. **Respect the limits** — Threads 250/24h, IG 100/24h, YouTube uploads 100/day
   (the videos.insert-only Video Uploads bucket, 1 unit per call — no reason to
   ration episode publishes).
6. **Threads puts the link in a self-reply, FB in the first comment** — for a Threads
   video episode, publish the casual spoken-style body (no link) first, then attach
   the video link (the IG reels permalink) as a `sns_comment_reply` **self-reply**.
   No cover image attached.
   (2026-08-15 — this is a **retraction** of the 2026-08-14 "one link in the body"
   directive. The first two posts done that way got 9 and 21 views, a tenth of the
   link-free posts from the same day, while the two reply-link posts got 257 and 623.
   Reach distribution is measurably suppressed by a body link, so we reverted.)
   FB keeps the old rule — no link in the body → `facebook_comment` first comment, and
   **the FB publish is complete only once that comment is up too.**
10. **Long-form publishes in two stages** — upload the 8–15 minute video as
   `privacyStatus: "private"`, **have a human check the encode, subtitles and chapters**
   on the watch page, then flip it to public with `youtube_update`. Going straight
   public like short-form means the viewer sees the failure first — a 12-minute video
   takes a few minutes to process, and a low-quality copy is exposed meanwhile.
   Procedure in §3-2. **Don't add `#Shorts`** — on landscape long-form it gets
   misfiled onto the shorts surface. Rule 9 (portrait first frame) doesn't apply to
   long-form.
9. **YouTube isn't published until the shorts portrait first frame is set** (short-form
   only) — what `thumbnailFilePath` changes is the landscape surface, nothing else.
   Without setting the portrait frame (`oar*`) that the shorts feed and the channel
   shorts tab actually show, **a random mid-video frame lands as the first frame** —
   an expression mid-sentence instead of our cover. Procedure in §3-1 and
   `references/shorts-surface-adb.md`; the verdict is `oardefault.jpg` **HTTP 200 +
   downloading it and confirming with your eyes that it's the cover screen.**
   **Don't skip this step and report "published".**
   If it needs the user (an emulator login, say), ask right then — don't defer it.
8. **Video and subtitles go up separately** — platforms that take a subtitle file
   (YouTube, Facebook) get the clean master (`video.mp4`) plus `subs.srt`. The
   burned-in copy (`video-sub.mp4`) is for **Instagram only** — IG has no path that
   accepts a subtitle file, so burning them into the picture is the only way. Which
   file goes to which platform is defined by the table in §2, and mixing them up
   either double-burns subtitles on YouTube or loses them on IG.

## Procedure

### 0. Pre-check (once per session)

- **Read the format first** — `window.FORMAT` in `scenes.js` decides the publish path.

  ```bash
  PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
  node $PG/format-resolve.js storyboard/scenes.js --json | python3 -c \
    'import json,sys; f=json.load(sys.stdin); print(f["format"], f["platforms"], f["hashtags"])'
  ```

  | | Short-form 9:16 | YouTube long-form 16:9 |
  |---|---|---|
  | Where it goes | four platforms | **YouTube alone** |
  | Files needed | `video.mp4` · `video-sub.mp4` · `subs.srt` | `video.mp4` · `subs.srt` · `chapters.txt` |
  | Hashtags | 3–5 including `#Shorts` | **no `#Shorts`** — it gets misfiled as a short |
  | First publish | straight to public | **upload private, check, then public** (§3-2) |
  | Portrait surface | `oar*` required (rule 9) | n/a — for landscape the thumbnail is the surface |

  Long-form having no burned-in copy (`video-sub.mp4`) isn't a defect — `BURN=0` is
  that format's contract, and YouTube takes `subs.srt` and toggles it on and off.
- Confirm the `output/` artifacts exist and that `storyboard.md` says
  `status: produced` — otherwise point them at `/social-flow:produce` first.
  **Short-form** needs all three files — `output/video/video.mp4` (clean) ·
  `video-sub.mp4` (burned-in) · `subs.srt`. A missing burned-in copy or subtitle file
  means it's an old build. Check whether it was built with `SUB`/`BURN` off, and if
  not, send it back to `/social-flow:produce` for a rebuild (never publish without
  subtitles).
- Call `sns_account_check` **with `channel: <channel-slug>`** to check this channel's
  per-platform token status — **confirm and report which account is publishing from
  that result** (the account comes from that channel token's /me, not from a setting).
  If the account name in the check doesn't match the channel brand, stop publishing
  and confirm with the user. Drop invalid platforms from the target list and report
  why. If the publish tool isn't in ListTools at all, the token file isn't set up —
  walk them through the channel directory
  (`~/.config/social-flow/<channel-slug>/`) procedure in `references/token-setup.md`.
  Meta tokens are the 60-day refreshing kind — recommend a refresh once the file is
  over 45 days old.

### 1. HITL approval gate (before hosting — unapproved content doesn't go on a public URL)

Run the style checker once per surface before approval (Bash, not an LLM call) — after
publishing you can't swap the IG image or video, so this is the last chance.

```bash
CS=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-style.py
python3 "$CS" --selftest >/dev/null 2>&1 \
  || echo "gate_exit=3 (checker missing, corrupted, or rules red — every result below is unverified)"
for P in threads:output/threads/post.md ig:output/instagram/caption.md \
         fb:output/facebook/post.md yt:output/youtube/meta.md; do
  python3 $CS --surface ${P%%:*} ${P#*:}; echo "[${P%%:*}] gate_exit=$?"
done
# Don't append | head to shorten the output — $? becomes that command's and a FAIL reads as 0
```

On exit 2 (S1) don't take it to the gate; send it back to `/social-flow:produce` to be
fixed — editing the sentence on the spot here breaks rule 4. Put exit 1 (warning) into
the gate prompt as is and let the user judge. **If the header line has `quote-exempt N`,
list those N separately in the prompt** — they're violations the checker excluded from
the verdict without knowing whether the source is genuine. If it really is quoting a
source, publish as is; if we wrote the sentence and only wrapped it in quotes, send it
back to produce. exit 3 means the gate didn't run — fix the path and run it again, and
if you can't, state "style unverified" in the prompt. If the checker file itself is
missing, python returns 2, so the existence check line above tells them apart.

Present the final version for each platform with AskUserQuestion — the full body/caption,
the media **local paths** (they differ per platform: YT and FB get `video.mp4`+`subs.srt`,
IG gets `video-sub.mp4`, Threads gets the media-free body + the link reply copy), the
subtitle cue count, the hashtags, the FB first-comment copy, all of it; the account it
will publish to (from the account check); and the style-check results (per-surface exit
and score, number of quote exemptions). Options: [publish everything / some platforms
only / revise and re-present / stop]. **Passing this gate is the approval to actually
publish.** If they ask for changes, apply them and gate again.

At this point the link slot in the Threads reply is still the `<IG_REELS_URL>`
placeholder (IG has to be published first for the permalink to exist). Write "the IG
reels permalink goes here" into the prompt, and filling in that slot alone in §3 stays
inside the approval — it isn't editing a sentence, so rule 4's re-approval doesn't
apply.

### 2. Getting public media URLs (required for IG · FB images/video — n/a for Threads)

The `imageUrl`/`videoUrl` on the publish tools must be a **publicly reachable HTTPS
URL** — the platform crawls it, so local paths and authenticated URLs won't do
(YouTube is the one exception: it uploads the local file, so no hosting needed).
**Subtitle files are passed as local paths on every platform** — they aren't hosted.

Which file goes up differs per platform. This table is the source of truth.

| Platform | Video | Subtitles | Why |
| --- | --- | --- | --- |
| YouTube | `video.mp4` (local path) | `captionFilePath: subs.srt` | uploaded as a separate track via `captions.insert` — replaceable after publishing, and the source for auto-translation |
| Facebook | `video.mp4` (public URL) | `captionFilePath: subs.srt` | the `/{video_id}/captions` edge |
| Instagram | **`video-sub.mp4`** (public URL) | none — burned into the picture | the container has no subtitle parameter |
| Threads | none — nothing to host | n/a | the body is a link-free casual post, and the IG reels link goes in a self-reply. No attached media, so no file to upload |

The hosting directory needs **both the burned-in copy for IG and the clean copy for
FB**. The filenames differ, so they can sit in one directory together; check each one
for a 200 with `curl -sI`.

- Use the hosting method named in profile.md §4. **If none is set, hold the publish and
  ask the user which hosting to use.**
- If you used a temporary tunnel (`python3 -m http.server` + `cloudflared tunnel`):
  (1) serve from a dedicated directory holding only the publish files; (2) after
  publishing, kill both processes and report completion **only after
  `pgrep -fl "cloudflared|http.server"` prints nothing**; (3) run the same command at
  the start of the session to check for a leftover tunnel from an earlier one.
- Check 200 and MIME with `curl -sI <URL>` before publishing.
- **If the hosted file differs from the file approved in §1, or the URL changes after
  approval (a tunnel restart, say), go through the §1 gate again.**

### 3. Publish (approved platforms only)

Put `channel: <channel-slug>` on every publish and comment tool call below (rule 7).

There's exactly one hard ordering constraint — **IG reels before Threads** (the video
link that goes in the Threads post is the IG permalink). If the IG publish fails, hold
Threads and ask the user for a replacement link (the YouTube permalink, say). The
order of the remaining platforms is free.

1. **YouTube**: `youtube_publish` — title/description from `output/youtube/meta.md`,
   `videoFilePath`=output/video/**video.mp4** (the clean copy),
   **`thumbnailFilePath`=cover.jpg required** (leave it out and a random frame becomes
   the thumbnail), **`captionFilePath`=output/video/subs.srt required**.
   A `thumbnailWarning` or `captionWarning` means the publish succeeded — report what
   the warning says. Subtitle upload needs the **`youtube.force-ssl` scope** (the
   publish-only `youtube.upload` gets rejected). With a publish-only token, a scope
   error on the first call is normal, and at that point the video is already up, so
   **don't republish** — reissue the token and upload just the subtitles separately
   (`references/token-setup.md`). The quota differs too — the upload is 1 unit but the
   subtitles are 400, so call it only once per episode.
   **Don't set `containsSyntheticMedia`** (it defaults to true). This pipeline uses Veo
   video and Lyria music, so it falls under AI disclosure, and YouTube states that
   disclosure doesn't affect reach or monetization eligibility while warning that
   habitual non-disclosure brings forced labels, removal, and YPP suspension. Turning
   it off requires the user to confirm an exemption reason (the exemption list:
   script/title/thumbnail/subtitle/idea generation, cloning your own voice,
   non-realistic animation, color grading and filters).
   **The YouTube publish isn't done until the shorts portrait first frame is set
   (absolute rule 9 — not skippable).** What `thumbnailFilePath` changes is only the
   landscape surface (search results, share previews, embeds); the portrait frame
   (`oar*`) used by the shorts feed and the channel shorts tab changes only through
   frame selection in the YouTube native app (not via API or web — measured
   2026-08-13 and 08-14). Leave it unset and a random mid-video frame becomes the
   shorts first frame. Procedure in `references/shorts-surface-adb.md`
   (channel-dedicated AVD + adb, ~60 seconds per video).

   **The target frame is the moment the cover is complete** — use the timestamp where
   `produce` pulled `cover.jpg` (the cover transition completion time in
   `build-report.txt`; around 6 seconds in this pipeline). At the frame picker's first
   slot (t=0) the hero stat isn't up yet.

   **The verdict looks at two things** — (1) `i.ytimg.com/vi/<videoId>/oardefault.jpg`
   returns **HTTP 200**, and (2) you download that file and **confirm with your eyes
   that it's the cover screen** (200 means "some" portrait frame is attached, not that
   it's the "right" one). Both have to pass before you write it up as published in
   `publish-log.md`.

   If there's no emulator or a login is needed, **ask the user right then** — don't
   defer it as an open item and report completion. Only if the user explicitly says
   they'll do it later do you record it as open, along with the videoId.
2. **Instagram**: `instagram_publish` — `videoUrl` is the public URL of the
   **burned-in copy (video-sub.mp4)** + caption. This is the only place the subtitles
   are baked into the picture.
3. **Threads**: `threads_publish` — publish the approved body (no link) as `caption`
   (no `linkUrl`, no `imageUrl`), and once it's up attach the IG permalink from step 2
   as a **self-reply** with `sns_comment_reply` (one line like "full video here →"
   plus the link). Threads isn't published until that reply is up. (2026-08-15 — the
   body-link approach is retracted, see the evidence under rule 6. Measured: a link in
   the body suppresses reach distribution.)
4. **Facebook**: `facebook_publish` — `videoUrl` is the public URL of the **clean copy
   (video.mp4)**, `captionFilePath`=output/video/subs.srt (a local path), plus the
   body → then **publish the first comment (source/related link) immediately** with
   `facebook_comment` using the postId from the response. A `captionWarning` doesn't
   invalidate the publish — FB processes video asynchronously, so it may have caught
   it mid-processing. **Don't republish**; upload just the subtitles again a moment
   later (the postId in the response is the video_id).

#### 3-2. Long-form (`youtube-long-16x9`) — upload private, check, then go public

For landscape long-form, step 1 above is called differently. The other platforms
aren't touched at all (preset `platforms: ["youtube"]`).

1. Call `youtube_publish` with **`privacyStatus: "private"`**.
   `videoFilePath`=`video.mp4` (clean) · `thumbnailFilePath`=`cover.jpg` ·
   `captionFilePath`=`subs.srt`. `caption` (the description) carries the **chapter
   timestamps** — `output/video/chapters.txt` is that list, built from the builder's
   measured times, with `00:00` as the first line and three or more entries. Add
   hashtags if you like, but **never `#Shorts`.**
2. Open `https://www.youtube.com/watch?v=<videoId>` and **look at four things** —
   (1) has the quality come up to the final resolution (if it's still processing,
   wait), (2) does the subtitle track turn on, (3) do the description's chapters draw
   as segments on the scrubber, (4) is the thumbnail our cover.
3. Once all four pass, flip it to `privacyStatus: "public"` with `youtube_update`.
   **On a video you're touching for the first time, call it with `dryRun: true` first**
   and check `wouldSend` — this tool overwrites rather than patching, so it re-sends
   the fields you didn't pass at their current values.
4. If any one of them fails, tell the user **while it's still private**. Don't
   re-upload — subtitles, description and thumbnail can all be fixed after publishing,
   and re-uploading the video restarts the view count at zero.

Sometimes the chapters don't draw. Break the requirements (first line 0:00 · three or
more · at least 10 seconds apart) and our list is ignored in favor of auto chapters —
the builder checks those three first, so a `chapters.txt` that exists has passed them;
if they still don't show, check whether the lines broke when they were copied into the
description.

Handling failures: report the error as it came and **don't blindly retry the same call**
(the publish APIs aren't idempotent — after a timeout, check for a duplicate first via
the permalink or a recent-media query). If only the FB first comment failed, retry just
the comment call; if it keeps failing, write down the postId and the reason and explain
the manual fix. Threads is a single call, so it has no partial failure — if it failed,
nothing was published, so check the permalink before calling again.

### 4. Record and wrap up

When you reply to comments after publishing (`sns_comment_reply`), check the copy
first as well. A reply is person-to-person talk, which is where AI phrasing gets
spotted fastest — golden-hour response isn't a reason to skip the check.

```bash
printf '%s\n' "$reply_copy" | \
  python3 ${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-style.py --surface reply -
```

Copy that clears the checker goes to the growth-post-reviewer agent (the `inbox_reply`
surface, with the original comment and our post body attached) — **publish only copy
that scores ≥95 with p0=0.** If it falls short, fix it by removing only what the
correction directs, up to three rounds; if it still falls short, don't send it and
write the reason into the publish log.

- Record in `data/<channel>/episodes/<topic>/output/publish-log.md`: a table of
  timestamp, platform, post id, permalink, caption summary, and the approver's decision.
- Update `storyboard.md` to `status: published`.
- If you used a temporary tunnel, verify the teardown per §1, then give the final
  report as a platform/permalink table.

## Additional Resources

### Reference Files

- **`references/token-setup.md`** — per-platform credential issuance, file conventions, refresh procedures (Threads/IG 60 days · FB indefinite · YouTube OAuth)
- **`references/shorts-surface-adb.md`** — setting the YouTube shorts portrait surface (`oar*`) frame: the channel-dedicated AVD + adb procedure, its traps, and the oardefault verdict
