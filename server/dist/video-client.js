/**
 * Google Veo 3.1 video generation client — ported from the fect-mcp-server video module.
 *
 * Generates video via the Google Gen AI SDK.
 * - Models: veo-3.1-generate-preview (default) / veo-3.1-fast-generate-preview / veo-3.1-lite-generate-preview
 * - Supports Text-to-Video, Image-to-Video, Video Extension, Reference Images
 * - Resolution 720p/1080p/4k, duration 4/6/8s (constraints enforced by schema validation)
 * - Extension adds +7s per call · fixed 720p (3.1 / 3.1 Fast only)
 *
 * Generation is an async long-running operation — REST polling (10s interval, up
 * to 10 minutes) waits for completion, then the mp4 is saved locally and only the
 * path is returned (the original's four duplicated polling loops were folded into
 * a single awaitVideoAndSave helper — behavior identical).
 *
 * The API key is validated at call time, not at startup (config.requireGeminiKey).
 */
import * as fs from 'node:fs';
import { z } from 'zod';
import { requireGeminiKey } from './config.js';
import { ALLOWED_EXTENSIONS, bareFilenameSchema, mimeFromExtension, resolveOutputFile, validateFilePath, } from './media-utils.js';
// Supported Veo models (as of 2026-07 — the 3 active models callable via the Gemini API)
// The veo-3.0-* / veo-2.0-* families were shut down on 2026-06-30 and can no longer be called.
export const VALID_VIDEO_MODELS = [
    'veo-3.1-generate-preview', // top quality (default) — 720p $0.40/s
    'veo-3.1-fast-generate-preview', // low latency, low cost — 720p $0.10/s (4x cheaper than default)
    'veo-3.1-lite-generate-preview', // cheapest — 720p $0.05/s (8x cheaper). No 4K/Extension/Reference
];
/**
 * Default model — fast.
 *
 * The reason the standard tier isn't the default is not price but **quality
 * measurement**. In the Artificial Analysis blind arena, the Elo gap between the
 * three tiers is within 20 on all three boards and the confidence intervals
 * overlap (image-to-video 1,086 / 1,076 / 1,066 · text-to-video with audio
 * 1,091 / 1,090 / 1,088 · silent 1,200 / 1,199 / 1,207 — on the silent board
 * the order even flips and lite sits above standard, checked 2026-08-15). A
 * default that costs 4x without people preferring it is no default. The standard
 * tier stays selectable.
 */
export const DEFAULT_VIDEO_MODEL = 'veo-3.1-fast-generate-preview';
export const VALID_VIDEO_ASPECT_RATIOS = ['16:9', '9:16'];
export const VALID_VIDEO_RESOLUTIONS = ['720p', '1080p', '4k'];
const DEFAULT_DURATION_SECONDS = 8;
const EXTENSION_ADDED_SECONDS = 7; // length added per extension call (official docs)
const POLL_INTERVAL_MS = 10_000;
const MAX_POLLS = 60; // 10-minute max wait (10s * 60)
const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DurationSchema = z.union([z.literal(4), z.literal(6), z.literal(8)]).optional().default(8);
/**
 * Resolution × duration × model cross-constraint validation (per official docs)
 * - 1080p / 4k are 8s-only.
 * - 4k is not supported on lite.
 */
function validateResolutionConstraints(model, resolution, durationSeconds, ctx) {
    if ((resolution === '1080p' || resolution === '4k') && durationSeconds !== 8) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['durationSeconds'],
            message: `${resolution} resolution is only supported at 8s duration (requested: ${durationSeconds}s).`,
        });
    }
    if (resolution === '4k' && model === 'veo-3.1-lite-generate-preview') {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['resolution'],
            message: 'veo-3.1-lite-generate-preview does not support 4k (720p/1080p only).',
        });
    }
}
/** Shared validation for features (extension·reference) the lite model doesn't support */
function rejectLiteModel(feature, model, ctx) {
    if (model === 'veo-3.1-lite-generate-preview') {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['model'],
            message: `${feature} is not supported on veo-3.1-lite-generate-preview. Use veo-3.1-generate-preview or veo-3.1-fast-generate-preview.`,
        });
    }
}
/**
 * Exclusion-only field.
 *
 * The official docs pin the grammar — not instructions ("no walls" · "don't show
 * walls") but comma-separated noun/adjective phrases ("wall, frame"). Writing
 * "no ~" in the prompt body tends to draw that very noun (measured with local
 * image generation: 4 out of 4 failed), so every exclusion goes through this field.
 * Evidence: Vertex AI video-gen-prompt-guide · docs/research/2026-08-15-veo-seedance-prompting/
 */
