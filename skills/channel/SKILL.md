---
name: channel
description: >
  This skill should be used when the user asks to "채널 만들어", "채널 추가",
  "채널 목록", "프로파일 수정", "add a channel", "set up a content channel",
  or wants to create/update the per-channel directory and profile under data/.
  Creates data/<slug>/profile.md defining target audience, tone, TTS voice, visual
  theme, target platforms, and fact-check policy — the SoT every storyboard/produce/publish
  run reads first.
argument-hint: "[add|list|update|serve] [channel-name]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "mcp__social-flow__tts_local_generate", "mcp__social-flow__tts_list_voices", "mcp__social-flow__tts_elevenlabs_voices", "mcp__social-flow__tts_elevenlabs_generate"]
---

# Channel management — data/[channel]/profile.md

A channel is the top-level unit of the social-flow pipeline — one **content channel
(brand)** the user runs maps to one directory under `data/`, and its output gets
published to accounts on multiple SNS platforms (Threads·Instagram·Facebook·YouTube).
Each channel has a `data/<slug>/` directory and a `profile.md` (the channel profile);
every storyboard/production/publish run that follows **loads this profile as its
first step** and inherits tone, voice, theme, platforms, and verification policy.

```
data/
└── <channel slug>/
    ├── profile.md             # channel profile (SoT)
    ├── assets/                # channel-shared assets — catalog.md + branding/ intro/ outro/ …
    ├── growth/                # growth-loop state
    └── episodes/<topic slug>/ # episodes (created by the storyboard skill)
```

`data/README.md` and `references/assets-catalog-template.md` are the source of
truth for the `assets/` kind slots and catalog conventions. Keep only what gets
reused in two or more episodes; single-episode artifacts go in the topic's `.work/`.

## Argument parsing

`[add|list|update|serve] [channel-name]`

- `add <name>` — create a new channel (procedure below)
- `list` — Glob for `data/*/profile.md` and report channel, description, and publish platforms as a table
- `update <name>` — read the existing profile.md and edit only the fields the user specifies
- `serve` — open the channel browser in the browser (procedure below)
- With no argument, show the current state via `list`, then ask what to do next

## add procedure

1. **Pick the slug** — convert the channel name to a kebab-case English slug and
   propose it (e.g. "베트남 생활" ("Vietnam life") → `vn-life`). It's used in
   directories and paths, so avoid Korean slugs.
   If it already exists, stop and point to update.

