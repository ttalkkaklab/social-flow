/** Gateway speech aliases and registered voices; no model-name/runtime guessing. */
import { z } from 'zod';
import * as fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { GenaiRequestError, requestGenaiMedia } from './astra-genai-client.js';
import { executeSpeech, withSpeechRequestId } from './tts-execution.js';
import { bareFilenameSchema } from './media-utils.js';
import { validateSpeechAudio } from './tts-audio.js';

export const genaiSpeechSchema = z.object({
  speechContext: z.object({path:z.string().min(1), lineId:z.string().min(1), expectedRevision:z.string().regex(/^[a-f0-9]{64}$/)}).strict().optional(),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
  model: z.string().trim().min(1).max(200), text: z.string().trim().min(1).max(16000),
  voice: z.string().trim().min(1).max(200).optional(),
  instructions: z.string().trim().min(1).max(2000).optional(),
  speed: z.number().finite().min(0.25).max(4).default(1),
  maxTokens: z.number().int().min(2).max(2000).optional(),
  outputFormat: z.enum(['wav','mp3']).default('wav'), outputPath: z.string().optional(),
  filename: bareFilenameSchema('audio').optional(),
}).strict();
export function buildGenaiSpeechBody(input: unknown) {
  const args = genaiSpeechSchema.parse(input);
  return { model: args.model, input: args.text, response_format: args.outputFormat, speed: args.speed,
    ...(args.voice === undefined ? {} : { voice: args.voice }),
    ...(args.instructions === undefined ? {} : { instructions: args.instructions }),
    ...(args.maxTokens === undefined ? {} : { max_tokens: args.maxTokens }) };
}
/** The gateway answers 429 + Retry-After before generating when the GPU has no room; wait up to 30 minutes. */
async function synthesize(body: Record<string, unknown>): Promise<Buffer> {
  const deadline = Date.now() + 30 * 60_000;
  for (;;) {
    try { return await requestGenaiMedia('/v1/audio/speech', body); }
    catch (error) {
      const seconds = error instanceof GenaiRequestError ? error.retryAfterSeconds : undefined;
      if (seconds === undefined || Date.now() + seconds * 1000 > deadline) throw error;
      await sleep(seconds * 1000);
    }
  }
}

export async function generateGenaiSpeech(input: unknown) {
  const args = genaiSpeechSchema.parse(input);
  const run = () => executeSpeech('tts_astra_genai', args, async output => {
    const bytes = await synthesize(buildGenaiSpeechBody(args));
    validateSpeechAudio(bytes, args.outputFormat);
    const audioPath = path.join(output.outputPath, output.filename);
    fs.writeFileSync(audioPath, bytes, { flag: 'wx', mode: 0o600 });
    return { success: true, audioPath, review: 'not_reviewed' as const };
  });
  return args.requestId ? withSpeechRequestId(args.requestId, run) : run();
}
