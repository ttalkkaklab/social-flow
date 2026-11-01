import {runInNewContext} from 'node:vm';
import {Vector3} from 'three';
import {createActors,updateActors} from '../location-actors.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {locationSchema} from '../dist/location.js';
const require=createRequire(import.meta.url);
const L=require('../../skills/storyboard/references/location-assets.js');
const C=require('../../skills/storyboard/references/location-contract.js');
const {spec,example}=require('../../skills/storyboard/references/location-example.js');
const {readScenes}=require('../../skills/autoproduce/references/cost-preview.js');
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sf-location-'));try{const files=example(dir),win=readScenes(files.board);const asset=path.join(dir,'asset');fs.mkdirSync(asset);const m=structuredClone(spec);m.assets={};for(const [k,n]of [['blend','source.blend'],['glb','preview.glb']]){fs.writeFileSync(path.join(asset,n),k);m.assets[k]={path:n,sha256:L.fileHash(path.join(asset,n))};}const manifest=path.join(asset,'location.json');fs.writeFileSync(manifest,JSON.stringify(m));const boardDir=path.dirname(files.board);L.bind(win,0,boardDir,{manifest,stateId:'day',cameraId:'wide',mustShow:['door']});fn({dir,boardDir,win,manifest,m});}finally{fs.rmSync(dir,{recursive:true,force:true});}}
function ready(f){const fingerprint=L.signature(L.context(f.win,0,f.boardDir));fs.mkdirSync(path.join(f.boardDir,'locations'));const frames={};for(const k of ['start','end']){const name='locations/'+k+'.png';fs.writeFileSync(path.join(f.boardDir,name),'fixture '+k);frames[k]={path:name,sha256:L.fileHash(path.join(f.boardDir,name))};}f.win.SCENES[0].visual.location={fingerprint,frames};L.approve(f.win,0,f.boardDir,{reviewer:'test',notes:'Synthetic fixture, not visual evidence'});}
test('example geometry has safe stable IDs and valid cameras/states',()=>assert.deepEqual(C.validate(spec),[]));
test('invalid geometry, duplicate IDs, unknown state objects and bad camera are rejected',()=>{const m=structuredClone(spec);m.objects.push(m.objects[0]);m.states.day.objects.ghost={position:[1,2,3]};m.cameras.wide.target=m.cameras.wide.position;assert.ok(C.validate(m).length>=3);});
test('old boards have no new location requirements',()=>assert.deepEqual(L.check({SCENES:[{type:'scene'}]},'/tmp',{ready:true}),[]));
test('binding resolves immutable version and refuses unknown landmarks',()=>fixture(f=>{assert.equal(L.plan(f.win,0,f.boardDir).revision,1);assert.throws(()=>L.bind(f.win,0,f.boardDir,{manifest:f.manifest,stateId:'day',cameraId:'wide',mustShow:['ghost']}),/unknown/);}));
test('generation requires renders but permits honestly unreviewed references',()=>fixture(f=>{assert.throws(()=>L.references(f.win,0,f.boardDir),/stale/);ready(f);delete f.win.SCENES[0].visual.location.approval;assert.equal(L.references(f.win,0,f.boardDir).approved,false);assert.deepEqual(L.check(f.win,f.boardDir,{ready:true}).map(x=>x.level),['warn']);}));
test('approved image args resolve actual files; camera proposal invalidates evidence',()=>fixture(f=>{ready(f);const p=L.references(f.win,0,f.boardDir);assert.equal(p.paths.length,1);assert.ok(fs.existsSync(p.paths[0]));const patch={version:1,type:'location-camera',shotId:'s0001',baseFingerprint:p.fingerprint,camera:{...p.camera,lensMm:40}};L.applyCamera(f.win,patch,f.boardDir);assert.throws(()=>L.references(f.win,0,f.boardDir),/stale/);assert.throws(()=>L.applyCamera(f.win,patch,f.boardDir),/stale/);}));
test('changed mesh, manifest or reference bytes cannot keep approval',()=>fixture(f=>{ready(f);fs.appendFileSync(path.join(f.boardDir,'locations/start.png'),'tamper');assert.throws(()=>L.references(f.win,0,f.boardDir),/bytes changed/);fs.appendFileSync(path.join(f.dir,'asset/preview.glb'),'tamper');assert.throws(()=>L.plan(f.win,0,f.boardDir),/changed location/);}));
test('state and textual camera changes invalidate reference fingerprint',()=>fixture(f=>{ready(f);f.win.SCENES[0].shot.location.stateId='night';assert.throws(()=>L.references(f.win,0,f.boardDir),/stale/);f.win.SCENES[0].shot.location.stateId='day';f.win.SCENES[0].visual.camera.framing='different';assert.throws(()=>L.references(f.win,0,f.boardDir),/stale/);}));
test('manifest asset traversal is refused',()=>fixture(f=>{f.m.assets.glb.path='../outside';fs.writeFileSync(f.manifest,JSON.stringify(f.m));assert.throws(()=>L.load(f.manifest),/escapes/);}));
test('prompt assembler attaches scoped location render; stale location cannot spend',()=>fixture(f=>{ready(f);const {assemble}=require('../../skills/storyboard/references/spatial-prompts.js');const result=assemble(f.win,0,f.boardDir);assert.ok(result.sourceImageArgs.referenced_image_paths.includes(path.join(f.boardDir,'locations/start.png')));assert.match(result.sourcePrompt,/LOCATION reference \(reference review: reviewed\)/);delete f.win.SCENES[0].visual.location.approval;const unreviewed=assemble(f.win,0,f.boardDir);assert.match(unreviewed.sourcePrompt,/reference review: not_reviewed or stale/);assert.doesNotMatch(unreviewed.sourcePrompt,/approved LOCATION/);assert.ok(result.locationBinding.frameSha256);f.win.SCENES[0].shot.location.stateId='night';assert.throws(()=>assemble(f.win,0,f.boardDir),/stale/);}));
test('preview escapes through data serialization and exposes failures instead of success',()=>fixture(f=>{ready(f);assert.equal(L.preview(f.win,f.boardDir)[0].approved,true);fs.unlinkSync(path.join(f.dir,'asset/preview.glb'));assert.ok(L.preview(f.win,f.boardDir)[0].error);}));
test('replacing image and its hash cannot inherit an old visual approval',()=>fixture(f=>{ready(f);const frame=f.win.SCENES[0].visual.location.frames.start;fs.writeFileSync(path.join(f.boardDir,frame.path),'different render');frame.sha256=L.fileHash(path.join(f.boardDir,frame.path));assert.equal(L.references(f.win,0,f.boardDir).approved,false);assert.ok(L.check(f.win,f.boardDir,{ready:true}).some(x=>x.level==='warn'&&/review missing or stale/.test(x.what)));}));
test('prototype keys and null transforms cannot pass the location contract',()=>{const m=structuredClone(spec);m.states.day.objects.door={position:null};assert.ok(C.validate(m).length);const b={id:m.id,revision:1,manifestSha256:'a'.repeat(64),stateId:'constructor',cameraId:'constructor',mustShow:[]};assert.equal(C.bindingErrors(b,m).length,2);});
test('state proposal invalidates references and an unknown state cannot be applied',()=>fixture(f=>{ready(f);const p=L.plan(f.win,0,f.boardDir);assert.throws(()=>L.applyCamera(f.win,{version:1,type:'location-state',shotId:'s0001',baseFingerprint:p.fingerprint,stateId:'constructor'},f.boardDir),/unknown/);L.applyCamera(f.win,{version:1,type:'location-state',shotId:'s0001',baseFingerprint:p.fingerprint,stateId:'night'},f.boardDir);assert.throws(()=>L.references(f.win,0,f.boardDir),/stale/);}));
test('hidden required landmark and incompatible aspect are rejected',()=>fixture(f=>{assert.throws(()=>L.bind(f.win,0,f.boardDir,{manifest:f.manifest,stateId:'open',cameraId:'wide',mustShow:['door']}),/hidden/);f.win.SCENES[0].shot.location.camera={...f.m.cameras.wide,width:640,height:960};assert.throws(()=>L.plan(f.win,0,f.boardDir),/aspect/);}));
test('states cannot move fixed architecture',()=>{const m=structuredClone(spec);m.states.day.objects['west-wall']={position:[0,0,0]};assert.ok(C.validate(m).some(x=>x.includes('fixed architecture')));});
test('receipt records real input/output hashes and rejects changed output',()=>fixture(f=>{ready(f);const out=path.join(f.boardDir,'generated.png');fs.writeFileSync(out,'generated');assert.throws(()=>L.receipt(f.win,0,f.boardDir,{provider:'host',callId:'synthetic',referencePaths:[],output:out}),/actual sent/);const refs=L.references(f.win,0,f.boardDir);L.receipt(f.win,0,f.boardDir,{provider:'host',callId:'synthetic',referencePaths:refs.paths,output:out});fs.appendFileSync(out,'changed');assert.throws(()=>L.references(f.win,0,f.boardDir),/output is stale/);}));

