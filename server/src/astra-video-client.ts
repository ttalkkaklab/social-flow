/**
 * ASTRA video API client — the self-hosted LTX lane next to Veo, Seedance and Omni.
 *
 * One server (default https://video.astravision.co.kr) running an LTX-2.5 pipeline behind
 * a queue. Unlike every other video lane in this server it is *ours*: no per-call billing,
 * no content policy handed down by a vendor, and the weights stay on the box. What it costs
 * instead is wall clock and exclusivity — the worker renders **one job at a time**, so a
 * second caller waits in line behind the first.
 *
 * Shape of the API (measured against the live server 2026-09-29, evidence in the PR body):
 * - `POST /v1/uploads` takes the file **bytes as the whole body**, kind chosen by Content-Type,
 *   and answers 201 `{upload_id, kind, bytes, expires_at}` (audio adds `duration`, video adds
 *   `width/height/frames/fps`). Uploads live 24h; 20 per key, 1 GiB total.
 * - `POST /v1/jobs` answers 202 `{job_id, status:"queued", queue_position, status_url, result_url}`.
 * - `GET /v1/jobs/<id>` answers `status` queued → running → succeeded | failed, plus the
 *   `request` the server actually recorded.
 * - `GET /v1/jobs/<id>/result` answers `video/mp4`, or **409** while the job is still running.
 *
 * Six modes, and the server rejects any body key the mode does not own — the error names the
 * whole allow-list, which is how the per-mode field tables below were measured rather than read
 * off a manual. The five exported tools cover all six: text2video carries generate/guided/
 * guided_fast behind `tier`, img2video is generate with 1-2 images, and keyframe / audio2video /
 * retake are one mode each.
 *
 * Two deliberate departures from the sibling clients:
 * - **Uploads do not go through http.ts.** requestRaw/requestBytes JSON.stringify their body;
 *   this endpoint wants raw bytes under a caller-chosen Content-Type, so the upload call is
 *   local to this file. Everything else (submit, poll) uses requestRaw.
 * - **The key never leaves this file.** Errors quote the server's message and the HTTP status,
 *   never the request headers — see redactedFailure().
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { astraVideoBaseUrl, requireAstraVideoKey } from './config.js';
import { requestRaw } from './http.js';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';

// ── constants measured against the live server ───────────────────────────────

/** The three text-driven modes, exposed as one `tier` argument on astra_text2video. */
export const ASTRA_VIDEO_TIERS = {
  /** `generate` — the default pipeline. The only tier that takes `lora`. */
  default: 'generate',
  /** `guided` — slower, takes a negative prompt and a step count. */
  guided: 'guided',
  /** `guided_fast` — 768x512 default, 32-pixel grid, quickest of the three. */
  fast: 'guided_fast',
} as const;

export type AstraVideoTier = keyof typeof ASTRA_VIDEO_TIERS;
export const VALID_ASTRA_VIDEO_TIERS = Object.keys(ASTRA_VIDEO_TIERS) as AstraVideoTier[];

/** The only two adapters the server will load. Any other value, including a path, is a 400. */
export const ASTRA_VIDEO_LORAS = ['cinemagraph', 'slow-motion'] as const;
export const ASTRA_VIDEO_MAX_LORAS = 2;

/**
 * Body keys each mode accepts, verbatim from the server's own rejection message
 * (`POST /v1/jobs` with an unknown key answers 400 naming the allow-list).
 *
 * This is the table the schemas and buildJobBody are checked against — when the server
 * changes, re-probe and change this constant, not six separate call sites.
 */
export const ASTRA_VIDEO_ALLOWED_FIELDS: Record<string, readonly string[]> = {
  generate: ['auto_duration', 'frame_rate', 'hdr', 'height', 'images', 'lora', 'mode', 'num_frames', 'num_generated_keyframes', 'prompt', 'seed', 'width'],
  guided: ['auto_duration', 'frame_rate', 'hdr', 'height', 'images', 'mode', 'negative_prompt', 'num_frames', 'num_generated_keyframes', 'num_inference_steps', 'prompt', 'seed', 'width'],
  guided_fast: ['auto_duration', 'frame_rate', 'hdr', 'height', 'images', 'mode', 'negative_prompt', 'num_frames', 'num_generated_keyframes', 'num_inference_steps', 'prompt', 'seed', 'width'],
  keyframe: ['frame_rate', 'hdr', 'height', 'images', 'mode', 'negative_prompt', 'num_frames', 'num_inference_steps', 'prompt', 'seed', 'width'],
  audio2video: ['audio_max_duration', 'audio_start_time', 'audio_upload_id', 'frame_rate', 'hdr', 'height', 'images', 'mode', 'negative_prompt', 'num_frames', 'num_inference_steps', 'prompt', 'seed', 'width'],
  retake: ['end_time', 'hdr', 'mode', 'prompt', 'seed', 'start_time', 'video_upload_id'],
} as const;

