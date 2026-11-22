/** LTX v2 provider request contract published by the unified GenAI gateway. */
import { openingPositionsSchema, openingPrompt, validateOpening } from './msr-opening.js';
import { z } from 'zod';
import { guidanceSchema, guidanceWireKey } from './astra-video-client.js';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';
import { GenaiRequestError, astraGenaiBaseUrl, downloadGenaiResult, pollGenaiJob, requestGenai, requireAstraGenaiKey, requestGenaiMedia, genaiImageUriSchema, genaiSourceUri, genaiAudioUri } from './astra-genai-client.js';
import { atomicJson } from './routing-files.js';
import { GENAI_MSR_INLINE_MAX_BYTES, GENAI_FILE_GONE, GENAI_FILE_SCHEME, forgetGenaiUploads, genaiUploadable, shrinkImageToFit, uploadGenaiFile } from './astra-genai-upload.js';
import { recordVideoSubmission } from './video-events.js';
export const GENAI_VIDEO_MODELS = ['ltx-2.5-22b-distilled', 'ltx-2.5-22b-dev'];
/** Preserve selected geometry; the live gateway validates its current backend's supported sizes. */
export function genaiV2Resolution(saved) {
    return saved;
}
const localResolution = z.string().regex(/^[1-9]\d*x[1-9]\d*$/).refine(value => {
    const [w, h] = value.split('x').map(Number), width = Math.ceil(w / 64) * 64, height = Math.ceil(h / 64) * 64;
    return Number.isSafeInteger(w) && Number.isSafeInteger(h) && Math.min(w, h) >= 64 && w % 2 === 0 && h % 2 === 0 &&
        Math.max(width, height) <= 1920 && width * height <= 2064384;
}, 'Use even WIDTHxHEIGHT sides of at least 64; rounded-up /64 sides must fit 1920 and 2,064,384 pixels');
/** MSR's guidance knobs: the only way distilled sampling gets a negative pass. */
const msrGuidanceFields = {
    guidanceScale: z.number().finite().min(1).max(10).optional(),
    nagScale: z.number().finite().min(0).max(100).optional(),
    nagAlpha: z.number().finite().min(0).max(1).optional(),
    nagTau: z.number().finite().min(0).max(10).optional(),
};
function msrNegativeRule(args, issue) {
    if ((args.nagAlpha !== undefined || args.nagTau !== undefined) && args.nagScale === undefined)
        issue('MSR nagAlpha and nagTau require an explicit nagScale');
    if ((args.nagScale ?? 0) > 0 && args.negativePrompt === undefined)
        issue('MSR nagScale > 0 requires negativePrompt');
    if (args.negativePrompt !== undefined && (args.guidanceScale ?? 1) <= 1 && (args.nagScale ?? 0) === 0)
        issue('MSR negativePrompt requires guidanceScale > 1 or nagScale > 0');
}
/** Wire fields are sent only when set, so an older gateway keeps taking ordinary requests. */
function negativeBody(args) {
    return {
        ...(args.negativePrompt === undefined ? {} : { negative_prompt: args.negativePrompt }),
        ...(args.guidanceScale === undefined ? {} : { guidance_scale: args.guidanceScale }),
        ...((args.nagScale ?? 0) > 0 ? { nag_scale: args.nagScale,
            ...(args.nagAlpha === undefined ? {} : { nag_alpha: args.nagAlpha }),
            ...(args.nagTau === undefined ? {} : { nag_tau: args.nagTau }) } : {}),
    };
}
/** The dev pipelines run guided, so their backend takes a negative prompt of at most 2000 characters; distilled has no negative pass. */
function devNegativeRule(args, ctx) {
    if (args.negativePrompt === undefined)
        return;
    const issue = (message) => ctx.addIssue({ code: 'custom', path: ['negativePrompt'], message });
    if (args.model !== 'ltx-2.5-22b-dev')
        issue('negativePrompt requires ltx-2.5-22b-dev, or image-to-video references with guidanceScale > 1 or nagScale > 0');
    if (args.negativePrompt.length > 2000)
        issue('The dev backend accepts a negativePrompt of at most 2000 characters');
}
const exactFrames = z.number().int().min(25).max(361).refine(n => (n - 1) % 8 === 0, 'Use 8k+1 frames');
// V2 describes these cuts in the backend prompt. The contract has no frame index.
export const genaiShotsSchema = z.array(z.object({
    description: z.string().trim().min(1).max(2000),
    audio: z.string().trim().min(1).max(2000).optional(),
    transition: z.literal('hard_cut').optional(),
}).strict()).min(2).max(4).refine(shots => !shots[0].transition, 'Omit transition on the opening shot');
const temporalImages = z.array(z.object({
    imageUri: genaiImageUriSchema.optional(), imagePath: z.string().min(1).optional(),
    frameIdx: z.number().int().min(0).max(360),
    strength: z.number().min(0).max(1).optional(), crf: z.number().int().min(0).max(51).optional(),
}).strict().refine(pin => !!pin.imageUri !== !!pin.imagePath, 'Supply exactly one imageUri or imagePath')).min(1).max(8);
function temporalBody(pins) {
    if (!pins)
        return {};
    return { keyframes: pins.map(pin => ({ image_uri: genaiSourceUri(pin.imageUri, pin.imagePath), frame_idx: pin.frameIdx,
            ...(pin.strength === undefined ? {} : { strength: pin.strength }), ...(pin.crf === undefined ? {} : { crf: pin.crf }) })) };
}
function validatePins(pins, start, end, length, ctx) {
    if (!pins)
        return;
    const indices = pins.map(pin => pin.frameIdx);
    if (indices.length + Number(start) + Number(end) > 8 || new Set(indices).size !== indices.length ||
        indices.some(i => (start && i === 0) || (length !== undefined && i >= length - Number(end))))
        ctx.addIssue({ code: 'custom', path: ['keyframes'], message: 'Use up to eight distinct frame indices inside the delivered clip, including its pinned endpoints' });
}
export const genaiSampling = {
    seed: z.number().int().min(0).max(2147483647).optional(),
    numInferenceSteps: z.number().int().min(1).max(50).optional(),
    guidance: guidanceSchema,
};
const loraName = z.string().trim().min(1).max(128);
export const genaiVisualSampling = {
    numGeneratedKeyframes: z.number().int().min(0).max(16).optional(),
    lora: z.array(z.union([loraName, z.object({ name: loraName, strength: z.number().min(0).max(2).optional() }).strict()])).min(1).max(2).optional(),
};
function samplingBody(args) {
    return {
        ...(args.seed === undefined ? {} : { seed: args.seed }),
        ...(args.numInferenceSteps === undefined ? {} : { num_inference_steps: args.numInferenceSteps }),
        ...(args.numGeneratedKeyframes === undefined ? {} : { num_generated_keyframes: args.numGeneratedKeyframes }),
        ...(args.guidance === undefined ? {} : { guidance: Object.fromEntries(Object.entries(args.guidance).map(([k, v]) => [guidanceWireKey(k), v])) }),
        ...(args.lora === undefined ? {} : { lora: args.lora }),
    };
}
const textVideoFields = z.object({
    ...genaiSampling, ...genaiVisualSampling,
    prompt: z.string().min(1).max(2000),
    negativePrompt: z.string().trim().min(1).max(5000).optional(),
    model: z.enum(GENAI_VIDEO_MODELS),
    duration: z.number().int().min(1).nullable().optional(),
    numFrames: exactFrames.optional(),
    resolution: localResolution,
    fps: z.union([z.literal(24), z.literal(25), z.literal(48), z.literal(50)]).default(24),
    generateAudio: z.boolean().default(true),
    shots: genaiShotsSchema.optional(),
    reserveUsd: z.number().finite().nonnegative(),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('video').refine(name => name.endsWith('.mp4'), 'Use an .mp4 filename').optional(),
}).strict();
function localVideoTiming(args, ctx) {
    const refs = 'references' in args && !!args.references;
    const promptLimit = refs ? 5000 : 2000;
    if ([...openingPrompt(args.prompt, args.openingPositions)].length > promptLimit)
        ctx.addIssue({ code: 'custom', path: ['prompt'], message: 'Prompt exceeds ' + promptLimit + ' characters' });
    if (args.model !== 'ltx-2.5-22b-dev' && (args.guidance || args.numInferenceSteps !== undefined))
        ctx.addIssue({ code: 'custom', message: 'guidance and numInferenceSteps require dev' });
    if (args.lora && (args.model !== 'ltx-2.5-22b-distilled' || refs))
        ctx.addIssue({ code: 'custom', message: 'LoRA selection requires plain distilled T2V or I2V' });
    if (refs && args.numGeneratedKeyframes !== undefined)
        ctx.addIssue({ code: 'custom', message: 'MSR does not accept numGeneratedKeyframes' });
    if (args.duration != null && args.numFrames !== undefined)
        ctx.addIssue({ code: 'custom', path: ['numFrames'], message: 'Omit duration when using numFrames' });
    if (args.duration != null && 8 * Math.ceil((args.duration * args.fps - 1) / 8) + 1 > 361)
        ctx.addIssue({ code: 'custom', path: ['duration'], message: 'Duration and fps exceed the local 361-frame limit' });
    if (args.shots) {
        if (args.shots[0].transition)
            ctx.addIssue({ code: 'custom', path: ['shots', 0, 'transition'], message: 'Omit transition on the opening shot' });
        const parts = [openingPrompt(args.prompt, args.openingPositions)];
        args.shots.forEach((shot, i) => {
            parts.push((i === 0 ? 'The opening shot shows ' : 'A hard cut moves to ') + shot.description);
            if (shot.audio)
                parts.push('Audio: ' + shot.audio);
        });
        if ([...parts.join('\n\n')].length > promptLimit)
            ctx.addIssue({ code: 'custom', path: ['shots'], message: 'Composed shot prompt exceeds ' + promptLimit + ' characters' });
    }
}
export const genaiTextToVideoSchema = textVideoFields.superRefine((args, ctx) => { localVideoTiming(args, ctx); devNegativeRule(args, ctx); });
const msrReferences = z.array(z.object({
    imageUri: genaiImageUriSchema.optional(), imagePath: z.string().min(1).optional(),
    background: z.boolean().default(false), nonCharacter: z.boolean().optional(),
    // Voice sample for this subject; the gateway pairs it with the same picture slot.
    audioUri: z.string().min(1).optional(), audioPath: z.string().min(1).optional(),
}).strict().refine(ref => Number(!!ref.imageUri) + Number(!!ref.imagePath) === 1, 'Supply exactly one imageUri or imagePath')
    .refine(ref => oneOf(ref.audioUri, ref.audioPath) <= 1, 'Supply at most one audioUri or audioPath')).min(1).max(5);
