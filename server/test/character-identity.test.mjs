import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { GROUPS, identityErrors, identityCharacter, direction, boardIdentityErrors } = require('../../skills/_shared/character-identity.js');
const { handoff } = require('../../skills/channel/references/character-sheet.js');
const source = readFileSync(new URL('../../skills/channel/references/character-identity-example.md', import.meta.url), 'utf8');
const doc = () => JSON.parse(source.match(/```json\s*\n([\s\S]*?)```/)[1]);
const markdown = d => '# Mori\n\n```json\n' + JSON.stringify(d) + '\n```';

test('every catalog field is required, typed, status-aware and placeholder-resistant', () => {
  assert.deepEqual(identityErrors(doc().character), []);
  for (const [group,,,fields] of GROUPS) for (const [key] of fields) {
    const c = doc().character;
    delete c[group][key];
    assert.ok(identityErrors(c).some(e => e.includes(`${group}.${key}`)));
  }
  for (const value of [0, -1, '90cm', null, Infinity]) {
    const c = doc().character; c.physical.heightCm.value = value;
    assert.ok(identityErrors(c).some(e => e.includes('heightCm')));
  }
  const c = doc().character;
  c.identity.age = {status:'pending',value:null,reason:'Author has not chosen the age'};
  assert.ok(identityErrors(c).some(e => e.includes('pending')));
  assert.deepEqual(identityErrors(c,{ready:false}),[]);
  assert.throws(() => direction(c));
  c.identity.age = {status:'not_applicable',value:null,reason:'Skip validation'};
  assert.ok(identityErrors(c).length);
  c.identity.age = {status:'confirmed',value:'TBD'};
  assert.ok(identityErrors(c).length);
});

test('duplicate, malformed, missing or future-schema identities cannot pass', () => {
  for (const value of ['# Old sheet', source + source, '```json\n{bad}\n```']) assert.throws(() => identityCharacter(value));
  const c = doc().character; c.schemaVersion=2;
  assert.ok(identityErrors(c).length);
  c.schemaVersion=1;c.physical.weightKg={status:'not_applicable',value:null,reason:'Stylized mass not defined'};
  assert.deepEqual(identityErrors(c),[]);
  c.physical.secret='unknown';assert.ok(identityErrors(c).length);
});

test('create and update compile correct lane directions, preserve other fields, and invalidate stale handoffs', () => {
  const root=mkdtempSync(join(tmpdir(),'sf-identity-'));const folder=join(root,'mori');mkdirSync(folder);
  const file=join(folder,'identity.md');
  try {
    writeFileSync(file,source);const first=handoff(file);
    const d=doc();d.character.version++;d.character.speech.register.value='친근한 반말';
    writeFileSync(file,markdown(d));const next=handoff(file);
    assert.notEqual(next.identitySha256,first.identitySha256);
    assert.deepEqual(next.tts,first.tts);
    assert.deepEqual(next.character.physical,first.character.physical);
    assert.equal(next.direction.image,first.direction.image);
    assert.notEqual(next.direction.dialogue,first.direction.dialogue);
    assert.notEqual(next.direction.voice,first.direction.voice);
    const board={SB_DOC:{characterSchemaVersion:1,characters:[next]}};
    assert.deepEqual(boardIdentityErrors(board),[]);
    next.direction=first.direction;assert.match(boardIdentityErrors(board).join(),/regenerate handoff/);
    delete next.character;assert.ok(boardIdentityErrors(board).length);
    assert.deepEqual(boardIdentityErrors({SB_DOC:{characters:[{id:'legacy'}]}}),[]);
    const before=readFileSync(file,'utf8');handoff(file);assert.equal(readFileSync(file,'utf8'),before);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('production verifies the current on-disk identity, not a copied hash alone', () => {
  const {sourceErrors}=require('../../skills/channel/references/character-sheet.js');
  const root=mkdtempSync(join(tmpdir(),'sf-source-'));
  const folder=join(root,'assets/characters/mori');mkdirSync(folder,{recursive:true});
  writeFileSync(join(root,'profile.md'),'# Test');const file=join(folder,'identity.md');
  try {
    writeFileSync(file,source);const cast=handoff(file);const win={SB_DOC:{characterSchemaVersion:1,characters:[cast]}};
    assert.deepEqual(sourceErrors(win,root),[]);
    const updated=doc();updated.character.physical.heightCm.value=95;updated.character.version++;
    writeFileSync(file,markdown(updated));assert.match(sourceErrors(win,root).join(),/local identity changed/);
    cast.identitySha256=handoff(file).identitySha256;
    assert.match(sourceErrors(win,root).join(),/local identity changed/);
    win.SB_DOC.characters=[handoff(file)];assert.deepEqual(sourceErrors(win,root),[]);
    win.SB_DOC.characters[0].id='../escape';assert.match(sourceErrors(win,root).join(),/Invalid character id/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
