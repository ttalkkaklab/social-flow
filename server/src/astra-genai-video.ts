/** LTX v2 provider request contract published by the unified GenAI gateway. */
import { z } from 'zod';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';
import { astraGenaiBaseUrl, downloadGenaiResult, requestGenai, requireAstraGenaiKey, genaiImageUriSchema, genaiSourceUri } from './astra-genai-client.js';
import { atomicJson } from './routing-files.js';
import { recordVideoSubmission } from './video-events.js';

export const GENAI_VIDEO_MODELS = ['ltx-2.5-22b-distilled', 'ltx-2.5-22b-dev'] as const;
export const GENAI_CAMERA_MOTIONS = ['dolly_in', 'dolly_out', 'dolly_left', 'dolly_right', 'jib_up', 'jib_down', 'static', 'focus_shift'] as const;
export const genaiTextToVideoSchema = z.object({
  prompt: z.string().min(1).max(5000),
  model: z.enum(GENAI_VIDEO_MODELS),
  duration: z.number().int().nullable(),
  resolution: z.string().min(1),
  fps: z.union([z.literal(24), z.literal(25), z.literal(48), z.literal(50)]).default(24),
  generateAudio: z.boolean().default(true),
  cameraMotion: z.enum(GENAI_CAMERA_MOTIONS).nullable().optional(),
  reserveUsd: z.number().finite().nonnegative(),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('video').refine(name => name.endsWith('.mp4'), 'Use an .mp4 filename').optional(),
}).strict();
export const genaiImageToVideoSchema = genaiTextToVideoSchema.extend({
  imageUri: z.string().min(1),
  lastFrameUri: z.string().min(1).nullable().optional(),
});
// Gateway contract (genai-gateway#13): four data URI MIME types, 15,000,000 base64 characters.
export const GENAI_AUDIO_TYPES: Readonly<Record<string, string>> = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.opus': 'audio/ogg' };
export const GENAI_AUDIO_DATA_URI_MAX = 15_000_000;
const oneOf = (a: unknown, b: unknown) => Number(a !== undefined) + Number(b !== undefined);
export const genaiAudioToVideoSchema = z.object({
  prompt: z.string().trim().min(1).max(5000),
  model: z.literal('ltx-2.5-22b-dev'),
  resolution: z.string().min(1),
  fps: z.union([z.literal(24), z.literal(25), z.literal(48), z.literal(50)]).default(24),
  audioPath: z.string().min(1).optional(), audioUri: z.string().min(1).optional(),
  imagePath: z.string().min(1).optional(), imageUri: genaiImageUriSchema.optional(),
  lastFramePath: z.string().min(1).optional(), lastFrameUri: genaiImageUriSchema.optional(),
  reserveUsd: z.number().finite().nonnegative(),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('video').refine(name => name.endsWith('.mp4'), 'Use an .mp4 filename').optional(),
}).strict().superRefine((args, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (oneOf(args.audioPath, args.audioUri) !== 1) issue('Supply exactly one audioPath or audioUri');
  if (oneOf(args.imagePath, args.imageUri) > 1) issue('Supply at most one imagePath or imageUri');
  if (oneOf(args.lastFramePath, args.lastFrameUri) > 1) issue('Supply at most one lastFramePath or lastFrameUri');
  if (oneOf(args.lastFramePath, args.lastFrameUri) && !oneOf(args.imagePath, args.imageUri)) issue('A last frame requires a first image');
});
/** Local audio becomes a data URI; HTTPS sources are fetched by the gateway. */
export function genaiAudioUri(uri?: string, file?: string): string {
  if (uri !== undefined) {
    if (/^https:/.test(uri)) { const url = new URL(uri); if (url.username || url.password) throw new Error('GenAI audio URL must not carry credentials'); return uri; }
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+=*)$/.exec(uri);
    if (!match || !Object.values(GENAI_AUDIO_TYPES).includes(match[1])) throw new Error('GenAI audio must be HTTPS or an audio/wav, audio/mpeg, audio/mp4 or audio/ogg data URI');
    if (match[2].length > GENAI_AUDIO_DATA_URI_MAX) throw new Error('GenAI audio data URI exceeds 15,000,000 base64 characters; use an HTTPS URL');
    return uri;
  }
  const type = GENAI_AUDIO_TYPES[path.extname(file!).toLowerCase()];
  if (!type) throw new Error('GenAI audioPath must be .wav, .mp3, .m4a, .ogg or .opus');
  // base64 of n bytes is 4*ceil(n/3) characters; reject before reading a large file.
  if (4 * Math.ceil(fs.statSync(file!).size / 3) > GENAI_AUDIO_DATA_URI_MAX) throw new Error('GenAI audioPath exceeds the 15,000,000-character data URI limit (about 11.25 MB); use audioUri with HTTPS');
  return `data:${type};base64,${fs.readFileSync(file!).toString('base64')}`;
}
export function buildGenaiAudioBody(args: z.infer<typeof genaiAudioToVideoSchema>) {
  const image = oneOf(args.imagePath, args.imageUri) ? genaiSourceUri(args.imageUri, args.imagePath) : undefined;
  const last = oneOf(args.lastFramePath, args.lastFrameUri) ? genaiSourceUri(args.lastFrameUri, args.lastFramePath) : undefined;
  return { audio_uri: genaiAudioUri(args.audioUri, args.audioPath), prompt: args.prompt, model: args.model, resolution: args.resolution, fps: args.fps,
    ...(image === undefined ? {} : { image_uri: image }), ...(last === undefined ? {} : { last_frame_uri: last }) };
}

