# Instagram Reels growth playbook — tactical source of truth for the grow-instagram skill

Based on 2026-08 research (22 sources → 107 claims → top 25 through 3-vote
adversarial verification → 16 confirmed · 9 refuted).
**Every sentence states its evidence grade** — most Instagram growth writing
has no sources, and what does cites vendor blogs as if they were official
docs. Without grades, the 9 refuted claims read with the same weight as the
16 confirmed ones.

- **[primary]** What Meta wrote in its own docs — Transparency Center system
  cards, Help Center, guidelines
- **[measured]** Third-party vendors aggregating their own customer accounts.
  Take the direction only; never use the numbers as targets
- **[rejected]** Died in verification, or no primary source found. Not used as
  a rule

Platform-wide style and publishing rules live in
`skills/platform-guide/references/platform-playbook.md`; this document carries
**growth-loop tactics only**. The companion guide for human readers is
`docs/guides/instagram-growth/index.html`.

## Contents

- [Principle — reach passes two gates](#principle-reach-passes-two-gates)
- [Ranking — what the model actually predicts **[primary]**](#ranking-what-the-model-actually-predicts-primary)
- [Losing eligibility — what this loop guards hardest](#losing-eligibility-what-this-loop-guards-hardest)
- [Account Status — there is no API](#account-status-there-is-no-api)
- [Diagnosis order — when reach dies](#diagnosis-order-when-reach-dies)
- [Rhythm and format **[measured]**](#rhythm-and-format-measured)
- [§Captions (post copy)](#captions-post-copy)
- [§Replies (inbox handling)](#replies-inbox-handling)
- [Search — the text fields are the index **[primary]**](#search-the-text-fields-are-the-index-primary)
- [Cold start — Collabs are the only official play **[primary]**](#cold-start-collabs-are-the-only-official-play-primary)
- [Observed metrics (weekly 4)](#observed-metrics-weekly-4)
- [Do not cite — folklore rejected in verification](#do-not-cite-folklore-rejected-in-verification)
- [Verification failures — what we have to admit we don't know](#verification-failures-what-we-have-to-admit-we-dont-know)

## Principle — reach passes two gates

For an account with zero followers there's practically one road to people:
appearing to **people who don't follow you** in the Reels tab, Explore, and
the recommended feed. That exposure passes two gates in order.

1. **Account eligibility** — can my account be recommended to non-followers at
   all. No violations and it stays open; violate and it closes. When it
   closes, it's not one post — **every post** is blocked together. **[primary]**
2. **The post's audition** — does the uploaded reel get a response from the
   small group it's first shown to. If yes, a wider group; if not, it stops
   there. **[primary]**

The order sets this loop's structure. **With gate 1 closed, even the
best-made reel never reaches gate 2** — so when reach craters, suspecting the
editing first has the order backwards (§Diagnosis order).

Distribution is a ladder **[primary]** — shown first to a few people
predicted to like it; if they respond, a somewhat wider group; if that goes
well too, wider again. **The first rung's response rate decides entry to the
next.** The cold-start bottleneck sits here.

"Follower count doesn't matter" is an exaggeration. The original wording is
"not just the creator's follower count", and the same company's ranking doc
says follower count and engagement level are used as popularity signals. What
is true — and no more — is that new accounts are also recommendation
candidates.

## Ranking — what the model actually predicts **[primary]**

The Transparency Center's **Reels chaining system card** (the system that
decides what to show after the reel you're watching) publishes the model's
prediction targets by number. Only what's here is confirmed fact.

| Prediction | The probability the model computes | Metric the loop reads |
| --- | --- | --- |
| Watch retention | watching longer than 95% of viewers of same-length reels | `ig_reels_avg_watch_time` |
| Early skip | watching under 3 seconds (lower is better) | `reels_skip_rate` |
| Reshare | resharing this reel | `shares` |
| External share | sharing outside Instagram | `shares` (indistinguishable — a combined value) |
| Follow conversion | following this reel's author | no per-reel metric — read account `profile_views` · `followersCount` instead |

Watch retention is a **length-normalized percentile**. A 3-minute reel isn't
compared to a 15-second one in absolute seconds — you don't win by making it
short; you have to sit in the top band of your own length class.

The early-skip inputs include "count of skips within 2 seconds of opening".
That's the evidence that the hook is not marketing advice but **an explicit
prediction target of the model**. And Instagram serves this skip rate through
the API (`reels_skip_rate`) — a metric Shorts doesn't have.

**Three lines not to cross:**

1. **The weights are not public.** Which predictions exist is disclosed, but
   not how the 9–10 combine into a final score, nor each signal's sign and
   size. "Early skip is modeled" is fact; "how big the penalty is" is
   unknowable.
2. **The surface scope is narrow.** Most of the items above come from the
   Reels chaining card, and there's no evidence they carry over as-is to
   Explore or feed recommendations. Only reshare and follow conversion are
   also confirmed in the Explore card.
3. **"DM sends (sends per reach)" is not on this card.** What the card has is
   reshare and external share. Send weighting comes from Mosseri's 2025-01
   remark — "the three most important signals are watch time, likes, sends" —
   which is a **different evidence grade** from the system card. Cite the two
   as one source and the argument collapses.

Put into practice: **don't edit for likes.** What the model directly predicts
is whether they watch to the end, whether they leave within 3 seconds, and
whether they send it to someone.

## Losing eligibility — what this loop guards hardest

What you lose by losing eligibility is far bigger and far faster than what
you gain by editing well.

**Reposting others' content — you drop at the account level [primary]** The
original-content guideline says accounts that mostly post reels, photos, or
slides they didn't create or meaningfully edit may not be shown in
recommendations to new audiences. On 2026-04-30 it expanded from reels-only
to photos and carousels.

- **Not recognized** as original: edits that only add a watermark or border /
  speed changes only / creator credit alone / screenshots with nothing added,
  even with the source named
- **Recognized** as substantive editing: commentary or narration / overlay
  text that goes beyond bare description / graphics that recontextualize

It's not a permanent ban. If most posts in the recent **30-day rolling
window** are judged original, the account can become recommendable again.
That recovery path applies only to the originality reason; Community
Guidelines violations follow a separate process.

Note the modality gap — the guideline text is the hedged "표시되지 않을 수
있습니다" ("may not be shown"), while Mosseri's 2026-04-30 remark is
categorical: "no longer going to be recommendable". **In practice, anchor on
the stronger one.**

**Properties of the reel itself — what Instagram deliberately downranks
[primary]** The ranking doc lists them outright: low resolution / watermarks /
muted / borders / mostly text / already posted on Instagram.

Keep the citation path exact. The reason a TikTok export gets downranked is
**the watermark clause plus the originality policy**, not the "already posted
on Instagram" clause — the latter refers to duplicates within Instagram.
Also, the source word is `borders`; reading that as "letterbox" is
interpretation.

**Policy violations — the whole account stops together [primary]** An account
that recently violated the Recommendations Guidelines or the community rules
loses non-follower recommendation eligibility for a period across Reels, feed
recommendations, Explore, and search — for all posts, not the individual one.
Help Center original (Korean localization): *"계정이 추천 요건을 충족하지
않는 경우 콘텐츠가 추천 가이드라인을 위반하는지 여부에 관계없이 어떠한
콘텐츠도 추천되지 않습니다."* ("If the account doesn't meet the
recommendation requirements, no content is recommended, whether or not that
content violates the recommendation guidelines.")

This regime applies to **public accounts only** (private ones were never
recommendation candidates). What stops is non-follower recommendation reach,
not all reach — followers still see you. But with 0 to a few hundred
followers, in practice that means growth halted.

The phrase "eligibility review" misleads. It's not an apply-and-get-approved
procedure but **a compliance gate that stays open without violations and
closes with them**. The job isn't earning eligibility; it's not letting it
close.

## Account Status — there is no API

Professional accounts can check their current recommendation eligibility in
the app's **Account Status** and appeal an ineligible verdict **[primary]**.
But no API serves this state — the loop can't read the value and **only
reminds** (same pattern as YouTube's Related video). Put a check cadence in
the plan, and when reach craters, put a check request in the tick report.

## Diagnosis order — when reach dies

Don't fix the editing first. Fixing the editing while gate 1 is closed does
nothing.

1. Check recommendation eligibility in the app's **Account Status** (a
   human — no API)
2. Check the **originals share of the last 30 days** of posts (any reposts,
   watermarks, speed-changed cuts mixed in?)
3. Then the content — compare `reels_skip_rate` and `ig_reels_avg_watch_time`

## Rhythm and format **[measured]**

From here on it's vendor aggregates, not Meta docs. Take the direction only;
don't use the numbers as targets.

**Posting frequency — 3–5 per week.** Buffer's analysis of 102K of its own
customer accounts and 2.1M posts found weekly follower growth rising
monotonically with frequency (1–2/week +0.12% → 3–5 +0.26% → 6–9 +0.44% →
10+ +0.66%). But **the reach gain shows diminishing returns**, and the
original's final advice isn't the maximum either — "the point that gets reach
and growth without burnout is 3–5 a week". Quote only the ladder numbers and
you invert the source's conclusion.

Three reasons to discount it: it's a scheduling-SaaS vendor's own blog
(though the conclusion runs against its interest, so inflation is unlikely),
the sample is limited to Buffer customers, and most of the sample already had
a follower base, so **the growth percentages can't be transplanted onto a
channel with 0 to a few hundred followers**.

**There is no frequency penalty in official docs [primary]** (researched
2026-08-15). The distribution-reduction reasons listed in the Transparency
Center's feed and Explore ranking cards and the official ranking explainer
are all content properties (§Losing eligibility); posting frequency isn't on
the list. The one real constraint is feed diversity — the official explainer
says it "tries not to show too many posts from the same person in a row".
That's not an account penalty but a rule that shuffles order within one
person's feed, so spacing posts out instead of bursting resolves most of it.
The API publishing cap is 100 per 24-hour rolling window (a carousel counts
as 1) and it's a quota, not a sanction —
`GET /{ig-id}/content_publishing_limit`.

**Reels as the default format — which doesn't mean better than carousels.**
Instagram's official creator docs state that **reels take up more than 50% of
time spent on Instagram** **[primary]** — that's as far as the official basis
for format choice goes; the engagement comparison below is vendor aggregate.
Metricool's 2026 study (375,118 accounts · 24,364,803 posts) found reels drew
over 4x the interactions of single-image posts, and average watch time more
than doubled year-over-year to **8.5 seconds**. What this evidence supports
ends at "better than a single image" — reels vs carousel engagement is 0.55%
vs 0.52%, nearly equal. The "4x" also looks like absolute interaction counts
rather than engagement efficiency, and since reels reach is much larger, much
of it restates the reach gap.

8.5 seconds is the backdrop for hook design. Over the same period the reels
cap grew from 90 seconds to 3 minutes — if average watch is 8.5 seconds, the
retention rate actually got worse.

## §Captions (post copy)

- **The first 125 characters are the hook** — everything after folds away.
  The caption cap is 2,200 characters.
- **Keywords and hashtags go in the caption, not the first comment**
  **[primary]**. Original: *"For a post to be found in Search, put keywords
  and hashtags in the caption, not the comments."* The first-comment-dump
  habit contradicts the official docs, at least for search visibility.
- Use hashtags as **topic markers**. They're not reach amplifiers — count
  optimization is unsupported ground, so this document gives no number
  (§Do not cite).
- Links inside captions **don't click**. Send external conversion through the
  profile link.

## §Replies (inbox handling)

- 1–3 sentences, plan tone. Add one piece of information or empathy and
  **leave the other person room to answer again**.
- Soulless "감사합니다 😊" ("thank you 😊") replies carry no signal value —
  keep content in it, however short.
- To argument bait and provocation, answer briefly with one fact, or not
  at all.
- **Instagram replies attach only to top-level comments** — to answer a
  nested comment, pass its parent commentId (the inbox response's
  `parentCommentId`). Keep in mind that the whole conversation reads it.

## Search — the text fields are the index **[primary]**

Search ranking is decided by three signals, and among them **the text typed
into the search box dominates**. That text is matched against the username
(handle), profile name, bio, captions, hashtags, and location.

The official advice is three things — make the handle and profile name
relevant to the content's topic, put "who you are and what the account is
about" keywords in the bio, and put keywords and hashtags in captions.

Two caveats. This search doc is **dated 2021-08-25**, so it doesn't carry the
same weight as the 2025–2026 system cards in §Ranking. And the third signal
(popularity) creates a structural disadvantage — when candidates are many,
popular accounts rise. **A channel with 0 to a few hundred followers must not
lean on search for early inflow.** Search is a road that assists channels
already rolling on reels recommendation.

## Cold start — Collabs are the only official play **[primary]**

Instagram's official creator docs directly recommend **Collab posts** as a
way to grow reach. One post goes out to both accounts' followers together
(original: *"a single post shared with both sets of followers"*). In the
0-to-few-hundred band it's the road that fills the reach you can't create
yourself with someone else's readers — the answer to the box §Verification
failures left empty for so long.

**The loop can't execute this.** It's an in-app invite flow the publishing
API can't touch — same pattern as Account Status and YouTube's Related video,
so it **only reminds**. Choosing a partner account is a human judgment,
outside autonomous scope. The loop's share ends at putting candidates in the
tick report.

Record the verified range precisely — that the feature exists and reaches
both follower sets is official. Participant caps and reach-splitting
mechanics couldn't be confirmed (the Help Center detail page wouldn't
render), and **there is no official number for the effect size** (only your
own channel's measurements can tell).

## Observed metrics (weekly 4)

`reels_skip_rate` (hook) · `ig_reels_avg_watch_time` (retention) · shares per
reach · account `profile_views` (interest conversion — the platform gives no
per-reel `follows`). Likes are a lagging indicator and don't change
decisions. Read the subject, length, and format off the top-reach reels into
the next plan — without this learning, the loop just clones the same video.
Planning changes happen with a human in the storyboard pipeline.

The follower count uses the `account.followersCount` profile value, not
insights. Insights' `follower_count` is **an empty value for accounts under
100 followers**, so it's unusable on a new channel (measured in practice).

## Do not cite — folklore rejected in verification

Claims that died in adversarial verification. Not used in plans, reports, or
planning — anywhere.

- **"Reels reach is 2.25x single images · 1.36x carousels"** (0-3) — wrong
  sample attribution. It circulates as "based on 45M+ posts" but the original
  attributes it to a separate 4M+ post analysis.
- **"One or more hashtags means 31.7% fewer views"** (1-2) — the number is
  quoted accurately but the conclusion died. It's a presence comparison
  (0 vs 1+), so it says nothing about "stuffing 30".
- **"Only 21% of sub-10K accounts grew"** (0-3) — the same source summarizes
  it the opposite way. The original offers the number as optimistic evidence
  that it "can still help young brands".
- **All 5 Trial Reels spec claims** (0-3 and 4 more) — non-follower-only
  pre-exposure, the 72-hour verdict, auto-amplification: all failed. During
  verification, context surfaced of Mosseri saying trial reels can't use
  warm-audience signals and so **"almost always reach less than regular
  reels"**. Not recommended as a cold-start experiment tool.
- The exclusive phrasing of **"recommendation ineligibility is account-level,
  not post-level"** (0-3) — the account-level mechanism itself is real
  (§Losing eligibility), but the same page also describes post-level
  verdicts.

## Verification failures — what we have to admit we don't know

Not "haven't looked yet" — **looked, and no evidence passed**.

- **The specifics of reel production norms.** How to build the first 3
  seconds, subtitles or not, audio choice, optimal length — not one primary
  source survived. What's secured is the model structure ("under-3-seconds
  probability is a prediction target") and the measured 8.5-second average
  watch. The space between is empty.
- **The effect size of cold-start seeding.** The mechanism — the first
  group's response rate as the bottleneck — is confirmed in primary docs, and
  one execution path was found: Collab posts (§Cold start, researched
  2026-08-15). But how much that lifts reach has no official number, and no
  execution path other than Collabs has found evidence.
- **Optimal posting timetables.** The vendors publishing the tables disclose
  themselves that they aren't universal.
- **Korea-market specifics.** All the evidence gathered is global samples;
  not a single Korean-account number.

Empty boxes get filled by **our own channel's measurements**, not someone's
blog. The prediction targets confirmed in §Ranking become the measurement
axes as-is — same subject, two cuts with different hook shapes, compare
`reels_skip_rate`. That's a grounded experiment; a norm like "open with a
question within 3 seconds" is ungrounded parroting.
