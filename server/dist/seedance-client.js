import { createHash } from 'node:crypto';
import { recordVideoSubmission, recordVideoTokens } from './video-events.js';
/**
 * ByteDance Seedance video generation client (BytePlus ModelArk).
 *
 * The API video engine next to the LTX lanes. When to use which is governed by
 * skills/produce/references/video-model-selection.md.
 *
 * - 5 models: Dreamina Seedance 2.5 / Flash and 2.0 / Fast / Mini. Seedance 1.x left the plugin on 2026-10-31:
 *   it takes no reference audio, so it cannot keep a character's voice.
 * - Text-to-Video, Image-to-Video (first frame · first+last frame), reference images,
 *   reference audio (a clip's voice timbre or dialogue content, `role: reference_audio`)
 *   and reference video (camera, blocking and motion timing from a clip such as the
 *   Blender previz, `role: reference_video`; public URL or ModelArk asset, see media-publish.ts)
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
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { arkBaseUrl, requireArkKey } from './config.js';
import { saveVendorOutput } from './vendor-video.js';
import { publishFiles } from './media-publish.js';
import { ensurePortrait, portraitForImage, PortraitError } from './modelark-assets.js';
import { ALLOWED_EXTENSIONS, bareFilenameSchema, mimeFromExtension, resolveOutputFile, validateFilePath, } from './media-utils.js';
import { nonEnglishOutsideQuotes } from './prompt-language.js';
// ── Model capability table (source of truth) ────────────────────────
//
// A direct transcription of the per-model constraints in the official docs
// (see docs/research/2026-11-22-seedance-api).
// Schema validation, tool enums, and docs all derive from this table — copying
// the values into multiple places means only one gets fixed when a model is added.
export const VALID_SEEDANCE_RESOLUTIONS = ['480p', '720p', '1080p', '4k'];
/** 7 aspect ratios. adaptive follows the input's (image/video) ratio as-is. */
export const VALID_SEEDANCE_RATIOS = ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9', 'adaptive'];
const REFERENCE_TASK_TYPES = ['auto', 'reference', 'edit', 'extend'];
export const SEEDANCE_MODEL_SPECS = {
    'dreamina-seedance-2-5-260628': {
        referenceTaskTypes: REFERENCE_TASK_TYPES,
        resolutions: ['480p', '720p', '1080p', '4k'],
        duration: [4, 30],
        lastFrame: true,
        referenceImages: [1, 30],
        referenceAudio: { maxClips: 10, clipSeconds: [2, 30], totalSeconds: 30, audioOnly: true },
        referenceVideos: { maxClips: 10, clipSeconds: [2, 30], totalSeconds: 30 },
        audio: true,
        realFaceInput: false,
        portraitAssetInput: true,
        activationGate: true,
    },
    'dreamina-seedance-2-5-flash-261115': {
        referenceTaskTypes: REFERENCE_TASK_TYPES,
        resolutions: ['480p', '720p'],
        duration: [4, 30],
        lastFrame: true,
        referenceImages: [1, 10],
        referenceAudio: { maxClips: 5, clipSeconds: [2, 30], totalSeconds: 30, audioOnly: true },
        referenceVideos: { maxClips: 5, clipSeconds: [2, 30], totalSeconds: 30 },
        audio: true,
        realFaceInput: false,
        portraitAssetInput: true,
        activationGate: true,
    },
    'dreamina-seedance-2-0-260128': {
        referenceTaskTypes: [],
        resolutions: ['480p', '720p', '1080p', '4k'],
        duration: [4, 15],
        lastFrame: true,
        referenceImages: [1, 9],
        referenceAudio: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15, audioOnly: false },
        referenceVideos: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15 },
        audio: true,
        realFaceInput: false,
        portraitAssetInput: true,
        activationGate: true,
    },
    'dreamina-seedance-2-0-fast-260128': {
        referenceTaskTypes: [],
        resolutions: ['480p', '720p'],
        duration: [4, 15],
        lastFrame: true,
        referenceImages: [1, 9],
        referenceAudio: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15, audioOnly: false },
        referenceVideos: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15 },
        audio: true,
        realFaceInput: false,
        portraitAssetInput: true,
        activationGate: true,
    },
    'dreamina-seedance-2-0-mini-260615': {
        referenceTaskTypes: [],
        resolutions: ['480p', '720p'],
        duration: [4, 15],
        lastFrame: true,
        referenceImages: [1, 9],
        referenceAudio: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15, audioOnly: false },
        referenceVideos: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15 },
        audio: true,
        realFaceInput: false,
        portraitAssetInput: true,
        activationGate: true,
    },
};
export const VALID_SEEDANCE_MODELS = Object.keys(SEEDANCE_MODEL_SPECS);
export const DEFAULT_SEEDANCE_MODEL = 'dreamina-seedance-2-0-260128';
export const DEFAULT_SEEDANCE_RESOLUTION = '720p';
export const DEFAULT_SEEDANCE_DURATION = 5; // the only common default that fits every model's duration range
export const SEEDANCE_FPS = 24; // fixed across all models
const POLL_INTERVAL_MS = 10_000;
const MAX_POLLS = 90; // 15-minute max wait — 2.5's 30s clips take the longest
const MAX_INPUT_IMAGE_BYTES = 30 * 1024 * 1024; // per-image cap (official)
const MAX_REQUEST_BYTES = 64 * 1024 * 1024; // request body cap (official)
const MAX_INPUT_AUDIO_BYTES = 15 * 1024 * 1024; // per-clip cap for reference audio (official)
const MAX_INPUT_VIDEO_BYTES = 200 * 1024 * 1024; // per-clip cap for reference video (official)
/** Reference-video frame limits (official, API reference 1520757): fps range and total pixel range */
export const SEEDANCE_REFERENCE_VIDEO_FPS = [24, 60];
export const SEEDANCE_REFERENCE_VIDEO_PIXELS = [407_696, 8_295_044];
/** Formats the vendor accepts for reference audio — narrower than ALLOWED_EXTENSIONS.audio (no ogg·aac·flac) */
export const SEEDANCE_REFERENCE_AUDIO_EXTENSIONS = ['.wav', '.mp3'];
/** Formats the vendor accepts for reference video (H.264/H.265 inside) */
export const SEEDANCE_REFERENCE_VIDEO_EXTENSIONS = ['.mp4', '.mov'];
// ── Shared schema pieces ────────────────────────────────────────────
const commonFields = {
    prompt: z.string().min(1, 'Prompt is required'),
    model: z.enum(VALID_SEEDANCE_MODELS).optional().default(DEFAULT_SEEDANCE_MODEL),
    resolution: z.enum(VALID_SEEDANCE_RESOLUTIONS).optional().default(DEFAULT_SEEDANCE_RESOLUTION),
    durationSeconds: z.number().int().optional(),
    generateAudio: z.boolean().optional().default(false),
    watermark: z.boolean().optional().default(false),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('video').optional(),
};
/**
 * Model × resolution × duration × feature cross-constraint validation (per official docs).
 *
 * We reject before calling because one generation takes
 * minutes, and a bad combination comes back as an async error that burns all of
 * that time. Rejecting here lets the model immediately retry with corrected
 * arguments.
 */
