/** LTX v2 provider request contract published by the unified GenAI gateway. */
import { z } from 'zod';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';
import { GenaiRequestError, astraGenaiBaseUrl, downloadGenaiResult, pollGenaiJob, requestGenai, requireAstraGenaiKey, genaiImageUriSchema, genaiSourceUri } from './astra-genai-client.js';
import { atomicJson } from './routing-files.js';
import { GENAI_FILE_GONE, GENAI_FILE_SCHEME, forgetGenaiUploads, genaiUploadable, shrinkImageToFit, uploadGenaiFile } from './astra-genai-upload.js';
import { recordVideoSubmission } from './video-events.js';

export const GENAI_VIDEO_MODELS = ['ltx-2.5-22b-distilled', 'ltx-2.5-22b-dev'] as const;
/** Preserve selected geometry; the live gateway validates its current backend's supported sizes. */
export function genaiV2Resolution(saved: string): string {
  return saved;
}
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
  imageUri: genaiImageUriSchema.optional(), imagePath: z.string().min(1).optional(),
  lastFrameUri: genaiImageUriSchema.nullable().optional(), lastFramePath: z.string().min(1).optional(),
}).strict().superRefine((args, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (Number(args.imageUri !== undefined) + Number(args.imagePath !== undefined) !== 1) issue('Supply exactly one imageUri or imagePath');
  if (args.lastFrameUri != null && args.lastFramePath !== undefined) issue('Supply at most one lastFrameUri or lastFramePath');
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

export const GENAI_MSR_FRAMES = { min: 25, max: 361, step: 8, frameRate: 24 } as const;

export const genaiMsrSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  negativePrompt: z.string().trim().min(1).max(5000).optional(),
  guidanceScale: z.number().finite().min(1).max(10).optional(),
  nagScale: z.number().finite().min(0).max(100).optional(),
  nagAlpha: z.number().finite().min(0).max(1).optional(),
  nagTau: z.number().finite().min(0).max(10).optional(),
  references: z.array(z.object({
    imageUri: genaiImageUriSchema.optional(), imagePath: z.string().min(1).optional(),
    background: z.boolean().default(false),
    // Voice sample for this subject; the gateway pairs it with the same picture slot.
    audioUri: z.string().min(1).optional(), audioPath: z.string().min(1).optional(),
  }).strict().refine(ref => Number(!!ref.imageUri) + Number(!!ref.imagePath) === 1,
    'Supply exactly one imageUri or imagePath')
    .refine(ref => oneOf(ref.audioUri, ref.audioPath) <= 1, 'Supply at most one audioUri or audioPath')).min(1).max(5),
  referenceStrength: z.number().finite().min(0).max(1).default(1),
  referenceFrames: z.union([z.literal(25), z.literal(33)]).default(33),
  width: z.number().int().min(64).max(1920).multipleOf(64).default(1536),
  height: z.number().int().min(64).max(1920).multipleOf(64).default(1024),
  numFrames: z.number().int().min(GENAI_MSR_FRAMES.min).max(GENAI_MSR_FRAMES.max).refine(n => (n - 1) % GENAI_MSR_FRAMES.step === 0).optional(),
  duration: z.number().finite().gt(0).max(360).optional(),
  frameRate: z.number().finite().min(1).max(60).default(24),
  seed: z.number().int().min(0).max(2147483647).default(42),
  reserveUsd: z.number().finite().nonnegative(),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('video').refine(name => name.endsWith('.mp4'), 'Use a .mp4 filename').optional(),
}).strict().superRefine((args, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if ((args.nagScale ?? 0) > 0 && args.negativePrompt === undefined)
    issue('MSR nagScale > 0 requires negativePrompt');
  if (args.negativePrompt !== undefined && (args.guidanceScale ?? 1) <= 1 && (args.nagScale ?? 0) === 0)
    issue('MSR negativePrompt requires guidanceScale > 1 or nagScale > 0');
  const backgrounds = args.references.filter(ref => ref.background).length;
  if (backgrounds > 1 || args.references.length - backgrounds > 4) issue('MSR supports at most four subjects and one background');
  let subject = 0;
  for (const ref of args.references) {
    subject += Number(!ref.background);
    if (!oneOf(ref.audioUri, ref.audioPath)) continue;
    if (ref.background) issue('MSR voice samples belong to subjects, not the background');
    else if (subject > 2) issue('MSR voice samples fit the first two subjects only');
  }
  if (args.width * args.height > 2064384) issue('MSR maximum is 2,064,384 pixels');
  if (args.duration !== undefined) {
    if (args.numFrames !== undefined) issue('Omit numFrames when using duration');
    const frames = 1 + 8 * Math.ceil((args.duration * args.frameRate - 1) / 8 - 0.5 - 1e-9);
    if (frames < GENAI_MSR_FRAMES.min || frames > GENAI_MSR_FRAMES.max) issue('MSR duration must round to 25..361 frames');
  }
});
export function buildGenaiMsrBody(args: z.infer<typeof genaiMsrSchema>) {
  return { prompt: args.prompt,
    ...(args.negativePrompt === undefined ? {} : { negative_prompt: args.negativePrompt }),
    ...(args.guidanceScale === undefined ? {} : { guidance_scale: args.guidanceScale }),
    ...((args.nagScale ?? 0) > 0 ? { nag_scale: args.nagScale,
      ...(args.nagAlpha === undefined ? {} : { nag_alpha: args.nagAlpha }),
      ...(args.nagTau === undefined ? {} : { nag_tau: args.nagTau }) } : {}),
    references: args.references.map(ref => ({ image_uri: genaiSourceUri(ref.imageUri, ref.imagePath), background: ref.background,
      ...(oneOf(ref.audioUri, ref.audioPath) ? { audio_uri: genaiAudioUri(ref.audioUri, ref.audioPath) } : {}) })),
    reference_strength: args.referenceStrength, reference_frames: args.referenceFrames,
    width: args.width, height: args.height, frame_rate: args.frameRate, seed: args.seed,
    ...(args.duration === undefined ? { num_frames: args.numFrames ?? 121 } : { duration: args.duration }) };
}

