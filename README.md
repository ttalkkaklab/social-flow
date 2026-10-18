# social-flow

The [filmmaking guide](docs/guides/ai-film-four-elements/index.html) explains character references, camera direction, framing and shot timing. `storyboard_read` exposes the shared 45-entry technique catalogue; `shot.techniques` stores stable IDs with shot-specific reasons. The offline storyboard exports the same catalogue, with a distinct pictogram and explanation for every entry. Camera instructions reach the generic, speech-planning and ASTRA prompt paths. See [technique selection](skills/storyboard/references/film-techniques.md).

Character video requests now compile [voice continuity](skills/produce/references/voice-continuity.md)
from pinned cast settings. `video_plan` maps Seedance samples to their actual audio
and image indices, repeats authored Google voice descriptions, and records separate
unreviewed identity/dialogue/speaker/lip-sync findings. Saved plans become stale when
speech, voice settings or reference bytes change. Selected audition samples travel
with the character handoff; no automatic listening gate or paid generation is added.

Motion-graphic shots now persist `shot.motionGraphic`: a semantic type, viewer intent,
selection reason, evidence, visual direction and timing intent. The shared
[21-type guide](skills/storyboard/references/motion-graphics.md) distinguishes
comparisons, workflows, UI demonstrations, mechanisms and other situations.
Twelve abstract families have a deterministic local SVG renderer with bundled
role-based fonts and six contextual themes. Physical mechanisms and recorded evidence retain their
asset routes; a catalog type does not imply an automatic renderer. Storyboard
cards show the choice and reason. Prepare a built-in scene with
`node skills/produce/references/prepare-motion-graphic.js BOARD --shot N`.

Storyboards show camera pictograms with visible movement/speed, planned shot lengths
and incoming cut continuity beside each shot. The length comparison links to the
original shot cards in playback order and keeps unknown lengths unknown. Camera
details remain expandable; still effects are labelled separately. These views derive
from existing fields and do not certify generated motion. See
[action direction](skills/storyboard/references/action-direction.md).

[Shot continuity](skills/storyboard/references/shot-continuity.md) connects concrete
opening/closing poses with the preceding accepted clip's selected endpoint. The local
capture helper records the actual source frame and detects stale trims or replacement
clips; the image prompt assembler attaches a current endpoint as a state reference.
Legacy boards expose missing blocking and inferred connections as advice. Assembly
exports paired boundary PNGs beside playback excerpts, without claiming visual approval.
Shot sound intent now routes by model and mode through `prepare-video-sound.js`: native
audio where supported, supplied audio for explicit LTX conditioning, and timed post
effects otherwise. See [model-aware effects](skills/produce/references/video-sound.md).

The bundled `skills/produce/references/prepare-astra-shot.js` prepares each real ASTRA
request from the whole shot, its authored opening and composed speech. It preserves the
resolved performance prompt in its receipt, uses unlabelled camera/action prose for LTX,
checks duration coverage and records the actual image hash;
audio2video still conditions on one opening image, not the preceding clip or an entire board.

Start a reusable video project with `/social-flow:project-init <directory>`.
It saves SNS targets and connection records, video genre, video/speech/image
models, visual style, video ratio and output format together in
`.social-flow/models.json`. It creates the channel profile, shared asset catalog
and episode directory, preserves existing content, and asks only missing choices.
SNS credentials stay in the external channel token directory; connecting later
is supported. New episodes inherit a complete settings snapshot, so changing a
default does not change work in progress. See [project setup](skills/project-init/SKILL.md).

Before episode candidates, prepare shared identities and export the bundled
**캐릭터 시트 / Character sheets** with `review-library.js`. The storyboard's
**이번 편 출연진 / Episode cast** links back to those sheets. Missing images remain
pending. [Panel diagnostics](skills/channel/references/character-panels.md) distinguish
shared references from scene images and check 2:3 body / 1:1 face canvases and recorded
subject size. Template freshness alone does not certify visual completion.

`project_manage` provides the same initialization, status, revision-checked update
and episode creation over MCP; `skills/_shared/project-settings.js` is its CLI.
Claude Code's read-only SessionStart hook reports missing settings. Other hosts
use the skill's explicit preflight; neither path silently chooses preferences.

At first setup in a working directory, choose the video type, then the video,
speech and image models. The [type catalog](skills/_shared/video-types.md) covers
drama, comedy, documentary, explainer, tutorial, review, interview, vlog,
advertisement, music video and custom/hybrid, with each choice's speech direction
shown before selection. The choices are saved in `.social-flow/models.json`
and reused for subsequent episodes until you explicitly request a change. Each
episode snapshots its settings in `.work/model-settings.json`, so a later default
change does not alter an episode already in progress. An unavailable model is
reported instead of silently replaced. See [directory model settings](skills/_shared/model-settings.md).