function validateCommon(data, ctx) {
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
    if (!spec.resolutions.includes(data.resolution)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['resolution'],
            message: `${data.model} does not support ${data.resolution} (supported: ${spec.resolutions.join(', ')}).`,
        });
    }
    const [minDuration, maxDuration] = spec.duration;
    const seconds = data.durationSeconds ?? DEFAULT_SEEDANCE_DURATION;
    if (seconds !== -1 && (seconds < minDuration || seconds > maxDuration)) {
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
    realFaceInput: z.boolean().optional(),
    sourceImagePath: z.string().min(1, 'Source image path is required'),
    lastImagePath: z.string().optional(),
    // Following the input image's ratio is the default — specifying a different
    // ratio makes the server center-crop the source image (the incident where a
    // 9:16 cover got cropped).
    ratio: z.enum(VALID_SEEDANCE_RATIOS).optional().default('adaptive'),
})
    .superRefine((data, ctx) => {
    validateCommon(data, ctx);
    if (data.model.startsWith('dreamina-seedance-2-5-') && data.ratio !== 'adaptive') {
        ctx.addIssue({ code: 'custom', path: ['ratio'], message: 'Seedance 2.5 first-frame generation requires adaptive ratio.' });
    }
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
    omniReferenceTaskType: z.enum(REFERENCE_TASK_TYPES).optional(),
    realFaceInput: z.boolean().optional(),
    referenceImagePaths: z.array(z.string()).optional().default([]),
    referenceAudioPaths: z.array(z.string()).optional().default([]),
    referenceVideoPaths: z.array(z.string()).optional().default([]),
    referenceVideoTaskIds: z.array(z.string().regex(/^cgt-[A-Za-z0-9_-]{1,120}$/)).optional(),
    referenceVideoUrls: z.array(z.string().url().regex(/^(?:https?:\/\/|asset:\/\/)[^/\s]+/i, 'Use a public HTTP(S) video URL or asset:// ID')).optional().default([]),
    ratio: z.enum(VALID_SEEDANCE_RATIOS).optional().default('adaptive'),
})
    .superRefine((data, ctx) => {
    validateCommon(data, ctx);
    const spec = SEEDANCE_MODEL_SPECS[data.model];
    const [, maxImages] = spec.referenceImages;
    if (data.referenceImagePaths.length > maxImages) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['referenceImagePaths'],
            message: `${data.model} allows at most ${maxImages} reference images (requested: ${data.referenceImagePaths.length}).`,
        });
    }
    const videoCount = data.referenceVideoPaths.length + data.referenceVideoUrls.length + (data.referenceVideoTaskIds?.length ?? 0);
    const task = data.omniReferenceTaskType;
    if (task && !spec.referenceTaskTypes.includes(task)) {
        ctx.addIssue({ code: 'custom', path: ['omniReferenceTaskType'], message: 'Task type selection requires Seedance 2.5 or Flash.' });
    }
    if (task === 'edit' || task === 'extend') {
        if (!videoCount)
            ctx.addIssue({ code: 'custom', path: ['referenceVideoPaths'], message: 'Editing and extension need a reference video.' });
        if (data.ratio !== 'adaptive')
            ctx.addIssue({ code: 'custom', path: ['ratio'], message: 'Editing and extension require adaptive ratio.' });
        if (task === 'edit' && data.durationSeconds !== undefined && data.durationSeconds !== -1)
            ctx.addIssue({ code: 'custom', path: ['durationSeconds'], message: 'Editing keeps the input duration and requires -1.' });
    }
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
            if (!SEEDANCE_REFERENCE_VIDEO_EXTENSIONS.includes(ext)) {
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
    if (data.referenceAudioPaths.length === 0)
        return;
    // Reference audio — the vendor fails these asynchronously, minutes later.
    const audio = spec.referenceAudio;
    if (data.referenceAudioPaths.length > audio.maxClips) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['referenceAudioPaths'],
            message: `${data.model} allows at most ${audio.maxClips} reference audio clips (requested: ${data.referenceAudioPaths.length}).`,
        });
    }
    if (!audio.audioOnly && data.referenceImagePaths.length === 0 && !videoCount) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['referenceImagePaths'],
            message: `${data.model} needs a reference image or video; audio-only input requires Seedance 2.5.`,
        });
    }
    for (const filePath of data.referenceAudioPaths) {
        const ext = path.extname(filePath).toLowerCase();
        if (!SEEDANCE_REFERENCE_AUDIO_EXTENSIONS.includes(ext)) {
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
}).transform(data => ({ ...data, durationSeconds: data.durationSeconds ?? (data.omniReferenceTaskType === 'edit' ? -1 : DEFAULT_SEEDANCE_DURATION) }));
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/** Extract a one-liner the model can read from a ModelArk error body. */
function describeHttpError(status, body) {
    try {
        const parsed = JSON.parse(body);
        const code = parsed.error?.code;
        const message = parsed.error?.message;
        if (message)
            return `HTTP ${status} ${code ? `(${code}) ` : ''}${message}`;
    }
    catch {
        // not JSON — use the raw body as-is
    }
    return `HTTP ${status} — ${body.slice(0, 400)}`;
}
/** Create a task → task ID */
async function createTask(apiKey, body) {
    const payload = JSON.stringify(body);
    if (Buffer.byteLength(payload) > MAX_REQUEST_BYTES)
        throw Object.assign(new Error('Seedance request exceeds 64 MB'), { terminal: true });
    const response = await fetch(`${arkBaseUrl()}/contents/generations/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: payload,
        signal: AbortSignal.timeout(5 * 60_000),
    });
    if (!response.ok) {
        // Same rule as the GenAI transport: an explicit 4xx answer (except timeout/conflict) created no task.
        const terminal = response.status >= 400 && response.status < 500 && ![408, 409, 425].includes(response.status);
        throw Object.assign(new Error(`Failed to create video task: ${describeHttpError(response.status, await response.text())}`), { terminal });
    }
    const json = (await response.json());
    if (!json.id)
        throw new Error('No task id returned from ModelArk');
    return json.id;
}
async function getTask(apiKey, taskId) {
    const response = await fetch(`${arkBaseUrl()}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
        throw new Error(`Failed to get task status: ${describeHttpError(response.status, await response.text())}`);
    }
    const task = await response.json();
    if (task.id !== undefined && task.id !== taskId)
        throw new Error('ModelArk status has a different task ID');
    if (!task.status)
        throw new Error('ModelArk status response has no task state');
    return task;
}
const runProbe = promisify(execFile);
async function inspectMedia(file, decode = false) {
    try {
        const { stdout, stderr } = await runProbe('ffprobe', ['-v', 'error', ...(decode ? ['-count_frames'] : []),
            '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,duration,nb_frames,nb_read_frames:format=format_name,duration:format_tags=major_brand',
            '-of', 'json', file], { timeout: decode ? 180_000 : 15_000 });
        const media = JSON.parse(stdout);
        if (stderr.trim() || !media.streams?.length || !media.format?.format_name)
            throw new Error('invalid media');
        return media;
    }
    catch (error) {
        if (error.code === 'ENOENT')
            throw new Error('Seedance media validation requires ffprobe');
        throw new Error('Unreadable Seedance media: ' + path.basename(file));
    }
}
function completeVideo(media) {
    const video = media.streams.find(stream => stream.codec_type === 'video');
    const decoded = Number(video?.nb_read_frames), declared = Number(video?.nb_frames);
    if (!media.format.format_name.split(',').includes('mp4') || !video?.width || !video.height ||
        !Number.isSafeInteger(decoded) || decoded < 1 || Number.isFinite(declared) && decoded !== declared)
        throw new Error('Invalid Seedance video: expected a complete MP4 or MOV video stream');
    return video;
}
export async function verifySeedanceVideo(file) {
    completeVideo(await inspectMedia(file, true));
}
function checkDimensions(width, height, name) {
    if (Math.min(width, height) < 300 || Math.max(width, height) > 6000 || width / height < 0.4 || width / height > 2.5)
        throw new Error(name + ' needs 300–6000 pixels per side and a width/height ratio in [0.4, 2.5]');
}
/** The account-authenticated task result is the authority for the original, never a caller-supplied URL. */
async function trustedReferenceVideos(apiKey, ids, spec) {
    return Promise.all(ids.map(async (id) => {
        const task = await getTask(apiKey, id);
        const age = Date.now() / 1000 - Number(task.created_at);
        const url = task.content?.video_url;
        const seconds = task.duration;
        if (task.id !== id || task.status !== 'succeeded' || !Object.hasOwn(SEEDANCE_MODEL_SPECS, task.model ?? '') ||
            !Number.isFinite(age) || age < 0 || age >= 30 * 86400 || !url || !url.startsWith('https://'))
            throw new Error('seedance_original_unavailable: select an accessible, completed Seedance 2.x task from this account within 30 days');
        const [min, max] = spec.referenceVideos.clipSeconds;
        if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < min || seconds > max)
            throw new Error('seedance_original_duration: the source task duration is outside this model’s reference limits');
        return { url, seconds };
    }));
}
/** Verify account access and eligibility at planning time without retaining signed URLs. */
export async function checkSeedanceReferenceTasks(request) {
    if (!request.referenceVideoTaskIds?.length)
        return;
    const spec = SEEDANCE_MODEL_SPECS[request.model];
    const originals = await trustedReferenceVideos(requireArkKey(), request.referenceVideoTaskIds, spec);
    const seconds = originals.reduce((total, item) => total + item.seconds, 0);
    if (seconds > spec.referenceVideos.totalSeconds)
        throw new Error('seedance_original_duration: the original videos exceed the total reference duration');
}
/** Poll an existing receipt once. A transient read or download failure keeps its reservation open. */
export async function pollSeedanceTask(id) {
    const task = await getTask(requireArkKey(), id);
    if (task.status === 'succeeded') {
        if (!task.content?.video_url)
            throw new Error('Seedance task succeeded without a download URL');
        return { state: 'done', url: task.content.video_url, meta: { completionTokens: task.usage?.completion_tokens, duration: task.duration } };
    }
    if (task.status === 'failed' || task.status === 'expired' || task.status === 'cancelled')
        return { state: 'failed', error: task.error?.message ?? task.status };
    return { state: 'running' };
}
/**
 * Poll for completion → download the mp4 → save locally.
 *
 * The download does not send the API key — video_url is an already-signed object
 * storage address, and there's no reason to attach our key to someone else's domain.
 */
