/**
 * ElevenLabs REST speech adapter. Speech generation is eleven_v4 only and uses
 * POST /v1/text-to-dialogue, including a single voice. Directions belong in the
 * text as audio tags; v4 supports stability and similarity, not style/speed/SSML.
 * Contract checked against the official OpenAPI and /v1/models on 2026-10-17.
 * Audio output_format is a query parameter. Timestamp sidecars preserve both
 * alignments and voice_segments verbatim. No legacy-model fallback is allowed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { elevenLabsBaseUrl, requireElevenLabsKey } from './config.js';
import { bareFilenameSchema, pcmToWav, saveAudioFile } from './media-utils.js';

// ── Constants (source of truth for the tool schemas) ─────────────

/** Only the quality-oriented v4 model is enabled; Turbo and legacy models are rejected. */
export const ELEVENLABS_MODELS = ['eleven_v4'] as const;
export type ElevenLabsModel = (typeof ELEVENLABS_MODELS)[number];
export const DEFAULT_ELEVENLABS_MODEL: ElevenLabsModel = 'eleven_v4';
export const ELEVENLABS_DIALOGUE_MODEL = DEFAULT_ELEVENLABS_MODEL;

/** GET /v1/models reports 10,000 characters for subscribed v4 requests. */
export const ELEVENLABS_MODEL_CHAR_CAPS: Record<ElevenLabsModel, number> = { eleven_v4: 10_000 };
export const MAX_ELEVENLABS_INPUT_CHARS = ELEVENLABS_MODEL_CHAR_CAPS.eleven_v4;
export const MAX_ELEVENLABS_DIALOGUE_CHARS = MAX_ELEVENLABS_INPUT_CHARS;
/** Dialogue documentation recommends this size even though the model allows 10,000. */
export const RECOMMENDED_ELEVENLABS_DIALOGUE_CHARS = 2_000;
/** The REST endpoint permits 10 unique voices; the 50-turn bound is local. */
export const ELEVENLABS_DIALOGUE_MAX_VOICES = 10;
export const ELEVENLABS_DIALOGUE_MAX_INPUTS = 50;

/**
 * Output formats exposed here — the production-relevant subset of the vendor's 29.
 *
 * Not exposed: pcm_* (container-less; wav_* is the same bytes with a header and the
 * builder needs the header), opus/m4a/ulaw/alaw (no place in the video pipeline;
 * opus is Ogg-wrapped, m4a is audio/mp4). wav_44100 stays in the list because a Pro
 * account has it and it matches Supertonic's 44.1kHz — below Pro it is a 403 before
 * any credit is spent.
 */
export const ELEVENLABS_OUTPUT_FORMATS = [
  'wav_16000',
  'wav_22050',
  'wav_24000',
  'wav_44100',
  'wav_48000',
  'mp3_44100_64',
  'mp3_44100_128',
  'mp3_44100_192',
] as const;
export type ElevenLabsOutputFormat = (typeof ELEVENLABS_OUTPUT_FORMATS)[number];

/** Same spec as the Gemini lane (mono 24kHz 16-bit WAV) — the builder takes either without resampling. */
export const DEFAULT_ELEVENLABS_OUTPUT_FORMAT: ElevenLabsOutputFormat = 'wav_24000';

/** Pro tier and above (measured 403 `output_format_not_allowed` below that). mp3_44100_192 is Creator and above per the docs. */
export const ELEVENLABS_PRO_ONLY_FORMATS: readonly ElevenLabsOutputFormat[] = ['wav_44100'];

export const ELEVENLABS_TEXT_NORMALIZATION = ['auto', 'on', 'off'] as const;

/** GET /v2/voices `category` values. */
export const ELEVENLABS_VOICE_CATEGORIES = ['premade', 'cloned', 'generated', 'professional'] as const;

/** Concurrency limit per plan (docs /models; flash doubles it) — quoted in the 429 hint so the caller knows what to do. */
const CONCURRENCY_HINT = 'check the concurrency allowance for the account plan';

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;

// ── Request schemas ──────────────────────────────────────────────

/**
 * voice_id goes into the URL path, so it is validated as an identifier — not a path.
 * Real IDs are 20 alphanumerics; the bound is loose on purpose (cloned/library IDs
 * may differ) but still rejects anything that could escape the path segment.
 */
const voiceIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'voiceId must be an ElevenLabs voice_id (letters, digits, _ or -)');

const modelSchema = z.enum(ELEVENLABS_MODELS).optional().default(DEFAULT_ELEVENLABS_MODEL);
const outputFormatSchema = z.enum(ELEVENLABS_OUTPUT_FORMATS).optional().default(DEFAULT_ELEVENLABS_OUTPUT_FORMAT);
/** Model docs also list ISO 639-3 exceptions without a two-letter code. */
export const ELEVENLABS_LANGUAGE_CODE_PATTERN = '^(?:[a-z]{2}|ast|yue|ceb|fil)$';
const languageCodeSchema = z.string().regex(new RegExp(ELEVENLABS_LANGUAGE_CODE_PATTERN), 'languageCode must be a 2-letter code (e.g. "ko") or ast, yue, ceb, fil').optional();
const seedSchema = z.number().int().min(0).max(4_294_967_295).optional();
const normalizationSchema = z.enum(ELEVENLABS_TEXT_NORMALIZATION).optional();

