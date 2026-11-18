---
name: publish
description: >
  Publishes finished episodes and their first comments to SNS. Use when the
  user asks to "게시해", "올려줘", "SNS 게시", "첫 댓글 달아줘", "publish to social", "스레드/인스타/페북/유튜브/틱톡에 올려", or once
  production is done. Takes the per-platform content under
  data/[channel]/episodes/[topic]/output/ through account checks and public media hosting,
  stops for the user's publishing authorization, publishes through the social-flow platform
  tools (Threads, Instagram and Facebook post at once; YouTube uploads private and flips
  public with youtube_update; TikTok uploads private, verifies its cover in ego lite,
  then makes the same post public), posts authorized character-and-hook first comments,
  and records post and comment outcomes in publish-log.md.
argument-hint: "<channel> <topic> [platformCSV|auto]"
# *_publish/facebook_comment are deliberately left un-pre-approved — the native
# permission prompt on every irreversible publish call has to act as a second line of
# defense, separate from the HITL approval gate.
allowed-tools: ["mcp__social-flow__facebook_captions", "mcp__plugin_social-flow_social-flow__facebook_captions", "mcp__social-flow__project_manage", "mcp__plugin_social-flow_social-flow__project_manage", "Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "mcp__social-flow__sns_account_check", "mcp__plugin_social-flow_social-flow__sns_account_check", "mcp__social-flow__capability_status", "mcp__plugin_social-flow_social-flow__capability_status"]
---
**Automatic execution policy:** Read [automation guidance](../_shared/automation-guidance.md) first. Creative rules and review findings guide improvements; scores, review/hash/freeze records, CTA choices and intermediate approval steps do not block authorized work. Preserve actual external-action authorization and stop at the artifact the user requested. This policy supersedes older quality-gate wording below.


Use local episode files under `data/<channel>/episodes/<topic>/`.

For a first-comment-only request on existing posts, read their publication receipts
and verify the target accounts/permalinks. Follow
[episode first comments](../_shared/first-comment.md) directly, then record the comment
outcomes in §5. Skip media hosting and video upload; do not republish an existing post.


**HITL records:** Record the user's platform approval separately from actual publication outcomes. Preserve actual provenance in local files and reuse existing authorization. Publishing needs the user's authorization; quality reviews add no gate.


# Platform publishing — after the user's approval


Publishes the finished artifacts in `output/` with the per-platform publish tools.
**Threads, Instagram and Facebook post the moment the tool is called; YouTube uploads
private (rule 9). TikTok starts private and becomes public only after the browser cover
step below.** The user's approval (§1) and the native permission prompt that fires on
every publish call (never pre-approved) are the two lines of defense. Don't nudge the user
into promoting that prompt to "always allow".

**Owner directive (2026-10-17): upload the clean, subtitle-free video on every platform,
even when characters speak.** Never select a stale video-sub/reel-sub file. Separate
YouTube subtitle tracks are optional when the user requests them; do not infer consent
from profile languages or an SRT already on disk. This overrides older subtitle recipes.

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
4. **No distorting the facts** — publish only within the approved artifacts. If a
   caption needs fixing on the spot, take the corrected version back through the
   approval gate.
5. **Respect the limits** — Threads 250/24h, IG 100/24h, YouTube uploads 100/day
   (the videos.insert-only Video Uploads bucket, 1 unit per call — no reason to
   ration episode publishes).
6. **Threads carries the video on the post, FB puts the link in the first comment** —
   a Threads video episode goes out in one call: the casual spoken-style body (no link)
   as `caption` plus the public URL of the clean subtitle-free master as `videoUrl` (user
   directive 2026-08-19). Don't attach the video as a reply. Only an episode that can't
   carry a video falls back to a self-reply link.
   No link in the body either — the first two link-in-body posts got 9 and 21 views, a
   tenth of the link-free posts from the same day (measured 2026-08-15).
   FB: no link in the body → `facebook_comment` first comment, and
   **the FB publish is complete only once that comment is up too.** For story episodes,
   combine the link with the character-and-hook copy. Apply
   [episode first comments](../_shared/first-comment.md) to every requested platform;
   prepare, authorize, post and verify each separately.
7. **Every publish and comment tool call takes `channel: <channel-slug>`** — use this
   skill's first argument (data/<channel-slug>) as is. With a channel given, only that
   channel's token is used, with no fallback to the default token (prevents publishing
   from the wrong account — a server contract). If you get an error saying the channel
   has no token, walk the user through the channel-directory procedure in
   `references/token-setup.md`.
