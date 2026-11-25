import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';
import { config } from './config.js';
import { bareFilenameSchema } from './media-utils.js';
import { mediaType, runVendorJob, vendorJson } from './vendor-video.js';
export const VEO_MODELS = ['veo-3.1-generate-001', 'veo-3.1-fast-generate-001', 'veo-3.1-lite-generate-001'];
const [standard, fast, lite] = VEO_MODELS;
export const VEO_CONSTRAINTS = Object.fromEntries(VEO_MODELS.map(model => [model, {
        priceFamily: model === standard ? 'standard' : model === fast ? 'fast' : 'lite',
        resolutions: model === standard ? ['720p', '1080p', '4k'] : ['720p', '1080p'],
        operations: model === lite ? ['text', 'image', 'extend'] : ['text', 'image', 'reference', 'extend'],
        durationSeconds: [4, 6, 8], referenceSeconds: 8, extensionSeconds: 7, aspectRatios: ['16:9', '9:16'],
        maxAssetImages: model === lite ? 0 : 3, lastFrame: true, generateAudio: true, voiceReference: false,
    }]));
/** Validate authored asset identities before serializing the role-free Vertex array. */
export function veoSubjectIssue(assets, model = standard, owners = [], registered) {
    const limit = VEO_CONSTRAINTS[model]?.maxAssetImages ?? 0;
    if (!limit || !assets.length || assets.length > limit)
        return model + ' accepts ' + (limit ? '1 to ' + limit : 'no') + ' subject images';
    const subjects = new Set(owners.map(id => 'character:' + id));
    const folders = new Set();
    const roles = new Set();
    for (const asset of assets) {
        const role = ['face', 'outfit', 'bystander'].includes(asset.role) ? 'character' : asset.role;
        if (!['character', 'prop', 'continuity'].includes(role))
            return 'Unsupported Veo subject role: ' + asset.role;
        if (role !== 'continuity')
            roles.add(role);
        if (asset.character)
            subjects.add('character:' + asset.character);
        const identities = registered?.get(asset.path);
        for (const id of identities ?? [])
            subjects.add(id);
        const dir = path.dirname(asset.path);
        if (path.basename(path.dirname(dir)) === 'characters')
            subjects.add('character:' + path.basename(dir));
        else if (!identities?.size && fs.existsSync(path.join(dir, 'panels.json')))
            folders.add(dir);
    }
    if (subjects.size > 1 || folders.size > 1 || roles.size > 1)
        return 'Veo asset references must show the same subject';
}
const common = {
    model: z.enum(VEO_MODELS).default(standard), prompt: z.string().trim().min(1),
    resolution: z.enum(['720p', '1080p', '4k']).default('720p'),
    aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
    generateAudio: z.boolean().default(true), negativePrompt: z.string().optional(),
    // Vertex defaults enhancePrompt to true and may rewrite the prompt. Sent only when set: whether 3.1 accepts
    // false is untested live.
    enhancePrompt: z.boolean().optional().describe('Vertex prompt enhancement; omitted keeps the vendor default (on). false asks Veo to use the prompt as written.'),
    seed: z.number().int().min(0).max(0xffffffff).optional(),
    outputPath: z.string().optional(), filename: bareFilenameSchema('video').optional(),
};
const duration = { durationSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]).default(8) };
const checkResolution = (v, ctx) => {
    if (!VEO_CONSTRAINTS[v.model].resolutions.includes(v.resolution))
        ctx.addIssue({ code: 'custom', path: ['resolution'], message: 'Unsupported resolution for ' + v.model });
};
export const veoTextSchema = z.object({ ...common, ...duration }).strict().superRefine(checkResolution);
export const veoImageSchema = z.object({ ...common, ...duration, sourceImagePath: z.string().min(1), lastImagePath: z.string().min(1).optional() }).strict().superRefine(checkResolution);
export const veoReferenceSchema = z.object({ ...common, durationSeconds: z.literal(8).default(8),
    referenceImagePaths: z.array(z.string().min(1)).min(1).max(3),
}).strict().superRefine((v, ctx) => {
    checkResolution(v, ctx);
    if (v.model === lite)
        ctx.addIssue({ code: 'custom', path: ['model'], message: 'Veo Lite does not accept asset reference images' });
});
export const veoExtendSchema = z.object({ ...common, aspectRatio: common.aspectRatio.removeDefault().optional(), sourceVideoPath: z.string().min(1) }).strict().superRefine(checkResolution);
function image(file) {
    const mimeType = mediaType(file, ['.png', '.jpg', '.jpeg']);
    if (fs.statSync(file).size > 20 * 1024 * 1024)
        throw new Error('Veo input image exceeds 20 MB');
    return { mimeType, bytesBase64Encoded: fs.readFileSync(file).toString('base64') };
}
export function buildVeoBody(request) {
    let aspectRatio = request.aspectRatio;
    const instance = { prompt: request.prompt };
    if ('sourceImagePath' in request) {
        instance.image = image(request.sourceImagePath);
        if (request.lastImagePath)
            instance.lastFrame = image(request.lastImagePath);
    }
    else if ('referenceImagePaths' in request) {
        instance.referenceImages = request.referenceImagePaths.map(file => ({ referenceType: 'asset', image: image(file) }));
    }
    else if ('sourceVideoPath' in request) {
        const file = request.sourceVideoPath;
        const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
            'format=duration,format_name:stream=width,height,avg_frame_rate', '-of', 'json', file], { encoding: 'utf8', timeout: 15000 }));
        const stream = probe.streams?.[0];
        const [n, d] = String(stream?.avg_frame_rate).split('/').map(Number);
        if (!/\.mp4$/i.test(file) || !probe.format?.format_name?.split(',').includes('mp4') ||
            !(Number(probe.format.duration) >= 1 && Number(probe.format.duration) <= 30) || n / d !== 24 ||
            !['1280x720', '1920x1080', '3840x2160', '720x1280', '1080x1920', '2160x3840'].includes(stream?.width + 'x' + stream?.height))
            throw new Error('Veo extension requires a 1–30 second 24 fps landscape or portrait MP4 at 720p, 1080p or 4K');
        const sourceAspect = stream.width > stream.height ? '16:9' : '9:16';
        if (aspectRatio && aspectRatio !== sourceAspect)
            throw new Error('Veo extension aspect ratio must match the input video');
        aspectRatio = sourceAspect;
        instance.video = { mimeType: 'video/mp4', bytesBase64Encoded: fs.readFileSync(file).toString('base64') };
    }
    const { resolution, generateAudio, enhancePrompt, negativePrompt, seed } = request;
    return { instances: [instance], parameters: { sampleCount: 1, aspectRatio, resolution, generateAudio, enhancePrompt, negativePrompt, seed,
            ...('durationSeconds' in request ? { durationSeconds: request.durationSeconds } : {}) } };
}
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
function modelResource(model) {
    const project = config.googleCloudProject;
    if (!/^[A-Za-z0-9-]+$/.test(project))
        throw new Error('Set GOOGLE_CLOUD_PROJECT to a Google Cloud project ID or number');
    return 'projects/' + project + '/locations/us-central1/publishers/google/models/' + model;
}
const endpoint = (resource) => 'https://us-central1-aiplatform.googleapis.com/v1/' + resource;
async function headers() {
    const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
    const authorization = token ? { Authorization: 'Bearer ' + token } : Object.fromEntries(await auth.getRequestHeaders());
    return { ...authorization, 'Content-Type': 'application/json' };
}
export function veoStatus(response) {
    if (response.error)
        return { state: 'failed', error: String(response.error.message ?? 'Google Cloud operation failed') };
    if (response.done !== true)
        return { state: 'running' };
    const result = response.response;
    const video = result?.videos?.[0];
    if (!video?.bytesBase64Encoded || video.mimeType !== 'video/mp4')
        return { state: 'failed', error: 'No MP4 returned; filtered outputs: ' + (result?.raiMediaFilteredCount ?? 0) };
    const bytes = Buffer.from(video.bytesBase64Encoded, 'base64');
    if (bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp')
        return { state: 'failed', error: 'Invalid inline MP4 in completed Veo response' };
    return { state: 'done', bytes };
}
export async function pollVeo(model, id) {
    const resource = modelResource(model);
    if (!id.startsWith(resource + '/operations/') || !/^[a-zA-Z0-9_-]+$/.test(id.slice((resource + '/operations/').length)))
        throw new Error('Operation does not belong to the selected Google Cloud project and model');
    return veoStatus(await vendorJson(endpoint(resource) + ':fetchPredictOperation', { method: 'POST', headers: await headers(), body: JSON.stringify({ operationName: id }) }));
}
export async function generateVeo(request) {
    let body, resource, submitHeaders;
    try {
        body = buildVeoBody(request);
        resource = modelResource(request.model);
        submitHeaders = await headers();
    }
    catch (error) {
        return { success: false, terminal: true, error: String(error) };
    }
    return runVendorJob({
        vendor: 'Google Cloud Veo', outputPath: request.outputPath ?? process.cwd(), filename: request.filename ?? 'veo-' + Date.now() + '.mp4',
        submit: async () => {
            const op = await vendorJson(endpoint(resource) + ':predictLongRunning', { method: 'POST', headers: submitHeaders, body: JSON.stringify(body) });
            if (typeof op.name !== 'string' || !op.name.startsWith(resource + '/operations/'))
                throw new Error('Missing Google Cloud operation name');
            return op.name;
        },
        poll: id => pollVeo(request.model, id),
    });
}
export function veoPriceKey(model, resolution, audio) {
    const tier = VEO_CONSTRAINTS[model]?.priceFamily;
    return tier ? ['veo.vertex', tier, resolution, audio ? 'audio' : 'silent'].join('.') : null;
}
