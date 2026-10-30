import { recordVideoSubmission } from './video-events.js';
/**
 * ASTRA video API client — the self-hosted LTX lane next to Veo, Seedance and Omni.
 *
 * One server (default https://video.astravision.co.kr) running an LTX-2.5 pipeline behind
 * a queue. Unlike every other video lane in this server it is *ours*: no per-call billing,
 * no content policy handed down by a vendor, and the weights stay on the box. What it costs
 * instead is wall clock and exclusivity — the worker renders **one job at a time**, so a
 * second caller waits in line behind the first.
 *
 * Shape of the API (measured against the live server 2026-09-29, evidence in the PR body):
 * - `POST /v1/uploads` takes the file **bytes as the whole body**, kind chosen by Content-Type,
 *   and answers 201 `{upload_id, kind, bytes, expires_at}` (audio adds `duration`, video adds
 *   `width/height/frames/fps`). Uploads live 24h; 200 files per key (2026-10-18 live contract).
 * - `POST /v1/jobs` answers 202 `{job_id, status:"queued", queue_position, status_url, result_url}`.
 *   Job bodies stop at 1 MiB; acceptance is limited to 5/min and 60/hour per key, with at
 *   most 20 jobs waiting in the queue.
 * - `GET /v1/jobs/<id>` answers `status` queued → running → succeeded | failed, plus the
 *   `request` the server actually recorded.
 * - `GET /v1/jobs/<id>/result` answers `video/mp4`, or **409** while the job is still running.
 *
 * The server rejects any body key the mode does not own — the error names the whole allow-list,
 * which is how the measured per-mode field tables below were read rather than taken off a manual.
 * text2video carries generate/guided/guided_fast/guided_hq behind `tier`, img2video is
 * generate/guided/guided_hq with 1-2 images, ic_lora covers ingredients and ic_lora (one reference
 * clip or still through an IC-LoRA adapter), and keyframe / audio2video / retake are one mode each.
 * guided_hq, ic_lora, `guidance`, `conditioning_mask`, `skip_stage_2` and `{name, strength}` lora
 * entries came with the 2026-10-17 server change (room 3b9a99e6 DESIGN §2-3), live since 15:00Z
 * that day; their quality is unmeasured.
 *
 * Two deliberate departures from the sibling clients:
 * - **Uploads do not go through http.ts.** requestRaw/requestBytes JSON.stringify their body;
 *   this endpoint wants raw bytes under a caller-chosen Content-Type, so the upload call is
 *   local to this file. Everything else (submit, poll) uses requestRaw.
 * - **The key never leaves this file.** Errors quote the server's message and the HTTP status,
 *   never the request headers — see redactedFailure().
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import packageMetadata from '../package.json' with { type: 'json' };
import { astraVideoBaseUrl, requireAstraVideoKey } from './config.js';
import { requestRaw } from './http.js';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';
import { checkSpeechSync } from './speech-sync-check.js';
// ── constants measured against the live server ───────────────────────────────
/** The three text-driven modes, exposed as one `tier` argument on astra_text2video. */
export const ASTRA_VIDEO_TIERS = {
    /** `generate` — the default pipeline. The only tier that takes `lora`. */
    default: 'generate',
    /** `guided` — slower, takes a negative prompt and a step count. */
    guided: 'guided',
    /** `guided_fast` — 768x512 draft tier, faster than guided but not the default pipeline. */
    fast: 'guided_fast',
    /** `guided_hq` — two-stage high-quality pipeline (15 steps by default). Unmeasured. */
    hq: 'guided_hq',
};
export const VALID_ASTRA_VIDEO_TIERS = Object.keys(ASTRA_VIDEO_TIERS);
/** The only two adapters the server will load. Any other value, including a path, is a 400. */
export const ASTRA_VIDEO_LORAS = ['cinemagraph', 'slow-motion'];
export const ASTRA_VIDEO_MAX_LORAS = 2;
export const ASTRA_VIDEO_MAX_LORA_STRENGTH = 2;
/**
 * IC-LoRA adapters the server design loads from its own catalog (DESIGN §2). `ingredients` runs as
 * the existing `ingredients` mode; every other adapter runs as mode `ic_lora` with `adapter`.
 */
export const ASTRA_VIDEO_IC_LORA_ADAPTERS = [
    'clean-plate', 'colorization', 'day-to-night', 'deblur', 'decompression', 'water-simulation', 'pixel-upscaler-x2', 'ingredients',
];
/**
 * Engine guidance knobs (DESIGN §3): the engine's `--help` names without `--`, `-` as `_`, so the
 * body key is the engine name. Ranges are the server design's conservative bounds.
 */
export const ASTRA_VIDEO_GUIDANCE_RANGES = {
    video_cfg_guidance_scale: [1, 15],
    video_stg_guidance_scale: [0, 5],
    video_rescale_scale: [0, 1],
    video_skip_step: [0, 10],
    a2v_guidance_scale: [1, 10],
    audio_cfg_guidance_scale: [1, 15],
    audio_stg_guidance_scale: [0, 5],
    audio_rescale_scale: [0, 1],
    audio_skip_step: [0, 10],
    v2a_guidance_scale: [1, 10],
};
export const ASTRA_VIDEO_GUIDANCE_BLOCK_KEYS = ['video_stg_blocks', 'audio_stg_blocks'];
/** Tool arguments are camelCase (server-wide convention); the wire keeps the engine's snake_case. */
export const guidanceToolKey = (wireKey) => wireKey.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const guidanceWireKey = (toolKey) => toolKey.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
/** Transformer layers are 0..47; at most 8 distinct blocks per list. */
export const ASTRA_VIDEO_MAX_STG_BLOCK = 47;
export const ASTRA_VIDEO_MAX_STG_BLOCKS = 8;
/** The server refuses a reference with 2+ frames above this many pixels (VAE decode defect). */
export const ASTRA_VIDEO_MAX_REFERENCE_PIXELS = 1_867_776;
/**
 * Body keys each mode accepts, verbatim from the server's own rejection message
 * (`POST /v1/jobs` with an unknown key answers 400 naming the allow-list).
 *
 * buildJobBody checks against ASTRA_VIDEO_ALLOWED_FIELDS (this table plus the design additions
 * below) — when the server changes, re-probe and change these constants, not call sites.
 */
export const ASTRA_VIDEO_MEASURED_FIELDS = {
    generate: ['auto_duration', 'frame_rate', 'hdr', 'height', 'images', 'lora', 'mode', 'num_frames', 'num_generated_keyframes', 'prompt', 'seed', 'width'],
    guided: ['auto_duration', 'frame_rate', 'hdr', 'height', 'images', 'mode', 'negative_prompt', 'num_frames', 'num_generated_keyframes', 'num_inference_steps', 'prompt', 'seed', 'width'],
    guided_fast: ['auto_duration', 'frame_rate', 'hdr', 'height', 'images', 'mode', 'negative_prompt', 'num_frames', 'num_generated_keyframes', 'num_inference_steps', 'prompt', 'seed', 'width'],
    keyframe: ['frame_rate', 'hdr', 'height', 'images', 'mode', 'negative_prompt', 'num_frames', 'num_inference_steps', 'prompt', 'seed', 'width'],
    audio2video: ['audio_max_duration', 'audio_start_time', 'audio_upload_id', 'frame_rate', 'hdr', 'height', 'images', 'mode', 'negative_prompt', 'num_frames', 'num_inference_steps', 'prompt', 'seed', 'width'],
    ingredients: ['frame_rate', 'hdr', 'height', 'images', 'mode', 'num_frames', 'prompt', 'references', 'seed', 'width'],
    retake: ['end_time', 'hdr', 'mode', 'prompt', 'seed', 'start_time', 'video_upload_id'],
};
/**
 * Fields the 2026-10-17 server design adds (DESIGN §2-3). Live since 2026-10-17 15:00Z:
 * the server's /v1/models allowed_fields carries every one of them. Kept apart from the older
 * measured table so a later server change can fold them in — or strike them — in one place.
 */
