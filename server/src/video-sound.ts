import { fasth3OmniSchema } from './fasth3-omni.js';
import { DESKTOP_SCHEMAS } from './astra-genai-desktop.js';
/** Sound intent -> supported adapter arguments. Never generates or reviews media. */
import { z } from 'zod';
import * as seedance from './seedance-client.js';
import * as astra from './astra-video-client.js';
import { ltxApiImg2VideoSchema, ltxApiAudio2VideoSchema } from './ltx-api-video.js';
import { minimaxImg2VideoSchema, minimaxReferenceSchema } from './minimax-video.js';
import { heygenImg2VideoSchema, heygenReferenceSchema } from './heygen-video.js';
import { genaiTextToVideoSchema, genaiImageToVideoSchema, genaiAudioToVideoSchema, genaiMsrSchema } from './astra-genai-video.js';

const effectSchema = z.object({
  id: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  trigger: z.string().min(1).optional(),
  delivery: z.enum(['auto', 'native', 'input', 'post']).optional(),
  sfx: z.string().min(1).optional(),
  atSeconds: z.number().finite().nonnegative().optional(),
  separationLu: z.number().finite().min(0).max(30).optional(),
  audience: z.object({ intent: z.string().trim().min(1), caseId: z.string().optional(), release: z.string().optional(), source: z.literal('music').optional(),
    timingBasis: z.string().optional() }).strict().optional(),
  end: z.object({ shotId: z.string().min(1), atSeconds: z.union([z.number().finite().nonnegative(), z.literal('end')]) }).strict().optional(),
  fadeInSeconds: z.number().finite().nonnegative().optional(), fadeOutSeconds: z.number().finite().nonnegative().optional(),
  sourceStartSeconds: z.number().finite().nonnegative().optional(),
  intensity: z.enum(['subtle', 'normal', 'strong']).optional(),
}).strict();
const schemas: Record<string, z.ZodTypeAny> = {
  fasth3_omni_reference: fasth3OmniSchema,
  ...Object.fromEntries(Object.entries(DESKTOP_SCHEMAS).map(([feature,schema]) => ['astra_genai_desktop_' + ({'text-to-video':'text2video','image-to-video':'img2video','audio-to-video':'audio2video'}[feature] || feature),schema])),
  seedance_text2video: seedance.seedanceText2VideoSchema,
  seedance_img2video: seedance.seedanceImg2VideoSchema, seedance_reference: seedance.seedanceReferenceSchema,
  astra_genai_text2video: genaiTextToVideoSchema, astra_genai_img2video: genaiImageToVideoSchema,
  astra_genai_audio2video: genaiAudioToVideoSchema, astra_genai_msr: genaiMsrSchema,
  astra_text2video: astra.astraText2VideoSchema, astra_img2video: astra.astraImg2VideoSchema,
  astra_audio2video: astra.astraAudio2VideoSchema, astra_keyframe_video: astra.astraKeyframeVideoSchema,
  ltx_api_img2video: ltxApiImg2VideoSchema, ltx_api_audio2video: ltxApiAudio2VideoSchema,
  minimax_img2video: minimaxImg2VideoSchema, minimax_reference: minimaxReferenceSchema,
  heygen_img2video: heygenImg2VideoSchema, heygen_reference: heygenReferenceSchema,
};

