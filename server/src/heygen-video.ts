/**
 * HeyGen Video 1 (1eabc4fb:docs/research/2026-11-18-video-model-api-schemas/heygen-video-1.md).
 * POST /v3/models/videos with mode image_to_video or reference_to_video. Local files go up
 * through POST /v3/assets first (base64 images cap at 5 MB). Prompt enhancement is disabled so
 * compiled speaker bindings reach the model as written; that caps duration at 15 s.
 */
import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { z } from 'zod';
import { config } from './config.js';
import { bareFilenameSchema } from './media-utils.js';
import { mediaType, runVendorJob, vendorJson, type VendorPoll, type VendorResult } from './vendor-video.js';

export const HEYGEN_BASE_URL = 'https://api.heygen.com';
export const HEYGEN_MODEL = 'heygen-video-1';
export const HEYGEN_SECONDS = { min: 5, max: 15 };
export const HEYGEN_RATIOS = ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] as const;
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp'], AUDIO_EXT = ['.wav', '.mp3'];

const common = {
  prompt: z.string().min(1).max(16_000).describe('English scene, action and sound; quoted dialogue in the video\'s language. References are <Picture N> and <Audio N>.'),
  model: z.literal(HEYGEN_MODEL).default(HEYGEN_MODEL).describe('HeyGen model id.'),
  // 1080p and 2k have no published standard price after the launch promotion, so they stay out.
  resolution: z.enum(['480p', '768p']).default('768p').describe('Output resolution.'),
  durationSeconds: z.number().int().min(HEYGEN_SECONDS.min).max(HEYGEN_SECONDS.max).default(5).describe('Whole seconds, 5–15.'),
  seed: z.number().int().min(0).max(4_294_967_295).optional().describe('Reproducible seed.'),
  outputPath: z.string().optional().describe('Output directory.'),
  filename: bareFilenameSchema('video').optional().describe('MP4 filename.'),
};
export const heygenImg2VideoSchema = z.object({ ...common,
  sourceImagePath: z.string().min(1).describe('First frame image; the clip opens on it exactly.'),
  lastImagePath: z.string().min(1).optional().describe('Optional end image the clip moves toward.'),
}).strict();
export const heygenReferenceSchema = z.object({ ...common,
  ratio: z.enum(HEYGEN_RATIOS).default('adaptive').describe('Output ratio; adaptive follows the first picture.'),
  referenceImagePaths: z.array(z.string().min(1)).min(1).max(9).describe('Reference pictures, <Picture N> in the prompt.'),
  referenceAudioPaths: z.array(z.string().min(1)).max(3).default([]).describe('Voice samples, <Audio N> in the prompt.'),
}).strict().superRefine((v, ctx) => {
  if (v.referenceImagePaths.length + v.referenceAudioPaths.length > 12) ctx.addIssue({ code: 'custom', message: 'At most 12 references' });
});
export type HeygenImg2VideoRequest = z.infer<typeof heygenImg2VideoSchema>;
export type HeygenReferenceRequest = z.infer<typeof heygenReferenceSchema>;
type Asset = { type: 'asset_id'; asset_id: string };

