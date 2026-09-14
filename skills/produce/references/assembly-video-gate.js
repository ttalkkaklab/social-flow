#!/usr/bin/env node
'use strict';
// Assembly-only HITL: generation and publishing retain their own authorization.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const hash = value => createHash('sha256').update(value).digest('hex');
const REPORT = 'assembly-video-warnings.json';
const APPROVAL = 'assembly-video-approval.json';
function read(file) { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : null; }
function snapshot(work, board) {
  const files = new Set([path.join(board,'scenes.js')]);
  for (const name of ['cards.tsv','segs.tsv','video-review.json','cost-tally.tsv','format.env']) files.add(path.join(work,name));
  const win = {window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(board,'scenes.js'),'utf8'),win,{timeout:5000});
  // Include source images, clips and previz bytes as well as the plan itself.
  function visit(value) {
    if (typeof value === 'string' && value && !/^https?:/.test(value)) {
      const file = path.resolve(value.startsWith('.work/') ? path.dirname(board) : board,value);
      try { if(fs.statSync(file).isFile()) files.add(file); } catch {}
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  }
  visit(win.window);
  if(fs.existsSync(path.join(work,'segs.tsv'))) {
    for(const line of fs.readFileSync(path.join(work,'segs.tsv'),'utf8').split(/\r?\n/)) {
      if(!line.trim() || line.startsWith('#')) continue;
      for(const file of (line.split('\t')[2] || '').split(/\||::/))
        if(file) files.add(path.resolve(work,file.replace(/^@/,'')));
    }
  }
  const dimensions={W:process.env.W||null,H:process.env.H||null};
  files.add(path.join(work,'format.env'));
  return {dimensions,files:Object.fromEntries([...files].sort().map(file=>[file,fs.existsSync(file)?hash(fs.readFileSync(file)):null]))};
}
function assemblyWarnings(work, board, scenes, format) {
  const warnings=[];
  const envFile=path.join(work,'format.env');
  const env=fs.existsSync(envFile)?fs.readFileSync(envFile,'utf8'):'';
  const value=(key,fallback)=>Number(process.env[key] || env.match(new RegExp('\\$\\{'+key+':=(\\d+)\\}'))?.[1] || fallback);
  const width=value('W',1080),height=value('H',1920);
  const segFile=path.join(work,'segs.tsv');
  const sources=new Set();
  if(fs.existsSync(segFile)) for(const line of fs.readFileSync(segFile,'utf8').split(/\r?\n/)) {
    if(!line.trim()||line.startsWith('#'))continue;
    for(const part of (line.split('\t')[2]||'').split('|')) {
      const file=part.split('::')[0].replace(/^@/,'');
      if(file)sources.add(path.resolve(work,file));
    }
  }
  for(const file of sources) {
    const run=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',file],{encoding:'utf8'});
    if(run.error||run.status!==0)throw new Error('Cannot read source dimensions: '+file);
    const stream=JSON.parse(run.stdout).streams?.[0];
    if(!stream?.width||!stream?.height)throw new Error('Cannot read source dimensions: '+file);
    if(width>height ? stream.width<=stream.height : stream.width>=stream.height)
      warnings.push('Source orientation differs from '+width+'x'+height+' canvas; center crop loses part of the frame: '+file);
  }
  const cards=path.join(work,'cards.tsv');
  if(fs.existsSync(cards)) {
    const plan=require('./edit-plan.js').compile(scenes,fs.readFileSync(cards,'utf8'),{videoWarningsApproved:true}).plan;
    for(const p of plan) if(scenes[p.card].visual?.reuse!==undefined && (p.in!==0||p.handle!==0))
      warnings.push('Reused card '+p.card+' requests trimming or live handles; assembly will use the planned source offset and available frames');
  }
  for(const [i,s] of scenes.entries()) if(s.visual?.reuse!==undefined) {
    const production=require('./check-production.js');
    try { production.validateReuseAsset(board,s,format); } catch(e) { warnings.push('shot '+(i+1)+': '+e.message); }
    const clip=production.assetPath(board,production.videoFile(s));
    const run=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',clip],{encoding:'utf8'});
    if(run.error||run.status!==0)throw new Error('Cannot read reused clip: '+clip);
    const seconds=Number(JSON.parse(run.stdout).format?.duration);
    if(Math.abs(seconds-s.duration)>.05)warnings.push('Reused card '+i+' uses '+s.duration+'s of a '+seconds+'s source; assembly will use the planned cut length');
  }
  return warnings;
}
function decide(work, board, warnings, inputs) {
  const fingerprint = hash(JSON.stringify({board,inputs,warnings}));
  const approval = read(path.join(work,APPROVAL));
  const approved = warnings.length > 0 && approval?.kind === 'user' && approval.fingerprint === fingerprint &&
    typeof approval.reference === 'string' && approval.reference.trim().length > 0 &&
    Number.isFinite(Date.parse(approval.at));
  const report = {fingerprint,warnings,inputs,approved:Boolean(approved),approval:approved?approval:null,status:warnings.length ? (approved?'approved-with-warnings':'awaiting-user') : 'pass'};
  fs.writeFileSync(path.join(work,REPORT),JSON.stringify(report,null,2)+'\n');
  for(const warning of warnings) console.error('Video assembly warning: '+warning);
  if(warnings.length && !approved) throw new Error('Video checks need HITL: show '+path.join(work,REPORT)+' to the user. After explicit approval, record it with assembly-video-gate.js approve; then rerun assembly.');
  if(approved) console.error('User approved these video warnings; continuing assembly.');
  return report;
}
function check(work, board) {
  work=path.resolve(work);board=path.resolve(board);
  const warnings=[];
  const ref=path.resolve(__dirname,'../../storyboard/references');
  for(const [script,args] of [['check-scenes.js',[]],['check-slide.js',['--require-all']]]) {
    const run=spawnSync(process.execPath,[path.join(ref,script),board,...args],{encoding:'utf8',maxBuffer:16*1024*1024});
    if(run.error || run.signal || run.status === null) throw new Error('Cannot run '+script+': '+(run.error?.message||run.signal));
    if(run.status !== 0) warnings.push(script+':\n'+run.stdout+run.stderr);
  }
  // A checker exception is not a quality verdict: report the execution error directly.
  const production=require('./check-production.js').check(board,{ready:true,manifest:true,workdir:work});
  warnings.push(...production.errors.map(e=>'check-production: '+e));
  // Mode validation may return early; reuse still needs its manifest indices downstream.
  const win={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(board,'scenes.js'),'utf8'),win,{timeout:5000});
  warnings.push(...assemblyWarnings(work,board,win.window.SCENES,win.window.FORMAT));
  production.reusedShots=win.window.SCENES.flatMap((s,i)=>s.visual?.reuse!==undefined?[i]:[]);
  fs.writeFileSync(path.join(work,'production-preflight.json'),JSON.stringify(production,null,2)+'\n');
  return decide(work,board,warnings,snapshot(work,board));
}
function approve(work, reference) {
  work=path.resolve(work);
  if(typeof reference!=='string'||!reference.trim()) throw new Error('An explicit user approval reference is required');
  const report=read(path.join(work,REPORT));
  if(!report?.warnings?.length || !report.fingerprint) throw new Error('Run assembly checks and present the warnings before recording approval');
  // The agent records an actual user answer; this command must never infer consent.
  fs.writeFileSync(path.join(work,APPROVAL),JSON.stringify({kind:'user',fingerprint:report.fingerprint,reference,at:new Date().toISOString()},null,2)+'\n');
}
if(require.main===module) {
  try {
    const [command,work,arg]=process.argv.slice(2);
    if(command==='approve') approve(work,arg);
    else if(command==='check' && work && arg) check(work,arg);
    else throw new Error('usage: assembly-video-gate.js check <workdir> <storyboard> | approve <workdir> <user approval reference>');
  } catch(e) {console.error(e.message);process.exitCode=1;}
}
module.exports={check,decide,snapshot,approve,assemblyWarnings};
