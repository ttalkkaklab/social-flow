/**
 * MLX Core / mlx-serve HTTP client.
 *
 * Talks to the local mlx-serve process that the MLX Core macOS menu-bar app
 * wraps (default http://127.0.0.1:11234). This is not Apple's mlx.core array
 * library, and it is not a second MCP server — skills call
 * mcp__social-flow__mlx_* and this module is the HTTP client inside this plugin.
 *
 * Never auto-launches the GUI. Connection refused fails closed with an install
 * hint. POST /v1/load-model never sends default:true — that would steal the
 * chat model the app is serving.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { mlxServeApiKey, mlxServeUrl } from './config.js';
import { requestBytes, requestRaw } from './http.js';
import { bareFilenameSchema, pcmToWav, resolveOutputFile, saveAudioFile, saveMediaFile } from './media-utils.js';
export const MLX_HEALTH_TIMEOUT_MS = 3_000;
export const MLX_MODELS_TIMEOUT_MS = 10_000;
export const MLX_LOAD_TIMEOUT_MS = 10 * 60_000;
export const MLX_IMAGE_TIMEOUT_MS = 15 * 60_000;
export const MLX_TTS_TIMEOUT_MS = 5 * 60_000;
export const MLX_MUSIC_TIMEOUT_MS = 10 * 60_000;
export const MLX_VIDEO_TIMEOUT_MS = 20 * 60_000;
export const MLX_MESH_TIMEOUT_MS = 15 * 60_000;
/** Node heap ceiling for decoded RGB — 1088×1920×8s at 24fps is ~1.2GB and is refused. */
export const MAX_VIDEO_RGB_BYTES = 800 * 1024 * 1024;
export const MLX_IMAGE_DIMENSION_STEP = 16;
export const MIN_MLX_IMAGE_DIMENSION = 256;
export const MAX_MLX_IMAGE_DIMENSION = 2048;
export const DEFAULT_MLX_IMAGE_SIZE = 1024;
export const MLX_VIDEO_DIMENSION_STEP = 64;
export const MIN_MLX_VIDEO_DIMENSION = 256;
export const MAX_MLX_VIDEO_DIMENSION = 1920;
export const DEFAULT_MLX_VIDEO_WIDTH = 768;
export const DEFAULT_MLX_VIDEO_HEIGHT = 1280;
export const DEFAULT_MLX_VIDEO_FRAMES = 49;
export const MIN_MLX_VIDEO_FRAMES = 9;
export const MAX_MLX_VIDEO_FRAMES = 241;
export const MLX_VIDEO_FPS = 24;
export const MIN_MLX_MUSIC_SECONDS = 10;
export const MAX_MLX_MUSIC_SECONDS = 600;
export const DEFAULT_MLX_MUSIC_SECONDS = 30;
export const MAX_MLX_TTS_CHARS = 8_000;
export const MAX_MLX_IMAGE_REFS = 3;
function authHeaders() {
    const key = mlxServeApiKey();
    return key ? { Authorization: `Bearer ${key}` } : {};
}
function isUnreachable(status, body) {
    return status === 502 || status === 504 || /ECONNREFUSED|fetch failed|Upstream unreachable/i.test(body);
}
/** Install/start hint — this plugin never launches the app. */
export function mlxDownHint(detail) {
    return (`MLX Core is not reachable at ${mlxServeUrl()}. This plugin does not launch the app.\n` +
        `Install the macOS menu-bar app (Apple Silicon, macOS 26.2+) and start it, or run mlx-serve --serve:\n` +
        `  brew install --cask mlx-core\n` +
        `If the server is on another host or port, set MLX_SERVE_URL.\n` +
        `Loopback needs no API key; a non-loopback bind may need MLX_SERVE_API_KEY.\n` +
        (detail ? `\n${detail}` : ''));
}
function translateUpstream(body) {
    if (/out of memory|OOM|not enough.*RAM|insufficient memory/i.test(body)) {
        return (`${body}\n\n` +
            `The loaded media model and the chat model share one GPU. Unload a large chat ` +
            `or video model in MLX Core, or stop a concurrent Z-Image (mflux) run — Z-Image ` +
            `peaks at 32–39GB and LTX wants 24GB+ on its own.`);
    }
    return body;
}
const imageDimension = z
    .number()
    .int()
    .min(MIN_MLX_IMAGE_DIMENSION)
    .max(MAX_MLX_IMAGE_DIMENSION)
    .refine((v) => v % MLX_IMAGE_DIMENSION_STEP === 0, {
    message: `width/height must be a multiple of ${MLX_IMAGE_DIMENSION_STEP} (for 9:16 that's 1088×1920, not 1080×1920). FLUX.2-klein is fixed at 1024×1024 — pick a Krea/Mage-Flow model for other sizes.`,
});
const videoDimension = z
    .number()
    .int()
    .min(MIN_MLX_VIDEO_DIMENSION)
    .max(MAX_MLX_VIDEO_DIMENSION)
    .refine((v) => v % MLX_VIDEO_DIMENSION_STEP === 0, {
    message: `width/height must be a multiple of ${MLX_VIDEO_DIMENSION_STEP} (two-stage LTX grid). 1080 is not on that grid — use 1088×1920 or the default 768×1280.`,
});
export const mlxImageGenerateSchema = z.object({
    prompt: z.string().min(1, 'Prompt is required').max(32_000),
    model: z.string().min(1).optional(),
    width: imageDimension.optional().default(DEFAULT_MLX_IMAGE_SIZE),
    height: imageDimension.optional().default(DEFAULT_MLX_IMAGE_SIZE),
    steps: z.number().int().min(1).max(50).optional(),
    seed: z.number().int().min(0).optional(),
    imagePath: z.string().min(1).optional(),
    strength: z.number().min(0).max(1).optional(),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('image').optional(),
});
export const mlxImageEditSchema = z.object({
    prompt: z.string().min(1, 'Prompt is required').max(32_000),
    imagePath: z.string().min(1, 'imagePath is required'),
    refImagePaths: z.array(z.string().min(1)).max(MAX_MLX_IMAGE_REFS).optional(),
    model: z.string().min(1).optional(),
    width: imageDimension.optional(),
    height: imageDimension.optional(),
    steps: z.number().int().min(1).max(50).optional(),
    seed: z.number().int().min(0).optional(),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('image').optional(),
});
export const mlxTtsGenerateSchema = z.object({
    input: z.string().min(1, 'input is required').max(MAX_MLX_TTS_CHARS),
    model: z.string().min(1).optional(),
    voice: z.string().min(1).optional(),
    refAudioPath: z.string().min(1).optional(),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('audio').optional(),
});
export const mlxMusicGenerateSchema = z
    .object({
    prompt: z.string().min(1, 'Prompt is required').max(4_000),
    model: z.string().min(1).optional(),
    lyrics: z.string().max(8_000).optional(),
    instrumental: z.boolean().optional().default(true),
    durationSeconds: z
        .number()
        .int()
        .min(MIN_MLX_MUSIC_SECONDS)
        .max(MAX_MLX_MUSIC_SECONDS)
        .optional()
        .default(DEFAULT_MLX_MUSIC_SECONDS),
    seed: z.number().int().min(0).optional(),
    refAudioPath: z.string().min(1).optional(),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('audio').optional(),
})
    .superRefine((value, ctx) => {
    if (value.instrumental && value.lyrics && value.lyrics.trim().length > 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'instrumental:true cannot be sent beside lyrics — mlx-serve returns 400. Set instrumental false to sing, or drop lyrics for a bed.',
        });
    }
});
export const mlxVideoGenerateSchema = z
    .object({
    prompt: z.string().min(1, 'Prompt is required').max(32_000),
    model: z.string().min(1).optional(),
    width: videoDimension.optional().default(DEFAULT_MLX_VIDEO_WIDTH),
    height: videoDimension.optional().default(DEFAULT_MLX_VIDEO_HEIGHT),
    numFrames: z
        .number()
        .int()
        .min(MIN_MLX_VIDEO_FRAMES)
        .max(MAX_MLX_VIDEO_FRAMES)
        .optional()
        .default(DEFAULT_MLX_VIDEO_FRAMES),
    steps: z.number().int().min(1).max(50).optional(),
    seed: z.number().int().min(0).optional(),
    firstFrameImagePath: z.string().min(1).optional(),
    lastFrameImagePath: z.string().min(1).optional(),
    pipeline: z.enum(['one_stage', 'two_stage']).optional(),
    decoder: z.enum(['conv', 'diffusion']).optional(),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('video').optional(),
})
    .superRefine((value, ctx) => {
    if (videoExceedsMemory(value.width, value.height, value.numFrames)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: videoMemoryMessage(value.width, value.height, value.numFrames),
        });
    }
});
export const mlx3dGenerateSchema = z.object({
    imagePath: z.string().min(1, 'imagePath is required'),
    model: z.string().min(1).optional(),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('mesh').optional(),
});
export function videoRgbBytes(width, height, frames) {
    return width * height * frames * 3;
}
export function videoExceedsMemory(width, height, frames) {
    return videoRgbBytes(width, height, frames) > MAX_VIDEO_RGB_BYTES;
}
export function videoMemoryMessage(width, height, frames) {
    const mb = (videoRgbBytes(width, height, frames) / (1024 * 1024)).toFixed(0);
    const cap = (MAX_VIDEO_RGB_BYTES / (1024 * 1024)).toFixed(0);
    return (`Decoded RGB would be ~${mb}MB (${width}×${height}×${frames}×3), over the ${cap}MB cap. ` +
        `Drop frames or canvas — 1088×1920 at 8s/24fps is ~1.2GB and is refused. ` +
        `The default 768×1280×${DEFAULT_MLX_VIDEO_FRAMES} stays under the cap.`);
}
export function pickModel(models, capability) {
    const has = (m) => (m.capabilities ?? []).includes(capability);
    return models.find((m) => m.state === 'ready' && has(m)) ?? models.find(has);
}
function fileToBase64(filePath) {
    if (!existsSync(filePath))
        return { ok: false, error: `File not found: ${filePath}` };
    try {
        return { ok: true, b64: readFileSync(filePath).toString('base64') };
    }
    catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}
