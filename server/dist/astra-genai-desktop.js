/** Gateway-owned Desktop assets and jobs, independent of the model runtime. */
import { z } from 'zod';
import * as fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { astraGenaiBaseUrl, requestGenai, requestGenaiMedia, requireAstraGenaiKey } from './astra-genai-client.js';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';
import { atomicJson } from './routing-files.js';
import { recordVideoSubmission } from './video-events.js';
const ROOT = '/v1/ltx/desktop';
const model = z.enum(['ltx-2.3-fast', 'ltx-2.5-fast']);
const resolution = z.enum(['270p', '360p', '540p', '720p', '1080p', '1440p', '2160p']);
const duration = z.number().int().refine(n => [2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20].includes(n));
const aspect = z.enum(['21:9', '16:9', '3:2', '4:3', '1:1', '4:5', '9:16']);
const loras = z.array(z.object({ ref: z.string().min(1), scale: z.number().finite().min(0).max(4).default(1) }).strict()).min(1)
    .refine(rows => new Set(rows.map(r => r.ref)).size === rows.length, 'Duplicate LoRA refs');
const local = {
    reserveUsd: z.number().finite().nonnegative(), outputPath: z.string().optional(),
    filename: bareFilenameSchema('video').refine(n => n.endsWith('.mp4')).optional(),
};
const common = z.object({ model, prompt: z.string().trim().min(1), resolution,
    seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    fps: z.union([z.literal(24), z.literal(25), z.literal(48), z.literal(50)]).default(24),
    cameraMotion: z.enum(['none', 'dolly_in', 'dolly_out', 'dolly_left', 'dolly_right', 'jib_up', 'jib_down', 'static', 'focus_shift']).optional(),
    ...local,
}).strict();
export const desktopTextSchema = common.extend({ duration, aspectRatio: aspect.default('16:9'), loras: loras.optional() }).strict();
export const desktopImageSchema = common.extend({ duration, aspectRatio: z.union([aspect, z.literal('auto')]).default('auto'),
    imagePath: z.string().min(1), lastFramePath: z.string().min(1).optional() }).strict();
export const desktopAudioSchema = common.extend({ audioPath: z.string().min(1), imagePath: z.string().min(1).optional(),
    aspectRatio: z.union([aspect, z.literal('auto')]).default('16:9'), allowAudioTruncation: z.boolean().default(false) }).strict();
const edit = z.object({ model, prompt: z.string().default(''), sourceVideoPath: z.string().min(1),
    targetResolution: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict().optional(),
    seed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(), ...local }).strict();
export const desktopExtendSchema = edit.extend({ duration: z.number().finite().min(2).max(20), mode: z.enum(['start', 'end']).default('end') }).strict();
export const desktopRetakeSchema = edit.extend({ duration: z.number().finite().min(2).max(10), startTime: z.number().finite().nonnegative(),
    mode: z.enum(['replace_audio_and_video', 'replace_video', 'replace_audio']).default('replace_audio_and_video') }).strict();