8. **Every platform gets `video.mp4`, with no subtitles inside the video.**
   Instagram and Threads have no separate subtitle parameter; publish the clean master
   there too. When the user requests YouTube subtitles, pass `captionFilePath` or
   `captionTracks` for separate viewer-selectable tracks. Otherwise omit caption inputs.
   Existing sidecars and legacy burned-in files do not change this choice.
9. **Every YouTube upload starts private — no exceptions** (user directive 2026-08-19).
   Call `youtube_publish` with **`privacyStatus: "private"`**, attach everything the
   cover needs, and only then flip to public with `youtube_update`. The server uploads
   private by default and rejects a `public` request (`unlisted` stays allowed); growth
   loops run the same flip with `youtube_update` under their approved plan. Publishing straight
   to public exposes a mid-sentence frame as the first thing anyone sees while you are
   still attaching the cover. This holds for short-form and long-form alike; the
   long-form specifics are rule 10.

   **What `thumbnailFilePath` changes is the landscape surface only** — search results,
   share previews, embeds. The portrait frame that the shorts feed and the channel
   shorts tab actually show is separate, and left unset **a random mid-video frame lands
   as the first frame** — an expression mid-sentence instead of our cover.

   **The portrait frame is set in a browser** (measured 2026-08-19) —
   `studio.youtube.com/video/<id>/edit` → the `⋮` over the portrait image in the
   thumbnail box → **"Select from video"** → the cover frame → Done → Save. Drive it with
   ego lite (the only browser lane — no Chrome MCP fallback); the native app is not
   needed. Don't pick `Change` (file upload) in that same menu — it only swaps the
   landscape surface. If the picker is missing or the cover isn't among the candidates,
   fall back to the emulator procedure in `references/shorts-surface-adb.md`.

   **The verdict is not `oardefault.jpg`** — it stays 404 even after the frame is set,
   and `oar2.jpg` answers 200 with a cached older frame. Read the tile's `img` src from
   the channel shorts tab DOM (`youtube.com/@<handle>/shorts`), download it, and confirm
   with your eyes that it's the cover. **This check only works once the video is public**
   — private videos don't appear in the shorts tab. So the frame gets set while private,
   and the check happens right after going public.

   **Don't skip this step and report "published"** (completion criteria: §4).
   If it needs the user (a login, say), ask right then — don't defer it.
10. **Long-form publishes in two stages** — upload the 8–15 minute video as
   `privacyStatus: "private"`, **have a human check the encode, subtitles and chapters**
   on the watch page, then flip it to public with `youtube_update`. Going straight
   public like short-form means the viewer sees the failure first — a 12-minute video
   takes a few minutes to process, and a low-quality copy is exposed meanwhile.
   Procedure in §3-2. **Don't add `#Shorts`** — on landscape long-form it gets
   misfiled onto the shorts surface. Rule 9 (portrait first frame) doesn't apply to
   long-form.
   **Thumbnail variants** (`episode_cover read` → `publish.variants`, [generate-cover](../generate-cover/SKILL.md)):
   YouTube Test & Compare has no API and skips private videos, so start it right after the
   public flip, as part of this publish: Studio (desktop) → the video's edit page →
   Thumbnail → **Test & compare** → the main thumbnail plus each variant file (all 1280×720
   or larger, or every test image drops to 480p) → start. It picks by watch time, runs days
   to two weeks, and stops if the title or thumbnail is edited meanwhile, so leave both
   alone until it reports (rule 11). Record the variants and the result in the publish log.
11. **Don't touch a video while it is spreading** — the metadata freezes the moment the
    §4 checklist passes. From there: no re-upload, no delete, and no title, description or
    thumbnail change without a reason you can write into the log. Re-editing a video while
    it is gaining views resets the momentum it had built. That grade is creator-observed —
    YouTube documents nothing here, so it stands as our operating rule rather than
    [official]. The mechanics point the same way: `youtube_update` overwrites instead
    of patching (§3-2 step 3) and one casual title edit re-sends the description and
    thumbnail at whatever they currently are.

    **What this doesn't restrict.** Everything rule 9 attaches while the video is still
    private — thumbnail, subtitle tracks, playlist, portrait first frame — and the
    private→public flip itself, which is the publish completing. The portrait-surface
    check after going public reads the tile and changes nothing. Finishing an attachment
    that never landed still belongs to the publish: the subtitle track a publish-only
    scope rejected (§3 step 1), an FB `captionWarning` (§3 step 4), a first comment that
    failed. And replying to comments is the post-publish work we want — §5 checks that
    copy before it goes out.

    A factual error in what went out is the one discretionary fix worth the reset. Take it
    to the user first, then correct it and record what changed and why.

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
  | Files needed | `video.mp4`; optional requested YouTube SRT | `video.mp4` · `chapters.txt`; optional requested YouTube SRT |
  | Hashtags | 3–5 including `#Shorts` | **no `#Shorts`** — it gets misfiled as a short |
  | First publish | upload private, set the portrait frame, then public (rule 9) | **upload private, check, then public** (§3-2) |
  | Portrait surface | `oar*` required (rule 9) | n/a — for landscape the thumbnail is the surface |

  Every format uses the clean master. When requested, YouTube receives a separate
  `subs.srt` track that viewers can enable or disable.
