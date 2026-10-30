import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { config } from '../dist/config.js';
import { routeSpeech } from '../dist/tts-routing.js';
import { buildGenaiSpeechBody } from '../dist/astra-genai-speech.js';
import { speechAudioPlan } from '../dist/speech.js';
const require=createRequire(import.meta.url);
test('saved gateway character speech compiles instructions and preserves single-speaker provenance',()=>{
  const tts={engine:'astra-genai',model:'voxcpm2',voiceId:'narrator',language:'en',speed:1,voiceDirection:'Calm'};
  const line={tts:'Hello',id:'l1',speaker:'a'}, plan=speechAudioPlan(line,{id:'a',tts});
  assert.equal(plan.generator,'tts_astra_genai');assert.equal(plan.generation.voice,'narrator');assert.match(plan.generation.instructions,/Calm/);
  assert.deepEqual(require('../../skills/_shared/character-voice.js').generationVoiceErrors(tts,{generator:plan.generator,voiceSettings:plan.generation,text:'Hello',language:'en'},line),[]);
  assert.throws(()=>buildGenaiSpeechBody({...plan.generation,ref_audio:'/server/voice.wav'}));
});
test('binary speech uses registered voice and replay receipt prevents a second synthesis; origin is fingerprinted',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gateway-speech-')), original=globalThis.fetch,key=config.astraGenaiApiKey,url=process.env.ASTRA_GENAI_URL;
  config.astraGenaiApiKey='fixture';t.after(()=>{globalThis.fetch=original;config.astraGenaiApiKey=key;if(url===undefined)delete process.env.ASTRA_GENAI_URL;else process.env.ASTRA_GENAI_URL=url;fs.rmSync(dir,{recursive:true,force:true});});
  const wav=Buffer.alloc(44+1600);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);
  let calls=0;globalThis.fetch=async(url,opts)=>{calls++;assert.ok(String(url).endsWith('/v1/audio/speech'));assert.equal(opts.headers.Authorization,'Bearer fixture');const b=JSON.parse(opts.body);assert.equal(b.input,'Hello');assert.equal(b.voice,'narrator');assert.equal(b.max_tokens,100);return new Response(wav);};
  const request={action:'execute',generator:'tts_astra_genai',requestId:'one',generation:{model:'vox',text:'Hello',voice:'narrator',maxTokens:100,outputPath:dir,filename:'line.wav'}};
  const first=await routeSpeech(request);assert.equal(first.success,true);const second=await routeSpeech(request);assert.equal(second.replayed,true);assert.equal(calls,1);
  process.env.ASTRA_GENAI_URL='http://different.example';await assert.rejects(routeSpeech(request),/different arguments/);assert.equal(calls,1);
});

test('public speech requestId replays and a new ID cannot bill over an existing output',async t=>{
 const {generateGenaiSpeech}=await import('../dist/astra-genai-speech.js');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gateway-existing-')),original=globalThis.fetch,key=config.astraGenaiApiKey;
 config.astraGenaiApiKey='fixture';t.after(()=>{globalThis.fetch=original;config.astraGenaiApiKey=key;fs.rmSync(dir,{recursive:true,force:true});});
 fs.writeFileSync(path.join(dir,'line.wav'),'existing media');let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('unexpected inference');};
 await assert.rejects(generateGenaiSpeech({model:'vox',text:'Hello',requestId:'new',outputPath:dir,filename:'line.wav'}),/already exists/);assert.equal(calls,0);
});
