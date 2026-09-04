/**
 * ByteDance Seedance video generation client (BytePlus ModelArk).
 *
 * The second video engine sharing the slot with Veo (video-client.ts). The two are
 * not substitutes but **tools for different situations** — when to use which is
 * governed by skills/produce/references/video-model-selection.md.
 *
 * - 7 models: Dreamina Seedance 2.5 / 2.0·fast·mini / Seedance 1.5 pro / 1.0 pro·fast
 * - Text-to-Video, Image-to-Video (first frame · first+last frame), reference images and
 *   reference audio (2.x only — a clip's voice timbre or dialogue content, `role: reference_audio`)
 * - 7 aspect ratios (9:16 included) · fixed 24fps · duration 2~30s (varies per model)
 * - Generation is async — POST creates a task, GET polls it, then the mp4 is downloaded
 *
 * Result URLs are **valid for 24 hours**, so we save locally as soon as polling
 * finishes and return only the path (same contract as the Veo client). We also
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
import {
  ALLOWED_EXTENSIONS,
  bareFilenameSchema,
  mimeFromExtension,
  resolveOutputFile,
  validateFilePath,
} from './media-utils.js';

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

export interface SeedanceModelSpec {
  /** Resolutions this model can output */
  resolutions: readonly SeedanceResolution[];
  /** Generation duration (seconds), lower and upper bound */
  duration: readonly [number, number];
  /** Whether first+last frame interpolation is supported */
  lastFrame: boolean;
  /** Reference image count range. false means reference images aren't supported at all */
  referenceImages: readonly [number, number] | false;
  /**
   * Reference audio (the omni reference lane — API reference 1520757, checked 2026-08-29).
   * What the clip carries is what the model imitates: a voice timbre, or dialogue and
   * music content it lip-syncs to. false means the model takes no audio references.
   */
  referenceAudio: SeedanceReferenceAudioSpec | false;
  /** Whether simultaneous audio generation (generate_audio) is supported. false means silent-only */
  audio: boolean;
  /** Whether seed·cameraFixed are supported (2.x has neither) */
  seed: boolean;
  /** Whether input images containing real human faces are accepted (2.x rejects them) */
  realFaceInput: boolean;
  /**
   * Whether activation requires **an account balance over $30 or a resource pack** —
   * this flags only the money gate.
   *
   * false does not mean "just works". **Every model** must first be enabled in the
   * console's Model activation, and calling one that isn't enabled fails task
   * creation with `ModelNotOpen` (measured with seedance-1-5-pro, 2026-08-15 — no
   * charge is incurred). First-time activation also demands TOS, VPC, and ML
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
    audio: true,
    seed: false,
    realFaceInput: false,
    activationGate: true,
  },
  'dreamina-seedance-2-0-260128': {
    resolutions: ['480p', '720p', '1080p', '4k'],
    duration: [4, 15],
    lastFrame: true,
    referenceImages: [1, 9],
    referenceAudio: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15, audioOnly: false },
    audio: true,
    seed: false,
    realFaceInput: false,
    activationGate: true,
  },
  'dreamina-seedance-2-0-fast-260128': {
    resolutions: ['480p', '720p'],
    duration: [4, 15],
    lastFrame: true,
    referenceImages: [1, 9],
    referenceAudio: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15, audioOnly: false },
    audio: true,
    seed: false,
    realFaceInput: false,
    activationGate: true,
  },
  'dreamina-seedance-2-0-mini-260615': {
    resolutions: ['480p', '720p'],
    duration: [4, 15],
    lastFrame: true,
    referenceImages: [1, 9],
    referenceAudio: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15, audioOnly: false },
    audio: true,
    seed: false,
    realFaceInput: false,
    activationGate: true,
  },
  'seedance-1-5-pro-251215': {
    resolutions: ['480p', '720p', '1080p'],
    duration: [4, 12],
    lastFrame: true,
    referenceImages: false,
    referenceAudio: false,
    audio: true,
    seed: true,
    realFaceInput: true,
    activationGate: false,
  },
  'seedance-1-0-pro-250528': {
    resolutions: ['480p', '720p', '1080p'],
    duration: [2, 12],
    lastFrame: true,
    referenceImages: false,
    referenceAudio: false,
    audio: false,
    seed: true,
    realFaceInput: true,
    activationGate: false,
  },
  'seedance-1-0-pro-fast-251015': {
    resolutions: ['480p', '720p', '1080p'],
    duration: [2, 12],
    lastFrame: false,
    referenceImages: false,
    referenceAudio: false,
    audio: false,
    seed: true,
    realFaceInput: true,
    activationGate: false,
  },
} as const satisfies Record<string, SeedanceModelSpec>;

export const VALID_SEEDANCE_MODELS = Object.keys(SEEDANCE_MODEL_SPECS) as Array<
  keyof typeof SEEDANCE_MODEL_SPECS
>;
export type SeedanceModel = (typeof VALID_SEEDANCE_MODELS)[number];

/**
 * Default model — Seedance 1.5 pro.
 *
 * Of the models that can produce this pipeline's default format (9:16 · 1080p)
 * today, it's the cheapest, accepts real-person inputs (2.x rejects them),
 * reproduces via seed, and has no balance gate.
 */