const ASTRA_VIDEO_DESIGN_FIELDS = {
    generate: ['generate_audio'],
    guided: ['guidance', 'generate_audio'],
    guided_fast: ['guidance', 'generate_audio'],
    keyframe: ['guidance', 'generate_audio'],
    audio2video: ['guidance', 'generate_audio'],
    guided_hq: [...ASTRA_VIDEO_MEASURED_FIELDS.guided, 'guidance', 'generate_audio'],
    ingredients: ['conditioning_mask', 'skip_stage_2', 'generate_audio'],
    ic_lora: [...ASTRA_VIDEO_MEASURED_FIELDS.ingredients, 'adapter', 'conditioning_mask', 'skip_stage_2', 'generate_audio'],
    retake: ['generate_audio'],
};
/** Every field the client may send per mode: measured allow-lists plus the design additions. */
export const ASTRA_VIDEO_ALLOWED_FIELDS = Object.fromEntries([...new Set([...Object.keys(ASTRA_VIDEO_MEASURED_FIELDS), ...Object.keys(ASTRA_VIDEO_DESIGN_FIELDS)])].map((mode) => [
    mode,
    [...new Set([...(ASTRA_VIDEO_MEASURED_FIELDS[mode] ?? []), ...(ASTRA_VIDEO_DESIGN_FIELDS[mode] ?? [])])].sort(),
]));
/**
 * Frame ceilings follow the live server's published limit (`GET /v1/models` → modes[].num_frames.max,
 * 361 since 2026-10-17); test/fixtures/astra-v1-models.json snapshots it and a test keeps the two equal.
 * Lengths above 121 are not generation-tested on every mode; the server owns the failure-band gate.
 */
export const ASTRA_VIDEO_MIN_FRAMES = 25;
export const ASTRA_VIDEO_SERVER_MAX_FRAMES = 361;
export const ASTRA_VIDEO_FRAME_LIMITS = {
    generate: ASTRA_VIDEO_SERVER_MAX_FRAMES,
    guided: ASTRA_VIDEO_SERVER_MAX_FRAMES,
    guided_fast: ASTRA_VIDEO_SERVER_MAX_FRAMES,
    keyframe: ASTRA_VIDEO_SERVER_MAX_FRAMES,
    audio2video: ASTRA_VIDEO_SERVER_MAX_FRAMES,
    guided_hq: ASTRA_VIDEO_SERVER_MAX_FRAMES,
    ingredients: ASTRA_VIDEO_SERVER_MAX_FRAMES,
    ic_lora: ASTRA_VIDEO_SERVER_MAX_FRAMES,
};
export const ASTRA_VIDEO_FRAME_STEP = 8;
/** Server-side automatic duration selection never chooses more than 121 frames. */
export const ASTRA_VIDEO_MAX_AUTO_FRAMES = 121;
/** Pixel grid: 64 for generate/guided/keyframe/audio2video, 32 for guided_fast. */
export const ASTRA_VIDEO_DIMENSION_STEP = 64;
export const ASTRA_VIDEO_FAST_DIMENSION_STEP = 32;
export const ASTRA_VIDEO_FAST_MIN_DIMENSION = 32;
export const ASTRA_VIDEO_FAST_MAX_DIMENSION = 1920;
/** width * height ceiling, whatever the grid. 1536x1024 (the default) is 1,572,864. */
export const ASTRA_VIDEO_MAX_PIXELS = 2_064_384;
export const ASTRA_VIDEO_MAX_SEED = 2_147_483_647;
export const ASTRA_VIDEO_MAX_PROMPT_CHARS = 2000;
/** Upload ceilings, by kind (server-enforced; we fail before spending the bandwidth). */
export const ASTRA_VIDEO_UPLOAD_LIMITS = {
    image: 32 * 1024 * 1024,
    video: 100 * 1024 * 1024,
    audio: 32 * 1024 * 1024,
};
/** Job acceptance is rate-limited to 5/min per key; the client spaces its own submits. */
export const ASTRA_VIDEO_SUBMITS_PER_MINUTE = 5;
/** The same key may accept at most 60 jobs/hour, and the waiting queue holds 20 jobs. */
export const ASTRA_VIDEO_SUBMITS_PER_HOUR = 60;
export const ASTRA_VIDEO_MAX_QUEUED_JOBS = 20;
/** Uploads have a separate 10/min limit; job JSON bodies stop at 1 MiB. */
export const ASTRA_VIDEO_UPLOADS_PER_MINUTE = 10;
export const ASTRA_VIDEO_MAX_JOB_BODY_BYTES = 1024 * 1024;
/** Explicit because the front door has rejected the runtime's default User-Agent with 403. */
export const ASTRA_VIDEO_USER_AGENT = `social-flow/${packageMetadata.version}`;
/** A single job is capped at 1800s server-side, so polling gives up at the same wall. */
export const ASTRA_VIDEO_MAX_WAIT_MS = 1_800_000;
const POLL_INTERVAL_MS = 5_000;
const SUBMIT_TIMEOUT_MS = 60_000;
const STATUS_TIMEOUT_MS = 30_000;
/** Uploads and the result download are byte transfers, not the 300s undici header wall. */
const TRANSFER_TIMEOUT_MS = 600_000;
// Upload management is a provisional client contract until the server endpoints ship.
// Reject unknown input keys rather than silently deleting a different caller-selected item.
export const astraVideoListUploadsSchema = z.object({}).strict();
export const astraVideoCapabilitiesSchema = z.object({}).strict();
export const astraVideoDeleteUploadSchema = z.object({
    uploadId: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/, 'uploadId must be a bare upload identifier'),
}).strict();
const uploadListingSchema = z.object({
    uploads: z.array(z.object({
        upload_id: z.string().min(1),
        kind: z.enum(['image', 'audio', 'video']).or(z.string()),
        bytes: z.number().int().nonnegative(),
        expires_at: z.string().min(1),
    })),
});
/** Never expose upstream HTML, credentials, or a stack trace as an upload-management error. */
function uploadManagementFailure(operation, status) {
    const reason = status === 404 || status === 501
        ? 'The server upload endpoint is unavailable or not implemented; server support is required.'
        : status === 401 || status === 403
            ? 'The server refused access. Check ASTRA_VIDEO and upload ownership.'
            : status === 429
                ? 'The server rate limit was reached. Try again later.'
                : 'The server could not complete the request. Check server availability before retrying.';
    return new Error(`ASTRA video ${operation} failed (HTTP ${status}): ${reason}`);
}
function invalidUploadResponse(operation, status) {
    return new Error(`ASTRA video ${operation} failed (HTTP ${status}): The server did not return the expected upload response. The endpoint may not be implemented yet; no ${operation === 'list uploads' ? 'empty list' : 'deletion'} is confirmed.`);
}
export async function listUploads() {
    const result = await requestRaw('get', `${astraVideoBaseUrl()}/v1/uploads`, authHeaders(), undefined, STATUS_TIMEOUT_MS);
    if (!result.ok)
        throw uploadManagementFailure('list uploads', result.status);
    if (result.status !== 200)
        throw invalidUploadResponse('list uploads', result.status);
    try {
        // An HTML SPA with HTTP 200, a missing array, and malformed items are failures, not [].
        return uploadListingSchema.parse(JSON.parse(result.body));
    }
    catch {
        throw invalidUploadResponse('list uploads', result.status);
    }
}
/**
 * The live server's own capability report (`GET /v1/models`, behind the key): per-mode fields,
 * ceilings, blocked combos and catalogs as this process enforces them. Read-only; the server
 * rate-limits it like any query. The body is returned as parsed JSON, not re-shaped.
 */
export async function getCapabilities() {
    const result = await requestRaw('get', `${astraVideoBaseUrl()}/v1/models`, authHeaders(), undefined, STATUS_TIMEOUT_MS);
    if (!result.ok || result.status !== 200) {
        const reason = result.status === 401 || result.status === 403 ? 'The server refused access. Check ASTRA_VIDEO.'
            : result.status === 429 ? 'The server rate limit was reached. Try again in a minute.'
                : 'The server could not answer. Check server availability before retrying.';
        throw new Error(`ASTRA video capabilities failed (HTTP ${result.status}): ${reason}`);
    }
    try {
        const parsed = JSON.parse(result.body);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
            throw new Error('not an object');
        return parsed;
    }
    catch {
        throw new Error(`ASTRA video capabilities failed (HTTP ${result.status}): the server did not return a JSON capability report.`);
    }
}
export async function deleteUpload(args) {
    const { uploadId: upload_id } = astraVideoDeleteUploadSchema.parse(args);
    const result = await requestRaw('delete', `${astraVideoBaseUrl()}/v1/uploads/${encodeURIComponent(upload_id)}`, authHeaders(), undefined, STATUS_TIMEOUT_MS);
    if (!result.ok)
        throw uploadManagementFailure('delete upload', result.status);
    if (result.status === 204)
        return { upload_id, deleted: true };
    try {
        const confirmed = z.object({ upload_id: z.literal(upload_id), deleted: z.literal(true) }).parse(JSON.parse(result.body));
        if (result.status !== 200)
            throw new Error('Deletion is not complete');
        return confirmed;
    }
    catch {
        throw invalidUploadResponse('delete upload', result.status);
    }
}
// ── shared validation ────────────────────────────────────────────────────────
const promptSchema = z
    .string()
    .min(1, 'prompt is required')
    .max(ASTRA_VIDEO_MAX_PROMPT_CHARS, `prompt must be at most ${ASTRA_VIDEO_MAX_PROMPT_CHARS} characters`);
