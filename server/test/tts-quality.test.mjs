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
import { config } from '../dist/config.js';
const require=createRequire(import.meta.url);
// Historical proof validation remains covered; production uses the provenance-only check.
const legacyChecker=require('../../skills/produce/references/check-tts-quality.js');
const checker={...legacyChecker,check:legacyChecker.checkLegacy};
const script='오늘은 맑고 따뜻한 날입니다.';
const good=()=>({accuracy:100,pronunciation:98,naturalness:97,clarity:99,confidence:0.98,complete:true,evidence:'Every word and final syllable is clear, with smooth phrase breaks and no audible artifacts.',issues:[]});
const signal={duration:2.4,rmsDb:-18,clippedFraction:0};
// The dictation check runs only on an explicit user request (owner directive 2026-10-04).
const dictation={requestedBy:'user',reason:'오너가 내레이션 받아쓰기 검사를 이 회차에만 켜 달라고 요청했다.'};
const episodeTexts=['오늘의 이야기를 시작합니다.','다음 문장도 같은 목소리로 읽어요.','이렇게 이야기를 마칩니다.'];
const episodeRequest=(dir,index=1)=>checkedSpeechSchema.parse({generator:'tts_elevenlabs_generate',generation:{text:episodeTexts[index],voiceId:'voice',model:'eleven_v4',speed:1},expectedText:episodeTexts[index],language:'Korean',delivery:'Calm connected narration.',outputPath:dir,filename:`c${index}.wav`,episode:{texts:episodeTexts,index,seed:210836}});
function setup(t){
  const dir=mkdtempSync(path.join(tmpdir(),'tts-quality-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  mkdirSync(path.join(dir,'storyboard'));mkdirSync(path.join(dir,'.work/pcm'),{recursive:true});
  writeFileSync(path.join(dir,'storyboard/scenes.js'),`window.SCENES=[{type:'points',narration:[{tts:${JSON.stringify(script)}}]}];`);
  const request=checkedSpeechSchema.parse({generator:'tts_generate',generation:{text:script,voiceName:'Kore'},expectedText:script,language:'Korean',delivery:'Calm and conversational.',outputPath:path.join(dir,'.work/pcm'),filename:'c0.wav'});
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
  assert.deepEqual(reviewFailures(script,null,good(),2.4),[],'a null transcript disarms only the CER check');
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
  assert.equal(events.filter(e=>e.tool==='tts_generate').length,2);
});
test('the production take records its spend under the generator, with the metered characters',async t=>{
  const f=setup(t);const request=episodeRequest(path.join(f.dir,'.work/pcm'));
  const savedFetch=globalThis.fetch,savedKey=config.elevenLabsApiKey;config.elevenLabsApiKey='test-key';
  const alignment={characters:['안'],character_start_times_seconds:[0],character_end_times_seconds:[0.1]};
  globalThis.fetch=async()=>new Response(JSON.stringify({audio_base64:pcmToWav(Buffer.alloc(48000),24000,1).toString('base64'),alignment,normalized_alignment:alignment}),{headers:{'content-type':'application/json','character-cost':'12'}});
  try{
    const result=await generateCheckedSpeech(request);
    assert.equal(result.success,true,result.error);assert.equal(result.status,'not_reviewed');
  }finally{globalThis.fetch=savedFetch;config.elevenLabsApiKey=savedKey;}
  const events=readFileSync(path.join(f.dir,'.work/events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.length,1);assert.equal(events[0].tool,'tts_elevenlabs_generate');
  assert.equal(events[0].key,'tts.elevenlabs');assert.equal(events[0].quantity,0.012);
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
test('builder holds missing evidence, altered WAV/text, lowered scores and sync bypass for HITL',async t=>{
  const f=setup(t);await f.deps.generate();
  const work=path.join(f.dir,'.work'),board=path.join(f.dir,'storyboard');
  assert.throws(()=>checker.check(work,board),/need HITL/);
  assert.match(checker.lastReport(work).warnings[0],/no speech-quality proof/);
  await generateCheckedSpeech(f.request,f.deps);const proof=f.proof();
  assert.throws(()=>checker.verifyProof(f.file,'내일은 맑고 따뜻한 날입니다.'),/narration changed/);
  proof.attempts.at(-1).review.naturalness=80;writeFileSync(f.file+'.quality.json',JSON.stringify(proof));
  assert.throws(()=>checker.verifyProof(f.file,script),/naturalness/);
  writeFileSync(path.join(f.dir,'.work/cards.tsv'),`0\t${f.file}\t4.5\tnone\tsync=1\n`);
  assert.throws(()=>checker.check(work,board),/need HITL/);
  assert.match(checker.lastReport(work).warnings[0],/naturalness did not pass — proof status pass .* naturalness 80/);
  writeFileSync(f.file,'different');assert.throws(()=>checker.verifyProof(f.file,script),/audio changed/);
});
test('an explicit approval lets a failed take through once, bound to that WAV, proof and text',async t=>{
  const f=setup(t);f.deps.listen=async()=>({transcript:script,review:{...good(),pronunciation:70}});
  const work=path.join(f.dir,'.work'),board=path.join(f.dir,'storyboard');
  assert.equal((await generateCheckedSpeech(f.request,f.deps)).status,'fail');
  assert.throws(()=>checker.check(work,board),/need HITL/);
  const report=checker.lastReport(work);
  assert.equal(report.status,'awaiting-user');
  assert.match(report.warnings[0],/card 0: missing current speech-quality-v1 PASS — proof status fail \| 3 attempt\(s\) \| accuracy 100 · pronunciation 70/);
  assert.throws(()=>checker.approve(work,' '),/explicit user/);
  checker.approve(work,'User: 이 발음은 괜찮으니 진행');
  const media=checker.check(work,board);
  assert.ok(media[f.file]&&media[f.file+'.quality.json'],'the failed proof still travels in the provenance');
  assert.equal(checker.lastReport(work).status,'approved-with-warnings');
  // a new take, a changed proof or changed narration needs a new answer
  writeFileSync(f.file,pcmToWav(Buffer.alloc(48000,9),24000,1));
  assert.throws(()=>checker.check(work,board),/need HITL/);
});
test('real recordings and silence keep audio provenance without a synthesis proof',t=>{
  const f=setup(t);writeFileSync(f.file,'recorded');
  for(const scene of [{type:'points',visual:{source:'recording'},narration:[]},{type:'points',visual:{source:'screencast',sync:true},narration:[{tts:script}]},{type:'points',narration:[]}]){
    writeFileSync(path.join(f.dir,'storyboard/scenes.js'),`window.SCENES=${JSON.stringify([scene])};`);
    assert.ok(checker.check(path.join(f.dir,'.work'),path.join(f.dir,'storyboard'))[f.file]);
  }
  writeFileSync(path.join(f.dir,'storyboard/scenes.js'),`window.SCENES=[{type:'points',visual:{source:'screencast'},narration:[{tts:${JSON.stringify(script)}}]}];`);
  assert.throws(()=>checker.check(path.join(f.dir,'.work'),path.join(f.dir,'storyboard')),/need HITL/);
});
test('generation args bind the whole spoken text and preserve voice settings',t=>{
  const f=setup(t);const prepared=prepareGeneration(f.request);
  assert.equal(prepared.args.voiceName,'Kore');assert.equal(prepared.args.text,script);
  assert.throws(()=>prepareGeneration({...f.request,expectedText:'다른 대본'}),/match the complete/);
  const eleven={...f.request,generator:'tts_elevenlabs_generate',generation:{text:'[whispers] '+script,voiceId:'21m00Tcm4TlvDq8ikWAM',model:'eleven_v4'}};
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

test('the proof checker accepts a take with no transcript and still catches a bad one',async t=>{
  const f=setup(t);f.deps.listen=async()=>({transcript:null,review:good()});
  assert.equal((await generateCheckedSpeech(f.request,f.deps)).status,'pass');
  const take=()=>f.proof().attempts.at(-1);
  assert.equal(take().transcript,null);assert.equal(take().cer,null);assert.equal(take().transcriptCheck,null);
  assert.ok(checker.verifyProof(f.file,script)[f.file],'a proof with no transcript is a valid PASS');
  assert.ok(checker.check(path.join(f.dir,'.work'),path.join(f.dir,'storyboard'))[f.file]);
  // A recorded transcript that drifts is rejected exactly as before.
  const drifted=f.proof();drifted.attempts.at(-1).transcript='오늘은 흐리고 추운 날입니다.';
  writeFileSync(f.file+'.quality.json',JSON.stringify(drifted));
  assert.throws(()=>checker.verifyProof(f.file,script),/blind transcript did not pass/);
  // A missing key is not the same claim as a recorded null: the proof says nothing, so it does not pass.
  const absent=f.proof();delete absent.attempts.at(-1).transcript;
  writeFileSync(f.file+'.quality.json',JSON.stringify(absent));
  assert.throws(()=>checker.verifyProof(f.file,script),/no transcript record/);
});

test('a stored take with no transcript is rechecked, not resynthesised, when the check is asked for',async t=>{
  const f=setup(t);f.deps.listen=async()=>({transcript:null,review:good()});
  assert.equal((await generateCheckedSpeech(f.request,f.deps)).status,'pass');assert.equal(f.count(),1);
  assert.equal((await generateCheckedSpeech(f.request,f.deps)).reused,true);assert.equal(f.count(),1);
  // The stored PASS cannot answer a request that now asks for the dictation check.
  let listens=0;f.deps.listen=async()=>{listens++;return {transcript:script,review:good()};};
  const rechecked=await generateCheckedSpeech({...f.request,transcriptCheck:dictation},f.deps);
  assert.equal(rechecked.status,'pass');assert.notEqual(rechecked.reused,true);
  assert.equal(listens,1,'the same WAV was reviewed again');
  assert.equal(f.count(),1,'no second synthesis was paid for');
  const take=f.proof().attempts.at(-1);
  assert.equal(take.transcript,script);assert.deepEqual(take.transcriptCheck,dictation);
  assert.equal(take.previousReviews.length,1);assert.equal(take.previousReviews[0].transcript,null);
  // With the transcript on record the same request reuses again.
  assert.equal((await generateCheckedSpeech({...f.request,transcriptCheck:dictation},f.deps)).reused,true);
  assert.equal(listens,1);
});

test('three character voices bind their actual generation proofs and reject narrator substitution',async t=>{
  const f=setup(t), characters=['Kore','Puck','Charon'].map((voiceId,i)=>({id:'cast-'+i,tts:{engine:'gemini',voiceId,language:'ko',speed:1}}));
  const scenes=characters.map(c=>({type:'points',narration:[{tts:script,speaker:c.id}]}));
  const cards=[];
  for(const [i,c] of characters.entries()) {
    const filename=`cast-${i}.wav`, file=path.join(f.request.outputPath,filename);
    const request={...f.request,filename,generation:{...f.request.generation,voiceName:c.tts.voiceId,speed:1}};
    const deps={...f.deps,generate:async()=>{writeFileSync(file,pcmToWav(Buffer.alloc(48000,i+1),24000,1));return {success:true,audioPath:file};}};
    assert.equal((await generateCheckedSpeech(request,deps)).status,'pass');
    assert.equal(JSON.parse(readFileSync(file+'.quality.json')).voiceSettings.voiceName,c.tts.voiceId);
    cards.push(`${i}\t${file}\t4.5\tin`);
  }
  const board=path.join(f.dir,'storyboard'),work=path.join(f.dir,'.work');
  const writeBoard=()=>writeFileSync(path.join(board,'scenes.js'),`window.SB_DOC=${JSON.stringify({characters,narratorCharacterId:'cast-0'})};window.SCENES=${JSON.stringify(scenes)};`);
  writeBoard();writeFileSync(path.join(work,'cards.tsv'),cards.join('\n')+'\n');
  assert.ok(checker.check(work,board));
  characters[1].tts.voiceId='Kore';writeBoard();
  assert.throws(()=>checker.check(work,board),/cast-1 voiceId differs/);
  characters[1].tts.voiceId='Puck';scenes[1].narration[0].speaker=undefined;writeBoard();
  assert.throws(()=>checker.check(work,board),/cast-0 voiceId differs/);
});

test('voice binding rejects mixed speakers, missing proofs, and changed required settings',()=>{
  const tts={engine:'gemini',voiceId:'Kore',language:'ko',speed:1};
  const win={SB_DOC:{characters:[{id:'a',tts},{id:'b',tts}],narratorCharacterId:'a'}};
  const scene={narration:[{tts:script,speaker:'a'}]};
  const proof={generator:'tts_generate',language:'Korean',voiceSettings:{voiceName:'Kore',speed:1}};
  assert.equal(checker.characterVoice(win,scene,proof),'a');
  for(const patch of [{voiceName:'Puck'},{language:'en'},{speed:0.9}]) assert.throws(()=>checker.characterVoice(win,scene,{...proof,voiceSettings:{...proof.voiceSettings,...patch}}),/differs/);
  assert.throws(()=>checker.characterVoice(win,scene,{}),/voiceSettings/);
  assert.throws(()=>checker.characterVoice(win,{narration:[...scene.narration,{tts:script,speaker:'b'}]},proof),/one speaker per scene/);
  assert.equal(checker.characterVoice({},{narration:[{tts:script}]},{}),null);
});


test('legacy voice proof gains settings without synthesis or resetting attempts',async t=>{
  const f=setup(t);await generateCheckedSpeech(f.request,f.deps);
  const old=f.proof();delete old.voiceSettings;writeFileSync(f.file+'.quality.json',JSON.stringify(old));
  assert.equal((await generateCheckedSpeech(f.request,f.deps)).reused,true);
  assert.equal(f.count(),1);assert.equal(f.proof().attempts.length,1);
  assert.equal(f.proof().voiceSettings.voiceName,'Kore');
});

test('episode derives bounded v4 context and retains its seed at native speed',t=>{
  const {dir}=setup(t);
  for(let i=0;i<episodeTexts.length;i++){
    const p=prepareGeneration(episodeRequest(dir,i));assert.equal(p.args.previousText,episodeTexts.slice(0,i).join(' ').slice(-100)||undefined);assert.equal(p.args.nextText,episodeTexts.slice(i+1).join(' ').slice(0,100)||undefined);assert.equal(p.args.seed,210836);assert.equal(p.args.speed,1);
  }
  const r=episodeRequest(dir);
  assert.throws(()=>prepareGeneration({...r,generation:{...r.generation,seed:1}}),/seed/);
  assert.throws(()=>prepareGeneration({...r,generation:{...r.generation,previousText:'wrong'}}),/previousText/);
  assert.throws(()=>prepareGeneration({...r,generation:{...r.generation,model:'eleven_v3'}}));
  assert.equal(checkedSpeechSchema.safeParse({...r,episode:{...r.episode,index:99}}).success,false);
  assert.equal(checkedSpeechSchema.safeParse({...r,playbackSpeed:1.2}).success,false);
});

test('identical rejected audio stops without another review, seed change or reset',async t=>{
  const {dir}=setup(t),r=episodeRequest(dir),file=path.join(dir,r.filename);let calls=0,reviews=0;const seeds=[];
  const deps={preflight:async()=>{},generate:async o=>{calls++;seeds.push(o.seed);writeFileSync(file,pcmToWav(Buffer.alloc(48000,12),24000,1));return {success:true,audioPath:file};},measure:async()=>({duration:2,rmsDb:-18,clippedFraction:0}),listen:async()=>{reviews++;return {transcript:r.expectedText,review:{...good(),naturalness:70}};}};
  const result=await generateCheckedSpeech(r,deps);assert.equal(result.status,'fail');assert.equal(calls,2);assert.equal(reviews,1);assert.deepEqual(seeds,[210836,210836]);
  assert.equal((await generateCheckedSpeech(r,deps)).status,'fail');assert.equal(calls,2);
});

test('assembly rejects missing context, changed order and voice drift despite source PASS',async t=>{
  const f=setup(t),board=path.join(f.dir,'storyboard'),work=path.join(f.dir,'.work');
  writeFileSync(path.join(board,'scenes.js'),`window.SCENES=${JSON.stringify(episodeTexts.map(tts=>({type:'points',narration:[{tts}]})))};`);
  const files=[];
  for(let i=0;i<episodeTexts.length;i++){
    const r=episodeRequest(work,i),file=path.join(work,r.filename);files.push(file);
    const deps={preflight:async()=>{},generate:async()=>{writeFileSync(file,pcmToWav(Buffer.alloc(48000,12+i),24000,1));return {success:true,audioPath:file};},measure:async()=>({duration:2,rmsDb:-18,clippedFraction:0}),listen:async()=>({transcript:r.expectedText,review:good()})};
    assert.equal((await generateCheckedSpeech(r,deps)).success,true);
  }
  writeFileSync(path.join(work,'cards.tsv'),files.map((file,i)=>`${i}\t${file}\t4.5\tin`).join('\n'));
  assert.doesNotThrow(()=>checker.check(work,board));
  const file=files[1]+'.quality.json',original=JSON.parse(readFileSync(file,'utf8'));
  for(const mutate of [p=>delete p.episode,p=>p.episode.texts.reverse(),p=>p.voiceSettings.speed=1.1,p=>p.attempts[0].seed++]){
    const p=structuredClone(original);mutate(p);writeFileSync(file,JSON.stringify(p));assert.throws(()=>checker.check(work,board),/need HITL/);assert.match(checker.lastReport(work).warnings[0],/episode|settings/);
  }
});
