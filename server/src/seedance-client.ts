import { recordVideoSubmission, recordVideoTokens } from './video-events.js';
/**
 * ByteDance Seedance video generation client (BytePlus ModelArk).
 *
 * The API video engine next to the LTX lanes. When to use which is governed by
 * skills/produce/references/video-model-selection.md.
 *
 * - 4 models: Dreamina Seedance 2.5 / 2.0·fast·mini. Seedance 1.x left the plugin on 2026-10-31:
 *   it takes no reference audio, so it cannot keep a character's voice.
 * - Text-to-Video, Image-to-Video (first frame · first+last frame), reference images,
 *   reference audio (a clip's voice timbre or dialogue content, `role: reference_audio`)
 *   and reference video (camera, blocking and motion timing from a clip such as the
 *   Blender previz, `role: reference_video`; public URL only, see media-publish.ts)
 * - 7 aspect ratios (9:16 included) · fixed 24fps · duration 4~30s (varies per model)
 * - Generation is async — POST creates a task, GET polls it, then the mp4 is downloaded
 *
 * Result URLs are **valid for 24 hours**, so we save locally as soon as polling
 * finishes and return only the path. We also
 * return completion_tokens, the billing basis — the vendor bills on this value,
 * so it's more authoritative than any estimated per-unit price conversion.
 *
 * The API key is validated at call time, not at startup (config.requireArkKey).
 */

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { arkBaseUrl, requireArkKey } from './config.js';
import { publishFiles } from './media-publish.js';
import {
  ALLOWED_EXTENSIONS,
  bareFilenameSchema,
  mimeFromExtension,
  resolveOutputFile,
  validateFilePath,
} from './media-utils.js';
import { nonEnglishOutsideQuotes } from './prompt-language.js';

// ── Model capability table (source of truth) ────────────────────────
//
// A direct transcription of the per-model constraints in the official docs
// (docs.byteplus.com/en/docs/ModelArk 1330310·1520757·1544106, checked 2026-08-15).
// Schema validation, tool enums, and docs all derive from this table — copying
// the values into multiple places means only one gets fixed when a model is added.

export const VALID_SEEDANCE_RESOLUTIONS = ['480p', '720p', '1080p', '4k'] as const;
export type SeedanceResolution = (typeof VALID_SEEDANCE_RESOLUTIONS)[number];

/** 7 aspect ratios. adaptive follows the input's (image/video) ratio as-is. */
export const VALID_SEEDANCE_RATIOS = ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9', 'adaptive'] as const;
export type SeedanceRatio = (typeof VALID_SEEDANCE_RATIOS)[number];

export interface SeedanceReferenceAudioSpec {
  /** How many reference audio clips one request may carry */
  maxClips: number;
  /** Per-clip length bounds in seconds */
  clipSeconds: readonly [number, number];
  /** Combined length of every clip in the request, seconds */
  totalSeconds: number;
  /** Whether a request may carry audio with no reference image at all */
  audioOnly: boolean;
}

export interface SeedanceReferenceVideoSpec {
  /** How many reference videos one request may carry */
  maxClips: number;
  /** Per-clip length bounds in seconds */
  clipSeconds: readonly [number, number];
  /** Combined length of every clip in the request, seconds */
  totalSeconds: number;
}

export interface SeedanceModelSpec {
  /** Resolutions this model can output */
  resolutions: readonly SeedanceResolution[];
  /** Generation duration (seconds), lower and upper bound */
  duration: readonly [number, number];
  /** Whether first+last frame interpolation is supported */
  lastFrame: boolean;
  /** Reference image count range */
  referenceImages: readonly [number, number];
  /**
   * Reference audio (the omni reference lane — API reference 1520757, checked 2026-08-29).
   * What the clip carries is what the model imitates: a voice timbre, or dialogue and
   * music content it lip-syncs to. A model without it cannot keep a character's voice and
   * does not belong in this table (2026-10-31).
   */
  referenceAudio: SeedanceReferenceAudioSpec;
  /**
   * Reference video (the same omni lane — API reference 1520757, checked 2026-09-11). The
   * model takes camera movement, blocking, motion timing and, when asked, style from it;
   * this pipeline's use is the Blender previz clip.
   */
  referenceVideos: SeedanceReferenceVideoSpec;
  /** Whether simultaneous audio generation (generate_audio) is supported. false means silent-only */
  audio: boolean;
  /** Whether input images containing real human faces are accepted (2.x rejects them) */
  realFaceInput: boolean;
  /**
   * Whether activation requires **an account balance over $30 or a resource pack** —
   * this flags only the money gate.
   *
   * false does not mean "just works". **Every model** must first be enabled in the
   * console's Model activation, and calling one that isn't enabled fails task
   * creation with `ModelNotOpen` (measured 2026-08-15 — no charge is incurred). First-time activation also demands TOS, VPC, and ML
   * platform cross-service authorization.
   */
  activationGate: boolean;
}

