# social-flow — Project instructions

Channel-based short-form/long-form content pipeline Claude Code plugin.

## Owner decisions (2026-10-18)

- Precedence: the later-dated directive wins, and a superseded sentence is deleted in place, not kept under a banner.
- Delivered video is subtitle-free, including speech (2026-10-17): no subtitle, caption, label or mark of any kind over a moving picture; a separate SRT only when the user asks.
- Korean style S1 findings (`check-style.py`) are suggestions, never execution gates.
- The Threads server gate is removed: the draft/body-hash binding stays, reviews are hash-bound evidence, and no score, P0 label or gate file blocks a post.
- Previz is optional; no checker refuses a generated cut without one.
- The production ratio is a planning target and cost ceiling: the band's upper bound and the budget are enforced, the lower bound is not.
- Every YouTube upload starts `private`; `youtube_update` flips it to public, and growth loops run the same sequence under the approved plan.
- Channel assets (logos, intros, growth images) follow `.social-flow/models.json` like episodes; initial image setup recommends ASTRA GenAI; video setup recommends a supported host tool.
- `treatment:"footage"` is a retired route and a hard execution error.
- An unattended run without complete settings reports `project_setup_required` and defers authoring.
- Initial style, ratio and format are asked once at project setup, then reused.
- The static-ground limit is guidance.

## Production order (owner directive, 2026-10-19; checks removed 2026-10-31; cast gate 2026-11-01)

Project setup must be ready before any episode authoring. Then characters (text + images),
the story and its shots, props (text + images), backgrounds (text + images), the shots'
images, and finally video, in that order. Explicit text-only requests stop at text, but the
episode cast comes first even then: `story_sequence` refuses to start a board inside an episode,
and `story_scene`/`story_shot` refuse to continue a story-first one, until `storyboard/cast.json` names its characters, each with `assets/characters/<id>/identity.md`
and, unless the entry is `voiceOnly` (a narrator who is never seen), its face, front and back
sheet panels (`cast_required`, `cast_source_missing`, `character_panel_missing`). Other missing
images are reported, and missing panels are made with `character_panel` under spending
authorization, never skipped or generated without it. Present the scenario before detailed text authoring; presentation does not
add an approval pause. Use the bundled storyboard HTML. Delegated authors use the same
order and deliverables. See `skills/_shared/production-workflow.md`.

## Checks removed for speed (user directive, 2026-10-31)

Production is too slow, so every check except the story order and the episode cast (2026-11-01,
above) goes until the quality is known; checks come back afterwards. `production_workflow` is an optional progress record:
stages complete in any order and no other tool reads it. Image and video plans, storyboard
writes, Blender renders and assembly no longer wait for workflow stages, independent
reviews, Blender compositions or reviewed media. `storyboard_apply` refuses only an
unreadable board and the story order; `storyboard_check` runs every other rule on request.
review-context, review-camera, compose-blender, review-cut-images and review-cut-videos run
only when the user asks. Spending limits, generation authorization, adapter input validation,
`video_prompt_language`, `msr_character_limit` and the voice-lane rules stay. Existing
episodes are regenerated in the new order rather than migrated.

## Guided automation (owner directive, 2026-10-16)

CTA checks are removed. Creative structure, writing style,
camera direction, review scores, frozen stamps and subjective quality belong primarily
in skills as guidance, not automatic execution gates. Continue authorized work with honest findings and
`not_reviewed` or stale evidence instead of manufacturing a passing review. A user
who explicitly requests a quality-improvement loop still gets that loop; its score
does not become a prerequisite for unrelated tool execution.

Keep the minimum contracts required to execute: readable inputs, stable references,
supported adapter payloads, usable media, finite timing, concurrency and actual
spending limits. Existing authorization persists. Quality warnings do not require a
new approval: video and visual-plan findings at assembly (2026-09-14) are shown with
the output and kept in the build record, and authorized assembly proceeds without
fabricated PASS reviews or a second question. This
does not expand the requested artifact into paid generation, external uploads or
publishing that the user has not authorized. Prefer the skill's practical guidance
over mandatory metadata and arbitrary checker thresholds.
[README.md](README.md) is the source of truth for structure, skills, and the MCP tool list.

