/** The native Desktop queue on the MCP host. Its downloaded offerings and asset IDs belong to this app. */
import { statSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { bareFilenameSchema } from './media-utils.js';
import { mediaType, runVendorJob, VendorHttpError, } from './vendor-video.js';
import { desktopAudioWindow } from './astra-genai-desktop.js';
import { ltxApiAudioSeconds } from './ltx-api-video.js';
export const LOCAL_DESKTOP_ENGINE = 'ltx-desktop-local';
const modelId = z.string().regex(/^ltx-[a-z0-9.-]+$/i);
const aspect = z.enum(['21:9', '16:9', '3:2', '4:3', '1:1', '4:5', '9:16']);
const res = z.enum(['270p', '360p', '540p', '720p', '1080p', '1440p', '2160p']);
const common = z
    .object({
    model: modelId,
    prompt: z.string().trim().min(1),
    resolution: res,
    fps: z.union([z.literal(24), z.literal(25), z.literal(48), z.literal(50)]).default(24),
    seed: z.number().int().nonnegative().safe().optional(),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('video')
        .refine((s) => s.endsWith('.mp4'))
        .optional(),
})
    .strict();
export const DESKTOP_SECONDS = [2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20];
const picture = common.extend({
    durationSeconds: z
        .number()
        .int()
        .refine((n) => DESKTOP_SECONDS.includes(n))
        .default(2),
});
export const localTextSchema = picture.extend({ aspectRatio: aspect.default('16:9') });
export const localImageSchema = picture.extend({
    aspectRatio: z.union([aspect, z.literal('auto')]).default('auto'),
    imagePath: z.string().min(1),
    lastFramePath: z.string().min(1).optional(),
});
export const localAudioSchema = common.extend({
    aspectRatio: aspect.default('16:9'),
    audioPath: z.string().min(1),
    imagePath: z.string().min(1).optional(),
});
const droppedAspect = z.object({
    resolution: z.string(),
    fps: z.number(),
    duration: z.number(),
    aspectRatio: z.string(),
    audio: z.boolean(),
});
const assetFields = [
    ['imagePath', 'startFrame'],
    ['lastFramePath', 'endFrame'],
    ['audioPath', 'audio'],
];
const matrix = z.record(z.object({ fps_to_durations: z.record(z.array(z.number())), aspect_ratios: z.array(z.string()) }));
const localSpecs = z.object({
    local_unavailable_reason: z.string().nullable(),
    downloaded_local_models: z.array(z.object({
        model: modelId,
        spec: z.object({
            capabilities: z.object({ t2v: z.boolean(), i2v: z.boolean(), a2v: z.boolean() }).nullable(),
            supported_resolutions_durations: matrix,
            a2v_supported_resolutions_durations: matrix.nullish(),
            dropped_aspect_cells: z.array(droppedAspect).nullish(),
        }),
    })),
});
function localOrigin() {
    const value = process.env.LTX_DESKTOP_BASE_URL || 'http://127.0.0.1:41954';
    if (!/^http:\/\/(127\.0\.0\.1|\[::1\])(:[0-9]+)?\/?$/.test(value))
        throw new Error('LTX_DESKTOP_BASE_URL must use the loopback address 127.0.0.1 or [::1].');
    return new URL(value).origin;
}
export function localDesktopConfigured() {
    try {
        return Boolean(localOrigin() && process.env.LTX_DESKTOP_API_KEY);
    }
    catch {
        return false;
    }
}
async function callDesktop(endpoint, body) {
    const origin = localOrigin();
    const key = process.env.LTX_DESKTOP_API_KEY;
    if (!key)
        throw new Error('Set LTX_DESKTOP_API_KEY to the local Desktop backend credential.');
    const response = await fetch(origin + endpoint, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
            Authorization: 'Bearer ' + key,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
        await response.body?.cancel();
        const status = response.status;
        throw new VendorHttpError('LTX Desktop ' + endpoint + ' returned HTTP ' + status, status, status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status));
    }
    return response;
}
export async function localDesktopCatalog() {
    const specs = localSpecs.parse(await (await callDesktop('/api/generate/models-specs')).json());
    return {
        engine: LOCAL_DESKTOP_ENGINE,
        origin: localOrigin(),
        unavailableReason: specs.local_unavailable_reason,
        models: specs.downloaded_local_models.map(({ model, spec }) => ({ id: model, ...spec })),
    };
}
export function validateDesktopFiles(args) {
    for (const [field] of assetFields) {
        const file = args[field];
        if (typeof file !== 'string')
            continue;
        mediaType(file, 
        // LTX Desktop's asset ingest refuses .ogg.
        field === 'audioPath' ? ['.mp3', '.wav', '.m4a'] : ['.jpg', '.jpeg', '.png', '.webp']);
        const stat = statSync(file);
        if (!stat.isFile() || stat.size === 0)
            throw new Error('Expected a nonempty local media file: ' + file);
    }
    if ('audioPath' in args)
        desktopAudioWindow(args, ltxApiAudioSeconds(args.audioPath));
}
const identifier = z.string().regex(/^[a-zA-Z0-9_-]+$/);
export async function pollLocalDesktop(id) {
    const raw = await (await callDesktop('/api/generations/' + identifier.parse(id))).json();
    const job = z
        .object({
        id: identifier,
        lane: z.literal('local'),
        status: z.string(),
        error_code: z.string().nullable().optional(),
        outputs: z.array(z.object({ id: identifier, media_kind: z.string() })),
    })
        .parse(raw);
    if (job.id !== id)
        throw new Error('Desktop returned a different generation ID.');
    if (['failed', 'canceled', 'cancelled'].includes(job.status))
        return { state: 'failed', error: job.error_code || job.status };
    if (['queued', 'running', 'cancelling'].includes(job.status))
        return { state: 'running' };
    if (job.status !== 'succeeded')
        throw new Error('Unrecognized Desktop generation status: ' + job.status);
    const asset = job.outputs.find((item) => item.media_kind === 'video');
    if (!asset)
        throw new Error('Desktop returned no video asset.');
    const response = await callDesktop('/api/assets/' + asset.id + '/bytes');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.toString('ascii', 4, 8) !== 'ftyp')
        throw new Error('Desktop output is not an MP4.');
    return {
        state: 'done',
        bytes,
        meta: { engine: LOCAL_DESKTOP_ENGINE, lane: job.lane, assetId: asset.id },
    };
}
/** Read the live device matrix before approval, then again before the native job is submitted. */
export async function checkDesktopOffering(args, minimumSeconds) {
    const catalog = await localDesktopCatalog();
    const model = catalog.models.find((item) => item.id === args.model);
    const audio = typeof args.audioPath === 'string';
    const operation = audio ? 'a2v' : args.imagePath ? 'i2v' : 't2v';
    if (catalog.unavailableReason || !model?.capabilities?.[operation])
        throw new Error(catalog.unavailableReason || 'Selected local model or operation is unavailable: ' + args.model);
    const matrix = audio ? model.a2v_supported_resolutions_durations : model.supported_resolutions_durations;
    const cell = matrix?.[String(args.resolution)];
    const durations = cell?.fps_to_durations[String(args.fps)];
    if (!durations?.length ||
        (args.aspectRatio !== 'auto' && !cell?.aspect_ratios.includes(String(args.aspectRatio))))
        throw new Error('Selected settings are unavailable on this Desktop model.');
    const supported = [...durations].sort((a, b) => a - b);
    const dropped = (duration) => model.dropped_aspect_cells?.some((cell) => cell.resolution === args.resolution &&
        cell.fps === args.fps &&
        cell.duration === duration &&
        cell.aspectRatio === args.aspectRatio &&
        cell.audio === audio);
    if (minimumSeconds !== undefined && !audio) {
        const covering = supported.find((seconds) => seconds >= minimumSeconds && !dropped(seconds));
        if (covering === undefined)
            throw new Error('No duration on this Desktop model covers the requested shot at the selected settings.');
        return covering;
    }
    const audioSeconds = typeof args.audioPath === 'string' ? ltxApiAudioSeconds(args.audioPath) : undefined;
    const duration = audioSeconds !== undefined
        ? supported.find((seconds) => seconds >= audioSeconds)
        : args.durationSeconds;
    if (typeof duration !== 'number' || !supported.includes(duration))
        throw new Error('Selected duration is unavailable on this Desktop model.');
    if (dropped(duration))
        throw new Error('This aspect ratio is unavailable at the selected Desktop settings.');
    return duration;
}
export async function generateLocalDesktop(args) {
    const feature = 'audioPath' in args ? 'audio-to-video' : 'imagePath' in args ? 'image-to-video' : 'text-to-video';
    const duration = 'durationSeconds' in args ? args.durationSeconds : undefined;
    const inputs = {};
    try {
        validateDesktopFiles(args);
        await checkDesktopOffering(args);
        const registered = new Map();
        for (const [field, role] of assetFields) {
            const file = args[field];
            if (typeof file === 'string') {
                const absolute = path.resolve(file);
                let assetId = registered.get(absolute);
                if (!assetId) {
                    const asset = await (await callDesktop('/api/assets', { path: absolute })).json();
                    assetId = identifier.parse(asset.id);
                    registered.set(absolute, assetId);
                }
                inputs[role] = { assetId };
            }
        }
    }
    catch (error) {
        return { success: false, terminal: true, error: String(error) };
    }
    const params = {
        model: args.model,
        prompt: args.prompt,
        promptProvenance: 'enhanced',
        resolution: args.resolution,
        aspectRatio: args.aspectRatio,
        fps: args.fps,
        seed: args.seed,
        duration,
    };
    return runVendorJob({
        vendor: 'Local LTX Desktop',
        outputPath: args.outputPath || process.cwd(),
        filename: args.filename || 'desktop-' + Date.now() + '.mp4',
        intervalMs: 2500,
        maxPolls: 1440,
        submit: async () => {
            const job = await (await callDesktop('/api/generations/' + feature, {
                params,
                contract_version: 1,
                ...(Object.keys(inputs).length ? { inputs } : {}),
            })).json();
            return identifier.parse(job.id);
        },
        poll: pollLocalDesktop,
    });
}