- **Confirm the episode is actually finished**, not just marked finished.

  ```bash
  REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
  node $REF/episode-state.js .        # from the episode directory · exit 1 = a delivery blocker
  ```

  The check also verifies `output/video/delivery-proof.json` against the delivered files
  and source storyboard. A separate export without current assembly provenance
  must be rebuilt through the common builder and final pace pass. For a large final speech
  payload, the embedded chapter manifest must cover every original audio sample and every
  chapter join. The same preflight rejects a missing/unverified chapter, boundary gap,
  changed ordering or stale audio/script; a source scene PASS cannot replace this proof.

  Exit 1 here means the directory promised something it never delivered — a video with no
  per-platform text, a `queue_*: ready` marker with no video behind it, **an `output/` still
  holding the pre-pass build** (the pace pass in produce §7.5 writes the `── speedup x…` line
  to `output/video/build-report.txt`, then a `PASS final speech rate` line for a requested
  sidecar or the `subtitle-based rate check skipped` marker without one — the default,
  subtitle-free delivery). These blockers are technical, not quality verdicts. Publishing is
  the irreversible step, so resolve or explain one to the user before §1 rather than working
  around it.
- Confirm the `output/` artifacts exist and that `storyboard.md` says
  `status: produced` — otherwise point them at `/social-flow:produce` first.
  Both formats require `output/video/video.mp4`, the subtitle-free master.
  A missing burned-in copy or SRT is not a defect. Include an SRT only for a requested
  separate YouTube track; retain other historical assets without selecting them.
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
node ${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-meta.js output/youtube/meta.md; echo "[meta] exit=$?"
# Don't append | head to shorten the output — $? becomes that command's and a FAIL reads as 0
```

`check-meta.js` exit 2 (a meta.md outside the playbook §6 layout, an angle bracket in
the title, a preset hashtag missing, or `COMPREHENSION.answer` copied into the title or
description) and exit 1 both go into the approval prompt as findings for the user to
weigh — but only when the output ends with a `CHECK_META: exit=…` line. A broken
install exits 1 too, with a node stack and no tail, and that is **unchecked, not one
warning**.

On exit 4 the copy isn't Korean and the checker declined to judge it — that surface is
**unchecked, not clean**. Say so in the approval prompt by name, so the person approving
knows they are the only reader it got.

Exit 2 (S1) and exit 1 (warning) both go into the approval prompt as suggestions, with
the flagged lines quoted, and the user judges; a style finding never sends the copy back
to produce on its own. A fix the user wants is applied and the copy re-presented (rule 4).
**If the header line has `quote-exempt N`, list those N separately in the prompt** —
they're violations the checker excluded from the verdict without knowing whether the
source is genuine, so say whether each one quotes a real source or is our own sentence
in quotes. exit 3 means the checker didn't run — fix the path and run it again, and
if you can't, state "style unverified" in the prompt. If the checker file itself is
missing, python returns 2, so the existence check line above tells them apart.

Present the final version for each platform with AskUserQuestion — the full body/caption,
the media **local paths** (every platform gets `video.mp4`; YouTube gets a separate
SRT only when requested), the hashtags, each platform's first-comment copy, all of it; the account it
will publish to (from the account check); and the style-check results (per-surface exit
and score, number of quote exemptions). Options: [publish everything / some platforms
only / revise and re-present / stop]. **Passing this gate is the approval to actually
publish.** Reuse an existing instruction that authorizes these posts and comments or
delegates their wording; do not ask again for already authorized work. If they ask for
changes, apply them within that scope.

Threads carries the video on the post (§2 table), so there is no link placeholder.
Only a fallback episode that can't carry a video uses a reply link, and there the link
slot is still the `<IG_REELS_URL>` placeholder at this point (IG has to be published
first for the permalink to exist). Write "the IG reels permalink goes here" into the
prompt, and filling in that slot alone in §3 stays inside the approval — it isn't
editing a sentence, so rule 4's re-approval doesn't apply.

### 2. Getting public media URLs (required for IG and Threads · FB images/video)

The `imageUrl`/`videoUrl` on the publish tools must be a **publicly reachable HTTPS
URL** — the platform crawls it, so local paths and authenticated URLs won't do
(YouTube is the one exception: it uploads the local file, so no hosting needed).
**Subtitle files are passed as local paths on every platform** — they aren't hosted.

Use the same subtitle-free master on every platform.

| Platform | Video | Separate subtitles |
| --- | --- | --- |
| YouTube | `video.mp4` local path | Only when requested: `captionFilePath` or `captionTracks` |
| Facebook | `video.mp4` public URL | Omit caption inputs unless separately requested |
| Instagram | `video.mp4` public URL | None; do not burn subtitles into the video |
| Threads | `video.mp4` public URL | None; do not burn subtitles into the video |

Host only the selected clean master and verify its public URL. Never choose a legacy
`video-sub.mp4` because it happens to exist. Caption text in an Instagram/Threads post
is platform copy, not permission to draw subtitles into the video.

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

**There is no ordering constraint** — now that Threads carries its own video, the
dependency on the IG permalink is gone. Publish in any order.

Only the fallback (an episode that can't carry a video) puts **IG reels before
Threads**, because the link in the Threads reply is then the IG permalink. If the IG
publish fails there, hold Threads and ask the user for a replacement link (the YouTube
permalink, say).

1. **YouTube**: `youtube_publish` — title/description from `output/youtube/meta.md`,
   `videoFilePath`=output/video/**video.mp4** (the clean copy),
   **`thumbnailFilePath`=cover.jpg required** (leave it out and a random frame becomes
   the thumbnail). When the episode has a rendered cover, take the file from
   `episode_cover read` → `publish.youtube` instead ([generate-cover](../generate-cover/SKILL.md));
   a `stale` cover is rendered again first (local, $0). **Only for requested separate YouTube subtitles**, pass
   `captionFilePath`=output/video/subs.srt; for requested multiple languages pass
   **`captionTracks`** instead, listing the requested
   `subs.<lang>.srt` with its BCP-47 code (`[{filePath: …/subs.srt, language: "ko"},
   {filePath: …/subs.en.srt, language: "en"}, …]`; the two arguments are mutually
   exclusive).
   A `thumbnailWarning` or `captionWarning` means the publish succeeded — report what
   the warning says. Subtitle upload needs the **`youtube.force-ssl` scope** (the
   publish-only `youtube.upload` gets rejected). With a publish-only token, a scope
   error on the first call is normal, and at that point the video is already up, so
   **don't republish** — reissue the token and upload just the subtitles separately
   (`references/token-setup.md`). The quota differs too — the upload is 1 unit but the
   subtitles are 400 **per track** (three languages = 1,200), so upload each language
   once per episode. `captionLanguages` in the response says which tracks went up, and
   a per-language `captionWarning` ("en: …") means only that language failed — upload
   just it in YouTube Studio. No standalone existing-video caption-upload MCP tool
   is exposed here; never call youtube_publish again merely to add or repair a track.
   **Don't set `containsSyntheticMedia`** (it defaults to true). This pipeline uses generated
   video and Lyria music, so it falls under AI disclosure, and YouTube states that
   disclosure doesn't affect reach or monetization eligibility while warning that
   habitual non-disclosure brings forced labels, removal, and YPP suspension. Turning
   it off requires the user to confirm an exemption reason (the exemption list:
   script/title/thumbnail/subtitle/idea generation, cloning your own voice,
   non-realistic animation, color grading and filters).
   **The YouTube publish isn't done until the shorts portrait first frame is set
   (absolute rule 9 — not skippable).** What `thumbnailFilePath` changes is only the
   landscape surface (search results, share previews, embeds); the portrait frame used
   by the shorts feed and the channel shorts tab is separate. Leave it unset and a
   random mid-video frame becomes the shorts first frame.
   Since 2026-11-03 YouTube documents `thumbnails.set` for Shorts after processing
   finishes, and `youtube_publish` now waits for that before setting the cover
   (`processingNote` says when it couldn't). This channel hasn't measured whether the
   API cover reaches the shorts tab yet, so keep the Studio step below until a public
   shorts-tab check shows the API cover there.

   **Set it in a browser while the video is still private** —
   `studio.youtube.com/video/<id>/edit` → the `⋮` over the portrait image in the
   thumbnail box → **"Select from video"** → the cover frame → Done → Save. Drive it
   with ego lite (the only browser lane — no Chrome MCP fallback).
   `Change` in that same menu is file upload and only swaps the landscape surface.
   The emulator route in `references/shorts-surface-adb.md` is the fallback for when
   the picker is missing or the cover isn't among the candidates.

   **The target frame is the moment the cover is complete** — use the timestamp where
   `produce` pulled `cover.jpg` (the cover transition completion time in
   `build-report.txt`; around 6 seconds in this pipeline). At the frame picker's first
   slot (t=0) the hero stat isn't up yet.

   **With a rendered cover** (`episode_cover`): its copy is drawn on a still that is not in
   the video, so "Select from video" cannot pick it. Look at the portrait image in the
   Studio thumbnail box while private first: if it already shows the rendered cover, the
   API set it (2026-11-03) — keep it and confirm on the shorts tab after going public. If it
   shows a video frame, pick the cover's own moment: when the decision's source is
   `kind:"frame"` of the finished video, that `seconds`; otherwise the nearest frame of the
   cover's shot. Report that the portrait tile carries the moment without the copy. `Change`
   (file upload) swapped only the landscape surface when measured on 2026-08-19.

   **The verdict is not `oardefault.jpg`** — it stays 404 after the frame is set, and
   `oar2.jpg` serves a cached older frame with a 200. Read the tile's `img` src from the
   channel shorts tab DOM (`youtube.com/@<handle>/shorts`), download it, and confirm by
   eye that it's the cover. This only works **after** the video is public, so the order
   is: set the frame while private → flip to public → check the shorts tab.

   If a login is needed, **ask the user right then** — don't defer it as an open item
   and report completion. Only if the user explicitly says they'll do it later do you
   record it as open, along with the videoId.
2. **Instagram**: `instagram_publish` — `videoUrl` is the public URL of the
   **clean subtitle-free master (video.mp4)** + platform caption text. No subtitles
   are baked into the picture. Pass `coverUrl` for the hosted rendered cover
   (`episode_cover read` → `publish.instagram`, hosted with the video; ≤8MB JPEG) — the API
   cannot change it after posting and Instagram has no private stage, so look at its
   `grid-3x4` and `feed-1x1` previews before the call. Without a rendered cover pass
   `thumbOffsetMs` at the cover time (or `coverUrl` for the hosted `cover.jpg`) so the grid
   doesn't show the first frame, and
   `isAiGenerated: true` for generated episodes. The tool waits up to 5 minutes for the
   container (Meta's documented window); a timeout publishes nothing, so a new call
   is safe. An Instagram-Login token can't upload a local file, so the URL must stay
   up until the call returns.
3. **Threads**: before calling, record the actual §1 human approval in
   `data/<channel>/episodes/<topic>/threads-publish-approval.json`. Use JSON with
   `approved: true`, the exact approved `caption`, and every supplied `imageUrl`,
   `videoUrl`, `linkUrl`, `selfReply`, or `replyToId`. Omit unused fields. Write this
   record only after approval, and update it only after approval for changed copy
   or media. This local record is an attestation, not server authentication of the
   human. The server requires the real episode directory, `storyboard/scenes.js`,
   and an approval record matching every publishing field.

   Call `threads_publish(channel, episodeRef: <topic>, ...)` — the approved body
   (no link) as `caption` and the
   public URL of the clean subtitle-free master (`video.mp4`) as `videoUrl`. This posts
   the video root; any authorized opening self-reply follows the shared first-comment guide.
   The video container transcodes, so the tool waits up to 2 minutes
   for FINISHED.

   No link in the body, same as before — the first two link-in-body posts got 9 and 21
   views, a tenth of the link-free posts from the same day (measured 2026-08-15).
   Carrying the video on the post means nothing links out, which sidesteps this.

   **Fallback** — only when there's no video file or hosting is blocked: publish the
   body plus the approved IG permalink `selfReply` in one `threads_publish` call
   with `episodeRef`. The approval record must contain both the exact `caption`
   and `selfReply` (one line like "full video here →" plus the link). The server
   posts the reply only after the root succeeds. A self-reply failure returns the
   root ID and a warning: record the partial result and do not republish the root.
   Threads is complete only when both posts succeed.
4. **Facebook**: `facebook_publish` — `videoUrl` is the public URL of the **clean copy
   (video.mp4)**. For a 9:16 short of **3–90 seconds** pass `reel: true` (and
   `isAiGenerated: true` for a generated episode): the post goes through the Page Reels
   endpoint. Meta refuses a longer Reel (error 1363128), and most mochi-bo episodes run
   100–215 s, so measure the master with ffprobe first and publish anything over 90 s
   without `reel` — it lands as a regular Page video, which no Meta document calls a
   Reel. A Reel is public as soon as it finishes; a `processingWarning` means it was
   accepted, so check the Page and never call again. Pass the rendered cover as
   `thumbnailFilePath` (`episode_cover read` → `publish.facebook`, local, ≤10MB); a
   `thumbnailWarning` means the post stands — set the cover in Meta Business Suite, never
   publish again. Omit subtitle parameters by default. Only if separate Facebook
   subtitles were also requested, use `captionFilePath`=output/video/subs.srt or
   `captionFiles` for requested languages, **default locale first**: `[{filePath:
   …/subs.srt, locale: "ko_KR"}, {filePath: …/subs.en.srt, locale: "en_US"}, …]`;
   FB locales are the underscore form, not BCP-47. Include the
   body → then **publish the first comment (character/hook and approved source/related link) immediately** with
   `facebook_comment` using the postId from the response. A `captionWarning` doesn't
   invalidate the publish — FB processes video asynchronously, so it may have caught
   it mid-processing. **Don't republish**; upload just the subtitles again a moment
   later (the postId in the response is the video_id).

After each platform's public post is confirmed, publish its authorized
`output/<platform>/first-comment.md` following
[episode first comments](../_shared/first-comment.md). This includes browser-published
posts and TikTok only after the browser cover and public-visibility checks finish;
inbox drafts and completed private Direct Posts wait for their actual public post. Record `output/first-comments.json` before sending and verify
the author and text afterward. Reuse the Facebook comment above and any approved Threads
self-reply rather than creating duplicate opening comments.

#### 3-2. Long-form (`youtube-long-16x9`) — upload private, check, then go public

For landscape long-form, step 1 above is called differently. The other platforms
aren't touched at all (preset `platforms: ["youtube"]`).

1. Call `youtube_publish` with **`privacyStatus: "private"`**.
   `videoFilePath`=`video.mp4` (clean) · `thumbnailFilePath`=`cover.jpg` ·
   Only when YouTube subtitles are requested, add `captionFilePath`=`subs.srt` or
   `captionTracks` for the requested languages; otherwise omit them. `caption` (the description) carries the **chapter
   timestamps** — `output/video/chapters.txt` is that list, built from the builder's
   measured times, with `00:00` as the first line and three or more entries. Add
   hashtags if you like, but **never `#Shorts`.**
2. Open `https://www.youtube.com/watch?v=<videoId>` and **look at four things** —
   (1) has the quality come up to the final resolution (if it's still processing,
   wait), (2) if requested, does the separate subtitle track turn on, (3) do the description's chapters draw
   as segments on the scrubber, (4) is the thumbnail our cover.
3. Once all four pass, flip it to `privacyStatus: "public"` with `youtube_update`.
   **On a video you're touching for the first time, call it with `dryRun: true` first**
   and check `wouldSend` — this tool overwrites rather than patching, so it re-sends
   the fields you didn't pass at their current values.
4. If any one of them fails, tell the user **while it's still private** — that stage
   exists so the fix lands before anyone has seen it. Don't re-upload; re-uploading
   restarts the view count at zero. A subtitle track can still be replaced later without
   touching anything else (§2 table), but a description or thumbnail change once the
   video is public falls under rule 11.

Sometimes the chapters don't draw. Break the requirements (first line 0:00 · three or
more · at least 10 seconds apart) and our list is ignored in favor of auto chapters —
the builder checks those three first, so a `chapters.txt` that exists has passed them;
if they still don't show, check whether the lines broke when they were copied into the
description.

