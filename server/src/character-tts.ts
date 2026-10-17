import { ELEVENLABS_MODELS } from './elevenlabs-client.js';
import { TTS_VOICES, VALID_TTS_MODELS, GEMINI_38_TTS_MODELS } from './tts-client.js';
import { voiceLockConfigSchema } from './voice-lock-config.js';
import { z } from 'zod';

export const TTS_DEFAULTS = { engine: 'elevenlabs', voiceId: 'L4az9Gb378GIycFl2nAB', model: 'eleven_v4', speed: 1, language: 'ko' } as const;

export function normalizeCharacterLanguage(value: string): string {
  const raw=value.trim().toLowerCase();
  return ({korean:'ko',english:'en',japanese:'ja',chinese:'zh',spanish:'es',french:'fr',portuguese:'pt'} as Record<string,string>)[raw] || raw;
}
const ttsFields = {
  voiceLock: voiceLockConfigSchema.optional(),
  engine: z.enum(['gemini', 'elevenlabs']),
  voiceId: z.string().trim().min(1).max(300),
  model: z.string().trim().min(1).max(128).optional(),
  speed: z.number().min(0.7).max(1.2),
  language: z.string().trim().min(1).max(32).transform(normalizeCharacterLanguage).refine(v => /^[a-z]{2}$/.test(v), 'Use a two-letter language code or supported language name'),
  stability: z.number().min(0).max(1).optional(),
  similarity: z.number().min(0).max(1).optional(),
  stylePrompt: z.string().trim().min(1).max(1000).optional(),
  voiceDirection: z.string().trim().min(1).max(400).optional(),
};
export const ttsSchema = z.object(ttsFields).superRefine((tts, ctx) => {
  if (tts.engine === 'gemini' && !Object.hasOwn(TTS_VOICES, tts.voiceId) && !(tts.model?.startsWith('gemini-3.8-') && /^[A-Za-z][A-Za-z0-9_-]*$/.test(tts.voiceId))) ctx.addIssue({ code: 'custom', path: ['voiceId'], message: 'Unknown Gemini voiceId' });
  const issue=(field: string, message: string) => ctx.addIssue({code:'custom',path:[field],message});
  if (['gemini','elevenlabs'].includes(tts.engine) && tts.speed !== 1) issue('speed','This engine supports character speed 1 only');
  if (tts.engine === 'gemini' && tts.model !== undefined && !([...VALID_TTS_MODELS,...GEMINI_38_TTS_MODELS] as readonly string[]).includes(tts.model)) issue('model','Unsupported Gemini model');
  if (tts.engine === 'elevenlabs' && tts.model !== undefined && !(ELEVENLABS_MODELS as readonly string[]).includes(tts.model)) issue('model','Unsupported ElevenLabs model');
  if (tts.engine === 'elevenlabs' && !/^[A-Za-z0-9_-]{1,64}$/.test(tts.voiceId)) issue('voiceId','Invalid ElevenLabs voiceId');
  if (tts.engine !== 'elevenlabs') for (const key of ['stability', 'similarity'] as const) if (tts[key] !== undefined) issue(key, 'This setting is only supported by ElevenLabs');
  if (tts.stylePrompt !== undefined && (tts.engine !== 'gemini' || tts.model?.startsWith('gemini-3.8-'))) issue('stylePrompt','This engine does not accept stylePrompt');
  if (tts.voiceDirection !== undefined && tts.engine !== 'gemini') issue('voiceDirection','Stable free-text voice direction is supported by Gemini only; match other engines by voice ID');

});