## Speech production (user directive, 2026-10-16)

Generate speech without automatic listening/scoring/STT or human approval gates. Record
`not_reviewed`, never a fabricated pass. Keep file, speaker, voice settings and timing
provenance so the user can request targeted corrections later through `edit-speech` and
`speech_manage`. This supersedes previous speech-quality and final-listening gates, including
voice-lock ASR. Follow `skills/produce/references/shot-speech.md`. Narrator and character
lines use explicit speakers; video models are replaceable adapters with declared capabilities.

## MSR voice and LTX default (user directive, 2026-10-30; voice optional 2026-10-31)

MSR renders a cut from subject and background images; any dialogue is written in the
prompt, and MSR's own speech-and-effects soundtrack is the cut's audio. A speaker's pinned
voice sample is optional: when the speaker is subject 1 or 2 and the gateway accepts
samples, the sample rides on that subject image; otherwise the prompt voices the speaker
and the plan records a warning. A request that sends a sample to a gateway without sample
support is a hard `msr_voice_unsupported` error. There is no external TTS lane for MSR,
so its lines get no per-line TTS: `speech_manage` plans and binds an MSR shot as `native`
(line revisions, no line audio) and an edited line marks the clip stale (2026-10-31).
A cut without dialogue can use MSR or img2video. A character's default MSR references are
its sheet panels — face close-up, headless front and headless back (2026-10-31): one
character uses all three; two use each face, then each front; the shot's start image (its characters,
place and props composed by `shot_image`) takes the background slot, and the plain place picture stays out.
At most two characters take references; anyone else on screen is described in the action
and drawn by the model, and `video_plan` refuses references for a third character
(`msr_character_limit`). `video_plan` names the panels that show one character and lays the
prompt out as the model card does: reference descriptions first, then the action, then
`Audio N (Image M): "…"` lines.

## Voice-consistent video models only (user directive, 2026-10-31)

Video models that cannot keep a character's voice are not supported: Veo, Gemini Omni and
Seedance 1.x left the plugin. Every adapter in `server/src/video-registry.ts` declares a voice
lane — `reference` (a pinned per-character voice sample: `astra_genai_msr`, `seedance_reference`,
`fasth3_omni_reference`), `supplied` (the pinned TTS track drives the clip: the three
audio2video adapters) or `none`. `video_plan` refuses `voice_lane_required` when a `none`
adapter would show a character speaking (an `on_screen` line) or voice lines natively;
narration over a non-speaking picture runs on any adapter. A saved or override selection
naming a retired engine reads `migration_required` in settings and fails `video_plan` with
`video_engine_unsupported`. Their existing clips stay reusable through `visual.reuse`; never
regenerate solely to migrate. MSR keeps the contract above. Seedance binds each speaker's
image and sample in the prompt (`@Image N`/`@Audio N` on 2.5, `Image N`/`Audio N` on 2.0) and
rejects real human faces, so photoreal people go to the LTX lanes.

## One storyboard template (user directive, 2026-10-31)

`skills/storyboard/references/storyboard-html-template.html` is the storyboard design for every
episode. `storyboard-html.js` copies it with its helpers, keeping only `<title>` and the
`SB_DOC` block. Design changes go into the bundled template, not into an episode or library copy. Each shot and
`STRUCTURE` scene carries a one-sentence `summary` of its story for the review.

## Story, characters and lines, icons, images, prompt, approved video (user directive, 2026-10-31)

