import { GENAI_CAMERA_MOTIONS, GENAI_VIDEO_MODELS } from './astra-genai-video.js';
const output = {
    outputPath: { type: 'string', description: 'Local output directory; configured production keeps outputs inside its episode/workspace.' },
    filename: { type: 'string', description: 'Bare output filename (.mp4 for video, .png for image). Reuse its receipt after interruption; never overwrite existing media.' },
};
const video = {
    prompt: { type: 'string', minLength: 1, maxLength: 5000, description: 'Scene and action prompt, at most 5000 characters.' },
    model: { type: 'string', enum: [...GENAI_VIDEO_MODELS], description: 'Local gateway model. Cloud ltx-2-5-fast/pro models are not supported.' },
    duration: { type: ['integer', 'null'], description: 'Explicit provider duration in seconds, or null for provider handling. Deployment limits and null semantics are server-validated; no legacy frame rounding.' },
    resolution: { type: 'string', description: 'Explicit provider resolution string. Server validates supported dimensions; no legacy 64-pixel grid is imposed here.' },
    fps: { type: 'integer', enum: [24, 25, 48, 50], default: 24, description: 'Requested output frame rate.' },
    generateAudio: { type: 'boolean', default: true, description: 'Request generated audio. External speech conditioning is not supported by this gateway.' },
    cameraMotion: { type: ['string', 'null'], enum: [...GENAI_CAMERA_MOTIONS, null], description: 'Optional provider camera motion; not a local camera preset or free-form phrase.' },
    reserveUsd: { type: 'number', minimum: 0, description: 'Explicit total budget reservation; gateway prices are unverified. Use zero only when the deployment has no per-call bill. This is not a provider invoice cap.' },
    ...output,
};
const generation = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
export const GENAI_TOOLS = [
    { name: 'astra_genai_text2video', title: 'Generate GenAI LTX video from text',
        description: 'Generate and save an MP4 through the unified ASTRA GenAI LTX v2 gateway. Use video_plan/video_execute for configured episodes. Requires ASTRA_GENAI_API_KEY, a separate gk_ token from ASTRA_VIDEO. Persists job identity before polling; recover the same receipt after timeout. Supports text only, not supplied audio, LoRA, retake or keyframes. Legacy astra_text2video remains a separate server adapter.',
        inputSchema: { type: 'object', properties: video, required: ['prompt', 'model', 'duration', 'resolution', 'reserveUsd'], additionalProperties: false }, annotations: generation },
    { name: 'astra_genai_img2video', title: 'Generate GenAI LTX video from an image URI',
        description: 'Animate an image URI through ASTRA GenAI LTX v2 and save an MP4. Use video_plan/video_execute for configured episodes. Requires ASTRA_GENAI_API_KEY. Pass a server-supported image URI, never a local path or legacy upload ID; this adapter does not upload files. Supports optional last-frame URI, not intermediate keyframes or supplied speech. Unsupported provider options return errors without fallback.',
        inputSchema: { type: 'object', properties: { ...video,
                imageUri: { type: 'string', description: 'Provider-supported source image URI; gateway validates URI schemes and access. No local file upload is performed.' },
                lastFrameUri: { type: ['string', 'null'], description: 'Optional final-frame URI; gateway validates model support.' },
            }, required: ['prompt', 'model', 'duration', 'resolution', 'reserveUsd', 'imageUri'], additionalProperties: false }, annotations: generation },
    { name: 'astra_genai_text2img', title: 'Generate a GenAI DashScope image',
        description: 'Generate one PNG through the ASTRA GenAI DashScope route. Use image_plan/image_execute with an explicit reserveUsd for configured production. Requires ASTRA_GENAI_API_KEY. Text-only, at most 800 characters; no editing, references, masks, steps or quantization. Distinct from local image_local_generate. Saves the provider response before download; never retries an ambiguous generation automatically.',
        inputSchema: { type: 'object', properties: {
                model: { type: 'string', description: 'Deployed DashScope image model ID; provider names do not prove availability on this gateway.' },
                prompt: { type: 'string', minLength: 1, maxLength: 800, description: 'Single text prompt, at most 800 characters; never silently truncated.' },
                size: { type: 'string', default: '1024*1536', description: 'Provider size in WIDTH*HEIGHT notation; deployment validates supported sizes.' },
                seed: { type: ['integer', 'null'], minimum: 0, maximum: 2147483647, description: 'Optional provider random seed; null delegates to the provider.' },
                promptExtend: { type: 'boolean', default: false, description: 'Request provider prompt expansion; unsupported deployments may reject it.' },
                ...output,
            }, required: ['model', 'prompt'], additionalProperties: false }, annotations: generation },
    { name: 'astra_genai_video_status', title: 'Recover an existing GenAI video job',
        description: 'Read a local GenAI receipt and query its original LTX endpoint without submitting a new job. Optionally download a completed MP4. Requires the same configured gateway and token. For managed requests prefer video_status action:refresh, which also updates the managed reservation receipt. Does not recover legacy ASTRA jobs.',
        inputSchema: { type: 'object', properties: {
                receiptPath: { type: 'string', description: 'Local .astra-genai.json receipt written beside the video output.' },
                download: { type: 'boolean', default: false, description: 'Download and verify completed output; never starts generation.' },
            }, required: ['receiptPath'], additionalProperties: false },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true } },
];
