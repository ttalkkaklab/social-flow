/** DashScope image request contract; this is not the local mflux Z-Image adapter. */
import { z } from 'zod';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';
import { astraGenaiBaseUrl, requestGenai, downloadGenaiResult, requireAstraGenaiKey } from './astra-genai-client.js';
import { atomicJson } from './routing-files.js';
import { verifyImageFile } from './image-media.js';
export const GENAI_IMAGE_ROUTE = '/v1/dashscope/api/v1/services/aigc/multimodal-generation/generation';
export const genaiImageSchema = z.object({
    model: z.string().min(1),
    prompt: z.string().min(1).max(800),
    size: z.string().min(1).default('1024*1536'),
    seed: z.number().int().min(0).max(2147483647).nullable().optional(),
    promptExtend: z.boolean().default(false),
    outputPath: z.string().optional(),
    filename: bareFilenameSchema('image').refine(name => name.endsWith('.png'), 'Use a .png filename').optional(),
}).strict();
export function buildGenaiImageBody(args) {
    return { model: args.model, input: { messages: [{ role: 'user', content: [{ text: args.prompt }] }] },
        parameters: { size: args.size, prompt_extend: args.promptExtend, ...(args.seed === undefined ? {} : { seed: args.seed }) } };
}
// DashScope provider response envelope; never reinterpret arbitrary JSON as a successful image.
const responseSchema = z.object({
    request_id: z.string().min(1), usage: z.record(z.unknown()).optional(),
    output: z.object({ choices: z.array(z.object({
            message: z.object({ content: z.array(z.object({ image: z.string().optional(), text: z.string().optional() }).passthrough()) }).passthrough(),
        }).passthrough()).length(1) }).passthrough(),
}).passthrough();
export async function generateGenaiImage(input) {
    const args = genaiImageSchema.parse(input);
    requireAstraGenaiKey();
    const imagePath = resolveOutputFile(args.outputPath || process.cwd(), args.filename || `genai-${Date.now()}.png`, 'image');
    const receiptPath = imagePath + '.astra-genai.json';
    const body = buildGenaiImageBody(args);
    const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    // The synchronous image route has no status endpoint. Preserve its response for download recovery.
    if (fs.existsSync(receiptPath) || fs.existsSync(imagePath))
        throw new Error('GenAI image output/receipt already exists; inspect the receipt before any new generation.');
    fs.writeFileSync(receiptPath, JSON.stringify({ baseUrl: astraGenaiBaseUrl(), fingerprint, imagePath, status: 'submitting' }), { flag: 'wx', mode: 0o600 });
    const raw = await requestGenai('POST', GENAI_IMAGE_ROUTE, body, 30 * 60_000);
    atomicJson(receiptPath, { baseUrl: astraGenaiBaseUrl(), fingerprint, imagePath, status: 'received', response: raw });
    return recoverGenaiImage(receiptPath);
}
/** Retry only the download from a durable provider response; never regenerate. */
export async function recoverGenaiImage(receiptPath) {
    const receipt = z.object({ baseUrl: z.string(), fingerprint: z.string(), imagePath: z.string(),
        status: z.enum(['submitting', 'received', 'completed']), response: z.unknown().optional(),
        output: z.object({ sha256: z.string() }).passthrough().optional(), requestId: z.string().optional(), usage: z.unknown().optional(),
    }).passthrough().parse(JSON.parse(fs.readFileSync(receiptPath, 'utf8')));
    if (receipt.baseUrl !== astraGenaiBaseUrl())
        throw new Error('GenAI image receipt belongs to a different server');
    const { imagePath, fingerprint } = receipt;
    if (receipt.status === 'completed') {
        const output = verifyImageFile(imagePath);
        if (output.sha256 !== receipt.output?.sha256)
            throw new Error('GenAI cached image changed');
        return { imagePath, requestId: receipt.requestId, usage: receipt.usage, output, review: 'not_reviewed' };
    }
    if (receipt.status !== 'received')
        throw new Error('GenAI image submission is ambiguous; inspect provider usage before retrying');
    const response = responseSchema.parse(receipt.response);
    const images = response.output.choices[0].message.content.flatMap(item => item.image ? [item.image] : []);
    if (images.length !== 1)
        throw new Error('GenAI response must contain exactly one image URL; inspect the saved receipt.');
    const bytes = await downloadGenaiResult(images[0]);
    const temp = `${imagePath}.${process.pid}.download.png`;
    try {
        fs.writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 });
        const output = verifyImageFile(temp);
        if (output.mimeType !== 'image/png')
            throw new Error('GenAI image response is not PNG');
        if (fs.existsSync(imagePath)) {
            if (verifyImageFile(imagePath).sha256 !== output.sha256)
                throw new Error('GenAI image output conflicts with download');
        }
        else
            fs.linkSync(temp, imagePath);
        const result = { imagePath, requestId: response.request_id, usage: response.usage, output, review: 'not_reviewed' };
        atomicJson(receiptPath, { baseUrl: astraGenaiBaseUrl(), fingerprint, ...result, status: 'completed' });
        return result;
    }
    finally {
        fs.rmSync(temp, { force: true });
    }
}
