---
name: produce
description: >
  Builds the video and the per-platform text from an already-approved storyboard. Use when the user asks to "영상 만들어", "콘텐츠 제작", "produce the video", "플랫폼별 콘텐츠 만들어", or right after a storyboard is approved. Turns the approved scenes.js under data/[channel]/episodes/[topic]/storyboard/ into the subtitle-free video in the project's saved format and video ratio — generated or imported clips, stills under camera moves, HTML motion slides, TTS or character speech, BGM with ducking, brand outro — plus the Threads, Instagram, Facebook and YouTube text under the episode's output/, checked on a phone viewport before publishing. Where recording/alignment.json exists it cuts the user's own screen recording instead of generating scenes. Boundary — storyboard plans and stops for approval, produce starts after it, autoproduce runs both unattended.
argument-hint: "<channel> <topic> [platformCSV|auto]"
allowed-tools: ["mcp__social-flow__video_catalog", "mcp__social-flow__video_plan", "mcp__social-flow__video_execute", "mcp__social-flow__video_status", "mcp__social-flow__host_review", "mcp__social-flow__project_manage", "mcp__social-flow__location_manage", "mcp__social-flow__speech_manage", "mcp__social-flow__acting_review", "mcp__social-flow__tts_review_acting", "mcp__social-flow__capability_status", "Bash", "Read", "Write", "Edit", "Glob", "AskUserQuestion", "Agent", "mcp__social-flow__tts_generate", "mcp__social-flow__tts_gemini_38", "mcp__social-flow__tts_elevenlabs_dictionary", "mcp__social-flow__tts_elevenlabs_voices", "mcp__social-flow__tts_elevenlabs_generate", "mcp__social-flow__tts_elevenlabs_dialogue", "mcp__social-flow__tts_list_voices", "mcp__social-flow__music_generate", "mcp__social-flow__music_generate_clip", "mcp__social-flow__music_generate_advanced", "mcp__social-flow__stock_search", "mcp__social-flow__suno_generate", "mcp__social-flow__suno_generate_sound", "mcp__social-flow__suno_generate_lyrics", "mcp__social-flow__suno_credits", "mcp__social-flow__image_local_generate", "mcp__social-flow__gpt_image_text2img", "mcp__social-flow__gpt_image_img2img", "mcp__social-flow__veo_img2video", "mcp__social-flow__veo_reference", "mcp__social-flow__seedance_img2video", "mcp__social-flow__seedance_reference", "mcp__social-flow__astra_img2video", "mcp__social-flow__astra_keyframe_video", "mcp__social-flow__astra_audio2video", "mcp__social-flow__astra_ic_lora", "mcp__social-flow__astra_video_retake", "mcp__social-flow__astra_video_capabilities", "mcp__social-flow__astra_video_list_uploads", "mcp__social-flow__astra_video_delete_upload", "mcp__social-flow__mlx_image_generate", "mcp__social-flow__mlx_image_edit", "mcp__social-flow__mlx_music_generate", "mcp__social-flow__mlx_video_generate", "mcp__social-flow__mlx_3d_generate"]
---
For motion-graphic shots, follow [motion type selection and design](../storyboard/references/motion-graphics.md): persist `shot.motionGraphic`, choose the type from viewer intent and available evidence, and keep style, choreography and renderer separate. Built-in abstract scenes use the installed `prepare-motion-graphic.js`; asset-dependent types retain their authored or mesh routes.
Follow [host evaluation](../_shared/host-review.md). Use local episode files under `data/<channel>/episodes/<topic>/`.
For episode video, follow the [shared routing contract](../_shared/video-routing.md): inspect `video_catalog`, save a `video_plan`, then call `video_execute` under existing spending authorization. Legacy video tools need `videoContext`. After interruption, inspect `video_status` with the same request ID; never switch provider or invent a retry ID to bypass a pending job. Host plans remain external handoffs.
For narrated or mixed scenes, apply [visual grounding](../storyboard/references/narration-visual-grounding.md) before source images, including host calls and full-video: enumerate all editorial cuts and inspect repetition across the whole episode; never propagate a chapter score to shots; compare actual pixels with the line, visual purpose and opening state; repair weak conte before motion and carry its action into the provider request.
For action-led episodes, carry the storyboard's [action direction](../storyboard/references/action-direction.md)
into generation and editing. Compare the actual clip with the planned camera and
action; camera icons and a successful API response do not verify footage quality.
For connected shots, follow [shot continuity](../storyboard/references/shot-continuity.md).
Capture the preceding accepted clip's selected endpoint before authoring the next opening;
use the spatial assembler's actual reference-image arguments. After any crop, trim or
replacement, inspect that shot with both neighbours and refresh stale endpoint evidence.
Keep planned endings separate from observed footage and respect each adapter's real inputs.
Behavior examples: [continuity evaluations](references/evals.md).
For an intentionally silent film, use `SILENT=1 OUTRO=0` with the canonical builder.
Supply sample-exact zero-valued timing WAVs; omit music, effect and ambience cues.
The builder verifies silence and preserves the frame clock without loudness scoring.
**Automatic execution policy:** Read [automation guidance](../_shared/automation-guidance.md) first. Creative rules and review findings guide improvements; scores, review/hash/freeze records, CTA choices and intermediate approval steps do not block authorized work. Preserve actual external-action authorization and stop at the artifact the user requested. This policy supersedes older quality-gate wording below.
For tracked props, read [prop continuity](../storyboard/references/prop-continuity.md). Resolve the shot snapshot before prompts, preserve reference versions and record the snapshot with generated assets; verify the actual holder and condition in images and clips.
**New authoring contract (2026-10-16):** Read [character-led scenarios](../storyboard/references/character-scenarios.md) first. New scenarios use `scenario-v2` and boards use `story-v2`: cast existing characters (including narrators), choose evidence/fiction/adapted, write observable actions and attributed speech, and review the whole performance. Its type-specific grounding and rubric replace the legacy research quotas, forced wow/engine mix, spoken-message and narration-only requirements below. Legacy unversioned scenarios and story-v1 boards keep their existing checks. Production voice, budget and publishing consent are unchanged.
# Per-platform content production — data/[channel]/episodes/[topic]/output/
**Owner directive (2026-10-17): every delivered video is subtitle-free, including speech.**
This supersedes older burned-subtitle exceptions and rendering recipes below. Use the clean
master on every platform. No subtitle/caption typography may be generated into clips or
burned during editing. Keep exact dialogue for audio checks and optional separate YouTube
subtitle files only when requested; existing subtitle files do not authorize uploading them.
Use the selected adapter's prepared request and its no-visible-text policy. For ASTRA,
use [render-astra-shot.js](references/render-astra-shot.js) after composing speech. It calls
[prepare-astra-shot.js](references/prepare-astra-shot.js), pads a separate transport WAV
and records a provisional candidate without changing the authored shot clock. It carries the performance timing
into a motion prompt without literal dialogue or screenplay labels. `plan_video` remains
the performance plan; its structured `videoPrompt` is not ASTRA's final provider prompt.
Do not paste literal dialogue into an audio-conditioned video prompt; the supplied WAV
carries the exact spoken words.
Inspect actual clips for accidental text; a no-text prompt alone does not prove clean frames.
**Speech production override (2026-10-16):** Read [shot-speech.md](references/shot-speech.md).
Generate with raw TTS tools; do not run automatic speech reviews, dictation, voice-lock ASR,
or listening approval. The provenance-only builder proceeds with `not_reviewed` speech.
Older checked-TTS/listening recipes below are historical and do not govern new work.
Use explicit per-line speakers including narrator; resolve video via adapter capabilities.
Later corrections use edit-speech and `speech_manage`. For scene emotion, use each line's `acting` and `speech_manage action:plan_audio`; preserve
voice identity while passing the resolved line direction to the raw generator. The same
direction and reaction timing inform `plan_video`, its prompt and the scene's starting image.
Before TTS, separate declaration/question speech purposes and compare each compiled request with its line; preserve listening/reaction order inside the shot. See [speech purpose boundaries](references/shot-speech.md#speech-purpose-boundaries) and [speech intent evaluations](references/speech-intent-evals.md).
Do not group different emotions or nonconsecutive shots by source image and cut the result
into arbitrary audio-length slices. See shot-speech.md for timing and continuity details.
Turn the approved storyboard (`storyboard/scenes.js`) into a narrated video and per-platform text. **Assembly video warnings:** follow [assembly-video-hitl.md](references/assembly-video-hitl.md). Show failed video/visual-plan checks with the output and record them in the build record; the existing assembly authorization covers them and no new approval is asked. This replaces pre-assembly quality holds below. Preserve warnings and resume without asking.
**scenes.js is the only data source** for screens, narration, captions and any requested subtitle sidecar. **Records:** Record assembly and slide-fallback decisions with their actual warning evidence. Preserve actual provenance in local files and reuse existing authorization. This adds no approval gate.
```
data/<channel>/episodes/<topic>/
├── storyboard/          # input (has to be in the approved state)
├── .work/               # intermediates (gitignore — cards/ broll/ pcm/ manifest)
└── output/
    ├── video/           # video.mp4 (subtitle-free) · cover.jpg · build-report.txt · delivery-proof.json · cost-report.txt
    ├── threads/post.md  # 반말 (casual) body + video link on the last line (no attached image)
    ├── instagram/caption.md
    ├── facebook/post.md
    └── youtube/meta.md  # title · description · tags · thumbnail
```
For independent visual samples, use the installed planner and builder in [animation-review.md](references/animation-review.md). Fix plugin sources and rebuild; never substitute episode-specific scripts. This review mode has its own input contract and does not mark an episode publishable.
## Absolute rules
Read [production-mode.md](../storyboard/references/production-mode.md) at entry. The six video-ratio ids (`full_video` · `video_80` · `video_50` · `video_30` · `video_lt10` · `no_video`) are the project's saved video ratio in `.social-flow/models.json`, written into `PRODUCTION.mode` with `renderRatioVersion:1` when the episode is created; the six-choice menu belongs to project-init or an explicit change request, not to every episode. The per-episode step is the cost quote and its spending approval: present the first-pass and retry-inclusive costs and the budget cap, bind the approval to that quote, and reuse an existing approval on resume. The ratio is a planning target and the cost ceiling — the band's upper bound and the budget are enforced; fewer generated cuts than the target is reported, never padded. Run `check-production.js storyboard/ --selection` before assets.
For imported generated clips, follow [the reuse input contract](../storyboard/references/scenes-schema.md#existing-generated-clip-input-visualreuse). Skip source-image and video generation for `visual.reuse`; never send that shot to an API. Existing 720p clips are eligible; the 1080p output canvas is not a source minimum. Repair missing metadata with [inspect-reuse.js](references/inspect-reuse.js) and review the existing playback. Missing old records do not authorize paid regeneration. Run `check-production.js storyboard/ --before-call N` before every new video call in either mode. Before assembly, run `check-production.js storyboard/ --ready --manifest`. Its errors are operational: source resolution, clip duration against the shot and the plain-video manifest. Playback reviews of imported clips and the style read of each generated still in `.work/still-review.json` ([still-generation.md](references/still-generation.md) §3) are evidence: a missing or stale record is reported as a `not_reviewed` warning and is never written without looking. `--ready` also measures every accepted clip with [measure-motion.js](references/measure-motion.js) (full-video.md §Measured motion) and `verify-assembled.js` measures every card of the assembled reel the same way; a clip that reads as a still, or one whose action starts after the first second with `edit.in` at 0, is a warning to inspect and fix within the existing authorization, not a block.
Before every new video request, follow [video-duration.md](references/video-duration.md): calculate measured source coverage and request the shortest supported duration. Preserve the selected model/resolution and refresh the quote and previz when timing changes.
For `PRODUCTION.mode:"full_video"`, use [full-video.md](references/full-video.md) instead of the hybrid visual steps below. Its source images, spatial prompts, separate narration, video QA and plain-video manifest override the hybrid slot cap, person requirement and HTML-only explanation rules; the no-marks-over-video rule still applies. [spatial-prompts.js](../storyboard/references/spatial-prompts.js) assembles every source and motion prompt from `videoDesign`, the four `visual.camera` slots and the episode style, and on the Seedance lane returns the Seedance wording advice in its `warnings` array (read it before storing the prompt). For partial ratios the selected share of new cuts is the target and the cost ceiling: plan generated video up to the band's upper bound and the budget, use the normal visual steps for the rest, and report when fewer cuts than the target are generated (the lower bound is not enforced). The episode choice overrides the old generated-slot cap; `hook_only`, `stills_only` and `hybrid` are legacy ids kept only for resumed boards.
Before assets, apply [render-routing.md](../storyboard/references/render-routing.md). `shot.render` selects a supported mode; run `check-scenes.js` to verify the handoff. Do not collapse still-camera, character, object and data-graph cuts into one HTML choice. Camera HTML uses `kind:"camera"` and the shared camera template; it is not true subject motion. Read [visual-direction.md](../storyboard/references/visual-direction.md) for episode repetition limits and the playback review. Data graphs, including donut/pie compositions and geographic maps, use [chart-design.md](../storyboard/references/chart-design.md), the shared SVG template and source-linked focus beats. Never substitute a numeric card for a chart.
For explanatory graphics, follow [motion production](references/motion-production.md). Use the shared chart preparation and renderer commands; a looped PNG is a static asset, even when its container is MP4. Keep planned mode and actual subcuts consistent. Run the same motion diagnostics on the encoded sample and assembled timeline, preserve warnings, and report semantic review separately from image scores and pixel measurements.
Use [story-quality.md](../storyboard/references/story-quality.md) to improve the story. Run its diagnostic checker when useful, rather than before every generation or capture. Report missing or stale reviews without blocking authorized production; explain material narration changes. Then read [retention-direction.md](../storyboard/references/retention-direction.md) §2–§5 with the handoff. Resolve visible changes and sound events to scenes.js and supported controls. Preserve payoff, cost cap and voice; derive a missing handoff table without changing the narration. `beat:"cta"` permits a close with no ask. CTA presence, wording, placement and share metadata are optional. A memorable fact, image or line can strengthen the ending when it fits the story.
1. **No distorting facts** — narration and captions only recompose facts already in scenes.js. Don't collapse a range to its upper bound, and don't invent numbers.
2. **No copy-paste crossposting** — "share the facts, never the sentences."
   Redesign the register, the endings, and the information density for each platform (the platform-guide playbook).
3. **Plain language** — screen text, narration, captions, all of it. It has to
   land heard by ear alone. **The screen doesn't restate what the audio just said**
   (user directive 2026-08-14) — an empty `title` or `bullets` in scenes.js is not a
   defect. The render never fills an empty field on its own and never manufactures a
   caption out of the narration (scenes-schema §Screen text only when needed).
4. **Korean with no AI tells** — apply platform-guide `references/korean-style.md` to every
   visible sentence. Use `check-style.py` findings as editing suggestions; a style label alone does not block an authorized operation.
5. **Generated video follows the selected mode** — full-video may explain physical mechanisms and spatial changes. A reenactment is allowed when the board
   marks it (`STORY.adaptationBoundary`, the adapted lane); never a generated likeness of a real person, a national symbol or a fake news screen. Cards (static text) are code-rendered only.
6. **Branding belongs in the outro** — no logo or badge in the body (a brand eating the first 3
   seconds is a skip signal). Under `shortform_outro: off` the episode carries no logo at all: the avatar and the handle do that job.
7. **The TTS identity is fixed** — preserve the pinned engine, model and voice ID/name.
   Resolve each line's emotion and delivery from `acting`; the character stylePrompt is only
   its baseline. Use `plan_audio` arguments so a confused question does not inherit a sales smile. Follow [acting prompts](references/acting-prompts.md).
8. **Generated video comes from an image** — don't use `veo_text2video`. The order is always
   the saved image model (`.social-flow/models.json`, the episode snapshot) → keep the PNG in `storyboard/images/` → the saved video model through `video_plan` → `video_execute`.
   `PRODUCTION.imageProvider` / `videoProvider` record whether that saved choice is a host tool (`host`) or an API/local engine (`api`, `astra`); a missing or failed tool is reported and an explicit exception is asked for, never a silent substitute (still-generation §1, model-settings.md).
   The image is the reference point for reproducing a shot: if the video isn't right,
   reuse that PNG only if its opening still fits both neighbours; otherwise repair the
   opening state before retrying. Video made straight from
   text gives a different scene every time even from the same prompt, so there's nothing
   to go back to. **Never delete `storyboard/images/*.png`** — delete them and that episode can't be rebuilt.
9. **Don't lay narration over a stretch where generated video plays** — that stretch uses
   **the sound the clip came with**. Put TTS on top and the two sounds fight, and the
   synthetic voice flattens the generated clip's sense of space. That scene is
   `narration: []`. **This rule is about b-roll inserts** — on a motion-background scene
   (scenes-schema §Motion background, `visual.video`) the builder uses only the video
   track, so the clip's sound gets dropped and the narration stays.
10. **The cover's (first screen's) text is code-rendered only** — the engine never draws
   the title. **Veo can't write Hangul** (user confirmed 2026-08-11), and the cover is a
   screen of nothing but the hook title and the hero number, so broken glyphs write off the
   whole episode. **The opening treatment follows `shot.render`**; video is optional unless the channel explicitly
   enables `hook_video`. A selected motion background is made from the cover still (§3, on the saved
   video model with its audio off; the builder keeps only the video track so narration and the
   code-rendered title stay), or **a real recorded clip** (2026-08-15 — scrolling the
   finished site, running the tool, as the cover **background**; the movement in the first
   frame is aimed at the 84.8–93.8% skip rates measured in practice). The clip has to be a
   user-supplied recording or an ingest artifact; don't use someone else's copyrighted
   screen. A text-free b-roll still goes in the **stretch after the cover**, never on it —
   and every selected clip needs its own purpose and motion reason.
11. **The source image must support the selected action.** Include a person only when the
   shot needs that person; do not insert a demographic default into unrelated topics.
   Use the channel's art direction and a high-quality source. For a generated person,
   keep the likeness fictional and frame the relevant action clearly. People are not a
   substitute for explaining why continuous video is needed. A photoreal generated person
   requires the publishing disclosure (`containsSyntheticMedia: true` on YouTube).
12. **Don't throw the cover background PNG (the meta image) together** — the cover frame
   becomes `cover.jpg` (the YouTube thumbnail and the first screen of the IG and FB videos)
   as-is. No still lifes or abstract backgrounds unrelated to the topic — the default is one of two:
   **a photoreal scene with a person that shows the topic at a glance** (the person contract
   from rule 11, unchanged), or **the topic itself** (the result screen or product screenshot
   the episode is about — for dev and tool channels, where the evidence is a screen rather
   than a person. "Expertise shows in evidence, not in claims", 2026-08-15).
   Either way make it on the saved image model at its saved quality (on a host tool, the lowest
   available quality — still-generation.md §1), and if channel profile §3 sets a different art
   style, that wins. The text is still code-rendered (rule 10) — this rule is about the background picture.
   **A b-roll source is the same file as the background of the scene it attaches to
   (`after`)** — the photo the previous scene showed as a still starts moving, so one image
   does two jobs. For an opening b-roll (`after: 0`) that file is the cover background. For
   a body b-roll it's that points scene's background, and that one image is made on the saved
   image model like every other still — it is the video model's input, so a blurry source makes a
   blurry video, and with nothing in it for the clip to move the model invents motion (rule 11);
   a saved engine that cannot deliver a usable source is reported for an explicit exception.
   **Generated-video slots follow the episode's selected video ratio and explicit budget.** Count
   b-roll and motion-background scenes (`visual.video`) together: the band's upper bound and
   `PRODUCTION.videoBudgetUsd` are the ceiling, and a channel's `generated_video_max` or
   `video_budget_usd` is a ceiling only, never a quota or a spending approval. Each selected cut
   writes `visual.why` because continuous motion carries its content. Every other cut is a still
   under its camera move — every still card carries a Ken Burns move (§6); the build warns on a
   frozen one and continues, naming a planned `motionIntent: intentional_still` — and one still
   holds one cut at most (`max_static_ground_seconds`, default 8 s; a longer cut swaps the still
   per sentence) — or an HTML motion slide, which never spends a paid slot. A plate on an `other`
   beat standing past that limit is reported as a warning for the board to fix (a slide with a
   movement per group runs that clock per group). Produce never adds video to reach a motion
   floor; when the approved storyboard plans fewer generated cuts than the target it reports that.
   The policy fields are described in scenes-schema §Channel true-motion policy.
13. **Generation that costs money runs only after the plan is checked** — the cover
   background and the b-roll need a plan in the storyboard first (source prompt, motion,
   used length + why), and you check it yourself before calling the still or clip generator (the
   saved image and video models): no still life as a source, no real person, the target person on a
   target channel, no text expected from the engine, the exclusions written, a duration the
   cut earns, no minor in frame, the saved engine for that lane. The content-reviewer plan-mode
   read of 0.49 is no longer part of the flow (six million tokens a call, measured); it
   stays available when the user asks for it. A plan that fails a point gets fixed before the call — don't spend video money on a bad source.
14. **The photo is the lead on screen — no slide (PPT) look.** Scene text lives inside the
   top and bottom bands only: points uses the top block (title + **one caption at a time** +
   source), cover uses the bottom block, and nothing else is typed over the picture. Don't build
   boxes, UI slabs or full-screen dims across the middle of a photo-backed points frame — the
   background photo showing through is what makes it a video; cover it and it's a slide
   (user's note 2026-08-12, "too PPT-ish"; the lit slabs of the studio-stage slide in CLAUDE.md
   are a different object and this sentence does not concern them). Gradient scrims are off altogether
   (owner 2026-08-25 — no top/bottom bars; the template's `scrim=` parameter draws nothing).
   Since the photo has become the screen itself, make points backgrounds **photoreal shots
   of the subject** rather than metaphorical still lifes, and change the shot wherever the
   content axis changes (reusing one image leaves 40-odd seconds of body on the same still).
   On a channel whose motion policy forbids stills, the photo is source material rather than
   the finished screen: place it full-frame in `visual.slide.motion:true` and animate the
   subject or evidence named by `visual.action`. A whole-photo zoom or pan is still Ken Burns
   and does not qualify. `check-scenes.js` reports this contract before capture.
15. **Every episode runs the final pace pass — the pass is not optional.** After the build (and
   after any clip splice) `references/speedup.sh` writes the one deliverable set and, when an SRT
   sidecar was requested (`SUB=1`), checks the speech rate on the retimed cues. The factor is
   **1.0x** unless the episode carries an explicit user request in `.work/speed-authorization.json`
   (tts-speed.md); a channel profile value is not that request. With a sidecar the shipped result
   has to stay at or below **6.2 spoken characters/s overall and per substantive cue**; without one
   the rate check is skipped and the report says so.
   The outro stays at 1.0x when the channel splices one. What goes to `output/video/` is
   `.work/reel-fast.mp4` as `video.mp4` plus `delivery-proof.json`, never the pre-pass files; an SRT
   goes along only when it was requested.
16. **Nothing is drawn over video; hybrid explanations use HTML** (user directive
   2026-09-05, CLAUDE.md §Nothing is drawn over video — an absolute content rule: no production
   mode, reference recipe or quality finding lifts it. An approved full-video episode lifts only
   the HTML requirement, never the ban on marks). No arrow, route, X, ring, hatch, bracket, dot, label or
   callout goes over a generated clip, a motion background, a b-roll, a quote clip or a
   recording; subtitles and captions are also forbidden on the moving picture. A cut that needs an
   arrow, a figure or a principle is `kind:"diagram", motion:true, treatment:"editorial"` on
   the studio stage, with a rendered object when a thing is the subject, built to the quality
   of `docs/research/2026-09-04-rendered-object-slide/reference-slide.html`. The footage slide
   (`treatment:"footage"`) is retired and the checkers reject it.
## Procedure
### 1. Check the inputs
Read [model settings](../_shared/model-settings.md) before media calls. Reuse the
episode's model snapshot and explicit overrides; for a new episode run directory
setup only if missing. Preserve legacy approved choices rather than overwriting
them. Use the selected video, speech and image models throughout production, even
when later recipes recommend another engine. No repeated model question or silent fallback.
Follow [delivery preflight and continuation](references/delivery-continuation.md) before generating assets and on every resume. Clips alone are never completion.
- Confirm `status: approved` in the `storyboard/storyboard.md` frontmatter — that approval is the
  spending boundary for this episode's generation; without it stop and point the user at
  `/social-flow:storyboard`. Quality reviews recorded on the board are evidence, not a second gate.
- Load `data/<channel>/profile.md` (voice, theme, platforms, `shortform_outro` — `on` if absent).
- **Identify the source**: three paths, decided by `window.FORMAT` and the scenes'
  `visual.source`.
  | Condition | Path |
  |---|---|
  | `recording/alignment.json` present + portrait | **Shooting edit** — `references/screencast-pipeline.md` |
  | filmed scenes (`visual.source==="recording"`) mixed in | **Mixed shooting** — this document as-is + §3.5 |
  | anything else | generated (§2–7) |
  **The shooting-edit path** follows `references/screencast-pipeline.md` §Edit procedure
  instead of §2–7 (overlay capture → edit.json → build-screencast.sh — no TTS, no generated
  backgrounds, no reveals; the voice is the user's own). The artifact names (reel.mp4 ·
  cover.jpg · build-report.txt; requested SRT separately) are the same, so §7.5–10 (the speed
  pass, phone QA, platform text, completion report) run unchanged — **a shooting edit ships sped up
  too**, and `speedup.sh` reads the xfade join that builder makes on its own. Use screencast-pipeline.md's gate table.
  **`alignment.json` + landscape doesn't work.** `build-screencast.sh`'s band constants
  (BAND_MAX_H 900 · BAND_CY 880 · BAND_MIN_Y 460) and its background compositing are
  absolute portrait pixels and can't move to a landscape canvas. If you hit this
  combination, **stop** and tell the user — saving each scene as its own file opens the
  mixed-shooting path. Run it anyway and you shoot all 12 minutes only to die at the final
  canvas check.
  **Mixed shooting** puts filmed and generated scenes on one timeline — the builder is the
  same `build-reel.sh` as a generated episode, and only the filmed scenes go through the
  extra prep in §3.5. Slide scenes (`visual.slide`) and all-live-voice episodes
  (`window.VOICE === "user"`) additionally go through §3.6 — rendering each motion-slide
  group to a clip and taking in the user's recordings (`voice/s<n>.wav`).
- Prepare the working directory: create `.work/{cards,broll,motion,pcm,fonts}` and settle
  the platform list (the CSV argument, or profile §4's publish platforms).
- **Settle the format — write `.work/format.env`. Don't skip it.**
  ```bash
  PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
  node $PG/format-resolve.js storyboard/scenes.js --sh > .work/format.env
  # Speed defaults to 1. A non-1 factor requires the explicit user request record
  # described in references/tts-speed.md; a channel profile is not approval.
  grep -qF '${SPEED:=' .work/format.env \
    && echo "format.env already carries SPEED — edit that line instead of appending" \
    || echo ": \"\${SPEED:=1}\"" >> .work/format.env
  # profile.md's `shortform_outro` — absent or `on` writes 1, `off` writes 0, substituted the way
  # the SPEED line wants a factor; **the key is short-form only**, so a `youtube-long-16x9` episode
  # writes 1 whatever the profile says (long-form always splices outro-16x9.mp4). **The flag decides
  # the splice, not whether outro.mp4 is in the workdir** — that tells a channel shipping without
  # one apart from a forgotten copy step.
  grep -qF '${OUTRO:=' .work/format.env \
    && echo "format.env already carries OUTRO — edit that line instead of appending" \
    || echo ": \"\${OUTRO:=<1, or 0 when this is a short and profile.md says shortform_outro: off>}\"" >> .work/format.env
  ```

  Top-level `window.FORMAT` in `scenes.js` is the format axis, and **without it the format
  is `shorts-9x16`**. No existing episode has the key, so they all come out the same as
  today — a unit test pins the emitted values to be character-identical with the builder's
  inline defaults (`server/test/format-resolve.test.mjs`). There's one reason to write it every time
  regardless of format. Make it conditional and the first time someone forgets "write it
  only for landscape", that episode quietly builds at the portrait defaults.

  The capture calls take this file as a **command-line prefix** (§4). `export` won't carry
  it — the Bash tool starts a fresh shell per call, so an exported variable dies with that
  call. That's why the playback factor goes in here too: `build-reel.sh` sizes its speech-rate
  band and its chapter minimum from it, and §7.5's pass takes its factor from the same line, so
  the build and the ship can't disagree about the speed.
- **Don't delete `.work/cost-tally.tsv` or `.work/cost-forecast.tsv`.** Since 2026-09-04 the
  storyboard bills nothing (its §5 plans and stops), so the tally starts empty here and
  **every line in it is written by this skill** — stills, slide arts, clips, TTS, music. The
  forecast file is the storyboard's projection; §10 sets the two side by side, which is the
  only way an estimate ever gets corrected. A missing forecast isn't a blocker — say so in
  the report instead of comparing against nothing.
- **Read the episode's state before starting, and again when picking up a stopped run.**
  Produce is the long stage, so it is the one most likely to be resumed in a later session.

  ```bash
  REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
  node $REF/episode-state.js .        # from the episode directory · exit 1 = blocked
  ```

  It reports the stage and what is missing — filmed scenes with no footage, a queue marker.
  **Stills and slide files being absent is the normal state at this point**, not a blocker:
  §1.5 and §3.6 are what create them. Run the structural contract now:

  ```bash
  SB=${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references
  node $SB/check-scenes.js storyboard/
  ```

  `check-slide.js storyboard/ --require-all` runs at the **end of §3.6**, once the slides have
  been authored — running it here would fail on every episode. It fails (exit 1) only on a missing
  file, a template mismatch, the retired `treatment:"footage"` or an unknown kind/act word; its design
  and metadata rules print as ⚠ warnings with exit 0. Timeline, statistic, and principle slides are checked again while rendering: every
  `motionBeats` primitive (actor + rule on a principle) must exist in that group's DOM. A parse error or
  an unresolvable reference (a b-roll `after` that names no shot) fails the first command; every other
  finding prints as a warning. Fix a blocker before the build rather
  than discovering it 12 minutes into capture. `.work/` survives between sessions on purpose,
  so a resumed run reuses the captures and TSV manifests already there.
### 1.5 Generate the stills

**This is where the episode starts costing money.** The storyboard planned every still and
generated none of it (its §5), so `storyboard/images/` is empty when this step begins and full
when it ends. **Skip the whole section on the shooting-edit path** (the screen is the user's
recording); a **mixed** episode still generates the stills its generated scenes name. Slide
scenes have no still here either — their screen is HTML, authored at §3.6.

**Persistent locations:** Before source images, follow [location assets](../storyboard/references/location-assets.md). Render the bound set/camera and complete actor start/end blocking; inspect consecutive cuts and the advisory continuity findings. Use `mcp__social-flow__location_manage` action `previz` for motion so its clip and source composition share that same spatial plan. Forward the assembler's actual image inputs with the location composition first; cast sheets supply appearance. Read spatialWarnings for legacy independent previz. Camera, actor or endpoint changes require fresh references; actual reviews remain optional and honestly recorded.

**The plan clears rule 13 first.** Go through each `bgPrompt` and the footage stills against
absolute rule 13's list with profile.md §3 open for the target person — no still life as a
source, no real person, no text expected from an engine that can't write it, the exclusions
written, no minor in frame. The storyboard checked this against a plan; you are checking it
against the call that is about to go out.

**A stock photograph is not generated**: a `visual.source: "stock"` still names its file under `images/stock/` and carries `visual.license`; download it from the record's `url` (or the `stock_search` file URL) into that exact name and log the date beside the license in `.work/decisions.tsv`. Then generate the rest, **resending each stored `visual.bgPrompt` verbatim**, and **look at every
picture that comes back** before moving on — a wrong still is the cheapest thing in this
pipeline to catch and the most expensive to carry, since §3 turns it into a clip.

The engine split, the size preset, the character-reference rule, what disqualifies an image,
the one-remake rule and the ledger lines are all in
[still-generation.md](references/still-generation.md).

```bash
printf 'image.gpt-image-2.high	1	produce: cover background scene-1
' >> .work/cost-tally.tsv
printf 'image.local	3	produce: points backgrounds scene-2~4
'        >> .work/cost-tally.tsv
printf 'image.host	4	produce: cover + points on the host image_gen
'   >> .work/cost-tally.tsv   # Codex · Grok
```

### 2. Prepare the frame render

```bash
sed 's|</body>|<script src="./scenes.js"></script>\n</body>|' \
  ${CLAUDE_PLUGIN_ROOT}/skills/produce/references/video-template.html > .work/frame.html
cp storyboard/scenes.js storyboard/images/*.png .work/   # for file:// relative references
```

Rebuild frame.html every time you touch the template or scenes.js — skip it and you capture
the old render without knowing. Always run with absolute paths (a relative-path redirect
after `cd` fails silently).

### 3. Generate the clips

The §6 manifest references these file paths directly, so follow the naming below.
**The b-roll clears the plan check first** (absolute rule 13) — go through the broll and
motion-background scenes from scenes.js against the rule's list, with profile.md §3 open for
the target person, and only then start the generation calls. The stills those clips are made
from already exist and were already looked at (§1.5); an engine question about a still belongs
there, in [still-generation.md](references/still-generation.md). **Every clip request in this section goes `video_catalog` → `video_plan` → `video_execute`** (`video_status` on resume) on the saved video model — except the audio-conditioned ASTRA cut, which the 2026-10-17 block above sends through `render-astra-shot.js`. With `videoProvider:"host"` the plan returns a `host_handoff` for the host `image_to_video` — same source PNG, same stored prompt, `video.host` in the ledger. A direct `veo_*` / `seedance_*` / `omni_*` / `astra_*` call appears only as the adapter the plan selected and must carry `videoContext: {episode, shotId, requestId}`; a configured workspace refuses one without it (`video_context_required`).

**What the storyboard already settled — pass it through, don't re-decide it.** These values
arrive from scenes.js already chosen and already reviewed. Inventing a replacement at call time
means generating something nobody approved.

- **The stored clip prompt — send it verbatim.** Every generated-video shot leaves the
  storyboard with its final prompt stored (scenes-schema §clip prompt: `visual.prompt` on
  b-roll, `visual.video.prompt` on a motion background, `visual.clip.prompt` on a speech
  clip), assembled by `assemble-bg-prompt.js --clip` in the planned route's grammar and
  machine-checked there. One scene is one call, and the prompt is the reviewed artifact — the
  call adds only the arguments the API takes separately: `negativePrompt` from the stored
  `negative` noun list (Veo fast/standard only — lite takes none, so its exclusions stay in the
  prompt body), the reference images from `visual.character`, and `requiredSeconds` from
  `plan-video-duration.js` (video-duration.md; never beside `durationSeconds`). **To regenerate a clip, resend the stored prompt as-is**;
  when a camera slot or the motion changed, rerun the assembler from the fields rather than
  editing the string by hand — the same discipline as `bgPrompt`.

- **`visual.camera` — the four camera slots — is the fallback assembly recipe.** On an older
  scenes.js with no stored prompt, assemble the camera part as `framing`, then `speed movement`,
  then `ending on end` — or, on a travelling move, `framing, pauses, then speed movement, settling on end` (scenes-schema §camera, L13–L14):

  ```
  { movement:"dolly in", speed:"slow", framing:"chest-up on the subject", end:"subject centred at mid-frame" }
  → "chest-up on the subject, pauses, then slow dolly in, settling on subject centred at mid-frame"
  ```

  Then append the subject motion, and for b-roll the audio line. **An empty `end` is a storyboard
  defect, not something to fill in here** — send it back. Older episodes carry a single
  `visual.motion` string instead; use that as-is.
- **`shot.composition` owns framing room.** Source prompts and filming scripts read the record. Check headroom, gaze space, travel space and unobstructed framing in actual frames and motion endpoints; image-to-video inherits the approved source composition. **`shot.depth` owns focus** the same way: shallow names the one sharp plane, deep lists every plane that must read; check the actual still and clip, and treat a still-camera focus mask that blurs two objects at one distance differently, or a soft key subject, as a failed cut rather than a look.
- **`shot.eyeline` owns gaze.** Read the scene plan before source images. `assemble-bg-prompt.js --from` includes it in source prompts; the shooting script prints the marker. Compare linked images and final boundary playback for direction, eye height and target distance. Keep the image-to-video prompt from restating locked space.
- **`shot.feel`·`shot.size`·`shot.angle`·`shot.space` — the shot grammar.** The storyboard wrote
  what the audience should feel on each shot and chose the size, the angle and the frame space
  for it (`../storyboard/references/directing-grammar.md`). On a generated shot the `framing`
  slot already restates size and angle in the engine's words; keep that distance and height, and
  when a clip comes back drawn closer, farther, or from a different height than the slot says,
  rerun it off the same PNG rather than accepting a frame that flips the feel. **Do not
  re-describe `shot.space` in a motion prompt** — the still already drew who sits where and
  which way they face, and rewriting sides, facing, or lighting makes the engine redesign the
  scene (plan P0-7). A quote speech clip has no still, so its prompt carries the shot's
  `From the camera: …` sentence — `assemble-bg-prompt.js --from scenes.js --shot N
  --space-only` (N from 1, the strip's "Shot N") — after the character description; the size and framing phrases stay what the
  quote contract below says, since that clip is framed wide on purpose for the palindrome
  reframe. On a still the size, the angle and the space live in `bgPrompt` and were drawn at
  the storyboard stage — nothing to re-decide here. To regenerate a still, resend the stored
  `bgPrompt` as-is; when a `shot` field changed, rerun the assembler from the fields with the
  scene and mood sentences lifted from the stored string (they sit between the `From the
  camera:` sentence and the exclusions — and `--no-person` again when the stored string reads
  "the subject" instead of a body) rather than editing the string by hand.
- Follow [character-identity.md](../channel/references/character-identity.md) for cast directions: recompile current identities, compare source hashes, and apply image/video/dialogue/voice guidance to their respective generation lanes.
- **`visual.character` — who is on screen.** Use `PRODUCTION.cast[id].image` when present;
  otherwise resolve the id to the channel panel directory:

  ```bash
  CH=$(python3 ../channel/references/resolve-asset.py "$CHANNEL_DIR" character claude)
  # → …/assets/characters/claude — reference set: $CH/face.png then $CH/body.png
  ```
  Keep source-image order as previz, style pack, episode cast. **Inside channel panels, order is
  weight**: front/three-quarter shots use face then body, close-ups use face alone,
  rear shots use back (add face only when visible). Store all three views for new characters. No panels yet means falling back to that character's `front.png`; a live-action
  character keeps its single image (`real.png`). The reference lane is the saved video model's
  (`seedance_reference` or `veo_reference` as the plan selects; Veo takes **3 images max**, validated
  in code) — a saved model that cannot take the required references is reported for an explicit
  exception, not swapped. The full rule is
  [video-model-selection.md](references/video-model-selection.md) §The character panels.

  For character speech, follow [shot-speech.md](references/shot-speech.md); no voice-lock ASR or listening gate.
  **The character's voice travels the same way.** `$CH/voice.wav` is the fixed voice sample
  (`resolve-asset.py "$CHANNEL_DIR" voice claude`; §6). When the model voices the cut —
  `generateAudio: true` on `seedance_reference`, which is a b-roll slot routed to Seedance or a
  lip-synced speaking cut — pass it as `referenceAudioPaths` and bind it in the prompt right
  after the reference list: `@Image 1-2 are Claude and speak with the voice of @Audio 1`. Two
  speakers, two clips, one sentence each; `@Audio N` is the Nth entry of `referenceAudioPaths`.
  The route is `dreamina-seedance-2-5-260628` — the only model whose guide documents the
  per-character mapping, and the 2.0 series takes no audio-only input. Veo has no audio
  reference; select an explicit speech synchronization adapter under shot-speech.md. A cut voiced
  by TTS in the build needs no voice reference at all — the sample exists so the model-voiced
  lane and the TTS lane match the voice `identity.md` pins (profile §2). Imitation, not cloning: also describe the voice in words
  (gender, age, texture, pace, mood) and keep the lines in the sample's tone — the vendor's own
  FAQ says the result drifts otherwise.

  An entry written as `{ id, scope }` carries its **jurisdiction** — copy that clause into the
  prompt's reference list verbatim (`@mouse — controls the helmet and body only`). Don't
  paraphrase it and don't drop it: it is what keeps one reference from painting the rest of the
  frame, and the storyboard settled the wording where it could be reviewed (§positive locks).

- **`duration` — the used length.** On a generated clip this is what the cut needs
  (scenes-schema §cut length), not a default: an insert is 3–4s, a face carrying emotion is
  7–10s. **Ask for exactly that** — send `requiredSeconds` from `plan-video-duration.js`
  ([video-duration.md](references/video-duration.md)), never a bare `durationSeconds` beside it; Seedance makes and bills the seconds you request, and the router clamps them to the saved model's floor (1.5 pro takes 4–12s, so a 3-second scene bills 4 and the build cuts at the scene boundary).
  Veo's reference lane is the exception the other way, pinned at 8s, so there you generate 8 and trim. Handing a model more seconds than the idea holds is how the
  middle of a clip goes dead — it fills the time it is given.

- **What the clip brought back — check it before it enters the plan.** Every returned clip
  runs `node $REF/check-clip-artifacts.js <clip.mp4> --expect silent|sound|speech --json
  <clip>.artifacts.json` (silent = a card clip planned `generateAudio:false`, sound = a b-roll
  whose own audio ships, speech = a quote clip): one frame a second through OCR for burned
  text, the audio track against the plan, the local ASR for a line the prompt never wrote.
  Exit 2 lists findings. Accidental type on the picture breaks the subtitle-free delivery rule, so
  fix it within the existing authorization — crop the clip, or replace it off the same PNG with the
  artifact locks (`subtitles, text, captions, logo, watermark` in `negativePrompt` on Veo
  fast/standard; lite takes none, so there the exclusions go into the prompt body; "keep it
  subtitle-free" in a Seedance lock; `no speech, no dialogue` in the `Audio:` sentence) — and record
  the finding with the frame time and words in the build record. No approval is asked; only a
  replacement that needs new spend goes through the budget check (`--before-call`)
  (video-generation §what the clip brought back).

- **`visual.video.previz` — optional.** A previz helps camera and blocking when the saved model takes a reference clip (Seedance 2.x `reference_video`): pass the `generation` object's `referenceVideoPaths` to `seedance_reference` resolved from the storyboard directory like `referenceImagePaths` — never a re-rendered or substituted clip (its bytes are hash-bound; `check-production.js` flags a mismatch as stale). On a `frame_and_prompt` adapter (Seedance 1.x, Veo, a host tool, ASTRA) it is advice only: the still edited from `previz.firstFrame` and the stored prompt carry its composition. No checker refuses a generated cut without one; when `.social-flow/models.json` has `production.previzRenderer` use that renderer, otherwise pick one and record it as an assistant decision. When a previz exists, check the result against it — a contact sheet at 0/25/50/75/100 % and an edge overlay ([blender-previz.md](../storyboard/references/blender-previz.md) §6.4, §6.7). **Reuse the user's saved model choice**: `PRODUCTION.videoModel` holds it (directory model settings and storyboard §1.7). Populate a new board from its snapshot without another model question; preserve older boards' actual approved choices. Use `video-model-options.js storyboard/` only during first setup or an explicit requested change. Record each cut's selected model/resolution and recalculate costs when the user changes them; retain actual spending authorization.

**Use the `generation` arguments from `cost-preview.js --json` as the `video_plan` operation args; resolve errors and re-estimate retries before spending. Prompt shape and per-slot recipe** —
[video-generation.md](references/video-generation.md). The engine is the saved video model;
that document's face → sound → grid route is first-setup advice, while each engine's prompt
shape and the per-slot recipes for b-roll, motion backgrounds and quote speaking clips apply
to the saved one. **Read it before the first
generated-video call**; an episode of still backgrounds skips it whole.
`mlx_video_generate` is a separate local clip (24 fps, RAM-capped, ffmpeg mux) — it is
not on that face-policy table and is not the default. `mlx_3d_generate` writes a GLB consumed by the HTML mesh lane
([mesh-objects.md](../storyboard/references/mesh-objects.md)); inspect the model and its materials before use.
Follow [illustrated-scenes.md](../storyboard/references/illustrated-scenes.md): people/mood cuts use still-camera motion; explanations use recognizable 3D objects in contextual settings, with matching cute 3D characters performing the task when needed. Match still-camera direction to the cut’s purpose; character scenes default to no marks, mechanism scenes use brief, legible part callouts.
All `still_camera` cuts use the unchanged shared camera HTML template and runtime, including push/pan. Non-slide video handoffs declare `visual.renderedFile` (or `visual.clip`) relative to the storyboard; assembly must use that exact file. Drone shots follow [drone-flythrough.md](../storyboard/references/drone-flythrough.md). Keep attachments and rights evidence locally.

- **Cover background = b-roll source (one image, `storyboard/images/scene-1.png`)**:
  the saved image model at the format's size preset (`1088x1920` on gpt_image for shorts) and its
  saved quality (still-generation.md §1). **Photoreal style, with a
  person only when the shot needs one** (absolute rules 11·12 — no demographic default),
  an angle that puts the channel's subject at the center, a scene that shows the topic at a
  glance. Inherit profile §3's mood, its required negative instructions, and the
  fill-the-frame tail (owner 2026-08-25 — never a letterbox or a lower-third fade), but
  swap `face not visible` for
  **`seen from behind, face turned away`** so the person is clearly visible.
  The cover capture (`bg=./scene-1.png`) and veo's input use the same file, so when the cover
  ends that photo starts moving.
- **BGM**: the storyboard already decided this. Read `window.MUSIC` and each shot's `sound`
  (scenes-schema §music cues) and turn them into files the builder can find.

  **No `window.MUSIC`** — a one-bed episode, which is the common case:
  ```bash
  ASSET=${CLAUDE_PLUGIN_ROOT}/skills/channel/references/resolve-asset.py
  if BGM=$(python3 "$ASSET" data/<channel> bgm default 2>/dev/null); then
    cp "$BGM" .work/bgm.wav
  else
    # generate only when there isn't one — to reuse it next episode, copy it to
    # assets/audio/bgm/default.wav and register it with its provenance in the note:
    #   resolve-asset.py --ensure data/<channel> bgm default audio/bgm/default.wav "lyria-clip · <prompt> · <date>"
    # (assets-catalog-template.md — the note is what answers a claim or a rights question later)
    : # default: music_generate_clip (Lyria, 30s instrumental) → .work/bgm.wav
  fi
  ```

  **With `window.MUSIC`**, one file per cue. `base` (or the channel's shared bed when there is no
  `base`) becomes `.work/bgm.wav`; every other cue becomes `.work/bgm-<name>.wav`. A cue with
  `asset` comes from `resolve-asset.py <channel dir> bgm <id>` instead of being generated. A cue
  with `prompts` (a weighted blend, scenes-schema §music cues) goes to `music_generate_advanced`; a cue with `prompt` goes to `music_generate`. **Do not put the local path in the cue's `asset`**: `asset` is a channel catalog id that `resolve-asset.py` resolves, and a path there fails or silently falls back to the channel's `default.wav`.
  **Ask for the length the cue has to fill** — trimmed TTS of its shots + ~1 s a shot of card
  padding + the 2 s handover (bgm-scoring.md §2; the last cue needs no handover). A cue that
  comes up short loops at the boundary and `bed.log` prints the exact span to regenerate at.

  On a legacy board without `$mix`, `sound.effects` or `sound.silence`, continue to write **`.work/bgm.tsv`** by hand — `idx <TAB> audio-file`, one row per shot that changes the cue:
  ```
  4	bgm-tense.wav
  ```
  `idx` is the **card idx** — 0-based, the shot's array position in scenes.js, the same number
  `sfx.tsv` and `chapters.tsv` use (`broll` and `outro` are spliced in after the build and are
  not cards). Paths are relative to `.work/`.
  A shot with `sound.drop` becomes an `sfx.tsv` row per segment of that shot, audio column empty
  and `bgm` set to `off` (§sfx below). A shot with `sound.sfx` becomes one row on **seg 0** — the
  shot's first frame — with the path `resolve-asset.py <channel dir> sfx <id>` returns.
  `build-reel.sh` runs `compile-sound-plan.js` before reading `sound.env`. On an extended board, do not hand-write `bgm.tsv` · `sfx.tsv` · `amb.tsv` · `silence.tsv` or `sound.env`: the compiler records their hashes in `.work/sound-plan.json`.
  It removes only a stale file whose hash still matches that marker; human edits are kept with a warning, and a markerless legacy board stays byte-identical.
  **The level is not a knob here.** The builder measures the narration and sets the bed
  `BGM_SEP` LU under it (10 by default), clamps the bed's true peak, and stops the build if the
  voice-to-bed separation **while the voice is up** lands under 4 LU. The hook is handled there
  too: card 0 sits a further `BGM_HOOK_LU` (6) down and ramps back from card 1, so the opening
  needs no drone cue. So the prompt only has to make the bed *fit* — the established wording is
  "leaves space for a spoken voiceover, no melody in the vocal frequency range". The build
  report prints the separation under speech with the ducking depth it measured and the
  whole-timeline figure next to it. Two craft knobs exist for an A/B and are off or at their old
  values by default: `BGM_EQ` (a dB scoop at 250 Hz and 2.5 kHz) and `DUCK_RATIO` /
  `DUCK_ATTACK` / `DUCK_RELEASE`. Where those numbers come from, and which parts of this are
  evidence and which are our own practice: [bgm-scoring.md](references/bgm-scoring.md).

  | Job | Tool | Key |
  |---|---|---|
  | A cue that has to fit a span, or a seed to reproduce | `music_generate` / `music_generate_advanced` (5–300s) | `GEMINI_API_KEY` |
  | A bed with no span to fit | `music_generate_clip` 30s, the builder extends it | `GEMINI_API_KEY` |
  | A local instrumental bed (optional) | `mlx_music_generate` (`instrumental: true`) | MLX Core on :11234 |
  | Narration-under bed (Suno) | `suno_generate_sound` loop + BPM. `filename: "bgm.wav"` | `SUNO_API_KEY` |
  | The song IS the content | `suno_generate` (customMode; lyrics from `suno_generate_lyrics` or written) | `SUNO_API_KEY` |

  Default BGM is Lyria. `mlx_music_generate` is the $0 understudy when MLX Core is
  running — it is not the default, and unattended still takes the Lyria clip.
  Sung vocals fight the voiceover, so `suno_generate` is
  for episodes where the song itself is the piece. There is no official Suno
  API (2026-08); `suno_*` talks to sunoapi.org.

- **SFX**: the storyboard's `window.SFX` and each shot's `sound.sfx` (scenes-schema §sound
  effects). Every id becomes a file in the **channel** catalog, not `.work/` — an effect is
  generated once and every later episode that names the same id reuses it at $0.
  ```bash
  ASSET=${CLAUDE_PLUGIN_ROOT}/skills/channel/references/resolve-asset.py
  # for each id in window.SFX — and each bare sound.sfx id when there is no window.SFX:
  if ! python3 "$ASSET" data/<channel> sfx <id> >/dev/null 2>&1; then
    # { prompt } entries only — a missing { asset } is a storyboard error, not a generation
    : # sfx_elevenlabs_generate — text: <prompt>, durationSeconds: <seconds>, loop: <loop>,
      #   outputPath: data/<channel>/assets/audio/sfx, filename: <id>.wav
    python3 "$ASSET" --ensure data/<channel> sfx <id> audio/sfx/<id>.wav \
      "elevenlabs eleven_text_to_sound_v2 · $(date +%F) · see <id>.json"
    printf 'sfx.elevenlabs\t<measured seconds>\tproduce: sfx <id>\n' >> .work/cost-tally.tsv
  fi
  ```
  Listen to a new effect once before it goes into the manifest — a whoosh with a tail under
  the next line, or a hit that arrives as music, gets regenerated with the prompt sharpened
  ("no tail", "no music", "short decay"), not shipped. The `.json` sidecar next to the WAV is
  the provenance record (tool, model, prompt, seconds, request id, date, rights) and the
  catalog note points at it. Then the manifest: one `sfx.tsv` row per shot on **seg 0** with
  the path `resolve-asset.py` returns (§sfx below), `bgm` column `on` — the effect lands on the
  cut and the bed keeps playing under it. A shot that also drops writes its seg-0 row with the
  path and `off`, and the drop's other segments as usual. The builder measures each effect
  the way it measures the bed — its loudest 400 ms lands `SFX_SEP` (6) LU under the narration,
  pulled back when its own true peak would pass −1 dBTP — so two effects from two prompts sit
  at the same distance from the voice, and the build report prints where the loudest moment
  landed (bgm-scoring §effects).
- **Room tone**: a shot's `sound.ambience` names a `window.SFX` entry with `loop: true`
  (10–30 s), generated and registered exactly like an effect. Then `amb.tsv`: one row per
  card where the room starts or changes (`idx <TAB> path`), a `-` row where it ends; cards
  without a row carry the previous room. The builder renders the lane with `bgm-bed.sh`
  (measured, `AMB_SEP` (15) LU under the narration, self-looped with a crossfade) and mixes
  it **un-ducked** — a room that dips at every sentence start is the pumping the ducker is
  for music, not for the floor of the scene. Without it the gaps between sentences are
  digital silence, which the ear reads as a splice (bgm-scoring §effects).

**Write one line to `.work/cost-tally.tsv` per call** — the same ledger §1.5 started
was using. The convention's source of truth is
[cost-tally.md](../autoproduce/references/cost-tally.md).

```bash
printf 'image.gpt-image-2.high\t1\tproduce: cover background regenerated\n'          >> .work/cost-tally.tsv
printf 'veo.lite.1080p\t8\tproduce: b-roll a1 — generated 8s, used 4s\n'             >> .work/cost-tally.tsv
printf 'seedance.2-0-video.1080p\t10\tproduce: motion background i3 — 5s cut + 5s previz (completion_tokens 486000)\n' >> .work/cost-tally.tsv
printf 'music.lyria-realtime\t90\tproduce: BGM cue "base" 90s — unit price unconfirmed\n' >> .work/cost-tally.tsv
# one line per cue in window.MUSIC — a three-cue episode is three calls, not one
printf 'music.suno-generate\t1\tproduce: Suno full song, 1 call (2 tracks)\n'        >> .work/cost-tally.tsv
printf 'music.suno-sound\t1\tproduce: Suno loop BGM\n'                                >> .work/cost-tally.tsv
```

Two places where the unit is easy to get wrong.

- **For veo, write the generated length** — generate 8 seconds and use only 4 and it's still
  `8`. The API allows 1080p at 8 seconds only, and trimming doesn't reduce the bill. Write 4
  and half of that episode's video cost vanishes from the report.
- **For seedance, write the seconds you requested**, and copy the response's
  `completion_tokens` (the actual billing basis) into the memo. The price table's per-second
  value is converted from the official example price, so comparing the two later checks the
  conversion.

**BGM is an item whose unit price hasn't been confirmed.** Lyria RealTime, which
`music_generate` calls, has no row in the official price list (confirmed 2026-08-15). Write
it into the ledger anyway — write 0 or leave the line out and that episode's cost quietly
shrinks. The report exiting 1 is the correct behavior, and §10 reports it as "1 item excluded
from the total".

**Carry on the decision log too** (`.work/decisions.tsv`, started by storyboard —
[decision-log.md](../autoproduce/references/decision-log.md)). Produce is where most of the
substitutions actually happen: the music source, the voice, and every route that had to change
because a key was missing. A fallback that reaches the deliverable without a line here becomes
an unexplained difference between the storyboard's plan and the video.

```bash
printf 'produce\tmusic_source\tepisode BGM\tmusic_generate_clip\t30s Lyria clip, builder extends; rejected suno (sung vocals fight the voiceover)\n' >> .work/decisions.tsv
printf 'produce\tfallback\tmotion background i3\thold\tARK_API_KEY absent for the saved Seedance model — waiting for the key, no silent engine switch; recorded in build-report.txt\n' >> .work/decisions.tsv
```

### 3.5 Take in the filmed clips (mixed-shooting episodes only)

Normalize the user's `footage/` files once, then hand them to the builder as cards.
The full lane — the VFR trap, the normalize command, the naming the builder expects —
is in [optional-lanes.md](references/optional-lanes.md) §3.5. **Stock clips** (`visual.source: "stock"`, scenes-schema §stock material) take the same lane after a download into the name the board set; their sound is dropped. **No `footage/` directory and no stock cut means skip this step.**
### 3.6 Author the slides, then capture them (only on episodes that have them)

**The slides are authored here, not in the storyboard** (owner directive 2026-09-04 — slide
arts are generated images, and no image is made before approval). What arrived from the
storyboard is the plan in `visual.slide`: the kind, the `labels`, the `motionBeats`, the
`arts` list, and the `object` when the slide carries a rendered thing. Follow
[object-state-quality.md](../storyboard/references/object-state-quality.md) and [slide-authoring.md](../storyboard/references/slide-authoring.md) as guidance for plan, pixels and visual review; the operational requirements are `check-slide.js --require-all` (every registered slide file exists) and the renderer's input contract. Build in this
order.

1. **Generate `slide.arts` first** when the array is set — `slides/assets/s<shot>-<slug>.png`,
   tactile 3D illustration or photoreal 3D object, soft studio light, consistent material
   and camera, transparent background, no readable text (the host image tool under Codex/Grok, else `image_local_generate`; gpt or mlx where the plan says so). Log each call in
   `.work/cost-tally.tsv`. Sit a principle actor with `h.fig`.
2. **Author the HTML** from the matching template. Data graphs copy
   [chart-slide-template.html](../storyboard/references/chart-slide-template.html) and its two
   runtimes exactly, changing only `SLIDE_SHOT`; the values and focus beats come from scenes.js.
   Follow [chart-design.md](../storyboard/references/chart-design.md). A principle frame is a `.cast` of actors
   or actual mesh parts plus restrained arrows; kinetic `renderKinetic` puts the first art on
   group 1 then the title with `in`; type-only skips arts. An explanation slide is built on
   the studio stage to the bar of
   `docs/research/2026-09-04-rendered-object-slide/reference-slide.html`; a `slide.object` is
   rendered with the mesh lane by default ([mesh-objects.md](../storyboard/references/mesh-objects.md)),
   or baked by Blender Cycles into a sheet when `renderer:"blender"` ([blender-objects.md](../storyboard/references/blender-objects.md) — rebake with the measured `--segs`);
   existing sheet objects are baked first. Use `h.mark.arrow` for refined curved arrows.
   A flat image cannot substitute for an articulated object. Nothing is laid over a clip.
3. **Run the contract, then render the sheet.**

   ```bash
   SB=${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references
   node $SB/check-slide.js storyboard/ --require-all
   ```

   This is the `--require-all` run §1 deferred: every registered slide file now has to exist.
   `check-slide.js` fails (exit 1) only on a missing file, a template mismatch, the retired
   `treatment:"footage"` or an unknown kind/act word; its design and metadata rules print as ⚠
   warnings with exit 0, and `render-motion-slide.mjs` prints them again and keeps rendering.
   Render the key-state sheet with `render-motion-slide.mjs --sheet --png-only --keep-frames`;
   it stops only on its own input contract — timeline, statistic and principle frames must match
   every `motionBeats` primitive with the same group's `data-primitive`, since a label reveal
   cannot stand in for the promised explanation.
4. **Read the sheet yourself** — `sheet/g<k>-end.png` for the last group of every slide:
   everything the scene claims is on it, inside the zone, the ground is a plate and not a flat
   fill, and no photo with an animated rectangle stands in for a diagram (slide-design.md
   §1·§6). Re-author once if it fails. When the user asks for it, or a concrete uncertainty
   remains, review a sample of the affected `slide.kind` with `slide-reviewer`, supplying the
   scenes, narration, sheet and summary in one batch; use the reviewer’s concrete findings to improve the slide, and
   record reviewer, sample and evidence in storyboard.md. Review only changed failed samples again.
   A slide that still looks wrong after the re-author ships with the finding recorded in the build
   record and the completion report; it is not held for approval.

Then the capture: authored HTML screens get captured like any other card, and an
all-live-voice episode takes its audio from `voice/` instead of the TTS in §5. Both lanes are
in [optional-lanes.md](references/optional-lanes.md) §3.6. **No slide scene and no `voice/`
directory means skip this step.**
### 3.7 Screencast splices (only on episodes that have them)

A recorded screen spliced into a generated reel — cut, focus crop, and the splice order.
[optional-lanes.md](references/optional-lanes.md) §3.7. **No screencast in scenes.js
means skip this step.**
### 4. Capture the reveal states

Per scene, let `capture-reveals.sh` **derive the state count itself** (a person choosing how
many to shoot is how states go missing):

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/produce/references
FORMAT_ENV="$PWD/.work/format.env" \
  $REF/capture-reveals.sh <idx> "file://$PWD/.work/frame.html?i=<idx>&alpha=1&scrim=1&dim=1" .work/cards/a<idx>r 1
```

| Scene | URL parameters (reveal= excluded) | Alpha |
|---|---|---|
| **cover (code-rendered — absolute rule 10)** | `?i=n&bg=./scene-n.png&scrim=1&dim=0` | 0 |
| points (over b-roll/motion) | `?i=n&alpha=1&scrim=1&dim=1` | 1 |
| points (still background) | `?i=n&bg=./scene-n.png&scrim=1&dim=1` | 0 |
| quote (over a speaking clip) | `?i=n&alpha=1` | 1 |
| quote (static quote card) | `?i=n&bg=…&scrim=1&dim=2` | 0 |

**A motion-background scene (`visual.video`) is the table's "points (over b-roll/motion)"
row** — the alpha capture carries only the text and §6's assembly lays the video underneath.
On an illustration-mode episode, keep `&light=1` on this scene too (ink text over a
white-keyed video — the light wash comes along in the alpha capture).

**The scrim layer is off** (owner 2026-08-25 — no top/bottom gradient bars): the template
keeps the `scrim=`/`dim=` URL parameters so existing capture commands still run, but draws
nothing for them, on any scene type (the static quote card's full wash included). Text
contrast now rides on the background itself — the fill-the-frame prompt tail plus profile
§3's mood — so when a title reads dim against its band, fix the background image, not a
scrim value.

A points reveal transition is a **caption swap** — the state count is 1 (background) +
1 (title and source) + the number of captions. Bullets don't stack into a list; only the
active caption shows (absolute rule 14).

**Illustration (light) mode — line art on white, one illustration per line** (the
`img`/`imgPrompt` in scenes-schema §narration; first case 2026-08-12, dropshipping):
- Add **`&light=1`** to every capture URL — it flips the text to ink for line art on
  white. (The white band wash it used to draw went with the scrim layer — owner 2026-08-25.)
  The cover text moves to a top anchor — **generate the cover illustration with the
  character and props small in the bottom third and the top two thirds empty** (a
  middle-anchored composition puts the stat over the face).
- The per-line illustration swap is solved by the capture — no build changes (the segment
  boundary xfade crossfades the background along with it): ① run `capture-reveals.sh` with a
  single-row illustration bg to derive the state count (recorded in reveals.tsv), then
  ② reshoot only the states whose bg differs with `capture-frames.sh` and replace them
  (**put the same `FORMAT_ENV="$PWD/.work/format.env"` prefix on these too** — miss it here
  and only the replaced cards get shot in a portrait window, so sizes disagree inside one
  episode). The mapping: on cover, r1←seg ①, r2←seg ②.
  On points, r1 (title)←seg ①, and caption r k is the illustration of the segment that reads
  that caption.
- `dim=` stays inert here too (the scrim layer is off) — and brightness isn't a question
  over a white background anyway.

Overflow check: the template writes what's left over into `document.title` as `ovf=<px>`,
and a headless `--dump-dom` run reads that title back after the page script has run
[measured 2026-08-30]. Same Chrome the captures already use, no browser tooling on top.

```bash
. .work/format.env                       # URL_FMT is empty on the portrait preset
FMT=${URL_FMT:+&format=$URL_FMT}
"${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}" --headless=new \
  --disable-gpu --dump-dom "file://$PWD/.work/frame.html?i=<idx>&reveal=<last>$FMT" \
  2>/dev/null | grep -o 'ovf=[0-9]*'
```

Run it on each scene's **last** reveal state — that one carries the most text. Anything but
`ovf=0` means the zone still spills after the template's own tight1–3 shrink, so cut the copy
or push a line into the next state.

### 5. Generate the TTS

**An all-live-voice episode (`window.VOICE === "user"`) skips this whole section** — every
card's audio comes from the clips (§3.5) and `voice/` (§3.6). The style check already
ran back in the storyboard.

**Run the style check before anything gets read aloud** — its findings are editing suggestions
(rule 4). Narration passes by once with no rewind, and card text can't be fixed after publishing,
so read the three surfaces before the TTS calls.

```bash
PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
for S in narration subtitle screen; do
  node $PG/extract-text.js ./storyboard/scenes.js $S > .work/text-$S.txt || { echo "[$S] gate_exit=3 (extraction failed)"; continue; }
  python3 $PG/check-style.py --surface $S .work/text-$S.txt; GATE=$?
  echo "[$S] gate_exit=$GATE"
done
```

Read `gate_exit` as it is — 0 clean / 1 warning / 2 S1 found / 3 the checker never ran
(extraction failure, bad path) / 4 not Korean, so it declined to judge.
**Neither 3 nor 4 is a clean read.** On 3, fix the path and run again. On 4 the checker read the
text and found it isn't Korean — every rule in it is Korean-specific — so that surface is
**unchecked** and a person reads it. For English, run the tell checks listed in README and
name every unchecked surface in the completion report.
On a 1 with `quote-exempt N` in the header line, confirm that quote against research.md — a
video freezes the cards in place, so an unconfirmed quote loses its quotation
marks and gets rewritten in our own words.

**Don't add `| head` or `| sed` to shrink the output.** Add one and `$?` becomes that
command's instead of the checker's, so a FAIL with 6 S1 hits shows as `gate_exit=0`
(field-tested). If you must pipe, put `set -o pipefail` in front.

On exit 2, read each hit as a suggestion: when you take it, edit **scenes.js** (fixing only
`.work/text-*.txt` leaves it out of step with the video — scenes.js is the single source), leave
numbers and proper nouns alone, work on the grain of the sentence, and explain a change that alters
meaning; an S1 label alone does not stop the TTS calls (rule 4).

Follow [shot-speech.md](references/shot-speech.md). Resolve each explicit speaker from
SB_DOC.characters and use `speech_manage action:plan_audio` to obtain its raw TTS arguments
with the current line's acting direction. Do not replace those arguments with a generic
character stylePrompt. Store stable line ids,
generation receipts and audio hashes with `speech_manage`. Keep raw API arguments in
voiceSettings; declare text language separately when the API auto-detects it. No automatic
listening, STT, scores, retry-to-pass loop or human listening approval runs by default;
an explicitly requested review/improvement loop may inspect actual media and report findings.

A shot may contain several speakers. Keep each line's speaker, pinned voice and receipt;
use the shared composer to place their takes in performance order. Cut on the scene's
staging or a real adapter constraint, not on every speaker change.
Use WAV, preserve the selected voice and speed, and resample differing sample rates before
assembly. The current builder cannot concatenate MP3 as PCM. Keep speech at speed 1 unless
the user requested another speed under [tts-speed.md](references/tts-speed.md).
Generate each stable line as a take; combine consecutive lines into the scene WAV and record
its ordered lineIds, expectedText and actual audioSha256. For single-line shots, use the bound
WAV directly when no reaction padding or independent action is planned. For directed,
multi-line or action-bearing scenes, attach all line audio first; build-reel invokes
[compose-speech.js](references/compose-speech.js) to place measured speech and ordered action
intervals on one timeline. New boards carry `SB_DOC.performanceTimingVersion:1` and need
finite independent-action timing before composition. Optional subtitle sidecars align to
measured speech intervals; the video stays clean. Run that
same composer before audio-conditioned video generation so video uses the padded WAV. Subtitle timing follows the
actual WAV; file and timing checks do not listen.
Keep ElevenLabs seed, stability and pronunciation dictionaries fixed across retakes when
pinned. Never switch engines silently after an API failure.
For v4 request sizing, language codes, IPA and optional continuity/clone/logging controls,
follow [ElevenLabs v4](../_shared/elevenlabs-v4.md). Preserve the returned request ID for
later targeted retakes; `timestamps:true` also saves it in the alignment sidecar.

Once the whole scene is out, write a line to the ledger. **The quantity is chars÷1000, not
the character count** — the unit price is per 1,000 characters, so writing 412 characters as
`412` inflates it 1000×. An incorrect unit produces a wrong billing figure. A regenerated scene gets one more line
for its share.

```bash
# on a Gemini channel, use the key for the model (flash by default)
printf 'tts.gemini-flash\t1.840\tproduce: narration, 5 scenes, 1840 chars\n' >> .work/cost-tally.tsv
# on an ElevenLabs channel the quantity is the response's "Character cost" ÷ 1000 (the vendor's
# metered count — it sits below the raw character count, measured), key by model family
printf 'tts.elevenlabs\t1.120\tproduce: narration, 5 scenes, character cost 1120\n' >> .work/cost-tally.tsv
```

A Gemini or ElevenLabs key, permission, quota, or output-format error stops generation
and reports the actual cause; never silently fall back to another engine or older model.
ElevenLabs speech uses `eleven_v4` only. Local TTS engines are removed.

### 6. Write the manifest + build

Convert `.work/cards.tsv` and `segs.tsv` from scenes.js (tab-separated, outro excluded).
The builder runs `verify-build-plan.js` against the source storyboard before any encoding:
full scene/story checks, required slides and exact card order must pass. It writes
`.work/build-plan-check.json` with the plugin version and input hashes. Slide clips need the
renderer's `render-proof.json`; stale sources, replaced clips and changed segment narration fail.
The final pace pass also checks total length after planned b-roll inserts. There is no
skip flag and no cached PASS file. Do not replace the builder with an episode-specific
assembly script. Any opening belongs in SCENES; no separate PRELUDE is accepted.

Manifest columns:

```
cards.tsv : idx <TAB> absolute audio path <TAB> target chars/sec <TAB> zoom(in|out|auto|none|punch|hold) [<TAB> options]
segs.tsv  : idx <TAB> seg (0-based) <TAB> visual <TAB> tts sentence <TAB> sub sentence
sfx.tsv   : idx <TAB> seg <TAB> audio file <TAB> bgm(on|off) [<TAB> shot offset <TAB> separation LU] (optional)
bgm.tsv   : idx <TAB> audio file — the music cue changes at that card (optional)
amb.tsv   : idx <TAB> audio file | - — room tone starts at that card and holds; "-" ends it (optional); silence.tsv: idx <TAB> shot start <TAB> shot end <TAB> music (optional)
chapters.tsv : idx of the chapter's first card <TAB> chapter title    (long-form)
```

**Column 4 is the still-image camera move.** All motion is eased (smoothstep) — a
constant-speed ramp starts and stops like a machine; the ease is what reads as an operated
camera (`KB_EASE=linear` restores the old ramp). `auto` alternates in/out card to card.

| zoom | What | When |
|---|---|---|
| `in` / `out` / `auto` | eased zoom over the whole card — `span=` when written, else, **on a still card**, `KB_RATE` 4%/s × card seconds capped at a 1.075 total scale (`KB_ZMAX`, where the card's baked text still stops above the subtitle band). A card holding a clip keeps the 3.5% floor — the clip already moves | the default — `auto` unless the scene says otherwise |
| `punch` | 3.5% lands in the first 0.4s (ease-out), then keeps creeping to the card's span by the cut — never a frozen tail | the cover card — the hook contract wants movement inside 0–3s |
| `hold` | fixed scale, no zoom motion | the base for `drift=1` (pure handheld) or a `pan=` travel — not alone on a still: the build warns on a frozen still card and continues (a planned `motionIntent: intentional_still` is named in the warning) |
| `none` | no Ken Burns at all, source untouched | **a filmed clip already moves** — a zoom on top shakes the frame. Filmed cards are usually `none` + `sync=1`. Not on a still card — the build warns and continues (a planned `intentional_still` is named) |

**The 5th cards.tsv column (options) is `k=v,k=v`.** It's optional; existing 4-column files keep working. Two-value options use `:` inside the value — `,` stays the k=v separator.

| Option | What | When |
|---|---|---|
| `sync=1` | turns off preroll, silence trim, and speed correction entirely. Normalization only | **live voice on a filmed scene** — any one of the three throws mouth and sound out of step |
| `subs=<tsv>` | appends file subtitles to automatic cues (`start<TAB>end<TAB>sentence`, seconds from the card's start); paths resolve from `.work/` | legacy transcript subtitles; omit automatic sub text only if the source scenes also omit it |
| `subs-mode=replace` | with `subs=<tsv>`, replaces automatic cues in both SRT and ASS with checked sentence rows, including when `SUB_MODE=word` or `phrase` | reviewed timings for existing narration; `append` is the default; see [explicit-subtitles.md](references/explicit-subtitles.md) |
| `pan=<direction>[:scale]` | Ken Burns as a travel instead of a centre zoom (`l2r`·`r2l`·`u2d`·`d2u` + diagonals `tl2br`·`br2tl`·`tr2bl`·`bl2tr`). Column 4 `in`/`out` layers a zoom drift over the travel (the classic pan+zoom); `auto` keeps the scale fixed | scenery and wide sources. Travel = width × (scale−1) ≈ 130px at the default 1.12 — measured on portrait too, so the old landscape-only advice is dead |
| `focus=fx:fy` | zoom towards this normalized point instead of the centre (0.5:0.5 = centre). The far side of the frame shifts up to 2× the centre case — pipeline.md has the numbers | the scene has one subject and it isn't centred — the zoom should arrive at the subject, not at the frame's middle |
| `drift=1` | handheld micro-drift — two non-integer-ratio sines wobble the window a few pixels. Composes with `in`/`out`/`punch` (adds a 1.04 base scale) or `hold` (pure handheld) | presence, unease, cutting the AI look — the still counterpart of the `handheld` row in directing-grammar §4 |
| `span=<0..1.5>` | this card's total zoom span, replacing the global `ZOOM_SPAN` (0.4 = the window grows 40% over the card). Applies to `in`/`out`/`punch` and the pan zoom drift; unused on `hold`/`none` | a still whose beat wants a visible move — computed from the storyboard's `speed` word (below). Past base+`span` > `ZOOM_BASE`/canvas (base: pan scale · drift 1.04 · else 1; headroom 0.5 at the defaults) the source upscales and the build warns: raise `ZOOM_BASE` and generate the scene image at that resolution |
| `ease=smooth\|linear\|in` | this card's easing, replacing the global `KB_EASE`. `in` accelerates — an unnoticed start, fastest exactly at the cut | the ladder's accelerating rows (action/tension, CTA) — pairs with cutting away at the peak. `punch` keeps its own ease-out ramp and ignores `ease=` |
| `enter=jcut` | next voice leads while the outgoing footage continues moving (default 0.24s) | source `transition: "jcut"` |
| `enter=cut` | immediate picture cut, zero added pre-roll | source `transition: "cut"` |
| `enter=dissolve` | moving outgoing footage dissolves over the incoming picture (0.40s) | source `transition: "dissolve"` |
| `enter=push:<dir>` / `whip:<dir>` | moving footage travels off in l2r, r2l, u2d or d2u (0.32s / 0.24s) | same source transition |
| `enter=iris` / `blur` / `zoom` | live outgoing footage opens, blurs or grows away (0.40s / 0.40s / 0.32s) | same source transition |
| `enter=black` / `white` | paired outgoing/incoming fades for a chapter break | source `transition: "dip"` / `"dip:white"`; compiler supplies both halves |

Read [cinematic-edit.md](references/cinematic-edit.md) before preparing video assets or
assembling an episode. It defines source in-points, moving handles, narration margins and
boundary review. `transition` and `edit` in scenes.js own the edit. The builder automatically
compiles them into `cards.resolved.tsv`; a contradictory explicit card option blocks assembly.
Do not hand-copy joins or use a separate concatenation exporter for delivery.

Use `edit.in` to select the source-video start, `edit.pre`/`post` for breathing room and
`edit.transitionSeconds` for a moving join's duration. Defaults are zero pre-roll and 0.12s
post-roll (dip pre-roll is 0.30s); sync footage keeps its original timing. The default minimum
card duration is zero. A moving transition reserves actual unseen frames from the outgoing
source; include this handle in generated duration and approved cost. Missing handles block
assembly instead of looping, freezing or silently changing the transition.

Every newly planned boundary records `edit.reason` and `edit.continuity`. Choose cuts from
action, gaze, geography and voice rhythm; do not cycle effects or blanket-assign hard cuts.
After assembly, inspect `edit-check.json`, play every `work/seams/` excerpt with sound and
record observations in `edit-review.md` with the final master hash. The machine checks frame
counts and applied joins; the review checks whether the edit actually feels continuous.

**Legacy sidecar styling — `SUB_MODE=word|phrase` and the `SUB_*` variables.** They shape only the ASS layout of a
requested `SUB=1` sidecar (the word/phrase grammar measured in docs/research 2026-08-29 and 2026-09-02); nothing is burned, and the SRT keeps whole sentences.

**The still move comes from the storyboard, not from taste.** A still's
`visual.camera.movement` (when the storyboard wrote one — directing-grammar §5's Still
column is where it picks) maps onto column 4/5 like this: `dolly in`/`zoom in` → `in` (add
`focus=` at the subject when it isn't centred), `dolly out` → `out`, `handheld` → `hold` +
`drift=1`, `truck`/pan wording → `pan=<dir>`, and the cover card takes `punch`. A still with
no camera written stays `auto` — most cards should. `static` or `hold` on a still is not a
move — the least a still gets is `hold` + `drift=1`, and `build-reel.sh` warns on a still card
written `none` or a bare `hold` and continues (a still sitting frozen under the voice is a board
defect to fix — owner directive 2026-09-03, guidance since 2026-10-16 — unless the cut is a planned
`motionIntent: intentional_still`, motion-production.md, which the warning names). The same restraint as generated video:
the move supports the scene's feel, it doesn't decorate it.

**The still's `speed` word sets the size of the move.** The beat→rate ladder is
directing-grammar §4 (still lane) — `very slow`/`slow`/`fast`/`very fast` rows, with the two
fast rows adding `ease=in` and the CTA row aiming `focus=` at the face. Convert the row to
the card knob as **`span` = rate × card seconds**, reading the seconds from the finished
narration wav (`ffprobe`), not the character estimate; PRE/POST margins make the rate
approximate and the ladder's wide spacing absorbs that. Example: a 9s payoff card on the
`slow` row → `span=0.54`. A still whose camera has no `speed` (or no camera at all) takes
the builder default — the observe row (4%/s) over the card, capped at a 1.075 total scale; on
a card of 2 seconds or more that is a 7.5% push, more than twice the old 3.5%.

**A slide scene's segment visuals** are the per-group clips from §3.6, one per segment,
each with the play-once prefix: segment k → `@motion/slide-s<shot number>/r<k>.mp4`
(segs.tsv paths are relative to `.work/`, the builder's working directory — the same way
the state PNGs are written `cards/a<idx>r<k>.png`), `zoom` `none`, no overlay (the slide
draws its own text). `@` is right here even though
the scene has several segments, because every segment has **its own** clip — clip k opens
on the previous rest state and sustains its authored motion for the measured window, so the
reveal xfade can cross matching compositions and the
motion starts inside the pause before the sentence, where the caption contract already
puts the reveal. A sub-reveal (`A|B`) takes two clips in one segment the same way
(`@motion/slide-s5/r2.mp4|@motion/slide-s5/r3.mp4`); declare that segment's
`revealGroups:[2,3]` in narration so the input checker can bind both clips.

```
# a motion-slide card (idx 4, three segments) — cards.tsv and segs.tsv
4	pcm/s5.wav	5.2	none	enter=jcut
4	0	@motion/slide-s5/r1.mp4	큰 조각 하나에만 톱니바퀴가 27개예요.	큰 조각 하나에만 톱니바퀴가 27개예요.
4	1	@motion/slide-s5/r2.mp4	전체로는 30개가 남았고요.	전체로는 30개가 남았고요.
4	2	@motion/slide-s5/r3.mp4	원래는 37개였을 거라고 봐요.	원래는 37개였을 거라고 봐요.
```

A `sync` card's audio is **the wav pulled from that clip** (§3.5). The card's length is that
audio's length, so if one came from the original mov and the other from the normalized file,
the picture slips by exactly that difference.

**The segment visual for a filmed scene** is
`@.work/footage/<name>.mov::.work/cards/a<idx>.png` — play the clip once from its first frame
(`@`) with the scene's alpha PNG over it; that PNG carries no lettering (nothing is typed over a
moving picture, so a filmed scene's text fields stay empty) and exists for the manifest shape. A live-voice scene has one segment, so `@` is
right; when a narration-covering scene has several segments, drop the `@` and repeat the same
path (the builder joins the playback with `-ss`).

The visual column: a state PNG / `video.mp4::overlay.png` (cover, speaking, motion
background) / `A|B` (sub-reveals — even a sentence that reads several bullets together brings
them on screen one at a time). **A motion-background scene**'s segment visual is
`.work/motion/motion-i<idx>.mp4::statePNG` (the alpha capture) — with several segments,
repeat the same video path (the builder joins the playback with `-ss`, pulled forward by the
xfade offset).

**The `@` prefix starts an independent reveal clip at its source in-point.** Use it for one
clip per segment. When one continuous video spans several segments, omit `@` and repeat its
path so the source offset advances with the timeline. Every source must cover its window
and any outgoing handle; the builder rejects short sources instead of looping or freezing.
Check that the intended action finishes at the chosen cut point.

**`sfx.tsv` = sound that plays only in that segment's stretch**. The audio file can be a wav
or an mp4 (for a video, its sound is used), and leaving it blank with only `bgm` set to `off`
drops just the music across that stretch. The timing reference is **when that visual
appears**, not the sentence boundary — xfade starts playing the later input's 0-second mark at
the offset, so aligning to the boundary puts the sound three or four syllables ahead of the
picture. Ducking is keyed on the voice alone, so an effect doesn't push the BGM down. Each
effect is measured and gained so its loudest moment sits `SFX_SEP` LU (6 by default) under the
narration, and the BGM cut ramp is `BGM_GATE_R` (0.30s by default).
**Room tone (`amb.tsv`)** — `idx <TAB> audio file`, the room starting at that card and holding
until the next row; a `-` in the file column ends it. Rendered by `bgm-bed.sh` like the music
bed, gained to `AMB_SEP` LU (15 by default) under the narration, never ducked.

**Music cues (`bgm.tsv`)** — `idx <TAB> audio file`, the bed changing at that card and staying
until the next row. `idx` is the 0-based card idx. A row for card 0 overrides `bgm.wav` as the
opening bed; without one, `bgm.wav` opens — and `bgm.wav` must exist either way (the builder
checks for it before anything else). Cue changes crossfade over `BGM_CUE_XF` (2.0s), landing the incoming cue on the card start.
Every cue is measured and gained to the same distance under the narration, so cues recorded at
different levels don't step up and down.

**Chapters (long-form)** — attach scenes.js's `chapter` string to that shot's card idx.
Don't write timestamps. The builder makes them from the measured times and checks YouTube's
three requirements (first chapter at 0:00 · 3 or more · at least `10 × SPEED` seconds apart —
10s at the 1.0 default, because the boundary has to still clear 10s after §7.5), and
**stops there** if any is broken.

```bash
# scenes.js array index = card idx (0-based). Use the shared evaluator, as format-resolve does.
node -e '
const fs=require("fs"),{evaluateWindowScript}=require("./skills/_shared/scenes-vm.js");
const win=evaluateWindowScript(fs.readFileSync("storyboard/scenes.js","utf8"));
(win.SCENES||[]).forEach((s,i)=>{ if(s.chapter) console.log(i+"\t"+s.chapter); });
' > .work/chapters.tsv
```

**`OUTRO=0` skips this step** — a short-form-only channel that ships without one, where
`── no outro (OUTRO=0 …)` is the expected report line and there may be no outro asset to resolve.
Long-form never lands here: the flag is 1 whatever `shortform_outro` says (§1). Otherwise copy the
outro chosen from the catalog **under exactly the name in
`format.env`'s `OUTRO_ASSET`** — landscape is `outro-16x9.mp4`, so leaving it as `outro.mp4` means
the builder can't find it, and under `OUTRO=1` that stops the build instead of passing as one line
in the report. Use the platform's id (`youtube`·`instagram`) if you know it, `default` if you
don't; the resolved path goes to `$OUTRO_SRC` — `$OUTRO` is the flag.

```bash
ASSET=${CLAUDE_PLUGIN_ROOT}/skills/channel/references/resolve-asset.py
. .work/format.env                      # read OUTRO_ASSET and OUTRO
if [ "$OUTRO" = 1 ]; then                # the flag first — with it 0 there may be no asset to find
  OUTRO_SRC=$(python3 "$ASSET" data/<channel> outro "${PLATFORM:-default}") \
    || OUTRO_SRC=$(python3 "$ASSET" data/<channel> outro default)
  cp "$OUTRO_SRC" ".work/${OUTRO_ASSET}"
fi
# if there isn't one, generate it once with build-outro.sh → save as assets/outro/default.mp4
#   python3 "$ASSET" --ensure data/<channel> outro default outro/default.mp4
if [ -d data/<channel>/assets/fonts ]; then
  mkdir -p .work/fonts
  cp data/<channel>/assets/fonts/*.[to]tf .work/fonts/ 2>/dev/null || true
fi
```

resolve finds an old `assets/outro.mp4` too. For the fonts of a requested subtitle sidecar's
ASS styling (nothing is burned), copy the ttf files from
`assets/fonts/` into `.work/fonts/` (woff2 won't work — without them the fontconfig fallback
still gets you publish quality).

The third column of `sfx.tsv` is a file path or a catalog id. With just an id, resolve it with
`python3 "$ASSET" data/<channel> sfx <id>`. A generated effect is already there by this point — §3's SFX step
made it from `window.SFX` and registered it — so an id that fails to resolve here is a step
that was skipped, not a file to invent.

```bash
$REF/build-reel.sh .work storyboard/    # → subtitle-free reel.mp4 · cover.jpg · build-report.txt; optional sidecar with SUB=1
```

**Deliver the clean master on every platform.** No burned-in variant is required or
selected. If separate YouTube subtitles are requested, generate an SRT sidecar with
`SUB=1`; it never becomes pixels or an embedded subtitle stream in the video. Upload
that track separately when publishing to YouTube. Do not infer a subtitle request
from a legacy profile, a stale SRT or the presence of a `reel-sub` file.

#### Splicing in the b-roll (when §3 made one — inside the approved channel cap)

The procedure — trim + loudness + bed per slot in one re-encode, then the splice at each
slot's `after` scene — is [broll-splice.md](references/broll-splice.md). It runs after
the build finishes and before §7; the builder only splices the outro.

### 7. Read the build report

Read `build-report.txt` and rule on it — **drift has to be 0.0000s**, and `missing reveal state` /
`last reveal state unused` mean don't proceed. The line-by-line table is in
`references/pipeline.md` §Build report gate table; its speech-rate and first-cue rows apply only
when an SRT sidecar was requested, and its review rows are evidence, not holds. Total length: the channel's band
(`length_min_seconds`/`length_max_seconds`); unset, the preset's 35–120s stands, of which 35–75s is
the recommendation, and 180s is the platform's own cap — **measured after the §7.5 speed pass**,
which is the file that ships. Confirm that `cover.jpg` is a frame where the hero number has
already appeared, and if it isn't, set `COVER_TS` past the report's cover-transition-complete
time and rebuild (or re-extract the still with ffmpeg).

### 7.5 Speed pass (required — every episode)

**Human request gate:** follow [tts-speed.md](references/tts-speed.md) for synthesis,
saved narration and final playback. Default to 1.0 even when the profile says otherwise.
Never invent approval or change speed to satisfy a duration or quality target.

The final pace pass exists so every source — narration, generated clips, filmed clips, any requested
subtitle sidecar, and chapters — follows one timeline after the build and any splice. It always runs even at 1.0x.
The builder has trimmed and loudness-normalized card speech at the engine's own pace; this pass
is the only tempo change the voice goes through.

```bash
$REF/speedup.sh .work        # → .work/reel-fast.mp4 · optional subs-fast.srt · chapters-fast.txt
$REF/speedup.sh .work 1.2    # only with an explicit user request for final x1.2 in .work/speed-authorization.json
```

- **The default is 1.0x.** An explicit user request may choose another factor for the whole feature — narration,
  cards, filmed clips, b-roll, and BGM — and, when an SRT sidecar was requested, the final speech-rate
  check on the retimed cues still has to pass. At `1.0`, the pass copies the build through under the `-fast` names.
- **The outro stays at 1.0x.** It's a brand asset with its own cut and sonic logo, so the pass finds
  the boundary from the outro file's own duration and rejoins the tail untouched. Under `OUTRO=0`
  there is no tail: `no outro tail (OUTRO=0)` is the right result there, not a dropped splice.
- **A requested subtitle sidecar and the chapters are retimed by the pass** (`subs-fast.srt`, `chapters-fast.txt`) —
  don't hand the build's `subs.srt` to publish; those cues belong to the un-sped timeline.
- **It reads the un-sped files and writes new names**, so running it again with another factor
  recomputes from the original instead of stacking passes.
- **The factor moves the writing-stage band too.** With a requested SRT sidecar the 6.2 characters/s check measures the *sped-up*
  cues, so a card written at `r` ships at `r × factor`. `build-reel.sh` divides its whole
  `[3.2, 6.2]` band by the same `SPEED` and warns outside it — **[3.2, 6.2] at the 1.0x default**. Read that
  band as an early warning, not the check itself: the builder counts the TTS script over the
  trimmed card audio, while the pass counts the sidecar text over cue time,
  so the two numbers differ by design. Its chapter minimum becomes `10 × factor` so a boundary still
  clears 10s on the shipped file. The build does not stretch a card toward the target rate
  (assembly is fixed at 1.0x and ignores legacy `ATEMPO_MIN`/`ATEMPO_MAX` settings), so this pass is the only tempo change the voice goes through, and the factor
  has to clear the check on the engine's own pace. If the rate fails, shorten the script
  or report the failure; never change speed without the user's explicit request.
- **A profile alone does not authorize speed changes.** Both synthesis and final playback
  stay at 1.0 without the matching episode request record. When both are authorized,
  their factors multiply and a requested final SRT must pass the rate check.
- The pass appends its own line to `build-report.txt` (`── speedup x1.00: passed through …` at the
  default; a user-requested 1.2x prints `── speedup x1.20 (reel.mp4): 62.0s → 52.2s (feature …)`),
  with a requested sidecar also reports the shipped timeline's opening cue (`── first cue …s`, a ⚠ past 1.0s) and saves the t=0 still in
  `.work/qa/first-frame.png`, and exits 1 when the measured length doesn't match feature/factor +
  tail or, with a sidecar, `check-final-speech-rate.py` finds more than 6.2 characters/s. **The default
  clean build is ready when the `── speedup x…` marker is in `build-report.txt` and `delivery-proof.json`
  verifies.** The speech-rate verdict is a `PASS final speech rate` line, or the skip marker
  `── no subtitle sidecar requested; subtitle-based rate check skipped` when no SRT was requested;
  `episode-state.js` accepts either.
- **Length contracts are read after the pass.** The channel's band — unset, the preset's 35–120s — describes the shipped file.
- With chapters, watch for the `⚠ … under 10s` line in `build-report.txt` — at a user-requested 1.2x a boundary
  that was 10s apart comes out 8.3s and YouTube drops the whole chapter list. `build-reel.sh` now
  demands `10 × factor` up front, so this only fires on a build made before that. Merge those
  chapters and rebuild.

### 8. Phone-mode QA guidance

Run retention-direction.md §5 on the final video and save `.work/experience-review.md` for §10's reviewer. Frame and motion checks verify layout, timing and payoff. Speech stays not_reviewed and does not create a listening or approval hold.

Copy `reel-qa.html` into `.work/` and shoot it **on a phone viewport with the platform UI
overlay**, again with the headless Chrome the captures use. `?frame=1` draws the 390×844
mockup, and a 470×920 window holds the whole phone including the right action rail
[measured 2026-08-30]; `?t=` seeks, and the header line reports the time it landed on.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/produce/references
# FORMAT_ENV is cleared on purpose — the script sources it and would put CAP_W back
# to 1080. The QA harness is a phone mockup, not a 1080×1920 frame.
FORMAT_ENV= CAP_W=470 CAP_H=920 $REF/capture-frames.sh \
  "file://$PWD/.work/reel-qa.html?v=./reel-fast.mp4&ui=ig&fit=crop&zone=1&frame=1&t=<sec>" \
  .work/qa/s<n>.png
```

One shot per scene at the reveal-complete moment, plus one at `&t=0` — a cover's reveal-complete
frame is not its first (with a requested sidecar the pass already saved that moment as `.work/qa/first-frame.png`). Then
read the PNGs. **QA runs on the clean final `reel-fast.mp4` that ships.** Check that
speech clips have no subtitles, captions or accidental typography at any point.
Inspect framing, action bar intrusion, clipping and whether the first frame establishes
the topic. Also check
**whether the background photo shows through the middle of the frame** (a box or dim outside the
bands is the slide look — a violation of absolute rule 14). On a problem: fix the template →
regenerate frame.html → recapture only that state → rebuild.

### 9. Write the per-platform text

**Don't write the first sentence straight away — jot down 3 or 4 entry points first** —
something that happened, a number, a question turned back, a described scene. Write without
doing that and the model converges on the safest opening every time, so the copy passes the
gate episode after episode while the channel feed sounds like one voice throughout. The
evidence grade is low (an English-language creative-writing preprint, 1.6–2.1× diversity —
`korean-style.md` §Evidence grades).

Read the platform-guide playbook
(`../platform-guide/references/platform-playbook.md`) and rewrite per platform — a short Threads
body in casual (반말) spoken register carrying one judgment of ours (§3) + the video link on the last line / an IG caption with a hook in
the first 125 characters and a save CTA / an FB structured body plus the first-comment link copy /
YouTube in the playbook §6 contract — one spoken sentence for the title with the topic noun in its
first half, a description whose first line is a second hook in different words, and `meta.md` in
the §6 layout (`## title` · `## description` · `## tags` · `## publish`; nothing else parses).
**The provocation in the title and first line continues the cover `hookType` in scenes.js** (fear,
empathy, curiosity, showing the ending first) — a video that opened on fear under a YT title
explaining a method sets an expectation the first 30 seconds don't meet (playbook §1 ②·§6).
Continuity applies to the stimulus, not to the outcome — playbook §2 governs the title and
description whatever the cover's hookType is. **The result stays inside the video** (playbook §2)
— the title, the description and the IG caption name the subject and withhold the tally, the
winner, the twist and the payoff number; a description that walks the episode in order, or whose
main clauses are summary verbs (살펴봅니다 · 확인해요 · 정리했습니다), is report voice, not a hook. Before
saving, read the title and the description alone with scenes.js closed and write one line — what
do I now know about the ending? If that line names it, rewrite. **Credits for stock material**: every `visual.license` on the board with `attributionRequired: true` goes under a `출처` line at the end of the YouTube description and of the IG and FB captions (`attribution` verbatim, one per line); add the same line for a Pexels, Pixabay or government file when the author is known. Then the two machine checks, right after saving:
```bash
PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
for P in threads:output/threads/post.md ig:output/instagram/caption.md \
         fb:output/facebook/post.md yt:output/youtube/meta.md; do
  python3 $PG/check-style.py --surface ${P%%:*} ${P#*:}; echo "[${P%%:*}] gate_exit=$?"
done
node $PG/check-meta.js output/youtube/meta.md; echo "[meta] exit=$?"   # layout · title limits · preset hashtags · summary voice · verbatim COMPREHENSION.answer
python3 $PG/check-batch.py ../*/output/threads/post.md   # ranking only across the channel's episodes — a recycled phrase gets rewritten
```

Exit codes read as in §5; `check-meta.js` exit 2 is fixed and rerun like an S1. Its 0 means
"layout and verbatim leak clean" — a paraphrased result is what the blind read above and the
§10 reviewer catch (the reviewer reads meta.md before it opens scenes.js for that reason).
**Threads doesn't get
a cover image attached** — the link preview card takes that spot, so `post.md` holds the body
and the link URL only. The link slot is the IG reels permalink, whose value isn't known until
publish time — leave a placeholder like `<IG_REELS_URL>` in `post.md` and let publish fill in
the real URL. Save each under `output/<platform>/`, and finalize the video and cover with
`cp .work/reel-fast.mp4 output/video/video.mp4` ·
`cp .work/cover.jpg output/video/cover.jpg` ·
`cp .work/build-report.txt output/video/` ·
`cp .work/delivery-proof.json output/video/` (publish checks the final files against these
hashes; an ad hoc export or stale copy cannot substitute for the checked assembly).
**The `-fast` files are the deliverables** (§7.5) — copy `reel.mp4` or `subs.srt` here and the
episode ships at the wrong pace. Copy `subs-fast.srt` to `subs.srt` only for a requested separate YouTube track. On a long-form episode the chapter
file goes over under its published name too: `cp .work/chapters-fast.txt output/video/chapters.txt`
(publish reads `output/video/chapters.txt`, so leaving the build's original there ships the
pre-speed timestamps).
**All platforms receive the same subtitle-free `video.mp4`.** A stale
`video-sub.mp4` is never selected. Separate YouTube caption tracks are optional and
require the user's request; language defaults alone do not enable them. Preserve
source dialogue and timing for such a future request.

### 10. Completion report

When the user asks for an independent read, or a concrete issue needs one, delegate artifact verification to the content-reviewer agent (Agent) — hand over video frame
screenshots (**taken from the clean final `reel-fast.mp4`**; verify no accidental subtitles or typography), the per-platform copy, scenes.js, §8's `.work/experience-review.md`,
`build-report.txt` and the storyboard's hand-to-produce table (the reviewer's P0-11 needs all three), and get back P0
detections (typos, clipping, factual mismatch, platform taboos, copy-pasted sentences,
unexplained jargon, AI tells, a result given away in the title or description) and axis scores.
Pass the `check-style.py` path along with the
exit codes and quote-exemption counts from §5 and §9 (the `check-meta.js` exit too) in the
delegation prompt — the reviewer
treats those numbers as the source of truth and doesn't override them with its own impression.
If the channel skips research, state that in the delegation prompt too (the reviewer scores copy
out of 85 and rescales the tail to 100).
Use an independent read when it can resolve a concrete issue. Apply useful
findings within scope and report unresolved limitations. Scores, review counts
and missing reviews do not require another approval or prevent authorized work.

**First-3-seconds check** (2026-08-15, forced by the measured skip rates — the author's own read, not the reviewer's):

- [ ] Actually **watch** the 0–3s opening (and `.work/qa/first-frame.png` when the pass saved one) — a real subject or movement
      in the first frame, not a title card holding still
- [ ] If the user requests speech review, listen to the relevant segment and
      make targeted corrections within the authorized budget. Otherwise record
      `not_reviewed`; do not automatically regenerate speech for a quality score.

**Cost totals (required)** — turn the episode ledger into a report and put the result in the
completion report. Storyboard images through this video sit in one file, so this is where a
person sees what the episode cost, first and last. Run it the same way on the shooting-edit
(screencast) path — generation calls are rare there and the total may be near 0, but 0 being
the counted result is itself information.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
$REF/cost-report.sh .work/cost-tally.tsv > output/video/cost-report.txt; echo "cost_exit=$?"
cat output/video/cost-report.txt
```

**Check the hand-written tally against what the server recorded first.** The MCP server writes
`.work/events.jsonl` on every generation call by itself, so it catches the lines a session
ending mid-run never got to write.

```bash
node $REF/events-to-tally.js .        # exit 1 = the tally is short
node $REF/events-to-tally.js . --tsv >> .work/cost-tally.tsv   # append what was missing
```

ElevenLabs and Lyria RealTime come back unpriced there on purpose — the server can't see the
metered character count or an unpublished unit price, so those stay hand-written.

Read `cost_exit` as it is (the verdict's source of truth is
[cost-tally.md](../autoproduce/references/cost-tally.md) §Reading exit codes).

- **0** — the total is that episode's cost.
- **1** — copy the `!!` lines into the report verbatim. On `unknown key`, fix the key name and
  rerun; on `price unconfirmed` (currently just BGM), append **"1 item excluded from the
  total"** after the total. **Never read 1 as a pass.**
- **3** — there's no ledger. Confirm that this episode really made no generation calls, and if
  it did, count the files, backfill the ledger, and say in the report that you backfilled it.

The report shows **the stage together with the item** — what the user wants to know isn't only
the total but where it went. The `storyboard:` / `produce:` prefixes in the ledger memos make
that split.

```
Cost — what this episode ran to (stills → video)
  produce      6 stills (gpt high 2 · local 4)              $0.44
    · of which 1 regenerated (§1.5 remake)                   $0.22
               b-roll veo lite 1080p, 8s generated          $0.64
               narration 1,840 chars (local)                $0.00
               BGM 90s                                      excluded — unit price unconfirmed
  ────────────────────────────────────────────────────────────
  total                                                     $1.08  (+ 1 item excluded)
  forecast (.work/cost-forecast.tsv, the storyboard's projection)  $0.98 — say when the gap is over 20%
  full report: output/video/cost-report.txt
```

**Don't just report a total of $0.** If the images exist and the total is 0, they weren't made
for free — someone skipped writing them into the ledger. An episode that used only local
local images really can be 0, and then the report shows those lines — check whether
the 0 comes from lines that are there or lines that are missing, then report it.

**Read the decision log back beside the cost.** The two answer one question together — what it
cost, and why it cost that.

```bash
$REF/decisions.sh .work/decisions.tsv        # exit 1 means a bad line, not "no decisions"
```

Report every `fallback` and each `engine_selection` or `voice_selection` marked `revised`, so the user can see where production differs from the approved plan.

When the report is written, update storyboard.md to `status: produced`, present the artifact table (paths,
length, platforms) together with the cost summary, and point the user at
`/social-flow:publish`.

## Additional Resources

### Reference Files

- **`references/pipeline.md`** — build contract · build-report line table · the three TTS failure shapes · palindrome loop · collected field-tested pitfalls
- **`references/screencast-pipeline.md`** — the shooting-edit path: edit.json contract · edit procedure · gates · pitfalls (replaces §2–7 when alignment.json exists)
- **`references/build-screencast.sh`** — the shooting-edit builder (scene cut → crop → 9:16 clean composite → BGM ducking → outro, drift 0)
- **`references/cut-screencast.sh`** — the screencast-splice cutter (§3.7): one window of a screen recording → focus crop → fit onto the canvas over `THEME.ink`, warning when the picture shrinks past legibility or the clip outruns its card. One card inside an ordinary episode, not a whole-episode mode
- **`references/screencast-overlay.html`** — scene title alpha overlay renderer (top block y 190–460, scenes.js injected)
- **`references/video-template.html`** — 1080×1920 scene renderer (THEME injection · reveal · alpha · safe zone · overflow guard)
- **`references/build-reel.sh`** — the compositing pipeline SoT (silence trim → loudnorm → boundary detection → reveal xfade → Ken Burns → optional SRT sidecar → outro splice)
- **`references/broll-splice.md`** — the b-roll splice: per-slot trim + loudness + bed in one re-encode, then the insert at each `after` scene (§6)
- **`references/check-clip-artifacts.js`** — what a returned clip brought back that nobody asked for: burned text (OCR, one frame a second), a soundtrack on a clip planned silent, a spoken line (local ASR); `--selftest` renders its own fixtures. Findings are warnings fixed within the authorization (§3)
- **`references/bgm-bed.sh`** — renders the music bed the mix lays under the voice: every cue measured and gained to one distance under the narration, a short cue crossfaded onto itself instead of butt-joined, cue changes crossfaded. Called by both builders and by the b-roll premix
- **`references/bgm-scoring.md`** — where the bed's numbers come from, which of them are published listening tests and which are our own practice, and the widely-quoted figures that failed verification
- **`references/build-outro.sh`** — generates the channel's shared outro
- **`references/speedup.sh`** — the required final pace pass (§7.5). Uses 1.0 unless the episode has an explicit user request for another factor while leaving the outro at 1.0x, retimes a requested `subs.srt` and `chapters.txt`, verifies the measured length, and writes the speech-rate verdict — a PASS line, or the skip marker when no SRT was requested (a requested sidecar over 6.2 characters/s fails). Reads the pre-pass set and writes `-fast` names, so it never stacks
- **`references/check-final-speech-rate.py`** — (requested sidecar only) measures Unicode letters and numbers on `subs-fast.srt`; catches a whole-video speed factor that made otherwise valid cards too dense to follow
- **`references/splice-clip.sh`** — post-build clip insertion (b-roll up to 2 slots · series stinger). Takes several `<clip> <T>` pairs and splices them in **a single run** (split it into two calls and the first splice is erased), uses the clean master, shifts each requested sidecar subtitle cue by the sum of the measured lengths of the insertions before it, and checks for cues straddling T and for matching lengths
- **`references/capture-frames.sh` / `capture-reveals.sh`** — headless capture (state count derived automatically)
- **`references/render-motion-slide.mjs`** — motion-slide renderer (§3.6): one clip per reveal group, headless Chrome over the DevTools pipe with no npm dependency, every frame seeked to an exact time so a re-render is byte-identical; `--sheet` writes the frames the §3.6 sheet read looks at. It renders **every authored screen** — diagram, kinetic type, character act — since all it asks a page for is the seek contract
- **`references/shot-speech.md`** — explicit speakers, generation receipts, replaceable video adapters and targeted corrections
- **`references/snap-boundaries.py`** — the take's sentence sidecar snapped to the detected pauses, bound to the WAV's hash (build-reel §4)
- **`references/reveal-timing.py`** — reveal timing derived backwards from the narration's pauses
- **`references/frame-persona-clip.py`** — unifies speaking-clip framing + palindrome
- **`references/reel-qa.html`** — the phone-mode QA harness (IG/YT UI mockups · crop reproduction · safe-zone guides)
- **`../autoproduce/references/events-to-tally.js`** — compares `.work/cost-tally.tsv` against `.work/events.jsonl` (the record the MCP server writes on every generation call) and prints the missing lines with `--tsv`
- **`../autoproduce/references/episode-state.js`** — the resume check: stage, next command, and the blockers that stall an episode silently (missing footage, unauthored slides, images the scenes name that aren't on disk)
- **`../autoproduce/references/decision-log.md`** — the episode decision log (`.work/decisions.tsv`) storyboard starts and produce carries on: engine, voice, music and every fallback, with what each one replaced. `decisions.sh` reads it back for the §10 report
- **`../autoproduce/references/cost-tally.md`** — the episode cost ledger convention (the file §3 and §5 write and §10 totals). The price source of truth `prices.tsv` and the calculator `cost-report.sh` sit in the same directory
- **`../channel/references/resolve-asset.py`** — looks up the shared outro, BGM, sound effects, and character sheet (catalog + default path + the old `assets/outro.mp4`)