2. **Collect the core info** — confirm the following with AskUserQuestion (at most
   4 at a time; don't re-ask anything the user already gave):
   - Target audience (who watches, and in what moment)
   - Tone (polite explanatory (존댓말) / casual punchy (반말) / documentary
     narration, etc.) — the register decided here is the source of truth for every
     output that follows. The style gate doesn't change this register; it only
     strips AI tells (platform-guide `references/korean-style.md`)
   - Publish platforms (threads / instagram / facebook / youtube)
   - Fact-check policy (informational=research required / creative·daily-life=skip)

3. **Assign the TTS voice** — from the `mcp__social-flow__tts_list_voices` result
   or the voice examples in `references/profile-template.md`, propose one Gemini
   voice that fits the tone and pin down the stylePrompt. **Once fixed, never
   change voiceName·stylePrompt** — Gemini TTS interprets style directions as
   natural language, so if the wording drifts, the voice changes from episode to
   episode. Change them only when the user explicitly says so.

4. **Fix the visual theme** — propose colors that fit the THEME contract of
   `video-template.html` (accent/accent2/ink/brand). The default is dark cinematic
   (ink navy + blue→violet gradient); channel personality comes from the accent
   color and the background mood prompt.

5. **Create profile.md** — copy `references/profile-template.md` and fill it with
   the collected values. Leave no section empty — for unknown values, ask the user
   or use a well-grounded default and mark it `(default)`.

   **Channel copy (description·bio) is outgoing copy** — the setup skills upload
   this text as the platform bio verbatim. After writing it, run the style gate
   (check-style `--surface screen`), then delegate to the growth-post-reviewer
   agent as a `standalone` surface; only copy that scores **≥95 with p0=0** goes
   into profile.md (up to 3 rounds; if it falls short, show the findings and
   refine together with the user).

   **Shared-asset catalog** — copy `data/<slug>/assets/catalog.md` from
   `references/assets-catalog-template.md`. Don't create empty kind folders.
   When branding·intro·outro install finalized assets, they add rows via
   `references/resolve-asset.py --ensure`.

   Create the episode slot `data/<slug>/episodes/`. Topic directories are opened
   under it by storyboard.

6. **Point to the SNS token directory** — publishing credentials live in the
   per-channel directory `~/.config/social-flow/<slug>/` (same slug as data/<slug>
   — the publish tools' `channel` argument points at this directory. When a
   channel is specified there is no fallback to default tokens):

   ```bash
   mkdir -p ~/.config/social-flow/<slug> && chmod 700 ~/.config/social-flow/<slug>
   ```

   For token issuance and file conventions, point to the publish skill's
   `references/token-setup.md`, and after setup have the user confirm the accounts
   to publish to via `sns_account_check` (channel=<slug>).
   If accounts must be opened from scratch, point to the per-platform setup skills
   — they run account opening, branding, and API token issuance together with the
   user via ego lite:
   `/social-flow:setup-threads <channel>` · `/social-flow:setup-instagram <channel>` ·
   `/social-flow:setup-youtube <channel>`.
   Storyboarding and production work without tokens — they only need to be ready
   by publish time.

7. **Report** — show the full generated profile.md and point to the next steps:
   if there's no profile image (logo) yet, first `/social-flow:branding <channel>`
   (4 candidates → HITL direction pick → adversarial convergence); once the logo
   is fixed, optionally `/social-flow:intro <channel>` (a channel intro video
   where the character acts — 4 concepts HITL → veo generation), then pick a
   market-validated topic with `/social-flow:topic-scout <channel>` and go to
   `/social-flow:storyboard <channel> <topic>`.

## update procedure

1. Read `data/<slug>/profile.md` (if missing, show the list and re-confirm).
2. Edit only the fields the user specifies — in particular, **warn on TTS voice
   and THEME color changes**: they clash with the tone of already-published
   videos, and the channel-shared outro (`assets/outro/`) must be rebuilt too.
   If the channel copy (description·bio) changed, pass the same gate as add
   step 5 again (check-style + growth-post-reviewer `standalone` ≥95·p0=0).
3. Report before/after as a table.

## serve procedure

`references/serve.js` serves `data/` over HTTP on this machine — a channel picker at the
top, **스토리보드 · 캐릭터** in the left nav. The storyboard list is a card per episode —
cover (the first scene's image as scenes.js names it), title, frontmatter status, the stage
`episode-state.js` derives, format, image count and blockers — grouped by playlist tabs:
전체 · one tab per distinct `series:` frontmatter line (the same line pundago's site reads;
a ` (n/m)` tail becomes the card's episode marker) · 재생목록없음 for episodes without
one. A card opens the episode's own `storyboard.html` in place (it only references
`./scenes.js`, `images/` and `../../../assets/characters/…`, so it renders the same as
from file://). The character list shows every panel image in
`assets/characters/<id>/` and the catalog note; the detail page renders `identity.md`,
swaps the main panel from thumbnails, and plays `voice.wav`.

**Panels come back face → front → back** — the order the reference set goes into a
generation call (`../produce/references/video-model-selection.md` §6), so the card
thumbnail and the detail page's opening panel are both the face. Naming isn't uniform
across channels, so the rank is read off the filename: `face`/`head` is the face,
`back`/`rear` is the rear, everything else (`body`, `front`, `real`, `three-quarter`)
is a front view. Within one rank the shorter name wins — a variant earns its length from
a suffix, so `head-closeup.png` leads `head-closeup-pre-led.png` and a card shows the
canonical panel rather than an old take.

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/channel/references/serve.js" data --open     # http://127.0.0.1:8390/
node "$CLAUDE_PLUGIN_ROOT/skills/channel/references/serve.js" data --port 8400
```

1. Run it **in the background** (`run_in_background`) so the session stays free, then
   hand the URL to the user. If the port is taken, pass `--port`.
2. It reads the disk on every request — nothing to regenerate after a skill edits a
   storyboard; reload the page.
3. It binds `127.0.0.1` on purpose. `data/` holds research notes, growth state and
   `.work/` intermediates, so `--host 0.0.0.0` (other machines, a cloudflared tunnel) is
   the user's call, never a default. Path segments starting with `.` are never served.
4. Stop it when the user is done (`pkill -f references/serve.js`) — a listener left
   behind is one more process the next session has to notice.

## Rules

- **profile.md is the only SoT** — don't keep tone·voice·theme in session memory
  or other files. The storyboard/produce/publish skills always read this file first.
- **Platform signatures stay within platform grammar** — define hashtags·CTA
  within the platform-guide skill's playbook limits (Threads hashtags ≤1,
  YouTube 3~5, etc.).
- Channel deletion is not provided — the directory holds publish history, so
  deleting is irreversible. If the user wants it, point to adding
  `status: archived` at the top of profile.md.

## Additional Resources

### Reference Files

- **`references/profile-template.md`** — standard profile.md template (section structure, THEME contract, voice examples)
- **`references/assets-catalog-template.md`** — `assets/catalog.md` starter (kind+id table)
- **`references/resolve-asset.py`** — resolve shared assets via catalog + well-known paths (`--ensure` adds a row, `--selftest`)
- **`references/serve.js`** — the channel browser over HTTP: `/api/channels`, `/api/channels/<slug>/storyboards`, `/api/channels/<slug>/characters[/<id>]`, and `/files/<slug>/…` static from `data/` (dot segments refused, Range for audio/video). Zero dependencies, `--selftest`