export const SEEDANCE_MODEL_SPECS = {
  // 1080p opened on 2026-08-17 (UTC+8) — 10-bit color, and the only tier the discount
  // campaign covers (28% off list through 2026-09-17). 2.5 has no 4K; 2.0 does.
  'dreamina-seedance-2-5-260628': {
    resolutions: ['480p', '720p', '1080p'],
    duration: [4, 30],
    lastFrame: true,
    referenceImages: [1, 30],
    referenceAudio: { maxClips: 10, clipSeconds: [2, 30], totalSeconds: 30, audioOnly: true },
    referenceVideos: { maxClips: 10, clipSeconds: [2, 30], totalSeconds: 30 },
    audio: true,
    realFaceInput: false,
    activationGate: true,
  },
  'dreamina-seedance-2-0-260128': {
    resolutions: ['480p', '720p', '1080p', '4k'],
    duration: [4, 15],
    lastFrame: true,
    referenceImages: [1, 9],
    referenceAudio: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15, audioOnly: false },
    referenceVideos: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15 },
    audio: true,
    realFaceInput: false,
    activationGate: true,
  },
  'dreamina-seedance-2-0-fast-260128': {
    resolutions: ['480p', '720p'],
    duration: [4, 15],
    lastFrame: true,
    referenceImages: [1, 9],
    referenceAudio: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15, audioOnly: false },
    referenceVideos: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15 },
    audio: true,
    realFaceInput: false,
    activationGate: true,
  },
  'dreamina-seedance-2-0-mini-260615': {
    resolutions: ['480p', '720p'],
    duration: [4, 15],
    lastFrame: true,
    referenceImages: [1, 9],
    referenceAudio: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15, audioOnly: false },
    referenceVideos: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15 },
    audio: true,
    realFaceInput: false,
    activationGate: true,
  },
} as const satisfies Record<string, SeedanceModelSpec>;

export const VALID_SEEDANCE_MODELS = Object.keys(SEEDANCE_MODEL_SPECS) as Array<
  keyof typeof SEEDANCE_MODEL_SPECS
>;
export type SeedanceModel = (typeof VALID_SEEDANCE_MODELS)[number];

export const DEFAULT_SEEDANCE_MODEL: SeedanceModel = 'dreamina-seedance-2-0-260128';

export const DEFAULT_SEEDANCE_RESOLUTION: SeedanceResolution = '720p';
export const DEFAULT_SEEDANCE_DURATION = 5; // the only common default that fits every model's duration range
export const SEEDANCE_FPS = 24; // fixed across all models

const POLL_INTERVAL_MS = 10_000;
const MAX_POLLS = 90; // 15-minute max wait — 2.5's 30s clips take the longest
const MAX_INPUT_IMAGE_BYTES = 30 * 1024 * 1024; // per-image cap (official)
const MAX_REQUEST_BYTES = 64 * 1024 * 1024; // request body cap (official)
const MAX_INPUT_AUDIO_BYTES = 15 * 1024 * 1024; // per-clip cap for reference audio (official)
const MAX_INPUT_VIDEO_BYTES = 200 * 1024 * 1024; // per-clip cap for reference video (official)
/** Reference-video frame limits (official, API reference 1520757): fps range and total pixel range */
export const SEEDANCE_REFERENCE_VIDEO_FPS = [24, 60] as const;
export const SEEDANCE_REFERENCE_VIDEO_PIXELS = [407_696, 8_295_044] as const;

/** Formats the vendor accepts for reference audio — narrower than ALLOWED_EXTENSIONS.audio (no ogg·aac·flac) */
export const SEEDANCE_REFERENCE_AUDIO_EXTENSIONS = ['.wav', '.mp3'] as const;
/** Formats the vendor accepts for reference video (H.264/H.265 inside) */
export const SEEDANCE_REFERENCE_VIDEO_EXTENSIONS = ['.mp4', '.mov'] as const;

// ── Shared schema pieces ────────────────────────────────────────────

const commonFields = {
  prompt: z.string().min(1, 'Prompt is required'),
  model: z.enum(VALID_SEEDANCE_MODELS as [SeedanceModel, ...SeedanceModel[]]).optional().default(DEFAULT_SEEDANCE_MODEL),
  resolution: z.enum(VALID_SEEDANCE_RESOLUTIONS).optional().default(DEFAULT_SEEDANCE_RESOLUTION),
  durationSeconds: z.number().int().optional(),
  generateAudio: z.boolean().optional().default(false),
  watermark: z.boolean().optional().default(false),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('video').optional(),
};

type CommonInput = {
  prompt: string;
  model: SeedanceModel;
  resolution: SeedanceResolution;
  durationSeconds?: number;
  generateAudio: boolean;
};