/** v4 dialogue settings. The legacy similarityBoost name is an explicit alias. */
const voiceSettingsFields = {
  stability: z.number().min(0).max(1).optional(),
  similarity: z.number().min(0).max(1).optional(),
  similarityBoost: z.number().min(0).max(1).optional(),
  // Persisted profiles may carry speed:1. It is a no-op and is never sent.
  speed: z.literal(1, { errorMap: () => ({ message: 'eleven_v4 has no speed control; omit speed or use the legacy neutral value 1' }) }).optional(),
};
const continuityFields = {
  previousText: z.string().max(100).optional(),
  nextText: z.string().max(100).optional(),
  previousRequestIds: z.array(z.string().trim().min(1)).min(1).max(3).optional(),
  nextRequestIds: z.array(z.string().trim().min(1)).min(1).max(3).optional(),
  pronunciationDictionaryLocators: z.array(z.object({
    pronunciationDictionaryId: z.string().trim().min(1), versionId: z.string().trim().min(1),
  }).strict()).min(1).max(3).optional(),
};

const requestOptions = {
  usePvcAsIvc: z.boolean().optional(),
  enableLogging: z.boolean().optional(),
};

function checkRequestLogging(value: {
  enableLogging?: boolean; previousRequestIds?: string[]; nextRequestIds?: string[];
}, ctx: z.RefinementCtx): void {
  if (value.enableLogging === false && (value.previousRequestIds?.length || value.nextRequestIds?.length)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['enableLogging'], message: 'Zero retention disables request stitching; omit request IDs or enable logging' });
  }
}

function checkV4Settings(value: { similarity?: number; similarityBoost?: number }, ctx: z.RefinementCtx): void {
  if (value.similarity !== undefined && value.similarityBoost !== undefined && value.similarity !== value.similarityBoost) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['similarityBoost'], message: 'similarityBoost is a legacy alias of similarity; supply only one value or matching values' });
  }
}

function checkV4Text(text: string, ctx: z.RefinementCtx, field: (string | number)[]): void {
  if (/<\/?(?:speak|break|phoneme|prosody|emphasis|say-as|sub|voice)(?:\s|[/>])/i.test(text)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: field, message: 'eleven_v4 does not support SSML; use [audio tags], punctuation or pronunciation dictionaries' });
  }
}

const outputFields = {
  outputFormat: outputFormatSchema,
  timestamps: z.boolean().optional().default(false),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('audio').optional(),
};

/** wav_* → .wav, mp3_* → .mp3. The extension is the builder's format hint, so it must tell the truth. */
export function extensionForFormat(format: ElevenLabsOutputFormat): '.wav' | '.mp3' {
  return format.startsWith('wav_') ? '.wav' : '.mp3';
}

/** Sample rate encoded in the format name (wav_24000 → 24000, mp3_44100_128 → 44100). */
export function sampleRateForFormat(format: ElevenLabsOutputFormat): number {
  return parseInt(format.split('_')[1], 10);
}

function checkFilenameMatchesFormat(
  value: { filename?: string; outputFormat: ElevenLabsOutputFormat },
  ctx: z.RefinementCtx,
): void {
  if (!value.filename) return;
  const expected = extensionForFormat(value.outputFormat);
  if (path.extname(value.filename).toLowerCase() !== expected) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['filename'],
      message: `filename extension must be ${expected} for outputFormat ${value.outputFormat} — a mislabeled audio file is read as the wrong format downstream`,
    });
  }
}

export const elevenLabsGenerateSchema = z
  .object({
    text: z
      .string()
      .min(1, 'Text is required')
      .max(MAX_ELEVENLABS_INPUT_CHARS, `Text exceeds ${MAX_ELEVENLABS_INPUT_CHARS} characters; split the script by scene`),
    voiceId: voiceIdSchema,
    model: modelSchema,
    languageCode: languageCodeSchema,
    ...voiceSettingsFields,
    seed: seedSchema,
    ...continuityFields,
    ...requestOptions,
    applyTextNormalization: normalizationSchema,
    ...outputFields,
  })
  .strict()
  .superRefine((value, ctx) => {
    checkV4Settings(value, ctx);
    checkRequestLogging(value, ctx);
    checkV4Text(value.text, ctx, ['text']);
    checkFilenameMatchesFormat(value, ctx);
  });

const dialogueInputSchema = z.object({
  text: z.string().min(1, 'Line text is required'),
  voiceId: voiceIdSchema,
}).strict();