Once the scenario is settled, the storyboard's first step writes only the story, one layer at a
time: `story_sequence` → `story_scene` → `story_shot` (one sentence per shot). No image, speech,
prompt, camera or dialogue work happens in it. The second step sets each shot's characters with
`shot_characters` (at most two, or none), then each character's lines with `shot_dialogue`. The
third sets the attributes the review's icon row shows with `shot_icons`: render route, size,
angle, camera move, focus, depth and frame plan (`reference` is MSR). Each tool refuses a layer
whose parent is missing (`story_order`); `shot_characters` waits for a story with no gaps and
`shot_icons` for every shot's characters. Inside an episode a new board starts with
`story_sequence` — `storyboard_apply` does not create one — and carries
`STORY.authoring:"story-first"`; on such a board every writer refuses a shot without its story,
and lines or icon attributes before the shot's characters. Its cast comes from
`storyboard/cast.json` alone (`SB_DOC.characters` adds detail, not members), and `shot_characters`
and `shot_dialogue` repeat the cast check above; `shot_characters` refuses a `voiceOnly` character
on screen (`cast_voice_only`). Older boards keep their contract.
`production_workflow` completes a story-v2 `text_storyboard` only with every shot story and
every shot's characters written (`story_outline_required`).

The fourth step makes each picture shot's start image with `shot_image`, from its characters'
sheet panels (one character: face, headless front, headless back; two: each face, then each
front), its place and props, with a prompt built from its size, angle, depth and techniques,
the episode style and an English description. When the place's sheet names a built set
(`SB_DOC.locations[].manifest`), Image 1 is that set rendered in Blender from a camera the shot's
size and angle set, aimed at its cast's blocking, and the sheet image only gives the look
(2026-11-01); without a set the sheet image leads, with a warning. It runs
`image_plan` → `image_execute` with the saved model. An end image follows only for a
`first_last` shot (`frame:"end"`, edited from the start image). A model that takes one
picture refuses (`image_references_unsupported`); the user chooses the replacement. The fifth
writes each `generated_video` shot's English video prompt with `shot_prompt` from its icon
attributes, on-screen lines and an English action; `video_plan` sends it when its args name no
prompt. `shot_image` waits for every shot's icon attributes and `shot_prompt` for every
picture shot's images. On MSR the start image rides in the background slot and the plain
place picture stays out. Each shot's video then waits for the user's yes to its plan
(`video_approve {planIds}`), or their approval of every shot (`video_approve {auto:true}`);
`video_execute` refuses otherwise (`video_approval_required`). The session never records an
approval the user did not give.

## English video prompts (user directive, 2026-10-31)

Every video prompt is English on every adapter, Seedance 2.5 included. Only dialogue uses the
video's language, inside quotation marks. `video_plan` and the Seedance adapter refuse
non-Latin letters outside quotes (`video_prompt_language`). Assembled prompts name a cast member
with a non-Latin name by character id and report a non-English voice description for translation;
`speech_manage` warns when its scene videoPrompt carries authored text in another language.

## Two principal characters per shot (user directive, 2026-10-31)

From the storyboard on, a shot's `visual.character` lists at most two principal characters;
`check-scenes.js` rejects a third (`[character-limit]`). When a beat needs three principal
characters, split it into shots — pairs, reverse angles or a cutaway — instead of crowding one
frame. Extras and unnamed figures stay out of `visual.character` and are described by
appearance in the action, without a reference image.
Choosing LTX at project setup saves `{engine:"astra-genai", operation:"reference"}`
with `resolution:"1792x1024"` for 16:9 (`1024x1792` for 9:16), so `video_plan` plans
MSR when a call names no operation. GenAI submissions wait up to 15 minutes for the
gateway's acknowledgement. See `skills/_shared/astra-genai.md`.

## Style ban — report-style stative verbs (user directive, 2026-08-12)

Don't close sentences with Korean endings of the
**남긴다 · 갈린다 · 나뉜다 · 남는다 · 남습니다 · 나뉩니다 · 갈립니다 · 남깁니다**
family. Wrapping a phenomenon up in a single verb is narration-style prose — an AI tell.
Name the subject and write concretely instead — "근거를 남긴다" → "근거를 적어 둔다",
"추천이 갈린다" → "미용실마다 다른 색을 권한다", "둘로 나뉜다" → "두 갈래다".

**The scope isn't just content copy** — skill docs, code comments, tool descriptions,
published HTML, commit messages, user responses, all of it. `check-style.py` flags D8
as an S1 finding on content copy; S1 findings are suggestions, never execution gates
(2026-10-18). **No checker runs on docs and comments**, so the writer has to hold the
line. Run this scan when writing or editing a doc:

