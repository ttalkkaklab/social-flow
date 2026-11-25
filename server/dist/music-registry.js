import { z } from 'zod';
import { musicClipSchema, musicGenerateSchema, musicAdvancedSchema } from './music-client.js';
import { sunoGenerateSchema, sunoSoundSchema, assertGenerateArgs, SUNO_V6_MODELS, SUNO_SOUND_UNVERIFIED } from './suno-client.js';
import { mlxMusicGenerateSchema } from './mlx-serve-client.js';
import { lyriaSongSchema, elevenMusicSchema } from './music-song-client.js';
import { adapterContracts } from './adapter-parameters.js';
export const MUSIC_MODELS = [
    { engine: 'lyria', model: 'lyria-3-clip-preview', tool: 'music_generate_song', vocals: true, duration: '30 seconds; fixed', provider: 'Google official' },
    { engine: 'lyria', model: 'lyria-3.5', tool: 'music_generate_song', vocals: true, duration: 'Prompt-directed; measure output', provider: 'Google official' },
    { engine: 'lyria', model: 'models/lyria-realtime-exp', tool: 'music_generate_advanced', vocals: false, duration: '5–300 seconds; local stream collection limit', provider: 'Google official' },
    ...SUNO_V6_MODELS.map(model => ({ engine: 'suno-api', model, tool: 'suno_generate', vocals: true, duration: '10–360 seconds in custom mode', provider: 'sunoapi.org third party, NOT Suno Platform' })),
    ...['music_v2', 'music_v2_5'].map(model => ({ engine: 'elevenlabs', model, tool: 'music_elevenlabs_generate', vocals: true, duration: '3–600 seconds', provider: 'ElevenLabs official' })),
];
export const MUSIC_ADAPTERS = {
    music_generate_clip: { engine: 'lyria', schema: musicClipSchema, fixedModel: 'lyria-3-clip-preview',
        purpose: 'Generate a fixed 30-second Google Lyria clip from a single prompt.' },
    music_generate_song: { engine: 'lyria', schema: lyriaSongSchema, modelField: 'model',
        purpose: 'Generate an instrumental or vocal track with Google Lyria Clip or 3.5, with optional lyrics.' },
    music_generate: { engine: 'lyria', schema: musicGenerateSchema, fixedModel: 'models/lyria-realtime-exp',
        purpose: 'Generate a Google Lyria RealTime instrumental from one prompt for a requested duration.' },
    music_generate_advanced: { engine: 'lyria', schema: musicAdvancedSchema, fixedModel: 'models/lyria-realtime-exp',
        purpose: 'Blend weighted prompts and adjust musical controls for a Google Lyria RealTime instrumental.' },
    suno_generate: { engine: 'suno-api', schema: sunoGenerateSchema, modelField: 'model',
        purpose: 'Generate two song variants through the third-party sunoapi.org V6 API.' },
    suno_generate_sound: { engine: 'suno-api', schema: sunoSoundSchema, modelField: 'model',
        purpose: 'Disabled. The sunoapi.org sounds API has no documented way to retrieve the finished audio.' },
    music_elevenlabs_generate: { engine: 'elevenlabs', schema: elevenMusicSchema, modelField: 'modelId',
        purpose: 'Generate an ElevenLabs music track from a prompt or a section-by-section composition plan.' },
    mlx_music_generate: { engine: 'mlx', schema: mlxMusicGenerateSchema, modelField: 'model',
        purpose: 'Generate music locally with the selected MLX Core music pack.' },
};
function shape(schema) {
    if (schema instanceof z.ZodEffects)
        return shape(schema.innerType());
    return schema instanceof z.ZodObject ? schema.shape : {};
}
export function parseMusicArgs(tool, input) {
    const adapter = MUSIC_ADAPTERS[tool];
    if (!adapter)
        throw new Error('music_adapter_unsupported');
    for (const key of Object.keys(input))
        if (!Object.hasOwn(shape(adapter.schema), key))
            throw new Error('music_argument_unsupported: ' + key);
    const args = adapter.schema.parse(input);
    if (tool === 'suno_generate')
        assertGenerateArgs(sunoGenerateSchema.parse(args));
    if (tool === 'suno_generate_sound')
        throw new Error(SUNO_SOUND_UNVERIFIED);
    return args;
}
/** One engine's adapters, and those serving one model when named, each with its parameters as JSON Schema: shared names apart from its own. */
export function musicAdapterContracts(engine, model) {
    const known = model === undefined || engine === 'mlx' || MUSIC_MODELS.some(row => row.engine === engine && row.model === model);
    const matches = musicCatalog().adapters.filter(row => {
        if (!known || row.engine !== engine)
            return false;
        if (model === undefined)
            return true;
        if (row.fixedModel)
            return row.fixedModel === model;
        const { schema, modelField } = MUSIC_ADAPTERS[row.tool];
        return !!modelField && shape(schema)[modelField].safeParse(model).success;
    });
    return adapterContracts('music', matches, MUSIC_ADAPTERS, { engine, model });
}
export function musicCatalog() {
    return { version: 1, revision: '2026-11-25', models: MUSIC_MODELS,
        noGeneration: { engine: 'none' },
        adapters: Object.entries(MUSIC_ADAPTERS).map(([tool, a]) => ({ tool, engine: a.engine, purpose: a.purpose, fixedModel: a.fixedModel, fields: Object.keys(shape(a.schema)) })),
        local: { engine: 'mlx', tool: 'mlx_music_generate', model: 'Exact installed MLX Core music pack ID; no automatic pack selection' },
        unimplemented: [{ engine: 'suno-official', reason: 'Official platform exists; authenticated request schema not verified', source: 'https://platform.suno.com/' },
            { engine: 'lyria-vertex', reason: 'Separate Cloud authentication and predict contract; not a Gemini adapter' }],
        sources: ['https://aistudio.google.com/docs/music-generation', 'https://aistudio.google.com/docs/realtime-music-generation',
            'https://elevenlabs.io/docs/api-reference/music/compose', 'https://docs.sunoapi.org/suno-api/generate-music'],
    };
}
export function isManagedMusicCall(tool, args) {
    return Object.hasOwn(MUSIC_ADAPTERS, tool) && !!args && typeof args === 'object' && 'musicContext' in args;
}
