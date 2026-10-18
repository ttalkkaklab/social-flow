import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SEEDANCE_MODEL_SPECS, type SeedanceModel } from './seedance-client.js';

const load = createRequire(import.meta.url);
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) :
  value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, stable(v)])) : value;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const fileHash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

interface VoiceContext {
  episode: string;
  board: Record<string, unknown>;
  shot: Record<string, unknown>;
}
interface SpeakerVoice {
  speaker: string;
  name: string;
  tts: Record<string, unknown>;
  description: string;
  reference?: { path: string; sha256: string; provenance: string };
  audioIndex?: number;
  imageIndices?: number[];
}
export interface VoiceContinuity {
  version: 1;
  strategy: 'external_tts' | 'supplied_audio' | 'reference_voice' | 'prompt_voice';
  revision: string;
  speakers: SpeakerVoice[];
  warnings: string[];
  review: { voiceIdentity: 'not_reviewed'; dialogue: 'not_reviewed'; speakerAssignment: 'not_reviewed'; lipSync: 'not_reviewed' };
}

/** Reuse authored acoustic traits; never infer a voice from a name, face or TTS ID. */
function voiceDescription(character: Record<string, unknown>): string {
  const tts = object(character.tts), speech = object(object(character.character).speech);
  const confirmed = (key: string) => {
    const field = object(speech[key]);
    return field.status === 'confirmed' ? text(field.value) : '';
  };
  return [text(tts.language) && `Language: ${text(tts.language)}`,
    confirmed('timbre') && `Timbre: ${confirmed('timbre')}`,
    confirmed('pace') && `Baseline pace/accent: ${confirmed('pace')}`,
    text(tts.voiceDirection) || text(tts.stylePrompt)].filter(Boolean).join('. ');
}

function voiceReference(character: Record<string, unknown>, context: VoiceContext, warnings: string[]): SpeakerVoice['reference'] {
  const declared = object(character.voiceReference);
  if (character.voiceReferenceWarning && !declared.path) {
    warnings.push(`${character.id}: ${character.voiceReferenceWarning}; restore the selected sample instead of substituting an old voice.wav.`);
    return undefined;
  }
  let file = text(declared.path);
  if (file) {
    // Character handoff paths are relative to scenes.js, like other cast assets.
    file = path.resolve(context.episode, 'storyboard', file);
    if (declared.tts && hash(declared.tts) !== hash(character.tts))
      throw new Error(`voice_reference_stale: ${character.id} sample uses different pinned TTS settings`);
  } else if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text(character.id))) {
    let channel = context.episode;
    while (!existsSync(path.join(channel, 'profile.md')) && path.dirname(channel) !== channel) channel = path.dirname(channel);
    const identity = path.join(channel, 'assets/characters', text(character.id), 'identity.md');
    const candidate = path.join(path.dirname(identity), 'voice.wav');
    if (existsSync(identity) && existsSync(candidate)) {
      const { identityVoice } = load('../../skills/_shared/character-voice.js');
      if (hash(identityVoice(readFileSync(identity, 'utf8'))) !== hash(character.tts)) {
        warnings.push(`${character.id}: shared voice.wav belongs to different current TTS settings; attach a sample for this episode's pinned voice.`);
        return undefined;
      }
      file = candidate;
    }
  }
  if (!file) return undefined;
  const absolute = realpathSync(file), sha256 = fileHash(absolute);
  if (declared.sha256 && declared.sha256 !== sha256) throw new Error(`voice_reference_stale: ${character.id} sample bytes changed`);
  const provenance = declared.tts && declared.sha256 ? 'pinned_settings_and_bytes' : 'legacy_sample_unverified';
  if (provenance === 'legacy_sample_unverified') warnings.push(`${character.id}: sample identity is unverified; a file name or hash is not a listening review.`);
  return { path: absolute, sha256, provenance };
}