/**
 * Model × resolution × duration × feature cross-constraint validation (per official docs).
 *
 * We reject before calling because one generation takes
 * minutes, and a bad combination comes back as an async error that burns all of
 * that time. Rejecting here lets the model immediately retry with corrected
 * arguments.
 */
function validateCommon(data: CommonInput, ctx: z.RefinementCtx): void {
  const spec = SEEDANCE_MODEL_SPECS[data.model];

  // Video prompts are English on every model; dialogue in the video's language goes inside quotes.
  const foreign = nonEnglishOutsideQuotes(data.prompt);
  if (foreign) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['prompt'],
      message: `video_prompt_language: "${foreign}" sits outside quotation marks. Write the video prompt in English; only dialogue, inside quotes, uses the video's language.`,
    });
  }

  if (!(spec.resolutions as readonly string[]).includes(data.resolution)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resolution'],
      message: `${data.model} does not support ${data.resolution} (supported: ${spec.resolutions.join(', ')}).`,
    });
  }

  const [minDuration, maxDuration] = spec.duration;
  if ((data.durationSeconds ?? DEFAULT_SEEDANCE_DURATION) < minDuration || (data.durationSeconds ?? DEFAULT_SEEDANCE_DURATION) > maxDuration) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['durationSeconds'],
      message: `${data.model} supports durations of ${minDuration}~${maxDuration}s (requested: ${data.durationSeconds}s).`,
    });
  }

  if (data.generateAudio && !spec.audio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['generateAudio'],
      message: `${data.model} is silent-only and cannot generate audio.`,
    });
  }
}

// Text-to-Video request schema
export const seedanceText2VideoSchema = z
  .object({
    ...commonFields,
    ratio: z.enum(VALID_SEEDANCE_RATIOS).optional().default('16:9'),
  })
  .superRefine(validateCommon)
  .transform(data => ({ ...data, durationSeconds: data.durationSeconds ?? DEFAULT_SEEDANCE_DURATION }));

// Image-to-Video request schema (first frame · first+last frame)
export const seedanceImg2VideoSchema = z
  .object({
    ...commonFields,
    sourceImagePath: z.string().min(1, 'Source image path is required'),
    lastImagePath: z.string().optional(),
    // Following the input image's ratio is the default — specifying a different
    // ratio makes the server center-crop the source image (the incident where a
    // 9:16 cover got cropped).
    ratio: z.enum(VALID_SEEDANCE_RATIOS).optional().default('adaptive'),
  })
  .superRefine((data, ctx) => {
    validateCommon(data, ctx);
    if (data.lastImagePath && !SEEDANCE_MODEL_SPECS[data.model].lastFrame) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lastImagePath'],
        message: `${data.model} accepts a first frame only.`,
      });
    }
  })
  .transform(data => ({ ...data, durationSeconds: data.durationSeconds ?? DEFAULT_SEEDANCE_DURATION }));

// Reference request schema (omni reference: images, audio, video)
export const seedanceReferenceSchema = z
  .object({
    ...commonFields,
    referenceImagePaths: z.array(z.string()).optional().default([]),
    referenceAudioPaths: z.array(z.string()).optional().default([]),
    referenceVideoPaths: z.array(z.string()).optional().default([]),
    referenceVideoUrls: z.array(z.string().url()).optional().default([]),
    ratio: z.enum(VALID_SEEDANCE_RATIOS).optional().default('adaptive'),
  })
  .superRefine((data, ctx) => {
    validateCommon(data, ctx);
    const spec: SeedanceModelSpec = SEEDANCE_MODEL_SPECS[data.model];
    const [, maxImages] = spec.referenceImages;
    if (data.referenceImagePaths.length > maxImages) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referenceImagePaths'],
        message: `${data.model} allows at most ${maxImages} reference images (requested: ${data.referenceImagePaths.length}).`,
      });
    }
    const videoCount = data.referenceVideoPaths.length + data.referenceVideoUrls.length;
    if (data.referenceImagePaths.length === 0 && data.referenceAudioPaths.length === 0 && videoCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referenceImagePaths'],
        message: 'At least one reference is required — referenceImagePaths, referenceAudioPaths, referenceVideoPaths/Urls, or a mix.',
      });
      return;
    }
    if (videoCount > 0) {
      const video = spec.referenceVideos;
      if (videoCount > video.maxClips) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['referenceVideoPaths'],
          message: `${data.model} allows at most ${video.maxClips} reference videos (requested: ${videoCount}).`,
        });
      }
      for (const filePath of data.referenceVideoPaths) {
        const ext = path.extname(filePath).toLowerCase();
        if (!(SEEDANCE_REFERENCE_VIDEO_EXTENSIONS as readonly string[]).includes(ext)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['referenceVideoPaths'],
            message: `Reference video must be mp4 or mov (got "${ext}" in ${path.basename(filePath)}).`,
          });
        }
      }
      if (!/\bvideo\s*1\b/i.test(data.prompt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['prompt'],
          message: 'A reference video is bound in the prompt by index — write "Video 1" (2.5: "@Video 1") and say what it supplies (camera movement, blocking, motion timing) and what it must not (its visual content).',
        });
      }
    }
    if (data.referenceAudioPaths.length === 0) return;

    // Reference audio — the vendor fails these asynchronously, minutes later.
    const audio = spec.referenceAudio;
    if (data.referenceAudioPaths.length > audio.maxClips) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referenceAudioPaths'],
        message: `${data.model} allows at most ${audio.maxClips} reference audio clips (requested: ${data.referenceAudioPaths.length}).`,
      });
    }
    if (!audio.audioOnly && data.referenceImagePaths.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referenceImagePaths'],
        message: `${data.model} needs at least one reference image alongside reference audio — audio-only input is dreamina-seedance-2-5-260628 only.`,
      });
    }
    for (const filePath of data.referenceAudioPaths) {
      const ext = path.extname(filePath).toLowerCase();
      if (!(SEEDANCE_REFERENCE_AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['referenceAudioPaths'],
          message: `Reference audio must be wav or mp3 (got "${ext}" in ${path.basename(filePath)}).`,
        });
      }
    }
    if (!data.generateAudio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['generateAudio'],
        message: 'Reference audio with generateAudio: false produces a silent video, so the voice reference has nothing to shape. Set generateAudio: true.',
      });
    }
  }).transform(data => ({ ...data, durationSeconds: data.durationSeconds ?? DEFAULT_SEEDANCE_DURATION }));

