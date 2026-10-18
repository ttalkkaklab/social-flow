# Working-directory video type and media models

## Complete project setup

For a new project or NEW episode, first follow [project-init](../project-init/SKILL.md).
Use `project_manage status` (or `project-settings.js status`) with the explicit
workspace. It checks SNS targets/connection records, genre/models, visual style,
video ratio and output format together in this same `.social-flow/models.json`.
Existing model-only files remain valid: ask only for missing project preferences.
New unattended production with missing fields reports `project_setup_required`;
pending SNS connections do not block local authoring. Existing episode resumes
retain their original snapshot/board, including legacy ones without these fields.

Create NEW episodes with `project_manage episode` so directory creation, the full
snapshot and the authoring handoff stay together. Apply its `FORMAT` and
`PRODUCTION` to the new board before the adapter mappings below. Reuse the saved
style and ratio without a fresh preference question; quote actual costs and keep
spending authorization separate. The low-level model CLI below remains available
for compatibility and explicit model changes; it preserves all project fields.

Owner directive, 2026-10-16: once the production working directory is known, select
**video type → video model → speech model → image model** once and save them in that directory. Every new
episode uses those choices until the user explicitly requests a change. This takes
precedence over automatic host detection, economy/quality routing, per-cut model
escalation and repeated model questions in older skill sections. It is an explicit
user-choice exception to host-first routing, not permission for a silent fallback.

## Resolve the directory and read first

Use the working directory the user selected (normally the project root containing
`data/`). Keep its absolute path as `WORKSPACE` throughout the session, even after
changing into an episode directory. Do not use the plugin install, `$HOME`, or a
different channel/project as an implicit settings source. For an existing episode,
its `.work/model-settings.json` records the original source path. If the workspace
cannot be identified from the session or that record, ask where to work.

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/model-settings.js" show "$WORKSPACE"
```

`configured`: briefly state the saved type and models and continue without another
question. `setup_required`: select the type and three models below before authoring a
new generated episode or making a media call. `video_type_required`: older settings
already contain models; ask only for the type before the next new episode and save
it with `update`. Resume an existing episode from its snapshot/board without another
setup question, even if that legacy snapshot has no type. A malformed file is an error to
repair, not permission to overwrite it with defaults. Do not copy choices from a
previous episode or channel profile into directory settings without the user's
selection. Existing choices may be offered as candidates.

| Status | Returned by | Meaning |
|---|---|---|
| `setup_required` | `model-settings.js show` | No `.social-flow/models.json`; run first setup. |
| `video_type_required` | `model-settings.js show` | Models saved, type missing; ask only the type. |
| `configured` | `model-settings.js show` | Type and three models saved (model-only view). |
| `migration_required` | both | Retired speech model; update speech explicitly before new generation. |
| `project_setup_required` | `project_manage status` / `episode` | Project, style, production, SNS or channel layout missing; `missing[]` names them. An unattended caller reports it and defers authoring. |
| `ready` | `project_manage status` | Complete settings; authoring starts without a preference question. |

`project_manage episode` returns `created`, `resumed` or `legacy_episode`.

## First setup: video type, then three models

First read [video types](video-types.md) and run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/model-settings.js" types
```

Use the returned localized names and descriptions in the host's user-choice/HITL
interface. Ask which type this directory should make, with one sentence per option
explaining its dialogue and directing implications. Recommend a type from the
user's stated intent but wait for their choice; an explicit earlier choice already
answers this question. Offer custom/hybrid through the interface's free-text option.
If the interface limits option count, first offer groups (acted stories,
factual/educational, conversation/observation, brand/music), then the concrete type
in that group. Keep review/comparison in factual/educational. Never silently drop types.

Save `{id, detail?}` as `videoType` alongside `models`. Custom types require `detail`.
This is a persistent user preference, not an inferred genre from a filename or
permission to generate media. Keep it separate from visual style, aspect ratio,
generation ratio and platform upload category.

Call `capability_status` and inspect the host's exposed tool schemas. Use those
schemas for supported model IDs and arguments; the config helper validates storage,
not live availability. Show installed/configured options, capability limits and
known pricing, labelled with its date. Do not invent credentials, exact latency or
prices. A configured credential does not guarantee a successful generation.

