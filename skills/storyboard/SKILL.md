---
name: storyboard
description: >
  Presents a scenario and template board; stops before media generation. Use when the
  user asks to "스토리보드 만들어", "스토리보드 작성", "촬영 대본 만들어", "make a storyboard",
  or "plan a video". Casts characters, develops causal alternatives, writes observable
  action and attributed speech, then plans shots and content-led timing. Saves the local
  review board. Produce builds an approved board; autoproduce runs both unattended.
argument-hint: "<channel> <topic or topic hint>"
allowed-tools: ["mcp__social-flow__character_manage", "mcp__social-flow__character_panel", "mcp__plugin_social-flow_social-flow__character_manage", "mcp__plugin_social-flow_social-flow__character_panel", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow", "mcp__social-flow__music_catalog", "mcp__plugin_social-flow_social-flow__music_catalog", "mcp__social-flow__host_review", "mcp__plugin_social-flow_social-flow__host_review", "mcp__social-flow__project_manage", "mcp__plugin_social-flow_social-flow__project_manage", "mcp__social-flow__location_manage", "mcp__plugin_social-flow_social-flow__location_manage", "mcp__social-flow__speech_manage", "mcp__plugin_social-flow_social-flow__speech_manage", "Read", "Write", "Edit", "Glob", "Bash", "Agent", "AskUserQuestion", "WebSearch", "WebFetch", "mcp__social-flow__capability_status", "mcp__plugin_social-flow_social-flow__capability_status", "mcp__social-flow__story_sequence", "mcp__plugin_social-flow_social-flow__story_sequence", "mcp__social-flow__story_scene", "mcp__plugin_social-flow_social-flow__story_scene", "mcp__social-flow__story_shot", "mcp__plugin_social-flow_social-flow__story_shot", "mcp__social-flow__shot_characters", "mcp__plugin_social-flow_social-flow__shot_characters", "mcp__social-flow__shot_dialogue", "mcp__plugin_social-flow_social-flow__shot_dialogue", "mcp__social-flow__shot_icons", "mcp__plugin_social-flow_social-flow__shot_icons", "mcp__social-flow__shot_image", "mcp__plugin_social-flow_social-flow__shot_image", "mcp__social-flow__shot_prompt", "mcp__plugin_social-flow_social-flow__shot_prompt", "mcp__social-flow__storyboard_apply", "mcp__plugin_social-flow_social-flow__storyboard_apply", "mcp__social-flow__storyboard_check", "mcp__plugin_social-flow_social-flow__storyboard_check", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read", "mcp__social-flow__naver_search", "mcp__plugin_social-flow_social-flow__naver_search", "mcp__social-flow__serp_web_search", "mcp__plugin_social-flow_social-flow__serp_web_search", "mcp__social-flow__serp_news_search", "mcp__plugin_social-flow_social-flow__serp_news_search", "mcp__social-flow__serp_naver_search", "mcp__plugin_social-flow_social-flow__serp_naver_search", "mcp__social-flow__serp_image_search", "mcp__plugin_social-flow_social-flow__serp_image_search", "mcp__social-flow__stock_search", "mcp__plugin_social-flow_social-flow__stock_search", "mcp__social-flow__datago_search", "mcp__plugin_social-flow_social-flow__datago_search", "mcp__social-flow__datago_detail", "mcp__plugin_social-flow_social-flow__datago_detail", "mcp__social-flow__datago_file_download", "mcp__plugin_social-flow_social-flow__datago_file_download", "mcp__social-flow__datago_file_fetch", "mcp__plugin_social-flow_social-flow__datago_file_fetch", "mcp__social-flow__datago_api_call", "mcp__plugin_social-flow_social-flow__datago_api_call", "mcp__social-flow__suno_generate_lyrics", "mcp__plugin_social-flow_social-flow__suno_generate_lyrics"]
---
For motion-graphic shots, follow [motion type selection and design](references/motion-graphics.md): persist `shot.motionGraphic` with a common `THEME.motionGraphicTheme` when the episode needs consistency and contextual `style.theme` (`auto` or an explicit channel theme), choose the type from viewer intent and available evidence, and keep style, choreography and renderer separate. Built-in abstract scenes use the installed `prepare-motion-graphic.js`; asset-dependent types retain their authored or mesh routes.