/** The wire body with uploaded asset ids; upload is passed in so planning can check without sending files. */
export async function buildHeygenBody(request: HeygenImg2VideoRequest | HeygenReferenceRequest,
  upload: (file: string, allowed: string[]) => Promise<Asset>): Promise<Record<string, unknown>> {
  const common = { model: HEYGEN_MODEL, prompt: request.prompt, prompt_enhancement: 'disabled',
    resolution: request.resolution, duration: request.durationSeconds, ...(request.seed === undefined ? {} : { seed: request.seed }) };
  if ('sourceImagePath' in request) return { ...common, mode: 'image_to_video',
    image: await upload(request.sourceImagePath, IMAGE_EXT), ...(request.lastImagePath ? { end_image: await upload(request.lastImagePath, IMAGE_EXT) } : {}) };
  const images: Asset[] = [], audio: Asset[] = [];
  for (const file of request.referenceImagePaths) images.push(await upload(file, IMAGE_EXT));
  for (const file of request.referenceAudioPaths) audio.push(await upload(file, AUDIO_EXT));
  return { ...common, mode: 'reference_to_video', aspect_ratio: request.ratio, reference_images: images, reference_audio: audio };
}
/** Planning check without uploading: file types and the simple-upload size caps (images 32 MB, audio 50 MB). */
export function checkHeygenInputs(request: HeygenImg2VideoRequest | HeygenReferenceRequest): void {
  const files: Array<[string, string[], number]> = 'sourceImagePath' in request
    ? [request.sourceImagePath, ...(request.lastImagePath ? [request.lastImagePath] : [])].map(file => [file, IMAGE_EXT, 32])
    : [...request.referenceImagePaths.map((file): [string, string[], number] => [file, IMAGE_EXT, 32]),
      ...request.referenceAudioPaths.map((file): [string, string[], number] => [file, AUDIO_EXT, 50])];
  for (const [file, allowed, mb] of files) {
    mediaType(file, allowed);
    if (statSync(file).size > mb * 1048576) throw new Error(`${basename(file)} exceeds HeyGen's ${mb} MB upload limit`);
  }
}

export function heygenStatus(json: Record<string, unknown>): VendorPoll {
  const data = (json.data ?? {}) as { status?: string; video_url?: string | null; failure_code?: string | null; failure_message?: string | null; duration?: number; width?: number; height?: number; seed?: number };
  if (data.status === 'completed') {
    if (!data.video_url) return { state: 'failed', error: 'completed without video_url' };
    return { state: 'done', url: data.video_url, meta: { duration: data.duration, width: data.width, height: data.height, seed: data.seed } };
  }
  if (data.status === 'failed' || data.status === 'cancelled') return { state: 'failed', error: [data.failure_code, data.failure_message].filter(Boolean).join(': ') || data.status };
  return { state: 'running' };
}

export async function generateHeygenVideo(request: HeygenImg2VideoRequest | HeygenReferenceRequest): Promise<VendorResult> {
  if (!config.heygenApiKey) return { success: false, error: 'HEYGEN_API_KEY is not set', terminal: true };
  const key = { 'X-Api-Key': config.heygenApiKey };
  const upload = async (file: string, allowed: string[]): Promise<Asset> => {
    const form = new FormData();
    form.append('file', new Blob([readFileSync(file)], { type: mediaType(file, allowed) }), basename(file));
    const json = await vendorJson(`${HEYGEN_BASE_URL}/v3/assets`, { method: 'POST', headers: key, body: form });
    const id = (json.data as { asset_id?: unknown } | undefined)?.asset_id;
    if (typeof id !== 'string' || !id) throw new Error('No data.asset_id in HeyGen upload response');
    return { type: 'asset_id', asset_id: id };
  };
  let body: Record<string, unknown>;
  // Uploads are free and create no video; a failure here closes the request without a charge.
  try { body = await buildHeygenBody(request, upload); }
  catch (error) { return { success: false, error: 'HeyGen upload failed: ' + (error instanceof Error ? error.message : String(error)), terminal: true }; }
  return runVendorJob({
    vendor: 'HeyGen', outputPath: request.outputPath ?? process.cwd(), filename: request.filename ?? `heygen-${Date.now()}.mp4`, intervalMs: 5000, maxPolls: 360,
    submit: async () => {
      const json = await vendorJson(`${HEYGEN_BASE_URL}/v3/models/videos`, { method: 'POST', timeoutMs: 5 * 60_000,
        headers: { ...key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const id = (json.data as { video_id?: unknown } | undefined)?.video_id;
      if (typeof id !== 'string' || !id) throw new Error('No data.video_id in HeyGen response');
      return id;
    },
    poll: async id => heygenStatus(await vendorJson(`${HEYGEN_BASE_URL}/v3/models/videos/${encodeURIComponent(id)}`, { headers: key })),
  });
}
