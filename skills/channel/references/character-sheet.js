#!/usr/bin/env node
'use strict';

// Read-only compiler: never changes the author's identity or invents missing fields.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { identityCharacter, direction } = require('../../_shared/character-identity.js');
const { identityVoice } = require('../../_shared/character-voice.js');

function handoff(file) {
  const source = fs.readFileSync(file, 'utf8');
  const character = identityCharacter(source);
  const name = /^#\s+(.+)$/m.exec(source)?.[1]?.trim();
  if (!name) throw new Error('identity.md needs a # Name heading');
  const id = path.basename(path.dirname(path.resolve(file)));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('Character folder needs a kebab-case id');
  return { id, name, character, tts: identityVoice(source), direction: direction(character), identitySha256: createHash('sha256').update(source).digest('hex') };
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
      const current = handoff(file);
      if (current.identitySha256 !== c.identitySha256 || JSON.stringify(current.character) !== JSON.stringify(c.character) || JSON.stringify(current.tts) !== JSON.stringify(c.tts))
        errors.push(`Character ${c.id}: local identity changed; regenerate handoff and affected assets`);
    } catch (error) { errors.push(`Character ${c.id}: ${error.message}`); }
  }
  return errors;
}
module.exports = { handoff, sourceErrors };