Follow [host evaluation](../_shared/host-review.md) for every requested review.


# Storyboard: make the story understandable, then plan its images

**Production order (user directive, 2026-10-31):** Follow [production order](../_shared/production-workflow.md).
Only the story order is enforced; context, camera, image and video reviews and Blender
compositions run only when the user asks. This skill writes the story, each shot's
characters and lines and its icon attributes; [generate-cut-images](../generate-cut-images/SKILL.md)
and [generate-cut-videos](../generate-cut-videos/SKILL.md) make the images, prompts and
approved videos.


For saved GenAI selections, use [GenAI operation selection](../_shared/astra-genai.md)
while preparing sheets and shots. Plan img2img for whole-image changes, inpaint for
local corrections and MSR for character/outfit/prop/background continuity in video.
Record the source, mask or numbered reference roles and the intended operation.
MSR references are not first/last frames. Preserve the GPT Image 2 rule for readable
text; do not generate assets merely to test a planning choice.

## Required authoring and delivery order

First complete project setup and follow [production order](../_shared/production-workflow.md).
Prepare characters with text (`character_manage`) and images (`character_panel`) → present the scenario → write the story
(sequences → scenes → shot stories) → set each shot's characters and each character's lines →
set each shot's icon attributes → prepare prop and background text/images → make each
shot's start image, and the end image a first_last shot needs (`shot_image`) → write each
video prompt (`shot_prompt`) → export the bundled review template. Each shot's video waits
for the user's approval (`video_approve`); do not jump from a text plan directly to video.
Scenario presentation is a progress update, not an approval request. In an interactive
session, show the premise, characters, causal sequence, ending and selection reason before
writing the detailed board. Continue unless the user requested selection/approval first;
in that case wait for their answer. For an unattended run, save the same preview in
`scenario.md` and include it in the run report. Do not invent a user approval.

A storyboard request requires the shared HTML, even when no media generation is requested.
Read [storyboard design](references/storyboard-design.md), generate with
`node "$CLAUDE_PLUGIN_ROOT/skills/storyboard/references/storyboard-html.js" "<episodeDir>/storyboard"`
after changes. A custom HTML or Markdown-only
board is not a substitute. Explicit text-only/scenario-only requests stop at that scope;
any HTML review still uses the shared template.

When delegating writing, pass the resolved path of this SKILL.md, the episode directory,
user scope, saved choices and this required order to the author. Require it to read this
skill and its sheet/design references before writing, return the scenario preview before
shot authoring, and return sheet paths and the board path.
The coordinator relays the preview to the user before detailed work continues and verifies
the deliverables. `storyboard-reviewer` is read-only; it is not the author.

Save episode files under `data/<channel>/episodes/<topic>/`.
For character action and camera planning, use [action direction](references/action-direction.md).
The review derives camera icons, cut connections and planned length bars from existing shot fields.
For related cuts, use [shot continuity](references/shot-continuity.md): stage concrete
opening/closing poses and shared blocking before choosing source images. Keep dependent
actions connected; a source still depicts the opening instant, not the completed action.

Read [automation guidance](../_shared/automation-guidance.md) and
[character-led scenarios](references/character-scenarios.md). They define the active
new-episode workflow below. Use `scenario-v2` and `story-v2` for new work.
For dramatic characters, read [character depth](references/character-depth.md) before
choosing the scenario. Connect competing priorities and relationship-specific behavior
to choices and consequences, then preserve that evidence in scenes and shots. Apply the
same guidance to scenario-only work; do not add a subplot to an explainer narrator.
Only a resumed unversioned or story-v1 episode uses
[legacy authoring](references/legacy-authoring.md); do not load that file for new work
or silently migrate an approved board. The old narration-only workflow, fixed runtime,
shot quotas and seven-item writing formula do not apply to new stories.

