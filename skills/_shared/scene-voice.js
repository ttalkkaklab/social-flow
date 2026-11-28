'use strict';

const path = require('node:path');
const {createHash} = require('node:crypto');
const {existsSync,readFileSync,realpathSync} = require('node:fs');
const {isDeepStrictEqual} = require('node:util');
const {handoff} = require('../channel/references/character-sheet.js');
const {requiredCharacters} = require('./scene-cast.js');
const {normalizeLanguage} = require('./character-voice.js');

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = value => typeof value === 'string' ? value.trim() : '';
const fileHash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
// Storyboard settings may come from a VM with different object prototypes.
const sameSettings = (a,b) => isDeepStrictEqual(JSON.parse(JSON.stringify(a ?? null)),JSON.parse(JSON.stringify(b ?? null)));

function channelRoot(boardDir) {
  let channel=path.resolve(boardDir);
  while (!existsSync(path.join(channel,'profile.md')) && path.dirname(channel)!==channel) channel=path.dirname(channel);
  return channel;
}

/** Story-first boards can carry only a cast id and name; resolve their selected voice at planning time. */
function resolveCharacterVoice(character, boardDir, shot, warnings) {
  const id = text(character.id);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return character;
  const channel = channelRoot(boardDir);
  const required = requiredCharacters(shot).find(person => person.character === id);
  const folder = required ? path.dirname(path.resolve(boardDir, required.bodyPath)) : path.join(channel, 'assets/characters', id);
  const identity = path.join(folder, 'identity.md');
  let resolved = character;
  const pinnedSettings = Object.keys(object(character.tts)).length > 0;
  if ((!pinnedSettings || !object(character.voiceReference).path) && existsSync(identity)) {
    try {
      const current = handoff(identity, { voiceOnly: character.voiceOnly === true });
      if (!pinnedSettings || sameSettings(current.tts,character.tts)) {
        resolved = { ...current, ...character, tts: current.tts };
        if (current.voiceReference && !object(resolved.voiceReference).path)
          resolved.voiceReference = {...object(resolved.voiceReference),...current.voiceReference};
        if (required && !object(resolved.voiceReference).path) {
          const sample = path.join(folder, 'voice.wav');
          const selected = object(current.voiceSelection).audioSha256;
          if (typeof selected === 'string' && existsSync(sample) && fileHash(sample) === selected)
            resolved = { ...resolved, voiceReference:{ path:sample, sha256:selected, tts:current.tts } };
        }
      }
    } catch (error) {
      warnings.push(`${id}: cannot read the selected character voice: ${error instanceof Error ? error.message : String(error)}`);
      return character;
    }
  }
  const reference = object(resolved.voiceReference);
  if (required) return {...resolved, voiceReference:{...reference, imagePaths:[required.face?.path,required.bodyPath].filter(Boolean)}};
  const sceneRefs = object(shot.visual).references;
  const facePaths = (Array.isArray(sceneRefs) ? sceneRefs.map(object) : [])
    .filter(ref => ref.scope === 'scene' && ref.character === id && ref.role === 'character').map(ref => text(ref.path));
  if (facePaths.length) return {...resolved, voiceReference:{...reference,imagePaths:facePaths}};
  // Existing ownership wins. Otherwise use only authored character images inside this character's folder.
  if (!Array.isArray(reference.imagePaths) && existsSync(folder)) {
    const root = realpathSync(folder) + path.sep;
    const refs = object(shot.visual).references;
    const imagePaths = (Array.isArray(refs) ? refs.map(object) : [])
      .filter(ref => ref.role === 'character' && ['both', 'video'].includes(text(ref.use)))
      .map(ref => text(ref.path)).filter(Boolean)
      .map(file => path.resolve(boardDir, file))
      .filter(file => existsSync(file) && realpathSync(file).startsWith(root));
    if (imagePaths.length) resolved = { ...resolved, voiceReference: { ...reference, imagePaths } };
  }
  return resolved;
}