export const genaiMsrSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  references: z.array(z.object({
    imageUri: genaiImageUriSchema.optional(), imagePath: z.string().min(1).optional(),
    background: z.boolean().default(false),
  }).strict().refine(ref => Number(!!ref.imageUri) + Number(!!ref.imagePath) === 1,
    'Supply exactly one imageUri or imagePath')).min(1).max(5),
  referenceStrength: z.number().finite().min(0).max(1).default(1),
  referenceFrames: z.union([z.literal(25), z.literal(33)]).default(33),
  width: z.number().int().min(64).max(1920).multipleOf(64).default(1536),
  height: z.number().int().min(64).max(1920).multipleOf(64).default(1024),
  numFrames: z.number().int().min(25).max(361).refine(n => (n - 1) % 8 === 0).optional(),
  duration: z.number().finite().gt(0).max(360).optional(),
  frameRate: z.number().finite().min(1).max(60).default(24),
  seed: z.number().int().min(0).max(2147483647).default(42),
  reserveUsd: z.number().finite().nonnegative(),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('video').refine(name => name.endsWith('.mp4'), 'Use a .mp4 filename').optional(),
}).strict().superRefine((args, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const backgrounds = args.references.filter(ref => ref.background).length;
  if (backgrounds > 1 || args.references.length - backgrounds > 4) issue('MSR supports at most four subjects and one background');
  if (args.width * args.height > 2064384) issue('MSR maximum is 2,064,384 pixels');
  if (args.duration !== undefined) {
    if (args.numFrames !== undefined) issue('Omit numFrames when using duration');
    const frames = 1 + 8 * Math.ceil((args.duration * args.frameRate - 1) / 8 - 0.5 - 1e-9);
    if (frames < 25 || frames > 361) issue('MSR duration must round to 25..361 frames');
  }
});
export function buildGenaiMsrBody(args: z.infer<typeof genaiMsrSchema>) {
  return { prompt: args.prompt,
    references: args.references.map(ref => ({ image_uri: genaiSourceUri(ref.imageUri, ref.imagePath), background: ref.background })),
    reference_strength: args.referenceStrength, reference_frames: args.referenceFrames,
    width: args.width, height: args.height, frame_rate: args.frameRate, seed: args.seed,
    ...(args.duration === undefined ? { num_frames: args.numFrames ?? 121 } : { duration: args.duration }) };
}

export type GenaiVideoRequest = z.infer<typeof genaiTextToVideoSchema> & {
  imageUri?: string; lastFrameUri?: string | null;
};

/** Only provider fields cross the wire; local output/budget controls never do. */
export function buildGenaiVideoBody(args: GenaiVideoRequest): Record<string, unknown> {
  return {
    prompt: args.prompt, model: args.model, duration: args.duration, resolution: args.resolution,
    fps: args.fps, generate_audio: args.generateAudio,
    ...(args.cameraMotion === undefined ? {} : { camera_motion: args.cameraMotion }),
    ...(args.imageUri === undefined ? {} : { image_uri: args.imageUri }),
    ...(args.lastFrameUri === undefined ? {} : { last_frame_uri: args.lastFrameUri }),
  };
}

const operationSchema = z.enum(['text-to-video', 'image-to-video', 'audio-to-video', 'msr']);
type Operation = z.infer<typeof operationSchema>;
const receiptSchema = z.object({
  version: z.literal(1), baseUrl: z.string(), operation: operationSchema, fingerprint: z.string(),
  videoPath: z.string(), jobId: z.string().min(1).optional(),
  status: z.enum(['submitting', 'submitted', 'completed']), sha256: z.string().optional(),
}).strict();
// The gateway advertises LTX provider compatibility; response fields come from LTX v2 docs.
const statusSchema = z.object({ id: z.string().min(1), status: z.enum(['pending', 'processing', 'completed', 'failed']),
  result: z.object({ video_url: z.string().min(1) }).passthrough().nullish(), error: z.unknown().optional(),
}).passthrough();
export const genaiVideoStatusSchema = z.object({ receiptPath: z.string().min(1), download: z.boolean().default(false) }).strict();

