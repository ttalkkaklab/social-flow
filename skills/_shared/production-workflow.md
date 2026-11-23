# Production order

Start every storyboard or video request in the project directory the user selected.
Reuse an explicit path from the request or session, or the saved workspace of the
requested episode. If the directory is unclear, ask “어느 폴더에 이 프로젝트를 저장할까요?”
and wait. An arbitrary current directory, the plugin installation and another project's
defaults do not answer that question. An unattended caller reports `project_setup_required`
with `workspace` and stops when it cannot identify the selected directory.

Run `project_manage status` on that absolute path. For a new directory, or when status
lists `workspace`, record the user's selection with `project_manage select`. It creates
the directory if needed. Follow [project-init](../project-init/SKILL.md) for the missing
choices. Before drafting text, preparing the cast, generating media or assembling a video,
require `status:ready` in that same directory. This also applies to resumed work.
Reuse explicit choices and existing episode snapshots. Pending SNS connections can wait.
Create or resume the episode with `project_manage episode`.

## The order (user directive, 2026-10-31)

The story tools enforce story order and cast readiness. The author completes the required
[synopsis reality check](../storyboard/references/synopsis-reality-check.md) after drafting or
revising a synopsis and before handing it over or opening scenes. Independent reviews and
Blender compositions run on request. Spending limits, generation authorization and adapter
input validation stay. Work in this order:

