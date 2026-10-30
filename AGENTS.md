# AGENTS.md — working rules for this repository

social-flow is a Claude Code plugin: 29 skills, 5 reviewer agents, and one bundled
MCP server. [README.md](README.md) is the source of truth for structure and the tool
list; [CLAUDE.md](CLAUDE.md) holds the owner's dated production directives (the later
date wins), the branch flow, the commit rules and the Korean prose rules. **Read
CLAUDE.md before you write anything** — no checker runs on docs, comments or tool
descriptions, so the writer holds the style line with the D8 scan quoted there.

## GitHub authentication — owner directive, 2026-10-16

For this `ttalkkaklab/social-flow` repository, prefer the environment variable
`TTALKKAKLAB_GITHUB_TOKEN` over generic `GITHUB_TOKEN` or `GH_TOKEN`. Before push,
PR creation or merge, use it for both `GH_TOKEN` and `GITHUB_TOKEN` in the command's
environment. This also lets Git's configured `gh auth git-credential` helper use
the correct account. Verify the account with `gh api user --jq .login` and the
repository's push permission; do not assume the generic token belongs to ttalkkaklab.
Never print a token, put it in a remote URL, persist it in a file or change global
authentication for this task. If the dedicated variable is absent or lacks access,
report that specific blocker without revealing its value.

## Tool lanes — one lane each

These are the lanes the skills are allowed to name. A skill's `allowed-tools` may
list the plugin's own server and nothing else; a host CLI's native media tools are not MCP
tools and never appear there.

| Job | Lane | Not allowed |
|---|---|---|
| Driving a browser | `ego lite` (`ego-browser`, a tool of the user's machine) | claude-in-chrome, chrome-devtools MCP, any other browser automation |
| Rendering or screenshotting a page | headless Chrome via `skills/produce/references/capture-frames.sh` | browser MCP servers |
| Images and video where the host CLI ships its own media tools (Codex `image_gen`; Grok `image_gen` · `image_edit` · `image_to_video` · `reference_to_video`) | the saved model choice in `.social-flow/models.json` governs (user directive 2026-10-16); ASTRA GenAI is the image setup recommendation (2026-10-18), a supported host tool is the video setup recommendation, and a fallback after a failed host call is asked for, never silent | any external MCP server |
| Images, video, voice, music, search otherwise | `mcp__social-flow__*` and its plugin-install form `mcp__plugin_social-flow_social-flow__*` — the server this plugin ships | any external MCP server |
| Web search with no `SERPAPI_API_KEY` or Naver pair | the host's `WebSearch` tool — the one allowed search fallback | any external MCP server |
| Reading an image | the `Read` tool, which takes images natively | vision MCP servers |

**ego lite has no fallback.** It is macOS-only. Where it is missing, the skill says
so and stops; it does not reach for a second browser. Two of these lanes exist
because a fallback lane rotted in place — six `chrome-devtools` tools and eighteen
`claude-in-chrome` tools sat in `allowed-tools` for versions after the servers were
gone from every machine that runs this plugin.

## Images containing text

For every new image generation or edit that must display or preserve readable text,
use **GPT Image 2 (`gpt-image-2`)**. This owner directive (2026-10-18) overrides saved
image defaults and the host-first lane above. Verify the host model or use the
plugin GPT Image adapter; never assume `host-managed` identifies GPT Image 2.
See [CLAUDE.md](CLAUDE.md) and [image routing](skills/_shared/image-routing.md) for
scoped selection, unavailable-model handling and text inspection.

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
  (measured: every skill present in `codex debug prompt-input`), and Claude Code uses it.
- `allowed-tools` names each of this server's tools twice: `mcp__social-flow__<tool>` (a
  project `.mcp.json`, Codex) and `mcp__plugin_social-flow_social-flow__<tool>` (a Claude
  Code marketplace install). Claude Code permission rules match a plugin server only in the
  plugin form, so the bare name alone pre-approves nothing there. skill-lint holds the pair.
- Never put `disable-model-invocation: true` on a `grow-*` skill — besides hiding it from
  the model, it stops a scheduled task or `/loop` from running the skill.

## Before you say it works

```bash
cd server && npm run check           # build + contract tests
cd .. && node skills/platform-guide/references/skill-lint.js
```

`skill-lint.js` checks the frontmatter rules above, the tool lanes, and that no
skill points at a reference file that isn't there. Both run in CI
(`.github/workflows/check.yml`) — a green local run is what a PR needs.

New tests follow CLAUDE.md's "Tests — few, one file per module" section: add cases to
the tested module's existing file, and only for behavior the change adds or alters.
`server/test/test-layout.test.mjs` rejects a test file named after no module.

Anything under `data/` is a local artifact and never gets committed. `server/dist/`
is a build artifact that **must** be committed, because marketplace installs never
run `npm install`.

## 워크트리 경로 — 사용자 지침, 2026-10-10

- 새 워크트리는 이 저장소의 기본 체크아웃 루트 아래 `.worktree/<이름>/`에 만든다.
- 연결된 워크트리에서 작업 중이면 `git worktree list --porcelain`의 첫 `worktree` 경로를 기본 루트로 사용한다. 현재 디렉토리 아래에 다시 중첩하지 않는다.
- `.worktrees/`, 저장소 옆 디렉토리, 공용 워크트리 폴더를 생성 경로로 쓰지 않는다. ASTRA와 다른 도구의 기본 경로보다 이 사용자 지침을 우선한다.
- `.gitignore`에 `/.worktree/`를 등록한다. 이 워크스페이스에서는 `git wt-add <이름> <새-브랜치> [기준-브랜치]`로 생성할 수 있다.
- 별칭이 없으면 기본 루트에서 `git worktree add -b <새-브랜치> .worktree/<이름> <기준-브랜치>`를 실행한다. 기존 브랜치 정책을 따른다.
- 머지 여부와 미커밋 변경을 확인한 뒤 `git worktree remove`로 정리한다. 미완료 작업과 로컬 자료는 보존하고 경로 이동에는 `git worktree move`를 쓴다.
