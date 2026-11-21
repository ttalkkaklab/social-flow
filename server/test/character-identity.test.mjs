import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { GROUPS, REQUIRED, identityErrors, identityCharacter, direction, boardIdentityErrors } = require('../../skills/_shared/character-identity.js');
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

test('the head count is read from the proportions words and never guessed', () => {
  const { headsTall, headRatio } = require('../../skills/_shared/character-identity.js');
  const sheet = (value, status = 'confirmed') => ({ physical: { heightCm: { status: 'confirmed', value: 225 }, proportions: { status, value } } });
  for (const [words, count] of [['about 7.5 heads tall, head not oversized', 7.5], ['7 1/2 heads', 7.5], ['a 2.5-head-tall mascot', 2.5],
    ['귀를 제외한 전체 키가 머리 높이의 3배인 3등신', 3], ['natural adult proportions, about seven and a half heads tall', 7.5], ['Same compact two-head silhouette, one broad stylized head', 2],
    ['Natural realistic adult male body proportions.', null], ['long legs, 1:7 head-to-body look', null], ['70 heads tall', null],
    // Another measure in head units is not the height, and a range or two counts is no count.
    ['shoulders 2 heads wide, about 7.5 heads tall', 7.5], ['legs 4 heads long', null], ['6-7 heads tall', null], ['6 to 7 heads tall', null], ['2 heads, 7 heads', null], ['stocky, 5 heads', 5], ['two heads taller than Bo', null]])
    assert.equal(headsTall(sheet(words)), count, words);
  assert.equal(headsTall(sheet(null, 'pending')), null);
  assert.equal(headsTall(doc().character), 3, 'the worked example carries a count');
  assert.deepEqual(headRatio(sheet('long legs'), 'kardum'), { headsTall: null, text: '' });
  const said = headRatio(sheet('7.5 heads tall'), 'kardum');
  assert.equal(said.headsTall, 7.5);
  assert.match(said.text, /^kardum is 7\.5 heads tall: .*30 cm of the 225 cm standing height/);
  assert.match(headRatio({ physical: { proportions: { status: 'confirmed', value: '3등신' } } }, 'mori').text, /^mori is 3 heads tall: .*one part in 3 of the standing height/);
  // Every readable count gets shape words, and counts that look different get different ones.
  const shape = count => headRatio(sheet(count + ' heads tall'), 'x').text.split('; the head (crown')[0];
  for (let count = 1.5; count <= 12; count += 0.25) assert.match(shape(count), /^x is [\d.]+ heads tall: \S/);
  assert.equal(new Set([1.5, 2, 2.5, 3, 4, 5, 6, 7, 7.5, 8, 8.5, 9].map(count => shape(count).split(': ')[1])).size, 12);
});

test('the basics are required; every other field and group is optional, typed, status-aware and placeholder-resistant', () => {
  assert.deepEqual(identityErrors(doc().character), []);
  for (const [group,,,fields] of GROUPS) for (const [key] of fields) {
    const c = doc().character;
    delete c[group][key];
    assert.equal(identityErrors(c).some(e => e.includes(`${group}.${key}`)), REQUIRED[group]?.includes(key) ?? false, `${group}.${key}`);
  }
  assert.deepEqual(REQUIRED, { identity: ['gender', 'species', 'age', 'role', 'summary'], physical: ['heightCm'] });
  const bare = doc().character;
  for (const group of ['personality', 'speech', 'acting', 'story', 'continuity']) delete bare[group];
  for (const key of Object.keys(bare.physical)) if (key !== 'heightCm') delete bare.physical[key];
  assert.deepEqual(identityErrors(bare), []);
  assert.equal(direction(bare).voice, '');
  delete bare.physical; assert.ok(identityErrors(bare).some(e => e.includes('character.physical')));
  const optional = doc().character;
  optional.story.arc = {status:'pending',value:null,reason:'Not decided'};
  optional.personality.fear = {status:'not_applicable',value:null,reason:'No fear defined'};
  assert.deepEqual(identityErrors(optional), [], 'pending or inapplicable optional fields do not block generation');
  optional.personality.fear = {status:'confirmed',value:'TBD'}; assert.ok(identityErrors(optional).length);
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

test('a voice-only speaker retains pending body details and a pinned voice, but visible cast still needs ready identity', t => {
  const root=mkdtempSync(join(tmpdir(),'sf-voice-only-')),folder=join(root,'assets/characters/mori');mkdirSync(folder,{recursive:true});
  t.after(()=>rmSync(root,{recursive:true,force:true}));writeFileSync(join(root,'profile.md'),'# Channel');
  const d=doc();d.character.identity.age={status:'pending',value:null,reason:'Only the phone voice is cast'};
  d.character.physical.heightCm={status:'pending',value:null,reason:'Never appears on screen'};
  const file=join(folder,'identity.md');writeFileSync(file,markdown(d));
  const cast=handoff(file,{voiceOnly:true}),board={STORY:{version:'story-v2'},SB_DOC:{characterSchemaVersion:1,characters:[cast]},SCENES:[{narration:[{speaker:'mori',tts:'Hello'}]}]};
  const {sourceErrors}=require('../../skills/channel/references/character-sheet.js');
  assert.deepEqual(boardIdentityErrors(board),[]);assert.deepEqual(sourceErrors(board,root),[]);
  board.SCENES[0].visual={character:['mori']};assert.match(boardIdentityErrors(board).join(),/pending/);assert.match(sourceErrors(board,root).join(),/pending/);
  assert.throws(()=>handoff(file),/pending/);
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
    assert.throws(()=>handoff(file),/tts/,'a character with lines needs its selected voice');
    const cast=handoff(file,{requireSpeech:false});
    assert.equal(cast.tts,null);assert.equal(cast.direction.voice,'');
    const board={STORY:{version:'story-v2'},SB_DOC:{characterSchemaVersion:1,speechPlanVersion:1,characters:[cast]},SCENES:[{visual:{character:'mori'},narration:[]}]};
    const {boardVoiceErrors}=require('../../skills/_shared/character-voice.js');
    const {sourceErrors}=require('../../skills/channel/references/character-sheet.js');
    assert.deepEqual(boardVoiceErrors(board),[]);assert.deepEqual(sourceErrors(board,root),[]);
    board.SCENES[0].narration=[{id:'line-1',speaker:'mori',delivery:'on_screen',tts:'Hello'}];
    assert.match(boardVoiceErrors(board).join(),/pending|tts is required/);
    assert.match(sourceErrors(board,root).join(),/tts/);
    board.SCENES[0].narration=[];
    cast.tts={engine:'invalid'};assert.match(boardVoiceErrors(board).join(),/tts/);cast.tts=null;
    d.character.identity.gender={status:'pending',value:null,reason:'Gender not chosen'};
    writeFileSync(file,markdown(d));assert.throws(()=>handoff(file,{requireSpeech:false}),/identity.gender/);
    assert.match(sourceErrors(board,root).join(),/identity.gender/);
  }finally{rmSync(root,{recursive:true,force:true});}
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
