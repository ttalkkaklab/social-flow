import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {reviewFinalSpeech} from '../dist/tts-final-quality.js';
import {sha256} from '../dist/tts-quality.js';
import {pcmToWav} from '../dist/media-utils.js';
const require=createRequire(import.meta.url);
const chapters=require('../../skills/produce/references/final-speech-chapters.js');
const sourceChecker=require('../../skills/produce/references/check-final-tts.js');
const checker={...sourceChecker,evidence:sourceChecker.legacyEvidence}; // historical review artifacts
const delivery=require('../../skills/produce/references/delivery-proof.js');
const good={accuracy:100,pronunciation:98,naturalness:98,clarity:98,continuity:98,continuityEvidence:'At every sentence join the same pitch and breathing continue without a clipped ending.',confidence:.98,complete:true,evidence:'Every word throughout this payload is audible with clear endings and no noise or omissions.',issues:[]};
const texts=['오늘의 이야기를 시작합니다.','다음 문장도 같은 목소리로 읽어요.'];
const root=mkdtempSync(path.join(tmpdir(),'final-chapters-'));
let pcm,source;
function fixture(){
 if(source)return source;
 // Deterministic 24-bit broadband audio defeats FLAC compression. No vendor calls.
 pcm=Buffer.alloc(24000*240*4);let seed=12345;
 for(let i=0;i<pcm.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)|0;pcm.writeInt32LE((seed>>9)<<8,i);}
 writeFileSync(path.join(root,'raw.pcm'),pcm);
 source=path.join(root,'long.flac');
 const r=spawnSync('ffmpeg',['-y','-v','error','-f','s32le','-ar','24000','-ac','1','-i',path.join(root,'raw.pcm'),'-c:a','flac',source]);
 assert.equal(r.status,0,String(r.stderr));assert.ok(readFileSync(source).length>chapters.LIMIT,'real FLAC must exceed the vendor cap');
 return source;
}
function setup(t){
 const dir=mkdtempSync(path.join(root,'case-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const media=path.join(dir,'final.flac');copyFileSync(fixture(),media);
 const segments=Array.from({length:8},(_,i)=>({startSeconds:i*30,expectedText:`Sentence ${i+1}: `+'A continuous passage spoken clearly with natural breathing and consistent tone. '.repeat(2)}));
 const request={mediaPath:media,expectedText:segments.map(s=>s.expectedText).join('. '),language:'English',delivery:'One connected narrator.',segments};
 const proof=()=>JSON.parse(readFileSync(media+'.speech-quality.json','utf8'));
 return {dir,media,request,proof};
}
function reseal(p){p.manifestSha256=chapters.manifest(p);return p;}
async function assertInvalidPlansPreserveProof(f,deps){
 const before=readFileSync(f.media+'.speech-quality.json');
 // Every invalid plan throws before the stored proof is read; the 'invalid text, start, order' case sweeps every invalid plan.
 const result=await reviewFinalSpeech({...f.request,expectedText:'Other narration'},deps);
 assert.equal(result.status,'unverified');assert.equal(result.success,false);assert.ok(result.error);
 assert.deepEqual(readFileSync(f.media+'.speech-quality.json'),before,'invalid planning must not alter stored evidence');
}
test('over-cap FLAC reviews full chapters and all joins, then caches only complete evidence',async t=>{
 const f=setup(t);let calls=0;
 const deps={listen:async(file,request,episode)=>{calls++;assert.equal(episode,true);assert.ok(readFileSync(file).length<=chapters.LIMIT);return {transcript:null,review:good};}};
 assert.equal((await reviewFinalSpeech(f.request,deps)).status,'pass');
 const p=f.proof();assert.equal(p.policy,chapters.POLICY);assert.equal(calls,3);assert.equal(p.pieces.filter(x=>x.kind==='chapter').length,2);assert.equal(p.pieces.filter(x=>x.kind==='boundary').length,1);
 assert.equal(p.pieces[0].startSample,0);assert.equal(p.pieces[1].startSample,p.pieces[0].endSample);assert.equal(p.pieces[1].endSample,pcm.length/4);
 const actual=chapters.decode(f.media);assert.deepEqual(actual,pcm);assert.doesNotThrow(()=>checker.verify(f.media,f.request.expectedText));
 assert.equal((await reviewFinalSpeech(f.request,deps)).reused,true);assert.equal(calls,3);
 await assertInvalidPlansPreserveProof(f,deps);assert.equal(calls,3);
 assert.equal((await reviewFinalSpeech(f.request,deps)).reused,true);assert.equal(calls,3);
 for(const alter of [p=>p.pieces.splice(0,1),p=>p.pieces.push(p.pieces[0]),p=>p.pieces.reverse(),p=>p.pieces.pop(),p=>p.pieces[0].endSample--,p=>p.pieces[1].startSample++,p=>p.pieces[0].startSample=1,p=>p.pieces[1].endSample--,p=>p.pieces[2].startSample++,p=>p.pieces[0].pcmSha256='0'.repeat(64),p=>p.segments[1].expectedText+=' changed',p=>p.pieces[1].status='unverified',p=>p.pieces[2].review.continuity=94,p=>p.pieces[1].audioSha256='bad']){
  const bad=structuredClone(p);alter(bad);reseal(bad);
  assert.throws(()=>chapters.validate(bad,actual,f.request.expectedText));
 }
 const hashEdit=structuredClone(p);hashEdit.pieces[0].audioSha256='0'.repeat(64);assert.throws(()=>chapters.validate(hashEdit,actual,f.request.expectedText),/altered/);
 const bad=structuredClone(p);bad.pieces[0].review.accuracy=99; // valid score edited without re-binding manifest
 assert.throws(()=>chapters.validate(bad,actual,f.request.expectedText),/altered/);
 assert.throws(()=>chapters.validate(p,actual,f.request.expectedText+' wrong'),/narration/);
 writeFileSync(f.media,Buffer.concat([readFileSync(f.media),Buffer.from('container changed')]));
 assert.throws(()=>checker.verifyReport(p,f.media,f.request.expectedText),/hash-bound/);
});
test('review outage holds delivery, saves preceding reviews, and resumes without paying twice',async t=>{
 const f=setup(t);let calls=0;
 const deps={listen:async()=>{if(++calls===2)throw new Error('mock outage');return {transcript:null,review:good};}};
 assert.equal((await reviewFinalSpeech(f.request,deps)).status,'unverified');assert.equal(f.proof().pieces.length,1);
 assert.throws(()=>checker.gate(f.dir,f.media,f.request.expectedText),/unverified/);
 await assertInvalidPlansPreserveProof(f,deps);assert.equal(calls,2);
 assert.equal((await reviewFinalSpeech(f.request,deps)).status,'pass');assert.equal(calls,4,'one prior review is reused, two remaining reviews run');
});
test('invalid text, start, order or missing segments fail before listening; source mutation holds',async t=>{
 const f=setup(t);let calls=0;
 const deps={listen:async()=>{calls++;return {transcript:null,review:good};}};
 for(const patch of [{segments:undefined},{segments:f.request.segments.slice(1)},{segments:[...f.request.segments].reverse()},{segments:f.request.segments.map((s,i)=>({...s,startSeconds:i?i*30:1}))},{expectedText:'Other narration'}]){
  assert.equal((await reviewFinalSpeech({...f.request,...patch},deps)).status,'unverified');assert.equal(calls,0);
 }
 const result=await reviewFinalSpeech(f.request,{listen:async()=>{writeFileSync(f.media,Buffer.concat([readFileSync(f.media),Buffer.from('changed')]));return {transcript:null,review:good};}});
 assert.equal(result.status,'unverified');assert.match(result.error,/changed/);
});
test('canonical samples are identical for a resampled AAC video and its standard review FLAC',()=>{
 const dir=mkdtempSync(path.join(root,'case-')),video=path.join(dir,'audio.m4a'),flac=path.join(dir,'review.flac');
 let r=spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=431:sample_rate=48000:duration=2','-ac','2','-c:a','aac',video]);assert.equal(r.status,0,String(r.stderr));
 r=spawnSync('ffmpeg',['-y','-v','error','-i',video,'-map','0:a:0','-map_metadata','-1','-ac','1','-ar','24000','-c:a','flac',flac]);assert.equal(r.status,0,String(r.stderr));
 assert.deepEqual(chapters.decode(video),chapters.decode(flac));
});
test('the final review transcribes only on request and never drops the request record',()=>{
 const dir=mkdtempSync(path.join(root,'case-')),file=path.join(dir,'final.wav'),other=path.join(dir,'other.wav');
 const tone=hz=>{const pcm=Buffer.alloc(24000*2*2);for(let i=0;i<pcm.length/2;i++)pcm.writeInt16LE(Math.round(5000*Math.sin(i*2*Math.PI*hz/24000)),i*2);return pcmToWav(pcm,24000,1);};
 writeFileSync(file,tone(220));writeFileSync(other,tone(300));
 const child=`
 import {reviewFinalSpeech as legacyReview} from './dist/tts-final-quality.js';
 import {readFileSync} from 'node:fs';
 const TRANSCRIBE='Transcribe every audible spoken word';
 let review=0,blind=0,mode='pass';
 const reviewFinalSpeech=req=>legacyReview(req,{listen:async()=>{review++;if(req.transcriptCheck)blind++;return {transcript:req.transcriptCheck?${JSON.stringify(texts[1])}:null,review:{...${JSON.stringify(good)},continuity:mode==='fail'?70:98}};}});
 const req=${JSON.stringify({mediaPath:file,expectedText:texts[1],language:'Korean',delivery:'One connected narrator.'})};
 const bad={...req,mediaPath:${JSON.stringify(other)}};
 const ask={requestedBy:'user',reason:'오너가 이 회차의 내레이션만 받아쓰기로 대조해 달라고 요청했다.'};
 // What the written proof says, which is what a later reader actually has.
 const stored=m=>{const p=JSON.parse(readFileSync(m+'.speech-quality.json','utf8'));return p.transcriptCheck===undefined?'ABSENT':p.transcriptCheck;};
 const seen=(o,m)=>({review,blind,status:o.status,transcript:o.transcript??null,reused:o.reused===true,stored:stored(m)});
 const off=seen(await reviewFinalSpeech(req),req.mediaPath);
 const on=seen(await reviewFinalSpeech({...req,transcriptCheck:ask}),req.mediaPath);
 const backOff=seen(await reviewFinalSpeech(req),req.mediaPath);
 mode='fail';
 const failed=seen(await reviewFinalSpeech({...bad,transcriptCheck:ask}),bad.mediaPath);
 const failReused=seen(await reviewFinalSpeech(bad),bad.mediaPath);
 console.log(JSON.stringify({off,on,backOff,failed,failReused,ask}));`;
 const run=spawnSync(process.execPath,['--input-type=module','-e',child],{cwd:path.resolve(import.meta.dirname,'..'),encoding:'utf8',
  env:{...process.env,GEMINI_API_KEY:'test-only',GOOGLE_API_KEY:'',GOOGLE_GENAI_USE_VERTEXAI:'false'}});
 assert.equal(run.status,0,run.stderr);
 const {off,on,backOff,failed,failReused,ask}=JSON.parse(run.stdout);
 // Default: one listening call, nothing transcribed, and the proof says nobody asked.
 assert.deepEqual(off,{review:1,blind:0,status:'pass',transcript:null,reused:false,stored:null});
 // Asked for: the stored PASS cannot answer it, so the episode is listened to again — and transcribed.
 assert.deepEqual(on,{review:2,blind:1,status:'pass',transcript:texts[1],reused:false,stored:ask});
 // Turning it back off reuses the transcribed PASS — and keeps who asked. A transcript whose
 // request record was dropped could not say why the dictation had run.
 assert.deepEqual(backOff,{review:2,blind:1,status:'pass',transcript:texts[1],reused:true,stored:ask});
 // The cached FAIL carries it too: a take rejected over its dictation must keep the reason it ran.
 assert.deepEqual(failed,{review:3,blind:2,status:'fail',transcript:texts[1],reused:false,stored:ask});
 assert.deepEqual(failReused,{review:3,blind:2,status:'fail',transcript:texts[1],reused:true,stored:ask});
 assert.doesNotThrow(()=>checker.verify(file,texts[1]));
});
test('deleting the storyboard cannot waive final delivery evidence',()=>{
 const dir=mkdtempSync(path.join(root,'case-')),out=path.join(dir,'output/video');mkdirSync(out,{recursive:true});
 writeFileSync(path.join(out,'video.mp4'),'video');writeFileSync(path.join(out,'subs.srt'),'subs');
 writeFileSync(path.join(out,'delivery-proof.json'),JSON.stringify({version:1,kind:'storyboard',editCheckSha256:'edit',assembledSha256:'assembly',outputs:{'video.mp4':sha256('video'),'video-sub.mp4':null,'subs.srt':sha256('subs')}}));
 assert.match(delivery.check(dir),/storyboard missing/);
});
process.on('exit',()=>rmSync(root,{recursive:true,force:true}));
