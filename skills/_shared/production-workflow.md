# Production order

Run `project_manage status` first. Resolve missing settings through project-init before
characters or text authoring, including text-only requests. Pending SNS connections do
not block local work. Create/resume the episode with `project_manage episode`.

## The order (user directive, 2026-10-31)

Checks were removed for speed: only the story order is enforced, and reviews, Blender
compositions and other checks come back once the quality is known. Spending limits,
generation authorization and adapter input validation stay. Work in this order:

1. Characters — identity text and sheet images (`assets/characters/<id>/`, `panels.json`).
2. Story, one layer at a time: `story_sequence` → `story_scene` → `story_shot`.
3. Each shot's characters (`shot_characters`, at most two), then their lines (`shot_dialogue`).
4. Each shot's icon attributes (`shot_icons`): render route, size, angle, camera move,
   focus, depth and frame plan (`reference` is MSR).
5. Props and backgrounds — `SB_DOC.props` and `SB_DOC.locations` with their images.
6. Each shot's start image (`shot_image`), composed from its characters' sheet panels,
   its place and props; then the end image (`frame:"end"`) only for a `first_last` shot.
7. Each `generated_video` shot's video prompt (`shot_prompt`), from its icon attributes,
   lines and an English action.
8. Each shot's video: `video_plan` → the user's approval (`video_approve`) → `video_execute`.
9. Assembly and delivery (produce).

The story tools refuse a layer whose parent is missing (`story_order`): `shot_characters`
waits for a story with no gaps, `shot_icons` for every shot's characters, `shot_image` for
every shot's icon attributes, and `shot_prompt` for every picture shot's start image (and
the end image a `first_last` plan needs). Nothing else blocks a step. A text-only request
stops after step 4; an image request stops after step 6. Missing character media or
spending authorization is reported, never silently bypassed.

## Images (step 6)

`shot_image` runs `image_plan` → `image_execute` with the saved image model and the
existing spending authorization, then records `visual.frames.start` and `visual.bg` (or
`frames.end`), `visual.references`, `locationId` and `props`. One character's references are
its face, headless front and headless back panels; two characters take each face, then
each front. The place is the edit's first input. The saved image model has to take several
pictures (gpt-image, astra-genai-native, mlx); a one-picture model such as astra-genai
`z-image-turbo` refuses with `image_references_unsupported`, so ask the user which model to
use rather than switching silently. Every call writes a new versioned file.

## Approval before each video (user directive, 2026-10-31)

Before a shot's video, show the user its `video_plan`: the prompt, the start (and end)
image and the cost. On their yes, record it with `video_approve {planIds}` in their own
words; when they approve every shot at once, `video_approve {auto:true}`. `video_execute`
refuses a plan without one (`video_approval_required`). A changed prompt, image or model
makes a new plan, which needs a new yes unless auto is on. Never call `video_approve`
without the user's answer; it records their approval, not a step taken for them. On MSR
the start image rides in the background slot, and the plain place picture stays out.

## Review and Blender on request

[review-context](../review-context/SKILL.md), [review-camera](../review-camera/SKILL.md),
[compose-blender](../compose-blender/SKILL.md), [review-cut-images](../review-cut-images/SKILL.md)
and [review-cut-videos](../review-cut-videos/SKILL.md) run only when the user asks for them.
[generate-cut-images](../generate-cut-images/SKILL.md) is step 6 and
[generate-cut-videos](../generate-cut-videos/SKILL.md) steps 7–8. Autoproduce coordinates.
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
{"episode":"/workspace/data/channel/episodes/topic","action":"begin","stage":"characters","entries":[{"id":"hero","text":"../../../assets/characters/hero/identity.md","image":"../../../assets/characters/hero/front.png"}]}
```

Existing episodes are regenerated in this order rather than migrated.