export const DEFAULT_SEEDANCE_MODEL: SeedanceModel = 'seedance-1-5-pro-251215';

/** Models that accept reference images (the 2.x family) — enum source of truth for seedance_reference */
export const SEEDANCE_REFERENCE_MODELS = VALID_SEEDANCE_MODELS.filter(
  (model) => SEEDANCE_MODEL_SPECS[model].referenceImages !== false,
);

/**
 * Default model for the reference tool — Dreamina Seedance 2.0.
 *
 * 2.5 has wider capabilities (30 reference images, 30 seconds) but **no quality
 * evidence** — it appears on none of the four Artificial Analysis blind-arena
 * boards, and ByteDance published no numeric benchmarks either (checked
 * 2026-08-15). 2.0 ranks #1 on that arena's image-to-video board (Elo 1,198 ·
 * sample 12,599) and also outputs 1080p/4K. The side with evidence gets to be
 * the default.
 *
 * It's pinned as a constant rather than picked from list order to remove the
 * coupling where inserting a model into the capability table silently changes
 * the default.
 */
export const DEFAULT_SEEDANCE_REFERENCE_MODEL: SeedanceModel = 'dreamina-seedance-2-0-260128';

/** Models that accept input images containing real people — the list the cover-background → b-roll lane can use */
export const SEEDANCE_REAL_FACE_MODELS = VALID_SEEDANCE_MODELS.filter(
  (model) => SEEDANCE_MODEL_SPECS[model].realFaceInput,
);

export const DEFAULT_SEEDANCE_RESOLUTION: SeedanceResolution = '720p';
export const DEFAULT_SEEDANCE_DURATION = 5; // the only common default that fits every model's duration range
export const SEEDANCE_FPS = 24; // fixed across all models

const POLL_INTERVAL_MS = 10_000;
const MAX_POLLS = 90; // 15-minute max wait — 2.5's 30s clips take longer than Veo
const MAX_INPUT_IMAGE_BYTES = 30 * 1024 * 1024; // per-image cap (official)
const MAX_REQUEST_BYTES = 64 * 1024 * 1024; // request body cap (official)
const MAX_INPUT_AUDIO_BYTES = 15 * 1024 * 1024; // per-clip cap for reference audio (official)

/** Formats the vendor accepts for reference audio — narrower than ALLOWED_EXTENSIONS.audio (no ogg·aac·flac) */
export const SEEDANCE_REFERENCE_AUDIO_EXTENSIONS = ['.wav', '.mp3'] as const;

// ── Shared schema pieces ────────────────────────────────────────────

const commonFields = {
  prompt: z.string().min(1, 'Prompt is required'),
  model: z.enum(VALID_SEEDANCE_MODELS as [SeedanceModel, ...SeedanceModel[]]).optional().default(DEFAULT_SEEDANCE_MODEL),
  resolution: z.enum(VALID_SEEDANCE_RESOLUTIONS).optional().default(DEFAULT_SEEDANCE_RESOLUTION),
  durationSeconds: z.number().int().optional().default(DEFAULT_SEEDANCE_DURATION),
  generateAudio: z.boolean().optional().default(false),
  watermark: z.boolean().optional().default(false),
  seed: z.number().int().min(-1).max(2147483647).optional(),
  cameraFixed: z.boolean().optional(),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('video').optional(),
};

