import { LOCAL_VIDEO_MODELS, localVideoStrategy } from './local-video-models.js';
import { z } from 'zod';
import * as veo from './video-client.js';
import * as seedance from './seedance-client.js';
import * as astra from './astra-video-client.js';
import { GENAI_VIDEO_MODELS, genaiTextToVideoSchema, genaiImageToVideoSchema, genaiAudioToVideoSchema, genaiMsrSchema } from './astra-genai-video.js';
import * as omni from './omni-client.js';
import * as mlx from './mlx-serve-client.js';
import { resolveVideoDuration } from './video-duration.js';
const entry = (engine, deployment, operation, schema) => ({ engine, deployment, operation, schema });
/** Schemas and model constraints remain owned by adapters, never copied into a second validator. */
export const VIDEO_ADAPTERS = Object.freeze({
    veo_text2video: entry('veo', 'gemini-api', 'text', veo.text2VideoSchema),
    veo_img2video: entry('veo', 'gemini-api', 'image', veo.img2VideoSchema),
    veo_reference: entry('veo', 'gemini-api', 'reference', veo.referenceVideoSchema),
    veo_extension: entry('veo', 'gemini-api', 'extend', veo.videoExtensionSchema),
    seedance_text2video: entry('seedance', 'byteplus', 'text', seedance.seedanceText2VideoSchema),
    seedance_img2video: entry('seedance', 'byteplus', 'image', seedance.seedanceImg2VideoSchema),
    seedance_reference: entry('seedance', 'byteplus', 'reference', seedance.seedanceReferenceSchema),
    astra_genai_text2video: entry('astra-genai', 'genai-ltx-v2', 'text', genaiTextToVideoSchema),
    astra_genai_img2video: entry('astra-genai', 'genai-ltx-v2', 'image', genaiImageToVideoSchema),
    astra_genai_audio2video: entry('astra-genai', 'genai-ltx-v2', 'audio', genaiAudioToVideoSchema),
    astra_genai_msr: entry('astra-genai', 'genai-ltx-msr', 'reference', genaiMsrSchema),
    astra_text2video: entry('astra', 'self-hosted-ltx', 'text', astra.astraText2VideoSchema),
    astra_img2video: entry('astra', 'self-hosted-ltx', 'image', astra.astraImg2VideoSchema),
    astra_keyframe_video: entry('astra', 'self-hosted-ltx', 'keyframe', astra.astraKeyframeVideoSchema),
    astra_audio2video: entry('astra', 'self-hosted-ltx', 'audio', astra.astraAudio2VideoSchema),
    astra_ic_lora: entry('astra', 'self-hosted-ltx', 'control', astra.astraIcLoraSchema),
    astra_video_retake: entry('astra', 'self-hosted-ltx', 'retake', astra.astraVideoRetakeSchema),
    omni_text2video: entry('omni', 'gemini-interactions', 'text', omni.omniText2VideoSchema),
    omni_img2video: entry('omni', 'gemini-interactions', 'image', omni.omniImg2VideoSchema),
    omni_extend: entry('omni', 'gemini-interactions', 'extend', omni.omniExtendSchema),
    omni_edit: entry('omni', 'gemini-interactions', 'edit', omni.omniEditSchema),
    ...Object.fromEntries(Object.entries(LOCAL_VIDEO_MODELS).map(([tool, model]) => [tool, entry('mlx', 'local-mlx', model.operation, model.schema)])),
    mlx_video_generate: entry('mlx', 'local-mlx', 'text', mlx.mlxVideoGenerateSchema),
});
function keys(schema) {
    if (schema instanceof z.ZodEffects)
        return keys(schema.innerType());
    if (schema instanceof z.ZodObject)
        return Object.keys(schema.shape);
    return [];
}
export function parseVideoArgs(tool, input) {
    const adapter = VIDEO_ADAPTERS[tool];
    if (!adapter)
        throw new Error('Unsupported video tool: ' + tool);
    const { args } = resolveVideoDuration(tool, input);
    const allowed = keys(adapter.schema);
    for (const key of Object.keys(args))
        if (!allowed.includes(key))
            throw new Error('Unsupported ' + tool + ' argument: ' + key);
    const parsed = adapter.schema.parse(args);
    // Seedance schemas add a seconds default after validating mutually exclusive frames.
    if (tool.startsWith('seedance_') && parsed.frames !== undefined)
        delete parsed.durationSeconds;
    return parsed;
}
export function videoCatalog() {
    return {
        version: 1,
        adapters: Object.entries(VIDEO_ADAPTERS).map(([tool, a]) => ({ tool, engine: a.engine, deployment: a.deployment, operation: a.operation,
            voice: videoVoiceCapabilities(tool), ...(tool === 'mlx_video_generate' ? { deprecated: true, replacement: 'ltx_video_generate' } : {}),
            fields: keys(a.schema), modelConstraints: localVideoStrategy(tool) ? { frames: localVideoStrategy(tool).frames, note: tool === 'fasth3_omni_reference' ? '8 steps; 9 images, 3 videos, 3 audios, 12 total; visual reference required; 256 MiB RGB cap; no exact speech preservation.' : 'LTX 8k+1 frames; MLX-Serve backend.' } : a.engine === 'seedance' ? seedance.SEEDANCE_MODEL_SPECS :
                tool === 'astra_genai_msr' ? { note: 'Server-selected MSR deployment; no model parameter. 1..5 PNG/JPEG references: up to four subjects plus one background. Width/height multiples of 64; 8k+1 frames in 25..361. No supplied speech or audio controls.' } :
                    tool === 'astra_genai_audio2video' ? { models: ['ltx-2.5-22b-dev'], note: 'Length equals the audio, at most 361 frames per fps. Mono/stereo wav, mp3, m4a or ogg; 3+ channels 422. Sample rate kept: AAC standard 7350-96000 Hz only, others 422. Data URI at most 15,000,000 base64 characters.' } :
                        a.engine === 'astra-genai' ? { models: GENAI_VIDEO_MODELS, note: 'Explicit duration and resolution; server validates deployment limits. No supplied audio, keyframes or LoRA.' } :
                            a.engine === 'veo' ? { models: veo.VALID_VIDEO_MODELS, resolutions: veo.VALID_VIDEO_RESOLUTIONS, note: 'Use video_plan for cross-field constraints' } :
                                { note: 'Use video_plan; deployment-specific schema is authoritative' } })),
        host: { execution: 'external', note: 'Host tools are outside MCP enforcement; never claim an API gate protects their calls.' },
        unimplemented: ['minimax-h3-api', 'ltx-official-api'],
    };
}
/** Operation-specific contracts, separate from exact supplied-speech synchronization. */
export function videoVoiceCapabilities(tool) {
    const adapter = VIDEO_ADAPTERS[tool];
    if (!adapter)
        throw new Error('Unsupported video tool: ' + tool);
    return {
        voiceReference: tool === 'fasth3_omni_reference' ? 'supported' : tool === 'seedance_reference' ? 'model_dependent' : 'unsupported',
        suppliedSpeech: ['astra_audio2video', 'astra_genai_audio2video'].includes(tool) ? 'audio_conditioned_reencoded' : 'unsupported',
        exactAudioPreservation: false,
        voiceContinuation: tool === 'omni_extend' ? 'previous_interaction_id' : tool === 'veo_extension' ? 'source_final_second' : 'unsupported',
        review: 'not_reviewed',
    };
}
export function speechVideoCapabilities(provider, model) {
    if (provider === 'astra')
        return { provider, model, audioConditioning: true, lipSync: true, postLipSync: false, evidence: 'astra_audio2video adapter contract' };
    if (provider === 'veo' && veo.VALID_VIDEO_MODELS.includes(model))
        return { provider, model, audioConditioning: false, lipSync: false, postLipSync: false, evidence: 'Gemini Veo has no external audio input' };
    if (provider === 'seedance' && Object.hasOwn(seedance.SEEDANCE_MODEL_SPECS, model))
        return { provider, model, audioConditioning: false, lipSync: false, postLipSync: false, evidence: 'Reference audio does not promise exact recorded-speech timing; no post-lipsync adapter installed' };
    if (['host', 'mlx', 'omni', 'astra-genai'].includes(provider))
        return { provider, model, audioConditioning: false, lipSync: false, postLipSync: false, evidence: 'No verified external-speech synchronization adapter; voiceover remains available' };
    throw new Error('No verified speech synchronization contract for selected deployment/model');
}
/** Only managed video dispatch owns its ledger event; unrelated tools retain normal accounting. */
export function isManagedVideoCall(tool, input) {
    return Object.hasOwn(VIDEO_ADAPTERS, tool) && Boolean(input && typeof input === 'object' &&
        !Array.isArray(input) && input.videoContext !== undefined);
}
