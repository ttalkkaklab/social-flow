import { SUPERTONIC_LANGUAGES } from './supertonic-client.js';
import { ELEVENLABS_MODELS } from './elevenlabs-client.js';
import { TTS_VOICES, VALID_TTS_MODELS, GEMINI_38_TTS_MODELS } from './tts-client.js';
import { voiceLockConfigSchema } from './voice-lock-config.js';
import { z } from 'zod';

export const TTS_DEFAULTS = { engine: 'elevenlabs', voiceId: 'L4az9Gb378GIycFl2nAB', model: 'eleven_multilingual_v2', speed: 1, language: 'ko' } as const;

export function normalizeCharacterLanguage(value: string): string {
  const raw=value.trim().toLowerCase();
  return ({korean:'ko',english:'en',japanese:'ja',chinese:'zh',spanish:'es',french:'fr',portuguese:'pt'} as Record<string,string>)[raw] || raw;
}
const ttsFields = {
  voiceLock: voiceLockConfigSchema.optional(),
  engine: z.enum(['gemini', 'supertonic', 'elevenlabs', 'mlx']),
  voiceId: z.string().trim().min(1).max(128),
  model: z.string().trim().min(1).max(128).optional(),
  speed: z.number().min(0.7).max(1.2),
  language: z.string().trim().min(1).max(32).transform(normalizeCharacterLanguage).refine(v => /^[a-z]{2}$/.test(v), 'Use a two-letter language code or supported language name'),
  stylePrompt: z.string().trim().min(1).max(1000).optional(),
};
export const ttsSchema = z.object(ttsFields).superRefine((tts, ctx) => {
  if (tts.engine === 'supertonic' && !/^[MF][1-5]$/.test(tts.voiceId)) ctx.addIssue({ code: 'custom', path: ['voiceId'], message: 'Supertonic voiceId must be M1–M5 or F1–F5' });
  if (tts.engine === 'gemini' && !Object.hasOwn(TTS_VOICES, tts.voiceId)) ctx.addIssue({ code: 'custom', path: ['voiceId'], message: 'Unknown Gemini voiceId' });
  const issue=(field: string, message: string) => ctx.addIssue({code:'custom',path:[field],message});
  if (tts.engine === 'supertonic' && !(SUPERTONIC_LANGUAGES as readonly string[]).includes(tts.language)) issue('language','Unsupported Supertonic language');
  if (['gemini','mlx'].includes(tts.engine) && tts.speed !== 1) issue('speed','This engine supports character speed 1 only');
  if (tts.engine === 'supertonic' && tts.model !== undefined) issue('model','Supertonic has no selectable model');
  if (tts.engine === 'gemini' && tts.model !== undefined && !([...VALID_TTS_MODELS,...GEMINI_38_TTS_MODELS] as readonly string[]).includes(tts.model)) issue('model','Unsupported Gemini model');
  if (tts.engine === 'elevenlabs' && tts.model !== undefined && !(ELEVENLABS_MODELS as readonly string[]).includes(tts.model)) issue('model','Unsupported ElevenLabs model');
  if (tts.engine === 'elevenlabs' && !/^[A-Za-z0-9_-]{1,64}$/.test(tts.voiceId)) issue('voiceId','Invalid ElevenLabs voiceId');
  if (tts.stylePrompt !== undefined && (tts.engine !== 'gemini' || tts.model?.startsWith('gemini-3.8-'))) issue('stylePrompt','This engine does not accept stylePrompt');

});