function validateVoiceSlots(references, issue) {
    let subject = 0;
    for (const ref of references) {
        subject += Number(!ref.background);
        if (!oneOf(ref.audioUri, ref.audioPath))
            continue;
        if (ref.background)
            issue('MSR voice samples belong to subjects, not the background');
        else if (subject > 2)
            issue('MSR voice samples fit the first two subjects only');
    }
}
export const genaiImageToVideoSchema = textVideoFields.extend({
    prompt: z.string().min(1).max(5000),
    imageUri: genaiImageUriSchema.optional(), imagePath: z.string().min(1).optional(),
    lastFrameUri: genaiImageUriSchema.nullable().optional(), lastFramePath: z.string().min(1).optional(),
    keyframes: temporalImages.optional(),
    referenceStrength: z.number().finite().min(0).max(1).optional(),
    referenceFrames: z.union([z.literal(25), z.literal(33)]).optional(),
    skipStage2: z.boolean().optional(),
    references: msrReferences.optional(), openingPositions: openingPositionsSchema.optional(),
    ...msrGuidanceFields,
}).strict().superRefine((args, ctx) => {
    const issue = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    localVideoTiming(args, ctx);
    const length = args.numFrames ?? (args.duration == null ? undefined : args.duration * args.fps);
    const end = args.lastFrameUri != null || args.lastFramePath !== undefined;
    if (length === undefined && (end || args.keyframes))
        issue('Temporal pins require duration or numFrames');
    validatePins(args.keyframes, true, end, length, ctx);
    if (Number(args.imageUri !== undefined) + Number(args.imagePath !== undefined) !== 1)
        issue('Supply exactly one imageUri or imagePath');
    if (args.lastFrameUri != null && args.lastFramePath !== undefined)
        issue('Supply at most one lastFrameUri or lastFramePath');
    if (args.skipStage2 && args.resolution.split('x').some(side => Number(side) % 4))
        issue('skipStage2 requires sides divisible by four for an even half-size output');
    if (!args.references) {
        if (args.referenceStrength !== undefined || args.referenceFrames !== undefined || args.skipStage2 !== undefined)
            issue('referenceStrength, referenceFrames and skipStage2 require references');
        if (args.openingPositions !== undefined)
            issue('openingPositions requires MSR references');
        if (Object.keys(msrGuidanceFields).some(key => args[key] !== undefined))
            issue('guidanceScale and NAG require references (MSR conditioning); ltx-2.5-22b-dev already runs guided');
        devNegativeRule(args, ctx);
    }
    else {
        validateOpening(args.prompt, args.openingPositions, args.references, issue, 5000);
        validateVoiceSlots(args.references, issue);
        msrNegativeRule(args, issue);
        if (args.model !== 'ltx-2.5-22b-distilled')
            issue('Additional references require ltx-2.5-22b-distilled (MSR conditioning)');
        if (length === undefined)
            issue('Additional references require duration or numFrames');
        const backgrounds = args.references.filter(ref => ref.background).length;
        if (backgrounds > 1 || args.references.length - backgrounds > 4 || backgrounds === args.references.length)
            issue('References require 1..4 subjects and at most one background');
    }
});
// Gateway contract (genai-gateway#13): four data URI MIME types, 15,000,000 base64 characters.
export { GENAI_AUDIO_TYPES, GENAI_AUDIO_DATA_URI_MAX, genaiAudioUri } from './astra-genai-client.js';
const oneOf = (a, b) => Number(a !== undefined) + Number(b !== undefined);
export const genaiAudioToVideoSchema = z.object({
    ...genaiSampling,
    prompt: z.string().trim().min(1).max(2000),
    negativePrompt: z.string().trim().min(1).max(2000).optional(),
    model: z.enum(['ltx-2.5-22b-dev', 'ltx-2.5-22b-distilled']),
    resolution: localResolution,
    keyframes: temporalImages.optional(),
    fps: z.union([z.literal(24), z.literal(25), z.literal(48), z.literal(50)]).default(24),
    audioPath: z.string().min(1).optional(), audioUri: z.string().min(1).optional(),
    imagePath: z.string().min(1).optional(), imageUri: genaiImageUriSchema.optional(),
    lastFramePath: z.string().min(1).optional(), lastFrameUri: genaiImageUriSchema.optional(),
    reserveUsd: z.number().finite().nonnegative(),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('video').refine(name => name.endsWith('.mp4'), 'Use an .mp4 filename').optional(),
}).strict().superRefine((args, ctx) => {
    const issue = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    validatePins(args.keyframes, !!(args.imagePath || args.imageUri), !!(args.lastFramePath || args.lastFrameUri), undefined, ctx);
    if (args.model === 'ltx-2.5-22b-distilled' && (args.negativePrompt || args.guidance || args.numInferenceSteps !== undefined))
        issue('The distilled ComfyUI A2V pipeline uses fixed unguided sampling');
    if (oneOf(args.audioPath, args.audioUri) !== 1)
        issue('Supply exactly one audioPath or audioUri');
    if (oneOf(args.imagePath, args.imageUri) > 1)
        issue('Supply at most one imagePath or imageUri');
    if (oneOf(args.lastFramePath, args.lastFrameUri) > 1)
        issue('Supply at most one lastFramePath or lastFrameUri');
    if (oneOf(args.lastFramePath, args.lastFrameUri) && !oneOf(args.imagePath, args.imageUri))
        issue('A last frame requires a first image');
});
export function buildGenaiAudioBody(args) {
    const image = oneOf(args.imagePath, args.imageUri) ? genaiSourceUri(args.imageUri, args.imagePath) : undefined;
    const last = oneOf(args.lastFramePath, args.lastFrameUri) ? genaiSourceUri(args.lastFrameUri, args.lastFramePath) : undefined;
    return { audio_uri: genaiAudioUri(args.audioUri, args.audioPath), prompt: args.prompt, model: args.model, resolution: args.resolution, fps: args.fps,
        ...(image === undefined ? {} : { image_uri: image }), ...(last === undefined ? {} : { last_frame_uri: last }),
        ...samplingBody(args), ...temporalBody(args.keyframes), ...negativeBody({ negativePrompt: args.negativePrompt }) };
}
export const GENAI_MSR_FRAMES = { min: 25, max: 361, step: 8, frameRate: 24 };
export const genaiMsrSchema = z.object({
    prompt: z.string().trim().min(1).max(5000),
    negativePrompt: z.string().trim().min(1).max(5000).optional(),
    ...msrGuidanceFields,
    skipStage2: z.boolean().optional(),
    references: msrReferences, openingPositions: openingPositionsSchema,
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
    const issue = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    validateOpening(args.prompt, args.openingPositions, args.references, issue, 5000);
    msrNegativeRule(args, issue);
    const backgrounds = args.references.filter(ref => ref.background).length;
    if (backgrounds === args.references.length || backgrounds > 1 || args.references.length - backgrounds > 4)
        issue('MSR requires 1..4 subjects and at most one background');
    validateVoiceSlots(args.references, issue);
    if (args.width * args.height > 2064384)
        issue('MSR maximum is 2,064,384 pixels');
    if (args.duration !== undefined) {
        if (args.numFrames !== undefined)
            issue('Omit numFrames when using duration');
        const frames = 1 + 8 * Math.ceil((args.duration * args.frameRate - 1) / 8 - 0.5 - 1e-9);
        if (frames < GENAI_MSR_FRAMES.min || frames > GENAI_MSR_FRAMES.max)
            issue('MSR duration must round to 25..361 frames');
    }
});
function referenceBody(ref) {
    return {
        image_uri: genaiSourceUri(ref.imageUri, ref.imagePath),
        background: ref.background,
        ...(ref.audioUri || ref.audioPath ? { audio_uri: genaiAudioUri(ref.audioUri, ref.audioPath) } : {}),
    };
}
export function buildGenaiMsrBody(args) {
    return { prompt: openingPrompt(args.prompt, args.openingPositions), ...negativeBody(args),
        references: args.references.map(referenceBody),
        ...(args.skipStage2 === undefined ? {} : { skip_stage_2: args.skipStage2 }),
        reference_strength: args.referenceStrength, reference_frames: args.referenceFrames,
        width: args.width, height: args.height, frame_rate: args.frameRate, seed: args.seed,
        ...(args.duration === undefined ? { num_frames: args.numFrames ?? 121 } : { duration: args.duration }) };
}
let msrVoiceCache;
/**
 * Ask the gateway whether its MSR backend takes voice samples. An older gateway
 * (404), a missing key or an unreachable gateway counts as no. Cached so the plan
 * and the execute-time replan see the same answer.
 */
