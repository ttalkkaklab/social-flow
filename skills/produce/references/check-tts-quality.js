#!/usr/bin/env node
'use strict';
// A report is valid only for the current scene text and exact source WAV.
const fs = require('node:fs'), path = require('node:path');
const { evaluateWindowScript } = require('../../_shared/scenes-vm.js');
const { createHash } = require('node:crypto');
const { authorizeSpeed } = require('./tts-speed-policy.js');
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
const REPORT='tts-warnings.json', APPROVAL='tts-approval.json';
const read=file=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
/** What a proof says about its last take, for the user to judge the warning by. */
function findings(file) {
  const proof=read(file+'.quality.json'); if(!proof) return 'no speech-quality proof beside the take';
  const take=Array.isArray(proof.attempts)?proof.attempts.at(-1):null, r=take?.review;
  const parts=[`proof status ${proof.status}`, `${Array.isArray(proof.attempts)?proof.attempts.length:0} attempt(s)`];
  if(r) parts.push(`accuracy ${r.accuracy} · pronunciation ${r.pronunciation} · naturalness ${r.naturalness} · clarity ${r.clarity}`);
  if(Array.isArray(take?.failures)&&take.failures.length) parts.push('failures: '+take.failures.join('; '));
  for(const i of r?.issues||[]) parts.push(`${i.category} at ${Number(i.start).toFixed(2)}s heard "${i.heard}" for "${i.expected}" — ${i.correction}`);
  if(typeof take?.transcript==='string') parts.push('heard: '+take.transcript);
  return parts.join(' | ');
}
/**
 * Speech findings are warnings the user decides on (user directive 2026-09-15), like the video
 * findings in assembly-video-gate.js. A missing WAV, a card order that differs from SCENES or a
 * speed request that changed after review is still an error: nothing to listen to, or a
 * separate authorization. With warnings and no matching approval the check throws for HITL;
 * `approve` records the user's actual answer, bound to these warnings, WAVs and proofs.
 */
