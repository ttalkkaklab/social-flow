/**
 * The official hosted LTX API (docs/research/2026-11-18-video-model-api-schemas/ltx-2.5-pro.md),
 * not the self-hosted ASTRA box or local MLX. LTX-2.5 has no voice reference: image-to-video
 * renders silent cuts, audio-to-video takes the pinned TTS track (the supplied voice lane).
 */
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { config } from './config.js';
import { bareFilenameSchema } from './media-utils.js';
import { dataUri, runVendorJob, vendorJson, type VendorPoll, type VendorResult } from './vendor-video.js';

export const LTX_API_BASE_URL = 'https://api.ltx.io';
export const LTX_API_MODELS = ['ltx-2-5-pro', 'ltx-2-5-fast'] as const;
export const LTX_API_RESOLUTIONS: Record<string, string[]> = {
  '720p': ['1280x720', '720x1280', '720x720', '1080x720', '720x1080'],
  '1080p': ['1920x1080', '1080x1920', '1080x1080', '1620x1080', '1080x1620'],
  '1440p': ['2560x1440', '1440x2560', '1440x1440', '2160x1440', '1440x2160'],
  '4k': ['3840x2160', '2160x3840', '2160x2160', '3240x2160', '2160x3240'],
};
export const ltxApiTier = (resolution: string) => Object.entries(LTX_API_RESOLUTIONS).find(([, sizes]) => sizes.includes(resolution))?.[0];
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp'], AUDIO_EXT = ['.wav', '.mp3', '.m4a', '.ogg'];
/** Whole-second lengths the image endpoint takes for a model, resolution and frame rate. */
export function ltxApiSeconds(model: string, resolution: string, fps = 24): number[] {
  const long = model === 'ltx-2-5-fast' && ['720p', '1080p'].includes(ltxApiTier(resolution) ?? '') && fps <= 25;
  return long ? [6, 8, 10, 12, 14, 16, 18, 20] : [6, 8, 10];
}
/** Longest supplied audio for audio-to-video. */
export const ltxApiAudioMax = (model: string, resolution: string) =>
  model === 'ltx-2-5-fast' && ['720p', '1080p'].includes(ltxApiTier(resolution) ?? '') ? 20 : 10;

const common = {
  prompt: z.string().max(5000).describe('English action, camera and sound.'),
  model: z.enum(LTX_API_MODELS).default('ltx-2-5-pro').describe('LTX API model id.'),
  resolution: z.string().refine(value => Boolean(ltxApiTier(value)), 'Use a WIDTHxHEIGHT the LTX API lists, e.g. 1920x1080').default('1920x1080').describe('Output size, e.g. 1920x1080 or 1080x1920.'),
  fps: z.union([z.literal(24), z.literal(25), z.literal(48), z.literal(50)]).default(24).describe('Frame rate.'),
  cameraMotion: z.enum(['dolly_in', 'dolly_out', 'dolly_left', 'dolly_right', 'jib_up', 'jib_down', 'static', 'focus_shift']).optional().describe('Optional preset camera move.'),
  sourceImagePath: z.string().min(1).describe('First frame image (PNG/JPEG/WEBP, 7 MB inline).'),
  lastImagePath: z.string().min(1).optional().describe('Optional last frame image.'),
  outputPath: z.string().optional().describe('Output directory.'),
  filename: bareFilenameSchema('video').optional().describe('MP4 filename.'),
};
export const ltxApiImg2VideoSchema = z.object({ ...common,
  prompt: common.prompt.min(1),
  durationSeconds: z.number().int().default(6).describe('6, 8 or 10 seconds (Fast at 720p/1080p, 24/25 fps: up to 20).'),
  generateAudio: z.boolean().default(false).describe('Generate a soundtrack; false for cuts whose sound comes from assembly.'),
}).strict().superRefine((v, ctx) => {
  if (!ltxApiSeconds(v.model, v.resolution, v.fps).includes(v.durationSeconds))
    ctx.addIssue({ code: 'custom', path: ['durationSeconds'], message: `${v.model} at ${v.resolution}/${v.fps} fps takes ${ltxApiSeconds(v.model, v.resolution, v.fps).join(', ')} seconds` });
});
export const ltxApiAudio2VideoSchema = z.object({ ...common,
  sourceImagePath: common.sourceImagePath.optional(),
  prompt: common.prompt.default(''),
  audioPath: z.string().min(1).describe('The composed pinned-voice track; its length sets the clip length (2–10 s, Fast at 720p/1080p up to 20 s).'),
}).strict().superRefine((args, ctx) => {
  if (!args.sourceImagePath && (!args.prompt.trim() || args.lastImagePath))
    ctx.addIssue({ code: 'custom', path: ['sourceImagePath'], message: 'A first image is required with a last image or an empty prompt' });
});
export type LtxApiImg2VideoRequest = z.infer<typeof ltxApiImg2VideoSchema>;
export type LtxApiAudio2VideoRequest = z.infer<typeof ltxApiAudio2VideoSchema>;