type CommonInput = {
  prompt: string;
  model: SeedanceModel;
  resolution: SeedanceResolution;
  durationSeconds: number;
  generateAudio: boolean;
  seed?: number;
  cameraFixed?: boolean;
};

/**
 * Hangul outside quotation marks — the prompt language constraint.
 *
 * The prompt body reads Chinese or English on every model but
 * dreamina-seedance-2-5-260628. Korean **dialogue** works on 1.5 pro, which lip-syncs
 * it, so what a quote encloses is exempt; a Korean direction outside quotes is not
 * understood and silently degrades the shot rather than failing the call.
 */
const QUOTED_SEGMENT = /"[^"]*"|“[^”]*”|「[^」]*」/g;
const HANGUL_RUN = /[가-힣]+(?:[ \t]+[가-힣]+)*/;
function hangulOutsideQuotes(prompt: string): string | null {
  const match = prompt.replace(QUOTED_SEGMENT, ' ').match(HANGUL_RUN);
  return match ? match[0] : null;
}

/**
 * Model × resolution × duration × feature cross-constraint validation (per official docs).
 *
 * We reject before calling for the same reason Veo does — one generation takes
 * minutes, and a bad combination comes back as an async error that burns all of
 * that time. Rejecting here lets the model immediately retry with corrected
 * arguments.
 */
function validateCommon(data: CommonInput, ctx: z.RefinementCtx): void {
  const spec = SEEDANCE_MODEL_SPECS[data.model];

  if (data.model !== 'dreamina-seedance-2-5-260628') {
    const korean = hangulOutsideQuotes(data.prompt);
    if (korean) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prompt'],
        message: `${data.model} reads Chinese or English prompts only — the Korean "${korean}" sits outside quotation marks and would be ignored rather than obeyed. Write the direction in English; Korean dialogue belongs inside quotes (1.5 pro lip-syncs it), or route the shot to dreamina-seedance-2-5-260628.`,
      });
    }
  }

  if (!(spec.resolutions as readonly string[]).includes(data.resolution)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resolution'],
      message: `${data.model} does not support ${data.resolution} (supported: ${spec.resolutions.join(', ')}).`,
    });
  }

  const [minDuration, maxDuration] = spec.duration;
  if (data.durationSeconds < minDuration || data.durationSeconds > maxDuration) {
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
      message: `${data.model} is silent-only and cannot generate audio. If you need audio, use seedance-1-5-pro-251215 or later.`,
    });
  }

  if (!spec.seed) {
    if (data.seed !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['seed'],
        message: `${data.model} does not support seed (Seedance 1.5 pro·1.0 pro·1.0 pro fast only).`,
      });
    }
    if (data.cameraFixed !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cameraFixed'],
        message: `${data.model} does not support cameraFixed (Seedance 1.5 pro·1.0 pro·1.0 pro fast only). Direct a fixed camera through the prompt instead.`,
      });
    }
  }
}

// Text-to-Video request schema
export const seedanceText2VideoSchema = z
  .object({
    ...commonFields,
    ratio: z.enum(VALID_SEEDANCE_RATIOS).optional().default('16:9'),
  })
  .superRefine(validateCommon);

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
        message: `${data.model} accepts a first frame only — for first+last frame interpolation use seedance-1-0-pro-250528 or later.`,
      });
    }
  });

