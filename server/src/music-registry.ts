import { z } from 'zod';
import { musicClipSchema, musicGenerateSchema, musicAdvancedSchema } from './music-client.js';
import { sunoGenerateSchema, sunoSoundSchema, assertGenerateArgs, SUNO_V6_MODELS } from './suno-client.js';
import { mlxMusicGenerateSchema } from './mlx-serve-client.js';
import { lyriaSongSchema, elevenMusicSchema } from './music-song-client.js';

export const MUSIC_MODELS = [
  { engine: 'lyria', model: 'lyria-3-clip-preview', tool: 'music_generate_song', vocals: true, duration: '30 seconds; fixed', provider: 'Google official' },
  { engine: 'lyria', model: 'lyria-3.5', tool: 'music_generate_song', vocals: true, duration: 'Prompt-directed; measure output', provider: 'Google official' },
  { engine: 'lyria', model: 'models/lyria-realtime-exp', tool: 'music_generate_advanced', vocals: false, duration: '5–300 seconds; local stream collection limit', provider: 'Google official' },
  ...SUNO_V6_MODELS.map(model => ({ engine: 'suno-api', model, tool: 'suno_generate', vocals: true, duration: '10–360 seconds in custom mode', provider: 'sunoapi.org third party, NOT Suno Platform' })),
  ...['music_v2', 'music_v2_5'].map(model => ({ engine: 'elevenlabs', model, tool: 'music_elevenlabs_generate', vocals: true, duration: '3–600 seconds', provider: 'ElevenLabs official' })),
];
interface Adapter { engine: string; schema: z.ZodTypeAny; fixedModel?: string; modelField?: string }
export const MUSIC_ADAPTERS: Record<string, Adapter> = {
  music_generate_clip: { engine: 'lyria', schema: musicClipSchema, fixedModel: 'lyria-3-clip-preview' },
  music_generate_song: { engine: 'lyria', schema: lyriaSongSchema, modelField: 'model' },
  music_generate: { engine: 'lyria', schema: musicGenerateSchema, fixedModel: 'models/lyria-realtime-exp' },
  music_generate_advanced: { engine: 'lyria', schema: musicAdvancedSchema, fixedModel: 'models/lyria-realtime-exp' },
  suno_generate: { engine: 'suno-api', schema: sunoGenerateSchema, modelField: 'model' },
  suno_generate_sound: { engine: 'suno-api', schema: sunoSoundSchema, fixedModel: 'V5' },
  music_elevenlabs_generate: { engine: 'elevenlabs', schema: elevenMusicSchema, modelField: 'modelId' },
  mlx_music_generate: { engine: 'mlx', schema: mlxMusicGenerateSchema, modelField: 'model' },
};
function shape(schema: z.ZodTypeAny): z.ZodRawShape {
  if (schema instanceof z.ZodEffects) return shape(schema.innerType());
  return schema instanceof z.ZodObject ? schema.shape : {};
}
export function parseMusicArgs(tool: string, input: Record<string, unknown>) {
  const adapter = MUSIC_ADAPTERS[tool];
  if (!adapter) throw new Error('music_adapter_unsupported');
  for (const key of Object.keys(input)) if (!Object.hasOwn(shape(adapter.schema), key)) throw new Error('music_argument_unsupported: ' + key);
  const args = adapter.schema.parse(input) as Record<string, unknown>;
  if (tool === 'suno_generate') assertGenerateArgs(sunoGenerateSchema.parse(args));
  if (tool === 'suno_generate_sound') throw new Error('music_model_retired: V5 sound adapter is not verified on the current provider; use a selected V6 instrumental song');
  return args;
}
export function musicCatalog() {
  return { version: 1, revision: '2026-10-18', models: MUSIC_MODELS,
    adapters: Object.entries(MUSIC_ADAPTERS).map(([tool, a]) => ({ tool, engine: a.engine, fixedModel: a.fixedModel, fields: Object.keys(shape(a.schema)) })),
    local: { engine: 'mlx', tool: 'mlx_music_generate', model: 'Exact installed MLX Core music pack ID; no automatic pack selection' },
    unimplemented: [{ engine: 'suno-official', reason: 'Official platform exists; authenticated request schema not verified', source: 'https://platform.suno.com/' },
      { engine: 'lyria-vertex', reason: 'Separate Cloud authentication and predict contract; not a Gemini adapter' }],
    sources: ['https://ai.google.dev/gemini-api/docs/music-generation', 'https://ai.google.dev/gemini-api/docs/realtime-music-generation',
      'https://elevenlabs.io/docs/api-reference/music/compose', 'https://docs.sunoapi.org/suno-api/generate-music'],
  };
}
export function isManagedMusicCall(tool: string, args: unknown): boolean {
  return Object.hasOwn(MUSIC_ADAPTERS, tool) && !!args && typeof args === 'object' && 'musicContext' in args;
}