[![check](https://github.com/ttalkkaklab/social-flow/actions/workflows/check.yml/badge.svg)](https://github.com/ttalkkaklab/social-flow/actions/workflows/check.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
&nbsp;·&nbsp; Docs: [English](docs/index.en.html) · [한국어](docs/index.html)

A Claude Code plugin that runs a channel-based short-form/long-form content pipeline —
**storyboard (plan only — nothing is generated) → per-platform video & text production →
HITL-approved publishing** — over a `data/[channel]/episodes/[topic]/` directory tree.

A **channel** is one content brand you operate: one `data/` directory per channel, with
tone, theme and pinned character voice IDs in `profile.md`, and publish targets, genre, models, visual style, video
ratio and format saved once in `.social-flow/models.json`. Publish targets:
**Threads · Instagram (Reels) · Facebook Pages · YouTube (Shorts and long-form)**.

The generated-video share of new cuts is one of six saved ids — `full_video` (전체 영상, 100%),
`video_80` (80% 이상 영상, 80–<100%), `video_50` (50% 이상 영상, 50–<80%), `video_30` (30% 이상 영상,
30–<50%), `video_lt10` (10% 미만 영상, <10%) and `no_video` (0% 영상) — chosen once at project setup
and reused. It is a planning target and the cost ceiling: the band's upper bound and the budget
are enforced, and fewer generated cuts than the target is reported, never padded. Only an episode
with no saved value asks, with model, resolution, audio setting, first-pass and retry-inclusive
video costs and an explicit budget cap.
The read-only [cost comparison](skills/autoproduce/references/production-cost.js) uses the same
API price table and routing as production, including minimum billed clip lengths. It labels KRW
conversion as an assumption and excludes image, voice, editing and tax costs. The
[choice contract](skills/storyboard/references/production-mode.md) persists approval and detects
changed quotes. Existing recordings and shared outros retain their source.

Full-video image planning ships the [tactile miniature style pack](skills/storyboard/assets/styles/tactile-miniature-v1/STYLE.md):
five generated PNG references, a versioned manifest, and material, lighting, composition and
content-review instructions. The prompt assembler returns actual reference-image arguments
resolved from the installed plugin, so another machine does not need this episode's images.
Use the references for appearance, not unrelated historical props or story content. Authentic
archives keep their original look. Include `skills/storyboard/assets/` when distributing the
whole plugin; the server-only npm package is not the plugin and does not contain these assets.

The [full-video branch](skills/produce/references/full-video.md) renders every new scene as a
clip in the chosen style, with one visible action per cut, a shared world bible, one camera
contract per shot (the four `visual.camera` slots) and separate channel narration; for
cinematic-miniature it targets a spatial explainer of architectural miniatures, environments
and cutaways. It supersedes the hybrid HTML-only explanation rules below for that episode. The
prompt assembler builds the source and motion prompts from the shot plan and runs the same
Seedance prompt gate the storyboard checker runs, so a stored prompt is a checked prompt.
Actual playback and frame reviews are tied to source/clip hashes, and the builder checks the
selected files and refuses loops or freeze padding. These checks enforce review, not a
guarantee that a generator matches the reference on its first attempt.

Gaze planning uses one `shot.eyeline` record for the board eye/direction icon, MCP input,
source-image prompt and filming script. New gaze sequences declare it on related cuts;
unrelated cuts can omit it. Scenes using the property enforce required records and linked
shot consistency; older scenes without it warn. See [eyeline contract](skills/storyboard/references/scenes-schema.md#eyeline-shoteyeline-l07).

Depth of field uses one `shot.depth` record for the board two-plane icon, MCP input,
source-image prompt and shooting script. It counts what the viewer must read at once: one
thing → shallow with the sharp plane named, two or more → deep with the planes listed front
to back. A still-camera focus effect is always shallow. See [depth contract](skills/storyboard/references/scenes-schema.md#depth-of-field-shotdepth-l11).

The visual style is saved once in `.social-flow/models.json` (`style.preset`) and reused by every
episode in every production mode; the checker warns about a board without it. Both prompt
assemblers write the preset's treatment into every generated still, and `check-scenes.js` warns
about a still whose prompt lacks it. A style read on a still is evidence (`not_reviewed` when
absent), not an assembly gate. One shot leaves the episode preset through `shot.style`, an
authored exception recorded with its reason. See [visual style](skills/storyboard/references/visual-style.md).

Assembly compiles each storyboard transition into the production timeline.
`storyboard_apply.transitions` changes selected incoming effects without replacing shots.
For scene changes in place or time, prefer `dip` (fade through black); the storyboard
displays the effect, timing and reason below each shot. Moving transitions
use unseen outgoing video frames, with explicit source trims and narration margins. Missing
handles or conflicting card options block the build. The checked master includes boundary
frame verification and short playback excerpts for continuity review; see the
[cinematic editing contract](skills/produce/references/cinematic-edit.md).

Video comes in two formats. The default is 9:16 short-form (1080×1920/30fps), derived
per platform; YouTube long-form uses 16:9 (1920×1080). The format is saved once at project
setup (`production.format`) and copied into a single `window.FORMAT` line in `scenes.js` that
fixes every build constant downstream. Long-form episodes **mix clips you film yourself with
generated scenes** — where the evidence lives on screen you film it, where the point is
a mood or a place the pipeline generates an image, and scenes that need words or
diagrams on screen become **HTML motion slides**, authored and shown as rendered
keyframes before approval. Quantitative relationships use charts with source values,
a shared scale and narrated focus. Explanatory actions use 3D objects or characters.
Production checks the plan and rendered frames before assembly. **Nothing is drawn over video** (user directive 2026-09-05): a
cut that needs an arrow, a figure or a principle is an HTML slide on a lit studio stage,
with a real 3D object when a thing is the subject. The offline mesh lane renders GLB models
and articulated parts at every frame, with 3D illustration or photoreal materials and refined
curved arrows ([object authoring](skills/storyboard/references/mesh-objects.md)), held to the quality of
`docs/research/2026-09-04-rendered-object-slide/reference-slide.html`. Generated video is
reserved for essential continuous action, with no subtitles burned into the picture. **Every cut is chosen by purpose** (user directive 2026-09-06):
the storyboard reads the narration first and writes `shot.render` — a still under a camera
move, a 3D character scene, a 3D object scene, a data graph, or generated video — with the
reason for the choice ([render routing](skills/storyboard/references/render-routing.md)). The
opening goes through the same choice, so no cut is paid video merely because it starts the
episode (`hook_video`, default off). Generated video sits under the channel's `video_budget_usd`
(default $10 an episode) and the project's `episodeBudgetUsd` — ceilings the author carries into
`PRODUCTION.videoAuthorization.maxUsd`, the one value routing enforces ([budget fields](skills/_shared/video-routing.md)).
One still holding one cut at most (`max_static_ground_seconds`, default 8 s) is guidance, and a
one-picture plate on an ordinary beat is a one-sentence card (`html_plate_max`, default 2).
Narration uses the saved speech model (`models.speech`, Gemini or ElevenLabs v4) with explicit
speakers; in the shooting-script flow it is **your own voice on every scene**, so
the shooting script (`script.md`) carries the lines for every shot — filmed shots get
what to show, what to say, and the filename to save it as; the rest are voice-only
recordings.

Visual direction has [episode checks](skills/storyboard/references/visual-direction.md): copied
render reasons are flagged, text-led quote/verdict scenes are limited, and every opening belongs to
the checked timeline. [Data charts](skills/storyboard/references/chart-design.md) use a shared,
seekable SVG renderer for bars, dots, lines, stacked shares, histograms and timelines. Source
values, honest scales and narrated focus beats drive the picture. The production builder
reruns source-plan and slide checks before encoding and records the plugin version and hashes.

Story approval uses an [evidence-backed contract](skills/storyboard/references/story-quality.md):
choose supported content and an earned ending before polishing the hook. CTA is optional.
An ask stays optional; a forwardable thing does not — an ask requests behaviour from the viewer,
while a forwardable thing is one sentence, figure or verdict they can pass on as-is. Asking to be
shared is an ask, not a trigger. On a short that forwardable thing is `shot.share` on the closing
shot; it is optional, and `check-scenes.js` allows a board without it.
Every spoken scene needs a purpose, and a narration review, when one is run, cites actual lines
for meaning, progression, payoff and grounding. `check-story.js` and full `check-scenes.js` report
a missing or stale review as `not_reviewed` / `stale` evidence; they do not block production, and
a numeric score grants nothing. Existing boards keep their contract and review records when
rebuilding, without silently rewriting approved narration.
These checks describe the workflow, not a promised audience retention rate.
A one-person history short declares `STORY.person` and follows
[person-short.md](skills/storyboard/references/person-short.md): the opening names nobody and
carries no year, the body is cause → block → one blow, the close is one scene after the blow,
the picture changes with every sentence, and optional sidecar subtitles remain separate from the picture.
A message is a sentence that stays true with the episode's names gone — *what leads to what*,
present tense, no figure, no name ([scenario-stage.md](skills/storyboard/references/scenario-stage.md)
§The message): `check-research.js` refuses a past-tense, numbered or hero-named Message cell,
and `check-story.js` requires `STORY.thesis` to be that sentence, heard over the closing picture
at or after the payoff — not the reversal again, not a moral, not the picture described.

The video pipeline (safe zones, reveal sync, subtitle contracts) and the SNS publishing
client carry over from an earlier in-house plugin where they were verified in
production, generalized here to per-channel operation.

> **Content language.** Your channel's language is set in its `profile.md` — tone, TTS
> voice and its `lang` code, subtitle languages — and the skills write in whatever that
> says. What the pipeline is *not* yet is fully language-neutral, so here is the honest
> state of it:
>
> - **The copy style check is Korean-only.** `check-style.py` implements Korean rules —
>   translationese, Korean AI stock phrases, Korean sentence endings. Hand it text in
>   another language and it exits **4 (SKIP)**, saying in as many words that the copy is
>   *unchecked*, never that it passed. A person has to read that copy. (It used to return
>   a clean PASS on English, which is why the SKIP verdict exists.)
> - **Korean-market research tools are optional.** Naver search and Korea's open-data
>   portal (data.go.kr) are extra sources; `serp_*` and `WebSearch` cover the rest.
> - **On-device generation has Korean-specific limits**, noted where they apply: local
>   image generation breaks Korean glyphs (text-bearing frames go to the paid path), and
>   the local STT default is tuned for Korean.
> - **The channel browser UI speaks English and Korean.** `serve.js` picks up `?lang=`,
>   then the browser's language, and falls back to English; the header carries a picker.
>   Adding a language is one entry in its `STRINGS` dictionary — the self-test fails if
>   any language is missing a key English defines.
> - **The storyboard review render speaks English and Korean too.** The template picks the
>   language the same way and puts the picker at the end of its section menu; the episode's
>   own copy stays in whatever language `scenes.js` is written in. Two things there don't
>   follow the picker: the check-strip *sentences*, which are hardcoded English (moving them
>   into the dictionary is the unfinished half of that pass), and the heuristics that read a
>   Korean sequence heading to guess a shot's playback beat — an explicit `beat:` overrides
>   those anyway.
> - **Still Korean-only: the shooting script and the research parser.** `make-script.js`
>   writes `script.md` — the page you read while filming — with Korean headings, and
>   `check-research.js` finds a research.md's verification table by Korean heading words.

Storyboards start with complete scenes: a character wants something, an event changes
what is possible, and a visible choice produces a consequence. The author then divides
those scenes into shots. There is no default runtime or shot-count quota; staging,
dialogue and listener reactions determine the length. Actual model clip limits are
production constraints, handled at natural action boundaries. Read
[the storyboard workflow](skills/storyboard/SKILL.md) before authoring a new episode.

Reviewers first read only the actions and dialogue the audience will see and hear.
Private plot explanations cannot repair a missing screen cue. Production planning
carries essential actions, reactions and object states into the video request, including
silent beats and action that overlaps speech. Local diagnostics expose omissions; a
clean schema result does not prove story comprehension or generated video quality.

Independent visual review collections use the installed storyboard planner and production builder:
[animation review workflow](skills/produce/references/animation-review.md). The JSON-driven collection
compares still-camera portraits, contextual 3D character scenes and object mechanisms, and records the
installed entrypoint and asset hashes. These silent previews wait for user feedback and are not
publishable episodes. Improve reusable plugin templates and rebuild; do not hand-edit their outputs.

## Persistent 3D locations

`location_manage` builds versioned Blender sets, exports GLB, renders multi-view sheets and shot references, binds them to stable shots, and rejects stale references or changed asset bytes. The shared storyboard adds an offline 3D viewer with orbit, top view, wall visibility, object inspection, camera-path scrub and camera proposal export. Spatial image prompts include the location render as a scoped image input; actual review status stays explicit. See [location workflow](skills/storyboard/references/location-assets.md). Blender and a local HTTP server are needed for this workflow. Existing boards are unaffected until a shot binds a location; no paid generation is implicit.

Plan shared space before storyboard images: location bindings now carry actor start/end
positions, body facing, gaze targets and set endpoint states. The `previz` action renders
that same set/camera/blocking into both source references and a motion clip. Continuity
diagnostics warn about position, direction, gaze, custody and action-axis changes across
related cuts; intentional time skips carry a reason. Cast sheets supply appearance while
the shared location controls composition. Actual generated images still need inspection.

## Requirements

- Node 20+, ffmpeg, Google Chrome (headless capture), python3
- `uv tool install --python 3.12 "mlx-qwen3-asr[aligner]"` — for `stt_local_transcribe`
  and ingest's Korean STT. The first call downloads ~3.4GB of Qwen3-ASR-1.7B weights
  into `~/.cache/huggingface`. Installed elsewhere, point `QWEN3_ASR_BIN` at it
- Blender 4.2+ (`brew install --cask blender`, or `BLENDER=<executable>`) — for the seven
  `blender_*` previz tools (camera, blocking and body timing as numbers, rendered headless) and for
  `bake-blender.py`'s Cycles object sheets. No add-on, no GUI session, no account. Without it an
  optional previz renders in three.js through headless Chrome (`previz-template.html`)
- whisper.cpp (`brew install whisper-cpp`) + `~/.cache/whisper-cpp/ggml-large-v3-turbo.bin`
  — the ingest STT fallback when mlx-qwen3-asr is missing. Recording mode needs
  **Screen Recording and Microphone** permission for your terminal app
  (System Settings → Privacy & Security)
- API keys and platform credentials — see the next section for what each one unlocks

> **Load-path caveat**: a marketplace install prefixes the server's tools per plugin, so
> the live names read `mcp__plugin_social-flow_social-flow__*` (measured on Claude Code
> 2.1.251); a project `.mcp.json` or Codex names them `mcp__social-flow__*`. Every tool
> stays callable under either name, but pre-approval is a permission rule, and Claude Code
> matches a plugin server only in the plugin form — so each skill's `allowed-tools` lists
> both spellings. Check the real names with `/mcp` when you call a tool by hand. `data/` is
> created relative to the **session cwd**, not the plugin root.

## API keys — what each one unlocks

The keys come in two independent groups, and **you can stop after either one**.

**Group 1 — production keys.** These make the video. `OPENAI_API_KEY` unlocks GPT Image, the
usual saved choice for the cover and any frame with text on it (local image generation garbles
Korean glyphs); the saved image model in `.social-flow/models.json` decides which engine makes
each still, not a per-frame heuristic. `GEMINI_API_KEY` covers generated video clips,
narration, and BGM. On-device `image_local_generate` is a $0 image choice,
and speech uses the saved Gemini model or ElevenLabs v4 with its own API key.
Raw speech needs no automatic paid review; record generation provenance and
`not_reviewed`. Only explicitly requested reviews add reviewer cost.
For research, `SERPAPI_API_KEY` and the Naver pair are
optional too; the storyboard skill falls back to WebSearch.

**Group 2 — platform credentials (Threads · Instagram · YouTube · Facebook). Entirely
optional, and they're what turns the tool from a video maker into an operator.**

- **Set them up** and the pipeline runs end to end and keeps running on its own:
  `publish` posts directly to your accounts, and the growth skills (`grow-threads`,
  `grow-youtube`, `grow-instagram`) take over day-to-day operation on `/loop` —
  replying to comments, watching insights, joining keyword conversations, refilling
  the publish queue, and posting inside the standing authorization you approved once
  at `init`. A just-published YouTube video also gets a velocity watch: the tick samples
  its live view counter every `velocity_watch_minutes` (default 30), and a video running
  ahead of the channel's own recent episodes at the same age goes into a channel-shared
  handoff that the Threads loop can spend one push post on. Insight tools
  (`threads_insights`, `youtube_insights`, `instagram_insights`, `content_feedback`)
  start reporting real numbers, and `review-recent` can score your last five
  episodes against your own medians.
- **Skip them** and everything up to and including production still works. Research,
  storyboard, image generation, narration, the build — `produce` writes the finished
  9:16 or 16:9 video plus per-platform text into
  `data/<channel>/episodes/<topic>/output/`, and you upload those files by hand. Only
  the publishing and growth-loop half is unavailable: the 11 publish/review/insight tools
  aren't listed without credentials, and the growth skills have
  nothing to drive. Explicit tool-disable settings can reduce that list further.

Credentials are per platform, so this is not all-or-nothing — a YouTube-only setup
publishes and grows YouTube while Threads and Instagram stay manual. Add a token
later and the matching tools appear without restarting the server. The three
`setup-*` skills walk the account signup and token issuance with a browser, handing
back to you only at the steps that need a human (login, verification codes, consent
screens); `skills/publish/references/token-setup.md` documents the manual route.

Exact variable names, defaults, and file conventions:
[Environment variables & credentials](#environment-variables--credentials).

### What costs money, and what doesn't

Generation is metered by the vendor unless it runs on your own machine. Four
capabilities, four different answers.

**None of it happens before you approve the storyboard.** The storyboard skill plans every
still, slide art and clip — prompt, engine, price — and generates nothing; `produce` makes the
calls after approval. So a plan you send back or drop costs $0, and the approval screen shows
the whole projection rather than a bill that has already partly arrived.

| Capability | Free / on-device | Paid | Costs money unless… |
|---|---|---|---|
| **Images** | `image_local_generate` — Z-Image Turbo via mflux, $0. Optional: `mlx_image_*` when MLX Core is running. Under Codex or Grok the CLI's own `image_gen` is the setup-time recommendation, on the subscription allowance | `gpt_image_*` — OpenAI, per image by quality | …you accept no text in the frame. Local generation breaks Korean glyphs apart, so covers and any text-bearing frame need GPT Image or a host tool. The saved image model in `.social-flow/models.json` decides; nothing reroutes a frame on its own |
| **Video** | deterministic HTML motion slides rendered locally with headless Chrome. Optional: `mlx_video_generate` (24fps, RAM-capped). Under Grok the CLI's own `image_to_video` is the setup-time recommendation (1–15 s, 720p ceiling, subscription allowance) | Veo 3.1 (Gemini) per second · Seedance (ModelArk) per second | …you use the HTML motion lane or the Grok host lane. The saved video model decides the paid engine. A channel can prohibit stills and still spend zero on generated video; Ken Burns does not count as true motion. mlx_video is not the default and is not on the Veo/Seedance face-policy table |
| **Speech (TTS)** | Your own recording | Gemini TTS or ElevenLabs `eleven_v4` | Generate with the saved voice and record provenance. No automatic paid speech review; local TTS is removed. |
| **Transcription (STT)** | `stt_local_transcribe` — Qwen3-ASR via mlx, $0 (whisper.cpp fallback) | none | never — there is no paid STT path here |
| **Music (BGM)** | Saved MLX music pack or reused channel bed | Saved Lyria / ElevenLabs / sunoapi.org model | …you reuse audio or choose an installed local pack |

A near-zero run is possible: local images, local transcription, no generated video, no
BGM. Speech is the one paid step left (local TTS is removed): raw TTS on the saved model,
recorded `not_reviewed`, with no paid review. What you give up is a proper cover frame (it
needs rendered text) and background music.

A realistic paid episode is small. The default economy tier spends about
**$0.27–0.29** — one high-quality cover image plus one 30-second BGM clip, with
everything else local — against the growth plan's per-episode cap
(`max_cost_per_video`, template default $1.00), one of the spending ceilings beside the
project's `episodeBudgetUsd`, enforced before spending, not after. Generated video is the
expensive step: a silent Seedance hook clip takes the episode to about $0.81 on the 2.0 mini
grade (about $3.00 on 2.0 at 1080p) and one 8-second Veo lite clip adds roughly $0.64, which
is why generated cuts stay off unless the cut needs true motion and the cap allows it. The
engine is the saved video model in `.social-flow/models.json`, not a per-cut escalation; an
unattended loop with no saved settings reports `project_setup_required` instead of guessing.

Prices live in one file, `skills/autoproduce/references/prices.tsv`, each row
carrying its evidence grade and source. `cost-report.sh` reads only that file and
**fails rather than guessing** — an unknown price exits 1 (verdict unavailable),
never 0.

Full detail — per-capability setup for both lanes, every key's signup and billing
steps, the on-device installs, worked cost arithmetic, and how the caps work:
**[Costs & API keys](docs/guides/costs-and-keys/index.html)**
([English](docs/guides/costs-and-keys/index.en.html)).

## Install

The quickest path is the marketplace — two commands, nothing to build:

```bash
claude plugin marketplace add ttalkkaklab/social-flow
claude plugin install social-flow@social-flow
```

The MCP server ships as a self-contained bundle, so the plugin works right after
install — no `npm install` step. To hack on the plugin itself, clone instead:

```bash
git clone https://github.com/ttalkkaklab/social-flow.git
cd social-flow/server && npm install && npm run build
```

`server/dist` is committed, so a fresh clone works without building — you only build
after editing `server/src`. `npm run check` runs the build plus the tool contract
tests (`server/test/`) — no external API calls, just the tool surface: schema
validity, definition ↔ handler routing, behavior hints consistent with descriptions,
enums matching their source-of-truth constants, generated-file path safety. If you
change `server/src`, make `npm run check` pass and commit `server/dist` with it.

Load the plugin by pointing at your clone:

```bash
claude --plugin-dir /path/to/social-flow
```

### Claude desktop app — Cowork and the chat

Cowork loads this same layout — the skills, the five agents and the local MCP server all
load when the session runs on your computer (Anthropic's
[platform-support table](https://claude.com/docs/plugins/platform-support)). In the desktop
app open **Customize → Plugins**, select **Add marketplace** and enter the GitHub shorthand
`ttalkkaklab/social-flow`, then install `social-flow`; or **Add → Upload plugin** with a zip
of this checkout (200 MB and 5,000 files per plugin). A plugin on the account also reaches
claude.ai chat and Claude Code as a synced plugin. The desktop app starts the server with no
shell, so the keys come from `~/.config/social-flow/.env` (§ Environment variables) —
`userConfig` would not do, since Cowork ignores a server that references an option without a
default and never prompts. The layout settles the install; whether Cowork's sandbox carries
ffmpeg and headless Chrome for the produce skill is unmeasured.

The chat surface ignores a plugin's local MCP server, so the plain chat takes the tools
through a desktop extension instead — MCP tools only, no skills:

```bash
npx -y @anthropic-ai/mcpb pack . social-flow.mcpb   # manifest.json + .mcpbignore choose the contents
```

Double-click `social-flow.mcpb`, or **Settings → Extensions → Advanced settings → Install
Extension…**. The install dialog asks for the three production keys,
the SerpApi key and the credentials directory (`manifest.json` `user_config`); every other
variable comes from the `.env` file in that directory. The bundle validates and packs here;
installing it is unmeasured.

### ChatGPT desktop app, Codex CLI, Grok CLI, and Buzz

The plugin layout is Claude-compatible across CLIs, so the same repo installs there too:

```bash
# Grok CLI — skills, agents, and the MCP tools all connect (measured on grok 1.0.5)
grok plugin install https://github.com/ttalkkaklab/social-flow.git --trust

# ChatGPT desktop app and Codex — one plugin directory since 2026-07-09. The portable manifest
# is the root plugin.json + mcp.json (type: stdio) on the agent-plugins.org schema;
# .codex-plugin/plugin.json stays as the compatibility overlay that spec names, carrying the
# same requires_local_executor flag. A local MCP server makes it a desktop-only plugin, so it
# installs in the desktop app's Plugins tab from this marketplace and in Codex — not in
# ChatGPT on the web or mobile. The public directory takes local-MCP plugins from approved
# partners only, so the marketplace is the route. Both files hold to their schemas; how
# codex 0.162 and the desktop app load the pair is unmeasured.
# Codex CLI — the skills load; MCP tools don't wire up yet (measured on codex 0.147.0)
codex plugin marketplace add ttalkkaklab/social-flow
codex plugin add social-flow@social-flow

# Buzz — persona pack at `.plugin/plugin.json` (skills + MCP). Validate, then
# point the nest at this checkout so agents pick up the working tree, not a
# stale marketplace snapshot:
buzz pack validate /path/to/social-flow
mkdir -p ~/.buzz/packs
ln -sfn /path/to/social-flow ~/.buzz/packs/com.ttalkkaklab.social-flow
```

API keys travel the same way as under Claude — shell environment variables where there is
a shell, and `~/.config/social-flow/.env` where there is none (the ChatGPT desktop app, Cowork).

**The saved model choice governs there too.** Codex and Grok ship their own `image_gen` (Grok also `image_edit`), and Grok
ships `image_to_video` and `reference_to_video`; at first setup in a working directory those host
tools are the recommended default, saved in `.social-flow/models.json` as `engine:"host"` and
billed on the subscription allowance with `image.host` / `video.host` ledger lines at $0. A saved
API engine wins over host detection, and a fallback after a failed host call is asked for, never
silent. Claude Code has no such tools, so the engine tables above apply there. The storyboard
records the saved providers in `window.PRODUCTION.imageProvider` and `videoProvider`
(`host` | `astra` | `api`). The Grok video tool tops out at 720p, and the builder scales that onto the 1080p canvas.

Work products accumulate under `data/` relative to the session cwd, so the convenient
setup is to start Claude Code in the directory where you want your content and add
the plugin with the flag above.

## Pipeline

Story and production share a [direction guide](skills/storyboard/references/retention-direction.md).
Each development pays part of the opening promise with evidence or a changed expectation.
The board maps those beats to visible changes, sound events and the final payoff. Production
checks that map against the finished video at delivery speed, including a listen to the mix.
Autoproduce can reuse multiple music cues or generate them within its authorized allocation.
Shot-relative music gain curves and configurable ducking shape dialogue and reveals; low
speech-to-music separation is a review warning, not an assembly gate.
An unverified playback check is recorded as `not_reviewed`; it does not hold the episode from
the publish queue. These are editorial checks; completion-rate improvements require audience
measurements.

```
/social-flow:project-init .                # 0. project defaults (once per working directory): SNS targets · genre · models · style · ratio · format → .social-flow/models.json
/social-flow:channel add my-channel        # 1. channel profile (once)
/social-flow:branding my-channel           # 1.2 (optional) profile image — 4 candidates → HITL pick → 95-point convergence
/social-flow:intro my-channel              # 1.3 (optional) channel intro — 4 concepts HITL → 4s veo render → 90-point convergence (spliced after the episode as a closer)
/social-flow:setup-threads my-channel      # 1.4 (optional) SNS account setup + API tokens — browser HITL, ego lite only (per platform: setup-instagram · setup-youtube)
/social-flow:ingest my-channel record      # 1.5 (optional) screen+voice recording → timeline — an alternative research source
/social-flow:storyboard my-channel "July FX swings"   # 2. research → wow points → 3 messages for today's viewer → 3 seven-item scenarios (one topic each, shown with their wow) → pick → more research → scenes (narration read on request, recorded as evidence) → storyboard → [approval] · nothing generated
/social-flow:produce my-channel 20260729-fx           # 3. video + per-platform text
/social-flow:publish my-channel 20260729-fx           # 4. [approval] → publish → record permalinks
/social-flow:grow-threads my-channel init             # 5. (optional) Threads growth plan [approval — standing authorization]
/loop 30m /social-flow:grow-threads my-channel        #    then an autonomous growth tick every 30m (inbox replies · insights · keyword conversations · judgment-based posting · one push post for a handed-over breakout — reviews recorded as evidence)
/social-flow:grow-youtube my-channel init             # 5-b. (optional) YouTube growth plan [approval — standing authorization]
/loop 1h /social-flow:grow-youtube my-channel         #     then a tick every hour at rest (comment replies · metrics · queue refill authoring · queue publishing · velocity watch → breakout handoff), 15–30m while a watch is open
/social-flow:grow-instagram my-channel init           # 5-c. (optional) Instagram growth plan [approval — standing authorization]
/loop 1h /social-flow:grow-instagram my-channel       #     then an hourly tick (comment replies · skip-rate watch · queue refill authoring · queue publishing)
/social-flow:topic-scout my-channel                   # 1.6 topics the market has already validated — md source of truth + chart HTML
/social-flow:review-recent my-channel                 # 6. feedback HTML for the last 5 episodes (funnel · bars · next-episode levers)
```

Each step checks the previous step's output — produce stops on an unapproved
storyboard, publish stops on unfinished production, and each points you back to the
step that's missing.

Steps 1 through 3 need no platform credentials. Steps 4 onward — publishing, the
growth loops, and `review-recent` — are the half that platform tokens unlock; without
them the pipeline ends at `produce` with the finished video and per-platform text in
`output/`, ready to upload by hand.

**One topic string straight to a finished video** (steps 2–3 with no human approval):

```
/social-flow:autoproduce my-channel "July FX swings"   # research → wow points → 3 messages → 3 seven-item scenarios [one batched read] → pick → more research → scenes.js (reviews on request, recorded as evidence) → images → TTS → build → output
```

Without a human, the run keeps the operational contracts — fact verification (3+
cross-verified claims), the contract checkers, the build report (drift 0) and the cost cap —
and records everything else as evidence: the batched scenario read (curiosity · fear · intrigue ·
comedy), narration reads, the copy style checker's findings and a content-reviewer read are
advice, `not_reviewed` when skipped, never a reason to hold a finished episode. The **economy
tier is the default**: still backgrounds with Ken Burns and HTML motion slides, roughly
$0.27–0.29 per episode (a silent Seedance hook clip, only where the routing or an explicit
`hook_video` picks video, takes it to about $0.81 on 2.0 mini 720p; plan cap default $1.00).
Generated cuts use the saved video model in `.social-flow/models.json`; no metric promotes a
b-roll to another engine. Authoring is capped at **2 episodes
per platform loop per day** (hard cap, counting successes and failures), and
`check-duplicate.py` compares every candidate topic against the channel's whole back
catalog to throw out rewordings of things already made. Unit prices (and the legacy
model ladder) live in `skills/autoproduce/references/`. This is also the skill the
growth loops call when they refill their own queues.

**Threads copy is written for one of two outcomes.** Reach and replies come from
different posts, measured on 61 popular posts by other people plus Meta's ranking card
and two third-party datasets (2026-09-19). The playbook now picks the intent before the
draft, carries the measured type table (a verdict request takes a median 59 replies where
an information post takes 13), drops "1–3 lines" for "is it read to the last line", and
adds the hook-plus-own-replies chain — one short post with the substance in self-replies,
which `threads_publish`'s `replyToId` already supports. The growth loop reviews a chain as
one draft and replies to its own post after publishing. See
[the research](docs/research/2026-09-19-threads-post-styles/README.md).

**Style check** — wherever Korean text is produced (storyboard authoring, produce
right before TTS and per-platform copy, publish right before approval,
content-reviewer verification), `check-style.py` deterministically flags AI-sounding
prose. It catches translationese, stock phrases, assistant-register endings,
comma-after-connective habits and context-dependent vocabulary suggestions, tiered S1/S2/S3; an S1
finding is a suggestion (exit 2 is a signal, not a block). Each of the 8 surfaces (narration, subtitles, card text, four platform
copies, comments) has its own thresholds and disabled rules — the check doesn't fight
the register the playbook itself demands, like Threads banmal or Facebook's
case-collecting closers. For video surfaces, `platform-guide/references/extract-text.js` pulls the text out of
scenes.js.

**Write for the channel's actual audience and voice.** Use natural, precise Korean;
there is no universal school-grade vocabulary limit. Preserve familiar adult expressions
and explain necessary terms only when the audience needs the context. E1~E3 matches
are S3 review suggestions with no score deduction or blocking verdict. A match alone is
never a reviewer P0. Other S1 defects are suggestions too; they are reported, not enforced. The rule source is
`skills/platform-guide/references/korean-style.md` §Eye level.

**Storyboard adversarial reviews** — the checker catches what rules can catch; the
layer above it is what a person has to read to feel. Overused antithesis, triple
lists, sermon-style closers, a rhythm where every sentence reads at the same length.
So the storyboard skill can call the adversarial reviewer `storyboard-reviewer` on the
narration alone, on request or for a concrete uncertainty, before any shot has a camera — the
spoken sentences, numbered and handed to the reviewer inline so it opens no file:

| Review | What it reads | Score is |
|---|---|---|
| Narration mode (§4.4) | the narration alone, without the picture — does the topic and the content come through | total; a requested improvement loop targets 95, cap 3 reads |
| Vocabulary mode (§4.5) | the same sentences — are the words what a person says | **lowest sentence**; the same loop on request |

Those are the only reviewer calls in the flow (0.50.0). The six board reads, the plan
review and the slide loop of 0.49 came out after measuring 358 reviewer runs: a call cost
2–8 million input tokens and 8–14 minutes, an episode ran twenty to sixty of them, and on a
full session the reviewers used more tokens than the session itself. What they looked at is
now `check-scenes.js`, `check-slide.js`, `check-style.py` and the author's own read of the
board, the images and the slide key frames — with anything left over going onto the human
approval screen, which is the one thing that blocks. The other modes (copy · scene · camera ·
sound · image), `slide-reviewer` and `content-reviewer` plan mode still exist for a read the
user asks for by name. autoproduce has no human to decide, so there a read still short after
the third pass is recorded as evidence and authoring continues with the best justified draft.

**Storyboard-first shooting flow** (for polished demos and tutorials — the order flips):

```
/social-flow:storyboard my-channel <topic> as a shooting script   # scene design + shooting script (script.md) → [approval]
/social-flow:ingest my-channel record <topic>                     # film against the script → transcription + scene alignment (alignment.json)
/social-flow:produce my-channel <topic>                           # cut the recording into a 9:16 edit (your voice + real screens, no TTS)
/social-flow:publish my-channel <topic>                           # [approval] → publish
```

## Repository layout

```
social-flow/
├── .claude-plugin/plugin.json   # Claude Code plugin manifest
├── .grok-plugin/plugin.json     # Grok CLI plugin manifest
├── .codex-plugin/plugin.json    # Codex CLI plugin manifest
├── .plugin/plugin.json          # Buzz persona pack (Open Plugin Spec)
├── personas/                    # Buzz pack persona (pipeline.persona.md)
├── plugin.json                  # ChatGPT desktop app · Codex portable manifest (agent-plugins.org)
├── mcp.json                     #   its stdio server entry
├── manifest.json                # Claude Desktop extension (.mcpb) manifest — .mcpbignore picks the contents
├── .mcp.json                    # internal MCP server registration (social-flow)
├── server/                      # internal MCP server (TypeScript, stdio) — 118 tools
│   └── src/
│       ├── index.ts             # entry (publish/insights tools exposed per credential file)
│       ├── tools.ts             # tool definitions — 118 tools, including voice auditions and opt-in acting review
│       ├── handlers.ts          # zod validation + routing
│       ├── sns-client.ts        # Threads·IG·FB·YouTube publish/comments
│       ├── serp-client.ts       # SerpApi (key masking + response slimming)
│       ├── naver-client.ts      # Naver Open API (news·blog·web·cafe…)
│       ├── datago-client.ts     # data.go.kr (search·detail·download·odcloud·standard open API)
│       ├── image-client.ts      # OpenAI GPT Image generation
│       ├── zimage-client.ts     # Z-Image Turbo on-device generation (mflux/MLX)
│       ├── mlx-serve-client.ts  # MLX Core / mlx-serve HTTP client (image·edit·music·video·3d)
│       ├── qwen3-asr-client.ts  # Qwen3-ASR on-device STT (mlx-qwen3-asr CLI)
│       ├── video-client.ts      # Veo 3.1 — t2v·i2v·extension·reference
│       ├── seedance-client.ts   # Seedance — t2v·i2v·reference (BytePlus ModelArk)
│       ├── tts-client.ts        # Gemini TTS — single speaker + 2-speaker dialogue
│       ├── elevenlabs-client.ts # ElevenLabs TTS — single voice · multi-voice dialogue · voice list (REST)
│       ├── music-client.ts      # Lyria — 30s clips (batch) + variable length (streaming)
│       └── media-utils.ts       # path validation · base64 saves · PCM→WAV utils
├── skills/
│   ├── project-init/            # workspace defaults, SNS records and repeatable episode setup
│   ├── channel/                 # /social-flow:channel — channel & profile management
│   │   └── references/          #   resolve-asset.py (catalog lookup) · serve.js (channel browser over HTTP — pick a channel, then storyboards or characters; serves data/ so storyboard.html opens in place)
│   ├── branding/                # /social-flow:branding — channel profile image (4 candidates → HITL pick → adversarial convergence at 95)
│   ├── intro/                   # /social-flow:intro — channel intro video (4 concepts HITL → veo character acting → name reveal + sonic logo → 90-point convergence)
│   ├── setup-threads/           # /social-flow:setup-threads — Threads account setup + API hookup (browser HITL — signup·branding·Meta app·60-day token, state detection & resume)
│   │   └── references/          #   setup-playbook.md (CDP recipes · token exchange · 60-day renewal)
│   ├── setup-instagram/         # /social-flow:setup-instagram — Instagram account setup + API hookup (browser HITL — professional conversion · Instagram Login OAuth · 60-day token)
│   │   └── references/          #   setup-playbook.md (UID reserved-variable trap · tester invite path)
│   ├── setup-youtube/           # /social-flow:setup-youtube — YouTube brand channel setup + API hookup (browser HITL — advanced-features verification → channel creation → refresh_token, multi-day resume)
│   │   └── references/          #   setup-playbook.md (loopback listener · production-stage 7-day expiry trap)
│   ├── datago/                  # /social-flow:datago — open-data research → collection → seed records
│   ├── ingest/                  # /social-flow:ingest — screen recording (+voice) → timeline (recording control · STT · scene boundaries · keyframes)
│   ├── storyboard/              # /social-flow:storyboard — research → wow points (what the viewer believes → what the evidence shows) → 3 messages for today's viewer → 3 seven-item scenarios (one topic each, never "X는 알 수 없다", each shown with its wow) → pick → more research → narration → narration and vocabulary reads on request (inline, ≤3 reads) → the board (author's read + check-scenes.js) → the image and clip plan → [approval]. No generation call — produce makes the stills, slides and clips
│   │   └── references/          #   scenes-schema.md (§structure — sequences · scenes · shots) · structure-contract.js (the rules storyboard_apply · check-scenes.js · storyboard.html share) · directing-grammar.md · motion-slide-template.html (studio ground · slab material · rendered object) · slide-design.md (look · motion tokens · the slide-reviewer rubric) · check-slide.js · rendered-object.md + bake-object.py (an SDF-raymarched object baked to a frame sheet, numpy + Pillow, ₩0 an episode) · blender-objects.md + bake-blender.py (the mesh recipe path-traced by Blender Cycles into the same sheet — real cast shadow, minutes of local GPU per cut, `--probe` forecasts them)
│   ├── produce/                 # /social-flow:produce — stills (§1.5) → clips → slides (§3.6) → video build + per-platform text
│   │   └── references/          #   build-reel.sh (subtitle-free master; `SUB_MODE` is a legacy burn-in switch the builder ignores) · speedup.sh (required final pace pass, 1.0 default, ≤6.2 chars/s) · bgm-bed.sh · bgm-scoring.md · video-template.html · render-motion-slide.mjs (motion slide → one clip per reveal group, no npm dependency) · QA harness
│   ├── edit-speech/             # /social-flow:edit-speech — targeted speech corrections for one shot or character (speech_manage · raw TTS · not_reviewed)
│   ├── autoproduce/             # /social-flow:autoproduce — one topic through research → wow points → 3 messages → 3 seven-item scenarios [one batched read on the wow and curiosity · fear · intrigue · comedy, auto-pick unattended] → more research → authoring (reviews recorded as evidence) → video (operational contracts only, economy tier default)
│   │   └── references/          #   cost-tiers.md (legacy model ladder; the saved model governs) · prices.tsv (price SoT) · cost-report.sh
│   │                            #   cost-tally.md (per-episode cost ledger convention — shared by storyboard/produce)
│   ├── publish/                 # /social-flow:publish — HITL approval, then platform publishing
│   ├── grow-threads/            # /social-flow:grow-threads — one autonomous Threads growth tick (init plan = standing authorization, repeat via /loop — growth skills are per-platform)
│   │   └── references/          #   growth-playbook.md (tactics SoT) · growth-plan-template.md (plan/state schema)
│   ├── grow-youtube/            # /social-flow:grow-youtube — one autonomous YouTube growth tick (comment replies · metrics · queue refill authoring · queue publishing · velocity watch → breakout handoff — only items marked queue: ready by a human or by auto-authoring)
│   │   └── references/          #   growth-playbook.md (evidence-grade notation SoT) · growth-plan-template.md
│   ├── grow-instagram/          # /social-flow:grow-instagram — one autonomous Instagram growth tick (comment replies · skip/watch metrics · queue refill authoring · queue publishing — Reels go out only with queue_instagram: ready + a public URL)
│   │   └── references/          #   growth-playbook.md (two gates · disqualification SoT) · growth-plan-template.md
│   ├── review-recent/           # /social-flow:review-recent — feedback HTML for the last 5 episodes across YouTube/Instagram (funnel · bars · problem→hypothesis→next episode)
│   ├── inspect-content/         # read-only review of existing characters, backgrounds, props, scenarios and shot flow
│   ├── topic-scout/             # /social-flow:topic-scout — market-validated YouTube topics (5× channel median · chart HTML) + an SNS issues section (Threads/X/Instagram mentions · trending searches)
│   └── platform-guide/          # knowledge skill — platform grammar · video specs · Korean style SoT
│       └── references/          #   platform-playbook.md · korean-style.md · check-style.py (style check) · check-meta.js (YouTube meta check) · extract-text.js · formats.js + format-lint.js · pipeline.js + pipeline-lint.js · skill-lint.js · reply-gate.md · safezone-landscape.md
├── agents/
│   ├── brand-reviewer.md        # adversarial review of profile images & intro videos (95/90-point convergence loops when requested)
│   ├── content-reviewer.md      # adversarial pre-publish verification (one read at produce §10 on publish-bound episodes; plan mode on request)
│   ├── growth-post-reviewer.md  # adversarial review of growth-loop copy (AI tells · context — score recorded as evidence)
│   ├── slide-reviewer.md        # adversarial review of a rendered motion slide (design craft · no generated look · motion meaning · legibility — on request since 0.50.0; the flow uses check-slide.js and the author's sheet read)
│   └── storyboard-reviewer.md   # adversarial storyboard review, 8 modes — the flow calls narration and vocabulary (the spoken sentences alone, handed inline, on request, ≤3 reads) and, unattended, one batched scenario read; copy / scene / camera / sound / image stay for reads the user asks for by name
├── apps/
│   └── shoot-console/           # macOS SwiftUI recording console for the shooting-script flow (built locally via build-app.sh)
└── data/                        # content data root (see data/README.md)
```

## Local storyboards

Episodes are saved only under `data/<channel>/episodes/<topic>/`. Open
`storyboard/storyboard.html` to review the board. Research, scenarios, approvals,
media and publication logs stay in the local episode directory; no destination
selection or workspace key is required. SNS targets, connection records, genre, models,
visual style, video ratio and format live in the workspace's `.social-flow/models.json`;
each episode snapshots them in `.work/model-settings.json`, and `profile.md` keeps the
channel's tone, theme and pinned character voice IDs (the speech model itself is the saved `models.speech`).

## MCP tool surface (118 tools)

`project_manage`: options · status · init · update · episode. Local project setup
with genre, models, style, ratio, format and SNS records; no generation or publishing.

**`tools/list` does not show all 118.** The credential-gated publish, review and insights tools
(`threads_draft_create` · `threads_review_submit` · `threads_publish` · `instagram_publish` · `facebook_publish` · `facebook_comment` ·
`youtube_publish` · `threads_insights` · `instagram_insights` · `youtube_insights` ·
`threads_search`) are exposed **only for platforms whose credential file exists** —
evaluated at list time, so adding a token makes them appear without restarting the
server. Explicit tool-disable settings can reduce that list further. Hidden tools still have live handlers:
calling one directly returns a missing-token error rather than failing silently.
`content_feedback`, `youtube_topic_scout`, and `sns_issue_scout` sit outside the
platform gate and stay listed without tokens — the YouTube scout needs
`YOUTUBE_API_KEY` or channel OAuth at call time, the SNS scout needs
`SERPAPI_API_KEY`, and feedback simply skips the sections it has no token for.
(`youtube_update` is likewise always listed and errors without a token.)

| Group | Tools | Backend |
|---|---|---|
| Research | `youtube_topic_scout` | YouTube Data API — collects channels in your niche, finds videos at 5×+ their recent-upload median, and extracts topic phrases from titles (`YOUTUBE_API_KEY` first, else OAuth `youtube.readonly`) |
| Research | `sns_issue_scout` | SerpApi Google search with `site:threads.com` · `site:x.com` · `site:instagram.com`, collecting recent posts and counting topic phrases that recur across posts and platforms (+ Google trending searches). **A mention list with no engagement counts** — don't mix it into the same table as YouTube multipliers. Threads keyword search only returns your own posts before advanced access, and the Instagram Login API has no public search, so this is the only no-account path that sees all three at once |
| Research | `naver_search` | Naver Open API (25,000 calls/day free — first choice for Korean). 8 types: news·blog·web·cafe·kin (Knowledge-iN)·image·encyc·local |
| Research | `serp_web_search` / `serp_news_search` / `serp_naver_search` / `serp_image_search` / `serp_trending_now` | SerpApi (250 free/month — precision + international). naver takes where=web·news·image·video + a period filter, image takes license/size/aspect filters, trending_now returns per-country Google trending searches (4/24/48/168-hour windows, approximate volume and growth) |
| Research | `stock_search` | Free stock photos and clips — Pexels · Pixabay (`PEXELS_API_KEY` / `PIXABAY_API_KEY`) · NASA Image and Video Library · Wikimedia Commons (no key). Every item returns the `visual.license` block a `visual.source: "stock"` cut stores; Commons is filtered to public domain, CC0 and CC BY. The survey behind it, with license quotes and the Korean public-domain sources: [free stock sources](docs/research/2026-09-07-free-stock-sources/index.html) (Korean) |
| Open data | `datago_search` / `datago_detail` / `datago_file_download` | data.go.kr (no auth — search·detail·raw file) |
| Open data | `datago_file_fetch` / `datago_api_call` | odcloud · apis.data.go.kr (auth key + **per-API usage application** required) |
| Image routing | `image_catalog` / `image_plan` / `image_execute` / `image_status` | Saved image selection, model-specific capability checks, atomic cost reservations, duplicate protection and measured output receipts. [Routing contract](skills/_shared/image-routing.md). Host execution stays external. |
| Image generation | `image_local_generate` | Z-Image Turbo on-device via mflux (**no API key, no network, no billing — a $0 choice for the saved image model**; under Codex and Grok the CLI's own `image_gen` is the setup-time recommendation. Needs Apple Silicon + `uv tool install --python 3.12 mflux`; first call downloads 31GB of weights. No text inside images — Korean jamo break up) |
| Image generation | `mlx_image_generate` / `mlx_image_edit` | MLX Core / mlx-serve on loopback (**no vendor bill**. Optional lane — default stays Z-Image. Inspect actual Hangul. Model-specific edit/variation/alpha contracts apply. Fail closed if :11234 is down; this plugin never launches the app. `brew install --cask mlx-core`) |
| Image generation | `gpt_image_text2img` / `gpt_image_img2img` | OpenAI GPT Image (OPENAI_API_KEY — **saved selection takes precedence**: model-dependent sizes, up to 16 references, mask inpainting, usage receipts; GPT Image 2 transparent output is preview) |
| Video generation | `veo_text2video` / `veo_img2video` / `veo_extension` / `veo_reference` | Veo 3.1 (GEMINI_API_KEY — 720p–4k, 4/6/8s grid; **native audio, local-file extension, and live-person reference** are this engine's edge) |
| Video generation | `omni_text2video` / `omni_img2video` / `omni_extend` / `omni_edit` | Gemini Omni 1.1 Flash (GEMINI_API_KEY, Interactions API — 360p–4k, **any whole 3–10s**, and the only lane that **edits a clip by instruction** or extends a local mp4 to a 40s cumulative cap. **Billed flat ~$1.01 per call** — measured against the spend counter, not per second as the pricing page reads — so a 3s draft costs more than a full 8s veo-3.1-lite shot; worth it at the full 10s or for the edit lane, never for a short cut. No reference-image or negative-prompt field, and its person policy is unmeasured — photoreal faces stay on `veo_img2video`) |
| Video routing | `video_catalog` / `video_plan` / `video_execute` / `video_status` | Saved model selection, adapter validation, atomic episode budget reservations and durable request receipts. [Routing contract](skills/_shared/video-routing.md). |
| Video generation | `seedance_text2video` / `seedance_img2video` / `seedance_reference` | Seedance (ARK_API_KEY, BytePlus ModelArk — 480p–4k, **2–30s in 1-second steps** billed for what you request, 7 aspect ratios, up to 30 reference images plus reference audio — a character's fixed voice (`referenceAudioPaths`, 2.x) — plus reference video (`referenceVideoPaths`, 2.x): an optional 3D previz as `Video 1`, the vendor's clay-model reference — a generated cut may pre-render in Blender or three.js first (user directive 2026-09-11, optional since 2026-10-18), so the camera path and timing land as planned; a local clip is served through `MEDIA_UPLOAD_URL` or a cloudflared quick tunnel for the life of the task. Audio can be turned off, so silent cuts are cheap — $0.23 for 1080p 4s vs $0.64 on Veo lite. Every generated cut uses the saved video model and resolution (`PRODUCTION.videoModel`, from `.social-flow/models.json`); a per-cut change is an explicit user exception in `PRODUCTION.modelSettings.overrides`. The storyboard forecasts that model's cost. Which engine when: [decision table](skills/produce/references/video-model-selection.md)) |
| Video generation | `mlx_video_generate` | MLX Core / mlx-serve (24fps rgb8 muxed to mp4 with ffmpeg. Default 768×1280, RAM-capped at 800MB decoded RGB. Not the default path and not on the Veo/Seedance face-policy table. Pack install, request grid and measured render times: [LTX 2.5 runbook](docs/mlx-ltx-2.5.md)) |
| Video generation | `astra_text2video` / `astra_img2video` / `astra_keyframe_video` / `astra_audio2video` / `astra_ic_lora` / `astra_video_retake` | ASTRA video API (`ASTRA_VIDEO`, self-hosted LTX-2.5 — **our own box, so no per-call bill and no vendor policy**, but it renders ONE job at a time: 66–184s each plus queue, which makes it the batch lane rather than the interactive one. Six tools over the server modes; `tier` picks generate·guided·guided_fast·guided_hq, and `astra_ic_lora` runs one reference still or clip through an IC-LoRA adapter (adapters, `guidance`, `conditioning_mask`, `skip_stage_2`, `{name, strength}` lora entries and `generateAudio` are live since the 2026-10-17 server change). The only lane with `lora` adapters (`cinemagraph` · `slow-motion`, generate only), with a keyframe mode that passes through 2–8 supplied stills at chosen frame indices, and with a retake mode that re-rolls one time span of an existing clip. Length is frames (8k+1, 25–361 on every mode, the server's published ceiling); `duration` in seconds is converted to the nearest 8k+1 by the tool. `astra_video_capabilities` reads the live server's own limits; sizes sit on a 64-pixel grid with a 2,064,384-pixel ceiling, so 9:16 is **1024×1920** — 1088×1920 exceeds the area ceiling at every frame count, and 1080×1920 is off-grid. Clips carry 48kHz stereo AAC; `audio2video` carries the supplied sound re-encoded, rather than a newly generated track. Stereo (2-channel) input is required: mono is refused at upload because it fails in the engine audio encoder. With no duration, numFrames or audioMaxDuration, the client explicitly sends 121 frames (~5.04s) for compatibility because server omission metadata conflicts; `audioMaxDuration: 8` selects 185 frames (~7.71s) at 24fps. `generateAudio: false` strips the sound after generation (same GPU time). `expectLipSync: true` (on-screen speech only) measures with ffmpeg whether the picture moves with the supplied speech and re-renders with a new seed when it does not, up to `maxAttempts` (default 2); it never fails the call and leaves phoneme-level sync, the speaking person and voice identity `not_reviewed`. Which engine when: [decision table](skills/produce/references/video-model-selection.md)) |
| Unified ASTRA GenAI | `astra_genai_text2video` / `astra_genai_img2video` / `astra_genai_text2img` / `astra_genai_video_status` | Separate `astra-genai` engine and `ASTRA_GENAI_API_KEY` gateway token. LTX v2 text/image video and DashScope text-only PNG; no legacy audio2video, LoRA or retake. Managed plans require an explicit cost reservation. [Configuration and recovery](skills/_shared/astra-genai.md). |
| ASTRA upload management | `astra_video_list_uploads` / `astra_video_delete_upload` | List uploads with no arguments; delete one with `uploadId` after user approval. Requires `ASTRA_VIDEO` and server endpoint support. Uploads expire after 24h, with 200 files per key. Unsupported endpoints and invalid responses return errors; live verification is pending. |
| Common speech routing | `tts_route` | Read capabilities, validate a plan, or execute with a stable request ID. Existing raw tools share model, payload, output and concurrency checks. [TTS layers and recovery](skills/_shared/tts-routing.md). |
| Optional checked narration | `tts_generate_checked` | Legacy single-take synthesis wrapper with no automatic listening, scoring or retakes. New production uses raw generators and records `not_reviewed`. |
| Host media review | `host_review`, `acting_review`, `tts_review_acting`, `tts_review_final` | On request: prepare local media and record the executing host LLM’s actual observations; findings are evidence, not a delivery gate. No external evaluation API. Sampled frames support composition only; unsupported playback or listening stays unverified. |
| Pronunciation dictionary | `tts_elevenlabs_dictionary` | Creates Korean alias rules and returns pinned dictionary/version IDs for `pronunciationDictionaryLocators`. Keep the source name intact and test the actual pronunciation. |
| Voice identity design | `tts_voice_design` | Create a stored Gemini voice from age, timbre and accent, or remix `baseVoice`. Saves a WAV preview, reusable `voice_` ID and provider usage receipt. See [voice design](skills/_shared/gemini-voice-design.md). |
| Character voice auditions | `character_voice_audition` | On request: plan acoustic targets from character identity, compare real voice metadata, generate candidates with a stable Gemini voice baseline, and persist only the user-selected voice. |
| Voice generation | `tts_generate` / `tts_multi_speaker` / `tts_gemini_38` / `tts_list_voices` | Gemini TTS (GEMINI_API_KEY — curated and live library voice lookup, automatic language detection, saves mono 24kHz wav). `tts_gemini_38` uses the Interactions API for turn-level style, inline vocal events, and two-speaker backchannels. |
| Voice generation | `tts_elevenlabs_generate` / `tts_elevenlabs_dialogue` / `tts_elevenlabs_voices` | ElevenLabs (`ELEVENLABS_API_KEY`). Only `eleven_v4` is allowed for speech. Square-bracket acting tags, Stability/Similarity and timestamped output; no style/speed slider or SSML. Voice listing supports language/gender/accent filters, pagination and preview URLs. Supports /IPA/, documented 3-letter language codes, optional neighbor request IDs, PVC-as-IVC and Enterprise zero retention. Prefer ≤2,000 characters per Dialogue request; the 10,000 model ceiling is not a reliability promise. [v4 API contract](skills/_shared/elevenlabs-v4.md). Use current API pricing and save actual usage. |
| Sound effects | `sfx_elevenlabs_generate` | ElevenLabs text→SFX (ELEVENLABS_API_KEY — `eleven_text_to_sound_v2`, 0.5–30 s, prompt influence, seamless loops for room-tone beds). The endpoint has no WAV format, so the server asks for PCM and writes the RIFF header itself: a mono 48 kHz WAV the builder reads directly, plus a `.json` provenance sidecar (tool, model, prompt, seconds, request id, date, rights). The storyboard names each effect in `window.SFX` and points shots at it with `sound.sfx`; produce generates each id **once into the channel catalog** (`assets/audio/sfx/<id>.wav`) and later episodes reuse it at $0. $0.12 per minute of generated audio on every plan; the Free tier is non-commercial. Which cuts get one: [scenes-schema §sound effects](skills/storyboard/references/scenes-schema.md#sound-effects-windowsfx-soundsfx) |
| Speech recognition | `stt_local_transcribe` | Qwen3-ASR on-device via mlx-qwen3-asr/MLX (**no API key, no network, no billing — the default Korean STT**. Needs Apple Silicon + `uv tool install --python 3.12 "mlx-qwen3-asr[aligner]"`; the first call downloads ~3.4GB of weights. ingest runs the same engine and falls back to whisper.cpp without it) |
| Music routing | `music_catalog` / `music_plan` / `music_execute` / `music_status` | Saved model selection, native payload validation, budget/concurrency reservation, deduplication and verified 48 kHz stereo WAV. [Contract](skills/_shared/music-routing.md) |
| Music generation | `music_generate_song` / `music_generate_clip` / `music_generate` / `music_generate_advanced` / `music_list_options` | Google Lyria Clip / 3.5 songs and RealTime control. `GEMINI_API_KEY` |
| Music generation | `music_elevenlabs_generate` | Official Eleven Music v2 / v2.5; prompt or composition plan. `ELEVENLABS_API_KEY` |
| Music generation | `suno_generate` / `suno_generate_lyrics` / `suno_credits` | sunoapi.org third-party V6 family, not Suno Platform. V5 `suno_generate_sound` is retired and rejected. `SUNO_API_KEY` |
| Music generation | `mlx_music_generate` | Exact installed MLX Core music pack, local compute; default instrumental |
| 3D | `mlx_3d_generate` | MLX Core / mlx-serve (GLB from an image, consumed by the offline HTML mesh slide lane) |
| 3D previz | `blender_scene_read` / `blender_scene_build` / `blender_camera_set` / `blender_object_animate` / `blender_pose_key` / `blender_motion_import` / `blender_render_previz` | **Optional before a generated video cut** (user directive 2026-09-11, optional since 2026-10-18) — the same plan renders in three.js through `previz-template.html` + `previz-runtime.js` when Blender is not installed. The local Blender, headless (**no API key, no network, no add-on, no GUI** — needs Blender 4.2+). Reads a .blend; builds a set of grey proxies — a person is a jointed mannequin on a 19-bone rig — plus dog·car·box·cylinder·sphere and GLB imports at the cut's frame range and resolution; places and keys the camera by location, look-at target and lens in metres, degrees and mm; keys objects and people's roots through space; poses a person by channel (raise, elbow, knee, bow …) or retargets a BVH/FBX motion-capture clip onto it, scaled, faced and floored; renders a clean H.264 previz plus stamped stills in Workbench or Eevee. Camera, blocking and body timing as numbers, iterated for free before any paid generation, then handed through `video_plan` → `video_execute` as the reference video of a Seedance 2.x cut — the hand-off (previz → camera and timing, still → first frame, sheets → look, prompt → acting) is in [blender-previz.md](skills/storyboard/references/blender-previz.md) §6 |
| Growth review | `threads_draft_create` / `threads_review_submit` | Persist drafts and quote-grounded voice/purpose/flow reviews; no model API calls |
| Publish | `threads_publish` / `instagram_publish` / `facebook_publish` / `facebook_comment` / `youtube_publish` / `youtube_update` | Direct platform API calls — **exposed only for platforms with a credential file**, except `youtube_update`, which is always listed and errors without a token; it edits title/description/tags/visibility of an already-uploaded video and is the only way an upload goes public (`youtube_publish` starts `private`) |
| Comment inbox | `sns_comment_inbox` / `sns_comment_reply` / `sns_comment_moderate` | Cross-platform normalized inbox · replies · hiding (no deletes). Inbox and replies cover all 4 platforms; hiding excludes YouTube (its API only offers held-for-review, which means something else) |
| Storyboard | `storyboard_read` / `storyboard_apply` / `storyboard_check` / `scenario_check` | The episode board as sequences → scenes → shots (`window.STRUCTURE` beside the flat `SCENES` produce reads), plus the scenario input contract. `read` returns the tree at four levels; `apply` writes or patches the board and refuses to write past a violation; `storyboard_check` runs the structure rules plus the full `check-scenes.js` contract; `scenario_check` runs S1–S12 on `candidates/` or `scenario.md` and returns the checker JSON. Local files only — the board rules live in [structure-contract.js](skills/storyboard/references/structure-contract.js), shared with the checker and approval page |
| Capability | `capability_status` | What this machine has configured, grouped by capability with an "N of M" count, plus the env var that would unlock each missing provider. Call it before planning anything that spends money — otherwise a missing key only surfaces when the call fails, after the plan was built around it. Reports configuration, not reachability |
| Check | `sns_account_check` | Batch /me check across tokens (token values never shown) |
| Growth insights | `threads_insights` / `threads_search` | Threads insights (account/post metrics) + public keyword search — for grow-threads (`threads_manage_insights` · `threads_keyword_search` scopes) |
| Growth insights | `youtube_insights` | Channel stats + Analytics period metrics (views · engagedViews · average view ratio · shares · subscriber delta) + per-video metrics — for grow-youtube (`youtube.readonly` · `yt-analytics.readonly` scopes). **The 2–3 day lag covers half the response.** Everything Analytics serves — the channel window, each video's `period` block, `shares`, `averageViewPercentage` — runs 2–3 days behind at day granularity, so sharing cannot be read in the first hours. Each video's `lifetime` block (views · likes · comments) is the Data API's public counter and carries no lag; that is what the velocity watch samples. It is a cached counter that can sit still on a fresh video, so one low reading is not a verdict — the threshold comes from the channel's own growth-log, not from a number written here |
| Growth insights | `instagram_insights` | Account period metrics (reach · views · profile visits · saves) + per-media metrics — Reels alone carry `reels_skip_rate` and `ig_reels_avg_watch_time` (hook/retention verdicts). For grow-instagram (`instagram_business_manage_insights` scope; follower count comes from the profile field) |
| Growth insights | `content_feedback` | Scores the last N episodes (default 5) against channel medians, split YouTube/Instagram, and writes a funnel/bar HTML to `data/<channel>/growth/review-recent.html`. Share rate is one of the compared axes on both platforms, but the two are not the same number — YouTube divides shares by views because Analytics gives it no reach, Instagram divides by reach — so a rate is read within its own platform. Platforms without tokens just lose their section |

Search tools (`*_search`) share argument names — **`query` · `limit` · `page`**.
Whatever the backend API calls them (`q`, `display`, `num`, `start`), the server does
the mapping. The contract tests enforce this convention, so new search tools use the
same names.

Publish tools have no review gate of their own — **a Threads, Instagram or Facebook call
posts immediately; a YouTube upload starts `private` (`unlisted` stays allowed) and goes public only through
`youtube_update`** — so they run behind the publish skill's HITL approval or inside an approved
standing growth plan. The growth skills' autonomous mode (grow-threads · grow-youtube ·
grow-instagram) publishes without per-post approval, but only inside the
`growth-plan.md` standing authorization approved via HITL at init, and flips a YouTube upload
public the same way once thumbnail and metadata are confirmed. grow-threads
decides its own posting frequency with no daily cap; every outgoing text carries its
`check-style.py` findings and any growth-post-reviewer read as evidence beside the post —
neither a score nor a P0 label gates it (the 95 bar of earlier versions is history). The two video platforms
add one more line of defense — only episodes with a queue marker in storyboard.md go
out, and the markers are per-platform (YouTube `queue: ready` · Instagram
`queue_instagram: ready`). If they shared one key, whichever loop ran first would
consume the marker and the other platform would never publish. Two things set
markers: a human, or — when the plan enables `autoproduce` — the loop itself
authoring one episode when the queue runs dry. Auto-authored episodes become `ready`
when the build finished inside the cost cap with verified facts and a clean build report;
`hold` is reserved for technical, budget or authorization failures, and review findings
(scenario read · narration reads · style · content-reviewer) travel with the episode as
evidence. grow-instagram publishes only with a public HTTPS URL, and with no hosting
configured it disables both publishing and auto-authoring (the loop won't start
tunnels, and it won't spend money making a video with no way out).

Generation tools run **inside this plugin — no external MCP server required**.
Keys cover hosted models: OPENAI_API_KEY for images, GEMINI_API_KEY for Gemini
video/voice/music, ARK_API_KEY for Seedance and ELEVENLABS_API_KEY for ElevenLabs.
Local image, STT, music and video tools retain their own capability requirements.
Local speech synthesis is removed, including Supertonic and MLX TTS.

- **Speech uses the saved Gemini model or ElevenLabs `eleven_v4`.** Every ElevenLabs
  speech request rejects older model IDs. No failed call silently switches provider.
- **Identity and acting are separate.** Pin each character's voice ID/model and store
  line-specific `acting.direction`/`acting.tags` beside spoken text and subtitles.
  `speech_manage` tracks acting edits as speech revisions. Follow the
  [acting-prompt guide](skills/produce/references/acting-prompts.md).
- **Character auditions run on request.** When the user wants options, make real audio
  candidates with the same sample text and the saved engine/model, play or expose them, and
  persist the one the user selects; otherwise cast from the saved speech model and record
  `not_reviewed`. A draft sheet is not a voice choice.
- **Raw speech has no automatic quality gate.** Save audio and generation provenance
  with `not_reviewed`. A requested adversarial improvement loop evaluates real audio
  against its stated target and records each finding; it does not become the default.
- **Use WAV for assembly.** Keep provider timestamps and actual generated duration;
  resample sources where required. A mixed-speaker dialogue take still needs a supported
  scene/line binding before it can enter the current single-speaker scene builder.
- **BGM follows saved `models.music`** through `music_plan → music_execute`.
  Existing channel audio is reused first. See the [provider research](docs/research/2026-10-18-music-models/README.md)
  for official contracts, Korean support evidence and third-party boundaries.
- **`tts_multi_speaker` on the flash model often rejects short dialogue scripts**
  (`Model tried to generate text…`). The server does not retry: report the failure, and change
  the model only as an explicit user exception recorded in `PRODUCTION.modelSettings.overrides`
  (`gemini-2.5-pro-preview-tts` accepted the same script when this was verified).
- Lyria's prompt policy filter is touchy — a "lo-fi/vinyl crackle" combination has
  been blocked; plain descriptions of instruments and mood pass.

## Environment variables & credentials

`.mcp.json` passes these through from your shell environment, and the server fills
whatever arrives unset or empty from `~/.config/social-flow/.env` (`<SNS_TOKEN_DIR>/.env`,
`KEY=VALUE` lines, the shell value winning) — the path for hosts without a shell: Cowork,
Claude Desktop, the ChatGPT desktop app. Secrets never go into committed files — with a
variable unset, only the tools that need it return an explicit error and everything else
works.

| Variable | Required for | Default | Purpose |
|---|---|---|---|
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | naver_search | — | Naver Open API (developers.naver.com) |
| `SERPAPI_API_KEY` | serp_* | — | SerpApi key |
| `PEXELS_API_KEY` | stock_search (Pexels) | — | Pexels API key (pexels.com/api — free, 200 requests/hour; NASA and Wikimedia Commons need no key) |
| `PIXABAY_API_KEY` | stock_search (Pixabay) | — | Pixabay API key (pixabay.com/api/docs — free, 100 requests/minute) |
| `DATA_GO_KR_API_KEY` | datago_file_fetch · api_call | — | data.go.kr auth key (My Page on data.go.kr — beyond the key, each API needs a **per-API usage application**. Search/detail/download work without a key) |
| `OPENAI_API_KEY` | gpt_image_* | — | OpenAI API key (platform.openai.com/api-keys — image generation) |
| `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) | veo_* · omni_* · tts_generate · tts_multi_speaker · tts_gemini_38 · music_* | — | Gemini API key (aistudio.google.com/apikey — video, voice, and music generation. ElevenLabs uses its own key) |
| `ARK_API_KEY` | seedance_* | — | BytePlus ModelArk API key (ai.byteplus.com/ark — the second video engine. Dreamina Seedance 2.x models additionally require **an account balance over $30 or a resource pack** to activate; 1.5 pro and 1.0 have no such gate. `veo_*` works fine without this key) |
| `SUNO_API_KEY` | suno_* | — | sunoapi.org API key (https://sunoapi.org/api-key — third-party REST, not Gemini and not an official Suno Inc. API). Unset, `music_*(Lyria)` still works |
| `SUNO_BASE_URL` | | `https://api.sunoapi.org` | Same-spec self-host or regional mirror. Other vendors use different auth/paths — do not point this there |
| `ELEVENLABS_API_KEY` | tts_elevenlabs_* · sfx_elevenlabs_generate | — | ElevenLabs API key (elevenlabs.io/app/settings/api-keys — a restricted key needs the `text_to_speech` permission, plus `voices_read` for `tts_elevenlabs_voices` and the sound-generation permission for `sfx_elevenlabs_generate`). Unset, `tts_generate` (Gemini) still works |
| `ELEVENLABS_BASE_URL` | | `https://api.elevenlabs.io` | Same-spec proxy or the EU residency host (`api.eu.residency.elevenlabs.io`). Normally leave it alone |
| `ARK_BASE_URL` | | `https://ark.ap-southeast.bytepluses.com/api/v3` | ModelArk region endpoint. The video models only exist in ap-southeast-1, so normally leave it alone |
| `QWEN3_ASR_BIN` | | `~/.local/bin/mlx-qwen3-asr` | Local STT executable. With the default uv tool install location there is nothing to set |
| `MLX_SERVE_URL` | mlx_* | `http://127.0.0.1:11234` | MLX Core / mlx-serve HTTP base. This plugin never launches the app; a down server fails closed |
| `MLX_SERVE_API_KEY` | mlx_* on a non-loopback bind | — | Optional bearer. Loopback needs no key unless the server was started with `--api-key-strict` |
| `SNS_TOKEN_DIR` | | `~/.config/social-flow` | Root directory for SNS credentials |
| `MFLUX_ZIMAGE_BIN` | image_local_generate | `~/.local/bin/mflux-generate-z-image-turbo` | Local Z-Image executable |
| `BLENDER` | blender_* | auto-resolved (Blender.app, PATH) | Blender executable or app bundle for the previz tools |
| `YOUTUBE_API_KEY` | youtube_topic_scout | — | YouTube Data API key (public stats; the OAuth client covers publishing) |
| `SOCIAL_FLOW_YT_CHUNK_MB` | youtube_publish | `8` | Resumable-upload chunk size |
| `HF_HOME` | image_local_generate · stt_local_transcribe | HF default | Hugging Face cache for the local models |
| `MEDIA_UPLOAD_URL` / `MEDIA_UPLOAD_API_KEY` | grow-threads image posts · Seedance reference-video hosting | — | Media hosting endpoint + key. Threads only accepts images as **public URLs**, so local files need somewhere to live. Anything works that accepts `POST` with an `x-api-key` header + raw bytes, returns `201 {data:{url}}`, and serves that url as unauthenticated public GET (the header of `skills/grow-threads/references/upload-media.sh` is the contract SoT). Unset, only the image step turns off — text posts still go out |
| `THREADS_TOKEN_FILE` and friends | | `<SNS_TOKEN_DIR>/conventional name` | Per-platform override of the default (flat) path — not applied to channel directories |

Credential file convention (mode 600, never committed) — `threads_token` ·
`instagram_token` · `facebook_page_token` · `youtube-oauth-client.json`.
**Multi-channel**: per-channel tokens live under `<SNS_TOKEN_DIR>/<channel slug>/`
with the same file names, selected by the publish tools' `channel` argument — with a
channel specified, only that directory is used, with no fallback to the flat tokens
(prevents wrong-account publishing). The flat files are the no-channel
(single-channel/legacy) path. **Only platforms with a file present get their publish
tools listed** (union of flat and channel directories). Issuance and renewal:
`skills/publish/references/token-setup.md`.

**Turning individual tools off**: two layers, env first then the JSON file.

1. Environment (per session — list these in `.mcp.json` `env` so the host passes
   them through). Highest first:
   - `SOCIAL_FLOW_TOOL_<NAME>` — one tool (`SOCIAL_FLOW_TOOL_SUNO_GENERATE=off`)
   - `SOCIAL_FLOW_TOOL_FLAGS` — several tools in one line (`suno_generate=0,veo_*=off`)
   - `SOCIAL_FLOW_TOOLS` — allowlist; if set, only the listed names/families stay on
   - `SOCIAL_FLOW_DISABLE_TOOLS` — denylist (`suno_*,seedance_*`)
2. `<SNS_TOKEN_DIR>/disabled-tools.json` — a JSON array of tool names, where a
   trailing `*` covers a family. For example `["seedance_*"]` turns off all three
   Seedance video tools while keeping `veo_*` on. Persistent across sessions.

A listed tool disappears from ListTools and direct calls get an explicit refusal.
The JSON file is read per request, so edits apply without a server restart; remove
the entry (or delete the file) to turn the tools back on. A per-tool env override
can turn one JSON-disabled tool back on for that session. Values split on commas
or whitespace; a bare `*` matches every tool.

## Documentation (docs/)

Latest image model research: **[Image APIs, local models and production tips](docs/research/2026-10-18-image-models/README.md)** — model-by-model official documentation, pricing, retirement dates, generation/editing examples and differences from the current adapters, checked 2026-10-18 (Korean).

Latest video API research: **[MiniMax H3, LTX 2.5, Seedance and Veo API pricing](docs/research/2026-10-18-video-model-api-pricing/README.md)** — official endpoints, model capabilities, per-second/token rates and reference-input charges, checked 2026-10-18 (Korean).

Manuals are bilingual — Korean pages with English siblings (`*.en.html`).
Full index: **[docs/index.html](docs/index.html)** (Korean) ·
**[docs/index.en.html](docs/index.en.html)** (English).

### API reference (docs/api-reference/)

Side-by-side notes on the official contracts of the 12 external APIs the internal MCP
server calls, and how this implementation honors (or deliberately narrows) each one.

- **[API reference hub](docs/api-reference/index.html)** — inventory · credential matrix · tool↔API map
- **[MCP tool spec & best practices](docs/api-reference/mcp-tools.html)** — Tool
  fields, behavior-hint decision table, 7 authoring principles, quality rubric
- **[Tool quality audit](docs/api-reference/tool-audit.html)** — scores and fixes for
  the 31 tools as of 2026-07-29 (tools added since are unaudited)
- Individual APIs — [Gemini TTS](docs/api-reference/gemini-tts.html) ·
  [ElevenLabs TTS](docs/api-reference/elevenlabs-tts.html) ·
  [Veo 3.1](docs/api-reference/gemini-veo.html) ·
  [Veo people & reference policy](docs/api-reference/veo-portrait.html) ·
  [Seedance](docs/api-reference/seedance.html) ·
  [Seedance people & asset policy](docs/api-reference/seedance-portrait.html) ·
  [Lyria](docs/api-reference/gemini-lyria.html) ·
  [Suno](docs/api-reference/suno.html) ·
  [OpenAI Images](docs/api-reference/openai-images.html) ·
  [SerpApi](docs/api-reference/serpapi.html) ·
  [Naver Search](docs/api-reference/naver-search.html) ·
  [data.go.kr](docs/api-reference/data-go-kr.html) ·
  [Meta Graph](docs/api-reference/meta-graph.html) ·
  [YouTube Data](docs/api-reference/youtube-data.html)

The on-device engines (`image_local_generate` ·
`stt_local_transcribe` · the five `mlx_*` tools) have no
external vendor contract to document, so their evidence lives in research notes instead —
[local image generation](docs/research/2026-08-12-local-image-generation/index.html) ·
[historical local TTS research](docs/research/2026-08-11-local-tts-and-commercial-api/index.html)
(Korean).

### Guides (docs/guides/)

- **[Getting started](docs/guides/getting-started/index.html)** — install, API key
  setup, first channel, first episode.
- **[Costs & API keys](docs/guides/costs-and-keys/index.html)** — what image, video,
  TTS, and STT actually cost, the on-device alternatives that cost nothing, setup for
  both lanes, and how the per-episode cap is enforced.
- **[Improv recording guide](docs/guides/ingest-usage/index.html)** — screen
  recording (+voice) → timeline → storyboard → publish, with prep, recording tips,
  and tuning knobs.
- **[Shooting script guide](docs/guides/screencast-usage/index.html)** — the
  storyboard-first shooting flow: filming rules, alignment-drift reports, edit-screen
  layout, troubleshooting.
- **[Threads growth best practices](docs/guides/threads-growth/index.html)** —
  per-post review, the ten ranking predictions, measured post types, reply
  culture. The commentary edition of grow-threads.
- **[YouTube Shorts growth best practices](docs/guides/youtube-shorts-growth/index.html)** —
  the AI-disclosure boundary, the 2027 YPP changes, myths the official docs deny. The
  commentary edition of grow-youtube.
- **[Instagram Reels growth best practices](docs/guides/instagram-growth/index.html)** —
  the two gates of account standing and per-post auditions, what ranking actually
  predicts, 9 myths that died in verification. The commentary edition of grow-instagram.
- **[Making short-form video with AI](docs/guides/ai-video-production/index.html)** —
  where the two video engines diverge, official prompt rules, and how to keep optional subtitle files separate from the video.
- **[Marketing basics](docs/guides/marketing-basics/index.html)** — the vocabulary a
  marketing beginner needs first.
- **[Affiliate video compliance](docs/guides/affiliate-video-compliance/index.html)** —
  the five gates when promoting Shopping Connect products on YouTube; wording for
  products you haven't used and AI-character disclosure.

## Safety contract (summary)

- **Double HITL gate** — storyboard approval (before production) + publish approval
  (before going public). No publish tool call without approval or an approved standing growth
  plan. Narration reads run on request and their findings sit on the approval screen as evidence
  (the flow forces no review loop); anything they leave open gets its human look there.
- **No fact distortion** — time-sensitive values get two independent sources; ranges
  stay ranges.
- **No cross-post copy-paste** — every platform gets its sentences redesigned.
- **No plaintext tokens** — file-based, account resolved via /me.
- **Generated visuals restricted** — mood shots and the channel's own character only.
  No real people, no national symbols, no staged news footage.

## Intended use

This plugin was built for **operating your own accounts yourself**. Publishing,
comments, and growth loops all use each platform's official API, with credentials you
issue for your own accounts.

- **Platform terms outrank this tool.** Complying with the automation and spam
  policies of Threads, Instagram, Facebook, and YouTube is on you. That's also why
  the growth loops ship with rules against engagement-begging and follow-for-follow.
- **Don't run other people's accounts with it, and don't blast the same post across
  multiple accounts.**
- **Follow AI-generated content disclosure duties** — YouTube has
  `containsSyntheticMedia`; the other platforms have their own rules.
- Generated visuals must avoid real people, national symbols, and staged news
  footage (see the safety contract).

No warranty. What this tool creates, and what happens after you publish it, is your
responsibility (see the disclaimer in LICENSE).

## License

[Apache License 2.0](LICENSE). Copyright 2026 Zeans.


### Generated character voice lock

New character speech uses the selected Gemini or ElevenLabs v4 voice before audio-conditioned
video generation. The older `voice_lock_apply`/v2 speech-to-speech lane is removed.
Existing recordings remain reusable with their provenance. See the
[produce contract](skills/produce/references/voice-lock.md).

### Offline character and storyboard library

`node skills/channel/references/review-library.js data/<channel>` saves a channel
home, `assets/characters/index.html`, `assets/characters/<id>/index.html`,
`storyboards/index.html` and `storyboards/<episode>/index.html`. All open directly
with file://, with bundled Wanted Sans and no network request. Character sheets
show front/back/face, additional images, identity and voice. Episode pages use the
same canonical review renderer; production inputs remain in `episodes/`.
`--check` detects stale/missing exports without writing. Character and storyboard
skills refresh these views before delivery. The optional channel HTTP browser now
opens this library; its previous API browser is at `/legacy`.

See
[local review design](skills/channel/references/local-review-design.md) for the
reference, supported offline behavior and visual verification scope.

### Prop sheets and story-time ownership

Storyboards support independent owners and holders, initial states, atomic transfer/loss/damage events, flashbacks, and per-shot state assertions. The shared offline review has prop sheets and character/time filters. MCP edits require the current file hash; CLI edits also back up the original. See [prop continuity](skills/storyboard/references/prop-continuity.md) for authoring, production snapshots.


### Character-led scenario authoring

New scenarios select characters from the channel library, including narrators, and develop
actions, dialogue and narration together. `scenario-v2` separates evidence, fiction and adapted
content; fictional events need internal consistency, not search quotas or fabricated sources.
`story-v2` reviews observable performance before camera work and keeps speech in the existing
`narration[]`/`speaker` production contract. See the [authoring and review contract](skills/storyboard/references/character-scenarios.md).
Existing unversioned scenarios and story-v1 boards retain their checks.

### Structured character identity

New and updated character sheets carry explicit personality, measurements, speech,
acting, relationships and continuity fields, each confirmed, pending or not applicable.
The local compiler generates lane-specific directions; review export refuses a pass
for incomplete settings. Follow [the character contract](skills/channel/references/character-identity.md).
Existing sheets need explicit migration; legacy storyboards remain readable.

## Shot dialogue and later corrections

New storyboards assign stable line ids, explicit speakers (narrator included) and delivery
modes. `speech_manage` lists, prepares, patches and binds audio to dialogue, and plans video
from adapter capabilities. Per-line `acting` separates situation, intent, emotion, vocal and
visual direction from the pinned character voice, with optional reaction time before/after
speech. `plan_audio` returns the selected raw generator arguments and unsupported-control
warnings; production uses those arguments instead of repeating one generic character tone.
Video prompts use the same beat and a matching source-image state. Distinct emotional beats
are not concatenated by shared image and sliced at arbitrary audio boundaries.
`edit-speech` repairs a requested shot/character without replacing
unaffected takes. Speech generation has no automatic listening or human approval gate;
outputs are marked `not_reviewed`. File, voice and timing provenance remain required.
See [the speech contract](skills/produce/references/shot-speech.md). Video models are
replaceable: audio-conditioned generation, post lip-sync and off-screen voiceover are separate
routes; LTX is one adapter, not the common data model.

### Inspect existing content

`inspect-content` reviews existing characters, backgrounds, props, scenarios, individual shots
and whole-story flow without editing or generating. `storyboard_read` includes silent actions,
attributed speech, stable shot IDs and optional full context; `shotId` selects a shot with its
neighbours. Returned metadata and prior review records are explicitly unverified until read.

Creative quality guidance lives in [the shared automation guide](skills/_shared/automation-guidance.md).
CTA checks are removed. Missing review scores and creative metadata are advice;
invalid references, unusable media and actual spending authorization remain execution contracts.

### Clean video and optional subtitle tracks (2026-10-17)

Videos contain no burned-in subtitles, even when they contain speech. The builders ignore legacy burn-in switches and never select an old `*-sub.mp4` as the publishing master. Generated performance prompts prohibit caption/text overlays. Optional SRT files stay separate; when requested, YouTube uploads them as viewer-selectable caption tracks. A missing SRT is not a production defect. This user directive replaces earlier subtitle burn-in guidance.

## Host evaluation

`host_review` prepares local media or records timestamped observations from the LLM
running the plugin. No external evaluation model is called. Legacy `acting_review`,
`tts_review_acting` and `tts_review_final` prepare the same handoff;
`tts_generate_checked` generates one take without scoring or automatic retakes.
Sampled frames support composition only; playback and listening require actual host
capabilities. Unsupported checks stay unverified. See [the review contract](skills/_shared/host-review.md).

Motion graphics support six contextual design themes: report, product, learning, campaign, story and playful. Set the storyboard default with `THEME.motionGraphicTheme`; individual shots can override it. Set `shot.motionGraphic.style.theme.id` to `auto` (optionally with `context`) or a theme id. Storyboard updates store the resolved choice and reason; the renderer uses the same theme tokens for typography, spacing, color and timing. Palette-only boards retain their existing appearance.

Theme typography bundles Paperlogy, Black Han Sans, Gowun Batang, Dongle, Jua, Space Grotesk and Roboto Flex with OFL notices. Font coverage is checked against bundled cmap data; title fallbacks are recorded, and actual loaded font widths drive wrapping. See [motion design system](docs/design-system/MOTION.md) and [font research](docs/design-system/FONTS.md).
