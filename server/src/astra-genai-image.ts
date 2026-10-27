/** DashScope image request contract; this is not the local mflux Z-Image adapter. */
import { z } from 'zod';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';
import { GenaiRequestError, astraGenaiBaseUrl, requestGenai, downloadGenaiResult, requireAstraGenaiKey, genaiImageUriSchema, genaiSourceUri } from './astra-genai-client.js';
import { atomicJson } from './routing-files.js';
import { verifyImageFile, imageMetadata } from './image-media.js';

export const GENAI_IMAGE_ROUTE = '/v1/dashscope/api/v1/services/aigc/multimodal-generation/generation';
export const genaiImageSchema = z.object({
  model: z.string().min(1),
  prompt: z.string().min(1).max(800),
  size: z.string().min(1).default('1024*1536'),
  seed: z.number().int().min(0).max(2147483647).nullable().optional(),
  promptExtend: z.boolean().default(false),
  steps: z.number().int().min(1).max(12).optional(),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('image').refine(name => name.endsWith('.png'), 'Use a .png filename').optional(),
}).strict();
export const genaiImageEditSchema = genaiImageSchema.extend({
  mode: z.enum(['img2img', 'inpaint']),
  size: z.string().min(1).optional(),
  imageUri: genaiImageUriSchema.optional(),
  imagePath: z.string().min(1).optional(),
  maskUri: genaiImageUriSchema.optional(),
  maskPath: z.string().min(1).optional(),
  strength: z.number().finite().gt(0).max(1).optional(),
}).strict().superRefine((args, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (Number(!!args.imageUri) + Number(!!args.imagePath) !== 1) issue('Supply exactly one imageUri or imagePath');
  const masks = Number(!!args.maskUri) + Number(!!args.maskPath);
  if (args.mode === 'inpaint' ? masks !== 1 : masks !== 0) issue('Only inpaint requires exactly one maskUri or maskPath');
});
export type GenaiImageRequest = z.infer<typeof genaiImageSchema> | z.infer<typeof genaiImageEditSchema>;

export function buildGenaiImageBody(args: GenaiImageRequest) {
  const edit = 'mode' in args ? args : undefined;
  const content: ({ text: string } | { image: string })[] = [{ text: args.prompt }];
  const source = edit ? genaiSourceUri(edit.imageUri, edit.imagePath) : undefined;
  const mask = edit?.mode === 'inpaint' ? genaiSourceUri(edit.maskUri, edit.maskPath) : undefined;
  if (source) content.push({ image: source });
  if (source?.startsWith('data:') && mask?.startsWith('data:')) {
    const sourceSize = imageMetadata(Buffer.from(source.slice(source.indexOf(',') + 1), 'base64'));
    const maskSize = imageMetadata(Buffer.from(mask.slice(mask.indexOf(',') + 1), 'base64'));
    if (sourceSize.width !== maskSize.width || sourceSize.height !== maskSize.height)
      throw new Error('GenAI mask dimensions must match the source');
  }
  return { model: args.model, input: { messages: [{ role: 'user', content }],
    ...(mask ? { mask } : {}) },
    parameters: { ...(args.size === undefined ? {} : { size: args.size }), prompt_extend: args.promptExtend,
      ...(args.seed === undefined ? {} : { seed: args.seed }),
      ...(args.steps === undefined ? {} : { num_inference_steps: args.steps }),
      ...(edit ? { mode: edit.mode, ...(edit.strength === undefined ? {} : { strength: edit.strength }) } : {}) } };
}

// DashScope provider response envelope; never reinterpret arbitrary JSON as a successful image.
const responseSchema = z.object({
  request_id: z.string().min(1), usage: z.record(z.unknown()).optional(),
  output: z.object({ choices: z.array(z.object({
    message: z.object({ content: z.array(z.object({ image: z.string().optional(), text: z.string().optional() }).passthrough()) }).passthrough(),
  }).passthrough()).length(1) }).passthrough(),
}).passthrough();

export class GenaiImageOutputError extends Error {
  constructor(message: string, readonly requestId: string, readonly usage?: unknown) { super(message); }
}

