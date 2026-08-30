# YouTube Shorts growth playbook — tactical source of truth for the grow-youtube skill

Based on 2026-08 research. **Every sentence states its evidence grade** — where
official docs go quiet, creator folklore moves in, and without grades, guesses
harden into rules.

- **[official]** Confirmed in YouTube/Google first-party docs
- **[measured]** Large-scale creator research — cited with its source and limits
- **[unverified]** Verification failed. Not used as a rule

Platform-wide style and publishing rules live in
`skills/platform-guide/references/platform-playbook.md`; this document carries
**growth-loop tactics only**. The companion guide for human readers is
`docs/guides/youtube-shorts-growth/index.html`.

## Contents

- [Principle — what creates reach](#principle-what-creates-reach)
- [Hook and length](#hook-and-length)
- [AI disclosure — this pipeline's core rule](#ai-disclosure-this-pipelines-core-rule)
- [Mass repetitive production — this pipeline's second risk (researched 2026-08-15)](#mass-repetitive-production-this-pipelines-second-risk-researched-2026-08-15)
- [Funnel — where to send Shorts viewers](#funnel-where-to-send-shorts-viewers)
- [§Replies (inbox handling)](#replies-inbox-handling)
- [Observed metrics (weekly 4)](#observed-metrics-weekly-4)
- [Do not cite — folklore rejected in verification](#do-not-cite-folklore-rejected-in-verification)
- [Verification failures — what we have to admit we don't know](#verification-failures-what-we-have-to-admit-we-dont-know)

## Principle — what creates reach

**[official]** The primary Shorts performance metric is Studio's "How many
chose to view" (the viewed rate versus the swipe-away rate). YouTube named it
directly as the replacement when it removed the Shorts dislike metric in
2026-06. It's not a retention curve but **the share who chose to watch in the
first moment**, so read it as a hook signal.

**[official]** But that metric isn't in the Analytics API — the loop judges
with `averageViewPercentage` from `youtube_insights` instead, and when the
swipe metric is needed, a human checks Studio.

**[official]** Upload frequency is not a ranking requirement. Each Short is
evaluated on its own — the exact opposite of Threads. On Threads, posting
rhythm and the first 60–90 minutes decide reach, but on Shorts there's no
official basis for "upload daily and the algorithm boosts you". Slots are
fixed for production rhythm and viewer habit, not for the algorithm.

## Hook and length

**[measured]** Paddy Galloway's 2023-04 study (33 channels · 5,400 Shorts ·
3.3B views) is effectively the only large-scale primary dataset in this field.
Its numbers:

- Below a 60% viewed rate almost nothing performed, and Shorts that did well
  clustered in the 70–90% band.
- Videos over 40 seconds did better on average, and Shorts with average watch
  duration past 50 seconds averaged 4.1M views.
- The author's conclusion: **the variable is held attention, not length**, and
  every length band had outliers.

**Always keep the limits alongside the numbers**: it's April 2023 data, when
the Shorts cap was 60 seconds — this data says nothing about the 3-minute era.
The methodology is closed and there's no statistical testing (values read off
a scatter plot by eye). At an average 610K views per video it's a big-channel
sample, and it's lead-generation content from a consulting firm. **It's no
official benchmark, so "you must clear 60%" is not used as a rule** — only as
an observed range.

**[measured]** "Make the first second strong, treat the intro like a
thumbnail" is a prescription from the same article. Keep the distinction:
author advice, not a measured result.

**[official]** There is no official answer on length. YouTube's docs set only
the 3-minute cap (uploads after 2024-10-15) and recommend no duration inside
it — a sweep of seven production-tip docs found no length advice. One
practical constraint: with licensed music, most tracks cap at 90 seconds and
some drop to 60 or 30. A copyright claim on a Short over one minute means a
worldwide block.

## AI disclosure — this pipeline's core rule

**[official]** social-flow generates the video (Veo), music (Lyria), and voice
(TTS), so it's in disclosure scope. YouTube's stated disclosure targets
literally include **"AI generated music"** and realistic generated footage of
real places and people.

**[official] Exemption list** — a video made only of these is not a disclosure
target: script/title/thumbnail/outline generation, caption generation, idea
generation, **cloning your own voice**, unrealistic content (unicorns,
fantasy, animation), color grading/beauty/effects filters, quality enhancement
and upscaling.

**[official]** Disclosing costs nothing: *"Disclosing AI content won't limit a
video's audience or impact its eligibility to earn money."* Habitual
non-disclosure, on the other hand, draws forced labels, content removal, and
YPP suspension. **The asymmetry is clear, so when in doubt, disclose** —
that's why `youtube_publish` defaults `containsSyntheticMedia` to true.

Label placement: realistic AI content gets it on the player; unrealistic and
animated content gets it in the expanded description.

## Mass repetitive production — this pipeline's second risk (researched 2026-08-15)

**[official]** Among what the spam policy bans, one clause hits this pipeline
head-on: flooding the platform with repetitive content churned out by
production tools. The policy's own example is **a channel using the same
background music and repeating AI imagery in every video while an AI-written
script is read aloud**. social-flow generates the music (Lyria), imagery, and
narration (TTS), so running the template unchanged lands inside that sentence.
Sanctions are content removal, warnings, and strikes — three strikes in 90
days ends the channel.

**The trigger is repetition, not frequency.** No platform wrote "more than N
per day"; they all wrote "the same thing, repeatedly". Five a day, each made
differently, matches no clause; one a day for 30 straight days with identical
BGM, framing, and narration does. So the response isn't publishing less — it's
**creating variance**: change at least one of BGM, cover framing, or opening
every episode, and don't push the same mold out back-to-back just to drain
the queue.

**[official]** There's also a daily upload limit, but it's separate. The
number isn't public, varies by country and channel history, and shrinks after
a Community Guidelines warning. Exceeding it isn't a sanction — it's an upload
error that clears after 24 hours.

## Funnel — where to send Shorts viewers

**[official]** URLs in a Short's description and comments **don't click**
(spam prevention). You can paste them as plain text but they won't act as
links. For external conversion, use the channel profile link.

**[official]** The official tool for routing to long-form is **Related
video** — attaching a link to another video on the same channel to one Short.
The path is Studio > Content > that Short > Related video > pick target >
Save. It can only be set **per video, after upload** — not in the upload flow
and not as a channel default. The Data API has no matching field, so
`youtube_publish` can't touch it — which is why the loop only reminds.

It needs phone verification or higher, and the target video must be public or
unlisted.

**[official]** YouTube's advice: don't just place the link — say the CTA out
loud, point at where the link sits, and show the destination's thumbnail. But
**there are no effect numbers anywhere** — official blog, Creator Insider,
Help Center: zero CTR or conversion figures (machine-scanned). To learn the
effect you'd have to split Shorts with and without it and measure in Studio
yourself.

## §Replies (inbox handling)

- 1–3 sentences, plan tone. Add one piece of information or empathy and
  **leave the other person room to answer again**.
- Soulless "감사합니다 😊" ("thank you 😊") replies carry no signal value —
  keep content in it, however short.
- To argument bait and provocation, answer briefly with one fact, or not
  at all.
- A YouTube reply lands on the top-level comment thread — you're not answering
  one nested comment; the whole conversation reads it. Keep that in mind.

## Observed metrics (weekly 4)

engagedViews (views that got past the opening) · averageViewPercentage ·
subscriber delta · per-video view distribution. Likes are a lagging indicator
and don't change decisions. Read the subject, length, and format of the
top-reach videos into the next plan — without this learning, the loop just
clones the same video. If only views are low while early pass-through and
retention sit at or above the median of the recent N episodes, don't copy that
episode as a "well-made format". That's the read of fans clicking while
first-time viewers never came in. Open the next episode's title and cover with
the problem that person already feels, not the method or tool.
`content_feedback` exposes this combination as the angle lever.

**[official]** `views` is not a quality signal — YouTube changed the view
definition, and it now counts **plays started or replayed with no minimum
watch-time requirement** (confirmed 2026-08-15). A play swiped past still
counts as a view, so "views went up" alone doesn't mean the video was good.
This makes it even clearer why engagedViews and averageViewPercentage are the
judgment axes among the four.

**A view ceiling is a promotion verdict, not the size of the demand.** Shorts
expose in steps — every upload goes to a small seed pool first, and its response
signals (retention, swipe-through) decide promotion to the next, larger pool.
Two videos parked at nearly the same count (own channel 2026-08: two at ~1,300)
read as "seed pool consumed, promotion failed". On those same four episodes the
Studio retention order (52 → 38 → 26 → 19% continued watching) matched the view
order exactly across a 3× view spread — measured, n=4, own channel, with one of
the four under 14 hours old at measurement (retention unconfirmed; the report's
own §6 asks for re-verification on the next episodes). So when views stall,
rank the recent episodes by `averageViewPercentage` (the proxy in
`youtube_insights` — it doesn't expose the curve, so read the curve itself in
Studio) before touching anything: the
episodes that rank low there owe the next storyboard a **body fix** (storyboard
SKILL §core rules, the hold job — installments per scenario-craft §5), while
low views over healthy retention stays the title/angle problem described above.
Creator-observed promotion cutlines (2025.12–2026.08 public analyses — vidIQ,
SocialBee, quso.ai and others; direction solid, exact numbers vary by niche,
none official): 3-second retention 80%+, final average view percentage 70%+,
2-second swipe rate under 40%.

**Promotion reads two layers, and holding is only the first.** The next-pool
verdict combines watching (averageViewPercentage) with response — `likes` ·
`comments` · `shares`, all in the same `youtube_insights` per-video output.
Own-channel case (2026-08): the episode that ranked first on retention of the
four still parked at 1,367 views with 14 likes · 0 comments — the first layer
cleared and the second stayed empty. The lagging-indicator rule above still
stands (likes don't pick the next topic); what an engagement floor under
healthy retention diagnoses is the **act beat** — an ending that answers and
stops gives the viewer nothing to do. Design the outward loop there (storyboard
scenes-schema §playback order, act row) and leave the body the curve says is
holding alone.

Analytics lags 2–3 days. An empty yesterday is not an outage; compare 7-day
windows against each other.

## Do not cite — folklore rejected in verification

Claims that died in adversarial verification. Not used in plans, reports, or
planning — anywhere.

- **Shorts subscription-conversion numbers — both directions.** "16.9
  subscribers per 10K views" (0-3) and its opposite, "long-form converts
  subscribers better than Shorts" (1-2), **both** failed. So there's no basis
  for "Shorts are a subscriber cheat code" nor for its denial — say nothing in
  either direction.
- **"Shorts RPM is 3–14% of long-form"** — the per-niche ratio claim was
  rejected 0-3.
- **"A watermark gets you demoted (official policy)"** — the phrase "no
  visible watermarks" does exist in Instagram's docs, but they name neither
  TikTok nor other-app reuse. Instagram's duplicate rule also targets
  **identical copies within Instagram**, so it can't serve as evidence of a
  cross-platform penalty.
- **"New channels can't use Related video"** — the docs contradict each other;
  rejected as undecidable.

## Verification failures — what we have to admit we don't know

- **Every Korean-market number.** The verified Shorts RPM table (US $0.328,
  etc.) has no Korea row at all. Korean channel RPM, language-choice effects,
  raw data on domestic YouTuber income distribution — all failed verification.
  Don't transplant English-market numbers onto Korea.
- **Optimal length in the 3-minute era.** The only large dataset is from the
  60-second-cap days.
- **Primary evidence for hook-writing norms.** On 2026-08-15 we re-swept
  several official Shorts docs (Shorts tips · Get started creating Shorts ·
  editing tips) — no hook or length advice. The line "grab the first 1–2
  seconds" does exist, but it comes from a **Google Ads advertising doc** —
  citing it as a general Shorts production norm swaps out the source. The
  Instagram side reached the same conclusion (grow-instagram §Verification
  failures), so this blank is shared by both platforms.
- **The effect size of Related video.** Only knowable from the channel's own
  A/B.
- **Whether multi-language audio tracks apply to Shorts.**
