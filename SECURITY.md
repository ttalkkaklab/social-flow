# Security policy

## Reporting a vulnerability

Report privately through GitHub's
[security advisory form](https://github.com/ttalkkaklab/social-flow/security/advisories/new)
rather than opening a public issue.

Include what you found, how to reproduce it, and what an attacker could do with it.
A rough proof of concept beats a polished report that arrives a week later. Expect a
first reply within a few days; this is maintained by a small team, not a security
desk with a rota.

Please don't test against accounts you don't own. Every publish tool in this plugin
posts immediately and publicly — there is no sandbox mode — so a "harmless" proof of
concept can put real content on someone's timeline.

## What this plugin handles

Understanding the blast radius helps when judging whether something is a
vulnerability:

**Platform tokens.** Long-lived credentials for Threads, Instagram, Facebook Pages,
and YouTube, stored as files under `SNS_TOKEN_DIR` (default `~/.config/social-flow`),
mode 600. They are never printed, never passed on a command line, and never written
into logs or generated documents. `sns_account_check` deliberately reports account
identity without the token value. A path that leaks a token into model-visible text,
a log file, or a committed artifact is a vulnerability — please report it.

**API keys.** OpenAI, Gemini, SerpApi, Naver, data.go.kr, BytePlus. These arrive
through the environment via `.mcp.json` passthrough and are masked in error output
(the SerpApi client masks keys in echoed request URLs). A key surviving into an error
message, a saved response, or a research note is a bug.

**Publishing.** Publish tools have no review gate of their own: a call is an
immediate public post. The safety design lives one level up, in the skills — a
mandatory HITL approval gate in `publish`, and for the autonomous growth loops, a
`growth-plan.md` standing authorization the user approves once, plus an adversarial
copy review before anything goes out. A way to reach a publish tool that bypasses
those gates is a vulnerability even though every individual API call is authorized.

**Generated files.** Media generation writes to paths derived from tool arguments.
`media-utils.ts` validates them; a traversal that escapes the intended directory is a
vulnerability.

## What isn't a vulnerability here

- A tool erroring because its key or credential file is missing. That's the design —
  credential-gated tools aren't even listed until their file exists.
- Being able to publish to your own account without a second confirmation, when
  you're operating inside a growth plan you approved at `init`. That's the documented
  standing authorization.
- Content quality problems — a gate scoring something 94 and blocking it, or missing
  an AI tell. Those are issues, not advisories.
- Anything requiring an attacker who already has your shell environment, your token
  directory, or your Claude Code session. At that point the tokens are the least of
  it.

## Supported versions

The latest release on `main` is what gets fixes. There are no long-term support
branches.
