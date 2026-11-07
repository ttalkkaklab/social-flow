import { buildLtxVideoBody, executeMlxVideo, mlxVideoGenerateSchema, DEFAULT_MLX_VIDEO_FRAMES, MIN_MLX_VIDEO_FRAMES, MAX_MLX_VIDEO_FRAMES, MLX_VIDEO_FRAME_STEP, MLX_VIDEO_FPS } from './mlx-serve-client.js';
import { buildFasth3Body, fasth3OmniSchema, FASTH3_FRAME_LIMITS, FASTH3_OMNI_MODEL } from './fasth3-omni.js';
/** Strategies describe model behavior; MLX-Serve remains a shared transport. */
export const LOCAL_VIDEO_MODELS = {
    ltx_video_generate: {
        operation: 'text', schema: mlxVideoGenerateSchema, defaultFrames: DEFAULT_MLX_VIDEO_FRAMES,
        frames: { min: MIN_MLX_VIDEO_FRAMES, max: MAX_MLX_VIDEO_FRAMES, step: MLX_VIDEO_FRAME_STEP, frameRate: MLX_VIDEO_FPS },
        acceptsModel: (id) => /ltx/i.test(id),
        prepare: (raw) => buildLtxVideoBody(mlxVideoGenerateSchema.parse(raw)),
    },
    fasth3_omni_reference: {
        operation: 'reference', schema: fasth3OmniSchema, frames: FASTH3_FRAME_LIMITS, defaultFrames: 124,
        acceptsModel: (id) => id === FASTH3_OMNI_MODEL,
        prepare: (raw) => buildFasth3Body(fasth3OmniSchema.parse(raw)),
    },
};
export function localVideoStrategy(tool) {
    const name = tool === 'mlx_video_generate' ? 'ltx_video_generate' : tool;
    return Object.hasOwn(LOCAL_VIDEO_MODELS, name) ? LOCAL_VIDEO_MODELS[name] : undefined;
}
export async function generateLocalVideo(tool, input) {
    const strategy = localVideoStrategy(tool);
    if (!strategy)
        throw new Error('Unknown local video adapter: ' + tool);
    const request = strategy.schema.parse(input);
    const body = strategy.prepare(request);
    return executeMlxVideo(request, body, strategy.acceptsModel);
}