export function ltxApiAudioSeconds(file: string): number {
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', timeout: 15_000 }));
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Cannot read the length of ' + file);
  return seconds;
}

/** The wire body; planning calls it too so size and length problems surface before money is reserved. */
export function buildLtxApiBody(request: LtxApiImg2VideoRequest | LtxApiAudio2VideoRequest): { endpoint: string; body: Record<string, unknown> } {
  const image = (file: string) => dataUri(file, IMAGE_EXT, 7 * 1048576);
  const body: Record<string, unknown> = { model: request.model, resolution: request.resolution, fps: request.fps,
    prompt: request.prompt, ...(request.sourceImagePath ? { image_uri: image(request.sourceImagePath) } : {}),
    ...(request.lastImagePath ? { last_frame_uri: image(request.lastImagePath) } : {}),
    ...(request.cameraMotion ? { camera_motion: request.cameraMotion } : {}) };
  if ('audioPath' in request) {
    const seconds = ltxApiAudioSeconds(request.audioPath), max = ltxApiAudioMax(request.model, request.resolution);
    if (seconds < 2 || seconds > max) throw new Error(`${request.model} at ${request.resolution} takes 2–${max} s of audio; ${request.audioPath} runs ${seconds.toFixed(2)} s`);
    body.audio_uri = dataUri(request.audioPath, AUDIO_EXT, 15 * 1048576);
  } else Object.assign(body, { duration: request.durationSeconds, generate_audio: request.generateAudio });
  if (JSON.stringify(body).length > 32 * 1048576) throw new Error('LTX request body exceeds 32 MB; use smaller frames or audio');
  return { endpoint: 'audioPath' in request ? 'audio-to-video' : 'image-to-video', body };
}

export function ltxApiStatus(json: Record<string, unknown>): VendorPoll {
  const status = json.status, result = json.result as { video_url?: string } | undefined;
  if (status === 'completed') return result?.video_url ? { state: 'done', url: result.video_url } : { state: 'failed', error: 'completed without result.video_url' };
  if (status === 'failed') return { state: 'failed', error: (json.error as { message?: string } | undefined)?.message ?? 'failed' };
  return { state: 'running' };
}

export async function pollLtxApi(endpoint: 'audio-to-video' | 'image-to-video', id: string) {
  return ltxApiStatus(await vendorJson(LTX_API_BASE_URL + '/v2/' + endpoint + '/' + encodeURIComponent(id),
    { headers: { Authorization: 'Bearer ' + config.ltxApiKey, 'Content-Type': 'application/json' } }));
}

export async function generateLtxApiVideo(request: LtxApiImg2VideoRequest | LtxApiAudio2VideoRequest): Promise<VendorResult> {
  if (!config.ltxApiKey) return { success: false, error: 'LTX_API_KEY is not set', terminal: true };
  const headers = { Authorization: `Bearer ${config.ltxApiKey}`, 'Content-Type': 'application/json' };
  let built: ReturnType<typeof buildLtxApiBody>;
  try { built = buildLtxApiBody(request); }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error), terminal: true }; }
  return runVendorJob({
    vendor: 'LTX API', outputPath: request.outputPath ?? process.cwd(), filename: request.filename ?? `ltx-${Date.now()}.mp4`, intervalMs: 6000, maxPolls: 300,
    submit: async () => {
      const json = await vendorJson(`${LTX_API_BASE_URL}/v2/${built.endpoint}`, { method: 'POST', headers, body: JSON.stringify(built.body), timeoutMs: 5 * 60_000 });
      if (typeof json.id !== 'string' || !json.id) throw new Error('No job id in LTX response');
      return json.id;
    },
    poll: id => pollLtxApi('audioPath' in request ? 'audio-to-video' : 'image-to-video', id),
  });
}