test('ready checks report missing, stale and nonpass result reviews without blocking valid assets',()=>fixture(f=>{
  ready(f);
  const out=path.join(f.boardDir,'generated.png');fs.writeFileSync(out,'generated');
  const refs=L.references(f.win,0,f.boardDir);
  L.receipt(f.win,0,f.boardDir,{provider:'host',callId:'synthetic',referencePaths:refs.paths,output:out});
  f.win.SCENES[0].visual.bg='generated.png';
  const warnings=()=>{const result=L.check(f.win,f.boardDir,{ready:true});assert.equal(result.filter(x=>x.level==='bad').length,0);return result.filter(x=>x.level==='warn');};
  assert.match(warnings()[0].what,/review missing or stale/);
  for(const verdict of ['warning','fail']){
    L.reviewResult(f.win,0,f.boardDir,{verdict,reviewer:'test',notes:'Synthetic review fixture'});
    assert.match(warnings()[0].what,new RegExp('review: '+verdict));
    assert.equal(L.references(f.win,0,f.boardDir).resultReview.verdict,verdict);
  }
  L.reviewResult(f.win,0,f.boardDir,{verdict:'pass',reviewer:'test',notes:'Synthetic review fixture'});
  assert.deepEqual(warnings(),[]);
  f.win.SCENES[0].visual.location.receipt.review.outputSha256='stale';
  assert.match(warnings()[0].what,/review missing or stale/);
  fs.appendFileSync(out,'changed');
  assert.ok(L.check(f.win,f.boardDir,{ready:true}).some(x=>x.level==='bad'&&/output is stale/.test(x.what)));
}));
test('missing generation receipt remains an execution error even without review requirements',()=>fixture(f=>{
  ready(f);delete f.win.SCENES[0].visual.location.approval;
  f.win.SCENES[0].visual.bg='untracked.png';
  assert.ok(L.check(f.win,f.boardDir,{ready:true}).some(x=>x.level==='bad'&&/needs a receipt/.test(x.what)));
}));