const numFramesSchema = (mode) => z
    .number()
    .int()
    .min(ASTRA_VIDEO_MIN_FRAMES)
    .max(ASTRA_VIDEO_FRAME_LIMITS[mode])
    .refine((n) => (n - 1) % ASTRA_VIDEO_FRAME_STEP === 0, {
    message: `numFrames must be 8k+1 (25, 33, 41 … ${ASTRA_VIDEO_FRAME_LIMITS[mode]})`,
})
    .optional();
/**
 * `duration` (seconds) → frames, the server's rule (ltx-api contract 2026-10-17): the nearest 8k+1
 * to seconds × frameRate, the shorter one on a tie. 5s→121 · 4s→97 · 2s→49 · 1s→25 at 24fps.
 */
export function framesForSeconds(seconds, frameRate = 24) {
    // Same expression as the server's duration_to_frames, epsilon included, so a float near-tie
    // (2.2105…s × 23.976 = 53.000000000000001) lands on the same frame count on both sides.
    const frames = seconds * frameRate;
    return 1 + ASTRA_VIDEO_FRAME_STEP * Math.ceil((frames - 1) / ASTRA_VIDEO_FRAME_STEP - 0.5 - 1e-9);
}
const durationSchema = z.number().positive().finite().optional();
/** One length argument only, and the converted frame count must fit the mode. */
function checkDuration(data, mode, ctx) {
    if (data.numFrames !== undefined && data.autoDuration !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['autoDuration'], message: 'autoDuration and numFrames are mutually exclusive' });
    }
    if (data.duration === undefined)
        return;
    for (const other of ['numFrames', 'autoDuration', 'audioMaxDuration']) {
        if (data[other] !== undefined) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['duration'], message: `duration and ${other} are mutually exclusive — give one length` });
        }
    }
    const fps = data.frameRate ?? 24;
    const frames = framesForSeconds(data.duration, fps);
    const max = ASTRA_VIDEO_FRAME_LIMITS[mode];
    if (frames < ASTRA_VIDEO_MIN_FRAMES || frames > max) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['duration'],
            // Nearest-grid rounding: frames f cover seconds×fps in (f-4, f+4], so the accepted span is
            // more than (min-4)/fps and at most (max+4)/fps — the bounds the server states too.
            message: `duration ${data.duration}s at ${fps}fps is ${frames} frames; mode ${mode} takes ${ASTRA_VIDEO_MIN_FRAMES}-${max} frames, i.e. duration more than ${((ASTRA_VIDEO_MIN_FRAMES - ASTRA_VIDEO_FRAME_STEP / 2) / fps).toFixed(4)}s and at most ${((max + ASTRA_VIDEO_FRAME_STEP / 2) / fps).toFixed(4)}s`,
        });
    }
}
/** The tool sends frames: `duration` becomes numFrames, so every frame check below applies to it. */
function resolveDuration(data) {
    const { duration, ...rest } = data;
    return duration === undefined ? rest : { ...rest, numFrames: framesForSeconds(duration, data.frameRate ?? 24) };
}
/** `generateAudio: false` strips the sound stream after generation (same GPU time). */
const generateAudioSchema = z.boolean().optional();
const hdrSchema = z.enum(['SRGB_LINEAR', 'ACESCG', 'ACESCCT']).optional();
const seedSchema = z.number().int().min(0).max(ASTRA_VIDEO_MAX_SEED).optional();
const frameRateSchema = z.number().min(1).max(60).optional();
const negativePromptSchema = z.string().max(ASTRA_VIDEO_MAX_PROMPT_CHARS).optional();
const numInferenceStepsSchema = z.number().int().min(1).max(50).optional();
const numGeneratedKeyframesSchema = z.number().int().min(0).max(16).optional();
const widthSchema = z.number().int().positive().optional();
const heightSchema = z.number().int().positive().optional();
const autoDurationSchema = z
    .object({
    minSeconds: z.number().positive(),
    maxSeconds: z.number().positive(),
})
    .refine((d) => d.minSeconds <= d.maxSeconds, {
    message: 'autoDuration.minSeconds must be <= maxSeconds',
})
    .optional();
/** A bare name loads at strength 1.0 and is sent as the bare name, exactly as before. */
const loraSchema = z
    .array(z.union([
    z.enum(ASTRA_VIDEO_LORAS),
    z.object({
        name: z.enum(ASTRA_VIDEO_LORAS),
        strength: z.number().min(0).max(ASTRA_VIDEO_MAX_LORA_STRENGTH),
    }).strict(),
]))
    .max(ASTRA_VIDEO_MAX_LORAS)
    .refine((values) => {
    const names = values.map((value) => (typeof value === 'string' ? value : value.name));
    return new Set(names).size === names.length;
}, { message: 'lora names must be unique' })
    .optional();
const stgBlocksSchema = z
    .array(z.number().int().min(0).max(ASTRA_VIDEO_MAX_STG_BLOCK))
    .min(1)
    .max(ASTRA_VIDEO_MAX_STG_BLOCKS)
    .refine((values) => new Set(values).size === values.length, { message: 'stg block indices must be unique' })
    .optional();
const guidanceRange = (key) => {
    const [min, max] = ASTRA_VIDEO_GUIDANCE_RANGES[key];
    const number = key.endsWith('_skip_step') ? z.number().int() : z.number();
    return number.min(min).max(max).optional();
};
/** Omitted keys are omitted from the body, so the engine keeps its own default for each one. */
const guidanceSchema = z
    .object({
    ...Object.fromEntries(Object.keys(ASTRA_VIDEO_GUIDANCE_RANGES).map((key) => [guidanceToolKey(key), guidanceRange(key)])),
    videoStgBlocks: stgBlocksSchema,
    audioStgBlocks: stgBlocksSchema,
})
    .strict()
    .optional();
const outputFields = {
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('video').optional(),
};
/**
 * Pixel-grid check. guided_fast alone is on the 32 grid and is additionally bounded
 * 32..1920 per side; other modes use 64..1920 in multiples of 64. The area ceiling is shared.
 */
export function checkDimensions(width, height, mode) {
    const fast = mode === 'guided_fast';
    const step = fast ? ASTRA_VIDEO_FAST_DIMENSION_STEP : ASTRA_VIDEO_DIMENSION_STEP;
    for (const [name, value] of [['width', width], ['height', height]]) {
        if (value === undefined)
            continue;
        if (value % step !== 0)
            return `${name} must be a multiple of ${step} for mode ${mode} (got ${value})`;
        const min = fast ? ASTRA_VIDEO_FAST_MIN_DIMENSION : ASTRA_VIDEO_DIMENSION_STEP;
        if (value < min || value > 1920) {
            return `${name} must be between ${min} and 1920 for mode ${mode} (got ${value})`;
        }
    }
    // The server fills each omitted side independently, including single-sided requests.
    const pixels = (width ?? (fast ? 768 : 1536)) * (height ?? (fast ? 512 : 1024));
    if (pixels > ASTRA_VIDEO_MAX_PIXELS) {
        return `width * height must be at most ${ASTRA_VIDEO_MAX_PIXELS} (got ${pixels})`;
    }
    return null;
}
/** frame_idx is 0-based and must land inside the clip — 121 frames means 0..120, not 0..121. */
export function checkFrameIdx(frameIdx, numFrames) {
    const last = (numFrames ?? 121) - 1;
    if (frameIdx < 0 || frameIdx > last) {
        return `frameIdx must be between 0 and ${last} for a ${numFrames ?? 121}-frame clip (got ${frameIdx})`;
    }
    return null;
}
/** Validate the automatic-length grid after applying the request's frame rate. */
export function checkAutoDuration(duration, frameRate = 24) {
    const minFrames = Math.round(duration.minSeconds * frameRate);
    const maxFrames = Math.round(duration.maxSeconds * frameRate);
    if (minFrames < 1) {
        return `autoDuration must start at 1 frame or later after rounding (got ${minFrames} at ${frameRate}fps)`;
    }
    if (maxFrames > ASTRA_VIDEO_MAX_AUTO_FRAMES) {
        return `autoDuration must end at ${ASTRA_VIDEO_MAX_AUTO_FRAMES} frames or earlier after rounding (got ${maxFrames} at ${frameRate}fps)`;
    }
    const firstGridFrame = 1 + ASTRA_VIDEO_FRAME_STEP * Math.ceil((minFrames - 1) / ASTRA_VIDEO_FRAME_STEP);
    if (firstGridFrame > maxFrames) {
        return `autoDuration must contain an 8k+1 frame count after rounding (got ${minFrames}..${maxFrames} at ${frameRate}fps)`;
    }
    return null;
}
// ── tool schemas ─────────────────────────────────────────────────────────────
/**
 * astra_text2video — generate | guided | guided_fast.
 *
 * `tier` picks the mode, and three arguments are tier-bound because the server's allow-lists
 * are: lora exists only on generate, negativePrompt and numInferenceSteps only on the two
 * guided tiers. Sending one to the wrong tier is a 400 from the server, so it is a refusal
 * here — naming the tier that would have taken it.
 */
