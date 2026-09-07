#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const duration=f=>{
  const n=Number(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=duration','-of','csv=p=0',f],{encoding:'utf8'}).trim());
  if(!Number.isFinite(n)||n<=0)throw new Error('cannot measure video duration: '+f);return n;
};
const BASE=['reel.mp4','reel-sub.mp4','subs.srt'],SPLICED=['reel-spliced.mp4','reel-sub-spliced.mp4','subs-spliced.srt'];
const hashes=(work,files)=>Object.fromEntries(files.map(f=>[f,fs.existsSync(path.join(work,f))?hash(path.join(work,f)):null]));
function match(work,expected){for(const [file,want] of Object.entries(expected))if((fs.existsSync(path.resolve(work,file))?hash(path.resolve(work,file)):null)!==want)throw new Error('checked output was replaced: '+file)}
function load(work){
  const proof=JSON.parse(fs.readFileSync(path.join(work,'build-plan-check.json'),'utf8'));
  const source=path.join(proof.storyboard,'scenes.js');
  const speechMedia=require('./check-tts-quality.js').check(work,proof.storyboard);
  match(work,{[source]:proof.scenesSha256,'cards.tsv':proof.cardsSha256,'segs.tsv':proof.segsSha256});
  if(!proof.resolvedCardsSha256||!proof.editPlanSha256)throw new Error('rebuild: missing compiled edit provenance');
  match(work,{'cards.resolved.tsv':proof.resolvedCardsSha256,'edit-plan.json':proof.editPlanSha256});
  if(!proof.mediaSha256)throw new Error('rebuild: missing media provenance');
  match(work,proof.mediaSha256);
  for(const [file,digest] of Object.entries(speechMedia))if(proof.mediaSha256[file]!==digest)throw new Error('rebuild: missing or stale audio review provenance: '+file);
  const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(source,'utf8'),sandbox,{timeout:5000});
  return {proof,scenes:sandbox.window.SCENES};
}
function masters(work){
  const verified=JSON.parse(fs.readFileSync(path.join(work,'assembled-check.json'),'utf8'));
  if(!verified.outputs||BASE.some(f=>!Object.hasOwn(verified.outputs,f))||!verified.outputs['reel.mp4'])throw new Error('rebuild: both masters and subtitles need a current proof');
  match(work,verified.outputs);
  if(!verified.editCheckSha256)throw new Error('rebuild: missing rendered edit verification');
  match(work,{'edit-check.json':verified.editCheckSha256});
  return verified;
}
function check(work,delivery,burned,subtitles){
  const {proof,scenes}=load(work),master=path.join(work,'reel.mp4');
  if(delivery){
    const verified=masters(work),inserted=scenes.some(s=>s.type==='broll');
    const expectedNames=inserted?SPLICED:BASE;
    const names=[delivery,burned,subtitles];
    if(names.some((f,i)=>!f||path.resolve(work,f)!==path.join(work,expectedNames[i])))throw new Error('delivery must use the checked clean, burned and subtitle set');
    if(inserted){
      const splice=JSON.parse(fs.readFileSync(path.join(work,'splice-check.json'),'utf8'));
      if(splice.assembledSha256!==hash(path.join(work,'assembled-check.json'))||!splice.outputs||SPLICED.some(f=>!Object.hasOwn(splice.outputs,f))||!splice.outputs['reel-spliced.mp4'])throw new Error('missing or stale splice proof');
      match(work,splice.inputs);match(work,splice.outputs);
    }
    const expected=verified.duration+scenes.filter(s=>s.type==='broll').reduce((sum,s)=>sum+s.duration,0);
    for(const file of names.slice(0,2).filter(f=>fs.existsSync(path.resolve(work,f))))if(Math.abs(duration(path.resolve(work,file))-expected)>.2)throw new Error('assembled timeline differs from the checked master plus planned inserts');
    return;
  }
  const first=proof.cards[0],planned=scenes[first].duration;
  const actual=duration(path.join(work,'work',`v${first}.mp4`));
  if(!Number.isFinite(planned)||Math.abs(actual-planned)>.5)throw new Error(`opening is ${actual}s but the plan says ${planned}s; reconcile measured narration and trim before assembly`);
  for(const i of proof.cards)if(scenes[i].shot?.render?.mode==='editorial_html'&&duration(path.join(work,'work',`v${i}.mp4`))>8.07)throw new Error('text-led card '+i+' exceeds 8 seconds after encoding');
  if(fs.existsSync(path.join(work,'reel-sub.mp4'))&&Math.abs(duration(path.join(work,'reel-sub.mp4'))-duration(master))>.07)throw new Error('clean and burned masters differ in duration');
  require('./check-edit-timeline.js').check(work);
  fs.writeFileSync(path.join(work,'assembled-check.json'),JSON.stringify({editCheckSha256:hash(path.join(work,'edit-check.json')),outputs:hashes(work,BASE),duration:duration(master),opening:actual,plannedOpening:planned},null,2)+'\n');
}
function splice(work,args,finish=false){
  const {proof,scenes}=load(work);masters(work);
  const record=path.join(work,'splice-check.json');
  if(finish){
    const saved=JSON.parse(fs.readFileSync(record,'utf8'));
    if(saved.assembledSha256!==hash(path.join(work,'assembled-check.json')))throw new Error('master changed during splice');
    match(work,saved.inputs);saved.outputs=hashes(work,SPLICED);fs.writeFileSync(record,JSON.stringify(saved,null,2)+'\n');return;
  }
  const inserts=scenes.map((s,i)=>({s,i})).filter(({s})=>s.type==='broll');
  if(args.length!==inserts.length*2)throw new Error('splice count differs from SCENES');
  const inputs={};
  inserts.forEach(({s,i},j)=>{
    const declared=s.visual?.renderedFile||s.visual?.clip;
    if(typeof declared!=='string')throw new Error('b-roll needs visual.renderedFile or visual.clip');
    const file=path.resolve(proof.storyboard,declared),actual=path.resolve(work,args[j*2]);
    if(file!==actual)throw new Error('splice clip differs from the declared source');
    const t=scenes.slice(0,i).reduce((sum,s,k)=>sum+(['broll','outro'].includes(s.type)?0:duration(path.join(work,'work',`v${k}.mp4`))),0);
    if(Math.abs(Number(args[j*2+1])-t)>.07||!Number.isFinite(Number(args[j*2+1])))throw new Error('splice position differs from SCENES order');
    if(Math.abs(duration(file)-s.duration)>.1)throw new Error('splice clip duration differs from SCENES');
    inputs[file]=hash(file);
  });
  fs.writeFileSync(record,JSON.stringify({assembledSha256:hash(path.join(work,'assembled-check.json')),inputs},null,2)+'\n');
}
if(require.main===module){try{
 const [work,mode,...args]=process.argv.slice(2),dir=path.resolve(work);
 if(mode==='--splice-start')splice(dir,args);else if(mode==='--splice-finish')splice(dir,[],true);else check(dir,mode,...args);
 console.log('Assembled timeline verified.');
}catch(e){console.error('assembly: '+e.message);process.exitCode=1}}
module.exports={check,splice};
