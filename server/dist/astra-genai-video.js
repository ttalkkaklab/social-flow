/** LTX v2 provider request contract published by the unified GenAI gateway. */
import { z } from 'zod';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';
import { astraGenaiBaseUrl, downloadGenaiResult, requestGenai, requireAstraGenaiKey, genaiImageUriSchema, genaiSourceUri } from './astra-genai-client.js';
import { atomicJson } from './routing-files.js';
import { recordVideoSubmission } from './video-events.js';
export const GENAI_VIDEO_MODELS = ['ltx-2.5-22b-distilled', 'ltx-2.5-22b-dev'];
export const GENAI_CAMERA_MOTIONS = ['dolly_in', 'dolly_out', 'dolly_left', 'dolly_right', 'jib_up', 'jib_down', 'static', 'focus_shift'];
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
export const genaiMsrSchema = z.object({
    prompt: z.string().trim().min(1).max(2000),
    references: z.array(z.object({
        imageUri: genaiImageUriSchema.optional(), imagePath: z.string().min(1).optional(),
        background: z.boolean().default(false),
    }).strict().refine(ref => Number(!!ref.imageUri) + Number(!!ref.imagePath) === 1, 'Supply exactly one imageUri or imagePath')).min(1).max(5),
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
    const issue = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const backgrounds = args.references.filter(ref => ref.background).length;
    if (backgrounds > 1 || args.references.length - backgrounds > 4)
        issue('MSR supports at most four subjects and one background');
    if (args.width * args.height > 2064384)
        issue('MSR maximum is 2,064,384 pixels');
    if (args.duration !== undefined) {
        if (args.numFrames !== undefined)
            issue('Omit numFrames when using duration');
        const frames = 1 + 8 * Math.ceil((args.duration * args.frameRate - 1) / 8 - 0.5 - 1e-9);
        if (frames < 25 || frames > 361)
            issue('MSR duration must round to 25..361 frames');
    }
});
export function buildGenaiMsrBody(args) {
    return { prompt: args.prompt,
        references: args.references.map(ref => ({ image_uri: genaiSourceUri(ref.imageUri, ref.imagePath), background: ref.background })),
        reference_strength: args.referenceStrength, reference_frames: args.referenceFrames,
        width: args.width, height: args.height, frame_rate: args.frameRate, seed: args.seed,
        ...(args.duration === undefined ? { num_frames: args.numFrames ?? 121 } : { duration: args.duration }) };
}
/** Only provider fields cross the wire; local output/budget controls never do. */
export function buildGenaiVideoBody(args) {
    return {
        prompt: args.prompt, model: args.model, duration: args.duration, resolution: args.resolution,
        fps: args.fps, generate_audio: args.generateAudio,
        ...(args.cameraMotion === undefined ? {} : { camera_motion: args.cameraMotion }),
        ...(args.imageUri === undefined ? {} : { image_uri: args.imageUri }),
        ...(args.lastFrameUri === undefined ? {} : { last_frame_uri: args.lastFrameUri }),
    };
}
const operationSchema = z.enum(['text-to-video', 'image-to-video', 'msr']);
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
export async function getGenaiVideoStatus(input) {
    const receipt = receiptSchema.parse(JSON.parse(fs.readFileSync(input.receiptPath, 'utf8')));
    if (receipt.baseUrl !== astraGenaiBaseUrl())
        throw new Error('GenAI receipt belongs to a different server; restore ASTRA_GENAI_URL before recovery.');
    if (!receipt.jobId)
        throw new Error('GenAI submission identity is unknown; inspect server usage before retrying.');
    if (receipt.status === 'completed') {
        const bytes = fs.readFileSync(receipt.videoPath);
        if (createHash('sha256').update(bytes).digest('hex') !== receipt.sha256)
            throw new Error('GenAI cached output changed');
        return { jobId: receipt.jobId, status: 'completed', videoPath: receipt.videoPath, downloaded: true, review: 'not_reviewed' };
    }
    const route = `${genaiVideoRoute(receipt.operation)}/${encodeURIComponent(receipt.jobId)}`;
    const job = statusSchema.parse(await requestGenai('GET', route));
    if (job.id !== receipt.jobId)
        throw new Error('GenAI status job ID mismatch');
    if (job.status === 'failed')
        throw new Error(`GenAI video ${receipt.jobId} failed: ${JSON.stringify(job.error ?? 'No details').slice(0, 1000)}`);
    if (job.status !== 'completed' || !input.download)
        return { jobId: receipt.jobId, status: job.status, downloaded: false, review: 'not_reviewed' };
    if (!job.result?.video_url)
        throw new Error('GenAI completed without result.video_url; retain the receipt, do not resubmit.');
    const bytes = await downloadGenaiResult(job.result.video_url);
    // Reject HTML/JSON and probe the actual container before recording completion.
    if (bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp')
        throw new Error('GenAI result is not MP4');
    const temp = `${receipt.videoPath}.${process.pid}.download.mp4`;
    try {
        fs.writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 });
        const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', temp], { encoding: 'utf8', timeout: 30_000 }));
        if (!(probe.streams?.[0]?.width > 0) || !(Number(probe.format?.duration) > 0))
            throw new Error('GenAI result has no usable video stream');
        if (fs.existsSync(receipt.videoPath)) {
            if (createHash('sha256').update(fs.readFileSync(receipt.videoPath)).digest('hex') !== createHash('sha256').update(bytes).digest('hex'))
                throw new Error('GenAI video output conflicts with download');
        }
        else
            fs.linkSync(temp, receipt.videoPath);
        atomicJson(input.receiptPath, { ...receipt, status: 'completed', sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    finally {
        fs.rmSync(temp, { force: true });
    }
    return { jobId: receipt.jobId, status: 'completed', videoPath: receipt.videoPath, downloaded: true, review: 'not_reviewed' };
}
function genaiVideoRoute(operation) {
    return operation === 'msr' ? '/v1/ltx/msr' : `/v1/ltx/v2/${operation}`;
}
export async function generateGenaiVideo(operation, input) {
    const args = (operation === 'msr' ? genaiMsrSchema : operation === 'text-to-video' ? genaiTextToVideoSchema : genaiImageToVideoSchema).parse(input);
    requireAstraGenaiKey();
    const body = 'references' in args ? buildGenaiMsrBody(args) : buildGenaiVideoBody(args);
    const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const videoPath = resolveOutputFile(args.outputPath || process.cwd(), args.filename || `genai-${Date.now()}.mp4`, 'video');
    const receiptPath = videoPath + '.astra-genai.json';
    if (fs.existsSync(receiptPath)) {
        const previous = receiptSchema.parse(JSON.parse(fs.readFileSync(receiptPath, 'utf8')));
        if (previous.baseUrl !== astraGenaiBaseUrl() || previous.operation !== operation || previous.fingerprint !== fingerprint || previous.videoPath !== videoPath)
            throw new Error('GenAI output receipt conflicts with this request; use a distinct output path.');
        if (!previous.jobId)
            throw new Error('GenAI submission identity is unknown; inspect usage before retrying.');
        recordVideoSubmission(previous.jobId);
    }
    else {
        if (fs.existsSync(videoPath))
            throw new Error('GenAI output already exists');
        const receipt = { version: 1, baseUrl: astraGenaiBaseUrl(), operation, fingerprint, videoPath, status: 'submitting' };
        fs.writeFileSync(receiptPath, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
        const accepted = z.object({ id: z.string().min(1) }).passthrough().parse(await requestGenai('POST', genaiVideoRoute(operation), body));
        atomicJson(receiptPath, { ...receipt, jobId: accepted.id, status: 'submitted' });
        recordVideoSubmission(accepted.id);
    }
    const deadline = Date.now() + 30 * 60_000;
    do {
        const result = await getGenaiVideoStatus({ receiptPath, download: true });
        if (result.downloaded)
            return { ...result, receiptPath };
        await sleep(5000);
    } while (Date.now() < deadline);
    throw new Error(`GenAI video is still pending; recover using receiptPath ${receiptPath}, never resubmit.`);
}
