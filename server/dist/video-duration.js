import { localVideoStrategy } from './local-video-models.js';
import { minimumDuration } from '../../skills/_shared/video-duration.js';
import { SEEDANCE_MODEL_SPECS, DEFAULT_SEEDANCE_MODEL, DEFAULT_SEEDANCE_REFERENCE_MODEL, SEEDANCE_FRAME_MODELS, SEEDANCE_MIN_FRAMES, SEEDANCE_MAX_FRAMES, SEEDANCE_FRAME_STEP, SEEDANCE_FPS } from './seedance-client.js';
import { ASTRA_VIDEO_FRAME_LIMITS, ASTRA_VIDEO_FRAME_STEP, ASTRA_VIDEO_MIN_FRAMES } from './astra-video-client.js';
export const DURATION_TOOLS = [
    'veo_text2video', 'veo_img2video', 'veo_reference',
    'omni_text2video', 'omni_img2video',
    'seedance_text2video', 'seedance_img2video', 'seedance_reference',
    'astra_text2video', 'astra_img2video', 'astra_keyframe_video', 'astra_audio2video',
    'mlx_video_generate', 'ltx_video_generate', 'fasth3_omni_reference',
];
/** Resolve required playback coverage into the shortest supported request, without I/O. */
export function resolveVideoDuration(tool, input) {
    if (input.requiredSeconds === undefined)
        return { args: input, timing: null };
    if (!DURATION_TOOLS.includes(tool))
        throw new Error('requiredSeconds is not supported for ' + tool);
    for (const key of ['duration', 'durationSeconds', 'numFrames', 'frames', 'autoDuration', 'audioMaxDuration']) {
        if (input[key] !== undefined)
            throw new Error('requiredSeconds is mutually exclusive with ' + key + '; supply the shot need or an exact legacy request, not both');
    }
    let limits;
    if (tool.startsWith('veo_')) {
        const fixed = tool === 'veo_reference' || ['1080p', '4k'].includes(String(input.resolution));
        limits = { seconds: fixed ? [8] : [4, 6, 8] };
    }
    else if (tool.startsWith('omni_')) {
        limits = { min: 3, max: 10 };
    }
    else if (tool.startsWith('seedance_')) {
        const model = input.model ?? (tool === 'seedance_reference' ? DEFAULT_SEEDANCE_REFERENCE_MODEL : DEFAULT_SEEDANCE_MODEL);
        const spec = SEEDANCE_MODEL_SPECS[model];
        if (!spec)
            throw new Error('Unknown Seedance model: ' + String(model));
        limits = SEEDANCE_FRAME_MODELS.includes(model)
            ? { min: SEEDANCE_MIN_FRAMES, max: SEEDANCE_MAX_FRAMES, step: SEEDANCE_FRAME_STEP, frameRate: SEEDANCE_FPS }
            : { min: spec.duration[0], max: spec.duration[1] };
    }
    else if (tool.startsWith('astra_')) {
        const mode = tool === 'astra_audio2video' ? 'audio2video' : tool === 'astra_keyframe_video' ? 'keyframe'
            : input.tier === 'guided' ? 'guided' : input.tier === 'fast' ? 'guided_fast' : input.tier === 'hq' ? 'guided_hq' : 'generate';
        const frameRate = input.frameRate ?? 24;
        if (typeof frameRate !== 'number' || !Number.isFinite(frameRate) || frameRate < 1 || frameRate > 60)
            throw new Error('frameRate must be finite in 1..60');
        limits = { min: ASTRA_VIDEO_MIN_FRAMES, max: ASTRA_VIDEO_FRAME_LIMITS[mode], step: ASTRA_VIDEO_FRAME_STEP, frameRate };
    }
    else {
        limits = localVideoStrategy(tool).frames;
    }
    const timing = minimumDuration(input.requiredSeconds, limits);
    const { requiredSeconds: _required, ...args } = input;
    if (timing.numFrames !== undefined)
        args[tool.startsWith('seedance_') ? 'frames' : 'numFrames'] = timing.numFrames;
    else if (tool !== 'veo_reference')
        args.durationSeconds = timing.durationSeconds;
    return { args, timing };
}
