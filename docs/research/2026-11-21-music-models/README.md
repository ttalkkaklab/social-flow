# Music models and API schemas, reread 2026-11-21

A reread of the four provider contracts behind `music_catalog`, one month after
[the first pass](../2026-10-18-music-models/README.md). The model list did not move:
`lyria-3.5`, `lyria-3-clip-preview`, `models/lyria-realtime-exp`, Suno `V6` / `V6_MINI` /
`V6_WILD` and Eleven `music_v2` / `music_v2_5` are still each provider's current IDs.
What changed is smaller, and it is listed with what was done about it.

No music was generated and nothing was billed. Pages were read through a fetch tool that
limits quotation, so field descriptions below are paraphrased; names, enums and bounds are
the pages' own.

## Google Lyria

The Gemini API docs now redirect from `ai.google.dev/gemini-api/docs/…` to
`aistudio.google.com/docs/…`; the catalog's source links follow.

| Model | Listed as | Released | Price (paid tier) |
|---|---|---|---|
| `lyria-3.5` | flagship, full songs | 2026-09-03 | "$0.08 per song" |
| `lyria-3-clip-preview` | preview, 30 s clips | 2026-03-25 | "$0.04 per song" |
| `lyria-3-pro-preview` | previous generation, replaced by `lyria-3.5` | 2026-03-25 | "$0.08 per song" |
| `lyria-realtime-exp` | experimental | 2025-05-20 | no row on the pricing page |

No Lyria model has a shutdown date. Songs still go through
`POST /v1beta/interactions` with `{model, input}`; instrumental, lyrics, section tags
and duration are all prompt text, and audio comes back base64 in the `model_output`
step.

- **Done:** `music.lyria-3.5` in `prices.tsv` is `0.08 official`.
- **Left out — WAV.** The guide says Lyria 3.5 can return WAV through `response_format`,
  but its JavaScript and REST examples send `{"type":"audio"}`, the same as the MP3
  default, and only a CLI example carries `audio/wav`. With two shapes on one page the
  adapter keeps requesting MP3.
- **Left out — image input** (up to ten images in `input`) and `lyria-3-pro-preview`,
  which the docs replace with `lyria-3.5`.
- **RealTime `apiVersion`.** The guide connects under `v1beta`. In 2026-08 that
  `connect()` never returned here. On 2026-11-21 a connect-and-close under `v1beta` and
  under `v1alpha` both answered `setupComplete`; no `play()` was sent, so no audio was
  made. The adapter stays on `v1alpha`, the only version that has streamed audio in a
  measurement here. Config ranges on the page match the adapter.

## ElevenLabs

`POST /v1/music` takes `music_v1`, `music_v2` and `music_v2_5`. `music_v1` is the schema
default, is deprecated and is removed on 2027-01-31; the adapter never offered it and
always names the model. The v2 plan is `composition_plan.chunks[]`.

- **Done:** a chunk's `negative_styles` is optional on the page, so `negativeStyles` is
  optional in the adapter.
- **Left out:** `conditioning_ref` / `condition_strength` (audio reference needs the
  upload endpoint), `finetune_id`, `sign_with_c2pa`, the `output_format` choice (the
  adapter keeps `mp3_48000_192`, which is also what `auto` resolves to for v2), and the
  other endpoints (detailed, stream, video-to-music, stem separation, upload, finetunes).
- **Not settled by the pages:** the compose page states no `prompt` length (the adapter
  keeps 4,100) and names no response header for the song ID; `song-id` is written out
  only for video-to-music. The API bound is 600,000 ms while the capability FAQ says
  five minutes. No per-song price was found.

## sunoapi.org (third party)

`POST /api/v1/generate` lists `V6` (default), `V6_WILD`, `V6_MINI` as current and the
V4 and V5 families as kept for backward compatibility only.

- **Done:** `style` is bounded at 1,000 characters; the custom-mode numbers
  `styleWeight`, `weirdnessConstraint`, `audioWeight` (0–1) and `variety` (0–4) are
  accepted and refused outside custom mode. The 405 message no longer quotes a request
  rate the pages do not give.
- **Left out:** the non-custom media inputs `imageUrls`, `videoUrls`, `audioUrls`,
  `midiUrls`.
- **Sounds.** `POST /api/v1/generate/sounds` now takes the V6 family, so the old reason
  for refusing the tool (V5 only) is gone. A different one replaces it: the pages name no
  way to fetch a finished sounds task. `record-info` describes its `taskId` as coming
  from Generate or Extend Music, its `operationType` enum has no sounds value, and the
  Sounds page shows no callback payload. A create call is billed, so `suno_generate_sound`
  stays refused, on the direct call and in `music_plan` alike, under the code
  `music_adapter_unverified`. The adapter underneath now sends the selected V6 model and
  returns its task ID on failure. One real sounds task fetched with a key would settle it;
  no `SUNO_API_KEY` was available for this pass.
- **Not settled by the pages:** `callBackUrl` is in the schema's required list and
  absent from the prose's "always required" list, so the adapter keeps sending one. The
  OpenAPI block names another host than the homepage's `https://api.sunoapi.org`; the
  default host is unchanged. No credit cost per call is published.

## Suno Platform (official)

`platform.suno.com` still describes a REST API and still shows only a sign-in page for
its docs. It stays in the catalog as `unimplemented`.

## Not reread

The local MLX music lane takes an installed pack ID and was not part of this pass.
