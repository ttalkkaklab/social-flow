#!/usr/bin/env node
'use strict';
// A report is valid only for the current scene text and exact source WAV.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
const normalize = text => text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '');
function cer(expected, heard) {
  const a = [...normalize(expected)], b = [...normalize(heard)];
  if (!a.length || b.length > 12000) return 1;
  let prev = Array.from({length:b.length+1},(_,j)=>j);
  for(let i=1;i<=a.length;i++) {
    const next=[i];
    for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+Number(a[i-1]!==b[j-1]));
    prev=next;
  }
  return prev[b.length]/a.length;
}
function verifyProof(file, expected) {
  const proofFile=file+'.quality.json';
  const report=JSON.parse(fs.readFileSync(proofFile,'utf8'));
  if(report.version!==1||report.policy!=='speech-quality-v1'||report.status!=='pass')throw new Error('missing current speech-quality-v1 PASS');
  if(typeof expected!=='string'||!normalize(expected)||expected.length>4000)throw new Error('invalid expected narration');
  if(report.textSha256!==hash(normalize(expected))||typeof report.expectedText!=='string'||normalize(report.expectedText)!==normalize(expected))throw new Error('narration changed after audio review');
  const audioHash=hash(fs.readFileSync(file));
  if(report.audioSha256!==audioHash)throw new Error('audio changed after review');
  if(!Array.isArray(report.attempts)||report.attempts.length<1||report.attempts.length>3)throw new Error('missing bounded attempt history');
  const take=report.attempts.at(-1), r=take.review, s=take.signal;
  if(take.pending!==false||take.audioSha256!==audioHash||!Array.isArray(take.failures)||take.failures.length||typeof take.transcript!=='string'||cer(expected,take.transcript)>0.02)throw new Error('blind transcript did not pass');
  if(!s||![s.duration,s.rmsDb,s.clippedFraction].every(Number.isFinite)||s.duration<0.25||s.duration>120||s.duration>Math.max(2,[...normalize(expected)].length/4.5*2)||s.rmsDb< -45||s.clippedFraction<0||s.clippedFraction>0.001)throw new Error('audio signal did not pass');
  if(!r||r.complete!==true||!Number.isFinite(r.confidence)||r.confidence<0.9||r.confidence>1||typeof r.evidence!=='string'||r.evidence.trim().length<20||!Array.isArray(r.issues)||r.issues.length)throw new Error('listening review incomplete or defective');
  for(const axis of ['accuracy','pronunciation','naturalness','clarity'])if(!Number.isFinite(r[axis])||r[axis]<(axis==='accuracy'?98:95)||r[axis]>100)throw new Error(axis+' did not pass');
  return {[file]:audioHash,[proofFile]:hash(fs.readFileSync(proofFile))};
}
function check(work, board) {
  work=path.resolve(work);board=path.resolve(board);
  const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(board,'scenes.js'),'utf8'),sandbox,{timeout:5000});
  const win=sandbox.window;
  if(!Array.isArray(win.SCENES))throw new Error('SCENES missing');
  const rows=fs.readFileSync(path.join(work,'cards.tsv'),'utf8').split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#')).map(l=>l.split('\t'));
  const expected=win.SCENES.map((s,i)=>({s,i})).filter(({s})=>!['broll','outro'].includes(s.type));
  if(JSON.stringify(rows.map(r=>r[0]))!==JSON.stringify(expected.map(({i})=>String(i))))throw new Error('card order differs from SCENES');
  const media={};
  for(const [k,{s,i}] of expected.entries()) {
    const file=path.resolve(work,rows[k][1]);
    // Retain provenance for live/silent sources too. An arbitrary sync=1 does not waive TTS QA.
    media[file]=hash(fs.readFileSync(file));
    const text=(s.narration||[]).map(n=>n.tts||'').join('. ');
    const live=win.VOICE==='user'||s.visual?.source==='recording'||(s.visual?.source==='screencast'&&s.visual?.sync===true);
    if(live||!normalize(text))continue;
    try {Object.assign(media,verifyProof(file,text));}
    catch(e){throw new Error(`card ${i}: ${e.message}; generate with tts_generate_checked before assembly`);}
  }
  return media;
}
module.exports={check,verifyProof,normalize,cer};
if(require.main===module){try{check(process.argv[2],process.argv[3]||path.resolve(process.argv[2],'../storyboard'));console.log('PASS all generated narration: current audio, transcript and listening review');}catch(e){console.error('TTS quality: '+e.message);process.exitCode=1;}}