#### 3-3. Multi-language audio (dubbing) — what the API can and cannot do

The Data API has no endpoint for extra audio tracks — `captions.insert` covers
subtitles only, so this pipeline cannot upload dubs. Two real paths:

- **YouTube auto-dubbing** — on channels where YouTube has enabled the multi-language
  feature (https://support.google.com/youtube/answer/13338784) YouTube generates
  dubbed audio itself. Subtitle tracks the user requested and this skill uploaded seed
  that translation quality; a track is never added for this reason without the request.
- **Custom dub tracks** go up by hand in YouTube Studio (up to 30 languages; an
  audio-only file about the length of the video). The long-form private stage (§3-2)
  is the moment — attach the tracks while the video is private, then flip public.

Neither blocks a publish. When the user asks about multi-language reach, report these
two paths along with the multi-language subtitle tracks that did go up.

Handling failures: report the error as it came and **don't blindly retry the same call**
(the publish APIs aren't idempotent — after a timeout, check for a duplicate first via
the permalink or a recent-media query). A failed comment never calls for republishing
the video. For an uncertain comment submission, inspect the same post and receipt before
retrying; a definitive rejection may be retried after its cause is fixed. Record the
post ID and error if unresolved. Threads can return a published root with a failed
self-reply; preserve that partial result and retry only the missing reply after checking.

### 4. Completion checklist (don't say "published" until every box is ticked)

**A 200 from the API is not completion.** Walk this list, and if anything is open, name
the open item and say what's left. Reporting completion with work still outstanding is
the most frequent failure in this skill.

- [ ] **YouTube — the landscape thumbnail is our cover.** Download
      `i.ytimg.com/vi/<videoId>/maxresdefault.jpg` and compare it to `cover.jpg` by eye.
      A `thumbnailWarning` means it did **not** attach — don't just report the warning
      and move on.
- [ ] **YouTube — the portrait first frame is set.** Web Studio frame picker (rule 9).
      `thumbnailFilePath` does not change this. Skip it and a mid-sentence expression is
      the first thing the shorts feed shows.
- [ ] **YouTube — the portrait surface was checked after going public.** Read the tile's
      `img` src from the channel shorts tab DOM and confirm it's the cover (not
      `oardefault.jpg`).
