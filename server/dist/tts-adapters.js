/** One registry of executable adapters. Planning never invokes a provider. */
import { adapterContracts } from './adapter-parameters.js';
import { localVoxSchema, generateLocalVox } from './local-voxcpm2.js';
import { genaiSpeechSchema, generateGenaiSpeech } from './astra-genai-speech.js';
import { z } from 'zod';
import * as gemini from './tts-client.js';
import * as eleven from './elevenlabs-client.js';
import { getTtsModels, resolveTtsModel, speechProvider } from './tts-models.js';
import { validateEpisodeSpeech } from './tts-execution.js';
export const SPEECH_GENERATORS = ['tts_local_voxcpm2', 'tts_astra_genai', 'tts_generate', 'tts_multi_speaker', 'tts_gemini_38', 'tts_elevenlabs_generate', 'tts_elevenlabs_dialogue'];
function adapter(schema, run, describe) {
    return {
        schema,
        prepare(input) {
            const args = schema.parse(input);
            return { args, ...describe(args), run: () => run(args) };
        },
    };
}
const withoutTags = (text) => text.replace(/\[[^\]]*\]/g, '');
const adapters = {
    tts_local_voxcpm2: adapter(localVoxSchema, generateLocalVox, p => ({ spokenText: p.text, singleSpeaker: true })),
    tts_astra_genai: adapter(genaiSpeechSchema, generateGenaiSpeech, p => ({ spokenText: p.text, singleSpeaker: true })),
    tts_generate: adapter(gemini.ttsGenerateSchema, gemini.generateSpeech, p => ({ spokenText: p.text, singleSpeaker: true })),
    tts_multi_speaker: adapter(gemini.ttsMultiSpeakerSchema, gemini.generateDialogue, p => ({ spokenText: p.script.split('\n').map(line => {
            const speaker = p.speakers.find(s => line.trimStart().startsWith(s.speakerName + ':'));
            return speaker ? line.trimStart().slice(speaker.speakerName.length + 1) : line;
        }).join(' '), singleSpeaker: false })),
    tts_gemini_38: adapter(gemini.gemini38TtsSchema, gemini.generateGemini38Speech, p => ({ spokenText: p.turns.map(t => t.text.replace(/<[^>]+>/g, '')).join(' '), singleSpeaker: !p.speakers })),
    tts_elevenlabs_generate: adapter(eleven.elevenLabsGenerateSchema, eleven.generateElevenLabsSpeech, p => ({ spokenText: withoutTags(p.text), singleSpeaker: true })),
    tts_elevenlabs_dialogue: adapter(eleven.elevenLabsDialogueSchema, eleven.generateElevenLabsDialogue, p => ({ spokenText: p.inputs.map(t => withoutTags(t.text)).join(' '), singleSpeaker: false })),
};
export function prepareSpeech(generator, generation) {
    const selected = z.enum(SPEECH_GENERATORS).parse(generator);
    const prepared = adapters[selected].prepare(generation);
    validateEpisodeSpeech(selected, prepared.args);
    const contract = resolveTtsModel(speechProvider(selected), prepared.args.model);
    if (![contract.single, contract.dialogue].includes(selected))
        throw new Error('TTS adapter/model mismatch');
    return { ...prepared, generator: selected };
}
export function speechAdapterContracts(engine, model) {
    const models = getTtsModels().filter(row => row.provider === engine && (!model || row.model === model));
    const rows = SPEECH_GENERATORS.filter(tool => speechProvider(tool) === engine &&
        (engine === 'astra-genai' || models.some(row => row.single === tool || row.dialogue === tool))).map(tool => ({ tool, engine }));
    return adapterContracts('tts', rows, adapters, { engine, model });
}
