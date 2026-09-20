# Threads post styles, 2026-09-19

Reach and replies come from different posts. That split was already in this plugin's
cold-start measurements (growth-playbook §Form, 5 posts on a single-digit-follower
account); this round tested it against 61 popular posts written by other people, Meta's
own ranking card, and two third-party datasets. It holds, and it is sharper than the
skills said: an information post can be shown to 30,000 people and still collect 13
replies, while a post that asks the reader to judge something collects 59 replies at the
same reach.

Three rules in the skills were wrong or too narrow and are corrected here: "1–3 lines is
the right answer", "an image beats text on reach", and the five-item list of Meta's
ranking predictions.

## Method

Threads keyword search (`threads_search`) returns only our own account's posts until the
app clears advanced access, so no sample could be collected through the API. The sample
was collected in the browser instead: the logged-out recommendation feed was reloaded 18
times on 2026-09-19 (evening, KST), duplicates dropped, 61 posts kept. The logged-out
feed only carries posts the ranker is willing to show someone it knows nothing about, so
the sample is already filtered to what travels.

**Each post's permalink page publishes its view count, for other people's posts too.**
That is what made the measurement possible without insights access, and it is reusable —
any post's reach can be read this way.

Median views 27,000, maximum 1.91M. Response rate here is (likes + replies) / views.
Type labels are the reader's judgment, not a platform field.

## Meta's published ranking predictions

The Transparency Center card "Instagram Threads Feed AI system", read 2026-09-19, names
ten predictions:

| # | Prediction |
|---|---|
| 1 | probability of liking the post |
| 2 | probability of scrolling past it (lower is better) |
| 3 | probability of tapping the author's profile and then another post |
| 4 | probability of tapping the post and then another post |
| 5 | probability of replying |
| 6 | probability of tapping the post |
| 7 | probability of tapping the author's profile |
| 8 | probability of liking after tapping in |
| 9 | **time spent on the permalink page** |
| 10 | time spent viewing the post |

Six of the ten are clicks and dwell; a like appears in two. That is the mechanism behind
the rule everyone states as "replies are weighted heavily" — a post with a stack of
replies turns its permalink into something to read, and that reading time is measured as
#9 and #10.

Follower count is not on the list. Neither is posting frequency.

**Discrepancy with the earlier note.** growth-playbook recorded five predictions from a
2026-08 read of the same card, and one of them — probability of following the author —
is not on the card as read on 2026-09-19. Like, reply, profile tap and scroll-past appear
in both reads. Either the card changed or the earlier note generalized; the ten above are
what the card says today, so they replace the five.

## The 61-post sample

### Top 5 by views

| Views | Likes | Replies | Response rate | Post |
|---:|---:|---:|---:|---|
| 1.91M | 2,200 | 339 | 0.13% | five lines of nouns panning a drama ("그놈의 입술필러 / 뜬금 선글라스 / 국어책 읽는 발성…"), 78 chars |
| 380K | 13,000 | 357 | **3.52%** | "9/2일 출산하고 나서 딸아이가 3시간 만에 하늘로 떠났습니다", 190 chars |
| 350K | 2,000 | **445** | 0.70% | the grandmother in the next airplane seat — a 500-char narrative carrying the time, the place and the flight number |
| 170K | 150 | 5 | 0.09% | "나 이 빵 자주 먹는데 배우가 얘기하는 거 보고 반가웠음" |
| 150K | 1,100 | 37 | 0.76% | "얘네는 진짜 단종시키지마라" plus two products |

First and second place are opposites. The 1.91M post is near the bottom of the sample on
response rate; the 380K post is near the top. One post does not do both jobs.

### By type

| Type | Posts | Median views | Median response rate | Median replies | Median likes |
|---|---:|---:|---:|---:|---:|
| Verdict request ("이거 어때?", "내가 잘못한 걸까?") | 14 | **32,000** | 0.48% | **59** | 66 |
| Small talk / scene | 10 | 30,500 | 0.54% | 24 | 153 |
| Personal story / confession | 11 | 27,000 | 0.41% | 19 | 89 |
| Information / tip | 5 | 24,000 | 0.41% | **13** | 103 |
| Fandom / match reaction | 21 | 21,000 | **1.33%** | 23 | **337** |

- **Information posts get sprayed wide and go quiet.** Four of the five landed at 7–16
  replies and 0.26–0.44% response after 20,000–30,000 people saw them. There is nothing
  to add after reading one.
- **The one exception says what to do about it.** The only information post above 2.7%
  response was "the tteokbokki place in Bukchon reopened" — information the reader can
  answer with a memory of their own ("나도 거기 좋아했는데").
- **A verdict request takes reach and conversation at once.** Its median 59 replies is
  2–4× every other type. The shared shape is that **someone else holds the answer**:
  "해저 터널 벽 왜 투명하게 못 만들어? 진짜?" (45,000 views · 199 replies · 71 likes),
  "내가 잘못한 걸까?" (326 replies), "다들 언제부터 초코 먹였어?" (132 replies).
- **Fandom posts are a like machine, not a conversation machine.** Top response rate in
  the sample (1.33%, median 337 likes) with an ordinary 23 replies — people who know the
  same team agree, they don't talk.
