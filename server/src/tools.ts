import { DURATION_TOOLS } from './video-duration.js';
import { CHANNEL_SLUG_RE } from './config.js';
import { cameraContract, renderPurposes, stillCameraEffectList, contract as storyboardContract } from './storyboard.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MUSIC_GENERATION_MODES, MUSIC_SCALES } from './music-client.js';

import {
  ASTRA_VIDEO_FAST_DIMENSION_STEP,
  ASTRA_VIDEO_GUIDANCE_RANGES,
  guidanceToolKey,
  ASTRA_VIDEO_IC_LORA_ADAPTERS,
  ASTRA_VIDEO_LORAS,
  ASTRA_VIDEO_MAX_LORA_STRENGTH,
  ASTRA_VIDEO_MAX_REFERENCE_PIXELS,
  ASTRA_VIDEO_MAX_STG_BLOCK,
  ASTRA_VIDEO_MAX_STG_BLOCKS,
  ASTRA_VIDEO_FRAME_LIMITS,
  ASTRA_VIDEO_MAX_PIXELS,
  ASTRA_VIDEO_MAX_SEED,
  ASTRA_VIDEO_MIN_FRAMES,
} from './astra-video-client.js';
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
import {
  DEFAULT_GEMINI_38_TTS_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_TEMPERATURE,
  DEFAULT_VOICE,
  GEMINI_38_TTS_MODELS,
  MAX_GEMINI_38_TTS_INPUT_CHARS,
  TTS_VOICE_NAMES,
  VALID_TTS_MODELS,
} from './tts-client.js';
import { GENERATORS, REVIEW_MODEL } from './tts-quality.js';
import {
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
  ELEVENLABS_DIALOGUE_MAX_INPUTS,
  ELEVENLABS_DIALOGUE_MAX_VOICES,
  ELEVENLABS_DIALOGUE_MODEL,
  ELEVENLABS_MODELS,
  ELEVENLABS_LANGUAGE_CODE_PATTERN,
  ELEVENLABS_MODEL_CHAR_CAPS,
  ELEVENLABS_OUTPUT_FORMATS,
  ELEVENLABS_TEXT_NORMALIZATION,
  ELEVENLABS_VOICE_CATEGORIES,
  MAX_ELEVENLABS_DIALOGUE_CHARS,
  MAX_ELEVENLABS_INPUT_CHARS,
  DEFAULT_ELEVENLABS_SFX_OUTPUT_FORMAT,
  DEFAULT_ELEVENLABS_SFX_PROMPT_INFLUENCE,
  ELEVENLABS_SFX_MODEL,
  ELEVENLABS_SFX_OUTPUT_FORMATS,
  ELEVENLABS_SFX_SECONDS,
  ELEVENLABS_SFX_USD_PER_MINUTE,
  MAX_ELEVENLABS_SFX_TEXT_CHARS,
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
  MAX_MLX_VIDEO_DIMENSION,
  MAX_MLX_VIDEO_FRAMES,
  MAX_VIDEO_RGB_BYTES,
  MIN_MLX_IMAGE_DIMENSION,
  MIN_MLX_MUSIC_SECONDS,
  MIN_MLX_VIDEO_DIMENSION,
  MIN_MLX_VIDEO_FRAMES,
  MLX_IMAGE_DIMENSION_STEP,
  MLX_VIDEO_DIMENSION_STEP,
  MLX_VIDEO_DIMENSION_STEP_ONE_STAGE,
  MLX_VIDEO_FRAME_STEP,
  MLX_VIDEO_FPS,
} from './mlx-serve-client.js';

/**
 * Tool surface definitions (83 tools) — 9 research (incl. stock_search) + 5 open-data +
 * 40 generation (5 image + 12 video + 9 voice + 1 STT + 9 music + 1 mesh +
 * youtube_topic_scout + sns_issue_scout + content_feedback) +
 * 6 per-platform publishing + 3 inbound comments + 5 growth lookups (Threads
 * insights/keyword search · YouTube insights · Instagram insights · recent-content
 * feedback — the insights trio is for the grow-* skills only; content_feedback covers
 * both video platforms and writes an HTML report) + 2 growth review + 2 checks
 * (sns_account_check · capability_status) + 7 blender previz + 4 storyboard. The six
 * mlx_* tools wrap MLX Core / mlx-serve on loopback; they are not a second MCP server. 72 of those
 * list without SNS tokens; explicit tool-disable settings can reduce that further
 * (README §MCP tools is the per-tool table).
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
    'What to keep OUT of the frame, as comma-separated noun or adjective phrases: "wall, frame, on-screen text, subtitles". Accepted by the API on veo-3.1 fast/standard only — veo-3.1-lite rejects it (400, measured 2026-08-26), so on lite write the exclusion into the prompt as positive description; veo_reference and veo_extension have no such field (400, measured 2026-08-15). Do NOT write instructions such as "no walls" or "don\'t show walls" — Google\'s prompt guide names that form as not recommended, and writing an exclusion into the prompt body tends to summon the very noun you named. Put every exclusion here instead of in prompt.',
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
 * Shared ASTRA video property definitions (self-hosted LTX-2.5).
 *
 * Length is frames rather than seconds and sizes sit on a pixel grid, so the same four
 * numeric levers appear on every generation tool but retake. astra_video_retake takes none of them —
 * a retake inherits the source exactly.
 */
const ASTRA_FRAME_LIMITS_DESCRIPTION = `every mode: ${ASTRA_VIDEO_FRAME_LIMITS.generate} (the live server's published ceiling, about 15.0s at 24fps). Longest successful renders in the live job log (2026-10-17): generate 361 at 1280x704 and 193 at 1024x1920; audio2video and keyframe 185 at 1024x1920; ingredients 161 at 1536x1024; guided 193 at 1280x704 text-only; fast, hq and ic_lora never above 121. The server refuses only two known 1280-wide failure bands (see astra_img2video); every other pair outside those measurements is unmeasured — it may fail or run slowly and hold the one-at-a-time queue for up to 1800s.`;
const astraNumFramesProperty = (mode: keyof typeof ASTRA_VIDEO_FRAME_LIMITS) => ({
  type: 'integer',
  description: `Clip length in FRAMES, not seconds: 8k+1, minimum ${ASTRA_VIDEO_MIN_FRAMES}. Mode ceilings: ${ASTRA_FRAME_LIMITS_DESCRIPTION} Server default: 121 (~5.0s at 24fps). Off-grid and over-limit values are refused before the call.`,
  minimum: ASTRA_VIDEO_MIN_FRAMES,
  maximum: ASTRA_VIDEO_FRAME_LIMITS[mode],
} as const);

const ASTRA_AUTO_DURATION_PROPERTY = {
  type: 'object',
  description: 'Let the server pick the length inside a range instead of naming frames. After seconds are rounded at frameRate, the range must start at frame 1 or later, end at frame 121 or earlier, and contain an 8k+1 value. Ignored when numFrames is also given.',
  properties: {
    minSeconds: { type: 'number', description: 'Shortest acceptable clip length in seconds.' },
    maxSeconds: { type: 'number', description: 'Longest acceptable clip length in seconds.' },
  },
  required: ['minSeconds', 'maxSeconds'],
} as const;

const ASTRA_WIDTH_PROPERTY = {
  type: 'integer',
  description: `Frame width in pixels (default: 1536, or 768 on tier "fast"). Must be a multiple of 64 — or of ${ASTRA_VIDEO_FAST_DIMENSION_STEP} within 32-1920 on tier "fast". width * height must not exceed ${ASTRA_VIDEO_MAX_PIXELS}. FOR 9:16 ASK FOR 1024x1920 FIRST. 1088x1920 exceeds the area ceiling at every frame count. The plugin's usual 1080x1920 is REFUSED, because 1080 is not a multiple of 64 or of 32. To fit a 1080x1920 canvas, widen the 1024-pixel output to 1080 (about 5.5%) in the edit or add side padding.`,
} as const;

const ASTRA_HEIGHT_PROPERTY = {
  type: 'integer',
  description: `Frame height in pixels (default: 1024, or 512 on tier "fast"). Same grid rule as width, and the same ${ASTRA_VIDEO_MAX_PIXELS}-pixel area ceiling. For 9:16, use 1024x1920 first. 1088x1920 exceeds the area ceiling at every frame count. Never use 1080x1920, whose width is off the grid. To fit a 1080x1920 canvas, widen the 1024-pixel output to 1080 (about 5.5%) in the edit or add side padding.`,
} as const;

const ASTRA_FRAME_RATE_PROPERTY = {
  type: 'number',
  description: 'Frames per second, 1-60 (default: 24). This sets playback speed against numFrames — 121 frames at 24fps is about 5.0s, at 12fps about 10.1s.',
  minimum: 1,
  maximum: 60,
} as const;

const ASTRA_SEED_PROPERTY = {
  type: 'integer',
  description: `Decoding seed for reproducibility, 0-${ASTRA_VIDEO_MAX_SEED} (default: 42). The same seed with the same request gives the same clip.`,
  minimum: 0,
  maximum: ASTRA_VIDEO_MAX_SEED,
} as const;

const ASTRA_LORA_PROPERTY = {
  type: 'array',
  description: `Distinct look adapters to load, at most 2. "cinemagraph" freezes the frame except for one moving element; "slow-motion" stretches the action. Give a bare name for strength 1.0, or {name, strength} with strength 0-${ASTRA_VIDEO_MAX_LORA_STRENGTH}. Duplicate names are refused. Accepted ONLY on tier "default" (mode generate) — any other tier is refused before the call.`,
  maxItems: 2,
  items: {
    oneOf: [
      { type: 'string', description: 'Adapter name at strength 1.0.', enum: [...ASTRA_VIDEO_LORAS] },
      {
        type: 'object',
        description: 'Adapter name with an explicit strength.',
        properties: {
          name: { type: 'string', enum: [...ASTRA_VIDEO_LORAS], description: 'Adapter name.' },
          strength: { type: 'number', minimum: 0, maximum: ASTRA_VIDEO_MAX_LORA_STRENGTH, description: `Adapter strength, 0-${ASTRA_VIDEO_MAX_LORA_STRENGTH}.` },
        },
        required: ['name', 'strength'],
        additionalProperties: false,
      },
    ],
  },
} as const;

/** What each engine knob does (engine `--help`), so an agent can choose without the manual. */
const ASTRA_GUIDANCE_MEANING: Record<string, string> = {
  video_cfg_guidance_scale: 'Prompt adherence for the picture (CFG). Higher follows the prompt more literally but reduces variety; 1.0 = off.',
  video_stg_guidance_scale: 'Spatio-temporal guidance strength for the picture. Higher sharpens structure and motion coherence but can cost quality; 0.0 = off.',
  video_rescale_scale: 'Rescales the picture after guidance. Raise it when colours look oversaturated or burnt; 0.0 = off.',
  video_skip_step: 'Skip diffusion steps for the picture: 0 = none, 1 = every other step, 2 = two of every three. Faster, rougher.',
  a2v_guidance_scale: 'How strongly the audio drives the picture (audio-to-video cross-attention). Higher may tighten lip-sync; 1.0 = off.',
  audio_cfg_guidance_scale: 'Prompt adherence for the generated sound. Higher follows the prompt more literally; 1.0 = off.',
  audio_stg_guidance_scale: 'Spatio-temporal guidance strength for the sound; 0.0 = off.',
  audio_rescale_scale: 'Rescales the sound after guidance (experimental); 0.0 = off.',
  audio_skip_step: 'Skip diffusion steps for the sound, same scale as videoSkipStep.',
  v2a_guidance_scale: 'How strongly the picture drives the sound (video-to-audio cross-attention). Higher may tighten lip-sync; 1.0 = off.',
};

const ASTRA_STG_BLOCKS_PROPERTY = {
  type: 'array',
  description: `Transformer blocks perturbed by spatio-temporal guidance: 1-${ASTRA_VIDEO_MAX_STG_BLOCKS} distinct integers 0-${ASTRA_VIDEO_MAX_STG_BLOCK}. Only matters while the matching stg scale is above 0 — and on tier "hq" the default list is empty, so turning stg on there also needs a block list (e.g. [28]).`,
  minItems: 1,
  maxItems: ASTRA_VIDEO_MAX_STG_BLOCKS,
  uniqueItems: true,
  items: { type: 'integer', minimum: 0, maximum: ASTRA_VIDEO_MAX_STG_BLOCK },
} as const;

const ASTRA_DURATION_PROPERTY = {
  type: 'number', exclusiveMinimum: 0,
  description: 'Clip length in seconds — the easy way to set length. Converted to the nearest 8k+1 frame count at frameRate (the shorter on a tie): at 24fps 1s→25, 2s→49, 4s→97, 5s→121, 8s→193 frames. Give only one of duration, numFrames and autoDuration (or audioMaxDuration); a length outside the mode\'s frame range is refused with the seconds it accepts.',
} as const;

const ASTRA_GENERATE_AUDIO_PROPERTY = {
  type: 'boolean',
  description: 'false = return a silent mp4 (the sound stream is stripped after generation; render time is the same). Default true. On audio2video false also removes the supplied sound.',
} as const;

const ASTRA_GUIDANCE_PROPERTY = {
  type: 'object',
  description: 'Optional engine guidance knobs; leave it out unless a render needs correcting — every omitted key keeps the pipeline default, and the defaults are tuned. Typical fixes: ignores the prompt → raise videoCfgGuidanceScale (default 3.0) a little; oversaturated or burnt colours → raise videoRescaleScale or lower videoCfgGuidanceScale; lip-sync loose on audio2video → raise a2vGuidanceScale. Defaults for guided, fast, keyframe and audio2video: videoCfg 3.0 · videoStg 1.0 · videoRescale 0.7 · videoStgBlocks [28] · videoSkipStep 0 · a2v 3.0 · audioCfg 7.0 · audioStg 1.0 · audioRescale 0.7 · audioStgBlocks [28] · audioSkipStep 0 · v2a 3.0. tier "hq" differs: videoStg 0.0 · videoRescale 0.45 · videoStgBlocks [] · audioStg 0.0 · audioRescale 1.0 — so on hq a stg scale does nothing unless you also give its block list. Ranges are the server\'s conservative bounds, not measured quality guidance. Accepted on the step-based modes only (tiers "guided", "fast", "hq", and the keyframe and audio2video tools).',
  properties: {
    ...Object.fromEntries(Object.entries(ASTRA_VIDEO_GUIDANCE_RANGES).map(([key, [minimum, maximum]]) => [guidanceToolKey(key), {
      type: key.endsWith('_skip_step') ? 'integer' : 'number',
      minimum,
      maximum,
      description: `${ASTRA_GUIDANCE_MEANING[key]} Range ${minimum}-${maximum}. Engine flag --${key.replaceAll('_', '-')}.`,
    }])),
    videoStgBlocks: ASTRA_STG_BLOCKS_PROPERTY,
    audioStgBlocks: ASTRA_STG_BLOCKS_PROPERTY,
  },
  additionalProperties: false,
};

const ASTRA_NEGATIVE_PROMPT_PROPERTY = {
  type: 'string',
  description: 'What to keep out of the frame, at most 2000 characters. Include subtitles, captions, dialogue text, typography, letters, logos and watermarks. Accepted ONLY on tiers "guided" and "fast" and on the keyframe/audio2video tools — mode generate has no such field and it is refused before the call.',
} as const;

const ASTRA_STEPS_PROPERTY = {
  type: 'integer',
  description: 'Denoising steps, 1-50. More steps means longer render, not always a better clip. Accepted on the same modes as negativePrompt — never on tier "default".',
  minimum: 1,
  maximum: 50,
} as const;

const ASTRA_GENERATED_KEYFRAMES_PROPERTY = {
  type: 'integer',
  description: 'How many intermediate keyframes the pipeline generates for itself first, 0-16 (default: 0). Raises coherence over a long move at the cost of render time. Not available on the keyframe, audio2video or retake tools.',
  minimum: 0,
  maximum: 16,
} as const;

const ASTRA_OUTPUT_PATH_PROPERTY = {
  type: 'string',
  description: 'Directory to save the generated video in (default: current working directory).',
} as const;

const ASTRA_FILENAME_PROPERTY = {
  type: 'string',
  description: 'File name for the generated video (default: astra_<timestamp>.mp4). A bare name — put the directory in outputPath.',
} as const;

const ASTRA_LIMITS_LINE = 'Uploads: 10/min per key. Job acceptance: 5/min and 60/hour per key. The waiting queue holds 20 jobs, and each /v1/jobs JSON body is limited to 1 MiB.';

/**
 * Shared Seedance property definitions (BytePlus ModelArk) — lists and
 * defaults derive from the capability table in seedance-client.ts. Per-model
 * constraints (resolution, duration, audio, seed) can't be expressed in a
 * single schema enum, so the client's superRefine rejects them before the call.
 */
const SEEDANCE_MODEL_PROPERTY = {
  type: 'string',
  description:
    `Seedance model (default: "${DEFAULT_SEEDANCE_MODEL}" — the cheapest model that reaches 1080p, accepts photoreal human faces as input, supports seed, and has no balance gate — every ModelArk model still needs console activation). ` +
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
    'Text language, e.g. "ko", "en", "ja". v4 also accepts ast, yue, ceb and fil for languages without a two-letter code. Omit for automatic detection.',
  pattern: ELEVENLABS_LANGUAGE_CODE_PATTERN,
};

const ELEVENLABS_SEED_PROPERTY = {
  type: 'integer',
  description: 'Best-effort seed 0–4294967295, e.g. 42. Same inputs can still vary; preserve for comparison, never promise deterministic audio.',
  minimum: 0,
  maximum: 4294967295,
};