export const elevenLabsDialogueSchema = z
  .object({
    inputs: z
      .array(dialogueInputSchema)
      .min(1, 'At least one line is required')
      .max(ELEVENLABS_DIALOGUE_MAX_INPUTS, `At most ${ELEVENLABS_DIALOGUE_MAX_INPUTS} lines per request — split the scene`),
    model: modelSchema,
    ...voiceSettingsFields,
    ...continuityFields,
    ...requestOptions,
    seed: seedSchema,
    languageCode: languageCodeSchema,
    applyTextNormalization: normalizationSchema,
    ...outputFields,
  })
  .strict()
  .superRefine((value, ctx) => {
    checkV4Settings(value, ctx);
    checkRequestLogging(value, ctx);
    for (const [index, line] of value.inputs.entries()) checkV4Text(line.text, ctx, ['inputs', index, 'text']);
    const total = value.inputs.reduce((sum, line) => sum + line.text.length, 0);
    if (total > MAX_ELEVENLABS_DIALOGUE_CHARS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inputs'],
        message: `Dialogue totals ${total} characters; ${ELEVENLABS_DIALOGUE_MODEL} takes at most ${MAX_ELEVENLABS_DIALOGUE_CHARS} per request — split by scene`,
      });
    }
    const voices = new Set(value.inputs.map((line) => line.voiceId));
    if (voices.size > ELEVENLABS_DIALOGUE_MAX_VOICES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inputs'],
        message: `${voices.size} distinct voices; this plugin accepts at most ${ELEVENLABS_DIALOGUE_MAX_VOICES} per request`,
      });
    }
    checkFilenameMatchesFormat(value, ctx);
  });

export const elevenLabsVoicesSchema = z.object({
  search: z.string().min(1).optional(),
  nextPageToken: z.string().min(1).optional(),
  languages: z.array(z.string().regex(/^[a-z]{2,3}$/)).min(1).max(20).optional(),
  gender: z.string().trim().min(1).optional(),
  accent: z.string().trim().min(1).optional(),
  category: z.enum(ELEVENLABS_VOICE_CATEGORIES).optional(),
  /** Named `limit` like every other paged tool here (server-wide contract); maps to the vendor's page_size. */
  limit: z.number().int().min(1).max(100).optional().default(30),
});

// ── Sound effects (text → SFX) ───────────────────────────────────
//
// POST /v1/sound-generation (docs api-reference/text-to-sound-effects/convert, read
// 2026-09-16). One model, `eleven_text_to_sound_v2`; `duration_seconds` 0.5–30 or the vendor
// picks; `prompt_influence` 0–1 (vendor default 0.3); `loop` for beds. The endpoint's
// output_format enum has no wav_* entry — only mp3/pcm/opus — so this lane asks for PCM and
// wraps it in a RIFF header itself (pcmToWav), which is what build-reel.sh and the channel
// catalog (`assets/audio/sfx/<id>.wav`) expect. API pricing is per minute of generated audio,
// $0.12 on every plan (pricing/api, read 2026-09-16) — $0.002 a second, so a 1-second whoosh is
// a fifth of a cent. Free-tier output is non-commercial and needs attribution.

export const ELEVENLABS_SFX_MODEL = 'eleven_text_to_sound_v2';
export const ELEVENLABS_SFX_SECONDS = { min: 0.5, max: 30 } as const;
export const DEFAULT_ELEVENLABS_SFX_PROMPT_INFLUENCE = 0.3;
/**
 * A schema cap, not a vendor one — the vendor documents no character limit for this
 * endpoint. A sound effect prompt is a description ("short soft whoosh, fabric through air,
 * no tail"), not a script; anything near this length is a paragraph the model will average.
 */
export const MAX_ELEVENLABS_SFX_TEXT_CHARS = 450;
/**
 * PCM first: mono 16-bit little-endian, wrapped as WAV here. 48 kHz is the mix rate of
 * build-reel.sh (no resample on the way in); 44.1 kHz is the CD rate; 24 kHz is the
 * ungated fallback on plans that refuse the higher rates (403 output_format_not_allowed —
 * the speech lane measured wav_44100 gated and wav_48000 open, so try 48 first). mp3 is kept
 * for a preview that never enters the build.
 */
export const ELEVENLABS_SFX_OUTPUT_FORMATS = ['pcm_48000', 'pcm_44100', 'pcm_24000', 'mp3_44100_128'] as const;
export type ElevenLabsSfxOutputFormat = (typeof ELEVENLABS_SFX_OUTPUT_FORMATS)[number];
export const DEFAULT_ELEVENLABS_SFX_OUTPUT_FORMAT: ElevenLabsSfxOutputFormat = 'pcm_48000';
/** Per minute of generated audio, USD, every plan (pricing/api, read 2026-09-16). */
export const ELEVENLABS_SFX_USD_PER_MINUTE = 0.12;

export function sfxExtensionForFormat(format: ElevenLabsSfxOutputFormat): '.wav' | '.mp3' {
  return format.startsWith('mp3_') ? '.mp3' : '.wav';
}

export function sfxSampleRateForFormat(format: ElevenLabsSfxOutputFormat): number {
  return Number(format.split('_')[1]);
}

