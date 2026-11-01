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
// What the set render holds, for the image prompt: inventory, state, invariants, landmarks and which proxy is whom.
// english keeps out any name in another script, which an image model may letter into the picture.
const foreign=v=>/(?!\p{Script=Latin})\p{L}/u.test(v);
function locationPrompt(m,b,phase,english=false){
  const stateId=phase==='end'?(b.endStateId||b.stateId):b.stateId,keep=v=>!english||!foreign(v);
  const inventory=[...new Set(C.resolvedObjects(m,stateId).filter(o=>o.visible!==false).map(o=>o.label))].filter(keep),invariants=m.invariants.filter(keep),state=m.states[stateId].label;
  return ['Keep exactly the supplied location composition and object inventory. Surface texture polish may not add plants, furniture, art, openings or props.',
    inventory.length?`Visible set inventory: ${inventory.join(', ')}.`:'',`Location ${keep(m.name)?m.name:m.id}, revision ${m.revision}.`,keep(state)?`State: ${state}.`:'',
    'The location reference controls architecture, fixed objects, materials and their spatial relationships.',invariants.length?`Preserve: ${invariants.join('; ')}.`:'',
    b.mustShow?.length?`Required landmarks: ${b.mustShow.join(', ')}.`:'',C.blockingPrompt(b.blocking,phase)].filter(Boolean).join(' ');
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
  let spatial=null;
  if(fresh&&r.spatial){
    const reportPath=safe(dir,r.spatial.path);
    if(fileHash(reportPath)!==r.spatial.sha256)throw new Error('location spatial bytes changed');
    spatial=read(reportPath);
    if(spatial.fingerprint!==fingerprint)throw new Error('location spatial report is stale');
  }
  const {m,b,camera}=ctx;
  const promptFor=phase=>locationPrompt(m,b,phase);
  return {id:m.id,name:m.name,revision:m.revision,manifestSha256:b.manifestSha256,stateId:b.stateId,state:m.states[b.stateId],states:m.states,camera,
    spatial,spatialAsset:fresh?r.spatial||null:null,
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
  // Auxiliary views keep endpoint poses and use the same immutable set.
  const points=ctx.m.objects.flatMap(o=>[o.position.map((v,i)=>v-o.size[i]/2),o.position.map((v,i)=>v+o.size[i]/2)]);
  for(const a of ctx.b.blocking?.actors||[])for(const p of [a.start,a.end||a.start])points.push(p.position,p.position.map((v,i)=>v+(i===2?a.height:0)));
  const lo=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),hi=[0,1,2].map(i=>Math.max(...points.map(p=>p[i])));
  const target=lo.map((v,i)=>(v+hi[i])/2),distance=Math.hypot(...hi.map((v,i)=>v-lo[i]))*2+1;
  for(const phase of ['start','end']){
    const base={...cameras[phase],end:undefined,lensMm:35};
    cameras[phase+'-top']={...base,target,position:[target[0],target[1]-.001,target[2]+distance]};
    cameras[phase+'-side']={...base,target,position:[target[0]+distance,target[1],target[2]]};
  }
  // Clean endpoints share one source set and use their authored actor and object states.
  try{blender({...renderJob(ctx),action:'render',cameras,output,fingerprint});}catch(e){fs.rmSync(output,{recursive:true,force:true});throw e;}
  const frames=Object.fromEntries(Object.keys(cameras).map(k=>[k,{path:relative+'/'+k+'.png',sha256:fileHash(path.join(output,k+'.png'))}]));
  ctx.s.visual={...ctx.s.visual,location:{fingerprint,frames,spatial:{path:relative+'/spatial.json',sha256:fileHash(path.join(output,'spatial.json'))},renderer:'blender',renderedAt:new Date().toISOString()}};
  const blend=renderJob(ctx).blend, image=path.join(output,'start.png'), receiptPath=path.join(output,'composition.json');
  write(receiptPath,{renderer:'blender',shotId:ctx.s.id,fingerprint,
    blend:{path:blend,sha256:fileHash(blend)},image:{path:image,sha256:fileHash(image)}});
  ctx.s.visual.location.compositionReceipt=receiptPath;
  return ctx.s.visual.location;
}
function renderJob(ctx){return {manifest:ctx.m,blend:safe(path.dirname(ctx.p),ctx.m.assets.blend.path),stateId:ctx.b.stateId,endStateId:ctx.b.endStateId||ctx.b.stateId,blocking:ctx.b.blocking||null};}
function previz(win,index,dir,{seconds,fps=24}){
  const ctx=context(win,index,dir);if(!ctx)throw new Error('bind a location first');
  if(win.PRODUCTION?.previz?.renderer&&win.PRODUCTION.previz.renderer!=='blender')throw new Error('location previz renders with Blender; with a three.js renderer plan the shared set with the previz template or stills');
  if(!ctx.s.visual?.video||!ctx.s.visual?.camera?.movement)throw new Error('previz needs an existing video plan and camera movement');
  if(!Number.isInteger(fps)||fps<24||fps>60||!Number.isFinite(seconds)||seconds<=0||Math.abs(seconds*fps-Math.round(seconds*fps))>1e-6||seconds*fps>3000)throw new Error('previz needs 24..60 fps and a finite duration of 1..3000 whole frames');
  const prior=plan(win,index,dir);
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
    handoff:engine==='seedance'?'reference_video':'frame_and_prompt'};
  ctx.s.visual.location={fingerprint,frames:{...(prior.fresh?prior.frames:{}),...frames},...(prior.spatialAsset?{spatial:prior.spatialAsset}:{}),renderer:'blender',renderedAt:new Date().toISOString()};
  ctx.s.visual.video.previz=record;
  return record;
}
// Compass views from eight directions plus a plan view, aimed at the set's standing objects.
function angleCameras(m){
  const {width=768,height=432}=Object.values(m.cameras)[0]||{};
  // ponytail: flat pieces (ground planes, rugs) stay out of the bounds so an 18x20 m ground does not push every camera 30 m out; add an explicit framing box if a set needs one.
  const standing=m.objects.filter(o=>o.size[2]>=0.3),points=(standing.length?standing:m.objects).flatMap(o=>[o.position.map((v,i)=>v-o.size[i]/2),o.position.map((v,i)=>v+o.size[i]/2)]);
  const lo=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),hi=[0,1,2].map(i=>Math.max(...points.map(p=>p[i])));
  const target=lo.map((v,i)=>(v+hi[i])/2),d=Math.hypot(...hi.map((v,i)=>v-lo[i]))*1.3+1;
  const cameras={};
  for(const [k,x,y] of [['n',0,1],['ne',1,1],['e',1,0],['se',1,-1],['s',0,-1],['sw',-1,-1],['w',-1,0],['nw',-1,1]]){
    const n=Math.hypot(x,y);cameras['orbit-'+k]={position:[target[0]+x/n*d*.9,target[1]+y/n*d*.9,target[2]+d*.45],target,lensMm:24,width,height};
  }
  cameras.top={position:[target[0],target[1]-.001,target[2]+d*1.2],target,lensMm:24,width,height};
  return cameras;
}
// Without output the renders are the set's managed angle sheet: <revision>/angles/<stateId>/, replaced on each call.
// Added angles (e.g. exported from the 3D viewer) persist across calls; null removes one.
function sheet({manifest,stateId,output,cameras={}}){
  const p=path.resolve(manifest),m=load(p);if(!Object.hasOwn(m.states,stateId))throw new Error('unknown state');
  const managed=output===undefined,out=managed?path.join(path.dirname(p),'angles',stateId):path.resolve(output);
  if(!managed&&fs.existsSync(out))throw new Error('sheet output exists; use a new output directory');
  const standard=angleCameras(m),added={...(managed&&fs.existsSync(path.join(out,'sheet.json'))?read(path.join(out,'sheet.json')).added:null)};
  for(const [k,c] of Object.entries(cameras||{})){
    if(!/^[a-z0-9][a-z0-9_-]{0,54}$/i.test(k)||Object.hasOwn(m.cameras,k)||Object.hasOwn(standard,k))throw new Error('camera id must be new and safe: '+k);
    if(c===null){delete added[k];continue;}
    assert(C.cameraErrors(c).map(e=>k+': '+e));added[k]={position:c.position,target:c.target,lensMm:c.lensMm,width:c.width,height:c.height};
  }
  const all={...m.cameras,...standard,...added},tmp=out+'.rendering-'+process.pid;
  fs.rmSync(tmp,{recursive:true,force:true});
  try{blender({action:'render',manifest:m,blend:safe(path.dirname(p),m.assets.blend.path),stateId,cameras:all,output:tmp});}catch(e){fs.rmSync(tmp,{recursive:true,force:true});throw e;}
  const result={manifestSha256:fileHash(p),stateId,added,frames:Object.fromEntries(Object.keys(all).map(k=>[k,{path:k+'.png',sha256:fileHash(path.join(tmp,k+'.png')),camera:all[k]}]))};
  write(path.join(tmp,'sheet.json'),result);fs.rmSync(out,{recursive:true,force:true});fs.renameSync(tmp,out);
  return {output:out,...result};
}
// A shot size as a person's visible span [bottom, top] in fractions of their height, after the crop lines in
// film-techniques.js (fs head to toe, mfs mid-thigh, ms waist up, mcu mid-chest, cu face and shoulder tops), and its lens on the 36 mm sensor.
const PERSON_SPAN={els:[-4.5,5.5],ls:[-.7,1.7],ws:[-.7,1.7],fs:[-.06,1.08],mfs:[.4,1.07],ms:[.55,1.06],mcu:[.7,1.04],cu:[.8,1.01],choker:[.86,.99],ecu:[.905,.955]};
const SIZE_LENS={els:24,ls:24,ws:24,fs:28,mfs:35,ms:35,mcu:50,cu:65,choker:85,ecu:100};
// With nobody blocked the frame holds this much of the standing set (or of the required landmark).
const SET_SCALE={els:1.5,ls:1.15,ws:1.15,fs:1,mfs:.8,ms:.65,mcu:.5,cu:.4,choker:.3,ecu:.2};
// Composition sizes have no crop of their own (assemble-bg-prompt.js SIZE_WORDS); each borrows a distance.
const COMPOSED={two:'mfs',three:'fs',ots:'mcu',pov:'ms',back:'ms',reaction:'cu',cutaway:'ls',insert:'ecu'};
const PITCH={high:35,low:-25};
function boundsOf(objects){
  const points=objects.flatMap(o=>[o.position.map((v,i)=>v-o.size[i]/2),o.position.map((v,i)=>v+o.size[i]/2)]);
  return [0,1,2].map(i=>[Math.min(...points.map(p=>p[i])),Math.max(...points.map(p=>p[i]))]);
}
const inBox=(p,o)=>p.every((v,i)=>Math.abs(v-o.position[i])<o.size[i]/2);
// Where the segment p→q enters a box, as a fraction of its length (slab test, rotation ignored), or null when it misses.
function entersBox(p,q,o){
  let t0=0,t1=1;
  for(let i=0;i<3;i++){
    const lo=o.position[i]-o.size[i]/2,hi=o.position[i]+o.size[i]/2,dv=q[i]-p[i];
    if(Math.abs(dv)<1e-9){if(p[i]<lo||p[i]>hi)return null;continue;}
    let a=(lo-p[i])/dv,b=(hi-p[i])/dv;if(a>b)[a,b]=[b,a];t0=Math.max(t0,a);t1=Math.min(t1,b);if(t0>t1)return null;
  }
  return t0;
}
// Does the segment p→q pass through a person's upright 0.4 m cylinder (body and arms)?
function hitsBody(p,q,x){
  const dx=q[0]-p[0],dy=q[1]-p[1],len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((x.position[0]-p[0])*dx+(x.position[1]-p[1])*dy)/len)):0;
  const z=p[2]+(q[2]-p[2])*t;
  return Math.hypot(p[0]+dx*t-x.position[0],p[1]+dy*t-x.position[1])<.4&&z>=x.position[2]&&z<=x.position[2]+x.height;
}
/**
 * The camera a shot's size and angle ask for in this set: aimed at the shot's blocked cast (or the set when
 * nobody is blocked), from the side the reference camera stands on, distance fitted to the lens's field of view.
 */