export const astraText2VideoSchema = z
    .object({
    prompt: promptSchema,
    tier: z.enum(['default', 'guided', 'fast', 'hq']).optional().default('default'),
    numFrames: numFramesSchema('generate'),
    autoDuration: autoDurationSchema,
    width: widthSchema,
    height: heightSchema,
    frameRate: frameRateSchema,
    seed: seedSchema,
    duration: durationSchema,
    generateAudio: generateAudioSchema,
    hdr: hdrSchema,
    lora: loraSchema,
    negativePrompt: negativePromptSchema,
    numInferenceSteps: numInferenceStepsSchema,
    numGeneratedKeyframes: numGeneratedKeyframesSchema,
    guidance: guidanceSchema,
    ...outputFields,
})
    .superRefine((data, ctx) => {
    checkDuration(data, ASTRA_VIDEO_TIERS[data.tier], ctx);
    const mode = ASTRA_VIDEO_TIERS[data.tier];
    if (data.numFrames !== undefined && data.numFrames > ASTRA_VIDEO_FRAME_LIMITS[mode]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['numFrames'], message: `numFrames must be at most ${ASTRA_VIDEO_FRAME_LIMITS[mode]} for mode ${mode}` });
    }
    if (data.lora?.length && mode !== 'generate') {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lora'],
            message: `lora is accepted only on tier "default" (mode generate); tier "${data.tier}" would be rejected by the server.`,
        });
    }
    if (mode === 'generate') {
        for (const key of ['negativePrompt', 'numInferenceSteps', 'guidance']) {
            if (data[key] !== undefined) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [key],
                    message: `${key} is accepted only on tier "guided", "fast" or "hq"; mode generate has no such field.`,
                });
            }
        }
    }
    const dimensionError = checkDimensions(data.width, data.height, mode);
    if (dimensionError) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['width'], message: dimensionError });
    }
    // Length selectors are mutually exclusive; validate automatic ranges independently.
    if (data.autoDuration && data.numFrames === undefined) {
        const durationError = checkAutoDuration(data.autoDuration, data.frameRate ?? 24);
        if (durationError) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['autoDuration'], message: durationError });
        }
    }
})
    .transform(resolveDuration);
/**
 * astra_img2video — generate or guided with one or two stills pinned to frames.
 *
 * negativePrompt and numInferenceSteps exist only on guided, as on text2video. autoDuration
 * cannot pick a length when lastFramePath is given: the end still is pinned to numFrames-1,
 * which the client has to know before the call.
 */
export const astraImg2VideoSchema = z
    .object({
    prompt: promptSchema,
    tier: z.enum(['default', 'guided', 'hq']).optional().default('default'),
    firstFramePath: z.string().min(1, 'firstFramePath is required'),
    lastFramePath: z.string().optional(),
    strength: z.number().min(0).max(1).optional(),
    numFrames: numFramesSchema('generate'),
    autoDuration: autoDurationSchema,
    width: widthSchema,
    height: heightSchema,
    frameRate: frameRateSchema,
    seed: seedSchema,
    duration: durationSchema,
    generateAudio: generateAudioSchema,
    lora: loraSchema,
    negativePrompt: negativePromptSchema,
    numInferenceSteps: numInferenceStepsSchema,
    numGeneratedKeyframes: numGeneratedKeyframesSchema,
    guidance: guidanceSchema,
    ...outputFields,
})
    .superRefine((data, ctx) => {
    checkDuration(data, ASTRA_VIDEO_TIERS[data.tier], ctx);
    const mode = ASTRA_VIDEO_TIERS[data.tier];
    if (data.numFrames !== undefined && data.numFrames > ASTRA_VIDEO_FRAME_LIMITS[mode]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['numFrames'], message: `numFrames must be at most ${ASTRA_VIDEO_FRAME_LIMITS[mode]} for mode ${mode}` });
    }
    if (mode === 'generate') {
        for (const key of ['negativePrompt', 'numInferenceSteps', 'guidance']) {
            if (data[key] !== undefined) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [key],
                    message: `${key} is accepted only on tier "guided" or "hq"; mode generate has no such field.`,
                });
            }
        }
    }
    // Validate the automatic range and require a known length for a final image.
    if (data.autoDuration && data.numFrames === undefined) {
        if (data.lastFramePath) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['autoDuration'],
                message: 'autoDuration cannot be combined with lastFramePath: the last still is pinned to numFrames-1, so give numFrames instead.',
            });
        }
        const durationError = checkAutoDuration(data.autoDuration, data.frameRate ?? 24);
        if (durationError) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['autoDuration'], message: durationError });
        }
    }
    if (mode !== 'generate' && data.lora?.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lora'], message: 'lora is accepted only on tier "default"' });
    }
    const dimensionError = checkDimensions(data.width, data.height, mode);
    if (dimensionError) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['width'], message: dimensionError });
    }
})
    .transform(resolveDuration);
/** astra_keyframe_video — mode keyframe. 2-8 stills, each pinned to a frame index. */
export const astraKeyframeVideoSchema = z
    .object({
    prompt: promptSchema,
    images: z
        .array(z.object({
        imagePath: z.string().min(1, 'imagePath is required'),
        frameIdx: z.number().int().min(0),
        strength: z.number().min(0).max(1).optional(),
        crf: z.number().int().min(0).max(51).optional(),
    }))
        .min(2, 'keyframe needs at least 2 images')
        .max(8, 'keyframe takes at most 8 images'),
    numFrames: numFramesSchema('keyframe'),
    width: widthSchema,
    height: heightSchema,
    frameRate: frameRateSchema,
    seed: seedSchema,
    duration: durationSchema,
    generateAudio: generateAudioSchema,
    negativePrompt: negativePromptSchema,
    numInferenceSteps: numInferenceStepsSchema,
    guidance: guidanceSchema,
    ...outputFields,
})
    .superRefine((data, ctx) => {
    checkDuration(data, 'keyframe', ctx);
    const dimensionError = checkDimensions(data.width, data.height, 'keyframe');
    if (dimensionError) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['width'], message: dimensionError });
    }
    data.images.forEach((image, index) => {
        const frameError = checkFrameIdx(image.frameIdx, data.numFrames ?? (data.duration === undefined ? undefined : framesForSeconds(data.duration, data.frameRate ?? 24)));
        if (frameError) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['images', index, 'frameIdx'], message: frameError });
        }
    });
})
    .transform(resolveDuration);
/** astra_audio2video — mode audio2video. The clip is driven by an uploaded wav/mp3. */
export const astraAudio2VideoSchema = z
    .object({
    prompt: promptSchema,
    audioPath: z.string().trim().min(1).optional(),
    audioUploadId: z.string().trim().min(1).optional(),
    imagePath: z.string().trim().min(1).optional(),
    strength: z.number().min(0).max(1).default(0.9)
        .describe("Portrait conditioning strength, 0.0-1.0 (default: 0.9); ignored without imagePath. Earlier dialogue probes: 0.9 accompanied mouth movement and 0.7 accompanied a changed person, but prompts also differed. A later fixed-prompt 19.2 pair is an observation, not proof of improved identity or lip-sync at 0.9. 1.0 is unmeasured on cuts with a clearly detailed, unobscured mouth close-up in the conditioning image; neither local dialogue source (19.2 or 25.3) meets that condition."),
    audioStartTime: z.number().min(0).optional(),
    audioMaxDuration: z.number().positive().optional(),
    numFrames: numFramesSchema('audio2video'),
    width: widthSchema,
    height: heightSchema,
    frameRate: frameRateSchema,
    seed: seedSchema,
    duration: durationSchema,
    generateAudio: generateAudioSchema,
    hdr: hdrSchema,
    negativePrompt: negativePromptSchema,
    numInferenceSteps: numInferenceStepsSchema,
    guidance: guidanceSchema,
    expectLipSync: z.boolean().default(false),
    maxAttempts: z.number().int().min(1).max(3).default(2),
    ...outputFields,
})
    .superRefine((data, ctx) => {
    checkDuration(data, 'audio2video', ctx);
    if (data.hdr && data.imagePath) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hdr'], message: 'hdr cannot be combined with imagePath; remove hdr or the visual input' });
    }
    if ((data.audioPath !== undefined) === (data.audioUploadId !== undefined)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['audioPath'], message: 'Provide exactly one of audioPath or audioUploadId' });
    }
    const dimensionError = checkDimensions(data.width, data.height, 'audio2video');
    if (dimensionError) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['width'], message: dimensionError });
    }
    if (data.numFrames !== undefined && data.audioMaxDuration !== undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['audioMaxDuration'],
            message: 'audioMaxDuration and numFrames are mutually exclusive',
        });
    }
})
    .transform(resolveDuration)
    // The live default field and contract_notes disagree; preserve the client default explicitly.
    .transform((data) => data.numFrames === undefined && data.audioMaxDuration === undefined
    ? { ...data, numFrames: 121 } : data);