export const elevenLabsSfxSchema = z
  .object({
    text: z.string().min(1).max(MAX_ELEVENLABS_SFX_TEXT_CHARS),
    durationSeconds: z.number().min(ELEVENLABS_SFX_SECONDS.min).max(ELEVENLABS_SFX_SECONDS.max).optional(),
    promptInfluence: z.number().min(0).max(1).optional(),
    loop: z.boolean().optional().default(false),
    outputFormat: z.enum(ELEVENLABS_SFX_OUTPUT_FORMATS).optional().default(DEFAULT_ELEVENLABS_SFX_OUTPUT_FORMAT),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('audio').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.filename && path.extname(data.filename).toLowerCase() !== sfxExtensionForFormat(data.outputFormat)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['filename'],
        message: `filename extension must be ${sfxExtensionForFormat(data.outputFormat)} for outputFormat ${data.outputFormat}`,
      });
    }
    // A loop with no length is the vendor picking a length for a bed — a room-tone bed wants
    // the whole 30 s it can have, and a short loop under a 45-second short is a seam every 3 s.
    if (data.loop && data.durationSeconds !== undefined && data.durationSeconds < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['durationSeconds'],
        message: 'a looping effect shorter than 5 s seams audibly under narration — ask for 10–30 s, or drop loop for a one-shot',
      });
    }
  });

export type ElevenLabsSfxRequest = z.infer<typeof elevenLabsSfxSchema>;

/** The vendor body, split out so the mapping is testable without a network. */
export function soundEffectRequestBody(request: ElevenLabsSfxRequest): Record<string, unknown> {
  return {
    text: request.text,
    model_id: ELEVENLABS_SFX_MODEL,
    ...(request.durationSeconds !== undefined ? { duration_seconds: request.durationSeconds } : {}),
    ...(request.promptInfluence !== undefined ? { prompt_influence: request.promptInfluence } : {}),
    ...(request.loop ? { loop: true } : {}),
  };
}

export interface ElevenLabsSfxResponse {
  success: boolean;
  error?: string;
  audioPath?: string;
  /** Provenance sidecar — the record the channel catalog note points at. */
  sidecarPath?: string;
  model?: string;
  outputFormat?: ElevenLabsSfxOutputFormat;
  durationSeconds?: number;
  /** USD at the per-minute API rate, from the measured duration — the ledger quantity is the seconds. */
  estimatedUsd?: number;
  requestId?: string;
  latencyMs?: number;
}

export type ElevenLabsGenerateRequest = z.infer<typeof elevenLabsGenerateSchema>;
export type ElevenLabsDialogueRequest = z.infer<typeof elevenLabsDialogueSchema>;
export type ElevenLabsVoicesRequest = z.infer<typeof elevenLabsVoicesSchema>;

// ── Responses ────────────────────────────────────────────────────

/** Per-character timing, verbatim from the API (see the header note on the two alignments). */
export interface ElevenLabsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/** Dialogue-only: which input/voice covers which span. */
export interface ElevenLabsVoiceSegment {
  voice_id: string;
  start_time_seconds: number;
  end_time_seconds: number;
  character_start_index: number;
  character_end_index: number;
  dialogue_input_index: number;
}

/**
 * Synthesis response. error holds only the cause message — the handler adds the
 * "… failed:" prefix (same convention as tts-client).
 */
export interface ElevenLabsSynthesisResponse {
  success: boolean;
  error?: string;
  warnings?: string[];
  audioPath?: string;
  /** Sidecar JSON with the vendor alignment objects — only when timestamps were requested. */
  alignmentPath?: string;
  model?: string;
  outputFormat?: ElevenLabsOutputFormat;
  /** Audio length read from the WAV header (wav_* formats only — mp3 has no cheap exact length). */
  durationSeconds?: number;
  /** End of the last aligned character (seconds) — the spoken length, with timestamps only. */
  speechEndSeconds?: number;
  alignedCharacters?: number;
  voiceSegments?: number;
  /**
   * The vendor's `character-cost` response header — the metered quantity it reports for
   * this request. Below the raw character count on every measured call (Korean 18 → 10,
   * English 28 → 15), so it is reported as-is and never re-derived from text length.
   */
  characterCost?: number;
  requestId?: string;
  latencyMs?: number;
}

export interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  category?: string;
  labels: Record<string, string>;
  description?: string;
  previewUrl?: string;
  /** Languages the voice is verified for (Voice Library metadata) — ISO codes. */
  verifiedLanguages: string[];
}

export interface ElevenLabsVoicesResponse {
  success: boolean;
  error?: string;
  voices?: ElevenLabsVoice[];
  totalCount?: number;
  hasMore?: boolean;
  nextPageToken?: string;
  /** Best-effort: only when the key carries user_read. */
  subscription?: { tier?: string; status?: string; characterCount?: number; characterLimit?: number; resetsAt?: string };
}

// ── Errors ───────────────────────────────────────────────────────

interface ErrorDetail {
  status?: string;
  code?: string;
  message?: string;
  type?: string;
}

/**
 * Turn an error body into a message the caller can act on.
 *
 * Three body shapes are in the wild (all measured): the current
 * `{detail:{type,code,message,status,request_id}}`, the older `{detail:{status,message}}`
 * (model_not_found still uses it), and FastAPI's 422 `{detail:[{loc,msg,type}]}`.
 * The status string, not the HTTP code, carries the meaning — 401 covers a bad key,
 * a restricted key, and an empty quota alike.
 */