export function prepareVideoSound(tool: string, input: Record<string, unknown>, sound: Record<string, unknown> = {}) {
  const schema = schemas[tool];
  if (!schema) throw new Error('Unsupported sound adapter: ' + tool);
  z.string().min(1).parse(input.prompt);
  const effects = z.array(effectSchema).parse(sound.effects ?? []);
  for (const effect of effects) if (effect.audience && effect.description &&
      String(input.prompt).toLowerCase().includes(effect.description.toLowerCase()))
    throw new Error('audience_delivery_conflict: remove the post cue description from the video prompt');
  const ids = effects.flatMap(effect => effect.id ? [effect.id] : []);
  if (new Set(ids).size !== ids.length) throw new Error('Effect ids must be unique within the shot');
  if (sound.audioSource !== undefined && !['video', 'speech'].includes(String(sound.audioSource)))
    throw new Error('sound.audioSource must be video or speech');
  const fixedInput = ['astra_audio2video', 'astra_genai_audio2video', 'astra_genai_desktop_audio2video', 'ltx_api_audio2video'].includes(tool);
  // MSR dialogue lives only in MSR's own soundtrack; a TTS speech lane would replace it.
  if (['astra_genai_msr', 'minimax_reference', 'heygen_reference'].includes(tool) && sound.audioSource === 'speech') throw new Error(`${tool} keeps its own spoken soundtrack; sound.audioSource speech is not allowed`);
  let nativeAudio = !fixedInput && (tool !== 'astra_genai_desktop_keyframes' || input.audio === true);
  if (tool.startsWith('seedance_')) {
    const model = input.model ?? seedance.DEFAULT_SEEDANCE_MODEL;
    const spec = seedance.SEEDANCE_MODEL_SPECS[model as seedance.SeedanceModel];
    if (!spec) throw new Error('Unknown Seedance model: ' + String(model));
    nativeAudio = spec.audio;
  }
  const warnings: string[] = [];
  const canGenerateEffects = nativeAudio && input.generateAudio !== false && sound.audioSource !== 'speech';
  const resolved = effects.flatMap(effect => {
    if (effect.audience && (effect.delivery === 'input' || effect.delivery === 'native'))
      throw new Error('audience_delivery_conflict: ' + effect.id + ' belongs in post');
    const delivery = effect.audience ? 'post' : effect.delivery === 'input' ? 'input' : 'native';
    if (!effect.audience && effect.delivery !== 'native' && effect.delivery !== 'input' &&
        (!canGenerateEffects || !effect.description || !effect.trigger)) {
      warnings.push(`Scene effect ${effect.id ?? effect.sfx ?? '(unnamed)'} omitted from post. Describe its action for a video model with native audio.`);
      return [];
    }
    if (delivery === 'native' && (!nativeAudio || input.generateAudio === false))
      throw new Error('Native SFX unavailable in this mode or explicitly disabled');
    if (delivery === 'input' && !fixedInput)
      throw new Error('Input SFX require ASTRA audio2video; reference audio is not a preserved soundtrack');
    if (delivery !== 'post' && sound.audioSource === 'speech')
      throw new Error('Native/input SFX require audioSource=video; replacing it with speech discards the effects');
    if (delivery !== 'post' && (!effect.description || !effect.trigger))
      throw new Error('Native/input effects need description and trigger');
    return [{ ...effect, delivery }];
  });
  const native = resolved.filter(effect => effect.delivery === 'native');
  const conditioned = resolved.filter(effect => effect.delivery === 'input');
  if (sound.audioSource === 'video' && (input.generateAudio === false || (!nativeAudio && !fixedInput)))
    throw new Error('audioSource=video conflicts with a silent output; select speech/post or enable supported audio');
  if (native.length && /Audio:\s*silent\b/i.test(String(input.prompt)))
    throw new Error('Native SFX conflict with Audio: silent in the prompt; revise the authored sound direction');
  const args = { ...input };
  // The genai audio-to-video soundtrack is always the supplied audio; it has no generateAudio switch.
  if ((native.length || conditioned.length || sound.audioSource === 'video') && (tool.startsWith('seedance_') || tool.startsWith('astra_') || tool === 'ltx_api_img2video') && !['astra_genai_audio2video', 'astra_genai_msr'].includes(tool)) {
    if (input.generateAudio === false) throw new Error('Cannot discard the requested input soundtrack');
    if (!tool.startsWith('astra_genai_desktop_')) args.generateAudio = true;
  }
  const clauses = native.map(effect => `${effect.trigger}: ${effect.description}.`);
  const nativePrompt = `Audio: ${clauses.join(' ')} Only diegetic scene sounds.`;
  if (clauses.length && !String(input.prompt).includes(nativePrompt)) args.prompt = `${input.prompt}\n${nativePrompt}`;
  const inputPrompt = `The supplied non-speech sounds come from these actions, not mouths: ${conditioned.map(effect => `${effect.trigger}: ${effect.description}`).join('; ')}.`;
  if (conditioned.length && !String(args.prompt).includes(inputPrompt)) args.prompt = `${args.prompt}\n${inputPrompt}`;
  const parsed = schema.parse(args);
  // Catch caller mistakes even for Zod object schemas that normally strip unknown fields.
  const unknown = Object.keys(args).filter(key => !(key in parsed));
  if (unknown.length) throw new Error('Unsupported adapter arguments: ' + unknown.join(', '));
  const audioSource = native.length || conditioned.length ? 'video' : sound.audioSource;
  if (conditioned.length) warnings.push('Input effects must already be mixed into audioPath. This planner does not synthesize or mix them; inspect their action and mouth alignment.');
  if (resolved.some(effect => effect.delivery === 'post' && (!effect.sfx || effect.atSeconds === undefined)))
    warnings.push('Audience effects need an asset and an observed shot-relative atSeconds before assembly.');
  if (native.length) warnings.push('Native audio is a mixed soundtrack. Do not overlay a second dialogue track; inspect missing or unwanted effects before acceptance.');
  return { tool, arguments: parsed, sound: { ...sound, ...(audioSource ? { audioSource } : {}), effects: resolved },
    capabilities: { nativeAudio, inputAudio: fixedInput ? (['astra_genai_desktop_audio2video', 'ltx_api_audio2video'].includes(tool) ? 'conditioned_reencoded' : 'preserved') : ['seedance_reference', 'fasth3_omni_reference', 'astra_genai_msr', 'minimax_reference', 'heygen_reference'].includes(tool) ? 'reference' : 'none' },
    warnings, review: 'not_reviewed', generated: false };
}