/** Frame counts are 8k+1 in [25, 481]. 121 frames at 24fps is the server's own default (~5.04s). */
export const ASTRA_VIDEO_MIN_FRAMES = 25;
export const ASTRA_VIDEO_MAX_FRAMES = 481;
export const ASTRA_VIDEO_FRAME_STEP = 8;

/** Pixel grid: 64 for generate/guided/keyframe/audio2video, 32 for guided_fast. */
export const ASTRA_VIDEO_DIMENSION_STEP = 64;
export const ASTRA_VIDEO_FAST_DIMENSION_STEP = 32;
export const ASTRA_VIDEO_FAST_MIN_DIMENSION = 32;
export const ASTRA_VIDEO_FAST_MAX_DIMENSION = 1920;
/** width * height ceiling, whatever the grid. 1536x1024 (the default) is 1,572,864. */
export const ASTRA_VIDEO_MAX_PIXELS = 2_088_960;

export const ASTRA_VIDEO_MAX_SEED = 2_147_483_647;
export const ASTRA_VIDEO_MAX_PROMPT_CHARS = 2000;

/** Upload ceilings, by kind (server-enforced; we fail before spending the bandwidth). */
export const ASTRA_VIDEO_UPLOAD_LIMITS = {
  image: 32 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  audio: 32 * 1024 * 1024,
} as const;

/** Job acceptance is rate-limited to 5/min per key; the client spaces its own submits. */
export const ASTRA_VIDEO_SUBMITS_PER_MINUTE = 5;

/** A single job is capped at 1800s server-side, so polling gives up at the same wall. */
export const ASTRA_VIDEO_MAX_WAIT_MS = 1_800_000;
const POLL_INTERVAL_MS = 5_000;
const SUBMIT_TIMEOUT_MS = 60_000;
const STATUS_TIMEOUT_MS = 30_000;
/** Uploads and the result download are byte transfers, not the 300s undici header wall. */
const TRANSFER_TIMEOUT_MS = 600_000;

// ── shared validation ────────────────────────────────────────────────────────

const promptSchema = z
  .string()
  .min(1, 'prompt is required')
  .max(ASTRA_VIDEO_MAX_PROMPT_CHARS, `prompt must be at most ${ASTRA_VIDEO_MAX_PROMPT_CHARS} characters`);

export const numFramesSchema = z
  .number()
  .int()
  .min(ASTRA_VIDEO_MIN_FRAMES)
  .max(ASTRA_VIDEO_MAX_FRAMES)
  .refine((n) => (n - 1) % ASTRA_VIDEO_FRAME_STEP === 0, {
    message: `numFrames must be 8k+1 (25, 33, 41 … ${ASTRA_VIDEO_MAX_FRAMES})`,
  })
  .optional();

const seedSchema = z.number().int().min(0).max(ASTRA_VIDEO_MAX_SEED).optional();
const frameRateSchema = z.number().min(1).max(60).optional();
const negativePromptSchema = z.string().max(ASTRA_VIDEO_MAX_PROMPT_CHARS).optional();
const numInferenceStepsSchema = z.number().int().min(1).max(50).optional();
const numGeneratedKeyframesSchema = z.number().int().min(0).max(16).optional();
const widthSchema = z.number().int().positive().optional();
const heightSchema = z.number().int().positive().optional();

const autoDurationSchema = z
  .object({
    minSeconds: z.number().positive(),
    maxSeconds: z.number().positive(),
  })
  .refine((d) => d.minSeconds <= d.maxSeconds, {
    message: 'autoDuration.minSeconds must be <= maxSeconds',
  })
  .optional();

const loraSchema = z.array(z.enum(ASTRA_VIDEO_LORAS)).max(ASTRA_VIDEO_MAX_LORAS).optional();

const outputFields = {
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('video').optional(),
};