/**
 * astra_video_retake — mode retake. Re-rolls one time span of an existing clip.
 *
 * There is no size or length argument at all: the output inherits the source. The source
 * itself has to be on the grid already (8k+1 frames, both sides a multiple of 32) or the
 * server refuses at acceptance.
 */
export const astraVideoRetakeSchema = z
    .object({
    prompt: promptSchema,
    sourceVideoPath: z.string().min(1, 'sourceVideoPath is required'),
    startTime: z.number().min(0),
    endTime: z.number().positive(),
    seed: seedSchema,
    generateAudio: generateAudioSchema,
    ...outputFields,
})
    .superRefine((data, ctx) => {
    if (data.startTime >= data.endTime) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endTime'],
            message: `endTime must be greater than startTime (got ${data.startTime} .. ${data.endTime})`,
        });
    }
});
/** Extension check before any upload: a refusal here costs no bandwidth and no queue slot. */
function uploadKindIssue(filePath, kinds, name) {
    try {
        const { kind } = uploadContentType(filePath);
        return kinds.includes(kind) ? null : `${name} must be ${kinds.join(' or ')} (got ${kind})`;
    }
    catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}
/**
 * astra_ic_lora — one reference still or clip through an IC-LoRA adapter (DESIGN §2).
 *
 * adapter "ingredients" runs as the measured `ingredients` mode and never sends `adapter`;
 * every other adapter runs as mode `ic_lora`. The server owns the adapter catalog — there is
 * no path argument. conditioningMask, skipStage2 and every adapter but ingredients are
 * live since the 2026-10-17 server change; their quality is unmeasured.
 */
export const astraIcLoraSchema = z
    .object({
    prompt: promptSchema,
    adapter: z.enum(ASTRA_VIDEO_IC_LORA_ADAPTERS),
    referencePath: z.string().trim().min(1, 'referencePath is required'),
    referenceStrength: z.number().min(0).max(1).optional(),
    conditioningMaskPath: z.string().trim().min(1).optional(),
    conditioningMaskStrength: z.number().min(0).max(1).optional(),
    skipStage2: z.boolean().optional(),
    numFrames: numFramesSchema('ic_lora'),
    width: widthSchema,
    height: heightSchema,
    frameRate: frameRateSchema,
    seed: seedSchema,
    duration: durationSchema,
    generateAudio: generateAudioSchema,
    ...outputFields,
})
    .superRefine((data, ctx) => {
    checkDuration(data, icLoraMode(data.adapter), ctx);
    const referenceIssue = uploadKindIssue(data.referencePath, ['image', 'video'], 'referencePath');
    if (referenceIssue)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['referencePath'], message: referenceIssue });
    if (data.conditioningMaskPath !== undefined) {
        const maskIssue = uploadKindIssue(data.conditioningMaskPath, ['video'], 'conditioningMaskPath');
        if (maskIssue)
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['conditioningMaskPath'], message: maskIssue });
    }
    else if (data.conditioningMaskStrength !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['conditioningMaskStrength'], message: 'conditioningMaskStrength needs conditioningMaskPath' });
    }
    const dimensionError = checkDimensions(data.width, data.height, icLoraMode(data.adapter));
    if (dimensionError) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['width'], message: dimensionError });
    }
})
    .transform(resolveDuration);
export function icLoraMode(adapter) {
    return adapter === 'ingredients' ? 'ingredients' : 'ic_lora';
}
/**
 * astra_video_upscale — the `pixel-upscaler-x2` IC-LoRA with its geometry worked out from the clip.
 * A generative re-render, not a scaler: measured 2026-10-30, a 512x896 drama clip kept its scene
 * but the face, mouth shapes and a prop colour drifted; a bare "upscale" prompt invented content.
 */
export const astraVideoUpscaleSchema = z
    .object({
    sourceVideoPath: z.string().trim().min(1, 'sourceVideoPath is required'),
    prompt: promptSchema,
    referenceStrength: z.number().min(0).max(1).optional(),
    seed: seedSchema,
    ...outputFields,
})
    .strict();
