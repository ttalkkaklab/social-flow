---
name: generate-cover
description: >
  Makes the episode cover and thumbnail from a moment the episode shows, with code-drawn copy and per-platform crops; stops before publishing. Use for "썸네일 만들어", "커버 만들어", "make a thumbnail", "cover image", or when produce, autoproduce or publish reaches the cover.
argument-hint: "[episode-or-storyboard-path]"
allowed-tools: ["Read", "Bash", "mcp__social-flow__episode_cover", "mcp__plugin_social-flow_social-flow__episode_cover", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read", "mcp__social-flow__image_plan", "mcp__plugin_social-flow_social-flow__image_plan", "mcp__social-flow__image_execute", "mcp__plugin_social-flow_social-flow__image_execute", "mcp__social-flow__image_status", "mcp__plugin_social-flow_social-flow__image_status", "mcp__social-flow__astra_genai_jobs", "mcp__plugin_social-flow_social-flow__astra_genai_jobs"]
---

# Generate Cover

The cover is a still that never enters the video: platforms show it in profile grids, search,
channel pages and link previews, while the feeds autoplay the first frame instead. Long-form is
the one surface where the thumbnail decides the click. Evidence and its limits:
[thumbnail research](https://github.com/ttalkkaklab/social-flow/blob/1eabc4fb598b99135fe39a1a2be1f7dbe07fd5a9/docs/research/2026-11-18-thumbnail-best-practices/reports/SNS%20%ED%94%8C%EB%9E%AB%ED%8F%BC%EB%B3%84%20%EC%8D%B8%EB%84%A4%EC%9D%BC%20%EB%B2%A0%EC%8A%A4%ED%8A%B8%20%ED%94%84%EB%9E%99%ED%8B%B0%EC%8A%A4.md).

The strongest rule in that research is the plainest: the cover promises only what the episode
shows. Faces, saturation and contrast measured close to noise; short copy and a promise the
episode keeps did not. So this skill picks a moment from the cut and adds a few words in code.

Run it after the shots have start images (production step 6) or clips, and before publishing.
On long-form, the opening plan (`STORY.opening.title`/`thumbnail`, [opening by format](../storyboard/references/opening-by-format.md))
decided the packaging first; `episode_cover read` shows that plan, and the cover carries it out.

## 1. Choose the moment

Read the board with `storyboard_read`, then pick one shot:

- **Story and drama:** one or two people at the moment of a decision or a threat. The face shows
  the shot's `shot_characters` expression; do not reach for a surprised face by default.
- **Claim-led (explainer, review, ad):** the proof shot (`sequence.payoff`, [episode anticipation](../storyboard/references/episode-anticipation.md)).
- **Tutorial or product:** the result or the product, large.

Write in `reason` what happens there and in which scene. The source is a frame of the shot's
accepted clip or the finished video (`kind:"frame"`) once video exists; before that, the shot's
start image (`kind:"shot"`). An MSR start image is only a background reference, so prefer its
clip frame. If the proof shot is an HTML slide, its own type would sit under the copy: use no
copy, or a frame before the slide's type appears. Set `focus` on the subject (0–1 from the
left and top); crops keep it and the copy goes to the other side.

## 2. Write the copy

In the episode language (`STORY.language`); the tool draws it with a bundled font and refuses
text no bundled font covers (`cover_font_missing`). Long-form 2–4 words, short-form 1–3
(Japanese and Chinese: 12 and 8 characters). It adds what the title leaves out instead of
repeating it; `emphasis` colours one part. A story or entertainment cover may have no copy
(`copy: null`), but that is not the default. Never let an image model draw the copy.

## 3. Set, render, look

`episode_cover action:"set"` with the decision, then `action:"render"`. Open the preview sheet
(`output/cover/previews/*-sheet.png`) and the main file with Read and look: the phone tile, the
3:4 grid, the 1:1 feed crop and the centre 16:9 slice on short-form; the 160×90 tile on
long-form. Pass the warnings on as they are (`cover_copy_small`, `cover_copy_low_contrast`,
`cover_copy_outside_core`, `cover_focus_outside_core`, `cover_copy_badge`,
`cover_copy_repeats_title`, `cover_source_small`); whether to change the moment, focus or copy
is the author's call, and none of them stops the work.

Long-form may add up to two `variants` (another moment, focus or copy) for YouTube Test &
Compare, which picks by watch time, not clicks. Shorts have no A/B testing, so they get none.

## 4. When the picture is the wrong shape

Only when no shot fits the canvas (a 16:9 thumbnail from 9:16 pictures, say): plan a text-free
extension with `image_plan` (operation `edit`, `assetId: "cover-bg"`, an English prompt that
says no text, letters, logo or watermark), get the user's spending authorization,
`image_execute`, then `set` with `source: {kind:"image", requestId}`. Unattended runs stay
inside the authorization they already have; without it they keep the shot and its
`cover_source_small` or crop warning.

## 5. Hand over to publishing

`episode_cover read` gives each platform's file in `publish` (and `stale: true` when the
decision, source or template changed since the render: render again, it is free). The publish
skill uses them: YouTube `thumbnailFilePath`, Instagram `coverUrl` (host the file with the
video), Facebook `thumbnailFilePath`, TikTok's Studio upload while the post is private,
nothing on Threads. Platform values nobody has measured yet are listed under `unverified`; the
values live in `skills/platform-guide/references/formats.js` (`cover`).