- [ ] **YouTube — private actually became public.** Read `privacyStatus` back from the
      `youtube_update` response. Don't flip it while anything above is still open.
- [ ] **YouTube — every requested subtitle track attached (skip when none requested).** No `captionWarning`,
      `captionLanguages` in the response lists every language you passed, and CC shows
      on the watch page.
- [ ] **Threads — the video is on the post** (rule 6). Open the permalink and confirm it
      plays. A body-only post is incomplete.
- [ ] **Every requested first comment is up.** Match the channel author, text and target
      post; record comment ID/permalink when available in `output/first-comments.json`.
      Facebook's link and story hook share one comment. Report unavailable or unverified
      comments separately from the published videos.
- [ ] **Instagram — a permalink came back.** A 200 on the container is not a publish.
- [ ] **Any temporary tunnel is torn down** — `pgrep -fl "cloudflared|http.server"`
      prints nothing.
- [ ] **The metadata is final** (rule 11). Every box above is ticked, so nothing further
      gets edited on this video. If a growth loop is watching it, note here when the
      watch started.

Anything that needs the user (a login, say) gets **asked for right then**. Don't defer
it and report the rest as done.

### 5. Record and wrap up

When you reply to comments after publishing (`sns_comment_reply`), check the copy
first as well. For THREADS, create a `surface: "reply"` draft with its parent
comment ID as `replyToId` (`threads_draft_create` returns `draftId` + `bodyHash`), then
pass that `draftId` with `channel` to `sns_comment_reply`. The server verifies only that
the posted body hashes to the draft's hash, the channel matches and the reply target
matches; the draft needs no review. `threads_review_submit` records reviews as hash-bound
evidence and never blocks, and `check-style.py` findings come back as suggestions.
The episode fallback self-reply above is already handled in its approved call.
A reply is person-to-person talk, which is where AI phrasing gets
spotted fastest — golden-hour response isn't a reason to skip the check.

