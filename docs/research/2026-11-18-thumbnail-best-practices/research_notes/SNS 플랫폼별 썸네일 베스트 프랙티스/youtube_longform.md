# YouTube long-form (16:9) thumbnail best practices, as of 2026-11

Scope: horizontal long-form videos. Shorts appear only where the rule differs.
Research date: 2026-11-18. Evidence levels used below:
- **[OFFICIAL]**: YouTube Help Center or API docs.
- **[MEASURED]**: large-sample study with a stated method. All three large studies found (vidIQ, Eden, 1of10) measure **views relative to the channel's own baseline ("outlier/breakout")**, not CTR. None isolates the thumbnail from title, topic and timing.
- **[VENDOR]**: tool-vendor blog, no published method.
- **[PRACTITIONER]**: creator or strategist opinion and anecdote.
- **[SNIPPET]**: seen only in a search-result snippet, page not opened. Treat as unverified.

---

## 1. Official specs and rules (resolution, size, format, ratio, overlays, rendering, eligibility)

### Takeaway
The Help Center now recommends **3840×2160 (16:9), at least 640 px wide, JPG or PNG**. The size limit is **50 MB on desktop Studio and through the Data API, but 2 MB from mobile**. Custom thumbnails need a verified account and are capped per day. The widely repeated "1280×720, 2 MB" is outdated as a recommendation. 1280×720 now shows up officially only as the Test & Compare quality floor. YouTube publishes no official safe-area or badge geometry.