// Reference image request schema (2.x only — omni reference)
//
// This **overrides** model from the common fields. The default on the tool
// surface (JSON schema) is only guidance; what actually applies is the zod
// default here, so without the override the common default (1.5 pro) comes in
// and the superRefine below rejects it — every normal call that omits the
// argument fails. The narrowed enum also filters 1.x out before it reaches the
// validation below, which makes the message clearer too.
export const seedanceReferenceSchema = z
  .object({
    ...commonFields,
    model: z
      .enum(SEEDANCE_REFERENCE_MODELS as [SeedanceModel, ...SeedanceModel[]])
      .optional()
      .default(DEFAULT_SEEDANCE_REFERENCE_MODEL),
    referenceImagePaths: z.array(z.string()).optional().default([]),
    referenceAudioPaths: z.array(z.string()).optional().default([]),
    ratio: z.enum(VALID_SEEDANCE_RATIOS).optional().default('adaptive'),
  })
  .superRefine((data, ctx) => {
    validateCommon(data, ctx);
    const spec = SEEDANCE_MODEL_SPECS[data.model];
    if (spec.referenceImages === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['model'],
        message: `${data.model} does not support reference images. Use the Dreamina Seedance 2.5 or 2.0 family (${SEEDANCE_REFERENCE_MODELS.join(', ')}).`,
      });
      return;
    }
    const [, maxImages] = spec.referenceImages;
    if (data.referenceImagePaths.length > maxImages) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referenceImagePaths'],
        message: `${data.model} allows at most ${maxImages} reference images (requested: ${data.referenceImagePaths.length}).`,
      });
    }
    if (data.referenceImagePaths.length === 0 && data.referenceAudioPaths.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referenceImagePaths'],
        message: 'At least one reference is required — referenceImagePaths, referenceAudioPaths, or both.',
      });
      return;
    }
    if (data.referenceAudioPaths.length === 0) return;

    // Reference audio — the vendor fails these asynchronously, minutes later.
    // (Read through the interface so the `false` branch survives the literal
    // narrowing above — a 2.x model added without audio must land here, not in
    // a type error.)
    const audio = (spec as SeedanceModelSpec).referenceAudio;
    if (audio === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referenceAudioPaths'],
        message: `${data.model} does not take reference audio.`,
      });
      return;
    }
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
  });

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
  /** Token count the vendor bills on — this, not an estimated price conversion, is the actual billing basis */
  completionTokens?: number;
  taskId?: string;
  sourceImage?: string;
  lastImage?: string;
  referenceImages?: string[];
  referenceAudios?: string[];
}

// ── ModelArk REST contract ──────────────────────────────────────────

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string }; role?: string }
  | { type: 'audio_url'; audio_url: { url: string }; role: 'reference_audio' };

interface CreateTaskBody {
  model: string;
  content: ContentPart[];
  ratio: string;
  resolution: string;
  duration: number;
  generate_audio?: boolean;
  watermark: boolean;
  seed?: number;
  camera_fixed?: boolean;
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
  });

  if (!response.ok) {
    throw new Error(`Failed to create video task: ${describeHttpError(response.status, await response.text())}`);
  }

  const json = (await response.json()) as { id?: string };
  if (!json.id) throw new Error('No task id returned from ModelArk');
  return json.id;
}

async function getTask(apiKey: string, taskId: string): Promise<TaskStatus> {
  const response = await fetch(`${arkBaseUrl()}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
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
): Promise<{ videoPath: string; task: TaskStatus } | { error: string }> {
  for (let poll = 1; poll <= MAX_POLLS; poll += 1) {
    console.error(`[Seedance] Generation in progress... (polling ${poll}/${MAX_POLLS})`);
    await sleep(POLL_INTERVAL_MS);

    const task = await getTask(apiKey, taskId);

    if (task.status === 'failed' || task.status === 'expired' || task.status === 'cancelled') {
      const reason = task.error?.message || task.status;
      return { error: `Generation ${task.status}: ${reason}` };
    }
    if (task.status !== 'succeeded') continue;

    const videoUrl = task.content?.video_url;
    if (!videoUrl) return { error: 'Task succeeded but no video_url in response' };

    // Path validation (traversal·extension) happens before the download —
    // rejecting after receiving tens of MB wastes bandwidth, and the result URL
    // disappears after 24 hours so there's no retry either.
    const fullPath = resolveOutputFile(outputPath, filename, 'video');
    const download = await fetch(videoUrl);
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
    duration: request.durationSeconds,
    watermark: request.watermark,
  };
  // The vendor default for generate_audio is true. Passing it to a silent-only
  // model gets rejected, so we send it only to models that support it and flip
  // our own default to false — this pipeline attaches narration separately via
  // TTS, and enabling audio on 1.5 pro exactly doubles the price.
  if (spec.audio) body.generate_audio = request.generateAudio;
  if (spec.seed) {
    if (request.seed !== undefined) body.seed = request.seed;
    if (request.cameraFixed !== undefined) body.camera_fixed = request.cameraFixed;
  }
  return body;
}

/** Assemble the success response — the actual generation result (values the vendor returned) wins. */
function toResponse(
  request: { prompt: string; model: SeedanceModel; ratio: SeedanceRatio; resolution: SeedanceResolution; durationSeconds: number },
  videoPath: string,
  task: TaskStatus,
  taskId: string,
): SeedanceGenerationResponse {
  return {
    success: true,
    videoPath,
    prompt: request.prompt,
    model: request.model,
    ratio: task.ratio ?? request.ratio,
    resolution: task.resolution ?? request.resolution,
    duration: task.duration ?? request.durationSeconds,
    completionTokens: task.usage?.completion_tokens,
    taskId,
  };
}

function toFailure(error: unknown): SeedanceGenerationResponse {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Seedance] Error: ${message}`);
  return { success: false, error: message };
}

