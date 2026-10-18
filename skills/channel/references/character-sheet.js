#!/usr/bin/env node
'use strict';

// Read-only compiler: never changes the author's identity or invents missing fields.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { identityCharacter, direction, requiresSpeech } = require('../../_shared/character-identity.js');
const { identityVoice, voiceErrors } = require('../../_shared/character-voice.js');

function episodeVoiceOverride(win, tts) {
  const override = win?.PRODUCTION?.modelSettings?.overrides?.speech;
  return typeof override?.request === 'string' && override.request.trim().length > 0
    && typeof override.model === 'string' && override.model.trim().length > 0
    && override.engine === tts?.engine && override.model === tts?.model
    && voiceErrors(tts).length === 0;
}

function handoff(file, { requireSpeech = true } = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const character = identityCharacter(source, { requireSpeech });
  const name = /^#\s+(.+)$/m.exec(source)?.[1]?.trim();
  if (!name) throw new Error('identity.md needs a # Name heading');
  const id = path.basename(path.dirname(path.resolve(file)));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('Character folder needs a kebab-case id');
  const tts = identityVoice(source, { optional: !requireSpeech });
  return { id, name, character, tts, direction: direction(character, { requireSpeech }), identitySha256: createHash('sha256').update(source).digest('hex'), ...selectedVoiceReference(source, tts) };
}

// Reuse the chosen audition's actual bytes, rather than an unrelated old voice.wav.
function selectedVoiceReference(source, tts) {
  if (!tts) return {};
  const document = [...source.matchAll(/```json\s*\n([\s\S]*?)```/g)].map(m => JSON.parse(m[1])).find(v => v?.character);
  const selection = document?.voiceSelection;
  if (!selection?.auditionPath) return {};
  try {
    const audition = JSON.parse(fs.readFileSync(selection.auditionPath, 'utf8'));
    const chosen = audition.candidates?.find(c => c.id === selection.candidateId);
    if (!chosen || !isDeepStrictEqual(chosen.tts, tts) || chosen.audioSha256 !== selection.audioSha256 || !path.isAbsolute(chosen.audioPath))
      throw new Error('Selected voice sample no longer matches the pinned character voice');
    // Byte validation belongs to video_plan when this sample is actually an input.
    return {voiceReference:{path: chosen.audioPath, sha256: chosen.audioSha256, tts}};
  } catch (error) {
    // Missing optional samples must not block stills or ordinary TTS production.
    return {voiceReferenceWarning: error.message};
  }
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1) throw new Error('Usage: character-sheet.js <identity.md>');
    console.log(JSON.stringify(handoff(args[0]), null, 2));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
function sourceErrors(win, boardDir) {
  const entries = win?.SB_DOC?.characters;
  const chars = (Array.isArray(entries) ? entries : Object.entries(entries || {}).map(([id,c]) => ({ ...c, id })))
    .filter(c => c?.character !== undefined || win?.SB_DOC?.characterSchemaVersion === 1);
  if (!chars.length) return [];
  let channel = path.resolve(boardDir);
  while (!fs.existsSync(path.join(channel, 'profile.md')) && path.dirname(channel) !== channel) channel = path.dirname(channel);
  const errors = [];
  for (const c of chars) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c?.id || '')) { errors.push('Invalid character id'); continue; }
    const file = path.join(channel, 'assets', 'characters', c.id, 'identity.md');
    try {
      const current = handoff(file, { requireSpeech: requiresSpeech(win, c.id) });
      const voiceChanged = JSON.stringify(current.tts) !== JSON.stringify(c.tts);
      if (current.identitySha256 !== c.identitySha256 || JSON.stringify(current.character) !== JSON.stringify(c.character)
        || (voiceChanged && !episodeVoiceOverride(win, c.tts)))
        errors.push(`Character ${c.id}: local identity changed; regenerate handoff and affected assets`);
    } catch (error) { errors.push(`Character ${c.id}: ${error.message}`); }
  }
  return errors;
}
module.exports = { handoff, sourceErrors };