```bash
python3 - <<'PY'
import re, os, glob
pat = re.compile(r'남긴다|갈린다|갈렸다|엇갈린다|나뉜다|(?<!살아)남는다'
                 r'|갈립니다|나뉩니다|(?<!살아)남습니다|남깁니다')
roots = ['skills','agents','server/src','docs'] + glob.glob('data/*/growth/*/growth-plan.md')
files = ['README.md','CLAUDE.md']
for r in roots:
    if os.path.isfile(r): files.append(r); continue
    for dp,_,fn in os.walk(r):
        files += [os.path.join(dp,f) for f in fn
                  if f.endswith(('.md','.html','.ts','.js','.sh','.py'))]
for p in files:
    if 'korean-style.md' in p or 'check-style.py' in p: continue   # rule source of truth · fixtures
    s = open(p,encoding='utf-8',errors='replace').read()
    for m in pat.finditer(s):
        print(f"{p}: …{s[max(0,m.start()-40):m.end()+15]}…".replace('\n',' '))
PY
```

`growth-plan.md` (the standing authorization) is in the scan — it's our prose, reread
every tick. `growth-log.md` and `state.json` are not (past records, and they hold
reviewer quotes). `CLAUDE.md` quotes the banned forms in this section, so it's normal
for the scan to flag that passage.

The rule's source of truth is `skills/platform-guide/references/korean-style.md` §D8.
Exceptions: `살아남는다` (a different verb), conditionals (`나뉜다면`), spoken past
tense, and imperatives (`남겼어`·`남겨 둬`).

## Episode production choice (user directive, 2026-09-06)

New episodes follow the six-ratio contract in `skills/storyboard/references/production-mode.md`
and persist `renderRatioVersion:1`. The episode's ratio is the saved `production.mode` in
`.social-flow/models.json`; only when no value is saved does HITL offer the six choices, with
first-pass and retry-inclusive video costs, model, resolution, audio setting, explicit budget cap
and exclusions. Persist the choice in `window.PRODUCTION`. The ratio is a planning target and
the cost ceiling: the band's upper bound and the budget are enforced, the lower bound is not,
and fewer generated cuts than the target is reported, never padded with unneeded video.
Legacy approvals without that version count new cuts, rounded up; exclude reused clips, supplied
recordings/stock clips and the shared outro.
Explicit episode choices override the old 1–2 clip cap and optional-hook default.
`hook_only`, `stills_only` and `hybrid` are legacy production-mode ids for resumed boards only.
Bind approval to the final cost quote. Resume an unchanged approval.
The visual style is the saved `style.preset`; only when none is saved, ask once at project
setup for one of the visual-style presets — cinematic-miniature,
photoreal live action, webtoon, claymation, paper-cutout, ink-wash, toon-3d (added 2026-09-08
from the Shorts style survey) or arcade-2d (added 2026-09-09, a hand-painted 1990s arcade game
frame with no HUD) — and apply that choice to every new source/end image and video prompt in
either mode.
Follow `skills/storyboard/references/visual-style.md`; production mode never chooses the art style.
For cinematic-miniature only, full_video follows the spatial-explainer reference `LQZjvQ5W2ck`: consistent miniature/cutaway/
realistic materials, stable geography, deliberate camera moves and visible physical changes.
Its branch overrides the older HTML-only explanation and generated-shot cap clauses below. It
does not relax facts, voice, budget, publishing approval or the ban on
marks over video. Read the production-mode and full-video contracts linked from the skills.
Quality is reviewed against source images and actual clip playback, with asset-bound evidence;
a metadata pass alone is not proof of visual quality. Never hide a failed clip with a still,
HTML fallback, looping or freeze padding. The builder validates the approved video manifest.

## Existing video reuse (user directive, 2026-09-12)

Existing clips at 720×1280 portrait or 1280×720 landscape are eligible for reuse.
The final 1080p canvas is an output size, not a minimum for imported source files.
Measure hashes and duration locally and inspect playback to fill missing import records;
never invent provenance or reviews. Follow the `visual.reuse` contract in scenes-schema.md.
A missing legacy record or a 720p source does not authorize paid regeneration. Prefer
existing clips and local edits; a reuse-only episode has $0 new video generation cost.
New generations follow the explicitly selected model resolution, including 720p.