export async function refreshGenaiMsrVoice(force = false) {
    const origin = astraGenaiBaseUrl();
    if (!force && msrVoiceCache?.origin === origin && Date.now() - msrVoiceCache.at < msrVoiceCache.ttl)
        return msrVoiceCache.value;
    let value = false, ttl = 60_000, promptLimit = 2000;
    try {
        const body = z.object({ voice_references: z.boolean(), prompt_max_chars: z.number().int().positive().optional() }).passthrough()
            .parse(await requestGenai('GET', '/v1/ltx/msr/capabilities', undefined, 15_000));
        value = body.voice_references;
        ttl = 600_000;
        promptLimit = Math.min(5000, body.prompt_max_chars ?? 2000);
    }
    catch { /* Unknown support is treated as unsupported; the plan says so. */ }
    msrVoiceCache = { origin, value, promptLimit, at: Date.now(), ttl };
    return value;
}
export function genaiMsrVoiceReferences() { return msrVoiceCache?.origin === astraGenaiBaseUrl() && msrVoiceCache.value; }
export function genaiMsrPromptLimit() { return msrVoiceCache?.origin === astraGenaiBaseUrl() ? msrVoiceCache.promptLimit : 2000; }
/** Only provider fields cross the wire; local output/budget controls never do. */
export function buildGenaiVideoBody(args) {
    return {
        prompt: openingPrompt(args.prompt, args.openingPositions), model: args.model, ...(args.numFrames === undefined ? { duration: args.duration ?? null } : { num_frames: args.numFrames }), resolution: args.resolution,
        fps: args.fps, generate_audio: args.generateAudio,
        ...(args.shots ? { shots: args.shots } : {}), ...samplingBody(args), ...temporalBody(args.keyframes),
        // Local frames travel as checked data URIs, like MSR and audio-to-video.
        ...(args.imageUri === undefined && args.imagePath === undefined ? {} : { image_uri: genaiSourceUri(args.imageUri, args.imagePath) }),
        ...(args.lastFramePath !== undefined ? { last_frame_uri: genaiSourceUri(undefined, args.lastFramePath) }
            : args.lastFrameUri === undefined ? {} : { last_frame_uri: args.lastFrameUri === null ? null : genaiSourceUri(args.lastFrameUri) }),
        ...(args.references === undefined ? {} : { references: args.references.map(referenceBody) }),
        ...(args.referenceStrength === undefined ? {} : { reference_strength: args.referenceStrength }),
        ...(args.referenceFrames === undefined ? {} : { reference_frames: args.referenceFrames }),
        ...(args.skipStage2 === undefined ? {} : { skip_stage_2: args.skipStage2 }),
        ...negativeBody(args),
    };
}
const operationSchema = z.enum(['text-to-video', 'image-to-video', 'audio-to-video', 'msr']);
const receiptSchema = z.object({
    version: z.literal(1), baseUrl: z.string(), operation: operationSchema, fingerprint: z.string(),
    videoPath: z.string(), jobId: z.string().min(1).optional(),
    status: z.enum(['submitting', 'submitted', 'completed']), sha256: z.string().optional(),
}).strict();
// The gateway advertises LTX provider compatibility; response fields come from LTX v2 docs.
const statusSchema = z.object({ id: z.string().min(1), status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']),
    result: z.object({ video_url: z.string().min(1).optional() }).passthrough().nullish(), error: z.unknown().optional(),
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
    // The gateway's own failed status is terminal job evidence (managed routing frees the slot).
    if (job.status === 'failed' || job.status === 'cancelled')
        throw new GenaiRequestError(`GenAI video ${receipt.jobId} ${job.status}: ${JSON.stringify(job.error ?? 'No details').slice(0, 1000)}`, true, 200);
    if (job.status !== 'completed' || !input.download)
        return { jobId: receipt.jobId, status: job.status, downloaded: false, review: 'not_reviewed' };
    if (!job.result?.video_url)
        throw new Error('GenAI completed without result.video_url; retain the receipt, do not resubmit.');
    let bytes;
    if (job.result.authentication === 'same GatewayToken required') {
        const url = new URL(job.result.video_url, astraGenaiBaseUrl() + '/');
        if (url.origin !== new URL(astraGenaiBaseUrl()).origin || url.username || url.password || url.search || url.hash ||
            !/^\/v1\/ltx\/desktop\/assets\/[A-Za-z0-9_-]+\/bytes$/.test(url.pathname))
            throw new Error('Invalid private GenAI video URL; retain receipt');
        bytes = await requestGenaiMedia(url.pathname, undefined, route);
    }
    else
        bytes = await downloadGenaiResult(job.result.video_url);
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
/** A fallback body above this is not sent: voice cannot be shrunk, and so large a body on a slow link meets the edge's 524 again. */
export { GENAI_MSR_INLINE_MAX_BYTES } from './astra-genai-upload.js';
export async function prepareGenaiMsrSources(body) {
    const size = /^(\d+)x(\d+)$/.exec(body.resolution ?? '');
    const width = body.width ?? Number(size?.[1]), height = body.height ?? Number(size?.[2]);
    let supported = true;
    const send = async (uri, shrink) => {
        const match = /^data:([^;,]+);base64,(.*)$/s.exec(uri);
        if (!match)
            return uri;
        const bytes = shrink && width > 0 && height > 0 ? shrinkImageToFit(Buffer.from(match[2], 'base64'), width, height) : Buffer.from(match[2], 'base64');
        // Only a gateway answer (no upload API, a limit, a full disk) stops later uploads; a type it does not take goes inline alone.
        const uploadable = supported && genaiUploadable(bytes, match[1]);
        const id = uploadable ? await uploadGenaiFile(bytes, match[1]) : undefined;
        if (uploadable && id === undefined)
            supported = false;
        return id ?? `data:${match[1]};base64,${bytes.toString('base64')}`;
    };
    const references = [];
    for (const ref of body.references ?? [])
        references.push({ ...ref, image_uri: await send(ref.image_uri, true),
            ...('audio_uri' in ref && typeof ref.audio_uri === 'string' ? { audio_uri: await send(ref.audio_uri, false) } : {}) });
    const keyframes = [];
    for (const pin of body.keyframes ?? [])
        keyframes.push({ ...pin, image_uri: await send(pin.image_uri, false) });
    const prepared = { ...body, ...(body.references ? { references } : {}), ...(body.keyframes ? { keyframes } : {}),
        ...(body.image_uri === undefined ? {} : { image_uri: await send(body.image_uri, false) }),
        ...(body.last_frame_uri == null ? {} : { last_frame_uri: await send(body.last_frame_uri, false) }),
    };
    const bytes = Buffer.byteLength(JSON.stringify(prepared));
    if (bytes - (body.audio_uri?.length ?? 0) > GENAI_MSR_INLINE_MAX_BYTES)
        throw new Error(`msr_body_too_large: the gateway did not take the chunked upload and the inline request is ${(bytes / 1e6).toFixed(1)} MB (limit 8 MB); nothing was submitted. Try again later, or use a shorter voice sample.`);
    return prepared;
}
// A busy MSR backend acknowledged a submission after 480 s (2026-10-30); 60 s orphaned jobs.
const SUBMIT_TIMEOUT_MS = 15 * 60_000;
function genaiVideoRoute(operation) {
    return operation === 'msr' ? '/v1/ltx/msr' : `/v1/ltx/v2/${operation}`;
}
const genaiModes = {
    astra_genai_text2video: 'text2video', astra_genai_img2video: 'image2video',
    astra_genai_audio2video: 'audio2video', astra_genai_msr: 'msr',
};
const deployedModel = z.object({
    id: z.string(), parameters_by_mode: z.record(z.array(z.string())).optional(),
    limits: z.record(z.unknown()).optional(),
});
/** Both planning and submission use the selected gateway's contract for version-dependent inputs. */
export async function checkGenaiVideoOptions(tool, args) {
    const mode = genaiModes[tool];
    if (!mode)
        return;
    if (mode === 'msr' || (mode === 'image2video' && args.references)) {
        const prompt = openingPrompt(String(args.prompt), args.openingPositions);
        const parts = [prompt];
        for (const [i, shot] of (Array.isArray(args.shots) ? args.shots : []).entries()) {
            parts.push((i === 0 ? 'The opening shot shows ' : 'A hard cut moves to ') + shot.description);
            if (shot.audio)
                parts.push('Audio: ' + shot.audio);
        }
        const chars = Math.max([...parts.join('\n\n')].length, [...String(args.negativePrompt ?? '')].length);
        if (chars > 2000) {
            const caps = z.object({ prompt_max_chars: z.number().int().optional() }).parse(await requestGenai('GET', '/v1/ltx/msr/capabilities', undefined, 15_000));
            if (chars > (caps.prompt_max_chars ?? 2000))
                throw new GenaiRequestError('msr_prompt_limit: prompt exceeds the deployed backend limit', true, 422);
        }
    }
    const wireFields = {
        seed: 'seed', numInferenceSteps: 'num_inference_steps', guidance: 'guidance', lora: 'lora', numGeneratedKeyframes: 'num_generated_keyframes',
        numFrames: 'num_frames', shots: 'shots', negativePrompt: 'negative_prompt', guidanceScale: 'guidance_scale',
        referenceStrength: 'reference_strength', referenceFrames: 'reference_frames',
        nagScale: 'nag_scale', nagAlpha: 'nag_alpha', nagTau: 'nag_tau', skipStage2: 'skip_stage_2',
    };
    const requested = Object.entries(wireFields).filter(([key]) => args[key] !== undefined &&
        (mode !== 'msr' || key === 'skipStage2'));
    const needsAudioModel = mode === 'audio2video' && args.model === 'ltx-2.5-22b-distilled';
    if (!requested.length && !args.keyframes && !needsAudioModel)
        return;
    let models;
    try {
        const response = await requestGenai('GET', '/v1/models', undefined, 15_000);
        models = z.object({ data: z.array(deployedModel) }).parse(response).data;
    }
    catch {
        throw new GenaiRequestError('ltx_capabilities_unavailable: cannot verify the requested gateway fields before submission', true, 503);
    }
    const model = models.find(entry => entry.id === (mode === 'msr' ? 'ltx-msr' : args.model));
    const fields = model?.parameters_by_mode?.[mode] ?? [];
    if (needsAudioModel && !model?.parameters_by_mode?.audio2video)
        throw new GenaiRequestError('ltx_fields_unsupported: this gateway does not advertise distilled audio2video', true, 422);
    const missing = requested.filter(([, wire]) => !fields.includes(wire)).map(([key]) => key);
    if (Array.isArray(args.keyframes)) {
        const limit = z.object({ temporal_images_including_endpoints: z.number().int() }).safeParse(model?.limits?.[mode]);
        const count = args.keyframes.length + Number(!!(args.imagePath || args.imageUri)) + Number(!!(args.lastFramePath || args.lastFrameUri));
        if (!limit.success || count > limit.data.temporal_images_including_endpoints)
            missing.push('keyframes');
    }
    if (missing.length)
        throw new GenaiRequestError(`ltx_fields_unsupported: ${mode} on ${model?.id ?? args.model} does not advertise ${missing.join(', ')}`, true, 422);
}
export async function generateGenaiVideo(operation, input) {
    const args = (operation === 'msr' ? genaiMsrSchema : operation === 'audio-to-video' ? genaiAudioToVideoSchema
        : operation === 'text-to-video' ? genaiTextToVideoSchema : genaiImageToVideoSchema).parse(input);
    requireAstraGenaiKey();
    const body = operation === 'msr' ? buildGenaiMsrBody(args) : operation === 'audio-to-video'
        ? buildGenaiAudioBody(args) : buildGenaiVideoBody(args);
    const usesReferences = 'references' in body && Array.isArray(body.references) && body.references.length > 0;
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
        const tools = { 'text-to-video': 'astra_genai_text2video', 'image-to-video': 'astra_genai_img2video', 'audio-to-video': 'astra_genai_audio2video', msr: 'astra_genai_msr' };
        await checkGenaiVideoOptions(tools[operation], args);
        if (operation === 'image-to-video' && usesReferences) {
            let capabilities;
            try {
                capabilities = z.object({ image_conditioning: z.boolean().optional(), voice_references: z.boolean().optional() }).passthrough()
                    .parse(await requestGenai('GET', '/v1/ltx/msr/capabilities', undefined, 15_000));
            }
            catch {
                // No generation or upload was attempted; release the managed reservation.
                throw new GenaiRequestError('image_references_capability_unavailable: cannot verify combined image conditioning before submission; no generation was requested', true, 503);
            }
            if (capabilities.image_conditioning !== true)
                throw new GenaiRequestError('image_references_unsupported: the GenAI backend does not advertise combined start/end frames and subject references; no request was submitted', true, 422);
            if (body.references?.some(ref => ref.audio_uri) && capabilities.voice_references !== true)
                throw new GenaiRequestError('msr_voice_unsupported: the GenAI MSR backend does not accept voice samples', true, 422);
        }
        // References on image-to-video run on the same MSR backend, so its negatives need the same advertisement.
        const msrArgs = operation === 'msr' || usesReferences ? args : undefined;
        if (msrArgs && (msrArgs.negativePrompt !== undefined || (msrArgs.guidanceScale ?? 1) > 1)) {
            const capabilities = z.object({ negative_prompt: z.boolean().optional(), nag: z.boolean().optional() }).passthrough()
                .parse(await requestGenai('GET', '/v1/ltx/msr/capabilities', undefined, 15_000));
            if ((msrArgs.nagScale ?? 0) > 0 && capabilities.nag !== true)
                throw new GenaiRequestError('msr_nag_unsupported: the GenAI MSR backend does not advertise NAG', true, 422);
            if (capabilities.negative_prompt !== true)
                throw new GenaiRequestError('msr_negative_unsupported: the GenAI MSR backend does not advertise negative conditioning', true, 422);
        }
        if (operation === 'msr' && args.references.some(ref => oneOf(ref.audioUri, ref.audioPath)) && !await refreshGenaiMsrVoice(true))
            throw new Error('msr_voice_unsupported: the GenAI MSR backend does not accept voice samples (GET /v1/ltx/msr/capabilities)');
        // Upload before the receipt exists: a failed upload leaves nothing to recover and the call can simply run again.
        // The fingerprint stays on the request as written, so a resumed receipt still matches.
        const submitted = usesReferences || 'keyframes' in body ? await prepareGenaiMsrSources(body) : body;
        const receipt = { version: 1, baseUrl: astraGenaiBaseUrl(), operation, fingerprint, videoPath, status: 'submitting' };
        fs.writeFileSync(receiptPath, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
        let response;
        try {
            try {
                response = await requestGenai('POST', genaiVideoRoute(operation), submitted, SUBMIT_TIMEOUT_MS);
            }
            catch (error) {
                // The gateway no longer knows an uploaded id (expired, restarted). That 400 created no job: upload again and resubmit once.
                if (!JSON.stringify(submitted).includes(GENAI_FILE_SCHEME) || !(error instanceof GenaiRequestError && error.httpStatus === 400 && GENAI_FILE_GONE.test(error.message)))
                    throw error;
                forgetGenaiUploads();
                let again;
                try {
                    again = await prepareGenaiMsrSources(body);
                }
                catch (uploadError) {
                    fs.rmSync(receiptPath, { force: true });
                    throw uploadError;
                }
                response = await requestGenai('POST', genaiVideoRoute(operation), again, SUBMIT_TIMEOUT_MS);
            }
        }
        catch (error) {
            // An explicit rejection created no job; free the output name so a corrected request can retry it.
            if (error instanceof GenaiRequestError && error.terminal)
                fs.rmSync(receiptPath, { force: true });
            throw error;
        }
        const accepted = z.object({ id: z.string().min(1) }).passthrough().parse(response);
        atomicJson(receiptPath, { ...receipt, jobId: accepted.id, status: 'submitted' });
        recordVideoSubmission(accepted.id);
    }
    const result = await pollGenaiJob(() => getGenaiVideoStatus({ receiptPath, download: true }), `GenAI video is still pending; recover using receiptPath ${receiptPath}, never resubmit.`);
    return { ...result, receiptPath };
}