test('end frame uses valid opening receipt without review and rejects changed source bytes',()=>fixture(f=>{
  ready(f);delete f.win.SCENES[0].visual.location.approval;
  const {assemble}=require('../../skills/storyboard/references/spatial-prompts.js');
  assert.equal(assemble(f.win,0,f.boardDir).endFrameReady,false);
  const out=path.join(f.boardDir,'generated.png');fs.writeFileSync(out,'generated');
  L.receipt(f.win,0,f.boardDir,{provider:'host',callId:'synthetic',referencePaths:L.references(f.win,0,f.boardDir).paths,output:out});
  f.win.SCENES[0].visual.bg='generated.png';
  for(const verdict of [null,'warning','fail']){
    if(verdict)L.reviewResult(f.win,0,f.boardDir,{verdict,reviewer:'test',notes:'Synthetic fixture'});
    const result=assemble(f.win,0,f.boardDir);
    assert.equal(result.endFrameReady,true);
    assert.deepEqual(result.endFrameImageArgs.referenced_image_paths,[out,path.join(f.boardDir,'locations/end.png')]);
  }
  f.win.SCENES[0].visual.bg='different.png';
  assert.equal(assemble(f.win,0,f.boardDir).endFrameReady,false);
  f.win.SCENES[0].visual.bg='generated.png';fs.appendFileSync(out,'changed');
  assert.throws(()=>assemble(f.win,0,f.boardDir),/output is stale/);
}));

