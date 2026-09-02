---
name: publish
description: >
  Posts finished episode files to Threads, Instagram, Facebook and YouTube. Use when the
  user asks to "게시해", "올려줘", "SNS 게시", "publish to social", "스레드/인스타/페북/유튜브에 올려", or once
  production is done. Takes the per-platform content under
  data/[channel]/episodes/[topic]/output/ through account checks and public media hosting,
  stops at a mandatory human approval gate, publishes through the social-flow platform
  tools as an immediate public post, and records the permalinks in publish-log.md.
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
4. **No distorting the facts** — publish only within the approved artifacts. If a
   caption needs fixing on the spot, take the corrected version back through the
   approval gate.
5. **Respect the limits** — Threads 250/24h, IG 100/24h, YouTube uploads 100/day
   (the videos.insert-only Video Uploads bucket, 1 unit per call — no reason to
   ration episode publishes).
6. **Threads carries the video on the post, FB puts the link in the first comment** —
   a Threads video episode goes out in one call: the casual spoken-style body (no link)
   as `caption` plus the public URL of the subtitle-burned cut as `videoUrl` (user
   directive 2026-08-19). Don't attach the video as a reply. Only an episode that can't
   carry a video falls back to a self-reply link.
   No link in the body either — the first two link-in-body posts got 9 and 21 views, a
   tenth of the link-free posts from the same day (measured 2026-08-15).
   FB: no link in the body → `facebook_comment` first comment, and
   **the FB publish is complete only once that comment is up too.**
7. **Every publish and comment tool call takes `channel: <channel-slug>`** — use this
   skill's first argument (data/<channel-slug>) as is. With a channel given, only that
   channel's token is used, with no fallback to the default token (prevents publishing
   from the wrong account — a server contract). If you get an error saying the channel
   has no token, walk the user through the channel-directory procedure in
   `references/token-setup.md`.
8. **Video and subtitles go up separately** — platforms that take a subtitle file
   (YouTube · Facebook) get the clean master (`video.mp4`) plus `subs.srt`. The
   burned-in cut (`video-sub.mp4`) is what **Instagram and Threads** use — neither has a
   path that accepts a subtitle file, so burning them into the picture is the only way.
   The §2 table is canonical for which file goes where; mix them up and YouTube ends up
   with subtitles twice over, or IG loses them entirely. When `output/video/` holds
   per-language files (`subs.en.srt` …), every one goes up as its own track —
   `captionTracks` on YouTube, `captionFiles` on Facebook (default language first).
9. **Every YouTube upload starts private — no exceptions** (user directive 2026-08-19).
   Call `youtube_publish` with **`privacyStatus: "private"`**, attach everything the
   cover needs, and only then flip to public with `youtube_update`. Publishing straight
   to public exposes a mid-sentence frame as the first thing anyone sees while you are
   still attaching the cover. This holds for short-form and long-form alike; the
   long-form specifics are rule 10.

   **What `thumbnailFilePath` changes is the landscape surface only** — search results,
   share previews, embeds. The portrait frame that the shorts feed and the channel
   shorts tab actually show is separate, and left unset **a random mid-video frame lands
   as the first frame** — an expression mid-sentence instead of our cover.

   **The portrait frame is set in a browser** (measured 2026-08-19) —
   `studio.youtube.com/video/<id>/edit` → the `⋮` over the portrait image in the
   thumbnail box → **"Select from video"** → the cover frame → Done → Save. Any browser
   we drive works (ego lite by default, Chrome MCP as fallback); the native app is not
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
- **Confirm the episode is actually finished**, not just marked finished.

  ```bash
  REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
  node $REF/episode-state.js .        # from the episode directory · exit 1 = blocked
  ```

  Exit 1 here means the directory promised something it never delivered — a video with no
  per-platform text, a `queue_*: ready` marker with no video behind it, **an `output/` still
  holding the pre-pass build** (the final pace pass in produce §7.5 is required; the check reads
  both the `── speedup x…` and `PASS final speech rate` lines in
  `output/video/build-report.txt`). Publishing is the irreversible step,
  so a blocker gets resolved or explained to the user before §1, never worked around.
