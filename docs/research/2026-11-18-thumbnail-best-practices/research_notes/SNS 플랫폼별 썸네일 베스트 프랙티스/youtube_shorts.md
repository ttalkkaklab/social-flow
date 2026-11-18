# YouTube Shorts thumbnails / cover frames (as of 2026-11-18)

Scope: vertical 9:16 Shorts only. Capabilities changed three times in 2024–2026 (Sep 2024 app editor, Jul 2026 Studio upload, Nov 2026 Data API), so every capability claim below carries a date. Third-party pages written before 2026-11-03 routinely say "no custom Shorts thumbnails via API" or "under 2 MB"; those are outdated.

Timeline at a glance:
- 2024-07-16: YouTube says custom Shorts thumbnails are not planned for 2024 (feed shows no thumbnail) — [PPC Land](https://ppc.land/youtube-ends-2-year-wait-for-shorts-thumbnails-but-blocks-a-b-testing/)
- 2024-09-04: Mobile app (iOS/Android) gets a frame picker plus text, filters and emoji on the Shorts thumbnail — [Search Engine Journal](https://www.searchenginejournal.com/youtube-rolls-out-new-shorts-thumbnail-editing-features/526162/)
- 2025-01-28: YouTube blog quotes creator Jenny Hoyos: "99.9% of the views are coming from the Shorts feed" — [YouTube Official Blog](https://blog.youtube/creator-and-artist-stories/youtube-shorts-deep-dive/)
- 2025-12: Long-form A/B test (titles + thumbnails, up to 3 variants); Shorts excluded — [PPC Land](https://ppc.land/youtube-ends-2-year-wait-for-shorts-thumbnails-but-blocks-a-b-testing/)
- 2026-07-24/25: Studio desktop custom image upload for Shorts, YPP creators first; desktop also offers three suggested frames — [YouTube Official Blog](https://blog.youtube/news-and-events/youtube-studio-custom-thumbnail-updates/)
- 2026-09-14: Data API thumbnail max file size 2 MB → 50 MB — [Revision history](https://developers.google.com/youtube/v3/revision_history)
- 2026-11-03: Data API `thumbnails.set` officially supports Shorts (after processing); `thumbnails` resource gains `shortsAspectRatio` — [Revision history](https://developers.google.com/youtube/v3/revision_history)

## 1. Where a Shorts thumbnail shows, and how it is cropped

### Takeaway
The thumbnail is not shown in the swipe Shorts feed (the video autoplays there); it governs the click on the channel Shorts tab/home tab grid, the homepage Shorts shelf, search results, subscriptions and link previews. Google's API docs say Shorts thumbnails are cropped to 9:16 portrait, but YouTube's Creator Liaison reportedly said they render "closer to 3:2" on some surfaces; this conflict is unresolved, so keep the subject and text in the center band.

### Cited Findings
- YouTube's stated reason for not building Shorts thumbnails in 2024: most Shorts views come from the Shorts feed, where no thumbnail is shown (statement dated 2024-07-16, as reported) — [PPC Land](https://ppc.land/youtube-ends-2-year-wait-for-shorts-thumbnails-but-blocks-a-b-testing/)
- At the 2026-07-25 launch, Rene Ritchie (Creator Insider) said creators pressed for control on the homepage and the home and Shorts tabs of channel pages, where presentation "to brands is really important" — [PPC Land](https://ppc.land/youtube-ends-2-year-wait-for-shorts-thumbnails-but-blocks-a-b-testing/)
- Ritchie reportedly said Shorts thumbnails render closer to 3:2 than 9:16, so key content should stay away from the edges; the article frames the safe area as "horizontal, not vertical" and says text near the top or bottom of a vertical design can be cropped out — [PPC Land](https://ppc.land/youtube-ends-2-year-wait-for-shorts-thumbnails-but-blocks-a-b-testing/); [Relevant Audience, 2026-07-31](https://www.relevantaudience.com/social-media-marketing/youtube-shorts-custom-thumbnails-no-ab-testing/) (neither page quotes Ritchie verbatim on 3:2)
- Contradicting the 3:2 claim, the official Data API resource says: "For YouTube Shorts, the image is cropped to a 9:16 portrait aspect ratio." and "For standard videos, the image is not cropped, but may include black bars" — [YouTube Data API: Thumbnails resource](https://developers.google.com/youtube/v3/docs/thumbnails)
- The `thumbnails` resource has a `shortsAspectRatio` key: "The Shorts aspect ratio (9:16) version of the thumbnail image. This image size is available for YouTube Shorts that have a custom thumbnail set." (object with `url`, `width`, `height`; no fixed dimensions documented). The classic keys (`default` 120×90 … `maxres` 1280×720) are landscape — [Thumbnails resource](https://developers.google.com/youtube/v3/docs/thumbnails); added 2026-11-03 per [Revision history](https://developers.google.com/youtube/v3/revision_history)
- Practitioner list of surfaces (opinion/secondary): not in the swipe player; shown on channel Shorts grid, homepage Shorts shelf, search results, subscriptions feed, homepage recommended rail; a 16:9 image shows black bars or awkward crops in vertical placements — [vidIQ, 2026-06-05](https://vidiq.com/blog/post/youtube-shorts-custom-thumbnails/)
- Other practitioner pages list search results, channel page and shared links — [ShortSync guide (2026)](https://www.shortsync.app/guides/youtube-shorts-custom-thumbnail); search, channel page and subscription feeds, not the swipe feed — [Relevant Audience](https://www.relevantaudience.com/social-media-marketing/youtube-shorts-custom-thumbnails-no-ab-testing/)
- Search snippets (pages not opened, attribution unconfirmed) show some guides telling creators to design Shorts thumbnails at 16:9 / 1280×720; this conflicts with Google's 9:16 guidance and should be treated as wrong for Shorts — e.g. [creatorr](https://creatorr.pages.dev/blog/youtube-shorts-thumbnail-strategy-2026)
- In-repo measurement (2026-08, before the API change): `thumbnails.set` changed only the landscape surface (hq720/maxresdefault: search, link previews, embeds, suggestions), while the portrait `oar*` frame used by the Shorts tab, Shorts feed and Shorts search changed only via frame selection (web Studio "Select from video", measured 2026-08-19, or the native app) — [skills/publish/references/shorts-surface-adb.md](../../../../../skills/publish/references/shorts-surface-adb.md)

### Inferences
- A Short effectively has two thumbnail images: a landscape one (classic keys, used by search/embeds/link previews) and a portrait one (Shorts tab, Shorts shelf). A single 9:16 upload must survive both a 9:16 tile and a center crop toward landscape/3:2. The safe design is a centered subject and text inside a horizontal center band roughly the middle third of the height.
- The "3:2" figure may be a mis-transcription of the portrait ~2:3 shelf tile, or a real landscape crop on desktop home. Either way the center-band rule satisfies both.
- External embeds and link previews (Slack, KakaoTalk, X cards) fetch the landscape `hqdefault`/`maxresdefault` images, so the center band of the 9:16 image is what those surfaces show.

### Gaps
- No official YouTube page lists, per surface, the exact crop ratio of a Shorts thumbnail (Shorts tab, home shelf, search, subscriptions, related, TV). The 3:2 claim could not be checked against the Creator Insider video transcript.
- Whether TV (Shorts on connected TVs) uses the portrait or landscape thumbnail was not found.

## 2. How a creator sets it: app, Studio, Data API

### Takeaway
As of 2026-11-18 there are three routes: (a) mobile app frame picker with text/filters/emoji (since 2024-09); (b) YouTube Studio on desktop: upload a custom image (YPP channels first, since 2026-07-25) or choose one of three suggested frames; (c) Data API `thumbnails.set`, officially supporting Shorts since 2026-11-03 but only after processing finishes. Whether API-set images reach the portrait Shorts-tab tile for non-YPP channels is unverified.

### Cited Findings
- App (2024-09-04): iOS and Android creators can scrub the video to select a thumbnail frame, and add text, filters and emojis; mobile-only — [Search Engine Journal](https://www.searchenginejournal.com/youtube-rolls-out-new-shorts-thumbnail-editing-features/526162/)
- Studio (blog dated 2026-07-24): "YouTube Partner Program creators can start uploading custom thumbnails for Shorts. We'll expand this to more creators over time." "You can also now choose from three suggested thumbnail frames for Shorts on desktop." "You can still pick any frame from the video through the YouTube app on mobile." — [YouTube Official Blog](https://blog.youtube/news-and-events/youtube-studio-custom-thumbnail-updates/)
- Rollout began 2026-07-25 via a Creator Insider video (Rene Ritchie); custom images can be added during upload or retroactively from Studio Content on desktop — [PPC Land](https://ppc.land/youtube-ends-2-year-wait-for-shorts-thumbnails-but-blocks-a-b-testing/). (A Neal Mohan post "Custom thumbnails for Shorts are rolling out to all @YouTube Partner Program creators" appeared only in a search snippet, page not opened, attribution unconfirmed.)
- Help Center (current): "Custom thumbnails for Shorts are currently only available to add in YouTube Studio on a computer." "Your account must be verified to use this feature." "For Shorts, try to upload a thumbnail with an aspect ratio of 9:16." Recommended 2160×3840 for Shorts, minimum height 640 px; JPG or PNG; desktop limit 50MB; daily custom-thumbnail limit per channel ("Daily custom thumbnail limit reached" → retry in 24 h); "It may take time for your thumbnail changes to appear" — [YouTube Help: Add custom thumbnails](https://support.google.com/youtube/answer/72431?hl=en). The Help page does not mention YPP; the blog does.
- Data API revision 2026-11-03: "The thumbnails.set method now supports uploading custom thumbnails for YouTube Shorts after video processing is complete." Same entry adds `shortsAspectRatio` to the thumbnails resource — [Revision history](https://developers.google.com/youtube/v3/revision_history)
- `thumbnails.set` reference: "Uploads a custom video thumbnail to YouTube and sets it for a video, including YouTube Shorts." "When setting a custom thumbnail for a YouTube Short, call this method only after the video has finished processing" (`processingDetails.processingStatus` = `succeeded`); "If called before video processing is complete, the custom thumbnail might not be applied to the Short." Max 50MB; MIME `image/jpeg`, `image/png`, `application/octet-stream`. Errors: 400 `invalidImage`, 400 `mediaBodyRequired`, 403 (not authorized / no permission to set custom thumbnails), 404 `videoNotFound`, 429 `uploadRateLimitExceeded` — [thumbnails.set](https://developers.google.com/youtube/v3/docs/thumbnails/set)
- Data API revision 2026-09-14: max thumbnail file size raised from 2MB to 50MB (also `playlistImages.insert`); 2026-09-11: `fhd`/`qhd`/`uhd` thumbnail sizes added for some videos — [Revision history](https://developers.google.com/youtube/v3/revision_history). PPC Land dates a 2MB→50MB thumbnail limit change to October 2025 ([PPC Land](https://ppc.land/youtube-ends-2-year-wait-for-shorts-thumbnails-but-blocks-a-b-testing/)); this may be a separate Studio-side change rather than the API change, or a dating error. Unresolved; the API limit is 50MB either way as of 2026-11.
- Vendor reports: before 2026-11-03 API-set Shorts thumbnails "often did not stick"; the API needs a phone-verified channel (youtube.com/verify), otherwise the Short posts with the auto-picked frame; vendor sets the thumbnail right after processing (usually minutes) — [ShortSync](https://www.shortsync.app/guides/youtube-shorts-custom-thumbnail). Search snippets (pages not opened, attribution unconfirmed) show earlier vendor docs saying Shorts "do not currently support thumbnails" / "no custom thumbnails via API for Shorts" (likely pre-change, outdated) — [Ayrshare](https://www.ayrshare.com/docs/help-center/technical-support/youtube-thumbnail-unverified-channel.md); [getlate docs](https://docs.getlate.dev/resources/media-guidelines/youtube); and bundle.social (2026-08-17) saying uploads could "fail silently while the video succeeds" — [bundle.social](https://info.bundle.social/blog/youtube-shorts-api-secrets)
- Auto-pick default: if no frame is chosen, YouTube shows an automatically picked mid-video frame as the Shorts tile (in-repo observation, 2026-08) — [shorts-surface-adb.md](../../../../../skills/publish/references/shorts-surface-adb.md)
- vidIQ (2026-06-05) states desktop upload "rolled out gradually during 2025", 1080×1920, under 2 MB, JPG/PNG/GIF/BMP, and its own FAQ says thumbnails can only be changed in the mobile app — internally inconsistent and contradicted by the official 2026-07 announcement and 50MB limit — [vidIQ](https://vidiq.com/blog/post/youtube-shorts-custom-thumbnails/)

### Inferences
- For the pipeline: upload with `videos.insert`, poll `videos.list?part=processingDetails` until `processingStatus == succeeded`, then call `thumbnails.set` with a 9:16 JPG/PNG (2160×3840 or at least 1080×1920, ≤50MB). Verify by reading `snippet.thumbnails.shortsAspectRatio` back: its presence is the only API-visible evidence that a portrait custom thumbnail exists.
- If `shortsAspectRatio` is absent after a successful set (e.g., non-YPP channel, or eligibility not yet expanded), the landscape keys may still have changed while the Shorts tile stays the auto frame. Keep the in-repo frame-selection fallback (Studio "Select from video" or app frame picker) for that case.
- Private-first upload (repo rule) is compatible: set the thumbnail while private, then flip to public.

### Gaps
- No official statement on whether the 2026-11-03 API support is limited to YPP channels like the Studio upload; the Help page says only "verified". Needs a live test on a non-YPP channel.
- Not searched effectively (Stack Overflow is blocked to this crawler; Issue Tracker search returned nothing usable): whether any developer report after 2026-11-03 confirms that an API-set image replaces the portrait `oar*` tile (rather than only the landscape keys). The in-repo August 2026 finding predates the change and may be superseded.
- Exact pixel dimensions YouTube serves under `shortsAspectRatio` are undocumented.

## 3. Does the Shorts thumbnail matter for performance?

### Takeaway
For first-week reach, little: almost all Shorts views come from the feed, where the thumbnail is invisible, and YouTube itself used that argument for two years. It matters for channel-page browsing (new visitors and brands scanning the grid), search, subscriptions and the long tail of older Shorts. No official or credible public dataset quantifies the CTR effect.

### Cited Findings
- YouTube blog (2025-01-28), creator Jenny Hoyos in conversation with Shorts product lead Todd Sherman: "Thumbnails are not important because 99.9% of the views are coming from the Shorts feed…" and "As far as channel marketing and branding, I think thumbnails are very important." The blog attributes the 99.9% to Hoyos, a creator, with no YouTube-wide dataset behind it — [YouTube Official Blog](https://blog.youtube/creator-and-artist-stories/youtube-shorts-deep-dive/). Conflict: PPC Land attributes the 99.9% (2025-01-29) to "YouTube's Shorts product lead" — [PPC Land](https://ppc.land/youtube-ends-2-year-wait-for-shorts-thumbnails-but-blocks-a-b-testing/). The primary blog text supports the Hoyos attribution.
- Todd Sherman (2023-08-28, paraphrase, no verbatim quote): advised creators to skip custom Shorts thumbnails because viewers rarely see them compared with long-form; viewers flipping through the feed do not see other thumbnails — [Creator Handbook](https://www.creatorhandbook.net/youtube-explains-how-the-youtube-shorts-algorithm-works/)
- 2026-07 launch rationale was presentation on channel pages and homepage, "to brands is really important" (Ritchie) and "making it easier for viewers to discover your content and know what to expect" (YouTube blog) — [PPC Land](https://ppc.land/youtube-ends-2-year-wait-for-shorts-thumbnails-but-blocks-a-b-testing/); [YouTube Official Blog](https://blog.youtube/news-and-events/youtube-studio-custom-thumbnail-updates/)
- Shorts generate two billion monthly hours on TV screens (YouTube disclosure, June 2026, as reported) — [PPC Land](https://ppc.land/youtube-ends-2-year-wait-for-shorts-thumbnails-but-blocks-a-b-testing/)
- Practitioner opinion: non-feed surfaces are "where most discovery and rewatching happens for older Shorts" (unquantified) — [vidIQ](https://vidiq.com/blog/post/youtube-shorts-custom-thumbnails/). A vidIQ video claim that under 13% of some channel's Shorts views came from the feed and over half from search, and a "15–30% gain" from custom thumbnails, appear only in search snippets without a primary dataset — treat as unverified.

### Inferences
- Priority order for a Shorts pipeline: (1) the opening second of the video (feed), (2) a clean portrait tile for the channel grid and search, (3) landscape-safe center for link previews/embeds. Spend generation effort accordingly; a designed frame from the video is usually enough.
- Check the plugin's own channels in YouTube Analytics "Traffic source: Shorts feed vs YouTube search vs Channel pages" before investing in per-Short custom art.

### Gaps
- No YouTube-published data on how custom Shorts thumbnails change views or CTR; no A/B data possible (see §6). The "under 13% from feed" claim could not be traced to a primary source.

## 4. Design guidance

### Takeaway
Upload a 9:16 image (2160×3840 recommended), keep the face/subject and any text in the horizontal center band, use 2–4 large words at most, and keep one series style across the grid. Most of this is practitioner opinion; only the ratio and specs are official.

### Cited Findings
- Official specs: 9:16, 2160×3840 recommended, min height 640 px, JPG/PNG, ≤50MB on desktop — [YouTube Help](https://support.google.com/youtube/answer/72431?hl=en)
- Keep important type in the middle band; treat the safe area as horizontal; check at small sizes before publishing (reasoning from the reported 3:2 render) — [Relevant Audience](https://www.relevantaudience.com/social-media-marketing/youtube-shorts-custom-thumbnails-no-ab-testing/)
- vidIQ (opinion, "based on current mobile UI"): central safe zone about 900×1160 px within 1080×1920, margins roughly top 380, bottom 380, right 120, left 60 px; text that describes the video accurately; a clear visual of the topic; for tutorials show one step — [vidIQ](https://vidiq.com/blog/post/youtube-shorts-custom-thumbnails/)
- ShortSync (opinion): 2–4 large words max; a face with clear emotion, close-ups over wide shots; avoid mid-blink/mid-word frames; thumbnail text should differ from and complement the title; one consistent font/colour/layout across a series; check at phone size; the same image can double as Reels / Facebook Reel / Pinterest cover — [ShortSync](https://www.shortsync.app/guides/youtube-shorts-custom-thumbnail)
- Wbcom Designs (opinion, updated 2026-11-11): build a "thumbnail moment" into the video, such as a short title card or a clean shot with on-screen text, then select that frame in the app — [Wbcom Designs](https://wbcomdesigns.com/do-youtube-shorts-thumbnails-really-matter/)
- App editor (since 2024-09) can overlay text, filters and emoji on a chosen frame, which is the no-upload way to add a headline — [Search Engine Journal](https://www.searchenginejournal.com/youtube-rolls-out-new-shorts-thumbnail-editing-features/526162/)

### Inferences
- Two safe zones apply to different things: the feed-UI safe zone (vidIQ margins: avoid the bottom caption/button area and the right action rail) governs the video's own frames, while the thumbnail safe zone (center band) governs the uploaded cover. A cover built for both is a centered subject plus 2–4 words placed in the middle third, not at the top/bottom.
- Text on the uploaded cover image is fine under the repo's "nothing drawn over video" rule because the cover is a still image, not a moving picture; but under the repo's text-image rule a generated cover with Hangul must use GPT Image 2 or code-rendered type.
- Grid consistency matters more on Shorts than long-form because the channel Shorts tab is a dense portrait grid scanned at once.

### Gaps
- No official YouTube design guidance (font size, contrast) specific to Shorts thumbnails was found; all composition advice is practitioner opinion.
- Exact tile pixel sizes on mobile/desktop grids were not found, so minimum legible text height is an estimate.

## 5. "First frame = thumbnail" tricks, inserted title cards, and policy

### Takeaway
Common practitioner tricks (design a title card as the first frame, pick it, optionally trim it out) are allowed so long as the image honestly represents the video; the only relevant policy is "malicious clickbait". With Studio upload (YPP) and API support since 2026-11, the trick is mainly a fallback for channels without custom-upload access.

### Cited Findings
- Practitioner workaround: build a "thumbnail moment" (short title card or clean shot with on-screen text) into the video and select that frame in the app; "choose a frame from your Short to be used as the thumbnail before and after you upload" — [Wbcom Designs, updated 2026-11-11](https://wbcomdesigns.com/do-youtube-shorts-thumbnails-really-matter/). The same page still says Shorts thumbnails can "only" be edited in the app, not Studio, which is outdated since 2026-07.
- A variant (add the still as the first frame, select it, then trim it out in Studio) appeared only in a search snippet with no confirmed source page; whether a selected frame survives a Studio trim is unverified.
- Policy: Spam, deceptive practices & scams prohibits "Using maliciously misleading titles, thumbnails, descriptions, or imagery to trick users", i.e. a video "that does not deliver what was promised" (example: title promises a full match, video shows a clip); applies to private and unlisted content too — [YouTube Help: Spam, deceptive practices & scams](https://support.google.com/youtube/answer/2801973?hl=en)
- Feed context: the first second is the feed hook ("I really do think you have one second to hook someone, especially on Shorts." — Jenny Hoyos) — [YouTube Official Blog](https://blog.youtube/creator-and-artist-stories/youtube-shorts-deep-dive/)

### Inferences
- A static 1-frame title card at the start costs nothing in the feed if it is a single frame (≈40 ms), but a multi-frame static card hurts the feed hook. Prefer designing a real early frame (the video's first acted moment, or a planned "cover moment") that reads as a tile, then select it.
- Trimming in Studio re-processes the video and may reset the selected frame; untested. Safer pipeline path in 2026-11: upload the cover via `thumbnails.set`, verify `shortsAspectRatio`, fall back to frame selection.
- For this plugin, "nothing drawn over video" means a title card with type inside the moving video would violate the repo rule; the API/Studio custom image avoids that conflict.

### Gaps
- No official YouTube statement on inserted 1-frame title cards for Shorts; no data on their effect.

## 6. Test & Compare (A/B) for Shorts

### Takeaway
Not available for Shorts as of 2026-11-18, per the Help Center; long-form supports up to three title/thumbnail variants judged on watch time.

### Cited Findings
- "A/B testing is not available for Shorts." "You are not able to A/B test Shorts, Scheduled Lives, and Premiere videos at this time." Uploads up to three minutes that are square or taller count as Shorts; if a video converts to a Short, earlier tests become inaccessible. Long-form: up to 3 titles and/or thumbnails, desktop Studio only, up to two weeks, winner by watch time; not for made-for-kids, mature or private videos — [YouTube Help: A/B test titles & thumbnails](https://support.google.com/youtube/answer/13861714?hl=en)
- The 2026-07 Shorts thumbnail launch explicitly excluded A/B testing; long-form gained title + thumbnail tests (three variants) in December 2025 — [PPC Land](https://ppc.land/youtube-ends-2-year-wait-for-shorts-thumbnails-but-blocks-a-b-testing/)
- Practitioner advice against publishing duplicate Shorts to test thumbnails — [vidIQ](https://vidiq.com/blog/post/youtube-shorts-custom-thumbnails/)

### Inferences
- Any Shorts thumbnail testing must be sequential (swap the cover, compare channel-page/search traffic before vs after), which is confounded and slow; not worth automating now.
- Videos up to 3 minutes that are vertical are Shorts, so a long-ish vertical episode loses A/B eligibility; a pipeline that wants Test & Compare must publish 16:9 or over 3 minutes.

### Gaps
- No announced date for Shorts A/B testing.