export type SeedanceText2VideoRequest = z.infer<typeof seedanceText2VideoSchema>;
export type SeedanceImg2VideoRequest = z.infer<typeof seedanceImg2VideoSchema>;
export type SeedanceReferenceRequest = z.infer<typeof seedanceReferenceSchema>;

export interface SeedanceGenerationResponse {
  success: boolean;
  videoPath?: string;
  error?: string;
  prompt?: string;
  model?: string;
  ratio?: string;
  resolution?: string;
  duration?: number;
  durationSource?: 'provider_reported' | 'requested_seconds';
  /** Token count the vendor bills on — this, not an estimated price conversion, is the actual billing basis */
  completionTokens?: number;
  taskId?: string;
  /** Nothing is running at the vendor: rejected before or at submission, or the task itself ended failed. */
  terminal?: boolean;
  sourceImage?: string;
  lastImage?: string;
  referenceImages?: string[];
  referenceAudios?: string[];
  /** Local paths and public URLs of the reference videos, in prompt (Video N) order */
  referenceVideos?: string[];
  /** Combined length of the reference videos — the vendor bills input seconds alongside output seconds */
  referenceVideoSeconds?: number;
  /** How local reference videos reached the vendor: the operator's media hosting or a quick tunnel */
  referenceVideoRoute?: 'upload' | 'tunnel';
}

// ── ModelArk REST contract ──────────────────────────────────────────

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string }; role?: string }
  | { type: 'video_url'; video_url: { url: string }; role: 'reference_video' }
  | { type: 'audio_url'; audio_url: { url: string }; role: 'reference_audio' };

interface CreateTaskBody {
  model: string;
  content: ContentPart[];
  ratio: string;
  resolution: string;
  duration: number;
  generate_audio?: boolean;
  watermark: boolean;
}

interface TaskStatus {
  id?: string;
  status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired';
  content?: { video_url?: string };
  usage?: { completion_tokens?: number; total_tokens?: number };
  duration?: number;
  ratio?: string;
  resolution?: string;
  error?: { code?: string; message?: string };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract a one-liner the model can read from a ModelArk error body. */
function describeHttpError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string; message?: string } };
    const code = parsed.error?.code;
    const message = parsed.error?.message;
    if (message) return `HTTP ${status} ${code ? `(${code}) ` : ''}${message}`;
  } catch {
    // not JSON — use the raw body as-is
  }
  return `HTTP ${status} — ${body.slice(0, 400)}`;
}

