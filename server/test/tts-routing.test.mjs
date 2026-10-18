import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { config } from '../dist/config.js';
import { pcmToWav } from '../dist/media-utils.js';
import { executeSpeech, withSpeechRequestId } from '../dist/tts-execution.js';
import { routeSpeech } from '../dist/tts-routing.js';
import { prepareSpeech } from '../dist/tts-adapters.js';
import { generateSpeech, generateDialogue, generateGemini38Speech } from '../dist/tts-client.js';
import { decodeSpeechBase64, validateSpeechAudio, validateSpeechAlignment, validateSpeechSegments } from '../dist/tts-audio.js';
const root = mkdtempSync(join(tmpdir(), 'tts-routing-test-'));
const oldKey = config.geminiApiKey;
const bytes = pcmToWav(Buffer.alloc(48000), 24000, 1);
let calls = 0;
const args = name => ({model:'gemini-2.5-flash-preview-tts',text:'hello',outputPath:join(root,name),filename:'voice.wav'});
const synth = async ({outputPath,filename}) => {calls++; const audioPath=join(outputPath,filename); writeFileSync(audioPath,bytes); return {success:true,audioPath};};
before(() => {config.geminiApiKey='test-'+randomUUID();});
after(() => {config.geminiApiKey=oldKey; rmSync(root,{recursive:true,force:true});});
test('capabilities and plans are pure, exact-model, strict payload contracts',async () => {
 const cap=await routeSpeech({action:'capabilities'}); assert.equal(cap.models.length,6); assert.equal(cap.review,'not_reviewed');
 const plan=await routeSpeech({action:'plan',generator:'tts_generate',generation:{text:'hello',outputPath:join(root,'pure')}});
 assert.equal(plan.generation.model,'gemini-2.5-flash-preview-tts'); assert.equal(existsSync(join(root,'pure')),false); assert.equal(plan.cost.status,'not_quoted');
 for(const generation of [{text:'hi',model:'unknown'},{text:'hi',speed:1.2},{text:'hi',emotion:'happy'}]) await assert.rejects(routeSpeech({action:'plan',generator:'tts_generate',generation}));
 await assert.rejects(routeSpeech({action:'execute',generator:'tts_generate',generation:{text:'hi'}}));
 assert.throws(()=>prepareSpeech('tts_multi_speaker',{script:'A: hi',speakers:[{speakerName:'A',voiceName:'Kore'},{speakerName:'A',voiceName:'Puck'}]}),/unique/);
});
test('direct entrypoints reject unsupported payloads before submission',async () => {
 for(const [run,input] of [[generateSpeech,{text:'hi',model:'invented'}],[generateSpeech,{text:'hi',style:'unsupported'}],[generateDialogue,{script:'A: hi',speakers:[{speakerName:'A',voiceName:'bad'}]}],[generateGemini38Speech,{turns:[{text:'hi',speed:2}]}]]) {
 const result=await run(input); assert.equal(result.success,false); assert.equal(result.attempts,undefined); }
});
test('completed request replays once and rejects changed arguments or media',async () => {
 const input=args('replay'),id=randomUUID(),start=calls;
 const run=()=>withSpeechRequestId(id,()=>executeSpeech('tts_generate',input,synth));
 const first=await run(),second=await run(); assert.equal(first.success,true); assert.deepEqual(second,{...first,replayed:true}); assert.equal(calls,start+1);
 const receipt=JSON.parse(readFileSync(first.receiptPath)); assert.equal(receipt.status,'completed'); assert.equal(receipt.review,'not_reviewed'); assert.equal(receipt.attempts,1);
 await assert.rejects(withSpeechRequestId(id,()=>executeSpeech('tts_generate',{...input,text:'changed'},synth)),/different/);
 writeFileSync(first.audioPath,'changed'); await assert.rejects(run(),/changed/);
});
test('sidecar tampering invalidates replay',async () => {
 const input=args('sidecar'),id=randomUUID();
 const run=()=>withSpeechRequestId(id,()=>executeSpeech('tts_generate',input,async output=>{const result=await synth(output),alignmentPath=result.audioPath.replace('.wav','.alignment.json'); writeFileSync(alignmentPath,'{}'); return {...result,alignmentPath};}));
 const result=await run(); writeFileSync(result.alignmentPath,'tampered'); await assert.rejects(run(),/sidecar/);
});
test('uncertain failure is recorded and never automatically resubmitted',async () => {
 const input=args('uncertain'),id=randomUUID(); let submits=0;
 const run=()=>withSpeechRequestId(id,()=>executeSpeech('tts_generate',input,async()=>{submits++; throw new Error('timeout after submission');}));
 const result=await run(); assert.equal(result.success,false); assert.equal(result.attempts,1); assert.equal(JSON.parse(readFileSync(result.receiptPath)).status,'uncertain');
 await assert.rejects(run(),/uncertain/); assert.equal(submits,1);
});
test('output and provider slots reject parallel dispatch before submission',async () => {
 let release,entered; const waiting=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
 const previous=process.env.SOCIAL_FLOW_TTS_MAX_CONCURRENCY; process.env.SOCIAL_FLOW_TTS_MAX_CONCURRENCY='1';
 try {const first=executeSpeech('tts_generate',args('busy'),async output=>{entered(); await waiting; return synth(output);}); await started;
 await assert.rejects(executeSpeech('tts_generate',args('busy'),synth),/busy/);
 await assert.rejects(executeSpeech('tts_generate',args('different'),synth),/concurrency/);
 release(); assert.equal((await first).success,true); assert.equal((await executeSpeech('tts_generate',args('after'),synth)).success,true);
 } finally {release(); if(previous===undefined) delete process.env.SOCIAL_FLOW_TTS_MAX_CONCURRENCY; else process.env.SOCIAL_FLOW_TTS_MAX_CONCURRENCY=previous;}
});
test('disabled generators, invalid formats and symlinks fail before submission',async () => {
 const start=calls,key='SOCIAL_FLOW_TOOL_TTS_GENERATE',previous=process.env[key]; process.env[key]='off';
 try {await assert.rejects(executeSpeech('tts_generate',args('disabled'),synth),/disabled/);} finally {if(previous===undefined)delete process.env[key];else process.env[key]=previous;}
 await assert.rejects(executeSpeech('tts_generate',{...args('ext'),filename:'voice.mp3'},synth));
 const target=join(root,'target'); writeFileSync(target,'keep'); symlinkSync(target,join(root,'voice.wav'));
 await assert.rejects(executeSpeech('tts_generate',{...args('sym'),outputPath:root},synth),/symlink/);
 assert.equal(calls,start); assert.equal(readFileSync(target,'utf8'),'keep');
});
test('invalid media cannot produce a completed receipt',async () => {
 const result=await executeSpeech('tts_generate',args('bad'),async output=>{const audioPath=join(output.outputPath,output.filename);writeFileSync(audioPath,'<html>busy</html>');return {success:true,audioPath};});
 assert.equal(result.success,false);assert.equal(JSON.parse(readFileSync(result.receiptPath)).status,'uncertain');
});
test('media and alignment validators reject corrupt payloads and nonfinite timings',()=>{
 assert.equal(validateSpeechAudio(bytes,'wav'),1);
 for(const value of ['', '###=', 'a', '!!!!'])assert.throws(()=>decodeSpeechBase64(value));
 for(const value of [Buffer.alloc(0),bytes.subarray(0,bytes.length-1),Buffer.from('<html>')])assert.throws(()=>validateSpeechAudio(value,'wav'));
 const good={characters:['a','b'],character_start_times_seconds:[0,0.2],character_end_times_seconds:[0.2,0.4]};validateSpeechAlignment(good,1);
 for(const bad of [{...good,characters:['a']},{...good,character_end_times_seconds:[0.2,Infinity]},{...good,character_start_times_seconds:[0.3,0.2]},{...good,character_end_times_seconds:[0.2,2]}])assert.throws(()=>validateSpeechAlignment(bad,1));
});