export async function getGenaiVideoStatus(input: z.infer<typeof genaiVideoStatusSchema>) {
  const receipt = receiptSchema.parse(JSON.parse(fs.readFileSync(input.receiptPath, 'utf8')));
  if (receipt.baseUrl !== astraGenaiBaseUrl()) throw new Error('GenAI receipt belongs to a different server; restore ASTRA_GENAI_URL before recovery.');
  if (!receipt.jobId) throw new Error('GenAI submission identity is unknown; inspect server usage before retrying.');
  if (receipt.status === 'completed') {
    const bytes = fs.readFileSync(receipt.videoPath);
    if (createHash('sha256').update(bytes).digest('hex') !== receipt.sha256) throw new Error('GenAI cached output changed');
    return { jobId: receipt.jobId, status: 'completed', videoPath: receipt.videoPath, downloaded: true, review: 'not_reviewed' };
  }
  const route = `${genaiVideoRoute(receipt.operation)}/${encodeURIComponent(receipt.jobId)}`;
  const job = statusSchema.parse(await requestGenai('GET', route));
  if (job.id !== receipt.jobId) throw new Error('GenAI status job ID mismatch');
  if (job.status === 'failed') throw new Error(`GenAI video ${receipt.jobId} failed: ${JSON.stringify(job.error ?? 'No details').slice(0, 1000)}`);
  if (job.status !== 'completed' || !input.download)
    return { jobId: receipt.jobId, status: job.status, downloaded: false, review: 'not_reviewed' };
  if (!job.result?.video_url) throw new Error('GenAI completed without result.video_url; retain the receipt, do not resubmit.');
  const bytes = await downloadGenaiResult(job.result.video_url);
  // Reject HTML/JSON and probe the actual container before recording completion.
  if (bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp') throw new Error('GenAI result is not MP4');
  const temp = `${receipt.videoPath}.${process.pid}.download.mp4`;
  try {
    fs.writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 });
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', temp], { encoding: 'utf8', timeout: 30_000 }));
    if (!(probe.streams?.[0]?.width > 0) || !(Number(probe.format?.duration) > 0)) throw new Error('GenAI result has no usable video stream');
    if (fs.existsSync(receipt.videoPath)) {
      if (createHash('sha256').update(fs.readFileSync(receipt.videoPath)).digest('hex') !== createHash('sha256').update(bytes).digest('hex'))
        throw new Error('GenAI video output conflicts with download');
    } else fs.linkSync(temp, receipt.videoPath);
    atomicJson(input.receiptPath, { ...receipt, status: 'completed', sha256: createHash('sha256').update(bytes).digest('hex') });
  } finally { fs.rmSync(temp, { force: true }); }
  return { jobId: receipt.jobId, status: 'completed', videoPath: receipt.videoPath, downloaded: true, review: 'not_reviewed' };
}

function genaiVideoRoute(operation: Operation): string {
  return operation === 'msr' ? '/v1/ltx/msr' : `/v1/ltx/v2/${operation}`;
}

export async function generateGenaiVideo(operation: Operation, input: unknown) {
  const args = (operation === 'msr' ? genaiMsrSchema : operation === 'audio-to-video' ? genaiAudioToVideoSchema
    : operation === 'text-to-video' ? genaiTextToVideoSchema : genaiImageToVideoSchema).parse(input);
  requireAstraGenaiKey();
  const body = 'references' in args ? buildGenaiMsrBody(args) : operation === 'audio-to-video'
    ? buildGenaiAudioBody(args as z.infer<typeof genaiAudioToVideoSchema>) : buildGenaiVideoBody(args as GenaiVideoRequest);
  const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const videoPath = resolveOutputFile(args.outputPath || process.cwd(), args.filename || `genai-${Date.now()}.mp4`, 'video');
  const receiptPath = videoPath + '.astra-genai.json';
  if (fs.existsSync(receiptPath)) {
    const previous = receiptSchema.parse(JSON.parse(fs.readFileSync(receiptPath, 'utf8')));
    if (previous.baseUrl !== astraGenaiBaseUrl() || previous.operation !== operation || previous.fingerprint !== fingerprint || previous.videoPath !== videoPath)
      throw new Error('GenAI output receipt conflicts with this request; use a distinct output path.');
    if (!previous.jobId) throw new Error('GenAI submission identity is unknown; inspect usage before retrying.');
    recordVideoSubmission(previous.jobId);
  } else {
    if (fs.existsSync(videoPath)) throw new Error('GenAI output already exists');
    const receipt = { version: 1 as const, baseUrl: astraGenaiBaseUrl(), operation, fingerprint, videoPath, status: 'submitting' as const };
    fs.writeFileSync(receiptPath, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
    const accepted = z.object({ id: z.string().min(1) }).passthrough().parse(await requestGenai('POST', genaiVideoRoute(operation), body));
    atomicJson(receiptPath, { ...receipt, jobId: accepted.id, status: 'submitted' });
    recordVideoSubmission(accepted.id);
  }
  const deadline = Date.now() + 30 * 60_000;
  do {
    const result = await getGenaiVideoStatus({ receiptPath, download: true });
    if (result.downloaded) return { ...result, receiptPath };
    await sleep(5000);
  } while (Date.now() < deadline);
  throw new Error(`GenAI video is still pending; recover using receiptPath ${receiptPath}, never resubmit.`);
}
