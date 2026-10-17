#!/usr/bin/env node
'use strict';
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const C=require('./location-contract.js');
const digest=v=>crypto.createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const fileHash=p=>digest(fs.readFileSync(p));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function write(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});const t=p+'.'+process.pid+'.tmp';fs.writeFileSync(t,JSON.stringify(v,null,2)+'\n');fs.renameSync(t,p);}
function assert(e){if(e.length)throw new Error(e.join('; '));}
function safe(root,relative){if(typeof relative!=='string'||!relative||path.isAbsolute(relative))throw new Error('relative asset path required'); const p=path.resolve(root,relative);if(!p.startsWith(path.resolve(root)+path.sep))throw new Error('asset escapes root');let ancestor=p;while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);const realRoot=fs.realpathSync(root),realAncestor=fs.realpathSync(ancestor);if(realAncestor!==realRoot&&!realAncestor.startsWith(realRoot+path.sep))throw new Error('asset symlink escapes root');return p;}
function load(manifestPath){
  const m=read(manifestPath);assert(C.validate(m));
  if(!m.assets)throw new Error('location has no built assets');
  for(const k of ['blend','glb']){const a=m.assets[k];if(!a||fileHash(safe(path.dirname(manifestPath),a.path))!==a.sha256)throw new Error('changed location '+k+'; build a new revision');}
  return m;
}
function blender(job){
  const jobFile=path.join(job.output,'job.json');write(jobFile,job);
  const bin=process.env.BLENDER||'/Applications/Blender.app/Contents/MacOS/Blender';
  try{execFileSync(bin,['--background','--python',path.join(__dirname,'location-blender.py'),'--',jobFile],{stdio:['ignore','pipe','pipe'],timeout:600000,maxBuffer:16*1024*1024});}
  catch(e){throw new Error('Blender location job failed: '+String(e.stderr||e.message).slice(-2500));}
  finally{fs.rmSync(jobFile,{force:true});}
}
function build({spec,root}){
  const m=typeof spec==='string'?read(spec):structuredClone(spec);assert(C.validate(m));delete m.assets;
  const dir=path.join(path.resolve(root),m.id,'v'+m.revision);
  if(fs.existsSync(dir))throw new Error('immutable revision already exists: '+dir);
  const tmp=dir+'.building-'+process.pid;fs.mkdirSync(tmp,{recursive:true});
  try{blender({action:'build',manifest:m,output:tmp});m.assets={blend:{path:'source.blend',sha256:fileHash(path.join(tmp,'source.blend'))},glb:{path:'preview.glb',sha256:fileHash(path.join(tmp,'preview.glb'))}};write(path.join(tmp,'location.json'),m);fs.renameSync(tmp,dir);}
  catch(e){fs.rmSync(tmp,{recursive:true,force:true});throw e;}
  return {manifest:path.join(dir,'location.json'),sha256:fileHash(path.join(dir,'location.json'))};
}
function context(win,index,dir){
  const s=win.SCENES?.[index],b=s?.shot?.location;if(!b)return null;
  // A board may reference the channel library outside storyboard/, but the path must be explicit.
  if(typeof b.manifest!=='string'||path.isAbsolute(b.manifest))throw new Error('location manifest must be relative to storyboard');
  const p=path.resolve(dir,b.manifest),m=load(p);assert(C.bindingErrors(b,m));
  if(fileHash(p)!==b.manifestSha256)throw new Error('location manifest changed; bind an explicit revision');
  const camera=b.camera||m.cameras[b.cameraId];
  const ratio=win.FORMAT==='youtube-long-16x9'?16/9:9/16;
  if(win.FORMAT&&Math.abs(camera.width/camera.height-ratio)>.002)throw new Error('location camera aspect differs from episode FORMAT');
  const resolved=C.resolvedObjects(m,b.stateId);
  if(b.mustShow.some(id=>resolved.find(o=>o.id===id)?.visible===false))throw new Error('mustShow landmark hidden by location state');
  return {s,b,m,p,camera};
}
function signature(ctx){return digest({manifest:ctx.b.manifestSha256,state:ctx.b.stateId,camera:ctx.camera,mustShow:ctx.b.mustShow,continuity:ctx.b.continuityGroup||null,cameraDirection:ctx.s.visual?.camera||null,
  ...(ctx.b.blocking!==undefined?{blocking:ctx.b.blocking}:{}),...(ctx.b.endStateId?{endState:ctx.b.endStateId}:{})});}