test('router submits one request, preserves usage, and charges no duplicate ledger row on replay',async()=>{
 const originalFetch=globalThis.fetch,originalKey=config.elevenLabsApiKey;
 config.elevenLabsApiKey='test-'+randomUUID(); let submits=0;
 const episode=join(root,'episode');mkdirSync(join(episode,'storyboard'),{recursive:true});writeFileSync(join(episode,'storyboard','scenes.js'),'window.SCENES=[]');
 globalThis.fetch=async()=>{submits++;return new Response(bytes,{headers:{'content-type':'audio/wav','character-cost':'2','request-id':'provider-1'}});};
 try {
  const request={action:'execute',requestId:'line-r1',generator:'tts_elevenlabs_generate',generation:{text:'hello',voiceId:'voice123',outputPath:join(episode,'.work','speech'),filename:'line.wav'}};
  const first=await routeSpeech(request),second=await routeSpeech(request);
  assert.equal(first.success,true,first.error);assert.equal(second.replayed,true);assert.equal(submits,1);
  assert.equal(readFileSync(join(episode,'.work','events.jsonl'),'utf8').trim().split('\n').length,1);
  assert.equal(first.characterCost,2);
  for(const status of [429,500]){globalThis.fetch=async()=>{submits++;return new Response('busy',{status});};const before=submits;
   const result=await routeSpeech({...request,requestId:'failure-'+status});assert.equal(result.success,false);assert.equal(submits,before+1);
  }
 } finally {globalThis.fetch=originalFetch;config.elevenLabsApiKey=originalKey;}
});

