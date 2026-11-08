# Independent review and installed build

The independent reviewer scored the final implementation 98/100, with no P0:
diagnostic accuracy 30/30, edit integrity 29/30, authoring/runtime 19/20,
regression/verification 20/20. This is a rubric judgment, not a guarantee of
future shot quality.

The second review initially scored 94 and identified two legacy-data defects.
Explicit action-only performance now exposes unmapped speech groups. Legacy
scene events preserve delivery and acting and identify voiceover as narration.
Both have regression assertions in the existing storyboard test module.

Validation: 1,648 tests passed; skill-lint passed 17 rules across 29 skills;
check-scenes selftest passed. The reviewer independently checked the installation.
Repository bundle, Codex cache, Claude cache and fresh MCP loaded/disk hashes match:
`a7fa755f17cabf62e344ddfa0f200aeb5d629a85ff7fd310735a6c290fe45a0e`.

Codex's server command now points at the immutable local build
`~/.local/state/social-flow-installed/builds/0.121.1-a7fa755f17ca/server/dist/bundle.js`.
The existing conversation connection was not assumed to reload; subsequent episode
reads and edits used fresh STDIO connections to that exact installed bundle.
Both plugin caches have rollback backups under the local installer state directory.

The fresh connection exposes boundaryReview, videoTiming, imageFraming and editImpact.
A local catalog check also confirmed qwen-image-fast / qwen-image-2.1-turbo / mlx-serve.
Episode 2 has a more specific saved Codex host override, so its requested image
regeneration uses that host override rather than the workspace's local default.

Limits remain explicit: input hashes do not verify image pixels, estimates do not
establish physical feasibility, and bundle identity excludes separately cached
reference modules. No creative score was added as an execution gate.