function plan(win,index,dir,{ready=false}={}){
  const ctx=context(win,index,dir);if(!ctx)return null;
  const fingerprint=signature(ctx), r=ctx.s.visual?.location;
  const fresh=!!r&&r.fingerprint===fingerprint;
  if(ready&&!fresh)throw new Error('location references missing or stale; render this shot');
  if(fresh){for(const a of Object.values(r.frames||{})){if(fileHash(safe(dir,a.path))!==a.sha256)throw new Error('location reference bytes changed');}}
  if(fresh&&r.receipt){if(r.receipt.fingerprint!==fingerprint||fileHash(safe(dir,r.receipt.output.path))!==r.receipt.output.sha256)throw new Error('generated location output is stale or changed');}
  if(ready&&(!r.frames?.start||!r.frames?.end))throw new Error('location start/end references required');
  const previz=ctx.s.visual?.video?.previz;
  if(ready&&previz?.locationBinding){
    if(previz.locationBinding.fingerprint!==fingerprint)throw new Error('location previz is stale; rebuild it from the current set/camera/blocking');
    if(fileHash(safe(dir,previz.firstFrame))!==previz.locationBinding.frameSha256||fileHash(safe(dir,previz.clip))!==previz.sha256)throw new Error('location previz bytes changed; rebuild it');
  }
  const {m,b,camera}=ctx;
  function promptFor(phase){
    const stateId=phase==='end'?(b.endStateId||b.stateId):b.stateId;
    return `Keep exactly the supplied location composition and object inventory. Surface texture polish may not add plants, furniture, art, openings or props. Visible set inventory: ${[...new Set(C.resolvedObjects(m,stateId).filter(o=>o.visible!==false).map(o=>o.label))].join(', ')}. Location ${m.name}, revision ${m.revision}. State: ${m.states[stateId].label}. The location reference controls architecture, fixed objects, materials and their spatial relationships. Preserve: ${m.invariants.join('; ')}. Required landmarks: ${b.mustShow.join(', ')}. ${C.blockingPrompt(b.blocking,phase)}`;
  }
  return {id:m.id,name:m.name,revision:m.revision,manifestSha256:b.manifestSha256,stateId:b.stateId,state:m.states[b.stateId],states:m.states,camera,
    fingerprint,fresh,approved:fresh&&r.approval?.fingerprint===fingerprint&&r.approval?.evidenceSha256===digest({frames:r.frames,renderer:r.renderer||null}),
    invariants:m.invariants,mustShow:b.mustShow,objects:C.resolvedObjects(m,b.stateId),baseObjects:m.objects,blocking:b.blocking||null,
    startActors:C.actorsAt(b.blocking,'start'),endActors:C.actorsAt(b.blocking,'end'),endStateId:b.endStateId||b.stateId,
    resultReview:fresh?r?.receipt?.review||null:null,
    resultImage:fresh?ctx.s.visual?.location?.receipt?.output?.path || null:null,
    glb:path.relative(dir,safe(path.dirname(ctx.p),m.assets.glb.path)),frames:fresh?r.frames:{},
    prompt:promptFor('start'),endPrompt:promptFor('end')};
}
function bind(win,index,dir,{manifest,stateId,endStateId,cameraId,mustShow=[],continuityGroup,continuityBreak,blocking}){
  const p=path.resolve(manifest),m=load(p),s=win.SCENES[index];if(!s)throw new Error('unknown shot');
  const b={id:m.id,revision:m.revision,manifest:path.relative(dir,p),manifestSha256:fileHash(p),stateId,cameraId,mustShow,...(continuityGroup!==undefined?{continuityGroup}:{}),...(endStateId!==undefined?{endStateId}:{}),...(continuityBreak!==undefined?{continuityBreak}:{}),...(blocking!==undefined?{blocking}:{})};assert(C.bindingErrors(b,m));
  const candidate={...win,SCENES:win.SCENES.map((item,i)=>i===index?{...item,shot:{...item.shot,location:b}}:item)};context(candidate,index,dir);
  s.shot={...s.shot,location:b};if(s.visual)delete s.visual.location;return b;
}
function render(win,index,dir){
  const ctx=context(win,index,dir);if(!ctx)throw new Error('bind a location first');
  const fingerprint=signature(ctx),relative='locations/'+ctx.s.id+'-'+fingerprint.slice(0,16)+'-'+crypto.randomBytes(4).toString('hex'),output=safe(dir,relative);
  if(!ctx.s.id||!/^s\d{4,}$/.test(ctx.s.id))throw new Error('stable shot id required');
  const cameras={start:ctx.camera,end:{...ctx.camera,...(ctx.camera.end||{}),end:undefined}};
  // Clean endpoints share one source set and use their authored actor and object states.
  try{blender({...renderJob(ctx),action:'render',cameras,output});}catch(e){fs.rmSync(output,{recursive:true,force:true});throw e;}
  const frames=Object.fromEntries(Object.keys(cameras).map(k=>[k,{path:relative+'/'+k+'.png',sha256:fileHash(path.join(output,k+'.png'))}]));
  ctx.s.visual={...ctx.s.visual,location:{fingerprint,frames,renderer:'blender',renderedAt:new Date().toISOString()}};
  return ctx.s.visual.location;
}
function renderJob(ctx){return {manifest:ctx.m,blend:safe(path.dirname(ctx.p),ctx.m.assets.blend.path),stateId:ctx.b.stateId,endStateId:ctx.b.endStateId||ctx.b.stateId,blocking:ctx.b.blocking||null};}
function previz(win,index,dir,{seconds,fps=24}){
  const ctx=context(win,index,dir);if(!ctx)throw new Error('bind a location first');
  if(win.PRODUCTION?.previz?.renderer&&win.PRODUCTION.previz.renderer!=='blender')throw new Error('location previz uses Blender; keep the saved renderer choice');
  if(!ctx.s.visual?.video||!ctx.s.visual?.camera?.movement)throw new Error('previz needs an existing video plan and camera movement');
  if(!Number.isInteger(fps)||fps<24||fps>60||!Number.isFinite(seconds)||seconds<=0||Math.abs(seconds*fps-Math.round(seconds*fps))>1e-6||seconds*fps>3000)throw new Error('previz needs 24..60 fps and a finite duration of 1..3000 whole frames');
  const video=ctx.s.visual.video,engine=video.engine||ctx.s.visual.engine||'seedance';
  if(engine==='astra'&&video.numFrames!==undefined){if(fps!==(video.frameRate??24)||Math.abs(seconds-video.numFrames/fps)>1e-6)throw new Error('ASTRA previz timing must match numFrames/frameRate');}
  else if(!Number.isInteger(seconds)||seconds<2)throw new Error('previz seconds must be whole and at least 2 on this video route');
  if(ctx.camera.width%2||ctx.camera.height%2)throw new Error('previz needs even H.264 dimensions');
  if(!ctx.s.id||!/^s\d{4,}$/.test(ctx.s.id))throw new Error('stable shot id required');
  const fingerprint=signature(ctx),relative='locations/'+ctx.s.id+'-'+fingerprint.slice(0,16)+'-previz-'+crypto.randomBytes(4).toString('hex'),output=safe(dir,relative);
  try{blender({...renderJob(ctx),action:'previz',camera:ctx.camera,output,fps,frameEnd:Math.round(seconds*fps),fingerprint});}catch(e){fs.rmSync(output,{recursive:true,force:true});throw e;}
  const frames=Object.fromEntries(['start','end'].map(k=>[k,{path:relative+'/'+k+'.png',sha256:fileHash(path.join(output,k+'.png'))}]));
  const record={renderer:'blender',clip:relative+'/previz.mp4',blend:relative+'/previz.blend',firstFrame:frames.start.path,sha256:fileHash(path.join(output,'previz.mp4')),fps,seconds,
    camera:{movement:ctx.s.visual.camera.movement},locationBinding:{fingerprint,frameSha256:frames.start.sha256},
    actors:(ctx.b.blocking?.actors||[]).map(actor=>({color:actor.color,is:win.PRODUCTION?.cast?.[actor.id]?.name||actor.id})),
    handoff:engine==='seedance'&&!/^seedance-1-/.test(video.model||'')?'reference_video':'frame_and_prompt'};
  ctx.s.visual.location={fingerprint,frames,renderer:'blender',renderedAt:new Date().toISOString()};
  ctx.s.visual.video.previz=record;
  return record;
}
function sheet({manifest,stateId,output}){
  const p=path.resolve(manifest),m=load(p);if(!Object.hasOwn(m.states,stateId))throw new Error('unknown state');
  const out=path.resolve(output);if(fs.existsSync(out))throw new Error('sheet output exists; use a new output directory');
  blender({action:'render',manifest:m,blend:safe(path.dirname(p),m.assets.blend.path),stateId,cameras:m.cameras,output:out});
  const result={manifestSha256:fileHash(p),stateId,frames:Object.fromEntries(Object.keys(m.cameras).map(k=>[k,{path:k+'.png',sha256:fileHash(path.join(out,k+'.png'))}]))};write(path.join(out,'sheet.json'),result);return result;
}
function approve(win,index,dir,{reviewer,notes}){
  const p=plan(win,index,dir,{ready:true});if(!p||!reviewer?.trim()||!notes?.trim())throw new Error('actual reviewer and observed notes required');
  win.SCENES[index].visual.location.approval={fingerprint:p.fingerprint,evidenceSha256:digest({frames:win.SCENES[index].visual.location.frames,renderer:win.SCENES[index].visual.location.renderer||null}),reviewer,notes,at:new Date().toISOString()};return win.SCENES[index].visual.location.approval;
}
function references(win,index,dir){
  const p=plan(win,index,dir,{ready:true});if(!p)return null;
  return {...p,paths:[path.resolve(dir,p.frames.start.path)],endPaths:[path.resolve(dir,p.frames.end.path)],roles:['location geometry, camera and authored character blocking; excludes character appearance'],binding:{fingerprint:p.fingerprint,manifestSha256:p.manifestSha256,frameSha256:p.frames.start.sha256}};
}
function applyCamera(win,patch,dir){
  if(patch.version!==1||!['location-camera','location-state'].includes(patch.type))throw new Error('unknown location patch');
  const candidate=structuredClone(win);
  const i=win.SCENES.findIndex(s=>s.id===patch.shotId);if(i<0)throw new Error('unknown shot id');
  const p=plan(win,i,dir);if(!p||p.fingerprint!==patch.baseFingerprint)throw new Error('camera patch is stale');
  if(patch.type==='location-state'){if(!Object.hasOwn(p.states,patch.stateId))throw new Error('unknown state');candidate.SCENES[i].shot.location.stateId=patch.stateId;context(candidate,i,dir);win.SCENES[i]=candidate.SCENES[i];return {shotId:patch.shotId,status:'references-stale',regenerate:true};}
  assert(C.cameraErrors(patch.camera));
  candidate.SCENES[i].shot.location.camera=patch.camera;
  candidate.SCENES[i].visual.camera={...candidate.SCENES[i].visual.camera,framing:`Location camera ${patch.camera.lensMm}mm from ${patch.camera.position.join(',')} toward ${patch.camera.target.join(',')}`};
  context(candidate,i,dir);win.SCENES[i]=candidate.SCENES[i];
  // Keep prior evidence available, but plan() reports it stale and generation refuses it.
  return {shotId:patch.shotId,status:'references-stale',regenerate:true};
}