/**
 * Pixel-grid check. guided_fast alone is on the 32 grid and is additionally bounded
 * 32..1920 per side; every other mode is a plain multiple of 64. The area ceiling is shared.
 */
export function checkDimensions(
  width: number | undefined,
  height: number | undefined,
  mode: string,
): string | null {
  const fast = mode === 'guided_fast';
  const step = fast ? ASTRA_VIDEO_FAST_DIMENSION_STEP : ASTRA_VIDEO_DIMENSION_STEP;
  for (const [name, value] of [['width', width], ['height', height]] as const) {
    if (value === undefined) continue;
    if (value % step !== 0) return `${name} must be a multiple of ${step} for mode ${mode} (got ${value})`;
    if (fast && (value < ASTRA_VIDEO_FAST_MIN_DIMENSION || value > ASTRA_VIDEO_FAST_MAX_DIMENSION)) {
      return `${name} must be between ${ASTRA_VIDEO_FAST_MIN_DIMENSION} and ${ASTRA_VIDEO_FAST_MAX_DIMENSION} for mode guided_fast (got ${value})`;
    }
  }
  if (width !== undefined && height !== undefined && width * height > ASTRA_VIDEO_MAX_PIXELS) {
    return `width * height must be at most ${ASTRA_VIDEO_MAX_PIXELS} (got ${width * height})`;
  }
  return null;
}

/** frame_idx is 0-based and must land inside the clip — 121 frames means 0..120, not 0..121. */
export function checkFrameIdx(frameIdx: number, numFrames: number | undefined): string | null {
  const last = (numFrames ?? 121) - 1;
  if (frameIdx < 0 || frameIdx > last) {
    return `frameIdx must be between 0 and ${last} for a ${numFrames ?? 121}-frame clip (got ${frameIdx})`;
  }
  return null;
}

// ── tool schemas ─────────────────────────────────────────────────────────────

/**
 * astra_text2video — generate | guided | guided_fast.
 *
 * `tier` picks the mode, and three arguments are tier-bound because the server's allow-lists
 * are: lora exists only on generate, negativePrompt and numInferenceSteps only on the two
 * guided tiers. Sending one to the wrong tier is a 400 from the server, so it is a refusal
 * here — naming the tier that would have taken it.
 */