const negativePromptSchema = z
    .string()
    .max(500)
    .optional()
    .describe('Comma-separated noun or adjective phrases to exclude (e.g. "wall, frame, text overlay"). ' +
    'Never use instructive language such as "no" or "don\'t" — the API docs reject that form.');
// Text-to-Video request schema
export const text2VideoSchema = z
    .object({
    prompt: z.string().min(1, 'Prompt is required'),
    negativePrompt: negativePromptSchema,
    model: z.enum(VALID_VIDEO_MODELS).optional().default(DEFAULT_VIDEO_MODEL),
    aspectRatio: z.enum(VALID_VIDEO_ASPECT_RATIOS).optional().default('16:9'),
    resolution: z.enum(VALID_VIDEO_RESOLUTIONS).optional().default('720p'),
    durationSeconds: DurationSchema,
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('video').optional(),
})
    .superRefine((data, ctx) => {
    validateResolutionConstraints(data.model, data.resolution, data.durationSeconds, ctx);
});
// Image-to-Video request schema
export const img2VideoSchema = z
    .object({
    prompt: z.string().min(1, 'Prompt is required'),
    negativePrompt: negativePromptSchema,
    sourceImagePath: z.string().min(1, 'Source image path is required'),
    lastImagePath: z.string().optional(),
    model: z.enum(VALID_VIDEO_MODELS).optional().default(DEFAULT_VIDEO_MODEL),
    aspectRatio: z.enum(VALID_VIDEO_ASPECT_RATIOS).optional().default('16:9'),
    resolution: z.enum(VALID_VIDEO_RESOLUTIONS).optional().default('720p'),
    durationSeconds: DurationSchema,
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('video').optional(),
})
    .superRefine((data, ctx) => {
    validateResolutionConstraints(data.model, data.resolution, data.durationSeconds, ctx);
});
// Video Extension request schema
// Constraints (official docs): 3.1 / 3.1 Fast only; the input video must be a Veo
// product · 720p · at most 141s; the result adds +7s. Resolution is fixed at 720p
// and the aspect ratio follows the input video.
export const videoExtensionSchema = z
    .object({
    prompt: z.string().min(1, 'Prompt is required'),
    negativePrompt: negativePromptSchema,
    sourceVideoPath: z.string().min(1, 'Source video path is required'),
    model: z.enum(VALID_VIDEO_MODELS).optional().default(DEFAULT_VIDEO_MODEL),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('video').optional(),
})
    .superRefine((data, ctx) => rejectLiteModel('video extension', data.model, ctx));
// Reference Image Video request schema
// Constraints (official docs): 3.1 / 3.1 Fast only, at most 3 reference images, duration fixed at 8s.
export const referenceVideoSchema = z
    .object({
    prompt: z.string().min(1, 'Prompt is required'),
    negativePrompt: negativePromptSchema,
    referenceImagePaths: z
        .array(z.string())
        .min(1, 'At least one reference image is required')
        .max(3, 'Maximum 3 reference images allowed'),
    model: z.enum(VALID_VIDEO_MODELS).optional().default(DEFAULT_VIDEO_MODEL),
    aspectRatio: z.enum(VALID_VIDEO_ASPECT_RATIOS).optional().default('16:9'),
    resolution: z.enum(VALID_VIDEO_RESOLUTIONS).optional().default('720p'),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('video').optional(),
})
    .superRefine((data, ctx) => {
    rejectLiteModel('reference images', data.model, ctx);
    // duration is fixed at 8s, so only the 4k case needs checking
    validateResolutionConstraints(data.model, data.resolution, 8, ctx);
});
/**
 * Query operation status via the REST API.
 * The key goes in the x-goog-api-key header, not the URL query (?key=) — URLs
 * can be echoed into logs and error messages, making them a leak surface, while
 * the header has no such path (same key-masking philosophy as the serp/datago
 * clients).
 */