export function describeElevenLabsError(httpStatus: number, bodyText: string): string {
  let detail: unknown;
  try {
    detail = (JSON.parse(bodyText) as { detail?: unknown }).detail;
  } catch {
    return `HTTP ${httpStatus}: ${bodyText.slice(0, 300) || '(empty body)'}`;
  }

  if (Array.isArray(detail)) {
    const issues = detail
      .map((issue) => {
        const item = issue as { loc?: unknown[]; msg?: string };
        const where = Array.isArray(item.loc) ? item.loc.filter((part) => part !== 'body').join('.') : '';
        return where ? `${where}: ${item.msg ?? ''}` : item.msg ?? '';
      })
      .filter(Boolean);
    return `Invalid request (HTTP ${httpStatus}): ${issues.join('; ') || bodyText.slice(0, 300)}`;
  }

  const d = (detail && typeof detail === 'object' ? detail : {}) as ErrorDetail;
  const status = d.status || d.code || '';
  const message = (d.message || '').trim() || bodyText.slice(0, 300);

  switch (status) {
    case 'invalid_api_key':
    case 'needs_authorization':
    case 'unauthorized':
      return `${message} — ELEVENLABS_API_KEY is missing or wrong (https://elevenlabs.io/app/settings/api-keys).`;
    case 'missing_permissions':
      return (
        `${message} — this is a restricted key. Create one with the permission named in the message ` +
        `(text_to_speech for synthesis, voices_read for tts_elevenlabs_voices, user_read for the subscription line).`
      );
    case 'quota_exceeded':
    case 'payment_required':
      return `${message} — the plan's character allowance is used up for this cycle; top up or wait for the reset (https://elevenlabs.io/app/subscription).`;
    case 'too_many_concurrent_requests':
    case 'concurrent_limit_exceeded':
    case 'rate_limit_exceeded':
    case 'system_busy':
      return `${message} — concurrency/rate limit (${CONCURRENCY_HINT}); the server already retried ${MAX_ATTEMPTS}x. Run the scenes one at a time.`;
    case 'output_format_not_allowed':
      return `${message} — pick wav_24000 or wav_48000 (every plan) or upgrade the plan.`;
    case 'voice_not_found':
      return `${message} — copy the ID from tts_elevenlabs_voices or the Voice Library page (the ID, not the display name).`;
    case 'model_not_found':
      return `${message} — supported: ${ELEVENLABS_MODELS.join(', ')}.`;
    case 'model_does_not_support_dialogue':
      return `${message} — text-to-dialogue runs on ${ELEVENLABS_DIALOGUE_MODEL} only.`;
    case 'max_character_limit_exceeded':
      return `${message} — v4 per-request cap: ${MAX_ELEVENLABS_INPUT_CHARS}. Split by scene.`;
    case 'free_users_not_allowed':
    case 'subscription_required':
      return `${message} — this feature needs a paid plan (https://elevenlabs.io/pricing).`;
    default:
      return status ? `HTTP ${httpStatus} ${status}: ${message}` : `HTTP ${httpStatus}: ${message}`;
  }
}

/** Retry only what a retry can fix: concurrency/busy 429s and 5xx. A 4xx is the same answer the second time. */
function isRetryable(httpStatus: number): boolean {
  return httpStatus === 429 || httpStatus >= 500;
}

// ── HTTP ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Synthesis time scales with text, and v4 is the quality model (not real-time by
 * design). 60s of slack plus 40ms per character, cut off at 5 minutes.
 */
function timeoutFor(textLength: number): number {
  return Math.min(5 * 60_000, 60_000 + textLength * 40);
}

async function elevenFetch(pathAndQuery: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const apiKey = requireElevenLabsKey();
  const url = `${elevenLabsBaseUrl()}${pathAndQuery}`;
  const headers: Record<string, string> = {
    'xi-api-key': apiKey,
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
  };

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    if (response.ok) return response;
    const bodyText = await response.text();
    lastError = new Error(describeElevenLabsError(response.status, bodyText));
    if (!isRetryable(response.status) || attempt === MAX_ATTEMPTS - 1) break;
    await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
  }
  throw lastError ?? new Error('ElevenLabs request failed');
}

/** Response meta the caller can't get anywhere else — the bill, the trace id, the vendor's latency. */
function readMeta(response: Response): Pick<ElevenLabsSynthesisResponse, 'characterCost' | 'requestId' | 'latencyMs'> {
  const cost = response.headers.get('character-cost');
  const latency = response.headers.get('tts-latency-ms');
  return {
    characterCost: cost !== null && cost !== '' ? Number(cost) : undefined,
    requestId: response.headers.get('request-id') ?? undefined,
    latencyMs: latency !== null && latency !== '' ? Number(latency) : undefined,
  };
}

// ── Audio helpers ────────────────────────────────────────────────

/**
 * Duration of a RIFF/WAVE buffer from its fmt and data chunks. Walks the chunk
 * list instead of assuming a 44-byte header — the vendor's WAV carries a LIST/INFO
 * chunk before data (measured), so a fixed offset would read garbage.
 */
export function wavDurationSeconds(buffer: Buffer): number | undefined {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return undefined;
  }
  let byteRate = 0;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ' && body + 16 <= buffer.length) {
      byteRate = buffer.readUInt32LE(body + 8);
    } else if (id === 'data') {
      if (!byteRate) return undefined;
      const dataBytes = Math.min(size, buffer.length - body);
      return Math.round((dataBytes / byteRate) * 1000) / 1000;
    }
    offset = body + size + (size & 1);
  }
  return undefined;
}