/** Exactly twice the source on the 64 grid, under the moving-reference ceiling, 8k+1 frames. */
export function upscaleGeometry(width, height, frames) {
    const out = { width: width * 2, height: height * 2 };
    if (out.width % 64 || out.height % 64) {
        throw new Error(`pixel-upscaler-x2 needs a source whose sides are multiples of 32 (got ${width}x${height})`);
    }
    if (out.width * out.height > ASTRA_VIDEO_MAX_REFERENCE_PIXELS) {
        throw new Error(`${width}x${height} doubles to ${out.width}x${out.height}, over the ${ASTRA_VIDEO_MAX_REFERENCE_PIXELS}-pixel ceiling for a moving reference; leave the clip to the final canvas scale`);
    }
    const numFrames = Math.min(ASTRA_VIDEO_FRAME_LIMITS.ic_lora, frames - ((frames - 1) % ASTRA_VIDEO_FRAME_STEP));
    if (numFrames < ASTRA_VIDEO_MIN_FRAMES)
        throw new Error(`pixel-upscaler-x2 needs at least ${ASTRA_VIDEO_MIN_FRAMES} frames (got ${frames})`);
    return { ...out, numFrames };
}
export async function upscaleVideo(args) {
    const source = path.resolve(args.sourceVideoPath);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries',
        'stream=codec_type,width,height,r_frame_rate,nb_read_frames', '-of', 'json', source], { encoding: 'utf8', timeout: 120_000 }));
    const video = probe.streams?.find((s) => s.codec_type === 'video');
    if (!video)
        throw new Error(`No video stream in ${source}`);
    const [num, den] = String(video.r_frame_rate).split('/').map(Number);
    const frames = Number(video.nb_read_frames), hasAudio = probe.streams.some((s) => s.codec_type === 'audio');
    const geometry = upscaleGeometry(video.width, video.height, frames);
    const result = await generateIcLora(astraIcLoraSchema.parse({
        prompt: args.prompt, adapter: 'pixel-upscaler-x2', referencePath: source, referenceStrength: args.referenceStrength,
        ...geometry, frameRate: num / (den || 1), seed: args.seed, generateAudio: false,
        outputPath: args.outputPath ?? path.dirname(source), filename: args.filename ?? `${path.parse(source).name}-x2.mp4`,
    }));
    // The adapter renders picture only; the source soundtrack goes back on unchanged.
    if (hasAudio) {
        const muxed = `${result.videoPath}.${process.pid}.mux.mp4`;
        execFileSync('ffmpeg', ['-v', 'error', '-i', result.videoPath, '-i', source, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-shortest', muxed], { timeout: 120_000 });
        fs.renameSync(muxed, result.videoPath);
        result.bytes = fs.statSync(result.videoPath).size;
    }
    return { ...result, source: { path: source, width: video.width, height: video.height, frames }, droppedFrames: frames - geometry.numFrames, audio: hasAudio ? 'source_remuxed' : 'none' };
}
/** Validate audio metadata after upload, before consuming a job slot. */
/** The server's D6 slack: audio up to 0.06s shorter than the video still renders, so only 0.08s+ is refused. */
export const ASTRA_VIDEO_SHORT_AUDIO_SLACK = 0.08;
/**
 * The server's `check_audio_covers_video` (D6): on audio2video without audioMaxDuration the audio
 * after audioStartTime must cover the video, or the engine dies on a latent shape mismatch.
 * Only wav is judged — an mp3 length from ffprobe can be an estimate. Same fixes as the server's 400.
 */
export function checkAudioCoversVideo(usable, numFrames, frameRate, afterStart = false) {
    const videoSeconds = numFrames / frameRate;
    if (usable + ASTRA_VIDEO_SHORT_AUDIO_SLACK >= videoSeconds)
        return null;
    const fit = 8 * Math.floor((usable * frameRate - 1) / 8 + 1e-4) + 1;
    const fixes = [`re-upload audio of at least ${(Math.ceil(videoSeconds * 1e4) / 1e4).toFixed(4)}s`];
    if (fit >= ASTRA_VIDEO_MIN_FRAMES)
        fixes.push(`set numFrames to ${fit} or less (duration ${(fit / frameRate).toFixed(4)}s or less)`);
    fixes.push('use audioMaxDuration instead of numFrames/duration to follow the audio length');
    return `the audio is shorter than the video — usable audio ${usable.toFixed(3)}s${afterStart ? ' (after audioStartTime)' : ''} vs ${numFrames} frames = ${videoSeconds.toFixed(4)}s at ${frameRate}fps; generation would fail on a latent shape mismatch. Fix: ${fixes.map((f, i) => `(${i + 1}) ${f}`).join(' · ')}`;
}
export function checkAudioSource(upload, args) {
    if (upload.kind !== 'audio')
        return `audioPath uploaded as ${upload.kind}, not audio`;
    if (!Number.isFinite(upload.duration) || (upload.duration ?? 0) <= 0) {
        return 'audio upload response did not include a positive duration';
    }
    const start = args.audioStartTime ?? 0;
    const duration = upload.duration;
    if (start >= duration) {
        return `audioStartTime must be less than the source duration ${duration}s (got ${start})`;
    }
    if (args.audioMaxDuration === undefined && args.wav) {
        const shortError = checkAudioCoversVideo(duration - start, args.numFrames ?? 121, args.frameRate ?? 24, start > 0);
        if (shortError)
            return shortError;
    }
    if (args.numFrames !== undefined || args.audioMaxDuration === undefined)
        return null;
    const usableSeconds = Math.min(args.audioMaxDuration, duration - start);
    const rawFrames = Math.floor(usableSeconds * (args.frameRate ?? 24));
    const clampedFrames = Math.max(1, Math.min(1024, rawFrames));
    const gridFrames = 1 + ASTRA_VIDEO_FRAME_STEP * Math.floor((clampedFrames - 1) / ASTRA_VIDEO_FRAME_STEP);
    if (gridFrames > ASTRA_VIDEO_FRAME_LIMITS.audio2video) {
        return `audioMaxDuration selects ${gridFrames} frames after clipping and the 8k+1 grid; maximum is ${ASTRA_VIDEO_FRAME_LIMITS.audio2video}`;
    }
    return null;
}
/**
 * The server refuses a reference that feeds 2+ frames when the OUTPUT width x height is above the
 * pixel ceiling — the reference's own size does not matter (`check_reference_source`). Frames fed
 * = min(reference frames, numFrames). Checked after upload, before a job slot.
 */
export function checkReferenceSource(upload, numFrames = 121, // server DEFAULT_NUM_FRAMES — ic_lora modes never auto-predict length
width = 1536, height = 1024) {
    if (upload.kind !== 'image' && upload.kind !== 'video')
        return `referencePath uploaded as ${upload.kind}, not image or video`;
    const frames = upload.kind === 'image' ? 1 : Math.min(upload.frames ?? 0, numFrames);
    const pixels = width * height;
    if (frames > 1 && pixels > ASTRA_VIDEO_MAX_REFERENCE_PIXELS) {
        return `a reference feeding ${frames} frames allows an output of at most ${ASTRA_VIDEO_MAX_REFERENCE_PIXELS} pixels (got ${width}x${height} = ${pixels}); use a still reference or a smaller output`;
    }
    return null;
}
/**
 * The server's `check_mask_source`: the mask feeds as many frames as the reference, and that count
 * is 1 or 8k+1 (both capped by numFrames) — otherwise the engine asserts. Checked before the job slot.
 */
export function checkMaskSource(mask, reference, numFrames = 121) {
    if (mask.kind !== 'video')
        return `conditioningMaskPath uploaded as ${mask.kind}, not video`;
    if (!mask.frames)
        return 'conditioningMaskPath frame count unreadable — upload it again';
    const usedMask = Math.min(mask.frames, numFrames);
    const usedReference = reference.kind === 'image' ? 1 : Math.min(reference.frames ?? 0, numFrames);
    if (usedMask !== usedReference || !(usedReference === 1 || (usedReference - 1) % ASTRA_VIDEO_FRAME_STEP === 0)) {
        return `the mask must feed as many frames as the reference, and that count must be 1 or 8k+1 (after numFrames ${numFrames}: mask ${usedMask} · reference ${usedReference})`;
    }
    return null;
}
/** Validate retake source metadata and time span after upload, before consuming a job slot. */
export function checkRetakeSource(upload, startTime, endTime) {
    if (upload.kind !== 'video')
        return `sourceVideoPath uploaded as ${upload.kind}, not video`;
    if (!Number.isInteger(upload.frames) || (upload.frames ?? 0) < 1 || (upload.frames - 1) % ASTRA_VIDEO_FRAME_STEP !== 0) {
        return `retake source frames must be 8k+1 (got ${String(upload.frames)})`;
    }
    for (const [name, value] of [['width', upload.width], ['height', upload.height]]) {
        if (!Number.isInteger(value) || (value ?? 0) < 1 || value % ASTRA_VIDEO_FAST_DIMENSION_STEP !== 0) {
            return `retake source ${name} must be a positive multiple of ${ASTRA_VIDEO_FAST_DIMENSION_STEP} (got ${String(value)})`;
        }
    }
    if (!Number.isFinite(upload.fps) || (upload.fps ?? 0) <= 0) {
        return `retake source fps must be positive (got ${String(upload.fps)})`;
    }
    const sourceSeconds = upload.frames / upload.fps;
    if (endTime > sourceSeconds) {
        return `endTime must be at most the source duration ${sourceSeconds}s (got ${endTime})`;
    }
    if (startTime < 0 || startTime >= endTime) {
        return `retake span must satisfy 0 <= startTime < endTime (got ${startTime} .. ${endTime})`;
    }
    return null;
}
function put(body, key, value) {
    if (value !== undefined)
        body[key] = value;
}
/**
 * Assemble the `POST /v1/jobs` body from validated tool arguments plus whatever upload ids
 * the caller already obtained. Pure on purpose: every per-mode field rule is checked here,
 * with no network in the way.
 *
 * Throws when a key would be sent that the mode's allow-list does not contain — the same
 * 400 the server would answer, one round trip earlier.
 */
export function buildJobBody(mode, args) {
    const allowed = ASTRA_VIDEO_ALLOWED_FIELDS[mode];
    if (!allowed)
        throw new Error(`Unknown ASTRA video mode: ${mode}`);
    const body = { mode, prompt: args.prompt };
    if (args.numFrames !== undefined && args.autoDuration !== undefined) {
        throw new Error('autoDuration and numFrames are mutually exclusive');
    }
    if (args.hdr && (args.images?.length || args.references?.length || args.conditioningMask || args.videoUploadId)) {
        throw new Error('hdr cannot be combined with visual inputs');
    }
    put(body, 'hdr', args.hdr);
    put(body, 'num_frames', args.numFrames);
    if (args.autoDuration) {
        body.auto_duration = { min_seconds: args.autoDuration.minSeconds, max_seconds: args.autoDuration.maxSeconds };
    }
    put(body, 'width', args.width);
    put(body, 'height', args.height);
    put(body, 'frame_rate', args.frameRate);
    put(body, 'seed', args.seed);
    // Bare names stay bare names on the wire — the measured shape the live server accepts.
    if (args.lora?.length)
        body.lora = args.lora.map((entry) => (typeof entry === 'string' ? entry : { name: entry.name, strength: entry.strength }));
    if (args.guidance && Object.keys(args.guidance).length) {
        body.guidance = Object.fromEntries(Object.entries(args.guidance).map(([key, value]) => [guidanceWireKey(key), value]));
    }
    put(body, 'adapter', args.adapter);
    if (args.references?.length) {
        body.references = args.references.map((reference) => {
            const entry = { upload_id: reference.uploadId };
            put(entry, 'strength', reference.strength);
            return entry;
        });
    }
    if (args.conditioningMask) {
        const mask = { upload_id: args.conditioningMask.uploadId };
        put(mask, 'strength', args.conditioningMask.strength);
        body.conditioning_mask = mask;
    }
    // Only true is sent: false is the engine default, and omitting it keeps the measured body.
    if (args.skipStage2)
        body.skip_stage_2 = true;
    // Only false is sent: true is the server default, and omitting it keeps the measured body.
    if (args.generateAudio === false)
        body.generate_audio = false;
    put(body, 'negative_prompt', args.negativePrompt);
    put(body, 'num_inference_steps', args.numInferenceSteps);
    put(body, 'num_generated_keyframes', args.numGeneratedKeyframes);
    if (args.images?.length) {
        body.images = args.images.map((image) => {
            const entry = { upload_id: image.uploadId, frame_idx: image.frameIdx };
            put(entry, 'strength', image.strength);
            put(entry, 'crf', image.crf);
            return entry;
        });
    }
    put(body, 'audio_upload_id', args.audioUploadId);
    put(body, 'audio_start_time', args.audioStartTime);
    put(body, 'audio_max_duration', args.audioMaxDuration);
    put(body, 'video_upload_id', args.videoUploadId);
    put(body, 'start_time', args.startTime);
    put(body, 'end_time', args.endTime);
    const rejected = Object.keys(body).filter((key) => !allowed.includes(key));
    if (rejected.length) {
        throw new Error(`mode ${mode} does not accept ${rejected.join(', ')} — it accepts ${allowed.join(', ')}. ` +
            'Drop the field or pick the mode that owns it.');
    }
    return body;
}
// ── transport ────────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Acceptance is 5 requests per rolling minute and 60 per rolling hour per key; a 429 there
 * wastes a round trip and races other sessions on the same key. Submits therefore queue behind
 * module-level windows. The server also stops accepting work when 20 jobs are already waiting.
 */
const submitTimestamps = [];
async function waitForSubmitSlot() {
    for (;;) {
        const now = Date.now();
        while (submitTimestamps.length && now - submitTimestamps[0] >= 3_600_000)
            submitTimestamps.shift();
        const recentMinute = submitTimestamps.filter((timestamp) => now - timestamp < 60_000);
        if (recentMinute.length < ASTRA_VIDEO_SUBMITS_PER_MINUTE && submitTimestamps.length < ASTRA_VIDEO_SUBMITS_PER_HOUR) {
            submitTimestamps.push(now);
            return;
        }
        const minuteWait = recentMinute.length >= ASTRA_VIDEO_SUBMITS_PER_MINUTE
            ? 60_000 - (now - recentMinute[0])
            : 0;
        const hourWait = submitTimestamps.length >= ASTRA_VIDEO_SUBMITS_PER_HOUR
            ? 3_600_000 - (now - submitTimestamps[0])
            : 0;
        await sleep(Math.max(minuteWait, hourWait) + 250);
    }
}
const uploadTimestamps = [];
async function waitForUploadSlot() {
    for (;;) {
        const now = Date.now();
        while (uploadTimestamps.length && now - uploadTimestamps[0] >= 60_000)
            uploadTimestamps.shift();
        if (uploadTimestamps.length < ASTRA_VIDEO_UPLOADS_PER_MINUTE) {
            uploadTimestamps.push(now);
            return;
        }
        await sleep(60_000 - (now - uploadTimestamps[0]) + 250);
    }
}
/** Errors quote the server's words and the status. The key is in the headers and stays there. */
function redactedFailure(what, status, body) {
    const trimmed = body.length > 600 ? `${body.slice(0, 600)}…` : body;
    return new Error(`ASTRA video ${what} failed (HTTP ${status}): ${trimmed}`);
}
/** 400/401/404/413/415 are the caller's problem — retrying spends the rate limit for nothing. */
function isTerminalStatus(status) {
    return status === 400 || status === 401 || status === 403 || status === 404 || status === 413 || status === 415;
}
export function astraVideoHeaders(key) {
    return {
        Authorization: `Bearer ${key}`,
        'User-Agent': ASTRA_VIDEO_USER_AGENT,
    };
}
function authHeaders() {
    return astraVideoHeaders(requireAstraVideoKey());
}
function jobsUrl(suffix = '') {
    return `${astraVideoBaseUrl()}/v1/jobs${suffix}`;
}
/**
 * Retry wrapper for the transient statuses only: 429 (rate limit) and 503 (worker not taking
 * work). Exponential, four attempts — beyond that the queue is genuinely full and a person
 * should hear about it.
 *
 * baseDelayMs matters: acceptance is limited per MINUTE, so a 2s-4s-8s ladder would spend all
 * four attempts inside the same window that rejected the first. Submits pass 15s.
 */
async function withBackoff(what, call, baseDelayMs = 2_000) {
    let delay = baseDelayMs;
    let last;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const result = await call();
        if (result.ok || (result.status !== 429 && result.status !== 503))
            return result;
        last = result;
        await sleep(delay);
        delay *= 2;
    }
    return last;
}
const CONTENT_TYPE_BY_EXTENSION = {
    '.png': { contentType: 'image/png', kind: 'image' },
    '.jpg': { contentType: 'image/jpeg', kind: 'image' },
    '.jpeg': { contentType: 'image/jpeg', kind: 'image' },
    '.mp4': { contentType: 'video/mp4', kind: 'video' },
    '.wav': { contentType: 'audio/wav', kind: 'audio' },
    '.mp3': { contentType: 'audio/mpeg', kind: 'audio' },
};
/** The server keys the upload kind off Content-Type, so the extension has to resolve to one. */
export function uploadContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const found = CONTENT_TYPE_BY_EXTENSION[ext];
    if (!found) {
        throw new Error(`ASTRA video uploads accept ${Object.keys(CONTENT_TYPE_BY_EXTENSION).join(', ')} — "${ext || filePath}" is not one of them.`);
    }
    return found;
}
/**
 * Upload one local file and return its id.
 *
 * Raw bytes as the body, which is why this does not go through http.ts (see the file header).
 */