async function getOperationStatus(apiKey, operationName) {
    const url = `${API_BASE_URL}/${operationName}`;
    const response = await fetch(url, { headers: { 'x-goog-api-key': apiKey } });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get operation status: ${response.status} - ${error}`);
    }
    return response.json();
}
/** Download the video file — key in the header only (same reason as getOperationStatus) */
async function downloadVideo(apiKey, videoUri) {
    const response = await fetch(videoUri, { headers: { 'x-goog-api-key': apiKey } });
    if (!response.ok) {
        throw new Error(`Failed to download video: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Poll the operation to completion → check RAI filtering → download the video → save locally.
 * Returns the saved absolute path on success, or an error message on failure.
 */
async function awaitVideoAndSave(apiKey, operationName, outputPath, filename, label) {
    let pollCount = 0;
    while (pollCount < MAX_POLLS) {
        console.error(`[Veo] ${label} in progress... (polling ${++pollCount}/${MAX_POLLS})`);
        await sleep(POLL_INTERVAL_MS);
        const status = await getOperationStatus(apiKey, operationName);
        if (status.error) {
            return { error: `Generation error: ${status.error.message || 'Unknown error'}` };
        }
        if (!status.done)
            continue;
        // check RAI filtering
        const raiReasons = status.response?.generateVideoResponse?.raiMediaFilteredReasons;
        if (raiReasons && raiReasons.length > 0) {
            const reason = raiReasons.join('; ');
            console.error(`[Veo] Content filtered: ${reason}`);
            return { error: `Content policy violation: ${reason}` };
        }
        // check the generated videos (both new and legacy shapes supported)
        const generatedVideos = status.response?.generateVideoResponse?.generatedSamples ?? status.response?.generatedVideos;
        if (!generatedVideos || generatedVideos.length === 0) {
            return { error: 'No video generated in response' };
        }
        const videoUri = generatedVideos[0].video?.uri;
        if (!videoUri) {
            return { error: 'No video URI in response' };
        }
        // Path validation (traversal·extension) + directory creation + download·save.
        // Validation happens before the download — rejecting after receiving tens of
        // MB wastes bandwidth.
        const fullPath = resolveOutputFile(outputPath, filename, 'video');
        const videoBuffer = await downloadVideo(apiKey, videoUri);
        fs.writeFileSync(fullPath, videoBuffer);
        console.error(`[Veo] Video saved to: ${fullPath}`);
        return { videoPath: fullPath };
    }
    return { error: 'Video generation timed out (10 minutes)' };
}
/** Read a local image file as a base64 inline image object. */
function readInlineImage(filePath) {
    const buffer = fs.readFileSync(filePath);
    return { imageBytes: buffer.toString('base64'), mimeType: mimeFromExtension(filePath, 'image') };
}
/** Read a local video file as a base64 inline video object. */
function readInlineVideo(filePath) {
    const buffer = fs.readFileSync(filePath);
    return { videoBytes: buffer.toString('base64'), mimeType: mimeFromExtension(filePath, 'video') };
}
// ── The 4 generation functions ───────────────────────────────────
/** Generate video from a text prompt */
export async function generateFromText(request) {
    const apiKey = requireGeminiKey();
    const model = request.model || DEFAULT_VIDEO_MODEL;
    const resolution = request.resolution || '720p';
    const durationSeconds = request.durationSeconds ?? DEFAULT_DURATION_SECONDS;
    try {
        const { GoogleGenAI } = await import('@google/genai');
        const genai = new GoogleGenAI({ apiKey });
        console.error(`[Veo] Starting text-to-video generation... (model: ${model})`);
        console.error(`[Veo] Prompt: ${request.prompt.substring(0, 100)}...`);
        const config = {
            aspectRatio: request.aspectRatio || '16:9',
            resolution,
            durationSeconds,
        };
        if (request.negativePrompt)
            config.negativePrompt = request.negativePrompt;
        const operation = await genai.models.generateVideos({ model, prompt: request.prompt, config });
        if (!operation.name)
            return { success: false, error: 'No operation name returned from API' };
        const saved = await awaitVideoAndSave(apiKey, operation.name, request.outputPath || process.cwd(), request.filename || `video_${Date.now()}.mp4`, 'Generation');
        if ('error' in saved)
            return { success: false, error: saved.error };
        return {
            success: true,
            videoPath: saved.videoPath,
            prompt: request.prompt,
            model,
            aspectRatio: request.aspectRatio || '16:9',
            resolution,
            duration: durationSeconds,
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Veo] Error: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}
/**
 * Generate video from an image
 * Uses the start image alone, or both start/end images for frame-interpolated video
 */
export async function generateFromImage(request) {
    const apiKey = requireGeminiKey();
    const model = request.model || DEFAULT_VIDEO_MODEL;
    const resolution = request.resolution || '720p';
    const durationSeconds = request.durationSeconds ?? DEFAULT_DURATION_SECONDS;
    try {
        // validate the source and last-frame image paths
        validateFilePath(request.sourceImagePath, { allowedExtensions: ALLOWED_EXTENSIONS.image });
        if (!fs.existsSync(request.sourceImagePath)) {
            return { success: false, error: `Source image not found: ${request.sourceImagePath}` };
        }
        if (request.lastImagePath) {
            validateFilePath(request.lastImagePath, { allowedExtensions: ALLOWED_EXTENSIONS.image });
            if (!fs.existsSync(request.lastImagePath)) {
                return { success: false, error: `Last frame image not found: ${request.lastImagePath}` };
            }
        }
        const { GoogleGenAI } = await import('@google/genai');
        const genai = new GoogleGenAI({ apiKey });
        console.error(`[Veo] Starting image-to-video generation... (model: ${model})`);
        console.error(`[Veo] First frame image: ${request.sourceImagePath}`);
        if (request.lastImagePath)
            console.error(`[Veo] Last frame image: ${request.lastImagePath}`);
        console.error(`[Veo] Prompt: ${request.prompt.substring(0, 100)}...`);
        const config = {
            aspectRatio: request.aspectRatio || '16:9',
            resolution,
            durationSeconds,
        };
        if (request.negativePrompt)
            config.negativePrompt = request.negativePrompt;
        // add lastFrame when an end image was provided
        if (request.lastImagePath) {
            config.lastFrame = readInlineImage(request.lastImagePath);
        }
        const operation = await genai.models.generateVideos({
            model,
            prompt: request.prompt,
            image: readInlineImage(request.sourceImagePath),
            config,
        });
        if (!operation.name)
            return { success: false, error: 'No operation name returned from API' };
        const saved = await awaitVideoAndSave(apiKey, operation.name, request.outputPath || process.cwd(), request.filename || `video_${Date.now()}.mp4`, 'Generation');
        if ('error' in saved)
            return { success: false, error: saved.error };
        return {
            success: true,
            videoPath: saved.videoPath,
            prompt: request.prompt,
            model,
            aspectRatio: request.aspectRatio || '16:9',
            resolution,
            duration: durationSeconds,
            sourceImage: request.sourceImagePath,
            lastImage: request.lastImagePath,
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Veo] Error: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}
/**
 * Video extension
 *
 * Official constraints: only Veo-generated videos at 720p and at most 141s can be
 * input, and the result adds +7s. The config passes only numberOfVideos +
 * resolution (fixed 720p), matching the official sample (durationSeconds /
 * aspectRatio aren't valid for extension — the ratio follows the input video).
 */
export async function extendVideo(request) {
    const apiKey = requireGeminiKey();
    const model = request.model || DEFAULT_VIDEO_MODEL;
    try {
        // validate the source video path
        validateFilePath(request.sourceVideoPath, { allowedExtensions: ALLOWED_EXTENSIONS.video });
        if (!fs.existsSync(request.sourceVideoPath)) {
            return { success: false, error: `Source video not found: ${request.sourceVideoPath}` };
        }
        const { GoogleGenAI } = await import('@google/genai');
        const genai = new GoogleGenAI({ apiKey });
        console.error(`[Veo] Starting video extension... (model: ${model})`);
        console.error(`[Veo] Source video: ${request.sourceVideoPath}`);
        console.error(`[Veo] Prompt: ${request.prompt.substring(0, 100)}...`);
        // video extension request (per the official sample: no durationSeconds / aspectRatio)
        const config = {
            numberOfVideos: 1,
            resolution: '720p',
        };
        if (request.negativePrompt)
            config.negativePrompt = request.negativePrompt;
        const operation = await genai.models.generateVideos({
            model,
            prompt: request.prompt,
            video: readInlineVideo(request.sourceVideoPath),
            config,
        });
        if (!operation.name)
            return { success: false, error: 'No operation name returned from API' };
        const saved = await awaitVideoAndSave(apiKey, operation.name, request.outputPath || process.cwd(), request.filename || `video_extended_${Date.now()}.mp4`, 'Extension');
        if ('error' in saved)
            return { success: false, error: saved.error };
        return {
            success: true,
            videoPath: saved.videoPath,
            prompt: request.prompt,
            model,
            resolution: '720p',
            duration: EXTENSION_ADDED_SECONDS, // the added length (+7s), not the total
            sourceVideo: request.sourceVideoPath,
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Veo] Error: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}
/**
 * Generate video using reference images
 * Keeps character/product consistency across the video with up to 3 reference images
 */
export async function generateWithReferences(request) {
    const apiKey = requireGeminiKey();
    const model = request.model || DEFAULT_VIDEO_MODEL;
    const resolution = request.resolution || '720p';
    try {
        // validate the reference image paths
        for (const imagePath of request.referenceImagePaths) {
            validateFilePath(imagePath, { allowedExtensions: ALLOWED_EXTENSIONS.image });
            if (!fs.existsSync(imagePath)) {
                return { success: false, error: `Reference image not found: ${imagePath}` };
            }
        }
        const { GoogleGenAI, VideoGenerationReferenceType } = await import('@google/genai');
        const genai = new GoogleGenAI({ apiKey });
        console.error(`[Veo] Starting video generation with reference images... (model: ${model})`);
        console.error(`[Veo] Reference images: ${request.referenceImagePaths.join(', ')}`);
        console.error(`[Veo] Prompt: ${request.prompt.substring(0, 100)}...`);
        const referenceImages = request.referenceImagePaths.map((imagePath) => ({
            image: readInlineImage(imagePath),
            // the SDK enum value is uppercase "ASSET" (lowercase 'asset' is an unofficial value relying on server leniency)
            referenceType: VideoGenerationReferenceType.ASSET,
        }));
        // video generation request (with reference images, durationSeconds is forced to 8s)
        const config = {
            aspectRatio: request.aspectRatio || '16:9',
            resolution,
            durationSeconds: DEFAULT_DURATION_SECONDS,
            referenceImages,
        };
        if (request.negativePrompt)
            config.negativePrompt = request.negativePrompt;
        const operation = await genai.models.generateVideos({ model, prompt: request.prompt, config });
        if (!operation.name)
            return { success: false, error: 'No operation name returned from API' };
        const saved = await awaitVideoAndSave(apiKey, operation.name, request.outputPath || process.cwd(), request.filename || `video_ref_${Date.now()}.mp4`, 'Generation');
        if ('error' in saved)
            return { success: false, error: saved.error };
        return {
            success: true,
            videoPath: saved.videoPath,
            prompt: request.prompt,
            model,
            aspectRatio: request.aspectRatio || '16:9',
            resolution,
            duration: DEFAULT_DURATION_SECONDS,
            referenceImages: request.referenceImagePaths,
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Veo] Error: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}
