import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {characterSpeech, validateSpeechContext, verifiedSpeechGeneration} = require('../../skills/_shared/character-speech.js');
const {compileActing} = require('../../skills/_shared/speech-contract.js');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const voice = {engine:'astra-genai', model:'voxcpm2', voiceId:'hero', speed:1, language:'ko'};
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'character-speech-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  const boardDir = join(dir, 'episodes/one/storyboard'); mkdirSync(boardDir, {recursive:true});
  const sample = join(dir, 'sample.wav'); writeFileSync(sample, 'selected sample');
  const character = {id:'hero', tts:voice, voiceReference:{path:sample, sha256:hash(readFileSync(sample)), tts:voice}};
  const line = {id:'l1', speaker:'hero', tts:'Hello', delivery:'voiceover'};
  const board = {SB_DOC:{speechPlanVersion:1, characters:[character]}, SCENES:[{id:'s1', narration:[line]}]};
  const file = join(boardDir, 'scenes.js');
  const save = () => writeFileSync(file, Object.entries(board).map(([key,value])=>`window.${key}=${JSON.stringify(value)};`).join('\n'));
  save();
  return {dir, boardDir, sample, character, line, board, file, save};
}
test('a selected default sample cannot become character TTS, while auditions and explicit voice exceptions remain possible', t => {
  const f = fixture(t), character = {...f.character, tts:{...voice, voiceId:'default'}};
  assert.throws(() => characterSpeech(character), /character_voice_unregistered/);
  assert.throws(() => characterSpeech({id:'hero', tts:character.tts, voiceSelection:{candidateId:'1'}}), /character_voice_unregistered/);
  assert.doesNotThrow(() => compileActing('A sample', undefined, character.tts)); // Auditions may design a new voice.
  assert.doesNotThrow(() => characterSpeech({id:'narrator', tts:character.tts})); // No selected sample claim.
  const override = {PRODUCTION:{modelSettings:{overrides:{speech:{engine:voice.engine, model:voice.model, voiceId:'hero', request:'Use this episode voice'}}}}};
  assert.equal(characterSpeech(f.character, {board:override}).tts.voiceId, 'hero');
  writeFileSync(f.sample, 'replaced sample');
  assert.throws(() => characterSpeech(f.character), /sample_stale/);
});
test('shared voice changes are visible before a new take without migrating snapshots or historical recordings', t => {
  const f = fixture(t); writeFileSync(join(f.dir,'profile.md'), '# Channel');
  const folder = join(f.dir,'assets/characters/hero'); mkdirSync(folder, {recursive:true});
  const example = readFileSync(new URL('../../skills/channel/references/character-identity-example.md',import.meta.url),'utf8');
  const doc = JSON.parse(example.match(/```json\s*\n([\s\S]*?)```/)[1]);
  doc.tts = {...voice, voiceId:'new-hero'}; doc.voiceSelection = {candidateId:'chosen'};
  writeFileSync(join(folder,'identity.md'), '# Hero\n```json\n'+JSON.stringify(doc)+'\n```');
  const context = {boardDir:f.boardDir, board:f.board};
  assert.throws(() => characterSpeech(f.character, context), /character_voice_stale/);
  assert.equal(f.character.tts.voiceId, 'hero');
  f.board.PRODUCTION = {modelSettings:{overrides:{speech:{engine:voice.engine, model:voice.model, request:'Keep the approved voice'}}}};
  assert.throws(() => characterSpeech(f.character, context), /character_voice_stale/); // Same-model exceptions must name the voice.
  f.board.PRODUCTION.modelSettings.overrides.speech.voiceId = 'hero';
  assert.equal(characterSpeech(f.character, context).tts.voiceId, 'hero');
  assert.equal(characterSpeech({id:'hero'}, context).tts.voiceId, 'new-hero');
});
test('episode gateway preflight refuses context omission, argument substitution, stale plans and output symlinks', t => {
  const f = fixture(t), generation = compileActing(f.line.tts,undefined,voice).generation;
  const outputPath = join(f.dir,'episodes/one/output/speech');
  const context = {path:f.file, lineId:'l1', expectedRevision:hash(readFileSync(f.file))};
  const args = {...generation, outputPath, speechContext:context};
  assert.doesNotThrow(() => validateSpeechContext('tts_astra_genai',args));
  assert.throws(() => validateSpeechContext('tts_astra_genai',{...args,speechContext:undefined}), /speech_context_required/);
  assert.throws(() => validateSpeechContext('tts_astra_genai',{...args,voice:'default'}), /speech_context_mismatch/);
  assert.throws(() => validateSpeechContext('tts_astra_genai',{...args,text:'Other words'}), /speech_context_mismatch/);
  symlinkSync(join(f.dir,'episodes/one'),join(f.dir,'alias'));
  assert.throws(() => validateSpeechContext('tts_astra_genai',{...generation,outputPath:join(f.dir,'alias/output')}), /speech_context_required/);
  f.board.SCENES[0].narration[0].tts='Edited'; f.save();
  assert.throws(() => validateSpeechContext('tts_astra_genai',args), /speech_context_stale/);
  const asset = join(f.dir,'assets/characters/hero/voice-auditions/new');
  writeFileSync(join(f.dir,'profile.md'),'# Channel');
  assert.doesNotThrow(() => validateSpeechContext('tts_astra_genai',{...generation,voice:'default',outputPath:asset}));
});
test('a receipt is bound to the actual generator, voice and WAV; caller metadata cannot disguise default audio', t => {
  const f = fixture(t), audio = join(f.dir,'take.wav'); writeFileSync(audio,'generated bytes');
  const receiptPath=join(f.dir,'receipt.json'), generation=compileActing(f.line.tts,undefined,voice).generation;
  const receipt={status:'completed',generator:'tts_astra_genai',generation, audioSha256:hash(readFileSync(audio)),result:{success:true,audioPath:audio}};
  const proof={generator:'tts_astra_genai',text:f.line.tts,language:'ko',voiceSettings:generation,receiptPath};
  const save=()=>writeFileSync(receiptPath,JSON.stringify(receipt)); save();
  assert.deepEqual(verifiedSpeechGeneration(audio,proof,voice,f.line).voiceSettings,generation);
  receipt.generation={...generation,voice:'default'};save();
  assert.throws(()=>verifiedSpeechGeneration(audio,proof,voice,f.line),/speech_receipt_voice_mismatch/);
  receipt.generation=generation;receipt.status='uncertain';save();
  assert.throws(()=>verifiedSpeechGeneration(audio,proof,voice,f.line),/speech_receipt_mismatch/);
  receipt.status='completed';save();writeFileSync(audio,'different bytes');
  assert.throws(()=>verifiedSpeechGeneration(audio,proof,voice,f.line),/speech_receipt_mismatch/);
  assert.throws(()=>verifiedSpeechGeneration(audio,{...proof,receiptPath:undefined},voice,f.line,{required:true}),/speech_receipt_required/);
  assert.doesNotThrow(()=>verifiedSpeechGeneration(audio,{...proof,receiptPath:undefined},voice,f.line)); // Existing attachments stay reusable.
});
