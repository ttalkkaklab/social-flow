# ElevenLabs v4 speech

Checked against the official documentation and public OpenAPI on 2026-10-17.
This is the production contract for `tts_elevenlabs_generate` and
`tts_elevenlabs_dialogue`. Keep the saved model/voice and episode authorization.

## Select the request

- Use `model:"eleven_v4"`. Both tools call `/v1/text-to-dialogue`; a single voice
  becomes one `inputs` entry. `timestamps:true` selects `/with-timestamps`.
  The API's generic default still says v3, so always send the explicit model.
- `eleven_v4_turbo` is a separate realtime WebSocket model, not a substitute for
  these file-producing tools. Old models remain unsupported for new synthesis.
- Prefer at most 2,000 characters across all turns. The v4 model ceiling is
  10,000, but the Dialogue reference warns that larger requests can fail or end
  early. The tools warn above 2,000 without silently splitting, billing extra
  requests or rewriting the approved script. Plan coherent chunks before calling.
- REST permits up to 10 distinct voice IDs. The plugin additionally limits one
  call to 50 turns. These are different from the number of characters in a story.
- Use `languageCode:"ko"` for Korean. Two-letter codes and the documented
  exceptions `ast`, `yue`, `ceb`, `fil` are accepted. Omit for auto detection.

## Direct the take

`stability` and `similarity` map to `settings.stability` and `settings.similarity`,
both 0–1. Omitted values use provider defaults (0.5 and 0.75). The legacy name
`similarityBoost` is an alias; conflicting values are rejected. `speed:1` is
accepted only for old profile compatibility and is not sent. No numerical
speed/style slider, speaker boost or SSML is supported.

Put concise audible direction in square brackets in the actual text, e.g.
`[quietly] 괜찮아. [sigh] 다시 해 보자.` Tags are free-form instructions, not enums
or guaranteed effects. Keep visible action and long scene descriptions in the
storyboard. Follow [acting prompts](../produce/references/acting-prompts.md).

For targeted pronunciation, v4 also accepts slash-delimited IPA such as
`/həˈloʊ/` directly in text. Preserve display spelling in subtitles and the exact
spoken request in the generation receipt; do not use XML phoneme tags. Alias
dictionaries from `tts_elevenlabs_dictionary` remain available: pass up to three
pinned `{pronunciationDictionaryId, versionId}` locators. Neither method proves
correct pronunciation without listening; ordinary production stays `not_reviewed`.

## Continue or repair a sequence

`previousText` and `nextText` provide up to 100 characters of context each; the
latter maps to `future_text`. They are not synthesized. For existing generated
neighbors, optional `previousRequestIds` and `nextRequestIds` accept up to three
actual provider IDs per side. Order previous IDs oldest to closest and next IDs
closest to latest. Never invent IDs or send local filenames instead. Support can
vary by model/provider; report rejection without changing the model or retrying
with different controls automatically. A fixed `seed` is best effort, not a
promise of identical bytes.

Leave `usePvcAsIvc` omitted unless the user chooses that clone mode. `true` asks
for an instant-clone version of a professional voice and can change the voice.
Do not enable it to recover from a failed call. v4 supports professional clones;
availability/training is account-specific. Cross-language accent behavior also
differs from older models, so reuse existing takes rather than silently migrating.

`enableLogging:false` requests Enterprise zero retention. It disables provider
history and request stitching, so the tools reject combining it with request IDs.
It does not disable local audio, alignment sidecars or episode receipts. Omitted
logging uses the provider default. Keep the user's privacy choice across retakes.

## Save and assemble

Use `wav_24000` with `timestamps:true` for the video pipeline. Preserve both raw
alignments and `voice_segments`; never assume normalized text indexes the original
script. The sidecar includes the exact provider body, output/logging options and
available request ID, usage and latency. Keep that ID for later continuity calls.
The tool also returns the metered `character-cost`; record that quantity divided
by 1,000 in the ledger and use the current account rate, not a historical fixed price.
Free-tier output is non-commercial; paid-plan rights follow the current license.

Mixed-voice audio requires a dialogue-aware assembly route. The standard shot
workflow generates and attaches each stable speaker line separately. No new
automatic listening, scoring or paid retry step is introduced.

The provider also offers streaming/WebSockets and `audio_effects`. These tools
produce complete files and do not expose those features; do not invent arguments
for them. Keep scene SFX in the existing reusable sound catalog.

Sources: [v4 controls and voices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4),
[models and language codes](https://elevenlabs.io/docs/overview/models),
[Dialogue request/response](https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert-with-timestamps),
[prompting and IPA](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices),
[public OpenAPI](https://api.elevenlabs.io/openapi.json).