```bash
printf '%s\n' "$reply_copy" | \
  python3 ${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-style.py --surface reply -
```

Use a growth-post-reviewer read when it helps resolve wording or context concerns.
Keep the original comment and post body available. A score or fixed review-round count
does not decide whether to send; the actual reply authorization and runtime inputs do.
Record unresolved findings without claiming a passing review.

- Record in `data/<channel>/episodes/<topic>/output/publish-log.md`: a table of
  timestamp, platform, post id, permalink, caption summary, and the approver's decision.
  **Write the §4 checklist beside it, item by item, as O/X** — an open item has to
  survive in the log for the next person to finish it.
- **A change someone wants after publishing goes into the log, not into the video**
  (rule 11) — write what they asked for and why under the episode's row, and the next
  episode carries the fix. Comment replies are the exception; they're the post-publish
  work, and the copy check above covers them.
- Update `storyboard.md` to `status: published`.
- If you used a temporary tunnel, verify the teardown per §1, then give the final
  report as a platform/permalink table.

## Additional Resources

### Reference Files

- **`references/token-setup.md`** — per-platform credential issuance, file conventions, refresh procedures (Threads/IG 60 days · FB indefinite · YouTube OAuth)
- **`references/shorts-surface-adb.md`** — setting the YouTube shorts portrait surface (`oar*`) frame: the channel-dedicated AVD + adb procedure, its traps, and the oardefault verdict