export const astraText2VideoSchema = z
  .object({
    prompt: promptSchema,
    tier: z.enum(['default', 'guided', 'fast'] as const).optional().default('default'),
    numFrames: numFramesSchema,
    autoDuration: autoDurationSchema,
    width: widthSchema,
    height: heightSchema,
    frameRate: frameRateSchema,
    seed: seedSchema,
    lora: loraSchema,
    negativePrompt: negativePromptSchema,
    numInferenceSteps: numInferenceStepsSchema,
    numGeneratedKeyframes: numGeneratedKeyframesSchema,
    ...outputFields,
  })
  .superRefine((data, ctx) => {
    const mode = ASTRA_VIDEO_TIERS[data.tier];
    if (data.lora?.length && mode !== 'generate') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lora'],
        message: `lora is accepted only on tier "default" (mode generate); tier "${data.tier}" would be rejected by the server.`,
      });
    }
    if (mode === 'generate') {
      for (const key of ['negativePrompt', 'numInferenceSteps'] as const) {
        if (data[key] !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is accepted only on tier "guided" or "fast"; mode generate has no such field.`,
          });
        }
      }
    }
    const dimensionError = checkDimensions(data.width, data.height, mode);
    if (dimensionError) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['width'], message: dimensionError });
    }
  });

/** astra_img2video — mode generate with one or two stills pinned to frames. */
export const astraImg2VideoSchema = z
  .object({
    prompt: promptSchema,
    firstFramePath: z.string().min(1, 'firstFramePath is required'),
    lastFramePath: z.string().optional(),
    strength: z.number().min(0).max(1).optional(),
    numFrames: numFramesSchema,
    width: widthSchema,
    height: heightSchema,
    frameRate: frameRateSchema,
    seed: seedSchema,
    lora: loraSchema,
    numGeneratedKeyframes: numGeneratedKeyframesSchema,
    ...outputFields,
  })
  .superRefine((data, ctx) => {
    const dimensionError = checkDimensions(data.width, data.height, 'generate');
    if (dimensionError) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['width'], message: dimensionError });
    }
  });

/** astra_keyframe_video — mode keyframe. 2-8 stills, each pinned to a frame index. */
export const astraKeyframeVideoSchema = z
  .object({
    prompt: promptSchema,
    images: z
      .array(
        z.object({
          imagePath: z.string().min(1, 'imagePath is required'),
          frameIdx: z.number().int().min(0),
          strength: z.number().min(0).max(1).optional(),
          crf: z.number().int().min(0).max(51).optional(),
        }),
      )
      .min(2, 'keyframe needs at least 2 images')
      .max(8, 'keyframe takes at most 8 images'),
    numFrames: numFramesSchema,
    width: widthSchema,
    height: heightSchema,
    frameRate: frameRateSchema,
    seed: seedSchema,
    negativePrompt: negativePromptSchema,
    numInferenceSteps: numInferenceStepsSchema,
    ...outputFields,
  })
  .superRefine((data, ctx) => {
    const dimensionError = checkDimensions(data.width, data.height, 'keyframe');
    if (dimensionError) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['width'], message: dimensionError });
    }
    data.images.forEach((image, index) => {
      const frameError = checkFrameIdx(image.frameIdx, data.numFrames);
      if (frameError) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['images', index, 'frameIdx'], message: frameError });
      }
    });
  });

/** astra_audio2video — mode audio2video. The clip is driven by an uploaded wav/mp3. */
export const astraAudio2VideoSchema = z
  .object({
    prompt: promptSchema,
    audioPath: z.string().min(1, 'audioPath is required'),
    audioStartTime: z.number().min(0).optional(),
    audioMaxDuration: z.number().positive().optional(),
    numFrames: numFramesSchema,
    width: widthSchema,
    height: heightSchema,
    frameRate: frameRateSchema,
    seed: seedSchema,
    negativePrompt: negativePromptSchema,
    numInferenceSteps: numInferenceStepsSchema,
    ...outputFields,
  })
  .superRefine((data, ctx) => {
    const dimensionError = checkDimensions(data.width, data.height, 'audio2video');
    if (dimensionError) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['width'], message: dimensionError });
    }
  });

/**
 * astra_video_retake — mode retake. Re-rolls one time span of an existing clip.
 *
 * There is no size or length argument at all: the output inherits the source. The source
 * itself has to be on the grid already (8k+1 frames, both sides a multiple of 32) or the
 * server refuses at acceptance.
 */
export const astraVideoRetakeSchema = z
  .object({
    prompt: promptSchema,
    sourceVideoPath: z.string().min(1, 'sourceVideoPath is required'),
    startTime: z.number().min(0),
    endTime: z.number().positive(),
    seed: seedSchema,
    ...outputFields,
  })
  .superRefine((data, ctx) => {
    if (data.startTime >= data.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: `endTime must be greater than startTime (got ${data.startTime} .. ${data.endTime})`,
      });
    }
  });

export type AstraText2VideoRequest = z.infer<typeof astraText2VideoSchema>;
export type AstraImg2VideoRequest = z.infer<typeof astraImg2VideoSchema>;
export type AstraKeyframeVideoRequest = z.infer<typeof astraKeyframeVideoSchema>;
export type AstraAudio2VideoRequest = z.infer<typeof astraAudio2VideoSchema>;
export type AstraVideoRetakeRequest = z.infer<typeof astraVideoRetakeSchema>;

export interface AstraVideoResponse {
  videoPath: string;
  jobId: string;
  mode: string;
  prompt: string;
  bytes: number;
  /** Seconds between acceptance and the finished file, queue wait included. */
  elapsedSeconds: number;
  /** What the server recorded as the request — the authoritative echo of defaults it filled in. */
  request?: Record<string, unknown>;
}

// ── body construction (pure — this is what the tests lock) ───────────────────

type JobBody = Record<string, unknown>;

function put(body: JobBody, key: string, value: unknown): void {
  if (value !== undefined) body[key] = value;
}

/**
 * Assemble the `POST /v1/jobs` body from validated tool arguments plus whatever upload ids
 * the caller already obtained. Pure on purpose: every per-mode field rule is checked here,
 * with no network in the way.
 *
 * Throws when a key would be sent that the mode's allow-list does not contain — the same
 * 400 the server would answer, one round trip earlier.
 */
export function buildJobBody(
  mode: string,
  args: {
    prompt: string;
    numFrames?: number;
    autoDuration?: { minSeconds: number; maxSeconds: number };
    width?: number;
    height?: number;
    frameRate?: number;
    seed?: number;
    lora?: readonly string[];
    negativePrompt?: string;
    numInferenceSteps?: number;
    numGeneratedKeyframes?: number;
    images?: Array<{ uploadId: string; frameIdx: number; strength?: number; crf?: number }>;
    audioUploadId?: string;
    audioStartTime?: number;
    audioMaxDuration?: number;
    videoUploadId?: string;
    startTime?: number;
    endTime?: number;
  },
): JobBody {
  const allowed = ASTRA_VIDEO_ALLOWED_FIELDS[mode];
  if (!allowed) throw new Error(`Unknown ASTRA video mode: ${mode}`);

  const body: JobBody = { mode, prompt: args.prompt };

  put(body, 'num_frames', args.numFrames);
  if (args.autoDuration) {
    // The server takes num_frames over auto_duration when both arrive; sending both is
    // legal but misleading, so the explicit frame count wins here too and auto_duration drops.
    if (args.numFrames === undefined) {
      body.auto_duration = { min_seconds: args.autoDuration.minSeconds, max_seconds: args.autoDuration.maxSeconds };
    }
  }
  put(body, 'width', args.width);
  put(body, 'height', args.height);
  put(body, 'frame_rate', args.frameRate);
  put(body, 'seed', args.seed);
  if (args.lora?.length) body.lora = [...args.lora];
  put(body, 'negative_prompt', args.negativePrompt);
  put(body, 'num_inference_steps', args.numInferenceSteps);
  put(body, 'num_generated_keyframes', args.numGeneratedKeyframes);
  if (args.images?.length) {
    body.images = args.images.map((image) => {
      const entry: JobBody = { upload_id: image.uploadId, frame_idx: image.frameIdx };
      put(entry, 'strength', image.strength);
      put(entry, 'crf', image.crf);
      return entry;
    });
  }
  put(body, 'audio_upload_id', args.audioUploadId);
  put(body, 'audio_start_time', args.audioStartTime);
  put(body, 'audio_max_duration', args.audioMaxDuration);
  put(body, 'video_upload_id', args.videoUploadId);
  put(body, 'start_time', args.startTime);
  put(body, 'end_time', args.endTime);

  const rejected = Object.keys(body).filter((key) => !allowed.includes(key));
  if (rejected.length) {
    throw new Error(
      `mode ${mode} does not accept ${rejected.join(', ')} — it accepts ${allowed.join(', ')}. ` +
        'Drop the field or pick the mode that owns it.',
    );
  }
  // `hdr` is in every allow-list and is deliberately never sent (see the PR body).
  return body;
}

// ── transport ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Acceptance is 5 requests per rolling minute per key; a 429 there wastes a round trip and,
 * worse, races other sessions on the same key. So submits queue behind a module-level window.
 */
const submitTimestamps: number[] = [];

async function waitForSubmitSlot(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (submitTimestamps.length && now - submitTimestamps[0] >= 60_000) submitTimestamps.shift();
    if (submitTimestamps.length < ASTRA_VIDEO_SUBMITS_PER_MINUTE) {
      submitTimestamps.push(now);
      return;
    }
    await sleep(60_000 - (now - submitTimestamps[0]) + 250);
  }
}

/** Errors quote the server's words and the status. The key is in the headers and stays there. */
function redactedFailure(what: string, status: number, body: string): Error {
  const trimmed = body.length > 600 ? `${body.slice(0, 600)}…` : body;
  return new Error(`ASTRA video ${what} failed (HTTP ${status}): ${trimmed}`);
}

/** 400/401/404/413/415 are the caller's problem — retrying spends the rate limit for nothing. */
function isTerminalStatus(status: number): boolean {
  return status === 400 || status === 401 || status === 403 || status === 404 || status === 413 || status === 415;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${requireAstraVideoKey()}` };
}

function jobsUrl(suffix = ''): string {
  return `${astraVideoBaseUrl()}/v1/jobs${suffix}`;
}

/**
 * Retry wrapper for the transient statuses only: 429 (rate limit) and 503 (worker not taking
 * work). Exponential, four attempts — beyond that the queue is genuinely full and a person
 * should hear about it.
 *
 * baseDelayMs matters: acceptance is limited per MINUTE, so a 2s-4s-8s ladder would spend all
 * four attempts inside the same window that rejected the first. Submits pass 15s.
 */
async function withBackoff<T extends { ok: boolean; status: number }>(
  what: string,
  call: () => Promise<T>,
  baseDelayMs = 2_000,
): Promise<T> {
  let delay = baseDelayMs;
  let last: T | undefined;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await call();
    if (result.ok || (result.status !== 429 && result.status !== 503)) return result;
    last = result;
    await sleep(delay);
    delay *= 2;
  }
  return last as T;
}

