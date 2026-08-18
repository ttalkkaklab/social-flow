# social-flow — Project instructions

Channel-based short-form/long-form content pipeline Claude Code plugin.
[README.md](README.md) is the source of truth for structure, skills, and the MCP tool list.

## Style ban — report-style stative verbs (user directive, 2026-08-12)

Don't close sentences with Korean endings of the
**남긴다 · 갈린다 · 나뉜다 · 남는다 · 남습니다 · 나뉩니다 · 갈립니다 · 남깁니다**
family. Wrapping a phenomenon up in a single verb is narration-style prose — an AI tell.
Name the subject and write concretely instead — "근거를 남긴다" → "근거를 적어 둔다",
"추천이 갈린다" → "미용실마다 다른 색을 권한다", "둘로 나뉜다" → "두 갈래다".

**The scope isn't just content copy** — skill docs, code comments, tool descriptions,
published HTML, commit messages, user responses, all of it. `check-style.py` D8(S1)
machine-blocks content copy, but **no checker runs on docs and comments**, so the
writer has to hold the line. Run this scan when writing or editing a doc:

```bash
python3 - <<'PY'
import re, os, glob
pat = re.compile(r'남긴다|갈린다|갈렸다|엇갈린다|나뉜다|(?<!살아)남는다'
                 r'|갈립니다|나뉩니다|(?<!살아)남습니다|남깁니다')
roots = ['skills','agents','server/src','docs'] + glob.glob('data/*/growth/*/growth-plan.md')
files = ['README.md','CLAUDE.md']
for r in roots:
    if os.path.isfile(r): files.append(r); continue
    for dp,_,fn in os.walk(r):
        files += [os.path.join(dp,f) for f in fn
                  if f.endswith(('.md','.html','.ts','.js','.sh','.py'))]
for p in files:
    if 'korean-style.md' in p or 'check-style.py' in p: continue   # rule source of truth · fixtures
    s = open(p,encoding='utf-8',errors='replace').read()
    for m in pat.finditer(s):
        print(f"{p}: …{s[max(0,m.start()-40):m.end()+15]}…".replace('\n',' '))
PY
```

`growth-plan.md` (the standing authorization) is in the scan — it's our prose, reread
every tick. `growth-log.md` and `state.json` are not (past records, and they hold
reviewer quotes). `CLAUDE.md` quotes the banned forms in this section, so it's normal
for the scan to flag that passage.

The rule's source of truth is `skills/platform-guide/references/korean-style.md` §D8.
Exceptions: `살아남는다` (a different verb), conditionals (`나뉜다면`), spoken past
tense, and imperatives (`남겼어`·`남겨 둬`).

## Branch strategy

```
feat/<name> | fix/<name>  (integration)  →  dev  →  staging  →  main
```

- Sprint work happens in a `feat/sprint-<N>-<name>` worktree and PRs into the integration branch.
- Promotion goes `dev → staging → main`, in that order. Never straight to `main`.
- Keep remote work branches after merge (history, rollback). Clean up local sprint branches only.

## Commits and secrets

- Never commit `.env*`, `*.pem`, `*.key`, or any credentials/secrets (already in `.gitignore`).
- Nothing under `data/` gets committed — the one exception is `data/README.md`,
  which documents the structure. Channel profiles, storyboards, images, videos,
  and branding assets are local artifacts; this repo holds only plugin code and skills.
- Conversely, `server/dist/` is a build artifact but **must be committed** — `.mcp.json`
  runs `${CLAUDE_PLUGIN_ROOT}/server/dist/index.js` directly with no build step,
  so ignoring it breaks the installed copy. After editing `server/src/`, run
  `npm run build` and commit dist along with it.
- API keys are injected via shell environment variables, not `.mcp.json`.

## Multi-session caution

Multiple Claude Code sessions work in this repo at the same time.
Before committing or merging, check `git status` and recently modified files
(`find . -mmin -30`) so you don't sweep up files another session is editing.
