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
const REPORT='final-tts-warnings.json', APPROVAL='final-tts-approval.json';
const read=file=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
function findings(p){
  const r=p.review||{}, parts=[`proof status ${p.status}`];
  if(Number.isFinite(r.accuracy)) parts.push(`accuracy ${r.accuracy} · pronunciation ${r.pronunciation} · naturalness ${r.naturalness} · clarity ${r.clarity} · continuity ${r.continuity}`);
  if(Array.isArray(p.failures)&&p.failures.length) parts.push('failures: '+p.failures.join('; '));
  for(const i of r.issues||[]) parts.push(`${i.category} at ${Number(i.start).toFixed(2)}s heard "${i.heard}" for "${i.expected}" — ${i.correction}`);
  if(typeof r.continuityEvidence==='string') parts.push('continuity: '+r.continuityEvidence);
  if(typeof p.error==='string') parts.push(p.error);
  return parts.join(' | ');
}
/**
 * The final listening verdict is a warning the user decides on (user directive 2026-09-15), like
 * the scene takes in check-tts-quality.js. A review that never ran, or ran into an outage
 * (`unverified`), is an error: there is nothing to decide on. The approval binds to the media
 * bytes, the narration and the exact warnings.
 */
function gate(work, media, text){
  work=path.resolve(work);
  const p=read(media+'.speech-quality.json');
  if(!p)throw new Error('Final listening has not run for '+media);
  if(p.status==='unverified')throw new Error('Final listening is unverified ('+(p.error||'review outage')+'); rerun the review before deciding');
  const warnings=[];
  try{verifyReport(p,media,text);}catch(e){warnings.push('final: '+e.message+' — '+findings(p));}
  const fingerprint=createHash('sha256').update(JSON.stringify({mediaSha256:hash(media),textSha256:createHash('sha256').update(normalize(text)).digest('hex'),warnings})).digest('hex');
  const approval=read(path.join(work,APPROVAL));
  const approved=warnings.length>0&&approval?.kind==='user'&&approval.fingerprint===fingerprint&&typeof approval.reference==='string'&&approval.reference.trim().length>0&&Number.isFinite(Date.parse(approval.at));
  const report={fingerprint,warnings,approved:Boolean(approved),approval:approved?approval:null,status:warnings.length?(approved?'approved-with-warnings':'awaiting-user'):'pass'};
  fs.writeFileSync(path.join(work,REPORT),JSON.stringify(report,null,2)+'\n');
  for(const w of warnings) console.error('Final TTS warning: '+w);
  if(warnings.length&&!approved)throw new Error('Final TTS checks need HITL: show '+path.join(work,REPORT)+' to the user. After explicit approval, record it with check-final-tts.js approve; then rerun check-final-tts.js and delivery-proof.js.');
  if(approved) console.error('User approved the final TTS warnings; continuing.');
  return {report:p,warnings,approval:approved?approval:null};
}
function approve(work, reference){
  work=path.resolve(work);
  if(typeof reference!=='string'||!reference.trim())throw new Error('An explicit user approval reference is required');
  const report=read(path.join(work,REPORT));
  if(!report?.warnings?.length||!report.fingerprint)throw new Error('Run the final TTS check and present the warnings before recording approval');
  fs.writeFileSync(path.join(work,APPROVAL),JSON.stringify({kind:'user',fingerprint:report.fingerprint,reference,at:new Date().toISOString()},null,2)+'\n');
}
/** The final speech evidence delivery-proof.js embeds: the review, plus the user's approval when it carries warnings. */
function evidence(media,text,work){
  const {report,warnings,approval}=gate(work,media,text);
  return approval?{...report,approvedWarnings:{warnings,approval}}:report;
}
/** verifyReport, or the approved-warnings form of it: the approval must still match these bytes, this narration and these warnings. */
function verifyEvidence(p,media,text){
  if(!p?.approvedWarnings)return verifyReport(p,media,text);
  const {warnings,approval}=p.approvedWarnings;
  const fingerprint=createHash('sha256').update(JSON.stringify({mediaSha256:hash(media),textSha256:createHash('sha256').update(normalize(text)).digest('hex'),warnings})).digest('hex');
  if(!Array.isArray(warnings)||!warnings.length||approval?.kind!=='user'||approval.fingerprint!==fingerprint||typeof approval.reference!=='string'||!approval.reference.trim())throw new Error('Final speech warnings were approved for other media, narration or findings');
  if(p.mediaSha256!==hash(media))throw new Error('Final speech evidence describes other media');
  return p;
}
function review(work){
  const board=path.resolve(work,'../storyboard/scenes.js');
  if(!fs.existsSync(board))return; // Recording workflows have no generated narration.
  const {generated,text}=narration(board);if(!generated)return;
  const media=path.resolve(work,'reel-fast.mp4');
  const rows=fs.readFileSync(path.join(work,'cards.tsv'),'utf8').split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#'));
  const proof=rows.map(l=>path.resolve(work,l.split('\t')[1])+'.quality.json').filter(f=>fs.existsSync(f)).map(f=>JSON.parse(fs.readFileSync(f,'utf8'))).find(p=>p.language&&p.delivery);
  if(!proof)throw new Error('Final listening needs reviewed narration and its language/delivery');
  const request=path.join(work,'final-speech-request.json');
  fs.writeFileSync(request,JSON.stringify({mediaPath:media,expectedText:text,language:proof.language,delivery:proof.delivery}));
  const result=spawnSync(process.execPath,[path.resolve(__dirname,'../../../server/dist/bundle.js'),'--review-final',path.resolve(request)],{stdio:'inherit'});
  if(result.error)throw result.error;
  // A failed listen is a warning for the user (gate); a review that did not run is not.
  gate(work,media,text);
}
module.exports={narration,verify,verifyReport,verifyEvidence,evidence,gate,approve,review};
if(require.main===module){
  try{
    const [command,work,arg]=process.argv.slice(2);
    if(command==='approve') approve(work||'.',arg);
    else review(path.resolve((command==='check'?work:command)||'.'));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
