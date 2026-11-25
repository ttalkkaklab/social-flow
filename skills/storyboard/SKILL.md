---
name: storyboard
description: >
  Develops synopses, scenarios and boards; stops at the requested plan. Use when the
  user asks to "시놉시스 추천", "시나리오 작성", "스토리보드 만들어", "스토리보드 작성", "촬영 대본 만들어", "make a storyboard",
  or "plan a video". Casts characters, develops causal alternatives, writes observable
  action and attributed speech with evolving viewer expectations and earned payoffs,
  then plans shots and content-led timing. Saves the local
  review board. Produce builds an approved board; autoproduce runs both unattended.
argument-hint: "<channel> <topic or topic hint>"
allowed-tools: ["mcp__social-flow__video_catalog", "mcp__plugin_social-flow_social-flow__video_catalog", "mcp__social-flow__video_plan", "mcp__plugin_social-flow_social-flow__video_plan", "mcp__social-flow__character_manage", "mcp__social-flow__character_panel", "mcp__plugin_social-flow_social-flow__character_manage", "mcp__plugin_social-flow_social-flow__character_panel", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow", "mcp__social-flow__music_catalog", "mcp__plugin_social-flow_social-flow__music_catalog", "mcp__social-flow__host_review", "mcp__plugin_social-flow_social-flow__host_review", "mcp__social-flow__project_manage", "mcp__plugin_social-flow_social-flow__project_manage", "mcp__social-flow__location_manage", "mcp__plugin_social-flow_social-flow__location_manage", "mcp__social-flow__speech_manage", "mcp__plugin_social-flow_social-flow__speech_manage", "Read", "Write", "Edit", "Glob", "Bash", "Agent", "AskUserQuestion", "WebSearch", "WebFetch", "mcp__social-flow__capability_status", "mcp__plugin_social-flow_social-flow__capability_status", "mcp__social-flow__story_sequence", "mcp__plugin_social-flow_social-flow__story_sequence", "mcp__social-flow__story_scene", "mcp__plugin_social-flow_social-flow__story_scene", "mcp__social-flow__story_shot", "mcp__plugin_social-flow_social-flow__story_shot", "mcp__social-flow__story_music", "mcp__plugin_social-flow_social-flow__story_music", "mcp__social-flow__story_cliche", "mcp__plugin_social-flow_social-flow__story_cliche", "mcp__social-flow__shot_characters", "mcp__plugin_social-flow_social-flow__shot_characters", "mcp__social-flow__shot_dialogue", "mcp__plugin_social-flow_social-flow__shot_dialogue", "mcp__social-flow__shot_icons", "mcp__plugin_social-flow_social-flow__shot_icons", "mcp__social-flow__shot_image", "mcp__plugin_social-flow_social-flow__shot_image", "mcp__social-flow__shot_prompt", "mcp__plugin_social-flow_social-flow__shot_prompt", "mcp__social-flow__storyboard_apply", "mcp__plugin_social-flow_social-flow__storyboard_apply", "mcp__social-flow__storyboard_check", "mcp__plugin_social-flow_social-flow__storyboard_check", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read", "mcp__social-flow__naver_search", "mcp__plugin_social-flow_social-flow__naver_search", "mcp__social-flow__serp_web_search", "mcp__plugin_social-flow_social-flow__serp_web_search", "mcp__social-flow__serp_news_search", "mcp__plugin_social-flow_social-flow__serp_news_search", "mcp__social-flow__serp_naver_search", "mcp__plugin_social-flow_social-flow__serp_naver_search", "mcp__social-flow__serp_image_search", "mcp__plugin_social-flow_social-flow__serp_image_search", "mcp__social-flow__stock_search", "mcp__plugin_social-flow_social-flow__stock_search", "mcp__social-flow__datago_search", "mcp__plugin_social-flow_social-flow__datago_search", "mcp__social-flow__datago_detail", "mcp__plugin_social-flow_social-flow__datago_detail", "mcp__social-flow__datago_file_download", "mcp__plugin_social-flow_social-flow__datago_file_download", "mcp__social-flow__datago_file_fetch", "mcp__plugin_social-flow_social-flow__datago_file_fetch", "mcp__social-flow__datago_api_call", "mcp__plugin_social-flow_social-flow__datago_api_call", "mcp__social-flow__suno_generate_lyrics", "mcp__plugin_social-flow_social-flow__suno_generate_lyrics", "mcp__social-flow__story_intensity_plan", "mcp__plugin_social-flow_social-flow__story_intensity_plan", "mcp__social-flow__story_catharsis_plan", "mcp__plugin_social-flow_social-flow__story_catharsis_plan"]
---
Before drafting a synopsis or storyboard, identify the project directory the user selected.
If it is unclear, ask for it and wait. Follow [project setup](../project-init/SKILL.md)
until `project_manage status` returns `ready` in that directory.

For motion-graphic shots, follow [motion type selection and design](references/motion-graphics.md): persist `shot.motionGraphic` with a common `THEME.motionGraphicTheme` when the episode needs consistency and contextual `style.theme` (`auto` or an explicit channel theme), choose the type from viewer intent and available evidence, and keep style, choreography and renderer separate. Built-in abstract scenes use the installed `prepare-motion-graphic.js`; asset-dependent types retain their authored or mesh routes.

