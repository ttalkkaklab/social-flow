/** One registry of executable adapters. Planning never invokes a provider. */
import { z } from 'zod';
import * as gemini from './tts-client.js';
import * as eleven from './elevenlabs-client.js';
import { resolveTtsModel } from './tts-models.js';
export const SPEECH_GENERATORS = ['tts_generate', 'tts_multi_speaker', 'tts_gemini_38', 'tts_elevenlabs_generate', 'tts_elevenlabs_dialogue'];
function adapter(schema, run, describe) {
    return (input) => {
        const args = schema.parse(input);
        return { args, ...describe(args), run: () => run(args) };
    };
}
const withoutTags = (text) => text.replace(/\[[^\]]*\]/g, '');
const adapters = {
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
    const prepared = adapters[selected](generation);
    const contract = resolveTtsModel(selected.startsWith('tts_elevenlabs_') ? 'elevenlabs' : 'gemini', prepared.args.model);
    if (![contract.single, contract.dialogue].includes(selected))
        throw new Error('TTS adapter/model mismatch');
    return { ...prepared, generator: selected };
}
