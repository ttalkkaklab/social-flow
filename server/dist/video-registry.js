import { LOCAL_VIDEO_MODELS, localVideoStrategy } from './local-video-models.js';
import { DESKTOP_SCHEMAS } from './astra-genai-desktop.js';
import { z } from 'zod';
import * as seedance from './seedance-client.js';
import * as astra from './astra-video-client.js';
import { GENAI_VIDEO_MODELS, genaiTextToVideoSchema, genaiImageToVideoSchema, genaiAudioToVideoSchema, genaiMsrSchema } from './astra-genai-video.js';
import * as mlx from './mlx-serve-client.js';
import { resolveVideoDuration } from './video-duration.js';
import { HOSTED_VIDEO_ROUTES } from './hosted-video-routes.js';
import { minimaxImg2VideoSchema, minimaxReferenceSchema, MINIMAX_MODELS } from './minimax-video.js';
import { scenePromptProfile } from './scene-prompt-profile.js';
export { referenceLabel } from './scene-prompt-profile.js';
import { heygenImg2VideoSchema, heygenReferenceSchema } from './heygen-video.js';
export function requiredCharacters(shot) {
    const inputs = shot.visual?.characterInputs;
    // Scene preview also reads authored cards before the sheet resolver has supplied local paths.
    return Array.isArray(inputs) ? inputs.filter(person => person && typeof person.bodyPath === 'string') : [];
}
const entry = (engine, deployment, operation, schema) => ({ engine, deployment, operation, schema, voice: operation === 'audio' ? 'supplied' : 'none' });
const reference = (engine, deployment, schema) => ({ ...entry(engine, deployment, 'reference', schema), voice: 'reference' });
/** Schemas and model constraints remain owned by adapters, never copied into a second validator. */
export const VIDEO_ADAPTERS = Object.freeze({
    seedance_text2video: entry('seedance', 'byteplus', 'text', seedance.seedanceText2VideoSchema),
    seedance_img2video: entry('seedance', 'byteplus', 'image', seedance.seedanceImg2VideoSchema),
    seedance_reference: {
        ...reference('seedance', 'byteplus', seedance.seedanceReferenceSchema),
        bindCharacterSources(args, cast) {
            const originals = new Map();
            for (const person of cast) {
                const id = person.face?.taskId;
                if (!id)
                    continue;
                if (originals.has(id) && originals.get(id) !== person.character)
                    throw new Error('character_face_source_ambiguous: each facial reference needs one identifiable character');
                originals.set(id, person.character);
            }
            const taskIds = [...originals.keys()];
            if (args.realFaceInput === false && taskIds.length ||
                taskIds.length && args.referenceVideoTaskIds !== undefined && JSON.stringify(args.referenceVideoTaskIds) !== JSON.stringify(taskIds))
                throw new Error('character_inputs_mismatch: use the face sources declared on the storyboard');
            const videos = [args.referenceVideoPaths, args.referenceVideoUrls];
            const offset = videos.reduce((count, files) => count + (Array.isArray(files) ? files.length : 0), 0);
            const notes = [...originals.values()].map((character, index) => `Use Video ${offset + index + 1} only for ${character} facial identity, hair and headwear. Follow the new shot framing, action and dialogue.`);
            return { ...args, realFaceInput: cast.some(person => person.face) || args.realFaceInput === true,
                ...(taskIds.length ? { referenceVideoTaskIds: taskIds, prompt: [args.prompt, ...notes].join('\n') } : {}) };
        },
    },
    ...Object.fromEntries(Object.entries(DESKTOP_SCHEMAS).map(([feature, schema]) => [
        'astra_genai_desktop_' + ({ 'text-to-video': 'text2video', 'image-to-video': 'img2video', 'audio-to-video': 'audio2video' }[feature] || feature),
        entry('astra-genai-desktop', 'gateway-desktop-v1', ({ 'text-to-video': 'text', 'image-to-video': 'image', 'audio-to-video': 'audio', keyframes: 'keyframe' }[feature] || feature), schema),
    ])),
    astra_genai_text2video: entry('astra-genai', 'genai-ltx-v2', 'text', genaiTextToVideoSchema),
    astra_genai_img2video: entry('astra-genai', 'genai-ltx-v2', 'image', genaiImageToVideoSchema),
    astra_genai_audio2video: entry('astra-genai', 'genai-ltx-v2', 'audio', genaiAudioToVideoSchema),
    astra_genai_msr: reference('astra-genai', 'genai-ltx-msr', genaiMsrSchema),
    astra_text2video: entry('astra', 'self-hosted-ltx', 'text', astra.astraText2VideoSchema),
    astra_img2video: entry('astra', 'self-hosted-ltx', 'image', astra.astraImg2VideoSchema),
    astra_keyframe_video: entry('astra', 'self-hosted-ltx', 'keyframe', astra.astraKeyframeVideoSchema),
    astra_audio2video: entry('astra', 'self-hosted-ltx', 'audio', astra.astraAudio2VideoSchema),
    astra_ic_lora: entry('astra', 'self-hosted-ltx', 'control', astra.astraIcLoraSchema),
    astra_video_retake: entry('astra', 'self-hosted-ltx', 'retake', astra.astraVideoRetakeSchema),
    ...Object.fromEntries(Object.entries(LOCAL_VIDEO_MODELS).map(([tool, model]) => [tool,
        model.operation === 'reference' ? reference('mlx', 'local-mlx', model.schema) : entry('mlx', 'local-mlx', model.operation, model.schema)])),
    mlx_video_generate: entry('mlx', 'local-mlx', 'text', mlx.mlxVideoGenerateSchema),
    // Hosted vendors through the common layer (vendor-video.ts). Image lanes render silent cuts;
    // spoken cuts use the reference lanes (MiniMax, HeyGen) or LTX audio-to-video.
    ...HOSTED_VIDEO_ROUTES,
    minimax_img2video: entry('minimax', 'minimax-open-platform-v2', 'image', minimaxImg2VideoSchema),
    minimax_reference: reference('minimax', 'minimax-open-platform-v2', minimaxReferenceSchema),
    heygen_img2video: entry('heygen', 'heygen-v3', 'image', heygenImg2VideoSchema),
    heygen_reference: reference('heygen', 'heygen-v3', heygenReferenceSchema),
});
/**
 * Hosted reference lanes that take a spoken shot the way MSR does: the cast's sheet panels and the
 * shot's start image as pictures, the speaker's pinned sample as audio. Neither vendor can pin a first
 * frame in the same request, so the start image rides as the last picture.
 */
