# Contributing to social-flow

Thanks for taking a look. This is a working tool before it is a library, so the
short version is: keep the pipeline honest, and don't break the gates.

## Getting set up

```bash
git clone https://github.com/ttalkkaklab/social-flow.git
cd social-flow/server && npm install && npm run check
```

`npm run check` builds the TypeScript and runs the tool contract tests. It makes no
external API calls, so it passes with zero API keys configured. If it doesn't pass on
a fresh clone, that's a bug worth reporting on its own.

Load your clone into Claude Code with `claude --plugin-dir /path/to/social-flow`.

## The one build rule that trips people up

`server/dist/` is committed on purpose. `.mcp.json` runs
`${CLAUDE_PLUGIN_ROOT}/server/dist/index.js` directly with no build step, so an
un-rebuilt dist means the installed plugin silently runs old code.

**After changing anything in `server/src/`, run `npm run build` and commit
`server/dist/` in the same commit.** CI can't fix this for you.

## What changes need what

**Adding or changing an MCP tool.** Tool definitions live in `server/src/tools.ts`,
handlers in `server/src/handlers.ts`. The contract tests enforce conventions rather
than behavior: search tools take `query` / `limit` / `page` regardless of what the
backend API calls them, every tool carries annotations and an outputSchema, enums
match their source-of-truth constants, and generated-file paths are validated. Add
your tool to the contract test's expectations in the same PR.

**Changing a skill.** Skills are prompt documents; their `SKILL.md` frontmatter
`description` is what makes Claude pick the skill, so treat it as an interface, not
prose. Keep the existing bilingual pattern — English description with the Korean
trigger phrases quoted — because both matter for matching.

**Touching a quality gate.** The adversarial reviewers (`agents/*.md`) and
`check-style.py` are the reason output stays publishable. Loosening a threshold is a
product decision, not a cleanup: say why in the PR, and don't fold it into an
unrelated change. If a gate is wrong, fix the rule; don't add an escape hatch around
it.

**Korean-language rules.** `skills/platform-guide/references/korean-style.md` is the
source of truth and `check-style.py` is its machine half. They cross-reference by
rule ID (D8, D9, C7 …), so a change to one needs the matching change in the other,
plus a self-test fixture that fails before your fix and passes after.

## Style

Docs and comments are English. Code follows whatever the surrounding file already
does — match the local idiom rather than importing your own.

Prose, in either language, reads like a colleague explaining something: say what
happened, then why. No filler adjectives, no three-item lists as a reflex, no
"comprehensive" or "seamless". Korean content copy has a machine gate for this; the
docs rely on the writer.

## Pull requests

Branch off `dev`. Promotion runs `dev → staging → main`; nothing lands on `main`
directly.

A good PR says what changed, what you ran to check it, and what you deliberately
didn't do. Paste the actual command output — `npm run check`, the self-test, a
screenshot of a rendered frame — rather than asserting it works. If something
failed and you're shipping anyway, say that too; a known gap in the open is cheaper
than a surprise later.

## Reporting bugs

Include the plugin version (`.claude-plugin/plugin.json`), what you ran, what
happened, and which keys/credentials were configured — a surprising number of
issues turn out to be a tool that wasn't listed because its credential file was
missing. `sns_account_check` reports token status without printing token values;
its output is safe to paste.

Never paste API keys, access tokens, or the contents of files under
`~/.config/social-flow/`. See [SECURITY.md](SECURITY.md) if you think you've found
a vulnerability.

## Scope

This plugin exists to operate your own accounts. Contributions that add multi-account
blasting, engagement farming, or ways around a platform's automation policy are out
of scope regardless of how well they're implemented.

A few requests come up often enough to answer in advance. None of these are bad ideas;
they're just larger than they look, and saying so up front beats leaving an issue open
for months.

- **Another platform (TikTok, X, LinkedIn, …)** — a platform isn't one publish call. It
  needs its own format preset, its own copy grammar in the playbook, its own insights
  shape for the growth loop, and its own credential and token-refresh path. Adding one
  properly is a project, not a patch. If you want to take that on, open an issue and
  let's scope it before you write code.
- **A different content language** — the copy gates are Korean-specific by construction:
  `check-style.py`'s rules are Korean regexes, and the reviewers judge Korean register.
  The rest of the pipeline is language-agnostic, so another language means writing a new
  gate rather than translating this one. Worth doing, but as its own module.
- **A different LLM or agent runtime** — this is a Claude Code plugin. Skills are prompt
  documents that assume Claude Code's skill loading, HITL prompts, and MCP wiring. The
  MCP server underneath is portable; the skills are not.
- **Removing or lowering the quality gates** — the gates are why output is publishable.
  A flag to skip them turns the default into "ships whatever came out". If a gate is
  wrong, fix the rule and bring the fixture that proves it.

**Response time.** Expect a reply within about a week. If a week passes with nothing,
say so in the thread — that's a nudge, not a nag, and it's the fastest way to surface
something that got missed.