const CONTENT_TYPE_BY_EXTENSION: Record<string, { contentType: string; kind: keyof typeof ASTRA_VIDEO_UPLOAD_LIMITS }> = {
  '.png': { contentType: 'image/png', kind: 'image' },
  '.jpg': { contentType: 'image/jpeg', kind: 'image' },
  '.jpeg': { contentType: 'image/jpeg', kind: 'image' },
  '.mp4': { contentType: 'video/mp4', kind: 'video' },
  '.wav': { contentType: 'audio/wav', kind: 'audio' },
  '.mp3': { contentType: 'audio/mpeg', kind: 'audio' },
};

/** The server keys the upload kind off Content-Type, so the extension has to resolve to one. */
export function uploadContentType(filePath: string): { contentType: string; kind: keyof typeof ASTRA_VIDEO_UPLOAD_LIMITS } {
  const ext = path.extname(filePath).toLowerCase();
  const found = CONTENT_TYPE_BY_EXTENSION[ext];
  if (!found) {
    throw new Error(
      `ASTRA video uploads accept ${Object.keys(CONTENT_TYPE_BY_EXTENSION).join(', ')} — "${ext || filePath}" is not one of them.`,
    );
  }
  return found;
}

/**
 * Upload one local file and return its id.
 *
 * Raw bytes as the body, which is why this does not go through http.ts (see the file header).
 */