The order is **causal story → complete scenes → audience comprehension → shots and
staging → action/speech timing → production handoff**. A vertical canvas does not set
runtime. Do not open with a target duration, shot count or one-line-per-shot allocation.
Preserve explicit user limits, approved spending and actual adapter constraints.
This skill authors the plans; use produce for authorized media at each visual stage.
Stop at the requested artifact without bypassing required earlier stages.

## 1. Reuse the project's choices and shared cast

Read the channel profile and project settings. Follow [project initialization](../project-init/SKILL.md)
and [model settings](../_shared/model-settings.md) for missing preferences only; reuse the
saved genre, visual style, model, production ratio, output format and voice choices.
Create the episode with `project_manage episode` or its CLI and preserve its snapshot.
A resumed board retains its choices. Complete missing project settings before any authoring, including text-only drafts.
Never fabricate authorization or a supported model.

Use `capability_status` before planning a model-dependent handoff. The selected directory
models control provider choice; host-tool availability alone does not replace them.
[Video types](../_shared/video-types.md) guide expression, not mandatory dialogue or narration.
Keep canvas selection separate from length: `window.FORMAT` remains the renderer identifier
(`shorts-9x16` or `youtube-long-16x9`), not an instruction to write to its historical bands.

Follow [character preparation](../channel/references/character-identity.md#prepare-the-shared-sheet-before-episode-authoring).
Read actual identities, export shared sheets and snapshot the available pool in `cast.json`.
Complete required character images before text authoring. Cast only needed people, with specific wants and distinct speech;
select a narrator only when the expression needs one. Do not invent existing IDs or voices.
Before shot design, complete the three sheet categories using
[asset sheet preparation](references/asset-sheets.md). This includes one-off characters,
story-relevant props and every background/location, not only recurring assets. Reuse actual
existing sheets; finish props and backgrounds after the text storyboard. Missing images
block completion of their visual stage and do not authorize paid generation. Do not proceed with an applicable sheet category silently omitted.

Store local plans under `data/<channel>/episodes/<topic>/storyboard/` following
[the destination contract](references/storyboard-target.md). No planning artifacts under
`data/` belong in plugin commits.

## 2. Choose a story from causes and consequences

Follow character-scenarios for evidence/fiction/adapted grounding. Research the claims a
story actually presents as facts; fiction does not need fabricated citations or a research
quota. Distinguish factual evidence, inferred interpretation and invented staging.

Start with one scenario when the user has settled the material or an existing draft is
available. Develop alternatives only for a meaningful unresolved direction or an explicit
request; use as many as that decision needs, not a fixed three. Compare the characters'
choices and consequences, not engine labels or hooks attached to the same plot. Keep any
alternatives in `candidates/` using `scenario-v2`; labels are storage, not a scene quota.
Select with the user's established preference or choose the strongest justified direction
in authorized automatic work. Keep `scenario.md` and the selection reason. Do not repeat
an approval that the user already gave. Present the selected scenario using the required
order above before writing the detailed scenes and shots.

Before counting shots, work through what each character knows, wants and can physically
do. Show the transfer of essential information. An audience may infer motive from a refusal,
hesitation or sacrifice; they cannot see author notes. A surprise may withhold an answer
while establishing the rules and details that make its eventual answer fair.

`necessity` states what later choice, discovery or consequence loses its basis if this
beat disappears. A trope name, emotion label or “advances the story” is not that basis.
Use this as a thinking aid, not a demand to make characters explain themselves aloud.

## 3. Write complete scenes before cutting them into shots

**Story first, one layer at a time (user directive, 2026-10-31).** Once the scenario is
settled, the first storyboard step writes only the story: `story_sequence` (each sequence's
title and purpose) → `story_scene` (place, time, event and a one- or two-sentence summary,
inside its sequence) → `story_shot` (each shot as one sentence of story in its scene; a
revised shot given another scene moves to the end of that scene). No
image, speech, prompt, camera or dialogue work happens in this step. Each tool refuses a layer
whose parent is missing (`story_order`). The next step starts once every sequence has scenes,
every scene has shots and every shot has its story: `shot_characters` sets who is on screen in
each shot — at most two principal characters, `[]` for nobody — and then `shot_dialogue` writes
each shot's lines in spoken order, each attributed to a character from `cast.json`. An on-screen
speaker is one of the shot's characters; a narrator is a character who speaks in `voiceover`
without being seen. When a character leaves a shot later, `shot_characters` keeps their lines
as `off_screen` and warns, and it warns when the start image shows the old cast; revise them
with `shot_dialogue` and `shot_image`. The third step, once every shot has its characters, sets what the review's
icon row shows with `shot_icons` (§4): render route, size, angle, camera move, focus, depth and
frame plan. Camera endpoints and blocking then go through `storyboard_apply`. The fourth step,
once every shot has its icon attributes and the props and backgrounds exist, makes each
picture shot's start image with `shot_image` from its characters' sheet panels, place and
props — and its end image only for a `first_last` shot. The fifth writes each
`generated_video` shot's English video prompt with `shot_prompt` from its icon attributes,
lines and action. Each shot's video then waits for the user's yes (`video_approve`), or
their approval of every shot.
Inside an episode a new board starts with `story_sequence`; `storyboard_apply` does not create
one. The story tools mark it `STORY.authoring:"story-first"`, and every writer then keeps each
shot's order: story, characters, then lines and icons. `production_workflow` completes
`text_storyboard` only with every shot story and every shot's characters written
(`story_outline_required`). The guidance below shapes what those summaries
and lines say.

**Music spotting (guidance).** Once the lines are written and before `shot_prompt`, decide
where the music changes. One bed under the whole episode is a complete answer. Otherwise write
`window.MUSIC` cues, each with a one-sentence `reason`, and each changing shot's `sound` through
`storyboard_apply`, following scenes-schema §Placing cues on a story board: one cue per sequence,
a change or drop where the scene's `turn` flips the sequence's question. Nothing waits for this
step and no tool refuses a board without it.

For dialogue-led work and existing-story rewrites, read [causal dialogue and situational
comedy](references/causal-dialogue.md). Check what triggers each consequential line, what
the speaker can actually infer and what their response makes happen next. A rewrite
revisits the existing ending as well as the revised opening. For a content-only request,
deliver a readable sequence of acted scenes without generating images or inheriting
old media approvals; score only that layer with a rubric fixed before authoring.

Content-only branch: retain place/time, entrances, listening distance and prop handling
needed to understand the events. Defer camera specifications, renderer selection, image
prompts, voice production and measured timings in steps 4–5. Deliver the canonical text
data and a readable scene sequence labelled as a content plan; these are sufficient
only for an explicit content-only request. Complete character sheets first; derive prop and background sheets after this text stage.
If delivering HTML, use the shared template; ordinary storyboard requests still need it. Keep old production plans attached to their old revision. In
step 6 run only checks applicable to the chosen content format and verify its export;
do not invent production fields merely to clear a full production-board checker.

Write each scene as continuous observable action and attributed speech. Include entrances,
objects being passed, interruptions, listener responses and meaningful silence where they
change the event. Decide the initial situation, pressure, character's choice and resulting
change. Keep the scene readable without its synopsis or character goals.

A scene can contain multiple speakers and silent stretches. A line does not create a shot.
Keep one speech purpose and vocal contour per line: self-identification followed by a
question can need two lines from the same speaker in the same shot. Preserve the intervening
listening/reaction in `performance`; follow the [speech intent example](../produce/references/shot-speech.md#speech-purpose-boundaries).
Do not give every speech event `to: audience`: a character addresses the other character,
self or the audience according to the actual situation. For narration-led material the
viewer may be the addressee; narrator-only and fully visual stories are both valid.

Use `STRUCTURE.scenes` for place, time, event, turn and out when mapping the scenes to the
board. These are the existing fields, not a new mandatory planning form. In story-v2 the
out may be the final visible action. The change may be subtle; no forced twist, moral,
positive ending, threat or cliffhanger is required. Do not fill missing causality with
extra dialogue when an observable choice or consequence can carry it.

Read the scene sequence as an audience member before detailing shots. For an independent
review, hand a fresh reviewer only the ordered actions and actual words first. Withhold
synopsis, intentions, `necessity`, character wants, desired score and prior favorable reviews.
Ask what happened, why the decisive choices occurred, how each character learned what they
know and what the ending changed.
For dramatic principals, also ask what their choices cost, what different sides of them
the events reveal and how the relationship affects their tactics. Credit visible or
audible evidence, not a biography or a declared character arc. Record this reading before
comparing with intent, identities and evidence.
Repair the specific missing or contradictory event; do not merely rewrite the explanation
in author metadata. The [reviewer](../../agents/storyboard-reviewer.md) describes this order.
A review is useful evidence, not a standing numerical gate.

## 4. Cut and stage the scenes without losing their events

For narrated or mixed scenes, apply [narration and visual grounding](references/narration-visual-grounding.md)
before writing any source-image prompt. Decide what the picture contributes to the line,
then stage that contribution; shared character, prop and background sheets constrain
appearance, not meaning. Use the existing shot info/reason and opening/action fields.
Inspect the complete cut sequence and episode-wide repetition using the linked grounding procedure; a representative image does not cover a multi-cut block.
Check pictured evidence separately from what the voice explains, including deliberate
context or reaction shots. A coherent voice track cannot certify the storyboard images.

Use [scenes schema](references/scenes-schema.md) for data shapes and supported renderer
fields. For new v2 stories this workflow replaces the schema's historical writing quotas,
mandatory spoken thesis/CTA and narration-only suggestions. Keep the actual runtime contracts.

`SCENES[]` remains the flat shot array. Bind each shot to its dramatic scene; cut for a
change of attention, revealed information, an action boundary or a necessary reaction.
One shot may carry a complete exchange. Use the ordered `performance` and speech-group
references in character-scenarios so that every story event survives the translation.
Do not add coverage merely to meet a size count or repeat a medium close-up for every line.

Before image prompts, perform the required camera-direction pass in
[action direction](references/action-direction.md#required-camera-direction-pass).
Choose framing, angle, focus and movement from each beat; never initialize every shot
with static or copy one generic hold rationale. Set the icon attributes — render route, size,
angle, move, focus, depth, frame plan — with `shot_icons`, then persist the executable
endpoints through `storyboard_apply`, then review the sequence for purposeful holds and
changes of attention. This is authoring work, not a moving-shot quota or approval gate.

For each consequential action, make the following understandable in the actual plan:
who can see or hear it; where people stand and look; who has the prop before and after;
what initiates the action; how the recipient reacts; what the next shot inherits.
Distinguish an actor's left/right from the screen's left/right, especially across reverse
angles. A change of camera does not move an object to the actor's other hand or arm.
Compare each final pose, prop position and location with the next shot's opening state.
Use existing `shot.space`, `shot.eyeline`, `shot.videoDesign`, `visual.action` and camera
fields as appropriate. Do not create a separate required metadata ledger for every item.
A listener's off-screen reaction is not delivered unless another planned shot shows it
or its sound conveys the intended information. A prop cannot already be received in the
source image when the shot needs to show its handoff.

For recurring places, dialogue, entrances, travel or prop handoffs, plan one shared set.
Blender compositions of that set ([location assets](references/location-assets.md),
compose-blender) run only when the user asks; `shot_image` composes each start image from
the sheets.
The saved previz renderer applies only to optional animated video references.
Bind each shot's camera and complete actor start/end blocking, including off-camera actors,
body facing and gaze. Within a `continuityGroup`, carry the previous cut's end state into the
next start; explain time skips with `continuityBreak` and axis crossings with `lineCrossing`.
When the user asked for Blender compositions, render and inspect the shared space in cut order. Previz rendering is
optional and belongs to produce (`location_manage` action `previz` on a Blender set) so motion
shares the same set, camera and blocking. Camera, actor or endpoint changes invalidate those
references. Continuity findings guide corrections without a new approval gate; record only
actual image reviews. Local spatial renders make no paid calls.
After a location render, read `references.spatial` and inspect `spatialPaths` for spatial
reasoning. These are authored-geometry measurements, not a guarantee of LLM perception.
Refresh both storyboard HTML and the channel review library so background detail pages
show the same actor placement, views and evidence.

Read [render routing](references/render-routing.md) and
[visual direction](references/visual-direction.md) for relevant rendering choices, not old
quotas. Choose the medium that can deliver the event. Maintain the saved visual style with
[visual-style.md](references/visual-style.md) and authorized production ratio with
[production-mode.md](references/production-mode.md). Respect clean footage: no dialogue
subtitles or explanatory marks burned into video. Explanatory graphics use their supported
HTML/diagram route; full-video episodes follow [full-video](../produce/references/full-video.md).

Plan each shot with at most two principal characters in `visual.character`; split a beat that
needs three into shots, and describe extras by appearance in the action
([character reference](references/scenes-schema.md#character-reference-visualcharacter)).
For every new generated shot, declare `visual.frames` with explicit start/end planning
and `visual.references` (empty when none). Each extra image has id, path, role, use
(image/video/both) and purpose, as defined in [shot image inputs](references/scenes-schema.md#shot-image-inputs).
Plan reference mode explicitly when using appearance conditioning without pinned frames.
Do not fill every available model slot or silently drop unsupported combinations; MSR
character sheet panels are the default exception (see the schema).

The storyboard plans source/end states, references, blocking and motion; produce builds
and inspects them. Missing images are pending, never visually approved. Read
[blender-previz.md](references/blender-previz.md) when planning a generated cut's previz
and [shot speech](../produce/references/shot-speech.md) for line IDs, speaker/delivery and acting.
Preserve the complete character handoff, including any selected `voiceReference`.
Follow [voice continuity](../produce/references/voice-continuity.md) when planning
native dialogue: repeat pinned acoustic identity, keep scene emotion separate, and
bind each speaker to their own sample. A voice reference does not establish exact
synchronization with the finished TTS WAV.

## 5. Derive time from the performance

First lay out anticipation, words, physical actions and responses. Then estimate how long
they take. Walk through the source pose, travel to the object, contact/handling and response
in their physical order. Combine them only where the person can actually do both at once;
a list of several actions does not fit one brief interval merely because it is one event.
Label estimates until actual speech/media exist. Do not use speech duration plus
one fixed padding value as the whole shot duration, and do not add simultaneous actions
as if they all occur in sequence.

A standalone performance action may carry `durationSeconds`; `withGroup: 1` means it runs
with that 1-based speech group; without its own duration the concurrent action spans that group. Per-line
`acting.visual` is concurrent with its line.
Use these optional fields when timing would otherwise be ambiguous. Unknown action timing
stays unknown and receives a planning note; it does not become zero seconds.
For the handoff call `speech_manage` with `{path, action: "plan_video", shotId,
capabilities}`. The tool reads the whole stored shot including `performance`; do not select
individual line IDs for this review or pass an invented shot-payload argument. Review its
warnings and source/motion prompt against the scene. An MSR shot plans as `native`: the
model voices its lines, so the storyboard plans no per-line TTS for it.
A line-only plan cannot prove that the independent actions or listener reactions survived.

Compare the resulting length with explicit user limits, verified publishing limits and
budget. If it exceeds one, remove repetition, simplify the event or split the episode at a
meaningful boundary. Preserve the setup needed to understand the turn and its consequence.
Split a long generated take at a motivated action boundary to fit the selected adapter;
do not accelerate speech or discard its reaction merely to fit one model call.

## 6. Validate and deliver the plan honestly

Set `SB_DOC.speechPlanVersion:1` and `SB_DOC.performanceTimingVersion:1` on new boards.
The latter distinguishes new action timing from legacy audio-clock compatibility: drafting
may show unknown action time, but production needs finite independent-action durations.
Keep `STORY.version: story-v2`, its actual cast and event references, the shot-level
`performance` and existing `STRUCTURE` in `scenes.js`. Do not duplicate dialogue across
independent script files. Generate readable exports from this source. When the user asks
for a check or a blind read, use:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references/check-scenario.js" storyboard/scenario.md
node "${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references/check-story.js" storyboard/ --text
node "${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references/check-scenes.js" storyboard/ --draft
```

`--text` exports every observable action and spoken line, including silent generated shots,
for the blind audience read; `--map` maps findings to shot/event. `make-script.js` serves
user-recorded filming/voice preparation and is not the general whole-story export. A checker
confirms only what it measures. Inspect events across adjacent shots and compare crucial
actions with the visual handoff yourself. Vocabulary review uses speech alone; a silent
story has no vocabulary score. Reviews of planned action do not certify generated acting.

Build the review HTML with [storyboard-design.md](references/storyboard-design.md) and the
bundled `storyboard-html.js`; rerun it after changes. `scenes.js` is the source of
truth; `SB_DOC` holds editorial metadata and real character identities/voice settings.
The cast section links to the shared sheets. Include `storyboard.md`, selected scenario,
local HTML and readable performance. For user-recorded work also generate the shooting
script from [shot-script-template.md](references/shot-script-template.md).

When production is in scope, estimate cost with the installed cost-preview tool and show
unknown prices as unknown. Report canvas, content-derived estimated length, chosen story,
concrete unresolved findings and what media has not been generated or watched. Record only
actual reviews and actual approvals. Stop here for a storyboard request; production and
spending follow existing authorization, and publishing remains a separate scope.

## Requested improvement loops and specialized work

When the user explicitly requests a quality loop, preserve their success criterion and
use fresh independent reviewers. Fix reusable causes in the plugin, then let the author
reload the updated installed skill and continue from the saved draft/checkpoint. A new
author is optional; preserve usable work rather than regenerate it to repeat the test.
Do not have the coordinator patch benchmark stories to raise scores. Work one story at a
time when sequential evaluation is requested. Freeze the rubric before grading, retain
every verdict and recheck each story independently. A request for **over 95** means strictly
greater than 95, with no P0; 95 itself does not meet that request. Never infer a new threshold for ordinary authoring.
See [evaluation cases](references/evals.md) for behavioral regression exercises.

For independent motion examples use [animation-review.md](../produce/references/animation-review.md)
instead of inventing an episode. For existing supplied recordings use the ingest contract.


## Four filmmaking elements and semantic technique choices

Read the catalogue returned by `storyboard_read` (`includeTechniques:true`) before
choosing techniques. Each value `shot_icons` takes has a card there — use, avoid, the shots
around it, what the prompt must name, and how 9:16 changes it — and a use is a practitioners'
convention, not a measured effect. Set the camera move and focus with `shot_icons`, which writes
`shot.techniques:[{id,reason}]`; give a video move its `speed` (slow, steady, fast) and `target`,
and a rack focus its `from` and `to` subjects in English, because `shot_image` stages them and
`shot_prompt` writes them ("The camera slowly pushes in toward …", "Rack focus from … to …").
On a 9:16 board the result lists each chosen value's vertical note; read it before the images.
Persist other purposeful choices there through `storyboard_apply`.
The shared source is [film-techniques.js](references/film-techniques.js); exported boards also
carry the complete catalogue as JSON and an accessible icon legend. Choose from
information/action needs, not a diversity quota. Match canonical MS (waist-up), MFS
(mid-thigh), reference panels and camera fields. A static rack-focus cut selects
both ids so the focus change survives the camera icon and provider prompt.
Review actual images and footage before claiming the planned technique was achieved.
