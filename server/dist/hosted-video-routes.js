import { config } from './config.js';
import { buildLtxApiBody, generateLtxApiVideo, LTX_API_MODELS, LTX_API_RESOLUTIONS, ltxApiAudioMax, ltxApiAudio2VideoSchema, ltxApiImg2VideoSchema, ltxApiSeconds, pollLtxApi } from './ltx-api-video.js';
import { buildVeoBody, generateVeo, pollVeo, VEO_CONSTRAINTS, veoExtendSchema, veoImageSchema, veoReferenceSchema, veoTextSchema } from './veo-video.js';
function inputs(schema, build, generate) {
    return { schema, preflight: (args) => { build(schema.parse(args)); }, generate: (args) => generate(schema.parse(args)) };
}
const ltx = {
    engine: 'ltx-api', deployment: 'ltx-api-v2', configured: () => Boolean(config.ltxApiKey),
    modelConstraints: { models: [...LTX_API_MODELS], resolutions: LTX_API_RESOLUTIONS,
        limits: Object.fromEntries(LTX_API_MODELS.map(model => [model, Object.fromEntries(Object.entries(LTX_API_RESOLUTIONS).map(([tier, [size]]) => [tier, { imageSeconds: ltxApiSeconds(model, size, 24), highFpsSeconds: ltxApiSeconds(model, size, 48), audioMaxSeconds: ltxApiAudioMax(model, size) }]))])),
        note: 'Official LTX API. I2V: 6/8/10 s (Fast at 720p/1080p, 24/25 fps: 6-20 s), first and optional last frame, 7 MB inline images. A2V: the supplied track sets the length (2-10 s; Fast at 720p/1080p up to 20 s), billed on audio seconds. No voice reference, seed or negative prompt.' },
    frames: ['sourceImagePath', 'lastImagePath'],
};
const veo = {
    engine: 'veo', deployment: 'google-cloud-us-central1', voice: 'none', configured: () => Boolean(config.googleCloudProject),
    modelConstraints: VEO_CONSTRAINTS, soundtrack: true,
    poll: (args, id) => pollVeo(String(args.model), id),
};
export const HOSTED_VIDEO_ROUTES = {
    ltx_api_img2video: { ...ltx, ...inputs(ltxApiImg2VideoSchema, buildLtxApiBody, generateLtxApiVideo), operation: 'image', voice: 'none', soundtrack: true,
        title: 'Generate an LTX API video from a start frame', description: 'Generate from a first and optional last frame using LTX_API_KEY. Use audio-to-video for supplied speech.',
        seconds: a => ltxApiSeconds(String(a.model ?? 'ltx-2-5-pro'), String(a.resolution ?? '1920x1080'), Number(a.fps ?? 24)),
        poll: (_, id) => pollLtxApi('image-to-video', id) },
    ltx_api_audio2video: { ...ltx, ...inputs(ltxApiAudio2VideoSchema, buildLtxApiBody, generateLtxApiVideo), operation: 'audio', voice: 'supplied',
        title: 'Generate an LTX API video from a voice track', description: 'The supplied audio controls the clip length and speech. Supply a prompt or a first image, or both. Requires LTX_API_KEY.',
        poll: (_, id) => pollLtxApi('audio-to-video', id) },
    veo_text2video: { ...veo, ...inputs(veoTextSchema, buildVeoBody, generateVeo), operation: 'text', title: 'Generate a Veo clip from text',
        seconds: () => [4, 6, 8], description: 'Google Cloud Veo 3.1. English scene and optional native sound. Character voice samples are unsupported.' },
    veo_img2video: { ...veo, ...inputs(veoImageSchema, buildVeoBody, generateVeo), operation: 'image', title: 'Animate a first frame with Veo',
        frames: ['sourceImagePath', 'lastImagePath'], seconds: () => [4, 6, 8], description: 'Animate a JPEG or PNG with Google Cloud Veo 3.1, optionally pinning the final frame. Use reference mode for asset pictures.' },
    veo_reference: { ...veo, ...inputs(veoReferenceSchema, buildVeoBody, generateVeo), operation: 'reference', title: 'Generate a Veo clip from subject images',
        seconds: () => [8], description: 'Generate eight seconds from one to three images of a subject. Standard and Fast accept assets. No pinned frames or voice samples.' },
    veo_extend: { ...veo, ...inputs(veoExtendSchema, buildVeoBody, generateVeo), operation: 'extend', title: 'Extend an existing Veo video',
        description: 'Extend a 1–30 second, 24 fps MP4 by seven seconds with Google Cloud Veo. Returns the concatenated MP4.' },
};