export const desktopKeyframesSchema = desktopTextSchema.extend({
    audio: z.boolean().default(false),
    keyframes: z.array(z.object({ imagePath: z.string().min(1), frameIndex: z.number().int().nonnegative(),
        strength: z.number().finite().min(0).max(1).default(1) }).strict()).min(1).max(10),
}).strict().superRefine((args, ctx) => {
    const indices = args.keyframes.map(f => f.frameIndex);
    if (new Set(indices).size !== indices.length || Math.max(...indices) >= Math.floor(args.duration * args.fps / 8) * 8 + 1)
        ctx.addIssue({ code: 'custom', message: 'Keyframes require unique indices within the requested duration' });
});
export const DESKTOP_SCHEMAS = {
    'text-to-video': desktopTextSchema, 'image-to-video': desktopImageSchema, 'audio-to-video': desktopAudioSchema,
    extend: desktopExtendSchema, retake: desktopRetakeSchema, keyframes: desktopKeyframesSchema,
};
/** Local filenames become private asset IDs; no serving-machine paths are sent. */
export function buildDesktopBody(operation, input, assets) {
    const args = DESKTOP_SCHEMAS[operation].parse(input);
    const { outputPath: _output, filename: _name, reserveUsd: _cost, imagePath, lastFramePath, audioPath, sourceVideoPath, allowAudioTruncation, targetResolution, keyframes, ...params } = args;
    const ref = (file) => {
        if (typeof file !== 'string' || !assets[file])
            throw new Error('Missing owned asset for input');
        return { assetId: assets[file] };
    };
    if (targetResolution)
        params.resolution = targetResolution;
    if (operation === 'keyframes')
        return { params: { ...params, model: 'fast' },
            keyframes: keyframes
                .map(({ imagePath: file, ...frame }) => ({ ...ref(file), ...frame })) };
    const inputs = operation === 'image-to-video' ? { startFrame: ref(imagePath), ...(lastFramePath ? { endFrame: ref(lastFramePath) } : {}) }
        : operation === 'audio-to-video' ? { audio: ref(audioPath), ...(imagePath ? { startFrame: ref(imagePath) } : {}) }
            : ['extend', 'retake'].includes(operation) ? { video: ref(sourceVideoPath) } : undefined;
    return { params, contract_version: 1, ...(inputs ? { inputs } : {}),
        ...(operation === 'audio-to-video' ? { allowAudioTruncation } : {}) };
}
function sourceFiles(args) {
    const files = ['imagePath', 'lastFramePath', 'audioPath', 'sourceVideoPath'].flatMap(k => typeof args[k] === 'string' ? [args[k]] : []);
    if (Array.isArray(args.keyframes))
        for (const frame of args.keyframes)
            files.push(frame.imagePath);
    return [...new Set(files)];
}
const receiptSchema = z.object({ protocol: z.literal('gateway-desktop-v1'), baseUrl: z.string(), operation: z.enum(['text-to-video', 'image-to-video', 'audio-to-video', 'extend', 'retake', 'keyframes']),
    fingerprint: z.string(), videoPath: z.string(), status: z.enum(['submitting', 'submitted', 'completed']), jobId: z.string().optional(), sha256: z.string().optional(),
}).strict();
export async function desktopVideoStatus(receiptPath, download = false) {
    const receipt = receiptSchema.parse(JSON.parse(fs.readFileSync(receiptPath, 'utf8')));
    if (receipt.baseUrl !== astraGenaiBaseUrl())
        throw new Error('Gateway origin changed; restore it before recovery');
    if (!receipt.jobId)
        throw new Error('Submission outcome unknown; inspect gateway generations/usage before retrying');
    if (receipt.status === 'completed') {
        if (createHash('sha256').update(fs.readFileSync(receipt.videoPath)).digest('hex') !== receipt.sha256)
            throw new Error('Cached video changed');
        return { jobId: receipt.jobId, status: 'completed', videoPath: receipt.videoPath, downloaded: true, review: 'not_reviewed' };
    }
    const job = z.object({ id: z.string(), status: z.string(), outputs: z.array(z.object({ url: z.string(), media_kind: z.string() })).default([]) })
        .passthrough().parse(await requestGenai('GET', `${ROOT}/generations/${encodeURIComponent(receipt.jobId)}`));
    if (job.id !== receipt.jobId)
        throw new Error('Job ID mismatch');
    if (['failed', 'cancelled'].includes(job.status))
        throw new Error(`Gateway video ${job.status}: ${job.id}`);
    if (job.status !== 'succeeded' || !download)
        return { jobId: job.id, status: job.status, downloaded: false, review: 'not_reviewed' };
    const video = job.outputs.filter(o => o.media_kind === 'video');
    if (video.length !== 1)
        throw new Error('Expected exactly one video output; retain receipt');
    const bytes = await requestGenaiMedia(video[0].url);
    const temp = receipt.videoPath + `.${process.pid}.download.mp4`;
    try {
        fs.writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 });
        const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', temp], { encoding: 'utf8', timeout: 30_000 }));
        if (!(probe.streams?.[0]?.width > 0) || !(Number(probe.format?.duration) > 0))
            throw new Error('Invalid video result');
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        if (fs.existsSync(receipt.videoPath)) {
            if (createHash('sha256').update(fs.readFileSync(receipt.videoPath)).digest('hex') !== sha256)
                throw new Error('Video output conflicts');
        }
        else
            fs.linkSync(temp, receipt.videoPath);
        atomicJson(receiptPath, { ...receipt, status: 'completed', sha256 });
    }
    finally {
        fs.rmSync(temp, { force: true });
    }
    return { jobId: job.id, status: 'completed', videoPath: receipt.videoPath, downloaded: true, review: 'not_reviewed' };
}
export async function generateDesktopVideo(operation, input) {
    const args = DESKTOP_SCHEMAS[operation].parse(input);
    requireAstraGenaiKey();
    const files = sourceFiles(args), hashes = {};
    for (const file of files) {
        const stat = fs.statSync(file);
        if (!stat.isFile() || stat.size === 0 || stat.size > 100 * 1024 * 1024)
            throw new Error('Input must be a nonempty file up to 100 MiB');
        hashes[file] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
    const fingerprint = createHash('sha256').update(JSON.stringify({ operation, args, hashes })).digest('hex');
    const videoPath = resolveOutputFile(String(args.outputPath || process.cwd()), String(args.filename || `desktop-${Date.now()}.mp4`), 'video');
    const receiptPath = videoPath + '.astra-genai.json';
    if (fs.existsSync(receiptPath)) {
        const old = receiptSchema.parse(JSON.parse(fs.readFileSync(receiptPath, 'utf8')));
        if (old.baseUrl !== astraGenaiBaseUrl() || old.fingerprint !== fingerprint || old.operation !== operation || old.videoPath !== videoPath)
            throw new Error('Receipt conflicts with request');
        if (!old.jobId)
            throw new Error('Submission outcome unknown; inspect gateway before retrying');
        recordVideoSubmission(old.jobId);
    }
    else {
        if (fs.existsSync(videoPath))
            throw new Error('Output exists');
        if (operation === 'keyframes') {
            const catalog = z.object({ data: z.array(z.object({ id: z.string() })), active_model: z.string().optional() }).passthrough()
                .parse(await requestGenai('GET', ROOT + '/models'));
            // Direct keyframes use the active pipeline, never silently another selected offering.
            if (catalog.active_model !== args.model)
                throw new Error('Keyframes require selected model to equal gateway active_model');
        }
        const assets = {};
        for (const file of files) {
            const bytes = fs.readFileSync(file);
            if (createHash('sha256').update(bytes).digest('hex') !== hashes[file])
                throw new Error('Input changed before upload');
            const form = new FormData();
            form.append('file', new Blob([new Uint8Array(bytes)]), path.basename(file));
            assets[file] = z.object({ id: z.string().min(1) }).parse(JSON.parse((await requestGenaiMedia(ROOT + '/assets', form)).toString())).id;
        }
        const body = buildDesktopBody(operation, args, assets);
        const receipt = { protocol: 'gateway-desktop-v1', baseUrl: astraGenaiBaseUrl(), operation, fingerprint, videoPath, status: 'submitting' };
        fs.writeFileSync(receiptPath, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
        const accepted = z.object({ id: z.string().min(1) }).passthrough().parse(await requestGenai('POST', operation === 'keyframes' ? ROOT + '/keyframes' : ROOT + '/generations/' + operation, body, 30 * 60_000));
        atomicJson(receiptPath, { ...receipt, jobId: accepted.id, status: 'submitted' });
        recordVideoSubmission(accepted.id);
    }
    const deadline = Date.now() + 30 * 60_000;
    do {
        const result = await desktopVideoStatus(receiptPath, true);
        if (result.downloaded)
            return { ...result, receiptPath };
        await sleep(5000);
    } while (Date.now() < deadline);
    throw new Error(`Still pending; recover ${receiptPath} without resubmission`);
}
