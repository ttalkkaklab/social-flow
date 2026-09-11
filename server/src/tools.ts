import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MUSIC_GENERATION_MODES, MUSIC_SCALES } from './music-client.js';
import {
  DEFAULT_SUPERTONIC_LANGUAGE,
  DEFAULT_SUPERTONIC_SPEED,
  DEFAULT_SUPERTONIC_STEPS,
  DEFAULT_SUPERTONIC_VOICE,
  MAX_SUPERTONIC_INPUT_CHARS,
  MAX_SUPERTONIC_SPEED,
  SUPERTONIC_LANGUAGES,
  SUPERTONIC_VOICE_NAMES,
} from './supertonic-client.js';
import {
  DEFAULT_SEEDANCE_DURATION,
  DEFAULT_SEEDANCE_MODEL,
  DEFAULT_SEEDANCE_REFERENCE_MODEL,
  DEFAULT_SEEDANCE_RESOLUTION,
  SEEDANCE_FPS,
  SEEDANCE_REFERENCE_MODELS,
  VALID_SEEDANCE_MODELS,
  VALID_SEEDANCE_RATIOS,
  VALID_SEEDANCE_RESOLUTIONS,
} from './seedance-client.js';
import { DEFAULT_TTS_MODEL, DEFAULT_TTS_TEMPERATURE, DEFAULT_VOICE, TTS_VOICE_NAMES, VALID_TTS_MODELS } from './tts-client.js';
import { GENERATORS, REVIEW_MODEL } from './tts-quality.js';
import {
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
  ELEVENLABS_DIALOGUE_MAX_INPUTS,
  ELEVENLABS_DIALOGUE_MAX_VOICES,
  ELEVENLABS_DIALOGUE_MODEL,
  ELEVENLABS_MODELS,
  ELEVENLABS_MODEL_CHAR_CAPS,
  ELEVENLABS_OUTPUT_FORMATS,
  ELEVENLABS_TEXT_NORMALIZATION,
  ELEVENLABS_VOICE_CATEGORIES,
  MAX_ELEVENLABS_DIALOGUE_CHARS,
  MAX_ELEVENLABS_INPUT_CHARS,
} from './elevenlabs-client.js';
import {
  DEFAULT_ZIMAGE_QUANTIZE,
  DEFAULT_ZIMAGE_STEPS,
  MAX_ZIMAGE_DIMENSION,
  MIN_ZIMAGE_DIMENSION,
  ZIMAGE_DIMENSION_STEP,
  ZIMAGE_QUANTIZE_OPTIONS,
} from './zimage-client.js';
import {
  DEFAULT_QWEN3_ASR_LANGUAGE,
  DEFAULT_QWEN3_ASR_MODEL,
  QWEN3_ASR_LANGUAGES,
  QWEN3_ASR_MODELS,
} from './qwen3-asr-client.js';
import {
  BLENDER_INTERPOLATIONS,
  BLENDER_PREVIZ_ENGINES,
  BLENDER_PROXY_KINDS,
  BLENDER_RIG_BONES,
  BLENDER_ROOT_MOTIONS,
  DEFAULT_FRAME_END,
  DEFAULT_FRAME_START,
  DEFAULT_PREVIZ_ENGINE,
  DEFAULT_PREVIZ_FILENAME,
  DEFAULT_PREVIZ_HEIGHT,
  DEFAULT_PREVIZ_WIDTH,
  DEFAULT_SCENE_FPS,
  MAX_PREVIZ_FRAMES,
} from './blender-bridge.js';
import {
  DEFAULT_SUNO_MODEL,
  SUNO_MODELS,
  SUNO_PERSONA_MODELS,
  SUNO_SOUND_KEYS,
  SUNO_VOCAL_GENDERS,
} from './suno-client.js';
import {
  DEFAULT_MLX_IMAGE_SIZE,
  DEFAULT_MLX_MUSIC_SECONDS,
  DEFAULT_MLX_VIDEO_FRAMES,
  DEFAULT_MLX_VIDEO_HEIGHT,
  DEFAULT_MLX_VIDEO_WIDTH,
  MAX_MLX_IMAGE_DIMENSION,
  MAX_MLX_IMAGE_REFS,
  MAX_MLX_MUSIC_SECONDS,
  MAX_MLX_TTS_CHARS,
  MAX_MLX_VIDEO_DIMENSION,
  MAX_MLX_VIDEO_FRAMES,
  MAX_VIDEO_RGB_BYTES,
  MIN_MLX_IMAGE_DIMENSION,
  MIN_MLX_MUSIC_SECONDS,
  MIN_MLX_VIDEO_DIMENSION,
  MIN_MLX_VIDEO_FRAMES,
  MLX_IMAGE_DIMENSION_STEP,
  MLX_VIDEO_DIMENSION_STEP,
  MLX_VIDEO_FPS,
} from './mlx-serve-client.js';

/**
 * Tool surface definitions (61 tools) — 6 research + 5 open-data +
 * 27 generation (5 image + 8 video + 6 speech + 7 music + 1 mesh) +
 * 5 per-platform publishing + 3 inbound comments + 1 account check +
 * 5 growth lookups (Threads insights/keyword search · YouTube insights ·
 * Instagram insights · recent-content feedback — the insights trio is for the
 * grow-* skills only; content_feedback covers both video platforms and writes
 * an HTML report) + 1 capability_status + 1 STT + 1 music-options + 1 suno credits.
 * The six mlx_* tools wrap MLX Core / mlx-serve on loopback; they are not a
 * second MCP server. 52 of those list without SNS tokens.
 *
 * Publish tool descriptions embed the HITL contract — this server has no
 * review gate, so a call is an immediately public post, and the descriptions
 * say never to call without user approval.
 *
 * Generation tools are ported from fect-mcp-server — image (gpt_image_*,
 * OPENAI_API_KEY) comes from the gpt-image module; video (veo_*), speech
 * (tts_*), and music (music_*) come from the video/tts/music modules, all
 * three on GEMINI_API_KEY. Sung full songs and loopable beds are suno_*
 * (sunoapi.org third-party REST, SUNO_API_KEY). Lyria stays the default
 * 30s instrumental BGM path. Descriptions inherit the originals, minus
 * cross-references to tools this server doesn't have, plus the short-form
 * pipeline context (channel profile voice, pinned seeds). Keys are validated
 * at call time.
 *
 * Video alone has two engines — veo_* (Google Veo 3.1, GEMINI_API_KEY) and
 * seedance_* (ByteDance Seedance, ARK_API_KEY). They are not substitutes;
 * each is good at different jobs, and the source of truth for which to use
 * when is skills/produce/references/video-model-selection.md. Each tool
 * description carries its own summary of that decision table — a caller who
 * sees only the tool list, without reading the skill doc, still has to be
 * able to pick an engine.
 *
 * Voice, scale, and mode lists derive from the canonical constants in each
 * client module — copying a 30-entry list into the schema invites the
 * accident where adding a model updates only one side.
 *
 * Every tool carries a title (display name) and annotations (behavior hints).
 * destructiveHint in particular translates "a call is immediately public" —
 * the nature of this server — into a form **the client can read**: the
 * description prose reaches only the model, never the approval UI.
 * The verdict table in docs/api-reference/mcp-tools.html §7 is the source of truth.
 */

/**
 * Shared Veo property definitions (Veo 3.1 family).
 *
 * Why the default is fast rather than standard is written down in the
 * DEFAULT_VIDEO_MODEL comment in video-client.ts — the three tiers are
 * statistically tied on blind-arena Elo.
 */
const VEO_MODEL_PROPERTY = {
  type: 'string',
  description:
    'Veo model (default: "veo-3.1-fast-generate-preview"). Blind-arena Elo puts the three tiers within overlapping confidence intervals on every board — the tier buys features and resolution, not measurably better video — so pick the CHEAPEST tier that has the features you need. lite is 1/2 the cost of fast and 1/8 of standard but drops 4k, extension, and reference images; standard costs 4x fast for no measured preference gain.',
  enum: ['veo-3.1-generate-preview', 'veo-3.1-fast-generate-preview', 'veo-3.1-lite-generate-preview'],
  default: 'veo-3.1-fast-generate-preview',
} as const;

const VEO_RESOLUTION_PROPERTY = {
  type: 'string',
  description: 'Output resolution (default: "720p"). 1080p and 4k require durationSeconds=8; 4k is not supported by the lite model.',
  enum: ['720p', '1080p', '4k'],
  default: '720p',
} as const;

const VEO_DURATION_PROPERTY = {
  type: 'number',
  description: 'Clip length in seconds (default: 8). 1080p/4k output requires 8.',
  enum: [4, 6, 8],
  default: 8,
} as const;

/**
 * Exclusions — sent through this field, never in the prompt body.
 *
 * The official docs pin the grammar: comma-separated noun/adjective phrases,
 * not instructions. Writing "no ~" in the body tends to draw the very noun
 * (measured on local images: 4 out of 4 failed).
 */
const VEO_NEGATIVE_PROMPT_PROPERTY = {
  type: 'string',
  description:
    'What to keep OUT of the frame, as comma-separated noun or adjective phrases: "wall, frame, on-screen text, subtitles". Do NOT write instructions such as "no walls" or "don\'t show walls" — Google\'s prompt guide names that form as not recommended, and writing an exclusion into the prompt body tends to summon the very noun you named. Put every exclusion here instead of in prompt.',
} as const;

/**
 * Shared Gemini Omni property definitions (gemini-omni-1.1-flash).
 *
 * Omni is one model with a task mode, so there is no tier to choose — the levers are
 * resolution and length. 360p has no counterpart on Veo and exists for drafts.
 */
const OMNI_RESOLUTION_PROPERTY = {
  type: 'string',
  description:
    'Output resolution (default: "720p"). Resolution does not change the bill — every call costs the same flat amount — so 360p buys only speed; 1080p and 4k are upscales of the generated frames, not native renders.',
  enum: ['360p', '720p', '1080p', '4k'],
  default: '720p',
} as const;

const OMNI_DURATION_PROPERTY = {
  type: 'number',
  description: 'Clip length in whole seconds, 3 to 10 (default: 8). Unlike Veo there is no 4/6/8 grid — any integer in range is accepted, and 11 is rejected by the API.',
  minimum: 3,
  maximum: 10,
  default: 8,
} as const;

const OMNI_ASPECT_RATIO_PROPERTY = {
  type: 'string',
  description: 'Aspect ratio of the generated video (default: "16:9")',
  enum: ['16:9', '9:16'],
  default: '16:9',
} as const;

/**
 * Shared Seedance property definitions (BytePlus ModelArk) — lists and
 * defaults derive from the capability table in seedance-client.ts. Per-model
 * constraints (resolution, duration, audio, seed) can't be expressed in a
 * single schema enum, so the client's superRefine rejects them before the call.
 */
const SEEDANCE_MODEL_PROPERTY = {
  type: 'string',
  description:
    `Seedance model (default: "${DEFAULT_SEEDANCE_MODEL}" — the cheapest model that reaches 1080p, accepts photoreal human faces as input, supports seed, and has no activation gate). ` +
    'Quality, from the Artificial Analysis blind image-to-video arena: dreamina-seedance-2-0-260128 ranks 1st overall (Elo 1,198), the three Veo 3.1 tiers sit at 1,066-1,086, and seedance-1-5-pro-251215 is the arena baseline at 1,000 — so 2.0 is clearly the best Seedance, and 1.5 pro trades roughly a 59:41 preference against Veo for about a third of the price. ' +
    'dreamina-seedance-2-5-260628, the 2.0 fast/mini variants, and seedance-1-0-pro-fast-251015 have NO public evaluation at all — prefer them only for cost or for a capability the tested models lack, not for a shot that matters. ' +
    'The 2.x models REJECT input images containing real human faces and need account balance > $30 to activate, which rules them out for photoreal-person sources.',
  enum: [...VALID_SEEDANCE_MODELS],
  default: DEFAULT_SEEDANCE_MODEL,
} as const;

const SEEDANCE_RESOLUTION_PROPERTY = {
  type: 'string',
  description:
    `Output resolution (default: "${DEFAULT_SEEDANCE_RESOLUTION}"). Support differs per model — 1080p needs 2.5, 2.0, 1.5 pro, or 1.0 pro/fast; 4k is 2.0 only; the 2.0 fast/mini models top out at 720p.`,
  enum: [...VALID_SEEDANCE_RESOLUTIONS],
  default: DEFAULT_SEEDANCE_RESOLUTION,
} as const;

const SEEDANCE_DURATION_PROPERTY = {
  type: 'number',
  description:
    `Clip length in seconds (default: ${DEFAULT_SEEDANCE_DURATION}). Range differs per model — 2.5 accepts 4-30, the 2.0 series 4-15, 1.5 pro 4-12, and 1.0 pro/fast 2-12. Frame rate is fixed at ${SEEDANCE_FPS} fps. Cost scales linearly with duration.`,
  default: DEFAULT_SEEDANCE_DURATION,
} as const;

const SEEDANCE_AUDIO_PROPERTY = {
  type: 'boolean',
  description:
    'Generate a soundtrack with the video (default: false — this pipeline adds narration separately with tts_*, and on seedance-1-5-pro audio doubles the price). The vendor default is true; set it to true only when you want the model to voice the clip. The 1.0 pro/fast models are silent-only and reject true.',
  default: false,
} as const;

const SEEDANCE_WATERMARK_PROPERTY = {
  type: 'boolean',
  description: 'Burn a visible "AI Generated" mark into the bottom-right corner (default: false).',
  default: false,
} as const;

const SEEDANCE_SEED_PROPERTY = {
  type: 'number',
  description:
    'Random seed, -1 to 2147483647 (default -1). Supported only by seedance-1-5-pro and the 1.0 pro/fast models — the 2.x models reject it, so the reference lane has no seed at all. The API reference calls it a random seed and does not promise that the same seed reproduces the same video: do NOT build shot-to-shot consistency on it. Consistency belongs on reference images (seedance_reference) or first+last frames.',
} as const;

const SEEDANCE_CAMERA_FIXED_PROPERTY = {
  type: 'boolean',
  description:
    'Ask the model to hold the camera still. Supported only by seedance-1-5-pro and the 1.0 pro/fast models — on 2.x, describe the camera in the prompt instead.',
} as const;

const SEEDANCE_RATIO_VALUES = [...VALID_SEEDANCE_RATIOS];

/** Shared TTS property definitions (Gemini TTS) — lists derive from the tts-client.ts source of truth */
const TTS_VOICE_ENUM = [...TTS_VOICE_NAMES];

const TTS_VOICE_PROPERTY = {
  type: 'string',
  description: `Voice to use (default: "${DEFAULT_VOICE}"). Call tts_list_voices for the personality of each.`,
  enum: TTS_VOICE_ENUM,
  default: DEFAULT_VOICE,
};

const TTS_MODEL_PROPERTY = {
  type: 'string',
  description:
    'TTS model (default: gemini-2.5-flash-preview-tts — cheapest, free tier). gemini-2.5-pro-preview-tts: higher quality, no free tier, and the fallback when flash keeps returning no audio for a script. gemini-3.1-flash-tts-preview: newest, streaming-capable, 2x price.',
  enum: [...VALID_TTS_MODELS],
  default: DEFAULT_TTS_MODEL,
};

const TTS_TEMPERATURE_PROPERTY = {
  type: 'number',
  description: `Sampling temperature 0–2 (default ${DEFAULT_TTS_TEMPERATURE} — recommended for take-to-take voice consistency in narration/briefing; use 0.6–0.7 for expressive storytelling; provider default is 1.0)`,
  minimum: 0,
  maximum: 2,
  default: DEFAULT_TTS_TEMPERATURE,
};

/** Shared ElevenLabs property definitions — lists derive from the elevenlabs-client.ts source of truth */
const ELEVENLABS_VOICE_ID_PROPERTY = {
  type: 'string',
  description:
    'ElevenLabs voice_id (the 20-character ID, not the display name — e.g. "21m00Tcm4TlvDq8ikWAM"). No default: the premade set rotates (the legacy voices retire 2026-12-31), so pin one in data/<slug>/profile.md §2 and reuse it. Find IDs with tts_elevenlabs_voices or on the Voice Library page.',
  pattern: '^[A-Za-z0-9_-]{1,64}$',
};

const ELEVENLABS_OUTPUT_FORMAT_PROPERTY = {
  type: 'string',
  description: `Audio container and sample rate (default: "${DEFAULT_ELEVENLABS_OUTPUT_FORMAT}" — mono 16-bit WAV at 24kHz, the same spec as tts_generate, so the produce builder takes it as-is). wav_48000 is also on every plan; wav_44100 needs the Pro tier or above (403 below that, measured). mp3_* is for non-pipeline use only — build-reel.sh reads any non-RIFF narration file as raw PCM. The filename extension, if given, must match (.wav / .mp3).`,
  enum: [...ELEVENLABS_OUTPUT_FORMATS],
  default: DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
};

const ELEVENLABS_TIMESTAMPS_PROPERTY = {
  type: 'boolean',
  description:
    'Also fetch per-character timing (default: false). Uses the with-timestamps endpoint at the same price and writes <audio basename>.alignment.json next to the audio — the vendor\'s `alignment` (start/end seconds for every input character) and `normalized_alignment` verbatim. Read `alignment`: for Korean the normalized one is romanized and cannot index the source text.',
  default: false,
};

const ELEVENLABS_LANGUAGE_CODE_PROPERTY = {
  type: 'string',
  description:
    'ISO 639-1 code to enforce ("ko", "en", "ja"). Only eleven_flash_v2_5 / eleven_turbo_v2_5 / eleven_v3 honor it; eleven_multilingual_v2 detects the language from the text and ignores this. Set it for short Korean lines on flash — a two-word line can be misdetected.',
  pattern: '^[a-z]{2}$',
};

const ELEVENLABS_SEED_PROPERTY = {
  type: 'number',
  description: 'Deterministic seed 0–4294967295. The same seed, text, voice and settings reproduce the take — keep it when re-rendering one sentence of a finished scene.',
  minimum: 0,
  maximum: 4294967295,
};

const ELEVENLABS_NORMALIZATION_PROPERTY = {
  type: 'string',
  description:
    'Number/date reading: "auto" (vendor default), "on" (always spell out digits and dates — flash_v2_5 reads them raw otherwise, so turn this on for copy with prices or dates), "off" (never).',
  enum: [...ELEVENLABS_TEXT_NORMALIZATION],
};

const ELEVENLABS_STABILITY_PROPERTY = {
  type: 'number',
  description:
    'Voice stability 0–1 (vendor default 0.5). Higher is steadier and flatter; lower is more expressive and can wobble between takes. On eleven_v3 this is a 3-way mode, not a slider — 0.0 Creative (audio tags react most, occasional hallucinated words), 0.5 Natural, 1.0 Robust (tags barely react); other values are snapped. Keep it identical across every cut of one video.',
  minimum: 0,
  maximum: 1,
};

/** Shared music property definitions (Lyria) — scale/mode lists derive from the music-client.ts source of truth */
const MUSIC_SCALE_ENUM = [...MUSIC_SCALES];
const MUSIC_MODE_ENUM = [...MUSIC_GENERATION_MODES];

const MUSIC_DURATION_PROPERTY = {
  type: 'number',
  description: 'Duration of the generated music in seconds (5-300, default: 30)',
  minimum: 5,
  maximum: 300,
  default: 30,
};

/** Shared tail for the per-platform publish tools — final-copy contract + post-publish report */
const SNS_HITL_LINE =
  'Captions and titles are posted verbatim, with no rewriting — pass the final copy, hashtags included. After publishing, report the permalink from the response to the user.';

/**
 * Shared channel (brand) selector property — names the <SNS_TOKEN_DIR>/<slug>/
 * token directory paired with the data/<slug>/ channel.
 */
const SNS_CHANNEL_PROPERTY = {
  type: 'string',
  pattern: '^[a-z0-9][a-z0-9-]{0,63}$',
  description:
    'Channel (brand) slug — the same kebab-case as data/<slug>/. When given, only the tokens in <SNS_TOKEN_DIR>/<slug>/ are used, and a missing directory returns an explicit error (no fallback to the default tokens — prevents posting to the wrong account). When omitted, the default (flat) tokens apply — always pass it if you operate channel directories.',
} as const;

const SERP_QUOTA_LINE =
  'One search = one SerpApi credit (free tier 250/month) — never repeat an identical search. For Korean-language research, consider naver_search first (Naver Open API, 25,000 calls/day — a much larger quota).';

/**
 * Every search tool uses the same argument names — spelled out in the
 * descriptions too, so switching tools never means relearning the arguments.
 * Mapping to the backend APIs' q/display/num/start is the server's job.
 */
const SEARCH_ARG_LINE =
  'Shared search-tool arguments: query (search terms) · limit (result count) · page (page number). ' +
  'When fewer results come back than the engine produced, the response note says so — the truncated range is unreachable by paging, so read the note when present.';

/**
 * MCP behavior-hint presets (readOnly/destructive/idempotent/openWorld).
 *
 * The only machine-readable basis a client has for deciding "does this call
 * need user confirmation". This server has no pre-publish review gate, so a
 * call is public the moment it happens — stating that only in description
 * prose reaches the model but never the client.
 *
 * The verdict table in docs/api-reference/mcp-tools.html is the source of truth.
 */
const HINT = {
  /** External lookup — no side effects */
  read: { readOnlyHint: true, openWorldHint: true },
  /** Server-built-in constants — not even an API call */
  local: { readOnlyHint: true, openWorldHint: false },
  /** Creates local files — destroys no existing state, but output is non-deterministic, so not idempotent either */
  generate: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  /** On-device generation — same as generate, but never touches the network (local model) */
  generateLocal: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  /** Public the instant it is called · retry = duplicate post */
  publish: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  /** Sets external state — applies immediately, but repeating it gives the same result */
  moderate: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
} as const;

/**
 * Output schemas for the publish/comment tools.
 *
 * MCP requires (MUST) that a server declaring outputSchema return matching
 * structuredContent. So required covers **only fields always present on the
 * success path**, and failures return isError with no structuredContent
 * (handlers.fromApi).
 */
type OutputSchema = NonNullable<Tool['outputSchema']>;

const PERMALINK_PROPERTY = {
  type: 'string',
  description: 'Public post URL. null when the publish succeeded but only the permalink lookup failed (do not retry the publish — non-idempotent)',
};

const PLATFORM_PROPERTY = { type: 'string', description: 'Platform published to' };

const publishOutput = (idKey: string, idDescription: string): OutputSchema => ({
  type: 'object',
  properties: {
    platform: PLATFORM_PROPERTY,
    [idKey]: { type: 'string', description: idDescription },
    permalink: PERMALINK_PROPERTY,
  },
  required: ['platform', idKey],
});

const YOUTUBE_UPDATE_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    platform: PLATFORM_PROPERTY,
    videoId: { type: 'string', description: 'id of the updated video' },
    permalink: { type: 'string', description: 'https://www.youtube.com/watch?v=<videoId>' },
    privacyStatus: { type: 'string', description: 'Privacy status after the update (public | unlisted | private)' },
    title: { type: 'string', description: 'Title after the update' },
    changed: {
      type: 'object',
      description: 'What actually changed — all false means the call changed nothing',
      properties: {
        privacyStatus: { type: 'boolean' },
        title: { type: 'boolean' },
        description: { type: 'boolean' },
      },
    },
    dryRun: { type: 'boolean', description: 'dryRun calls only — true' },
    current: { type: 'object', description: 'dryRun calls only — the snippet/status currently on YouTube' },
    wouldSend: { type: 'object', description: 'dryRun calls only — the body that would actually be sent. This is where you eyeball the merge result' },
  },
  required: ['platform', 'videoId'],
};

const YOUTUBE_PUBLISH_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    platform: PLATFORM_PROPERTY,
    videoId: { type: 'string', description: 'id of the uploaded video' },
    permalink: { type: 'string', description: 'https://www.youtube.com/watch?v=<videoId>' },
    fileName: { type: 'string', description: 'Local file name that was uploaded' },
    thumbnailSet: { type: 'boolean', description: 'Only when thumbnailFilePath was given — whether setting the thumbnail succeeded' },
    thumbnailWarning: {
      type: 'string',
      description: 'Reason when only the thumbnail step failed. The video upload succeeded, so do not re-upload — set the thumbnail in YouTube Studio instead of calling this tool again',
    },
    captionSet: { type: 'boolean', description: 'Only when caption input was given — whether every caption track upload succeeded' },
    captionLanguages: {
      type: 'array',
      items: { type: 'string' },
      description: 'Languages of the caption tracks this call tried to upload (upload order)',
    },
    captionWarning: {
      type: 'string',
      description:
        'Reason when only the caption upload failed, prefixed per language ("en: …; vi: …" — a missing scope is the most common: captions.insert needs youtube.force-ssl). The video upload succeeded, so do not re-upload — reissue the token or upload just the failed languages in YouTube Studio',
    },
  },
  required: ['platform', 'videoId', 'permalink'],
};

const FACEBOOK_PUBLISH_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    platform: PLATFORM_PROPERTY,
    postId: {
      type: 'string',
      description:
        'Facebook post id — pass it straight to facebook_comment as postId. For video posts this value is also the video_id',
    },
    permalink: PERMALINK_PROPERTY,
    captionSet: { type: 'boolean', description: 'Only when caption input was given — whether every caption file upload succeeded' },
    captionLocales: {
      type: 'array',
      items: { type: 'string' },
      description: 'Locales of the caption files this call tried to upload (upload order, first = default track)',
    },
    captionWarning: {
      type: 'string',
      description:
        'Reason when only the caption upload failed, prefixed per locale ("en_US: …"). The post itself succeeded, so do not re-publish — the video may still have been processing, so retry just the failed locales shortly',
    },
  },
  required: ['platform', 'postId'],
};

const ACCOUNT_CHECK_OUTPUT: OutputSchema = {
  type: 'object',
  description: 'Shape is { channel, platforms } when channel is given, { channels, defaultTokens } when omitted',
  properties: {
    channel: { type: 'string', description: 'Checked channel slug (when channel was given)' },
    platforms: { type: 'object', description: 'Per platform: { ok, account } or { ok:false, reason }' },
    channels: { type: 'object', description: 'Channel slug → per-platform check results (when channel was omitted)' },
    defaultTokens: { description: 'Check result for the default (flat) tokens. A guidance string when there are none' },
  },
};

const COMMENT_INBOX_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    channel: { description: 'Channel slug queried (null when omitted)' },
    accounts: { type: 'object', description: 'Token-owning account info per platform' },
    summary: {
      type: 'object',
      description:
        'postsScanned · commentsFetched · actionable · byPlatform · withinGoldenHour (unanswered within their first 60 minutes) · oldestActionableMinutes · filters',
    },
    posts: { type: 'array', description: 'Normalized comment list per post', items: { type: 'object' } },
    skipped: {
      type: 'array',
      description: 'Platforms that could not be queried, with reasons (no credentials, missing scope, …)',
      items: { type: 'object' },
    },
  },
  required: ['summary', 'posts', 'skipped'],
};

const COMMENT_REPLY_OUTPUT: OutputSchema = {
  type: 'object',
  description: 'The reply id key differs per platform — THREADS=postId · FACEBOOK=commentId · INSTAGRAM/YOUTUBE=replyId',
  properties: {
    platform: PLATFORM_PROPERTY,
    postId: { type: 'string', description: 'THREADS — a reply is itself a post' },
    commentId: { type: 'string', description: 'FACEBOOK — id of the sub-comment added to the comment' },
    replyId: { type: 'string', description: 'INSTAGRAM/YOUTUBE — reply id' },
    parentCommentId: {
      type: 'string',
      description: 'YOUTUBE — the top-level comment id the reply actually attached to. If you passed a sub-comment id, this is its parent',
    },
    permalink: PERMALINK_PROPERTY,
  },
  required: ['platform'],
};

