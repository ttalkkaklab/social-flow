# AGENTS.md — working rules for this repository

social-flow is a Claude Code plugin: 18 skills, 5 reviewer agents, and one bundled
MCP server. [README.md](README.md) is the source of truth for structure and the tool
list; [CLAUDE.md](CLAUDE.md) holds the branch flow, the commit rules and the Korean
prose rules. **Read CLAUDE.md before you write anything** — it is short, and the
style rules there are enforced by a checker.

## Tool lanes — one lane each, no fallbacks

These are the lanes the skills are allowed to name. A skill's `allowed-tools` may
list the plugin's own server and nothing else.

| Job | Lane | Not allowed |
|---|---|---|
| Driving a browser | `ego lite` (`ego-browser`, a tool of the user's machine) | claude-in-chrome, chrome-devtools MCP, any other browser automation |
| Rendering or screenshotting a page | headless Chrome via `skills/produce/references/capture-frames.sh` | browser MCP servers |
| Images, video, voice, music, search | `mcp__social-flow__*` — the server this plugin ships | any external MCP server |
| Reading an image | the `Read` tool, which takes images natively | vision MCP servers |

**ego lite has no fallback.** It is macOS-only. Where it is missing, the skill says
so and stops; it does not reach for a second browser. Two of these lanes exist
because a fallback lane rotted in place — six `chrome-devtools` tools and eighteen
`claude-in-chrome` tools sat in `allowed-tools` for versions after the servers were
gone from every machine that runs this plugin.

## Skill frontmatter

- **`description` is the routing surface.** Codex truncates it to about 76
  characters (measured on codex-cli 0.149.1), so the first clause has to say what
  the skill does and where it stops. Trigger phrases come after that clause.
- Keep it under 1,024 characters, and keep `<angle>` placeholders out of it — write
  `data/[channel]/episodes/[topic]/` instead.
- Where two skills could catch the same request, each description says the boundary
  in its own words. storyboard plans and stops for approval · produce builds an
  approved episode · autoproduce runs both unattended.
- `argument-hint` stays. Codex ignores the field and loads the skill anyway
  (measured: all 18 present in `codex debug prompt-input`), and Claude Code uses it.

## Before you say it works

```bash
cd server && npm run check           # build + contract tests
cd .. && node skills/platform-guide/references/skill-lint.js
```

`skill-lint.js` checks the frontmatter rules above, the tool lanes, and that no
skill points at a reference file that isn't there. Both run in CI
(`.github/workflows/check.yml`) — a green local run is what a PR needs.

Anything under `data/` is a local artifact and never gets committed. `server/dist/`
is a build artifact that **must** be committed, because marketplace installs never
run `npm install`.