const ELEVENLABS_NORMALIZATION_PROPERTY = {
  type: 'string',
  description:
    'Text normalization: "auto" (vendor default), "on" (normalize numbers and dates), "off" (skip). Example: "on" for a script containing dates.',
  enum: [...ELEVENLABS_TEXT_NORMALIZATION],
};

const ELEVENLABS_STABILITY_PROPERTY = {
  type: 'number',
  description:
    'v4 delivery stability 0–1, e.g. 0.5 (vendor default). Lower permits more expressive variation; higher is steadier. Preserve a pinned value across retakes.',
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

// Keep tool discovery available even when an install has lost its reference tree.
const eyelineInput = (() => {
  try { return { type: 'object', additionalProperties: true, description: 'Optional gaze plan. Use the directing skill for recommended fields; only a supplied shot reference must resolve.', properties: { matchShot: { type: 'integer', minimum: 1, description: 'Referenced shot position, one-based; must resolve when supplied' } } }; }
  catch { return { type: 'object', description: 'Eyeline contract unavailable: restore skills/storyboard/references/structure-contract.js' }; }
})();
const compositionInput = (() => {
  try { return { type: 'object', additionalProperties: true, description: 'Optional composition notes. Follow the directing skill; no rationale worksheet is required to author a shot.' }; }
  catch { return { type: 'object', description: 'Composition contract unavailable: restore skills/storyboard/references/structure-contract.js' }; }
})();
const depthInput = (() => {
  try { return { type: 'object', additionalProperties: true, description: 'Optional depth and readable-plane plan. The skill guides artistic choices.' }; }
  catch { return { type: 'object', description: 'Depth contract unavailable: restore skills/storyboard/references/structure-contract.js' }; }
})();
const storyboardVocabulary = (() => {
  try { return storyboardContract().VOCAB; } catch { return null; }
})();
const shotCameraInput = (() => {
  try { return cameraContract().CAMERA_INPUT_SCHEMA; }
  catch { return { type: 'object', description: 'Camera contract unavailable: restore skills/storyboard/references/production-mode.js' }; }
})();
const enumInput = (values: string[] | undefined, description: string) => ({ type: 'string', ...(values?.length ? { enum: values } : {}), description });
const purposes = (() => { try { return renderPurposes(); } catch { return []; } })();
const stillCameraEffects = (() => { try { return stillCameraEffectList(); } catch { return []; } })();
// The still lane's window move (render-routing.js, still-camera.js) — the camera a photograph gets.
const stillCameraInput = {
  type: 'object', additionalProperties: true, required: ['effect'],
  description: 'Required on still_camera. The eased window move the builder drives over the photograph: push (slow zoom-in, the default) · pull · approach · focus-in · rack-focus · pan · tilt (L13: a pan or tilt travels from focusFrom to focusTo, the vertical tilt being the scale-by-time move) · reveal · parallax (prepared layers). The ease holds the opening and closing pictures on its own.',
  properties: {
    effect: enumInput(stillCameraEffects, 'The window move. Choose from the cut\'s meaning (directing-grammar §5 Still column), never repeat one on every cut.'),
    target: { type: 'string', description: 'What the move arrives on or travels over, in the picture.' },
    reason: { type: 'string', description: 'Why this move conveys the cut; content-based.' },
    focusTo: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number' }, description: 'Normalized [x, y, rx, ry] region from the actual image: the arrival plane for focus-in, rack-focus and approach; the closing picture for pan and tilt.' },
    focusFrom: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number' }, description: 'Normalized [x, y, rx, ry] region: the departure plane for rack-focus; the opening picture for pan and tilt (it must differ from focusTo).' },
    layersPlan: { type: 'string', description: 'reveal and parallax only: the prepared foreground and clean-background plan.' }
  }
};
const looks = (() => { try { return cameraContract().ALL_LOOKS; } catch { return []; } })();
const storyboardShotInput = {
  type: 'object', additionalProperties: true, required: ['type'],
  description: 'Complete scenes-schema.md playback shot. On upsert, supply the complete shot; fields are not deep-merged. Extra visual and machine fields are preserved.',
  properties: {
    id: { type: 'string', pattern: '^s\\d{4,}$', description: 'Stable shot id. storyboard_apply assigns it; preserve it and do not edit it by hand.' },
    type: enumInput(storyboardVocabulary?.TYPES, 'Playback role, distinct from shot.render.mode and the camera preset.'),
    scene: { type: 'integer', minimum: 1, description: 'Parent scene number in STRUCTURE.' },
    duration: { type: 'number', exclusiveMinimum: 0, description: 'Shot duration in seconds; model duration may round up.' },
    title: { type: 'string', description: 'Visible title where the shot treatment permits it.' },
    narration: { type: 'array', description: 'Approved speech and optional subtitle text, in order.', items: { type: 'object', additionalProperties: true, required: ['tts'], properties: { tts: { type: 'string', description: 'Text to speak.' }, sub: { type: 'string', description: 'Subtitle text; omit to use the speech text.' } } } },
    beat: { type: 'string', description: 'Narrative beat in playback order. Recommended vocabulary is in the directing skill.' },
    shot: {
      type: 'object', additionalProperties: true,
      description: 'Shot grammar and production route. Render mode chooses how to build the shot; visual.camera chooses how it is filmed; shot.depth chooses how many planes the viewer may read at once (L11).',
      properties: {
        size: { type: 'string', description: 'Framing size. Recommended vocabulary is in the directing skill.' },
        angle: { type: 'string', description: 'Camera angle. Recommended vocabulary is in the directing skill.' },
        infoType: { type: 'string', description: 'Information carried by the shot; must agree with its purpose. Recommended vocabulary is in the directing skill.' },
        feel: { type: 'string', description: 'What the viewer should feel before choosing framing and movement.' },
        eyeline: eyelineInput, composition: compositionInput, depth: depthInput,
        render: {
          type: 'object', additionalProperties: true, required: ['mode'],
          description: 'Production route. Select a supported route; explain artistic choices when useful. The skill guides medium and movement decisions.',
          properties: {
            mode: enumInput(storyboardVocabulary?.RENDER_MODES, 'still_camera, generated_video, stock_video, or the supported HTML/data route. This is not the shot camera preset.'),
            purpose: { type: 'string', description: 'Optional purpose for review. The skill guides route selection.' },
            reason: { type: 'string', description: 'Why this route conveys the intended information.' },
            action: { type: 'string', description: 'Visible action or spatial reveal.' },
            motionEssential: { type: 'boolean', description: 'Optional note that continuous movement is essential.' },
            whyNotStill: { type: 'string', description: 'Optional explanation of what travel reveals.' },
            camera: stillCameraInput
          }
        },
        videoDesign: {
          type: 'object', additionalProperties: true,
          description: 'Visual plan. Drone flights keep a volumetric episode look and use a justified spatial_reveal; flat arcade/paper-cutout/ink-wash are incompatible.',
          properties: {
            look: enumInput(looks, 'Shot look must match the approved episode style.'),
            worldId: { type: 'string', description: 'Stable identifier for the environment shared by related shots.' }, before: { type: 'string', description: 'Visible opening state.' }, action: { type: 'string', description: 'Visible action or spatial reveal.' }, after: { type: 'string', description: 'Visible final state; may be supplied by the final subject-action beat instead.' }, continuity: { type: 'string', description: 'Identity and geometry that stay consistent across the shot.' }, reject: { type: 'string', description: 'Visible defects to look for during review.' },
            motion: { type: 'object', additionalProperties: true, description: 'Motion design; spatial_reveal describes a camera-led change in visible space.', properties: {
              kind: enumInput(['subject_action','spatial_reveal','archive_hold'], 'Drone flight uses spatial_reveal.'),
              subject: { type: 'string', description: 'The actor, object or location whose change is shown.' }, visibleChange: { type: 'string', description: 'What changes visibly between the start and end.' }, reason: { type: 'string', description: 'Why this motion is needed.' }
            } }
          }
        }
      }
    },
    visual: {
      type: 'object', additionalProperties: true,
      description: 'Visual assets and shot camera. Preserve existing video, frames, reuse and other fields when replacing a shot.',
      properties: {
        camera: shotCameraInput,
        why: { type: 'string', description: 'Why the visual conveys the narration.' },
        bg: { type: 'string', description: 'Storyboard-relative source image path.' },
        video: { type: 'object', additionalProperties: true, description: 'Existing model, prompt, clip and previz handoff. Keep all fields; scenes-schema.md defines model and approval constraints.' }
      }
    }
  },
};


const ELEVENLABS_V4_PROPERTIES = {
  model: { type: 'string', enum: [...ELEVENLABS_MODELS], default: DEFAULT_ELEVENLABS_MODEL, description: 'Only eleven_v4 is accepted. Never fall back to a legacy model.' },
  languageCode: ELEVENLABS_LANGUAGE_CODE_PROPERTY,
  stability: ELEVENLABS_STABILITY_PROPERTY,
  similarity: { type: 'number', minimum: 0, maximum: 1, description: 'Adherence to the reference voice, e.g. 0.75 (vendor default); maps to settings.similarity. Higher may reduce naturalness.' },
  similarityBoost: { type: 'number', minimum: 0, maximum: 1, description: 'Deprecated alias for similarity, e.g. 0.75; do not supply both with different values.' },
  speed: { type: 'number', enum: [1], description: 'Compatibility no-op only. v4 does not accept a numerical speed setting.' },
  seed: ELEVENLABS_SEED_PROPERTY,
  previousText: { type: 'string', maxLength: 100, description: 'Prior speech context, e.g. "We arrived."; not synthesized. Provider support can vary.' },
  nextText: { type: 'string', maxLength: 100, description: 'Following context, e.g. "Then we left."; maps to future_text, not synthesized. Provider support can vary.' },
  previousRequestIds: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', minLength: 1 }, description: 'Real dialogue request IDs for continuity, e.g. ["prior-request-id"]. Last is closest to this take. Requires logging; provider support can vary.' },
  nextRequestIds: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', minLength: 1 }, description: 'Real following dialogue request IDs, e.g. ["next-request-id"], for a middle-clip retake. First is closest. Requires logging; provider support can vary.' },
  usePvcAsIvc: { type: 'boolean', description: 'Explicitly use the instant-clone version of a professional voice, e.g. true. Omitted uses provider default false. May change expressiveness, latency and voice character; never enable as an automatic fallback.' },
  enableLogging: { type: 'boolean', description: 'Provider request logging, e.g. true (provider default). false requests Enterprise-only zero retention and disables request stitching; local audio and sidecars are still saved.' },
  pronunciationDictionaryLocators: { type: 'array', minItems: 1, maxItems: 3, description: 'Pinned dictionary versions, e.g. [{"pronunciationDictionaryId":"dict-id","versionId":"version-id"}].', items: { type: 'object', additionalProperties: false, properties: { pronunciationDictionaryId: { type: 'string', minLength: 1, description: 'Dictionary id from tts_elevenlabs_dictionary.' }, versionId: { type: 'string', minLength: 1, description: 'Version id from tts_elevenlabs_dictionary.' } }, required: ['pronunciationDictionaryId','versionId'] } },
  applyTextNormalization: ELEVENLABS_NORMALIZATION_PROPERTY,
  outputFormat: ELEVENLABS_OUTPUT_FORMAT_PROPERTY, timestamps: ELEVENLABS_TIMESTAMPS_PROPERTY,
  outputPath: { type: 'string', description: 'Output directory, e.g. /tmp/speech. Defaults to the working directory.' }, filename: { type: 'string', description: 'Output basename with matching extension, e.g. shot-01.wav. Omit for a generated name.' }
};

const ACTING_PROPERTY = { type: 'object', additionalProperties: false, description: 'Per-line performance, separate from character identity. Empty object clears direction.', properties: {
  direction: { type: 'string', maxLength: 500, description: 'Short plain delivery direction; no bracket markup.' },
  tags: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 60 }, description: 'Bare English vocal events prepended to this line, e.g. sigh. Split the line for later changes.' }
} };
const VOICE_PROFILE_PROPERTY = { type: 'object', additionalProperties: false, description: 'Explicit acoustic targets; never infer voice gender from names or roles.', properties: {
  vocalGender: { type: 'string', enum: ['female','male','neutral','unspecified'], description: 'Desired audible gender, e.g. female; unspecified preserves uncertainty.' },
  perceivedAge: { type: 'string', maxLength: 100, description: 'Desired age impression, e.g. adult in her fifties; defaults to confirmed character age.' },
  baselineDirection: { type: 'string', maxLength: 400, description: 'Short habitual delivery, e.g. dry measured phrasing. For Gemini3.8 use the base voice for age/gender/timbre; style cannot change immutable traits. No biography or changing scene emotion.' }
} };
const CHARACTER_TARGET_PROPERTY = { type: 'object', additionalProperties: false, description: 'Acoustic target from character_voice_audition plan. Metadata is intent, never proof of the voice heard.', properties: {
  vocalGender: {type:'string',enum:['female','male','neutral','unspecified'],description:'Requested audible gender, e.g. female; unspecified skips gender comparison.'},
  perceivedAge: {type:['string','null'],maxLength:100,description:'Plausible perceived age, e.g. 52 years old; null means unknown.'},
  ...Object.fromEntries(['timbre','pace','register','habits','emotionalRange'].map(key=>[key,{type:['string','null'],maxLength:2000,description:`Confirmed character ${key}, e.g. low clear voice or measured phrasing; null means unknown.`}])),
  traits: {type:'array',maxItems:20,description:'Character tendencies as context, e.g. ["restrained and precise"]. Do not demand every trait in one short line.',items:{type:'string',maxLength:2000}}
}, required:['vocalGender','perceivedAge','timbre','pace','register','habits','emotionalRange','traits'] };