interface TimestampedBody {
  audio_base64?: string;
  alignment?: ElevenLabsAlignment | null;
  normalized_alignment?: ElevenLabsAlignment | null;
  voice_segments?: ElevenLabsVoiceSegment[];
}

/** Sidecar path: <audio basename>.alignment.json next to the audio file. */
function alignmentPathFor(audioPath: string): string {
  const ext = path.extname(audioPath);
  return `${audioPath.slice(0, audioPath.length - ext.length)}.alignment.json`;
}

/**
 * Decode a with-timestamps body, save the audio and the sidecar, and summarize the
 * alignment. The sidecar keeps the vendor objects verbatim (both alignments, and
 * voice_segments for dialogue) — nothing is re-derived, so nothing can drift.
 */
function saveTimestamped(
  body: TimestampedBody,
  outputDir: string,
  filename: string,
  extra: Record<string, unknown>,
): { audioPath: string; alignmentPath: string; speechEndSeconds?: number; alignedCharacters?: number; voiceSegments?: number; audio: Buffer } {
  if (!body.audio_base64) throw new Error('with-timestamps response carried no audio_base64');
  const audio = Buffer.from(body.audio_base64, 'base64');
  const audioPath = saveAudioFile(outputDir, filename, audio);
  const alignmentPath = alignmentPathFor(audioPath);
  fs.writeFileSync(
    alignmentPath,
    JSON.stringify(
      {
        ...extra,
        audio: path.basename(audioPath),
        alignment: body.alignment ?? null,
        normalized_alignment: body.normalized_alignment ?? null,
        ...(body.voice_segments ? { voice_segments: body.voice_segments } : {}),
      },
      null,
      2,
    ),
  );
  const ends = body.alignment?.character_end_times_seconds ?? [];
  return {
    audioPath,
    alignmentPath,
    audio,
    speechEndSeconds: ends.length ? ends[ends.length - 1] : undefined,
    alignedCharacters: body.alignment?.characters?.length,
    voiceSegments: body.voice_segments?.length,
  };
}

/** Build the exact v4 dialogue payload; single-voice callers share this mapping. */
export function elevenLabsDialogueRequestBody(request: ElevenLabsDialogueRequest): Record<string, unknown> {
  const settings: Record<string, number> = {};
  if (request.stability !== undefined) settings.stability = request.stability;
  const similarity = request.similarity ?? request.similarityBoost;
  if (similarity !== undefined) settings.similarity = similarity;
  return {
    inputs: request.inputs.map((line) => ({ text: line.text, voice_id: line.voiceId })),
    model_id: ELEVENLABS_DIALOGUE_MODEL,
    ...(Object.keys(settings).length ? { settings } : {}),
    ...(request.seed !== undefined ? { seed: request.seed } : {}),
    ...(request.languageCode ? { language_code: request.languageCode } : {}),
    ...(request.previousText ? { previous_text: request.previousText } : {}),
    ...(request.nextText ? { future_text: request.nextText } : {}),
    ...(request.previousRequestIds ? { previous_request_ids: request.previousRequestIds } : {}),
    ...(request.nextRequestIds ? { next_request_ids: request.nextRequestIds } : {}),
    ...(request.usePvcAsIvc !== undefined ? { use_pvc_as_ivc: request.usePvcAsIvc } : {}),
    ...(request.pronunciationDictionaryLocators ? { pronunciation_dictionary_locators: request.pronunciationDictionaryLocators.map(d => ({ pronunciation_dictionary_id: d.pronunciationDictionaryId, version_id: d.versionId })) } : {}),
    ...(request.applyTextNormalization ? { apply_text_normalization: request.applyTextNormalization } : {}),
  };
}