function decide(work, warnings, inputs) {
  const fingerprint=hash(JSON.stringify({inputs,warnings}));
  const approval=read(path.join(work,APPROVAL));
  const approved=warnings.length>0&&approval?.kind==='user'&&approval.fingerprint===fingerprint&&
    typeof approval.reference==='string'&&approval.reference.trim().length>0&&Number.isFinite(Date.parse(approval.at));
  const report={fingerprint,warnings,inputs,approved:Boolean(approved),approval:approved?approval:null,status:warnings.length?(approved?'approved-with-warnings':'awaiting-user'):'pass'};
  fs.writeFileSync(path.join(work,REPORT),JSON.stringify(report,null,2)+'\n');
  for(const warning of warnings) console.error('TTS warning: '+warning);
  if(warnings.length&&!approved) throw new Error('TTS checks need HITL: show '+path.join(work,REPORT)+' to the user. After explicit approval, record it with check-tts-quality.js approve; then rerun.');
  if(approved) console.error('User approved these TTS warnings; continuing.');
  return report;
}
function approve(work, reference) {
  work=path.resolve(work);
  if(typeof reference!=='string'||!reference.trim()) throw new Error('An explicit user approval reference is required');
  const report=read(path.join(work,REPORT));
  if(!report?.warnings?.length||!report.fingerprint) throw new Error('Run the TTS check and present the warnings before recording approval');
  // The agent records an actual user answer; this command must never infer consent.
  fs.writeFileSync(path.join(work,APPROVAL),JSON.stringify({kind:'user',fingerprint:report.fingerprint,reference,at:new Date().toISOString()},null,2)+'\n');
}
const lastReport=work=>read(path.join(path.resolve(work),REPORT));
function check(work, board) {
  work=path.resolve(work);board=path.resolve(board);
  const scenesFile=path.join(board,'scenes.js');
  const win=evaluateWindowScript(fs.readFileSync(scenesFile,'utf8'),{filename:scenesFile});
  if(!Array.isArray(win.SCENES))throw new Error('SCENES missing');
  const rows=fs.readFileSync(path.join(work,'cards.tsv'),'utf8').split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#')).map(l=>l.split('\t'));
  const expected=win.SCENES.map((s,i)=>({s,i})).filter(({s})=>!['broll','outro'].includes(s.type));
  if(JSON.stringify(rows.map(r=>r[0]))!==JSON.stringify(expected.map(({i})=>String(i))))throw new Error('card order differs from SCENES');
  const media={}, warnings=[], inputs={};
  const speech=require('../../storyboard/references/story-contract.js').storySpeech(win);
  const spoken=[...new Set(speech.map(g=>g.shot))].map(shot=>({i:shot-1,text:speech.filter(g=>g.shot===shot).map(g=>g.n.tts||g.n.sub).join('. ')}));
  const texts=spoken.map(s=>s.text);
  let episodeSettings;

  for(const [k,{s,i}] of expected.entries()) {
    const file=path.resolve(work,rows[k][1]);
    // Retain provenance for live/silent sources too. An arbitrary sync=1 does not waive TTS QA.
    media[file]=hash(fs.readFileSync(file));
    const text=(s.narration||[]).map(n=>n.tts||'').join('. ');
    const live=win.VOICE==='user'||(s.visual?.source==='recording'&&!normalize(text))||(s.visual?.source==='screencast'&&s.visual?.sync===true);
    if(live||!normalize(text))continue;
    const proofFile=file+'.quality.json';
    inputs[file]=media[file]; inputs[proofFile]=fs.existsSync(proofFile)?hash(fs.readFileSync(proofFile)):null; inputs['text:'+i]=normalize(text);
    try {
      Object.assign(media,verifyProof(file,text));
      const proof=JSON.parse(fs.readFileSync(proofFile,'utf8'));
      if(proof.generator==='tts_elevenlabs_generate') {
        const e=proof.episode;
        if(!e||e.index!==spoken.findIndex(v=>v.i===i)||JSON.stringify(e.texts.map(normalize))!==JSON.stringify(texts.map(normalize)))throw new Error('ElevenLabs requires complete ordered episode context');
        if(!proof.voiceSettings||proof.voiceSettings.seed!==e.seed||proof.attempts.some(t=>t.seed!==e.seed))throw new Error('ElevenLabs episode seed drift');
        // 발음 사전은 컷별로 다를 수 있다(tts-quality.md 65-68행: 컷마다 사전을 핀으로 박는 것이 정식 절차).
        // 목소리 정체성이 아니므로 컷 간 동일성 비교에서 제외한다.
        const {pronunciationDictionaryLocators, ...voiceIdentity} = proof.voiceSettings;
        const settings = JSON.stringify(voiceIdentity);
        if(episodeSettings&&episodeSettings!==settings)throw new Error('ElevenLabs voice/settings changed between scenes');
        episodeSettings=settings;
      }
    }
    catch(e){
      // A quality verdict is the user's call; the proof file (whatever it says) still travels in the provenance.
      if(fs.existsSync(proofFile)) media[proofFile]=hash(fs.readFileSync(proofFile));
      warnings.push(`card ${i}: ${e.message} — ${findings(file)}`);
    }
    // The speed record is an authorization, not a quality verdict: it stays an error.
    const proof=read(proofFile);
    if(proof){
      if (!Number.isFinite(proof.generationSpeed) || !Number.isFinite(proof.playbackSpeed)) throw new Error(`card ${i}: missing recorded TTS speed; regenerate at 1.0 or with an explicit user request`);
      const approval = authorizeSpeed(work, 'generation', proof.generationSpeed);
      if (approval && JSON.stringify(approval) !== JSON.stringify(proof.speedAuthorization?.generation)) throw new Error(`card ${i}: TTS speed request changed after audio review; regenerate with the current explicit request`);
      authorizeSpeed(work, 'final', proof.playbackSpeed ?? 1);
    }
  }
  decide(work,warnings,inputs);
  return media;
}
function checkTempo(work,speed,min=1,max=1) {
  if ([min,max].some(n => Number(n) !== 1)) throw new Error('Per-card tempo changes are forbidden; assembly is fixed at 1.0');
  authorizeSpeed(work, 'final', Number(speed));
  const cards=path.join(work,'cards.tsv');if(!fs.existsSync(cards))return;
  const generated=fs.readFileSync(cards,'utf8').split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#')).some(l=>{
    const p=path.resolve(work,l.split('\t')[1])+'.quality.json';
    return fs.existsSync(p)&&JSON.parse(fs.readFileSync(p,'utf8')).generator==='tts_elevenlabs_generate';
  });
  if(generated&&[speed,min,max].some(n=>Number(n)!==1))throw new Error('ElevenLabs narration forbids post-synthesis tempo changes; set SPEED=1 and ATEMPO_MIN=ATEMPO_MAX=1, use generation.speed');
}
module.exports={check,decide,approve,lastReport,findings,verifyProof,normalize,cer,checkTempo};
if(require.main===module){
  try{
    const [command,work,arg]=process.argv.slice(2);
    if(command==='approve') approve(work,arg);
    else {
      const dir=command==='check'?work:command, board=(command==='check'?arg:work)||path.resolve(dir,'../storyboard');
      if(!dir) throw new Error('usage: check-tts-quality.js check <workdir> [storyboard] | approve <workdir> <user approval reference>');
      check(dir,board);
      const report=lastReport(dir);
      console.log(report.warnings.length?`Generated narration proceeds with ${report.warnings.length} user-approved warning(s); see ${REPORT}`:'PASS all generated narration: current audio, transcript and listening review');
    }
  }catch(e){console.error('TTS quality: '+e.message);process.exitCode=1;}
}
