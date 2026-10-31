/**
 * MLX Core / mlx-serve HTTP client.
 *
 * Talks to the local mlx-serve process that the MLX Core macOS menu-bar app
 * wraps (default http://127.0.0.1:11234). This is not Apple's mlx.core array
 * library, and it is not a second MCP server — skills call
 * mcp__social-flow__mlx_* and this module is the HTTP client inside this plugin.
 *
 * Never auto-launches the GUI. Connection refused fails closed with an install
 * hint. POST /v1/load-model never sends default:true — that would steal the
 * chat model the app is serving.
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { validateMlxImageOperation } from './image-models.js';
import { readImageMetadata } from './image-media.js';
import { mlxServeApiKey, mlxServeUrl } from './config.js';
import { requestBytes, requestRaw } from './http.js';
import { bareFilenameSchema, pcmToWav, resolveOutputFile, saveAudioFile, saveMediaFile } from './media-utils.js';

export const MLX_HEALTH_TIMEOUT_MS = 3_000;
export const MLX_MODELS_TIMEOUT_MS = 10_000;
export const MLX_LOAD_TIMEOUT_MS = 10 * 60_000;
export const MLX_IMAGE_TIMEOUT_MS = 15 * 60_000;
export const MLX_MUSIC_TIMEOUT_MS = 10 * 60_000;
export const MLX_VIDEO_TIMEOUT_MS = 20 * 60_000;
export const MLX_MESH_TIMEOUT_MS = 15 * 60_000;

/** Node heap ceiling for decoded RGB — 1088×1920×8s at 24fps is ~1.2GB and is refused. */
export const MAX_VIDEO_RGB_BYTES = 800 * 1024 * 1024;

export const MLX_IMAGE_DIMENSION_STEP = 16;
export const MIN_MLX_IMAGE_DIMENSION = 256;
export const MAX_MLX_IMAGE_DIMENSION = 2048;
export const DEFAULT_MLX_IMAGE_SIZE = 1024;

/** Two-stage LTX runs on a 64px grid; one_stage accepts 32. mlx-serve itself takes 32. */
export const MLX_VIDEO_DIMENSION_STEP = 64;
export const MLX_VIDEO_DIMENSION_STEP_ONE_STAGE = 32;
export const MIN_MLX_VIDEO_DIMENSION = 256;
export const MAX_MLX_VIDEO_DIMENSION = 1920;
export const DEFAULT_MLX_VIDEO_WIDTH = 768;
export const DEFAULT_MLX_VIDEO_HEIGHT = 1280;
export const DEFAULT_MLX_VIDEO_FRAMES = 49;
export const MIN_MLX_VIDEO_FRAMES = 9;
export const MAX_MLX_VIDEO_FRAMES = 241;
/** LTX frame counts are 8k+1 (9, 17, …, 241). mlx-serve silently falls back on any other value. */
export const MLX_VIDEO_FRAME_STEP = 8;
export const MLX_VIDEO_FPS = 24;

export const MIN_MLX_MUSIC_SECONDS = 10;
export const MAX_MLX_MUSIC_SECONDS = 600;
export const DEFAULT_MLX_MUSIC_SECONDS = 30;

export const MAX_MLX_IMAGE_REFS = 9; // Qwen 2.1; other known packs allow 3 extra references.

export type MlxCapability = 'image' | 'audio' | 'music' | 'video' | '3d';

export interface MlxModel {
  id: string;
  state?: string;
  capabilities?: string[];
}

export interface MlxFileResult {
  success: boolean;
  error?: string;
  path?: string;
  model?: string;
  elapsedSeconds?: number;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
  durationSeconds?: number;
  frames?: number;
  fps?: number;
  hasAudio?: boolean;
}