function shotCamera(m,{stateId,actors=[],cast=[],size,angle,width,height,side,mustShow=[]}){
  const warnings=[],deg=Math.PI/180,r3=v=>v.map(x=>Math.round(x*1000)/1000);
  const unit=v=>{const n=Math.hypot(...v);return n>1e-9?v.map(x=>x/n):null;},dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
  // Zero body rotation faces -Y; +90 degrees faces +X (location-assets.md).
  const facing=a=>[Math.sin(a.rotationZDeg*deg),-Math.cos(a.rotationZDeg*deg)];
  const frame=PERSON_SPAN[size]?size:COMPOSED[size]||'ms';
  if(!PERSON_SPAN[size]&&!COMPOSED[size])warnings.push(`size ${size||'(none)'} names no crop, so the set render frames a medium shot`);
  const sensorV=36*height/width,objects=C.resolvedObjects(m,stateId).filter(o=>o.visible!==false);
  const people=cast.map(id=>actors.find(a=>a.id===id)).filter(Boolean),unblocked=cast.filter(id=>!actors.some(a=>a.id===id));
  // The floor is where the people stand, else the lowest top surface (a floor slab's top, not its underside).
  const floor=people.length?Math.min(...people.map(x=>x.position[2])):Math.min(...objects.map(o=>o.position[2]+o.size[2]/2));
  if(unblocked.length)warnings.push(`${unblocked.join(' and ')} ${unblocked.length>1?'are':'is'} not blocked in the ${m.id} set: the render is framed on the set and the prompt places them — bind the shot's blocking with location_manage for exact places`);
  const ref=side||Object.values(m.cameras)[0],a=angle||'eye';
  let lensMm=SIZE_LENS[frame],target,span,spread=0,u,eye,position;
  const fit=(dist,height,width=0)=>Math.max(12,Math.min(135,(sensorV/2)*dist/(height/2),width?18*dist/(width/2):Infinity));
  const viewer=size==='pov'?actors.find(x=>!cast.includes(x.id)&&x.gazeTarget&&(cast.includes(x.gazeTarget)||!cast.length))||people[1]:null;
  if(size==='pov'&&!viewer)warnings.push('pov needs a blocked viewer whose gaze names the seen character or object; the render frames the shot from the front');
  if(viewer){
    // Point of view: the lens sits just in front of the viewer's eyes and looks where they look.
    const seen=actors.find(x=>x.id===viewer.gazeTarget),object=objects.find(o=>o.id===viewer.gazeTarget);
    const from=[viewer.position[0],viewer.position[1],viewer.position[2]+viewer.height*.93];
    target=seen?[seen.position[0],seen.position[1],seen.position[2]+seen.height*.93]:object?object.position:[from[0]+facing(viewer)[0]*3,from[1]+facing(viewer)[1]*3,from[2]];
    const dir=unit(target.map((v,i)=>v-from[i]))||[0,-1,0];
    position=from.map((v,i)=>v+dir[i]*.3);lensMm=35;
  } else if((size==='ots'||a==='over')&&people.length>=2){
    // Over the shoulder: past the second listed person's shoulder onto the first, on the reference camera's side of their line.
    const [far,near]=people,dir=unit([far.position[0]-near.position[0],far.position[1]-near.position[1]])||[0,1];
    let lateral=[-dir[1],dir[0]];
    if(dot(lateral,[ref.position[0]-near.position[0],ref.position[1]-near.position[1]])<0)lateral=lateral.map(v=>-v);
    position=[near.position[0]-dir[0]*.55+lateral[0]*.32,near.position[1]-dir[1]*.55+lateral[1]*.32,near.position[2]+near.height*.95];
    const [lo,hi]=PERSON_SPAN[frame];
    target=[far.position[0],far.position[1],far.position[2]+(lo+hi)/2*far.height];
    lensMm=fit(Math.hypot(...position.map((v,i)=>v-target[i])),(hi-lo)*far.height*1.25);
  } else {
    if(size==='ots'||a==='over')warnings.push('over the shoulder needs two blocked people; the render frames the first from the front');
    if(people.length&&size!=='insert'&&size!=='cutaway'){
      const [lo,hi]=PERSON_SPAN[frame],bottom=Math.min(...people.map(x=>x.position[2]+lo*x.height)),top=Math.max(...people.map(x=>x.position[2]+hi*x.height));
      const centre=[0,1].map(i=>people.reduce((s,x)=>s+x.position[i],0)/people.length);
      target=[centre[0],centre[1],(bottom+top)/2];span=top-bottom;eye=Math.max(...people.map(x=>x.position[2]+x.height*.93));
      if(people.length===1)u=facing(people[0]);
      else{
        // Two or more: square to their line, on the side their faces turn to, or — facing each other — the reference camera's side (180° rule).
        const axis=[people[1].position[0]-people[0].position[0],people[1].position[1]-people[0].position[1]];
        const sum=people.reduce((s,x)=>{const f=facing(x);return [s[0]+f[0],s[1]+f[1]];},[0,0]);
        u=unit([-axis[1],axis[0]])||[0,-1];
        if(dot(u,Math.hypot(...sum)>.5?sum:[ref.position[0]-centre[0],ref.position[1]-centre[1]])<0)u=u.map(v=>-v);
        const lateral=[-u[1],u[0]],across=people.map(x=>dot(lateral,x.position));
        spread=Math.max(...across)-Math.min(...across)+1;   // half a metre beyond each centre holds the shoulders and arms
      }
      if(size==='back')u=u.map(v=>-v);
    } else {
      // Nobody blocked, an insert or a cutaway: frame the required landmarks, or the standing set without its walls.
      if(size==='insert'&&!mustShow.length)warnings.push('insert names no object: bind the shot with mustShow so the render closes on it');
      const named=objects.filter(o=>mustShow.includes(o.id)),standing=objects.filter(o=>o.size[2]>=.3&&o.role!=='wall');
      const box=boundsOf(named.length?named:standing.length?standing:objects),scale=size==='insert'&&named.length?1.3:SET_SCALE[frame];
      target=box.map(([lo,hi])=>(lo+hi)/2);
      u=unit([ref.position[0]-target[0],ref.position[1]-target[1]])||[0,-1];
      const lateral=[-u[1],u[0]],extent=box.map(([lo,hi])=>hi-lo);
      span=extent[2]*scale;spread=(Math.abs(lateral[0])*extent[0]+Math.abs(lateral[1])*extent[1])*scale;eye=floor+1.6;
    }
    const d=Math.max(span/2/((sensorV/2)/lensMm),spread/2/(18/lensMm),.35);
    if(a==='dutch')warnings.push('dutch: the renderer has no camera roll, so the set render stays level and the prompt tilts the horizon');
    else if(!['eye','over','pov','high','low','ground','overhead'].includes(a))warnings.push(`angle ${a} has no camera height, so the set render stays at eye level`);
    const walls=objects.filter(o=>o.role==='wall');
    // One camera on direction v: the angle's height and pitch. A wall between it and the subject brings it in,
    // at the same height, 0.25 m short of the wall, and the lens widens to keep the framing.
    const place=v=>{
      const at=(dist,z)=>[target[0]+v[0]*dist,target[1]+v[1]*dist,z];
      let p=a==='overhead'?[target[0]+v[0]*.001,target[1]+v[1]*.001,target[2]+d]:PITCH[a]?at(d*Math.cos(PITCH[a]*deg),Math.max(floor+.3,target[2]+d*Math.sin(PITCH[a]*deg))):a==='ground'?at(d,floor+.15):at(d,eye),lens=lensMm;
      const hits=walls.map(w=>inBox(target,w)?null:entersBox(target,p,w)).filter(t=>t!==null);
      if(hits.length){
        const len=Math.hypot(...p.map((x,i)=>x-target[i])),t=Math.max(.35/len,Math.min(...hits)-.25/len);
        p=[target[0]+(p[0]-target[0])*t,target[1]+(p[1]-target[1])*t,p[2]];lens=Math.min(lens,fit(Math.hypot(...p.map((x,i)=>x-target[i])),span,spread));
      }
      return {p,lens,v};
    };
    let best=place(u);
    if(people.length&&size!=='insert'&&size!=='cutaway'){
      // Someone off the shot or a standing object between the lens and a framed face: swing round the subject, the reference camera's side first.
      // Each framed person is checked at their face and two lower heights the size keeps in frame, across their width.
      const [lo]=PERSON_SPAN[frame],base=Math.max(lo,0),others=actors.filter(x=>!people.includes(x)),solids=objects.filter(o=>o.size[2]>=.3&&o.role!=='wall');
      const marks=p=>people.flatMap(x=>{const side=unit([-(p[1]-x.position[1]),p[0]-x.position[0]])||[1,0];
        return [.93,base+(.93-base)*.6,base+(.93-base)*.2].flatMap(k=>[-.25,0,.25].map(w=>[x.position[0]+side[0]*w,x.position[1]+side[1]*w,x.position[2]+x.height*k]));});
      const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot3=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
      // Someone off the shot who stands nearer than the subject and inside the frame fills its foreground.
      const fills=(p,lens)=>{
        const f=unit(sub(target,p)),r=unit([f[1],-f[0],0])||[1,0,0],up=[r[1]*f[2]-r[2]*f[1],r[2]*f[0]-r[0]*f[2],r[0]*f[1]-r[1]*f[0]],near=dot3(sub(target,p),f);
        return others.filter(x=>{const v=sub([x.position[0],x.position[1],x.position[2]+x.height*.6],p),z=dot3(v,f);
          // A sliver of a shoulder at the edge is fine; a body reaching a tenth into the frame is not.
          return z>0&&z<near&&Math.abs(dot3(v,r)/z/(18/lens))-.4/z/(18/lens)<.9&&Math.abs(dot3(v,up)/z/((sensorV/2)/lens))<1.3;}).length;
      };
      const hidden=p=>solids.some(o=>inBox(p,o))?Infinity:marks(p).filter(q=>others.some(x=>hitsBody(p,q,x))||solids.some(o=>!inBox(q,o)&&entersBox(p,q,o)!==null)).length;
      const toward=Math.sign(u[0]*(ref.position[1]-target[1])-u[1]*(ref.position[0]-target[0]))||1;
      // Turns stay within 80° so the framed faces still turn toward the lens.
      const tried=[0,20,40,60,80].flatMap(t=>t?[t*toward,-t*toward]:[0]).map(t=>{const c=Math.cos(t*deg),s=Math.sin(t*deg),x=place([u[0]*c-u[1]*s,u[0]*s+u[1]*c]);
        const n=hidden(x.p);return {t,...x,n,score:n*10+fills(x.p,x.lens)};});
      // The first clean side, else the least blocked one.
      const clear=tried.reduce((m,x)=>x.score<m.score?x:m);
      if(clear.n)warnings.push(`something stands between the camera and the subject from every side tried; the render keeps the least blocked view (${clear.n} of ${marks(clear.p).length} body points hidden)`);
      if(clear.t)warnings.push(`the camera turned ${Math.abs(clear.t)}° round the subject so ${others.length?others.map(x=>x.id).join(' or ')+' or ':''}the set does not block or crowd the view`);
      best=clear;
    }
    if(best.lens<lensMm-.05)warnings.push(`the walls hold the camera ${Math.hypot(...best.p.map((x,i)=>x-target[i])).toFixed(1)} m from the subject, so the lens widens from ${lensMm} to ${best.lens.toFixed(0)} mm`);
    position=best.p;lensMm=best.lens;
  }
  return {camera:{position:r3(position),target:r3(target),lensMm:Math.round(lensMm*10)/10,width,height},warnings};
}
/**
 * The set seen from the shot's own camera (shotCamera), rendered once per input fingerprint into
 * locations/<shot>-frame-<fingerprint>/ with start and end poses: the start image's composition source.
 */
