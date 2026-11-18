# Platform data and measured evidence on the opening of long-form video (YouTube 8–60+ min, Facebook horizontal)

Scope: YouTube long-form (not Shorts) and long horizontal Facebook video. Researched 2026-11-18 (19 search/fetch calls).
Evidence labels: **[OFFICIAL]** platform's own help page or post, opened in this session; **[OFFICIAL-via-press]** platform staff quoted by trade press (interview video not watched); **[ACADEMIC]** peer-reviewed or arXiv; **[VENDOR]** analytics/tool company or creator blog, usually no method or sample; **[SNIPPET-ONLY]** seen only in search-result summaries, primary page not opened.

## 1. What does YouTube officially measure and say about the intro?

### Takeaway
YouTube's only official "intro" metric is the share of viewers still watching at 30 seconds, and its only official threshold is 50%: videos at or above it go on the "above typical intros" list. YouTube frames a good intro as the opening matching the title/thumbnail promise, not as a ranking factor in itself; the recommendation team describes ranking as watch time plus satisfaction (surveys, likes/dislikes), with CTR useful only alongside view duration.

### Cited Findings
- [OFFICIAL] "Intro tells you what percentage of your audience still watched your video after the first 30 seconds." A high intro percentage "could mean" the first 30 seconds "matched the viewer's expectation of the video's thumbnail and title"; suggested fixes are aligning thumbnail/title with content or testing different styles for the first 30 seconds. — [YouTube Help: Measure key moments for audience retention](https://support.google.com/youtube/answer/9314415?hl=en)
- [OFFICIAL] Same page defines the other key moments: **Spikes** "appear when more viewers are watching, rewatching, or sharing those parts" (can also mean confusing content being rewatched); **Dips** "mean that viewers are abandoning or skipping at that specific part"; **Top moments** are where "almost no one dropped off" — if they fall late, "consider moving compelling content earlier, since audience size usually shrinks over time." Eligibility: video "at least 60 seconds long and have at least 100 views." Comparison: "SEE MORE" compares the video with "all YouTube videos of similar length"; typical retention compares with your 10 most recent videos of similar length. — [YouTube Help 9314415](https://support.google.com/youtube/answer/9314415?hl=en)
- [OFFICIAL] Content-tab tips: "A typical intro is about 30 seconds long." "Videos that have 50% of the audience or more watching after the 30-second mark can be found in the 'above typical intros' list." "Typical retention is the engagement that the last 10 of your videos of a similar length have maintained" (the gray band). Recommendation: "Edit the first 30 seconds of your video and experiment with different styles." — [YouTube Help: Content tab analytics tips](https://support.google.com/youtube/answer/12942217?hl=en)
- [OFFICIAL] Impressions CTR help: "Half of all channels and videos on YouTube have an impressions CTR that can range between 2% and 10%." "Clickbait videos tend to have low average view duration and therefore are less likely to get recommended by YouTube." A thumbnail may be clickbait if "it's getting high CTR but low average view duration." — [YouTube Help: Impressions and click-through rate](https://support.google.com/youtube/answer/7628154?hl=en)
- [OFFICIAL-via-press] Todd Beaupré (Senior Director, Growth & Discovery), René Ritchie interview, reported Jan 27, 2025: "…we look at things like likes, dislikes, these survey responses…" and "…how do they feel about the time they're spending." Device and time of day are signals. The article contains no Beaupré quote on intros, CTR or early drop-off. — [Search Engine Journal](https://www.searchenginejournal.com/how-youtubes-recommendation-system-works-in-2025/538379/)
- [OFFICIAL-via-press] Beaupré, Creator Insider interview published Sep 1, 2026: "We don't want to just assume that all time is valuable" (article's example: a viewer waiting for "a payoff that never lands"); subscribers' CTR on uploads is "probably… about maybe a 10% or less"; "even your best videos, 90% of the time, your subscribed audience isn't deciding to watch." The article says it does not discuss intros. — [PPC Land, Sep 2, 2026](https://ppc.land/subscribers-skip-90-of-uploads-in-their-feed-youtube-director-says/)
- [VENDOR] "Valued watch time" = watch time from viewers who rate a video 4–5 stars in YouTube's 1–5 survey, with an ML model predicting responses for non-respondents. Third-party explainer; YouTube has not published the weights. — [OutlierKit](https://outlierkit.com/resources/youtube-viewer-satisfaction-algorithm-2026/)
- [VENDOR] vidIQ attributes to Matt Koval (YouTube creator liaison) that discovery "loves videos that people have found satisfying" and uses retention to judge it; and paraphrases the old YouTube Creator Playbook that "the first 15 seconds can make or break a video." Paraphrase, primary not opened. — [vidIQ, updated Jun 29, 2026](https://vidiq.com/blog/post/increase-audience-retention-youtube/)

### Inferences
- The official bar (50% still watching at 0:30) is lower than every vendor bar (60–80%, see §2). YouTube's own baseline is relative: same-length videos on your channel and same-length videos across YouTube.
- YouTube's official explanation of a weak intro is a promise mismatch (title/thumbnail vs. opening), which ties the opening to packaging rather than to "hook tricks."
- "Intro retention is a ranking signal" is not stated anywhere official; the official chain is: early drop → lower average view duration/watch time → less recommendation, and satisfaction surveys can discount time that viewers did not value.

### Gaps
- No official statement found from YouTube that a specific first-30-seconds retention level changes distribution.
- The Beaupré interviews were read through trade-press summaries, not the videos' transcripts.
- Could not open the old Creator Playbook's "first 15 seconds" wording directly.

## 2. Numbers: viewers lost in the first 30 s / 1 min, "good" 30-second retention, curve shapes, CTR vs early drop

### Takeaway
There is no public large-sample study of first-30-second loss on long-form YouTube. The only per-video numbers with views attached come from vidIQ's own channel (30-second retention 38–68%, typical curve ~95% → ~65% by 0:30, then flat). Vendor "good" thresholds range 60–80% and conflict with each other and with YouTube's 50% line; aggregate average-percentage-viewed figures (~23–31%) are better documented than first-30-second figures.

### Cited Findings
- [VENDOR, measured on own channel] vidIQ (2.39M subs), trailing 12 months to June 2026: intro retention at 30 s per video — 67.9% (761,667 views), 65.5% (2,984,115), 64.6% (946,880), 62.9% (889,579), 59.9% (1,283,944), 38.1% (1,954,724). Channel APV 30.3% across 16.5M long-form views. "Good" APV for a 6–9 minute video ≈30%; aim for ≈60% past 30 s, >65% for strong hooks; platform average APV "closer to the low-to-mid 20s" (from "thousands of videos," sample unstated). — [vidIQ](https://vidiq.com/blog/post/increase-audience-retention-youtube/)
- [VENDOR] Curve shape: on the "BIG Mistakes" video, retention falls from ~95% in the opening seconds to ~65% at 30 s, "then flattens for the rest of the video" ("the cliff"). — [vidIQ](https://vidiq.com/blog/post/increase-audience-retention-youtube/)
- [VENDOR] Note the 38.1% intro video still drew 1.95M views — one counterexample within the same channel that low 30-second retention does not cap views. — [vidIQ](https://vidiq.com/blog/post/increase-audience-retention-youtube/)
- [VENDOR, SNIPPET-ONLY] Retention Rabbit benchmark (2024–2025, "10,000+ videos," "75+ niches," per secondary sites): average retention ≈23.7%; only 16.8% of videos exceed 50% retention; >65% at 30 s "correlates with 58% higher average view duration"; "most videos lose 20–35% of viewers in the first 30 seconds." Primary report not found; numbers only via secondary sites. — [Gyre](https://gyre.pro/blog/how-to-improve-audience-retention-on-youtube-top-tips), [HumbleandBrag](https://humbleandbrag.com/blog/youtube-audience-retention-benchmarks)
- [VENDOR] 1of10: >70% at 30 s "solid," >80% "exceptional"; <50% in first 10–15 s signals a failing hook; keep intros under 5 s or cut them. No sample. — [1of10](https://1of10.com/blog/how-to-hook-viewers-in-the-first-30-seconds-of-a-youtube-video/)
- [VENDOR] Creator Playbook: below 70% in the first 30 s "YouTube punishes the rest" — unsupported causal claim. — [Creator Playbook](https://www.creator-playbook.com/articles/your-intro-sucks-fix-first-30-seconds)
- [VENDOR, SNIPPET-ONLY] Other estimates seen: "over 33%" lost in first 30 s with weak intros; "most channels lose 30–50%"; 50–70% at 30 s "very solid" for videos over 5 min; 30–40% APV "solid" for videos over 15 min. — [Prepublish](https://prepublish.ai/blog/youtube-viewers-leave-30-seconds), [Teleprompter](https://www.teleprompter.com/blog/youtube-audience-retention), [AIR Media-Tech](https://air.io/en/audience-growth/how-to-increase-audience-retention-on-youtube-5-watch-time-tips)
- [ACADEMIC, 2018] Wu, Rizoiu & Xie, "Beyond Views" (ICWSM 2018): 5.3M YouTube videos published over two months in 2016; proposes "relative engagement," a duration-calibrated rank of average watch percentage, which "strongly correlate[s] with recognized notions of quality"; engagement is more stable over time than popularity and predictable before views accrue (R²≈0.77 for average watch percentage from context, topic and channel features; arXiv v1 says 0.79). — [arXiv 1709.02541](https://arxiv.org/abs/1709.02541), [ICWSM](https://ojs.aaai.org/index.php/ICWSM/article/view/15031)
- [OFFICIAL] CTR vs early drop: YouTube describes "high CTR but low average view duration" as the clickbait signature that reduces recommendation (see §1). — [YouTube Help 7628154](https://support.google.com/youtube/answer/7628154?hl=en)

### Inferences
- A reasonable range to carry into the report: long-form videos commonly keep ~50–70% at 0:30 (YouTube's 50% "above typical" line at the low end; vidIQ's well-performing uploads 60–68%). Treat anything sharper as vendor folklore.
- The documented curve shape is a steep "cliff" in the first ~30 s, then a slow decline or plateau; most of the loss in a long video happens before the first minute. This is consistent with official advice to move "top moments" earlier.
- "Beyond Views" supports judging retention against same-duration peers (as YouTube's gray band does) rather than with fixed percentages, because watch percentage depends strongly on length.

### Gaps
- No public study with a disclosed sample reports first-30-second or first-minute loss for long-form YouTube; Retention Rabbit's primary report could not be found.
- No measured data found on how CTR correlates with 30-second drop across many videos (only YouTube's qualitative clickbait statement).
- "Beyond Views" full text (duration vs. watch-percentage curves) was not opened; only the abstract was read.
- No TubeBuddy, Spotter or OutlierKit dataset with sample sizes on intros was found.

## 3. How the intro interacts with ranking: AVD, APV, satisfaction, valued watch time, Test & Compare

### Takeaway
YouTube's own A/B tool for titles and thumbnails picks winners by watch time share, explicitly not CTR. A title/thumbnail that wins clicks but loses viewers in the opening loses the test. The intro is therefore judged through total watch time and satisfaction, not as a stand-alone score.

### Cited Findings
- [OFFICIAL] Test & Compare: "the title or combination of title and thumbnail with the highest watch time will be shown to all viewers." "To help your video get high quality engagement, we optimize tests for overall watch time over other metrics, like click-through-rate." Outcomes: Winner, Performed Same, Inconclusive. Up to 3 variants; test "should be completed within two weeks"; desktop Studio only; Shorts, scheduled lives, Premieres, made-for-kids, mature and private videos ineligible. Purpose: help viewers "understand what the video is about so that they don't waste their time clicking on the wrong videos." — [YouTube Help: A/B test titles & thumbnails](https://support.google.com/youtube/answer/16391400?hl=en), [Test & compare thumbnails](https://support.google.com/youtube/answer/13861714)
- [VENDOR] Third-party summary of the same help page: thumbnail-only tools "often only optimize for click-through rate, which may determine a different 'winner' than measuring by watch time share." — [WebSearch summary of YouTube Help 13861714 via thumbnailtest.com](https://thumbnailtest.com/news/youtube-releases-title-test-compare/)
- [OFFICIAL-via-press] Satisfaction: likes, dislikes and survey responses feed recommendation; "We don't want to just assume that all time is valuable." — [SEJ 2025](https://www.searchenginejournal.com/how-youtubes-recommendation-system-works-in-2025/538379/), [PPC Land 2026](https://ppc.land/subscribers-skip-90-of-uploads-in-their-feed-youtube-director-says/)
- [VENDOR] Watch-time math: a 30-minute video at 35% APV can deliver more watch time than a 4-minute video at 80%; a 12-minute video at 55% beats a 25-minute video at 30% (illustrative, not measured). — [vidIQ](https://vidiq.com/blog/post/increase-audience-retention-youtube/), [OutlierKit](https://outlierkit.com/resources/youtube-strategy-for-vloggers/)

### Inferences
- Because Test & Compare optimizes watch time share, an opening that fulfills the packaging is directly rewarded in YouTube's own experiment: the opening and the thumbnail/title are one unit.
- APV percentages across different lengths are not comparable; the opening matters most because the early cliff caps everything after it, not because of a special 30-second ranking rule.

### Gaps
- YouTube has not published how surveys, AVD and APV are weighted; "valued watch time" as a 4–5-star filter is a vendor description.

## 4. 2025–2026 changes: views, TV share, dubbing, Hype, chapters, AI summaries

### Takeaway
The biggest documented change for long-form openings is the TV screen: YouTube reached a record 15.8% of all US TV viewing (Nielsen, Aug 2026), and YouTube's growth lead says TV viewers want longer videos and don't want to "pick up the remote every five to 10 minutes." No measured data was found on whether TV viewers abandon intros less.

### Cited Findings
- [SNIPPET-ONLY, Nielsen via press] YouTube = 15.8% of US TV viewing time in Aug 2026 (record), Netflix 7.7%; 13.8% in May 2026; 12.7% in Jan 2026. Nielsen announced a one-time methodology adjustment from the September 2026 interval. — [Tubefilter, Oct 22, 2026](https://www.tubefilter.com/2026/10/22/nielsen-the-gauge-youtube-record-watch-time-share-us-tv/amp/), [PPC Land](https://ppc.land/youtube-gains-record-15-8-of-us-tv-time-in-nielsens-august-gauge/), [Advanced Television](https://www.advanced-television.com/2026/07/29/nielsen-youtube-takes-13-8-of-us-tv-watch-time-in-may/)
- [OFFICIAL-via-press] Beaupré (Sep 2026): "people are watching on television and they want longer videos"; "viewers don't want to be picking up the remote every five to 10 minutes to make a new video decision"; the article adds "time spent may matter more on a television." — [PPC Land](https://ppc.land/subscribers-skip-90-of-uploads-in-their-feed-youtube-director-says/)
- [SNIPPET-ONLY] Podcasts on TV: 700M hours/month in 2025, up from 400M in 2024; Shorts on TV ~2B hours/month (2026). — [Briefs](https://www.briefs.co/news/youtube-shorts-2-billion-hours-tv-watch-time/), [PetaPixel, May 15, 2026](https://petapixel.com/2026/05/15/short-form-video-viewing-on-tv-surges-as-youtube-shorts-hit-2-billion-monthly-hours)
- [SNIPPET-ONLY] Share of YouTube viewing time from videos ≥20 min rose from 63.6% (Jan 2024) to 67.7% (Dec 2025); among regular viewers of 15+ minute videos, 57% use smartphones and 23% a TV. Source of the underlying data not verified. — [NetInfluencer](https://www.netinfluencer.com/youtube-daily-usage-surpasses-netflix-worldwide/), [NetInfluencer](https://www.netinfluencer.com/creator-platforms-now-command-more-daily-us-attention-than-live-tv-streaming-combined-report-finds/)
- [SNIPPET-ONLY] Alphabet Q3 2026: living room "accounted for over one-third of total YouTube ads revenues" (secondary write-up of earnings call). — [VaaSBlock](https://www.vaasblock.com/streaming/youtube-ctv-economics-google-ad-machine-living-room-2026/)
- [OFFICIAL-via-press] Auto-dubbing: creators "who dub at least 80% of the… watch time… tend to have more success than those who dub less" (Beaupré, Jan 2025). — [SEJ](https://www.searchenginejournal.com/how-youtubes-recommendation-system-works-in-2025/538379/)
- [VENDOR] TV-viewer guidance: simpler thumbnails and chapters for TV; TV sessions longer than other devices (attributed to YouTube, unverified). — [OutlierKit](https://outlierkit.com/resources/youtube-tv-viewers-creator-strategy/)

### Inferences
- TV viewing plausibly softens the early cliff (choosing a new video costs a remote action, autoplay continues), but this is inference from Beaupré's remark, not measured retention.
- Dubbing is measured in watch time share, again pointing to watch time as YouTube's main yardstick.

### Gaps
- The March 2025 view-count change (views counted on start/replay) applied to Shorts; no long-form view-definition change in 2025–2026 was found in this session — not verified with a source here.
- No sourced data found on Hype, chapters, or AI video summaries/"Ask" affecting opening retention.
- No device-split retention data (TV vs mobile intro drop) published by YouTube or a vendor with a sample.

## 5. Facebook / other long horizontal video

### Takeaway
Meta's documented long-form standard is the one-minute mark, not 30 seconds: ranking (2019) gives weight to videos that "capture viewers' attention for at least one minute" and extra weight for engagement on videos 3+ minutes; monetization eligibility counts one-minute views.

### Cited Findings
- [OFFICIAL, May 6, 2019] Facebook video ranking: "it's important to ensure that videos capture viewers' attention for at least one minute"; more weight for "videos that keep people engaged, especially on videos that are at least three minutes long"; more weight for videos people "seek out and return to week after week." — [Meta Newsroom](https://about.fb.com/news/2019/05/updates-to-video-ranking/)
- [OFFICIAL, SNIPPET-ONLY] Facebook Creators tips: "Add a 15 second trailer to long-form videos. The first few seconds of every video are critical." Also cut long videos to a 3-minute version to test retention. Undated page. — [Facebook Creators: 10 video best practices](https://creators.facebook.com/blog/10-video-best-practices)
- [VENDOR, SNIPPET-ONLY] In-stream ad eligibility has included "30,000 one-minute views on videos that are at least 3 minutes long" in 60 days (alternatives: 15,000 engagements or 180,000 watch minutes); in-stream ads were extended to 1-minute videos in 2021. Check current Meta docs. — [Social Media Examiner](https://www.socialmediaexaminer.com/how-to-monetize-facebook-video-facebook-ad-breaks/), [TechCrunch, Mar 11, 2021](https://techcrunch.com/2021/03/11/facebook-is-bringing-ads-to-shorter-videos-and-stories)

### Inferences
- For Facebook long-form, the opening has to carry a viewer past one minute; a 15-second trailer-style opening is Meta's own suggestion.

### Gaps
- Meta's current (2025–2026) creator documentation on long-form retention was not opened; figures above are 2019–2021.

## 6. Counter-evidence and nuance on the "first 30 seconds" rule

### Takeaway
The strongest evidence against a rigid rule comes from YouTube itself: its benchmark is relative (your last 10 same-length videos; all same-length videos), its threshold is 50% not 70%, and its framing is "match the promise." Low 30-second retention coexists with large view counts (vidIQ's 38.1% / 1.95M-view video), and TV/podcast viewing — where long sessions are wanted — is the fastest-growing long-form context.

### Cited Findings
- [OFFICIAL] Benchmarks are relative to your own last 10 similar-length videos and to "all YouTube videos of similar length." — [YouTube Help 12942217](https://support.google.com/youtube/answer/12942217?hl=en), [9314415](https://support.google.com/youtube/answer/9314415?hl=en)
- [VENDOR, measured] 38.1% at 30 s with 1,954,724 views — more views than four of the five 60%+ intros listed. — [vidIQ](https://vidiq.com/blog/post/increase-audience-retention-youtube/)
- [OFFICIAL-via-press] Subscribers click on ≤~10% of uploads in their feed, so the opening is shown mostly to non-subscribers; the subscribe action "isn't as strong as a lot of people think." — [PPC Land](https://ppc.land/subscribers-skip-90-of-uploads-in-their-feed-youtube-director-says/)
- [VENDOR] Longer hooks can work for 30+ minute videos if value arrives quickly. — [1of10](https://1of10.com/blog/how-to-hook-viewers-in-the-first-30-seconds-of-a-youtube-video/)
- [OFFICIAL] Spikes can mean confusion (rewatching), so a "spiky" opening is not automatically good. — [YouTube Help 9314415](https://support.google.com/youtube/answer/9314415?hl=en)

### Inferences
- Rules like "<70% at 30 s and YouTube punishes the rest" or "intros under 5 seconds" are creator folklore; the measured claims are only that early loss shrinks the audience for everything after it and that clickbait (high CTR, low AVD) is recommended less.
- Established audiences and TV/podcast contexts likely tolerate slower openings, but no published retention data proves it.

### Gaps
- No controlled or large-sample study comparing slow vs. fast intros on long-form YouTube was found.
- No data found on returning-viewer vs. new-viewer intro retention differences.