// ── The 3 generation functions ──────────────────────────────────────

/** Generate video from a text prompt */
export async function generateFromText(
  request: SeedanceText2VideoRequest,
): Promise<SeedanceGenerationResponse> {
  const apiKey = requireArkKey();
  try {
    console.error(`[Seedance] Starting text-to-video generation... (model: ${request.model})`);
    const taskId = await createTask(apiKey, buildBody(request, []));

    const saved = await awaitVideoAndSave(
      apiKey,
      taskId,
      request.outputPath || process.cwd(),
      request.filename || `video_${Date.now()}.mp4`,
    );
    if ('error' in saved) return { success: false, error: saved.error, taskId };

    return toResponse(request, saved.videoPath, saved.task, taskId);
  } catch (error) {
    return toFailure(error);
  }
}

/** Generate video from an image (first frame · first+last frame interpolation) */
export async function generateFromImage(
  request: SeedanceImg2VideoRequest,
): Promise<SeedanceGenerationResponse> {
  const apiKey = requireArkKey();
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

    const taskId = await createTask(apiKey, buildBody(request, images));

    const saved = await awaitVideoAndSave(
      apiKey,
      taskId,
      request.outputPath || process.cwd(),
      request.filename || `video_${Date.now()}.mp4`,
    );
    if ('error' in saved) return { success: false, error: saved.error, taskId };

    return {
      ...toResponse(request, saved.videoPath, saved.task, taskId),
      sourceImage: request.sourceImagePath,
      lastImage: request.lastImagePath,
    };
  } catch (error) {
    return toFailure(error);
  }
}

/** Generate video with subject consistency from reference images and audio (Dreamina Seedance 2.x only) */
export async function generateWithReferences(
  request: SeedanceReferenceRequest,
): Promise<SeedanceGenerationResponse> {
  const apiKey = requireArkKey();
  try {
    const spec = SEEDANCE_MODEL_SPECS[request.model];
    const imageUris = loadImages(request.referenceImagePaths);
    const audioUris = loadReferenceAudio(request.referenceAudioPaths);
    assertRequestBudget([...imageUris, ...audioUris]);
    if (audioUris.length > 0 && spec.referenceAudio !== false) {
      await checkReferenceAudioDurations(request.referenceAudioPaths, spec.referenceAudio, request.model);
    }

    // Images first, then audio. The prompt's @Image N / @Audio N count each kind in
    // its own upload order, so the caller's binding sentence ("Images 1-2 are
    // Character 1 and correspond to Audio 1") reads straight off the two arrays.
    const parts: ContentPart[] = [
      ...imageUris.map((url): ContentPart => ({ type: 'image_url', image_url: { url }, role: 'reference_image' })),
      ...audioUris.map((url): ContentPart => ({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' })),
    ];

    console.error(`[Seedance] Starting reference-to-video generation... (model: ${request.model})`);
    if (imageUris.length > 0) console.error(`[Seedance] Reference images: ${request.referenceImagePaths.join(', ')}`);
    if (audioUris.length > 0) console.error(`[Seedance] Reference audio: ${request.referenceAudioPaths.join(', ')}`);

    const taskId = await createTask(apiKey, buildBody(request, parts));

    const saved = await awaitVideoAndSave(
      apiKey,
      taskId,
      request.outputPath || process.cwd(),
      request.filename || `video_ref_${Date.now()}.mp4`,
    );
    if ('error' in saved) return { success: false, error: saved.error, taskId };

    return {
      ...toResponse(request, saved.videoPath, saved.task, taskId),
      referenceImages: request.referenceImagePaths,
      referenceAudios: request.referenceAudioPaths,
    };
  } catch (error) {
    return toFailure(error);
  }
}