function shotFrame(win,index,dir,{manifest,cast=[],size,angle,width,height}){
  if(typeof manifest!=='string'||path.isAbsolute(manifest))throw new Error('location manifest must be relative to storyboard');
  const p=path.resolve(dir,manifest),m=load(p),s=win.SCENES?.[index];
  if(!s?.id||!/^s\d{4,}$/.test(s.id))throw new Error('stable shot id required');
  const warnings=[],b=s.shot?.location,bound=b&&b.id===m.id&&b.revision===m.revision?b:null;
  if(b&&!bound)warnings.push(`the shot is bound to ${b.id} v${b.revision}, not the sheet's ${m.id} v${m.revision}, so its blocking stays out of the render`);
  const stateId=bound?.stateId||Object.keys(m.states)[0],endStateId=bound?.endStateId||stateId,blocking=bound?.blocking||null;
  if(!bound&&Object.keys(m.states).length>1)warnings.push(`the render shows the set's first state (${m.states[stateId].label}); bind the shot with location_manage to choose another`);
  // The render keeps the picture's aspect, at most 1280 px on the long side, in even pixels.
  const k=Math.min(1,1280/Math.max(width,height)),w=2*Math.round(width*k/2),h=2*Math.round(height*k/2);
  const shot=shotCamera(m,{stateId,actors:C.actorsAt(blocking,'start'),cast,size,angle,width:w,height:h,side:bound?(bound.camera||m.cameras[bound.cameraId]):undefined,mustShow:bound?.mustShow||[]});
  const manifestSha256=fileHash(p),fingerprint=digest({manifestSha256,stateId,endStateId,blocking,camera:shot.camera});
  const relative='locations/'+s.id+'-frame-'+fingerprint.slice(0,16),output=safe(dir,relative);
  if(!['start','end'].every(n=>fs.existsSync(path.join(output,n+'.png')))){
    const tmp=output+'.rendering-'+process.pid;fs.rmSync(tmp,{recursive:true,force:true});
    try{blender({action:'render',manifest:m,blend:safe(path.dirname(p),m.assets.blend.path),stateId,endStateId,blocking,cameras:{start:shot.camera,end:shot.camera},output:tmp,fingerprint});}
    catch(e){fs.rmSync(tmp,{recursive:true,force:true});throw new Error('location_render_failed: '+e.message);}
    fs.rmSync(output,{recursive:true,force:true});fs.renameSync(tmp,output);
  }
  const frame=n=>({path:relative+'/'+n+'.png',sha256:fileHash(path.join(output,n+'.png'))}),scope={stateId,endStateId,mustShow:bound?.mustShow||[],blocking};
  const unsaid=[[m.name,'name'],[m.states[stateId].label,'state label'],[m.states[endStateId].label,'end state label']].filter(([v])=>foreign(v)).map(([,k])=>k)
    .concat(C.resolvedObjects(m,stateId).some(o=>foreign(o.label))?['object labels']:[],m.invariants.some(foreign)?['invariants']:[]);
  if(unsaid.length)warnings.push(`the ${m.id} set's ${[...new Set(unsaid)].join(', ')} are not in English and stay out of the image prompt (the render still shows the set) — write them in English in the set spec`);
  return {id:m.id,name:foreign(m.name)?m.id:m.name,revision:m.revision,manifest:path.relative(dir,p),manifestSha256,stateId,endStateId,camera:shot.camera,blocked:!!blocking,fingerprint,
    start:frame('start'),end:frame('end'),prompt:locationPrompt(m,scope,'start',true),endPrompt:locationPrompt(m,scope,'end',true),warnings:[...warnings,...shot.warnings]};
}
function approve(win,index,dir,{reviewer,notes}){
  const p=plan(win,index,dir,{ready:true});if(!p||!reviewer?.trim()||!notes?.trim())throw new Error('actual reviewer and observed notes required');
  win.SCENES[index].visual.location.approval={fingerprint:p.fingerprint,evidenceSha256:digest({frames:win.SCENES[index].visual.location.frames,renderer:win.SCENES[index].visual.location.renderer||null}),reviewer,notes,at:new Date().toISOString()};return win.SCENES[index].visual.location.approval;
}
function references(win,index,dir){
  const p=plan(win,index,dir,{ready:true});if(!p)return null;
  return {...p,spatialPaths:p.spatial?Object.values(p.frames).map(f=>path.resolve(dir,f.path)):[],paths:[path.resolve(dir,p.frames.start.path)],endPaths:[path.resolve(dir,p.frames.end.path)],roles:['location geometry, camera and authored character blocking; excludes character appearance'],binding:{fingerprint:p.fingerprint,manifestSha256:p.manifestSha256,frameSha256:p.frames.start.sha256}};
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
// A sheet entry opens the whole Blender set without a shot binding: first state, registered cameras, no blocking.
function sheetView(manifestPath){
  const p=path.resolve(manifestPath);
  try{const m=load(p),stateId=Object.keys(m.states)[0],cameraId=Object.keys(m.cameras)[0];
    return {sheet:true,shotId:'sheet-'+m.id,title:m.name,id:m.id,name:m.name,revision:m.revision,stateId,endStateId:stateId,state:m.states[stateId],states:m.states,
      cameras:m.cameras,camera:{...m.cameras[cameraId],end:undefined},invariants:m.invariants,objects:C.resolvedObjects(m,stateId),baseObjects:m.objects,
      blocking:null,startActors:[],endActors:[],frames:angleFrames(p,m),spatial:null,spatialAsset:null,resultImage:null,resultReview:null,fresh:false,approved:false,
      glb:safe(path.dirname(p),m.assets.glb.path)};}
  catch(e){const id=path.basename(path.dirname(path.dirname(p)));return {sheet:true,shotId:'sheet-'+id,id,title:id,error:e.message};}
}
// The managed angle renders of this revision, keyed "<camera> · <state label>"; paths are absolute like glb.
function angleFrames(p,m){
  const frames={},sha=fileHash(p);
  for(const [stateId,state] of Object.entries(m.states)){
    const dir=path.join(path.dirname(p),'angles',stateId),file=path.join(dir,'sheet.json');
    if(!fs.existsSync(file))continue;const s=read(file);if(s.manifestSha256!==sha)continue;
    for(const [k,f] of Object.entries(s.frames||{}))frames[k+' · '+state.label]={path:safe(dir,f.path),sha256:f.sha256,camera:k,stateId};
  }
  return frames;
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
function detailFilename(topic,id){return digest([topic,id]).slice(0,24)+'.html';}
module.exports={detailFilename,angleCameras,shotCamera,shotFrame,locationPrompt,digest,fileHash,load,build,sheet,sheetView,context,signature,plan,bind,render,previz,renderJob,approve,references,receipt,reviewResult,applyCamera,check,preview,run,saveBoard};
if(require.main===module)run(read(process.argv[2])).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