export async function generateGenaiImage(input: unknown, operation: 'text' | 'edit' = 'text') {
  const args = (operation === 'edit' ? genaiImageEditSchema : genaiImageSchema).parse(input);
  requireAstraGenaiKey();
  const imagePath = resolveOutputFile(args.outputPath || process.cwd(), args.filename || `genai-${Date.now()}.png`, 'image');
  const receiptPath = imagePath + '.astra-genai.json';
  const body = buildGenaiImageBody(args);
  const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  // The synchronous image route has no status endpoint. Preserve its response for download recovery.
  if (fs.existsSync(receiptPath) || fs.existsSync(imagePath))
    throw new Error('GenAI image output/receipt already exists; inspect the receipt before any new generation.');
  fs.writeFileSync(receiptPath, JSON.stringify({ baseUrl: astraGenaiBaseUrl(), fingerprint, imagePath, status: 'submitting' }), { flag: 'wx', mode: 0o600 });
  let promptExtension: string | undefined;
  let raw: unknown;
  try { raw = await requestGenai('POST', GENAI_IMAGE_ROUTE, body, 30 * 60_000, headers => {
    const value = headers.get('x-prompt-extend');
    if (value === 'applied' || value === 'fallback') promptExtension = value;
  });
  } catch (error) {
    atomicJson(receiptPath, { baseUrl: astraGenaiBaseUrl(), fingerprint, imagePath,
      status: error instanceof GenaiRequestError && error.terminal ? 'failed' : 'submission_unknown',
      error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  atomicJson(receiptPath, { baseUrl: astraGenaiBaseUrl(), fingerprint, imagePath, status: 'received', response: raw, promptExtension });
  try { return await recoverGenaiImage(receiptPath); }
  catch (error) {
    const received = responseSchema.safeParse(raw);
    if (received.success) throw new GenaiImageOutputError(error instanceof Error ? error.message : String(error), received.data.request_id, received.data.usage);
    throw error;
  }
}

/** Retry only the download from a durable provider response; never regenerate. */
export async function recoverGenaiImage(receiptPath: string) {
  const receipt = z.object({ baseUrl: z.string(), fingerprint: z.string(), imagePath: z.string(),
    status: z.enum(['submitting', 'submission_unknown', 'failed', 'received', 'completed']), response: z.unknown().optional(),
    output: z.object({ sha256: z.string() }).passthrough().optional(), requestId: z.string().optional(), usage: z.unknown().optional(), usedPrompt: z.string().optional(), promptExtension: z.enum(['applied', 'fallback']).optional(),
  }).passthrough().parse(JSON.parse(fs.readFileSync(receiptPath, 'utf8')));
  if (receipt.baseUrl !== astraGenaiBaseUrl()) throw new Error('GenAI image receipt belongs to a different server');
  const { imagePath, fingerprint } = receipt;
  if (receipt.status === 'completed') {
    const output = verifyImageFile(imagePath);
    if (output.sha256 !== receipt.output?.sha256) throw new Error('GenAI cached image changed');
    return { imagePath, requestId: receipt.requestId, usage: receipt.usage, usedPrompt: receipt.usedPrompt, promptExtension: receipt.promptExtension, output, review: 'not_reviewed' };
  }
  if (receipt.status === 'failed') throw new Error('GenAI image request failed; inspect billing before a new request');
  if (receipt.status !== 'received') throw new Error('GenAI image submission is ambiguous; inspect provider usage before retrying');
  const response = responseSchema.parse(receipt.response);
  const images = response.output.choices[0].message.content.flatMap(item => item.image ? [item.image] : []);
  if (images.length !== 1) throw new Error('GenAI response must contain exactly one image URL; inspect the saved receipt.');
  const bytes = await downloadGenaiResult(images[0]);
  const temp = `${imagePath}.${process.pid}.download.png`;
  try {
    fs.writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 });
    const output = verifyImageFile(temp);
    if (output.mimeType !== 'image/png') throw new Error('GenAI image response is not PNG');
    if (fs.existsSync(imagePath)) {
      if (verifyImageFile(imagePath).sha256 !== output.sha256) throw new Error('GenAI image output conflicts with download');
    } else fs.linkSync(temp, imagePath);
    const usedPrompt = response.output.choices[0].message.content.find(item => item.text !== undefined)?.text;
    const result = { imagePath, usedPrompt, promptExtension: receipt.promptExtension, requestId: response.request_id, usage: response.usage, output, review: 'not_reviewed' };
    atomicJson(receiptPath, { baseUrl: astraGenaiBaseUrl(), fingerprint, ...result, status: 'completed' });
    return result;
  } finally { fs.rmSync(temp, { force: true }); }
}