/** Create a task → task ID */
async function createTask(apiKey: string, body: CreateTaskBody): Promise<string> {
  const response = await fetch(`${arkBaseUrl()}/contents/generations/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5 * 60_000),
  });

  if (!response.ok) {
    // Same rule as the GenAI transport: an explicit 4xx answer (except timeout/conflict) created no task.
    const terminal = response.status >= 400 && response.status < 500 && ![408, 409, 425].includes(response.status);
    throw Object.assign(new Error(`Failed to create video task: ${describeHttpError(response.status, await response.text())}`), { terminal });
  }

  const json = (await response.json()) as { id?: string };
  if (!json.id) throw new Error('No task id returned from ModelArk');
  return json.id;
}

async function getTask(apiKey: string, taskId: string): Promise<TaskStatus> {
  const response = await fetch(`${arkBaseUrl()}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to get task status: ${describeHttpError(response.status, await response.text())}`);
  }

  return response.json() as Promise<TaskStatus>;
}

/**
 * Poll for completion → download the mp4 → save locally.
 *
 * The download does not send the API key — video_url is an already-signed object
 * storage address, and there's no reason to attach our key to someone else's domain.
 */
async function awaitVideoAndSave(
  apiKey: string,
  taskId: string,
  outputPath: string,
  filename: string,
): Promise<{ videoPath: string; task: TaskStatus } | { error: string; terminal?: boolean }> {
  let retried = false;
  for (let poll = 1; poll <= MAX_POLLS; poll += 1) {
    console.error(`[Seedance] Generation in progress... (polling ${poll}/${MAX_POLLS})`);
    await sleep(POLL_INTERVAL_MS);

    // One failed status read in a row (a 5xx or a dropped connection) waits for the next poll;
    // only the GET repeats, never the paid task creation.
    let task: TaskStatus;
    try { task = await getTask(apiKey, taskId); retried = false; }
    catch (error) { if (retried) throw error; retried = true; continue; }

    if (task.status === 'failed' || task.status === 'expired' || task.status === 'cancelled') {
      const reason = task.error?.message || task.status;
      return { error: `Generation ${task.status}: ${reason}`, terminal: true };
    }
    if (task.status !== 'succeeded') continue;

    const videoUrl = task.content?.video_url;
    if (!videoUrl) return { error: 'Task succeeded but no video_url in response' };

    // Path validation (traversal·extension) happens before the download —
    // rejecting after receiving tens of MB wastes bandwidth, and the result URL
    // disappears after 24 hours so there's no retry either.
    const fullPath = resolveOutputFile(outputPath, filename, 'video');
    const download = await fetch(videoUrl, { signal: AbortSignal.timeout(10 * 60_000) });
    if (!download.ok) {
      return { error: `Failed to download video: HTTP ${download.status} (URL is valid for 24 hours)` };
    }
    fs.writeFileSync(fullPath, Buffer.from(await download.arrayBuffer()));

    console.error(`[Seedance] Video saved to: ${fullPath}`);
    return { videoPath: fullPath, task };
  }

  return { error: `Video generation timed out (${(MAX_POLLS * POLL_INTERVAL_MS) / 60_000} minutes). Task ${taskId} may still be running — check the ModelArk console.` };
}

/**
 * Read a local image as a data URI.
 *
 * ModelArk only accepts base64 data URIs unless given a public URL. The format
 * string must be lowercase (`data:image/png;base64,`), and the whole request
 * body must stay under 64MB.
 */
function readImageDataUri(filePath: string): string {
  const stats = fs.statSync(filePath);
  if (stats.size > MAX_INPUT_IMAGE_BYTES) {
    throw new Error(
      `Input image too large: ${path.basename(filePath)} (${(stats.size / 1024 / 1024).toFixed(1)}MB, limit 30MB)`,
    );
  }
  const buffer = fs.readFileSync(filePath);
  return `data:${mimeFromExtension(filePath, 'image')};base64,${buffer.toString('base64')}`;
}

/** Validate input image paths and convert to data URIs (existence·extension·size·total). */
function loadImages(filePaths: string[]): string[] {
  const uris: string[] = [];
  for (const filePath of filePaths) {
    validateFilePath(filePath, { allowedExtensions: ALLOWED_EXTENSIONS.image });
    if (!fs.existsSync(filePath)) throw new Error(`Image not found: ${filePath}`);
    uris.push(readImageDataUri(filePath));
  }
  assertRequestBudget(uris);
  return uris;
}

/** The whole request body must stay under 64MB (official) — base64 across every reference file. */
function assertRequestBudget(uris: string[]): void {
  const total = uris.reduce((sum, uri) => sum + uri.length, 0);
  if (total > MAX_REQUEST_BYTES) {
    throw new Error(
      `Request body too large: base64 total ${(total / 1024 / 1024).toFixed(1)}MB (limit 64MB). Use fewer reference files or smaller ones.`,
    );
  }
}

/**
 * MIME label for a reference-audio data URI. The API reference gives the template
 * `data:audio/<audio format>;base64,` and lists the formats as wav·mp3, with wav as
 * its only worked example — so `audio/mp3` is the literal reading for mp3, but it is
 * UNVERIFIED against a live call (audio/mpeg is the registered type). Prefer wav.
 */
function audioMimeFromExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase() === '.mp3' ? 'audio/mp3' : 'audio/wav';
}

/** Validate reference audio paths and convert to data URIs (existence · wav/mp3 · 15MB per clip). */
function loadReferenceAudio(filePaths: string[]): string[] {
  return filePaths.map((filePath) => {
    validateFilePath(filePath, { allowedExtensions: SEEDANCE_REFERENCE_AUDIO_EXTENSIONS });
    if (!fs.existsSync(filePath)) throw new Error(`Reference audio not found: ${filePath}`);
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_INPUT_AUDIO_BYTES) {
      throw new Error(
        `Reference audio too large: ${path.basename(filePath)} (${(stats.size / 1024 / 1024).toFixed(1)}MB, limit 15MB)`,
      );
    }
    return `data:${audioMimeFromExtension(filePath)};base64,${fs.readFileSync(filePath).toString('base64')}`;
  });
}

/** Frame facts of a video via ffprobe — null when ffprobe is missing or the file is unreadable. */
export function probeVideo(filePath: string): Promise<{ seconds: number; fps: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    execFile(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', filePath],
      { timeout: 15_000 },
      (error, out) => {
        if (error) return resolve(null);
        try {
          const parsed = JSON.parse(String(out)) as { streams?: Array<{ width?: number; height?: number; r_frame_rate?: string }>; format?: { duration?: string } };
          const stream = parsed.streams?.[0];
          const [num, den] = String(stream?.r_frame_rate || '').split('/').map(Number);
          const fps = num && den ? num / den : NaN;
          const seconds = Number.parseFloat(String(parsed.format?.duration ?? ''));
          if (!stream?.width || !stream?.height || !Number.isFinite(fps) || !Number.isFinite(seconds) || seconds <= 0) return resolve(null);
          resolve({ seconds, fps, width: stream.width, height: stream.height });
        } catch {
          resolve(null);
        }
      },
    );
  });
}

/**
 * Reference-video limits (official): size, frame rate, pixel count, per-clip and total
 * length. The vendor rejects these only after the task is queued and the clip has been
 * fetched, so a wrong render fails here, before a tunnel is opened or anything is billed.
 */
async function checkReferenceVideos(filePaths: string[], spec: SeedanceReferenceVideoSpec, model: string): Promise<number> {
  const [minSeconds, maxSeconds] = spec.clipSeconds;
  const [minFps, maxFps] = SEEDANCE_REFERENCE_VIDEO_FPS;
  const [minPixels, maxPixels] = SEEDANCE_REFERENCE_VIDEO_PIXELS;
  let total = 0;
  for (const filePath of filePaths) {
    validateFilePath(filePath, { allowedExtensions: SEEDANCE_REFERENCE_VIDEO_EXTENSIONS });
    if (!fs.existsSync(filePath)) throw new Error(`Reference video not found: ${filePath}`);
    const name = path.basename(filePath);
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_INPUT_VIDEO_BYTES) {
      throw new Error(`Reference video too large: ${name} (${(stats.size / 1024 / 1024).toFixed(1)}MB, limit 200MB)`);
    }
    const facts = await probeVideo(filePath);
    if (!facts) {
      console.error(`[Seedance] ffprobe unavailable — skipping the frame checks for ${name} (${model}: ${minSeconds}~${maxSeconds}s per clip, ${minFps}~${maxFps} fps)`);
      continue;
    }
    if (facts.seconds < minSeconds || facts.seconds > maxSeconds) {
      throw new Error(`Reference video ${name} is ${facts.seconds.toFixed(1)}s — ${model} accepts ${minSeconds}~${maxSeconds}s per clip.`);
    }
    if (facts.fps < minFps - 0.01 || facts.fps > maxFps + 0.01) {
      throw new Error(`Reference video ${name} is ${facts.fps.toFixed(3)} fps — the vendor takes ${minFps}~${maxFps} fps (render the previz at 24 or 30).`);
    }
    const pixels = facts.width * facts.height;
    if (pixels < minPixels || pixels > maxPixels) {
      throw new Error(`Reference video ${name} is ${facts.width}×${facts.height} (${pixels} px) — the vendor takes ${minPixels}~${maxPixels} pixels a frame.`);
    }
    total += facts.seconds;
  }
  if (total > spec.totalSeconds) {
    throw new Error(`Reference videos total ${total.toFixed(1)}s — ${model} allows ${spec.totalSeconds}s across all clips.`);
  }
  return total;
}

/** Clip length via ffprobe — null when ffprobe is missing or the file is unreadable. */
function probeAudioSeconds(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
      { timeout: 15_000 },
      (error, out) => {
        const seconds = Number.parseFloat(String(out ?? '').trim());
        resolve(!error && Number.isFinite(seconds) && seconds > 0 ? seconds : null);
      },
    );
  });
}

/**
 * Per-clip and total length limits for reference audio (official). The vendor
 * enforces them on its side too, but only after the task is queued — checking
 * here turns a minutes-later failure into an immediate one. No ffprobe means
 * the check is skipped with a note, not a failure.
 */
async function checkReferenceAudioDurations(
  filePaths: string[],
  spec: SeedanceReferenceAudioSpec,
  model: string,
): Promise<void> {
  const [minSeconds, maxSeconds] = spec.clipSeconds;
  let total = 0;
  for (const filePath of filePaths) {
    const seconds = await probeAudioSeconds(filePath);
    if (seconds === null) {
      console.error(
        `[Seedance] ffprobe unavailable — skipping the duration check for ${path.basename(filePath)} (${model}: ${minSeconds}~${maxSeconds}s per clip, ${spec.totalSeconds}s total)`,
      );
      continue;
    }
    if (seconds < minSeconds || seconds > maxSeconds) {
      throw new Error(
        `Reference audio ${path.basename(filePath)} is ${seconds.toFixed(1)}s — ${model} accepts ${minSeconds}~${maxSeconds}s per clip.`,
      );
    }
    total += seconds;
  }
  if (total > spec.totalSeconds) {
    throw new Error(
      `Reference audio totals ${total.toFixed(1)}s — ${model} allows ${spec.totalSeconds}s across all clips.`,
    );
  }
}

/** Assemble the shared request body — fields the model doesn't support aren't included at all. */
function buildBody(
  request: CommonInput & { prompt: string; ratio: SeedanceRatio; watermark: boolean },
  parts: ContentPart[],
): CreateTaskBody {
  const spec = SEEDANCE_MODEL_SPECS[request.model];
  const body: CreateTaskBody = {
    model: request.model,
    content: [{ type: 'text', text: request.prompt }, ...parts],
    ratio: request.ratio,
    resolution: request.resolution,
    duration: request.durationSeconds!,
    watermark: request.watermark,
  };
  // The vendor default for generate_audio is true. Passing it to a silent-only
  // model gets rejected, so we send it only to models that support it and flip
  // our own default to false — this pipeline attaches narration separately via
  // TTS.
  if (spec.audio) body.generate_audio = request.generateAudio;
  return body;
}

/** Assemble the success response — the actual generation result (values the vendor returned) wins. */
function toResponse(
  request: { prompt: string; model: SeedanceModel; ratio: SeedanceRatio; resolution: SeedanceResolution; durationSeconds: number },
  videoPath: string,
  task: TaskStatus,
  taskId: string,
): SeedanceGenerationResponse {
  recordVideoTokens(task.usage?.completion_tokens);
  return {
    success: true,
    videoPath,
    prompt: request.prompt,
    model: request.model,
    ratio: task.ratio ?? request.ratio,
    resolution: task.resolution ?? request.resolution,
    duration: task.duration ?? request.durationSeconds,
    durationSource: task.duration !== undefined ? 'provider_reported' : 'requested_seconds',
    completionTokens: task.usage?.completion_tokens,
    taskId,
  };
}

/** Before the POST nothing was sent; after it, only an explicit rejection proves no task exists. */
function toFailure(error: unknown, posted: boolean): SeedanceGenerationResponse {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Seedance] Error: ${message}`);
  return { success: false, error: message, terminal: !posted || (error as { terminal?: unknown })?.terminal === true };
}