### Cited Findings
- [OFFICIAL] Help Center: thumbnails should "Have a resolution of 3840 x 2160 pixels for videos and 2160 x 3840 for Shorts". The minimum is 640 px wide for videos (640 px tall for Shorts). The page does not use the word "4K". — [YouTube Help: Add video thumbnails](https://support.google.com/youtube/answer/72431)
- [OFFICIAL] Aspect ratio: "try to upload a thumbnail with an aspect ratio of 16:9". Podcast playlists use 1:1 and Shorts use 9:16. — [YouTube Help 72431](https://support.google.com/youtube/answer/72431)
- [OFFICIAL] File size: "2 MB for video thumbnails or 10 MB for podcasts" when uploading on mobile, and "50MB for video, Shorts, and podcast thumbnails" on desktop. Formats: "image formats such as JPG or PNG". — [YouTube Help 72431](https://support.google.com/youtube/answer/72431)
- [OFFICIAL] The Data API `thumbnails.set` accepts a maximum file size of 50MB with MIME `image/jpeg`, `image/png` or `application/octet-stream`. It costs about 50 quota units and states no resolution requirement. It returns 403 when "The authenticated user doesn't have permissions to upload and set custom video thumbnails". — [YouTube Data API: Thumbnails.set](https://developers.google.com/youtube/v3/docs/thumbnails/set)
- [OFFICIAL] Eligibility: custom thumbnails can be uploaded "if your account is verified". There is a daily upload limit that "may vary by country/region or channel history". Community Guidelines strikes affect how many you can upload. — [YouTube Help 72431](https://support.google.com/youtube/answer/72431)
- [OFFICIAL] Vertical-video interaction: "Vertical videos with 16:9 custom thumbnails will be replaced by an auto-generated 4:5 thumbnail" on Home, Explore and Subscriptions. — [YouTube Help 72431](https://support.google.com/youtube/answer/72431)
- [OFFICIAL] Under Test & Compare, if any variant is below 720p (1280×720), all test thumbnails are downscaled to 480p. — [YouTube Help: A/B test titles & thumbnails](https://support.google.com/youtube/answer/16391400)
- [SNIPPET, third-party, inconsistent] Safe-area and badge figures from thumbnail-tool blogs:
  - Keep key content inside a centred 1100×620 (desktop) or 960×540 (mobile) area of a 1280×720 canvas.
  - The duration badge is "approximately 60px tall and 120px wide" at 1280×720. Other sources say to treat the "bottom-right 200-250 pixels", or "bottom-right 20 percent of the width and 15 percent of the height", as covered.
  - Mobile feed display is cited as ~168×94 px, as small as 116×65 px.
  - Sources: [wildandfreetools safe zone](https://wildandfreetools.com/blog/youtube-thumbnail-safe-zone-guide/), [youtube-thumbnail-preview-tool safe zone](https://youtube-thumbnail-preview-tool.pages.dev/youtube-thumbnail-safe-zone-guide.html), [timeskip sizes](https://timeskip.io/blog/youtube-video-thumbnail-sizes). The figures disagree with one another and none cites YouTube.
- [VENDOR] 1of10 says thumbnails are judged at "about 120 pixels wide" on mobile and that YouTube traffic is "majority mobile" (no figure given). — [1of10: YouTube Thumbnail Trends 2026](https://1of10.com/blog/youtube-thumbnail-trends-2026/)

### Inferences
- **Pipeline default:** render 3840×2160 (or at least 1920×1080) JPG/PNG, kept well under 50 MB. The API path allows 50 MB. Keep a ≤2 MB variant only if a mobile upload path exists. Never go below 1280×720, or Test & Compare quality degrades for every variant.
- **Bottom-right rule:** third-party guides consistently treat the bottom-right corner as covered by the duration badge. A watched-progress bar along the bottom edge and hover-preview playback are commonly observed but unverified here; no source was retrieved for either. A conservative rule is no text or faces in the bottom-right ~20% W × 15% H, and nothing essential in the bottom ~5% strip. This is folklore-level and not official.
- **Small-size test:** because the thumbnail is often seen at ~120–170 px wide on mobile, the pipeline should automatically check a downscaled render at roughly 160×90. Can the subject and text still be read?
- **Shorts interaction:** a 16:9 thumbnail on a vertical upload gets replaced, so the long-form rules only apply to true horizontal uploads.

### Gaps
- No official YouTube geometry was found for:
  - the duration badge
  - the progress bar
  - "Watch later/Add to queue" hover icons
  - inline hover-preview autoplay, which replaces the thumbnail with video on desktop and mobile Home
  - TV-app cropping and title overlay
  - the exact pixel sizes per surface (Home, Search, Suggested sidebar)
- The registered-impression threshold (how much of the thumbnail must be visible, and for how long) was not retrieved. Do not assume the commonly quoted "50% for 1 s".
- Older third-party guides cite a 2 MB limit. This now applies only to mobile upload. When the desktop limit rose to 50 MB was not established.

---

## 2. Test & Compare (native A/B), title testing and 2025–2026 changes

### Takeaway
Studio's Test & Compare tests up to 3 thumbnails, 3 titles, or 3 title+thumbnail combinations. It picks a winner by **watch time share, explicitly not CTR**. It is desktop-only, needs advanced features, and runs a few days to 2 weeks. Title testing followed thumbnail testing in 2025. Localized (per-language) thumbnails arrived in 2026, tied to multi-language audio tracks. No aggregate YouTube results on what wins were found in this pass.

### Cited Findings
- [OFFICIAL] Test types are "Title only, Thumbnail only, or Title and thumbnail", with "up to 3 different titles and thumbnails". — [YouTube Help 16391400](https://support.google.com/youtube/answer/16391400)
- [OFFICIAL] Metric: "we optimize tests for overall watch time over other metrics, like click-through-rate". The page notes that third-party tools optimizing CTR may pick a different winner. — [YouTube Help 16391400](https://support.google.com/youtube/answer/16391400)
- [OFFICIAL] Result labels on 16391400:
  - **Winner**: statistically significant
  - **Performed Same**
  - **Inconclusive**: the first-uploaded variant stays the default

  A search snippet of the older thumbnail-only page 13861714 instead shows a **"Preferred"** label ("likely outperformed … but not enough to confidently declare a winner"). **Conflict:** the label set has apparently changed, or the two pages differ. — [YouTube Help 16391400](https://support.google.com/youtube/answer/16391400); [SNIPPET] [YouTube Help 13861714](https://support.google.com/youtube/answer/13861714)
- [OFFICIAL] Duration: "a few days or up to 2 weeks", and the test "should be completed within two weeks". — [YouTube Help 16391400](https://support.google.com/youtube/answer/16391400)
- [OFFICIAL] Eligibility:
  - "Desktop only", advanced features required.
  - Not available for Shorts, scheduled lives, or Premieres until they end.
  - Not available for made-for-kids, mature-audience or private videos.
  - 18+ age-restricted videos will not run a test.
  - Editing the title or thumbnail mid-test stops it.
  - A small control group sees only the default, and its data is excluded.
  - Source: [YouTube Help 16391400](https://support.google.com/youtube/answer/16391400)
- [SNIPPET] Title testing first rolled out to a small group of creators alongside wider thumbnail-test access. The date (2025-07-16) comes from the article URL; the page was not opened. — [Tubefilter 2025-07-16](https://www.tubefilter.com/2025/07/16/youtube-feature-test-and-compare-titles-thumbnails/)
- [SNIPPET] A global rollout of title A/B testing to all creators with advanced features was announced via Creator Insider (date not shown in the snippet). — [Search Engine Journal](https://www.searchenginejournal.com/youtube-title-a-b-testing-rolls-out-globally-to-creators/562571/)
- [SNIPPET, secondary] A secondary guide claims a December 2025 "wide rollout". This is not confirmed by a primary source. — [Gyre](https://gyre.pro/blog/youtubes-new-title-ab-testing-tool-everything-creators-need-to-know)
- [Press, secondary] Localized thumbnails were announced on 2026-03-10/11. YouTube's quoted wording: "Creators who upload audio tracks can now add translated thumbnails to match a viewer's language."
  - Setup is per language, from Studio desktop video details.
  - The feature builds on multi-language audio expanded in October 2025.
  - Creators upload the translated images themselves. No AI translation is mentioned.
  - Source: [Denfami Nico Gamer 2026-03-11](https://news.denfaminicogamer.jp/news/260311i)
- [SNIPPET] Earlier coverage (Sept 2025) described multi-language thumbnails as a test for a select group since June 2025. Some guides still describe limited availability. — [Storyboard18](https://www.storyboard18.com/how-it-works/youtube-rolls-out-multi-language-audio-feature-bringing-video-dubbing-to-all-creators-80746.htm); [vidIQ guide](https://vidiq.com/es/blog/post/multilingual-thumbnail-feature-youtube/)
- [SNIPPET] Auto-dubbing expanded to all users with 27 languages in February 2026. — [India TV News 2026-02-05](https://www.indiatvnews.com/technology/news/youtube-auto-dubbing-feature-expands-to-all-users-now-supports-27-languages-2026-02-05-1029070)

### Inferences
- **Generate 2–3 variants by design.** The native tool takes up to 3, and its objective (watch time share) rewards a thumbnail that sets accurate expectations, not just clicks. The pipeline should produce variants that differ on one big idea (subject, framing or text hook), not on micro-tweaks. It should also not edit the thumbnail or title during a running test.
- **Localization path:** text-bearing thumbnails can be re-rendered per language only when the video also has that language's audio track. A pipeline that already generates text from code or GPT Image 2 can emit a per-language set. Keeping text as a separable layer makes this cheap.
- **Hand off results via the API?** No evidence was found that the Data API exposes Test & Compare. Treat the native test as a manual, Studio-only step.

### Gaps
- **No published win data.** YouTube has not published aggregate Test & Compare results (for example, the share of tests ending in Winner, or typical effect sizes). None were found from Creator Insider in this pass.
- **AI thumbnail suggestions.** No primary source confirmed a Studio feature that generates thumbnails with AI, for long-form in 2025–2026. Not established either way.
- **API access.** Whether the Data API can create or read Test & Compare tests was not found.
- **Localization launch details.** The exact eligibility for localized thumbnails, and the primary blog.youtube URL of the March 2026 announcement, were not retrieved.

---

## 3. Evidence on design elements (faces, expression, subjects, text, color, curiosity, title complement, branding, graphics)

### Takeaway
The best 2025–2026 data finds **faces and text are near-universal baselines, not reliable advantages**. Breakouts and underperformers look almost the same on face presence, colour, brightness and contrast. The few signals that clear Eden's noise threshold are small:
- 4–6 words of text, more common among breakouts (30.6% vs 26.5%)
- going text-free, more common among underperformers (16.8% vs 13.4%)
- a neutral or serious expression (+3.7 points) and eye contact with the camera (+3.2 points), more common among breakouts
- drawn graphics such as arrows and circles (+3.7 points)

Two further signals come from 1of10, without figures: multiple faces outperform single faces, and face effects vary by niche and channel size. Exaggerated "shocked" faces are rare among breakouts (about 5–9%), and the shocked-face gap in Eden (8.5% vs 7.7%) sits within noise.

### Cited Findings
**vidIQ (2026)** [MEASURED, descriptive only, no comparison group]
- Method: 500 breakout long-form videos across 30 niches, published in the month ending 2026-06-30. Breakout means views far above the channel's average, with a minimum score of 18×. Filters: ≥2 min, ≥10k subscribers, ≥50k views, ≤2 videos per channel.
- Human face: 69% of all 500, 75% of the top 100, 80% of the top 50.
- High contrast: 56% → 50% → 46% (declines toward the top).
- Overlay text: 72% used text. The median is **5 words** among text thumbnails.
- Word-count distribution: 28% no text and 24% 1–3 words (percentages). Then raw counts out of 500: **84** thumbnails with 4–5 words, **63** with 6–7, **34** with 8–9. About 59 text thumbnails are unaccounted for.
- Exaggerated expression: 5% (6% of the top 50).
- The most common winner pattern: a face filling about ⅓ of the frame plus a short bold hook. Text sits opposite the face. Object-led compositions are common in DIY, food and product.
- The study suggests avoiding YouTube's own red/white/black.
- Authors' caveat: it shows correlation, not causation.
- Source: [vidIQ Research: YouTube thumbnail study](https://vidiq.com/research/youtube-thumbnail-study/)

**Eden (2026)** [MEASURED, comparison group]
- Method: 507,478 long-form videos from 8,691 channels, published Aug 2025–Aug 2026.
  - Breakout means ≥2× the channel's baseline (33.7% of videos). Underperformer means at or below baseline (42.1%).
  - 2,960 thumbnails were coded by a vision model with hand spot-checks.
  - The authors treat gaps under ~2.5 points as noise.
  - Source: [Eden: What makes a good YouTube thumbnail? 507,478 videos](https://eden.so/blog/what-makes-a-good-youtube-thumbnail/)
- Faces (breakout vs underperformer):
  - any face 84.2% vs 82.2%
  - exactly one face 55.6% vs 54.1%
  - face over half the frame 15.8% vs 14.9%
  - eye contact 32.4% vs 29.2%
  - neutral/serious 51.1% vs 47.4%
  - smiling 21.2% vs 23.4%
  - shocked 8.5% vs 7.7%

  Shocked faces appear on 11.7% of breakouts from channels over 100k subscribers, versus 5.6% from smaller channels. — [Eden](https://eden.so/blog/what-makes-a-good-youtube-thumbnail/)
- Text (breakout vs underperformer):
  - any text 86.6% vs 83.2%
  - **no text 13.4% vs 16.8%** ("going text-free is 25% more common among underperformers")
  - 1–3 words 26.4% vs 25.6%
  - **4–6 words 30.6% vs 26.5%**
  - 7+ words 29.6% vs 31.1%
  - all caps 62.3% vs 59.7%
  - Text-bearing breakouts average 6.8 words. — [Eden](https://eden.so/blog/what-makes-a-good-youtube-thumbnail/)
- Title complementarity: text repeating the title verbatim was 6.3% vs 6.8%. Text sharing no words with the title was 39.2% vs 39.1%. **Both gaps are inside the noise band, so there is no measured support either way.** — [Eden](https://eden.so/blog/what-makes-a-good-youtube-thumbnail/)
- Colour/pixels (0–100, breakout vs underperformer): brightness 40.9 vs 40.5, contrast 23.5 vs 23.1, saturation 35.2 vs 34.7, warm share 31.1 vs 30.5. **All within noise, so there is no measured support for "more saturated/contrasty wins".** — [Eden](https://eden.so/blog/what-makes-a-good-youtube-thumbnail/)
- Backgrounds and graphics:
  - real photographed scene ~52% in both groups, collage ~24%, illustration ~8%
  - screenshots 2.6% vs 3.8%
  - drawn graphics (arrows, circles, outlines) 41.8% vs 38.1%, a modest gap above the noise threshold
  - Source: [Eden](https://eden.so/blog/what-makes-a-good-youtube-thumbnail/)

**1of10 (Dec 2025)** [MEASURED, method not in article]
- Source: 300,000+ "viral" 2025 videos with an outlier score against the channel median.
- "thumbnails with faces and thumbnails without faces perform similarly". Faces helped only channels above an unstated subscriber threshold, and modestly.
- Faces helped in **Finance** and hurt in **Business**.
- **Multiple faces performed best** versus single faces. No figures were given in the article.
- Nate Curtiss: "It depends on your niche, your format, and how many faces you use."
- Source: [Search Engine Journal, 2025-12-22](https://www.searchenginejournal.com/do-faces-help-youtube-thumbnails-heres-what-the-data-says/563944/) (full report at 1of10.kit.com/data-report-2025, not opened)

**1of10 blog (2026-06-19)** [VENDOR, no sample size]
- Winners use about 3 colours, at least one neon/hyper-saturated. Note this conflicts with Eden's null saturation result.
- Zero-text thumbnails sit at the top in entertainment, lifestyle, gaming and reaction. Educational, finance, legal and medical "still need text".
- Minimalism "peaked around 2023-2024".
- AI-made thumbnails have "effectively closed" the quality gap.
- Source: [1of10 Thumbnail Trends 2026](https://1of10.com/blog/youtube-thumbnail-trends-2026/)

**Expression and curiosity, practitioner claims**
- [PRACTITIONER, SNIPPET, reported secondhand] MrBeast reportedly said moving away from the "shocked face" style might have boosted views (the Sportskeeda headline says "might"; page not opened). He also reportedly said closed-mouth expressions increased watch time in his tests (no numbers). — [Sportskeeda](https://sportskeeda.com/esports/news-shocked-face-meta-over-fans-react-mrbeast-reveals-changing-youtube-thumbnail-style-might-boosted-views); [Search Engine Journal](https://www.searchenginejournal.com/do-faces-help-youtube-thumbnails-heres-what-the-data-says/563944/)
- [PRACTITIONER, SNIPPET, leaked, provenance unverified] Search summaries say the 2024 "How to Succeed at MrBeast Production" document stresses CTR, AVD and AVP, and that the first minute must show the thumbnail's expectation will be met. Which of the pages below carried these claims was not identified; none was opened. The memo's verbatim thumbnail section was not retrieved, so no specific thumbnail rule is attributed to it here. — [Simon Willison summary](https://feeds.simonwillison.net/2024/Sep/15/how-to-succeed-in-mrbeast-production/); [Fast Company](https://www.fastcompany.com/91193170/7-key-takeaways-mrbeast-leaked-hr-document)

**Unverified numbers circulating (do not use as facts)**
- [SNIPPET] "Expressive face +30% CTR" and "2.3× CTR (Creator Insider data)" appeared in search summaries; their source pages were not identified. "+33% CTR from faces" for song videos (3,200 thumbnails, 127 A/B tests) comes from an aggregator with no published method. — [mer.vin song-video study (the +33% figure only)](https://mer.vin/2026/09/youtube-thumbnail-ctr-for-song-videos-what-3200-thumbnails-teach-us/)

**Academic**
- [SNIPPET] The only paper surfaced is an Indonesian journal (Paramadina) comparing AI-generated vs manual thumbnails on impressions CTR. Its variables are face presence, text density and colour contrast. Results were not read. — [Paramadina journal PDF](https://journal.paramadina.ac.id/index.php/imagionary/article/download/1163/493/4995)

### Inferences
Concrete defaults for an automatic generator, with the evidence level stated:
- **Text.** Default to a short hook of about **4–6 words** (vidIQ median 5; Eden's breakout excess sits at 4–6 words) rather than none. [MEASURED, small effect] Allow a no-text variant for entertainment or story content as one A/B arm. Keeping text under 7 words is a legibility rule, not a measured one: Eden's 7+ gap (31.1% vs 29.6%) sits within noise, and its text-bearing breakouts average 6.8 words. [PRACTITIONER]
- **Title–thumbnail relation.** Thumbnail text should add to the title rather than restate it. This is a practitioner rule. Eden's data neither supports nor refutes it, and verbatim repeats are rare (~6%) either way. [PRACTITIONER]
- **Faces.** Not mandatory. When a person or character carries the story, give one large face (~⅓ of the frame) or two people. [MEASURED weak] Neutral or serious expressions and eye contact show small positive gaps in Eden. Preferring a situation-true expression over an exaggerated shocked face is not measured, since Eden's shocked-face gap sits within noise. [PRACTITIONER]
  - This fits the plugin's existing `shot_characters.expression` direction.
- **Colour.** No measured lift from "more saturation/contrast" (Eden). The practical rule is legibility at small size: a clear figure–ground separation and one focal point. Avoid a palette that blends with YouTube's own UI (red/white/black) — vidIQ suggestion only. [MEASURED null + VENDOR]
- **Graphics.** Arrows and circles show a small positive association (41.8% vs 38.1%). They are permitted on the thumbnail. The plugin's "nothing drawn over video" rule concerns moving pictures, not the thumbnail still. [MEASURED weak]
- **Variants.** Because effects are small and niche-dependent, measured per-channel testing (Test & Compare, up to 3 variants) beats any global rule.

### Gaps
- No rigorous 2024–2026 data was found on:
  - number of subjects beyond faces (1of10's multi-face claim has no figures)
  - before/after layouts
  - objects vs people outside vidIQ's qualitative note
  - curiosity-gap framing
  - cross-video branding consistency (series templates)
- No peer-reviewed CTR study on thumbnail features was found. An arXiv search returned nothing relevant.
- Paddy Galloway, Colin and Samir, and Think Media positions were not retrieved in this pass. No claims are attributed to them.
- The 1of10 full 2025 data report (numbers behind the face, niche and multi-face findings) was not opened.

---

## 4. CTR benchmarks and why CTR alone misleads

### Takeaway
YouTube's only official benchmark: **half of all channels and videos** have impressions CTR between **2% and 10%**. This describes a central band, not a target. CTR falls naturally as a video reaches broader surfaces like Home. YouTube explicitly pairs CTR with average view duration to diagnose clickbait, and its own A/B tool optimizes watch time instead of CTR.

### Cited Findings
- [OFFICIAL] "Half of all channels and videos on YouTube have an impressions CTR that can range between 2% and 10%." New channels and low-view videos can fall outside the band. — [YouTube Help: Impressions & CTR FAQ](https://support.google.com/youtube/answer/7628154?hl=en)
- [OFFICIAL] "If a video gets a lot of impressions (such as if it appears on the Home Page), it's natural for the CTR to be lower". CTR is higher when impressions come from sources like the channel page. Impressions on external websites and end screens are not counted. — [YouTube Help 7628154](https://support.google.com/youtube/answer/7628154?hl=en)
- [OFFICIAL] Clickbait diagnosis: high CTR with low average view duration and fewer impressions than expected. "Clickbait videos tend to have low average view duration and therefore are less likely to get recommended by YouTube." — [YouTube Help 7628154](https://support.google.com/youtube/answer/7628154?hl=en)
- [OFFICIAL] Test & Compare optimizes "overall watch time over other metrics, like click-through-rate". — [YouTube Help 16391400](https://support.google.com/youtube/answer/16391400)
- [MEASURED] All three large thumbnail studies (vidIQ, Eden, 1of10) define success as views versus the channel baseline, not CTR. — [vidIQ](https://vidiq.com/research/youtube-thumbnail-study/); [Eden](https://eden.so/blog/what-makes-a-good-youtube-thumbnail/); [SEJ on 1of10](https://www.searchenginejournal.com/do-faces-help-youtube-thumbnails-heres-what-the-data-says/563944/)
- [MEASURED, observational] In Eden's corpus, packaging factors outside the thumbnail also track breakouts:
  - breakout rate rises from 26.9% (<5 min) to 41.1% (>40 min) by video length
  - and from 26.1% (<30 chars) to 35.9% (>75 chars) by title length
  - Source: [Eden](https://eden.so/blog/what-makes-a-good-youtube-thumbnail/)

### Inferences
- **Packaging comparison.** The breakout-rate spreads by video length (14 points) and title length (10 points) are larger than any thumbnail-feature gap in the same study. This comparison is my reading of Eden's figures, not a claim Eden makes.
- **Feedback loop.** Any automatic feedback should compare a video's CTR with the same channel's earlier videos, read per traffic source and together with average view duration. It should not use an absolute target, and it should not count raising CTR at the cost of view duration as a win.
- **Content promise.** The thumbnail has to make a promise the opening actually pays. This aligns with the plugin's existing "promise and proof" and "episode anticipation" directives.

### Gaps
- The exact registered-impression definition was not retrieved (a separate Help page).
- No official per-genre or per-surface CTR benchmarks exist in the sources found.

---

## 5. Policies (misleading thumbnails, clickbait enforcement, sexual/violent content)

### Takeaway
Thumbnails fall under Spam, deceptive practices & scams ("maliciously misleading titles, thumbnails"). Press coverage from December 2024 (seen only through search snippets) says YouTube began removing videos with "egregious clickbait", where the title or thumbnail promises something the video does not deliver. Per that coverage, this started in India, especially for news and current events, initially without strikes. Thumbnails with nudity, sexual provocation, hate, violence or dangerous content are rejected and can earn strikes. Repeat offenses lose custom-thumbnail privileges for 30 days.

### Cited Findings
- [OFFICIAL] The Spam/deceptive practices policy applies to "unlisted and private content, comments, links, posts and thumbnails".
  - It prohibits "Using maliciously misleading titles, thumbnails, descriptions, or imagery … to trick users into clicking on a video that does not deliver what was promised".
  - Example: the title offers a full sports match but the video shows only a clip.
  - Source: [YouTube Help: Spam, deceptive practices & scams](https://support.google.com/youtube/answer/2801973?hl=en)
- [OFFICIAL] Thumbnails may be rejected, with a strike, for "nudity or sexually provocative content, hate speech, violence, or harmful or dangerous content". "Repeat offenses may lead to the removal of your custom thumbnail privileges for 30 days" or termination. — [YouTube Help 72431](https://support.google.com/youtube/answer/72431)
- [SNIPPET, Dec 2024; articles not opened, wording from search summaries] The egregious-clickbait crackdown targets titles or thumbnails with promises or claims not fulfilled within the video itself, particularly for breaking news or current events.
  - The rollout starts in India and expands over the following months.
  - Violating content is removed without strikes at first, focusing on new uploads.
  - Source: [TechCrunch 2024-12-18](https://techcrunch.com/2024/12/18/youtube-says-it-will-start-cracking-down-on-videos-with-clickbait-titles-in-india); [afaqs](https://www.afaqs.com/news/digital/youtube-to-crack-down-on-clickbait-videos-starting-in-india-8495996)

### Inferences
- **Generator guardrail.** Every element in the thumbnail must be seen or delivered in the video: the depicted event, the number, the object, the outcome. This is both policy-safe and what watch-time-optimized testing rewards.
  - For news or current-events topics, avoid any claim the video does not substantiate.
- **Fiction.** For fiction or drama, the thumbnail moment should be a real moment of the episode rather than an invented scene.
- **Imagery filter.** Keep thumbnails free of sexualized, gory or dangerous-act imagery even if the video is borderline. A rejected thumbnail risks a strike and a 30-day loss of custom thumbnails.

### Gaps
- No primary source was found confirming whether the clickbait enforcement expanded beyond India in 2025–2026. The searches found only the December 2024 coverage.
- The dedicated Help Center thumbnail-policy page was not opened. That page covers age restriction when a thumbnail is sexual or violent but the video is not, and what blurring is acceptable. Only the rejection reasons on 72431 were confirmed.

---

## 6. Genre differences (drama/story, explainer/documentary, tutorial, review) and Korean-market notes

### Takeaway
Only thin data exists:
- Face effects vary by niche: faces help in Finance and hurt in Business (1of10).
- Object-led compositions are common in DIY, food and product (vidIQ).
- A vendor claims text-free works for entertainment, lifestyle, gaming and reaction, while educational, finance, legal and medical topics need text.

No rigorous genre-level comparison for drama vs explainer vs tutorial vs review was found. Korean-market sources are tips without data.

### Cited Findings
- [MEASURED, no figures in article] Faces helped Finance thumbnails and hurt Business thumbnails. — [SEJ on 1of10](https://www.searchenginejournal.com/do-faces-help-youtube-thumbnails-heres-what-the-data-says/563944/)
- [MEASURED, qualitative] Object-led compositions recur among breakouts in DIY, food and product niches. — [vidIQ](https://vidiq.com/research/youtube-thumbnail-study/)
- [VENDOR] Zero-text thumbnails appear at the top of the outlier distribution in entertainment, lifestyle, gaming and reaction content. Educational, finance, legal and medical still need text. — [1of10 Trends 2026](https://1of10.com/blog/youtube-thumbnail-trends-2026/)
- [MEASURED] Eden reports no niche breakdown and recommends studying breakouts in your own niche. — [Eden](https://eden.so/blog/what-makes-a-good-youtube-thumbnail/)
- [SNIPPET, Korean blogs, no data] Korean guides advise:
  - 3–5 words of text
  - large, mobile-legible fonts
  - strong text/background contrast
  - one focal point
  - a consistent font, colour and layout per channel

  One unverified creator anecdote claims CTR went from 6% to 10% through copy testing ("썸네일에서 제일 중요한 건 결국 카피"). — [tilnote guide](https://tilnote.io/pages/683d04573b88c1fc497d2ba4); [kmong article](https://kmong.com/article/1015)
- [SNIPPET] Korean explainers repeat that Test & Compare uses watch time share (시청 시간 점유율), not CTR. — [Typecast: 유튜브 썸네일 테스트 기능 가이드](https://typecast.ai/kr/learn/youtube-thumbnail-test-guide/)

### Inferences
These are proposals derived from the evidence above, not measured rules.
- **Drama/story:** a face-led single frame of a real conflict moment from the episode, showing the expression the scene carries; or two characters, given 1of10's multi-face finding. Minimal text, 0–4 words, or a no-text variant.
- **Explainer/documentary, finance/legal/medical:** keep a short text hook (3–6 words) that adds to the title. Use object- or subject-led imagery; a face is optional.
- **Tutorial/DIY/product/review:** an object-led composition showing the result or the product clearly. Text names the outcome.
- **Word counts and Hangul:** the word counts above come from English-language samples, so they do not map directly onto Hangul 어절 (space-separated word units).
- **Korean channels:** the commonly seen Hangul text-heavy style does not have measured support. Eden finds 7+ words slightly more common among underperformers (31.1% vs 29.6%, within noise). Prefer a short, large Hangul hook.
  - Hangul text on a generated image falls under the plugin's GPT Image 2 rule, or should be code-rendered as a separate layer, which also enables localized-thumbnail variants.

### Gaps
- No genre-level measured comparison for drama vs explainer vs tutorial vs review was found.
- No quantitative Korean-market thumbnail study (text density, font, CTR) was found. Korean sources were blog-level tips only.
- Channel-consistency (series template) effects are unmeasured in the sources found.