function parseModelsBody(body) {
    const parsed = JSON.parse(body);
    const list = parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed;
    if (!Array.isArray(list))
        return [];
    return list
        .filter((entry) => Boolean(entry) && typeof entry === 'object')
        .map((entry) => ({
        id: String(entry.id ?? entry.name ?? ''),
        state: typeof entry.state === 'string' ? entry.state : undefined,
        capabilities: Array.isArray(entry.capabilities) ? entry.capabilities.map(String) : undefined,
    }))
        .filter((entry) => entry.id.length > 0);
}
export async function mlxHealth() {
    const res = await requestRaw('get', `${mlxServeUrl()}/health`, authHeaders(), undefined, MLX_HEALTH_TIMEOUT_MS);
    if (res.ok)
        return { ok: true };
    if (isUnreachable(res.status, res.body))
        return { ok: false, error: mlxDownHint(res.body) };
    return { ok: false, error: mlxDownHint(`HTTP ${res.status}: ${res.body}`) };
}
export async function listMlxModels() {
    const res = await requestRaw('get', `${mlxServeUrl()}/v1/models`, authHeaders(), undefined, MLX_MODELS_TIMEOUT_MS);
    if (!res.ok) {
        if (isUnreachable(res.status, res.body))
            return { ok: false, error: mlxDownHint(res.body) };
        return { ok: false, error: translateUpstream(`HTTP ${res.status}: ${res.body}`) };
    }
    try {
        return { ok: true, models: parseModelsBody(res.body) };
    }
    catch (error) {
        return { ok: false, error: `Could not parse /v1/models: ${error instanceof Error ? error.message : String(error)}` };
    }
}
async function loadModel(id) {
    // Never send default:true — that steals the chat model the app is serving.
    const res = await requestRaw('post', `${mlxServeUrl()}/v1/load-model`, authHeaders(), { model: id }, MLX_LOAD_TIMEOUT_MS);
    if (!res.ok) {
        if (isUnreachable(res.status, res.body))
            return { ok: false, error: mlxDownHint(res.body) };
        return { ok: false, error: translateUpstream(`load-model HTTP ${res.status}: ${res.body}`) };
    }
    const deadline = Date.now() + MLX_LOAD_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const listed = await listMlxModels();
        if (!listed.ok)
            return listed;
        const found = listed.models?.find((m) => m.id === id);
        if (found?.state === 'ready')
            return { ok: true };
        await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    return { ok: false, error: `Timed out waiting for model "${id}" to become ready.` };
}
async function resolveModel(capability, requested) {
    const listed = await listMlxModels();
    if (!listed.ok)
        return { ok: false, error: listed.error ?? mlxDownHint() };
    const models = listed.models ?? [];
    if (requested) {
        const found = models.find((m) => m.id === requested);
        if (!found) {
            const loaded = await loadModel(requested);
            if (!loaded.ok) {
                return {
                    ok: false,
                    error: loaded.error ??
                        `Model "${requested}" is not in /v1/models. Download it in MLX Core and retry, or pass an id from GET /v1/models.`,
                };
            }
            return { ok: true, model: requested };
        }
        if (found.state !== 'ready') {
            const loaded = await loadModel(requested);
            if (!loaded.ok)
                return { ok: false, error: loaded.error ?? `Failed to load "${requested}".` };
        }
        return { ok: true, model: requested };
    }
    const picked = pickModel(models, capability);
    if (!picked) {
        return {
            ok: false,
            error: `No mlx-serve model advertises capability "${capability}". ` +
                `Open MLX Core, download a model in the matching pane (Image / Audio / Video / 3D), and retry. ` +
                `This plugin does not download weights.`,
        };
    }
    if (picked.state !== 'ready') {
        const loaded = await loadModel(picked.id);
        if (!loaded.ok)
            return { ok: false, error: loaded.error ?? `Failed to load "${picked.id}".` };
    }
    return { ok: true, model: picked.id };
}
export function parseImageResponse(body) {
    try {
        const parsed = JSON.parse(body);
        const data = parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : undefined;
        const first = Array.isArray(data) ? data[0] : undefined;
        const b64 = first && typeof first === 'object' && first !== null && 'b64_json' in first
            ? first.b64_json
            : undefined;
        if (typeof b64 !== 'string' || b64.length === 0)
            return { error: `Image response missing data[0].b64_json: ${body.slice(0, 400)}` };
        return { b64 };
    }
    catch (error) {
        return { error: `Could not parse image JSON: ${error instanceof Error ? error.message : String(error)}` };
    }
}
export function parseVideoResponse(body) {
    try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== 'object')
            return { error: 'Video response is not an object' };
        const d = parsed;
        if (d.format !== 'rgb8')
            return { error: `Unexpected video format "${String(d.format)}" (want rgb8)` };
        const frames = Number(d.frames);
        const height = Number(d.height);
        const width = Number(d.width);
        const fps = Number(d.fps) || MLX_VIDEO_FPS;
        if (![frames, height, width].every((n) => Number.isFinite(n) && n > 0)) {
            return { error: `Video response missing frames/height/width: ${body.slice(0, 200)}` };
        }
        if (typeof d.data !== 'string')
            return { error: 'Video response missing data (base64 rgb8)' };
        const rgb = Buffer.from(d.data, 'base64');
        const expect = frames * height * width * 3;
        if (rgb.length !== expect)
            return { error: `RGB length ${rgb.length} != ${expect} (${frames}×${height}×${width}×3)` };
        let audio;
        if (typeof d.audio_data === 'string' && d.audio_data.length > 0) {
            audio = {
                pcm: Buffer.from(d.audio_data, 'base64'),
                sampleRate: Number(d.audio_sample_rate) || 24_000,
                channels: Number(d.audio_channels) || 2,
            };
        }
        return { format: 'rgb8', frames, height, width, fps, rgb, audio };
    }
    catch (error) {
        return { error: `Could not parse video JSON: ${error instanceof Error ? error.message : String(error)}` };
    }
}
export function parseGlbResponse(body) {
    try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== 'object')
            return { error: '3D response is not an object' };
        const d = parsed;
        if (typeof d.data !== 'string' || d.data.length === 0)
            return { error: `3D response missing data: ${body.slice(0, 400)}` };
        return { b64: d.data };
    }
    catch (error) {
        return { error: `Could not parse 3D JSON: ${error instanceof Error ? error.message : String(error)}` };
    }
}
async function muxRgbToMp4(opts) {
    const dir = mkdtempSync(join(tmpdir(), 'mlx-video-'));
    const rgbPath = join(dir, 'frames.rgb');
    const wavPath = join(dir, 'audio.wav');
    try {
        writeFileSync(rgbPath, opts.rgb);
        const args = [
            '-y',
            '-f', 'rawvideo',
            '-pix_fmt', 'rgb24',
            '-s', `${opts.width}x${opts.height}`,
            '-r', String(opts.fps),
            '-i', rgbPath,
        ];
        if (opts.audio) {
            writeFileSync(wavPath, pcmToWav(opts.audio.pcm, opts.audio.sampleRate, opts.audio.channels));
            args.push('-i', wavPath);
        }
        args.push('-frames:v', String(opts.frames), '-c:v', 'libx264', '-pix_fmt', 'yuv420p');
        if (opts.audio)
            args.push('-c:a', 'aac', '-shortest');
        args.push(opts.outFile);
        await new Promise((resolve, reject) => {
            execFile('ffmpeg', args, { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 }, (error, _out, errOut) => {
                if (error) {
                    const code = error.code;
                    if (code === 'ENOENT') {
                        reject(new Error('ffmpeg is not on PATH — mlx_video_generate muxes rgb8 frames to mp4 and needs ffmpeg.'));
                        return;
                    }
                    reject(new Error(`${error.message}${errOut ? `\n${String(errOut).slice(-500)}` : ''}`));
                    return;
                }
                resolve();
            });
        });
        if (!existsSync(opts.outFile))
            return { ok: false, error: 'ffmpeg exited 0 but the mp4 was not written' };
        return { ok: true };
    }
    catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
}
async function postImage(body, outFile) {
    const startedAt = Date.now();
    const res = await requestRaw('post', `${mlxServeUrl()}/v1/images/generations`, authHeaders(), body, MLX_IMAGE_TIMEOUT_MS);
    if (!res.ok) {
        if (isUnreachable(res.status, res.body))
            return { success: false, error: mlxDownHint(res.body) };
        return { success: false, error: translateUpstream(`HTTP ${res.status}: ${res.body}`) };
    }
    const parsed = parseImageResponse(res.body);
    if ('error' in parsed)
        return { success: false, error: parsed.error };
    writeFileSync(outFile, Buffer.from(parsed.b64, 'base64'));
    return {
        success: true,
        path: outFile,
        model: typeof body.model === 'string' ? body.model : undefined,
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    };
}
export async function generateMlxImage(request) {
    const health = await mlxHealth();
    if (!health.ok)
        return { success: false, error: health.error };
    const resolved = await resolveModel('image', request.model);
    if (!resolved.ok)
        return { success: false, error: resolved.error };
    const body = {
        prompt: request.prompt,
        model: resolved.model,
        size: `${request.width}x${request.height}`,
    };
    if (request.steps !== undefined)
        body.steps = request.steps;
    if (request.seed !== undefined)
        body.seed = request.seed;
    if (request.imagePath) {
        const img = fileToBase64(request.imagePath);
        if (!img.ok)
            return { success: false, error: img.error };
        body.image = img.b64;
        if (request.strength !== undefined)
            body.strength = request.strength;
    }
    const outFile = resolveOutputFile(request.outputPath || process.cwd(), request.filename || `mlx_image_${Date.now()}.png`, 'image');
    const result = await postImage(body, outFile);
    if (result.success) {
        result.width = request.width;
        result.height = request.height;
        result.steps = request.steps;
        result.seed = request.seed;
        result.model = resolved.model;
    }
    return result;
}
export async function editMlxImage(request) {
    const health = await mlxHealth();
    if (!health.ok)
        return { success: false, error: health.error };
    const resolved = await resolveModel('image', request.model);
    if (!resolved.ok)
        return { success: false, error: resolved.error };
    const src = fileToBase64(request.imagePath);
    if (!src.ok)
        return { success: false, error: src.error };
    const refs = [];
    for (const path of request.refImagePaths ?? []) {
        const ref = fileToBase64(path);
        if (!ref.ok)
            return { success: false, error: ref.error };
        refs.push(ref.b64);
    }
    const body = {
        prompt: request.prompt,
        model: resolved.model,
        mode: 'edit',
        image: src.b64,
    };
    if (request.width && request.height)
        body.size = `${request.width}x${request.height}`;
    if (request.steps !== undefined)
        body.steps = request.steps;
    if (request.seed !== undefined)
        body.seed = request.seed;
    if (refs.length)
        body.ref_images = refs;
    const outFile = resolveOutputFile(request.outputPath || process.cwd(), request.filename || `mlx_edit_${Date.now()}.png`, 'image');
    const result = await postImage(body, outFile);
    if (result.success) {
        result.model = resolved.model;
        result.width = request.width;
        result.height = request.height;
        result.steps = request.steps;
        result.seed = request.seed;
    }
    return result;
}
function wavLooksValid(buf) {
    return buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WAVE';
}
function jsonErrorFromBytes(bytes, contentType, status) {
    const asText = bytes.toString('utf8');
    if (contentType.includes('json') || asText.trimStart().startsWith('{')) {
        return translateUpstream(`HTTP ${status}: ${asText.slice(0, 1_000)}`);
    }
    if (!bytes.length)
        return `HTTP ${status}: empty body`;
    return undefined;
}
export async function generateMlxTts(request) {
    const health = await mlxHealth();
    if (!health.ok)
        return { success: false, error: health.error };
    const resolved = await resolveModel('audio', request.model);
    if (!resolved.ok)
        return { success: false, error: resolved.error };
    const body = { input: request.input, model: resolved.model };
    if (request.voice)
        body.voice = request.voice;
    if (request.refAudioPath) {
        const clip = fileToBase64(request.refAudioPath);
        if (!clip.ok)
            return { success: false, error: clip.error };
        body.ref_audio = clip.b64;
    }
    const startedAt = Date.now();
    const res = await requestBytes('post', `${mlxServeUrl()}/v1/audio/speech`, authHeaders(), body, MLX_TTS_TIMEOUT_MS);
    if (!res.ok) {
        const text = res.bytes.toString('utf8');
        if (isUnreachable(res.status, text))
            return { success: false, error: mlxDownHint(text) };
        return { success: false, error: translateUpstream(`HTTP ${res.status}: ${text.slice(0, 1_000)}`) };
    }
    const jsonErr = jsonErrorFromBytes(res.bytes, res.contentType, res.status);
    if (jsonErr)
        return { success: false, error: jsonErr };
    if (!wavLooksValid(res.bytes)) {
        return { success: false, error: `TTS response is not a WAV (got ${res.contentType || 'unknown type'}, ${res.bytes.length} bytes)` };
    }
    const outFile = saveAudioFile(request.outputPath || process.cwd(), request.filename || `mlx_tts_${Date.now()}.wav`, res.bytes);
    return {
        success: true,
        path: outFile,
        model: resolved.model,
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    };
}
export async function generateMlxMusic(request) {
    const health = await mlxHealth();
    if (!health.ok)
        return { success: false, error: health.error };
    const resolved = await resolveModel('music', request.model);
    if (!resolved.ok)
        return { success: false, error: resolved.error };
    const body = {
        prompt: request.prompt,
        model: resolved.model,
        instrumental: request.instrumental,
        duration_seconds: request.durationSeconds,
    };
    if (request.lyrics !== undefined)
        body.lyrics = request.lyrics;
    if (request.seed !== undefined)
        body.seed = request.seed;
    if (request.refAudioPath) {
        const clip = fileToBase64(request.refAudioPath);
        if (!clip.ok)
            return { success: false, error: clip.error };
        body.ref_audio = clip.b64;
    }
    const startedAt = Date.now();
    const res = await requestBytes('post', `${mlxServeUrl()}/v1/audio/music-generations`, authHeaders(), body, MLX_MUSIC_TIMEOUT_MS);
    if (!res.ok) {
        const text = res.bytes.toString('utf8');
        if (isUnreachable(res.status, text))
            return { success: false, error: mlxDownHint(text) };
        return { success: false, error: translateUpstream(`HTTP ${res.status}: ${text.slice(0, 1_000)}`) };
    }
    const jsonErr = jsonErrorFromBytes(res.bytes, res.contentType, res.status);
    if (jsonErr)
        return { success: false, error: jsonErr };
    if (!wavLooksValid(res.bytes)) {
        return { success: false, error: `Music response is not a WAV (got ${res.contentType || 'unknown type'}, ${res.bytes.length} bytes)` };
    }
    const outFile = saveAudioFile(request.outputPath || process.cwd(), request.filename || `mlx_music_${Date.now()}.wav`, res.bytes);
    return {
        success: true,
        path: outFile,
        model: resolved.model,
        durationSeconds: request.durationSeconds,
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    };
}
export async function generateMlxVideo(request) {
    const health = await mlxHealth();
    if (!health.ok)
        return { success: false, error: health.error };
    if (videoExceedsMemory(request.width, request.height, request.numFrames)) {
        return { success: false, error: videoMemoryMessage(request.width, request.height, request.numFrames) };
    }
    const resolved = await resolveModel('video', request.model);
    if (!resolved.ok)
        return { success: false, error: resolved.error };
    const body = {
        prompt: request.prompt,
        model: resolved.model,
        width: request.width,
        height: request.height,
        num_frames: request.numFrames,
    };
    if (request.steps !== undefined)
        body.steps = request.steps;
    if (request.seed !== undefined)
        body.seed = request.seed;
    if (request.pipeline)
        body.pipeline = request.pipeline;
    if (request.decoder)
        body.decoder = request.decoder;
    if (request.firstFrameImagePath) {
        const img = fileToBase64(request.firstFrameImagePath);
        if (!img.ok)
            return { success: false, error: img.error };
        body.first_frame_image = img.b64;
    }
    if (request.lastFrameImagePath) {
        const img = fileToBase64(request.lastFrameImagePath);
        if (!img.ok)
            return { success: false, error: img.error };
        body.last_frame_image = img.b64;
    }
    const startedAt = Date.now();
    const res = await requestRaw('post', `${mlxServeUrl()}/v1/video/generations`, authHeaders(), body, MLX_VIDEO_TIMEOUT_MS);
    if (!res.ok) {
        if (isUnreachable(res.status, res.body))
            return { success: false, error: mlxDownHint(res.body) };
        return { success: false, error: translateUpstream(`HTTP ${res.status}: ${res.body}`) };
    }
    const parsed = parseVideoResponse(res.body);
    if ('error' in parsed)
        return { success: false, error: parsed.error };
    const outFile = resolveOutputFile(request.outputPath || process.cwd(), request.filename || `mlx_video_${Date.now()}.mp4`, 'video');
    const muxed = await muxRgbToMp4({
        rgb: parsed.rgb,
        width: parsed.width,
        height: parsed.height,
        frames: parsed.frames,
        fps: parsed.fps,
        audio: parsed.audio,
        outFile,
    });
    if (!muxed.ok)
        return { success: false, error: muxed.error };
    return {
        success: true,
        path: outFile,
        model: resolved.model,
        width: parsed.width,
        height: parsed.height,
        frames: parsed.frames,
        fps: parsed.fps,
        hasAudio: Boolean(parsed.audio),
        durationSeconds: parsed.frames / parsed.fps,
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    };
}
export async function generateMlx3d(request) {
    const health = await mlxHealth();
    if (!health.ok)
        return { success: false, error: health.error };
    const resolved = await resolveModel('3d', request.model);
    if (!resolved.ok)
        return { success: false, error: resolved.error };
    const img = fileToBase64(request.imagePath);
    if (!img.ok)
        return { success: false, error: img.error };
    const startedAt = Date.now();
    const res = await requestRaw('post', `${mlxServeUrl()}/v1/3d/generations`, authHeaders(), { image: img.b64, model: resolved.model }, MLX_MESH_TIMEOUT_MS);
    if (!res.ok) {
        if (isUnreachable(res.status, res.body))
            return { success: false, error: mlxDownHint(res.body) };
        return { success: false, error: translateUpstream(`HTTP ${res.status}: ${res.body}`) };
    }
    const parsed = parseGlbResponse(res.body);
    if ('error' in parsed)
        return { success: false, error: parsed.error };
    const outFile = saveMediaFile(request.outputPath || process.cwd(), request.filename || `mlx_3d_${Date.now()}.glb`, Buffer.from(parsed.b64, 'base64'), 'mesh');
    return {
        success: true,
        path: outFile,
        model: resolved.model,
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    };
}