function voiceReference(character, boardDir, warnings, shot, storyLanguage) {
  const declared = object(character.voiceReference);
  if (character.voiceReferenceWarning && !declared.path) {
    warnings.push(`${character.id}: ${character.voiceReferenceWarning}; restore the selected sample instead of substituting an old voice.wav.`);
    return undefined;
  }
  let file = text(declared.path);
  if (file) {
    // Character handoff paths are relative to scenes.js, like other cast assets.
    file = path.resolve(boardDir, file);
    if (declared.tts && !sameSettings(declared.tts,character.tts))
      throw new Error(`voice_reference_stale: ${character.id} sample uses different pinned TTS settings`);
  } else if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text(character.id))) {
    const channel = channelRoot(boardDir);
    const identity = path.join(channel, 'assets/characters', text(character.id), 'identity.md');
    const candidate = path.join(path.dirname(identity), 'voice.wav');
    if (existsSync(identity) && existsSync(candidate)) {
      const { identityVoice } = require('./character-voice.js');
      if (!sameSettings(identityVoice(readFileSync(identity, 'utf8')),character.tts)) {
        warnings.push(`${character.id}: shared voice.wav belongs to different current TTS settings; attach a sample for this episode's pinned voice.`);
        return undefined;
      }
      file = candidate;
    }
  }
  if (!file) return undefined;
  if (!existsSync(file)) throw new Error(`voice_reference_stale: ${character.id} selected sample is missing: ${file}`);
  const absolute = realpathSync(file), sha256 = fileHash(absolute);
  const selected = declared.sha256 || object(character.voiceSelection).audioSha256;
  if (selected && selected !== sha256) throw new Error(`voice_reference_stale: ${character.id} sample bytes changed`);
  const lines = (shot?.narration ?? []).filter(line => line.speaker === character.id && line.delivery !== 'voiceover' && text(line.tts));
  const spoken = new Set(lines.map(line => normalizeLanguage(line.language || storyLanguage)).filter(Boolean));
  if (spoken.size) {
    const languages = new Set([normalizeLanguage(character.tts?.language)].filter(Boolean));
    // The selection can outlive an episode override that relabels both TTS settings and reference metadata.
    const selectionFile = character.voiceSelection?.auditionPath;
    const receipts = new Set([path.join(path.dirname(absolute), 'audition.json')]);
    if (typeof selectionFile === 'string') receipts.add(path.resolve(boardDir, selectionFile));
    for (const receipt of receipts) {
      if (!existsSync(receipt)) continue;
      const audition = JSON.parse(readFileSync(receipt, 'utf8'));
      const candidate = audition.candidates?.find(item => item.audioSha256 === sha256);
      const recorded = normalizeLanguage(candidate?.tts?.language);
      if (recorded) languages.add(recorded);
    }
    for (const language of spoken) for (const recorded of languages) {
      if (recorded !== language) throw new Error(`voice_reference_language_mismatch: ${character.id} speaks ${language} in ${shot.id}; the pinned reference uses ${recorded}. Select a recording of this speaker in ${language}.`);
    }
  }
  const provenance = declared.tts && declared.sha256 ? 'pinned_settings_and_bytes' : 'legacy_sample_unverified';
  if (provenance === 'legacy_sample_unverified') warnings.push(`${character.id}: sample identity is unverified; a file name or hash is not a listening review.`);
  return { path: absolute, sha256, provenance };
}

function currentSceneVoice(board,boardDir,shot,id,warnings) {
  const cast = board?.SB_DOC?.characters;
  const matches = Array.isArray(cast) ? cast.filter(character => character?.id === id) :
    cast && Object.hasOwn(cast,id) ? [{...cast[id],id}] : [];
  if (matches.length > 1) throw new Error('voice_reference_ambiguous: duplicate cast entries for ' + id);
  if (!matches.length) return undefined;
  const issues=[];
  const character=resolveCharacterVoice(matches[0],boardDir,shot,issues);
  const ref=voiceReference(character,boardDir,issues,shot,board?.STORY?.language);
  if (warnings) warnings.push(...issues);
  else if (!ref && issues.length) throw new Error('voice_reference_stale: ' + issues.join(' '));
  return ref;
}

module.exports={currentSceneVoice,resolveCharacterVoice,voiceReference};
