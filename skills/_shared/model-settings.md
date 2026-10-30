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
**video type → video model and credentials → image model and credentials →
TTS needed? → speech model and credentials if yes → music when wanted** once and save them in that directory. Every new
episode uses those choices until the user explicitly requests a change. This takes
precedence over automatic host detection, economy/quality routing, per-cut model
escalation and repeated model questions in older skill sections. It is an explicit
user-choice exception to host-first routing, not permission for a silent fallback.

## Text-bearing image exception

Owner directive, 2026-10-18: any new generated or edited image that must display or
preserve readable text uses **GPT Image 2 (`gpt-image-2`)**, regardless of the saved
image default or host-first recommendation. Apply the scoped selection described
in [image routing](image-routing.md#images-containing-text-gpt-image-2-required)
before planning and quoting. This includes text on reference products. Do not
rewrite unrelated defaults or regenerate existing assets. Report unavailability
without substituting another model; an unspecified host model is not GPT Image 2.

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
question. `setup_required`: select the type, video/image models and explicit TTS choice below before authoring a
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
| `configured` | `model-settings.js show` | Type, video/image models and speech model or explicit none saved (model-only view). |
| `migration_required` | both | Retired speech model; update speech explicitly before new generation. |
| `project_setup_required` | `project_manage status` / `episode` | Project, style, production, SNS or channel layout missing; `missing[]` names them. An unattended caller reports it and defers authoring. |
| `ready` | `project_manage status` | Complete settings; authoring starts without a preference question. |

`project_manage episode` returns `created`, `resumed` or `legacy_episode`.

## First setup: video type, then media models

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
   **LTX means MSR (2026-10-30).** When the user chooses LTX, save
   `{engine:"astra-genai", model:"ltx-2.5-22b-distilled", operation:"reference",
   resolution:"1792x1024"}` for 16:9 (`1024x1792` for 9:16). Episode cuts then plan
   MSR with each speaker's voice sample and the dialogue in the prompt
   ([GenAI MSR](astra-genai.md#msr-and-v2-video)); each speaking character needs a
   pinned voice sample before cut video generation.
2. **Image model.** Recommend **ASTRA GenAI** first for images without readable
   text: save `engine:"astra-genai", model:"z-image-turbo"` after the user's choice.
   This is the GenAI gateway, not local mflux (`engine:"zimage"`). Check
   `ASTRA_GENAI_API_KEY` and follow [GenAI setup](astra-genai.md); missing credentials
   lead to that setup, never a silent local substitution. Gateway pricing must be
   verified, not described as free. Offer host/GPT Image or local MLX/mflux only as
   explicit alternatives; do not ask a separate local Z-Image setup question by default.
   Explain reference editing, readable text, cost and quality controls. Images that
   display or preserve readable text require `gpt-image-2` under the scoped exception
   above. Reuse saved choices; this recommendation does not migrate existing projects.

3. **TTS needed?** Ask whether this project needs separately generated speech.
   If not, save `models.speech:{engine:"none"}` and skip speech model, voice and
   credential questions. This covers silence, supplied recordings and native video
   audio without a separate TTS call. Do not infer this choice from the genre.
   If yes, select a **speech model**, then complete its credential check below. Offer available Gemini models or ElevenLabs `eleven_v4` only
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

4. **Music model.** Read `music_catalog` (also in `project_manage options`). Save
   `models.music` as `{engine, model}`: `lyria`, `elevenlabs`, `suno-api` or `mlx`.
   Offer this choice when new music is wanted. Existing settings without music stay
   valid; new music generation reports `music_setup_required` until a choice exists.
   Reusing a channel bed requires no music model choice. A configured model is not
   spending authorization. See [music routing](music-routing.md).

Complete each model selection and its credential step below before asking for the next category.
Do not batch video, image and speech choices ahead of credential setup. Reuse
answers already explicit in the user's request; ask only for missing categories.
Do not bill for samples during setup unless requested. Do not treat silence as a
selection. This first setup is a user-requested preference step and is not waived
by the general automation advice to choose unspecified creative preferences.

Save the type and selected media models together. Example only — these are **not defaults**:

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
Legacy `astra` and local `zimage` use fixed server models, so omit `model` for them.
The separate `astra-genai` engine requires `model` for both video and image.
See [GenAI adapters](astra-genai.md) for credentials, explicit budget reservations and recovery.
For a host with no model selector use `host-managed`, a label rather than a claimed
vendor model/version. Also record `host` (for example `codex` or `grok`); verify
that the same CLI and tool are available on resume. A different CLI requires an
explicit model exception, even when its tool has the same name. Fixed-model and
host-managed tools cannot pin an internal vendor version they do not expose.
Video may include `resolution`; image may include `quality`. Use only values the
chosen tool supports. Host `quality` is a prompt preference if no parameter exists.

## Credential step after each selection

After video selection, after image selection, and after speech selection only when
TTS is enabled, check the selected provider with `capability_status`. Reuse existing
credentials; a shared key configured for video must not be requested again for TTS.
For a host tool, confirm that the tool is exposed and authenticated through the host;
for local engines, check the installation. Neither requires an invented API token.

If the selected API provider is unconfigured, name its required variable and guide
the user to configure it before the next model question. Use the provider's adapter
reference and `capability_status.needs`: Seedance uses `ARK_API_KEY`, Veo/Omni and
Gemini TTS use `GEMINI_API_KEY`, GPT Image uses `OPENAI_API_KEY`, ElevenLabs uses
`ELEVENLABS_API_KEY`, ASTRA video uses `ASTRA_VIDEO`, and ASTRA GenAI uses
`ASTRA_GENAI_API_KEY`. Do not interchange ASTRA credentials.

Credentials belong in the server environment or `<SNS_TOKEN_DIR>/.env` (default
`~/.config/social-flow/.env`), outside the project. Have the user enter secrets
locally, never in chat, model settings, command arguments or logs. Preserve existing
entries; protect the directory/file with modes 700/600. These media keys are shared
provider credentials, separate from per-channel SNS OAuth files. The running server
loads configuration at startup: after a change, reconnect/restart that MCP server
and re-run `capability_status` before advancing. Report presence as configured,
not as proof that the key is valid; do not generate a paid sample to test it.

If setup cannot finish, report the selected provider and missing variable or host/local
requirement, keep explicit answers in the session and resume at this step. Do not
silently switch providers or mark setup complete. A user who explicitly defers setup
may keep a local text-only draft with unresolved production requirements. Unattended
runs report the missing requirement and defer generation instead of prompting.
Apply the same credential step to an optional music selection.

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
| Speech | With `engine:"none"`, do not create TTS records, audition voices or call TTS tools. Use supplied/native audio or silence as planned. If separate synthesis becomes necessary, request an explicit speech choice and credentials before generation; never auto-enable TTS. Otherwise use `modelSettings.models.speech` when authoring new speaker `tts` records and resolve a compatible voice. Copy the selected model explicitly into `SB_DOC.characters[].tts` when selectable. Generate from those records with raw speech tools. |

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

Image execution uses [image routing](image-routing.md): `image_catalog` → `image_plan` → `image_execute`. `node skills/_shared/model-settings.js image-catalog` reads the same committed catalog. Legacy image tools use `imageContext` in configured directories.