// ── The 3 generation functions ──────────────────────────────────────

/** Generate video from a text prompt */
export async function generateFromText(
  request: SeedanceText2VideoRequest,
): Promise<SeedanceGenerationResponse> {
  const apiKey = requireArkKey();
  let posted = false;
  try {
    console.error(`[Seedance] Starting text-to-video generation... (model: ${request.model})`);
    posted = true;
    const taskId = await createTask(apiKey, buildBody(request, []));
    recordVideoSubmission(taskId);

    const saved = await awaitVideoAndSave(
      apiKey,
      taskId,
      request.outputPath || process.cwd(),
      request.filename || `video_${Date.now()}.mp4`,
    );
    if ('error' in saved) return { success: false, error: saved.error, terminal: saved.terminal === true, taskId };

    return toResponse(request, saved.videoPath, saved.task, taskId);
  } catch (error) {
    return toFailure(error, posted);
  }
}

/** Generate video from an image (first frame · first+last frame interpolation) */
export async function generateFromImage(
  request: SeedanceImg2VideoRequest,
): Promise<SeedanceGenerationResponse> {
  const apiKey = requireArkKey();
  let posted = false;
  try {
    const paths = [request.sourceImagePath, ...(request.lastImagePath ? [request.lastImagePath] : [])];
    const uris = loadImages(paths);
    const images: ContentPart[] = uris.map((url, index) => ({
      type: 'image_url',
      image_url: { url },
      role: index === 0 ? 'first_frame' : 'last_frame',
    }));

    console.error(`[Seedance] Starting image-to-video generation... (model: ${request.model})`);
    console.error(`[Seedance] First frame: ${request.sourceImagePath}`);
    if (request.lastImagePath) console.error(`[Seedance] Last frame: ${request.lastImagePath}`);

    posted = true;
    const taskId = await createTask(apiKey, buildBody(request, images));
    recordVideoSubmission(taskId);

    const saved = await awaitVideoAndSave(
      apiKey,
      taskId,
      request.outputPath || process.cwd(),
      request.filename || `video_${Date.now()}.mp4`,
    );
    if ('error' in saved) return { success: false, error: saved.error, terminal: saved.terminal === true, taskId };

    return {
      ...toResponse(request, saved.videoPath, saved.task, taskId),
      sourceImage: request.sourceImagePath,
      lastImage: request.lastImagePath,
    };
  } catch (error) {
    return toFailure(error, posted);
  }
}

