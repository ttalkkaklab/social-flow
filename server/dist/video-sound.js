/** Sound intent -> supported adapter arguments. Never generates or reviews media. */
import { z } from 'zod';
import * as veo from './video-client.js';
import * as seedance from './seedance-client.js';
import * as astra from './astra-video-client.js';
import * as omni from './omni-client.js';
const effectSchema = z.object({
    id: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    trigger: z.string().min(1).optional(),
    delivery: z.enum(['auto', 'native', 'input', 'post']).optional(),
    sfx: z.string().min(1).optional(),
    atSeconds: z.number().finite().nonnegative().optional(),
    separationLu: z.number().finite().min(0).max(30).optional(),
    intensity: z.enum(['subtle', 'normal', 'strong']).optional(),
}).strict();
const schemas = {
    veo_text2video: veo.text2VideoSchema, veo_img2video: veo.img2VideoSchema,
    veo_reference: veo.referenceVideoSchema, veo_extension: veo.videoExtensionSchema,
    seedance_text2video: seedance.seedanceText2VideoSchema,
    seedance_img2video: seedance.seedanceImg2VideoSchema, seedance_reference: seedance.seedanceReferenceSchema,
    astra_text2video: astra.astraText2VideoSchema, astra_img2video: astra.astraImg2VideoSchema,
    astra_audio2video: astra.astraAudio2VideoSchema, astra_keyframe_video: astra.astraKeyframeVideoSchema,
    omni_text2video: omni.omniText2VideoSchema, omni_img2video: omni.omniImg2VideoSchema,
    omni_extend: omni.omniExtendSchema, omni_edit: omni.omniEditSchema,
};
export function prepareVideoSound(tool, input, sound = {}) {
    const schema = schemas[tool];
    if (!schema)
        throw new Error('Unsupported sound adapter: ' + tool);
    z.string().min(1).parse(input.prompt);
    const effects = z.array(effectSchema).parse(sound.effects ?? []);
    const ids = effects.flatMap(effect => effect.id ? [effect.id] : []);
    if (new Set(ids).size !== ids.length)
        throw new Error('Effect ids must be unique within the shot');
    if (sound.audioSource !== undefined && !['video', 'speech'].includes(String(sound.audioSource)))
        throw new Error('sound.audioSource must be video or speech');
    const fixedInput = tool === 'astra_audio2video';
    let nativeAudio = !fixedInput;
    if (tool.startsWith('seedance_')) {
        const model = input.model ?? (tool === 'seedance_reference' ? seedance.DEFAULT_SEEDANCE_REFERENCE_MODEL : seedance.DEFAULT_SEEDANCE_MODEL);
        const spec = seedance.SEEDANCE_MODEL_SPECS[model];
        if (!spec)
            throw new Error('Unknown Seedance model: ' + String(model));
        nativeAudio = spec.audio;
    }
    const resolved = effects.map(effect => {
        // An existing asset cue is a legacy post effect. Only new described intent opts into auto.
        const requested = effect.delivery ?? (effect.sfx ? 'post' : 'auto');
        const delivery = requested === 'auto'
            ? nativeAudio && input.generateAudio !== false && sound.audioSource !== 'speech' ? 'native' : 'post'
            : requested;
        if (delivery === 'native' && (!nativeAudio || input.generateAudio === false))
            throw new Error('Native SFX unavailable in this mode or explicitly disabled; use post');
        if (delivery === 'input' && !fixedInput)
            throw new Error('Input SFX require ASTRA audio2video; reference audio is not a preserved soundtrack');
        if (delivery !== 'post' && sound.audioSource === 'speech')
            throw new Error('Native/input SFX require audioSource=video; replacing it with speech discards the effects');
        if (delivery !== 'post' && (!effect.description || !effect.trigger))
            throw new Error('Native/input effects need description and trigger');
        return { ...effect, delivery };
    });
    const native = resolved.filter(effect => effect.delivery === 'native');
    const conditioned = resolved.filter(effect => effect.delivery === 'input');
    if (sound.audioSource === 'video' && (input.generateAudio === false || (!nativeAudio && !fixedInput)))
        throw new Error('audioSource=video conflicts with a silent output; select speech/post or enable supported audio');
    if (native.length && /Audio:\s*silent\b/i.test(String(input.prompt)))
        throw new Error('Native SFX conflict with Audio: silent in the prompt; revise the authored sound direction');
    if (sound.sfx && resolved.some(effect => effect.delivery !== 'post' && effect.sfx === sound.sfx))
        throw new Error('The same effect cannot belong to the native/input soundtrack and the legacy post cue');
    const args = { ...input };
    if ((native.length || conditioned.length || sound.audioSource === 'video') && (tool.startsWith('seedance_') || tool.startsWith('astra_'))) {
        if (input.generateAudio === false)
            throw new Error('Cannot discard the requested input soundtrack');
        args.generateAudio = true;
    }
    const clauses = native.map(effect => `${effect.trigger}: ${effect.description}.`);
    const nativePrompt = `Audio: ${clauses.join(' ')} Only diegetic scene sounds.`;
    if (clauses.length && !String(input.prompt).includes(nativePrompt))
        args.prompt = `${input.prompt}\n${nativePrompt}`;
    const inputPrompt = `The supplied non-speech sounds come from these actions, not mouths: ${conditioned.map(effect => `${effect.trigger}: ${effect.description}`).join('; ')}.`;
    if (conditioned.length && !String(args.prompt).includes(inputPrompt))
        args.prompt = `${args.prompt}\n${inputPrompt}`;
    const parsed = schema.parse(args);
    // Catch caller mistakes even for Zod object schemas that normally strip unknown fields.
    const unknown = Object.keys(args).filter(key => !(key in parsed));
    if (unknown.length)
        throw new Error('Unsupported adapter arguments: ' + unknown.join(', '));
    const audioSource = native.length || conditioned.length ? 'video' : sound.audioSource;
    const warnings = [];
    if (conditioned.length)
        warnings.push('Input effects must already be mixed into audioPath. This planner does not synthesize or mix them; inspect their action and mouth alignment.');
    if (resolved.some(effect => effect.delivery === 'post' && (!effect.sfx || effect.atSeconds === undefined)))
        warnings.push('Post effects need an asset and an observed shot-relative atSeconds before assembly.');
    if (native.length)
        warnings.push('Native audio is a mixed soundtrack. Do not overlay a second dialogue track; inspect missing or unwanted effects before acceptance.');
    return { tool, arguments: parsed, sound: { ...sound, ...(audioSource ? { audioSource } : {}), effects: resolved },
        capabilities: { nativeAudio, inputAudio: fixedInput ? 'preserved' : tool === 'seedance_reference' ? 'reference' : 'none' },
        warnings, review: 'not_reviewed', generated: false };
}
