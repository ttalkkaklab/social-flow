import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, constants, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { extname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { genaiSpeechSchema } from './astra-genai-speech.js';
import { executeSpeech } from './tts-execution.js';

const file = z.string().min(1).refine(isAbsolute, 'Use an absolute local path');
export const localVoxSchema = genaiSpeechSchema.pick({
  speechContext: true, text: true, instructions: true, filename: true, outputPath: true,
}).extend({
  model: z.literal('voxcpm2'), voice: z.literal('default').default('default'),
  referenceAudio: file.optional(), referenceSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  continuationAudio: file.optional(), continuationText: z.string().trim().min(1).optional(),
  steps: z.number().int().min(1).max(100).optional(), guidance: z.number().min(0).max(10).optional(),
  maxTokens: z.number().int().min(2).max(8000).optional(),
}).strict().superRefine((args, ctx) => {
  if (!!args.continuationAudio !== !!args.continuationText)
    ctx.addIssue({ code: 'custom', message: 'Continuation requires the recording and its exact transcript' });
  if (args.referenceSha256 && !args.referenceAudio)
    ctx.addIssue({ code: 'custom', message: 'Reference digest requires referenceAudio' });
});

function localRuntime() {
  const config = join(homedir(), '.config/social-flow/voxcpm2.json');
  const saved = existsSync(config) ? JSON.parse(readFileSync(config, 'utf8')) : {};
  const python = process.env.VOXCPM2_PYTHON || saved.python;
  const model = process.env.VOXCPM2_MODEL_PATH || saved.model;
  if (![python, model].every(p => typeof p === 'string' && isAbsolute(p)))
    throw new Error('Configure VoxCPM2 python and model paths in ' + config);
  accessSync(python, constants.X_OK);
  if (!statSync(model).isDirectory()) throw new Error('Local VoxCPM2 model directory is missing');
  if (JSON.parse(readFileSync(join(model, 'config.json'), 'utf8')).model_type !== 'voxcpm2')
    throw new Error('The selected local model directory must contain VoxCPM2 weights');
  return { python: String(python), model: String(model) };
}

export function localVoxConfigured(): boolean {
  try { localRuntime(); return true; } catch { return false; }
}

export async function generateLocalVox(input: unknown) {
  const args = localVoxSchema.parse(input);
  const runtime = localRuntime();
  const scratch = mkdtempSync(join(tmpdir(), 'social-flow-vox-'));
  function snapshot(source: string | undefined, role: string) {
    if (!source) return;
    const path = join(scratch, role + extname(source));
    copyFileSync(source, path, constants.COPYFILE_EXCL);
    return {path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex')};
  }
  try {
    const reference = snapshot(args.referenceAudio, 'reference');
    const continuation = snapshot(args.continuationAudio, 'continuation');
    if (args.referenceSha256 && args.referenceSha256 !== reference?.sha256) throw new Error('Reference voice bytes changed');
    return await executeSpeech('tts_local_voxcpm2', { ...args, referenceSha256: reference?.sha256,
      continuationSha256: continuation?.sha256, modelDirectory: runtime.model }, async output => {
      const audioPath = join(output.outputPath, output.filename);
      const worker = fileURLToPath(new URL('../../skills/_shared/voxcpm2-worker.py', import.meta.url));
      const payload = { text: args.text, output: audioPath, instruct: args.instructions, ref_audio: reference?.path,
        prompt_audio: continuation?.path, prompt_text: args.continuationText, inference_timesteps: args.steps,
        cfg_value: args.guidance, max_tokens: args.maxTokens };
      const reply = await new Promise<string>((resolve, reject) => {
        const child = execFile(runtime.python, [worker, runtime.model], {
          env: { ...process.env, HF_HUB_OFFLINE: '1' }, timeout: 30 * 60_000, maxBuffer: 4 * 1024 * 1024,
        }, (error, stdout) => error ? reject(error) : resolve(stdout));
        child.stdin!.on('error', reject);
        child.stdin!.end(JSON.stringify(payload) + '\n');
      });
      const result = JSON.parse(reply);
      if (result.error || !result.audio_seconds) throw new Error(result.error || 'Local synthesis returned no audio');
      return { success: true, audioPath, review: 'not_reviewed' as const };
    });
  } finally {
    rmSync(scratch, {recursive: true, force: true});
  }
}