1. **Video model** (first-setup menu; a saved choice is never re-offered). Offer host video when exposed, Seedance/Veo API models and
   ASTRA or MLX when available. Include resolution and reference/audio support.
   Use the installed video-model selection reference and cost tables. Explain the
   change each option makes. The host is the recommended initial choice when it
   supports the requested job; the user can explicitly choose an API instead.
2. **Speech model.** Offer available Gemini models or ElevenLabs `eleven_v4` only
   ([v4 API contract](elevenlabs-v4.md)); v4 Turbo uses a separate realtime WebSocket
   and is not supported by the file-generation tools. Local TTS
   engines are removed; do not offer Supertonic or MLX speech. Keep model selection separate from each
   character's voice ID, language, speed and style. Show existing pinned voices
   that conflict with the proposed engine/model during setup; let the user retain
   an explicit character exception or request migration. Do not silently change
   the voice or invent a voice ID on another provider. The model registry
   (`tts-models.js`) marks only the 3.8 family (`tts_gemini_38`) as taking a voice
   designed with `tts_voice_design`; when the saved speech model is another family,
   using such a voice needs an explicit model exception recorded in
   `PRODUCTION.modelSettings.overrides`.
3. **Image model.** Offer the host image tool first when available, then supported
   GPT Image, Z-Image and MLX options. Explain reference editing, readable text,
   cost and quality controls. Store an explicit API choice even when a host tool
   is present. No later cover/points heuristic can substitute another model.

Ask in that order, or use a multi-question interface preserving the order. Reuse
answers already explicit in the user's request; ask only for missing categories.
Do not bill for samples during setup unless requested. Do not treat silence as a
selection. This first setup is a user-requested preference step and is not waived
by the general automation advice to choose unspecified creative preferences.

Save the type and all three model selections together. Example only — these are **not defaults**:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/model-settings.js" init "$WORKSPACE" <<'JSON'
{
  "videoType": {"id":"drama"},
  "models": {
    "video": {"engine":"seedance","model":"seedance-1-5-pro-251215","resolution":"720p"},
    "speech": {"engine":"gemini","model":"gemini-2.5-flash-preview-tts"},
    "image": {"engine":"host","model":"host-managed","host":"codex"}
  },
  "request": "Record the actual user's selections here, not this example."
}
JSON
```

The file is `.social-flow/models.json`, schema version 1. Store no credentials.
`engine` is required in each category; `model` is required for selectable engines.
ASTRA and Z-Image use fixed server models, so omit `model` for them.
For a host with no model selector use `host-managed`, a label rather than a claimed
vendor model/version. Also record `host` (for example `codex` or `grok`); verify
that the same CLI and tool are available on resume. A different CLI requires an
explicit model exception, even when its tool has the same name. Fixed-model and
host-managed tools cannot pin an internal vendor version they do not expose.
Video may include `resolution`; image may include `quality`. Use only values the
chosen tool supports. Host `quality` is a prompt preference if no parameter exists.

## Apply to authoring and generation

Before the first board is authored, create the episode with `project_manage episode` (or
`project-settings.js episode`): it creates the directory, the snapshot and the
`FORMAT`/`PRODUCTION` handoff, including `PRODUCTION.videoModel` from the saved video
selection. The low-level snapshot below is the legacy path for model-only workspaces:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/model-settings.js" snapshot "$WORKSPACE" "$EPISODE"
```

Either path writes `$EPISODE/.work/model-settings.json` once. On resume it returns the
existing snapshot even if workspace preferences changed; it never rewrites the
board or approved assets. Copy `{source, revision, models: config.models}` from
the result into `PRODUCTION.modelSettings` in `scenes.js`, and copy `config.videoType`
into `PRODUCTION.videoType`. Apply [video types](video-types.md) when planning
dialogue and performance; the type never rewrites lines or assigns delivery by
itself. The review displays the episode's selected type. Preserve these records
through storyboard → produce → edit-speech. Apply choices before cost quotes:

| Selection | Production handoff |
|---|---|
| Image | `PRODUCTION.imageProvider` is `host` for host, otherwise `api` (including local tools). `modelSettings.models.image` supplies the exact engine/model/quality for every new still and edit. |
| Video | `PRODUCTION.videoProvider` is `host`, `astra`, or `api` for other engines. `PRODUCTION.videoModel` uses `model:'host'` / `model:'astra'` for those adapters, otherwise the selected model, plus resolution where supported. Record `selection:{kind:'standing',reference:<snapshot or source file>}` (an optional `note:'Directory model selection'`); `project_manage episode` fills `PRODUCTION.videoModel` with `kind` and `reference`. Populate each cut's existing engine/model/resolution fields from the selection using that adapter's contract. |
| Speech | Use `modelSettings.models.speech` when authoring new speaker `tts` records and resolve a compatible voice. Copy the selected model explicitly into `SB_DOC.characters[].tts` when selectable. Generate from those records with raw speech tools. |

Do not send this config object as a tool payload. Translate it into the selected
tool's actual arguments; fixed-model tools get no invented `model` argument.
ASTRA cuts use `engine:'astra'` with no Seedance model fields. Preserve actual
adapter limits and supported render routes. If a selected engine cannot serve a
required edit, reference or speech route, explain that limitation and request an
explicit exception before switching. Do not downgrade, escalate or fall back on
your own, including after API failure, a missing key or a change of host CLI.

Directory choices govern **new episodes and channel assets** (logos, intros, growth
images). Existing approved boards and pinned
character exceptions retain their explicit choices. When a legacy board has no
snapshot, read its actual settings first; do not relabel conflicting choices as
inherited or rewrite them. Set up workspace preferences for subsequent episodes
and preserve the legacy board's model/voice settings for this resume. New casts
that conflict with directory speech preferences need an explicit character
exception or user-requested migration; do not let a profile default silently win.

A model choice is not a spending cap or permission to publish. Compute each
episode's quote with the saved models and respect its existing authorization.
Do not ask for the same model choice when asking about scope or budget.

## Explicit changes and unattended runs

“Use another model for this episode/shot” changes only that episode/shot, with the
user's request recorded in `PRODUCTION.modelSettings.overrides`. Keep the original
snapshot as provenance; apply the explicit override to production routing and
recalculate affected costs. A correction/resume follows that override too.

“Change the default model” updates just the requested category. An unqualified
model-change request applies to the current episode; do not silently make it a
standing preference. Read the current revision and supply it with a partial update:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/model-settings.js" update "$WORKSPACE" "$REVISION" <<'JSON'
{"models":{"image":{"engine":"gpt-image","model":"gpt-image-2","quality":"low"}},"request":"Actual explicit request to change the workspace image default"}
JSON
```

An update replaces the whole selected category, preventing an old engine's
settings from leaking into its replacement, and preserves the other two. `init`
refuses to overwrite existing settings; `update` rejects a stale revision. A lock
conflict reports an error; do not delete another session's lock automatically.

To change only the default type, use `update` with the current revision and
`{"videoType":{"id":"explainer"},"request":"Actual user request"}`. Keep all
model selections. Existing episode snapshots keep their type. A type change for
one episode sets `PRODUCTION.videoType` and records the request under
`PRODUCTION.modelSettings.overrides`; it does not update the directory default.

Interactive autoproduce runs the same setup once. An unattended growth invocation
with no complete config reports `project_setup_required` with the missing fields and
defers authoring until the user completes setup. If only the type is missing, report
`video_type_required` and ask only that choice on interactive return.
With a complete config it reuses it without questions;
legacy growth-plan model defaults do not override it. Existing explicit per-run
exceptions still apply. Continue to honor standing budgets and other applicable
render settings; the saved video selection satisfies the model-choice step.

Episode video execution uses the [shared routing contract](video-routing.md).
Read `video_catalog` (or `node skills/_shared/model-settings.js catalog`) for installed
adapters, then use `video_plan` and `video_execute`. Legacy video calls must carry
`videoContext` when targeting configured production.