function blocking(){return {axis:['A','B'],actors:[
  {id:'A',height:1.7,color:'#d0342c',start:{position:[-1,0,0],rotationZDeg:90,gazeTarget:'B'},end:{position:[-.5,0,0],rotationZDeg:90,gazeTarget:'B',holds:['toolbox']}},
  {id:'B',height:1.7,color:'#346cbe',start:{position:[1,0,0],rotationZDeg:-90,gazeTarget:'A'}}
]};}
test('MCP location schema accepts shared blocking/previz and refuses malformed endpoint poses',()=>{
  assert.ok(locationSchema.safeParse({action:'bind',blocking:blocking(),endStateId:'open',continuityGroup:'conversation'}).success);
  assert.ok(locationSchema.safeParse({action:'previz',seconds:2,fps:24}).success);
  const b=blocking();b.actors[0].end.position=[0,1];
  assert.equal(locationSchema.safeParse({action:'bind',blocking:b}).success,false);
  assert.equal(locationSchema.safeParse({action:'previz',seconds:Infinity}).success,false);
});
function pair(f){
  const b=blocking();f.win.SCENES[0].shot.location.blocking=b;
  f.win.SCENES[0].shot.location.continuityGroup='conversation';
  f.win.SCENES[1].shot.location=structuredClone(f.win.SCENES[0].shot.location);
  for(const a of f.win.SCENES[1].shot.location.blocking.actors){a.start=a.end||a.start;delete a.end;}
  return [L.context(f.win,0,f.boardDir),L.context(f.win,1,f.boardDir)];
}
test('blocking validates actor identity, floor poses, gaze targets and held object IDs',()=>{
  assert.deepEqual(C.blockingErrors(blocking(),spec),[]);
  for(const mutate of [b=>b.actors.push(b.actors[0]),b=>b.actors[0].start.position=[NaN,0,0],b=>b.actors[0].height=0,b=>b.actors[0].start.gazeTarget='missing',b=>b.actors[0].start.gazeTarget='A',b=>b.actors[0].start.holds=['missing'],b=>b.axis=['A','A'],b=>b.actors[0].id='door']){
    const b=blocking();mutate(b);assert.ok(C.blockingErrors(b,spec).length);
  }
});
test('end states are complete and omitted endpoints hold the actor start pose',()=>{
  const b=blocking();assert.equal(C.actorsAt(b,'end')[0].position[0],-.5);
  assert.deepEqual(C.actorsAt(b,'end')[1],C.actorsAt(b,'start')[1]);
  b.actors[0].end={rotationZDeg:0};assert.ok(C.blockingErrors(b,spec).some(x=>/end needs/.test(x)));
});
test('reverse camera changes preserve world blocking and endpoint state without a direction false positive',()=>fixture(f=>{
  const [a,b]=pair(f);b.camera={...a.camera,position:[2,-4,2]};
  b.b.blocking.actors[0].start.rotationZDeg+=360;
  assert.deepEqual(C.continuityIssues(a,b),[]);
}));
test('cross-cut diagnostics identify teleports, facing flips, gaze and prop custody changes',()=>fixture(f=>{
  const [a,b]=pair(f),actor=b.b.blocking.actors[0];
  actor.start.position=[2,0,0];actor.start.rotationZDeg=-90;delete actor.start.gazeTarget;actor.start.holds=[];
  const issues=C.continuityIssues(a,b).join('\n');
  for(const pattern of [/position jumps/,/body direction jumps/,/gaze target changes/,/held objects change/])assert.match(issues,pattern);
  assert.ok(L.check(f.win,f.boardDir).filter(x=>/jumps|target changes|held objects/.test(x.what)).every(x=>x.level==='warn'));
}));
test('shared action-axis crossings warn and accept planned bridges or story time skips',()=>fixture(f=>{
  const [a,b]=pair(f);b.camera={...a.camera,position:[0,4,2]};
  assert.match(C.continuityIssues(a,b).join(),/crosses.*axis/);
  b.s.shot.lineCrossing={method:'neutral',reason:'A front-on bridge resets direction'};
  assert.deepEqual(C.continuityIssues(a,b),[]);
  delete b.s.shot.lineCrossing;b.b.continuityBreak='The next morning';
  assert.deepEqual(C.continuityIssues(a,b),[]);
}));
test('location endpoint state feeds the next shot instead of resetting the door',()=>fixture(f=>{
  const [a,b]=pair(f);a.b.endStateId='open';
  assert.match(C.continuityIssues(a,b).join(),/door: set object state jumps/);
  b.b.stateId='open';assert.deepEqual(C.continuityIssues(a,b),[]);
}));
test('changing actor facing or gaze invalidates rendered references before image generation',()=>fixture(f=>{
  f.win.SCENES[0].shot.location.blocking=blocking();ready(f);
  assert.match(L.references(f.win,0,f.boardDir).prompt,/Proxy #d0342c is A/);
  f.win.SCENES[0].shot.location.blocking.actors[0].start.gazeTarget='door';
  assert.throws(()=>L.references(f.win,0,f.boardDir),/stale/);
}));
test('endpoint prompts describe the closing gaze and inventory without copying the opening state',()=>fixture(f=>{
  const b=blocking();b.actors[0].start.gazeTarget='door';b.actors[0].end.gazeTarget='B';
  Object.assign(f.win.SCENES[0].shot.location,{blocking:b,endStateId:'open'});ready(f);
  const {assemble}=require('../../skills/storyboard/references/spatial-prompts.js');
  const result=assemble(f.win,0,f.boardDir);
  assert.match(result.sourcePrompt,/eyes look at door/);
  assert.match(result.endFramePrompt,/eyes look at B/);
  assert.doesNotMatch(result.endFramePrompt,/eyes look at door/);
  assert.match(result.endFramePrompt,/holds toolbox/);
  assert.doesNotMatch(result.endFramePrompt,/Visible set inventory:[^.]*Ochre door/);
}));
test('location composition precedes standalone previz and reports the missing shared binding',()=>fixture(f=>{
  ready(f);f.win.SCENES[0].visual.video={engine:'host',previz:{firstFrame:'legacy.png'}};
  f.win.SCENES[0].shot.videoDesign.motion={kind:'spatial_reveal',subject:'workshop',visibleChange:'The doorway becomes visible',reason:'The shot reveals the workshop entrance'};
  const {assemble}=require('../../skills/storyboard/references/spatial-prompts.js');
  const result=assemble(f.win,0,f.boardDir);
  assert.equal(result.sourceImageArgs.referenced_image_paths[0],path.join(f.boardDir,'locations/start.png'));
  assert.match(result.sourcePrompt,/first attached image is the shared 3D location/);
  assert.doesNotMatch(result.sourcePrompt,/first attached image is frame 1/);
  assert.equal(result.spatialWarnings.length,1);
}));
test('stale or modified shared previz cannot enter source generation',()=>fixture(f=>{
  ready(f);const first=f.win.SCENES[0];fs.writeFileSync(path.join(f.boardDir,'clip.mp4'),'synthetic clip');
  first.visual.video={previz:{firstFrame:'locations/start.png',clip:'clip.mp4',sha256:L.fileHash(path.join(f.boardDir,'clip.mp4')),locationBinding:{fingerprint:first.visual.location.fingerprint,frameSha256:first.visual.location.frames.start.sha256}}};
  assert.ok(L.references(f.win,0,f.boardDir));
  fs.appendFileSync(path.join(f.boardDir,'clip.mp4'),'tampered');assert.throws(()=>L.references(f.win,0,f.boardDir),/previz bytes/);
  first.visual.video.previz.locationBinding.fingerprint='stale';assert.throws(()=>L.references(f.win,0,f.boardDir),/previz is stale/);
  assert.doesNotThrow(()=>L.plan(f.win,0,f.boardDir));
  assert.ok(L.check(f.win,f.boardDir).some(x=>x.level==='warn'&&/previz is stale/.test(x.what)));
  assert.ok(!L.check(f.win,f.boardDir).some(x=>x.level==='bad'));
  const p=L.plan(f.win,0,f.boardDir);
  assert.doesNotThrow(()=>L.applyCamera(f.win,{version:1,type:'location-camera',shotId:'s0001',baseFingerprint:p.fingerprint,camera:{...p.camera,lensMm:40}},f.boardDir));
}));
test('previz timing and saved renderer are checked before launching Blender',()=>fixture(f=>{
  f.win.SCENES[0].visual.video={engine:'host'};
  assert.throws(()=>L.previz(f.win,0,f.boardDir,{seconds:Infinity}),/finite/);
  assert.throws(()=>L.previz(f.win,0,f.boardDir,{seconds:2.5}),/whole/);
  f.win.PRODUCTION.previz={renderer:'threejs'};
  assert.throws(()=>L.previz(f.win,0,f.boardDir,{seconds:2}),/renders with Blender; with a three\.js renderer/);
}));

const blenderBin=process.env.BLENDER||'/Applications/Blender.app/Contents/MacOS/Blender';
test('real Blender renders one shared set, moving actors, gaze and matching previz endpoints',
  {skip:!fs.existsSync(blenderBin),timeout:120000},()=>{
    const kept=process.env.SOCIAL_FLOW_LOCATION_TEST_OUTPUT;
    if(kept)fs.mkdirSync(kept,{recursive:true});
    const dir=fs.mkdtempSync(kept?path.join(kept,'run-'):path.join(os.tmpdir(),'sf-location-render-'));
    try{
      const m=structuredClone(spec);
      m.objects=m.objects.filter(o=>['floor','door','door-handle','desk-top','toolbox'].includes(o.id));
      m.objects.push({id:'gaze-wall',label:'Gaze occluder',kind:'box',position:[0,0,1],size:[.1,.5,2],color:'#aaaaaa'});
      m.states.open.objects['gaze-wall']={visible:false};
      m.states.day.objects.toolbox={position:[-4,1.15,1.12]};
      m.states.open.objects.toolbox={position:[4,1.15,1.12]};
      m.cameras={wide:{position:[3,-5,3],target:[0,.5,.9],lensMm:35,width:480,height:270,end:{position:[2.5,-4.5,2.8],target:[.2,.5,.9]}}};
      const built=L.build({spec:m,root:path.join(dir,'sets')}),boardDir=path.join(dir,'storyboard');fs.mkdirSync(boardDir);
      const win={FORMAT:'youtube-long-16x9',PRODUCTION:{previz:{renderer:'blender'}},SCENES:[{id:'s0001',visual:{video:{engine:'host'},camera:{movement:'dolly in'}}}]};
      const actors=blocking();actors.actors[0].end.holds=[];
      actors.actors[1].start.gazeTarget='toolbox';
      L.bind(win,0,boardDir,{manifest:built.manifest,stateId:'day',endStateId:'open',cameraId:'wide',blocking:actors,continuityGroup:'conversation'});
      const sourceHash=L.fileHash(path.join(path.dirname(built.manifest),'source.blend'));
      const stills=L.render(win,0,boardDir);
      for(const f of Object.values(stills.frames))assert.ok(fs.statSync(path.join(boardDir,f.path)).size>1000);
      const spatial=L.references(win,0,boardDir);
      assert.equal(spatial.spatialPaths.length,6);
      assert.equal(spatial.spatial.fingerprint,stills.fingerprint);
      assert.equal(spatial.spatial.views.start.actors.length,2);
      assert.equal(spatial.spatial.views.start.actors[0].cameraSamples.length,5);
      assert.equal(spatial.spatial.views.end.stateId,'open');
      assert.equal(spatial.spatial.views.start.actors[0].gaze.target,'B');
      assert.equal(spatial.spatial.views.start.actors[0].gaze.blockedBy,'gaze-wall');
      assert.equal(spatial.spatial.views.end.actors[0].gaze.blockedBy,null);
      assert.ok(spatial.spatial.views.start.actorDistances[0].floorOriginDistanceMetres>0);
      const record=L.previz(win,0,boardDir,{seconds:2,fps:24});
      assert.deepEqual(L.references(win,0,boardDir).spatial,spatial.spatial);
      assert.equal(record.firstFrame,win.SCENES[0].visual.location.frames.start.path);
      assert.equal(record.locationBinding.fingerprint,win.SCENES[0].visual.location.fingerprint);
      assert.equal(L.fileHash(path.join(path.dirname(built.manifest),'source.blend')),sourceHash);
      assert.equal(L.references(win,0,boardDir).paths[0],path.join(boardDir,record.firstFrame));
      const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',path.join(boardDir,record.clip)],{encoding:'utf8'}));
      assert.equal(probe.streams.length,1);assert.equal(probe.streams[0].codec_name,'h264');
      assert.equal(Number(probe.streams[0].nb_read_frames),48);assert.equal(Number(probe.streams[0].duration),2);
      assert.equal(probe.streams[0].width,480);assert.equal(probe.streams[0].height,270);
      const py="import bpy,json; from mathutils import Vector; rows=[]\nfor f in [1,13,48]:\n bpy.context.scene.frame_set(f); a=bpy.data.objects['actor-A']; h=bpy.data.objects['head-A']; b=bpy.data.objects['head-B']; prop=bpy.data.objects['toolbox']; direction=(b.matrix_world.translation-h.matrix_world.translation).normalized(); forward=h.matrix_world.to_quaternion()@Vector((0,-1,0)); prop_direction=(prop.matrix_world.translation-b.matrix_world.translation).normalized(); prop_forward=b.matrix_world.to_quaternion()@Vector((0,-1,0)); rows.append({'position':list(a.location),'yaw':a.rotation_euler.z,'gaze':forward.dot(direction),'propGaze':prop_forward.dot(prop_direction),'propX':prop.location.x,'door':bpy.data.objects['door'].hide_render})\nprint('SPATIAL_RESULT:'+json.dumps(rows))";
      const result=execFileSync(blenderBin,['--background',path.join(boardDir,record.blend),'--python-expr',py],{encoding:'utf8',timeout:30000});
      const rows=JSON.parse(result.match(/SPATIAL_RESULT:(.+)/)[1]);
      assert.equal(rows[0].position[0],-1);assert.equal(rows[2].position[0],-.5);
      assert.ok(rows.every(row=>row.gaze>.99));assert.ok(rows.every(row=>row.propGaze>.9999));
      assert.ok(Math.abs(rows[1].propX-(-4+8*12/47))<1e-5);
      assert.equal(rows[0].door,false);assert.equal(rows[2].door,true);
      L.saveBoard(path.join(boardDir,'scenes.js'),win);
      if(kept)console.log('Spatial render evidence: '+boardDir);
    }finally{if(!kept)fs.rmSync(dir,{recursive:true,force:true});}
  });

test('spatial evidence rejects changed bytes and stale fingerprints',()=>fixture(f=>{
  ready(f);const location=f.win.SCENES[0].visual.location,p=path.join(f.boardDir,'locations/spatial.json');
  fs.writeFileSync(p,JSON.stringify({version:1,fingerprint:location.fingerprint,views:{}}));
  location.spatial={path:'locations/spatial.json',sha256:L.fileHash(p)};
  assert.equal(L.references(f.win,0,f.boardDir).spatial.version,1);
  fs.appendFileSync(p,' ');assert.throws(()=>L.references(f.win,0,f.boardDir),/spatial bytes/);
  fs.writeFileSync(p,JSON.stringify({fingerprint:'old'}));location.spatial.sha256=L.fileHash(p);
  assert.throws(()=>L.references(f.win,0,f.boardDir),/spatial report is stale/);
}));

test('web proxies share endpoint origins, height, gaze and Blender linear yaw',()=>{
  const start=[{id:'A',height:2,color:'#ff0000',position:[1,2,0],rotationZDeg:350,gazeTarget:'B'},{id:'B',height:1.5,color:'#0000ff',position:[-2,0,0],rotationZDeg:0}];
  const end=[{...start[0],position:[2,3,0],rotationZDeg:10},start[1]],model=createActors(start);
  updateActors(model,start,end,.5,[]);
  const a=model.actors.get('A'),b=model.actors.get('B');
  assert.deepEqual(a.root.position.toArray(),[1.5,2.5,0]);assert.ok(Math.abs(a.root.rotation.z-Math.PI)<1e-8);
  assert.equal(a.head.getWorldPosition(new Vector3()).z,1.82);
  const direction=b.head.getWorldPosition(new Vector3()).sub(a.head.getWorldPosition(new Vector3())).normalize();
  const facing=new Vector3(0,-1,0).applyQuaternion(a.head.getWorldQuaternion(a.head.quaternion.clone()));
  assert.ok(facing.dot(direction)>.999999);
  updateActors(model,start,end,1,[],false);
  assert.deepEqual(a.root.position.toArray(),end[0].position);assert.equal(a.gaze.visible,false);
  updateActors(model,start.map(x=>({...x,gazeTarget:'prop'})),end,0,[{id:'prop',position:[0,0,3]}]);
  assert.ok(a.gaze.visible);assert.ok(Number.isFinite(a.head.quaternion.w));
});

test('timeline endpoint state matches exports and intermediate states cannot be exported',()=>{
  const source=fs.readFileSync(new URL('../location-review-runtime.mjs',import.meta.url),'utf8');
  const handler=source.split('\n').find(line=>line.trim().startsWith('time.oninput='));
  const ctx={time:{value:'0'},e:{stateId:'day',endStateId:'open'},stateSelect:{},phase:{},stateExport:{},lens:{},info:{},
    original:{lensMm:35,position:[0,0,2],target:[0,1,1]},
    applyState:()=>{},refreshActors:()=>{},setCamera:()=>{},size:()=>{},word:(ko,en)=>en};
  runInNewContext(handler,ctx);
  for(const [value,phase,state,disabled] of [[100,'end','open',false],[50,'between','day',true],[0,'start','day',false]]){
    ctx.time.value=String(value);ctx.time.oninput();
    assert.equal(ctx.phase.value,phase);assert.equal(ctx.stateSelect.value,state);
    assert.equal(ctx.selectedState,state);assert.equal(ctx.stateExport.disabled,disabled);
  }
});

test('storyboard mounts captures by stable shot id and withholds stale frames',()=>{
  const source=fs.readFileSync(new URL('../location-review-runtime.mjs',import.meta.url),'utf8');
  const roots={'shot-1':{children:[]},'shot-2':{children:[]}};
  const node=(tag,text,parent,cls)=>{const el={tag,text,cls,children:[],setAttribute(){},addEventListener(){},scrollLeft:0,clientWidth:300,scrollWidth:600,scrollBy(options){this.scrollLeft+=options.left;}};parent?.children.push(el);return el;};
  const ctx={node,button:(text,parent,fn)=>{const b=node('button',text,parent);b.onclick=fn;return b;},ResizeObserver:class {observe(){}},word:(ko,en)=>en,url:p=>p,document:{getElementById:id=>roots[id],addEventListener(){}},
    window:{matchMedia:()=>({matches:true}),SCENES:[{id:'s0002'},{id:'s0001',visual:{character:'actor'}}],SB_DOC:{characters:[{id:'actor',name:'Actor',panels:{face:'face.png'}}]},LOCATION_DETAIL_LINKS:{room:'room.html'}},
    entries:[{shotId:'s0001',id:'room',name:'Room',revision:1,state:{label:'Day'},fresh:true,frames:{start:{path:'one.png'},end:{path:'two.png'},'start-top':{path:'top.png'}}},
      {shotId:'s0002',id:'room',name:'Room',revision:1,state:{label:'Day'},fresh:false,frames:{start:{path:'stale.png'}}}]};
  runInNewContext(source.slice(source.indexOf('function mountShotFrames(){'),source.indexOf('function view('))+'\nmountShotFrames();',ctx);
  const flatten=n=>[n,...n.children.flatMap(flatten)];
  assert.deepEqual(flatten(roots['shot-2']).filter(n=>n.tag==='img').map(n=>n.src),['one.png','two.png','face.png']);
  assert.equal(flatten(roots['shot-1']).filter(n=>n.tag==='img').length,0);
  assert.ok(flatten(roots['shot-2']).some(n=>n.tag==='a'&&n.href==='room.html'));
  assert.ok(flatten(roots['shot-2']).some(n=>n.cls==='shot-background__end'&&n.tag==='details'));
  assert.equal(flatten(roots['shot-2']).filter(n=>n.className==='shot-character__portrait').length,1);
  assert.ok(flatten(roots['shot-2']).some(n=>n.cls==='shot-character__info'));

});

test('sheet view opens a built set without a shot and reports a broken manifest instead of throwing',()=>fixture(f=>{
  const view=L.sheetView(f.manifest);
  assert.equal(view.sheet,true);assert.equal(view.shotId,'sheet-'+f.m.id);assert.equal(view.stateId,Object.keys(f.m.states)[0]);
  assert.deepEqual(view.camera,{...f.m.cameras[Object.keys(f.m.cameras)[0]],end:undefined});
  assert.equal(view.glb,path.join(f.dir,'asset/preview.glb'));assert.equal(view.blocking,null);assert.deepEqual(view.frames,{});
  fs.appendFileSync(path.join(f.dir,'asset/preview.glb'),'tamper');
  const broken=L.sheetView(f.manifest);assert.equal(broken.sheet,true);assert.match(broken.error,/changed location glb/);
}));

test('sheet view lists the angle sheet rendered from this manifest and skips one from another revision',()=>fixture(f=>{
  const angles=path.join(f.dir,'asset/angles');
  for(const [state,sha] of [['day',L.fileHash(f.manifest)],['night','0'.repeat(64)]]){fs.mkdirSync(path.join(angles,state),{recursive:true});fs.writeFileSync(path.join(angles,state,'sheet.json'),JSON.stringify({manifestSha256:sha,stateId:state,frames:{'orbit-n':{path:'orbit-n.png',sha256:'x'}}}));}
  assert.deepEqual(L.sheetView(f.manifest).frames,{['orbit-n · '+f.m.states.day.label]:{path:path.join(angles,'day/orbit-n.png'),sha256:'x',camera:'orbit-n',stateId:'day'}});
}));

test('angle cameras frame the standing objects, not the flat floor, from eight sides and above',()=>{
  const m={cameras:{a:{width:640,height:360}},objects:[{position:[0,0,-.1],size:[40,40,.2]},{position:[1,1,1],size:[2,2,2]}]};
  const c=L.angleCameras(m);
  assert.deepEqual(Object.keys(c),['orbit-n','orbit-ne','orbit-e','orbit-se','orbit-s','orbit-sw','orbit-w','orbit-nw','top']);
  assert.deepEqual(c.top.target,[1,1,1]);assert.ok(c['orbit-n'].position[1]>1&&c['orbit-s'].position[1]<1);
  assert.ok(Math.hypot(...c['orbit-n'].position.map((v,i)=>v-1))<10);assert.equal(c.top.width,640);
});

test('walk step moves eye and look target together on the floor plane',()=>{
  const source=fs.readFileSync(new URL('../location-review-runtime.mjs',import.meta.url),'utf8');
  const line=source.split('\n').find(l=>l.trim().startsWith('function step(forward,right)'));
  const ctx={THREE:{Vector3},eye:new Vector3(2,3,1.6),cam:{position:new Vector3(2,3,1.6)},orbit:{target:new Vector3(2,3.5,1.6)}};
  runInNewContext(line+'\nstep(1,0);',ctx);
  assert.deepEqual(ctx.eye.toArray(),[2,4,1.6]);assert.deepEqual(ctx.cam.position.toArray(),[2,4,1.6]);assert.deepEqual(ctx.orbit.target.toArray(),[2,4.5,1.6]);
  runInNewContext('step(0,1);',ctx); // right of a +Y facing is +X; height never changes
  assert.deepEqual(ctx.eye.toArray(),[3,4,1.6]);assert.deepEqual(ctx.orbit.target.toArray(),[3,4.5,1.6]);
});

// Where a world point lands in a shotCamera frame: [-1, 1] on both axes is inside, +y is up.
function project(camera,point){
  const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=v=>v.map(x=>x/Math.hypot(...v)),forward=norm(sub(camera.target,camera.position)),right=norm(cross(forward,[0,0,1])),up=cross(right,forward),v=sub(point,camera.position);
  const tanH=18/camera.lensMm,tanV=tanH*camera.height/camera.width;
  return [dot(v,right)/dot(v,forward)/tanH,dot(v,up)/dot(v,forward)/tanV];
}
const mina=(extra={})=>({id:'mina',height:1.7,color:'#d0342c',position:[0,0,0],rotationZDeg:0,...extra});
const frameOf=(size,angle='eye',actors=[mina()],cast=['mina'],width=960,height=540)=>L.shotCamera(spec,{stateId:'day',actors,cast,size,angle,width,height});
test('shot sizes frame the blocked person by their crop lines',()=>{
  const at=(size,z)=>project(frameOf(size).camera,[0,0,z])[1];
  const fs_=frameOf('fs').camera,ms=frameOf('ms').camera,cu=frameOf('cu').camera;
  assert.ok(at('fs',1.7)<1&&at('fs',1.7)>.7&&at('fs',0)>-1&&at('fs',0)<-.7,'full shot: crown and feet both in, near the edges');
  assert.ok(at('ms',1.7)<1&&at('ms',.95)>-1.05&&at('ms',.95)<-.8&&at('ms',.4)<-1,'medium shot: waist at the bottom edge, knees out');
  assert.ok(at('cu',1.58)<1&&at('cu',1.58)>-1&&at('cu',1.2)<-1,'close-up: eyes in, chest out');
  assert.ok(at('ecu',1.58)>-1&&at('ecu',1.58)<1&&at('ecu',1.45)<-1,'extreme close-up: the eyes alone');
  assert.ok(fs_.lensMm<ms.lensMm&&ms.lensMm<cu.lensMm);
  // The camera stands in front of her: zero rotation faces -Y, +90 faces +X.
  assert.ok(fs_.position[1]<-1);
  assert.ok(frameOf('ms','eye',[mina({rotationZDeg:90})]).camera.position[0]>1);
  assert.ok(frameOf('back').camera.position[1]>1,'back: from behind');
  // A vertical frame keeps the crop lines.
  const tall=frameOf('fs','eye',[mina()],['mina'],540,960).camera;
  assert.ok(project(tall,[0,0,1.7])[1]<1&&project(tall,[0,0,0])[1]>-1);
});
test('angles set the camera height and pitch; dutch says the render stays level',()=>{
  const eye=frameOf('ms').camera,high=frameOf('ms','high').camera,low=frameOf('ms','low').camera,ground=frameOf('ms','ground').camera,top=frameOf('ms','overhead').camera;
  assert.ok(Math.abs(eye.position[2]-1.581)<.01);
  assert.ok(high.position[2]>eye.position[2]+.5&&high.target[2]<high.position[2]);
  assert.ok(low.position[2]<low.target[2]);
  assert.equal(ground.position[2],.15);
  assert.ok(Math.hypot(top.position[0]-top.target[0],top.position[1]-top.target[1])<.01&&top.position[2]>top.target[2]+.5);
  for(const camera of [high,low,ground])assert.ok(Math.abs(project(camera,[0,0,1.6])[1])<1,'the face stays in frame');
  assert.ok(frameOf('ms','dutch').warnings.some(w=>/no camera roll/.test(w)));
});
test('two people keep the reference camera side; over the shoulder and pov stand at the named person',()=>{
  const a=mina({position:[-1,0,0],rotationZDeg:90,gazeTarget:'jun'}),b={id:'jun',height:1.8,color:'#346cbe',position:[1,0,0],rotationZDeg:-90,gazeTarget:'mina'};
  // Facing each other along X: square to their line on the side the wide camera (y -5.8) stands.
  const two=frameOf('mfs','eye',[a,b],['mina','jun']).camera;
  assert.ok(two.position[1]<0&&Math.abs(two.position[0])<.01);
  for(const p of [[-1,0,1.6],[1,0,1.7]])assert.ok(Math.abs(project(two,p)[0])<1,'both in frame');
  const ots=frameOf('ots','over',[a,b],['mina','jun']).camera;
  assert.ok(ots.position[0]>1.3&&Math.abs(project(ots,[-1,0,1.58])[0])<.5,'behind jun, onto mina');
  // A single of mina while jun stands in front of her: the camera swings round her until he is out of the line to her face.
  const single=frameOf('fs','eye',[a,b],['mina']);
  assert.ok(single.warnings.some(w=>/turned \d+° round the subject so jun/.test(w)));
  const p=single.camera.position,t=Math.max(0,Math.min(1,((1-p[0])*(-1-p[0])+(0-p[1])*(0-p[1]))/((-1-p[0])**2+p[1]**2)));
  assert.ok(Math.hypot(p[0]+(-1-p[0])*t-1,p[1]-p[1]*t)>.3,'jun is off the line to her face');
  const pov=frameOf('pov','eye',[a,b],['jun']).camera;
  assert.ok(Math.abs(pov.position[0]+1)<.35&&Math.abs(pov.position[2]-1.58)<.05&&pov.target[0]===1,'from mina\'s eyes onto jun');
});
test('nobody blocked frames the set from the first camera\'s side and says the prompt places the cast',()=>{
  const {camera,warnings}=frameOf('ls','eye',[],['mina']);
  assert.ok(warnings.some(w=>/mina is not blocked/.test(w)));
  assert.ok(camera.position[1]<camera.target[1],'on the wide camera\'s side');
  assert.ok(camera.position[1]<-2.5,'the open south side lets the camera stand back');
  // A wall behind the camera's place brings it in short of the wall and widens the lens to keep the framing.
  const walled=frameOf('fs','eye',[mina({position:[-1,-1.5,0],rotationZDeg:-90})]);
  assert.ok(walled.camera.position[0]>-2.92&&walled.camera.lensMm<28&&walled.warnings.some(w=>/walls hold the camera/.test(w)));
  assert.ok(Math.abs(walled.camera.position[2]-1.581)<.01,'at the same eye height');
  assert.ok(project(walled.camera,[-1,-1.5,1.7])[1]<1&&project(walled.camera,[-1,-1.5,0])[1]>-1,'still head to toe');
});
test('shotFrame renders the set once per camera and reuses the render',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sf-shot-frame-'));
  const blender=process.env.BLENDER;
  try{
    // A stand-in Blender writes one PNG per camera and counts its runs.
    const fake=path.join(dir,'blender');
    fs.writeFileSync(fake,`#!/usr/bin/env node\nconst fs=require('fs'),path=require('path');const job=JSON.parse(fs.readFileSync(process.argv.at(-1),'utf8'));\nfs.appendFileSync(${JSON.stringify(path.join(dir,'runs'))},'x');for(const k of Object.keys(job.cameras))fs.writeFileSync(path.join(job.output,k+'.png'),JSON.stringify(job.cameras[k]));\n`,{mode:0o755});
    process.env.BLENDER=fake;
    const asset=path.join(dir,'set');fs.mkdirSync(asset);const m=structuredClone(spec);m.assets={};
    for(const [k,n] of [['blend','source.blend'],['glb','preview.glb']]){fs.writeFileSync(path.join(asset,n),k);m.assets[k]={path:n,sha256:L.fileHash(path.join(asset,n))};}
    fs.writeFileSync(path.join(asset,'location.json'),JSON.stringify(m));
    const board=path.join(dir,'storyboard');fs.mkdirSync(board);
    const win={FORMAT:'youtube-long-16x9',SCENES:[{id:'s0001',shot:{size:'cu'}}]};
    const ask=()=>L.shotFrame(win,0,board,{manifest:'../set/location.json',cast:['mina'],size:'cu',angle:'eye',width:1536,height:1024});
    const first=ask();
    assert.match(first.start.path,/^locations\/s0001-frame-[0-9a-f]{16}\/start\.png$/);
    assert.deepEqual([first.camera.width,first.camera.height],[1280,854]);   // the picture's 3:2, not the set camera's 16:9
    assert.ok(first.warnings.some(w=>/not blocked/.test(w))&&first.warnings.some(w=>/first state/.test(w)));
    ask();
    assert.equal(fs.readFileSync(path.join(dir,'runs'),'utf8'),'x');
    fs.writeFileSync(fake,'#!/bin/sh\nexit 3\n',{mode:0o755});
    assert.throws(()=>L.shotFrame(win,0,board,{manifest:'../set/location.json',cast:['mina'],size:'fs',angle:'eye',width:1536,height:1024}),/location_render_failed/);
  }finally{if(blender===undefined)delete process.env.BLENDER;else process.env.BLENDER=blender;fs.rmSync(dir,{recursive:true,force:true});}
});