## Nothing is drawn over video — explanation is an HTML slide (user directive, 2026-09-05)

This is an absolute content rule: no marks and no type of any kind over a moving picture.

- **Nothing is drawn over video.** No arrow, route, X, ring, hatch, bracket, dot, label or
  callout goes over a generated clip, a motion background, a b-roll, a quote clip or a
  recording. Delivered video is subtitle-free, including speech (2026-10-17); a subtitle the
  user asks for is a separate SRT file, never type on the picture. The footage treatment
  (`treatment:"footage"`, 0.47–0.53: one clip per sentence under drawn marks) is retired —
  `check-scenes.js` and `check-slide.js` reject it.
- **A cut that needs an arrow, a figure or a principle is an HTML slide, not video.**
  `shot.infoType` timeline · statistic · principle, and any beat that would need something
  pointed at on the picture, are `kind:"diagram", motion:true, treatment:"editorial"` on the
  studio stage, with a rendered object when a thing is the subject. The quality bar is
  `docs/research/2026-09-04-rendered-object-slide/reference-slide.html` — lit slabs, a
  cyclorama, a baked object whose movement is the sentence, one accent, values that count
  while the sentence runs. Those slides sit outside `html_plate_max`, and the static-ground
  clock runs per reveal group on them.
- Video carries essential continuous action with no drawn explanation marks. Mood, place and
  people use still-camera motion when that conveys the cut.

## Physical subjects use 3D objects (user directive, 2026-09-06)

- Choose the shot's purpose first. People, mood and place use a high-quality still with a
  deliberate camera move. A person or physical noun alone does not require a 3D explanation.
  Match camera direction to the actual cut: introduce a face with focus-in, inspect an object
  then a face with rack focus, approach a detail, or pull back to reveal context. Foreground
  reveals and parallax require prepared layers and a clean background. Do not cycle effects
  by shot number. Record the subject, focus regions and reason in the shot plan.
- Principles, quantities, mechanisms and explanatory situations use HTML motion scenes.
  Depict physical things as recognizable, articulated 3D objects: a cart has wheels, an axle,
  a bed and a load. Labelled boxes are not substitutes. Abstract quantities may use bars.
- Give explanatory scenes a relevant environment, such as a workshop, office or supply depot.
  Plan foreground, floor and background together; black or a solid colour is not the default.
- When a narrated person helps explain the action, include a cute, authored 3D doll character
  in the same material, lighting and perspective as the objects and environment. Animate its
  relevant gesture and contact with objects. Characters are optional when objects explain it.
  A realistic character painting with separately overlaid 3D props is not this treatment.
  Prefer an acted task with anticipation, contact and release: move a piece, stamp a document,
  or pull a cart. Head bobbing and waving alone do not explain object manipulation.
- Use real mesh objects with 3D illustration or photoreal materials for new physical subjects.
  Follow `skills/storyboard/references/mesh-objects.md`; the offline runtime consumes GLB and
  articulated mesh assemblies. Flat disks, labelled boxes and moving cutouts cannot substitute
  for a physical mechanism. Abstract quantities can still use bars, type and relationship lines.
- Keep explanatory marks sparse. Character action scenes default to no drawn marks. Preserve
  useful part labels on mechanism scenes, one at a time with a short timed appearance, a small
  anchor and a legible line. A mark needs a reason beyond decoration; remove duplicate labels.
- Use `h.mark.arrow` for smooth curves with a small head following the path. Pen strokes are
  an explicit stylistic choice. Keep the object, arrow and type readable together.
- Render subject motion at the final capture frame rate. Inspect full playback and random
  seeks, including group boundaries. A schema pass alone does not establish visual quality.

## Choose each cut by purpose (user directive, 2026-09-06)

