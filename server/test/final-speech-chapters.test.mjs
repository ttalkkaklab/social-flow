import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {reviewFinalSpeech} from '../dist/tts-final-quality.js';
const require=createRequire(import.meta.url);
const chapters=require('../../skills/produce/references/final-speech-chapters.js');
const checker=require('../../skills/produce/references/check-final-tts.js');
const delivery=require('../../skills/produce/references/delivery-proof.js');
const good={accuracy:100,pronunciation:98,naturalness:98,clarity:98,continuity:98,continuityEvidence:'At every sentence join the same pitch and breathing continue without a clipped ending.',confidence:.98,complete:true,evidence:'Every word throughout this payload is audible with clear endings and no noise or omissions.',issues:[]};
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
 for(const patch of [{segments:undefined},{segments:f.request.segments.slice(1)},{segments:[...f.request.segments].reverse()},{segments:f.request.segments.map((s,i)=>({...s,startSeconds:i?i*30:1}))},{expectedText:'Other narration'}]){
  const result=await reviewFinalSpeech({...f.request,...patch},deps);
  assert.equal(result.status,'unverified');assert.equal(result.success,false);assert.ok(result.error);
  assert.deepEqual(readFileSync(f.media+'.speech-quality.json'),before,'invalid planning must not alter stored evidence');
 }
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
  assert.throws(()=>checker.verifyReport(bad,f.media,f.request.expectedText));
 }
 const hashEdit=structuredClone(p);hashEdit.pieces[0].audioSha256='0'.repeat(64);assert.throws(()=>checker.verifyReport(hashEdit,f.media,f.request.expectedText),/altered/);
 const bad=structuredClone(p);bad.pieces[0].review.accuracy=99; // valid score edited without re-binding manifest
 assert.throws(()=>checker.verifyReport(bad,f.media,f.request.expectedText),/altered/);
 assert.throws(()=>checker.verifyReport(p,f.media,f.request.expectedText+' wrong'),/narration/);
 writeFileSync(f.media,Buffer.concat([readFileSync(f.media),Buffer.from('container changed')]));
 assert.throws(()=>checker.verifyReport(p,f.media,f.request.expectedText),/hash-bound/);
});
test('one failed chapter or clipped cross-boundary syllable fails the whole review and cannot reroll',async t=>{
 for(const badCall of [1,3]){
  const f=setup(t);let calls=0;
  const deps={listen:async()=>({transcript:null,review:++calls===badCall?{...good,issues:[{start:29.9,end:30,category:'clipping',heard:'unfinished ending',expected:'complete ending',correction:'Move the boundary into the actual pause.'}]}:good})};
  assert.equal((await reviewFinalSpeech(f.request,deps)).status,'fail');assert.equal(calls,3);
  assert.throws(()=>checker.verify(f.media,f.request.expectedText),/Audible defects/);
  await assertInvalidPlansPreserveProof(f,deps);assert.equal(calls,3);
  const retry=await reviewFinalSpeech(f.request,deps);assert.equal(retry.status,'fail');assert.equal(retry.reused,true);assert.equal(calls,3,'a failed review cannot reroll after invalid requests');
  assert.throws(()=>checker.verify(f.media,f.request.expectedText),/Audible defects/);
  assert.equal((await reviewFinalSpeech({...f.request,delivery:'A cosmetic new direction.'},deps)).reused,true);assert.equal(calls,3);
  assert.throws(()=>checker.gate(f.dir,f.media,f.request.expectedText),/need HITL/);
  checker.approve(f.dir,'User reviewed and accepted this exact clipped-syllable finding.');
  const evidence=checker.evidence(f.media,f.request.expectedText,f.dir);
  assert.doesNotThrow(()=>checker.verifyEvidence(evidence,f.media,f.request.expectedText));
  const altered=structuredClone(evidence);altered.pieces[0].review.accuracy=99;reseal(altered);assert.throws(()=>checker.verifyEvidence(altered,f.media,f.request.expectedText),/other media, narration or findings/);
  const missing=structuredClone(evidence);missing.pieces.pop();reseal(missing);
  assert.throws(()=>checker.verifyEvidence(missing,f.media,f.request.expectedText),/Missing/);
 }
});
test('review outage holds delivery, saves preceding reviews, and resumes without paying twice',async t=>{
 const f=setup(t);let calls=0;
 const deps={listen:async()=>{if(++calls===2)throw new Error('mock outage');return {transcript:null,review:good};}};
 assert.equal((await reviewFinalSpeech(f.request,deps)).status,'unverified');assert.equal(f.proof().pieces.length,1);
 assert.throws(()=>checker.gate(f.dir,f.media,f.request.expectedText),/unverified/);
 await assertInvalidPlansPreserveProof(f,deps);assert.equal(calls,2);
 assert.equal((await reviewFinalSpeech(f.request,deps)).status,'pass');assert.equal(calls,4,'one prior review is reused, two remaining reviews run');
});
test('a failed piece in an interrupted review survives invalid plans and resumes as fail',async t=>{
 const f=setup(t);let calls=0;
 const deps={listen:async()=>{if(++calls===2)throw new Error('mock outage');return {transcript:null,review:calls===1?{...good,accuracy:97}:good};}};
 assert.equal((await reviewFinalSpeech(f.request,deps)).status,'unverified');
 assert.equal(f.proof().pieces[0].status,'fail');
 await assertInvalidPlansPreserveProof(f,deps);assert.equal(calls,2);
 assert.equal((await reviewFinalSpeech(f.request,deps)).status,'fail');assert.equal(calls,4);
 assert.equal(f.proof().pieces[0].status,'fail');
 assert.throws(()=>checker.verify(f.media,f.request.expectedText),/accuracy below threshold/);
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
test('delivery-proof and the publishing preflight reject missing chapter or boundary reviews',async t=>{
 const f=setup(t);await reviewFinalSpeech(f.request,{listen:async()=>({transcript:null,review:good})});
 const board=path.join(f.dir,'storyboard/scenes.js'),out=path.join(f.dir,'output/video');mkdirSync(path.dirname(board));mkdirSync(out,{recursive:true});
 writeFileSync(board,`window.SCENES=[{type:'points',narration:[{tts:${JSON.stringify(f.request.expectedText)}}]}];`);
 copyFileSync(f.media,path.join(out,'video.mp4'));writeFileSync(path.join(out,'subs.srt'),'checked subtitles');
 const p={version:1,speed:1,kind:'storyboard',scenesSha256:chapters.hash(readFileSync(board)),editCheckSha256:'test edit evidence',assembledSha256:'test assembly evidence',outputs:{'video.mp4':chapters.hash(readFileSync(f.media)),'video-sub.mp4':null,'subs.srt':chapters.hash('checked subtitles')},requiresFinalSpeech:true,finalSpeech:f.proof()};
 const file=path.join(out,'delivery-proof.json');writeFileSync(file,JSON.stringify(p));assert.equal(delivery.check(f.dir),null);
 writeFileSync(path.join(f.dir,'storyboard/storyboard.md'),'---\nstatus: produced\n---\n');
 const preflight=()=>{const r=spawnSync(process.execPath,[path.resolve(import.meta.dirname,'../../skills/autoproduce/references/episode-state.js'),f.dir,'--json'],{encoding:'utf8'});assert.ok(r.status===0||r.status===1,r.stderr);return JSON.parse(r.stdout).blocked;};
 assert.equal(preflight().some(x=>/assembly proof/.test(x)),false);
 for(const remove of [0,2]){const bad=structuredClone(p);bad.finalSpeech.pieces.splice(remove,1);reseal(bad.finalSpeech);writeFileSync(file,JSON.stringify(bad));assert.match(delivery.check(f.dir),/Missing/);assert.ok(preflight().some(x=>/Missing.*evidence/.test(x)));}

});
test('subtitle mapping uses full ordered visible text and preserves spoken number spellings',t=>{
 const f=setup(t),work=path.join(f.dir,'.work'),board=path.join(f.dir,'scenes.js');mkdirSync(work);
 writeFileSync(board,'window.SCENES=[{type:"points",narration:[{sub:"2026년입니다.",tts:"이천이십육년입니다."},{sub:"다음 문장입니다.",tts:"다음 문장입니다."}]}];');
 writeFileSync(path.join(work,'subs-fast.srt'),'1\n00:00:00,200 --> 00:00:02,000\n2026년입니다.\n\n2\n00:00:03,000 --> 00:00:05,000\n다음 문장입니다.\n');
 assert.deepEqual(checker.sentenceSegments(work,board),[{startSeconds:0,expectedText:'이천이십육년입니다.'},{startSeconds:3,expectedText:'다음 문장입니다.'}]);
 writeFileSync(path.join(work,'subs-fast.srt'),'1\n00:00:00,200 --> 00:00:02,000\n다른 대본입니다.\n');assert.throws(()=>checker.sentenceSegments(work,board),/text\/order/);
});
test('canonical samples are identical for a resampled AAC video and its standard review FLAC',t=>{
 const f=setup(t),video=path.join(f.dir,'audio.m4a'),flac=path.join(f.dir,'review.flac');
 let r=spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=431:sample_rate=48000:duration=2','-ac','2','-c:a','aac',video]);assert.equal(r.status,0,String(r.stderr));
 r=spawnSync('ffmpeg',['-y','-v','error','-i',video,'-map','0:a:0','-map_metadata','-1','-ac','1','-ar','24000','-c:a','flac',flac]);assert.equal(r.status,0,String(r.stderr));
 assert.deepEqual(chapters.decode(video),chapters.decode(flac));
});
process.on('exit',()=>rmSync(root,{recursive:true,force:true}));
