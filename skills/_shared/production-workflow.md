# Enforced production order

Run `project_manage status` first. Resolve missing settings through project-init before
characters or text authoring, including text-only requests. Pending SNS connections do
not block local work. Create/resume the episode with `project_manage episode`.

The full order and stage skills are defined below under Fixed cut workflow.

Use `production_workflow` with the absolute `episode` directory:
- `status` returns the current/next stage and detects stale completed artifacts.
- `begin` takes `stage` and `entries:[{id,text,image}]`. Paths are relative to the
  episode or absolute; shared character assets can be referenced directly. Use image for asset/composition/image stages; use video for the video stage. Register every required asset before generation; image_plan
  uses the entry's id as assetId and its image path as the output destination.
- `complete` takes `stage`. It reads nonempty text, decodes each image and stores hashes.
  A status flag, missing file or renamed text file cannot substitute for an image.
- `rewind` takes `stage`, invalidates that stage and every later receipt, and keeps media.
  Begin and complete those stages again, reusing unchanged media where appropriate.

An empty characters/props/backgrounds stage uses `entries:[]` plus a concrete
`notApplicable` reason. Text and image storyboards cannot be skipped. A characterless
explainer does not need a manufactured actor. Register every real subject, not one
placeholder for the category. For text_storyboard, reference a dedicated text artifact;
for sheet text, reference a stable export or identity file rather than mutable scenes.js.

Example begin request:
```json
{"episode":"/workspace/data/channel/episodes/topic","action":"begin","stage":"characters","entries":[{"id":"hero","text":"../../../assets/characters/hero/identity.md","image":"../../../assets/characters/hero/front.png"}]}
```

For CLI use, put the same JSON in a request file and run
`node "$CLAUDE_PLUGIN_ROOT/server/dist/bundle.js" --workflow request.json`.
All built-in image/video routing plans and execution, storyboard_apply and the canonical
video assembler enforce the relevant prerequisites for managed episode paths. Legacy
provider entrypoints route through the same services. Existing episodes without receipts
must register their existing artifacts in order; there is no silent legacy exemption.
Read/status recovery remains available and does not submit another generation.

Host image/video tools and arbitrary shell writes are outside the MCP server boundary.
Obtain the corresponding image_plan/video_plan before a host call and complete the
artifact stage afterward. Do not claim the server can intercept host tools. A user or
agent with unrestricted filesystem access can also alter receipts; this is an execution
contract, not a security sandbox. Hashes prove file stability, not narrative completeness
or visual quality. Independent review and actual generation/publishing authorization still apply.

Storyboard plans the text and shots; produce performs authorized image generation in
stage order and then video. Autoproduce coordinates both. A text-only request stops after
the text stage, and an image-board request stops after image_review. If required
character media or spending authorization is missing, report the blocked stage. Do not
silently bypass it or start paid work beyond the user's scope.

## Fixed cut workflow (owner directive, 2026-10-19)

For cut storyboard images, this contract supersedes the guidance-only review policy. Asset sheets keep their preparation roles. The full
server sequence is:

`characters -> text_storyboard -> context_review -> props -> backgrounds -> camera_review
-> blender_composition -> image_storyboard -> image_review -> video -> video_review`.

The seven stage skills, in order, are [review-context](../review-context/SKILL.md),
[review-camera](../review-camera/SKILL.md), [compose-blender](../compose-blender/SKILL.md),
[generate-cut-images](../generate-cut-images/SKILL.md),
[review-cut-images](../review-cut-images/SKILL.md),
[generate-cut-videos](../generate-cut-videos/SKILL.md) and
[review-cut-videos](../review-cut-videos/SKILL.md).
Autoproduce coordinates state and invokes them; it does not substitute its own verdict.
Produce supplies the shared generation, assembly and delivery implementations.

There is no skip, force, waiver or renderer fallback in this sequence. The generation
stages stop before their review stage. Reviews use a fresh independent host reviewer;
the author fixes defects and a reviewer rechecks. No invented numeric score target is
required: all required corrections must be resolved with actual evidence. Unsupported
playback or unavailable independent review leaves the stage incomplete. Keep work and
report the blocker. Three unsuccessful improvement rounds without a resolved defect,
provider attempt limits, or an exhausted spending budget stop the loop with its findings;
none of these makes a failed stage complete. No repeated human approval is needed within
already authorized work and budgets.