This replaces the older mandatory-video hook and fixed editorial-cut quotas.
Use `skills/storyboard/references/render-routing.md` before choosing any assets.
Every generated cut declares `shot.render.mode` — the renderer needs it — and, as guidance
for the reader, `purpose` and `reason`:
`still_camera`, `character_html`, `object_html`, `data_graph`, `motion_html`, `generated_video`,
`editorial_html`, or `stock_video` (a free stock or archive clip with its `visual.license` record, 2026-09-07).
People mentioned in narration do not automatically need 3D characters; incidental numbers
in a mechanism do not automatically need a graph. Choose the information the viewer needs.

The hook follows the same process. `hook_video` defaults off; an explicitly enabled channel
policy remains a constraint. Generated-video caps and budgets are ceilings, not quotas.
No cut is paid video merely because it opens the episode. Every generated-video choice needs
essential continuous motion and an explanation of why a still or controlled HTML action is
insufficient. Existing recordings and the shared outro retain their source.

`check-scenes.js --draft` warns about missing or contradictory choices before assets; full checks
also compare the choice with the production handoff. The approval page displays the mode and reason.
Camera HTML is still-camera motion and never counts as true subject motion. Keep the episode
budget, generation cap and no-marks-over-video rule; the static-ground limit is guidance.

## Visual direction and charts (user directive, 2026-09-06)

Read `skills/storyboard/references/visual-direction.md` before planning cuts. Do not copy
one generic render reason across the episode. Text-led quotations and verdicts use the
limited `editorial_html` route; they cannot become the whole episode by declaring motion.
Choose photographs, acted 3D processes, object mechanisms and charts from the story's needs.
Data graphs follow `skills/storyboard/references/chart-design.md` and the shared SVG renderer.
No unsupported route, substituted number card or separate PRELUDE may reach assembly.
The builder reruns source-plan checks and records its version and input hashes before encoding.

## Complete project setup (user directive, 2026-10-16)

Use `skills/project-init/SKILL.md` for workspace initialization. Save SNS targets
and connection records, genre, models, visual style, video ratio and format in
`.social-flow/models.json`. Reuse these defaults for new episodes without repeated
preference questions; snapshot the full configuration per episode. Existing boards
and explicit episode overrides keep their choices. This supersedes older repeated
style/ratio prompts. Store credential references only; tokens stay in the external
SNS directory. Pending SNS setup does not prevent local production. Defaults and
budget ceilings do not authorize generation spending or publication.

## Directory model selection (user directive, 2026-10-16)

**Images containing text (owner directive, 2026-10-18):** Every newly generated or
edited image that must display or preserve readable text uses **GPT Image 2**
(`gpt-image-2`). This includes Hangul and other languages, signs, labels, packaging,
lettered clothing, wordmarks, posters and reference-product edits. This standing
asset-specific choice overrides saved image defaults and host-first routing. A host
tool qualifies only when its actual model is verifiably GPT Image 2; an unspecified
host-managed model does not. Otherwise use the plugin's GPT Image adapter with the
exact model ID. If unavailable, report the blocker; do not substitute Z-Image,
another GPT Image version or another model. Apply the scoped override before planning
and quoting, retain existing spending authorization, and inspect the resulting text.
Do not regenerate existing assets solely to migrate models. Code-rendered typography
is not a generated-image model call. See [image routing](skills/_shared/image-routing.md).