export async function uploadFile(filePath: string): Promise<{ uploadId: string; bytes: number; kind: string }> {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`File not found: ${filePath}`);
  const { contentType, kind } = uploadContentType(resolved);
  const bytes = fs.statSync(resolved).size;
  const limit = ASTRA_VIDEO_UPLOAD_LIMITS[kind];
  if (bytes > limit) {
    throw new Error(`${path.basename(resolved)} is ${bytes} bytes; the ${kind} upload ceiling is ${limit} bytes.`);
  }

  const headers = authHeaders();
  const result = await withBackoff('upload', async () => {
    try {
      const response = await fetch(`${astraVideoBaseUrl()}/v1/uploads`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': contentType },
        body: fs.readFileSync(resolved),
        signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS),
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, status: 502, body: `Upload unreachable: ${message}` };
    }
  });

  if (!result.ok) throw redactedFailure(`upload of ${path.basename(resolved)}`, result.status, result.body);
  const parsed = JSON.parse(result.body) as { upload_id: string; kind: string; bytes: number };
  return { uploadId: parsed.upload_id, bytes: parsed.bytes, kind: parsed.kind };
}

/** Accept a job and return its id. Honours the client-side 5/min window before calling. */
async function submitJob(body: JobBody): Promise<string> {
  await waitForSubmitSlot();
  const result = await withBackoff(
    'submit',
    () => requestRaw('post', jobsUrl(), authHeaders(), body, SUBMIT_TIMEOUT_MS),
    15_000,
  );
  if (!result.ok) throw redactedFailure('job submission', result.status, result.body);
  const parsed = JSON.parse(result.body) as { job_id?: string };
  if (!parsed.job_id) throw new Error(`ASTRA video accepted the job but returned no job_id: ${result.body}`);
  return parsed.job_id;
}

/**
 * Poll one job to a terminal state and download the mp4.
 *
 * Three things end the loop: `succeeded` (download), `failed` (throw with the server's
 * `error`), and the 1800s wall the server itself enforces on a single job.
 */
