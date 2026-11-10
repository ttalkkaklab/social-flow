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

test('managed retakes validate the speaker before raw synthesis and bind the completed receipt through assembly', async t=>{
 const {manageSpeech}=await import('../dist/speech.js');
 const {generateGenaiSpeech}=await import('../dist/astra-genai-speech.js');
 const {pcmToWav}=await import('../dist/media-utils.js');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'managed-voice-')),target=path.join(dir,'storyboard'),output=path.join(dir,'speech');
 fs.mkdirSync(target);t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const voice={engine:'astra-genai',model:'voxcpm2',voiceId:'hero',language:'ko',speed:1};
 const line={id:'l1',speaker:'hero',tts:'Hello',delivery:'voiceover',acting:{direction:'Calm'}};
 const board={SB_DOC:{speechPlanVersion:1,characters:[{id:'hero',tts:voice}]},SCENES:[{id:'s1',narration:[line]}]};
 fs.writeFileSync(path.join(target,'scenes.js'),Object.entries(board).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 const plan=manageSpeech({path:target,action:'plan_audio',lineId:'l1'}).audioPlans[0];
 const args={...plan.generation,requestId:'managed',outputPath:output,filename:'take.wav'};
 let calls=0;const oldFetch=globalThis.fetch,key=config.astraGenaiApiKey;config.astraGenaiApiKey='fixture';
 t.after(()=>{globalThis.fetch=oldFetch;config.astraGenaiApiKey=key;});
 globalThis.fetch=async(_url,opts)=>{calls++;const body=JSON.parse(opts.body);assert.equal(body.voice,'hero');assert.equal(body.speechContext,undefined);return new Response(pcmToWav(Buffer.alloc(1600),8000,1));};
 await assert.rejects(generateGenaiSpeech({...args,voice:'default'}),/speech_context_mismatch/);
 await assert.rejects(generateGenaiSpeech({...args,speechContext:undefined}),/speech_context_required/);
 assert.equal(calls,0);
 const result=await routeSpeech({action:'execute',generator:'tts_astra_genai',requestId:'managed',generation:args});
 assert.equal(result.success,true);assert.equal(calls,1);
 const attach=generation=>manageSpeech({path:target,action:'attach_audio',lineId:'l1',expectedRevision:manageSpeech({path:target,action:'list'}).revision,audioPath:result.audioPath,generation});
 const proof={generator:'tts_astra_genai',voiceSettings:args,text:'Hello',language:'ko'};
 assert.throws(()=>attach(proof),/speech_receipt_required/);
 const bound=attach({...proof,receiptPath:result.receiptPath});assert.equal(bound.lines[0].audioCurrent,true);
 assert.equal(bound.lines[0].audio.generation.receiptPath,result.receiptPath);
 const work=path.join(dir,'.work');fs.mkdirSync(work,{recursive:true});fs.writeFileSync(path.join(work,'cards.tsv'),'0\t../speech/take.wav\t1\n');
 const checker=require('../../skills/produce/references/check-tts-quality.js');
 assert.ok(checker.check(work,target)[result.receiptPath]);
 const receipt=JSON.parse(fs.readFileSync(result.receiptPath,'utf8'));receipt.generation.voice='default';
 fs.writeFileSync(result.receiptPath,JSON.stringify(receipt));
 assert.throws(()=>attach({...proof,receiptPath:result.receiptPath}),/speech_receipt_voice_mismatch/);
 assert.equal(manageSpeech({path:target,action:'list'}).lines[0].audioCurrent,false);
 assert.throws(()=>checker.check(work,target),/speech_receipt_voice_mismatch/);
 assert.throws(()=>require('../../skills/produce/references/compose-speech.js').compose(work,target),/speech_receipt_voice_mismatch/);
});

test('an explicit episode default-voice exception survives planning and inspection without losing board context',async t=>{
 const {manageSpeech}=await import('../dist/speech.js');
 const {createHash}=await import('node:crypto');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'voice-exception-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const sample=path.join(dir,'sample.wav');fs.writeFileSync(sample,'sample');
 const voice={engine:'astra-genai',model:'voxcpm2',voiceId:'default',language:'ko',speed:1};
 const board={PRODUCTION:{modelSettings:{overrides:{speech:{...voice,request:'Use default for this episode explicitly'}}}},
  SB_DOC:{characters:[{id:'hero',tts:voice,voiceReference:{path:sample,sha256:createHash('sha256').update('sample').digest('hex'),tts:voice}}]},
  SCENES:[{id:'s1',narration:[{id:'l1',speaker:'hero',tts:'Hello',delivery:'voiceover'}]}]};
 const file=path.join(dir,'scenes.js');fs.writeFileSync(file,Object.entries(board).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 const result=manageSpeech({path:file,action:'plan_audio',lineId:'l1'});
 assert.equal(result.audioPlans[0].generation.voice,'default');assert.equal(result.lines[0].generationPlan.available,true);
 const original=fs.readFileSync(file,'utf8');delete board.PRODUCTION;
 fs.writeFileSync(file,Object.entries(board).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 assert.throws(()=>manageSpeech({path:file,action:'plan_audio',lineId:'l1'}),/character_voice_unregistered/);
 assert.notEqual(fs.readFileSync(file,'utf8'),original);
});