## Project SNS preferences

Read the episode settings snapshot when present. Its `sns` records identify target
platforms and the expected account IDs; explicit current publishing instructions
still govern scope. Recheck live identity with `sns_account_check` before upload.
Resolve an account-ID mismatch with the user before publishing to another account.
Credentials stay in the external channel token directory; `credentialRef` never
contains a token. After verification, refresh the workspace SNS record through
`project_manage update` if it targets this channel, preserving other platforms and
all existing episode snapshots. Pending connection state does not authorize upload.


## TikTok video delivery

**Owner directive (2026-11-18): upload private → edit and verify the cover in
browser → make the same post public.** This order applies to every channel and
both browser and API-assisted uploads. A private upload is not a completed public
publication. Read [TikTok private upload and cover](references/tiktok-private-cover.md)
for the browser steps, saved evidence and recovery. Do not upload publicly first
and plan to fix the cover afterwards.

Use the channel's clean final video and approved caption; for Mochi & Bơ use the
Vietnamese caption. Match the live account to the channel before uploading. Reuse
the user's authorization for this exact episode and account through the private,
cover and public steps; do not ask again solely because the visibility changes.
Setup alone does not authorize an upload.

- Browser route: use the logged-in TikTok Studio in **ego lite**. API credentials
  are not required for browser upload. Verify the account, select **Only you**
  (`SELF_ONLY`), upload, then edit and save the cover while still private. No browser
  fallback when ego lite is unavailable.
