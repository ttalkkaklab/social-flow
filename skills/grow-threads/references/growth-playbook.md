# Threads growth playbook — tactics source of truth for the grow-threads skill

Based on 2026-08 research (Meta Transparency Center + multi-source
cross-checks), re-measured 2026-09-19 against 61 popular posts written by other
people plus two third-party datasets
(`docs/research/2026-09-19-threads-post-styles/`). Single-source numbers were
dropped. Platform-wide style and posting rules live in
`skills/platform-guide/references/platform-playbook.md` §3; this document
carries **growth-loop tactics only**.

## Contents

- [Principles — what creates reach](#principles-what-creates-reach)
- [Rhythm](#rhythm)
- [§New-post style](#new-post-style)
- [§Post types — what each one buys](#post-types-what-each-one-buys)
- [§Chain posts (hook + own replies)](#chain-posts-hook-own-replies)
- [§Replies (inbox handling)](#replies-inbox-handling)
- [§Search engagement (other people's conversations)](#search-engagement-other-peoples-conversations)
- [Seuhari culture (Korea-local)](#seuhari-culture-korea-local)
- [§Form — what creates response (measured on a cold-start channel)](#form-what-creates-response-measured-on-a-cold-start-channel)
- [§Engagement targets — ability to contribute comes before reach](#engagement-targets-ability-to-contribute-comes-before-reach)
- [§Reply reach — engagement is not a side activity (measured 2026-08-12)](#reply-reach-engagement-is-not-a-side-activity-measured-2026-08-12)
- [Observed metrics (4 weekly)](#observed-metrics-4-weekly)

## Principles — what creates reach

Threads judges **each post on its own**, not your follower count. The
Transparency Center card "Instagram Threads Feed AI system", read 2026-09-19,
names ten predictions: ① like · ② **scroll past** (lower is better) · ③ tap the
author's profile, then another post · ④ tap the post, then another post ·
⑤ reply · ⑥ tap the post · ⑦ tap the author's profile · ⑧ like after tapping in ·
⑨ **time spent on the permalink page** · ⑩ time spent viewing the post.

**Six of the ten are clicks and dwell; a like appears in two.** Follower count
and posting frequency are on neither list. (A 2026-08 read of the same card
recorded five predictions, one of them "probability of following the author",
which the card no longer shows — the ten above replace that note. Like, reply,
profile tap and scroll-past appear in both reads.) Translated into practice:

- **A post that leaves the reader with nothing to say has a low ceiling.**
  Don't close with a verdict — leave a gap someone can step into. A post that
  collects replies beats one that only collects likes.
- **⑨ is what "replies are weighted heavily" actually is.** A post with a stack
  of replies turns its permalink into something to read, and that reading time
  comes back as reach. So the reply count is not a vanity number — it is the
  input to two of the ten predictions.
- **Early velocity beats total volume.** The same reactions spread further
  when they land within the first 60 minutes — which is why golden-hour
  reply handling is the tick's top priority.
- **Engage before you post.** Spending the 10–15 minutes before publishing on
  replies to other people's posts marks you as an active user and lifts the
  next post's early distribution. The tick order (engage → new post)
  implements this.
- **Running Instagram alongside is a signal** — IG profile views feed the
  follow-probability prediction.

Suppressed (Meta explicitly): engagement begging ("좋아요 눌러" · "댓글
YES"), organized reciprocity circles. Posts that smell like X cross-posts and
stitched-together essay threads are also patterns that die in our
measurements.

## Rhythm

- No cap on new-post count — write **as much as you have to say**. Consistent
  accounts settling into a 1–3-a-day rhythm is an observation, not a rule.
  The rule points the other way: filler posts written to keep a rhythm with
  nothing to say are the fastest way to kill an account. Slots (target
  audience's active hours) are guidance to prefer those windows when a post
  does go out.
- **No mechanism punishing frequency itself has been confirmed**
  (2026-08-15 research). The Threads evidence is the ten predictions in
  §Principles — posting frequency isn't on the list Meta published. **Keep
  the citation path precise**: the Transparency Center feed/explore ranking
  cards and the official ranking explainer swept in that same research are
  **Instagram documents**, not a sweep of Threads ranking docs. What was
  confirmed there gets cited as Instagram-only: that the listed distribution
  penalties are all content attributes, and that the feed-diversity rule
  ("we try not to show too many posts from the same person in a row") is a
  per-viewer feed-ordering device, not an account penalty.
- **API hard limits are not sanctions** — in a 24-hour sliding window:
  publish 250 · replies 1,000 · deletes 100 · location search 500. Exceeding
  them just returns an error; the account takes no mark
  (`GET /{threads-user-id}/threads_publishing_limit`). Judgment-based
  publishing never touches these lines. Research notes:
  `docs/research/2026-08-15-posting-frequency-and-growth/`.
- Links: the 2024 link penalty was retracted (Mosseri, official). But a body
  link still has the separate problem of pulling readers away and cutting
  replies — the growth loop's regular posts **default to link-in-reply, and
  body links only after channel A/B measurement**, recorded in the plan.
  Episode content (videos going out via produce → publish) is the exception
  where a body link is canonical (platform-playbook §3) — know the two paths
  differ and don't mix them. **A breakout push is a third path** — the growth
  loop posting about an episode that already went out on YouTube. It takes the
  episode path's treatment, since its subject is an episode, but its target is
  the **YouTube watch URL**: §3 prefers the IG reel permalink to keep the
  reader inside Meta, and a push exists to send them out to that video. Put it
  in the body or the self-reply as the plan's link policy says, and don't
  assume the `linkUrl` preview card takes it — an IG permalink there is a
  measured 400 and a YouTube URL there has never been tried. Only a plan
  carrying §Cross-platform push may use this path at all.
- Hashtags (topic tags) ≤1 — they carry no ranking weight.

## §New-post style

Use the single speech style pinned in the plan (the Korean Threads default is
반말/casual — not mandatory, but switching between posts reads as an admin
account). Rules:

1. **Short by default — but the rule is whether it gets read to the last
   line.** 500 characters are allowed and the timeline is scanned, so 1–3
   lines is where a post starts. It is not a cap: in the 61-post sample the
   four posts over 250 characters led every length band (72,500 median views ·
   188 median replies), and all four were narratives carrying a time, a place
   and a person. Predictions ⑨ and ⑩ measure reading time, not brevity. Go long
   only with material that holds — two lines that lose the reader are long.
2. **Observation and confession > finished argument.** "이거 나만 그런가?"
   (is this just me?) collects more replies than "이래야 합니다" (this is how
   it should be). Neutral summaries and news relays with the judgment removed
   die for the same reason (see the information-delivery posts in §Form's
   measurements) — stake one judgment of your own, just don't close with a
   verdict.
3. **End on a question — but never an empty one.** Lay down one experience of
   your own and invite the other person's. "여러분 생각은?" (what do you all
   think?) is close to engagement begging.
4. **Don't spend the hook.** Say the whole conclusion and there's nothing
   left to reply with.
5. **An image lands harder and travels less.** Buffer's 10.2M-post set puts
   image posts at 4.55% engagement against text's 2.79%, while BlackTwist's
   66,605-post set puts text-only at 3,900 median views against media's 1,219.
   Both hold at once — text travels, images land. So attach an image to a post
   written for conversation, and leave a post written for reach as text.
   (Until 2026-09-19 this rule read "an image wins on reach", which is
   backwards.) Never a decorative image: it earns its place by carrying a
   number, a comparison or a scene.
6. No unexplained jargon (plain-language principle — inherited from
   platform-playbook §2).
7. **Don't close in written register.** Ending on `-ㄴ다/-는다` — like
   "화면이 나온다" · "주소부터 준다" · "이렇게 친다" — is newspaper register;
   in casual speech people say "나와" · "줘" · "쳐" · "~하거든" · "~하더라".
   User directive (2026-08-13), and `check-style.py` D9 blocks it at S1.
   Posts explaining a procedure drift into this ending, so watch **while
   authoring** — meet it first at the checker and you rewrite the paragraph
   wholesale.
8. **Pick the intent before the first sentence** — reach or conversation. They
   come from different posts and a post reaching for both usually misses both
   (§Post types).
9. **Reply to your own post right after publishing.** Buffer measured +42%
   engagement on posts where the author replied to their own post — the
   largest lift of the six platforms it tracks. One line that adds something
   (the detail that didn't fit, the number behind the claim, the counter-case),
   never "많이 봐줘"-type filler, and it goes through the gate like any other
   copy.

### AI 티가 나는 구조 — avoid the template

- **Don't build matching paragraph boxes.** Repeated sentence counts,
  near-identical paragraph lengths and identical endings together call for a
  rewrite. Read the whole post aloud; varying endings mechanically (`~거든요`
  here, `~더라고요` there) doesn't fix its structure. Length uniformity alone
  isn't proof of machine authorship — §Form records a counterexample.
- **Cut the host's announcements.** `숫자 몇 개만 더 둘게요`, `정리해 볼게요`
  and `말씀드리면` announce information instead of giving it. Start with the
  information. Don't ban an ordinary promise just because it ends in `둘게요`.
- **Don't default to three matching bullets plus a question.** Lists earn
  their place when the reader needs to compare or follow steps. Three bullets
  with matching endings followed by `어느 쪽이 더 걸리세요?` don't become a
  conversation by adding the question mark.
- **Give numbers a job.** Keep the number that makes the scene legible; move
  supporting figures to the self-reply or omit them. Four figures are a cue
  to inspect density, not an automatic defect. Keep dates, denominators,
  units and qualifications needed to understand the remaining claim.
- **Don't manufacture a confession to escape the template.** First-person
  incidents, dialogue and actions need supplied evidence. Mark an imagined
  scene as hypothetical. A style-check PASS never certifies truth or rhythm.
- **Earn the closing question.** §New-post style's question ending must grow
  out of a specific tension in the post. Don't append a generic audience poll
  to a finished mini-lecture. Leave readers something concrete to answer.

### 코믹 요소 — make the situation do the work

- **Start with the friction, not a joke quota.** Use a concrete object or
  action and a mismatch between what the narrator expects and what happens.
  When comic copy is requested, test whether the reader can point to the
  scene and the turn; an emoji or `ㅋㅋ` is neither.
- **Let the narrator take the hit.** A modest self-directed jab can make a
  serious subject approachable. Keep it an opinion or a supported experience;
  don't invent a mishap, quote or customer story to sound human.
- **Keep the turn attached to the subject.** For example, imagining less work
  after delegation and finding oneself busy supervising keeps the joke on
  the operator. Don't give the AI invented motives or dialogue and present
  them as an observed incident.
- **Keep the facts intact through the punchline.** A monitoring block rate
  isn't a failure rate or the share of danger detected. An incident count
  isn't a prediction for all deployments. Don't shorten away the qualifier
  that prevents that reading.
- **No victim ridicule, forced memes or alarmist punchlines.** No fabricated
  damage, slurs, emoji piles, engagement bait or jokes at an affected user's
  expense. On harm-heavy material, keep the joke on the narrator's habits
  or skip it. Don't turn every post into the same confession–joke–question
  template; comic strength is judged by reading, not by counting devices.

## §Post types — what each one buys

Measured on 61 popular Korean posts collected from the logged-out
recommendation feed on 2026-09-19 (view counts read off each permalink —
Threads publishes them for other people's posts too, which is how a post's
reach can be measured with no insights access). Medians; type labels are the
reader's judgment.

| Type | Views | Replies | Response rate |
|---|---:|---:|---:|
| Verdict request ("이거 어때?", "내가 잘못한 걸까?") | 32,000 | **59** | 0.48% |
| Small talk / scene | 30,500 | 24 | 0.54% |
| Personal story / confession | 27,000 | 19 | 0.41% |
| Information / tip | 24,000 | **13** | 0.41% |
| Fandom / match reaction | 21,000 | 23 | **1.33%** |

- **A verdict request is the type that opens conversation** — 4.5× the replies
  of an information post at comparable reach. Its shape is one thing:
  **someone else holds the answer.** "해저 터널 벽 왜 투명하게 못 만들어?"
  collected 199 replies against 71 likes. A question the writer already
  answered inside the post collects nothing, and it is the failure mode this
  loop falls into — we know our own material too well.
- **Information posts get sprayed wide and go quiet.** Four of the five were
  shown to 20,000–30,000 people and collected 7–16 replies. The one exception
  (2.71% response) was information the reader could answer with a memory of
  their own — a neighborhood restaurant reopening. Our material is mostly
  information, so this is the type to convert: carry one judgment of our own,
  or a line that pulls up the reader's own memory, or turn it into a verdict
  request.
- **Confession is our measured strength** and the sample agrees it collects
  response rather than reach (§Form's cold-start numbers, same direction).
- **A question doubles replies and sells likes** — 46 median replies against 21
  without one, but 0.51% response against 0.70%. That is the reach-versus-
  conversation trade priced out. Decide which one this post is for.

## §Chain posts (hook + own replies)

One short hook post, then the substance in **self-replies** —
`threads_publish` with the previous part's `postId` as `replyToId`, one call
per part. June's two most-viewed English posts (1.9M · 1.4M) were both this
shape, and the third-party "long chains reach 8.5× short posts" figure
(BlackTwist, 66,605 posts) is this structure, not one post filled to 500
characters.

Why it works: the reader clicks once and keeps clicking, which hits
predictions ③, ④, ⑨ and ⑩ at the same time. The body is short; the substance
is one click away.

When to use it: material that is a list or a sequence of lines the reader can
use as-is. A single observation stays a single post — a chain built out of one
idea padded into parts reads as a stitched-together essay thread, which
§Principles already lists as a pattern that dies in our measurements.

Rules for a chain:
- **The hook part carries a loss, not a promise.** "아무도 안 알려준다" ·
  "너무 늦기 전에" worked; "꿀팁 알려줄게" is the engagement-bait register.
- **Every part stands on its own.** A reader who lands on part 3 from a
  permalink has to get something from it.
- **Every part clears the style checker on its own, and the chain goes to the
  reviewer as one draft** — the parts numbered in reading order on the
  `post_chain` surface, judged as a whole, and one FAIL anywhere fails the
  chain.
- **Publish in order and stop on a failure.** A half-published chain is worse
  than no chain: don't retry inside the tick (absolute rule 3), record the
  parts that went out in posts.md, and leave the rest.
- Chain parts count against the publish quota one by one (250 per 24h,
  `references/api-limits.md`) — a 5-part chain is 5 publishes.

## §Replies (inbox handling)

- 1–3 sentences, plan tone. Add one piece of information or empathy and
  **leave the other person room to answer again**.
- Soulless replies like "감사합니다 😊" (thank you 😊) carry no signal value —
  short is fine, empty is not.
- To bait and hostility: answer briefly with one fact, or not at all. Hiding
  is outside autonomous scope — report to the user only.

## §Search engagement (other people's conversations)

A brand account stepping into someone else's post — the bar is higher:

- **Contribute, only** — experience, information, a concrete tip. Promotion,
  links, and steering people to your own posts are banned (that instant it's
  spam, and it cuts the whole account's signal).
- Only a substantial reply counts as signal — never a one-or-two-word
  reaction.
- Fresh root posts only (RECENT + 24h, `isReply: false`). Replies on old
  posts reach no one.
- Never re-engage the same post (state.engagedPostIds). Don't trail the same
  account with back-to-back replies — the recipient reads it as stalking, the
  algorithm as coordinated engagement.
- Stay out of contentious and sensitive posts (the plan's banned topics
  apply).

## Seuhari culture (Korea-local)

스하리 (seuhari — follow + heart + repost) · 반하리 (banhari — returning as
much as you received) · 스친 · 스린이 — a culture where reciprocity has its
own vocabulary. The loop's part ends at **answering received goodwill with a
reply**. Swap-room participation and mechanical follow-backs can't be told
apart from the suppressed coordinated-engagement patterns, so we don't do
them. What people notice first isn't the algorithm — it's one-sidedness.

## §Form — what creates response (measured on a cold-start channel)

Results from posting four times in one day on an account with
single-digit followers. Reach and response moved **in opposite directions**.
Response rate is (likes + replies) / views.

| Post | Reach | Response rate |
| --- | --- | --- |
| Affiliate-structure discovery (information delivery) | mid | 0.4% |
| Reporting-exemption tip (information + question) | low | 0.6% |
| **Confessional laying our metrics bare** | **top** | **4.0%** |
| Gate-blunder confession (comma) | bottom | 2.0% |
| Numbered list of API traps | bottom | 0% |

(Re-measured the next morning — the gap widened overnight. The confessional
kept growing on its own while the rest stalled. Nearly half the replies on it
came from others, and those turned into conversations.)

What to read is not views but **response against views**. Posts that just
throw information out get sprayed wide and nobody taps — the bad side of the
"scrolled past" ranking signal.

**The axis that split them wasn't style — it was the reader's stake.** None
of the four had vocabulary tells (all passed the style gate). The API-trap
list applies only to people building Threads automation themselves; the
confessional reads as their own story to anyone growing an account. 7.6x the
reach at the same age.

So pin it in one line before writing — **"who reads this post, and what will
they be able to judge within 60 seconds."** If the answer only works with our
tool or pipeline names in it, change the topic. The hook's first sentence
carries a number or situation the reader knows.

Rejected hypotheses get recorded too — "uniform sentence length reads as
machine" broke on measurement. The top-response post was the more uniform one
(coefficient of variation 0.13). But the **longest sentence** did split them
(only the trailing post capped at 21 characters; the rest 25+), and that was
fixed as gate C7 (korean-style.md §C7).

## §Engagement targets — ability to contribute comes before reach

The temptation to jump into big-exposure posts keeps coming. One criterion —
**can we give something we actually experienced.** Measured skips:

- 7,232 exposures · a keyboard-app recommendation post → we have no
  first-hand experience. Jump in on reach alone and it's spam.
- 617 exposures · a "조회수 치트키 알려줄까?" (want the view-count cheat
  code?) bait hook → producing our measurements against it reads as picking a
  fight.
- 181 likes · "자랑 늘어놓고 가세요, 리포해드릴게요" (drop your brag, I'll
  repost you) → a repost exchange conditioned on self-promotion in the
  replies. Directly against the promotion ban and the reciprocity ban.

What we picked instead were small posts at 77–364 exposures — someone stuck
building the same thing with the same tools, someone about to hit the trap we
solved that day. What a brand account earns by stepping into someone's post
isn't reach — it's **whether that person remembers us**.

## §Reply reach — engagement is not a side activity (measured 2026-08-12)

Querying all 14 of our replies, the top two exceeded the reach of **four of
our six root posts from the same period**. The structure explains it — the
reply rides the other post's reach, and standing in front of an audience
someone else already gathered beats anything a single-digit-follower account
can reach with its own posts.

So in the cold-start stretch, **engagement is not the fallback activity for
when you can't write a new post.** When candidates exist, engage first; when
they dry up, as they did that morning, that's an observation tick.

But even at high reach, the response stayed thin (both top-reach replies: 1
like · 0 sub-replies). A reply opens a conversation but doesn't pull people
to the account — bringing them to the profile is still the root post's job.
Don't blend the two axes when judging.

**One outside data point attached** (2026-08-15 research). Mosseri said in a
Platformer interview, *"If you're really trying to grow your presence, you
should reply much more than you post."* Until now we held this principle on
our single measurement; the statement points the same way. **Grade:
[statement · secondhand]** — the Platformer source URL 404s, so first-hand
confirmation failed and we only have secondary-outlet quotes. Don't cite it
with the weight of system-card-grade evidence.

## Observed metrics (4 weekly)

Reach per post · replies per post · follower growth rate · profile visits.
Likes are a lagging indicator and change no decision. Read topic and form off
the top-reach posts in threads_insights and feed the next post — without this
learning, the loop just clones the same post.

**Account-level metrics alone hide reply performance.** `threads_insights`'s
`posts` holds root posts only, and the account totals' `likes` · `replies`
**mix in the replies we wrote** (measured: when replies climb while the inbox
stays empty, they're usually ours). To see engagement performance you must
sweep `/{id}/insights` directly via `state.recentReplyIds` — skip that and a
reply that traveled further than any root post never gets a line in the
ledger.