Text-only requests may stop at text_storyboard; requests to review text stop after
context_review. A camera-only review stops after camera_review. Later work cannot treat
those limited deliverables as a complete image/video pipeline.

## Review receipt

Use a dedicated, revision-specific JSON file as the review entry's `text`. Before `begin`,
write its `criteria` object with an absolute rubric path and SHA256. Begin freezes that
hash, including across rewinds. The rubric must exist before the reviewer reads the work.
The reviewer supplies the completed receipt; the coordinator never fabricates its content.
Use the same whole-sequence receipt for all camera cut entries if appropriate.

A passing receipt has this shape (paths and hashes below are descriptive placeholders):

```json
{
  "stage": "context_review",
  "author": "author-session-id",
  "reviewer": "independent-reviewer-session-id",
  "independent": true,
  "verdict": "pass",
  "coverage": "text",
  "criteria": {"path": "/episode/rubric.md", "sha256": "actual SHA256"},
  "inputs": {"/episode/audience-text.md": "actual SHA256"},
  "observations": ["Specific observed evidence and its effect on audience understanding."],
  "unresolved": [],
  "audienceRead": {
    "blind": true,
    "reconstruction": "What an unbriefed viewer understands from the presented events.",
    "transitions": [{
      "from": "beat-1", "to": "beat-2",
      "viewerUnderstands": "What shown information supports the next choice.",
      "evidence": [{"path": "/episode/audience-text.md", "quote": "Exact source quotation", "cutId": "beat-1"}]
    }],
    "missingContext": []
  }
}
```

For camera/image/video reviews include `cutIds` covering every relevant cut. Camera
review entries define the full cut inventory; Blender and image stages must match it.
Use coverage `text`, `images`, `video_playback` respectively. Only context review needs
`audienceRead`. Inputs include every source-stage artifact and its hash: text_storyboard
for context/camera, image_storyboard for image review, video for video review. Camera
review also includes the stable camera-plan export. Include relevant prior visual inputs
when comparing images and clips. Dedicated exports prevent later receipt edits to
scenes.js from invalidating otherwise unchanged text or camera evidence.

Complete checks actual files/hashes, reviewer/author distinction, coverage, cut inventory,
quoted context evidence and unresolved corrections. This does not prove perception or
reviewer identity: those are host attestations, not cryptographic facts. An unrestricted
agent can edit local files or call tools outside the server. Do not claim a security sandbox.

## Generation and delivery

Blender entries use `{id,text,image,blend}`: text is the renderer's composition.json receipt,
image is its actual start frame and blend is its real .blend source. `location_manage render`
returns `compositionReceipt`. Image generation requires the corresponding composition in
`imagePath`, `refImagePaths` or host `referenced_image_paths`, not a prompt mention.
Video entries use `{id,text,video}` with id equal to video_plan's shotId. Register all clips
that will be used, including existing clips; completion probes real video streams/duration.
Review all registered clips before final assembly. The canonical assembler requires
video_review completion and compares every source video path/hash from the assembly
manifest against the reviewed clips. An unrelated passing review cannot authorize a
substituted clip. The final master still receives produce's normal delivery checks.

## Re-enter an existing storyboard

`/social-flow:review-context <episode-or-storyboard-path>` reviews and improves existing
text only. `/social-flow:review-camera <path>` targets direction after context has passed.
The other stage skills have the same path argument. In a host without namespaced slash
commands invoke the corresponding installed skill by name and provide the path.
For end-to-end improvement use `/social-flow:autoproduce <path>` and explicitly request
improvement of the existing episode; keep its story, approved scope and spending authority.

Resolve a storyboard/scenes.js path to its episode directory. Inspect existing assets;
register them in order without regeneration. Version-1 workflow receipts retain character
and text preparation only; they resume at context_review, never import an old quality pass.
No receipts means register actual preparation artifacts first. Missing preparation is
reported rather than paid generation being inferred from a review request.

For a completed stage use rewind before rerunning it. For an upstream correction rewind
the earliest changed artifact stage, edit, and complete/review its descendants in order.
Unchanged files may be reused but changed hashes require fresh review. Rewind archives
state and existing review text, leaves all media intact and preserves frozen rubric hashes.
A review-only command stops at its own boundary; it does not regenerate downstream media.