async function awaitResult(jobId: string): Promise<{ bytes: Buffer; request?: Record<string, unknown>; elapsedSeconds: number }> {
  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > ASTRA_VIDEO_MAX_WAIT_MS) {
      throw new Error(
        `ASTRA video job ${jobId} did not finish within ${ASTRA_VIDEO_MAX_WAIT_MS / 1000}s. ` +
          `It may still be running — check GET /v1/jobs/${jobId}.`,
      );
    }

    const status = await withBackoff('status', () =>
      requestRaw('get', jobsUrl(`/${jobId}`), authHeaders(), undefined, STATUS_TIMEOUT_MS),
    );
    if (!status.ok) {
      if (isTerminalStatus(status.status)) throw redactedFailure(`status of job ${jobId}`, status.status, status.body);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const job = JSON.parse(status.body) as {
      status?: string;
      error?: string | null;
      request?: Record<string, unknown>;
    };

    if (job.status === 'failed') {
      throw new Error(`ASTRA video job ${jobId} failed: ${job.error || 'the server gave no reason'}`);
    }

    if (job.status === 'succeeded') {
      const download = await withBackoff('result download', async () => {
        try {
          const response = await fetch(jobsUrl(`/${jobId}/result`), {
            headers: authHeaders(),
            signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS),
          });
          return {
            ok: response.ok,
            status: response.status,
            bytes: Buffer.from(await response.arrayBuffer()),
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { ok: false, status: 502, bytes: Buffer.from(message) };
        }
      });
      // 409 means "succeeded, file not flushed yet" — keep polling rather than failing.
      if (download.status === 409) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      if (!download.ok) {
        throw redactedFailure(`result download of job ${jobId}`, download.status, download.bytes.toString('utf8'));
      }
      return {
        bytes: download.bytes,
        request: job.request,
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
      };
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

function saveResult(bytes: Buffer, outputPath: string | undefined, filename: string | undefined): string {
  const target = resolveOutputFile(
    outputPath || process.cwd(),
    filename || `astra_${Date.now()}.mp4`,
    'video',
  );
  fs.writeFileSync(target, bytes);
  return target;
}

async function runJob(
  mode: string,
  prompt: string,
  body: JobBody,
  outputPath: string | undefined,
  filename: string | undefined,
): Promise<AstraVideoResponse> {
  const jobId = await submitJob(body);
  const { bytes, request, elapsedSeconds } = await awaitResult(jobId);
  const videoPath = saveResult(bytes, outputPath, filename);
  return { videoPath, jobId, mode, prompt, bytes: bytes.length, elapsedSeconds, ...(request ? { request } : {}) };
}

// ── the five entry points ────────────────────────────────────────────────────

export async function generateFromText(args: AstraText2VideoRequest): Promise<AstraVideoResponse> {
  const mode = ASTRA_VIDEO_TIERS[args.tier];
  const body = buildJobBody(mode, args);
  return runJob(mode, args.prompt, body, args.outputPath, args.filename);
}

export async function generateFromImage(args: AstraImg2VideoRequest): Promise<AstraVideoResponse> {
  const first = await uploadFile(args.firstFramePath);
  const images = [{ uploadId: first.uploadId, frameIdx: 0, strength: args.strength ?? 1.0 }];
  if (args.lastFramePath) {
    const last = await uploadFile(args.lastFramePath);
    images.push({ uploadId: last.uploadId, frameIdx: (args.numFrames ?? 121) - 1, strength: args.strength ?? 1.0 });
  }
  const body = buildJobBody('generate', { ...args, images });
  return runJob('generate', args.prompt, body, args.outputPath, args.filename);
}

export async function generateFromKeyframes(args: AstraKeyframeVideoRequest): Promise<AstraVideoResponse> {
  const images: Array<{ uploadId: string; frameIdx: number; strength?: number; crf?: number }> = [];
  for (const image of args.images) {
    const uploaded = await uploadFile(image.imagePath);
    images.push({ uploadId: uploaded.uploadId, frameIdx: image.frameIdx, strength: image.strength ?? 1.0, crf: image.crf });
  }
  const body = buildJobBody('keyframe', { ...args, images });
  return runJob('keyframe', args.prompt, body, args.outputPath, args.filename);
}

export async function generateFromAudio(args: AstraAudio2VideoRequest): Promise<AstraVideoResponse> {
  const audio = await uploadFile(args.audioPath);
  const body = buildJobBody('audio2video', { ...args, audioUploadId: audio.uploadId });
  return runJob('audio2video', args.prompt, body, args.outputPath, args.filename);
}

export async function retakeVideo(args: AstraVideoRetakeRequest): Promise<AstraVideoResponse> {
  const source = await uploadFile(args.sourceVideoPath);
  const body = buildJobBody('retake', { ...args, videoUploadId: source.uploadId });
  return runJob('retake', args.prompt, body, args.outputPath, args.filename);
}