async function awaitVideoAndSave(apiKey, taskId, outputPath, filename) {
    let retried = false;
    for (let poll = 1; poll <= MAX_POLLS; poll += 1) {
        console.error(`[Seedance] Generation in progress... (polling ${poll}/${MAX_POLLS})`);
        await sleep(POLL_INTERVAL_MS);
        // One failed status read in a row (a 5xx or a dropped connection) waits for the next poll;
        // only the GET repeats, never the paid task creation.
        let task;
        try {
            task = await getTask(apiKey, taskId);
            retried = false;
        }
        catch (error) {
            if (retried)
                throw error;
            retried = true;
            continue;
        }
        if (task.status === 'failed' || task.status === 'expired' || task.status === 'cancelled') {
            recordVideoTokens(0); // ModelArk bills successful generations only.
            const reason = task.error?.message || task.status;
            return { error: `Generation ${task.status}: ${reason}`, terminal: true };
        }
        if (task.status !== 'succeeded')
            continue;
        recordVideoTokens(task.usage?.completion_tokens);
        const videoUrl = task.content?.video_url;
        if (!videoUrl)
            return { error: 'Task succeeded but no video_url in response' };
        // Path validation (traversal·extension) happens before the download —
        // rejecting after receiving tens of MB wastes bandwidth, and the result URL
        // disappears after 24 hours so there's no retry either.
        const fullPath = resolveOutputFile(outputPath, filename, 'video');
        const saved = await saveVendorOutput({ state: 'done', url: videoUrl }, fullPath, taskId, verifySeedanceVideo);
        if (!saved.success)
            return { error: saved.error };
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
function readImageDataUri(filePath) {
    const stats = fs.statSync(filePath);
    if (stats.size >= MAX_INPUT_IMAGE_BYTES) {
        throw new Error(`Input image too large: ${path.basename(filePath)} (${(stats.size / 1024 / 1024).toFixed(1)}MB, limit 30MB)`);
    }
    const buffer = fs.readFileSync(filePath);
    return `data:${path.extname(filePath).toLowerCase() === '.bmp' ? 'image/bmp' : mimeFromExtension(filePath, 'image')};base64,${buffer.toString('base64')}`;
}
/** Validate input image paths and convert to data URIs (existence·extension·size·total). */
async function prepareImages(filePaths, output, realFaceInput, hasPortraitVideo = false) {
    const inputs = [];
    for (const filePath of filePaths) {
        validateFilePath(filePath, { allowedExtensions: ALLOWED_EXTENSIONS.image });
        if (!fs.existsSync(filePath))
            throw new Error(`Image not found: ${filePath}`);
        const image = (await inspectMedia(filePath)).streams.find(stream => stream.codec_type === 'video');
        const extension = path.extname(filePath).slice(1).toLowerCase();
        const codec = ['jpg', 'jpeg'].includes(extension) ? 'mjpeg' : extension;
        if (!image?.width || !image.height || image.codec_name !== codec)
            throw new Error('Invalid Seedance image format: ' + path.basename(filePath));
        checkDimensions(image.width, image.height, path.basename(filePath));
        const portrait = portraitForImage(filePath, output, realFaceInput);
        if (portrait && new URL(arkBaseUrl()).hostname !== 'ark.ap-southeast.bytepluses.com')
            throw new PortraitError(new Error('modelark_asset_region: select the Singapore inference endpoint for this asset'));
        inputs.push(portrait ? { portrait, sha256: createHash('sha256').update(fs.readFileSync(filePath)).digest('hex') } : readImageDataUri(filePath));
    }
    if (realFaceInput && !hasPortraitVideo && !inputs.some(input => typeof input !== 'string'))
        throw new PortraitError(new Error('modelark_asset_sheet_required: the shot declares a face but has no character sheet portrait or reviewed video asset'));
    assertRequestBudget(inputs.filter(input => typeof input === 'string'));
    return inputs;
}
async function resolvePortraits(inputs) {
    const uris = [];
    for (const input of inputs)
        uris.push(typeof input === 'string' ? input : (await ensurePortrait(input.portrait, input.sha256)).uri);
    return uris;
}
/** The whole request body must stay under 64MB (official) — base64 across every reference file. */
function assertRequestBudget(uris) {
    const total = uris.reduce((sum, uri) => sum + uri.length, 0);
    if (total > MAX_REQUEST_BYTES) {
        throw new Error(`Request body too large: base64 total ${(total / 1024 / 1024).toFixed(1)}MB (limit 64MB). Use fewer reference files or smaller ones.`);
    }
}
/**
 * MIME label for a reference-audio data URI. The API reference gives the template
 * `data:audio/<audio format>;base64,` and lists the formats as wav·mp3, with wav as
 * its only worked example — so `audio/mp3` is the literal reading for mp3, but it is
 * UNVERIFIED against a live call (audio/mpeg is the registered type). Prefer wav.
 */
function audioMimeFromExtension(filePath) {
    return path.extname(filePath).toLowerCase() === '.mp3' ? 'audio/mp3' : 'audio/wav';
}
/** Validate reference audio paths and convert to data URIs (existence · wav/mp3 · 15MB per clip). */
function loadReferenceAudio(filePaths) {
    return filePaths.map((filePath) => {
        validateFilePath(filePath, { allowedExtensions: SEEDANCE_REFERENCE_AUDIO_EXTENSIONS });
        if (!fs.existsSync(filePath))
            throw new Error(`Reference audio not found: ${filePath}`);
        const stats = fs.statSync(filePath);
        if (stats.size > MAX_INPUT_AUDIO_BYTES) {
            throw new Error(`Reference audio too large: ${path.basename(filePath)} (${(stats.size / 1024 / 1024).toFixed(1)}MB, limit 15MB)`);
        }
        return `data:${audioMimeFromExtension(filePath)};base64,${fs.readFileSync(filePath).toString('base64')}`;
    });
}
function videoSeconds(video, media) {
    const seconds = Number(video.duration ?? media.format.duration);
    if (!Number.isFinite(seconds) || seconds <= 0)
        throw new Error('Could not measure Seedance video duration');
    return seconds;
}
function videoFrameFacts(stream, media) {
    const [num, den] = (stream.r_frame_rate || '').split('/').map(Number);
    const fps = num / den;
    if (!stream.width || !stream.height || !Number.isFinite(fps) || fps <= 0)
        throw new Error('Could not read Seedance video dimensions or frame rate');
    return { width: stream.width, height: stream.height, fps, seconds: videoSeconds(stream, media) };
}
/** A quick output probe for the shot timing check. */
export async function probeVideo(file) {
    try {
        const media = await inspectMedia(file);
        const stream = media.streams.find(s => s.codec_type === 'video');
        return stream ? videoFrameFacts(stream, media) : null;
    }
    catch {
        return null;
    }
}
/**
 * Reference-video limits (official): size, frame rate, pixel count, per-clip and total
 * length. The vendor rejects these only after the task is queued and the clip has been
 * fetched, so a wrong render fails here, before a tunnel is opened or anything is billed.
 */
async function checkReferenceVideos(filePaths, spec, model, edit) {
    const [minimum, maxSeconds] = spec.clipSeconds;
    const minSeconds = edit ? 4 : minimum;
    const [minFps, maxFps] = SEEDANCE_REFERENCE_VIDEO_FPS;
    const [minPixels, legacyMaxPixels] = SEEDANCE_REFERENCE_VIDEO_PIXELS;
    const maxPixels = model.startsWith('dreamina-seedance-2-5-') ? 8_847_360 : legacyMaxPixels;
    let total = 0;
    for (const filePath of filePaths) {
        validateFilePath(filePath, { allowedExtensions: SEEDANCE_REFERENCE_VIDEO_EXTENSIONS });
        if (!fs.existsSync(filePath))
            throw new Error(`Reference video not found: ${filePath}`);
        const name = path.basename(filePath);
        const stats = fs.statSync(filePath);
        if (stats.size > MAX_INPUT_VIDEO_BYTES) {
            throw new Error(`Reference video too large: ${name} (${(stats.size / 1024 / 1024).toFixed(1)}MB, limit 200MB)`);
        }
        const media = await inspectMedia(filePath, true);
        const stream = completeVideo(media);
        const mov = path.extname(filePath).toLowerCase() === '.mov';
        const quickTime = media.format.tags?.major_brand?.trim() === 'qt';
        if (mov !== quickTime || !['h264', 'hevc'].includes(stream.codec_name))
            throw new Error('Reference video must contain H.264 or H.265 in the matching MP4 or MOV container: ' + name);
        const badAudio = media.streams.some(s => s.codec_type === 'audio' &&
            !['aac', 'mp3'].includes(s.codec_name) && !(mov && s.codec_name.startsWith('pcm_')));
        if (badAudio)
            throw new Error('Reference video has an unsupported audio codec: ' + name);
        const facts = videoFrameFacts(stream, media);
        checkDimensions(facts.width, facts.height, name);
        if (facts.seconds < minSeconds || facts.seconds > maxSeconds) {
            throw new Error(`Reference video ${name} is ${facts.seconds.toFixed(1)}s — ${model} accepts ${minSeconds}~${maxSeconds}s per clip.`);
        }
        if (facts.fps < minFps || facts.fps > maxFps) {
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
/** Reject unreadable or mislabeled audio before publishing any local references. */
async function checkReferenceAudioDurations(filePaths, spec, model) {
    const [minSeconds, maxSeconds] = spec.clipSeconds;
    let total = 0;
    for (const filePath of filePaths) {
        const media = await inspectMedia(filePath, true);
        const audio = media.streams.find(stream => stream.codec_type === 'audio');
        const format = path.extname(filePath).slice(1).toLowerCase();
        const seconds = Number(audio?.duration ?? media.format.duration);
        if (!audio || !media.format.format_name.split(',').includes(format) ||
            !(Number(audio.nb_read_frames) > 0) || !Number.isFinite(seconds))
            throw new Error('Invalid reference audio: ' + path.basename(filePath));
        if (seconds < minSeconds || seconds > maxSeconds) {
            throw new Error(`Reference audio ${path.basename(filePath)} is ${seconds.toFixed(1)}s — ${model} accepts ${minSeconds}~${maxSeconds}s per clip.`);
        }
        total += seconds;
    }
    if (total > spec.totalSeconds) {
        throw new Error(`Reference audio totals ${total.toFixed(1)}s — ${model} allows ${spec.totalSeconds}s across all clips.`);
    }
}
/** Assemble the shared request body — fields the model doesn't support aren't included at all. */
function buildBody(request, parts) {
    const spec = SEEDANCE_MODEL_SPECS[request.model];
    const body = {
        model: request.model,
        content: [{ type: 'text', text: request.prompt }, ...parts],
        ratio: request.ratio,
        resolution: request.resolution,
        duration: request.durationSeconds,
        watermark: request.watermark,
        ...(request.omniReferenceTaskType && { omni_reference_task_type: request.omniReferenceTaskType }),
    };
    // The vendor default for generate_audio is true. Passing it to a silent-only
    // model gets rejected, so we send it only to models that support it and flip
    // our own default to false — this pipeline attaches narration separately via
    // TTS.
    if (spec.audio)
        body.generate_audio = request.generateAudio;
    return body;
}
/** Assemble the success response — the actual generation result (values the vendor returned) wins. */
function toResponse(request, videoPath, task, taskId) {
    return {
        success: true,
        videoPath,
        prompt: request.prompt,
        model: request.model,
        ratio: task.ratio ?? request.ratio,
        resolution: task.resolution ?? request.resolution,
        duration: task.duration ?? (request.durationSeconds > 0 ? request.durationSeconds : undefined),
        durationSource: task.duration !== undefined ? 'provider_reported' : request.durationSeconds > 0 ? 'requested_seconds' : undefined,
        completionTokens: task.usage?.completion_tokens,
        taskId,
    };
}
/** Before the POST nothing was sent; after it, only an explicit rejection proves no task exists. */
function toFailure(error, posted) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Seedance] Error: ${message}`);
    return { success: false, error: message, ...(!posted && error instanceof PortraitError ? { portraitProblem: error.report } : {}), terminal: !posted || error?.terminal === true };
}
// ── The 3 generation functions ──────────────────────────────────────
/** Generate video from a text prompt */
export async function generateFromText(request) {
    const apiKey = requireArkKey();
    let posted = false;
    try {
        console.error(`[Seedance] Starting text-to-video generation... (model: ${request.model})`);
        posted = true;
        const taskId = await createTask(apiKey, buildBody(request, []));
        recordVideoSubmission(taskId);
        const saved = await awaitVideoAndSave(apiKey, taskId, request.outputPath || process.cwd(), request.filename || `video_${Date.now()}.mp4`);
        if ('error' in saved)
            return { success: false, error: saved.error, terminal: saved.terminal === true, taskId };
        return toResponse(request, saved.videoPath, saved.task, taskId);
    }
    catch (error) {
        return toFailure(error, posted);
    }
}
/** Generate video from an image (first frame · first+last frame interpolation) */
export async function generateFromImage(request) {
    const apiKey = requireArkKey();
    let posted = false;
    try {
        const paths = [request.sourceImagePath, ...(request.lastImagePath ? [request.lastImagePath] : [])];
        const uris = await resolvePortraits(await prepareImages(paths, request.outputPath, request.realFaceInput));
        const images = uris.map((url, index) => ({
            type: 'image_url',
            image_url: { url },
            role: index === 0 ? 'first_frame' : 'last_frame',
        }));
        console.error(`[Seedance] Starting image-to-video generation... (model: ${request.model})`);
        console.error(`[Seedance] First frame: ${request.sourceImagePath}`);
        if (request.lastImagePath)
            console.error(`[Seedance] Last frame: ${request.lastImagePath}`);
        posted = true;
        const taskId = await createTask(apiKey, buildBody(request, images));
        recordVideoSubmission(taskId);
        const saved = await awaitVideoAndSave(apiKey, taskId, request.outputPath || process.cwd(), request.filename || `video_${Date.now()}.mp4`);
        if ('error' in saved)
            return { success: false, error: saved.error, terminal: saved.terminal === true, taskId };
        return {
            ...toResponse(request, saved.videoPath, saved.task, taskId),
            sourceImage: request.sourceImagePath,
            lastImage: request.lastImagePath,
        };
    }
    catch (error) {
        return toFailure(error, posted);
    }
}
/** Generate video with subject consistency from reference images and audio (Dreamina Seedance 2.x only) */
export async function generateWithReferences(request) {
    const apiKey = requireArkKey();
    let posted = false;
    try {
        const spec = SEEDANCE_MODEL_SPECS[request.model];
        let originals;
        try {
            originals = await trustedReferenceVideos(apiKey, request.referenceVideoTaskIds ?? [], spec);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { success: false, terminal: true, error: message,
                originalProblem: { stage: 'seedance_original_lookup', videoSubmitted: false, message } };
        }
        const images = await prepareImages(request.referenceImagePaths, request.outputPath, request.realFaceInput, originals.length > 0 || request.referenceVideoUrls.some(url => url.startsWith('asset://')));
        const audioUris = loadReferenceAudio(request.referenceAudioPaths);
        assertRequestBudget([...images.filter(input => typeof input === 'string'), ...audioUris]);
        if (audioUris.length > 0) {
            await checkReferenceAudioDurations(request.referenceAudioPaths, spec.referenceAudio, request.model);
        }
        let referenceVideoSeconds = originals.reduce((sum, item) => sum + item.seconds, 0);
        if (request.referenceVideoPaths.length > 0) {
            referenceVideoSeconds += await checkReferenceVideos(request.referenceVideoPaths, spec.referenceVideos, request.model, request.omniReferenceTaskType === 'edit');
        }
        // Remote media duration is checked by ModelArk. Each clip contributes at least its minimum.
        const minimumRemoteSeconds = request.omniReferenceTaskType === 'edit' ? 4 : spec.referenceVideos.clipSeconds[0];
        if (originals.some(item => item.seconds < minimumRemoteSeconds))
            throw new Error('Original reference video is too short for this operation');
        if (referenceVideoSeconds + request.referenceVideoUrls.length * minimumRemoteSeconds > spec.referenceVideos.totalSeconds) {
            throw new Error('Reference videos exceed the model duration limit.');
        }
        const imageUris = await resolvePortraits(images);
        const published = await publishFiles(request.referenceVideoPaths);
        try {
            const videoUrls = [...published.urls, ...request.referenceVideoUrls, ...originals.map(item => item.url)];
            // Images, then videos, then audio. The prompt's @Image N / @Video N / @Audio N count
            // each kind in its own upload order, so the caller's binding sentence ("Images 1-2 are
            // Character 1 and correspond to Audio 1") reads straight off the arrays.
            const parts = [
                ...imageUris.map((url) => ({ type: 'image_url', image_url: { url }, role: 'reference_image' })),
                ...videoUrls.map((url) => ({ type: 'video_url', video_url: { url }, role: 'reference_video' })),
                ...audioUris.map((url) => ({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' })),
            ];
            console.error(`[Seedance] Starting reference-to-video generation... (model: ${request.model})`);
            if (imageUris.length > 0)
                console.error(`[Seedance] Reference images: ${request.referenceImagePaths.join(', ')}`);
            if (videoUrls.length > 0)
                console.error(`[Seedance] Reference videos: ${videoUrls.length}`);
            if (audioUris.length > 0)
                console.error(`[Seedance] Reference audio: ${request.referenceAudioPaths.join(', ')}`);
            posted = true;
            const taskId = await createTask(apiKey, buildBody(request, parts));
            recordVideoSubmission(taskId);
            const saved = await awaitVideoAndSave(apiKey, taskId, request.outputPath || process.cwd(), request.filename || `video_ref_${Date.now()}.mp4`);
            if ('error' in saved)
                return { success: false, error: saved.error, terminal: saved.terminal === true, taskId };
            return {
                ...toResponse(request, saved.videoPath, saved.task, taskId),
                referenceImages: request.referenceImagePaths,
                referenceAudios: request.referenceAudioPaths,
                ...(videoUrls.length > 0
                    ? {
                        referenceVideos: [...request.referenceVideoPaths, ...request.referenceVideoUrls, ...(request.referenceVideoTaskIds ?? [])],
                        ...(request.referenceVideoUrls.length ? {} : { referenceVideoSeconds }),
                        ...(published.urls.length > 0 ? { referenceVideoRoute: published.how } : {}),
                    }
                    : {}),
            };
        }
        finally {
            await published.close();
        }
    }
    catch (error) {
        return toFailure(error, posted);
    }
}