function receipt(win,index,dir,args){
  const p=references(win,index,dir);if(!p)throw new Error('bind location first');
  if(!['host','api','blender'].includes(args.provider)||!args.callId?.trim())throw new Error('provider and actual callId required');
  const sent=args.referencePaths;if(!Array.isArray(sent)||!p.paths.every(v=>sent.some(x=>path.resolve(x)===v)))throw new Error('receipt must include the actual sent location reference');
  const output=path.resolve(args.output);if(!output.startsWith(path.resolve(dir)+path.sep))throw new Error('copy output inside storyboard first');
  const result={provider:args.provider,callId:args.callId,fingerprint:p.fingerprint,referenceInputs:sent.map(v=>({path:path.relative(dir,path.resolve(v)),sha256:fileHash(path.resolve(v))})),output:{path:path.relative(dir,output),sha256:fileHash(output)},at:new Date().toISOString()};
  win.SCENES[index].visual.location.receipt=result;return result;
}

function reviewResult(win,index,dir,args){
  const p=plan(win,index,dir,{ready:true}),r=win.SCENES[index].visual.location.receipt;
  if(!r||!['pass','warning','fail'].includes(args.verdict)||!args.reviewer?.trim()||!args.notes?.trim())throw new Error('actual receipt, reviewer, verdict and observed notes required');
  r.review={verdict:args.verdict,reviewer:args.reviewer,notes:args.notes,outputSha256:r.output.sha256,fingerprint:p.fingerprint,at:new Date().toISOString()};return r.review;
}
function check(win,dir,{ready=false}={}){
  const findings=[],groups=new Map();for(let i=0;i<(win.SCENES||[]).length;i++){if(!win.SCENES[i].shot?.location)continue;try{const p=plan(win,i,dir,{ready});if(ready&&!p.approved)findings.push({level:'warn',where:'shot '+(i+1)+' location',what:'location reference review missing or stale'});
      const ctx=context(win,i,dir),group=ctx.b.continuityGroup;
      if(group){const previous=groups.get(group);if(previous)for(const what of C.continuityIssues(previous,ctx))findings.push({level:'warn',where:'shot '+(i+1)+' location',what});groups.set(group,ctx);}
      const previz=ctx.s.visual?.video?.previz;
      if(previz?.locationBinding&&previz.locationBinding.fingerprint!==p.fingerprint)findings.push({level:'warn',where:'shot '+(i+1)+' location',what:'location previz is stale; rebuild it from the current set/camera/blocking'});
      if(previz&&!previz.locationBinding)findings.push({level:'warn',where:'shot '+(i+1)+' location',what:'standalone previz has no shared location binding; compare it with the location reference or rebuild with location previz'});
      const scene=win.SCENES[i],receipt=scene.visual?.location?.receipt;
      if(ready&&scene.visual?.bg){
        if(!receipt||path.resolve(dir,receipt.output.path)!==path.resolve(dir,scene.visual.bg))throw new Error('generated source needs a receipt for current location inputs');
        if(!receipt.review||receipt.review.outputSha256!==receipt.output.sha256||receipt.review.fingerprint!==p.fingerprint)findings.push({level:'warn',where:'shot '+(i+1)+' location',what:'generated source location review missing or stale'});
        else if(receipt.review.verdict!=='pass')findings.push({level:'warn',where:'shot '+(i+1)+' location',what:'generated source location review: '+receipt.review.verdict});
      }}catch(e){findings.push({level:'bad',where:'shot '+(i+1)+' location',what:e.message});}}
  return findings;
}
function preview(win,dir){return (win.SCENES||[]).flatMap((s,i)=>{if(!s.shot?.location)return [];try{return [{shotId:s.id,title:s.title||s.id,...plan(win,i,dir)}];}catch(e){return [{shotId:s.id,title:s.title||s.id,error:e.message}];}});}
function readBoard(p){const {readScenes}=require('../../autoproduce/references/cost-preview.js');return readScenes(p);}
function saveBoard(p,win){const content=Object.entries(win).filter(([k])=>/^[A-Z][A-Z0-9_]*$/.test(k)).map(([k,v])=>'window.'+k+' = '+JSON.stringify(v,null,2)+';').join('\n');const tmp=p+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,content+'\n');fs.renameSync(tmp,p);}
async function run(args){
  const {action}=args;
  if(action==='build')return build(args);
  if(action==='sheet')return sheet(args);
  if(action==='read')return load(args.manifest);
  const p=path.resolve(args.board),dir=path.dirname(p),win=readBoard(p),index=win.SCENES.findIndex(s=>s.id===args.shotId);
  if(['bind','render','previz','approve','references','receipt','review'].includes(action)&&index<0)throw new Error('unknown shot id');
  let result;
  if(action==='bind')result=bind(win,index,dir,args);
  else if(action==='render')result=render(win,index,dir);
  else if(action==='previz')result=previz(win,index,dir,args);
  else if(action==='approve')result=approve(win,index,dir,args);
  else if(action==='review')result=reviewResult(win,index,dir,args);
  else if(action==='receipt')result=receipt(win,index,dir,args);
  else if(action==='references')return references(win,index,dir);
  else if(action==='check')return check(win,dir,{ready:args.ready});
  else if(action==='camera')result=applyCamera(win,typeof args.patch==='string'?read(args.patch):args.patch,dir);
  else throw new Error('unknown location action');
  saveBoard(p,win);return result;
}
module.exports={digest,fileHash,load,build,sheet,context,signature,plan,bind,render,previz,renderJob,approve,references,receipt,reviewResult,applyCamera,check,preview,run,saveBoard};
if(require.main===module)run(read(process.argv[2])).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
