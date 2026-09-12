#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {normalize,cer}=require('./check-tts-quality.js');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function narration(board){
  const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(board,'utf8'),sandbox,{timeout:5000});
  const w=sandbox.window;
  if(!Array.isArray(w.SCENES))throw new Error('Missing SCENES for final listening');
  const generated=w.VOICE!=='user'&&w.SCENES.some(s=>!['broll','outro'].includes(s.type)&&!(s.visual?.source==='screencast'&&s.visual?.sync===true)&&(s.narration||[]).some(n=>normalize(n.tts||'')));
  const speech=require('../../storyboard/references/story-contract.js').storySpeech(w).map(g=>g.n.tts||g.n.sub);
  const outro=w.SCENES.filter(s=>s.type==='outro').flatMap(s=>(s.narration||[]).map(n=>n.tts||''));
  return {generated,text:[...speech,...outro].filter(Boolean).join('. ')};
}
function verify(media,text){
  return verifyReport(JSON.parse(fs.readFileSync(media+'.speech-quality.json','utf8')),media,text);
}
function verifyReport(p,media,text){
  const r=p.review,s=p.signal;
  if(p.version!==1||p.policy!=='final-speech-v1'||p.status!=='pass'||p.mediaSha256!==hash(media))throw new Error('Final speech needs a current hash-bound PASS');
  if(typeof p.expectedText!=='string'||normalize(p.expectedText)!==normalize(text)||cer(text,p.transcript||'')>0.02)throw new Error('Final speech transcript differs from narration');
  if(!Array.isArray(p.failures)||p.failures.length||!r||r.complete!==true||!Number.isFinite(r.confidence)||r.confidence<0.9||r.confidence>1||!Array.isArray(r.issues)||r.issues.length)throw new Error('Final speech review is incomplete or defective');
  for(const k of ['accuracy','pronunciation','naturalness','clarity','continuity'])if(!Number.isFinite(r[k])||r[k]<(k==='accuracy'?98:95)||r[k]>100)throw new Error(`Final speech ${k} below threshold`);
  for(const k of ['evidence','continuityEvidence'])if(typeof r[k]!=='string'||r[k].trim().length<20)throw new Error('Missing final listening evidence');
  if(!s||![s.duration,s.rmsDb,s.clippedFraction].every(Number.isFinite)||s.duration<0.25||s.duration>1800||s.duration>Math.max(2,[...normalize(text)].length/4.5*2)||s.rmsDb< -45||s.clippedFraction<0||s.clippedFraction>0.001)throw new Error('Final signal did not pass');
  return p;
}
function review(work){
  const board=path.resolve(work,'../storyboard/scenes.js');
  if(!fs.existsSync(board))return; // Recording workflows have no generated narration.
  const {generated,text}=narration(board);if(!generated)return;
  const media=path.resolve(work,'reel-fast.mp4');
  const rows=fs.readFileSync(path.join(work,'cards.tsv'),'utf8').split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#'));
  const proof=rows.map(l=>path.resolve(work,l.split('\t')[1])+'.quality.json').filter(f=>fs.existsSync(f)).map(f=>JSON.parse(fs.readFileSync(f,'utf8'))).find(p=>p.status==='pass');
  if(!proof)throw new Error('Final listening needs reviewed narration and its language/delivery');
  const request=path.join(work,'final-speech-request.json');
  fs.writeFileSync(request,JSON.stringify({mediaPath:media,expectedText:text,language:proof.language,delivery:proof.delivery}));
  const result=spawnSync(process.execPath,[path.resolve(__dirname,'../../../server/dist/bundle.js'),'--review-final',path.resolve(request)],{stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error('Final listening failed or is unverified; hold delivery');
  verify(media,text);
}
module.exports={narration,verify,verifyReport,review};
if(require.main===module){try{review(path.resolve(process.argv[2]||'.'));}catch(e){console.error(e.message);process.exitCode=1;}}