export async function uploadFile(filePath) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved))
        throw new Error(`File not found: ${filePath}`);
    const { contentType, kind } = uploadContentType(resolved);
    const bytes = fs.statSync(resolved).size;
    const limit = ASTRA_VIDEO_UPLOAD_LIMITS[kind];
    if (bytes > limit) {
        throw new Error(`${path.basename(resolved)} is ${bytes} bytes; the ${kind} upload ceiling is ${limit} bytes.`);
    }
    await waitForUploadSlot();
    const headers = authHeaders();
    const result = await withBackoff('upload', async () => {
        try {
            const response = await fetch(`${astraVideoBaseUrl()}/v1/uploads`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': contentType },
                body: fs.readFileSync(resolved),
                signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS),
            });
            return { ok: response.ok, status: response.status, body: await response.text() };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { ok: false, status: 502, body: `Upload unreachable: ${message}` };
        }
    });
    if (!result.ok)
        throw redactedFailure(`upload of ${path.basename(resolved)}`, result.status, result.body);
    const parsed = JSON.parse(result.body);
    return {
        uploadId: parsed.upload_id,
        bytes: parsed.bytes,
        kind: parsed.kind,
        ...(parsed.expires_at !== undefined ? { expiresAt: parsed.expires_at } : {}),
        ...(parsed.duration !== undefined ? { duration: parsed.duration } : {}),
        ...(parsed.width !== undefined ? { width: parsed.width } : {}),
        ...(parsed.height !== undefined ? { height: parsed.height } : {}),
        ...(parsed.frames !== undefined ? { frames: parsed.frames } : {}),
        ...(parsed.fps !== undefined ? { fps: parsed.fps } : {}),
    };
}
/** Accept a job and return its id. Honours the client-side minute/hour windows before calling. */
async function submitJob(body) {
    const bodyBytes = Buffer.byteLength(JSON.stringify(body));
    if (bodyBytes > ASTRA_VIDEO_MAX_JOB_BODY_BYTES) {
        throw new Error(`ASTRA video job body is ${bodyBytes} bytes; the ceiling is ${ASTRA_VIDEO_MAX_JOB_BODY_BYTES} bytes.`);
    }
    await waitForSubmitSlot();
    const result = await withBackoff('submit', () => requestRaw('post', jobsUrl(), authHeaders(), body, SUBMIT_TIMEOUT_MS), 15_000);
    if (!result.ok)
        throw redactedFailure('job submission', result.status, result.body);
    const parsed = JSON.parse(result.body);
    if (!parsed.job_id)
        throw new Error(`ASTRA video accepted the job but returned no job_id: ${result.body}`);
    return parsed.job_id;
}
/**
 * Poll one job to a terminal state and download the mp4.
 *
 * Three things end the loop: `succeeded` (download), `failed` (throw with the server's
 * `error`), and the 1800s wall the server itself enforces on a single job.
 */
