'use strict';
// One manifest/planner for the server, delivery checker and publishing gate.
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {normalize,cer}=require('./check-tts-quality.js');
const RATE=24000, BYTES=4, LIMIT=14*1024*1024, POLICY='final-speech-chapters-v1';
const hash=x=>createHash('sha256').update(x).digest('hex');
const digest=x=>hash(JSON.stringify(x));
function decode(media){
  // Reproduce the established final-review FLAC conversion before extracting samples.
  // Decoding AAC/resampled source directly to s32 would retain low bits the FLAC lane
  // cannot represent, and would falsely report stale evidence on the shipped video.
  const encoded=spawnSync('ffmpeg',['-v','error','-i',media,'-map','0:a:0','-map_metadata','-1','-ac','1','-ar',String(RATE),'-c:a','flac','-f','flac','pipe:1'],{maxBuffer:RATE*BYTES*1800+65536,timeout:60000});
  if(encoded.error||encoded.status!==0)throw new Error('Cannot decode final audio: '+(encoded.error?.message||String(encoded.stderr)));
  const r=spawnSync('ffmpeg',['-v','error','-i','pipe:0','-map','0:a:0','-f','s32le','pipe:1'],{input:encoded.stdout,maxBuffer:RATE*BYTES*1800+1024,timeout:60000});
  if(r.error||r.status!==0)throw new Error('Cannot decode canonical FLAC: '+(r.error?.message||String(r.stderr)));
  if(!r.stdout.length||r.stdout.length%BYTES)throw new Error('Empty or invalid final PCM');
  return r.stdout;
}
function plan(segments,totalSamples,text){
  if(!Number.isInteger(totalSamples)||totalSamples<=0||totalSamples>RATE*1800||!Array.isArray(segments)||!segments.length||segments.length>1000)throw new Error('Invalid chapter timeline');
  if(normalize(segments.map(s=>s.expectedText).join(' '))!==normalize(text))throw new Error('Chapter text does not cover the complete narration in order');
  const units=segments.map((s,i)=>({startSample:Math.round(s.startSeconds*RATE),endSample:i+1<segments.length?Math.round(segments[i+1].startSeconds*RATE):totalSamples,expectedText:s.expectedText}));
  for(const [i,u] of units.entries())if(!Number.isFinite(segments[i].startSeconds)||!Number.isSafeInteger(u.startSample)||u.startSample<0||(i===0&&u.startSample!==0)||u.endSample<=u.startSample||u.endSample>totalSamples||u.endSample-u.startSample>RATE*60||typeof u.expectedText!=='string'||!normalize(u.expectedText)||u.expectedText.length>1000)throw new Error('Invalid sentence boundary or sentence longer than 60 seconds');
  const chapters=[];let first=0;
  for(let i=0;i<units.length;i++){
    const next=units[i+1];
    if(!next||next.endSample-units[first].startSample>RATE*120||units.slice(first,i+2).map(u=>u.expectedText).join('. ').length>4000){
      chapters.push({kind:'chapter',index:chapters.length,firstUnit:first,lastUnit:i,startSample:units[first].startSample,endSample:units[i].endSample,expectedText:units.slice(first,i+1).map(u=>u.expectedText).join('. ')});first=i+1;
    }
  }
  const boundaries=chapters.slice(1).map((c,i)=>{const a=units[c.firstUnit-1],b=units[c.firstUnit];return {kind:'boundary',index:i,firstUnit:c.firstUnit-1,lastUnit:c.firstUnit,startSample:a.startSample,endSample:b.endSample,expectedText:[a.expectedText,b.expectedText].join('. ')};});
  return [...chapters,...boundaries];
}
function manifest(p){return digest({sampleRate:p.sampleRate,totalSamples:p.totalSamples,pcmSha256:p.pcmSha256,segments:p.segments,pieces:p.pieces});}
function listeningFailures(p){
  const r=p.review,s=p.signal,f=[];
  if(p.status==='unverified'||!r)throw new Error('Chapter listening is unverified');
  if(p.transcript!==null&&typeof p.transcript!=='string')throw new Error('Missing chapter transcript record');
  if(p.transcriptCheck&&typeof p.transcript!=='string')throw new Error('Requested chapter transcript is missing');
  if(typeof p.transcript==='string'&&cer(p.expectedText,p.transcript)>0.02)f.push('Blind transcript CER exceeds 2%');
  if(!r.complete||!Number.isFinite(r.confidence)||r.confidence<0.9||r.confidence>1||!Array.isArray(r.issues))throw new Error('Incomplete chapter listening');
  for(const k of ['accuracy','pronunciation','naturalness','clarity','continuity']){if(!Number.isFinite(r[k])||r[k]<0||r[k]>100)throw new Error('Invalid chapter score');if(r[k]<(k==='accuracy'?98:95))f.push(k+' below threshold');}
  for(const k of ['evidence','continuityEvidence'])if(typeof r[k]!=='string'||r[k].trim().length<20)throw new Error('Missing chapter listening evidence');
  if(r.issues.length)f.push('Audible defects reported');
  if(r.issues.some(i=>![i.start,i.end].every(Number.isFinite)||i.start<0||i.end<i.start||i.end>s?.duration+0.1))throw new Error('Invalid chapter issue timestamps');
  if(!s||![s.duration,s.rmsDb,s.clippedFraction].every(Number.isFinite)||Math.abs(s.duration-(p.endSample-p.startSample)/RATE)>1/RATE||s.clippedFraction<0)throw new Error('Invalid chapter signal');
  if(s.duration<0.25||s.duration>Math.max(2,[...normalize(p.expectedText)].length/4.5*2)||s.rmsDb< -45||s.clippedFraction>0.001)f.push('Chapter signal did not pass');
  return f;
}
function validate(p,pcm,text,requirePass=true){
  if(p.policy!==POLICY||p.version!==1||p.sampleRate!==RATE||p.totalSamples!==pcm.length/BYTES||p.pcmSha256!==hash(pcm)||normalize(p.expectedText)!==normalize(text)||p.textSha256!==hash(normalize(text)))throw new Error('Chapter proof describes other audio or narration');
  const expected=plan(p.segments,p.totalSamples,text);
  if(!Array.isArray(p.pieces)||p.pieces.length!==expected.length||p.manifestSha256!==manifest(p))throw new Error('Missing, duplicated or altered chapter/boundary evidence');
  const failures=[];
  for(let i=0;i<expected.length;i++){
    const e=expected[i],v=p.pieces[i];
    for(const [k,value] of Object.entries(e))if(v[k]!==value)throw new Error('Chapter order or boundary changed: '+k);
    if(v.pcmSha256!==hash(pcm.subarray(e.startSample*BYTES,e.endSample*BYTES))||!Number.isInteger(v.payloadBytes)||v.payloadBytes<=0||v.payloadBytes>LIMIT||!/^[a-f0-9]{64}$/.test(v.audioSha256||''))throw new Error('Chapter audio hash or payload changed');
    if(v.model!==p.model||digest(v.transcriptCheck??null)!==digest(p.transcriptCheck??null))throw new Error('Chapter reviewer/request differs from manifest');
    const f=listeningFailures(v);
    if(!['pass','fail'].includes(v.status)||!Array.isArray(v.failures)||digest(v.failures)!==digest(f)||v.status!==(f.length?'fail':'pass'))throw new Error('Chapter verdict does not match its review');
    failures.push(...f.map(x=>`${e.kind} ${e.index}: ${x}`));
  }
  if(!['pass','fail'].includes(p.status)||p.status!==(failures.length?'fail':'pass')||digest(p.failures)!==digest(failures))throw new Error('Final chapter verdict does not match complete evidence');
  if(requirePass&&failures.length)throw new Error(failures.join('; '));
  return failures;
}
module.exports={RATE,BYTES,LIMIT,POLICY,hash,digest,decode,plan,manifest,listeningFailures,validate};