test('voice segment timings and speaker references are mechanically checked',()=>{
 const good={voice_id:'a',start_time_seconds:0,end_time_seconds:0.5,character_start_index:0,character_end_index:2,dialogue_input_index:0};
 validateSpeechSegments([good],1,[{voice_id:'a'}]);
 for(const change of [{start_time_seconds:NaN},{end_time_seconds:2},{character_end_index:-1},{dialogue_input_index:1},{voice_id:'wrong'}]) assert.throws(()=>validateSpeechSegments([{...good,...change}],1,[{voice_id:'a'}]));
});

test('invalid WAV format/width combinations cannot be certified successful',async()=>{
 for(const [format,bits] of [[3,8],[3,16],[3,24],[1,64],[7,16]]) {
  const invalid=Buffer.from(bytes); invalid.writeUInt16LE(format,20); invalid.writeUInt16LE(bits,34);
  invalid.writeUInt16LE(bits/8,32); invalid.writeUInt32LE(24000*bits/8,28);
  assert.throws(()=>validateSpeechAudio(invalid,'wav'),/encoding/);
  const result=await executeSpeech('tts_generate',args('invalid-encoding-'+format+'-'+bits),async output=>{
   const audioPath=join(output.outputPath,output.filename);writeFileSync(audioPath,invalid);return {success:true,audioPath};
  });
  assert.equal(result.success,false);assert.equal(JSON.parse(readFileSync(result.receiptPath)).status,'uncertain');
 }
 for(const bits of [32,64]) {
  const valid=Buffer.from(bytes);valid.writeUInt16LE(3,20);valid.writeUInt16LE(bits,34);valid.writeUInt16LE(bits/8,32);valid.writeUInt32LE(24000*bits/8,28);
  assert.equal(validateSpeechAudio(valid,'wav'),48000/(24000*bits/8));
 }
});

test('compressed audio must decode: fake MP3 frames fail through the router',async()=>{
 const frame=Buffer.alloc(417,0xff);Buffer.from([0xff,0xfb,0x90,0x00]).copy(frame);
 const invalid=Buffer.concat(Array.from({length:100},()=>frame));
 assert.throws(()=>validateSpeechAudio(invalid,'mp3'));
 const valid=execFileSync('ffmpeg',['-v','error','-f','wav','-i','pipe:0','-f','mp3','pipe:1'],{input:bytes});
 assert.ok(validateSpeechAudio(valid,'mp3')>0);
 const originalFetch=globalThis.fetch,originalKey=config.elevenLabsApiKey;config.elevenLabsApiKey='test-'+randomUUID();let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(invalid,{headers:{'content-type':'audio/mpeg'}});};
 try {
  const result=await routeSpeech({action:'execute',requestId:'corrupt-mp3',generator:'tts_elevenlabs_generate',generation:{text:'hi',voiceId:'voice123',outputFormat:'mp3_44100_128',outputPath:join(root,'corrupt-mp3'),filename:'voice.mp3'}});
  assert.equal(result.success,false);assert.equal(calls,1);assert.equal(JSON.parse(readFileSync(result.receiptPath)).status,'uncertain');
  assert.equal(existsSync(join(root,'corrupt-mp3','voice.mp3')),false);
 }finally{globalThis.fetch=originalFetch;config.elevenLabsApiKey=originalKey;}
});

test('uppercase WAV and MP3 names complete and replay without another submission',async()=>{
 const originalFetch=globalThis.fetch,originalKey=config.elevenLabsApiKey;config.elevenLabsApiKey='test-'+randomUUID();
 const mp3=execFileSync('ffmpeg',['-v','error','-f','wav','-i','pipe:0','-f','mp3','pipe:1'],{input:bytes});let calls=0;
 try {
  for(const [extension,outputFormat,audio] of [['WAV','wav_24000',bytes],['MP3','mp3_44100_128',mp3]]){
   globalThis.fetch=async()=>{calls++;return new Response(audio);};const before=calls;
   const request={action:'execute',requestId:'upper-'+extension,generator:'tts_elevenlabs_generate',generation:{text:'hello',voiceId:'voice123',outputFormat,outputPath:join(root,'uppercase'),filename:'voice.'+extension}};
   assert.equal((await routeSpeech({...request,action:'plan'})).enabled,true);
   const first=await routeSpeech(request),second=await routeSpeech(request);
   assert.equal(first.success,true,first.error);assert.equal(JSON.parse(readFileSync(first.receiptPath)).status,'completed');assert.equal(second.replayed,true);assert.equal(calls,before+1);
  }
 }finally{globalThis.fetch=originalFetch;config.elevenLabsApiKey=originalKey;}
});
