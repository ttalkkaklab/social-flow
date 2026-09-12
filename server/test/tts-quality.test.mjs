import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { REVIEW_MODEL, checkedSpeechSchema, prepareGeneration, generateCheckedSpeech, characterErrorRate, normalizeSpeech, reviewFailures, signalFailures, measureSignal } from '../dist/tts-quality.js';
import { pcmToWav } from '../dist/media-utils.js';
import { TOOLS } from '../dist/tools.js';
import { ROUTES } from '../dist/handlers.js';
const require=createRequire(import.meta.url);
const checker=require('../../skills/produce/references/check-tts-quality.js');
const script='오늘은 맑고 따뜻한 날입니다.';
const good=()=>({accuracy:100,pronunciation:98,naturalness:97,clarity:99,confidence:0.98,complete:true,evidence:'Every word and final syllable is clear, with smooth phrase breaks and no audible artifacts.',issues:[]});
const signal={duration:2.4,rmsDb:-18,clippedFraction:0};
function setup(t){
  const dir=mkdtempSync(path.join(tmpdir(),'tts-quality-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  mkdirSync(path.join(dir,'storyboard'));mkdirSync(path.join(dir,'.work/pcm'),{recursive:true});
  writeFileSync(path.join(dir,'storyboard/scenes.js'),`window.SCENES=[{type:'points',narration:[{tts:${JSON.stringify(script)}}]}];`);
  const request=checkedSpeechSchema.parse({generator:'tts_local_generate',generation:{text:script,voice:'F1',lang:'ko'},expectedText:script,language:'Korean',delivery:'Calm and conversational.',outputPath:path.join(dir,'.work/pcm'),filename:'c0.wav'});
  const file=path.join(request.outputPath,request.filename);
  writeFileSync(path.join(dir,'.work/cards.tsv'),`0\t${file}\t4.5\tin\n`);
  let count=0;
  const deps={preflight:async()=>{},generate:async()=>{count++;writeFileSync(file,pcmToWav(Buffer.alloc(48000,count),24000,1));return {success:true,audioPath:file};},measure:async()=>({...signal}),listen:async()=>({transcript:script,review:good()})};
  return {dir,request,file,deps,count:()=>count,proof:()=>JSON.parse(readFileSync(file+'.quality.json','utf8'))};
}
test('tool surface exposes bounded attempts and uses the existing route',()=>{
  const tool=TOOLS.find(t=>t.name==='tts_generate_checked');assert.ok(tool);assert.equal(typeof ROUTES[tool.name],'function');
  assert.equal(tool.inputSchema.properties.maxAttempts.maximum,3);
  assert.equal(checkedSpeechSchema.safeParse({maxAttempts:4}).success,false);
});
test('wrong words, missing endings, uncertainty and robotic delivery cannot pass',()=>{
  assert.ok(characterErrorRate(script,'오늘은 흐리고 추운 날입니다.')>0.02);
  assert.equal(characterErrorRate('오늘은 맑습니다.','오늘은  맑습니다!'),0);
  assert.ok(reviewFailures(script,script.slice(0,-4),good(),2.4).length);
  for(const patch of [{naturalness:94},{pronunciation:94},{accuracy:97},{clarity:94},{confidence:0.89},{complete:false},{issues:[{start:1,end:2,category:'pronunciation',heard:'wrong',expected:'right',correction:'Retake the final word'}]}])assert.ok(reviewFailures(script,script,{...good(),...patch},2.4).length);
  for(const patch of [{duration:600},{rmsDb:-80},{clippedFraction:0.01},{duration:NaN}])assert.ok(signalFailures({...signal,...patch},script).length);
});
test('failed naturalness regenerates only the scene, and unchanged PASS costs no extra calls',async t=>{
  const f=setup(t);let reviews=0;
  f.deps.listen=async()=>({transcript:script,review:{...good(),naturalness:++reviews===1?80:98}});
  const result=await generateCheckedSpeech(f.request,f.deps);
  assert.equal(result.success,true);assert.equal(f.count(),2);assert.equal(f.proof().attempts.length,2);
  assert.ok(f.proof().attempts[0].failures.includes('naturalness below threshold'));
  assert.ok(checker.check(path.join(f.dir,'.work'),path.join(f.dir,'storyboard'))[f.file]);
  assert.equal((await generateCheckedSpeech(f.request,f.deps)).reused,true);assert.equal(f.count(),2);
  const events=readFileSync(path.join(f.dir,'.work/events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.filter(e=>e.tool==='tts_local_generate').length,2);
});
test('exhausted attempts stay exhausted across calls, even if a caller retries',async t=>{
  const f=setup(t);f.deps.listen=async()=>({transcript:script,review:{...good(),pronunciation:70}});
  assert.equal((await generateCheckedSpeech(f.request,f.deps)).status,'fail');assert.equal(f.count(),3);
  assert.throws(()=>checker.verifyProof(f.file,script),/PASS/);
  assert.equal((await generateCheckedSpeech(f.request,f.deps)).status,'fail');assert.equal(f.count(),3);
});
test('final listening can reject an exact passed take without resetting its budget',async t=>{
  const f=setup(t);await generateCheckedSpeech(f.request,f.deps);
  const rejectTake={audioSha256:f.proof().audioSha256,reason:'At 1.2 seconds the final word sounds robotic.'};
  assert.equal((await generateCheckedSpeech({...f.request,rejectTake},f.deps)).status,'pass');
  assert.equal(f.count(),2);assert.equal(f.proof().attempts[0].authorRejection,rejectTake.reason);
  assert.equal((await generateCheckedSpeech({...f.request,rejectTake},f.deps)).status,'unverified');assert.equal(f.count(),2);
});
test('review outage stops synthesis and resumes the same candidate after recovery',async t=>{
  const f=setup(t);f.deps.listen=async()=>{throw new Error('review timeout');};
  const result=await generateCheckedSpeech(f.request,f.deps);
  assert.equal(result.status,'unverified');assert.equal(f.count(),1);assert.equal(f.proof().attempts[0].pending,true);
  assert.throws(()=>checker.verifyProof(f.file,script),/PASS/);
  f.deps.listen=async()=>({transcript:script,review:good()});
  assert.equal((await generateCheckedSpeech(f.request,f.deps)).status,'pass');assert.equal(f.count(),1);
});
test('preflight failure spends no synthesis, malformed or changed-audio reviews never pass',async t=>{
  const f=setup(t);f.deps.preflight=async()=>{throw new Error('missing key');};
  assert.equal((await generateCheckedSpeech(f.request,f.deps)).status,'unverified');assert.equal(f.count(),0);
  f.deps.preflight=async()=>{};f.deps.listen=async()=>({transcript:script,review:{...good(),naturalness:NaN}});
  assert.equal((await generateCheckedSpeech(f.request,f.deps)).status,'unverified');assert.equal(f.count(),1);
  f.deps.listen=async()=>{writeFileSync(f.file,'replaced during review');return {transcript:script,review:good()};};
  assert.match((await generateCheckedSpeech(f.request,f.deps)).error,/changed during review/);
});
test('builder rejects missing evidence, altered WAV/text, lowered scores and sync bypass',async t=>{
  const f=setup(t);await f.deps.generate();
  assert.throws(()=>checker.check(path.join(f.dir,'.work'),path.join(f.dir,'storyboard')),/generate with tts_generate_checked/);
  await generateCheckedSpeech(f.request,f.deps);const proof=f.proof();
  assert.throws(()=>checker.verifyProof(f.file,'내일은 맑고 따뜻한 날입니다.'),/narration changed/);
  proof.attempts.at(-1).review.naturalness=80;writeFileSync(f.file+'.quality.json',JSON.stringify(proof));
  assert.throws(()=>checker.verifyProof(f.file,script),/naturalness/);
  writeFileSync(path.join(f.dir,'.work/cards.tsv'),`0\t${f.file}\t4.5\tnone\tsync=1\n`);
  assert.throws(()=>checker.check(path.join(f.dir,'.work'),path.join(f.dir,'storyboard')),/naturalness/);
  writeFileSync(f.file,'different');assert.throws(()=>checker.verifyProof(f.file,script),/audio changed/);
});
test('real recordings and silence keep audio provenance without a synthesis proof',t=>{
  const f=setup(t);writeFileSync(f.file,'recorded');
  for(const scene of [{type:'points',visual:{source:'recording'},narration:[]},{type:'points',visual:{source:'screencast',sync:true},narration:[{tts:script}]},{type:'points',narration:[]}]){
    writeFileSync(path.join(f.dir,'storyboard/scenes.js'),`window.SCENES=${JSON.stringify([scene])};`);
    assert.ok(checker.check(path.join(f.dir,'.work'),path.join(f.dir,'storyboard'))[f.file]);
  }
  writeFileSync(path.join(f.dir,'storyboard/scenes.js'),`window.SCENES=[{type:'points',visual:{source:'screencast'},narration:[{tts:${JSON.stringify(script)}}]}];`);
  assert.throws(()=>checker.check(path.join(f.dir,'.work'),path.join(f.dir,'storyboard')),/generate with tts_generate_checked/);
});
test('generation args bind the whole spoken text and preserve voice settings',t=>{
  const f=setup(t);const prepared=prepareGeneration(f.request);
  assert.equal(prepared.args.voice,'F1');assert.equal(prepared.args.text,script);
  assert.throws(()=>prepareGeneration({...f.request,expectedText:'다른 대본'}),/match the complete/);
  const eleven={...f.request,generator:'tts_elevenlabs_generate',generation:{text:'[whispers] '+script,voiceId:'21m00Tcm4TlvDq8ikWAM',model:'eleven_v3'}};
  assert.equal(prepareGeneration(eleven).args.voiceId,eleven.generation.voiceId);
  assert.throws(()=>prepareGeneration({...f.request,filename:'../outside.wav'}));
});
test('real PCM measurements detect silence and clipping without model calls',async t=>{
  if(spawnSync('ffmpeg',['-version']).status!==0)return t.skip('ffmpeg unavailable');
  const f=setup(t);writeFileSync(f.file,pcmToWav(Buffer.alloc(48000),24000,1));
  assert.ok(signalFailures(await measureSignal(f.file),script).includes('Silent or nearly silent audio'));
  const pcm=Buffer.alloc(48000);for(let i=0;i<24000;i++)pcm.writeInt16LE(i%2?32767:-32768,i*2);
  writeFileSync(f.file,pcmToWav(pcm,24000,1));assert.ok(signalFailures(await measureSignal(f.file),script).includes('Digital clipping'));
});
test('the builder-side CER and normalizer never drift from the server-side pair',()=>{
  // Two hand-written copies (server/src/tts-quality.ts and skills/produce/references/check-tts-quality.js):
  // the builder cannot import the bundle, so this pins them to the same answers on the same inputs.
  const pairs=[[script,script],[script,'오늘은 흐리고 추운 날입니다.'],['오늘은 맑습니다.','오늘은  맑습니다!'],['',''],['abc','ABC'],
    ['１２３ 가나','123가나'],['a'.repeat(50),'a'.repeat(49)+'b'],['한글 문장, 끝.','한글 문장 끝'],[script.slice(0,-4),script]];
  for(const [a,b] of pairs){
    assert.equal(checker.cer(a,b),characterErrorRate(a,b),JSON.stringify([a,b]));
    assert.equal(checker.normalize(a),normalizeSpeech(a),JSON.stringify(a));
  }
});

test('reviewer change resumes a pending WAV and keeps prior failed takes',async t=>{
  const f=setup(t);let calls=0;
  f.deps.listen=async()=>{if(++calls===1)return {transcript:script,review:{...good(),clarity:70}};throw new Error('404 reviewer unavailable');};
  assert.equal((await generateCheckedSpeech(f.request,f.deps)).status,'unverified');
  const old=f.proof();old.model='retired-reviewer';for(const take of old.attempts)delete take.model;
  writeFileSync(f.file+'.quality.json',JSON.stringify(old));
  const wav=readFileSync(f.file);
  f.deps.listen=async()=>({transcript:script,review:good()});
  assert.equal((await generateCheckedSpeech(f.request,f.deps)).status,'pass');
  assert.equal(f.count(),2);assert.deepEqual(readFileSync(f.file),wav);
  assert.equal(f.proof().attempts.length,2);
  assert.equal(f.proof().attempts[0].model,'retired-reviewer');
  assert.ok(f.proof().attempts[0].failures.length);
  assert.equal(f.proof().attempts[1].model,REVIEW_MODEL);
});
test('reviewer change rechecks a PASS without synthesis and never resets exhausted failures',async t=>{
  const f=setup(t);await generateCheckedSpeech(f.request,f.deps);
  let old=f.proof();old.model='retired-reviewer';delete old.attempts[0].model;
  writeFileSync(f.file+'.quality.json',JSON.stringify(old));
  let reviews=0;f.deps.listen=async()=>{reviews++;return {transcript:script,review:good()};};
  assert.equal((await generateCheckedSpeech(f.request,f.deps)).status,'pass');
  assert.equal(reviews,1);assert.equal(f.count(),1);
  assert.equal(f.proof().attempts[0].previousReviews[0].model,'retired-reviewer');
  const g=setup(t);g.deps.listen=async()=>({transcript:script,review:{...good(),clarity:70}});
  await generateCheckedSpeech(g.request,g.deps);
  old=g.proof();old.model='retired-reviewer';writeFileSync(g.file+'.quality.json',JSON.stringify(old));
  assert.equal((await generateCheckedSpeech(g.request,g.deps)).status,'fail');assert.equal(g.count(),3);
});
test('review model environment uses a trimmed override or the default',()=>{
  for(const [value,expected] of [['  audio-review-model  ','audio-review-model'],['  ','gemini-3.8-flash']]){
    const result=spawnSync(process.execPath,['--input-type=module','-e',"import {REVIEW_MODEL} from './dist/tts-quality.js';console.log(REVIEW_MODEL)"],
      {cwd:path.resolve(import.meta.dirname,'..'),env:{...process.env,SOCIAL_FLOW_TTS_REVIEW_MODEL:value},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),expected);
  }
});

test('failed replacement review never attributes old scores to the new reviewer',async t=>{
  const f=setup(t);await generateCheckedSpeech(f.request,f.deps);
  const old=f.proof();old.model='retired-reviewer';old.attempts[0].model='retired-reviewer';
  writeFileSync(f.file+'.quality.json',JSON.stringify(old));
  f.deps.listen=async()=>{throw new Error('404 reviewer unavailable');};
  for(let retry=0;retry<2;retry++){
    assert.equal((await generateCheckedSpeech(f.request,f.deps)).status,'unverified');
    const take=f.proof().attempts[0];
    assert.equal(take.pending,true);assert.equal(take.model,'retired-reviewer');
    for(const key of ['transcript','review','failures','signal','cer'])assert.equal(Object.hasOwn(take,key),false,key);
    assert.equal(take.previousReviews.length,1);
    assert.equal(take.previousReviews[0].model,'retired-reviewer');
    assert.deepEqual(take.previousReviews[0].review,old.attempts[0].review);
    assert.equal(f.count(),1);assert.throws(()=>checker.verifyProof(f.file,script),/PASS/);
  }
  f.deps.listen=async()=>({transcript:script,review:good()});
  assert.equal((await generateCheckedSpeech(f.request,f.deps)).status,'pass');
  assert.equal(f.proof().attempts[0].model,REVIEW_MODEL);assert.equal(f.count(),1);
});

test('review API version override and blank default reach only the review requests',async t=>{
  const f=setup(t);await f.deps.generate();
  for(const [value,expected] of [['  v1beta  ','v1beta'],['  ','v1']]){
    const child=`
      import {listen, REVIEW_API_VERSION} from './dist/tts-quality.js';
      const urls=[];
      globalThis.fetch=async(input)=>{
        urls.push(String(input.url ?? input));
        const result=urls.length===1?{transcript:${JSON.stringify(script)}}:${JSON.stringify(good())};
        return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(result)}]}}]}),{status:200,headers:{'Content-Type':'application/json'}});
      };
      await listen(${JSON.stringify(f.file)},${JSON.stringify(f.request)});
      console.log(JSON.stringify({version:REVIEW_API_VERSION,urls}));
    `;
    const result=spawnSync(process.execPath,['--input-type=module','-e',child],{
      cwd:path.resolve(import.meta.dirname,'..'),encoding:'utf8',
      env:{...process.env,GEMINI_API_KEY:'test-only',GOOGLE_API_KEY:'',GOOGLE_GENAI_USE_VERTEXAI:'false',SOCIAL_FLOW_TTS_REVIEW_API_VERSION:value},
    });
    assert.equal(result.status,0,result.stderr);
    const actual=JSON.parse(result.stdout);assert.equal(actual.version,expected);assert.equal(actual.urls.length,2);
    for(const url of actual.urls)assert.equal(new URL(url).pathname.split('/')[1],expected);
  }
});