- **A question doubles replies and sells likes.** The 19 posts carrying a question had a
  median of 46 replies against 21 for the 42 without one, but their response rate ran the
  other way: 0.51% against 0.70%.

### By length

| Length | Posts | Median views | Median replies |
|---|---:|---:|---:|
| ≤30 chars | 9 | 27,000 | 25 |
| 30–60 | 21 | 25,000 | 23 |
| 60–120 | 14 | 27,500 | 17 |
| 120–250 | 13 | 21,000 | 16 |
| **250+** | 4 | **72,500** | **188** |

Four posts is too small to settle anything, but it is enough to retire "Threads means
short". All four were narratives carrying a time, a place and a person. What the ranking
card rewards is #9 and #10 — being read to the last line — and length is not the variable
that decides that.

## Third-party datasets

| Source | Sample | What it measured | Grade |
|---|---|---|---|
| Buffer, State of Social Media Engagement 2026 | 10.2M Threads posts (52M across platforms), 2024-01–2025-12 | median response 3.6%; by format video 5.55% > image 4.55% > **text 2.79%** > link 2.34%; **posts where the author replied to their own post +42% engagement**, the largest lift of the six platforms | second-hand, large sample |
| BlackTwist monthly, March | 21,864 posts · 283 accounts | mean response 5.3%; long chains averaged 4,416 views (top reach) while short posts held 6.09% response (top response) | second-hand, sample bias unknown |
| BlackTwist monthly, June | 66,605 posts · 365 accounts | **long chains 8,740 views vs short posts 1,029 (8.5×)**; **text-only 3,900 views vs media 1,219**, with response running the other way (media 3.36% vs text 1.83%); by length 100–199 chars top reach, 200–500 chars top response | second-hand, sample bias unknown |
| BlackTwist June, replies | same sample | accounts collecting 500+ replies a month grew 35.71%, accounts under 10 replies grew 12.07%, and the growth rate did not dip once across the bands | second-hand |
| Teract, Mirra, Postory, Korean course posts | various | numbers such as "images 3×" and "500+ chars −40%" | **claim — method not published, not cited** |

Buffer and BlackTwist look like they contradict each other and do not. Buffer measures
response rate and finds text last; BlackTwist measures reach and finds text 3.2× ahead.
Both are true at once: **text and length travel, images and brevity land**. It is the
same split the 61-post sample shows and the same split this plugin measured on its own
cold-start account.

This corrects growth-playbook §New-post style rule 5, which read "an image wins — image
posts beat text-only on reach". The reach claim is backwards; the response claim is the
one with support.

## The chain form

The five most-viewed English posts of June (BlackTwist's ranking) were opened directly.
The top two, both from one account, share a single shape:

```
one hook line in caps      ← "NOBODY TELLS YOU THIS ABOUT … UNTIL IT'S TOO LATE"
three lines denying the premise  ← no budgeting service, no $165 consultation, no degree
"all 7 in the replies below"
  ↳ own reply 1
  ↳ own reply 2 …
```

Four things to take from it:

1. **The body is short and the substance is in the replies.** This is what "long chains
   get 8.5× the reach" actually is — not one post filled to 500 characters, but several
   short posts linked. The reader clicks once and keeps clicking, which is predictions 3,
   4, 9 and 10 at the same time.
2. **The hook is loss, not gain.** "Nobody tells you", "until it's too late". No benefit
   is promised.
3. **The payload is lines to say.** Sentences that can be copied and used as they are —
   the shape that earns a save and a forward.
4. **The subject belongs to the reader** — money, marriage, betrayal, a list about a life.
   BlackTwist's March report says the same thing from the data side: health,
   self-improvement, parenting and everyday life beat marketing and business.

`threads_publish` already carries `replyToId`, so a chain needs no server change — the
first part publishes, and each following part publishes with the previous part's postId.

## What changed in the plugin

- `platform-playbook.md` §3 — intent (reach or conversation) is decided before the draft;
  the length rule is now "is it read to the last line"; the type table and the chain form
  are in; information copy needs a stake or a memory hook.
- `grow-threads/references/growth-playbook.md` — the ten predictions replace the five;
  §Post types and §Chain posts added; rule 1 (length) and rule 5 (image) corrected; the
  author's own first reply is now part of publishing.
- `grow-threads/SKILL.md` §4 — intent and type are picked before authoring, a chain
  publishes part by part through the gate, and the author's first reply follows the post.
- `growth-post-reviewer.md` — a `post_chain` surface, and the engagement axis now scores
  whether someone else holds the answer to the question.

## Limits

- The sample is one moment (evening, 2026-09-19) of one logged-out feed. It is baseball
  season, so fandom posts (21 of 61) are probably over-represented; the type distribution
  will move at another hour.
- Type labels are one reader's judgment. Another reader draws the boundaries elsewhere.
- Only 4 posts sit above 250 characters. The length conclusion is a signal, not a rule,
  and the next collection re-tests it.
- BlackTwist publishes sample sizes but not its account-selection method, so its ratios
  carry sample bias of unknown direction.
- The Korean-side numbers come from posts written by other people; nothing here has been
  tested on our own channels yet. The first five posts written under these rules are the
  test.
