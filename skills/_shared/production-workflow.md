# Enforced production order

Run `project_manage status` first. Resolve missing settings through project-init before
characters or text authoring, including text-only requests. Pending SNS connections do
not block local work. Create/resume the episode with `project_manage episode`.

The order is:
1. `characters`: identity/appearance/voice text and actual character images.
2. `text_storyboard`: complete actions, attributed dialogue and narration, text only.
3. `props`: inventory derived from the text, with descriptions and actual images.
4. `backgrounds`: descriptions/layouts and actual images for the required locations.
5. `image_storyboard`: shot descriptions and actual composed images using prior assets.
6. Video generation and assembly.

Use `production_workflow` with the absolute `episode` directory:
- `status` returns the current/next stage and detects stale completed artifacts.
- `begin` takes `stage` and `entries:[{id,text,image}]`. Paths are relative to the
  episode or absolute; shared character assets can be referenced directly. Omit image
  only for text_storyboard. Register every required asset before generation; image_plan
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
or visual quality. Human review and actual generation/publishing authorization still apply.

Storyboard plans the text and shots; produce performs authorized image generation in
stage order and then video. Autoproduce coordinates both. A text-only request stops after
the text stage, and an image-board request stops after image_storyboard. If required
character media or spending authorization is missing, report the blocked stage. Do not
silently bypass it or start paid work beyond the user's scope.
