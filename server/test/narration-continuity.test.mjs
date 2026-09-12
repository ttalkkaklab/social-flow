import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import {checkedSpeechSchema,prepareGeneration,generateCheckedSpeech,sha256} from '../dist/tts-quality.js';
import {elevenLabsGenerateSchema} from '../dist/elevenlabs-client.js';
import {pcmToWav} from '../dist/media-utils.js';
const require=createRequire(import.meta.url), checker=require('../../skills/produce/references/check-tts-quality.js'), finalChecker=require('../../skills/produce/references/check-final-tts.js');
const texts=['오늘의 이야기를 시작합니다.','다음 문장도 같은 목소리로 읽어요.','이렇게 이야기를 마칩니다.'];
function setup(t){const dir=mkdtempSync(path.join(tmpdir(),'continuity-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
function request(dir,index=1){return checkedSpeechSchema.parse({generator:'tts_elevenlabs_generate',generation:{text:texts[index],voiceId:'voice',model:'eleven_multilingual_v2',speed:1.2},expectedText:texts[index],language:'Korean',delivery:'Calm connected narration.',outputPath:dir,filename:`c${index}.wav`,episode:{texts,index,seed:210836}});}
const good={accuracy:100,pronunciation:98,naturalness:98,clarity:98,continuity:98,continuityEvidence:'At 1.2 seconds the next sentence continues the same tone naturally.',confidence:0.98,complete:true,evidence:'The complete speech has clear endings and no clipped breaths or unnatural joins.',issues:[]};
test('episode derives real preceding/following text and keeps native synthesis speed',t=>{
 const dir=setup(t);
 for(let i=0;i<texts.length;i++){
  const p=prepareGeneration(request(dir,i));assert.equal(p.args.previousText,texts.slice(0,i).join(' ')||undefined);assert.equal(p.args.nextText,texts.slice(i+1).join(' ')||undefined);assert.equal(p.args.seed,210836);assert.equal(p.args.speed,1.2);
 }
 const r=request(dir);
 assert.throws(()=>prepareGeneration({...r,generation:{...r.generation,seed:1}}),/seed/);
 assert.throws(()=>prepareGeneration({...r,generation:{...r.generation,previousText:'wrong'}}),/previousText/);
 const v3=prepareGeneration({...r,generation:{...r.generation,model:'eleven_v3'}});assert.equal(v3.args.previousText,undefined);assert.equal(v3.args.nextText,undefined);assert.equal(v3.args.seed,210836);
 assert.equal(checkedSpeechSchema.safeParse({...r,episode:{...r.episode,index:99}}).success,false);
 assert.equal(checkedSpeechSchema.safeParse({...r,playbackSpeed:1.2}).success,false);
});
test('dictionaries retain versions and reject silent malformed locators',()=>{
 const base={text:'어을우동',voiceId:'voice',pronunciationDictionaryLocators:[{pronunciationDictionaryId:'dict',versionId:'v1'}]};
 assert.deepEqual(elevenLabsGenerateSchema.parse(base).pronunciationDictionaryLocators,base.pronunciationDictionaryLocators);
 for(const locators of [[{pronunciationDictionaryId:'dict'}],Array(4).fill(base.pronunciationDictionaryLocators[0]),[{pronunciationDictionaryId:'',versionId:'v1'}]])assert.equal(elevenLabsGenerateSchema.safeParse({...base,pronunciationDictionaryLocators:locators}).success,false);
});
test('identical rejected audio stops without another review, seed change or reset',async t=>{
 const dir=setup(t),r=request(dir),file=path.join(dir,r.filename);let calls=0,reviews=0;const seeds=[];
 const deps={preflight:async()=>{},generate:async o=>{calls++;seeds.push(o.seed);writeFileSync(file,pcmToWav(Buffer.alloc(48000,12),24000,1));return {success:true,audioPath:file};},measure:async()=>({duration:2,rmsDb:-18,clippedFraction:0}),listen:async()=>{reviews++;return {transcript:r.expectedText,review:{...good,naturalness:70}};}};
 const result=await generateCheckedSpeech(r,deps);assert.equal(result.status,'fail');assert.equal(calls,2);assert.equal(reviews,1);assert.deepEqual(seeds,[210836,210836]);
 assert.equal((await generateCheckedSpeech(r,deps)).status,'fail');assert.equal(calls,2);
});
test('both tempo passes reject per-card normalization and doubled speed before encoding',t=>{
 const dir=setup(t),r=request(dir),file=path.join(dir,r.filename);writeFileSync(file+'.quality.json',JSON.stringify({generator:r.generator}));writeFileSync(path.join(dir,'cards.tsv'),`1\t${file}\t4.5\tin\n`);
 assert.doesNotThrow(()=>checker.checkTempo(dir,1,1,1));
 for(const args of [[1.2,1,1],[1,0.88,1.18],[NaN,1,1]])assert.throws(()=>checker.checkTempo(dir,...args),/tempo changes/);
 for(const name of ['build-reel.sh','speedup.sh'])assert.match(readFileSync(path.resolve(import.meta.dirname,'../../skills/produce/references',name),'utf8'),/checkTempo/);
});
test('real ffmpeg final audio review rejects continuity-only defects and binds actual media',t=>{
 const dir=setup(t),file=path.join(dir,'joined.wav');
 const pcm=Buffer.alloc(24000*2*2);for(let i=0;i<pcm.length/2;i++)pcm.writeInt16LE(Math.round(5000*Math.sin(i*2*Math.PI*220/24000)),i*2);
 writeFileSync(file,pcmToWav(pcm,24000,1));
 const child=`
 import {reviewFinalSpeech} from './dist/tts-final-quality.js';
 import {writeFileSync,readFileSync} from 'node:fs';
 let calls=0;globalThis.fetch=async()=>{calls++;const value=calls%2?{transcript:${JSON.stringify(texts[1])}}:{...${JSON.stringify(good)},continuity:calls===2?70:98};return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]}),{headers:{'Content-Type':'application/json'}});};
 const req=${JSON.stringify({mediaPath:file,expectedText:texts[1],language:'Korean',delivery:'One connected narrator.'})};
 const a=await reviewFinalSpeech(req);if(a.status!=='fail')throw new Error(JSON.stringify(a));
 const cosmetic=await reviewFinalSpeech({...req,expectedText:req.expectedText.replace(/.$/,'!'),delivery:'A slightly revised direction.'});if(cosmetic.status!=='fail'||calls!==2)throw new Error('cosmetic edits must not reroll scores');
 const rejectedAgain=await reviewFinalSpeech(req);if(rejectedAgain.status!=='fail'||!rejectedAgain.reused||calls!==2)throw new Error('failed media must not reroll scores');
 writeFileSync(req.mediaPath,Buffer.concat([readFileSync(req.mediaPath),Buffer.from('metadata-changed-for-test')]));
 const remux=await reviewFinalSpeech(req);if(remux.status!=='fail'||calls!==2)throw new Error('metadata must not reroll scores');
 const changed=readFileSync(req.mediaPath);changed.writeInt16LE(1500,2048);writeFileSync(req.mediaPath,changed);
 const b=await reviewFinalSpeech(req);if(!b.success)throw new Error(JSON.stringify(b));
 const c=await reviewFinalSpeech(req);if(!c.reused||calls!==4)throw new Error('cache failed');
 console.log(JSON.stringify({calls}));`;
 const run=spawnSync(process.execPath,['--input-type=module','-e',child],{cwd:path.resolve(import.meta.dirname,'..'),encoding:'utf8',env:{...process.env,GEMINI_API_KEY:'test-only',GOOGLE_API_KEY:'test-only',GOOGLE_GENAI_USE_VERTEXAI:'false'}});
 assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).calls,4);
 const p=JSON.parse(readFileSync(file+'.speech-quality.json','utf8'));
 assert.doesNotThrow(()=>finalChecker.verify(file,texts[1]));
 assert.throws(()=>finalChecker.verifyReport({...p,review:{...p.review,continuity:94}},file,texts[1]),/continuity/);
 assert.throws(()=>finalChecker.verifyReport({...p,review:{...p.review,continuityEvidence:''}},file,texts[1]),/evidence/);
 writeFileSync(file,Buffer.concat([readFileSync(file),Buffer.from('changed')]));assert.throws(()=>finalChecker.verify(file,texts[1]),/hash-bound/);
});

test('mixed generated, recording and b-roll speech uses actual playback order',t=>{
 const dir=setup(t),board=path.join(dir,'scenes.js');
 writeFileSync(board,`window.SCENES=[{type:'points',narration:[{tts:'첫 문장입니다.'}]},{type:'points',visual:{source:'recording'},narration:[]},{type:'broll',after:0,narration:[{tts:'삽입된 말입니다.'}]}];window.STORY={transcripts:[{shot:2,groups:[{text:'녹음한 목소리입니다.',start:0,end:2}]}]};`);
 assert.deepEqual(finalChecker.narration(board),{generated:true,text:'첫 문장입니다.. 삽입된 말입니다.. 녹음한 목소리입니다.'});
});
test('dictionary and native speed/context reach the real HTTP serialization',t=>{
 const dir=setup(t);
 const child=`
 import {generateElevenLabsSpeech,elevenLabsGenerateSchema,createElevenLabsDictionary} from './dist/elevenlabs-client.js';
 import {pcmToWav} from './dist/media-utils.js';
 const requests=[];globalThis.fetch=async(url,init)=>{const body=JSON.parse(init.body);requests.push({url:String(url),body});return String(url).includes('add-from-rules')?new Response(JSON.stringify({id:'dict',version_id:'v1'}),{status:200}):new Response(pcmToWav(Buffer.alloc(48000),24000,1),{status:200});};
 const dict=await createElevenLabsDictionary({name:'test',rules:[{stringToReplace:'어을우동',alias:'어으루동'}]});
 const result=await generateElevenLabsSpeech(elevenLabsGenerateSchema.parse({text:'어을우동',voiceId:'voice',outputPath:${JSON.stringify(dir)},filename:'out.wav',seed:210836,speed:1.2,previousText:'앞 문장',nextText:'뒷 문장',pronunciationDictionaryLocators:[dict]}));
 if(!result.success)throw new Error(result.error);console.log(JSON.stringify(requests));`;
 const run=spawnSync(process.execPath,['--input-type=module','-e',child],{cwd:path.resolve(import.meta.dirname,'..'),encoding:'utf8',env:{...process.env,ELEVENLABS_API_KEY:'test-only'}});
 assert.equal(run.status,0,run.stderr);const [d,r]=JSON.parse(run.stdout);
 assert.deepEqual(d.body.rules,[{type:'alias',string_to_replace:'어을우동',alias:'어으루동'}]);
 assert.equal(r.body.text,'어을우동');assert.equal(r.body.seed,210836);assert.equal(r.body.voice_settings.speed,1.2);assert.equal(r.body.previous_text,'앞 문장');assert.equal(r.body.next_text,'뒷 문장');
 assert.deepEqual(r.body.pronunciation_dictionary_locators,[{pronunciation_dictionary_id:'dict',version_id:'v1'}]);
});

test('TTS over recording backgrounds requires source and final speech review',t=>{
 const dir=setup(t),board=path.join(dir,'storyboard'),work=path.join(dir,'.work');mkdirSync(board);mkdirSync(work);
 const file=path.join(work,'recording.mp4');writeFileSync(file,'test media');writeFileSync(path.join(work,'cards.tsv'),`0\t${file}\t4.5\tin\n`);
 const scene={type:'points',visual:{source:'recording'},narration:[{tts:texts[0]}]};writeFileSync(path.join(board,'scenes.js'),`window.SCENES=${JSON.stringify([scene])};`);
 assert.equal(finalChecker.narration(path.join(board,'scenes.js')).generated,true);
 assert.throws(()=>checker.check(work,board),/generate with tts_generate_checked/);
});
test('deleting the storyboard cannot waive final delivery evidence',t=>{
 const dir=setup(t),out=path.join(dir,'output/video');mkdirSync(out,{recursive:true});
 writeFileSync(path.join(out,'video.mp4'),'video');writeFileSync(path.join(out,'subs.srt'),'subs');
 writeFileSync(path.join(out,'delivery-proof.json'),JSON.stringify({version:1,kind:'storyboard',editCheckSha256:'edit',assembledSha256:'assembly',outputs:{'video.mp4':sha256('video'),'video-sub.mp4':null,'subs.srt':sha256('subs')}}));
 const gate=require('../../skills/produce/references/delivery-proof.js');assert.match(gate.check(dir),/storyboard missing/);
});

test('assembly rejects missing context, changed order and voice drift despite source PASS',async t=>{
 const dir=setup(t),board=path.join(dir,'storyboard'),work=path.join(dir,'.work');mkdirSync(board);mkdirSync(work);
 writeFileSync(path.join(board,'scenes.js'),`window.SCENES=${JSON.stringify(texts.map(tts=>({type:'points',narration:[{tts}]})))};`);
 const files=[];
 for(let i=0;i<texts.length;i++){
  const r=request(work,i),file=path.join(work,r.filename);files.push(file);
  const deps={preflight:async()=>{},generate:async()=>{writeFileSync(file,pcmToWav(Buffer.alloc(48000,12+i),24000,1));return {success:true,audioPath:file};},measure:async()=>({duration:2,rmsDb:-18,clippedFraction:0}),listen:async()=>({transcript:r.expectedText,review:good})};
  assert.equal((await generateCheckedSpeech(r,deps)).success,true);
 }
 writeFileSync(path.join(work,'cards.tsv'),files.map((f,i)=>`${i}\t${f}\t4.5\tin`).join('\n'));
 assert.doesNotThrow(()=>checker.check(work,board));
 const file=files[1]+'.quality.json',original=JSON.parse(readFileSync(file,'utf8'));
 for(const mutate of [p=>delete p.episode,p=>p.episode.texts.reverse(),p=>p.voiceSettings.speed=1.1,p=>p.attempts[0].seed++]){
  const p=structuredClone(original);mutate(p);writeFileSync(file,JSON.stringify(p));assert.throws(()=>checker.check(work,board),/episode|settings/);
 }
});