- API route: run `sns_account_check(channel)` and match the live handle/open_id.
  Missing OAuth/scopes routes to [setup-tiktok](../setup-tiktok/SKILL.md) only when
  an API route is needed. `tiktok_upload` delivers an inbox draft, not a private
  post; finish it as **Only you** before continuing with the browser cover step.
- Direct Post: call `tiktok_creator_info` first. Show nickname/avatar, media preview,
  editable caption, current limits and interactions. Use the authorized initial
  privacy `SELF_ONLY` only if the fresh creator options allow it; the schema has no
  implicit privacy default. Comments/duet/stitch start unchecked. Preserve truthful
  commercial/AI disclosures and mark generated videos with `isAigc:true`. Obtain
  [Music Usage Confirmation](https://www.tiktok.com/legal/page/global/music-usage-confirmation/en)
  acceptance and, when applicable,
  [Branded Content Policy](https://www.tiktok.com/legal/page/global/bc-policy/en)
  acceptance. Branded content cannot use SELF_ONLY through Direct Post; do not
  suppress its disclosure or switch to public to bypass this. Use the browser
  route if it supports the required private/disclosure combination; otherwise
  report the conflict without uploading. Unaudited clients have additional private
  account restrictions; do not change account privacy or claim an audit to proceed.
- Save requestId, publishId and receipt path in publish-log.md, then call
  `tiktok_status`. Never resubmit after a timeout. SEND_TO_USER_INBOX confirms draft
  delivery; PUBLISH_COMPLETE confirms processing of the submitted post, which is
  still private for this workflow. Record the private post's stable ID/link from
  Studio; absence from `tiktok_videos` is expected because that tool lists public
  posts. Never treat that absence as upload failure or create a replacement.
- After the browser confirms the saved cover, change the **same post** to Everyone
  and verify its public visibility and static cover. These tools do not expose a
  cover-image update or a visibility-update API; do not call `tiktok_publish` again
  to promote the private post. Only after public verification send authorized first
  comments and report publication complete.
- `tiktok_videos` can report public view/like/comment/share counts later. It does not
  supply audience geography, watch time or comment moderation.

## Existing video subtitles

When the user requests translated captions on an already published video, preserve
the video ID and clean master. Use `facebook_captions action:list` with the checked
channel, video ID and expected Page ID, then `action:add` with authorized SRT tracks.
The tool preserves the default and skips existing locales; a presence check does not
compare their text. Save the per-language result and re-list uncertain writes before
retrying. Never republish a video to recover a caption error.

YouTube accepts multiple caption tracks on existing videos in Studio or via
`captions.insert` with `youtube.force-ssl`. When the channel has no such OAuth token,
use the logged-in Studio with ego lite. Instagram and TikTok publishing APIs do not
accept an uploaded SRT as a video subtitle track; their post `caption` fields are
post copy. Check their current in-app caption/translation controls separately.

See [review translations](../storyboard/references/review-localization.md) for the
separate storyboard language picker. No picker changes a viewer's platform settings.