function authHeaders(): Record<string, string> {
  const key = mlxServeApiKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

function isUnreachable(status: number, body: string): boolean {
  return status === 502 || status === 504 || /ECONNREFUSED|fetch failed|Upstream unreachable/i.test(body);
}

/** Install/start hint — this plugin never launches the app. */
export function mlxDownHint(detail?: string): string {
  return (
    `MLX Core is not reachable at ${mlxServeUrl()}. This plugin does not launch the app.\n` +
    `Install the macOS menu-bar app (Apple Silicon, macOS 26.2+) and start it, or run mlx-serve --serve:\n` +
    `  brew install --cask mlx-core\n` +
    `If the server is on another host or port, set MLX_SERVE_URL.\n` +
    `Loopback needs no API key; a non-loopback bind may need MLX_SERVE_API_KEY.\n` +
    (detail ? `\n${detail}` : '')
  );
}

function translateUpstream(body: string): string {
  if (/out of memory|OOM|not enough.*RAM|insufficient memory/i.test(body)) {
    return (
      `${body}\n\n` +
      `The loaded media model and the chat model share one GPU. Unload a large chat ` +
      `or video model in MLX Core, or stop a concurrent Z-Image (mflux) run — Z-Image ` +
      `peaks at 32–39GB and LTX wants 24GB+ on its own.`
    );
  }
  return body;
}

const imageDimension = z
  .number()
  .int()
  .min(MIN_MLX_IMAGE_DIMENSION)
  .max(MAX_MLX_IMAGE_DIMENSION)
  .refine((v) => v % MLX_IMAGE_DIMENSION_STEP === 0, {
    message: `width/height must be a multiple of ${MLX_IMAGE_DIMENSION_STEP} (for 9:16 that's 1088×1920, not 1080×1920). Model and installed backend may impose additional size constraints.`,
  });

const videoDimension = z
  .number()
  .int()
  .min(MIN_MLX_VIDEO_DIMENSION)
  .max(MAX_MLX_VIDEO_DIMENSION)
  .refine((v) => v % MLX_VIDEO_DIMENSION_STEP_ONE_STAGE === 0, {
    message: `width/height must be a multiple of ${MLX_VIDEO_DIMENSION_STEP_ONE_STAGE} (LTX grid), and of ${MLX_VIDEO_DIMENSION_STEP} unless you pass pipeline:"one_stage". 1080 is on neither grid — use 1088×1920 or the default 768×1280.`,
  });

export const mlxImageGenerateSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(32_000),
  model: z.string().min(1).optional(),
  transparent: z.boolean().optional(),
  width: imageDimension.optional().default(DEFAULT_MLX_IMAGE_SIZE),
  height: imageDimension.optional().default(DEFAULT_MLX_IMAGE_SIZE),
  steps: z.number().int().min(1).max(100).optional(),
  seed: z.number().int().min(0).optional(),
  imagePath: z.string().min(1).optional(),
  strength: z.number().min(0).max(1).optional(),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('image').optional(),
}).superRefine((value, ctx) => {
  if ((value.width === undefined) !== (value.height === undefined)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Send width and height together' });
  if (value.model) {
    try { validateMlxImageOperation(value.model, 'imagePath' in value && value.imagePath ? ('refImagePaths' in value ? 'edit' : 'variation') : 'text', value); }
    catch (error) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: String(error) }); }
  }
});

export const mlxImageEditSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(32_000),
  imagePath: z.string().min(1, 'imagePath is required'),
  refImagePaths: z.array(z.string().min(1)).max(MAX_MLX_IMAGE_REFS).optional(),
  model: z.string().min(1).optional(),
  transparent: z.boolean().optional(),
  width: imageDimension.optional(),
  height: imageDimension.optional(),
  steps: z.number().int().min(1).max(100).optional(),
  seed: z.number().int().min(0).optional(),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('image').optional(),
}).superRefine((value, ctx) => {
  if ((value.width === undefined) !== (value.height === undefined)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Send width and height together' });
  if (value.model) {
    try { validateMlxImageOperation(value.model, 'edit', value); }
    catch (error) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: String(error) }); }
  }
});

export const mlxMusicGenerateSchema = z
  .object({
    prompt: z.string().min(1, 'Prompt is required').max(4_000),
    model: z.string().min(1).optional(),
    lyrics: z.string().max(8_000).optional(),
    instrumental: z.boolean().optional().default(true),
    durationSeconds: z
      .number()
      .int()
      .min(MIN_MLX_MUSIC_SECONDS)
      .max(MAX_MLX_MUSIC_SECONDS)
      .optional()
      .default(DEFAULT_MLX_MUSIC_SECONDS),
    seed: z.number().int().min(0).optional(),
    refAudioPath: z.string().min(1).optional(),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('audio').optional(),
  })
  .superRefine((value, ctx) => {
    if (value.instrumental && value.lyrics && value.lyrics.trim().length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'instrumental:true cannot be sent beside lyrics — mlx-serve returns 400. Set instrumental false to sing, or drop lyrics for a bed.',
      });
    }
  });