/** Generate video with subject consistency from reference images and audio (Dreamina Seedance 2.x only) */
export async function generateWithReferences(
  request: SeedanceReferenceRequest,
): Promise<SeedanceGenerationResponse> {
  const apiKey = requireArkKey();
  let posted = false;
  try {
    const spec = SEEDANCE_MODEL_SPECS[request.model];
    const imageUris = loadImages(request.referenceImagePaths);
    const audioUris = loadReferenceAudio(request.referenceAudioPaths);
    assertRequestBudget([...imageUris, ...audioUris]);
    if (audioUris.length > 0) {
      await checkReferenceAudioDurations(request.referenceAudioPaths, spec.referenceAudio, request.model);
    }
    let referenceVideoSeconds = 0;
    if (request.referenceVideoPaths.length > 0) {
      referenceVideoSeconds = await checkReferenceVideos(request.referenceVideoPaths, spec.referenceVideos, request.model);
    }
    // A URL clip cannot be probed; it is counted at the output length toward the model total
    // (the ledger's assumption too), so a local+URL mix over the cap fails here, not in the queue.
    if (request.referenceVideoUrls.length > 0) {
      const assumed = request.referenceVideoUrls.length * request.durationSeconds;
      if (referenceVideoSeconds + assumed > spec.referenceVideos.totalSeconds) {
        throw new Error(
          `Reference videos total at least ${(referenceVideoSeconds + assumed).toFixed(1)}s (URL clips counted at ${request.durationSeconds}s each) — ${request.model} allows ${spec.referenceVideos.totalSeconds}s across all clips.`,
        );
      }
    }

    // The vendor reads a video from a public URL only, so local previz clips are published
    // for the life of the task and released once it settles (media-publish.ts).
    const published = await publishFiles(request.referenceVideoPaths);
    try {
      const videoUrls = [...published.urls, ...request.referenceVideoUrls];

      // Images, then videos, then audio. The prompt's @Image N / @Video N / @Audio N count
      // each kind in its own upload order, so the caller's binding sentence ("Images 1-2 are
      // Character 1 and correspond to Audio 1") reads straight off the arrays.
      const parts: ContentPart[] = [
        ...imageUris.map((url): ContentPart => ({ type: 'image_url', image_url: { url }, role: 'reference_image' })),
        ...videoUrls.map((url): ContentPart => ({ type: 'video_url', video_url: { url }, role: 'reference_video' })),
        ...audioUris.map((url): ContentPart => ({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' })),
      ];

      console.error(`[Seedance] Starting reference-to-video generation... (model: ${request.model})`);
      if (imageUris.length > 0) console.error(`[Seedance] Reference images: ${request.referenceImagePaths.join(', ')}`);
      if (videoUrls.length > 0) console.error(`[Seedance] Reference videos: ${[...request.referenceVideoPaths, ...request.referenceVideoUrls].join(', ')}`);
      if (audioUris.length > 0) console.error(`[Seedance] Reference audio: ${request.referenceAudioPaths.join(', ')}`);

      posted = true;
      const taskId = await createTask(apiKey, buildBody(request, parts));
      recordVideoSubmission(taskId);

      const saved = await awaitVideoAndSave(
        apiKey,
        taskId,
        request.outputPath || process.cwd(),
        request.filename || `video_ref_${Date.now()}.mp4`,
      );
      if ('error' in saved) return { success: false, error: saved.error, terminal: saved.terminal === true, taskId };

      return {
        ...toResponse(request, saved.videoPath, saved.task, taskId),
        referenceImages: request.referenceImagePaths,
        referenceAudios: request.referenceAudioPaths,
        ...(videoUrls.length > 0
          ? {
              referenceVideos: [...request.referenceVideoPaths, ...request.referenceVideoUrls],
              referenceVideoSeconds,
              ...(published.urls.length > 0 ? { referenceVideoRoute: published.how } : {}),
            }
          : {}),
      };
    } finally {
      await published.close();
    }
  } catch (error) {
    return toFailure(error, posted);
  }
}
