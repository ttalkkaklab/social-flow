# Platform playbook (SoT)

> **Freshness** — verified 2026-08-19 · source: the platforms' own published limits plus what
> our accounts actually accepted · recheck every 90 days, and immediately when a publish call
> starts failing on a limit.

Generalized from rules field-tested in fect-persona publish-social·make-reels
operations. produce's per-platform text authoring, publish's approval review,
and content-reviewer's rubric all take this document as their baseline.

## Contents

- [§1 Platform decision tree](#1-platform-decision-tree)
- [§2 Three-way style split (inheritance)](#2-three-way-style-split-inheritance)
- [§3 Threads](#3-threads)
- [§4 Instagram](#4-instagram)
- [§5 Facebook](#5-facebook)
- [§6 YouTube Shorts](#6-youtube-shorts)
- [§7 Video specs (same as the produce contract)](#7-video-specs-same-as-the-produce-contract)
- [§8 Anti-pattern checklist (self-check before the approval gate)](#8-anti-pattern-checklist-self-check-before-the-approval-gate)

## §1 Platform decision tree

Material selection gate: ① pass at least 1 of the three gates (new information ·
emotional pull · timeliness)
② reader stake — answer in one line: **"who reads this post, and what will they
be able to decide within 60 seconds?"** If the answer only works when our tool
or pipeline name is in it, change the material (same axis as the §8 checklist —
the axis that split reach 7.6× between same-age posts in our field data).
What you hang at the door (title · cover · first line) is **the problem the
person already feels, not a method or a tool**. "노션으로 할 일 관리하는 법"
("how to manage todos with Notion") only pulls in Notion users; "하루가 늘
피곤한 이유" ("why you're always tired") addresses everyone who is tired. The
solution comes in the body. Opening with a method name — even with the tool name
removed — keeps a first-time viewer from reading it as their own problem.
Which stimulus you use to hang that problem is **one of the four opening
strategies — fear · empathy · curiosity · showing the ending first** (exactly
one per episode, storyboard scenes-schema §four opening strategies).
For a video episode the storyboard cover's `hookType` has already picked it, so
the platform title and first line carry that strategy through — if the cover
opened on fear but the YouTube title explains a method, the thumbnail/title
expectation and the first 30 seconds fall out of step. Fear speaks in
tell-them-what-they-lose terms, and the threat is either grounded in evidence or
cushioned with possibility phrasing ("~일 수도", "might be").
③ platform fit — IG must answer "who saves this" (checklists · figures · chart
material — informational material earns a save only when the action steps are
short and simple enough to follow right after watching. Don't apply this bar to
confession/observation posts — our top post by field data had no action steps at
all), FB wants evidence density, Threads must compress into a one-line
observation
④ the material has passed fact verification (items cleared in research.md).

When unsure, start with Threads — lightest, cheapest to fail.

## §2 Three-way style split (inheritance)

- **FB = article register as-is** — subheading structure + case-collecting
  closer ("여러분은 어떻게 하고 계신가요?", "how do you all handle this?").
  Don't skimp on evidence, clauses, figures.
- **IG caption = only the hook extracted from the article register** — finish
  the hook inside the first 125 characters (everything before the fold), then
  context and a save/share CTA. Links in captions aren't clickable — the link
  goes in a comment.
- **Threads = spoken register** — casual speech, 1–3 lines + one closing
  question. Don't spend the whole hook (say everything and there's no reason to
  click). Hashtags ≤1. Video episodes carry no cover image — **the video rides on
  the post itself** (§3).

### Plain-language principle (all platforms · all surfaces)

No unexplained jargon, no translationese, no over-compressed sentences missing
their subject. Field-tested replacements: "기준환율" → "뉴스 값('기준환율')"
(lead with "the number on the news", keep the term in parentheses) · "은행 매도"
→ "은행 창구 값 — 내가 달러를 살 때 실제로 내는 값" (the bank-counter rate —
what I actually pay when buying dollars) · "달러로 받으면 유리하고" → "달러로
받는 **월급은** 늘고" (subject restored: the **salary** paid in dollars grows).
If a term is unavoidable, lead with the plain word and gloss the term in
parentheses on first appearance only.

## §3 Threads

- Body limit is 500 chars, but **1–3 lines is the right answer** — the timeline
  gets scanned, not read closely.
- Structure: one line of observation/discovery → (optional) one line of
  elaboration → closing question.
- **A video episode carries the video on the post itself** — pass the public URL
  of the subtitle-burned cut (`video-sub.mp4`) as `threads_publish`'s `videoUrl`
  (user directive 2026-08-19). Don't attach the video as a reply and don't settle
  for a bare link. One call completes it. The video plays inline in the timeline,
  so nothing links out and the link penalty below never applies.
- **No external link in the body.** The grounds are field data — the first 2
  link-in-body posts drew 9 and 21 views, 1/10th of the link-free posts from the
  same day, while the 2 reply-link posts drew 257 and 623 (2026-08-15). Even
  though Mosseri publicly walked back the link penalty (2024), our measured reach
  distribution says otherwise, so we follow the measurements. **Carrying the video
  on the post removes the problem outright** — which is why the reply link dropped
  to being the fallback for episodes that can't carry one.
- The body post stays in casual spoken register and is complete in itself — it
  has to stand as a post without the video. The 1–3 lines are the post; the video
  hangs off it.
- The fallback (no video file, or hosting is blocked) is a self-reply link — one
  line, "풀영상은 여기 →" / "full video here →", plus the IG reel permalink. The
  link defaults to the **IG reel, not YouTube** (same Meta ecosystem, so the exit
  penalty is smallest). Only with this fallback does publishing order matter:
  IG first → get the permalink → Threads. Putting an IG permalink in the `linkUrl`
  preview card returns 400, so it goes in the body text.
- Regular text posts in the growth loop follow the link policy in the channel's
  `growth-plan.md`.
- Hashtags ≤1 (ranking weight 0 — in practice we don't use them).

## §4 Instagram

- **Reels**: one public HTTPS videoUrl. Complete the hook in the caption's
  first 125 chars + a save/share prompt. The profile grid center-crops to a
  square — titles and figures must sit in the vertical center band (y≈420–1500)
  to stay readable in the grid.
- **Carousel**: 1–10 images (API hard limit 10), all cards unified as JPEG
  (the IG API takes JPEG and force-crops to the first card's aspect ratio).
- Images and video can't be swapped after publishing (only the caption is
  editable) — the approval gate is the last chance.
- Hashtags 3–5.

## §5 Facebook

- Page posts. Video goes up via `/videos` as a regular video (not a reel).
- Subheadings and bullet structure are allowed in the body — the highest
  information density of the four platforms.
- **Links are banned in the body → post them as the first comment via
  facebook_comment right after the post succeeds** (FB comment links are
  clickable and render a preview). Publishing isn't done until the first
  comment is up.
- Close with a case-collecting question — the FB algorithm weights comment
  dwell the highest.

## §6 YouTube Shorts

- Portrait 1080×1920 · 3 minutes or less = automatic Shorts classification (no
  separate flag). Local upload, so no public hosting needed. Upload quota is the
  videos.insert-only Video Uploads bucket — 1 unit per call, default 100/day,
  so there's no reason to ration episode publishing.
- **title required** — keyword-style ≤100 chars, angle brackets `<>` banned.
  Put the core keywords (region · program name · year) in the title, but **the
  angle is §1 ②** — not the method or tool, the problem a stranger already
  feels. Example: not "스쿼트할 때 무릎 안 아프게" ("keep your knees from
  hurting when you squat") but "무릎이 아픈 이유" ("why your knees hurt").
  Searchable proper nouns (program names · regions) attach next to the problem:
  "베트남 임시거주 신고 안 하면 과태료 — 2026년 7월부터" ("fines if you skip
  Vietnam temporary-residence registration — from July 2026"). The stimulus is
  the same strategy as the storyboard cover's `hookType` (the example above is
  fear) — if the title switches to a different stimulus, first-30-second
  retention (the Intro metric) drops.
- **thumbnailFilePath = the build's cover.jpg, required** — unset, a random
  frame becomes the thumbnail. Without phone verification (intermediate
  features) it's rejected and reported as thumbnailWarning (the publish still
  succeeds).
- **Always upload private first** (user directive 2026-08-19) — attach the
  thumbnail, subtitles, playlist and the portrait first frame, then flip to
  public. Publishing straight to public shows a mid-sentence frame while the
  cover is still being attached (publish §3-1).
- Custom thumbnails apply to **landscape surfaces only** — the portrait surfaces
  (Shorts feed · Shorts tab) take a separate frame, set in a browser at
  `studio.youtube.com/video/<id>/edit` → `⋮` over the portrait image →
  **"Select from video"** (measured 2026-08-19). Any browser we drive works; the
  native app isn't needed, and `Change` in that menu is file upload, which only
  swaps the landscape surface. The emulator route in publish
  `references/shorts-surface-adb.md` is the fallback.
- **The verdict is not `oardefault.jpg`** — it stays 404 after the frame is set,
  and `oar2.jpg` answers 200 with a cached older frame. Read the tile's `img` src
  from the channel Shorts tab DOM (`youtube.com/@<handle>/shorts`) and confirm by
  eye. This only works once the video is public.
- The description's first line is the second hook — don't repeat the title;
  reinforce it in different words.
- Hashtags 3–5, **#Shorts required** (Shorts shelf classification). Going over
  suppresses reach.

## §7 Video specs (same as the produce contract)

- 1080×1920 / 30fps / H.264 High 4.1 / faststart. Main body 35–75s recommended,
  90s hard cap.
- Safe zones: text zone x 176–904 · y 190–1350. Subtitle band y 1380–1560.
  - **The platforms' ad specs ask for more clearance than this** — Meta reels
    top 14% · bottom 35% · sides 6%, YouTube portrait ads left 48 · right 192 ·
    top 288 · bottom 672px. The intersection is **top 288 · below 1248 · left
    65 · beyond 888 right**, so our text zone falls short by 98px at the top,
    102px at the bottom, 16px on the right, and the subtitle band sits entirely
    outside it.
  - **We did not move the values anyway.** Both are **ad specs**, and no
    platform publishes organic numbers. They also govern text and logos, not
    subjects. The fact that subtitles on our published reels are visible and
    uncovered shows this ceiling overshoots.
  - To measure it, bring up actual reels/Shorts screens on the AVD in
    `skills/publish/references/shorts-surface-adb.md` and measure the pixels
    the UI covers directly. Until that measurement exists, the numbers above
    are a **reference ceiling** and `video-template.html`'s `--zone-*` is the
    source of truth.
  - Grounds: [camera technique research §06](../../../docs/research/2026-08-15-ai-video-camera-technique/index.html#vertical)
- Field-tested font minimums: cover title 108px · news title 74px · bullet
  title 44px · body 34px · burned-in subtitles 58px — smaller than this is
  unreadable on a phone.
- Cover (first screen) rules: hook title (≤16 chars + topic word) + hero
  figure; no subtitle line, no source. **The first frame of every surface must
  be the cover** — if an automatic frame (mid-speech, etc.) is still there,
  publishing isn't done.
- Most viewing is muted — never turn off burned-in subtitles.

## §8 Anti-pattern checklist (self-check before the approval gate)

- [ ] The same sentence appears verbatim on two platforms → copy-paste violation
- [ ] A link in the FB body → move to first comment
- [ ] A link in the Threads body → drop the link and carry the video on the post (§3).
      Only an episode with no video file falls back to a self-reply link
- [ ] **A Threads video episode with no video on the post** → `videoUrl` is missing.
      Attaching the video as a reply is the fallback, not the default
- [ ] The IG caption hook sits past the 125-char fold
- [ ] The YT title has no keyword or contains <>, or #Shorts is missing
- [ ] The title/cover opens on a method or tool only — a first-time viewer can't read it as their own problem (§1 ②)
- [ ] The title/first line rides none of the four opening strategies (fear ·
      empathy · curiosity · showing the ending first), or opens on a different
      stimulus than the storyboard cover's `hookType` (§1 ②)
- [ ] Unexplained jargon · over-compressed sentences (plain-language violation)
- [ ] **The reader has no stake** — if the post only works with our tool or
      pipeline name in it, change the material. Channel field data (Threads):
      with zero vocabulary tells and a clean style-gate pass, our API-pitfall
      list still reached 1/7.6 of a same-age confession post that laid our own
      metrics bare. The axis that split them wasn't style — it was reader stake
- [ ] A numeric range got collapsed to its upper bound (fact distortion)
- [ ] AI-generated or character speech staged to look like a real person or
      news footage
- [ ] Hashtag limits exceeded (Threads >1, IG/YT >5)
- [ ] The brand logo shows in the cover's first 3 seconds (a skip signal)
