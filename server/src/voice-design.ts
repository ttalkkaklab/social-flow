import { z } from 'zod';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { requireGeminiKey } from './config.js';
import { requestRaw } from './http.js';
import { GEMINI_38_TTS_MODELS, describeGemini38Error } from './tts-client.js';

/** Voice identity creation is separate from per-turn delivery styling. */
export const voiceDesignSchema = z.object({
  model: z.enum(GEMINI_38_TTS_MODELS),
  displayName: z.string().trim().min(1).max(100),
  prompt: z.string().trim().min(1).max(4000),
  languageCode: z.string().trim().min(1),
  gender: z.enum(['male', 'female', 'neutral']),
  baseVoice: z.string().trim().min(1).max(300).optional(),
  outputPath: z.string().trim().min(1),
}).strict();

export function buildVoiceDesignBody(args: z.infer<typeof voiceDesignSchema>) {
  return { store: true, voice: {
    model: args.model, type: 'prompted', display_name: args.displayName,
    gender: args.gender, language_code: args.languageCode,
    prompted: { input: args.prompt, ...(args.baseVoice ? { base_voice: args.baseVoice } : {}) },
  } };
}

/** One paid creation; preserve remote identity even when preview validation fails. */
export async function designGeminiVoice(input: z.infer<typeof voiceDesignSchema>) {
  const args = voiceDesignSchema.parse(input);
  const output = resolve(args.outputPath);
  const receiptPath = resolve(output, 'voice-design.json');
  const samplePath = resolve(output, 'voice-preview.wav');
  const body = buildVoiceDesignBody(args);
  const apiKey = requireGeminiKey();
  mkdirSync(output, { recursive: true });
  if (existsSync(samplePath)) throw new Error('Preview already exists; use a new outputPath.');
  // Exclusive receipt also prevents duplicate calls following a timeout or interruption.
  writeFileSync(receiptPath, JSON.stringify({ status: 'submitted', request: body, submittedAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
  const response = await requestRaw('post', 'https://generativelanguage.googleapis.com/v1beta/voices',
    { 'x-goog-api-key': apiKey }, body, 120_000);
  if (!response.ok) {
    const error = describeGemini38Error(response.status, response.body);
    writeFileSync(receiptPath, JSON.stringify({ status: response.status >= 500 ? 'uncertain' : 'failed', request: body, error }, null, 2));
    return { success: false, receiptPath, error, instruction: 'Do not blindly retry: inspect this receipt and list stored prompted voices first.' };
  }
  let voice: Record<string, unknown>;
  try { voice = JSON.parse(response.body) as Record<string, unknown>; }
  catch {
    writeFileSync(receiptPath, JSON.stringify({ status: 'uncertain', request: body, error: 'Invalid JSON response' }, null, 2));
    return { success: false, receiptPath, error: 'Invalid JSON response; reconcile stored voices before retrying.' };
  }
  const { sample_audio: sample, ...metadata } = voice;
  const record = { status: 'created', request: body, voice: metadata, reviewStatus: 'not_reviewed', billingStatus: 'provider_usage_not_invoice' };
  writeFileSync(receiptPath, JSON.stringify(record, null, 2));
  const audio = z.object({ mime_type: z.string(), data: z.string().min(1) }).safeParse(sample);
  const bytes = audio.success ? Buffer.from(audio.data.data, 'base64') : Buffer.alloc(0);
  if (typeof voice.id !== 'string' || !voice.id.startsWith('voice_') || !audio.success ||
      audio.data.mime_type !== 'audio/wav' || bytes.length <= 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    return { success: false, voiceId: voice.id, receiptPath, error: 'Voice response or WAV preview invalid; the remote voice may exist. Inspect the receipt before another paid creation.' };
  }
  writeFileSync(samplePath, bytes, { flag: 'wx' });
  const audioSha256 = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(receiptPath, JSON.stringify({ ...record, samplePath, audioSha256 }, null, 2));
  return { success: true, voiceId: voice.id, model: args.model, samplePath, audioSha256, receiptPath,
    expireTime: voice.expire_time, usage: voice.usage ?? null, reviewStatus: 'not_reviewed',
    instruction: 'Use this voiceId with tts_gemini_38 for the character sample and dialogue. A generated preview is not proof of perceived age. Preserve the receipt and previous identity; apply within the user-authorized scope.' };
}