/** Prepare provider arguments before schema validation and pricing. No synthesis or uploads. */
export function prepareVideoVoice(tool: string, input: Record<string, unknown>, context: VoiceContext): {
  args: Record<string, unknown>; voiceContinuity?: VoiceContinuity;
} {
  const args = { ...input };
  const lines = (Array.isArray(context.shot.narration) ? context.shot.narration : []).map(object).filter(line => text(line.tts));
  if (!lines.length) return { args };
  const doc = object(context.board.SB_DOC), raw = doc.characters;
  const characters: Record<string, unknown>[] = Array.isArray(raw) ? raw.map(object) : Object.entries(object(raw)).map(([id, value]) => ({ ...object(value), id }));
  const visual = object(context.shot.visual);
  const nativeSlot = Boolean(visual.clip) || context.shot.type === 'broll';
  const audible = tool.startsWith('veo_') || tool.startsWith('omni_') ||
    (tool.startsWith('astra_') ? args.generateAudio !== false : args.generateAudio === true);
  const native = tool !== 'astra_audio2video' && audible && (nativeSlot || lines.some(line => line.delivery === 'on_screen'));
  const spec = SEEDANCE_MODEL_SPECS[args.model as SeedanceModel];
  const limitedPromptLanguage = tool.startsWith('seedance_') && !String(args.model).includes('2-5');
  const reference = native && tool === 'seedance_reference' && Boolean(spec?.referenceAudio);
  const strategy = tool === 'astra_audio2video' ? 'supplied_audio' : reference ? 'reference_voice' : native ? 'prompt_voice' : 'external_tts';
  const warnings: string[] = [];
  const speakers: SpeakerVoice[] = [];
  const nativeLines = nativeSlot ? lines : lines.filter(line => line.delivery === 'on_screen');
  const ids = [...new Set((native ? nativeLines : lines).map(line => text(line.speaker) || text(doc.narratorCharacterId)))];
  const prompt: string[] = [];
  const audioPaths = Array.isArray(args.referenceAudioPaths) ? args.referenceAudioPaths.map(value => realpathSync(path.resolve(context.episode, String(value)))) : [];
  const imagePaths = Array.isArray(args.referenceImagePaths) ? args.referenceImagePaths.map(value => realpathSync(path.resolve(context.episode, String(value)))) : [];
  for (const id of ids) {
    const matches = characters.filter(character => character.id === id);
    if (!id || matches.length !== 1 || !Object.keys(object(matches[0].tts)).length) {
      warnings.push(`Missing unique pinned voice for speaker ${id || '(unspecified)'}; no voice was invented.`);
      continue;
    }
    const character = matches[0];
    const speaker: SpeakerVoice = { speaker: id, name: text(character.name) || id, tts: object(character.tts), description: voiceDescription(character) };
    const label = limitedPromptLanguage && /[가-힣]/.test(speaker.name) ? id : speaker.name;
    if (reference) {
      speaker.reference = voiceReference(character, context, warnings);
      if (speaker.reference) {
        let index = audioPaths.indexOf(speaker.reference.path);
        if (index < 0) { index = audioPaths.length; audioPaths.push(speaker.reference.path); }
        speaker.audioIndex = index + 1;
        // Only map images with explicit ownership, never guess from array position.
        const owned = object(character.voiceReference).imagePaths;
        const ownedPaths = Array.isArray(owned) ? owned.map(value => realpathSync(path.resolve(context.episode, 'storyboard', String(value)))) : [];
        speaker.imageIndices = imagePaths.flatMap((file, i) => ownedPaths.includes(file) ? [i + 1] : []);
        if (imagePaths.length && !speaker.imageIndices.length) warnings.push(`${id}: no explicit image ownership matched the request; add voiceReference.imagePaths to bind this speaker to the correct Image N.`);
        const marker = String(args.model).includes('2-5') ? '@' : '';
        const images = speaker.imageIndices.map(i => `${marker}Image ${i}`).join(', ');
        prompt.push(`${label} (speaker ${id})${images ? `, shown in ${images},` : ''} uses ${marker}Audio ${speaker.audioIndex} for voice timbre and accent only. Speak the authored shot dialogue, not the sample's words.`);
      } else warnings.push(`${id}: no pinned voice sample available; reference-voice consistency is not established. Supply character.voiceReference before relying on this voice.`);
    }
    speakers.push(speaker);
    if (native && speaker.description) {
      if (limitedPromptLanguage && /[가-힣]/.test(speaker.description)) warnings.push(`${id}: supply an English or Chinese translation of the pinned acoustic description in the authored prompt; this Seedance schema rejects Korean direction text. The original description stays in this plan.`);
      else prompt.push(`Stable voice for ${label} (speaker ${id}): ${speaker.description}`);
    }
    if (native && !text(object(character.tts).voiceDirection) && !text(object(character.tts).stylePrompt) && !text(object(object(object(character.character).speech).timbre).value))
      warnings.push(`${id}: no authored acoustic description; the TTS voice ID is not a video-model voice selector.`);
  }
  if (reference) {
    args.referenceAudioPaths = audioPaths;
    const mapped = new Set(speakers.map(speaker => speaker.audioIndex));
    if (audioPaths.some((_, i) => !mapped.has(i + 1))) warnings.push('Some supplied audio references have no character mapping; retain their existing role (for example music) explicitly in the prompt.');
    if (speakers.some(speaker => speaker.reference)) {
      prompt.push('Keep the authored visual roles of reference videos, but do not inherit their voices or dialogue. Use the mapped audio references for speaker identity; keep music and effects separate from speech. Keep each speaker assigned to their own voice reference.');
      warnings.push('Reference voice is imitation, not preservation of the original WAV or exact speech timing.');
    }
  }
  if (native) {
    prompt.push('Keep these speaker identities unchanged. Apply each line\'s authored emotion separately from stable timbre and accent. Keep non-speaking listeners silent; do not invent dialogue or voiceover.');
    if (speakers.length > 1) warnings.push('Multiple speakers: check assignment and turn-taking separately from timbre; short turns reduce ambiguity but are not a guarantee.');
    if (!nativeSlot) warnings.push('visual.video assembly uses the external TTS track. Native voice guidance does not synchronize that WAV; use audio2video for exact supplied-speech staging or the existing visual.clip native-audio slot.');
  }
  if (tool === 'veo_extension') warnings.push('Veo voice continuation needs speech in the last second of the source clip; this planner has not listened to that boundary.');
  if (tool.startsWith('veo_') && native) warnings.push('Veo has no audio-reference input. Reuse the same voice description; prompt guidance cannot lock a TTS voice ID.');
  if (tool.startsWith('omni_') && native) {
    warnings.push('Omni API does not support Flow @Voice ingredients or uploaded audio references. Reference-video audio cannot lock the speaker.');
    if (tool === 'omni_extend' && !args.previousInteractionId) throw new Error('Omni spoken continuation requires previousInteractionId, not a re-uploaded speaking clip');
    if (args.previousInteractionId) warnings.push('Continue the original stored interaction for dialogue; voice continuity remains unreviewed.');
  }
  if (strategy === 'supplied_audio') warnings.push('Use the final composed pinned-voice WAV. ASTRA re-encodes supplied audio; mouth motion and speaker identity remain unreviewed.');
  if (prompt.length && typeof args.prompt === 'string') args.prompt += '\n\nVoice continuity guidance:\n' + prompt.join('\n');
  return { args, voiceContinuity: { version: 1, strategy, speakers, warnings,
    revision: hash({ lines, speakers, strategy, performance: context.shot.performance }),
    review: { voiceIdentity: 'not_reviewed', dialogue: 'not_reviewed', speakerAssignment: 'not_reviewed', lipSync: 'not_reviewed' } } };
}