1. Characters — identity text (`character_manage`) and sheet images (`character_panel`, which draws
   each panel from the identity's body and face fields; `assets/characters/<id>/`, `panels.json`),
   then the episode cast in `storyboard/cast.json`:
   `{"characters":[{"id":"mina","source":"../../../assets/characters/mina/identity.md"}]}`.
   A narrator who is never seen takes `"voiceOnly": true` and needs no panels.
2. Story, one layer at a time: `story_sequence` → `story_scene` → `story_shot`. After the
   first `story_sequence`, record the cliché decision with `story_cliche` (user directive
   2026-11-18): the researched clichés the story uses, or `none` with its reason, on drama,
   comedy and romance; on other types the candidates as `offered`, applied only when the
   user picked them. Send each use again with its `scenes` once they are written. Nothing
   waits for it ([cliché use](../storyboard/references/cliche-use.md)). With `story_scene`,
   record each scene's `audienceSound` decision (`use` or `none`) and why a viewer should
   hear a cue there or why the action or dialogue already carries the moment. For a cue,
   follow the character or viewer whose expectation changes. Record the visible turn
   and the word, action or cut that should take over when the cue ends.
3. Each shot's characters (`shot_characters`, at most two) with each one's `expression` — the
   visible state the scene's situation puts on their face — then their lines (`shot_dialogue`).
   Then each scene's music decision (`story_music`, user directive 2026-11-14): `score` with a
   cue or `none`, each with its reason, read against the channel's saved music direction.
   An undecided music choice is reported on the review page and at assembly.
   Check `storyboard_read.audienceSpotting` against the lines and music. Plan each audience cue
   with `storyboard_apply.audienceEffects`, naming its trigger and release.
4. Each shot's icon attributes (`shot_icons`): render route, size, angle, camera move,
   focus, depth, frame plan (`reference` is MSR) and the transition into the next shot (`next`).
   After lines and provisional camera staging, compare the uncut scene with every join
   using [shot boundary decisions](../storyboard/references/shot-boundaries.md). Read
   `storyboard_read.boundaryReview` and `videoTiming`, revise unnecessary boundaries, and
   preserve speech/performance/continuity before images. This is authoring, not a new gate.
   Set shared camera, axis, continuity, lighting and attention with `story_scene.directionDefaults` before the shot images. Set a shot move only where it changes the default.
5. Props and backgrounds — `SB_DOC.props` and `SB_DOC.locations` with their images.
   Before a prop's description or picture, look up the real thing — the rule or form that
   makes it genuine and saved pictures of actual examples — and record `research` on its
   sheet ([prop research](../storyboard/references/prop-research.md), user directive
   2026-11-21); draw the prop's own picture from the saved real picture.
   Backgrounds default to two separate opposing camera views in `panels.front` and
   `panels.back`; follow [asset sheets](../storyboard/references/asset-sheets.md).
   Set each shot's opening `shot_icons.backgroundView` against that layout before
   `shot_image` selects its matching panel (front by default).
6. Generate the scene's chosen opening and ending images from the first and last cards using `shot_image.role` values `scene_start` and `scene_end`. Attach one composition image to every generated shot. The scene opening covers its first card. Use `shot_reference` for every card that needs its own image. A still-camera shot uses its own source image.
7. Inspect the scene's first frame and save its `videoDirection` with `story_scene`. Keep opening positions, emotion and the continuous audio track on the scene. Record each shot’s interval, camera setup, action, dialogue, incoming transition and frame-addressed images on its card.
8. Generate one video for each scene of generated shots with `video_plan {episode,sceneNo,requestId}` → `video_approve` → `video_execute`. The planner reports missing or unreadable shot images as `shot_image_required` and reports composition images the selected operation omits. Replan the complete scene after a shot correction.
9. Assembly and delivery (produce). Place the planned audience cues against the accepted cuts
   and mix them with the scene's voice, room tone and music. [Audience cue placement](../produce/references/video-sound.md#audience-effects)

The story tools refuse a layer whose parent is missing (`story_order`): `shot_characters`
waits for a story with no gaps, `shot_icons` for every shot's characters, `shot_image` for
every shot's icon attributes, and `shot_prompt` for every picture shot's image (and
the end image a `first_last` plan needs).

The cast gate (user directive, 2026-11-01): `story_sequence` refuses to start a board inside an
episode, and `story_scene`/`story_shot` refuse to continue a story-first one, until `cast.json` names at least one character (`cast_required`), each entry's `source`
is an existing `assets/characters/<id>/identity.md` (`cast_source_missing`) and every entry
without `voiceOnly` has its face, front and back panels (`character_panel_missing`). On a
story-first board `shot_characters` and `shot_dialogue` repeat that check, take the cast from
`cast.json` alone and refuse a `voiceOnly` character on screen (`cast_voice_only`). A synopsis-only
request stops after the reality check. A text-only storyboard request stops after step 4,
with the cast's panels made first under spending authorization. An image request stops
after step 6. Missing character media or
spending authorization is reported, never silently bypassed.

## Images (step 6)

`shot_image` runs `image_plan` → `image_execute` with the saved image model and the
existing spending authorization, then records `visual.frames.start` and `visual.bg` (or
`frames.end`), `visual.references`, `locationId` and `props`. One character's references are
its face, headless front and headless back panels; two characters take each face, then
each front. The place is the edit's first input: when its sheet names a built set
(`SB_DOC.locations[].manifest`), that set rendered in Blender from the shot's own camera — its size
and angle, aimed at its cast where `location_manage bind` gave them blocking — and the sheet picture
follows the panels as a look reference, or stays out with a warning when the model has no room;
without a set the sheet picture leads, with a warning (`location-assets.md`, Shot frames). The
render rides as `role:"composition"`, `use:"image"`, never into a video call, and
`visual.locationFrame` records its camera and fingerprint. The saved image model has to take every
picture the frame composes (gpt-image up to 16; astra-genai-native or an MLX Qwen-Image-2.1
pack up to 10; MLX FLUX.2 klein or Mage-Flow Edit up to 4); otherwise — a one-picture model
such as astra-genai `z-image-turbo` included — it refuses with `image_references_unsupported`,
so ask the user which model to use rather than switching silently. Every call writes a new versioned file; a new start
image takes the end image made from the old one off the shot.

## Approval before each video (user directive, 2026-10-31)

Before generating a scene (or an explicitly selected shot), show the user its `video_plan`: the prompt, the start (and end)
image and the cost. On their yes, record it with `video_approve {planIds}` in their own
words; when they approve every shot at once, `video_approve {auto:true}`. `video_execute`
refuses a plan without one (`video_approval_required`). A changed prompt, image or model
makes a new plan, which needs a new yes unless auto is on, and `video_approve` refuses a plan
that went stale before the yes (`video_plan_stale`). The review page reads
`storyboard/video-approvals.js` and marks a shot whose prompt, start/end image or lines changed
after its yes; a changed model shows when `video_execute` refuses the old plan. Never call `video_approve`
without the user's answer; it records their approval, not a step taken for them. On MSR
the start image rides in the background slot, and the plain place picture stays out.

## Review and Blender on request

[review-context](../review-context/SKILL.md), [review-camera](../review-camera/SKILL.md),
[compose-blender](../compose-blender/SKILL.md), [review-cut-images](../review-cut-images/SKILL.md)
and [review-cut-videos](../review-cut-videos/SKILL.md) run only when the user asks for them.
[generate-cut-images](../generate-cut-images/SKILL.md) is step 6 and
[generate-cut-videos](../generate-cut-videos/SKILL.md) steps 7–8.
[generate-cover](../generate-cover/SKILL.md) makes the cover once shots have pictures, any time
before publishing; it is outside the numbered order. Autoproduce coordinates.
`storyboard_check` runs every storyboard rule when the user asks; `storyboard_apply`
refuses only an unreadable board and the story order.

## Progress record

`production_workflow` keeps an optional record per episode (absolute `episode` path):
`begin` registers a stage's files (`entries:[{id,text,image,images,video}]`), `complete`
stores their hashes, `rewind` drops a stage's record and `status` shows them. Stages
complete in any order and no other tool reads this record. The one check left: a story-v2
`text_storyboard` completes only once every shot has its story and characters
(`story_outline_required`). For CLI use, put the same JSON in a request file and run
`node "$CLAUDE_PLUGIN_ROOT/server/dist/bundle.js" --workflow request.json`.

```json
{"episode":"/workspace/data/channel/episodes/topic","action":"begin","stage":"characters","entries":[{"id":"hero","text":"../../../assets/characters/hero/identity.md","image":"../../../assets/characters/hero/face.png"}]}
```

Existing episodes are regenerated in this order rather than migrated.
