/**
 * MiniMax H3 on the MiniMax Open Platform (1eabc4fb:docs/research/2026-11-18-video-model-api-schemas/minimax-h3.md).
 * One endpoint, POST /v2/video_generation; content[].role picks the mode. First/last frames and
 * references cannot share a request, so a spoken shot's start image rides as the last reference
 * picture and the first frame is not pinned.
 */
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { config } from './config.js';
import { bareFilenameSchema } from './media-utils.js';
import { dataUri, runVendorJob, vendorJson } from './vendor-video.js';
export const MINIMAX_BASE_URL = 'https://api.minimax.io';
export const MINIMAX_MODELS = {
    'MiniMax-H3': { resolutions: ['768P', '2K'], minSeconds: 4, freeImages: 5 },
    'MiniMax-H3-Highspeed': { resolutions: ['480P', '768P'], minSeconds: 4, freeImages: 5 },
    'MiniMax-H3-Lite': { resolutions: ['480P', '768P'], minSeconds: 4, freeImages: 5 },
    'MiniMax-H3-Max': { resolutions: ['480P', '768P'], minSeconds: 5, freeImages: 2 },
};
export const MINIMAX_MAX_SECONDS = 15;
export const MINIMAX_RATIOS = ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp'], AUDIO_EXT = ['.wav', '.mp3'];
const common = {
    prompt: z.string().min(1).max(7000).describe('English scene, action and sound; quoted dialogue in the video\'s language.'),
    model: z.enum(Object.keys(MINIMAX_MODELS)).default('MiniMax-H3').describe('MiniMax H3 model id, e.g. MiniMax-H3.'),
    resolution: z.enum(['480P', '768P', '2K']).default('768P').describe('Output resolution; 2K only on MiniMax-H3.'),
    durationSeconds: z.number().int().min(4).max(MINIMAX_MAX_SECONDS).default(5).describe('Whole seconds, 4–15 (MiniMax-H3-Max 5–15).'),
    generateAudio: z.boolean().optional().describe('Native soundtrack; false renders a silent clip. Omitted: the vendor default, on.'),
    outputPath: z.string().optional().describe('Output directory.'),
    filename: bareFilenameSchema('video').optional().describe('MP4 filename.'),
};
function checkModel(v, ctx) {
    const spec = MINIMAX_MODELS[v.model];
    if (!spec.resolutions.includes(v.resolution))
        ctx.addIssue({ code: 'custom', path: ['resolution'], message: `${v.model} renders ${spec.resolutions.join(' or ')}` });
    if (v.durationSeconds < spec.minSeconds)
        ctx.addIssue({ code: 'custom', path: ['durationSeconds'], message: `${v.model} needs at least ${spec.minSeconds} seconds` });
}
export const minimaxImg2VideoSchema = z.object({ ...common,
    sourceImagePath: z.string().min(1).describe('First frame image (PNG/JPEG/WEBP).'),
    lastImagePath: z.string().min(1).optional().describe('Optional last frame image.'),
}).strict().superRefine(checkModel);
export const minimaxReferenceSchema = z.object({ ...common,
    ratio: z.enum(MINIMAX_RATIOS).default('adaptive').describe('Output ratio; MiniMax-H3-Lite needs a concrete ratio.'),
    referenceImagePaths: z.array(z.string().min(1)).min(1).max(9).describe('Reference pictures, numbered "reference image N" in the prompt.'),
    referenceAudioPaths: z.array(z.string().min(1)).max(3).default([]).describe('Voice samples (WAV/MP3, 2–15 s each, 15 s total), "reference audio N" in the prompt.'),
}).strict().superRefine((v, ctx) => {
    checkModel(v, ctx);
    if (v.model === 'MiniMax-H3-Lite' && v.ratio === 'adaptive')
        ctx.addIssue({ code: 'custom', path: ['ratio'], message: 'MiniMax-H3-Lite needs a concrete ratio' });
});
function audioSeconds(file) {
    const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', timeout: 15_000 }));
    if (!Number.isFinite(seconds))
        throw new Error('Cannot read the length of ' + file);
    return seconds;
}
/** The wire body. Planning calls it too, so size and length problems surface before money is reserved. */
export function buildMinimaxBody(request) {
    const image = (file, role) => ({ type: 'image_url', image_url: { url: dataUri(file, IMAGE_EXT, 30 * 1048576) }, role });
    let content;
    if ('sourceImagePath' in request) {
        content = [image(request.sourceImagePath, 'first_frame'), ...(request.lastImagePath ? [image(request.lastImagePath, 'last_frame')] : [])];
    }
    else {
        let total = 0;
        for (const file of request.referenceAudioPaths) {
            const seconds = audioSeconds(file);
            total += seconds;
            if (seconds < 2 || seconds > 15)
                throw new Error(`MiniMax voice samples run 2–15 s; ${file} runs ${seconds.toFixed(1)} s`);
        }
        if (total > 15)
            throw new Error(`MiniMax voice samples total at most 15 s; these run ${total.toFixed(1)} s`);
        content = [...request.referenceImagePaths.map(file => image(file, 'reference_image')),
            ...request.referenceAudioPaths.map(file => ({ type: 'audio_url', audio_url: { url: dataUri(file, AUDIO_EXT, 15 * 1048576) }, role: 'reference_audio' }))];
    }
    const body = { model: request.model, content: [{ type: 'text', text: request.prompt }, ...content],
        resolution: request.resolution, duration: request.durationSeconds,
        ...(request.generateAudio === undefined ? {} : { generate_audio: request.generateAudio }),
        ...('ratio' in request ? { ratio: request.ratio } : {}),
        // Max rewrites prompts by default; the compiled speaker bindings must reach the model as written.
        ...(request.model === 'MiniMax-H3-Max' ? { extra: { prompt_expansion_mode: 'disabled' } } : {}) };
    if (JSON.stringify(body).length > 64 * 1048576)
        throw new Error('MiniMax request body exceeds 64 MB; use fewer or smaller references');
    return body;
}
export function minimaxStatus(json) {
    const task = (json.task ?? json);
    if (task.status === 'succeeded') {
        if (!task.content?.url)
            return { state: 'failed', error: 'succeeded without content.url' };
        return { state: 'done', url: task.content.url, meta: { duration: task.duration, resolution: task.resolution, usage: task.usage } };
    }
    if (task.status === 'failed' || task.status === 'cancelled')
        return { state: 'failed', error: task.error?.message ?? task.status };
    return { state: 'running' };
}
export async function generateMinimaxVideo(request) {
    if (!config.minimaxApiKey)
        return { success: false, error: 'MINIMAX_API_KEY is not set', terminal: true };
    const headers = { Authorization: `Bearer ${config.minimaxApiKey}`, 'Content-Type': 'application/json' };
    let body;
    // Nothing was sent yet, so a local input problem closes the request without a charge.
    try {
        body = buildMinimaxBody(request);
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error), terminal: true };
    }
    return runVendorJob({
        vendor: 'MiniMax', outputPath: request.outputPath ?? process.cwd(), filename: request.filename ?? `minimax-${Date.now()}.mp4`,
        submit: async () => {
            const json = await vendorJson(`${MINIMAX_BASE_URL}/v2/video_generation`, { method: 'POST', headers, body: JSON.stringify(body), timeoutMs: 5 * 60_000 });
            if (typeof json.task_id !== 'string' || !json.task_id)
                throw new Error('No task_id in MiniMax response');
            return json.task_id;
        },
        poll: async (id) => minimaxStatus(await vendorJson(`${MINIMAX_BASE_URL}/v2/query/video_generation/${encodeURIComponent(id)}`, { headers })),
    });
}
