# Music APIs: verified contracts, 2026-10-18

This research distinguishes Korean text input from documented Korean singing and
from measured pronunciation quality. No paid generation or listening test was run.
Public provider schemas can change; the implementation supports the subset below.

| Family | API / implementation | Korean and source availability |
|---|---|---|
| Google Lyria | Official Gemini Interactions: Clip and 3.5; existing RealTime WebSocket adapter | Google lists Korean for Lyria 3. Closed weights. RealTime is an instrumental/control route, not a Korean lyrics API. |
| Suno | Official Platform exists, but authenticated schema was not verified. Existing sunoapi.org adapter is third party; updated to V6 family. | Unicode lyrics accepted by the third-party contract. No official-platform Korean schema or pronunciation guarantee verified here. Closed weights. |
| Eleven Music | Official `/v1/music`, `music_v2` / `music_v2_5` prompt and generation-plan chunks | Multilingual product; this investigation did not verify an explicit Korean music-language list. Korean text passes the adapter. TTS language lists are not music evidence. Closed weights. |
| Local music | Existing MLX Core music adapter retained with exact installed model ID | Pack-specific language, weights and licensing; MLX runtime availability is not proof a model is open source or supports Korean singing. |

Google's [Lyria announcement](https://blog.google/intl/en-ie/products/lyria-3/)
provides the Korean language evidence. Each provider needs an actual Korean vocal
sample to assess pronunciation for the user's content; this is not an execution gate.

## Google contracts

[Gemini music guide](https://ai.google.dev/gemini-api/docs/music-generation):
`POST /v1beta/interactions`, API-key authentication, `{model,input}`. Clip ID
`lyria-3-clip-preview` produces 30 seconds; `lyria-3.5` follows prompted duration.
Audio is base64 in `steps[type=model_output].content[type=audio].data`; accompanying
text can contain lyrics. Song adapter requests the default MP3 and preserves text
and interaction ID. `lyrics` and `instrumental` are plugin prompt conveniences,
not invented Google JSON fields. No native song BPM/seed/duration guarantee.

[RealTime guide](https://ai.google.dev/gemini-api/docs/realtime-music-generation)
and [SDK config](https://googleapis.github.io/js-genai/release_docs/interfaces/types.LiveMusicGenerationConfig.html):
`models/lyria-realtime-exp`, weighted text prompts, BPM 60–200, guidance 0–6,
density/brightness 0–1, temperature 0–3, topK 1–1000, seed 0–2147483647,
scale/mute/mode controls. The 5–300 second bound is the plugin's stream collection
limit. Seed is a control, not proof of byte-identical reproduction. The guide's
sample and output specifications differ on sample-rate/API-version details; the
existing PCM 48 kHz transport is retained, not silently rewritten from one sample.

[Vertex Lyria API](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/lyria-music-generation)
is a separate Cloud OAuth `predict` contract for `lyria-002`, with prompt,
negative_prompt, seed and sample_count constraints; output uses
`predictions[].audioContent`. It is catalogued as unimplemented, not routed through
a Gemini key.

## ElevenLabs contracts

[Compose reference](https://elevenlabs.io/docs/api-reference/music/compose):
`POST /v1/music`, `xi-api-key`, binary output and optional `song-id` response header.
MCP arguments use camelCase (`modelId`, `musicLengthMs`, `compositionPlan`,
`forceInstrumental`); the adapter maps them to the documented snake_case HTTP body.
Explicit v2/v2.5 selection avoids the API's v1 default. Prompt mode accepts length
3–600 seconds and native `force_instrumental`. Seed is plan-only. Plugin output
format is `mp3_48000_192`, followed by local WAV normalization.

[Official SDK skill reference](https://github.com/elevenlabs/skills/blob/main/music/references/api_reference.md)
provides the v2 generation-chunk contract: `composition_plan.chunks[]` with text,
duration, positive/negative styles and context adherence. The adapter checks
chunk count, total/per-chunk duration, text and line bounds. Styles use English;
lyrics can be Unicode. Prompt and plan are mutually exclusive. Audio-reference
chunks, inpainting, finetunes, v1 plans and automatic composition-plan generation
are outside this adapter's scope; unsupported fields fail instead of disappearing.

## Suno: official service versus third party

[Official Suno Platform](https://platform.suno.com/) advertises a REST API. The
login boundary prevented verification of its actual request/response schemas.
The earlier assertion that Suno has no official API is therefore withdrawn.
No official-platform adapter or endpoint is guessed.

[sunoapi.org generation documentation](https://docs.sunoapi.org/suno-api/generate-music)
is authoritative only for that third-party service. `POST /api/v1/generate` uses a
Bearer key and returns a task ID; the existing adapter polls and downloads two
tracks. Current models are V6/V6_MINI/V6_WILD; older V4/V5 entries are discontinued.
Custom mode needs style, lyrics or negativeTags. Non-custom mode needs style or
lyrics; prompt alone is insufficient. Lyrics take precedence over prompt. Custom
duration is 10–360 seconds. The wrapper exposes a subset, not reference uploads or
all tuning knobs. Retired V5 sound generation is rejected instead of substituted.

## Implementation boundaries

The [routing contract](../../../skills/_shared/music-routing.md) defines selection,
state, authorization and recovery. API request schemas and synthetic output decode
are tested locally. Real credentials, account access, provider latency, Korean
pronunciation and live billing were not tested. No provider price is asserted as a
hard invoice cap. There is no automatic switch to a cheaper model or another vendor.