export const TOOLS: Tool[] = [
  {
    name: 'tts_review_acting', title: 'Explicitly requested adversarial audio review', annotations: HINT.generate,
    description: 'Create an adversarial review of actual speech audio.\n\nUse for explicitly requested listening, voice-fit evaluation or acting review. Optional characterTarget scores characterFit40/accuracy20/acting15/naturalness15/audioQuality10 and independently describes the voice heard; otherwise uses the existing acting rubric. Returns score (0-100), timestamped defects, observed voice, hashes and immutable reports. PASS needs >=95, characterFit>=95 when requested, complete listening, confidence>=0.9 and no major/critical issue. Do NOT use for synthesis — use the planned raw TTS tool. Never run as a default production gate or equate model judgment with user approval.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      audioPath: { type: 'string', description: 'Actual WAV path, under14MiB.' }, expectedText: { type: 'string', maxLength: 4000, description: 'Clean expected spoken words, without acting tags.' },
      direction: { type: 'string', maxLength: 2000, description: 'Requested scene intent and audible performance changes.' }, language: { type: 'string', default: 'ko', description: 'Spoken language.' },
      requestedBy: { type: 'string', maxLength: 1000, description: 'Actual user request authorizing paid audio evaluation.' }, outputPath: { type: 'string', description: 'Local directory for hash-bound review reports.' }, characterTarget: CHARACTER_TARGET_PROPERTY
    }, required: ['audioPath','expectedText','direction','requestedBy','outputPath'] }
  },
  {
    name: 'character_voice_audition', title: 'Audition three character voices and save the user choice',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    description: 'Create character voice auditions or plan acoustic targets.\n\nUse for casting, sample voices or character voice matching. plan reads confirmed age, timbre, speech and personality without synthesis; compare real provider metadata and expose unknowns. create generates three paid previews, composes a compact Gemini voiceDirection with acting and saves target/metadata/request/hash evidence without changing identity. select requires the actual user choice and verifies hashes before saving its voice settings. Returns target, candidate comparisons, auditionPath, previewPath and selection state. Do NOT use for ordinary dialogue — use speech_manage plan_audio and its raw TTS tool. Never auto-select or score without a requested audio review; inspect partial failures before retrying.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      action: { type: 'string', enum: ['plan','create','read','select'], description: 'plan reads identity without generating; create generates three choices; read inspects; select saves an explicit user choice.' },
      identityPath: { type: 'string', description: 'Existing character identity.md with one structured character JSON block. Draft tts may be absent before selection.' },
      auditionPath: { type: 'string', description: 'Manifest path returned by create; required for read/select.' },
      sampleText: { type: 'string', minLength: 5, maxLength: 300, description: 'Same natural spoken sample for all three candidates; no tag markup.' },
      sampleTurns: {type:'array',minItems:2,maxItems:10,description:'Optional Gemini 3.8 sample excerpts with separate acting. Texts joined with spaces must reproduce sampleText exactly; omit top-level acting. Each turn retains the same candidate voice and stable baseline.',items:{type:'object',additionalProperties:false,required:['text'],properties:{text:{type:'string',minLength:1,maxLength:300,description:'Exact spoken excerpt in sample order, e.g. I will help you.'},acting:ACTING_PROPERTY}}},
      acting: ACTING_PROPERTY,
      voiceProfile: VOICE_PROFILE_PROPERTY,
      candidates: { type: 'array', minItems: 3, maxItems: 3, description: 'Exactly three distinct voice IDs on one selected engine/model/language.', items: { type: 'object', additionalProperties: false, required: ['label','reason','tts'], properties: {
        label: { type: 'string', maxLength: 100, description: 'Human-readable candidate label.' },
        reason: { type: 'string', maxLength: 500, description: 'Why this voice suits the character.' },
        metadata: {type:'object',additionalProperties:false,description:'Actual voice lookup evidence, e.g. Gemini library metadata; omitted fields stay unknown.',properties:{
          voiceId:{type:'string',maxLength:300,description:'Exact candidate voice ID, e.g. ko-kr-theatrical-1.'},
          source:{type:'string',enum:['gemini-library','gemini-curated','elevenlabs'],description:'Voice lookup source, e.g. gemini-library; never label inferred facts as provider metadata.'},retrievedAt:{type:'string',format:'date-time',description:'Actual lookup time, e.g. 2026-10-17T10:00:00Z.'},
          gender:{type:'string',maxLength:100,description:'Provider-reported vocal gender, e.g. female; omit when absent.'},age:{type:'string',maxLength:200,description:'Provider age label, e.g. 35-year-old; omit when absent.'},pitch:{type:'string',maxLength:100,description:'Provider pitch label, e.g. low; omit when absent.'},description:{type:'string',maxLength:2000,description:'Exact provider voice description, e.g. warm low voice; no invented attributes.'}
        },required:['voiceId','source','retrievedAt']},
        tts: { type: 'object', description: 'Candidate voice settings saved unchanged only after user selection.', additionalProperties: false, required: ['engine','model','voiceId','language','speed'], properties: {
          engine: { type: 'string', enum: ['gemini','elevenlabs'], description: 'Selected speech provider.' },
          model: { type: 'string', description: 'Explicit supported Gemini model or eleven_v4.' },
          voiceId: { type: 'string', description: 'Voice ID obtained from lookup; never invent it.' },
          language: { type: 'string', description: 'Text language e.g. ko.' },
          speed: { type: 'number', enum: [1], description: 'Neutral speed only.' },
          stability: { type: 'number', minimum: 0, maximum: 1, description: 'Optional ElevenLabs v4 consistency.' },
          similarity: { type: 'number', minimum: 0, maximum: 1, description: 'Optional ElevenLabs v4 voice similarity.' },
          stylePrompt: { type: 'string', description: 'Only for pre-3.8 Gemini baseline style.' },
          voiceDirection: { type: 'string', maxLength:400, description:'Short habitual Gemini delivery; plan/create derives speech pace, register and habits when omitted. Base voice selection carries age, gender and timbre. Preserved alongside scene acting.' }
        } }
      } } },
      candidateId: { type: 'string', enum: ['1','2','3'], description: 'Candidate selected by the user.' },
      userSelection: { type: 'string', maxLength: 1000, description: 'Actual user response selecting the candidate. Required for select; never fabricate.' }
    }, required: ['action'] }
  },
  {
    name: 'location_manage', title: 'Build, bind and review a persistent 3D location',
    annotations: {readOnlyHint:false, destructiveHint:false, idempotentHint:false, openWorldHint:false},
    description: `Create and update local Blender sets, shot blocking and spatial previz.

Use for recurring locations, floor plans, actor facing/gaze and shot continuity before storyboard images. build writes root/id/vN; bind stores manifest/stateId/cameraId plus optional blocking/endStateId/continuityGroup on board/shotId; render writes clean start/end images; previz uses the same set, camera and actors to write a silent H.264 clip, first/middle/last PNGs and a shot previz record (seconds required, fps defaults to 24). No paid calls.
Returns: build {manifest,sha256}; render {fingerprint,frames}; previz {clip,blend,firstFrame,sha256,fps,seconds,locationBinding}; references absolute image paths/roles/hashes; check ordered findings with level/where/what. ready requires fresh files; actual reviews remain optional. Coordinates: metres, Z up, actors face -Y at zero rotation.
Do NOT use for independent body posing or to read an arbitrary .blend — use blender_pose_key or blender_scene_read. Read an existing location with action read; see skills/storyboard/references/location-assets.md for camera proposals and generation receipts.`,
    inputSchema: { type: 'object', required: ['action'], additionalProperties: false, properties: {
      action: {type:'string', description:'Operation; build/sheet/render/previz write local assets, bind/camera/approve/receipt update the board, read/references/check are read-only', enum:['build','read','sheet','bind','render','previz','approve','references','camera','check','receipt','review']},
      verdict:{type:'string',enum:['pass','warning','fail'],description:'Observed generation result verdict; review never certifies unseen images'},
      provider:{type:'string',description:'Actual output provider for receipt',enum:['host','api','blender']}, callId:{type:'string',description:'Actual tool call or render job identifier'}, referencePaths:{type:'array',description:'Absolute paths actually sent to generation',items:{type:'string'}},
      spec: {oneOf:[{type:'string'},{type:'object',additionalProperties:true}], description:'Location spec file or object for build'},
      root: {type:'string',description:'Channel assets/locations directory'}, manifest:{type:'string',description:'location.json path'},
      output:{type:'string',description:'New sheet output directory'}, board:{type:'string',description:'scenes.js path'},
      shotId:{type:'string',description:'Stable shot id'}, stateId:{description:'Registered location state id',type:'string'}, cameraId:{description:'Registered numerical camera id',type:'string'},
      mustShow:{description:'Object IDs that must be visible; review actual images',type:'array',items:{type:'string'}}, continuityGroup:{description:'Related shots sharing location continuity',type:'string'},
      endStateId:{type:'string',description:'Optional registered end state for moving props or doors, e.g. open; omitted holds stateId'},
      continuityBreak:{type:'string',minLength:1,description:'Reason for a deliberate discontinuity, e.g. time skip to next morning; warnings remain advisory'},
      seconds:{type:'number',exclusiveMinimum:0,description:'Required previz duration in seconds, e.g. 4; use the billed video length, ASTRA numFrames/frameRate may be fractional'},
      fps:{type:'integer',minimum:24,maximum:60,description:'Previz frames per second, e.g. 24 (default); at most 3000 frames'},
      blocking:{type:'object',additionalProperties:false,required:['actors'],description:'Shared world-space actor states; keep off-camera actors in the set. End omitted holds the complete start pose.',properties:{
        axis:{type:'array',minItems:2,maxItems:2,items:{type:'string'},description:'Ordered action-axis endpoints, e.g. [A,B]; actor or set-object IDs'},
        actors:{type:'array',maxItems:32,description:'Persistent actor IDs matching cast IDs, e.g. A; body proxies and head gaze, without limb acting',items:{type:'object',additionalProperties:false,required:['id','height','color','start'],properties:{
          id:{type:'string',description:'Stable cast ID distinct from set object IDs, e.g. A'},height:{type:'number',minimum:0.1,maximum:10,description:'Height in metres, e.g. 1.7'},color:{type:'string',pattern:'^#[a-fA-F0-9]{6}$',description:'Proxy colour, e.g. #d0342c; appearance comes from cast sheets'},
          start:{type:'object',additionalProperties:false,required:['position','rotationZDeg'],description:'Opening world pose, e.g. position [0,0,0], rotationZDeg 90, gazeTarget B',properties:{
            position:{type:'array',minItems:3,maxItems:3,items:{type:'number'},description:'Floor point XYZ in metres, e.g. [0,0,0]'},rotationZDeg:{type:'number',description:'Body yaw in degrees; 0 faces -Y, 90 faces +X'},gazeTarget:{type:'string',description:'Actor or set-object ID, e.g. B; omitted follows body facing'},holds:{type:'array',items:{type:'string'},description:'Held set-object IDs, e.g. [toolbox]; author their physical positions in location states'}
          }},
          end:{type:'object',additionalProperties:false,required:['position','rotationZDeg'],description:'Complete closing pose with the same fields as start, e.g. position [1,0,0], rotationZDeg 90; omitted holds start',properties:{
            position:{type:'array',minItems:3,maxItems:3,items:{type:'number'},description:'Floor point XYZ in metres, e.g. [1,0,0]'},rotationZDeg:{type:'number',description:'Body yaw in degrees, e.g. 90'},gazeTarget:{type:'string',description:'Actor or set-object ID, e.g. B'},holds:{type:'array',items:{type:'string'},description:'Held set-object IDs, e.g. [toolbox]'}
          }}
        }}}
      }},
      reviewer:{description:'Identity of the actual visual reviewer',type:'string'}, notes:{description:'Observed visual findings, not an assumed pass',type:'string'}, ready:{description:'Require fresh image files; missing reviews produce warnings',type:'boolean'},
      patch:{oneOf:[{type:'string'},{type:'object',additionalProperties:true}],description:'Exported camera proposal file or object'}
    }}
  },
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


  // ── Video generation (ASTRA video API — self-hosted LTX-2.5) ──────────────
  // The only lane that is ours: no per-call bill, no vendor policy, weights on our box.
  // It renders one job at a time, so it is the batch lane, not the interactive one.
  // Which engine when: skills/produce/references/video-model-selection.md.
  {
    name: 'astra_text2video',
    title: 'ASTRA video generation (text → video)',
    annotations: HINT.generate,
    description: `Generate a video from a text prompt on the self-hosted ASTRA video API (LTX-2.5).

Use when the shot is not time-critical and you would rather not spend vendor money: this server is ours, so a call costs wall clock instead of dollars, and no vendor content policy applies. It is also the only lane with an adapter (lora) for cinemagraph and slow-motion looks.
Do NOT use when someone is waiting: the box renders ONE job at a time and yours queues behind whatever else is running. A measured 121-frame 1536x1024 render takes about 66s (tier "default"), 169s ("guided"), 121s ("fast") — plus the queue. For an immediate clip go to veo_text2video or seedance_text2video.
tier picks the pipeline and also which arguments exist: lora only on "default", negativePrompt, numInferenceSteps and guidance only on "guided"/"fast"/"hq". "hq" is the two-stage high-quality pipeline (quality unmeasured). "fast" means a draft that is faster than "guided"; it is not faster than the default pipeline. Passing one to the wrong tier is refused before the call.
Length is frames, not seconds: numFrames must be 8k+1, minimum 25. Mode ceilings: ${ASTRA_FRAME_LIMITS_DESCRIPTION} 121 = about 5.0s at 24fps, the server default. Give autoDuration instead to let the server choose at most 121 frames; the rounded range must contain an 8k+1 value. numFrames wins if both are given.
${ASTRA_LIMITS_LINE}
Every clip comes back with a generated AAC audio track (48kHz stereo, measured). Set generateAudio: false when the episode lays its own narration or BGM over the clip — the server strips the sound after generation (same render time).

Returns: a text block with the saved .mp4 path, the job id, elapsed seconds, and the request the server recorded.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'What the clip shows — subject, movement, environment, camera. English recommended. 1-2000 characters.',
        },
        tier: {
          type: 'string',
          description: 'Pipeline — pick by what the shot needs. "default" (generate, ~66s for 121 frames): the fastest and the usual choice; the only tier taking lora. "guided" (~169s): slower, and the tier to use when the picture must follow a detailed prompt or avoid something (negativePrompt), or when you need numInferenceSteps or guidance. "fast" (guided_fast, ~121s): a 768x512 draft of guided on a 32-pixel grid — faster than guided but not faster than default; use it to preview a guided prompt. "hq" (guided_hq): the two-stage high-quality pipeline for a hero shot where render time does not matter; quality unmeasured.',
          enum: ['default', 'guided', 'fast', 'hq'],
          default: 'default',
        },
        numFrames: astraNumFramesProperty('generate'),
        autoDuration: ASTRA_AUTO_DURATION_PROPERTY,
        width: ASTRA_WIDTH_PROPERTY,
        height: ASTRA_HEIGHT_PROPERTY,
        frameRate: ASTRA_FRAME_RATE_PROPERTY,
        seed: ASTRA_SEED_PROPERTY,
        duration: ASTRA_DURATION_PROPERTY,
        generateAudio: ASTRA_GENERATE_AUDIO_PROPERTY,
        lora: ASTRA_LORA_PROPERTY,
        negativePrompt: ASTRA_NEGATIVE_PROMPT_PROPERTY,
        numInferenceSteps: ASTRA_STEPS_PROPERTY,
        guidance: ASTRA_GUIDANCE_PROPERTY,
        numGeneratedKeyframes: ASTRA_GENERATED_KEYFRAMES_PROPERTY,
        outputPath: ASTRA_OUTPUT_PATH_PROPERTY,
        filename: ASTRA_FILENAME_PROPERTY,
      },
      required: ['prompt'],
    },
  },
  {
    name: 'astra_img2video',
    title: 'ASTRA video generation (image → video)',
    annotations: HINT.generate,
    description: `Animate a still, or interpolate between a first and a last still, on the self-hosted ASTRA video API.

Use when a generated background or photo has to move and nobody is waiting on it — same trade as astra_text2video: free, ours, one job at a time. Give firstFramePath alone to animate from that frame, or add lastFramePath and the clip lands on it. The tool uploads the files itself; pass local paths, not ids.
Do NOT use for more than two stills — that is astra_keyframe_video, which pins each image to a frame index. For an immediate clip use veo_img2video or seedance_img2video.
tier accepts default (generate), guided, or hq (guided_hq — quality unmeasured). guided and hq images require 1536x1024 (omitted dimensions use that size); fast images are not enabled. lora is default-only; negativePrompt and numInferenceSteps are guided-only, and with guidance also hq. Passing one to the wrong tier is refused before the call.
The last frame is pinned to numFrames-1, so a 121-frame clip ends on frame 120. autoDuration lets the server choose at most 121 frames from a first still alone; it is refused with lastFramePath unless numFrames is also given (numFrames wins). png, jpg and jpeg are accepted, up to 32 MiB each.
Warning: image-conditioned generate (width 1280, measured at heights 704/768) failure frames: {121,129,137}; guided (width 1280, measured at height 704) failure frames: {121}. Guided 129/137 succeeded at 1280x704 in server probes (the only guided size probed). The client requires 1536x1024 for guided images, so the guided 1280x704 probes are not client alternatives. Within current client limits use generate 113/145 (measured at 1280x704); generate 1536x704 and 1536x1024 at 121 frames also succeeded. Text-only 1280x704 at 121 frames succeeded. An upstream defect is a hypothesis, not a confirmed cause. The server owns the failure-band acceptance gate; this warning adds no client-side block.
${ASTRA_LIMITS_LINE}
Every clip comes back with a generated AAC audio track (48kHz stereo, measured). Set generateAudio: false when the episode lays its own narration or BGM over the clip — the server strips the sound after generation (same render time).

Returns: a text block with the saved .mp4 path, the job id, elapsed seconds, and the request the server recorded.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'What happens between the frames — movement, camera, mood. English recommended. 1-2000 characters.',
        },
        tier: {
          type: 'string', enum: ['default', 'guided', 'hq'], default: 'default',
          description: 'default (generate), guided at 1536x1024 only, or hq (guided_hq, unmeasured, also 1536x1024 only). fast images are unmeasured and not enabled.',
        },
        firstFramePath: {
          type: 'string',
          description: 'Local path to the still the clip starts from (.png/.jpg/.jpeg, at most 32 MiB). Uploaded automatically.',
        },
        lastFramePath: {
          type: 'string',
          description: 'Optional local path to the still the clip ends on. Pinned to the last frame; omit to animate freely from the first.',
        },
        strength: {
          type: 'number',
          description: 'How strictly the generated frames must match the supplied stills, 0.0-1.0 (default: 1.0 — hold the image exactly).',
        },
        numFrames: astraNumFramesProperty('generate'),
        autoDuration: ASTRA_AUTO_DURATION_PROPERTY,
        width: ASTRA_WIDTH_PROPERTY,
        height: ASTRA_HEIGHT_PROPERTY,
        frameRate: ASTRA_FRAME_RATE_PROPERTY,
        seed: ASTRA_SEED_PROPERTY,
        duration: ASTRA_DURATION_PROPERTY,
        generateAudio: ASTRA_GENERATE_AUDIO_PROPERTY,
        lora: ASTRA_LORA_PROPERTY,
        negativePrompt: ASTRA_NEGATIVE_PROMPT_PROPERTY,
        numInferenceSteps: ASTRA_STEPS_PROPERTY,
        guidance: ASTRA_GUIDANCE_PROPERTY,
        numGeneratedKeyframes: ASTRA_GENERATED_KEYFRAMES_PROPERTY,
        outputPath: ASTRA_OUTPUT_PATH_PROPERTY,
        filename: ASTRA_FILENAME_PROPERTY,
      },
      required: ['prompt', 'firstFramePath'],
    },
  },
  {
    name: 'astra_keyframe_video',
    title: 'ASTRA video generation (keyframes → video)',
    annotations: HINT.generate,
    description: `Render a clip that passes through 2-8 supplied stills at frame indices you choose (ASTRA video API, mode keyframe).

Use when the shot has to hit specific compositions in a specific order — a storyboard row rendered as one continuous move rather than three cuts. Each image names its own frameIdx, so the pacing between beats is yours.
Do NOT use for one or two stills (astra_img2video is simpler) or when the clip is driven by sound (astra_audio2video).
frameIdx is 0-based and must be inside the clip: a 121-frame render accepts 0-120. This mode has no length-guessing and no adapters — autoDuration, numGeneratedKeyframes and lora do not exist here and are refused before the call. A measured 121-frame render took about 184s plus queue.
${ASTRA_LIMITS_LINE}
Every clip comes back with a generated AAC audio track (48kHz stereo, measured). Set generateAudio: false when the episode lays its own narration or BGM over the clip — the server strips the sound after generation (same render time).

Returns: a text block with the saved .mp4 path, the job id, elapsed seconds, and the request the server recorded.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'What the move between the keyframes looks like. English recommended. 1-2000 characters.',
        },
        images: {
          type: 'array',
          description: 'The 2-8 stills the clip must pass through, each pinned to a frame index. Uploaded automatically.',
          minItems: 2,
          maxItems: 8,
          items: {
            type: 'object',
            description: 'One keyframe: the local image and the frame it lands on.',
            properties: {
              imagePath: {
                type: 'string',
                description: 'Local path to the still (.png/.jpg/.jpeg, at most 32 MiB).',
              },
              frameIdx: {
                type: 'integer',
                description: 'Frame this still lands on, 0-based. Must be 0..numFrames-1 (0-120 for the default 121 frames).',
              },
              strength: {
                type: 'number',
                description: 'How strictly this frame must match the still, 0.0-1.0 (default: 1.0).',
              },
              crf: {
                type: 'integer',
                description: 'Per-image encode quality passed through to the pipeline, 0-51 (default: 18). Lower is higher quality.',
              },
            },
            required: ['imagePath', 'frameIdx'],
          },
        },
        numFrames: astraNumFramesProperty('keyframe'),
        width: ASTRA_WIDTH_PROPERTY,
        height: ASTRA_HEIGHT_PROPERTY,
        frameRate: ASTRA_FRAME_RATE_PROPERTY,
        seed: ASTRA_SEED_PROPERTY,
        duration: ASTRA_DURATION_PROPERTY,
        generateAudio: ASTRA_GENERATE_AUDIO_PROPERTY,
        negativePrompt: ASTRA_NEGATIVE_PROMPT_PROPERTY,
        numInferenceSteps: ASTRA_STEPS_PROPERTY,
        guidance: ASTRA_GUIDANCE_PROPERTY,
        outputPath: ASTRA_OUTPUT_PATH_PROPERTY,
        filename: ASTRA_FILENAME_PROPERTY,
      },
      required: ['prompt', 'images'],
    },
  },
  {
    name: 'astra_audio2video',
    title: 'ASTRA video generation (audio → video)',
    annotations: HINT.generate,
    description: `Render a clip driven by an existing audio track on the self-hosted ASTRA video API (mode audio2video).

Use when the picture has to follow a sound you already have — a narration take, a music bed, a recorded effect — instead of the picture being cut to it afterwards. Provide exactly one of audioPath (local .wav/.mp3) or audioUploadId (reuse an existing upload without uploading again). Reused ids have unknown expiry/duration locally, so the server checks them. Optionally give imagePath to pin one portrait to frame 0.
Do NOT use to add sound to a finished clip: this generates new picture from the audio, it does not mux. The rendered video carries the supplied WAV re-encoded as AAC (48kHz stereo): a measured upload-to-output 100ms RMS Pearson correlation was 0.99997 at zero lag. Input audio must have two channels: mono fails in the engine's audio encoder, so the server refuses it at upload (re-encode with ffmpeg -ac 2). The audio after audioStartTime must also cover the video: a WAV more than 0.08s shorter than numFrames/frameRate (121 frames when omitted) dies on a latent shape mismatch, so it is refused after upload and before the job with the length to fix — or pass audioMaxDuration to follow the audio.
Choose either numFrames or audioMaxDuration, never both. numFrames fixes the clip length. audioMaxDuration uses the shorter of that value and the audio remaining after audioStartTime, floors seconds × frameRate, then rounds down to 8k+1; more than ${ASTRA_VIDEO_FRAME_LIMITS.audio2video} frames is refused when upload duration is known. audioStartTime must be before the uploaded audio ends. With neither length field, the default is 121 frames (about 5.04s at 24fps), not the source audio length: an 8.000s WAV produced 5.041s of audio. Set numFrames or audioMaxDuration to request a longer span; audioMaxDuration=8.0 at 24fps rounds down to 185 frames (about 7.708s), so grid rounding can still trim the tail. A measured 121-frame render took about 170s plus queue.
Set expectLipSync:true when every spoken line in the audio belongs to a visible speaker (on_screen). LTX 2.5 sometimes ignores the voice, so after each render ffmpeg compares the picture's motion with the speech loudness; when no region moves with the speech, the same audio, image and prompt render again with a new seed, up to maxAttempts (default 2, each a full render). It never fails the call: the best clip is returned with its findings, and every attempt's seed and measurement are written into its .astra-job.json. It also reports speech cut off by the frame count and a clip audio track that differs from the supplied WAV; another seed fixes neither, so those are reported, not retried. It does not judge phoneme-level lip sync, which visible person spoke, or voice identity, and in medium or wide shots the mouth is too small to measure reliably. Calibrated 2026-10-17 on five real close-ups whose mouths stayed closed (margins −0.23 to −0.08, threshold 0.1); no real clip that followed the voice was available, and a new seed rarely fixed a refusal, so a second failure points at the opening image, prompt or strength. Leave it off for music, effects or off-screen voice.
${ASTRA_LIMITS_LINE}

Returns: a text block with the saved .mp4 path, the job id, elapsed seconds, the request the server recorded and, with expectLipSync, each attempt's speech sync result.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'What the text-free picture shows while the supplied audio plays. Use speech_manage plan_video.videoPrompt; describe action without quoting the spoken dialogue. Explicitly exclude subtitles, captions and typography. English recommended. 1-2000 characters.',
        },
        audioPath: {
          type: 'string',
          description: 'Local path to the driving audio (.wav or .mp3, at most 32 MiB). Stereo (2-channel) input required. Mono is refused at upload (it fails in the engine audio encoder); an id uploaded before 2026-10-17 15:00Z can still be mono and fail during generation. Uploaded automatically.',
        },
        audioUploadId: {
          type: 'string', minLength: 1,
          description: 'Existing audio upload id, mutually exclusive with audioPath. Stereo (2-channel) input required. Mono is refused at upload (it fails in the engine audio encoder); an id uploaded before 2026-10-17 15:00Z can still be mono and fail during generation. No upload or local source-duration check. Server rejects expired ids.',
        },
        imagePath: {
          type: 'string', minLength: 1,
          description: 'Optional local portrait (.png/.jpg/.jpeg, at most 32 MiB), pinned to frame 0.',
        },
        strength: {
          type: 'number', minimum: 0, maximum: 1, default: 0.9,
          description: 'Portrait conditioning strength, 0.0-1.0 (default: 0.9); ignored without imagePath. Earlier dialogue probes: 0.9 accompanied mouth movement and 0.7 accompanied a changed person, but prompts also differed. A later fixed-prompt 19.2 pair is an observation, not proof of improved identity or lip-sync at 0.9. 1.0 is unmeasured on cuts with a clearly detailed, unobscured mouth close-up in the conditioning image; neither local dialogue source (19.2 or 25.3) meets that condition.',
        },
        audioStartTime: {
          type: 'number',
          description: 'Seconds into the track to start reading from (default: 0). Must be less than the uploaded audio duration.',
        },
        audioMaxDuration: {
          type: 'number',
          description: `Maximum seconds to use after audioStartTime. Mutually exclusive with numFrames. With a fresh upload, the shorter of this and remaining audio must produce at most ${ASTRA_VIDEO_FRAME_LIMITS.audio2video} frames on the 8k+1 grid. Reused ids defer duration checks to the server. At 24fps, 8 seconds selects 185 frames (about 7.71s). If both length fields are omitted, the server uses 121 frames (about 5.04s), not the audio length.`,
        },
        numFrames: astraNumFramesProperty('audio2video'),
        width: ASTRA_WIDTH_PROPERTY,
        height: ASTRA_HEIGHT_PROPERTY,
        frameRate: ASTRA_FRAME_RATE_PROPERTY,
        seed: ASTRA_SEED_PROPERTY,
        duration: ASTRA_DURATION_PROPERTY,
        generateAudio: ASTRA_GENERATE_AUDIO_PROPERTY,
        negativePrompt: ASTRA_NEGATIVE_PROMPT_PROPERTY,
        numInferenceSteps: ASTRA_STEPS_PROPERTY,
        guidance: ASTRA_GUIDANCE_PROPERTY,
        expectLipSync: {
          type: 'boolean', default: false,
          description: 'true when every spoken line in the audio is said by a visible person. Checks that the picture moves with the speech after each render and re-renders with a new seed when it does not. Off for music, effects or off-screen voice.',
        },
        maxAttempts: {
          type: 'integer', minimum: 1, maximum: 3, default: 2,
          description: 'expectLipSync only: total renders including the first (default 2). Each one is a full render (~170s plus queue) on the one-at-a-time ASTRA box.',
        },
        outputPath: ASTRA_OUTPUT_PATH_PROPERTY,
        filename: ASTRA_FILENAME_PROPERTY,
      },
      required: ['prompt'],
      oneOf: [{ required: ['audioPath'] }, { required: ['audioUploadId'] }],
    },
  },
  {
    name: 'astra_ic_lora',
    title: 'ASTRA video generation (IC-LoRA reference → video)',
    annotations: HINT.generate,
    description: `Render a clip conditioned on one reference still or clip through an IC-LoRA adapter on the self-hosted ASTRA video API.

Use when an existing picture has to be transformed rather than invented: "ingredients" builds a new clip from the reference's subject; "clean-plate", "colorization", "day-to-night", "deblur", "decompression" and "water-simulation" rework the reference clip; "pixel-upscaler-x2" upscales it (request an output twice the reference size yourself). The server picks the adapter weights from its own catalog — there is no path argument. The tool uploads the reference and the optional mask itself; pass local paths.
Do NOT use to animate a still from frame 0 (astra_img2video) or to re-roll a span of a clip (astra_video_retake).
Status: adapter "ingredients" without conditioningMask and skipStage2 runs as the server's existing ingredients mode. Every other adapter runs as mode ic_lora; conditioningMask and skipStage2 are live since the 2026-10-17 server change. Recommended strengths per adapter are unmeasured.
A reference clip of 2 or more frames above ${ASTRA_VIDEO_MAX_REFERENCE_PIXELS} pixels is refused after upload and before the job, as the server does. skipStage2 skips the second stage, so the output is half resolution. Length: numFrames 8k+1, ${ASTRA_VIDEO_MIN_FRAMES}-${ASTRA_VIDEO_FRAME_LIMITS.ic_lora} (the server ceiling; long references are not generation-tested); there is no autoDuration.
${ASTRA_LIMITS_LINE}

Returns: a text block with the saved .mp4 path, the job id, elapsed seconds, and the request the server recorded.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'What the output clip shows. English recommended. 1-2000 characters.',
        },
        adapter: {
          type: 'string',
          enum: [...ASTRA_VIDEO_IC_LORA_ADAPTERS],
          description: 'What to do with the reference. "ingredients": generate a NEW clip conditioned on a reference sheet — one composite image laying out the characters, objects and look to use (runs today as the ingredients mode). "clean-plate": remove people, pedestrians and vehicles from a reference clip and rebuild the empty background (VFX plate). "colorization": restore natural colour to grayscale, monochrome or desaturated video. "day-to-night": re-render a daytime clip as the same shot at night. "deblur": remove blur from a reference clip. "decompression": remove compression artefacts from low-bit-rate or heavily compressed video. "water-simulation": add water to a clip — rivers, surf, rain, waterfalls, floods, splashes. "pixel-upscaler-x2": creatively upscale a low-resolution clip 2x — request width/height twice the reference size. Every adapter except ingredients runs as mode ic_lora; per-adapter quality and strengths are unmeasured.',
        },
        referencePath: {
          type: 'string',
          description: 'Local reference still or clip (.png/.jpg/.jpeg up to 32 MiB, .mp4 up to 100 MiB). Uploaded automatically.',
        },
        referenceStrength: {
          type: 'number', minimum: 0, maximum: 1,
          description: 'Reference conditioning strength, 0.0-1.0 (server default: 1.0).',
        },
        conditioningMaskPath: {
          type: 'string',
          description: 'Optional local black-and-white .mp4 attention mask over the reference. Uploaded automatically. It must feed as many frames as the reference (a still reference takes a 1-frame mask), and that count, after numFrames caps both, must be 1 or 8k+1 — otherwise it is refused before the job.',
        },
        conditioningMaskStrength: {
          type: 'number', minimum: 0, maximum: 1,
          description: 'Mask strength, 0.0-1.0. Requires conditioningMaskPath.',
        },
        skipStage2: {
          type: 'boolean',
          description: 'Skip the second (upscaling) stage: faster, half-resolution output. Default false.',
        },
        numFrames: astraNumFramesProperty('ic_lora'),
        width: ASTRA_WIDTH_PROPERTY,
        height: ASTRA_HEIGHT_PROPERTY,
        frameRate: ASTRA_FRAME_RATE_PROPERTY,
        seed: ASTRA_SEED_PROPERTY,
        duration: ASTRA_DURATION_PROPERTY,
        generateAudio: ASTRA_GENERATE_AUDIO_PROPERTY,
        outputPath: ASTRA_OUTPUT_PATH_PROPERTY,
        filename: ASTRA_FILENAME_PROPERTY,
      },
      required: ['prompt', 'adapter', 'referencePath'],
    },
  },
  {
    name: 'astra_video_retake',
    title: 'ASTRA video retake (re-roll a span)',
    annotations: HINT.generate,
    description: `Re-generate one time span of an existing clip and keep the rest (ASTRA video API, mode retake).

Use when a cut is right except for a stretch in the middle — a gesture that lands wrong, a background that wobbles for a second — and re-rolling the whole shot would lose the framing you already liked. Name the span in seconds with startTime and endTime; the tool uploads the source mp4 itself.
Do NOT use to make a clip longer or to change its size: the output inherits the source exactly, and this mode has no width, height, frameRate or numFrames argument at all.
The SOURCE has to be on the grid already — 8k+1 frames, both sides a multiple of 32 — or the server refuses at acceptance. A clip this API produced always qualifies. A measured retake took about 80s plus queue.
The tool checks the upload response before submission: endTime must not pass source frames/fps, so an invalid source or span does not consume a queue slot.
${ASTRA_LIMITS_LINE}
Every clip comes back with a generated AAC audio track (48kHz stereo, measured). Set generateAudio: false when the episode lays its own narration or BGM over the clip — the server strips the sound after generation (same render time).

Returns: a text block with the saved .mp4 path, the job id, elapsed seconds, and the request the server recorded.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'What should happen in the re-rolled span. English recommended. 1-2000 characters.',
        },
        sourceVideoPath: {
          type: 'string',
          description: 'Local path to the clip being retaken (.mp4, at most 100 MiB). Must be 8k+1 frames with both sides a multiple of 32.',
        },
        startTime: {
          type: 'number',
          description: 'Where the re-rolled span begins, in seconds from the start of the clip.',
        },
        endTime: {
          type: 'number',
          description: 'Where the re-rolled span ends, in seconds. Must be greater than startTime and no later than the uploaded source duration.',
        },
        seed: ASTRA_SEED_PROPERTY,
        generateAudio: ASTRA_GENERATE_AUDIO_PROPERTY,
        outputPath: ASTRA_OUTPUT_PATH_PROPERTY,
        filename: ASTRA_FILENAME_PROPERTY,
      },
      required: ['prompt', 'sourceVideoPath', 'startTime', 'endTime'],
    },
  },
  {
    name: 'astra_video_capabilities',
    title: 'ASTRA video capabilities (live limits)',
    annotations: HINT.read,
    description: `Read the live ASTRA video server's own capability report (GET /v1/models): for each mode the fields it accepts, frame and pixel ceilings, blocked width/frame combinations, the lora and IC-LoRA catalogs, and the rate limits — the values that process actually enforces right now.

Use before an unusual request (a new adapter, guidance, hq, a large size, a long clip) when you are unsure the server accepts it: the tool descriptions were written for the 2026-10-17 server, and a later server change can differ from them. A field missing from a mode in this report is refused with a 400.
Do NOT call it before every render — the ordinary arguments are already checked locally, and the server rate-limits queries per minute.

Returns: the server's JSON report verbatim. No arguments.`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'astra_video_list_uploads',
    title: 'ASTRA video upload list',
    annotations: HINT.read,
    description: 'List uploads owned by the configured ASTRA_VIDEO key. No filters or pagination arguments. Uploads expire after 24 hours; the key has a 20-upload / 1 GiB storage ceiling. Requires server GET /v1/uploads support; an unavailable endpoint or invalid response is an error, never an empty list. Server support and response contract still require live verification.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'astra_video_delete_upload',
    title: 'Delete an ASTRA video upload',
    annotations: HINT.moderate,
    description: '⚠️ Destructive: never call without user approval for the selected upload (HITL). Permanently delete one upload owned by the configured ASTRA_VIDEO key. List uploads first and choose the exact uploadId; do not delete inputs still needed by queued/running jobs or planned reuse. Requires server DELETE /v1/uploads/<id> support. An unavailable endpoint or unconfirmed response is an error, never a successful deletion. Server support and response contract still require live verification.',
    inputSchema: {
      type: 'object',
      properties: { uploadId: { type: 'string', minLength: 1, maxLength: 256, pattern: '^[A-Za-z0-9_-]+$', description: 'Exact upload identifier from the list; not a URL or local path.' } },
      required: ['uploadId'],
      additionalProperties: false,
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
          description: 'Scene and subject interactions. The 2.x advanced formula: precise subject + action details + scene/environment + lighting & color tone + camera movement + visual style + image quality + constraints. For multi-cut, write a "Shot 1 / Shot 2 / Shot 3" storyboard and order each shot as camera movement -> subject action and expression -> position change -> audio; open on the wide so the later cuts inherit one floor plan, and time each cut by an action beat. Do NOT put timecodes on the shots — the vendor states precise-timing support is unstable (dreamina-seedance-2-5-260628 alone takes integer-second forms). Close with the constraints slot as a POSITIVE-LOCKS paragraph — what holds in every frame, said positively, with each reference given its scope ("@ocean_location controls water and sky only"; "the lantern stays lit in every cut") — because this engine has no negativePrompt parameter; the one exception the vendor templates is the artifact classes (subtitles, on-frame text, logo, watermark, BGM), which may stay negative. English or Chinese only (Korean on dreamina-seedance-2-5-260628 alone; for audio-conditioned speech, use the supplied audio and omit literal dialogue quotes from the visual prompt). Unwanted subtitles cannot be fully blocked at 9:16: the vendor notes portrait output hallucinates burned-in text noticeably more often than landscape, so inspect the frames.',
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

Use as an optional local clip when MLX Core is running with a video model (LTX 2.5 MLX pack — install runbook in docs/mlx-ltx-2.5.md). Default canvas is ${DEFAULT_MLX_VIDEO_WIDTH}×${DEFAULT_MLX_VIDEO_HEIGHT} at ${DEFAULT_MLX_VIDEO_FRAMES} frames / ${MLX_VIDEO_FPS} fps (~2s). Width/height must be a multiple of ${MLX_VIDEO_DIMENSION_STEP} (two-stage LTX grid), or of ${MLX_VIDEO_DIMENSION_STEP_ONE_STAGE} when you pass pipeline:"one_stage" — 1080 is on neither grid; use 1088×1920 or the default. numFrames is ${MLX_VIDEO_FRAME_STEP}k+1 (${MIN_MLX_VIDEO_FRAMES}, 17, … ${DEFAULT_MLX_VIDEO_FRAMES} …): any other count is answered 200 with the server's own default. Decoded RGB is capped at ${Math.round(MAX_VIDEO_RGB_BYTES / (1024 * 1024))}MB — 1088×1920 at 8s/24fps is ~1.2GB and is refused. lastFrameImagePath needs at least ${MIN_MLX_VIDEO_FRAMES} frames.
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
          description: `Width (default: ${DEFAULT_MLX_VIDEO_WIDTH}). ${MIN_MLX_VIDEO_DIMENSION}–${MAX_MLX_VIDEO_DIMENSION}, multiple of ${MLX_VIDEO_DIMENSION_STEP} (${MLX_VIDEO_DIMENSION_STEP_ONE_STAGE} with pipeline:"one_stage"). 1080 is on neither grid.`,
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
          description: `Frame count (default: ${DEFAULT_MLX_VIDEO_FRAMES}). ${MIN_MLX_VIDEO_FRAMES}–${MAX_MLX_VIDEO_FRAMES} at ${MLX_VIDEO_FPS} fps, and ${MLX_VIDEO_FRAME_STEP}k+1 (${MIN_MLX_VIDEO_FRAMES}, 17, 25, … ${MAX_MLX_VIDEO_FRAMES}). last_frame interpolation needs at least ${MIN_MLX_VIDEO_FRAMES}.`,
          minimum: MIN_MLX_VIDEO_FRAMES,
          maximum: MAX_MLX_VIDEO_FRAMES,
          default: DEFAULT_MLX_VIDEO_FRAMES,
        },
        steps: {
          type: 'number',
          description: 'Diffusion steps 1–50. Distilled packs (the 4-bit LTX 2.5 build) run a fixed 8 and ignore this; it only moves a non-distilled pack. Omit for the model default.',
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
          description: `LTX pipeline. two_stage is the usual quality setting; two_stage_hq costs more time again. one_stage is the only one that takes the ${MLX_VIDEO_DIMENSION_STEP_ONE_STAGE}px grid.`,
          enum: ['one_stage', 'two_stage', 'two_stage_hq'],
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
              rollDeg: { type: 'number', minimum: -35, maximum: 35, description: 'Local camera Z rotation in degrees after aiming; 0 keeps the horizon level. Used for FPV banking.' },
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

Use for acted beats the cut is about — a point, a wave, a bow, a crouch and jump, a dance count — when no motion-capture clip fits (blender_motion_import is the natural-motion path). A group that is present keys every bone it covers with omitted channels at 0 (the rest pose: arms hanging, standing straight); a group that is absent leaves those bones alone at that frame. With clearExisting:true, channels first keyed later get a rest key at the scene start, so future poses do not leak into the opening; pelvis translation is anchored separately from rotation. Layered accents (clearExisting:false) keep the existing clip. raise 90 puts a limb horizontal in front, side 90 horizontal out to the side, elbow/knee 0–150 bend the joint; bow/nod + lean forward, lean/tilt + go to the figure's left, turn + turns to the figure's left; hips.offset [0, 0, -0.2] drops the pelvis 20 cm (a crouch, with knees and thighs bent to match). The raw bones map takes any rig bone as [x, y, z] degrees about the figure's X (side), Y (front-back) and Z (up) axes. Keys more than about 120° apart need an intermediate key or the joint may swing the other way round.
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
    name: 'tts_review_final', title: 'Review assembled speech', annotations: HINT.generate,
    description: 'Optional review only when the user explicitly requests automatic audio review; never a default production or delivery requirement. Listen to the actual final WAV or video, including all sentence transitions and the music mix. Requires accuracy >=98 and pronunciation, naturalness, clarity and continuity >=95, with no defects. Writes a hash-bound .speech-quality.json proof. The blind-transcription (STT) check and its CER <=2% gate do not run unless transcriptCheck carries a user request for them (owner directive 2026-10-04). One paid Gemini review call per payload (two with transcriptCheck); no synthesis. An optional review outage is reported without blocking default delivery. Supply the complete spoken text including native clip speech. Supports up to 30 minutes and 12,000 script characters, with a lossless FLAC review payload under 14 MiB. Payloads over 14 MiB require final-timeline sentence segments; the tool reviews lossless chapters and every cross-chapter sentence join, then binds all coverage to the complete media. Budget one review per chapter and boundary (two with transcriptCheck).',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      mediaPath: { type: 'string', description: 'Absolute path of the final media that ships.' },
      segments: { type: 'array', minItems: 1, maxItems: 1000, description: 'Required when the final FLAC exceeds 14 MiB. Complete spoken sentences in playback order on the final timeline. First starts at 0; each extends to the next start (last to audio EOF), at most 60 seconds each. Joined text must equal expectedText. The tool groups them into bounded chapters and reviews every chapter boundary.', items: { type: 'object', additionalProperties: false, required: ['startSeconds','expectedText'], properties: { startSeconds: { type: 'number', minimum: 0, description: 'Start of this complete sentence on the final audio timeline; the first is 0.' }, expectedText: { type: 'string', minLength: 1, maxLength: 1000, description: 'Complete spoken sentence, including intended phonetic number/name spelling.' } } } },
      expectedText: { description: 'Complete spoken text, including speech in clips and the outro.', type: 'string', minLength: 1, maxLength: 12000 },
      language: { description: 'Spoken language, for example Korean.', type: 'string', minLength: 2, maxLength: 80 },
      delivery: { description: 'Intended delivery and continuity across the whole episode.', type: 'string', minLength: 1, maxLength: 2000 },
      transcriptCheck: { type: 'object', additionalProperties: false, required: ['requestedBy','reason'], description: 'Present only when the user asked for the blind-transcription (STT) check; omitted, that check does not run and only the listening review judges the take. Carries who asked and their actual words — there is no environment default.', properties: {
        requestedBy: { type: 'string', minLength: 1, maxLength: 200, description: 'Who asked for the dictation check, e.g. "user".' }, reason: { type: 'string', minLength: 10, maxLength: 1000, description: 'The actual request that turned it on, quoted or referenced.' },
      } },
    }, required: ['mediaPath','expectedText','language','delivery'] },
  },
  {
    name: 'tts_elevenlabs_dictionary', title: 'Create pronunciation dictionary', annotations: HINT.generate,
    description: 'Create a versioned ElevenLabs pronunciation dictionary. v4 supports versioned pronunciation dictionaries. Use for Korean proper names without inserting spaces or deleting the name from the script. Returns pronunciationDictionaryId and versionId to pin in generation.pronunciationDictionaryLocators. Keep aliases faithful to the approved pronunciation; verify actual audio. Requires ElevenLabs dictionary write permission; never changes the voice or existing dictionaries.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      name: { description: 'Descriptive name of the new dictionary.', type: 'string', minLength: 1, maxLength: 200 },
      rules: { description: 'Approved source spelling and intended spoken aliases.', type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', additionalProperties: false, properties: {
        stringToReplace: { description: 'Source name as written in the narration.', type: 'string', minLength: 1, maxLength: 200 }, alias: { description: 'Intended pronunciation in Hangul for an alias rule.', type: 'string', minLength: 1, maxLength: 200 },
        type: { description: 'Rule kind; alias by default. Non-English phonemes require v3.', type: 'string', enum: ['alias','phoneme'], default: 'alias' },
        phoneme: { description: 'Phonetic notation for a phoneme rule.', type: 'string', minLength: 1, maxLength: 200 },
        alphabet: { description: 'Alphabet of the phoneme rule.', type: 'string', enum: ['ipa','cmu-arpabet'] },
      }, required: ['stringToReplace'] } },
    }, required: ['name','rules'] },
  },
  {
    name: 'tts_generate_checked',
    title: 'Generate and review narration',
    annotations: HINT.generate,
    description: `Generate one scene with the pinned TTS engine, review the actual WAV, and regenerate failed takes up to maxAttempts (1–3, including the first take).
Legacy opt-in review tool: use only when the user explicitly requests automatic audio review. Never call from default produce/autoproduce; those flows use raw TTS and speech_manage provenance. Pass the existing generator's arguments in generation, the complete spoken expectedText (phonetic spelling; no acting tags or speaker labels), language, and the profile's intended delivery. Voice and generation settings stay unchanged across attempts; the episode seed stays fixed on every retake (vendor determinism is best-effort). An entire scene is one call; never split it into sentence calls.
Every single-voice take has its sentences re-spaced before review: a fixed sentencePause of digital silence between sentences (stretched up to 1.0s where a subtitle cue would read faster than 6.0 chars/s after playbackSpeed), a 0.14s lead, speech samples copied as generated (the 12 ms fades stay on the natural gap). tts_elevenlabs_generate is fetched with timestamps and spaced from its own alignment; tts_generate and tts_gemini_38 are aligned by the local forced aligner (mlx-qwen3-asr --timestamps) first, so a multi-sentence scene on any engine ships with the same pauses. Pass segments (the scene's narration[].tts list) so the pauses land on the builder's segment boundaries; the wrapper writes <wav>.sentences.json and the .alignment.json for the shipped audio. Generate consecutive sentences in one call whenever they belong to one breath — the engine reads them as one utterance, where one call per sentence restarts the voice at every sentence.
Checks signal/duration, then ${REVIEW_MODEL} listening scores: accuracy >=98, pronunciation/naturalness/clarity >=95, confidence >=0.9, no audible defects. The blind-transcription (STT) check and its CER <=2% gate do not run unless transcriptCheck carries a user request for them (owner directive 2026-10-04); the proof then records transcript: null. Returns an optional historical hash-bound .wav.quality.json review proof. Missing keys, unavailable reviewer or malformed responses hold production (unverified); exhausted attempts return fail, and that finding goes to the user as a warning they can accept for the current take (skills/produce/references/tts-hitl.md). Scores are operational thresholds, not a guarantee of human judgement.
Requires ffmpeg and GEMINI_API_KEY even for local synthesis. One paid audio-review call per acoustically valid take (two with transcriptCheck), plus the selected generator's costs. Record the retry-inclusive allowance before calling; review tokens are logged as unpriced until reconciled with provider billing. Do not call again to reset an exhausted attempt budget. Do not use for recordings or native clip speech. Do not change engines/voices or lower thresholds to obtain PASS.`,
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
        episode: { type: 'object', additionalProperties: false, description: 'Required for ElevenLabs assembly. Ordered complete scene texts, current index and one fixed seed. Derives v4 previousText/nextText, bounded to 100 characters per side. A fixed seed is best effort; listening is not automatic.', properties: {
          texts: { description: 'Complete scene texts in playback order.', type: 'array', minItems: 1, maxItems: 80, items: { type: 'string', minLength: 1, maxLength: 4000 } },
          index: { description: 'Index of this scene in texts, starting at zero.', type: 'integer', minimum: 0 }, seed: { description: 'One seed fixed across the episode and all retakes.', type: 'integer', minimum: 0, maximum: 4294967295 },
        }, required: ['texts','index','seed'] },
        segments: { type: 'array', minItems: 1, maxItems: 80, items: { type: 'string', minLength: 1, maxLength: 1000 }, description: 'The scene\'s narration[].tts sentences in order (joined they read as expectedText). Every single-voice take gets a fixed pause at each segment boundary — the boundary the builder\'s reveals and subtitle cues use. Without it, pauses go after sentence-final punctuation.' },
        sentencePause: { type: 'number', minimum: 0.25, maximum: 1.5, default: 0.5, description: 'Silence between sentences in the take\'s own timeline, seconds. The builder detects pauses from 0.16s and fits a 0.35s reveal fade inside one.' },
        playbackSpeed: { type: 'number', minimum: 0.5, maximum: 3, default: 1, description: 'ElevenLabs requires 1: use generation.speed for the requested rate and keep assembly at 1. Other engines require an explicit user request in outputPath/speed-authorization.json for any non-1 factor; this controls subtitle pause sizing.' },
        transcriptCheck: { type: 'object', additionalProperties: false, required: ['requestedBy','reason'], description: 'Present only when the user asked for the blind-transcription (STT) check; omitted, that check does not run and only the listening review judges the take. Carries who asked and their actual words — there is no environment default.', properties: {
          requestedBy: { type: 'string', minLength: 1, maxLength: 200, description: 'Who asked for the dictation check, e.g. "user".' }, reason: { type: 'string', minLength: 10, maxLength: 1000, description: 'The actual request that turned it on, quoted or referenced.' },
        } },
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
Keep the selected model, voiceName and pinned synthesis settings stable. Scene emotion and delivery belong in each line's stylePrompt, resolved by speech_manage plan_audio; do not force one cheerful baseline onto every scene. Reuse that planned direction across retakes unless revising the acting. After repeated failures, report them; do not silently switch the episode's selected model.

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
    name: 'tts_gemini_38',
    title: 'Acted speech synthesis (Gemini 3.8)',
    annotations: HINT.generate,
    description: `Generate acted single-voice or two-speaker speech with Gemini 3.8 TTS through the Interactions API.

Use for emotional acting, per-line delivery changes, vocal events, pauses, and two-person dialogue. Put lasting delivery in each turn's style field. Put point events directly in text with the documented English angle-bracket tags, such as <laugh>, <sigh>, <cough>, <breath>, <short pause>, or <long pause>. For listener backchannels and overlapping speech in two-speaker mode, put pipe segments such as |oh really?| inside the active speaker's text. The text is read verbatim, so never put stage directions in it unless they are a supported tag.
For a requested age or identity change, create/remix the voice with tts_voice_design first; changing turn style with the same ID is not an identity correction. Single voice accepts a curated name, an extended-library voice, or a voice_ / voicekey_ identifier. Two-speaker mode requires exactly two configured curated voices and every turn must name one configured speaker. Gemini 3.8 supports at most two speakers in one request.
This is a supporting engine for acted cuts and two-person scenes. The saved speech model stays authoritative; never replace an existing Gemini or ElevenLabs v4 selection automatically.

Returns: a text block with the saved 24kHz mono RIFF WAV path, model, voice or speaker assignments, turn count, and total text length.`,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        turns: {
          type: 'array',
          minItems: 1,
          maxItems: 200,
          description: `Spoken turns in playback order; combined text is capped at ${MAX_GEMINI_38_TTS_INPUT_CHARS} characters. Inline vocal tags and |backchannels| stay inside text.`,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              text: { type: 'string', minLength: 1, maxLength: MAX_GEMINI_38_TTS_INPUT_CHARS, description: 'Verbatim spoken text, optionally including documented inline vocal tags or pipe backchannels.' },
              speaker: { type: 'string', minLength: 1, maxLength: 100, description: 'Required on every turn in two-speaker mode; omit for single voice.' },
              style: { type: 'string', minLength: 1, maxLength: 500, description: 'Optional turn-level emotion, pace, volume, or delivery, e.g. "whispered urgently". This is metadata and is not spoken.' },
            },
            required: ['text'],
          },
        },
        model: {
          type: 'string',
          enum: [...GEMINI_38_TTS_MODELS],
          default: DEFAULT_GEMINI_38_TTS_MODEL,
          description: 'gemini-3.8-flash-tts for maximum fidelity and acting nuance; gemini-3.8-flash-lite-tts for lower cost and higher throughput.',
        },
        voice: {
          type: 'string',
          minLength: 1,
          maxLength: 300,
          default: DEFAULT_VOICE,
          description: 'Single-voice selection: curated name, extended-library voice, designed voice_ ID, or replicated voice_ / voicekey_ ID. Ignored when speakers is present.',
        },
        speakers: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          description: 'Exactly two curated speaker/voice assignments for conversational mode. Omit for single voice.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              speaker: { type: 'string', minLength: 1, maxLength: 100, description: 'Speaker label used by matching turns.' },
              voice: { type: 'string', enum: TTS_VOICE_ENUM, description: 'Curated prebuilt voice. Custom voice IDs cannot be combined in one multi-speaker request.' },
            },
            required: ['speaker', 'voice'],
          },
        },
        outputPath: { type: 'string', description: 'Directory path to save the audio file (default: current working directory).' },
        filename: { type: 'string', description: 'WAV filename (default: tts_gemini_38_<timestamp>.wav).' },
      },
      required: ['turns'],
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
    name: 'tts_voice_design', title: 'Design a persistent Gemini character voice', annotations: HINT.generate,
    description: 'Create a paid stored Gemini voice from character age, vocal gender, timbre and accent using POST /v1beta/voices. Use when casting a custom character or changing perceived age/identity; turn style only controls delivery. Optional baseVoice remixes an existing voice. Returns voiceId, local WAV preview, hash, usage and receipt; use that ID with tts_gemini_38. Does not edit character sheets or episodes and does not certify age by listening. Requires GEMINI_API_KEY and a new outputPath per creation; never blindly retry an uncertain call. For catalog discovery use tts_list_voices source:library with filters; for ordinary lines use speech_manage plan_audio.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      model: { type: 'string', enum: ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'], description: 'Explicit voice creation model.' },
      displayName: { type: 'string', minLength: 1, maxLength: 100, description: 'Distinct name for later catalog reconciliation.' },
      prompt: { type: 'string', minLength: 1, maxLength: 4000, description: 'Stable voice identity: perceived age, timbre, accent and baseline delivery; relative changes if baseVoice is supplied.' },
      languageCode: { type: 'string', minLength: 1, description: 'BCP-47 primary language, e.g. ko-KR.' },
      gender: { type: 'string', enum: ['male','female','neutral'], description: 'Perceived vocal gender from character identity.' },
      baseVoice: { type: 'string', minLength: 1, maxLength: 300, description: 'Optional existing prebuilt voice name or accessible custom voice ID to remix.' },
      outputPath: { type: 'string', minLength: 1, description: 'New local directory for voice-design.json and voice-preview.wav. Existing receipt prevents duplicate creation.' }
    }, required: ['model','displayName','prompt','languageCode','gender','outputPath'] }
  },
  {
    name: 'tts_list_voices', title: 'Gemini voice catalog', annotations: HINT.read,
    description: 'List Gemini curated voices or query the live extended/custom voice library. source=curated returns the static 30-voice list without API usage. source=library queries GET /v1beta/voices with pageToken/limit and requires GEMINI_API_KEY. Supports languageCode, gender, pitch, persona and description search; preserve filters across pages. There is no numeric age filter: search description text or use tts_voice_design to create/remix an age-appropriate voice. Returns voice IDs and metadata; metadata age is not listening evidence. For ElevenLabs use tts_elevenlabs_voices. This tool does not synthesize audio.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      source: { type: 'string', enum: ['curated','library'], default: 'curated', description: 'Static basic catalog or live voice library.' },
      languageCode: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'Library-only languageCode filter; multiple values match with OR.' },
      regionCode: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'Library-only regionCode filter; multiple values match with OR.' },
      accent: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'Library-only accent filter; multiple values match with OR.' },
      persona: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'Library-only persona filter; multiple values match with OR.' },
      context: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'Library-only context filter; multiple values match with OR.' },
      gender: { type: 'array', items: { type: 'string', enum: ['male', 'female', 'neutral'] }, description: 'Library-only gender filter.' },
      pitch: { type: 'array', items: { type: 'string', enum: ['low', 'medium', 'high'] }, description: 'Library-only pitch filter.' },
      type: { type: 'array', items: { type: 'string', enum: ['prebuilt', 'prompted', 'replicated'] }, description: 'Library-only type filter.' },
      search: { type: 'string', minLength: 1, description: 'Library-only case-insensitive substring search of name and description, at most 2048 UTF-8 bytes; not a numeric age range.' },
      pageToken: { type: 'string', description: 'Next page token from a prior library response.' },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 30, description: 'Maximum library voices per request.' }
    } }
  },
  {
    name: 'tts_elevenlabs_generate', title: 'ElevenLabs v4 single voice', annotations: HINT.generate,
    description: 'Create a paid single-voice take with eleven_v4 through Text to Dialogue. Use for narration, voiceover or a character line. Put delivery cues in [audio tags] and pronunciation in /IPA/. Returns a local audio path (RIFF WAV by default), available usage/request metadata, warnings and an optional alignment sidecar. Do NOT use to discover voices — use tts_elevenlabs_voices; use tts_elevenlabs_dialogue for multiple voices. Preserve the pinned voice. Free-tier output is non-commercial. No automatic review or model fallback.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      text: { type: 'string', minLength: 1, maxLength: MAX_ELEVENLABS_INPUT_CHARS, description: 'Spoken text, e.g. "[whispering] Hello."; /IPA/ is supported, SSML is not. Model cap 10000; Dialogue recommends <=2000 total characters to avoid truncation or validation failures. Longer accepted inputs return a warning.' },
      voiceId: ELEVENLABS_VOICE_ID_PROPERTY,
      ...ELEVENLABS_V4_PROPERTIES
    }, required: ['text','voiceId'] }
  },
  {
    name: 'tts_elevenlabs_dialogue', title: 'ElevenLabs v4 multi-voice dialogue', annotations: HINT.generate,
    description: 'Create paid multi-voice dialogue with eleven_v4 for conversations or character exchanges. Each turn has text and voiceId, with optional [audio tags] or /IPA/ in text. REST permits 10 distinct voices. Keep total text <=2000 characters for reliable generation; model cap 10000. Returns a local audio path, available usage/request metadata, warnings and optional timestamps with voice_segments. Do NOT use to discover voices — use tts_elevenlabs_voices. Use tts_elevenlabs_generate for one voice, or tts_multi_speaker for selected Gemini dialogue. Mixed-speaker output requires an explicit dialogue assembly route. No automatic review or model fallback.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      inputs: { type: 'array', minItems: 1, maxItems: ELEVENLABS_DIALOGUE_MAX_INPUTS, description: 'Ordered turns, e.g. [{"text":"Hello.","voiceId":"your-voice-id"}]. REST permits 10 voices; this plugin accepts up to 50 turns.', items: { type: 'object', additionalProperties: false, properties: {
        text: { type: 'string', minLength: 1, description: 'Turn transcript, e.g. "[laughing] Hello."; optional v4 audio tags or /IPA/.' }, voiceId: ELEVENLABS_VOICE_ID_PROPERTY
      }, required: ['text','voiceId'] } }, ...ELEVENLABS_V4_PROPERTIES
    }, required: ['inputs'] }
  },
  {
    name: 'tts_elevenlabs_voices', title: 'ElevenLabs voice search and previews', annotations: HINT.read,
    description: 'Read account voices from /v2/voices, with IDs, descriptions, labels, verified languages and preview URLs. Needs voices_read; optional usage information needs user_read. This is an API lookup; Gemini voices are in tts_list_voices. Follow nextPageToken until hasMore is false. Search language/traits, then generate three matched character previews with character_voice_audition before the user selects their voice.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      search: { type: 'string', description: 'Search name, description and labels.' },
      category: { type: 'string', enum: [...ELEVENLABS_VOICE_CATEGORIES], description: 'Account voice category.' },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 30, description: 'Page size.' },
      nextPageToken: { type: 'string', description: 'Continuation token from the previous page.' },
      languages: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 20, description: 'Language filters, e.g. ["ko"].' },
      gender: { type: 'string', description: 'Voice gender label filter.' },
      accent: { type: 'string', description: 'Voice accent label filter.' }
    } }
  },

  // ── Sound effects (ElevenLabs — text → SFX) ──────────────────────────────
  {
    name: 'sfx_elevenlabs_generate',
    title: 'Sound effect (ElevenLabs · text → SFX)',
    annotations: HINT.generate,
    description: `Generate one sound effect from a text description with ElevenLabs (${ELEVENLABS_SFX_MODEL}) — the lane that fills a channel's sfx catalog so a shot's \`sound.sfx\` has a file behind it.

Use for the cut effects a storyboard names in window.SFX (scenes-schema §sound effects): a whoosh on a whip transition, a low hit on the line before a drop, a tick or pop when a figure lands on a slide, a riser under a build, a 30-second room-tone loop for a bed. Write the prompt as a description in the vendor's own vocabulary (whoosh · impact · braam · riser · click · texture · ambience), one sound per call, with its shape spelled out ("short soft whoosh, fabric through air, no tail"); set durationSeconds for one-shots (a whoosh 0.6–1.0 s, a hit 1–2 s, a riser 2–4 s) and loop: true with 10–30 s for a bed. promptInfluence above the ${DEFAULT_ELEVENLABS_SFX_PROMPT_INFLUENCE} default reads the prompt more literally; below it, more freely. Save straight into the channel catalog — outputPath data/<channel>/assets/audio/sfx, filename <id>.wav — then register the row with resolve-asset.py --ensure and point its note at the .json sidecar this tool writes next to the file (tool, model, prompt, seconds, request id, date, rights). Generated once, an effect is a channel asset reused at $0 in every later episode.
Do NOT use for music or a melodic bed — that is music_generate_clip / suno_generate_sound. Do NOT use for a clip's own soundtrack — that is the model's native audio through visual.audio. Do NOT request a loop under 5 s (it seams audibly under narration). The endpoint has no WAV format of its own: the server asks for PCM and writes the RIFF header itself, so the file is a mono 16-bit WAV the builder reads directly; a 403 output_format_not_allowed means the plan lacks that rate — retry with pcm_24000. API pricing is per minute of generated audio, $${ELEVENLABS_SFX_USD_PER_MINUTE.toFixed(2)} on every plan (pricing/api, read 2026-09-16), so a one-second effect is about $0.002; the ledger key is sfx.elevenlabs with the measured seconds as the quantity. Free-tier output is non-commercial and needs attribution — check the plan before publishing.

Returns: a text block with the saved WAV path, the provenance sidecar path, the model, format, the measured duration, the USD estimate at the per-minute rate, and the request id.`,
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: `What the effect sounds like, as a description (max ${MAX_ELEVENLABS_SFX_TEXT_CHARS} characters) — the source, the surface, the shape and the tail: "short soft whoosh, fabric through air, no tail" · "low cinematic impact, single hit, short decay, no music" · "quiet office room tone, distant ventilation, no voices". One sound per call; the vendor's terms (whoosh, impact, braam, riser, click, ambience) land more reliably than metaphors.`,
          maxLength: MAX_ELEVENLABS_SFX_TEXT_CHARS,
        },
        durationSeconds: {
          type: 'number',
          description: `Length in seconds, ${ELEVENLABS_SFX_SECONDS.min}–${ELEVENLABS_SFX_SECONDS.max}. Omit and the vendor picks a length for the description. Set it for cut effects — a whoosh 0.6–1.0, a hit 1–2, a riser 2–4 — and for beds (10–30 with loop).`,
          minimum: ELEVENLABS_SFX_SECONDS.min,
          maximum: ELEVENLABS_SFX_SECONDS.max,
        },
        promptInfluence: {
          type: 'number',
          description: `How literally to follow the text, 0–1 (vendor default ${DEFAULT_ELEVENLABS_SFX_PROMPT_INFLUENCE}). Raise it toward 0.7–0.9 when the effect must be exactly the named sound; lower it for a texture where variation is welcome.`,
          minimum: 0,
          maximum: 1,
        },
        loop: {
          type: 'boolean',
          description: 'Make the effect loop seamlessly (default false). For room tone and ambience beds only, with durationSeconds 10–30; never for a one-shot.',
          default: false,
        },
        outputFormat: {
          type: 'string',
          description: `Vendor output format (default "${DEFAULT_ELEVENLABS_SFX_OUTPUT_FORMAT}" — mono 16-bit PCM at 48 kHz, wrapped as WAV here; the builder mixes at 48 kHz). pcm_44100 and pcm_24000 are the same wrapped as WAV at those rates — pcm_24000 is the fallback when the plan refuses the higher rate (403 output_format_not_allowed). mp3_44100_128 is a preview only; it never enters the build.`,
          enum: [...ELEVENLABS_SFX_OUTPUT_FORMATS],
          default: DEFAULT_ELEVENLABS_SFX_OUTPUT_FORMAT,
        },
        outputPath: {
          type: 'string',
          description: 'Directory for the audio file (default: the current working directory). For a channel asset: data/<channel>/assets/audio/sfx.',
        },
        filename: {
          type: 'string',
          description: 'Filename for the audio file (default: elevenlabs_sfx_<timestamp>.wav — .mp3 when outputFormat is mp3_*). For a channel asset use the catalog id: <id>.wav. The provenance sidecar is written as <name>.json next to it.',
        },
      },
      required: ['text'],
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
    name: 'project_manage',
    title: 'Set up a multi-episode project',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: `Create or update local project settings and episode directories.

Use for initial setup (프로젝트 초기 설정), saved genre/style/video ratio, SNS connection records, or a new episode inheriting project defaults. options and status are read-only. init creates missing channel folders, profile, catalog and local .gitignore entries; it preserves existing files and rejects changed preferences. update requires the revision from status and an explicit user request. episode creates a snapshot and directories, returning a new-board handoff; an existing snapshot or legacy board is preserved. All mutations are local, locked and make no network calls.
Do NOT use to verify credentials — use sns_account_check. Do NOT use to discover live media engines — use capability_status. Never pass token values, generate media, or publish as part of setup. Record connected only after an actual account check; enabled platforms may stay pending.
Returns JSON: status, missing fields, canonical paths, config and revision; episode returns snapshot and handoff (FORMAT/PRODUCTION/SNS). options returns the supported type, style, ratio and format catalog. Errors report invalid choices, path conflicts or stale revisions without changing existing settings. Settings live in WORKSPACE/.social-flow/models.json; snapshots in EPISODE/.work/model-settings.json.`,
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['options', 'status', 'init', 'update', 'episode'], description: 'Operation; e.g. status before init or update.' },
        workspace: { type: 'string', description: 'Explicit absolute existing project root, e.g. /workspace/videos. Required except for options; never infer the plugin install directory.' },
        request: { type: 'string', description: 'Actual user preference request for init/update, e.g. Use webtoon for future episodes. Not an invented approval.' },
        expectedRevision: { type: 'string', description: 'Revision returned by status, required for update; e.g. the exact SHA-256 string from the previous result.' },
        topic: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,63}$', description: 'Episode directory slug for episode, e.g. history-01.' },
        profileMarkdown: { type: 'string', description: 'Completed channel profile Markdown for a missing profile, e.g. ---\nslug: history\n... . Author from the channel template; an existing different profile is rejected.' },
        settings: {
          type: 'object', additionalProperties: false, description: 'Explicit selected defaults. init needs all fields (existing legacy selections may be reused); update replaces each supplied category except models, which replaces only supplied engines. Example shape is documented in project-init.',
          properties: {
            project: { type: 'object', additionalProperties: false, description: 'Project identity; e.g. History with channel history.', properties: {
              name: { type: 'string', description: 'Display name, e.g. History.' },
              channel: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,63}$', description: 'Primary channel slug, e.g. history; immutable after setup.' },
            }, required: ['name', 'channel'] },
            videoType: { type: 'object', additionalProperties: false, description: 'Saved genre from options, e.g. {id:documentary}.', properties: {
              id: { type: 'string', description: 'Type ID from options, e.g. drama or documentary.' },
              detail: { type: 'string', description: 'Required for custom, e.g. Documentary with acted historical scenes.' },
            }, required: ['id'] },
            models: { type: 'object', additionalProperties: false, description: 'Video, speech and image model selections; use capability_status and host schemas for actual availability.', properties: Object.fromEntries(['video', 'speech', 'image'].map(kind => [kind, {
              type: 'object', additionalProperties: false, description: `${kind} selection; fixed engines omit model, host uses host-managed.`,
              properties: {
                engine: { type: 'string', enum: kind === 'video' ? ['host', 'seedance', 'veo', 'astra', 'mlx'] : kind === 'speech' ? ['gemini', 'elevenlabs'] : ['host', 'gpt-image', 'zimage', 'mlx'], description: 'Selected engine, e.g. host for an exposed host media tool.' },
                model: { type: 'string', description: 'Supported model ID, e.g. host-managed. Omit for astra and zimage.' },
                ...(kind !== 'speech' ? { host: { type: 'string', description: 'Host CLI when engine is host, e.g. codex.' } } : {}),
                ...(kind === 'video' ? { resolution: { type: 'string', description: 'Supported source resolution, e.g. 720p.' } } : {}),
                ...(kind === 'image' ? { quality: { type: 'string', description: 'Supported quality, e.g. high; a prompt preference on host tools without a quality parameter.' } } : {}),
              }, required: ['engine'],
            }])) },
            style: { type: 'object', additionalProperties: false, description: 'Visual style, separate from genre and video ratio; e.g. preset:webtoon.', properties: {
              preset: { type: 'string', enum: ['cinematic-miniature', 'photoreal', 'webtoon', 'claymation', 'paper-cutout', 'ink-wash', 'toon-3d', 'arcade-2d'], description: 'Supported visual style from options, e.g. webtoon.' },
              ...Object.fromEntries(['reference', 'world', 'materials', 'palette', 'lighting', 'camera'].map(key => [key, { type: 'string', description: `Optional standing ${key} direction, e.g. consistent illustrated window light for lighting.` }])),
            }, required: ['preset'] },
            production: { type: 'object', additionalProperties: false, description: 'Default video ratio and format. A budget is a ceiling, not authorization to spend.', properties: {
              mode: { type: 'string', enum: ['full_video', 'video_80', 'video_50', 'video_30', 'video_lt10', 'no_video'], description: 'Six ratio bands: 100%, 80–<100%, 50–<80%, 30–<50%, <10%, 0%. Count shots, not seconds; use existing production rules for integer rounding.' },
              renderRatioVersion: { type: 'integer', enum: [1], description: 'Ratio contract version, always 1 for new settings.' },
              format: { type: 'string', enum: ['shorts-9x16', 'youtube-long-16x9'], description: 'Output format, e.g. shorts-9x16.' },
              previzRenderer: { type: 'string', enum: ['blender', 'threejs'], description: 'Optional saved previz choice; e.g. blender. Ask only when needed and missing.' },
              episodeBudgetUsd: { type: 'number', minimum: 0, description: 'Optional per-episode USD ceiling, e.g. 5. Does not replace an actual quote and spending authorization.' },
            }, required: ['mode', 'renderRatioVersion', 'format'] },
            sns: { type: 'object', additionalProperties: false, description: 'All four platform records, including disabled ones. Replacement updates must preserve unchanged platforms. Never pass credentials.', properties: Object.fromEntries(['threads', 'instagram', 'facebook', 'youtube'].map(platform => [platform, {
              type: 'object', additionalProperties: false, description: `${platform} publishing preference and historical account check.`,
              properties: {
                enabled: { type: 'boolean', description: 'Whether this project targets the platform, e.g. true.' },
                status: { type: 'string', enum: ['pending', 'connected', 'disabled'], description: 'pending until verified by sns_account_check; disabled requires enabled:false.' },
                accountId: { type: 'string', description: 'Verified platform account ID, e.g. UC... for YouTube; required for connected.' },
                handle: { type: 'string', description: 'Optional public handle, e.g. @history.' },
                checkedAt: { type: 'string', description: 'Actual account check ISO timestamp, e.g. 2026-10-16T03:00:00Z; required for connected.' },
                credentialRef: { type: 'string', description: 'External token reference, automatically filled when omitted; e.g. ${SNS_TOKEN_DIR}/history/threads_token. Never a token value.' },
              }, required: ['enabled', 'status'],
            }])), required: ['threads', 'instagram', 'facebook', 'youtube'] },
          },
        },
      }, required: ['action'],
    },
  },
  {
    name: 'capability_status',
    title: 'What this machine can do right now',
    annotations: HINT.local,
    description: `Report which generation and research capabilities are configured on this machine, grouped by capability with an "N of M configured" count per group, plus the env vars that would unlock the rest.

Use it BEFORE planning anything that spends money or depends on a provider — the top of a storyboard, produce, or autoproduce run. Without it, a missing key shows up only when the call fails, which is after the plan was built around a tool that was never going to run: planning two Veo b-roll slots on a machine with no GEMINI_API_KEY costs the review rounds before anyone finds out. Also use it when the user asks what they can make, or why a tool is failing.
Do NOT use it to test whether a key still works. It reports CONFIGURATION, not reachability — a revoked key reads as configured here and fails at the call. Local engines report only whether their binary resolves (mflux, python3, mlx-qwen3-asr) or whether MLX Core.app / mlx-serve is installed — not whether :11234 is up. Read-only; makes no API call, so one call per session is enough.

Returns: a capability menu — video_generation, image_generation, tts, music_generation, 3d_generation, speech_to_text, stock_footage, research — each listing its providers with the env var or local install each one needs, then the publishing platforms, the env vars grouped by what each would turn on.`,
    inputSchema: {
      type: 'object',
      properties: {
      },
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
    name: 'threads_draft_create',
    title: 'Create Threads growth draft',
    description: 'Store a Threads growth draft before review. Returns draftId and bodyHash (SHA-256 of NFC, LF, trimmed body + selfReply). Edits require a new draft and reviews. No public posting.',
    annotations: HINT.generate,
    inputSchema: { type: 'object', properties: {
      channel: SNS_CHANNEL_PROPERTY,
      body: { type: 'string', minLength: 1, description: 'Draft body.' }, selfReply: { type: 'string', minLength: 1, description: 'Optional information self-reply (voice review only).' },
      surface: { type: 'string', enum: ['post', 'reply'], description: 'post by default; reply requires replyToId and only voice review.' },
      replyToId: { type: 'string', description: 'Required reply target for a reply draft; bound to publication.' },
      readerMessage: { type: 'string', minLength: 1, description: 'One-sentence summary of the post.' },
      purpose: { type: 'string', enum: ['fun', 'moved', 'info', 'empathy'], description: 'Exactly one intended reader outcome.' },
      purposeEvidence: { type: 'string', minLength: 1, description: 'Verbatim body excerpt demonstrating the chosen purpose; whitespace-only normalization.' },
      flow: { type: 'object', description: 'Reader progression: hook, turn, residue.', properties: {
        hook: { type: 'string', minLength: 1, description: 'Why the opening holds attention.' },
        turn: { type: 'string', minLength: 1, description: 'What the middle reveals.' },
        residue: { type: 'string', minLength: 1, description: 'What the reader takes away.' },
      }, required: ['hook', 'turn', 'residue'] },
      comicElements: { description: 'Concrete comic elements in the draft.', type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
      submitter: { type: 'string', description: 'Submitting agent identifier (self-reported).' },
      submitterContext: { type: 'string', description: 'Submitting session/context identifier (self-reported).' },
    }, required: ['channel', 'body', 'readerMessage', 'comicElements', 'purpose', 'purposeEvidence', 'flow'] },
  },
  {
    name: 'threads_review_submit',
    title: 'Submit Threads draft review',
    description: 'Record a voice/purpose/flow review; score purpose only against the chosen draft purpose (fun, moved, info, empathy), never against another purpose. Bind the review to bodyHash. A required rubric item scoring zero must be submitted as a P0 finding to block publication; the server does not infer semantic failures from scores. Findings quote actual draft text; only whitespace differences are ignored. No LLM/API is called. Identifiers are self-reported: the server cannot distinguish subagents in the same session or enforce reviewer independence.',
    annotations: HINT.generate,
    inputSchema: { type: 'object', properties: {
      draftId: { description: 'Identifier returned by threads_draft_create.', type: 'string' }, bodyHash: { description: 'Exact reviewed draft hash.', type: 'string', pattern: '^[a-f0-9]{64}$' },
      axis: { description: 'Review axis.', type: 'string', enum: ['voice', 'purpose', 'flow'] }, score: { description: 'Score from 0 to 100.', type: 'number', minimum: 0, maximum: 100 },
      reasons: { description: 'Reasons supporting the score.', type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
      improvements: { description: 'Concrete improvements or next-post guidance.', type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
      reviewer: { description: 'Self-reported reviewer identifier.', type: 'string', minLength: 1 }, reviewerContext: { description: 'Self-reported session/context identifier.', type: 'string', minLength: 1 },
      findings: { description: 'Quoted evidence, including at least one pass finding for a clean review.', type: 'array', minItems: 1, items: { type: 'object', properties: {
        quote: { description: 'Exact draft excerpt; whitespace differences allowed.', type: 'string', minLength: 1 }, issue: { description: 'Observation supported by the quote.', type: 'string', minLength: 1 },
        severity: { description: 'pass for positive evidence; P0 blocks publishing.', type: 'string', enum: ['pass', 'P0', 'P1', 'P2'] },
      }, required: ['quote', 'issue', 'severity'] } },
    }, required: ['draftId', 'bodyHash', 'axis', 'score', 'reasons', 'improvements', 'reviewer', 'reviewerContext', 'findings'] },
  },
  {
    name: 'threads_publish',
    title: '⚠️ Threads publish (immediately public)',
    annotations: HINT.publish,
    outputSchema: publishOutput('postId', 'Threads post id — pass as replyToId to chain a follow-up reply'),
    description:
      `⚠️ Direct Threads publishing — posts to the Threads API with local tokens, **immediately public** (the posting account is auto-resolved from the token's /me). Exactly one of draftId (growth: hash-bound reviews, configured gate.json thresholds and style check) or episodeRef (existing episode and matching approval record) is required. dryRun checks without API calls. Call only right after the user has checked and approved the final copy and media (HITL — never call without approval). A post carries one of four shapes: a video (videoUrl), a single image (imageUrl), a link preview card (linkUrl), or text alone. The three media fields are mutually exclusive — one media_type per post. **Video episodes put the video on the post itself via videoUrl**, so it plays inline in the timeline with nothing to click away to; do not attach the video as a reply or fall back to a bare link (user directive 2026-08-19). Carousels are not supported by this tool. Publish quota: 250 per 24 hours. ${SNS_HITL_LINE}`,
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
            'One publicly reachable video URL (.mp4/.mov) carried by the post itself — mutually exclusive with imageUrl and linkUrl. **This is the default for video episodes.** Use the clean subtitle-free master, including speech videos. Do not select a burned-in copy; Threads has no separate subtitle input. Video containers transcode, and the tool waits up to 2 minutes for FINISHED',
        },
        linkUrl: {
          type: 'string',
          format: 'uri',
          description:
            'Link preview card URL attached to the post. Text posts only, so mutually exclusive with imageUrl and videoUrl; writing the same URL in the caption still counts as one link to the platform (cap 5). **Meta\'s own URLs (an IG reels permalink) come back 400** — put those in the body text instead',
        },
        replyToId: { type: 'string', description: 'Publish as a reply to this post id (own reply chain, or joining someone else\'s post)' },
        channel: SNS_CHANNEL_PROPERTY,
        draftId: { type: 'string', description: 'Reviewed growth draft identifier; exclusive with episodeRef.' },
        episodeRef: { type: 'string', description: 'Episode topic slug under data/<channel>/episodes; requires matching threads-publish-approval.json.' },
        selfReply: { type: 'string', description: 'Optional reviewed self-reply; posted after the root succeeds.' },
        dryRun: { type: 'boolean', description: 'Validate all gates without token access or network publishing.' },
      },
      required: ['caption', 'channel'],
      oneOf: [{ required: ['draftId'], not: { required: ['episodeRef'] } }, { required: ['episodeRef'], not: { required: ['draftId'] } }],
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
            'One public Reels video URL (.mp4/.mov) — cannot be used together with imageUrls. **Provide the clean subtitle-free master**, including speech videos. Do not burn captions into the picture or select a legacy video-sub file; Instagram has no separate subtitle input',
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
      `⚠️ Direct Facebook Page publishing — posts to the Graph API with the local Page token, **immediately public** (the posting Page is auto-resolved from the token's /me). There is no separate review gate, so call only right after the user has checked and approved the final copy and media (HITL — never call without approval). Forms: text / up to 10 images / one video (regular video — not Reels). Video posts may include a separate subtitle file (captionFilePath) only when requested — this pipeline uploads subtitles separately instead of burning them in, so give videoUrl the clean subtitle-free master, not a burned-in copy. The source link goes **without exception** in the first comment via facebook_comment right after a successful publish, not in the body (linkUrl). ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        caption: { type: 'string', description: 'Final post body, ≤5,000 chars' },
        imageUrls: {
          type: 'array',
          items: { type: 'string', format: 'uri' },
          description: 'Up to 10 publicly reachable image URLs — cannot be used together with videoUrl',
        },
        videoUrl: { type: 'string', format: 'uri', description: 'One public video URL (.mp4/.mov) — cannot be used together with imageUrls. Give the **clean master**, not a burned-in copy (only separately requested subtitles use captionFilePath)' },
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
      `⚠️ Direct YouTube publishing — uploads a **local video file, immediately public**, with the local OAuth refresh token (the target channel is the token-owning account). There is no separate review gate, so call only right after the user has checked and approved the final copy and video (HITL — never call without approval). Portrait 9:16 videos of 3 minutes or less are auto-classified as Shorts (no separate flag). The only platform that needs no public URL hosting (direct file upload — subtitle files included). **Every video stays subtitle-free.** Give videoFilePath the clean master. Only when the user requests separate YouTube subtitles, pass an .srt via captionFilePath or requested captionTracks; otherwise omit caption inputs. Uploads draw from the videos.insert-only "Video Uploads" quota bucket — 1 unit per call, 100/day by default, so there is no reason to ration episode publishing (the old "1,600 units = 6/day" limit disappeared in the 2026 quota overhaul). ${SNS_HITL_LINE}`,
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
            'Absolute path of an optional separate subtitle file (.srt) — **pass only when the user requests YouTube subtitles; otherwise omit it**. Uploading subtitles separately instead of burning them in means they can be swapped after publishing, viewers can toggle them, and they seed YouTube auto-translation. Give videoFilePath the clean subtitle-free master, not a burned-in copy. The upload needs the **youtube.force-ssl scope** (rejected on the publish-only youtube.upload) and costs a **quota of 400 units** per track — heavy next to the 1-unit video upload, so once per language per episode. If only the subtitles fail, captionWarning is returned and the publish stands (do not re-upload). Single-track shorthand — for two or more languages use captionTracks instead (mutually exclusive)',
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
            'Optional requested multi-language subtitle tracks — one captions.insert per entry, so viewers pick their language in the player and each track seeds auto-translation. Mutually exclusive with captionFilePath. Every file is validated before the video upload starts; each track costs 400 quota units, and a failed language comes back in captionWarning with the publish intact (upload just that language in YouTube Studio instead of re-publishing)',
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
      `⚠️ Replies to an inbound comment — posts an **immediately public** reply with local tokens (the author is the brand account itself). THREADS requires a reviewed surface=reply draftId with matching commentId, voice score and server style check, exactly as threads_publish; dryRun validates without posting. Publish only copy the user has approved (HITL — never call without approval). Use commentId straight from the sns_comment_inbox response. Per-platform contracts: THREADS — a new post carrying reply_to_id is the reply, so chains extend freely down to replies-to-replies / INSTAGRAM — replies attach to **top-level comments only** (to answer a sub-comment, pass its parent commentId — for comments carrying parentCommentId, use that value) / FACEBOOK — a comment on a comment id is the sub-comment / YOUTUBE — also top-level only, but a sub-comment id is accepted: this tool looks up the parent, reattaches at the thread root, and reports where it landed via parentCommentId in the response (needs the youtube.force-ssl scope). On failure, never blindly retry the same call (non-idempotent — duplicate replies). ${SNS_HITL_LINE}`,
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['THREADS', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE'], description: 'Target platform' },
        commentId: { type: 'string', description: 'commentId from sns_comment_inbox (IG must be a top-level comment id — YT also accepts a sub-comment id)' },
        message: { type: 'string', description: 'Final reply — THREADS ≤500 chars, IG ≤2,200, FB ≤8,000, YT ≤10,000' },
        channel: SNS_CHANNEL_PROPERTY,
        draftId: { type: 'string', description: 'Required for THREADS: reviewed reply draft bound to this commentId. Not accepted for other platforms.' },
        dryRun: { type: 'boolean', description: 'THREADS only: validate the reply gate without credential or API access.' },
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
    name: 'speech_manage',
    title: 'Find and revise shot dialogue and audio dependencies',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description: `Update shot dialogue, line acting and local audio/video bindings.

Use for dialogue edits, expression or intonation corrections, stable speaker routing and generation planning. list finds lines; prepare assigns stable ids; update replaces requested line fields; attach_audio returns measured timing; retime updates the complete shot clock from current speech and explicit action edits. attach_video binds generated files; reuse:tail_trim accepts only unchanged audio and performance starts with a shorter tail. plan_audio resolves the pinned voice and each line's scene direction into raw generator arguments; plan_video resolves the selected adapter's capabilities and carries the same acting/timing context. Scene direction overrides baseline style without changing voice identity. Local files only: plans do not generate, listen, score or approve. Read first and pass expectedRevision for writes; unknown speakers, ambiguous targets, stale revisions and unsupported lip-sync routes fail. Keeps source backups.

Do NOT use to generate media: call the planned raw TTS tool or selected video adapter, then attach the result. Do NOT use for read-only whole-story inspection: use storyboard_read instead. Never group different emotional beats or nonconsecutive shots by shared image and slice them into unrelated reactions.

Returns revision, ordered matching lines with generationPlan and voice/audio hashes, invalidated dependencies, audioPlans for plan_audio (generator, generation/arguments aliases, clean expectedText, language and speechRevision), or a video plan with videoPrompt and textPolicy:no_visible_text; performance.text preserves exact speech for verification, never copy it into the visual prompt. Direction warnings disclose unsupported engine controls; generated audio remains not_reviewed. Acting lead-in/tail-out use seconds. Plans and metadata cannot establish audible or visible quality.`,
    inputSchema: {
      type: 'object', properties: {
        path: { type: 'string', description: 'Storyboard directory or scenes.js' },
        action: { type: 'string', description: 'Local operation: list, prepare ids, update a line, attach generated audio/video, plan raw speech arguments, or plan the selected video adapter', enum: ['prepare','list','update','attach_audio','plan_audio','plan_video','attach_video','retime'] },
        shotId: { type: 'string', description: 'Stable shot id, not its display number' }, lineId: { type: 'string', description: 'Stable dialogue id; required for line writes' }, speaker: { type: 'string', description: 'Filter by character id or exact display name' }, query: { type: 'string', description: 'Exact substring of spoken or subtitle text to find' },
        expectedRevision: { type: 'string', description: 'Current revision from list; required for writes' },
        patch: { type: 'object', description: 'Only the requested line fields to replace; speaker uses its stable id', properties: {
          tts: { type: 'string', description: 'Spoken text with intended pronunciation' }, sub: { type: 'string', description: 'Subtitle display text' }, speaker: { type: 'string', description: 'Stable character id' }, delivery: { type: 'string', description: 'Narration, visible speech, or speech outside frame', enum: ['voiceover','on_screen','off_screen'] },
          acting: { type: ['object', 'null'], description: 'Replace this line\'s entire acting object; null clears it. Does not change the character voice. Omitted fields use no scene override or zero reaction time.', additionalProperties: false, properties: {
            ...ACTING_PROPERTY.properties,
            context: { type: 'string', minLength: 1, maxLength: 1000, description: 'Immediate situation, e.g. The applicant mistook a sales result for a job offer.' },
            intent: { type: 'string', minLength: 1, maxLength: 1000, description: 'What the speaker wants, e.g. Find out what he thinks he passed.' },
            emotion: { type: 'string', minLength: 1, maxLength: 1000, description: 'Current emotion/change, e.g. Confusion after celebration.' },
            vocal: { type: 'string', minLength: 1, maxLength: 1000, description: 'Audible delivery, e.g. Quiet question, stress passed, no cheering.' },
            visual: { type: 'string', minLength: 1, maxLength: 1000, description: 'Visible action and state, e.g. Lower hands, smile fades, look at applicant.' },
            leadInSeconds: { type: 'number', minimum: 0, maximum: 5, description: 'Reaction time before this line in seconds, e.g. 0.25; default zero.' },
            tailOutSeconds: { type: 'number', minimum: 0, maximum: 5, description: 'Reaction time after this line in seconds, e.g. 0.4; default zero.' }
          } }
        }, additionalProperties: false },
        timingPatch: { type: 'object', description: 'Only for retime. Preserve standalone actions unless explicitly edited; provider padding never becomes an action.', additionalProperties: false, properties: {
          speechBoundActions: { type: 'boolean', description: 'Explicitly remove inherited durations on withGroup actions so they follow measured speech' },
          actions: { type: 'array', description: 'Explicit [zero-based performance index, positive seconds] edits for actions', items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } } }
        } },
        reuse: { type: 'string', enum: ['tail_trim'], description: 'Only attach_video: preserve existing generated bytes for a verified temporal prefix; rejects changed audio, moved speech, changed action semantics or extension. Does not certify visual quality.' },
        audioPath: { type: 'string', description: 'Generated audio file; absolute or relative to storyboard directory' }, videoPath: { type: 'string', description: 'New video file to bind to the shot and current audio' },
        generation: { type: 'object', description: 'Raw TTS request and declared text language; no listening score', properties: { generator: { type: 'string', description: 'Raw TTS tool that generated this file' }, voiceSettings: { type: 'object', description: 'Exact voice and language settings sent to the generator' }, text: { type: 'string', description: 'Exact clean line text; voiceSettings stores the actual tagged provider request from plan_audio' }, language: { type: 'string', description: 'Declared text language, e.g. ko; metadata for engines without a language argument, never an invented API parameter' } }, required: ['generator','voiceSettings','text'], additionalProperties: false },
        capabilities: { type: 'object', description: 'Selected adapter capabilities from verified schema/documentation, with evidence', properties: { provider: { type: 'string', description: 'Selected video adapter provider id, matching the shot engine' }, model: { type: 'string', description: 'Selected model id, matching the shot model when set' }, audioConditioning: { type: 'boolean', description: 'Whether the adapter accepts supplied speech as conditioning' }, lipSync: { type: 'boolean', description: 'Whether supplied speech drives visible mouth motion' }, postLipSync: { type: 'boolean', description: 'Whether a separately selected post lip-sync adapter is available' }, evidence: { type: 'string', description: 'Documentation or verified capability record supporting these settings' } }, required: ['provider','model','audioConditioning','lipSync','postLipSync','evidence'], additionalProperties: false }
      }, required: ['path','action'], additionalProperties: false
    }
  },
  {
    name: 'acting_review',
    title: 'Review requested acting against actual audio and video',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    description: `Review actual acting only for an explicitly requested paid evaluation.

Use when the user asks to listen/watch, adversarially evaluate, or improve expression, intonation and acting against a scene direction. Sends the supplied local media to Gemini and writes an immutable local receipt beside it. This is an optional paid external call under existing authorization, never a default produce/autoproduce gate. Supports media up to 12 MiB and 120 seconds; audiovisual/video modes require MP4, audio supports WAV, MP3, FLAC or M4A. Same media/direction/request reuses its receipt, including failures, rather than rerolling a score.

Do NOT use for free provenance or generation planning: use speech_manage instead. Do NOT use metadata or still frames as proof that speech or continuous acting works.

User preference decides voice casting; perceived age and naturalness are subjective. Never reject or regenerate a preferred take to satisfy this review. Returns advisoryOnly=true, selectionAuthority=user, interpretation, status pass/fail/unverified, nullable score, failures, review with situation/expression/body/vocalEmotion/speechAccuracy/lipSync evidence, media/direction hashes, usage, receiptPath and reused. success requires verified score >=95 on all required axes, confidence >=0.9, complete required track coverage and no findings. Unobserved axes are null; audio-only review cannot certify visual acting.`,
    inputSchema: {
      type: 'object', additionalProperties: false, properties: {
        mediaPath: { type: 'string', minLength: 1, description: 'Local clip/audio file, e.g. /Volumes/data/story/meleon/test/shot-21.mp4.' },
        expectedText: { type: 'string', maxLength: 8000, default: '', description: 'Exact intended spoken words, e.g. What did you pass? Empty for silent media.' },
        direction: { type: 'string', minLength: 20, maxLength: 12000, description: 'Scene situation, intent, emotion, audible delivery, visible actions and timing, e.g. Celebration ends; lower hands and quietly ask the applicant what he passed.' },
        mode: { type: 'string', enum: ['audiovisual', 'audio', 'video'], default: 'audiovisual', description: 'Tracks to inspect; audiovisual requests both sound and picture.' },
        requestedBy: { type: 'string', minLength: 1, maxLength: 200, description: 'Source of explicit user review request, e.g. User request in this session.' },
        reason: { type: 'string', minLength: 10, maxLength: 1000, description: 'Requested evaluation purpose, e.g. Verify the confused reaction after revising the sales tone.' }
      }, required: ['mediaPath', 'direction', 'requestedBy', 'reason']
    }
  },
  {
    name: 'storyboard_read',
    title: 'Read a storyboard as sequences → scenes → shots',
    annotations: HINT.local,
    description: `Read an episode's scenes.js and return it as a tree: sequences (purpose · question · payoff) → scenes (place · time · event · charge · turn · out) → shots (stable id · ordered actions and attributed speech · feel · info · render · character/location/prop references · media plan). Reads the file only; no API call.

Use it before editing an existing board, and after storyboard_apply to see the board the way the approval page groups it. level=outline is enough to plan a change; level=full carries every raw shot object (large — one shot is ~40 fields).
Do NOT use it to validate — storyboard_check runs the contract. A board with no window.STRUCTURE comes back with every shot under unplacedShots; write the structure with storyboard_apply.

For inspection, the default includeContext:true adds reviewContext.story (STORY), production (PRODUCTION) and document (SB_DOC: characters, props, setting and recorded reviews). shotId adds selectedShot with the raw shot, scene and previous/next shot IDs while preserving the whole flow. Referenced asset paths are authored locators, not proof the files exist or have been viewed. inspection.mediaViewed is always false; evidenceStatus is not_verified. Read assets and run their contract checks before declaring continuity or a current review pass.

Returns: JSON — { file, mediaBaseDirectory, sha256, version, format, shots, sequences[…scenes[…shots]], unplacedShots, splicedShots (broll · outro), playback (actual insertion order), unscheduledShots, propSheet?, inspection, reviewContext?, selectedShot? }.`,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The storyboard directory (data/<channel>/episodes/<topic>/storyboard/) or its scenes.js' },
        level: { type: 'string', enum: ['outline', 'scenes', 'shots', 'full'], description: 'outline = sequences with scene numbers · scenes = scene cards with shot numbers · shots (default) = every shot summarised under its scene · full = raw shot objects too' },
        shotId: { type: 'string', description: 'Stable shot ID; adds raw selectedShot with scene and neighboring IDs without removing the overall flow. Unknown or duplicate IDs fail.' },
        includeContext: { type: 'boolean', description: 'Default true: return STORY, PRODUCTION and SB_DOC for character, background, prop and scenario inspection. Recorded evidence is not verified by this read.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'storyboard_apply',
    title: 'Write or patch a storyboard with validation',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description: `Write a storyboard's scenes.js from a sequence → scene → shot model, or patch part of it, in one call. Every shot is validated against the grammar vocabularies (type · beat · size · angle · infoType · shareType · render.mode · transition), the structure against its rules (one place and time per scene, a charge that turns, every scene in exactly one sequence, shots grouped by scene in sequence order, two sizes per scene), and the derived shot labels (sceneSlug · sequence) are written from the structure. Nothing is written when a violation is found — the findings come back instead. Warnings are written and reported.

Use it to author a new board (set = { structure, shots }) after the narration is approved (storyboard §4), and to change one thing later (scenes / sequences by key, shots by id — shotsById · insertShots.afterId · removeShotIds — or by position, globals for FORMAT · THEME · COMPREHENSION · STORY · PRODUCTION · MUSIC · SFX). Address shots by id once the board has them (every board written by this tool does): a review note names s0007, and positions shift with every insert; a patch mixes id and position addressing at its own peril — it is refused. Use transitions to change only the effect before selected shots without replacing their narration or visuals. dip fades out to black and fades the next scene in; prefer it for changes of place or time unless a specific cut calls for another effect. One call carries the whole change — do not write scenes.js by hand and do not call this once per shot. dryRun:true validates without writing.
storyboard_apply assigns stable shot ids (s0001…) and advances STRUCTURE.nextShotId; preserve those ids and do not edit them by hand.
Shot creation, upserts and inserts expose type, shot.render.mode, shot.videoDesign, visual.camera and the three plan records shot.eyeline · shot.composition · shot.depth in the input schema. shot.depth (L11): count what the viewer must read in the frame at once — one thing → shallow with focus (a person's eyes), two or more → deep with the planes listed front to back; a departure needs a reason, and a still_camera focus-in/rack-focus cut cannot be deep. For a drone shot choose preset:"drone-flythrough", variant:"cinematic" or "fpv", and the trajectory. The preset does not change the episode style or select a paid model.
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
            shots: { type: 'array', items: storyboardShotInput, description: 'Every shot in playback order — the scenes-schema.md shot object; each playback shot carries `scene`' },
          },
          required: ['shots'],
        },
        structure: { type: 'object', description: 'Replace window.STRUCTURE only' },
        sequences: { type: 'array', items: { type: 'object', description: '{ id, title, purpose, question?, payoff?, scenes }' }, description: 'Upsert sequences by id' },
        scenes: { type: 'array', items: { type: 'object', description: '{ no, place, time, event, charge, turn, out? }' }, description: 'Upsert scenes by no' },
        shots: { type: 'array', items: { type: 'object', description: 'One positional upsert', properties: { no: { type: 'number', description: '1-based position' }, shot: storyboardShotInput }, required: ['no', 'shot'] }, description: 'Upsert shots by 1-based position; no = length + 1 appends. Not with the id fields in the same patch' },
        shotsById: { type: 'array', items: { type: 'object', description: 'One upsert by id', properties: { id: { type: 'string', pattern: '^s\\d{4,}$', description: 'The stable shot id (s0007) to replace' }, shot: storyboardShotInput }, required: ['id', 'shot'] }, description: 'Replace shots by their stable id — the shot keeps that id, an unknown id writes nothing. Preferred over shots once the board has ids: positions shift with every insert, ids do not' },
        insertShots: { type: 'array', items: { type: 'object', description: 'One insert', properties: { after: { type: 'number', description: '1-based position to insert after; 0 = at the start' }, afterId: { type: 'string', pattern: '^s\\d{4,}$', description: 'The shot id to insert after — instead of after' }, shots: { type: 'array', items: storyboardShotInput, description: 'Shots to insert, in order' } }, required: ['shots'] }, description: 'Insert shots after a 1-based position (0 = at the start) or after the shot with afterId — exactly one of the two per entry' },
        transitions: {
          type: 'array', minItems: 1,
          description: 'Patch incoming transitions only, by final shot position after inserts/removals. Prefer dip for a gradual fade through black when place or time changes. Same-scene shots keep their chosen join. Example: [{no:3,transition:"dip",reason:"The next scene begins at night"}].',
          items: { type: 'object', additionalProperties: false, properties: {
            no: { type: 'integer', minimum: 1, description: 'Incoming shot, 1-based' },
            transition: { type: 'string', enum: ['cut','dip','dip:white','jcut','dissolve','iris','blur','zoom','push:l2r','push:r2l','push:u2d','push:d2u','whip:l2r','whip:r2l','whip:u2d','whip:d2u'], description: 'dip = previous picture fades to black, then this picture fades in (up to 0.30s each). dissolve blends pictures without black. jcut leads with sound, then cuts.' },
            transitionSeconds: { type: 'number', minimum: 0.08, maximum: 0.8, description: 'Moving joins only; omit for cut, dip and dip:white' },
            reason: { type: 'string', minLength: 1, description: 'Why this boundary uses this effect' },
            continuity: { type: 'string', minLength: 1, description: 'What connects the two pictures' },
          }, required: ['no', 'transition', 'reason'] },
        },
        removeShots: { type: 'array', items: { type: 'number', description: '1-based position' }, description: '1-based positions to drop (resolved before inserts)' },
        removeShotIds: { type: 'array', items: { type: 'string', pattern: '^s\\d{4,}$', description: 'A stable shot id' }, description: 'Shot ids to drop (resolved before inserts). Not with the position fields in the same patch' },
        removeScenes: { type: 'array', items: { type: 'number', description: 'Scene number' }, description: 'Scene numbers to drop from STRUCTURE.scenes and from every sequence' },
        removeSequences: { type: 'array', items: { type: 'string', description: 'Sequence id' }, description: 'Sequence ids to drop' },
        globals: { type: 'object', description: 'Other window.* blocks to set — FORMAT, THEME, COMPREHENSION, STORY, PRODUCTION, MUSIC, SFX, VOICE, MOTION_POLICY. MUSIC.$mix is optional sound-design metadata; SFX keeps logical asset ids only. PRODUCTION.mode: full_video, video_80, video_50, video_30, video_lt10, no_video (hook_only/stills_only/hybrid are legacy). New selections write renderRatioVersion:1.' },
        expectedSha256: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Current scenes.js hash from storyboard_read; required when editing propSheet on an existing board.' },
        propSheet: { type: 'object', additionalProperties: false, required: ['props'], description: 'Replace the complete prop sheet atomically. Keep other editorial metadata. Changes validate story-time custody and invalidate approval; original file is backed up.', properties: {
          props: { type: 'array', description: 'Complete prop registry for this board', items: { type: 'object', additionalProperties: true, required: ['id'], properties: {
            id: { type: 'string', description: 'Stable prop identity' }, name: { type: 'string', description: 'Display name' }, description: { type: 'string', description: 'Stable appearance, material and identifying features' },
            tracking: { type: 'string', description: 'Appearance alone or time-dependent continuity', enum: ['appearance', 'continuity'] }, appearanceVersion: { type: 'string', description: 'Pinned reference appearance revision' },
            references: { type: 'array', description: 'Versioned appearance images, optionally specific to a condition', items: { type: 'object', required: ['path','version'], properties: { path: {type:'string',description:'Storyboard-relative image path'}, version: {type:'string',description:'Reference image version'}, condition: {type:'string',description:'State condition this reference depicts'} } } },
          } } },
          continuity: { type: 'object', description: 'Initial states and ordered story events; omitted for appearance-only registries', required: ['version','timelineId','initial','events'], additionalProperties: true, properties: {
            version: { type: 'integer', enum: [1], description: 'Contract version 1' }, timelineId: { type: 'string', description: 'Stable story timeline identity, independent of playback order' },
            initial: { type: 'array', items: { type: 'object' }, description: 'Each: {propId,at:{day,order},state:{ownerId,holderId,location,condition}}. owner/holder is a registered character id, null (none) or unknown.' },
            events: { type: 'array', items: { type: 'object' }, description: 'Each: {id,propId,kind,at:{day,order},from,to,reason,recordedAt,recordedBy,shotIds?}. Kinds transfer/lend/return/pick_up/put_down/lose/damage/repair/move/correct. from asserts every changed field. Story time is independent of shot order.' },
          } },
        } },
        dryRun: { type: 'boolean', description: 'Validate and report, write nothing' },
        draft: { type: 'boolean', description: 'The story pass (storyboard §4a): camera-continuity records — shot.lineCrossing, shot.coverage — are deferred (later), not violations; leave it off in §4b' },
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
  {
    name: 'scenario_check',
    title: 'Check scenario candidates against their contract',
    annotations: HINT.local,
    description: `Check local scenario candidates or a selected story plan.

Use it after drafting candidates/d1–d3.md before selection, and on scenario.md before board authoring. Reads local files and runs a local script; no writes or API calls. Legacy scenarios use S1–S12. scenario-v2 reads cast.json and character identity paths, validates actions and attributed speech, and requires research references only for factual assertions; fiction has no search quota.
Do NOT use for shot/camera validation — use storyboard_check. A pass verifies structure and references, not factual truth, character motivation, entertainment value or user approval.

Returns: JSON — { files, violations, warnings, findings: [{ level, where, what }] }, in candidate file order. Findings start with S1–S12 or V2; violations block authoring, warnings do not.`,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Local candidate directory or selected page, e.g. data/my-channel/episodes/my-topic/storyboard/candidates or data/my-channel/episodes/my-topic/storyboard/scenario.md' },
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
// New generations can state the coverage needed; exact legacy requests keep their schema.
for (const tool of TOOLS) {
  if (!(DURATION_TOOLS as readonly string[]).includes(tool.name)) continue;
  tool.inputSchema.properties = { ...tool.inputSchema.properties, requiredSeconds: {
    type: 'number', exclusiveMinimum: 0,
    description: 'Required source coverage in seconds, e.g. 3.2. Include the measured shot body, source trim and outgoing transition handle. Selects the shortest supported duration without changing model/resolution. Mutually exclusive with durationSeconds, numFrames, frames, autoDuration and audioMaxDuration. Use for new shots; exact legacy requests may retain their explicit length. Over-limit shots must be split; never truncated.',
  } };
  if (tool.name === 'seedance_text2video' || tool.name === 'seedance_img2video') tool.inputSchema.properties.frames = {
    type: 'integer', minimum: 29, maximum: 289, description: 'Exact output frames, 1 mod 4 at 24 fps. Only Seedance 1.0 Pro/Fast. Mutually exclusive with durationSeconds and requiredSeconds. Use requiredSeconds to round upward automatically.',
  };
  tool.description += '\nFor shot-length optimization, pass requiredSeconds (e.g. 3.2) instead of a fixed duration/frame count. Returns the required/requested/excess seconds as a duration plan; these are not measured output seconds. Do NOT use this option for extending, editing or retaking existing footage.';
}

export const SNS_PLATFORM_BY_TOOL: Record<string, 'THREADS' | 'INSTAGRAM' | 'FACEBOOK' | 'YOUTUBE'> = {
  threads_publish: 'THREADS',
  threads_draft_create: 'THREADS',
  threads_review_submit: 'THREADS',
  threads_insights: 'THREADS',
  threads_search: 'THREADS',
  instagram_publish: 'INSTAGRAM',
  instagram_insights: 'INSTAGRAM',
  facebook_publish: 'FACEBOOK',
  facebook_comment: 'FACEBOOK',
  youtube_publish: 'YOUTUBE',
  youtube_insights: 'YOUTUBE',
};