**Directory model selection (user directive, 2026-10-16) supersedes automatic routing.**
Once the working directory is known, follow `skills/_shared/model-settings.md`: ask
for the video type first (drama, comedy, documentary, explainer and the researched
catalog's other options), then video model and credentials, image model and credentials,
then whether separate TTS is needed. If yes, select its model and configure credentials;
if no, save `models.speech:{engine:"none"}` and skip TTS setup. Save all choices
in `.social-flow/models.json`, and use
those settings for subsequent episodes until the user explicitly requests a change.
Host-first is an initial recommendation, not a reason to replace a saved choice.
Snapshot settings per episode; preserve existing approved work and explicit voice
exceptions. Do not repeat model questions or silently switch engines after failures.
The type guides speech: narrator-only explainers are valid; drama normally shows
characters physically speaking, with off-screen dialogue reserved for a purpose.
Keep narrator roles, inner thoughts and messages explicit. Existing settings missing
only the type ask only that choice for a new episode; existing episode resumes retain
their original snapshot. The type is independent of the visual style and output format.
Initial setup is an explicit preference step, including on interactive autoproduce;
unattended callers without complete settings report `project_setup_required` with the missing
fields and defer authoring (status codes: `skills/_shared/model-settings.md`).

At first image setup, recommend ASTRA GenAI (`engine:"astra-genai", model:"z-image-turbo"`)
(owner directive, 2026-10-18), not local mflux. Configure `ASTRA_GENAI_API_KEY` if missing;
local generation and host image tools are explicit alternatives. Text-bearing images still
require GPT Image 2. At first video setup, a supported host video tool is recommended;
once saved, the saved choice governs every generated still, slide art, clip, candidate logo,
intro keyframe and growth-post image — channel assets follow `.social-flow/models.json` like
episodes. The storyboard records the saved providers in `window.PRODUCTION.imageProvider` and
`videoProvider` (`host` | `astra` | `api`); the fallback from a failed host call is asked for,
never silent. Host output is logged as `image.host` / `video.host` at $0 with the allowance
noted. Contracts: `skills/produce/references/still-generation.md` §1 and
`skills/produce/references/video-model-selection.md`.

## 3D previz for generated cuts (user directive 2026-09-11; optional since 2026-10-18)

A `generated_video` cut may render its camera and blocking in 3D before the video call — a
Blender previz through the `blender_*` bridge, or a three.js previz through
`skills/storyboard/references/previz-template.html` — at the cut's billed length, 24 fps, grey
proxies with one flat colour per actor and nothing else in frame. The render is stored as
`visual.video.previz` (`renderer`, `clip`, `firstFrame`, `sha256`, `fps`, `seconds`,
`camera.movement`); no checker refuses a generated cut without it. A previz helps camera and
blocking when the model takes a reference clip (Seedance 2.x `reference_video`: the previz as
`Video 1`, the source still as `Image 1`); for a `frame_and_prompt` adapter it only shapes the
still and the prompt and is advice. When a previz exists, the source still is edited from its
first frame, and its move and the shot's `visual.camera.movement` must agree; a prompt that
fights the clip drifts. Imported clips (`visual.reuse`), stock footage, recordings and the outro
carry none, and neither do b-roll and speech clips. The renderer is the
saved `production.previzRenderer` (`PRODUCTION.previz`); when none is saved, the author picks one
and records it as an assistant decision — no renderer or model question is asked. Episode video
runs through `video_catalog → video_plan → video_approve → video_execute`; a direct adapter call on a configured
episode needs `videoContext`. Contract: `skills/storyboard/references/blender-previz.md` §6 and
`production-mode.md`.

## Per-cut video models (user directive, 2026-09-13)

Cuts inherit the saved video model and resolution: `PRODUCTION.videoModel` comes from
`.social-flow/models.json` through the episode handoff (`selection.kind:'standing'`). A per-cut
change is an explicit user exception recorded in `PRODUCTION.modelSettings.overrides`;
`model:'mixed'` describes such a plan. Seedance 2.x may send the previz as
`reference_video`. Keep real API input
constraints, cost quotes and approved budgets. `modelReason` is optional.

## Local storyboard storage

Save episodes under `data/<channel>/episodes/<topic>/storyboard/`. Use the bundled
HTML template and local scenes.js. Keep approvals, research and production records
locally. Follow `skills/storyboard/references/storyboard-design.md`.

## Tests — few, one file per module (user directive, 2026-10-18)

`server/test/` grew from 9 files on 2026-08-23 to 126 files and 2,314 cases on
2026-10-18, mostly because every task added its own file named after its directive.
This section overrides the test-writing defaults of TDD, test-scenario and similar skills.
On 2026-11-02 the suite was cut again from 2,703 cases (35 s) to about 1,580 (17 s), keeping a
case only where a miss is costly: money (budgets, ledger, no re-submission), public posting,
security boundaries, data integrity, the rules this file keeps, branchy pure logic, real
regressions and the tool-surface contract.

- **One file per module.** `render-routing.js` (or `render-routing.ts`) is tested in
  `server/test/render-routing.test.mjs`. Add cases to the module's file; create a file
  only for a new module. `test-layout.test.mjs` fails on a test file whose name matches
  no module and lists the few cross-cutting exceptions.
- **Test what changed.** Add a case only for behavior the change adds or alters and no
  existing case covers. A bug fix adds one regression case. A directive is not a test
  list: don't restate CLAUDE.md or a skill as assertions, and don't test skill prose.
- **Removed behavior takes its tests with it.** When a directive drops a gate, delete
  the gate's cases. Add a "never requires X" case only after X actually came back.
- **Assert structure, not prose.** Check a finding's level or code, returned fields or
  the exit status. Match message wording only where the wording is the contract.
- **Cheapest level that proves it.** Call the function directly. Keep one spawned-CLI or
  ffmpeg case per command path, on synthetic fixtures a few frames long.
- **No real waiting.** `npm test` runs in about 30 s. Advance the clock instead of
  sleeping through polls and rate limits (see the top of `astra-video-client.test.mjs`)
  and clear every timer a case starts.
- **Hermetic runs.** `npm test` loads `server/test/isolate.mjs` into every file: it drops the
  shell's provider keys and gateway URLs and gives each file an empty home, so your own
  `~/.config/social-flow` (`.env`, `disabled-tools.json`, tokens) never changes a result.
  Blender and Chrome stay found. Every Chrome launch passes `--use-mock-keychain`: the empty home
  has no login keychain, and without the flag macOS pops a "keychain cannot be found" dialog. Run one file the same way:
  `cd server && node --import ./test/isolate.mjs --test test/<module>.test.mjs`. A provider whose
  variables use a new prefix adds it to `PROVIDER` in `isolate.mjs`.
- **Readable over DRY.** Inputs that decide the result stay in the test body. Shared
  setup is a factory with defaults, not a `beforeEach` that hides them.

Background and sources: `docs/research/2026-10-18-test-class-practices/README.md`.

## GitHub authentication

For this repository, prefer `TTALKKAKLAB_GITHUB_TOKEN`. Apply it to both `GH_TOKEN`
and `GITHUB_TOKEN` only in the Git/gh command environment, as described in
`AGENTS.md`. Check the account and repository push permission before publishing
branches or merging PRs. Never log, persist or embed the token in a remote URL.

## Branch strategy

```
feat/<name> | fix/<name>  (integration)  →  dev  →  staging  →  main
```

- Sprint work happens in a `feat/sprint-<N>-<name>` worktree and PRs into the integration branch.
- Promotion goes `dev → staging → main`, in that order. Never straight to `main`.
- Keep remote work branches after merge (history, rollback). Clean up local sprint branches only.

## Commits and secrets

- Never commit `.env*`, `*.pem`, `*.key`, or any credentials/secrets (already in `.gitignore`).
- Nothing under `data/` gets committed — the one exception is `data/README.md`,
  which documents the structure. Channel profiles, storyboards, images, videos,
  and branding assets are local artifacts; this repo holds only plugin code and skills.
- Conversely, `server/dist/` is a build artifact but **must be committed** — `.mcp.json`
  runs `${CLAUDE_PLUGIN_ROOT}/server/dist/bundle.js` directly with no build or install
  step. The bundle is self-contained (dependencies inlined via esbuild) because
  marketplace installs never run `npm install` — an unbundled entry dies with
  `ERR_MODULE_NOT_FOUND` there. After editing `server/src/`, run `npm run build`
  and commit dist (per-module output for tests + `bundle.js`) along with it.
- API keys are injected via shell environment variables, not `.mcp.json`.

## Multi-session caution

Multiple Claude Code sessions work in this repo at the same time.
Before committing or merging, check `git status` and recently modified files
(`find . -mmin -30`) so you don't sweep up files another session is editing.

## 워크트리 경로

워크트리는 기본 체크아웃 루트의 `.worktree/<이름>/`에 만든다. 연결된 워크트리에서도 기본 루트를 기준으로 삼는다. `AGENTS.md`의 2026-10-10 사용자 지침을 적용하며 ASTRA나 도구의 기본 경로보다 우선한다.