let msrVoiceCache: { value: boolean; at: number; ttl: number } | undefined;
/**
 * Ask the gateway whether its MSR backend takes voice samples. An older gateway
 * (404), a missing key or an unreachable gateway counts as no. Cached so the plan
 * and the execute-time replan see the same answer.
 */
export async function refreshGenaiMsrVoice(force = false): Promise<boolean> {
  if (!force && msrVoiceCache && Date.now() - msrVoiceCache.at < msrVoiceCache.ttl) return msrVoiceCache.value;
  let value = false, ttl = 60_000;
  try {
    const body = z.object({ voice_references: z.boolean() }).passthrough()
      .parse(await requestGenai('GET', '/v1/ltx/msr/capabilities', undefined, 15_000));
    value = body.voice_references; ttl = 600_000;
  } catch { /* Unknown support is treated as unsupported; the plan says so. */ }
  msrVoiceCache = { value, at: Date.now(), ttl };
  return value;
}
export function genaiMsrVoiceReferences(): boolean { return msrVoiceCache?.value ?? false; }

export type GenaiVideoRequest = z.infer<typeof genaiTextToVideoSchema> & {
  imageUri?: string; imagePath?: string; lastFrameUri?: string | null; lastFramePath?: string;
};

/** Only provider fields cross the wire; local output/budget controls never do. */
export function buildGenaiVideoBody(args: GenaiVideoRequest): Record<string, unknown> {
  return {
    prompt: args.prompt, model: args.model, duration: args.duration, resolution: args.resolution,
    fps: args.fps, generate_audio: args.generateAudio,
    ...(args.cameraMotion === undefined ? {} : { camera_motion: args.cameraMotion }),
    // Local frames travel as checked data URIs, like MSR and audio-to-video.
    ...(args.imageUri === undefined && args.imagePath === undefined ? {} : { image_uri: genaiSourceUri(args.imageUri, args.imagePath) }),
    ...(args.lastFramePath !== undefined ? { last_frame_uri: genaiSourceUri(undefined, args.lastFramePath) }
      : args.lastFrameUri === undefined ? {} : { last_frame_uri: args.lastFrameUri === null ? null : genaiSourceUri(args.lastFrameUri) }),
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
  // The gateway's own failed status is terminal job evidence (managed routing frees the slot).
  if (job.status === 'failed') throw new GenaiRequestError(`GenAI video ${receipt.jobId} failed: ${JSON.stringify(job.error ?? 'No details').slice(0, 1000)}`, true, 200);
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

/** A fallback body above this is not sent: voice cannot be shrunk, and so large a body on a slow link meets the edge's 524 again. */
export const GENAI_MSR_INLINE_MAX_BYTES = 8 * 1000 * 1000;

/**
 * Shrink each inline picture to the render size and send inline pictures and voice samples as
 * chunked uploads, so the MSR body carries file ids instead of base64. HTTPS sources pass
 * untouched; a gateway without the upload API keeps the (shrunk) data URIs.
 */
export async function prepareGenaiMsrSources(body: ReturnType<typeof buildGenaiMsrBody>) {
  let supported = true;
  const send = async (uri: string, shrink: boolean) => {
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(uri);
    if (!match) return uri;
    const bytes = shrink ? shrinkImageToFit(Buffer.from(match[2], 'base64'), body.width, body.height) : Buffer.from(match[2], 'base64');
    // Only a gateway answer (no upload API, a limit, a full disk) stops later uploads; a type it does not take goes inline alone.
    const uploadable = supported && genaiUploadable(bytes, match[1]);
    const id = uploadable ? await uploadGenaiFile(bytes, match[1]) : undefined;
    if (uploadable && id === undefined) supported = false;
    return id ?? `data:${match[1]};base64,${bytes.toString('base64')}`;
  };
  const references = [];
  for (const ref of body.references) references.push({ ...ref, image_uri: await send(ref.image_uri, true),
    ...('audio_uri' in ref && typeof ref.audio_uri === 'string' ? { audio_uri: await send(ref.audio_uri, false) } : {}) });
  const prepared = { ...body, references };
  const size = Buffer.byteLength(JSON.stringify(prepared));
  if (size > GENAI_MSR_INLINE_MAX_BYTES)
    throw new Error(`msr_body_too_large: the gateway did not take the chunked upload and the inline request is ${(size / 1e6).toFixed(1)} MB (limit 8 MB); nothing was submitted. Try again later, or use a shorter voice sample.`);
  return prepared;
}

// A busy MSR backend acknowledged a submission after 480 s (2026-10-30); 60 s orphaned jobs.
const SUBMIT_TIMEOUT_MS = 15 * 60_000;
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
    if ('references' in args && (args.negativePrompt !== undefined || (args.guidanceScale ?? 1) > 1)) {
      const capabilities = z.object({ negative_prompt: z.boolean().optional(), nag: z.boolean().optional() }).passthrough()
        .parse(await requestGenai('GET', '/v1/ltx/msr/capabilities', undefined, 15_000));
      if ((args.nagScale ?? 0) > 0 && capabilities.nag !== true)
        throw new Error('msr_nag_unsupported: the GenAI MSR backend does not advertise NAG; no request was submitted');
      if (capabilities.negative_prompt !== true)
        throw new Error('msr_negative_unsupported: the GenAI MSR backend does not advertise negative conditioning; no request was submitted');
    }
    if (operation === 'msr' && 'references' in args && args.references.some(ref => oneOf(ref.audioUri, ref.audioPath)) && !await refreshGenaiMsrVoice(true))
      throw new Error('msr_voice_unsupported: the GenAI MSR backend does not accept voice samples (GET /v1/ltx/msr/capabilities)');
    // Upload before the receipt exists: a failed upload leaves nothing to recover and the call can simply run again.
    // The fingerprint stays on the request as written, so a resumed receipt still matches.
    const submitted = 'references' in args ? await prepareGenaiMsrSources(body as ReturnType<typeof buildGenaiMsrBody>) : body;
    const receipt = { version: 1 as const, baseUrl: astraGenaiBaseUrl(), operation, fingerprint, videoPath, status: 'submitting' as const };
    fs.writeFileSync(receiptPath, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
    let response: unknown;
    try {
      try { response = await requestGenai('POST', genaiVideoRoute(operation), submitted, SUBMIT_TIMEOUT_MS); }
      catch (error) {
        // The gateway no longer knows an uploaded id (expired, restarted). That 400 created no job: upload again and resubmit once.
        if (!JSON.stringify(submitted).includes(GENAI_FILE_SCHEME) || !(error instanceof GenaiRequestError && error.httpStatus === 400 && GENAI_FILE_GONE.test(error.message))) throw error;
        forgetGenaiUploads();
        let again: unknown;
        try { again = await prepareGenaiMsrSources(body as ReturnType<typeof buildGenaiMsrBody>); }
        catch (uploadError) { fs.rmSync(receiptPath, { force: true }); throw uploadError; }
        response = await requestGenai('POST', genaiVideoRoute(operation), again, SUBMIT_TIMEOUT_MS);
      }
    } catch (error) {
      // An explicit rejection created no job; free the output name so a corrected request can retry it.
      if (error instanceof GenaiRequestError && error.terminal) fs.rmSync(receiptPath, { force: true });
      throw error;
    }
    const accepted = z.object({ id: z.string().min(1) }).passthrough().parse(response);
    atomicJson(receiptPath, { ...receipt, jobId: accepted.id, status: 'submitted' });
    recordVideoSubmission(accepted.id);
  }
  const result = await pollGenaiJob(() => getGenaiVideoStatus({ receiptPath, download: true }),
    `GenAI video is still pending; recover using receiptPath ${receiptPath}, never resubmit.`);
  return { ...result, receiptPath };
}
