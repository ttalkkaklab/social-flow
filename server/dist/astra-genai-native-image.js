/** Model-bound gateway images. No local runtime or upstream path crosses this adapter. */
import { z } from 'zod';
import * as fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';
import { GENAI_SCENE_REPLAY_WINDOW_MS, GENERATIONS_ROUTE, GenaiRequestError, astraGenaiBaseUrl, downloadGenaiResult, genaiSourceUri, generationSchema, pollGenaiJob, requestGenai, requireAstraGenaiKey, } from './astra-genai-client.js';
import { GenaiImageOutputError } from './astra-genai-image.js';
import { atomicJson } from './routing-files.js';
import { readImageMetadata, verifyImageFile } from './image-media.js';
export const GENAI_H3_IMAGE_MODEL = 'minimax-h3-image';
const LEGACY_H3_IMAGE_MODEL = 'h3-image';
const NATIVE_IMAGE_ROUTE = '/v1/images/generations';
const H3_REFERENCE_LIMIT = 7;
export const nativeImageSchema = z.object({
    model: z.string().trim().min(1).max(200), prompt: z.string().trim().min(1).max(16000),
    size: z.string().regex(/^[0-9]{2,4}x[0-9]{2,4}$/).optional(),
    seed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    steps: z.number().int().min(0).max(100).optional(),
    guidanceScale: z.number().finite().min(0).max(20).optional(),
    negativePrompt: z.string().max(16000).optional(), transparent: z.boolean().optional(),
    loras: z.array(z.object({ id: z.string().min(1), scale: z.number().finite().min(0).max(2).default(1) }).strict())
        .min(1).max(8).refine(rows => new Set(rows.map(r => r.id)).size === rows.length, 'Duplicate LoRA IDs').optional(),
    requestId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/).optional(),
    outputPath: z.string().optional(), filename: bareFilenameSchema('image').refine(n => n.endsWith('.png')).optional(),
}).strict();
export const nativeImageEditSchema = nativeImageSchema.extend({
    imagePath: z.string().min(1), refImagePaths: z.array(z.string().min(1)).max(9).optional(),
    mode: z.enum(['edit', 'variation']).default('edit'),
    strength: z.number().finite().gt(0).max(1).optional(),
    refResolution: z.number().int().min(256).max(1024).optional(),
}).strict();
export function isNativeH3Image(model) {
    return model === GENAI_H3_IMAGE_MODEL || model === LEGACY_H3_IMAGE_MODEL;
}
/** An explicit image gateway can still serve the old synchronous alias. */
export function nativeImageRoute(model) {
    if (model === GENAI_H3_IMAGE_MODEL ||
        (model === LEGACY_H3_IMAGE_MODEL && astraGenaiBaseUrl(NATIVE_IMAGE_ROUTE) === astraGenaiBaseUrl())) {
        return GENERATIONS_ROUTE;
    }
    return NATIVE_IMAGE_ROUTE;
}
function h3Sides(size) {
    const [width, height] = size.split('x').map(Number);
    return { width, height };
}
function validateH3Size({ width, height }) {
    if ([width, height].some(side => side < 256 || side > 2048 || side % 16)) {
        throw new Error('H3 image dimensions must be 256..2048, in multiples of 16');
    }
}
/** Validate H3 options before opening source files or reserving a request. */
export function validateNativeImageArgs(args, edit) {
    if (!isNativeH3Image(args.model))
        return;
    for (const key of ['steps', 'guidanceScale', 'negativePrompt', 'transparent', 'loras', 'strength', 'refResolution']) {
        if (args[key] !== undefined)
            throw new Error(`H3 image does not accept ${key}; its six sampling steps are fixed`);
    }
    if (edit && args.mode === 'variation')
        throw new Error('H3 image requires mode edit');
    if (nativeImageRoute(args.model) === GENERATIONS_ROUTE) {
        if (typeof args.seed === 'number' && args.seed > 2147483647)
            throw new Error('H3 image seed must be at most 2147483647');
        if (Array.isArray(args.refImagePaths) && args.refImagePaths.length >= H3_REFERENCE_LIMIT) {
            throw new Error('H3 image accepts at most seven images including the source');
        }
    }
    else if (edit && args.size !== undefined) {
        throw new Error('Legacy H3 image edits use the source dimensions; omit size');
    }
    if (typeof args.size === 'string')
        validateH3Size(h3Sides(args.size));
}
function buildH3ImageBody(args, edit) {
    const paths = edit ? [edit.imagePath, ...(edit.refImagePaths ?? [])] : [];
    const pictures = paths.map(readImageMetadata);
    const referenceCost = pictures.reduce((sum, { width, height }) => sum + Math.max(width, height) / Math.min(width, height), 0);
    if (referenceCost > H3_REFERENCE_LIMIT)
        throw new Error('H3 image reference aspect ratios must sum to at most seven');
    const { width, height } = args.size ? h3Sides(args.size) : pictures[0] ?? h3Sides('1024x1024');
    validateH3Size({ width, height });
    const references = paths.map((file, index) => ({
        id: `picture${index + 1}`, role: 'object', uri: genaiSourceUri(undefined, file),
    }));
    return {
        kind: 'image', mode: 'scene', model: GENAI_H3_IMAGE_MODEL,
        input: { prompt: args.prompt, ...(references.length ? { references } : {}) },
        parameters: { width, height, ...(args.seed !== undefined ? { seed: args.seed } : {}) },
    };
}
export function buildNativeImageBody(input, edit = false) {
    const editArgs = edit ? nativeImageEditSchema.parse(input) : undefined;
    const args = editArgs ?? nativeImageSchema.parse(input);
    validateNativeImageArgs(args, edit);
    if (nativeImageRoute(args.model) === GENERATIONS_ROUTE) {
        return buildH3ImageBody(args, editArgs);
    }
    const { outputPath: _output, filename: _filename, requestId: _requestId, ...fields } = args;
    const body = { ...fields, n: 1, response_format: 'b64_json' };
    if (body.size === undefined && !(edit && isNativeH3Image(args.model)))
        body.size = '1024x1024';
    for (const [local, wire] of [['guidanceScale', 'guidance_scale'], ['negativePrompt', 'negative_prompt'], ['refResolution', 'ref_resolution']]) {
        if (body[local] !== undefined) {
            body[wire] = body[local];
            delete body[local];
        }
    }
    if (editArgs) {
        const encode = (file) => genaiSourceUri(undefined, file).split(',')[1];
        body.image = encode(editArgs.imagePath);
        delete body.imagePath;
        if (editArgs.refImagePaths?.length)
            body.ref_images = editArgs.refImagePaths.map(encode);
        delete body.refImagePaths;
    }
    return body;
}
const imageResponse = z.object({ data: z.array(z.object({ b64_json: z.string().min(1) })).length(1) }).passthrough();
const nativeReceiptSchema = z.object({
    baseUrl: z.string(), imagePath: z.string(), requestId: z.string().optional(), sha256: z.string().optional(),
});
const legacyReceiptSchema = nativeReceiptSchema.extend({
    protocol: z.literal('gateway-image-v1'), status: z.string(), response: z.unknown().optional(),
}).passthrough();
const h3ReceiptSchema = nativeReceiptSchema.extend({
    protocol: z.literal('gateway-image-scene-v1'), model: z.literal(GENAI_H3_IMAGE_MODEL),
    status: z.enum(['submitting', 'submitted', 'completed', 'rejected']), jobId: z.string().optional(),
    expected: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
    createdAt: z.string().optional(), completedAt: z.string().optional(), usage: z.unknown().optional(),
    clientRequestId: z.string().optional(), submittedAt: z.string().optional(), requestBody: z.string().optional(),
    requestSha256: z.string().optional(), credentialSha256: z.string().optional(), rejection: z.string().optional(),
}).passthrough();
const imageReceiptSchema = z.discriminatedUnion('protocol', [legacyReceiptSchema, h3ReceiptSchema]);
const h3JobSchema = generationSchema.extend({
    id: z.string().regex(/^[a-f0-9]{32}$/), kind: z.literal('image'),
    model: z.literal(GENAI_H3_IMAGE_MODEL), mode: z.literal('scene'),
    created_at: z.string(), completed_at: z.string().nullish(), usage: z.unknown(),
});
export async function generateNativeImage(input, edit = false) {
    const editArgs = edit ? nativeImageEditSchema.parse(input) : undefined;
    const args = editArgs ?? nativeImageSchema.parse(input);
    const route = nativeImageRoute(args.model);
    requireAstraGenaiKey(route);
    const imagePath = resolveOutputFile(args.outputPath || process.cwd(), args.filename || `genai-${Date.now()}.png`, 'image');
    const receiptPath = imagePath + '.astra-genai.json';
    if (fs.existsSync(receiptPath) || fs.existsSync(imagePath))
        throw new Error('Output/receipt already exists; recover it before any new generation');
    if (route === GENERATIONS_ROUTE) {
        validateNativeImageArgs(args, edit);
        return generateH3Image(buildH3ImageBody(args, editArgs), args.requestId, imagePath, receiptPath);
    }
    const body = buildNativeImageBody(args, edit);
    const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const requestId = isNativeH3Image(args.model) ? randomUUID() : undefined;
    const receipt = { requestId, clientRequestId: args.requestId, model: args.model, protocol: 'gateway-image-v1', baseUrl: astraGenaiBaseUrl(route), imagePath,
        fingerprint, status: 'submitting' };
    fs.writeFileSync(receiptPath, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
    const response = await requestGenai('POST', route, body, 30 * 60_000, undefined, undefined, requestId);
    atomicJson(receiptPath, { ...receipt, status: 'received', response });
    return recoverNativeImage(receiptPath);
}
export async function recoverNativeImage(receiptPath, binding) {
    const receipt = imageReceiptSchema.parse(JSON.parse(fs.readFileSync(receiptPath, 'utf8')));
    const common = receipt.protocol === 'gateway-image-scene-v1';
    if (binding && (receipt.imagePath !== binding.imagePath || (common && receipt.clientRequestId !== binding.requestId))) {
        throw new Error('GenAI image receipt does not belong to the approved request or output');
    }
    if (receipt.baseUrl !== astraGenaiBaseUrl(common ? GENERATIONS_ROUTE : NATIVE_IMAGE_ROUTE)) {
        throw new Error('Gateway origin changed; restore configuration before recovery');
    }
    if (common) {
        if (!receipt.jobId && binding?.replayUnknown === false) {
            throw new Error('GenAI image request is closed; check main gateway job history');
        }
        const linked = receipt.jobId ? receipt : await replayH3Image(receipt, receiptPath);
        const result = await collectH3Image(linked, receiptPath);
        if (!result)
            throw new Error(`GenAI image job ${linked.jobId} is queued or running; refresh its receipt again`);
        return result;
    }
    if (receipt.status === 'completed') {
        const output = verifyImageFile(receipt.imagePath);
        if (output.sha256 !== receipt.sha256)
            throw new Error('Cached image changed');
        return { imagePath: receipt.imagePath, requestId: receipt.requestId, usage: undefined, output, review: 'not_reviewed' };
    }
    if (receipt.status === 'submitting' && receipt.requestId) {
        const existing = await requestGenai('GET', '/v1/images/requests/' + encodeURIComponent(receipt.requestId));
        const job = z.object({ status: z.string(), request_id: z.literal(receipt.requestId), submission_sha256: z.literal(String(receipt.fingerprint)) }).passthrough().parse(existing);
        if (job.status !== 'succeeded')
            throw new Error('Existing gateway image request is ' + job.status);
        receipt.status = 'received';
        receipt.response = job;
        atomicJson(receiptPath, receipt);
    }
    if (receipt.status !== 'received')
        throw new Error('Submission outcome unknown; inspect gateway usage, never resubmit automatically');
    const encoded = imageResponse.parse(receipt.response).data[0].b64_json;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
        throw new Error('Invalid image base64');
    const output = saveNativeImage(receipt.imagePath, Buffer.from(encoded, 'base64'));
    atomicJson(receiptPath, { ...receipt, status: 'completed', sha256: output.sha256 });
    return { imagePath: receipt.imagePath, requestId: receipt.requestId, usage: undefined, output, review: 'not_reviewed' };
}
async function generateH3Image(body, clientRequestId, imagePath, receiptPath) {
    const { width, height } = body.parameters;
    const requestBody = JSON.stringify(body);
    const receipt = {
        protocol: 'gateway-image-scene-v1', model: GENAI_H3_IMAGE_MODEL, baseUrl: astraGenaiBaseUrl(GENERATIONS_ROUTE),
        imagePath, requestId: randomUUID(), clientRequestId, expected: { width, height }, status: 'submitting',
        submittedAt: new Date().toISOString(), requestBody, requestSha256: hashText(requestBody),
        credentialSha256: hashText(requireAstraGenaiKey(GENERATIONS_ROUTE)),
    };
    fs.writeFileSync(receiptPath, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
    const submitted = await submitH3Image(receipt, receiptPath, body);
    const { result } = await pollGenaiJob(async () => {
        const result = await collectH3Image(submitted, receiptPath);
        return { downloaded: result !== undefined, result };
    }, `GenAI image is still pending; recover using receiptPath ${receiptPath}`);
    return result;
}
const hashText = (value) => createHash('sha256').update(value).digest('hex');
async function submitH3Image(receipt, receiptPath, body) {
    const { requestBody: _body, credentialSha256: _credential, ...metadata } = receipt;
    let response;
    try {
        response = await requestGenai('POST', GENERATIONS_ROUTE, body, 60_000, undefined, undefined, receipt.requestId);
    }
    catch (error) {
        if (error instanceof GenaiRequestError && error.terminal) {
            const current = h3ReceiptSchema.parse(JSON.parse(fs.readFileSync(receiptPath, 'utf8')));
            if (current.jobId)
                return current;
            atomicJson(receiptPath, { ...metadata, status: 'rejected', rejection: error.message });
        }
        throw error;
    }
    const job = h3JobSchema.parse(response);
    const current = h3ReceiptSchema.parse(JSON.parse(fs.readFileSync(receiptPath, 'utf8')));
    if (current.jobId) {
        if (current.jobId !== job.id)
            throw new Error('GenAI image recovery job ID mismatch');
        return current;
    }
    const linked = { ...metadata, jobId: job.id, createdAt: job.created_at, status: 'submitted' };
    atomicJson(receiptPath, linked);
    return linked;
}
/** An explicit refresh can reattach a lost acknowledgement using the original idempotency key. */
function replayH3Image(receipt, receiptPath) {
    if (receipt.status === 'rejected')
        throw new Error(receipt.rejection ?? 'GenAI image submission was rejected');
    const { requestId, requestBody, requestSha256, submittedAt, credentialSha256 } = receipt;
    if (!requestId || !requestBody || !submittedAt || hashText(requestBody) !== requestSha256) {
        throw new Error('GenAI image submission identity is unknown; check main gateway job history');
    }
    const age = Date.now() - Date.parse(submittedAt);
    if (!(age >= 0 && age < GENAI_SCENE_REPLAY_WINDOW_MS)) {
        throw new Error('GenAI image replay window has passed; check main gateway job history');
    }
    if (hashText(requireAstraGenaiKey(GENERATIONS_ROUTE)) !== credentialSha256) {
        throw new Error('GenAI image gateway credential changed; restore it before recovery');
    }
    return submitH3Image(receipt, receiptPath, JSON.parse(requestBody));
}
function h3ImageResult(receipt, receiptPath, output) {
    return {
        imagePath: receipt.imagePath, receiptPath, jobId: receipt.jobId, requestId: receipt.jobId,
        createdAt: receipt.createdAt, completedAt: receipt.completedAt, usage: receipt.usage, output, review: 'not_reviewed',
    };
}
async function collectH3Image(receipt, receiptPath) {
    if (receipt.status === 'completed') {
        const output = verifyImageFile(receipt.imagePath);
        if (output.sha256 !== receipt.sha256)
            throw new Error('Cached image changed');
        return h3ImageResult(receipt, receiptPath, output);
    }
    const { jobId } = receipt;
    if (!jobId)
        throw new Error('GenAI image submission outcome unknown; check main gateway job history before retrying');
    const job = h3JobSchema.parse(await requestGenai('GET', GENERATIONS_ROUTE + '/' + encodeURIComponent(jobId)));
    if (job.id !== jobId)
        throw new Error('GenAI image status job ID mismatch');
    if (job.status === 'failed' || job.status === 'cancelled') {
        throw new GenaiRequestError(`GenAI image ${jobId} ${job.status}: ${job.error?.message ?? 'No details'}`, true, 200);
    }
    if (job.status !== 'succeeded')
        return undefined;
    try {
        const [output] = job.outputs;
        if (job.result_expired)
            throw new Error('GenAI image result expired');
        if (job.outputs.length !== 1 || output.kind !== 'image' || output.mime_type !== 'image/png' ||
            output.authentication !== 'signed_url')
            throw new Error('GenAI image job did not return one signed PNG');
        const url = new URL(output.url, receipt.baseUrl + '/');
        if (url.origin !== new URL(receipt.baseUrl).origin || url.pathname !== `/v1/files/${jobId}.png` ||
            !url.searchParams.has('exp') || !url.searchParams.has('sig')) {
            throw new Error('Invalid signed GenAI image URL');
        }
        const bytes = await downloadGenaiResult(url.href);
        const verified = saveNativeImage(receipt.imagePath, bytes, receipt.expected);
        const completed = { ...receipt, status: 'completed', sha256: verified.sha256,
            createdAt: job.created_at, completedAt: job.completed_at ?? undefined, usage: job.usage };
        atomicJson(receiptPath, completed);
        return h3ImageResult(completed, receiptPath, verified);
    }
    catch (error) {
        throw new GenaiImageOutputError(error instanceof Error ? error.message : String(error), jobId, job.usage);
    }
}
function saveNativeImage(imagePath, bytes, expected) {
    const temp = imagePath + `.${randomUUID()}.download.png`;
    try {
        fs.writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 });
        const output = verifyImageFile(temp);
        if (output.mimeType !== 'image/png')
            throw new Error('Expected PNG');
        if (expected && (output.width !== expected.width || output.height !== expected.height)) {
            throw new Error('GenAI image dimensions differ from the requested size');
        }
        try {
            fs.linkSync(temp, imagePath);
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                throw error;
            if (verifyImageFile(imagePath).sha256 !== output.sha256)
                throw new Error('Image output conflicts');
        }
        return output;
    }
    finally {
        fs.rmSync(temp, { force: true });
    }
}