- Confirm the `output/` artifacts exist and that `storyboard.md` says
  `status: produced` — otherwise point them at `/social-flow:produce` first.
  **Short-form** needs all three files — `output/video/video.mp4` (clean) ·
  `video-sub.mp4` (burned-in) · `subs.srt`. Per-language `subs.<lang>.srt` files exist
  only when profile.md §4 lists subtitle languages beyond the default — take every one
  that's there. A missing burned-in copy or subtitle file
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
node ${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-meta.js output/youtube/meta.md; echo "[meta] exit=$?"
# Don't append | head to shorten the output — $? becomes that command's and a FAIL reads as 0
```

`check-meta.js` exit 2 goes back to produce the same way an S1 does — a meta.md
outside the playbook §6 layout, an angle bracket in the title, a preset hashtag
missing, or `COMPREHENSION.answer` copied into the title or description. Its
exit 1 goes into the gate prompt as is — but only when the output ends with a
`CHECK_META: exit=1 …` line. A broken install exits 1 too, with a node stack and
no tail, and that is **unchecked, not one warning**.

On exit 4 the copy isn't Korean and the checker declined to judge it — that surface is
**unchecked, not clean**. Say so in the approval prompt by name, so the person approving
knows they are the only reader it got.

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
IG and Threads get `video-sub.mp4`), the
subtitle cue count, the hashtags, the FB first-comment copy, all of it; the account it
will publish to (from the account check); and the style-check results (per-surface exit
and score, number of quote exemptions). Options: [publish everything / some platforms
only / revise and re-present / stop]. **Passing this gate is the approval to actually
publish.** If they ask for changes, apply them and gate again.

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

Which file goes up differs per platform. This table is the source of truth.

| Platform | Video | Subtitles | Why |
| --- | --- | --- | --- |
| YouTube | `video.mp4` (local path) | `captionFilePath: subs.srt` — with extra languages, `captionTracks` listing every `subs.<lang>.srt` | uploaded as separate tracks via `captions.insert` — replaceable after publishing, viewer-selectable per language, and the source for auto-translation |
| Facebook | `video.mp4` (public URL) | `captionFilePath: subs.srt` — with extra languages, `captionFiles` (default locale first) | the `/{video_id}/captions` edge, one upload per locale |
| Instagram | **`video-sub.mp4`** (public URL) | none — burned into the picture | the container has no subtitle parameter |
| Threads | **`video-sub.mp4`** (public URL) | none — burned into the picture | the video rides on the post (`videoUrl`). The container takes no subtitle parameter, so it uses the same burn-in as IG. The video never goes in a reply |

The hosting directory needs **both the burned-in copy and the clean copy** — IG and
Threads share the burn-in, FB takes the clean copy. The filenames differ, so they can
sit in one directory together; check each one for a 200 with `curl -sI`.

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
   the thumbnail), **`captionFilePath`=output/video/subs.srt required** — and when
   per-language files exist, pass **`captionTracks`** instead, listing every
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
   just it in YouTube Studio.
   **Don't set `containsSyntheticMedia`** (it defaults to true). This pipeline uses Veo
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

   **Set it in a browser while the video is still private** —
   `studio.youtube.com/video/<id>/edit` → the `⋮` over the portrait image in the
   thumbnail box → **"Select from video"** → the cover frame → Done → Save. Drive it
   with whatever browser this session has (ego lite by default, Chrome MCP as fallback).
   `Change` in that same menu is file upload and only swaps the landscape surface.
   The emulator route in `references/shorts-surface-adb.md` is the fallback for when
   the picker is missing or the cover isn't among the candidates.

   **The target frame is the moment the cover is complete** — use the timestamp where
   `produce` pulled `cover.jpg` (the cover transition completion time in
   `build-report.txt`; around 6 seconds in this pipeline). At the frame picker's first
   slot (t=0) the hero stat isn't up yet.

   **The verdict is not `oardefault.jpg`** — it stays 404 after the frame is set, and
   `oar2.jpg` serves a cached older frame with a 200. Read the tile's `img` src from the
   channel shorts tab DOM (`youtube.com/@<handle>/shorts`), download it, and confirm by
   eye that it's the cover. This only works **after** the video is public, so the order
   is: set the frame while private → flip to public → check the shorts tab.

   If a login is needed, **ask the user right then** — don't defer it as an open item
   and report completion. Only if the user explicitly says they'll do it later do you
   record it as open, along with the videoId.
2. **Instagram**: `instagram_publish` — `videoUrl` is the public URL of the
   **burned-in copy (video-sub.mp4)** + caption. This is the only place the subtitles
   are baked into the picture.
3. **Threads**: `threads_publish` — the approved body (no link) as `caption` and the
   public URL of the burned-in copy (`video-sub.mp4`) as `videoUrl`. **One call finishes
   it** — no reply. The video container transcodes, so the tool waits up to 2 minutes
   for FINISHED.

   No link in the body, same as before — the first two link-in-body posts got 9 and 21
   views, a tenth of the link-free posts from the same day (measured 2026-08-15).
   Carrying the video on the post means nothing links out, which sidesteps this.

   **Fallback** — only when there's no video file or hosting is blocked: publish the
   body alone, then attach the IG permalink as a **self-reply** with `sns_comment_reply`
   (one line like "full video here →" plus the link). In that case, and only that case,
   Threads isn't published until the reply is up.
4. **Facebook**: `facebook_publish` — `videoUrl` is the public URL of the **clean copy
   (video.mp4)**, `captionFilePath`=output/video/subs.srt (a local path — with extra
   languages pass `captionFiles` instead, **default locale first**: `[{filePath:
   …/subs.srt, locale: "ko_KR"}, {filePath: …/subs.en.srt, locale: "en_US"}, …]`;
   FB locales are the underscore form, not BCP-47), plus the
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
   `captionFilePath`=`subs.srt` (or `captionTracks` when per-language files exist —
   same rule as the short-form step). `caption` (the description) carries the **chapter
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

#### 3-3. Multi-language audio (dubbing) — what the API can and cannot do

The Data API has no endpoint for extra audio tracks — `captions.insert` covers
subtitles only, so this pipeline cannot upload dubs. Two real paths:

- **YouTube auto-dubbing** — on channels where YouTube has enabled the multi-language
  feature (https://support.google.com/youtube/answer/13338784) YouTube generates
  dubbed audio itself. The subtitle tracks this skill uploads are what seed the
  translation quality, so publishing with captions is the lever this pipeline controls.
- **Custom dub tracks** go up by hand in YouTube Studio (up to 30 languages; an
  audio-only file about the length of the video). The long-form private stage (§3-2)
  is the moment — attach the tracks while the video is private, then flip public.

Neither blocks a publish. When the user asks about multi-language reach, report these
two paths along with the multi-language subtitle tracks that did go up.

Handling failures: report the error as it came and **don't blindly retry the same call**
(the publish APIs aren't idempotent — after a timeout, check for a duplicate first via
the permalink or a recent-media query). If only the FB first comment failed, retry just
the comment call; if it keeps failing, write down the postId and the reason and explain
the manual fix. Threads is a single call, so it has no partial failure — if it failed,
nothing was published, so check the permalink before calling again.

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
- [ ] **YouTube — every subtitle track attached.** No `captionWarning`,
      `captionLanguages` in the response lists every language you passed, and CC shows
      on the watch page.
- [ ] **Threads — the video is on the post** (rule 6). Open the permalink and confirm it
      plays. A body-only post is incomplete.
- [ ] **Facebook — the first comment is up** (rule 6).
- [ ] **Instagram — a permalink came back.** A 200 on the container is not a publish.
- [ ] **Any temporary tunnel is torn down** — `pgrep -fl "cloudflared|http.server"`
      prints nothing.

Anything that needs the user (a login, say) gets **asked for right then**. Don't defer
it and report the rest as done.

### 5. Record and wrap up

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
  **Write the §4 checklist beside it, item by item, as O/X** — an open item has to
  survive in the log for the next person to finish it.
- Update `storyboard.md` to `status: published`.
- If you used a temporary tunnel, verify the teardown per §1, then give the final
  report as a platform/permalink table.

## Additional Resources

### Reference Files

- **`references/token-setup.md`** — per-platform credential issuance, file conventions, refresh procedures (Threads/IG 60 days · FB indefinite · YouTube OAuth)
- **`references/shorts-surface-adb.md`** — setting the YouTube shorts portrait surface (`oar*`) frame: the channel-dedicated AVD + adb procedure, its traps, and the oardefault verdict
