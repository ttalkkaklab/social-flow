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

At first setup, collect the choices in this order (owner directive, 2026-11-21).
**Video type → video model and credentials → BGM model and credentials, or no new music
→ image model and credentials → optional TTS model and credentials.** Save the choices once in that directory. Every new
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
different project as an implicit settings source. If the request, prior user selection or
identified episode does not establish one directory, ask for it and wait. Use
`project_manage select` to record an unbound directory before choosing models. Check
`project_manage status` in the selected directory before starting or resuming episode work.

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/model-settings.js" show "$WORKSPACE"
```

`configured` reports the low-level model choices. Only `project_manage status` returning
`ready` confirms the selected directory, all four model categories and project setup. `setup_required`: collect the type, video, BGM, image and TTS choices below before authoring a
new generated episode or making a media call. `video_type_required`: older settings
already contain models; collect the type and any missing project fields before episode work and save
it with `update`. After workspace setup, resume an existing episode from its snapshot/board. A malformed file is an error to
repair, not permission to overwrite it with defaults. Do not copy choices from a
previous episode or channel profile into directory settings without the user's
selection. Existing choices may be offered as candidates.

| Status | Returned by | Meaning |
|---|---|---|
| `setup_required` | `model-settings.js show` | No file or incomplete model choices; collect the missing fields reported by `project_manage status`. |
| `video_type_required` | `model-settings.js show` | Legacy model choices saved, type missing; also check project status. |
| `configured` | `model-settings.js show` | Type, video/image models and speech model or explicit none saved (model-only view). |
| `migration_required` | both | Retired speech or video model; `retired[]` names `models.speech` / `models.video`. Update that choice explicitly before new generation. |
| `video_engine_unsupported` | `video_plan` | A selection or override names Gemini Developer API Veo previews, Gemini Omni or Seedance 1.x; choose a supported video model again (saving one is refused). Existing clips stay reusable. |
| `voice_lane_required` | `video_plan` | A spoken cut (`on_screen` line, or native audio on `visual.clip` / b-roll) on an adapter with voice lane `none`; use a `reference` or `supplied` lane, or keep narration as TTS with `generateAudio:false`. |
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

1. **Video model** (first-setup menu; a saved choice is never re-offered). Offer host video when exposed, Seedance 2.x API models and
   Google Cloud Veo 3.1, ASTRA or MLX when available. For Veo save e.g.
   `{"engine":"veo","model":"veo-3.1-fast-generate-001","resolution":"720p"}`. Omit the operation to select text, frames or subject references from each storyboard. Save an operation when the user selects one explicitly.
   For Seedance save e.g. `{"engine":"seedance","model":"dreamina-seedance-2-5-flash-261115","resolution":"720p"}`. An omitted operation follows the shot's text, frames, references or spoken dialogue. Standard 2.5 supports 4K; Flash supports 480p and 720p. Set `ARK_API_KEY` for the MCP server.
   Use the model-specific reference and resolution limits from `video_catalog`. Gemini Developer API Veo previews, Gemini Omni and Seedance 1.x left the plugin on
   2026-10-31 because none takes a voice reference. Include resolution and reference/audio support.
   Use the installed video-model selection reference and cost tables. Explain the
   change each option makes. The host is the recommended initial choice when it
   supports the requested job; the user can explicitly choose an API instead.
   **Local LTX Desktop.** For “이 컴퓨터의 LTX” or “local LTX Desktop”, use `video_catalog {engine:"ltx-desktop-local"}`.
   The app must be running on the MCP host. Provide its current native backend bearer in `LTX_DESKTOP_API_KEY` to the MCP process.
   Its default address is `http://127.0.0.1:41954`. Set `LTX_DESKTOP_BASE_URL` for another loopback port.
   Select a downloaded model from the response when `unavailableReason` is null. For example, save
   `{"engine":"ltx-desktop-local","model":"ltx-2.5-fast","resolution":"270p"}` as the video selection.
   The storyboard selects text, start/end images, or a supplied audio track with an optional start image.
   After Desktop restarts, refresh an expired backend credential and reconnect the MCP server. Keep secrets out of project settings.
   **LTX means MSR (2026-10-30).** When the user chooses LTX, save
   `{engine:"astra-genai", model:"ltx-2.5-22b-distilled", operation:"reference",
   resolution:"1024x576"}` for 16:9 (`576x1024` for 9:16); MiniMax H3 on the same gateway is
   `{engine:"astra-genai", model:"minimax-h3", resolution:"576x1024"}`. GenAI canvas (user directive, 2026-11-27): save `576x1024` for 9:16 and `1024x576` for 16:9.
   The larger `736x1280` / `1280x736` is an explicit choice for an episode or shot the user wants
   sharper, recorded in `PRODUCTION.modelSettings.overrides`; a failed take never switches it.
   H3 takes both sizes (sides in multiples of 32). LTX generates on a 64-pixel grid, so 736 is
   not a native LTX side, and no LTX render at either size has been checked yet. At 736x1280 an
   H3 scene of 345 frames ran about 66 s per sampling step on production (2026-11-27): keep
   `numInferenceSteps` at about 18 or fewer to stay inside the backend's 1,800 s limit, since an
   omitted value means the model default of 50.
   Episode cuts then plan
   MSR with the dialogue in the prompt and each speaker's pinned voice sample when one
   exists ([GenAI MSR](astra-genai.md#msr-and-v2-video)); a speaker without a sample is
   voiced from the prompt.
   **Hosted vendor APIs (2026-11-18).** Three more choices go through the common vendor
   layer: MiniMax H3 `{engine:"minimax", model:"MiniMax-H3", resolution:"768P",
   operation:"reference"}` (`MINIMAX_API_KEY`), HeyGen Video 1 `{engine:"heygen",
   model:"heygen-video-1", resolution:"768p", operation:"reference"}` (`HEYGEN_API_KEY`)
   and the official LTX API `{engine:"ltx-api", model:"ltx-2-5-pro", resolution:"1920x1080",
   operation:"audio"}` (`LTX_API_KEY`; `1080x1920` for 9:16). MiniMax and HeyGen take a
   speaker's voice sample but cannot pin the start image as the first frame in the same
   call; LTX takes no voice sample, so its spoken cuts use the pinned TTS track. Prices and
   field contracts: [API schemas](https://github.com/ttalkkaklab/social-flow/blob/1eabc4fb598b99135fe39a1a2be1f7dbe07fd5a9/docs/research/2026-11-18-video-model-api-schemas/README.md).
2. **BGM and audience-only tonal cues.** After the video model and its credential
   check, ask which model should make new background music, drones, risers and stingers.
   Read `music_catalog` and offer exact supported model IDs with their duration controls,
   provider and credential status from `capability_status`. For MLX, offer an exact
   installed music pack. Save the user's choice as `models.music:{engine,model}`. Also
   offer “use existing music or leave scenes unscored” and save `models.music:{engine:"none"}`
   if selected. This choice needs no provider credential. A video clip's own voices,
   footsteps and other scene sounds stay with its soundtrack. Check the chosen music
   provider before asking about images. Complete a missing music choice in older workspaces
   before the next storyboard or video task. [Music routing](music-routing.md)

3. **Image model.** Recommend **ASTRA GenAI** first for images without readable
   text: save `engine:"astra-genai", model:"z-image-turbo"` after the user's choice.
   This is the GenAI gateway, not local mflux (`engine:"zimage"`). Check
   `ASTRA_GENAI_API_KEY` and follow [GenAI setup](astra-genai.md); missing credentials
   lead to that setup, never a silent local substitution. Gateway pricing must be
   verified, not described as free. Offer host/GPT Image or local MLX/mflux only as
   explicit alternatives; do not ask a separate local Z-Image setup question by default.
   Explain reference editing, readable text, cost and quality controls. Images that
   display or preserve readable text require `gpt-image-2` under the scoped exception
   above. Reuse saved choices; this recommendation does not migrate existing projects.

4. **TTS needed?** Ask whether this project needs separately generated speech.
   If not, save `models.speech:{engine:"none"}` and skip speech model, voice and
   credential questions. This covers silence, supplied recordings and native video
   audio without a separate TTS call. Do not infer this choice from the genre.
   If yes, select a **speech model**, then complete its credential check below. Offer available Gemini models, ElevenLabs `eleven_v4`, or configured ASTRA GenAI speech aliases
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

**Music direction.** `production.musicDirection` keeps what the user has said about music
on this channel: up to 20 dated one-sentence notes, e.g. `"2026-11-08 user: music under
every shot is too much; score the turns"`. Add a note with `project_manage update` (pass
the whole `production` block with the new list) in the turn the user gives the feedback.
`story_music` shows the list at every spotting, so the next episode starts from it.

**Cliché use.** `production.clicheUse` keeps the user's standing choice for researched
clichés in stories: `"on"` applies them on every type, `"off"` on none. Without it, drama,
comedy and romance episodes apply them and other types get a recommendation. Save it with
`project_manage update` (pass the whole `production` block) in the turn the user states the
choice; never ask for it at setup. A new episode's board carries it as
`PRODUCTION.clicheUse` ([cliché use](../storyboard/references/cliche-use.md)).

Complete each model selection and its credential step below before asking for the next category.
Ask the next model question after checking the previous choice. Reuse
answers already explicit in the user's request; ask only for missing categories.
Do not bill for samples during setup unless requested. Do not treat silence as a
selection. This first setup is a user-requested preference step and is not waived
by the general automation advice to choose unspecified creative preferences.

After selecting the directory, save the type and four media choices with the other
project preferences. Use `project_manage init` with the user's choices in `settings`,
or pass the [complete setup input](../project-init/references/settings.md) to the CLI:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/project-settings.js" init "$WORKSPACE" < setup-input.json
node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/project-settings.js" status "$WORKSPACE"
```

Continue when status returns `ready` for that directory.

The file is `.social-flow/models.json`, schema version 1. Store no credentials.
`engine` is required in each category; `model` is required for selectable engines.
Legacy `astra` and local `zimage` use fixed server models, so omit `model` for them.
The separate `astra-genai` engine requires `model`. New gateway image/video contracts use `astra-genai-native` and `astra-genai-desktop`; speech uses `astra-genai`. Discover aliases and supported options before choosing them.
See [GenAI adapters](astra-genai.md) for credentials, explicit budget reservations and recovery.
For a host with no model selector use `host-managed`, a label rather than a claimed
vendor model/version. Also record `host` (for example `codex` or `grok`); verify
that the same CLI and tool are available on resume. A different CLI requires an
explicit model exception, even when its tool has the same name. Fixed-model and
host-managed tools cannot pin an internal vendor version they do not expose.
Video may include `resolution`; image may include `quality`. Use only values the
chosen tool supports. Host `quality` is a prompt preference if no parameter exists.

## Credential step after each selection

Check each selected provider with `capability_status` after choosing video, BGM, image
and finally speech if separate TTS is enabled. Skip the credential step for an explicit `none`. Reuse existing
credentials; a shared key configured for video must not be requested again for TTS.
For a host tool, confirm that the tool is exposed and authenticated through the host;
for local engines, check the installation. Neither requires an invented API token.

If the selected API provider is unconfigured, name its required variable and guide
the user to configure it before the next model question. Use the provider's adapter
reference and `capability_status.needs`: Seedance uses `ARK_API_KEY`, Gemini TTS uses
`GEMINI_API_KEY`, GPT Image uses `OPENAI_API_KEY`, ElevenLabs uses
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
silently switch providers or mark setup complete. When setup is deferred, pause episode
work, including text-only drafts. Unattended runs report the missing requirements.

## Apply to authoring and generation

Before the first board is authored, create the episode with `project_manage episode` (or
`project-settings.js episode`): it creates the directory, the snapshot and the
`FORMAT`/`PRODUCTION` handoff, including `PRODUCTION.videoModel` from the saved video
selection. The low-level snapshot command remains available for inspecting legacy model records:

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