async function awaitResult(jobId) {
    const startedAt = Date.now();
    for (;;) {
        if (Date.now() - startedAt > ASTRA_VIDEO_MAX_WAIT_MS) {
            throw new Error(`ASTRA video job ${jobId} did not finish within ${ASTRA_VIDEO_MAX_WAIT_MS / 1000}s. ` +
                `It may still be running — check GET /v1/jobs/${jobId}.`);
        }
        const status = await withBackoff('status', () => requestRaw('get', jobsUrl(`/${jobId}`), authHeaders(), undefined, STATUS_TIMEOUT_MS));
        if (!status.ok) {
            if (isTerminalStatus(status.status))
                throw redactedFailure(`status of job ${jobId}`, status.status, status.body);
            await sleep(POLL_INTERVAL_MS);
            continue;
        }
        const job = JSON.parse(status.body);
        if (job.status === 'failed') {
            throw new Error(`ASTRA video job ${jobId} failed: ${job.error || 'the server gave no reason'}`);
        }
        if (job.status === 'succeeded') {
            const download = await withBackoff('result download', async () => {
                try {
                    const response = await fetch(jobsUrl(`/${jobId}/result`), {
                        headers: authHeaders(),
                        signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS),
                    });
                    return {
                        ok: response.ok,
                        status: response.status,
                        bytes: Buffer.from(await response.arrayBuffer()),
                    };
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    return { ok: false, status: 502, bytes: Buffer.from(message) };
                }
            });
            // 409 means "succeeded, file not flushed yet" — keep polling rather than failing.
            if (download.status === 409) {
                await sleep(POLL_INTERVAL_MS);
                continue;
            }
            if (!download.ok) {
                throw redactedFailure(`result download of job ${jobId}`, download.status, download.bytes.toString('utf8'));
            }
            return {
                bytes: download.bytes,
                request: job.request,
                elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
            };
        }
        await sleep(POLL_INTERVAL_MS);
    }
}
async function runJob(mode, prompt, body, outputPath, filename) {
    // The host may stop waiting before this worker finishes. Keep the job identity and
    // completed response on disk so a transport timeout never requires blind resubmission.
    const videoPath = resolveOutputFile(outputPath || process.cwd(), filename || `astra_${Date.now()}.mp4`, 'video');
    const receiptPath = `${videoPath}.astra-job.json`;
    const writeReceipt = (value) => {
        const temp = `${receiptPath}.${process.pid}.tmp`;
        fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
        fs.renameSync(temp, receiptPath);
    };
    const jobId = await submitJob(body);
    recordVideoSubmission(jobId);
    const submitted = { jobId, mode, prompt, videoPath, submittedAt: new Date().toISOString(), submittedRequest: body };
    writeReceipt({ ...submitted, status: 'submitted' });
    const { bytes, request, elapsedSeconds } = await awaitResult(jobId);
    fs.writeFileSync(videoPath, bytes);
    const response = { videoPath, jobId, mode, prompt, bytes: bytes.length, elapsedSeconds, ...(request ? { request } : {}) };
    writeReceipt({ ...submitted, ...response, sha256: createHash('sha256').update(bytes).digest('hex'), status: 'completed', completedAt: new Date().toISOString() });
    return response;
}
// ── the five entry points ────────────────────────────────────────────────────
export async function generateFromText(args) {
    const mode = ASTRA_VIDEO_TIERS[args.tier];
    const body = buildJobBody(mode, args);
    return runJob(mode, args.prompt, body, args.outputPath, args.filename);
}
export async function generateFromImage(args) {
    const first = await uploadFile(args.firstFramePath);
    const images = [{ uploadId: first.uploadId, frameIdx: 0, strength: args.strength ?? 1.0 }];
    if (args.lastFramePath) {
        const last = await uploadFile(args.lastFramePath);
        images.push({ uploadId: last.uploadId, frameIdx: (args.numFrames ?? 121) - 1, strength: args.strength ?? 1.0 });
    }
    const mode = ASTRA_VIDEO_TIERS[args.tier];
    const dimensions = mode === 'guided' || mode === 'guided_hq' ? { width: args.width ?? 1536, height: args.height ?? 1024 } : {};
    const body = buildJobBody(mode, { ...args, ...dimensions, images });
    return runJob(mode, args.prompt, body, args.outputPath, args.filename);
}
export async function generateFromKeyframes(args) {
    const images = [];
    for (const image of args.images) {
        const uploaded = await uploadFile(image.imagePath);
        images.push({ uploadId: uploaded.uploadId, frameIdx: image.frameIdx, strength: image.strength ?? 1.0, crf: image.crf });
    }
    const body = buildJobBody('keyframe', { ...args, images });
    return runJob('keyframe', args.prompt, body, args.outputPath, args.filename);
}
export async function generateFromAudio(args) {
    if (args.imagePath && uploadContentType(args.imagePath).kind !== 'image') {
        throw new Error('ASTRA video imagePath must be an image (.png/.jpg/.jpeg)');
    }
    const audio = args.audioPath !== undefined ? await uploadFile(args.audioPath) : undefined;
    if (audio) {
        const sourceError = checkAudioSource(audio, { ...args, wav: /\.wav$/i.test(args.audioPath ?? '') });
        if (sourceError)
            throw new Error(`ASTRA video audio source refused: ${sourceError}`);
    }
    // Reused ids have no locally known metadata; the server validates expiry and duration.
    const audioUploadId = audio?.uploadId ?? args.audioUploadId;
    const image = args.imagePath ? await uploadFile(args.imagePath) : undefined;
    if (image && image.kind !== 'image')
        throw new Error('ASTRA video imagePath must upload as image');
    const images = image ? [{ uploadId: image.uploadId, frameIdx: 0, strength: args.strength }] : undefined;
    const uploaded = { audioUploadId, audioExpiresAt: audio?.expiresAt, audioDuration: audio?.duration };
    if (!args.expectLipSync) {
        const body = buildJobBody('audio2video', { ...args, audioUploadId, images });
        return { ...await runJob('audio2video', args.prompt, body, args.outputPath, args.filename), ...uploaded };
    }
    // LTX 2.5 sometimes ignores the voice, and which seeds do is luck: same audio, image and
    // prompt, a new seed only. Never an error — the best clip ships with its findings.
    const results = [];
    const attempts = [];
    let retryError;
    for (let attempt = 1; attempt <= args.maxAttempts; attempt += 1) {
        const seed = attempt === 1 ? args.seed : randomInt(ASTRA_VIDEO_MAX_SEED);
        const filename = attempt === 1 || !args.filename ? args.filename : args.filename.replace(/(\.[^.]+)?$/, (ext) => `-attempt${attempt}${ext}`);
        const body = buildJobBody('audio2video', { ...args, seed, audioUploadId, images });
        let result;
        try {
            result = await runJob('audio2video', args.prompt, body, args.outputPath, filename);
        }
        catch (error) {
            if (attempt === 1)
                throw error;
            // A failed retry must not cost the clip already on disk.
            retryError = `attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`;
            break;
        }
        const check = checkSpeechSync({ videoPath: result.videoPath, audioPath: args.audioPath, audioStartTime: args.audioStartTime, audioMaxDuration: args.audioMaxDuration });
        annotateReceipt(result.videoPath, { speechSync: { attempt, seed: seed ?? null, ...check } });
        results.push(result);
        attempts.push({ videoPath: result.videoPath, jobId: result.jobId, seed, check });
        if (!check.findings.some((finding) => finding.reseed))
            break;
    }
    const last = attempts.length - 1;
    const chosen = attempts[last].check.findings.some((finding) => finding.reseed)
        ? attempts.reduce((best, a, i) => ((a.check.sync?.margin ?? -Infinity) > (attempts[best].check.sync?.margin ?? -Infinity) ? i : best), 0)
        : last;
    // This selects a transport candidate, never an accepted performance. Carry that
    // distinction in the persisted receipt so attachment and assembly cannot lose it.
    annotateReceipt(results[chosen].videoPath, { selection: { status: 'provisional',
            basis: 'picture_motion_audio_correlation', candidate: chosen,
            review: { camera: 'not_reviewed', blocking: 'not_reviewed', phonemeLipSync: 'not_reviewed' } } });
    return { ...results[chosen], ...uploaded, speechSync: { attempts, chosen, ...(retryError ? { retryError } : {}) } };
}
function annotateReceipt(videoPath, extra) {
    const receiptPath = `${videoPath}.astra-job.json`;
    const temp = `${receiptPath}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ ...JSON.parse(fs.readFileSync(receiptPath, 'utf8')), ...extra }, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temp, receiptPath);
}
export async function generateIcLora(args) {
    const reference = await uploadFile(args.referencePath);
    const referenceError = checkReferenceSource(reference, args.numFrames, args.width, args.height);
    if (referenceError)
        throw new Error(`ASTRA video reference refused: ${referenceError}`);
    let conditioningMask;
    if (args.conditioningMaskPath) {
        const mask = await uploadFile(args.conditioningMaskPath);
        const maskError = checkMaskSource(mask, reference, args.numFrames);
        if (maskError)
            throw new Error(`ASTRA video conditioning mask refused: ${maskError}`);
        conditioningMask = { uploadId: mask.uploadId, strength: args.conditioningMaskStrength };
    }
    const mode = icLoraMode(args.adapter);
    // `adapter` is the {...args} key; ingredients owns no such field, so it is dropped there.
    const { adapter, ...rest } = args;
    const body = buildJobBody(mode, {
        ...rest,
        ...(mode === 'ic_lora' ? { adapter } : {}),
        references: [{ uploadId: reference.uploadId, strength: args.referenceStrength }],
        conditioningMask,
    });
    return runJob(mode, args.prompt, body, args.outputPath, args.filename);
}
export async function retakeVideo(args) {
    const source = await uploadFile(args.sourceVideoPath);
    const sourceError = checkRetakeSource(source, args.startTime, args.endTime);
    if (sourceError)
        throw new Error(`ASTRA video retake source refused: ${sourceError}`);
    const body = buildJobBody('retake', { ...args, videoUploadId: source.uploadId });
    return runJob('retake', args.prompt, body, args.outputPath, args.filename);
}