const COMMENT_MODERATE_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    platform: PLATFORM_PROPERTY,
    commentId: { type: 'string', description: 'Target comment id' },
    action: { type: 'string', description: 'Action applied' },
    done: { type: 'boolean', description: 'Applied on the platform' },
  },
  required: ['platform', 'commentId', 'action', 'done'],
};

const THREADS_INSIGHTS_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    channel: { description: 'Channel slug queried (null when omitted)' },
    account: { type: 'object', description: 'Token-owning account { id, username }' },
    period: { type: 'object', description: 'Aggregation window for account metrics { since, until, days }' },
    user: {
      type: 'object',
      description:
        'Account metrics — views is a daily time series { total, daily[] }; likes/replies/reposts/quotes are window totals; followers_count is the current value (window-independent)',
    },
    posts: {
      type: 'array',
      description:
        'Per recent root post: { postId, permalink, excerpt, timestamp, metrics: { views, likes, replies, reposts, quotes, shares } } — on individual lookup failure, metrics=null plus metricsError',
      items: { type: 'object' },
    },
  },
  required: ['account', 'period', 'user', 'posts'],
};

const INSTAGRAM_INSIGHTS_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    channel: { description: 'Channel slug queried (null when omitted)' },
    account: {
      type: 'object',
      description:
        '{ id, username, accountType, followersCount, followsCount, mediaCount } — follower count is a profile field, not an insight (the insights follower_count comes back empty for accounts with fewer than 100 followers)',
    },
    period: { type: 'object', description: 'Aggregation window for account metrics { since, until, days }' },
    user: {
      type: 'object',
      description:
        'Account window totals — reach, views, profile_views, accounts_engaged, total_interactions, likes, comments, shares, saves, profile_links_taps',
    },
    media: {
      type: 'array',
      description:
        'Per recent media item: { mediaId, mediaType, mediaProductType, permalink, excerpt, timestamp, metrics } — the shared metrics are views/reach/likes/comments/shares/saved/total_interactions, and surface-specific metrics attach by mediaProductType: REELS gets ig_reels_avg_watch_time (ms), ig_reels_video_view_total_time (ms), and reels_skip_rate; FEED gets follows and profile_visits. The two sets are exclusive — requesting one against the other surface fails with a 400 that empties that media item\'s metrics entirely, so never mix them. On individual lookup failure, metrics=null plus metricsError',
      items: { type: 'object' },
    },
  },
  required: ['account', 'period', 'user', 'media'],
};

const YOUTUBE_INSIGHTS_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    channel: { description: 'Channel slug queried (null when omitted)' },
    account: {
      type: 'object',
      description:
        '{ channelId, title, subscriberCount, viewCount, videoCount, subscriberCountHidden } — when subscriberCountHidden=true the subscriber count is rounded and useless for judging growth',
    },
    period: { type: 'object', description: 'Aggregation window { startDate, endDate, days } (YYYY-MM-DD)' },
    metrics: {
      type: 'object',
      description:
        'Channel window metrics — views, engagedViews (views that got past the opening), estimatedMinutesWatched, averageViewDuration (seconds), averageViewPercentage, subscribersGained/Lost, likes, comments, shares. Analytics data runs 2-3 days behind, so an empty recent window arrives as {} (distinct from 0)',
    },
    revenue: { type: 'object', description: 'Only when includeRevenue=true and the revenue scope is present — estimatedRevenue, estimatedAdRevenue, estimatedRedPartnerRevenue, cpm' },
    revenueError: { type: 'string', description: 'Reason when only the revenue lookup failed (other metrics are fine)' },
    videos: {
      type: 'array',
      description:
        'Per recent upload: { videoId, permalink, title, publishedAt, duration, durationSeconds, lifetime: { views, likes, comments }, period: window metrics } — durationSeconds ≤180 marks a Shorts candidate (the API cannot tell whether it is portrait); period is null when no data exists. lifetime is the public Data API counter and updates without the Analytics lag; period, and the shares inside it, is the lagged Analytics window — a fresh upload only moves in lifetime',
      items: { type: 'object' },
    },
    videosError: {
      type: 'string',
      description:
        'Reason when only the video lookup failed — when present, do not read the empty videos array or its zeros as "no uploads" (channel metrics are fine)',
    },
    note: { type: 'string', description: 'Guidance on metrics the API cannot provide' },
  },
  required: ['account', 'period', 'metrics', 'videos'],
};

const CONTENT_FEEDBACK_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    channel: { description: 'Channel slug queried (null when omitted)' },
    generatedAt: { type: 'string', description: 'Report generation time, ISO-8601' },
    limit: { type: 'number', description: 'Recent posts per platform' },
    days: { type: 'number', description: 'Days aggregated' },
    htmlPath: { description: 'Path of the HTML written. null when neither channel nor outputPath was given' },
    youtube: {
      type: 'object',
      description:
        '{ available, error?, account, cohort, items[], notes[] } — items carries, per recent video, hook (% getting past the opening), retain (average % watched), shareRate (shares against engagedViews, the views past the opening, since YouTube reports no reach), angle (views low while hook/retention held up), and problem/hypothesis/next-episode notes',
    },
    instagram: {
      type: 'object',
      description:
        '{ available, error?, account, cohort, items[], notes[] } — for reels: skip (3-second drop-off %), watch (seconds), shareRate (shares against reach); otherwise pending',
    },
  },
  required: ['generatedAt', 'limit', 'days', 'youtube', 'instagram'],
};

const YOUTUBE_TOPIC_SCOUT_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    channel: { description: 'Channel slug passed on the call (null when omitted)' },
    queries: { type: 'array', description: 'Seed queries actually run', items: { type: 'string' } },
    method: {
      type: 'object',
      description:
        '{ baseline, minMultiplier, minViews, publishedAfterDays, duration, regionCode, language, via, note } — the channel-median multiplier contract. Default market is US/en',
    },
    scanned: {
      type: 'object',
      description: '{ channels, videos, outliers } — channels and videos scanned, and the count of 5x-plus videos',
    },
    quotaUnits: { type: 'number', description: 'Estimated YouTube Data API quota spent by this call (search=100, other list calls=1)' },
    keywords: {
      type: 'array',
      description:
        '{ phrase, score, outlierCount, bestMultiplier, evidence[] } — topic phrases pulled from outlier titles. Score = sum of multipliers',
      items: { type: 'object' },
    },
    outliers: {
      type: 'array',
      description:
        '{ videoId, permalink, title, channelTitle, views, baseline, multiplier, publishedAt, durationSeconds, commentCount, tags, gaps[] } — at least minMultiplier times the channel median',
      items: { type: 'object' },
    },
    channels: {
      type: 'array',
      description: '{ channelId, title, subscriberCount, videoCount, baseline, outlierCount, skipped? }',
      items: { type: 'object' },
    },
    errors: { type: 'array', description: 'Partial-failure reasons. Field omitted entirely when none', items: { type: 'string' } },
    excludedOwnChannelId: { description: 'Own channel id learned via OAuth. null when only the API key was used' },
  },
  required: ['queries', 'method', 'scanned', 'quotaUnits', 'keywords', 'outliers', 'channels'],
};

const SNS_ISSUE_SCOUT_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    queries: { type: 'array', description: 'Seed queries actually run', items: { type: 'string' } },
    platforms: { type: 'array', description: 'Platforms scanned (threads | x | instagram)', items: { type: 'string' } },
    method: {
      type: 'object',
      description:
        '{ via, recency, gl, hl, pagesPerQuery, sites, ranking, scoring, trending } — the Google site: search contract. ranking is relevance order (not engagement); scoring is mention count × platform weight',
    },
    scanned: {
      type: 'object',
      description: '{ searches, hits, posts, duplicates, returnedPosts } — searches run (retries included), results received, items judged to be posts (deduplicated), items folded as same-sentence reposts, and items included in the response',
    },
    credits: { type: 'number', description: 'Estimated SerpApi credits spent by this call (search count + 1 for trending)' },
    keywords: {
      type: 'array',
      description:
        '{ phrase, score, postCount, platformCount, platforms[], evidence[{platform,url,title}] } — topic phrases co-occurring across several posts and platforms. The score is mention-count based — a different yardstick from the YouTube multiplier',
      items: { type: 'object' },
    },
    posts: {
      type: 'array',
      description:
        '{ platform, url, author, title, snippet, date?, matchedQueries[] } — post-level items (profile/tag pages excluded; slugs and media paths normalized). There are no engagement fields',
      items: { type: 'object' },
    },
    trending: {
      type: 'object',
      description:
        '{ geo, hours, count, items[{query, searchVolume, increasePct, active, startedAt, categories[], breakdown[], matchesSeed}] } — Google Trends trending searches. Absent when includeTrending=false',
    },
    note: { type: 'string', description: 'Guidance when posts were truncated at the cap' },
    errors: { type: 'array', description: 'Partial-failure reasons. Field omitted entirely when none', items: { type: 'string' } },
  },
  required: ['queries', 'platforms', 'method', 'scanned', 'credits', 'keywords', 'posts'],
};

const THREADS_SEARCH_OUTPUT: OutputSchema = {
  type: 'object',
  properties: {
    channel: { description: 'Channel slug queried (null when omitted)' },
    query: { type: 'string', description: 'Query executed' },
    searchType: { type: 'string', description: 'TOP (by popularity) or RECENT (newest first)' },
    count: { type: 'number', description: 'Number of posts returned' },
    results: {
      type: 'array',
      description:
        '{ postId, username, text, mediaType, permalink, timestamp, ageMinutes, isReply, isQuotePost, hasReplies } — pass postId as threads_publish replyToId to join with a reply',
      items: { type: 'object' },
    },
  },
  required: ['query', 'count', 'results'],
};