export const VENDOR_REFERENCE_TOOLS = ['minimax_reference', 'heygen_reference'];
function keys(schema) {
    if (schema instanceof z.ZodEffects)
        return keys(schema.innerType());
    if (schema instanceof z.ZodObject)
        return Object.keys(schema.shape);
    return [];
}
/** The adapter's prompt length limit from its schema, or undefined when it states none. */
export function videoPromptLimit(tool) {
    let schema = VIDEO_ADAPTERS[tool]?.schema;
    while (schema instanceof z.ZodEffects)
        schema = schema.innerType();
    let prompt = schema instanceof z.ZodObject ? schema.shape.prompt : undefined;
    while (prompt instanceof z.ZodOptional || prompt instanceof z.ZodDefault || prompt instanceof z.ZodEffects)
        prompt = prompt instanceof z.ZodEffects ? prompt.innerType() : prompt._def.innerType;
    return prompt instanceof z.ZodString ? prompt.maxLength ?? undefined : undefined;
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
    return adapter.schema.parse(args);
}
export const FRAME_FIELDS = {
    seedance_img2video: ['sourceImagePath', 'lastImagePath'], astra_img2video: ['firstFramePath', 'lastFramePath'],
    astra_audio2video: ['imagePath'], astra_genai_img2video: ['imageUri', 'lastFrameUri'],
    astra_genai_desktop_img2video: ['imagePath', 'lastFramePath'], astra_genai_desktop_audio2video: ['imagePath'],
    astra_genai_audio2video: ['imagePath', 'lastFramePath'], mlx_video_generate: ['firstFrameImagePath', 'lastFrameImagePath'], ltx_video_generate: ['firstFrameImagePath', 'lastFrameImagePath'],
    ...Object.fromEntries(Object.entries(HOSTED_VIDEO_ROUTES).flatMap(([tool, route]) => route.frames ? [[tool, route.frames]] : [])),
    minimax_img2video: ['sourceImagePath', 'lastImagePath'], heygen_img2video: ['sourceImagePath', 'lastImagePath'],
};
export function sceneInputCapabilities(tool) {
    const fields = FRAME_FIELDS[tool];
    const schemaFields = VIDEO_ADAPTERS[tool] ? keys(VIDEO_ADAPTERS[tool].schema) : [];
    return {
        fpsField: schemaFields.includes('frameRate') ? 'frameRate' : schemaFields.includes('fps') ? 'fps' : null,
        frameAccurateCuts: false, timedImages: ['astra_keyframe_video', 'astra_genai_desktop_keyframes', 'astra_genai_img2video', 'astra_genai_audio2video'].includes(tool),
        shotScopedReferences: false, frameAddressedNativeDialogue: false,
        ...(['astra_genai_img2video', 'astra_genai_audio2video'].includes(tool) ? { sceneRenderer: {
                model: tool === 'astra_genai_img2video' ? 'ltx-2.5-22b-distilled' : 'ltx-2.5-22b-dev',
                sceneAudioModes: tool === 'astra_genai_img2video' ? ['native', 'mix'] : ['conditioning'], sceneRendering: 'per_shot', requiresUserChoice: true,
                capabilities: '/v1/ltx/v2/scene-to-video/capabilities', validation: '/v1/ltx/v2/scene-to-video/validate',
            } } : {}),
        openingImage: Boolean(fields), endingImage: Boolean(fields?.[1]),
        shotDescriptions: ['astra_genai_text2video', 'astra_genai_img2video'].includes(tool) ? 'gateway_prompt_only' : 'prompt',
        sceneAudio: ['astra_genai_audio2video', 'astra_genai_desktop_audio2video', 'astra_audio2video', 'ltx_api_audio2video', 'ltx_desktop_audio2video'].includes(tool),
    };
}
export function videoCatalog() {
    return {
        version: 1,
        adapters: Object.entries(VIDEO_ADAPTERS).map(([tool, a]) => ({ tool, engine: a.engine, deployment: a.deployment, operation: a.operation,
            sceneInputs: sceneInputCapabilities(tool), sceneCutTiming: scenePromptProfile(tool).cutTiming, voice: videoVoiceCapabilities(tool), ...(tool === 'mlx_video_generate' ? { deprecated: true, replacement: 'ltx_video_generate' } : {}),
            fields: keys(a.schema), modelConstraints: HOSTED_VIDEO_ROUTES[tool] ? HOSTED_VIDEO_ROUTES[tool].modelConstraints : localVideoStrategy(tool) ? { frames: localVideoStrategy(tool).frames, note: tool === 'fasth3_omni_reference' ? '8 steps; 9 images, 3 videos, 3 audios, 12 total; visual reference required; 256 MiB RGB cap; no exact speech preservation.' : 'LTX 8k+1 frames; MLX-Serve backend.' } : a.engine === 'seedance' ? seedance.SEEDANCE_MODEL_SPECS :
                a.engine === 'astra-genai-desktop' ? { discovery: 'astra_genai_catalog', note: 'Gateway /models and /contracts specify installed matrices. I2V: start/end only; A2V: audio and optional start; keyframes: 1..10. LoRA only on text/keyframes; audio truncation defaults false.' } :
                    tool === 'astra_genai_msr' ? { note: 'Server-selected MSR deployment; no model parameter. 1..5 PNG/JPEG references: up to four subjects plus one background. Width/height multiples of 64; 8k+1 frames in 25..361. Speech and effects are rendered natively; an optional character voice sample on subject 1 or 2 sets the timbre of that speaker, and the dialogue goes in the prompt.' } :
                        tool === 'astra_genai_audio2video' ? { models: ['ltx-2.5-22b-dev', 'ltx-2.5-22b-distilled'], note: 'Up to eight temporal images including endpoints on gateways with keyframes support. Length equals the audio, at most 361 frames per fps. Mono/stereo wav, mp3, m4a or ogg; 3+ channels 422. Sample rate kept: AAC standard 7350-96000 Hz only, others 422. Data URI at most 15,000,000 base64 characters.' } :
                            tool === 'astra_genai_img2video' ? { models: GENAI_VIDEO_MODELS, references: { subjects: 4, background: 1, model: 'ltx-2.5-22b-distilled', voiceSubjects: [1, 2], capability: '/v1/ltx/msr/capabilities:image_conditioning', voiceCapability: 'voice_references' }, note: 'Start image and optional end frame; additional references use the distilled MSR IC-LoRA with duration or numFrames. Dev takes temporal images. generateAudio:false removes the soundtrack. Timed keyframes require gateway support.' } :
                                a.engine === 'astra-genai' ? { models: GENAI_VIDEO_MODELS, note: 'Use duration, exact numFrames or automatic duration. Optional shots describe 2–4 cuts. Plain distilled generation accepts registered LoRAs on supporting backends.' } :
                                    a.engine === 'minimax' ? { models: Object.keys(MINIMAX_MODELS), note: 'MiniMax H3 open platform. 4-15 s (Max 5-15), 24 fps, native stereo audio always on. First/last frames and references never share a request: the reference lane sends the start image as its last picture, unpinned. Up to 9 pictures and 3 voice samples (2-15 s each, 15 s total); 5 pictures free (Max 2). No seed.' } :
                                        a.engine === 'heygen' ? { models: ['heygen-video-1'], note: 'HeyGen Video 1, a MiniMax H3 post-train. 480p/768p, 5-15 s with prompt enhancement disabled, native audio always on. Files upload to /v3/assets first. Reference voice behaviour comes from secondary sources only; the start image rides as the last picture, unpinned.' } :
                                            { note: 'Use video_plan; deployment-specific schema is authoritative' } })),
        host: { execution: 'external', note: 'Host tools are outside MCP enforcement; never claim an API gate protects their calls.' },
        unimplemented: [],
    };
}
/** Operation-specific contracts, separate from exact supplied-speech synchronization. */
export function videoVoiceCapabilities(tool) {
    const adapter = VIDEO_ADAPTERS[tool];
    if (!adapter)
        throw new Error('Unsupported video tool: ' + tool);
    return {
        lane: tool === 'astra_genai_img2video' ? 'conditional_reference' : adapter.voice,
        dialogue: scenePromptProfile(tool).allowsGeneratedVoice ? 'requires_model_generated_scene_voice' : tool === 'astra_genai_img2video' ? 'requires_subject_references' : adapter.voice === 'none' ? 'refused' : 'allowed',
        voiceReference: tool === 'astra_genai_img2video' ? 'backend_dependent_with_subject_references' : adapter.voice !== 'reference' ? 'unsupported' : ['astra_genai_msr', 'heygen_reference'].includes(tool) ? 'backend_dependent' : 'supported',
        suppliedSpeech: adapter.voice === 'supplied' ? 'audio_conditioned_reencoded' : 'unsupported',
        exactAudioPreservation: false,
        review: 'not_reviewed',
    };
}
export function speechVideoCapabilities(provider, model, operation, subjectReferences = false, generatedVoice = false) {
    if (provider === 'omni' || (provider === 'veo' && !Object.hasOwn(HOSTED_VIDEO_ROUTES.veo_img2video.modelConstraints, model)) || (provider === 'seedance' && !Object.hasOwn(seedance.SEEDANCE_MODEL_SPECS, model)))
        throw new Error(`video_engine_unsupported: ${provider} ${model} cannot keep a character's voice; choose a video model again with project_manage`);
    if (generatedVoice)
        return { provider, model, audioConditioning: false, lipSync: false, postLipSync: false, nativeSpeech: true,
            evidence: 'The scene opts into dialogue synthesized in the clip soundtrack. Review the words and speaker assignment.' };
    // MSR voices the dialogue written in its prompt; no line audio goes in (2026-10-31).
    // The hosted reference lanes speak the prompt's dialogue natively, as MSR does; a pinned sample sets the timbre.
    if (['minimax', 'heygen'].includes(provider) && operation === 'reference')
        return { provider, model, audioConditioning: false, lipSync: false, postLipSync: false, nativeSpeech: true, evidence: 'Native speech from the prompt dialogue with an optional voice sample; voice identity is imitation, not preserved audio' };
    if (provider === 'astra-genai' && (operation === 'reference' || (operation === 'image' && model === 'ltx-2.5-22b-distilled' && subjectReferences)))
        return { provider, model, audioConditioning: false, lipSync: false, postLipSync: false, nativeSpeech: true, evidence: 'MSR speaks the prompt dialogue with lip movement into its own soundtrack; it takes no line audio' };
    if (operation === 'audio' && (provider === 'astra' || provider === 'astra-genai-desktop' || provider === 'ltx-api' || provider === 'ltx-desktop-local' ||
        provider === 'astra-genai' && GENAI_VIDEO_MODELS.some(id => id === model)))
        return { provider, model, audioConditioning: true, lipSync: false, postLipSync: false, evidence: 'The supplied track conditions video generation. Mouth movement and phoneme alignment require output review.' };
    if (provider === 'seedance' && operation === 'reference')
        return { provider, model, audioConditioning: false, lipSync: false, postLipSync: false, nativeSpeech: true, evidence: 'Seedance speaks the authored dialogue with an optional voice reference. The sample guides timbre and does not fix phoneme timing.' };
    if (provider === 'seedance' && Object.hasOwn(seedance.SEEDANCE_MODEL_SPECS, model))
        return { provider, model, audioConditioning: false, lipSync: false, postLipSync: false, evidence: 'Reference audio does not promise exact recorded-speech timing; no post-lipsync adapter installed' };
    if (['host', 'veo', 'mlx', 'astra', 'astra-genai', 'astra-genai-desktop', 'ltx-desktop-local', 'ltx-api', 'minimax', 'heygen'].includes(provider))
        return { provider, model, audioConditioning: false, lipSync: false, postLipSync: false, evidence: 'No verified external-speech synchronization adapter; voiceover remains available' };
    throw new Error('No verified speech synchronization contract for selected deployment/model');
}
/** Only managed video dispatch owns its ledger event; unrelated tools retain normal accounting. */
export function isManagedVideoCall(tool, input) {
    return Object.hasOwn(VIDEO_ADAPTERS, tool) && Boolean(input && typeof input === 'object' &&
        !Array.isArray(input) && input.videoContext !== undefined);
}