Follow [dialogue coverage](references/dialogue-coverage.md): a shot keeps every line spoken
in its view, so cut where the staging, the visible evidence or the selected model's
pinned-voice capacity calls for another view, not at every speaker change, and do not make
every speaker the picture's subject. First plan the scene's
[attention and visible changes](references/shot-view.md#plan-attention-across-the-scene),
then set each shot's size, angle and delivery. Keep silent
listeners in the cast when visible. Use `frames.mode:"first"` and image2video for
silent/inner-thought shots; thoughts use character `voiceover` with measured, timed TTS.

Follow [host evaluation](../_shared/host-review.md) for every requested review.


# Storyboard: make the story understandable, then plan its images

Build each scene around the event the viewer follows. Keep its cause, reaction and consequence together across reverse angles, inserts and silent action. Choose the video operation after grouping the shots. At each proposed boundary, read the place, time, event and combined speaker roster in `storyboard_read.boundaryReview.sceneBoundaries`. A genuine time jump, new setting or distinct event earns a new scene, even when one shot tells it. A recurring routine may use a short montage with a visible cue for elapsed time. If a third voice or the selected route's duration forces a split, preserve the handoff and name the production reason. Check that the entire regrouped scene fits before generation.

Declare everyone who speaks in the story scene. Submit one scene with `video_plan {episode,sceneNo,requestId}`. The planner chooses an operation from the saved model and the authored inputs.

Each generated shot needs a composition image before video planning. The scene opening can cover its first shot. For each later shot, attach `referenceImage` or a start image at the opening frame of its per-shot timeline. The selected operation determines which images the provider receives.

- Use an opening image for a picture with no visible dialogue. Keep off-screen-only speech and narration on the external soundtrack. Declare visual references for silent cast members whose appearance must carry through.
- Use audio-to-video when a finished scene-length recording must drive the performance, regardless of how many people speak on it.
- For authored dialogue in pinned character voices, bind each speaker's sample to their identity. Distilled LTX can combine the opening, an optional ending, up to four subject images and one background. Its first two subjects can carry voice samples in each native render. With authored cuts, the per-shot renderer can change that pair inside one scene job. A one-take exceeding the selected model's capacity needs an authoring decision.
- Seedance 2.0 reference accepts up to nine images and three audio clips in one request. Its opening image guides composition. Veo can generate dialogue when the board explicitly selects `videoDirection.dialogueVoice: "model_generated"`. Its Standard/Fast asset mode accepts up to three images of one subject. The planner reports any required input the selected operation cannot send before approval.

**Story language (user directive, 2026-11-18).** Write the synopsis, scenario, story
sentences, summaries and lines in one language: the one the user names for this episode,
else the saved `languages.speech`, else the language the channel already works in
(`profile.md`, the cast's `tts.language`, earlier episodes), else the language the user
wrote the request in. Pass it to the first `story_sequence` as `language`; the board keeps
it as `STORY.language`, and a resumed board stays in the language it is written in. English, Chinese, Japanese, Spanish, French, German,
Vietnamese and Korean have line timing. Talk to the user in their language even when the
story's is another. Follow [story language and review translations](references/review-localization.md);
the floating story language selector reads a separate translation file and never changes
spoken source.

For synopsis recommendations, read the channel's continuity contract and prior research first.
For an anthology, choose material before assigning episode roles; do not inherit a prior
episode's relationships or personalities. For a serial, read its established cast and world.
In either case, deliver the requested prose without creating an episode, changing canon or generating
assets. Follow [material research](references/story-material-research.md) before choosing
new story material and [story interest](references/story-interest.md) from the synopsis
onward. A scenario develops complete scenes; a storyboard additionally delivers the shared
review HTML. Keep that scope distinction when the user asks to make a story more gripping.

After drafting or revising a synopsis, complete the **required
[reality check](references/synopsis-reality-check.md)** before presenting it or developing
scenes. Apply the findings to the prose and show the sources and any unresolved points.
For a synopsis-only request, deliver the checked prose and brief findings. If the central
event still depends on an unverified assumption, present it as provisional and stop before
detailed scenes or production.

For every new or substantially revised synopsis and board, apply
[episode anticipation](references/episode-anticipation.md). Build a specific opening promise,
changing expectations, an earned payoff and an observable response into the actual story.
Do this while authoring, even when no separate interest review is requested.
Read the channel's chosen opening format. When it calls for a provocative opening and
rewind, follow the reference's opening procedure: consequential event, recipient reaction,
clear earlier-time cue, enacted context and one catch-up into new action. Preserve held
motives and the channel's text policy; the opening incident need not reveal the ending.
When the episode makes a claim instead of resolving a relationship (explainer, tutorial,
review, advertisement), follow the reference's claim-led section: one result promised in the
viewer's words and said aloud, proof the viewer can check on screen, then someone using it.
**Opening by format and platform (user directive, 2026-11-18):** then place that promise with
[opening by format](references/opening-by-format.md). Read the board `FORMAT` and the enabled
SNS platforms first. Short-form gets one opening for every platform, built for the earliest
window (Reels, 3 s): the first frame shows the subject already changed or mid-action and the
promise is complete by about 3 s. Long-form decides its title and thumbnail first; the first
7 s confirm them and the next 20 s open a bigger question. Record the plan with
`story_sequence` `opening`; every board write prints a reading of it and refuses nothing.

**Clichés (user directive, 2026-11-18).** A drama, comedy or romance episode uses researched
clichés as story material by default. While casting, writing the synopsis and writing scenes,
name what the story is missing, ask `cliches.js pick` for candidates that do that job, keep
what earns its place, move one property of it and record it with `story_cliche`, so the
review page shows it. Every other type gets a recommendation with the scenario, and a cliché
enters the story only when the user picks it. Follow [cliché use](references/cliche-use.md)
for the mode, the needs, the half step, what stays out by default and the record. None is a
valid decision; this is writing guidance, not a score.

**Production order (user directive, 2026-10-31):** Follow [production order](../_shared/production-workflow.md).
The story tools enforce story order and cast readiness. Context, camera, image and video
reviews and Blender compositions run only when the user asks. This skill writes the story, each shot's
characters and lines and its icon attributes; [generate-cut-images](../generate-cut-images/SKILL.md)
and [generate-cut-videos](../generate-cut-videos/SKILL.md) make the images, prompts and
approved videos.


For saved GenAI selections, use [GenAI operation selection](../_shared/astra-genai.md)
while preparing sheets and shots. Plan img2img for whole-image changes, inpaint for
local corrections and MSR for one character's physical dialogue. Silent shots and
inner thoughts use image2video. Set `voiceoverKind:"inner_thought"` in `shot_dialogue` and use the thinking character’s timed TTS.
Record the source, mask or numbered reference roles and the intended operation.
MSR references are not first/last frames. Preserve the GPT Image 2 rule for readable
text; do not generate assets merely to test a planning choice.

## Pressure and payoff

On every new or substantially revised story-led synopsis or board, apply
[story intensity](../story-intensity/SKILL.md) and [story catharsis](../story-catharsis/SKILL.md)
during authoring. Before writing the synopsis, identify the conflict already present and
the change the viewer is waiting to see. Call `mcp__social-flow__story_intensity_plan` for
the pressure and `mcp__social-flow__story_catharsis_plan` for the expected payoff
(use their paired plugin forms in a marketplace install). Compare alternatives when a device
depends on an unmotivated choice, a convenient rescue or a louder version of the same event.
Write the strongest fitting change into the synopsis and the visible setup, choice,
consequence and response into the actual scenes and shots. Revisit these choices when moving
a synopsis to a board or substantially revising the causal sequence. Use `sequence.question`,
`sequence.payoff` and scene turns already in the board. User tone, canon and factual evidence
set the bounds. For quiet or claim-led work, use its actual discovery, constraint or proof.
This pass is authoring guidance and carries no approval, score or stored-plan requirement.

## Required authoring and delivery order

First complete project setup and follow [production order](../_shared/production-workflow.md).
Prepare characters with text (`character_manage`) and images (`character_panel`) → present the scenario → write the story
(sequences → scenes → shot stories) → set each shot's characters and each character's lines →
set each shot's icon attributes → prepare prop and background text/images → make each
scene’s opening and any ending image (`shot_image`) → save the opening positions and emotion in the scene’s `videoDirection`. Set `story_scene.directionDefaults` before the shot images so their camera axis and lighting agree. A change of camera setup starts a new shot. A pan, tilt, dolly, zoom or an entrance during continuous filming stays on its shot. For model-paced cuts, give each shot its duration, framing and action. Use `story_shot.timeline` for an exact frame boundary or timed visual cue. Only an explicit one-take direction sets `videoDirection.oneTake`. A 15-second generation can contain several shots. Export the bundled review template. Each scene's video waits
for the user's approval (`video_approve`); do not jump from a text plan directly to video.
Scenario presentation is a progress update, not an approval request. In an interactive
session, show the premise, characters, causal sequence, ending and selection reason before
writing the detailed board. For story-led work also state the question the viewer waits on
to the end and, when the order of telling differs from the order of events, why. For
claim-led work state the promised result and the scene that proves it. Name the clichés the story
uses and what each one changes; on a type that only recommends them, list the ones you recommend,
which wait for the user's pick ([cliché use](references/cliche-use.md#6-recommend-then-apply-what-the-user-picks)). Continue unless the user requested selection/approval first;
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
skill and its sheet/design references before writing. When it writes or revises the
synopsis, require the reality-check findings with the scenario preview before shot
authoring. Require sheet paths and the board path at handoff.
The coordinator relays the preview to the user before detailed work continues and verifies
the deliverables. `storyboard-reviewer` is read-only; it is not the author.

Save episode files under `data/<channel>/episodes/<topic>/`.
For character action and camera planning, use [action direction](references/action-direction.md).
The review derives camera icons, cut connections and planned length bars from existing shot fields.
For related cuts, use [shot continuity](references/shot-continuity.md): stage concrete
opening/closing poses and shared blocking before choosing source images. Keep dependent
actions connected; a source still depicts the opening instant, not the completed action.
Set the scene's fixed spatial relationships and camera side in `story_scene.directionDefaults`
before composing the first shot. Name seats or standing marks, facing, eyelines and a fixed
landmark. Check each shot's own view against that layout. Establish or make that arrangement
legible at the first opportunity without forcing an establishing shot on a tight opening.

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

### Write the selected model's scene prompt

Write **one prompt per complete generated scene**. Read the selected engine, exact model and operation from the episode snapshot. Get the adapter's `sceneWritingGuide` from `video_catalog`, and open its `promptReference` page when the row names one: it holds the ranges the vendor's guide recommends for reference people, files and voice samples. Use the ordered shots to describe the opening, transitions, actions, spoken words, listening characters and the final state. Keep dialogue in its approved language. For provider examples see the [scene writing profiles](../../docs/research/2026-11-24-video-model-prompting/scene-prompt-design.md).

Keep an authored edit in the scene's `videoDirection.promptDrafts` through `story_scene`. Each entry has `engine`, the selected `model` when present, `operation` and `prompt`. Preserve entries for other selections. Give a face and its voice the same cast ID. Use `{mina.face}` or `{mina.voice}` only for references the operation can send. Once the scene's images and samples are ready, run `video_plan` with `episode`, `sceneNo`, `requestId` and `wholeScene:true`. Without an edit the planner composes the model-specific scene. Inspect `args.prompt`, `promptTemplate` and the submitted reference order. To preview another draft pass `prompt` to the same planner. Approve and execute the reviewed plan ID. If the route requires separate renders, revise the scene or select a compatible operation explicitly.

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
Read actual identities, export shared sheets and snapshot the characters this episode may use in
`cast.json` (`id` and `source`, the path to their `identity.md`; `"voiceOnly": true` for a narrator
who is never seen). Complete their face, front and back panels before text authoring, text-only
requests included: `story_sequence` refuses to start the episode board until every entry has its
identity and, unless `voiceOnly`, its panels (`cast_required`, `cast_source_missing`,
`character_panel_missing`). Cast only needed people, with specific wants and distinct speech;
select a narrator only when the expression needs one. Do not invent existing IDs or voices.
When the episode applies clichés, a character type is chosen here with the cast, not after the
story is settled ([cliché use](references/cliche-use.md#3-three-places-in-the-writing-order)).
Before shot design, complete the three sheet categories using
[asset sheet preparation](references/asset-sheets.md). This includes one-off characters,
story-relevant props and every background/location, not only recurring assets. Reuse actual
existing sheets; finish props and backgrounds after the text storyboard. A document or object
the viewer knows from real life (a will, a certificate, money, a uniform) is looked up before
it is described or drawn: search, save and view pictures of the real thing, record `research`
on its prop sheet and make its picture from them ([prop research](references/prop-research.md)). Generate front
and back camera views for each background by default (`panels.front`, `panels.back` in
`SB_DOC.locations`), preserving the same space from opposite sides. Set each shot's
`shot_icons.backgroundView` from that layout so `shot_image` uses the matching panel;
follow [asset sheets](references/asset-sheets.md). Missing images are
reported and do not authorize paid generation; apart from the cast's own panels they stop no step. Do not proceed with an applicable sheet category silently omitted.

Store local plans under `data/<channel>/episodes/<topic>/storyboard/` following
[the destination contract](references/storyboard-target.md). No planning artifacts under
`data/` belong in plugin commits.

## 2. Choose a story from causes and consequences

Before a new story-led synopsis, follow [material research](references/story-material-research.md):
read the existing case collection, find missing causes, decisions and consequences, then
compare usable material before committing to a plot. An explicit research request includes
actual searches and source reading, even for fiction. A settled supplied premise or targeted
line edit needs only relevant gap checks. Reuse good evidence; do not repeat searches to
fill a quota or turn research into a new approval or execution gate.

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

Once the causal skeleton holds, read [story interest](references/story-interest.md) for
story-led work: drama, comedy, mystery, serial fiction and narrative documentary. Causality
makes the story followable; that reference asks whether the viewer wants the next scene.
Decide the question each sequence holds open and which scene answers it, the order of
telling, who knows more at each stage, how the pressure changes from scene to scene and
what each scene ends on. These are choices to make on purpose, not devices to add: a story
told in order with no twist is valid, and an explainer needs no manufactured opponent.
Before presenting the synopsis, trace its opening question, the evidence or attempts that
change the audience's guess, the actual resolution and the response it enables. State the
ending in the author-facing synopsis. Give the opening its own paragraph: format and
platforms, first frame, the promise and where it is paid, and on long-form the title,
thumbnail and the bigger question by 30 s ([opening by format](references/opening-by-format.md#7-write-it-down-and-read-it-back)).
Repair a middle that only postpones the same answer;
do not hide the missing progression behind a teaser or an emotion label. Use ordinary prose
or existing expectation/change/setup notes, not an added planning schema.
On an episode that applies clichés ([cliché use](references/cliche-use.md#1-when-an-episode-uses-them)),
make the cliché pass now: name the slots the skeleton leaves generic as needs — why these
two keep meeting, what stands between them, how the hidden thing comes out — and run
`node "$CLAUDE_PLUGIN_ROOT/skills/storyboard/references/cliches.js" pick --need <needs> --seed <topic>`
for candidates. Keep what earns its place and move one property of it: who does it, what it
costs, when it happens or who knows. Say in the synopsis which clichés it uses and what each
changes. On other types recommend one where it would
help and apply only what the user picks. A cliché's name never answers `necessity`.
For a claim-led synopsis the same trace reads: the result promised, the proof and where it
is shown, the limit or cost the middle reaches, and the use it ends on. List the spoken
claims and drop each one the board cannot show and research cannot support
([claim-led episodes](references/episode-anticipation.md#claim-led-episodes-one-result-promised-proof-the-viewer-can-check)).
For a tension-led revision, change a consequential choice, the cost of an available
alternative or who can use a secret. Carry the same mechanism from synopsis to performed
scenes to visible shot evidence using that reference's handoff table. Stronger adjectives,
unmotivated violence and a surprise with no prior cause do not revise the story.

Finish the [reality check](references/synopsis-reality-check.md) on the written synopsis
before moving to complete scenes. Carry the verified details and constraints into the scenario.

## 3. Write complete scenes before cutting them into shots

**Story first, one layer at a time (user directive, 2026-10-31).** Once the scenario is
settled, the first storyboard step writes only the story: `story_sequence` (each sequence's
title and purpose, and for story-led and claim-led work the `question` it holds open with the
`payoff` scene that answers it or shows its proof) → `story_scene` (place, time, event and a one- or two-sentence summary,
inside its sequence, with optional `turn`, `charge` and `out`) → `story_shot` (each shot as one sentence of story in its scene; a
revised shot given another scene moves to the end of that scene). These are provisional
performance units, not one unit per sentence, gesture or speaker turn. One summary may cover
a continuous exchange with several lines. Name the visible cause, discovery or changed
behavior in these summaries before choosing the cast; do not reduce every unit to
"A says / B answers". Revisit boundaries after the lines are written. No
image, speech, prompt, camera or dialogue work happens in this step.

When writing each scene with `story_scene`, decide what the viewer should hear at its turn.
Set `scene.audienceSound` to `{decision:"use",reason}` or `{decision:"none",reason}`.
Work from the action. Whose experience should the viewer share? What changes before the
outcome, and what does the reaction reveal afterward? A `use` decision accepts three
optional fields. `perspective` names whose experience we follow, `shift` describes the
change the viewer can see or hear, and `exit` names the beat that ends the cue. For
`none`, write the reason the room or the performance carries the turn. Older decisions
with just a reason still work.

Record the cliché decision on the board (user directive 2026-11-18). After the first
`story_sequence`, call `story_cliche`: read the report's mode, then record the clichés the
scenario settled, each with its catalogue id and its `shift`, or `none` with the reason. On a
type that recommends, record candidates with `offered: true`, and the picked ones with
`basis: "user"` once the user chose. When the scenes are written, send each use again with
its `scenes`, and add the staged moments, places and line patterns chosen while writing them.
A new board on a type that applies clichés prints the decision as undecided with every write
until one is recorded; nothing waits for it.

A scene's lines do not make its shot list (user directive 2026-11-17). Before any line, write the
pictures that carry none: where this is and who else is there, a character's work while it is
happening, the person a line lands on, the walk or wait between two exchanges. A role the cast
names — a coach, a shop owner — is seen once in the act. Who speaks does not decide who is seen: the listener, a third cast member (`bystanders`) and unnamed people (`extras`)
can share the frame. Every board write then prints the board as counts — people in frame, shots
with and without a line, the widest shot of each scene; read them as the board's shape, not as
targets to reach.

Each tool refuses a layer
whose parent is missing (`story_order`). The next step starts once every sequence has scenes,
every scene has shots and every shot has its story: `shot_characters` sets who is on screen in
each shot — up to four principal characters, `[]` for nobody, with an unreferenced cast member in view as a
`bystanders` entry and unnamed people as `extras` (user directive 2026-11-17) — and then `shot_dialogue` writes
each shot's lines in spoken order, each attributed to a character from `cast.json`. An on-screen
speaker is one of the shot's characters; a narrator is a character who speaks in `voiceover`
without being seen.

Give each on-screen character an `expression` in the same `shot_characters` call (user
directive 2026-11-16): what their face and body show as the shot opens, in English. A shot
story names an action, not a feeling, so read the scene's situation first — what just
happened to these people and what they stand to lose — then write what a camera sees: brows,
eyes, mouth, shoulders, hands. "Worried" alone leaves the face to the model, and a model with
no cue draws a pleasant one; "brows drawn together, eyes searching the tree line, lips pressed
shut" does not. A mixed label such as "bewildered but grateful" comes out as a smile. The
silent listener gets a state too. Keep one state per shot: a change of state is the shot's
action or the next shot. `shot_image` stages the image and the scene writer carries these details into the video prompt.

When a character leaves a shot later, `shot_characters` keeps their lines
as `off_screen` and warns, and it warns when the start image shows the old cast; revise them
with `shot_dialogue` and `shot_image`. The third step, once every shot has its characters, sets what the review's
icon row shows with `shot_icons` (§4): render route, size, angle, camera move, focus, depth,
frame plan and `next`, the transition into the following shot (scenes-schema §scene transition). Camera endpoints and blocking then go through `storyboard_apply`. The fourth step,
once every shot has its icon attributes and the props and backgrounds exist, makes each
picture shot's start image with `shot_image` from its characters' sheet panels, place and
props — and its end image only for a `first_last` shot. A place whose sheet names a built set
starts from that set rendered at the shot's size and angle, so block the cast with
`location_manage bind` first when their places matter. The fifth saves one English video direction per generated scene with `story_scene`. Inspect its opening image, describe each character's posture at a visible landmark and their emotional change, then plan by `sceneNo`. The planner reads each shot’s framing, action, lines and image roles in order. Bind the scene-length audio file and its beat cues once in videoDirection.audio. See [scene generation](../generate-cut-videos/SKILL.md).
Inside an episode a new board starts with `story_sequence`; `storyboard_apply` does not create
one. The story tools mark it `STORY.authoring:"story-first"`, and every writer then keeps each
shot's order: story, characters, then lines and icons. `production_workflow` completes
`text_storyboard` only with every shot story and every shot's characters written
(`story_outline_required`). The guidance below shapes what those summaries
and lines say.

**Music spotting (user directive, 2026-11-14).** Once the lines are written and before
writing the scene prompt, decide each scene's music with `story_music`. Start with `story_music {path}`:
its report lists the scenes still undecided, payoff and turn scenes marked, and `direction`,
the notes saved from what the user has said about music on this channel. Follow those notes
before your own taste. Then give every scene one decision with its reason:

- `score` with a cue, where the story needs it: the scene that turns the sequence's question,
  the answer, a stretch without lines that carries feeling or motion. Scenes that follow each
  other on one feeling share one spot, so the music runs unbroken across them.
- `none`, where the lines or the room should be heard alone. The reason says why, e.g. "the
  refusal lands harder dry". Silence nobody decided reads `undecided` on the review page.

Define each cue for this episode with a `prompt` (instruments, tempo, mood, how it starts and
ends, room for speech) and a `reason`, or name a channel bed as an `asset`. A cue made for
another episode is not a cue for this one. A cue whose opening is quiet starts later with
`sourceStartSeconds`, and one motif serves several scenes by starting each span at a different
point of the same file. `start` and `end` move the entrance and exit inside a shot. Gain curves
and overlapping spans go through `storyboard_apply` on `window.MUSIC.$timeline` afterwards
(scenes-schema §Music cues). Plan the dramatic trigger now and confirm its offset against the
accepted footage.

When the user corrects the music (too much, wrong mood, where it belongs), save the correction
in the same turn as a dated line in `production.musicDirection` with `project_manage update`
([model settings](../_shared/model-settings.md)), so the next episode starts from it. Nothing
waits for this step and no tool refuses a board without it; `storyboard_read.musicSpotting`,
the review page and the build report say which scenes are still open. Legacy
boards that play one bed keep `sound.cue` (scenes-schema §Placing cues on a story board).

**Audience-only sound.** Revisit each scene's `audienceSound` once the lines, shots and music
are known. Read `storyboard_read.audienceSpotting` for undecided scenes, uses still missing a
cue and cues on scenes marked `none`. Describe room sound in the video prompt. Still cards
can use existing room tone in `sound.ambience`. A musical underscore belongs in
`story_music`. A drone that comes in when a listener's face changes
can play over either. A `none` decision applies only to the audience-only layer.

For each `use`, anchor the cue to the change the viewer should notice. In EP01's
arm-wrestling setup the joined hands are still. Jin-su smiles confidently. A single
warm pluck at his smile can fade before the start call. A later shot of a hand slipping
or a loser looking away would call for a different choice.
Compare the chosen moment with the closest situation in the [audience sound index](references/audience-sound/index.md)
and plan its event with `storyboard_apply.audienceEffects` (`op:"plan"`). Name the shot and
event IDs, `sfx`, `intent`, the sound's shape in `description`, the visible or spoken `trigger`,
and the moment it should release. For an original drone, riser or stinger give the saved
music model an instrumental direction in `sfxEntries[id].prompt`. Describe the entrance,
rise and decay around the reaction. The same model can score the BGM separately.
On an older board, set `source:"music"` on this event's `plan` operation. Record
`audienceSound` on its scene as usual. The board's version and the sources of its other cues stay as written.
On accepted footage, watch the action once in silence, then listen to the take with its
dialogue and room sound. Place the cue with `op:"place"`. Compare the same passage with
the audience cue on and off at the same playback level. [Placement and comparison](../produce/references/video-sound.md#audience-effects)

For dialogue-led work and existing-story rewrites, read [causal dialogue and situational
comedy](references/causal-dialogue.md). Check what triggers each consequential line, what
the speaker can actually infer and what their response makes happen next. A rewrite
revisits the existing ending as well as the revised opening. For a content-only request,
deliver a readable sequence of acted scenes without generating images or inheriting
old media approvals; score only that layer with a rubric fixed before authoring.

Apply the speaker-position pass in causal-dialogue while writing the lines, before icons:
read the exchange in order, check the actual listener and earlier trigger of each reply,
and keep inference separate from confirmed knowledge. Use only the speaker's current
experience in acting.context; a scene's later outcome is not their present knowledge.
This is an authoring pass, not an automatic independent review or a new execution gate.

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
When the scenario was supplied or approved, its quoted lines are the dialogue. Where it
reports that someone speaks without giving the words, stage that moment so the words are
not needed — the listener's face, the speaker's back, distance — or ask for them; a line
you write is a new line, and the delivery report names it as one.

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
positive ending, threat or cliffhanger is required. On story-led work read the turns in a
row: when several scenes flip the same way against the same obstacle, change the barrier or
the stakes, and check that each `out` leaves the viewer wanting the next scene
([story interest](references/story-interest.md) §4–§5). Do not fill missing causality with
extra dialogue when an observable choice or consequence can carry it.

Before detailing shots, apply the episode-anticipation audience pass to the ordered actions
and words alone. At each meaningful beat or scene join, name what the viewer now wants to
see and the new evidence that changed that expectation. Preserve necessary reactions and
quiet relief; do not demand a new question at every camera cut. Carry each clue, discovery
and response into the planned shots in the same disclosure order. Fix the performed event
when the progression exists only in notes. This author pass is not an independent review.

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

Read and apply [content-led opening views](references/shot-view.md) for every picture shot:
choose its visible evidence, crop, horizontal viewpoint and camera height from the story,
then save `shot_icons view` with size and angle. This is the common decision procedure for
the start image and set camera; a monologue does not automatically mean a portrait.

For narrated or mixed scenes, apply [narration and visual grounding](references/narration-visual-grounding.md)
before writing any source-image prompt. Decide what the picture contributes to the line,
then stage that contribution; shared character, prop and background sheets constrain
appearance, not meaning. Use the existing shot info/reason and opening/action fields.
Inspect the complete cut sequence and episode-wide repetition using the linked grounding procedure; a representative image does not cover a multi-cut block.
Check pictured evidence separately from what the voice explains, including deliberate
context or reaction shots. A coherent voice track cannot certify the storyboard images.
On a claim-led board, plan the proof as its own shots: what went in and what came out in
one readable view or two adjacent ones, held for the time it takes to read. A screen that
needs pointing at takes the HTML slide route; nothing is drawn over the recording.

Use [scenes schema](references/scenes-schema.md) for data shapes and supported renderer
fields. For new v2 stories this workflow replaces the schema's historical writing quotas,
mandatory spoken thesis/CTA and narration-only suggestions. Keep the actual runtime contracts.

`SCENES[]` remains the flat shot array. Bind each shot to its dramatic scene; cut for a
change of attention, revealed information, an action boundary or a necessary reaction.
One shot may carry a complete exchange. Use the ordered `performance` and speech-group
references in character-scenarios so that every story event survives the translation.
Do not add coverage merely to meet a size count or repeat a medium close-up for every line.
Before committing the shot list, read each complete scene without cuts, then compare the
proposed boundaries. An explicit one-take keeps all turns and continuous action on one card. Merge adjacent shots when the frame carries the continuing action, replies included. Split when a reveal, reaction, action boundary, viewpoint or necessary
geography changes what the audience follows. A close-up is one possible reason, not a rule.
Follow [shot boundary decisions](references/shot-boundaries.md) after `shot_dialogue` and
after later framing/timing changes. Use `storyboard_read.boundaryReview` to inspect every
actual playback join, including silent action and speaker changes.
After `shot_dialogue`, read each scene's complete speech and action without the shot breaks.
Keep a continuing speaker in the same shot while the frame carries the performance; a pause,
new sentence, changed speech purpose, glance or hand gesture alone does not require a cut.
A speaker change alone does not require a cut; the selected model's pinned-voice capacity applies to each render and `video_plan` reports a scene over it.
For face-to-face generated dialogue, apply [dialogue coverage](references/dialogue-coverage.md):
use speaker-facing OTS/reverse when the speaking face carries the new information, or
purposeful off_screen speech over a reaction, detail or spatial view when that carries it.
Give each camera setup its own shot size and angle. In a requested one-take, let the next person speak in the same frame or follow them with a continuous move.
Revise provisional shots before images: preserve line IDs, order, speaker, delivery and acting;
use `storyboard_apply.shotsById` and `removeShotIds` to merge, or `story_shot` followed by
characters/lines to split. Reconcile performance groups, story/event references and continuity
links after either change. Do not regenerate existing assets or discard approvals implicitly.

Describe the meaningful opening, change and consequence of each retained shot. Remove
redundant pauses and repeated setup. Derive its estimated length from those events and
speech; timing cards and provider minimums never allocate seconds to fill. Preserve
intentional silence when something changes during it. Consult [pacing cases](references/evals.md)
for continuous dialogue, rapid action and an earned reaction cut.

Before image prompts, perform the required camera-direction pass in
[action direction](references/action-direction.md#required-camera-direction-pass).
Choose framing, angle, focus and movement from each beat; never initialize every shot
with static or copy one generic hold rationale, and never lay a slow approach over every
close-up in its place: a changing face can be held or approached, and its beat decides which. Set the icon attributes — render route, size,
angle, move, focus, depth, frame plan, transition to the next shot — with `shot_icons`, then persist the executable
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
A flash-forward or flashback is a time break too: give each timeline a fixed visible code such
as prop state, light or place ([story interest](references/story-interest.md) §2), never drawn text.
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
quotas. Choose the medium that can deliver the event; a card or HTML shot has no camera, but
its `shot.why` still says what it gives the beat. Maintain the saved visual style with
[visual-style.md](references/visual-style.md) and authorized production ratio with
[production-mode.md](references/production-mode.md). Respect clean footage: no dialogue
subtitles or explanatory marks burned into video. Explanatory graphics use their supported
HTML/diagram route; full-video episodes follow [full-video](../produce/references/full-video.md).

Plan each shot with up to four principal characters in `visual.character`. A cast member
seen without a line or a video reference is a bystander, and unnamed people are extras
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
Label estimates until actual speech/media exist. Do not add one fixed padding value to
every shot, and do not add simultaneous actions as if they all occur in sequence.
A spoken line sets the length of the shot that carries it; every other shot is set by the
one visible thing it shows. An insert, a glance, a reaction or an impact shows one small
action and ends once it is read, often in a second or two, shorter than the close-up beside
it; a wait, a slow realization or a long walk takes as long as it takes. When shots of different kinds come out at the same round length, the length was
assigned rather than derived: walk through each again
([cut length](references/action-direction.md#cut-on-a-meaningful-change)). A cut shorter
than the selected model's minimum is trimmed from a longer take in the edit, so the
minimum never lengthens the cut.

A natively voiced shot (MSR) plays exactly the length it is given, and the model fills
whatever the line does not need with silent acting, mostly before the line. On 299 clips
measured 2026-11-16 half of each clip was silence around its line; clips within a second of
their line's length opened on the line. So its `duration` is the line plus the pauses the
story asks for, and each such pause is written down: a standalone timed action
(`durationSeconds`) or the line's `leadInSeconds`/`tailOutSeconds`. `storyboard_read`
times an untimed line from its syllables in the board's language (Korean about 4.5 a second,
0.35 s a pause inside the line, 0.4 s of margin; the other languages use slower published
averages and read `speechRate:"uncalibrated"`, so time one made clip before trusting them)
and reports `performanceTiming.storedExcessSeconds`; bring a
positive value down to the performance length before images, or name the action that needs
it. Do not go under the estimate: a line that starts on the first frame loses its first word.

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

Before finalizing boundaries, set each generated shot's finite estimated `duration` from the
complete performance and read `storyboard_read.videoTiming`. It resolves the episode snapshot
and scoped model overrides, reports the selected route's `maxSeconds`, frame grid, source
coverage and the shortest covering request. A maximum is a ceiling, never a target length or
a reason to pad a short scene. `fits` covers the authored timing only; native speech remains
an estimate until the generated clip is inspected. Retime from measured speech when available.

Resolve `split_required` before making images. Split the smallest necessary number of times
at a complete thought, action or motivated reaction; keep continued speech ordered and avoid
repeated setup or empty pauses. Do not split at every sentence, divide the total equally,
speed up speech, cut off words, reduce fps or switch models to make a long shot pass. Allow
source trim and outgoing transition handles within the same cap. Re-read timing after every
merge, split, dialogue, action, edit, model, resolution or fps change. The report uses the
saved shot's `visual.video.frameRate` (or the adapter default); `video_plan` repeats the check
with the actual request parameters. Pass that same fps to the request.

A `timing_unknown` result needs a performance estimate. `limits_unknown` or `not_verified`
is not permission to assume 5, 10 or 15 seconds: inspect the selected deployment's live
catalog/contract (host tools use their actual schema), report the missing evidence and keep
the timing provisional. Do not present that shot as ready for generation. Text-only work
may retain an explicitly unresolved timing note. `video_plan` supports `requiredSeconds` on
registered routes including MSR and rounds upward to a legal request without truncation;
use the report's exact request or total required coverage instead of a provider default.

Compare the resulting length with explicit user limits, verified publishing limits and
budget. If it exceeds one, remove repetition, simplify the event or split the episode at a
meaningful boundary. Preserve the setup needed to understand the turn and its consequence.
Split a long generated take at a motivated action boundary to fit the selected adapter;
do not accelerate speech or discard its reaction merely to fit one model call.

Once every shot has its icons and a length, read the whole plan once with
`storyboard_read {level:"direction"}`. It returns each scene's shots in order with size, angle,
move and length, the longest runs of one size and of held shots, held shots by size with the
wide ones held without a reason, lengths by size, the longest shots with their action counts,
and any sentence standing as the same reason on several shots.
These are counts of what was written, not targets. Revisit the shots where the reading and
the content disagree before exporting the review.

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
for the blind audience read; `--map` retains shot/line IDs, event order and addressees for
findings. Use these exports rather than flattening all actions before all speech or dropping
listeners. Unknown addressees stay unknown; do not infer them from the author's intention.
`make-script.js` serves
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
`shot.techniques:[{id,reason}]` (a hold, `camera.static`, may go without its reason); give a video move its `speed` (slow, steady, fast) and `target`,
and a rack focus its `from` and `to` subjects in English, because `shot_image` stages them and
the scene writer describes them ("The camera slowly pushes in toward …", "Rack focus from … to …").
An action beat can lay a beat accent over its move with `shot_icons accents` — `camera.speed-ramp`
or `camera.impact-shake`, each with `on`, the one moment it fires on in English.
On a 9:16 board the result lists each chosen value's vertical note; read it before the images.
Persist other purposeful choices there through `storyboard_apply`.
The shared source is [film-techniques.js](references/film-techniques.js); exported boards also
carry the complete catalogue as JSON and an accessible icon legend. Choose from
information/action needs, not a diversity quota. Match canonical MS (waist-up), MFS
(mid-thigh), reference panels and camera fields. A static rack-focus cut selects
both ids so the focus change survives the camera icon and provider prompt.
Review actual images and footage before claiming the planned technique was achieved.