export const mlxVideoGenerateSchema = z
  .object({
    prompt: z.string().min(1, 'Prompt is required').max(32_000),
    model: z.string().min(1).optional(),
    width: videoDimension.optional().default(DEFAULT_MLX_VIDEO_WIDTH),
    height: videoDimension.optional().default(DEFAULT_MLX_VIDEO_HEIGHT),
    numFrames: z
      .number()
      .int()
      .min(MIN_MLX_VIDEO_FRAMES)
      .max(MAX_MLX_VIDEO_FRAMES)
      .optional()
      .default(DEFAULT_MLX_VIDEO_FRAMES),
    steps: z.number().int().min(1).max(50).optional(),
    seed: z.number().int().min(0).optional(),
    firstFrameImagePath: z.string().min(1).optional(),
    lastFrameImagePath: z.string().min(1).optional(),
    pipeline: z.enum(['one_stage', 'two_stage', 'two_stage_hq']).optional(),
    decoder: z.enum(['conv', 'diffusion']).optional(),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('video').optional(),
  })
  .superRefine((value, ctx) => {
    if (videoExceedsMemory(value.width, value.height, value.numFrames)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: videoMemoryMessage(value.width, value.height, value.numFrames),
      });
    }
    // The 32px grid is a one_stage-only relaxation: the server default pipeline is two-stage.
    if (value.pipeline !== 'one_stage') {
      for (const [field, size] of [['width', value.width], ['height', value.height]] as const) {
        if (size % MLX_VIDEO_DIMENSION_STEP !== 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} ${size} is off the two-stage LTX grid (multiple of ${MLX_VIDEO_DIMENSION_STEP}). Pass pipeline:"one_stage" to use the ${MLX_VIDEO_DIMENSION_STEP_ONE_STAGE}px grid, or round to ${Math.round(size / MLX_VIDEO_DIMENSION_STEP) * MLX_VIDEO_DIMENSION_STEP}.`,
          });
        }
      }
    }
    if ((value.numFrames - 1) % MLX_VIDEO_FRAME_STEP !== 0) {
      const below = value.numFrames - ((value.numFrames - 1) % MLX_VIDEO_FRAME_STEP);
      const above = below + MLX_VIDEO_FRAME_STEP;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['numFrames'],
        message: `numFrames must be ${MLX_VIDEO_FRAME_STEP}k+1 (${MIN_MLX_VIDEO_FRAMES}, 17, 25, … ${MAX_MLX_VIDEO_FRAMES}) — LTX latent depth. ${value.numFrames} is not, and mlx-serve answers 200 with its own default instead of refusing. Use ${below} or ${Math.min(above, MAX_MLX_VIDEO_FRAMES)}.`,
      });
    }
  });

export const mlx3dGenerateSchema = z.object({
  imagePath: z.string().min(1, 'imagePath is required'),
  model: z.string().min(1).optional(),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('mesh').optional(),
});

export type MlxImageGenerateRequest = z.infer<typeof mlxImageGenerateSchema>;
export type MlxImageEditRequest = z.infer<typeof mlxImageEditSchema>;
export type MlxMusicGenerateRequest = z.infer<typeof mlxMusicGenerateSchema>;
export type MlxVideoGenerateRequest = z.infer<typeof mlxVideoGenerateSchema>;
export type Mlx3dGenerateRequest = z.infer<typeof mlx3dGenerateSchema>;

export function videoRgbBytes(width: number, height: number, frames: number): number {
  return width * height * frames * 3;
}

export function videoExceedsMemory(width: number, height: number, frames: number): boolean {
  return videoRgbBytes(width, height, frames) > MAX_VIDEO_RGB_BYTES;
}

export function videoMemoryMessage(width: number, height: number, frames: number): string {
  const mb = (videoRgbBytes(width, height, frames) / (1024 * 1024)).toFixed(0);
  const cap = (MAX_VIDEO_RGB_BYTES / (1024 * 1024)).toFixed(0);
  return (
    `Decoded RGB would be ~${mb}MB (${width}×${height}×${frames}×3), over the ${cap}MB cap. ` +
    `Drop frames or canvas — 1088×1920 at 8s/24fps is ~1.2GB and is refused. ` +
    `The default 768×1280×${DEFAULT_MLX_VIDEO_FRAMES} stays under the cap.`
  );
}

export function pickModel(models: MlxModel[], capability: MlxCapability): MlxModel | undefined {
  const has = (m: MlxModel) => (m.capabilities ?? []).includes(capability);
  return models.find((m) => m.state === 'ready' && has(m)) ?? models.find(has);
}

function fileToBase64(filePath: string): { ok: true; b64: string } | { ok: false; error: string } {
  if (!existsSync(filePath)) return { ok: false, error: `File not found: ${filePath}` };
  try {
    return { ok: true, b64: readFileSync(filePath).toString('base64') };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function parseModelsBody(body: string): MlxModel[] {
  const parsed: unknown = JSON.parse(body);
  const list = parsed && typeof parsed === 'object' && 'data' in parsed ? (parsed as { data: unknown }).data : parsed;
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      id: String(entry.id ?? entry.name ?? ''),
      state: typeof entry.state === 'string' ? entry.state : undefined,
      capabilities: Array.isArray(entry.capabilities) ? entry.capabilities.map(String) : undefined,
    }))
    .filter((entry) => entry.id.length > 0);
}

export async function mlxHealth(): Promise<{ ok: boolean; error?: string }> {
  const res = await requestRaw('get', `${mlxServeUrl()}/health`, authHeaders(), undefined, MLX_HEALTH_TIMEOUT_MS);
  if (res.ok) return { ok: true };
  if (isUnreachable(res.status, res.body)) return { ok: false, error: mlxDownHint(res.body) };
  return { ok: false, error: mlxDownHint(`HTTP ${res.status}: ${res.body}`) };
}

export async function listMlxModels(): Promise<{ ok: boolean; models?: MlxModel[]; error?: string }> {
  const res = await requestRaw('get', `${mlxServeUrl()}/v1/models`, authHeaders(), undefined, MLX_MODELS_TIMEOUT_MS);
  if (!res.ok) {
    if (isUnreachable(res.status, res.body)) return { ok: false, error: mlxDownHint(res.body) };
    return { ok: false, error: translateUpstream(`HTTP ${res.status}: ${res.body}`) };
  }
  try {
    return { ok: true, models: parseModelsBody(res.body) };
  } catch (error) {
    return { ok: false, error: `Could not parse /v1/models: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function loadModel(id: string): Promise<{ ok: boolean; error?: string }> {
  // Never send default:true — that steals the chat model the app is serving.
  const res = await requestRaw(
    'post',
    `${mlxServeUrl()}/v1/load-model`,
    authHeaders(),
    { model: id },
    MLX_LOAD_TIMEOUT_MS,
  );
  if (!res.ok) {
    if (isUnreachable(res.status, res.body)) return { ok: false, error: mlxDownHint(res.body) };
    return { ok: false, error: translateUpstream(`load-model HTTP ${res.status}: ${res.body}`) };
  }
  const deadline = Date.now() + MLX_LOAD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const listed = await listMlxModels();
    if (!listed.ok) return listed;
    const found = listed.models?.find((m) => m.id === id);
    if (found?.state === 'ready') return { ok: true };
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return { ok: false, error: `Timed out waiting for model "${id}" to become ready.` };
}

async function resolveModel(capability: MlxCapability, requested?: string): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
  const listed = await listMlxModels();
  if (!listed.ok) return { ok: false, error: listed.error ?? mlxDownHint() };
  const models = listed.models ?? [];

  if (requested) {
    const found = models.find((m) => m.id === requested);
    if (!found) {
      const loaded = await loadModel(requested);
      if (!loaded.ok) {
        return {
          ok: false,
          error:
            loaded.error ??
            `Model "${requested}" is not in /v1/models. Download it in MLX Core and retry, or pass an id from GET /v1/models.`,
        };
      }
      return { ok: true, model: requested };
    }
    if (found.state !== 'ready') {
      const loaded = await loadModel(requested);
      if (!loaded.ok) return { ok: false, error: loaded.error ?? `Failed to load "${requested}".` };
    }
    return { ok: true, model: requested };
  }

  const picked = pickModel(models, capability);
  if (!picked) {
    return {
      ok: false,
      error:
        `No mlx-serve model advertises capability "${capability}". ` +
        `Open MLX Core, download a model in the matching pane (Image / Audio / Video / 3D), and retry. ` +
        `This plugin does not download weights.`,
    };
  }
  if (picked.state !== 'ready') {
    const loaded = await loadModel(picked.id);
    if (!loaded.ok) return { ok: false, error: loaded.error ?? `Failed to load "${picked.id}".` };
  }
  return { ok: true, model: picked.id };
}

export function parseImageResponse(body: string): { b64: string } | { error: string } {
  try {
    const parsed: unknown = JSON.parse(body);
    const data = parsed && typeof parsed === 'object' && 'data' in parsed ? (parsed as { data: unknown }).data : undefined;
    const first = Array.isArray(data) ? data[0] : undefined;
    const b64 =
      first && typeof first === 'object' && first !== null && 'b64_json' in first
        ? (first as { b64_json: unknown }).b64_json
        : undefined;
    if (typeof b64 !== 'string' || b64.length === 0) return { error: `Image response missing data[0].b64_json: ${body.slice(0, 400)}` };
    return { b64 };
  } catch (error) {
    return { error: `Could not parse image JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function parseVideoResponse(body: string):
  | { format: string; frames: number; height: number; width: number; fps: number; rgb: Buffer; audio?: { pcm: Buffer; sampleRate: number; channels: number } }
  | { error: string } {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object') return { error: 'Video response is not an object' };
    const d = parsed as Record<string, unknown>;
    if (d.format !== 'rgb8') return { error: `Unexpected video format "${String(d.format)}" (want rgb8)` };
    const frames = Number(d.frames);
    const height = Number(d.height);
    const width = Number(d.width);
    const fps = Number(d.fps) || MLX_VIDEO_FPS;
    if (![frames, height, width].every((n) => Number.isFinite(n) && n > 0)) {
      return { error: `Video response missing frames/height/width: ${body.slice(0, 200)}` };
    }
    if (typeof d.data !== 'string') return { error: 'Video response missing data (base64 rgb8)' };
    const rgb = Buffer.from(d.data, 'base64');
    const expect = frames * height * width * 3;
    if (rgb.length !== expect) return { error: `RGB length ${rgb.length} != ${expect} (${frames}×${height}×${width}×3)` };
    let audio: { pcm: Buffer; sampleRate: number; channels: number } | undefined;
    if (typeof d.audio_data === 'string' && d.audio_data.length > 0) {
      audio = {
        pcm: Buffer.from(d.audio_data, 'base64'),
        sampleRate: Number(d.audio_sample_rate) || 24_000,
        channels: Number(d.audio_channels) || 2,
      };
    }
    return { format: 'rgb8', frames, height, width, fps, rgb, audio };
  } catch (error) {
    return { error: `Could not parse video JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function parseGlbResponse(body: string): { b64: string } | { error: string } {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object') return { error: '3D response is not an object' };
    const d = parsed as Record<string, unknown>;
    if (typeof d.data !== 'string' || d.data.length === 0) return { error: `3D response missing data: ${body.slice(0, 400)}` };
    return { b64: d.data };
  } catch (error) {
    return { error: `Could not parse 3D JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function muxRgbToMp4(opts: {
  rgb: Buffer;
  width: number;
  height: number;
  frames: number;
  fps: number;
  audio?: { pcm: Buffer; sampleRate: number; channels: number };
  outFile: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'mlx-video-'));
  const rgbPath = join(dir, 'frames.rgb');
  const wavPath = join(dir, 'audio.wav');
  try {
    writeFileSync(rgbPath, opts.rgb);
    const args = [
      '-y',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      '-s', `${opts.width}x${opts.height}`,
      '-r', String(opts.fps),
      '-i', rgbPath,
    ];
    if (opts.audio) {
      writeFileSync(wavPath, pcmToWav(opts.audio.pcm, opts.audio.sampleRate, opts.audio.channels));
      args.push('-i', wavPath);
    }
    args.push(
      '-frames:v', String(opts.frames),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
    );
    // No -shortest: LTX audio comes back a frame shorter than the video (2.010s vs 2.042s at
    // 49/24fps), and -shortest would cut the last frame. -frames:v already fixes the length.
    if (opts.audio) args.push('-c:a', 'aac');
    args.push(opts.outFile);

    await new Promise<void>((resolve, reject) => {
      execFile('ffmpeg', args, { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 }, (error, _out, errOut) => {
        if (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'ENOENT') {
            reject(new Error('ffmpeg is not on PATH — mlx_video_generate muxes rgb8 frames to mp4 and needs ffmpeg.'));
            return;
          }
          reject(new Error(`${error.message}${errOut ? `\n${String(errOut).slice(-500)}` : ''}`));
          return;
        }
        resolve();
      });
    });
    if (!existsSync(opts.outFile)) return { ok: false, error: 'ffmpeg exited 0 but the mp4 was not written' };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function postImage(body: Record<string, unknown>, outFile: string): Promise<MlxFileResult> {
  if (existsSync(outFile)) return { success: false, error: `Output already exists; choose a new filename: ${outFile}` };
  const startedAt = Date.now();
  const res = await requestRaw('post', `${mlxServeUrl()}/v1/images/generations`, authHeaders(), body, MLX_IMAGE_TIMEOUT_MS);
  if (!res.ok) {
    if (isUnreachable(res.status, res.body)) return { success: false, error: mlxDownHint(res.body) };
    return { success: false, error: translateUpstream(`HTTP ${res.status}: ${res.body}`) };
  }
  const parsed = parseImageResponse(res.body);
  if ('error' in parsed) return { success: false, error: parsed.error };
  writeFileSync(outFile, Buffer.from(parsed.b64, 'base64'), { flag: 'wx' });
  return {
    success: true,
    path: outFile,
    ...readImageMetadata(outFile),
    model: typeof body.model === 'string' ? body.model : undefined,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
  };
}

export async function generateMlxImage(request: MlxImageGenerateRequest): Promise<MlxFileResult> {
  const health = await mlxHealth();
  if (!health.ok) return { success: false, error: health.error };
  const resolved = await resolveModel('image', request.model);
  if (!resolved.ok) return { success: false, error: resolved.error };
  validateMlxImageOperation(resolved.model, request.imagePath ? 'variation' : 'text', request);

  const body: Record<string, unknown> = {
    prompt: request.prompt,
    model: resolved.model,
    size: `${request.width}x${request.height}`,
  };
  if (request.transparent !== undefined) body.transparent = request.transparent;
  if (request.steps !== undefined) body.steps = request.steps;
  if (request.seed !== undefined) body.seed = request.seed;
  if (request.imagePath) {
    const img = fileToBase64(request.imagePath);
    if (!img.ok) return { success: false, error: img.error };
    body.image = img.b64;
    if (request.strength !== undefined) body.strength = request.strength;
  }

  const outFile = resolveOutputFile(
    request.outputPath || process.cwd(),
    request.filename || `mlx_image_${Date.now()}.png`,
    'image',
  );
  const result = await postImage(body, outFile);
  if (result.success) {

    // Requested steps are not measured execution metadata (e.g. Qwen Turbo schedule).
    result.seed = request.seed;
    result.model = resolved.model;
  }
  return result;
}

export async function editMlxImage(request: MlxImageEditRequest): Promise<MlxFileResult> {
  const health = await mlxHealth();
  if (!health.ok) return { success: false, error: health.error };
  const resolved = await resolveModel('image', request.model);
  if (!resolved.ok) return { success: false, error: resolved.error };
  validateMlxImageOperation(resolved.model, 'edit', request);

  const src = fileToBase64(request.imagePath);
  if (!src.ok) return { success: false, error: src.error };
  const refs: string[] = [];
  for (const path of request.refImagePaths ?? []) {
    const ref = fileToBase64(path);
    if (!ref.ok) return { success: false, error: ref.error };
    refs.push(ref.b64);
  }

  const body: Record<string, unknown> = {
    prompt: request.prompt,
    model: resolved.model,
    mode: 'edit',
    image: src.b64,
  };
  if (request.width && request.height) body.size = `${request.width}x${request.height}`;
  if (request.transparent !== undefined) body.transparent = request.transparent;
  if (request.steps !== undefined) body.steps = request.steps;
  if (request.seed !== undefined) body.seed = request.seed;
  if (refs.length) body.ref_images = refs;

  const outFile = resolveOutputFile(
    request.outputPath || process.cwd(),
    request.filename || `mlx_edit_${Date.now()}.png`,
    'image',
  );
  const result = await postImage(body, outFile);
  if (result.success) {
    result.model = resolved.model;

    // Requested steps are not measured execution metadata (e.g. Qwen Turbo schedule).
    result.seed = request.seed;
  }
  return result;
}

function wavLooksValid(buf: Buffer): boolean {
  return buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WAVE';
}

function jsonErrorFromBytes(bytes: Buffer, contentType: string, status: number): string | undefined {
  const asText = bytes.toString('utf8');
  if (contentType.includes('json') || asText.trimStart().startsWith('{')) {
    return translateUpstream(`HTTP ${status}: ${asText.slice(0, 1_000)}`);
  }
  if (!bytes.length) return `HTTP ${status}: empty body`;
  return undefined;
}

export async function generateMlxMusic(request: MlxMusicGenerateRequest): Promise<MlxFileResult> {
  const health = await mlxHealth();
  if (!health.ok) return { success: false, error: health.error };
  const resolved = await resolveModel('music', request.model);
  if (!resolved.ok) return { success: false, error: resolved.error };

  const body: Record<string, unknown> = {
    prompt: request.prompt,
    model: resolved.model,
    instrumental: request.instrumental,
    duration_seconds: request.durationSeconds,
  };
  if (request.lyrics !== undefined) body.lyrics = request.lyrics;
  if (request.seed !== undefined) body.seed = request.seed;
  if (request.refAudioPath) {
    const clip = fileToBase64(request.refAudioPath);
    if (!clip.ok) return { success: false, error: clip.error };
    body.ref_audio = clip.b64;
  }

  const startedAt = Date.now();
  const res = await requestBytes(
    'post',
    `${mlxServeUrl()}/v1/audio/music-generations`,
    authHeaders(),
    body,
    MLX_MUSIC_TIMEOUT_MS,
  );
  if (!res.ok) {
    const text = res.bytes.toString('utf8');
    if (isUnreachable(res.status, text)) return { success: false, error: mlxDownHint(text) };
    return { success: false, error: translateUpstream(`HTTP ${res.status}: ${text.slice(0, 1_000)}`) };
  }
  const jsonErr = jsonErrorFromBytes(res.bytes, res.contentType, res.status);
  if (jsonErr) return { success: false, error: jsonErr };
  if (!wavLooksValid(res.bytes)) {
    return { success: false, error: `Music response is not a WAV (got ${res.contentType || 'unknown type'}, ${res.bytes.length} bytes)` };
  }

  const outFile = saveAudioFile(
    request.outputPath || process.cwd(),
    request.filename || `mlx_music_${Date.now()}.wav`,
    res.bytes,
  );
  return {
    success: true,
    path: outFile,
    model: resolved.model,
    durationSeconds: request.durationSeconds,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
  };
}

export function buildLtxVideoBody(request: MlxVideoGenerateRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: request.prompt,
    model: request.model,
    width: request.width,
    height: request.height,
    num_frames: request.numFrames,
  };
  if (request.steps !== undefined) body.steps = request.steps;
  if (request.seed !== undefined) body.seed = request.seed;
  if (request.pipeline) body.pipeline = request.pipeline;
  if (request.decoder) body.decoder = request.decoder;
  if (request.firstFrameImagePath) {
    const img = fileToBase64(request.firstFrameImagePath);
    if (!img.ok) throw new Error(img.error);
    body.first_frame_image = img.b64;
  }
  if (request.lastFrameImagePath) {
    const img = fileToBase64(request.lastFrameImagePath);
    if (!img.ok) throw new Error(img.error);
    body.last_frame_image = img.b64;
  }

  return body;
}

/** Consume progress so long renders do not hit the HTTP client's idle-header timeout. */
export async function requestMlxVideo(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: string }> {
  const url = `${mlxServeUrl()}/v1/video/generations`;
  if (!body.stream) return requestRaw('post', url, authHeaders(), body, MLX_VIDEO_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(MLX_VIDEO_TIMEOUT_MS) });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream'))
      return { ok: response.ok, status: response.status, body: await response.text() };
    if (!response.body) throw new Error('Video progress stream has no body');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let parts: string[] = [], pendingBytes = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        const lines = decoder.decode(value, { stream: !done }).split('\n');
        for (const [index, fragment] of lines.entries()) {
          parts.push(fragment); pendingBytes += fragment.length;
          if (pendingBytes > Math.ceil(MAX_VIDEO_RGB_BYTES * 4 / 3) + 16 * 1024 * 1024)
            throw new Error('Video progress payload exceeds response limit');
          if (index === lines.length - 1) continue;
          const line = parts.join('').trimEnd(); parts = []; pendingBytes = 0;
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          const event = JSON.parse(payload) as { type?: string; message?: string };
          if (event.type === 'error') throw new Error(event.message || 'Video generation failed');
          if (event.type === 'complete') return { ok: true, status: response.status, body: payload };
        }
        if (done) throw new Error('Video stream ended before completion; do not automatically resubmit');
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: /fetch failed|ECONNREFUSED/i.test(message) ? 502 : 500, body: message };
  }
}

/** Shared MLX-Serve transport and muxing; model contracts own validation and serialization. */
export async function executeMlxVideo(
  request: { model?: string; outputPath?: string; filename?: string },
  body: Record<string, unknown>,
  acceptsModel?: (id: string) => boolean,
): Promise<MlxFileResult> {
  const health = await mlxHealth();
  if (!health.ok) return { success: false, error: health.error };
  let selected = request.model;
  if (acceptsModel) {
    if (selected && !acceptsModel(selected)) return { success: false, error: 'Model does not match the selected video adapter: ' + selected };
    if (!selected) {
      const listed = await listMlxModels();
      if (!listed.ok) return { success: false, error: listed.error };
      selected = pickModel((listed.models ?? []).filter(m => acceptsModel(m.id)), 'video')?.id;
      if (!selected) return { success: false, error: 'No installed model matches the selected video adapter' };
    }
  }
  const resolved = await resolveModel('video', selected);
  if (!resolved.ok) return { success: false, error: resolved.error };
  body.model = resolved.model;
  const startedAt = Date.now();
  const res = await requestMlxVideo(body);
  if (!res.ok) {
    if (isUnreachable(res.status, res.body)) return { success: false, error: mlxDownHint(res.body) };
    return { success: false, error: translateUpstream(`HTTP ${res.status}: ${res.body}`) };
  }
  const parsed = parseVideoResponse(res.body);
  if ('error' in parsed) return { success: false, error: parsed.error };
  if (acceptsModel && (parsed.width !== body.width || parsed.height !== body.height || parsed.frames !== body.num_frames || parsed.fps !== 24))
    return { success: false, error: 'Backend output geometry or frame count differs from the validated request' };

  const outFile = resolveOutputFile(
    request.outputPath || process.cwd(),
    request.filename || `video_${Date.now()}.mp4`,
    'video',
  );
  const muxed = await muxRgbToMp4({
    rgb: parsed.rgb,
    width: parsed.width,
    height: parsed.height,
    frames: parsed.frames,
    fps: parsed.fps,
    audio: parsed.audio,
    outFile,
  });
  if (!muxed.ok) return { success: false, error: muxed.error };
  return {
    success: true,
    path: outFile,
    model: resolved.model,
    width: parsed.width,
    height: parsed.height,
    frames: parsed.frames,
    fps: parsed.fps,
    hasAudio: Boolean(parsed.audio),
    durationSeconds: parsed.frames / parsed.fps,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
  };
}

/** Compatibility entry point for the original LTX client. */
export async function generateMlxVideo(request: MlxVideoGenerateRequest): Promise<MlxFileResult> {
  if (videoExceedsMemory(request.width, request.height, request.numFrames))
    return { success: false, error: videoMemoryMessage(request.width, request.height, request.numFrames) };
  return executeMlxVideo(request, buildLtxVideoBody(request));
}

export async function generateMlx3d(request: Mlx3dGenerateRequest): Promise<MlxFileResult> {
  const health = await mlxHealth();
  if (!health.ok) return { success: false, error: health.error };
  const resolved = await resolveModel('3d', request.model);
  if (!resolved.ok) return { success: false, error: resolved.error };

  const img = fileToBase64(request.imagePath);
  if (!img.ok) return { success: false, error: img.error };

  const startedAt = Date.now();
  const res = await requestRaw(
    'post',
    `${mlxServeUrl()}/v1/3d/generations`,
    authHeaders(),
    { image: img.b64, model: resolved.model },
    MLX_MESH_TIMEOUT_MS,
  );
  if (!res.ok) {
    if (isUnreachable(res.status, res.body)) return { success: false, error: mlxDownHint(res.body) };
    return { success: false, error: translateUpstream(`HTTP ${res.status}: ${res.body}`) };
  }
  const parsed = parseGlbResponse(res.body);
  if ('error' in parsed) return { success: false, error: parsed.error };

  const outFile = saveMediaFile(
    request.outputPath || process.cwd(),
    request.filename || `mlx_3d_${Date.now()}.glb`,
    Buffer.from(parsed.b64, 'base64'),
    'mesh',
  );
  return {
    success: true,
    path: outFile,
    model: resolved.model,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
  };
}
