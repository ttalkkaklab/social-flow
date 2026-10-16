---
name: channel
description: >
  Creates channel profiles and reusable character sheets; stops before episodes. Use
  when the user asks to "채널 만들어", "채널 추가", "채널 목록", "프로파일 수정", "add a channel", "set up a
  content channel", "캐릭터 만들어", "캐릭터 시트 수정", or wants to create or update the channel directory under data/. For full workspace defaults (SNS, genre, style, video ratio) use project-init. Writes
  data/[slug]/profile.md — target audience, tone, TTS voice, visual theme, target
  platforms, fact-check policy — the source of truth every storyboard, produce and publish
  run opens before anything else.
argument-hint: "[add|list|update|serve|character] [channel-name]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "mcp__social-flow__tts_local_generate", "mcp__social-flow__stt_local_transcribe", "mcp__social-flow__tts_list_voices", "mcp__social-flow__tts_elevenlabs_voices", "mcp__social-flow__tts_elevenlabs_generate"]
---
**Automatic execution policy:** Read [automation guidance](../_shared/automation-guidance.md) first. Creative rules and review findings guide improvements; scores, review/hash/freeze records, CTA choices and intermediate approval steps do not block authorized work. Preserve actual external-action authorization and stop at the artifact the user requested. This policy supersedes older quality-gate wording below.


**HITL records:** Keep channel answers in profile.md. Preserve actual provenance in local files and reuse existing authorization. This adds no approval gate.


# Channel management — data/[channel]/profile.md

For an entire project setup use [project-init](../project-init/SKILL.md), which
collects shared preferences and creates this layout with `project_manage`. A
channel-only request still follows this skill without forcing full project setup.
When project-init authors a new profile, use the choices already collected there,
especially the speech engine and target platforms; do not ask them again.

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

`[add|list|update|serve|character] [channel-name]`

