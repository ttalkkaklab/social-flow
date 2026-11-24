/** Model-bound gateway images. No local runtime or upstream path crosses this adapter. */
import { z } from 'zod';
import * as fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';
import { astraGenaiBaseUrl, requestGenai, genaiSourceUri, requireAstraGenaiKey } from './astra-genai-client.js';
import { atomicJson } from './routing-files.js';
import { verifyImageFile } from './image-media.js';
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
/** Validate the public H3 binding before a plan reserves cost or opens source files. */
export function validateNativeImageArgs(args, edit) {
    if (args.model !== 'h3-image')
        return;
    for (const key of ['steps', 'guidanceScale', 'negativePrompt', 'transparent', 'loras', 'strength', 'refResolution']) {
        if (args[key] !== undefined)
            throw new Error(`h3-image does not accept ${key}; its six sampling steps are fixed`);
    }
    if (edit && (args.mode === 'variation' || args.size !== undefined))
        throw new Error('h3-image edits use the source dimensions; omit size and use mode edit');
    if (typeof args.size === 'string' && args.size.split('x').map(Number).some(n => n < 256 || n > 2048 || n % 16))
        throw new Error('h3-image gateway dimensions must be 256..2048, in multiples of 16');
}
export function buildNativeImageBody(input, edit = false) {
    const args = (edit ? nativeImageEditSchema : nativeImageSchema).parse(input);
    validateNativeImageArgs(args, edit);
    const { outputPath: _output, filename: _filename, requestId: _requestId, ...fields } = args;
    const body = { ...fields, n: 1, response_format: 'b64_json' };
    if (body.size === undefined && !(edit && args.model === 'h3-image'))
        body.size = '1024x1024';
    for (const [local, wire] of [['guidanceScale', 'guidance_scale'], ['negativePrompt', 'negative_prompt'], ['refResolution', 'ref_resolution']]) {
        if (body[local] !== undefined) {
            body[wire] = body[local];
            delete body[local];
        }
    }
    if (edit) {
        const editArgs = nativeImageEditSchema.parse(input);
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
export async function generateNativeImage(input, edit = false) {
    const args = (edit ? nativeImageEditSchema : nativeImageSchema).parse(input);
    requireAstraGenaiKey('/v1/images/');
    const body = buildNativeImageBody(args, edit);
    const imagePath = resolveOutputFile(args.outputPath || process.cwd(), args.filename || `genai-${Date.now()}.png`, 'image');
    const receiptPath = imagePath + '.astra-genai.json';
    if (fs.existsSync(receiptPath) || fs.existsSync(imagePath))
        throw new Error('Output/receipt already exists; recover it before any new generation');
    const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const requestId = args.model === 'h3-image' ? randomUUID() : undefined;
    const receipt = { requestId, clientRequestId: args.requestId, model: args.model, protocol: 'gateway-image-v1', baseUrl: astraGenaiBaseUrl('/v1/images/'), imagePath,
        fingerprint, status: 'submitting' };
    fs.writeFileSync(receiptPath, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
    const response = await requestGenai('POST', '/v1/images/generations', body, 30 * 60_000, undefined, undefined, requestId);
    atomicJson(receiptPath, { ...receipt, status: 'received', response });
    return recoverNativeImage(receiptPath);
}
export async function recoverNativeImage(receiptPath) {
    const receipt = z.object({ protocol: z.literal('gateway-image-v1'), baseUrl: z.string(), imagePath: z.string(),
        requestId: z.string().optional(), status: z.string(), response: z.unknown().optional(), sha256: z.string().optional() }).passthrough()
        .parse(JSON.parse(fs.readFileSync(receiptPath, 'utf8')));
    if (receipt.baseUrl !== astraGenaiBaseUrl('/v1/images/'))
        throw new Error('Gateway origin changed; restore configuration before recovery');
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
    const temp = receipt.imagePath + `.${process.pid}.download.png`;
    try {
        fs.writeFileSync(temp, Buffer.from(encoded, 'base64'), { flag: 'wx', mode: 0o600 });
        const output = verifyImageFile(temp);
        if (output.mimeType !== 'image/png')
            throw new Error('Expected PNG');
        if (fs.existsSync(receipt.imagePath)) {
            if (verifyImageFile(receipt.imagePath).sha256 !== output.sha256)
                throw new Error('Image output conflicts');
        }
        else
            fs.linkSync(temp, receipt.imagePath);
        atomicJson(receiptPath, { ...receipt, status: 'completed', sha256: output.sha256 });
        return { imagePath: receipt.imagePath, requestId: receipt.requestId, usage: undefined, output, review: 'not_reviewed' };
    }
    finally {
        fs.rmSync(temp, { force: true });
    }
}