/** Single voice uses the v4 dialogue endpoint with one input. */
export async function generateElevenLabsSpeech(request: ElevenLabsGenerateRequest): Promise<ElevenLabsSynthesisResponse> {
  try {
    // Validate here too: callers importing the adapter directly cannot bypass v4-only checks.
    const { text, voiceId, ...settings } = elevenLabsGenerateSchema.parse(request);
    return await generateElevenLabsDialogue({ ...settings, inputs: [{ text, voiceId }] });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Multi-voice dialogue — POST /v1/text-to-dialogue[/with-timestamps] (eleven_v4) */
export async function generateElevenLabsDialogue(request: ElevenLabsDialogueRequest): Promise<ElevenLabsSynthesisResponse> {
  try {
    request = elevenLabsDialogueSchema.parse(request);
    const outputDir = request.outputPath || process.cwd();
    const filename = request.filename || `elevenlabs_dialogue_${Date.now()}${extensionForFormat(request.outputFormat)}`;
    const totalChars = request.inputs.reduce((sum, line) => sum + line.text.length, 0);
    const warnings = totalChars > RECOMMENDED_ELEVENLABS_DIALOGUE_CHARS
      ? [`Dialogue contains ${totalChars} characters; ElevenLabs recommends at most ${RECOMMENDED_ELEVENLABS_DIALOGUE_CHARS} per request. Longer requests may terminate early or fail validation; split at scene boundaries.`]
      : [];
    const voices = new Set(request.inputs.map((line) => line.voiceId));
    console.error(
      `[ElevenLabs] Synthesizing dialogue... (${request.inputs.length} lines, ${voices.size} voices, ${totalChars} chars, ${request.outputFormat})`,
    );
    const body = elevenLabsDialogueRequestBody(request);
    const query = new URLSearchParams({ output_format: request.outputFormat });
    if (request.enableLogging !== undefined) query.set('enable_logging', String(request.enableLogging));
    const endpoint = `/v1/text-to-dialogue${request.timestamps ? '/with-timestamps' : ''}?${query}`;
    const response = await elevenFetch(endpoint, { method: 'POST', body: JSON.stringify(body) }, timeoutFor(totalChars));
    const meta = readMeta(response);

    if (request.timestamps) {
      const saved = saveTimestamped((await response.json()) as TimestampedBody, outputDir, filename, {
        engine: 'elevenlabs',
        model: ELEVENLABS_DIALOGUE_MODEL,
        inputs: request.inputs.map((line) => ({ voice_id: line.voiceId, text: line.text })),
        ...(request.inputs.length === 1 ? { voice_id: request.inputs[0].voiceId, text: request.inputs[0].text } : {}),
        request: body,
        output_format: request.outputFormat,
        enable_logging: request.enableLogging ?? true,
        ...meta,
      });
      console.error(`[ElevenLabs] Dialogue saved to: ${saved.audioPath} (+ ${path.basename(saved.alignmentPath)})`);
      return {
        success: true,
        warnings,
        audioPath: saved.audioPath,
        alignmentPath: saved.alignmentPath,
        model: ELEVENLABS_DIALOGUE_MODEL,
        outputFormat: request.outputFormat,
        durationSeconds: wavDurationSeconds(saved.audio),
        speechEndSeconds: saved.speechEndSeconds,
        alignedCharacters: saved.alignedCharacters,
        voiceSegments: saved.voiceSegments,
        ...meta,
      };
    }

    const audio = Buffer.from(await response.arrayBuffer());
    const audioPath = saveAudioFile(outputDir, filename, audio);
    console.error(`[ElevenLabs] Dialogue saved to: ${audioPath}`);
    return {
      success: true,
      warnings,
      audioPath,
      model: ELEVENLABS_DIALOGUE_MODEL,
      outputFormat: request.outputFormat,
      durationSeconds: wavDurationSeconds(audio),
      ...meta,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ElevenLabs] Error: ${message.split('\n')[0]}`);
    return { success: false, error: message };
  }
}

interface VoicesBody {
  voices?: Array<{
    voice_id?: string;
    name?: string;
    category?: string;
    labels?: Record<string, string | null>;
    description?: string | null;
    preview_url?: string | null;
    verified_languages?: Array<{ language?: string }>;
  }>;
  has_more?: boolean;
  next_page_token?: string | null;
  total_count?: number;
}

interface SubscriptionBody {
  tier?: string;
  status?: string;
  character_count?: number;
  character_limit?: number;
  next_character_count_reset_unix?: number;
}

/**
 * Voice listing — GET /v2/voices. The list is account-specific (premade + cloned +
 * library picks), so unlike the Gemini lane it can't be a server constant. The
 * subscription line is best-effort: it needs user_read, which restricted keys
 * usually lack, and a missing line is not an error.
 */
export async function listElevenLabsVoices(request: ElevenLabsVoicesRequest): Promise<ElevenLabsVoicesResponse> {
  try {
    const params = new URLSearchParams({ page_size: String(request.limit), include_total_count: 'true' });
    if (request.search) params.set('search', request.search);
    if (request.category) params.set('category', request.category);
    if (request.nextPageToken) params.set('next_page_token', request.nextPageToken);
    for (const language of request.languages ?? []) params.append('language', language);
    if (request.gender) params.set('gender', request.gender);
    if (request.accent) params.set('accent', request.accent);
    const response = await elevenFetch(`/v2/voices?${params.toString()}`, { method: 'GET' }, 30_000);
    const body = (await response.json()) as VoicesBody;
    const voices: ElevenLabsVoice[] = (body.voices ?? [])
      .filter((voice) => voice.voice_id && voice.name)
      .map((voice) => ({
        voiceId: voice.voice_id as string,
        name: voice.name as string,
        category: voice.category,
        labels: Object.fromEntries(
          Object.entries(voice.labels ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''),
        ),
        description: voice.description ?? undefined,
        previewUrl: voice.preview_url ?? undefined,
        verifiedLanguages: Array.from(
          new Set((voice.verified_languages ?? []).map((entry) => entry.language).filter((lang): lang is string => !!lang)),
        ),
      }));

    let subscription: ElevenLabsVoicesResponse['subscription'];
    try {
      const sub = await elevenFetch('/v1/user/subscription', { method: 'GET' }, 15_000);
      const s = (await sub.json()) as SubscriptionBody;
      subscription = {
        tier: s.tier,
        status: s.status,
        characterCount: s.character_count,
        characterLimit: s.character_limit,
        resetsAt: s.next_character_count_reset_unix ? new Date(s.next_character_count_reset_unix * 1000).toISOString() : undefined,
      };
    } catch {
      subscription = undefined; // user_read missing on a restricted key — the listing itself is unaffected
    }

    return { success: true, voices, totalCount: body.total_count, hasMore: body.has_more, nextPageToken: body.next_page_token ?? undefined, subscription };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ElevenLabs] Error: ${message.split('\n')[0]}`);
    return { success: false, error: message };
  }
}

/** Keep source names intact; multilingual_v2 uses aliases, v3 also supports non-English IPA. */
/** Text → sound effect — POST /v1/sound-generation (eleven_text_to_sound_v2). */
export async function generateElevenLabsSoundEffect(request: ElevenLabsSfxRequest): Promise<ElevenLabsSfxResponse> {
  const outputDir = request.outputPath || process.cwd();
  const ext = sfxExtensionForFormat(request.outputFormat);
  const filename = request.filename || `elevenlabs_sfx_${Date.now()}${ext}`;

  try {
    console.error(
      `[ElevenLabs] Sound effect... (${request.text.length} chars, ` +
        `${request.durationSeconds !== undefined ? `${request.durationSeconds}s` : 'auto length'}` +
        `${request.loop ? ', loop' : ''}, ${request.outputFormat})`,
    );
    const body = soundEffectRequestBody(request);
    const response = await elevenFetch(
      `/v1/sound-generation?output_format=${request.outputFormat}`,
      { method: 'POST', body: JSON.stringify(body) },
      120_000,
    );
    const meta = readMeta(response);
    const raw = Buffer.from(await response.arrayBuffer());
    const audio = ext === '.wav' ? pcmToWav(raw, sfxSampleRateForFormat(request.outputFormat), 1) : raw;
    const audioPath = saveAudioFile(outputDir, filename, audio);
    const durationSeconds = ext === '.wav'
      ? wavDurationSeconds(audio)
      : undefined;

    // Where this file came from, next to the file — the catalog row's note points here.
    const sidecar = {
      tool: 'sfx_elevenlabs_generate',
      engine: 'elevenlabs',
      model: ELEVENLABS_SFX_MODEL,
      text: request.text,
      durationSeconds: request.durationSeconds ?? null,
      promptInfluence: request.promptInfluence ?? DEFAULT_ELEVENLABS_SFX_PROMPT_INFLUENCE,
      loop: !!request.loop,
      outputFormat: request.outputFormat,
      measuredSeconds: durationSeconds ?? null,
      requestId: meta.requestId ?? null,
      generatedAt: new Date().toISOString(),
      rights: 'ElevenLabs API output — commercial use on a paid plan; Free-tier output is non-commercial and needs attribution',
    };
    const sidecarPath = audioPath.replace(/\.(wav|mp3)$/i, '') + '.json';
    fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2) + '\n', 'utf8');
    console.error(`[ElevenLabs] Sound effect saved to: ${audioPath} (+ ${path.basename(sidecarPath)})`);

    return {
      success: true,
      audioPath,
      sidecarPath,
      model: ELEVENLABS_SFX_MODEL,
      outputFormat: request.outputFormat,
      durationSeconds,
      estimatedUsd: durationSeconds !== undefined
        ? Math.round((durationSeconds / 60) * ELEVENLABS_SFX_USD_PER_MINUTE * 1e6) / 1e6
        : undefined,
      requestId: meta.requestId,
      latencyMs: meta.latencyMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ElevenLabs] Error: ${message.split('\n')[0]}`);
    return { success: false, error: message };
  }
}

export const elevenLabsDictionarySchema = z.object({
  name: z.string().trim().min(1).max(200),
  rules: z.array(z.object({
    stringToReplace: z.string().trim().min(1).max(200),
    type: z.enum(['alias','phoneme']).default('alias'),
    alias: z.string().trim().min(1).max(200).optional(),
    phoneme: z.string().trim().min(1).max(200).optional(),
    alphabet: z.enum(['ipa','cmu-arpabet']).optional(),
  }).strict().superRefine((r,ctx) => {
    if (r.type === 'alias' ? (!r.alias || r.phoneme || r.alphabet) : (!r.phoneme || !r.alphabet || r.alias))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Alias rules require alias only; phoneme rules require phoneme and alphabet only' });
  })).min(1).max(100),
}).strict();
export async function createElevenLabsDictionary(input: z.input<typeof elevenLabsDictionarySchema>) {
  const request = elevenLabsDictionarySchema.parse(input);
  const response = await elevenFetch('/v1/pronunciation-dictionaries/add-from-rules', {
    method: 'POST', body: JSON.stringify({ name: request.name, rules: request.rules.map(r => ({ type: r.type, string_to_replace: r.stringToReplace, ...(r.type === 'alias' ? { alias: r.alias } : { phoneme: r.phoneme, alphabet: r.alphabet }) })) }),
  }, 30000);
  const result = z.object({ id: z.string().min(1), version_id: z.string().min(1) }).parse(await response.json());
  return { pronunciationDictionaryId: result.id, versionId: result.version_id };
}