export const TOOLS: Tool[] = [
  // ── Research & fact-checking ──────────────────────────────────────────
  {
    name: 'serp_web_search',
    title: 'Google web search (SerpApi)',
    annotations: HINT.read,
    description: `Google web search (SerpApi) — for research and fact-checking before storyboard authoring. For non-Korean material set country/language with gl/hl; for general Korean material use gl=kr&hl=ko. The server returns only organic/answer_box/knowledge_graph/related_questions. ${SEARCH_ARG_LINE} ${SERP_QUOTA_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms (site:, filetype: and other operators supported)' },
        gl: { type: 'string', description: 'Two-letter country code, e.g. kr, us, vn' },
        hl: { type: 'string', description: 'Language code, e.g. ko, en, vi' },
        location: { type: 'string', description: 'Locality the results should be based on (optional), e.g. Seoul, South Korea' },
        limit: { type: 'number', description: 'Result count (default 10, max 10 — this engine fixes a page at 10 results). Need more? Raise page by 1. ' },
        page: { type: 'number', description: 'Page number (1 to 5) — only when page 1 lacks the evidence' },
        recency: {
          type: 'string',
          enum: ['hour', 'day', 'week', 'month', 'year'],
          description: 'Recency filter — month/year recommended when verifying time-sensitive values (prices, deadlines, effective dates)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'serp_news_search',
    title: 'Google news search (SerpApi)',
    annotations: HINT.read,
    description: `Google news search (SerpApi) — for checking fresh developments, announcements, and rollouts. Use to cross-verify time-sensitive values (prices, deadlines, effective dates) before they go into content. This engine has no recency filter or sort parameter (they cannot be combined with a query) — to narrow by announcement date use serp_web_search recency, serp_naver_search period, or naver_search (sort=date). ${SEARCH_ARG_LINE} ${SERP_QUOTA_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms' },
        gl: { type: 'string', description: 'Two-letter country code, e.g. kr, us' },
        hl: { type: 'string', description: 'Language code, e.g. ko, en' },
        limit: {
          type: 'number',
          description: 'Articles to return (default 10, max 20). This engine has no result-count parameter — the server trims the response, and a smaller value still bills as one search',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'serp_naver_search',
    title: 'Naver search (via SerpApi)',
    annotations: HINT.read,
    description: `Naver search (via SerpApi) — the fallback when naver_search (the official Open API) has no key or an exhausted quota, and the lane for **video search** and the period filter, which the official API lacks. where=web(default)|news|image|video. If the official API can run the same search, use naver_search first — its quota is two orders of magnitude larger. ${SEARCH_ARG_LINE} ${SERP_QUOTA_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms (NOT/OR/site: operators supported)' },
        where: {
          type: 'string',
          enum: ['web', 'news', 'image', 'video'],
          description: 'web=web documents (default) | news | image | video (a type the official Open API lacks)',
        },
        page: { type: 'number', description: 'Page number (1 to 5)' },
        sort: {
          type: 'string',
          enum: ['relevance', 'latest', 'oldest'],
          description: 'Sort order (default relevance). oldest is where=news only — an error on any other type',
        },
        period: {
          type: 'string',
          enum: ['1h', '1d', '1w', '1m', '3m', '6m', '1y'],
          description: 'Recency filter — narrow to a recent window when verifying time-sensitive values. The official Open API does not have this',
        },
        limit: { type: 'number', description: 'Results to return (default 10, max 50). How many arrive per call varies by where and query (measured: web 15 · news 10 · video 68 · image 48) — when more arrive than limit, the response note carries the truncated count and what to do' },
      },
      required: ['query'],
    },
  },
  {
    name: 'serp_image_search',
    title: 'Google image search (SerpApi)',
    annotations: HINT.read,
    description: `Google image search (SerpApi) — for storyboard references and composition research, checking what products/places/people actually look like, and collecting visual grounding for image-generation prompts. Returns source URL, resolution, and origin. **If you are hunting material to place into content as-is, always set license** — unfiltered results are images with unverified copyright, and putting them in a post is infringement. For images you will create yourself, skip this tool and use image_local_generate (default, free) or gpt_image_text2img (text-bearing, higher quality) — no rights issues. ${SEARCH_ARG_LINE} ${SERP_QUOTA_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms (site: and other operators supported)' },
        gl: { type: 'string', description: 'Two-letter country code, e.g. kr, us' },
        hl: { type: 'string', description: 'Language code, e.g. ko, en' },
        limit: { type: 'number', description: 'Result count (default 20, max 50) — the engine returns 100 at a time, so a smaller value still bills as one search. **One page slot covers 100 items, so items 51-100 are unreachable in any combination** — if you need that range, narrow with filters (size/aspect/license) or the query' },
        page: { type: 'number', description: 'Page number (1 to 5) — one slot covers 100 items, so page=2 begins at item 101 (51-100 are skipped). The position in results is this engine\'s global rank, unchanged' },
        size: {
          type: 'string',
          enum: ['large', 'medium', 'icon', '2mp', '4mp', '8mp', '15mp'],
          description: 'Image size — for high-res short-form backgrounds, large or above is recommended',
        },
        aspect: {
          type: 'string',
          enum: ['square', 'tall', 'wide', 'panoramic'],
          description: 'Aspect ratio — use tall for 9:16 portrait-format references',
        },
        imageType: {
          type: 'string',
          enum: ['photo', 'clipart', 'lineart', 'animated', 'face'],
          description: 'Image kind (photo | clipart | lineart | animated=GIFs | face)',
        },
        license: {
          type: 'string',
          enum: ['free', 'commercial', 'modify', 'modify_commercial', 'creative_commons'],
          description:
            'License scope — material going into posts needs commercial (commercial use allowed) or stronger; use modify_commercial if you will also edit it',
        },
        color: {
          type: 'string',
          enum: ['bw', 'trans', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'white', 'gray', 'black', 'brown'],
          description: 'Dominant color — trans=transparent background (logo/overlay material)',
        },
        safe: { type: 'boolean', description: 'Adult-content filter (default true=on)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'stock_search',
    title: 'Free stock search (Pexels · Pixabay · NASA · Commons)',
    annotations: HINT.read,
    description:
      'Free, commercially usable photos and clips for a cut that needs the real thing — an actual place, era, event or live action — at zero generation cost. Searches Pexels and Pixabay (PEXELS_API_KEY / PIXABAY_API_KEY; a missing key skips that provider with a note), the NASA Image and Video Library and Wikimedia Commons (no key). Every item returns a ready `visual.license` block (provider, page url, license name and url, commercial/modify flags, attribution text, retrievedAt) — store it verbatim on the `visual.source: "stock"` cut; check-scenes.js refuses a stock cut without it. Commons results are filtered to public domain, CC0 and plain CC BY (share-alike, non-commercial and no-derivatives files are dropped and counted) because an edited, monetized cut cannot carry those terms. This tool does not download: fetch `files[0].url` with curl into storyboard/footage/ (video, as footage/s<n>-<provider>-<id>.mp4) or storyboard/images/stock/ (photo); Commons video is WebM and needs an ffmpeg transcode. People, logos and brands in frame stay a separate rights question on every provider; NASA insignia and identifiable current astronauts are excluded from commercial use. English keywords work best on Pexels, Pixabay and NASA. Read-only; Pexels allows 200 requests/hour, Pixabay 100/minute.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms — a concrete subject in English ("1960s street tram", "rice paddy aerial"); Pixabay reads the first 100 characters' },
        media: { type: 'string', enum: ['video', 'photo'], description: 'video (default) for a stock_video cut · photo for a still_camera source image' },
        providers: {
          type: 'array',
          items: { type: 'string', enum: ['pexels', 'pixabay', 'nasa', 'commons'] },
          description: 'Which providers to ask (default all four). NASA for space, earth science and aviation history; Commons for archival and historical files',
        },
        orientation: { type: 'string', enum: ['portrait', 'landscape', 'square', 'any'], description: 'portrait for a 9:16 short, landscape for 16:9 long-form (default any). Applied after the call; NASA reports no dimensions' },
        limit: { type: 'number', description: 'Items per provider (default 8, max 30; NASA pages 10 at a time)' },
        minWidth: { type: 'number', description: 'Minimum pixel width — 1080 for a portrait short, 1920 for landscape' },
        minDuration: { type: 'number', description: 'Video only — shortest clip in seconds to keep' },
        maxDuration: { type: 'number', description: 'Video only — longest clip in seconds to keep (long archive reels are trimmed with visual.in)' },
        locale: { type: 'string', description: 'Pexels locale (ko-KR, en-US) or a Pixabay two-letter lang; Commons and NASA ignore it' },
      },
      required: ['query'],
    },
  },
  {
    name: 'serp_trending_now',
    title: 'Google trending searches (SerpApi)',
    annotations: HINT.read,
    description:
      'Google Trends trending searches (SerpApi engine=google_trends_trending_now) — answers "what is rising in this country right now", with search volume and growth rate (read-only). For the SNS-issue section of topic-scout and timeliness calls in the grow-* loops. It reflects Google search, not SNS engagement, and searchVolume/increasePct are bucketed estimates from Google (2,000,000 · 1000%), so use them only to compare ranks. The engine takes no query — pick the country with geo and the window with hours; only four windows exist: 4, 24, 48, 168. This engine has no page. One call = one SerpApi credit (free tier 250/month) — do not repeat the same geo/hours within a session.',
    inputSchema: {
      type: 'object',
      properties: {
        geo: { type: 'string', description: 'Two-letter country code (default KR). US for the United States, JP for Japan' },
        hours: {
          type: 'number',
          enum: [4, 24, 48, 168],
          description: 'How many recent hours of trending to cover (default 24). Google\'s four fixed windows — 4 | 24 | 48 | 168 (7 days)',
        },
        categoryId: {
          type: 'number',
          description:
            'Optional category narrowing. 3=Business and Finance · 4=Entertainment · 7=Health · 14=Politics · 16=Shopping · 17=Sports · 18=Technology · 19=Travel — all categories when omitted',
        },
        onlyActive: { type: 'boolean', description: 'true returns only queries still rising now (default false — everything that spiked at least once inside the window)' },
        hl: { type: 'string', description: 'Language code, e.g. ko, en — affects only how category names are written' },
        limit: { type: 'number', description: 'Result count (default 20, max 50). The engine returns hundreds at a time, so a smaller value still bills as one call' },
      },
    },
  },
  {
    name: 'naver_search',
    title: 'Naver search (official Open API)',
    annotations: HINT.read,
    description:
      `${SEARCH_ARG_LINE} ` +
      'Naver Open API search (official, 25,000 free calls/day) — the first-line tool for Korean-language research. type picks one of 8: news | blog=blog reviews | web=web documents | cafe=cafe posts (real-user sentiment) | kin=JisikiN Q&A (questions people genuinely ask — strong for short-form topic mining) | image | encyc=encyclopedia (term definitions) | local=local businesses (address, coordinates, phone). For Korean trends, real-user reviews, and domestic news this beats Google on accuracy. The server strips the <b> highlights and returns only the evidence fields; local converts coordinates to latitude/longitude. ' +
      '**Parameter constraints differ per type** — web/encyc do not support sorting (the server rejects a sort argument); local uses a sort=random|comment scheme with a 5-result cap and no paging; imageSize is type=image only. Book, shopping, academic, and movie search no longer exist — Naver shut them down (still in the official docs, but calling them returns 404) — fall back to serp_web_search if needed. For video search use serp_naver_search (where=video).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms' },
        type: {
          type: 'string',
          enum: ['news', 'blog', 'web', 'cafe', 'kin', 'image', 'encyc', 'local'],
          description:
            'news (default) | blog=blog reviews | web=web documents | cafe=cafe posts | kin=JisikiN questions | image | encyc=encyclopedia | local=local businesses',
        },
        limit: { type: 'number', description: 'Result count (default 10, max 30 — the API caps local at 5)' },
        page: { type: 'number', description: 'Page number (from 1) — only when page 1 lacks the evidence. The big quota lets you page deeper than serp_* (1-5), but the API rejects anything where (page-1)×limit+1 exceeds 1,000. local has no paging' },
        sort: {
          type: 'string',
          enum: ['sim', 'date', 'random', 'comment'],
          description:
            'news/blog/cafe/kin/image: sim=by relevance (default) | date=newest first · local: random=by relevance | comment=most-reviewed first · web/encyc: no sorting',
        },
        imageSize: {
          type: 'string',
          enum: ['all', 'large', 'medium', 'small'],
          description: 'Image size filter (type=image only)',
        },
      },
      required: ['query'],
    },
  },

  // ── data.go.kr (Korea open-data portal) — official government data seeds ──────
  {
    name: 'datago_search',
    title: 'data.go.kr dataset search',
    annotations: HINT.read,
    description:
      'data.go.kr (Korea open-data portal) dataset search (no auth, no quota) — finds official statistics and status data from government agencies by keyword. As numeric grounding for content, this primary data beats re-quoting articles. Omitting type searches both open-API and file datasets. Pass the result\'s publicDataPk+type to datago_detail for the collection path (download identifier, endpoint). Agency-name + topic combinations work well as queries (e.g. "관광 통계", "소상공인 현황" — the portal is Korean-language).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms (topic words, plus the agency name when useful)' },
        type: { type: 'string', enum: ['API', 'FILE'], description: 'API=open API | FILE=file dataset (CSV etc.) — both when omitted' },
        page: { type: 'number', description: 'Page number (from 1)' },
        limit: { type: 'number', description: 'Results per type (default 10, max 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'datago_detail',
    title: 'data.go.kr dataset detail',
    annotations: HINT.read,
    description:
      'data.go.kr dataset detail lookup (no auth) — for FILE datasets it extracts the download identifier (publicDataDetailPk) and the odcloud API path; for API datasets, endpoint clues (Swagger, request URLs, usage-guide document links). The metadata (providing agency, modified date, update cadence, license scope) feeds source attribution and freshness judgment. Pass publicDataPk and type through from the datago_search response.',
    inputSchema: {
      type: 'object',
      properties: {
        publicDataPk: { type: 'string', description: 'publicDataPk from the datago_search response (numeric string)' },
        type: { type: 'string', enum: ['API', 'FILE'], description: 'type from the datago_search response' },
      },
      required: ['publicDataPk', 'type'],
    },
  },
  {
    name: 'datago_file_download',
    title: 'data.go.kr file download',
    annotations: HINT.generate,
    description:
      'data.go.kr raw file download (no auth) — saves the actual file (CSV etc.) locally and returns encoding detection plus a 6-row head preview (100MB cap). Use publicDataPk/publicDataDetailPk straight from the datago_detail response. The fastest file-collection path — usable immediately, no usage application (활용신청) needed. If the preview encoding is euc-kr, convert with iconv before Read. saveDir is best placed under the topic directory (data/<channel>/episodes/<topic>/storyboard/) — omitted, it saves to a temp directory.',
    inputSchema: {
      type: 'object',
      properties: {
        publicDataPk: { type: 'string', description: 'publicDataPk from the datago_detail response' },
        publicDataDetailPk: { type: 'string', description: 'publicDataDetailPk from the datago_detail response (the full uddi:… value, suffix included)' },
        saveDir: { type: 'string', description: 'Absolute directory path to save into (omitted: social-flow-datago/ under the OS temp directory)' },
      },
      required: ['publicDataPk', 'publicDataDetailPk'],
    },
  },
  {
    name: 'datago_file_fetch',
    title: 'data.go.kr file row fetch',
    annotations: HINT.read,
    description:
      'Row-level fetch of a data.go.kr file dataset via the odcloud JSON API (auth key + **a usage application (활용신청) for this specific API is required**) — fetches only the pages you need instead of the whole file. Use instead of datago_file_download when you need a few rows of a large (tens of MB) dataset. Error -4 = the key has no usage application for this API — file one on the portal (auto-approved) and retry, or fall back to datago_file_download (no auth). publicDataPk/uddi are the components of datago_detail\'s odcloudPath.',
    inputSchema: {
      type: 'object',
      properties: {
        publicDataPk: { type: 'string', description: 'publicDataPk from the datago_detail response' },
        uddi: { type: 'string', description: 'publicDataDetailPk from the datago_detail response (the full uddi:… value)' },
        page: { type: 'number', description: 'Page number (from 1)' },
        limit: { type: 'number', description: 'Row count (default 10, max 50)' },
      },
      required: ['publicDataPk', 'uddi'],
    },
  },
  {
    name: 'datago_api_call',
    title: 'data.go.kr standard open-API call',
    annotations: HINT.read,
    description:
      'Calls a data.go.kr standard open API (apis.data.go.kr) (auth key + **a usage application (활용신청) for this specific API is required**) — assembles parameters and serviceKey onto the path and issues a GET. Check the path/parameter contract first in datago_detail\'s endpoint/requestUrls or the usage-guide docs — do not guess parameters and call repeatedly (it burns the daily traffic). Many of these APIs answer in XML — request JSON where the API supports a dataType/_type=JSON parameter. On auth rejection, check the usage application first.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path below apis.data.go.kr (e.g. 1360000/VilageFcstInfoService_2.0/getUltraSrtNcst)' },
        params: {
          type: 'object',
          additionalProperties: { type: ['string', 'number', 'boolean'] },
          description: 'Query parameters (serviceKey is injected by the server — do not include it)',
        },
      },
      required: ['path'],
    },
  },

  // ── Image generation (OpenAI GPT Image — ported from the fect-mcp gpt-image module) ──
  {
    name: 'gpt_image_text2img',
    title: 'Image generation (text → image)',
    annotations: HINT.generate,
    description: `Generate an image from a text prompt using OpenAI GPT Image models.

Use when the image must contain legible text — posters, labels, UI mockups, signage, title cards — or when a quality boost over the local default is worth paying for. The local engine breaks Korean glyphs (measured: "딸깍연구소" came out as "달닥연구소"); every text-bearing image belongs here. Strengths: reliable text rendering inside the image, strong photorealism, and exact custom WIDTHxHEIGHT resolutions (e.g. "1088x1920" for 9:16 — gpt-image-2 only, edges multiple of 16).
Do NOT use as the first choice for text-free images (cover backgrounds, b-roll, draft exploration) — the plugin's default path is image_local_generate (local Z-Image, free); this tool bills per image. Do NOT use to edit or compose existing images — use gpt_image_img2img.
Note: gpt-image-2 (default) does NOT support transparent backgrounds; transparent requires the deprecated gpt-image-1/1.5 and png/webp output. Size/quality/background constraints are enforced per model — see each parameter.

Returns: the generated image as MCP image content (always base64), plus a text block with model, size, quality, and the saved file path when savePath is given.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Image generation prompt (max 32,000 characters)',
          maxLength: 32000,
        },
        model: {
          type: 'string',
          description: 'OpenAI GPT Image model (default: "gpt-image-2")',
          enum: ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini'],
          default: 'gpt-image-2',
        },
        size: {
          type: 'string',
          description:
            'Output size (default: "auto"). Presets: "1024x1024" / "1536x1024" / "1024x1536" / "auto". Custom "WIDTHxHEIGHT" is gpt-image-2 only (edges multiple of 16, aspect 1:3–3:1, max edge 3840px, total pixels 655,360–8,294,400).',
          default: 'auto',
        },
        quality: {
          type: 'string',
          description: 'Generation quality (default: "auto")',
          enum: ['low', 'medium', 'high', 'auto'],
          default: 'auto',
        },
        background: {
          type: 'string',
          description:
            'Background mode (default: "opaque"). "transparent" is NOT supported by gpt-image-2 (use gpt-image-1 / gpt-image-1.5) and requires a png or webp output.',
          enum: ['opaque', 'transparent', 'auto'],
          default: 'opaque',
        },
        outputFormat: {
          type: 'string',
          description: 'Output image format (default: "png")',
          enum: ['png', 'jpeg', 'webp'],
          default: 'png',
        },
        savePath: {
          type: 'string',
          description: 'Absolute file path to save the generated image. Supports .png/.jpg/.jpeg/.gif/.webp/.bmp. Parent directories are created automatically.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'gpt_image_img2img',
    title: 'Image edit & compose (image → image)',
    annotations: HINT.generate,
    description: `Edit or compose images using OpenAI GPT Image models (multi-reference + optional mask).

Use when the user asks to inpaint a masked region, combine multiple reference images (1-16 via sourceImagesBase64) into one output, or edit while preserving fine input details such as faces and logos (이미지 합성, 인페인팅, 이미지 수정, 배경 교체).
Do NOT use for text-to-image from scratch — use gpt_image_text2img.
Mask: optional PNG with alpha channel, same dimensions as the first source image; fully transparent pixels are the regions to regenerate (applied to the first image only). gpt-image-2 (default) always runs at high input fidelity — do not pass inputFidelity for it.

Returns: the edited image as MCP image content (always base64, in the requested outputFormat), plus a text block with model, size, quality, mask/fidelity flags, and the saved file path when savePath is given.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Edit / composition prompt (max 32,000 characters)',
          maxLength: 32000,
        },
        sourceImagesBase64: {
          type: 'array',
          description: 'Base64-encoded reference images (1 to 16 entries)',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 16,
        },
        sourceMimeType: {
          type: 'string',
          description: 'MIME type of each source image (default: "image/png")',
          enum: ['image/png', 'image/jpeg', 'image/webp'],
          default: 'image/png',
        },
        maskBase64: {
          type: 'string',
          description: 'Optional base64-encoded PNG mask with alpha channel; transparent pixels are repainted. Must match the first source image dimensions.',
        },
        model: {
          type: 'string',
          description: 'OpenAI GPT Image model (default: "gpt-image-2")',
          enum: ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini'],
          default: 'gpt-image-2',
        },
        size: {
          type: 'string',
          description:
            'Output size (default: "auto"). Presets: "1024x1024" / "1536x1024" / "1024x1536" / "auto". Custom "WIDTHxHEIGHT" is gpt-image-2 only (edges multiple of 16, aspect 1:3–3:1, max edge 3840px, total pixels 655,360–8,294,400).',
          default: 'auto',
        },
        quality: {
          type: 'string',
          description: 'Generation quality (default: "auto")',
          enum: ['low', 'medium', 'high', 'auto'],
          default: 'auto',
        },
        background: {
          type: 'string',
          description:
            'Background mode (default: "opaque"). "transparent" is NOT supported by gpt-image-2 (use gpt-image-1 / gpt-image-1.5) and requires a png or webp output.',
          enum: ['opaque', 'transparent', 'auto'],
          default: 'opaque',
        },
        outputFormat: {
          type: 'string',
          description: 'Output image format (default: "png")',
          enum: ['png', 'jpeg', 'webp'],
          default: 'png',
        },
        inputFidelity: {
          type: 'string',
          description: 'How strongly to preserve fine details (faces, logos, layout) of the input images. Only for gpt-image-1 / gpt-image-1.5 (API default: "low"). Do NOT set for gpt-image-2 (always high fidelity, parameter rejected) or gpt-image-1-mini (unsupported).',
          enum: ['high', 'low'],
        },
        savePath: {
          type: 'string',
          description: 'Absolute file path to save the edited image. Supports .png/.jpg/.jpeg/.gif/.webp/.bmp.',
        },
      },
      required: ['prompt', 'sourceImagesBase64'],
    },
  },
  {
    name: 'image_local_generate',
    title: 'Image generation (local · Z-Image — default)',
    annotations: HINT.generateLocal,
    description: `Generate an image from a text prompt **on this machine** using Z-Image Turbo (6B, Apache 2.0) via mflux — no API key, no network, no per-image cost.

This is the DEFAULT image generation path of this plugin. Use for any text-free image: cover backgrounds, b-roll stills, branding drafts, mood exploration, bulk candidate batches (이미지 생성, 커버 배경). Measured on this class of machine (M4 Max): 1024×1024 in ~2–3.5 min and 1088×1920 (9:16) in ~7.5 min under heavy load — minutes, not seconds, with 32–39GB peak memory; avoid running alongside video renders.
Do NOT use when the image must contain legible text — Korean glyphs break (measured: "딸깍연구소" rendered as "달닥연구소"); any text-bearing image (poster, label, title card) and any quality-critical shot goes to gpt_image_text2img instead. Do NOT use to edit existing images — gpt_image_img2img.
Requires mflux (\`uv tool install --python 3.12 mflux\`; Apple Silicon only); set MFLUX_ZIMAGE_BIN if the binary lives elsewhere. The first call downloads the ~31GB weight repository to ~/.cache/huggingface — the tool extends its own timeout by an hour for that download, so a very slow first call is normal, not stuck.

Returns: a text block with the saved .png path, resolution, steps, seed, quantization, and generation time.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Image generation prompt (max 32,000 characters). English prompts recommended; do not ask for text in the image.',
          maxLength: 32000,
        },
        width: {
          type: 'number',
          description: `Image width in pixels (default: 1024). ${MIN_ZIMAGE_DIMENSION}–${MAX_ZIMAGE_DIMENSION}, multiple of ${ZIMAGE_DIMENSION_STEP}. For 9:16 portrait use 1088×1920, not 1080×1920.`,
          minimum: MIN_ZIMAGE_DIMENSION,
          maximum: MAX_ZIMAGE_DIMENSION,
          default: 1024,
        },
        height: {
          type: 'number',
          description: `Image height in pixels (default: 1024). Same constraints as width. Generation time scales with width×height — 9:16 full size takes ~4x a 1024² render.`,
          minimum: MIN_ZIMAGE_DIMENSION,
          maximum: MAX_ZIMAGE_DIMENSION,
          default: 1024,
        },
        steps: {
          type: 'number',
          description: `Diffusion steps (default: ${DEFAULT_ZIMAGE_STEPS} — the model card's recommended setting; 9 steps = 8 DiT forwards). More steps rarely help this turbo-distilled model.`,
          minimum: 1,
          maximum: 50,
          default: DEFAULT_ZIMAGE_STEPS,
        },
        seed: {
          type: 'number',
          description: 'Random seed for reproducible output. Omit for a random seed. Re-run the same prompt+seed+size to get the identical image.',
          minimum: 0,
        },
        quantize: {
          type: 'number',
          description: `Weight quantization bits (default: ${DEFAULT_ZIMAGE_QUANTIZE}). 8 is the measured baseline; 4 halves memory with a small quality cost.`,
          enum: [...ZIMAGE_QUANTIZE_OPTIONS],
          default: DEFAULT_ZIMAGE_QUANTIZE,
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the image file (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the image file (default: zimage_<timestamp>.png)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'mlx_image_generate',
    title: 'Image generation (local · MLX Core)',
    annotations: HINT.generateLocal,
    description: `Generate an image on this machine via MLX Core / mlx-serve (HTTP to 127.0.0.1:11234). No vendor bill. This plugin never launches the app — if :11234 is down the call fails closed with a brew install --cask mlx-core hint.

Use as an optional local image lane when MLX Core is running and an image model is downloaded (FLUX.2-klein is fixed at 1024×1024; Krea/Mage-Flow accept any multiple of ${MLX_IMAGE_DIMENSION_STEP} in ${MIN_MLX_IMAGE_DIMENSION}–${MAX_MLX_IMAGE_DIMENSION}, so 9:16 is 1088×1920 not 1080×1920). Optional imagePath is img2img (strength 0–1).
Do NOT use as the default path — that stays image_local_generate (Z-Image). Do NOT use when the image must contain legible Korean text — Hangul still goes to gpt_image_text2img (measured: local engines break jamo). Do NOT POST /v1/load-model with default:true; this tool never does that, because it would steal the chat model the app is serving. Shares the GPU with Z-Image (32–39GB peak) and LTX video — don't run them together.
Requires Apple Silicon, macOS 26.2+, and MLX Core.app or mlx-serve on PATH (or MLX_SERVE_URL). A non-loopback bind may need MLX_SERVE_API_KEY.

Returns: a text block with the saved .png path, model, size, and generation time.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Image generation prompt (max 32,000 characters). English recommended; do not ask for Korean text in the image.',
          maxLength: 32000,
        },
        model: {
          type: 'string',
          description: 'mlx-serve model id from GET /v1/models. Omit to pick the first ready model that advertises capability "image". This plugin does not download weights.',
        },
        width: {
          type: 'number',
          description: `Width in pixels (default: ${DEFAULT_MLX_IMAGE_SIZE}). ${MIN_MLX_IMAGE_DIMENSION}–${MAX_MLX_IMAGE_DIMENSION}, multiple of ${MLX_IMAGE_DIMENSION_STEP}. FLUX.2-klein is fixed at 1024×1024 — pick a Krea/Mage-Flow model for other sizes. For 9:16 use 1088×1920, not 1080×1920.`,
          minimum: MIN_MLX_IMAGE_DIMENSION,
          maximum: MAX_MLX_IMAGE_DIMENSION,
          default: DEFAULT_MLX_IMAGE_SIZE,
        },
        height: {
          type: 'number',
          description: `Height in pixels (default: ${DEFAULT_MLX_IMAGE_SIZE}). Same constraints as width.`,
          minimum: MIN_MLX_IMAGE_DIMENSION,
          maximum: MAX_MLX_IMAGE_DIMENSION,
          default: DEFAULT_MLX_IMAGE_SIZE,
        },
        steps: {
          type: 'number',
          description: 'Diffusion steps 1–50. Omit to use the loaded model\'s default.',
          minimum: 1,
          maximum: 50,
        },
        seed: {
          type: 'number',
          description: 'Random seed. Omit for a random seed.',
          minimum: 0,
        },
        imagePath: {
          type: 'string',
          description: 'Optional source image for img2img. Absolute path; sent as base64. Pair with strength.',
        },
        strength: {
          type: 'number',
          description: 'img2img denoise strength 0–1. Only used when imagePath is set.',
          minimum: 0,
          maximum: 1,
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the image (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the image (default: mlx_image_<timestamp>.png)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'mlx_image_edit',
    title: 'Image edit (local · MLX Core)',
    annotations: HINT.generateLocal,
    description: `Edit an existing image on this machine via MLX Core / mlx-serve. Posts JSON to /v1/images/generations with mode:"edit" (not multipart /v1/images/edits). No vendor bill. This plugin never launches the app.

Use when you have a source PNG to change and MLX Core is running with an image-edit model. Up to ${MAX_MLX_IMAGE_REFS} extra reference images (refImagePaths). image_local_generate (Z-Image) has no edit lane, so this is the local alternative to gpt_image_img2img.
Do NOT use for text-to-image from scratch — use mlx_image_generate or image_local_generate. Do NOT use when the result must contain legible Korean text — that stays gpt_image_img2img / gpt_image_text2img. Do NOT treat this as the default image path.
Requires Apple Silicon, macOS 26.2+, and MLX Core.app or mlx-serve on PATH (or MLX_SERVE_URL). brew install --cask mlx-core if :11234 is down.

Returns: a text block with the saved .png path, model, and generation time.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Edit instruction (max 32,000 characters)',
          maxLength: 32000,
        },
        imagePath: {
          type: 'string',
          description: 'Absolute path to the source image to edit. Required.',
        },
        refImagePaths: {
          type: 'array',
          items: { type: 'string' },
          description: `Optional extra reference images (max ${MAX_MLX_IMAGE_REFS}). Absolute paths.`,
          maxItems: MAX_MLX_IMAGE_REFS,
        },
        model: {
          type: 'string',
          description: 'mlx-serve model id. Omit to pick a ready image model.',
        },
        width: {
          type: 'number',
          description: `Output width. ${MIN_MLX_IMAGE_DIMENSION}–${MAX_MLX_IMAGE_DIMENSION}, multiple of ${MLX_IMAGE_DIMENSION_STEP}. Omit to keep the source size.`,
          minimum: MIN_MLX_IMAGE_DIMENSION,
          maximum: MAX_MLX_IMAGE_DIMENSION,
        },
        height: {
          type: 'number',
          description: 'Output height. Same constraints as width. Send both width and height, or neither.',
          minimum: MIN_MLX_IMAGE_DIMENSION,
          maximum: MAX_MLX_IMAGE_DIMENSION,
        },
        steps: {
          type: 'number',
          description: 'Diffusion steps 1–50. Omit for the model default.',
          minimum: 1,
          maximum: 50,
        },
        seed: {
          type: 'number',
          description: 'Random seed. Omit for a random seed.',
          minimum: 0,
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the image (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the image (default: mlx_edit_<timestamp>.png)',
        },
      },
      required: ['prompt', 'imagePath'],
    },
  },

  // ── Video generation (Google Veo 3.1 — ported from the fect-mcp video module) ──────────
  {
    name: 'veo_text2video',
    title: 'Video generation (text → video)',
    annotations: HINT.generate,
    description: `Generate a video with native audio from a text prompt using Google Veo 3.1.

Use when the user asks to create, generate, or make a video, clip, footage, or short ad from a description alone (비디오 생성, 영상 만들어줘). Audio is generated natively: wrap dialogue in double quotes, and describe SFX ("engine roaring") and ambient sound explicitly in the prompt.
Do NOT use when a source visual exists — use veo_img2video to animate a still image, veo_extension to continue a Veo-generated video, or veo_reference to keep a specific subject consistent from photos.
Prefer seedance_text2video when you need a length off Veo's 4/6/8-second grid, a ratio other than 16:9 or 9:16, or a much cheaper silent shot; keep Veo when native dialogue audio is the point.
Cost lever: the default is now fast ($0.10/s at 720p) because blind-arena Elo shows no measurable quality gap between the tiers; drop to lite ($0.05/s) whenever 4k, extension, and reference images are not needed. Generation is asynchronous and typically takes 1-6 minutes.

Returns: a text block with the saved .mp4 file path, model, aspect ratio, resolution, and duration in seconds. Videos carry an invisible SynthID watermark.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Descriptive text prompt for video generation (English recommended)',
        },
        negativePrompt: VEO_NEGATIVE_PROMPT_PROPERTY,
        model: VEO_MODEL_PROPERTY,
        aspectRatio: {
          type: 'string',
          description: 'Aspect ratio of the generated video (default: "16:9")',
          enum: ['16:9', '9:16'],
          default: '16:9',
        },
        resolution: VEO_RESOLUTION_PROPERTY,
        durationSeconds: VEO_DURATION_PROPERTY,
        outputPath: {
          type: 'string',
          description: 'Directory path to save the generated video (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the generated video (default: video_<timestamp>.mp4)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'veo_img2video',
    title: 'Video generation (image → video)',
    annotations: HINT.generate,
    description: `Animate a still image into a video (first frame, or first+last frame interpolation) using Google Veo 3.1.

Use when the user provides an image to bring to life, animate, or add motion to (이미지로 영상 만들기) — e.g. animate a product photo. Provide sourceImagePath as the first frame; optionally add lastImagePath for a smooth transition between two images. The prompt should describe the desired motion.
Do NOT use for pure text-to-video (use veo_text2video), continuing an existing video (use veo_extension), or subject consistency from reference photos (use veo_reference).
For a silent b-roll shot from an already-generated background, seedance_img2video bills only the seconds you ask for — a 4-second 1080p shot runs about $0.23 silent against $0.64 on veo-3.1-lite, which must bill 8 seconds at 1080p and cannot turn audio off. Stay on Veo when the clip needs native audio or a later veo_extension.
Person policy, measured 2026-08-15: an adult photoreal face in the source image passes here and holds for the clip, while Seedance 2.x rejects the very same file — so this is the image lane for photoreal people. A face that reads as a MINOR is blocked whether it arrives as a photo or an illustration (Support code 17301594); blocked generations are not billed, so redraw the cut instead of hunting for a way around it.
For composition control — a subject appearing, vanishing, or changing pose exactly as drawn — pass lastImagePath. Reference images (veo_reference) carry appearance, not layout.
Generation is asynchronous and typically takes 1-6 minutes.

Returns: a text block with the saved .mp4 file path, source/last frame image paths, model, aspect ratio, resolution, and duration in seconds.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description for video animation/motion',
        },
        negativePrompt: VEO_NEGATIVE_PROMPT_PROPERTY,
        sourceImagePath: {
          type: 'string',
          description: 'Absolute path to the first frame (starting) image file',
        },
        lastImagePath: {
          type: 'string',
          description: 'Optional: Absolute path to the last frame (ending) image file. When provided, the video will smoothly transition from the first image to this last image.',
        },
        model: VEO_MODEL_PROPERTY,
        aspectRatio: {
          type: 'string',
          description: 'Aspect ratio of the generated video (default: "16:9")',
          enum: ['16:9', '9:16'],
          default: '16:9',
        },
        resolution: VEO_RESOLUTION_PROPERTY,
        durationSeconds: VEO_DURATION_PROPERTY,
        outputPath: {
          type: 'string',
          description: 'Directory path to save the generated video (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the generated video (default: video_<timestamp>.mp4)',
        },
      },
      required: ['prompt', 'sourceImagePath'],
    },
  },
  {
    name: 'veo_extension',
    title: 'Video extension (+7s)',
    annotations: HINT.generate,
    description: `Extend a Veo-generated video by adding 7 seconds of new content per call.

Use when the user asks to continue, lengthen, or extend a video that was previously generated by Veo (비디오 연장, 이어서 만들기). Up to 20 extensions per video; input must be a Veo output at 720p, 16:9, and 141 seconds or shorter. A 9:16 vertical clip is refused outright (\`Aspect ratio of the input video must be 16:9, but got: 9:16\`, measured 2026-09-06) — a vertical short cannot be lengthened this way, so shoot the extra seconds as separate cuts.
The API extends the copy it still holds on its own server, not the bytes of your file: the clip must have been generated by one of these veo_* tools and still carry its \`<name>.mp4.veo.json\` handle, which the server keeps for 48 hours. A clip with no handle, or one downloaded from anywhere else, cannot be extended at all — generate it again.
Do NOT use on videos not generated by Veo, and do NOT use the lite model (unsupported). For a brand-new scene use veo_text2video instead. Seedance has no equivalent for local files — its video input accepts only public URLs — so extension of a local clip always lands here.
Output is always 720p and keeps the input's 16:9. Voice cannot be effectively extended if absent from the last 1 second of the input. Takes 1-6 minutes.

Returns: a text block with the saved .mp4 file path, source video path, model, resolution, and the added duration (+7 seconds).`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description for the video continuation',
        },
        negativePrompt: VEO_NEGATIVE_PROMPT_PROPERTY,
        sourceVideoPath: {
          type: 'string',
          description: 'Absolute path to the source video file to extend (must be a Veo-generated 720p video, 141 seconds or shorter, saved with its .veo.json handle)',
        },
        sourceVideoUri: {
          type: 'string',
          description: 'Files API uri of the source clip (https://generativelanguage.googleapis.com/v1beta/files/...). Only needed when the .veo.json handle beside the file is missing — normally leave it out.',
        },
        model: {
          type: 'string',
          description: 'Veo model (default: "veo-3.1-fast-generate-preview"). The lite model does NOT support extension. Blind-arena Elo has fast and standard statistically tied, so standard only buys 4k here.',
          enum: ['veo-3.1-generate-preview', 'veo-3.1-fast-generate-preview'],
          default: 'veo-3.1-fast-generate-preview',
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the extended video (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the extended video (default: video_extended_<timestamp>.mp4)',
        },
      },
      required: ['prompt', 'sourceVideoPath'],
    },
  },
  {
    name: 'veo_reference',
    title: 'Video generation (reference images · fixed 8s)',
    annotations: HINT.generate,
    description: `Generate an 8-second video that keeps subjects from 1-3 reference images consistent, using Google Veo 3.1.

Use when the user wants a video featuring a specific person, character, product, or garment shown in reference photos — fashion videos, brand/product marketing, consistent character animation (캐릭터 일관성, 제품 영상). Provide 1-3 clear, well-lit reference images (multiple angles improve consistency) and a detailed prompt describing the scene and interactions.
Do NOT use the lite model (unsupported). To animate a single image as-is use veo_img2video; for free-form generation use veo_text2video.
This is the reference tool for REAL people — Seedance's seedance_reference rejects real human faces, while it accepts far more reference images (up to 30) and a free duration, so route drawn characters and products there. The person policy here is documented as the same allow_adult contract veo_img2video runs under, but it is unmeasured on this mode; only the image lane was probed.
Reference images are ASSET only: they preserve ONE subject's appearance, NOT the layout of the picture. For a cut that must match a drawn composition use veo_img2video with sourceImagePath + lastImagePath. Veo 3.1 has no style reference at all — the official docs send style images to the experimental veo-2.0 model, so route sketch or toon style transfer to seedance_reference instead.
Duration is fixed at 8 seconds when reference images are used. Takes 1-6 minutes.

Returns: a text block with the saved .mp4 file path, reference image list, model, aspect ratio, resolution, and duration.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed text description of the video scene and subject interactions',
        },
        negativePrompt: VEO_NEGATIVE_PROMPT_PROPERTY,
        referenceImagePaths: {
          type: 'array',
          items: {
            type: 'string',
          },
          minItems: 1,
          maxItems: 3,
          description: 'Array of 1-3 absolute paths to reference images. These images guide the video generation to preserve subject appearance.',
        },
        model: {
          type: 'string',
          description: 'Veo model (default: "veo-3.1-fast-generate-preview"). The lite model does NOT support reference images. Blind-arena Elo has fast and standard statistically tied, so standard only buys 4k here.',
          enum: ['veo-3.1-generate-preview', 'veo-3.1-fast-generate-preview'],
          default: 'veo-3.1-fast-generate-preview',
        },
        aspectRatio: {
          type: 'string',
          description: 'Aspect ratio of the generated video (default: "16:9")',
          enum: ['16:9', '9:16'],
          default: '16:9',
        },
        resolution: VEO_RESOLUTION_PROPERTY,
        outputPath: {
          type: 'string',
          description: 'Directory path to save the generated video (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the generated video (default: video_ref_<timestamp>.mp4)',
        },
      },
      required: ['prompt', 'referenceImagePaths'],
    },
  },

  // ── Video generation (Gemini Omni 1.1 Flash — the Interactions API lane) ──────────
  {
    name: 'omni_text2video',
    title: 'Omni video generation (text → video)',
    annotations: HINT.generate,
    description: `Generate a video with native audio from a text prompt using Gemini Omni 1.1 Flash.

Use when the shot needs a length off Veo's 4/6/8 grid (any whole 3-10 seconds), or when the cut will be edited or extended afterwards — omni_edit and omni_extend continue from the interactionId this returns.
Do NOT use when a source visual exists — omni_img2video animates a still, omni_extend continues a clip, omni_edit rewrites one.
COST, measured 2026-09-06: this model bills a FLAT ~$1.01 per call, not per second. A 3-second 360p draft costs the same as a full 10-second 4k render, and more than a whole 8-second veo-3.1-lite shot ($0.40). So never call it for a draft or a short cut — go to veo_text2video or seedance_text2video for those, and come here when you need the full 10 seconds, an off-grid length, or the edit lane. Ask for the seconds you actually want; a shorter clip refunds nothing.
Audio is always generated and cannot be turned off: wrap dialogue in double quotes and name SFX and ambience in the prompt. There is no negative-prompt field on this model — write exclusions as positive description instead.

Returns: a text block with the saved .mp4 path, the interaction id to continue from, resolution, aspect ratio, and duration.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Descriptive text prompt for video generation (English recommended)',
        },
        aspectRatio: OMNI_ASPECT_RATIO_PROPERTY,
        resolution: OMNI_RESOLUTION_PROPERTY,
        durationSeconds: OMNI_DURATION_PROPERTY,
        seed: {
          type: 'number',
          description: 'Optional decoding seed for reproducibility.',
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the generated video (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the generated video (default: omni_<timestamp>.mp4)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'omni_img2video',
    title: 'Omni video generation (image → video)',
    annotations: HINT.generate,
    description: `Animate a still image, or interpolate between two images, using Gemini Omni 1.1 Flash.

Use when a generated background or photo has to move and the cut wants an off-grid length, or will be edited afterwards. Pass sourceImagePath as the first frame; add lastImagePath and the model renders the transition between the two. Billing is a flat ~$1.01 per call regardless of length or resolution, so a short cut is cheaper on veo_img2video or seedance_img2video.
Do NOT use for pure text-to-video (omni_text2video) or for continuing an existing clip (omni_extend).
veo_img2video remains the lane for a photoreal adult face, whose policy is measured there; Omni's person policy is unmeasured, so route people to Veo until it is. For silent b-roll at a length you pick, seedance_img2video is cheaper still.
Composition control lives here — a subject appearing, vanishing, or ending in an exact pose — because both frames are yours.

Returns: a text block with the saved .mp4 path, the interaction id to continue from, the source frames, resolution, aspect ratio, and duration.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description of the motion to add',
        },
        sourceImagePath: {
          type: 'string',
          description: 'Absolute path to the first frame (starting) image file',
        },
        lastImagePath: {
          type: 'string',
          description: 'Optional: absolute path to the last frame image. When given, the video renders the transition from the first image to this one.',
        },
        aspectRatio: OMNI_ASPECT_RATIO_PROPERTY,
        resolution: OMNI_RESOLUTION_PROPERTY,
        durationSeconds: OMNI_DURATION_PROPERTY,
        seed: {
          type: 'number',
          description: 'Optional decoding seed for reproducibility.',
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the generated video (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the generated video (default: omni_<timestamp>.mp4)',
        },
      },
      required: ['prompt', 'sourceImagePath'],
    },
  },
  {
    name: 'omni_extend',
    title: 'Omni video extension (3-10s per call, 40s cumulative)',
    annotations: HINT.generate,
    description: `Continue a clip with Gemini Omni 1.1 Flash, adding 3-10 seconds of new content per call.

Use when a shot has to run longer than one generation. Name the source exactly one of two ways: previousInteractionId, from an earlier omni_* call in this session, or sourceVideoPath, a local mp4 of at most 10 seconds. Google caps the cumulative length at 40 seconds.
Do NOT expect only the new tail back — the saved file is the WHOLE cut, input included (measured: a 3s clip extended by 8s came back 11s), so do not concatenate it onto the source yourself.
Against veo_extension: that one adds a fixed 7s, takes only Veo output, and needs a Veo model tier; this one takes any mp4 you have, adds a length you pick, and works on Omni output. Each call is a flat ~$1.01 whatever it adds, so add the full 10 seconds when you can. Aspect ratio is not settable here — the input video's ratio wins.

Returns: a text block with the saved .mp4 path, the new interaction id, the source, and the seconds added.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'What happens next — describe the continuation ("the camera keeps pushing in as the door opens").',
        },
        previousInteractionId: {
          type: 'string',
          description: 'Interaction id returned by an earlier omni_* call. Give this OR sourceVideoPath, not both.',
        },
        sourceVideoPath: {
          type: 'string',
          description: 'Absolute path to a local mp4 of at most 10 seconds. Give this OR previousInteractionId, not both.',
        },
        resolution: OMNI_RESOLUTION_PROPERTY,
        durationSeconds: {
          type: 'number',
          description: 'Seconds of NEW content to add, 3 to 10 (default: 8). The returned file is the whole cut, so it runs source + this.',
          minimum: 3,
          maximum: 10,
          default: 8,
        },
        seed: {
          type: 'number',
          description: 'Optional decoding seed for reproducibility.',
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the extended video (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the extended video (default: omni_<timestamp>.mp4)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'omni_edit',
    title: 'Omni video edit (instruction, same length)',
    annotations: HINT.generate,
    description: `Rewrite what is inside a clip by instruction, keeping its length, using Gemini Omni 1.1 Flash.

Use when a generated cut is right in movement and framing but wrong in content — swap an object, change a colour, drop something from the frame — instead of re-rolling the whole shot and losing the camera move. State the change plainly ("change the persimmon to a green apple, keep the camera move identical"). Source is exactly one of previousInteractionId (an earlier omni_* call) or sourceVideoPath (a local mp4 of at most 10 seconds).
Do NOT use to make a clip longer — that is omni_extend. Veo has no instruction-edit lane at all, so a Veo clip that needs one comes here by file path.
The output runs the same length as the input (measured 3.008s in, 3.008s out); aspect ratio is inherited and not settable. Each edit is a fresh generation billed at the flat ~$1.01, not a cheap patch — two edits cost more than re-rolling the shot on Veo.

Returns: a text block with the saved .mp4 path, the new interaction id, and the source.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The change to make, stated plainly. Say what to keep as well as what to change.',
        },
        previousInteractionId: {
          type: 'string',
          description: 'Interaction id returned by an earlier omni_* call. Give this OR sourceVideoPath, not both.',
        },
        sourceVideoPath: {
          type: 'string',
          description: 'Absolute path to a local mp4 of at most 10 seconds. Give this OR previousInteractionId, not both.',
        },
        resolution: OMNI_RESOLUTION_PROPERTY,
        seed: {
          type: 'number',
          description: 'Optional decoding seed for reproducibility.',
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the edited video (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the edited video (default: omni_<timestamp>.mp4)',
        },
      },
      required: ['prompt'],
    },
  },

  // ── Video generation (ByteDance Seedance — BytePlus ModelArk) ─────────────
  // The second engine sharing Veo's slot. The source of truth for which to use
  // when is skills/produce/references/video-model-selection.md.
  {
    name: 'seedance_text2video',
    title: 'Video generation (text → video, Seedance)',
    annotations: HINT.generate,
    description: `Generate a video from a text prompt using ByteDance Seedance (BytePlus ModelArk).

Use when you need a clip that Veo's fixed 4/6/8-second grid cannot express — an odd length (2-30 seconds, any whole second), a 21:9 or 4:3 frame, or simply the cheapest possible shot: a silent 9:16 1080p 5-second clip costs about $0.24 on seedance-1-0-pro-fast, against $0.64 on veo-3.1-lite and $0.96 on veo-3.1-fast (Veo forces an 8-second bill at 1080p and always includes audio). Korean prompts are understood only by dreamina-seedance-2-5; every other model expects English.
Do NOT use when you need Veo's native dialogue audio quality or its +7s extension of an existing clip — veo_text2video and veo_extension keep those. When a source visual already exists use seedance_img2video, and for subject consistency from photos use seedance_reference.
Model choice drives both price and limits; read the model parameter before overriding the default. Generation is asynchronous and typically takes 1-6 minutes.

Returns: a text block with the saved .mp4 file path, model, ratio, resolution, duration, and the billed completion token count.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Video description. Vendor formula: Subject + Movement + Environment + Camera movement + Aesthetic description + Sound. Write camera as a span, not a verb — "starting frame composition + movement + movement amplitude + ending frame composition" (combos the docs name: Hitchcock = dolly-in/out + zoom-out/in, bullet time = time slowdown + surround). Shot size follows the example word order, "Close-up of the man on the left". Do NOT write timecodes such as "0-3 seconds" — the vendor states precise-timing support is unstable and forcing it degrades the result; cut timing in the edit instead, and write an in-clip state change in words ("in under half a second"). Multi-cut in one call is supported via "Shot 1: ... Shot 2: ..." or "The shot cuts to ..." — open on the wide so the later cuts inherit one floor plan, time each cut by a dialogue or action beat, and give each its own shot size. There is no negativePrompt parameter on this engine: an unwanted element is designed out of the sentence, never forbidden in it, and what must hold goes into a closing positive-locks paragraph ("the lantern stays lit in every cut; only two people ever appear") — the one exception the vendor templates is the artifact classes (subtitles, on-frame text, logo, watermark, BGM), which may stay negative. Prompt body must be English or Chinese (Korean only on dreamina-seedance-2-5-260628) — Korean dialogue still works inside quotes on 1.5-pro, which lip-syncs it.',
        },
        model: SEEDANCE_MODEL_PROPERTY,
        ratio: {
          type: 'string',
          description: 'Aspect ratio of the generated video (default: "16:9"). "adaptive" lets the model pick.',
          enum: SEEDANCE_RATIO_VALUES,
          default: '16:9',
        },
        resolution: SEEDANCE_RESOLUTION_PROPERTY,
        durationSeconds: SEEDANCE_DURATION_PROPERTY,
        generateAudio: SEEDANCE_AUDIO_PROPERTY,
        watermark: SEEDANCE_WATERMARK_PROPERTY,
        seed: SEEDANCE_SEED_PROPERTY,
        cameraFixed: SEEDANCE_CAMERA_FIXED_PROPERTY,
        outputPath: {
          type: 'string',
          description: 'Directory path to save the generated video (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the generated video (default: video_<timestamp>.mp4)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'seedance_img2video',
    title: 'Video generation (image → video, Seedance)',
    annotations: HINT.generate,
    description: `Animate a still image into a video (first frame, or first+last frame interpolation) using ByteDance Seedance.

Use for the cheap b-roll lane of this pipeline: animating an already-generated cover or point background PNG. ratio defaults to "adaptive" so the source image is not center-cropped — pass an explicit ratio only when you intend a different frame. Billing follows the requested duration, so ask for the length you will actually cut in.
The default model (seedance-1-5-pro) accepts photoreal human faces. The dreamina-seedance-2.5/2.0 models REJECT input images containing real human faces, so never route a photoreal-person background through them.
Do NOT use for pure text-to-video (use seedance_text2video) or for subject consistency across several photos (use seedance_reference). Veo's veo_img2video remains the choice when you want its native audio or Veo-only extension afterwards.

Returns: a text block with the saved .mp4 file path, source/last frame image paths, model, ratio, resolution, duration, and the billed completion token count.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Identity words stay, layout words go — the Seedance image lane is not motion-only (that is Veo\'s rule). Reuse the source image prompt\'s identity words (who and what the subject is), drop the composition words (where things sit — the frame already holds that), add the motion, write camera as a span ("starting frame composition + movement + ending frame composition"), and CLOSE WITH A CONSISTENCY LOCK: "the subject stays exactly consistent with the input frame; appearance, proportions and materials hold; no unrelated elements appear". Re-describe the layout, facing or lighting and the model redesigns the scene. Do NOT write timecodes such as "0-3 seconds" (vendor: precise-timing support is unstable) — an in-clip state change goes in words ("in under half a second"), and the length lives in durationSeconds. English or Chinese only (Korean on dreamina-seedance-2-5 alone, and inside dialogue quotes on 1.5-pro). There is no negativePrompt parameter on this engine: an unwanted element is designed out of the sentence and pinned by the lock, never forbidden in it — the one exception the vendor templates is the artifact classes (subtitles, on-frame text, logo, watermark, BGM), which may stay negative.',
        },
        sourceImagePath: {
          type: 'string',
          description: 'Absolute path to the first frame (starting) image file',
        },
        lastImagePath: {
          type: 'string',
          description: 'Optional: Absolute path to the last frame (ending) image file for a smooth interpolation. Not supported by seedance-1-0-pro-fast-251015 (first frame only).',
        },
        model: SEEDANCE_MODEL_PROPERTY,
        ratio: {
          type: 'string',
          description: 'Aspect ratio of the generated video (default: "adaptive" — follows the source image). A different value makes the server center-crop your image.',
          enum: SEEDANCE_RATIO_VALUES,
          default: 'adaptive',
        },
        resolution: SEEDANCE_RESOLUTION_PROPERTY,
        durationSeconds: SEEDANCE_DURATION_PROPERTY,
        generateAudio: SEEDANCE_AUDIO_PROPERTY,
        watermark: SEEDANCE_WATERMARK_PROPERTY,
        seed: SEEDANCE_SEED_PROPERTY,
        cameraFixed: SEEDANCE_CAMERA_FIXED_PROPERTY,
        outputPath: {
          type: 'string',
          description: 'Directory path to save the generated video (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the generated video (default: video_<timestamp>.mp4)',
        },
      },
      required: ['prompt', 'sourceImagePath'],
    },
  },
  {
    name: 'seedance_reference',
    title: 'Video generation (reference images, Seedance 2.x)',
    annotations: HINT.generate,
    description: `Generate a video that keeps subjects from reference images consistent, using Dreamina Seedance 2.x.

Use when a character, product, or garment must stay the same across the shot and you have several photos of it (캐릭터 일관성, 제품 영상). dreamina-seedance-2-5-260628 takes 1-30 reference images and up to 30 seconds; the 2.0 series takes 1-9 and up to 15 seconds. Unlike veo_reference the length is not pinned to 8 seconds.
Do NOT pass reference images containing real human faces — the 2.x models reject them; use veo_reference for real people. The seedance-1-5-pro and 1.0 models do not accept reference images at all and are rejected before the call. These models also need account balance > $30 to activate.
References carry the artistic STYLE through along with the subject. That is the feature when you want a sketch or toon look transferred — this is the only style-transfer lane in the plugin, since Veo 3.1 dropped style references — and a defect when you only wanted the layout: a storyboard frame passed here returns its drawing style, not its composition. For composition use seedance_img2video with sourceImagePath + lastImagePath.
Do NOT feed a three-view or multi-view character sheet. ByteDance's own docs advise against it twice: the model reads the separate angles as separate people, which worsens identity drift and produces duplicate characters in one frame. Send a headshot (face only, neutral expression, minimal shoulders and background) plus one full-body shot instead — the docs call those two sufficient. Order is weight: put the asset that must be matched most precisely first in the array.
Reference AUDIO gives a character a fixed voice. Pass the clip in referenceAudioPaths with generateAudio: true and bind it in the prompt the way the 2.5 guide does — "Images 1-2 are Character 1 and correspond to Audio 1; Image 3 is Character 2 and speaks with the voice of Audio 2" (@Image N and @Audio N are each list's own order). Route this to dreamina-seedance-2-5-260628: only its guide documents the per-character mapping and only it takes audio-only input; the 2.0 series takes at most 3 clips and needs an image alongside. A channel character's fixed voice sample lives at data/<channel>/assets/characters/<id>/voice.wav. Veo has no audio reference at all.
Reference VIDEO hands over camera movement, blocking and motion timing — the Blender previz lane (blender_render_previz → referenceVideoPaths). The vendor's own "3D clay-model reference" recipe: a grey primitive render, each actor its own flat colour, no stamp or gizmos, 24 fps, a whole number of seconds equal to durationSeconds; the styled source still goes first in referenceImagePaths ("Image 1 is the first frame" — first_frame cannot be mixed with a reference video); the prompt names "Video 1" as the ONLY reference for camera, shot rhythm, subject trajectory and blocking, maps each coloured model to its Image, and says "Do not reference its visual content". The vendor takes video by public URL only, so a local file is published for the life of the task — through MEDIA_UPLOAD_URL when set, else a cloudflared quick tunnel — and released afterwards. Input seconds are billed alongside output seconds at a lower per-token rate.

Returns: a text block with the saved .mp4 file path, reference image, video and audio lists, model, ratio, resolution, duration, and the billed completion token count.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Scene and subject interactions. The 2.x advanced formula: precise subject + action details + scene/environment + lighting & color tone + camera movement + visual style + image quality + constraints. For multi-cut, write a "Shot 1 / Shot 2 / Shot 3" storyboard and order each shot as camera movement -> subject action and expression -> position change -> audio; open on the wide so the later cuts inherit one floor plan, and time each cut by an action beat. Do NOT put timecodes on the shots — the vendor states precise-timing support is unstable (dreamina-seedance-2-5-260628 alone takes integer-second forms). Close with the constraints slot as a POSITIVE-LOCKS paragraph — what holds in every frame, said positively, with each reference given its scope ("@ocean_location controls water and sky only"; "the lantern stays lit in every cut") — because this engine has no negativePrompt parameter; the one exception the vendor templates is the artifact classes (subtitles, on-frame text, logo, watermark, BGM), which may stay negative. English or Chinese only (Korean on dreamina-seedance-2-5-260628 alone; on other models Korean belongs inside dialogue quotes). Unwanted subtitles cannot be fully blocked at 9:16: the vendor notes portrait output hallucinates burned-in text noticeably more often than landscape, so inspect the frames.',
        },
        referenceImagePaths: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 30,
          description: 'Absolute paths to reference images guiding subject appearance — up to 30 for dreamina-seedance-2-5-260628, up to 9 for the 2.0 series. Must not contain real human faces. May be left out only on dreamina-seedance-2-5-260628 when referenceAudioPaths carries the reference; the 2.0 series needs at least one image.',
        },
        referenceVideoPaths: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 10,
          description: 'Absolute paths to local reference videos — the Blender previz lane (blender_render_previz output as the vendor\'s clay-model reference) — mp4 or mov (H.264/H.265), 200MB each at most, 24–60 fps, 407,696–8,295,044 pixels a frame (720×1280 and 1080×1920 both pass). dreamina-seedance-2-5-260628 takes up to 10 clips of 2–30s (30s total); the 2.0 series up to 3 clips of 2–15s (15s total). Checked with ffprobe before anything is published or billed. Each file is served to the vendor through MEDIA_UPLOAD_URL (+ MEDIA_UPLOAD_API_KEY) when set, otherwise through a cloudflared quick tunnel for the life of the task. @Video N in the prompt is the Nth entry here (referenceVideoUrls continue the numbering after these). No real human faces — the same moderation as images.',
        },
        referenceVideoUrls: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 10,
          description: 'Already-public https URLs of reference videos (or asset://<id> library assets), numbered after referenceVideoPaths. Same limits as referenceVideoPaths, but a URL clip is not probed here — its length and frame size are checked only by the vendor, and its seconds still count against the model total and the bill.',
        },
        referenceAudioPaths: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 10,
          description: 'Absolute paths to reference audio clips — wav or mp3, 15MB each at most (prefer wav: the mp3 data-URI label is unverified against a live call). What the clip carries is what the model imitates: a voice (its timbre — the character then speaks in that voice), or dialogue and music content it lip-syncs to and follows. Limits: dreamina-seedance-2-5-260628 takes up to 10 clips of 2-30s (30s total) and may be audio-only; the 2.0 series takes up to 3 clips of 2-15s (15s total) and needs a reference image alongside. The vendor recommends 5-10s per voice. Requires generateAudio: true. Numbering: @Audio N in the prompt is the Nth entry here and @Image N the Nth of referenceImagePaths — bind them in the prompt ("Images 1-2 are Character 1 and correspond to Audio 1; Image 3 is Character 2 and speaks with the voice of Audio 2"). This is imitation, not cloning: the vendor\'s own FAQ says the result can drift from the reference, and its fix is to also describe the voice in words (gender, age, texture, pace, mood) and keep the lines in the reference\'s tone.',
        },
        model: {
          type: 'string',
          description: `Seedance model (default: "${DEFAULT_SEEDANCE_REFERENCE_MODEL}" — the only reference-capable model with independent quality data: rank 1 on the Artificial Analysis blind image-to-video arena, and it also outputs 1080p and 4k). Only the 2.x models accept reference images. Switch to dreamina-seedance-2-5-260628 when you actually need more than 9 reference images or more than 15 seconds — it is untested in every public arena, so do not pick it for a shot that matters without comparing first. fast and mini trade quality for cost and are likewise untested.`,
          enum: [...SEEDANCE_REFERENCE_MODELS],
          default: DEFAULT_SEEDANCE_REFERENCE_MODEL,
        },
        ratio: {
          type: 'string',
          description: 'Aspect ratio of the generated video (default: "adaptive").',
          enum: SEEDANCE_RATIO_VALUES,
          default: 'adaptive',
        },
        resolution: SEEDANCE_RESOLUTION_PROPERTY,
        durationSeconds: SEEDANCE_DURATION_PROPERTY,
        generateAudio: {
          ...SEEDANCE_AUDIO_PROPERTY,
          description: `${SEEDANCE_AUDIO_PROPERTY.description} Must be true when referenceAudioPaths is set — a voice reference into a silent clip is rejected before the call.`,
        },
        watermark: SEEDANCE_WATERMARK_PROPERTY,
        outputPath: {
          type: 'string',
          description: 'Directory path to save the generated video (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the generated video (default: video_ref_<timestamp>.mp4)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'mlx_video_generate',
    title: 'Video generation (local · MLX Core)',
    annotations: HINT.generateLocal,
    description: `Generate a video on this machine via MLX Core / mlx-serve. The server returns raw rgb8 frames (plus optional PCM), which this tool muxes to mp4 with ffmpeg (libx264 yuv420p). No vendor bill. This plugin never launches the app.

Use as an optional local clip when MLX Core is running with a video model (LTX-2). Default canvas is ${DEFAULT_MLX_VIDEO_WIDTH}×${DEFAULT_MLX_VIDEO_HEIGHT} at ${DEFAULT_MLX_VIDEO_FRAMES} frames / ${MLX_VIDEO_FPS} fps (~2s). Width/height must be a multiple of ${MLX_VIDEO_DIMENSION_STEP} (two-stage LTX grid) — 1080 is not on that grid; use 1088×1920 or the default. Decoded RGB is capped at ${Math.round(MAX_VIDEO_RGB_BYTES / (1024 * 1024))}MB — 1088×1920 at 8s/24fps is ~1.2GB and is refused. lastFrameImagePath needs at least ${MIN_MLX_VIDEO_FRAMES} frames.
Do NOT use this as the default generated-video path — that stays veo_* / seedance_* per video-model-selection.md. Do NOT put this tool on the Veo/Seedance face-policy table; it is a separate local engine. Output is ${MLX_VIDEO_FPS} fps; produce's builder is 30 fps, so a splice re-encodes. ffmpeg must be on PATH. Shares the GPU with Z-Image and the chat model — LTX wants 24GB+ on its own.
Requires Apple Silicon, macOS 26.2+, MLX Core.app or mlx-serve (or MLX_SERVE_URL), and ffmpeg. brew install --cask mlx-core if :11234 is down.

Returns: a text block with the saved .mp4 path, model, size, frame count, fps, and whether audio was muxed.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Motion prompt (max 32,000 characters). English. Describe motion, not a still.',
          maxLength: 32000,
        },
        model: {
          type: 'string',
          description: 'mlx-serve model id. Omit to pick a ready model that advertises capability "video".',
        },
        width: {
          type: 'number',
          description: `Width (default: ${DEFAULT_MLX_VIDEO_WIDTH}). ${MIN_MLX_VIDEO_DIMENSION}–${MAX_MLX_VIDEO_DIMENSION}, multiple of ${MLX_VIDEO_DIMENSION_STEP}. 1080 is not on the grid.`,
          minimum: MIN_MLX_VIDEO_DIMENSION,
          maximum: MAX_MLX_VIDEO_DIMENSION,
          default: DEFAULT_MLX_VIDEO_WIDTH,
        },
        height: {
          type: 'number',
          description: `Height (default: ${DEFAULT_MLX_VIDEO_HEIGHT}). Same constraints as width.`,
          minimum: MIN_MLX_VIDEO_DIMENSION,
          maximum: MAX_MLX_VIDEO_DIMENSION,
          default: DEFAULT_MLX_VIDEO_HEIGHT,
        },
        numFrames: {
          type: 'number',
          description: `Frame count (default: ${DEFAULT_MLX_VIDEO_FRAMES}). ${MIN_MLX_VIDEO_FRAMES}–${MAX_MLX_VIDEO_FRAMES} at ${MLX_VIDEO_FPS} fps. last_frame interpolation needs at least ${MIN_MLX_VIDEO_FRAMES}.`,
          minimum: MIN_MLX_VIDEO_FRAMES,
          maximum: MAX_MLX_VIDEO_FRAMES,
          default: DEFAULT_MLX_VIDEO_FRAMES,
        },
        steps: {
          type: 'number',
          description: 'Diffusion steps 1–50. Omit for the model default.',
          minimum: 1,
          maximum: 50,
        },
        seed: {
          type: 'number',
          description: 'Random seed. Omit for a random seed.',
          minimum: 0,
        },
        firstFrameImagePath: {
          type: 'string',
          description: 'Optional first-frame still (absolute path, sent as base64).',
        },
        lastFrameImagePath: {
          type: 'string',
          description: `Optional last-frame still. Requires numFrames ≥ ${MIN_MLX_VIDEO_FRAMES}.`,
        },
        pipeline: {
          type: 'string',
          description: 'LTX pipeline. two_stage is the usual quality setting.',
          enum: ['one_stage', 'two_stage'],
        },
        decoder: {
          type: 'string',
          description: 'LTX decoder.',
          enum: ['conv', 'diffusion'],
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the video (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the video (default: mlx_video_<timestamp>.mp4)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'mlx_3d_generate',
    title: '3D mesh generation (local · MLX Core)',
    annotations: HINT.generateLocal,
    description: `Generate a GLB mesh from an image on this machine via MLX Core / mlx-serve POST /v1/3d/generations. No vendor bill. This plugin never launches the app.

Use for a requested 3D mesh or an approved physical-object slide plan. The HTML mesh lane consumes embedded GLB models via slide.object renderer:"mesh" (mesh-objects.md). Inspect the model, materials and articulation before rendering; an image-to-mesh call does not guarantee a usable rig. Allowed extension is .glb only.
Do NOT use this as an image generator or to render cover text. If :11234 is down the call fails closed with brew install --cask mlx-core.

Returns: a text block with the saved .glb path and model.`,
    inputSchema: {
      type: 'object',
      properties: {
        imagePath: {
          type: 'string',
          description: 'Absolute path to the source image. Required.',
        },
        model: {
          type: 'string',
          description: 'mlx-serve model id. Omit to pick a ready model that advertises capability "3d".',
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the mesh (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the mesh (default: mlx_3d_<timestamp>.glb). Extension must be .glb.',
        },
      },
      required: ['imagePath'],
    },
  },

  // ── Blender bridge — previz camera and blocking on the local Blender (blender-previz.md) ──
  {
    name: 'blender_scene_read',
    title: 'Read a Blender scene (bridge)',
    annotations: HINT.local,
    description: `Read a .blend file **on this machine** and report what is in it — every object with world position, rotation, size, parent and keyframes, the active camera with lens, field of view and keyframes, the frame range and fps. Opens Blender headless for about a second; changes nothing.

Use as the first call of any previz session ("connect and read the scene, do not modify it yet"), and after any edit you did not make yourself, before blender_camera_set, blender_object_animate, blender_pose_key or blender_motion_import name an object. The other six blender_* tools return the same summary after they save, so a read right after one of them is redundant. A person proxy shows as its root, its <name>.rig armature (19 bones) and its <name>.body mannequin mesh.
Do NOT use to inspect a GLB or an image — it reads .blend files only. Do NOT guess object names from memory when this can list them.
Requires Blender 4.2+ (brew install --cask blender, or BLENDER=<executable>); capability_status lists it under 3d_generation.

Returns: a text block with the Blender version, frame range, resolution, the active camera and one line per object.`,
    inputSchema: {
      type: 'object',
      properties: {
        blendPath: { type: 'string', description: 'Absolute path to the .blend file (must end in .blend, no "..").' },
      },
      required: ['blendPath'],
    },
  },

  {
    name: 'blender_scene_build',
    title: 'Build a Blender previz set (bridge)',
    // Overwrites only the previz .blend it owns (reset:true) — a local scratch file, so it is a
    // generate-class tool, not a HITL one like the publishers.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: `Create (or extend) a .blend previz set **on this machine**: metric units, the cut's frame range and fps, the format's resolution, a floor, a sun, a jointed grey mannequin per person (a 19-bone armature — hips, spine, chest, neck, head, and shoulder, upper arm, forearm, hand, thigh, shin, foot per side — under a mesh that bends at those joints), grey proxies for animals, primitive stand-ins for objects, and GLB imports placed by location, rotation and scale. Saves the file and returns the scene summary.

Use once per cut before framing — the previz lane of skills/storyboard/references/blender-previz.md — with one proxy per subject that must be in frame: person and dog take a height, box a size, cylinder and sphere a radius, car an optional size. Proxies face -Y, a person's own left is +X; rotationZDeg turns them. A person's body is posed by blender_pose_key or driven by a motion-capture clip through blender_motion_import; its root moves with blender_object_animate. A GLB from mesh-objects.md or mlx_3d_generate goes through imports. reset:true (default) starts from an empty scene and **overwrites the file**; reset:false opens the existing file and adds to it, keeping the camera and its keys.
Do NOT model appearance here — proxies are grey blocking, and face, clothing and props belong to the image sheets. Do NOT use the .blend as a rendered asset — it is a camera, blocking and body-timing plan.
Requires Blender 4.2+; the glTF importer is built in.

Returns: the same summary as blender_scene_read plus the list of what was built.`,
    inputSchema: {
      type: 'object',
      properties: {
        blendPath: { type: 'string', description: 'Absolute path of the .blend to create or extend (ends in .blend, no "..").' },
        reset: {
          type: 'boolean',
          default: true,
          description:
            'true (default) starts from an empty scene and replaces blendPath — only a file this tool made; a .blend from anywhere else is refused unless force is true. false opens the existing file and adds proxies/imports to it, keeping the camera, keys, fps, frame range and resolution.',
        },
        force: {
          type: 'boolean',
          default: false,
          description: 'With reset:true, also replace a .blend that blender_scene_build did not make (default false — a hand-authored file is never wiped by accident).',
        },
        fps: {
          type: 'number',
          description: `Frames per second of the cut (1–120). A fresh scene defaults to ${DEFAULT_SCENE_FPS}; with reset:false an omitted value keeps the file's.`,
        },
        frameStart: { type: 'number', description: `First frame. A fresh scene defaults to ${DEFAULT_FRAME_START}; with reset:false an omitted value keeps the file's.` },
        frameEnd: {
          type: 'number',
          description: `Last frame. A fresh scene defaults to ${DEFAULT_FRAME_END} (5 s at 30 fps); with reset:false an omitted value keeps the file's. Camera and object keys past it extend the range.`,
        },
        width: { type: 'number', description: `Render width in px (even). A fresh scene defaults to ${DEFAULT_PREVIZ_WIDTH}; with reset:false an omitted value keeps the file's.` },
        height: {
          type: 'number',
          description: `Render height in px (even). A fresh scene defaults to ${DEFAULT_PREVIZ_HEIGHT} (9:16; pass 1920×1080 for long-form); with reset:false an omitted value keeps the file's.`,
        },
        floor: { type: 'boolean', default: true, description: 'Add a grey ground plane at z = 0 (default true).' },
        floorSize: { type: 'number', default: 40, description: 'Side of the floor plane in metres (default 40).' },
        proxies: {
          type: 'array',
          maxItems: 100,
          description: 'Grey stand-ins, one per subject that must be in frame.',
          items: {
            type: 'object',
            required: ['name', 'kind'],
            properties: {
              name: { type: 'string', description: 'Unique object name (≤63 chars) — the name blender_object_animate and the read-back use.' },
              kind: {
                type: 'string',
                enum: [...BLENDER_PROXY_KINDS],
                description: 'person (blocking figure with head, torso, limbs and a nose block marking the front), dog, car, box, cylinder, sphere. Every kind faces -Y.',
              },
              location: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description: "[x, y, z] in metres of the proxy's base point (feet, wheels, bottom face) — default [0, 0, 0].",
              },
              rotationZDeg: { type: 'number', description: 'Turn about Z in degrees (default 0 = facing -Y).' },
              height: {
                type: 'number',
                description: 'person / dog / cylinder: total height in metres (person default 1.75, dog 0.55, cylinder 1).',
              },
              radius: { type: 'number', description: 'cylinder / sphere: radius in metres (default 0.5).' },
              size: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description: 'box: [x, y, z] size in metres (required); car: optional size scaling the 1.8 × 4.4 × 1.45 m default.',
              },
              color: { type: 'string', description: 'Optional hex colour (#d0342c) to tell proxies apart — default grey.' },
            },
          },
        },
        imports: {
          type: 'array',
          maxItems: 50,
          description: 'GLB/glTF files to place — a mesh-objects.md recipe export or an mlx_3d_generate result.',
          items: {
            type: 'object',
            required: ['glbPath', 'name'],
            properties: {
              glbPath: { type: 'string', description: 'Absolute path to the .glb/.gltf (no "..").' },
              name: { type: 'string', description: 'Unique name of the empty that parents the imported objects — move or animate this name.' },
              location: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description: '[x, y, z] in metres (default [0, 0, 0]).',
              },
              rotationDeg: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description: 'Euler XYZ in degrees (default [0, 0, 0]).',
              },
              scale: { type: 'number', description: 'Uniform scale (default 1).' },
            },
          },
        },
      },
      required: ['blendPath'],
    },
  },

  {
    name: 'blender_camera_set',
    title: 'Set or animate the previz camera (bridge)',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: `Place the camera of a .blend previz **on this machine** as numbers — a location in metres, a target point it looks at (or an explicit rotation), a lens in mm or a field of view — and key it over frames for a move. Creates the camera if it is missing, makes it the active camera, saves, and returns the scene summary with the camera's keyframes.

Use for every framing decision in a previz: one key with no frame is a locked-off shot; two or more keys with frames are a dolly, arc, crane or push, interpolated LINEAR by default (constant speed reads as intent; BEZIER eases; CONSTANT cuts). Iterate in numbers — "height 1.2 m", "start at (-3, -3, 1), end at (3, -3, 1)", "24 mm" — each round is one call and costs nothing. Keys past the scene's frame range extend it. clearExisting (default true) replaces the previous move; false layers new keys onto it.
Do NOT describe a camera in adverbs and hope — pass coordinates. Do NOT pass both lensMm and fovDeg, or both target and rotationDeg on one key. Do NOT use this for objects — that is blender_object_animate. A lensMm on any key turns the move into a zoom: every key then records its lens.
Coordinates are Blender's: metres, Z up, +Y away from the front view; proxies face -Y, so a camera at negative Y sees their front. Calls on the same .blend run one at a time inside the server (parallel calls on one file are queued, not lost); different files run side by side.

Returns: the scene summary — the camera line shows location, rotation, lens, fov and keyframes.`,
    inputSchema: {
      type: 'object',
      properties: {
        blendPath: { type: 'string', description: 'Absolute path to the .blend file (must end in .blend, no "..").' },
        name: { type: 'string', default: 'Camera', description: 'Camera object name (default "Camera"); created if missing, made the active camera.' },
        lensMm: {
          type: 'number',
          description: 'Focal length in mm on a 36 mm sensor — 24 wide, 35 normal, 50–85 tight. Alternative to fovDeg.',
        },
        fovDeg: { type: 'number', description: "Field of view in degrees across the frame's longer side. Alternative to lensMm." },
        keys: {
          type: 'array',
          minItems: 1,
          maxItems: 500,
          description: 'Camera poses. One key without a frame is a locked-off shot; several keys (each with a frame) are a move.',
          items: {
            type: 'object',
            required: ['location'],
            properties: {
              frame: { type: 'number', description: 'Frame number of this pose. Omit only when this is the single key of a static shot.' },
              location: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description: 'Camera position [x, y, z] in metres.',
              },
              target: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description: 'Point the camera looks at [x, y, z] in metres — the usual way to aim it. Exactly one of target or rotationDeg.',
              },
              rotationDeg: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description: 'Explicit Blender Euler XYZ rotation in degrees ([90, 0, 0] looks along +Y). Exactly one of target or rotationDeg.',
              },
              lensMm: { type: 'number', description: "Focal length at this key, for a zoom; omit to keep the camera's lens." },
            },
          },
        },
        interpolation: {
          type: 'string',
          enum: [...BLENDER_INTERPOLATIONS],
          default: 'LINEAR',
          description: 'Between keys: LINEAR (default, constant speed), BEZIER (ease in and out), CONSTANT (cut).',
        },
        clearExisting: {
          type: 'boolean',
          default: true,
          description: "Replace the camera's previous keys (default true); false adds these keys on top.",
        },
      },
      required: ['blendPath', 'keys'],
    },
  },

  {
    name: 'blender_object_animate',
    title: 'Animate a previz object (bridge)',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: `Key an object of a .blend previz **on this machine** — location in metres, rotation in degrees (Euler XYZ, spins past 360 allowed), scale — over frames: the thrown can, the paper plane's path, the car crossing the bridge. Saves and returns the scene summary with the object's keyframes.

Use for things that move through space — vehicles, props, projectiles — and for a person's path across the set (a walk, a formation change: key the person's root, the body keeps its pose or motion on top), so the previz clip carries their timing and path. Name the object exactly as blender_scene_read lists it (a proxy's root is its name, "can", not "can.mesh"; a person's root is "dancer", not "dancer.rig"). Interpolation is LINEAR by default; keys past the frame range extend it; clearExisting (default true) replaces the object's previous keys.
Do NOT bend a person's limbs with this — this moves the whole figure; joints are blender_pose_key (poses in plain channels) or blender_motion_import (a motion-capture clip). Do NOT move the camera with this — that is blender_camera_set. Calls on the same .blend run one at a time inside the server; different files run side by side.

Returns: the scene summary; the object's line shows its keyframes.`,
    inputSchema: {
      type: 'object',
      properties: {
        blendPath: { type: 'string', description: 'Absolute path to the .blend file (must end in .blend, no "..").' },
        object: { type: 'string', description: 'Exact object name from blender_scene_read — a proxy\'s root ("can"), not its mesh ("can.mesh").' },
        keys: {
          type: 'array',
          minItems: 1,
          maxItems: 1000,
          description: 'Poses over time; each needs a frame and at least one of location, rotationDeg, scale.',
          items: {
            type: 'object',
            required: ['frame'],
            properties: {
              frame: { type: 'number', description: 'Frame number of this pose.' },
              location: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description: '[x, y, z] in metres.',
              },
              rotationDeg: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description: 'Euler XYZ in degrees; values past 360 spin the object.',
              },
              scale: {
                description: 'Uniform scale as a number, or [x, y, z].',
                anyOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 }],
              },
            },
          },
        },
        interpolation: {
          type: 'string',
          enum: [...BLENDER_INTERPOLATIONS],
          default: 'LINEAR',
          description: 'Between keys: LINEAR (default, constant speed), BEZIER (ease in and out), CONSTANT (cut).',
        },
        clearExisting: {
          type: 'boolean',
          default: true,
          description: "Replace the object's previous keys (default true); false adds these keys on top.",
        },
      },
      required: ['blendPath', 'object', 'keys'],
    },
  },

  {
    name: 'blender_pose_key',
    title: 'Pose a previz person (bridge)',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: `Key the body of a person proxy in a .blend previz **on this machine** — poses over frames in plain channels, degrees in the figure's own frame: arms (raise, side, twist, elbow), legs (raise, side, knee, ankle), torso (bow, lean, turn), head (nod, tilt, turn) and hips (offset in metres, turn, bow, lean). The mannequin bends at its 19 joints; between keys the pose eases (BEZIER by default). Saves and returns the scene summary plus where the hands, feet and head ended up.

Use for acted beats the cut is about — a point, a wave, a bow, a crouch and jump, a dance count — when no motion-capture clip fits (blender_motion_import is the natural-motion path). A group that is present keys every bone it covers with omitted channels at 0 (the rest pose: arms hanging, standing straight); a group that is absent leaves those bones alone at that frame. raise 90 puts a limb horizontal in front, side 90 horizontal out to the side, elbow/knee 0–150 bend the joint; bow/nod + lean forward, lean/tilt + go to the figure's left, turn + turns to the figure's left; hips.offset [0, 0, -0.2] drops the pelvis 20 cm (a crouch, with knees and thighs bent to match). The raw bones map takes any rig bone as [x, y, z] degrees about the figure's X (side), Y (front-back) and Z (up) axes. Keys more than about 120° apart need an intermediate key or the joint may swing the other way round.
Do NOT pose with this what a clip can carry — a full dance by hand is hundreds of keys and reads mechanical; import a clip and hand-key only the accents with clearExisting false (each accent takes over ±ease frames of the clip, default 6, so it is reached and left rather than spiked). Do NOT move the figure across the floor with this — that is blender_object_animate on the person's root. Do NOT name the rig or the body — name the person proxy.

Returns: the scene summary; the person's rig line shows its keyframes, and a landmark line gives hand.L, hand.R, foot.L, foot.R and head positions in world metres at the last keyed frame.`,
    inputSchema: {
      type: 'object',
      properties: {
        blendPath: { type: 'string', description: 'Absolute path to the .blend file (must end in .blend, no "..").' },
        object: { type: 'string', description: 'The person proxy\'s name as blender_scene_build created it ("dancer" — not "dancer.rig").' },
        keys: {
          type: 'array',
          minItems: 1,
          maxItems: 1000,
          description: 'Poses over time; each needs a frame and a pose with at least one group.',
          items: {
            type: 'object',
            required: ['frame', 'pose'],
            properties: {
              frame: { type: 'number', description: 'Frame number of this pose.' },
              pose: {
                type: 'object',
                description: 'Body channels in degrees in the figure\'s own frame; a present group keys all of its bones (omitted channels are 0).',
                properties: {
                  hips: {
                    type: 'object',
                    description: 'The pelvis — every other bone follows it.',
                    properties: {
                      offset: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: '[x, y, z] metres from the rest position: -z crouches, ±x sways.' },
                      turn: { type: 'number', description: 'Degrees about the up axis, + turns the pelvis to the figure\'s left.' },
                      bow: { type: 'number', description: 'Degrees about the side axis, + tips the pelvis forward.' },
                      lean: { type: 'number', description: 'Degrees about the front-back axis, + tips it to the figure\'s left.' },
                    },
                  },
                  torso: {
                    type: 'object',
                    description: 'Spine and chest together (the bend is split between them).',
                    properties: {
                      bow: { type: 'number', description: '+ bends forward, - arches back.' },
                      lean: { type: 'number', description: '+ leans to the figure\'s left.' },
                      turn: { type: 'number', description: '+ twists the torso to the figure\'s left.' },
                    },
                  },
                  head: {
                    type: 'object',
                    description: 'Neck and head together.',
                    properties: {
                      nod: { type: 'number', description: '+ looks down, - looks up.' },
                      tilt: { type: 'number', description: '+ tilts the head to the figure\'s left shoulder.' },
                      turn: { type: 'number', description: '+ looks to the figure\'s left.' },
                    },
                  },
                  armL: {
                    type: 'object',
                    description: 'The figure\'s left arm (at +X).',
                    properties: {
                      raise: { type: 'number', description: 'Forward and up: 90 horizontal in front, 180 straight up.' },
                      side: { type: 'number', description: 'Out to the side: 90 horizontal (a T), 180 straight up.' },
                      twist: { type: 'number', description: 'About the arm\'s own length, + turns the palm forward.' },
                      elbow: { type: 'number', description: 'Bend 0–150; the forearm folds toward the front of the upper arm.' },
                    },
                  },
                  armR: {
                    type: 'object',
                    description: 'The figure\'s right arm (at -X), same channels mirrored.',
                    properties: {
                      raise: { type: 'number', description: 'Forward and up: 90 horizontal in front, 180 straight up.' },
                      side: { type: 'number', description: 'Out to the side: 90 horizontal (a T), 180 straight up.' },
                      twist: { type: 'number', description: 'About the arm\'s own length, + turns the palm forward.' },
                      elbow: { type: 'number', description: 'Bend 0–150; the forearm folds toward the front of the upper arm.' },
                    },
                  },
                  legL: {
                    type: 'object',
                    description: 'The figure\'s left leg.',
                    properties: {
                      raise: { type: 'number', description: 'Thigh forward: 90 horizontal (a high kick or a seat).' },
                      side: { type: 'number', description: 'Thigh out to the side.' },
                      knee: { type: 'number', description: 'Bend 0–150; the shin folds back.' },
                      ankle: { type: 'number', description: '+ points the toes, - flexes the foot up.' },
                    },
                  },
                  legR: {
                    type: 'object',
                    description: 'The figure\'s right leg, same channels mirrored.',
                    properties: {
                      raise: { type: 'number', description: 'Thigh forward: 90 horizontal (a high kick or a seat).' },
                      side: { type: 'number', description: 'Thigh out to the side.' },
                      knee: { type: 'number', description: 'Bend 0–150; the shin folds back.' },
                      ankle: { type: 'number', description: '+ points the toes, - flexes the foot up.' },
                    },
                  },
                  bones: {
                    type: 'object',
                    description: `Raw override per rig bone — [x, y, z] degrees about the figure's side, front-back and up axes, applied after the groups. Bones: ${BLENDER_RIG_BONES.join(', ')}.`,
                    additionalProperties: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: '[x, y, z] degrees.' },
                  },
                },
              },
            },
          },
        },
        interpolation: {
          type: 'string',
          enum: [...BLENDER_INTERPOLATIONS],
          default: 'BEZIER',
          description: 'Between keys: BEZIER (default, eases in and out — how a body moves), LINEAR (constant speed), CONSTANT (snap).',
        },
        clearExisting: {
          type: 'boolean',
          default: true,
          description: "Replace the person's previous body keys, including an imported motion, and put every bone back at rest (default true); false layers these keys on top of what is there — each keyed bone's older keys within ±ease frames of the new key are dropped, so the pose is eased into and out of instead of spiking for one frame, and the hips group becomes a delta on the clip's own pelvis (its turn and floor height stay).",
        },
        ease: {
          type: 'number',
          default: 6,
          description: 'With clearExisting false: half-width in frames of the window a layered key takes over from the existing keys (default 6, 0 keeps every neighbour and changes that frame alone).',
        },
      },
      required: ['blendPath', 'object', 'keys'],
    },
  },

  {
    name: 'blender_motion_import',
    title: 'Retarget motion capture onto a previz person (bridge)',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: `Drive a person proxy in a .blend previz **on this machine** with a motion-capture clip — a BVH or an FBX with animation — retargeted onto the mannequin's 19 bones: bones are matched by name across the usual vocabularies (Biovision/CMU/Mixamo LeftUpLeg·LeftLeg, Unreal thigh_l·calf_l, Bandai UpperLeg_L·LowerLeg_L, Rigify thigh.L, SMPL L_Hip·L_Knee), the clip is scaled to the figure's leg length, turned so the actor faces -Y at the first frame, and baked to one key per frame. Saves and returns the scene summary plus the bone match.

Use when the cut's content is the body — a dance, a fight, a fall, a walk cycle — and a clip of it exists: free BVH libraries (CMU, Bandai Namco Research dataset-1 under CC BY-NC 4.0, Mixamo FBX after a browser download) or a capture of your own. fromSeconds/toSeconds cut a slice, frameStart places it in the cut, speed retimes it, loop repeats it to the scene's last frame, rootMotion "inplace" (default) keeps the figure where its root stands (the formation is yours through blender_object_animate) while "full" keeps the actor's travel. A source bone the vocabulary misses is named in boneMap; unmatched bones hold their rest pose relative to the parent.
Do NOT expect appearance from this — it is timing and limb positions on a grey mannequin. Do NOT stack it with blender_pose_key on the same frames unless clearExisting is false on purpose. Do NOT pass files of other kinds — .bvh and .fbx only, and the file must hold an animated skeleton.
Requires Blender 4.2+; the BVH and FBX importers are built in. At most ${MAX_PREVIZ_FRAMES} frames per import.

Returns: the scene summary; the person's rig line shows the baked frame range, a motion line names the source, its length, the slice and speed, which canonical bone took which source bone and which found none, the scale ratio and the facing correction, and a landmark line gives hand, foot and head positions at the first baked frame.`,
    inputSchema: {
      type: 'object',
      properties: {
        blendPath: { type: 'string', description: 'Absolute path to the .blend file (must end in .blend, no "..").' },
        object: { type: 'string', description: 'The person proxy\'s name as blender_scene_build created it ("dancer" — not "dancer.rig").' },
        motionPath: { type: 'string', description: 'Absolute path to the motion-capture file — .bvh or .fbx with an animated skeleton (no "..").' },
        frameStart: { type: 'number', description: "Scene frame where the slice's first frame lands (default: the scene's first frame)." },
        fromSeconds: { type: 'number', default: 0, description: 'Start of the slice inside the clip, seconds from its beginning (default 0).' },
        toSeconds: { type: 'number', description: 'End of the slice inside the clip, seconds (default: the whole clip).' },
        speed: { type: 'number', default: 1, description: 'Playback speed, 0.1–10 (default 1 = as captured; 1.2 plays it 20 % faster).' },
        loop: { type: 'boolean', default: false, description: 'Repeat the slice until the scene\'s last frame (default false: the slice plays once and the frame range grows to fit it).' },
        rootMotion: {
          type: 'string',
          enum: [...BLENDER_ROOT_MOTIONS],
          default: 'inplace',
          description: 'inplace (default): the pelvis keeps its floor position and only rises and falls — the figure\'s root decides where it stands. full: the actor\'s travel across the floor is kept.',
        },
        boneMap: {
          type: 'object',
          description: `Override or complete the name match: canonical rig bone → source bone name. Canonical bones: ${BLENDER_RIG_BONES.join(', ')}.`,
          additionalProperties: { type: 'string', description: 'Exact source bone name in the clip.' },
        },
        clearExisting: {
          type: 'boolean',
          default: true,
          description: "Replace the person's previous body keys (default true); false layers the clip on top of hand-made keys.",
        },
      },
      required: ['blendPath', 'object', 'motionPath'],
    },
  },

  {
    name: 'blender_render_previz',
    title: 'Render a previz clip (bridge)',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: `Render a .blend previz **on this machine** to an H.264 mp4 plus first, middle and last frame PNGs (or the frames you list). The mp4 is always clean — it is what seedance_reference takes as referenceVideoPaths — and the stills carry the frame number, camera and lens stamped in the corner (stamp:false for clean stills). workbench (default) is flat studio light with cavity shading and outlines — grey figures read against a grey floor, well under a second a frame; eevee renders the scene's light and materials for a previz that also has to say something about mood, a few seconds a frame. Silent — no audio track.

Use after blender_camera_set to look at the move — open the stills, then iterate the camera in numbers — and at the end of a previz session to produce the clip the cut's camera and blocking are planned from. Resolution, fps and frame range default to the scene's (set by blender_scene_build); pass frameStart/frameEnd to render a slice. Output goes to outputPath or <blend dir>/previz/.
Do NOT treat the previz as a deliverable frame — nothing in it is final appearance; it is a camera and blocking plan. Do NOT pad or loop a failed render — the tool reports failure and writes no mp4.
Requires Blender 4.2+; the mp4 is written by Blender's own FFmpeg, so no ffmpeg on PATH is needed.

Returns: a text block with the mp4 path, still paths (and any requested still outside the range, which is skipped and named), engine, resolution, fps, frame range, seconds and render time.`,
    inputSchema: {
      type: 'object',
      properties: {
        blendPath: { type: 'string', description: 'Absolute path to the .blend file (must end in .blend, no "..").' },
        outputPath: { type: 'string', description: 'Directory for the mp4 and stills (default: <blend dir>/previz).' },
        filename: {
          type: 'string',
          default: DEFAULT_PREVIZ_FILENAME,
          description: `Bare mp4 file name (default ${DEFAULT_PREVIZ_FILENAME}); stills are named <stem>-fNNNN.png beside it.`,
        },
        engine: {
          type: 'string',
          enum: [...BLENDER_PREVIZ_ENGINES],
          default: DEFAULT_PREVIZ_ENGINE,
          description: 'workbench (default): flat studio light, cavity, outlines, fastest. eevee: scene light and materials, a few seconds a frame.',
        },
        width: { type: 'number', description: "Override render width in px, even (default: the scene's)." },
        height: { type: 'number', description: "Override render height in px, even (default: the scene's)." },
        fps: { type: 'number', description: "Override frames per second (default: the scene's)." },
        frameStart: { type: 'number', description: "First frame to render (default: the scene's)." },
        frameEnd: { type: 'number', description: `Last frame to render (default: the scene's). At most ${MAX_PREVIZ_FRAMES} frames per render.` },
        stills: {
          type: 'array',
          maxItems: 24,
          items: { type: 'number' },
          description: 'Frames to also save as PNG (default: first, middle, last).',
        },
        stamp: {
          type: 'boolean',
          default: true,
          description: 'Burn frame number, camera name and lens into the corner of the PNG stills (default true) — what makes a still reviewable. Render the frame-1 still that becomes visual.video.previz.firstFrame with stamp:false (blender-previz.md §6.6): the image tool keeps whatever is in that frame as composition. The mp4 is never stamped, so it can go straight to seedance_reference.',
        },
        samples: { type: 'number', default: 16, description: 'eevee only: render samples (default 16).' },
        timeoutSeconds: {
          type: 'number',
          description: 'Override the render time limit in seconds (default grows with the frame count: 120 s + 1 s per frame on workbench, 4 s on eevee).',
        },
      },
      required: ['blendPath'],
    },
  },

  // ── Speech synthesis (Google Gemini TTS — ported from the fect-mcp tts module) ─────────
  {
    name: 'tts_generate_checked',
    title: 'Generate and review narration',
    annotations: HINT.generate,
    description: `Generate one scene with the pinned TTS engine, review the actual WAV, and regenerate failed takes up to maxAttempts (1–3, including the first take).
Use for every generated narration scene in produce/autoproduce. Pass the existing generator's arguments in generation, the complete spoken expectedText (phonetic spelling; no acting tags or speaker labels), language, and the profile's intended delivery. Voice and generation settings stay unchanged across attempts; a pinned seed advances by one per retake, because the same seed returns the same bytes. An entire scene is one call; never split it into sentence calls.
On tts_elevenlabs_generate the take is fetched with timestamps and its sentences are re-spaced before review: a fixed sentencePause of digital silence between sentences (stretched up to 1.0s where a subtitle cue would read faster than 6.0 chars/s after playbackSpeed), a 0.14s lead, speech samples untouched. Pass segments (the scene's narration[].tts list) so the pauses land on the builder's segment boundaries; the wrapper writes <wav>.sentences.json and shifts the .alignment.json to the shipped audio.
Checks signal/duration, a blind transcript (CER <=2%), then ${REVIEW_MODEL} listening scores: accuracy >=98, pronunciation/naturalness/clarity >=95, confidence >=0.9, no audible defects. Returns a hash-bound .wav.quality.json proof required by the builder. Missing keys, unavailable reviewer, malformed responses or exhausted attempts block production. Scores are operational thresholds, not a guarantee of human judgement.
Requires ffmpeg and GEMINI_API_KEY even for local synthesis. Two paid audio-review calls per acoustically valid take, plus the selected generator's costs. Record the retry-inclusive allowance before calling; review tokens are logged as unpriced until reconciled with provider billing. Do not call again to reset an exhausted attempt budget. Do not use for recordings or native clip speech; retain their final listening QA. Do not change engines/voices or lower thresholds to obtain PASS.`,
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        generator: { type: 'string', enum: [...GENERATORS], description: 'Existing synthesis tool matching profile §2.' },
        generation: { type: 'object', additionalProperties: true, description: 'Arguments accepted by generator, including its text/script/inputs and pinned voice settings. Outer outputPath and filename control the output.' },
        expectedText: { type: 'string', minLength: 1, maxLength: 4000, description: 'All spoken narration for this scene, matching narration[].tts. Write numbers as spoken words.' },
        language: { type: 'string', minLength: 2, maxLength: 80, description: 'Spoken language, e.g. Korean.' },
        delivery: { type: 'string', minLength: 1, maxLength: 2000, description: 'Intended natural delivery from profile §2, including tone and pacing.' },
        outputPath: { type: 'string', description: 'Episode PCM directory, normally .work/pcm.' },
        filename: { type: 'string', description: 'Scene WAV basename, e.g. c0.wav.' },
        maxAttempts: { type: 'integer', minimum: 1, maximum: 3, default: 3, description: 'First generation plus retakes; set within the approved allowance.' },
        rejectTake: { type: 'object', additionalProperties: false, required: ['audioSha256','reason'], description: 'When final listening finds a defect in a previously checked take, reject that exact WAV and use only remaining attempts. Never waives any check.', properties: {
          audioSha256: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'SHA-256 of the current checked WAV, as recorded in its quality proof.' }, reason: { type: 'string', minLength: 10, maxLength: 1000, description: 'Actual time, word or sound defect observed during listening.' },
        } },
        segments: { type: 'array', minItems: 1, maxItems: 80, items: { type: 'string', minLength: 1, maxLength: 1000 }, description: 'The scene\'s narration[].tts sentences in order (joined they read as expectedText). ElevenLabs takes get a fixed pause at each segment boundary — the boundary the builder\'s reveals and subtitle cues use. Without it, pauses go after sentence-final punctuation.' },
        sentencePause: { type: 'number', minimum: 0.25, maximum: 1.5, default: 0.5, description: 'Silence between sentences in the take\'s own timeline, seconds. The builder detects pauses from 0.16s and fits a 0.35s reveal fade inside one.' },
        playbackSpeed: { type: 'number', minimum: 0.5, maximum: 2, default: 1, description: 'The channel\'s playback factor from profile §2 (speedup.sh). A pause grows past sentencePause only where that sentence\'s subtitle cue would otherwise read faster than 6.0 chars/s after the speed-up.' },
      },
      required: ['generator','generation','expectedText','language','delivery','outputPath','filename'],
    },
  },
  {
    name: 'tts_generate',
    title: 'Speech synthesis (single speaker)',
    annotations: HINT.generate,
    description: `Convert text to single-voice speech audio using Google Gemini TTS.

Use when the user asks to read text aloud, narrate, voice-over, or convert text to speech/audio (음성 변환, TTS, 나레이션). 30 voices; 90+ languages are auto-detected from the input text itself (there is no language parameter) — Korean, English, Japanese, Vietnamese and both Simplified (zh-CN) and Traditional (zh-TW) Chinese are all supported. Control delivery with stylePrompt (e.g. "Say cheerfully", "In a spooky whisper").
Do NOT use for two-person dialogue scripts — use tts_multi_speaker. Unsure which voice fits? Call tts_list_voices first.
Keep voiceName/stylePrompt/temperature byte-identical across takes of one video — the model re-interprets any wording change and the narrator's voice drifts between cuts. If a script fails repeatedly (the server already retries 3x), switch model to gemini-2.5-pro-preview-tts rather than rewording it.

Returns: a text block with the saved .wav file path, voice name, and text length.`,
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to convert to speech (max 16,000 characters — split longer scripts)',
          maxLength: 16000,
        },
        voiceName: TTS_VOICE_PROPERTY,
        model: TTS_MODEL_PROPERTY,
        stylePrompt: {
          type: 'string',
          description: 'Optional style instruction (e.g., "Say cheerfully", "In a whisper", "With excitement")',
        },
        temperature: TTS_TEMPERATURE_PROPERTY,
        outputPath: {
          type: 'string',
          description: 'Directory path to save the audio file (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the audio file (default: tts_<timestamp>.wav)',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'tts_multi_speaker',
    title: 'Speech synthesis (2-speaker dialogue)',
    annotations: HINT.generate,
    description: `Convert a dialogue script into multi-speaker audio (max 2 voices) using Google Gemini TTS.

Use when the user wants a conversation, interview, or podcast-style dialogue voiced by distinct speakers (대화 음성, 팟캐스트 오디오). Script lines are prefixed with speaker names ("Joe: Hello!\\nJane: Hi!"), and each name must match an entry in the speakers array with its assigned voice.
Do NOT use for a single narrator — use tts_generate. Maximum 2 speakers; each needs a unique voice.

Returns: a text block with the saved .wav file path, speaker/voice assignments, and script length.`,
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'Conversation script with speaker names (e.g., "Joe: Hello!\\nJane: Hi there!"). Every speaker name used here must match a speakerName in the speakers array. Max 16,000 characters — split longer scripts.',
          maxLength: 16000,
        },
        speakers: {
          type: 'array',
          description: 'Array of speaker configurations (max 2 speakers)',
          items: {
            type: 'object',
            properties: {
              speakerName: {
                type: 'string',
                description: 'Name of the speaker (must match names used in the script)',
              },
              voiceName: {
                type: 'string',
                description: 'Voice to use for this speaker',
                enum: TTS_VOICE_ENUM,
              },
            },
            required: ['speakerName', 'voiceName'],
          },
          minItems: 1,
          maxItems: 2,
        },
        model: TTS_MODEL_PROPERTY,
        stylePrompt: {
          type: 'string',
          description: 'Optional style instruction for the overall conversation (e.g., "Make Speaker1 sound tired, Speaker2 excited")',
        },
        temperature: TTS_TEMPERATURE_PROPERTY,
        outputPath: {
          type: 'string',
          description: 'Directory path to save the audio file (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the audio file (default: tts_multi_<timestamp>.wav)',
        },
      },
      required: ['script', 'speakers'],
    },
  },
  {
    name: 'tts_local_generate',
    title: 'Speech synthesis (local · Supertonic)',
    annotations: HINT.generateLocal,
    description: `Convert text to speech **on this machine** using Supertonic 3 — no API key, no network, no quota, no per-character cost.

Use for narration bodies and any bulk voice-over: scene narration in the produce pipeline, long scripts, and repeated takes where API cost or quota would add up. Measured at 6.3x realtime on CPU alone. 10 built-in voices (F1–F5 female, M1–M5 male) across 31 languages; output is 44.1kHz mono WAV and the response includes the exact audio duration, so no ffprobe round-trip is needed for length checks.
Do NOT use when the line needs acted delivery — there is no style/emotion parameter here, so intro lines, character dialogue, and anything with a stylePrompt belong to tts_generate (Gemini). Do NOT mix both engines inside one video without resampling: this returns 44.1kHz and tts_generate returns 24kHz.
Requires a local Python runtime with the \`supertonic\` package (pip install supertonic); set SUPERTONIC_PYTHON if it lives in a virtualenv. The first call downloads 385MB of weights to ~/.cache/supertonic3. Model weights are OpenRAIL-M licensed (code is MIT) — commercial use is permitted with use-based restrictions, so review the terms before shipping generated audio.

Returns: a text block with the saved .wav path, voice, language, audio duration, sample rate, and synthesis time.`,
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: `The text to convert to speech (max ${MAX_SUPERTONIC_INPUT_CHARS} characters — split longer scripts by scene)`,
          maxLength: MAX_SUPERTONIC_INPUT_CHARS,
        },
        voice: {
          type: 'string',
          description: `Voice style (default: "${DEFAULT_SUPERTONIC_VOICE}"). F1–F5 are female, M1–M5 male; the vendor publishes no personality labels beyond that. Keep one voice per channel — see data/<slug>/profile.md.`,
          enum: [...SUPERTONIC_VOICE_NAMES],
          default: DEFAULT_SUPERTONIC_VOICE,
        },
        lang: {
          type: 'string',
          description: `Language code (default: "${DEFAULT_SUPERTONIC_LANGUAGE}"). Unlike tts_generate this is NOT auto-detected — set it, because the code also selects chunking (Korean uses shorter chunks). Use "na" only for text whose language is unsupported.`,
          enum: [...SUPERTONIC_LANGUAGES],
          default: DEFAULT_SUPERTONIC_LANGUAGE,
        },
        speed: {
          type: 'number',
          description: `Speech speed 0.7–${MAX_SUPERTONIC_SPEED} (default: ${DEFAULT_SUPERTONIC_SPEED}). Keep it identical across every cut of one video. Above 1.2 the model drops syllables (measured), so a faster delivery comes from the produce playback speed pass, not from this value.`,
          minimum: 0.7,
          maximum: MAX_SUPERTONIC_SPEED,
          default: DEFAULT_SUPERTONIC_SPEED,
        },
        steps: {
          type: 'number',
          description: `Quality steps 1–100 (default: ${DEFAULT_SUPERTONIC_STEPS}). Higher is slower with diminishing returns; the default is the vendor's recommended setting.`,
          minimum: 1,
          maximum: 100,
          default: DEFAULT_SUPERTONIC_STEPS,
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the audio file (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the audio file (default: supertonic_<timestamp>.wav)',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'mlx_tts_generate',
    title: 'Speech synthesis (local · MLX Core)',
    annotations: HINT.generateLocal,
    description: `Convert text to speech on this machine via MLX Core / mlx-serve POST /v1/audio/speech. Returns raw WAV bytes (this tool does not decode the body as text). No vendor bill. This plugin never launches the app.

Use as an optional local voice when MLX Core is running with an audio model. The OpenAI-compatible field is input (not text). Optional voice name or refAudioPath for a reference clip. Max ${MAX_MLX_TTS_CHARS} characters.
Do NOT use this as a silent fallback for the channel profile §2 engine — if Supertonic, Gemini, or ElevenLabs is pinned, a missing runtime stops the run and asks the user. Mixing sample rates with tts_local_generate (44.1kHz) or tts_generate (24kHz) on one timeline needs a resample. Do NOT treat this as the default narration path.
Requires Apple Silicon, macOS 26.2+, and MLX Core.app or mlx-serve (or MLX_SERVE_URL). brew install --cask mlx-core if :11234 is down.

Returns: a text block with the saved .wav path, model, and generation time.`,
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: `Text to speak (max ${MAX_MLX_TTS_CHARS} characters). OpenAI-compatible name: input, not text.`,
          maxLength: MAX_MLX_TTS_CHARS,
        },
        model: {
          type: 'string',
          description: 'mlx-serve model id. Omit to pick a ready model that advertises capability "audio".',
        },
        voice: {
          type: 'string',
          description: 'Optional voice name the loaded model advertises. Omit for the model default.',
        },
        refAudioPath: {
          type: 'string',
          description: 'Optional reference clip (absolute path, sent as base64) for voice cloning on models that support it.',
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the audio (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the audio (default: mlx_tts_<timestamp>.wav)',
        },
      },
      required: ['input'],
    },
  },
  {
    name: 'tts_list_voices',
    title: 'TTS voice list',
    annotations: HINT.local,
    description: `List the built-in voices of the two static TTS engines — 30 Gemini voices with personality traits, plus the 10 local Supertonic voices — and point at the third lane.

Use before tts_generate, tts_multi_speaker, or tts_local_generate when the user has not specified a voice, or asks what voices are available (목소리 종류). Read-only; makes no API call. ElevenLabs voices are account-specific and NOT listed here — call tts_elevenlabs_voices for those.
Do NOT use to generate audio — use tts_generate (acted delivery) or tts_local_generate (narration, free). The list is static; one call per session is enough. When the channel profile (data/<slug>/profile.md) already fixes a voice, use that instead of picking a new one.

Returns: a text list of the 30 Gemini voice names with one-line personality descriptions (e.g. "Kore — Firm"), followed by the 10 Supertonic voice IDs (F1–F5, M1–M5 — no personality labels are published for these), and a note on which of the three engines to pick.`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // ── Speech synthesis (ElevenLabs — REST, xi-api-key) ─────────────────────────
  {
    name: 'tts_elevenlabs_generate',
    title: 'Speech synthesis (ElevenLabs · single voice)',
    annotations: HINT.generate,
    description: `Convert text to single-voice speech with ElevenLabs — the paid third lane for cuts that need acted delivery, a specific cloned or library voice, or per-character timestamps.

Use when the channel profile names engine \`elevenlabs\`, when a line needs inline acting on eleven_v3 (audio tags in the text: "[whispers] 이건 비밀인데요", "[laughs]", "[sarcastic]", "[sighs]" — more precise than a Gemini stylePrompt because the tag sits exactly where the delivery changes), when the voice must be a Voice Library / cloned voice, or when subtitles need exact timing (timestamps: true). Korean is supported on every model here, but quality tracks the VOICE more than the model — an English-trained premade voice reads Korean with an accent; pick a Korean voice from the Voice Library (paid plans) and pin it in profile.md.
Do NOT use for narration bodies by default — tts_local_generate is free and tts_generate is 1.3–2.6x cheaper; the API rate is $0.10 per 1,000 characters on multilingual_v2 and v3, $0.05 on flash_v2_5 and v3_conversational (the same on every plan; each plan includes a monthly character allowance). Do NOT use for a multi-voice scene — use tts_elevenlabs_dialogue. Do NOT switch voiceId, model, stability or seed between cuts of one video. Free-tier output is non-commercial and needs attribution — check the plan before publishing.
Per-request caps: ${ELEVENLABS_MODEL_CHAR_CAPS.eleven_v3} characters on eleven_v3, ${ELEVENLABS_MODEL_CHAR_CAPS.eleven_multilingual_v2} on multilingual_v2, ${ELEVENLABS_MODEL_CHAR_CAPS.eleven_flash_v2_5} on flash_v2_5 — one scene per call. previousText/nextText carry the neighboring sentences so a re-rendered cut matches its neighbors' tone. The server retries 429/5xx 3x; a 403 output_format_not_allowed means the plan lacks that format — use wav_24000.

Returns: a text block with the saved audio path (WAV by default — the builder needs RIFF), model, voice, format, duration, the vendor's metered character cost (the character-cost header, the billing quantity), request id, and the alignment sidecar path when timestamps were requested.`,
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: `The text to convert to speech (max ${MAX_ELEVENLABS_INPUT_CHARS} characters — ${ELEVENLABS_MODEL_CHAR_CAPS.eleven_v3} on eleven_v3; split the script by scene). On eleven_v3, square-bracket audio tags inside the text direct the delivery.`,
          maxLength: MAX_ELEVENLABS_INPUT_CHARS,
        },
        voiceId: ELEVENLABS_VOICE_ID_PROPERTY,
        model: {
          type: 'string',
          description: `TTS model (default: "${DEFAULT_ELEVENLABS_MODEL}" — the vendor default, stable, 10k chars, $0.10/1K). eleven_v3: audio tags and the most expressive read, 5k chars, slow (not real-time), $0.10/1K. eleven_v3_conversational: the v3 family tuned for realtime at half price ($0.05/1K), 5k-char cap applied here; accepted by this tool but not by dialogue. eleven_flash_v2_5: fastest, $0.05/1K, 40k chars, honors languageCode, reads digits raw unless applyTextNormalization is "on". eleven_turbo_v2_5 is deprecated in favor of flash_v2_5 and kept only for existing profiles.`,
          enum: [...ELEVENLABS_MODELS],
          default: DEFAULT_ELEVENLABS_MODEL,
        },
        languageCode: ELEVENLABS_LANGUAGE_CODE_PROPERTY,
        stability: ELEVENLABS_STABILITY_PROPERTY,
        similarityBoost: {
          type: 'number',
          description: 'How closely to track the original voice, 0–1 (vendor default 0.75). Very high values can reproduce artifacts from the voice\'s training sample.',
          minimum: 0,
          maximum: 1,
        },
        style: {
          type: 'number',
          description: 'Style exaggeration 0–1 (vendor default 0). Raising it adds expressiveness and latency; 0 is the steady choice for narration. multilingual_v2 only — the per-model settings schemas give eleven_v3 {stability} and flash_v2_5 {stability, similarity_boost, speed}, so it is ignored there (use audio tags on v3).',
          minimum: 0,
          maximum: 1,
        },
        speed: {
          type: 'number',
          description: 'Speaking rate 0.7–1.2 (vendor default 1.0). Keep it identical across every cut of one video.',
          minimum: 0.7,
          maximum: 1.2,
        },
        useSpeakerBoost: {
          type: 'boolean',
          description: 'Boost similarity to the original speaker (vendor default true). Adds a little latency. multilingual_v2 only — ignored on eleven_v3 and flash_v2_5.',
        },
        seed: ELEVENLABS_SEED_PROPERTY,
        previousText: {
          type: 'string',
          description: 'The sentence(s) spoken right before this text in the finished audio — not synthesized, only used so the take continues the neighbor\'s tone. Use when re-rendering one cut of a scene. Not accepted by eleven_v3 (the vendor returns 400; the schema rejects it first).',
        },
        nextText: {
          type: 'string',
          description: 'The sentence(s) spoken right after this text — same purpose as previousText.',
        },
        applyTextNormalization: ELEVENLABS_NORMALIZATION_PROPERTY,
        outputFormat: ELEVENLABS_OUTPUT_FORMAT_PROPERTY,
        timestamps: ELEVENLABS_TIMESTAMPS_PROPERTY,
        outputPath: {
          type: 'string',
          description: 'Directory path to save the audio file (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the audio file (default: elevenlabs_<timestamp>.wav — .mp3 when outputFormat is mp3_*). The extension must match outputFormat.',
        },
      },
      required: ['text', 'voiceId'],
    },
  },
  {
    name: 'tts_elevenlabs_dialogue',
    title: 'Speech synthesis (ElevenLabs · multi-voice dialogue)',
    annotations: HINT.generate,
    description: `Voice a multi-speaker scene in ONE request with ElevenLabs text-to-dialogue (eleven_v3, up to ${ELEVENLABS_DIALOGUE_MAX_VOICES} distinct voices) — the lines come out as one continuous take with natural turn-taking.

Use when a scene has more than the 2 speakers tts_multi_speaker allows (the Gemini lane's 3-speaker workaround — one call per speaker plus 0.75s of silence between them — goes away), or when a 2-speaker scene should sound like one conversation rather than stitched cuts. Each line is {text, voiceId}; audio tags inside a line ("[laughs] 그게 말이 돼요?") direct that speaker. With timestamps: true the sidecar also carries voice_segments (which input/voice covers which span) — that is the subtitle speaker map for free.
Do NOT use for a single narrator — tts_elevenlabs_generate (or the free local lane) is cheaper per call and steadier. Do NOT exceed ~2,000 characters per request even though the hard cap is ${MAX_ELEVENLABS_DIALOGUE_CHARS} — the vendor recommends short requests for quality; split long scenes. The model is fixed to ${ELEVENLABS_DIALOGUE_MODEL} (every other model, v3_conversational included, is rejected). $0.10 per 1,000 characters; free-tier output is non-commercial.

Returns: a text block with the saved audio path (WAV by default), line and voice counts, duration, the vendor's measured character cost, request id, and the alignment sidecar path when timestamps were requested.`,
    inputSchema: {
      type: 'object',
      properties: {
        inputs: {
          type: 'array',
          description: `Ordered dialogue lines. Each line is spoken by its voiceId; consecutive lines may share a voice. 1–${ELEVENLABS_DIALOGUE_MAX_INPUTS} lines, at most ${ELEVENLABS_DIALOGUE_MAX_VOICES} distinct voices, ${MAX_ELEVENLABS_DIALOGUE_CHARS} characters in total (≈2,000 recommended).`,
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'What this speaker says (audio tags allowed, e.g. "[whispers] …")' },
              voiceId: ELEVENLABS_VOICE_ID_PROPERTY,
            },
            required: ['text', 'voiceId'],
          },
          minItems: 1,
          maxItems: ELEVENLABS_DIALOGUE_MAX_INPUTS,
        },
        stability: ELEVENLABS_STABILITY_PROPERTY,
        seed: ELEVENLABS_SEED_PROPERTY,
        languageCode: ELEVENLABS_LANGUAGE_CODE_PROPERTY,
        applyTextNormalization: ELEVENLABS_NORMALIZATION_PROPERTY,
        outputFormat: ELEVENLABS_OUTPUT_FORMAT_PROPERTY,
        timestamps: ELEVENLABS_TIMESTAMPS_PROPERTY,
        outputPath: {
          type: 'string',
          description: 'Directory path to save the audio file (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the audio file (default: elevenlabs_dialogue_<timestamp>.wav — .mp3 when outputFormat is mp3_*). The extension must match outputFormat.',
        },
      },
      required: ['inputs'],
    },
  },
  {
    name: 'tts_elevenlabs_voices',
    title: 'ElevenLabs voice list',
    annotations: HINT.read,
    description: `List the ElevenLabs voices this account can use — premade, cloned, designed, and Voice Library picks — with IDs, category, labels (gender · age · accent · use case) and verified languages, plus the plan's character usage when the key allows.

Use before tts_elevenlabs_generate / tts_elevenlabs_dialogue when no voiceId is pinned yet, or to find a Korean voice (search: "korean", or read the verified-languages column). Read-only; one GET per call. The Gemini and Supertonic voices are NOT here — tts_list_voices has those. Needs a key with the voices_read permission (a restricted key without it still synthesizes but returns missing_permissions here — then take the ID from the Voice Library page instead).
Do NOT pick a new voice per episode — pin one in data/<slug>/profile.md §2. The legacy premade voices retire 2026-12-31; prefer the current premade set or a library voice.

Returns: a text list "name — voice_id · category · labels · languages", the total count, whether more pages exist, and (when the key has user_read) the subscription tier with used/total characters and the reset date — Free tier output is non-commercial.`,
    inputSchema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Substring filter on name, description and labels (e.g. "korean", "calm female"). Omit to list everything.',
        },
        category: {
          type: 'string',
          description: 'Restrict to one category: premade (vendor defaults), cloned (your IVC/PVC), generated (Voice Design), professional (library PVC).',
          enum: [...ELEVENLABS_VOICE_CATEGORIES],
        },
        limit: {
          type: 'number',
          description: 'Voices per page 1–100 (default: 30)',
          minimum: 1,
          maximum: 100,
          default: 30,
        },
      },
      required: [],
    },
  },

  {
    name: 'stt_local_transcribe',
    title: 'Local speech-to-text (Qwen3-ASR)',
    annotations: HINT.generateLocal,
    description: `Transcribe speech to text **on this machine** using Qwen3-ASR via mlx-qwen3-asr — no API key, no network, no per-minute cost.

Use when the user asks to transcribe, caption, or turn speech into text (받아쓰기, STT, 전사), especially Korean. This is the DEFAULT local STT path: Korean is a first-class language (published Common Voice CER 5.88% / FLEURS CER 2.57% on the 1.7B). ingest (녹화→타임라인) uses the same engine when the binary is installed, and falls back to whisper.cpp if it is not.
Do NOT use this as a substitute for a finished timeline.md — timestamps here are word/segment offsets, not scene boundaries. Do NOT send the audio to a cloud STT when this tool is available.
Requires Apple Silicon and mlx-qwen3-asr (\`uv tool install --python 3.12 "mlx-qwen3-asr[aligner]"\`); set QWEN3_ASR_BIN if the binary lives elsewhere. The first call downloads ~3.4GB of Qwen3-ASR-1.7B weights (plus ForcedAligner when timestamps are on) to ~/.cache/huggingface — a slow first call is the download, not a hang. Weights are Apache 2.0.

Returns: a text block with the saved .json path, detected language, segment count, elapsed time, and the full transcript.`,
    inputSchema: {
      type: 'object',
      properties: {
        audioPath: {
          type: 'string',
          description:
            'Absolute path to the audio or video file to transcribe. Common containers work (wav/mp3/m4a/flac/mp4/mov) — ffmpeg extracts audio. Path must not contain "..".',
        },
        language: {
          type: 'string',
          description: `Spoken language (default: "${DEFAULT_QWEN3_ASR_LANGUAGE}"). Aliases such as ko/en/ja are folded to these names. Set it for short clips — auto-detect can miss a few seconds of Korean.`,
          enum: [...QWEN3_ASR_LANGUAGES],
          default: DEFAULT_QWEN3_ASR_LANGUAGE,
        },
        model: {
          type: 'string',
          description: `ASR model (default: "${DEFAULT_QWEN3_ASR_MODEL}" — best Korean). Qwen/Qwen3-ASR-0.6B is smaller and faster when the clip is clean and speed matters more than a few CER points.`,
          enum: [...QWEN3_ASR_MODELS],
          default: DEFAULT_QWEN3_ASR_MODEL,
        },
        context: {
          type: 'string',
          description:
            'Optional domain glossary, space- or comma-separated (앱 이름, 고유명사). Biases the decoder toward those terms — same job WHISPER_PROMPT does for whisper.cpp. Example: "Claude Code ISA 딸깍연구소".',
        },
        timestamps: {
          type: 'boolean',
          description:
            'Attach start/end seconds per segment (default: true). ingest and subtitle work need this; turn it off only for a plain text dump.',
          default: true,
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the transcript JSON (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the transcript JSON (default: stt_<timestamp>.json)',
        },
      },
      required: ['audioPath'],
    },
  },

  // ── Music generation (Google Lyria — ported from the fect-mcp music module) ────────────
  {
    name: 'music_generate_clip',
    title: 'Music generation (30s clip)',
    annotations: HINT.generate,
    description: `Generate a fixed 30-second music clip from a text prompt using Google Lyria 3 (batch, single call).

Use as the DEFAULT for short-form BGM, jingles, and post background music (배경음악, BGM) — cheaper ($0.04/clip) and simpler than the streaming tools. Lyria 3 has no structured parameters: describe genre, instruments, BPM, key, mood, and structure in natural language inside the prompt, optionally with section tags ([Intro] [Verse] [Chorus] [Outro]) or timestamps ("[0:00 - 0:10] Intro: ..."). Can generate vocals and lyrics — add "instrumental only, no vocals" to the prompt if unwanted. Output carries a SynthID audio watermark.
If the request is blocked for "an unspecified policy reason", that is prompt filtering, not a bug — reword the prompt more plainly and retry once rather than repeating the same text.
Do NOT use when an exact non-30s duration is required, or when the same music must be reproducible — use music_generate / music_generate_advanced (seed) instead. Non-deterministic: the same prompt returns different music each call, so store signature BGM as a reusable asset.

Returns: a text block with the saved .mp3 file path (44.1kHz stereo, exactly 30 seconds).`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Natural-language description including genre, instruments, BPM, key, mood (e.g., "Calm lo-fi hip hop, 80 BPM, C major, soft piano and vinyl crackle, instrumental only")',
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the audio file (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the audio file (default: music_clip_<timestamp>.mp3)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'music_generate',
    title: 'Music generation (set duration)',
    annotations: HINT.generate,
    description: `Generate instrumental music from a text prompt using Google Lyria RealTime (streaming).

Use when the requested duration must be controlled (5-300s) — e.g. matching a narration length. For standard 30-second short-form BGM, prefer music_generate_clip (cheaper, single call). Optionally constrain genre, mood, instruments, BPM (60-200). Genre/mood/instrument values are free text — music_list_options shows suggestions, not a closed list.
Do NOT use for vocals or lyrics — Lyria RealTime is instrumental-only. For a sung song use suno_generate. For blending multiple weighted musical ideas or tuning density/brightness/seed, use music_generate_advanced.
For BGM under narration, say so in the prompt (e.g. "leaves space for a spoken voiceover, no melody in the vocal frequency range").

Returns: a text block with the saved .wav file path (48kHz stereo 16-bit PCM), duration, and applied settings.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description of the music to generate (e.g., "upbeat electronic dance music")',
        },
        genre: {
          type: 'string',
          description: 'Optional genre — free text (e.g., "Jazz", "Synthwave", "Bossa Nova"); see music_list_options for suggestions',
        },
        mood: {
          type: 'string',
          description: 'Optional mood/atmosphere — free text (e.g., "Energetic", "Calm", "Epic")',
        },
        instruments: {
          type: 'array',
          description: 'Optional array of instruments — free text (e.g., "Piano", "303 Acid Bass")',
          items: { type: 'string' },
        },
        durationSeconds: MUSIC_DURATION_PROPERTY,
        bpm: {
          type: 'number',
          description: 'Beats per minute (60-200)',
          minimum: 60,
          maximum: 200,
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the audio file (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the audio file (default: music_<timestamp>.wav)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'music_generate_advanced',
    title: 'Music generation (weighted prompts · fine control)',
    annotations: HINT.generate,
    description: `Generate instrumental music by blending multiple weighted prompts with fine-grained controls (Google Lyria RealTime).

Use when the request needs blended musical ideas — e.g. [{"text": "jazz piano", "weight": 1.0}, {"text": "electronic beats", "weight": 0.5}] — or fine tuning of guidance, density, brightness, temperature, scale (key), seed (reproducibility), or bass/drum controls. seed is the ONLY way to regenerate the same music (Lyria 3 Clip has no seed) — record the seed of a channel's signature BGM to keep later episodes consistent.
Do NOT use for a simple single-idea request — music_generate is sufficient and simpler. No vocals or lyrics (Lyria RealTime is instrumental-only — sung songs go to suno_generate).

Returns: a text block with the saved .wav file path (48kHz stereo 16-bit PCM), duration, and the applied prompt weights/config.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompts: {
          type: 'array',
          description: 'Array of weighted prompts to blend',
          items: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Musical description (e.g., "minimal techno", "jazz piano")',
              },
              weight: {
                type: 'number',
                description: 'Weight for this prompt — any non-zero value (0 is invalid; 1.0 is the typical starting point; larger = stronger influence)',
                default: 1.0,
              },
            },
            required: ['text'],
          },
          minItems: 1,
        },
        durationSeconds: MUSIC_DURATION_PROPERTY,
        config: {
          type: 'object',
          description: 'Optional generation configuration',
          properties: {
            guidance: {
              type: 'number',
              description: 'Prompt adherence (0.0-6.0, default: 4.0)',
              minimum: 0,
              maximum: 6,
              default: 4.0,
            },
            bpm: {
              type: 'number',
              description: 'Beats per minute (60-200)',
              minimum: 60,
              maximum: 200,
            },
            scale: {
              type: 'string',
              description: 'Musical key/scale. Each value covers both the major key and its relative minor.',
              enum: MUSIC_SCALE_ENUM,
            },
            density: {
              type: 'number',
              description: 'Note density (0.0-1.0)',
              minimum: 0,
              maximum: 1,
            },
            brightness: {
              type: 'number',
              description: 'Tonal brightness (0.0-1.0)',
              minimum: 0,
              maximum: 1,
            },
            temperature: {
              type: 'number',
              description: 'Creativity level (0.0-3.0; model default 1.1 when omitted)',
              minimum: 0,
              maximum: 3,
            },
            topK: {
              type: 'number',
              description: 'Sampling constraint (1-1000, model default 40)',
              minimum: 1,
              maximum: 1000,
            },
            seed: {
              type: 'number',
              description: 'Random seed (0-2147483647). The only way to reproduce the same music for a channel signature BGM.',
              minimum: 0,
              maximum: 2147483647,
            },
            muteBass: {
              type: 'boolean',
              description: 'Reduce bass elements',
              default: false,
            },
            muteDrums: {
              type: 'boolean',
              description: 'Reduce drum elements',
              default: false,
            },
            onlyBassAndDrums: {
              type: 'boolean',
              description: 'Generate only the rhythm section (bass and drums)',
              default: false,
            },
            musicGenerationMode: {
              type: 'string',
              description: 'QUALITY (default) | DIVERSITY | VOCALIZATION (treats vocalizations as an instrument — still no lyrics)',
              enum: MUSIC_MODE_ENUM,
            },
          },
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the audio file',
        },
        filename: {
          type: 'string',
          description: 'Filename for the audio file',
        },
      },
      required: ['prompts'],
    },
  },
  {
    name: 'mlx_music_generate',
    title: 'Music generation (local · MLX Core)',
    annotations: HINT.generateLocal,
    description: `Generate music on this machine via MLX Core / mlx-serve POST /v1/audio/music-generations. Returns raw WAV. No vendor bill. This plugin never launches the app.

Use as an optional local bed when MLX Core is running with a music model. Default is instrumental:true and durationSeconds ${DEFAULT_MLX_MUSIC_SECONDS} (${MIN_MLX_MUSIC_SECONDS}–${MAX_MLX_MUSIC_SECONDS}). instrumental:true cannot be sent beside lyrics — mlx-serve returns 400; set instrumental false to sing, or drop lyrics for a bed.
Do NOT use as the default BGM path — that stays music_generate_clip (Lyria, GEMINI_API_KEY). Autoproduce unattended still takes the Lyria clip. Vocals fight voiceover; keep instrumental true under narration.
Requires Apple Silicon, macOS 26.2+, and MLX Core.app or mlx-serve (or MLX_SERVE_URL). brew install --cask mlx-core if :11234 is down.

Returns: a text block with the saved .wav path, model, duration, and generation time.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Music prompt (max 4,000 characters). Describe genre, instruments, mood. For a bed under narration, ask for space in the vocal frequency range.',
          maxLength: 4000,
        },
        model: {
          type: 'string',
          description: 'mlx-serve model id. Omit to pick a ready model that advertises capability "music".',
        },
        lyrics: {
          type: 'string',
          description: 'Optional lyrics. Do not send these when instrumental is true — that is a 400.',
          maxLength: 8000,
        },
        instrumental: {
          type: 'boolean',
          description: 'Instrumental bed (default: true). Set false to sing lyrics.',
          default: true,
        },
        durationSeconds: {
          type: 'number',
          description: `Length in seconds (default: ${DEFAULT_MLX_MUSIC_SECONDS}, ${MIN_MLX_MUSIC_SECONDS}–${MAX_MLX_MUSIC_SECONDS}).`,
          minimum: MIN_MLX_MUSIC_SECONDS,
          maximum: MAX_MLX_MUSIC_SECONDS,
          default: DEFAULT_MLX_MUSIC_SECONDS,
        },
        seed: {
          type: 'number',
          description: 'Random seed. Omit for a random seed.',
          minimum: 0,
        },
        refAudioPath: {
          type: 'string',
          description: 'Optional reference clip (absolute path, sent as base64).',
        },
        outputPath: {
          type: 'string',
          description: 'Directory path to save the audio (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename for the audio (default: mlx_music_<timestamp>.wav)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'capability_status',
    title: 'What this machine can do right now',
    annotations: HINT.local,
    description: `Report which generation and research capabilities are configured on this machine, grouped by capability with an "N of M configured" count per group, plus the env vars that would unlock the rest.

Use it BEFORE planning anything that spends money or depends on a provider — the top of a storyboard, produce, or autoproduce run. Without it, a missing key shows up only when the call fails, which is after the plan was built around a tool that was never going to run: planning two Veo b-roll slots on a machine with no GEMINI_API_KEY costs the review rounds before anyone finds out. Also use it when the user asks what they can make, or why a tool is failing.
Do NOT use it to test whether a key still works. It reports CONFIGURATION, not reachability — a revoked key reads as configured here and fails at the call. Local engines report only whether their binary resolves (mflux, python3, mlx-qwen3-asr) or whether MLX Core.app / mlx-serve is installed — not whether :11234 is up. Read-only; makes no API call, so one call per session is enough.

Returns: a capability menu — video_generation, image_generation, tts, music_generation, 3d_generation, speech_to_text, research — each listing its providers with the env var or local install each one needs, then the publishing platforms that have credential files, then the env vars grouped by what each would turn on.`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'music_list_options',
    title: 'Music option list',
    annotations: HINT.local,
    description: `List suggested genres, moods, and instruments for music generation.

Use when the user asks what music styles are available (장르 목록) or wants inspiration. The lists are SUGGESTIONS, not a closed set — all music tools accept free-text descriptions beyond these. Read-only; makes no API call.
Do NOT use to generate music — use music_generate_clip, music_generate, or music_generate_advanced. The list is static; one call per session is enough.

Returns: categorized text lists — 32 genres, 25 moods, 22 instruments (non-exhaustive).`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // ── Music generation (Suno — sunoapi.org third-party REST, not an official API) ────
  {
    name: 'suno_generate',
    title: 'Suno full song',
    annotations: HINT.generate,
    description: `Generate a full Suno song (exactly 2 variants) via sunoapi.org. This is a third-party REST wrapper — Suno Inc. has no public self-serve API as of 2026-08.

Use when the user wants a SUNG song, jingle, or original track with lyrics — the thing Lyria cannot do well. customMode=false: only prompt, the model writes lyrics. customMode=true + instrumental=false: prompt IS the lyrics (write them first with suno_generate_lyrics if needed). customMode=true + instrumental=true: no vocals; style and title required. Default model V5 (up to 8 min). Each call takes 2–3 minutes and returns two mp3 files downloaded locally (remote URLs expire in 15 days).
Do NOT use as the default narration-under BGM bed — vocals fight the voiceover, and a 3-minute song does not loop cleanly. For looping beds prefer suno_generate_sound or music_generate_clip (Lyria, $0.04, 30s, GEMINI_API_KEY). For an exact duration 5–300s or seed reproducibility use music_generate.
Requires SUNO_API_KEY. This key being unset does not block music_*(Lyria).

Returns: saved file paths for both tracks, durations, titles, taskId.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'In non-custom mode: the idea the model turns into lyrics+music (required, max 3000 chars). In custom mode with vocals: the EXACT lyrics to sing (required, V4 max 3000, V4_5+ max 5000). Omit when customMode+instrumental.',
        },
        customMode: {
          type: 'boolean',
          description: 'false (default): prompt-only, auto lyrics. true: you supply style+title, and lyrics via prompt unless instrumental.',
          default: false,
        },
        instrumental: {
          type: 'boolean',
          description: 'true = no vocals. In custom mode this drops the lyrics requirement (style+title still required). Default false.',
          default: false,
        },
        style: {
          type: 'string',
          description: 'Genre/style for custom mode (required when customMode=true). V4 max 200 chars, later models max 1000. Example: "calm lo-fi, soft piano, space for voiceover"',
        },
        title: {
          type: 'string',
          description: 'Track title for custom mode (required when customMode=true). V4/V4_5ALL max 80 chars, others max 100.',
        },
        model: {
          type: 'string',
          description: `Suno model (default: "${DEFAULT_SUNO_MODEL}"). V4 ≤4 min; V4_5 / V4_5PLUS / V4_5ALL / V5 / V5_5 ≤8 min. V5_5 is the only model that accepts duration. Pick V5 unless you need V5_5 duration or V4_5ALL structure.`,
          enum: [...SUNO_MODELS],
          default: DEFAULT_SUNO_MODEL,
        },
        duration: {
          type: 'number',
          description: 'Length in seconds (10–360). Only valid when model=V5_5 AND customMode=true. Integer.',
          minimum: 10,
          maximum: 360,
        },
        negativeTags: {
          type: 'string',
          description: 'Styles to exclude, comma-separated (e.g. "Heavy Metal, Upbeat Drums")',
        },
        vocalGender: {
          type: 'string',
          description: 'Preferred vocal gender when not instrumental.',
          enum: [...SUNO_VOCAL_GENDERS],
        },
        personaId: {
          type: 'string',
          description: 'Optional persona or Suno Voice id for custom mode.',
        },
        personaModel: {
          type: 'string',
          description: 'style_persona (default) for Generate Persona ids, voice_persona for Suno Voice ids (V5/V5_5 only).',
          enum: [...SUNO_PERSONA_MODELS],
        },
        pickTrack: {
          type: 'number',
          description: 'Which of the two variants to treat as primary (0 or 1, default 0). Both files are still saved.',
          minimum: 0,
          maximum: 1,
          default: 0,
        },
        outputPath: {
          type: 'string',
          description: 'Directory to save the audio files (default: current working directory)',
        },
        filename: {
          type: 'string',
          description:
            'Primary filename (default: suno_<timestamp>.mp3). Use .wav to transcode the picked track to 48kHz stereo PCM for build-reel.sh (bgm.wav). The other variant is saved as <stem>_a.mp3 / <stem>_b.mp3.',
        },
      },
      required: [],
    },
  },
  {
    name: 'suno_generate_sound',
    title: 'Suno loopable BGM',
    annotations: HINT.generate,
    description: `Generate a loopable Suno sound/bed (V5 only) with optional BPM and musical key.

Use as the Suno path for short-form BGM under narration — looping ambient, beds, stings. soundLoop defaults to true. Prompt max 500 chars. Takes about 1–3 minutes. For a cheap 30s bed without SUNO_API_KEY, use music_generate_clip (Lyria).
Do NOT use for a sung song — that is suno_generate. Do NOT use when you need an exact second-accurate length other than what the model returns; trim with ffmpeg afterwards.

Returns: saved file path(s). Pass filename ending in .wav to transcode for .work/bgm.wav.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Sound description, max 500 chars (e.g. "soft lo-fi bed, muted keys, leaves space for a spoken voiceover, no melody in the vocal range")',
        },
        soundLoop: {
          type: 'boolean',
          description: 'Make the result loop-friendly (default true).',
          default: true,
        },
        soundTempo: {
          type: 'number',
          description: 'BPM 1–300. Omit for Auto.',
          minimum: 1,
          maximum: 300,
        },
        soundKey: {
          type: 'string',
          description: 'Musical key (default Any).',
          enum: [...SUNO_SOUND_KEYS],
        },
        pickTrack: {
          type: 'number',
          description: 'Which variant to treat as primary (0 or 1, default 0).',
          minimum: 0,
          maximum: 1,
          default: 0,
        },
        outputPath: {
          type: 'string',
          description: 'Directory to save the audio file (default: current working directory)',
        },
        filename: {
          type: 'string',
          description: 'Filename (default: suno_<timestamp>.mp3). Use .wav for 48kHz stereo PCM.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'suno_generate_lyrics',
    title: 'Suno lyrics',
    annotations: HINT.generate,
    description: `Generate lyrics only (no audio) via sunoapi.org. Several variants come back, typically with [Verse]/[Chorus] markers.

Use to draft lyrics before suno_generate in customMode (pass the chosen text as prompt). Prompt max 200 characters — describe theme, mood, structure; do not paste a full song here.
Do NOT use when you already have lyrics. Do NOT use for narration copy — that is TTS / scenes.js.

Returns: title + lyrics text for each variant, plus taskId.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Theme/mood/structure for the lyrics, max 200 characters (e.g. "a hopeful song about starting over in a new city, verse-chorus, Korean")',
          maxLength: 200,
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'suno_credits',
    title: 'Suno remaining credits',
    annotations: HINT.read,
    description: `Read remaining sunoapi.org credits for SUNO_API_KEY.

Use before a batch of suno_generate calls. Generate consumes about 12 credits per request (≈ $0.06 at the $5/1000-credit pack). Insufficient credits fail with code 429.
Do NOT use to generate music.

Returns: integer credit balance.`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // ── First-party SNS publishing (per-platform tools — local credentials, immediately public) ──────
  // Only tools for platforms with a credentials file are exposed in ListTools (index.ts + SNS_PLATFORM_BY_TOOL).
  // Multi-channel: with channel (brand slug) set, only <SNS_TOKEN_DIR>/<slug>/ tokens are used (no fallback).
  {
    name: 'threads_publish',
    title: '⚠️ Threads publish (immediately public)',
    annotations: HINT.publish,
    outputSchema: publishOutput('postId', 'Threads post id — pass as replyToId to chain a follow-up reply'),
    description:
      `⚠️ Direct Threads publishing — posts to the Threads API with local tokens, **immediately public** (the posting account is auto-resolved from the token's /me). There is no separate review gate, so call only right after the user has checked and approved the final copy and media (HITL — never call without approval). A post carries one of four shapes: a video (videoUrl), a single image (imageUrl), a link preview card (linkUrl), or text alone. The three media fields are mutually exclusive — one media_type per post. **Video episodes put the video on the post itself via videoUrl**, so it plays inline in the timeline with nothing to click away to; do not attach the video as a reply or fall back to a bare link (user directive 2026-08-19). Carousels are not supported by this tool. Publish quota: 250 per 24 hours. ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        caption: {
          type: 'string',
          description:
            'Final post body, ≤500 chars (≤1 hashtag recommended — ranking weight 0). Emoji count as their UTF-8 bytes on this platform, i.e. more than 1 char each',
        },
        imageUrl: { type: 'string', format: 'uri', description: 'One publicly reachable image URL (the platform crawls it — local paths won\'t work); mutually exclusive with videoUrl and linkUrl' },
        videoUrl: {
          type: 'string',
          format: 'uri',
          description:
            'One publicly reachable video URL (.mp4/.mov) carried by the post itself — mutually exclusive with imageUrl and linkUrl. **This is the default for video episodes.** Give the subtitle-burned cut: the Threads container takes no subtitle file, so burning them into the picture is the only way (same as IG reels). Video containers transcode, and the tool waits up to 2 minutes for FINISHED',
        },
        linkUrl: {
          type: 'string',
          format: 'uri',
          description:
            'Link preview card URL attached to the post. Text posts only, so mutually exclusive with imageUrl and videoUrl; writing the same URL in the caption still counts as one link to the platform (cap 5). **Meta\'s own URLs (an IG reels permalink) come back 400** — put those in the body text instead',
        },
        replyToId: { type: 'string', description: 'Publish as a reply to this post id (own reply chain, or joining someone else\'s post)' },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['caption'],
    },
  },
  {
    name: 'instagram_publish',
    title: '⚠️ Instagram publish (immediately public)',
    annotations: HINT.publish,
    outputSchema: publishOutput('mediaId', 'Instagram media id'),
    description:
      `⚠️ Direct Instagram publishing — posts to the IG API with local tokens, **immediately public** (the posting account is auto-resolved from the token's /me). There is no separate review gate, so call only right after the user has checked and approved the final copy and media (HITL — never call without approval). 1-10 images (2+ makes a carousel) **or** one Reels video (mutually exclusive with imageUrls). Images must be **JPEG only** (PNG/MPO/JPS rejected). Images cannot be replaced after publishing (only the caption can be edited). Publish quota: 100 per rolling 24 hours (a carousel counts as 1). ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        caption: { type: 'string', description: 'Final caption, ≤2,200 chars (the first 125 are the hook — links in captions are not clickable)' },
        imageUrls: {
          type: 'array',
          items: { type: 'string', format: 'uri' },
          description: '1-10 publicly reachable image URLs (2+ makes a carousel — force-cropped to the first image\'s ratio). Cannot be used together with videoUrl',
        },
        videoUrl: {
          type: 'string',
          format: 'uri',
          description:
            'One public Reels video URL (.mp4/.mov) — cannot be used together with imageUrls. **Provide the burned-in subtitle master** — IG Content Publishing has no parameter for a subtitle file, so unlike the platforms that take subtitles separately, subtitles burned into the frame are the only way here',
        },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['caption'],
    },
  },
  {
    name: 'facebook_publish',
    title: '⚠️ Facebook Page publish (immediately public)',
    annotations: HINT.publish,
    outputSchema: FACEBOOK_PUBLISH_OUTPUT,
    description:
      `⚠️ Direct Facebook Page publishing — posts to the Graph API with the local Page token, **immediately public** (the posting Page is auto-resolved from the token's /me). There is no separate review gate, so call only right after the user has checked and approved the final copy and media (HITL — never call without approval). Forms: text / up to 10 images / one video (regular video — not Reels). Video posts **include a subtitle file** (captionFilePath) — this pipeline uploads subtitles separately instead of burning them in, so give videoUrl the clean subtitle-free master, not a burned-in copy. The source link goes **without exception** in the first comment via facebook_comment right after a successful publish, not in the body (linkUrl). ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        caption: { type: 'string', description: 'Final post body, ≤5,000 chars' },
        imageUrls: {
          type: 'array',
          items: { type: 'string', format: 'uri' },
          description: 'Up to 10 publicly reachable image URLs — cannot be used together with videoUrl',
        },
        videoUrl: { type: 'string', format: 'uri', description: 'One public video URL (.mp4/.mov) — cannot be used together with imageUrls. Give the **clean master**, not a burned-in copy (subtitles go separately via captionFilePath)' },
        captionFilePath: {
          type: 'string',
          description:
            '**Local** absolute path to the subtitle file (.srt, ≤200K) — valid only on videoUrl posts. Unlike the video URL it needs no hosting (direct file upload). It uploads automatically right after a successful publish; if only the subtitles fail, captionWarning is returned (the post stands — do not re-publish). Single-locale shorthand — for two or more languages use captionFiles instead (mutually exclusive)',
        },
        captionLocale: {
          type: 'string',
          description:
            'Subtitle locale (default ko_KR). Must be of the `ko_KR`/`en_US`/`vi_VN` form — FB derives the locale from whether the uploaded file name is `<name>.<locale>.srt`, and rejects a malformed one with error 386',
        },
        captionFiles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Local absolute path of the .srt for this locale (≤200K)' },
              locale: { type: 'string', description: 'Locale of this file — `ko_KR`/`en_US`/`vi_VN` form, one entry per locale' },
            },
            required: ['filePath', 'locale'],
          },
          description:
            'Multi-language subtitles — one caption upload per entry, valid only on videoUrl posts and mutually exclusive with captionFilePath. **Put the default-language track first** — only the first entry declares default_locale (per-call default_locale on every track is undocumented behavior, so this tool declares the default exactly once). A failed locale comes back in captionWarning with the post intact — retry just that locale',
        },
        linkUrl: { type: 'string', format: 'uri', description: '(Exception only) link attachment — text posts (no media) only. The default rule is to put the link in the first comment via facebook_comment' },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['caption'],
    },
  },
  {
    name: 'facebook_comment',
    title: '⚠️ Facebook comment (immediately public)',
    annotations: HINT.publish,
    outputSchema: publishOutput('commentId', 'Facebook comment id'),
    description:
      `⚠️ Direct Facebook Page commenting — adds an **immediately public** comment on the Page's own post with the Page token (the author is the Page itself). There is no separate review gate, so publish only copy the user has approved (HITL — never call without approval). Main use: the link rule of putting the source link in the **first comment** right after a facebook_publish success (first comment instead of a body link — FB comment links are clickable and render previews). Use postId straight from the facebook_publish response. If only the comment failed, retry just this tool (do not re-publish the post — the publish API is non-idempotent). ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string', description: 'postId from the facebook_publish response (<pageId>_<postId> form)' },
        message: { type: 'string', description: 'Final comment, ≤8,000 chars — the source link plus a one-line note' },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['postId', 'message'],
    },
  },
  {
    name: 'youtube_publish',
    title: '⚠️ YouTube upload (immediately public)',
    annotations: HINT.publish,
    outputSchema: YOUTUBE_PUBLISH_OUTPUT,
    description:
      `⚠️ Direct YouTube publishing — uploads a **local video file, immediately public**, with the local OAuth refresh token (the target channel is the token-owning account). There is no separate review gate, so call only right after the user has checked and approved the final copy and video (HITL — never call without approval). Portrait 9:16 videos of 3 minutes or less are auto-classified as Shorts (no separate flag). The only platform that needs no public URL hosting (direct file upload — subtitle files included). **Video and subtitles upload separately** — pass an .srt via captionFilePath and give videoFilePath the clean master with no burned-in subtitles. Uploads draw from the videos.insert-only "Video Uploads" quota bucket — 1 unit per call, 100/day by default, so there is no reason to ration episode publishing (the old "1,600 units = 6/day" limit disappeared in the 2026 quota overhaul). ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        videoFilePath: { type: 'string', description: 'Absolute path of the local video file to upload (.mp4/.mov)' },
        title: { type: 'string', description: 'Video title, ≤100 chars (angle brackets <> forbidden) — keyword-style recommended (title search weighs heavily for Shorts)' },
        caption: { type: 'string', description: 'Final video description, **≤5,000 bytes** (not characters — Korean runs 3 bytes per character, about 1,666 chars) — first-line summary plus key points. **Hashtags differ per format** — for 9:16 Shorts attach 3-5 including #Shorts; 16:9 long-form gets no #Shorts (it would be misclassified onto the Shorts surface). Long-form carries **chapter timestamps** instead of hashtags — the documented requirements are a first line at 00:00, 3 or more chapters, each 10+ seconds. **What happens when you break them is not in the official docs** — we confirmed the 10 seconds is not actually enforced (21 two-second chapters rendered fine); the only certainties are that auto-chapters default on for new uploads and a manual list in the description overrides them. Break the requirements and your list may be ignored in favor of auto-chapters.' },
        thumbnailFilePath: {
          type: 'string',
          description:
            'Absolute path of the cover still (.jpg/.png ≤2MB) — **required**. Without it YouTube picks an arbitrary frame as the thumbnail, the title cover never shows, and the vertical surface cannot be reverted via the API after publishing. What this changes is the **landscape surfaces** only (search results, share previews, embeds) — the vertical frame (oar*) in the Shorts feed and the channel Shorts tab changes only through frame selection in the native YouTube app (publish skill §3, the vertical-surface step). Channels without phone verification (intermediate features) get the thumbnail rejected — the publish still succeeds and reports via thumbnailWarning',
        },
        captionFilePath: {
          type: 'string',
          description:
            'Absolute path of the subtitle file (.srt) — **pass it by default**. Uploading subtitles separately instead of burning them in means they can be swapped after publishing, viewers can toggle them, and they seed YouTube auto-translation. Give videoFilePath the clean subtitle-free master, not a burned-in copy. The upload needs the **youtube.force-ssl scope** (rejected on the publish-only youtube.upload) and costs a **quota of 400 units** per track — heavy next to the 1-unit video upload, so once per language per episode. If only the subtitles fail, captionWarning is returned and the publish stands (do not re-upload). Single-track shorthand — for two or more languages use captionTracks instead (mutually exclusive)',
        },
        captionLanguage: {
          type: 'string',
          description: 'Subtitle language, BCP-47 (default ko) — e.g. ko, en, vi. Becomes the source language for auto-translation',
        },
        captionTracks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Absolute path of the .srt for this language' },
              language: { type: 'string', description: 'BCP-47 hyphen form (ko, en, vi, pt-BR) — the underscore form ko_KR is the Facebook contract and is rejected here' },
            },
            required: ['filePath', 'language'],
          },
          description:
            'Multi-language subtitle tracks — one captions.insert per entry, so viewers pick their language in the player and each track seeds auto-translation. Mutually exclusive with captionFilePath. Every file is validated before the video upload starts; each track costs 400 quota units, and a failed language comes back in captionWarning with the publish intact (upload just that language in YouTube Studio instead of re-publishing)',
        },
        privacyStatus: {
          type: 'string',
          enum: ['public', 'unlisted', 'private'],
          description: 'Privacy (default public)',
        },
        categoryId: {
          type: 'string',
          description:
            'YouTube category id (default "22" = People & Blogs). Feeds recommendation/browse classification, so set it to match the channel — 24=Entertainment, 25=News & Politics, 26=Howto & Style, 27=Education, 28=Science & Technology.',
        },
        madeForKids: {
          type: 'boolean',
          description:
            'Made-for-kids self-declaration (COPPA, default false). If the video targets children, set true — a false declaration is grounds for channel sanctions, and true disables comments and personalized ads.',
          default: false,
        },
        containsSyntheticMedia: {
          type: 'boolean',
          description:
            'Synthetic-media self-disclosure — **default true** (this pipeline uses Veo video and Lyria music). YouTube requires disclosure for realistic-looking AI-generated or altered content (AI-generated music, realistic generated footage of real places or people) and warns that habitual non-disclosure brings forced labels, removal, and YPP suspension. It also states outright that disclosure "does not affect exposure or monetization eligibility", so when in doubt leaving it on costs nothing. It may be set false only for clearly exempt uses — script/title/thumbnail generation, subtitle generation, idea generation, cloning your own voice, non-realistic animation or fantasy footage, color grading and beauty filters.',
          default: true,
        },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['videoFilePath', 'title', 'caption', 'thumbnailFilePath'],
    },
  },
  {
    name: 'youtube_update',
    title: '⚠️ YouTube video metadata & privacy update',
    annotations: HINT.moderate,
    outputSchema: YOUTUBE_UPDATE_OUTPUT,
    description:
      '⚠️ Edits the privacy, title, or description of an already-published YouTube video (videos.update). **Applies the instant it is called and cannot be undone — never call without human approval.** **This is stage two of the long-form two-stage publish** — upload an 8-15 minute video as privacyStatus "private", have a human check encoding, subtitles, and chapters on the watch page, then flip it public with this tool. Going straight to public, short-form style, means viewers see the failure first. **videos.update overwrites rather than patching**, so this tool first reads the current values via videos.list and merges — fields you did not pass are re-sent as they are now (title, description, tags, language, COPPA declaration, synthetic-media disclosure, all of it). The change is irreversible, so **on a video you have not touched before, call dryRun: true first and eyeball wouldSend.** publishAt (scheduled publish) only takes effect while privacyStatus is private — otherwise a 400 rejection. **Scope**: youtube (read-only youtube.readonly won\'t do, and neither will the publish-only youtube.upload). When missing, the error carries reissue guidance.',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: { type: 'string', description: 'Target video id (the v= value in the permalink)' },
        privacyStatus: {
          type: 'string',
          enum: ['public', 'unlisted', 'private'],
          description: 'Privacy. Omitted keeps the current value',
        },
        title: { type: 'string', description: 'Title, ≤100 chars. Omitted keeps the current title' },
        description: { type: 'string', description: 'Description, ≤5,000 bytes (about 1,666 Korean chars). For long-form the chapter timestamps live here. Omitted keeps the current description' },
        categoryId: { type: 'string', description: 'YouTube category id. Omitted keeps the current value' },
        madeForKids: { type: 'boolean', description: 'COPPA self-declaration. Omitted keeps the current value — this tool guards against the API trap where omitting the field resets it to the default' },
        containsSyntheticMedia: { type: 'boolean', description: 'Synthetic-media disclosure. Omitted keeps the current value' },
        publishAt: { type: 'string', description: 'Scheduled publish time (RFC3339, e.g. 2026-08-20T09:00:00Z). Takes effect only when passed together with privacyStatus "private"' },
        dryRun: { type: 'boolean', description: 'Returns the body that would be sent, without calling. A check before an irreversible change', default: false },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['videoId'],
    },
  },
  {
    name: 'youtube_insights',
    title: 'YouTube performance insights',
    annotations: HINT.read,
    outputSchema: YOUTUBE_INSIGHTS_OUTPUT,
    description:
      'YouTube performance insights — returns channel stats (subscribers, total views), window metrics (views, engagedViews, average view duration, average view percentage, subscriber gain/loss), and per-recent-upload metrics in one call (read-only, no side effects). The grow-youtube loop snapshots this every tick to judge tick-over-tick change and which video types are landing — storing and comparing is the caller\'s job in data/<channel>/growth/youtube/. **Two scopes required**: youtube.readonly for channel/video lookups, yt-analytics.readonly for window metrics. Tokens issued with publish-only youtube.upload have neither, so a reissue is needed; when missing, the error carries reissue guidance. Revenue metrics (includeRevenue) additionally need yt-analytics-monetary.readonly, and even if that fails the other metrics still arrive. **Analytics data runs 2-3 days behind**, so empty-looking values for yesterday/today are normal — set days to 7+ to see a trend. Two blocks sit outside that lag: the per-video lifetime block (Data API video statistics) and the channel-level account block (Data API channels.list statistics) both move in near real time, while period — shares and averageViewPercentage included — follows the lag. The swipe-away rate used for Shorts hook verdicts (Studio\'s "How many chose to view") has no corresponding Analytics API metric and cannot be fetched here — substitute averageViewPercentage and check the swipe metric manually in Studio.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Days to aggregate (default 7, 1-365). Analytics lags 2-3 days, so under 7 can look empty' },
        videoLimit: { type: 'number', description: 'Recent uploads to attach metrics to (default 10, max 50; 0 = channel metrics only)' },
        includeRevenue: {
          type: 'boolean',
          description: 'Include revenue metrics (default false) — needs the extra yt-analytics-monetary.readonly scope',
          default: false,
        },
        channel: SNS_CHANNEL_PROPERTY,
      },
    },
  },

  // ── Inbound comment management (inbox → reply → hide) ────────────────────────
  // Cross-platform tools, so no SNS_CHANNEL_BY_TOOL gate — unconfigured platforms
  // come back in skipped with a reason (same treatment as sns_account_check).
  {
    name: 'sns_comment_inbox',
    title: 'Inbound comment inbox',
    annotations: HINT.read,
    outputSchema: COMMENT_INBOX_OUTPUT,
    description:
      'Inbound comment inbox — gathers comments and sub-comments on recent Threads/Instagram/Facebook/YouTube posts into one normalized list (read-only, no side effects). The default is **only other people\'s comments we have not yet answered** (includeOwn/includeAnswered=false) — "already answered" is decided by platform fields (Threads is_reply_owned_by_me · IG username match · FB from.id==pageId · YT authorChannelId match), not guesswork, so no duplicate replies go out. YouTube judges by the time of our last reply within the thread, so a new comment arriving **after** our reply counts as unanswered. Threads whose reply list could not be fetched in full (over 100 replies, or a failed lookup) leave no basis for a verdict, so they are **treated as answered and dropped from the list** — a missed comment gets caught on the next pass, while the opposite mistake sends a duplicate reply out in public. Each comment carries ageMinutes, and summary.withinGoldenHour is the count still unanswered within their first 60 minutes (reply speed drives distribution — treat a non-zero value as top priority). Pass the commentId from the response straight into sns_comment_reply/sns_comment_moderate. Without the comment scope (youtube.force-ssl), YouTube lands in skipped with reissue guidance.',
    inputSchema: {
      type: 'object',
      properties: {
        platforms: {
          type: 'array',
          items: { type: 'string', enum: ['THREADS', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE'] },
          description: 'Platforms to query (omitted: all 4 platforms with credentials)',
        },
        channel: SNS_CHANNEL_PROPERTY,
        postLimit: { type: 'number', description: 'Recent posts to scan per platform (default 5, max 25)' },
        commentLimit: { type: 'number', description: 'Comments to fetch per post (default 50, max 100)' },
        sinceHours: { type: 'number', description: 'Only comments within this many hours (e.g. 24 — omitted: all)' },
        includeAnswered: { type: 'boolean', description: 'Also include comments we already answered (default false — true only when you need the full thread context)' },
        includeOwn: { type: 'boolean', description: 'Also include comments written by our own account (default false — for reviewing the conversation flow)' },
      },
    },
  },
  {
    name: 'sns_comment_reply',
    title: '⚠️ Reply to inbound comment (immediately public)',
    annotations: HINT.publish,
    outputSchema: COMMENT_REPLY_OUTPUT,
    description:
      `⚠️ Replies to an inbound comment — posts an **immediately public** reply with local tokens (the author is the brand account itself). There is no separate review gate, so publish only copy the user has approved (HITL — never call without approval). Use commentId straight from the sns_comment_inbox response. Per-platform contracts: THREADS — a new post carrying reply_to_id is the reply, so chains extend freely down to replies-to-replies / INSTAGRAM — replies attach to **top-level comments only** (to answer a sub-comment, pass its parent commentId — for comments carrying parentCommentId, use that value) / FACEBOOK — a comment on a comment id is the sub-comment / YOUTUBE — also top-level only, but a sub-comment id is accepted: this tool looks up the parent, reattaches at the thread root, and reports where it landed via parentCommentId in the response (needs the youtube.force-ssl scope). On failure, never blindly retry the same call (non-idempotent — duplicate replies). ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['THREADS', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE'], description: 'Target platform' },
        commentId: { type: 'string', description: 'commentId from sns_comment_inbox (IG must be a top-level comment id — YT also accepts a sub-comment id)' },
        message: { type: 'string', description: 'Final reply — THREADS ≤500 chars, IG ≤2,200, FB ≤8,000, YT ≤10,000' },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['platform', 'commentId', 'message'],
    },
  },
  {
    name: 'sns_comment_moderate',
    title: '⚠️ Comment hide/unhide · FB like',
    annotations: HINT.moderate,
    outputSchema: COMMENT_MODERATE_OUTPUT,
    description:
      '⚠️ Hides/unhides inbound comments and likes Facebook comments — applies the instant it is called (HITL — never call without user approval). **Deletion is not offered**: hiding is reversible and stays visible to the author, keeping friction low, while deletion is irreversible — for spam and abuse, hiding carries less brand risk. Never hide legitimate criticism or complaints — hiding is for spam, ads, hate, and exposed personal data only. like/unlike is FACEBOOK-only (Threads and IG have no comment-like API at all, so a reply is the only reaction available). **YouTube is not supported** — the API offers only hold-for-review/reject (setModerationStatus), which means something different and cannot map to a reversible hide. Handle YouTube comments in Studio.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['THREADS', 'INSTAGRAM', 'FACEBOOK'], description: 'Target platform' },
        commentId: { type: 'string', description: 'commentId from sns_comment_inbox' },
        action: {
          type: 'string',
          enum: ['hide', 'unhide', 'like', 'unlike'],
          description: 'hide/unhide works on all 3 platforms; like/unlike is FACEBOOK-only',
        },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['platform', 'commentId', 'action'],
    },
  },
  {
    name: 'sns_account_check',
    title: 'SNS credential check',
    annotations: HINT.read,
    outputSchema: ACCOUNT_CHECK_OUTPUT,
    description:
      'Checks the local SNS publishing credentials in one pass — /me lookups for Threads/Instagram/Facebook Pages, refresh-token exchange plus channel lookup for YouTube. With channel set, only that channel (brand) token set; omitted, it checks every channel directory under <SNS_TOKEN_DIR> plus the default (flat) tokens and returns them grouped per channel. Returns only account ids, names, and validity — token values are never exposed. Use as the pre-flight before each platform\'s *_publish (confirming which account will post) and for timing the 60-day Meta token renewal. Platforms without credentials show as ok:false with a reason.',
    inputSchema: { type: 'object', properties: { channel: SNS_CHANNEL_PROPERTY } },
  },

  // ── Instagram growth lookups (read-only tools for the grow-instagram skill — no side effects) ──
  {
    name: 'instagram_insights',
    title: 'Instagram performance insights',
    annotations: HINT.read,
    outputSchema: INSTAGRAM_INSIGHTS_OUTPUT,
    description:
      'Instagram performance insights — returns account window metrics (reach, views, profile visits, accounts engaged, interactions, saves, profile link taps) and per-recent-media metrics in one call (read-only, no side effects). The grow-instagram loop snapshots this every tick to judge tick-over-tick change and which reel types are landing — storing and comparing is the caller\'s job in data/<channel>/growth/instagram/. **Only reels (mediaProductType=REELS)** carry ig_reels_avg_watch_time (average watch time, ms), ig_reels_video_view_total_time (total watch time, ms), and reels_skip_rate (share who skipped) — these three are the primary hook-verdict metrics, and the platform does not support them on images or carousels. **For follower count use the account.followersCount profile value, not insights** (the insights follower_count comes back empty for accounts with fewer than 100 followers, useless on a new channel). **Needs the instagram_business_manage_insights scope** — tokens issued for publishing may lack it; when missing, the error carries reissue guidance. Each media item costs one /insights round trip, so API calls grow with mediaLimit.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Days to aggregate account metrics (default 7, 1-90)' },
        mediaLimit: {
          type: 'number',
          description: 'Recent media items to attach metrics to (default 10, max 25; 0 = account metrics only)',
        },
        channel: SNS_CHANNEL_PROPERTY,
      },
    },
  },
  {
    name: 'content_feedback',
    title: 'Recent-content feedback report',
    annotations: HINT.generate,
    outputSchema: CONTENT_FEEDBACK_OUTPUT,
    description:
      'Recent-content feedback — pulls the latest N posts (default 5) from YouTube and Instagram, scores them per platform, and writes a chart-heavy HTML report (tables, funnels, bars) locally (nothing goes public). YouTube looks at opening pass-through (engagedViews/views), average view percentage, and shares against engagedViews (the views past the opening); Instagram reels at 3-second drop-off (reels_skip_rate), average watch, and shares vs reach. YouTube reports no reach, so the two share rates sit on different denominators and are read within a platform, not across. Levers (hook, retention, share, angle) are picked against this batch\'s median, not absolute thresholds. On YouTube, views low while pass-through and retention sit at or above the median means angle — open the next episode\'s title with the felt problem, not the method or tool. Platforms without tokens just skip their section. **Default HTML path** data/<channel>/growth/review-recent.html — changeable via outputPath. Analytics lags 2-3 days, so days defaults to 28. The review-recent skill calls this tool and then opens the report.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: SNS_CHANNEL_PROPERTY,
        limit: {
          type: 'number',
          description: 'Recent posts per platform (default 5, 1-10)',
        },
        days: {
          type: 'number',
          description: 'Days to aggregate (default 28, min 7 — allowing for the YouTube Analytics lag)',
        },
        outputPath: {
          type: 'string',
          description:
            'Path to save the HTML. Relative resolves from cwd. Omitted: data/<channel>/growth/review-recent.html. .html only; .. forbidden',
        },
      },
    },
  },
  {
    name: 'youtube_topic_scout',
    title: 'YouTube market topic scout',
    annotations: HINT.read,
    outputSchema: YOUTUBE_TOPIC_SCOUT_OUTPUT,
    description:
      'Finds YouTube topics that already blew up in your niche (read-only). Gathers related channels from seed queries, takes each channel\'s median views over recent uploads, and counts as outliers only videos at 5x (default) that median or more — absolute view counts vary with channel size and make a poor yardstick for picking topics. Topic phrases pulled from outlier titles come back as keywords. Take the topics only — never copy titles, thumbnails, or scripts. With includeComments=true, unresolved questions (unmet needs) mined from top-outlier comments land in gaps. Auth prefers YOUTUBE_API_KEY (spends no publish quota), else channel OAuth youtube.readonly. search.list costs 100 units per call, so at most 4 seeds.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Seed query — one line from the channel profile\'s topic area (e.g. "AI workflow automation"). Shared search-tool argument name',
        },
        extraQueries: {
          type: 'array',
          items: { type: 'string' },
          description: 'Extra seeds (max 3; 4 including query). Other phrasings of the same idea, or subtopics',
        },
        channel: SNS_CHANNEL_PROPERTY,
        excludeChannelId: {
          type: 'string',
          description: 'Channel id to drop from results (UC…). Pass your own channel if you know it. With OAuth, mine is dropped automatically',
        },
        regionCode: {
          type: 'string',
          description: 'Two-letter search region code (default US). KR for Korea-only. The topic-scout skill calls twice, US and CN, by default',
        },
        language: {
          type: 'string',
          description: 'Relevance language (default en). zh for the Chinese market, ko for Korea-only',
        },
        publishedAfterDays: {
          type: 'number',
          description: 'Only videos within this many days feed the search (default 90, 7-365). The window onto "the market right now"',
        },
        channelLimit: {
          type: 'number',
          description: 'Competitor channels to scan (default 20, 5-40). The practical cap on the 30-50 the source video suggests',
        },
        videosPerChannel: {
          type: 'number',
          description: 'Recent uploads per channel (default 15, 5-30). The median sample',
        },
        minMultiplier: {
          type: 'number',
          description: 'Outlier multiplier floor (default 5), against the channel median',
        },
        minViews: {
          type: 'number',
          description: 'Outlier minimum views (default 1000). Filters out a tiny channel\'s 5×20 views',
        },
        duration: {
          type: 'string',
          enum: ['short', 'any'],
          default: 'short',
          description: 'short=searches under 4 minutes, outliers 3 minutes or less (short-form default) | any=any length',
        },
        includeComments: {
          type: 'boolean',
          description: 'Whether to mine question-shaped unmet needs from the top 5 outliers\' comments (default false — +5 quota)',
        },
        limit: {
          type: 'number',
          description: 'Topic phrases to return (default 15, 3-30). Shared search-tool argument name',
        },
      },
      required: ['query'],
    },
  },

  {
    name: 'sns_issue_scout',
    title: 'SNS issue scout (Threads · X · Instagram, SerpApi)',
    annotations: HINT.read,
    outputSchema: SNS_ISSUE_SCOUT_OUTPUT,
    description:
      'Collects what is being said right now about your topics on Threads, X, and Instagram, and tallies topic phrases (read-only). It runs SerpApi Google searches with site:threads.com / site:x.com / site:instagram.com over a recent window (recency, default week) per platform × seed, normalizes post URLs to shed duplicates, and returns as keywords the phrases co-occurring across several posts and platforms. **A different yardstick from youtube_topic_scout** — this lane has no engagement counts (likes, replies, views) and the order is Google relevance, so the result is a mention list of "what is being said about this now", not "what blew up". The score is mention count × platform weight, so never mix it into the same table as the YouTube multipliers. With includeTrending (default true), Google Trends trending searches (for the gl country) attach as trending, and entries overlapping the seeds or top phrases are flagged matchesSeed. Credits = platforms × seeds × pagesPerQuery + 1 for trending (default 3×1×1+1=4, free tier 250/month) — do not repeat the same seed on the same day. Snippets may not be verbatim post text (Threads sometimes returns an auto-generated topic summary as the snippet) — open the URL to verify before quoting.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Seed query — a short noun phrase from the channel profile\'s topic area (e.g. "AI automation"). Shared search-tool argument name',
        },
        extraQueries: {
          type: 'array',
          items: { type: 'string' },
          description: 'Extra seeds (max 3; 4 including query). Other phrasings or subtopics — each seed spends as many credits as there are platforms',
        },
        platforms: {
          type: 'array',
          items: { type: 'string', enum: ['threads', 'x', 'instagram'] },
          description: 'Platforms to scan (default: all three). Narrowing saves that many credits',
        },
        recency: {
          type: 'string',
          enum: ['day', 'week', 'month'],
          description: 'Recency window (default week). day-week for "issues right now", month for a material pool',
        },
        gl: { type: 'string', description: 'Two-letter country code (default kr) — the search region and the trending-searches country' },
        hl: { type: 'string', description: 'Language code (default ko)' },
        pagesPerQuery: {
          type: 'number',
          description: 'Google pages to turn per platform × seed (default 1, max 2 — 10 results per page). Setting 2 doubles the credits',
        },
        includeTrending: {
          type: 'boolean',
          description: 'Whether to include Google Trends trending searches (default true, +1 credit). Set false if you will call serp_trending_now separately',
        },
        trendingHours: {
          type: 'number',
          enum: [4, 24, 48, 168],
          description: 'Trending window (default 24). 4 | 24 | 48 | 168',
        },
        limit: { type: 'number', description: 'Topic phrases to return (default 15, 3-30). Shared search-tool argument name' },
      },
      required: ['query'],
    },
  },

  // ── Threads growth lookups (read-only tools for the grow-threads skill — no side effects) ─────
  // The insights/keyword-search scopes may be missing from publish-issued tokens —
  // when they are, the server returns the error with reissue guidance (token-setup.md).
  {
    name: 'threads_insights',
    title: 'Threads performance insights',
    annotations: HINT.read,
    outputSchema: THREADS_INSIGHTS_OUTPUT,
    description:
      'Threads performance insights — returns account metrics (follower count, profile-view time series, window totals of likes/replies/reposts/quotes) and per-recent-root-post metrics in one call (read-only, no side effects). The grow-threads loop snapshots this every tick to judge tick-over-tick change and which post types are landing — storing and comparing is the caller\'s job in data/<channel>/growth/threads/. The views/shares metrics are values the platform marks "in development" and may be off, and followers_count arrives as the current value only (window-independent). **Needs the threads_manage_insights scope** — tokens issued for publishing may lack it; when missing, the error carries reissue guidance. Each post costs one /insights round trip, so API calls grow with postLimit.',
    inputSchema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Days to aggregate account metrics (default 7, 1-90 — a platform constraint bars data before 2024-04-13)',
        },
        postLimit: {
          type: 'number',
          description: 'Recent root posts to attach metrics to (default 10, max 25; 0 = account metrics only)',
        },
        channel: SNS_CHANNEL_PROPERTY,
      },
    },
  },
  {
    name: 'threads_search',
    title: 'Threads keyword search',
    annotations: HINT.read,
    outputSchema: THREADS_SEARCH_OUTPUT,
    description:
      'Threads public-post keyword search — finds other people\'s public conversations by the channel\'s interest keywords and picks engagement candidates (read-only, no side effects). Pass a result\'s postId as threads_publish replyToId to join that post with a reply (the reply publish itself follows the publish tool\'s approval policy). For conversation joining, pick fresh posts with searchType=RECENT + sinceHours — replies on stale posts get no reach. **Needs the threads_keyword_search scope** (when missing, the error carries reissue guidance). Quota: 2,200 per account per rolling 24 hours (queries with no results don\'t count) — 1-3 keywords per tick is plenty. Empty results on sensitive/harmful keywords are normal behavior, and before the app\'s advanced-access approval only your own account\'s posts are searchable.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword (an interest keyword from the channel growth-plan)' },
        searchType: {
          type: 'string',
          enum: ['TOP', 'RECENT'],
          description: 'TOP=by popularity (default) | RECENT=newest first — RECENT recommended for conversation joining',
        },
        searchMode: {
          type: 'string',
          enum: ['KEYWORD', 'TAG'],
          description: 'KEYWORD=body search (default) | TAG=match the topic tag attached to posts',
        },
        sinceHours: { type: 'number', description: 'Only posts within this many hours (e.g. 24 — best combined with RECENT)' },
        limit: { type: 'number', description: 'Result count (default 25, max 100)' },
        channel: SNS_CHANNEL_PROPERTY,
      },
      required: ['query'],
    },
  },
  // ── Storyboard — sequence → scene → shot (skills/storyboard/references/structure-contract.js) ──
  {
    name: 'storyboard_read',
    title: 'Read a storyboard as sequences → scenes → shots',
    annotations: HINT.local,
    description: `Read an episode's scenes.js and return it as a tree: sequences (purpose · question · payoff) → scenes (place · time · event · charge · turn · out) → shots (feel · info · size · angle · render · narration). Reads the file only; no API call.

Use it before editing an existing board, and after storyboard_apply to see the board the way the approval page groups it. level=outline is enough to plan a change; level=full carries every raw shot object (large — one shot is ~40 fields).
Do NOT use it to validate — storyboard_check runs the contract. A board with no window.STRUCTURE comes back with every shot under unplacedShots; write the structure with storyboard_apply.

Returns: JSON — { version, format, shots, sequences[…scenes[…shots]], unplacedShots, splicedShots (broll · outro) }.`,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The storyboard directory (data/<channel>/episodes/<topic>/storyboard/) or its scenes.js' },
        level: { type: 'string', enum: ['outline', 'scenes', 'shots', 'full'], description: 'outline = sequences with scene numbers · scenes = scene cards with shot numbers · shots (default) = every shot summarised under its scene · full = raw shot objects too' },
      },
      required: ['path'],
    },
  },
  {
    name: 'storyboard_apply',
    title: 'Write or patch a storyboard with validation',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description: `Write a storyboard's scenes.js from a sequence → scene → shot model, or patch part of it, in one call. Every shot is validated against the grammar vocabularies (type · beat · size · angle · infoType · shareType · render.mode · transition), the structure against its rules (one place and time per scene, a charge that turns, every scene in exactly one sequence, shots grouped by scene in sequence order, two sizes per scene), and the derived shot labels (sceneSlug · sequence) are written from the structure. Nothing is written when a violation is found — the findings come back instead. Warnings are written and reported.

Use it to author a new board (set = { structure, shots }) after the narration is approved (storyboard §4), and to change one thing later (scenes / sequences / shots by key, insertShots, removeShots, globals for FORMAT · THEME · COMPREHENSION · STORY · PRODUCTION · MUSIC). One call carries the whole change — do not write scenes.js by hand and do not call this once per shot. dryRun:true validates without writing.
Do NOT pass a shot's visual plan through a summary — pass the object scenes-schema.md defines (visual · shot.space · visual.camera · visual.video …); unknown keys on a shot pass through untouched. Editing an approved board drops its \`// approved:\` line; it is approved again at the HITL gate.

Scene: { no, place, time, event, charge: { open: "+"|"-", close: "+"|"-"|"++"|"--" }, turn, out? }. Sequence: { id, title, purpose, question?, payoff?, scenes: [no…] }. The reasons for each field are in scenes-schema.md §structure.

Returns: the file written or not, counts, and findings (! violation · warning).`,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The storyboard directory (scenes.js is created there when missing) or its scenes.js' },
        set: {
          type: 'object',
          description: 'Replace the whole board — how a new board is written',
          properties: {
            structure: { type: 'object', description: '{ version: "structure-v1", sequences: [...], scenes: [...] }' },
            shots: { type: 'array', items: { type: 'object', description: 'The scenes-schema.md shot object' }, description: 'Every shot in playback order — the scenes-schema.md shot object; each playback shot carries `scene`' },
          },
          required: ['structure', 'shots'],
        },
        structure: { type: 'object', description: 'Replace window.STRUCTURE only' },
        sequences: { type: 'array', items: { type: 'object', description: '{ id, title, purpose, question?, payoff?, scenes }' }, description: 'Upsert sequences by id' },
        scenes: { type: 'array', items: { type: 'object', description: '{ no, place, time, event, charge, turn, out? }' }, description: 'Upsert scenes by no' },
        shots: { type: 'array', items: { type: 'object', description: 'One positional upsert', properties: { no: { type: 'number', description: '1-based position' }, shot: { type: 'object', description: 'The scenes-schema.md shot object' } }, required: ['no', 'shot'] }, description: 'Upsert shots by 1-based position; no = length + 1 appends' },
        insertShots: { type: 'array', items: { type: 'object', description: 'One insert', properties: { after: { type: 'number', description: '1-based position to insert after; 0 = at the start' }, shots: { type: 'array', items: { type: 'object', description: 'The scenes-schema.md shot object' }, description: 'Shots to insert, in order' } }, required: ['after', 'shots'] }, description: 'Insert shots after a 1-based position (0 = at the start)' },
        removeShots: { type: 'array', items: { type: 'number', description: '1-based position' }, description: '1-based positions to drop (resolved before inserts)' },
        removeScenes: { type: 'array', items: { type: 'number', description: 'Scene number' }, description: 'Scene numbers to drop from STRUCTURE.scenes and from every sequence' },
        removeSequences: { type: 'array', items: { type: 'string', description: 'Sequence id' }, description: 'Sequence ids to drop' },
        globals: { type: 'object', description: 'Other window.* blocks to set — FORMAT, THEME, COMPREHENSION, STORY, PRODUCTION, MUSIC, VOICE, MOTION_POLICY' },
        dryRun: { type: 'boolean', description: 'Validate and report, write nothing' },
      },
      required: ['path'],
    },
  },
  {
    name: 'storyboard_check',
    title: 'Check a storyboard against its contract',
    annotations: HINT.local,
    description: `Run the sequence → scene → shot rules and the full scenes.js contract (check-scenes.js: vocabularies, beat order, camera slots, motion policy, production mode) on a board and return every finding. Reads the file and runs a local script; no API call.

Use it after storyboard_apply and before delegating a reviewer or generating anything — the same command the storyboard skill runs by hand (\`node check-scenes.js storyboard/\`). draft:true is the story pass (§4a): machine-layer absences are deferred and counted, vocabularies and beat order still fail.
Do NOT treat a pass as visual quality — frame overflow, hero-stat width and speech rate are measured on the rendered canvas in storyboard.html's check strip.

Returns: counts (violations · warnings · deferred) and two lists — structure findings, then shot-contract findings — each line "! where what" (violation) or "· where what" (warning).`,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The storyboard directory or its scenes.js' },
        draft: { type: 'boolean', description: 'The story pass (storyboard §4a) — machine-layer absences deferred' },
      },
      required: ['path'],
    },
  },
];

/**
 * Per-platform publish tool → required credential platform — index.ts uses this
 * at ListTools time to expose only tools whose platform has a credentials file
 * (default tokens ∪ channel directories). All handlers stay registered — calling
 * an unconfigured platform directly returns an explicit missing-token error.
 */
export const SNS_PLATFORM_BY_TOOL: Record<string, 'THREADS' | 'INSTAGRAM' | 'FACEBOOK' | 'YOUTUBE'> = {
  threads_publish: 'THREADS',
  threads_insights: 'THREADS',
  threads_search: 'THREADS',
  instagram_publish: 'INSTAGRAM',
  instagram_insights: 'INSTAGRAM',
  facebook_publish: 'FACEBOOK',
  facebook_comment: 'FACEBOOK',
  youtube_publish: 'YOUTUBE',
  youtube_insights: 'YOUTUBE',
};
