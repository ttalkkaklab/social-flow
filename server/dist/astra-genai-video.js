/** The GenAI gateway's video adapters. Every request goes through the gateway's common generation API:
 * `POST /v1/generations` (one body per mode: text2video, image2video, audio2video, msr and scene),
 * `POST /v1/generations/validate` for a scene, `GET /v1/generations/{id}` for status and `GET /v1/models`
 * for what the deployment offers. The tools keep their own argument schemas; only this module knows the wire. */
import { openingPositionsSchema, openingPrompt, validateOpening } from './msr-opening.js';
import { z } from 'zod';
import { guidanceSchema, guidanceWireKey } from './astra-video-client.js';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';
import { GenaiRequestError, astraGenaiBaseUrl, downloadGenaiResult, pollGenaiJob, requestGenai, requireAstraGenaiKey, requestGenaiMedia, genaiImageUriSchema, genaiSourceUri, genaiAudioUri } from './astra-genai-client.js';
import { atomicJson } from './routing-files.js';
import { GENAI_MSR_INLINE_MAX_BYTES, GENAI_FILE_GONE, GENAI_FILE_SCHEME, forgetGenaiUploads, genaiUploadable, uploadGenaiFile } from './astra-genai-upload.js';
import { recordVideoSubmission } from './video-events.js';
import { checkSceneValidation, checkSceneVoices, genaiSceneBody, genaiSceneFrames, genaiSceneSchema, sceneFrames } from './genai-scene.js';
/** The common generation API's routes. */
export const GENERATIONS_ROUTE = '/v1/generations';
const GENERATION_MODES = { 'text-to-video': 'text2video', 'image-to-video': 'image2video', 'audio-to-video': 'audio2video', msr: 'msr', scene: 'scene' };
const sides = (resolution) => { const [width, height] = resolution.split('x').map(Number); return { width, height }; };
const asset = (url) => ({ url });
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
const temporalImages = z.array(z.object({
    imageUri: genaiImageUriSchema.optional(), imagePath: z.string().min(1).optional(),
    frameIdx: z.number().int().min(0).max(360),
    strength: z.number().min(0).max(1).optional(), crf: z.number().int().min(0).max(51).optional(),
}).strict().refine(pin => !!pin.imageUri !== !!pin.imagePath, 'Supply exactly one imageUri or imagePath')).min(1).max(8);
function temporalInput(pins) {
    if (!pins)
        return {};
    return { keyframes: pins.map(pin => ({ url: genaiSourceUri(pin.imageUri, pin.imagePath), frame_idx: pin.frameIdx,
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
/** Common `audio2video`: the track sets the length, so neither a duration nor generate_audio is sent. */
export function buildGenaiAudioBody(args) {
    const image = oneOf(args.imagePath, args.imageUri) ? genaiSourceUri(args.imageUri, args.imagePath) : undefined;
    const last = oneOf(args.lastFramePath, args.lastFrameUri) ? genaiSourceUri(args.lastFrameUri, args.lastFramePath) : undefined;
    return { kind: 'video', model: args.model, mode: GENERATION_MODES['audio-to-video'],
        input: { text: args.prompt, audio: asset(genaiAudioUri(args.audioUri, args.audioPath)),
            ...(image === undefined ? {} : { images: [asset(image)] }), ...(last === undefined ? {} : { last_frame: asset(last) }),
            ...temporalInput(args.keyframes) },
        parameters: { ...sides(args.resolution), fps: args.fps, ...samplingBody(args), ...negativeBody({ negativePrompt: args.negativePrompt }) } };
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
/** A reference as the common schema writes it: `{url, background, audio:{url}}`. */
function referenceInput(ref) {
    return {
        url: genaiSourceUri(ref.imageUri, ref.imagePath),
        background: ref.background,
        ...(ref.audioUri || ref.audioPath ? { audio: asset(genaiAudioUri(ref.audioUri, ref.audioPath)) } : {}),
    };
}
/** Common `msr` on the gateway's `ltx-msr` model: the references are `input.images`. */
export function buildGenaiMsrBody(args) {
    return { kind: 'video', model: 'ltx-msr', mode: GENERATION_MODES.msr,
        input: { text: openingPrompt(args.prompt, args.openingPositions), images: args.references.map(referenceInput) },
        parameters: { width: args.width, height: args.height, fps: args.frameRate, seed: args.seed,
            ...(args.duration === undefined ? { num_frames: args.numFrames ?? 121 } : { duration_seconds: args.duration }),
            reference_strength: args.referenceStrength, reference_frames: args.referenceFrames,
            ...(args.skipStage2 === undefined ? {} : { skip_stage_2: args.skipStage2 }), ...negativeBody(args) } };
}
/** One video row of `GET /v1/models`: modes, fields by mode, limits and, where scene mode runs, its numbers. */
const deployedModel = z.object({
    id: z.string(), kind: z.string().optional(), modes: z.array(z.string()).default([]),
    parameters_by_mode: z.record(z.array(z.string())).optional(), limits: z.record(z.unknown()).optional(),
    scene: z.object({ prompt: z.object({ max_chars: z.number().int().positive() }).passthrough(),
        voices: z.object({ max: z.number().int().nonnegative() }).passthrough() }).passthrough().optional(),
}).passthrough();
let catalogCache;
/**
 * Read the deployment's video models from `GET /v1/models`. Cached, so a plan and its execute-time rebuild
 * read the same numbers. An unreachable gateway counts as offering nothing for a minute.
 */
export async function refreshGenaiVideoCatalog(force = false) {
    const origin = astraGenaiBaseUrl();
    if (!force && catalogCache?.origin === origin && Date.now() - catalogCache.at < catalogCache.ttl)
        return catalogCache.models;
    let models = [], ttl = 60_000;
    try {
        // Image and speech rows have other shapes; each video row is read on its own.
        const rows = z.object({ data: z.array(z.unknown()) }).parse(await requestGenai('GET', '/v1/models', undefined, 15_000)).data;
        models = rows.flatMap(row => { const read = deployedModel.safeParse(row); return read.success && read.data.kind !== 'image' && read.data.kind !== 'speech' ? [read.data] : []; });
        ttl = 600_000;
    }
    catch { /* Nothing is known; the plan says so and the gateway's own validation still decides. */ }
    catalogCache = { origin, models, at: Date.now(), ttl };
    return models;
}
const cachedModel = (id) => catalogCache?.origin === astraGenaiBaseUrl() ? catalogCache.models.find(model => model.id === id) : undefined;
/** Does scene mode take voice samples on this model? Unknown counts as no. */
export function genaiSceneVoices(model) { return (cachedModel(model)?.scene?.voices.max ?? 0) > 0; }
/** The scene prompt's cap after substitution; a backend with its own cap is enforced by validation. */
export function genaiScenePromptLimit(model) { return cachedModel(model)?.scene?.prompt.max_chars ?? 2000; }
/** Common `text2video` or `image2video`. Only provider fields cross the wire; local output/budget controls never do. */
export function buildGenaiVideoBody(args, operation = 'image-to-video') {
    // Local frames travel as checked data URIs until the upload step swaps them for genai-file URIs.
    const start = args.imageUri === undefined && args.imagePath === undefined ? undefined : genaiSourceUri(args.imageUri, args.imagePath);
    const last = args.lastFramePath !== undefined ? genaiSourceUri(undefined, args.lastFramePath)
        : args.lastFrameUri == null ? undefined : genaiSourceUri(args.lastFrameUri);
    return {
        kind: 'video', model: args.model, mode: GENERATION_MODES[operation],
        input: { text: openingPrompt(args.prompt, args.openingPositions),
            ...(start === undefined ? {} : { images: [asset(start)] }), ...(last === undefined ? {} : { last_frame: asset(last) }),
            ...temporalInput(args.keyframes), ...(args.references === undefined ? {} : { references: args.references.map(referenceInput) }) },
        parameters: { ...sides(args.resolution), fps: args.fps, generate_audio: args.generateAudio,
            // Without either the gateway picks the length (automatic duration).
            ...(args.numFrames !== undefined ? { num_frames: args.numFrames } : args.duration != null ? { duration_seconds: args.duration } : {}),
            ...samplingBody(args),
            ...(args.referenceStrength === undefined ? {} : { reference_strength: args.referenceStrength }),
            ...(args.referenceFrames === undefined ? {} : { reference_frames: args.referenceFrames }),
            ...(args.skipStage2 === undefined ? {} : { skip_stage_2: args.skipStage2 }),
            ...negativeBody(args) },
    };
}
const operationSchema = z.enum(['text-to-video', 'image-to-video', 'audio-to-video', 'msr', 'scene']);
const mediaContract = z.object({
    width: z.number().positive(), height: z.number().positive(), fps: z.number().positive(),
    frames: z.number().int().positive().optional(), audio: z.boolean(),
});
/** The clip a request delivers. A scene's clip has the storyboard's frames, cut back from what the gateway renders. */
export function msrOutputContract(operation, args) {
    if (operation === 'scene') {
        const scene = args;
        return mediaContract.parse({ ...sides(scene.resolution), fps: Number(scene.fps ?? 24), frames: sceneFrames(scene), audio: scene.generateAudio !== false });
    }
    const direct = operation === 'msr';
    if (!direct && !(operation === 'image-to-video' && Array.isArray(args.references) && args.references.length))
        return;
    const size = direct ? [Number(args.width ?? 1536), Number(args.height ?? 1024)] : String(args.resolution).split('x').map(Number);
    const scale = args.skipStage2 ? 2 : 1;
    const fps = Number((direct ? args.frameRate : args.fps) ?? 24);
    const duration = Number(args.duration);
    const frames = args.numFrames != null ? Number(args.numFrames) : direct
        ? (duration ? 1 + 8 * Math.ceil((duration * fps - 1) / 8 - 0.5 - 1e-9) : 121)
        : duration ? Math.ceil(duration * fps - 1e-9) : undefined;
    return mediaContract.parse({ width: size[0] / scale, height: size[1] / scale, fps, frames, audio: args.generateAudio !== false });
}
/** What scene mode renders: the next 8k+1 frames with a soundtrack, at the requested size. */
function sceneNativeContract(args) {
    return mediaContract.parse({ ...sides(args.resolution), fps: args.fps, frames: genaiSceneFrames(sceneFrames(args)), audio: true });
}
function checkOutput(file, expected, counted = false) {
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', ...(expected || counted ? ['-count_frames'] : []),
        '-show_entries', 'stream=codec_type,width,height,avg_frame_rate,nb_read_frames,duration:format=duration', '-of', 'json', file], { encoding: 'utf8', timeout: 120_000 }));
    const video = probe.streams?.find((s) => s.codec_type === 'video');
    if (!video?.width || !(Number(probe.format?.duration) > 0))
        throw new Error('GenAI result has no usable video stream');
    if (!expected && !counted)
        return;
    const audio = probe.streams.filter((s) => s.codec_type === 'audio');
    const frames = Number(video.nb_read_frames);
    const [n, d] = String(video.avg_frame_rate).split('/').map(Number);
    const fps = n / d;
    if (!(frames > 1 && fps > 0) || audio.length !== Number(expected?.audio ?? true) ||
        expected && (video.width !== expected.width || video.height !== expected.height || Math.abs(fps - expected.fps) > 0.001 ||
            expected.frames !== undefined && frames !== expected.frames) ||
        !(Math.abs(Number(video.duration) - frames / fps) <= 0.5 / fps) ||
        audio.length && !(Math.abs(Number(audio[0].duration) - frames / fps) <= Math.max(0.1, 1 / fps)))
        throw new Error('GenAI result does not match the requested video frames, rate, geometry or audio');
}
// Receipts written before 2026-11-25 name provider routes and carry other fields; they stay readable.
const receiptSchema = z.object({
    version: z.literal(1), baseUrl: z.string(), operation: z.string(), fingerprint: z.string(),
    expected: mediaContract.optional(), native: mediaContract.optional(),
    requestId: z.string().optional(), requestPath: z.string().optional(), submittedAt: z.string().optional(),
    videoPath: z.string(), jobId: z.string().min(1).optional(),
    status: z.enum(['submitting', 'submitted', 'completed']), sha256: z.string().optional(), nativeSha256: z.string().optional(),
    conditioningAudioSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).passthrough();
/** The common job envelope. `GET /v1/generations/{id}` also reads jobs a provider route created. */
const generationSchema = z.object({
    id: z.string().min(1), status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
    outputs: z.array(z.object({ url: z.string().min(1), authentication: z.string().optional() }).passthrough()).default([]),
    error: z.object({ code: z.string().optional(), message: z.string().optional() }).passthrough().nullish(),
    result_expired: z.boolean().optional(),
}).passthrough();
const STATUS = { queued: 'pending', running: 'processing', succeeded: 'completed', failed: 'failed', cancelled: 'cancelled' };
export const genaiVideoStatusSchema = z.object({ receiptPath: z.string().min(1), download: z.boolean().default(false) }).strict();
// A busy MSR backend acknowledged a submission after 480 s (2026-10-30); 60 s orphaned jobs.
const SUBMIT_TIMEOUT_MS = 15 * 60_000;
/** The gateway binds a scene's X-Request-Id to its job until 24 hours after that job ends; a later replay could render again. */
const REPLAY_WINDOW_MS = 23 * 3600_000;
const accepted = (response) => z.object({ id: z.string().min(1) }).passthrough().parse(response).id;
/** Find the job of a scene whose response was lost: the same X-Request-Id with the same body returns the job the first
 * request made, or makes it if that request never arrived. Either way one render exists. */
async function replayScene(receipt, receiptPath) {
    if (!receipt.requestId || !receipt.requestPath || !fs.existsSync(receipt.requestPath))
        throw new Error('GenAI submission identity is unknown; inspect server usage before retrying.');
    if (!receipt.submittedAt || !(Date.now() - Date.parse(receipt.submittedAt) < REPLAY_WINDOW_MS))
        throw new Error('genai_replay_window_passed: the gateway may no longer tie request ' + receipt.requestId + ' to its job; check GET /v1/jobs before planning again');
    const body = JSON.parse(fs.readFileSync(receipt.requestPath, 'utf8'));
    const jobId = accepted(await requestGenai('POST', GENERATIONS_ROUTE, body, SUBMIT_TIMEOUT_MS, undefined, undefined, receipt.requestId));
    const linked = { ...receipt, jobId, status: 'submitted' };
    atomicJson(receiptPath, linked);
    recordVideoSubmission(jobId);
    return linked;
}
/** Cut a scene's rendered clip back to the storyboard's frames, and drop its soundtrack when the plan asks. */
function deliverScene(native, expected, cut) {
    const seconds = expected.frames / expected.fps;
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-n', '-i', native, '-map', '0:v:0', ...(expected.audio ? ['-map', '0:a:0'] : []),
        '-frames:v', String(expected.frames), '-t', String(seconds), '-c:v', 'libx264', '-crf', '16', '-preset', 'fast',
        ...(expected.audio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']), '-movflags', '+faststart', cut], { timeout: 120_000 });
}
export async function getGenaiVideoStatus(input, planned, binding) {
    let receipt = receiptSchema.parse(JSON.parse(fs.readFileSync(input.receiptPath, 'utf8')));
    if (binding && (path.resolve(receipt.videoPath) !== path.resolve(binding.target) ||
        binding.jobId && receipt.jobId && receipt.jobId !== binding.jobId))
        throw new Error('GenAI receipt does not belong to the approved output or job');
    if (receipt.expected && planned && JSON.stringify(receipt.expected) !== JSON.stringify(planned))
        throw new Error('GenAI receipt conflicts with the approved media contract');
    if (receipt.baseUrl !== astraGenaiBaseUrl())
        throw new Error('GenAI receipt belongs to a different server; restore ASTRA_GENAI_URL before recovery.');
    if (!receipt.jobId) {
        if (receipt.operation !== 'scene')
            throw new Error('GenAI submission identity is unknown; inspect server usage before retrying.');
        receipt = await replayScene(receipt, input.receiptPath);
        if (binding?.jobId && binding.jobId !== receipt.jobId)
            throw new Error('GenAI recovery job ID mismatch');
    }
    const jobId = receipt.jobId;
    const counted = Boolean(receipt.native) || receipt.operation === 'msr';
    if (receipt.status === 'completed') {
        input.onJobCompleted?.();
        const bytes = fs.readFileSync(receipt.videoPath);
        if (createHash('sha256').update(bytes).digest('hex') !== receipt.sha256)
            throw new Error('GenAI cached output changed');
        if (receipt.expected || planned || counted)
            checkOutput(receipt.videoPath, receipt.expected ?? planned, true);
        return { jobId, status: 'completed', videoPath: receipt.videoPath, downloaded: true, review: 'not_reviewed' };
    }
    const job = generationSchema.parse(await requestGenai('GET', GENERATIONS_ROUTE + '/' + encodeURIComponent(jobId)));
    if (job.id !== jobId)
        throw new Error('GenAI status job ID mismatch');
    const status = STATUS[job.status];
    // The gateway's own failed status is terminal job evidence (managed routing frees the slot).
    if (status === 'failed' || status === 'cancelled')
        throw new GenaiRequestError(`GenAI video ${jobId} ${status}: ${JSON.stringify(job.error ?? 'No details').slice(0, 1000)}`, true, 200);
    if (status === 'completed')
        input.onJobCompleted?.();
    if (status !== 'completed' || !input.download)
        return { jobId, status, downloaded: false, review: 'not_reviewed' };
    const output = job.outputs[0];
    if (!output)
        throw new Error(job.result_expired ? 'GenAI result expired after 24 hours; the gateway no longer holds the clip. Retain the receipt, do not resubmit.'
            : 'GenAI completed without an output URL; retain the receipt, do not resubmit.');
    let bytes;
    if (output.authentication === 'gateway_token') {
        const url = new URL(output.url, astraGenaiBaseUrl() + '/');
        if (url.origin !== new URL(astraGenaiBaseUrl()).origin || url.username || url.password || url.search || url.hash ||
            !/^\/v1\/ltx\/desktop\/assets\/[A-Za-z0-9_-]+\/bytes$/.test(url.pathname))
            throw new Error('Invalid private GenAI video URL; retain receipt');
        bytes = await requestGenaiMedia(url.pathname, undefined, GENERATIONS_ROUTE);
    }
    else
        bytes = await downloadGenaiResult(output.url);
    // Reject HTML/JSON and probe the actual container before recording completion.
    if (bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp')
        throw new Error('GenAI result is not MP4');
    const temp = `${receipt.videoPath}.${randomUUID()}.download.mp4`, cut = `${receipt.videoPath}.${randomUUID()}.delivery.mp4`;
    const expected = receipt.expected ?? planned;
    try {
        fs.writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 });
        let delivered = temp;
        if (receipt.native) {
            checkOutput(temp, receipt.native, true);
            if (!expected)
                throw new Error('GenAI scene receipt has no delivery contract; retain the receipt');
            if (expected.frames !== receipt.native.frames || expected.audio !== receipt.native.audio) {
                deliverScene(temp, expected, cut);
                checkOutput(cut, expected, true);
                delivered = cut;
            }
        }
        else
            checkOutput(temp, expected, counted);
        const final = fs.readFileSync(delivered), sha256 = createHash('sha256').update(final).digest('hex');
        try {
            fs.linkSync(delivered, receipt.videoPath);
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                throw error;
            if (createHash('sha256').update(fs.readFileSync(receipt.videoPath)).digest('hex') !== sha256)
                throw new Error('GenAI video output conflicts with download');
        }
        atomicJson(input.receiptPath, { ...receipt, status: 'completed', sha256,
            ...(receipt.native ? { nativeSha256: createHash('sha256').update(bytes).digest('hex') } : {}) });
    }
    finally {
        fs.rmSync(temp, { force: true });
        fs.rmSync(cut, { force: true });
    }
    return { jobId, status: 'completed', videoPath: receipt.videoPath, downloaded: true, review: 'not_reviewed' };
}
/** A fallback body above this is not sent: voice cannot be shrunk, and so large a body on a slow link meets the edge's 524 again. */
export { GENAI_MSR_INLINE_MAX_BYTES } from './astra-genai-upload.js';
/** Swap each local file a common body carries (`url` or `uri`, as data URIs) for an uploaded genai-file, unchanged.
 * A supplied A2V track stays inline as before. */
export async function prepareGenaiSources(body) {
    let supported = true;
    const send = async (uri) => {
        const match = /^data:([^;,]+);base64,(.*)$/s.exec(uri);
        if (!match)
            return uri;
        const bytes = Buffer.from(match[2], 'base64');
        // Only a gateway answer (no upload API, a limit, a full disk) stops later uploads; a type it does not take goes inline alone.
        const uploadable = supported && genaiUploadable(bytes, match[1]);
        const id = uploadable ? await uploadGenaiFile(bytes, match[1]) : undefined;
        if (uploadable && id === undefined)
            supported = false;
        return id ?? `data:${match[1]};base64,${bytes.toString('base64')}`;
    };
    const walk = async (value, at) => {
        if (Array.isArray(value)) {
            const out = [];
            for (const item of value)
                out.push(await walk(item, at));
            return out;
        }
        if (!value || typeof value !== 'object')
            return value;
        const out = {};
        for (const [key, item] of Object.entries(value))
            out[key] = (key === 'url' || key === 'uri') && typeof item === 'string' && at !== 'input.audio'
                ? await send(item) : await walk(item, at ? at + '.' + key : key);
        return out;
    };
    const prepared = await walk(body, '');
    const track = body.input?.audio?.url?.length ?? 0;
    const bytes = Buffer.byteLength(JSON.stringify(prepared));
    if (bytes - track > GENAI_MSR_INLINE_MAX_BYTES)
        throw new Error(`msr_body_too_large: the gateway did not take the chunked upload and the inline request is ${(bytes / 1e6).toFixed(1)} MB (limit 8 MB); nothing was submitted. Try again later, or use a shorter voice sample.`);
    return prepared;
}
const genaiModes = {
    astra_genai_text2video: 'text2video', astra_genai_img2video: 'image2video',
    astra_genai_audio2video: 'audio2video', astra_genai_msr: 'msr',
};
/** Both planning and submission check version-dependent inputs against what `GET /v1/models` lists for the mode. A scene is
 * checked whole by `/v1/generations/validate` instead. */
export async function checkGenaiVideoOptions(tool, args) {
    const mode = genaiModes[tool];
    if (!mode)
        return;
    const wireFields = {
        seed: 'seed', numInferenceSteps: 'num_inference_steps', guidance: 'guidance', lora: 'lora', numGeneratedKeyframes: 'num_generated_keyframes',
        numFrames: 'num_frames', negativePrompt: 'negative_prompt', guidanceScale: 'guidance_scale',
        referenceStrength: 'reference_strength', referenceFrames: 'reference_frames',
        nagScale: 'nag_scale', nagAlpha: 'nag_alpha', nagTau: 'nag_tau', skipStage2: 'skip_stage_2',
    };
    // MSR's own defaults are written on every request, so only a changed value needs the deployment to list its field.
    const msrDefaults = { referenceStrength: 1, referenceFrames: 33, seed: 42 };
    const requested = Object.entries(wireFields).filter(([key]) => args[key] !== undefined &&
        !(mode === 'msr' && (key === 'numFrames' || args[key] === msrDefaults[key])));
    const needsAudioModel = mode === 'audio2video' && args.model === 'ltx-2.5-22b-distilled';
    if (!requested.length && !args.keyframes && !needsAudioModel)
        return;
    const models = await refreshGenaiVideoCatalog(true);
    if (!models.length)
        throw new GenaiRequestError('ltx_capabilities_unavailable: cannot verify the requested gateway fields before submission', true, 503);
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
/** Publish a receipt atomically so another live session can follow it immediately. Returns false when one exists. */
function claimReceipt(receiptPath, receipt) {
    const claim = receiptPath + '.' + randomUUID() + '.tmp';
    try {
        fs.writeFileSync(claim, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
        fs.linkSync(claim, receiptPath);
        return true;
    }
    catch (error) {
        if (error.code !== 'EEXIST')
            throw error;
        return false;
    }
    finally {
        fs.rmSync(claim, { force: true });
    }
}
export async function generateGenaiVideo(operation, input, signal, polling = {}) {
    signal?.throwIfAborted();
    if (operation === 'scene')
        return generateGenaiScene(genaiSceneSchema.parse(input), signal, polling);
    const args = (operation === 'msr' ? genaiMsrSchema : operation === 'audio-to-video' ? genaiAudioToVideoSchema
        : operation === 'text-to-video' ? genaiTextToVideoSchema : genaiImageToVideoSchema).parse(input);
    requireAstraGenaiKey();
    const body = operation === 'msr' ? buildGenaiMsrBody(args) : operation === 'audio-to-video'
        ? buildGenaiAudioBody(args) : buildGenaiVideoBody(args, operation);
    const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const videoPath = resolveOutputFile(args.outputPath || process.cwd(), args.filename || `genai-${Date.now()}.mp4`, 'video');
    const receiptPath = videoPath + '.astra-genai.json';
    const finish = async () => {
        const result = await pollGenaiJob(() => getGenaiVideoStatus({ receiptPath, download: true, onJobCompleted: polling.onJobCompleted }, msrOutputContract(operation, args)), `GenAI video is still pending; recover using receiptPath ${receiptPath}, never resubmit.`, signal, polling.statusRetries);
        return { ...result, receiptPath };
    };
    async function followSubmission() {
        const deadline = Date.now() + 120_000;
        for (;;) {
            signal?.throwIfAborted();
            const previous = receiptSchema.parse(JSON.parse(fs.readFileSync(receiptPath, 'utf8')));
            if (previous.baseUrl !== astraGenaiBaseUrl() || previous.operation !== operation || previous.fingerprint !== fingerprint || previous.videoPath !== videoPath)
                throw new Error('GenAI output receipt conflicts with this request; use a distinct output path.');
            if (previous.jobId) {
                recordVideoSubmission(previous.jobId);
                return finish();
            }
            if (!signal || Date.now() >= deadline)
                throw new Error('GenAI submission identity is unknown; inspect usage before retrying.');
            await sleep(250, undefined, { signal });
        }
    }
    if (fs.existsSync(receiptPath))
        return followSubmission();
    if (fs.existsSync(videoPath))
        throw new Error('GenAI output already exists');
    const tools = { 'text-to-video': 'astra_genai_text2video', 'image-to-video': 'astra_genai_img2video', 'audio-to-video': 'astra_genai_audio2video', msr: 'astra_genai_msr' };
    await checkGenaiVideoOptions(tools[operation], args);
    // Upload before the receipt exists: a failed upload leaves nothing to recover and the call can simply run again.
    // The fingerprint stays on the request as written, so a resumed receipt still matches.
    const submitted = await prepareGenaiSources(body);
    const track = body.input?.audio?.url;
    const wav = track?.startsWith('data:audio/wav;base64,') ? Buffer.from(track.slice('data:audio/wav;base64,'.length), 'base64') : undefined;
    const receipt = { version: 1, baseUrl: astraGenaiBaseUrl(), operation, fingerprint, videoPath, expected: msrOutputContract(operation, args), status: 'submitting',
        ...(wav ? { conditioningAudioSha256: createHash('sha256').update(wav).digest('hex') } : {}) };
    signal?.throwIfAborted();
    if (!claimReceipt(receiptPath, receipt))
        return followSubmission();
    let response;
    try {
        try {
            response = await requestGenai('POST', GENERATIONS_ROUTE, submitted, SUBMIT_TIMEOUT_MS);
        }
        catch (error) {
            // The gateway no longer knows an uploaded id (expired, restarted). That refusal created no job: upload again and resubmit once.
            if (!JSON.stringify(submitted).includes(GENAI_FILE_SCHEME) || !(error instanceof GenaiRequestError && [400, 422].includes(error.httpStatus) && GENAI_FILE_GONE.test(error.message)))
                throw error;
            forgetGenaiUploads();
            let again;
            try {
                again = await prepareGenaiSources(body);
            }
            catch (uploadError) {
                fs.rmSync(receiptPath, { force: true });
                throw uploadError;
            }
            response = await requestGenai('POST', GENERATIONS_ROUTE, again, SUBMIT_TIMEOUT_MS);
        }
    }
    catch (error) {
        // An explicit rejection created no job; free the output name so a corrected request can retry it.
        if (error instanceof GenaiRequestError && error.terminal)
            fs.rmSync(receiptPath, { force: true });
        throw error;
    }
    const jobId = accepted(response);
    atomicJson(receiptPath, { ...receipt, jobId, status: 'submitted' });
    recordVideoSubmission(jobId);
    return finish();
}
/** One storyboard scene as one scene-mode job. The exact body is kept beside the receipt and travels with an X-Request-Id
 * derived from it, so a lost response is recovered by replaying it (see `replayScene`). */
async function generateGenaiScene(args, signal, polling = {}) {
    requireAstraGenaiKey();
    checkSceneVoices(args);
    const local = genaiSceneBody(args, (file, kind) => kind === 'image' ? genaiSourceUri(undefined, file) : genaiAudioUri(undefined, file));
    const fingerprint = createHash('sha256').update(JSON.stringify(local)).digest('hex');
    const videoPath = resolveOutputFile(args.outputPath || process.cwd(), args.filename || `genai-${Date.now()}.mp4`, 'video');
    const receiptPath = videoPath + '.astra-genai.json';
    const expected = msrOutputContract('scene', args);
    const finish = async () => {
        const result = await pollGenaiJob(() => getGenaiVideoStatus({ receiptPath, download: true, onJobCompleted: polling.onJobCompleted }, expected), `GenAI scene is still pending; recover using receiptPath ${receiptPath}, never resubmit.`, signal, polling.statusRetries);
        return { ...result, receiptPath };
    };
    if (fs.existsSync(receiptPath)) {
        const previous = receiptSchema.parse(JSON.parse(fs.readFileSync(receiptPath, 'utf8')));
        if (previous.baseUrl !== astraGenaiBaseUrl() || previous.operation !== 'scene' || previous.fingerprint !== fingerprint || previous.videoPath !== videoPath)
            throw new Error('GenAI output receipt conflicts with this request; use a distinct output path.');
        return finish();
    }
    if (fs.existsSync(videoPath))
        throw new Error('GenAI output already exists');
    // The gateway compiles the scene once more; a scene whose labels, length or cuts moved since planning is not submitted.
    // Nothing exists yet, so any failure here closes the request without a job.
    let submitted;
    try {
        submitted = await prepareGenaiSources(local);
        checkSceneValidation(args, await requestGenai('POST', GENERATIONS_ROUTE + '/validate', submitted, 120_000));
    }
    catch (error) {
        throw new GenaiRequestError((error instanceof Error ? error.message : String(error)) + '; no generation was requested', true, error instanceof GenaiRequestError ? error.httpStatus : 422);
    }
    const requestPath = `${videoPath}.${randomUUID()}.generation.json`;
    fs.writeFileSync(requestPath, JSON.stringify(submitted), { flag: 'wx', mode: 0o600 });
    // The ID names this output as well as the body. The gateway ties an ID to its first job even after that job fails, so a
    // new plan of the same scene (a retry, under a new request and filename) must not share it.
    const requestId = 'scene-' + createHash('sha256').update(fingerprint + '\n' + videoPath).digest('hex');
    const receipt = { version: 1, baseUrl: astraGenaiBaseUrl(), operation: 'scene', fingerprint, videoPath, expected,
        native: sceneNativeContract(args), requestId, requestPath, submittedAt: new Date().toISOString(), status: 'submitting' };
    signal?.throwIfAborted();
    if (!claimReceipt(receiptPath, receipt)) {
        fs.rmSync(requestPath, { force: true });
        return finish();
    }
    let jobId;
    try {
        jobId = accepted(await requestGenai('POST', GENERATIONS_ROUTE, submitted, SUBMIT_TIMEOUT_MS, undefined, undefined, requestId));
    }
    catch (error) {
        // An explicit refusal made no job. Anything else leaves the receipt, and video_status replays the same request.
        if (error instanceof GenaiRequestError && error.terminal) {
            fs.rmSync(receiptPath, { force: true });
            fs.rmSync(requestPath, { force: true });
        }
        throw error;
    }
    atomicJson(receiptPath, { ...receipt, jobId, status: 'submitted' });
    recordVideoSubmission(jobId);
    return finish();
}
