/** Gateway speech aliases and registered voices; no model-name/runtime guessing. */
import { z } from 'zod';
import * as fs from 'node:fs';
import path from 'node:path';
import { requestGenaiMedia } from './astra-genai-client.js';
import { executeSpeech, withSpeechRequestId } from './tts-execution.js';
import { bareFilenameSchema } from './media-utils.js';
import { validateSpeechAudio } from './tts-audio.js';

export const genaiSpeechSchema = z.object({
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
export async function generateGenaiSpeech(input: unknown) {
  const args = genaiSpeechSchema.parse(input);
  const run = () => executeSpeech('tts_astra_genai', args, async output => {
    const bytes = await requestGenaiMedia('/v1/audio/speech', buildGenaiSpeechBody(args));
    validateSpeechAudio(bytes, args.outputFormat);
    const audioPath = path.join(output.outputPath, output.filename);
    fs.writeFileSync(audioPath, bytes, { flag: 'wx', mode: 0o600 });
    return { success: true, audioPath, review: 'not_reviewed' as const };
  });
  return args.requestId ? withSpeechRequestId(args.requestId, run) : run();
}