- `add <name>` — create a new channel (procedure below)
- `list` — Glob for `data/*/profile.md` and report channel, description, and publish platforms as a table
- `update <name>` — read the existing profile.md and edit only the fields the user specifies
- `character <channel> <id>` — create or update the reusable character using [character-identity.md](references/character-identity.md); read existing identity first and preserve unspecified fields. Export and check the local review library after changes.
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
   or the voice examples in `references/profile-template.md`, propose the engine
   (`local` Supertonic is the default — zero cost; `gemini` only when acted emotion
   is the channel's identity) and one voice that fits the tone, and pin down the
   stylePrompt. **Once fixed, never
   change voiceName·stylePrompt** — Gemini TTS interprets style directions as
   natural language, so if the wording drifts, the voice changes from episode to
   episode. Change them only when the user explicitly says so.

   If the working directory already has [model settings](../_shared/model-settings.md),
   use its speech engine/model when proposing a new voice instead of the default
   above. Do not start full media-model setup for a channel-only request. Preserve
   existing pinned voices; resolve conflicts when the user starts episode production.

4. **Fix the visual theme** — propose colors that fit the THEME contract of
   `video-template.html` (accent/accent2/ink/brand). The default is dark cinematic
   (ink navy + blue→violet gradient); channel personality comes from the accent
   color and the background mood prompt.

5. **Create profile.md** — copy `references/profile-template.md` and fill it with
   the collected values. Leave no section empty — for unknown values, ask the user
   or use a well-grounded default and mark it `(default)`.

   **Settle the motion contract as part of the visual theme** — whether the channel permits
   still-led episodes, which true-motion kinds count, the longest permitted still run, whether
   each moving shot needs a visible `action`, and the paid generated-video cap. Keep the
   template's `off` defaults only when the channel made no motion promise. Ken Burns, caption
   changes and swapping still images never count as true motion.

   **Two more front-matter choices sit next to it.** `shortform_outro` is `on` unless the
   channel deliberately ends its shorts on the CTA's last frame, and `length_min_seconds` /
   `length_max_seconds` narrow the short-form band. Leave the length keys out unless the
   channel has a reason to hold a tighter band — omitted, the format's own band applies.

   **Channel copy (description·bio) is outgoing copy** — the setup skills upload
   this text as the platform bio verbatim. After writing it, run the style gate
   (check-style `--surface screen`), then delegate to the growth-post-reviewer
   agent as a `standalone` surface; use the findings to improve copy before it goes
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
   **Warn on `shortform_outro` and the length band for a different reason** — they change
   what gets made from here on. Flipping `shortform_outro` to `off` drops the spliced tail
   from every future short (the outro file stays on disk; it just stops being used), and
   narrowing `length_min_seconds` / `length_max_seconds` moves what the length check
   measures against, so a board that drew no flag last week comes back flagged today
   (`check-scenes.js` and the approval strip warn outside the band; only the 180s platform
   cap fails). Neither touches an episode that is already built.
   If the channel copy (description·bio) changed, pass the same gate as add
   step 5 again (optional style diagnostics and concrete copy review).
3. Report before/after as a table.

## serve procedure

`references/serve.js` serves the offline library over HTTP on this machine. The root
lists channels; each channel has **스토리보드 · 캐릭터** in the left nav. The current
library follows the static layout described below.

The previous browser remains at `/legacy`. Its storyboard list is a card per episode —
cover (the first scene's image as scenes.js names it), title, frontmatter status, the stage
`episode-state.js` derives, format, image count and blockers — grouped by playlist tabs:
전체 · one tab per distinct `series:` frontmatter line (the same line pundago's site reads;
a ` (n/m)` tail becomes the card's episode marker) · 재생목록없음 for episodes without
one. The legacy browser at `/legacy` opens the episode's own `storyboard.html` in place (it only references
`./scenes.js`, `images/` and `../../../assets/characters/…`, so it renders the same as
from file://). The character list shows every panel image in
`assets/characters/<id>/` and the catalog note; the detail page renders `identity.md`,
swaps the main panel from thumbnails, and plays `voice.wav`.

**Legacy panels come back face → front → back** — the order the reference set goes into a
generation call (`../produce/references/video-model-selection.md` §The character panels), so the card
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
2. The home page exports the offline library for every channel. Opening a generated
   index refreshes that channel; ordinary media requests only read files. `/legacy`
   retains the previous API browser. A conflicting hand-authored index is reported.
3. It binds `127.0.0.1` on purpose. `data/` holds research notes, growth state and
   `.work/` intermediates, so `--host 0.0.0.0` (other machines, a cloudflared tunnel) is
   the user's call, never a default. Path segments starting with `.` are never served.
4. Stop it when the user is done (`pkill -f references/serve.js`) — a listener left
   behind is one more process the next session has to notice.

## Local review HTML (required after character edits)

For every new or updated character, follow [character-identity.md](references/character-identity.md). The structured identity is required in addition to the pinned voice below.

Export the bundled sheet before any episode candidates or scene images, including drafts with pending media. Follow [panel specifications](references/character-panels.md) for purpose, canvas ratio and subject size. Never hand-author the review HTML.

Every character sheet must include one fenced `json` block in `identity.md`:

```json
{"tts":{"engine":"supertonic","voiceId":"M1","language":"ko","speed":1}}
```

This is an example, not a default for the cast. Choose and pin each character's
voice; include model/stylePrompt when the engine uses them. Silent characters still
need a voice configuration for reuse. Narrator settings do not substitute for a
character voice. Copy this exact `tts` into `SB_DOC.characters`.
Keep dialogue speaker IDs attached to their characters; voice settings alone do not
author dialogue or lip sync. Missing or invalid settings produce content diagnostics and
prevent the sheet from displaying a review pass; template freshness is checked separately. Existing sheets need migration,
not an invented voice.

For a new character or a changed voice, generate `voice.wav` from a short Korean
sample (or the explicitly selected language) using that exact configuration. Save
`sample.txt`, the generation request/result and the WAV SHA-256 next to the sheet.
A failed or unavailable engine means the voice is pending, not ready. Do not silently
substitute the channel narrator, another engine or a stock sample. Reuse an existing
sample only when its text, voice settings and hash still match.
When the user requests speech accuracy, run `stt_local_transcribe` without supplying
the expected text as context, compare the transcript with `sample.txt`, and save the
transcript, normalization method and character error rate. Fix omissions or incorrect
words and rerun the check. Transcription checks wording; it does not establish acting,
timbre or pronunciation quality. Report those limits and never invent a listening pass.
A voice setting alone does not prove that the generated sample speaks correctly.

After creating or updating character identity, panels or voice, run:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/channel/references/review-library.js" "data/<channel>"
node "$CLAUDE_PLUGIN_ROOT/skills/channel/references/review-library.js" "data/<channel>" --check
```

Deliver `data/<channel>/assets/characters/index.html` for the complete cast and
`assets/characters/<id>/index.html` for each sheet. They open directly with file://;
no HTTP server is needed. Each sheet shows basic identity, three
required image slots (front/body, back, face), optional extras, voice.wav and the
full identity document. Keep `identity.md` and media as the source; do not edit
exported HTML. Named voice/appearance/role fields are read from identity.md.

Optional `review.json` exposes independent review separately from image availability:
Keep changing scores, thresholds and pending/passed state in this record, not in
`identity.md`. The identity document defines the character; duplicate status prose
can contradict a later review or user threshold change and invalidate its input hash.
`score` (0–100), `iteration` (positive integer), `critical` (nonnegative integer),
and `inputHashes` mapping identity.md/body.png/back.png/face.png to their reviewed
SHA-256 values. Include `voice.wav`, `sample.txt` and `voice-accuracy.json` whenever
present; adding, removing or changing one invalidates the review. Record what the
review actually assessed and any listening limitations. Optional `threshold` (integer 1–100, legacy default 95) records the
user's chosen passing score; do not lower it without their instruction. Write only
an actual review result. A score at or above that threshold with zero critical
defects displays a pass only while all reviewed hashes match. Changed inputs
display a request for re-review; missing/invalid records display draft status.

The same export updates `storyboards/index.html` and
`storyboards/<episode>/index.html`. The latter uses the canonical storyboard
renderer and relative references to `episodes/<episode>/storyboard/`; it never
moves production data or duplicates media. Re-export after changes, including
SB_DOC edits, and run --check before delivery. Hand-authored index.html files and
output symlinks are refused, never overwritten. Keep the channel folder together
when copying it to another machine. Design source and limits:
[local-review-design.md](references/local-review-design.md).


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
- **`references/review-library.js`** — exports offline character sheets, both indexes and episode review pages; `--check` detects stale output
- **`references/serve.js`** — the channel browser over HTTP: `/api/channels`, `/api/channels/<slug>/storyboards`, `/api/channels/<slug>/characters[/<id>]`, and `/files/<slug>/…` static from `data/` (dot segments refused, Range for audio/video). Zero dependencies, `--selftest`
