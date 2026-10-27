import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { GROUPS, identityErrors, identityCharacter, direction, boardIdentityErrors } = require('../../skills/_shared/character-identity.js');
const { handoff } = require('../../skills/channel/references/character-sheet.js');
const source = readFileSync(new URL('../../skills/channel/references/character-identity-example.md', import.meta.url), 'utf8');
const doc = () => JSON.parse(source.match(/```json\s*\n([\s\S]*?)```/)[1]);
const markdown = d => '# Mori\n\n```json\n' + JSON.stringify(d) + '\n```';

test('character handoff exports the chosen audition sample with pinned voice settings and bytes',t=>{
 const root=mkdtempSync(join(tmpdir(),'sf-voice-handoff-')),folder=join(root,'mori');mkdirSync(folder);
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const d=doc(),audio=join(folder,'chosen.wav'),manifest=join(folder,'audition.json'),file=join(folder,'identity.md');
 writeFileSync(audio,'chosen voice');writeFileSync(join(folder,'voice.wav'),'obsolete voice');
 const sha256=createHash('sha256').update('chosen voice').digest('hex');
 d.voiceSelection={candidateId:'2',auditionPath:manifest,audioSha256:sha256};
 writeFileSync(manifest,JSON.stringify({candidates:[{id:'2',tts:d.tts,audioPath:audio,audioSha256:sha256}]}));writeFileSync(file,markdown(d));
 const compiled=handoff(file);assert.equal(compiled.voiceReference.sha256,sha256);assert.deepEqual(compiled.voiceReference.tts,compiled.tts);
 assert.match(compiled.voiceReference.path,/chosen.wav$/);
 writeFileSync(audio,'tampered');assert.equal(handoff(file).voiceReference.sha256,sha256,'runtime validates the recorded hash when used');
 rmSync(manifest);const missing=handoff(file);assert.equal(missing.voiceReference,undefined);assert.ok(missing.voiceReferenceWarning);
});

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

test('silent story-v2 cast can keep speech pending without bypassing identity or spoken-line checks', () => {
  const root=mkdtempSync(join(tmpdir(),'silent-cast-'));
  try {
    const dir=join(root,'assets/characters/mori');mkdirSync(dir,{recursive:true});
    writeFileSync(join(root,'profile.md'),'# Channel');
    const d=doc();d.tts=null;
    for(const key of Object.keys(d.character.speech))d.character.speech[key]={status:'pending',value:null,reason:'Silent character; voice not selected'};
    const file=join(dir,'identity.md');writeFileSync(file,markdown(d));
    assert.throws(()=>handoff(file),/pending/);
    const cast=handoff(file,{requireSpeech:false});
    assert.equal(cast.tts,null);assert.equal(cast.direction.voice,'');
    const board={STORY:{version:'story-v2'},SB_DOC:{characterSchemaVersion:1,speechPlanVersion:1,characters:[cast]},SCENES:[{visual:{character:'mori'},narration:[]}]};
    const {boardVoiceErrors}=require('../../skills/_shared/character-voice.js');
    const {sourceErrors}=require('../../skills/channel/references/character-sheet.js');
    assert.deepEqual(boardVoiceErrors(board),[]);assert.deepEqual(sourceErrors(board,root),[]);
    board.SCENES[0].narration=[{id:'line-1',speaker:'mori',delivery:'on_screen',tts:'Hello'}];
    assert.match(boardVoiceErrors(board).join(),/pending|tts is required/);
    assert.match(sourceErrors(board,root).join(),/pending/);
    board.SCENES[0].narration=[];
    cast.tts={engine:'invalid'};assert.match(boardVoiceErrors(board).join(),/tts/);cast.tts=null;
    d.character.physical.appearance={status:'pending',value:null,reason:'Appearance not chosen'};
    writeFileSync(file,markdown(d));assert.throws(()=>handoff(file,{requireSpeech:false}),/physical.appearance/);
    assert.match(sourceErrors(board,root).join(),/physical.appearance/);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('an explicit episode speech override preserves the shared character identity', () => {
  const {sourceErrors}=require('../../skills/channel/references/character-sheet.js');
  const root=mkdtempSync(join(tmpdir(),'sf-episode-voice-'));
  try {
    const folder=join(root,'assets/characters/mori');mkdirSync(folder,{recursive:true});
    const file=join(folder,'identity.md');writeFileSync(file,source);writeFileSync(join(root,'profile.md'),'# Channel');
    const cast=handoff(file),originalCharacter=JSON.stringify(cast.character),originalHash=cast.identitySha256;
    cast.tts={engine:'gemini',model:'gemini-3.8-flash-tts',voiceId:'Orus',language:'ko',speed:1};
    const win={PRODUCTION:{modelSettings:{overrides:{speech:{engine:'gemini',model:'gemini-3.8-flash-tts',request:'User selected Gemini for this episode within USD 10.'}}}},SB_DOC:{characters:[cast]}};
    assert.deepEqual(sourceErrors(win,root),[]);
    assert.equal(JSON.stringify(cast.character),originalCharacter);
    assert.equal(cast.identitySha256,originalHash);
    assert.equal(readFileSync(file,'utf8'),source);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('episode speech overrides cannot hide missing authorization, a different model or changed identity', () => {
  const {sourceErrors}=require('../../skills/channel/references/character-sheet.js');
  const root=mkdtempSync(join(tmpdir(),'sf-episode-voice-invalid-'));
  try {
    const folder=join(root,'assets/characters/mori');mkdirSync(folder,{recursive:true});
    const file=join(folder,'identity.md');writeFileSync(file,source);writeFileSync(join(root,'profile.md'),'# Channel');
    const cast=handoff(file);cast.tts={engine:'gemini',model:'gemini-3.8-flash-tts',voiceId:'Orus',language:'ko',speed:1};
    const win={SB_DOC:{characters:[cast]}};
    const rejected=()=>assert.match(sourceErrors(win,root).join(),/local identity changed/);
    rejected();
    const override={engine:'gemini',model:'gemini-3.8-flash-tts',request:''};
    win.PRODUCTION={modelSettings:{overrides:{speech:override}}};rejected();
    override.request='User chose Gemini';override.model='gemini-3.8-flash-lite-tts';rejected();
    override.model='gemini-3.8-flash-tts';cast.tts.speed=1.1;rejected();cast.tts.speed=1;
    assert.deepEqual(sourceErrors(win,root),[]);
    cast.character.physical.heightCm.value+=1;rejected();
    cast.character=handoff(file).character;
    const changed=doc();changed.character.physical.heightCm.value+=1;writeFileSync(file,markdown(changed));rejected();
  } finally {rmSync(root,{recursive:true,force:true});}
});
